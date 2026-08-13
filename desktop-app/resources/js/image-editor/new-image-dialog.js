// New image document configuration dialog and clipboard-sized canvas discovery.
(function(global) {
  "use strict";

  const IMAGE_PRESETS = Object.freeze([
    { id: "classic-vga", name: "Classic", width: 640, height: 480 },
    { id: "classic-svga", name: "Classic", width: 800, height: 600 },
    { id: "classic-xga", name: "Classic", width: 1024, height: 768 },
    { id: "screen-hd", name: "HD", width: 1280, height: 720 },
    { id: "screen-full-hd", name: "Full HD", width: 1920, height: 1080 },
    { id: "social-square", name: "Square", width: 1080, height: 1080 },
    { id: "social-portrait", name: "Portrait", width: 1080, height: 1920 },
    { id: "social-card", name: "Social card", width: 1200, height: 630 },
    { id: "icon", name: "Icon", width: 512, height: 512 }
  ]);

  /** Parse one whole-pixel canvas dimension using the image editor's existing minimum. */
  function parseCanvasDimension(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 16 ? number : null;
  }

  /** Resolve a dialog background choice into the descriptor accepted by image tabs. */
  function resolveNewImageBackground(mode, customColor, currentBackgroundColor) {
    if (mode === "transparent") return { mode: "transparent" };
    if (mode === "black") return { mode: "solid", color: "#000000" };
    if (mode === "current") return { mode: "solid", color: currentBackgroundColor || "#ffffff" };
    if (mode === "custom") return { mode: "solid", color: customColor || "#ffffff" };
    return { mode: "solid", color: "#ffffff" };
  }

  /** Read only the dimensions of the first image available on the system clipboard. */
  async function readClipboardImageDimensions(navigatorRef, createImageBitmapRef) {
    if (!navigatorRef?.clipboard?.read || typeof createImageBitmapRef !== "function") return null;
    try {
      const items = await navigatorRef.clipboard.read();
      for (const item of items) {
        const imageType = Array.from(item.types || []).find((type) => String(type).startsWith("image/"));
        if (!imageType) continue;
        const bitmap = await createImageBitmapRef(await item.getType(imageType));
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  /** Register the tabless New Image dialog with the application module registry. */
  function registerMarkdownViewerNewImageDialog(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const navigatorRef = deps.navigator || global.navigator;
    const createImageBitmapRef = deps.createImageBitmap || global.createImageBitmap;
    const getCurrentBackgroundColor = deps.getCurrentBackgroundColor || (() => "#ffffff");
    let activeResolver = null;
    let previousFocus = null;
    let clipboardRequestId = 0;
    let state = null;

    function templateMarkup(template) {
      const ratio = Math.min(1, template.width / template.height);
      const previewWidth = ratio < 1 ? Math.max(22, Math.round(38 * ratio)) : 48;
      const previewHeight = ratio < 1 ? 48 : Math.max(22, Math.round(38 / ratio));
      return `<button class="new-image-template-card" type="button" data-new-image-template="${template.id}" aria-pressed="false">
        <span class="new-image-template-preview" style="--template-preview-width:${previewWidth}px;--template-preview-height:${previewHeight}px" aria-hidden="true"></span>
        <span class="new-image-template-name">${template.name}</span>
        <span class="new-image-template-size">${template.width} × ${template.height} px</span>
      </button>`;
    }

    function ensureModal() {
      let modal = documentRef?.getElementById?.("new-image-modal");
      if (modal || !documentRef?.body) return modal;
      modal = documentRef.createElement("div");
      modal.id = "new-image-modal";
      modal.className = "reset-modal-overlay new-image-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "new-image-modal-title");
      modal.setAttribute("aria-hidden", "true");
      modal.style.display = "none";
      modal.innerHTML = `<div class="reset-modal-box new-image-modal-box">
        <header class="new-image-modal-header">
          <div><h2 id="new-image-modal-title">New Image</h2><p>Create a blank layered image from a preset or custom canvas size.</p></div>
          <button class="new-image-close" type="button" data-new-image-cancel aria-label="Close">&times;</button>
        </header>
        <div class="new-image-modal-content">
          <section class="new-image-template-section" aria-labelledby="new-image-templates-title">
            <h3 id="new-image-templates-title">Canvas templates</h3>
            <div class="new-image-template-grid">
              <button class="new-image-template-card new-image-clipboard-card" type="button" data-new-image-template="clipboard" aria-pressed="false" disabled>
                <span class="new-image-clipboard-preview" aria-hidden="true"><i class="bi bi-clipboard"></i></span>
                <span class="new-image-template-name">Clipboard</span>
                <span class="new-image-template-size" data-new-image-clipboard-status>Checking clipboard…</span>
              </button>
              ${IMAGE_PRESETS.map(templateMarkup).join("")}
            </div>
          </section>
          <aside class="new-image-details" aria-labelledby="new-image-details-title">
            <h3 id="new-image-details-title">Canvas details</h3>
            <div class="new-image-dimension-grid">
              <label class="new-image-field"><span>Width</span><input id="new-image-width" type="number" min="16" step="1" inputmode="numeric"></label>
              <button class="new-image-swap-dimensions" type="button" data-new-image-swap aria-label="Swap width and height" title="Swap width and height"><i class="bi bi-arrow-left-right"></i></button>
              <label class="new-image-field"><span>Height</span><input id="new-image-height" type="number" min="16" step="1" inputmode="numeric"></label>
            </div>
            <p class="new-image-unit-label">Pixels</p>
            <label class="new-image-field"><span>Background contents</span><select id="new-image-background">
              <option value="transparent">Transparent</option><option value="white">White</option><option value="black">Black</option>
              <option value="current">Current background color</option><option value="custom">Custom color</option>
            </select></label>
            <label class="new-image-field new-image-custom-color" hidden><span>Custom color</span><input id="new-image-custom-color" type="color" value="#ffffff"></label>
            <div class="new-image-background-preview"><span data-new-image-background-swatch></span><span data-new-image-background-description>Transparent</span></div>
            <p class="new-image-validation" data-new-image-validation aria-live="polite"></p>
          </aside>
        </div>
        <footer class="reset-modal-actions new-image-actions">
          <button class="reset-modal-btn reset-modal-cancel" type="button" data-new-image-cancel>Cancel</button>
          <button class="reset-modal-btn settings-primary-action" type="button" data-new-image-create>Create</button>
        </footer>
      </div>`;
      documentRef.body.appendChild(modal);
      bindModalEvents(modal);
      return modal;
    }

    function modalParts(modal) {
      return {
        width: modal.querySelector("#new-image-width"), height: modal.querySelector("#new-image-height"),
        background: modal.querySelector("#new-image-background"), customColor: modal.querySelector("#new-image-custom-color"),
        customColorField: modal.querySelector(".new-image-custom-color"), create: modal.querySelector("[data-new-image-create]"),
        validation: modal.querySelector("[data-new-image-validation]"), clipboardCard: modal.querySelector('[data-new-image-template="clipboard"]'),
        clipboardStatus: modal.querySelector("[data-new-image-clipboard-status]"), swatch: modal.querySelector("[data-new-image-background-swatch]"),
        backgroundDescription: modal.querySelector("[data-new-image-background-description]")
      };
    }

    function selectTemplate(modal, templateId, width, height, userInitiated) {
      if (!state) return;
      state.selectedTemplateId = templateId;
      state.width = width;
      state.height = height;
      if (userInitiated) state.hasSizeInteraction = true;
      renderModal(modal);
    }

    function markCustomDimensions(modal) {
      if (!state) return;
      const parts = modalParts(modal);
      state.selectedTemplateId = "custom";
      state.hasSizeInteraction = true;
      state.width = parts.width.value;
      state.height = parts.height.value;
      renderModal(modal, { preserveDimensionInputs: true });
    }

    function renderBackground(parts) {
      const background = resolveNewImageBackground(state.backgroundMode, state.customColor, state.currentBackgroundColor);
      const isTransparent = background.mode === "transparent";
      parts.customColorField.hidden = state.backgroundMode !== "custom";
      parts.swatch.classList.toggle("is-transparent", isTransparent);
      parts.swatch.style.backgroundColor = isTransparent ? "transparent" : background.color;
      parts.backgroundDescription.textContent = isTransparent ? "Transparent" : background.color.toUpperCase();
    }

    function renderModal(modal, options = {}) {
      if (!state) return;
      const parts = modalParts(modal);
      if (!options.preserveDimensionInputs) {
        parts.width.value = String(state.width);
        parts.height.value = String(state.height);
      }
      parts.background.value = state.backgroundMode;
      parts.customColor.value = state.customColor;
      modal.querySelectorAll("[data-new-image-template]").forEach((card) => {
        const selected = card.dataset.newImageTemplate === state.selectedTemplateId;
        card.classList.toggle("is-selected", selected);
        card.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      const isValid = parseCanvasDimension(parts.width.value) !== null && parseCanvasDimension(parts.height.value) !== null;
      parts.create.disabled = !isValid;
      parts.validation.textContent = isValid ? "" : "Width and height must be whole numbers of at least 16 pixels.";
      renderBackground(parts);
    }

    function finish(result) {
      const modal = documentRef?.getElementById?.("new-image-modal");
      if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
      }
      clipboardRequestId += 1;
      const resolve = activeResolver;
      activeResolver = null;
      state = null;
      resolve?.(result);
      if (result === null) previousFocus?.focus?.();
      previousFocus = null;
    }

    function createImage(modal) {
      const parts = modalParts(modal);
      const width = parseCanvasDimension(parts.width.value);
      const height = parseCanvasDimension(parts.height.value);
      if (width === null || height === null) {
        renderModal(modal, { preserveDimensionInputs: true });
        parts.width.focus();
        return;
      }
      finish({ width, height, background: resolveNewImageBackground(state.backgroundMode, state.customColor, state.currentBackgroundColor) });
    }

    function bindModalEvents(modal) {
      modal.querySelectorAll("[data-new-image-cancel]").forEach((button) => button.addEventListener("click", () => finish(null)));
      modal.querySelector("[data-new-image-create]").addEventListener("click", () => createImage(modal));
      modal.querySelector("[data-new-image-swap]").addEventListener("click", () => {
        const parts = modalParts(modal);
        selectTemplate(modal, "custom", parts.height.value, parts.width.value, true);
      });
      modal.querySelectorAll("[data-new-image-template]").forEach((card) => card.addEventListener("click", () => {
        if (card.disabled) return;
        if (card.dataset.newImageTemplate === "clipboard") {
          selectTemplate(modal, "clipboard", state.clipboard?.width, state.clipboard?.height, true);
          return;
        }
        const template = IMAGE_PRESETS.find((candidate) => candidate.id === card.dataset.newImageTemplate);
        if (template) selectTemplate(modal, template.id, template.width, template.height, true);
      }));
      modal.querySelector("#new-image-width").addEventListener("input", () => markCustomDimensions(modal));
      modal.querySelector("#new-image-height").addEventListener("input", () => markCustomDimensions(modal));
      modal.querySelector("#new-image-background").addEventListener("change", (event) => {
        state.backgroundMode = event.target.value;
        renderModal(modal, { preserveDimensionInputs: true });
      });
      modal.querySelector("#new-image-custom-color").addEventListener("input", (event) => {
        state.customColor = event.target.value;
        renderModal(modal, { preserveDimensionInputs: true });
      });
      modal.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target?.type !== "button") {
          event.preventDefault();
          createImage(modal);
        }
      });
    }

    async function discoverClipboardDimensions(modal, requestId) {
      const dimensions = await readClipboardImageDimensions(navigatorRef, createImageBitmapRef);
      if (!state || requestId !== clipboardRequestId) return;
      const parts = modalParts(modal);
      state.clipboard = dimensions;
      parts.clipboardCard.disabled = !dimensions;
      parts.clipboardStatus.textContent = dimensions ? `${dimensions.width} × ${dimensions.height} px` : "No clipboard image available";
      if (dimensions && !state.hasSizeInteraction) selectTemplate(modal, "clipboard", dimensions.width, dimensions.height, false);
      else renderModal(modal, { preserveDimensionInputs: state.selectedTemplateId === "custom" });
    }

    /** Open the modal and resolve with a normalized blank-image descriptor or null. */
    function open(options = {}) {
      const modal = ensureModal();
      if (!modal) return Promise.resolve(null);
      if (activeResolver) finish(null);
      previousFocus = options.invoker || documentRef.activeElement;
      state = {
        width: 1920, height: 1080, selectedTemplateId: "screen-full-hd", hasSizeInteraction: false, clipboard: null,
        backgroundMode: "transparent", customColor: "#ffffff", currentBackgroundColor: getCurrentBackgroundColor() || "#ffffff"
      };
      const parts = modalParts(modal);
      parts.clipboardCard.disabled = true;
      parts.clipboardStatus.textContent = "Checking clipboard…";
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
      renderModal(modal);
      const requestId = ++clipboardRequestId;
      discoverClipboardDimensions(modal, requestId);
      global.requestAnimationFrame?.(() => parts.width.focus());
      return new Promise((resolve) => { activeResolver = resolve; });
    }

    const escapeEventTarget = typeof global.addEventListener === "function" ? global : documentRef;
    escapeEventTarget?.addEventListener?.("keydown", (event) => {
      if (!state || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      finish(null);
    }, true);

    const api = { open, presets: IMAGE_PRESETS };
    app?.registerModule?.("newImageDialog", api);
    return api;
  }

  global.registerMarkdownViewerNewImageDialog = registerMarkdownViewerNewImageDialog;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { IMAGE_PRESETS, parseCanvasDimension, resolveNewImageBackground, readClipboardImageDimensions, registerMarkdownViewerNewImageDialog };
  }
})(typeof window !== "undefined" ? window : globalThis);
