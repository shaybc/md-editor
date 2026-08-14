// Adds an HSB and opacity tab to the image editor color picker.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor;
  const BaseColorPicker = namespace.ImageEditorColorPicker;

  class ImageEditorHsbColorPicker extends BaseColorPicker {
    createPopover() {
      const element = super.createPopover();
      element.querySelector(".image-editor-color-picker-modes").insertAdjacentHTML("beforeend", `<button type="button" class="image-editor-color-picker-mode" data-color-picker-mode="hsb" role="tab" aria-selected="false" title="HSB and opacity" aria-label="HSB and opacity"><i class="bi bi-sliders" aria-hidden="true"></i></button>`);
      Array.from(element.children).slice(1).forEach((child) => {
        if (!child.classList.contains("image-editor-color-picker-hsb")) child.classList.add("image-editor-color-picker-standard");
      });
      element.insertAdjacentHTML("beforeend", `
        <div class="image-editor-color-picker-hsb" hidden>
          <output class="image-editor-color-picker-rgba">rgba(17, 17, 17, 1)</output>
          ${[
            ["hue", "Hue", 0, 359, "°"], ["brightness", "Brightness", 0, 100, "%"],
            ["saturation", "Saturation", 0, 100, "%"], ["opacity", "Opacity", 0, 100, "%"]
          ].map(([key, label, min, max, suffix]) => `<label class="image-editor-color-picker-slider image-editor-color-picker-slider-${key}"><span>${label}</span><output data-color-value="${key}"></output><input data-color-slider="${key}" type="range" min="${min}" max="${max}" aria-label="Color ${label.toLowerCase()}"><small>${suffix}</small></label>`).join("")}
          <div class="image-editor-color-picker-palette" role="group" aria-label="Base hue previews"></div>
        </div>`);
      this.opacities = { foreground: 1, background: 1 };
      this.hsbPanel = element.querySelector(".image-editor-color-picker-hsb");
      this.rgbaOutput = element.querySelector(".image-editor-color-picker-rgba");
      this.hsbInputs = Object.fromEntries(Array.from(element.querySelectorAll("[data-color-slider]")).map((input) => [input.dataset.colorSlider, input]));
      return element;
    }

    bind() {
      super.bind();
      Object.entries(this.hsbInputs).forEach(([key, input]) => input.addEventListener("input", () => {
        const value = Number(input.value);
        if (key === "hue") this.hsv.h = value;
        else if (key === "brightness") this.hsv.v = value / 100;
        else if (key === "saturation") this.hsv.s = value / 100;
        else this.opacities[this.target] = value / 100;
        this.commitColor();
      }));
    }

    setMode(mode) {
      if (mode !== "hsb") {
        super.setMode(mode);
        if (this.hsbPanel) this.hsbPanel.hidden = true;
        this.popover?.querySelectorAll(".image-editor-color-picker-hue, .image-editor-color-picker-value").forEach((element) => { element.hidden = false; });
        return;
      }
      this.mode = "hsb";
      this.popover.querySelectorAll("[data-color-picker-mode]").forEach((button) => {
        const active = button.dataset.colorPickerMode === "hsb";
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      this.popover.querySelectorAll(".image-editor-color-picker-standard").forEach((element) => { element.hidden = true; });
      this.hsbPanel.hidden = false;
      this.render();
    }

    setColor(target, color, opacity = this.opacities?.[target === "background" ? "background" : "foreground"] ?? 1) {
      const normalizedTarget = target === "background" ? "background" : "foreground";
      if (!this.opacities) this.opacities = { foreground: 1, background: 1 };
      this.opacities[normalizedTarget] = namespace.clampImageEditorColorValue(opacity);
      super.setColor(normalizedTarget, color);
      const trigger = this.root.querySelector(`[data-color-picker-target="${normalizedTarget}"]`);
      if (trigger) {
        trigger.style.setProperty("--image-editor-color-preview", namespace.imageEditorColorWithOpacity(color, this.opacities[normalizedTarget]));
        trigger.classList.toggle("has-transparency", this.opacities[normalizedTarget] < 1);
      }
    }

    commitColor() {
      const color = namespace.imageEditorHsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
      this.colors[this.target] = color;
      this.render();
      this.callbacks.onChange(this.target, color, this.opacities[this.target]);
    }

    render() {
      super.render();
      if (!this.hsbPanel) return;
      const opacity = this.opacities[this.target];
      const color = this.colors[this.target];
      const [red, green, blue] = namespace.imageEditorHexToRgb(color);
      const values = { hue: Math.round(this.hsv.h), brightness: Math.round(this.hsv.v * 100), saturation: Math.round(this.hsv.s * 100), opacity: Math.round(opacity * 100) };
      Object.entries(values).forEach(([key, value]) => {
        this.hsbInputs[key].value = String(value);
        const displayedValue = `${value}${key === "hue" ? "°" : "%"}`;
        const accessibleDisplayedValue = `${value}${key === "hue" ? "\u00b0" : "%"}`;
        this.hsbPanel.querySelector(`[data-color-value="${key}"]`).textContent = accessibleDisplayedValue;
        this.hsbInputs[key].setAttribute("aria-valuetext", accessibleDisplayedValue);
      });
      this.hsbInputs.hue.style.background = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
      this.hsbInputs.brightness.style.background = `linear-gradient(to right, #000, ${namespace.imageEditorHsvToHex(this.hsv.h, this.hsv.s, 1)})`;
      this.hsbInputs.saturation.style.background = `linear-gradient(to right, ${namespace.imageEditorHsvToHex(this.hsv.h, 0, this.hsv.v)}, ${namespace.imageEditorHsvToHex(this.hsv.h, 1, this.hsv.v)})`;
      this.hsbInputs.opacity.style.setProperty("--opacity-color", `rgb(${red}, ${green}, ${blue})`);
      const rgba = namespace.imageEditorColorWithOpacity(color, opacity);
      this.rgbaOutput.textContent = rgba;
      this.rgbaOutput.style.setProperty("--image-editor-color-preview", rgba);
      const background = getComputedStyle(this.popover).backgroundColor.match(/\d+/g);
      const backgroundHex = background ? `#${background.slice(0, 3).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}` : "#ffffff";
      this.rgbaOutput.style.color = namespace.imageEditorContrastTextColor(color, opacity, backgroundHex);
      const palette = this.hsbPanel.querySelector(".image-editor-color-picker-palette");
      palette.innerHTML = "";
      namespace.imageEditorPalettePreviewColors(this.hsv.s, this.hsv.v, opacity).forEach((preview) => {
        const swatch = document.createElement("span");
        swatch.className = "image-editor-color-picker-palette-swatch";
        swatch.style.setProperty("--image-editor-color-preview", preview.rgba);
        swatch.title = `${preview.name}: ${preview.rgba}`;
        swatch.setAttribute("role", "img");
        swatch.setAttribute("aria-label", swatch.title);
        palette.appendChild(swatch);
      });
    }
  }

  namespace.ImageEditorColorPicker = ImageEditorHsbColorPicker;
})(typeof window !== "undefined" ? window : globalThis);
