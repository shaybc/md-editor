(function(global) {
  "use strict";

  /** Own the enabled views and active tab in the sidebar's lower panel. */
  function registerMarkdownViewerSidebarLowerPanelTabs(app, deps = {}) {
    const host = deps.host;
    const resizer = deps.resizer;
    const tabList = deps.tabList;
    const views = new Map();
    const stateChangeListeners = new Set();
    let activeViewId = String(deps.initialActiveViewId || "outline");

    function getEnabledViews() {
      return Array.from(views.values()).filter((view) => view.enabled);
    }

    function persistActiveView() {
      deps.saveGlobalState?.({ sidebarLowerPanelActiveTab: activeViewId });
    }

    function getStateSnapshot() {
      const enabled = {};
      views.forEach((view, id) => { enabled[id] = view.enabled === true; });
      return { activeViewId, enabled };
    }

    function notifyStateChanged(reason = "state") {
      const snapshot = getStateSnapshot();
      deps.onStateChanged?.(snapshot, reason, api);
      stateChangeListeners.forEach((listener) => {
        try { listener(snapshot, reason, api); } catch (_error) { /* Lower-panel observers cannot interrupt tab state updates. */ }
      });
    }

    function sync() {
      const enabledViews = getEnabledViews();
      const hostVisible = enabledViews.length > 0;
      if (host) {
        host.style.display = hostVisible ? "" : "none";
        if (hostVisible) {
          host.style.padding = "";
          host.style.minHeight = "";
        }
      }
      if (resizer) resizer.style.display = hostVisible ? "" : "none";
      if (tabList) tabList.hidden = !hostVisible;

      if (!enabledViews.some((view) => view.id === activeViewId)) {
        activeViewId = enabledViews[0]?.id || "";
      }

      views.forEach((view) => {
        const isActive = view.enabled && view.id === activeViewId;
        if (view.panel) view.panel.hidden = !isActive;
        if (view.tab) {
          view.tab.hidden = !view.enabled;
          view.tab.classList.toggle("active", isActive);
          view.tab.setAttribute("aria-selected", isActive ? "true" : "false");
          view.tab.tabIndex = isActive ? 0 : -1;
        }
      });

      if (hostVisible) deps.restoreHeight?.();
      return activeViewId;
    }

    /** Register one independently toggleable lower-sidebar view. */
    function registerView(definition = {}) {
      const id = String(definition.id || "").trim();
      if (!id || !definition.panel) return null;
      const view = {
        id,
        panel: definition.panel,
        tab: definition.tab || null,
        enabled: definition.enabled !== false
      };
      views.set(id, view);
      view.tab?.addEventListener("click", () => activate(id));
      sync();
      return view;
    }

    /** Activate an enabled lower-sidebar view. */
    function activate(id, options = {}) {
      const view = views.get(String(id || ""));
      if (!view?.enabled) return false;
      activeViewId = view.id;
      sync();
      if (options.persist !== false) persistActiveView();
      notifyStateChanged("active-view");
      return true;
    }

    /** Enable or disable a registered lower-sidebar view. */
    function setEnabled(id, enabled, options = {}) {
      const view = views.get(String(id || ""));
      if (!view) return false;
      view.enabled = enabled !== false;
      if (view.enabled && options.activate !== false) activeViewId = view.id;
      sync();
      if (options.stateKey && options.persist !== false) {
        deps.saveGlobalState?.({ [options.stateKey]: view.enabled });
      }
      if (options.persist !== false && options.persistActive !== false && activeViewId) persistActiveView();
      notifyStateChanged("enabled-view");
      return view.enabled;
    }

    function isEnabled(id) {
      return views.get(String(id || ""))?.enabled === true;
    }

    const api = {
      activate,
      addStateChangeListener(listener) {
        if (typeof listener !== "function") return () => {};
        stateChangeListeners.add(listener);
        return () => stateChangeListeners.delete(listener);
      },
      getActiveViewId() { return activeViewId; },
      getStateSnapshot,
      isEnabled,
      registerView,
      setEnabled,
      sync
    };
    app.registerModule?.("sidebarLowerPanelTabs", api);
    return api;
  }

  global.registerMarkdownViewerSidebarLowerPanelTabs = registerMarkdownViewerSidebarLowerPanelTabs;
})(typeof window !== "undefined" ? window : globalThis);
