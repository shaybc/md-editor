// App-styled editor for non-destructive layer effects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorLayerStyleDialog {
    constructor() {
      this.overlay = document.createElement("div");
      this.overlay.className = "image-editor-layer-style-overlay hidden";
      this.overlay.innerHTML = `<section class="image-editor-layer-style-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-layer-style-title">
        <header><div><h2 id="image-editor-layer-style-title">Layer Style</h2><p class="image-editor-layer-style-target"></p></div><button type="button" data-layer-style-action="cancel" aria-label="Close"><i class="bi bi-x-lg"></i></button></header>
        <div class="image-editor-layer-style-body">
          <nav><button type="button" class="selected"><i class="bi bi-check-square"></i> Drop Shadow</button></nav>
          <form>
            <label class="image-editor-layer-style-enabled"><input name="enabled" type="checkbox"> Enable Drop Shadow</label>
            <div class="image-editor-layer-style-grid">
              <label>Blend mode<select name="blendMode"><option value="multiply">Multiply</option><option value="normal">Normal</option></select></label>
              <label>Color<input name="color" type="color"></label>
              <label>Opacity <output data-output="opacity"></output><input name="opacity" type="range" min="0" max="100"></label>
              <label>Angle <output data-output="angle"></output><input name="angle" type="range" min="0" max="359"></label>
              <label>Distance <output data-output="distance"></output><input name="distance" type="range" min="0" max="200"></label>
              <label>Spread <output data-output="spread"></output><input name="spread" type="range" min="0" max="100"></label>
              <label>Size <output data-output="blur"></output><input name="blur" type="range" min="0" max="200"></label>
            </div>
            <label><input name="useGlobalLight" type="checkbox"> Use Global Light</label>
            <label><input name="preview" type="checkbox" checked> Preview</label>
          </form>
        </div>
        <footer><button type="button" data-layer-style-action="remove">Remove</button><span></span><button type="button" data-layer-style-action="cancel">Cancel</button><button type="button" class="primary" data-layer-style-action="apply">Apply</button></footer>
      </section>`;
      document.body.appendChild(this.overlay);
      this.form = this.overlay.querySelector("form");
      this.overlay.addEventListener("input", () => this.refreshPreview());
      this.overlay.addEventListener("change", () => this.refreshPreview());
      this.overlay.addEventListener("click", (event) => {
        const action = event.target.closest("[data-layer-style-action]")?.dataset.layerStyleAction;
        if (action) this.finish(action);
        else if (event.target === this.overlay) this.finish("cancel");
      });
      this.handleKeyDown = (event) => { if (!this.overlay.classList.contains("hidden") && event.key === "Escape") this.finish("cancel"); };
      document.addEventListener("keydown", this.handleKeyDown, true);
    }

    readEffect() {
      const data = new FormData(this.form);
      return namespace.ImageEditorDropShadowEffect.normalize({
        ...this.effect,
        enabled: data.get("enabled") === "on",
        blendMode: data.get("blendMode"), color: data.get("color"),
        opacity: Number(data.get("opacity")) / 100, angle: Number(data.get("angle")),
        distance: Number(data.get("distance")), spread: Number(data.get("spread")) / 100,
        blur: Number(data.get("blur")), useGlobalLight: data.get("useGlobalLight") === "on"
      });
    }

    updateOutputs() {
      ["opacity", "angle", "distance", "spread", "blur"].forEach((name) => {
        const input = this.form.elements[name];
        const suffix = name === "angle" ? "°" : name === "opacity" || name === "spread" ? "%" : " px";
        this.overlay.querySelector(`[data-output="${name}"]`).textContent = `${input.value}${suffix}`;
      });
    }

    refreshPreview() {
      this.updateOutputs();
      this.options?.onPreview?.(this.readEffect(), this.form.elements.preview.checked);
    }

    /** Open the Drop Shadow editor for one or more layers. */
    open(options) {
      this.options = options;
      this.effect = namespace.ImageEditorDropShadowEffect.normalize(options.effect || {});
      this.overlay.querySelector(".image-editor-layer-style-target").textContent = options.targetName || "Selected layers";
      const values = this.effect;
      Object.entries({ enabled: values.enabled, blendMode: values.blendMode, color: values.color, opacity: Math.round(values.opacity * 100), angle: values.angle, distance: values.distance, spread: Math.round(values.spread * 100), blur: values.blur, useGlobalLight: values.useGlobalLight }).forEach(([name, value]) => {
        const input = this.form.elements[name];
        if (input.type === "checkbox") input.checked = !!value; else input.value = value;
      });
      this.form.elements.preview.checked = true;
      this.overlay.querySelector('[data-layer-style-action="remove"]').disabled = options.hasEffect !== true;
      this.updateOutputs();
      this.overlay.classList.remove("hidden");
      this.form.elements.opacity.focus({ preventScroll: true });
      this.options.onPreview?.(this.effect, true);
    }

    finish(action) {
      if (!this.options) return;
      const options = this.options;
      const effect = this.readEffect();
      this.options = null;
      this.overlay.classList.add("hidden");
      if (action === "apply") options.onApply?.(effect);
      else if (action === "remove") options.onRemove?.();
      else options.onCancel?.();
    }

    destroy() {
      if (this.options) this.finish("cancel");
      document.removeEventListener("keydown", this.handleKeyDown, true);
      this.overlay.remove();
    }
  }

  namespace.ImageEditorLayerStyleDialog = ImageEditorLayerStyleDialog;
})(typeof window !== "undefined" ? window : globalThis);
