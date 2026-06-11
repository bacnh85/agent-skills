import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import type { Category } from "./types.js";

export function validateSkill(source: string, expectedName: string): string {
  const root = realpathSync(source);
  const skillFile = join(root, "SKILL.md");
  if (!statSync(skillFile).isFile()) throw new Error(`Missing SKILL.md in ${source}.`);
  const content = readFileSync(skillFile, "utf8");
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1].match(/^name:\s*(.+)\s*$/m)?.[1].trim();
  const description = frontmatter?.[1]
    .match(/^description:\s*(.+)\s*$/m)?.[1]
    .trim();
  if (!name || !description) {
    throw new Error(`SKILL.md for "${expectedName}" requires name and description.`);
  }
  if (name !== expectedName) {
    throw new Error(`Skill name "${name}" does not match installed name "${expectedName}".`);
  }
  walkSafe(root, root);
  return content;
}

function walkSafe(root: string, directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = realpathSync(path);
      const rel = relative(root, target);
      if (rel === ".." || rel.startsWith(`..${sep}`)) {
        throw new Error(`Unsafe symlink escapes skill directory: ${path}`);
      }
    } else if (entry.isDirectory()) {
      walkSafe(root, path);
    }
  }
}

export function hashDirectory(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const path = join(directory, entry.name);
      const rel = relative(root, path).split(sep).join("/");
      hash.update(`${entry.isDirectory() ? "d" : entry.isSymbolicLink() ? "l" : "f"}:${rel}\0`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isSymbolicLink()) hash.update(readlinkSync(path));
      else hash.update(readFileSync(path));
    }
  };
  visit(root);
  return hash.digest("hex");
}

const CATEGORY_TERMS: Record<Category, string[]> = {
  "agent-tooling": ["agent", "skill", "mcp", "prompt", "codex", "claude"],
  development: ["code", "develop", "test", "debug", "typescript", "api", "git"],
  research: ["research", "search", "analy", "reference", "paper"],
  productivity: ["note", "task", "calendar", "obsidian", "workflow"],
  content: ["write", "content", "image", "design", "document", "presentation"],
  operations: ["deploy", "monitor", "log", "cloud", "incident", "security"]
};

export function inferCategory(content: string): { category?: Category; confident: boolean } {
  const text = content.toLowerCase();
  const scores = Object.entries(CATEGORY_TERMS)
    .map(([category, terms]) => ({
      category: category as Category,
      score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);
  if (scores[0].score === 0) return { confident: false };
  return {
    category: scores[0].category,
    confident: scores[0].score >= 2 && scores[0].score > scores[1].score
  };
}

export function makeTempDirectory(parent = tmpdir()): string {
  return mkdtempSync(join(parent, ".agent-skills-"));
}

export function removeTemp(path: string): void {
  if (basename(path).startsWith(".agent-skills-") && lstatSync(path).isDirectory()) {
    rmSync(path, { recursive: true, force: true });
  }
}
