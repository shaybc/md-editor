// Kubernetes and Helm command result diagnostics.
(function(global) {
  "use strict";

  /** Register parser for common Helm and Kubernetes command failures. */
  function registerMarkdownViewerKubernetesCommandResultParser(app) {
    function getOutput(result = {}) {
      return String([result.stderr, result.stdout, result.output].filter(Boolean).join("\n"));
    }

    function addDiagnostic(items, severity, title, message, action, helpUrl) {
      items.push({ severity, title, message, action, helpUrl });
    }

    /** Parse a structured command result into normalized diagnostics. */
    function parse(result = {}) {
      const diagnostics = [];
      const output = getOutput(result);
      const text = output.toLowerCase();
      const tool = String(result.tool || "").toLowerCase();
      if (!output && result.ok) return diagnostics;
      if (text.includes("'kubectl' is not recognized") || text.includes("kubectl: command not found") || text.includes("kubectl: not found")) {
        addDiagnostic(diagnostics, "error", "kubectl is not installed", "Install kubectl or set its full path in Settings > Frameworks > Kubernetes.", "Open Kubernetes settings and configure kubectl.", "https://kubernetes.io/docs/tasks/tools/");
      }
      if (text.includes("'helm' is not recognized") || text.includes("helm: command not found") || text.includes("helm: not found")) {
        addDiagnostic(diagnostics, "error", "Helm is not installed", "Install Helm or set its full path in Settings > Frameworks > Kubernetes.", "Open Kubernetes settings and configure Helm.", "https://helm.sh/docs/intro/install/");
      }
      if (text.includes("failed to download openapi") || text.includes("openapi") && text.includes("--validate=false")) {
        addDiagnostic(diagnostics, "error", "The selected server is not a Kubernetes API server", "kubectl reached the configured endpoint, but it did not expose the Kubernetes OpenAPI schema. This usually means the current context points to a normal HTTP server or an incompatible cluster endpoint.", "Select a real Kubernetes context, run Client Dry Run, or rerun Server Dry Run with schema validation disabled from the options dialog.", "https://kubernetes.io/docs/setup/learning-environment/");
      }
      if (text.includes("does not exist") || text.includes("no such file or directory") || text.includes("the system cannot find the file specified")) {
        addDiagnostic(diagnostics, "error", "Manifest file was not found", "kubectl could not read the manifest path used by this command.", "Save the manifest or use the rendered Helm dry-run workflow so MD-Editor creates a temporary manifest.", "https://kubernetes.io/docs/reference/kubectl/");
      }
      if (tool === "helm" && (text.includes("error:") || text.includes("failed"))) {
        addDiagnostic(diagnostics, "error", "Helm command failed", "Helm reported an error while processing the chart.", "Review the Output tab and open the chart files listed in Resources.", "https://helm.sh/docs/helm/helm_template/");
      }
      if (!diagnostics.length && Number(result.exitCode || 0) !== 0) {
        addDiagnostic(diagnostics, "error", `${result.tool || "Command"} exited with code ${result.exitCode}`, "The command failed. Review the Output tab for the raw tool output.", "Use the terminal output and linked files to investigate.", "");
      }
      return diagnostics;
    }

    const api = { parse };
    app?.registerModule?.("kubernetesCommandResultParser", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesCommandResultParser = registerMarkdownViewerKubernetesCommandResultParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesCommandResultParser };
})(typeof window !== "undefined" ? window : globalThis);