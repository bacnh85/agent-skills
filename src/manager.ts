import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { discoverSkills, resolveSource } from "./discovery.js";
import { registryIdForPath, registryPathFor } from "./identity.js";
import { appendHistory, readRegistry, writeRegistry } from "./registry.js";
import { hashDirectory, validateSkill } from "./skill.js";
import type {
  DiscoveredSkill,
  OperationResult,
  Registry,
  RegistryEntry,
  ResolvedSource
} from "./types.js";

function destinationFor(repo: string, relativePath: string): string {
  const destination = resolve(repo, relativePath);
  const rel = destination.slice(resolve(repo).length);
  if (!(rel === "" || rel.startsWith(sep))) throw new Error(`Unsafe destination: ${relativePath}`);
  return destination;
}

function stageSkills(
  repo: string,
  source: ResolvedSource,
  selected: DiscoveredSkill[]
): { root: string; entries: RegistryEntry[]; staged: Map<string, string> } {
  mkdirSync(repo, { recursive: true });
  const root = mkdtempSync(join(repo, ".agent-skills-stage-"));
  const staged = new Map<string, string>();
  const now = new Date().toISOString();
  const entries = selected.map((skill, index) => {
    const path = registryPathFor(skill, source);
    const id = registryIdForPath(path);
    const target = join(root, String(index));
    cpSync(skill.absolutePath, target, { recursive: true, dereference: false });
    validateSkill(target, skill.name, target);
    const hash = hashDirectory(target);
    staged.set(id, target);
    return {
      id,
      vendor: id.split("/")[0] ?? "local",
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

function assertUniqueIds(
  registry: Registry,
  selected: DiscoveredSkill[],
  source: ResolvedSource
): void {
  const seen = new Set<string>();
  for (const skill of selected) {
    const id = registryIdForPath(registryPathFor(skill, source));
    if (seen.has(id)) throw new Error(`Duplicate skill id in source: ${id}`);
    seen.add(id);
    const previous = registry.skills[id];
    if (previous && previous.source !== source.source) {
      throw new Error(`Skill "${id}" is already registered from ${previous.source}.`);
    }
  }
}

function resolveRegistryIds(registry: Registry, selectors: string[]): string[] {
  return selectors.map((selector) => {
    if (registry.skills[selector]) return selector;
    const normalized = selector.replace(/^skills\//, "");
    const matches = Object.values(registry.skills).filter(
      (entry) => entry.name === selector || entry.id === normalized || entry.path === selector
    );
    if (matches.length === 1) return matches[0].id;
    return selector;
  });
}

function commitStaged(
  repo: string,
  registry: Registry,
  entries: RegistryEntry[],
  staged: Map<string, string>,
  action: "add" | "update"
): OperationResult[] {
  const transaction = mkdtempSync(join(repo, ".agent-skills-transaction-"));
  const backups: { destination: string; backup: string }[] = [];
  const installed: string[] = [];
  try {
    for (const entry of entries) {
      const destination = destinationFor(repo, entry.path);
      mkdirSync(dirname(destination), { recursive: true });
      if (existsSync(destination)) {
        const backup = join(transaction, entry.name);
        renameSync(destination, backup);
        backups.push({ destination, backup });
      }
      renameSync(staged.get(entry.id)!, destination);
      installed.push(destination);
      registry.skills[entry.id] = entry;
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
      id: entry.id,
      vendor: entry.vendor,
      name: entry.name,
      action: action === "add" ? "added" : "updated",
      path: entry.path,
      hash: entry.hash
    }));
  } catch (error) {
    for (const destination of installed.reverse()) {
      rmSync(destination, { recursive: true, force: true });
    }
    for (const backup of backups.reverse()) {
      if (existsSync(backup.backup)) renameSync(backup.backup, backup.destination);
    }
    throw error;
  } finally {
    rmSync(transaction, { recursive: true, force: true });
  }
}

export function addSkills(options: {
  repo: string;
  source: ResolvedSource;
  selected: DiscoveredSkill[];
}): OperationResult[] {
  const registry = readRegistry(options.repo);
  assertUniqueIds(registry, options.selected, options.source);
  const staged = stageSkills(options.repo, options.source, options.selected);
  try {
    const unchanged: OperationResult[] = [];
    const changedEntries = staged.entries.filter((entry) => {
      const previous = registry.skills[entry.id];
      if (previous?.hash === entry.hash && previous.path === entry.path) {
        unchanged.push({
          id: entry.id,
          vendor: entry.vendor,
          name: entry.name,
          action: "unchanged",
          path: entry.path,
          hash: entry.hash
        });
        return false;
      }
      if (previous) entry.addedAt = previous.addedAt;
      return true;
    });
    if (!changedEntries.length) return unchanged;
    return commitStaged(
      options.repo,
      registry,
      changedEntries,
      staged.staged,
      "add"
    ).concat(unchanged);
  } finally {
    rmSync(staged.root, { recursive: true, force: true });
  }
}

export function removeSkills(repo: string, ids: string[]): OperationResult[] {
  const registry = readRegistry(repo);
  ids = resolveRegistryIds(registry, ids);
  const missing = ids.filter((id) => !registry.skills[id]);
  if (missing.length) throw new Error(`Skills not found: ${missing.join(", ")}`);
  const removed: { entry: RegistryEntry; backup: string; destination: string }[] = [];
  const transaction = mkdtempSync(join(repo, ".agent-skills-remove-"));
  try {
    for (const id of ids) {
      const entry = registry.skills[id];
      const destination = destinationFor(repo, entry.path);
      const backup = join(transaction, id.replaceAll("/", "__"));
      if (existsSync(destination)) {
        renameSync(destination, backup);
        removed.push({ entry, backup, destination });
      }
      delete registry.skills[id];
    }
    writeRegistry(repo, registry);
    const timestamp = new Date().toISOString();
    for (const item of removed) appendHistory(repo, { timestamp, action: "remove", skill: item.entry.id });
    return ids.map((id) => {
      const entry = removed.find((item) => item.entry.id === id)?.entry;
      return { id, vendor: entry?.vendor, name: entry?.name ?? id, action: "removed" };
    });
  } catch (error) {
    for (const item of removed.reverse()) renameSync(item.backup, item.destination);
    throw error;
  } finally {
    rmSync(transaction, { recursive: true, force: true });
  }
}

export function updateSkills(
  repo: string,
  names?: string[],
  onProgress?: (name: string, index: number, total: number) => void,
  onCloneProgress?: (message: string) => void
): OperationResult[] {
  const registry = readRegistry(repo);
  const selectedNames = names?.length ? resolveRegistryIds(registry, names) : Object.keys(registry.skills);
  const missing = selectedNames.filter((name) => !registry.skills[name]);
  if (missing.length) throw new Error(`Skills not found: ${missing.join(", ")}`);
  const results: OperationResult[] = [];

  for (const [index, name] of selectedNames.entries()) {
    onProgress?.(name, index + 1, selectedNames.length);
    const previous = registry.skills[name];
    if (!previous.updatable || !previous.sourcePath) {
      results.push({
        id: previous.id,
        vendor: previous.vendor,
        name: previous.name,
        action: "skipped",
        message: "legacy entry must be re-added before updating"
      });
      continue;
    }
    let source: ResolvedSource | undefined;
    try {
      source = resolveSource(
        previous.sourceType === "git" && previous.ref
          ? `${previous.source}#${previous.ref}`
          : previous.source,
        { progress: onCloneProgress }
      );
      const discovered = discoverSkills(source);
      const skill = discovered.find(
        (candidate) => candidate.relativePath === previous.sourcePath
      );
      if (!skill) {
        results.push({ id: previous.id, vendor: previous.vendor, name: previous.name, action: "skipped", message: "source path no longer exists" });
        continue;
      }
      if (skill.name !== previous.name) {
        results.push({ id: previous.id, vendor: previous.vendor, name: previous.name, action: "skipped", message: "source skill name changed" });
        continue;
      }
      const hash = hashDirectory(skill.absolutePath);
      if (hash === previous.hash) {
        results.push({ id: previous.id, vendor: previous.vendor, name: previous.name, action: "unchanged", path: previous.path, hash });
        continue;
      }
      const staged = stageSkills(repo, source, [skill]);
      try {
        const entry = staged.entries[0];
        entry.id = previous.id;
        entry.vendor = previous.vendor;
        entry.path = previous.path;
        entry.addedAt = previous.addedAt;
        results.push(...commitStaged(repo, registry, [entry], staged.staged, "update"));
      } finally {
        rmSync(staged.root, { recursive: true, force: true });
      }
    } catch (error) {
      results.push({
        id: previous.id,
        vendor: previous.vendor,
        name: previous.name,
        action: "skipped",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      source?.cleanup();
    }
  }
  return results;
}
