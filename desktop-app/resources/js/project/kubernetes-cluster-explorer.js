// Read-only Kubernetes cluster explorer command helpers.
(function(global) {
  "use strict";

  function registerMarkdownViewerKubernetesClusterExplorer(app, deps = {}) {
    function getKubernetesContext() {
      return deps.kubernetesContext || app?.modules?.kubernetesContext || null;
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function kubectl(options = {}) {
      return getKubernetesContext()?.buildKubectlPrefix?.(options) || "kubectl";
    }

    async function run(command, title) {
      const runner = deps.runCommand || deps.terminal?.runCommand;
      if (typeof runner !== "function") throw new Error("Terminal execution is unavailable.");
      const result = await runner(command, { title, interactive: false, captureOutput: true });
      if (Number(result?.exitCode ?? 0) !== 0) throw new Error(`${title || "kubectl"} exited with code ${Number(result?.exitCode ?? 0)}.`);
      return String(result?.stdout || result?.output || "");
    }

    function parseTable(output) {
      const lines = String(output || "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].trim().split(/\s{2,}|\t+/).map((header) => header.toLowerCase());
      return lines.slice(1).map((line) => {
        const columns = line.trim().split(/\s{2,}|\t+/);
        const row = {};
        headers.forEach((header, index) => { row[header] = columns[index] || ""; });
        return row;
      });
    }

    function parseNames(output) {
      return String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    async function refresh() {
      const [contexts, namespaces] = await Promise.all([listContexts(), listNamespaces()]);
      return { contexts, namespaces };
    }

    async function listContexts() {
      const output = await run(`${kubectl({ includeNamespace: false })} config get-contexts -o name`, "Kubernetes Contexts");
      return parseNames(output);
    }

    async function listNamespaces() {
      const output = await run(`${kubectl({ includeNamespace: false })} get namespaces -o name`, "Kubernetes Namespaces");
      return parseNames(output).map((name) => name.replace(/^namespace\//, ""));
    }

    async function listWorkloads(namespace) {
      const output = await run(`${kubectl({ namespaceName: namespace })} get deployments,statefulsets,daemonsets,services,nodes -o wide`, "Kubernetes Workloads");
      return parseTable(output);
    }

    async function listPods(namespace) {
      const output = await run(`${kubectl({ namespaceName: namespace })} get pods -o wide`, "Kubernetes Pods");
      return parseTable(output);
    }

    async function describeResource(resourceRef) {
      const ref = String(resourceRef?.name || resourceRef || "").trim();
      if (!ref) throw new Error("No Kubernetes resource was selected.");
      return await run(`${kubectl({ namespaceName: resourceRef?.namespace })} describe ${quote(ref)}`, "Kubernetes Describe");
    }

    async function getLogs(podRef, options = {}) {
      const pod = String(podRef?.name || podRef || "").trim();
      if (!pod) throw new Error("No pod was selected.");
      const follow = options.follow ? " -f" : "";
      const container = options.container ? ` -c ${quote(options.container)}` : "";
      return await run(`${kubectl({ namespaceName: podRef?.namespace })} logs${follow}${container} ${quote(pod)}`, follow ? "Kubernetes Follow Logs" : "Kubernetes Logs");
    }

    async function getEvents(namespace) {
      return await run(`${kubectl({ namespaceName: namespace })} get events --sort-by=.lastTimestamp`, "Kubernetes Events");
    }

    const api = { describeResource, getEvents, getLogs, listContexts, listNamespaces, listPods, listWorkloads, refresh };
    app?.registerModule?.("kubernetesClusterExplorer", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesClusterExplorer = registerMarkdownViewerKubernetesClusterExplorer;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerKubernetesClusterExplorer };
  }
})(typeof window !== "undefined" ? window : globalThis);
