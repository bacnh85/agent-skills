import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { hashDirectory, validateSkill } from "./skill.js";
import type { DiscoveredSkill, OperationResult } from "./types.js";

function destinationFor(target: string, name: string): string {
  const destination = resolve(target, name);
  const rel = destination.slice(resolve(target).length);
  if (!(rel === "" || rel.startsWith(sep))) {
    throw new Error(`Unsafe installation destination: ${name}`);
  }
  return destination;
}

function assertUniqueNames(skills: DiscoveredSkill[]): void {
  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.name)) {
      throw new Error(`Duplicate skill name in source: ${skill.name}`);
    }
    seen.add(skill.name);
  }
}

export function discoverInstalledSkills(target: string): DiscoveredSkill[] {
  if (!existsSync(target) || !lstatSync(target).isDirectory()) return [];

  const skills: DiscoveredSkill[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const absolutePath = join(target, entry.name);
    try {
      validateSkill(absolutePath, entry.name, absolutePath);
      skills.push({ name: entry.name, absolutePath, relativePath: entry.name });
    } catch {
      // Ignore unrelated and malformed directories in the install target.
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

interface RemovalOperations {
  rename(source: string, destination: string): void;
  remove(path: string): void;
}

const defaultRemovalOperations: RemovalOperations = {
  rename: renameSync,
  remove: (path) => rmSync(path, { recursive: true, force: true })
};

export function uninstallSkills(
  target: string,
  names: string[],
  operations: RemovalOperations = defaultRemovalOperations
): OperationResult[] {
  const available = new Set(discoverInstalledSkills(target).map((skill) => skill.name));
  const requested = [...new Set(names)];
  const missing = requested.filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error(`Installed skills not found: ${missing.join(", ")}`);
  }
  if (!requested.length) return [];

  const transaction = mkdtempSync(join(target, ".agent-skills-uninstall-"));
  const moved: { source: string; backup: string }[] = [];
  try {
    for (const [index, name] of requested.entries()) {
      const source = destinationFor(target, name);
      const backup = join(transaction, String(index));
      operations.rename(source, backup);
      moved.push({ source, backup });
    }
    operations.remove(transaction);
    return requested.map((name) => ({
      name,
      action: "removed",
      path: destinationFor(target, name)
    }));
  } catch (error) {
    for (const { source, backup } of moved.reverse()) {
      if (existsSync(backup)) operations.rename(backup, source);
    }
    throw error;
  } finally {
    if (existsSync(transaction)) {
      rmSync(transaction, { recursive: true, force: true });
    }
  }
}

export function installSkills(
  target: string,
  skills: DiscoveredSkill[]
): OperationResult[] {
  assertUniqueNames(skills);
  mkdirSync(target, { recursive: true });
  const stage = mkdtempSync(join(target, ".agent-skills-stage-"));
  const transaction = mkdtempSync(join(target, ".agent-skills-transaction-"));
  const staged = new Map<string, string>();
  const backups: { destination: string; backup: string }[] = [];
  const installed: string[] = [];
  const existed = new Set<string>();

  try {
    for (const [index, skill] of skills.entries()) {
      const path = join(stage, String(index));
      cpSync(skill.absolutePath, path, { recursive: true, dereference: false });
      validateSkill(path, skill.name, path);
      hashDirectory(path);
      staged.set(skill.name, path);
    }

    for (const [index, skill] of skills.entries()) {
      const destination = destinationFor(target, skill.name);
      mkdirSync(dirname(destination), { recursive: true });
      if (existsSync(destination)) {
        existed.add(skill.name);
        const backup = join(transaction, String(index));
        renameSync(destination, backup);
        backups.push({ destination, backup });
      }
      renameSync(staged.get(skill.name)!, destination);
      installed.push(destination);
    }

    return skills.map((skill) => ({
      name: skill.name,
      action: existed.has(skill.name) ? "updated" : "added",
      path: destinationFor(target, skill.name)
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
    rmSync(stage, { recursive: true, force: true });
    rmSync(transaction, { recursive: true, force: true });
  }
}
