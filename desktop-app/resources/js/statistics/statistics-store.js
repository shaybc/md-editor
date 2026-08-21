// Persistent application activity counters used by the read-only statistics screen.
(function(global) {
  "use strict";

  const STORAGE_KEY = "md-editor-user-statistics-v1";
  const TRACKED_AI_ACTIONS = new Set(["chat", "agent", "plan", "autocomplete", "gitSummary"]);

  /** Own persistent statistics state and the active application session. */
  class UserStatisticsStore {
    constructor(deps = {}) {
      this.model = deps.model || global.MarkdownViewerStatisticsModel;
      this.storage = deps.storage || global.localStorage;
      this.now = deps.now || (() => Date.now());
      this.state = this.load();
      this.sessionStartedAt = this.now();
      this.lastSessionFlushAt = this.sessionStartedAt;
      this.activeAiRequests = new Map();
      this.listeners = new Set();
      this.ended = false;
      this.state.app.launches += 1;
      this.persist();
      this.flushTimer = global.setInterval?.(() => this.flushSession(), 30000) || null;
    }

    load() {
      try {
        const parsed = JSON.parse(this.storage?.getItem?.(STORAGE_KEY) || "null");
        return this.model.normalizeStatistics(parsed, this.now());
      } catch (_error) {
        return this.model.createDefaultStatistics(this.now());
      }
    }

    persist() {
      try {
        this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(this.state));
      } catch (_error) {
        // Statistics must never interrupt the user action being measured.
      }
    }

    publish() {
      this.persist();
      const snapshot = this.getSnapshot({ flush: false });
      this.listeners.forEach((listener) => {
        try { listener(snapshot); } catch (_error) { /* Observers are isolated. */ }
      });
    }

    flushSession() {
      if (this.ended) return;
      const current = this.now();
      this.state.app.totalRuntimeMs += Math.max(0, current - this.lastSessionFlushAt);
      this.lastSessionFlushAt = current;
      this.state.app.maxUptimeMs = Math.max(this.state.app.maxUptimeMs, current - this.sessionStartedAt);
      this.persist();
    }

    endSession() {
      if (this.ended) return;
      this.flushSession();
      this.ended = true;
      if (this.flushTimer) global.clearInterval?.(this.flushTimer);
      this.flushTimer = null;
    }

    subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    getSnapshot(options = {}) {
      if (options.flush !== false) this.flushSession();
      return this.model.createStatisticsSummary(this.state, this.now());
    }

    recordSavedCharacters(content) {
      this.state.user.charactersSaved += String(content ?? "").length;
      this.state.user.saves += 1;
      this.publish();
    }

    recordProject(projectPath) {
      const key = this.model.hashStatisticsIdentifier(projectPath);
      if (!key || this.state.user.projectKeys.includes(key)) return;
      this.state.user.projectKeys = [...this.state.user.projectKeys, key].slice(-2000);
      this.publish();
    }

    recordRun(durationMs) {
      const duration = Math.max(0, Number(durationMs) || 0);
      this.state.user.runs += 1;
      this.state.user.runDurationMs += duration;
      this.state.user.maxRunDurationMs = Math.max(this.state.user.maxRunDurationMs, duration);
      this.publish();
    }

    recordBuild(durationMs) {
      const duration = Math.max(0, Number(durationMs) || 0);
      this.state.user.builds += 1;
      this.state.user.buildDurationMs += duration;
      this.state.user.maxBuildDurationMs = Math.max(this.state.user.maxBuildDurationMs, duration);
      this.publish();
    }

    startAiRequest(details = {}) {
      const action = String(details.action || "");
      const id = String(details.id || "");
      if (!id || !TRACKED_AI_ACTIONS.has(action)) return;
      const mode = action === "gitSummary" ? "git summary" : action;
      const conversationKey = details.chatId ? this.model.hashStatisticsIdentifier(details.chatId) : "";
      this.activeAiRequests.set(id, {
        startedAt: this.now(), mode, conversationKey,
        promptTokens: 0, completionTokens: 0,
        toolKeys: new Set(), anonymousToolCount: 0
      });
    }

    recordAiEvent(id, event = {}) {
      const request = this.activeAiRequests.get(String(id || ""));
      if (!request) return;
      if (event.type === "usage") {
        request.promptTokens += Math.max(0, Number(event.promptTokens) || 0);
        request.completionTokens += Math.max(0, Number(event.completionTokens) || 0);
      }
      if (!["tool", "tool-error", "tool-started", "tool-completed", "tool-failed"].includes(event.type)) return;
      const explicitKey = String(event.toolCallId || event.tool_call_id || event.callId || event.activityId || event.id || "");
      if (explicitKey) request.toolKeys.add(explicitKey);
      else if (event.type === "tool-started" || event.type === "tool") request.anonymousToolCount += 1;
    }

    finishAiRequest(id) {
      const key = String(id || "");
      const request = this.activeAiRequests.get(key);
      if (!request) return;
      this.activeAiRequests.delete(key);
      const duration = Math.max(0, this.now() - request.startedAt);
      this.state.ai.requests += 1;
      this.state.ai.promptTokens += Math.max(0, Math.floor(request.promptTokens));
      this.state.ai.completionTokens += Math.max(0, Math.floor(request.completionTokens));
      this.state.ai.requestDurationMs += duration;
      this.state.ai.maxRequestDurationMs = Math.max(this.state.ai.maxRequestDurationMs, duration);
      this.state.ai.toolActivations += request.toolKeys.size + request.anonymousToolCount;
      this.state.ai.requestsByMode[request.mode] = (this.state.ai.requestsByMode[request.mode] || 0) + 1;
      if (request.conversationKey) {
        this.state.ai.requestsByConversation[request.conversationKey] = (this.state.ai.requestsByConversation[request.conversationKey] || 0) + 1;
      }
      this.publish();
    }

    recordGitAction(action, details = {}) {
      const normalizedAction = String(action || "");
      if (normalizedAction === "commit") this.state.git.commits += 1;
      if (normalizedAction === "push") this.state.git.pushes += 1;
      if (normalizedAction === "pull-request") this.state.git.pullRequests += 1;
      if (!["commit", "push", "pull-request"].includes(normalizedAction)) return;
      this.state.git.filesChanged += Math.max(0, Math.floor(Number(details.filesChanged) || 0));
      this.state.git.additions += Math.max(0, Math.floor(Number(details.additions) || 0));
      this.state.git.deletions += Math.max(0, Math.floor(Number(details.deletions) || 0));
      this.publish();
    }
  }

  /** Register the persistent Stats for Geeks service. */
  function registerMarkdownViewerUserStatistics(app, deps = {}) {
    const store = new UserStatisticsStore(deps);
    if (app?.services) app.services.statistics = store;
    app?.registerModule?.("userStatistics", store);
    global.addEventListener?.("beforeunload", () => store.endSession());
    return store;
  }

  global.registerMarkdownViewerUserStatistics = registerMarkdownViewerUserStatistics;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { STORAGE_KEY, UserStatisticsStore, registerMarkdownViewerUserStatistics };
  }
})(typeof window !== "undefined" ? window : globalThis);
