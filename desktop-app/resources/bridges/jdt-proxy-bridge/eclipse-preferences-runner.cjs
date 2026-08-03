"use strict";

/* Generates project-defined Eclipse preference files by running the build's own task. */

const fs = require("node:fs");
const path = require("node:path");
const { runGradleTask } = require("../lsp-proxy-common/gradle-task-runner.cjs");
const { describeGradleFailure } = require("../lsp-proxy-common/gradle-failure-description.cjs");

const ECLIPSE_PREFERENCES_TASK = "eclipseJdt";
const RUN_LOG_FILE = "eclipse-preferences.log";

/**
 * Run the project's Eclipse-preference-generating Gradle task.
 *
 * Only `eclipseJdt` is executed (plus whatever the project chains onto it, such as
 * Spring Framework's `eclipseSettings` copy task). The full `eclipse` task is never
 * run because `.project`/`.classpath` are owned by Buildship and must not be
 * rewritten by the Gradle eclipse plugin.
 *
 * @param {object} request
 * @param {string} request.workspaceRoot - Gradle project root.
 * @param {object} [request.gradle] - Selected Gradle configuration ({ mode, executable, userHome, offline }).
 * @param {string} [request.projectJdkHome] - JAVA_HOME for the run.
 * @param {string} [request.initScript] - Shared disable-test-tasks init script path.
 * @returns {Promise<{ok: boolean, description: string, logPath: string}>} Outcome with
 *   a single-line failure description reduced via describeGradleFailure on failure.
 */
async function runEclipsePreferencesTask(request = {}) {
  const workspaceRoot = String(request.workspaceRoot || "");
  const workRoot = path.join(workspaceRoot, ".md-editor");
  const logPath = path.join(workRoot, RUN_LOG_FILE);
  fs.mkdirSync(workRoot, { recursive: true });
  const result = await runGradleTask({
    workspaceRoot,
    tasks: [ECLIPSE_PREFERENCES_TASK],
    gradle: request.gradle || {},
    projectJdkHome: request.projectJdkHome || "",
    projectCacheDir: path.join(workRoot, "eclipse-preferences-project-cache"),
    initScript: request.initScript || ""
  });
  try { fs.writeFileSync(logPath, `${result.stdout}\n${result.stderr}`, "utf8"); }
  catch (_error) { /* The log is diagnostic-only; generation outcome still applies. */ }
  if (result.code !== 0) {
    return { ok: false, description: describeGradleFailure(result.stderr, result.code), logPath };
  }
  return { ok: true, description: `Gradle task ${ECLIPSE_PREFERENCES_TASK} completed.`, logPath };
}

module.exports = { runEclipsePreferencesTask, ECLIPSE_PREFERENCES_TASK };
