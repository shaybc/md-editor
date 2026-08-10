(function (window) {
  "use strict";

  function registerThemePreferences(app, deps) {
    var storageKey = deps.storageKey;
    var defaultState = deps.defaultState;
    var startupThemeCookie = "markdownViewerStartupTheme";

    function normalizeThemePreference(value) {
      return value === "dark" || value === "light" ? value : "";
    }

    function saveStartupThemePreference(theme) {
      var normalizedTheme = normalizeThemePreference(theme);
      if (!normalizedTheme) return;
      try {
        document.cookie = startupThemeCookie + "=" + encodeURIComponent(normalizedTheme) + "; Max-Age=31536000; Path=/; SameSite=Lax";
      } catch (_) {
        // Cookie persistence is best-effort and only affects next-start first paint.
      }
    }

    function loadGlobalState() {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || {};
      } catch (_) {
        return {};
      }
    }

    function saveGlobalState(patch) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Object.assign({}, loadGlobalState(), patch)));
        if (patch && Object.prototype.hasOwnProperty.call(patch, "theme")) {
          saveStartupThemePreference(patch.theme);
        }
        deps.scheduleGlobalProfileWrite();
      } catch (error) {
        console.warn("Failed to save preferences:", error);
      }
    }

    function getDefaultThemePreference() {
      return "dark";
    }

    function getDefaultGlobalState() {
      return Object.assign({}, defaultState, {
        theme: getDefaultThemePreference(),
        themeSelections: window.markdownViewerThemeRegistry?.DEFAULT_SELECTIONS || {
          light: "default-light",
          dark: "default-dark",
        },
        customThemes: {
          light: [],
          dark: [],
        },
      });
    }

    function normalizeThemeState(state) {
      var registry = window.markdownViewerThemeRegistry;
      var source = state && typeof state === "object" ? state : {};
      var customThemes = registry?.normalizeCustomThemes
        ? registry.normalizeCustomThemes(source.customThemes)
        : { light: [], dark: [] };
      var themeSelections = registry?.normalizeThemeSelections
        ? registry.normalizeThemeSelections(source.themeSelections, customThemes)
        : Object.assign({}, registry?.DEFAULT_SELECTIONS || { light: "default-light", dark: "default-dark" }, source.themeSelections || {});
      return Object.assign({}, source, {
        theme: normalizeThemePreference(source.theme) || getDefaultThemePreference(),
        customThemes: customThemes,
        themeSelections: themeSelections,
      });
    }

    function applySelectedAppTheme(state) {
      var registry = window.markdownViewerThemeRegistry;
      if (!registry?.applyThemeFromState) return;
      registry.applyThemeFromState(document.documentElement, normalizeThemeState(state || loadGlobalState()));
    }

    function updateThemeButtonLabels(theme) {
      var nextThemeLabel = theme === "dark" ? "Light" : "Dark";
      var icon = theme === "dark" ? "bi-sun" : "bi-moon";
      var labelHtml = '<i class="bi ' + icon + ' me-2"></i> ' + nextThemeLabel + " Mode";

      if (deps.themeToggle) deps.themeToggle.innerHTML = labelHtml;
      if (deps.mobileThemeToggle) deps.mobileThemeToggle.innerHTML = labelHtml;
      if (deps.settingsThemeToggle) deps.settingsThemeToggle.innerHTML = labelHtml;
    }

    function initializeTheme() {
      var savedState = normalizeThemeState(loadGlobalState());
      var savedTheme = savedState.theme;
      var initialTheme = savedTheme || getDefaultThemePreference();

      document.documentElement.setAttribute("data-theme", initialTheme);
      applySelectedAppTheme(Object.assign({}, savedState, { theme: initialTheme }));
      updateThemeButtonLabels(initialTheme);
      saveStartupThemePreference(initialTheme);

      return initialTheme;
    }

    function toggleTheme() {
      var theme = document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";

      document.documentElement.setAttribute("data-theme", theme);
      saveGlobalState({ theme: theme });
      applySelectedAppTheme(Object.assign({}, loadGlobalState(), { theme: theme }));
      updateThemeButtonLabels(theme);
      deps.renderMarkdown();
    }

    function bindThemeToggle() {
      if (deps.themeToggle) {
        deps.themeToggle.addEventListener("click", toggleTheme);
      }
      if (deps.settingsThemeToggle) {
        deps.settingsThemeToggle.addEventListener("click", toggleTheme);
      }
    }

    var api = {
      bindThemeToggle: bindThemeToggle,
      applySelectedAppTheme: applySelectedAppTheme,
      getDefaultGlobalState: getDefaultGlobalState,
      getDefaultThemePreference: getDefaultThemePreference,
      initializeTheme: initializeTheme,
      loadGlobalState: loadGlobalState,
      normalizeThemeState: normalizeThemeState,
      saveStartupThemePreference: saveStartupThemePreference,
      saveGlobalState: saveGlobalState,
      toggleTheme: toggleTheme,
      updateThemeButtonLabels: updateThemeButtonLabels,
    };

    app.services.preferences = api;
    app.actions.toggleTheme = toggleTheme;
    app.registerModule("themePreferences", api);

    return api;
  }

  window.registerMarkdownViewerThemePreferences = registerThemePreferences;
})(window);
