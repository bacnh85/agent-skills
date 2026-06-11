import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promoteSkill } from "../src/promote.js";
import { makeTempDirectory, removeTemp } from "../src/skill.js";

function createSkill(root: string, body = "Initial"): string {
  const path = join(root, "source", "demo");
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "SKILL.md"),
    `---\nname: demo\ndescription: Demo development skill.\n---\n\n# Demo\n\n${body}\n`
  );
  return path;
}

test("promotion copies, records, no-ops, and updates a skill", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-promote-"));
  try {
    const source = createSkill(root);
    const repo = join(root, "central");
    mkdirSync(repo);
    const base = {
      skill: { name: "demo", path: source, scope: "project" as const, agents: [] },
      repo,
      category: "development" as const,
      provenance: {
        source: "git@example/repo.git",
        sourceType: "git",
        sourcePath: "skills/demo/SKILL.md"
      },
      now: "2026-06-11T00:00:00.000Z"
    };
    assert.equal(promoteSkill(base).action, "created");
    assert.ok(existsSync(join(repo, "skills", "development", "demo", "SKILL.md")));
    assert.equal(promoteSkill(base).action, "unchanged");

    writeFileSync(join(source, "extra.txt"), "changed");
    assert.equal(
      promoteSkill({ ...base, now: "2026-06-12T00:00:00.000Z" }).action,
      "updated"
    );
    const history = readFileSync(join(repo, "skill-history.jsonl"), "utf8")
      .trim()
      .split("\n");
    assert.equal(history.length, 2);
    assert.equal(JSON.parse(history[1]).action, "updated");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dry-run does not write and source changes require an override", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-promote-"));
  try {
    const source = createSkill(root);
    const repo = join(root, "central");
    mkdirSync(repo);
    const base = {
      skill: { name: "demo", path: source, scope: "project" as const, agents: [] },
      repo,
      category: "development" as const,
      provenance: { source: "git@example/one.git", sourceType: "git" }
    };
    assert.equal(promoteSkill({ ...base, dryRun: true }).dryRun, true);
    assert.equal(existsSync(join(repo, "skill-registry.json")), false);
    promoteSkill(base);
    assert.throws(
      () =>
        promoteSkill({
          ...base,
          provenance: { source: "git@example/two.git", sourceType: "git" }
        }),
      /allow-source-change/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("temporary staging can be created on the destination filesystem", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-staging-"));
  try {
    const category = join(root, "skills", "development");
    mkdirSync(category, { recursive: true });
    const staging = makeTempDirectory(category);
    assert.equal(dirname(staging), category);
    assert.ok(staging.startsWith(category));
    removeTemp(staging);
    assert.equal(existsSync(staging), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
