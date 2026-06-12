import {
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  spinner
} from "@clack/prompts";
import pc from "picocolors";
import { join } from "node:path";
import type {
  Category,
  InstalledSkill,
  PromotionResult,
  Provenance
} from "./types.js";

const WORDMARK = [
  "   _    ____ _____ _   _ _____   ____  _  _____ _     _     ____  ",
  "  / \\  / ___| ____| \\ | |_   _| / ___|| |/ /_ _| |   | |   / ___| ",
  " / _ \\| |  _|  _| |  \\| | | |   \\___ \\| ' / | || |   | |   \\___ \\ ",
  "/ ___ \\ |_| | |___| |\\  | | |    ___) | . \\ | || |___| |___ ___) |",
  "/_/   \\_\\____|_____|_| \\_| |_|   |____/|_|\\_\\___|_____|_____|____/ "
].join("\n");

export interface PreparedPromotion {
  skill: InstalledSkill;
  category: Category;
  provenance: Provenance;
}

export interface SkillOption {
  value: string;
  label: string;
  hint: string;
}

export function skillKey(skill: InstalledSkill): string {
  return `${skill.scope}:${skill.name}`;
}

export function sortInstalledSkills(skills: InstalledSkill[]): InstalledSkill[] {
  return [...skills].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.scope.localeCompare(right.scope) ||
      left.path.localeCompare(right.path)
  );
}

export function createSkillOptions(skills: InstalledSkill[]): SkillOption[] {
  return sortInstalledSkills(skills).map((skill) => ({
    value: skillKey(skill),
    label: skill.name,
    hint: `${skill.scope} · ${skill.path}`
  }));
}

export function formatReview(
  prepared: PreparedPromotion[],
  repo: string
): string {
  return prepared
    .map(
      (item) =>
        `${pc.bold(item.skill.name)}\n` +
        `Destination  ${join(repo, "skills", item.category, item.skill.name)}\n` +
        `Category     ${item.category}\n` +
        `Source       ${item.provenance.source}`
    )
    .join("\n\n");
}

export function showPromoteIntro(): void {
  console.log(pc.gray(WORDMARK));
  intro(pc.inverse(" agent-skills "));
}

export function startDiscoverySpinner(): ReturnType<typeof spinner> {
  const progress = spinner();
  progress.start("Discovering installed skills");
  return progress;
}

export function showAutoSelection(skill: InstalledSkill): void {
  log.info(`Auto-selected ${pc.bold(skill.name)} (${skill.scope})`);
}

export async function selectSkills(
  installed: InstalledSkill[]
): Promise<{ cancelled: boolean; skills: InstalledSkill[] }> {
  const sorted = sortInstalledSkills(installed);
  if (sorted.length === 0) return { cancelled: false, skills: [] };
  if (sorted.length === 1) return { cancelled: false, skills: sorted };

  const byKey = new Map(sorted.map((skill) => [skillKey(skill), skill]));
  const selected = await multiselect({
    message: "Select skills to promote",
    options: createSkillOptions(sorted),
    required: true
  });
  if (isCancel(selected)) return { cancelled: true, skills: [] };
  return {
    cancelled: false,
    skills: selected.map((key) => byKey.get(key)!).filter(Boolean)
  };
}

export async function confirmPromotion(
  prepared: PreparedPromotion[],
  repo: string
): Promise<boolean> {
  note(formatReview(prepared, repo), "Review promotion");
  const accepted = await confirm({
    message: "Promote these skills?",
    initialValue: true
  });
  return !isCancel(accepted) && accepted;
}

export function showCancellation(): void {
  outro("Promotion cancelled");
}

export function promoteWithProgress(
  prepared: PreparedPromotion[],
  promote: (item: PreparedPromotion) => PromotionResult
): PromotionResult[] {
  const progress = spinner();
  progress.start(
    `Promoting ${prepared.length} skill${prepared.length === 1 ? "" : "s"}`
  );
  try {
    const results = prepared.map(promote);
    progress.stop(
      `Promoted ${results.length} skill${results.length === 1 ? "" : "s"}`
    );
    return results;
  } catch (error) {
    progress.stop("Promotion failed");
    throw error;
  }
}

export function showPromotionResults(results: PromotionResult[]): void {
  note(
    results
      .map(
        (result) =>
          `${result.action}: ${result.name} -> ${result.destination} ` +
          `(${result.hash.slice(0, 12)})${result.dryRun ? " [dry-run]" : ""}`
      )
      .join("\n"),
    "Results"
  );
  outro("Promotion complete");
}
