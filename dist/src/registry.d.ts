import type { Registry } from "./types.js";
export declare function readRegistry(repo: string): Registry;
export declare function writeAtomic(path: string, content: string): void;
export declare function writeRegistry(repo: string, registry: Registry): void;
export declare function appendHistory(repo: string, event: Record<string, unknown>): void;
