(function(global) {
  "use strict";

  /** Render one Maven Build Options session without owning build execution. */
  function registerMarkdownViewerMavenBuildOptionsPanel(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const EFFECTIVE_POM_HELP = "Maven can calculate an effective POM by combining the current pom.xml, parent POMs, pluginManagement, active profiles, inherited defaults, and Maven settings. This is useful when plugin activation or inheritance is unclear. Clicking the Inspect effective Maven configuration link minimizes this dialog, runs Maven help:effective-pom in a read-only terminal so you can watch the output, then restores the dialog and refreshes plugin certainty for this rebuild session. It does not build, package, save, or edit project files.";
    const ADVANCED_ARGUMENTS_HELP = "Advanced Maven arguments are appended to this rebuild command after the checked Build Options. Use this for Maven CLI options such as -Pdev, -pl module-a -am, -T 2C, -o, or -Dname=value. Use the built-in dependency update option for -U. Do not enter Maven goals or lifecycle phases here; the rebuild remains clean package. Values are not saved and apply only to this rebuild.";

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function showHelp(title, message) {
      const notify = deps.notify || app.services?.notify;
      return notify?.alert?.({ title, message });
    }

    function createInfoButton(title, message) {
      const button = createElement("button", "maven-build-option-info", "i");
      button.type = "button";
      button.setAttribute("aria-label", `Learn about ${title}`);
      button.title = `Learn about ${title}`;
      button.addEventListener("click", () => void showHelp(title, message));
      return button;
    }

    function getBadgeTooltip(badge) {
      if (badge === "Verified") return "Maven effective-POM inspection found this plugin in the active build/plugins configuration for this rebuild session.";
      if (badge === "Profile only") return "Static POM inspection found this plugin inside a Maven profile. The skip option matters only if that profile is active.";
      if (badge === "Configured only") return "Static POM inspection found this plugin only in pluginManagement. Maven may not execute it unless a module also declares or inherits it as an active plugin.";
      return "";
    }

    function createBadge(text) {
      const badge = createElement("span", "maven-build-option-badge", text);
      const tooltip = getBadgeTooltip(text);
      if (tooltip) {
        badge.title = tooltip;
        badge.setAttribute("aria-label", `${text}: ${tooltip}`);
      }
      return badge;
    }

    function createEffectivePomHelpRow(onInspectEffectivePom, inspectInProgress) {
      const row = createElement("div", "maven-build-options-help-row");
      const link = createElement("button", "maven-build-options-help-link", "Inspect effective Maven configuration...");
      link.type = "button";
      link.disabled = inspectInProgress === true;
      link.addEventListener("click", () => {
        if (link.disabled) return;
        if (typeof onInspectEffectivePom === "function") void onInspectEffectivePom();
        else void showHelp("Inspect effective Maven configuration", EFFECTIVE_POM_HELP);
      });
      row.append(link, createInfoButton("Inspect effective Maven configuration", EFFECTIVE_POM_HELP));
      return row;
    }

    function createAdvancedArgumentsField(session, resolved, onChange) {
      const section = createElement("div", "maven-build-options-advanced");
      const heading = createElement("div", "maven-build-options-advanced-heading");
      heading.append(
        createElement("label", "maven-build-options-advanced-label", "Advanced Maven arguments"),
        createInfoButton("Advanced Maven arguments", ADVANCED_ARGUMENTS_HELP)
      );
      const input = createElement("input", "maven-build-options-advanced-input");
      input.type = "text";
      input.value = session.getAdvancedArgumentsRaw?.() || "";
      input.placeholder = "Example: -Pdev -pl module-a -am -Dname=value";
      input.setAttribute("aria-label", "Advanced Maven arguments");
      input.addEventListener("input", () => {
        session.setAdvancedArgumentsRaw?.(input.value);
        onChange?.(session.resolve());
        renderMessages(section, session.resolve());
      });
      section.append(heading, input, createElement("p", "maven-build-option-description", "Optional Maven CLI flags for this rebuild only. Goals and lifecycle phases are not allowed here."));
      renderMessages(section, resolved);
      return section;
    }

    function renderMessages(section, resolved) {
      Array.from(section.children || []).filter((child) => child.dataset?.advancedMessage === "true").forEach((child) => child.remove?.());
      const messages = (resolved.errors || []).filter((entry) => entry.optionId === "advanced.maven.arguments")
        .map((entry) => ({ className: "maven-build-option-disabled", message: entry.message }))
        .concat((resolved.warnings || []).filter((entry) => entry.optionId === "advanced.maven.arguments")
          .map((entry) => ({ className: "maven-build-option-warning", message: entry.message })));
      messages.forEach((entry) => {
        const element = createElement("p", entry.className, entry.message);
        element.dataset.advancedMessage = "true";
        section.appendChild(element);
      });
    }

    function captureScrollPositions(element) {
      const positions = [];
      let current = element;
      while (current) {
        const scrollTop = Number(current.scrollTop) || 0;
        const scrollLeft = Number(current.scrollLeft) || 0;
        if (scrollTop || scrollLeft) positions.push({ element: current, scrollTop, scrollLeft });
        current = current.parentElement || current.parentNode || null;
      }
      return positions;
    }

    function restoreScrollPositions(positions) {
      positions.forEach((entry) => {
        entry.element.scrollTop = entry.scrollTop;
        entry.element.scrollLeft = entry.scrollLeft;
      });
    }
    /** Mount the grouped option UI and return its session controller. */
    function mount(host, session, options = {}) {
      if (!host) throw new Error("The Maven Build Options panel host is unavailable.");

      function render(preferredFocusId) {
        const scrollPositions = captureScrollPositions(host);
        const resolved = session.resolve();
        host.replaceChildren();
        const heading = createElement("div", "maven-build-options-heading");
        heading.append(
          createElement("h3", "maven-build-options-title", "Build Options"),
          createInfoButton("Maven Build Options", "Build Options change only the Maven rebuild command shown below. Test choices are remembered for this project. Audit bypasses apply to one rebuild and do not resolve the underlying finding.")
        );
        host.appendChild(heading);
        const dynamicContent = createElement("div", "maven-build-options-dynamic-content");

        const groups = new Map();
        session.definitions.forEach((definition) => {
          if (!groups.has(definition.group.id)) groups.set(definition.group.id, { group: definition.group, options: [] });
          groups.get(definition.group.id).options.push(definition);
        });

        groups.forEach(({ group, options: definitions }) => {
          const fieldset = createElement("fieldset", "maven-build-options-group");
          fieldset.dataset.mavenBuildOptionsGroup = group.id;
          fieldset.appendChild(createElement("legend", "maven-build-options-group-title", group.label));
          definitions.forEach((definition) => {
            const row = createElement("div", "maven-build-option-row");
            row.dataset.mavenBuildOptionId = definition.id;
            const control = createElement("label", "maven-build-option-control");
            const checkbox = createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `maven-build-option-${definition.id.replace(/[^a-z0-9_-]/gi, "-")}`;
            checkbox.checked = session.getValue(definition.id);
            checkbox.disabled = Boolean(definition.disabledReason);
            const label = createElement("span", "maven-build-option-label", definition.label);
            control.append(checkbox, label);
            const badges = Array.isArray(definition.badges) ? definition.badges : (definition.badge ? [definition.badge] : []);
            badges.forEach((badge) => control.appendChild(createBadge(badge)));
            row.append(control, createInfoButton(definition.label, definition.help));
            if (definition.description) row.appendChild(createElement("p", "maven-build-option-description", definition.description));
            if (definition.disabledReason) row.appendChild(createElement("p", "maven-build-option-disabled", definition.disabledReason));
            const warning = resolved.warnings.find((entry) => entry.optionId === definition.id);
            if (warning) row.appendChild(createElement("p", "maven-build-option-warning", warning.message));
            checkbox.addEventListener("change", () => {
              session.setValue(definition.id, checkbox.checked);
              render(checkbox.id);
              options.onChange?.(session.resolve());
            });
            fieldset.appendChild(row);
          });
          if (group.id === "detected-plugins") fieldset.appendChild(createEffectivePomHelpRow(options.onInspectEffectivePom, options.inspectInProgress));
          dynamicContent.appendChild(fieldset);
        });

        if (options.statusMessage) {
          const status = createElement("div", `maven-build-options-status ${options.statusKind === "error" ? "is-error" : "is-info"}`);
          status.setAttribute("role", options.statusKind === "error" ? "alert" : "status");
          status.appendChild(createElement("span", "", options.statusMessage));
          if (options.inspectInProgress && typeof options.onMinimizeTask === "function") {
            const showTerminal = createElement("button", "maven-build-options-status-action", "Show terminal");
            showTerminal.type = "button";
            showTerminal.addEventListener("click", () => options.onMinimizeTask());
            status.appendChild(showTerminal);
          }
          dynamicContent.appendChild(status);
        }
        host.appendChild(dynamicContent);
        host.appendChild(createAdvancedArgumentsField(session, resolved, options.onChange));
        session.providerErrors.forEach((error) => {
          dynamicContent.appendChild(createElement("p", "maven-build-options-provider-error", `Some Build Options are unavailable: ${error.message}`));
        });
        if (resolved.errors.length) {
          const summary = createElement("div", "maven-build-options-errors");
          summary.setAttribute("role", "alert");
          resolved.errors.forEach((error) => summary.appendChild(createElement("p", "", error.message)));
          dynamicContent.appendChild(summary);
        }
        if (preferredFocusId) documentRef.getElementById(preferredFocusId)?.focus?.();
        restoreScrollPositions(scrollPositions);
      }

      render();
      return {
        destroy() { host.replaceChildren(); },
        resolve() { return session.resolve(); },
        setAdvancedArgumentsRaw(value) { const result = session.setAdvancedArgumentsRaw?.(value); render(); return result; },
        setValue(id, value) { const result = session.setValue(id, value); render(); return result; }
      };
    }

    const api = { mount };
    app.registerModule?.("mavenBuildOptionsPanel", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildOptionsPanel = registerMarkdownViewerMavenBuildOptionsPanel;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenBuildOptionsPanel };
})(typeof window !== "undefined" ? window : globalThis);
