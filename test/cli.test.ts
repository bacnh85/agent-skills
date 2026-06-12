import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  duplicateSkillNames,
  isCliEntrypoint,
  parseArgs,
  shouldSelectInteractively,
  shouldUsePromoteUI
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

test("non-TTY promotion bypasses interactive selection", () => {
  const args = parseArgs(["promote"]);
  assert.equal(shouldSelectInteractively(args, false), false);
});

test("JSON promotion suppresses branded UI", () => {
  assert.equal(shouldUsePromoteUI(parseArgs(["promote", "--json"]), true), false);
  assert.equal(shouldUsePromoteUI(parseArgs(["promote"]), true), true);
  assert.equal(shouldUsePromoteUI(parseArgs(["list"]), true), false);
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

test("duplicate skill names across scopes remain ambiguous after selection", () => {
  const installed: InstalledSkill[] = [
    { name: "demo", path: "/tmp/project-demo", scope: "project", agents: [] },
    { name: "demo", path: "/tmp/global-demo", scope: "global", agents: [] }
  ];
  assert.deepEqual(duplicateSkillNames(installed), ["demo"]);
});
