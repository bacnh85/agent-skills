import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  applySelectionInput,
  createSelectionState,
  isCliEntrypoint,
  parseArgs,
  selectedSkills,
  shouldSelectInteractively,
  visibleSkills
} from "../src/cli.js";
import { defaultScope } from "../src/discovery.js";
import type { InstalledSkill } from "../src/types.js";

test("promotion searches all scopes by default while listing remains project-scoped", () => {
  assert.equal(defaultScope("promote"), "all");
  assert.equal(defaultScope("list"), "project");
});

test("positional promotion names bypass interactive selection", () => {
  const args = parseArgs(["promote", "demo"]);
  assert.equal(shouldSelectInteractively(args, true), false);
});

test("yes promotion without names bypasses interactive selection", () => {
  const args = parseArgs(["promote", "--yes"]);
  assert.equal(shouldSelectInteractively(args, true), false);
});

test("CLI entrypoint detection follows npm global install symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-"));
  try {
    const targetDirectory = join(root, "package", "dist", "src");
    const binDirectory = join(root, "bin");
    mkdirSync(targetDirectory, { recursive: true });
    mkdirSync(binDirectory);
    const target = join(targetDirectory, "cli.js");
    const link = join(binDirectory, "agent-skills");
    writeFileSync(target, "#!/usr/bin/env node\n");
    symlinkSync(target, link);
    assert.equal(isCliEntrypoint(pathToFileURL(target).href, link), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty or cancelled interactive selection returns no skills", () => {
  const installed: InstalledSkill[] = [
    { name: "demo", path: "/tmp/demo", scope: "project", agents: [] }
  ];
  let state = createSelectionState();
  state = applySelectionInput(installed, state, "\r");
  assert.deepEqual(selectedSkills(installed, state), []);

  state = createSelectionState();
  state = applySelectionInput(installed, state, "\u001b");
  assert.equal(state.cancelled, true);
  assert.deepEqual(selectedSkills(installed, state), []);
});

test("interactive multiselect filters by name and scope and returns selected skills", () => {
  const installed: InstalledSkill[] = [
    { name: "alpha", path: "/tmp/alpha", scope: "project", agents: [] },
    { name: "beta", path: "/tmp/beta", scope: "global", agents: [] },
    { name: "gamma", path: "/tmp/gamma", scope: "project", agents: [] }
  ];
  let state = createSelectionState();
  for (const key of "glob") state = applySelectionInput(installed, state, key);
  assert.deepEqual(visibleSkills(installed, state).map((skill) => skill.name), ["beta"]);
  state = applySelectionInput(installed, state, " ");
  state = applySelectionInput(installed, state, "\r");
  assert.deepEqual(selectedSkills(installed, state), [installed[1]]);
});

test("duplicate skill names across scopes remain ambiguous after selection", () => {
  const installed: InstalledSkill[] = [
    { name: "demo", path: "/tmp/project-demo", scope: "project", agents: [] },
    { name: "demo", path: "/tmp/global-demo", scope: "global", agents: [] }
  ];
  let state = createSelectionState();
  state = applySelectionInput(installed, state, " ");
  state = applySelectionInput(installed, state, "\u001b[B");
  state = applySelectionInput(installed, state, " ");
  const selected = selectedSkills(installed, state);
  const duplicateNames = selected
    .filter((skill, index, values) =>
      values.findIndex((candidate) => candidate.name === skill.name) !== index
    )
    .map((skill) => skill.name);
  assert.deepEqual([...new Set(duplicateNames)], ["demo"]);
});
