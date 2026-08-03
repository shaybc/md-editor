(function(global) {
  "use strict";

  /** Generate reviewed external RAT exclusion files. */
  function registerMarkdownViewerRatPolicyExclusionPlanner(app, deps = {}) {
    /** Create an exclusion file only after all patterns pass the broad-pattern guard. */
    function create(patterns) {
      const normalized = Array.from(new Set((patterns || []).map((value) => String(value || "").trim()).filter(Boolean)));
      const unsafe = normalized.find((value) => deps.validator.isUnsafePattern(value));
      if (unsafe) throw new Error(`The exclusion pattern '${unsafe}' is too broad.`);
      return [
        "# Apache RAT exclusions reviewed in MD-Editor.",
        "# Exclusion prevents inspection; it does not approve or determine a file's license.",
        ...normalized,
        ""
      ].join("\n");
    }

    const api = { create };
    app?.registerModule?.("ratPolicyExclusionPlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyExclusionPlanner = registerMarkdownViewerRatPolicyExclusionPlanner;
})(typeof window !== "undefined" ? window : globalThis);
