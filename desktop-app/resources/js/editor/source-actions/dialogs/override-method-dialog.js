// Override/Implement Methods selection and generation-options dialog.
(function(global) {
  "use strict";

  /** Create the Override/Implement Methods dialog. */
  function createMarkdownViewerOverrideMethodDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let analysis = null;
    let selectedIds = new Set();
    let filterText = "";

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
      overlay.id = "override-method-dialog";
      overlay.className = "override-method-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "override-method-dialog-title");
      overlay.innerHTML = [
        '<section class="override-method-dialog-panel">',
        '<header class="override-method-dialog-header"><h2 id="override-method-dialog-title">Override/Implement Methods</h2>',
        '<button type="button" class="override-method-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="override-method-dialog-filter"><label>Enter method name, prefix or pattern (*, ? or camel case)',
        '<input type="search" class="override-method-search" placeholder="Search Methods"></label></div>',
        '<p class="override-method-dialog-prompt">Select methods to override or implement:</p>',
        '<div class="override-method-dialog-content"><div class="override-method-list" role="group" aria-label="Override methods"></div>',
        '<div class="override-method-selection-actions">',
        '<button type="button" data-selection-action="all">Select All</button>',
        '<button type="button" data-selection-action="none">Deselect All</button></div></div>',
        '<div class="override-method-generation-options">',
        '<label>Insertion point:<select class="override-method-insertion-point"></select></label>',
        '<label><input type="checkbox" class="override-method-generate-comments"> Generate method comments</label>',
        '</div>',
        '<p class="override-method-selection-summary" aria-live="polite"></p>',
        '<footer class="override-method-dialog-footer">',
        '<button type="button" class="override-method-dialog-generate">OK</button>',
        '<button type="button" class="override-method-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".override-method-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".override-method-dialog-cancel").addEventListener("click", () => close(null));
      overlay.querySelector(".override-method-search").addEventListener("input", (event) => {
        filterText = event.target.value;
        renderMethods();
      });
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

    function matchesFilter(method) {
      const query = String(filterText || "").trim();
      if (!query) return true;
      const escaped = query.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
      if (new RegExp(escaped, "i").test(method.label)) return true;
      const camel = query.replace(/[^A-Za-z0-9_$]/g, "").split("").join("[A-Za-z0-9_$]*");
      return !!camel && new RegExp("^" + camel, "i").test(method.name);
    }

    function updateSummary() {
      overlay.querySelector(".override-method-selection-summary").textContent =
        selectedIds.size + " of " + analysis.methods.length + " selected.";
      overlay.querySelector(".override-method-dialog-generate").disabled = selectedIds.size === 0;
    }

    function toggleGroup(groupName, checked) {
      analysis.methods.filter((method) => method.declaringType === groupName && matchesFilter(method)).forEach((method) => {
        if (checked) selectedIds.add(method.id);
        else selectedIds.delete(method.id);
      });
      renderMethods();
    }

    function renderMethods() {
      const list = overlay.querySelector(".override-method-list");
      list.replaceChildren();
      analysis.groups.forEach((groupName) => {
        const methods = analysis.methods.filter((method) => method.declaringType === groupName && matchesFilter(method));
        if (!methods.length) return;
        const group = document.createElement("section");
        group.className = "override-method-group";
        const groupLabel = document.createElement("label");
        groupLabel.className = "override-method-group-label";
        const groupCheckbox = document.createElement("input");
        groupCheckbox.type = "checkbox";
        const selectedCount = methods.filter((method) => selectedIds.has(method.id)).length;
        groupCheckbox.checked = selectedCount === methods.length;
        groupCheckbox.indeterminate = selectedCount > 0 && selectedCount < methods.length;
        groupCheckbox.addEventListener("change", () => toggleGroup(groupName, groupCheckbox.checked));
        groupLabel.append(groupCheckbox, document.createTextNode(groupName));
        group.appendChild(groupLabel);
        methods.forEach((method) => {
          const label = document.createElement("label");
          label.className = "override-method-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = selectedIds.has(method.id);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedIds.add(method.id);
            else selectedIds.delete(method.id);
            renderMethods();
          });
          label.append(checkbox, document.createTextNode(method.label));
          group.appendChild(label);
        });
        list.appendChild(group);
      });
      updateSummary();
    }

    function renderInsertionPoints() {
      const select = overlay.querySelector(".override-method-insertion-point");
      select.replaceChildren();
      analysis.insertionPoints.forEach((point) => {
        const option = document.createElement("option");
        option.value = point.id;
        option.textContent = point.label;
        select.appendChild(option);
      });
      const memberPoints = analysis.insertionPoints.filter((point) => point.id.startsWith("after-member:"));
      select.value = memberPoints.at(-1)?.id || "end";
    }

    function bindActions() {
      overlay.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          selectedIds = button.dataset.selectionAction === "all"
            ? new Set(analysis.methods.map((method) => method.id))
            : new Set();
          renderMethods();
        };
      });
      overlay.querySelector(".override-method-dialog-generate").onclick = () => {
        close({
          methods: analysis.methods.filter((method) => selectedIds.has(method.id)),
          insertionPoint: overlay.querySelector(".override-method-insertion-point").value,
          generateComments: overlay.querySelector(".override-method-generate-comments").checked
        });
      };
    }

    return {
      /** Open the chooser for methods eligible for overriding or implementation. */
      open(nextAnalysis) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        analysis = nextAnalysis;
        selectedIds = new Set(analysis.methods.filter((method) => method.defaultSelected).map((method) => method.id));
        filterText = "";
        overlay.querySelector(".override-method-search").value = "";
        overlay.querySelector(".override-method-generate-comments").checked = false;
        bindActions();
        renderMethods();
        renderInsertionPoints();
        overlay.hidden = false;
        overlay.querySelector(".override-method-search").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerOverrideMethodDialog = createMarkdownViewerOverrideMethodDialog;
})(window);
