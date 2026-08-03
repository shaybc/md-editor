(function(global) {
  "use strict";

  /** Owns the accessible three-step New Project wizard and delegates all business work. */
  function registerMarkdownViewerNewProjectDialog(app, deps = {}) {
    const catalog = deps.catalog;
    const specificationApi = deps.specification;
    const scaffolder = deps.scaffolder;
    const modal = document.getElementById("new-project-modal");
    const command = document.querySelector(".new-project-button");
    const projectNameInput = document.getElementById("new-project-name");
    const parentInput = document.getElementById("new-project-parent");
    const parentBrowseButton = document.getElementById("new-project-parent-browse");
    const languageInput = document.getElementById("new-project-language");
    const computedPath = document.getElementById("new-project-path");
    const settingsHost = document.getElementById("new-project-language-fields");
    const reviewList = document.getElementById("new-project-review-list");
    const reviewReferences = document.getElementById("new-project-review-references");
    const initializeGitInput = document.getElementById("new-project-initialize-git");
    const errorElement = document.getElementById("new-project-error");
    const cancelButton = document.getElementById("new-project-cancel");
    const backButton = document.getElementById("new-project-back");
    const nextButton = document.getElementById("new-project-next");
    const createButton = document.getElementById("new-project-create");
    const steps = Array.from(modal?.querySelectorAll?.("[data-new-project-step]") || []);
    const indicators = Array.from(modal?.querySelectorAll?.("[data-new-project-step-indicator]") || []);
    let draft = catalog?.createDraft?.() || {};
    let currentStep = 1;
    let prepared = null;
    let normalizedSpecification = null;
    let busy = false;
    let opening = false;
    let previouslyFocused = null;

    function setError(message) {
      if (!errorElement) return;
      errorElement.textContent = message || "";
      errorElement.hidden = !message;
    }

    function isVisibleField(field) {
      return specificationApi.isFieldVisible(field, draft);
    }

    function createOption(value, label) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }

    function getJdkOptions() {
      const entries = deps.jdkRegistry?.list?.() || [];
      return entries.length
        ? entries.map((entry) => [entry.id, `${entry.name}${entry.feature ? ` (Java ${entry.feature})` : ""}`, entry])
        : [["", "No configured JDKs", null]];
    }

    /** Select the newest configured JDK for a fresh Java project draft. */
    function applyDefaultProjectJdk(targetDraft) {
      if (targetDraft.language !== "java" || targetDraft.projectJdkId) return targetDraft;
      const selected = (deps.jdkRegistry?.list?.() || [])
        .filter((entry) => entry?.id)
        .slice()
        .sort((left, right) => (
          (Number(right.feature) || 0) - (Number(left.feature) || 0)
          || String(left.name || left.id).localeCompare(String(right.name || right.id))
        ))[0];
      if (!selected) return targetDraft;
      targetDraft.projectJdkId = selected.id;
      targetDraft.projectJdkFeature = Number(selected.feature) || 0;
      targetDraft.projectJdkName = selected.name || "";
      return targetDraft;
    }

    /** Create a language draft with defaults that depend on configured application runtimes. */
    function createDraftWithEnvironmentDefaults(language) {
      return applyDefaultProjectJdk(catalog.createDraft(language));
    }

    function getGradleOptions() {
      const installations = deps.getGradleInstallations?.() || [];
      return [["built-in", "Built-in Gradle", { id: "built-in", version: deps.getBuiltInGradleVersion?.() || "" }]]
        .concat(installations.map((entry) => [entry.id, `${entry.name || entry.path}${entry.version ? ` (${entry.version})` : ""}`, entry]));
    }

    function renderSelect(field, options) {
      const input = document.createElement("select");
      input.className = "rename-modal-input";
      input.id = `new-project-field-${field.id}`;
      options.forEach(([value, label]) => input.appendChild(createOption(value, label)));
      input.value = String(draft[field.id] ?? "");
      return input;
    }

    function renderInput(field) {
      let input;
      if (field.type === "select") input = renderSelect(field, field.options || []);
      else if (field.type === "jdk") input = renderSelect(field, getJdkOptions());
      else if (field.type === "gradle") input = renderSelect(field, getGradleOptions());
      else if (field.type === "multiline") {
        input = document.createElement("textarea");
        input.className = "rename-modal-input new-project-textarea";
        input.rows = 3;
        input.id = `new-project-field-${field.id}`;
        input.value = Array.isArray(draft[field.id]) ? draft[field.id].join("\n") : String(draft[field.id] || "");
      } else {
        input = document.createElement("input");
        input.className = field.type === "checkbox" ? "settings-switch-input" : "rename-modal-input";
        input.type = field.type === "checkbox" ? "checkbox" : "text";
        input.id = `new-project-field-${field.id}`;
        if (field.type === "checkbox") input.checked = draft[field.id] === true;
        else input.value = String(draft[field.id] ?? "");
      }
      input.required = field.required === true;
      input.addEventListener("change", () => {
        draft[field.id] = field.type === "checkbox" ? input.checked : input.value;
        if (field.type === "jdk") {
          const selected = getJdkOptions().find(([id]) => id === input.value)?.[2];
          draft.projectJdkFeature = selected?.feature || 0;
          draft.projectJdkName = selected?.name || "";
        }
        if (field.type === "gradle") {
          const selected = getGradleOptions().find(([id]) => id === input.value)?.[2];
          draft.gradleVersion = selected?.version || "";
        }
        renderLanguageFields();
      });
      return input;
    }

    function renderLanguageFields() {
      if (!settingsHost) return;
      settingsHost.textContent = "";
      const template = catalog.get(draft.language);
      template.fields.filter(isVisibleField).forEach((field) => {
        const row = document.createElement("label");
        row.className = field.type === "checkbox" ? "new-project-checkbox-field" : "settings-field";
        row.htmlFor = `new-project-field-${field.id}`;
        const label = document.createElement("span");
        label.className = "settings-field-label";
        label.textContent = field.label;
        const controlRow = document.createElement("div");
        controlRow.className = "new-project-control-row";
        const input = renderInput(field);
        controlRow.appendChild(input);
        if (field.type === "folder" || field.browse) {
          const browse = document.createElement("button");
          browse.type = "button";
          browse.className = "reset-modal-btn reset-modal-cancel";
          browse.textContent = "Browse...";
          browse.addEventListener("click", async () => {
            let selected;
            if (field.browse === "java-archives") {
              selected = await deps.Neutralino?.os?.showOpenDialog?.("Select classpath JAR or ZIP files", {
                defaultPath: draft.parentDirectory || undefined,
                multiSelections: true,
                filters: [{ name: "Java archives", extensions: ["jar", "zip"] }]
              });
            } else {
              selected = await deps.Neutralino?.os?.showFolderDialog?.(`Select ${field.label}`, { defaultPath: draft.parentDirectory || undefined });
            }
            const selectedPaths = Array.isArray(selected) ? selected : (selected ? [selected] : []);
            if (!selectedPaths.length) return;
            if (field.type === "multiline") {
              const existing = String(draft[field.id] || "").split(/\r?\n/).filter(Boolean);
              draft[field.id] = Array.from(new Set(existing.concat(selectedPaths))).join("\n");
            } else {
              draft[field.id] = selectedPaths[0];
            }
            renderLanguageFields();
          });
          controlRow.appendChild(browse);
        }
        row.append(label, controlRow);
        if (field.help) {
          const help = document.createElement("span");
          help.className = "new-project-help";
          help.textContent = field.help;
          row.appendChild(help);
        }
        settingsHost.appendChild(row);
      });
    }

    function updateComputedPath() {
      draft.projectName = projectNameInput?.value || "";
      draft.parentDirectory = parentInput?.value || "";
      const path = draft.projectName && draft.parentDirectory
        ? specificationApi.joinPath(draft.parentDirectory, draft.projectName)
        : "";
      if (computedPath) computedPath.textContent = path || "Select a parent directory and enter a project name.";
    }

    function setStep(step) {
      currentStep = step;
      steps.forEach((panel) => { panel.hidden = Number(panel.dataset.newProjectStep) !== step; });
      indicators.forEach((indicator) => {
        const active = Number(indicator.dataset.newProjectStepIndicator) === step;
        indicator.classList.toggle("active", active);
        indicator.setAttribute("aria-current", active ? "step" : "false");
      });
      backButton.hidden = step === 1;
      nextButton.hidden = step === 3;
      createButton.hidden = step !== 3;
      setError("");
      const target = modal?.querySelector?.(`[data-new-project-step="${step}"] input, [data-new-project-step="${step}"] select, [data-new-project-step="${step}"] button`);
      window.setTimeout(() => target?.focus?.(), 0);
    }

    function collectLocation() {
      draft.projectName = projectNameInput.value;
      draft.parentDirectory = parentInput.value;
      draft.language = languageInput.value;
    }

    function validateLocation() {
      collectLocation();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(draft.projectName) || draft.projectName === "." || draft.projectName === "..") {
        return "Enter a valid project name.";
      }
      if (!specificationApi.isAbsolutePath(draft.parentDirectory)) return "Select an absolute parent directory.";
      return "";
    }

    function getGenerator(language) {
      return deps.generators?.[language] || null;
    }

    async function prepareReview() {
      const validation = specificationApi.validate(draft);
      if (!validation.valid) throw new Error(validation.error);
      normalizedSpecification = validation.specification;
      if (normalizedSpecification.language === "java") {
        const runtimeValidation = await deps.jdkRegistry?.validate?.(deps.jdkRegistry.resolve(normalizedSpecification.projectJdkId));
        if (!runtimeValidation?.valid) throw new Error("The selected Project JDK is unavailable or incomplete. Configure a valid JDK in Settings.");
        normalizedSpecification.projectJdkFeature = runtimeValidation.runtime.feature;
        normalizedSpecification.projectJdkName = runtimeValidation.runtime.name;
      }
      const generator = getGenerator(normalizedSpecification.language);
      if (!generator) throw new Error("No generator is registered for the selected language.");
      const generated = generator.createManifest(normalizedSpecification);
      prepared = await scaffolder.prepare(normalizedSpecification, generated);
      reviewList.textContent = "";
      appendReviewGroup("Folders", prepared.directories.map((path) => `${path}/`), "folder");
      appendReviewGroup("Files", prepared.files.map((entry) => entry.path), "file");
      const references = [];
      if (normalizedSpecification.language === "java") {
        references.push(...(normalizedSpecification.jarFiles || []), ...(normalizedSpecification.classpathFolders || []));
        if (normalizedSpecification.eclipseSettingsEnabled) references.push(`Eclipse source: ${normalizedSpecification.eclipseSettingsSource}`);
      }
      reviewReferences.hidden = !references.length;
      reviewReferences.textContent = references.length ? `External references:\n${references.join("\n")}` : "";
      initializeGitInput.checked = normalizedSpecification.initializeGit;
    }

    function appendReviewGroup(label, paths, kind) {
      const group = document.createElement("section");
      group.className = "new-project-review-group";
      const heading = document.createElement("h4");
      heading.textContent = `${label} (${paths.length})`;
      const list = document.createElement("ul");
      list.className = "new-project-review-group-list";
      paths.forEach((path) => appendReviewItem(list, path, kind));
      group.append(heading, list);
      reviewList.appendChild(group);
    }

    function appendReviewItem(host, path, kind) {
      const item = document.createElement("li");
      item.dataset.kind = kind;
      const icon = document.createElement("i");
      icon.className = `bi ${kind === "folder" ? "bi-folder2" : "bi-file-earmark"}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = path;
      item.append(icon, label);
      host.appendChild(item);
    }

    function setBusy(value) {
      busy = value;
      modal?.classList.toggle("is-busy", value);
      modal?.setAttribute?.("aria-busy", value ? "true" : "false");
      modal?.querySelectorAll?.("button, input, select, textarea").forEach((control) => { control.disabled = value; });
    }

    async function next() {
      if (currentStep === 1) {
        const error = validateLocation();
        if (error) return setError(error);
        renderLanguageFields();
        setStep(2);
        return;
      }
      try {
        await prepareReview();
        setStep(3);
      } catch (error) {
        setError(error?.message || String(error));
      }
    }

    async function createProject() {
      if (!prepared || !normalizedSpecification || busy) return;
      normalizedSpecification.initializeGit = initializeGitInput.checked;
      setBusy(true);
      setError("");
      let result;
      try {
        result = await scaffolder.create(normalizedSpecification, prepared);
      } catch (error) {
        setError(error?.message || String(error));
        setBusy(false);
        return;
      }
      setBusy(false);
      close();
      try {
        await deps.onCreated?.(result, normalizedSpecification);
      } catch (error) {
        console.error("Project created, but MD-Editor could not open it:", error);
        alert(`Project created at ${result.projectPath}, but it could not be opened: ${error?.message || error}`);
      }
    }

    async function resetDraft() {
      draft = createDraftWithEnvironmentDefaults("java");
      let defaultParent = "";
      try {
        defaultParent = await deps.getDefaultParentDirectory?.() || "";
      } catch (error) {
        console.warn("Unable to resolve the default New Project parent directory:", error);
      }
      draft.parentDirectory = defaultParent;
      projectNameInput.value = draft.projectName;
      parentInput.value = defaultParent;
      languageInput.textContent = "";
      catalog.list().forEach((template) => languageInput.appendChild(createOption(template.id, template.label)));
      languageInput.value = draft.language;
      initializeGitInput.checked = false;
      prepared = null;
      normalizedSpecification = null;
      updateComputedPath();
      renderLanguageFields();
    }

    /** Open a clean New Project wizard. */
    async function open() {
      if (!modal || busy || opening) return;
      opening = true;
      previouslyFocused = document.activeElement;
      try {
        await resetDraft();
        modal.style.display = "flex";
        modal.removeAttribute("hidden");
        setStep(1);
      } finally {
        opening = false;
      }
    }

    function close() {
      if (!modal || busy) return;
      modal.style.display = "none";
      modal.setAttribute("hidden", "");
      setError("");
      previouslyFocused?.focus?.();
    }

    function trapFocus(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"))
        .filter((element) => !element.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    projectNameInput?.addEventListener("input", updateComputedPath);
    parentInput?.addEventListener("input", updateComputedPath);
    parentBrowseButton?.addEventListener("click", async () => {
      const selected = await deps.Neutralino?.os?.showFolderDialog?.("Select project parent directory");
      if (!selected) return;
      parentInput.value = selected;
      updateComputedPath();
    });
    languageInput?.addEventListener("change", () => {
      const commonValues = { projectName: projectNameInput.value, parentDirectory: parentInput.value, initializeGit: initializeGitInput.checked };
      draft = { ...createDraftWithEnvironmentDefaults(languageInput.value), ...commonValues };
      updateComputedPath();
    });
    initializeGitInput?.addEventListener("change", () => {
      draft.initializeGit = initializeGitInput.checked;
      if (normalizedSpecification) normalizedSpecification.initializeGit = draft.initializeGit;
    });
    command?.addEventListener("click", open);
    cancelButton?.addEventListener("click", close);
    backButton?.addEventListener("click", () => setStep(Math.max(1, currentStep - 1)));
    nextButton?.addEventListener("click", next);
    createButton?.addEventListener("click", createProject);
    modal?.addEventListener("keydown", trapFocus);

    const api = { close, open };
    app?.registerModule?.("newProjectDialog", api);
    return api;
  }

  global.registerMarkdownViewerNewProjectDialog = registerMarkdownViewerNewProjectDialog;
})(typeof window !== "undefined" ? window : globalThis);
