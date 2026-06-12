import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverSkills, parseSource, resolveSource } from "../src/discovery.js";

function skill(path: string, name: string): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n`
  );
}

test("source parser supports GitHub shorthand, tree URLs, git URLs, and local paths", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-source-"));
  try {
    assert.equal(parseSource("vercel-labs/skills").cloneUrl, "https://github.com/vercel-labs/skills.git");
    assert.deepEqual(
      parseSource("https://github.com/acme/repo/tree/main/skills/demo"),
      {
        type: "git",
        normalized: "https://github.com/acme/repo.git",
        cloneUrl: "https://github.com/acme/repo.git",
        ref: "main",
        directPath: "skills/demo"
      }
    );
    assert.equal(parseSource("git@example.com:acme/repo.git").type, "git");
    assert.equal(parseSource(root).type, "local");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery uses standard containers, recursive fallback, and direct skill paths", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-discover-"));
  try {
    skill(join(root, "skills", "nested", "alpha"), "alpha");
    skill(join(root, "skills", "beta"), "beta");
    const source = resolveSource(root);
    assert.deepEqual(
      discoverSkills(source).map((item) => [item.name, item.relativePath]),
      [["beta", "skills/beta"], ["alpha", "skills/nested/alpha"]]
    );
    assert.deepEqual(
      discoverSkills({ ...source, directPath: "skills/beta" }).map((item) => item.name),
      ["beta"]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
