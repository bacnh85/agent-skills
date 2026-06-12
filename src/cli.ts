#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { resolveTargetRepo } from "./config.js";
import { discoverSkills, resolveSource } from "./discovery.js";
import { addSkills, removeSkills, updateSkills } from "./manager.js";
import { readRegistry } from "./registry.js";
import type { RegistryEntry } from "./types.js";
import {
  formatOperationResult,
  runOperation,
  selectDiscoveredSkills,
  selectRegistrySkills
} from "./ui.js";

export interface Args {
  command?: "add" | "remove" | "list" | "update";
  values: string[];
}

export function usage(): string {
  return `Usage:
  agent-skills add <source>
  agent-skills remove [skills...]
  agent-skills list
  agent-skills update [skills...]`;
}

export function parseArgs(argv: string[]): Args {
  if (!argv.length) return { values: [] };
  if (argv[0] === "--help" || argv[0] === "-h") return { values: [] };
  const command = argv[0];
  if (!["add", "remove", "list", "update"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const values = argv.slice(1);
  const option = values.find((value) => value.startsWith("-"));
  if (option) throw new Error(`Unknown option: ${option}`);
  if (command === "add" && values.length !== 1) {
    throw new Error("Usage: agent-skills add <source>");
  }
  if (command === "list" && values.length) {
    throw new Error("agent-skills list does not accept arguments.");
  }
  return { command: command as Args["command"], values };
}

export function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

export function formatRegistryList(entries: RegistryEntry[]): string {
  if (!entries.length) return pc.dim("No project skills found.");

  const rows = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      source: entry.source || "-",
      ref: entry.ref || "-",
      commit: entry.commit?.slice(0, 12) || "-",
      updatedAt: entry.updatedAt || "-"
    }));
  const width = (values: string[]) => Math.max(...values.map((value) => value.length));
  const widths = {
    name: width(rows.map((row) => row.name)),
    path: width(rows.map((row) => row.path)),
    source: width(rows.map((row) => row.source)),
    ref: width(rows.map((row) => row.ref)),
    commit: width(rows.map((row) => row.commit))
  };
  const lines = rows.map((row) =>
    [
      pc.cyan(row.name.padEnd(widths.name)),
      pc.dim(row.path.padEnd(widths.path)),
      `${pc.dim("Source:")} ${row.source.padEnd(widths.source)}`,
      `${pc.dim("Ref:")} ${row.ref.padEnd(widths.ref)}`,
      `${pc.dim("Commit:")} ${row.commit.padEnd(widths.commit)}`,
      `${pc.dim("Updated:")} ${row.updatedAt}`
    ].join("  ")
  );

  return [pc.bold("Project Skills"), "", ...lines, ""].join("\n");
}

function printResults(results: ReturnType<typeof addSkills>): void {
  for (const result of results) {
    console.log(formatOperationResult(result));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    console.log(usage());
    return;
  }
  const repo = resolveTargetRepo();
  const interactive = Boolean(process.stdout.isTTY);
  if (args.command === "list") {
    console.log(formatRegistryList(Object.values(readRegistry(repo).skills)));
    return;
  }
  if (args.command === "remove") {
    let names = args.values;
    if (!names.length) {
      if (!process.stdin.isTTY) {
        throw new Error("No skills specified and interactive selection is unavailable.");
      }
      names = await selectRegistrySkills(Object.values(readRegistry(repo).skills));
      if (!names.length) return;
    }
    const count = names.length;
    printResults(
      runOperation(
        `Removing ${count} skill${count === 1 ? "" : "s"}...`,
        `Removed ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        () => removeSkills(repo, names)
      )
    );
    return;
  }
  if (args.command === "update") {
    const count = args.values.length || Object.keys(readRegistry(repo).skills).length;
    printResults(
      runOperation(
        `Updating ${count} skill${count === 1 ? "" : "s"}...`,
        `Checked ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        (progress) =>
          updateSkills(repo, args.values, (name, index, total) => {
            progress.message(`Updating ${name} (${index}/${total})...`);
          })
      )
    );
    return;
  }

  const source = resolveSource(args.values[0]);
  try {
    const discovered = discoverSkills(source);
    if (!discovered.length) throw new Error("No skills found in source.");
    let selected = discovered;
    if (discovered.length > 1) {
      if (!process.stdin.isTTY) {
        throw new Error(
          `Source contains ${discovered.length} skills; interactive selection requires a TTY. Use a direct skill URL or path.`
        );
      }
      selected = await selectDiscoveredSkills(discovered);
      if (!selected.length) return;
    }
    const count = selected.length;
    printResults(
      runOperation(
        `Adding ${count} skill${count === 1 ? "" : "s"}...`,
        `Added ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        () => addSkills({ repo, source, selected })
      )
    );
  } finally {
    source.cleanup();
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
