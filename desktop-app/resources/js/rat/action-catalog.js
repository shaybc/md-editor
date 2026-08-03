(function(global) {
  "use strict";

  /** Describe RAT remediation, investigation, documentation, and bypass choices. */
  function registerMarkdownViewerRatActionCatalog(app) {
    const DEFINITIONS = Object.freeze([
      { id: "resolution.add-header", category: "recommended", badge: "Recommended", title: "Add the project license header...", clearsFinding: true, requiresText: true, description: "Add a reviewed project license header to an eligible text file." },
      { id: "resolution.exclude-file", category: "policy", badge: "Policy decision", title: "Exclude this exact file from RAT...", clearsFinding: true, requiresConfiguration: true, description: "Stop RAT inspecting this path. This does not determine or approve its license." },
      { id: "resolution.exclude-pattern", category: "policy", badge: "Policy decision", title: "Exclude matching generated files...", clearsFinding: true, requiresConfiguration: true, description: "Add a reviewed pattern after showing all current workspace matches." },
      { id: "resolution.approve-license-family", category: "policy", badge: "Policy decision", title: "Recognize and approve this license family in RAT...", clearsFinding: true, requiresConfiguration: true, description: "Configure a license matcher and approve that family under project policy; this is not legal advice." },
      { id: "documentation.third-party", category: "documentation", badge: "Documentation only", title: "Record third-party license and provenance...", clearsFinding: false, description: "Record origin and attribution. Documentation alone does not clear the RAT finding." },
      { id: "documentation.open-project-files", category: "documentation", badge: "Documentation only", title: "Open project license documentation", clearsFinding: false, description: "Open existing LICENSE, NOTICE, README, or third-party inventory files without changing them." },
      { id: "investigate.file", category: "investigation", badge: "Investigation", title: "Inspect reported file", clearsFinding: false, requiresFile: true, description: "Review metadata, text/binary classification, and a bounded signature preview." },
      { id: "investigate.provenance", category: "investigation", badge: "Investigation", title: "Investigate provenance", clearsFinding: false, description: "Collect Git and generated-file evidence without making an ownership conclusion." },
      { id: "investigate.configuration", category: "investigation", badge: "Investigation", title: "Inspect governing RAT configuration", clearsFinding: false, description: "Review module, parent, profile, pluginManagement, and inherited configuration." },
      { id: "investigate.report", category: "investigation", badge: "Investigation", title: "Open RAT report", clearsFinding: false, requiresReport: true, description: "Open the existing RAT report without running Maven." },
      { id: "run.check", category: "investigation", badge: "Investigation", title: "Run Apache RAT check", clearsFinding: false, description: "Preview and execute a wrapper-aware RAT check without compiling or packaging." },
      { id: "advanced.skip", category: "advanced", badge: "Audit bypass", title: "Skip RAT for one Maven invocation", clearsFinding: false, description: "Temporarily bypass the audit with -Drat.skip=true. This is not a fix." },
      { id: "advanced.disable-execution", category: "advanced", badge: "Audit bypass", title: "Configure RAT to skip this scope...", clearsFinding: false, requiresConfiguration: true, description: "Persistently bypass license checking for the selected scope after explicit acknowledgement." }
    ]);

    function getActions(context = {}) {
      const inspection = context.inspection || {};
      return DEFINITIONS.map((definition) => {
        let disabledReason = "";
        if (definition.requiresFile && !context.finding?.filePath) {
          disabledReason = "This RAT finding does not identify a file.";
        } else if (definition.requiresText && inspection.classification === "binary") {
          disabledReason = "Binary files cannot receive a source license header.";
        } else if (definition.requiresText && !context.finding?.filePath) {
          disabledReason = "This RAT finding does not identify a file.";
        } else if (definition.requiresReport && !context.reportPath) {
          disabledReason = "No existing RAT report was found.";
        } else if (definition.requiresConfiguration && !context.module?.hasPom) {
          disabledReason = "No governing Maven pom.xml was found.";
        } else if (definition.requiresConfiguration && context.configurationConfidence === "ambiguous") {
          disabledReason = "Profile or inherited configuration is ambiguous; inspect the effective configuration first.";
        }
        return { ...definition, enabled: !disabledReason, disabledReason };
      });
    }

    const api = { getActions };
    app?.registerModule?.("ratActionCatalog", api);
    return api;
  }

  global.registerMarkdownViewerRatActionCatalog = registerMarkdownViewerRatActionCatalog;
})(typeof window !== "undefined" ? window : globalThis);
