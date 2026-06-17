import { basename } from "node:path";
import type { DiscoveredSkill, RegistryEntry, ResolvedSource } from "./types.js";

export function vendorFromSource(source: ResolvedSource | string): string {
  const value = typeof source === "string" ? source : source.source;
  const github = /^https?:\/\/github\.com\/([^/]+)\//.exec(value);
  if (github) return github[1];
  const file = /^file:\/\/(.+)$/.exec(value);
  if (file) return basename(file[1]) || "local";
  if (value.startsWith("/")) return basename(value) || "local";
  return "local";
}

export function skillSourcePath(skill: DiscoveredSkill): string {
  if (skill.relativePath === ".") return skill.name;
  return skill.relativePath
    .replace(/^skills\//, "")
    .replace(/^\.agents\/skills\//, "")
    .replace(/^\.claude\/skills\//, "")
    .replace(/^\.codex\/skills\//, "");
}

export function registryPathFor(skill: DiscoveredSkill, source: ResolvedSource): string {
  return `skills/${vendorFromSource(source)}/${skillSourcePath(skill)}`;
}

export function registryIdForPath(path: string): string {
  return path.replace(/^skills\//, "");
}

export function registryIdFor(skill: DiscoveredSkill, source: ResolvedSource): string {
  return registryIdForPath(registryPathFor(skill, source));
}

export function selectorMatchesEntry(entry: RegistryEntry, selector: string): boolean {
  const normalized = selector.replace(/^skills\//, "");
  return selector === entry.name || normalized === entry.id || selector === entry.path;
}
