import assert from "node:assert/strict";
import test from "node:test";
import { resolveTargetRepo } from "../src/config.js";

test("target repository uses environment then current working directory", () => {
  assert.equal(
    resolveTargetRepo({ cwd: "/work/project", env: { AGENT_SKILLS_REPO: "../central" } }),
    "/work/central"
  );
  assert.equal(resolveTargetRepo({ cwd: "/work/project", env: {} }), "/work/project");
});
