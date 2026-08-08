/** Durable workspace-scoped scheduling for autonomous task requests. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_DELAY_MINUTES = 60 * 24 * 30;
const RUNNING_RECLAIM_MS = 5 * 60 * 1000;
const ACTIVE_TIMERS = new Map();

class RunScheduler {
  constructor(request, services = {}, emit = () => {}) {
    this.request = request;
    this.services = services;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.workspaceRoot = path.resolve(String(request.workspaceRoot || "."));
    this.filePath = request.profileRoot ? path.join(request.profileRoot, ".md-editor", "companion", "schedules.json") : "";
    this.entries = [];
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.filePath) {
      try {
        const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
        this.entries = Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => entry.workspaceRoot === this.workspaceRoot) : [];
        let recovered = false;
        for (const entry of this.entries) {
          if (entry.status !== "running" || Date.now() - Date.parse(entry.claimedAt || 0) < RUNNING_RECLAIM_MS) continue;
          entry.status = "scheduled";
          entry.nextRunAt = new Date().toISOString();
          entry.lastError = "The prior scheduled run was interrupted before reporting completion.";
          recovered = true;
        }
        if (recovered) await this.save();
      } catch (error) {
        if (error?.code !== "ENOENT") this.emit({ type: "recovery-warning", reason: "schedule-store-invalid", summary: "The schedule store could not be read; valid schedules can be recreated." });
        this.entries = [];
      }
    }
    for (const entry of this.entries) this.arm(entry);
    return this.list();
  }

  async create(input = {}) {
    const prompt = String(input.prompt || "").trim();
    const delayMinutes = boundedMinutes(input.delayMinutes, "delayMinutes");
    const recurring = input.recurring === true;
    const intervalMinutes = recurring ? boundedMinutes(input.intervalMinutes || delayMinutes, "intervalMinutes") : 0;
    if (!prompt) throw new Error("A scheduled task requires a non-empty prompt.");
    const entry = {
      id: crypto.randomUUID(), workspaceRoot: this.workspaceRoot, prompt, action: "agent", recurring, intervalMinutes,
      createdAt: new Date().toISOString(), nextRunAt: new Date(Date.now() + delayMinutes * 60000).toISOString(),
      expiresAt: new Date(Date.now() + Math.min(Math.max(Number(input.expiresInDays) || 30, 1), 30) * 86400000).toISOString(),
      status: "scheduled",
      capabilityBoundary: {
        mode: "agent",
        toolScopes: JSON.parse(JSON.stringify(this.request.settings?.toolScopes || {})),
        autoRunCommands: this.request.settings?.agentAutoRunCommands === true
      }
    };
    this.entries.push(entry);
    await this.save();
    this.arm(entry);
    this.emit({ type: "schedule-created", id: entry.id, nextRunAt: entry.nextRunAt, recurring, summary: "Autonomous task schedule created." });
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
    }
    if (due.length) await this.save();
    return due.map(publicEntry);
  }

  async complete(id, error = "") {
    const entry = this.entries.find((candidate) => candidate.id === String(id || ""));
    if (!entry || entry.status !== "running") throw new Error("Running schedule not found.");
    entry.lastRunAt = new Date().toISOString();
    entry.lastError = String(error || "");
    if (entry.recurring && Date.now() + entry.intervalMinutes * 60000 <= Date.parse(entry.expiresAt)) {
      entry.status = "scheduled";
      entry.nextRunAt = new Date(Date.now() + entry.intervalMinutes * 60000).toISOString();
      this.arm(entry);
    } else entry.status = entry.lastError ? "failed" : "completed";
    await this.save();
    this.emit({ type: entry.lastError ? "schedule-failed" : "schedule-completed", id: entry.id, error: entry.lastError || undefined, summary: entry.lastError ? "Scheduled autonomous task failed." : "Scheduled autonomous task completed." });
    return publicEntry(entry);
  }

  snapshot() { return { version: 1, ids: this.entries.filter((entry) => entry.status === "scheduled").map((entry) => entry.id) }; }
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
    try {
      if (typeof this.services.scheduleRun !== "function") throw new Error("The application scheduling runner is unavailable.");
      await this.services.scheduleRun({ prompt: entry.prompt, action: entry.action, workspaceRoot: entry.workspaceRoot, scheduleId: entry.id, capabilityBoundary: entry.capabilityBoundary });
      entry.lastRunAt = new Date().toISOString();
      entry.lastError = "";
    } catch (error) {
      entry.lastError = error?.message || String(error);
      this.emit({ type: "schedule-failed", id: entry.id, error: entry.lastError, summary: "Scheduled autonomous task failed." });
      this.emit({ type: "recovery-warning", reason: "schedule-run-failed", scheduleId: entry.id, summary: entry.lastError });
    }
    if (entry.recurring && Date.now() + entry.intervalMinutes * 60000 <= Date.parse(entry.expiresAt)) {
      entry.nextRunAt = new Date(Date.now() + entry.intervalMinutes * 60000).toISOString();
      this.arm(entry);
    } else {
      entry.status = entry.lastError ? "failed" : "completed";
      if (entry.status === "completed") this.emit({ type: "schedule-completed", id: entry.id, summary: "Scheduled autonomous task completed." });
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
      const temporary = this.filePath + "." + process.pid + ".tmp";
      await fs.writeFile(temporary, JSON.stringify({ version: 1, entries: [...retained, ...this.entries] }, null, 2) + "\n", "utf8");
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
  return { id: entry.id, prompt: entry.prompt, recurring: entry.recurring, intervalMinutes: entry.intervalMinutes, nextRunAt: entry.nextRunAt, expiresAt: entry.expiresAt, status: entry.status, lastRunAt: entry.lastRunAt, lastError: entry.lastError, capabilityBoundary: entry.capabilityBoundary };
}

module.exports = { MAX_DELAY_MINUTES, RUNNING_RECLAIM_MS, RunScheduler, boundedMinutes, publicEntry };
