// Kubernetes tool path, kubeconfig, context, and namespace helpers.
(function(global) {
  "use strict";

  function registerMarkdownViewerKubernetesContext(app, deps = {}) {
    const state = {
      kubectlPath: "kubectl",
      helmPath: "helm",
      kubeconfigPath: "",
      currentContext: "",
      currentNamespace: "default"
    };

    function normalizeValue(value) {
      return String(value || "").trim();
    }

    function getSetting(name, fallback) {
      const value = deps.getSetting?.(name);
      return normalizeValue(value || state[name] || fallback || "");
    }

    function setSetting(name, value) {
      state[name] = normalizeValue(value);
      deps.setSetting?.(name, state[name]);
      return state[name];
    }

    function getKubectlPath() { return getSetting("kubectlPath", "kubectl") || "kubectl"; }
    function getHelmPath() { return getSetting("helmPath", "helm") || "helm"; }
    function getKubeconfigPath() { return getSetting("kubeconfigPath", ""); }
    function getCurrentContext() { return getSetting("currentContext", ""); }
    function getCurrentNamespace() { return getSetting("currentNamespace", "default") || "default"; }
    function setCurrentContext(contextName) { return setSetting("currentContext", contextName); }
    function setCurrentNamespace(namespaceName) { return setSetting("currentNamespace", namespaceName || "default"); }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function buildKubectlPrefix(options = {}) {
      const args = [quote(getKubectlPath())];
      const kubeconfigPath = normalizeValue(options.kubeconfigPath || getKubeconfigPath());
      const contextName = normalizeValue(options.contextName || getCurrentContext());
      const namespaceName = normalizeValue(Object.prototype.hasOwnProperty.call(options, "namespaceName") ? options.namespaceName : getCurrentNamespace());
      if (kubeconfigPath) args.push("--kubeconfig", quote(kubeconfigPath));
      if (contextName) args.push("--context", quote(contextName));
      if (namespaceName && options.includeNamespace !== false) args.push("--namespace", quote(namespaceName));
      return args.join(" ");
    }

    function buildHelmPrefix() {
      return quote(getHelmPath());
    }

    function getContextSummary() {
      return {
        kubeconfigPath: getKubeconfigPath(),
        contextName: getCurrentContext() || "current context",
        namespaceName: getCurrentNamespace()
      };
    }

    const api = {
      buildHelmPrefix,
      buildKubectlPrefix,
      getContextSummary,
      getCurrentContext,
      getCurrentNamespace,
      getHelmPath,
      getKubeconfigPath,
      getKubectlPath,
      setCurrentContext,
      setCurrentNamespace
    };
    app?.registerModule?.("kubernetesContext", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesContext = registerMarkdownViewerKubernetesContext;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerKubernetesContext };
  }
})(typeof window !== "undefined" ? window : globalThis);
