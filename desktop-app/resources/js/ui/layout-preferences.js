(function(global) {
  global.registerMarkdownViewerLayoutPreferences = function registerMarkdownViewerLayoutPreferences(app, deps) {
    const api = {};

    with (deps) {
  function getClampedEditorWidthPercent(percent) {
    const numericPercent = Number.parseFloat(percent);
    const fallbackPercent = Number.isFinite(numericPercent) ? numericPercent : 50;
    return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, fallbackPercent));
  }

  function getClampedAiCompanionPanelWidth(width) {
    const numericWidth = Number.parseFloat(width);
    const fallbackWidth = Number.isFinite(numericWidth) ? numericWidth : DEFAULT_AI_COMPANION_PANEL_WIDTH;
    const containerWidth = contentContainer ? contentContainer.getBoundingClientRect().width : window.innerWidth;
    const maxWidth = Math.max(MIN_AI_COMPANION_PANEL_WIDTH, containerWidth * AI_COMPANION_PANEL_MAX_WIDTH_PERCENT / 100);
    return Math.max(MIN_AI_COMPANION_PANEL_WIDTH, Math.min(maxWidth, fallbackWidth));
  }

  function resetSidebarDropzoneLayoutToDefault() {
    if (sidebarDropzonePanel) {
      delete sidebarDropzonePanel.dataset.previousFlex;
      sidebarDropzonePanel.style.flex = "";
      sidebarDropzonePanel.style.display = "";
      sidebarDropzonePanel.style.padding = "";
      sidebarDropzonePanel.style.minHeight = "";
    }
    if (dropzone) {
      dropzone.style.display = "";
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "";
      sidebarDropzoneResizer.style.flex = "";
    }
  }

  function resetStartupThemePreference() {
    try {
      document.cookie = "markdownViewerStartupTheme=dark; Max-Age=31536000; Path=/; SameSite=Lax";
    } catch (_) {
      // Cookie persistence is best-effort and only affects next-start first paint.
    }
  }

  async function restoreDefaultPreferences(options = {}) {
    const shouldConfirm = options.confirm !== false && (typeof shouldConfirmResetState !== "function" || shouldConfirmResetState());
    const shouldNotify = options.notify !== false;
    const message = options.message || "Restore default preferences? This resets saved view, theme, layout, graph, folder, sync, and tag preferences. Open documents and recent items are not removed.";
    const confirmed = !shouldConfirm || (app.services?.confirm
      ? await app.services.confirm({
          title: "Restore defaults",
          message,
          confirmLabel: "OK",
          confirmVariant: "danger"
        })
      : window.confirm(message));
    if (!confirmed) return false;

    try {
      localStorage.removeItem(GLOBAL_STATE_KEY);
    } catch (error) {
      console.warn("Failed to clear saved preferences:", error);
    }
    resetStartupThemePreference();

    const defaults = getDefaultGlobalState();
    currentFolderSortMode = defaults.folderSortMode;
    editorWidthPercent = defaults.editorWidthPercent;
    aiCompanionPanelWidth = defaults.aiCompanionPanelWidth;
    graphSettings.magneticEnabled = defaults.graphMagneticEnabled;
    autoSelectFileEnabled = defaults.autoSelectFileEnabled;
    showUnsupportedFolderFiles = defaults.showUnsupportedFolderFiles;
    syncScrollingEnabled = defaults.syncScrollingEnabled;

    document.documentElement.setAttribute("data-theme", defaults.theme);
    if (typeof applySelectedAppTheme === "function") {
      applySelectedAppTheme(defaults);
    }
    if (typeof applySidebarRailStylePreference === "function") {
      applySidebarRailStylePreference(defaults);
    }
    if (typeof applyAppHeaderSpacingPreference === "function") {
      applyAppHeaderSpacingPreference(defaults);
    }
    if (typeof applyTabStylePreference === "function") {
      applyTabStylePreference(defaults);
    }
    updateThemeButtonLabels(defaults.theme);
    resetSidebarDropzoneLayoutToDefault();
    setSidebarVisible(defaults.sidebarVisible, false, false);
    setStatusBarVisible(defaults.statusBarVisible !== false, false);
    outlinePanel?.setVisible?.(defaults.outlinePanelVisible !== false, { persist: false });
    sidebarLowerPanelTabs?.activate?.(defaults.sidebarLowerPanelActiveTab || "outline", { persist: false });
    updateDropzoneToggleButtons();
    applySidebarWidth(DEFAULT_SIDEBAR_WIDTH, false);
    applyAiCompanionPanelWidth(DEFAULT_AI_COMPANION_PANEL_WIDTH, false);
    setViewMode(defaults.viewMode, false);
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeToolbarState();
    renderFilteredFolderTree();
    renderMarkdown();
    scheduleGlobalProfileWrite();

    if (shouldNotify) window.alert("Preferences restored to defaults.");
    return true;
  }

  function applyGlobalPreferences(state = loadGlobalState()) {
    currentFolderSortMode = getValidFolderSortMode(state.folderSortMode || currentFolderSortMode);
    editorWidthPercent = getClampedEditorWidthPercent(state.editorWidthPercent);
    aiCompanionPanelWidth = getClampedAiCompanionPanelWidth(state.aiCompanionPanelWidth);
    graphSettings.magneticEnabled = state.graphMagneticEnabled !== false;
    autoSelectFileEnabled = state.autoSelectFileEnabled !== false;
    showUnsupportedFolderFiles = state.showUnsupportedFolderFiles === true;
    syncScrollingEnabled = state.syncScrollingEnabled !== false;
    if (state.theme === "dark" || state.theme === "light") {
      document.documentElement.setAttribute("data-theme", state.theme);
      if (typeof applySelectedAppTheme === "function") {
        applySelectedAppTheme(state);
      }
      updateThemeButtonLabels(state.theme);
      renderMarkdown();
    }
    if (typeof applySidebarRailStylePreference === "function") {
      applySidebarRailStylePreference(state);
    }
    if (typeof applyAppHeaderSpacingPreference === "function") {
      applyAppHeaderSpacingPreference(state);
    }
    if (typeof applyTabStylePreference === "function") {
      applyTabStylePreference(state);
    }
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeSortControls();
    applySavedLayoutPreferences(state);
  }

  function applySavedLayoutPreferences(state = loadGlobalState()) {
    if (typeof applySidebarRailStylePreference === "function") {
      applySidebarRailStylePreference(state);
    }
    if (typeof applyAppHeaderSpacingPreference === "function") {
      applyAppHeaderSpacingPreference(state);
    }
    if (typeof applyTabStylePreference === "function") {
      applyTabStylePreference(state);
    }
    applySidebarWidth(state.sidebarWidth, false);
    applyAiCompanionPanelWidth(state.aiCompanionPanelWidth, false);
    applySidebarDropzoneHeight(state.sidebarDropzoneHeight, false);
    if (state.sidebarDropzoneVisible === false) {
      hideSidebarDropzone(false);
    } else {
      showSidebarDropzone(false);
    }
    setSidebarVisible(state.sidebarVisible !== false, false);
    setStatusBarVisible(state.statusBarVisible !== false, false);
  }



      Object.assign(api, {
        getClampedEditorWidthPercent,
        getClampedAiCompanionPanelWidth,
        resetSidebarDropzoneLayoutToDefault,
        restoreDefaultPreferences,
        applyGlobalPreferences,
        applySavedLayoutPreferences
      });
    }

    return api;
  };
})(window);
