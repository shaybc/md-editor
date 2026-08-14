// App-styled Color Range selection dialog for sampled-color mask configuration.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorColorRangeDialog {
    constructor(documentRef = global.document) {
      this.document = documentRef;
      this.modal = null;
      this.resolve = null;
      this.imageData = null;
      this.samples = [];
      this.sampleOperation = "replace";
    }

    ensureModal() {
      if (this.modal || !this.document?.body) return this.modal;
      const modal = this.document.createElement("div");
      modal.className = "reset-modal-overlay image-editor-color-range-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "image-editor-color-range-title");
      modal.hidden = true;
      modal.innerHTML = `<div class="reset-modal-box image-editor-color-range-box">
        <header class="image-editor-color-range-header">
          <div><h2 id="image-editor-color-range-title">Color Range</h2><p>Select pixels by sampling colors from the visible image.</p></div>
          <button type="button" data-color-range-cancel aria-label="Close">&times;</button>
        </header>
        <div class="image-editor-color-range-content">
          <label class="image-editor-color-range-field"><span>Select</span><select disabled><option>Sampled colors</option></select></label>
          <label class="image-editor-color-range-field"><span>Fuzziness <output data-color-range-fuzziness-value>40</output></span><input type="range" min="0" max="200" value="40" data-color-range-fuzziness></label>
          <div class="image-editor-color-range-sampling" role="group" aria-label="Color sample mode">
            <button type="button" data-color-range-operation="replace" class="active" title="Replace samples" aria-pressed="true"><i class="bi bi-eyedropper"></i></button>
            <button type="button" data-color-range-operation="add" title="Add sample" aria-pressed="false"><i class="bi bi-plus-lg"></i></button>
            <button type="button" data-color-range-operation="subtract" title="Subtract sample" aria-pressed="false"><i class="bi bi-dash-lg"></i></button>
            <span data-color-range-samples>No colors sampled</span>
          </div>
          <canvas class="image-editor-color-range-preview" width="360" height="220" data-color-range-preview aria-label="Color range preview"></canvas>
          <div class="image-editor-color-range-preview-options">
            <label><input type="radio" name="image-editor-color-range-preview" value="selection" checked> Selection</label>
            <label><input type="radio" name="image-editor-color-range-preview" value="image"> Image</label>
            <label><input type="checkbox" data-color-range-invert> Invert</label>
          </div>
          <p class="image-editor-color-range-hint" data-color-range-hint>Click the preview to sample a color.</p>
        </div>
        <footer class="reset-modal-actions">
          <button class="reset-modal-btn reset-modal-cancel" type="button" data-color-range-cancel>Cancel</button>
          <button class="reset-modal-btn settings-primary-action" type="button" data-color-range-apply disabled>Select</button>
        </footer>
      </div>`;
      this.document.body.appendChild(modal);
      this.modal = modal;
      this.bindEvents();
      return modal;
    }

    parts() {
      return {
        preview: this.modal.querySelector("[data-color-range-preview]"),
        fuzziness: this.modal.querySelector("[data-color-range-fuzziness]"),
        fuzzinessValue: this.modal.querySelector("[data-color-range-fuzziness-value]"),
        samples: this.modal.querySelector("[data-color-range-samples]"),
        invert: this.modal.querySelector("[data-color-range-invert]"),
        apply: this.modal.querySelector("[data-color-range-apply]"),
        hint: this.modal.querySelector("[data-color-range-hint]")
      };
    }

    bindEvents() {
      this.modal.addEventListener("click", (event) => {
        if (event.target.closest("[data-color-range-cancel]")) return this.close(null);
        const operation = event.target.closest("[data-color-range-operation]")?.dataset.colorRangeOperation;
        if (operation) {
          this.sampleOperation = operation;
          this.modal.querySelectorAll("[data-color-range-operation]").forEach((button) => {
            const active = button.dataset.colorRangeOperation === operation;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
          });
          return;
        }
        if (event.target.closest("[data-color-range-apply]")) {
          const result = this.currentResult();
          if (result) this.close(result);
        }
      });
      this.modal.querySelector("[data-color-range-fuzziness]").addEventListener("input", () => this.render());
      this.modal.querySelector("[data-color-range-invert]").addEventListener("change", () => this.render());
      this.modal.querySelectorAll('input[name="image-editor-color-range-preview"]').forEach((input) => input.addEventListener("change", () => this.render()));
      this.modal.querySelector("[data-color-range-preview]").addEventListener("pointerdown", (event) => this.sampleFromPreview(event));
      this.modal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); this.close(null); }
        if (event.key === "Enter" && !event.target.matches("input[type=range]") && !this.parts().apply.disabled) {
          event.preventDefault();
          this.close(this.currentResult());
        }
      });
    }

    sampleFromPreview(event) {
      if (!this.imageData) return;
      const canvas = this.parts().preview;
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * this.imageData.width / Math.max(1, bounds.width);
      const y = (event.clientY - bounds.top) * this.imageData.height / Math.max(1, bounds.height);
      const color = namespace.ImageEditorColorRangeSelection.samplePixel(this.imageData, x, y);
      if (!color) return;
      if (this.sampleOperation === "replace") this.samples = [];
      this.samples.push({ color: color.slice(0, 3), operation: this.sampleOperation });
      this.render();
    }

    currentResult() {
      const parts = this.parts();
      const mask = namespace.ImageEditorColorRangeSelection.buildMask(this.imageData, this.samples, { fuzziness: parts.fuzziness.value });
      return mask ? { mask, inverted: parts.invert.checked } : null;
    }

    render() {
      if (!this.imageData) return;
      const parts = this.parts();
      const result = this.currentResult();
      parts.fuzzinessValue.value = parts.fuzziness.value;
      parts.fuzzinessValue.textContent = parts.fuzziness.value;
      parts.samples.textContent = this.samples.length ? `${this.samples.length} color sample${this.samples.length === 1 ? "" : "s"}` : "No colors sampled";
      parts.apply.disabled = !result;
      parts.hint.textContent = result ? "Adjust fuzziness or sample additional colors." : "Click the preview to sample a color.";
      const context = parts.preview.getContext("2d");
      context.clearRect(0, 0, parts.preview.width, parts.preview.height);
      const source = this.document.createElement("canvas");
      source.width = this.imageData.width;
      source.height = this.imageData.height;
      source.getContext("2d").putImageData(this.imageData, 0, 0);
      const previewMode = this.modal.querySelector('input[name="image-editor-color-range-preview"]:checked')?.value || "selection";
      if (previewMode === "image" || !result) {
        context.drawImage(source, 0, 0, parts.preview.width, parts.preview.height);
        return;
      }
      const fullMask = new ImageData(this.imageData.width, this.imageData.height);
      for (let index = 0; index < fullMask.data.length; index += 4) {
        const value = result.inverted ? 255 : 0;
        fullMask.data[index] = fullMask.data[index + 1] = fullMask.data[index + 2] = value;
        fullMask.data[index + 3] = 255;
      }
      for (let y = 0; y < result.mask.height; y += 1) {
        for (let x = 0; x < result.mask.width; x += 1) {
          let alpha = result.mask.data[y * result.mask.width + x];
          if (result.inverted) alpha = 255 - alpha;
          const target = ((result.mask.y + y) * fullMask.width + result.mask.x + x) * 4;
          fullMask.data[target] = fullMask.data[target + 1] = fullMask.data[target + 2] = alpha;
          fullMask.data[target + 3] = 255;
        }
      }
      const maskCanvas = this.document.createElement("canvas");
      maskCanvas.width = fullMask.width;
      maskCanvas.height = fullMask.height;
      maskCanvas.getContext("2d").putImageData(fullMask, 0, 0);
      context.drawImage(maskCanvas, 0, 0, parts.preview.width, parts.preview.height);
    }

    /** Open the Color Range dialog for one layer-scoped raster source. */
    open(imageData) {
      const modal = this.ensureModal();
      if (!modal || !imageData) return Promise.resolve(null);
      if (this.resolve) this.close(null);
      this.imageData = imageData;
      this.samples = [];
      this.sampleOperation = "replace";
      const parts = this.parts();
      modal.querySelectorAll("[data-color-range-operation]").forEach((button) => {
        const active = button.dataset.colorRangeOperation === "replace";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      parts.fuzziness.value = "40";
      parts.invert.checked = false;
      modal.hidden = false;
      this.render();
      modal.querySelector("[data-color-range-operation]")?.focus();
      return new Promise((resolve) => { this.resolve = resolve; });
    }

    close(result) {
      if (!this.modal || this.modal.hidden) return;
      this.modal.hidden = true;
      const resolve = this.resolve;
      this.resolve = null;
      resolve?.(result);
    }

    destroy() {
      this.close(null);
      this.modal?.remove();
      this.modal = null;
    }
  }

  namespace.ImageEditorColorRangeDialog = ImageEditorColorRangeDialog;
})(typeof window !== "undefined" ? window : globalThis);
