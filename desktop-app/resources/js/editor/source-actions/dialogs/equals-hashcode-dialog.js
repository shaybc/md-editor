// Java equals() and hashCode() field and generation-options dialog.
(function(global) {
  "use strict";

  /** Create the Generate hashCode() and equals() dialog. */
  function createMarkdownViewerEqualsHashCodeDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let fields = [];
    let selectedIds = new Set();

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      const resolve = resolveOpenDialog;
      resolveOpenDialog = null;
      resolve?.(result);
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "equals-hashcode-dialog";
      overlay.className = "equals-hashcode-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "equals-hashcode-dialog-title");
      overlay.innerHTML = [
        '<section class="equals-hashcode-dialog-panel">',
        '<header class="equals-hashcode-dialog-header"><h2 id="equals-hashcode-dialog-title">Generate hashCode() and equals()</h2>',
        '<button type="button" class="equals-hashcode-dialog-close" aria-label="Close">&times;</button></header>',
        '<p class="equals-hashcode-dialog-instruction">Select the fields to include in the hashCode() and equals() methods:</p>',
        '<div class="equals-hashcode-dialog-content"><div class="equals-hashcode-field-list" role="group" aria-label="Equality fields"></div>',
        '<div class="equals-hashcode-selection-actions">',
        '<button type="button" data-selection-action="all">Select All</button>',
        '<button type="button" data-selection-action="none">Deselect All</button></div></div>',
        '<div class="equals-hashcode-generation-options">',
        '<label>Insertion point:<select class="equals-hashcode-insertion-point"></select></label>',
        '<label><input type="checkbox" class="equals-hashcode-comments" checked> Generate method comments</label>',
        '<label><input type="checkbox" class="equals-hashcode-instanceof" checked> Use instanceof to compare types</label>',
        '<label><input type="checkbox" class="equals-hashcode-blocks" checked> Use blocks in if statements</label>',
        '<label><input type="checkbox" class="equals-hashcode-objects" checked> Use java.util.Objects hash and equals methods</label>',
        '</div>',
        '<p class="equals-hashcode-selection-summary" aria-live="polite"></p>',
        '<footer class="equals-hashcode-dialog-footer">',
        '<button type="button" class="equals-hashcode-dialog-generate">Generate</button>',
        '<button type="button" class="equals-hashcode-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".equals-hashcode-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".equals-hashcode-dialog-cancel").addEventListener("click", () => close(null));
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

    function updateSummary() {
      overlay.querySelector(".equals-hashcode-selection-summary").textContent =
        selectedIds.size + " of " + fields.length + " selected.";
      overlay.querySelector(".equals-hashcode-dialog-generate").disabled = selectedIds.size === 0;
    }

    function renderFields() {
      const list = overlay.querySelector(".equals-hashcode-field-list");
      list.replaceChildren();
      fields.forEach((field) => {
        const label = document.createElement("label");
        label.className = "equals-hashcode-field-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedIds.has(field.id);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedIds.add(field.id);
          else selectedIds.delete(field.id);
          updateSummary();
        });
        const type = document.createElement("span");
        type.className = "equals-hashcode-field-type";
        type.textContent = field.typeName;
        label.append(checkbox, document.createTextNode(field.label), type);
        list.appendChild(label);
      });
      updateSummary();
    }

    function renderInsertionPoints() {
      const select = overlay.querySelector(".equals-hashcode-insertion-point");
      select.replaceChildren();
      fields.forEach((field) => {
        const option = document.createElement("option");
        option.value = "after-field:" + field.id;
        option.textContent = "After '" + field.name + "'";
        select.appendChild(option);
      });
      const end = document.createElement("option");
      end.value = "end";
      end.textContent = "At end of class";
      select.appendChild(end);
      select.value = "end";
    }

    function bindActions() {
      overlay.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          selectedIds = button.dataset.selectionAction === "all"
            ? new Set(fields.map((field) => field.id))
            : new Set();
          renderFields();
        };
      });
      overlay.querySelector(".equals-hashcode-dialog-generate").onclick = () => {
        close({
          fields: fields.filter((field) => selectedIds.has(field.id)),
          insertionPoint: overlay.querySelector(".equals-hashcode-insertion-point").value,
          generateComments: overlay.querySelector(".equals-hashcode-comments").checked,
          useInstanceof: overlay.querySelector(".equals-hashcode-instanceof").checked,
          useBlocks: overlay.querySelector(".equals-hashcode-blocks").checked,
          useObjects: overlay.querySelector(".equals-hashcode-objects").checked
        });
      };
    }

    return {
      open(analysis) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        fields = Array.from(analysis?.fields || []);
        selectedIds = new Set(fields.map((field) => field.id));
        bindActions();
        renderFields();
        renderInsertionPoints();
        overlay.hidden = false;
        overlay.querySelector(".equals-hashcode-dialog-generate").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerEqualsHashCodeDialog = createMarkdownViewerEqualsHashCodeDialog;
})(window);
