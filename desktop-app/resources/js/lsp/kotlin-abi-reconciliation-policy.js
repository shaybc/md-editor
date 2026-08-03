(function(global) {
  "use strict";

  /** Retry and evidence policy for installing Kotlin ABI classpaths into JDT. */
  const MISSING_RESOURCE_RETRY_DELAYS_MS = Object.freeze([1000, 3000]);

  /**
   * Reduce an ABI snapshot to stable, log-safe project evidence.
   * @param {object} snapshot Kotlin adapter ABI snapshot.
   * @returns {object} Revision, entry counts, and requested project identifiers.
   */
  function summarizeSnapshot(snapshot = {}) {
    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    const projects = Array.from(new Set(entries.map((entry) => String(entry.projectUri || "")).filter(Boolean))).sort();
    return {
      workspaceRevision: String(snapshot.workspaceRevision || ""),
      metadataVersion: Number(snapshot.metadataVersion) || 0,
      entryCount: entries.length,
      projectCount: projects.length,
      projects,
      removedProjects: stringList(snapshot.removedProjectUris)
    };
  }

  /**
   * Preserve the JDT response fields needed to investigate reconciliation failures.
   * @param {object} result Native JDT reconciliation result.
   * @returns {object} Structured project, classpath, and verification evidence.
   */
  function summarizeResult(result = {}) {
    return {
      revision: String(result.revision || ""),
      generationId: Number(result.generationId) || 0,
      sessionToken: String(result.sessionToken || ""),
      verificationMetadataComplete: result.verificationMetadataComplete !== false,
      appliedProjects: stringList(result.appliedProjects),
      unchangedProjects: stringList(result.unchangedProjects),
      invalidatedProjects: stringList(result.invalidatedProjects),
      clearedProjects: stringList(result.clearedProjects),
      missingProjects: stringList(result.missingProjects),
      missingJars: stringList(result.missingJars),
      effectiveEntryCount: Array.isArray(result.effectiveEntries) ? result.effectiveEntries.length : 0,
      resolvedTypeCount: Number(result.resolvedTypeCount) || 0,
      unresolvedTypes: Array.isArray(result.unresolvedTypes) ? result.unresolvedTypes : [],
      incompatibleClassFiles: Array.isArray(result.incompatibleClassFiles) ? result.incompatibleClassFiles : [],
      projectVerification: Array.isArray(result.projectVerification) ? result.projectVerification : [],
      workspaceProjects: Array.isArray(result.workspaceProjects) ? result.workspaceProjects : []
    };
  }

  /**
   * Select the next bounded delay for a temporarily missing project or JAR.
   * @param {object} result Native JDT reconciliation result.
   * @param {number} retryIndex Zero-based retry count.
   * @returns {number|null} Delay in milliseconds, or null when retries are exhausted.
   */
  function getMissingResourceRetryDelay(result, retryIndex) {
    const hasMissingProjects = Array.isArray(result?.missingProjects) && result.missingProjects.length > 0;
    const hasMissingJars = Array.isArray(result?.missingJars) && result.missingJars.length > 0;
    if (!hasMissingProjects && !hasMissingJars) return null;
    return MISSING_RESOURCE_RETRY_DELAYS_MS[retryIndex] ?? null;
  }

  /**
   * Create a failure that retains native evidence across async coordinator boundaries.
   * @param {string} code Stable failure category.
   * @param {string} message User-readable summary.
   * @param {object} evidence Structured reconciliation evidence.
   * @returns {Error} Error carrying the supplied code and evidence.
   */
  function createFailure(code, message, evidence = {}) {
    const error = new Error(message);
    error.code = String(code || "kotlin-abi-reconciliation-failed");
    error.evidence = evidence;
    return error;
  }

  function stringList(value) {
    return Array.isArray(value) ? value.map(String).filter(Boolean).sort() : [];
  }

  const api = { createFailure, getMissingResourceRetryDelay, summarizeResult, summarizeSnapshot };
  global.markdownViewerKotlinAbiReconciliationPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
