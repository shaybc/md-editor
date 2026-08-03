(function(global) {
  "use strict";

  /** Generate explicit external Apache RAT configuration drafts. */
  function registerMarkdownViewerRatPolicyRatConfigPlanner(app) {
    function escapeXml(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function matcherElement(license, indent) {
      const type = ["text", "regex", "spdx"].includes(license.matcherType) ? license.matcherType : "text";
      return `${indent}<${type}>${escapeXml(license.matcherEvidence)}</${type}>`;
    }

    /** Generate a reviewable RAT config file containing only user-selected definitions. */
    function create(draft) {
      const families = draft.customLicenses.map((license) => `    <family id="${escapeXml(license.familyId)}" name="${escapeXml(license.familyName || license.familyId)}" />`).join("\n");
      const licenses = draft.customLicenses.map((license) => [
        `    <license family="${escapeXml(license.familyId)}" id="${escapeXml(license.licenseId || license.familyId)}" name="${escapeXml(license.familyName || license.familyId)}">`,
        matcherElement(license, "      "),
        "    </license>"
      ].join("\n")).join("\n");
      const approved = draft.approvedFamilies.map((family) => `    <family license_ref="${escapeXml(family)}" />`).join("\n");
      return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!-- Generated as a reviewed draft by MD-Editor. Apache RAT policy is a project decision. -->",
        "<rat-config>",
        "  <families>", families, "  </families>",
        "  <licenses>", licenses, "  </licenses>",
        "  <approved>", approved, "  </approved>",
        "</rat-config>", ""
      ].filter((line) => line !== "").join("\n");
    }

    const api = { create };
    app?.registerModule?.("ratPolicyRatConfigPlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyRatConfigPlanner = registerMarkdownViewerRatPolicyRatConfigPlanner;
})(typeof window !== "undefined" ? window : globalThis);
