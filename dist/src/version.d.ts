export declare const PACKAGE_NAME = "@bacnh85/agent-skills";
export declare const UPGRADE_COMMAND = "npm install -g @bacnh85/agent-skills@latest";
export declare const CACHE_TTL_MS: number;
export declare const NPM_TIMEOUT_MS = 5000;
export interface VersionCheckResult {
    current: string;
    latest?: string;
    updateAvailable: boolean;
    error?: Error;
}
export interface VersionCache {
    checkedAt: number;
    latest: string;
}
export interface VersionDependencies {
    now?: () => number;
    cachePath?: string;
    readFile?: (path: string) => string;
    writeFile?: (path: string, contents: string) => void;
    queryLatest?: () => string;
}
export interface UpgradeDependencies {
    confirm?: (message: string) => Promise<boolean>;
    install?: () => number;
    log?: (message: string) => void;
}
type NpmSpawn = (command: string, args: string[], options: {
    stdio: "inherit";
}) => {
    error?: Error;
    status: number | null;
};
export declare function compareVersions(left: string, right: string): number;
export declare function resolveCachePath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function readCurrentVersion(): string;
export declare function queryLatestVersion(): string;
export declare function checkForUpdate(current: string, options?: VersionDependencies & {
    force?: boolean;
}): VersionCheckResult;
export declare function installLatestVersion(spawn?: NpmSpawn): number;
export declare function presentUpdate(result: VersionCheckResult, dependencies?: UpgradeDependencies): Promise<number>;
export {};
