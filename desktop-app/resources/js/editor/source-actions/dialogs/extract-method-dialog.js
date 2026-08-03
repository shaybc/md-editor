// Eclipse-style configuration, preview, apply, and undo workflow for Extract Method.
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

  function createMarkdownViewerExtractMethodDialog(options = {}) {
    const document = options.document || global.document;
    let overlay = null;
    let workflow = null;
    let preparedPreview = null;
    let preparedSettingsKey = "";
    let workflowError = "";
    let resolveOpen = null;

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      overlay.classList.remove("extract-method-preview-mode");
      const resolve = resolveOpen;
      resolveOpen = null;
      resolve?.(result);
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "extract-method-dialog";
      overlay.className = "extract-method-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "extract-method-dialog-title");
      overlay.innerHTML = [
        '<section class="extract-method-dialog-panel">',
        '<header class="extract-method-dialog-header"><span class="extract-method-dialog-icon" aria-hidden="true">?</span>',
        '<h2 id="extract-method-dialog-title">Extract Method</h2>',
        '<button type="button" class="extract-method-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="extract-method-configuration">',
        '<label class="extract-method-name-label"><span>Method name:</span>',
        '<input class="extract-method-name" type="text" autocomplete="off" spellcheck="false" required></label>',
        '<p class="extract-method-validation" role="alert"></p>',
        '<fieldset class="extract-method-options"><legend>Access modifier</legend>',
        '<div class="extract-method-access-row">',
        '<label><input type="radio" name="extract-method-access" value="public"> public</label>',
        '<label><input type="radio" name="extract-method-access" value="protected"> protected</label>',
        '<label><input type="radio" name="extract-method-access" value="package"> package</label>',
        '<label><input type="radio" name="extract-method-access" value="private"> private</label>',
        '</div><div class="extract-method-modifier-row">',
        '<label><input class="extract-method-final" type="checkbox"> final</label>',
        '<label><input class="extract-method-synchronized" type="checkbox"> synchronized</label>',
        '</div></fieldset>',
        '<div class="extract-method-jdt-options">',
        '<label><input type="checkbox" disabled> Declare thrown runtime exceptions</label>',
        '<label><input class="extract-method-comment" type="checkbox"> Generate method comment</label>',
        '<label><input type="checkbox" disabled> Replace additional occurrences of statements with method</label>',
        '<small>Runtime-exception and additional-occurrence options are controlled by JDT LS.</small>',
        '</div>',
        '<section class="extract-method-signature-section"><h3>Method signature preview:</h3>',
        '<pre class="extract-method-signature" aria-live="polite"></pre></section>',
        '</div>',
        '<div class="extract-method-preview" hidden>',
        '<section class="extract-method-changes"><h3>Changes to be performed</h3>',
        '<div class="extract-method-change-tree" role="tree">',
        '<div class="extract-method-tree-row extract-method-tree-file" role="treeitem"><span>?</span><input type="checkbox" checked disabled><strong class="extract-method-change-file"></strong></div>',
        '<div class="extract-method-tree-row extract-method-tree-type" role="treeitem"><span>?</span><input type="checkbox" checked disabled><span class="extract-method-change-type"></span></div>',
        '<div class="extract-method-tree-row extract-method-tree-member" role="treeitem"><span>?</span><input type="checkbox" checked disabled><span>Selected Java member</span></div>',
        '<div class="extract-method-tree-row extract-method-tree-leaf" role="treeitem"><span></span><input type="checkbox" checked disabled><span class="extract-method-change-substitute"></span></div>',
        '<div class="extract-method-tree-row extract-method-tree-leaf" role="treeitem"><span></span><input type="checkbox" checked disabled><span class="extract-method-change-create"></span></div>',
        '</div></section>',
        '<section class="extract-method-diff-shell">',
        '<div class="extract-method-diff-toolbar"><span class="extract-method-diff-file"></span><strong>2 Differences</strong></div>',
        '<div class="extract-method-diff-headings"><h3>Original Source</h3><h3>Refactored Source</h3></div>',
        '<div class="extract-method-diff"><pre class="extract-method-before"></pre><pre class="extract-method-after"></pre></div>',
        '</section></div>',
        '<footer class="extract-method-dialog-footer">',
        '<button type="button" class="extract-method-back" hidden>&lt; Back</button>',
        '<span class="extract-method-footer-spacer"></span>',
        '<button type="button" class="extract-method-preview-button">Preview &gt;</button>',
        '<button type="button" class="extract-method-ok">OK</button>',
        '<button type="button" class="extract-method-cancel">Cancel</button>',
        '</footer></section>'
      ].join("");
      document.body.appendChild(overlay);

      overlay.querySelector(".extract-method-dialog-close").addEventListener("click", () => close(null));
      overlay.querySelector(".extract-method-cancel").addEventListener("click", () => close(null));
      overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(null); });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(null);
        }
      });
      overlay.querySelector(".extract-method-name").addEventListener("input", () => {
        workflowError = "";
        preparedPreview = null;
        preparedSettingsKey = "";
        updateConfiguration();
      });
      overlay.querySelectorAll('input[name="extract-method-access"], .extract-method-final, .extract-method-synchronized, .extract-method-comment')
        .forEach((input) => input.addEventListener("change", () => {
          workflowError = "";
          preparedPreview = null;
          preparedSettingsKey = "";
          updateConfiguration();
        }));
      overlay.querySelector(".extract-method-preview-button").addEventListener("click", preparePreview);
      overlay.querySelector(".extract-method-back").addEventListener("click", showConfiguration);
      overlay.querySelector(".extract-method-ok").addEventListener("click", applyCurrentConfiguration);
      return overlay;
    }

    function getMethodName() {
      return overlay.querySelector(".extract-method-name").value.trim();
    }

    function getValidationError() {
      const methodName = getMethodName();
      if (!methodName) return "Enter a method name.";
      if (!isValidJavaIdentifier(methodName)) return "Enter a valid Java method name.";
      return "";
    }

    function getSelectedSettings() {
      return {
        methodName: getMethodName(),
        accessModifier: overlay.querySelector('input[name="extract-method-access"]:checked')?.value || "package",
        declareFinal: overlay.querySelector(".extract-method-final").checked,
        declareSynchronized: overlay.querySelector(".extract-method-synchronized").checked,
        generateMethodComment: overlay.querySelector(".extract-method-comment").checked
      };
    }

    function initializeSupportedOptions(signature) {
      const text = String(signature || "");
      const access = /\b(public|protected|private)\b/.exec(text)?.[1] || "package";
      const accessInput = overlay.querySelector(`input[name="extract-method-access"][value="${access}"]`);
      if (accessInput) accessInput.checked = true;
      overlay.querySelector(".extract-method-final").checked = /\bfinal\b/.test(text);
      overlay.querySelector(".extract-method-synchronized").checked = /\bsynchronized\b/.test(text);
      overlay.querySelector(".extract-method-comment").checked = false;
    }

    function updateConfiguration() {
      const validation = getValidationError() || workflowError;
      const signature = workflow?.getSignature?.(getSelectedSettings()) || workflow?.methodSignature || "";
      overlay.querySelector(".extract-method-validation").textContent = validation;
      overlay.querySelector(".extract-method-signature").textContent = signature;
      overlay.querySelector(".extract-method-preview-button").disabled = !!validation;
      overlay.querySelector(".extract-method-ok").disabled = !!validation;
    }

    function setBusy(busy) {
      overlay.querySelectorAll('button, .extract-method-name, input[name="extract-method-access"], .extract-method-final, .extract-method-synchronized, .extract-method-comment')
        .forEach((element) => { element.disabled = busy; });
      if (!busy) updateConfiguration();
    }

    function renderDiff(pre, source, comparison) {
      pre.replaceChildren();
      const lines = String(source || "").split(/\r?\n/);
      const other = String(comparison || "").split(/\r?\n/);
      lines.forEach((line, index) => {
        const row = document.createElement("span");
        row.className = line === other[index] ? "extract-method-diff-line" : "extract-method-diff-line extract-method-diff-line-changed";
        row.textContent = line || " ";
        pre.appendChild(row);
      });
    }

    function getPreviewSummary(preview) {
      return (preview?.summary || []).find((entry) => entry.type === "modify") || preview?.summary?.[0];
    }

    function showPreview(preview) {
      const summary = getPreviewSummary(preview);
      if (!summary) throw new Error("Extract Method preview contains no source changes.");
      const path = String(summary.path || "Java source");
      const fileName = path.split(/[\\/]/).pop() || path;
      const typeName = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/.exec(String(summary.before || ""))?.[1] || "Java type";
      const methodName = preview.methodName || getMethodName();
      overlay.querySelector(".extract-method-change-file").textContent = fileName;
      overlay.querySelector(".extract-method-change-type").textContent = typeName;
      overlay.querySelector(".extract-method-change-substitute").textContent = `Substitute selected code with call to ${methodName}`;
      overlay.querySelector(".extract-method-change-create").textContent = `Create new method '${methodName}' from selected code`;
      overlay.querySelector(".extract-method-diff-file").textContent = fileName;
      renderDiff(overlay.querySelector(".extract-method-before"), summary.before, summary.after);
      renderDiff(overlay.querySelector(".extract-method-after"), summary.after, summary.before);
      overlay.querySelector(".extract-method-configuration").hidden = true;
      overlay.querySelector(".extract-method-preview").hidden = false;
      overlay.querySelector(".extract-method-back").hidden = false;
      overlay.querySelector(".extract-method-preview-button").hidden = true;
      overlay.classList.add("extract-method-preview-mode");
    }

    function showConfiguration() {
      overlay.querySelector(".extract-method-configuration").hidden = false;
      overlay.querySelector(".extract-method-preview").hidden = true;
      overlay.querySelector(".extract-method-back").hidden = true;
      overlay.querySelector(".extract-method-preview-button").hidden = false;
      overlay.classList.remove("extract-method-preview-mode");
      updateConfiguration();
    }

    async function getPreparedPreview() {
      if (getValidationError()) return null;
      const settings = getSelectedSettings();
      const settingsKey = JSON.stringify(settings);
      if (preparedPreview && preparedSettingsKey === settingsKey) return preparedPreview;
      preparedPreview = await workflow.preparePreview(settings);
      preparedSettingsKey = settingsKey;
      return preparedPreview;
    }

    async function preparePreview() {
      setBusy(true);
      try {
        const preview = await getPreparedPreview();
        if (preview) showPreview(preview);
      } catch (error) {
        workflowError = error?.message || "Unable to preview Extract Method.";
      } finally {
        setBusy(false);
      }
    }

    function showUndoBanner(applyResult) {
      if (!applyResult?.undo) return;
      const onAfterUndo = workflow?.onAfterUndo;
      document.querySelector(".extract-method-undo-banner")?.remove();
      const banner = document.createElement("div");
      banner.className = "extract-method-undo-banner";
      banner.innerHTML = '<span>Extract Method completed.</span><button type="button">Undo Extract Method</button><button type="button" class="extract-method-undo-dismiss" aria-label="Dismiss">&times;</button>';
      banner.querySelector("button").addEventListener("click", async () => {
        const undoButton = banner.querySelector("button");
        undoButton.disabled = true;
        try {
          await applyResult.undo();
          await onAfterUndo?.();
          banner.remove();
        } catch (_error) {
          undoButton.disabled = false;
        }
      });
      banner.querySelector(".extract-method-undo-dismiss").addEventListener("click", () => banner.remove());
      document.body.appendChild(banner);
    }

    async function applyCurrentConfiguration() {
      setBusy(true);
      try {
        const preview = await getPreparedPreview();
        if (!preview) return;
        const applyResult = await workflow.applyPreview(preview);
        if (!applyResult?.applied) throw new Error("Extract Method could not be applied.");
        await workflow.onAfterApply?.();
        close({ applied: true });
        showUndoBanner(applyResult);
      } catch (error) {
        workflowError = error?.message || "Unable to apply Extract Method.";
        showConfiguration();
      } finally {
        setBusy(false);
      }
    }

    return {
      /** Open the two-page Eclipse-style Extract Method wizard. */
      open(nextWorkflow) {
        if (resolveOpen) close(null);
        ensureDialog();
        workflow = nextWorkflow;
        preparedPreview = nextWorkflow.initialPreview || null;
        workflowError = "";
        overlay.querySelector(".extract-method-name").value = nextWorkflow.defaultMethodName || "";
        initializeSupportedOptions(nextWorkflow.methodSignature || "");
        preparedSettingsKey = preparedPreview ? JSON.stringify(getSelectedSettings()) : "";
        showConfiguration();
        overlay.hidden = false;
        const input = overlay.querySelector(".extract-method-name");
        input.focus();
        input.select();
        return new Promise((resolve) => { resolveOpen = resolve; });
      }
    };
  }

  createMarkdownViewerExtractMethodDialog._test = { isValidJavaIdentifier };
  global.createMarkdownViewerExtractMethodDialog = createMarkdownViewerExtractMethodDialog;
})(typeof window !== "undefined" ? window : globalThis);
