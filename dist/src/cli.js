#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, isCancel } from "@clack/prompts";
import pc from "picocolors";
import { resolveInstallTarget, resolveTargetRepo } from "./config.js";
import { discoverSkills, resolveSource } from "./discovery.js";
import { discoverInstalledSkills, installSkills, uninstallSkills } from "./installer.js";
import { addSkills, removeSkills, updateSkills } from "./manager.js";
import { readRegistry } from "./registry.js";
import { formatOperationResult, runOperation, selectDiscoveredSkills, selectInstalledSkills, selectRegistrySkills } from "./ui.js";
import { checkForUpdate, presentUpdate, readCurrentVersion } from "./version.js";
export function usage() {
    return `Usage:
  agent-skills add <source> [-s|--skill <name>]...
  agent-skills remove [-s|--skill <name>]...
  agent-skills list [--installed] [-g|--global]
  agent-skills version
  agent-skills update [-s|--skill <name>]...
  agent-skills install [-g|--global] [--all]
  agent-skills uninstall [-s|--skill <name>]... [-g|--global]
  agent-skills uninstall --all [-g|--global]`;
}
function parseSkillOptions(values, allowedOptions = new Set()) {
    const positionals = [];
    const skills = [];
    const options = new Set();
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === "--skill" || value === "-s") {
            const name = values[index + 1];
            if (!name || name.startsWith("-")) {
                throw new Error(`${value} requires a value.`);
            }
            if (!skills.includes(name))
                skills.push(name);
            index += 1;
        }
        else if (allowedOptions.has(value)) {
            options.add(value);
        }
        else if (value.startsWith("-")) {
            throw new Error(`Unknown option: ${value}`);
        }
        else {
            positionals.push(value);
        }
    }
    return { positionals, skills, options };
}
export function parseArgs(argv) {
    if (!argv.length)
        return { values: [] };
    if (argv[0] === "--help" || argv[0] === "-h")
        return { values: [] };
    const command = argv[0];
    if (!["add", "remove", "list", "update", "install", "uninstall", "version"].includes(command)) {
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
            throw new Error(`Usage: agent-skills ${command} [-s|--skill <name>]...`);
        }
        return {
            command,
            values: [],
            ...(skills.length ? { skills } : {})
        };
    }
    if (command === "install") {
        const allowed = new Set(["-g", "--global", "--all"]);
        const option = values.find((value) => value.startsWith("-") && !allowed.has(value));
        if (option)
            throw new Error(`Unknown option: ${option}`);
        const positional = values.find((value) => !value.startsWith("-"));
        if (positional)
            throw new Error("agent-skills install does not accept arguments.");
        return {
            command: "install",
            values: [],
            all: values.includes("--all"),
            global: values.includes("-g") || values.includes("--global")
        };
    }
    if (command === "uninstall") {
        const { positionals, skills, options } = parseSkillOptions(values, new Set(["-g", "--global", "--all"]));
        if (positionals.length) {
            throw new Error("Usage: agent-skills uninstall [-s|--skill <name>]... [-g|--global]");
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
        if (option)
            throw new Error(`Unknown option: ${option}`);
        const positional = values.find((value) => !value.startsWith("-"));
        if (positional)
            throw new Error("agent-skills list does not accept arguments.");
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
    const option = values.find((value) => value.startsWith("-"));
    if (option)
        throw new Error(`Unknown option: ${option}`);
    if ((command === "list" || command === "version") && values.length) {
        throw new Error(`agent-skills ${command} does not accept arguments.`);
    }
    return { command: command, values };
}
export function selectNamedSkills(discovered, requested) {
    const selected = [];
    for (const name of requested) {
        const matches = discovered.filter((skill) => skill.name === name);
        if (!matches.length)
            throw new Error(`Skill not found: ${name}`);
        if (matches.length > 1)
            throw new Error(`Skill name is ambiguous: ${name}`);
        selected.push(matches[0]);
    }
    return selected;
}
export function isCliEntrypoint(moduleUrl, argvPath) {
    if (!argvPath)
        return false;
    try {
        return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
    }
    catch {
        return false;
    }
}
export function formatRegistryList(entries) {
    if (!entries.length)
        return pc.dim("No project skills found.");
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
    const width = (values) => Math.max(...values.map((value) => value.length));
    const widths = {
        name: width(rows.map((row) => row.name)),
        path: width(rows.map((row) => row.path)),
        source: width(rows.map((row) => row.source)),
        ref: width(rows.map((row) => row.ref)),
        commit: width(rows.map((row) => row.commit))
    };
    const lines = rows.map((row) => [
        pc.cyan(row.name.padEnd(widths.name)),
        pc.dim(row.path.padEnd(widths.path)),
        `${pc.dim("Source:")} ${row.source.padEnd(widths.source)}`,
        `${pc.dim("Ref:")} ${row.ref.padEnd(widths.ref)}`,
        `${pc.dim("Commit:")} ${row.commit.padEnd(widths.commit)}`,
        `${pc.dim("Updated:")} ${row.updatedAt}`
    ].join("  "));
    return [pc.bold("Project Skills"), "", ...lines, ""].join("\n");
}
export function formatInstalledList(skills, target) {
    if (!skills.length)
        return pc.dim(`No installed skills found in ${target}.`);
    const rows = [...skills]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((skill) => ({
        name: skill.name,
        path: skill.absolutePath
    }));
    const width = Math.max(...rows.map((row) => row.name.length));
    const lines = rows.map((row) => [
        pc.cyan(row.name.padEnd(width)),
        pc.dim(row.path)
    ].join("  "));
    return [pc.bold("Installed Skills"), "", ...lines, ""].join("\n");
}
export function listProjectSkills(repo, registry) {
    const skillsRoot = join(repo, "skills");
    if (!existsSync(skillsRoot))
        return [];
    const source = resolveSource(skillsRoot);
    try {
        return discoverSkills(source).map((skill) => {
            const path = `skills/${skill.relativePath}`;
            const registered = Object.values(registry.skills).find((entry) => entry.path === path);
            return registered ?? {
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
    }
    finally {
        source.cleanup();
    }
}
function printResults(results) {
    for (const result of results) {
        console.log(formatOperationResult(result));
    }
}
export function shouldCheckForUpdates(args, env = process.env, stdoutIsTTY = Boolean(process.stdout.isTTY), stdinIsTTY = Boolean(process.stdin.isTTY)) {
    return Boolean(args.command &&
        args.command !== "version" &&
        stdoutIsTTY &&
        stdinIsTTY &&
        !env.CI);
}
async function runCommand(args) {
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
        }
        else if (result.updateAvailable) {
            console.log(`Latest version: ${result.latest} (update available)`);
        }
        else {
            console.log(`Latest version: ${result.latest}`);
        }
        return;
    }
    const interactive = Boolean(process.stdout.isTTY);
    if (args.command === "install") {
        const repo = resolveTargetRepo();
        const source = resolveSource(join(repo, "skills"));
        try {
            const discovered = discoverSkills(source);
            if (!discovered.length)
                throw new Error("No skills found in repository.");
            let selected = discovered;
            if (!args.all) {
                if (!process.stdin.isTTY) {
                    throw new Error("Interactive skill selection requires a TTY. Use --all for unattended installation.");
                }
                selected = await selectDiscoveredSkills(discovered, "install");
                if (!selected.length)
                    return;
            }
            const target = resolveInstallTarget({ global: args.global });
            const count = selected.length;
            printResults(runOperation(`Installing ${count} skill${count === 1 ? "" : "s"}...`, `Installed ${count} skill${count === 1 ? "" : "s"}`, interactive, () => installSkills(target, selected)));
        }
        finally {
            source.cleanup();
        }
        return;
    }
    if (args.command === "uninstall") {
        const target = resolveInstallTarget({ global: args.global });
        const installed = discoverInstalledSkills(target);
        if (!installed.length)
            throw new Error(`No installed skills found in ${target}.`);
        let names = args.all ? installed.map((skill) => skill.name) : args.skills ?? [];
        if (!args.all && !names.length) {
            if (!process.stdin.isTTY) {
                throw new Error("Interactive skill selection requires a TTY. Specify skills or use --all.");
            }
            names = await selectInstalledSkills(installed);
            if (!names.length)
                return;
        }
        const count = names.length;
        printResults(runOperation(`Uninstalling ${count} skill${count === 1 ? "" : "s"}...`, `Uninstalled ${count} skill${count === 1 ? "" : "s"}`, interactive, () => uninstallSkills(target, names)));
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
            if (!names.length)
                return;
        }
        const count = names.length;
        printResults(runOperation(`Removing ${count} skill${count === 1 ? "" : "s"}...`, `Removed ${count} skill${count === 1 ? "" : "s"}`, interactive, () => removeSkills(repo, names)));
        return;
    }
    if (args.command === "update") {
        const names = args.skills ?? [];
        const count = names.length || Object.keys(readRegistry(repo).skills).length;
        printResults(runOperation(`Updating ${count} skill${count === 1 ? "" : "s"}...`, `Checked ${count} skill${count === 1 ? "" : "s"}`, interactive, (progress) => updateSkills(repo, names, (name, index, total) => {
            progress.message(`Updating ${name} (${index}/${total})...`);
        })));
        return;
    }
    const source = resolveSource(args.values[0]);
    try {
        const discovered = discoverSkills(source);
        if (!discovered.length)
            throw new Error("No skills found in source.");
        let selected = args.skills
            ? selectNamedSkills(discovered, args.skills)
            : discovered;
        if (!args.skills && discovered.length > 1) {
            if (!process.stdin.isTTY) {
                throw new Error(`Source contains ${discovered.length} skills; interactive selection requires a TTY. Use a direct skill URL or path.`);
            }
            selected = await selectDiscoveredSkills(discovered);
            if (!selected.length)
                return;
        }
        const count = selected.length;
        printResults(runOperation(`Adding ${count} skill${count === 1 ? "" : "s"}...`, `Added ${count} skill${count === 1 ? "" : "s"}`, interactive, () => addSkills({ repo, source, selected })));
    }
    finally {
        source.cleanup();
    }
}
export async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    await runCommand(args);
    if (!shouldCheckForUpdates(args))
        return;
    const result = checkForUpdate(readCurrentVersion());
    if (!result.updateAvailable)
        return;
    const status = await presentUpdate(result, {
        confirm: async (message) => {
            const answer = await confirm({ message, initialValue: false });
            return isCancel(answer) ? false : answer;
        }
    });
    if (status !== 0)
        throw new Error("Unable to install the latest version.");
}
if (isCliEntrypoint(import.meta.url, process.argv[1])) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
//# sourceMappingURL=cli.js.map