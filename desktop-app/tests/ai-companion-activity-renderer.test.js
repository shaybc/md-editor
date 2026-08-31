const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.isConnected = false;
    this.listeners = new Map();
    this.classList = {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.add(name));
        this.className = Array.from(values).join(" ");
      },
      remove: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.delete(name));
        this.className = Array.from(values).join(" ");
      },
      contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name)
    };
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentNode = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.isConnected = false;
    return child;
  }

  insertBefore(child, reference) {
    const index = this.children.indexOf(reference);
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    child.isConnected = true;
    this.children.splice(index, 0, child);
    return child;
  }

  after(...nodes) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index < 0) return;
    nodes.forEach((node, offset) => {
      node.parentNode = this.parentNode;
      node.isConnected = this.parentNode.isConnected;
      this.parentNode.children.splice(index + offset + 1, 0, node);
    });
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] || null : null;
  }

  querySelector(selector) {
    const matches = (element) => selector === element.tagName?.toLowerCase() || selector === element.tagName;
    const stack = [...this.children];
    while (stack.length) {
      const child = stack.shift();
      if (matches(child)) return child;
      if (child.children) stack.push(...child.children);
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ target: this });
  }
}

function createHarness(renderMarkdownContent, options = {}) {
  const context = {
    console,
    setTimeout: () => {},
    document: {
      createElement: (tagName) => new FakeElement(tagName),
      createTextNode: (text) => ({ textContent: String(text), isTextNode: true })
    },
    window: null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "copy-actions.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "activity-renderer.js"), "utf8"), context);

  const container = new FakeElement("div");
  container.isConnected = true;
  const scrollEvents = [];
  const renderer = context.createMarkdownViewerAiCompanionActivityRenderer({
    container,
    renderMarkdownContent,
    scrollToEnd: () => scrollEvents.push("scroll"),
    openMarkdownInNewTab: options.openMarkdownInNewTab,
    openCompare: options.openCompare,
    openExternalUrl: options.openExternalUrl,
    onContinueTask: options.onContinueTask,
    onSplitTask: options.onSplitTask,
    onRollbackTask: options.onRollbackTask,
    onRollbackFile: options.onRollbackFile,
    onRollbackAction: options.onRollbackAction,
    onShowFileHistory: options.onShowFileHistory,
    isRollbackDisabled: options.isRollbackDisabled
  });
  return { container, renderer, scrollEvents };
}

function findByClass(element, className) {
  if (!element) return null;
  if (element.className?.split(/\s+/).includes(className)) return element;
  for (const child of element.children || []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function findAllByClass(element, className, matches = []) {
  if (!element) return matches;
  if (element.className?.split(/\s+/).includes(className)) matches.push(element);
  for (const child of element.children || []) findAllByClass(child, className, matches);
  return matches;
}

test("AI Companion final response renders through shared markdown renderer", () => {
  const renderCalls = [];
  const harness = createHarness((target, markdown, options) => {
    renderCalls.push({ markdown, options });
    target.classList.add("markdown-body");
    target.innerHTML = '<ol><li><strong>Use names</strong></li></ol><pre><code class="hljs python">total = 120</code></pre>';
    return true;
  });

  harness.renderer.appendSummary({
    elapsedMs: 1000,
    completedAt: Date.UTC(2026, 0, 1, 9, 5),
    outcome: "Completed.",
    finalResponse: "1. **Use names**\n\n```python\ntotal = 120\n```",
    changedFiles: [],
    attemptedChanges: []
  });

  const resultArea = harness.container.children[0];
  const summary = resultArea.children[0];
  const response = findByClass(summary, "ai-companion-final-response");
  const workedFooter = findByClass(summary, "ai-companion-summary-worked-footer");
  assert.equal(resultArea.children.length, 2);
  assert.match(summary.className, /ai-companion-run-summary/);
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].markdown, "1. **Use names**\n\n```python\ntotal = 120\n```");
  assert.deepEqual(JSON.parse(JSON.stringify(renderCalls[0].options)), { renderFrontmatter: false });
  assert.match(response.className, /ai-companion-final-response/);
  assert.match(response.className, /markdown-body/);
  assert.match(response.innerHTML, /<strong>Use names<\/strong>/);
  assert.match(response.innerHTML, /class="hljs python"/);
  assert.equal(workedFooter.textContent, "Worked for 1s");
  const timestamp = findByClass(summary.nextElementSibling, "ai-companion-box-timestamp");
  assert.ok(timestamp);
  assert.match(timestamp.textContent, /\d/);
  assert.equal(harness.scrollEvents.length, 1);
});


test("AI Companion model response actions show copy, open in new tab, split, then timestamp", () => {
  const splitEvents = [];
  const harness = createHarness(null, { openMarkdownInNewTab: () => {}, onSplitTask: (event) => splitEvents.push(event) });
  const completedAt = Date.UTC(2026, 0, 1, 9, 5);

  harness.renderer.appendSummary({
    elapsedMs: 1000,
    completedAt,
    finalResponse: "## Result\n\nDone.",
    changedFiles: [],
    attemptedChanges: []
  });

  const summary = harness.container.children[0].children[0];
  const actions = summary.nextElementSibling;
  assert.equal(actions.children.length, 4);
  assert.match(actions.children[0].className, /ai-companion-box-copy/);
  assert.match(actions.children[1].className, /ai-companion-box-open-tab/);
  assert.equal(actions.children[1].attributes.get("aria-label"), "Open in a new tab");
  assert.match(actions.children[2].className, /ai-companion-box-split-chat/);
  assert.equal(actions.children[2].attributes.get("aria-label"), "Split new chat from here");
  assert.match(actions.children[2].children[0].className, /bi-signpost-split/);
  actions.children[2].dispatch("click");
  assert.equal(splitEvents.length, 1);
  assert.match(actions.children[3].className, /ai-companion-box-timestamp/);
});

test("AI Companion cancelled and aborted summaries offer continuation from that point", async () => {
  for (const status of ["cancelled", "aborted"]) {
    const continued = [];
    const harness = createHarness(null, { onContinueTask: (event) => continued.push(event.status) });
    harness.renderer.appendSummary({ status, finalResponse: `Task ${status}`, changedFiles: [], attemptedChanges: [] });

    const summary = harness.container.children[0].children[0];
    const button = findByClass(summary.nextElementSibling, "ai-companion-box-continue-task");
    assert.ok(button);
    assert.equal(button.title, "Continue task from this point");
    assert.equal(button.attributes.get("aria-label"), "Continue task from this point");
    assert.match(button.children[0].className, /bi-play-fill/);
    button.dispatch("click");
    assert.deepEqual(continued, [status]);
  }
});

test("AI Companion summary renders the model final response without synthetic outcome text", () => {
  const renderCalls = [];
  const harness = createHarness((target, markdown) => {
    renderCalls.push(markdown);
    target.textContent = markdown;
    return true;
  });

  harness.renderer.appendSummary({
    elapsedMs: 1000,
    workedLabel: "Worked for 24s",
    outcome: "The model answer starts here.",
    finalResponse: "The model answer starts here.",
    changedFiles: [],
    attemptedChanges: []
  });

  const summary = harness.container.children[0].children[0];
  assert.equal(findByClass(summary, "ai-companion-summary-outcome"), null);
  assert.ok(findByClass(summary, "ai-companion-final-response"));
  assert.equal(findByClass(summary, "ai-companion-summary-worked-footer").textContent, "Worked for 24s");
  assert.deepEqual(renderCalls, ["The model answer starts here."]);
});

test("AI Companion summary changed files show line counts, compare, rollback, and history", () => {
  const opened = [];
  const rollbacks = [];
  const histories = [];
  const taskRollbacks = [];
  const compare = { path: "src/panel.js", beforeContent: "old", afterContent: "new" };
  const changeJournal = { restorable: true, checkpointId: "checkpoint-1", path: "src/panel.js" };
  const harness = createHarness(null, {
    openCompare: (payload) => opened.push(payload),
    onRollbackFile: (payload) => rollbacks.push(payload.file.path),
    onShowFileHistory: (payload) => histories.push(payload.file.path),
    onRollbackTask: (event) => taskRollbacks.push(event.taskId || "summary")
  });

  harness.renderer.appendSummary({
    taskId: "task-1",
    elapsedMs: 1000,
    changedFiles: [{ path: "src/panel.js", description: "Updated panel.", additions: 12, deletions: 4, compare, changeJournal }],
    attemptedChanges: []
  });

  const summary = harness.container.children[0].children[0];
  assert.equal(findByClass(summary, "ai-companion-summary-line-added").textContent, "+12");
  assert.equal(findByClass(summary, "ai-companion-summary-line-removed").textContent, "-4");
  const buttons = findAllByClass(harness.container, "ai-companion-activity-action");
  assert.equal(buttons[0].textContent, "Compare");
  buttons[0].dispatch("click");
  buttons[1].dispatch("click");
  buttons[2].dispatch("click");
  buttons[3].dispatch("click");
  assert.deepEqual(opened, [compare]);
  assert.deepEqual(rollbacks, ["src/panel.js"]);
  assert.deepEqual(histories, ["src/panel.js"]);
  assert.deepEqual(taskRollbacks, ["task-1"]);

  const fallbackRollbacks = [];
  const fallbackHistories = [];
  const fallbackTaskRollbacks = [];
  const fallbackHarness = createHarness(null, {
    onRollbackFile: (payload) => fallbackRollbacks.push(payload.file.path),
    onShowFileHistory: (payload) => fallbackHistories.push(payload.file.path),
    onRollbackTask: (event) => fallbackTaskRollbacks.push(event.taskId || "summary")
  });
  fallbackHarness.renderer.appendSummary({
    taskId: "task-2",
    changeJournal: { restorable: true, checkpointId: "checkpoint-2" },
    elapsedMs: 1000,
    changedFiles: [{ path: "src/fallback.js", description: "Updated file." }],
    attemptedChanges: []
  });
  const fallbackButtons = findAllByClass(fallbackHarness.container, "ai-companion-activity-action");
  assert.equal(fallbackButtons.length, 3);
  fallbackButtons[0].dispatch("click");
  fallbackButtons[1].dispatch("click");
  fallbackButtons[2].dispatch("click");
  assert.deepEqual(fallbackRollbacks, ["src/fallback.js"]);
  assert.deepEqual(fallbackHistories, ["src/fallback.js"]);
  assert.deepEqual(fallbackTaskRollbacks, ["task-2"]);
});

test("AI Companion activities render source links through the external opener", async () => {
  const opened = [];
  const harness = createHarness(null, { openExternalUrl: async (url) => opened.push(url) });
  harness.renderer.appendActivity({
    activity: {
      id: "internet-sources",
      status: "completed",
      title: "Internet search completed",
      primaryText: "2 sources",
      webLinks: [{ url: "https://docs.example.test/source", label: "Primary source" }]
    }
  });
  const link = findByClass(harness.container, "ai-companion-activity-link");
  assert.equal(link.tagName, "A");
  assert.equal(link.href, "https://docs.example.test/source");
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");
  link.dispatch("click");
  await Promise.resolve();
  assert.deepEqual(opened, ["https://docs.example.test/source"]);
});

test("AI Companion keeps one activity timeline while its task is detached", () => {
  const harness = createHarness();
  harness.renderer.appendActivity({
    activity: { id: "first-step", status: "completed", title: "First step" }
  });
  const timeline = harness.container.children[0];
  harness.container.isConnected = false;
  timeline.isConnected = false;

  harness.renderer.appendActivity({
    activity: { id: "second-step", status: "running", title: "Second step" }
  });

  assert.equal(findAllByClass(harness.container, "ai-companion-activity-timeline").length, 1);
  assert.equal(findByClass(timeline, "ai-companion-activity-timeline-summary").children[0].textContent, "Activity (2 steps)");
});

test("AI Companion activity copy timestamp uses latest completed activity and ignores external rows", () => {
  const harness = createHarness();
  const firstCompletedAt = Date.UTC(2026, 0, 1, 9, 5);
  const externalCompletedAt = Date.UTC(2026, 0, 1, 10, 15);
  const secondCompletedAt = Date.UTC(2026, 0, 1, 11, 25);

  harness.renderer.appendActivity({
    activity: {
      id: "read-file",
      status: "completed",
      title: "Reading file",
      primaryText: "README.md",
      completedAt: firstCompletedAt
    }
  });

  const timeline = harness.container.children[0];
  const firstTimestamp = findByClass(timeline.nextElementSibling, "ai-companion-box-timestamp");
  assert.ok(firstTimestamp);
  assert.match(firstTimestamp.textContent, /\d/);
  const firstTimestampText = firstTimestamp.textContent;

  const external = new FakeElement("div");
  external.completedAt = externalCompletedAt;
  harness.renderer.appendExternalActivity(external);
  assert.equal(findByClass(timeline.nextElementSibling, "ai-companion-box-timestamp").textContent, firstTimestampText);

  harness.renderer.appendActivity({
    completedAt: secondCompletedAt,
    activity: {
      id: "write-file",
      status: "completed",
      title: "Writing file",
      primaryText: "README.md"
    }
  });

  const updatedTimestamp = findByClass(timeline.nextElementSibling, "ai-companion-box-timestamp");
  assert.ok(updatedTimestamp);
  assert.notEqual(updatedTimestamp.textContent, firstTimestampText);
});


test("AI Companion external-only activity rows do not create an activity timestamp", () => {
  const harness = createHarness();
  harness.renderer.appendExternalActivity(new FakeElement("div"));

  const timeline = harness.container.children[0];
  assert.equal(findByClass(timeline.nextElementSibling, "ai-companion-box-timestamp"), null);
});

test("AI Companion focuses registered external activity rows", () => {
  const harness = createHarness();
  const approval = new FakeElement("div");
  approval.dataset.aiCompanionActivityId = "approval-1";
  let scrollOptions = null;
  approval.scrollIntoView = (options) => { scrollOptions = options; };

  harness.renderer.appendExternalActivity(approval);
  harness.renderer.collapseTimeline();
  const timeline = harness.container.children[0];
  assert.equal(timeline.open, false);

  assert.equal(harness.renderer.focusActivity("approval-1"), true);
  assert.equal(timeline.open, true);
  assert.equal(approval.classList.contains("ai-companion-workspace-entry-focused"), true);
  assert.equal(scrollOptions.block, "center");

  harness.renderer.reset();
  assert.equal(harness.renderer.focusActivity("approval-1"), false);
});

test("AI Companion summary uses explicit terminal status labels", () => {
  const cases = [
    { status: "success", label: "Task Succeeded", className: "succeeded" },
    { status: "failure", label: "Task Failed", className: "failed" },
    { status: "cancelled", label: "Task Cancelled", className: "cancelled" },
    { status: "aborted", label: "Task Aborted", className: "aborted" }
  ];
  for (const terminal of cases) {
    const harness = createHarness(null);
    harness.renderer.appendSummary({ ...terminal, finalResponse: terminal.label, changedFiles: [], attemptedChanges: [], blockedChanges: [] });
    const summary = harness.container.children[0].children[0];
    const status = findByClass(summary, "ai-companion-task-status");
    assert.equal(status.children[1].textContent, terminal.label);
    assert.match(status.className, new RegExp(terminal.className));
  }
});
