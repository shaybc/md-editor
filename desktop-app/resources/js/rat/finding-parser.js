(function(global) {
  "use strict";

  /** Normalize Maven/RAT diagnostics into one stable finding model. */
  function registerMarkdownViewerRatFindingParser(app) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/^\/([A-Za-z]:\/)/, "$1");
    }

    function joinPath(root, path) {
      const base = normalizePath(root).replace(/\/+$/, "");
      const child = normalizePath(path).replace(/^\/+/, "");
      return base && child ? `${base}/${child}` : child || base;
    }

    function isAbsolute(path) {
      return /^[A-Za-z]:\//.test(path) || path.startsWith("/");
    }

    function extractReportedPath(message) {
      const value = String(message || "").trim();
      const match = value.match(/files?\s+with\s+unapproved\s+licenses?\s*:\s*(.+)$/i);
      if (match) {
        const reported = match[1].trim();
        if (/^\d+\b/.test(reported)) return "";
        return reported.replace(/^["']|["']$/g, "");
      }
      const reportMatch = value.match(/^\s*[!?]\s+(.+?)\s*$/);
      return reportMatch ? reportMatch[1].trim() : "";
    }

    function parseUnapprovedCount(message) {
      const value = String(message || "");
      const summary = value.match(/\bunapproved\s*:\s*(\d+)\b/i);
      if (summary) return Number(summary[1]);
      const failure = value.match(/\btoo many files with unapproved licenses?\s*:\s*(\d+)\b/i);
      return failure ? Number(failure[1]) : null;
    }

    function extractReportPath(message) {
      const value = String(message || "");
      const match = value.match(/\bsee\s+(?:the\s+)?rat\s+report\s+in\s*:?\s*(.+?)(?:\s+->\s+\[Help\b.*|\s*$)/i);
      return match ? normalizePath(match[1].trim().replace(/^["']|["']$/g, "")) : "";
    }

    function parseDiagnostic(diagnostic = {}, options = {}) {
      const originalMessage = String(diagnostic.message || diagnostic.originalMessage || "");
      const reportedPath = normalizePath(
        diagnostic.filePath || diagnostic.path || options.targetPath || extractReportedPath(originalMessage)
      );
      const projectPath = normalizePath(options.projectPath || diagnostic.projectPath);
      const filePath = reportedPath && !isAbsolute(reportedPath) ? joinPath(projectPath, reportedPath) : reportedPath;
      const looksLikeRat = /unapproved\s+licenses?/i.test(originalMessage)
        || diagnostic.kind === "unapproved-license"
        || diagnostic.source === "maven-rat";
      if (!looksLikeRat && !options.allowUnclassified) return null;
      return {
        kind: "unapproved-license",
        source: "maven-rat",
        projectPath,
        modulePath: normalizePath(diagnostic.modulePath),
        filePath,
        reportedPath: reportedPath || "",
        reportPath: normalizePath(diagnostic.reportPath),
        originalMessage,
        diagnostic,
        detectedLicenseFamily: String(diagnostic.detectedLicenseFamily || ""),
        configurationConfidence: String(diagnostic.configurationConfidence || "unknown")
      };
    }

    function fingerprint(finding = {}) {
      return [
        normalizePath(finding.projectPath).toLowerCase(),
        normalizePath(finding.filePath).toLowerCase(),
        String(finding.detectedLicenseFamily || "").toLowerCase(),
        String(finding.kind || "")
      ].join("|");
    }

    const api = { extractReportPath, extractReportedPath, fingerprint, parseDiagnostic, parseUnapprovedCount };
    app?.registerModule?.("ratFindingParser", api);
    return api;
  }

  global.registerMarkdownViewerRatFindingParser = registerMarkdownViewerRatFindingParser;
})(typeof window !== "undefined" ? window : globalThis);
