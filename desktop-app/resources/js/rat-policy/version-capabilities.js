(function(global) {
  "use strict";

  /** Own version-dependent Apache RAT policy capabilities. */
  function registerMarkdownViewerRatPolicyVersionCapabilities(app) {
    const SUPPORTED_SCHEMAS = new Set(["0.17", "0.18"]);

    /** Normalize a Maven version expression to a concrete major/minor version when possible. */
    function normalizeVersion(value) {
      const match = String(value || "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
      return match ? `${Number(match[1])}.${Number(match[2])}${match[3] ? `.${Number(match[3])}` : ""}` : "";
    }

    /** Describe policy features that are safe for the detected RAT version. */
    function resolve(version) {
      const normalized = normalizeVersion(version);
      const majorMinor = normalized.split(".").slice(0, 2).join(".");
      const numeric = normalized ? normalized.split(".").map(Number) : [];
      const modernConfiguration = numeric.length >= 2 && (numeric[0] > 0 || numeric[1] >= 16);
      return {
        version: normalized,
        known: Boolean(normalized),
        schemaVersion: SUPPORTED_SCHEMAS.has(majorMinor) ? majorMinor : "",
        hasBundledSchema: SUPPORTED_SCHEMAS.has(majorMinor),
        supportsConfigFiles: modernConfiguration,
        supportsModernLicenseDefinitions: modernConfiguration,
        supportsApprovedFamilies: modernConfiguration,
        inputExcludeOption: modernConfiguration ? "inputExclude" : "exclude",
        validationLevel: SUPPORTED_SCHEMAS.has(majorMinor) ? "version-matched" : "structural-only"
      };
    }

    const api = { normalizeVersion, resolve };
    app?.registerModule?.("ratPolicyVersionCapabilities", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyVersionCapabilities = registerMarkdownViewerRatPolicyVersionCapabilities;
})(typeof window !== "undefined" ? window : globalThis);
