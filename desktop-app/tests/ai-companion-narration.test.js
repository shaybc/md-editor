const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");
const repoRoot = path.resolve(__dirname, "..", "..");

const { createNarrationFilter } = require(path.join(repoRoot, "ai-companion", "core", "narration-filter.js"));
const { runAgentToolLoop } = require(path.join(repoRoot, "ai-companion", "core", "agent-tool-loop.js"));

test("narration filter accepts distinct informative narration", () => {
  const filter = createNarrationFilter();
  const first = filter.accept("I found the cause in panel.js, so I'll read the storage helper next.");
  const second = filter.accept("The storage helper only joins two segments; I'm patching the nested join now.");
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
});

test("narration filter drops boilerplate and short fragments", () => {
  const filter = createNarrationFilter();
  assert.equal(filter.accept("Okay, let me..."), null);
  assert.equal(filter.accept("Now I will"), null);
  assert.equal(filter.accept("Checking."), null);
  assert.equal(filter.accept(""), null);
});

test("narration filter drops exact duplicates of recent narration", () => {
  const filter = createNarrationFilter();
  const text = "I found the joinPath bug, so I'm checking the desktop copy of the module.";
  assert.ok(filter.accept(text));
  assert.equal(filter.accept(text), null);
  assert.equal(filter.accept(`  ${text.toUpperCase()}  `), null);
});

test("narration filter drops near-duplicate rephrasings of the previous narration", () => {
  const filter = createNarrationFilter();
  assert.ok(filter.accept("I found the joinPath bug in the storage module, so I'm checking the desktop copy now."));
  assert.equal(filter.accept("I found the joinPath bug in the storage module, so I'm checking the desktop copy."), null);
});

test("narration filter caps runaway narration length", () => {
  const filter = createNarrationFilter();
  const accepted = filter.accept(`I found the issue. ${"Detail sentence with unique words. ".repeat(60)}`);
  assert.ok(accepted);
  assert.ok(accepted.length <= 601);
});

function createLoopHarness(rounds, finalAnswer) {
  let call = 0;
  const provider = {
    completeMessage: async () => rounds[Math.min(call++, rounds.length - 1)],
    complete: async (_messages, options) => {
      options?.onToken?.(finalAnswer);
      return finalAnswer;
    }
  };
  const runtime = {
    throwIfAborted: () => {},
    estimateTokens: (text) => Math.ceil(String(text || "").length / 4)
  };
  return { provider, runtime };
}

function createListFilesToolCall(id) {
  const raw = { id, type: "function", function: { name: "list_files", arguments: JSON.stringify({ maxFiles: 5 }) } };
  return { ...raw, raw };
}

test("agent tool loop emits filtered narration before tool events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-companion-narration-"));
  fs.writeFileSync(path.join(workspaceRoot, "README.md"), "# Test\n");
  const narration = "I need the file list to locate the storage module, so I'm listing the workspace first.";
  const { provider, runtime } = createLoopHarness([
    { content: narration, toolCalls: [createListFilesToolCall("call_1")] },
    // Same narration again: the filter must drop the repeat.
    { content: narration, toolCalls: [createListFilesToolCall("call_2")] },
    { content: "Done inspecting.", toolCalls: [] }
  ], "Final answer.");

  const events = [];
  const result = await runAgentToolLoop(provider, {}, workspaceRoot, "where is the storage module?", "chat", (event) => events.push(event), runtime, {});

  const narrationEvents = events.filter((event) => event.type === "narration");
  assert.equal(narrationEvents.length, 1);
  assert.equal(narrationEvents[0].content, narration);
  const narrationIndex = events.findIndex((event) => event.type === "narration");
  const firstToolIndex = events.findIndex((event) => event.type === "tool");
  assert.ok(narrationIndex >= 0 && firstToolIndex > narrationIndex, "narration must precede the first tool event");
  assert.equal(result, "Final answer.");
});

test("gitSummary mode emits no narration events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-companion-narration-"));
  const { provider, runtime } = createLoopHarness([
    { content: "I'll check one file before summarizing the change.", toolCalls: [createListFilesToolCall("call_1")] },
    { content: "Summary ready.", toolCalls: [] }
  ], "Summary.");

  const events = [];
  await runAgentToolLoop(provider, {}, workspaceRoot, "summarize", "gitSummary", (event) => events.push(event), runtime, {});
  assert.equal(events.filter((event) => event.type === "narration").length, 0);
});

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

test("renderer places narration blocks between tool entries in the timeline", () => {
  const { container, renderer } = createRendererHarness();

  renderer.appendActivity({ activity: { id: "a1", status: "completed", title: "Reading file", primaryText: "panel.js" } });
  assert.ok(renderer.appendNarration({ content: "The panel drops narration content, so I'm patching the loop next." }));
  renderer.appendActivity({ activity: { id: "a2", status: "completed", title: "Editing file", primaryText: "agent-tool-loop.js" } });

  const body = findTimelineBody(container);
  assert.ok(body);
  const classNames = body.children.map((child) => child.className);
  // Before any narration, tools render as plain cards; once narration has
  // been shown, subsequent tools collapse into a group row after the text.
  assert.match(classNames[0], /ai-companion-activity-card/);
  assert.match(classNames[1], /ai-companion-activity-narration/);
  assert.match(classNames[2], /ai-companion-activity-group/);
});

test("renderer ignores empty narration events", () => {
  const { container, renderer } = createRendererHarness();
  assert.equal(renderer.appendNarration({ content: "   " }), false);
  assert.equal(renderer.appendNarration({}), false);
  assert.equal(container.children.length, 0);
});
