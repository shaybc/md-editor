// XPath Search tool view.
(function(root) {
  "use strict";

  root.registerMarkdownViewerXPathTool = function registerMarkdownViewerXPathTool(app, deps = {}) {
    const evaluator = deps.evaluator || app?.modules?.xpathEvaluator || null;
    const xpathBuilder = deps.xpathBuilder || app?.modules?.xpathBuilder || root.markdownViewerXPathBuilder || root.registerMarkdownViewerXPathBuilder?.(app) || null;
    const copyTextToClipboard = deps.copyTextToClipboard || null;
    const syntaxTextarea = deps.syntaxTextarea || app?.modules?.toolSyntaxTextarea || null;
    const openXPathToolInTab = deps.openXPathToolInTab || null;
    const mountedTabs = new Map();

    const cheatSheetRows = [
      ["/", "Selects from the document root."],
      ["//element", "Selects matching elements anywhere in the document."],
      ["element/child", "Selects a child element."],
      ["@attribute", "Selects an attribute."],
      ["text()", "Selects text nodes."],
      ["[n]", "Selects the n-th matching node. Indexes start from 1."],
      ["[*]", "Matches any element at that step."],
      ["[ @id='value' ]", "Filters nodes by an attribute value."],
      ["contains(text(),'value')", "Filters nodes by text content."],
      ["local-name()='name'", "Matches namespaced XML without declaring a prefix."]
    ];

    function setStatus(elements, message, type = "info") {
      if (!elements?.status) return;
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type;
    }

    function copyValue(value) {
      if (!value) return;
      if (typeof copyTextToClipboard === "function") copyTextToClipboard(value);
      else if (navigator?.clipboard?.writeText) void navigator.clipboard.writeText(value);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function normalizeWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    async function pasteIntoTextArea(textarea, elements) {
      if (!navigator?.clipboard?.readText) return;
      textarea.value = await navigator.clipboard.readText();
      if (textarea === elements.xml) refreshBuilder(elements);
      evaluateInput(elements);
    }

    function evaluateInput(elements) {
      if (!evaluator) {
        setStatus(elements, "XPath evaluator is unavailable.", "error");
        return;
      }
      if (!elements.xml.value.trim()) {
        elements.result.value = "";
        setStatus(elements, "Enter XML to test.");
        return;
      }
      if (!elements.path.value.trim()) {
        elements.result.value = "";
        setStatus(elements, "Enter an XPath expression.");
        return;
      }
      try {
        const result = evaluator.evaluateXPath(elements.xml.value, elements.path.value);
        elements.result.value = evaluator.formatXPathResult(result);
        setStatus(elements, `${result.matches.length} match${result.matches.length === 1 ? "" : "es"}.`, "success");
      } catch (error) {
        elements.result.value = "";
        setStatus(elements, error?.message || "Unable to evaluate XPath.", "error");
      }
    }

    function createToolbarButton(icon, label, className) {
      return `<button class="tool-button ${className}" type="button" title="${label}"><i class="bi ${icon}"></i> ${label}</button>`;
    }

    function createCheatSheetRows() {
      return cheatSheetRows.map((row) => `<tr><th>${row[0]}</th><td>${row[1]}</td></tr>`).join("");
    }

    function renderBuilderNode(node) {
      const preview = normalizeWhitespace(node.value).slice(0, 70);
      const hasChildren = node.children.length > 0;
      return `
        <li class="xpath-tool-builder-node" data-node-id="${escapeHtml(node.id)}">
          <button class="xpath-tool-builder-row" type="button" aria-expanded="${hasChildren ? "true" : "false"}">
            <span class="xpath-tool-builder-toggle">${hasChildren ? "-" : ""}</span>
            <span class="xpath-tool-builder-kind">${escapeHtml(node.kind)}</span>
            <span class="xpath-tool-builder-name">${escapeHtml(node.name)}</span>
            ${preview ? `<span class="xpath-tool-builder-preview">${escapeHtml(preview)}</span>` : ""}
          </button>
          ${hasChildren ? `<ol>${node.children.map(renderBuilderNode).join("")}</ol>` : ""}
        </li>
      `;
    }

    function renderBuilderTree(tree) {
      return `<ol class="xpath-tool-builder-root">${renderBuilderNode(tree)}</ol>`;
    }

    function createToolView() {
      const shell = document.createElement("div");
      shell.className = "xpath-tool-view";
      shell.innerHTML = `
        <div class="xpath-tool-workspace">
          <header class="xpath-tool-header">
            <h2><i class="bi bi-signpost-split"></i> XPath Search</h2>
          </header>
          <main class="xpath-tool-grid">
            <section class="xpath-tool-panel xpath-tool-xml-panel">
              <div class="xpath-tool-panel-heading"><label for="xpath-tool-xml">XML</label><div class="xpath-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "xpath-tool-paste-xml")}<button class="tool-button xpath-tool-clear-xml" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
              <textarea id="xpath-tool-xml" class="xpath-tool-textarea xpath-tool-xml" spellcheck="false"></textarea>
            </section>
            <section class="xpath-tool-side">
              <div class="xpath-tool-path-row">
                <div class="xpath-tool-panel-heading"><label for="xpath-tool-path">XPath</label><div class="xpath-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "xpath-tool-paste-path")}<button class="tool-button xpath-tool-clear-path" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
                <input id="xpath-tool-path" class="xpath-tool-path" type="text" spellcheck="false">
              </div>
              <section class="xpath-tool-builder-panel" aria-label="XPath builder">
                <div class="xpath-tool-panel-heading">
                  <div class="xpath-tool-builder-title"><span>Builder</span><span class="xpath-tool-builder-mode">Absolute path</span></div>
                  <div class="xpath-tool-actions">
                    <label class="xpath-tool-builder-toggle-local-name"><input class="xpath-tool-builder-local-name" type="checkbox"> Use local-name()</label>
                    <button class="tool-button xpath-tool-copy-builder-path" type="button" title="Copy XPath" disabled><i class="bi bi-copy"></i> Copy XPath</button>
                  </div>
                </div>
                <div class="xpath-tool-builder-selected" aria-live="polite"></div>
                <div class="xpath-tool-builder-tree">Enter XML to build XPath expressions.</div>
              </section>
              <section class="xpath-tool-panel xpath-tool-result-panel">
                <div class="xpath-tool-panel-heading"><label for="xpath-tool-result">Test result</label><div class="xpath-tool-actions">${createToolbarButton("bi-copy", "Copy", "xpath-tool-copy-result")}</div></div>
                <textarea id="xpath-tool-result" class="xpath-tool-textarea xpath-tool-result" spellcheck="false" readonly></textarea>
              </section>
              <section class="xpath-tool-cheat-sheet" aria-label="XPath cheat sheet">
                <div class="xpath-tool-cheat-heading">Cheat sheet</div>
                <table><thead><tr><th>Syntax</th><th>Description</th></tr></thead><tbody>${createCheatSheetRows()}</tbody></table>
              </section>
            </section>
          </main>
          <footer class="xpath-tool-status" role="status" aria-live="polite"></footer>
        </div>
      `;
      return shell;
    }

    function getElements(shell) {
      return {
        shell,
        xml: shell.querySelector(".xpath-tool-xml"),
        path: shell.querySelector(".xpath-tool-path"),
        result: shell.querySelector(".xpath-tool-result"),
        builderTree: shell.querySelector(".xpath-tool-builder-tree"),
        builderSelected: shell.querySelector(".xpath-tool-builder-selected"),
        builderUseLocalName: shell.querySelector(".xpath-tool-builder-local-name"),
        builderCopyPath: shell.querySelector(".xpath-tool-copy-builder-path"),
        syntaxEditors: [],
        status: shell.querySelector(".xpath-tool-status"),
        builderState: { parsed: null, selectedNodeId: "" }
      };
    }

    function enableSyntaxTextareas(elements) {
      elements.syntaxEditors = [
        syntaxTextarea?.attach?.(elements.xml, { language: "xml" }),
        syntaxTextarea?.attach?.(elements.result, { language: "xml" })
      ].filter(Boolean);
    }

    function getSelectedBuilderPath(elements) {
      const parsed = elements.builderState.parsed;
      const nodeId = elements.builderState.selectedNodeId;
      if (!xpathBuilder || !parsed?.ok || !nodeId) return "";
      return xpathBuilder.buildXPathForNode(parsed, nodeId, { useLocalName: elements.builderUseLocalName.checked });
    }

    function updateBuilderSelection(elements, nodeId, options = {}) {
      elements.builderState.selectedNodeId = nodeId || "";
      elements.builderTree.querySelectorAll(".xpath-tool-builder-row.is-selected").forEach((row) => row.classList.remove("is-selected"));
      if (!nodeId) {
        elements.builderSelected.textContent = "";
        elements.builderCopyPath.disabled = true;
        return;
      }
      const escapedNodeId = root.CSS?.escape ? root.CSS.escape(nodeId) : String(nodeId).replace(/["\\]/g, "\\$&");
      const row = elements.builderTree.querySelector(`.xpath-tool-builder-node[data-node-id="${escapedNodeId}"] > .xpath-tool-builder-row`);
      if (row) row.classList.add("is-selected");
      const generatedPath = getSelectedBuilderPath(elements);
      elements.builderSelected.textContent = generatedPath;
      elements.builderCopyPath.disabled = !generatedPath;
      if (options.writePath !== false && generatedPath) {
        elements.path.value = generatedPath;
        evaluateInput(elements);
      }
    }

    function bindBuilderTree(elements) {
      elements.builderTree.querySelectorAll(".xpath-tool-builder-row").forEach((row) => {
        row.addEventListener("click", () => {
          const item = row.closest(".xpath-tool-builder-node");
          if (!item) return;
          const childList = item.querySelector(":scope > ol");
          if (childList) {
            const collapsed = item.classList.toggle("is-collapsed");
            row.setAttribute("aria-expanded", collapsed ? "false" : "true");
            row.querySelector(".xpath-tool-builder-toggle").textContent = collapsed ? "+" : "-";
          }
          updateBuilderSelection(elements, item.dataset.nodeId, { writePath: true });
        });
      });
    }

    function refreshBuilder(elements) {
      elements.builderState = { parsed: null, selectedNodeId: "" };
      elements.builderSelected.textContent = "";
      elements.builderCopyPath.disabled = true;
      if (!xpathBuilder) {
        elements.builderTree.textContent = "XPath builder is unavailable.";
        return;
      }
      const parsed = xpathBuilder.parseXmlToXPathTree(elements.xml.value);
      elements.builderState.parsed = parsed;
      if (!parsed.ok) {
        elements.builderTree.textContent = parsed.diagnostics?.[0]?.message || "Unable to build XPath tree.";
        return;
      }
      elements.builderTree.innerHTML = renderBuilderTree(parsed.tree);
      bindBuilderTree(elements);
    }

    function bindTool(elements) {
      elements.xml.addEventListener("input", () => {
        refreshBuilder(elements);
        evaluateInput(elements);
      });
      elements.path.addEventListener("input", () => evaluateInput(elements));
      elements.shell.querySelector(".xpath-tool-paste-xml").addEventListener("click", () => void pasteIntoTextArea(elements.xml, elements));
      elements.shell.querySelector(".xpath-tool-paste-path").addEventListener("click", () => void pasteIntoTextArea(elements.path, elements));
      elements.shell.querySelector(".xpath-tool-copy-result").addEventListener("click", () => copyValue(elements.result.value));
      elements.shell.querySelector(".xpath-tool-clear-xml").addEventListener("click", () => {
        elements.xml.value = "";
        refreshBuilder(elements);
        evaluateInput(elements);
      });
      elements.shell.querySelector(".xpath-tool-clear-path").addEventListener("click", () => {
        elements.path.value = "";
        evaluateInput(elements);
      });
      elements.builderUseLocalName.addEventListener("change", () => {
        updateBuilderSelection(elements, elements.builderState.selectedNodeId, { writePath: false });
      });
      elements.builderCopyPath.addEventListener("click", () => {
        const value = getSelectedBuilderPath(elements);
        if (value) copyValue(value);
      });
    }

    function mountXPathToolTab(tab, rootElement) {
      let entry = mountedTabs.get(tab.id);
      if (!entry) {
        const shell = createToolView();
        const elements = getElements(shell);
        enableSyntaxTextareas(elements);
        bindTool(elements);
        refreshBuilder(elements);
        entry = { shell, elements };
        mountedTabs.set(tab.id, entry);
      }
      rootElement.replaceChildren(entry.shell);
    }

    function destroyXPathToolTab(tabId) {
      mountedTabs.delete(tabId);
    }

    document.querySelectorAll?.(".open-xpath-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openXPathToolInTab?.());
    });

    const api = { mountXPathToolTab, destroyXPathToolTab };
    app?.registerModule?.("xpathTool", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);