/** Structured lifecycle automation settings with bounded JSON escape hatch. */
(function(window, document) {
  "use strict";

  const EVENTS = [
    "run-start", "run-restored", "user-prompt", "before-model", "after-model", "before-tool", "after-tool",
    "tool-failure", "tool-denied", "permission-request", "permission-resolved", "permission-denied",
    "user-input-request", "user-input-resolved", "user-input-declined", "before-compaction", "after-compaction",
    "work-created", "work-updated", "work-completing", "work-completed", "worker-queued", "worker-started",
    "worker-workspace-changed", "worker-completed", "worker-failed", "worker-stopped", "schedule-fired",
    "schedule-completed", "schedule-failed", "instructions-loaded", "configuration-changed", "file-changed",
    "workspace-changed", "before-final", "run-finish", "run-cancelled", "run-failed"
  ];
  const ACTION_TYPES = ["context", "notify-user", "command", "model-check", "delegated-run", "web-request", "application-callback"];
  const ACTIONS = new Set([...ACTION_TYPES, "prompt", "agent", "http", "callback"]);
  const EVENT_HELP = {
    "before-tool": "Match tool names with tool, modes with mode, paths with path, or bounded payload values with fields.",
    "after-tool": "The payload includes tool, input, and result. Use fields for bounded result matching.",
    "tool-failure": "Match tool or error. Error supports safe * wildcards, not executable regular expressions.",
    "file-changed": "Match workspace-relative paths with path and the add/change/delete category with fields.change.",
    "workspace-changed": "Match the change source with fields.reason.",
    "permission-request": "Match the requested tool and bounded permission payload fields.",
    "before-final": "Match bounded final-response payload fields. Use a context action with retry to request another decision."
  };
  const ACTION_DEFAULTS = {
    context: { content: "" },
    "notify-user": { level: "info", message: "" },
    command: { command: "" },
    "model-check": { prompt: "", maxTokens: 800 },
    "delegated-run": { agentId: "", prompt: "" },
    "web-request": { url: "", method: "POST", body: {} },
    "application-callback": { callbackId: "" }
  };

  function registerMarkdownViewerAiLifecycleSettings(app, deps = {}) {
    const elements = {
      input: document.getElementById("settings-ai-lifecycle-hooks"),
      rows: document.getElementById("settings-ai-lifecycle-rows"),
      empty: document.getElementById("settings-ai-lifecycle-empty"),
      status: document.getElementById("settings-ai-lifecycle-status"),
      refresh: document.getElementById("settings-ai-lifecycle-refresh"),
      add: document.getElementById("settings-ai-lifecycle-add"),
      json: document.getElementById("settings-ai-lifecycle-json"),
      modal: document.getElementById("settings-ai-lifecycle-modal"),
      title: document.getElementById("settings-ai-lifecycle-title"),
      id: document.getElementById("settings-ai-lifecycle-id"),
      event: document.getElementById("settings-ai-lifecycle-event"),
      enabled: document.getElementById("settings-ai-lifecycle-enabled"),
      onError: document.getElementById("settings-ai-lifecycle-on-error"),
      matcher: document.getElementById("settings-ai-lifecycle-matcher"),
      matcherHelp: document.getElementById("settings-ai-lifecycle-matcher-help"),
      previewPayload: document.getElementById("settings-ai-lifecycle-preview-payload"),
      previewMatch: document.getElementById("settings-ai-lifecycle-preview-match"),
      previewResult: document.getElementById("settings-ai-lifecycle-preview-result"),
      actionRows: document.getElementById("settings-ai-lifecycle-action-rows"),
      actionType: document.getElementById("settings-ai-lifecycle-action-type"),
      actionProperties: document.getElementById("settings-ai-lifecycle-action-properties"),
      actionAdd: document.getElementById("settings-ai-lifecycle-action-add"),
      actions: document.getElementById("settings-ai-lifecycle-actions"),
      actionsLoad: document.getElementById("settings-ai-lifecycle-actions-load"),
      timeout: document.getElementById("settings-ai-lifecycle-timeout"),
      cooldown: document.getElementById("settings-ai-lifecycle-cooldown"),
      dedup: document.getElementById("settings-ai-lifecycle-dedup"),
      background: document.getElementById("settings-ai-lifecycle-background"),
      editorStatus: document.getElementById("settings-ai-lifecycle-editor-status"),
      close: document.getElementById("settings-ai-lifecycle-close"),
      cancel: document.getElementById("settings-ai-lifecycle-cancel"),
      save: document.getElementById("settings-ai-lifecycle-save"),
      jsonModal: document.getElementById("settings-ai-lifecycle-json-modal"),
      jsonText: document.getElementById("settings-ai-lifecycle-json-text"),
      jsonStatus: document.getElementById("settings-ai-lifecycle-json-status"),
      jsonClose: document.getElementById("settings-ai-lifecycle-json-close"),
      jsonCancel: document.getElementById("settings-ai-lifecycle-json-cancel"),
      jsonSave: document.getElementById("settings-ai-lifecycle-json-save")
    };
    if (!elements.input || !elements.rows || !elements.modal) return null;
    let definitions = [];
    let discoveredDefinitions = [];
    let editingIndex = -1;
    let editingActionIndex = -1;
    let editorActions = [];
    let editorReadOnly = false;
    const fieldHelp = window.MarkdownViewerAiLifecycleSettingsHelp?.attach(elements.modal) || { hide() {} };

    for (const event of EVENTS) {
      const option = document.createElement("option");
      option.value = event;
      option.textContent = event;
      elements.event.append(option);
    }

    function setStatus(target, message, error = false) {
      if (!target) return;
      target.textContent = message || "";
      target.classList.toggle("is-error", error);
    }

    function parseDefinitions(value) {
      const parsed = JSON.parse(value || "[]");
      if (!Array.isArray(parsed)) throw new Error("Lifecycle automation must be a JSON array.");
      parsed.forEach(validateDefinition);
      return parsed;
    }

    function validateDefinition(value, index = 0) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Automation ${index + 1} must be an object.`);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(String(value.id || ""))) throw new Error(`Automation ${index + 1} requires a valid ID.`);
      if (!EVENTS.includes(String(value.event || ""))) throw new Error(`Automation '${value.id}' has an unsupported event.`);
      const actions = Array.isArray(value.actions) ? value.actions : [value.action].filter(Boolean);
      if (!actions.length) throw new Error(`Automation '${value.id}' requires at least one action.`);
      for (const action of actions) if (!ACTIONS.has(String(action?.type || ""))) throw new Error(`Automation '${value.id}' has an unsupported action type.`);
    }

    function sync() { elements.input.value = JSON.stringify(definitions, null, 2); }

    function iconButton(icon, label, handler) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-icon-action";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
      button.addEventListener("click", handler);
      return button;
    }

    function definitionStatus(definition) {
      try { validateDefinition(definition); return { label: "Valid", valid: true }; }
      catch (error) { return { label: "Invalid", valid: false, error: error?.message || String(error) }; }
    }

    function render() {
      elements.rows.replaceChildren();
      const rows = [
        ...definitions.map((definition, index) => ({ definition, index, readOnly: false })),
        ...discoveredDefinitions.map((definition) => ({ definition, index: -1, readOnly: true }))
      ];
      for (const { definition, index, readOnly } of rows) {
        const row = document.createElement("div");
        row.className = "settings-table-row";
        row.setAttribute("role", "row");
        const id = document.createElement("span");
        id.textContent = `${definition.enabled === false ? "Off" : "On"} · ${definition.id}`;
        const event = document.createElement("span");
        event.textContent = definition.event;
        const source = document.createElement("span");
        source.textContent = readOnly ? String(definition.source?.scope || "extension") : "profile settings";
        const count = document.createElement("span");
        count.textContent = String((Array.isArray(definition.actions) ? definition.actions : [definition.action].filter(Boolean)).length);
        const validation = definitionStatus(definition);
        const status = document.createElement("span");
        status.textContent = validation.label;
        status.title = validation.error || "Definition passed structural validation.";
        const actions = document.createElement("span");
        actions.className = "settings-table-actions";
        actions.append(iconButton(readOnly ? "bi-eye" : "bi-pencil-square", readOnly ? `View ${definition.id}` : `View or edit ${definition.id}`, () => openEditor(index, readOnly ? definition : null)));
        if (!readOnly) {
          actions.append(iconButton(definition.enabled === false ? "bi-toggle-off" : "bi-toggle-on", definition.enabled === false ? `Enable ${definition.id}` : `Disable ${definition.id}`, () => {
            definitions[index] = { ...definition, enabled: definition.enabled === false };
            sync();
            render();
          }));
          actions.append(iconButton("bi-trash", `Delete ${definition.id}`, () => {
            definitions.splice(index, 1);
            sync();
            render();
          }));
        }
        row.append(id, source, event, count, status, actions);
        elements.rows.append(row);
      }
      if (elements.empty) elements.empty.hidden = rows.length > 0;
      setStatus(elements.status, `${definitions.length} editable and ${discoveredDefinitions.length} discovered lifecycle automation definition(s).`);
    }

    function summarizeAction(action) {
      return String(action?.message || action?.content || action?.command || action?.prompt || action?.url || action?.callback || action?.agent || "").slice(0, 100);
    }

    function syncEditorActions() {
      elements.actions.value = JSON.stringify(editorActions, null, 2);
    }

    function renderEditorActions() {
      elements.actionRows.replaceChildren();
      editorActions.forEach((action, index) => {
        const row = document.createElement("div");
        row.className = "settings-table-row";
        const type = document.createElement("span");
        type.textContent = action.type;
        const summary = document.createElement("span");
        summary.textContent = summarizeAction(action) || "No summary";
        const controls = document.createElement("span");
        controls.className = "settings-table-actions";
        controls.append(iconButton("bi-pencil-square", `Edit action ${index + 1}`, () => loadAction(index)));
        if (!editorReadOnly) {
          if (index > 0) controls.append(iconButton("bi-arrow-up", "Move action up", () => moveAction(index, -1)));
          if (index < editorActions.length - 1) controls.append(iconButton("bi-arrow-down", "Move action down", () => moveAction(index, 1)));
          controls.append(iconButton("bi-trash", `Delete action ${index + 1}`, () => {
            editorActions.splice(index, 1);
            syncEditorActions();
            renderEditorActions();
          }));
        }
        row.append(type, summary, controls);
        elements.actionRows.append(row);
      });
      syncEditorActions();
    }

    function loadAction(index) {
      editingActionIndex = index;
      const action = editorActions[index] || { type: elements.actionType.value };
      elements.actionType.value = ACTION_TYPES.includes(action.type) ? action.type : "context";
      const properties = { ...action };
      delete properties.type;
      elements.actionProperties.value = JSON.stringify(properties, null, 2);
      elements.actionAdd.textContent = "Update action";
    }

    function moveAction(index, offset) {
      const target = index + offset;
      if (target < 0 || target >= editorActions.length) return;
      [editorActions[index], editorActions[target]] = [editorActions[target], editorActions[index]];
      syncEditorActions();
      renderEditorActions();
    }

    function resetActionEditor() {
      editingActionIndex = -1;
      elements.actionType.value = "context";
      elements.actionProperties.value = JSON.stringify(ACTION_DEFAULTS.context, null, 2);
      elements.actionAdd.textContent = "Add action";
    }

    function updateActionTemplate() {
      if (editingActionIndex >= 0) return;
      elements.actionProperties.value = JSON.stringify(ACTION_DEFAULTS[elements.actionType.value] || {}, null, 2);
    }

    function updateMatcherHelp() {
      elements.matcherHelp.textContent = EVENT_HELP[elements.event.value] || "Use tool, mode, path, status, error, or fields. String values may contain a safe * wildcard.";
    }

    function wildcardMatch(pattern, value) {
      const escaped = String(pattern).replace(/[|\\{}()[\]^$+?.]/g, "\\$&").split("*").join(".*");
      return new RegExp(`^${escaped}$`, "i").test(String(value == null ? "" : value));
    }

    function readPath(value, path) {
      return String(path || "").split(".").filter(Boolean).reduce((current, key) => current?.[key], value);
    }

    function matchesValue(expected, actual) {
      if (Array.isArray(expected)) return expected.some((entry) => matchesValue(entry, actual));
      if (typeof expected === "string" && expected.includes("*")) return wildcardMatch(expected, actual);
      return expected === actual || String(expected) === String(actual);
    }

    function previewMatcher() {
      try {
        const matcher = JSON.parse(elements.matcher.value || "{}");
        const payload = JSON.parse(elements.previewPayload.value || "{}");
        if (!matcher || typeof matcher !== "object" || Array.isArray(matcher)) throw new Error("Matcher must be a JSON object.");
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Preview payload must be a JSON object.");
        const values = {
          tool: payload.tool || payload.call?.function?.name,
          mode: payload.mode,
          status: payload.status || payload.item?.status || payload.worker?.status,
          error: payload.error || payload.reason,
          path: payload.path
        };
        const matches = ["tool", "mode", "status", "error", "path"].every((key) => matcher[key] == null || matchesValue(matcher[key], values[key]))
          && Object.entries(matcher.fields || {}).every(([path, expected]) => matchesValue(expected, readPath(payload, path)));
        setStatus(elements.previewResult, matches ? "This payload matches." : "This payload does not match.", false);
      } catch (error) {
        setStatus(elements.previewResult, error?.message || String(error), true);
      }
    }

    function openEditor(index = -1, readOnlyValue = null) {
      editingIndex = index;
      editorReadOnly = Boolean(readOnlyValue);
      const value = readOnlyValue || (index >= 0 ? definitions[index] : {
        id: "", event: "before-tool", enabled: true, matcher: {}, actions: [{ type: "context", content: "" }],
        timeoutMs: 30000, cooldownMs: 0, dedupWindowMs: 1000, background: false, onError: "block"
      });
      elements.title.textContent = editorReadOnly ? `View ${value.id}` : (index >= 0 ? `Edit ${value.id}` : "Add lifecycle automation");
      elements.id.value = value.id || "";
      elements.event.value = value.event || "before-tool";
      elements.enabled.checked = value.enabled !== false;
      elements.onError.value = value.onError || "continue";
      elements.matcher.value = JSON.stringify(value.matcher || {}, null, 2);
      elements.previewPayload.value = "{}";
      editorActions = JSON.parse(JSON.stringify(Array.isArray(value.actions) ? value.actions : [value.action].filter(Boolean)));
      elements.timeout.value = String(value.timeoutMs ?? 30000);
      elements.cooldown.value = String(value.cooldownMs ?? 0);
      elements.dedup.value = String(value.dedupWindowMs ?? 1000);
      elements.background.checked = value.background === true || value.async === true;
      for (const control of [elements.id, elements.event, elements.enabled, elements.onError, elements.matcher, elements.actionType, elements.actionProperties, elements.actionAdd, elements.actions, elements.actionsLoad, elements.timeout, elements.cooldown, elements.dedup, elements.background]) control.disabled = editorReadOnly;
      elements.save.hidden = editorReadOnly;
      resetActionEditor();
      renderEditorActions();
      updateMatcherHelp();
      setStatus(elements.editorStatus, "");
      setStatus(elements.previewResult, "");
      show(elements.modal);
      elements.id.focus();
    }

    function collectEditor() {
      const matcher = JSON.parse(elements.matcher.value || "{}");
      if (!matcher || typeof matcher !== "object" || Array.isArray(matcher)) throw new Error("Matcher must be a JSON object.");
      if (!editorActions.length) throw new Error("Action chain must contain at least one action.");
      const value = {
        id: elements.id.value.trim(),
        event: elements.event.value,
        enabled: elements.enabled.checked,
        matcher,
        actions: JSON.parse(JSON.stringify(editorActions)),
        timeoutMs: Number(elements.timeout.value || 30000),
        cooldownMs: Number(elements.cooldown.value || 0),
        dedupWindowMs: Number(elements.dedup.value || 1000),
        background: elements.background.checked,
        onError: elements.onError.value
      };
      validateDefinition(value);
      if (definitions.some((entry, index) => index !== editingIndex && entry.id === value.id)) throw new Error(`Automation ID '${value.id}' already exists.`);
      return value;
    }

    function closeEditor() {
      fieldHelp.hide();
      hide(elements.modal);
      editingIndex = -1;
      editorActions = [];
      editorReadOnly = false;
      for (const control of [elements.id, elements.event, elements.enabled, elements.onError, elements.matcher, elements.actionType, elements.actionProperties, elements.actionAdd, elements.actions, elements.actionsLoad, elements.timeout, elements.cooldown, elements.dedup, elements.background]) control.disabled = false;
      elements.save.hidden = false;
    }

    function show(modal) { modal.style.display = "flex"; modal.setAttribute("aria-hidden", "false"); }
    function hide(modal) { modal.style.display = "none"; modal.setAttribute("aria-hidden", "true"); }

    elements.refresh?.addEventListener("click", () => void refresh());
    elements.add?.addEventListener("click", () => openEditor());
    elements.close?.addEventListener("click", closeEditor);
    elements.cancel?.addEventListener("click", closeEditor);
    elements.event?.addEventListener("change", updateMatcherHelp);
    elements.previewMatch?.addEventListener("click", previewMatcher);
    elements.actionType?.addEventListener("change", updateActionTemplate);
    elements.actionAdd?.addEventListener("click", () => {
      try {
        const properties = JSON.parse(elements.actionProperties.value || "{}");
        if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("Action properties must be a JSON object.");
        delete properties.type;
        const action = { type: elements.actionType.value, ...properties };
        if (editingActionIndex >= 0) editorActions[editingActionIndex] = action;
        else editorActions.push(action);
        resetActionEditor();
        renderEditorActions();
        setStatus(elements.editorStatus, "");
      } catch (error) { setStatus(elements.editorStatus, error?.message || String(error), true); }
    });
    elements.actionsLoad?.addEventListener("click", () => {
      try {
        const actions = JSON.parse(elements.actions.value || "[]");
        if (!Array.isArray(actions)) throw new Error("Action chain must be a JSON array.");
        for (const action of actions) if (!ACTIONS.has(String(action?.type || ""))) throw new Error("Action chain contains an unsupported action type.");
        editorActions = actions;
        resetActionEditor();
        renderEditorActions();
        setStatus(elements.editorStatus, "");
      } catch (error) { setStatus(elements.editorStatus, error?.message || String(error), true); }
    });
    elements.save?.addEventListener("click", () => {
      try {
        const value = collectEditor();
        if (editingIndex >= 0) definitions[editingIndex] = value;
        else definitions.push(value);
        sync();
        render();
        closeEditor();
      } catch (error) { setStatus(elements.editorStatus, error?.message || String(error), true); }
    });
    elements.json?.addEventListener("click", () => {
      elements.jsonText.value = JSON.stringify(definitions, null, 2);
      setStatus(elements.jsonStatus, "");
      show(elements.jsonModal);
    });
    elements.jsonClose?.addEventListener("click", () => hide(elements.jsonModal));
    elements.jsonCancel?.addEventListener("click", () => hide(elements.jsonModal));
    elements.jsonSave?.addEventListener("click", () => {
      try {
        definitions = parseDefinitions(elements.jsonText.value);
        sync();
        render();
        hide(elements.jsonModal);
      } catch (error) { setStatus(elements.jsonStatus, error?.message || String(error), true); }
    });

    async function refresh() {
      try {
        definitions = parseDefinitions(elements.input.value);
        render();
      } catch (error) {
        definitions = [];
        render();
        setStatus(elements.status, error?.message || String(error), true);
      }
      if (deps.bridge?.lifecycleList) {
        try {
          const snapshot = await deps.bridge.lifecycleList({ workspaceRoot: deps.getWorkspaceRoot?.() || "" });
          discoveredDefinitions = Array.isArray(snapshot?.definitions) ? snapshot.definitions : [];
          render();
          if (snapshot?.errors?.length) setStatus(elements.status, `${snapshot.errors.length} lifecycle source item(s) could not be loaded.`, true);
        } catch (error) { setStatus(elements.status, error?.message || String(error), true); }
      }
    }

    const api = { refresh, collect: () => JSON.parse(JSON.stringify(definitions)) };
    app.registerModule?.("aiCompanionLifecycleSettings", api);
    void refresh();
    return api;
  }

  window.registerMarkdownViewerAiLifecycleSettings = registerMarkdownViewerAiLifecycleSettings;
})(window, document);
