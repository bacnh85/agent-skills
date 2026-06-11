import assert from "node:assert/strict";
import test from "node:test";
import { inferCategory } from "../src/skill.js";

test("category inference identifies strong matches and flags weak matches", () => {
  assert.deepEqual(
    inferCategory("Deploy cloud infrastructure and monitor incident logs."),
    { category: "operations", confident: true }
  );
  assert.deepEqual(inferCategory("Take a note."), {
    category: "productivity",
    confident: false
  });
});
