(function registerImageEditorPaletteDialog(global) {
  "use strict";

  function rgb(color) {
    return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  }

  function hsb(color) {
    const [red, green, blue] = rgb(color).map((value) => value / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
    }
    return [Math.round((hue + 360) % 360), Math.round(max ? delta / max * 100 : 0), Math.round(max * 100)];
  }

  function formatted(color, format) {
    if (format === "rgb") return `rgb(${rgb(color).join(", ")})`;
    if (format === "hsb") {
      const values = hsb(color);
      return `hsb(${values[0]}°, ${values[1]}%, ${values[2]}%)`;
    }
    return color;
  }

  function contrast(color) {
    const values = rgb(color).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.45 ? "#111111" : "#FFFFFF";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  }

  /** Owns catalog, detail, and custom-editor views for image-editor palettes. */
  class ImageEditorPaletteDialog {
    constructor(options) {
      this.options = options;
      this.store = options.store;
      this.format = "hex";
      this.view = "catalog";
      this.palette = null;
      this.draft = null;
      this.element = this.createElement();
      document.body.appendChild(this.element);
      this.bind();
    }

    createElement() {
      const element = document.createElement("div");
      element.className = "image-editor-palette-modal";
      element.hidden = true;
      element.innerHTML = `<div class="image-editor-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-palette-title">
        <header><button type="button" class="image-editor-palette-back" data-palette-action="back" aria-label="Back" hidden><i class="bi bi-arrow-left"></i></button><div><h2 id="image-editor-palette-title">Color palettes</h2><p>Choose, inspect, import, or create a toolbar palette.</p></div><div class="image-editor-palette-header-actions"><button type="button" data-palette-action="import" title="Import ASE" aria-label="Import ASE"><i class="bi bi-upload"></i></button><button type="button" data-palette-action="add" title="Add custom palette" aria-label="Add custom palette"><i class="bi bi-plus-lg"></i></button><button type="button" data-palette-action="close" title="Close" aria-label="Close"><i class="bi bi-x-lg"></i></button></div></header>
        <div class="image-editor-palette-message" role="status" hidden></div>
        <main class="image-editor-palette-dialog-body"></main>
      </div>`;
      return element;
    }

    bind() {
      this.element.addEventListener("click", (event) => void this.handleClick(event));
      this.element.addEventListener("dblclick", (event) => this.editHex(event));
      this.element.addEventListener("input", (event) => {
        if (event.target.matches("[data-palette-name]")) this.draft.name = event.target.value;
        this.updateSaveState();
      });
      this.element.addEventListener("pointerdown", (event) => { if (event.target === this.element) this.close(); });
      this.onKeyDown = (event) => { if (!this.element.hidden && event.key === "Escape") this.close(); };
      document.addEventListener("keydown", this.onKeyDown, true);
    }

    open() {
      this.element.hidden = false;
      this.showCatalog();
      this.element.querySelector("[data-palette-action='close']")?.focus();
    }

    close() {
      this.element.hidden = true;
      this.draft = null;
      this.options.onClose?.();
    }

    notify(message, error = false) {
      const target = this.element.querySelector(".image-editor-palette-message");
      target.textContent = message;
      target.classList.toggle("is-error", error);
      target.hidden = !message;
    }

    showCatalog() {
      this.view = "catalog";
      this.palette = null;
      this.draft = null;
      this.element.querySelector(".image-editor-palette-back").hidden = true;
      const active = this.store.active().id;
      const cards = this.store.list().map((palette) => {
        const colors = this.options.catalog.previewColors(palette);
        return `<article class="image-editor-palette-card" data-palette-id="${escapeHtml(palette.id)}"><div class="image-editor-palette-card-title"><strong>${escapeHtml(palette.name)}</strong>${palette.id === active ? '<span class="image-editor-palette-active-label">Active</span>' : ""}</div><div class="image-editor-palette-strip">${colors.map((color) => `<span style="background:${color}"></span>`).join("")}</div><div class="image-editor-palette-card-actions"><button type="button" data-palette-action="apply" title="Apply palette" aria-label="Apply ${escapeHtml(palette.name)}"><i class="bi bi-check-lg"></i></button><button type="button" data-palette-action="details" title="Palette details" aria-label="Details for ${escapeHtml(palette.name)}"><i class="bi bi-info-circle"></i></button><button type="button" data-palette-action="export" title="Export ASE" aria-label="Export ${escapeHtml(palette.name)} as ASE"><i class="bi bi-download"></i></button></div></article>`;
      }).join("");
      this.element.querySelector(".image-editor-palette-dialog-body").innerHTML = `<section class="image-editor-palette-catalog">${cards}</section>`;
    }

    showDetails(palette, edit = false) {
      this.view = edit ? "edit" : "details";
      this.palette = palette;
      if (edit && !this.draft) this.draft = { name: "", slots: Array(12).fill(null) };
      this.element.querySelector(".image-editor-palette-back").hidden = false;
      const source = edit ? this.draft : palette;
      const colors = edit ? source.slots.map((color) => color || "#FFFFFF") : this.options.catalog.previewColors(source);
      const swatches = colors.map((color, index) => `<div class="image-editor-palette-detail-swatch" data-slot="${index}"><button type="button" data-palette-action="pick" style="--palette-color:${color}" aria-label="${edit ? "Edit" : "Color"} ${index + 1}"></button><span data-palette-value="${index}" style="background:${color};color:${contrast(color)}">${source.slots?.[index] ? formatted(source.slots[index], this.format) : edit ? "Empty" : formatted(color, this.format)}</span><button type="button" data-palette-action="copy-color" aria-label="Copy color ${index + 1}"><i class="bi bi-copy"></i></button></div>`).join("");
      const nameField = edit ? `<label>Name <input type="text" data-palette-name placeholder="Custom palette" value="${escapeHtml(this.draft.name)}"></label>` : `<h3>${escapeHtml(palette.name)}</h3>`;
      const saveDisabled = edit && !this.draft.slots.some(Boolean) ? " disabled" : "";
      this.element.querySelector(".image-editor-palette-dialog-body").innerHTML = `<section class="image-editor-palette-details"><div class="image-editor-palette-detail-heading">${nameField}<label>Values <select data-palette-format><option value="hex">Hex</option><option value="rgb">RGB</option><option value="hsb">HSB</option></select></label></div><div class="image-editor-palette-detail-grid">${swatches}</div><div class="image-editor-palette-preview">${this.options.preview.render(colors)}</div><footer><button type="button" data-palette-action="copy-all"><i class="bi bi-copy"></i> Copy all</button>${edit ? `<button type="button" class="primary" data-palette-action="save"${saveDisabled}>Save palette</button>` : '<button type="button" class="primary" data-palette-action="apply">Apply palette</button>'}</footer></section>`;
      this.element.querySelector("[data-palette-format]").value = this.format;
      this.element.querySelector("[data-palette-format]").addEventListener("change", (event) => { this.format = event.target.value; this.showDetails(this.palette, this.view === "edit"); });
    }

    updateSaveState() {
      const button = this.element.querySelector("[data-palette-action='save']");
      if (button) button.disabled = !this.draft?.slots.some(Boolean);
    }

    async handleClick(event) {
      const button = event.target.closest("[data-palette-action]");
      if (!button) return;
      const action = button.dataset.paletteAction;
      const id = button.closest("[data-palette-id]")?.dataset.paletteId;
      const palette = id ? this.store.get(id) : this.palette;
      if (action === "close") return this.close();
      if (action === "back") return this.showCatalog();
      if (action === "add") { this.draft = null; return this.showDetails({ name: "", slots: Array(12).fill(null) }, true); }
      if (action === "details" && palette) return this.showDetails(palette);
      if (action === "apply" && palette) { this.store.select(palette.id); return this.close(); }
      if (action === "export" && palette) return this.run(() => this.options.onExport(palette));
      if (action === "import") return this.run(async () => { const summary = await this.options.onImport(); if (summary) { this.showCatalog(); this.notify(summary); } });
      if (action === "copy-color") {
        const index = Number(button.closest("[data-slot]").dataset.slot);
        const color = (this.draft?.slots || this.options.catalog.previewColors(palette))[index];
        if (color) await this.run(() => this.options.onCopy(formatted(color, this.format)));
      }
      if (action === "copy-all") {
        const colors = this.draft ? this.draft.slots.filter(Boolean) : this.options.catalog.exportColors(palette);
        await this.run(() => this.options.onCopy(colors.map((color) => formatted(color, this.format)).join("\n")));
      }
      if (action === "pick" && this.draft) {
        const index = Number(button.closest("[data-slot]").dataset.slot);
        this.options.openColorPicker({ anchor: button, color: this.draft.slots[index] || "#FFFFFF", onChange: (color) => { this.draft.slots[index] = color.toUpperCase(); this.showDetails(this.palette, true); } });
      }
      if (action === "save" && this.draft?.slots.some(Boolean)) {
        this.store.createCustom({ name: this.draft.name, slots: this.draft.slots });
        this.showCatalog();
      }
    }

    editHex(event) {
      if (!this.draft) return;
      const label = event.target.closest("[data-palette-value]");
      if (!label) return;
      const index = Number(label.dataset.paletteValue);
      const input = document.createElement("input");
      input.className = "image-editor-palette-inline-hex";
      input.value = this.draft.slots[index] || "";
      label.replaceWith(input);
      input.focus();
      const finish = () => {
        const normalized = this.options.catalog.normalizeHex(input.value);
        this.draft.slots[index] = normalized;
        this.showDetails(this.palette, true);
      };
      input.addEventListener("blur", finish, { once: true });
      input.addEventListener("keydown", (keyEvent) => { if (keyEvent.key === "Enter") input.blur(); });
    }

    async run(operation) {
      this.notify("");
      try { await operation(); }
      catch (error) { this.notify(error?.message || String(error), true); }
    }

    destroy() {
      document.removeEventListener("keydown", this.onKeyDown, true);
      this.element.remove();
    }
  }

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPaletteDialog = ImageEditorPaletteDialog;
})(typeof window !== "undefined" ? window : globalThis);
