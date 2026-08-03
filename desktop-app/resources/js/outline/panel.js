(function(global) {
  "use strict";

  const UNSUPPORTED_TAB_TYPES = new Set(["graph", "large-file", "file-preview", "diagram-editor", "file-compare", "api-client"]);
  const DOCUMENT_SYMBOL_WAIT_MS = 1000;
  const ICONS = Object.freeze({
    file: "bi-file-earmark", module: "bi-boxes", namespace: "bi-braces", package: "bi-box",
    class: "bi-c-circle", interface: "bi-diagram-2", record: "bi-card-list", type: "bi-tag",
    enum: "bi-list-ul", "enum-member": "bi-dot", field: "bi-square-fill", constructor: "bi-tools",
    method: "bi-play-fill", function: "bi-play-circle", property: "bi-key", variable: "bi-code",
    constant: "bi-lock", heading: "bi-type-h1", selector: "bi-palette", element: "bi-code-square",
    key: "bi-key-fill", label: "bi-bookmark", symbol: "bi-code-slash"
  });

  /** Render and navigate the active document's language-neutral Outline tree. */
  function registerMarkdownViewerOutlinePanel(app, deps = {}) {
    const lowerPanel = deps.lowerPanel;
    const panel = deps.panel;
    const body = deps.body;
    const closeButton = deps.closeButton;
    const toggleButtons = Array.from(deps.toggleButtons || []);
    const languages = Array.from(deps.languages || []);
    const collapsedNodeIds = new Set();
    let refreshGeneration = 0;
    let refreshTimer = null;

    function getTabPath(tab) {
      return String(tab?.sourceFilePath || tab?.sourceFileName || tab?.title || "");
    }

    function getLanguage(tab) {
      if (!tab || UNSUPPORTED_TAB_TYPES.has(tab.type)) return null;
      const path = getTabPath(tab);
      return languages.find((language) => language?.supports?.(path, tab)) || null;
    }

    function updateToggleButtons() {
      const visible = isVisible();
      const label = visible ? "Hide Outline Panel" : "Show Outline Panel";
      toggleButtons.forEach((button) => {
        const labelElement = button.querySelector?.(".outline-toggle-label");
        if (labelElement) labelElement.textContent = label;
        else button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", visible ? "false" : "true");
      });
    }

    function isVisible() {
      return lowerPanel?.isEnabled?.("outline") === true;
    }

    function cancelPendingRefresh() {
      refreshGeneration += 1;
      global.clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    /** Show or hide Outline while preserving the shared lower-sidebar host. */
    function setVisible(visible, options = {}) {
      const enabled = lowerPanel?.setEnabled?.("outline", visible !== false, {
        activate: visible !== false,
        persist: options.persist !== false,
        stateKey: "outlinePanelVisible"
      });
      updateToggleButtons();
      if (enabled) {
        void refresh(deps.getActiveTab?.());
      } else {
        cancelPendingRefresh();
      }
      return enabled;
    }

    function toggle() {
      return setVisible(!isVisible());
    }

    function supports(tab) {
      return !!getLanguage(tab);
    }

    function renderMessage(message, icon = "bi-list-nested") {
      if (!body) return;
      body.textContent = "";
      const empty = document.createElement("div");
      empty.className = "outline-empty";
      empty.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span></span>`;
      empty.querySelector("span").textContent = message;
      body.appendChild(empty);
    }

    function getPositionOffset(source, position = {}) {
      const targetLine = Math.max(0, Number(position.line) || 0);
      const targetCharacter = Math.max(0, Number(position.character) || 0);
      let offset = 0;
      for (let line = 0; line < targetLine && offset < source.length; line += 1) {
        const next = source.indexOf("\n", offset);
        offset = next < 0 ? source.length : next + 1;
      }
      return Math.min(source.length, offset + targetCharacter);
    }

    function focusNode(node) {
      const source = String(deps.getActiveEditorValue?.() || "");
      const position = node?.selectionRange?.start || node?.range?.start;
      if (!position) return;
      const offset = getPositionOffset(source, position);
      const editor = deps.getActiveEditor?.();
      editor?.setSelectionRange?.(offset, offset);
      editor?.focus?.();
    }

    function createTreeItem(node, depth) {
      const item = document.createElement("li");
      item.className = `outline-item outline-kind-${node.kind || "symbol"}`;
      item.setAttribute("role", "treeitem");
      item.setAttribute("aria-level", String(depth + 1));
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const collapsed = hasChildren && collapsedNodeIds.has(node.id);
      if (hasChildren) item.setAttribute("aria-expanded", collapsed ? "false" : "true");

      const row = document.createElement("button");
      row.type = "button";
      row.className = "outline-row";
      row.title = node.detail ? `${node.name} — ${node.detail}` : node.name;
      row.innerHTML =
        `<i class="bi ${hasChildren ? (collapsed ? "bi-chevron-right" : "bi-chevron-down") : "outline-disclosure-placeholder"} outline-disclosure" aria-hidden="true"></i>` +
        `<i class="bi ${ICONS[node.kind] || ICONS.symbol} outline-symbol-icon" aria-hidden="true"></i>` +
        `<span class="outline-symbol-name"></span><span class="outline-symbol-detail"></span>`;
      row.querySelector(".outline-symbol-name").textContent = node.name;
      row.querySelector(".outline-symbol-detail").textContent = node.detail || "";
      row.addEventListener("click", (event) => {
        if (hasChildren && event.target.closest?.(".outline-disclosure")) {
          if (collapsedNodeIds.has(node.id)) collapsedNodeIds.delete(node.id);
          else collapsedNodeIds.add(node.id);
          renderTree(currentNodes);
          return;
        }
        focusNode(node);
      });
      row.addEventListener("dblclick", () => {
        if (!hasChildren) return;
        if (collapsedNodeIds.has(node.id)) collapsedNodeIds.delete(node.id);
        else collapsedNodeIds.add(node.id);
        renderTree(currentNodes);
      });
      item.appendChild(row);

      if (hasChildren && !collapsed) {
        const children = document.createElement("ul");
        children.className = "outline-tree outline-tree-children";
        children.setAttribute("role", "group");
        node.children.forEach((child) => children.appendChild(createTreeItem(child, depth + 1)));
        item.appendChild(children);
      }
      return item;
    }

    let currentNodes = [];
    function renderTree(nodes, language) {
      currentNodes = Array.isArray(nodes) ? nodes : [];
      if (!body) return;
      body.textContent = "";
      if (!currentNodes.length) {
        renderMessage(language?.emptyMessage || "No document symbols found.", "bi-braces");
        return;
      }
      const tree = document.createElement("ul");
      tree.className = "outline-tree";
      tree.setAttribute("role", "tree");
      tree.setAttribute("aria-label", "Document outline");
      currentNodes.forEach((node) => tree.appendChild(createTreeItem(node, 0)));
      body.appendChild(tree);
    }

    async function requestDocumentSymbolsWithTimeout() {
      let timeoutId;
      try {
        return await Promise.race([
          Promise.resolve(deps.getDocumentSymbols()).catch(() => []),
          new Promise((resolve) => {
            timeoutId = global.setTimeout(() => resolve([]), DOCUMENT_SYMBOL_WAIT_MS);
          })
        ]);
      } finally {
        global.clearTimeout(timeoutId);
      }
    }

    async function loadNodes(language, source, options = {}) {
      if (options.localOnly === true) return language.parse(source, {});
      if (typeof deps.getDocumentSymbols === "function" && typeof language.normalizeDocumentSymbols === "function") {
        const symbols = await requestDocumentSymbolsWithTimeout();
        if (Array.isArray(symbols) && symbols.length) return language.normalizeDocumentSymbols(symbols, source, {});
      }
      return language.parse(source, {});
    }

    /** Refresh visible Outline content and discard responses made stale by later activity. */
    async function refresh(activeTab = deps.getActiveTab?.(), options = {}) {
      const generation = ++refreshGeneration;
      if (!isVisible()) return [];
      if (!activeTab) { renderMessage("Open a supported source file to view its outline."); return []; }
      const language = getLanguage(activeTab);
      if (!language) { renderMessage("Outline is not available for this file type yet.", "bi-file-earmark-code"); return []; }
      const source = String(deps.getActiveEditorValue?.() ?? activeTab.content ?? "");
      renderMessage(language.loadingMessage || `Loading ${language.label || "document"} outline…`, "bi-hourglass-split");
      try {
        const nodes = await loadNodes(language, source, options);
        if (generation !== refreshGeneration) return [];
        renderTree(nodes, language);
        return nodes;
      } catch (error) {
        if (generation !== refreshGeneration) return [];
        console.warn(`Unable to build ${language.label || "document"} outline:`, error);
        renderMessage("Unable to build the outline for this file.", "bi-exclamation-triangle");
        return [];
      }
    }

    function scheduleRefresh() {
      global.clearTimeout(refreshTimer);
      if (!isVisible()) {
        refreshTimer = null;
        return;
      }
      refreshTimer = global.setTimeout(() => void refresh(undefined, { localOnly: true }), 180);
    }

    lowerPanel?.registerView?.({
      id: "outline",
      panel,
      tab: deps.tab,
      enabled: deps.initiallyVisible !== false
    });
    closeButton?.addEventListener("click", (event) => { event.stopPropagation(); setVisible(false); });
    toggleButtons.forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); toggle(); }));
    deps.editor?.addEventListener?.("input", scheduleRefresh);
    updateToggleButtons();

    const api = { isVisible, refresh, scheduleRefresh, setVisible, supports, toggle };
    app.registerModule?.("outlinePanel", api);
    return api;
  }

  global.registerMarkdownViewerOutlinePanel = registerMarkdownViewerOutlinePanel;
})(typeof window !== "undefined" ? window : globalThis);
