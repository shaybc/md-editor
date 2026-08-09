"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { InteractionGate } = require("../resources/ai-companion/orchestration/autonomous/interaction/interaction-gate");
const { InternetProviderRegistry } = require("../resources/ai-companion/orchestration/autonomous/internet/internet-provider-registry");
const { isPrivateAddress, validatePublicUrl } = require("../resources/ai-companion/orchestration/autonomous/internet/safe-page-retriever");
const { NotebookDocumentService } = require("../resources/ai-companion/orchestration/autonomous/notebooks/notebook-document-service");
const { parseScheduleExpression, nextScheduleTime } = require("../resources/ai-companion/orchestration/autonomous/scheduling/schedule-expression");
const { RunScheduler, deterministicJitter } = require("../resources/ai-companion/orchestration/autonomous/scheduling/run-scheduler");
const { rankStructures } = require("../resources/ai-companion/orchestration/autonomous/structure/workspace-atlas");
const { getToolRegistrations } = require("../resources/ai-companion/orchestration/autonomous/tool-catalog");
const { ToolExposurePolicy } = require("../resources/ai-companion/orchestration/autonomous/capabilities/tool-exposure-policy");
const { resolveCapabilityPolicy } = require("../resources/ai-companion/orchestration/shared/capability-policy");
const { executeTool } = require("../resources/ai-companion/orchestration/autonomous/tool-executor");
const { findDocumentation } = require("../resources/ai-companion/tools/workspace-documentation-tools");

async function temporaryDirectory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-advanced-tools-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("foreground user decisions snapshot before waiting and clear after resolution", async () => {
  let resolveInput;
  let snapshots = 0;
  const events = [];
  const gate = new InteractionGate({
    requestUserInput: () => new Promise((resolve) => { resolveInput = resolve; })
  }, (event) => events.push(event), async () => { snapshots += 1; });

  const waiting = gate.requestChoice({
    reason: "Choose the output form",
    questions: [{
      question: "Which format?",
      options: [
        { label: "Markdown", description: "Plain Markdown" },
        { label: "HTML", description: "Rendered HTML" }
      ]
    }, {
      question: "Which checks?",
      multiSelect: true,
      options: [
        { label: "Syntax", description: "Parse changed files" },
        { label: "Tests", description: "Run focused tests" }
      ]
    }]
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gate.snapshot().pending.questions[0].question, "Which format?");
  assert.equal(snapshots, 1);
  resolveInput({ answers: { "Which format?": "Markdown", "Which checks?": ["Syntax", "Tests"] } });
  const result = await waiting;
  assert.deepEqual(result.answers, { "Which format?": "Markdown", "Which checks?": ["Syntax", "Tests"] });
  assert.equal(gate.snapshot().pending, null);
  assert.equal(snapshots, 2);
  assert.deepEqual(events.map((event) => event.type), ["user-input-requested", "user-input-resolved"]);
});

test("network target checks reject local and mapped-private addresses", async () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("::ffff:7f00:1"), true);
  assert.equal(isPrivateAddress("::ffff:a00:1"), true);
  await assert.rejects(validatePublicUrl("http://127.0.0.1/private"), (error) => error.code === "PAGE_PRIVATE_ADDRESS");
  await assert.rejects(validatePublicUrl("file:///tmp/private"), (error) => error.code === "PAGE_PROTOCOL_DENIED");
});

test("connector search results obey allowed and blocked domain filters", async () => {
  const registry = new InternetProviderRegistry({ settings: {} }, null, {
    provider: {
      searchWeb: async () => [
        { title: "Allowed", url: "https://docs.example.com/a", description: "A" },
        { title: "Blocked", url: "https://blocked.example/b", description: "B" }
      ]
    }
  });
  assert.deepEqual(registry.list().map((entry) => entry.id), ["connector", "keyless"]);
  assert.equal(registry.select("connector").id, "connector");
  const result = await registry.search({ query: "example", allowedDomains: ["example.com"], blockedDomains: ["blocked.example"], maxResults: 8 });
  assert.deepEqual(result.results.map((entry) => entry.title), ["Allowed"]);
});

test("notebook edits require inspection, preserve unrelated data, and reject stale observations", async (t) => {
  const root = await temporaryDirectory(t);
  const notebookPath = path.join(root, "sample.ipynb");
  const original = {
    cells: [
      { id: "cell-one", cell_type: "code", metadata: { trusted: true }, source: ["print(1)\n"], execution_count: 7, outputs: [{ output_type: "stream", text: ["1\n"] }] },
      { id: "cell-two", cell_type: "markdown", metadata: { custom: "keep" }, source: [`# Keep me\n${"x".repeat(25000)}`] }
    ],
    metadata: { kernelspec: { name: "python3" }, custom: { retained: true } },
    nbformat: 4,
    nbformat_minor: 5
  };
  await fs.writeFile(notebookPath, JSON.stringify(original), "utf8");
  const storedArtifacts = [];
  const service = new NotebookDocumentService({ workspaceRoot: root }, () => {}, {
    artifacts: {
      async store(content, metadata) {
        const artifact = { id: `artifact-${storedArtifacts.length + 1}`, bytes: Buffer.byteLength(content), digest: String(storedArtifacts.length + 1) };
        storedArtifacts.push({ content, metadata, artifact });
        return artifact;
      }
    }
  });
  await assert.rejects(service.edit({ path: "sample.ipynb", mode: "replace", cellId: "cell-one", source: "print(2)\n" }), (error) => error.code === "NOTEBOOK_INSPECTION_REQUIRED");
  await service.inspect({ path: "sample.ipynb" });
  const edit = await service.edit({ path: "sample.ipynb", mode: "replace", cellId: "cell-one", source: "print(2)\n" });
  const updated = JSON.parse(await fs.readFile(notebookPath, "utf8"));
  assert.deepEqual(updated.metadata, original.metadata);
  assert.deepEqual(updated.cells[1], original.cells[1]);
  assert.deepEqual(updated.cells[0].outputs, original.cells[0].outputs);
  assert.equal(storedArtifacts.length, 2);
  assert.equal(edit.artifacts.before.id, "artifact-1");
  assert.equal(edit.artifacts.after.id, "artifact-2");
  await fs.writeFile(notebookPath, JSON.stringify({ ...updated, metadata: { changed: true } }), "utf8");
  await assert.rejects(service.edit({ path: "sample.ipynb", mode: "delete", cellId: "cell-two" }), (error) => error.code === "NOTEBOOK_STALE");
});

test("calendar expressions validate and calculate a later matching local minute", () => {
  assert.equal(parseScheduleExpression("*/15 * * * *").length, 5);
  const after = new Date(2026, 0, 1, 10, 7, 30).getTime();
  const next = new Date(nextScheduleTime("*/15 * * * *", after));
  assert.equal(next.getMinutes(), 15);
  assert.ok(next.getTime() > after);
  const mondayBeforeNextMonth = new Date(nextScheduleTime("0 0 1 * 1", new Date(2026, 0, 2, 0, 0, 0).getTime()));
  assert.equal(mondayBeforeNextMonth.getDay(), 1);
  assert.equal(mondayBeforeNextMonth.getMonth(), 0);
  assert.throws(() => parseScheduleExpression("* * *"), (error) => error.code === "SCHEDULE_EXPRESSION_INVALID");
});

test("new schedules are session-only by default and durable only when explicit", async (t) => {
  const root = await temporaryDirectory(t);
  const request = { workspaceRoot: root, profileRoot: root, settings: {} };
  const scheduler = new RunScheduler(request);
  await scheduler.load();
  const session = await scheduler.create({ prompt: "Session reminder", delayMinutes: 5 });
  assert.equal(session.durable, false);
  const durable = await scheduler.create({ prompt: "Durable reminder", delayMinutes: 5, durable: true });
  assert.equal(durable.durable, true);
  const store = JSON.parse(await fs.readFile(path.join(root, "companion", "schedules.json"), "utf8"));
  assert.deepEqual(store.entries.map((entry) => entry.id), [durable.id]);
  assert.equal(deterministicJitter("stable-id", 10), deterministicJitter("stable-id", 10));
});

test("structural ranking is deterministic and honors focused symbols", () => {
  const structures = [
    { path: "a.js", definitions: [{ name: "Alpha", line: 1, signature: "function Alpha()" }], references: ["Beta"] },
    { path: "b.js", definitions: [{ name: "Beta", line: 1, signature: "function Beta()" }], references: [] }
  ];
  const first = rankStructures(structures, [], ["Alpha"]).map((entry) => entry.path);
  const second = rankStructures(structures, [], ["Alpha"]).map((entry) => entry.path);
  assert.deepEqual(first, second);
  assert.equal(first[0], "a.js");
});

test("new secondary tool schemas remain deferred and mode-scoped", () => {
  const names = ["request_user_choice", "internet_search", "page_retrieve", "notebook_inspect", "notebook_cell_edit", "workspace_structure"];
  const chat = resolveCapabilityPolicy("chat");
  const agent = resolveCapabilityPolicy("agent");
  const chatRegistrations = new Map(getToolRegistrations(chat).map((entry) => [entry.definition.function.name, entry]));
  const agentRegistrations = new Map(getToolRegistrations(agent).map((entry) => [entry.definition.function.name, entry]));
  const exposure = new ToolExposurePolicy(agent);
  for (const name of names) assert.equal(exposure.classify(agentRegistrations.get(name)), "deferred");
  assert.equal(chatRegistrations.has("notebook_inspect"), true);
  assert.equal(chatRegistrations.has("notebook_cell_edit"), false);
  assert.equal(agentRegistrations.has("notebook_cell_edit"), true);
});

test("documentation discovery finds help entry points without broad workspace output", async (t) => {
  const root = await temporaryDirectory(t);
  await fs.mkdir(path.join(root, "desktop-app", "help", "user"), { recursive: true });
  await fs.mkdir(path.join(root, "vendor", "package"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "See the user help.", "utf8");
  await fs.writeFile(path.join(root, "desktop-app", "help", "user", "index.md"), "# User help", "utf8");
  await fs.writeFile(path.join(root, "vendor", "package", "README.md"), "Vendor", "utf8");
  const workspaceTools = require("../resources/ai-companion/tools/workspace-tools");
  const result = await findDocumentation(root, "where are the wiki docs", {}, { globFiles: workspaceTools.globFiles });
  assert.equal(result.results.some((entry) => entry.path === "desktop-app/help/user/index.md"), true);
  assert.equal(result.results.some((entry) => entry.path === "README.md"), true);
  assert.equal(result.results.some((entry) => entry.path.includes("vendor")), false);
  assert.equal(result.returned <= 20, true);
});

test("model-facing file overview is bounded, structured, and omits low-value directories", async (t) => {
  const root = await temporaryDirectory(t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "vendor"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, "src", "one.js"), "1", "utf8"),
    fs.writeFile(path.join(root, "src", "two.js"), "2", "utf8"),
    fs.writeFile(path.join(root, "vendor", "ignored.js"), "3", "utf8")
  ]);
  const result = await executeTool({ function: { name: "list_files", arguments: JSON.stringify({ maxFiles: 1 }) } }, {
    request: { workspaceRoot: root },
    capabilities: { assertCallable() {} },
    skillInvocation: { assertToolAllowed() {} }
  });
  assert.deepEqual(Object.keys(result).sort(), ["files", "limit", "omittedDirectories", "returned", "truncated"]);
  assert.equal(result.files.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.files.some((file) => file.includes("vendor")), false);
});

test("documentation lookup is immediately available to Chat", () => {
  const policy = resolveCapabilityPolicy("chat");
  const registrations = new Map(getToolRegistrations(policy).map((entry) => [entry.definition.function.name, entry]));
  assert.equal(registrations.has("find_documentation"), true);
  assert.equal(new ToolExposurePolicy(policy).classify({ name: "find_documentation" }), "immediate");
});
