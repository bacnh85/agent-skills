import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("parser accepts repository management and install commands", () => {
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
  assert.deepEqual(parseArgs(["install"]), {
    command: "install",
    values: [],
    all: false,
    global: false
  });
  assert.deepEqual(parseArgs(["install", "-g", "--all"]), {
    command: "install",
    values: [],
    all: true,
    global: true
  });
  assert.deepEqual(parseArgs(["uninstall", "demo", "notes", "-g"]), {
    command: "uninstall",
    values: ["demo", "notes"],
    all: false,
    global: true
  });
  assert.deepEqual(parseArgs(["uninstall"]), {
    command: "uninstall",
    values: [],
    all: false,
    global: false
  });
  assert.deepEqual(parseArgs(["uninstall", "--all", "-g"]), {
    command: "uninstall",
    values: [],
    all: true,
    global: true
  });
  assert.throws(() => parseArgs(["promote"]), /Unknown command/);
  assert.throws(() => parseArgs(["add", "x", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["list", "-g"]), /Unknown option: -g/);
  assert.throws(() => parseArgs(["list", "extra"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["install", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["install", "demo"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["uninstall", "--yes"]), /Unknown option/);
  assert.throws(
    () => parseArgs(["uninstall", "demo", "--all"]),
    /does not accept names with --all/
  );
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

test("uninstall CLI reports empty targets before requiring interactive input", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-uninstall-empty-"));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [join(process.cwd(), "dist/src/cli.js"), "uninstall"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }),
      /No installed skills found/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall CLI rejects interactive selection without a TTY", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-uninstall-tty-"));
  try {
    const skill = join(root, ".agents", "skills", "demo");
    mkdirSync(skill, { recursive: true });
    writeFileSync(
      join(skill, "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill.\n---\n"
    );
    assert.throws(
      () => execFileSync(process.execPath, [join(process.cwd(), "dist/src/cli.js"), "uninstall"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }),
      /Interactive skill selection requires a TTY/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("package has a git-install-safe prepare script and committed CLI entrypoint", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

  assert.equal(manifest.scripts.prepare, "node scripts/prepare-package.cjs");
  assert.equal(manifest.scripts.prepack, "npm run build");
  assert.equal(manifest.bin["agent-skills"], "./dist/src/cli.js");
});
