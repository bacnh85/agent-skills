import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { registryIdForPath } from "./identity.js";
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

function normalizeEntry(key: string, value: RegistryEntry | LegacyEntry): RegistryEntry {
  const legacy = value as LegacyEntry;
  const existing = value as Partial<RegistryEntry>;
  const name = existing.name ?? legacy.name ?? key;
  const path = existing.path ?? (legacy.category ? `skills/${legacy.category}/${name}` : `skills/${name}`);
  const sourceType = existing.sourceType ?? (legacy.sourceType === "local" ? "local" : "git");
  const id = existing.id ?? registryIdForPath(path);
  const vendor = existing.vendor ?? id.split("/")[0] ?? "local";
  const updatable = existing.updatable ?? Boolean(
    legacy.source &&
    legacy.hash &&
    (sourceType === "local" || legacy.sourcePath)
  );
  return {
    id,
    vendor,
    name,
    path,
    source: existing.source ?? legacy.source ?? "unknown",
    sourceType,
    sourcePath: existing.sourcePath ?? legacy.sourcePath?.replace(/\/SKILL\.md$/, ""),
    ref: existing.ref,
    commit: existing.commit,
    hash: existing.hash ?? legacy.hash ?? "",
    addedAt: existing.addedAt ?? legacy.firstPromotedAt ?? legacy.updatedAt ?? "",
    updatedAt: existing.updatedAt ?? legacy.updatedAt ?? legacy.firstPromotedAt ?? "",
    updatable
  };
}

export function readRegistry(repo: string): Registry {
  const path = join(repo, "skill-registry.json");
  if (!existsSync(path)) return { version: 2, skills: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    version?: number;
    skills?: Record<string, RegistryEntry | LegacyEntry>;
  };

  const skills: Record<string, RegistryEntry> = {};
  for (const [key, value] of Object.entries(raw.skills ?? {})) {
    const entry = normalizeEntry(key, value);
    skills[entry.id] = entry;
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
