// Versioned statistics state and read-only aggregate calculations.
(function(global) {
  "use strict";

  const STATISTICS_VERSION = 1;

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function toDuration(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeCountMap(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(source)
      .map(([key, count]) => [String(key || "").trim(), toCount(count)])
      .filter(([key, count]) => key && count > 0));
  }

  /** Create an empty statistics document whose collection begins now. */
  function createDefaultStatistics(now = Date.now()) {
    const startedAt = toCount(now) || Date.now();
    return {
      version: STATISTICS_VERSION,
      trackingStartedAt: startedAt,
      user: {
        charactersSaved: 0,
        saves: 0,
        projectKeys: [],
        runs: 0,
        runDurationMs: 0,
        maxRunDurationMs: 0,
        builds: 0,
        buildDurationMs: 0,
        maxBuildDurationMs: 0
      },
      ai: {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        requestDurationMs: 0,
        maxRequestDurationMs: 0,
        toolActivations: 0,
        requestsByMode: {},
        requestsByConversation: {}
      },
      git: {
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        commits: 0,
        pushes: 0,
        pullRequests: 0
      },
      app: {
        launches: 0,
        totalRuntimeMs: 0,
        maxUptimeMs: 0
      }
    };
  }

  /** Normalize persisted statistics while preserving forward-compatible unknown fields. */
  function normalizeStatistics(value, now = Date.now()) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = createDefaultStatistics(now);
    const projectKeys = Array.isArray(source.user?.projectKeys)
      ? Array.from(new Set(source.user.projectKeys.map((key) => String(key || "").trim()).filter(Boolean))).slice(-2000)
      : [];
    return {
      ...source,
      version: STATISTICS_VERSION,
      trackingStartedAt: toCount(source.trackingStartedAt) || defaults.trackingStartedAt,
      user: {
        ...source.user,
        charactersSaved: toCount(source.user?.charactersSaved),
        saves: toCount(source.user?.saves),
        projectKeys,
        runs: toCount(source.user?.runs),
        runDurationMs: toDuration(source.user?.runDurationMs),
        maxRunDurationMs: toDuration(source.user?.maxRunDurationMs),
        builds: toCount(source.user?.builds),
        buildDurationMs: toDuration(source.user?.buildDurationMs),
        maxBuildDurationMs: toDuration(source.user?.maxBuildDurationMs)
      },
      ai: {
        ...source.ai,
        requests: toCount(source.ai?.requests),
        promptTokens: toCount(source.ai?.promptTokens),
        completionTokens: toCount(source.ai?.completionTokens),
        requestDurationMs: toDuration(source.ai?.requestDurationMs),
        maxRequestDurationMs: toDuration(source.ai?.maxRequestDurationMs),
        toolActivations: toCount(source.ai?.toolActivations),
        requestsByMode: normalizeCountMap(source.ai?.requestsByMode),
        requestsByConversation: normalizeCountMap(source.ai?.requestsByConversation)
      },
      git: {
        ...source.git,
        additions: toCount(source.git?.additions),
        deletions: toCount(source.git?.deletions),
        filesChanged: toCount(source.git?.filesChanged),
        commits: toCount(source.git?.commits),
        pushes: toCount(source.git?.pushes),
        pullRequests: toCount(source.git?.pullRequests)
      },
      app: {
        ...source.app,
        launches: toCount(source.app?.launches),
        totalRuntimeMs: toDuration(source.app?.totalRuntimeMs),
        maxUptimeMs: toDuration(source.app?.maxUptimeMs)
      }
    };
  }

  /** Produce derived values used by the read-only statistics view. */
  function createStatisticsSummary(value, now = Date.now()) {
    const state = normalizeStatistics(value, now);
    const conversations = Object.values(state.ai.requestsByConversation);
    const totalConversationRequests = conversations.reduce((total, count) => total + count, 0);
    return {
      ...state,
      user: {
        ...state.user,
        projectsWorkedOn: state.user.projectKeys.length,
        averageRunDurationMs: state.user.runs ? state.user.runDurationMs / state.user.runs : 0,
        averageBuildDurationMs: state.user.builds ? state.user.buildDurationMs / state.user.builds : 0
      },
      ai: {
        ...state.ai,
        totalTokens: state.ai.promptTokens + state.ai.completionTokens,
        conversations: conversations.length,
        averageRequestsPerConversation: conversations.length ? totalConversationRequests / conversations.length : 0,
        maxRequestsPerConversation: conversations.length ? Math.max(...conversations) : 0,
        averageRequestDurationMs: state.ai.requests ? state.ai.requestDurationMs / state.ai.requests : 0
      },
      app: {
        ...state.app,
        averageUptimeMs: state.app.launches ? state.app.totalRuntimeMs / state.app.launches : 0
      }
    };
  }

  /** Produce a stable local-only identifier without persisting a project or chat path/name. */
  function hashStatisticsIdentifier(value) {
    const text = String(value || "").trim().toLowerCase();
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  global.MarkdownViewerStatisticsModel = {
    STATISTICS_VERSION,
    createDefaultStatistics,
    createStatisticsSummary,
    hashStatisticsIdentifier,
    normalizeStatistics
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.MarkdownViewerStatisticsModel;
})(typeof window !== "undefined" ? window : globalThis);
