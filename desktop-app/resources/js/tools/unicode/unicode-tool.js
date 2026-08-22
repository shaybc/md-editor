// DevToys-style Unicode Encoder / Decoder tool UI.
(function(root) {
  "use strict";

  /**
   * Register the Unicode Encoder / Decoder tool with MD-Editor.
   * @param {object} app - MD-Editor application service container.
   * @param {object} deps - Tool dependencies supplied by the app shell.
   * @returns {object} Public tool API.
   */
  function registerMarkdownViewerUnicodeTool(app, deps) {
    const codec = deps?.codec || root.registerMarkdownViewerUnicodeCodec?.(app) || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openUnicodeToolInTab = typeof deps?.openUnicodeToolInTab === "function" ? deps.openUnicodeToolInTab : null;
    const mountedTabs = new Map();

    function createUnicodeToolView(tab) {
      const view = document.createElement("div");
      view.className = "unicode-tool-view";
      view.innerHTML = `
        <div class="unicode-tool-workspace">
          <header class="unicode-tool-header">
            <h2><i class="bi bi-globe2"></i> Unicode Encoder / Decoder</h2>
          </header>
          <section class="unicode-tool-config" aria-label="Unicode conversion configuration">
            <div class="unicode-tool-setting-row">
              <i class="bi bi-arrow-left-right unicode-tool-setting-icon"></i>
              <div class="unicode-tool-setting-copy">
                <strong>Conversion</strong>
                <span>Select which conversion mode you want to use</span>
              </div>
              <button type="button" class="unicode-tool-switch" role="switch" aria-checked="true">Encode</button>
            </div>
            <div class="unicode-tool-setting-row">
              <i class="bi bi-braces unicode-tool-setting-icon"></i>
              <div class="unicode-tool-setting-copy">
                <strong>Format</strong>
                <span>Select the Unicode representation to convert</span>
              </div>
              <select class="unicode-tool-format" aria-label="Unicode format">
                <option value="javascript-unicode">JavaScript Unicode (\\uXXXX)</option>
                <option value="html-decimal">HTML decimal entities (&amp;#116;)</option>
                <option value="url-percent">URL percent encoding (%20)</option>
              </select>
            </div>
          </section>
          <section class="unicode-tool-panel">
            <div class="unicode-tool-panel-heading">
              <label for="unicode-tool-input">Input</label>
              <div class="unicode-tool-actions">
                <button type="button" class="tool-button unicode-tool-paste" title="Paste input"><i class="bi bi-clipboard"></i> Paste</button>
                <button type="button" class="tool-button unicode-tool-clear" title="Clear input"><i class="bi bi-x-lg"></i></button>
              </div>
            </div>
            <textarea id="unicode-tool-input" class="unicode-tool-input" spellcheck="false"></textarea>
          </section>
          <section class="unicode-tool-panel">
            <div class="unicode-tool-panel-heading">
              <label>Output</label>
              <div class="unicode-tool-actions">
                <button type="button" class="tool-button unicode-tool-copy" title="Copy output"><i class="bi bi-copy"></i> Copy</button>
              </div>
            </div>
            <textarea class="unicode-tool-output" spellcheck="false" readonly></textarea>
            <p class="unicode-tool-status" aria-live="polite"></p>
          </section>
        </div>
      `;

      const controls = {
        mode: view.querySelector(".unicode-tool-switch"),
        format: view.querySelector(".unicode-tool-format"),
        input: view.querySelector(".unicode-tool-input"),
        output: view.querySelector(".unicode-tool-output"),
        status: view.querySelector(".unicode-tool-status"),
        paste: view.querySelector(".unicode-tool-paste"),
        clear: view.querySelector(".unicode-tool-clear"),
        copy: view.querySelector(".unicode-tool-copy")
      };

      function getMode() {
        return controls.mode.getAttribute("aria-checked") === "true" ? "encode" : "decode";
      }

      function setStatus(message, type) {
        controls.status.textContent = message || "";
        if (type) controls.status.dataset.statusType = type;
        else delete controls.status.dataset.statusType;
      }

      function renderConversion() {
        const input = controls.input.value || "";
        if (!input) {
          controls.output.value = "";
          setStatus("", "");
          return;
        }

        try {
          controls.output.value = codec?.convertUnicode?.(input, {
            mode: getMode(),
            format: controls.format.value
          }) || "";
          setStatus(getMode() === "encode" ? "Encoded." : "Decoded.", "success");
        } catch (error) {
          controls.output.value = "";
          setStatus(error?.message || "Invalid Unicode text.", "error");
        }
      }

      function toggleMode() {
        const isEncode = getMode();
        controls.mode.setAttribute("aria-checked", isEncode ? "false" : "true");
        controls.mode.textContent = isEncode ? "Decode" : "Encode";
        renderConversion();
      }

      controls.input.addEventListener("input", renderConversion);
      controls.format.addEventListener("change", renderConversion);
      controls.mode.addEventListener("click", toggleMode);

      controls.paste.addEventListener("click", async function() {
        try {
          controls.input.value = await navigator.clipboard.readText();
          renderConversion();
          controls.input.focus();
        } catch (error) {
          setStatus("Unable to paste from clipboard.", "error");
        }
      });

      controls.clear.addEventListener("click", function() {
        controls.input.value = "";
        renderConversion();
        controls.input.focus();
      });

      controls.copy.addEventListener("click", async function() {
        try {
          if (copyTextToClipboard) await copyTextToClipboard(controls.output.value);
          else await navigator.clipboard.writeText(controls.output.value);
          setStatus("Copied output.", "success");
        } catch (error) {
          setStatus("Unable to copy output.", "error");
        }
      });

      mountedTabs.set(tab.id, { view });
      return view;
    }

    function mountUnicodeToolTab(tab, rootElement) {
      if (!tab?.id || !rootElement) return null;
      let record = mountedTabs.get(tab.id);
      if (!record || !record.view?.isConnected) {
        rootElement.textContent = "";
        const view = createUnicodeToolView(tab);
        rootElement.appendChild(view);
        record = mountedTabs.get(tab.id);
      } else if (record.view.parentElement !== rootElement) {
        rootElement.textContent = "";
        rootElement.appendChild(record.view);
      }
      return record.view;
    }

    function destroyUnicodeToolTab(tabId) {
      const record = mountedTabs.get(tabId);
      record?.view?.remove?.();
      mountedTabs.delete(tabId);
    }

    function openUnicodeTool() {
      return openUnicodeToolInTab?.() || null;
    }

    document.querySelectorAll(".open-unicode-tool").forEach(function(button) {
      button.addEventListener("click", openUnicodeTool);
    });

    const api = { mountUnicodeToolTab, destroyUnicodeToolTab, openUnicodeTool };
    app?.registerModule?.("unicodeTool", api);
    return api;
  }

  root.registerMarkdownViewerUnicodeTool = registerMarkdownViewerUnicodeTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerUnicodeTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
