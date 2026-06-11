import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { InstalledSkill, Provenance, Scope } from "./types.js";

interface LockEntry {
  source?: string;
  sourceType?: string;
  skillPath?: string;
}

export function defaultScope(command?: string): Scope | "all" {
  return command === "promote" ? "all" : "project";
}

export function listInstalled(scope: Scope): InstalledSkill[] {
  const args = ["skills", "list"];
  if (scope === "global") args.push("--global");
  args.push("--json");
  const npxCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const executable =
    process.platform === "win32" && existsSync(npxCli) ? process.execPath : "npx";
  const executableArgs =
    process.platform === "win32" && existsSync(npxCli) ? [npxCli, ...args] : args;
  const output = execFileSync(executable, executableArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return (JSON.parse(output) as InstalledSkill[]).map((skill) => ({
    ...skill,
    scope
  }));
}

function findLockFile(skillPath: string): string | undefined {
  let current = resolve(skillPath);
  while (true) {
    const candidate = join(current, "skills-lock.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveProvenance(
  skill: InstalledSkill,
  explicitSource?: string
): Provenance {
  const lockPath = findLockFile(skill.path);
  if (lockPath) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
      skills?: Record<string, LockEntry>;
    };
    const entry = lock.skills?.[skill.name];
    if (entry?.source) {
      return {
        source: entry.source,
        sourceType: entry.sourceType ?? "git",
        sourcePath: entry.skillPath
      };
    }
  }
  if (explicitSource) return { source: explicitSource, sourceType: "git" };
  throw new Error(
    `Source provenance for skill "${skill.name}" was not found. Pass --source <url>.`
  );
}
