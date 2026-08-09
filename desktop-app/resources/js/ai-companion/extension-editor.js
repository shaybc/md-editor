/** Structured editor for authored extension bundles and their contributions. */
(function(window, document) {
  "use strict";

  const HELP = Object.freeze({
    id: "A stable lowercase identifier used for the folder and runtime references. Use letters, numbers, dots, dashes, or underscores. Changing it while editing performs an explicit rename.",
    name: "The human-readable extension name shown in settings. It does not need to match the identifier.",
    version: "The extension release version. Use a value your team can recognize, such as 1.0.0, and update it when the bundle behavior changes.",
    description: "A plain-language summary of the extension purpose. This is shown before any detailed contribution instructions are loaded.",
    scope: "Profile extensions are available to your account. Workspace extensions travel with this workspace and require trust again after changes.",
    contribution: "A contribution adds one capability to the bundle. Skills and agents contain Markdown instructions; hooks contain lifecycle actions; external servers describe deferred tool providers.",
    advanced: "This JSON represents the complete draft. It is useful for precise bulk edits. Apply it to the form before validation or saving.",
    metadata: "Optional definition fields in JSON form, such as triggers, allowed modes, allowed tools, permissions, model routing, or path scope. The ID, name, and description fields above take precedence.",
    body: "Markdown instructions loaded when this skill or agent is activated. Write direct operational guidance and include important limitations and verification steps.",
    event: "The lifecycle boundary that activates this hook, for example before-tool or task-completed. The runtime validates supported event names before saving.",
    actions: "A JSON array of ordered hook actions. Each action requires a supported type and its required properties. Side effects still use the normal approval system.",
    server: "External server connection details. HTTP servers need an HTTPS URL; local development may use localhost. Process servers need an executable command and optional argument list."
  });

  function createExtensionEditor(deps) {
    const tooltip = window.MarkdownViewerAiConnectionEntryTooltip?.create?.();
    let state = null;
    const overlay = buildDialog();
    const fields = Object.fromEntries(Array.from(overlay.querySelectorAll("[data-extension-field]"), (element) => [element.dataset.extensionField, element]));
    const groups = Object.fromEntries(Array.from(overlay.querySelectorAll("[data-extension-group]"), (element) => [element.dataset.extensionGroup, element]));
    document.body.append(overlay);
    bindHelp(overlay, tooltip);

    overlay.querySelector("[data-extension-close]").addEventListener("click", () => close());
    overlay.querySelector("[data-extension-cancel]").addEventListener("click", () => close());
    overlay.querySelector("[data-extension-save]").addEventListener("click", () => void save());
    overlay.querySelector("[data-extension-validate]").addEventListener("click", () => void validate());
    overlay.querySelector("[data-extension-apply-json]").addEventListener("click", applyAdvancedJson);
    overlay.querySelectorAll("[data-extension-add]").forEach((button) => button.addEventListener("click", () => editContribution(button.dataset.extensionAdd)));

    function open(options) {
      const empty = { manifest: { schemaVersion: 1, id: "", name: "", version: "1.0.0", description: "" }, skills: [], agents: [], hooks: [], mcpServers: [] };
      state = { originalId: options?.id || "", digest: options?.digest || "", readOnly: options?.readOnly === true, draft: clone(options?.draft || empty) };
      state.initial = JSON.stringify(state.draft);
      fields.scope.value = options?.scope === "workspace" ? "workspace" : "user";
      fields.scope.disabled = Boolean(options?.id);
      fields.id.value = state.draft.manifest.id || "";
      fields.name.value = state.draft.manifest.name || "";
      fields.version.value = state.draft.manifest.version || "1.0.0";
      fields.description.value = state.draft.manifest.description || "";
      overlay.querySelector("[data-extension-title]").textContent = state.readOnly ? "View extension" : (options?.id ? "Edit extension" : "Create extension");
      overlay.querySelector("[data-extension-save]").hidden = state.readOnly;
      overlay.querySelectorAll("input, select, textarea, button[data-extension-add], button[data-contribution-action]").forEach((control) => { if (!control.matches("[data-extension-close],[data-extension-cancel]")) control.disabled = state.readOnly; });
      renderContributions();
      syncAdvanced();
      setStatus("");
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden", "false");
    }

    function close(force) {
      if (!state) return;
      if (!force && !state.readOnly && JSON.stringify(collect()) !== state.initial && !window.confirm("Discard the unsaved extension changes?")) return;
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      state = null;
    }

    function collect() {
      state.draft.manifest = { schemaVersion: 1, id: fields.id.value.trim(), name: fields.name.value.trim(), version: fields.version.value.trim(), description: fields.description.value.trim() };
      return clone(state.draft);
    }

    async function validate() {
      setStatus("Validating extension...");
      try {
        const result = await deps.bridge.extensionValidate({ draft: collect() });
        setStatus(result.valid ? (result.warnings?.join(" ") || "Extension is valid.") : result.errors.join(" "), !result.valid);
        return result.valid;
      } catch (error) { setStatus(error.message || String(error), true); return false; }
    }

    async function save() {
      if (!await validate()) return;
      if (state.originalId && fields.id.value.trim() !== state.originalId && !window.confirm(`Rename extension '${state.originalId}' to '${fields.id.value.trim()}'? References to the old ID may need to be updated.`)) return;
      setStatus("Saving extension...");
      try {
        await deps.bridge.extensionSave({ scope: fields.scope.value, originalId: state.originalId, expectedDigest: state.digest || undefined, draft: collect() });
        close(true);
        await deps.onSaved?.();
      } catch (error) { setStatus(error.message || String(error), true); }
    }

    function renderContributions() {
      for (const [group, container] of Object.entries(groups)) {
        container.replaceChildren();
        for (const [index, entry] of state.draft[group].entries()) {
          const row = document.createElement("div");
          row.className = "settings-ai-extension-contribution-row";
          const label = document.createElement("span");
          label.textContent = entry.metadata?.name || entry.definition?.id || entry.metadata?.id || `${group} ${index + 1}`;
          const actions = document.createElement("span");
          const edit = actionButton("bi-pencil", "Edit", () => editContribution(group, index));
          const remove = actionButton("bi-trash", "Remove", () => { state.draft[group].splice(index, 1); renderContributions(); syncAdvanced(); });
          edit.disabled = remove.disabled = state.readOnly;
          actions.append(edit, remove);
          row.append(label, actions);
          container.append(row);
        }
      }
    }

    function editContribution(group, index) {
      const existing = index == null ? null : state.draft[group][index];
      const editor = buildContributionDialog(group, existing);
      document.body.append(editor.overlay);
      bindHelp(editor.overlay, tooltip);
      editor.cancel.addEventListener("click", () => editor.overlay.remove());
      editor.close.addEventListener("click", () => editor.overlay.remove());
      editor.save.addEventListener("click", () => {
        try {
          const value = editor.read();
          if (index == null) state.draft[group].push(value); else state.draft[group][index] = value;
          editor.overlay.remove();
          renderContributions();
          syncAdvanced();
        } catch (error) { editor.status.textContent = error.message || String(error); editor.status.classList.add("is-error"); }
      });
    }

    function syncAdvanced() { fields.advanced.value = JSON.stringify(collect(), null, 2); }
    function applyAdvancedJson() {
      try {
        const value = JSON.parse(fields.advanced.value);
        state.draft = value;
        fields.id.value = value.manifest?.id || ""; fields.name.value = value.manifest?.name || ""; fields.version.value = value.manifest?.version || ""; fields.description.value = value.manifest?.description || "";
        for (const group of Object.keys(groups)) if (!Array.isArray(state.draft[group])) state.draft[group] = [];
        renderContributions(); setStatus("JSON applied to the editor.");
      } catch (error) { setStatus(`Invalid draft JSON: ${error.message}`, true); }
    }
    function setStatus(message, error) { const target = overlay.querySelector("[data-extension-status]"); target.textContent = message || ""; target.classList.toggle("is-error", error === true); }

    return { open };
  }

  function buildDialog() {
    const overlay = document.createElement("div");
    overlay.className = "reset-modal-overlay settings-ai-extension-editor";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.display = "none";
    overlay.innerHTML = `<div class="reset-modal-box settings-ai-extension-editor-box" role="dialog" aria-modal="true"><header class="settings-ai-extension-editor-header"><button class="settings-modal-close" data-extension-close type="button" aria-label="Close"><span aria-hidden="true">&times;</span></button><p class="reset-modal-message" data-extension-title>Edit extension</p></header><div class="settings-ai-extension-editor-body"><section class="settings-ai-extension-editor-section"><h4>General</h4><div class="settings-field-grid settings-field-grid-two">${field("id", "Extension ID", "text", "id")}${field("name", "Name", "text", "name")}${field("version", "Version", "text", "version")}${selectField("scope", "Scope", [{ value: "user", label: "Profile" }, { value: "workspace", label: "Workspace" }], "scope")}</div>${textareaField("description", "Description", 3, "description")}</section><section class="settings-ai-extension-editor-section"><div class="settings-ai-extension-section-heading"><h4>Contributions</h4>${help("contribution")}</div>${group("skills", "Skills")}${group("agents", "Agents")}${group("hooks", "Hooks")}${group("mcpServers", "External servers")}</section><details class="settings-ai-extension-editor-section"><summary><span>Advanced draft JSON</span>${help("advanced")}</summary>${textareaField("advanced", "Complete extension draft", 16, "advanced")}<button class="reset-modal-btn settings-secondary-action" data-extension-apply-json type="button">Apply JSON to form</button></details><p class="settings-panel-description" data-extension-status aria-live="polite"></p></div><footer class="reset-modal-actions settings-ai-extension-editor-footer"><button class="reset-modal-btn reset-modal-cancel" data-extension-cancel type="button">Cancel</button><button class="reset-modal-btn settings-secondary-action" data-extension-validate type="button">Validate</button><button class="reset-modal-btn settings-primary-action" data-extension-save type="button">Save extension</button></footer></div>`;
    return overlay;
  }

  function group(id, title) { return `<div class="settings-ai-extension-group"><div class="settings-ai-extension-section-heading"><h5>${title}</h5><button class="reset-modal-btn settings-secondary-action" data-extension-add="${id}" type="button"><i class="bi bi-plus-lg" aria-hidden="true"></i><span>Add</span></button></div><div data-extension-group="${id}" class="settings-ai-extension-contributions"></div></div>`; }

  function buildContributionDialog(group, existing) {
    const kind = { skills: "Skill", agents: "Agent", hooks: "Hook", mcpServers: "External server" }[group];
    const overlay = document.createElement("div"); overlay.className = "reset-modal-overlay settings-ai-extension-contribution-editor";
    const common = group === "skills" || group === "agents";
    const hook = group === "hooks";
    const server = group === "mcpServers";
    overlay.innerHTML = `<div class="reset-modal-box settings-ai-extension-contribution-box" role="dialog" aria-modal="true"><header class="settings-ai-extension-editor-header"><button class="settings-modal-close" data-close type="button"><span aria-hidden="true">&times;</span></button><p class="reset-modal-message">${existing ? "Edit" : "Add"} ${kind.toLowerCase()}</p></header><div class="settings-ai-extension-editor-body">${common ? `${field("id", `${kind} ID`, "text", "id")}${field("name", "Name", "text", "name")}${textareaField("description", "Description", 3, "description")}${textareaField("body", "Markdown instructions", 12, "body")}${textareaField("metadata", "Additional metadata (JSON object)", 8, "metadata")}` : ""}${hook ? `${field("id", "Hook ID", "text", "id")}${field("event", "Event", "text", "event")}${selectField("enabled", "Status", [{ value: "true", label: "Enabled" }, { value: "false", label: "Disabled" }], "event")}${selectField("onError", "When an action fails", [{ value: "continue", label: "Continue" }, { value: "block", label: "Block current boundary" }, { value: "stop-run", label: "Stop run" }], "event")}<div class="settings-field-grid settings-field-grid-two">${field("timeoutMs", "Timeout (ms)", "number", "event")}${field("cooldownMs", "Cooldown (ms)", "number", "event")}${field("dedupWindowMs", "Deduplication window (ms)", "number", "event")}${selectField("background", "Execution", [{ value: "false", label: "Wait for completion" }, { value: "true", label: "Run in background" }], "event")}</div>${textareaField("matcher", "Matcher (JSON object)", 5, "event")}${textareaField("actions", "Ordered actions (JSON array)", 10, "actions")}` : ""}${server ? `${field("id", "Server ID", "text", "id")}${selectField("transport", "Transport", [{ value: "http", label: "HTTP" }, { value: "stdio", label: "Local process" }], "server")}${field("url", "Server URL", "url", "server")}${field("command", "Executable command", "text", "server")}${textareaField("args", "Arguments (JSON array)", 4, "server")}${textareaField("headers", "Headers (JSON object)", 4, "server")}${textareaField("env", "Environment (JSON object)", 4, "server")}${field("cwd", "Working directory", "text", "server")}` : ""}<p class="settings-panel-description" data-status aria-live="polite"></p></div><footer class="reset-modal-actions settings-ai-extension-editor-footer"><button class="reset-modal-btn reset-modal-cancel" data-cancel type="button">Cancel</button><button class="reset-modal-btn settings-primary-action" data-save type="button">Save contribution</button></footer></div>`;
    const inputs = Object.fromEntries(Array.from(overlay.querySelectorAll("[data-extension-field]"), (element) => [element.dataset.extensionField, element]));
    const value = existing || {};
    if (common) { const metadata = value.metadata || {}; inputs.id.value = metadata.id || ""; inputs.name.value = metadata.name || ""; inputs.description.value = metadata.description || ""; inputs.body.value = value.body || ""; const extra = { ...metadata }; delete extra.id; delete extra.name; delete extra.description; inputs.metadata.value = JSON.stringify(extra, null, 2); }
    if (hook) { const definition = value.definition || {}; inputs.id.value = definition.id || ""; inputs.event.value = definition.event || ""; inputs.enabled.value = String(definition.enabled !== false); inputs.onError.value = definition.onError || "continue"; inputs.timeoutMs.value = definition.timeoutMs || 30000; inputs.cooldownMs.value = definition.cooldownMs || 0; inputs.dedupWindowMs.value = definition.dedupWindowMs || 1000; inputs.background.value = String(definition.background === true); inputs.matcher.value = JSON.stringify(definition.matcher || {}, null, 2); inputs.actions.value = JSON.stringify(definition.actions || [], null, 2); }
    if (server) { const definition = value.definition || {}; for (const key of ["id", "transport", "url", "command", "cwd"]) inputs[key].value = definition[key] || (key === "transport" ? "http" : ""); inputs.args.value = JSON.stringify(definition.args || [], null, 2); inputs.headers.value = JSON.stringify(definition.headers || {}, null, 2); inputs.env.value = JSON.stringify(definition.env || {}, null, 2); }
    return { overlay, close: overlay.querySelector("[data-close]"), cancel: overlay.querySelector("[data-cancel]"), save: overlay.querySelector("[data-save]"), status: overlay.querySelector("[data-status]"), read() { if (common) return { metadata: { ...parseObject(inputs.metadata.value), id: inputs.id.value.trim(), name: inputs.name.value.trim(), description: inputs.description.value.trim() }, body: inputs.body.value }; if (hook) return { definition: { id: inputs.id.value.trim(), event: inputs.event.value.trim(), enabled: inputs.enabled.value === "true", onError: inputs.onError.value, timeoutMs: Number(inputs.timeoutMs.value), cooldownMs: Number(inputs.cooldownMs.value), dedupWindowMs: Number(inputs.dedupWindowMs.value), background: inputs.background.value === "true", matcher: parseObject(inputs.matcher.value), actions: parseArray(inputs.actions.value) } }; return { definition: { id: inputs.id.value.trim(), transport: inputs.transport.value, url: inputs.url.value.trim(), command: inputs.command.value.trim(), args: parseArray(inputs.args.value), headers: parseObject(inputs.headers.value), env: parseObject(inputs.env.value), cwd: inputs.cwd.value.trim() } }; } };
  }

  function field(id, label, type, helpKey) { return `<label class="settings-field"><span class="settings-ai-entry-label-row"><span class="settings-field-label">${label}</span>${help(helpKey)}</span><input class="rename-modal-input" data-extension-field="${id}" type="${type}" /></label>`; }
  function textareaField(id, label, rows, helpKey) { return `<label class="settings-field"><span class="settings-ai-entry-label-row"><span class="settings-field-label">${label}</span>${help(helpKey)}</span><textarea class="rename-modal-input settings-textarea-input" data-extension-field="${id}" rows="${rows}" spellcheck="false"></textarea></label>`; }
  function selectField(id, label, options, helpKey) { return `<label class="settings-field"><span class="settings-ai-entry-label-row"><span class="settings-field-label">${label}</span>${help(helpKey)}</span><select class="rename-modal-input settings-select-input" data-extension-field="${id}">${options.map((entry) => `<option value="${entry.value}">${entry.label}</option>`).join("")}</select></label>`; }
  function help(key) { return `<button class="settings-ai-entry-help" data-extension-help="${key}" type="button" aria-label="${key} information">i</button>`; }
  function bindHelp(root, tooltip) { root.querySelectorAll("[data-extension-help]").forEach((button) => tooltip?.bind?.(button, HELP[button.dataset.extensionHelp] || HELP.contribution)); }
  function actionButton(icon, label, handler) { const button = document.createElement("button"); button.type = "button"; button.className = "settings-table-action"; button.setAttribute("aria-label", label); button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`; button.addEventListener("click", handler); return button; }
  function parseObject(text) { const value = JSON.parse(text || "{}"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object."); return value; }
  function parseArray(text) { const value = JSON.parse(text || "[]"); if (!Array.isArray(value)) throw new Error("Expected a JSON array."); return value; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  window.MarkdownViewerAiExtensionEditor = Object.freeze({ create: createExtensionEditor });
})(window, document);
