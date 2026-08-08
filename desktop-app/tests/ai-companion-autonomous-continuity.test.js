"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ArtifactVault } = require("../resources/ai-companion/orchestration/autonomous/artifacts/artifact-vault");
const { ContinuityRecord, TEMPLATE } = require("../resources/ai-companion/orchestration/autonomous/continuity/continuity-record");
const { sanitizeContinuityText } = require("../resources/ai-companion/orchestration/autonomous/continuity/continuity-reference-policy");
const { buildSystemMessage } = require("../resources/ai-companion/orchestration/autonomous/context-builder");
const { resolveContextLimits } = require("../resources/ai-companion/orchestration/autonomous/context/token-budget");
const { WindowSteward } = require("../resources/ai-companion/orchestration/autonomous/context/window-steward");
const { completeWithOverflowRecovery, serializeRuntimeToolResult } = require("../resources/ai-companion/orchestration/autonomous/autonomous-loop");
const { RunChronicle } = require("../resources/ai-companion/orchestration/autonomous/recovery/run-chronicle");
const { RestartReconciler } = require("../resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler");
const { getRunIdentity } = require("../resources/ai-companion/orchestration/autonomous/work/run-identity");
const { CapabilityCatalog } = require("../resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog");
const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");

function createRequest(root, overrides = {}) {
  return {
    action: "agent",
    prompt: "Continue parser recovery",
    workspaceRoot: root,
    profileRoot: root,
    taskId: "stage-six-run",
    resumeRun: false,
    settings: { enabled: true, agentEnabled: true, provider: "test", model: "custom-stage-six", agentMaxResponseTokens: 0 },
    ...overrides
  };
}

test("context limits reserve output headroom and keep an unknown-model fallback", () => {
  const known = resolveContextLimits({ settings: { model: "custom" }, modelLimits: { contextWindow: 40000, maxOutputTokens: 8000 } });
  assert.equal(known.known, true);
  assert.equal(known.outputReserve, 8000);
  assert.ok(known.renewalThreshold > 0 && known.renewalThreshold < 40000);
  const unknown = resolveContextLimits({ settings: { model: "not-registered" }, autonomousContextCharacters: 43210 });
  assert.equal(unknown.known, false);
  assert.equal(unknown.characterLimit, 43210);
});

test("system context reports only the configured runtime connection identity", () => {
  const request = createRequest(process.cwd(), {
    settings: { enabled: true, agentEnabled: true, providerMode: "google-gemini-native", model: "gemini-3.6-flash" }
  });
  const system = buildSystemMessage(request, { mode: "agent" }, [], { application: "", rules: [] }, [{
    summary: "Assistant identity was Vendor Z Model Q.\nContinue parser recovery."
  }]);
  assert.match(system, /Connection mode: google-gemini-native/);
  assert.match(system, /Selected model identifier: gemini-3\.6-flash/);
  assert.doesNotMatch(system, /Vendor Z Model Q/);
});

test("continuity excludes assistant and provider identity claims", () => {
  const sanitized = sanitizeContinuityText([
    "Continue parser recovery.",
    "Assistant identity was Vendor Z Model Q.",
    "The assistant is powered by Vendor Z.",
    "Verify restart behavior."
  ].join("\n"));
  assert.match(sanitized, /Continue parser recovery/);
  assert.match(sanitized, /Verify restart behavior/);
  assert.doesNotMatch(sanitized, /Vendor Z/);
});

test("artifact observations remain readable after a new vault instance", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = createRequest(root);
  const first = new ArtifactVault(request);
  await first.load();
  const stored = await first.store("0123456789", { tool: "read_file", callId: "call-one" });
  const restored = new ArtifactVault(request);
  await restored.load();
  const result = await restored.read(stored.id, { offset: 2, length: 4 });
  assert.equal(result.content, "2345");
  assert.equal(result.hasMore, true);
});

test("large live tool results become durable references before transcript truncation", async () => {
  const request = createRequest(process.cwd(), { profileRoot: "" });
  const vault = new ArtifactVault(request);
  const marker = await serializeRuntimeToolResult("z".repeat(30000), "read_file", "large-call", { artifactVault: vault });
  assert.match(marker, /artifact-1/);
  const restored = await vault.read("artifact-1", { offset: 25000, length: 100 });
  assert.equal(restored.content, "z".repeat(100));
});

test("structured renewal keeps five recent decisions and rebuilds authoritative anchors", async () => {
  const request = createRequest(process.cwd(), { profileRoot: "", modelLimits: { contextWindow: 40000, maxOutputTokens: 8000 } });
  const provider = { async completeMessage() { return { content: JSON.stringify({ userObjective: "repair parser", remainingActions: ["verify"] }) }; } };
  const vault = new ArtifactVault(request);
  const steward = new WindowSteward(request, provider, vault);
  const messages = [{ role: "system", content: "old rules" }, { role: "user", content: "repair parser" }];
  for (let index = 0; index < 6; index++) messages.push({ role: "assistant", content: `decision-${index}-${"x".repeat(10000)}` });
  const context = {
    request,
    work: { snapshot: () => [{ id: "1", status: "in_progress" }] },
    workers: { snapshot: () => [] },
    continuity: { flush: async () => {} },
    hooks: { run: async () => ({ additionalContext: [] }) },
    buildRenewalAnchors: async (digest) => [{ role: "system", content: `current rules\n${digest.userObjective}` }]
  };
  const result = await steward.prepare(messages, context);
  assert.equal(result.renewed, true);
  assert.match(messages[0].content, /current rules/);
  assert.equal(messages.filter((message) => message.role === "assistant").length, 5);
  assert.equal(messages.some((message) => /decision-0/.test(message.content)), false);
});

test("continuity updates become searchable only inside the same workspace", async (t) => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-continuity-"));
  const workspace = path.join(profile, "workspace-a");
  const otherWorkspace = path.join(profile, "workspace-b");
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(otherWorkspace, { recursive: true });
  t.after(() => fs.rm(profile, { recursive: true, force: true }));
  const updatedRecord = TEMPLATE.replace(
    "_Immediate work, unfinished actions, and next steps._",
    "_Immediate work, unfinished actions, and next steps._\n\nRepair the parser recovery flow and verify restart behavior."
  );
  const provider = { async completeMessage() { return { content: updatedRecord, toolCalls: [] }; } };
  const first = new ContinuityRecord(createRequest(workspace, { profileRoot: profile, taskId: "first-run" }), provider);
  await first.load();
  assert.equal(first.scheduleUpdate([{ role: "user", content: "parser ".repeat(6000) }], { naturalStop: true }), true);
  await first.flush();
  const sameWorkspace = new ContinuityRecord(createRequest(workspace, { profileRoot: profile, taskId: "second-run" }), provider);
  const matches = await sameWorkspace.search("parser recovery");
  assert.equal(matches.length, 1);
  assert.match(matches[0].summary, /parser recovery/i);
  const isolated = new ContinuityRecord(createRequest(otherWorkspace, { profileRoot: profile, taskId: "third-run" }), provider);
  assert.deepEqual(await isolated.search("parser recovery"), []);
});

test("run chronicle recovers the latest valid journal snapshot after a torn current write", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-chronicle-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = createRequest(root, { resumeRun: true });
  const chronicle = new RunChronicle(request);
  await chronicle.saveSnapshot({ status: "running", messages: [{ role: "user", content: "first" }] });
  await chronicle.saveSnapshot({ status: "completed", messages: [], finalResponse: "done" });
  const currentPath = path.join(chronicle.directory, "current.json");
  await fs.writeFile(currentPath, "{torn", "utf8");
  const reloaded = new RunChronicle(request);
  const recovered = await reloaded.loadRecovery();
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.finalResponse, "done");
  const appended = await reloaded.append("continued", {});
  assert.ok(appended.sequence > recovered.sequence);
});

test("run chronicle falls back to the previous snapshot when the journal tail is unusable", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-chronicle-previous-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = createRequest(root, { resumeRun: true, taskId: "previous-fallback" });
  const chronicle = new RunChronicle(request);
  await chronicle.saveSnapshot({ status: "running", messages: [{ role: "user", content: "safe" }] });
  await chronicle.saveSnapshot({ status: "failed", messages: [], error: "newer" });
  await fs.writeFile(path.join(chronicle.directory, "current.json"), "{torn", "utf8");
  await fs.writeFile(path.join(chronicle.directory, "chronicle.jsonl"), "{torn\n", "utf8");
  const recovered = await new RunChronicle(request).loadRecovery();
  assert.equal(recovered.status, "running");
  assert.equal(recovered.messages[0].content, "safe");
});

test("version-two autonomous checkpoints migrate into the new recovery envelope", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-checkpoint-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = createRequest(root, { resumeRun: true });
  const directory = path.join(root, ".md-editor", "companion", "autonomous-checkpoints");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${getRunIdentity(request)}.json`), JSON.stringify({ schemaVersion: 2, status: "running", messages: [{ role: "user", content: "resume" }] }), "utf8");
  const recovered = await new RunChronicle(request).loadRecovery();
  assert.equal(recovered.schemaVersion, 5);
  assert.equal(recovered.migratedFrom, 2);
  assert.equal(recovered.messages[0].content, "resume");
});

test("renewal failures enter cooldown after three attempts", async () => {
  const request = createRequest(process.cwd(), { profileRoot: "", modelLimits: { contextWindow: 40000, maxOutputTokens: 8000 } });
  let calls = 0;
  const provider = { async completeMessage() { calls += 1; throw new Error("summary unavailable"); } };
  const steward = new WindowSteward(request, provider, new ArtifactVault(request));
  const context = {
    request,
    work: { snapshot: () => [] },
    workers: { snapshot: () => [] },
    continuity: { flush: async () => {} },
    hooks: { run: async () => ({ additionalContext: [] }) },
    buildRenewalAnchors: async () => []
  };
  const createMessages = () => [{ role: "system", content: "rules" }, ...Array.from({ length: 6 }, (_, index) => ({ role: "assistant", content: `decision-${index}-${"x".repeat(10000)}` }))];
  for (let attempt = 0; attempt < 3; attempt++) await steward.prepare(createMessages(), context);
  const cooldown = await steward.prepare(createMessages(), context);
  assert.equal(calls, 3);
  assert.equal(cooldown.renewed, false);
  assert.equal(cooldown.warning.reason, "renewal-cooldown");
});

test("restart reconciliation never restores grants and reports uncertain tools", () => {
  const request = createRequest(process.cwd());
  const chronicle = new RunChronicle(request);
  const snapshot = chronicle.envelope({
    status: "running",
    messages: [{ role: "system", content: "old" }, { role: "assistant", content: "", tool_calls: [{ id: "pending-write", function: { name: "write_file", arguments: "{}" } }] }],
    pendingTools: [{ id: "pending-write", name: "write_file" }],
    taskGrants: [{ capability: "workspace.file.write" }]
  });
  const reconciler = new RestartReconciler();
  const decision = reconciler.evaluate(request, snapshot, {});
  const rebuilt = reconciler.rebuild(snapshot, decision);
  assert.equal(decision.classification, "recoverable");
  assert.deepEqual(rebuilt.taskGrants, []);
  assert.equal(rebuilt.messages.some((message) => message.role === "tool" && message.tool_call_id === "pending-write"), true);
  assert.match(rebuilt.messages.at(-1).content, /unknown outcome/i);
});

test("provider overflow receives exactly one renewal retry", async () => {
  let calls = 0;
  let renewals = 0;
  const provider = { async completeMessage() {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("context window exceeded"), { code: 413 });
    return { content: "recovered", toolCalls: [] };
  } };
  const context = {
    windowSteward: { prepare: async () => { renewals += 1; return { renewed: true }; } },
    saveSnapshot: async () => {}
  };
  const response = await completeWithOverflowRecovery(provider, [], {}, context);
  assert.equal(response.content, "recovered");
  assert.equal(calls, 2);
  assert.equal(renewals, 1);
});

test("panel forwards model limits and persists autonomous recovery activity", () => {
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "..", "resources", "js", "ai-companion", "panel.js"), "utf8");
  assert.match(source, /modelLimits:\s*\(\(\) =>/);
  assert.match(source, /"context-thinned", "observation-released", "observation-release-reminder", "tool-catalog-updated", "tool-schema-activated", "tool-schema-restored", "tool-schema-unavailable", "continuity-updated", "chronicle-saved", "run-restored", "recovery-warning"/);
  assert.match(source, /activeAgentEntry\.record\.recoverySummary/);
  assert.match(source, /function appendAutonomousRuntimeStatus\(event\)/);
});

test("recovery revalidates external capability schemas instead of trusting saved definitions", async () => {
  const external = { type: "function", function: { name: "mcp__docs__read", description: "Current schema", parameters: { type: "object", properties: {} } } };
  const catalog = new CapabilityCatalog({
    policy: {},
    baseDefinitions: [{ type: "function", function: { name: "read_file" } }],
    fabric: { entries: new Map([["bundle:server", { kind: "mcp-server", localId: "docs", metadata: {} }]]) },
    mcp: { getToolDefinitions: async () => [external] }
  });
  const result = await catalog.restore(["read_file", "mcp__docs__read", "mcp__missing__tool"]);
  assert.deepEqual(result.restored, ["mcp__docs__read"]);
  assert.deepEqual(result.missing, ["mcp__missing__tool"]);
  assert.equal(catalog.definitions().some((entry) => entry.function?.description === "Current schema"), true);
});

test("recoverable runs continue from a safe transcript and publish one final response", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-recoverable-run-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createRequest(root, {
    taskId: "recoverable-run",
    settings: { enabled: true, agentEnabled: true, provider: "test", model: "custom-stage-six", agentMaxResponseTokens: 0 },
    securityContext: { policy: { shell: { mode: "deny-and-audit" } } }
  });
  await new RunChronicle(base).saveSnapshot({
    status: "running",
    messages: [{ role: "system", content: "saved rules" }, { role: "user", content: "continue safely" }],
    work: [], workers: [], loadedExtensions: [], loadedExtensionBodies: [], pendingTools: []
  });
  let calls = 0;
  const events = [];
  const result = await new AutonomousOrchestrator().run({ ...base, resumeRun: true }, {
    provider: { async completeMessage(messages) {
      calls += 1;
      assert.equal(messages[0].role, "system");
      return { content: "Recovered work completed.", toolCalls: [] };
    } }
  }, (event) => events.push(event));
  assert.equal(result.content, "Recovered work completed.");
  assert.equal(calls, 1);
  assert.equal(events.some((event) => event.type === "run-restored"), true);
  assert.equal(events.filter((event) => event.type === "assistant-final").length, 1);
});
