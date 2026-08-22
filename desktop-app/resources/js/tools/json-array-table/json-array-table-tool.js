// DevToys-style JSON Array to Table tab UI.
(function(root) {
  "use strict";

  function registerMarkdownViewerJsonArrayTableTool(app, deps) {
    const codec = deps?.codec || app?.modules?.jsonArrayTableCodec || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openJsonArrayTableToolInTab = typeof deps?.openJsonArrayTableToolInTab === "function" ? deps.openJsonArrayTableToolInTab : null;
    const saveAs = deps?.saveAs || root.saveAs || null;
    const mountedTabs = new Map();

    function createShell() {
      const view = document.createElement("div");
      view.className = "json-array-table-tool-view";
      view.innerHTML = `
        <div class="json-array-table-tool-workspace">
          <header class="json-array-table-tool-header">
            <h2><i class="bi bi-database"></i> JSON Array to Table</h2>
          </header>
          <div class="json-array-table-tool-grid">
            <section class="json-array-table-tool-panel">
              <div class="json-array-table-tool-panel-heading">
                <label for="json-array-table-tool-input">Input</label>
                <div class="json-array-table-tool-actions">
                  <button type="button" class="tool-button json-array-table-tool-paste" title="Paste JSON"><i class="bi bi-clipboard"></i> Paste</button>
                  <button type="button" class="tool-button json-array-table-tool-clear" title="Clear JSON"><i class="bi bi-x-lg"></i></button>
                </div>
              </div>
              <textarea id="json-array-table-tool-input" class="json-array-table-tool-input" spellcheck="false"></textarea>
            </section>
            <section class="json-array-table-tool-panel">
              <div class="json-array-table-tool-panel-heading">
                <span>Output</span>
                <div class="json-array-table-tool-actions">
                  <div class="json-array-table-tool-menu-wrap">
                    <button type="button" class="tool-button json-array-table-tool-copy-menu" title="Copy as"><i class="bi bi-copy"></i> Copy as <i class="bi bi-chevron-down"></i></button>
                    <div class="json-array-table-tool-menu" hidden>
                      <button type="button" data-format="csv">Comma separated values (CSV)</button>
                      <button type="button" data-format="tsv">Tab separated values (TSV)</button>
                      <button type="button" data-format="semicolon">Semicolon separated values (CSV French)</button>
                    </div>
                  </div>
                  <div class="json-array-table-tool-menu-wrap">
                    <button type="button" class="tool-button json-array-table-tool-save-menu" title="Save as"><i class="bi bi-save"></i> Save as <i class="bi bi-chevron-down"></i></button>
                    <div class="json-array-table-tool-menu" hidden>
                      <button type="button" data-format="csv">Comma separated values (CSV)</button>
                      <button type="button" data-format="tsv">Tab separated values (TSV)</button>
                      <button type="button" data-format="semicolon">Semicolon separated values (CSV French)</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="json-array-table-tool-output">
                <div class="json-array-table-tool-placeholder">Please provide a valid JSON array of objects</div>
              </div>
              <p class="json-array-table-tool-status" aria-live="polite"></p>
            </section>
          </div>
        </div>
      `;
      return view;
    }

    function getElements(view) {
      return {
        input: view.querySelector(".json-array-table-tool-input"),
        output: view.querySelector(".json-array-table-tool-output"),
        status: view.querySelector(".json-array-table-tool-status"),
        paste: view.querySelector(".json-array-table-tool-paste"),
        clear: view.querySelector(".json-array-table-tool-clear"),
        copyMenu: view.querySelector(".json-array-table-tool-copy-menu"),
        saveMenu: view.querySelector(".json-array-table-tool-save-menu"),
        copyOptions: view.querySelector(".json-array-table-tool-copy-menu + .json-array-table-tool-menu"),
        saveOptions: view.querySelector(".json-array-table-tool-save-menu + .json-array-table-tool-menu")
      };
    }

    function setStatus(elements, message, type) {
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type || "";
    }

    function renderPlaceholder(elements, message) {
      elements.output.textContent = "";
      const placeholder = document.createElement("div");
      placeholder.className = "json-array-table-tool-placeholder";
      placeholder.textContent = message;
      elements.output.appendChild(placeholder);
    }

    function renderTable(elements, table) {
      const htmlTable = document.createElement("table");
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");
      const headerRow = document.createElement("tr");
      table.columns.forEach(function(column) {
        const th = document.createElement("th");
        th.textContent = column;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.rows.forEach(function(row) {
        const tr = document.createElement("tr");
        row.forEach(function(value) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      htmlTable.append(thead, tbody);
      elements.output.textContent = "";
      elements.output.appendChild(htmlTable);
    }

    function update(elements, state) {
      const source = elements.input.value.trim();
      if (!source) {
        state.table = null;
        renderPlaceholder(elements, "Please provide a valid JSON array of objects");
        setStatus(elements, "", "");
        return;
      }
      try {
        state.table = codec.convertJsonArrayToTable(source);
        renderTable(elements, state.table);
        setStatus(elements, `${state.table.rows.length} row${state.table.rows.length === 1 ? "" : "s"}.`, "success");
      } catch (error) {
        state.table = null;
        renderPlaceholder(elements, error?.message || "Please provide a valid JSON array of objects");
        setStatus(elements, error?.message || "Please provide a valid JSON array of objects", "error");
      }
    }

    async function copyText(text) {
      if (!text) return;
      if (copyTextToClipboard) {
        await copyTextToClipboard(text);
      } else {
        await navigator.clipboard?.writeText?.(text);
      }
    }

    function downloadText(text, format) {
      if (!text) return;
      const selected = codec.EXPORT_FORMATS[format] || codec.EXPORT_FORMATS.csv;
      const blob = new Blob([text], { type: selected.mimeType });
      if (typeof saveAs === "function") {
        saveAs(blob, `json-array-table.${selected.extension}`);
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `json-array-table.${selected.extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function toggleMenu(menu) {
      menu.hidden = !menu.hidden;
    }

    function closeMenus(elements) {
      elements.copyOptions.hidden = true;
      elements.saveOptions.hidden = true;
    }

    function getDelimited(state, format) {
      if (!state.table) return "";
      return codec.tableToDelimited(state.table, format);
    }

    function bindEvents(elements, state) {
      elements.input.addEventListener("input", function() { update(elements, state); });
      elements.paste.addEventListener("click", async function() {
        const text = await navigator.clipboard?.readText?.();
        if (typeof text === "string") {
          elements.input.value = text;
          update(elements, state);
        }
      });
      elements.clear.addEventListener("click", function() {
        elements.input.value = "";
        update(elements, state);
      });
      elements.copyMenu.addEventListener("click", function(event) {
        event.stopPropagation();
        elements.saveOptions.hidden = true;
        toggleMenu(elements.copyOptions);
      });
      elements.saveMenu.addEventListener("click", function(event) {
        event.stopPropagation();
        elements.copyOptions.hidden = true;
        toggleMenu(elements.saveOptions);
      });
      elements.copyOptions.addEventListener("click", async function(event) {
        const format = event.target?.dataset?.format;
        if (!format) return;
        await copyText(getDelimited(state, format));
        closeMenus(elements);
        if (state.table) setStatus(elements, "Copied table.", "success");
      });
      elements.saveOptions.addEventListener("click", function(event) {
        const format = event.target?.dataset?.format;
        if (!format) return;
        downloadText(getDelimited(state, format), format);
        closeMenus(elements);
      });
      document.addEventListener("click", function() { closeMenus(elements); });
    }

    function mountJsonArrayTableToolTab(tab, host) {
      if (!tab?.id || !host) return null;
      let view = mountedTabs.get(tab.id);
      if (!view || !view.isConnected) {
        view = createShell();
        const elements = getElements(view);
        const state = { table: null };
        bindEvents(elements, state);
        mountedTabs.set(tab.id, view);
        update(elements, state);
      }
      if (view.parentElement !== host) {
        host.textContent = "";
        host.appendChild(view);
      }
      return view;
    }

    function destroyJsonArrayTableToolTab(tabId) {
      const view = mountedTabs.get(tabId);
      if (view) view.remove();
      mountedTabs.delete(tabId);
    }

    function openJsonArrayTableTool() {
      return openJsonArrayTableToolInTab?.() || null;
    }

    document.querySelectorAll(".open-json-array-table-tool").forEach(function(button) {
      button.addEventListener("click", openJsonArrayTableTool);
    });

    const api = { mountJsonArrayTableToolTab, destroyJsonArrayTableToolTab, openJsonArrayTableTool };
    app?.registerModule?.("jsonArrayTableTool", api);
    return api;
  }

  root.registerMarkdownViewerJsonArrayTableTool = registerMarkdownViewerJsonArrayTableTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJsonArrayTableTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
