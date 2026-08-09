/** Regression coverage for autonomous lifecycle automation. */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { HookGateway } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-gateway");
const { BackgroundActionRegistry } = require("../resources/ai-companion/orchestration/autonomous/hooks/background-action-registry");
const { normalizeHookDefinition } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-definition-policy");
const { HookSourceCatalog } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-source-catalog");
const { matchesLifecycleHook } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-matcher");
const { readBoundedResponse, redactSecrets, safeUrl } = require("../resources/ai-companion/orchestration/autonomous/hooks/lifecycle-action-registry");
const { WorkspaceLifecycleObserver } = require("../resources/ai-companion/orchestration/autonomous/hooks/workspace-lifecycle-observer");
const { validateToolInput } = require("../resources/ai-companion/orchestration/autonomous/capabilities/tool-input-validator");
const { authorizeTool } = require("../resources/ai-companion/orchestration/autonomous/approval-gateway");

test("definitions normalize aliases, chains, matchers, and bounded repetition controls", () => {
  const value = normalizeHookDefinition({
    id: "check-tool",
    event: "permission-requested",
    matcher: { tool: "write_*", mode: ["agent"] },
    actions: [{ type: "prompt", prompt: "Return JSON." }, { type: "notify-user", message: "Checked" }],
    timeoutMs: 999999,
    cooldownMs: 250,
    dedupWindowMs: 500,
    maxDepth: 4
  }, { scope: "profile", id: "profile", trusted: true });
  assert.equal(value.id, "profile:check-tool");
  assert.equal(value.event, "permission-request");
  assert.deepEqual(value.actions.map((action) => action.type), ["model-check", "notify-user"]);
  assert.equal(value.timeoutMs, 300000);
  assert.equal(value.source.trusted, true);
  assert.equal(matchesLifecycleHook(value.matcher, { tool: "write_file", mode: "agent" }), true);
  assert.equal(matchesLifecycleHook(value.matcher, { tool: "read_file", mode: "agent" }), false);
});

test("gateway aggregates chained decisions and suppresses duplicate invocations", async () => {
  const emitted = [];
  const gateway = new HookGateway({ requestApproval: async () => ({ approved: true }), securityContext: { policy: {} } }, [{
    id: "guard",
    event: "before-tool",
    matcher: { tool: "write_*" },
    dedupWindowMs: 60000,
    actions: [
      { type: "context", content: "Read the current file first." },
      { type: "model-check", prompt: "Return a JSON decision." }
    ]
  }], (event) => emitted.push(event));
  gateway.setContext({
    routeSession: { accessForPurpose: () => ({ provider: { completeMessage: async () => ({ content: JSON.stringify({ updatedInput: { path: "safe.md" }, permissionDecision: "deny", stop: true, reason: "blocked" }) }) } }) },
    lifecycleObserver: { snapshot: () => ({ watchPaths: [] }), update() {} }
  });
  const first = await gateway.run("before-tool", { tool: "write_file", input: { path: "other.md" } });
  const second = await gateway.run("before-tool", { tool: "write_file", input: { path: "other.md" } });
  assert.deepEqual(first.additionalContext, ["Read the current file first."]);
  assert.deepEqual(first.updatedInput, { path: "safe.md" });
  assert.equal(first.permissionDecision, "deny");
  assert.equal(first.continue, false);
  assert.deepEqual(second, { additionalContext: [] });
  assert.ok(emitted.some((event) => event.type === "hook-blocked"));
  assert.ok(emitted.some((event) => event.type === "hook-skipped" && /duplicate/.test(event.reason)));
  await gateway.close();
});

test("source catalog loads settings, trusted workspace, profile, and request hooks with unique IDs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-hooks-"));
  const profileRoot = path.join(root, "profile");
  const workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(path.join(profileRoot, "companion", "hooks"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, ".md-editor", "companion", "hooks"), { recursive: true });
  await fs.writeFile(path.join(profileRoot, "companion", "hooks", "hooks.json"), JSON.stringify({ hooks: [{ id: "profile-one", event: "run-start", action: { type: "context", content: "profile" } }] }));
  await fs.writeFile(path.join(workspaceRoot, ".md-editor", "companion", "hooks", "hooks.json"), JSON.stringify([{ id: "workspace-one", event: "run-start", action: { type: "context", content: "workspace" } }]));
  const request = {
    profileRoot,
    workspaceRoot,
    settings: {
      trustWorkspaceHooks: true,
      lifecycleHooks: [{ id: "settings-one", event: "run-start", action: { type: "context", content: "settings" } }]
    },
    hooks: [{ id: "request-one", event: "run-start", action: { type: "context", content: "request" } }],
    hooksTrusted: false
  };
  const snapshot = await new HookSourceCatalog(request, { entries: new Map() }).load();
  assert.equal(snapshot.errors.length, 0);
  assert.equal(snapshot.definitions.length, 4);
  assert.equal(new Set(snapshot.definitions.map((entry) => entry.id)).size, 4);
  assert.equal(snapshot.definitions.find((entry) => entry.localId === "workspace-one").source.trusted, true);
  assert.equal(snapshot.definitions.find((entry) => entry.localId === "request-one").source.trusted, false);
  await fs.rm(root, { recursive: true, force: true });
});

test("untrusted workspace definitions fail closed until workspace trust is enabled", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-hooks-trust-"));
  const workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(path.join(workspaceRoot, ".md-editor", "companion", "hooks"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, ".md-editor", "companion", "hooks", "hooks.json"), JSON.stringify([{ id: "workspace-one", event: "run-start", action: { type: "context", content: "workspace" } }]));
  const snapshot = await new HookSourceCatalog({ workspaceRoot, settings: { trustWorkspaceHooks: false } }, { entries: new Map() }).load();
  assert.equal(snapshot.definitions.length, 0);
  assert.equal(snapshot.errors.length, 1);
  assert.match(snapshot.errors[0].error, /require trust/i);
  await fs.rm(root, { recursive: true, force: true });
});

test("trusted lifecycle approval is opt-in and denial still wins", async () => {
  const base = {
    workspaceRoot: "C:\\workspace",
    settings: { allowHookManagedApprovals: true },
    securityContext: { policy: {} },
    lifecycleHooks: { run: async () => ({ additionalContext: [], permissionDecision: "allow", permissionTrusted: true }) },
    requestApproval: async () => { throw new Error("UI approval should not be reached."); }
  };
  const controls = { permissionPolicy: { resolve: async () => ({ decision: "prompt" }) } };
  const allowed = await authorizeTool(base, "extension_hook_run", { hookId: "x", actionType: "command" }, [], controls);
  assert.equal(allowed.approved, true);
  assert.equal(allowed.approvalSource, "trusted-lifecycle-hook");

  base.lifecycleHooks.run = async () => ({ additionalContext: [], permissionDecision: "deny", permissionTrusted: true, stopReason: "policy" });
  const denied = await authorizeTool(base, "extension_hook_run", { hookId: "x", actionType: "command" }, [], controls);
  assert.equal(denied.approved, false);
  assert.equal(denied.doNotRetry, true);
});

test("web actions reject loopback and private-network targets", async () => {
  await assert.rejects(() => safeUrl("http://localhost/action", { allowHttp: true }), /localhost/i);
  await assert.rejects(() => safeUrl("http://127.0.0.1/action", { allowHttp: true }), /private network/i);
  await assert.rejects(() => safeUrl("http://example.com/action"), /require HTTPS/i);
  await assert.rejects(() => safeUrl("file:///tmp/action"), /HTTP or HTTPS/i);
});

test("web action output is bounded and secret fields are redacted", async () => {
  await assert.rejects(() => readBoundedResponse({
    headers: { get: () => "6" },
    text: async () => "secret"
  }, 5), /exceeds 5 bytes/i);
  assert.deepEqual(redactSecrets({ token: "private", nested: { password: "private", visible: "ok" } }), {
    token: "[redacted]",
    nested: { password: "[redacted]", visible: "ok" }
  });
});

test("conditional failure branches execute and repeated hook failures open a cooldown circuit", async () => {
  const emitted = [];
  const request = {
    requestApproval: async () => ({ approved: true }),
    securityContext: { policy: {} }
  };
  const branched = new HookGateway(request, [{
    id: "branch",
    event: "run-start",
    onError: "continue",
    actions: [{
      type: "application-callback",
      callbackId: "failure",
      onFailure: [{ type: "notify-user", level: "warning", message: "Fallback ran" }]
    }]
  }], (event) => emitted.push(event));
  branched.setContext({ services: { hookCallbacks: { failure: async () => { throw new Error("expected"); } } }, taskGrants: [] });
  const decision = await branched.run("run-start", { mode: "agent" });
  assert.equal(decision.notifications[0].message, "Fallback ran");

  const circuit = new HookGateway(request, [{
    id: "circuit",
    event: "run-start",
    dedupWindowMs: 0,
    onError: "continue",
    action: { type: "application-callback", callbackId: "failure" }
  }], (event) => emitted.push(event));
  circuit.setContext({ services: { hookCallbacks: { failure: async () => { throw new Error("expected"); } } }, taskGrants: [] });
  await circuit.run("run-start", { attempt: 1 });
  await circuit.run("run-start", { attempt: 2 });
  await circuit.run("run-start", { attempt: 3 });
  await circuit.run("run-start", { attempt: 4 });
  assert.ok(emitted.some((event) => event.type === "hook-failed" && event.circuitOpened === true));
  assert.ok(emitted.some((event) => event.type === "hook-skipped" && /circuit/i.test(event.reason)));
  await branched.close();
  await circuit.close();
});

test("lifecycle action timeout aborts the underlying callback", async () => {
  let aborted = false;
  const gateway = new HookGateway({
    requestApproval: async () => ({ approved: true }),
    securityContext: { policy: {} }
  }, [{
    id: "timeout",
    event: "run-start",
    timeoutMs: 100,
    onError: "continue",
    action: { type: "application-callback", callbackId: "slow" }
  }]);
  gateway.setContext({
    taskGrants: [],
    services: {
      hookCallbacks: {
        slow: async (_payload, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          aborted = true;
          reject(options.signal.reason || new Error("aborted"));
        }, { once: true }))
      }
    }
  });
  const decision = await gateway.run("run-start", {});
  assert.equal(aborted, true);
  assert.match(decision.notifications[0].message, /timed out/i);
  await gateway.close();
});

test("rewritten tool inputs are checked against required, typed, and closed fields", () => {
  const schema = {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: { path: { type: "string" }, count: { type: "integer" } }
  };
  assert.doesNotThrow(() => validateToolInput(schema, { path: "safe.md", count: 2 }));
  assert.throws(() => validateToolInput(schema, { count: 2 }), /path.*required/i);
  assert.throws(() => validateToolInput(schema, { path: "safe.md", count: "2" }), /count.*integer/i);
  assert.throws(() => validateToolInput(schema, { path: "safe.md", extra: true }), /extra.*allowed/i);
});

test("background recovery marks uncertain work interrupted instead of replaying it", () => {
  const emitted = [];
  const registry = new BackgroundActionRegistry((event) => emitted.push(event));
  registry.restore({ entries: [{ id: "one", status: "running", hookId: "hook", event: "run-start" }] });
  const snapshot = registry.snapshot();
  assert.equal(snapshot.entries[0].status, "interrupted");
  assert.ok(emitted.some((event) => event.type === "recovery-warning"));
});

test("workspace observer classifies add, change, delete, deduplicates, and disposes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-hook-watch-"));
  const target = path.join(root, "watched.md");
  const events = [];
  const observer = new WorkspaceLifecycleObserver({ workspaceRoot: root }, async (event, payload) => events.push({ event, payload }));
  observer.update([target]);
  await fs.writeFile(target, "one");
  await observer.fire(target, "rename");
  await fs.writeFile(target, "two");
  await observer.fire(target, "change");
  await fs.rm(target);
  await observer.fire(target, "rename");
  observer.close();
  assert.deepEqual(events.map((entry) => entry.payload.change), ["created", "changed", "deleted"]);
  assert.equal(observer.watchers.size, 0);
  await fs.rm(root, { recursive: true, force: true });
});

test("lifecycle settings normalize without enabling trust or managed approvals by default", () => {
  const defaults = normalizeAiCompanionSettings({ lifecycleHooks: [{ id: "one" }] });
  assert.equal(defaults.trustWorkspaceHooks, false);
  assert.equal(defaults.allowHookManagedApprovals, false);
  assert.deepEqual(defaults.lifecycleHooks, [{ id: "one" }]);
  const enabled = normalizeAiCompanionSettings({ trustWorkspaceHooks: true, allowHookManagedApprovals: true });
  assert.equal(enabled.trustWorkspaceHooks, true);
  assert.equal(enabled.allowHookManagedApprovals, true);
});

test("settings UI exposes structured lifecycle controls and advanced JSON editing", async () => {
  const html = await fs.readFile(path.join(__dirname, "..", "resources", "index.html"), "utf8");
  const controller = await fs.readFile(path.join(__dirname, "..", "resources", "js", "ai-companion", "lifecycle-settings.js"), "utf8");
  for (const id of ["settings-ai-lifecycle-rows", "settings-ai-lifecycle-refresh", "settings-ai-lifecycle-add", "settings-ai-lifecycle-json", "settings-ai-lifecycle-action-rows", "settings-ai-lifecycle-preview-match", "settings-ai-trust-workspace-hooks", "settings-ai-hook-managed-approvals"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Advanced action-chain JSON/);
  assert.match(controller, /aiCompanionLifecycleSettings/);
  assert.match(controller, /previewMatcher/);
  assert.match(controller, /renderEditorActions/);
});

test("autonomous lifecycle modules do not import removed controller layers", async () => {
  const directory = path.join(__dirname, "..", "resources", "ai-companion", "orchestration", "autonomous", "hooks");
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".js"));
  const source = (await Promise.all(files.map((name) => fs.readFile(path.join(directory, name), "utf8")))).join("\n");
  assert.doesNotMatch(source, /(?:legacy|evaluation|acceptance-criteria|agent-state-controller)/i);
});
