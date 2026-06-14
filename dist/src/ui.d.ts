import type { DiscoveredSkill, OperationResult, RegistryEntry } from "./types.js";
export interface OperationProgress {
    message(message: string): void;
}
export declare function runOperation(startMessage: string, stopMessage: string, interactive: boolean, operation: (progress: OperationProgress) => OperationResult[]): OperationResult[];
export declare function formatOperationResult(result: OperationResult): string;
export declare function skillOptions(skills: DiscoveredSkill[]): {
    value: string;
    label: string;
    hint: string;
}[];
export declare function selectDiscoveredSkills(skills: DiscoveredSkill[], action?: "add" | "install"): Promise<DiscoveredSkill[]>;
export declare function selectRegistrySkills(entries: RegistryEntry[]): Promise<string[]>;
export declare function selectInstalledSkills(skills: DiscoveredSkill[]): Promise<string[]>;
