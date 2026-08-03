"use strict";

/* Invocation and aggregation of one-shot headless AJDT module builds. */
const fs = require("node:fs");
const path = require("node:path");
const { runProcess } = require("./gradle-model-exporter.cjs");

/** Run every exported module through AJDT and return one atomic publication list. */
async function runAjdtDiagnostics(options) {
  const launcher = findLauncher(options.eclipseHome);
  const java = path.join(options.toolingJdkHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  const eclipseWorkspace = path.join(options.workRoot, "eclipse-workspace");
  const publications = [];
  for (let index = 0; index < options.models.length; index++) {
    const model = options.models[index];
    const modelPath = path.join(options.workRoot, `module-${index}.properties`);
    const reportPath = path.join(options.workRoot, `module-${index}-diagnostics.json`);
    fs.writeFileSync(modelPath, serializeModel(model), "utf8");
    try { fs.unlinkSync(reportPath); } catch (_error) { /* A previous report is optional. */ }
    options.onStatus?.(`Analyzing ${model.projectPath || model.projectRoot} with AJDT...`);
    const result = await runProcess(java, [
      "-jar", launcher,
      "-nosplash",
      "-clean",
      "-consolelog",
      "-application", "mdeditor.ajdt.diagnostics.application",
      "-data", eclipseWorkspace,
      "-model", modelPath,
      "-report", reportPath,
      "-vmargs", "-Xmx2G", "--add-modules=ALL-SYSTEM"
    ], { cwd: options.eclipseHome, env: process.env, shell: false });
    fs.writeFileSync(path.join(options.workRoot, `module-${index}-ajdt.log`), `${result.stdout}\n${result.stderr}`, "utf8");
    if (result.code !== 0) throw new Error(`AJDT analysis failed for ${model.projectPath || model.projectRoot} with exit code ${result.code}.`);
    if (!fs.existsSync(reportPath)) throw new Error(`AJDT analysis did not produce a report for ${model.projectPath || model.projectRoot}.`);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    publications.push(...(Array.isArray(report.publications) ? report.publications : []));
  }
  return publications;
}

function findLauncher(eclipseHome) {
  const pluginRoot = path.join(eclipseHome, "plugins");
  const launcher = fs.readdirSync(pluginRoot).filter((name) => /^org\.eclipse\.equinox\.launcher_.*\.jar$/i.test(name)).sort().pop();
  if (!launcher) throw new Error("The private AJDT runtime does not contain an Equinox launcher.");
  return path.join(pluginRoot, launcher);
}

function serializeModel(model) {
  const lines = [
    `project.root=${normalizePropertyPath(model.projectRoot)}`,
    `project.path=${String(model.projectPath || ":")}`,
    `java.version=${String(model.javaVersion || "17")}`,
    `source.count=${(model.sourceRoots || []).length}`,
    ...(model.sourceRoots || []).map((entry, index) => `source.${index}=${normalizePropertyPath(entry)}`),
    `classpath.count=${(model.classpath || []).length}`,
    ...(model.classpath || []).map((entry, index) => `classpath.${index}=${normalizePropertyPath(entry)}`)
  ];
  return `${lines.join("\n")}\n`;
}

function normalizePropertyPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

module.exports = { runAjdtDiagnostics };
