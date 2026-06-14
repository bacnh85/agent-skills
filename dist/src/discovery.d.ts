import { execFileSync } from "node:child_process";
import type { DiscoveredSkill, ResolvedSource } from "./types.js";
export interface ParsedSource {
    type: "git" | "local";
    normalized: string;
    cloneUrl?: string;
    ref?: string;
    directPath?: string;
    localPath?: string;
}
export declare function parseSource(source: string, cwd?: string): ParsedSource;
export declare function resolveSource(source: string, options?: {
    cwd?: string;
    execute?: typeof execFileSync;
}): ResolvedSource;
export declare function discoverSkills(source: ResolvedSource): DiscoveredSkill[];
