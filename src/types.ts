export const CATEGORIES = [
  "agent-tooling",
  "development",
  "research",
  "productivity",
  "content",
  "operations"
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Scope = "project" | "global";

export interface InstalledSkill {
  name: string;
  path: string;
  scope: Scope;
  agents: string[];
}

export interface Provenance {
  source: string;
  sourceType: string;
  sourcePath?: string;
}

export interface RegistryEntry extends Provenance {
  name: string;
  category: Category;
  hash: string;
  firstPromotedAt: string;
  updatedAt: string;
  latestScope: Scope;
}

export interface Registry {
  version: 1;
  skills: Record<string, RegistryEntry>;
}

export interface PromotionResult {
  name: string;
  action: "created" | "updated" | "unchanged";
  category: Category;
  destination: string;
  hash: string;
  provenance: Provenance;
  dryRun: boolean;
}
