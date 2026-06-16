import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { discoverSkills, resolveSource } from "./discovery.js";
import { appendHistory, readRegistry, writeRegistry } from "./registry.js";
import { hashDirectory, validateSkill } from "./skill.js";
function destinationFor(repo, relativePath) {
    const destination = resolve(repo, relativePath);
    const rel = destination.slice(resolve(repo).length);
    if (!(rel === "" || rel.startsWith(sep)))
        throw new Error(`Unsafe destination: ${relativePath}`);
    return destination;
}
function registryPathFor(skill) {
    if (skill.relativePath === ".")
        return `skills/${skill.name}`;
    return skill.relativePath.startsWith("skills/")
        ? skill.relativePath
        : `skills/${skill.relativePath}`;
}
function stageSkills(repo, source, selected) {
    mkdirSync(repo, { recursive: true });
    const root = mkdtempSync(join(repo, ".agent-skills-stage-"));
    const staged = new Map();
    const now = new Date().toISOString();
    const entries = selected.map((skill, index) => {
        const path = registryPathFor(skill);
        const target = join(root, String(index));
        cpSync(skill.absolutePath, target, { recursive: true, dereference: false });
        validateSkill(target, skill.name, target);
        const hash = hashDirectory(target);
        staged.set(skill.name, target);
        return {
            name: skill.name,
            path,
            source: source.source,
            sourceType: source.sourceType,
            sourcePath: skill.relativePath,
            ref: source.ref,
            commit: source.commit,
            hash,
            addedAt: now,
            updatedAt: now,
            updatable: true
        };
    });
    return { root, entries, staged };
}
function assertUniqueNames(registry, selected, source) {
    const seen = new Set();
    for (const skill of selected) {
        if (seen.has(skill.name))
            throw new Error(`Duplicate skill name in source: ${skill.name}`);
        seen.add(skill.name);
        const previous = registry.skills[skill.name];
        if (previous && previous.source !== source.source) {
            throw new Error(`Skill name "${skill.name}" is already registered from ${previous.source}.`);
        }
    }
}
function commitStaged(repo, registry, entries, staged, action) {
    const transaction = mkdtempSync(join(repo, ".agent-skills-transaction-"));
    const backups = [];
    const installed = [];
    try {
        for (const entry of entries) {
            const destination = destinationFor(repo, entry.path);
            mkdirSync(dirname(destination), { recursive: true });
            if (existsSync(destination)) {
                const backup = join(transaction, entry.name);
                renameSync(destination, backup);
                backups.push({ destination, backup });
            }
            renameSync(staged.get(entry.name), destination);
            installed.push(destination);
            registry.skills[entry.name] = entry;
        }
        writeRegistry(repo, registry);
        const timestamp = new Date().toISOString();
        for (const entry of entries) {
            appendHistory(repo, {
                timestamp,
                action,
                skill: entry.name,
                path: entry.path,
                source: entry.source,
                ref: entry.ref,
                commit: entry.commit,
                hash: entry.hash
            });
        }
        return entries.map((entry) => ({
            name: entry.name,
            action: action === "add" ? "added" : "updated",
            path: entry.path,
            hash: entry.hash
        }));
    }
    catch (error) {
        for (const destination of installed.reverse()) {
            rmSync(destination, { recursive: true, force: true });
        }
        for (const backup of backups.reverse()) {
            if (existsSync(backup.backup))
                renameSync(backup.backup, backup.destination);
        }
        throw error;
    }
    finally {
        rmSync(transaction, { recursive: true, force: true });
    }
}
export function addSkills(options) {
    const registry = readRegistry(options.repo);
    assertUniqueNames(registry, options.selected, options.source);
    const staged = stageSkills(options.repo, options.source, options.selected);
    try {
        const unchanged = [];
        const changedEntries = staged.entries.filter((entry) => {
            const previous = registry.skills[entry.name];
            if (previous?.hash === entry.hash && previous.path === entry.path) {
                unchanged.push({
                    name: entry.name,
                    action: "unchanged",
                    path: entry.path,
                    hash: entry.hash
                });
                return false;
            }
            if (previous)
                entry.addedAt = previous.addedAt;
            return true;
        });
        if (!changedEntries.length)
            return unchanged;
        return commitStaged(options.repo, registry, changedEntries, staged.staged, "add").concat(unchanged);
    }
    finally {
        rmSync(staged.root, { recursive: true, force: true });
    }
}
export function removeSkills(repo, names) {
    const registry = readRegistry(repo);
    const missing = names.filter((name) => !registry.skills[name]);
    if (missing.length)
        throw new Error(`Skills not found: ${missing.join(", ")}`);
    const removed = [];
    const transaction = mkdtempSync(join(repo, ".agent-skills-remove-"));
    try {
        for (const name of names) {
            const entry = registry.skills[name];
            const destination = destinationFor(repo, entry.path);
            const backup = join(transaction, name);
            if (existsSync(destination)) {
                renameSync(destination, backup);
                removed.push({ entry, backup, destination });
            }
            delete registry.skills[name];
        }
        writeRegistry(repo, registry);
        const timestamp = new Date().toISOString();
        for (const name of names)
            appendHistory(repo, { timestamp, action: "remove", skill: name });
        return names.map((name) => ({ name, action: "removed" }));
    }
    catch (error) {
        for (const item of removed.reverse())
            renameSync(item.backup, item.destination);
        throw error;
    }
    finally {
        rmSync(transaction, { recursive: true, force: true });
    }
}
export function updateSkills(repo, names, onProgress) {
    const registry = readRegistry(repo);
    const selectedNames = names?.length ? names : Object.keys(registry.skills);
    const missing = selectedNames.filter((name) => !registry.skills[name]);
    if (missing.length)
        throw new Error(`Skills not found: ${missing.join(", ")}`);
    const results = [];
    for (const [index, name] of selectedNames.entries()) {
        onProgress?.(name, index + 1, selectedNames.length);
        const previous = registry.skills[name];
        if (!previous.updatable || !previous.sourcePath) {
            results.push({
                name,
                action: "skipped",
                message: "legacy entry must be re-added before updating"
            });
            continue;
        }
        let source;
        try {
            source = resolveSource(previous.sourceType === "git" && previous.ref
                ? `${previous.source}#${previous.ref}`
                : previous.source);
            const discovered = discoverSkills(source);
            const skill = discovered.find((candidate) => candidate.relativePath === previous.sourcePath);
            if (!skill) {
                results.push({ name, action: "skipped", message: "source path no longer exists" });
                continue;
            }
            if (skill.name !== name) {
                results.push({ name, action: "skipped", message: "source skill name changed" });
                continue;
            }
            const hash = hashDirectory(skill.absolutePath);
            if (hash === previous.hash) {
                results.push({ name, action: "unchanged", path: previous.path, hash });
                continue;
            }
            const staged = stageSkills(repo, source, [skill]);
            try {
                const entry = staged.entries[0];
                entry.path = previous.path;
                entry.addedAt = previous.addedAt;
                results.push(...commitStaged(repo, registry, [entry], staged.staged, "update"));
            }
            finally {
                rmSync(staged.root, { recursive: true, force: true });
            }
        }
        catch (error) {
            results.push({
                name,
                action: "skipped",
                message: error instanceof Error ? error.message : String(error)
            });
        }
        finally {
            source?.cleanup();
        }
    }
    return results;
}
//# sourceMappingURL=manager.js.map