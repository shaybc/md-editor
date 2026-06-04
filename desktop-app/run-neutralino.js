#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = __dirname;
const NEU_VERSION = "11.7.0";

function getLocalNeuCommand() {
  const binName = process.platform === "win32" ? "neu.cmd" : "neu";
  const candidate = path.join(ROOT_DIR, "node_modules", ".bin", binName);
  return fs.existsSync(candidate) ? candidate : null;
}

function getNeutralinoRuntimeBinary() {
  const platformMap = {
    win32: "neutralino-win_x64.exe",
    linux: process.arch === "arm64" ? "neutralino-linux_arm64" : "neutralino-linux_x64",
    darwin: process.arch === "arm64" ? "neutralino-mac_arm64" : "neutralino-mac_x64",
  };

  const binaryName = platformMap[process.platform];
  if (!binaryName) return null;

  const candidate = path.join(ROOT_DIR, "bin", binaryName);
  return fs.existsSync(candidate) ? candidate : null;
}

function run(command, args) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

const args = process.argv.slice(2);
const command = args[0];
const localNeu = getLocalNeuCommand();

if (localNeu) {
  run(localNeu, args);
} else if (command === "run") {
  const runtimeBinary = getNeutralinoRuntimeBinary();
  if (!runtimeBinary) {
    console.error("Neutralinojs runtime binary is missing. Run npm run setup while online to cache desktop binaries.");
    process.exit(1);
  }

  console.log("Neutralinojs CLI package is not installed locally; launching cached runtime binary directly.");
  run(runtimeBinary, [
    "--load-dir-res",
    "--path=.",
    "--export-auth-info",
    "--neu-dev-extension",
    "--neu-dev-auto-reload",
  ]);
} else {
  console.error("Neutralinojs CLI package is not installed locally.");
  console.error(`Install @neutralinojs/neu@${NEU_VERSION} into desktop-app/node_modules before running build commands offline.`);
  console.error(`The '${command || "unknown"}' command was not started through npx to avoid offline network waits.`);
  process.exit(1);
}
