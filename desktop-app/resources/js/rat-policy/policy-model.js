(function(global) {
  "use strict";

  /** Own the editable, non-persistent Apache RAT policy draft. */
  function registerMarkdownViewerRatPolicyModel(app) {
    const CURRENT_PLUGIN_VERSION = "0.18";

    /** Create a conservative policy draft from the current project inventory. */
    function createDraft(inventory, options = {}) {
      const governingPom = inventory.governing?.pomPath || inventory.module?.pomPath || inventory.rootPom?.path || "";
      return {
        mode: options.mode === "advanced" ? "advanced" : "guided",
        route: options.route || "overview",
        projectPath: inventory.projectPath,
        targetPomPath: governingPom,
        pluginVersion: inventory.pluginVersion || CURRENT_PLUGIN_VERSION,
        projectLicense: inventory.projectLicense?.identifier || "",
        customLicenseName: inventory.projectLicense?.name || "",
        licenseFilePath: inventory.documents.find((entry) => /^LICENSE(?:\.|$)/i.test(entry.name))?.path || "",
        bindToVerify: !inventory.hasBoundExecution,
        scanScope: "module",
        includeSubprojects: true,
        useExternalConfiguration: false,
        externalConfigurationPath: "rat-config.xml",
        useExclusionFile: false,
        exclusionFilePath: ".rat-excludes",
        exclusions: [],
        approvedFamilies: [],
        customLicenses: [],
        documentation: { createThirdPartyInventory: false, updateNotice: false },
        reportStyle: "plain-rat",
        skip: false,
        disableExecution: false,
        acknowledgedBypass: false,
        acknowledgePolicyOwnership: false,
        acknowledgeAmbiguousScope: false,
        dirty: false
      };
    }

    /** Return an immutable-style updated draft for predictable wizard rendering. */
    function update(draft, patch) {
      return { ...draft, ...patch, dirty: true };
    }

    const api = { CURRENT_PLUGIN_VERSION, createDraft, update };
    app?.registerModule?.("ratPolicyModel", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyModel = registerMarkdownViewerRatPolicyModel;
})(typeof window !== "undefined" ? window : globalThis);
