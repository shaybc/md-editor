(function(global) {
  "use strict";

  /** Own the three-page Generate Javadoc wizard UI. */
  function registerMarkdownViewerJavadocWizard(app, deps = {}) {
    const modal = document.getElementById("project-documentation-modal");
    const pageTitle = document.getElementById("project-documentation-page-title");
    const pageDescription = document.getElementById("project-documentation-page-description");
    const pages = Array.from(document.querySelectorAll("[data-javadoc-page]"));
    const backButton = document.getElementById("project-documentation-back");
    const nextButton = document.getElementById("project-documentation-next");
    const finishButton = document.getElementById("project-documentation-confirm");
    const cancelButton = document.getElementById("project-documentation-cancel");
    const sourceList = document.getElementById("project-documentation-source-list");
    const sourceToggleRow = document.getElementById("project-documentation-source-toggle-row");
    const sourceToggle = document.getElementById("project-documentation-source-toggle");
    const linkList = document.getElementById("project-documentation-link-list");
    const errorElement = document.getElementById("project-documentation-error");
    const mavenOptionsRow = document.getElementById("project-documentation-maven-options-row");
    const mavenOptionsButton = document.getElementById("project-documentation-open-maven-options");
    const mavenOptionsSummary = document.getElementById("project-documentation-maven-options-summary");
    const mavenOptionsModal = document.getElementById("project-documentation-maven-options-modal");
    const mavenOptionsHost = document.getElementById("project-documentation-maven-options-host");
    const mavenOptionsApplyButton = document.getElementById("project-documentation-maven-options-apply");
    const mavenOptionsCancelButton = document.getElementById("project-documentation-maven-options-cancel");
    const mavenOptionsError = document.getElementById("project-documentation-maven-options-error");
    let pageIndex = 0;
    let draft = null;
    let resolver = null;
    let mavenOptionsController = null;

    const pageCopy = [
      ["Javadoc Generation", "Select types for Javadoc generation."],
      ["Javadoc Generation", "Configure Javadoc arguments for standard doclet."],
      ["Javadoc Generation", "Configure Javadoc arguments."]
    ];

    function field(id) {
      return document.getElementById(id);
    }

    function setValue(id, value) {
      const element = field(id);
      if (!element) return;
      if (element.type === "checkbox" || element.type === "radio") element.checked = value === true || element.value === value;
      else element.value = value == null ? "" : String(value);
    }

    function getValue(id) {
      const element = field(id);
      if (!element) return "";
      if (element.type === "checkbox") return element.checked;
      return element.value;
    }

    function setError(message) {
      if (!errorElement) return;
      errorElement.textContent = message || "";
      errorElement.hidden = !message;
    }
    function normalizeMavenOptions(value) {
      const source = value && typeof value === "object" ? value : {};
      return {
        invocationValues: source.invocationValues && typeof source.invocationValues === "object" ? Object.assign({}, source.invocationValues) : {},
        advancedArguments: String(source.advancedArguments || ""),
        persistedConfiguration: source.persistedConfiguration && typeof source.persistedConfiguration === "object" ? Object.assign({}, source.persistedConfiguration) : {},
        arguments: Array.isArray(source.arguments) ? source.arguments.map((argument) => String(argument || "").trim()).filter(Boolean) : []
      };
    }

    function isMavenMode() {
      return draft?.mode === "maven" && draft.mavenProject?.hasPom === true && deps.mavenBuildOptions?.createSession && deps.mavenBuildOptions?.mount;
    }

    function summarizeMavenOptions() {
      const options = normalizeMavenOptions(draft?.settings?.mavenOptions);
      const selectedOptions = Object.values(options.invocationValues).filter((value) => value === true).length;
      const parts = [];
      if (selectedOptions) parts.push(`${selectedOptions} Maven option(s) selected`);
      if (options.advancedArguments) parts.push("Advanced Maven arguments set");
      return parts.length ? parts.join("; ") : "No Maven options selected.";
    }

    function renderMavenOptionsLauncher() {
      const visible = isMavenMode();
      if (mavenOptionsRow) mavenOptionsRow.hidden = !visible;
      if (mavenOptionsButton) mavenOptionsButton.disabled = !visible;
      if (mavenOptionsSummary) mavenOptionsSummary.textContent = visible ? summarizeMavenOptions() : "";
    }

    function setMavenOptionsError(message) {
      if (!mavenOptionsError) return;
      mavenOptionsError.textContent = message || "";
      mavenOptionsError.hidden = !message;
    }

    function destroyMavenOptionsController() {
      mavenOptionsController?.destroy?.();
      mavenOptionsController = null;
      if (mavenOptionsHost) mavenOptionsHost.textContent = "";
    }

    function closeMavenOptionsDialog() {
      destroyMavenOptionsController();
      if (mavenOptionsModal) mavenOptionsModal.style.display = "none";
      setMavenOptionsError("");
    }

    function updateMavenOptionsDialogState() {
      const resolved = mavenOptionsController?.resolve?.();
      const valid = resolved?.valid !== false;
      if (mavenOptionsApplyButton) mavenOptionsApplyButton.disabled = !valid;
      setMavenOptionsError(valid ? "" : "Resolve Maven option errors before applying.");
    }

    async function openMavenOptionsDialog() {
      if (!isMavenMode() || !mavenOptionsModal || !mavenOptionsHost) return;
      collectSettings();
      destroyMavenOptionsController();
      const mavenOptions = normalizeMavenOptions(draft.settings.mavenOptions);
      const persistedMavenOptions = Object.keys(mavenOptions.persistedConfiguration).length
        ? mavenOptions.persistedConfiguration
        : draft.mavenConfiguration || {};
      const session = await deps.mavenBuildOptions.createSession({
        context: {
          projectRoot: draft.mavenProject.projectRoot,
          pomPath: draft.mavenProject.pomPath,
          runner: draft.mavenProject.runner
        },
        persistedConfiguration: persistedMavenOptions,
        invocationValues: mavenOptions.invocationValues,
        advancedArguments: mavenOptions.advancedArguments
      });
      mavenOptionsController = deps.mavenBuildOptions.mount(mavenOptionsHost, session, {
        onChange: updateMavenOptionsDialogState
      });
      updateMavenOptionsDialogState();
      mavenOptionsModal.style.display = "flex";
    }
    function isProjectScope() {
      return draft?.scope === "project";
    }

    function isFolderScope() {
      return draft?.scope === "folder";
    }

    function selectAllSourceEntries() {
      for (const entry of draft?.sourceEntries || []) {
        entry.checked = true;
        entry.selectedFiles = (entry.files || []).slice();
      }
    }

    function setAllSourceEntries(selected) {
      for (const entry of draft?.sourceEntries || []) {
        entry.checked = selected === true;
        entry.selectedFiles = selected === true ? (entry.files || []).slice() : [];
      }
    }

    function updateSourceToggle() {
      if (!sourceToggle || !sourceToggleRow) return;
      const entries = draft?.sourceEntries || [];
      const visible = isFolderScope() && entries.length > 0;
      sourceToggleRow.hidden = !visible;
      sourceToggle.disabled = !visible;
      if (!visible) {
        sourceToggle.checked = false;
        sourceToggle.indeterminate = false;
        return;
      }
      const selectedCount = entries.filter((entry) => entry.checked === true).length;
      sourceToggle.checked = selectedCount === entries.length;
      sourceToggle.indeterminate = selectedCount > 0 && selectedCount < entries.length;
    }
    function getSourceRootsForCurrentScope() {
      if (isProjectScope()) selectAllSourceEntries();
      return deps.sourceSelection.getSelectedRoots(draft.sourceEntries);
    }

    function renderSources() {
      if (!sourceList) return;
      sourceList.textContent = "";
      if (isProjectScope()) selectAllSourceEntries();
      updateSourceToggle();
      for (const entry of draft.sourceEntries || []) {
        const label = document.createElement("label");
        label.className = "java-rebuild-check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = entry.checked === true;
        input.disabled = isProjectScope();
        input.addEventListener("change", () => {
          if (isProjectScope()) return;
          entry.checked = input.checked;
          entry.selectedFiles = input.checked ? (entry.selectedFiles?.length ? entry.selectedFiles : entry.files || []) : [];
          updateSourceToggle();
        });
        const text = document.createElement("span");
        const fileCount = entry.selectedFiles?.length || entry.files?.length || 0;
        const fileSummary = fileCount ? `${fileCount} file(s)` : "files collected after Finish";
        text.textContent = `${entry.label || entry.path} (${fileSummary})`;
        text.title = entry.path;
        label.append(input, text);
        sourceList.appendChild(label);
      }
    }

    function renderLinks() {
      if (!linkList) return;
      linkList.textContent = "";
      const links = draft.settings.links || [];
      if (!links.length) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = "No referenced API links configured.";
        linkList.appendChild(empty);
        return;
      }
      links.forEach((link, index) => {
        const row = document.createElement("div");
        row.className = "java-build-path-row";
        const label = document.createElement("span");
        label.className = "java-build-path-row-label";
        label.textContent = link;
        label.title = link;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "reset-modal-btn reset-modal-cancel java-build-path-remove";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          links.splice(index, 1);
          renderLinks();
        });
        row.append(label, remove);
        linkList.appendChild(row);
      });
    }

    function renderPage() {
      const copy = pageCopy[pageIndex] || pageCopy[0];
      if (pageTitle) pageTitle.textContent = copy[0];
      if (pageDescription) pageDescription.textContent = copy[1];
      pages.forEach((page, index) => { page.hidden = index !== pageIndex; });
      if (backButton) backButton.disabled = pageIndex === 0;
      if (nextButton) nextButton.disabled = pageIndex === pages.length - 1;
      renderSources();
      renderLinks();
      renderMavenOptionsLauncher();
    }

    function renderSettings() {
      const settings = draft.settings;
      setValue("project-documentation-command", settings.javadocCommand);
      setValue("project-documentation-scope", draft.scope);
      document.querySelectorAll("[name='project-documentation-visibility']").forEach((input) => { input.checked = input.value === settings.visibility; });
      document.querySelectorAll("[name='project-documentation-doclet']").forEach((input) => { input.checked = input.value === settings.doclet; });
      setValue("project-documentation-destination", settings.destination);
      setValue("project-documentation-doclet-name", settings.customDocletName);
      setValue("project-documentation-doclet-classpath", settings.customDocletClassPath);
      setValue("project-documentation-title-enabled", settings.documentTitleEnabled);
      setValue("project-documentation-title-input", settings.documentTitle);
      ["use-page", "hierarchy-tree", "navigator-bar", "index", "split-index", "author", "version", "deprecated", "deprecated-list", "stylesheet-enabled", "overview-enabled", "open-index"].forEach((id) => {
        const key = id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        setValue(`project-documentation-${id}`, settings[key]);
      });
      setValue("project-documentation-stylesheet", settings.stylesheetPath);
      setValue("project-documentation-overview", settings.overviewPath);
      setValue("project-documentation-vm-options", settings.vmOptions);
      setValue("project-documentation-extra-options", settings.extraOptions);
      setValue("project-documentation-source-compatibility", settings.sourceCompatibility);
      renderPage();
    }

    function collectSettings() {
      const settings = draft.settings;
      settings.javadocCommand = getValue("project-documentation-command") || "javadoc";
      settings.visibility = document.querySelector("[name='project-documentation-visibility']:checked")?.value || "public";
      settings.doclet = document.querySelector("[name='project-documentation-doclet']:checked")?.value || "standard";
      settings.destination = getValue("project-documentation-destination");
      settings.customDocletName = getValue("project-documentation-doclet-name");
      settings.customDocletClassPath = getValue("project-documentation-doclet-classpath");
      settings.documentTitleEnabled = getValue("project-documentation-title-enabled") === true;
      settings.documentTitle = getValue("project-documentation-title-input");
      ["use-page", "hierarchy-tree", "navigator-bar", "index", "split-index", "author", "version", "deprecated", "deprecated-list", "stylesheet-enabled", "overview-enabled", "open-index"].forEach((id) => {
        const key = id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        settings[key] = getValue(`project-documentation-${id}`) === true;
      });
      settings.stylesheetPath = getValue("project-documentation-stylesheet");
      settings.overviewPath = getValue("project-documentation-overview");
      settings.vmOptions = getValue("project-documentation-vm-options");
      settings.extraOptions = getValue("project-documentation-extra-options");
      settings.mavenOptions = normalizeMavenOptions(settings.mavenOptions);
      settings.sourceCompatibility = getValue("project-documentation-source-compatibility");
      draft.scope = getValue("project-documentation-scope") || draft.scope || "project";
      if (isProjectScope()) selectAllSourceEntries();
      return settings;
    }

    function validate() {
      collectSettings();
      if (!draft.settings.destination) return "Choose a Javadoc destination folder.";
      if (!getSourceRootsForCurrentScope().length) return "Select at least one source root for Javadoc generation.";
      if (draft.settings.doclet === "custom" && !draft.settings.customDocletName) return "Enter a custom doclet name.";
      return "";
    }

    function finish(value) {
      if (modal) modal.style.display = "none";
      const done = resolver;
      resolver = null;
      done?.(value);
    }

    async function openDialog(options = {}) {
      if (!modal) throw new Error("The Generate Documentation wizard is unavailable.");
      draft = {
        scope: options.selection?.scope || "project",
        sourceEntries: (options.selection?.roots || []).map((entry) => Object.assign({}, entry)),
        projectPath: options.projectPath || "",
        mode: options.mode || "javac",
        mavenProject: options.mavenProject || null,
        mavenConfiguration: options.mavenConfiguration || {},
        settings: Object.assign({}, options.settings || {})
      };
      pageIndex = 0;
      setError("");
      renderSettings();
      modal.style.display = "flex";
      field("project-documentation-command")?.focus();
      return new Promise((resolve) => { resolver = resolve; });
    }

    backButton?.addEventListener("click", () => {
      collectSettings();
      pageIndex = Math.max(0, pageIndex - 1);
      setError("");
      renderPage();
    });
    nextButton?.addEventListener("click", () => {
      collectSettings();
      pageIndex = Math.min(pages.length - 1, pageIndex + 1);
      setError("");
      renderPage();
    });
    finishButton?.addEventListener("click", () => {
      const error = validate();
      if (error) return setError(error);
      finish({
        scope: draft.scope,
        sourceRoots: getSourceRootsForCurrentScope(),
        settings: draft.settings,
        mavenOptions: normalizeMavenOptions(draft.settings.mavenOptions)
      });
    });
    cancelButton?.addEventListener("click", () => finish(null));
    modal?.addEventListener("click", (event) => { if (event.target === modal) finish(null); });
    field("project-documentation-add-link")?.addEventListener("click", () => {
      const link = String(field("project-documentation-link-input")?.value || "").trim();
      if (!link) return;
      if (!draft.settings.links.includes(link)) draft.settings.links.push(link);
      field("project-documentation-link-input").value = "";
      renderLinks();
    });
    field("project-documentation-browse-destination")?.addEventListener("click", async () => {
      const selected = await deps.Neutralino?.os?.showFolderDialog?.("Select Javadoc destination folder", { defaultPath: draft.settings.destination || draft.projectPath });
      if (selected) field("project-documentation-destination").value = selected;
    });
    sourceToggle?.addEventListener("change", () => {
      if (!isFolderScope()) return;
      setAllSourceEntries(sourceToggle.checked);
      renderSources();
    });
    field("project-documentation-scope")?.addEventListener("change", () => {
      collectSettings();
      setError("");
      renderSources();
    });

    mavenOptionsButton?.addEventListener("click", () => { void openMavenOptionsDialog(); });
    mavenOptionsCancelButton?.addEventListener("click", closeMavenOptionsDialog);
    mavenOptionsModal?.addEventListener("click", (event) => { if (event.target === mavenOptionsModal) closeMavenOptionsDialog(); });
    mavenOptionsApplyButton?.addEventListener("click", () => {
      const resolved = mavenOptionsController?.resolve?.();
      if (!resolved || resolved.valid === false) return updateMavenOptionsDialogState();
      draft.settings.mavenOptions = normalizeMavenOptions({
        invocationValues: resolved.values,
        advancedArguments: resolved.advancedArgumentsRaw,
        persistedConfiguration: resolved.persistedConfiguration,
        arguments: resolved.arguments
      });
      renderMavenOptionsLauncher();
      closeMavenOptionsDialog();
    });
    const api = { openDialog };
    app.registerModule?.("javadocWizard", api);
    return api;
  }

  global.registerMarkdownViewerJavadocWizard = registerMarkdownViewerJavadocWizard;
})(typeof window !== "undefined" ? window : globalThis);
