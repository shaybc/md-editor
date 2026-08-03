"use strict";

/* Gradle compilation-model export for AspectJ diagnostic scopes. */
const fs = require("node:fs");
const path = require("node:path");
const { describeGradleFailure } = require("../lsp-proxy-common/gradle-failure-description.cjs");
const { resolveGradleExecutable, runProcess } = require("../lsp-proxy-common/gradle-task-runner.cjs");

/** Export resolved AspectJ module inputs without running a project compilation. */
async function exportGradleModels(options) {
  const outputPath = path.join(options.workRoot, "gradle-models.json");
  const scopesPath = path.join(options.workRoot, "gradle-scopes.json");
  const projectCache = path.join(options.workRoot, "gradle-project-cache");
  fs.mkdirSync(projectCache, { recursive: true });
  try { fs.unlinkSync(outputPath); } catch (_error) { /* A previous snapshot is optional. */ }
  fs.writeFileSync(scopesPath, JSON.stringify(options.scopePaths), "utf8");
  const executable = resolveGradleExecutable(options.workspaceRoot, options.gradle || {});
  const argumentsList = [
    "--no-daemon",
    "-x", "test",
    "--console=plain",
    "--project-cache-dir", projectCache,
    "-I", path.join(__dirname, "gradle", "export-aspectj-models.gradle"),
    `-PmdEditorAjdtModelOutput=${outputPath}`,
    `-PmdEditorAjdtScopesFile=${scopesPath}`,
    "exportMdEditorAjdtModels"
  ];
  if (options.gradle?.offline === true) argumentsList.splice(1, 0, "--offline");
  const environment = Object.assign({}, process.env, { JAVA_HOME: options.projectJdkHome });
  if (options.gradle?.userHome) environment.GRADLE_USER_HOME = String(options.gradle.userHome);
  const result = await runProcess(executable, argumentsList, {
    cwd: options.workspaceRoot,
    env: environment
  });
  fs.writeFileSync(path.join(options.workRoot, "gradle-model-export.log"), `${result.stdout}\n${result.stderr}`, "utf8");
  if (result.code !== 0) throw new Error(`Gradle model export failed: ${describeGradleFailure(result.stderr, result.code)}`);
  if (!fs.existsSync(outputPath)) throw new Error("Gradle completed without producing the AJDT compilation model.");
  const models = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  if (!Array.isArray(models) || !models.length) throw new Error("No Gradle project with a compileAspectj task matched the detected AspectJ scopes.");
  return models;
}

module.exports = { exportGradleModels, resolveGradleExecutable, runProcess };
