// XSLT Runner tool tab view.
(function(root) {
  "use strict";

  root.registerMarkdownViewerXsltTool = function registerMarkdownViewerXsltTool(app, deps = {}) {
    const runner = deps.runner || root.markdownViewerXsltRunner || null;
    const copyTextToClipboard = deps.copyTextToClipboard || null;
    const syntaxTextarea = deps.syntaxTextarea || app?.modules?.toolSyntaxTextarea || null;
    const openXsltToolInTab = deps.openXsltToolInTab || null;
    const mountedTabs = new Map();

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
      runTransform(elements);
    }

    function getParameterRows(elements) {
      return Array.from(elements.parameters.querySelectorAll(".xslt-tool-parameter-row"))
        .map((row) => ({
          name: row.querySelector(".xslt-tool-parameter-name")?.value || "",
          value: row.querySelector(".xslt-tool-parameter-value")?.value || ""
        }))
        .filter((parameter) => parameter.name.trim());
    }

    function syncTabState(elements) {
      elements.tab.xsltRunner = {
        xmlText: elements.xml.value,
        xsltText: elements.xslt.value,
        resultText: elements.result.value,
        parameters: getParameterRows(elements)
      };
    }

    function runTransform(elements) {
      syncTabState(elements);
      if (!runner) {
        elements.result.value = "";
        setStatus(elements, "XSLT runner is unavailable.", "error");
        return;
      }
      if (!elements.xml.value.trim() || !elements.xslt.value.trim()) {
        elements.result.value = "";
        setStatus(elements, "Enter XML and XSLT to run the transform.");
        return;
      }
      try {
        const result = runner.transform({
          xmlText: elements.xml.value,
          xsltText: elements.xslt.value,
          parameters: getParameterRows(elements)
        });
        elements.result.value = result.output || "";
        syncTabState(elements);
        setStatus(elements, "XSLT transform completed.", "success");
      } catch (error) {
        elements.result.value = "";
        syncTabState(elements);
        setStatus(elements, error?.message || "XSLT transform failed.", "error");
      }
    }

    function createToolbarButton(icon, label, className) {
      return `<button class="tool-button ${className}" type="button" title="${label}"><i class="bi ${icon}"></i> ${label}</button>`;
    }

    function createToolView() {
      const shell = document.createElement("div");
      shell.className = "xslt-tool-view";
      shell.innerHTML = `
        <div class="xslt-tool-workspace">
          <header class="xslt-tool-header">
            <h2><i class="bi bi-shuffle"></i> XSLT Runner</h2>
          </header>
          <main class="xslt-tool-grid">
            <section class="xslt-tool-panel">
              <div class="xslt-tool-panel-heading"><label for="xslt-tool-xml">XML</label><div class="xslt-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "xslt-tool-paste-xml")}<button class="tool-button xslt-tool-clear-xml" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
              <textarea id="xslt-tool-xml" class="xslt-tool-textarea xslt-tool-xml" spellcheck="false"></textarea>
            </section>
            <section class="xslt-tool-panel">
              <div class="xslt-tool-panel-heading"><label for="xslt-tool-xslt">XSLT</label><div class="xslt-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "xslt-tool-paste-xslt")}<button class="tool-button xslt-tool-clear-xslt" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
              <textarea id="xslt-tool-xslt" class="xslt-tool-textarea xslt-tool-xslt" spellcheck="false"></textarea>
            </section>
            <section class="xslt-tool-parameters">
              <div class="xslt-tool-panel-heading"><span>Parameters</span><div class="xslt-tool-actions">${createToolbarButton("bi-plus-lg", "Add", "xslt-tool-add-parameter")}</div></div>
              <div class="xslt-tool-parameter-list"></div>
            </section>
            <section class="xslt-tool-panel xslt-tool-result-panel">
              <div class="xslt-tool-panel-heading"><label for="xslt-tool-result">Result</label><div class="xslt-tool-actions">${createToolbarButton("bi-copy", "Copy", "xslt-tool-copy-result")}</div></div>
              <textarea id="xslt-tool-result" class="xslt-tool-textarea xslt-tool-result" spellcheck="false" readonly></textarea>
            </section>
          </main>
          <footer class="xslt-tool-status" role="status" aria-live="polite"></footer>
        </div>
      `;
      return shell;
    }

    function getElements(shell, tab) {
      return {
        shell,
        tab,
        xml: shell.querySelector(".xslt-tool-xml"),
        xslt: shell.querySelector(".xslt-tool-xslt"),
        result: shell.querySelector(".xslt-tool-result"),
        parameters: shell.querySelector(".xslt-tool-parameter-list"),
        status: shell.querySelector(".xslt-tool-status"),
        syntaxEditors: []
      };
    }

    function addParameterRow(elements, parameter = {}) {
      const row = document.createElement("div");
      row.className = "xslt-tool-parameter-row";
      row.innerHTML = `
        <input class="xslt-tool-parameter-name" type="text" placeholder="Name" spellcheck="false">
        <input class="xslt-tool-parameter-value" type="text" placeholder="Value" spellcheck="false">
        <button class="tool-button xslt-tool-remove-parameter" type="button" title="Remove parameter"><i class="bi bi-x-lg"></i></button>
      `;
      row.querySelector(".xslt-tool-parameter-name").value = parameter.name || "";
      row.querySelector(".xslt-tool-parameter-value").value = parameter.value || "";
      row.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => runTransform(elements)));
      row.querySelector(".xslt-tool-remove-parameter").addEventListener("click", () => {
        row.remove();
        runTransform(elements);
      });
      elements.parameters.appendChild(row);
    }

    function enableSyntaxTextareas(elements) {
      elements.syntaxEditors = [
        syntaxTextarea?.attach?.(elements.xml, { language: "xml" }),
        syntaxTextarea?.attach?.(elements.xslt, { language: "xml" }),
        syntaxTextarea?.attach?.(elements.result, { language: "xml" })
      ].filter(Boolean);
    }

    function bindTool(elements) {
      elements.xml.addEventListener("input", () => runTransform(elements));
      elements.xslt.addEventListener("input", () => runTransform(elements));
      elements.shell.querySelector(".xslt-tool-paste-xml").addEventListener("click", () => void pasteIntoTextArea(elements.xml, elements));
      elements.shell.querySelector(".xslt-tool-paste-xslt").addEventListener("click", () => void pasteIntoTextArea(elements.xslt, elements));
      elements.shell.querySelector(".xslt-tool-copy-result").addEventListener("click", () => copyValue(elements.result.value));
      elements.shell.querySelector(".xslt-tool-add-parameter").addEventListener("click", () => {
        addParameterRow(elements);
        syncTabState(elements);
      });
      elements.shell.querySelector(".xslt-tool-clear-xml").addEventListener("click", () => {
        elements.xml.value = "";
        runTransform(elements);
      });
      elements.shell.querySelector(".xslt-tool-clear-xslt").addEventListener("click", () => {
        elements.xslt.value = "";
        runTransform(elements);
      });
    }

    function applyTabState(elements) {
      const state = elements.tab.xsltRunner || {};
      elements.xml.value = state.xmlText || "";
      elements.xslt.value = state.xsltText || "";
      elements.result.value = state.resultText || "";
      (Array.isArray(state.parameters) ? state.parameters : []).forEach((parameter) => addParameterRow(elements, parameter));
      runTransform(elements);
    }

    function mountXsltToolTab(tab, rootElement) {
      let entry = mountedTabs.get(tab.id);
      if (!entry) {
        const shell = createToolView();
        const elements = getElements(shell, tab);
        enableSyntaxTextareas(elements);
        bindTool(elements);
        applyTabState(elements);
        entry = { shell, elements };
        mountedTabs.set(tab.id, entry);
      }
      rootElement.replaceChildren(entry.shell);
    }

    function destroyXsltToolTab(tabId) {
      mountedTabs.delete(tabId);
    }

    document.querySelectorAll?.(".open-xslt-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openXsltToolInTab?.());
    });

    const api = { mountXsltToolTab, destroyXsltToolTab };
    app?.registerModule?.("xsltTool", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
