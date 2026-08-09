/** Durable workspace-scoped scheduling for autonomous task requests. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { describeScheduleExpression, nextScheduleTime, parseScheduleExpression } = require("./schedule-expression");
const { companionProfilePath } = require("../profile-storage");

const MAX_DELAY_MINUTES = 60 * 24 * 30;
const RUNNING_RECLAIM_MS = 5 * 60 * 1000;
const ACTIVE_TIMERS = new Map();
const SESSION_ENTRIES = new Map();
const MAX_ACTIVE_SCHEDULES = 50;
const MAX_DURABLE_PROMPT_CHARS = 10000;

class RunScheduler {
  constructor(request, services = {}, emit = () => {}) {
    this.request = request;
    this.services = services;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.workspaceRoot = path.resolve(String(request.workspaceRoot || "."));
    this.filePath = companionProfilePath(request.profileRoot, "schedules.json");
    this.entries = [];
    this.queue = Promise.resolve();
    this.lifecycle = null;
  }

  setLifecycleGateway(gateway) { this.lifecycle = gateway; }

  async load() {
    if (this.filePath) {
      try {
        const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
        this.entries = Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => entry.workspaceRoot === this.workspaceRoot).map((entry) => ({ ...entry, durable: entry.durable !== false })) : [];
        let recovered = false;
        for (const entry of this.entries) {
          if (entry.status !== "running" || Date.now() - Date.parse(entry.claimedAt || 0) < RUNNING_RECLAIM_MS) continue;
          entry.status = "scheduled";
          entry.nextRunAt = new Date().toISOString();
          entry.lastError = "The prior scheduled run was interrupted before reporting completion.";
          recovered = true;
        }
        for (const entry of this.entries) {
          if (entry.status !== "scheduled") continue;
          if (Date.parse(entry.expiresAt) <= Date.now()) {
            entry.status = "expired";
            recovered = true;
            continue;
          }
          if (Date.parse(entry.nextRunAt) <= Date.now()) {
            this.emit({ type: "schedule-missed", id: entry.id, nextRunAt: entry.nextRunAt, recurring: entry.recurring, summary: entry.recurring ? "A missed recurring schedule was advanced to its next future run." : "A missed one-time schedule will run once." });
            if (entry.recurring) entry.nextRunAt = new Date(nextRecurringRun(entry, Date.now())).toISOString();
            else entry.nextRunAt = new Date().toISOString();
            recovered = true;
          }
          this.emit({ type: "schedule-restored", id: entry.id, nextRunAt: entry.nextRunAt, recurring: entry.recurring, summary: "A durable autonomous schedule was restored." });
        }
        if (recovered) await this.save();
      } catch (error) {
        if (error?.code !== "ENOENT") this.emit({ type: "recovery-warning", reason: "schedule-store-invalid", summary: "The schedule store could not be read; valid schedules can be recreated." });
        this.entries = [];
      }
    }
    const sessionEntries = SESSION_ENTRIES.get(this.workspaceRoot) || [];
    this.entries = mergeEntries(this.entries, sessionEntries);
    SESSION_ENTRIES.set(this.workspaceRoot, this.entries.filter((entry) => entry.durable === false));
    for (const entry of this.entries) this.arm(entry);
    return this.list();
  }

  async create(input = {}) {
    const prompt = String(input.prompt || "").trim();
    const expression = String(input.expression || input.cron || "").trim();
    if (expression) parseScheduleExpression(expression);
    const delayMinutes = expression ? 0 : boundedMinutes(input.delayMinutes, "delayMinutes");
    const recurring = input.recurring === true;
    const intervalMinutes = recurring && !expression ? boundedMinutes(input.intervalMinutes || delayMinutes, "intervalMinutes") : 0;
    if (!prompt) throw new Error("A scheduled task requires a non-empty prompt.");
    if (this.entries.filter((entry) => ["scheduled", "running"].includes(entry.status)).length >= MAX_ACTIVE_SCHEDULES) throw new Error(`No more than ${MAX_ACTIVE_SCHEDULES} active schedules are allowed.`);
    const durable = input.durable === true;
    if (durable && prompt.length > MAX_DURABLE_PROMPT_CHARS) throw new Error(`A durable schedule prompt cannot exceed ${MAX_DURABLE_PROMPT_CHARS} characters.`);
    const nextRunAt = expression ? new Date(nextScheduleTime(expression)).toISOString() : new Date(Date.now() + delayMinutes * 60000).toISOString();
    const id = crypto.randomUUID();
    const entry = {
      id, workspaceRoot: this.workspaceRoot, prompt, action: "agent", recurring, intervalMinutes, expression, durable,
      approximate: recurring && !expression && input.approximate === true,
      jitterMs: recurring && !expression && input.approximate === true ? deterministicJitter(id, intervalMinutes) : 0,
      createdAt: new Date().toISOString(), nextRunAt,
      expiresAt: new Date(Date.now() + Math.min(Math.max(Number(input.expiresInDays) || 30, 1), 30) * 86400000).toISOString(),
      status: "scheduled",
      capabilityBoundary: {
        mode: "agent",
        toolScopes: JSON.parse(JSON.stringify(this.request.settings?.toolScopes || {})),
        autoRunCommands: this.request.settings?.agentAutoRunCommands === true
      }
    };
    this.entries.push(entry);
    if (!durable) SESSION_ENTRIES.set(this.workspaceRoot, this.entries.filter((candidate) => candidate.durable === false));
    await this.save();
    this.arm(entry);
    this.emit({ type: "schedule-created", id: entry.id, nextRunAt: entry.nextRunAt, recurring, durable, expression: expression || undefined, summary: "Autonomous task schedule created." });
    return publicEntry(entry);
  }

  list() { return this.entries.map(publicEntry); }

  async cancel(id) {
    const entry = this.entries.find((candidate) => candidate.id === String(id || ""));
    if (!entry || entry.status !== "scheduled") throw new Error("Schedule not found.");
    entry.status = "cancelled";
    const timer = ACTIVE_TIMERS.get(entry.id);
    if (timer) clearTimeout(timer);
    ACTIVE_TIMERS.delete(entry.id);
    await this.save();
    this.emit({ type: "schedule-cancelled", id: entry.id, summary: "Autonomous task schedule cancelled." });
    return publicEntry(entry);
  }

  async claimDue(now = Date.now()) {
    const due = this.entries.filter((entry) => entry.status === "scheduled" && Date.parse(entry.nextRunAt) <= now && Date.parse(entry.expiresAt) > now);
    for (const entry of due) {
      entry.status = "running";
      entry.claimedAt = new Date(now).toISOString();
      const timer = ACTIVE_TIMERS.get(entry.id);
      if (timer) clearTimeout(timer);
      ACTIVE_TIMERS.delete(entry.id);
      this.emit({ type: "schedule-fired", id: entry.id, summary: "Scheduled autonomous task is ready." });
      await this.lifecycle?.run?.("schedule-fired", { schedule: publicEntry(entry), source: "claim" });
    }
    if (due.length) await this.save();
    return due.map(publicEntry);
  }

  async complete(id, error = "") {
    const entry = this.entries.find((candidate) => candidate.id === String(id || ""));
    if (!entry || entry.status !== "running") throw new Error("Running schedule not found.");
    entry.lastRunAt = new Date().toISOString();
    entry.lastError = String(error || "");
    const nextRun = nextRecurringRun(entry);
    if (entry.recurring && nextRun <= Date.parse(entry.expiresAt)) {
      entry.status = "scheduled";
      entry.nextRunAt = new Date(nextRun).toISOString();
      this.arm(entry);
    } else entry.status = entry.lastError ? "failed" : "completed";
    await this.save();
    this.emit({ type: entry.lastError ? "schedule-failed" : "schedule-completed", id: entry.id, error: entry.lastError || undefined, summary: entry.lastError ? "Scheduled autonomous task failed." : "Scheduled autonomous task completed." });
    await this.lifecycle?.run?.(entry.lastError ? "schedule-failed" : "schedule-completed", { schedule: publicEntry(entry), error: entry.lastError || undefined });
    return publicEntry(entry);
  }

  snapshot() {
    const scheduled = this.entries.filter((entry) => entry.status === "scheduled");
    return {
      version: 2,
      ids: scheduled.map((entry) => entry.id),
      durableIds: scheduled.filter((entry) => entry.durable !== false).map((entry) => entry.id),
      sessionIds: scheduled.filter((entry) => entry.durable === false).map((entry) => entry.id)
    };
  }
  restore() { for (const entry of this.entries) this.arm(entry); }

  arm(entry) {
    if (typeof this.services.scheduleRun !== "function" || entry.status !== "scheduled" || ACTIVE_TIMERS.has(entry.id)) return;
    const delay = Math.max(0, Math.min(Date.parse(entry.nextRunAt) - Date.now(), 2147483647));
    const timer = setTimeout(() => this.fire(entry).catch(() => {}), delay);
    timer.unref?.();
    ACTIVE_TIMERS.set(entry.id, timer);
  }

  async fire(entry) {
    ACTIVE_TIMERS.delete(entry.id);
    if (entry.status !== "scheduled" || Date.now() > Date.parse(entry.expiresAt)) {
      entry.status = "expired";
      await this.save();
      return;
    }
    this.emit({ type: "schedule-fired", id: entry.id, summary: "Scheduled autonomous task is starting." });
    await this.lifecycle?.run?.("schedule-fired", { schedule: publicEntry(entry), source: "timer" });
    try {
      if (typeof this.services.scheduleRun !== "function") throw new Error("The application scheduling runner is unavailable.");
      await this.services.scheduleRun({ prompt: entry.prompt, action: entry.action, workspaceRoot: entry.workspaceRoot, scheduleId: entry.id, capabilityBoundary: entry.capabilityBoundary });
      entry.lastRunAt = new Date().toISOString();
      entry.lastError = "";
    } catch (error) {
      entry.lastError = error?.message || String(error);
      this.emit({ type: "schedule-failed", id: entry.id, error: entry.lastError, summary: "Scheduled autonomous task failed." });
      await this.lifecycle?.run?.("schedule-failed", { schedule: publicEntry(entry), error: entry.lastError });
      this.emit({ type: "recovery-warning", reason: "schedule-run-failed", scheduleId: entry.id, summary: entry.lastError });
    }
    const nextRun = nextRecurringRun(entry);
    if (entry.recurring && nextRun <= Date.parse(entry.expiresAt)) {
      entry.nextRunAt = new Date(nextRun).toISOString();
      this.arm(entry);
    } else {
      entry.status = entry.lastError ? "failed" : "completed";
      if (entry.status === "completed") {
        this.emit({ type: "schedule-completed", id: entry.id, summary: "Scheduled autonomous task completed." });
        await this.lifecycle?.run?.("schedule-completed", { schedule: publicEntry(entry) });
      }
    }
    await this.save();
  }

  save() {
    if (!this.filePath) return Promise.resolve();
    const operation = async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      let all = [];
      try { all = JSON.parse(await fs.readFile(this.filePath, "utf8")).entries || []; }
      catch (error) { if (error?.code !== "ENOENT" && error?.name !== "SyntaxError") throw error; }
      const retained = all.filter((entry) => entry.workspaceRoot !== this.workspaceRoot);
      const durableEntries = this.entries.filter((entry) => entry.durable !== false);
      const temporary = this.filePath + "." + process.pid + ".tmp";
      await fs.writeFile(temporary, JSON.stringify({ version: 2, entries: [...retained, ...durableEntries] }, null, 2) + "\n", "utf8");
      await fs.rename(temporary, this.filePath);
    };
    this.queue = this.queue.then(operation, operation);
    return this.queue;
  }
}

function boundedMinutes(value, field) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_DELAY_MINUTES) throw new Error(`${field} must be between 1 and ${MAX_DELAY_MINUTES} minutes.`);
  return Math.floor(minutes);
}

function publicEntry(entry) {
  return { id: entry.id, prompt: entry.prompt, recurring: entry.recurring, durable: entry.durable !== false, approximate: entry.approximate === true, intervalMinutes: entry.intervalMinutes, expression: entry.expression || "", scheduleDescription: entry.expression ? describeScheduleExpression(entry.expression) : (entry.recurring ? `every ${entry.intervalMinutes} minutes` : "one time"), nextRunAt: entry.nextRunAt, expiresAt: entry.expiresAt, status: entry.status, lastRunAt: entry.lastRunAt, lastError: entry.lastError, capabilityBoundary: entry.capabilityBoundary };
}

function nextRecurringRun(entry, after = Date.now()) {
  return entry.expression
    ? nextScheduleTime(entry.expression, after)
    : after + entry.intervalMinutes * 60000 + Number(entry.jitterMs || 0);
}
function mergeEntries(durable, session) { const entries = new Map([...durable, ...session].map((entry) => [entry.id, entry])); return Array.from(entries.values()); }
function deterministicJitter(id, intervalMinutes) {
  const maximum = Math.min(5 * 60 * 1000, Math.max(1000, Math.floor(intervalMinutes * 60000 * 0.1)));
  const value = parseInt(crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 8), 16);
  return value % (maximum + 1);
}

module.exports = { MAX_ACTIVE_SCHEDULES, MAX_DELAY_MINUTES, RUNNING_RECLAIM_MS, RunScheduler, boundedMinutes, deterministicJitter, publicEntry };
