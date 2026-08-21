// Rich modal presentation for Helm and Kubernetes command results.
(function(global) {
  "use strict";

  /** Register the Helm/Kubernetes command result modal. */
  function registerMarkdownViewerProjectCommandResultModal(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const parser = deps.parser || app?.modules?.kubernetesCommandResultParser;
    const graphBuilder = deps.graphBuilder || app?.modules?.kubernetesManifestGraph;
    const topologyRenderer = deps.topologyRenderer || app?.modules?.kubernetesTopologyRenderer;
    const openKubernetesTopologyInTab = deps.openKubernetesTopologyInTab || app?.modules?.tabs?.openKubernetesTopologyInTab;

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
      const graph = result.graph || graphBuilder?.buildFromYaml?.(result.manifestContent || result.renderedYaml || result.stdout || "", { sourceRefs: result.sourceRefs || [] }) || { nodes: [], edges: [], warnings: [] };
      const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
      const edges = Array.isArray(graph.edges) ? graph.edges : [];
      if (!nodes.length) {
        panel.appendChild(createElement("p", "project-command-muted", graph.warnings?.[0] || "No Kubernetes resources were detected in the command output."));
        return;
      }
      if (topologyRenderer?.render) {
        result.graph = graph;
        topologyRenderer.render(panel, graph, {
          result,
          openPath: deps.openPath,
          openInTab: function(openGraph, openResult) {
            return openKubernetesTopologyInTab?.(openGraph, openResult || result, {
              manifestContent: result.manifestContent || result.renderedYaml || result.stdout || ""
            });
          }
        });
        return;
      }
      const details = createElement("div", "project-command-topology-details", "Select a node or relationship to inspect it.");
      const wrap = createElement("div", "project-command-topology");
      const lanes = createElement("div", "project-command-topology-lanes");
      const edgeList = createElement("div", "project-command-topology-edges");
      const svgNamespace = "http://www.w3.org/2000/svg";
      function createSvgElement(tagName, attributes = {}) {
        const element = documentRef.createElementNS?.(svgNamespace, tagName);
        if (!element) return null;
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
        return element;
      }
      function createTopologyCanvas() {
        const svg = createSvgElement("svg", { class: "project-command-topology-canvas", role: "img", "aria-label": "Kubernetes topology" });
        if (!svg) return null;
        const columnWidth = 210;
        const rowHeight = 74;
        const nodeWidth = 164;
        const nodeHeight = 42;
        const kindIndexes = new Map(orderedKinds.map((kind, index) => [kind, index]));
        const rowIndexes = new Map();
        const positions = new Map();
        nodes.forEach((node) => {
          const column = kindIndexes.get(node.kind) || 0;
          const row = rowIndexes.get(node.kind) || 0;
          rowIndexes.set(node.kind, row + 1);
          positions.set(node.id, { x: 18 + column * columnWidth, y: 22 + row * rowHeight });
        });
        const usedColumns = Math.max(1, new Set(nodes.map((node) => kindIndexes.get(node.kind) || 0)).size);
        const usedRows = Math.max(1, ...Array.from(rowIndexes.values()));
        svg.setAttribute("viewBox", `0 0 ${Math.max(360, usedColumns * columnWidth + 24)} ${Math.max(120, usedRows * rowHeight + 40)}`);
        edges.forEach((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return;
          const line = createSvgElement("path", { class: "project-command-topology-line", d: `M ${from.x + nodeWidth} ${from.y + nodeHeight / 2} L ${to.x} ${to.y + nodeHeight / 2}` });
          if (line) svg.appendChild(line);
        });
        nodes.forEach((node) => {
          const position = positions.get(node.id);
          if (!position) return;
          const group = createSvgElement("g", { class: "project-command-topology-svg-node", tabindex: "0" });
          const rect = createSvgElement("rect", { x: position.x, y: position.y, width: nodeWidth, height: nodeHeight, rx: 8 });
          const label = createSvgElement("text", { x: position.x + 10, y: position.y + 18 });
          const kind = createSvgElement("text", { x: position.x + 10, y: position.y + 34, class: "project-command-topology-svg-kind" });
          if (!group || !rect || !label || !kind) return;
          label.textContent = node.name || node.label || node.id;
          kind.textContent = node.kind || "Resource";
          group.append(rect, label, kind);
          group.addEventListener("click", () => showDetails(node.label || node.id, [
            { label: "Kind", value: node.kind || "Resource" },
            { label: "Name", value: node.name || node.label || node.id },
            { label: "Namespace", value: node.namespace || "" },
            { label: "ID", value: node.id || "" }
          ]));
          svg.appendChild(group);
        });
        return svg;
      }
      const kinds = ["Namespace", "Ingress", "Service", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "PodTemplate", "ConfigMap", "Secret", "PersistentVolumeClaim", "ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"];
      const orderedKinds = kinds.concat([...new Set(nodes.map((node) => node.kind).filter((kind) => !kinds.includes(kind)))]);
      function showDetails(title, rows) {
        details.replaceChildren();
        details.appendChild(createElement("strong", "", title));
        rows.filter((row) => row.value).forEach((row) => {
          const item = createElement("div", "project-command-topology-detail-row");
          item.append(createElement("span", "", row.label), createElement("code", "", row.value));
          details.appendChild(item);
        });
      }
      orderedKinds.forEach((kind) => {
        const kindNodes = nodes.filter((node) => node.kind === kind);
        if (!kindNodes.length) return;
        const lane = createElement("section", "project-command-topology-lane");
        lane.appendChild(createElement("h3", "", kind));
        const laneNodes = createElement("div", "project-command-topology-node-list");
        kindNodes.forEach((node) => {
          const button = createElement("button", `project-command-topology-node kind-${String(node.kind || "resource").toLowerCase()}`);
          button.type = "button";
          button.dataset.nodeId = node.id;
          button.append(createElement("span", "project-command-topology-node-label", node.label || node.id), createElement("small", "", node.namespace || ""));
          button.addEventListener("click", () => showDetails(node.label || node.id, [
            { label: "Kind", value: node.kind || "Resource" },
            { label: "Name", value: node.name || node.label || node.id },
            { label: "Namespace", value: node.namespace || "" },
            { label: "ID", value: node.id || "" }
          ]));
          laneNodes.appendChild(button);
        });
        lane.appendChild(laneNodes);
        lanes.appendChild(lane);
      });
      if (edges.length) {
        edgeList.appendChild(createElement("h3", "", "Relationships"));
        edges.forEach((edge) => {
          const from = nodes.find((node) => node.id === edge.from);
          const to = nodes.find((node) => node.id === edge.to);
          const button = createElement("button", "project-command-topology-edge");
          button.type = "button";
          button.append(createElement("span", "", `${from?.label || edge.from} -> ${to?.label || edge.to}`), createElement("strong", "", edge.label || "relates"));
          button.addEventListener("click", () => showDetails(edge.label || "Relationship", [
            { label: "From", value: from?.label || edge.from },
            { label: "To", value: to?.label || edge.to },
            { label: "Reason", value: edge.reason || "" }
          ]));
          edgeList.appendChild(button);
        });
      }
      const canvas = createTopologyCanvas();
      if (canvas) wrap.appendChild(canvas);
      wrap.append(lanes, edgeList, details);
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
        if (button.dataset.resultTab === "graph") {
          panels.graph.querySelector(".project-command-topology-forge")?.dispatchEvent(new Event("kubernetes-topology-redraw"));
        }
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
