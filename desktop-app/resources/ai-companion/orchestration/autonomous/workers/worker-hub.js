/** Isolated worker scheduling, messaging, waiting, and lifecycle control. */

"use strict";

const path = require("node:path");
const { createProvider } = require("../../shared/provider-factory");
const { runAutonomousLoop } = require("../autonomous-loop");
const { AgentAuthorityResolver } = require("../agents/agent-authority-resolver");
const { CapabilityCatalog } = require("../capabilities/capability-catalog");
const { WindowSteward } = require("../context/window-steward");
const { ObservationLedger } = require("../context/observation-ledger");
const { ContextReleaseReminder } = require("../context/context-release-reminder");
const { finishWorkerWorkspace, prepareWorkerWorkspace } = require("./worker-workspace");
const { getRunIdentity } = require("../work/run-identity");

const MAX_ACTIVE_WORKERS = 10;
const MAX_RESULT_CHARS = 16000;

class WorkerHub {
  constructor(provider, request, options) {
    this.provider = provider;
    this.request = request;
    this.fabric = options.fabric;
    this.parentContext = options.parentContext;
    this.events = options.events;
    this.entries = new Map();
    this.pending = [];
    this.notifications = [];
    this.activeCount = 0;
    this.sequence = 0;
    this.changeWaiters = new Set();
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  }

  /** Launch a worker immediately or queue it behind the concurrency ceiling. */
  async launch(args) {
    const id = `worker-${++this.sequence}`;
    const agent = args.agentId ? await this.fabric?.activate(args.agentId) : null;
    if (args.agentId && agent?.kind !== "agent") throw new Error(`Unknown agent definition: ${args.agentId}`);
    const authority = this.resolveAuthority(agent, args.isolation);
    const entry = { id, description: String(args.description || "Delegated work"), prompt: String(args.prompt || ""), agentId: agent?.id || "", status: "queued", background: args.background === true, inbox: [], messages: [], result: "", error: "", controller: new AbortController(), agent, authority, isolation: authority.isolation };
    entry.completion = new Promise((resolve) => { entry.resolveCompletion = resolve; });
    if (!entry.prompt.trim()) throw new Error("Worker launch requires a prompt.");
    this.entries.set(id, entry);
    this.pending.push(entry);
    this.events.emit({ type: "worker-queued", worker: publicEntry(entry) });
    this.schedule();
    if (!entry.background) await this.wait(id, { block: true, timeoutMs: 0 });
    return publicEntry(entry);
  }

  /** Return redacted worker state without transcripts or controllers. */
  list() { return Array.from(this.entries.values(), publicEntry); }

  /** Queue guidance, resuming a completed or failed worker on its existing transcript. */
  async message(id, message, summary = "") {
    const entry = this.requireEntry(id);
    entry.inbox.push({ message: String(message || ""), summary: String(summary || ""), sentAt: new Date().toISOString() });
    this.events.emit({ type: "worker-message", workerId: entry.id, summary: String(summary || "") });
    if (["completed", "failed", "stopped", "interrupted"].includes(entry.status)) {
      entry.status = "queued";
      entry.error = "";
      entry.result = "";
      entry.controller = new AbortController();
      entry.completion = new Promise((resolve) => { entry.resolveCompletion = resolve; });
      this.pending.push(entry);
      this.schedule();
    }
    this.persistChange();
    return publicEntry(entry);
  }

  /** Wait for terminal state, optionally returning an immediate snapshot. */
  async wait(id, options = {}) {
    const entry = this.requireEntry(id);
    if (options.block === false || isTerminal(entry.status)) return publicEntry(entry);
    const timeoutMs = Math.max(0, Math.min(Number(options.timeoutMs || 30000), 30000));
    if (!timeoutMs) await entry.completion;
    else {
      let timer;
      await Promise.race([
        entry.completion.finally(() => clearTimeout(timer)),
        new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); })
      ]);
      clearTimeout(timer);
    }
    return publicEntry(entry);
  }

  /** Stop one queued or running worker. */
  async stop(id) {
    const entry = this.requireEntry(id);
    entry.controller.abort();
    this.pending = this.pending.filter((candidate) => candidate !== entry);
    entry.status = "stopped";
    entry.resolveCompletion?.(publicEntry(entry));
    this.events.emit({ type: "worker-stopped", worker: publicEntry(entry) });
    this.notifyChange();
    this.persistChange();
    return publicEntry(entry);
  }

  hasActive() { return this.activeCount > 0 || this.pending.length > 0; }

  /** Wait until any worker changes state. */
  waitForChange(timeoutMs = 30000) {
    return new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); this.changeWaiters.delete(finish); resolve(); };
      const timer = setTimeout(finish, timeoutMs);
      this.changeWaiters.add(finish);
    });
  }

  /** Drain bounded worker notifications for the parent model. */
  drainNotifications() { return this.notifications.splice(0); }

  snapshot(options = {}) {
    return options.private === true
      ? Array.from(this.entries.values(), privateEntry)
      : this.list();
  }

  /** Restore public metadata snapshots as inspectable interrupted workers. */
  restore(snapshots) {
    for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
      const numeric = Number(String(snapshot.id || "").replace(/^worker-/, "")) || 0;
      this.sequence = Math.max(this.sequence, numeric);
      const status = ["queued", "running"].includes(snapshot.status) ? "interrupted" : snapshot.status;
      const entry = { ...snapshot, status, inbox: [], messages: [], controller: new AbortController(), result: String(snapshot.result || ""), error: String(snapshot.error || "") };
      entry.completion = Promise.resolve(publicEntry(entry));
      this.entries.set(entry.id, entry);
    }
    return this.snapshot();
  }

  /** Restore private worker state and resume unfinished workers from their next decision. */
  async restoreExecutable(snapshots) {
    for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
      const numeric = Number(String(snapshot.id || "").replace(/^worker-/, "")) || 0;
      this.sequence = Math.max(this.sequence, numeric);
      let agent = null;
      let authority = null;
      try {
        agent = snapshot.agentId ? await this.fabric?.activate(snapshot.agentId) : null;
        if (snapshot.agentId && agent?.kind !== "agent") throw new Error(`Unknown agent definition: ${snapshot.agentId}`);
        authority = this.resolveAuthority(agent, snapshot.isolation);
      } catch (error) {
        const failed = restoredEntry(snapshot, null, null, "failed");
        failed.error = `Worker recovery failed: ${error?.message || String(error)}`;
        this.entries.set(failed.id, failed);
        this.notifications.push(publicEntry(failed));
        this.events.emit({ type: "worker-failed", worker: publicEntry(failed), recovered: true });
        continue;
      }
      const currentAgentFingerprint = agent ? JSON.stringify({ id: agent.id, metadata: agent.metadata, body: agent.body }) : "";
      if (snapshot.agentFingerprint && snapshot.agentFingerprint !== currentAgentFingerprint) {
        this.events.emit({ type: "recovery-warning", reason: "worker-agent-changed", summary: `Worker ${snapshot.id} will continue with the current agent definition.` });
      }
      if (snapshot.agentAuthorityFingerprint && snapshot.agentAuthorityFingerprint !== authority.fingerprint) {
        this.events.emit({ type: "recovery-warning", reason: "worker-authority-changed", summary: `Worker ${snapshot.id} will continue within the current delegated-agent boundary.` });
      }
      const resumable = ["queued", "running", "interrupted"].includes(snapshot.status);
      const entry = restoredEntry(snapshot, agent, authority, resumable ? "queued" : snapshot.status);
      if (resumable) {
        repairInterruptedToolPairs(entry.messages);
        entry.messages.push({ role: "system", content: "This delegated run was interrupted. Reinspect current state before repeating any operation because an unfinished tool outcome may be unknown." });
        this.pending.push(entry);
        this.events.emit({ type: "worker-queued", worker: publicEntry(entry), recovered: true });
      }
      this.entries.set(entry.id, entry);
    }
    this.schedule();
    return this.snapshot();
  }

  /** Stop all workers owned by the run. */
  async close() { await Promise.all(this.list().filter((entry) => !isTerminal(entry.status)).map((entry) => this.stop(entry.id))); }

  /** Resolve the current parent roster into one immutable delegated-agent boundary. */
  resolveAuthority(agent, requestedIsolation) {
    const registrations = this.parentContext.capabilities.registrations?.() || [];
    const definitions = registrations.length
      ? registrations.map((record) => record.definition)
      : (this.parentContext.capabilities.definitions?.() || []);
    return AgentAuthorityResolver.resolve(agent, this.parentContext, { definitions, requestedIsolation });
  }

  schedule() {
    while (this.activeCount < MAX_ACTIVE_WORKERS && this.pending.length) {
      const entry = this.pending.shift();
      if (entry.status === "stopped") continue;
      this.activeCount += 1;
      entry.status = "running";
      entry.promise = this.run(entry).finally(() => { this.activeCount -= 1; this.schedule(); this.notifyChange(); });
      this.persistChange();
    }
  }

  async run(entry) {
    this.events.emit({ type: "worker-started", worker: publicEntry(entry) });
    let workerMcp = null;
    let ownsWorkerMcp = false;
    try {
      const restrictedRequest = {
        ...this.request,
        agentAuthority: entry.authority,
        securityContext: AgentAuthorityResolver.restrictSecurityContext(this.request.securityContext, entry.authority),
        signal: entry.controller.signal
      };
      entry.workspace = await resolveWorkerWorkspace(restrictedRequest, entry, []);
      if (entry.authority.requiresWorktree && entry.workspace.isolation !== "worktree") {
        throw new Error(`Agent '${entry.agentId || entry.id}' requires worktree isolation, but an isolated workspace could not be created: ${entry.workspace.fallbackReason || "unknown reason"}`);
      }
      const provider = entry.agent?.metadata?.model ? createProvider({ ...this.request.settings, model: entry.agent.metadata.model }) : this.provider;
      const parentRegistrations = this.parentContext.capabilities.registrations?.() || [];
      const parentDefinitions = parentRegistrations.length
        ? parentRegistrations.map((record) => record.definition)
        : (this.parentContext.capabilities.definitions?.() || []);
      const scopedDefinitions = AgentAuthorityResolver.filterDefinitions(parentDefinitions, entry.authority);
      const scopedNames = new Set(scopedDefinitions.map((definition) => definition.function?.name));
      const registrations = parentRegistrations.length
        ? parentRegistrations.filter((record) => scopedNames.has(record.name))
        : scopedDefinitions.map((definition) => ({ definition }));
      if (!entry.messages.length) entry.messages.push({ role: "system", content: `${entry.agent?.body || "Complete only the delegated work. Report evidence and do not claim actions you did not perform."}\n\nExecution boundary: mode=${entry.authority.mode}; workspace writes=${entry.authority.workspaceWrites}; commands=${entry.authority.commands}; network=${entry.authority.networkAccess}; isolation=${entry.authority.isolation}. These limits cannot be expanded from this delegated run.\n\nSecondary tool schemas are loaded on demand. Use capability_search with select:<tool_name> or task keywords before calling a deferred tool.\n\nYou may use context_observation_list and context_release to remove only your own older tool observations when they are no longer useful. Preserve recent results, active errors, denials, cancellations, unknown outcomes, and evidence still needed for this delegated task.` }, { role: "user", content: entry.prompt });
      const workerRequest = { ...restrictedRequest, workspaceRoot: entry.workspace.root };
      const workerEvents = { emit: (event) => this.events.emit({ ...event, workerId: entry.id }) };
      workerMcp = typeof this.parentContext.mcp?.fork === "function"
        ? this.parentContext.mcp.fork(workerRequest, workerEvents.emit)
        : this.parentContext.mcp;
      ownsWorkerMcp = workerMcp !== this.parentContext.mcp;
      const capabilities = new CapabilityCatalog({
        policy: this.parentContext.policy,
        fabric: this.fabric,
        mcp: workerMcp,
        registrations,
        knownToolNames: parentRegistrations.length ? parentRegistrations.map((record) => record.name) : parentDefinitions.map((definition) => definition.function?.name).filter(Boolean),
        registrationFilter: (record) => AgentAuthorityResolver.filterDefinitions([record.definition], entry.authority).length === 1,
        emit: workerEvents.emit
      });
      await capabilities.restore(entry.toolSchemaState);
      const observationLedger = new ObservationLedger(this.parentContext.artifactVault, workerEvents.emit);
      observationLedger.restore(entry.observationRelease?.ledger);
      observationLedger.refresh(entry.messages);
      const contextReleaseReminder = new ContextReleaseReminder(workerEvents.emit);
      contextReleaseReminder.restore(entry.observationRelease?.reminder);
      const windowSteward = new WindowSteward(workerRequest, provider, this.parentContext.artifactVault, workerEvents.emit, observationLedger);
      const context = {
        ...this.parentContext,
        request: workerRequest,
        taskGrants: [],
        capabilities,
        mcp: workerMcp,
        workers: blockedWorkers(),
        loadedExtensions: new Set(),
        loadedExtensionBodies: new Map(),
        hooks: createWorkerHooks(entry),
        continuity: null,
        windowSteward,
        observationLedger,
        contextReleaseReminder,
        messages: entry.messages,
        pendingTools: [],
        saveSnapshot: async () => {
          entry.observationRelease = { ledger: observationLedger.snapshot(), reminder: contextReleaseReminder.snapshot() };
          entry.toolSchemaState = capabilities.snapshot();
          this.persistChange();
        },
        buildRenewalAnchors: async (digest, activeFiles) => [
          { role: "system", content: entry.agent?.body || "Complete only the delegated work and report observed evidence." },
          { role: "system", content: `Earlier delegated execution digest:\n${JSON.stringify(digest)}` },
          ...(activeFiles.length ? [{ role: "system", content: `Recently accessed file anchors:\n${JSON.stringify(activeFiles)}` }] : [])
        ]
      };
      const result = await runAutonomousLoop({ provider, messages: entry.messages, tools: capabilities.providerDefinitions(), getTools: () => capabilities.providerDefinitions(), request: context.request, events: workerEvents, context });
      entry.result = String(result || "").slice(0, MAX_RESULT_CHARS);
      entry.status = "completed";
      entry.workspace = await finishWorkerWorkspace(this.request, entry.workspace);
      if (ownsWorkerMcp) await workerMcp.closeAll();
      this.complete(entry, "worker-completed");
    } catch (error) {
      if (ownsWorkerMcp) await workerMcp.closeAll().catch(() => {});
      entry.error = error?.message || String(error);
      entry.status = entry.controller.signal.aborted ? "stopped" : "failed";
      this.complete(entry, entry.status === "stopped" ? "worker-stopped" : "worker-failed");
    }
    return publicEntry(entry);
  }

  complete(entry, type) {
    const snapshot = publicEntry(entry);
    entry.resolveCompletion?.(snapshot);
    this.notifications.push(snapshot);
    this.events.emit({ type, worker: snapshot });
    this.persistChange();
  }

  notifyChange() { for (const finish of Array.from(this.changeWaiters)) finish(); }

  persistChange() { Promise.resolve(this.onChange()).catch(() => {}); }

  requireEntry(id) {
    const entry = this.entries.get(String(id || ""));
    if (!entry) throw new Error(`Unknown worker: ${id}`);
    return entry;
  }
}

function createWorkerHooks(entry) {
  return { async run(event) {
    if (event !== "before-model" || !entry.inbox.length) return { additionalContext: [] };
    const messages = entry.inbox.splice(0).map((item) => `${item.summary ? `${item.summary}: ` : ""}${item.message}`);
    return { additionalContext: messages };
  } };
}

function blockedWorkers() { return { launch() { throw new Error("Delegated workers cannot launch other workers."); }, list() { return []; }, hasActive() { return false; }, drainNotifications() { return []; } }; }
function isTerminal(status) { return ["completed", "failed", "stopped", "interrupted"].includes(status); }
function publicEntry(entry) { return { id: entry.id, description: entry.description, agentId: entry.agentId, status: entry.status, background: entry.background, isolation: entry.workspace?.isolation || entry.isolation, workspace: entry.workspace ? { root: entry.workspace.root, branch: entry.workspace.branch, retained: entry.workspace.retained, fallbackReason: entry.workspace.fallbackReason } : undefined, result: entry.result, error: entry.error }; }

function privateEntry(entry) {
  return {
    ...publicEntry(entry),
    prompt: entry.prompt,
    inbox: JSON.parse(JSON.stringify(entry.inbox || [])),
    messages: JSON.parse(JSON.stringify(entry.messages || [])),
    observationRelease: JSON.parse(JSON.stringify(entry.observationRelease || {})),
    toolSchemaState: JSON.parse(JSON.stringify(entry.toolSchemaState || {})),
    agentFingerprint: entry.agent ? JSON.stringify({ id: entry.agent.id, metadata: entry.agent.metadata, body: entry.agent.body }) : "",
    agentAuthorityFingerprint: entry.authority?.fingerprint || ""
  };
}

function restoredEntry(snapshot, agent, authority, status) {
  const entry = {
    id: String(snapshot.id),
    description: String(snapshot.description || "Delegated work"),
    prompt: String(snapshot.prompt || ""),
    agentId: String(snapshot.agentId || ""),
    status,
    background: snapshot.background === true,
    inbox: Array.isArray(snapshot.inbox) ? JSON.parse(JSON.stringify(snapshot.inbox)) : [],
    messages: Array.isArray(snapshot.messages) ? JSON.parse(JSON.stringify(snapshot.messages)) : [],
    observationRelease: snapshot.observationRelease ? JSON.parse(JSON.stringify(snapshot.observationRelease)) : {},
    toolSchemaState: snapshot.toolSchemaState ? JSON.parse(JSON.stringify(snapshot.toolSchemaState)) : {},
    result: String(snapshot.result || ""),
    error: String(snapshot.error || ""),
    controller: new AbortController(),
    agent,
    authority,
    isolation: authority?.isolation || snapshot.isolation || "shared",
    workspace: snapshot.workspace ? { ...snapshot.workspace } : undefined
  };
  entry.completion = isTerminal(status)
    ? Promise.resolve(publicEntry(entry))
    : new Promise((resolve) => { entry.resolveCompletion = resolve; });
  return entry;
}

function repairInterruptedToolPairs(messages) {
  const results = new Set(messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id));
  const calls = messages.flatMap((message) => message.tool_calls || []);
  for (const call of calls) {
    if (!results.has(call.id)) messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "The prior process ended before this tool outcome was recorded. Outcome is unknown; inspect current state before acting." }) });
  }
}

async function resolveWorkerWorkspace(request, entry, taskGrants) {
  if (entry.isolation === "shared") return { root: request.workspaceRoot, isolation: "shared" };
  if (entry.workspace?.root && isExpectedWorkerRoot(request, entry)) {
    try { await require("node:fs/promises").access(entry.workspace.root); return { ...entry.workspace, isolation: "worktree" }; }
    catch (_error) { /* Recreate or safely fall back through the standard path. */ }
  }
  return prepareWorkerWorkspace(request, entry.id, entry.isolation, taskGrants);
}

function isExpectedWorkerRoot(request, entry) {
  const base = path.resolve(request.profileRoot || request.workspaceRoot);
  const expected = path.join(base, ".md-editor", "companion", "worker-workspaces", getRunIdentity(request), entry.id);
  return path.resolve(String(entry.workspace?.root || "")) === expected;
}

module.exports = { MAX_ACTIVE_WORKERS, WorkerHub, isTerminal };
