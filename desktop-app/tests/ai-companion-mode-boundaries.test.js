"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runtime = require("../resources/ai-companion/core/agent-runtime");
const { runAutocompleteMode } = require("../resources/ai-companion/modes/autocomplete");
const { runGitSummaryMode } = require("../resources/ai-companion/modes/git-summary");
const { validateEvaluationDataset } = require("./eval/ai-companion-mode-runner");

const bridgePath = path.join(__dirname, "..", "resources", "bridges", "ai-companion-bridge", "ai-companion-bridge.cjs");

test("bridge keeps conversational and specialized actions on separate handlers", () => {
  const source = fs.readFileSync(bridgePath, "utf8");
  assert.match(source, /message\.action === "chat"[\s\S]*runChatMode\(request, emit\)/);
  assert.match(source, /message\.action === "plan"[\s\S]*runPlanMode\(request, emit\)/);
  assert.match(source, /message\.action === "agent"[\s\S]*runAgentMode\(request, emit\)/);
  assert.match(source, /message\.action === "autocomplete"[\s\S]*runAutocompleteMode\(request, emit\)/);
  assert.match(source, /message\.action === "gitSummary"[\s\S]*runGitSummaryMode\(request, emit\)/);
  assert.match(source, /message\.action === "testConnection"[\s\S]*testConnection\(requestSettings/);
});

test("conversational routing is imported only by Chat mode", () => {
  const modeRoot = path.join(__dirname, "..", "resources", "ai-companion", "modes");
  const chatSource = fs.readFileSync(path.join(modeRoot, "chat", "index.js"), "utf8");
  const planSource = fs.readFileSync(path.join(modeRoot, "plan", "index.js"), "utf8");
  const agentSource = fs.readFileSync(path.join(modeRoot, "agent", "index.js"), "utf8");
  const autocompleteSource = fs.readFileSync(path.join(modeRoot, "autocomplete", "index.js"), "utf8");
  const gitSummarySource = fs.readFileSync(path.join(modeRoot, "git-summary", "index.js"), "utf8");

  assert.match(chatSource, /chat-request-router/);
  for (const source of [planSource, agentSource, autocompleteSource, gitSummarySource]) {
    assert.doesNotMatch(source, /chat-request-router|chat-route/);
  }
});

test("evaluation contract rejects protected specialized modes", () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, "eval", "ai-companion-baseline-cases.json"), "utf8"));
  for (const protectedMode of ["autocomplete", "gitSummary", "testConnection"]) {
    const changed = structuredClone(dataset);
    changed.cases[0].mode = protectedMode;
    assert.throws(() => validateEvaluationDataset(changed), /outside the M0 boundary|eight cases per/);
  }
});

test("autocomplete retains its dedicated completion request path", async () => {
  const profileRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-autocomplete-boundary-"));
  const originalCreateProvider = runtime.createProvider;
  const calls = [];
  runtime.createProvider = () => ({
    async complete(messages, options) {
      calls.push({ messages, options });
      return "suggestedText";
    }
  });
  try {
    const result = await runAutocompleteMode({
      settings: { enabled: true, autocompleteEnabled: true },
      profileRoot,
      path: "src/example.js",
      prefix: "const value = ",
      suffix: ";",
      scope: "line"
    }, () => {});
    assert.equal(result.completion, "suggestedText");
    assert.equal(calls.length, 1);
    assert.match(calls[0].messages[1].content, /Before cursor:/);
  } finally {
    runtime.createProvider = originalCreateProvider;
    await fsPromises.rm(profileRoot, { recursive: true, force: true });
  }
});

test("git summary remains on the legacy gitSummary loop and response parser", async () => {
  const profileRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-git-summary-boundary-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunAgentToolLoop = runtime.runAgentToolLoop;
  const modes = [];
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async (_provider, _settings, _root, _prompt, mode) => {
    modes.push(mode);
    return JSON.stringify({ commitSubject: "Keep boundary", commitBody: "", summaryMarkdown: "No routing change." });
  };
  try {
    const result = await runGitSummaryMode({
      settings: { enabled: true, gitSummaryEnabled: true },
      workspaceRoot: profileRoot,
      profileRoot,
      digest: { status: [], patches: [], unpushedCommits: [] }
    }, () => {});
    assert.deepEqual(modes, ["gitSummary"]);
    assert.equal(result.summary.parsed, true);
    assert.equal(result.summary.commitSubject, "Keep boundary");
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunAgentToolLoop;
    await fsPromises.rm(profileRoot, { recursive: true, force: true });
  }
});

test("connection testing calls the provider testConnection method directly", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "resources", "ai-companion", "core", "agent-runtime.js"), "utf8");
  assert.match(source, /return createProvider\(settings\)\.testConnection\(\{ signal: options\.signal, onDebug: options\.onDebug \}\)/);
});

test("shadow AgentState is imported only by Agent mode", () => {
  const modeRoot = path.join(__dirname, "..", "resources", "ai-companion", "modes");
  const agentSource = fs.readFileSync(path.join(modeRoot, "agent", "index.js"), "utf8");
  const protectedSources = [
    path.join(modeRoot, "chat", "index.js"),
    path.join(modeRoot, "plan", "index.js"),
    path.join(modeRoot, "autocomplete", "index.js"),
    path.join(modeRoot, "git-summary", "index.js")
  ].map((filePath) => fs.readFileSync(filePath, "utf8"));
  assert.match(agentSource, /agent-state-shadow/);
  for (const source of protectedSources) assert.doesNotMatch(source, /agent-state-shadow|agent-state-snapshot/);
});
