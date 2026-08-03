(function(global) {
  "use strict";

  const SEARCH_RESULTS_TAB_ID = "search-results";
  const DEFAULT_TAB_ORDER = [SEARCH_RESULTS_TAB_ID];

  /**
   * Manage the shared bottom panel tabs used by search results and terminals.
   * @param {object} app - Application module registry.
   * @param {object} deps - DOM and persistence dependencies.
   * @returns {object} Bottom panel tab API.
   */
  function registerMarkdownViewerBottomPanelTabs(app, deps = {}) {
    const panel = deps.panel || document.getElementById("find-in-files-results-panel");
    const tabList = deps.tabList || document.getElementById("bottom-panel-tab-list");
    const contentHost = deps.contentHost || document.getElementById("bottom-panel-content-host");
    const searchResultsView = deps.searchResultsView || document.getElementById("bottom-panel-search-results");
    const closeButton = deps.closeButton || document.getElementById("find-in-files-results-close");
    const tabHeader = deps.tabHeader || tabList?.parentElement;
    const stateKey = "bottomPanel";
    const tabs = new Map();
    let activeTabId = SEARCH_RESULTS_TAB_ID;
    let draggedTabId = null;
    let tabContextMenu = null;
    let tabContextTargetId = null;
    let tabScrollbarOverlay = null;
    let initialized = false;
    const maximizeState = {
      active: false,
      aiCompanionWasVisible: false
    };

    function getFeatureState() {
      return deps.loadGlobalState?.()[stateKey] || {};
    }

    function saveFeatureState(patch) {
      deps.saveGlobalState?.({ [stateKey]: { ...getFeatureState(), ...patch } });
    }

    function getSavedTabOrder() {
      const savedOrder = Array.isArray(getFeatureState().tabOrder) ? getFeatureState().tabOrder : [];
      return savedOrder.filter((id) => id === SEARCH_RESULTS_TAB_ID || tabs.has(id));
    }

    function getOrderedTabIds() {
      const savedOrder = getSavedTabOrder();
      const allIds = Array.from(tabs.keys());
      const ordered = [...savedOrder, ...allIds.filter((id) => !savedOrder.includes(id))];
      return ordered.length ? ordered : DEFAULT_TAB_ORDER;
    }

    function persistCurrentTabOrder() {
      saveFeatureState({ tabOrder: getOrderedTabIds() });
    }

    function getPanelHeight() {
      const state = deps.loadGlobalState?.() || {};
      const savedHeight = Number(state[stateKey]?.panelHeight ?? state.findInFiles?.panelHeight);
      return Number.isFinite(savedHeight) && savedHeight >= 120 ? savedHeight : null;
    }

    function setPanelHeight(height) {
      const nextHeight = Number(height);
      if (!Number.isFinite(nextHeight) || nextHeight < 120) return false;
      if (panel) panel.style.height = `${nextHeight}px`;
      saveFeatureState({ panelHeight: nextHeight });
      return true;
    }

    function applySavedPanelHeight() {
      const savedHeight = getPanelHeight();
      if (panel && savedHeight !== null) panel.style.height = `${savedHeight}px`;
    }

    function getSavedActiveTabId() {
      return String(getFeatureState().activeTabId || SEARCH_RESULTS_TAB_ID);
    }

    function isSavedVisible() {
      return getFeatureState().visible === true;
    }

    function isAiCompanionVisible() {
      return document.body?.classList?.contains?.("ai-companion-open") === true;
    }

    /** Expand the active lower-panel tab into the editor workspace. */
    function maximizeBottomPanel() {
      if (maximizeState.active) return;
      maximizeState.active = true;
      maximizeState.aiCompanionWasVisible = isAiCompanionVisible();
      document.body?.classList?.add?.("bottom-panel-maximized");
      deps.setSidebarVisible?.(false, false, false);
      deps.getAiCompanionPanel?.()?.setOpen?.(false, { persist: false });
    }

    /** Restore the editor workspace after lower-panel maximization. */
    function restoreBottomPanel() {
      if (!maximizeState.active) return;
      const aiCompanionWasVisible = maximizeState.aiCompanionWasVisible;
      maximizeState.active = false;
      maximizeState.aiCompanionWasVisible = false;
      document.body?.classList?.remove?.("bottom-panel-maximized");
      deps.setSidebarVisible?.(true, false, false);
      deps.getAiCompanionPanel?.()?.setOpen?.(aiCompanionWasVisible, { persist: false });
      applySavedPanelHeight();
    }

    /** Toggle workspace maximization for a lower-panel tab. */
    function toggleBottomPanelMaximized(tabId) {
      activateTab(tabId);
      if (maximizeState.active) restoreBottomPanel();
      else maximizeBottomPanel();
    }

    function showPanel(options = {}) {
      if (!panel) return;
      applySavedPanelHeight();
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      if (options.persist !== false) saveFeatureState({ visible: true });
    }

    function hidePanel(options = {}) {
      if (!panel) return;
      restoreBottomPanel();
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      if (options.persist !== false) saveFeatureState({ visible: false });
    }

    function isPanelVisible() {
      return !!panel && panel.hidden !== true;
    }

    function togglePanel(tabId = activeTabId) {
      if (!panel) return;
      if (panel.hidden) {
        activateTab(tabId || SEARCH_RESULTS_TAB_ID);
      } else {
        hidePanel();
      }
    }

    function setViewActive(tab, isActive) {
      if (!tab?.view) return;
      tab.view.hidden = !isActive;
      tab.view.setAttribute("aria-hidden", isActive ? "false" : "true");
      tab.view.classList.toggle("active", isActive);
    }

    function activateTab(tabId = SEARCH_RESULTS_TAB_ID) {
      const normalizedTabId = tabs.has(tabId) ? tabId : SEARCH_RESULTS_TAB_ID;
      activeTabId = normalizedTabId;
      tabs.forEach((tab, id) => setViewActive(tab, id === normalizedTabId));
      renderTabs();
      saveFeatureState({ activeTabId: normalizedTabId });
      showPanel();
      const tab = tabs.get(normalizedTabId);
      tab?.onActivate?.(tab);
      return tab || null;
    }

    function getClosableTabIds() {
      return getOrderedTabIds().filter((tabId) => tabs.has(tabId) && !tabs.get(tabId).permanent);
    }

    /** Close the requested non-permanent lower-panel tabs as one operation. */
    function closeTabs(tabIds) {
      const closableTabIds = new Set(getClosableTabIds());
      const requestedTabIds = Array.from(new Set(tabIds || [])).filter((tabId) => closableTabIds.has(tabId));
      if (!requestedTabIds.length) return false;
      requestedTabIds.forEach((tabId) => {
        const tab = tabs.get(tabId);
        tab.onClose?.(tab);
        tab.view?.remove?.();
        tabs.delete(tabId);
      });
      if (!tabs.has(activeTabId)) activeTabId = SEARCH_RESULTS_TAB_ID;
      persistCurrentTabOrder();
      activateTab(activeTabId);
      return true;
    }

    function closeTab(tabId) {
      return closeTabs([tabId]);
    }

    function closeOtherTabs(tabId) {
      return closeTabs(getClosableTabIds().filter((candidateId) => candidateId !== tabId));
    }

    function setTabContextMenuActionEnabled(menu, action, enabled) {
      const button = menu.querySelector(`[data-action="${action}"]`);
      if (!button) return;
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", enabled ? "false" : "true");
      button.classList.toggle("disabled", !enabled);
    }

    function hideTabContextMenu() {
      tabContextMenu?.classList.add("hidden");
      tabContextTargetId = null;
    }

    function positionTabContextMenu(menu, event) {
      const margin = 8;
      const appZoomFactor = Math.max(0.01, Number(document.documentElement?.dataset?.appZoomPercent || 100) / 100);
      menu.style.left = "0px";
      menu.style.top = "0px";
      const bounds = menu.getBoundingClientRect();
      const viewportLeft = Math.min(Math.max(margin, event.clientX), Math.max(margin, window.innerWidth - bounds.width - margin));
      const viewportTop = Math.min(Math.max(margin, event.clientY), Math.max(margin, window.innerHeight - bounds.height - margin));
      menu.style.left = `${viewportLeft / appZoomFactor}px`;
      menu.style.top = `${viewportTop / appZoomFactor}px`;
    }

    function ensureTabContextMenu() {
      if (tabContextMenu) return tabContextMenu;
      tabContextMenu = document.createElement("div");
      tabContextMenu.className = "graph-context-menu tab-context-menu bottom-panel-tab-context-menu hidden";
      tabContextMenu.setAttribute("role", "menu");
      tabContextMenu.innerHTML =
        '<button class="graph-context-menu-item graph-context-menu-item-danger bottom-panel-tab-context-action" type="button" role="menuitem" data-action="close"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close</span></button>' +
        '<button class="graph-context-menu-item graph-context-menu-item-danger bottom-panel-tab-context-action" type="button" role="menuitem" data-action="close-others"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close others</span></button>' +
        '<button class="graph-context-menu-item graph-context-menu-item-danger bottom-panel-tab-context-action" type="button" role="menuitem" data-action="close-all"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close all</span></button>';
      tabContextMenu.addEventListener("click", (event) => {
        event.stopPropagation();
        const actionButton = event.target.closest?.(".bottom-panel-tab-context-action");
        if (!actionButton || actionButton.disabled || !tabContextTargetId) return;
        const action = actionButton.dataset.action;
        const targetTabId = tabContextTargetId;
        hideTabContextMenu();
        if (action === "close") closeTab(targetTabId);
        else if (action === "close-others") closeOtherTabs(targetTabId);
        else if (action === "close-all") hidePanel();
      });
      document.body?.appendChild(tabContextMenu);
      return tabContextMenu;
    }

    function showTabContextMenu(event, tab) {
      event.preventDefault();
      event.stopPropagation();
      tabContextTargetId = tab.id;
      const menu = ensureTabContextMenu();
      const closableTabIds = getClosableTabIds();
      setTabContextMenuActionEnabled(menu, "close", !tab.permanent);
      setTabContextMenuActionEnabled(menu, "close-others", closableTabIds.some((tabId) => tabId !== tab.id));
      setTabContextMenuActionEnabled(menu, "close-all", true);
      menu.classList.remove("hidden");
      positionTabContextMenu(menu, event);
    }

    function createTabButton(tab, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bottom-panel-tab${tab.id === activeTabId ? " active" : ""}`;
      button.dataset.bottomPanelTabId = tab.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");
      button.setAttribute("draggable", "true");
      button.title = tab.title;

      const icon = document.createElement("i");
      icon.className = `bi ${tab.icon || "bi-layout-text-window"} me-1`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "bottom-panel-tab-title";
      label.textContent = tab.title;
      button.append(icon, label);

      if (!tab.permanent) {
        const close = document.createElement("span");
        close.className = "bottom-panel-tab-close";
        close.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        close.title = "Close tab";
        close.setAttribute("aria-label", "Close tab");
        close.addEventListener("click", (event) => {
          event.stopPropagation();
          closeTab(tab.id);
        });
        button.appendChild(close);
      }

      button.addEventListener("click", () => activateTab(tab.id));
      button.addEventListener("contextmenu", (event) => showTabContextMenu(event, tab));
      button.addEventListener("dblclick", (event) => {
        if (event.target?.closest?.(".bottom-panel-tab-close")) return;
        toggleBottomPanelMaximized(tab.id);
      });
      button.addEventListener("dragstart", () => {
        draggedTabId = tab.id;
        window.setTimeout(() => button.classList.add("dragging"), 0);
      });
      button.addEventListener("dragend", () => {
        draggedTabId = null;
        button.classList.remove("dragging");
      });
      button.addEventListener("dragover", (event) => {
        event.preventDefault();
        button.classList.add("drag-over");
      });
      button.addEventListener("dragleave", () => button.classList.remove("drag-over"));
      button.addEventListener("drop", (event) => {
        event.preventDefault();
        button.classList.remove("drag-over");
        reorderTab(draggedTabId, tab.id);
      });
      button.style.order = String(index);
      return button;
    }

    function renderTabs() {
      if (!tabList) return;
      tabList.textContent = "";
      getOrderedTabIds().forEach((id, index) => {
        const tab = tabs.get(id);
        if (tab) tabList.appendChild(createTabButton(tab, index));
      });
      tabScrollbarOverlay?.update?.();
    }

    function reorderTab(fromTabId, toTabId) {
      if (!fromTabId || !toTabId || fromTabId === toTabId || !tabs.has(fromTabId) || !tabs.has(toTabId)) return false;
      const order = getOrderedTabIds();
      const fromIndex = order.indexOf(fromTabId);
      const toIndex = order.indexOf(toTabId);
      if (fromIndex < 0 || toIndex < 0) return false;
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      saveFeatureState({ tabOrder: order });
      renderTabs();
      return true;
    }

    function addTab(options = {}) {
      const id = String(options.id || "").trim();
      const view = options.view || null;
      if (!id || !view) throw new Error("Bottom panel tabs require an id and view.");
      if (!view.parentElement && contentHost) contentHost.appendChild(view);
      const tab = {
        id,
        title: String(options.title || "Panel"),
        icon: String(options.icon || "bi-layout-text-window"),
        view,
        permanent: options.permanent === true,
        onActivate: options.onActivate,
        onClose: options.onClose
      };
      tabs.set(id, tab);
      setViewActive(tab, false);
      persistCurrentTabOrder();
      renderTabs();
      if (initialized && id === getSavedActiveTabId()) {
        activeTabId = id;
        tabs.forEach((candidate, candidateId) => setViewActive(candidate, candidateId === id));
        renderTabs();
        if (isSavedVisible()) {
          showPanel({ persist: false });
          tab.onActivate?.(tab);
        }
      } else if (options.activate !== false) {
        activateTab(id);
      }
      return tab;
    }

    function initialize() {
      if (searchResultsView && !tabs.has(SEARCH_RESULTS_TAB_ID)) {
        addTab({
          id: SEARCH_RESULTS_TAB_ID,
          title: "Search Results",
          icon: "bi-search",
          view: searchResultsView,
          permanent: true,
          activate: false
        });
      }
      closeButton?.addEventListener("click", hidePanel);
      if (typeof global.createMarkdownViewerTabScrollbarOverlay === "function") {
        tabScrollbarOverlay = global.createMarkdownViewerTabScrollbarOverlay({
          tabBar: tabHeader,
          tabList,
          hideDelayMs: 1000
        });
      }
      restoreSavedPanelState();
      initialized = true;
      window.setTimeout?.(restoreSavedPanelState, 0);
    }

    function restoreSavedPanelState() {
      const savedActiveTabId = getSavedActiveTabId();
      activeTabId = tabs.has(savedActiveTabId) ? savedActiveTabId : activeTabId;
      tabs.forEach((tab, id) => setViewActive(tab, id === activeTabId));
      renderTabs();
      applySavedPanelHeight();
      if (isSavedVisible()) {
        showPanel({ persist: false });
        tabs.get(activeTabId)?.onActivate?.(tabs.get(activeTabId));
      } else {
        hidePanel({ persist: false });
      }
    }

    document.addEventListener?.("click", hideTabContextMenu);
    document.addEventListener?.("keydown", (event) => {
      if (event.key === "Escape") hideTabContextMenu();
    });
    window.addEventListener?.("blur", hideTabContextMenu);

    initialize();

    const api = {
      SEARCH_RESULTS_TAB_ID,
      addTab,
      activateTab,
      closeTab,
      hidePanel,
      showPanel,
      isPanelVisible,
      getPanelHeight,
      setPanelHeight,
      togglePanel,
      reorderTab,
      restoreSavedPanelState,
      getActiveTabId() {
        return activeTabId;
      },
      getTabOrder() {
        return getOrderedTabIds();
      },
      _test: {
        closeOtherTabs,
        getOrderedTabIds,
        reorderTab
      }
    };
    app.registerModule?.("bottomPanelTabs", api);
    return api;
  }

  global.registerMarkdownViewerBottomPanelTabs = registerMarkdownViewerBottomPanelTabs;
})(typeof window !== "undefined" ? window : globalThis);
