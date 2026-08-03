// Java toString() member and generation-options dialog.
(function(global) {
  "use strict";

  /** Create the Generate toString() dialog. */
  function createMarkdownViewerToStringDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let groups = [];
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
      overlay.id = "to-string-dialog";
      overlay.className = "to-string-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "to-string-dialog-title");
      overlay.innerHTML = [
        '<section class="to-string-dialog-panel">',
        '<header class="to-string-dialog-header"><h2 id="to-string-dialog-title">Generate toString()</h2>',
        '<button type="button" class="to-string-dialog-close" aria-label="Close">&times;</button></header>',
        '<p class="to-string-dialog-instruction">Select fields and methods to include in the toString() method:</p>',
        '<div class="to-string-dialog-content"><div class="to-string-member-list" role="group" aria-label="toString member candidates"></div>',
        '<div class="to-string-selection-actions">',
        '<button type="button" data-selection-action="all">Select All</button>',
        '<button type="button" data-selection-action="none">Deselect All</button>',
        '<button type="button" data-order-action="up">Up</button>',
        '<button type="button" data-order-action="down">Down</button>',
        '<button type="button" data-order-action="sort">Sort</button></div></div>',
        '<div class="to-string-generation-options">',
        '<label class="to-string-comments-option"><input type="checkbox" class="to-string-generate-comments"> Generate method comments</label>',
        '<fieldset><legend>Generated code</legend>',
        '<label>Code style: <select class="to-string-code-style">',
        '<option value="concatenation">String concatenation</option>',
        '<option value="builder">StringBuilder - separate calls</option>',
        '<option value="builder-chained">StringBuilder - chained calls</option>',
        '<option value="format">String.format()</option></select></label>',
        '<label><input type="checkbox" class="to-string-skip-nulls"> Skip null values</label>',
        '<label><input type="checkbox" class="to-string-list-arrays"> List contents of arrays instead of using native toString()</label>',
        '</fieldset></div>',
        '<p class="to-string-selection-summary" aria-live="polite"></p>',
        '<footer class="to-string-dialog-footer">',
        '<button type="button" class="to-string-dialog-generate">Generate</button>',
        '<button type="button" class="to-string-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".to-string-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".to-string-dialog-cancel").addEventListener("click", () => close(null));
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

    function findFocusedMember() {
      for (const group of groups) {
        const index = group.members.findIndex((member) => member.id === focusedId);
        if (index >= 0) return { group, index };
      }
      return null;
    }

    function updateSummary() {
      const fieldGroup = groups.find((group) => group.kind === "field");
      const methodGroups = groups.filter((group) => group.kind !== "field");
      const fieldCount = fieldGroup?.members.filter((member) => selectedIds.has(member.id)).length || 0;
      const methodCount = methodGroups.reduce((count, group) =>
        count + group.members.filter((member) => selectedIds.has(member.id)).length, 0);
      const totalMethods = methodGroups.reduce((count, group) => count + group.members.length, 0);
      overlay.querySelector(".to-string-selection-summary").textContent =
        fieldCount + " of " + (fieldGroup?.members.length || 0) + " fields and " +
        methodCount + " of " + totalMethods + " methods selected.";
      overlay.querySelector(".to-string-dialog-generate").disabled = selectedIds.size === 0;
    }

    function renderMembers() {
      const list = overlay.querySelector(".to-string-member-list");
      list.replaceChildren();
      groups.forEach((group) => {
        if (!group.members.length) return;
        const fieldset = document.createElement("fieldset");
        fieldset.className = "to-string-member-group";
        const legend = document.createElement("legend");
        legend.textContent = group.label;
        fieldset.appendChild(legend);
        group.members.forEach((member) => {
          const label = document.createElement("label");
          label.className = "to-string-member-option";
          if (member.id === focusedId) label.classList.add("is-focused");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = selectedIds.has(member.id);
          checkbox.dataset.memberId = member.id;
          checkbox.addEventListener("focus", () => { focusedId = member.id; });
          checkbox.addEventListener("change", () => {
            focusedId = member.id;
            if (checkbox.checked) selectedIds.add(member.id);
            else selectedIds.delete(member.id);
            renderMembers();
          });
          const type = document.createElement("span");
          type.className = "to-string-member-type";
          type.textContent = member.typeName;
          label.append(checkbox, document.createTextNode(member.label), type);
          fieldset.appendChild(label);
        });
        list.appendChild(fieldset);
      });
      updateSummary();
    }

    function moveFocused(direction) {
      const focused = findFocusedMember();
      if (!focused) return;
      const target = focused.index + direction;
      if (target < 0 || target >= focused.group.members.length) return;
      const member = focused.group.members.splice(focused.index, 1)[0];
      focused.group.members.splice(target, 0, member);
      renderMembers();
      overlay.querySelector('[data-member-id="' + focusedId + '"]')?.focus();
    }

    function bindActions() {
      overlay.querySelectorAll("[data-selection-action]").forEach((button) => {
        button.onclick = () => {
          selectedIds = button.dataset.selectionAction === "all"
            ? new Set(groups.flatMap((group) => group.members.map((member) => member.id)))
            : new Set();
          renderMembers();
        };
      });
      overlay.querySelector('[data-order-action="up"]').onclick = () => moveFocused(-1);
      overlay.querySelector('[data-order-action="down"]').onclick = () => moveFocused(1);
      overlay.querySelector('[data-order-action="sort"]').onclick = () => {
        groups.forEach((group) => group.members.sort((left, right) => left.label.localeCompare(right.label)));
        renderMembers();
      };
      overlay.querySelector(".to-string-dialog-generate").onclick = () => {
        close({
          members: groups.flatMap((group) => group.members).filter((member) => selectedIds.has(member.id)),
          generateComments: overlay.querySelector(".to-string-generate-comments").checked,
          codeStyle: overlay.querySelector(".to-string-code-style").value,
          skipNulls: overlay.querySelector(".to-string-skip-nulls").checked,
          listArrays: overlay.querySelector(".to-string-list-arrays").checked
        });
      };
    }

    return {
      open(analysis) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        groups = [
          { kind: "field", label: "Fields", members: Array.from(analysis?.fields || []) },
          { kind: "method", label: "Methods", members: Array.from(analysis?.methods || []) },
          { kind: "inherited-method", label: "Inherited methods", members: Array.from(analysis?.inheritedMethods || []) }
        ];
        selectedIds = new Set(groups[0].members.map((member) => member.id));
        focusedId = groups[0].members[0]?.id || groups[1].members[0]?.id || "";
        bindActions();
        renderMembers();
        overlay.hidden = false;
        overlay.querySelector(".to-string-dialog-generate").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerToStringDialog = createMarkdownViewerToStringDialog;
})(window);
