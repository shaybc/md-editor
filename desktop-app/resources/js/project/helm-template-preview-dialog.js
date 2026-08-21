// Helm template preview wizard for project commands.
(function(global) {
  "use strict";

  /** Register a modal that collects Helm template rendering options. */
  function registerMarkdownViewerHelmTemplatePreviewDialog(app, deps = {}) {
    const documentRef = deps.document || global.document;

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function getFileName(filePath) {
      return String(filePath || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function normalizeValuesFiles(valuesFiles) {
      return (Array.isArray(valuesFiles) ? valuesFiles : [])
        .map((entry) => {
          if (typeof entry === "string") return { path: entry, name: getFileName(entry) || entry };
          const path = String(entry?.path || entry?.filePath || "").trim();
          return path ? { path, name: String(entry?.name || getFileName(path) || path) } : null;
        })
        .filter(Boolean);
    }

    function ensureDialog() {
      let overlay = documentRef.getElementById("helm-template-preview-modal");
      if (overlay) return overlay;
      overlay = createElement("div", "reset-modal-overlay helm-template-preview-modal");
      overlay.id = "helm-template-preview-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "helm-template-preview-title");
      overlay.hidden = true;
      overlay.innerHTML = [
        '<div class="reset-modal-box helm-template-preview-box">',
        '  <div class="project-command-modal-header">',
        '    <div>',
        '      <p class="project-command-modal-eyebrow">Helm</p>',
        '      <h2 id="helm-template-preview-title">Render Helm Template</h2>',
        '    </div>',
        '    <button class="settings-modal-close" type="button" data-helm-preview-close aria-label="Close"><i class="bi bi-x" aria-hidden="true"></i></button>',
        '  </div>',
        '  <div class="helm-template-preview-content">',
        '    <div class="helm-template-preview-column helm-template-preview-form">',
        '      <label class="project-command-field-label" for="helm-preview-mode">Mode</label>',
        '      <select class="rename-modal-input" id="helm-preview-mode" data-helm-preview-mode>',
        '        <option value="template">Active template</option>',
        '        <option value="chart">Full chart</option>',
        '      </select>',
        '      <div class="helm-template-preview-field-group">',
        '        <div class="helm-template-preview-section-title">Values files</div>',
        '        <div class="helm-template-preview-values-list" data-helm-preview-values-list></div>',
        '        <div class="helm-template-preview-inline-actions">',
        '          <button class="reset-modal-btn project-command-modal-btn" type="button" data-helm-preview-add-values><i class="bi bi-plus-lg" aria-hidden="true"></i><span>Add values files</span></button>',
        '        </div>',
        '      </div>',
        '      <label class="project-command-field-label" for="helm-preview-set-values">Additional values (--set)</label>',
        '      <input class="rename-modal-input" id="helm-preview-set-values" data-helm-preview-set-values placeholder="image.tag=1.0,replicaCount=2">',
        '    </div>',
        '    <div class="helm-template-preview-column helm-template-preview-summary">',
        '      <div class="project-command-summary-grid">',
        '        <div><span>Chart root</span><strong data-helm-preview-chart-root></strong></div>',
        '        <div><span>Active template</span><strong data-helm-preview-template></strong></div>',
        '      </div>',
        '      <label class="project-command-field-label" for="helm-preview-command-preview">Command preview</label>',
        '      <pre id="helm-preview-command-preview" class="project-command-code" data-helm-preview-command></pre>',
        '    </div>',
        '  </div>',
        '  <div class="reset-modal-actions project-command-modal-actions">',
        '    <button class="reset-modal-btn reset-modal-cancel project-command-modal-btn" type="button" data-helm-preview-cancel>Cancel</button>',
        '    <button class="reset-modal-btn settings-primary-action project-command-modal-btn" type="button" data-helm-preview-run>Render</button>',
        '  </div>',
        '</div>'
      ].join("");
      documentRef.body.appendChild(overlay);
      return overlay;
    }

    function getParts(overlay) {
      return {
        mode: overlay.querySelector("[data-helm-preview-mode]"),
        valuesList: overlay.querySelector("[data-helm-preview-values-list]"),
        addValues: overlay.querySelector("[data-helm-preview-add-values]"),
        setValues: overlay.querySelector("[data-helm-preview-set-values]"),
        chartRoot: overlay.querySelector("[data-helm-preview-chart-root]"),
        template: overlay.querySelector("[data-helm-preview-template]"),
        command: overlay.querySelector("[data-helm-preview-command]"),
        run: overlay.querySelector("[data-helm-preview-run]"),
        cancel: overlay.querySelector("[data-helm-preview-cancel]"),
        close: overlay.querySelector("[data-helm-preview-close]")
      };
    }

    function buildPreview(options) {
      const release = String(options.releaseName || "release");
      const chartRoot = String(options.chartRoot || "<chart>");
      const parts = ["helm", "template", quote(release), quote(chartRoot)];
      if (options.mode === "template" && options.templateRelativePath) parts.push("--show-only", quote(options.templateRelativePath));
      normalizeValuesFiles(options.valuesFiles).forEach((file) => parts.push("--values", quote(file.path)));
      if (String(options.setValues || "").trim()) parts.push("--set", quote(String(options.setValues).trim()));
      return parts.join(" ");
    }

    function renderValuesList(parts, state, refreshPreview) {
      if (!parts.valuesList) return;
      const files = normalizeValuesFiles(state.valuesFiles);
      parts.valuesList.replaceChildren();
      if (!files.length) {
        parts.valuesList.appendChild(createElement("div", "helm-template-preview-empty", "No extra values files selected."));
        return;
      }
      files.forEach((file, index) => {
        const row = createElement("div", "helm-template-preview-values-row");
        const name = createElement("div", "helm-template-preview-values-name");
        name.textContent = file.name || file.path;
        name.title = file.path;
        const remove = createElement("button", "reset-modal-btn project-command-modal-btn helm-template-preview-remove-values", "Remove");
        remove.type = "button";
        remove.addEventListener("click", () => {
          state.valuesFiles.splice(index, 1);
          renderValuesList(parts, state, refreshPreview);
          refreshPreview();
        });
        row.append(name, remove);
        parts.valuesList.appendChild(row);
      });
    }

    /** Open the Helm template preview wizard and resolve the selected render options. */
    function open(initialOptions = {}) {
      const overlay = ensureDialog();
      const parts = getParts(overlay);
      let resolver = null;
      let settled = false;
      const previousFocus = documentRef.activeElement;
      const state = Object.assign({}, initialOptions, {
        mode: initialOptions.mode === "chart" ? "chart" : "template",
        valuesFiles: normalizeValuesFiles(initialOptions.valuesFiles),
        setValues: String(initialOptions.setValues || "")
      });

      function currentValue() {
        return Object.assign({}, state, {
          mode: parts.mode?.value === "chart" ? "chart" : "template",
          valuesFiles: normalizeValuesFiles(state.valuesFiles),
          setValues: String(parts.setValues?.value || "").trim()
        });
      }

      function refreshPreview() {
        const value = currentValue();
        if (parts.command) parts.command.textContent = buildPreview(value);
        if (parts.template) parts.template.textContent = value.templateRelativePath || "not available";
        if (parts.run) parts.run.disabled = value.mode === "template" && !value.templateRelativePath;
      }

      async function onAddValues() {
        const selected = await deps.selectValuesFiles?.({ chartRoot: state.chartRoot, valuesFiles: state.valuesFiles }) || [];
        state.valuesFiles = normalizeValuesFiles([...state.valuesFiles, ...selected]);
        renderValuesList(parts, state, refreshPreview);
        refreshPreview();
      }

      function cleanup(value) {
        if (settled) return;
        settled = true;
        overlay.hidden = true;
        overlay.style.display = "none";
        parts.mode?.removeEventListener("change", refreshPreview);
        parts.setValues?.removeEventListener("input", refreshPreview);
        parts.addValues?.removeEventListener("click", onAddValues);
        parts.run?.removeEventListener("click", onRun);
        parts.cancel?.removeEventListener("click", onCancel);
        parts.close?.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onBackdrop);
        overlay.removeEventListener("keydown", onKeydown);
        previousFocus?.focus?.({ preventScroll: true });
        resolver?.(value);
      }

      function onRun() { cleanup(currentValue()); }
      function onCancel() { cleanup(null); }
      function onBackdrop(event) { if (event.target === overlay) cleanup(null); }
      function onKeydown(event) { if (event.key === "Escape") cleanup(null); }

      if (parts.mode) {
        parts.mode.value = state.mode;
        const templateOption = Array.from(parts.mode.options || []).find((option) => option.value === "template");
        if (templateOption) templateOption.disabled = !state.templateRelativePath;
        if (!state.templateRelativePath && parts.mode.value === "template") parts.mode.value = "chart";
      }
      if (parts.setValues) parts.setValues.value = state.setValues;
      if (parts.chartRoot) parts.chartRoot.textContent = state.chartRoot || "active chart";
      renderValuesList(parts, state, refreshPreview);
      refreshPreview();

      parts.mode?.addEventListener("change", refreshPreview);
      parts.setValues?.addEventListener("input", refreshPreview);
      parts.addValues?.addEventListener("click", onAddValues);
      parts.run?.addEventListener("click", onRun);
      parts.cancel?.addEventListener("click", onCancel);
      parts.close?.addEventListener("click", onCancel);
      overlay.addEventListener("click", onBackdrop);
      overlay.addEventListener("keydown", onKeydown);
      overlay.hidden = false;
      overlay.style.display = "flex";
      parts.mode?.focus?.();
      return new Promise((resolve) => { resolver = resolve; });
    }

    const api = { open };
    app?.registerModule?.("helmTemplatePreviewDialog", api);
    return api;
  }

  global.registerMarkdownViewerHelmTemplatePreviewDialog = registerMarkdownViewerHelmTemplatePreviewDialog;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerHelmTemplatePreviewDialog };
})(typeof window !== "undefined" ? window : globalThis);
