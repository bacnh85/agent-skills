import { resolve } from "node:path";

export function resolveTargetRepo(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const configured = (options.env ?? process.env).AGENT_SKILLS_REPO;
  return resolve(cwd, configured || ".");
}
