#!/usr/bin/env node

/* Copies the verified internal tooling JDK into the packaged desktop layout. */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(__dirname, "bin", "tooling-jdk");
const destination = path.join(projectRoot, "dist", "md-editor", "bin", "tooling-jdk");
const required = ["java.exe", "javac.exe", "jar.exe"].map((name) => path.join(source, "bin", name));

if (!required.every((file) => fs.existsSync(file))) {
  console.error("[error] The internal tooling JDK is missing. Run npm run setup:tooling-jdk before packaging.");
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`[success] Packaged internal tooling JDK: ${destination}`);
