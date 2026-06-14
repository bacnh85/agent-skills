import { isCancel, multiselect, spinner } from "@clack/prompts";
import pc from "picocolors";
export function runOperation(startMessage, stopMessage, interactive, operation) {
    if (!interactive)
        return operation({ message() { } });
    const progress = spinner();
    progress.start(startMessage);
    try {
        const results = operation({ message: (message) => progress.message(message) });
        progress.stop(stopMessage);
        return results;
    }
    catch (error) {
        progress.stop("Operation failed", 1);
        throw error;
    }
}
export function formatOperationResult(result) {
    const action = {
        added: pc.green("added"),
        updated: pc.green("updated"),
        removed: pc.green("removed"),
        unchanged: pc.dim("unchanged"),
        skipped: pc.yellow("skipped")
    }[result.action];
    return `${action}: ${pc.cyan(result.name)}${result.path ? ` ${pc.dim(`-> ${result.path}`)}` : ""}${result.message ? ` ${pc.dim(`(${result.message})`)}` : ""}`;
}
export function skillOptions(skills) {
    return skills.map((skill) => ({
        value: skill.relativePath,
        label: skill.name,
        hint: skill.relativePath
    }));
}
export async function selectDiscoveredSkills(skills, action = "add") {
    const selected = await multiselect({
        message: `Select skills to ${action}`,
        options: skillOptions(skills),
        required: true
    });
    if (isCancel(selected))
        return [];
    const paths = new Set(selected);
    return skills.filter((skill) => paths.has(skill.relativePath));
}
export async function selectRegistrySkills(entries) {
    const selected = await multiselect({
        message: "Select skills to remove",
        options: entries.map((entry) => ({
            value: entry.name,
            label: entry.name,
            hint: entry.path
        })),
        required: true
    });
    return isCancel(selected) ? [] : selected;
}
export async function selectInstalledSkills(skills) {
    const selected = await multiselect({
        message: "Select skills to uninstall",
        options: skills.map((skill) => ({
            value: skill.name,
            label: skill.name,
            hint: skill.absolutePath
        })),
        required: true
    });
    return isCancel(selected) ? [] : selected;
}
//# sourceMappingURL=ui.js.map