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
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.isConnected = false;
    this.open = false;
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

  querySelector() {
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener() {}
}

function createRendererHarness() {
  const context = {
    console,
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
  const renderer = context.createMarkdownViewerAiCompanionActivityRenderer({
    container,
    scrollToEnd: () => {}
  });
  return { container, renderer };
}

function findTimelineBody(container) {
  const timeline = container.children[0];
  return timeline?.children.find((child) => child.className?.includes("ai-companion-activity-timeline-body")) || null;
}

function getGroupSummaryText(group) {
  const summary = group.children.find((child) => child.tagName === "SUMMARY");
  return summary?.children[0]?.textContent || "";
}

function getGroupBody(group) {
  return group.children.find((child) => child.className?.includes("ai-companion-activity-group-body")) || null;
}

function activityEvent(id, tool, status) {
  return { activity: { id, tool, status, title: tool, primaryText: id } };
}

test("tools render as plain cards when no narration has been shown", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendActivity(activityEvent("t1", "read_file", "completed"));
  renderer.appendActivity(activityEvent("t2", "run_command", "completed"));

  const body = findTimelineBody(container);
  assert.ok(body);
  assert.equal(body.children.length, 2);
  body.children.forEach((child) => assert.match(child.className, /ai-companion-activity-card/));
});

test("tools after narration collapse into a single group with an aggregated label", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "I found the module, so I'm running the tests and reading the results." });
  renderer.appendActivity(activityEvent("t1", "run_command", "completed"));
  renderer.appendActivity(activityEvent("t2", "run_test", "completed"));
  renderer.appendActivity(activityEvent("t3", "read_file", "completed"));

  const body = findTimelineBody(container);
  assert.equal(body.children.length, 2);
  assert.match(body.children[0].className, /ai-companion-activity-narration/);
  const group = body.children[1];
  assert.match(group.className, /ai-companion-activity-group/);
  assert.equal(getGroupSummaryText(group), "Ran 2 commands, read 1 file");
  assert.equal(getGroupBody(group).children.length, 3);
});

test("each rendered narration starts a new group", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "First I'll search the workspace for the storage helper." });
  renderer.appendActivity(activityEvent("t1", "search_grep", "completed"));
  renderer.appendNarration({ content: "The helper lives in panel.js, so now I'm editing the two affected files." });
  renderer.appendActivity(activityEvent("t2", "apply_edit", "completed"));
  renderer.appendActivity(activityEvent("t3", "write_file", "completed"));

  const body = findTimelineBody(container);
  const groups = body.children.filter((child) => child.className.includes("ai-companion-activity-group"));
  assert.equal(groups.length, 2);
  assert.equal(getGroupSummaryText(groups[0]), "Searched 1 pattern");
  assert.equal(getGroupSummaryText(groups[1]), "Edited 2 files");
});

test("group label updates live as running calls complete", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "Running the focused test suite to verify the change I just made." });
  renderer.appendActivity(activityEvent("t1", "run_command", "running"));

  const body = findTimelineBody(container);
  const group = body.children[1];
  assert.equal(getGroupSummaryText(group), "Ran 1 command…");

  renderer.appendActivity(activityEvent("t1", "run_command", "completed"));
  assert.equal(getGroupSummaryText(group), "Ran 1 command");
  assert.equal(getGroupBody(group).children.length, 1, "status update must not duplicate the card");

  renderer.appendActivity(activityEvent("t2", "list_files", "completed"));
  assert.equal(getGroupSummaryText(group), "Ran 1 command, listed files");
});

test("external rows like approvals close the open group", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "I need approval before I can write the fix to the affected file." });
  renderer.appendActivity(activityEvent("t1", "read_file", "completed"));
  renderer.appendExternalActivity(new FakeElement("div"));
  renderer.appendActivity(activityEvent("t2", "apply_edit", "completed"));

  const body = findTimelineBody(container);
  const groups = body.children.filter((child) => child.className.includes("ai-companion-activity-group"));
  assert.equal(groups.length, 2);
  assert.equal(getGroupSummaryText(groups[0]), "Read 1 file");
  assert.equal(getGroupSummaryText(groups[1]), "Edited 1 file");
});

test("a failed call marks the group and forces it open", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "Applying the storage patch to the panel module and its desktop mirror." });
  renderer.appendActivity(activityEvent("t1", "apply_edit", "completed"));
  renderer.appendActivity(activityEvent("t2", "run_test", "failed"));

  const body = findTimelineBody(container);
  const group = body.children[1];
  assert.ok(group.classList.contains("failed"));
  assert.equal(group.open, true);
});

test("reset restores plain card rendering for the next run", () => {
  const { container, renderer } = createRendererHarness();
  renderer.appendNarration({ content: "Inspecting the failing test before deciding what to change." });
  renderer.appendActivity(activityEvent("t1", "read_file", "completed"));
  renderer.reset();
  container.children.length = 0;

  renderer.appendActivity(activityEvent("t2", "read_file", "completed"));
  const body = findTimelineBody(container);
  assert.equal(body.children.length, 1);
  assert.match(body.children[0].className, /ai-companion-activity-card/);
});
