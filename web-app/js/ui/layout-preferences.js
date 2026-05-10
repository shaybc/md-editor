(function(global) {
  global.registerMarkdownViewerLayoutPreferences = function registerMarkdownViewerLayoutPreferences(app, deps) {
    const api = {};

    with (deps) {
  function getClampedEditorWidthPercent(percent) {
    const numericPercent = Number.parseFloat(percent);
    const fallbackPercent = Number.isFinite(numericPercent) ? numericPercent : 50;
    return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, fallbackPercent));
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

  function restoreDefaultPreferences() {
    const confirmed = window.confirm(
      "Restore default preferences? This resets saved view, theme, layout, graph, folder, sync, and tag preferences. Open documents and recent items are not removed."
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem(GLOBAL_STATE_KEY);
    } catch (error) {
      console.warn("Failed to clear saved preferences:", error);
    }

    const defaults = getDefaultGlobalState();
    currentFolderSortMode = defaults.folderSortMode;
    editorWidthPercent = defaults.editorWidthPercent;
    graphSettings.magneticEnabled = defaults.graphMagneticEnabled;
    autoSelectFileEnabled = defaults.autoSelectFileEnabled;
    showUnsupportedFolderFiles = defaults.showUnsupportedFolderFiles;
    syncScrollingEnabled = defaults.syncScrollingEnabled;

    document.documentElement.setAttribute("data-theme", defaults.theme);
    updateThemeButtonLabels(defaults.theme);
    resetSidebarDropzoneLayoutToDefault();
    setSidebarVisible(defaults.sidebarVisible, false, false);
    updateDropzoneToggleButtons();
    applySidebarWidth(DEFAULT_SIDEBAR_WIDTH, false);
    setViewMode(defaults.viewMode, false);
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeToolbarState();
    renderFilteredFolderTree();
    renderMarkdown();
    scheduleGlobalProfileWrite();

    window.alert("Preferences restored to defaults.");
  }

  function applyGlobalPreferences(state = loadGlobalState()) {
    currentFolderSortMode = getValidFolderSortMode(state.folderSortMode || currentFolderSortMode);
    editorWidthPercent = getClampedEditorWidthPercent(state.editorWidthPercent);
    graphSettings.magneticEnabled = state.graphMagneticEnabled !== false;
    autoSelectFileEnabled = state.autoSelectFileEnabled !== false;
    showUnsupportedFolderFiles = state.showUnsupportedFolderFiles === true;
    syncScrollingEnabled = state.syncScrollingEnabled !== false;
    if (state.theme === "dark" || state.theme === "light") {
      document.documentElement.setAttribute("data-theme", state.theme);
      updateThemeButtonLabels(state.theme);
      renderMarkdown();
    }
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeSortControls();
    applySavedLayoutPreferences(state);
  }

  function applySavedLayoutPreferences(state = loadGlobalState()) {
    applySidebarWidth(state.sidebarWidth, false);
    applySidebarDropzoneHeight(state.sidebarDropzoneHeight, false);
    if (state.sidebarDropzoneVisible === false) {
      hideSidebarDropzone(false);
    } else {
      showSidebarDropzone(false);
    }
    setSidebarVisible(state.sidebarVisible !== false, false);
  }



      Object.assign(api, {
        getClampedEditorWidthPercent,
        resetSidebarDropzoneLayoutToDefault,
        restoreDefaultPreferences,
        applyGlobalPreferences,
        applySavedLayoutPreferences
      });
    }

    return api;
  };
})(window);
