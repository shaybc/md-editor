#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const JAVA_CONVERTER_DIR = path.join(__dirname, "converters", "java_converter");
const SOURCE_JAR = path.join(JAVA_CONVERTER_DIR, "target", "java_converter.jar");
const DESTINATION_JAR = path.join(
  ROOT_DIR,
  "dist",
  "md-editor",
  "java_converter",
  "target",
  "java_converter.jar",
);

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

function getNewestSourceTime(dirPath) {
  let newest = Math.max(
    getMtimeMs(path.join(JAVA_CONVERTER_DIR, "pom.xml")),
    getMtimeMs(path.join(JAVA_CONVERTER_DIR, "rebuild.bat")),
  );

  function visit(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        newest = Math.max(newest, getMtimeMs(entryPath));
      }
    }
  }

  visit(dirPath);
  return newest;
}

function buildJavaConverterIfNeeded() {
  const jarTime = getMtimeMs(SOURCE_JAR);
  const sourceTime = getNewestSourceTime(path.join(JAVA_CONVERTER_DIR, "src"));
  if (jarTime >= sourceTime && jarTime > 0) return;

  console.log("[info] Building Java converter jar...");
  const result = spawnSync("mvn", ["-q", "package"], {
    cwd: JAVA_CONVERTER_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(JAVA_CONVERTER_DIR)) {
  console.error(`[error] Java converter folder is missing: ${JAVA_CONVERTER_DIR}`);
  process.exit(1);
}

buildJavaConverterIfNeeded();

if (!fs.existsSync(SOURCE_JAR)) {
  console.error(`[error] Java converter jar is missing: ${SOURCE_JAR}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(DESTINATION_JAR), { recursive: true });
fs.copyFileSync(SOURCE_JAR, DESTINATION_JAR);
console.log(`[success] Packaged Java converter jar: ${DESTINATION_JAR}`);
