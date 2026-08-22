// JSONPath Tester tool view.
(function(root) {
  "use strict";

  root.registerMarkdownViewerJsonPathTool = function registerMarkdownViewerJsonPathTool(app, deps = {}) {
    const evaluator = deps.evaluator || app?.modules?.jsonPathEvaluator || null;
    const copyTextToClipboard = deps.copyTextToClipboard || null;
    const syntaxTextarea = deps.syntaxTextarea || app?.modules?.toolSyntaxTextarea || null;
    const openJsonPathToolInTab = deps.openJsonPathToolInTab || null;
    const mountedTabs = new Map();

    const cheatSheetRows = [
      ["$", "The root object or array."],
      ["@", "Used for filter expressions. Refers to the current node."],
      ["object.property", "Dot-notated child."],
      ["['object']['property']", "Bracket-notated child or children."],
      ["..property", "Recursive descent for the named property."],
      ["*", "Wildcard. Selects all elements in an object or array."],
      ["[n]", "Selects the n-th element from an array. Indexes start from 0."],
      ["[n1,n2]", "Selects multiple array items or object properties."],
      ["[start:end:step]", "Array slice operator."],
      ["[?(@.name == 'value')]", "Selects children matching a simple filter expression."]
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

    async function pasteIntoTextArea(textarea, elements) {
      if (!navigator?.clipboard?.readText) return;
      textarea.value = await navigator.clipboard.readText();
      evaluateInput(elements);
    }

    function evaluateInput(elements) {
      if (!evaluator) {
        setStatus(elements, "JSONPath evaluator is unavailable.", "error");
        return;
      }
      if (!elements.json.value.trim()) {
        elements.result.value = "";
        setStatus(elements, "Enter JSON to test.");
        return;
      }
      if (!elements.path.value.trim()) {
        elements.result.value = "";
        setStatus(elements, "Enter a JSONPath expression.");
        return;
      }
      try {
        const result = evaluator.evaluateJsonPath(elements.json.value, elements.path.value);
        elements.result.value = evaluator.formatJsonPathResult(result);
        setStatus(elements, `${result.length} match${result.length === 1 ? "" : "es"}.`, "success");
      } catch (error) {
        elements.result.value = "";
        setStatus(elements, error?.message || "Unable to evaluate JSONPath.", "error");
      }
    }

    function createToolbarButton(icon, label, className) {
      return `<button class="tool-button ${className}" type="button" title="${label}"><i class="bi ${icon}"></i> ${label}</button>`;
    }

    function createCheatSheetRows() {
      return cheatSheetRows.map((row) => `<tr><th>${row[0]}</th><td>${row[1]}</td></tr>`).join("");
    }

    function createToolView() {
      const shell = document.createElement("div");
      shell.className = "jsonpath-tool-view";
      shell.innerHTML = `
        <div class="jsonpath-tool-workspace">
          <header class="jsonpath-tool-header">
            <h2><i class="bi bi-signpost-split"></i> JSONPath Tester</h2>
          </header>
          <main class="jsonpath-tool-grid">
            <section class="jsonpath-tool-panel jsonpath-tool-json-panel">
              <div class="jsonpath-tool-panel-heading"><label for="jsonpath-tool-json">JSON</label><div class="jsonpath-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "jsonpath-tool-paste-json")}<button class="tool-button jsonpath-tool-clear-json" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
              <textarea id="jsonpath-tool-json" class="jsonpath-tool-textarea jsonpath-tool-json" spellcheck="false"></textarea>
            </section>
            <section class="jsonpath-tool-side">
              <div class="jsonpath-tool-path-row">
                <div class="jsonpath-tool-panel-heading"><label for="jsonpath-tool-path">JSONPath</label><div class="jsonpath-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "jsonpath-tool-paste-path")}<button class="tool-button jsonpath-tool-clear-path" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
                <input id="jsonpath-tool-path" class="jsonpath-tool-path" type="text" spellcheck="false">
              </div>
              <section class="jsonpath-tool-panel jsonpath-tool-result-panel">
                <div class="jsonpath-tool-panel-heading"><label for="jsonpath-tool-result">Test result</label><div class="jsonpath-tool-actions">${createToolbarButton("bi-copy", "Copy", "jsonpath-tool-copy-result")}</div></div>
                <textarea id="jsonpath-tool-result" class="jsonpath-tool-textarea jsonpath-tool-result" spellcheck="false" readonly></textarea>
              </section>
              <section class="jsonpath-tool-cheat-sheet" aria-label="JSONPath cheat sheet">
                <div class="jsonpath-tool-cheat-heading">Cheat sheet</div>
                <table><thead><tr><th>Syntax</th><th>Description</th></tr></thead><tbody>${createCheatSheetRows()}</tbody></table>
              </section>
            </section>
          </main>
          <footer class="jsonpath-tool-status" role="status" aria-live="polite"></footer>
        </div>
      `;
      return shell;
    }

    function getElements(shell) {
      return {
        shell,
        json: shell.querySelector(".jsonpath-tool-json"),
        path: shell.querySelector(".jsonpath-tool-path"),
        result: shell.querySelector(".jsonpath-tool-result"),
        syntaxEditors: [],
        status: shell.querySelector(".jsonpath-tool-status")
      };
    }

    function enableSyntaxTextareas(elements) {
      elements.syntaxEditors = [
        syntaxTextarea?.attach?.(elements.json, { language: "json" }),
        syntaxTextarea?.attach?.(elements.result, { language: "json" })
      ].filter(Boolean);
    }

    function bindTool(elements) {
      elements.json.addEventListener("input", () => evaluateInput(elements));
      elements.path.addEventListener("input", () => evaluateInput(elements));
      elements.shell.querySelector(".jsonpath-tool-paste-json").addEventListener("click", () => void pasteIntoTextArea(elements.json, elements));
      elements.shell.querySelector(".jsonpath-tool-paste-path").addEventListener("click", () => void pasteIntoTextArea(elements.path, elements));
      elements.shell.querySelector(".jsonpath-tool-copy-result").addEventListener("click", () => copyValue(elements.result.value));
      elements.shell.querySelector(".jsonpath-tool-clear-json").addEventListener("click", () => {
        elements.json.value = "";
        evaluateInput(elements);
      });
      elements.shell.querySelector(".jsonpath-tool-clear-path").addEventListener("click", () => {
        elements.path.value = "";
        evaluateInput(elements);
      });
    }

    function mountJsonPathToolTab(tab, rootElement) {
      let entry = mountedTabs.get(tab.id);
      if (!entry) {
        const shell = createToolView();
        const elements = getElements(shell);
        enableSyntaxTextareas(elements);
        bindTool(elements);
        entry = { shell, elements };
        mountedTabs.set(tab.id, entry);
      }
      rootElement.replaceChildren(entry.shell);
    }

    function destroyJsonPathToolTab(tabId) {
      mountedTabs.delete(tabId);
    }

    document.querySelectorAll?.(".open-jsonpath-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openJsonPathToolInTab?.());
    });

    const api = { mountJsonPathToolTab, destroyJsonPathToolTab };
    app?.registerModule?.("jsonPathTool", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
