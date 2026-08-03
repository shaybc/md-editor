(function(window) {
  "use strict";

  /**
   * In-memory completion outcome counters, Continue-inspired (local tuning signal, not a
   * hosted analytics pipeline). Reads/writes through the shared suggestion-history so
   * telemetry and reject-suppression agree on what happened.
   * @param {{history: object}} deps Suggestion history instance to read events from.
   * @returns {object} Telemetry record/read helpers.
   */
  function createAiCompanionAutocompleteTelemetry(deps) {
    const counts = { shown: 0, accepted: 0, rejected: 0, errors: 0 };

    function recordShown(details) {
      counts.shown += 1;
      deps.history.recordShown(details);
    }

    function recordAccepted(details) {
      counts.accepted += 1;
      deps.history.recordAccepted(details);
    }

    function recordRejected(details) {
      counts.rejected += 1;
      deps.history.recordRejected(details);
    }

    function recordError(details) {
      counts.errors += 1;
      deps.history.recordError(details);
    }

    function getSummary() {
      const decided = counts.accepted + counts.rejected;
      return Object.assign({}, counts, {
        acceptRate: decided > 0 ? counts.accepted / decided : null
      });
    }

    return { recordShown, recordAccepted, recordRejected, recordError, getSummary };
  }

  window.createAiCompanionAutocompleteTelemetry = createAiCompanionAutocompleteTelemetry;
})(window);
