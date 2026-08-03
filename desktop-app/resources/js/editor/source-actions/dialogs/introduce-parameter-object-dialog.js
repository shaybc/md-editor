// Eclipse-style configuration, preview, apply, and undo workflow for Introduce Parameter Object.
(function(global) {
  "use strict";

  function createMarkdownViewerIntroduceParameterObjectDialog(options = {}) {
    const document = options.document || global.document;
    const modelTools = global.markdownViewerJavaParameterObjectModel;
    let overlay = null;
    let workflow = null;
    let model = null;
    let preview = null;
    let resolver = null;
    let selectedPreviewIndex = 0;

    function ensureDialog() {
      if (overlay || !document?.body) return;
      overlay = document.createElement("div");
      overlay.id = "introduce-parameter-object-dialog";
      overlay.className = "introduce-parameter-object-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "introduce-parameter-object-title");
      overlay.innerHTML = [
        '<section class="introduce-parameter-object-dialog-panel">',
        '<header class="introduce-parameter-object-dialog-header"><span class="introduce-parameter-object-icon" aria-hidden="true">P</span>',
        '<h2 id="introduce-parameter-object-title">Introduce Parameter Object</h2>',
        '<button type="button" class="introduce-parameter-object-close" aria-label="Close">&times;</button></header>',
        '<div class="introduce-parameter-object-configuration">',
        '<fieldset><legend>New parameter object class</legend>',
        '<label class="introduce-parameter-object-class-label"><span>Class name:</span><input class="introduce-parameter-object-class-name" required></label>',
        '<div class="introduce-parameter-object-destination"><span>Destination:</span>',
        '<label><input type="radio" name="introduce-parameter-object-destination" value="top-level" checked> Top level class</label>',
        '<label><input type="radio" name="introduce-parameter-object-destination" value="nested"> Nested class</label></div>',
        '<span class="introduce-parameter-object-fields-label">Select fields for parameter object class:</span>',
        '<div class="introduce-parameter-object-field-table"><div class="introduce-parameter-object-field-head"><span></span><span>Type</span><span>Name</span><span>Order</span></div>',
        '<div class="introduce-parameter-object-fields"></div></div>',
        '<div class="introduce-parameter-object-accessors">',
        '<label><input type="checkbox" class="introduce-parameter-object-getters" checked> Create getters</label>',
        '<label><input type="checkbox" class="introduce-parameter-object-setters" checked> Create setters</label></div></fieldset>',
        '<fieldset><legend>Method signature changes</legend>',
        '<label class="introduce-parameter-object-parameter-label"><span>Parameter name:</span><input class="introduce-parameter-object-parameter-name" required></label>',
        '<label><input type="checkbox" class="introduce-parameter-object-delegate"> Keep original method as delegate to changed method</label>',
        '<label class="introduce-parameter-object-dependent"><input type="checkbox" class="introduce-parameter-object-deprecate" disabled> Mark as deprecated</label>',
        '<div class="introduce-parameter-object-signature-label">Method signature preview:</div>',
        '<pre class="introduce-parameter-object-signature" aria-live="polite"></pre></fieldset>',
        '<p class="introduce-parameter-object-validation" role="alert"></p></div>',
        '<div class="introduce-parameter-object-preview" hidden>',
        '<section class="introduce-parameter-object-changes"><h3>Changes to be performed</h3><div class="introduce-parameter-object-file-list"></div></section>',
        '<section class="introduce-parameter-object-diff-shell"><div class="introduce-parameter-object-diff-file"></div>',
        '<div class="introduce-parameter-object-diff-headings"><h3>Original Source</h3><h3>Refactored Source</h3></div>',
        '<div class="introduce-parameter-object-diff"><pre class="introduce-parameter-object-before"></pre><pre class="introduce-parameter-object-after"></pre></div></section></div>',
        '<footer class="introduce-parameter-object-dialog-footer">',
        '<button type="button" class="introduce-parameter-object-back" hidden>&lt; Back</button><span></span>',
        '<button type="button" class="introduce-parameter-object-preview-button">Preview &gt;</button>',
        '<button type="button" class="introduce-parameter-object-ok">OK</button>',
        '<button type="button" class="introduce-parameter-object-cancel">Cancel</button></footer>',
        '</section>'
      ].join("");
      document.body.appendChild(overlay);

      overlay.querySelector(".introduce-parameter-object-close").addEventListener("click", () => close(null));
      overlay.querySelector(".introduce-parameter-object-cancel").addEventListener("click", () => close(null));
      overlay.querySelector(".introduce-parameter-object-back").addEventListener("click", showConfiguration);
      overlay.querySelector(".introduce-parameter-object-preview-button").addEventListener("click", preparePreview);
      overlay.querySelector(".introduce-parameter-object-ok").addEventListener("click", applyCurrent);
      overlay.querySelector(".introduce-parameter-object-fields").addEventListener("input", onFieldInput);
      overlay.querySelector(".introduce-parameter-object-fields").addEventListener("click", onFieldAction);
      overlay.querySelector(".introduce-parameter-object-configuration").addEventListener("input", onConfigurationInput);
      overlay.querySelector(".introduce-parameter-object-configuration").addEventListener("change", onConfigurationInput);
    }

    function readModel() {
      model.className = overlay.querySelector(".introduce-parameter-object-class-name").value.trim();
      model.destination = overlay.querySelector('input[name="introduce-parameter-object-destination"]:checked')?.value || "top-level";
      model.createGetters = overlay.querySelector(".introduce-parameter-object-getters").checked;
      model.createSetters = overlay.querySelector(".introduce-parameter-object-setters").checked;
      model.parameterName = overlay.querySelector(".introduce-parameter-object-parameter-name").value.trim();
      model.keepDelegate = overlay.querySelector(".introduce-parameter-object-delegate").checked;
      model.deprecateDelegate = overlay.querySelector(".introduce-parameter-object-deprecate").checked;
      return model;
    }

    function writeModel() {
      overlay.querySelector(".introduce-parameter-object-class-name").value = model.className;
      const destination = overlay.querySelector(`input[name="introduce-parameter-object-destination"][value="${model.destination}"]`);
      if (destination) destination.checked = true;
      overlay.querySelector(".introduce-parameter-object-getters").checked = model.createGetters;
      overlay.querySelector(".introduce-parameter-object-setters").checked = model.createSetters;
      overlay.querySelector(".introduce-parameter-object-parameter-name").value = model.parameterName;
      overlay.querySelector(".introduce-parameter-object-delegate").checked = model.keepDelegate;
      overlay.querySelector(".introduce-parameter-object-deprecate").checked = model.deprecateDelegate;
      renderFields();
      updateConfiguration();
    }

    function renderFields() {
      const container = overlay.querySelector(".introduce-parameter-object-fields");
      container.innerHTML = "";
      const ordered = model.fields.slice().sort((left, right) => left.order - right.order);
      ordered.forEach((field, index) => {
        const row = document.createElement("div");
        row.className = "introduce-parameter-object-field";
        row.dataset.originalIndex = String(field.originalIndex);
        const escapeHtml = (value) => String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        row.innerHTML = [
          `<input type="checkbox" class="introduce-parameter-object-field-selected" ${field.selected ? "checked" : ""} aria-label="Include ${escapeHtml(field.originalName)}">`,
          `<code>${escapeHtml(field.type)}</code>`,
          `<input type="text" class="introduce-parameter-object-field-name" value="${escapeHtml(field.fieldName)}">`,
          '<span class="introduce-parameter-object-field-order">',
          `<button type="button" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="Move field up">&uarr;</button>`,
          `<button type="button" data-direction="down" ${index === ordered.length - 1 ? "disabled" : ""} aria-label="Move field down">&darr;</button></span>`
        ].join("");
        container.appendChild(row);
      });
    }

    function fieldForRow(row) {
      return model.fields.find((field) => String(field.originalIndex) === row?.dataset?.originalIndex);
    }

    function onFieldInput(event) {
      const row = event.target.closest(".introduce-parameter-object-field");
      const field = fieldForRow(row);
      if (!field) return;
      if (event.target.classList.contains("introduce-parameter-object-field-selected")) field.selected = event.target.checked;
      if (event.target.classList.contains("introduce-parameter-object-field-name")) field.fieldName = event.target.value.trim();
      updateConfiguration();
    }

    function onFieldAction(event) {
      const button = event.target.closest("button[data-direction]");
      if (!button) return;
      const field = fieldForRow(button.closest(".introduce-parameter-object-field"));
      const ordered = model.fields.slice().sort((left, right) => left.order - right.order);
      const index = ordered.indexOf(field);
      const targetIndex = button.dataset.direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
      const target = ordered[targetIndex];
      [field.order, target.order] = [target.order, field.order];
      renderFields();
      updateConfiguration();
    }

    function onConfigurationInput() {
      readModel();
      const delegate = overlay.querySelector(".introduce-parameter-object-delegate");
      const deprecate = overlay.querySelector(".introduce-parameter-object-deprecate");
      deprecate.disabled = !delegate.checked;
      if (!delegate.checked) {
        deprecate.checked = false;
        model.deprecateDelegate = false;
      }
      updateConfiguration();
    }

    function updateConfiguration() {
      const validation = workflow?.validate?.(model) || "";
      overlay.querySelector(".introduce-parameter-object-validation").textContent = validation;
      overlay.querySelector(".introduce-parameter-object-signature").textContent = workflow?.getSignature?.(model) || "";
      overlay.querySelector(".introduce-parameter-object-preview-button").disabled = !!validation;
      overlay.querySelector(".introduce-parameter-object-ok").disabled = !!validation;
    }

    function setBusy(busy) {
      overlay.querySelectorAll("button, input").forEach((control) => {
        control.disabled = busy || (control.classList.contains("introduce-parameter-object-deprecate") && !model?.keepDelegate);
      });
    }

    function previewEntries() {
      return (preview?.summary || []).filter((entry) => entry.type === "modify");
    }

    function renderSelectedPreview() {
      const entries = previewEntries();
      const entry = entries[selectedPreviewIndex] || entries[0];
      if (!entry) throw new Error("Introduce Parameter Object preview contains no source changes.");
      overlay.querySelector(".introduce-parameter-object-diff-file").textContent = entry.path;
      overlay.querySelector(".introduce-parameter-object-before").textContent = entry.before || "";
      overlay.querySelector(".introduce-parameter-object-after").textContent = entry.after || "";
      overlay.querySelectorAll(".introduce-parameter-object-file-list button").forEach((button, index) => {
        button.setAttribute("aria-selected", String(index === selectedPreviewIndex));
      });
    }

    function renderPreview() {
      const entries = previewEntries();
      const list = overlay.querySelector(".introduce-parameter-object-file-list");
      list.innerHTML = "";
      entries.forEach((entry, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry.path;
        button.addEventListener("click", () => {
          selectedPreviewIndex = index;
          renderSelectedPreview();
        });
        list.appendChild(button);
      });
      selectedPreviewIndex = 0;
      renderSelectedPreview();
      overlay.querySelector(".introduce-parameter-object-configuration").hidden = true;
      overlay.querySelector(".introduce-parameter-object-preview").hidden = false;
      overlay.querySelector(".introduce-parameter-object-back").hidden = false;
      overlay.querySelector(".introduce-parameter-object-preview-button").hidden = true;
      overlay.classList.add("introduce-parameter-object-preview-mode");
    }

    function showConfiguration() {
      overlay.querySelector(".introduce-parameter-object-configuration").hidden = false;
      overlay.querySelector(".introduce-parameter-object-preview").hidden = true;
      overlay.querySelector(".introduce-parameter-object-back").hidden = true;
      overlay.querySelector(".introduce-parameter-object-preview-button").hidden = false;
      overlay.classList.remove("introduce-parameter-object-preview-mode");
      preview = null;
      updateConfiguration();
    }

    async function preparePreview() {
      readModel();
      const validation = workflow.validate(model);
      if (validation) return updateConfiguration();
      setBusy(true);
      try {
        preview = await workflow.preparePreview(modelTools.clone(model));
        renderPreview();
      } catch (error) {
        overlay.querySelector(".introduce-parameter-object-validation").textContent =
          error?.message || "Unable to preview Introduce Parameter Object.";
      } finally {
        setBusy(false);
      }
    }

    function showUndoBanner(applyResult) {
      document.querySelector(".introduce-parameter-object-undo-banner")?.remove();
      const banner = document.createElement("div");
      banner.className = "introduce-parameter-object-undo-banner";
      banner.innerHTML = '<span>Introduce Parameter Object completed.</span><button type="button">Undo Introduce Parameter Object</button><button type="button" class="introduce-parameter-object-undo-dismiss" aria-label="Dismiss">&times;</button>';
      document.body.appendChild(banner);
      banner.querySelector("button").addEventListener("click", async () => {
        await applyResult.undo?.();
        await workflow.onAfterUndo?.();
        banner.remove();
      });
      banner.querySelector(".introduce-parameter-object-undo-dismiss").addEventListener("click", () => banner.remove());
    }

    async function applyCurrent() {
      readModel();
      const validation = workflow.validate(model);
      if (validation) return updateConfiguration();
      setBusy(true);
      try {
        const prepared = preview || await workflow.preparePreview(modelTools.clone(model));
        const result = await workflow.applyPreview(prepared);
        if (!result?.applied) throw new Error("Introduce Parameter Object could not be applied.");
        await workflow.onAfterApply?.();
        showUndoBanner(result);
        close({ applied: true });
      } catch (error) {
        overlay.querySelector(".introduce-parameter-object-validation").textContent =
          error?.message || "Unable to apply Introduce Parameter Object.";
      } finally {
        setBusy(false);
      }
    }

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      overlay.classList.remove("introduce-parameter-object-preview-mode");
      const resolve = resolver;
      workflow = model = preview = resolver = null;
      resolve?.(result);
    }

    /**
     * Open the Introduce Parameter Object wizard.
     * @param {object} nextWorkflow Semantic analysis and preview/apply callbacks.
     * @returns {Promise<object|null>} Applied result or null when cancelled.
     */
    function open(nextWorkflow) {
      ensureDialog();
      if (!overlay || resolver) return Promise.reject(new Error("Introduce Parameter Object is already open."));
      workflow = nextWorkflow;
      model = modelTools.clone(nextWorkflow.initialModel);
      preview = null;
      showConfiguration();
      writeModel();
      overlay.hidden = false;
      overlay.querySelector(".introduce-parameter-object-class-name").focus();
      return new Promise((resolve) => { resolver = resolve; });
    }

    return { open };
  }

  global.createMarkdownViewerIntroduceParameterObjectDialog =
    createMarkdownViewerIntroduceParameterObjectDialog;
})(typeof window !== "undefined" ? window : globalThis);
