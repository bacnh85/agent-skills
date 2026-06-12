#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
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

export interface SelectionState {
  cursor: number;
  filter: string;
  selected: Set<string>;
  accepted: boolean;
  cancelled: boolean;
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

export function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
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

function skillKey(skill: InstalledSkill): string {
  return `${skill.scope}:${skill.name}`;
}

export function createSelectionState(): SelectionState {
  return {
    cursor: 0,
    filter: "",
    selected: new Set<string>(),
    accepted: false,
    cancelled: false
  };
}

export function visibleSkills(
  installed: InstalledSkill[],
  state: SelectionState
): InstalledSkill[] {
  const query = state.filter.trim().toLowerCase();
  if (!query) return installed;
  return installed.filter(
    (skill) =>
      skill.name.toLowerCase().includes(query) ||
      skill.scope.toLowerCase().includes(query)
  );
}

export function selectedSkills(
  installed: InstalledSkill[],
  state: SelectionState
): InstalledSkill[] {
  return installed.filter((skill) => state.selected.has(skillKey(skill)));
}

function clampCursor(state: SelectionState, installed: InstalledSkill[]): SelectionState {
  const visible = visibleSkills(installed, state);
  return {
    ...state,
    cursor: Math.max(0, Math.min(state.cursor, Math.max(visible.length - 1, 0)))
  };
}

export function applySelectionInput(
  installed: InstalledSkill[],
  state: SelectionState,
  inputValue: string
): SelectionState {
  if (state.accepted || state.cancelled) return state;
  if (inputValue === "\u0003" || inputValue === "\u001b") {
    return { ...state, cancelled: true };
  }
  if (inputValue === "\r" || inputValue === "\n") {
    return { ...state, accepted: true };
  }
  if (inputValue === "\u001b[A") {
    const visible = visibleSkills(installed, state);
    if (!visible.length) return state;
    return { ...state, cursor: (state.cursor + visible.length - 1) % visible.length };
  }
  if (inputValue === "\u001b[B") {
    const visible = visibleSkills(installed, state);
    if (!visible.length) return state;
    return { ...state, cursor: (state.cursor + 1) % visible.length };
  }
  if (inputValue === " ") {
    const visible = visibleSkills(installed, state);
    const skill = visible[state.cursor];
    if (!skill) return state;
    const selected = new Set(state.selected);
    const key = skillKey(skill);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    return { ...state, selected };
  }
  if (inputValue === "\u007f" || inputValue === "\b") {
    return clampCursor({ ...state, filter: state.filter.slice(0, -1), cursor: 0 }, installed);
  }
  if (/^[\x20-\x7E]$/.test(inputValue)) {
    return clampCursor({ ...state, filter: state.filter + inputValue, cursor: 0 }, installed);
  }
  return state;
}

function renderSelector(installed: InstalledSkill[], state: SelectionState): string {
  const visible = visibleSkills(installed, state);
  const lines = [
    "Select skills to promote",
    `Filter: ${state.filter}`,
    "Use Up/Down to move, Space to toggle, Enter to accept, Esc to cancel.",
    ""
  ];
  if (!visible.length) {
    lines.push("  No matching skills");
  } else {
    for (const [index, skill] of visible.entries()) {
      const cursor = index === state.cursor ? ">" : " ";
      const checked = state.selected.has(skillKey(skill)) ? "x" : " ";
      lines.push(`${cursor} [${checked}] ${skill.name} (${skill.scope})`);
    }
  }
  lines.push("", `${state.selected.size} selected`);
  return lines.join("\n");
}

async function selectInteractively(installed: InstalledSkill[]): Promise<InstalledSkill[]> {
  if (!input.isTTY || !output.isTTY) return [];
  let state = createSelectionState();
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  output.write("\x1b[?25l");
  const redraw = () => output.write(`\x1b[2J\x1b[H${renderSelector(installed, state)}`);
  redraw();
  return await new Promise((resolve) => {
    const finish = () => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      output.write("\x1b[?25h\x1b[2J\x1b[H");
      resolve(state.cancelled ? [] : selectedSkills(installed, state));
    };
    const onData = (data: Buffer) => {
      state = applySelectionInput(installed, state, data.toString("utf8"));
      if (state.accepted || state.cancelled) finish();
      else redraw();
    };
    input.on("data", onData);
  });
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
  const usedInteractiveSelection = shouldSelectInteractively(args, Boolean(process.stdin.isTTY));
  if (usedInteractiveSelection) {
    selected = await selectInteractively(installed);
  }
  if (!selected.length) {
    if (usedInteractiveSelection) return;
    throw new Error("No matching skills selected.");
  }
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

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
