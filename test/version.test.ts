import assert from "node:assert/strict";
import test from "node:test";
import {
  CACHE_TTL_MS,
  PACKAGE_NAME,
  UPGRADE_COMMAND,
  checkForUpdate,
  compareVersions,
  createNpmInvocation,
  installLatestVersion,
  presentUpdate,
  resolveCachePath,
  resolveNpmCommand,
  resolveWindowsCommandShell
} from "../src/version.js";

test("semantic versions compare stable and prerelease releases", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta"), -1);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.11"), -1);
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0+build.1", "1.0.0+build.2"), 0);
  assert.throws(() => compareVersions("latest", "1.0.0"), /Invalid semantic version/);
  assert.throws(() => compareVersions("1.0.0-01", "1.0.0"), /Invalid semantic version/);
});

test("cache path respects XDG_CACHE_HOME and falls back to the home cache", () => {
  assert.equal(
    resolveCachePath({ XDG_CACHE_HOME: "/cache" }, "/home/user"),
    "/cache/agent-skills/version.json"
  );
  assert.equal(
    resolveCachePath({}, "/home/user"),
    "/home/user/.cache/agent-skills/version.json"
  );
});

test("fresh successful cache avoids npm and identifies available updates", () => {
  let queried = false;
  const result = checkForUpdate("1.0.0", {
    now: () => 2 * CACHE_TTL_MS,
    cachePath: "/cache/version.json",
    readFile: () =>
      JSON.stringify({
        checkedAt: 2 * CACHE_TTL_MS - CACHE_TTL_MS + 1,
        latest: "1.1.0"
      }),
    queryLatest: () => {
      queried = true;
      return "9.0.0";
    }
  });
  assert.equal(queried, false);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.latest, "1.1.0");
});

test("stale cache refreshes and writes successful npm results", () => {
  let written = "";
  const result = checkForUpdate("2.0.0", {
    now: () => 2 * CACHE_TTL_MS,
    cachePath: "/cache/version.json",
    readFile: () =>
      JSON.stringify({ checkedAt: CACHE_TTL_MS - 1, latest: "1.0.0" }),
    writeFile: (_path, contents) => {
      written = contents;
    },
    queryLatest: () => "1.9.0"
  });
  assert.equal(result.updateAvailable, false);
  assert.equal(result.latest, "1.9.0");
  assert.match(written, /"latest":"1.9.0"/);
});

test("forced checks ignore fresh cache", () => {
  const result = checkForUpdate("1.0.0", {
    force: true,
    readFile: () => JSON.stringify({ checkedAt: Date.now(), latest: "1.0.0" }),
    writeFile: () => {},
    queryLatest: () => "1.2.0"
  });
  assert.equal(result.latest, "1.2.0");
});

test("npm, malformed output, and cache failures remain non-throwing", () => {
  const failed = checkForUpdate("1.0.0", {
    readFile: () => {
      throw new Error("read failed");
    },
    writeFile: () => {
      throw new Error("write failed");
    },
    queryLatest: () => {
      throw new Error("timeout");
    }
  });
  assert.equal(failed.updateAvailable, false);
  assert.match(failed.error?.message ?? "", /timeout/);

  const malformed = checkForUpdate("1.0.0", {
    readFile: () => {
      throw new Error("missing");
    },
    writeFile: () => {},
    queryLatest: () => "not-a-version"
  });
  assert.match(malformed.error?.message ?? "", /invalid version/i);

  const writeFailure = checkForUpdate("1.0.0", {
    readFile: () => {
      throw new Error("missing");
    },
    writeFile: () => {
      throw new Error("read only");
    },
    queryLatest: () => "1.0.0"
  });
  assert.equal(writeFailure.error, undefined);
});

test("deferred update prints the exact npm command", async () => {
  const output: string[] = [];
  const status = await presentUpdate(
    { current: "1.0.0", latest: "1.1.0", updateAvailable: true },
    {
      confirm: async () => false,
      log: (message) => output.push(message)
    }
  );
  assert.equal(status, 0);
  assert.deepEqual(output, [`Update later with: ${UPGRADE_COMMAND}`]);
});

test("approved update invokes the installer and returns its status", async () => {
  let installed = false;
  const status = await presentUpdate(
    { current: "1.0.0", latest: "1.1.0", updateAvailable: true },
    {
      confirm: async (message) => {
        assert.match(message, /1\.0\.0 -> 1\.1\.0/);
        return true;
      },
      install: () => {
        installed = true;
        return 7;
      }
    }
  );
  assert.equal(installed, true);
  assert.equal(status, 7);
  assert.equal(UPGRADE_COMMAND, `npm install -g ${PACKAGE_NAME}@latest`);
});

test("npm command resolves to npm.cmd on Windows and npm elsewhere", () => {
  assert.equal(resolveNpmCommand("win32"), "npm.cmd");
  assert.equal(resolveNpmCommand("darwin"), "npm");
  assert.equal(resolveNpmCommand("linux"), "npm");
});

test("Windows npm invocations run through cmd.exe", () => {
  assert.equal(resolveWindowsCommandShell({ ComSpec: "C:\\Windows\\cmd.exe" }), "C:\\Windows\\cmd.exe");
  assert.deepEqual(
    createNpmInvocation(
      ["view", PACKAGE_NAME, "version"],
      "npm.cmd",
      "win32",
      { ComSpec: "C:\\Windows\\cmd.exe" }
    ),
    {
      command: "C:\\Windows\\cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd view ${PACKAGE_NAME} version`]
    }
  );
});

test("global upgrade uses npm latest with inherited stdio", () => {
  let invocation: unknown[] = [];
  const status = installLatestVersion((command, args, options) => {
    invocation = [command, args, options];
    return { status: 0 };
  }, "npm", "linux");

  assert.equal(status, 0);
  assert.deepEqual(invocation, [
    "npm",
    ["install", "-g", `${PACKAGE_NAME}@latest`],
    { stdio: "inherit" }
  ]);
});
