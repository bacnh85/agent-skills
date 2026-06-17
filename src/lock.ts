import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeAtomic } from "./registry.js";
import type { SourceType } from "./types.js";

export interface SkillLockEntry {
  id: string;
  vendor: string;
  name: string;
  source: string;
  sourceType: SourceType;
  sourcePath?: string;
  ref?: string;
  commit?: string;
  hash?: string;
  installedAt: string;
  updatedAt: string;
  path: string;
}

export interface SkillLock {
  version: 1;
  skills: Record<string, SkillLockEntry>;
}

const LOCK_FILE = "skills-lock.json";

export function readSkillLock(target: string): SkillLock {
  const path = join(target, LOCK_FILE);
  if (!existsSync(path)) return { version: 1, skills: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<SkillLock>;
  return { version: 1, skills: raw.skills ?? {} };
}

export function writeSkillLock(target: string, lock: SkillLock): void {
  writeAtomic(join(target, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
}

export function lockPathFor(target: string, destination: string): string {
  const rel = relative(target, destination).split(/[\\/]/).join("/");
  return rel || ".";
}
