// Render Kubernetes topology graphs as a KubeForge-style node canvas.
(function(global) {
  "use strict";

  /** Register the Kubernetes topology renderer used by command result modals. */
  function registerMarkdownViewerKubernetesTopologyRenderer(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const KIND_ORDER = ["Namespace", "Ingress", "Service", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "PodTemplate", "ConfigMap", "Secret", "PersistentVolumeClaim", "ServiceAccount", "Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"];
    const CARD_WIDTH = 430;
    const CARD_HEIGHT = 156;
    const COLUMN_GAP = 530;
    const ROW_GAP = 210;

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function createSvgElement(tagName, attributes = {}) {
      const element = documentRef.createElementNS?.("http://www.w3.org/2000/svg", tagName);
      if (!element) return null;
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
      return element;
    }

    function getOrderedKinds(nodes) {
      const extra = [...new Set(nodes.map((node) => node.kind || "Resource").filter((kind) => !KIND_ORDER.includes(kind)))];
      return KIND_ORDER.concat(extra).filter((kind) => nodes.some((node) => (node.kind || "Resource") === kind));
    }

    function getSavedPositions(savedLayout) {
      if (!savedLayout || typeof savedLayout !== "object") return {};
      return savedLayout.positions && typeof savedLayout.positions === "object" ? savedLayout.positions : savedLayout;
    }

    function layoutNodes(nodes, savedLayout) {
      const orderedKinds = getOrderedKinds(nodes);
      const kindColumns = new Map(orderedKinds.map((kind, index) => [kind, index]));
      const rowByKind = new Map();
      const positions = new Map();
      const savedPositions = getSavedPositions(savedLayout);
      nodes.forEach((node) => {
        const kind = node.kind || "Resource";
        const column = kindColumns.get(kind) || 0;
        const row = rowByKind.get(kind) || 0;
        rowByKind.set(kind, row + 1);
        const saved = savedPositions[node.id] || null;
        const savedX = Number(saved?.x);
        const savedY = Number(saved?.y);
        positions.set(node.id, {
          x: Number.isFinite(savedX) ? Math.max(0, savedX) : 36 + column * COLUMN_GAP,
          y: Number.isFinite(savedY) ? Math.max(0, savedY) : 34 + row * ROW_GAP + (column % 2 ? 46 : 0)
        });
      });
      const maxX = Math.max(720, ...Array.from(positions.values()).map((position) => position.x + CARD_WIDTH + 90));
      const maxY = Math.max(360, ...Array.from(positions.values()).map((position) => position.y + CARD_HEIGHT + 130));
      return { positions, width: maxX, height: maxY };
    }

    function getPositionsSnapshot(positions) {
      const snapshot = {};
      positions.forEach((position, nodeId) => {
        snapshot[nodeId] = { x: Math.round(position.x), y: Math.round(position.y) };
      });
      return { positions: snapshot };
    }

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function isAbsolutePath(path) {
      return /^[A-Za-z]:\//.test(path) || /^\//.test(path);
    }

    function getFileName(path) {
      return normalizePath(path).split("/").filter(Boolean).pop() || "";
    }

    function joinPath(basePath, relativePath) {
      const base = normalizePath(basePath).replace(/\/+$/, "");
      const relative = normalizePath(relativePath).replace(/^\/+/, "");
      return base && relative ? `${base}/${relative}` : (base || relative);
    }

    function getGraphSourceRefs(graph, options = {}) {
      return [
        ...(Array.isArray(graph?.sourceRefs) ? graph.sourceRefs : []),
        ...(Array.isArray(options.result?.sourceRefs) ? options.result.sourceRefs : [])
      ].filter((ref) => ref && ref.path);
    }

    function resolveNodeSourcePath(node, graph, options = {}) {
      const fileRef = normalizePath(node?.fileRef || node?.sourceFilePath || node?.filePath || "");
      const refs = getGraphSourceRefs(graph, options);
      if (!fileRef) {
        const manifestRefs = refs.filter((ref) => ["manifest", "active-file"].includes(ref.kind));
        return manifestRefs.length === 1 ? normalizePath(manifestRefs[0].path) : "";
      }
      if (isAbsolutePath(fileRef)) return fileRef;
      const direct = refs.find((ref) => normalizePath(ref.path).endsWith(`/${fileRef}`) || normalizePath(ref.path) === fileRef);
      if (direct) return normalizePath(direct.path);
      const chartRoot = refs.find((ref) => ref.kind === "chart" && ref.path)?.path || "";
      if (chartRoot) {
        const chartName = getFileName(chartRoot);
        const relative = chartName && fileRef.startsWith(`${chartName}/`) ? fileRef.slice(chartName.length + 1) : fileRef;
        return joinPath(chartRoot, relative);
      }
      return "";
    }

    async function openNodeSourceFile(node, graph, options = {}) {
      const openPath = options.openPath || deps.openPath;
      const path = resolveNodeSourcePath(node, graph, options);
      if (!path || typeof openPath !== "function") return false;
      await openPath(path, {
        kind: "kubernetes-topology-node",
        label: node?.label || node?.name || node?.id || "Kubernetes resource",
        path,
        nodeId: node?.id || "",
        fileRef: node?.fileRef || ""
      });
      return true;
    }
    function renderNodeRows(node) {
      if (Array.isArray(node?.fields) && node.fields.length) {
        return node.fields.map((field) => ({
          fieldId: field.id || "",
          path: field.path || field.label || "field",
          label: field.label || field.path || "field",
          type: field.type || "string",
          value: field.value || "",
          relationRole: field.relationRole || "related"
        })).filter((row) => row.path || row.value);
      }
      const rows = [
        { label: "apiVersion", path: "apiVersion", type: "string", value: node.apiVersion || "" },
        { label: "kind", path: "kind", type: "string", value: node.kind || "Resource" },
        { label: "metadata", path: "metadata", type: "objectRef", value: node.namespace || "default" }
      ];
      if (node.kind === "PodTemplate") rows.push({ label: "labels", path: "metadata.labels", type: "object", value: Object.keys(node.labels || {}).length ? Object.keys(node.labels).join(", ") : "template" });
      return rows.filter((row) => row.value);
    }

    function showDetails(details, title, rows) {
      details.replaceChildren();
      details.appendChild(createElement("strong", "", title));
      rows.filter((row) => row.value).forEach((row) => {
        const item = createElement("div", "project-command-topology-detail-row");
        item.append(createElement("span", "", row.label), createElement("code", "", row.value));
        details.appendChild(item);
      });
    }

    function cssEscapeValue(value) {
      if (global.CSS?.escape) return global.CSS.escape(String(value || ""));
      return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function findFieldPort(card, fieldId, fieldPath, side) {
      const sideClass = side === "in" ? "in" : "out";
      const selectors = [];
      if (fieldId) selectors.push(`.project-command-topology-forge-node-row[data-field-id="${cssEscapeValue(fieldId)}"] > .project-command-topology-forge-port.${sideClass}`);
      if (fieldPath) selectors.push(`.project-command-topology-forge-node-row[data-field-path="${cssEscapeValue(fieldPath)}"] > .project-command-topology-forge-port.${sideClass}`);
      for (const selector of selectors) {
        const port = card.querySelector(selector);
        if (port) return port;
      }
      return sideClass === "out" ? card.querySelector(":scope > .project-command-topology-forge-port.out.header") : card.querySelector(".project-command-topology-forge-node-row > .project-command-topology-forge-port.in");
    }

    function getElementOffsetWithin(element, ancestor) {
      let x = 0;
      let y = 0;
      let current = element;
      while (current && current !== ancestor) {
        x += Number(current.offsetLeft || 0);
        y += Number(current.offsetTop || 0);
        current = current.offsetParent;
      }
      return { x, y, reachedAncestor: current === ancestor };
    }

    function getPortPoint(nodeLayer, nodeId, fieldId, fieldPath, side, fallbackPosition) {
      const card = nodeLayer?.querySelector?.(`.project-command-topology-forge-node[data-node-id="${cssEscapeValue(nodeId)}"]`);
      if (!card) {
        return side === "out"
          ? { x: fallbackPosition.x + CARD_WIDTH, y: fallbackPosition.y + 24 }
          : { x: fallbackPosition.x, y: fallbackPosition.y + 24 };
      }
      const port = findFieldPort(card, fieldId, fieldPath, side);
      if (!port) {
        return side === "out"
          ? { x: card.offsetLeft + card.offsetWidth, y: card.offsetTop + 24 }
          : { x: card.offsetLeft, y: card.offsetTop + 24 };
      }
      const offset = getElementOffsetWithin(port, nodeLayer);
      if (!offset.reachedAncestor) {
        return side === "out"
          ? { x: card.offsetLeft + card.offsetWidth, y: card.offsetTop + 24 }
          : { x: card.offsetLeft, y: card.offsetTop + 24 };
      }
      return {
        x: offset.x + (port.offsetWidth / 2),
        y: offset.y + (port.offsetHeight / 2)
      };
    }

    function makePath(start, end) {
      const curve = Math.max(80, Math.abs(end.x - start.x) * 0.45);
      return `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`;
    }

    function renderLinks(svg, nodes, edges, positions, details, nodeLayer) {
      svg.replaceChildren();
      const defs = createSvgElement("defs");
      const marker = createSvgElement("marker", { id: "kubernetes-topology-arrow", markerWidth: 10, markerHeight: 10, refX: 8, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
      const markerPath = createSvgElement("path", { d: "M0,0 L0,6 L9,3 z", class: "project-command-topology-forge-arrow" });
      if (defs && marker && markerPath) {
        marker.appendChild(markerPath);
        defs.appendChild(marker);
        svg.appendChild(defs);
      }
      edges.forEach((edge) => {
        const fromPosition = positions.get(edge.from);
        const toPosition = positions.get(edge.to);
        if (!fromPosition || !toPosition) return;
        const fromNode = nodes.find((node) => node.id === edge.from);
        const toNode = nodes.find((node) => node.id === edge.to);
        const startPoint = getPortPoint(nodeLayer, edge.from, edge.sourceFieldId, edge.sourcePath, "out", fromPosition);
        const endPoint = getPortPoint(nodeLayer, edge.to, edge.targetFieldId, edge.targetPath, "in", toPosition);
        const path = createSvgElement("path", { class: "project-command-topology-forge-link", d: makePath(startPoint, endPoint), "marker-end": "url(#kubernetes-topology-arrow)" });
        if (!path) return;
        path.addEventListener("click", () => showDetails(details, edge.label || "Relationship", [
          { label: "From", value: fromNode?.label || edge.from },
          { label: "Source field", value: edge.sourcePath || edge.sourceFieldId || "" },
          { label: "To", value: toNode?.label || edge.to },
          { label: "Target field", value: edge.targetPath || edge.targetFieldId || "" },
          { label: "Relation", value: edge.relationKind || edge.label || "" },
          { label: "Reason", value: edge.reason || "" }
        ]));
        svg.appendChild(path);
      });
    }

    function setNodePosition(card, position) {
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
    }

    function isNodeInteractionTarget(target) {
      return !!target?.closest?.(".project-command-topology-forge-node");
    }

    function enableNodeDragging(card, node, positions, redrawLinks, viewState, options) {
      let dragStart = null;
      let didDrag = false;
      const stopCanvasGesture = (event) => event.stopPropagation();
      card.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const position = positions.get(node.id);
        if (!position) return;
        dragStart = {
          clientX: event.clientX,
          clientY: event.clientY,
          x: position.x,
          y: position.y
        };
        didDrag = false;
        card.classList.add("dragging");
        card.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
      });
      card.addEventListener("mousedown", stopCanvasGesture);
      card.addEventListener("touchstart", stopCanvasGesture, { passive: false });
      card.addEventListener("dragstart", (event) => event.preventDefault());
      card.addEventListener("pointermove", (event) => {
        if (!dragStart) return;
        const scale = Math.max(0.1, Number(viewState.scale || 1));
        const nextPosition = {
          x: Math.max(0, dragStart.x + ((event.clientX - dragStart.clientX) / scale)),
          y: Math.max(0, dragStart.y + ((event.clientY - dragStart.clientY) / scale))
        };
        if (Math.abs(nextPosition.x - dragStart.x) > 2 || Math.abs(nextPosition.y - dragStart.y) > 2) didDrag = true;
        positions.set(node.id, nextPosition);
        setNodePosition(card, nextPosition);
        redrawLinks();
        event.preventDefault();
        event.stopPropagation();
      });
      function stopDrag(event) {
        if (!dragStart) return;
        dragStart = null;
        card.classList.remove("dragging");
        card.releasePointerCapture?.(event.pointerId);
        if (didDrag) {
          card.dataset.dragged = "true";
          options?.onLayoutChanged?.(getPositionsSnapshot(positions));
        }
        event.stopPropagation();
      }
      card.addEventListener("pointerup", stopDrag);
      card.addEventListener("pointercancel", stopDrag);
    }

    function renderNode(nodeLayer, node, position, details, positions, redrawLinks, viewState, options) {
      const card = createElement("button", `project-command-topology-forge-node kind-${String(node.kind || "resource").toLowerCase()}`);
      card.type = "button";
      card.dataset.nodeId = node.id;
      setNodePosition(card, position);
      const header = createElement("div", "project-command-topology-forge-node-header");
      header.append(createElement("strong", "", `${node.name || node.label || node.id}`), createElement("span", "", node.kind || "Resource"));
      const rows = createElement("div", "project-command-topology-forge-node-rows");
      renderNodeRows(node).forEach((row) => {
        const item = createElement("div", `project-command-topology-forge-node-row role-${String(row.relationRole || "related").toLowerCase()}`);
        item.dataset.rowLabel = row.label;
        item.dataset.fieldId = row.fieldId || "";
        item.dataset.fieldPath = row.path || row.label || "";
        item.append(
          createElement("i", "project-command-topology-forge-port in"),
          createElement("span", "", row.label),
          createElement("em", "", row.type),
          createElement("code", "", row.value),
          createElement("i", "project-command-topology-forge-port out")
        );
        rows.appendChild(item);
      });
      card.append(createElement("i", "project-command-topology-forge-port out header"), header, rows, createElement("div", "project-command-topology-forge-node-footer", "}"));
      const sourcePath = resolveNodeSourcePath(node, options.graph || {}, options);
      if (sourcePath) {
        card.dataset.sourcePath = sourcePath;
        card.title = `Double-click to open ${getFileName(sourcePath) || sourcePath}`;
      }
      card.addEventListener("dblclick", async (event) => {
        if (card.dataset.dragged === "true") return;
        if (await openNodeSourceFile(node, options.graph || {}, options)) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
      card.addEventListener("click", (event) => {
        if (card.dataset.dragged === "true") {
          card.dataset.dragged = "";
          event.preventDefault();
          return;
        }
        const detailRows = [
          { label: "Kind", value: node.kind || "Resource" },
          { label: "Name", value: node.name || node.label || node.id },
          { label: "Namespace", value: node.namespace || "" },
          { label: "ID", value: node.id || "" }
        ];
        renderNodeRows(node).forEach((row) => detailRows.push({ label: row.path || row.label, value: row.value || row.type || "" }));
        showDetails(details, node.label || node.id, detailRows);
      });
      enableNodeDragging(card, node, positions, redrawLinks, viewState, options);
      nodeLayer.appendChild(card);
      return card;
    }

    function resetInitialViewportPosition(viewport, options = {}) {
      if (!options.fullTab) return;
      const reset = () => {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      };
      if (typeof global.requestAnimationFrame === "function") global.requestAnimationFrame(reset);
      else setTimeout(reset, 0);
    }

    function scheduleLinkRedraw(redrawLinks) {
      const run = () => redrawLinks();
      if (typeof global.requestAnimationFrame === "function") {
        global.requestAnimationFrame(() => {
          run();
          global.requestAnimationFrame(run);
        });
      } else {
        setTimeout(run, 0);
      }
      setTimeout(run, 80);
    }

    function enableCanvasControls(viewport, stage, toolbar, viewState, options) {
      function applyTransform() {
        stage.style.transform = `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`;
        options?.onViewportChanged?.({ scale: viewState.scale, offsetX: viewState.offsetX, offsetY: viewState.offsetY });
      }
      function zoom(delta) {
        viewState.scale = Math.min(1.8, Math.max(0.45, viewState.scale + delta));
        applyTransform();
      }
      toolbar.querySelector('[data-topology-action="zoom-out"]')?.addEventListener("click", () => zoom(-0.15));
      toolbar.querySelector('[data-topology-action="zoom-in"]')?.addEventListener("click", () => zoom(0.15));
      toolbar.querySelector('[data-topology-action="reset"]')?.addEventListener("click", () => { viewState.scale = 1; viewState.offsetX = 0; viewState.offsetY = 0; applyTransform(); });
      if (global.d3?.select && global.d3?.zoom) {
        global.d3.select(viewport).call(global.d3.zoom().filter((event) => !isNodeInteractionTarget(event?.target)).scaleExtent([0.45, 1.8]).on("zoom", (event) => {
          viewState.offsetX = event.transform.x;
          viewState.offsetY = event.transform.y;
          viewState.scale = event.transform.k;
          applyTransform();
        }));
      }
    }

    /** Render one Kubernetes graph into a parent panel. */
    function render(parent, graph = {}, options = {}) {
      const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
      const edges = Array.isArray(graph.edges) ? graph.edges : [];
      if (!nodes.length) {
        parent.appendChild(createElement("p", "project-command-muted", graph.warnings?.[0] || "No Kubernetes resources were detected in the command output."));
        return null;
      }
      const layout = layoutNodes(nodes, options.layout || graph.layout || null);
      const shell = createElement("div", "project-command-topology-forge");
      if (options.fullTab) shell.classList.add("is-full-tab");
      const toolbar = createElement("div", "project-command-topology-forge-toolbar");
      toolbar.append(createElement("strong", "", "Topology"));
      if (typeof options.openInTab === "function") {
        const openButton = createElement("button", "project-command-topology-forge-control icon", "");
        openButton.type = "button";
        openButton.title = "Open graph in new tab";
        openButton.setAttribute("aria-label", "Open graph in new tab");
        openButton.dataset.topologyAction = "open-tab";
        openButton.innerHTML = '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>';
        openButton.addEventListener("click", () => options.openInTab(graph, options.result || null));
        toolbar.appendChild(openButton);
      }
      [
        ["zoom-out", "-", "Zoom out"],
        ["reset", "Reset", "Reset zoom"],
        ["zoom-in", "+", "Zoom in"]
      ].forEach(([action, label, title]) => {
        const button = createElement("button", "project-command-topology-forge-control", label);
        button.type = "button";
        button.title = title;
        button.dataset.topologyAction = action;
        toolbar.appendChild(button);
      });
      const viewport = createElement("div", "project-command-topology-forge-viewport");
      const stage = createElement("div", "project-command-topology-forge-stage");
      stage.style.width = `${layout.width}px`;
      stage.style.height = `${layout.height}px`;
      const links = createSvgElement("svg", { class: "project-command-topology-forge-links", viewBox: `0 0 ${layout.width} ${layout.height}` });
      const nodeLayer = createElement("div", "project-command-topology-forge-nodes");
      if (links) {
        links.style.width = `${layout.width}px`;
        links.style.height = `${layout.height}px`;
      }
      nodeLayer.style.width = `${layout.width}px`;
      nodeLayer.style.height = `${layout.height}px`;
      const details = createElement("div", "project-command-topology-details", "Select a node or relationship to inspect it.");
      if (links) stage.appendChild(links);
      stage.appendChild(nodeLayer);
      viewport.appendChild(stage);
      shell.append(toolbar, viewport, details);
      parent.appendChild(shell);
      const savedViewport = options.layout?.viewport || graph.layout?.viewport || {};
      const viewState = {
        scale: Number(savedViewport.scale) || 1,
        offsetX: Number(savedViewport.offsetX) || 0,
        offsetY: Number(savedViewport.offsetY) || 0
      };
      const redrawLinks = () => { if (links) renderLinks(links, nodes, edges, layout.positions, details, nodeLayer); };
      const renderOptions = Object.assign({}, options, { graph });
      nodes.forEach((node) => renderNode(nodeLayer, node, layout.positions.get(node.id), details, layout.positions, redrawLinks, viewState, renderOptions));
      scheduleLinkRedraw(redrawLinks);
      shell.addEventListener("kubernetes-topology-redraw", () => scheduleLinkRedraw(redrawLinks));
      if (typeof global.ResizeObserver === "function") {
        const resizeObserver = new global.ResizeObserver(() => scheduleLinkRedraw(redrawLinks));
        resizeObserver.observe(viewport);
        resizeObserver.observe(nodeLayer);
      }
      enableCanvasControls(viewport, stage, toolbar, viewState, options);
      stage.style.transform = `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`;
      resetInitialViewportPosition(viewport, options);
      return shell;
    }

    function mountTopologyTab(tab, root) {
      if (!root) return null;
      root.textContent = "";
      const graph = tab?.kubernetesTopology?.graph || {};
      return render(root, graph, {
        fullTab: true,
        result: tab?.kubernetesTopology?.result || null,
        layout: tab?.kubernetesTopologyLayout || tab?.kubernetesTopologyDocument?.layout || null,
        onLayoutChanged: function(layout) {
          tab.kubernetesTopologyLayout = Object.assign({}, tab.kubernetesTopologyLayout || {}, layout);
          tab.kubernetesTopologyDirty = true;
          app?.modules?.tabs?.markKubernetesTopologyTabDirty?.(tab.id, tab.kubernetesTopologyLayout);
        },
        onViewportChanged: function(viewport) {
          tab.kubernetesTopologyLayout = Object.assign({}, tab.kubernetesTopologyLayout || {}, { viewport });
          tab.kubernetesTopologyDirty = true;
          app?.modules?.tabs?.markKubernetesTopologyTabDirty?.(tab.id, tab.kubernetesTopologyLayout);
        }
      });
    }

    const api = { render, mountTopologyTab };
    app?.registerModule?.("kubernetesTopologyRenderer", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesTopologyRenderer = registerMarkdownViewerKubernetesTopologyRenderer;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesTopologyRenderer };
})(typeof window !== "undefined" ? window : globalThis);
