(function(global) {
  "use strict";

  /** Resolve bundled RAT policy references without requiring a network connection. */
  function registerMarkdownViewerRatPolicyReferenceCatalog(app, deps = {}) {
    const MANIFEST_URL = "/assets/rat-policy/manifest.json";
    let manifestPromise = null;

    /** Load the provenance and capability manifest for bundled policy references. */
    async function loadManifest() {
      if (!manifestPromise) {
        const fetchImpl = deps.fetch || global.fetch;
        manifestPromise = fetchImpl(MANIFEST_URL).then((response) => {
          if (!response.ok) throw new Error("The offline RAT policy reference manifest is unavailable.");
          return response.json();
        }).catch((error) => {
          manifestPromise = null;
          throw error;
        });
      }
      return manifestPromise;
    }

    /** Return the best local schema entry for a detected RAT version. */
    async function getSchema(version) {
      const manifest = await loadManifest();
      return (manifest.schemas || []).find((entry) => entry.ratVersion === version) || null;
    }

    /** Return a bundled, MD-Editor-authored template by stable identifier. */
    async function getTemplate(id) {
      const manifest = await loadManifest();
      return (manifest.templates || []).find((entry) => entry.id === id) || null;
    }

    const api = { getSchema, getTemplate, loadManifest };
    app?.registerModule?.("ratPolicyReferenceCatalog", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyReferenceCatalog = registerMarkdownViewerRatPolicyReferenceCatalog;
})(typeof window !== "undefined" ? window : globalThis);
