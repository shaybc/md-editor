(function(global) {
  "use strict";

  /** Verify an applied policy by delegating to the existing RAT command runner. */
  function registerMarkdownViewerRatPolicyVerifier(app, deps = {}) {
    /** Run RAT for the selected scope and summarize policy-level success. */
    async function run(inventory, scope = "module") {
      const result = await deps.runner.runCheck(inventory, scope);
      let status = "RAT execution failed";
      if (result.succeeded && !result.findings.length && Number(result.unapprovedCount || 0) === 0) status = "Policy check passed";
      else if (result.findings.length || Number(result.unapprovedCount) > 0) status = "Policy active; findings require review";
      return { ...result, status };
    }

    const api = { run };
    app?.registerModule?.("ratPolicyVerifier", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyVerifier = registerMarkdownViewerRatPolicyVerifier;
})(typeof window !== "undefined" ? window : globalThis);
