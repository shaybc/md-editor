#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT_DIR = __dirname;
const { MARKDOWN_VIEWER_SHARED_CONSTANTS } = require(path.join(ROOT_DIR, "resources", "js", "core", "context.js"));
const NEU_VERSION = "11.7.0";
const PROFILE_DIR = MARKDOWN_VIEWER_SHARED_CONSTANTS.DESKTOP_PROFILE_DIR;
const PREFERENCES_FILE = "preferences.json";
const DEBUG_LEVELS = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};
const DEBUG_LOG_CATEGORIES = new Set(["startup-perf"]);

function normalizeDebugLevel(value) {
  return Object.prototype.hasOwnProperty.call(DEBUG_LEVELS, value) ? value : "debug";
}

function normalizeLocalPath(value) {
  return String(value || "").trim();
}

function normalizeNativeDebugCategories(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Array.from(DEBUG_LOG_CATEGORIES).reduce((categories, category) => {
    categories[category] = source[category] !== false;
    return categories;
  }, {});
}

function isNativeDebugCategoryEnabled(preferences, category) {
  if (!category || !DEBUG_LOG_CATEGORIES.has(category)) return true;
  const categories = preferences?.categories && typeof preferences.categories === "object" && !Array.isArray(preferences.categories)
    ? preferences.categories
    : normalizeNativeDebugCategories({});
  return categories[category] !== false;
}

function getUserProfileDir(env = process.env) {
  return process.platform === "win32"
    ? env.USERPROFILE || env.HOME || ""
    : env.HOME || env.USERPROFILE || "";
}

function readNativeDebugPreferences(env = process.env) {
  const profileDir = getUserProfileDir(env);
  if (!profileDir) {
    return { categories: normalizeNativeDebugCategories({}), enabled: false, level: "debug", logPath: "", writeToFile: false };
  }

  try {
    const profilePath = path.join(profileDir, PROFILE_DIR, PREFERENCES_FILE);
    const profileData = JSON.parse(fs.readFileSync(profilePath, "utf8") || "{}");
    const state = profileData && typeof profileData.state === "object" ? profileData.state : {};
    return {
      categories: normalizeNativeDebugCategories(state.debugCategories),
      enabled: state.debugEnabled === true,
      level: normalizeDebugLevel(state.debugLevel),
      logPath: normalizeLocalPath(state.debugLogPath || ""),
      writeToFile: state.debugWriteToFile === true,
    };
  } catch (_error) {
    return { categories: normalizeNativeDebugCategories({}), enabled: false, level: "debug", logPath: "", writeToFile: false };
  }
}

function shouldWriteNativeStartupPerf(preferences) {
  if (!preferences.enabled || !preferences.writeToFile || !preferences.logPath) return false;
  if (!isNativeDebugCategoryEnabled(preferences, "startup-perf")) return false;
  return DEBUG_LEVELS.info >= DEBUG_LEVELS[normalizeDebugLevel(preferences.level)];
}

function appendNativeStartupPerf(command, args, env = process.env) {
  const preferences = readNativeDebugPreferences(env);
  if (!shouldWriteNativeStartupPerf(preferences)) return false;

  try {
    fs.mkdirSync(path.dirname(preferences.logPath), { recursive: true });
    fs.appendFileSync(
      preferences.logPath,
      `[startup-perf-native] ${new Date().toISOString()} launching ${path.basename(command)} ${args.join(" ")}\n`,
      "utf8",
    );
    return true;
  } catch (_error) {
    // Startup timing diagnostics should never block the app launch.
    return false;
  }
}

function getLocalNeuCommand() {
  const binName = process.platform === "win32" ? "neu.cmd" : "neu";
  const candidate = path.join(ROOT_DIR, "node_modules", ".bin", binName);
  return fs.existsSync(candidate) ? candidate : null;
}

const DESKTOP_LOADER_CONSOLE_LOG = path.join(ROOT_DIR, "logs", "desktop-loader-console.log");
const DESKTOP_LOADER_CONSOLE_PORT = 0;
const DESKTOP_AUTH_INFO_ENDPOINT = "/desktop-auth-info";
const DESKTOP_AUTH_INFO_FILE = path.join(ROOT_DIR, ".tmp", "auth_info.json");
const DESKTOP_AUTH_SCRIPT_INTERVAL_MS = 50;
const DESKTOP_AUTH_SCRIPT_TIMEOUT_MS = 5000;
const STALE_DESKTOP_AUTH_SCRIPT_FILE = path.join(ROOT_DIR, "resources", "js", "neutralino-auth.js");
let desktopAuthPayload = null;

function getBundledRootDocumentEntries(rootDir = ROOT_DIR) {
  const repoRoot = path.resolve(rootDir, "..");
  const resourcesRoot = path.join(rootDir, "resources");
  return [
    {
      source: path.join(repoRoot, "README.md"),
      destination: path.join(resourcesRoot, "README.md"),
    },
    {
      source: path.join(repoRoot, "LICENSE"),
      destination: path.join(resourcesRoot, "LICENSE"),
    },
  ];
}

function prepareBundledRootDocuments(entries = getBundledRootDocumentEntries()) {
  const previousStates = [];
  for (const entry of entries) {
    const existed = fs.existsSync(entry.destination);
    previousStates.push({
      destination: entry.destination,
      existed,
      content: existed ? fs.readFileSync(entry.destination) : null,
    });
    fs.copyFileSync(entry.source, entry.destination);
  }

  return () => {
    for (const state of previousStates.reverse()) {
      if (state.existed) {
        fs.writeFileSync(state.destination, state.content);
      } else {
        fs.rmSync(state.destination, { force: true });
      }
    }
  };
}

function shouldPrepareBundledRootDocuments(args = []) {
  return args[0] === "build";
}

function removeFileIfPresent(filePath, label) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    console.warn(`[desktop-loader] Unable to remove ${label}: ${error?.message || error}`);
  }
}

function getNeutralinoDesktopOs() {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "darwin") return "Darwin";
  if (process.platform === "linux") return "Linux";
  return process.platform;
}

function createDesktopAuthPayload(authInfo) {
  return {
    NL_PORT: Number(authInfo.nlPort) || 0,
    NL_TOKEN: String(authInfo.nlToken || ""),
    NL_CTOKEN: String(authInfo.nlConnectToken || ""),
    NL_MODE: "window",
    NL_OS: getNeutralinoDesktopOs(),
    NL_ARGS: [],
    NL_PATH: ROOT_DIR.replace(/\\/g, "/"),
    NL_APPID: "js.neutralino.sample",
    NL_VERSION: "6.5.0",
    NL_CINJECTED: true,
  };
}

function startDesktopAuthInfoPublisher() {
  desktopAuthPayload = null;
  removeFileIfPresent(DESKTOP_AUTH_INFO_FILE, "stale Neutralino auth info");
  removeFileIfPresent(STALE_DESKTOP_AUTH_SCRIPT_FILE, "stale generated auth shim");
  const startedAt = Date.now();
  const timer = setInterval(() => {
    try {
      if (!fs.existsSync(DESKTOP_AUTH_INFO_FILE)) {
        if (Date.now() - startedAt > DESKTOP_AUTH_SCRIPT_TIMEOUT_MS) {
          console.warn(`[desktop-loader] Timed out waiting for ${DESKTOP_AUTH_INFO_FILE}`);
          clearInterval(timer);
        }
        return;
      }
      const authInfo = JSON.parse(fs.readFileSync(DESKTOP_AUTH_INFO_FILE, "utf8") || "{}");
      if (!authInfo.nlPort || !authInfo.nlToken) return;
      desktopAuthPayload = createDesktopAuthPayload(authInfo);
      removeFileIfPresent(DESKTOP_AUTH_INFO_FILE, "Neutralino auth info");
      console.log("[desktop-loader] Loaded Neutralino auth info into launcher memory and removed disk copy");
      clearInterval(timer);
    } catch (error) {
      console.warn(`[desktop-loader] Unable to load Neutralino auth info: ${error?.message || error}`);
      clearInterval(timer);
    }
  }, DESKTOP_AUTH_SCRIPT_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    desktopAuthPayload = null;
    removeFileIfPresent(DESKTOP_AUTH_INFO_FILE, "Neutralino auth info");
    removeFileIfPresent(STALE_DESKTOP_AUTH_SCRIPT_FILE, "stale generated auth shim");
  };
}

function getDesktopAuthAllowedOrigins() {
  if (!desktopAuthPayload?.NL_PORT) return new Set();
  return new Set([
    `http://127.0.0.1:${desktopAuthPayload.NL_PORT}`,
    `http://localhost:${desktopAuthPayload.NL_PORT}`,
  ]);
}

function getRequestOriginValue(request) {
  const origin = request.headers.origin;
  if (origin) return String(origin);
  const referer = request.headers.referer;
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch (_error) {
    return "";
  }
}

function getAllowedDesktopAuthOrigin(request) {
  const requestOrigin = getRequestOriginValue(request);
  if (!requestOrigin) return "";
  return getDesktopAuthAllowedOrigins().has(requestOrigin) ? requestOrigin : "";
}

function writeDesktopAuthCorsHeaders(response, origin, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  });
}
function resetDesktopLoaderConsoleLog() {
  try {
    fs.mkdirSync(path.dirname(DESKTOP_LOADER_CONSOLE_LOG), { recursive: true });
    fs.writeFileSync(DESKTOP_LOADER_CONSOLE_LOG, "", "utf8");
  } catch (error) {
    console.warn(`[desktop-loader] Unable to reset console bridge log: ${error?.message || error}`);
  }
}

function startDesktopLoaderConsoleServer() {
  resetDesktopLoaderConsoleLog();
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const server = http.createServer((request, response) => {
    if (request.url === DESKTOP_AUTH_INFO_ENDPOINT) {
      const allowedOrigin = getAllowedDesktopAuthOrigin(request);
      if (request.method === "OPTIONS") {
        if (!allowedOrigin) {
          response.writeHead(403, { "Cache-Control": "no-store" });
          response.end();
          return;
        }
        writeDesktopAuthCorsHeaders(response, allowedOrigin, 204);
        response.end();
        return;
      }

      if (request.method !== "GET") {
        response.writeHead(405, { "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "method_not_allowed" }));
        return;
      }

      if (!desktopAuthPayload) {
        response.writeHead(503, { "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "auth_not_ready" }));
        return;
      }

      if (!allowedOrigin) {
        response.writeHead(403, { "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "forbidden_origin" }));
        return;
      }

      writeDesktopAuthCorsHeaders(response, allowedOrigin, 200);
      response.end(JSON.stringify(desktopAuthPayload));
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/desktop-loader-log") {
      response.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      response.end();
      return;
    }

    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (body) process.stdout.write(body);
      response.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      response.end();
    });
  });

  server.on("error", (error) => {
    console.warn(`[desktop-loader] Unable to start WebView diagnostics receiver: ${error?.message || error}`);
    resolveReady(0);
  });
  server.listen(DESKTOP_LOADER_CONSOLE_PORT, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? Number(address.port) || 0 : 0;
    console.log(`[desktop-loader] Listening for WebView loader diagnostics on http://127.0.0.1:${port}/desktop-loader-log`);
    resolveReady(port);
  });
  return {
    ready,
    close() { server.close(); }
  };
}
function getNeutralinoRuntimeBinary() {
  const platformMap = {
    win32: "neutralino-win_x64.exe",
    linux: process.arch === "arm64" ? "neutralino-linux_arm64" : "neutralino-linux_x64",
    darwin: process.arch === "arm64" ? "neutralino-mac_arm64" : "neutralino-mac_x64",
  };

  const binaryName = platformMap[process.platform];
  if (!binaryName) return null;

  const candidate = path.join(ROOT_DIR, "bin", binaryName);
  return fs.existsSync(candidate) ? candidate : null;
}

function getCompiledDesktopIndexPath() {
  return path.join(ROOT_DIR, "resources", "index.html");
}

function ensureCompiledDesktopResources() {
  if (fs.existsSync(getCompiledDesktopIndexPath())) return true;
  console.error("Desktop resources are missing. Restore desktop-app/resources before launching the desktop app.");
  return false;
}

function getNeutralinoRuntimeRunArgs() {
  return [
    "--load-dir-res",
    "--path=.",
    "--export-auth-info",
  ];
}

function appendDesktopLoaderEndpointArg(args, port) {
  const normalizedPort = Number(port) || 0;
  if (!normalizedPort) return [...args];
  return [...args, `--url=/?desktopLoaderPort=${normalizedPort}`];
}

function runNeutralinoRuntime() {
  if (!ensureCompiledDesktopResources()) {
    process.exit(1);
  }

  const runtimeBinary = getNeutralinoRuntimeBinary();
  if (!runtimeBinary) {
    console.error("Neutralinojs runtime binary is missing. Run npm run setup while online to cache desktop binaries.");
    process.exit(1);
  }

  console.log("Launching cached Neutralino runtime.");
  run(runtimeBinary, getNeutralinoRuntimeRunArgs(), { desktopRuntime: true });
}

async function run(command, args, options = {}) {
  const stopDesktopAuthInfoPublisher = startDesktopAuthInfoPublisher();
  const desktopLoaderConsoleServer = startDesktopLoaderConsoleServer();
  const desktopLoaderPort = await desktopLoaderConsoleServer.ready;
  const launchArgs = options.desktopRuntime
    ? appendDesktopLoaderEndpointArg(args, desktopLoaderPort)
    : args;
  appendNativeStartupPerf(command, launchArgs);
  const cleanup = typeof options.cleanup === "function" ? options.cleanup : null;
  const child = spawn(command, launchArgs, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    try {
      cleanup?.();
    } catch (error) {
      console.warn(`[desktop-loader] Unable to clean temporary bundled documents: ${error?.message || error}`);
    }
    stopDesktopAuthInfoPublisher?.();
    desktopLoaderConsoleServer.close();
    // On Windows, Java-based language servers (JDT, LemMinX) spawned by Neutralino
    // survive the app exit and stay attached to the CMD console, keeping the window
    // open. This happens because Windows attaches child processes to the parent's
    // console at the process-creation level — independent of stdio handle inheritance
    // — so there is no way to prevent it from the spawning side without modifying
    // the Neutralino runtime itself.
    //
    // As a safety net, after Neutralino exits we use PowerShell to terminate any
    // lingering language server processes identified by their command-line signature
    // before this Node.js process itself exits.
    if (process.platform === "win32") {
      try {
        const { execFileSync } = require("child_process");
        const lsPatterns = ["eclipse.jdt.ls", "org.eclipse.lemminx"];
        const whereClause = lsPatterns
          .map((p) => `$_.CommandLine -like '*${p}*'`)
          .join(" -or ");
        const psCmd =
          `Get-CimInstance Win32_Process` +
          ` | Where-Object { ${whereClause} }` +
          ` | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
          stdio: "ignore",
          timeout: 5000,
        });
      } catch (_) {
        // Ignore — processes may have already exited, or PowerShell may be unavailable.
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const localNeu = getLocalNeuCommand();

  if (command === "run") {
    runNeutralinoRuntime();
    return;
  }

  if (localNeu) {
    const cleanupBundledRootDocuments = shouldPrepareBundledRootDocuments(args)
      ? prepareBundledRootDocuments()
      : null;
    run(localNeu, args, { cleanup: cleanupBundledRootDocuments });
  } else {
    console.error("Neutralinojs CLI package is not installed locally.");
    console.error(`Install @neutralinojs/neu@${NEU_VERSION} into desktop-app/node_modules before running build commands offline.`);
    console.error(`The '${command || "unknown"}' command was not started through npx to avoid offline network waits.`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  appendDesktopLoaderEndpointArg,
  appendNativeStartupPerf,
  ensureCompiledDesktopResources,
  getBundledRootDocumentEntries,
  getCompiledDesktopIndexPath,
  getNeutralinoRuntimeRunArgs,
  isNativeDebugCategoryEnabled,
  prepareBundledRootDocuments,
  readNativeDebugPreferences,
  shouldPrepareBundledRootDocuments,
  shouldWriteNativeStartupPerf,
};
