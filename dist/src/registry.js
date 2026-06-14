import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export function readRegistry(repo) {
    const path = join(repo, "skill-registry.json");
    if (!existsSync(path))
        return { version: 2, skills: {} };
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw.version === 2)
        return raw;
    const skills = {};
    for (const [key, value] of Object.entries(raw.skills ?? {})) {
        const legacy = value;
        const name = legacy.name ?? key;
        const path = legacy.category ? `skills/${legacy.category}/${name}` : `skills/${name}`;
        const sourceType = legacy.sourceType === "local" ? "local" : "git";
        const updatable = Boolean(legacy.source &&
            legacy.hash &&
            (sourceType === "local" || legacy.sourcePath));
        skills[name] = {
            name,
            path,
            source: legacy.source ?? "unknown",
            sourceType,
            sourcePath: legacy.sourcePath?.replace(/\/SKILL\.md$/, ""),
            hash: legacy.hash ?? "",
            addedAt: legacy.firstPromotedAt ?? legacy.updatedAt ?? "",
            updatedAt: legacy.updatedAt ?? legacy.firstPromotedAt ?? "",
            updatable
        };
    }
    return { version: 2, skills };
}
export function writeAtomic(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, content);
    renameSync(temporary, path);
}
export function writeRegistry(repo, registry) {
    writeAtomic(join(repo, "skill-registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
}
export function appendHistory(repo, event) {
    mkdirSync(repo, { recursive: true });
    appendFileSync(join(repo, "skill-history.jsonl"), `${JSON.stringify({ version: 2, ...event })}\n`);
}
//# sourceMappingURL=registry.js.map