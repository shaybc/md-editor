const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerProjectTaskStore } = require("../resources/js/tasks/project-task-store.js");

function createFilesystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const writes = [];
  return {
    files,
    writes,
    async getStats(path) {
      if (!files.has(path)) throw new Error("not found");
      return { size: String(files.get(path)).length };
    },
    async createDirectory() {},
    async readFile(path) {
      if (!files.has(path)) throw new Error("not found");
      return files.get(path);
    },
    async writeFile(path, value) {
      writes.push(path);
      files.set(path, value);
    },
    async move(from, to) {
      if (!files.has(from)) throw new Error("not found");
      files.set(to, files.get(from));
      files.delete(from);
    },
    async remove(path) { files.delete(path); }
  };
}

function createStore(filesystem) {
  const modules = {};
  const app = { registerModule(name, value) { modules[name] = value; } };
  return registerMarkdownViewerProjectTaskStore(app, {
    isDesktopRuntime: () => true,
    Neutralino: { filesystem }
  });
}

test("project task store persists CRUD changes under .md-editor/tasks.json", async () => {
  const filesystem = createFilesystem();
  const store = createStore(filesystem);
  await store.openProject("C:/project");
  const created = await store.createTask({
    title: "Review parser",
    priority: "high",
    tags: "java, review",
    location: { path: "C:/project/src/Parser.java", line: 12, column: 3 }
  });
  assert.equal(store.getPersistencePath(), "C:/project/.md-editor/tasks.json");
  assert.deepEqual(created.tags, ["java", "review"]);
  assert.deepEqual(created.location, { path: "src/Parser.java", line: 12, column: 3 });
  await store.setTaskCompleted(created.id, true);
  assert.equal(store.getTask(created.id).status, "completed");
  await store.updateTask(created.id, { title: "Review Java parser", status: "in-progress" });
  assert.equal(store.getTask(created.id).title, "Review Java parser");
  await store.deleteTask(created.id);
  assert.equal(store.getTask(created.id), null);
  const document = JSON.parse(filesystem.files.get("C:/project/.md-editor/tasks.json"));
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.type, "md-editor-project-tasks");
  assert.deepEqual(document.tasks, []);
});

test("invalid project task documents are retained and block destructive saves", async () => {
  const path = "C:/project/.md-editor/tasks.json";
  const original = JSON.stringify({ schemaVersion: 99, tasks: [{ title: "keep me" }] });
  const filesystem = createFilesystem({ [path]: original });
  const store = createStore(filesystem);
  await store.openProject("C:/project");
  assert.equal(store.getState().error.code, "tasks-load-failed");
  await assert.rejects(store.createTask({ title: "must not overwrite" }), /Resolve the project tasks file/);
  assert.equal(filesystem.files.get(path), original);
});

test("JDT tasks remain read-only and are replaced as one snapshot", async () => {
  const store = createStore(createFilesystem());
  await store.openProject("C:/project");
  assert.equal(store.replaceJdtTasks({
    workspaceRoot: "C:/project",
    generationId: 4,
    snapshotId: "jdt-4",
    tasks: [{ id: "jdt:1", title: "TODO clean up", filePath: "C:/project/src/App.java", line: 8, column: 2 }]
  }), true);
  const task = store.getTask("jdt:1");
  assert.equal(task.readOnly, true);
  assert.deepEqual(task.location, { path: "src/App.java", line: 8, column: 2 });
  assert.equal(store.getState().jdt.snapshotId, "jdt-4");
  assert.equal(store.replaceJdtTasks({ workspaceRoot: "C:/other", generationId: 5, snapshotId: "wrong", tasks: [] }), false);
  assert.equal(store.getState().jdtTasks.length, 1);
});
