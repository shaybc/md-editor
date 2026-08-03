(function(global) {
  "use strict";

  const COLLECTION_OWNER = "ajdt-project-analysis";

  /** Publish the non-fatal fallback state of the optional AJDT diagnostics worker. */
  function registerMarkdownViewerAspectjAnalysisProblems(app, deps = {}) {
    function publish(failure = {}) {
      const reason = String(failure.reason || "Unknown AJDT diagnostics failure").trim().replace(/[.\s]+$/, "");
      const diagnostic = {
        severity: "warning",
        message: `${failure.summary || "AJDT could not analyze the detected Gradle AspectJ modules."} Reason: ${reason}. JDT diagnostics remain active as a fallback.`,
        source: "AJDT Project Analysis",
        diagnosticKind: "ajdt-project-analysis",
        projectPath: String(deps.getWorkspacePath?.() || ""),
        failureCode: String(failure.code || "ajdt-diagnostics-failed")
      };
      deps.problemsPanel?.setDiagnosticCollection?.(COLLECTION_OWNER, [diagnostic], {
        persistent: false,
        revealErrors: false,
        userDeletable: false
      });
      return diagnostic;
    }

    function clear() {
      deps.problemsPanel?.clearDiagnosticCollection?.(COLLECTION_OWNER, { revealErrors: false });
    }

    const api = { clear, publish };
    app?.registerModule?.("aspectjAnalysisProblems", api);
    return api;
  }

  global.registerMarkdownViewerAspectjAnalysisProblems = registerMarkdownViewerAspectjAnalysisProblems;
})(typeof window !== "undefined" ? window : globalThis);
