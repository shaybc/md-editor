(function(global) {
  "use strict";

  /** Render the Quick Fix selection, preview, application, and verification workflow. */
  function registerMarkdownViewerQuickFixDialog(app) {
    function formatLocation(diagnostic) {
      return diagnostic?.filePath
        ? `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}`
        : "Project";
    }

    function createSummaryRow(item) {
      const row = document.createElement("details");
      row.className = "quick-fix-preview-file";
      const destination = item.destination ? ` → ${item.destination}` : "";
      row.innerHTML = `<summary><strong>${item.type}</strong> <span></span></summary>`;
      row.querySelector("span").textContent = `${item.path}${destination}`;
      if (item.type === "modify") {
        const columns = document.createElement("div");
        columns.className = "quick-fix-diff";
        const before = document.createElement("pre");
        const after = document.createElement("pre");
        before.dataset.label = "Before";
        after.dataset.label = "After";
        before.textContent = item.before;
        after.textContent = item.after;
        columns.append(before, after);
        row.appendChild(columns);
      }
      return row;
    }

    /**
     * Open a Quick Fix dialog.
     * @param {object} options Diagnostic, actions, and workflow callbacks.
     * @returns {Promise<void>} Resolves when the dialog closes.
     */
    function open(options) {
      document.querySelector(".quick-fix-modal")?.remove();
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "reset-modal-overlay quick-fix-modal";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML = `
          <div class="reset-modal-box quick-fix-modal-box">
            <header class="quick-fix-header">
              <div><h2>Quick Fix</h2><p class="quick-fix-problem"></p><small class="quick-fix-location"></small></div>
              <i class="bi bi-lightbulb-fill" aria-hidden="true"></i>
            </header>
            <section class="quick-fix-actions" aria-label="Available fixes"></section>
            <p class="quick-fix-state" aria-live="polite"></p>
            <section class="quick-fix-preview" hidden>
              <h3>Preview</h3>
              <p class="quick-fix-impact"></p>
              <div class="quick-fix-preview-files"></div>
            </section>
            <footer class="reset-modal-actions quick-fix-footer">
              <button class="reset-modal-btn quick-fix-undo" type="button" hidden>Undo Quick Fix</button>
              <button class="reset-modal-btn quick-fix-rebuild" type="button" hidden>Rebuild project</button>
              <button class="reset-modal-btn quick-fix-apply" type="button" disabled>Apply</button>
              <button class="reset-modal-btn quick-fix-cancel" type="button">Cancel</button>
            </footer>
          </div>`;
        overlay.querySelector(".quick-fix-problem").textContent = options.diagnostic.message;
        overlay.querySelector(".quick-fix-location").textContent = formatLocation(options.diagnostic);
        const actionsElement = overlay.querySelector(".quick-fix-actions");
        const stateElement = overlay.querySelector(".quick-fix-state");
        const previewElement = overlay.querySelector(".quick-fix-preview");
        const previewFiles = overlay.querySelector(".quick-fix-preview-files");
        const impact = overlay.querySelector(".quick-fix-impact");
        const applyButton = overlay.querySelector(".quick-fix-apply");
        const undoButton = overlay.querySelector(".quick-fix-undo");
        const rebuildButton = overlay.querySelector(".quick-fix-rebuild");
        const cancelButton = overlay.querySelector(".quick-fix-cancel");
        let selectedAction = null;
        let selectedPreview = null;
        let applyResult = null;

        function close() {
          overlay.remove();
          resolve();
        }

        async function selectAction(action, button) {
          selectedAction = action;
          selectedPreview = null;
          applyButton.disabled = true;
          actionsElement.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("selected", candidate === button));
          previewElement.hidden = true;
          stateElement.textContent = "Preparing change preview…";
          try {
            selectedPreview = await options.resolvePreview(action);
            impact.textContent = `${selectedPreview.affectedPaths.length} affected file${selectedPreview.affectedPaths.length === 1 ? "" : "s"}. Review every change before applying.`;
            previewFiles.textContent = "";
            selectedPreview.summary.forEach((item) => previewFiles.appendChild(createSummaryRow(item)));
            previewElement.hidden = false;
            stateElement.textContent = `${action.provenance}: ${action.title}`;
            applyButton.disabled = false;
          } catch (error) {
            stateElement.textContent = error?.message || "This fix could not be previewed.";
          }
        }

        options.actions.forEach((action) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "quick-fix-action";
          button.disabled = action.disabled;
          button.dataset.actionId = String(action.id || "");
          button.innerHTML = `<i class="bi ${action.isPreferred ? "bi-star-fill" : "bi-lightbulb"}" aria-hidden="true"></i><span class="quick-fix-action-copy"><strong></strong><small></small></span><i class="bi bi-chevron-right quick-fix-action-chevron" aria-hidden="true"></i>`;
          button.querySelector("strong").textContent = action.title;
          button.querySelector("small").textContent = action.disabledReason
            ? `${action.provenance} - ${action.disabledReason}`
            : action.description || action.provenance;
          button.title = action.disabledReason || action.description || action.title;
          button.addEventListener("click", () => {
            if (action.execute) {
              close();
              void options.executeAction?.(action);
              return;
            }
            void selectAction(action, button);
          });
          actionsElement.appendChild(button);
        });
        if (options.aiAvailable) {
          const aiButton = document.createElement("button");
          aiButton.type = "button";
          aiButton.className = "quick-fix-action quick-fix-ai-action";
          aiButton.innerHTML = `<i class="bi bi-stars" aria-hidden="true"></i><span class="quick-fix-action-copy"><strong>AI: investigate and propose a fix…</strong><small>Ask the AI companion for a broader contextual solution.</small></span><i class="bi bi-chevron-right quick-fix-action-chevron" aria-hidden="true"></i>`;
          aiButton.addEventListener("click", () => {
            close();
            void options.runAi?.();
          });
          actionsElement.appendChild(aiButton);
        }
        if (!options.actions.length) stateElement.textContent = options.reason || "No JDT fixes are available for this problem.";
        else if (options.actions.every((action) => action.disabled)) stateElement.textContent = "JDT returned fixes, but none can be previewed safely.";
        else stateElement.textContent = "Select a fix to inspect its exact workspace changes.";

        applyButton.addEventListener("click", async () => {
          if (!selectedAction || !selectedPreview) return;
          applyButton.disabled = true;
          cancelButton.disabled = true;
          stateElement.textContent = "Applying Quick Fix…";
          try {
            applyResult = await options.applyPreview(selectedPreview);
            stateElement.textContent = await options.verify?.() || "Quick Fix applied.";
            undoButton.hidden = typeof applyResult?.undo !== "function";
            rebuildButton.hidden = false;
            applyButton.hidden = true;
            cancelButton.disabled = false;
            cancelButton.textContent = "Close";
          } catch (error) {
            stateElement.textContent = error?.message || "Quick Fix failed and was rolled back.";
            applyButton.disabled = false;
            cancelButton.disabled = false;
          }
        });
        undoButton.addEventListener("click", async () => {
          undoButton.disabled = true;
          await applyResult?.undo?.();
          close();
        });
        rebuildButton.addEventListener("click", () => {
          close();
          void options.rebuild?.();
        });
        cancelButton.addEventListener("click", close);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) close();
        });
        overlay.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !cancelButton.disabled) close();
        });
        document.body.appendChild(overlay);
        const initialAction = Array.from(actionsElement.querySelectorAll(".quick-fix-action:not(:disabled)"))
          .find((button) => button.dataset.actionId === String(options.initialActionId || ""));
        const firstAction = initialAction || actionsElement.querySelector("button:not(:disabled)");
        if (firstAction) firstAction.focus();
        else cancelButton.focus();
        if (initialAction) initialAction.click();
      });
    }

    const api = { open };
    app.registerModule?.("quickFixDialog", api);
    return api;
  }

  global.registerMarkdownViewerQuickFixDialog = registerMarkdownViewerQuickFixDialog;
})(typeof window !== "undefined" ? window : globalThis);
