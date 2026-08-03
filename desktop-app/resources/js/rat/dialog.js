(function(global) {
  "use strict";

  /** Render the focused Apache RAT Manager workflow. */
  function registerMarkdownViewerRatDialog(app, deps = {}) {
    let overlay = null;
    let body = null;
    let title = null;
    let currentModel = null;
    let currentHandlers = null;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function closeHelp() {
      document.querySelector(".rat-manager-help-overlay")?.remove();
    }

    function helpSection(label, value) {
      return value ? `<section><h4>${escapeHtml(label)}</h4><p>${escapeHtml(value)}</p></section>` : "";
    }

    function showHelp(topic) {
      if (!topic) return;
      closeHelp();
      const helpOverlay = document.createElement("div");
      helpOverlay.className = "rat-manager-help-overlay";
      helpOverlay.innerHTML = `
        <section class="rat-manager-help-dialog" role="dialog" aria-modal="true" aria-labelledby="rat-manager-help-title">
          <header>
            <div>
              <span class="rat-manager-kicker">Apache RAT help</span>
              <h3 id="rat-manager-help-title">${escapeHtml(topic.title)}</h3>
            </div>
            <button type="button" data-rat-help-close aria-label="Close help">&times;</button>
          </header>
          <div class="rat-manager-help-body">
            ${(topic.introduction || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
            ${helpSection("What was encountered", topic.issue)}
            ${helpSection("What this option does", topic.does)}
            ${helpSection("How it affects the build", topic.buildImpact)}
            ${helpSection("What the developer must decide", topic.developerImpact)}
            ${helpSection("Recommended approach", topic.guidance)}
            ${topic.links?.length ? `
              <section class="rat-manager-help-links">
                <h4>Official Apache RAT guidance</h4>
                ${topic.links.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`).join("")}
              </section>` : ""}
          </div>
          <footer><button type="button" data-rat-help-close>Close</button></footer>
        </section>`;
      helpOverlay.querySelectorAll("[data-rat-help-close]").forEach((button) => button.addEventListener("click", closeHelp));
      helpOverlay.addEventListener("click", (event) => { if (event.target === helpOverlay) closeHelp(); });
      document.body.appendChild(helpOverlay);
      helpOverlay.querySelector("[data-rat-help-close]")?.focus();
    }

    function ensureDialog() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "rat-manager-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = `
        <section class="rat-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="rat-manager-title">
          <header class="rat-manager-header">
            <div>
              <span class="rat-manager-kicker">Apache RAT</span>
              <h2 id="rat-manager-title">RAT Problems Resolver</h2>
            </div>
            <button class="rat-manager-close" type="button" aria-label="Close">&times;</button>
          </header>
          <nav class="rat-manager-stages" aria-label="RAT workflow">
            <span class="active">Finding</span><span>Investigation</span><span>Resolution</span><span>Scope</span><span>Preview</span><span>Result</span>
          </nav>
          <div class="rat-manager-body"></div>
        </section>`;
      document.body.appendChild(overlay);
      body = overlay.querySelector(".rat-manager-body");
      title = overlay.querySelector("#rat-manager-title");
      overlay.querySelector(".rat-manager-close").addEventListener("click", close);
      overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    }

    function setStage(name) {
      const stages = ["Finding", "Investigation", "Resolution", "Scope", "Preview", "Result"];
      overlay.querySelectorAll(".rat-manager-stages span").forEach((element, index) => {
        element.classList.toggle("active", stages[index] === name);
      });
    }

    function bindBack() {
      body.querySelector("[data-rat-back]")?.addEventListener("click", () => renderSummary(currentModel, currentHandlers));
    }

    function renderSummary(model, handlers) {
      currentModel = model;
      currentHandlers = handlers;
      setStage("Finding");
      title.textContent = "RAT Problems Resolver";
      const finding = model.context.finding || {};
      const inspection = model.context.inspection || {};
      body.innerHTML = `
        <section class="rat-manager-summary">
          <div class="rat-manager-problem">
            <div class="rat-manager-problem-heading">
              <h3>Unapproved license finding</h3>
              <button class="rat-manager-help-button" type="button" data-rat-help-general aria-label="Explain this Apache RAT finding" title="Explain this Apache RAT finding"><i class="bi bi-info-circle" aria-hidden="true"></i></button>
            </div>
            <code>${escapeHtml(finding.filePath || "Project-level RAT finding")}</code>
            <p>${escapeHtml(finding.originalMessage || "Apache RAT reported content without an approved license.")}</p>
          </div>
          <div class="rat-manager-facts">
            <span><strong>Module</strong>${escapeHtml(model.context.module?.projectRoot || "Unknown")}</span>
            <span><strong>File type</strong>${escapeHtml(inspection.classification || "Not inspected")}</span>
            <span><strong>Configuration</strong>${escapeHtml(model.context.configurationConfidence || "unknown")}</span>
            <span><strong>RAT report</strong>${escapeHtml(model.context.reportPath || "Not found")}</span>
          </div>
          <div class="rat-manager-notice"><strong>Important:</strong> RAT configuration records project policy. MD-Editor does not make legal ownership or license-compatibility decisions.</div>
          <div class="rat-manager-actions"></div>
        </section>`;
      body.querySelector("[data-rat-help-general]")?.addEventListener("click", () => {
        showHelp(deps.helpContent?.getGeneralHelp?.());
      });
      const container = body.querySelector(".rat-manager-actions");
      for (const action of model.actions) {
        const item = document.createElement("article");
        item.className = "rat-manager-action-item";
        const button = document.createElement("button");
        button.type = "button";
        button.className = `rat-manager-action rat-manager-action-${action.category}`;
        button.disabled = !action.enabled;
        button.innerHTML = `
          <span class="rat-manager-action-heading"><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.badge)}</small></span>
          <span>${escapeHtml(action.description)}</span>
          ${action.disabledReason ? `<em>${escapeHtml(action.disabledReason)}</em>` : ""}`;
        button.addEventListener("click", () => handlers.selectAction(action));
        const helpButton = document.createElement("button");
        helpButton.type = "button";
        helpButton.className = "rat-manager-help-button rat-manager-action-help";
        helpButton.setAttribute("aria-label", `Explain ${action.title}`);
        helpButton.title = `Explain ${action.title}`;
        helpButton.innerHTML = '<i class="bi bi-info-circle" aria-hidden="true"></i>';
        helpButton.addEventListener("click", () => showHelp(deps.helpContent?.getActionHelp?.(action.id)));
        item.append(button, helpButton);
        container.appendChild(item);
      }
    }

    function renderDetails(heading, content, options = {}) {
      setStage(options.stage || "Investigation");
      title.textContent = heading;
      body.innerHTML = `
        <section class="rat-manager-detail">
          <h3>${escapeHtml(heading)}</h3>
          ${content}
          <div class="rat-manager-footer">
            <button type="button" data-rat-back>Back to finding</button>
            ${options.primaryLabel ? `<button class="primary" type="button" data-rat-primary>${escapeHtml(options.primaryLabel)}</button>` : ""}
          </div>
        </section>`;
      bindBack();
      body.querySelector("[data-rat-primary]")?.addEventListener("click", () => options.onPrimary?.());
    }

    function formField(label, name, value = "", type = "text") {
      if (type === "checkbox") {
        return `<label class="rat-manager-check"><input name="${name}" type="checkbox"> <span>${escapeHtml(label)}</span></label>`;
      }
      if (type === "textarea") {
        return `<label><span>${escapeHtml(label)}</span><textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
      }
      return `<label><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}"></label>`;
    }

    function renderActionForm(action, context, submit) {
      setStage("Scope");
      title.textContent = action.title.replace(/…$/, "");
      const poms = context.pomChain || [];
      const pomOptions = poms.map((pom) => `<option value="${escapeHtml(pom.path)}">${escapeHtml(pom.path)}</option>`).join("");
      let fields = "";
      if (action.id === "resolution.add-header") {
        fields = formField("License header text", "headerText", "Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements.", "textarea")
          + formField("I confirm the project is authorized to apply this license", "authorized", "", "checkbox");
      } else if (action.id === "resolution.exclude-file") {
        fields = formField("Required exclusion rationale", "rationale", "", "textarea")
          + formField("Optional external exclusion file path", "exclusionFilePath", "");
      } else if (action.id === "resolution.exclude-pattern") {
        fields = formField("Reviewed exclusion pattern", "pattern", context.finding?.reportedPath || "")
          + formField("Required exclusion rationale", "rationale", "", "textarea")
          + formField("Optional external exclusion file path", "exclusionFilePath", "");
      } else if (action.id === "resolution.approve-license-family") {
        fields = formField("License family identifier", "familyId", context.finding?.detectedLicenseFamily || "")
          + formField("License family display name", "familyName", "")
          + formField("Matcher type: text, regex, or spdx", "matcherType", "text")
          + formField("Exact matcher evidence", "matcherEvidence", "", "textarea");
      } else if (action.id === "documentation.third-party") {
        fields = formField("Existing documentation path", "documentationPath", "")
          + formField("Component or source", "component", "")
          + formField("Upstream URL", "upstreamUrl", "")
          + formField("Version", "version", "")
          + formField("Copyright holder", "copyrightHolder", "")
          + formField("License", "license", "")
          + formField("Local paths", "localPaths", context.finding?.filePath || "");
      } else if (action.id === "advanced.disable-execution") {
        fields = formField("I understand this bypasses license verification for the selected scope", "acknowledged", "", "checkbox");
      }
      const needsPom = action.requiresConfiguration;
      body.innerHTML = `
        <form class="rat-manager-form">
          <p>${escapeHtml(action.description)}</p>
          ${needsPom ? `<label><span>Configuration target</span><select name="pomPath">${pomOptions}</select></label>` : ""}
          ${fields}
          <div class="rat-manager-notice">${action.category === "advanced" ? "This is an audit bypass, not a license fix." : "Every proposed file change will be shown before it is applied."}</div>
          <div class="rat-manager-error" hidden></div>
          <div class="rat-manager-footer">
            <button type="button" data-rat-back>Cancel</button>
            <button class="primary" type="submit">Build preview</button>
          </div>
        </form>`;
      bindBack();
      const form = body.querySelector("form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type="checkbox"]').forEach((input) => { values[input.name] = input.checked; });
        const error = body.querySelector(".rat-manager-error");
        try {
          error.hidden = true;
          await submit(values);
        } catch (caught) {
          error.textContent = caught?.message || String(caught);
          error.hidden = false;
        }
      });
    }

    function renderPreview(plan, apply) {
      setStage("Preview");
      title.textContent = "Review RAT changes";
      const changes = plan.changes.map((change) => `
        <article class="rat-manager-diff">
          <h4>${escapeHtml(change.path)}</h4>
          <div><section><strong>Before</strong><pre>${escapeHtml(change.beforeContent)}</pre></section><section><strong>After</strong><pre>${escapeHtml(change.afterContent)}</pre></section></div>
        </article>`).join("");
      body.innerHTML = `
        <section>
          <h3>${escapeHtml(plan.title)}</h3>
          ${plan.warnings.map((warning) => `<div class="rat-manager-warning">${escapeHtml(warning)}</div>`).join("")}
          ${plan.patternMatches?.length ? `<details><summary>Current matching files (${plan.patternMatches.length})</summary><pre>${escapeHtml(plan.patternMatches.join("\n"))}</pre></details>` : ""}
          ${changes}
          <div class="rat-manager-error" hidden></div>
          <div class="rat-manager-footer"><button type="button" data-rat-back>Cancel</button><button class="primary" type="button" data-rat-apply>Apply as unsaved changes</button></div>
        </section>`;
      bindBack();
      body.querySelector("[data-rat-apply]").addEventListener("click", async () => {
        try {
          await apply();
        } catch (caught) {
          const error = body.querySelector(".rat-manager-error");
          error.textContent = caught?.message || String(caught);
          error.hidden = false;
        }
      });
    }

    function renderApplied(result, handlers) {
      renderDetails("RAT changes applied", `
        <p>The approved changes are open as unsaved editor buffers. Review and save them before running RAT.</p>
        <div class="rat-manager-notice">Verification is intentionally not automatic and remains blocked until the affected files are saved.</div>
        <div class="rat-manager-inline-actions">
          <button type="button" data-rat-undo>Undo RAT changes</button>
          <button type="button" data-rat-run>Save affected files and run RAT</button>
        </div>
        <div class="rat-manager-error" hidden></div>`, { stage: "Result" });
      body.querySelector("[data-rat-undo]").addEventListener("click", handlers.undo);
      body.querySelector("[data-rat-run]").addEventListener("click", async () => {
        const error = body.querySelector(".rat-manager-error");
        try {
          error.hidden = true;
          await handlers.run();
        } catch (caught) {
          error.textContent = caught?.message || String(caught);
          error.hidden = false;
        }
      });
    }

    function open(model, handlers) {
      ensureDialog();
      overlay.style.display = "flex";
      renderSummary(model, handlers);
    }

    function close() {
      closeHelp();
      if (overlay) overlay.style.display = "none";
    }

    const api = { close, open, renderActionForm, renderApplied, renderDetails, renderPreview };
    app?.registerModule?.("ratDialog", api);
    return api;
  }

  global.registerMarkdownViewerRatDialog = registerMarkdownViewerRatDialog;
})(typeof window !== "undefined" ? window : globalThis);
