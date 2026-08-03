// Selection and generation-options dialog for superclass constructors.
(function(global) {
  "use strict";

  /** Create the Generate Constructors from Superclass dialog. */
  function createMarkdownViewerSuperclassConstructorDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let orderedConstructors = [];
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
      overlay.id = "superclass-constructor-dialog";
      overlay.className = "superclass-constructor-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "superclass-constructor-dialog-title");
      overlay.innerHTML = [
        '<section class="superclass-constructor-dialog-panel">',
        '<header class="superclass-constructor-dialog-header"><h2 id="superclass-constructor-dialog-title">Generate Constructors from Superclass</h2>',
        '<button type="button" class="superclass-constructor-dialog-close" aria-label="Close">&times;</button></header>',
        '<p class="superclass-constructor-dialog-prompt">Select constructors to implement:</p>',
        '<div class="superclass-constructor-dialog-content"><div class="superclass-constructor-list" role="group" aria-label="Superclass constructors"></div>',
        '<div class="superclass-constructor-selection-actions">',
        '<button type="button" data-selection-action="all">Select All</button>',
        '<button type="button" data-selection-action="none">Deselect All</button>',
        '<button type="button" data-order-action="up">Up</button>',
        '<button type="button" data-order-action="down">Down</button></div></div>',
        '<div class="superclass-constructor-generation-options">',
        '<label>Insertion point:<select class="superclass-constructor-insertion-point">',
        '<option value="first">First member</option><option value="end">At end of class</option></select></label>',
        '<fieldset><legend>Access modifier</legend>',
        '<label><input type="radio" name="superclass-constructor-access" value="public" checked>public</label>',
        '<label><input type="radio" name="superclass-constructor-access" value="protected">protected</label>',
        '<label><input type="radio" name="superclass-constructor-access" value="package">package</label>',
        '<label><input type="radio" name="superclass-constructor-access" value="private">private</label></fieldset>',
        '<label><input type="checkbox" class="superclass-constructor-generate-comments" checked> Generate constructor comments</label>',
        '<label><input type="checkbox" class="superclass-constructor-omit-super"> Omit call to default constructor super()</label>',
        '</div>',
        '<p class="superclass-constructor-selection-summary" aria-live="polite"></p>',
        '<footer class="superclass-constructor-dialog-footer">',
        '<button type="button" class="superclass-constructor-dialog-generate">Generate</button>',
        '<button type="button" class="superclass-constructor-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".superclass-constructor-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".superclass-constructor-dialog-cancel").addEventListener("click", () => close(null));
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
      overlay.querySelector(".superclass-constructor-selection-summary").textContent =
        selectedIds.size + " of " + orderedConstructors.length + " selected.";
      overlay.querySelector(".superclass-constructor-dialog-generate").disabled = selectedIds.size === 0;
    }

    function renderConstructors() {
      const list = overlay.querySelector(".superclass-constructor-list");
      list.replaceChildren();
      orderedConstructors.forEach((constructor) => {
        const label = document.createElement("label");
        label.className = "superclass-constructor-option";
        if (constructor.id === focusedId) label.classList.add("is-focused");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedIds.has(constructor.id);
        checkbox.dataset.constructorId = constructor.id;
        checkbox.addEventListener("focus", () => { focusedId = constructor.id; });
        checkbox.addEventListener("change", () => {
          focusedId = constructor.id;
          if (checkbox.checked) selectedIds.add(constructor.id);
          else selectedIds.delete(constructor.id);
          renderConstructors();
        });
        label.append(checkbox, document.createTextNode(constructor.label));
        list.appendChild(label);
      });
      updateSummary();
    }

    function moveFocused(direction) {
      const index = orderedConstructors.findIndex((constructor) => constructor.id === focusedId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= orderedConstructors.length) return;
      const constructor = orderedConstructors.splice(index, 1)[0];
      orderedConstructors.splice(target, 0, constructor);
      renderConstructors();
      overlay.querySelector('[data-constructor-id="' + focusedId + '"]')?.focus();
    }

    function bindActions() {
      overlay.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          selectedIds = button.dataset.selectionAction === "all"
            ? new Set(orderedConstructors.map((constructor) => constructor.id))
            : new Set();
          renderConstructors();
        };
      });
      overlay.querySelector('[data-order-action="up"]').onclick = () => moveFocused(-1);
      overlay.querySelector('[data-order-action="down"]').onclick = () => moveFocused(1);
      overlay.querySelector(".superclass-constructor-dialog-generate").onclick = () => {
        close({
          constructors: orderedConstructors.filter((constructor) => selectedIds.has(constructor.id)),
          insertionPoint: overlay.querySelector(".superclass-constructor-insertion-point").value,
          accessModifier: overlay.querySelector('input[name="superclass-constructor-access"]:checked').value,
          generateComments: overlay.querySelector(".superclass-constructor-generate-comments").checked,
          omitSuper: overlay.querySelector(".superclass-constructor-omit-super").checked
        });
      };
    }

    return {
      /** Open the dialog for the available superclass constructors. */
      open(analysis) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        orderedConstructors = Array.from(analysis?.constructors || []);
        selectedIds = new Set(orderedConstructors.map((constructor) => constructor.id));
        focusedId = orderedConstructors[0]?.id || "";
        bindActions();
        renderConstructors();
        overlay.hidden = false;
        overlay.querySelector(".superclass-constructor-dialog-generate").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerSuperclassConstructorDialog = createMarkdownViewerSuperclassConstructorDialog;
})(window);
