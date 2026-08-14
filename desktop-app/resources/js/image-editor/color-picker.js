// Two-mode color picker used by the image editor foreground and background controls.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PICKER_SIZE = 184;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function hexToHsv(hex) {
    const normalized = String(hex || "#000000").replace("#", "");
    const red = parseInt(normalized.slice(0, 2), 16) / 255;
    const green = parseInt(normalized.slice(2, 4), 16) / 255;
    const blue = parseInt(normalized.slice(4, 6), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta) {
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
      else hue = 60 * (((red - green) / delta) + 4);
    }
    return {
      h: (hue + 360) % 360,
      s: maximum ? delta / maximum : 0,
      v: maximum
    };
  }

  function hsvToHex(hue, saturation, value) {
    const chroma = value * saturation;
    const section = ((hue % 360) + 360) % 360 / 60;
    const secondary = chroma * (1 - Math.abs(section % 2 - 1));
    const offset = value - chroma;
    const channels = section < 1 ? [chroma, secondary, 0]
      : section < 2 ? [secondary, chroma, 0]
        : section < 3 ? [0, chroma, secondary]
          : section < 4 ? [0, secondary, chroma]
            : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    return `#${channels.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function drawColorWheel(context) {
    const image = context.createImageData(PICKER_SIZE, PICKER_SIZE);
    const center = PICKER_SIZE / 2;
    const radius = center - 2;
    for (let y = 0; y < PICKER_SIZE; y += 1) {
      for (let x = 0; x < PICKER_SIZE; x += 1) {
        const dx = x + 0.5 - center;
        const dy = y + 0.5 - center;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const index = (y * PICKER_SIZE + x) * 4;
        if (distance > radius) continue;
        const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const [red, green, blue] = hexToRgb(hsvToHex(hue, clamp(distance / radius, 0, 1), 1));
        image.data.set([red, green, blue, 255], index);
      }
    }
    context.putImageData(image, 0, 0);
  }

  function hexToRgb(hex) {
    const normalized = hex.slice(1);
    return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  }

  /** Owns the image editor's circular and rectangular color-selection surfaces. */
  class ImageEditorColorPicker {
    /**
     * @param {HTMLElement} root - Image editor root containing the color triggers.
     * @param {{onActivate:function(string):void,onChange:function(string,string):void}} callbacks - Existing toolbar color actions.
     */
    constructor(root, callbacks) {
      this.root = root;
      this.callbacks = callbacks;
      this.mode = "round";
      this.target = "foreground";
      this.colors = { foreground: "#111111", background: "#ffffff" };
      this.hsv = hexToHsv(this.colors.foreground);
      this.popover = this.createPopover();
      this.root.appendChild(this.popover);
      this.bind();
      this.setMode("round");
    }

    createPopover() {
      const element = document.createElement("div");
      element.className = "image-editor-color-picker";
      element.hidden = true;
      element.innerHTML = `
        <div class="image-editor-color-picker-modes" role="tablist" aria-label="Color picker shape">
          <button type="button" class="image-editor-color-picker-mode active" data-color-picker-mode="round" role="tab" aria-selected="true" title="Round color picker"><span class="image-editor-color-picker-round-icon"></span></button>
          <button type="button" class="image-editor-color-picker-mode" data-color-picker-mode="rectangular" role="tab" aria-selected="false" title="Rectangular color picker"><span class="image-editor-color-picker-rectangular-icon"></span></button>
        </div>
        <div class="image-editor-color-picker-surface image-editor-color-picker-surface-round"><canvas width="${PICKER_SIZE}" height="${PICKER_SIZE}" aria-label="Round color picker"></canvas><span class="image-editor-color-picker-indicator"></span></div>
        <div class="image-editor-color-picker-surface image-editor-color-picker-surface-rectangular" hidden><canvas width="${PICKER_SIZE}" height="${PICKER_SIZE}" aria-label="Rectangular color picker"></canvas><span class="image-editor-color-picker-indicator"></span></div>
        <label class="image-editor-color-picker-hue"><span>Hue</span><input type="range" min="0" max="359" value="0" aria-label="Color hue"></label>
        <output class="image-editor-color-picker-value">#111111</output>
      `;
      this.roundCanvas = element.querySelector(".image-editor-color-picker-surface-round canvas");
      this.rectangularCanvas = element.querySelector(".image-editor-color-picker-surface-rectangular canvas");
      this.hueInput = element.querySelector(".image-editor-color-picker-hue input");
      this.valueOutput = element.querySelector(".image-editor-color-picker-value");
      drawColorWheel(this.roundCanvas.getContext("2d"));
      return element;
    }

    bind() {
      this.onRootClick = (event) => {
        const trigger = event.target.closest("[data-color-picker-target]");
        if (!trigger) return;
        event.preventDefault();
        this.open(trigger.dataset.colorPickerTarget, trigger);
      };
      this.onPopoverClick = (event) => {
        const mode = event.target.closest("[data-color-picker-mode]")?.dataset.colorPickerMode;
        if (mode) this.setMode(mode);
      };
      this.onDocumentPointerDown = (event) => {
        if (!this.popover.hidden && !this.popover.contains(event.target) && !event.target.closest("[data-color-picker-target]")) this.close();
      };
      this.onDocumentKeyDown = (event) => {
        if (event.key === "Escape" && !this.popover.hidden) this.close();
      };
      this.root.addEventListener("click", this.onRootClick);
      this.popover.addEventListener("click", this.onPopoverClick);
      this.hueInput.addEventListener("input", () => {
        if (this.mode === "round") this.hsv.v = Number(this.hueInput.value) / 100;
        else this.hsv.h = Number(this.hueInput.value);
        this.commitColor();
      });
      this.bindCanvas(this.roundCanvas, "round");
      this.bindCanvas(this.rectangularCanvas, "rectangular");
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
      document.addEventListener("keydown", this.onDocumentKeyDown, true);
    }

    bindCanvas(canvas, mode) {
      const choose = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) * PICKER_SIZE / rect.width, 0, PICKER_SIZE);
        const y = clamp((event.clientY - rect.top) * PICKER_SIZE / rect.height, 0, PICKER_SIZE);
        if (mode === "round") {
          const center = PICKER_SIZE / 2;
          const dx = x - center;
          const dy = y - center;
          const radius = center - 2;
          if (Math.sqrt(dx * dx + dy * dy) > radius) return;
          this.hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          this.hsv.s = clamp(Math.sqrt(dx * dx + dy * dy) / radius, 0, 1);
        } else {
          this.hsv.s = clamp(x / PICKER_SIZE, 0, 1);
          this.hsv.v = clamp(1 - y / PICKER_SIZE, 0, 1);
        }
        this.commitColor();
      };
      canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture?.(event.pointerId);
        choose(event);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (event.buttons === 1) choose(event);
      });
    }

    open(target, anchor) {
      this.target = target === "background" ? "background" : "foreground";
      this.hsv = hexToHsv(this.colors[this.target]);
      this.callbacks.onActivate(this.target);
      this.popover.hidden = false;
      const rootRect = this.root.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      this.popover.style.left = `${Math.max(4, anchorRect.left - rootRect.left)}px`;
      this.popover.style.top = `${anchorRect.bottom - rootRect.top + 6}px`;
      this.render();
    }

    close() {
      this.popover.hidden = true;
    }

    setMode(mode) {
      this.mode = mode === "rectangular" ? "rectangular" : "round";
      this.popover.querySelectorAll("[data-color-picker-mode]").forEach((button) => {
        const active = button.dataset.colorPickerMode === this.mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      this.popover.querySelector(".image-editor-color-picker-surface-round").hidden = this.mode !== "round";
      this.popover.querySelector(".image-editor-color-picker-surface-rectangular").hidden = this.mode !== "rectangular";
      this.hueInput.max = this.mode === "round" ? "100" : "359";
      this.hueInput.setAttribute("aria-label", this.mode === "round" ? "Color brightness" : "Color hue");
      this.popover.querySelector(".image-editor-color-picker-hue span").textContent = this.mode === "round" ? "Value" : "Hue";
      this.render();
    }

    setColor(target, color) {
      const normalizedTarget = target === "background" ? "background" : "foreground";
      this.colors[normalizedTarget] = color;
      const trigger = this.root.querySelector(`[data-color-picker-target="${normalizedTarget}"]`);
      if (trigger) trigger.style.backgroundColor = color;
      if (this.target === normalizedTarget && !this.popover.hidden) {
        this.hsv = hexToHsv(color);
        this.render();
      }
    }

    commitColor() {
      const color = hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
      this.colors[this.target] = color;
      this.render();
      this.callbacks.onChange(this.target, color);
    }

    render() {
      this.hueInput.value = String(Math.round(this.mode === "round" ? this.hsv.v * 100 : this.hsv.h));
      this.hueInput.style.background = this.mode === "round"
        ? `linear-gradient(to right, #000, ${hsvToHex(this.hsv.h, this.hsv.s, 1)})`
        : "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
      this.valueOutput.value = this.colors[this.target];
      this.valueOutput.textContent = this.colors[this.target];
      const rectangularContext = this.rectangularCanvas.getContext("2d");
      rectangularContext.fillStyle = `hsl(${this.hsv.h} 100% 50%)`;
      rectangularContext.fillRect(0, 0, PICKER_SIZE, PICKER_SIZE);
      const white = rectangularContext.createLinearGradient(0, 0, PICKER_SIZE, 0);
      white.addColorStop(0, "#fff");
      white.addColorStop(1, "rgba(255,255,255,0)");
      rectangularContext.fillStyle = white;
      rectangularContext.fillRect(0, 0, PICKER_SIZE, PICKER_SIZE);
      const black = rectangularContext.createLinearGradient(0, 0, 0, PICKER_SIZE);
      black.addColorStop(0, "rgba(0,0,0,0)");
      black.addColorStop(1, "#000");
      rectangularContext.fillStyle = black;
      rectangularContext.fillRect(0, 0, PICKER_SIZE, PICKER_SIZE);
      const roundRadius = PICKER_SIZE / 2 - 2;
      this.positionIndicator("round", PICKER_SIZE / 2 + Math.cos(this.hsv.h * Math.PI / 180) * this.hsv.s * roundRadius, PICKER_SIZE / 2 + Math.sin(this.hsv.h * Math.PI / 180) * this.hsv.s * roundRadius);
      this.positionIndicator("rectangular", this.hsv.s * PICKER_SIZE, (1 - this.hsv.v) * PICKER_SIZE);
    }

    positionIndicator(mode, x, y) {
      const indicator = this.popover.querySelector(`.image-editor-color-picker-surface-${mode} .image-editor-color-picker-indicator`);
      indicator.style.left = `${clamp(x, 0, PICKER_SIZE)}px`;
      indicator.style.top = `${clamp(y, 0, PICKER_SIZE)}px`;
    }

    destroy() {
      this.root.removeEventListener("click", this.onRootClick);
      document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
      document.removeEventListener("keydown", this.onDocumentKeyDown, true);
      this.popover.remove();
    }
  }

  namespace.ImageEditorColorPicker = ImageEditorColorPicker;
})(typeof window !== "undefined" ? window : globalThis);
