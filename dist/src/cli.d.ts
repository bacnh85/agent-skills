#!/usr/bin/env node
import type { RegistryEntry } from "./types.js";
export interface Args {
    command?: "add" | "remove" | "list" | "update" | "install" | "uninstall";
    values: string[];
    all?: boolean;
    global?: boolean;
}
export declare function usage(): string;
export declare function parseArgs(argv: string[]): Args;
export declare function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean;
export declare function formatRegistryList(entries: RegistryEntry[]): string;
