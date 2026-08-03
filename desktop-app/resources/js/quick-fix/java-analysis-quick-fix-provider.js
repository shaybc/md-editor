(function(global) {
  "use strict";

  /** Provides persistent recovery actions for project-level JDT analysis problems. */
  function registerMarkdownViewerJavaAnalysisQuickFixProvider(app, deps = {}) {
    function createAction(id, title, description, kind, isPreferred = false) {
      return { id, title, description, kind, provenance: "local", isPreferred, disabled: false, needsResolve: false, execute: true };
    }

    /** Return whether a Problems diagnostic belongs to JDT project analysis. */
    function isDiagnostic(diagnostic) {
      return diagnostic?.diagnosticKind === "jdt-project-analysis";
    }

    /** Return the recovery actions available for a JDT project-analysis diagnostic. */
    async function getActions(diagnostic) {
      if (!isDiagnostic(diagnostic)) return [];
      return [
        createAction("java-analysis-retry", "Retry Project Analysis", "Revalidate the Project JDK and start a new JDT import attempt.", "java-analysis-retry", true),
        createAction("java-analysis-show-log", "Show JDT Log", "Open the complete native JDT workspace log.", "java-analysis-show-log"),
        createAction("java-analysis-jdk-settings", "Open JDK Settings", "Manage the application-wide Java runtimes.", "java-analysis-jdk-settings"),
        createAction("java-analysis-build-path", "Open Java Build Path", "Select the Project JDK and review the Java build path.", "java-analysis-build-path")
      ];
    }

    /** Execute one recovery action through the application's canonical command. */
    async function executeAction(diagnostic, action) {
      if (!isDiagnostic(diagnostic)) return false;
      if (action?.kind === "java-analysis-retry") return deps.retryProjectAnalysis?.();
      if (action?.kind === "java-analysis-show-log") return deps.showJdtLog?.();
      if (action?.kind === "java-analysis-jdk-settings") return deps.openJdkSettings?.();
      if (action?.kind === "java-analysis-build-path") return deps.openJavaBuildPath?.();
      return false;
    }

    const api = { isDiagnostic, getActions, executeAction };
    app?.registerModule?.("javaAnalysisQuickFixProvider", api);
    return api;
  }

  global.registerMarkdownViewerJavaAnalysisQuickFixProvider = registerMarkdownViewerJavaAnalysisQuickFixProvider;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerJavaAnalysisQuickFixProvider };
})(typeof window !== "undefined" ? window : globalThis);
