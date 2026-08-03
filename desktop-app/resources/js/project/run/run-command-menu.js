// Top-level Run menu state, dynamic saved configurations, and command dispatch.
(function(global) {
  "use strict";

  /**
   * Register the top-level Run menu.
   * @param {object} app Application module registry.
   * @param {object} deps Store, launcher, dialog, and application-menu dependencies.
   * @returns {object} Run menu API.
   */
  function registerMarkdownViewerRunCommandMenu(app, deps = {}) {
    function createFallbackCategory() {
      const wrapper = document.createElement("div");
      wrapper.className = "dropdown-submenu action-menu-submenu application-menu-category application-menu-run";
      wrapper.dataset.applicationMenuCategory = "run";
      wrapper.innerHTML = '<button class="dropdown-item action-menu-item dropdown-toggle application-menu-category-toggle" type="button" aria-haspopup="true" aria-expanded="false"><i class="bi bi-play-fill me-2"></i><span>Run</span></button><div class="dropdown-menu action-submenu application-menu-category-content" aria-label="Run options"></div>';
      const project = document.querySelector(".application-menu-project");
      (project?.parentElement || document.querySelector(".header-action-menu .action-menu"))?.insertBefore(wrapper, project?.nextSibling || null);
      const toggle = wrapper.querySelector(".application-menu-category-toggle");
      toggle.addEventListener("click", (event) => {
        if (deps.applicationMenu?.getLayout?.() !== "full") return;
        event.preventDefault();
        event.stopPropagation();
        wrapper.classList.toggle("open");
        toggle.setAttribute("aria-expanded", wrapper.classList.contains("open") ? "true" : "false");
      });
      return { wrapper, toggle, content: wrapper.querySelector(".application-menu-category-content") };
    }

    const category = deps.applicationMenu?.getCategory?.("run") || createFallbackCategory();
    const content = category?.content;
    if (content && !content.querySelector("[data-run-menu-command]")) {
      content.innerHTML =
        '<button class="dropdown-item action-menu-item" type="button" data-run-menu-command="dialog"><i class="bi bi-play-circle me-2"></i>Run...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-run-menu-command="active"><i class="bi bi-play-fill me-2"></i><span class="run-active-label">Run Active Configuration</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-run-menu-command="configurations"><i class="bi bi-sliders me-2"></i>Run Configurations...</button>' +
        '<hr class="dropdown-divider">' +
        '<button class="dropdown-item action-menu-item" type="button" data-run-menu-command="stop"><i class="bi bi-stop-fill me-2"></i>Stop</button>' +
        '<hr class="dropdown-divider run-saved-divider" hidden>' +
        '<div class="run-saved-configurations" role="group" aria-label="Saved Run configurations"></div>';
    }

    function closeMenu() {
      category?.wrapper?.classList.remove("open");
      category?.toggle?.setAttribute("aria-expanded", "false");
      deps.closeActionMenus?.();
    }

    function runAndClose(action) {
      closeMenu();
      void Promise.resolve(action()).catch((error) => deps.alert?.(error?.message || "The Run command could not be completed."));
    }

    content?.querySelector('[data-run-menu-command="dialog"]')?.addEventListener("click", () => runAndClose(() => deps.dialog.open({ mode: "run" })));
    content?.querySelector('[data-run-menu-command="active"]')?.addEventListener("click", () => runAndClose(() => deps.launcher.runActive()));
    content?.querySelector('[data-run-menu-command="configurations"]')?.addEventListener("click", () => runAndClose(() => deps.dialog.open({ mode: "manage" })));
    content?.querySelector('[data-run-menu-command="stop"]')?.addEventListener("click", () => runAndClose(() => deps.launcher.stopNewest()));

    function render() {
      const snapshot = deps.store.getSnapshot();
      const active = deps.store.getActive();
      const hasProject = Boolean(snapshot.projectPath);
      const activeButton = content?.querySelector('[data-run-menu-command="active"]');
      const activeLabel = activeButton?.querySelector(".run-active-label");
      const dialogButton = content?.querySelector('[data-run-menu-command="dialog"]');
      const configurationsButton = content?.querySelector('[data-run-menu-command="configurations"]');
      const stopButton = content?.querySelector('[data-run-menu-command="stop"]');
      if (dialogButton) dialogButton.disabled = !hasProject;
      if (configurationsButton) configurationsButton.disabled = !hasProject;
      if (activeButton) activeButton.disabled = !active;
      if (activeLabel) activeLabel.textContent = active ? `Run '${active.name}'` : "Run Active Configuration";
      if (stopButton) stopButton.disabled = !deps.launcher.isRunning();

      const host = content?.querySelector(".run-saved-configurations");
      const divider = content?.querySelector(".run-saved-divider");
      if (!host) return;
      host.innerHTML = "";
      snapshot.configurations.forEach((configuration) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-item action-menu-item";
        button.innerHTML = `<i class="bi ${configuration.type === "java-application" ? "bi-cup-hot" : configuration.type === "maven" ? "bi-box" : "bi-layers"} me-2"></i><span></span>`;
        button.querySelector("span").textContent = configuration.name;
        button.addEventListener("click", () => runAndClose(() => deps.launcher.runById(configuration.id)));
        host.appendChild(button);
      });
      if (divider) divider.hidden = snapshot.configurations.length === 0;
    }

    deps.store.subscribe(render);
    deps.launcher.subscribe(render);
    category?.toggle?.addEventListener("mouseenter", render);
    category?.toggle?.addEventListener("focus", render);
    render();

    const api = { render };
    app.registerModule?.("runCommandMenu", api);
    return api;
  }

  global.registerMarkdownViewerRunCommandMenu = registerMarkdownViewerRunCommandMenu;
})(typeof window !== "undefined" ? window : globalThis);
