const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerJdtTaskSource } = require("../resources/js/tasks/jdt-task-source.js");

function createTaskStore(workspaceRoot = "C:/project") {
  const state = { workspaceRoot, jdtTasks: [], jdt: { status: "idle", generationId: 0, snapshotId: "" } };
  return {
    getState: () => ({ ...state, jdtTasks: [...state.jdtTasks], jdt: { ...state.jdt } }),
    setJdtSourceState(next) { state.jdt = { ...state.jdt, ...next }; return true; },
    replaceJdtTasks(snapshot) {
      if (snapshot.workspaceRoot !== state.workspaceRoot) return false;
      state.jdtTasks = [...snapshot.tasks];
      state.jdt = { status: "ready", generationId: snapshot.generationId, snapshotId: snapshot.snapshotId };
      return true;
    },
    clearJdtTasks() { state.jdtTasks = []; state.jdt = { status: "idle", generationId: 0, snapshotId: "" }; }
  };
}

test("JDT task source installs only the snapshot committed by Problems", async () => {
  const taskStore = createTaskStore();
  let problemsListener = null;
  const requests = [];
  const source = registerMarkdownViewerJdtTaskSource({ registerModule() {} }, {
    taskStore,
    getWorkspaceRoot: () => "C:/project",
    projectProblemsBroker: { subscribe(listener) { problemsListener = listener; listener({}); return () => {}; } },
    async getJdtTasks(options) {
      requests.push(options);
      return { ...options, tasks: [{ id: "jdt:1", title: "TODO" }], totalCount: 1, availableCount: 1 };
    }
  });
  problemsListener({ workspaceRoot: "C:/project", generationId: 7, providerCounts: { jdt: { snapshotId: "snap-7" } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].generationId, 7);
  assert.equal(requests[0].snapshotId, "snap-7");
  assert.equal(taskStore.getState().jdtTasks[0].id, "jdt:1");
  assert.equal(taskStore.getState().jdt.status, "ready");
  source.dispose();
});

test("a superseded JDT task request cannot replace the newer generation", async () => {
  const taskStore = createTaskStore();
  const resolvers = new Map();
  const source = registerMarkdownViewerJdtTaskSource({ registerModule() {} }, {
    taskStore,
    getWorkspaceRoot: () => "C:/project",
    getJdtTasks(options) {
      return new Promise((resolve) => resolvers.set(options.snapshotId, { resolve, options }));
    }
  });
  const oldRequest = source.refresh({ workspaceRoot: "C:/project", generationId: 1, snapshotId: "old" });
  const newRequest = source.refresh({ workspaceRoot: "C:/project", generationId: 2, snapshotId: "new" });
  resolvers.get("new").resolve({ ...resolvers.get("new").options, tasks: [{ id: "new" }], totalCount: 1 });
  await newRequest;
  resolvers.get("old").resolve({ ...resolvers.get("old").options, tasks: [{ id: "old" }], totalCount: 1 });
  await oldRequest;
  assert.deepEqual(taskStore.getState().jdtTasks.map((task) => task.id), ["new"]);
  assert.equal(taskStore.getState().jdt.snapshotId, "new");
});

test("a committed generation without JDT clears tasks from the prior generation", () => {
  const taskStore = createTaskStore();
  taskStore.replaceJdtTasks({ workspaceRoot: "C:/project", generationId: 1, snapshotId: "old", tasks: [{ id: "old" }] });
  const source = registerMarkdownViewerJdtTaskSource({ registerModule() {} }, {
    taskStore,
    getWorkspaceRoot: () => "C:/project"
  });
  source.acceptProblemsSummary({ workspaceRoot: "C:/project", generationId: 2, providerCounts: {} });
  assert.deepEqual(taskStore.getState().jdtTasks, []);
  assert.equal(taskStore.getState().jdt.status, "idle");
});

test("starting a newer analysis generation invalidates an older task read", async () => {
  const taskStore = createTaskStore();
  let resolveRequest;
  const source = registerMarkdownViewerJdtTaskSource({ registerModule() {} }, {
    taskStore,
    getWorkspaceRoot: () => "C:/project",
    getJdtTasks(options) {
      return new Promise((resolve) => { resolveRequest = () => resolve({ ...options, tasks: [{ id: "stale" }], totalCount: 1 }); });
    }
  });
  const request = source.refresh({ workspaceRoot: "C:/project", generationId: 4, snapshotId: "snap-4" });
  source.onAnalysisGenerationState({ workspaceRoot: "C:/project", generationId: 5, status: "running" });
  resolveRequest();
  assert.equal(await request, false);
  assert.deepEqual(taskStore.getState().jdtTasks, []);
  assert.equal(taskStore.getState().jdt.status, "refreshing");
});
