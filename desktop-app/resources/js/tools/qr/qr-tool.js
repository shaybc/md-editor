(function(root) {
  "use strict";

  function registerMarkdownViewerQrTool(app, deps) {
    const codec = deps?.codec || app?.modules?.qrCodec || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openQrToolInTab = typeof deps?.openQrToolInTab === "function" ? deps.openQrToolInTab : null;
    const mountedTabs = new Map();

    function createShell() {
      const view = document.createElement("div");
      view.className = "qr-tool-view";
      view.innerHTML = `
        <div class="qr-tool-workspace">
          <header class="qr-tool-header">
            <h2><i class="bi bi-qr-code"></i> QR Code Encoder / Decoder</h2>
          </header>
          <div class="qr-tool-grid">
            <section class="qr-tool-text-panel">
              <div class="qr-tool-panel-heading">
                <span>Text</span>
                <div class="qr-tool-actions">
                  <button type="button" class="tool-button qr-tool-paste" title="Paste text"><i class="bi bi-clipboard"></i> Paste</button>
                  <button type="button" class="tool-button qr-tool-clear" title="Clear text"><i class="bi bi-x-lg"></i></button>
                  <button type="button" class="tool-button qr-tool-copy-text" title="Copy text"><i class="bi bi-copy"></i> Copy</button>
                </div>
              </div>
              <textarea class="qr-tool-text" spellcheck="false" placeholder="Enter text to generate a QR code"></textarea>
              <p class="qr-tool-status" aria-live="polite"></p>
            </section>
            <aside class="qr-tool-preview-panel">
              <div class="qr-tool-panel-heading">
                <span>QR Code</span>
                <div class="qr-tool-actions">
                  <button type="button" class="tool-button qr-tool-copy-svg" title="Copy QR SVG"><i class="bi bi-copy"></i> Copy SVG</button>
                  <button type="button" class="tool-button qr-tool-download" title="Download QR SVG"><i class="bi bi-download"></i> SVG</button>
                </div>
              </div>
              <div class="qr-tool-preview" aria-live="polite">
                <span>Enter text to generate a QR code.</span>
              </div>
            </aside>
          </div>
        </div>
      `;
      return view;
    }

    function getElements(view) {
      return {
        text: view.querySelector(".qr-tool-text"),
        preview: view.querySelector(".qr-tool-preview"),
        status: view.querySelector(".qr-tool-status"),
        paste: view.querySelector(".qr-tool-paste"),
        clear: view.querySelector(".qr-tool-clear"),
        copyText: view.querySelector(".qr-tool-copy-text"),
        copySvg: view.querySelector(".qr-tool-copy-svg"),
        download: view.querySelector(".qr-tool-download")
      };
    }

    function setStatus(elements, message, type) {
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type || "";
    }

    function setPreviewPlaceholder(elements, message) {
      elements.preview.classList.remove("has-qr");
      elements.preview.textContent = "";
      const placeholder = document.createElement("span");
      placeholder.textContent = message;
      elements.preview.appendChild(placeholder);
      elements.preview.dataset.svg = "";
    }

    function updateQr(elements) {
      const text = elements.text.value;
      if (!text) {
        setPreviewPlaceholder(elements, "Enter text to generate a QR code.");
        setStatus(elements, "", "");
        return;
      }
      if (!codec?.encodeText) {
        setPreviewPlaceholder(elements, "QR generator is unavailable.");
        setStatus(elements, "QR generator is unavailable.", "error");
        return;
      }
      try {
        const result = codec.encodeText(text);
        elements.preview.classList.add("has-qr");
        elements.preview.innerHTML = result.svg;
        elements.preview.dataset.svg = result.svg;
        setStatus(elements, `QR code generated. Version ${result.version}.`, "success");
      } catch (error) {
        setPreviewPlaceholder(elements, error?.message || "Could not generate QR code.");
        setStatus(elements, error?.message || "Could not generate QR code.", "error");
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

    function downloadSvg(svg) {
      if (!svg) return;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "qr-code.svg";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function bindEvents(elements) {
      elements.text.addEventListener("input", function() {
        updateQr(elements);
      });
      elements.paste.addEventListener("click", async function() {
        const text = await navigator.clipboard?.readText?.();
        if (typeof text === "string") {
          elements.text.value = text;
          updateQr(elements);
        }
      });
      elements.clear.addEventListener("click", function() {
        elements.text.value = "";
        updateQr(elements);
      });
      elements.copyText.addEventListener("click", async function() {
        await copyText(elements.text.value);
        setStatus(elements, "Copied text.", "success");
      });
      elements.copySvg.addEventListener("click", async function() {
        await copyText(elements.preview.dataset.svg || "");
        if (elements.preview.dataset.svg) setStatus(elements, "Copied QR SVG.", "success");
      });
      elements.download.addEventListener("click", function() {
        downloadSvg(elements.preview.dataset.svg || "");
      });
    }

    function mountQrToolTab(tab, host) {
      if (!tab?.id || !host) return null;
      let view = mountedTabs.get(tab.id);
      if (!view || !view.isConnected) {
        view = createShell();
        const elements = getElements(view);
        bindEvents(elements);
        mountedTabs.set(tab.id, view);
        updateQr(elements);
      }
      if (view.parentElement !== host) {
        host.textContent = "";
        host.appendChild(view);
      }
      return view;
    }

    function destroyQrToolTab(tabId) {
      const view = mountedTabs.get(tabId);
      if (view) view.remove();
      mountedTabs.delete(tabId);
    }

    function openQrTool() {
      return openQrToolInTab?.() || null;
    }

    document.querySelectorAll(".open-qr-tool").forEach(function(button) {
      button.addEventListener("click", openQrTool);
    });

    const api = {
      mountQrToolTab,
      destroyQrToolTab,
      openQrTool
    };
    app?.registerModule?.("qrTool", api);
    return api;
  }

  root.registerMarkdownViewerQrTool = registerMarkdownViewerQrTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      registerMarkdownViewerQrTool
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
