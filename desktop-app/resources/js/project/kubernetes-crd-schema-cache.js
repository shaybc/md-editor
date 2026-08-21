// Kubernetes CRD OpenAPI schema cache populated from kubectl.
(function(global) {
  "use strict";

  function registerMarkdownViewerKubernetesCrdSchemaCache(app, deps = {}) {
    const cache = new Map();
    let enabled = true;

    function getContextKey() {
      const context = deps.kubernetesContext || app?.modules?.kubernetesContext;
      const kubeconfig = context?.getKubeconfigPath?.() || "";
      const name = context?.getCurrentContext?.() || "current";
      return `${kubeconfig}|${name}`;
    }

    function parseCrdSchemas(crdJson) {
      const parsed = typeof crdJson === "string" ? JSON.parse(crdJson || "{}") : crdJson || {};
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const schemas = [];
      items.forEach((crd) => {
        const group = crd?.spec?.group || "";
        const names = crd?.spec?.names || {};
        const kind = names.kind || "";
        const versions = Array.isArray(crd?.spec?.versions) ? crd.spec.versions : [];
        versions.forEach((version) => {
          const openAPIV3Schema = version?.schema?.openAPIV3Schema;
          if (!openAPIV3Schema || !kind || !version?.name) return;
          schemas.push({
            name: `${kind}.${group}/${version.name}`,
            uri: `kubernetes-crd://${encodeURIComponent(group)}/${encodeURIComponent(version.name)}/${encodeURIComponent(kind)}`,
            schema: openAPIV3Schema
          });
        });
      });
      return schemas;
    }

    async function loadForCurrentContext() {
      if (!enabled) return [];
      const key = getContextKey();
      if (cache.has(key)) return cache.get(key).slice();
      const kubernetesContext = deps.kubernetesContext || app?.modules?.kubernetesContext;
      const prefix = kubernetesContext?.buildKubectlPrefix?.({ includeNamespace: false }) || "kubectl";
      const command = `${prefix} get crd -o json`;
      const runner = deps.runCommand || deps.terminal?.runCommand;
      if (typeof runner !== "function") return [];
      try {
        const result = await runner(command, { title: "Kubernetes CRDs", interactive: false, captureOutput: true });
        if (Number(result?.exitCode ?? 0) !== 0) return [];
        const schemas = parseCrdSchemas(result?.stdout || result?.output || "");
        cache.set(key, schemas);
        return schemas.slice();
      } catch (_error) {
        return [];
      }
    }

    function getCachedSchemas() {
      return cache.get(getContextKey())?.slice() || [];
    }

    function clear() {
      cache.clear();
    }

    function setEnabled(value) {
      enabled = value !== false;
    }

    const api = { clear, getCachedSchemas, loadForCurrentContext, parseCrdSchemas, setEnabled };
    app?.registerModule?.("kubernetesCrdSchemaCache", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesCrdSchemaCache = registerMarkdownViewerKubernetesCrdSchemaCache;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerKubernetesCrdSchemaCache };
  }
})(typeof window !== "undefined" ? window : globalThis);
