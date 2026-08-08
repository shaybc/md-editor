/** Run-scoped coordination for durable autonomous plan persistence. */

"use strict";

const planTools = require("../../tools/plan-repository-tools");
const { EVENT_TYPES } = require("../shared/events");

const PLAN_TOOL_NAMES = new Set(["plan_list", "plan_read", "plan_create", "plan_update"]);

class PlanRepositorySession {
  /** Track one run's create/update intent and authoritative saved plan. */
  constructor(request, policy, emit = () => {}) {
    this.request = request;
    this.policy = policy;
    this.emit = emit;
    this.operation = normalizeOperation(request.planOperation, request.planTarget);
    this.target = normalizeTarget(request.planTarget);
    this.plan = null;
    this.body = "";
    this.queue = Promise.resolve();
  }

  /** Restore persistence state from a validated autonomous recovery snapshot. */
  restore(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    this.operation = normalizeOperation(snapshot.operation || this.operation, snapshot.target || this.target);
    this.target = normalizeTarget(snapshot.target || this.target);
    this.plan = snapshot.plan && typeof snapshot.plan === "object" ? { ...snapshot.plan } : null;
    this.body = String(snapshot.body || "");
  }

  /** Return the durable subset stored with autonomous recovery state. */
  snapshot() {
    return { operation: this.operation, target: { ...this.target }, plan: this.plan ? { ...this.plan } : null, body: this.body };
  }

  /** Validate the explicit Plan-mode repository transaction without directing model behavior. */
  assertRequiredPlanSaved() {
    if (this.policy.requirePlanPersistence !== true) return;
    requireSavedPlanMetadata(this.plan);
  }

  /** Execute one plan repository tool under the mode's dedicated plan policy. */
  execute(name, args = {}) {
    if (!PLAN_TOOL_NAMES.has(name)) throw new Error(`Unknown plan repository tool: ${name}`);
    if (["plan_list", "plan_read"].includes(name) && this.policy.allowPlanReads !== true) throw new Error("Plan repository reads are unavailable in this mode.");
    if (["plan_create", "plan_update"].includes(name) && this.policy.allowPlanWrites !== true) throw new Error("Plan repository writes are unavailable in this mode.");
    return this.serialize(() => this.executeSerialized(name, args));
  }

  async executeSerialized(name, args) {
    const options = { signal: this.request.signal, profileRoot: this.request.profileRoot };
    const root = this.request.workspaceRoot;
    if (name === "plan_list") return planTools.planList(root, { ...args, workspaceRoot: root }, options);
    if (name === "plan_read") return planTools.planRead(root, this.resolveLocator(args), options);
    if (name === "plan_create") {
      requirePlanBody(args);
      const prior = this.plan?.path ? this.plan : await this.findPlanForCurrentTask(options);
      if (prior) return this.saveUpdate({ ...args, id: prior.id, path: prior.path }, options);
      const saved = await planTools.planCreate(root, this.trustedCreateArguments(args), options);
      return this.recordSavedPlan(saved, args, EVENT_TYPES.PLAN_SAVED, options);
    }
    return this.saveUpdate(args, options);
  }

  async saveUpdate(args, options) {
    if (this.policy.requirePlanPersistence === true) requirePlanBody(args);
    const locator = this.resolveLocator(args);
    const patch = { ...(args.patch && typeof args.patch === "object" ? args.patch : {}) };
    if (args.status !== undefined) patch.status = args.status;
    if (args.archived !== undefined) patch.archived = args.archived;
    const saved = await planTools.planUpdate(this.request.workspaceRoot, { ...args, ...locator, patch }, options);
    return this.recordSavedPlan(saved, args, EVENT_TYPES.PLAN_UPDATED, options);
  }

  async recordSavedPlan(result, args, eventType, options) {
    const plan = result?.plan;
    requireSavedPlanMetadata(plan);
    const full = await planTools.planRead(this.request.workspaceRoot, { id: plan.id, path: plan.path }, options);
    this.plan = { ...plan, ...pickPlanMetadata(full) };
    requireSavedPlanMetadata(this.plan);
    this.body = String(full.body ?? args.body ?? args.content ?? "");
    this.target = normalizeTarget(this.plan);
    this.emit({ type: eventType, plan: { ...this.plan } });
    return { ...result, plan: { ...this.plan } };
  }

  async findPlanForCurrentTask(options) {
    const sourceTaskId = String(this.request.sourceTaskId || this.request.taskId || "").trim();
    if (!sourceTaskId) return null;
    const listed = await planTools.planList(this.request.workspaceRoot, { workspaceRoot: this.request.workspaceRoot, maxResults: 500 }, options);
    return (listed.plans || []).find((plan) => String(plan.sourceTaskId || "") === sourceTaskId) || null;
  }

  trustedCreateArguments(args) {
    return {
      ...args,
      workspaceRoot: this.request.workspaceRoot,
      sourceChatId: String(this.request.sourceChatId || this.request.chatId || ""),
      sourceTaskId: String(this.request.sourceTaskId || this.request.taskId || "")
    };
  }

  resolveLocator(args = {}) {
    if (this.operation === "update" && (this.target.id || this.target.path)) return { ...this.target };
    const locator = normalizeTarget(args);
    if (locator.id || locator.path) return locator;
    if (this.plan?.id || this.plan?.path) return normalizeTarget(this.plan);
    if (this.target.id || this.target.path) return { ...this.target };
    throw new Error("Plan id or path is required for an update.");
  }

  shouldUpdate() { return this.operation === "update" || !!(this.target.id || this.target.path || this.plan?.path); }

  serialize(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }
}

function normalizeOperation(value, target) {
  const operation = String(value || "").toLowerCase();
  if (["create", "update", "auto"].includes(operation)) return operation;
  const normalizedTarget = normalizeTarget(target);
  return normalizedTarget.id || normalizedTarget.path ? "update" : "auto";
}

function normalizeTarget(value) {
  return value && typeof value === "object"
    ? { id: String(value.id || "").trim(), path: String(value.path || "").trim() }
    : { id: "", path: "" };
}

function pickPlanMetadata(plan = {}) {
  const keys = ["id", "title", "path", "status", "archived", "createdAt", "updatedAt", "workspaceRoot", "sourceChatId", "sourceTaskId", "milestones"];
  return Object.fromEntries(keys.filter((key) => plan[key] !== undefined).map((key) => [key, plan[key]]));
}

function requirePlanBody(args = {}) {
  if (String(args.body ?? args.content ?? "").trim()) return;
  throw new Error("A complete Markdown plan body is required.");
}

function requireSavedPlanMetadata(plan) {
  if (String(plan?.id || "").trim() && String(plan?.path || "").trim()) return;
  throw new Error("The plan repository operation did not return an authoritative plan id and path.");
}

module.exports = { PLAN_TOOL_NAMES, PlanRepositorySession, normalizeOperation, normalizeTarget, requirePlanBody, requireSavedPlanMetadata };
