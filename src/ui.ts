import { isCancel, multiselect, spinner } from "@clack/prompts";
import pc from "picocolors";
import type { DiscoveredSkill, OperationResult, RegistryEntry } from "./types.js";

export interface OperationProgress {
  message(message: string): void;
}

export function runOperation(
  startMessage: string,
  stopMessage: string,
  interactive: boolean,
  operation: (progress: OperationProgress) => OperationResult[]
): OperationResult[] {
  if (!interactive) return operation({ message() {} });

  const progress = spinner();
  progress.start(startMessage);
  try {
    const results = operation({ message: (message) => progress.message(message) });
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
  return `${action}: ${pc.cyan(result.name)}${result.path ? ` ${pc.dim(`-> ${result.path}`)}` : ""}${result.message ? ` ${pc.dim(`(${result.message})`)}` : ""}`;
}

export function skillOptions(skills: DiscoveredSkill[]) {
  return skills.map((skill) => ({
    value: skill.relativePath,
    label: skill.name,
    hint: skill.relativePath
  }));
}

export async function selectDiscoveredSkills(
  skills: DiscoveredSkill[]
): Promise<DiscoveredSkill[]> {
  const selected = await multiselect({
    message: "Select skills to add",
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
      value: entry.name,
      label: entry.name,
      hint: entry.path
    })),
    required: true
  });
  return isCancel(selected) ? [] : selected;
}
