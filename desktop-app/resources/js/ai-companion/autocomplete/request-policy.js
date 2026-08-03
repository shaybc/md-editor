(function(window) {
  "use strict";

  /**
   * Decide when autocomplete should call the model, inspired by Continue's debounce/prefilter/cache flow.
   * @param {object} deps Runtime dependencies: settings, cache, rendering, model calls, plus the
   *   phase 2 suggestion-history (reject-suppression source of truth), telemetry (shown/error
   *   hooks), and shapeRequest (model-specific request payload shaping) collaborators.
   * @returns {object} Request lifecycle controls.
   */
  function createAiCompanionAutocompleteRequestPolicy(deps) {
    let timerId = null;
    let requestSequence = 0;
    let typedCharactersSinceReject = 0;

    function cancelPending() {
      requestSequence += 1;
      window.clearTimeout(timerId);
      timerId = null;
    }

    function isAutocompleteEnabled(settings) {
      return settings.enabled && settings.autocompleteEnabled;
    }

    function isSelectionEligible(view) {
      const selection = view.state.selection;
      return selection.ranges.length === 1 && selection.main.empty;
    }

    // Maps a classified scope (see scope-classifier.js) to the settings fields that control
    // it. Falls back to "line" behavior for an unrecognized/missing scope so a classifier
    // bug never silently disables autocomplete outright.
    const SCOPE_ENABLED_SETTING = { line: "autocompleteLineEnabled", block: "autocompleteBlockEnabled", comment: "autocompleteCommentEnabled" };
    const SCOPE_IDLE_MS_SETTING = { line: "autocompleteIdleMs", block: "autocompleteBlockIdleMs", comment: "autocompleteCommentIdleMs" };

    function isScopeEnabled(settings, scope) {
      const settingKey = SCOPE_ENABLED_SETTING[scope] || SCOPE_ENABLED_SETTING.line;
      return settings[settingKey] !== false;
    }

    function getScopeIdleMs(settings, scope) {
      const settingKey = SCOPE_IDLE_MS_SETTING[scope] || SCOPE_IDLE_MS_SETTING.line;
      const value = settings[settingKey];
      return Number.isFinite(value) ? value : settings.autocompleteIdleMs;
    }

    /**
     * Suppress a request if the most recently recorded outcome was a rejection in the same
     * file, within the configured char/time thresholds — e.g. don't immediately re-offer a
     * suggestion the user just dismissed a moment ago.
     *
     * This used to match on an exact context-key lookup (`findLastByContextKey`), but a
     * context key embeds the raw cursor position, which changes on every keystroke. That
     * meant the lookup could only ever hit if the user rejected a suggestion and then typed
     * *nothing* before the next schedule() call — a path that can't actually happen, since
     * schedule() only runs on document changes. The suppression window was live code that
     * could never fire. Keying off "the last thing that happened, anywhere in this file" is
     * what the char/time thresholds were already designed to scope, so this makes the
     * feature actually work instead of just compiling.
     */
    function isRecentRejectionActive(settings, path) {
      const lastEvent = deps.history?.lastEvent ? deps.history.lastEvent() : null;
      if (!lastEvent || lastEvent.outcome !== "rejected" || lastEvent.path !== path) return false;
      const waited = Date.now() - lastEvent.timestamp >= settings.autocompleteRejectDelayMs;
      return !waited && typedCharactersSinceReject < settings.autocompleteRejectCharacters;
    }

    /**
     * Send the completion request and apply the result (cache, ghost text, telemetry,
     * status). Shared by both the debounced auto-trigger (`schedule`) and the immediate
     * manual trigger (`requestNow`) so the two paths can't drift apart.
     */
    async function performRequest(context, settings, view, contextKey, sequence, requestStartedAt) {
      deps.cache.markPending(contextKey);
      try {
        deps.setStatus("Autocomplete working");
        const requestShape = deps.shapeRequest ? deps.shapeRequest(context, settings) : {};
        const result = await deps.requestCompletion(Object.assign({}, context, { requestShaping: requestShape }));
        deps.cache.clearPending(contextKey);
        if (sequence !== requestSequence || view.state.selection.main.head !== context.position) return;

        const completion = deps.postprocessCompletion(Object.assign({}, context, { completion: result?.completion || "" }));
        if (!completion) {
          // The request succeeded but there was nothing worth showing (empty/duplicate
          // model output, or postprocessing rejected it). Without this, status stays on
          // "Autocomplete working" forever even though the request already finished.
          deps.telemetry?.recordShown({
            contextKey,
            path: context.path,
            position: context.position,
            language: context.languageProfile?.id,
            latencyMs: Date.now() - requestStartedAt,
            empty: true
          });
          deps.setStatus("Autocomplete ready (no suggestion)");
          return;
        }
        deps.cache.remember(contextKey, completion);
        deps.showSuggestion(Object.assign({}, context, { completion, contextKey }));
        deps.telemetry?.recordShown({
          contextKey,
          path: context.path,
          position: context.position,
          language: context.languageProfile?.id,
          latencyMs: Date.now() - requestStartedAt
        });
        deps.setStatus("Autocomplete ready");
      } catch (error) {
        deps.cache.clearPending(contextKey);
        deps.telemetry?.recordError({ contextKey, path: context.path, language: context.languageProfile?.id, message: error?.message || String(error) });
        deps.setStatus(`Autocomplete error: ${error?.message || String(error)}`);
        deps.hideSuggestion();
      }
    }

    function schedule(context) {
      const settings = deps.getSettings();
      const view = context.editor.getView();
      if (!isAutocompleteEnabled(settings)) {
        deps.setStatus("Autocomplete disabled");
        cancelPending();
        return;
      }
      if (!isSelectionEligible(view)) {
        cancelPending();
        return;
      }
      if (!isScopeEnabled(settings, context.scope)) {
        // Only the scope this keystroke was classified as needs to be off — e.g. block
        // completions disabled shouldn't also silence ordinary line completions elsewhere.
        // This (and the reject-suppression branch below) used to return silently, which made
        // "nothing happened automatically" indistinguishable from "a request just quietly
        // debounced" from the UI alone — status text here makes that diagnosable without a
        // log dive.
        deps.setStatus(`Autocomplete (${context.scope}) disabled`);
        cancelPending();
        return;
      }

      const contextKey = deps.cache.createContextKey(context);
      if (isRecentRejectionActive(settings, context.path)) {
        deps.setStatus("Autocomplete paused after reject");
        cancelPending();
        return;
      }

      const cachedCompletion = deps.cache.recall(contextKey);
      if (cachedCompletion) {
        deps.showSuggestion(Object.assign({}, context, { completion: cachedCompletion, contextKey }));
        deps.telemetry?.recordShown({ contextKey, path: context.path, position: context.position, language: context.languageProfile?.id });
        deps.setStatus("Autocomplete ready");
        return;
      }
      if (deps.cache.isPending(contextKey)) return;

      cancelPending();
      const sequence = requestSequence + 1;
      requestSequence = sequence;
      const requestStartedAt = Date.now();
      // Visible confirmation that a debounced request is actually queued, not stuck — block
      // scope in particular waits noticeably longer than line scope by default, and without
      // this the status bar just sits on whatever it last said, which reads as "nothing is
      // happening" even though a timer is legitimately counting down.
      deps.setStatus(`Autocomplete waiting (${context.scope})`);
      timerId = window.setTimeout(() => {
        if (sequence !== requestSequence) return;
        performRequest(context, settings, view, contextKey, sequence, requestStartedAt);
      }, getScopeIdleMs(settings, context.scope));
    }

    /**
     * Bypass the idle debounce, the per-scope enable toggle, and the reject-suppression
     * grace window, and ask for a suggestion right now. Meant for an explicit user action
     * (keyboard shortcut) — the fallback for when the automatic heuristics decided not to
     * fire (including "this scope is turned off"), or the user doesn't want to wait out the
     * debounce. Still respects a fresh cache hit and in-flight dedup, since those are just
     * "don't do redundant work," not "don't react."
     */
    function requestNow(context) {
      const settings = deps.getSettings();
      const view = context.editor.getView();
      if (!isAutocompleteEnabled(settings)) {
        deps.setStatus("Autocomplete disabled");
        return;
      }
      if (!isSelectionEligible(view)) return;

      const contextKey = deps.cache.createContextKey(context);
      const cachedCompletion = deps.cache.recall(contextKey);
      if (cachedCompletion) {
        deps.showSuggestion(Object.assign({}, context, { completion: cachedCompletion, contextKey }));
        deps.telemetry?.recordShown({ contextKey, path: context.path, position: context.position, language: context.languageProfile?.id });
        deps.setStatus("Autocomplete ready");
        return;
      }
      if (deps.cache.isPending(contextKey)) return;

      cancelPending();
      const sequence = requestSequence + 1;
      requestSequence = sequence;
      performRequest(context, settings, view, contextKey, sequence, Date.now());
    }

    return {
      cancelPending,
      noteTypedChange: function(characterCount) {
        typedCharactersSinceReject += Math.max(0, characterCount || 0);
      },
      noteAccepted: function() {
        typedCharactersSinceReject = 0;
      },
      noteRejected: function() {
        typedCharactersSinceReject = 0;
      },
      schedule,
      requestNow
    };
  }

  window.createAiCompanionAutocompleteRequestPolicy = createAiCompanionAutocompleteRequestPolicy;
})(window);
