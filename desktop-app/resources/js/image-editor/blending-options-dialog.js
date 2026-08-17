(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** App-styled, previewable editor for layer blend mode and opacity settings. */
  class ImageEditorBlendingOptionsDialog {
    constructor() {
      this.callbacks = {};
      this.overlay = document.createElement("div");
      this.overlay.className = "image-editor-blending-options-overlay image-editor-layer-style-overlay";
      this.overlay.hidden = true;
      this.overlay.innerHTML = `
        <section class="image-editor-blending-options-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-blending-title">
          <header class="image-editor-blending-options-header">
            <div><h2 id="image-editor-blending-title">Layer Compositing</h2><small class="image-editor-blending-options-target"></small></div>
            <button type="button" class="image-editor-blending-options-close settings-modal-close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
          </header>
          <div class="image-editor-blending-options-body">
            <label>Blend mode<select class="image-editor-blending-options-mode"></select></label>
            <label>Opacity <output class="image-editor-blending-options-opacity-value">100%</output><input class="image-editor-blending-options-opacity" type="range" min="0" max="100" value="100"></label>
            <label>Fill opacity <output class="image-editor-blending-options-fill-value">100%</output><input class="image-editor-blending-options-fill" type="range" min="0" max="100" value="100"></label>
            <label class="image-editor-blending-options-preview-label"><input class="image-editor-blending-options-preview" type="checkbox" checked> Preview</label>
          </div>
          <footer class="image-editor-blending-options-footer">
            <button type="button" class="image-editor-blending-options-cancel reset-modal-btn reset-modal-cancel">Cancel</button>
            <button type="button" class="image-editor-blending-options-apply reset-modal-btn settings-primary-action">Apply</button>
          </footer>
        </section>`;
      document.body.appendChild(this.overlay);
      this.dialog = this.overlay.querySelector("[role=dialog]");
      this.mode = this.overlay.querySelector(".image-editor-blending-options-mode");
      namespace.ImageEditorBlendingOptions.MODE_GROUPS.forEach((group) => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.label;
        group.modes.forEach(([value, label]) => optgroup.appendChild(new Option(label, value)));
        this.mode.appendChild(optgroup);
      });
      this.opacity = this.overlay.querySelector(".image-editor-blending-options-opacity");
      this.fillOpacity = this.overlay.querySelector(".image-editor-blending-options-fill");
      this.preview = this.overlay.querySelector(".image-editor-blending-options-preview");
      this.opacityValue = this.overlay.querySelector(".image-editor-blending-options-opacity-value");
      this.fillValue = this.overlay.querySelector(".image-editor-blending-options-fill-value");
      [this.mode, this.opacity, this.fillOpacity, this.preview].forEach((control) => control.addEventListener("input", () => this.updatePreview()));
      this.overlay.querySelector(".image-editor-blending-options-apply").addEventListener("click", () => this.apply());
      this.overlay.querySelector(".image-editor-blending-options-cancel").addEventListener("click", () => this.cancel());
      this.overlay.querySelector(".image-editor-blending-options-close").addEventListener("click", () => this.cancel());
      this.keydown = (event) => { if (!this.overlay.hidden && event.key === "Escape") { event.preventDefault(); this.cancel(); } };
      document.addEventListener("keydown", this.keydown, true);
    }

    value() {
      return namespace.ImageEditorBlendingOptions.normalize({
        blendMode: this.mode.value,
        opacity: Number(this.opacity.value) / 100,
        fillOpacity: Number(this.fillOpacity.value) / 100
      });
    }

    updatePreview() {
      this.opacityValue.value = `${this.opacity.value}%`;
      this.fillValue.value = `${this.fillOpacity.value}%`;
      this.callbacks.onPreview?.(this.value(), this.preview.checked);
    }

    open(options = {}) {
      this.callbacks = options;
      const initial = namespace.ImageEditorBlendingOptions.normalize(options.initial);
      this.mode.value = initial.blendMode;
      this.opacity.value = Math.round(initial.opacity * 100);
      this.fillOpacity.value = Math.round(initial.fillOpacity * 100);
      this.preview.checked = true;
      this.overlay.querySelector(".image-editor-blending-options-target").textContent = options.targetName || "";
      this.overlay.hidden = false;
      this.updatePreview();
      this.mode.focus();
    }

    close() { this.overlay.hidden = true; this.callbacks = {}; }
    cancel() { const callback = this.callbacks.onCancel; this.close(); callback?.(); }
    apply() { const callback = this.callbacks.onApply; const value = this.value(); this.close(); callback?.(value); }
    destroy() { document.removeEventListener("keydown", this.keydown, true); this.overlay.remove(); }
  }

  namespace.ImageEditorBlendingOptionsDialog = ImageEditorBlendingOptionsDialog;
})(typeof window !== "undefined" ? window : globalThis);
