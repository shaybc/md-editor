(function(global) {
  "use strict";

  /** Render the guided and advanced Apache RAT Policy Manager workflow. */
  function registerMarkdownViewerRatPolicyDialog(app, deps = {}) {
    const STEPS = ["Current policy", "Project license", "Enforcement", "Coverage", "Review"];
    let overlay = null;
    let body = null;
    let model = null;
    let handlers = null;
    let stepIndex = 0;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function ensureDialog() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "rat-policy-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = `
        <section class="rat-policy-dialog" role="dialog" aria-modal="true" aria-labelledby="rat-policy-title">
          <header class="rat-policy-header">
            <div><span>PROJECT LICENSE GOVERNANCE</span><h2 id="rat-policy-title">Apache RAT Policy Manager</h2></div>
            <div class="rat-policy-header-actions">
              <button type="button" class="rat-policy-mode" data-rat-policy-mode>Advanced</button>
              <button type="button" class="rat-policy-close" aria-label="Close">&times;</button>
            </div>
          </header>
          <div class="rat-policy-layout">
            <nav class="rat-policy-steps" aria-label="Policy setup steps"></nav>
            <main class="rat-policy-body"></main>
            <aside class="rat-policy-summary" aria-label="Live policy summary"></aside>
          </div>
        </section>`;
      document.body.appendChild(overlay);
      body = overlay.querySelector(".rat-policy-body");
      overlay.querySelector(".rat-policy-close").addEventListener("click", requestClose);
      overlay.querySelector("[data-rat-policy-mode]").addEventListener("click", toggleMode);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) requestClose(); });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && overlay?.style.display !== "none") requestClose();
      });
    }

    async function confirmAction(options) {
      return typeof deps.confirm === "function" ? deps.confirm(options) : false;
    }

    async function requestClose() {
      if (model?.draft?.dirty) {
        const discard = await confirmAction({
          title: "Discard RAT policy draft?",
          message: "Your Apache RAT policy choices have not been applied. Discard this draft and close the manager?",
          confirmLabel: "Discard draft",
          confirmVariant: "danger",
          cancelLabel: "Keep editing"
        });
        if (!discard) return;
      }
      close();
    }

    function close() {
      if (overlay) overlay.style.display = "none";
      document.body.classList.remove("rat-policy-manager-open");
    }

    function updateDraft(patch) {
      model.draft = handlers.updateDraft(patch);
      renderSummary();
    }

    function toggleMode() {
      updateDraft({ mode: model.draft.mode === "advanced" ? "guided" : "advanced" });
      render();
    }

    function infoButton(topic, label) {
      return `<button class="rat-policy-info" type="button" data-rat-policy-help="${topic}" aria-label="Explain ${escapeHtml(label)}" title="Explain ${escapeHtml(label)}"><i class="bi bi-info-circle" aria-hidden="true"></i></button>`;
    }

    function bindHelp() {
      body.querySelectorAll("[data-rat-policy-help]").forEach((button) => {
        button.addEventListener("click", () => showHelp(button.dataset.ratPolicyHelp));
      });
    }

    function showHelp(topicId) {
      const topic = deps.helpContent.get(topicId);
      const help = document.createElement("div");
      help.className = "rat-policy-help-overlay";
      help.innerHTML = `
        <section class="rat-policy-help" role="dialog" aria-modal="true" aria-labelledby="rat-policy-help-title">
          <header><div><span>APACHE RAT HELP</span><h3 id="rat-policy-help-title">${escapeHtml(topic.title)}</h3></div><button type="button" data-close>&times;</button></header>
          <p>${escapeHtml(topic.body)}</p>
          <div class="rat-policy-callout warning"><strong>Developer decision</strong>${escapeHtml(topic.caution)}</div>
          <section><h4>Official guidance</h4>${topic.links.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`).join("")}</section>
          <footer><button type="button" data-close>Close</button></footer>
        </section>`;
      const remove = () => help.remove();
      help.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", remove));
      help.addEventListener("click", (event) => { if (event.target === help) remove(); });
      document.body.appendChild(help);
      help.querySelector("[data-close]")?.focus();
    }

    function renderSteps() {
      const nav = overlay.querySelector(".rat-policy-steps");
      nav.innerHTML = STEPS.map((step, index) => `
        <button type="button" class="${index === stepIndex ? "active" : ""}" data-step="${index}">
          <span>${index + 1}</span><span>${escapeHtml(step)}</span>
        </button>`).join("");
      nav.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
        stepIndex = Number(button.dataset.step);
        render();
      }));
      const mode = overlay.querySelector("[data-rat-policy-mode]");
      mode.textContent = model.draft.mode === "advanced" ? "Guided" : "Advanced";
      mode.setAttribute("aria-pressed", model.draft.mode === "advanced" ? "true" : "false");
    }

    function statusBadge(status) {
      const labels = { covered: "Active", inherited: "Inherited", "available-only": "pluginManagement only", "not-configured": "Not configured", "needs-effective-pom": "Needs confirmation" };
      return `<span class="rat-policy-badge ${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
    }

    function renderSummary() {
      const summary = overlay.querySelector(".rat-policy-summary");
      const draft = model.draft;
      summary.innerHTML = `
        <h3>Policy draft</h3>
        <dl>
          <dt>License</dt><dd>${escapeHtml(draft.projectLicense || "Not selected")}</dd>
          <dt>RAT version</dt><dd>${escapeHtml(draft.pluginVersion || "Unresolved")}</dd>
          <dt>Execution</dt><dd>${draft.bindToVerify ? "Maven verify" : "Manual check"}</dd>
          <dt>Configuration</dt><dd>${draft.useExternalConfiguration ? "External XML" : "POM"}</dd>
          <dt>Exclusions</dt><dd>${draft.exclusions.length}</dd>
          <dt>Validation</dt><dd>${escapeHtml(model.inventory.capabilities.validationLevel)}</dd>
        </dl>
        ${(draft.skip || draft.disableExecution) ? '<div class="rat-policy-badge bypass">Audit bypass selected</div>' : ""}
        <p>Changes remain unsaved until you explicitly save them.</p>`;
    }

    function footer(options = {}) {
      return `<footer class="rat-policy-footer">
        <button type="button" data-back ${stepIndex === 0 ? "disabled" : ""}>Back</button>
        <span></span>
        ${options.extra || ""}
        <button class="primary" type="button" data-next>${escapeHtml(options.nextLabel || (stepIndex === STEPS.length - 1 ? "Build preview" : "Continue"))}</button>
      </footer>`;
    }

    function bindNavigation(onNext) {
      body.querySelector("[data-back]")?.addEventListener("click", () => { stepIndex = Math.max(0, stepIndex - 1); render(); });
      body.querySelector("[data-next]")?.addEventListener("click", async () => {
        if (onNext && await onNext() === false) return;
        if (stepIndex < STEPS.length - 1) { stepIndex += 1; render(); }
      });
    }

    function currentPolicyPage() {
      const inventory = model.inventory;
      body.innerHTML = `
        <section class="rat-policy-page">
          <div class="rat-policy-page-title"><div><span>READ-ONLY INVENTORY</span><h3>Current project policy</h3></div>${infoButton("overview", "RAT policy")}</div>
          <p>MD-Editor inspected Maven files without running Maven, downloading artifacts, or changing the workspace.</p>
          <div class="rat-policy-fact-grid">
            <article><strong>Maven module</strong><code>${escapeHtml(inventory.module?.projectRoot)}</code></article>
            <article><strong>RAT declaration</strong><span>${inventory.hasActivePlugin ? "Active plugin" : inventory.hasPluginManagementOnly ? "pluginManagement only" : "Not found"}</span></article>
            <article><strong>Detected version</strong><span>${escapeHtml(inventory.pluginVersion || "Not resolved")}</span></article>
            <article><strong>Offline validation</strong><span>${escapeHtml(inventory.capabilities.validationLevel)}</span></article>
          </div>
          ${model.coverage.warnings.map((warning) => `<div class="rat-policy-callout warning">${escapeHtml(warning)}</div>`).join("")}
          <div class="rat-policy-callout"><strong>Recommended baseline</strong>Run RAT during Maven verify, keep defaults, add only reviewed exclusions or license matchers, and make bypasses explicit.</div>
          ${footer()}
        </section>`;
      bindHelp(); bindNavigation();
    }

    function licensePage() {
      const draft = model.draft;
      const choices = ["Apache-2.0", "MIT", "BSD-3-Clause", "EPL-2.0", "Custom"];
      body.innerHTML = `
        <section class="rat-policy-page">
          <div class="rat-policy-page-title"><div><span>OWNERSHIP BASELINE</span><h3>Select the project license</h3></div>${infoButton("license", "project license")}</div>
          <p>This describes project-owned work. Third-party content still needs its own provenance and license treatment.</p>
          <div class="rat-policy-license-grid">${choices.map((choice) => `<label class="rat-policy-choice"><input type="radio" name="license" value="${choice}" ${draft.projectLicense === choice ? "checked" : ""}><strong>${choice}</strong><span>${choice === "Custom" ? "Use a reviewed license name and policy definition." : "Known license identifier"}</span></label>`).join("")}</div>
          <label class="rat-policy-field ${draft.projectLicense === "Custom" ? "" : "advanced-hidden"}"><span>Custom license name</span><input data-field="customLicenseName" value="${escapeHtml(draft.customLicenseName)}"></label>
          <label class="rat-policy-check"><input type="checkbox" data-field="createLicenseFile" ${draft.createLicenseFile ? "checked" : ""} ${draft.projectLicense !== "Apache-2.0" || model.inventory.documents.some((entry) => /^LICENSE(?:\.|$)/i.test(entry.name)) ? "disabled" : ""}><span>Create an unsaved LICENSE draft from the bundled Apache-2.0 text when no LICENSE exists</span></label>
          ${footer()}
        </section>`;
      body.querySelectorAll('input[name="license"]').forEach((input) => input.addEventListener("change", () => { updateDraft({ projectLicense: input.value }); render(); }));
      body.querySelector('[data-field="customLicenseName"]')?.addEventListener("input", (event) => updateDraft({ customLicenseName: event.target.value }));
      body.querySelector('[data-field="createLicenseFile"]')?.addEventListener("change", (event) => updateDraft({ createLicenseFile: event.target.checked }));
      bindHelp(); bindNavigation(() => Boolean(model.draft.projectLicense));
    }

    function enforcementPage() {
      const draft = model.draft;
      const pomOptions = model.inventory.pomChain.map((pom) => `<option value="${escapeHtml(pom.path)}" ${pom.path === draft.targetPomPath ? "selected" : ""}>${escapeHtml(pom.path)}</option>`).join("");
      body.innerHTML = `
        <section class="rat-policy-page">
          <div class="rat-policy-page-title"><div><span>MAVEN INTEGRATION</span><h3>Choose how RAT is enforced</h3></div>${infoButton("coverage", "Maven execution")}</div>
          <label class="rat-policy-field"><span>Governing POM</span><select data-field="targetPomPath">${pomOptions}</select></label>
          <div class="rat-policy-two-column">
            <label class="rat-policy-field"><span>Apache RAT plugin version</span><input data-field="pluginVersion" value="${escapeHtml(draft.pluginVersion)}"></label>
            <label class="rat-policy-field"><span>Configuration placement</span><select data-field="configurationPlacement"><option value="inline" ${!draft.useExternalConfiguration ? "selected" : ""}>Inline POM configuration</option><option value="external" ${draft.useExternalConfiguration ? "selected" : ""}>External rat-config.xml</option></select></label>
          </div>
          <label class="rat-policy-check"><input type="checkbox" data-field="bindToVerify" ${draft.bindToVerify ? "checked" : ""}><span>Run <code>apache-rat:check</code> during Maven <code>verify</code></span></label>
          ${draft.mode === "advanced" ? `
            <section class="rat-policy-advanced"><h4>Advanced placement</h4>
              <label class="rat-policy-field"><span>External configuration path</span><input data-field="externalConfigurationPath" value="${escapeHtml(draft.externalConfigurationPath)}" ${draft.useExternalConfiguration ? "" : "disabled"}></label>
              <label class="rat-policy-check"><input type="checkbox" data-field="includeSubprojects" ${draft.includeSubprojects ? "checked" : ""}><span>Describe this as inherited by child modules (subject to effective-POM confirmation)</span></label>
            </section>` : ""}
          ${footer()}
        </section>`;
      body.querySelectorAll("[data-field]").forEach((control) => control.addEventListener("change", () => {
        const name = control.dataset.field;
        if (name === "configurationPlacement") updateDraft({ useExternalConfiguration: control.value === "external" });
        else updateDraft({ [name]: control.type === "checkbox" ? control.checked : control.value });
        if (name === "configurationPlacement") render();
      }));
      bindHelp(); bindNavigation();
    }

    function coveragePage() {
      const draft = model.draft;
      body.innerHTML = `
        <section class="rat-policy-page">
          <div class="rat-policy-page-title"><div><span>FILES AND MODULES</span><h3>Review coverage and exceptions</h3></div>${infoButton("exclusions", "RAT exclusions")}</div>
          <div class="rat-policy-coverage">${model.coverage.rows.map((row) => `<article><div><strong>${escapeHtml(row.name)}</strong><code>${escapeHtml(row.path)}</code></div>${statusBadge(row.status)}<p>${escapeHtml(row.reason)}</p></article>`).join("")}</div>
          <label class="rat-policy-field"><span>Reviewed exclusions — one Ant-style pattern per line</span><textarea data-field="exclusions" placeholder="generated/**&#10;src/test/resources/**/*.snapshot">${escapeHtml(draft.exclusions.join("\n"))}</textarea><small>Each exclusion stops inspection; it does not approve a license.</small></label>
          <label class="rat-policy-check"><input type="checkbox" data-field="useExclusionFile" ${draft.useExclusionFile ? "checked" : ""}><span>Keep exclusions in a separate file</span></label>
          ${draft.useExclusionFile ? `<label class="rat-policy-field"><span>Exclusion file</span><input data-field="exclusionFilePath" value="${escapeHtml(draft.exclusionFilePath)}"></label>` : ""}
          ${draft.mode === "advanced" ? `
            <section class="rat-policy-advanced">
              <div class="rat-policy-page-title"><div><h4>Advanced policy definitions</h4></div>${infoButton("approvals", "license-family approval")}</div>
              <p>External configuration is required for new custom definitions in this release.</p>
              <div class="rat-policy-two-column"><label class="rat-policy-field"><span>Family ID</span><input data-custom="familyId"></label><label class="rat-policy-field"><span>Family name</span><input data-custom="familyName"></label></div>
              <label class="rat-policy-field"><span>Exact matcher evidence</span><textarea data-custom="matcherEvidence"></textarea></label>
              <button type="button" data-add-family>Add reviewed family</button>
              <div class="rat-policy-tags">${draft.approvedFamilies.map((family) => `<span>${escapeHtml(family)}</span>`).join("")}</div>
              <details><summary>Advanced — bypasses license audit ${infoButton("bypass", "audit bypass")}</summary>
                <label class="rat-policy-check"><input type="checkbox" data-field="skip" ${draft.skip ? "checked" : ""}><span>Configure <code>&lt;skip&gt;true&lt;/skip&gt;</code></span></label>
                <label class="rat-policy-check"><input type="checkbox" data-field="disableExecution" ${draft.disableExecution ? "checked" : ""} ${model.inventory.hasActivePlugin ? "" : "disabled"}><span>Deactivate the discovered <code>check</code> execution without removing the plugin</span></label>
                ${model.inventory.hasActivePlugin ? "" : "<small>No active RAT execution was discovered.</small>"}
                <label class="rat-policy-check"><input type="checkbox" data-field="acknowledgedBypass" ${draft.acknowledgedBypass ? "checked" : ""}><span>I understand this bypasses the audit and does not fix license issues</span></label>
              </details>
            </section>` : ""}
          ${footer()}
        </section>`;
      body.querySelectorAll("[data-field]").forEach((control) => control.addEventListener("change", () => {
        const name = control.dataset.field;
        const value = name === "exclusions" ? control.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : control.type === "checkbox" ? control.checked : control.value;
        updateDraft({ [name]: value });
        if (name === "useExclusionFile") render();
      }));
      body.querySelector("[data-add-family]")?.addEventListener("click", () => {
        const familyId = body.querySelector('[data-custom="familyId"]').value.trim();
        const familyName = body.querySelector('[data-custom="familyName"]').value.trim();
        const matcherEvidence = body.querySelector('[data-custom="matcherEvidence"]').value.trim();
        if (!familyId || !matcherEvidence) return;
        updateDraft({
          useExternalConfiguration: true,
          customLicenses: [...model.draft.customLicenses, { familyId, familyName, matcherType: "text", matcherEvidence }],
          approvedFamilies: [...new Set([...model.draft.approvedFamilies, familyId])]
        });
        render();
      });
      bindHelp(); bindNavigation();
    }

    function reviewPage() {
      const validation = handlers.validate(model.draft);
      body.innerHTML = `
        <section class="rat-policy-page">
          <div class="rat-policy-page-title"><div><span>REVIEW BEFORE EDITING</span><h3>Confirm the policy decision</h3></div>${infoButton("offline", "offline references")}</div>
          <div class="rat-policy-review-grid">
            <article><strong>Project license</strong><span>${escapeHtml(model.draft.projectLicense || "Not selected")}</span></article>
            <article><strong>Execution</strong><span>${model.draft.bindToVerify ? "Bound to verify" : "Manual only"}</span></article>
            <article><strong>Scope</strong><span>${model.draft.includeSubprojects ? "Module and inherited children" : "Current module"}</span></article>
            <article><strong>Exceptions</strong><span>${model.draft.exclusions.length} exclusion(s), ${model.draft.approvedFamilies.length} approved family definition(s)</span></article>
          </div>
          ${validation.errors.map((error) => `<div class="rat-policy-callout error">${escapeHtml(error)}</div>`).join("")}
          ${validation.warnings.map((warning) => `<div class="rat-policy-callout warning">${escapeHtml(warning)}</div>`).join("")}
          ${model.inventory.configurationConfidence === "ambiguous" ? `<label class="rat-policy-check decision"><input type="checkbox" data-field="acknowledgeAmbiguousScope" ${model.draft.acknowledgeAmbiguousScope ? "checked" : ""}><span>I reviewed the profile/inheritance ambiguity and explicitly selected this governing POM.</span></label>` : ""}
          <label class="rat-policy-check decision"><input type="checkbox" data-field="acknowledgePolicyOwnership" ${model.draft.acknowledgePolicyOwnership ? "checked" : ""}><span>I confirm this is a reviewed project policy decision. MD-Editor is not making a legal determination.</span></label>
          ${footer({ nextLabel: "Build diff preview" })}
        </section>`;
      body.querySelector('[data-field="acknowledgePolicyOwnership"]').addEventListener("change", (event) => { updateDraft({ acknowledgePolicyOwnership: event.target.checked }); render(); });
      body.querySelector('[data-field="acknowledgeAmbiguousScope"]')?.addEventListener("change", (event) => { updateDraft({ acknowledgeAmbiguousScope: event.target.checked }); render(); });
      bindHelp();
      bindNavigation(async () => {
        const current = handlers.validate(model.draft);
        if (!current.valid) { render(); return false; }
        try {
          const plan = await handlers.preview(model.draft);
          renderPreview(plan);
        } catch (error) {
          showPageError(error);
        }
        return false;
      });
    }

    function showPageError(error) {
      const message = document.createElement("div");
      message.className = "rat-policy-callout error";
      message.textContent = error?.message || "The RAT policy operation failed.";
      body.prepend(message);
    }

    function renderPreview(plan) {
      renderSteps(); renderSummary();
      body.innerHTML = `
        <section class="rat-policy-page rat-policy-preview">
          <div class="rat-policy-page-title"><div><span>UNSAVED CHANGE SET</span><h3>Review every proposed file change</h3></div></div>
          <div class="rat-policy-callout"><strong>${escapeHtml(plan.title)}</strong>${escapeHtml(plan.summary.affectedModules)} · ${plan.changes.length} affected file(s)</div>
          ${plan.warnings.map((warning) => `<div class="rat-policy-callout warning">${escapeHtml(warning)}</div>`).join("")}
          <div class="rat-policy-diffs">${plan.changes.map((change) => `
            <details open><summary>${change.type === "create" ? "Create" : "Modify"} <code>${escapeHtml(change.path)}</code></summary>
              <div class="rat-policy-diff-columns"><section><h4>Before</h4><pre>${escapeHtml(change.beforeContent || "(new file)")}</pre></section><section><h4>After</h4><pre>${escapeHtml(change.afterContent)}</pre></section></div>
            </details>`).join("") || '<div class="rat-policy-callout warning">The selected settings already match the project; there are no changes to apply.</div>'}</div>
          <footer class="rat-policy-footer"><button type="button" data-edit>Back to review</button><span></span><button class="primary" type="button" data-apply ${plan.changes.length ? "" : "disabled"}>Apply as unsaved changes</button></footer>
        </section>`;
      body.querySelector("[data-edit]").addEventListener("click", render);
      body.querySelector("[data-apply]")?.addEventListener("click", async () => {
        try {
          const application = await handlers.apply(plan);
          renderResult(plan, application);
        } catch (error) {
          showPageError(error);
        }
      });
    }

    function renderResult(plan, application, verification) {
      body.innerHTML = `
        <section class="rat-policy-page rat-policy-result">
          <div class="rat-policy-page-title"><div><span>POLICY DRAFT APPLIED</span><h3>${escapeHtml(verification?.status || "Changes are open and unsaved")}</h3></div></div>
          <div class="rat-policy-callout"><strong>${plan.changes.length} file(s) changed in the editor</strong>No file was saved and no Maven command was run automatically.</div>
          ${verification ? `<div class="rat-policy-result-card"><strong>${escapeHtml(verification.status)}</strong><span>Exit code: ${escapeHtml(verification.exitCode ?? "unknown")}</span><span>Unapproved: ${escapeHtml(verification.unapprovedCount ?? "unknown")}</span></div>` : ""}
          <div class="rat-policy-callout warning">Verification requires saving the affected files. Saving is a separate explicit action.</div>
          <footer class="rat-policy-footer"><button type="button" data-undo>Undo RAT policy changes</button><span></span><button type="button" data-save-run>${verification ? "Save and run again" : "Save affected files and run RAT"}</button><button class="primary" type="button" data-close-result>Done</button></footer>
        </section>`;
      body.querySelector("[data-undo]").addEventListener("click", async () => {
        if (await application.undo()) { model.draft = { ...model.draft, dirty: false }; stepIndex = 4; render(); }
      });
      body.querySelector("[data-save-run]").addEventListener("click", async () => {
        if (!await confirmAction({
          title: "Save files and run Apache RAT?",
          message: "This saves every file in the reviewed RAT policy change set, then runs the detected Maven RAT check.",
          confirmLabel: "Save and run RAT",
          cancelLabel: "Not now"
        })) return;
        try {
          const result = await handlers.saveAndVerify(plan);
          renderResult(plan, application, result);
        } catch (error) {
          showPageError(error);
        }
      });
      body.querySelector("[data-close-result]").addEventListener("click", () => { model.draft = { ...model.draft, dirty: false }; close(); });
    }

    function render() {
      renderSteps(); renderSummary();
      [currentPolicyPage, licensePage, enforcementPage, coveragePage, reviewPage][stepIndex]();
    }

    /** Open a fresh wizard reconstructed from the current project state. */
    function open(nextModel, nextHandlers) {
      ensureDialog();
      model = nextModel;
      handlers = nextHandlers;
      stepIndex = Math.max(0, Math.min(STEPS.length - 1, Number(nextModel.stepIndex || 0)));
      overlay.style.display = "flex";
      document.body.classList.add("rat-policy-manager-open");
      render();
      overlay.querySelector(".rat-policy-close")?.focus();
    }

    const api = { close, open, renderPreview };
    app?.registerModule?.("ratPolicyDialog", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyDialog = registerMarkdownViewerRatPolicyDialog;
})(typeof window !== "undefined" ? window : globalThis);
