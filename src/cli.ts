#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, isCancel } from "@clack/prompts";
import pc from "picocolors";
import { resolveInstallTarget, resolveTargetRepo } from "./config.js";
import { discoverSkills, resolveSource } from "./discovery.js";
import {
  discoverInstalledSkills,
  installSkills,
  uninstallSkills
} from "./installer.js";
import { registryPathFor, selectorMatchesEntry } from "./identity.js";
import { addSkills, removeSkills, updateSkills } from "./manager.js";
import { readRegistry } from "./registry.js";
import type { DiscoveredSkill, Registry, RegistryEntry } from "./types.js";
import {
  confirmOperation,
  formatOperationResult,
  runOperation,
  selectDiscoveredSkills,
  selectInstalledSkills,
  selectInstallScope,
  selectRegistrySkills
} from "./ui.js";
import {
  checkForUpdate,
  installLatestVersion,
  presentUpdate,
  readCurrentVersion,
  UPGRADE_COMMAND
} from "./version.js";

export interface Args {
  command?:
    | "add"
    | "remove"
    | "list"
    | "update"
    | "install"
    | "uninstall"
    | "version"
    | "upgrade";
  values: string[];
  skills?: string[];
  all?: boolean;
  global?: boolean;
  installed?: boolean;
  yes?: boolean;
}

export function usage(): string {
  return `Usage:
  agent-skills add <source> [-s|--skill|--skills <name>]...
  agent-skills remove [-s|--skill <name>]...
  agent-skills list [--installed] [-g|--global]
  agent-skills version
  agent-skills upgrade [--yes|-y]
  agent-skills update [-s|--skill <name>]...
  agent-skills install [--all]
  agent-skills uninstall [-s|--skill <name>]... [-g|--global]
  agent-skills uninstall --all [-g|--global]`;
}

function parseSkillOptions(values: string[], allowedOptions = new Set<string>()): {
  positionals: string[];
  skills: string[];
  options: Set<string>;
} {
  const positionals: string[] = [];
  const skills: string[] = [];
  const options = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--skill" || value === "--skills" || value === "-s") {
      const name = values[index + 1];
      if (!name || name.startsWith("-")) {
        throw new Error(`${value} requires a value.`);
      }
      if (!skills.includes(name)) skills.push(name);
      index += 1;
    } else if (allowedOptions.has(value)) {
      options.add(value);
    } else if (value.startsWith("-")) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      positionals.push(value);
    }
  }
  return { positionals, skills, options };
}

export function parseArgs(argv: string[]): Args {
  if (!argv.length) return { values: [] };
  if (argv[0] === "--help" || argv[0] === "-h") return { values: [] };
  const command = argv[0];
  if (!["add", "remove", "list", "update", "install", "uninstall", "version", "upgrade"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const values = argv.slice(1);
  if (command === "add") {
    const { positionals, skills } = parseSkillOptions(values);
    if (positionals.length !== 1) {
      throw new Error("Usage: agent-skills add <source> [-s|--skill <name>]...");
    }
    return {
      command: "add",
      values: positionals,
      ...(skills.length ? { skills } : {})
    };
  }
  if (command === "remove" || command === "update") {
    const { positionals, skills } = parseSkillOptions(values);
    if (positionals.length) {
      throw new Error(
        `Usage: agent-skills ${command} [-s|--skill <name>]...`
      );
    }
    return {
      command,
      values: [],
      ...(skills.length ? { skills } : {})
    };
  }
  if (command === "install") {
    const allowed = new Set(["--all"]);
    const option = values.find((value) => value.startsWith("-") && !allowed.has(value));
    if (option) throw new Error(`Unknown option: ${option}`);
    const positional = values.find((value) => !value.startsWith("-"));
    if (positional) throw new Error("agent-skills install does not accept arguments.");
    return {
      command: "install",
      values: [],
      all: values.includes("--all"),
      global: false
    };
  }
  if (command === "uninstall") {
    const { positionals, skills, options } = parseSkillOptions(
      values,
      new Set(["-g", "--global", "--all"])
    );
    if (positionals.length) {
      throw new Error(
        "Usage: agent-skills uninstall [-s|--skill <name>]... [-g|--global]"
      );
    }
    const all = options.has("--all");
    if (all && skills.length) {
      throw new Error("agent-skills uninstall does not accept --skill with --all.");
    }
    return {
      command: "uninstall",
      values: [],
      ...(skills.length ? { skills } : {}),
      all,
      global: options.has("-g") || options.has("--global")
    };
  }
  if (command === "list") {
    const allowed = new Set(["--installed", "-g", "--global"]);
    const option = values.find((value) => value.startsWith("-") && !allowed.has(value));
    if (option) throw new Error(`Unknown option: ${option}`);
    const positional = values.find((value) => !value.startsWith("-"));
    if (positional) throw new Error("agent-skills list does not accept arguments.");
    const installed = values.includes("--installed");
    const global = values.includes("-g") || values.includes("--global");
    if (global && !installed) {
      throw new Error(`Unknown option: ${values.includes("-g") ? "-g" : "--global"}`);
    }
    return {
      command: "list",
      values: [],
      ...(installed ? { installed } : {}),
      ...(installed ? { global } : {})
    };
  }
  if (command === "upgrade") {
    const allowed = new Set(["--yes", "-y"]);
    const option = values.find((value) => value.startsWith("-") && !allowed.has(value));
    if (option) throw new Error(`Unknown option: ${option}`);
    const positional = values.find((value) => !value.startsWith("-"));
    if (positional) throw new Error("agent-skills upgrade does not accept arguments.");
    return {
      command: "upgrade",
      values: [],
      yes: values.includes("--yes") || values.includes("-y")
    };
  }
  const option = values.find((value) => value.startsWith("-"));
  if (option) throw new Error(`Unknown option: ${option}`);
  if ((command === "list" || command === "version") && values.length) {
    throw new Error(`agent-skills ${command} does not accept arguments.`);
  }
  return { command: command as Args["command"], values };
}

export function selectNamedSkills(
  discovered: DiscoveredSkill[],
  requested: string[]
): DiscoveredSkill[] {
  const selected: DiscoveredSkill[] = [];
  for (const name of requested) {
    const normalized = name.replace(/^skills\//, "");
    const matches = discovered.filter((skill) =>
      skill.name === name || skill.relativePath === normalized
    );
    if (!matches.length) throw new Error(`Skill not found: ${name}`);
    if (matches.length > 1) {
      throw new Error(
        `Skill name is ambiguous: ${name}. Choices: ${matches.map((skill) => skill.relativePath).join(", ")}`
      );
    }
    selected.push(matches[0]);
  }
  return selected;
}

function resolveRegistrySkillSelectors(entries: RegistryEntry[], requested: string[]): string[] {
  const selected: string[] = [];
  for (const selector of requested) {
    const matches = entries.filter((entry) => selectorMatchesEntry(entry, selector));
    if (!matches.length) throw new Error(`Skill not found: ${selector}`);
    if (matches.length > 1) {
      throw new Error(
        `Skill name is ambiguous: ${selector}. Choices: ${matches.map((entry) => entry.id).join(", ")}`
      );
    }
    selected.push(matches[0].id);
  }
  return [...new Set(selected)];
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

export function formatInstalledList(skills: DiscoveredSkill[], target: string): string {
  if (!skills.length) return pc.dim(`No installed skills found in ${target}.`);

  const rows = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({
      name: skill.id ?? skill.name,
      path: skill.absolutePath,
      source: skill.source || "-",
      ref: skill.ref || "-",
      commit: skill.commit?.slice(0, 12) || "-"
    }));
  const width = Math.max(...rows.map((row) => row.name.length));
  const lines = rows.map((row) => [
    pc.cyan(row.name.padEnd(width)),
    pc.dim(row.path),
    `${pc.dim("Source:")} ${row.source}`,
    `${pc.dim("Ref:")} ${row.ref}`,
    `${pc.dim("Commit:")} ${row.commit}`
  ].join("  "));

  return [pc.bold("Installed Skills"), "", ...lines, ""].join("\n");
}

export function listProjectSkills(repo: string, registry: Registry): RegistryEntry[] {
  const skillsRoot = join(repo, "skills");
  if (!existsSync(skillsRoot)) return [];
  const source = resolveSource(skillsRoot);
  try {
    return discoverSkills(source).map((skill) => {
      const path = `skills/${skill.relativePath}`;
      const registered = Object.values(registry.skills).find(
        (entry) => entry.path === path
      );
      return registered ?? {
        id: path.replace(/^skills\//, ""),
        vendor: path.replace(/^skills\//, "").split("/")[0] ?? "local",
        name: skill.name,
        path,
        source: "",
        sourceType: "local",
        hash: "",
        addedAt: "",
        updatedAt: "",
        updatable: false
      };
    });
  } finally {
    source.cleanup();
  }
}

function printResults(results: ReturnType<typeof addSkills>): void {
  for (const result of results) {
    console.log(formatOperationResult(result));
  }
}

export function shouldCheckForUpdates(
  args: Args,
  env: NodeJS.ProcessEnv = process.env,
  stdoutIsTTY = Boolean(process.stdout.isTTY),
  stdinIsTTY = Boolean(process.stdin.isTTY)
): boolean {
  return Boolean(
    args.command &&
    args.command !== "version" &&
    args.command !== "upgrade" &&
    stdoutIsTTY &&
    stdinIsTTY &&
    !env.CI
  );
}

function interactiveConfirm(): (message: string) => Promise<boolean> {
  return async (message) => {
    const answer = await confirm({ message, initialValue: false });
    return isCancel(answer) ? false : answer;
  };
}

async function runCommand(args: Args): Promise<void> {
  if (!args.command) {
    console.log(usage());
    return;
  }
  if (args.command === "version") {
    const current = readCurrentVersion();
    const result = checkForUpdate(current, { force: true });
    console.log(current);
    if (result.error) {
      console.log("Unable to check latest version.");
    } else if (result.updateAvailable) {
      console.log(`Latest version: ${result.latest} (update available)`);
      if (process.stdout.isTTY && process.stdin.isTTY && !process.env.CI) {
        const status = await presentUpdate(result, { confirm: interactiveConfirm() });
        if (status !== 0) throw new Error("Unable to install the latest version.");
      } else {
        console.log(`Update with: ${UPGRADE_COMMAND}`);
      }
    } else {
      console.log(`Latest version: ${result.latest}`);
    }
    return;
  }
  if (args.command === "upgrade") {
    const current = readCurrentVersion();
    const result = checkForUpdate(current, { force: true });
    if (result.error) {
      throw new Error(`Unable to check latest version: ${result.error.message}`);
    }
    if (!result.updateAvailable) {
      console.log(`Already up to date: ${current}`);
      return;
    }
    console.log(`Update available: ${current} -> ${result.latest}`);
    let approved = args.yes ?? false;
    if (!approved) {
      if (!process.stdin.isTTY) {
        throw new Error(
          "Interactive upgrade requires a TTY. Use --yes for unattended upgrade."
        );
      }
      approved = await interactiveConfirm()(`Upgrade to ${result.latest}?`);
    }
    if (!approved) {
      console.log(`Update later with: ${UPGRADE_COMMAND}`);
      return;
    }
    console.log(`Running: ${UPGRADE_COMMAND}`);
    const status = installLatestVersion();
    if (status !== 0) throw new Error("Unable to install the latest version.");
    console.log(`Upgraded to ${result.latest}.`);
    return;
  }
  const interactive = Boolean(process.stdout.isTTY);
  if (args.command === "install") {
    const repo = resolveTargetRepo();
    const source = resolveSource(join(repo, "skills"));
    try {
      const discovered = discoverSkills(source);
      if (!discovered.length) throw new Error("No skills found in repository.");
      let selected = discovered;
      if (!args.all) {
        if (!process.stdin.isTTY) {
          throw new Error(
            "Interactive skill selection requires a TTY. Use --all for unattended installation."
          );
        }
        selected = await selectDiscoveredSkills(discovered, "install");
        if (!selected.length) return;
      }
      let global = false;
      if (process.stdin.isTTY) {
        const scope = await selectInstallScope();
        if (!scope) return;
        global = scope === "global";
      }
      const target = resolveInstallTarget({ global });
      const registry = readRegistry(repo);
      const metadata = Object.fromEntries(selected.flatMap((skill) => {
        const entry = Object.values(registry.skills).find((item) => item.path === `skills/${skill.relativePath}`);
        return entry
          ? [[skill.relativePath, {
              id: entry.id,
              vendor: entry.vendor,
              name: entry.name,
              source: entry.source,
              sourceType: entry.sourceType,
              sourcePath: entry.sourcePath,
              ref: entry.ref,
              commit: entry.commit,
              hash: entry.hash
            }]]
          : [];
      }));
      const count = selected.length;
      printResults(
        await runOperation(
          `Installing ${count} skill${count === 1 ? "" : "s"}...`,
          `Installed ${count} skill${count === 1 ? "" : "s"}`,
          interactive,
          () => installSkills(target, selected, metadata)
        )
      );
    } finally {
      source.cleanup();
    }
    return;
  }
  if (args.command === "uninstall") {
    const target = resolveInstallTarget({ global: args.global });
    const installed = discoverInstalledSkills(target);
    if (!installed.length) throw new Error(`No installed skills found in ${target}.`);
    let names = args.all ? installed.map((skill) => skill.name) : args.skills ?? [];
    if (!args.all && !names.length) {
      if (!process.stdin.isTTY) {
        throw new Error(
          "Interactive skill selection requires a TTY. Specify skills or use --all."
        );
      }
      names = await selectInstalledSkills(installed);
      if (!names.length) return;
    }
    const count = names.length;
    printResults(
      await runOperation(
        `Uninstalling ${count} skill${count === 1 ? "" : "s"}...`,
        `Uninstalled ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        () => uninstallSkills(target, names)
      )
    );
    return;
  }
  const repo = resolveTargetRepo();
  if (args.command === "list") {
    if (args.installed) {
      const target = resolveInstallTarget({ global: args.global });
      console.log(formatInstalledList(discoverInstalledSkills(target), target));
      return;
    }
    const registry = readRegistry(repo);
    console.log(formatRegistryList(listProjectSkills(repo, registry)));
    return;
  }
  if (args.command === "remove") {
    let names = args.skills ?? [];
    if (!names.length) {
      if (!process.stdin.isTTY) {
        throw new Error("No skills specified and interactive selection is unavailable.");
      }
      names = await selectRegistrySkills(Object.values(readRegistry(repo).skills));
      if (!names.length) return;
    }
    const count = names.length;
    printResults(
      await runOperation(
        `Removing ${count} skill${count === 1 ? "" : "s"}...`,
        `Removed ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        () => removeSkills(repo, resolveRegistrySkillSelectors(Object.values(readRegistry(repo).skills), names))
      )
    );
    return;
  }
  if (args.command === "update") {
    const names = args.skills ? resolveRegistrySkillSelectors(Object.values(readRegistry(repo).skills), args.skills) : [];
    const count = names.length || Object.keys(readRegistry(repo).skills).length;
    printResults(
      await runOperation(
        `Updating ${count} skill${count === 1 ? "" : "s"}...`,
        `Checked ${count} skill${count === 1 ? "" : "s"}`,
        interactive,
        (progress) =>
          updateSkills(
            repo,
            names,
            (name, index, total) => {
              progress.message(`Updating ${name} (${index}/${total})...`);
            },
            undefined,
            (event) => {
              if (event.type === "source-message") {
                progress.message(event.message);
              } else if (event.type === "source-done") {
                progress.step(`Repository checked: ${event.source}`);
              } else if (event.type === "skill-result") {
                progress.step(`${event.action}: ${event.name}`);
              }
            }
          )
      )
    );
    return;
  }

  const source = await runOperation(
    "Cloning repository...",
    "Repository cloned",
    interactive,
    (progress) => resolveSource(args.values[0], {
      progress: interactive ? (message) => progress.message(message) : undefined
    })
  );
  try {
    const discovered = discoverSkills(source);
    if (interactive) console.error(pc.dim(`Found ${discovered.length} skill${discovered.length === 1 ? "" : "s"}`));
    if (!discovered.length) throw new Error("No skills found in source.");
    let selected = discovered;
    if (args.skills) {
      const selectable = discovered.map((skill) => ({
        ...skill,
        relativePath: registryPathFor(skill, source).replace(/^skills\//, "")
      }));
      const selectedPaths = new Set(selectNamedSkills(selectable, args.skills).map((skill) => skill.absolutePath));
      selected = discovered.filter((skill) => selectedPaths.has(skill.absolutePath));
    }
    if (!args.skills && discovered.length > 1) {
      if (!process.stdin.isTTY) {
        throw new Error(
          `Source contains ${discovered.length} skills; interactive selection requires a TTY. Use a direct skill URL or path.`
        );
      }
      selected = await selectDiscoveredSkills(discovered);
      if (!selected.length) return;
    }
    const count = selected.length;
    if (interactive) {
      const proceed = await confirmOperation(
        `Proceed with adding ${count} skill${count === 1 ? "" : "s"} from ${source.source}?`
      );
      if (!proceed) return;
    }
    printResults(
      await runOperation(
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  await runCommand(args);
  if (!shouldCheckForUpdates(args)) return;
  const result = checkForUpdate(readCurrentVersion());
  if (!result.updateAvailable) return;
  const status = await presentUpdate(result, { confirm: interactiveConfirm() });
  if (status !== 0) throw new Error("Unable to install the latest version.");
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
