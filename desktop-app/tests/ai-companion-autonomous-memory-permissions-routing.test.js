"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { CuratedMemoryRepository } = require("../resources/ai-companion/orchestration/autonomous/memory/curated-memory-repository");
const { MemoryProposalSession } = require("../resources/ai-companion/orchestration/autonomous/memory/memory-proposal-session");
const { PermissionModePolicy } = require("../resources/ai-companion/orchestration/autonomous/permissions/permission-mode-policy");
const { ActionRiskAdvisor } = require("../resources/ai-companion/orchestration/autonomous/permissions/action-risk-advisor");
const { DenialLedger } = require("../resources/ai-companion/orchestration/autonomous/permissions/denial-ledger");
const { ProviderRouteCatalog } = require("../resources/ai-companion/orchestration/autonomous/routing/provider-route-catalog");
const { ProviderRouteSession, isFallbackEligible } = require("../resources/ai-companion/orchestration/autonomous/routing/provider-route-session");
const { buildSystemMessage } = require("../resources/ai-companion/orchestration/autonomous/context-builder");
const { getToolDefinitions } = require("../resources/ai-companion/orchestration/autonomous/tool-catalog");

async function tempRoots() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-curated-memory-"));
  return { root, request: { profileRoot: path.join(root, "profile"), workspaceRoot: path.join(root, "workspace") } };
}

test("curated memory writes only after explicit confirmation and remains lazily readable", async () => {
  const { request } = await tempRoots();
  await fs.mkdir(request.workspaceRoot, { recursive: true });
  request.requestApproval = async () => ({ approved: true });
  const repository = new CuratedMemoryRepository(request);
  const session = new MemoryProposalSession(request, repository);
  const result = await session.propose({ scope: "personal", type: "preference", title: "Testing style", summary: "Prefer focused tests.", content: "Prefer focused tests before the full suite.", tags: ["tests"] });
  assert.equal(result.confirmed, true);
  const found = await repository.search("focused tests");
  assert.equal(found.length, 1);
  assert.equal(found[0].content, undefined);
  assert.equal((await repository.read(found[0].id)).content, "Prefer focused tests before the full suite.");
});

test("rejected and sensitive memory proposals never persist", async () => {
  const { request } = await tempRoots();
  request.requestApproval = async () => ({ approved: false, instructions: "Do not retain this." });
  const repository = new CuratedMemoryRepository(request);
  const session = new MemoryProposalSession(request, repository);
  const rejected = await session.propose({ scope: "team", type: "convention", title: "Rejected", content: "Do not save." });
  assert.equal(rejected.denied, true);
  assert.deepEqual(await repository.search("Rejected"), []);
  await assert.rejects(() => session.propose({ scope: "personal", type: "reference", title: "Secret", content: "api_key=abcdefghijklmnop" }), { code: "MEMORY_SENSITIVE_CONTENT" });
});

test("permission modes remain below explicit security boundaries", async () => {
  const descriptor = { capability: "workspace.file.write" };
  assert.equal((await new PermissionModePolicy("guided").resolve(descriptor)).decision, "prompt");
  assert.equal((await new PermissionModePolicy("observe-only").resolve(descriptor)).decision, "deny");
  assert.equal((await new PermissionModePolicy("edit-trusted").resolve(descriptor)).decision, "allow");
  assert.equal((await new PermissionModePolicy("preauthorized-only").resolve(descriptor)).decision, "deny");
  assert.equal((await new PermissionModePolicy("sandbox-unattended", { approvals: { allowUnattended: false } }).resolve(descriptor)).decision, "deny");
});

test("command auto-run applies only to structurally proven read-only actions", async () => {
  const policy = new PermissionModePolicy("guided");
  const descriptor = { capability: "shell.freeform" };
  assert.equal((await policy.resolve(descriptor, { autoRunCommands: true, commandAnalysis: { canAutoRun: true, impact: "read-only" } })).decision, "allow");
  assert.equal((await policy.resolve(descriptor, { autoRunCommands: true, commandAnalysis: { canAutoRun: false, impact: "destructive" } })).decision, "prompt");
  assert.equal((await policy.resolve(descriptor, { autoRunCommands: true, commandAnalysis: { canAutoRun: false, impact: "unknown" } })).decision, "prompt");
});

test("risk advice cannot override restricted command analysis", async () => {
  let providerCalls = 0;
  const advisor = new ActionRiskAdvisor({ completeMessage: async () => { providerCalls += 1; return { content: '{"decision":"allow"}' }; } }, {});
  const result = await advisor.evaluate({ capability: "shell.freeform" }, { commandAnalysis: { parseable: true, impact: "destructive", canAutoRun: false } });
  assert.equal(result.decision, "prompt");
  assert.equal(providerCalls, 0);
});

test("denial ledger suppresses equivalent calls and trips after repeated denials", () => {
  const ledger = new DenialLedger({ workspaceRoot: "C:/workspace" });
  const descriptor = { capability: "workspace.file.write", resource: { type: "path-glob", value: "src/a.js" } };
  ledger.record("write_file", { path: "src/a.js" }, descriptor, { instructions: "Use another file." });
  assert.equal(ledger.check("write_file", { path: "src/a.js" }, descriptor).instructions, "Use another file.");
  ledger.record("write_file", { path: "src/b.js" }, { ...descriptor, resource: { type: "path-glob", value: "src/b.js" } });
  ledger.record("write_file", { path: "src/c.js" }, { ...descriptor, resource: { type: "path-glob", value: "src/c.js" } });
  assert.equal(ledger.tripped, true);
});

test("provider routes preserve the single-provider default and constrain fallback", () => {
  const settings = normalizeAiCompanionSettings({ enabled: true, providerMode: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "local-model", providerRoutes: [{ id: "primary", profileId: "default", model: "local-model", purposes: ["primary"], fallbacks: ["backup"], allowProviderChange: false }, { id: "backup", profileId: "default", model: "backup-model", purposes: ["primary"] }] });
  const catalog = new ProviderRouteCatalog(settings);
  assert.equal(catalog.resolve("primary").route.model, "local-model");
  const provider = { completeMessage: async () => ({ content: "ok" }) };
  const session = new ProviderRouteSession({ settings }, catalog, () => {}, { provider });
  assert.equal(session.select("primary", { requiredDataScopes: ["workspace"] }), provider);
  assert.equal(session.fallback({ status: 429 }).notice.includes("backup"), true);
  assert.equal(isFallbackEligible({ status: 401 }), false);
});

test("memory and routing tools are available through the deferred catalog", () => {
  const names = getToolDefinitions({ allowWrites: false, allowCommands: false, allowDelegation: false, allowPlanReads: false, allowPlanWrites: false, allowSkillInvocation: true, allowScheduling: false }, {}).map((entry) => entry.function.name);
  for (const name of ["memory_search", "memory_read", "memory_propose", "memory_update", "memory_forget", "route_list", "route_inspect", "route_select"]) assert.equal(names.includes(name), true);
  const system = buildSystemMessage({ settings: {}, action: "agent" }, { mode: "agent" }, [], { application: "", rules: [] }, [], "", { recalledMemory: ["[personal/preference] Tests: Prefer focused tests. (memory:1)"], permissionMode: "guided", routes: [{ id: "primary", purposes: ["primary"] }] });
  assert.match(system, /Never claim memory was saved until the user confirms it/);
  assert.match(system, /Active permission mode: guided/);
  assert.match(system, /primary: primary/);
});
