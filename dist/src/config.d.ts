export declare function resolveTargetRepo(options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}): string;
export declare function resolveInstallTarget(options?: {
    cwd?: string;
    home?: string;
    global?: boolean;
}): string;
