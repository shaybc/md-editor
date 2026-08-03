const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { getAuthInfoPath, removeAuthInfo, waitForAuthInfo } = require("./neutralino-auth");

const desktopRoot = path.resolve(__dirname, "..", "..");
const launchOutputLimit = 20000;
const gracefulCloseTimeoutMs = 3000;
const nativeCommandTimeoutMs = 1000;

/**
 * Launch the Neutralino desktop app for Playwright tests.
 * @returns {Promise<{auth: object, baseURL: string, process: import("node:child_process").ChildProcess, close: Function}>} Running desktop app handle.
 */
async function launchDesktopApp() {
  const runtimeBinary = getRuntimeBinaryPath();
  const indexPath = path.join(desktopRoot, "resources", "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Desktop resources are missing at ${indexPath}. Restore desktop-app/resources before running desktop Playwright tests.`);
  }
  if (!fs.existsSync(runtimeBinary)) {
    throw new Error(`Neutralino runtime binary is missing at ${runtimeBinary}. Run desktop-app npm setup before desktop Playwright tests.`);
  }

  removeAuthInfo();
  fs.mkdirSync(path.dirname(getAuthInfoPath()), { recursive: true });

  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-desktop-profile-"));
  const child = spawn(runtimeBinary, ["--load-dir-res", "--path=.", "--export-auth-info"], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      HOME: profileRoot,
      USERPROFILE: profileRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const outputCapture = createProcessOutputCapture(child);

  try {
    const authInfo = await waitForAuthInfo(child, () => outputCapture.getDiagnostics());
    const auth = createNeutralinoAuthGlobals(authInfo);

    return {
      auth,
      baseURL: `http://127.0.0.1:${auth.NL_PORT}`,
      process: child,
      profileRoot,
      async close() {
        try {
          await closeDesktopApp(child, authInfo);
        } finally {
          removeAuthInfo();
          removeProfileRoot(profileRoot);
        }
      },
    };
  } catch (error) {
    stopProcessTree(child);
    removeAuthInfo();
    removeProfileRoot(profileRoot);
    throw error;
  }
}

/**
 * Check whether a process id still exists.
 * @param {number} pid - Process id to check.
 * @returns {boolean} True when the process is still running.
 */
function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function createNeutralinoAuthGlobals(authInfo) {
  return {
    NL_PORT: Number(authInfo.nlPort),
    NL_TOKEN: String(authInfo.nlToken || ""),
    NL_CTOKEN: String(authInfo.nlConnectToken || ""),
    NL_MODE: "window",
    NL_OS: getNeutralinoOsName(),
    NL_ARGS: [],
    NL_PATH: desktopRoot.replace(/\\/g, "/"),
    NL_APPID: "js.neutralino.sample",
    NL_VERSION: "6.5.0",
    NL_CINJECTED: true,
  };
}

async function closeDesktopApp(child, authInfo) {
  if (!child || child.exitCode !== null) return;
  const requestedNativeExit = await requestNeutralinoAppExit(authInfo);
  const exitedGracefully = requestedNativeExit
    ? await waitForProcessExit(child, gracefulCloseTimeoutMs)
    : false;
  if (exitedGracefully) return;
  stopProcessTree(child);
  await waitForProcessExit(child, gracefulCloseTimeoutMs);
}

function requestNeutralinoAppExit(authInfo) {
  const connectToken = getNeutralinoConnectToken(authInfo);
  if (typeof WebSocket !== "function" || !authInfo?.nlPort || !authInfo?.nlToken || !connectToken) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let socket = null;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch (_error) {
        // Ignore close errors during best-effort test shutdown.
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), nativeCommandTimeoutMs);

    try {
      socket = new WebSocket(`ws://127.0.0.1:${Number(authInfo.nlPort)}?connectToken=${encodeURIComponent(connectToken)}`);
      socket.addEventListener("open", () => {
        try {
          socket.send(JSON.stringify({
            id: "desktop-test-close",
            method: "app.exit",
            data: { code: 0 },
            accessToken: String(authInfo.nlToken),
          }));
          finish(true);
        } catch (_error) {
          finish(false);
        }
      });
      socket.addEventListener("error", () => finish(false));
    } catch (_error) {
      finish(false);
    }
  });
}

function getNeutralinoConnectToken(authInfo) {
  const tokenParts = String(authInfo?.nlToken || "").split(".");
  return String(authInfo?.nlConnectToken || tokenParts[1] || "");
}

function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}
function getRuntimeBinaryPath() {
  if (process.env.MD_EDITOR_DESKTOP_RUNTIME) {
    return path.resolve(process.env.MD_EDITOR_DESKTOP_RUNTIME);
  }
  if (process.platform === "win32") return path.join(desktopRoot, "bin", "neutralino-win_x64.exe");
  if (process.platform === "darwin") return path.join(desktopRoot, "bin", "neutralino-mac_universal");
  return path.join(desktopRoot, "bin", "neutralino-linux_x64");
}

function getNeutralinoOsName() {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "darwin") return "Darwin";
  if (process.platform === "linux") return "Linux";
  return process.platform;
}

function createProcessOutputCapture(child) {
  const chunks = [];
  const append = (stream, chunk) => {
    chunks.push(`[${stream}] ${String(chunk || "")}`);
    while (chunks.join("").length > launchOutputLimit && chunks.length > 1) chunks.shift();
  };
  child.stdout?.on("data", (chunk) => append("stdout", chunk));
  child.stderr?.on("data", (chunk) => append("stderr", chunk));
  child.on("error", (error) => append("error", error?.message || String(error)));
  child.on("exit", (code, signal) => append("exit", `code=${code ?? ""} signal=${signal || ""}`));
  return {
    getDiagnostics() {
      const output = chunks.join("").trim();
      return [
        `Neutralino binary: ${getRuntimeBinaryPath()}`,
        `Desktop root: ${desktopRoot}`,
        `Auth info path: ${getAuthInfoPath()}`,
        `Process id: ${child.pid || ""}`,
        `Exit code: ${child.exitCode ?? ""}`,
        output ? `Recent runtime output:\n${output}` : "Recent runtime output: <none>",
      ].join("\n");
    },
  };
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function removeProfileRoot(profileRoot) {
  try {
    fs.rmSync(profileRoot, { recursive: true, force: true });
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

module.exports = {
  desktopRoot,
  isProcessRunning,
  launchDesktopApp,
};
