// Java constructor-using-fields selection and generation-options dialog.
(function(global) {
  "use strict";

  /** Create the Generate Constructor using Fields dialog. */
  function createMarkdownViewerConstructorDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let orderedFields = [];
    let selectedIds = new Set();
    let focusedId = "";

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
      overlay.id = "constructor-dialog";
      overlay.className = "constructor-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "constructor-dialog-title");
      overlay.innerHTML = [
        '<section class="constructor-dialog-panel">',
        '<header class="constructor-dialog-header"><h2 id="constructor-dialog-title">Generate Constructor using Fields</h2>',
        '<button type="button" class="constructor-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="constructor-dialog-options">',
        '<label>Select super constructor to invoke:<select class="constructor-super"><option value="Object()">Object()</option></select></label>',
        '<span>Select fields to initialize:</span></div>',
        '<div class="constructor-dialog-content"><div class="constructor-field-list" role="group" aria-label="Constructor fields"></div>',
        '<div class="constructor-selection-actions">',
        '<button type="button" data-selection-action="all">Select All</button>',
        '<button type="button" data-selection-action="none">Deselect All</button>',
        '<button type="button" data-order-action="up">Up</button>',
        '<button type="button" data-order-action="down">Down</button></div></div>',
        '<div class="constructor-generation-options">',
        '<label>Insertion point:<select class="constructor-insertion-point"></select></label>',
        '<fieldset><legend>Access modifier</legend>',
        '<label><input type="radio" name="constructor-access" value="public" checked>public</label>',
        '<label><input type="radio" name="constructor-access" value="protected">protected</label>',
        '<label><input type="radio" name="constructor-access" value="package">package</label>',
        '<label><input type="radio" name="constructor-access" value="private">private</label></fieldset>',
        '<label><input type="checkbox" class="constructor-generate-comments"> Generate constructor comments</label>',
        '<label><input type="checkbox" class="constructor-omit-super"> Omit call to default constructor super()</label>',
        '</div>',
        '<p class="constructor-selection-summary" aria-live="polite"></p>',
        '<footer class="constructor-dialog-footer">',
        '<button type="button" class="constructor-dialog-generate">Generate</button>',
        '<button type="button" class="constructor-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".constructor-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".constructor-dialog-cancel").addEventListener("click", () => close(null));
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
      overlay.querySelector(".constructor-selection-summary").textContent =
        selectedIds.size + " of " + orderedFields.length + " selected.";
      overlay.querySelector(".constructor-dialog-generate").disabled = selectedIds.size === 0;
    }

    function renderFields() {
      const list = overlay.querySelector(".constructor-field-list");
      list.replaceChildren();
      orderedFields.forEach((field) => {
        const label = document.createElement("label");
        label.className = "constructor-field-option";
        if (field.id === focusedId) label.classList.add("is-focused");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedIds.has(field.id);
        checkbox.dataset.fieldId = field.id;
        checkbox.addEventListener("focus", () => { focusedId = field.id; });
        checkbox.addEventListener("change", () => {
          focusedId = field.id;
          if (checkbox.checked) selectedIds.add(field.id);
          else selectedIds.delete(field.id);
          renderFields();
        });
        const type = document.createElement("span");
        type.className = "constructor-field-type";
        type.textContent = field.typeName;
        label.append(checkbox, document.createTextNode(field.label), type);
        list.appendChild(label);
      });
      updateSummary();
    }

    function moveFocused(direction) {
      const index = orderedFields.findIndex((field) => field.id === focusedId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= orderedFields.length) return;
      const field = orderedFields.splice(index, 1)[0];
      orderedFields.splice(target, 0, field);
      renderFields();
      overlay.querySelector('[data-field-id="' + focusedId + '"]')?.focus();
    }

    function renderInsertionPoints() {
      const select = overlay.querySelector(".constructor-insertion-point");
      select.replaceChildren();
      orderedFields.forEach((field) => {
        const option = document.createElement("option");
        option.value = "after-field:" + field.id;
        option.textContent = "After '" + field.name + "'";
        select.appendChild(option);
      });
      const end = document.createElement("option");
      end.value = "end";
      end.textContent = "At end of class";
      select.appendChild(end);
      select.value = orderedFields.length ? "after-field:" + orderedFields[orderedFields.length - 1].id : "end";
    }

    function bindActions() {
      overlay.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          selectedIds = button.dataset.selectionAction === "all"
            ? new Set(orderedFields.map((field) => field.id))
            : new Set();
          renderFields();
        };
      });
      overlay.querySelector('[data-order-action="up"]').onclick = () => moveFocused(-1);
      overlay.querySelector('[data-order-action="down"]').onclick = () => moveFocused(1);
      overlay.querySelector(".constructor-dialog-generate").onclick = () => {
        close({
          fields: orderedFields.filter((field) => selectedIds.has(field.id)),
          insertionPoint: overlay.querySelector(".constructor-insertion-point").value,
          accessModifier: overlay.querySelector('input[name="constructor-access"]:checked').value,
          generateComments: overlay.querySelector(".constructor-generate-comments").checked,
          omitSuper: overlay.querySelector(".constructor-omit-super").checked
        });
      };
    }

    return {
      open(analysis) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        overlay.querySelector(".constructor-super option").textContent = analysis?.superConstructorLabel || "Object()";
        orderedFields = Array.from(analysis?.fields || []);
        selectedIds = new Set(orderedFields.map((field) => field.id));
        focusedId = orderedFields[0]?.id || "";
        bindActions();
        renderFields();
        renderInsertionPoints();
        overlay.hidden = false;
        overlay.querySelector(".constructor-dialog-generate").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerConstructorDialog = createMarkdownViewerConstructorDialog;
})(window);
