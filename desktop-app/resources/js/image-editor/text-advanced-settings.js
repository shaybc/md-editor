// Theme-aware advanced typography settings popover for the image text tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  let panelSequence = 0;

  class ImageEditorTextAdvancedSettings {
    /**
     * Build the advanced typography popover.
     * @param {HTMLElement} host - Image-editor toolbar that owns the popover.
     * @param {object} callbacks - Live setting-change callback.
     */
    constructor(host, callbacks = {}) {
      this.host = host;
      this.callbacks = callbacks;
      this.anchor = null;
      this.element = document.createElement("section");
      const titleId = `image-editor-text-advanced-title-${++panelSequence}`;
      this.element.className = "image-editor-text-advanced-panel";
      this.element.hidden = true;
      this.element.setAttribute("role", "dialog");
      this.element.setAttribute("aria-modal", "true");
      this.element.setAttribute("aria-labelledby", titleId);
      this.element.innerHTML = `
        <header><strong id="${titleId}">Advanced settings</strong><button type="button" class="image-editor-text-advanced-close" title="Close" aria-label="Close advanced settings"><i class="bi bi-x-lg"></i></button></header>
        <div class="image-editor-text-advanced-body">
          <h4>Spacing</h4>
          <label><span>Letter spacing</span><span class="image-editor-text-setting-row"><input type="range" min="-5" max="20" step="0.5" data-text-setting="textLetterSpacing"><input type="number" min="-5" max="20" step="0.5" data-text-setting-number="textLetterSpacing" aria-label="Letter spacing value"></span></label>
          <label><span>Line spacing</span><span class="image-editor-text-setting-row"><input type="range" min="0.8" max="3" step="0.1" data-text-setting="textLineSpacing"><input type="number" min="0.8" max="3" step="0.1" data-text-setting-number="textLineSpacing" aria-label="Line spacing value"></span></label>
          <span class="image-editor-text-setting-label">Anchor text box</span>
          <div class="image-editor-text-segments" role="group" aria-label="Anchor text box">
            <button type="button" data-text-choice="textAnchor" data-value="top" title="Anchor top" aria-label="Anchor top"><i class="bi bi-align-top"></i></button>
            <button type="button" data-text-choice="textAnchor" data-value="middle" title="Anchor middle" aria-label="Anchor middle"><i class="bi bi-align-middle"></i></button>
            <button type="button" data-text-choice="textAnchor" data-value="bottom" title="Anchor bottom" aria-label="Anchor bottom"><i class="bi bi-align-bottom"></i></button>
          </div>
          <h4>Formatting</h4>
          <span class="image-editor-text-setting-label">Text position</span>
          <div class="image-editor-text-segments image-editor-text-position-segments" role="group" aria-label="Text position">
            <button type="button" data-text-choice="textPosition" data-value="normal" title="Normal text">A2</button>
            <button type="button" data-text-choice="textPosition" data-value="superscript" title="Superscript">A<sup>2</sup></button>
            <button type="button" data-text-choice="textPosition" data-value="subscript" title="Subscript">A<sub>2</sub></button>
          </div>
          <h4>Typography</h4>
          <span class="image-editor-text-setting-label">Kerning</span>
          <small>Refine letter spacing for visual balance</small>
          <div class="image-editor-text-segments" role="group" aria-label="Kerning">
            <button type="button" data-text-choice="textKerning" data-value="none">Off</button>
            <button type="button" data-text-choice="textKerning" data-value="auto">Auto</button>
          </div>
          <span class="image-editor-text-setting-label">Ligatures</span>
          <small>Combine compatible characters</small>
          <div class="image-editor-text-segments image-editor-text-ligature-segments" role="group" aria-label="Ligatures">
            <button type="button" data-text-choice="textLigatures" data-value="normal" title="Standard ligatures"><em>fi</em></button>
            <button type="button" data-text-choice="textLigatures" data-value="none" title="No ligatures">f<span>i</span></button>
          </div>
        </div>`;
      host.appendChild(this.element);
      this.bind();
    }

    bind() {
      this.element.querySelector(".image-editor-text-advanced-close").addEventListener("click", () => this.close());
      this.element.addEventListener("input", (event) => {
        const key = event.target.dataset.textSetting || event.target.dataset.textSettingNumber;
        if (!key) return;
        const value = Number(event.target.value);
        this.element.querySelector(`[data-text-setting="${key}"]`).value = String(value);
        this.element.querySelector(`[data-text-setting-number="${key}"]`).value = String(value);
        this.callbacks.onChange?.(key, value);
      });
      this.element.addEventListener("click", (event) => {
        const choice = event.target.closest("[data-text-choice]");
        if (!choice) return;
        this.callbacks.onChange?.(choice.dataset.textChoice, choice.dataset.value);
      });
      this.onDocumentPointerDown = (event) => {
        if (this.element.hidden || this.element.contains(event.target) || this.anchor?.contains(event.target)) return;
        this.close();
      };
      this.onDocumentKeyDown = (event) => {
        if (!this.element.hidden && event.key === "Escape") this.close();
      };
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
      document.addEventListener("keydown", this.onDocumentKeyDown, true);
    }

    /** Synchronize visible advanced controls with current text state. */
    update(state) {
      const style = namespace.normalizeImageEditorTextStyle(state);
      ["textLetterSpacing", "textLineSpacing"].forEach((key) => {
        this.element.querySelector(`[data-text-setting="${key}"]`).value = String(style[key]);
        this.element.querySelector(`[data-text-setting-number="${key}"]`).value = String(style[key]);
      });
      this.element.querySelectorAll("[data-text-choice]").forEach((button) => {
        const active = style[button.dataset.textChoice] === button.dataset.value;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    /** Open the popover beside the Advanced settings toolbar button. */
    open(anchor, state) {
      this.anchor = anchor;
      this.update(state);
      this.element.hidden = false;
      const rect = anchor.getBoundingClientRect();
      const width = this.element.offsetWidth || 330;
      const height = this.element.offsetHeight || 520;
      this.element.style.left = Math.max(8, Math.min(global.innerWidth - width - 8, rect.right - width)) + "px";
      this.element.style.top = Math.max(8, Math.min(global.innerHeight - height - 8, rect.bottom + 6)) + "px";
      anchor.setAttribute("aria-expanded", "true");
    }

    close() {
      this.element.hidden = true;
      this.anchor?.setAttribute("aria-expanded", "false");
      this.callbacks.onClose?.();
    }

    toggle(anchor, state) {
      if (!this.element.hidden) this.close();
      else this.open(anchor, state);
    }

    destroy() {
      document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
      document.removeEventListener("keydown", this.onDocumentKeyDown, true);
      this.element.remove();
    }
  }

  namespace.ImageEditorTextAdvancedSettings = ImageEditorTextAdvancedSettings;
})(typeof window !== "undefined" ? window : globalThis);
