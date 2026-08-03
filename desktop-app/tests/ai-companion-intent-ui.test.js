"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(" "); },
      replace: (from, to) => { this.classList.remove(from); this.classList.add(to); },
      toggle: (name, force) => { if (force) this.classList.add(name); else this.classList.remove(name); }
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); if (child && typeof child === "object") child.parentNode = this; return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  dispatch(name) { return this.listeners.get(name)?.({ target: this }); }
  querySelectorAll(selector) { return descendants(this).filter((child) => selector === "button" && child.tagName === "BUTTON"); }
  querySelector(selector) {
    if (selector === "input:checked") return descendants(this).find((child) => child.tagName === "INPUT" && child.checked) || null;
    return null;
  }
}

function descendants(root) {
  return (root.children || []).flatMap((child) => child && child.children ? [child, ...descendants(child)] : []);
}

function findClass(root, name) {
  return [root, ...descendants(root)].find((element) => element?.classList?.contains(name));
}

function visibleText(root) {
  return [root, ...descendants(root)].map((node) => String(node?.textContent || "")).join(" ");
}

function loadBrowserModule(file) {
  const context = {
    console,
    document: {
      createElement: (tag) => new Element(tag),
      createTextNode: (text) => ({ textContent: String(text), children: [] })
    },
    window: null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion", file), "utf8"), context);
  return context;
}

test("intent renderer shows collapsible contract provenance, revision, fallback, and target state", () => {
  const context = loadBrowserModule("intent-contract-renderer.js");
  const renderer = context.createMarkdownViewerIntentContractRenderer();
  const card = renderer.createIntentContractCard({
    variant: "fallback",
    meta: { revision: 2 },
    contract: {
      taskType: "implementation",
      goal: { value: "Change the setting", provenance: "explicit" },
      expectedOutcome: { value: "The setting persists", provenance: "inferred" },
      acceptanceCriteria: [{ id: "AC1", description: "Persists after restart", provenance: "explicit" }],
      namedTargets: { files: [{ id: "T1", value: "settings.js", status: "confirmed" }], symbols: [], errors: [], uiAreas: [] },
      amendments: [{ id: "AM1" }]
    }
  });
  assert.equal(card.tagName, "DETAILS");
  assert.ok(card.classList.contains("fallback"));
  assert.match(visibleText(card), /r2 \/ 1 amendment/);
  assert.match(visibleText(card), /explicit/);
  assert.match(visibleText(card), /confirmed/);
  assert.match(visibleText(card), /raw request/);
});

test("clarification renderer restores answers, records feedback, and exposes interrupted resume", async () => {
  const context = loadBrowserModule("intent-contract-renderer.js");
  const renderer = context.createMarkdownViewerIntentContractRenderer();
  const ratings = [];
  const resolved = renderer.createClarificationCard({ clarificationId: "Q1", question: "Which file?", rating: "useful" }, {
    interactive: false,
    resolvedAnswer: "settings.js",
    onRate: (...args) => ratings.push(args)
  });
  assert.match(visibleText(resolved), /Answered: settings\.js/);
  const down = descendants(resolved).find((element) => element.dataset?.rating === "not-useful");
  await down.dispatch("click");
  assert.deepEqual(ratings, [["Q1", "not-useful"]]);

  let resumed = false;
  const pending = renderer.createClarificationCard({ clarificationId: "Q2", question: "Continue?" }, { interactive: false, canResume: true, onResume: () => { resumed = true; } });
  const resume = findClass(pending, "ai-companion-clarification-resume");
  resume.dispatch("click");
  assert.equal(resumed, true);
});

test("interrupted clarification resume starts fresh extraction with saved answers", () => {
  const context = loadBrowserModule("interrupted-task-resume.js");
  const api = context.createMarkdownViewerInterruptedTaskResume();
  const record = {
    id: "task-1",
    prompt: "Update the setting",
    status: "interrupted",
    events: [
      { type: "clarification", clarificationId: "Q1", question: "Which setting?" },
      { type: "clarification-resolved", clarificationId: "Q1", answer: "intentContractsEnabled" },
      { type: "clarification", clarificationId: "Q2", question: "Which value?" }
    ]
  };
  assert.equal(api.findPendingClarification(record).clarificationId, "Q2");
  const request = api.buildClarificationResumeRequest(record, record.events[2], "C:/workspace");
  assert.equal(request.prompt, "Update the setting");
  assert.equal(request.resume.kind, "intent-clarification");
  assert.equal(request.resumeIntentContext.answeredClarifications[0].answer, "intentContractsEnabled");
  assert.equal(Object.hasOwn(request.resume, "pendingAction"), false);
});

test("panel persists last-write clarification feedback and request-local evaluation", () => {
  const panel = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/panel.js"), "utf8");
  assert.match(panel, /prior\.filter\(\(item\) => item\.clarificationId !== clarificationId\)/);
  assert.match(panel, /activeAgentEntry\.record\.intentEvaluation = savedEvent\.record \|\| null/);
  assert.match(panel, /findPendingClarification\?\.\(entry\.record\)/);
  assert.match(panel, /resumeIntentContext: request\.resumeIntentContext/);
});

test("intent evaluation log writes bounded local JSONL under the profile", async () => {
  const context = loadBrowserModule("intent-evaluation-log.js");
  let writtenPath = "";
  let writtenValue = "";
  const log = context.createMarkdownViewerIntentEvaluationLog({
    Neutralino: { filesystem: {
      async readFile() { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
      async writeFile(filePath, value) { writtenPath = filePath; writtenValue = value; }
    } },
    getProfileDataDirPath: async () => "C:/profile",
    joinPath: (...parts) => parts.join("/"),
    ensureDirectory: async () => {}
  });
  await log.append({ schemaVersion: 1, requestId: "R1" });
  assert.equal(writtenPath, "C:/profile/companion/eval/intent-contracts.jsonl");
  assert.deepEqual(JSON.parse(writtenValue.trim()), { schemaVersion: 1, requestId: "R1" });
  const gitignore = fs.readFileSync(path.resolve(__dirname, "../../.gitignore"), "utf8");
  assert.match(gitignore, /desktop-app\/tests\/eval\/results\//);
});
