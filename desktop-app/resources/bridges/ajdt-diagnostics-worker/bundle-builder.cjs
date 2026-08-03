"use strict";

/* Compilation and registration of the headless AJDT diagnostics application. */
const fs = require("node:fs");
const path = require("node:path");
const { runProcess } = require("./gradle-model-exporter.cjs");

const BUNDLE_NAME = "mdeditor.ajdt.diagnostics_1.0.0.jar";

/** Compile the bundled Java bridge against the provisioned Eclipse runtime. */
async function buildDiagnosticsBundle(options) {
  const bundleRoot = path.join(__dirname, "bundle");
  const buildRoot = path.join(options.workRoot, "bundle-build");
  const classesRoot = path.join(buildRoot, "classes");
  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.mkdirSync(classesRoot, { recursive: true });
  const pluginRoot = path.join(options.eclipseHome, "plugins");
  const classpath = fs.readdirSync(pluginRoot)
    .filter((name) => name.toLowerCase().endsWith(".jar"))
    .map((name) => path.join(pluginRoot, name))
    .join(path.delimiter);
  const sourceFiles = collectFiles(path.join(bundleRoot, "src"), (filePath) => filePath.endsWith(".java"));
  const argumentsPath = path.join(buildRoot, "javac.args");
  fs.writeFileSync(argumentsPath, [
    "--release", "21",
    "-encoding", "UTF-8",
    "-classpath", quoteArgument(classpath),
    "-d", quoteArgument(classesRoot),
    ...sourceFiles.map(quoteArgument)
  ].join("\n"), "utf8");
  const javac = path.join(options.toolingJdkHome, "bin", process.platform === "win32" ? "javac.exe" : "javac");
  const compile = await runProcess(javac, [`@${argumentsPath}`], { cwd: bundleRoot, env: process.env, shell: false });
  fs.writeFileSync(path.join(options.workRoot, "bundle-build.log"), `${compile.stdout}\n${compile.stderr}`, "utf8");
  if (compile.code !== 0) throw new Error("The bundled AJDT diagnostics application did not compile.");

  const bundlePath = path.join(pluginRoot, BUNDLE_NAME);
  const jar = path.join(options.toolingJdkHome, "bin", process.platform === "win32" ? "jar.exe" : "jar");
  const packaged = await runProcess(jar, [
    "--create", "--file", bundlePath,
    "--manifest", path.join(bundleRoot, "META-INF", "MANIFEST.MF"),
    "-C", classesRoot, ".",
    "-C", bundleRoot, "plugin.xml"
  ], { cwd: bundleRoot, env: process.env, shell: false });
  if (packaged.code !== 0) throw new Error("The bundled AJDT diagnostics application could not be packaged.");
  registerBundle(options.eclipseHome);
  return bundlePath;
}

function registerBundle(eclipseHome) {
  const bundlesInfo = path.join(eclipseHome, "configuration", "org.eclipse.equinox.simpleconfigurator", "bundles.info");
  const lines = fs.readFileSync(bundlesInfo, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("mdeditor.ajdt.diagnostics,"));
  lines.push(`mdeditor.ajdt.diagnostics,1.0.0,plugins/${BUNDLE_NAME},4,true`);
  fs.writeFileSync(bundlesInfo, `${lines.join("\n")}\n`, "ascii");
}

function collectFiles(root, predicate) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath, predicate));
    else if (predicate(entryPath)) files.push(entryPath);
  }
  return files.sort();
}

function quoteArgument(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

module.exports = { buildDiagnosticsBundle };
