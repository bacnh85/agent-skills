import assert from "node:assert/strict";
import test from "node:test";
import { resolveInstallTarget, resolveTargetRepo } from "../src/config.js";

test("target repository uses environment then current working directory", () => {
  assert.equal(
    resolveTargetRepo({ cwd: "/work/project", env: { AGENT_SKILLS_REPO: "../central" } }),
    "/work/central"
  );
  assert.equal(resolveTargetRepo({ cwd: "/work/project", env: {} }), "/work/project");
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
