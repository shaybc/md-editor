(function(root) {
  "use strict";

  root.registerMarkdownViewerJsonYamlTool = function registerMarkdownViewerJsonYamlTool(app, deps = {}) {
    const codec = deps.codec || app?.modules?.jsonYamlCodec || null;
    const copyTextToClipboard = deps.copyTextToClipboard || null;
    const syntaxTextarea = deps.syntaxTextarea || app?.modules?.toolSyntaxTextarea || null;
    const openJsonYamlToolInTab = deps.openJsonYamlToolInTab || null;
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

    async function pasteIntoInput(elements) {
      if (!navigator?.clipboard?.readText) return;
      elements.input.value = await navigator.clipboard.readText();
      convertInput(elements);
    }

    function getModeLabel(mode) {
      return mode === "json-to-yaml" ? "JSON to YAML" : "YAML to JSON";
    }

    function updateLabels(elements) {
      const mode = elements.mode.value;
      elements.inputLabel.textContent = mode === "json-to-yaml" ? "JSON" : "YAML";
      elements.outputLabel.textContent = mode === "json-to-yaml" ? "YAML" : "JSON";
      elements.input.placeholder = mode === "json-to-yaml" ? "Paste JSON here" : "Paste YAML here";
      elements.output.placeholder = `${getModeLabel(mode)} output`;
      elements.inputSyntax?.setLanguage?.(mode === "json-to-yaml" ? "json" : "yaml");
      elements.outputSyntax?.setLanguage?.(mode === "json-to-yaml" ? "yaml" : "json");
    }

    function convertInput(elements) {
      if (!codec) {
        setStatus(elements, "JSON/YAML converter is unavailable.", "error");
        return;
      }
      const input = elements.input.value;
      if (!input.trim()) {
        elements.output.value = "";
        setStatus(elements, "");
        return;
      }
      try {
        elements.output.value = codec.convert(input, {
          mode: elements.mode.value,
          indent: Number(elements.indent.value)
        });
        setStatus(elements, `${getModeLabel(elements.mode.value)} converted.`, "success");
      } catch (error) {
        elements.output.value = "";
        setStatus(elements, error?.message || "Unable to convert input.", "error");
      }
    }

    function createToolbarButton(icon, label, className) {
      return `<button class="tool-button ${className}" type="button" title="${label}"><i class="bi ${icon}"></i> ${label}</button>`;
    }

    function createToolView() {
      const shell = document.createElement("div");
      shell.className = "json-yaml-tool-view";
      shell.innerHTML = `
        <div class="json-yaml-tool-workspace">
          <header class="json-yaml-tool-header">
            <h2><i class="bi bi-braces"></i> JSON &lt;&gt; YAML Converter</h2>
          </header>
          <section class="json-yaml-tool-config" aria-label="Configuration">
            <div class="json-yaml-tool-config-title">Configuration</div>
            <div class="json-yaml-tool-setting-row">
              <div class="json-yaml-tool-setting-icon"><i class="bi bi-arrow-left-right"></i></div>
              <div class="json-yaml-tool-setting-copy"><strong>Conversion</strong><span>Select which conversion mode you want to use</span></div>
              <select class="json-yaml-tool-select json-yaml-tool-mode" aria-label="Conversion mode">
                <option value="yaml-to-json">YAML to JSON</option>
                <option value="json-to-yaml">JSON to YAML</option>
              </select>
            </div>
            <div class="json-yaml-tool-setting-row">
              <div class="json-yaml-tool-setting-icon"><i class="bi bi-text-indent-left"></i></div>
              <div class="json-yaml-tool-setting-copy"><strong>Indentation</strong></div>
              <select class="json-yaml-tool-select json-yaml-tool-indent" aria-label="Indentation">
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
              </select>
            </div>
          </section>
          <main class="json-yaml-tool-grid">
            <section class="json-yaml-tool-panel">
              <div class="json-yaml-tool-panel-heading"><label class="json-yaml-tool-input-label" for="json-yaml-tool-input">Input</label><div class="json-yaml-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "json-yaml-tool-paste")}${createToolbarButton("bi-copy", "Copy", "json-yaml-tool-copy-input")}<button class="tool-button json-yaml-tool-clear" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
              <textarea id="json-yaml-tool-input" class="json-yaml-tool-textarea json-yaml-tool-input" spellcheck="false"></textarea>
            </section>
            <section class="json-yaml-tool-panel">
              <div class="json-yaml-tool-panel-heading"><label class="json-yaml-tool-output-label" for="json-yaml-tool-output">Output</label><div class="json-yaml-tool-actions">${createToolbarButton("bi-copy", "Copy", "json-yaml-tool-copy-output")}</div></div>
              <textarea id="json-yaml-tool-output" class="json-yaml-tool-textarea json-yaml-tool-output" spellcheck="false" readonly></textarea>
            </section>
          </main>
          <footer class="json-yaml-tool-status" role="status" aria-live="polite"></footer>
        </div>
      `;
      return shell;
    }

    function getElements(shell) {
      return {
        shell,
        mode: shell.querySelector(".json-yaml-tool-mode"),
        indent: shell.querySelector(".json-yaml-tool-indent"),
        input: shell.querySelector(".json-yaml-tool-input"),
        output: shell.querySelector(".json-yaml-tool-output"),
        inputSyntax: null,
        outputSyntax: null,
        inputLabel: shell.querySelector(".json-yaml-tool-input-label"),
        outputLabel: shell.querySelector(".json-yaml-tool-output-label"),
        status: shell.querySelector(".json-yaml-tool-status")
      };
    }

    function enableSyntaxTextareas(elements) {
      elements.inputSyntax = syntaxTextarea?.attach?.(elements.input, { language: elements.mode.value === "json-to-yaml" ? "json" : "yaml" }) || null;
      elements.outputSyntax = syntaxTextarea?.attach?.(elements.output, { language: elements.mode.value === "json-to-yaml" ? "yaml" : "json" }) || null;
    }

    function bindTool(elements) {
      elements.mode.addEventListener("change", () => {
        updateLabels(elements);
        convertInput(elements);
      });
      elements.indent.addEventListener("change", () => convertInput(elements));
      elements.input.addEventListener("input", () => convertInput(elements));
      elements.shell.querySelector(".json-yaml-tool-paste").addEventListener("click", () => void pasteIntoInput(elements));
      elements.shell.querySelector(".json-yaml-tool-copy-input").addEventListener("click", () => copyValue(elements.input.value));
      elements.shell.querySelector(".json-yaml-tool-copy-output").addEventListener("click", () => copyValue(elements.output.value));
      elements.shell.querySelector(".json-yaml-tool-clear").addEventListener("click", () => {
        elements.input.value = "";
        elements.output.value = "";
        setStatus(elements, "Cleared.");
      });
      updateLabels(elements);
    }

    function mountJsonYamlToolTab(tab, rootElement) {
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

    function destroyJsonYamlToolTab(tabId) {
      mountedTabs.delete(tabId);
    }

    document.querySelectorAll?.(".open-json-yaml-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openJsonYamlToolInTab?.());
    });

    const api = { mountJsonYamlToolTab, destroyJsonYamlToolTab };
    app?.registerModule?.("jsonYamlTool", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);