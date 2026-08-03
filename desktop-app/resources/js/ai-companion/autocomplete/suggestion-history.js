(function(window) {
  "use strict";

  /**
   * Bounded history of shown/accepted/rejected/error autocomplete outcomes, keyed by
   * context key. Replaces request-policy's single "last rejected key" field with a real
   * (if small) history so reject-suppression and telemetry share one source of truth.
   * @param {{limit?: number}=} options History size.
   * @returns {object} History record/query helpers.
   */
  function createAiCompanionAutocompleteSuggestionHistory(options) {
    const limit = Math.max(1, options?.limit || 20);
    const events = [];

    function record(outcome, details) {
      events.push({
        outcome,
        contextKey: details?.contextKey || "",
        path: details?.path || "",
        position: typeof details?.position === "number" ? details.position : -1,
        language: details?.language || "",
        latencyMs: typeof details?.latencyMs === "number" ? details.latencyMs : -1,
        message: details?.message || "",
        timestamp: Date.now()
      });
      while (events.length > limit) events.shift();
      return events[events.length - 1];
    }

    function findLastByContextKey(contextKey) {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        if (events[index].contextKey === contextKey) return events[index];
      }
      return null;
    }

    /**
     * Most recent event overall, regardless of outcome. Used for reject-suppression:
     * "was the last thing that happened here a rejection?" is a more useful question than
     * "was this exact context key rejected?", since a context key embeds the raw cursor
     * position and therefore changes on every keystroke — an exact-match lookup could never
     * hit again once the user resumed typing.
     */
    function lastEvent() {
      return events.length ? events[events.length - 1] : null;
    }

    return {
      recordShown: (details) => record("shown", details),
      recordAccepted: (details) => record("accepted", details),
      recordRejected: (details) => record("rejected", details),
      recordError: (details) => record("error", details),
      findLastByContextKey,
      lastEvent,
      list: () => events.slice()
    };
  }

  window.createAiCompanionAutocompleteSuggestionHistory = createAiCompanionAutocompleteSuggestionHistory;
})(window);
