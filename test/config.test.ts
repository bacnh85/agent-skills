import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveInstallTarget, resolveTargetRepo } from "../src/config.js";

test("target repository uses environment then current working directory", () => {
  assert.equal(
    resolveTargetRepo({ cwd: "/work/project", env: { AGENT_SKILLS_REPO: "../central" } }),
    "/work/central"
  );
  assert.equal(resolveTargetRepo({ cwd: "/work/project", env: {}, home: "/home/user" }), "/work/project");
});

test("target repository reads AGENT_SKILLS_REPO from dotenv files by precedence", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-config-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  mkdirSync(join(cwd, ".agents"), { recursive: true });
  mkdirSync(join(home, ".agents"), { recursive: true });

  try {
    writeFileSync(join(home, ".agents", ".env"), "AGENT_SKILLS_REPO=home-env\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "home-env"));

    writeFileSync(join(home, ".agents", ".env.local"), "AGENT_SKILLS_REPO=home-local\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "home-local"));

    writeFileSync(join(cwd, ".agents", ".env"), "AGENT_SKILLS_REPO=agents-env\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "agents-env"));

    writeFileSync(join(cwd, ".agents", ".env.local"), "AGENT_SKILLS_REPO=agents-local\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "agents-local"));

    writeFileSync(join(cwd, ".env"), "AGENT_SKILLS_REPO=project-env\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "project-env"));

    writeFileSync(join(cwd, ".env.local"), "AGENT_SKILLS_REPO=project-local\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(cwd, "project-local"));

    assert.equal(
      resolveTargetRepo({ cwd, home, env: { AGENT_SKILLS_REPO: "from-process" } }),
      join(cwd, "from-process")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("target repository dotenv parser supports comments, exports, and quotes", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-config-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  mkdirSync(cwd, { recursive: true });

  try {
    writeFileSync(
      join(cwd, ".env.local"),
      "# ignored\nexport OTHER=value\nexport AGENT_SKILLS_REPO=\"../central repo\"\n"
    );
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(root, "central repo"));

    writeFileSync(join(cwd, ".env.local"), "AGENT_SKILLS_REPO=../central # comment\n");
    assert.equal(resolveTargetRepo({ cwd, home, env: {} }), join(root, "central"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install target resolves project and global skill directories", () => {
  assert.equal(
    resolveInstallTarget({ cwd: "/work/project" }),
    "/work/project/.agents/skills"
  );
  assert.equal(
    resolveInstallTarget({ global: true, home: "/home/user" }),
    "/home/user/.agents/skills"
  );
});
