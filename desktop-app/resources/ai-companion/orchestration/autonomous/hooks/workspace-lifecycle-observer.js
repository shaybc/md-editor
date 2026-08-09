/** Run-scoped watched-file and workspace-change lifecycle events. */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

class WorkspaceLifecycleObserver {
  constructor(request, dispatch, emit = () => {}) {
    this.request = request;
    this.dispatch = dispatch;
    this.emit = emit;
    this.watchers = new Map();
    this.pending = new Map();
    this.exists = new Map();
    this.recent = new Map();
  }

  /** Replace active watch paths with a bounded workspace-contained set. */
  update(paths = []) {
    const next = new Set(Array.from(paths, (value) => this.resolve(value)).filter(Boolean).slice(0, 100));
    for (const [filePath, watcher] of this.watchers) if (!next.has(filePath)) { watcher.close(); this.watchers.delete(filePath); }
    for (const filePath of next) if (!this.watchers.has(filePath)) this.watch(filePath);
  }

  /** Notify hooks when the application changes the active workspace. */
  async workspaceChanged(previousRoot, nextRoot, reason = "application") {
    const relativePaths = Array.from(this.watchers.keys(), (item) => path.relative(previousRoot, item).replace(/\\/g, "/"));
    const decision = await this.dispatch("workspace-changed", { previousRoot, workspaceRoot: nextRoot, reason });
    for (const watcher of this.watchers.values()) watcher.close();
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.watchers.clear();
    this.pending.clear();
    this.exists.clear();
    this.request = { ...this.request, workspaceRoot: nextRoot };
    this.update(relativePaths);
    return decision;
  }

  watch(filePath) {
    const target = fs.existsSync(filePath) ? filePath : path.dirname(filePath);
    try {
      this.exists.set(filePath, fs.existsSync(filePath));
      const watcher = fs.watch(target, { persistent: false }, (eventType, filename) => {
        const changed = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() && filename ? path.join(target, String(filename)) : filePath;
        if (path.resolve(changed) !== path.resolve(filePath) && target !== filePath) return;
        clearTimeout(this.pending.get(filePath));
        this.pending.set(filePath, setTimeout(() => this.fire(filePath, eventType), 500));
      });
      watcher.on("error", (error) => this.emit({ type: "hook-failed", hookId: "workspace-observer", event: "file-changed", error: error?.message || String(error) }));
      this.watchers.set(filePath, watcher);
    } catch (error) { this.emit({ type: "hook-failed", hookId: "workspace-observer", event: "file-changed", error: error?.message || String(error) }); }
  }

  async fire(filePath, eventType) {
    this.pending.delete(filePath);
    const exists = fs.existsSync(filePath);
    const existed = this.exists.get(filePath) === true;
    const change = exists ? (existed ? "changed" : "created") : "deleted";
    this.exists.set(filePath, exists);
    const relativePath = path.relative(this.request.workspaceRoot, filePath).replace(/\\/g, "/");
    const key = `${relativePath}:${change}`;
    const last = this.recent.get(key) || 0;
    if (Date.now() - last < 1500) return;
    this.recent.set(key, Date.now());
    for (const [recentKey, timestamp] of this.recent) if (Date.now() - timestamp > 5000) this.recent.delete(recentKey);
    await this.dispatch("file-changed", { path: relativePath, change, nativeEvent: eventType }).catch(() => {});
  }

  resolve(value) { const candidate = path.resolve(this.request.workspaceRoot, String(value || "")); const relative = path.relative(this.request.workspaceRoot, candidate); return relative && (relative.startsWith("..") || path.isAbsolute(relative)) ? "" : candidate; }
  snapshot() { return { version: 1, watchPaths: Array.from(this.watchers.keys(), (item) => path.relative(this.request.workspaceRoot, item).replace(/\\/g, "/")) }; }
  close() { for (const watcher of this.watchers.values()) watcher.close(); for (const timer of this.pending.values()) clearTimeout(timer); this.watchers.clear(); this.pending.clear(); this.exists.clear(); this.recent.clear(); }
}

module.exports = { WorkspaceLifecycleObserver };
