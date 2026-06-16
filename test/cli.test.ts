import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  formatInstalledList,
  formatRegistryList,
  isCliEntrypoint,
  listProjectSkills,
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
  assert.deepEqual(parseArgs(["add", "./skills", "-s", "alpha"]), {
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
  assert.deepEqual(parseArgs(["remove", "-s", "alpha"]), {
    command: "remove",
    values: [],
    skills: ["alpha"]
  });
  assert.deepEqual(parseArgs(["list"]), { command: "list", values: [] });
  assert.deepEqual(parseArgs(["list", "--installed"]), {
    command: "list",
    values: [],
    installed: true,
    global: false
  });
  assert.deepEqual(parseArgs(["list", "--installed", "-g"]), {
    command: "list",
    values: [],
    installed: true,
    global: true
  });
  assert.deepEqual(parseArgs(["list", "--installed", "--global"]), {
    command: "list",
    values: [],
    installed: true,
    global: true
  });
  assert.deepEqual(parseArgs(["version"]), { command: "version", values: [] });
  assert.deepEqual(parseArgs(["update"]), { command: "update", values: [] });
  assert.deepEqual(parseArgs(["update", "--skill", "b", "--skill", "a"]), {
    command: "update",
    values: [],
    skills: ["b", "a"]
  });
  assert.deepEqual(parseArgs(["update", "-s", "alpha"]), {
    command: "update",
    values: [],
    skills: ["alpha"]
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
  assert.deepEqual(parseArgs(["install", "--global", "--all"]), {
    command: "install",
    values: [],
    all: true,
    global: true
  });
  assert.deepEqual(parseArgs(["uninstall", "--skill", "demo", "-g", "--skill", "notes"]), {
    command: "uninstall",
    values: [],
    skills: ["demo", "notes"],
    all: false,
    global: true
  });
  assert.deepEqual(parseArgs(["uninstall", "--global", "-s", "alpha"]), {
    command: "uninstall",
    values: [],
    skills: ["alpha"],
    all: false,
    global: true
  });
  assert.deepEqual(
    parseArgs(["uninstall", "-g", "--skill", "notes", "--skill", "demo", "--skill", "notes"]),
    {
      command: "uninstall",
      values: [],
      skills: ["notes", "demo"],
      all: false,
      global: true
    }
  );
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
  assert.throws(() => parseArgs(["list", "--global"]), /Unknown option: --global/);
  assert.throws(() => parseArgs(["list", "extra"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["version", "extra"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["version", "--json"]), /Unknown option/);
  assert.throws(() => parseArgs(["install", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["install", "demo"]), /does not accept arguments/);
  assert.throws(() => parseArgs(["uninstall", "--yes"]), /Unknown option/);
  assert.throws(() => parseArgs(["uninstall", "demo"]), /Usage/);
  assert.throws(() => parseArgs(["uninstall", "--skill"]), /requires a value/);
  assert.throws(() => parseArgs(["uninstall", "--skill", "-g"]), /requires a value/);
  assert.throws(
    () => parseArgs(["uninstall", "--skill", "demo", "--all"]),
    /does not accept --skill with --all/
  );
  assert.throws(
    () => parseArgs(["uninstall", "--all", "--skill", "demo"]),
    /does not accept --skill with --all/
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

function createCliRootSkill(root: string, name: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\n`
  );
}

function runCli(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    [join(process.cwd(), "dist/src/cli.js"), ...args],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env
    }
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

test("add CLI installs a top-level local skill under skills/name", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-add-root-"));
  try {
    const source = join(root, "source");
    createCliRootSkill(source, "root-demo");
    const target = join(root, "target");
    mkdirSync(target);

    const result = runCli(target, ["add", source, "-s", "root-demo"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(target, "skills", "root-demo", "SKILL.md")));
    const registry = JSON.parse(readFileSync(join(target, "skill-registry.json"), "utf8"));
    assert.equal(registry.skills["root-demo"].path, "skills/root-demo");
    assert.equal(registry.skills["root-demo"].sourcePath, ".");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installed list formatter reports empty and sorted installed skills", () => {
  const output = stripAnsi(formatInstalledList([
    { name: "zeta", absolutePath: "/tmp/zeta", relativePath: "zeta" },
    { name: "alpha", absolutePath: "/tmp/alpha", relativePath: "alpha" }
  ], "/tmp/skills"));

  assert.match(output, /^Installed Skills\n\nalpha\s+\/tmp\/alpha\nzeta\s+\/tmp\/zeta/m);
  assert.equal(
    stripAnsi(formatInstalledList([], "/tmp/skills")),
    "No installed skills found in /tmp/skills."
  );
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

test("uninstall CLI uses repeatable named skill flags for project and global targets", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-uninstall-named-"));
  try {
    const project = join(root, "project");
    mkdirSync(project);
    createCliSkill(join(project, ".agents"), "alpha", "alpha");
    createCliSkill(join(project, ".agents"), "beta", "beta");

    const projectResult = runCli(project, ["uninstall", "--skill", "alpha"]);
    assert.equal(projectResult.status, 0, projectResult.stderr);
    assert.equal(existsSync(join(project, ".agents", "skills", "alpha")), false);
    assert.ok(existsSync(join(project, ".agents", "skills", "beta", "SKILL.md")));

    const home = join(root, "home");
    createCliSkill(join(home, ".agents"), "alpha", "alpha");
    createCliSkill(join(home, ".agents"), "beta", "beta");

    const globalResult = runCli(
      project,
      ["uninstall", "-g", "--skill", "beta"],
      { HOME: home }
    );
    assert.equal(globalResult.status, 0, globalResult.stderr);
    assert.ok(existsSync(join(home, ".agents", "skills", "alpha", "SKILL.md")));
    assert.equal(existsSync(join(home, ".agents", "skills", "beta")), false);
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

test("project list discovers valid nested skills and enriches registry entries", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-list-project-"));
  try {
    createCliSkill(root, "frontend-design", "frontend-design");
    createCliSkill(root, "agent-tooling/promote-skills", "promote-skills");
    mkdirSync(join(root, "skills", "not-a-skill", "agents"), { recursive: true });

    const registered = registryEntry({
      name: "frontend-design",
      path: "skills/frontend-design"
    });
    const entries = listProjectSkills(root, {
      version: 2,
      skills: { "frontend-design": registered }
    });

    assert.deepEqual(
      entries.map((entry) => [entry.name, entry.path, entry.source]),
      [
        ["promote-skills", "skills/agent-tooling/promote-skills", ""],
        ["frontend-design", "skills/frontend-design", "owner/repo"]
      ]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("list CLI includes valid skills missing from the registry", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-list-disk-"));
  try {
    createCliSkill(root, "agent-tooling/promote-skills", "promote-skills");

    const result = runCli(root, ["list"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      stripAnsi(result.stdout),
      /promote-skills\s+skills\/agent-tooling\/promote-skills/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("list CLI can show project and global installed skills", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-skills-cli-list-installed-"));
  try {
    const project = join(root, "project");
    mkdirSync(project);
    createCliSkill(join(project, ".agents"), "beta", "beta");
    createCliSkill(join(project, ".agents"), "alpha", "alpha");

    const projectResult = runCli(project, ["list", "--installed"]);
    assert.equal(projectResult.status, 0, projectResult.stderr);
    const projectOutput = stripAnsi(projectResult.stdout);
    assert.match(projectOutput, /Installed Skills/);
    assert.match(projectOutput, /alpha\s+.*\.agents\/skills\/alpha/);
    assert.match(projectOutput, /beta\s+.*\.agents\/skills\/beta/);
    assert.ok(projectOutput.indexOf("alpha") < projectOutput.indexOf("beta"));

    const home = join(root, "home");
    createCliSkill(join(home, ".agents"), "global-alpha", "global-alpha");
    const globalResult = runCli(
      project,
      ["list", "--installed", "--global"],
      { HOME: home }
    );
    assert.equal(globalResult.status, 0, globalResult.stderr);
    assert.match(
      stripAnsi(globalResult.stdout),
      /global-alpha\s+.*\.agents\/skills\/global-alpha/
    );

    const globalShortResult = runCli(
      project,
      ["list", "--installed", "-g"],
      { HOME: home }
    );
    assert.equal(globalShortResult.status, 0, globalShortResult.stderr);
    assert.match(
      stripAnsi(globalShortResult.stdout),
      /global-alpha\s+.*\.agents\/skills\/global-alpha/
    );

    const empty = join(root, "empty");
    mkdirSync(empty);
    const emptyResult = runCli(empty, ["list", "--installed"]);
    assert.equal(emptyResult.status, 0, emptyResult.stderr);
    assert.match(stripAnsi(emptyResult.stdout), /No installed skills found in .*\.agents\/skills\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
