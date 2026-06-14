import type { DiscoveredSkill, OperationResult, ResolvedSource } from "./types.js";
export declare function addSkills(options: {
    repo: string;
    source: ResolvedSource;
    selected: DiscoveredSkill[];
}): OperationResult[];
export declare function removeSkills(repo: string, names: string[]): OperationResult[];
export declare function updateSkills(repo: string, names?: string[], onProgress?: (name: string, index: number, total: number) => void): OperationResult[];
