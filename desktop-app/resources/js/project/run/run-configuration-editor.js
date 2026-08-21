// Right-pane form rendering for Run configuration drafts.
(function(global) {
  "use strict";

  /**
   * Register the Run configuration editor renderer.
   * @param {object} app Application module registry.
   * @returns {object} Run configuration editor API.
   */
  function registerMarkdownViewerRunConfigurationEditor(app) {
    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function field(label, path, value, options = {}) {
      const textarea = options.textarea === true;
      return `<label class="run-configuration-field${options.wide ? " run-configuration-field-wide" : ""}">
        <span>${escapeHtml(label)}</span>
        ${textarea
          ? `<textarea data-run-field="${path}" rows="${options.rows || 2}" placeholder="${escapeHtml(options.placeholder || "")}">${escapeHtml(value)}</textarea>`
          : `<input data-run-field="${path}" type="${options.type || "text"}" value="${escapeHtml(value)}" placeholder="${escapeHtml(options.placeholder || "")}">`}
        <small class="run-configuration-field-error" data-run-error="${path}"></small>
      </label>`;
    }

    function renderEnvironment(environment) {
      const values = environment?.length ? environment : [{ name: "", value: "" }];
      return `<section class="run-configuration-environment">
        <div class="run-configuration-section-heading"><h4>Environment variables</h4><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-environment-add>Add</button></div>
        <p>Values are stored as plain text in <code>.md-editor/run-configurations.json</code>. Do not enter secrets.</p>
        <div data-run-environment-list>${values.map((entry, index) => `
          <div class="run-configuration-environment-row" data-run-environment-row="${index}">
            <input data-run-environment-name="${index}" value="${escapeHtml(entry.name)}" placeholder="NAME" aria-label="Environment variable name">
            <input data-run-environment-value="${index}" value="${escapeHtml(entry.value)}" placeholder="Value" aria-label="Environment variable value">
            <button type="button" class="reset-modal-btn reset-modal-cancel" data-run-environment-remove="${index}" aria-label="Remove environment variable"><i class="bi bi-trash"></i></button>
            <small class="run-configuration-field-error" data-run-error="environment.${index}.name"></small>
          </div>`).join("")}</div>
      </section>`;
    }

    function renderJava(configuration, jdks) {
      const java = configuration.java || {};
      const jdkOptions = [
        '<option value="">Project JDK (default)</option>',
        ...(jdks || []).map((jdk) => `<option value="${escapeHtml(jdk.id)}"${jdk.id === java.jdkId ? " selected" : ""}>${escapeHtml(`${jdk.name} — Java ${jdk.feature || "?"}`)}</option>`)
      ].join("");
      return `<section class="run-configuration-type-fields">
        ${field("Project / module", "java.modulePath", java.modulePath, { placeholder: "Project root" })}
        <label class="run-configuration-field run-configuration-main-class">
          <span>Main class</span>
          <div><input data-run-field="java.mainClass" value="${escapeHtml(java.mainClass)}" placeholder="com.example.Main"><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-main-search>Search...</button></div>
          <small class="run-configuration-field-error" data-run-error="java.mainClass"></small>
        </label>
        ${field("Program arguments", "java.programArguments", java.programArguments, { textarea: true, wide: true })}
        ${field("VM arguments", "java.vmArguments", java.vmArguments, { textarea: true, wide: true, placeholder: "-Xmx512m" })}
        <label class="run-configuration-field"><span>JRE / JDK</span><select data-run-field="java.jdkId">${jdkOptions}</select><small class="run-configuration-field-error" data-run-error="java.jdkId"></small></label>
        ${field("Classpath override", "java.classpathOverride", java.classpathOverride, { textarea: true, wide: true, placeholder: "Leave empty to derive the runtime classpath" })}
        <label class="run-configuration-checkbox"><input data-run-field="buildBeforeRun" type="checkbox"${configuration.buildBeforeRun !== false ? " checked" : ""}> Build before run</label>
      </section>`;
    }

    function renderMaven(configuration) {
      const maven = configuration.maven || {};
      return `<section class="run-configuration-type-fields">
        ${field("Command line / goals", "maven.commandLine", maven.commandLine, { textarea: true, wide: true, placeholder: "clean package or spring-boot:run" })}
        ${field("Profiles", "maven.profiles", maven.profiles, { wide: true, placeholder: "dev -Pproduction" })}
        <small class="run-configuration-field-error run-configuration-banner" data-run-error="maven.project"></small>
      </section>`;
    }

    function renderGradle(configuration) {
      const gradle = configuration.gradle || {};
      return `<section class="run-configuration-type-fields">
        ${field("Tasks and arguments", "gradle.tasks", gradle.tasks, { textarea: true, wide: true, placeholder: "bootRun or run --args='value'" })}
        ${field("Gradle project", "gradle.projectPath", gradle.projectPath, { wide: true, placeholder: "Subproject path, for example app" })}
        <label class="run-configuration-checkbox"><input data-run-field="gradle.offline" type="checkbox"${gradle.offline ? " checked" : ""}> Work offline</label>
        <small class="run-configuration-field-error run-configuration-banner" data-run-error="gradle.project"></small>
        <small class="run-configuration-field-error run-configuration-banner" data-run-error="gradle.runner"></small>
      </section>`;
    }

    function renderDockerCompose(configuration) {
      const dockerCompose = configuration.dockerCompose || {};
      const commandOptions = ["up", "down", "logs"].map((command) => `<option value="${command}"${dockerCompose.command === command ? " selected" : ""}>${command}</option>`).join("");
      return `<section class="run-configuration-type-fields">
        <label class="run-configuration-field"><span>Compose command</span><select data-run-field="dockerCompose.command">${commandOptions}</select><small class="run-configuration-field-error" data-run-error="dockerCompose.command"></small></label>
        ${field("Compose file", "dockerCompose.filePath", dockerCompose.filePath, { wide: true, placeholder: "docker-compose.yml or compose.yml" })}
        ${field("Services", "dockerCompose.services", dockerCompose.services, { wide: true, placeholder: "Optional service names" })}
        <label class="run-configuration-checkbox"><input data-run-field="dockerCompose.detached" type="checkbox"${dockerCompose.detached ? " checked" : ""}> Run up detached</label>
        <label class="run-configuration-checkbox"><input data-run-field="dockerCompose.followLogs" type="checkbox"${dockerCompose.followLogs ? " checked" : ""}> Follow logs</label>
      </section>`;
    }
    function setNestedValue(target, path, value) {
      const parts = String(path).split(".");
      let owner = target;
      while (parts.length > 1) {
        const part = parts.shift();
        owner[part] ||= {};
        owner = owner[part];
      }
      owner[parts[0]] = value;
    }

    /**
     * Render and bind one configuration draft.
     * @param {HTMLElement} host Right-pane host.
     * @param {object} configuration Mutable configuration draft.
     * @param {object} options Render callbacks and registered JDKs.
     * @returns {object} Editor controls API.
     */
    function render(host, configuration, options = {}) {
      if (!host || !configuration) return null;
      const typeLabel = configuration.type === "java-application" ? "Java Application" : configuration.type === "maven" ? "Maven" : configuration.type === "gradle" ? "Gradle" : "Docker Compose";
      host.innerHTML = `<div class="run-configuration-editor-heading"><div><span>${typeLabel}</span><h3>${escapeHtml(configuration.name || "New Configuration")}</h3></div></div>
        <div class="run-configuration-form">
          ${field("Name", "name", configuration.name, { wide: true })}
          ${field("Working directory", "workingDirectory", configuration.workingDirectory, { wide: true, placeholder: "Project or module root" })}
          ${configuration.type === "java-application" ? renderJava(configuration, options.jdks) : configuration.type === "maven" ? renderMaven(configuration) : configuration.type === "gradle" ? renderGradle(configuration) : renderDockerCompose(configuration)}
          ${renderEnvironment(configuration.environment)}
          <section class="run-configuration-preview"><h4>Command line</h4><pre data-run-command-preview>Resolving command...</pre></section>
        </div>`;

      const change = () => options.onChange?.(configuration);
      host.querySelectorAll("[data-run-field]").forEach((control) => {
        const path = control.dataset.runField;
        control.addEventListener("input", () => {
          setNestedValue(configuration, path, control.type === "checkbox" ? control.checked : control.value);
          change();
        });
      });
      function readEnvironment() {
        configuration.environment = Array.from(host.querySelectorAll("[data-run-environment-row]")).map((row) => {
          const index = row.dataset.runEnvironmentRow;
          return {
            name: row.querySelector(`[data-run-environment-name="${index}"]`)?.value || "",
            value: row.querySelector(`[data-run-environment-value="${index}"]`)?.value || ""
          };
        });
        change();
      }
      host.querySelectorAll("[data-run-environment-name], [data-run-environment-value]").forEach((control) => control.addEventListener("input", readEnvironment));
      host.querySelector("[data-run-environment-add]")?.addEventListener("click", () => {
        configuration.environment = [...(configuration.environment || []), { name: "", value: "" }];
        options.onRenderRequested?.();
      });
      host.querySelectorAll("[data-run-environment-remove]").forEach((button) => button.addEventListener("click", () => {
        configuration.environment.splice(Number(button.dataset.runEnvironmentRemove), 1);
        options.onRenderRequested?.();
      }));
      host.querySelector("[data-run-main-search]")?.addEventListener("click", () => options.onSearchMainClass?.(configuration));
      return {
        showPreview(value) {
          const preview = host.querySelector("[data-run-command-preview]");
          if (preview) preview.textContent = String(value || "");
        },
        showErrors(errors = {}) {
          host.querySelectorAll("[data-run-error]").forEach((element) => {
            const message = errors[element.dataset.runError] || "";
            element.textContent = message;
            element.hidden = !message;
            element.closest(".run-configuration-field")?.classList.toggle("invalid", Boolean(message));
          });
        }
      };
    }

    const api = { render };
    app.registerModule?.("runConfigurationEditor", api);
    return api;
  }

  global.registerMarkdownViewerRunConfigurationEditor = registerMarkdownViewerRunConfigurationEditor;
})(typeof window !== "undefined" ? window : globalThis);
