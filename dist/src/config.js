import { homedir } from "node:os";
import { join, resolve } from "node:path";
export function resolveTargetRepo(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const configured = (options.env ?? process.env).AGENT_SKILLS_REPO;
    return resolve(cwd, configured || ".");
}
export function resolveInstallTarget(options = {}) {
    const root = options.global
        ? options.home ?? homedir()
        : options.cwd ?? process.cwd();
    return join(root, ".agents", "skills");
}
//# sourceMappingURL=config.js.map