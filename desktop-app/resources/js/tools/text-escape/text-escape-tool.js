// DevToys-style Text Escape / Unescape tab UI.
(function(root) {
  "use strict";

  function registerMarkdownViewerTextEscapeTool(app, deps) {
    const codec = deps?.codec || app?.modules?.textEscapeCodec || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openTextEscapeToolInTab = typeof deps?.openTextEscapeToolInTab === "function" ? deps.openTextEscapeToolInTab : null;
    const mountedTabs = new Map();

    function createShell() {
      const view = document.createElement("div");
      view.className = "text-escape-tool-view";
      view.innerHTML = `
        <div class="text-escape-tool-workspace">
          <header class="text-escape-tool-header">
            <h2><i class="bi bi-textarea-t"></i> Text Escape / Unescape</h2>
          </header>
          <section class="text-escape-tool-config" aria-label="Text escape configuration">
            <div class="text-escape-tool-setting-row">
              <i class="bi bi-arrow-left-right text-escape-tool-setting-icon"></i>
              <div class="text-escape-tool-setting-copy">
                <strong>Conversion</strong>
                <span>Select which conversion mode you want to use</span>
              </div>
              <button type="button" class="text-escape-tool-switch" role="switch" aria-checked="true">Escape</button>
            </div>
          </section>
          <section class="text-escape-tool-panel">
            <div class="text-escape-tool-panel-heading">
              <label for="text-escape-tool-input">Input</label>
              <div class="text-escape-tool-actions">
                <button type="button" class="tool-button text-escape-tool-paste" title="Paste input"><i class="bi bi-clipboard"></i> Paste</button>
                <button type="button" class="tool-button text-escape-tool-clear" title="Clear input"><i class="bi bi-x-lg"></i></button>
              </div>
            </div>
            <textarea id="text-escape-tool-input" class="text-escape-tool-input" spellcheck="false"></textarea>
          </section>
          <section class="text-escape-tool-panel">
            <div class="text-escape-tool-panel-heading">
              <span>Output</span>
              <div class="text-escape-tool-actions">
                <button type="button" class="tool-button text-escape-tool-copy" title="Copy output"><i class="bi bi-copy"></i> Copy</button>
              </div>
            </div>
            <textarea class="text-escape-tool-output" spellcheck="false" readonly></textarea>
            <p class="text-escape-tool-status" aria-live="polite"></p>
          </section>
        </div>
      `;
      return view;
    }

    function getElements(view) {
      return {
        mode: view.querySelector(".text-escape-tool-switch"),
        input: view.querySelector(".text-escape-tool-input"),
        output: view.querySelector(".text-escape-tool-output"),
        status: view.querySelector(".text-escape-tool-status"),
        paste: view.querySelector(".text-escape-tool-paste"),
        clear: view.querySelector(".text-escape-tool-clear"),
        copy: view.querySelector(".text-escape-tool-copy")
      };
    }

    function isEscapeMode(elements) {
      return elements.mode.getAttribute("aria-checked") === "true";
    }

    function setMode(elements, escapeMode) {
      elements.mode.setAttribute("aria-checked", escapeMode ? "true" : "false");
      elements.mode.textContent = escapeMode ? "Escape" : "Unescape";
    }

    function setStatus(elements, message, type) {
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type || "";
    }

    function update(elements) {
      try {
        elements.output.value = codec?.convertText?.(elements.input.value, {
          mode: isEscapeMode(elements) ? "escape" : "unescape"
        }) || "";
        setStatus(elements, "", "");
      } catch (error) {
        elements.output.value = "";
        setStatus(elements, error?.message || "Could not convert text.", "error");
      }
    }

    async function copyText(text) {
      if (!text) return;
      if (copyTextToClipboard) {
        await copyTextToClipboard(text);
      } else {
        await navigator.clipboard?.writeText?.(text);
      }
    }

    function bindEvents(elements) {
      elements.input.addEventListener("input", function() { update(elements); });
      elements.mode.addEventListener("click", function() {
        setMode(elements, !isEscapeMode(elements));
        update(elements);
      });
      elements.paste.addEventListener("click", async function() {
        const text = await navigator.clipboard?.readText?.();
        if (typeof text === "string") {
          elements.input.value = text;
          update(elements);
        }
      });
      elements.clear.addEventListener("click", function() {
        elements.input.value = "";
        update(elements);
      });
      elements.copy.addEventListener("click", async function() {
        await copyText(elements.output.value);
        if (elements.output.value) setStatus(elements, "Copied output.", "success");
      });
    }

    function mountTextEscapeToolTab(tab, host) {
      if (!tab?.id || !host) return null;
      let view = mountedTabs.get(tab.id);
      if (!view || !view.isConnected) {
        view = createShell();
        const elements = getElements(view);
        bindEvents(elements);
        mountedTabs.set(tab.id, view);
        update(elements);
      }
      if (view.parentElement !== host) {
        host.textContent = "";
        host.appendChild(view);
      }
      return view;
    }

    function destroyTextEscapeToolTab(tabId) {
      const view = mountedTabs.get(tabId);
      if (view) view.remove();
      mountedTabs.delete(tabId);
    }

    function openTextEscapeTool() {
      return openTextEscapeToolInTab?.() || null;
    }

    document.querySelectorAll(".open-text-escape-tool").forEach(function(button) {
      button.addEventListener("click", openTextEscapeTool);
    });

    const api = { mountTextEscapeToolTab, destroyTextEscapeToolTab, openTextEscapeTool };
    app?.registerModule?.("textEscapeTool", api);
    return api;
  }

  root.registerMarkdownViewerTextEscapeTool = registerMarkdownViewerTextEscapeTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerTextEscapeTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
