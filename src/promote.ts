import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { hashDirectory, makeTempDirectory, removeTemp, validateSkill } from "./skill.js";
import type {
  Category,
  InstalledSkill,
  PromotionResult,
  Provenance,
  Registry
} from "./types.js";

function readRegistry(repo: string): Registry {
  const path = join(repo, "skill-registry.json");
  if (!existsSync(path)) return { version: 1, skills: {} };
  return JSON.parse(readFileSync(path, "utf8")) as Registry;
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

export function promoteSkill(options: {
  skill: InstalledSkill;
  repo: string;
  category: Category;
  provenance: Provenance;
  dryRun?: boolean;
  allowSourceChange?: boolean;
  now?: string;
  cliVersion?: string;
}): PromotionResult {
  validateSkill(options.skill.path, options.skill.name);
  const hash = hashDirectory(options.skill.path);
  const registry = readRegistry(options.repo);
  const previous = registry.skills[options.skill.name];
  if (previous && previous.source !== options.provenance.source && !options.allowSourceChange) {
    throw new Error(
      `Skill "${options.skill.name}" is already recorded from ${previous.source}. Pass --allow-source-change to replace it.`
    );
  }

  const destination = join(options.repo, "skills", options.category, options.skill.name);
  const action =
    previous?.hash === hash && previous.category === options.category
      ? "unchanged"
      : previous
        ? "updated"
        : "created";
  const result: PromotionResult = {
    name: options.skill.name,
    action,
    category: options.category,
    destination,
    hash,
    provenance: options.provenance,
    dryRun: Boolean(options.dryRun)
  };
  if (options.dryRun || action === "unchanged") return result;

  const now = options.now ?? new Date().toISOString();
  const destinationParent = dirname(destination);
  mkdirSync(destinationParent, { recursive: true });
  const temporaryRoot = makeTempDirectory(destinationParent);
  try {
    const staged = join(temporaryRoot, options.skill.name);
    cpSync(options.skill.path, staged, {
      recursive: true,
      dereference: true,
      errorOnExist: true
    });
    validateSkill(staged, options.skill.name);
    if (hashDirectory(staged) !== hash) {
      throw new Error(`Skill "${options.skill.name}" changed while being promoted.`);
    }

    if (previous && previous.category !== options.category) {
      rmSync(join(options.repo, "skills", previous.category, options.skill.name), {
        recursive: true,
        force: true
      });
    }
    rmSync(destination, { recursive: true, force: true });
    renameSync(staged, destination);

    registry.skills[options.skill.name] = {
      name: options.skill.name,
      category: options.category,
      hash,
      ...options.provenance,
      firstPromotedAt: previous?.firstPromotedAt ?? now,
      updatedAt: now,
      latestScope: options.skill.scope
    };
    writeAtomic(
      join(options.repo, "skill-registry.json"),
      `${JSON.stringify(registry, null, 2)}\n`
    );
    appendFileSync(
      join(options.repo, "skill-history.jsonl"),
      `${JSON.stringify({
        version: 1,
        timestamp: now,
        action,
        skill: options.skill.name,
        category: options.category,
        previousCategory: previous?.category,
        oldHash: previous?.hash,
        newHash: hash,
        ...options.provenance,
        scope: options.skill.scope,
        cliVersion: options.cliVersion ?? "0.1.0"
      })}\n`
    );
    return result;
  } finally {
    removeTemp(temporaryRoot);
  }
}
