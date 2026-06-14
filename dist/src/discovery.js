import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { validateSkill } from "./skill.js";
const STANDARD_CONTAINERS = ["skills", ".agents/skills", ".claude/skills", ".codex/skills"];
function normalizeRelativePath(value) {
    const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!normalized || normalized.split("/").some((part) => part === ".." || part === ".")) {
        throw new Error(`Unsafe source path: ${value}`);
    }
    return normalized;
}
export function parseSource(source, cwd = process.cwd()) {
    const local = resolve(cwd, source);
    if (source.startsWith(".") ||
        source.startsWith("/") ||
        source.startsWith("~") ||
        /^[A-Za-z]:[\\/]/.test(source) ||
        existsSync(local)) {
        return { type: "local", normalized: realpathSync(local), localPath: realpathSync(local) };
    }
    const github = source.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/);
    if (github) {
        const [, owner, repo, ref, path] = github;
        return {
            type: "git",
            normalized: `https://github.com/${owner}/${repo}.git`,
            cloneUrl: `https://github.com/${owner}/${repo}.git`,
            ref,
            directPath: path ? normalizeRelativePath(path) : undefined
        };
    }
    const shorthand = source.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#(.+))?$/);
    if (shorthand) {
        const [, owner, repo, ref] = shorthand;
        return {
            type: "git",
            normalized: `https://github.com/${owner}/${repo.replace(/\.git$/, "")}.git`,
            cloneUrl: `https://github.com/${owner}/${repo.replace(/\.git$/, "")}.git`,
            ref
        };
    }
    if (/^(?:git@|ssh:\/\/|git:\/\/|https?:\/\/|file:\/\/)/.test(source) ||
        source.endsWith(".git")) {
        const hash = source.lastIndexOf("#");
        const cloneUrl = hash > source.indexOf("://") + 2 ? source.slice(0, hash) : source;
        const ref = cloneUrl === source ? undefined : source.slice(hash + 1);
        return { type: "git", normalized: cloneUrl, cloneUrl, ref };
    }
    throw new Error(`Unsupported source: ${source}`);
}
export function resolveSource(source, options = {}) {
    const parsed = parseSource(source, options.cwd);
    if (parsed.type === "local") {
        return {
            source: parsed.normalized,
            sourceType: "local",
            root: parsed.localPath,
            cleanup() { }
        };
    }
    const execute = options.execute ?? execFileSync;
    const temporary = mkdtempSync(join(tmpdir(), "agent-skills-source-"));
    const root = join(temporary, "repo");
    try {
        const args = ["clone", "--quiet", "--depth", "1"];
        if (parsed.ref)
            args.push("--branch", parsed.ref);
        args.push(parsed.cloneUrl, root);
        execute("git", args, { stdio: ["ignore", "ignore", "pipe"] });
        const commit = String(execute("git", ["-C", root, "rev-parse", "HEAD"], {
            encoding: "utf8"
        })).trim();
        const ref = parsed.ref ?? String(execute("git", ["-C", root, "symbolic-ref", "--short", "HEAD"], { encoding: "utf8" })).trim();
        return {
            source: parsed.normalized,
            sourceType: "git",
            root,
            ref,
            commit,
            directPath: parsed.directPath,
            cleanup: () => rmSync(temporary, { recursive: true, force: true })
        };
    }
    catch (error) {
        rmSync(temporary, { recursive: true, force: true });
        throw error;
    }
}
function isWithin(root, path) {
    const rel = relative(root, path);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function assertTreeSafe(root, directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            if (!isWithin(root, realpathSync(path))) {
                throw new Error(`Unsafe symlink escapes source: ${path}`);
            }
        }
        else if (entry.isDirectory()) {
            assertTreeSafe(root, path);
        }
    }
}
function collectSkillDirectories(root) {
    const found = [];
    const visit = (directory) => {
        if (existsSync(join(directory, "SKILL.md"))) {
            found.push(directory);
            return;
        }
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") {
                visit(join(directory, entry.name));
            }
        }
    };
    visit(root);
    return found;
}
export function discoverSkills(source) {
    const root = realpathSync(source.root);
    assertTreeSafe(root, root);
    let directories;
    if (source.directPath) {
        const direct = resolve(root, source.directPath);
        if (!isWithin(root, direct) || !existsSync(direct) || !statSync(direct).isDirectory()) {
            throw new Error(`Skill path not found in source: ${source.directPath}`);
        }
        directories = existsSync(join(direct, "SKILL.md"))
            ? [direct]
            : collectSkillDirectories(direct);
    }
    else if (existsSync(join(root, "SKILL.md"))) {
        directories = [root];
    }
    else {
        directories = STANDARD_CONTAINERS.flatMap((container) => {
            const path = join(root, container);
            return existsSync(path) && statSync(path).isDirectory()
                ? collectSkillDirectories(path)
                : [];
        });
        if (!directories.length)
            directories = collectSkillDirectories(root);
    }
    const unique = [...new Set(directories.map((path) => realpathSync(path)))];
    return unique.map((absolutePath) => {
        const name = basename(absolutePath);
        validateSkill(absolutePath, name, root);
        return {
            name,
            absolutePath,
            relativePath: relative(root, absolutePath).split(sep).join("/") || "."
        };
    }).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
//# sourceMappingURL=discovery.js.map