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
          <nav><button type="button" class="selected"><i class="bi bi-check-square"></i> <span class="image-editor-layer-style-name">Drop Shadow</span></button></nav>
          <form>
            <label class="image-editor-layer-style-enabled"><input name="enabled" type="checkbox"> <span class="image-editor-layer-style-enabled-name">Enable Drop Shadow</span></label>
            <div class="image-editor-layer-style-grid">
              <label>Blend mode<select name="blendMode"><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="normal">Normal</option></select></label>
              <label data-color-field>Color<input name="color" type="color"></label>
              <label>Opacity <output data-output="opacity"></output><input name="opacity" type="range" min="0" max="100"></label>
              <label data-directional-shadow-field>Angle <output data-output="angle"></output><input name="angle" type="range" min="0" max="359"></label>
              <label data-directional-shadow-field>Distance <output data-output="distance"></output><input name="distance" type="range" min="0" max="200"></label>
              <label>Spread <output data-output="spread"></output><input name="spread" type="range" min="0" max="100"></label>
              <label data-choke-field hidden>Choke <output data-output="choke"></output><input name="choke" type="range" min="0" max="100"></label>
              <label data-size-field>Size <output data-output="blur"></output><input name="blur" type="range" min="0" max="200"></label>
              <label data-pattern-field hidden>Pattern<select name="patternType"><option value="crosshatch">Crosshatch</option><option value="halftone">Halftone</option><option value="grain">Grain</option><option value="mosaic">Mosaic</option><option value="stained-glass">Stained glass</option><option value="pointillize">Pointillize</option></select></label>
              <label data-pattern-field hidden>Foreground<input name="foregroundColor" type="color"></label>
              <label data-pattern-field hidden>Background<input name="backgroundColor" type="color"></label>
              <label data-pattern-field hidden>Scale <output data-output="scale"></output><input name="scale" type="range" min="10" max="400"></label>
              <label data-pattern-field hidden>Angle <output data-output="patternAngle"></output><input name="patternAngle" type="range" min="0" max="359"></label>
              <label data-pattern-field hidden>Density <output data-output="density"></output><input name="density" type="range" min="10" max="90"></label>
              <label data-pattern-field hidden>Offset X<input name="offsetX" type="number" min="-4096" max="4096"></label>
              <label data-pattern-field hidden>Offset Y<input name="offsetY" type="number" min="-4096" max="4096"></label>
              <label data-gradient-field hidden>Style<select name="gradientStyle"><option value="linear">Linear</option><option value="radial">Radial</option><option value="angle">Angle</option><option value="reflected">Reflected</option><option value="diamond">Diamond</option></select></label>
              <label data-gradient-field hidden>Start color<input name="gradientStartColor" type="color"></label>
              <label data-gradient-field hidden>End color<input name="gradientEndColor" type="color"></label>
              <label data-gradient-field hidden>Angle <output data-output="gradientAngle"></output><input name="gradientAngle" type="range" min="0" max="359"></label>
              <label data-gradient-field hidden>Scale <output data-output="gradientScale"></output><input name="gradientScale" type="range" min="10" max="400"></label>
              <label data-gradient-field hidden>Offset X<input name="gradientOffsetX" type="number" min="-4096" max="4096"></label>
              <label data-gradient-field hidden>Offset Y<input name="gradientOffsetY" type="number" min="-4096" max="4096"></label>
              <label data-bevel-field hidden>Style<select name="bevelStyle"><option value="inner-bevel">Inner Bevel</option><option value="outer-bevel">Outer Bevel</option><option value="emboss">Emboss</option><option value="pillow-emboss">Pillow Emboss</option><option value="stroke-emboss">Stroke Emboss</option></select></label>
              <label data-bevel-field hidden>Technique<select name="bevelTechnique"><option value="smooth">Smooth</option><option value="chisel-hard">Chisel Hard</option><option value="chisel-soft">Chisel Soft</option></select></label>
              <label data-bevel-field hidden>Depth <output data-output="depth"></output><input name="depth" type="range" min="1" max="1000"></label>
              <label data-bevel-field hidden>Direction<select name="direction"><option value="up">Up</option><option value="down">Down</option></select></label>
              <label data-bevel-field hidden>Size <output data-output="bevelSize"></output><input name="bevelSize" type="range" min="0" max="250"></label>
              <label data-bevel-field hidden>Soften <output data-output="soften"></output><input name="soften" type="range" min="0" max="50"></label>
              <label data-bevel-field hidden>Angle <output data-output="bevelAngle"></output><input name="bevelAngle" type="range" min="0" max="359"></label>
              <label data-bevel-field hidden>Altitude <output data-output="altitude"></output><input name="altitude" type="range" min="0" max="90"></label>
              <label data-bevel-field hidden>Gloss contour<select name="glossContour"><option value="linear">Linear</option><option value="cone">Cone</option><option value="ring">Ring</option></select></label>
              <label data-bevel-field hidden>Highlight mode<select name="highlightBlendMode"><option value="screen">Screen</option><option value="normal">Normal</option></select></label>
              <label data-bevel-field hidden>Highlight color<input name="highlightColor" type="color"></label>
              <label data-bevel-field hidden>Highlight opacity <output data-output="highlightOpacity"></output><input name="highlightOpacity" type="range" min="0" max="100"></label>
              <label data-bevel-field hidden>Shadow mode<select name="shadowBlendMode"><option value="multiply">Multiply</option><option value="normal">Normal</option></select></label>
              <label data-bevel-field hidden>Shadow color<input name="shadowColor" type="color"></label>
              <label data-bevel-field hidden>Shadow opacity <output data-output="shadowOpacity"></output><input name="shadowOpacity" type="range" min="0" max="100"></label>
            </div>
            <label data-directional-shadow-field><input name="useGlobalLight" type="checkbox"> Use Global Light</label>
            <label data-pattern-field hidden><input name="linkWithLayer" type="checkbox"> Link with layer</label>
            <button data-pattern-field data-layer-style-action="snap-pattern" type="button" hidden>Snap to origin</button>
            <label data-gradient-field hidden><input name="gradientReverse" type="checkbox"> Reverse</label>
            <label data-gradient-field hidden><input name="gradientAlignWithLayer" type="checkbox"> Align with layer</label>
            <button data-gradient-field data-layer-style-action="snap-gradient" type="button" hidden>Snap to origin</button>
            <label data-bevel-field hidden><input name="bevelUseGlobalLight" type="checkbox"> Use Global Light</label>
            <label data-bevel-field hidden><input name="antialiased" type="checkbox"> Anti-aliased</label>
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
        if (action === "snap-pattern") {
          this.form.elements.offsetX.value = 0;
          this.form.elements.offsetY.value = 0;
          this.refreshPreview();
        } else if (action === "snap-gradient") {
          this.form.elements.gradientOffsetX.value = 0;
          this.form.elements.gradientOffsetY.value = 0;
          this.refreshPreview();
        } else if (action) this.finish(action);
        else if (event.target === this.overlay) this.finish("cancel");
      });
      this.handleKeyDown = (event) => { if (!this.overlay.classList.contains("hidden") && event.key === "Escape") this.finish("cancel"); };
      document.addEventListener("keydown", this.handleKeyDown, true);
    }

    readEffect() {
      const data = new FormData(this.form);
      if (this.styleType === "bevel-emboss") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          style: data.get("bevelStyle"), technique: data.get("bevelTechnique"),
          depth: Number(data.get("depth")), direction: data.get("direction"),
          size: Number(data.get("bevelSize")), soften: Number(data.get("soften")),
          angle: Number(data.get("bevelAngle")), altitude: Number(data.get("altitude")),
          useGlobalLight: data.get("bevelUseGlobalLight") === "on",
          glossContour: data.get("glossContour"), antialiased: data.get("antialiased") === "on",
          highlightBlendMode: data.get("highlightBlendMode"), highlightColor: data.get("highlightColor"),
          highlightOpacity: Number(data.get("highlightOpacity")) / 100,
          shadowBlendMode: data.get("shadowBlendMode"), shadowColor: data.get("shadowColor"),
          shadowOpacity: Number(data.get("shadowOpacity")) / 100
        });
      }
      if (this.styleType === "gradient-overlay") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          blendMode: data.get("blendMode"),
          opacity: Number(data.get("opacity")) / 100,
          style: data.get("gradientStyle"),
          startColor: data.get("gradientStartColor"),
          endColor: data.get("gradientEndColor"),
          angle: Number(data.get("gradientAngle")),
          scale: Number(data.get("gradientScale")),
          offsetX: Number(data.get("gradientOffsetX")),
          offsetY: Number(data.get("gradientOffsetY")),
          reverse: data.get("gradientReverse") === "on",
          alignWithLayer: data.get("gradientAlignWithLayer") === "on"
        });
      }
      if (this.styleType === "pattern-overlay") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          blendMode: data.get("blendMode"),
          opacity: Number(data.get("opacity")) / 100,
          patternType: data.get("patternType"),
          foregroundColor: data.get("foregroundColor"),
          backgroundColor: data.get("backgroundColor"),
          scale: Number(data.get("scale")),
          angle: Number(data.get("patternAngle")),
          density: Number(data.get("density")),
          offsetX: Number(data.get("offsetX")),
          offsetY: Number(data.get("offsetY")),
          linkWithLayer: data.get("linkWithLayer") === "on"
        });
      }
      return this.effectModel.normalize({
        ...this.effect,
        enabled: data.get("enabled") === "on",
        blendMode: data.get("blendMode"), color: data.get("color"),
        opacity: Number(data.get("opacity")) / 100,
        ...(["inner-glow", "outer-glow", "color-overlay"].includes(this.styleType) ? {} : { angle: Number(data.get("angle")), distance: Number(data.get("distance")), useGlobalLight: data.get("useGlobalLight") === "on" }),
        ...(this.styleType === "color-overlay" ? {} : this.styleType === "inner-shadow" || this.styleType === "inner-glow"
          ? { choke: Number(data.get("choke")) / 100 }
          : { spread: Number(data.get("spread")) / 100 }),
        ...(this.styleType === "color-overlay" ? {} : { blur: Number(data.get("blur")) })
      });
    }

    updateOutputs() {
      const names = this.styleType === "bevel-emboss"
        ? ["depth", "bevelSize", "soften", "bevelAngle", "altitude", "highlightOpacity", "shadowOpacity"]
        : this.styleType === "gradient-overlay"
        ? ["opacity", "gradientAngle", "gradientScale"]
        : this.styleType === "pattern-overlay"
        ? ["opacity", "scale", "patternAngle", "density"]
        : this.styleType === "color-overlay"
        ? ["opacity"]
        : ["inner-glow", "outer-glow"].includes(this.styleType)
        ? ["opacity", this.styleType === "inner-glow" ? "choke" : "spread", "blur"]
        : ["opacity", "angle", "distance", this.styleType === "inner-shadow" ? "choke" : "spread", "blur"];
      names.forEach((name) => {
        const input = this.form.elements[name];
        const suffix = ["angle", "patternAngle", "gradientAngle", "bevelAngle", "altitude"].includes(name) ? "°" : ["opacity", "spread", "choke", "scale", "density", "gradientScale", "depth", "highlightOpacity", "shadowOpacity"].includes(name) ? "%" : " px";
        this.overlay.querySelector(`[data-output="${name}"]`).textContent = `${input.value}${suffix}`;
      });
    }

    refreshPreview() {
      this.updateOutputs();
      this.options?.onPreview?.(this.readEffect(), this.form.elements.preview.checked);
    }

    /** Open the requested shadow editor for one or more layers. */
    open(options) {
      this.options = options;
      this.styleType = ["inner-shadow", "inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay", "bevel-emboss"].includes(options.styleType) ? options.styleType : "drop-shadow";
      this.effectModel = this.styleType === "inner-shadow"
        ? namespace.ImageEditorInnerShadowEffect
        : this.styleType === "inner-glow" ? namespace.ImageEditorInnerGlowEffect
          : this.styleType === "outer-glow" ? namespace.ImageEditorOuterGlowEffect
            : this.styleType === "color-overlay" ? namespace.ImageEditorColorOverlayEffect
              : this.styleType === "gradient-overlay" ? namespace.ImageEditorGradientOverlayEffect
                : this.styleType === "pattern-overlay" ? namespace.ImageEditorPatternOverlayEffect
                  : this.styleType === "bevel-emboss" ? namespace.ImageEditorBevelEmbossEffect : namespace.ImageEditorDropShadowEffect;
      const styleName = this.styleType === "inner-shadow" ? "Inner Shadow" : this.styleType === "inner-glow" ? "Inner Glow" : this.styleType === "outer-glow" ? "Outer Glow" : this.styleType === "color-overlay" ? "Color Overlay" : this.styleType === "gradient-overlay" ? "Gradient Overlay" : this.styleType === "pattern-overlay" ? "Pattern Overlay" : this.styleType === "bevel-emboss" ? "Bevel & Emboss" : "Drop Shadow";
      this.effect = this.effectModel.normalize(options.effect || {});
      this.overlay.querySelector(".image-editor-layer-style-target").textContent = options.targetName || "Selected layers";
      this.overlay.querySelector(".image-editor-layer-style-name").textContent = styleName;
      this.overlay.querySelector(".image-editor-layer-style-enabled-name").textContent = `Enable ${styleName}`;
      ["blendMode", "color", "opacity", "angle", "distance", "spread", "choke", "blur", "useGlobalLight"].forEach((name) => {
        this.form.elements[name].closest("label").hidden = false;
      });
      this.form.elements.spread.closest("label").hidden = !["drop-shadow", "outer-glow"].includes(this.styleType);
      this.overlay.querySelector("[data-choke-field]").hidden = !["inner-shadow", "inner-glow"].includes(this.styleType);
      this.overlay.querySelector("[data-size-field]").hidden = ["color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType);
      this.overlay.querySelector("[data-color-field]").hidden = ["gradient-overlay", "pattern-overlay"].includes(this.styleType);
      this.overlay.querySelectorAll("[data-gradient-field]").forEach((field) => { field.hidden = this.styleType !== "gradient-overlay"; });
      this.overlay.querySelectorAll("[data-pattern-field]").forEach((field) => { field.hidden = this.styleType !== "pattern-overlay"; });
      this.overlay.querySelectorAll("[data-bevel-field]").forEach((field) => { field.hidden = this.styleType !== "bevel-emboss"; });
      this.overlay.querySelectorAll("[data-directional-shadow-field]").forEach((field) => { field.hidden = ["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType); });
      const screenBlendOption = this.form.elements.blendMode.querySelector('option[value="screen"]');
      screenBlendOption.hidden = !["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType);
      screenBlendOption.disabled = !["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType);
      ["blendMode", "color", "opacity", "angle", "distance", "spread", "choke", "blur", "useGlobalLight"].forEach((name) => {
        if (this.styleType === "bevel-emboss") this.form.elements[name].closest("label").hidden = true;
      });
      const values = this.effect;
      Object.entries({ enabled: values.enabled, blendMode: values.blendMode, color: values.color || "#000000", opacity: Math.round(values.opacity * 100), angle: values.angle || 0, distance: values.distance || 0, spread: Math.round((values.spread || 0) * 100), choke: Math.round((values.choke || 0) * 100), blur: values.blur || 0, useGlobalLight: values.useGlobalLight, patternType: values.patternType || "crosshatch", foregroundColor: values.foregroundColor || "#000000", backgroundColor: values.backgroundColor || "#FFFFFF", scale: values.scale || 100, patternAngle: values.angle || 0, density: values.density || 50, offsetX: values.offsetX || 0, offsetY: values.offsetY || 0, linkWithLayer: values.linkWithLayer, gradientStyle: values.style || "linear", gradientStartColor: values.startColor || "#000000", gradientEndColor: values.endColor || "#FFFFFF", gradientAngle: values.angle ?? 90, gradientScale: values.scale || 100, gradientOffsetX: values.offsetX || 0, gradientOffsetY: values.offsetY || 0, gradientReverse: values.reverse, gradientAlignWithLayer: values.alignWithLayer, bevelStyle: values.style || "inner-bevel", bevelTechnique: values.technique || "smooth", depth: values.depth || 100, direction: values.direction || "up", bevelSize: values.size ?? 5, soften: values.soften || 0, bevelAngle: values.angle ?? 120, altitude: values.altitude ?? 30, glossContour: values.glossContour || "linear", highlightBlendMode: values.highlightBlendMode || "screen", highlightColor: values.highlightColor || "#FFFFFF", highlightOpacity: Math.round((values.highlightOpacity ?? 0.75) * 100), shadowBlendMode: values.shadowBlendMode || "multiply", shadowColor: values.shadowColor || "#000000", shadowOpacity: Math.round((values.shadowOpacity ?? 0.75) * 100), bevelUseGlobalLight: values.useGlobalLight, antialiased: values.antialiased }).forEach(([name, value]) => {
        const input = this.form.elements[name];
        if (input.type === "checkbox") input.checked = !!value; else input.value = value;
      });
      this.form.elements.preview.checked = true;
      this.overlay.querySelector('[data-layer-style-action="remove"]').disabled = options.hasEffect !== true;
      this.updateOutputs();
      this.overlay.classList.remove("hidden");
      (this.styleType === "gradient-overlay" ? this.form.elements.gradientStyle : this.styleType === "pattern-overlay" ? this.form.elements.patternType : this.styleType === "bevel-emboss" ? this.form.elements.bevelStyle : this.form.elements.opacity).focus({ preventScroll: true });
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
