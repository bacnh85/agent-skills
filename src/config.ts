import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveTargetRepo(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const configured = (options.env ?? process.env).AGENT_SKILLS_REPO;
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
