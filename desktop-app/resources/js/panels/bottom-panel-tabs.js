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
    const panel = Object.prototype.hasOwnProperty.call(deps, "panel") ? deps.panel : document.getElementById("find-in-files-results-panel");
    const tabList = Object.prototype.hasOwnProperty.call(deps, "tabList") ? deps.tabList : document.getElementById("bottom-panel-tab-list");
    const contentHost = Object.prototype.hasOwnProperty.call(deps, "contentHost") ? deps.contentHost : document.getElementById("bottom-panel-content-host");
    const searchResultsView = Object.prototype.hasOwnProperty.call(deps, "searchResultsView") ? deps.searchResultsView : document.getElementById("bottom-panel-search-results");
    const closeButton = Object.prototype.hasOwnProperty.call(deps, "closeButton") ? deps.closeButton : document.getElementById("find-in-files-results-close");
    const tabHeader = deps.tabHeader || tabList?.parentElement;
    const defaultTabId = String(deps.defaultTabId || SEARCH_RESULTS_TAB_ID);
    const defaultTabOrder = Array.isArray(deps.defaultTabOrder) ? deps.defaultTabOrder.map(String) : (defaultTabId ? [defaultTabId] : DEFAULT_TAB_ORDER);
    const stateKey = String(deps.stateKey || "bottomPanel");
    const moduleName = deps.moduleName === false ? "" : String(deps.moduleName || "bottomPanelTabs");
    const panelHeightEnabled = deps.panelHeight !== false;
    const maximizeEnabled = deps.maximize !== false;
    const maximizeClassName = String(deps.maximizeClassName || "bottom-panel-maximized");
    const closeAllAction = String(deps.closeAllAction || "hide");
    const tabs = new Map();
    const stateChangeListeners = new Set();
    const dockTransfer = { dockId: String(deps.dockId || moduleName || stateKey), dragGroup: "", getTransferData: null, canAcceptExternalTabDrop: null, onExternalTabDrop: null };
    let activeTabId = defaultTabId;
    let draggedTabId = null;
    let api = null;
    let tabContextMenu = null;
    let tabContextTargetId = null;
    let tabScrollbarOverlay = null;
    let initialized = false;
    const maximizeState = {
      active: false,
      aiCompanionWasVisible: false
    };
    function setDockTransfer(options = {}) {
      dockTransfer.dockId = String(options.dockId || dockTransfer.dockId || moduleName || stateKey);
      dockTransfer.dragGroup = options.dragGroup ? String(options.dragGroup) : "";
      dockTransfer.getTransferData = typeof options.getTransferData === "function" ? options.getTransferData : null;
      dockTransfer.canAcceptExternalTabDrop = typeof options.canAcceptExternalTabDrop === "function" ? options.canAcceptExternalTabDrop : null;
      dockTransfer.onExternalTabDrop = typeof options.onExternalTabDrop === "function" ? options.onExternalTabDrop : null;
    }

    setDockTransfer(deps.dockTransfer || {});


    function getFeatureState() {
      return deps.loadGlobalState?.()[stateKey] || {};
    }

    function getStateSnapshot() {
      return { tabOrder: getOrderedTabIds(), activeTabId, visible: isPanelVisible() };
    }

    function notifyStateChanged(reason = "state") {
      if (!api) return;
      const snapshot = getStateSnapshot();
      deps.onStateChanged?.(snapshot, reason, api);
      stateChangeListeners.forEach((listener) => {
        try { listener(snapshot, reason, api); } catch (_error) { /* Tab observers cannot interrupt tab state updates. */ }
      });
    }

    function saveFeatureState(patch, reason = "state") {
      deps.saveGlobalState?.({ [stateKey]: { ...getFeatureState(), ...patch } });
      notifyStateChanged(reason);
    }

    function getSavedTabOrder() {
      const savedOrder = Array.isArray(getFeatureState().tabOrder) ? getFeatureState().tabOrder : [];
      return savedOrder.map(String).filter((id) => tabs.has(id));
    }

    function getOrderedTabIds() {
      const savedOrder = getSavedTabOrder();
      const allIds = Array.from(tabs.keys());
      const ordered = [...savedOrder, ...allIds.filter((id) => !savedOrder.includes(id))];
      return ordered.length ? ordered : defaultTabOrder.filter((id) => tabs.has(id));
    }

    function persistCurrentTabOrder() {
      saveFeatureState({ tabOrder: getOrderedTabIds() });
    }

    function getPanelHeight() {
      if (!panelHeightEnabled) return null;
      const inlineHeight = Number.parseFloat(panel?.style?.height || "");
      if (Number.isFinite(inlineHeight) && inlineHeight >= 120) return inlineHeight;
      const measuredHeight = Number(panel?.getBoundingClientRect?.().height || 0);
      if (Number.isFinite(measuredHeight) && measuredHeight >= 120) return measuredHeight;
      const state = deps.loadGlobalState?.() || {};
      const savedHeight = Number(state[stateKey]?.panelHeight ?? state.findInFiles?.panelHeight);
      return Number.isFinite(savedHeight) && savedHeight >= 120 ? savedHeight : null;
    }

    function setPanelHeight(height, options = {}) {
      if (!panelHeightEnabled) return false;
      const nextHeight = Number(height);
      if (!Number.isFinite(nextHeight) || nextHeight < 120) return false;
      if (panel) panel.style.height = `${nextHeight}px`;
      if (options.persist !== false) saveFeatureState({ panelHeight: nextHeight });
      else notifyStateChanged("panel-height");
      return true;
    }

    function applySavedPanelHeight() {
      const savedHeight = getPanelHeight();
      if (panel && savedHeight !== null) panel.style.height = `${savedHeight}px`;
    }

    function getSavedActiveTabId() {
      return String(getFeatureState().activeTabId || defaultTabId);
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
      document.body?.classList?.add?.(maximizeClassName);
      deps.onMaximize?.(activeTabId, api);
      deps.setSidebarVisible?.(false, false, false);
      deps.getAiCompanionPanel?.()?.setOpen?.(false, { persist: false });
    }

    /** Restore the editor workspace after lower-panel maximization. */
    function restoreBottomPanel() {
      if (!maximizeState.active) return;
      const aiCompanionWasVisible = maximizeState.aiCompanionWasVisible;
      maximizeState.active = false;
      maximizeState.aiCompanionWasVisible = false;
      document.body?.classList?.remove?.(maximizeClassName);
      deps.onRestore?.(activeTabId, api);
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
        activateTab(tabId || defaultTabId);
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

    function getGlobalTabDrag() {
      return global.__markdownViewerPanelTabDrag || null;
    }

    function setGlobalTabDrag(value) {
      global.__markdownViewerPanelTabDrag = value || null;
    }

    function getTabTransferData(tab) {
      if (!dockTransfer.dragGroup || !dockTransfer.getTransferData) return null;
      const data = dockTransfer.getTransferData(tab, api);
      if (!data) return null;
      return Object.assign({}, data, {
        dragGroup: dockTransfer.dragGroup,
        source: api,
        sourceDockId: dockTransfer.dockId,
        sourceTabId: tab.id
      });
    }

    function canAcceptExternalTabDrop(data, beforeTabId = "") {
      if (!data || data.source === api || !dockTransfer.dragGroup || data.dragGroup !== dockTransfer.dragGroup) return false;
      if (!dockTransfer.onExternalTabDrop) return false;
      return dockTransfer.canAcceptExternalTabDrop ? dockTransfer.canAcceptExternalTabDrop(data, beforeTabId, api) !== false : true;
    }

    function handleExternalTabDrop(event, beforeTabId = "") {
      const data = getGlobalTabDrag();
      if (!canAcceptExternalTabDrop(data, beforeTabId)) return false;
      event.preventDefault();
      event.stopPropagation();
      dockTransfer.onExternalTabDrop(Object.assign({}, data, {
        target: api,
        targetDockId: dockTransfer.dockId,
        beforeTabId,
        event
      }));
      return true;
    }

    function moveExternalTabHere(data, options = {}) {
      const source = data?.source;
      const sourceTabId = String(data?.sourceTabId || data?.panelTabId || "").trim();
      if (!source || source === api || !sourceTabId || typeof source.detachTab !== "function" || tabs.has(sourceTabId)) return false;
      const tab = source.detachTab(sourceTabId);
      if (!tab?.view) return false;
      addTab({
        id: tab.id,
        title: tab.title,
        icon: tab.icon,
        view: tab.view,
        permanent: tab.permanent === true,
        buttonDataAttributes: tab.buttonDataAttributes || null,
        onActivate: tab.onActivate,
        onClose: tab.onClose,
        activate: options.activate !== false
      });
      const beforeTabId = String(options.beforeTabId || "").trim();
      if (beforeTabId && tabs.has(beforeTabId)) reorderTab(tab.id, beforeTabId);
      return true;
    }

    function activateTab(tabId = defaultTabId) {
      const fallbackTabId = tabs.has(defaultTabId) ? defaultTabId : (getOrderedTabIds()[0] || "");
      const normalizedTabId = tabs.has(tabId) ? tabId : fallbackTabId;
      if (!normalizedTabId) {
        activeTabId = "";
        tabs.forEach((tab) => setViewActive(tab, false));
        renderTabs();
        saveFeatureState({ activeTabId: "" });
        return null;
      }
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
      if (!tabs.has(activeTabId)) activeTabId = tabs.has(defaultTabId) ? defaultTabId : (getOrderedTabIds()[0] || "");
      persistCurrentTabOrder();
      if (!tabs.size) {
        activeTabId = "";
        renderTabs();
        saveFeatureState({ activeTabId: "" });
        deps.onTabsEmpty?.();
        return true;
      }
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
        else if (action === "close-all") {
          if (closeAllAction === "close") closeTabs(getClosableTabIds());
          else hidePanel();
        }
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
      Object.entries(tab.buttonDataAttributes || {}).forEach(([key, value]) => {
        button.dataset[key] = String(value);
      });
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
      if (maximizeEnabled) {
        button.addEventListener("dblclick", (event) => {
          if (event.target?.closest?.(".bottom-panel-tab-close")) return;
          toggleBottomPanelMaximized(tab.id);
        });
      }
      button.addEventListener("dragstart", (event) => {
        draggedTabId = tab.id;
        const transferData = getTabTransferData(tab);
        if (transferData) {
          setGlobalTabDrag(transferData);
          event.dataTransfer?.setData?.("application/x-md-editor-tab", JSON.stringify({ dragGroup: transferData.dragGroup, tabId: tab.id }));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        }
        window.setTimeout(() => button.classList.add("dragging"), 0);
      });
      button.addEventListener("dragend", () => {
        const transferData = getGlobalTabDrag();
        if (transferData?.source === api) setGlobalTabDrag(null);
        draggedTabId = null;
        button.classList.remove("dragging");
      });
      button.addEventListener("dragover", (event) => {
        if (draggedTabId || canAcceptExternalTabDrop(getGlobalTabDrag(), tab.id)) {
          event.preventDefault();
          button.classList.add("drag-over");
        }
      });
      button.addEventListener("dragleave", () => button.classList.remove("drag-over"));
      button.addEventListener("drop", (event) => {
        button.classList.remove("drag-over");
        if (handleExternalTabDrop(event, tab.id)) return;
        event.preventDefault();
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
    function setTabOrder(tabIds) {
      const requestedOrder = Array.from(new Set((Array.isArray(tabIds) ? tabIds : []).map((tabId) => String(tabId || "").trim()).filter((tabId) => tabId && tabs.has(tabId))));
      const currentOrder = getOrderedTabIds();
      const order = [...requestedOrder, ...currentOrder.filter((tabId) => !requestedOrder.includes(tabId))];
      if (!order.length) return false;
      saveFeatureState({ tabOrder: order });
      renderTabs();
      return true;
    }
    function detachTab(tabId) {
      const id = String(tabId || "").trim();
      const tab = tabs.get(id);
      if (!tab) return null;
      tabs.delete(id);
      setViewActive(tab, false);
      if (!tabs.has(activeTabId)) activeTabId = tabs.has(defaultTabId) ? defaultTabId : (getOrderedTabIds()[0] || "");
      persistCurrentTabOrder();
      if (!tabs.size) {
        activeTabId = "";
        renderTabs();
        saveFeatureState({ activeTabId: "" });
        deps.onTabsEmpty?.();
      } else {
        activateTab(activeTabId);
      }
      return tab;
    }


    function addTab(options = {}) {
      const id = String(options.id || "").trim();
      const view = options.view || null;
      if (!id || !view) throw new Error("Bottom panel tabs require an id and view.");
      if (contentHost && view.parentElement !== contentHost) contentHost.appendChild(view);
      const tab = {
        id,
        title: String(options.title || "Panel"),
        icon: String(options.icon || "bi-layout-text-window"),
        view,
        permanent: options.permanent === true,
        buttonDataAttributes: options.buttonDataAttributes || null,
        onActivate: options.onActivate,
        onClose: options.onClose
      };
      tabs.set(id, tab);
      setViewActive(tab, false);
      persistCurrentTabOrder();
      renderTabs();
      if (options.activate === true) {
        activateTab(id);
      } else if (initialized && id === getSavedActiveTabId()) {
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
      tabList?.addEventListener?.("dragover", (event) => {
        if (canAcceptExternalTabDrop(getGlobalTabDrag())) event.preventDefault();
      });
      tabList?.addEventListener?.("drop", (event) => {
        handleExternalTabDrop(event);
      });
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

    api = {
      SEARCH_RESULTS_TAB_ID,
      DEFAULT_TAB_ID: defaultTabId,
      addTab,
      activateTab,
      closeTab,
      detachTab,
      moveExternalTabHere,
      hidePanel,
      showPanel,
      isPanelVisible,
      getPanelHeight,
      setPanelHeight,
      togglePanel,
      reorderTab,
      setTabOrder,
      restoreSavedPanelState,
      setDockTransfer,
      hasTab(tabId) {
        return tabs.has(String(tabId || ""));
      },
      getTabCount() {
        return tabs.size;
      },
      getActiveTabId() {
        return activeTabId;
      },
      getTabOrder() {
        return getOrderedTabIds();
      },
      getStateSnapshot,
      addStateChangeListener(listener) {
        if (typeof listener !== "function") return () => {};
        stateChangeListeners.add(listener);
        return () => stateChangeListeners.delete(listener);
      },
      _test: {
        closeOtherTabs,
        getOrderedTabIds,
        reorderTab,
        setTabOrder
      }
    };
    if (moduleName) app.registerModule?.(moduleName, api);
    return api;
  }

  global.registerMarkdownViewerBottomPanelTabs = registerMarkdownViewerBottomPanelTabs;
})(typeof window !== "undefined" ? window : globalThis);
