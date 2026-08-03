const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const PROJECT_PATH = "C:/Project";

function loadAutoScan(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/maven-build-path-auto-scan.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);

  const statusEvents = [];
  const modulePathEvents = [];
  const app = {
    modules: {
      statusManager: {
        setStatus(status) {
          statusEvents.push(["set", status.id, status.label, status.showProgress]);
        },
        unsetStatus(id) {
          statusEvents.push(["unset", id]);
        }
      },
      sidebarContextTree: {
        setMavenModulePaths(paths) {
          modulePathEvents.push(Array.from(paths));
        }
      }
    },
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const api = context.window.registerMarkdownViewerMavenBuildPathAutoScan(app, {
    Neutralino: {},
    osName: "Windows",
    getActiveFolderPath: options.getActiveFolderPath || (() => PROJECT_PATH),
    javaBuildPath: {
      loadConfiguration: async () => ({ buildSystem: options.buildSystem || "maven", sourceFolders: [] }),
      toStoredPath: (_projectPath, detectedPath) => detectedPath,
      validateSourceFolders: () => "",
      saveConfiguration: async (_projectPath, configuration) => configuration
    },
    mavenDetection: {
      detectProject: async () => ({ hasPom: options.hasPom !== false, projectRoot: PROJECT_PATH })
    },
    mavenSourceFolders: {
      ...(options.useLegacyScan
        ? { scan: options.scan || (async () => []) }
        : {
            scanProject: options.scanProject || (async () => ({
              sourceFolders: [],
              modules: options.modules || [{ absolutePath: PROJECT_PATH }]
            }))
          })
    }
  });
  return { api, statusEvents, modulePathEvents };
}

test("Maven module scan sets and releases its progress status", async () => {
  const { api, statusEvents } = loadAutoScan();

  await api.runAutoScan(PROJECT_PATH);

  assert.deepEqual(statusEvents, [
    ["set", "maven-module-scan", "Scanning folder for Maven modules...", true],
    ["unset", "maven-module-scan"]
  ]);
});

test("Maven module scan releases its status when discovery fails", async () => {
  const { api, statusEvents, modulePathEvents } = loadAutoScan({
    scanProject: async () => { throw new Error("scan failed"); }
  });

  assert.equal(await api.runAutoScan(PROJECT_PATH), null);
  assert.deepEqual(statusEvents, [
    ["set", "maven-module-scan", "Scanning folder for Maven modules...", true],
    ["unset", "maven-module-scan"]
  ]);
  assert.deepEqual(modulePathEvents, [[]]);
});

test("skipped Maven auto-scans do not set a status", async () => {
  const javacScan = loadAutoScan({ buildSystem: "javac" });
  const missingPomScan = loadAutoScan({ hasPom: false });

  await javacScan.api.runAutoScan(PROJECT_PATH);
  await missingPomScan.api.runAutoScan(PROJECT_PATH);

  assert.deepEqual(javacScan.statusEvents, []);
  assert.deepEqual(missingPomScan.statusEvents, []);
  assert.deepEqual(javacScan.modulePathEvents, [[]]);
  assert.deepEqual(missingPomScan.modulePathEvents, [[]]);
});

test("Maven module scan replaces cleared sidebar module paths after discovery", async () => {
  const { api, modulePathEvents } = loadAutoScan({
    modules: [
      { absolutePath: PROJECT_PATH },
      { absolutePath: `${PROJECT_PATH}/module-a` }
    ]
  });

  await api.runAutoScan(PROJECT_PATH);

  assert.deepEqual(modulePathEvents, [
    [],
    [PROJECT_PATH, `${PROJECT_PATH}/module-a`]
  ]);
});

test("legacy Maven source-folder scans remain supported without module paths", async () => {
  const { api, modulePathEvents } = loadAutoScan({ useLegacyScan: true });

  await api.runAutoScan(PROJECT_PATH);

  assert.deepEqual(modulePathEvents, [[], []]);
});

test("a completed scan does not publish module paths after the active folder changes", async () => {
  let activeFolderPath = PROJECT_PATH;
  const { api, modulePathEvents } = loadAutoScan({
    getActiveFolderPath: () => activeFolderPath,
    scanProject: async () => {
      activeFolderPath = "C:/OtherProject";
      return {
        sourceFolders: [],
        modules: [{ absolutePath: PROJECT_PATH }]
      };
    }
  });

  await api.runAutoScan(PROJECT_PATH);

  assert.deepEqual(modulePathEvents, [[]]);
});
