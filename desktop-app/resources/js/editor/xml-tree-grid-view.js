// Read-only XML Tree/Grid inspection view.
(function(global) {
  "use strict";

  function registerMarkdownViewerXmlTreeGridView(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;
    const openXmlTreeGridTab = deps.openXmlTreeGridTab || null;
    const mountedTabs = new Map();

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function normalizeWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isXmlFamilyPath(path) {
      const value = String(path || "");
      return /\.(xml|xsd|xsl|xslt|svg)$/i.test(value) || /(^|[/\\])pom\.xml$/i.test(value);
    }

    function getActiveEditorPath() {
      const tab = deps.getActiveTab?.() || null;
      return deps.getActiveEditorPath?.() || tab?.sourceFilePath || tab?.sourceFileName || tab?.sourceFileHandle?.name || tab?.title || "";
    }

    function notifyWarning(message) {
      const notify = deps.notify || app?.services?.notify || app?.modules?.notificationModal;
      if (typeof notify?.warning === "function") notify.warning({ title: "XML Tree/Grid", message });
      else if (typeof notify?.show === "function") notify.show({ title: "XML Tree/Grid", message, type: "warning" });
    }

    function getParserErrorText(parsed) {
      const parserErrors = parsed?.getElementsByTagName?.("parsererror") || [];
      const first = parserErrors[0] || null;
      return normalizeWhitespace(first?.textContent || "");
    }

    function createNodeModel(domNode, state, parentPath) {
      const id = "xml-node-" + (++state.sequence);
      const nodeType = domNode.nodeType;
      const model = {
        id,
        type: getNodeTypeName(nodeType),
        name: getNodeDisplayName(domNode),
        namespaceUri: domNode.namespaceURI || "",
        prefix: domNode.prefix || "",
        localName: domNode.localName || domNode.nodeName || "",
        value: getNodeValue(domNode),
        attributes: getNodeAttributes(domNode),
        children: [],
        path: ""
      };
      model.path = buildNodePath(model, parentPath);
      state.nodesById[model.id] = model;
      Array.from(domNode.childNodes || []).forEach(function(child) {
        const childModel = createNodeModel(child, state, model.path);
        if (childModel) model.children.push(childModel);
      });
      return model;
    }

    function getNodeTypeName(nodeType) {
      if (nodeType === 1) return "element";
      if (nodeType === 3) return "text";
      if (nodeType === 4) return "cdata";
      if (nodeType === 7) return "processing-instruction";
      if (nodeType === 8) return "comment";
      if (nodeType === 9) return "document";
      return "node";
    }

    function getNodeDisplayName(domNode) {
      if (domNode.nodeType === 3) return "#text";
      if (domNode.nodeType === 4) return "#cdata";
      if (domNode.nodeType === 8) return "#comment";
      return domNode.nodeName || domNode.localName || "node";
    }

    function getNodeValue(domNode) {
      if ([3, 4, 7, 8].includes(domNode.nodeType)) return domNode.nodeValue || domNode.textContent || "";
      return "";
    }

    function getNodeAttributes(domNode) {
      return Array.from(domNode.attributes || []).map(function(attribute) {
        return {
          name: attribute.name || attribute.nodeName || "",
          value: attribute.value || "",
          namespaceUri: attribute.namespaceURI || "",
          prefix: attribute.prefix || "",
          localName: attribute.localName || attribute.name || ""
        };
      });
    }

    function buildNodePath(model, parentPath) {
      if (!parentPath) return "/" + model.name;
      if (model.type === "text" || model.type === "cdata" || model.type === "comment") return parentPath + "/" + model.name;
      return parentPath + "/" + model.name;
    }

    /**
     * Parse XML text into the tree model used by the visual inspector.
     * @param {string} text XML text to inspect.
     * @returns {object} Parse result with either a tree model or diagnostics.
     */
    function parseXmlToTree(text) {
      const source = String(text || "");
      if (!source.trim()) return { ok: false, diagnostics: [{ severity: "info", message: "No XML content to display." }] };
      if (!DOMParserRef) return { ok: false, diagnostics: [{ severity: "error", message: "XML parser is unavailable." }] };
      const parsed = new DOMParserRef().parseFromString(source, "application/xml");
      const parserErrorText = getParserErrorText(parsed);
      if (parserErrorText) return { ok: false, diagnostics: [{ severity: "error", message: parserErrorText }] };
      const root = parsed.documentElement || null;
      if (!root) return { ok: false, diagnostics: [{ severity: "error", message: "XML document has no root element." }] };
      const state = { sequence: 0, nodesById: {} };
      const tree = createNodeModel(root, state, "");
      return { ok: true, tree, nodesById: state.nodesById };
    }

    function renderTreeNode(node) {
      const hasChildren = node.children.length > 0;
      const textPreview = normalizeWhitespace(node.value).slice(0, 80);
      return `
        <li class="xml-tree-grid-node" data-node-id="${escapeHtml(node.id)}">
          <button class="xml-tree-grid-row" type="button" aria-expanded="${hasChildren ? "true" : "false"}">
            <span class="xml-tree-grid-toggle">${hasChildren ? "-" : ""}</span>
            <span class="xml-tree-grid-type">${escapeHtml(node.type)}</span>
            <span class="xml-tree-grid-name">${escapeHtml(node.name)}</span>
            ${node.attributes.length ? `<span class="xml-tree-grid-badge">${node.attributes.length}</span>` : ""}
            ${textPreview ? `<span class="xml-tree-grid-preview">${escapeHtml(textPreview)}</span>` : ""}
          </button>
          ${hasChildren ? `<ol>${node.children.map(renderTreeNode).join("")}</ol>` : ""}
        </li>
      `;
    }

    function renderAttributeRows(attributes) {
      if (!attributes.length) return `<tr><td colspan="2" class="xml-tree-grid-empty-cell">No attributes</td></tr>`;
      return attributes.map(function(attribute) {
        return `<tr><th>${escapeHtml(attribute.name)}</th><td>${escapeHtml(attribute.value)}</td></tr>`;
      }).join("");
    }

    function renderDetailPanel(node) {
      if (!node) {
        return `<div class="xml-tree-grid-empty">Select a node to inspect its details.</div>`;
      }
      return `
        <div class="xml-tree-grid-details-header">
          <div class="xml-tree-grid-detail-title">${escapeHtml(node.name)}</div>
          <div class="xml-tree-grid-detail-path">${escapeHtml(node.path)}</div>
        </div>
        <table class="xml-tree-grid-properties">
          <tbody>
            <tr><th>Node type</th><td>${escapeHtml(node.type)}</td></tr>
            <tr><th>Name</th><td>${escapeHtml(node.name)}</td></tr>
            <tr><th>Namespace URI</th><td>${escapeHtml(node.namespaceUri || "-")}</td></tr>
            <tr><th>Prefix</th><td>${escapeHtml(node.prefix || "-")}</td></tr>
            <tr><th>Local name</th><td>${escapeHtml(node.localName || "-")}</td></tr>
            <tr><th>Child count</th><td>${node.children.length}</td></tr>
          </tbody>
        </table>
        <section class="xml-tree-grid-detail-section">
          <h3>Attributes</h3>
          <table class="xml-tree-grid-attributes"><tbody>${renderAttributeRows(node.attributes)}</tbody></table>
        </section>
        <section class="xml-tree-grid-detail-section">
          <h3>Text content</h3>
          <pre>${escapeHtml(node.value || "")}</pre>
        </section>
      `;
    }

    function createViewShell() {
      const shell = document.createElement("div");
      shell.className = "xml-tree-grid-view";
      shell.innerHTML = `
        <header class="xml-tree-grid-header">
          <h2><i class="bi bi-diagram-3"></i> XML Tree/Grid</h2>
          <div class="xml-tree-grid-source"></div>
        </header>
        <main class="xml-tree-grid-layout">
          <section class="xml-tree-grid-tree-pane" aria-label="XML tree"></section>
          <section class="xml-tree-grid-detail-pane" aria-label="XML node details"></section>
        </main>
        <footer class="xml-tree-grid-status" role="status" aria-live="polite"></footer>
      `;
      return shell;
    }

    function renderError(shell, filePath, diagnostics) {
      shell.querySelector(".xml-tree-grid-source").textContent = filePath || "";
      shell.querySelector(".xml-tree-grid-tree-pane").innerHTML = `<div class="xml-tree-grid-error">${escapeHtml(diagnostics[0]?.message || "Unable to parse XML.")}</div>`;
      shell.querySelector(".xml-tree-grid-detail-pane").innerHTML = renderDetailPanel(null);
      shell.querySelector(".xml-tree-grid-status").textContent = "XML tree is unavailable.";
    }

    function selectNode(shell, nodesById, nodeId) {
      shell.querySelectorAll(".xml-tree-grid-row.is-selected").forEach((row) => row.classList.remove("is-selected"));
      const escapedNodeId = global.CSS?.escape ? global.CSS.escape(nodeId) : String(nodeId).replace(/["\\]/g, "\\$&");
      const row = shell.querySelector(`.xml-tree-grid-node[data-node-id="${escapedNodeId}"] > .xml-tree-grid-row`);
      if (row) row.classList.add("is-selected");
      shell.querySelector(".xml-tree-grid-detail-pane").innerHTML = renderDetailPanel(nodesById[nodeId] || null);
    }

    function bindTreeInteractions(shell, nodesById) {
      shell.querySelectorAll(".xml-tree-grid-row").forEach(function(row) {
        row.addEventListener("click", function() {
          const item = row.closest(".xml-tree-grid-node");
          if (!item) return;
          const childList = item.querySelector(":scope > ol");
          if (childList) {
            const collapsed = item.classList.toggle("is-collapsed");
            row.setAttribute("aria-expanded", collapsed ? "false" : "true");
            row.querySelector(".xml-tree-grid-toggle").textContent = collapsed ? "+" : "-";
          }
          selectNode(shell, nodesById, item.dataset.nodeId);
        });
      });
    }

    /**
     * Render XML text into a tree/grid shell.
     * @param {object} options Render options.
     * @returns {object} Render result and parsed model details.
     */
    function renderFromText(options = {}) {
      const shell = options.shell || createViewShell();
      const text = options.text || "";
      const filePath = options.filePath || "";
      const result = parseXmlToTree(text);
      if (!result.ok) {
        renderError(shell, filePath, result.diagnostics);
        return Object.assign({ shell }, result);
      }
      shell.querySelector(".xml-tree-grid-source").textContent = filePath || "Unsaved XML";
      shell.querySelector(".xml-tree-grid-tree-pane").innerHTML = `<ol class="xml-tree-grid-root">${renderTreeNode(result.tree)}</ol>`;
      shell.querySelector(".xml-tree-grid-detail-pane").innerHTML = renderDetailPanel(result.tree);
      shell.querySelector(".xml-tree-grid-status").textContent = `${Object.keys(result.nodesById).length} node${Object.keys(result.nodesById).length === 1 ? "" : "s"}.`;
      bindTreeInteractions(shell, result.nodesById);
      selectNode(shell, result.nodesById, result.tree.id);
      return Object.assign({ shell }, result);
    }

    function mountXmlTreeGridTab(tab, rootElement) {
      let entry = mountedTabs.get(tab.id);
      if (!entry) {
        entry = { shell: createViewShell() };
        mountedTabs.set(tab.id, entry);
      }
      const result = renderFromText({ shell: entry.shell, text: tab.xmlTreeGrid?.text || "", filePath: tab.xmlTreeGrid?.filePath || "" });
      entry.nodesById = result.nodesById || {};
      rootElement.replaceChildren(entry.shell);
    }

    function destroyXmlTreeGridTab(tabId) {
      mountedTabs.delete(tabId);
    }

    function openForActiveEditor() {
      const filePath = getActiveEditorPath();
      if (!isXmlFamilyPath(filePath)) {
        notifyWarning("XML Tree/Grid View is available for XML-family files.");
        return null;
      }
      const text = deps.getActiveEditorValue?.() || "";
      return typeof openXmlTreeGridTab === "function" ? openXmlTreeGridTab({ text, filePath }) : null;
    }

    function clear() {
      mountedTabs.clear();
    }

    const api = {
      openForActiveEditor,
      renderFromText,
      parseXmlToTree,
      selectNode: function(nodeId) {
        const active = Array.from(mountedTabs.values()).find((entry) => entry.shell?.isConnected);
        if (active?.nodesById) selectNode(active.shell, active.nodesById, nodeId);
      },
      clear,
      mountXmlTreeGridTab,
      destroyXmlTreeGridTab,
      _test: { isXmlFamilyPath, normalizeWhitespace }
    };
    app?.registerModule?.("xmlTreeGridView", api);
    return api;
  }

  global.registerMarkdownViewerXmlTreeGridView = registerMarkdownViewerXmlTreeGridView;
  if (typeof module !== "undefined") module.exports = { registerMarkdownViewerXmlTreeGridView };
})(typeof window !== "undefined" ? window : globalThis);
