// DevToys-style String to Bytes Converter tool UI.
(function(root) {
  "use strict";

  /**
   * Register the String to Bytes Converter tool with MD-Editor.
   * @param {object} app - MD-Editor application service container.
   * @param {object} deps - Tool dependencies supplied by the app shell.
   * @returns {object} Public tool API.
   */
  function registerMarkdownViewerStringBytesTool(app, deps) {
    const codec = deps?.codec || root.registerMarkdownViewerStringBytesCodec?.(app) || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openStringBytesToolInTab = typeof deps?.openStringBytesToolInTab === "function" ? deps.openStringBytesToolInTab : null;
    const mountedTabs = new Map();

    function createStringBytesToolView(tab) {
      const view = document.createElement("div");
      view.className = "string-bytes-tool-view";
      view.innerHTML = `
        <div class="string-bytes-tool-workspace">
          <header class="string-bytes-tool-header">
            <h2><i class="bi bi-braces"></i> String to Bytes Converter</h2>
          </header>
          <section class="string-bytes-tool-config" aria-label="String to bytes configuration">
            <div class="string-bytes-tool-setting-row">
              <i class="bi bi-arrow-left-right string-bytes-tool-setting-icon"></i>
              <div class="string-bytes-tool-setting-copy">
                <strong>Conversion</strong>
                <span>Select which conversion mode you want to use</span>
              </div>
              <button type="button" class="string-bytes-tool-switch" role="switch" aria-checked="true">String to bytes</button>
            </div>
            <div class="string-bytes-tool-setting-row">
              <i class="bi bi-123 string-bytes-tool-setting-icon"></i>
              <div class="string-bytes-tool-setting-copy">
                <strong>Byte format</strong>
                <span>Select how bytes are shown or parsed</span>
              </div>
              <select class="string-bytes-tool-format" aria-label="Byte format">
                <option value="decimal-array">Decimal array ([72, 105])</option>
                <option value="hex-array">Hex array ([0x48, 0x69])</option>
                <option value="raw-hex">Raw hex (4869)</option>
              </select>
            </div>
          </section>
          <section class="string-bytes-tool-panel">
            <div class="string-bytes-tool-panel-heading">
              <label for="string-bytes-tool-input">Input</label>
              <div class="string-bytes-tool-actions">
                <button type="button" class="tool-button string-bytes-tool-paste" title="Paste input"><i class="bi bi-clipboard"></i> Paste</button>
                <button type="button" class="tool-button string-bytes-tool-clear" title="Clear input"><i class="bi bi-x-lg"></i></button>
              </div>
            </div>
            <textarea id="string-bytes-tool-input" class="string-bytes-tool-input" spellcheck="false"></textarea>
          </section>
          <section class="string-bytes-tool-panel">
            <div class="string-bytes-tool-panel-heading">
              <label>Output</label>
              <div class="string-bytes-tool-actions">
                <button type="button" class="tool-button string-bytes-tool-copy" title="Copy output"><i class="bi bi-copy"></i> Copy</button>
              </div>
            </div>
            <textarea class="string-bytes-tool-output" spellcheck="false" readonly></textarea>
            <p class="string-bytes-tool-status" aria-live="polite"></p>
          </section>
        </div>
      `;

      const controls = {
        mode: view.querySelector(".string-bytes-tool-switch"),
        format: view.querySelector(".string-bytes-tool-format"),
        input: view.querySelector(".string-bytes-tool-input"),
        output: view.querySelector(".string-bytes-tool-output"),
        status: view.querySelector(".string-bytes-tool-status"),
        paste: view.querySelector(".string-bytes-tool-paste"),
        clear: view.querySelector(".string-bytes-tool-clear"),
        copy: view.querySelector(".string-bytes-tool-copy")
      };

      function getMode() {
        return controls.mode.getAttribute("aria-checked") === "true" ? "string-to-bytes" : "bytes-to-string";
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
          controls.output.value = codec?.convertStringBytes?.(input, {
            mode: getMode(),
            format: controls.format.value
          }) || "";
          setStatus(getMode() === "string-to-bytes" ? "Converted to bytes." : "Converted to string.", "success");
        } catch (error) {
          controls.output.value = "";
          setStatus(error?.message || "Invalid byte array text.", "error");
        }
      }

      function toggleMode() {
        const isStringToBytes = getMode() === "string-to-bytes";
        controls.mode.setAttribute("aria-checked", isStringToBytes ? "false" : "true");
        controls.mode.textContent = isStringToBytes ? "Bytes to string" : "String to bytes";
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

    function mountStringBytesToolTab(tab, rootElement) {
      if (!tab?.id || !rootElement) return null;
      let record = mountedTabs.get(tab.id);
      if (!record || !record.view?.isConnected) {
        rootElement.textContent = "";
        const view = createStringBytesToolView(tab);
        rootElement.appendChild(view);
        record = mountedTabs.get(tab.id);
      } else if (record.view.parentElement !== rootElement) {
        rootElement.textContent = "";
        rootElement.appendChild(record.view);
      }
      return record.view;
    }

    function destroyStringBytesToolTab(tabId) {
      const record = mountedTabs.get(tabId);
      record?.view?.remove?.();
      mountedTabs.delete(tabId);
    }

    function openStringBytesTool() {
      return openStringBytesToolInTab?.() || null;
    }

    document.querySelectorAll(".open-string-bytes-tool").forEach(function(button) {
      button.addEventListener("click", openStringBytesTool);
    });

    const api = { mountStringBytesToolTab, destroyStringBytesToolTab, openStringBytesTool };
    app?.registerModule?.("stringBytesTool", api);
    return api;
  }

  root.registerMarkdownViewerStringBytesTool = registerMarkdownViewerStringBytesTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerStringBytesTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
