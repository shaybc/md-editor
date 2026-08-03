/* Persistent background-process history and cancellation ownership. */
(function(global) {
  "use strict";

  const HISTORY_KEY = "backgroundProcessHistory";
  const DEFAULT_HISTORY_LIMIT = 500;

  /**
   * Register the canonical background-process history store.
   * @param {object} app MD-Editor application registry.
   * @param {object} deps Persistence, confirmation, and timing dependencies.
   * @returns {object} Background-process lifecycle API.
   */
  function registerMarkdownViewerBackgroundProcesses(app, deps = {}) {
    const model = deps.model || global.MarkdownViewerBackgroundProcessEntry;
    const now = deps.now || Date.now;
    const handlers = new Map();
    const listeners = new Set();
    let sequence = 0;
    let persistTimer = null;
    let entries = loadEntries();

    function loadEntries() {
      const saved = deps.loadGlobalState?.()?.[HISTORY_KEY];
      const restored = Array.isArray(saved) ? saved.map((entry) => model.createProcessEntry(entry, now())) : [];
      let changed = false;
      restored.forEach((entry) => {
        if (entry.status !== model.RUNNING) return;
        entry.status = "cancelled";
        entry.endedAt = entry.updatedAt;
        entry.cancelPending = false;
        changed = true;
      });
      if (changed) global.setTimeout?.(() => persist(true), 0);
      return prune(restored);
    }

    function prune(values) {
      const running = values.filter((entry) => entry.status === model.RUNNING);
      const terminal = values.filter((entry) => model.isTerminalStatus(entry.status))
        .sort((left, right) => right.startedAt - left.startedAt)
        .slice(0, Number(deps.historyLimit) || DEFAULT_HISTORY_LIMIT);
      return [...running, ...terminal].sort((left, right) => right.startedAt - left.startedAt);
    }

    function snapshot() {
      return entries.map((entry) => ({ ...entry }));
    }

    function notify() {
      const value = snapshot();
      listeners.forEach((listener) => listener(value));
    }

    function persist(immediate = false) {
      if (persistTimer) global.clearTimeout?.(persistTimer);
      const save = () => {
        persistTimer = null;
        deps.saveGlobalState?.({ [HISTORY_KEY]: entries.map((entry) => ({ ...entry, cancelPending: false })) });
      };
      if (immediate) save();
      else persistTimer = global.setTimeout?.(save, 100) || null;
    }

    function findRunning(ownerId) {
      return entries.find((entry) => entry.ownerId === ownerId && entry.status === model.RUNNING) || null;
    }

    /** Start a new run, or update the current run owned by the same status ID. */
    function start(value = {}) {
      const ownerId = String(value.ownerId || value.id || "").trim();
      if (!ownerId) return null;
      let entry = findRunning(ownerId);
      if (!entry) {
        const timestamp = now();
        entry = model.createProcessEntry({
          ...value,
          id: `${ownerId}:${timestamp}:${++sequence}`,
          ownerId,
          status: model.RUNNING,
          startedAt: timestamp
        }, timestamp);
        entries.unshift(entry);
      } else {
        Object.assign(entry, {
          description: String(value.description || entry.description),
          category: String(value.category || entry.category),
          icon: String(value.icon || entry.icon),
          pid: model.normalizePid(value.pid) || entry.pid,
          tabId: String(value.tabId || entry.tabId || ""),
          updatedAt: now()
        });
      }
      if (typeof value.onCancel === "function") handlers.set(entry.id, value.onCancel);
      entries = prune(entries);
      persist();
      notify();
      return { ...entry };
    }

    /** Update the visible description for an active owner. */
    function update(ownerId, value = {}) {
      return start({ ...value, ownerId });
    }

    /** Complete the active run for an owner with a terminal outcome. */
    function complete(ownerId, outcome = "finished", value = {}) {
      const entry = findRunning(String(ownerId || ""));
      if (!entry) return false;
      const timestamp = now();
      entry.status = model.isTerminalStatus(outcome) ? outcome : "finished";
      entry.description = String(value.description || entry.description);
      entry.updatedAt = timestamp;
      entry.endedAt = timestamp;
      entry.cancelPending = false;
      handlers.delete(entry.id);
      entries = prune(entries);
      persist(true);
      notify();
      return true;
    }

    function finish(ownerId, value) { return complete(ownerId, "finished", value); }
    function fail(ownerId, value) { return complete(ownerId, "failed", value); }
    function cancel(ownerId, value) { return complete(ownerId, "cancelled", value); }

    /** Ask the owner of a running entry to cancel after optional app confirmation. */
    async function requestCancel(entryId) {
      const entry = entries.find((candidate) => candidate.id === entryId && candidate.status === model.RUNNING);
      const handler = entry && handlers.get(entry.id);
      if (!entry || typeof handler !== "function" || entry.cancelPending) return false;
      if (deps.shouldConfirmCancel?.() !== false) {
        const approved = await deps.confirm?.({
          title: "Cancel background process?",
          message: `Cancel “${entry.description}”?`,
          dismissValue: false,
          buttons: [
            { id: "keep-running", label: "Keep Running", value: false, variant: "cancel", autoFocus: true },
            { id: "cancel-process", label: "Cancel Process", value: true, variant: "danger" }
          ]
        });
        if (approved !== true) return false;
      }
      entry.cancelPending = true;
      notify();
      try {
        const accepted = await handler();
        if (accepted === false) throw new Error("The process did not accept cancellation.");
        return true;
      } catch (error) {
        entry.cancelPending = false;
        notify();
        await deps.notifyError?.(error, entry);
        return false;
      }
    }

    function remove(entryId) {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.status === model.RUNNING) return false;
      entries = entries.filter((candidate) => candidate.id !== entryId);
      persist(true);
      notify();
      return true;
    }

    function clearCompleted() {
      const next = entries.filter((entry) => entry.status === model.RUNNING);
      if (next.length === entries.length) return false;
      entries = next;
      persist(true);
      notify();
      return true;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }

    const api = {
      HISTORY_KEY,
      start,
      update,
      complete,
      finish,
      fail,
      cancel,
      requestCancel,
      remove,
      clearCompleted,
      subscribe,
      getEntries: snapshot
    };
    app?.registerModule?.("backgroundProcesses", api);
    return api;
  }

  global.registerMarkdownViewerBackgroundProcesses = registerMarkdownViewerBackgroundProcesses;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerBackgroundProcesses, HISTORY_KEY, DEFAULT_HISTORY_LIMIT };
})(typeof window !== "undefined" ? window : globalThis);
