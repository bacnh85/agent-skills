import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import type { Registry, RegistryEntry } from "./types.js";

interface LegacyEntry {
  name?: string;
  category?: string;
  hash?: string;
  source?: string;
  sourceType?: string;
  sourcePath?: string;
  firstPromotedAt?: string;
  updatedAt?: string;
}

export function readRegistry(repo: string): Registry {
  const path = join(repo, "skill-registry.json");
  if (!existsSync(path)) return { version: 2, skills: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    version?: number;
    skills?: Record<string, RegistryEntry | LegacyEntry>;
  };
  if (raw.version === 2) return raw as Registry;

  const skills: Record<string, RegistryEntry> = {};
  for (const [key, value] of Object.entries(raw.skills ?? {})) {
    const legacy = value as LegacyEntry;
    const name = legacy.name ?? key;
    const path = legacy.category ? `skills/${legacy.category}/${name}` : `skills/${name}`;
    const sourceType = legacy.sourceType === "local" ? "local" : "git";
    const updatable = Boolean(
      legacy.source &&
      legacy.hash &&
      (sourceType === "local" || legacy.sourcePath)
    );
    skills[name] = {
      name,
      path,
      source: legacy.source ?? "unknown",
      sourceType,
      sourcePath: legacy.sourcePath?.replace(/\/SKILL\.md$/, ""),
      hash: legacy.hash ?? "",
      addedAt: legacy.firstPromotedAt ?? legacy.updatedAt ?? "",
      updatedAt: legacy.updatedAt ?? legacy.firstPromotedAt ?? "",
      updatable
    };
  }
  return { version: 2, skills };
}

export function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

export function writeRegistry(repo: string, registry: Registry): void {
  writeAtomic(join(repo, "skill-registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
}

export function appendHistory(
  repo: string,
  event: Record<string, unknown>
): void {
  mkdirSync(repo, { recursive: true });
  appendFileSync(
    join(repo, "skill-history.jsonl"),
    `${JSON.stringify({ version: 2, ...event })}\n`
  );
}
