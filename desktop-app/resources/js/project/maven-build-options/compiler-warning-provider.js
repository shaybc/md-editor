(function(global) {
  "use strict";

  /** Provide invocation-only Maven compiler warning controls for rebuild commands. */
  function registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider(app) {
    const COMPILER_WARNING_GROUP = { id: "compiler-warnings", label: "Compiler warnings", order: 16 };

    function getSelectedLintSuppressions(values) {
      const suppressions = [];
      if (values["compiler.warnings.suppress-deprecation"] === true) suppressions.push("-deprecation");
      if (values["compiler.warnings.suppress-unchecked"] === true) suppressions.push("-unchecked");
      return suppressions;
    }

    function createProvider() {
      return {
        id: "compiler-warning-build-options",
        getOptions() {
          return [
            {
              id: "compiler.warnings.hide-all",
              group: COMPILER_WARNING_GROUP,
              label: "Do not show Java compiler warnings during this rebuild",
              description: "Ask Maven Compiler Plugin to suppress Java compiler warnings for this rebuild only.",
              help: "Adds -Dmaven.compiler.showWarnings=false for this rebuild only. This hides compiler warnings in Maven output; it does not change source code or project configuration.",
              order: 10,
              defaultValue: false,
              persistence: "invocation",
              reservedArguments: ["maven.compiler.showWarnings"],
              getArguments(value) { return value ? ["-Dmaven.compiler.showWarnings=false"] : []; }
            },
            {
              id: "compiler.warnings.suppress-deprecation",
              group: COMPILER_WARNING_GROUP,
              label: "Suppress deprecation warnings (-Xlint:-deprecation)",
              description: "Add a javac lint control to suppress deprecation warnings for this rebuild only.",
              help: "Adds -Xlint:-deprecation through the Maven compiler argument property for this rebuild only. Use it when deprecation warnings are expected noise and you still want other warning categories to remain visible.",
              order: 20,
              defaultValue: false,
              persistence: "invocation",
              reservedArguments: ["maven.compiler.compilerArgument"],
              getArguments(value, values) {
                const suppressions = getSelectedLintSuppressions(values);
                return suppressions.length ? [`-Dmaven.compiler.compilerArgument=-Xlint:${suppressions.join(",")}`] : [];
              }
            },
            {
              id: "compiler.warnings.suppress-unchecked",
              group: COMPILER_WARNING_GROUP,
              label: "Suppress unchecked warnings (-Xlint:-unchecked)",
              description: "Add a javac lint control to suppress unchecked conversion and raw-type warnings for this rebuild only.",
              help: "Adds -Xlint:-unchecked through the Maven compiler argument property for this rebuild only. If deprecation suppression is also selected, both lint suppressions are combined into one compiler argument.",
              order: 30,
              defaultValue: false,
              persistence: "invocation",
              reservedArguments: ["maven.compiler.compilerArgument"],
              getArguments() { return []; }
            }
          ];
        }
      };
    }

    const api = { createProvider };
    app.registerModule?.("mavenCompilerWarningBuildOptionsProvider", api);
    return api;
  }

  global.registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider = registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider };
})(typeof window !== "undefined" ? window : globalThis);