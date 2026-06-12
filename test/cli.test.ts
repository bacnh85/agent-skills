import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { formatRegistryList, isCliEntrypoint, parseArgs } from "../src/cli.js";
import type { RegistryEntry } from "../src/types.js";

function registryEntry(overrides: Partial<RegistryEntry>): RegistryEntry {
  return {
    name: "example",
    path: "skills/example",
    source: "owner/repo",
    sourceType: "git",
    hash: "hash",
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    updatable: true,
    ...overrides
  };
}

test("parser accepts only add, remove, list, and update", () => {
  assert.deepEqual(parseArgs(["add", "./skills"]), {
    command: "add",
    values: ["./skills"]
  });
  assert.deepEqual(parseArgs(["remove", "a", "b"]), {
    command: "remove",
    values: ["a", "b"]
  });
  assert.deepEqual(parseArgs(["list"]), { command: "list", values: [] });
  assert.deepEqual(parseArgs(["update"]), { command: "update", values: [] });
  assert.throws(() => parseArgs(["promote"]), /Unknown command/);
  assert.throws(() => parseArgs(["add", "x", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["list", "-g"]), /Unknown option: -g/);
  assert.throws(() => parseArgs(["list", "extra"]), /does not accept arguments/);
});

test("registry list sorts entries and aligns labeled fields", () => {
  const output = formatRegistryList([
    registryEntry({
      name: "z",
      path: "skills/z",
      source: "long-owner/long-repository",
      ref: "main",
      commit: "1234567890abcdef",
      updatedAt: "2026-02-03T04:05:06.000Z"
    }),
    registryEntry({
      name: "alpha",
      path: "skills/category/alpha",
      source: "repo",
      ref: "dev",
      commit: "abcdef1234567890",
      updatedAt: "2026-01-02T03:04:05.000Z"
    })
  ]);
  const lines = output.split("\n");

  assert.equal(lines[0], "Project Skills");
  assert.equal(lines[1], "");
  assert.match(lines[2], /^alpha\s+skills\/category\/alpha\s+Source: repo/);
  assert.match(lines[3], /^z\s+skills\/z\s+Source: long-owner\/long-repository/);
  for (const label of ["Source:", "Ref:", "Commit:", "Updated:"]) {
    assert.equal(lines[2].indexOf(label), lines[3].indexOf(label));
  }
  assert.match(lines[2], /Commit: abcdef123456/);
  assert.match(lines[3], /Commit: 1234567890ab/);
});

test("registry list represents missing fields with fallbacks", () => {
  const output = formatRegistryList([
    registryEntry({
      source: "",
      ref: undefined,
      commit: undefined,
      updatedAt: ""
    })
  ]);

  assert.match(
    output,
    /Source: -\s+Ref: -\s+Commit: -\s+Updated: -/
  );
});

test("registry list reports an empty registry", () => {
  assert.equal(formatRegistryList([]), "No project skills found.");
});

test("CLI entrypoint detection follows install symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-"));
  try {
    const target = join(root, "package", "cli.js");
    const link = join(root, "bin", "agent-skills");
    mkdirSync(join(root, "package"), { recursive: true });
    mkdirSync(join(root, "bin"));
    writeFileSync(target, "#!/usr/bin/env node\n");
    symlinkSync(target, link);
    assert.equal(isCliEntrypoint(pathToFileURL(target).href, link), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
