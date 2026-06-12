import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverSkills } from "../src/discovery.js";

test("discovery rejects symlinks that escape the source", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-safe-"));
  try {
    const source = join(root, "source");
    const skill = join(source, "skills", "demo");
    mkdirSync(skill, { recursive: true });
    writeFileSync(
      join(skill, "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill.\n---\n"
    );
    writeFileSync(join(root, "secret"), "secret");
    symlinkSync(join(root, "secret"), join(skill, "escape"));
    assert.throws(
      () =>
        discoverSkills({
          source,
          sourceType: "local",
          root: source,
          cleanup() {}
        }),
      /Unsafe symlink/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
