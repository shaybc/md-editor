/* Background-process entry normalization and terminal-state rules. */
(function(global) {
  "use strict";

  const RUNNING = "running";
  const TERMINAL_STATUSES = Object.freeze(["finished", "failed", "cancelled"]);

  function normalizeStatus(value) {
    const status = String(value || "").toLowerCase();
    return status === RUNNING || TERMINAL_STATUSES.includes(status) ? status : RUNNING;
  }

  function normalizePid(value) {
    const pid = Number(value);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  /**
   * Create one persisted background-process history entry.
   * @param {object} value Raw process fields supplied by an activity owner.
   * @param {number} now Current wall-clock timestamp in milliseconds.
   * @returns {object} Serializable normalized entry.
   */
  function createProcessEntry(value = {}, now = Date.now()) {
    const startedAt = Number(value.startedAt) || now;
    const status = normalizeStatus(value.status);
    const updatedAt = Math.max(startedAt, Number(value.updatedAt) || now);
    const endedAt = status === RUNNING ? null : Math.max(startedAt, Number(value.endedAt) || updatedAt);
    return {
      id: String(value.id || ""),
      ownerId: String(value.ownerId || value.id || ""),
      category: String(value.category || "background"),
      icon: String(value.icon || "bi-gear"),
      description: String(value.description || "Background process"),
      pid: normalizePid(value.pid),
      tabId: String(value.tabId || ""),
      status,
      startedAt,
      updatedAt,
      endedAt,
      cancelPending: status === RUNNING && value.cancelPending === true
    };
  }

  function isTerminalStatus(status) {
    return TERMINAL_STATUSES.includes(normalizeStatus(status));
  }

  function getDuration(entry, now = Date.now()) {
    const end = Number(entry?.endedAt) || (entry?.status === RUNNING ? now : Number(entry?.updatedAt) || now);
    return Math.max(0, end - (Number(entry?.startedAt) || end));
  }

  const api = { RUNNING, TERMINAL_STATUSES, createProcessEntry, normalizeStatus, normalizePid, isTerminalStatus, getDuration };
  global.MarkdownViewerBackgroundProcessEntry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
