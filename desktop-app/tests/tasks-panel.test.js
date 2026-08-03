const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { selectVisibleTasks, createSummaryText, getTaskPrimaryAction, getTaskContextAvailability } = require("../resources/js/panels/tasks-panel.js");

const tasks = [
  { id: "user-high", origin: "user", status: "open", priority: "high", title: "Fix parser", description: "", tags: ["java"], location: { path: "src/Parser.java" } },
  { id: "user-done", origin: "user", status: "completed", priority: "low", title: "Write guide", description: "Docs", tags: [], location: null },
  { id: "jdt-todo", origin: "jdt", status: "open", priority: null, title: "TODO cleanup", description: "", tags: [], location: { path: "src/App.java" } }
];

test("Tasks filtering searches user and JDT rows and sorting remains deterministic", () => {
  const preferences = { source: "all", status: "open", priority: "all", sort: "priority", direction: "asc" };
  assert.deepEqual(selectVisibleTasks(tasks, preferences).map((task) => task.id), ["user-high", "jdt-todo"]);
  assert.deepEqual(selectVisibleTasks(tasks, { ...preferences, source: "jdt" }, "cleanup").map((task) => task.id), ["jdt-todo"]);
  assert.deepEqual(selectVisibleTasks(tasks, { ...preferences, source: "user" }, "parser.java").map((task) => task.id), ["user-high"]);
});

test("task row clicks route user tasks to details and Java tasks to source", () => {
  assert.equal(getTaskPrimaryAction(tasks[0]), "details");
  assert.equal(getTaskPrimaryAction(tasks[2]), "source");
  const panel = fs.readFileSync(path.join(__dirname, "../resources/js/panels/tasks-panel.js"), "utf8");
  const startup = fs.readFileSync(path.join(__dirname, "../resources/js/script.js"), "utf8");
  assert.match(panel, /row\.addEventListener\("click", openTask\)/);
  assert.match(panel, /deps\.openTaskLocation\?\.\(task\)/);
  assert.match(panel, /else showTaskDialog\(task\)/);
  assert.match(startup, /getEditorOffsetForLspPosition\(task\.range\.start\)/);
  assert.match(startup, /selectEditorTextRange\(markerStart, Math\.max\(markerStart \+ 1, markerEnd\)\)/);
});

test("task context actions reflect user and Java task capabilities", () => {
  assert.deepEqual(getTaskContextAvailability(tasks[0]), {
    details: true,
    openSource: true,
    toggleComplete: true,
    convert: false,
    delete: true
  });
  assert.deepEqual(getTaskContextAvailability(tasks[2]), {
    details: true,
    openSource: true,
    toggleComplete: false,
    convert: true,
    delete: false
  });
  const panel = fs.readFileSync(path.join(__dirname, "../resources/js/panels/tasks-panel.js"), "utf8");
  assert.match(panel, /row\.addEventListener\("contextmenu"/);
  assert.match(panel, /graph-context-menu tasks-panel-context-menu hidden/);
  assert.match(panel, /data-action="complete"/);
  assert.match(panel, /data-action="convert"/);
  assert.match(panel, /data-action="delete"/);
});

test("Tasks summary retains previous rows during refresh and incomplete analysis", () => {
  const base = { userTasks: tasks.slice(0, 2), jdtTasks: tasks.slice(2), jdt: { status: "ready" } };
  assert.equal(createSummaryText({ ...base, jdt: { status: "refreshing" } }, 3), "3 tasks · 2 user · 1 Java · Refreshing Java tasks — showing previous completed analysis");
  assert.equal(createSummaryText({ ...base, jdt: { status: "incomplete" } }, 3), "3 tasks · 2 user · 1 Java · Java task analysis incomplete — previous completed tasks retained");
});
test("Tasks compact layout moves controls into the status row and table headers", () => {
  const panel = fs.readFileSync(path.join(__dirname, "../resources/js/panels/tasks-panel.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../resources/styles.css"), "utf8");
  assert.doesNotMatch(panel, /tasks-panel-toolbar/);
  assert.match(panel, /tasks-panel-source-counts/);
  assert.doesNotMatch(panel, /id="tasks-panel-summary"/);
  assert.match(panel, /data-tasks-user-count/);
  assert.match(panel, /data-tasks-java-count/);
  assert.match(panel, /tasks-panel-sort-label/);
  assert.match(panel, /data-tasks-filter="sort"/);
  assert.match(panel, /class="tasks-panel-header-filter" data-tasks-filter="status"/);
  assert.match(panel, /class="tasks-panel-header-filter" data-tasks-filter="priority"/);
  assert.match(panel, /class="tasks-panel-header-filter" data-tasks-filter="source"/);
  assert.match(styles, /\.tasks-panel-view \.find-in-files-results-status-row \{[\s\S]*grid-template-columns/);
  assert.match(styles, /\.tasks-panel-header-filter/);
  assert.match(styles, /\.tasks-panel-table th:nth-child\(1\) \{ width: 96px; \}/);
  assert.match(styles, /\.tasks-panel-table th:nth-child\(3\) \{ width: 104px; \}/);
  assert.match(styles, /\.tasks-panel-table th:nth-child\(6\) \{ width: 104px; \}/);
});

test("Tasks modules and view load before the legacy application startup", () => {
  const index = fs.readFileSync(path.join(__dirname, "../resources/index.html"), "utf8");
  const storeIndex = index.indexOf('src="js/tasks/project-task-store.js"');
  const sourceIndex = index.indexOf('src="js/tasks/jdt-task-source.js"');
  const panelIndex = index.indexOf('src="js/panels/tasks-panel.js"');
  const startupIndex = index.indexOf('loadScript("js/script.js")');
  assert.equal(index.includes('id="bottom-panel-tasks"'), true);
  assert.equal(storeIndex > 0 && sourceIndex > storeIndex && panelIndex > sourceIndex && startupIndex > panelIndex, true);
});

test("View menu exposes the Tasks panel after the bottom panel is closed", () => {
  const index = fs.readFileSync(path.join(__dirname, "../resources/index.html"), "utf8");
  const menu = fs.readFileSync(path.join(__dirname, "../resources/js/ui/application-menu.js"), "utf8");
  const commands = fs.readFileSync(path.join(__dirname, "../resources/js/project/project-command-menu.js"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "../resources/js/panels/tasks-panel.js"), "utf8");
  assert.match(index, /view-menu-submenu[\s\S]*data-project-command="show-tasks"/);
  assert.doesNotMatch(menu, /data-project-command="show-tasks"/);
  assert.match(commands, /commandName === "show-tasks"/);
  assert.match(commands, /deps\.tasksPanel\?\.toggle/);
  assert.match(index, /tasks-toggle-label">Show Tasks<\/span><span class="menu-shortcut-label">F9/);
  assert.match(panel, /visible \? "Hide Tasks" : "Show Tasks"/);
  assert.match(panel, /new global\.MutationObserver\(updateToggleButtons\)/);
});

test("Tasks is closable and Show Tasks recreates the removed tab", () => {
  const panel = fs.readFileSync(path.join(__dirname, "../resources/js/panels/tasks-panel.js"), "utf8");
  assert.match(panel, /permanent: false/);
  assert.match(panel, /if \(!view\?\.parentElement\) addTasksTab\(\{ activate: true \}\)/);
  assert.match(panel, /bottomPanel\?\.isPanelVisible\?\.\(\)/);
  assert.match(panel, /bottomPanel\?\.getActiveTabId\?\.\(\) === "tasks"/);
  assert.match(panel, /bottomPanel\?\.hidePanel\?\.\(\)/);
});
