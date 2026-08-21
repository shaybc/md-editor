// Rich modal presentation for Helm and Kubernetes command results.
(function(global) {
  "use strict";

  /** Register the Helm/Kubernetes command result modal. */
  function registerMarkdownViewerProjectCommandResultModal(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const parser = deps.parser || app?.modules?.kubernetesCommandResultParser;
    const graphBuilder = deps.graphBuilder || app?.modules?.kubernetesManifestGraph;

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function ensureModal() {
      let modal = documentRef.getElementById("project-command-result-modal");
      if (modal) return modal;
      modal = createElement("div", "reset-modal-overlay project-command-result-modal");
      modal.id = "project-command-result-modal";
      modal.hidden = true;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "project-command-result-title");
      documentRef.body.appendChild(modal);
      return modal;
    }

    function getOutput(result) {
      return String([result?.stderr, result?.stdout, result?.output].filter(Boolean).join("\n"));
    }

    function formatDuration(ms) {
      const value = Number(ms || 0);
      return value > 0 ? `${value} ms` : "n/a";
    }

    function createTabButton(label, active) {
      const button = createElement("button", `project-command-result-tab${active ? " active" : ""}`, label);
      button.type = "button";
      button.dataset.resultTab = label.toLowerCase();
      return button;
    }

    function createPanel(name, active) {
      const panel = createElement("div", `project-command-result-panel${active ? " active" : ""}`);
      panel.dataset.resultPanel = name.toLowerCase();
      return panel;
    }

    function addKeyValue(parent, label, value) {
      const item = createElement("div", "project-command-result-kv");
      item.append(createElement("span", "", label), createElement("strong", "", value || "n/a"));
      parent.appendChild(item);
    }

    function renderSummary(panel, result) {
      const grid = createElement("div", "project-command-summary-grid");
      addKeyValue(grid, "Tool", result.tool || "command");
      addKeyValue(grid, "Command", result.commandName || "");
      addKeyValue(grid, "Exit code", String(result.exitCode ?? "n/a"));
      addKeyValue(grid, "Duration", formatDuration(result.durationMs));
      addKeyValue(grid, "Context", result.contextSummary?.contextName || "current context");
      addKeyValue(grid, "Namespace", result.contextSummary?.namespaceName || "default");
      panel.appendChild(grid);
      const command = createElement("pre", "project-command-code", result.command || "");
      panel.appendChild(command);
    }

    function renderOutput(panel, result) {
      const output = getOutput(result) || "No command output.";
      const actions = createElement("div", "project-command-inline-actions");
      const copy = createElement("button", "reset-modal-btn project-command-modal-btn", "Copy output");
      copy.type = "button";
      copy.addEventListener("click", () => deps.copyText?.(output));
      actions.appendChild(copy);
      panel.appendChild(actions);
      panel.appendChild(createElement("pre", "project-command-output", output));
    }

    function renderDiagnostics(panel, result, diagnostics) {
      if (!diagnostics.length) {
        panel.appendChild(createElement("p", "project-command-muted", result.ok ? "No diagnostics. The command completed successfully." : "No structured diagnostics were detected. Review the Output tab."));
        return;
      }
      diagnostics.forEach((diagnostic) => {
        const item = createElement("div", `project-command-diagnostic ${diagnostic.severity || "info"}`);
        item.append(createElement("h3", "", diagnostic.title || "Diagnostic"));
        item.append(createElement("p", "", diagnostic.message || ""));
        if (diagnostic.action) item.append(createElement("p", "project-command-muted", diagnostic.action));
        panel.appendChild(item);
      });
    }

    function renderResources(panel, result) {
      const refs = Array.isArray(result.sourceRefs) ? result.sourceRefs : [];
      if (!refs.length) {
        panel.appendChild(createElement("p", "project-command-muted", "No file or resource links were reported for this command."));
        return;
      }
      refs.forEach((ref) => {
        const row = createElement("button", "project-command-resource-link", ref.label || ref.path || ref.kind || "resource");
        row.type = "button";
        row.addEventListener("click", () => deps.openPath?.(ref.path, ref));
        panel.appendChild(row);
      });
    }

    function renderGraph(panel, result) {
      const graph = result.graph || graphBuilder?.buildFromYaml?.(result.manifestContent || result.renderedYaml || result.stdout || "") || { nodes: [], edges: [] };
      if (!graph.nodes?.length) {
        panel.appendChild(createElement("p", "project-command-muted", "No Kubernetes resources were detected in the command output."));
        return;
      }
      const wrap = createElement("div", "project-command-graph");
      graph.nodes.forEach((node) => wrap.appendChild(createElement("div", "project-command-graph-node", node.label || node.id)));
      graph.edges.forEach((edge) => wrap.appendChild(createElement("div", "project-command-graph-edge", `${edge.from} -> ${edge.to}${edge.label ? ` (${edge.label})` : ""}`)));
      panel.appendChild(wrap);
    }

    function renderHelp(panel, result, diagnostics) {
      const links = [
        { label: "Kubernetes local environments", url: "https://kubernetes.io/docs/setup/learning-environment/" },
        { label: "kubectl reference", url: "https://kubernetes.io/docs/reference/kubectl/" },
        { label: "Helm template", url: "https://helm.sh/docs/helm/helm_template/" },
        { label: "Helm lint", url: "https://helm.sh/docs/helm/helm_lint/" }
      ];
      diagnostics.forEach((diagnostic) => { if (diagnostic.helpUrl) links.unshift({ label: diagnostic.title, url: diagnostic.helpUrl }); });
      const seen = new Set();
      links.filter((link) => link.url && !seen.has(link.url) && seen.add(link.url)).forEach((link) => {
        const button = createElement("button", "project-command-help-link", link.label);
        button.type = "button";
        button.addEventListener("click", () => deps.openExternal?.(link.url));
        panel.appendChild(button);
      });
    }

    /** Open the command result modal for a structured command result. */
    function open(result = {}) {
      const modal = ensureModal();
      const diagnostics = Array.isArray(result.diagnostics) && result.diagnostics.length ? result.diagnostics : (parser?.parse?.(result) || []);
      const status = result.ok ? "Succeeded" : "Failed";
      modal.replaceChildren();
      modal.innerHTML = '<div class="reset-modal-box project-command-result-box"></div>';
      const box = modal.querySelector(".project-command-result-box");
      const header = createElement("div", "project-command-modal-header");
      const titleWrap = createElement("div");
      titleWrap.append(createElement("p", "project-command-modal-eyebrow", `${result.tool || "Command"} ${status}`));
      titleWrap.append(createElement("h2", "", result.title || result.commandName || "Command result"));
      titleWrap.querySelector("h2").id = "project-command-result-title";
      const close = createElement("button", "settings-modal-close");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.innerHTML = '<i class="bi bi-x" aria-hidden="true"></i>';
      header.append(titleWrap, close);
      const tabs = createElement("div", "project-command-result-tabs");
      ["Summary", "Output", "Diagnostics", "Resources", "Graph", "Help"].forEach((label, index) => tabs.appendChild(createTabButton(label, index === 0)));
      const body = createElement("div", "project-command-result-body");
      const panels = {
        summary: createPanel("summary", true),
        output: createPanel("output", false),
        diagnostics: createPanel("diagnostics", false),
        resources: createPanel("resources", false),
        graph: createPanel("graph", false),
        help: createPanel("help", false)
      };
      renderSummary(panels.summary, result);
      renderOutput(panels.output, result);
      renderDiagnostics(panels.diagnostics, result, diagnostics);
      renderResources(panels.resources, result);
      renderGraph(panels.graph, result);
      renderHelp(panels.help, result, diagnostics);
      Object.values(panels).forEach((panel) => body.appendChild(panel));
      const actions = createElement("div", "reset-modal-actions project-command-modal-actions");
      const ok = createElement("button", "reset-modal-btn settings-primary-action project-command-modal-btn", "Close");
      ok.type = "button";
      actions.appendChild(ok);
      box.append(header, tabs, body, actions);
      tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-result-tab]");
        if (!button) return;
        tabs.querySelectorAll(".project-command-result-tab").forEach((item) => item.classList.toggle("active", item === button));
        body.querySelectorAll(".project-command-result-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.resultPanel === button.dataset.resultTab));
      });
      function closeModal() { modal.hidden = true; modal.style.display = "none"; }
      close.addEventListener("click", closeModal);
      ok.addEventListener("click", closeModal);
      modal.hidden = false;
      modal.style.display = "flex";
      ok.focus?.();
      return result;
    }

    const api = { open };
    app?.registerModule?.("projectCommandResultModal", api);
    return api;
  }

  global.registerMarkdownViewerProjectCommandResultModal = registerMarkdownViewerProjectCommandResultModal;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerProjectCommandResultModal };
})(typeof window !== "undefined" ? window : globalThis);