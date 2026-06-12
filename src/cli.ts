#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveCentralRepo } from "./config.js";
import { defaultScope, listInstalled, resolveProvenance } from "./discovery.js";
import { promoteSkill } from "./promote.js";
import {
  confirmPromotion,
  promoteWithProgress,
  selectSkills,
  showAutoSelection,
  showCancellation,
  showPromoteIntro,
  showPromotionResults,
  startDiscoverySpinner
} from "./promote-ui.js";
import { inferCategory, validateSkill } from "./skill.js";
import {
  CATEGORIES,
  type Category,
  type InstalledSkill,
  type Scope
} from "./types.js";

interface Args {
  command?: string;
  names: string[];
  scope?: Scope | "all";
  json: boolean;
  yes: boolean;
  dryRun: boolean;
  repo?: string;
  category?: Category;
  source?: string;
  allowSourceChange: boolean;
}

function usage(): string {
  return `Usage:
  agent-skills list [--scope project|global|all] [--json]
  agent-skills promote [skills...] [--scope project|global|all] [--category <category>]
                       [--source <url>] [--repo <path>] [--dry-run] [--yes] [--json]

Categories: ${CATEGORIES.join(", ")}`;
}

export function parseArgs(argv: string[]): Args {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(usage());
    process.exit(0);
  }
  const result: Args = {
    command: argv.shift(),
    names: [],
    json: false,
    yes: false,
    dryRun: false,
    allowSourceChange: false
  };
  while (argv.length) {
    const value = argv.shift()!;
    if (!value.startsWith("-")) {
      result.names.push(value);
      continue;
    }
    if (value === "--json") result.json = true;
    else if (value === "--yes" || value === "-y") result.yes = true;
    else if (value === "--dry-run") result.dryRun = true;
    else if (value === "--allow-source-change") result.allowSourceChange = true;
    else if (value === "--scope") result.scope = argv.shift() as Args["scope"];
    else if (value === "--repo") result.repo = argv.shift();
    else if (value === "--source") result.source = argv.shift();
    else if (value === "--category") result.category = argv.shift() as Category;
    else if (value === "--help" || value === "-h") {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`Unknown option: ${value}`);
  }
  if (result.scope && !["project", "global", "all"].includes(result.scope)) {
    throw new Error(`Invalid scope: ${result.scope}`);
  }
  if (result.category && !CATEGORIES.includes(result.category)) {
    throw new Error(`Invalid category: ${result.category}`);
  }
  return result;
}

function discover(scope: Scope | "all"): InstalledSkill[] {
  return scope === "all"
    ? [...listInstalled("project"), ...listInstalled("global")]
    : listInstalled(scope);
}

export function shouldSelectInteractively(args: Args, isTTY: boolean): boolean {
  return args.command === "promote" && !args.names.length && !args.yes && isTTY;
}

export function shouldUsePromoteUI(args: Args, isTTY: boolean): boolean {
  return args.command === "promote" && !args.json && isTTY;
}

export function duplicateSkillNames(skills: InstalledSkill[]): string[] {
  return [
    ...new Set(
      skills
        .filter((skill, index, values) =>
          values.findIndex((candidate) => candidate.name === skill.name) !== index
        )
        .map((skill) => skill.name)
    )
  ];
}

export function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    console.log(usage());
    return;
  }
  const humanPromote = shouldUsePromoteUI(args, Boolean(process.stdout.isTTY));
  if (humanPromote) showPromoteIntro();
  const discoveryProgress = humanPromote ? startDiscoverySpinner() : undefined;
  const installed = discover(args.scope ?? defaultScope(args.command));
  discoveryProgress?.stop(
    `Found ${installed.length} installed skill${installed.length === 1 ? "" : "s"}`
  );
  if (args.command === "list") {
    const candidates = installed.map((skill) => {
      const suggestion = inferCategory(validateSkill(skill.path, skill.name));
      return {
        ...skill,
        suggestedCategory: suggestion.category,
        confident: suggestion.confident
      };
    });
    if (args.json) console.log(JSON.stringify(candidates, null, 2));
    else {
      for (const skill of candidates) {
        console.log(
          `${skill.name}\t${skill.scope}\t${skill.suggestedCategory ?? "uncategorized"}${skill.confident ? "" : " (review)"}\t${skill.path}`
        );
      }
    }
    return;
  }
  if (args.command !== "promote") throw new Error(`Unknown command: ${args.command}`);

  let selected = installed.filter((skill) => args.names.includes(skill.name));
  const usedInteractiveSelection = shouldSelectInteractively(args, Boolean(process.stdin.isTTY));
  if (usedInteractiveSelection) {
    if (installed.length === 1) showAutoSelection(installed[0]);
    const selection = await selectSkills(installed);
    if (selection.cancelled) {
      showCancellation();
      return;
    }
    selected = selection.skills;
  }
  if (!selected.length) {
    if (usedInteractiveSelection) {
      showCancellation();
      return;
    }
    throw new Error("No matching skills selected.");
  }
  const duplicateNames = duplicateSkillNames(selected);
  if (duplicateNames.length) {
    throw new Error(
      `Skills installed in both project and global scope are ambiguous: ${duplicateNames.join(", ")}. Pass --scope project or --scope global.`
    );
  }

  const repo = resolveCentralRepo({ repo: args.repo });
  const prepared = selected.map((skill) => {
    const inferred = inferCategory(validateSkill(skill.path, skill.name));
    const category = args.category ?? inferred.category;
    if (!category || (!args.category && !inferred.confident)) {
      throw new Error(
        `Category for "${skill.name}" requires review. Pass --category <category>.`
      );
    }
    return {
      skill,
      category,
      provenance: resolveProvenance(skill, args.source)
    };
  });

  if (!args.yes && !args.dryRun) {
    if (!(await confirmPromotion(prepared, repo))) {
      showCancellation();
      return;
    }
  }

  const runPromotion = (item: (typeof prepared)[number]) =>
    promoteSkill({
      ...item,
      repo,
      dryRun: args.dryRun,
      allowSourceChange: args.allowSourceChange
    });
  const results =
    humanPromote && !args.json
      ? promoteWithProgress(prepared, runPromotion)
      : prepared.map(runPromotion);
  if (args.json) console.log(JSON.stringify(results, null, 2));
  else if (humanPromote) showPromotionResults(results);
  else {
    for (const result of results) {
      console.log(
        `${result.action}: ${result.name} -> ${result.destination} (${result.hash.slice(0, 12)})${result.dryRun ? " [dry-run]" : ""}`
      );
    }
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
