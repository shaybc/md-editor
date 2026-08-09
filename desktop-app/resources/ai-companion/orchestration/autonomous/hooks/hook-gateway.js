/** Dispatches lifecycle automation through guarded action executors. */

"use strict";

const crypto = require("node:crypto");
const { AutomationRepetitionGuard } = require("./automation-repetition-guard");
const { BackgroundActionRegistry } = require("./background-action-registry");
const { combineHookDecisions } = require("./hook-decision-aggregator");
const { normalizeHookDefinition } = require("./hook-definition-policy");
const { LifecycleActionRegistry } = require("./lifecycle-action-registry");
const { lifecycleEventPolicy, normalizeLifecycleEvent, EVENT_POLICIES } = require("./lifecycle-event-catalog");
const { matchesLifecycleHook } = require("./hook-matcher");

const PRE_EVENTS = new Set(Object.entries(EVENT_POLICIES).filter(([, policy]) => policy.phase === "before").map(([event]) => event));
const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_POLICIES));
const DEFERRED_CONTEXT_EVENTS = new Set(["file-changed", "workspace-changed", "configuration-changed", "schedule-fired", "schedule-completed", "schedule-failed", "worker-workspace-changed", "worker-completed", "worker-failed"]);

class HookGateway {
  constructor(request, entries = [], emit = () => {}, options = {}) {
    this.request = request;
    this.emit = emit;
    this.runningDepth = 0;
    this.hooks = entries.map((entry) => isNormalizedHook(entry) ? entry : normalizeHookDefinition(entry, { scope: entry.scope || "extension", id: entry.id, trusted: entry.trusted !== false }));
    this.guard = new AutomationRepetitionGuard(options.guardState);
    this.background = new BackgroundActionRegistry(emit);
    this.actions = new LifecycleActionRegistry(request, emit);
    this.deliveredNotifications = [];
    this.deferredContext = [];
    this.failureState = new Map();
    this.catalogFingerprint = fingerprint(this.hooks);
  }

  /** Attach the composed autonomous run context and callback services. */
  setContext(context) { this.context = context; this.actions.setContext(context); }
  registerCallback(id, callback) { this.actions.registerCallback(id, callback); }
  register(entries, source = {}) {
    let declarationOrder = this.hooks.reduce((maximum, hook) => Math.max(maximum, Number(hook.declarationOrder) || 0), -1) + 1;
    this.hooks.push(...Array.from(entries || [], (entry) => {
      const hook = isNormalizedHook(entry) ? entry : normalizeHookDefinition(entry, source);
      return { ...hook, declarationOrder: Number.isFinite(Number(hook.declarationOrder)) ? Number(hook.declarationOrder) : declarationOrder++ };
    }));
    this.hooks.sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0) || Number(left.declarationOrder || 0) - Number(right.declarationOrder || 0));
    this.catalogFingerprint = fingerprint(this.hooks);
  }
  replacePrefix(prefix, entries, source = {}) { this.hooks = this.hooks.filter((hook) => !hook.id.startsWith(prefix)); this.register(entries, source); }

  /** Run matching hooks in stable order and return their normalized decision. */
  async run(rawEvent, payload = {}) {
    const event = normalizeLifecycleEvent(rawEvent);
    if (!lifecycleEventPolicy(event)) return emptyDecision();
    const matched = this.hooks.filter((hook) => hook.enabled && hook.event === event && matchesLifecycleHook(hook.matcher, payload));
    const results = [];
    for (const hook of matched) {
      const failure = this.failureState.get(hook.id);
      if (failure?.openUntil > Date.now()) {
        this.emit({ type: "hook-skipped", hookId: hook.id, event, reason: "failure circuit is cooling down", retryAt: new Date(failure.openUntil).toISOString() });
        continue;
      }
      const guard = this.guard.allow(hook, event, payload, this.runningDepth);
      if (!guard.allowed) { this.emit({ type: "hook-skipped", hookId: hook.id, event, reason: guard.reason }); continue; }
      this.guard.record(hook, guard.key);
      if (hook.background) { this.startBackground(hook, event, payload); continue; }
      results.push(await this.executeHook(hook, event, payload));
    }
    const decision = combineHookDecisions(results);
    if (DEFERRED_CONTEXT_EVENTS.has(event) && decision.additionalContext?.length) {
      this.deferredContext.push(...decision.additionalContext);
      this.deferredContext = this.deferredContext.slice(-20);
    }
    if (decision.watchPaths?.length) {
      const existing = this.context?.lifecycleObserver?.snapshot?.().watchPaths || [];
      this.context?.lifecycleObserver?.update?.([...existing, ...decision.watchPaths]);
    }
    return decision;
  }

  startBackground(hook, event, payload) {
    const entry = this.background.start({ hookId: hook.id, event, actionTypes: hook.actions.map((action) => action.type) }, () => this.executeHook(hook, event, payload));
    entry.promise.catch((error) => {
      this.emit({ type: "hook-failed", hookId: hook.id, event, error: error?.message || String(error), background: true });
      if (hook.wakeOnFailure) this.context?.messages?.push?.({ role: "system", content: `A background lifecycle action failed: ${error?.message || String(error)}` });
    });
  }

  async executeHook(hook, event, payload) {
    this.emit({ type: "hook-started", hookId: hook.id, event, source: hook.source.scope });
    const startedAt = Date.now();
    this.runningDepth += 1;
    try {
      const actionResults = [];
      let actionPayload = { ...payload };
      for (const [index, action] of hook.actions.entries()) {
        this.emit({ type: "hook-progress", hookId: hook.id, event, action: action.type, actionIndex: index });
        const result = await withTimeout(
          (signal) => this.actions.execute({ ...action, actionIndex: index }, event, { ...actionPayload, previousResults: actionResults }, hook, { signal }),
          hook.timeoutMs,
          this.request.signal
        );
        actionResults.push(result);
        if (result?.updatedInput && typeof result.updatedInput === "object") actionPayload = { ...actionPayload, input: { ...(actionPayload.input || {}), ...result.updatedInput } };
        if (result?.updatedPrompt != null) actionPayload = { ...actionPayload, prompt: String(result.updatedPrompt) };
        if (result?.updatedOutput !== undefined) actionPayload = { ...actionPayload, output: result.updatedOutput };
      }
      const decision = combineHookDecisions(actionResults);
      if (decision.permissionDecision) decision.permissionTrusted = hook.source.trusted === true;
      if (decision.watchPaths?.length && hook.source.trusted !== true) {
        delete decision.watchPaths;
        decision.notifications = [...(decision.notifications || []), { level: "warning", message: "An untrusted lifecycle source cannot add watched paths." }];
      }
      for (const notification of decision.notifications || []) {
        this.deliveredNotifications.push({ hookId: hook.id, event, ...notification, deliveredAt: new Date().toISOString() });
        this.emit({ type: "hook-notification", hookId: hook.id, event, ...notification });
      }
      this.deliveredNotifications = this.deliveredNotifications.slice(-100);
      this.failureState.delete(hook.id);
      this.emit({ type: decision.continue === false ? "hook-blocked" : "hook-completed", hookId: hook.id, event, source: hook.source.scope, durationMs: Date.now() - startedAt, decision: publicDecision(decision) });
      return decision;
    } catch (error) {
      const previous = this.failureState.get(hook.id) || { count: 0, openUntil: 0 };
      const count = previous.count + 1;
      const openUntil = count >= 3 ? Date.now() + 300000 : 0;
      this.failureState.set(hook.id, { count, openUntil });
      const blocks = hook.onError === "block" || hook.onError === "stop-run";
      this.emit({ type: "hook-failed", hookId: hook.id, event, error: error?.message || String(error), failClosed: blocks, circuitOpened: Boolean(openUntil) });
      if (hook.onError === "stop-run") {
        error.name = "AbortError";
        error.code = "LIFECYCLE_RUN_STOPPED";
        error.doNotRetry = true;
        throw error;
      }
      if (blocks) throw error;
      return { notifications: [{ level: "warning", message: `Lifecycle hook '${hook.localId}' failed: ${error?.message || String(error)}` }] };
    } finally { this.runningDepth -= 1; }
  }

  drainContext() { return this.deferredContext.splice(0); }
  snapshot() { return { version: 2, catalogFingerprint: this.catalogFingerprint, guard: this.guard.snapshot(), failures: Array.from(this.failureState.entries()), activeSequenceDepth: this.runningDepth, background: this.background.snapshot(), deliveredNotifications: this.deliveredNotifications.slice(), deferredContext: this.deferredContext.slice() }; }
  restore(snapshot = {}) {
    this.guard.restore(snapshot.guard || {});
    this.failureState = new Map(Array.isArray(snapshot.failures) ? snapshot.failures : []);
    this.background.restore(snapshot.background || {});
    this.deliveredNotifications = Array.isArray(snapshot.deliveredNotifications) ? snapshot.deliveredNotifications.slice(-100) : [];
    this.deferredContext = Array.isArray(snapshot.deferredContext) ? snapshot.deferredContext.slice(-20) : [];
    if (snapshot.catalogFingerprint && snapshot.catalogFingerprint !== this.catalogFingerprint) this.emit({ type: "recovery-warning", reason: "lifecycle-catalog-changed", summary: "Lifecycle automation definitions changed since the saved run and were revalidated." });
    if (snapshot.activeSequenceDepth) this.emit({ type: "recovery-warning", reason: "lifecycle-sequence-interrupted", summary: "An active lifecycle sequence was interrupted and was not replayed." });
  }
  async close() { await this.background.drain(); }
}

function emptyDecision() { return { additionalContext: [] }; }
function isNormalizedHook(value) { return Boolean(value?.localId && value?.source && Array.isArray(value.actions)); }
function publicDecision(value) { return { continue: value.continue !== false, permissionDecision: value.permissionDecision, contextCount: value.additionalContext?.length || 0, notificationCount: value.notifications?.length || 0, inputUpdated: Boolean(value.updatedInput), promptUpdated: value.updatedPrompt != null }; }
function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || [])).digest("hex"); }
function withTimeout(operation, timeoutMs, signal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("Lifecycle action cancelled."), { name: "AbortError" }));
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason || Object.assign(new Error("Lifecycle action cancelled."), { name: "AbortError" }));
  signal?.addEventListener?.("abort", cancel, { once: true });
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Lifecycle action timed out after ${timeoutMs} ms.`);
      error.code = "LIFECYCLE_ACTION_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
    .finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", cancel);
    });
}

module.exports = { HookGateway, PRE_EVENTS, SUPPORTED_EVENTS, matchesHook: matchesLifecycleHook, normalizeHook: normalizeHookDefinition };
