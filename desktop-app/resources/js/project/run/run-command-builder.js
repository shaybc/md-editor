// Cross-platform shell command assembly for saved Run configurations.
(function(global) {
  "use strict";

  /**
   * Register Run command construction.
   * @param {object} app Application module registry.
   * @param {object} deps Build-command and operating-system dependencies.
   * @returns {object} Run command builder API.
   */
  function registerMarkdownViewerRunCommandBuilder(app, deps = {}) {
    function isWindows() {
      return String(deps.osName || global.NL_OS || "Windows").toLowerCase() === "windows";
    }

    function quote(value) {
      const text = String(value || "");
      if (isWindows()) return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
      return /[\s'"\\$`;&|<>*?()[\]{}!]/.test(text) ? `'${text.replace(/'/g, "'\\''")}'` : text;
    }

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

    function applyEnvironment(command, environment = {}) {
      const entries = Object.entries(environment).filter(([name]) => String(name || "").trim());
      if (!entries.length) return command;
      if (isWindows()) {
        return entries.map(([name, value]) => `set "${name}=${String(value ?? "").replace(/"/g, '\\"')}"`).concat(command).join(" && ");
      }
      return entries.map(([name, value]) => `${name}=${quote(value)}`).concat(command).join(" ");
    }

    function createEnvironment(configuration, runtime) {
      const values = {};
      (configuration.environment || []).forEach((entry) => {
        if (entry?.name) values[entry.name] = String(entry.value ?? "");
      });
      if (runtime?.projectJdk?.path) {
        values.JAVA_HOME = runtime.projectJdk.path;
        const bin = `${runtime.projectJdk.path}/bin`;
        values.PATH = isWindows() ? `${bin};%PATH%` : `${bin}:$PATH`;
      }
      return values;
    }

    function buildMavenCommand(configuration, context) {
      const options = {
        runner: context.mavenProject?.runner || configuration.maven?.runner || "mvn",
        commandLine: configuration.maven?.commandLine,
        profiles: configuration.maven?.profiles
      };
      if (typeof deps.mavenCommand?.buildGoalsCommand === "function") return deps.mavenCommand.buildGoalsCommand(options);
      const profiles = String(options.profiles || "").trim().split(/\s+/).filter(Boolean)
        .map((profile) => profile.startsWith("-") ? profile : `-P${profile}`);
      return [options.runner, ...profiles, String(options.commandLine || "").trim()].filter(Boolean).join(" ");
    }

    function buildGradleCommand(configuration, context) {
      const options = {
        runner: context.gradleProject?.runner || configuration.gradle?.runner || "gradle",
        tasks: configuration.gradle?.tasks,
        projectPath: configuration.gradle?.projectPath,
        offline: configuration.gradle?.offline === true || context.gradleProject?.launcherSettings?.offline === true,
        userHome: context.gradleProject?.launcherSettings?.userHome || ""
      };
      if (typeof deps.gradleCommand?.buildTasksCommand === "function") return deps.gradleCommand.buildTasksCommand(options);
      const parts = [options.runner, "--console=plain", "--no-daemon"];
      if (options.offline) parts.push("--offline");
      if (options.userHome) parts.push("--gradle-user-home", quote(options.userHome));
      const projectPath = String(options.projectPath || "").replace(/^:+|:+$/g, "");
      String(options.tasks || "").trim().split(/\s+/).filter(Boolean).forEach((task) => {
        parts.push(projectPath && !task.startsWith("-") && !task.includes(":") ? `:${projectPath}:${task}` : task);
      });
      return parts.join(" ");
    }

    function buildJavaCommand(configuration, context) {
      const executable = context.runtime?.javaExecutable || `${context.runtime?.projectJdk?.path || ""}/bin/java`;
      const parts = [quote(executable)];
      const vmArguments = String(configuration.java?.vmArguments || "").trim();
      if (vmArguments) parts.push(vmArguments);
      if (context.classpath) parts.push("-classpath", quote(context.classpath));
      parts.push(configuration.java?.mainClass || "");
      const programArguments = String(configuration.java?.programArguments || "").trim();
      if (programArguments) parts.push(programArguments);
      return parts.filter(Boolean).join(" ");
    }

    /**
     * Build a runnable command and its live preview.
     * @param {object} configuration Valid Run configuration.
     * @param {object} context Resolved runtime, project, classpath, and working-directory context.
     * @returns {object} Command, preview, title, and cwd.
     */
    function build(configuration, context = {}) {
      const projectPath = normalizePath(context.projectPath);
      const defaultCwd = configuration.type === "maven"
        ? context.mavenProject?.projectRoot
        : configuration.type === "gradle"
          ? context.gradleProject?.projectRoot
          : joinPath(projectPath, configuration.java?.modulePath);
      const cwd = joinPath(projectPath, configuration.workingDirectory || defaultCwd || projectPath);
      const baseCommand = configuration.type === "java-application"
        ? buildJavaCommand(configuration, context)
        : configuration.type === "maven"
          ? buildMavenCommand(configuration, context)
          : buildGradleCommand(configuration, context);
      const command = applyEnvironment(baseCommand, createEnvironment(configuration, context.runtime));
      return {
        command,
        preview: command,
        cwd,
        title: `Run: ${configuration.name}`
      };
    }

    const api = { applyEnvironment, build, joinPath, quote };
    app.registerModule?.("runCommandBuilder", api);
    return api;
  }

  global.registerMarkdownViewerRunCommandBuilder = registerMarkdownViewerRunCommandBuilder;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunCommandBuilder };
  }
})(typeof window !== "undefined" ? window : globalThis);
