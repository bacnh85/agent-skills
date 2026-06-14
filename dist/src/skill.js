import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
function isWithin(root, path) {
    const rel = relative(root, path);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
export function validateSkill(source, expectedName, sourceRoot = source) {
    const root = realpathSync(source);
    if (!isWithin(realpathSync(sourceRoot), root)) {
        throw new Error(`Skill path escapes source root: ${source}`);
    }
    const skillFile = join(root, "SKILL.md");
    let content;
    try {
        content = readFileSync(skillFile, "utf8");
    }
    catch {
        throw new Error(`Missing SKILL.md in ${source}.`);
    }
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const name = frontmatter?.[1].match(/^name:\s*(.+)\s*$/m)?.[1].trim();
    const description = frontmatter?.[1].match(/^description:\s*(.+)\s*$/m)?.[1].trim();
    if (!name || !description) {
        throw new Error(`SKILL.md for "${expectedName}" requires name and description.`);
    }
    if (name !== expectedName) {
        throw new Error(`Skill name "${name}" does not match directory name "${expectedName}".`);
    }
    return content;
}
export function hashDirectory(root) {
    const hash = createHash("sha256");
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const path = join(directory, entry.name);
            const rel = relative(root, path).split(sep).join("/");
            hash.update(`${entry.isDirectory() ? "d" : entry.isSymbolicLink() ? "l" : "f"}:${rel}\0`);
            if (entry.isDirectory())
                visit(path);
            else if (entry.isSymbolicLink())
                hash.update(realpathSync(path));
            else
                hash.update(readFileSync(path));
        }
    };
    visit(root);
    return hash.digest("hex");
}
//# sourceMappingURL=skill.js.map