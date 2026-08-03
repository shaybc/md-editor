(function(global) {
  "use strict";

  /** Resolves the explicitly selected project JDK and the independently compatible JDT launcher. */
  function registerMarkdownViewerJavaProjectRuntime(app, deps = {}) {
    const registry = deps.jdkRegistry;

    /** Resolve runtime state without falling back to an unconfigured system Java. */
    async function resolve(projectPath, configuration) {
      const projectJdkId = String(configuration?.projectJdkId || "");
      if (!projectJdkId) {
        return { ok: false, code: "project-jdk-required", projectPath, projectJdk: null, launcherJdk: null };
      }
      const configured = registry.resolve(projectJdkId);
      if (!configured) {
        return { ok: false, code: "project-jdk-unavailable", projectPath, projectJdk: null, launcherJdk: null };
      }
      const validation = await registry.validate(configured);
      if (!validation.valid) {
        return { ok: false, code: "project-jdk-invalid", reason: validation.reason, projectPath, projectJdk: configured, launcherJdk: null };
      }
      const projectJdk = validation.runtime;
      const toolingJdkHome = String(await deps.getBundledToolingJdkHome?.() || "");
      const toolingValidation = toolingJdkHome ? await registry.validate({
        id: "md-editor:tooling-jdk",
        name: "MD-Editor Tooling JDK",
        path: toolingJdkHome,
        feature: registry.MINIMUM_JDT_FEATURE
      }) : { valid: false };
      const launcherJdk = toolingValidation.valid && toolingValidation.runtime.feature >= registry.MINIMUM_JDT_FEATURE
        ? toolingValidation.runtime
        : await registry.getCompatibleJdtLauncher(projectJdk);
      return {
        ok: true,
        code: launcherJdk ? "" : "jdt-launcher-required",
        projectPath,
        projectJdk,
        launcherJdk,
        javaExecutable: validation.javaExecutable,
        javacExecutable: validation.javacExecutable,
        javadocExecutable: validation.javadocExecutable
      };
    }

    /** Require a valid project JDK before a Java-based project command may run. */
    async function requireForCommand(projectPath, configuration) {
      const runtime = await resolve(projectPath, configuration);
      if (!runtime.ok) {
        const error = new Error(runtime.code === "project-jdk-required"
          ? "Select a Project JDK in Java Build Path before running Java project commands."
          : "The configured Project JDK is unavailable or invalid. Select another JDK in Java Build Path.");
        error.code = runtime.code;
        error.runtime = runtime;
        throw error;
      }
      return runtime;
    }

    /** Build environment values used by Maven and other project-scoped Java processes. */
    function createJavaEnvironment(runtime) {
      if (!runtime?.projectJdk?.path) return {};
      return {
        JAVA_HOME: runtime.projectJdk.path,
        javaBin: `${runtime.projectJdk.path}/bin`
      };
    }

    /** Prefix a shell command with the selected JDK environment. */
    function applyToCommand(command, runtime, osName = deps.osName || global.NL_OS) {
      const environment = createJavaEnvironment(runtime);
      if (!environment.JAVA_HOME) return command;
      if (osName === "Windows") {
        return `set "JAVA_HOME=${environment.JAVA_HOME}" && set "PATH=${environment.javaBin};%PATH%" && ${command}`;
      }
      const quote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
      return `JAVA_HOME=${quote(environment.JAVA_HOME)} PATH=${quote(environment.javaBin)}:"$PATH" ${command}`;
    }

    const api = { applyToCommand, createJavaEnvironment, requireForCommand, resolve };
    app?.registerModule?.("javaProjectRuntime", api);
    return api;
  }

  global.registerMarkdownViewerJavaProjectRuntime = registerMarkdownViewerJavaProjectRuntime;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaProjectRuntime };
  }
})(typeof window !== "undefined" ? window : globalThis);
