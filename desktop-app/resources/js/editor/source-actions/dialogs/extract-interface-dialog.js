// Eclipse-style configuration and workspace preview dialog for Extract Interface.
(function(global) {
  "use strict";

  const JAVA_KEYWORDS = new Set((
    "abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new " +
    "package private protected public record return sealed short static strictfp super switch synchronized " +
    "this throw throws transient try var void volatile while yield permits non-sealed true false null"
  ).split(/\s+/));

  function isValidJavaIdentifier(value) {
    const name = String(value || "").trim();
    return /^[A-Za-z_$][\w$]*$/.test(name) && !JAVA_KEYWORDS.has(name);
  }

  function createMarkdownViewerExtractInterfaceDialog(options = {}) {
    const document = options.document || global.document;
    let overlay = null;
    let workflow = null;
    let members = [];
    let selectedHandles = new Set();
    let preparedPreview = null;
    let applyResult = null;
    let workflowError = "";
    let resolveOpen = null;

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      const resolve = resolveOpen;
      resolveOpen = null;
      resolve?.(result);
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "extract-interface-dialog";
      overlay.className = "extract-interface-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "extract-interface-dialog-title");
      overlay.innerHTML = [
        '<section class="extract-interface-dialog-panel">',
        '<header class="extract-interface-dialog-header"><h2 id="extract-interface-dialog-title">Extract Interface</h2>',
        '<button type="button" class="extract-interface-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="extract-interface-configuration">',
        '<label class="extract-interface-name-label">Interface name:<input class="extract-interface-name" type="text" autocomplete="off" spellcheck="false" required></label>',
        '<p class="extract-interface-validation" role="alert"></p>',
        '<fieldset class="extract-interface-options"><legend>Refactoring options</legend>',
        '<label><input type="checkbox" class="extract-interface-replace" checked> Use the extracted interface type where possible</label>',
        '<label class="extract-interface-dependent"><input type="checkbox" class="extract-interface-instanceof"> Use the extracted interface in <code>instanceof</code> expressions</label>',
        '<label><input type="checkbox" class="extract-interface-overrides" checked> Generate <code>@Override</code> annotations</label>',
        '<label><input type="checkbox" class="extract-interface-comments" checked> Generate method comments</label>',
        '</fieldset>',
        '<div class="extract-interface-members-heading"><span>Members to declare in the interface:</span>',
        '<div><button type="button" data-selection="all">Select All</button><button type="button" data-selection="none">Deselect All</button></div></div>',
        '<div class="extract-interface-members" role="group" aria-label="Members to declare"></div>',
        '<p class="extract-interface-selection-summary" aria-live="polite"></p>',
        '</div>',
        '<div class="extract-interface-preview" hidden>',
        '<div class="extract-interface-preview-layout"><div class="extract-interface-file-list" role="listbox" aria-label="Affected files"></div>',
        '<div class="extract-interface-diff"><div><h3>Original Source</h3><pre class="extract-interface-before"></pre></div>',
        '<div><h3>Refactored Source</h3><pre class="extract-interface-after"></pre></div></div></div>',
        '</div>',
        '<div class="extract-interface-applied" hidden><p>The interface was extracted successfully.</p>',
        '<button type="button" class="extract-interface-undo">Undo Extract Interface</button></div>',
        '<footer class="extract-interface-dialog-footer">',
        '<button type="button" class="extract-interface-back" hidden>Back</button>',
        '<button type="button" class="extract-interface-preview-button">Preview</button>',
        '<button type="button" class="extract-interface-apply" hidden>Apply</button>',
        '<button type="button" class="extract-interface-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".extract-interface-dialog-close").addEventListener("click", () => close(applyResult?.applied ? { applied: true } : null));
      overlay.querySelector(".extract-interface-cancel").addEventListener("click", () => close(applyResult?.applied ? { applied: true } : null));
      overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(null); });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(null);
        }
      });
      overlay.querySelector(".extract-interface-name").addEventListener("input", () => {
        workflowError = "";
        updateValidation();
      });
      overlay.querySelector(".extract-interface-replace").addEventListener("change", updateOptionDependency);
      overlay.querySelectorAll("[data-selection]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedHandles = button.dataset.selection === "all"
            ? new Set(members.map((member) => member.handleIdentifier))
            : new Set();
          renderMembers();
        });
      });
      overlay.querySelector(".extract-interface-preview-button").addEventListener("click", preparePreview);
      overlay.querySelector(".extract-interface-back").addEventListener("click", showConfiguration);
      overlay.querySelector(".extract-interface-apply").addEventListener("click", applyPreview);
      overlay.querySelector(".extract-interface-undo").addEventListener("click", undoAppliedRefactoring);
      return overlay;
    }

    function getMemberLabel(member) {
      const parameters = Array.isArray(member.parameters) ? `(${member.parameters.join(", ")})` : "";
      return `${member.name || ""}${parameters}${member.typeName ? ` : ${member.typeName}` : ""}`;
    }

    function renderMembers() {
      const list = overlay.querySelector(".extract-interface-members");
      list.replaceChildren();
      members.forEach((member) => {
        const label = document.createElement("label");
        label.className = "extract-interface-member";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedHandles.has(member.handleIdentifier);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedHandles.add(member.handleIdentifier);
          else selectedHandles.delete(member.handleIdentifier);
          updateValidation();
        });
        const text = document.createElement("span");
        text.textContent = getMemberLabel(member);
        label.append(checkbox, text);
        list.appendChild(label);
      });
      updateValidation();
    }

    function getNameError() {
      const name = overlay.querySelector(".extract-interface-name").value.trim();
      if (!name) return "Enter an interface name.";
      if (!isValidJavaIdentifier(name)) return "Enter a valid Java interface name.";
      if (name === workflow.subTypeName) return "The interface name must differ from the class name.";
      if (!selectedHandles.size) return "Select at least one member.";
      return "";
    }

    function updateValidation() {
      if (!overlay) return;
      const error = getNameError() || workflowError;
      overlay.querySelector(".extract-interface-validation").textContent = error;
      overlay.querySelector(".extract-interface-preview-button").disabled = !!error;
      overlay.querySelector(".extract-interface-selection-summary").textContent =
        `${selectedHandles.size} of ${members.length} members selected.`;
    }

    function updateOptionDependency() {
      const parent = overlay.querySelector(".extract-interface-replace");
      const child = overlay.querySelector(".extract-interface-instanceof");
      child.disabled = !parent.checked;
      if (!parent.checked) child.checked = false;
    }

    function getSettings() {
      return {
        interfaceName: overlay.querySelector(".extract-interface-name").value.trim(),
        selectedHandleIdentifiers: members.filter((member) => selectedHandles.has(member.handleIdentifier))
          .map((member) => member.handleIdentifier),
        replaceWherePossible: overlay.querySelector(".extract-interface-replace").checked,
        replaceInstanceof: overlay.querySelector(".extract-interface-instanceof").checked,
        generateOverrideAnnotations: overlay.querySelector(".extract-interface-overrides").checked,
        generateMethodComments: overlay.querySelector(".extract-interface-comments").checked
      };
    }

    function setBusy(busy) {
      overlay.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
      if (!busy) {
        updateOptionDependency();
        updateValidation();
      }
    }

    function renderPreviewFile(entry) {
      overlay.querySelector(".extract-interface-before").textContent = entry?.before || "";
      overlay.querySelector(".extract-interface-after").textContent = entry?.after || "";
    }

    function showPreview(preview) {
      const list = overlay.querySelector(".extract-interface-file-list");
      list.replaceChildren();
      const summaries = preview.summary || [];
      summaries.forEach((entry, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.textContent = entry.destination ? `${entry.path} → ${entry.destination}` : entry.path;
        button.addEventListener("click", () => {
          list.querySelectorAll("button").forEach((item) => item.setAttribute("aria-selected", "false"));
          button.setAttribute("aria-selected", "true");
          renderPreviewFile(entry);
        });
        if (index === 0) button.setAttribute("aria-selected", "true");
        list.appendChild(button);
      });
      renderPreviewFile(summaries.find((entry) => entry.type === "modify") || summaries[0]);
      overlay.querySelector(".extract-interface-configuration").hidden = true;
      overlay.querySelector(".extract-interface-preview").hidden = false;
      overlay.querySelector(".extract-interface-back").hidden = false;
      overlay.querySelector(".extract-interface-preview-button").hidden = true;
      overlay.querySelector(".extract-interface-apply").hidden = false;
    }

    function showConfiguration() {
      overlay.querySelector(".extract-interface-configuration").hidden = false;
      overlay.querySelector(".extract-interface-preview").hidden = true;
      overlay.querySelector(".extract-interface-back").hidden = true;
      overlay.querySelector(".extract-interface-preview-button").hidden = false;
      overlay.querySelector(".extract-interface-apply").hidden = true;
      preparedPreview = null;
      updateValidation();
    }

    async function preparePreview() {
      if (getNameError()) return;
      setBusy(true);
      try {
        preparedPreview = await workflow.preparePreview(getSettings());
        showPreview(preparedPreview);
      } catch (error) {
        workflowError = error?.message || "Unable to preview Extract Interface.";
      } finally {
        setBusy(false);
      }
    }

    async function applyPreview() {
      if (!preparedPreview) return;
      setBusy(true);
      try {
        applyResult = await workflow.applyPreview(preparedPreview);
        await workflow.onAfterApply?.();
        overlay.querySelector(".extract-interface-preview").hidden = true;
        overlay.querySelector(".extract-interface-applied").hidden = false;
        overlay.querySelector(".extract-interface-back").hidden = true;
        overlay.querySelector(".extract-interface-apply").hidden = true;
        overlay.querySelector(".extract-interface-cancel").textContent = "Close";
      } catch (error) {
        workflowError = error?.message || "Unable to apply Extract Interface.";
        showConfiguration();
      } finally {
        setBusy(false);
      }
    }

    async function undoAppliedRefactoring() {
      if (!applyResult?.undo) return;
      setBusy(true);
      try {
        await applyResult.undo();
        await workflow.onAfterUndo?.();
        close({ applied: true, undone: true });
      } finally {
        setBusy(false);
      }
    }

    return {
      /** Open the complete configure, preview, apply, and undo workflow. */
      open(nextWorkflow) {
        if (resolveOpen) close(null);
        ensureDialog();
        workflow = nextWorkflow;
        members = Array.isArray(workflow.members) ? workflow.members : [];
        selectedHandles = new Set();
        preparedPreview = null;
        applyResult = null;
        workflowError = "";
        overlay.querySelector(".extract-interface-name").value = "";
        overlay.querySelector(".extract-interface-replace").checked = true;
        overlay.querySelector(".extract-interface-instanceof").checked = false;
        overlay.querySelector(".extract-interface-overrides").checked = true;
        overlay.querySelector(".extract-interface-comments").checked = true;
        overlay.querySelector(".extract-interface-applied").hidden = true;
        overlay.querySelector(".extract-interface-cancel").textContent = "Cancel";
        showConfiguration();
        updateOptionDependency();
        renderMembers();
        overlay.hidden = false;
        overlay.querySelector(".extract-interface-name").focus();
        return new Promise((resolve) => { resolveOpen = resolve; });
      }
    };
  }

  createMarkdownViewerExtractInterfaceDialog._test = { isValidJavaIdentifier };
  global.createMarkdownViewerExtractInterfaceDialog = createMarkdownViewerExtractInterfaceDialog;
})(typeof window !== "undefined" ? window : globalThis);
