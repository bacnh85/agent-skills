import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "@bacnh85/agent-skills";
export const UPGRADE_COMMAND = `npm install -g ${PACKAGE_NAME}@latest`;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NPM_TIMEOUT_MS = 5_000;

export interface VersionCheckResult {
  current: string;
  latest?: string;
  updateAvailable: boolean;
  error?: Error;
}

export interface VersionCache {
  checkedAt: number;
  latest: string;
}

export interface VersionDependencies {
  now?: () => number;
  cachePath?: string;
  readFile?: (path: string) => string;
  writeFile?: (path: string, contents: string) => void;
  queryLatest?: () => string;
}

export interface UpgradeDependencies {
  confirm?: (message: string) => Promise<boolean>;
  install?: () => number;
  log?: (message: string) => void;
}

type NpmSpawn = (
  command: string,
  args: string[],
  options: { stdio: "inherit" }
) => { error?: Error; status: number | null };

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

function parseSemVer(value: string): SemVer | undefined {
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) return undefined;
  const prereleaseParts = match[4]?.split(".") ?? [];
  if (prereleaseParts.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
    return undefined;
  }
  const prerelease = prereleaseParts.map((part) =>
    /^\d+$/.test(part) ? Number(part) : part
  );
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseSemVer(left);
  const b = parseSemVer(right);
  if (!a || !b) throw new Error("Invalid semantic version.");
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length
        ? -1
        : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) {
      return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
    }
    if (aPart === bPart) continue;
    if (typeof aPart === "number" && typeof bPart === "string") return -1;
    if (typeof aPart === "string" && typeof bPart === "number") return 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

export function resolveCachePath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  const cacheRoot = env.XDG_CACHE_HOME || join(home, ".cache");
  return join(cacheRoot, "agent-skills", "version.json");
}

export function readCurrentVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifestPath = join(directory, "package.json");
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === PACKAGE_NAME && manifest.version) return manifest.version;
    } catch {
      // Continue upward until the package root is found.
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Unable to read installed package version.");
}

export function queryLatestVersion(): string {
  const output = execFileSync(
    "npm",
    ["view", PACKAGE_NAME, "version"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: NPM_TIMEOUT_MS
    }
  ).trim();
  if (!parseSemVer(output)) throw new Error("npm returned an invalid version.");
  return output;
}

export function checkForUpdate(
  current: string,
  options: VersionDependencies & { force?: boolean } = {}
): VersionCheckResult {
  const now = options.now?.() ?? Date.now();
  const cachePath = options.cachePath ?? resolveCachePath();
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const writeFile = options.writeFile ?? ((path: string, contents: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  });

  if (!options.force) {
    try {
      const cache = JSON.parse(readFile(cachePath)) as VersionCache;
      if (
        Number.isFinite(cache.checkedAt) &&
        now - cache.checkedAt < CACHE_TTL_MS &&
        parseSemVer(cache.latest)
      ) {
        return {
          current,
          latest: cache.latest,
          updateAvailable: compareVersions(current, cache.latest) < 0
        };
      }
    } catch {
      // A missing or invalid cache should trigger a fresh check.
    }
  }

  try {
    const latest = (options.queryLatest ?? queryLatestVersion)().trim();
    if (!parseSemVer(latest)) throw new Error("npm returned an invalid version.");
    try {
      writeFile(cachePath, JSON.stringify({ checkedAt: now, latest }) + "\n");
    } catch {
      // Cache failures must not affect CLI commands.
    }
    return {
      current,
      latest,
      updateAvailable: compareVersions(current, latest) < 0
    };
  } catch (error) {
    return {
      current,
      updateAvailable: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

export function installLatestVersion(
  spawn: NpmSpawn = spawnSync
): number {
  const result = spawn(
    "npm",
    ["install", "-g", `${PACKAGE_NAME}@latest`],
    { stdio: "inherit" }
  );
  return result.error ? 1 : result.status ?? 1;
}

export async function presentUpdate(
  result: VersionCheckResult,
  dependencies: UpgradeDependencies = {}
): Promise<number> {
  if (!result.updateAvailable || !result.latest) return 0;
  const log = dependencies.log ?? console.log;
  const approved = await (dependencies.confirm?.(
    `Update available: ${result.current} -> ${result.latest}. Install now?`
  ) ?? Promise.resolve(false));
  if (!approved) {
    log(`Update later with: ${UPGRADE_COMMAND}`);
    return 0;
  }
  return (dependencies.install ?? installLatestVersion)();
}
