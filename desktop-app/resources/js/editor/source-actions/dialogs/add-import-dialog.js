// Java Add Import candidate selection dialog.
(function(global) {
  "use strict";

  /**
   * Create the chooser shown when more than one Java type matches a reference.
   * @param {object} options Dialog dependencies.
   * @returns {{open: function(object): Promise<object|null>}} Add Import dialog API.
   */
  function createMarkdownViewerAddImportDialog(options = {}) {
    const document = options.document || global.document;
    let overlay = null;
    let candidates = [];
    let selectedId = "";
    let resolveOpenDialog = null;

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      const resolve = resolveOpenDialog;
      resolveOpenDialog = null;
      resolve?.(result);
    }

    function getVisibleCandidates() {
      const query = overlay.querySelector(".add-import-dialog-search").value.trim().toLocaleLowerCase();
      if (!query) return candidates;
      return candidates.filter((candidate) => candidate.displayName.toLocaleLowerCase().includes(query));
    }

    function updateConfirmButton() {
      overlay.querySelector(".add-import-dialog-confirm").disabled = !selectedId;
    }

    function chooseCandidate(candidate) {
      selectedId = candidate.id;
      renderCandidates();
    }

    function renderCandidates() {
      const list = overlay.querySelector(".add-import-dialog-list");
      const visibleCandidates = getVisibleCandidates();
      list.replaceChildren();
      if (!visibleCandidates.length) {
        const empty = document.createElement("p");
        empty.className = "add-import-dialog-empty";
        empty.textContent = "No matching types.";
        list.appendChild(empty);
        updateConfirmButton();
        return;
      }
      if (!visibleCandidates.some((candidate) => candidate.id === selectedId)) {
        selectedId = visibleCandidates[0].id;
      }
      visibleCandidates.forEach((candidate) => {
        const label = document.createElement("label");
        label.className = "add-import-dialog-option";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "add-import-candidate";
        radio.value = candidate.id;
        radio.checked = candidate.id === selectedId;
        radio.addEventListener("change", () => chooseCandidate(candidate));
        const icon = document.createElement("i");
        icon.className = "bi bi-box";
        icon.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.textContent = candidate.displayName;
        label.append(radio, icon, name);
        label.addEventListener("dblclick", () => close(candidate));
        list.appendChild(label);
      });
      updateConfirmButton();
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "add-import-dialog";
      overlay.className = "add-import-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "add-import-dialog-title");
      overlay.innerHTML = [
        '<section class="add-import-dialog-panel">',
        '<header class="add-import-dialog-header"><h2 id="add-import-dialog-title">Add Import</h2>',
        '<button type="button" class="add-import-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="add-import-dialog-body">',
        '<p class="add-import-dialog-prompt"></p>',
        '<input type="search" class="add-import-dialog-search" aria-label="Filter matching Java types">',
        '<div class="add-import-dialog-list" role="radiogroup" aria-label="Matching Java types"></div>',
        '</div>',
        '<footer class="add-import-dialog-footer">',
        '<button type="button" class="add-import-dialog-confirm">OK</button>',
        '<button type="button" class="add-import-dialog-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".add-import-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".add-import-dialog-cancel").addEventListener("click", () => close(null));
      overlay.querySelector(".add-import-dialog-confirm").addEventListener("click", () => {
        close(candidates.find((candidate) => candidate.id === selectedId) || null);
      });
      overlay.querySelector(".add-import-dialog-search").addEventListener("input", renderCandidates);
      overlay.addEventListener("mousedown", (event) => {
        if (event.target === overlay) close(null);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(null);
        } else if (event.key === "Enter" && selectedId) {
          event.preventDefault();
          close(candidates.find((candidate) => candidate.id === selectedId) || null);
        }
      });
      return overlay;
    }

    return {
      /**
       * Choose one fully qualified Java type from ambiguous language-server matches.
       * @param {{typeName: string, candidates: object[]}} model Candidate dialog model.
       * @returns {Promise<object|null>} Selected candidate, or null when cancelled.
       */
      open(model) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        candidates = (model.candidates || []).map((candidate, index) => ({
          ...candidate,
          id: String(candidate.id || candidate.qualifiedName || index),
          displayName: String(candidate.displayName || candidate.qualifiedName || candidate.label || "")
        }));
        selectedId = candidates[0]?.id || "";
        overlay.querySelector(".add-import-dialog-prompt").textContent =
          `Choose the type to import for '${model.typeName}':`;
        overlay.querySelector(".add-import-dialog-search").value = "";
        renderCandidates();
        overlay.hidden = false;
        overlay.querySelector(".add-import-dialog-search").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerAddImportDialog = createMarkdownViewerAddImportDialog;
})(window);
