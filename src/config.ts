import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function findProjectEnv(start: string): string | undefined {
  let current = resolve(start);
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveCentralRepo(options: {
  repo?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
} = {}): string {
  if (options.repo) return resolve(options.repo);
  const env = options.env ?? process.env;
  if (env.AGENT_SKILLS_REPO) return resolve(env.AGENT_SKILLS_REPO);

  const projectEnv = findProjectEnv(options.cwd ?? process.cwd());
  if (projectEnv) {
    const projectValue = parseEnvFile(projectEnv).AGENT_SKILLS_REPO;
    if (projectValue) return resolve(dirname(projectEnv), projectValue);
  }

  const globalEnv = join(options.home ?? homedir(), ".agents", ".env");
  const globalValue = parseEnvFile(globalEnv).AGENT_SKILLS_REPO;
  if (globalValue) return resolve(globalValue);

  throw new Error(
    "Central repository is not configured. Set AGENT_SKILLS_REPO, add it to the nearest .env or ~/.agents/.env, or pass --repo."
  );
}
