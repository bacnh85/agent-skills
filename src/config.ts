import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const TARGET_REPO_ENV = "AGENT_SKILLS_REPO";

function parseDotenv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s#/);
      if (comment >= 0) value = value.slice(0, comment).trimEnd();
    }

    values[match[1]] = value;
  }

  return values;
}

function readDotenvValue(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return parseDotenv(readFileSync(path, "utf8"))[key];
}

function findConfiguredTargetRepo(options: {
  cwd: string;
  home: string;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (options.env[TARGET_REPO_ENV]) return options.env[TARGET_REPO_ENV];

  const paths = [
    join(options.cwd, ".env.local"),
    join(options.cwd, ".env"),
    join(options.cwd, ".agents", ".env.local"),
    join(options.cwd, ".agents", ".env"),
    join(options.home, ".agents", ".env.local"),
    join(options.home, ".agents", ".env")
  ];

  for (const path of paths) {
    const value = readDotenvValue(path, TARGET_REPO_ENV);
    if (value) return value;
  }

  return undefined;
}

export function resolveTargetRepo(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
} = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const configured = findConfiguredTargetRepo({ cwd, home, env });
  return resolve(cwd, configured || ".");
}

export function resolveInstallTarget(options: {
  cwd?: string;
  home?: string;
  global?: boolean;
} = {}): string {
  const root = options.global
    ? options.home ?? homedir()
    : options.cwd ?? process.cwd();
  return join(root, ".agents", "skills");
}
