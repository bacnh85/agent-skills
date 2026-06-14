#!/usr/bin/env node
const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options,
    env: {
      ...process.env,
      npm_config_global: "false",
      ...options.env
    }
  });
}

if (!existsSync("node_modules/typescript/lib/typescript.js")) {
  run(npm, ["ci", "--include=dev", "--ignore-scripts"]);
}

run(npm, ["run", "build"]);
