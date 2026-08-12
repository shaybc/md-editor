// DOM construction and coordinate mapping for raster image-editor tabs.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TOOL_ICONS = {
    select: "bi-bounding-box",
    pencil: "bi-pencil",
    brush: "bi-brush",
    line: "bi-slash-lg",
    curve: "bi-bezier2",
    rectangle: "bi-square",
    "rounded-rectangle": "bi-app",
    callout: "bi-chat-square",
    "oval-callout": "bi-chat-oval",
    ellipse: "bi-circle",
    polygon: "bi-pentagon",
    triangle: "bi-triangle",
    diamond: "bi-diamond",
    star: "bi-star",
    arrow: "bi-arrow-right",
    bucket: "bi-paint-bucket",
    text: "bi-fonts"
  };
  const TOOL_LABELS = { "rounded-rectangle": "Rounded rectangle", callout: "Rounded rectangular callout", "oval-callout": "Oval callout" };
  const PALETTE_COLORS = Object.freeze([
    "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27",
    "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
    "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e",
    "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7"
  ]);

  function button(icon, label, className) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `image-editor-button ${className || ""}`.trim();
    element.title = label;
    element.setAttribute("aria-label", label);
    element.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    return element;
  }

  function createToolButton(tool) {
    const element = button(TOOL_ICONS[tool], TOOL_LABELS[tool] || tool[0].toUpperCase() + tool.slice(1), "image-editor-tool");
    element.dataset.tool = tool;
    return element;
  }

  function createPaletteButton(color) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "image-editor-palette-color";
    element.dataset.paletteColor = color;
    element.style.backgroundColor = color;
    element.title = `Use ${color}`;
    element.setAttribute("aria-label", `Use ${color} for the active color`);
    return element;
  }

  class ImageEditorView {
    /**
     * Build the image-editor toolbar and layered canvas surface.
     * @param {HTMLElement} root - Managed tab root that owns this view.
     */
    constructor(root) {
      this.root = root;
      root.innerHTML = "";
      root.classList.add("image-editor-root");
      this.shell = document.createElement("div");
      this.shell.className = "image-editor-shell";
      this.shell.innerHTML = `
        <div class="image-editor-toolbar" role="toolbar" aria-label="Image editing tools">
          <div class="image-editor-command-grid image-editor-toolbar-group">
            <div class="image-editor-history-actions"></div>
            <div class="image-editor-selection-actions"></div>
          </div>
          <div class="image-editor-tools image-editor-toolbar-group"></div>
          <div class="image-editor-size-controls image-editor-toolbar-group">
            <label>Size <input class="image-editor-size" type="range" min="1" max="64" value="8"></label>
            <label><input class="image-editor-fill" type="checkbox"> Fill</label>
          </div>
          <div class="image-editor-color-targets image-editor-toolbar-group" role="group" aria-label="Active image colors">
            <label class="image-editor-color-target active" data-color-target="foreground" title="Foreground color">FG <input class="image-editor-foreground" type="color" value="#111111" aria-label="Foreground color"></label>
            <label class="image-editor-color-target" data-color-target="background" title="Background color">BG <input class="image-editor-background" type="color" value="#ffffff" aria-label="Background color"></label>
          </div>
          <div class="image-editor-color-palette image-editor-toolbar-group" role="group" aria-label="Predefined colors"></div>
          <div class="image-editor-dynamic-controls">
            <div class="image-editor-rounded-rectangle-controls image-editor-toolbar-group" hidden>
              <label>Radius <input class="image-editor-corner-radius" type="range" min="0" max="100" value="16"></label>
              <label><input class="image-editor-all-corners" type="checkbox" checked> All corners</label>
            </div>
            <div class="image-editor-callout-controls image-editor-toolbar-group" hidden>
              <label>Callout
                <select class="image-editor-callout-type" aria-label="Callout type">
                  <option value="callout">Rounded rectangular</option>
                  <option value="oval-callout">Oval</option>
                  <option value="cloud-callout">Cloud</option>
                </select>
              </label>
            </div>
            <div class="image-editor-star-controls image-editor-toolbar-group" hidden>
              <label>Star
                <select class="image-editor-star-points" aria-label="Star points">
                  <option value="4">4 points</option>
                  <option value="5">5 points</option>
                  <option value="6">6 points</option>
                </select>
              </label>
            </div>
            <div class="image-editor-arrow-controls image-editor-toolbar-group" hidden>
              <label>Direction
                <select class="image-editor-arrow-direction" aria-label="Arrow direction">
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>Head
                <select class="image-editor-arrow-head-angle" aria-label="Arrow head angle">
                  <option value="90">90°</option>
                  <option value="60">60°</option>
                  <option value="45">45°</option>
                  <option value="30">30°</option>
                </select>
              </label>
            </div>
            <div class="image-editor-text-controls image-editor-toolbar-group">
              <select class="image-editor-font" aria-label="Font family"><option>Arial</option><option>Georgia</option><option>Courier New</option></select>
              <input class="image-editor-font-size" type="number" min="8" max="144" value="24" aria-label="Font size">
              <button type="button" class="image-editor-format" data-format="bold" title="Bold"><strong>B</strong></button>
              <button type="button" class="image-editor-format" data-format="italic" title="Italic"><em>I</em></button>
            </div>
          </div>
        </div>
        <div class="image-editor-stage" tabindex="0" role="application" aria-label="Image editor canvas">
          <div class="image-editor-canvas-wrap">
            <canvas class="image-editor-canvas"></canvas>
            <canvas class="image-editor-overlay"></canvas>
            <span class="image-editor-canvas-resize image-editor-canvas-resize-e" data-canvas-resize="e" title="Resize canvas width" aria-hidden="true"></span>
            <span class="image-editor-canvas-resize image-editor-canvas-resize-s" data-canvas-resize="s" title="Resize canvas height" aria-hidden="true"></span>
            <span class="image-editor-canvas-resize image-editor-canvas-resize-se" data-canvas-resize="se" title="Resize canvas" aria-hidden="true"></span>
            <div class="image-editor-text-box" title="Drag the border to move text" hidden>
              <textarea class="image-editor-text-input" aria-label="Image text" hidden></textarea>
              <span class="image-editor-text-resize image-editor-text-resize-nw" data-text-resize="nw" aria-hidden="true"></span>
              <span class="image-editor-text-resize image-editor-text-resize-ne" data-text-resize="ne" aria-hidden="true"></span>
              <span class="image-editor-text-resize image-editor-text-resize-sw" data-text-resize="sw" aria-hidden="true"></span>
              <span class="image-editor-text-resize image-editor-text-resize-se" data-text-resize="se" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      `;
      root.appendChild(this.shell);
      this.toolbar = this.shell.querySelector(".image-editor-toolbar");
      this.stage = this.shell.querySelector(".image-editor-stage");
      this.wrap = this.shell.querySelector(".image-editor-canvas-wrap");
      this.canvas = this.shell.querySelector(".image-editor-canvas");
      this.overlay = this.shell.querySelector(".image-editor-overlay");
      this.textBox = this.shell.querySelector(".image-editor-text-box");
      this.textInput = this.shell.querySelector(".image-editor-text-input");
      this.context = this.canvas.getContext("2d", { willReadFrequently: true });
      this.overlayContext = this.overlay.getContext("2d");
      this.activeColorTarget = "foreground";

      namespace.tools.filter((tool) => tool !== "oval-callout" && tool !== "cloud-callout").forEach((tool) => this.shell.querySelector(".image-editor-tools").appendChild(createToolButton(tool)));
      [
        ["bi-arrow-counterclockwise", "Undo", "undo"],
        ["bi-arrow-clockwise", "Redo", "redo"]
      ].forEach(([icon, label, action]) => {
        const element = button(icon, label);
        element.dataset.action = action;
        this.shell.querySelector(".image-editor-history-actions").appendChild(element);
      });
      [
        ["bi-scissors", "Cut", "cut"], ["bi-copy", "Copy", "copy"],
        ["bi-clipboard", "Paste", "paste"], ["bi-trash", "Delete", "delete"]
      ].forEach(([icon, label, action]) => {
        const element = button(icon, label);
        element.dataset.action = action;
        this.shell.querySelector(".image-editor-selection-actions").appendChild(element);
      });
      PALETTE_COLORS.forEach((color) => this.shell.querySelector(".image-editor-color-palette").appendChild(createPaletteButton(color)));
    }

    setDimensions(width, height) {
      this.canvas.width = this.overlay.width = width;
      this.canvas.height = this.overlay.height = height;
      this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
      if (!this.textBox.hidden) this.hideTextInput();
    }

    setZoom(zoom) {
      const width = Math.round(this.canvas.width * zoom);
      const height = Math.round(this.canvas.height * zoom);
      this.wrap.style.width = `${width}px`;
      this.wrap.style.height = `${height}px`;
      [this.canvas, this.overlay].forEach((canvas) => {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      });
      if (!this.textBox.hidden && this.textRect) this.positionTextInput(this.textRect);
    }

    /**
     * Zoom while keeping the canvas point beneath the cursor at the same screen position.
     * @param {number} zoom - Requested zoom factor, where 1 is 100 percent.
     * @param {number} clientX - Cursor X coordinate in the browser viewport.
     * @param {number} clientY - Cursor Y coordinate in the browser viewport.
     */
    setZoomAtClientPoint(zoom, clientX, clientY) {
      const stageRect = this.stage.getBoundingClientRect();
      const wrapRect = this.wrap.getBoundingClientRect();
      const anchorX = Math.max(stageRect.left, Math.min(stageRect.right, Number(clientX)));
      const anchorY = Math.max(stageRect.top, Math.min(stageRect.bottom, Number(clientY)));
      const canvasRatioX = wrapRect.width ? (anchorX - wrapRect.left) / wrapRect.width : 0.5;
      const canvasRatioY = wrapRect.height ? (anchorY - wrapRect.top) / wrapRect.height : 0.5;
      this.setZoom(zoom);
      const zoomedWrapRect = this.wrap.getBoundingClientRect();
      this.stage.scrollLeft += zoomedWrapRect.left + canvasRatioX * zoomedWrapRect.width - anchorX;
      this.stage.scrollTop += zoomedWrapRect.top + canvasRatioY * zoomedWrapRect.height - anchorY;
    }

    /**
     * Resolve the canvas pixel at the top-left of the currently visible zoomed area.
     * @param {number} zoom - Current zoom factor, where 1 is 100 percent.
     * @returns {{x:number,y:number}} Integer canvas coordinates for newly pasted content.
     */
    getPasteOrigin(zoom) {
      if (Number(zoom) <= 1) return { x: 0, y: 0 };
      const stageRect = this.stage.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      const scaleX = canvasRect.width ? this.canvas.width / canvasRect.width : 1;
      const scaleY = canvasRect.height ? this.canvas.height / canvasRect.height : 1;
      return {
        x: Math.max(0, Math.min(this.canvas.width - 1, Math.ceil((stageRect.left - canvasRect.left) * scaleX))),
        y: Math.max(0, Math.min(this.canvas.height - 1, Math.ceil((stageRect.top - canvasRect.top) * scaleY)))
      };
    }

    /**
     * Show the edge that will become the canvas boundary when resizing finishes.
     * @param {string} handle - Active east, south, or southeast resize handle.
     */
    beginCanvasResizePreview(handle) {
      this.endCanvasResizePreview();
      const canvasRect = this.canvas.getBoundingClientRect();
      const element = document.createElement("div");
      element.className = `image-editor-canvas-resize-preview image-editor-canvas-resize-preview-${handle}`;
      document.body.appendChild(element);
      this.canvasResizePreview = {
        element,
        left: canvasRect.left,
        top: canvasRect.top,
        scaleX: canvasRect.width / this.canvas.width,
        scaleY: canvasRect.height / this.canvas.height
      };
      this.updateCanvasResizePreview(this.canvas.width, this.canvas.height);
    }

    /**
     * Move the pending canvas boundary without changing scrollable layout dimensions.
     * @param {number} width - Pending canvas width in image pixels.
     * @param {number} height - Pending canvas height in image pixels.
     */
    updateCanvasResizePreview(width, height) {
      const preview = this.canvasResizePreview;
      if (!preview) return;
      preview.element.style.left = `${preview.left}px`;
      preview.element.style.top = `${preview.top}px`;
      preview.element.style.width = `${width * preview.scaleX}px`;
      preview.element.style.height = `${height * preview.scaleY}px`;
    }

    /** Remove the pending canvas boundary guide. */
    endCanvasResizePreview() {
      this.canvasResizePreview?.element.remove();
      this.canvasResizePreview = null;
    }

    pointFromEvent(event) {
      const rect = this.overlay.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(this.canvas.width, (event.clientX - rect.left) * this.canvas.width / rect.width)),
        y: Math.max(0, Math.min(this.canvas.height, (event.clientY - rect.top) * this.canvas.height / rect.height))
      };
    }

    setActiveColorTarget(target, state) {
      this.activeColorTarget = target === "background" ? "background" : "foreground";
      this.shell.querySelectorAll("[data-color-target]").forEach((element) => {
        const active = element.dataset.colorTarget === this.activeColorTarget;
        element.classList.toggle("active", active);
      });
      this.updatePaletteSelection(state);
    }

    updatePaletteSelection(state) {
      const activeColor = this.activeColorTarget === "background" ? state.backgroundColor : state.foregroundColor;
      this.shell.querySelectorAll("[data-palette-color]").forEach((element) => {
        const selected = element.dataset.paletteColor.toLowerCase() === String(activeColor).toLowerCase();
        element.classList.toggle("selected", selected);
        element.setAttribute("aria-pressed", String(selected));
      });
    }

    update(state, commandState) {
      this.shell.querySelectorAll("[data-tool]").forEach((element) => {
        const active = element.dataset.tool === state.tool || (element.dataset.tool === "callout" && (state.tool === "oval-callout" || state.tool === "cloud-callout"));
        element.classList.toggle("active", active);
        element.setAttribute("aria-pressed", String(active));
      });
      this.shell.querySelector(".image-editor-foreground").value = state.foregroundColor;
      this.shell.querySelector(".image-editor-background").value = state.backgroundColor;
      this.setActiveColorTarget(this.activeColorTarget, state);
      this.shell.querySelector(".image-editor-fill").checked = state.fillShapes;
      this.shell.querySelector(".image-editor-corner-radius").value = String(state.cornerRadius);
      this.shell.querySelector(".image-editor-all-corners").checked = state.adjustAllCorners;
      this.shell.querySelector(".image-editor-rounded-rectangle-controls").hidden = state.tool !== "rounded-rectangle";
      const calloutActive = state.tool === "callout" || state.tool === "oval-callout" || state.tool === "cloud-callout";
      this.shell.querySelector(".image-editor-callout-controls").hidden = !calloutActive;
      if (calloutActive) this.shell.querySelector(".image-editor-callout-type").value = state.tool;
      this.shell.querySelector(".image-editor-star-controls").hidden = state.tool !== "star";
      this.shell.querySelector(".image-editor-star-points").value = String(state.starPoints);
      this.shell.querySelector(".image-editor-arrow-controls").hidden = state.tool !== "arrow";
      this.shell.querySelector(".image-editor-arrow-direction").value = state.arrowDirection;
      this.shell.querySelector(".image-editor-arrow-head-angle").value = String(state.arrowHeadAngle);
      this.shell.querySelector(".image-editor-text-controls").hidden = state.tool !== "text";
      ["undo", "redo", "cut", "copy", "delete"].forEach((action) => {
        const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
        const element = this.shell.querySelector(`[data-action="${action}"]`);
        if (element) element.disabled = commandState[key] !== true;
      });
    }

    getScale() {
      return {
        x: this.overlay.clientWidth / this.overlay.width,
        y: this.overlay.clientHeight / this.overlay.height
      };
    }

    rectFromPoints(start, end) {
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      };
    }

    applyTextInputStyle(state) {
      if (this.textInput.hidden) return;
      const scale = this.getScale();
      this.textInput.style.font = `${state.fontItalic ? "italic " : ""}${state.fontBold ? "bold " : ""}${state.fontSize * scale.y}px ${state.fontFamily}`;
      this.textInput.style.color = state.foregroundColor;
    }

    showTextInput(rect, state) {
      this.textBox.hidden = false;
      this.textInput.hidden = false;
      this.textInput.value = "";
      this.positionTextInput(rect);
      this.applyTextInputStyle(state);
      setTimeout(() => this.textInput.focus(), 0);
    }

    positionTextInput(rectOrPoint) {
      const scale = this.getScale();
      const previous = this.textRect || { width: 1, height: 1 };
      const rect = {
        x: rectOrPoint.x,
        y: rectOrPoint.y,
        width: rectOrPoint.width ?? previous.width,
        height: rectOrPoint.height ?? previous.height
      };
      this.textRect = rect;
      this.textBox.style.left = `${rect.x * scale.x}px`;
      this.textBox.style.top = `${rect.y * scale.y}px`;
      this.textBox.style.width = `${rect.width * scale.x}px`;
      this.textBox.style.height = `${rect.height * scale.y}px`;
    }

    getTextInputRect() {
      return this.textRect ? { ...this.textRect } : null;
    }

    getTextContentRect() {
      if (!this.textRect || this.textInput.hidden) return null;
      const canvasRect = this.canvas.getBoundingClientRect();
      const inputRect = this.textInput.getBoundingClientRect();
      const inputStyle = global.getComputedStyle(this.textInput);
      const scaleX = this.canvas.width / canvasRect.width;
      const scaleY = this.canvas.height / canvasRect.height;
      const left = parseFloat(inputStyle.paddingLeft) || 0;
      const top = parseFloat(inputStyle.paddingTop) || 0;
      const right = parseFloat(inputStyle.paddingRight) || 0;
      const bottom = parseFloat(inputStyle.paddingBottom) || 0;
      const fontSize = parseFloat(inputStyle.fontSize) || 24;
      const lineHeight = Number.isFinite(parseFloat(inputStyle.lineHeight)) ? parseFloat(inputStyle.lineHeight) : fontSize * 1.2;
      return {
        x: (inputRect.left - canvasRect.left + left) * scaleX,
        y: (inputRect.top - canvasRect.top + top) * scaleY,
        width: Math.max(1, (inputRect.width - left - right) * scaleX),
        height: Math.max(1, (inputRect.height - top - bottom) * scaleY),
        lineHeight: lineHeight * scaleY,
        fontSize: fontSize * scaleY
      };
    }

    hideTextInput() {
      this.textBox.hidden = true;
      this.textInput.hidden = true;
      this.textRect = null;
    }

    destroy() {
      this.endCanvasResizePreview();
      this.root.classList.remove("image-editor-root");
      this.root.innerHTML = "";
    }
  }

  namespace.ImageEditorView = ImageEditorView;
})(typeof window !== "undefined" ? window : globalThis);
