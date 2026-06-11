#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolveCentralRepo } from "./config.js";
import { defaultScope, listInstalled, resolveProvenance } from "./discovery.js";
import { promoteSkill } from "./promote.js";
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

function parseArgs(argv: string[]): Args {
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

async function confirm(message: string): Promise<boolean> {
  const terminal = createInterface({ input, output });
  try {
    const answer = await terminal.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

async function selectInteractively(installed: InstalledSkill[]): Promise<InstalledSkill[]> {
  console.log(installed.map((skill) => `${skill.name} (${skill.scope})`).join("\n"));
  const terminal = createInterface({ input, output });
  try {
    const answer = await terminal.question("Skills to promote (comma-separated): ");
    const names = answer.split(",").map((name) => name.trim()).filter(Boolean);
    return installed.filter((skill) => names.includes(skill.name));
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    console.log(usage());
    return;
  }
  const installed = discover(args.scope ?? defaultScope(args.command));
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
  if (!args.names.length && !args.yes && process.stdin.isTTY) {
    selected = await selectInteractively(installed);
  }
  if (!selected.length) throw new Error("No matching skills selected.");
  const duplicateNames = selected
    .filter((skill, index, values) =>
      values.findIndex((candidate) => candidate.name === skill.name) !== index
    )
    .map((skill) => skill.name);
  if (duplicateNames.length) {
    throw new Error(
      `Skills installed in both project and global scope are ambiguous: ${[...new Set(duplicateNames)].join(", ")}. Pass --scope project or --scope global.`
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
    for (const item of prepared) {
      console.log(
        `${item.skill.name} -> skills/${item.category}/${item.skill.name} from ${item.provenance.source}`
      );
    }
    if (!(await confirm("Promote these skills?"))) return;
  }

  const results = prepared.map((item) =>
    promoteSkill({
      ...item,
      repo,
      dryRun: args.dryRun,
      allowSourceChange: args.allowSourceChange
    })
  );
  if (args.json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const result of results) {
      console.log(
        `${result.action}: ${result.name} -> ${result.destination} (${result.hash.slice(0, 12)})${result.dryRun ? " [dry-run]" : ""}`
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
