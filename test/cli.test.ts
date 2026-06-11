import assert from "node:assert/strict";
import test from "node:test";
import { defaultScope } from "../src/discovery.js";

test("promotion searches all scopes by default while listing remains project-scoped", () => {
  assert.equal(defaultScope("promote"), "all");
  assert.equal(defaultScope("list"), "project");
});
