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
import { join } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { discoverSkills, resolveSource } from "../src/discovery.js";
import { addSkills, removeSkills, updateSkills } from "../src/manager.js";
import { readRegistry } from "../src/registry.js";

function createSkill(
  root: string,
  name: string,
  body = "initial",
  directoryName = name
): string {
  const path = join(root, "skills", directoryName);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${body}\n`
  );
  return path;
}

function createRootSkill(root: string, name: string, body = "initial"): string {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${body}\n`
  );
  return root;
}

test("add preserves vendor paths, no-ops unchanged sources, allows same-name sources, and records history", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-add-"));
  try {
    const sourceRoot = join(root, "source");
    createSkill(sourceRoot, "demo");
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    const selected = discoverSkills(source);
    assert.equal(addSkills({ repo, source, selected })[0].action, "added");
    assert.ok(existsSync(join(repo, "skills", "source", "demo", "SKILL.md")));
    assert.equal(addSkills({ repo, source, selected })[0].action, "unchanged");

    const otherRoot = join(root, "other");
    createSkill(otherRoot, "demo");
    const other = resolveSource(otherRoot);
    assert.equal(addSkills({ repo, source: other, selected: discoverSkills(other) })[0].action, "added");
    assert.ok(existsSync(join(repo, "skills", "other", "demo", "SKILL.md")));
    assert.equal(readFileSync(join(repo, "skill-history.jsonl"), "utf8").trim().split("\n").length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add installs root-level source skills under skills/name and preserves sourcePath", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-add-root-"));
  try {
    const sourceRoot = join(root, "source");
    createRootSkill(sourceRoot, "demo");
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    const selected = discoverSkills(source);

    assert.equal(selected[0].relativePath, ".");
    const added = addSkills({ repo, source, selected })[0];
    assert.equal(added.action, "added");
    assert.equal(added.path, "skills/source/demo");
    assert.ok(existsSync(join(repo, "skills", "source", "demo", "SKILL.md")));

    const entry = readRegistry(repo).skills["source/demo"];
    assert.equal(entry.path, "skills/source/demo");
    assert.equal(entry.sourcePath, ".");
    assert.equal(addSkills({ repo, source, selected })[0].action, "unchanged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add installs top-level source skill directories under skills/path", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-add-top-level-dir-"));
  try {
    const sourceRoot = join(root, "source");
    const skillPath = join(sourceRoot, "brave-search");
    mkdirSync(skillPath, { recursive: true });
    writeFileSync(
      join(skillPath, "SKILL.md"),
      "---\nname: brave-search\ndescription: Brave Search skill.\n---\n"
    );
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    const selected = discoverSkills(source);

    assert.equal(selected[0].relativePath, "brave-search");
    const added = addSkills({ repo, source, selected })[0];
    assert.equal(added.path, "skills/source/brave-search");
    assert.ok(existsSync(join(repo, "skills", "source", "brave-search", "SKILL.md")));

    const entry = readRegistry(repo).skills["source/brave-search"];
    assert.equal(entry.path, "skills/source/brave-search");
    assert.equal(entry.sourcePath, "brave-search");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("remove deletes named skills and writes a remove event", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-remove-"));
  try {
    const sourceRoot = join(root, "source");
    createSkill(sourceRoot, "demo");
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    addSkills({ repo, source, selected: discoverSkills(source) });
    assert.equal(removeSkills(repo, ["demo"])[0].action, "removed");
    assert.equal(existsSync(join(repo, "skills", "source", "demo")), false);
    assert.match(readFileSync(join(repo, "skill-history.jsonl"), "utf8"), /"action":"remove"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local update handles changed, unchanged, missing, and legacy entries", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-update-"));
  try {
    const sourceRoot = join(root, "source");
    const skillPath = createSkill(sourceRoot, "demo");
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    addSkills({ repo, source, selected: discoverSkills(source) });
    assert.equal(updateSkills(repo, ["demo"])[0].action, "unchanged");
    writeFileSync(
      join(skillPath, "SKILL.md"),
      "---\nname: demo\ndescription: demo skill.\n---\n\nchanged\n"
    );
    assert.equal(updateSkills(repo, ["demo"])[0].action, "updated");
    rmSync(skillPath, { recursive: true });
    assert.equal(updateSkills(repo, ["demo"])[0].action, "skipped");

    const registry = readRegistry(repo);
    registry.skills["source/demo"].updatable = false;
    writeFileSync(join(repo, "skill-registry.json"), JSON.stringify(registry));
    assert.match(updateSkills(repo, ["demo"])[0].message!, /re-added/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add and update preserve mismatched source directories", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-source-name-"));
  try {
    const sourceRoot = join(root, "source");
    const skillPath = createSkill(
      sourceRoot,
      "evaluating-llms-harness",
      "initial",
      "lm-evaluation-harness"
    );
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);

    assert.equal(
      addSkills({ repo, source, selected: discoverSkills(source) })[0].name,
      "evaluating-llms-harness"
    );
    const entry = readRegistry(repo).skills["source/lm-evaluation-harness"];
    assert.equal(entry.sourcePath, "skills/lm-evaluation-harness");
    assert.ok(existsSync(join(repo, "skills", "source", "lm-evaluation-harness", "SKILL.md")));

    writeFileSync(join(skillPath, "extra.txt"), "changed");
    assert.equal(updateSkills(repo, ["evaluating-llms-harness"])[0].action, "updated");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("update reports progress for each selected skill", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-update-progress-"));
  try {
    const sourceRoot = join(root, "source");
    createSkill(sourceRoot, "alpha");
    createSkill(sourceRoot, "beta");
    const repo = join(root, "target");
    const source = resolveSource(sourceRoot);
    addSkills({ repo, source, selected: discoverSkills(source) });
    const progress: string[] = [];

    updateSkills(repo, ["beta", "alpha"], (name, index, total) => {
      progress.push(`${name}:${index}/${total}`);
    });

    assert.deepEqual(progress, ["source/beta:1/2", "source/alpha:2/2"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("v1 registries migrate in memory and remain removable", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-v1-"));
  try {
    mkdirSync(join(root, "skills", "development", "demo"), { recursive: true });
    writeFileSync(
      join(root, "skill-registry.json"),
      JSON.stringify({
        version: 1,
        skills: {
          demo: {
            name: "demo",
            category: "development",
            hash: "abc",
            source: "unknown",
            sourceType: "git",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        }
      })
    );
    assert.equal(readRegistry(root).skills["development/demo"].updatable, false);
    removeSkills(root, ["demo"]);
    assert.equal(readRegistry(root).version, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("git updates follow the recorded branch to its latest commit", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-git-update-"));
  try {
    const upstream = join(root, "upstream");
    mkdirSync(upstream);
    execFileSync("git", ["init", "-b", "main"], { cwd: upstream });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: upstream });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: upstream });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: upstream });
    const skillPath = createSkill(upstream, "demo");
    execFileSync("git", ["add", "."], { cwd: upstream });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: upstream });

    const repo = join(root, "target");
    const source = resolveSource(`file://${upstream}#main`);
    try {
      addSkills({ repo, source, selected: discoverSkills(source) });
    } finally {
      source.cleanup();
    }
    const firstCommit = readRegistry(repo).skills["upstream/demo"].commit;

    writeFileSync(join(skillPath, "extra.txt"), "changed");
    execFileSync("git", ["add", "."], { cwd: upstream });
    execFileSync("git", ["commit", "-m", "change"], { cwd: upstream });
    assert.equal(updateSkills(repo, ["demo"])[0].action, "updated");
    assert.notEqual(readRegistry(repo).skills["upstream/demo"].commit, firstCommit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
