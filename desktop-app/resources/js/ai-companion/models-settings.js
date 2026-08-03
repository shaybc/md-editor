(function(window, document) {
  "use strict";

  /**
   * "Models" table in the AI Companion settings panel: a read-only model registry browser with
   * modal editing. "Edit json" opens the backing model-registry.json as a regular document tab
   * so power users can edit the raw file, and "Restore defaults" rewrites the registry from the
   * builtin list.
   */

  function registerMarkdownViewerAiCompanionModelsSettings(app, deps = {}) {
    const rowsContainer = document.getElementById("settings-ai-models-rows");
    const addButton = document.getElementById("settings-ai-models-add");
    const restoreButton = document.getElementById("settings-ai-models-restore");
    const editJsonButton = document.getElementById("settings-ai-models-edit-json");
    const statusElement = document.getElementById("settings-ai-models-status");
    const editorModal = document.getElementById("settings-ai-model-editor-modal");
    const editorTitle = document.getElementById("settings-ai-model-editor-title");
    const editorCloseButton = document.getElementById("settings-ai-model-editor-close");
    const editorCancelButton = document.getElementById("settings-ai-model-editor-cancel");
    const editorSaveButton = document.getElementById("settings-ai-model-editor-save");
    const editorStatus = document.getElementById("settings-ai-model-editor-status");
    const editorFields = {
      id: document.getElementById("settings-ai-model-editor-id"),
      label: document.getElementById("settings-ai-model-editor-label"),
      provider: document.getElementById("settings-ai-model-editor-provider"),
      match: document.getElementById("settings-ai-model-editor-match"),
      contextWindow: document.getElementById("settings-ai-model-editor-context-window"),
      maxOutputTokens: document.getElementById("settings-ai-model-editor-max-output"),
      isReasoning: document.getElementById("settings-ai-model-editor-reasoning")
    };
    const registry = deps.registry;
    if (!rowsContainer || !registry) return null;

    let models = [];
    let activeEditorModel = null;
    let activeEditorMode = "";

    function setStatus(message, isError = false) {
      if (!statusElement) return;
      statusElement.textContent = message || "";
      statusElement.classList.toggle("error", isError === true);
    }

    async function persist() {
      try {
        const saved = await registry.saveRegistry({ version: 1, models });
        models = saved.models.map((model) => ({ ...model }));
        setStatus("");
        deps.onRegistryChanged?.();
      } catch (error) {
        setStatus(`Could not save model registry: ${error?.message || String(error)}`, true);
      }
    }

    function formatTokenCount(value) {
      const number = Math.max(0, Math.floor(Number(value) || 0));
      if (!number) return "unknown";
      if (number >= 1000000) return `${Math.round(number / 1000000)}M`;
      if (number >= 1000) return `${Math.round(number / 1000)}K`;
      return number.toLocaleString();
    }

    function getModelDisplayName(model) {
      return String(model?.label || model?.id || "Untitled model").trim();
    }

    function createModelSummary(model) {
      const summary = document.createElement("span");
      summary.className = "settings-ai-models-summary";
      summary.setAttribute("role", "cell");

      const primary = document.createElement("span");
      primary.className = "settings-ai-models-summary-primary";
      primary.textContent = getModelDisplayName(model);

      const details = [
        model.id || "not set",
        model.provider || "not set",
        `match: ${model.match || "exact only"}`,
        `context: ${formatTokenCount(model.contextWindow)}`,
        `max output: ${formatTokenCount(model.maxOutputTokens)}`,
        model.isReasoning === true ? "reasoning" : "non-reasoning"
      ];

      const secondary = document.createElement("span");
      secondary.className = "settings-ai-models-summary-secondary";
      secondary.textContent = details.join(" | ");

      summary.append(primary, secondary);
      return summary;
    }

    function normalizeDraftModel() {
      return {
        id: String(editorFields.id?.value || "").trim(),
        provider: String(editorFields.provider?.value || "").trim(),
        label: String(editorFields.label?.value || "").trim(),
        match: String(editorFields.match?.value || "").trim(),
        contextWindow: Math.max(0, Math.floor(Number(editorFields.contextWindow?.value) || 0)),
        maxOutputTokens: Math.max(0, Math.floor(Number(editorFields.maxOutputTokens?.value) || 0)),
        isReasoning: editorFields.isReasoning?.checked === true,
        builtin: activeEditorModel?.builtin === true
      };
    }

    function setEditorStatus(message, isError = false) {
      if (!editorStatus) return;
      editorStatus.textContent = message || "";
      editorStatus.classList.toggle("error", isError === true);
    }

    function setEditorFieldValues(model) {
      if (editorFields.id) editorFields.id.value = String(model?.id || "");
      if (editorFields.label) editorFields.label.value = String(model?.label || "");
      if (editorFields.provider) editorFields.provider.value = String(model?.provider || "");
      if (editorFields.match) editorFields.match.value = String(model?.match || "");
      if (editorFields.contextWindow) editorFields.contextWindow.value = model?.contextWindow ? String(model.contextWindow) : "";
      if (editorFields.maxOutputTokens) editorFields.maxOutputTokens.value = model?.maxOutputTokens ? String(model.maxOutputTokens) : "";
      if (editorFields.isReasoning) editorFields.isReasoning.checked = model?.isReasoning === true;
    }

    function closeModelEditor() {
      if (!editorModal) return;
      editorModal.style.display = "none";
      editorModal.setAttribute("aria-hidden", "true");
      activeEditorModel = null;
      activeEditorMode = "";
      setEditorStatus("");
    }

    function openModelEditor(model = null, mode = "edit") {
      if (!editorModal) return;
      activeEditorModel = model;
      activeEditorMode = mode;
      if (editorTitle) editorTitle.textContent = mode === "add" ? "Add model" : "Edit model";
      setEditorFieldValues(model || { id: "", provider: "", label: "", match: "", contextWindow: 0, maxOutputTokens: 0, isReasoning: false, builtin: false });
      setEditorStatus("");
      editorModal.style.display = "flex";
      editorModal.setAttribute("aria-hidden", "false");
      window.setTimeout(() => editorFields.id?.focus?.(), 0);
    }

    async function saveModelEditor() {
      const draft = normalizeDraftModel();
      if (!draft.id) {
        setEditorStatus("Model id is required.", true);
        editorFields.id?.focus?.();
        return;
      }
      if (activeEditorMode === "add") {
        models.push(draft);
      } else if (activeEditorModel) {
        Object.assign(activeEditorModel, draft);
      }
      renderRows();
      closeModelEditor();
      await persist();
      renderRows();
    }

    function createModelRow(model) {
      const row = document.createElement("div");
      row.className = "settings-table-row settings-ai-models-row";
      row.setAttribute("role", "row");

      const actionsCell = document.createElement("span");
      actionsCell.className = "settings-table-actions";
      actionsCell.setAttribute("role", "cell");
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "settings-icon-action";
      removeButton.title = "Remove model";
      removeButton.setAttribute("aria-label", `Remove model ${model.id || ""}`);
      removeButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
      removeButton.addEventListener("click", async () => {
        models = models.filter((candidate) => candidate !== model);
        renderRows();
        await persist();
        renderRows();
      });

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "settings-icon-action";
      editButton.title = "Edit model";
      editButton.setAttribute("aria-label", `Edit model ${model.id || ""}`);
      editButton.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>';
      editButton.addEventListener("click", () => openModelEditor(model, "edit"));

      actionsCell.append(removeButton, editButton);
      row.append(createModelSummary(model), actionsCell);
      return row;
    }

    function renderRows() {
      if (typeof rowsContainer.replaceChildren === "function") rowsContainer.replaceChildren();
      else rowsContainer.innerHTML = "";
      models.forEach((model) => rowsContainer.appendChild(createModelRow(model)));
    }

    async function reload() {
      try {
        const loaded = await registry.loadRegistry();
        models = loaded.models.map((model) => ({ ...model }));
        renderRows();
        setStatus("");
      } catch (error) {
        setStatus(`Could not load model registry: ${error?.message || String(error)}`, true);
      }
    }

    addButton?.addEventListener("click", () => {
      openModelEditor(null, "add");
    });

    editorCloseButton?.addEventListener("click", closeModelEditor);
    editorCancelButton?.addEventListener("click", closeModelEditor);
    editorSaveButton?.addEventListener("click", () => {
      void saveModelEditor();
    });
    editorModal?.addEventListener("click", (event) => {
      if (event.target === editorModal) closeModelEditor();
    });
    editorModal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModelEditor();
    });

    restoreButton?.addEventListener("click", async () => {
      models = registry.createDefaultRegistry().models;
      renderRows();
      await persist();
      renderRows();
      setStatus("Restored builtin defaults.");
    });

    editJsonButton?.addEventListener("click", async () => {
      const filePath = await registry.getRegistryFilePath();
      if (!filePath || typeof deps.openDocumentSourceFile !== "function") {
        setStatus("Edit json needs the desktop app (the registry is stored in browser storage here).", true);
        return;
      }
      // Make sure the file exists with current content before opening it as a tab.
      await registry.saveRegistry({ version: 1, models });
      await deps.openDocumentSourceFile(
        { name: "model-registry.json", path: filePath },
        { temporary: false, title: "model-registry.json" }
      );
      deps.closeSettings?.();
      setStatus("Reload the settings screen after saving the file to see changes here.");
    });

    void reload();

    const api = { reload };
    app.registerModule("aiCompanionModelsSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionModelsSettings = registerMarkdownViewerAiCompanionModelsSettings;
})(window, document);
