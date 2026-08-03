const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const model = require("../resources/js/background-processes/process-entry.js");
const { registerMarkdownViewerBackgroundProcesses } = require("../resources/js/background-processes/history-store.js");

function createStore(options = {}) {
  let state = { backgroundProcessHistory: options.history || [] };
  let timestamp = options.now || 1000;
  const app = {
    modules: {},
    registerModule(name, api) { this.modules[name] = api; }
  };
  const store = registerMarkdownViewerBackgroundProcesses(app, {
    model,
    now: () => timestamp,
    historyLimit: options.historyLimit,
    loadGlobalState: () => state,
    saveGlobalState: (patch) => { state = { ...state, ...patch }; },
    shouldConfirmCancel: options.shouldConfirmCancel || (() => false),
    confirm: options.confirm,
    notifyError: options.notifyError
  });
  return {
    store,
    setNow(value) { timestamp = value; },
    getSavedState() { return state; }
  };
}

test("background process keeps one evolving row and persists terminal duration", () => {
  const harness = createStore();
  harness.store.start({ ownerId: "java", description: "Detecting", icon: "bi-cup-hot" });
  harness.setNow(1500);
  harness.store.update("java", { description: "Importing" });
  assert.equal(harness.store.getEntries().length, 1);
  assert.equal(harness.store.getEntries()[0].description, "Importing");
  harness.setNow(2500);
  harness.store.finish("java");
  const entry = harness.store.getEntries()[0];
  assert.equal(entry.status, "finished");
  assert.equal(model.getDuration(entry), 1500);
  assert.equal(harness.getSavedState().backgroundProcessHistory[0].status, "finished");
});

test("restored running entries become cancelled", () => {
  const harness = createStore({
    history: [{ id: "old", ownerId: "old", description: "Interrupted", status: "running", startedAt: 100, updatedAt: 800 }]
  });
  const entry = harness.store.getEntries()[0];
  assert.equal(entry.status, "cancelled");
  assert.equal(entry.endedAt, 800);
});

test("clear completed and delete preserve running entries", () => {
  const harness = createStore();
  harness.store.start({ ownerId: "running", description: "Running" });
  harness.store.start({ ownerId: "done", description: "Done" });
  harness.store.finish("done");
  const running = harness.store.getEntries().find((entry) => entry.ownerId === "running");
  assert.equal(harness.store.remove(running.id), false);
  assert.equal(harness.store.clearCompleted(), true);
  assert.deepEqual(harness.store.getEntries().map((entry) => entry.ownerId), ["running"]);
});

test("cancellation confirmation gates the owner callback", async () => {
  let calls = 0;
  const decisions = [false, true];
  const harness = createStore({
    shouldConfirmCancel: () => true,
    confirm: async () => decisions.shift()
  });
  const entry = harness.store.start({
    ownerId: "build",
    description: "Building",
    onCancel: async () => { calls += 1; return true; }
  });
  assert.equal(await harness.store.requestCancel(entry.id), false);
  assert.equal(calls, 0);
  assert.equal(await harness.store.requestCancel(entry.id), true);
  assert.equal(calls, 1);
});

test("history retains only the configured newest terminal entries", () => {
  const harness = createStore({ historyLimit: 2 });
  for (let index = 0; index < 3; index += 1) {
    harness.setNow(1000 + index);
    harness.store.start({ ownerId: `job-${index}`, description: `Job ${index}` });
    harness.store.finish(`job-${index}`);
  }
  assert.deepEqual(harness.store.getEntries().map((entry) => entry.ownerId), ["job-2", "job-1"]);
});

test("language analysis background processes use bundled icons", () => {
  const kotlinCoordinator = fs.readFileSync(path.join(__dirname, "../resources/js/lsp/kotlin-workspace-coordinator.js"), "utf8");
  const startup = fs.readFileSync(path.join(__dirname, "../resources/js/script.js"), "utf8");
  assert.match(kotlinCoordinator, /category: "kotlin", icon: "bi-braces"/);
  assert.doesNotMatch(kotlinCoordinator, /bi-filetype-kt/);
  assert.match(startup, /category: "aspectj", icon: "bi-bounding-box-circles"/);
  assert.match(startup, /AJDT_BACKGROUND_PROCESS_ID/);
});
test("background processes body owns resize scrolling below the toolbar", () => {
  const css = fs.readFileSync(path.join(__dirname, "../resources/css/ui/background-processes.css"), "utf8");
  assert.match(css, /\.background-processes-view\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/);
  assert.match(css, /\.background-processes-toolbar\s*\{[\s\S]*flex:\s*0 0 auto;/);
  assert.match(css, /\.background-processes-body\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*auto;/);
  assert.doesNotMatch(css, /\.background-processes-body\s*\{[\s\S]*height:\s*100%;/);
});
