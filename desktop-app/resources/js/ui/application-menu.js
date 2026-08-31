(function(global) {
  "use strict";

  /**
   * Own the application-wide desktop menu presentation.
   * @param {object} app Application module registry.
   * @param {object} deps Menu DOM and preference dependencies.
   * @returns {object} Application menu API.
   */
  function registerMarkdownViewerApplicationMenu(app, deps = {}) {
    const hamburgerHost = deps.hamburgerHost || document.querySelector(".header-action-menu");
    const hamburgerMenu = deps.hamburgerMenu || hamburgerHost?.querySelector(".action-menu");
    const fixedMenuHost = deps.fixedMenuHost || document.getElementById("desktop-application-menu");
    const layoutInput = deps.layoutInput || document.getElementById("settings-menu-layout");
    const loadGlobalState = deps.loadGlobalState || function() { return {}; };
    const saveGlobalState = deps.saveGlobalState || function() {};
    const CATEGORY_ORDER = ["file", "edit", "find", "view", "project", "run", "debug", "tools", "settings", "help"];
    const categories = new Map();
    const fileCategoryNodes = [];
    const hamburgerCategoryDividers = new Map();
    let currentLayout = "full";

    function normalizeLayout(value) {
      return value === "hamburger" ? "hamburger" : "full";
    }

    function createDivider() {
      const divider = document.createElement("hr");
      divider.className = "dropdown-divider";
      return divider;
    }

    function createCategory(name, label, iconClass) {
      const wrapper = document.createElement("div");
      wrapper.className = `dropdown-submenu action-menu-submenu application-menu-category application-menu-${name}`;
      wrapper.dataset.applicationMenuCategory = name;

      const toggle = document.createElement("button");
      toggle.className = "dropdown-item action-menu-item dropdown-toggle application-menu-category-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-haspopup", "true");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<i class="bi ${iconClass} me-2" aria-hidden="true"></i><span>${label}</span>`;

      const content = document.createElement("div");
      content.className = "dropdown-menu action-submenu application-menu-category-content";
      content.setAttribute("aria-label", `${label} commands`);
      wrapper.append(toggle, content);
      return { wrapper, toggle, content };
    }

    function adoptExistingCategory(name, selector) {
      const wrapper = hamburgerMenu?.querySelector(selector);
      if (!wrapper) return null;
      const precedingDivider = wrapper.previousElementSibling;
      if (precedingDivider?.matches(".dropdown-divider")) hamburgerCategoryDividers.set(name, precedingDivider);
      wrapper.classList.add("application-menu-category", `application-menu-${name}`);
      wrapper.dataset.applicationMenuCategory = name;
      wrapper.querySelector(":scope > .dropdown-toggle")?.classList.add("application-menu-category-toggle");
      wrapper.querySelector(":scope > .action-submenu")?.classList.add("application-menu-category-content");
      return {
        wrapper,
        toggle: wrapper.querySelector(":scope > .dropdown-toggle"),
        content: wrapper.querySelector(":scope > .action-submenu")
      };
    }

    function moveDirectCommand(content, selector) {
      const command = hamburgerMenu?.querySelector(`:scope > ${selector}`);
      if (command) content.appendChild(command);
      return command;
    }

    function appendCommandGroup(content, selectors) {
      const commands = selectors.map((selector) => moveDirectCommand(content, selector)).filter(Boolean);
      if (!commands.length) return;
      if (content.children.length > commands.length) content.insertBefore(createDivider(), commands[0]);
    }

    function buildFileCategory() {
      const category = createCategory("file", "File", "bi-file-earmark");
      appendCommandGroup(category.content, [".new-file-submenu", ".new-project-button"]);
      appendCommandGroup(category.content, ["#import-from-github", "#import-from-file", "#import-from-folder", ".close-folder-button"]);
      appendCommandGroup(category.content, [".recent-files-submenu", ".recent-folders-submenu"]);
      appendCommandGroup(category.content, [".save-current-file-button", ".save-as-file-button", ".save-all-files-button", ".reload-current-file-button", ".diagram-export-submenu", ".image-export-submenu"]);
      appendCommandGroup(category.content, [".exit-app-button"]);
      return category;
    }

    function buildProjectCategory() {
      const category = createCategory("project", "Project", "bi-hammer");
      category.content.innerHTML =
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="java-build-path" disabled aria-disabled="true" title="Configure Java source folders and classpath entries."><i class="bi bi-diagram-3 me-2" aria-hidden="true"></i>Project Settings...</button>' +
        '<hr class="dropdown-divider">' +
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="compile-file" disabled aria-disabled="true" title="Open a supported project and source file to compile it."><i class="bi bi-file-earmark-code me-2" aria-hidden="true"></i>Compile Current File</button>' +
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="rebuild-project" disabled aria-disabled="true" title="Delete generated class files and compile the supported project."><i class="bi bi-hammer me-2" aria-hidden="true"></i><span>Build Project</span><span class="menu-shortcut-label">Ctrl+F9</span></button>' +
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="rebuild-project-last-options" disabled aria-disabled="true" title="Rebuild immediately using the options saved by the last Build Project dialog."><i class="bi bi-arrow-repeat me-2" aria-hidden="true"></i>Rebuild Project</button>' +
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="clean-project" disabled aria-disabled="true" title="Remove generated Java build results and clear build diagnostics."><i class="bi bi-eraser me-2" aria-hidden="true"></i>Clean...</button>' +
        '<button class="dropdown-item action-menu-item project-command" type="button" data-project-command="generate-documentation" disabled aria-disabled="true" title="Generate documentation for a method, file, folder, or project."><i class="bi bi-journal-code me-2" aria-hidden="true"></i>Generate Documentation...</button>' +
        '<div class="dropdown-submenu action-menu-submenu project-helm-submenu"><button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true"><i class="bi bi-boxes me-2" aria-hidden="true"></i>Helm</button><div class="dropdown-menu action-submenu"><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-lint-chart" disabled aria-disabled="true" title="Run helm lint for the active chart."><i class="bi bi-check2-square me-2" aria-hidden="true"></i>Lint Chart</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-template-chart" disabled aria-disabled="true" title="Render the active Helm chart into an unsaved YAML tab."><i class="bi bi-file-earmark-code me-2" aria-hidden="true"></i>Render Chart</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-template-active-file" disabled aria-disabled="true" title="Render only the active Helm template into an unsaved YAML tab."><i class="bi bi-file-code me-2" aria-hidden="true"></i>Render Active Template</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-preview-template" disabled aria-disabled="true" title="Preview the active Helm template in a read-only compare tab."><i class="bi bi-layout-split me-2" aria-hidden="true"></i>Preview Active Template...</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-preview-chart" disabled aria-disabled="true" title="Preview the full Helm chart in a read-only compare tab."><i class="bi bi-window-split me-2" aria-hidden="true"></i>Preview Chart...</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-render-kubernetes-dry-run" disabled aria-disabled="true" title="Render the chart and run a Kubernetes client dry run from the rendered output."><i class="bi bi-shield-check me-2" aria-hidden="true"></i>Render + Client Dry Run</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-render-server-dry-run" disabled aria-disabled="true" title="Render the chart and run a Kubernetes server-side dry run from the rendered output."><i class="bi bi-cloud-check me-2" aria-hidden="true"></i>Render + Server Dry Run</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-show-dependencies" disabled aria-disabled="true" title="Show Helm chart dependencies."><i class="bi bi-list-check me-2" aria-hidden="true"></i>Show Dependencies</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-insert-dependency" disabled aria-disabled="true" title="Open a dependency fragment for Chart.yaml."><i class="bi bi-plus-square me-2" aria-hidden="true"></i>Insert Dependency Fragment</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-dependency-update" disabled aria-disabled="true" title="Update Helm chart dependencies using the installed helm command."><i class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>Dependency Update</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="helm-package-chart" disabled aria-disabled="true" title="Package the active Helm chart."><i class="bi bi-archive me-2" aria-hidden="true"></i>Package Chart</button></div></div>' +
        '<div class="dropdown-submenu action-menu-submenu project-kubernetes-submenu"><button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true"><i class="bi bi-diagram-3 me-2" aria-hidden="true"></i>Kubernetes</button><div class="dropdown-menu action-submenu"><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-dry-run" disabled aria-disabled="true" title="Preview applying the active Kubernetes manifest without changing the cluster."><i class="bi bi-check2-circle me-2" aria-hidden="true"></i>Client Dry Run</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-server-dry-run" disabled aria-disabled="true" title="Validate the active Kubernetes manifest with server-side dry run."><i class="bi bi-shield-check me-2" aria-hidden="true"></i>Server Dry Run</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-diff" disabled aria-disabled="true" title="Show kubectl diff for the active Kubernetes manifest."><i class="bi bi-file-diff me-2" aria-hidden="true"></i>Diff Manifest</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-apply" disabled aria-disabled="true" title="Apply the active Kubernetes manifest with kubectl."><i class="bi bi-cloud-upload me-2" aria-hidden="true"></i>Apply Active Manifest...</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-delete" disabled aria-disabled="true" title="Delete the active Kubernetes manifest with kubectl."><i class="bi bi-trash3 me-2" aria-hidden="true"></i>Delete Active Manifest...</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-explain" disabled aria-disabled="true" title="Explain the selected Kubernetes resource or field with kubectl."><i class="bi bi-question-circle me-2" aria-hidden="true"></i>Explain Resource</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-explain-field" disabled aria-disabled="true" title="Explain the current Kubernetes YAML field path with kubectl."><i class="bi bi-info-circle me-2" aria-hidden="true"></i>Explain Field</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-show-events" disabled aria-disabled="true" title="Show Kubernetes events for the current namespace."><i class="bi bi-activity me-2" aria-hidden="true"></i>Show Events</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-logs" disabled aria-disabled="true" title="Show logs for the selected or active pod reference."><i class="bi bi-card-text me-2" aria-hidden="true"></i>Show Logs</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="kubernetes-follow-logs" disabled aria-disabled="true" title="Follow logs for the selected or active pod reference."><i class="bi bi-terminal me-2" aria-hidden="true"></i>Follow Logs</button></div></div>' +
        '<div class="dropdown-submenu action-menu-submenu project-license-submenu"><button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true"><i class="bi bi-shield-check me-2" aria-hidden="true"></i>License</button><div class="dropdown-menu action-submenu"><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="manage-rat-policy" disabled aria-disabled="true" title="Create or review the Apache RAT policy for this Maven project."><i class="bi bi-sliders me-2" aria-hidden="true"></i>Configure RAT policy...</button><button class="dropdown-item action-menu-item project-command" type="button" data-project-command="manage-rat-licenses" disabled aria-disabled="true" title="Investigate and resolve a reported Apache RAT license finding."><i class="bi bi-exclamation-diamond me-2" aria-hidden="true"></i>RAT Problems Resolver...</button></div></div>';
      return category;
    }

    function buildRunCategory() {
      const category = createCategory("run", "Run", "bi-play-fill");
      category.content.innerHTML = '<div class="run-menu-loading">Loading Run configurations...</div>';
      return category;
    }

    function buildDebugCategory() {
      const category = createCategory("debug", "Debug", "bi-bug-fill");
      category.content.innerHTML = '<div class="debug-menu-loading">Loading debugger commands...</div>';
      return category;
    }

    function buildSettingsCategory() {
      const command = hamburgerMenu?.querySelector(":scope > .open-settings-dialog");
      if (!command) return null;
      const wrapper = document.createElement("div");
      wrapper.className = "application-menu-category application-menu-settings";
      wrapper.dataset.applicationMenuCategory = "settings";
      command.classList.add("application-menu-category-toggle");
      wrapper.appendChild(command);
      return { wrapper, toggle: command, content: null };
    }

    function removeOrphanDividers() {
      hamburgerMenu?.querySelectorAll(":scope > .dropdown-divider").forEach((divider) => divider.remove());
    }

    function prepareCategories() {
      if (!hamburgerMenu || categories.size) return;
      const fileCategory = buildFileCategory();
      categories.set("file", fileCategory);
      fileCategoryNodes.push(...fileCategory.content.children);
      categories.set("edit", adoptExistingCategory("edit", ".edit-menu-submenu"));
      categories.set("find", adoptExistingCategory("find", ".find-menu-submenu"));
      categories.set("view", adoptExistingCategory("view", ".view-menu-submenu"));
      categories.set("project", buildProjectCategory());
      categories.set("run", buildRunCategory());
      categories.set("debug", buildDebugCategory());
      categories.set("tools", adoptExistingCategory("tools", ".tools-menu-submenu"));
      categories.set("settings", buildSettingsCategory());
      categories.set("help", adoptExistingCategory("help", ".help-menu-submenu"));
      removeOrphanDividers();
      CATEGORY_ORDER.forEach((name) => {
        const category = categories.get(name);
        if (category?.wrapper) hamburgerMenu.appendChild(category.wrapper);
      });
    }

    function setCategoryExpanded(category, expanded) {
      category?.toggle?.setAttribute("aria-expanded", expanded ? "true" : "false");
      category?.wrapper?.classList.toggle("open", !!expanded);
    }

    function closeCategories(exceptCategory) {
      categories.forEach((category) => {
        if (category !== exceptCategory) setCategoryExpanded(category, false);
      });
    }

    function switchOpenCategoryOnHover(category) {
      if (currentLayout !== "full") return;
      const hasOpenCategory = Array.from(categories.values()).some((item) => item?.wrapper?.classList.contains("open"));
      if (!hasOpenCategory || category?.wrapper?.classList.contains("open")) return;
      const activeToggle = Array.from(categories.values()).find((item) => item?.toggle === document.activeElement)?.toggle;
      if (activeToggle && activeToggle !== category?.toggle) activeToggle.blur();
      closeCategories(category?.content ? category : null);
      if (category?.content) setCategoryExpanded(category, true);
    }

    function placeSettingsCommand(layout) {
      const settingsCategory = categories.get("settings");
      const fileContent = categories.get("file")?.content;
      if (!settingsCategory?.toggle || !settingsCategory.wrapper || !fileContent) return;
      if (layout !== "full") {
        settingsCategory.wrapper.appendChild(settingsCategory.toggle);
        return;
      }
      const exitCommand = fileContent.querySelector(":scope > .exit-app-button");
      if (!exitCommand) return;
      let exitDivider = exitCommand.previousElementSibling;
      if (!exitDivider?.matches(".dropdown-divider")) {
        exitDivider = createDivider();
        fileContent.insertBefore(exitDivider, exitCommand);
      }
      fileContent.insertBefore(settingsCategory.toggle, exitDivider);
    }

    function placeMenuItems(layout, destination) {
      const fileCategory = categories.get("file");
      const exitIndex = fileCategoryNodes.findIndex((node) => node.matches?.(".exit-app-button"));
      const exitCommand = exitIndex >= 0 ? fileCategoryNodes[exitIndex] : null;
      const exitDivider = exitIndex > 0 && fileCategoryNodes[exitIndex - 1]?.matches?.(".dropdown-divider") ? fileCategoryNodes[exitIndex - 1] : null;

      if (layout === "full") {
        fileCategoryNodes.forEach((node) => fileCategory?.content?.appendChild(node));
      }
      placeSettingsCommand(layout);

      if (layout === "hamburger") {
        fileCategory?.wrapper?.remove();
        fileCategoryNodes.forEach((node) => {
          if (node === exitCommand || node === exitDivider) return;
          destination.appendChild(node);
        });
      }

      CATEGORY_ORDER.forEach((name) => {
        if (layout === "full" && name === "settings") return;
        if (layout === "hamburger" && name === "file") return;
        const wrapper = categories.get(name)?.wrapper;
        const precedingDivider = hamburgerCategoryDividers.get(name);
        if (layout === "hamburger" && precedingDivider) destination.appendChild(precedingDivider);
        if (wrapper) destination.appendChild(wrapper);
      });

      if (layout === "hamburger") {
        if (exitDivider) destination.appendChild(exitDivider);
        if (exitCommand) destination.appendChild(exitCommand);
      }
    }

    function applyLayout(value, options = {}) {
      const layout = normalizeLayout(value);
      const destination = layout === "full" ? fixedMenuHost : hamburgerMenu;
      if (!destination) return currentLayout;
      closeCategories();
      placeMenuItems(layout, destination);
      currentLayout = layout;
      document.documentElement.dataset.desktopMenuLayout = layout;
      hamburgerHost?.classList.toggle("d-none", layout === "full");
      if (fixedMenuHost) fixedMenuHost.hidden = layout !== "full";
      if (layoutInput && layoutInput.value !== layout) layoutInput.value = layout;
      if (options.persist === true) saveGlobalState({ menuLayout: layout });
      return layout;
    }

    function bindCategoryInteractions() {
      categories.forEach((category) => {
        category?.wrapper?.addEventListener("pointerenter", () => switchOpenCategoryOnHover(category));
        if (!category?.content) return;
        category?.toggle?.addEventListener("click", (event) => {
          if (currentLayout !== "full") return;
          event.preventDefault();
          event.stopPropagation();
          const willOpen = !category.wrapper.classList.contains("open");
          closeCategories(willOpen ? category : null);
          setCategoryExpanded(category, willOpen);
        });
        category?.content?.addEventListener("click", (event) => {
          if (currentLayout === "full" && event.target.closest("button:not(.dropdown-toggle)")) closeCategories();
        });
      });
      document.addEventListener("click", () => {
        if (currentLayout === "full") closeCategories();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeCategories();
      });
    }

    function initialize() {
      prepareCategories();
      bindCategoryInteractions();
      applyLayout(loadGlobalState().menuLayout);
      layoutInput?.addEventListener("change", () => applyLayout(layoutInput.value, { persist: true }));
    }

    initialize();

    const api = {
      applyLayout,
      closeCategories,
      normalizeLayout,
      getLayout() {
        return currentLayout;
      },
      getCategory(name) {
        return categories.get(name) || null;
      }
    };
    app.registerModule?.("applicationMenu", api);
    return api;
  }

  global.registerMarkdownViewerApplicationMenu = registerMarkdownViewerApplicationMenu;
})(typeof window !== "undefined" ? window : globalThis);



