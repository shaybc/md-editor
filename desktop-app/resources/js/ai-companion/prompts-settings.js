(function(window, document) {
  "use strict";

  /**
   * Prompt settings table for profile-backed AI Companion prompt strings.
   */

  function registerMarkdownViewerAiCompanionPromptsSettings(app, deps = {}) {
    const rowsContainer = document.getElementById("settings-ai-prompts-rows");
    const statusElement = document.getElementById("settings-ai-prompts-status");
    const editorModal = document.getElementById("settings-ai-prompt-editor-modal");
    const editorTitle = document.getElementById("settings-ai-prompt-editor-title");
    const editorDescription = document.getElementById("settings-ai-prompt-editor-description");
    const editorTextarea = document.getElementById("settings-ai-prompt-editor-text");
    const editorCloseButton = document.getElementById("settings-ai-prompt-editor-close");
    const editorCancelButton = document.getElementById("settings-ai-prompt-editor-cancel");
    const editorSaveButton = document.getElementById("settings-ai-prompt-editor-save");
    const editorStatus = document.getElementById("settings-ai-prompt-editor-status");
    const bridge = deps.bridge;
    if (!rowsContainer || !bridge) return null;

    let entries = [];
    let activeEntry = null;

    function setStatus(message, isError = false) {
      if (!statusElement) return;
      statusElement.textContent = message || "";
      statusElement.classList.toggle("error", isError === true);
    }

    function setEditorStatus(message, isError = false) {
      if (!editorStatus) return;
      editorStatus.textContent = message || "";
      editorStatus.classList.toggle("error", isError === true);
    }

    function closePromptEditor() {
      if (!editorModal) return;
      editorModal.style.display = "none";
      editorModal.setAttribute("aria-hidden", "true");
      activeEntry = null;
      setEditorStatus("");
    }

    function openPromptEditor(entry) {
      if (!editorModal || !entry) return;
      activeEntry = entry;
      if (editorTitle) editorTitle.textContent = entry.name || entry.keyPath || "Edit prompt";
      if (editorDescription) editorDescription.textContent = entry.description || entry.keyPath || "";
      if (editorTextarea) editorTextarea.value = String(entry.value || "");
      setEditorStatus("");
      editorModal.style.display = "flex";
      editorModal.setAttribute("aria-hidden", "false");
      window.setTimeout(() => editorTextarea?.focus?.(), 0);
    }

    function createPromptSummary(entry) {
      const summary = document.createElement("span");
      summary.className = "settings-ai-prompts-summary";
      summary.setAttribute("role", "cell");

      const primary = document.createElement("span");
      primary.className = "settings-ai-prompts-summary-primary";
      primary.textContent = entry.name || entry.keyPath || "Prompt";

      const secondary = document.createElement("span");
      secondary.className = "settings-ai-prompts-summary-secondary";
      secondary.textContent = entry.description || "";

      const key = document.createElement("span");
      key.className = "settings-ai-prompts-summary-key";
      key.textContent = entry.keyPath || "";

      summary.append(primary, secondary, key);
      return summary;
    }

    function createPromptRow(entry) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "settings-table-row settings-ai-prompts-row";
      row.setAttribute("role", "row");
      row.setAttribute("aria-label", `Edit prompt ${entry.name || entry.keyPath || ""}`);
      row.addEventListener("click", () => openPromptEditor(entry));

      const actionsCell = document.createElement("span");
      actionsCell.className = "settings-table-actions";
      actionsCell.setAttribute("role", "cell");
      const editIcon = document.createElement("span");
      editIcon.className = "settings-icon-action settings-ai-prompts-edit-indicator";
      editIcon.title = "Edit prompt";
      editIcon.setAttribute("aria-hidden", "true");
      editIcon.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>';
      actionsCell.append(editIcon);

      row.append(createPromptSummary(entry), actionsCell);
      return row;
    }

    function renderRows() {
      if (typeof rowsContainer.replaceChildren === "function") rowsContainer.replaceChildren();
      else rowsContainer.innerHTML = "";
      entries.forEach((entry) => rowsContainer.appendChild(createPromptRow(entry)));
    }

    async function reload() {
      try {
        const result = await bridge.promptsGet({});
        entries = Array.isArray(result?.entries) ? result.entries : [];
        renderRows();
        setStatus(entries.length ? "" : "No prompt entries are available.");
      } catch (error) {
        setStatus(`Could not load prompts: ${error?.message || String(error)}`, true);
      }
    }

    async function savePromptEditor() {
      if (!activeEntry) return;
      try {
        const result = await bridge.promptUpdate({
          keyPath: activeEntry.keyPath,
          value: editorTextarea?.value || ""
        });
        entries = Array.isArray(result?.entries) ? result.entries : entries;
        renderRows();
        closePromptEditor();
        setStatus("Prompt saved.");
        deps.onPromptsChanged?.();
      } catch (error) {
        setEditorStatus(`Could not save prompt: ${error?.message || String(error)}`, true);
      }
    }

    async function finishUpgrade(result) {
      if (result?.status !== "resolved") return;
      await reload();
      deps.onPromptsChanged?.();
      setStatus("Prompt profile upgraded.");
    }

    async function resolveUpgrade(upgradeToken, strategy, resolutions) {
      try {
        await finishUpgrade(await bridge.promptsUpgradeResolve({ upgradeToken, strategy, resolutions }));
      } catch (error) {
        setStatus(`Could not upgrade prompts: ${error?.message || String(error)}`, true);
        throw error;
      }
    }

    function openUpgradeMergeDialog(payload) {
      document.querySelector(".settings-ai-prompt-upgrade-modal")?.remove();
      const conflicts = Array.isArray(payload?.conflicts) ? payload.conflicts : [];
      const resolutions = new Map();
      let selectedIndex = 0;
      const modal = document.createElement("div");
      modal.className = "reset-modal-overlay settings-ai-prompt-upgrade-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `<div class="reset-modal-box settings-ai-prompt-upgrade-box">
        <h2>Review prompt updates</h2>
        <div class="settings-ai-prompt-upgrade-layout">
          <div class="settings-ai-prompt-upgrade-list"></div>
          <div class="settings-ai-prompt-upgrade-editor">
            <p class="settings-ai-prompt-upgrade-key"></p>
            <div class="settings-ai-prompt-upgrade-columns">
              <label>Previous default<textarea readonly data-upgrade-base></textarea></label>
              <label>My prompt<textarea readonly data-upgrade-mine></textarea></label>
              <label>New default<textarea readonly data-upgrade-theirs></textarea></label>
            </div>
            <label>Merged result<textarea data-upgrade-merged></textarea></label>
            <div class="settings-ai-prompt-upgrade-choices">
              <button type="button" class="reset-modal-btn" data-upgrade-choice="mine">Use mine</button>
              <button type="button" class="reset-modal-btn" data-upgrade-choice="theirs">Use new default</button>
              <button type="button" class="reset-modal-btn" data-upgrade-choice="merged">Use merged text</button>
            </div>
          </div>
        </div>
        <p data-upgrade-status aria-live="polite"></p>
        <div class="reset-modal-actions">
          <button type="button" class="reset-modal-btn reset-modal-cancel" data-upgrade-cancel>Cancel</button>
          <button type="button" class="reset-modal-btn" data-upgrade-all-mine>Use all mine</button>
          <button type="button" class="reset-modal-btn" data-upgrade-all-theirs>Use all new defaults</button>
          <button type="button" class="reset-modal-btn settings-primary-action" data-upgrade-save disabled>Save all resolutions</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      const list = modal.querySelector(".settings-ai-prompt-upgrade-list");
      const save = modal.querySelector("[data-upgrade-save]");
      const merged = modal.querySelector("[data-upgrade-merged]");

      function render() {
        list.replaceChildren();
        conflicts.forEach((conflict, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = index === selectedIndex ? "is-active" : "";
          button.textContent = `${resolutions.has(conflict.keyPath) ? "? " : ""}${conflict.name || conflict.keyPath}`;
          button.addEventListener("click", () => { selectedIndex = index; render(); });
          list.appendChild(button);
        });
        const conflict = conflicts[selectedIndex];
        if (!conflict) return;
        modal.querySelector(".settings-ai-prompt-upgrade-key").textContent = `${conflict.keyPath} ? ${conflict.kind}`;
        modal.querySelector("[data-upgrade-base]").value = conflict.previousDefault ?? "(No known previous default)";
        modal.querySelector("[data-upgrade-mine]").value = conflict.userValue ?? "";
        modal.querySelector("[data-upgrade-theirs]").value = conflict.removed ? "(Removed in new version)" : (conflict.newDefault ?? "");
        merged.value = resolutions.get(conflict.keyPath)?.value ?? conflict.userValue ?? "";
        save.disabled = resolutions.size !== conflicts.length;
      }

      modal.querySelectorAll("[data-upgrade-choice]").forEach((button) => button.addEventListener("click", () => {
        const conflict = conflicts[selectedIndex];
        const choice = button.dataset.upgradeChoice;
        resolutions.set(conflict.keyPath, { keyPath: conflict.keyPath, choice, ...(choice === "merged" ? { value: merged.value } : {}) });
        render();
      }));
      modal.querySelector("[data-upgrade-all-mine]").addEventListener("click", () => {
        conflicts.forEach((conflict) => resolutions.set(conflict.keyPath, { keyPath: conflict.keyPath, choice: "mine" })); render();
      });
      modal.querySelector("[data-upgrade-all-theirs]").addEventListener("click", () => {
        conflicts.forEach((conflict) => resolutions.set(conflict.keyPath, { keyPath: conflict.keyPath, choice: "theirs" })); render();
      });
      modal.querySelector("[data-upgrade-cancel]").addEventListener("click", () => modal.remove());
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          await resolveUpgrade(payload.upgradeToken, "manual", [...resolutions.values()]);
          modal.remove();
        } catch (_) { save.disabled = false; }
      });
      render();
    }

    async function reviewUpgrade(upgradeToken) {
      const payload = await bridge.promptsUpgradeConflicts({ upgradeToken });
      openUpgradeMergeDialog(payload);
    }

    async function checkForUpgrade() {
      try {
        const result = await bridge.promptsUpgradeCheck({});
        if (result?.status !== "conflicts" || !result.conflictCount) return result;
        const choice = await deps.notify?.show?.({
          title: "AI Companion prompts updated",
          message: `${result.conflictCount} customized prompt${result.conflictCount === 1 ? " conflicts" : "s conflict"} with new defaults.`,
          dedupeKey: `ai-prompt-upgrade-${result.toRevision}`,
          dismissValue: "later",
          buttons: [
            { id: "later", label: "Later", value: "later", variant: "cancel" },
            { id: "mine", label: "Use my prompts", value: "mine" },
            { id: "defaults", label: "Use new defaults", value: "defaults" },
            { id: "review", label: "Review and merge", value: "review", variant: "primary", autoFocus: true }
          ]
        });
        if (choice === "mine") await resolveUpgrade(result.upgradeToken, "keep-user");
        else if (choice === "defaults") await resolveUpgrade(result.upgradeToken, "use-defaults");
        else if (choice === "review") await reviewUpgrade(result.upgradeToken);
        return result;
      } catch (error) {
        setStatus(`Could not check prompt updates: ${error?.message || String(error)}`, true);
        return { status: "failed" };
      }
    }

    editorCloseButton?.addEventListener("click", closePromptEditor);
    editorCancelButton?.addEventListener("click", closePromptEditor);
    editorSaveButton?.addEventListener("click", () => {
      void savePromptEditor();
    });
    editorModal?.addEventListener("click", (event) => {
      if (event.target === editorModal) closePromptEditor();
    });
    editorModal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePromptEditor();
    });

    window.setTimeout(() => { void reload().then(checkForUpgrade); }, 0);

    const api = { reload, checkForUpgrade, reviewUpgrade };
    app.registerModule("aiCompanionPromptsSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionPromptsSettings = registerMarkdownViewerAiCompanionPromptsSettings;
})(window, document);
