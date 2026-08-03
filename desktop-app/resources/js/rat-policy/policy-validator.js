(function(global) {
  "use strict";

  /** Validate RAT policy drafts while separating errors from policy warnings. */
  function registerMarkdownViewerRatPolicyValidator(app) {
    const KNOWN_LICENSES = new Set(["Apache-2.0", "MIT", "BSD-3-Clause", "EPL-2.0", "Custom"]);

    function isUnsafePattern(pattern) {
      const value = String(pattern || "").trim();
      return !value || value === "*" || value === "**" || value === "**/*" || value === "/";
    }

    /** Validate a draft before preview or application. */
    function validate(draft, inventory) {
      const errors = [];
      const warnings = [];
      if (!draft.targetPomPath) errors.push("Select the POM that will own the RAT policy.");
      if (!KNOWN_LICENSES.has(draft.projectLicense)) errors.push("Select the project license or choose Custom.");
      if (draft.projectLicense === "Custom" && !String(draft.customLicenseName || "").trim()) errors.push("Name the custom project license.");
      if (!draft.acknowledgePolicyOwnership) errors.push("Confirm that the selected policy reflects a reviewed project decision.");
      if (inventory.configurationConfidence === "ambiguous" && !draft.acknowledgeAmbiguousScope) errors.push("Confirm the selected POM because profiles or inheritance make the governing scope ambiguous.");
      if (draft.exclusions.some(isUnsafePattern)) errors.push("Remove empty or workspace-wide exclusion patterns.");
      if ((draft.skip || draft.disableExecution) && !draft.acknowledgedBypass) errors.push("Acknowledge that the selected advanced action bypasses license auditing.");
      if (draft.disableExecution && !inventory.hasActivePlugin) errors.push("No active RAT execution was found to deactivate safely.");
      if (draft.skip || draft.disableExecution) warnings.push("This policy bypasses Apache RAT; it does not resolve license compliance.");
      if (!inventory.capabilities.hasBundledSchema) warnings.push("No version-matched offline schema is bundled; validation will be structural only.");
      if (draft.approvedFamilies.length) warnings.push("Approving a RAT family records project policy; it is not a legal compatibility decision.");
      if (draft.documentation.updateNotice) warnings.push("NOTICE documentation does not by itself make a license acceptable to RAT.");
      return { valid: errors.length === 0, errors, warnings };
    }

    const api = { isUnsafePattern, validate };
    app?.registerModule?.("ratPolicyValidator", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyValidator = registerMarkdownViewerRatPolicyValidator;
})(typeof window !== "undefined" ? window : globalThis);
