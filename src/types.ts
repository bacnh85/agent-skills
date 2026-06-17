export type SourceType = "git" | "local";

export interface DiscoveredSkill {
  name: string;
  absolutePath: string;
  relativePath: string;
}

export interface ResolvedSource {
  source: string;
  sourceType: SourceType;
  root: string;
  ref?: string;
  commit?: string;
  directPath?: string;
  cleanup(): void;
}

export interface RegistryEntry {
  id: string;
  vendor: string;
  name: string;
  path: string;
  source: string;
  sourceType: SourceType;
  sourcePath?: string;
  ref?: string;
  commit?: string;
  hash: string;
  addedAt: string;
  updatedAt: string;
  updatable: boolean;
}

export interface Registry {
  version: 2;
  skills: Record<string, RegistryEntry>;
}

export interface OperationResult {
  id?: string;
  vendor?: string;
  name: string;
  action: "added" | "updated" | "removed" | "unchanged" | "skipped";
  message?: string;
  path?: string;
  hash?: string;
}
