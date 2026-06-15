#!/usr/bin/env node
import type { DiscoveredSkill, Registry, RegistryEntry } from "./types.js";
export interface Args {
    command?: "add" | "remove" | "list" | "update" | "install" | "uninstall" | "version";
    values: string[];
    skills?: string[];
    all?: boolean;
    global?: boolean;
}
export declare function usage(): string;
export declare function parseArgs(argv: string[]): Args;
export declare function selectNamedSkills(discovered: DiscoveredSkill[], requested: string[]): DiscoveredSkill[];
export declare function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean;
export declare function formatRegistryList(entries: RegistryEntry[]): string;
export declare function listProjectSkills(repo: string, registry: Registry): RegistryEntry[];
export declare function shouldCheckForUpdates(args: Args, env?: NodeJS.ProcessEnv, stdoutIsTTY?: boolean, stdinIsTTY?: boolean): boolean;
export declare function main(argv?: string[]): Promise<void>;
