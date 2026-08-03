"use strict";

/* Shared Gradle process conventions for MD-Editor's analysis sidecars. */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Resolve the exact Gradle runner selected by the project's Java Build Path.
 *
 * @param {string} workspaceRoot - Project root that may contain a Gradle wrapper.
 * @param {object} gradle - Selected Gradle configuration ({ mode, executable }).
 * @returns {string} Executable path or command name to launch Gradle with.
 * @throws When the wrapper mode is selected but no wrapper script exists.
 */
function resolveGradleExecutable(workspaceRoot, gradle = {}) {
  const configured = String(gradle.executable || "").replace(/^"|"$/g, "");
  if (["local", "installation"].includes(String(gradle.mode || "")) && configured) return configured;
  const wrapper = path.join(workspaceRoot, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (String(gradle.mode || "") === "wrapper") {
    if (!fs.existsSync(wrapper)) throw new Error("The selected Gradle wrapper was not found in the workspace root.");
    return wrapper;
  }
  if (String(gradle.mode || "") === "built-in") return process.platform === "win32" ? "gradle.bat" : "gradle";
  return fs.existsSync(wrapper) ? wrapper : (configured || (process.platform === "win32" ? "gradle.bat" : "gradle"));
}

/**
 * Run one bounded child process and retain its diagnostic output.
 *
 * @param {string} executable - Command or script to launch (bat/cmd handled on Windows).
 * @param {string[]} argumentsList - Process arguments.
 * @param {object} options - child_process.spawn options (cwd, env, ...).
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Process outcome.
 */
function runProcess(executable, argumentsList, options) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" && /\.(?:bat|cmd)$/i.test(executable)
      ? { executable: process.env.ComSpec || "cmd.exe", argumentsList: ["/d", "/c", executable, ...argumentsList] }
      : { executable, argumentsList };
    const child = spawn(command.executable, command.argumentsList, Object.assign({ windowsHide: true }, options));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk || ""); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk || ""); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Run a Gradle task with MD-Editor's shared analysis conventions: selected Gradle
 * runner, project JDK environment, no daemon, a private project-cache directory,
 * and the shared init script that disables test tasks across the build tree.
 *
 * @param {object} request
 * @param {string} request.workspaceRoot - Gradle project root (cwd for the run).
 * @param {string[]} request.tasks - Task names to execute (e.g. ["eclipseJdt"]).
 * @param {object} [request.gradle] - Selected Gradle configuration ({ mode, executable, userHome, offline }).
 * @param {string} [request.projectJdkHome] - JAVA_HOME for the run.
 * @param {string} [request.projectCacheDir] - Private --project-cache-dir location.
 * @param {string} [request.initScript] - Init script path applied with -I.
 * @param {string[]} [request.extraArguments] - Additional Gradle arguments.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Process outcome.
 */
async function runGradleTask(request) {
  const workspaceRoot = String(request.workspaceRoot || "");
  const executable = resolveGradleExecutable(workspaceRoot, request.gradle || {});
  const argumentsList = ["--no-daemon", "--console=plain"];
  if (request.gradle?.offline === true) argumentsList.push("--offline");
  if (request.projectCacheDir) {
    fs.mkdirSync(request.projectCacheDir, { recursive: true });
    argumentsList.push("--project-cache-dir", request.projectCacheDir);
  }
  if (request.initScript) argumentsList.push("-I", request.initScript);
  argumentsList.push(...(request.extraArguments || []), ...(request.tasks || []));
  const environment = Object.assign({}, process.env);
  if (request.projectJdkHome) environment.JAVA_HOME = String(request.projectJdkHome);
  if (request.gradle?.userHome) environment.GRADLE_USER_HOME = String(request.gradle.userHome);
  return runProcess(executable, argumentsList, { cwd: workspaceRoot, env: environment });
}

module.exports = { resolveGradleExecutable, runProcess, runGradleTask };
