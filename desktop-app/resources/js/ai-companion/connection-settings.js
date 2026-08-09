/** Structured table, details wizard, and advanced JSON editing for AI connections. */
(function(window, document) {
  "use strict";

  function registerMarkdownViewerAiConnectionSettings(app) {
    const schema = window.MarkdownViewerAiConnectionEntries;
    const profileFormFactory = window.MarkdownViewerAiConnectionProfileForm;
    const tooltipFactory = window.MarkdownViewerAiConnectionEntryTooltip;
    const connectorProviderModes = new Set(["gemini-connector", "gemini-connector-raw"]);
    const elements = {
      profileInput: document.getElementById("settings-ai-connection-profiles"), routeInput: document.getElementById("settings-ai-provider-routes"),
      profileRows: document.getElementById("settings-ai-connection-profile-rows"), routeRows: document.getElementById("settings-ai-provider-route-rows"),
      profileEmpty: document.getElementById("settings-ai-connection-profile-empty"), routeEmpty: document.getElementById("settings-ai-provider-route-empty"),
      profileAdd: document.getElementById("settings-ai-connection-profile-add"), routeAdd: document.getElementById("settings-ai-provider-route-add"),
      profileCancel: document.getElementById("settings-ai-connection-profile-cancel"),
      profileJson: document.getElementById("settings-ai-connection-profile-json"), routeJson: document.getElementById("settings-ai-provider-route-json"),
      profileName: document.getElementById("settings-ai-connection-profile-name"),
      providerMode: document.getElementById("settings-ai-provider-mode"), baseUrl: document.getElementById("settings-ai-base-url"),
      apiKey: document.getElementById("settings-ai-api-key"), model: document.getElementById("settings-ai-model"),
      requestDelay: document.getElementById("settings-ai-provider-request-delay-ms"),
      litellmAlias: document.getElementById("settings-ai-litellm-alias"), litellmRouting: document.getElementById("settings-ai-litellm-routing"),
      geminiBaseUrl: document.getElementById("settings-ai-gemini-base-url"), geminiConnectorId: document.getElementById("settings-ai-gemini-connector-id"),
      geminiApiKey: document.getElementById("settings-ai-gemini-api-key"),
      status: document.getElementById("settings-ai-entries-status"),
      wizard: document.getElementById("settings-ai-entry-wizard-modal"), wizardTitle: document.getElementById("settings-ai-entry-wizard-title"),
      wizardStep: document.getElementById("settings-ai-entry-wizard-step"), wizardForm: document.getElementById("settings-ai-entry-wizard-form"),
      wizardPreview: document.getElementById("settings-ai-entry-wizard-preview"), wizardStatus: document.getElementById("settings-ai-entry-wizard-status"),
      wizardClose: document.getElementById("settings-ai-entry-wizard-close"), wizardCancel: document.getElementById("settings-ai-entry-wizard-cancel"),
      wizardBack: document.getElementById("settings-ai-entry-wizard-back"), wizardNext: document.getElementById("settings-ai-entry-wizard-next"), wizardSave: document.getElementById("settings-ai-entry-wizard-save"),
      jsonModal: document.getElementById("settings-ai-entry-json-modal"), jsonTitle: document.getElementById("settings-ai-entry-json-title"),
      jsonStatus: document.getElementById("settings-ai-entry-json-status"), jsonClose: document.getElementById("settings-ai-entry-json-close"),
      jsonCancel: document.getElementById("settings-ai-entry-json-cancel"), jsonSave: document.getElementById("settings-ai-entry-json-save"),
      profileJsonField: document.getElementById("settings-ai-connection-profiles-json-field"), routeJsonField: document.getElementById("settings-ai-provider-routes-json-field")
    };
    if (!schema || !profileFormFactory || !tooltipFactory || !elements.profileInput || !elements.routeInput || !elements.profileRows || !elements.routeRows) return null;

    let profiles = [];
    let routes = [];
    let wizardState = null;
    let jsonState = null;
    const fieldTooltip = tooltipFactory.create();
    const profileForm = profileFormFactory.create({
      elements,
      schema,
      getProfiles: () => profiles,
      setProfiles: (value) => { profiles = value; },
      renameProfileReferences: (previousId, nextId) => {
        routes = routes.map((route) => route.profileId === previousId ? { ...route, profileId: nextId } : route);
      },
      syncAndRender: () => { syncInputs(); renderAll(); },
      setStatus: (message, isError = false) => setStatus(elements.status, message, isError)
    });

    function setStatus(target, message, isError = false) {
      if (!target) return;
      target.textContent = message || "";
      target.classList.toggle("error", isError === true);
    }
    function parseArray(input, label) {
      const parsed = JSON.parse(input.value || "[]");
      if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
      return parsed;
    }
    function syncInputs() {
      elements.profileInput.value = JSON.stringify(profiles, null, 2);
      elements.routeInput.value = JSON.stringify(routes, null, 2);
    }
    function button(icon, title, action) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "settings-icon-action";
      element.title = title;
      element.setAttribute("aria-label", title);
      element.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
      element.addEventListener("click", action);
      return element;
    }
    function renderRows(kind) {
      const entries = kind === "profile" ? profiles : routes;
      const container = kind === "profile" ? elements.profileRows : elements.routeRows;
      const empty = kind === "profile" ? elements.profileEmpty : elements.routeEmpty;
      container.replaceChildren();
      entries.forEach((entry, index) => {
        const summary = schema.summarize(kind, entry);
        const row = document.createElement("div");
        row.className = "settings-table-row settings-ai-connection-row";
        row.setAttribute("role", "row");
        [summary.primary, summary.secondary, summary.tertiary].forEach((value, cellIndex) => {
          const cell = document.createElement("span");
          cell.setAttribute("role", "cell");
          if (kind === "profile" && cellIndex === 0) {
            cell.className = "settings-ai-profile-name";
            cell.appendChild(document.createTextNode(value));
            if (profileForm.isPrimary(entry.id)) {
              const primary = document.createElement("span");
              primary.className = "settings-ai-profile-primary-indicator";
              primary.title = "Active primary connection";
              primary.setAttribute("aria-label", "Active primary connection");
              primary.innerHTML = '<i class="bi bi-check-circle-fill" aria-hidden="true"></i>';
              cell.appendChild(primary);
            }
          } else cell.textContent = value;
          cell.title = profileForm.isPrimary(entry.id) && cellIndex === 0 ? `${value} (Primary)` : value;
          row.appendChild(cell);
        });
        const actions = document.createElement("span");
        actions.className = "settings-table-actions";
        actions.setAttribute("role", "cell");
        if (kind === "profile") {
          actions.appendChild(button("bi-pencil-square", `Edit ${summary.primary} in the connection form`, () => profileForm.edit(index)));
          const isPrimary = profileForm.isPrimary(entry.id);
          const makePrimary = button("bi-check2-circle", isPrimary ? `${summary.primary} is the primary connection` : `Set ${summary.primary} as primary`, () => profileForm.selectPrimary(index));
          makePrimary.disabled = isPrimary;
          makePrimary.classList.toggle("is-primary-profile", isPrimary);
          actions.appendChild(makePrimary);
        } else actions.appendChild(button("bi-card-list", `View or edit ${summary.primary}`, () => openWizard(kind, index)));
        row.appendChild(actions);
        container.appendChild(row);
      });
      if (empty) empty.hidden = entries.length > 0;
    }
    function renderAll() { renderRows("profile"); renderRows("route"); }

    /** Reload both structured tables from the canonical JSON form fields. */
    function refresh() {
      try {
        profiles = parseArray(elements.profileInput, "Connection profiles").map(schema.normalizeProfile);
        routes = parseArray(elements.routeInput, "Provider routes").map(schema.normalizeRoute);
        profileForm.refresh();
        syncInputs();
        renderAll();
        setStatus(elements.status, "");
        return true;
      } catch (error) {
        setStatus(elements.status, `Could not load connection entries: ${error?.message || String(error)}`, true);
        return false;
      }
    }

    function getPath(source, path) { return path.split(".").reduce((value, key) => value?.[key], source); }
    function setPath(target, path, value) {
      const keys = path.split(".");
      const leaf = keys.pop();
      const parent = keys.reduce((current, key) => current[key] ||= {}, target);
      parent[leaf] = value;
    }

    function profileSteps() {
      return [
        { title: "Identity", fields: [{ key: "id", label: "Profile ID", required: true }, { key: "providerMode", label: "Provider", type: "select", options: schema.PROVIDER_MODES }, { key: "model", label: "Default model", type: "model" }] },
        { title: "Connection", fields: [{ key: "baseUrl", label: "Base URL", type: "url" }, { key: "apiKey", label: "API key or token", type: "password" }, { key: "litellmModelAlias", label: "LiteLLM model alias", providerMode: "litellm" }, { key: "litellmRoutingConfig", label: "LiteLLM routing config", type: "textarea", providerMode: "litellm" }] },
        { title: "Connector details", fallbackTitle: "Advanced", providerModes: connectorProviderModes, fields: [{ key: "geminiConnectorBaseUrl", label: "Connector URL", type: "url", providerModes: connectorProviderModes }, { key: "geminiConnectorId", label: "Connector ID", providerModes: connectorProviderModes }, { key: "geminiConnectorApiKey", label: "Connector token", type: "password", providerModes: connectorProviderModes }, { key: "_additionalProperties", label: "Additional properties (JSON object)", type: "textarea", monospace: true }] }
      ];
    }
    function routeSteps() {
      const profileOptions = ["default", ...profiles.map((profile) => profile.id).filter(Boolean)];
      const purposeHelp = {
        primary: "General user conversations and ordinary agent work when no more specific purpose is selected.",
        quick: "Short, latency-sensitive requests that benefit from a faster or less expensive model.",
        renewal: "Context renewal and digest generation when a long-running conversation must be compacted.",
        memory: "Memory retrieval, selection, and maintenance operations.",
        worker: "Delegated work performed by background or specialist agents.",
        review: "Review-oriented work such as examining changes, risks, or implementation quality.",
        testing: "Verification work such as test analysis, failure diagnosis, and validation.",
        risk: "Focused safety and command-risk advice used before potentially sensitive actions."
      };
      return [
        { title: "Identity", fields: [
          { key: "id", label: "Route ID", required: true, help: "A unique name for this route. Other routes refer to this value when configuring fallbacks." },
          { key: "profileId", label: "Connection profile", type: "select", options: profileOptions, help: "Selects the provider endpoint and credentials used by this route. 'default' uses the primary connection configured above." },
          { key: "model", label: "Model override", help: "Optional model name used only by this route. Leave blank to use the selected connection profile's model." }
        ] },
        { title: "Work selection", fields: [
          { key: "purposes", label: "Purposes", type: "checkboxes", options: schema.ROUTE_PURPOSES, optionHelp: purposeHelp, help: "Choose the runtime operations that may select this route. A route can serve more than one purpose." },
          { key: "fallbacks", label: "Fallback route IDs", type: "list", help: "Comma-separated route IDs tried in this order after rate limiting, provider unavailability, or a retryable transport failure." },
          { key: "allowProviderChange", label: "Allow fallback to change provider", type: "checkbox", help: "Allows fallback routes to use a different connection profile or provider. Keep disabled when provider consistency or data boundaries must be preserved." }
        ] },
        { title: "Limits and access", fields: [
          { key: "contextWindow", label: "Context window", type: "number", help: "Maximum input context supported by this route's model, in tokens. Use 0 to resolve the value from the model registry." },
          { key: "maxOutputTokens", label: "Maximum output tokens", type: "number", help: "Maximum response size supported by this route's model, in tokens. Use 0 to resolve the value from the model registry." },
          { key: "dataScopes.workspace", label: "Workspace data", type: "checkbox", help: "Authorizes this route to receive workspace files, paths, rules, and other project context." },
          { key: "dataScopes.personalMemory", label: "Personal memory", type: "checkbox", help: "Authorizes retrieval and use of relevant personal-scope memory with this route." },
          { key: "dataScopes.teamMemory", label: "Team memory", type: "checkbox", help: "Authorizes retrieval and use of relevant team-scope memory with this route." },
          { key: "dataScopes.externalContent", label: "External content", type: "checkbox", help: "Marks this route as permitted to receive content retrieved from websites or external services." },
          { key: "capabilities.tools", label: "Tool calling", type: "checkbox", help: "Declares that the route's model and connector support structured tool calls." },
          { key: "capabilities.vision", label: "Vision", type: "checkbox", help: "Declares that the route can accept and understand image input." },
          { key: "capabilities.reasoning", label: "Reasoning", type: "checkbox", help: "Declares that the route is suitable for operations requiring a reasoning-capable model." },
          { key: "_additionalProperties", label: "Additional properties (JSON object)", type: "textarea", monospace: true, help: "Optional advanced route properties not represented by the structured fields. Enter a valid JSON object; known fields remain authoritative." }
        ] }
      ];
    }

    function createFieldHelp(label, description) {
      if (!description) return null;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-ai-entry-help";
      button.textContent = "i";
      button.dataset.nativeTooltip = "off";
      button.setAttribute("aria-label", `${label}: ${description}`);
      fieldTooltip.bind(button, description);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      return button;
    }

    function appendFieldHelp(container, label, description) {
      const help = createFieldHelp(label, description);
      if (help) container.appendChild(help);
    }

    function createField(descriptor) {
      if (descriptor.type === "checkbox") {
        const label = document.createElement("label");
        label.className = "settings-switch-row";
        const text = document.createElement("span");
        const heading = document.createElement("span");
        heading.className = "settings-ai-entry-field-heading";
        const title = document.createElement("span");
        title.className = "settings-switch-title";
        title.textContent = descriptor.label;
        heading.appendChild(title);
        appendFieldHelp(heading, descriptor.label, descriptor.help);
        text.appendChild(heading);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "settings-switch-input";
        input.dataset.entryField = descriptor.key;
        input.checked = getPath(wizardState.draft, descriptor.key) === true;
        const switchElement = document.createElement("span");
        switchElement.className = "settings-switch";
        switchElement.setAttribute("aria-hidden", "true");
        label.append(text, input, switchElement);
        return label;
      }
      if (descriptor.type === "checkboxes") {
        const group = document.createElement("fieldset");
        group.className = "settings-ai-entry-option-group";
        const legend = document.createElement("legend");
        legend.appendChild(document.createTextNode(descriptor.label));
        appendFieldHelp(legend, descriptor.label, descriptor.help);
        group.appendChild(legend);
        const selected = new Set(getPath(wizardState.draft, descriptor.key) || []);
        descriptor.options.forEach((option) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = option;
          input.dataset.entryField = descriptor.key;
          input.checked = selected.has(option);
          label.append(input, document.createTextNode(option));
          appendFieldHelp(label, option, descriptor.optionHelp?.[option]);
          group.appendChild(label);
        });
        return group;
      }
      const label = document.createElement("label");
      label.className = "settings-field";
      const caption = document.createElement("span");
      caption.className = "settings-field-label";
      caption.textContent = descriptor.label;
      const heading = document.createElement("span");
      heading.className = "settings-ai-entry-field-heading";
      heading.appendChild(caption);
      appendFieldHelp(heading, descriptor.label, descriptor.help);
      let input;
      if (descriptor.type === "select") {
        input = document.createElement("select");
        for (const option of descriptor.options || []) {
          const item = document.createElement("option");
          item.value = option;
          item.textContent = option;
          input.appendChild(item);
        }
      } else if (descriptor.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = descriptor.monospace ? 7 : 4;
        if (descriptor.monospace) input.classList.add("settings-ai-entry-json-textarea");
      } else {
        input = document.createElement("input");
        input.type = descriptor.type === "model" ? "text" : (descriptor.type || "text");
        if (descriptor.type === "number") { input.min = "0"; input.step = "1"; }
      }
      input.classList.add("rename-modal-input");
      if (input.tagName === "SELECT") input.classList.add("settings-select-input");
      input.dataset.entryField = descriptor.key;
      input.dataset.entryType = descriptor.type || "text";
      input.required = descriptor.required === true;
      const value = getPath(wizardState.draft, descriptor.key);
      input.value = descriptor.type === "list" ? (value || []).join(", ") : String(value == null ? "" : value);
      label.append(heading, input);
      if (descriptor.type === "model") {
        const options = document.createElement("datalist");
        options.id = "settings-ai-entry-wizard-model-options";
        input.setAttribute("list", options.id);
        label.appendChild(options);
      }
      return label;
    }

    function populateWizardModelSuggestions(applyPreset = false) {
      const modelInput = elements.wizardForm.querySelector('[data-entry-type="model"]');
      const modelOptions = elements.wizardForm.querySelector("#settings-ai-entry-wizard-model-options");
      if (!modelInput || !modelOptions) return;
      const providerMode = String(getPath(wizardState.draft, "providerMode") || "openai-compatible");
      const fields = { modelInput, modelOptionsList: modelOptions, registryModels: app.modules?.aiCompanionModelRegistry?.getCachedModels?.() || [] };
      if (applyPreset) {
        const preset = window.markdownViewerAiProviderPresets?.applyProviderPresetSelection(providerMode, fields);
        setPath(wizardState.draft, "apiKey", "");
        if (preset?.baseUrl) setPath(wizardState.draft, "baseUrl", preset.baseUrl);
      } else window.markdownViewerAiProviderPresets?.populateProviderModelSuggestions(providerMode, modelOptions, fields.registryModels);
      setPath(wizardState.draft, "model", modelInput.value);
    }

    function commitStep() {
      const grouped = new Map();
      elements.wizardForm.querySelectorAll("[data-entry-field]").forEach((input) => {
        const key = input.dataset.entryField;
        if (input.type === "checkbox" && input.closest("fieldset")) {
          if (!grouped.has(key)) grouped.set(key, []);
          if (input.checked) grouped.get(key).push(input.value);
          return;
        }
        let value = input.value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.dataset.entryType === "number") value = Math.max(0, Math.floor(Number(value) || 0));
        else if (input.dataset.entryType === "list") value = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
        setPath(wizardState.draft, key, value);
      });
      grouped.forEach((value, key) => setPath(wizardState.draft, key, value));
    }

    function renderWizard() {
      fieldTooltip.hide();
      const step = wizardState.steps[wizardState.step];
      const providerMode = String(getPath(wizardState.draft, "providerMode") || "");
      const visibleFields = step.fields.filter((field) => (!field.providerMode || field.providerMode === providerMode) && (!field.providerModes || field.providerModes.has(providerMode)));
      const stepTitle = !step.providerModes || step.providerModes.has(providerMode) ? step.title : (step.fallbackTitle || step.title);
      elements.wizardStep.textContent = `Step ${wizardState.step + 1} of ${wizardState.steps.length}: ${stepTitle}`;
      elements.wizardForm.replaceChildren(...visibleFields.map(createField));
      populateWizardModelSuggestions(false);
      elements.wizardPreview.textContent = JSON.stringify(schema.previewDraft(wizardState.kind, wizardState.draft), null, 2);
      elements.wizardBack.hidden = wizardState.step === 0;
      elements.wizardNext.hidden = wizardState.step === wizardState.steps.length - 1;
      elements.wizardSave.hidden = wizardState.step !== wizardState.steps.length - 1;
      setStatus(elements.wizardStatus, "");
    }

    function openWizard(kind, index = -1) {
      const entries = kind === "profile" ? profiles : routes;
      const source = index >= 0 ? entries[index] : {};
      wizardState = { kind, index, draft: schema.createDraft(kind, source), step: 0, steps: kind === "profile" ? profileSteps() : routeSteps() };
      elements.wizardTitle.textContent = `${index >= 0 ? "Edit" : "Create"} ${kind === "profile" ? "connection profile" : "provider route"}`;
      elements.wizardSave.textContent = index >= 0 ? "Save changes" : "Create entry";
      renderWizard();
      elements.wizard.style.display = "flex";
      elements.wizard.setAttribute("aria-hidden", "false");
      window.setTimeout(() => elements.wizardForm.querySelector("input, select, textarea")?.focus?.(), 0);
    }

    function closeWizard() {
      fieldTooltip.hide();
      elements.wizard.style.display = "none";
      elements.wizard.setAttribute("aria-hidden", "true");
      wizardState = null;
      setStatus(elements.wizardStatus, "");
    }

    function moveWizard(direction) {
      commitStep();
      wizardState.step = Math.max(0, Math.min(wizardState.steps.length - 1, wizardState.step + direction));
      renderWizard();
    }

    function saveWizard() {
      try {
        commitStep();
        const entries = wizardState.kind === "profile" ? profiles : routes;
        const entry = schema.finalizeDraft(wizardState.kind, wizardState.draft);
        const error = schema.validateEntry(wizardState.kind, entry, entries, wizardState.index, profiles);
        if (error) throw new Error(error);
        if (wizardState.index >= 0) {
          const previousId = entries[wizardState.index]?.id || "";
          entries[wizardState.index] = entry;
          if (previousId && previousId !== entry.id && wizardState.kind === "profile") {
            routes = routes.map((route) => route.profileId === previousId ? { ...route, profileId: entry.id } : route);
          }
          if (previousId && previousId !== entry.id && wizardState.kind === "route") {
            routes = routes.map((route) => ({ ...route, fallbacks: (route.fallbacks || []).map((fallback) => fallback === previousId ? entry.id : fallback) }));
          }
        } else entries.push(entry);
        syncInputs();
        renderAll();
        closeWizard();
        setStatus(elements.status, "Changes are ready. Save settings to persist them.");
      } catch (error) { setStatus(elements.wizardStatus, error?.message || String(error), true); }
    }

    function openJsonEditor(kind) {
      jsonState = { kind, original: kind === "profile" ? elements.profileInput.value : elements.routeInput.value };
      elements.jsonTitle.textContent = kind === "profile" ? "Edit connection profiles JSON" : "Edit provider routes JSON";
      elements.profileJsonField.hidden = kind !== "profile";
      elements.routeJsonField.hidden = kind !== "route";
      setStatus(elements.jsonStatus, "");
      elements.jsonModal.style.display = "flex";
      elements.jsonModal.setAttribute("aria-hidden", "false");
    }

    function closeJsonEditor(revert = false) {
      if (revert && jsonState) {
        const input = jsonState.kind === "profile" ? elements.profileInput : elements.routeInput;
        input.value = jsonState.original;
      }
      elements.jsonModal.style.display = "none";
      elements.jsonModal.setAttribute("aria-hidden", "true");
      jsonState = null;
      setStatus(elements.jsonStatus, "");
    }

    function saveJsonEditor() {
      try {
        const input = jsonState.kind === "profile" ? elements.profileInput : elements.routeInput;
        const values = parseArray(input, jsonState.kind === "profile" ? "Connection profiles" : "Provider routes");
        if (jsonState.kind === "profile") {
          profiles = values.map(schema.normalizeProfile);
          profileForm.refresh();
        }
        else routes = values.map(schema.normalizeRoute);
        syncInputs();
        renderAll();
        closeJsonEditor(false);
        setStatus(elements.status, "JSON changes loaded into the tables. Save settings to persist them.");
      } catch (error) { setStatus(elements.jsonStatus, error?.message || String(error), true); }
    }

    elements.profileAdd?.addEventListener("click", profileForm.save);
    elements.profileCancel?.addEventListener("click", profileForm.clear);
    elements.routeAdd?.addEventListener("click", () => openWizard("route"));
    elements.profileJson?.addEventListener("click", () => openJsonEditor("profile"));
    elements.routeJson?.addEventListener("click", () => openJsonEditor("route"));
    elements.wizardClose?.addEventListener("click", closeWizard);
    elements.wizardCancel?.addEventListener("click", closeWizard);
    elements.wizardBack?.addEventListener("click", () => moveWizard(-1));
    elements.wizardNext?.addEventListener("click", () => moveWizard(1));
    elements.wizardSave?.addEventListener("click", saveWizard);
    elements.jsonClose?.addEventListener("click", () => closeJsonEditor(true));
    elements.jsonCancel?.addEventListener("click", () => closeJsonEditor(true));
    elements.jsonSave?.addEventListener("click", saveJsonEditor);
    elements.wizardForm?.addEventListener("input", () => {
      if (!wizardState) return;
      commitStep();
      elements.wizardPreview.textContent = JSON.stringify(schema.previewDraft(wizardState.kind, wizardState.draft), null, 2);
    });
    elements.wizardForm?.addEventListener("change", (event) => {
      if (!wizardState || event.target?.dataset?.entryField !== "providerMode") return;
      commitStep();
      populateWizardModelSuggestions(true);
      commitStep();
      elements.wizardPreview.textContent = JSON.stringify(schema.previewDraft(wizardState.kind, wizardState.draft), null, 2);
    });
    elements.wizard?.addEventListener("click", (event) => { if (event.target === elements.wizard) closeWizard(); });
    elements.jsonModal?.addEventListener("click", (event) => { if (event.target === elements.jsonModal) closeJsonEditor(true); });
    for (const modal of [elements.wizard, elements.jsonModal]) {
      modal?.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (modal === elements.wizard) closeWizard();
        else closeJsonEditor(true);
      });
    }

    refresh();
    const api = {
      refresh,
      getPrimaryConnectionForSave() {
        return profileForm.getPrimaryConnectionForSave();
      }
    };
    app.registerModule("aiCompanionConnectionSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiConnectionSettings = registerMarkdownViewerAiConnectionSettings;
})(window, document);
