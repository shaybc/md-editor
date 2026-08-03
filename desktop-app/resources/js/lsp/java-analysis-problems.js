(function(global) {
  "use strict";

  /** Owns the session-scoped Problems entry for actionable Java analysis failures. */
  function registerMarkdownViewerJavaAnalysisProblems(app, deps = {}) {
    const COLLECTION_OWNER = "jdt-project-analysis";
    const automaticRetryFingerprints = new Set();
    let current = null;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/$/, "");
    }

    function getProjectJdkLabel(projectJdk) {
      if (!projectJdk) return "Unavailable";
      return `${projectJdk.name || "Project JDK"} (Java ${projectJdk.feature || "unknown"})`;
    }

    function getRemediation(details) {
      if (details?.remediation) return String(details.remediation);
      if (["project-jdk-required", "project-jdk-unavailable"].includes(details?.code)) return "Select a valid Project JDK in Java Build Path.";
      if (details?.code === "jdt-launcher-required") return "Add a JDK 21 or newer in JDK Settings, then retry project analysis.";
      if (details?.code === "jdk-incompatible") return "Select a compatible Project JDK for the Gradle import in Java Build Path, then retry project analysis.";
      if (details?.code === "maven-import-failed") return "Fix the Maven project import error, then retry Java project analysis.";
      if (details?.code === "gradle-import-failed") return "Fix the Gradle project import error, then retry Java project analysis.";
      return "Fix the project analysis error, then retry Java project analysis.";
    }

    function createDiagnostic(details, options = {}) {
      const projectJdk = details?.projectJdk || null;
      const summary = String(details?.summary || "Java project analysis failed.");
      const reason = String(details?.reason || "").trim().replace(/[.\s]+$/, "");
      const failureDescription = reason && !summary.toLowerCase().includes(reason.toLowerCase())
        ? `${summary} Reason: ${reason}.`
        : summary;
      const remediation = getRemediation(details);
      return {
        severity: options.severity || (details?.trip === false && details?.fatal !== true ? "warning" : "error"),
        message: `${failureDescription} Project JDK: ${getProjectJdkLabel(projectJdk)}. ${remediation}`,
        source: "JDT Project Analysis",
        diagnosticKind: "jdt-project-analysis",
        failureCode: String(details?.code || "java-analysis-failed"),
        fingerprint: String(details?.fingerprint || details?.code || "java-analysis-failed"),
        projectPath: normalizePath(details?.projectPath || options.projectPath || deps.getWorkspacePath?.()),
        projectJdk,
        launcherJdk: details?.launcherJdk || null,
        logPath: String(details?.logPath || ""),
        remediation,
        occurrenceCount: Math.max(1, Number(details?.count || details?.occurrenceCount || 1)),
        originalMessage: summary
      };
    }

    /** Describe one terminal JDT process failure for a managed Gradle or Maven project. */
    function createFatalJdtProcessFailure(details = {}) {
      const buildSystem = String(details.buildSystem || "").trim().toLowerCase();
      if (!["gradle", "maven", "gradle/maven"].includes(buildSystem)) return null;
      const buildSystemLabel = buildSystem === "gradle/maven" ? "Gradle/Maven" : buildSystem[0].toUpperCase() + buildSystem.slice(1);
      const reason = String(details.reason || "the JDT process failed twice during startup").trim().replace(/[.\s]+$/, "");
      return Object.assign({}, details, {
        code: "jdt-process-failed",
        summary: "JDT failed to analyze the " + buildSystemLabel + " project because " + reason + ".",
        fatal: true,
        trip: true,
        remediation: details.remediation || "Review the JDT log, fix the project or JDT startup error, then retry Java project analysis."
      });
    }

    /** Publish or replace the current actionable JDT workspace problem. */
    function publish(details, options = {}) {
      if (!details) return null;
      const diagnostic = createDiagnostic(details, options);
      current = { workspacePath: diagnostic.projectPath, failure: Object.assign({}, details), diagnostic };
      deps.problemsPanel?.setDiagnosticCollection?.(COLLECTION_OWNER, [diagnostic], {
        persistent: false,
        revealErrors: false,
        userDeletable: false
      });
      return diagnostic;
    }

    /** Synchronize runtime blockers and terminal workspace phases into the Problems collection. */
    function syncWorkspaceState(state) {
      const workspacePath = normalizePath(deps.getWorkspacePath?.());
      if (current?.workspacePath && workspacePath && current.workspacePath.toLowerCase() !== workspacePath.toLowerCase()) clear();
      if (!state || state.phase === "closed" || state.phase === "ready" || state.model?.hasJavaContent === false) {
        clear(workspacePath);
        return null;
      }
      if (state.phase === "runtime-required") {
        return publish({
          code: state.runtime?.code || "project-jdk-required",
          summary: state.runtime?.reason || "A valid Project JDK is required for Java analysis.",
          projectPath: workspacePath,
          projectJdk: state.runtime?.projectJdk || null,
          launcherJdk: state.runtime?.launcherJdk || null,
          fatal: true
        }, { severity: "error" });
      }
      if (state.phase !== "degraded") {
        clear(workspacePath);
        return null;
      }
      if (state.failure) {
        return publish(Object.assign({
          projectPath: workspacePath,
          projectJdk: state.runtime?.projectJdk || null,
          launcherJdk: state.runtime?.launcherJdk || null,
          logPath: state.logPath || ""
        }, state.failure), { severity: "error" });
      }
      if (state.runtime?.ok && !state.runtime?.launcherJdk) {
        return publish({
          code: "jdt-launcher-required",
          summary: "JDK 21 or newer is required to launch JDT.",
          projectPath: workspacePath,
          projectJdk: state.runtime.projectJdk || null,
          fatal: true
        }, { severity: "error" });
      }
      if (state.error) {
        return publish({
          code: "project-detection-failed",
          summary: state.error.message || "Java project detection failed.",
          projectPath: workspacePath,
          projectJdk: state.runtime?.projectJdk || null,
          launcherJdk: state.runtime?.launcherJdk || null,
          fatal: true
        }, { severity: "error" });
      }
      return current?.diagnostic || null;
    }

    /** Clear the owned problem when its workspace is resolved or closed. */
    function clear(workspacePath) {
      const normalized = normalizePath(workspacePath);
      if (current && normalized && current.workspacePath && current.workspacePath.toLowerCase() !== normalized.toLowerCase()) return false;
      current = null;
      automaticRetryFingerprints.clear();
      deps.problemsPanel?.clearDiagnosticCollection?.(COLLECTION_OWNER, { revealErrors: false });
      return true;
    }

    /** Return a snapshot of the current JDT analysis problem. */
    function getCurrent() {
      return current ? { workspacePath: current.workspacePath, failure: Object.assign({}, current.failure), diagnostic: Object.assign({}, current.diagnostic) } : null;
    }

    /** Decide whether a successful build could repair the current import failure. */
    function isBuildRecoverable(failure, buildSystem) {
      const normalizedBuildSystem = String(buildSystem || "").toLowerCase();
      return (normalizedBuildSystem === "maven" && failure?.code === "maven-import-failed")
        || (normalizedBuildSystem === "gradle" && failure?.code === "gradle-import-failed");
    }

    /** Identify a project build that started while JDT was producing provisional project data. */
    function isWorkspaceAnalysisInProgress(state) {
      return ["detecting", "starting", "initializing", "importing", "refreshing"].includes(String(state?.phase || ""));
    }

    /** Reserve the one automatic retry allowed for a failure fingerprint. */
    function markAutomaticRetryStarted(fingerprint) {
      const key = String(fingerprint || "");
      if (!key || automaticRetryFingerprints.has(key)) return false;
      automaticRetryFingerprints.add(key);
      return true;
    }

    const api = { publish, createFatalJdtProcessFailure, syncWorkspaceState, clear, getCurrent, isBuildRecoverable, isWorkspaceAnalysisInProgress, markAutomaticRetryStarted };
    app?.registerModule?.("javaAnalysisProblems", api);
    return api;
  }

  global.registerMarkdownViewerJavaAnalysisProblems = registerMarkdownViewerJavaAnalysisProblems;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerJavaAnalysisProblems };
})(typeof window !== "undefined" ? window : globalThis);
