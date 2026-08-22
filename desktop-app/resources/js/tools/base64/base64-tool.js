// Dev tool tab for live Base64 text and image conversion.
(function(global) {
  "use strict";

  function registerMarkdownViewerBase64Tool(app, deps = {}) {
    const mountedTabs = new Map();
    const converter = deps.converter || app?.services?.base64Converter || app?.modules?.base64Converter || null;

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatBytes(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    function setStatus(elements, message, type = "info") {
      if (!elements.status) return;
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type;
    }

    function readFileAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
        reader.readAsArrayBuffer(file);
      });
    }

    function showImagePreview(elements, dataUrl, metadata = {}) {
      elements.imageDataUrl = dataUrl || "";
      elements.imageMimeType = metadata.mimeType || "image/png";
      elements.preview.innerHTML = dataUrl
        ? `<img src="${escapeHtml(dataUrl)}" alt="Decoded Base64 image preview">`
        : "";
      elements.meta.textContent = dataUrl
        ? [metadata.name, metadata.mimeType, metadata.sizeText].filter(Boolean).join(" | ")
        : "No image loaded.";
    }

    function getDataUrlImageMimeType(value) {
      const match = String(value || "").trim().match(/^data:(image\/[^;,]+)(?:;[^,]*)?;base64,/i);
      return match ? match[1] : "";
    }

    function bytesStartWith(bytes, signature) {
      if (!bytes || bytes.length < signature.length) return false;
      return signature.every((value, index) => bytes[index] === value);
    }

    function inferImageMimeType(bytes, base64Text) {
      const dataUrlMimeType = getDataUrlImageMimeType(base64Text);
      if (dataUrlMimeType) return dataUrlMimeType;
      if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
      if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
      if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
      if (bytesStartWith(bytes, [0x42, 0x4d])) return "image/bmp";
      if (bytesStartWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
      if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12 && bytesStartWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) return "image/webp";
      const text = new TextDecoder().decode(bytes).trimStart();
      if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "image/svg+xml";
      return "";
    }

    function decodeBase64AsDisplayText(base64Text) {
      if (!converter?.decode || !converter?.decodeBytes) throw new Error("Base64 converter is unavailable.");
      try {
        return converter.decode(base64Text);
      } catch (_error) {
        const bytes = converter.decodeBytes(base64Text);
        return new TextDecoder().decode(bytes);
      }
    }

    function updateImagePreviewFromBase64(elements, base64Text, metadata = {}) {
      const value = String(base64Text || "");
      if (!value.trim() || !converter?.decodeBytes || !converter?.createDataUrl) {
        showImagePreview(elements, "");
        return;
      }
      try {
        const bytes = converter.decodeBytes(value);
        const mimeType = inferImageMimeType(bytes, value);
        if (!mimeType) {
          showImagePreview(elements, "");
          return;
        }
        showImagePreview(elements, converter.createDataUrl(bytes, mimeType), {
          name: metadata.name,
          mimeType,
          sizeText: metadata.sizeText || formatBytes(bytes.length)
        });
      } catch (_error) {
        showImagePreview(elements, "");
      }
    }

    function syncBase64FromText(elements) {
      if (elements.isSyncing) return;
      if (!converter?.encode) return setStatus(elements, "Base64 converter is unavailable.", "error");
      elements.isSyncing = true;
      elements.base64.value = converter.encode(elements.text.value);
      updateImagePreviewFromBase64(elements, elements.base64.value);
      elements.isSyncing = false;
      setStatus(elements, "Text encoded as Base64.", "success");
    }

    function syncTextFromBase64(elements, metadata = {}) {
      if (elements.isSyncing) return;
      const value = elements.base64.value;
      if (!String(value || "").trim()) {
        elements.isSyncing = true;
        elements.text.value = "";
        elements.isSyncing = false;
        showImagePreview(elements, "");
        setStatus(elements, "", "info");
        return;
      }
      try {
        const decodedText = decodeBase64AsDisplayText(value);
        elements.isSyncing = true;
        elements.text.value = decodedText;
        elements.isSyncing = false;
        updateImagePreviewFromBase64(elements, value, metadata);
        setStatus(elements, "Base64 decoded.", "success");
      } catch (_error) {
        elements.isSyncing = true;
        elements.text.value = "invalid Base64 text";
        elements.isSyncing = false;
        showImagePreview(elements, "");
        setStatus(elements, "invalid Base64 text", "error");
      }
    }

    async function encodeImageFile(elements, file) {
      if (!file) return;
      if (!converter?.createDataUrl) return setStatus(elements, "Base64 converter is unavailable.", "error");
      if (!String(file.type || "").startsWith("image/")) {
        setStatus(elements, "Select an image file to encode.", "error");
        return;
      }
      try {
        const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
        elements.base64.value = converter.createDataUrl(bytes, file.type || "application/octet-stream");
        syncTextFromBase64(elements, { name: file.name, mimeType: file.type, sizeText: formatBytes(file.size) });
      } catch (error) {
        setStatus(elements, error?.message || "Unable to encode image.", "error");
      }
    }

    function createShell() {
      const shell = document.createElement("div");
      shell.className = "base64-tool-view";
      shell.innerHTML = `
        <div class="base64-tool-workspace">
          <header class="base64-tool-header">
            <h2><i class="bi bi-file-binary" aria-hidden="true"></i> Base64 Encoder/Decoder</h2>
          </header>
          <main class="base64-tool-grid">
            <section class="base64-tool-panel base64-tool-text-panel">
              <div class="base64-tool-panel-heading">
                <label for="base64-tool-text">Text</label>
              </div>
              <textarea id="base64-tool-text" class="base64-tool-textarea base64-tool-text" spellcheck="false" placeholder="Enter text"></textarea>
              <div class="base64-tool-panel-heading">
                <label for="base64-tool-base64">Base64</label>
              </div>
              <textarea id="base64-tool-base64" class="base64-tool-textarea base64-tool-base64" spellcheck="false" placeholder="Paste Base64 text"></textarea>
            </section>
            <aside class="base64-tool-panel base64-tool-image-panel">
              <div class="base64-tool-dropzone" tabindex="0">
                <input class="base64-tool-file-input" type="file" accept="image/*" hidden>
                <i class="bi bi-image" aria-hidden="true"></i>
                <strong>Drop image here</strong>
                <div class="base64-tool-dropzone-actions">
                  <button class="tool-button base64-tool-browse" type="button">Browse</button>
                  <button class="tool-button base64-tool-paste-image" type="button">Paste image</button>
                </div>
              </div>
              <div class="base64-tool-preview-card">
                <div class="base64-tool-panel-heading">
                  <span>Image preview</span>
                </div>
                <div class="base64-tool-preview"></div>
                <p class="base64-tool-meta">No image loaded.</p>
              </div>
            </aside>
          </main>
          <footer class="base64-tool-status" role="status" aria-live="polite"></footer>
        </div>`;
      return shell;
    }

    function getElements(shell) {
      return {
        text: shell.querySelector(".base64-tool-text"),
        base64: shell.querySelector(".base64-tool-base64"),
        fileInput: shell.querySelector(".base64-tool-file-input"),
        browse: shell.querySelector(".base64-tool-browse"),
        pasteImage: shell.querySelector(".base64-tool-paste-image"),
        dropzone: shell.querySelector(".base64-tool-dropzone"),
        preview: shell.querySelector(".base64-tool-preview"),
        meta: shell.querySelector(".base64-tool-meta"),
        status: shell.querySelector(".base64-tool-status"),
        imageDataUrl: "",
        imageMimeType: "image/png",
        isSyncing: false
      };
    }

    async function pasteImage(elements) {
      const items = await global.navigator?.clipboard?.read?.();
      for (const item of items || []) {
        const type = (item.types || []).find((candidate) => String(candidate || "").startsWith("image/"));
        if (type) {
          await encodeImageFile(elements, await item.getType(type));
          return;
        }
      }
      setStatus(elements, "Clipboard does not contain an image.", "error");
    }

    function bindEvents(elements) {
      elements.text.addEventListener("input", () => syncBase64FromText(elements));
      elements.base64.addEventListener("input", () => syncTextFromBase64(elements));
      elements.base64.addEventListener("focus", () => syncTextFromBase64(elements));
      elements.base64.addEventListener("paste", () => setTimeout(() => syncTextFromBase64(elements), 0));
      elements.browse.addEventListener("click", () => elements.fileInput.click());
      elements.fileInput.addEventListener("change", () => encodeImageFile(elements, elements.fileInput.files?.[0]));
      elements.pasteImage.addEventListener("click", () => pasteImage(elements).catch((error) => setStatus(elements, error?.message || "Paste image failed.", "error")));
      elements.dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("drag-over");
      });
      elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("drag-over"));
      elements.dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("drag-over");
        encodeImageFile(elements, event.dataTransfer?.files?.[0]);
      });
    }

    function mountBase64ToolTab(tab, root) {
      if (!root || !tab?.id) return null;
      let state = mountedTabs.get(tab.id);
      if (!state || !state.shell?.isConnected) {
        root.textContent = "";
        const shell = createShell();
        const elements = getElements(shell);
        bindEvents(elements);
        state = { shell, elements };
        mountedTabs.set(tab.id, state);
        root.appendChild(shell);
      } else if (state.shell.parentElement !== root) {
        root.textContent = "";
        root.appendChild(state.shell);
      }
      return state.shell;
    }

    function destroyBase64ToolTab(tabId) {
      const state = mountedTabs.get(tabId);
      if (state?.shell?.isConnected) state.shell.remove();
      mountedTabs.delete(tabId);
    }

    function openBase64Tool() {
      return deps.openBase64ToolInTab?.() || null;
    }

    document.querySelectorAll?.(".open-base64-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openBase64Tool());
    });

    const api = { openBase64Tool, mountBase64ToolTab, destroyBase64ToolTab };
    app?.registerModule?.("base64Tool", api);
    return api;
  }

  global.registerMarkdownViewerBase64Tool = registerMarkdownViewerBase64Tool;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerBase64Tool };
  }
})(typeof window !== "undefined" ? window : globalThis);