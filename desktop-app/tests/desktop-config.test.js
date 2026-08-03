const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

test("desktop native allow list supports binary export writes", () => {
  const configPath = path.join(repoRoot, "desktop-app", "neutralino.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  const allowList = new Set(config.nativeAllowList || []);

  assert.equal(allowList.has("filesystem.readBinaryFile"), true);
  assert.equal(allowList.has("filesystem.writeBinaryFile"), true);
  assert.equal(allowList.has("filesystem.appendFile"), true);
  assert.equal(allowList.has("filesystem.copy"), true);
});

test("desktop native allow list supports folder watchers", () => {
  const configPath = path.join(repoRoot, "desktop-app", "neutralino.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  const allowList = new Set(config.nativeAllowList || []);

  assert.equal(allowList.has("filesystem.createWatcher"), true);
  assert.equal(allowList.has("filesystem.removeWatcher"), true);
  assert.equal(allowList.has("filesystem.getWatchers"), true);
});

test("desktop native allow list supports terminal clipboard paste", () => {
  const configPath = path.join(repoRoot, "desktop-app", "neutralino.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  const allowList = new Set(config.nativeAllowList || []);

  assert.equal(allowList.has("clipboard.readText"), true);
});

test("desktop window starts hidden for themed startup reveal", () => {
  const configPath = path.join(repoRoot, "desktop-app", "neutralino.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));

  assert.equal(config.modes.window.hidden, false);
});

test("desktop packages are generated in the repository distribution folder", () => {
  const configPath = path.join(repoRoot, "desktop-app", "neutralino.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));

  assert.equal(config.cli.distributionPath, "/../dist/");
});

test("desktop tray version is promoted with app metadata", () => {
  const packagePath = path.join(repoRoot, "desktop-app", "package.json");
  const mainPath = path.join(repoRoot, "desktop-app", "resources", "js", "main.js");
  const promoteScriptPath = path.join(repoRoot, ".tools", "promote-version.ps1");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, ""));
  const mainScript = fs.readFileSync(mainPath, "utf8").replace(/^\uFEFF/, "");
  const promoteScript = fs.readFileSync(promoteScriptPath, "utf8").replace(/^\uFEFF/, "");

  assert.match(mainScript, new RegExp(`const MD_EDITOR_DESKTOP_VERSION = "${packageJson.version.replace(/\./g, "\\.")}";`));
  assert.match(promoteScript, /MD_EDITOR_DESKTOP_VERSION/);
});


test("desktop exit waits for language-server shutdown", () => {
  const mainPath = path.join(repoRoot, "desktop-app", "resources", "js", "main.js");
  const shutdownPath = path.join(repoRoot, "desktop-app", "resources", "js", "desktop-lsp-shutdown.js");
  const appScriptPath = path.join(repoRoot, "desktop-app", "resources", "js", "script.js");
  const indexPath = path.join(repoRoot, "desktop-app", "resources", "index.html");
  const mainScript = fs.readFileSync(mainPath, "utf8").replace(/^﻿/, "");
  const shutdownScript = fs.readFileSync(shutdownPath, "utf8").replace(/^﻿/, "");
  const appScript = fs.readFileSync(appScriptPath, "utf8").replace(/^﻿/, "");
  const indexHtml = fs.readFileSync(indexPath, "utf8").replace(/^﻿/, "");
  const cleanupIndex = mainScript.indexOf("await stopLanguageServerProcessesBeforeExit();");
  const saveIndex = mainScript.indexOf("await saveDesktopWindowState();");
  const exitIndex = mainScript.indexOf("Neutralino.app.exit();");
  const scriptCleanupIndex = appScript.indexOf("await stopLanguageServerProcessesBeforeExit();");
  const scriptExitIndex = appScript.indexOf("await Neutralino.app.exit();");
  const scriptCleanupCalls = appScript.match(/await stopLanguageServerProcessesBeforeExit\(\);/g) || [];
  const scriptExitCalls = appScript.match(/await Neutralino\.app\.exit\(\);/g) || [];

  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(saveIndex, -1);
  assert.notEqual(exitIndex, -1);
  assert.ok(cleanupIndex < saveIndex);
  assert.ok(saveIndex < exitIndex);
  assert.notEqual(scriptCleanupIndex, -1);
  assert.notEqual(scriptExitIndex, -1);
  assert.ok(scriptCleanupIndex < scriptExitIndex);
  assert.equal(scriptCleanupCalls.length, scriptExitCalls.length);
  assert.equal(mainScript.includes("window.markdownViewerStopLanguageServerProcessesBeforeExit"), true);
  assert.equal(appScript.includes("window.markdownViewerStopLanguageServerProcessesBeforeExit"), true);
  assert.equal(mainScript.includes("window.markdownViewerRequestApplicationExit"), true);
  assert.equal(mainScript.includes("window.markdownViewerConfirmDiscardUnsavedBeforeExit"), false);
  assert.equal(appScript.includes("window.markdownViewerConfirmDiscardUnsavedBeforeExit"), false);
  assert.equal(shutdownScript.includes("window.markdownViewerApp?.modules?.jdtProxyClient"), true);
  assert.equal(shutdownScript.includes("window.markdownViewerApp?.modules?.neutralinoLspBridge"), true);
  assert.equal(shutdownScript.includes("await lspBridge.stopAllSessions();"), true);
  assert.equal(shutdownScript.includes("stopAllSessions?.({ force: true })"), false);
  assert.ok(shutdownScript.indexOf("await lspBridge.stopAllSessions();") < shutdownScript.indexOf("await jdtProxyClient?.stopAllSessions?.();"));
  assert.ok(indexHtml.indexOf('loadScript("js/desktop-lsp-shutdown.js")') < indexHtml.indexOf('loadScript("js/main.js")'));
});

test("desktop exit stops JDT after generic language servers stop", async () => {
  const shutdownPath = path.join(repoRoot, "desktop-app", "resources", "js", "desktop-lsp-shutdown.js");
  const shutdownScript = fs.readFileSync(shutdownPath, "utf8").replace(/^\uFEFF/, "");
  const calls = [];
  const window = {
    markdownViewerApp: {
      modules: {
        neutralinoLspBridge: {
          async stopAllSessions() { calls.push("lsp"); }
        },
        jdtProxyClient: {
          async stopAllSessions() { calls.push("jdt"); }
        }
      }
    }
  };

  vm.runInNewContext(shutdownScript, { window, console });
  await window.markdownViewerStopLanguageServerProcessesBeforeExit();

  assert.deepEqual(calls, ["lsp", "jdt"]);
});

test("desktop exit still stops JDT when generic language-server shutdown fails", async () => {
  const shutdownPath = path.join(repoRoot, "desktop-app", "resources", "js", "desktop-lsp-shutdown.js");
  const shutdownScript = fs.readFileSync(shutdownPath, "utf8").replace(/^\uFEFF/, "");
  const calls = [];
  const window = {
    markdownViewerApp: {
      modules: {
        neutralinoLspBridge: {
          async stopAllSessions() {
            calls.push("lsp");
            throw new Error("generic shutdown failed");
          }
        },
        jdtProxyClient: {
          async stopAllSessions() { calls.push("jdt"); }
        }
      }
    }
  };
  const warnings = [];

  vm.runInNewContext(shutdownScript, {
    window,
    console: { warn(...args) { warnings.push(args); } }
  });
  await window.markdownViewerStopLanguageServerProcessesBeforeExit();

  assert.deepEqual(calls, ["lsp", "jdt"]);
  assert.equal(warnings.length, 1);
});
