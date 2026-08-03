// Getter/setter selection dialog shared by language-specific Source actions.
(function(window) {
  "use strict";

  /**
   * Create a dialog that lets users choose getter and setter candidates.
   * @param {{ document?: Document }} options Dialog environment overrides.
   * @returns {{ open(fields: Array<object>): Promise<{ fields: Array<object>, order: string, generateComments: boolean }|null> }} Dialog controller.
   */
  function createMarkdownViewerGetterSetterDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;

    function accessorName(field, kind) {
      const name = String(field.fieldName || "");
      const suffix = name ? name[0].toUpperCase() + name.slice(1) : "";
      if (kind === "getter") {
        return `${String(field.typeName || "") === "boolean" ? "is" : "get"}${suffix}()`;
      }
      return `set${suffix}(${String(field.typeName || "Object")})`;
    }

    function close(result) {
      if (!overlay) return;
      overlay.hidden = true;
      const resolve = resolveOpenDialog;
      resolveOpenDialog = null;
      resolve?.(result);
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "getter-setter-dialog";
      overlay.className = "getter-setter-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "getter-setter-dialog-title");
      overlay.innerHTML = `
        <section class="getter-setter-dialog-panel">
          <header class="getter-setter-dialog-header">
            <h2 id="getter-setter-dialog-title">Generate Getters and Setters</h2>
            <button type="button" class="getter-setter-dialog-close" aria-label="Close">&times;</button>
          </header>
          <p class="getter-setter-dialog-instruction">Select getters and setters to create:</p>
          <div class="getter-setter-dialog-content">
            <div class="getter-setter-field-list" role="group" aria-label="Getter and setter candidates"></div>
            <div class="getter-setter-selection-actions">
              <button type="button" data-selection-action="all">Select All</button>
              <button type="button" data-selection-action="none">Deselect All</button>
              <button type="button" data-selection-action="getters">Select Getters</button>
              <button type="button" data-selection-action="setters">Select Setters</button>
            </div>
          </div>
          <div class="getter-setter-generation-options">
            <label>
              <span>Sort by:</span>
              <select class="getter-setter-order">
                <option value="pairs">Fields in getter/setter pairs</option>
                <option value="getters-first">First getters, then setters</option>
              </select>
            </label>
            <label class="getter-setter-comments-option">
              <input type="checkbox" class="getter-setter-generate-comments"> Generate method comments
            </label>
          </div>
          <p class="getter-setter-selection-summary" aria-live="polite"></p>
          <footer class="getter-setter-dialog-footer">
            <button type="button" class="getter-setter-dialog-generate">Generate</button>
            <button type="button" class="getter-setter-dialog-cancel">Cancel</button>
          </footer>
        </section>`;
      document.body.appendChild(overlay);
      overlay.querySelector(".getter-setter-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".getter-setter-dialog-cancel").addEventListener("click", () => close(null));
      overlay.addEventListener("mousedown", (event) => {
        if (event.target === overlay) close(null);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(null);
        }
      });
      return overlay;
    }

    function renderFields(fields) {
      const dialog = ensureDialog();
      const list = dialog.querySelector(".getter-setter-field-list");
      const summary = dialog.querySelector(".getter-setter-selection-summary");
      const generateButton = dialog.querySelector(".getter-setter-dialog-generate");
      list.replaceChildren();

      fields.forEach((field, fieldIndex) => {
        const group = document.createElement("fieldset");
        group.className = "getter-setter-field-group";
        const legend = document.createElement("legend");
        const groupCheckbox = document.createElement("input");
        groupCheckbox.type = "checkbox";
        groupCheckbox.className = "getter-setter-field-checkbox";
        groupCheckbox.dataset.fieldIndex = String(fieldIndex);
        legend.append(groupCheckbox, ` ${field.fieldName}`);
        const type = document.createElement("span");
        type.className = "getter-setter-field-type";
        type.textContent = String(field.typeName || "");
        legend.append(type);
        group.appendChild(legend);

        ["getter", "setter"].forEach((kind) => {
          const available = kind === "getter" ? field.generateGetter : field.generateSetter;
          if (!available) return;
          const label = document.createElement("label");
          label.className = "getter-setter-accessor-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = true;
          checkbox.dataset.fieldIndex = String(fieldIndex);
          checkbox.dataset.accessorKind = kind;
          label.append(checkbox, accessorName(field, kind));
          group.appendChild(label);
        });
        list.appendChild(group);
      });

      function accessorCheckboxes() {
        return Array.from(list.querySelectorAll("input[data-accessor-kind]"));
      }

      function refreshSelectionState() {
        const accessors = accessorCheckboxes();
        list.querySelectorAll(".getter-setter-field-checkbox").forEach((checkbox) => {
          const fieldAccessors = accessors.filter((item) => item.dataset.fieldIndex === checkbox.dataset.fieldIndex);
          const selectedCount = fieldAccessors.filter((item) => item.checked).length;
          checkbox.checked = fieldAccessors.length > 0 && selectedCount === fieldAccessors.length;
          checkbox.indeterminate = selectedCount > 0 && selectedCount < fieldAccessors.length;
        });
        const selectedCount = accessors.filter((item) => item.checked).length;
        summary.textContent = `${selectedCount} of ${accessors.length} selected.`;
        generateButton.disabled = selectedCount === 0;
      }

      list.onchange = (event) => {
        const checkbox = event.target;
        if (checkbox.matches(".getter-setter-field-checkbox")) {
          accessorCheckboxes()
            .filter((item) => item.dataset.fieldIndex === checkbox.dataset.fieldIndex)
            .forEach((item) => { item.checked = checkbox.checked; });
        }
        refreshSelectionState();
      };

      dialog.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          const action = button.dataset.selectionAction;
          accessorCheckboxes().forEach((checkbox) => {
            checkbox.checked = action === "all" || action === `${checkbox.dataset.accessorKind}s`;
          });
          refreshSelectionState();
        };
      });

      generateButton.onclick = () => {
        const selectedFields = fields.map((field, fieldIndex) => ({
          ...field,
          generateGetter: !!list.querySelector(`input[data-field-index="${fieldIndex}"][data-accessor-kind="getter"]:checked`),
          generateSetter: !!list.querySelector(`input[data-field-index="${fieldIndex}"][data-accessor-kind="setter"]:checked`)
        })).filter((field) => field.generateGetter || field.generateSetter);
        close({
          fields: selectedFields,
          order: dialog.querySelector(".getter-setter-order").value,
          generateComments: dialog.querySelector(".getter-setter-generate-comments").checked
        });
      };
      refreshSelectionState();
    }

    return {
      open(fields) {
        if (resolveOpenDialog) close(null);
        const candidates = Array.isArray(fields) ? fields : [];
        renderFields(candidates);
        overlay.hidden = false;
        overlay.querySelector(".getter-setter-dialog-generate").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  window.createMarkdownViewerGetterSetterDialog = createMarkdownViewerGetterSetterDialog;
})(window);
