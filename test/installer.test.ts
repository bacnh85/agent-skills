import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverSkills, resolveSource } from "../src/discovery.js";
import {
  discoverInstalledSkills,
  installSkills,
  uninstallSkills
} from "../src/installer.js";
import { readSkillLock } from "../src/lock.js";
import type { DiscoveredSkill } from "../src/types.js";

function createSkill(root: string, relativePath: string, name: string, body: string): void {
  const path = join(root, relativePath);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${body}\n`
  );
}

test("install flattens nested skills and preserves unrelated destinations", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-install-"));
  try {
    const repo = join(root, "repo");
    createSkill(repo, "skills/development/demo", "demo", "first");
    createSkill(repo, "skills/productivity/notes", "notes", "notes");
    const source = resolveSource(join(repo, "skills"));
    const target = join(root, "project", ".agents", "skills");
    createSkill(target, "custom", "custom", "custom");

    const results = installSkills(target, discoverSkills(source));

    assert.deepEqual(
      results.map((result) => [result.name, result.action]),
      [["demo", "added"], ["notes", "added"]]
    );
    assert.ok(existsSync(join(target, "demo", "SKILL.md")));
    assert.ok(existsSync(join(target, "notes", "SKILL.md")));
    assert.ok(existsSync(join(target, "custom", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install uses the declared skill name for mismatched source directories", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-install-name-"));
  try {
    const repo = join(root, "repo");
    createSkill(
      repo,
      "skills/lm-evaluation-harness",
      "evaluating-llms-harness",
      "content"
    );
    const target = join(root, "target");

    const result = installSkills(
      target,
      discoverSkills(resolveSource(join(repo, "skills")))
    )[0];

    assert.equal(result.name, "evaluating-llms-harness");
    assert.ok(existsSync(join(target, "evaluating-llms-harness", "SKILL.md")));
    assert.equal(existsSync(join(target, "lm-evaluation-harness")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install atomically replaces selected existing skills", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-reinstall-"));
  try {
    const repo = join(root, "repo");
    createSkill(repo, "skills/demo", "demo", "new");
    const target = join(root, "target");
    createSkill(target, "demo", "demo", "old");
    writeFileSync(join(target, "demo", "stale.txt"), "stale");
    const source = resolveSource(join(repo, "skills"));

    const result = installSkills(target, discoverSkills(source))[0];

    assert.equal(result.action, "updated");
    assert.match(readFileSync(join(target, "demo", "SKILL.md"), "utf8"), /new/);
    assert.equal(existsSync(join(target, "demo", "stale.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install writes lock metadata and discovery enriches installed skills", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-install-lock-"));
  try {
    const repo = join(root, "repo");
    createSkill(repo, "skills/vendor/demo", "demo", "demo");
    const source = resolveSource(join(repo, "skills"));
    const target = join(root, "target");
    const skills = discoverSkills(source);

    installSkills(target, skills, {
      "vendor/demo": {
        id: "vendor/demo",
        vendor: "vendor",
        name: "demo",
        source: "https://github.com/vendor/repo.git",
        sourceType: "git",
        sourcePath: "skills/vendor/demo",
        ref: "main",
        commit: "0123456789abcdef",
        hash: "hash"
      }
    });

    const lock = readSkillLock(target).skills["vendor/demo"];
    assert.equal(lock.path, "demo");
    assert.equal(lock.installedAt, lock.updatedAt);
    assert.equal(discoverInstalledSkills(target)[0].id, "vendor/demo");
    assert.equal(discoverInstalledSkills(target)[0].source, "https://github.com/vendor/repo.git");

    uninstallSkills(target, ["demo"]);
    assert.equal(readSkillLock(target).skills["vendor/demo"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install rejects duplicate skill names before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-install-duplicates-"));
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    createSkill(first, "demo", "demo", "first");
    createSkill(second, "demo", "demo", "second");
    const skills: DiscoveredSkill[] = [
      { name: "demo", absolutePath: join(first, "demo"), relativePath: "first/demo" },
      { name: "demo", absolutePath: join(second, "demo"), relativePath: "second/demo" }
    ];
    const target = join(root, "target");

    assert.throws(() => installSkills(target, skills), /Duplicate skill name/);
    assert.equal(existsSync(join(target, "demo")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installed skill discovery accepts only valid immediate directories", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-uninstall-discovery-"));
  try {
    const target = join(root, ".agents", "skills");
    createSkill(target, "demo", "demo", "demo");
    createSkill(target, "nested/notes", "notes", "notes");
    mkdirSync(join(target, "invalid"), { recursive: true });
    writeFileSync(join(target, "file.txt"), "unrelated");
    symlinkSync(join(target, "demo"), join(target, "linked"));

    assert.deepEqual(
      discoverInstalledSkills(target).map((skill) => skill.name),
      ["demo"]
    );
    assert.deepEqual(discoverInstalledSkills(join(root, "missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall removes selected skills and preserves other target entries", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-uninstall-selected-"));
  try {
    const target = join(root, ".agents", "skills");
    createSkill(target, "demo", "demo", "demo");
    createSkill(target, "notes", "notes", "notes");
    writeFileSync(join(target, "unrelated.txt"), "keep");

    const results = uninstallSkills(target, ["demo"]);

    assert.deepEqual(results, [{
      name: "demo",
      action: "removed",
      path: join(target, "demo")
    }]);
    assert.equal(existsSync(join(target, "demo")), false);
    assert.ok(existsSync(join(target, "notes", "SKILL.md")));
    assert.ok(existsSync(join(target, "unrelated.txt")));
    assert.ok(existsSync(target));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall removes all discovered skills from a global target", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-uninstall-all-"));
  try {
    const target = join(root, "home", ".agents", "skills");
    createSkill(target, "demo", "demo", "demo");
    createSkill(target, "notes", "notes", "notes");
    const names = discoverInstalledSkills(target).map((skill) => skill.name);

    uninstallSkills(target, names);

    assert.equal(discoverInstalledSkills(target).length, 0);
    assert.ok(existsSync(target));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall reports every missing name before mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-uninstall-missing-"));
  try {
    const target = join(root, "target");
    createSkill(target, "demo", "demo", "demo");

    assert.throws(
      () => uninstallSkills(target, ["demo", "missing", "also-missing"]),
      /missing, also-missing/
    );
    assert.ok(existsSync(join(target, "demo", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall restores moved skills when a transaction operation fails", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-uninstall-rollback-"));
  try {
    const target = join(root, "target");
    createSkill(target, "demo", "demo", "demo");
    createSkill(target, "notes", "notes", "notes");
    let moves = 0;

    assert.throws(
      () => uninstallSkills(target, ["demo", "notes"], {
        rename(source, destination) {
          moves += 1;
          if (moves === 2) throw new Error("simulated failure");
          renameSync(source, destination);
        },
        remove(path) {
          rmSync(path, { recursive: true, force: true });
        }
      }),
      /simulated failure/
    );
    assert.ok(existsSync(join(target, "demo", "SKILL.md")));
    assert.ok(existsSync(join(target, "notes", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
