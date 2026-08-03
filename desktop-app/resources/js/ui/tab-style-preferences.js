/* Persisted outer-tab appearance preference. */
(function(global) {
  "use strict";

  const MODERN_TAB_STYLE = "modern";
  const LEGACY_TAB_STYLE = "legacy";

  /** Register the saved tab-style preference and its body-class presentation hook. */
  function registerMarkdownViewerTabStylePreferences(app, deps = {}) {
    function normalizeTabStyle(value) {
      return String(value || "").trim() === LEGACY_TAB_STYLE ? LEGACY_TAB_STYLE : MODERN_TAB_STYLE;
    }

    function getTabStyle(state = deps.loadGlobalState?.() || {}) {
      return normalizeTabStyle(state.tabStyle);
    }

    function applyTabStylePreference(state = deps.loadGlobalState?.() || {}) {
      const style = getTabStyle(state);
      document.body?.classList.toggle("tab-style-legacy", style === LEGACY_TAB_STYLE);
      document.body?.classList.toggle("tab-style-modern", style === MODERN_TAB_STYLE);
      const resetButton = document.getElementById?.("tab-reset-btn");
      const resetLabel = style === LEGACY_TAB_STYLE ? "Reset all files" : "Close all files";
      resetButton?.setAttribute("title", resetLabel);
      resetButton?.setAttribute("aria-label", resetLabel);
      return style;
    }

    const api = { applyTabStylePreference, getTabStyle, normalizeTabStyle };
    app.registerModule?.("tabStylePreferences", api);
    return api;
  }

  global.registerMarkdownViewerTabStylePreferences = registerMarkdownViewerTabStylePreferences;
})(typeof window !== "undefined" ? window : globalThis);
