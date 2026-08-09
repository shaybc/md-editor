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
const { buildRuleActivationMessage, buildSkillActivationMessage } = require("../context-builder");
const { RuleCatalog } = require("../rules/rule-catalog");
const { ToolPathObserver } = require("../rules/tool-path-observer");
const { SkillCatalog } = require("../skills/skill-catalog");
const { SkillInvocationSession } = require("../skills/skill-invocation-session");
const { SkillPathObserver } = require("../skills/skill-path-observer");
const { InternetResearchService } = require("../internet/internet-research-service");
const { NotebookDocumentService } = require("../notebooks/notebook-document-service");
const { WorkspaceAtlas } = require("../structure/workspace-atlas");
const { companionProfilePath } = require("../profile-storage");

const MAX_ACTIVE_WORKERS = 10;
const MAX_RESULT_CHARS = 16000;

class WorkerHub {
  constructor(provider, request, options) {
    this.provider = provider;
    this.request = request;
    this.fabric = options.fabric;
    this.agentCatalog = options.agentCatalog;
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
    const agent = args.agentId ? await this.agentCatalog?.activate(args.agentId) : null;
    if (args.agentId && agent?.kind !== "agent") throw new Error(`Unknown agent definition: ${args.agentId}`);
    const authority = this.resolveAuthority(agent, args.isolation);
    const entry = { id, description: String(args.description || "Delegated work"), prompt: String(args.prompt || ""), model: String(args.model || ""), routeId: String(args.routeId || agent?.metadata?.route || ""), routePurpose: String(args.routePurpose || agent?.metadata?.routePurpose || "worker"), agentId: agent?.id || "", allowedTools: Array.isArray(args.allowedTools) ? args.allowedTools.map(String) : [], status: "queued", background: args.background === true, inbox: [], messages: [], result: "", error: "", controller: new AbortController(), agent, authority, isolation: authority.isolation };
    entry.completion = new Promise((resolve) => { entry.resolveCompletion = resolve; });
    if (!entry.prompt.trim()) throw new Error("Worker launch requires a prompt.");
    this.entries.set(id, entry);
    this.pending.push(entry);
    this.events.emit({ type: "worker-queued", worker: publicEntry(entry) });
    await this.parentContext.hooks?.run("worker-queued", { worker: publicEntry(entry) });
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
    await this.parentContext.hooks?.run("worker-stopped", { worker: publicEntry(entry) });
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
        const savedAgentId = snapshot.agentLogicalId || snapshot.agentId;
        agent = savedAgentId ? await this.agentCatalog?.activate(savedAgentId) : null;
        if (savedAgentId && agent?.kind !== "agent") throw new Error(`Unknown agent definition: ${savedAgentId}`);
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
      if (snapshot.agentSourceIdentity && snapshot.agentSourceIdentity !== agent?.sourceIdentity) {
        this.events.emit({ type: "recovery-warning", reason: "worker-agent-source-changed", summary: `Worker ${snapshot.id} will continue with the current highest-priority agent definition.` });
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
    await this.parentContext.hooks?.run("worker-started", { worker: publicEntry(entry) });
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
      if (entry.workspace.root !== this.request.workspaceRoot) {
        await this.parentContext.hooks?.run("worker-workspace-changed", {
          worker: publicEntry(entry),
          previousRoot: this.request.workspaceRoot,
          workspaceRoot: entry.workspace.root,
          reason: "worker-isolation-created"
        });
      }
      if (entry.authority.requiresWorktree && entry.workspace.isolation !== "worktree") {
        throw new Error(`Agent '${entry.agentId || entry.id}' requires worktree isolation, but an isolated workspace could not be created: ${entry.workspace.fallbackReason || "unknown reason"}`);
      }
      const selectedModel = entry.model || entry.agent?.metadata?.model;
      const routePurpose = entry.routePurpose || "worker";
      const purposeAccess = this.parentContext.routeSession && (entry.routeId || (!selectedModel && routePurpose !== "worker"))
        ? this.parentContext.routeSession.accessForPurpose(routePurpose, { routeId: entry.routeId, requiredDataScopes: ["workspace"], reason: `worker ${entry.id}` })
        : null;
      const provider = purposeAccess?.provider || (selectedModel ? createProvider({ ...this.request.settings, model: selectedModel }) : this.provider);
      const parentRegistrations = this.parentContext.capabilities.registrations?.() || [];
      const parentDefinitions = parentRegistrations.length
        ? parentRegistrations.map((record) => record.definition)
        : (this.parentContext.capabilities.definitions?.() || []);
      const authorityDefinitions = AgentAuthorityResolver.filterDefinitions(parentDefinitions, entry.authority);
      const allowedToolNames = new Set(entry.allowedTools || []);
      const scopedDefinitions = allowedToolNames.size
        ? authorityDefinitions.filter((definition) => allowedToolNames.has(definition.function?.name))
        : authorityDefinitions;
      const scopedNames = new Set(scopedDefinitions.map((definition) => definition.function?.name));
      const registrations = parentRegistrations.length
        ? parentRegistrations.filter((record) => scopedNames.has(record.name))
        : scopedDefinitions.map((definition) => ({ definition }));
      const workerLimits = purposeAccess?.limits || (!selectedModel ? this.parentContext.routeSession?.limitsFor("", "worker") : null);
      const workerRequest = { ...restrictedRequest, workspaceRoot: entry.workspace.root, ...(workerLimits ? { modelLimits: workerLimits } : {}) };
      const workerEvents = { emit: (event) => this.events.emit({ ...event, workerId: entry.id }) };
      const ruleCatalog = new RuleCatalog(workerRequest, workerEvents.emit);
      await ruleCatalog.load();
      await ruleCatalog.restore(entry.ruleState);
      const activeRuleMessage = buildRuleActivationMessage(ruleCatalog.activeInstructions({ markInjected: true }));
      if (!entry.messages.length) {
        entry.messages.push({
          role: "system",
          content: `${entry.agent?.body || "Complete only the delegated work. Report evidence and do not claim actions you did not perform."}\n\nExecution boundary: mode=${entry.authority.mode}; workspace writes=${entry.authority.workspaceWrites}; commands=${entry.authority.commands}; network=${entry.authority.networkAccess}; isolation=${entry.authority.isolation}. These limits cannot be expanded from this delegated run.\n\nSecondary tool schemas are loaded on demand. Use capability_search with select:<tool_name> or task keywords before calling a deferred tool.\n\nYou may use context_observation_list and context_release to remove only your own older tool observations when they are no longer useful. Preserve recent results, active errors, denials, cancellations, unknown outcomes, and evidence still needed for this delegated task.${activeRuleMessage ? `\n\n${activeRuleMessage}` : ""}`
        }, { role: "user", content: entry.prompt });
      } else if (activeRuleMessage) {
        entry.messages.push({ role: "system", content: activeRuleMessage });
      }
      workerMcp = typeof this.parentContext.mcp?.fork === "function"
        ? this.parentContext.mcp.fork(workerRequest, workerEvents.emit)
        : this.parentContext.mcp;
      ownsWorkerMcp = workerMcp !== this.parentContext.mcp;
      const capabilities = new CapabilityCatalog({
        policy: this.parentContext.policy,
        fabric: this.fabric,
        mcp: workerMcp,
        metadataEntries: this.agentCatalog?.list?.() || [],
        registrations,
        knownToolNames: parentRegistrations.length ? parentRegistrations.map((record) => record.name) : parentDefinitions.map((definition) => definition.function?.name).filter(Boolean),
        registrationFilter: (record) => AgentAuthorityResolver.filterDefinitions([record.definition], entry.authority).length === 1,
        emit: workerEvents.emit
      });
      await capabilities.restore(entry.toolSchemaState);
      const skillCatalog = new SkillCatalog(workerRequest, { fabric: this.fabric, capabilities, agentCatalog: this.agentCatalog, emit: workerEvents.emit });
      await skillCatalog.load();
      await skillCatalog.restore(entry.skillState?.catalog);
      const skillInvocation = new SkillInvocationSession(skillCatalog, workerEvents.emit);
      await skillInvocation.restore(entry.skillState?.invocation);
      const skillAdvertisement = skillCatalog.advertisement();
      if (skillAdvertisement) entry.messages.push({ role: "system", content: skillAdvertisement });
      const restoredSkillInstructions = buildSkillActivationMessage(skillCatalog.consumeActivated());
      if (restoredSkillInstructions) entry.messages.push({ role: "system", content: restoredSkillInstructions });
      const observationLedger = new ObservationLedger(this.parentContext.artifactVault, workerEvents.emit);
      observationLedger.restore(entry.observationRelease?.ledger);
      observationLedger.refresh(entry.messages);
      const contextReleaseReminder = new ContextReleaseReminder(workerEvents.emit);
      contextReleaseReminder.restore(entry.observationRelease?.reminder);
      const renewalAccess = this.parentContext.routeSession?.accessForPurpose("renewal", { requiredDataScopes: ["workspace"], reason: `worker ${entry.id} context renewal` }) || null;
      const windowSteward = new WindowSteward(workerRequest, renewalAccess?.provider || provider, this.parentContext.artifactVault, workerEvents.emit, observationLedger, { providerLimits: renewalAccess?.limits || null });
      const internetResearch = new InternetResearchService(workerRequest, {
        emit: workerEvents.emit,
        artifacts: this.parentContext.artifactVault,
        taskGrants: [],
        authorizationControls: workerRequest.authorizationControls,
        provider
      });
      const notebooks = new NotebookDocumentService(workerRequest, workerEvents.emit, { artifacts: this.parentContext.artifactVault });
      const workspaceAtlas = new WorkspaceAtlas(workerRequest, { emit: workerEvents.emit, artifacts: this.parentContext.artifactVault });
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
        ruleCatalog,
        rulePathObserver: new ToolPathObserver(ruleCatalog),
        skillCatalog,
        skillInvocation,
        skillPathObserver: new SkillPathObserver(skillCatalog),
        scheduler: blockedScheduler(),
        interactionGate: workerInteractionGate(entry, workerEvents),
        internetResearch,
        notebooks,
        workspaceAtlas,
        continuity: null,
        windowSteward,
        observationLedger,
        contextReleaseReminder,
        messages: entry.messages,
        pendingTools: [],
        saveSnapshot: async () => {
          entry.observationRelease = { ledger: observationLedger.snapshot(), reminder: contextReleaseReminder.snapshot() };
          entry.toolSchemaState = capabilities.snapshot();
          entry.ruleState = ruleCatalog.snapshot();
          entry.skillState = { catalog: skillCatalog.snapshot(), invocation: skillInvocation.snapshot() };
          this.persistChange();
        },
        buildRenewalAnchors: async (digest, activeFiles) => {
          await ruleCatalog.refresh();
          await skillCatalog.refresh();
          skillInvocation.reconcile();
          const currentRules = buildRuleActivationMessage(ruleCatalog.activeInstructions({ markInjected: true }));
          const currentSkills = buildSkillActivationMessage(skillCatalog.activeInstructions());
          return [
            { role: "system", content: entry.agent?.body || "Complete only the delegated work and report observed evidence." },
            { role: "system", content: skillCatalog.advertisement() },
            ...(currentRules ? [{ role: "system", content: currentRules }] : []),
            ...(currentSkills ? [{ role: "system", content: currentSkills }] : []),
            { role: "system", content: `Earlier delegated execution digest:\n${JSON.stringify(digest)}` },
            ...(activeFiles.length ? [{ role: "system", content: `Recently accessed file anchors:\n${JSON.stringify(activeFiles)}` }] : [])
          ];
        }
      };
      const result = await runAutonomousLoop({ provider, messages: entry.messages, tools: capabilities.providerDefinitions(), getTools: () => capabilities.providerDefinitions(), request: context.request, events: workerEvents, context });
      entry.result = String(result || "").slice(0, MAX_RESULT_CHARS);
      entry.status = "completed";
      const previousWorkspace = entry.workspace;
      entry.workspace = await finishWorkerWorkspace(this.request, entry.workspace);
      if (previousWorkspace?.root !== entry.workspace?.root) {
        await this.parentContext.hooks?.run("worker-workspace-changed", {
          worker: publicEntry(entry),
          previousRoot: previousWorkspace.root,
          workspaceRoot: entry.workspace?.root || this.request.workspaceRoot,
          reason: entry.workspace?.retained ? "worker-isolation-retained" : "worker-isolation-closed"
        });
      }
      if (ownsWorkerMcp) await workerMcp.closeAll();
      await this.complete(entry, "worker-completed");
    } catch (error) {
      if (ownsWorkerMcp) await workerMcp.closeAll().catch(() => {});
      entry.error = error?.message || String(error);
      entry.status = entry.controller.signal.aborted ? "stopped" : "failed";
      await this.complete(entry, entry.status === "stopped" ? "worker-stopped" : "worker-failed");
    }
    return publicEntry(entry);
  }

  async complete(entry, type) {
    const snapshot = publicEntry(entry);
    entry.resolveCompletion?.(snapshot);
    this.notifications.push(snapshot);
    this.events.emit({ type, worker: snapshot });
    await this.parentContext.hooks?.run(type, { worker: snapshot });
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
function blockedScheduler() { return { create() { throw new Error("Delegated workers cannot create schedules."); }, list() { return []; }, cancel() { throw new Error("Delegated workers cannot cancel schedules."); } }; }
function workerInteractionGate(entry, events) {
  return {
    async requestChoice(input = {}) {
      events.emit({ type: "worker-input-needed", workerId: entry.id, questions: input.questions || [], summary: "The delegated worker needs a user decision. The foreground agent may ask the user if it remains necessary." });
      return { deferredToForeground: true, workerId: entry.id, questions: input.questions || [] };
    },
    snapshot() { return { version: 1, pending: null }; }
  };
}
function isTerminal(status) { return ["completed", "failed", "stopped", "interrupted"].includes(status); }
function publicEntry(entry) { return { id: entry.id, description: entry.description, agentId: entry.agentId, routeId: entry.routeId || "", routePurpose: entry.routePurpose || "worker", status: entry.status, background: entry.background, isolation: entry.workspace?.isolation || entry.isolation, workspace: entry.workspace ? { root: entry.workspace.root, branch: entry.workspace.branch, retained: entry.workspace.retained, fallbackReason: entry.workspace.fallbackReason } : undefined, result: entry.result, error: entry.error }; }

function privateEntry(entry) {
  return {
    ...publicEntry(entry),
    prompt: entry.prompt,
    model: entry.model || "",
    allowedTools: Array.isArray(entry.allowedTools) ? entry.allowedTools.slice() : [],
    inbox: JSON.parse(JSON.stringify(entry.inbox || [])),
    messages: JSON.parse(JSON.stringify(entry.messages || [])),
    observationRelease: JSON.parse(JSON.stringify(entry.observationRelease || {})),
    toolSchemaState: JSON.parse(JSON.stringify(entry.toolSchemaState || {})),
    ruleState: JSON.parse(JSON.stringify(entry.ruleState || {})),
    skillState: JSON.parse(JSON.stringify(entry.skillState || {})),
    agentFingerprint: entry.agent ? JSON.stringify({ id: entry.agent.id, metadata: entry.agent.metadata, body: entry.agent.body }) : "",
    agentAuthorityFingerprint: entry.authority?.fingerprint || "",
    agentLogicalId: entry.agent?.id || entry.agentId || "",
    agentSourceIdentity: entry.agent?.sourceIdentity || ""
  };
}

function restoredEntry(snapshot, agent, authority, status) {
  const entry = {
    id: String(snapshot.id),
    description: String(snapshot.description || "Delegated work"),
    prompt: String(snapshot.prompt || ""),
    model: String(snapshot.model || ""),
    allowedTools: Array.isArray(snapshot.allowedTools) ? snapshot.allowedTools.map(String) : [],
    routeId: String(snapshot.routeId || ""),
    routePurpose: String(snapshot.routePurpose || agent?.metadata?.routePurpose || "worker"),
    agentId: String(agent?.id || snapshot.agentLogicalId || snapshot.agentId || ""),
    status,
    background: snapshot.background === true,
    inbox: Array.isArray(snapshot.inbox) ? JSON.parse(JSON.stringify(snapshot.inbox)) : [],
    messages: Array.isArray(snapshot.messages) ? JSON.parse(JSON.stringify(snapshot.messages)) : [],
    observationRelease: snapshot.observationRelease ? JSON.parse(JSON.stringify(snapshot.observationRelease)) : {},
    toolSchemaState: snapshot.toolSchemaState ? JSON.parse(JSON.stringify(snapshot.toolSchemaState)) : {},
    ruleState: snapshot.ruleState ? JSON.parse(JSON.stringify(snapshot.ruleState)) : {},
    skillState: snapshot.skillState ? JSON.parse(JSON.stringify(snapshot.skillState)) : {},
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
  const expected = request.profileRoot
    ? companionProfilePath(request.profileRoot, "worker-workspaces", getRunIdentity(request), entry.id)
    : path.join(path.resolve(request.workspaceRoot), ".md-editor", "companion", "worker-workspaces", getRunIdentity(request), entry.id);
  return path.resolve(String(entry.workspace?.root || "")) === expected;
}

module.exports = { MAX_ACTIVE_WORKERS, WorkerHub, isTerminal };
