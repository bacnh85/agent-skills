import type { DiscoveredSkill, OperationResult } from "./types.js";
export declare function discoverInstalledSkills(target: string): DiscoveredSkill[];
interface RemovalOperations {
    rename(source: string, destination: string): void;
    remove(path: string): void;
}
export declare function uninstallSkills(target: string, names: string[], operations?: RemovalOperations): OperationResult[];
export declare function installSkills(target: string, skills: DiscoveredSkill[]): OperationResult[];
export {};
