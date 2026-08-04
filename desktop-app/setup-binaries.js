#!/usr/bin/env node

/**
 * setup-binaries.js — Idempotent Neutralinojs binary setup.
 *
 * Ensures the bin/ folder contains the current platform binary. Downloads it
 * via `neu update` only when the required runtime is missing.
 *
 * Existing runtime binaries are never replaced automatically.
 *
 * Run from the desktop-app/ directory:
 *   node setup-binaries.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");


/** ── WebView2 check (Windows only) ── */
if (process.platform === "win32") {
  const regKeys = [
    // Evergreen runtime (per-machine and per-user)
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    // Fixed version runtime
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  ];

  const hasWebView2 = regKeys.some((key) => {
    try {
      execSync(`reg query "${key}" /v pv`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  });

  if (!hasWebView2) {
    console.error(`
✗ Microsoft Edge WebView2 Runtime is not installed.
  Neutralinojs requires it to render the application window.

  Install it from:
  https://go.microsoft.com/fwlink/p/?LinkId=2124703

  Download MicrosoftEdgeWebview2Setup.exe, run it, then retry npm run dev.
`);
    process.exit(1);
  }

  console.log("✓ WebView2 Runtime detected");
}


const CONFIG_FILE = path.resolve(__dirname, "neutralino.config.json");
const BIN_DIR = path.resolve(__dirname, "bin");
const VERSION_MARKER = path.join(BIN_DIR, ".version");

/** Neu CLI package — same version used across all npm scripts */
const NEU_CLI = "@neutralinojs/neu@11.7.0";

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, ""));
}

function getCurrentPlatformRuntimeBinary() {
  const platformBinaries = {
    win32: "neutralino-win_x64.exe",
    linux: process.arch === "arm64" ? "neutralino-linux_arm64" : "neutralino-linux_x64",
    darwin: process.arch === "arm64" ? "neutralino-mac_arm64" : "neutralino-mac_x64",
  };
  const binaryName = platformBinaries[process.platform];
  return binaryName ? path.join(BIN_DIR, binaryName) : null;
}

const currentRuntimeBinary = getCurrentPlatformRuntimeBinary();
if (currentRuntimeBinary && fs.existsSync(currentRuntimeBinary)) {
  console.log(`Neutralinojs runtime already present at ${currentRuntimeBinary} - skipping automatic download`);
  process.exit(0);
}

const config = readJsonFile(CONFIG_FILE);
const expectedVersion = config.cli.binaryVersion;

if (!expectedVersion) {
  console.error("✗ cli.binaryVersion not set in neutralino.config.json");
  process.exit(1);
}

/** Check if binaries are already present and match the expected version */
if (fs.existsSync(VERSION_MARKER)) {
  const installed = fs.readFileSync(VERSION_MARKER, "utf-8").trim();
  if (installed === expectedVersion && currentRuntimeBinary && fs.existsSync(currentRuntimeBinary)) {
    console.log(
      `✓ Neutralinojs binaries v${expectedVersion} already present — skipping download`,
    );
    process.exit(0);
  }
  console.log(
    `↻ Version changed (${installed} → ${expectedVersion}) — re-downloading`,
  );
}

/** Download binaries + client library via neu update */
console.log(`⬇ Downloading Neutralinojs v${expectedVersion} binaries...`);
execSync(`npx -y ${NEU_CLI} update`, {
  cwd: __dirname,
  stdio: "inherit",
});

/** Write version marker so subsequent runs are no-ops */
fs.mkdirSync(BIN_DIR, { recursive: true });
fs.writeFileSync(VERSION_MARKER, expectedVersion, "utf-8");
console.log(`✓ Neutralinojs binaries v${expectedVersion} ready`);
