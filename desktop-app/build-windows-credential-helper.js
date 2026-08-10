#!/usr/bin/env node

/** Build the Windows Credential Manager helper bundled with AI Companion. */

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = __dirname;
const projectPath = path.join(desktopRoot, "native", "windows-credential-helper", "WindowsCredentialHelper.csproj");
const outputDirectory = path.join(desktopRoot, "resources", "bridges", "windows-credential-helper");
const executablePath = path.join(outputDirectory, "windows-credential-helper.exe");

fs.mkdirSync(outputDirectory, { recursive: true });
execFileSync("dotnet", ["publish", projectPath, "--configuration", "Release", "--runtime", "win-x64", "--self-contained", "true", "--output", outputDirectory], {
  cwd: desktopRoot,
  stdio: "inherit",
  windowsHide: true
});

if (!fs.existsSync(executablePath)) throw new Error("Windows credential helper build did not produce its executable.");
console.log(`Built ${path.relative(desktopRoot, executablePath)}`);
