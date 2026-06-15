import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  formatRegistryList,
  isCliEntrypoint,
  parseArgs,
  selectNamedSkills,
  shouldCheckForUpdates,
  usage
} from "../src/cli.js";
import type { RegistryEntry } from "../src/types.js";

const ansi = /\x1B\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ansi, "");
}

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
  assert.deepEqual(parseArgs(["add", "--skill", "alpha", "./skills"]), {
    command: "add",
    values: ["./skills"],
    skills: ["alpha"]
  });
  assert.deepEqual(
    parseArgs(["add", "./skills", "--skill", "beta", "--skill", "alpha", "--skill", "beta"]),
    {
      command: "add",
      values: ["./skills"],
      skills: ["beta", "alpha"]
    }
  );
  assert.deepEqual(parseArgs(["remove", "--skill", "a", "--skill", "b", "--skill", "a"]), {
    command: "remove",
    values: [],
    skills: ["a", "b"]
  });
  assert.deepEqual(parseArgs(["list"]), { command: "list", values: [] });
  assert.deepEqual(parseArgs(["version"]), { command: "version", values: [] });
  assert.deepEqual(parseArgs(["update"]), { command: "update", values: [] });
  assert.deepEqual(parseArgs(["update", "--skill", "b", "--skill", "a"]), {
    command: "update",
    values: [],
    skills: ["b", "a"]
  });
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
  assert.throws(() => parseArgs(["add", "x", "--skill"]), /requires a value/);
  assert.throws(() => parseArgs(["add", "--skill", "--all", "x"]), /requires a value/);
  assert.throws(() => parseArgs(["add", "x", "y"]), /Usage/);
  assert.throws(() => parseArgs(["remove", "demo"]), /Usage/);
  assert.throws(() => parseArgs(["update", "demo"]), /Usage/);
  assert.throws(() => parseArgs(["remove", "--skill"]), /requires a value/);
  assert.throws(() => parseArgs(["update", "--skill", "--all"]), /requires a value/);
  assert.throws(() => parseArgs(["remove", "--all"]), /Unknown option/);
  assert.throws(() => parseArgs(["update", "--all"]), /Unknown option/);
  assert.throws(() => parseArgs(["list", "-g"]), /Unknown option: -g/);
  assert.throws(() => parseArgs(["list", "extra"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["version", "extra"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["version", "--json"]), /Unknown option/);
  assert.throws(() => parseArgs(["install", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["install", "demo"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["uninstall", "--yes"]), /Unknown option/);
  assert.throws(
    () => parseArgs(["uninstall", "demo", "--all"]),
    /does not accept names with --all/
  );
});

test("named skill selection uses exact canonical names", () => {
  const discovered = [
    { name: "alpha", absolutePath: "/a", relativePath: "skills/a" },
    { name: "alpha", absolutePath: "/b", relativePath: "skills/b" },
    { name: "beta", absolutePath: "/c", relativePath: "skills/c" }
  ];
  assert.deepEqual(selectNamedSkills(discovered, ["beta"]), [discovered[2]]);
  assert.throws(() => selectNamedSkills(discovered, ["Beta"]), /not found: Beta/);
  assert.throws(() => selectNamedSkills(discovered, ["alpha"]), /ambiguous: alpha/);
});

function createCliSkill(root: string, directory: string, name: string): void {
  const skill = join(root, "skills", directory);
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n`
  );
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(
    process.execPath,
    [join(process.cwd(), "dist/src/cli.js"), ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function runAdd(cwd: string, source: string, names: string[]) {
  return runCli(cwd, [
    "add",
    source,
    ...names.flatMap((name) => ["--skill", name])
  ]);
}

test("add CLI selects one or multiple named skills without a TTY", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-add-named-"));
  try {
    const source = join(root, "source");
    createCliSkill(source, "alpha-dir", "alpha");
    createCliSkill(source, "beta-dir", "beta");

    const one = join(root, "one");
    mkdirSync(one);
    const oneResult = runAdd(one, source, ["beta"]);
    assert.equal(oneResult.status, 0, oneResult.stderr);
    assert.equal(existsSync(join(one, "skills", "alpha-dir")), false);
    assert.ok(existsSync(join(one, "skills", "beta-dir", "SKILL.md")));

    const multiple = join(root, "multiple");
    mkdirSync(multiple);
    const multipleResult = runAdd(multiple, source, ["beta", "alpha"]);
    assert.equal(multipleResult.status, 0, multipleResult.stderr);
    assert.ok(existsSync(join(multiple, "skills", "alpha-dir", "SKILL.md")));
    assert.ok(existsSync(join(multiple, "skills", "beta-dir", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add CLI rejects missing and ambiguous names before modifying the target", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-add-invalid-"));
  try {
    const missingSource = join(root, "missing-source");
    createCliSkill(missingSource, "alpha", "alpha");
    const missingTarget = join(root, "missing-target");
    mkdirSync(missingTarget);
    const missing = runAdd(missingTarget, missingSource, ["unknown"]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Skill not found: unknown/);
    assert.equal(existsSync(join(missingTarget, "skills")), false);

    const ambiguousSource = join(root, "ambiguous-source");
    createCliSkill(ambiguousSource, "first", "duplicate");
    createCliSkill(ambiguousSource, "second", "duplicate");
    const ambiguousTarget = join(root, "ambiguous-target");
    mkdirSync(ambiguousTarget);
    const ambiguous = runAdd(ambiguousTarget, ambiguousSource, ["duplicate"]);
    assert.notEqual(ambiguous.status, 0);
    assert.match(ambiguous.stderr, /Skill name is ambiguous: duplicate/);
    assert.equal(existsSync(join(ambiguousTarget, "skills")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("remove and update CLI use repeatable named skill flags", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-manage-named-"));
  try {
    const source = join(root, "source");
    createCliSkill(source, "alpha", "alpha");
    createCliSkill(source, "beta", "beta");
    const target = join(root, "target");
    mkdirSync(target);
    const added = runAdd(target, source, ["alpha", "beta"]);
    assert.equal(added.status, 0, added.stderr);

    writeFileSync(
      join(source, "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: alpha skill.\n---\n\nupdated\n"
    );
    writeFileSync(
      join(source, "skills", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: beta skill.\n---\n\nupdated\n"
    );
    const updated = runCli(target, ["update", "--skill", "alpha"]);
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(readFileSync(join(target, "skills", "alpha", "SKILL.md"), "utf8"), /updated/);
    assert.doesNotMatch(
      readFileSync(join(target, "skills", "beta", "SKILL.md"), "utf8"),
      /updated/
    );

    const removed = runCli(target, ["remove", "--skill", "beta"]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.ok(existsSync(join(target, "skills", "alpha", "SKILL.md")));
    assert.equal(existsSync(join(target, "skills", "beta")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage includes the version command", () => {
  assert.match(usage(), /agent-skills version/);
});

test("automatic update checks require successful interactive command context", () => {
  const command = parseArgs(["list"]);
  assert.equal(shouldCheckForUpdates(command, {}, true, true), true);
  assert.equal(shouldCheckForUpdates(command, { CI: "1" }, true, true), false);
  assert.equal(shouldCheckForUpdates(command, {}, false, true), false);
  assert.equal(shouldCheckForUpdates(command, {}, true, false), false);
  assert.equal(shouldCheckForUpdates(parseArgs([]), {}, true, true), false);
  assert.equal(shouldCheckForUpdates(parseArgs(["--help"]), {}, true, true), false);
  assert.equal(shouldCheckForUpdates(parseArgs(["version"]), {}, true, true), false);
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
  const lines = stripAnsi(output).split("\n");

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
    stripAnsi(output),
    /Source: -\s+Ref: -\s+Commit: -\s+Updated: -/
  );
});

test("registry list reports an empty registry", () => {
  assert.equal(stripAnsi(formatRegistryList([])), "No project skills found.");
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

test("package ships a built CLI entrypoint and skips legacy lifecycle hooks", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

  assert.equal(manifest.bin["agent-skills"], "./dist/src/cli.js");
  assert.equal(manifest.scripts.prepack, "npm run build");
  // Lifecycle scripts added by the "npm install -g GitHub shorthand" workaround
  // are no longer needed once the package is published to npm.
  assert.equal(manifest.scripts.install, undefined);
  assert.equal(manifest.scripts.prepare, undefined);
  // The shipped `files` allowlist must include the build output, skills, and README.
  assert.deepEqual(manifest.files, ["dist", "skills", "README.md"]);
});
