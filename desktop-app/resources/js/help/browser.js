/**
 * Single-tab browser for bundled MD-Editor documentation.
 */
(function(global) {
  global.registerMarkdownViewerHelpBrowser = function registerMarkdownViewerHelpBrowser(app, deps) {
    const api = {};
    const documentRef = deps.document || global.document;
    let navigationRequestId = 0;
    let contextMenu = null;
    let contextBackButton = null;
    let contextForwardButton = null;

    function splitDocumentationTarget(rawTarget) {
      const value = String(rawTarget || "").trim();
      const hashIndex = value.indexOf("#");
      return {
        path: hashIndex >= 0 ? value.slice(0, hashIndex) : value,
        hash: hashIndex >= 0 ? value.slice(hashIndex + 1) : ""
      };
    }

    function normalizeDocumentationRoute(path) {
      const value = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!value) return "";
      try {
        return new URL(value, "https://md-editor.local/").pathname.replace(/^\/+/, "");
      } catch (_) {
        return "";
      }
    }

    function canonicalizeDocumentationSource(path) {
      const normalized = normalizeDocumentationRoute(path);
      if (normalized.startsWith("help/")) return `desktop-app/${normalized}`;
      return normalized;
    }

    function isBundledDocumentationRoute(route) {
      const normalized = normalizeDocumentationRoute(route);
      return normalized === "README.md"
        || normalized === "LICENSE"
        || normalized.startsWith("desktop-app/help/");
    }

    function resolveDocumentationEntry(rawTarget, sourceRoute) {
      const target = splitDocumentationTarget(rawTarget);
      const canonicalSource = canonicalizeDocumentationSource(sourceRoute);
      if (!canonicalSource || !isBundledDocumentationRoute(canonicalSource)) return null;

      const sourceUrl = new URL(canonicalSource, "https://md-editor.local/");
      const route = target.path
        ? new URL(target.path.replace(/\\/g, "/"), sourceUrl).pathname.replace(/^\/+/, "")
        : canonicalSource;
      const normalizedRoute = normalizeDocumentationRoute(route);
      if (!isBundledDocumentationRoute(normalizedRoute)) return null;
      return { route: normalizedRoute, hash: target.hash };
    }

    function getEntryKey(entry) {
      return `${entry?.route || ""}#${entry?.hash || ""}`;
    }

    function getRuntimeLinkBasePath(route) {
      if (route.startsWith("desktop-app/help/")) return route.slice("desktop-app/".length);
      return route;
    }

    function scrollToDocumentationEntry(entry) {
      if (entry?.hash) {
        deps.scrollMarkdownPreviewToHash(entry.hash);
        return;
      }
      const previewPane = deps.getActivePreviewPane?.();
      if (previewPane) previewPane.scrollTop = 0;
    }

    function sanitizeHistoryState(state, fallbackRoute) {
      const entries = (Array.isArray(state?.entries) ? state.entries : [])
        .map((entry) => ({
          route: normalizeDocumentationRoute(entry?.route),
          hash: String(entry?.hash || "")
        }))
        .filter((entry) => isBundledDocumentationRoute(entry.route));
      if (!entries.length && isBundledDocumentationRoute(fallbackRoute)) {
        entries.push({ route: normalizeDocumentationRoute(fallbackRoute), hash: "" });
      }
      const requestedIndex = Number(state?.index);
      const index = entries.length
        ? Math.min(Math.max(Number.isInteger(requestedIndex) ? requestedIndex : entries.length - 1, 0), entries.length - 1)
        : -1;
      return { entries, index };
    }

    function getCurrentEntry(tab) {
      const state = tab?.helpBrowser;
      return state && state.index >= 0 ? state.entries[state.index] || null : null;
    }

    function isLegacyHelpTab(tab) {
      const source = canonicalizeDocumentationSource(tab?.linkBasePath || "");
      return tab?.type !== "graph"
        && tab?.title === "Help"
        && isBundledDocumentationRoute(source);
    }

    function isHelpTab(tab) {
      return !!tab?.helpBrowser || isLegacyHelpTab(tab);
    }

    function ensureHelpState(tab) {
      if (!tab) return null;
      const fallbackRoute = canonicalizeDocumentationSource(tab.linkBasePath || "help/user/index.md");
      tab.helpBrowser = sanitizeHistoryState(tab.helpBrowser, fallbackRoute);
      return tab.helpBrowser;
    }

    function findHelpTab() {
      return (deps.tabs || []).find(isHelpTab) || null;
    }

    function getActiveTab() {
      return (deps.tabs || []).find((tab) => tab?.id === deps.activeTabId) || null;
    }

    function canMoveHistory(tab, offset) {
      if (!isHelpTab(tab)) return false;
      const state = ensureHelpState(tab);
      const targetIndex = state.index + offset;
      return targetIndex >= 0 && targetIndex < state.entries.length;
    }

    function mountToolbarInActivePreview(tab) {
      if (!isHelpTab(tab) || !deps.toolbar) return;
      const previewPane = deps.getActivePreviewPane?.();
      if (previewPane && deps.toolbar.parentElement !== previewPane) {
        previewPane.insertBefore(deps.toolbar, previewPane.firstChild);
      }
    }

    function updateToolbar(tab = getActiveTab()) {
      const toolbar = deps.toolbar;
      const helpTabIsActive = isHelpTab(tab);
      if (helpTabIsActive) mountToolbarInActivePreview(tab);
      if (toolbar) {
        toolbar.hidden = !helpTabIsActive;
        toolbar.setAttribute("aria-hidden", helpTabIsActive ? "false" : "true");
      }
      const state = helpTabIsActive ? ensureHelpState(tab) : null;
      if (deps.backButton) deps.backButton.disabled = !state || state.index <= 0;
      if (deps.forwardButton) deps.forwardButton.disabled = !state || state.index >= state.entries.length - 1;
      if (contextBackButton) contextBackButton.disabled = !state || state.index <= 0;
      if (contextForwardButton) contextForwardButton.disabled = !state || state.index >= state.entries.length - 1;
    }

    function hideContextMenu() {
      contextMenu?.classList.add("hidden");
    }

    function positionContextMenu(event) {
      if (!contextMenu) return;
      const margin = 8;
      contextMenu.style.left = "0px";
      contextMenu.style.top = "0px";
      contextMenu.classList.remove("hidden");
      const rect = contextMenu.getBoundingClientRect();
      const left = Math.min(Math.max(margin, event.clientX), Math.max(margin, global.innerWidth - rect.width - margin));
      const top = Math.min(Math.max(margin, event.clientY), Math.max(margin, global.innerHeight - rect.height - margin));
      contextMenu.style.left = `${left}px`;
      contextMenu.style.top = `${top}px`;
    }

    function createContextMenuButton(label, iconClass, offset) {
      const button = documentRef.createElement("button");
      button.className = "graph-context-menu-item";
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<i class="bi ${iconClass}" aria-hidden="true"></i><span class="graph-context-menu-item-label">${label}</span>`;
      button.addEventListener("click", function(event) {
        event.stopPropagation();
        hideContextMenu();
        void moveHistory(offset);
      });
      return button;
    }

    function ensureContextMenu() {
      if (contextMenu || !documentRef?.body) return contextMenu;
      contextMenu = documentRef.createElement("div");
      contextMenu.className = "graph-context-menu help-browser-context-menu hidden";
      contextMenu.setAttribute("role", "menu");
      contextBackButton = createContextMenuButton("Back", "bi-arrow-left", -1);
      contextForwardButton = createContextMenuButton("Forward", "bi-arrow-right", 1);
      contextMenu.append(contextBackButton, contextForwardButton);
      contextMenu.addEventListener("contextmenu", function(event) {
        event.preventDefault();
        event.stopPropagation();
      });
      documentRef.body.appendChild(contextMenu);
      return contextMenu;
    }

    function handleContextMenu(event) {
      const tab = getActiveTab();
      const previewPane = deps.getActivePreviewPane?.();
      if (!isHelpTab(tab) || !previewPane?.contains?.(event.target)) {
        hideContextMenu();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      ensureContextMenu();
      updateToolbar(tab);
      positionContextMenu(event);
    }

    function isEditableKeyboardTarget(target) {
      return !!target?.closest?.("input, textarea, select, [contenteditable='true'], .cm-editor");
    }

    function handleNavigationKeydown(event) {
      const tab = getActiveTab();
      if (!isHelpTab(tab)) return;
      if (event.key === "Escape") {
        hideContextMenu();
        return;
      }
      if (isEditableKeyboardTarget(event.target)) return;

      const isBackspace = event.key === "Backspace" && !event.ctrlKey && !event.altKey && !event.metaKey;
      const isBackShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "ArrowLeft";
      const isForwardShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "ArrowRight";
      if (!isBackspace && !isBackShortcut && !isForwardShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      hideContextMenu();
      const offset = isForwardShortcut ? 1 : -1;
      if (canMoveHistory(tab, offset)) void moveHistory(offset);
    }

    async function loadDocumentation(entry) {
      if (entry.route === "README.md") {
        return deps.normalizeBundledReadmeMarkdown(await deps.fetchReadmeMarkdown());
      }
      if (entry.route === "LICENSE") {
        return deps.fetchLicenseMarkdown();
      }
      return deps.fetchBundledWikiMarkdown(getRuntimeLinkBasePath(entry.route));
    }

    function applyHistoryNavigation(state, entry, options = {}) {
      if (Number.isInteger(options.targetIndex)) {
        state.index = options.targetIndex;
        return;
      }
      if (options.replace === true) {
        state.entries[state.index] = entry;
        return;
      }
      state.entries = state.entries.slice(0, state.index + 1);
      state.entries.push(entry);
      state.index = state.entries.length - 1;
    }

    function displayDocumentation(tab, entry, markdown) {
      tab.title = "Help";
      tab.content = String(markdown || "");
      tab.savedContent = tab.content;
      tab.viewMode = "preview";
      tab.linkBasePath = getRuntimeLinkBasePath(entry.route);
      tab.helpBrowserLoadedRoute = entry.route;
      deps.setActiveEditorContent(tab.content);
      deps.renderMarkdown({ reason: "help-browser-navigation" });
      deps.renderTabBar(deps.tabs, deps.activeTabId);
      deps.saveTabsToStorage(deps.tabs);
      updateToolbar(tab);
      scrollToDocumentationEntry(entry);
    }

    async function navigateHelpTab(tab, entry, options = {}) {
      if (!tab || !entry || !isBundledDocumentationRoute(entry.route)) return false;
      const state = ensureHelpState(tab);
      const currentEntry = getCurrentEntry(tab);
      const sameEntry = getEntryKey(currentEntry) === getEntryKey(entry);
      const sameLoadedRoute = tab.helpBrowserLoadedRoute === entry.route;

      if (sameEntry && sameLoadedRoute && options.force !== true) {
        scrollToDocumentationEntry(entry);
        updateToolbar(tab);
        return true;
      }

      if (sameLoadedRoute && currentEntry?.route === entry.route && options.force !== true) {
        applyHistoryNavigation(state, entry, options);
        deps.saveTabsToStorage(deps.tabs);
        updateToolbar(tab);
        scrollToDocumentationEntry(entry);
        return true;
      }

      const requestId = ++navigationRequestId;
      try {
        const markdown = await loadDocumentation(entry);
        if (requestId !== navigationRequestId || deps.activeTabId !== tab.id) return false;
        if (!sameEntry || Number.isInteger(options.targetIndex)) {
          applyHistoryNavigation(state, entry, options);
        }
        displayDocumentation(tab, entry, markdown);
        return true;
      } catch (error) {
        console.error("Failed to open bundled documentation:", error);
        deps.alert("Unable to open this help page.");
        updateToolbar(tab);
        return false;
      }
    }

    async function createHelpTab(entry) {
      try {
        const markdown = await loadDocumentation(entry);
        const tab = deps.newTab(markdown, "Help", {
          viewMode: "preview",
          linkBasePath: getRuntimeLinkBasePath(entry.route)
        });
        if (!tab) return null;
        tab.helpBrowser = { entries: [entry], index: 0 };
        tab.helpBrowserLoadedRoute = entry.route;
        tab.savedContent = tab.content;
        deps.saveTabsToStorage(deps.tabs);
        updateToolbar(tab);
        scrollToDocumentationEntry(entry);
        return tab;
      } catch (error) {
        console.error("Failed to open bundled documentation:", error);
        deps.alert("Unable to open the help file.");
        return null;
      }
    }

    async function openEntry(entry) {
      const helpTab = findHelpTab();
      if (!helpTab) return !!(await createHelpTab(entry));
      ensureHelpState(helpTab);
      deps.switchTab(helpTab.id);
      return navigateHelpTab(helpTab, entry);
    }

    /**
     * Open the bundled help home in the single reusable Help tab.
     * @returns {Promise<boolean>} Whether the page was opened.
     */
    async function openHome() {
      return openEntry({ route: "desktop-app/help/user/index.md", hash: "" });
    }

    /**
     * Route a bundled Markdown target through the Help browser when applicable.
     * @param {string} rawTarget Relative Markdown target selected in the preview.
     * @returns {boolean} Whether the Help browser accepted the target.
     */
    function handleLink(rawTarget) {
      const activeTab = getActiveTab();
      if (isHelpTab(activeTab)) ensureHelpState(activeTab);
      const currentEntry = isHelpTab(activeTab) ? getCurrentEntry(activeTab) : null;
      const sourceRoute = currentEntry?.route || canonicalizeDocumentationSource(activeTab?.linkBasePath || "");
      const entry = resolveDocumentationEntry(rawTarget, sourceRoute);
      if (!entry) return false;
      void (isHelpTab(activeTab) ? navigateHelpTab(activeTab, entry) : openEntry(entry));
      return true;
    }

    async function moveHistory(offset) {
      const tab = getActiveTab();
      if (!isHelpTab(tab)) return false;
      const state = ensureHelpState(tab);
      const targetIndex = state.index + offset;
      if (targetIndex < 0 || targetIndex >= state.entries.length) return false;
      return navigateHelpTab(tab, state.entries[targetIndex], { targetIndex });
    }

    /**
     * Refresh Help browser chrome and reload restored Help content when needed.
     * @param {object|null} tab Newly active application tab.
     * @returns {Promise<void>}
     */
    async function activateTab(tab) {
      updateToolbar(tab);
      if (!isHelpTab(tab)) return;
      const state = ensureHelpState(tab);
      const entry = getCurrentEntry(tab);
      if (!entry || tab.helpBrowserLoadedRoute === entry.route) return;
      await navigateHelpTab(tab, entry, { targetIndex: state.index, force: true });
    }

    /**
     * Bind the Back and Forward controls once during application startup.
     * @returns {void}
     */
    function init() {
      deps.backButton?.addEventListener("click", () => void moveHistory(-1));
      deps.forwardButton?.addEventListener("click", () => void moveHistory(1));
      documentRef?.addEventListener?.("contextmenu", handleContextMenu, true);
      documentRef?.addEventListener?.("keydown", handleNavigationKeydown, true);
      documentRef?.addEventListener?.("click", hideContextMenu);
      global.addEventListener?.("blur", hideContextMenu);
      updateToolbar(null);
    }

    Object.assign(api, {
      activateTab,
      handleLink,
      init,
      openHome
    });
    app.registerModule("helpBrowser", api);
    return api;
  };
})(window);
