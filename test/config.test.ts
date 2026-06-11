import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveCentralRepo } from "../src/config.js";

test("repository configuration follows flag, environment, project, global precedence", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-config-"));
  try {
    const project = join(root, "project");
    const child = join(project, "nested");
    const home = join(root, "home");
    mkdirSync(child, { recursive: true });
    mkdirSync(join(home, ".agents"), { recursive: true });
    writeFileSync(join(project, ".env"), "AGENT_SKILLS_REPO=./central\n");
    writeFileSync(join(home, ".agents", ".env"), `AGENT_SKILLS_REPO=${join(root, "global")}\n`);

    assert.equal(resolveCentralRepo({ repo: join(root, "flag"), cwd: child, home }), join(root, "flag"));
    assert.equal(
      resolveCentralRepo({ env: { AGENT_SKILLS_REPO: join(root, "env") }, cwd: child, home }),
      join(root, "env")
    );
    assert.equal(resolveCentralRepo({ env: {}, cwd: child, home }), join(project, "central"));
    rmSync(join(project, ".env"));
    assert.equal(resolveCentralRepo({ env: {}, cwd: child, home }), join(root, "global"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
