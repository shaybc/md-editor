// Field-addressable validation for Run configuration drafts.
(function(global) {
  "use strict";

  /**
   * Register Run configuration validation.
   * @param {object} app Application module registry.
   * @param {object} deps Filesystem dependencies.
   * @returns {object} Validation API.
   */
  function registerMarkdownViewerRunConfigurationValidation(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      const base = normalizePath(parent);
      const value = normalizePath(child);
      if (!value) return base;
      if (/^[A-Za-z]:\//.test(value) || value.startsWith("/")) return value;
      return `${base}/${value.replace(/^\/+/, "")}`;
    }

    async function isDirectory(path) {
      try {
        return (await (deps.Neutralino || global.Neutralino)?.filesystem?.getStats?.(path))?.isDirectory === true;
      } catch (_error) {
        return false;
      }
    }

    function addError(errors, field, message) {
      if (!errors[field]) errors[field] = message;
    }

    function validateEnvironment(configuration, errors) {
      const names = new Set();
      (configuration.environment || []).forEach((entry, index) => {
        const name = String(entry?.name || "").trim();
        if (!name) {
          addError(errors, `environment.${index}.name`, "Environment variable name is required.");
          return;
        }
        const key = name.toLowerCase();
        if (names.has(key)) addError(errors, `environment.${index}.name`, "Environment variable names must be unique.");
        names.add(key);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          addError(errors, `environment.${index}.name`, "Use letters, digits, and underscores, starting with a letter or underscore.");
        }
      });
    }

    /**
     * Validate a Run configuration against project context and detected tooling.
     * @param {object} configuration Configuration draft.
     * @param {object} context Project, store, and detection context.
     * @returns {Promise<object>} Validation result with field errors and runnable state.
     */
    async function validate(configuration, context = {}) {
      const errors = {};
      const projectPath = normalizePath(context.projectPath);
      const name = String(configuration?.name || "").trim();
      if (!projectPath) addError(errors, "project", "Open a project to use Run configurations.");
      if (!name) addError(errors, "name", "Name is required.");
      const duplicate = (context.configurations || []).find((item) =>
        item.id !== configuration?.id && String(item.name || "").trim().toLowerCase() === name.toLowerCase());
      if (duplicate) addError(errors, "name", "Configuration names must be unique in this project.");
      validateEnvironment(configuration || {}, errors);

      const workingDirectory = joinPath(projectPath, configuration?.workingDirectory);
      if (projectPath && !await isDirectory(workingDirectory)) {
        addError(errors, "workingDirectory", "Working directory does not exist.");
      }

      if (configuration?.type === "java-application") {
        if (!String(configuration.java?.mainClass || "").trim()) addError(errors, "java.mainClass", "Main class is required.");
        if (context.runtime?.ok === false) {
          addError(errors, "java.jdkId", context.runtime.code === "project-jdk-required"
            ? "Select a Project JDK in Java Build Path."
            : "The selected JDK is unavailable or invalid.");
        }
      } else if (configuration?.type === "maven") {
        if (!String(configuration.maven?.commandLine || "").trim()) addError(errors, "maven.commandLine", "Maven goals are required.");
        if (context.mavenProject && !context.mavenProject.hasPom) addError(errors, "maven.project", "A Maven project is required.");
      } else if (configuration?.type === "gradle") {
        if (!String(configuration.gradle?.tasks || "").trim()) addError(errors, "gradle.tasks", "Gradle tasks are required.");
        if (context.gradleProject && !context.gradleProject.hasGradleProject) addError(errors, "gradle.project", "A Gradle project is required.");
        if (context.gradleProject?.runnerError) addError(errors, "gradle.runner", context.gradleProject.runnerError);
      } else {
        addError(errors, "type", "Choose a supported Run configuration type.");
      }

      return {
        errors,
        runnable: Object.keys(errors).length === 0,
        workingDirectory
      };
    }

    const api = { joinPath, validate };
    app.registerModule?.("runConfigurationValidation", api);
    return api;
  }

  global.registerMarkdownViewerRunConfigurationValidation = registerMarkdownViewerRunConfigurationValidation;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunConfigurationValidation };
  }
})(typeof window !== "undefined" ? window : globalThis);
