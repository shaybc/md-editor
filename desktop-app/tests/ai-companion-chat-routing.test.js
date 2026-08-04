"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const runtime = require("../resources/ai-companion/core/agent-runtime");
const {
  CHAT_ROUTES,
  classifyChatRequest,
  gatherGroundedEvidence
} = require("../resources/ai-companion/core/chat-request-router");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { runChatMode } = require("../resources/ai-companion/modes/chat");

function withHistory(prompt) {
  return {
    prompt,
    conversationHistory: [
      { role: "user", content: "What value does ttlMs have?" },
      { role: "assistant", content: "ttlMs is 30000 milliseconds." }
    ]
  };
}

async function withTemporaryRoots(callback) {
  const parentRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-chat-routing-"));
  const workspaceRoot = path.join(parentRoot, "workspace");
  const profileRoot = path.join(parentRoot, "profile");
  await fsPromises.mkdir(workspaceRoot, { recursive: true });
  await fsPromises.mkdir(profileRoot, { recursive: true });
  try {
    return await callback({ workspaceRoot, profileRoot });
  } finally {
    await fsPromises.rm(parentRoot, { recursive: true, force: true });
  }
}

test("deterministic classifier separates direct grounded and complex Chat requests", () => {
  const cases = [
    [{ prompt: "Hello!" }, CHAT_ROUTES.DIRECT],
    [{ prompt: "In two sentences, explain exponential backoff." }, CHAT_ROUTES.DIRECT],
    [{ prompt: "What is a stack trace?" }, CHAT_ROUTES.DIRECT],
    [{ prompt: "Rewrite this more clearly: 'The cache gets cleared due to it being old.'" }, CHAT_ROUTES.DIRECT],
    [withHistory("What is that in seconds?"), CHAT_ROUTES.DIRECT],
    [{ prompt: "What version is this project?" }, CHAT_ROUTES.GROUNDED],
    [{ prompt: "What value does ttlMs have?" }, CHAT_ROUTES.GROUNDED],
    [{ prompt: "Where is startServer defined?" }, CHAT_ROUTES.GROUNDED],
    [{ prompt: "Now tell me how README says to start it." }, CHAT_ROUTES.GROUNDED],
    [{ prompt: "Explain the render function." }, CHAT_ROUTES.GROUNDED],
    [{ prompt: "Why is the server failing?" }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Compare src/a.js and src/b.js." }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Change src/a.js to return true." }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Change ttlMs to 45000." }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Update the package version." }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Explain this.", attachments: [{ name: "example.txt", content: "text" }] }, CHAT_ROUTES.COMPLEX],
    [{ prompt: "Continue", executionKind: "resume" }, CHAT_ROUTES.COMPLEX]
  ];
  for (const [request, expectedRoute] of cases) {
    assert.equal(classifyChatRequest(request).route, expectedRoute, request.prompt);
  }
});

test("grounded retrieval reads one unique symbol target and escalates ambiguous targets", async () => {
  await withTemporaryRoots(async ({ workspaceRoot }) => {
    await fsPromises.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fsPromises.writeFile(path.join(workspaceRoot, "src", "cache.js"), "const ttlMs = 30000;\n", "utf8");
    const events = [];
    const decision = classifyChatRequest({ prompt: "What value does ttlMs have?" });
    const result = await gatherGroundedEvidence(runtime, { workspaceRoot, prompt: "What value does ttlMs have?" }, decision, (event) => events.push(event));

    assert.equal(result.ok, true);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].path, "src/cache.js");
    assert.match(result.evidence[0].content, /30000/);
    assert.deepEqual(events.filter((event) => event.summary === "running").map((event) => event.tool), ["search_grep", "read_file"]);
    assert.equal(events.some((event) => event.tool === "list_files"), false);

    await fsPromises.writeFile(path.join(workspaceRoot, "src", "other.js"), "const ttlMs = 45000;\n", "utf8");
    const ambiguous = await gatherGroundedEvidence(runtime, { workspaceRoot, prompt: "What value does ttlMs have?" }, decision, () => {});
    assert.deepEqual(ambiguous, { ok: false, reasonCode: "grounding-ambiguous-evidence" });
  });
});

test("active-document grounding uses the bounded live editor buffer", async () => {
  const content = Array.from({ length: 220 }, (_value, index) => "line " + (index + 1) + " " + "x".repeat(120)).join("\n");
  const request = {
    prompt: "Explain the current file.",
    activeFile: { path: "src/live.js", content }
  };
  const events = [];
  const result = await gatherGroundedEvidence(runtime, request, classifyChatRequest(request), (event) => events.push(event));

  assert.equal(result.ok, true);
  assert.equal(result.evidence[0].sourceType, "active-document");
  assert.equal(result.evidence[0].endLine, 160);
  assert.ok(result.evidence[0].content.length <= 16000);
  assert.deepEqual(events.filter((event) => event.summary === "running").map((event) => event.tool), ["read_active_document"]);
});

test("direct Chat uses one provider call without tools or workspace context", async () => {
  await withTemporaryRoots(async ({ workspaceRoot, profileRoot }) => {
    const originalCreateProvider = runtime.createProvider;
    const calls = [];
    runtime.createProvider = () => ({
      async completeMessage(messages, options) {
        calls.push({ messages, options });
        options.onUsage?.({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
        return { content: "<chat_title>Backoff Basics</chat_title>Exponential backoff increases the delay between retries.", toolCalls: [] };
      }
    });
    const events = [];
    try {
      const result = await runChatMode({
        settings: { enabled: true, chatEnabled: true, providerRequestDelayMs: 0 },
        workspaceRoot,
        profileRoot,
        prompt: "Explain exponential backoff.",
        activeFile: { path: "private/current.js", content: "const secretWorkspaceValue = 42;" },
        requestChatTitle: true,
        executionKind: "new"
      }, (event) => events.push(event));

      assert.match(result.content, /increases the delay/);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].options.tools, []);
      assert.equal(calls[0].options.toolChoice, undefined);
      const promptText = JSON.stringify(calls[0].messages);
      assert.doesNotMatch(promptText, /private\/current\.js|secretWorkspaceValue/);
      assert.match(promptText, /no workspace evidence/i);
      assert.equal(events.some((event) => event.type === "tool"), false);
      assert.equal(events.find((event) => event.type === "chat-route")?.route, CHAT_ROUTES.DIRECT);
      assert.equal(events.find((event) => event.type === "chat-title")?.chatTitle, "Backoff Basics");
    } finally {
      runtime.createProvider = originalCreateProvider;
    }
  });
});

test("grounded Chat gathers bounded evidence before one provider call", async () => {
  await withTemporaryRoots(async ({ workspaceRoot, profileRoot }) => {
    await fsPromises.writeFile(path.join(workspaceRoot, "package.json"), "{\"name\":\"fixture\",\"version\":\"2.4.1\"}\n", "utf8");
    const originalCreateProvider = runtime.createProvider;
    const calls = [];
    runtime.createProvider = () => ({
      async completeMessage(messages, options) {
        calls.push({ messages, options });
        return { content: "The project version is 2.4.1.", toolCalls: [] };
      }
    });
    const events = [];
    try {
      const result = await runChatMode({
        settings: { enabled: true, chatEnabled: true, providerRequestDelayMs: 0 },
        workspaceRoot,
        profileRoot,
        prompt: "What version is this project?",
        executionKind: "new"
      }, (event) => events.push(event));

      assert.equal(result.content, "The project version is 2.4.1.");
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].options.tools, []);
      assert.match(JSON.stringify(calls[0].messages), /package\.json[\s\S]*2\.4\.1/);
      assert.deepEqual(events.filter((event) => event.summary === "running").map((event) => event.tool), ["glob", "read_file"]);
      assert.equal(events.some((event) => event.tool === "list_files"), false);
    } finally {
      runtime.createProvider = originalCreateProvider;
    }
  });
});

test("ambiguous grounding escalates to the unchanged complex loop", async () => {
  await withTemporaryRoots(async ({ workspaceRoot, profileRoot }) => {
    await fsPromises.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fsPromises.writeFile(path.join(workspaceRoot, "src", "first.js"), "export function render() {}\n", "utf8");
    await fsPromises.writeFile(path.join(workspaceRoot, "src", "second.js"), "export function render() {}\n", "utf8");
    const originalCreateProvider = runtime.createProvider;
    const originalRunAgentToolLoop = runtime.runAgentToolLoop;
    const loopCalls = [];
    runtime.createProvider = () => ({});
    runtime.runAgentToolLoop = async (...args) => {
      loopCalls.push(args);
      return "Please clarify which render function you mean.";
    };
    const events = [];
    try {
      await runChatMode({
        settings: { enabled: true, chatEnabled: true },
        workspaceRoot,
        profileRoot,
        prompt: "Explain the render function.",
        executionKind: "new"
      }, (event) => events.push(event));

      assert.equal(loopCalls.length, 1);
      assert.equal(loopCalls[0][7].toolDefinitionsOverride, undefined);
      assert.equal(loopCalls[0][7].requireInitialDiscoveryOverride, undefined);
      assert.deepEqual(events.filter((event) => event.type === "chat-route").map((event) => event.stage), ["selected", "escalated"]);
      assert.equal(events.find((event) => event.stage === "escalated")?.reasonCode, "grounding-ambiguous-evidence");
    } finally {
      runtime.createProvider = originalCreateProvider;
      runtime.runAgentToolLoop = originalRunAgentToolLoop;
    }
  });
});

test("routing kill switch restores the legacy Chat invocation", async () => {
  await withTemporaryRoots(async ({ workspaceRoot, profileRoot }) => {
    const originalCreateProvider = runtime.createProvider;
    const originalRunAgentToolLoop = runtime.runAgentToolLoop;
    let options;
    runtime.createProvider = () => ({});
    runtime.runAgentToolLoop = async (...args) => {
      options = args[7];
      return "Legacy answer";
    };
    const events = [];
    try {
      await runChatMode({
        settings: { enabled: true, chatEnabled: true, chatRequestRoutingEnabled: false },
        workspaceRoot,
        profileRoot,
        prompt: "Hello!",
        activeFile: { path: "current.js", content: "content" }
      }, (event) => events.push(event));

      assert.equal(options.toolDefinitionsOverride, undefined);
      assert.equal(options.activeFile.path, "current.js");
      assert.equal(events.some((event) => event.type === "chat-route"), false);
    } finally {
      runtime.createProvider = originalCreateProvider;
      runtime.runAgentToolLoop = originalRunAgentToolLoop;
    }
  });
});

test("browser and headless settings normalize the routing kill switch identically", () => {
  const context = { console, window: null, globalThis: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/intent-experiment.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/settings.js"), "utf8"), context);
  let browserApi;
  context.registerMarkdownViewerAiCompanionSettings({ registerModule(_name, api) { browserApi = api; } });

  assert.equal(browserApi.normalize({}).chatRequestRoutingEnabled, true);
  assert.equal(normalizeAiCompanionSettings({}).chatRequestRoutingEnabled, true);
  assert.equal(browserApi.normalize({ chatRequestRoutingEnabled: false }).chatRequestRoutingEnabled, false);
  assert.equal(normalizeAiCompanionSettings({ chatRequestRoutingEnabled: false }).chatRequestRoutingEnabled, false);
});
