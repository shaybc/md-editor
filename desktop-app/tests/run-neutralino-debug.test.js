const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const {
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
  shouldWriteNativeStartupPerf
} = require(path.join(repoRoot, "desktop-app", "run-neutralino.js"));

function createProfile(state) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-profile-"));
  const dataDir = path.join(profileDir, ".md-editor");
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, "preferences.json"), JSON.stringify({ state }), "utf8");
  return {
    env: {
      HOME: profileDir,
      USERPROFILE: profileDir
    },
    profileDir
  };
}

test("cached runtime args omit Neutralino dev tools for production startup", () => {
  assert.deepEqual(getNeutralinoRuntimeRunArgs(), [
    "--load-dir-res",
    "--path=.",
    "--export-auth-info"
  ]);
});

test("desktop runtime receives the dynamically selected loader endpoint", () => {
  assert.deepEqual(appendDesktopLoaderEndpointArg(getNeutralinoRuntimeRunArgs(), 32191), [
    "--load-dir-res",
    "--path=.",
    "--export-auth-info",
    "--url=/?desktopLoaderPort=32191"
  ]);
  assert.deepEqual(appendDesktopLoaderEndpointArg(getNeutralinoRuntimeRunArgs(), 0), getNeutralinoRuntimeRunArgs());
});

test("desktop runtime preflight checks compiled resources", () => {
  assert.equal(getCompiledDesktopIndexPath(), path.join(repoRoot, "desktop-app", "resources", "index.html"));
  assert.equal(ensureCompiledDesktopResources(), fs.existsSync(getCompiledDesktopIndexPath()));
});

test("desktop build temporarily bundles root README and LICENSE", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-doc-bundle-"));
  const rootDir = path.join(repoDir, "desktop-app");
  const resourcesDir = path.join(rootDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Root README\n", "utf8");
  fs.writeFileSync(path.join(repoDir, "LICENSE"), "Root license\n", "utf8");

  const entries = getBundledRootDocumentEntries(rootDir);
  const cleanup = prepareBundledRootDocuments(entries);

  assert.equal(fs.readFileSync(path.join(resourcesDir, "README.md"), "utf8"), "# Root README\n");
  assert.equal(fs.readFileSync(path.join(resourcesDir, "LICENSE"), "utf8"), "Root license\n");

  cleanup();

  assert.equal(fs.existsSync(path.join(resourcesDir, "README.md")), false);
  assert.equal(fs.existsSync(path.join(resourcesDir, "LICENSE")), false);
});

test("desktop build document bundling only runs for Neutralino build", () => {
  assert.equal(shouldPrepareBundledRootDocuments(["build", "--embed-resources"]), true);
  assert.equal(shouldPrepareBundledRootDocuments(["run"]), false);
});

test("native startup perf logging is disabled without the debug switch", () => {
  const logPath = path.join(os.tmpdir(), `md-editor-native-${Date.now()}-disabled.log`);
  const profile = createProfile({
    debugEnabled: false,
    debugWriteToFile: true,
    debugLogPath: logPath
  });

  const wrote = appendNativeStartupPerf("neutralino-win_x64.exe", ["--load-dir-res"], profile.env);

  assert.equal(wrote, false);
  assert.equal(fs.existsSync(logPath), false);
});

test("native startup perf logging writes only to configured debug log path", () => {
  const logPath = path.join(os.tmpdir(), `md-editor-native-${Date.now()}-enabled.log`);
  const profile = createProfile({
    debugEnabled: true,
    debugLevel: "info",
    debugWriteToFile: true,
    debugLogPath: logPath
  });

  const preferences = readNativeDebugPreferences(profile.env);
  const wrote = appendNativeStartupPerf("neutralino-win_x64.exe", ["--load-dir-res"], profile.env);

  assert.equal(shouldWriteNativeStartupPerf(preferences), true);
  assert.equal(wrote, true);
  assert.match(fs.readFileSync(logPath, "utf8"), /\[startup-perf-native\].*neutralino-win_x64\.exe --load-dir-res/);
});

test("native startup perf logging creates missing log directory path", () => {
  const logPath = path.join(os.tmpdir(), `md-editor-native-${Date.now()}`, "nested", "startup.log");
  const profile = createProfile({
    debugEnabled: true,
    debugLevel: "info",
    debugWriteToFile: true,
    debugLogPath: logPath
  });

  const wrote = appendNativeStartupPerf("neutralino-win_x64.exe", ["--load-dir-res"], profile.env);

  assert.equal(wrote, true);
  assert.equal(fs.existsSync(path.dirname(logPath)), true);
  assert.match(fs.readFileSync(logPath, "utf8"), /\[startup-perf-native\].*neutralino-win_x64\.exe --load-dir-res/);
});

test("native startup perf logging honors debug level", () => {
  const logPath = path.join(os.tmpdir(), `md-editor-native-${Date.now()}-level.log`);
  const profile = createProfile({
    debugEnabled: true,
    debugLevel: "warning",
    debugWriteToFile: true,
    debugLogPath: logPath
  });

  const wrote = appendNativeStartupPerf("neutralino-win_x64.exe", ["--load-dir-res"], profile.env);

  assert.equal(wrote, false);
  assert.equal(fs.existsSync(logPath), false);
});

test("native startup perf logging honors disabled startup perf category", () => {
  const logPath = path.join(os.tmpdir(), `md-editor-native-${Date.now()}-category.log`);
  const profile = createProfile({
    debugCategories: {
      "startup-perf": false
    },
    debugEnabled: true,
    debugLevel: "info",
    debugWriteToFile: true,
    debugLogPath: logPath
  });

  const preferences = readNativeDebugPreferences(profile.env);
  const wrote = appendNativeStartupPerf("neutralino-win_x64.exe", ["--load-dir-res"], profile.env);

  assert.equal(isNativeDebugCategoryEnabled(preferences, "startup-perf"), false);
  assert.equal(shouldWriteNativeStartupPerf(preferences), false);
  assert.equal(wrote, false);
  assert.equal(fs.existsSync(logPath), false);
});
