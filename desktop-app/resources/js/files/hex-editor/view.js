// Virtualized, keyboard-accessible UI for the built-in hex editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerHexEditor = global.MarkdownViewerHexEditor || {};
  const BYTES_PER_ROW = 16;
  const ROW_HEIGHT = 24;
  const OVERSCAN_ROWS = 12;
  const CACHE_PAGE_BYTES = 64 * 1024;
  const MAX_COPY_BYTES = 1024 * 1024;

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  function printableAscii(value) {
    return value >= 32 && value <= 126 ? String.fromCharCode(value) : ".";
  }

  class HexEditorView {
    /**
     * Render and coordinate one managed hex-editor tab.
     * @param {object} options - Tab, source, model, root, and lifecycle callbacks.
     */
    constructor(options) {
      Object.assign(this, options);
      this.metadata = this.source.getMetadata();
      this.readOnly = !this.model;
      this.cursor = Number(this.tab.hexEditorState?.cursor ?? 0);
      this.selectionStart = Number(this.tab.hexEditorState?.selectionStart ?? this.cursor);
      this.selectionEnd = Number(this.tab.hexEditorState?.selectionEnd ?? this.cursor);
      this.endianness = this.tab.hexEditorState?.endianness === "big" ? "big" : "little";
      this.cache = new Map();
      this.renderToken = 0;
      this.pendingNibble = "";
      this.searchController = null;
      this.buildShell();
      this.bindEvents();
      this.renderVisibleRows();
      this.updateState();
    }

    buildShell() {
      this.root.innerHTML = `
        <div class="hex-editor">
          <div class="hex-editor-toolbar">
            <div class="hex-editor-file">
              <i class="bi bi-file-binary" aria-hidden="true"></i>
              <span class="hex-editor-meta"></span>
            </div>
            <div class="hex-editor-search">
              <select class="hex-editor-search-mode" aria-label="Search mode">
                <option value="hex">Hex</option>
                <option value="text">Text</option>
              </select>
              <input class="hex-editor-search-input" type="search" spellcheck="false" placeholder="Find bytes" aria-label="Find in binary file">
              <label class="hex-editor-case-label" hidden><input class="hex-editor-case-sensitive" type="checkbox"> Aa</label>
              <button class="hex-editor-button hex-editor-find-previous" type="button" title="Find previous"><i class="bi bi-arrow-up"></i></button>
              <button class="hex-editor-button hex-editor-find" type="button" title="Find next"><i class="bi bi-arrow-down"></i></button>
            </div>
            <div class="hex-editor-go-to">
              <input class="hex-editor-offset-input" inputmode="text" spellcheck="false" placeholder="Offset" aria-label="Go to offset">
              <button class="hex-editor-button hex-editor-go" type="button">Go</button>
            </div>
            <button class="hex-editor-button hex-editor-undo" type="button" title="Undo"><i class="bi bi-arrow-counterclockwise"></i></button>
            <button class="hex-editor-button hex-editor-redo" type="button" title="Redo"><i class="bi bi-arrow-clockwise"></i></button>
            <select class="hex-editor-endian" aria-label="Inspector byte order">
              <option value="little">Little endian</option>
              <option value="big">Big endian</option>
            </select>
            <button class="hex-editor-button hex-editor-save" type="button">Save</button>
            <button class="hex-editor-button hex-editor-save-as" type="button">Save As</button>
          </div>
          <div class="hex-editor-body">
            <div class="hex-editor-grid-panel">
              <div class="hex-editor-column-header" aria-hidden="true">
                <span class="hex-editor-offset-header">Offset</span>
                <span class="hex-editor-hex-header"></span>
                <span class="hex-editor-ascii-header">Decoded text</span>
              </div>
              <div class="hex-editor-scroll" tabindex="0" role="grid" aria-label="Hexadecimal bytes">
                <div class="hex-editor-spacer"><div class="hex-editor-rows"></div></div>
              </div>
            </div>
            <aside class="hex-editor-inspector" aria-label="Data inspector">
              <h3>Data inspector</h3>
              <dl></dl>
            </aside>
          </div>
          <div class="hex-editor-status" role="status" aria-live="polite"></div>
        </div>
      `;
      this.shell = this.root.querySelector(".hex-editor");
      this.scroll = this.root.querySelector(".hex-editor-scroll");
      this.rows = this.root.querySelector(".hex-editor-rows");
      this.status = this.root.querySelector(".hex-editor-status");
      this.root.querySelector(".hex-editor-meta").textContent =
        `${formatBytes(this.metadata.size)} · ${this.readOnly ? "Read-only" : "Fixed-size editing"}`;
      this.root.querySelector(".hex-editor-hex-header").textContent =
        Array.from({ length: BYTES_PER_ROW }, (_, index) => index.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      this.root.querySelector(".hex-editor-spacer").style.height =
        `${Math.max(1, Math.ceil(this.metadata.size / BYTES_PER_ROW)) * ROW_HEIGHT}px`;
      this.root.querySelector(".hex-editor-endian").value = this.endianness;
    }

    bindEvents() {
      this.scroll.addEventListener("scroll", () => this.renderVisibleRows());
      this.scroll.addEventListener("keydown", (event) => this.handleKeyDown(event));
      this.scroll.addEventListener("copy", (event) => this.copySelection(event));
      this.scroll.addEventListener("paste", (event) => this.pasteSelection(event));
      this.rows.addEventListener("mousedown", (event) => this.handleCellPointer(event));
      this.root.querySelector(".hex-editor-search-mode").addEventListener("change", (event) => {
        const isText = event.target.value === "text";
        this.root.querySelector(".hex-editor-case-label").hidden = !isText;
        this.root.querySelector(".hex-editor-search-input").placeholder = isText ? "Find text" : "Find bytes";
      });
      this.root.querySelector(".hex-editor-search-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.find(event.shiftKey ? "backward" : "forward");
      });
      this.root.querySelector(".hex-editor-find-previous").addEventListener("click", () => this.find("backward"));
      this.root.querySelector(".hex-editor-find").addEventListener("click", () => this.find("forward"));
      this.root.querySelector(".hex-editor-go").addEventListener("click", () => this.goToInputOffset());
      this.root.querySelector(".hex-editor-offset-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.goToInputOffset();
      });
      this.root.querySelector(".hex-editor-undo").addEventListener("click", () => this.applyHistory("undo"));
      this.root.querySelector(".hex-editor-redo").addEventListener("click", () => this.applyHistory("redo"));
      this.root.querySelector(".hex-editor-endian").addEventListener("change", (event) => {
        this.endianness = event.target.value === "big" ? "big" : "little";
        this.updateInspector();
        this.updateTabState();
      });
      this.root.querySelector(".hex-editor-save").addEventListener("click", () => this.onSave?.(this.tab));
      this.root.querySelector(".hex-editor-save-as").addEventListener("click", () => this.onSaveAs?.(this.tab));
    }

    getActiveCursor() {
      return this.model ? this.model.cursor : this.cursor;
    }

    getSelectionRange() {
      if (this.model) return this.model.getSelectionRange();
      const start = Math.min(this.selectionStart, this.selectionEnd);
      const end = Math.max(this.selectionStart, this.selectionEnd);
      return { start, end, length: this.metadata.size ? end - start + 1 : 0 };
    }

    async readRange(offset, length) {
      if (this.model) return this.model.bytes.slice(offset, offset + length);
      const pageStart = Math.floor(offset / CACHE_PAGE_BYTES) * CACHE_PAGE_BYTES;
      let page = this.cache.get(pageStart);
      if (!page) {
        page = await this.source.readRange(pageStart, Math.min(CACHE_PAGE_BYTES, this.metadata.size - pageStart));
        this.cache.set(pageStart, page);
        if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      }
      const local = offset - pageStart;
      if (local + length <= page.length) return page.slice(local, local + length);
      return this.source.readRange(offset, length);
    }

    async renderVisibleRows() {
      const token = ++this.renderToken;
      const firstRow = Math.max(0, Math.floor(this.scroll.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
      const visibleRows = Math.ceil((this.scroll.clientHeight || 480) / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
      const totalRows = Math.ceil(this.metadata.size / BYTES_PER_ROW);
      const rowCount = Math.max(0, Math.min(visibleRows, totalRows - firstRow));
      const startOffset = firstRow * BYTES_PER_ROW;
      const bytes = await this.readRange(startOffset, rowCount * BYTES_PER_ROW);
      if (token !== this.renderToken) return;
      const selection = this.getSelectionRange();
      const fragment = document.createDocumentFragment();
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const absoluteRow = firstRow + rowIndex;
        const rowOffset = absoluteRow * BYTES_PER_ROW;
        const row = document.createElement("div");
        row.className = "hex-editor-row";
        row.style.top = `${absoluteRow * ROW_HEIGHT}px`;
        row.setAttribute("role", "row");
        const offset = document.createElement("span");
        offset.className = "hex-editor-row-offset";
        offset.textContent = rowOffset.toString(16).toUpperCase().padStart(Math.max(8, this.metadata.size.toString(16).length), "0");
        const hex = document.createElement("span");
        hex.className = "hex-editor-row-hex";
        const ascii = document.createElement("span");
        ascii.className = "hex-editor-row-ascii";
        for (let column = 0; column < BYTES_PER_ROW; column += 1) {
          const absoluteOffset = rowOffset + column;
          if (absoluteOffset >= this.metadata.size) break;
          const value = bytes[rowIndex * BYTES_PER_ROW + column];
          hex.appendChild(this.createCell(absoluteOffset, value, "hex", value.toString(16).toUpperCase().padStart(2, "0"), selection));
          ascii.appendChild(this.createCell(absoluteOffset, value, "ascii", printableAscii(value), selection));
        }
        row.append(offset, hex, ascii);
        fragment.appendChild(row);
      }
      this.rows.replaceChildren(fragment);
    }

    createCell(offset, value, area, text, selection) {
      const cell = document.createElement("span");
      cell.className = `hex-editor-byte hex-editor-${area}-byte`;
      cell.dataset.offset = String(offset);
      cell.dataset.area = area;
      cell.dataset.value = String(value);
      cell.textContent = text;
      cell.setAttribute("role", "gridcell");
      if (offset >= selection.start && offset <= selection.end) cell.classList.add("selected");
      if (offset === this.getActiveCursor()) cell.classList.add("active");
      return cell;
    }

    handleCellPointer(event) {
      const cell = event.target.closest?.(".hex-editor-byte");
      if (!cell) return;
      this.activeArea = cell.dataset.area || "hex";
      this.pendingNibble = "";
      this.setCursor(Number(cell.dataset.offset), event.shiftKey);
      this.scroll.focus();
    }

    setCursor(offset, extendSelection = false) {
      const clamped = Math.max(0, Math.min(Math.max(0, this.metadata.size - 1), Number(offset || 0)));
      if (this.model) {
        this.model.setCursor(clamped, extendSelection);
      } else {
        this.cursor = clamped;
        if (extendSelection) this.selectionEnd = clamped;
        else this.selectionStart = this.selectionEnd = clamped;
      }
      this.updateState();
    }

    handleKeyDown(event) {
      const cursor = this.getActiveCursor();
      const pageRows = Math.max(1, Math.floor((this.scroll.clientHeight || 480) / ROW_HEIGHT));
      const movement = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -BYTES_PER_ROW,
        ArrowDown: BYTES_PER_ROW,
        PageUp: -pageRows * BYTES_PER_ROW,
        PageDown: pageRows * BYTES_PER_ROW
      }[event.key];
      if (movement) {
        event.preventDefault();
        this.pendingNibble = "";
        this.setCursor(cursor + movement, event.shiftKey);
        this.scrollCursorIntoView();
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const rowStart = Math.floor(cursor / BYTES_PER_ROW) * BYTES_PER_ROW;
        this.setCursor(event.key === "Home" ? rowStart : Math.min(this.metadata.size - 1, rowStart + BYTES_PER_ROW - 1), event.shiftKey);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        this.root.querySelector(".hex-editor-search-input").focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        this.applyHistory(event.shiftKey ? "redo" : "undo");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.applyHistory("redo");
        return;
      }
      if (!this.readOnly && this.activeArea === "hex" && /^[0-9a-f]$/i.test(event.key)) {
        event.preventDefault();
        this.pendingNibble += event.key.toUpperCase();
        if (this.pendingNibble.length === 2) {
          this.applyOverwrite(cursor, new Uint8Array([Number.parseInt(this.pendingNibble, 16)]));
          this.pendingNibble = "";
          this.setCursor(cursor + 1);
        }
        return;
      }
      if (!this.readOnly && this.activeArea === "ascii" && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        const encoded = new TextEncoder().encode(event.key);
        if (encoded.length === 1) {
          event.preventDefault();
          this.applyOverwrite(cursor, encoded);
          this.setCursor(cursor + 1);
        }
      }
    }

    applyOverwrite(offset, bytes) {
      try {
        if (this.model.overwrite(offset, bytes)) this.updateState();
      } catch (error) {
        this.setStatus(error.message, true);
      }
    }

    applyHistory(action) {
      if (!this.model) return;
      if (this.model[action]()) this.updateState();
    }

    async copySelection(event) {
      const selection = this.getSelectionRange();
      if (!selection.length || selection.length > MAX_COPY_BYTES) {
        event?.preventDefault();
        this.setStatus(selection.length > MAX_COPY_BYTES ? "Selections larger than 1 MB cannot be copied." : "Nothing is selected.", true);
        return;
      }
      const bytes = await this.readRange(selection.start, selection.length);
      const value = this.activeArea === "ascii"
        ? new TextDecoder().decode(bytes)
        : Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      if (event?.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData("text/plain", value);
      } else {
        await navigator.clipboard?.writeText?.(value);
      }
      this.setStatus(`Copied ${selection.length} byte${selection.length === 1 ? "" : "s"}.`);
    }

    pasteSelection(event) {
      if (this.readOnly) return;
      const text = event?.clipboardData?.getData("text/plain") || "";
      if (!text) return;
      event.preventDefault();
      try {
        const bytes = this.activeArea === "ascii" ? new TextEncoder().encode(text) : namespace.parseHexQuery(text);
        this.applyOverwrite(this.getActiveCursor(), bytes);
      } catch (error) {
        this.setStatus(error.message, true);
      }
    }

    async find(direction = "forward") {
      const query = this.root.querySelector(".hex-editor-search-input").value;
      const mode = this.root.querySelector(".hex-editor-search-mode").value;
      const caseSensitive = this.root.querySelector(".hex-editor-case-sensitive").checked;
      this.searchController?.abort();
      this.searchController = new AbortController();
      try {
        this.setStatus("Searching…");
        const searchSource = this.model ? {
          getMetadata: () => ({ size: this.model.length }),
          readRange: async (offset, length) => this.model.bytes.slice(offset, offset + length)
        } : this.source;
        const result = await namespace.searchSource(searchSource, {
          query,
          mode,
          caseSensitive,
          direction,
          startOffset: direction === "backward"
            ? Math.max(0, this.getSelectionRange().start - 1)
            : Math.min(this.metadata.size, this.getSelectionRange().end + 1),
          signal: this.searchController.signal
        });
        if (!result) {
          this.setStatus(direction === "backward" ? "No previous match found." : "No further match found.");
          return;
        }
        if (this.model) this.model.setSelection(result.offset, result.offset + result.length - 1);
        else {
          this.cursor = result.offset + result.length - 1;
          this.selectionStart = result.offset;
          this.selectionEnd = this.cursor;
        }
        this.scrollCursorIntoView();
        this.updateState();
        this.setStatus(`Match at 0x${result.offset.toString(16).toUpperCase()}.`);
      } catch (error) {
        if (error.name !== "AbortError") this.setStatus(error.message, true);
      }
    }

    goToInputOffset() {
      const input = this.root.querySelector(".hex-editor-offset-input");
      const value = String(input.value || "").trim();
      const offset = /^0x/i.test(value)
        ? Number.parseInt(value.slice(2), 16)
        : (/^[0-9a-f]+h$/i.test(value) ? Number.parseInt(value.slice(0, -1), 16) : Number.parseInt(value, 10));
      if (!Number.isFinite(offset) || offset < 0 || offset >= this.metadata.size) {
        this.setStatus("Enter an offset within the file, using decimal, 0x-prefixed hex, or an h suffix.", true);
        return;
      }
      this.setCursor(offset);
      this.scrollCursorIntoView();
    }

    scrollCursorIntoView() {
      const row = Math.floor(this.getActiveCursor() / BYTES_PER_ROW);
      const top = row * ROW_HEIGHT;
      if (top < this.scroll.scrollTop || top + ROW_HEIGHT > this.scroll.scrollTop + this.scroll.clientHeight) {
        this.scroll.scrollTop = Math.max(0, top - this.scroll.clientHeight / 2);
      }
      this.renderVisibleRows();
    }

    async updateInspector() {
      const cursor = this.getActiveCursor();
      const bytes = cursor >= 0 ? await this.readRange(cursor, Math.min(8, this.metadata.size - cursor)) : new Uint8Array(0);
      const values = namespace.inspectBytes(bytes, this.endianness);
      const labels = [
        ["uint8", "Unsigned 8-bit"], ["int8", "Signed 8-bit"],
        ["uint16", "Unsigned 16-bit"], ["int16", "Signed 16-bit"],
        ["uint32", "Unsigned 32-bit"], ["int32", "Signed 32-bit"],
        ["float32", "Float 32-bit"], ["float64", "Float 64-bit"]
      ];
      const list = this.root.querySelector(".hex-editor-inspector dl");
      list.replaceChildren(...labels.flatMap(([key, label]) => {
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = values[key];
        return [term, detail];
      }));
    }

    updateState() {
      this.updateTabState();
      this.root.querySelector(".hex-editor-undo").disabled = !this.model?.undoStack.length;
      this.root.querySelector(".hex-editor-redo").disabled = !this.model?.redoStack.length;
      this.root.querySelector(".hex-editor-save").disabled = this.readOnly || !this.model?.isDirty || !this.source.canWrite();
      this.root.querySelector(".hex-editor-save-as").disabled = this.readOnly && !this.metadata.size;
      this.renderVisibleRows();
      this.updateInspector();
      const selection = this.getSelectionRange();
      this.setStatus(
        `${this.readOnly ? "Read-only" : this.model.isDirty ? "Modified" : "Saved"} · ` +
        `Offset 0x${Math.max(0, this.getActiveCursor()).toString(16).toUpperCase()} · ${selection.length} byte${selection.length === 1 ? "" : "s"} selected`
      );
    }

    updateTabState() {
      const selection = this.getSelectionRange();
      this.tab.hexEditorDirty = this.model?.isDirty === true;
      this.tab.hexEditorState = {
        ...(this.tab.hexEditorState || {}),
        cursor: this.getActiveCursor(),
        selectionStart: selection.start,
        selectionEnd: selection.end,
        scrollTop: this.scroll?.scrollTop || 0,
        endianness: this.endianness
      };
      this.onStateChanged?.(this.tab);
    }

    setStatus(message, isError = false) {
      this.status.textContent = message || "";
      this.status.classList.toggle("error", isError);
    }

    destroy() {
      this.searchController?.abort();
      this.root.innerHTML = "";
    }
  }

  namespace.HexEditorView = HexEditorView;
  namespace.viewConstants = Object.freeze({ BYTES_PER_ROW, ROW_HEIGHT, MAX_COPY_BYTES });
})(typeof window !== "undefined" ? window : globalThis);
