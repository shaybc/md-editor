const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..", "..");
const authInfoPath = path.join(desktopRoot, ".tmp", "auth_info.json");
const startupTimeoutMs = Number(process.env.MD_EDITOR_DESKTOP_TEST_STARTUP_TIMEOUT_MS || 15000);

/**
 * Return the Neutralino auth file path used by desktop Playwright tests.
 * @returns {string} Absolute auth info path.
 */
function getAuthInfoPath() {
  return authInfoPath;
}

/**
 * Wait for a Neutralino process to write usable auth info.
 * @param {import("node:child_process").ChildProcess} child - Neutralino child process.
 * @param {Function} [getDiagnostics] - Optional diagnostic text provider for startup failures.
 * @returns {Promise<object>} Parsed Neutralino auth information.
 * @throws If the process exits early or auth info never appears.
 */
async function waitForAuthInfo(child, getDiagnostics) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    const authInfo = readAuthInfo();
    if (authInfo) return authInfo;
    if (child.exitCode !== null) {
      throw createStartupError(`Neutralino desktop runtime exited before auth info was available. Exit code: ${child.exitCode}`, getDiagnostics);
    }
    await sleep(50);
  }
  throw createStartupError(`Timed out waiting for Neutralino auth info at ${authInfoPath}`, getDiagnostics);
}

/**
 * Remove stale Neutralino auth data before or after a desktop test run.
 * @returns {void}
 */
function removeAuthInfo() {
  try {
    fs.rmSync(authInfoPath, { force: true });
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

function readAuthInfo() {
  try {
    const authInfo = JSON.parse(fs.readFileSync(authInfoPath, "utf8") || "{}");
    if (!authInfo.nlPort || !authInfo.nlToken) return null;
    return authInfo;
  } catch (_error) {
    return null;
  }
}

function createStartupError(message, getDiagnostics) {
  const diagnostics = typeof getDiagnostics === "function" ? String(getDiagnostics() || "").trim() : "";
  return new Error(diagnostics ? `${message}\n\n${diagnostics}` : message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  getAuthInfoPath,
  removeAuthInfo,
  waitForAuthInfo,
};
