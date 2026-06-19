import { confirm, isCancel, multiselect, select, spinner } from "@clack/prompts";
import pc from "picocolors";
import type { DiscoveredSkill, OperationResult, RegistryEntry } from "./types.js";

export type InstallScope = "project" | "global";

export interface OperationProgress {
  message(message: string): void;
}

export async function runOperation<T>(
  startMessage: string,
  stopMessage: string,
  interactive: boolean,
  operation: (progress: OperationProgress) => T | Promise<T>
): Promise<T> {
  if (!interactive) return await operation({ message() {} });

  const progress = spinner();
  progress.start(startMessage);
  try {
    const results = await operation({ message: (message) => progress.message(message) });
    progress.stop(stopMessage);
    return results;
  } catch (error) {
    progress.stop("Operation failed", 1);
    throw error;
  }
}

export function formatOperationResult(result: OperationResult): string {
  const action = {
    added: pc.green("added"),
    updated: pc.green("updated"),
    removed: pc.green("removed"),
    unchanged: pc.dim("unchanged"),
    skipped: pc.yellow("skipped")
  }[result.action];
  const label = result.vendor ? `${result.vendor}/${result.name}` : result.name;
  return `${action}: ${pc.cyan(label)}${result.path ? ` ${pc.dim(`-> ${result.path}`)}` : ""}${result.message ? ` ${pc.dim(`(${result.message})`)}` : ""}`;
}

export function skillOptions(skills: DiscoveredSkill[]) {
  return skills.map((skill) => ({
    value: skill.relativePath,
    label: skill.name,
    hint: skill.relativePath
  }));
}

export async function selectDiscoveredSkills(
  skills: DiscoveredSkill[],
  action: "add" | "install" = "add"
): Promise<DiscoveredSkill[]> {
  const selected = await multiselect({
    message: `Select skills to ${action}`,
    options: skillOptions(skills),
    required: true
  });
  if (isCancel(selected)) return [];
  const paths = new Set(selected);
  return skills.filter((skill) => paths.has(skill.relativePath));
}

export async function selectRegistrySkills(
  entries: RegistryEntry[]
): Promise<string[]> {
  const selected = await multiselect({
    message: "Select skills to remove",
    options: entries.map((entry) => ({
      value: entry.id,
      label: entry.name,
      hint: `${entry.vendor} · ${entry.path}`
    })),
    required: true
  });
  return isCancel(selected) ? [] : selected;
}

export async function selectInstalledSkills(
  skills: DiscoveredSkill[]
): Promise<string[]> {
  const selected = await multiselect({
    message: "Select skills to uninstall",
    options: skills.map((skill) => ({
      value: skill.name,
      label: skill.id ?? skill.name,
      hint: skill.source ?? skill.absolutePath
    })),
    required: true
  });
  return isCancel(selected) ? [] : selected;
}

export async function selectInstallScope(): Promise<InstallScope | undefined> {
  const selected = await select({
    message: "Installation scope",
    options: [
      { value: "project", label: "Project" },
      { value: "global", label: "Global" }
    ],
    initialValue: "project"
  });
  return isCancel(selected) ? undefined : selected as InstallScope;
}

export async function confirmOperation(message: string): Promise<boolean> {
  const answer = await confirm({ message, initialValue: true });
  return isCancel(answer) ? false : answer;
}
