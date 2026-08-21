// Kubernetes dry-run option dialog for project commands.
(function(global) {
  "use strict";

  /** Register a modal that collects Kubernetes dry-run execution options. */
  function registerMarkdownViewerKubernetesCommandOptionsDialog(app, deps = {}) {
    const documentRef = deps.document || global.document;

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function ensureDialog() {
      let overlay = documentRef.getElementById("kubernetes-command-options-modal");
      if (overlay) return overlay;
      overlay = createElement("div", "reset-modal-overlay kubernetes-command-options-modal");
      overlay.id = "kubernetes-command-options-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "kubernetes-command-options-title");
      overlay.hidden = true;
      overlay.innerHTML = [
        '<div class="reset-modal-box kubernetes-command-options-box">',
        '  <div class="project-command-modal-header">',
        '    <div>',
        '      <p class="project-command-modal-eyebrow">Kubernetes</p>',
        '      <h2 id="kubernetes-command-options-title">Dry Run Options</h2>',
        '    </div>',
        '    <button class="settings-modal-close" type="button" data-kubernetes-options-close aria-label="Close"><i class="bi bi-x" aria-hidden="true"></i></button>',
        '  </div>',
        '  <div class="kubernetes-command-options-content">',
        '    <div class="kubernetes-command-options-column kubernetes-command-options-form">',
        '      <label class="project-command-field-label" for="kubernetes-dry-run-mode">Mode</label>',
        '      <select class="rename-modal-input" id="kubernetes-dry-run-mode" data-kubernetes-options-mode>',
        '        <option value="client">Client dry run</option>',
        '        <option value="server">Server dry run</option>',
        '      </select>',
        '      <label class="project-command-field-label" for="kubernetes-dry-run-context">Context</label>',
        '      <input class="rename-modal-input" id="kubernetes-dry-run-context" data-kubernetes-options-context list="kubernetes-dry-run-context-options" placeholder="current context">',
        '      <datalist id="kubernetes-dry-run-context-options" data-kubernetes-options-context-list></datalist>',
        '      <label class="project-command-field-label" for="kubernetes-dry-run-namespace">Namespace</label>',
        '      <input class="rename-modal-input" id="kubernetes-dry-run-namespace" data-kubernetes-options-namespace list="kubernetes-dry-run-namespace-options" placeholder="default">',
        '      <datalist id="kubernetes-dry-run-namespace-options" data-kubernetes-options-namespace-list></datalist>',
        '      <label class="project-command-checkbox-row"><input type="checkbox" data-kubernetes-options-validate checked><span>Use Kubernetes schema validation</span></label>',
        '    </div>',
        '    <div class="kubernetes-command-options-column kubernetes-command-options-preview">',
        '      <div class="project-command-summary-grid">',
        '        <div><span>Manifest source</span><strong data-kubernetes-options-source></strong></div>',
        '      </div>',
        '      <label class="project-command-field-label" for="kubernetes-dry-run-command-preview">Command preview</label>',
        '      <pre id="kubernetes-dry-run-command-preview" class="project-command-code" data-kubernetes-options-command></pre>',
        '    </div>',
        '  </div>',
        '  <div class="reset-modal-actions project-command-modal-actions">',
        '    <button class="reset-modal-btn reset-modal-cancel project-command-modal-btn" type="button" data-kubernetes-options-cancel>Cancel</button>',
        '    <button class="reset-modal-btn settings-primary-action project-command-modal-btn" type="button" data-kubernetes-options-run>Run</button>',
        '  </div>',
        '</div>'
      ].join("");
      documentRef.body.appendChild(overlay);
      return overlay;
    }

    function getParts(overlay) {
      return {
        mode: overlay.querySelector("[data-kubernetes-options-mode]"),
        validate: overlay.querySelector("[data-kubernetes-options-validate]"),
        context: overlay.querySelector("[data-kubernetes-options-context]"),
        contextList: overlay.querySelector("[data-kubernetes-options-context-list]"),
        namespace: overlay.querySelector("[data-kubernetes-options-namespace]"),
        namespaceList: overlay.querySelector("[data-kubernetes-options-namespace-list]"),
        source: overlay.querySelector("[data-kubernetes-options-source]"),
        command: overlay.querySelector("[data-kubernetes-options-command]"),
        run: overlay.querySelector("[data-kubernetes-options-run]"),
        cancel: overlay.querySelector("[data-kubernetes-options-cancel]"),
        close: overlay.querySelector("[data-kubernetes-options-close]")
      };
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function normalizeContextName(value) {
      const text = String(value || "").trim();
      return text === "current context" ? "" : text;
    }

    function normalizeBaseCommand(command) {
      return String(command || "kubectl apply")
        .replace(/\s+--dry-run=(?:client|server)\b/g, "")
        .replace(/\s+--validate=false\b/g, "")
        .replace(/\s+-f\s+(?:"[^"]*"|\S+)/g, "")
        .trim() || "kubectl apply";
    }

    function setDatalistOptions(list, values) {
      if (!list) return;
      list.replaceChildren();
      Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))).forEach((value) => {
        const option = documentRef.createElement("option");
        option.value = value;
        list.appendChild(option);
      });
    }

    function buildPreview(options) {
      const command = normalizeBaseCommand(options.command);
      const mode = options.dryRunMode === "server" ? "server" : "client";
      const validate = options.validateSchema === false ? " --validate=false" : "";
      const contextName = normalizeContextName(options.contextName);
      const namespaceName = String(options.namespaceName || "").trim();
      const context = contextName ? ` --context ${quote(contextName)}` : "";
      const namespace = namespaceName ? ` --namespace ${quote(namespaceName)}` : "";
      const source = options.manifestPath || options.manifestSource || "<manifest>";
      return `${command}${context}${namespace} --dry-run=${mode}${validate} -f ${quote(source)}`;
    }

    /** Open the dry-run option dialog and resolve the selected options. */
    function open(initialOptions = {}) {
      const overlay = ensureDialog();
      const parts = getParts(overlay);
      let resolver = null;
      let settled = false;
      const previousFocus = documentRef.activeElement;

      function currentValue() {
        return Object.assign({}, initialOptions, {
          dryRunMode: parts.mode?.value === "server" ? "server" : "client",
          validateSchema: parts.validate?.checked !== false,
          contextName: normalizeContextName(parts.context?.value || initialOptions.contextName),
          namespaceName: String(parts.namespace?.value || initialOptions.namespaceName || "default").trim() || "default"
        });
      }

      function refreshPreview() {
        if (parts.command) parts.command.textContent = buildPreview(currentValue());
      }

      function cleanup(value) {
        if (settled) return;
        settled = true;
        overlay.hidden = true;
        overlay.style.display = "none";
        parts.mode?.removeEventListener("change", refreshPreview);
        parts.validate?.removeEventListener("change", refreshPreview);
        parts.context?.removeEventListener("input", refreshPreview);
        parts.namespace?.removeEventListener("input", refreshPreview);
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

      if (parts.mode) parts.mode.value = initialOptions.dryRunMode === "server" ? "server" : "client";
      if (parts.validate) parts.validate.checked = initialOptions.validateSchema !== false;
      if (parts.context) parts.context.value = normalizeContextName(initialOptions.contextName);
      if (parts.namespace) parts.namespace.value = initialOptions.namespaceName || "default";
      setDatalistOptions(parts.contextList, initialOptions.contextOptions || [initialOptions.contextName]);
      setDatalistOptions(parts.namespaceList, initialOptions.namespaceOptions || [initialOptions.namespaceName || "default"]);
      if (parts.source) parts.source.textContent = initialOptions.manifestSource || initialOptions.manifestPath || "active manifest";
      refreshPreview();

      parts.mode?.addEventListener("change", refreshPreview);
      parts.validate?.addEventListener("change", refreshPreview);
      parts.context?.addEventListener("input", refreshPreview);
      parts.namespace?.addEventListener("input", refreshPreview);
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
    app?.registerModule?.("kubernetesCommandOptionsDialog", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesCommandOptionsDialog = registerMarkdownViewerKubernetesCommandOptionsDialog;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesCommandOptionsDialog };
})(typeof window !== "undefined" ? window : globalThis);