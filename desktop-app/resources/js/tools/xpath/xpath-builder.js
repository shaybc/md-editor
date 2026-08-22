// XPath Builder model and path generation helpers.
(function(root) {
  "use strict";

  const ELEMENT_NODE = 1;
  const ATTRIBUTE_NODE = 2;
  const TEXT_NODE = 3;
  const CDATA_NODE = 4;
  const COMMENT_NODE = 8;

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getParserErrorText(documentValue) {
    const errors = Array.from(documentValue?.getElementsByTagName?.("parsererror") || []);
    return errors.map((node) => normalizeWhitespace(node.textContent || "")).filter(Boolean).join("\n");
  }

  function getNodeKind(node) {
    if (node.nodeType === ELEMENT_NODE) return "element";
    if (node.nodeType === ATTRIBUTE_NODE) return "attribute";
    if (node.nodeType === TEXT_NODE) return "text";
    if (node.nodeType === CDATA_NODE) return "cdata";
    if (node.nodeType === COMMENT_NODE) return "comment";
    return "node";
  }

  function getNodeName(node) {
    if (node.nodeType === TEXT_NODE) return "#text";
    if (node.nodeType === CDATA_NODE) return "#cdata";
    if (node.nodeType === COMMENT_NODE) return "#comment";
    return node.nodeName || node.name || node.localName || "node";
  }

  function getNodeValue(node) {
    if (node.nodeType === ATTRIBUTE_NODE) return node.value || "";
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE || node.nodeType === COMMENT_NODE) return node.nodeValue || node.textContent || "";
    return "";
  }

  function createTreeNode(domNode, state, parentId) {
    const id = "xpath-node-" + (++state.sequence);
    const model = {
      id,
      parentId: parentId || "",
      kind: getNodeKind(domNode),
      name: getNodeName(domNode),
      localName: domNode.localName || domNode.name || domNode.nodeName || "",
      prefix: domNode.prefix || "",
      namespaceUri: domNode.namespaceURI || "",
      value: getNodeValue(domNode),
      children: []
    };
    state.nodesById[id] = model;
    if (domNode.nodeType === ELEMENT_NODE) {
      Array.from(domNode.attributes || []).forEach(function(attribute) {
        model.children.push(createTreeNode(attribute, state, id));
      });
      Array.from(domNode.childNodes || []).forEach(function(child) {
        if (child.nodeType === COMMENT_NODE) return;
        if ((child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE) && !normalizeWhitespace(child.nodeValue || child.textContent || "")) return;
        model.children.push(createTreeNode(child, state, id));
      });
    }
    return model;
  }

  /**
   * Parse XML text into the tree model consumed by the XPath Builder.
   * @param {string} xmlText XML source to inspect.
   * @param {object} deps Optional DOM dependencies for tests.
   * @returns {{ok: boolean, tree?: object, nodesById?: object, diagnostics?: object[]}} Parsed tree or diagnostics.
   */
  function parseXmlToXPathTree(xmlText, deps = {}) {
    const source = String(xmlText || "");
    if (!source.trim()) return { ok: false, diagnostics: [{ severity: "info", message: "Enter XML to build XPath expressions." }] };
    const Parser = deps.DOMParser || root.DOMParser;
    if (typeof Parser !== "function") return { ok: false, diagnostics: [{ severity: "error", message: "XML parser is unavailable." }] };
    const parsed = new Parser().parseFromString(source, "application/xml");
    const parserErrorText = getParserErrorText(parsed);
    if (parserErrorText) return { ok: false, diagnostics: [{ severity: "error", message: parserErrorText }] };
    if (!parsed.documentElement) return { ok: false, diagnostics: [{ severity: "error", message: "XML document has no root element." }] };
    const state = { sequence: 0, nodesById: {} };
    const tree = createTreeNode(parsed.documentElement, state, "");
    return { ok: true, tree, nodesById: state.nodesById, diagnostics: [] };
  }

  function quoteXPathLiteral(value) {
    const text = String(value || "");
    if (!text.includes("'")) return `'${text}'`;
    if (!text.includes('"')) return `"${text}"`;
    return "concat('" + text.split("'").join("', \"'\", '") + "')";
  }

  function getComparableName(node) {
    return node.kind + ":" + (node.localName || node.name);
  }

  function getSiblingIndex(tree, node) {
    const parent = tree.nodesById?.[node.parentId];
    if (!parent) return { index: 1, count: 1 };
    const comparableName = getComparableName(node);
    const siblings = parent.children.filter((candidate) => candidate.kind === node.kind && getComparableName(candidate) === comparableName);
    return { index: siblings.findIndex((candidate) => candidate.id === node.id) + 1, count: siblings.length };
  }

  function buildNameTest(node, options) {
    if (options?.useLocalName) return `*[local-name()=${quoteXPathLiteral(node.localName || node.name)}]`;
    return node.name;
  }

  function buildAttributeTest(node, options) {
    if (options?.useLocalName) return `@*[local-name()=${quoteXPathLiteral(node.localName || node.name)}]`;
    return "@" + node.name;
  }

  function buildElementSegment(tree, node, options) {
    const nameTest = buildNameTest(node, options);
    const siblingInfo = getSiblingIndex(tree, node);
    return siblingInfo.count > 1 ? `${nameTest}[${siblingInfo.index}]` : nameTest;
  }

  function buildTextSegment(tree, node) {
    const parent = tree.nodesById?.[node.parentId];
    const siblings = parent?.children?.filter((candidate) => candidate.kind === node.kind) || [];
    if (siblings.length <= 1) return "text()";
    return `text()[${siblings.findIndex((candidate) => candidate.id === node.id) + 1}]`;
  }

  /**
   * Build an absolute XPath expression for a parsed XML tree node.
   * @param {object} tree Parsed XPath Builder tree result.
   * @param {string} nodeId Node id returned by parseXmlToXPathTree.
   * @param {object} options Builder options.
   * @returns {string} XPath expression for the selected node.
   */
  function buildXPathForNode(tree, nodeId, options = {}) {
    const nodesById = tree?.nodesById || {};
    const node = nodesById[nodeId];
    if (!node) return "";
    const segments = [];
    let current = node;
    while (current) {
      if (current.kind === "attribute") {
        segments.unshift(buildAttributeTest(current, options));
      } else if (current.kind === "text" || current.kind === "cdata") {
        segments.unshift(buildTextSegment(tree, current));
      } else if (current.kind === "element") {
        segments.unshift(buildElementSegment(tree, current, options));
      }
      current = current.parentId ? nodesById[current.parentId] : null;
    }
    return "/" + segments.join("/");
  }

  /**
   * Return builder capabilities for a parsed XML node.
   * @param {object} node Parsed XML tree node.
   * @returns {{canBuild: boolean, kind: string, supportsLocalName: boolean}} Node builder options.
   */
  function getXPathNodeOptions(node) {
    const kind = node?.kind || "";
    return {
      canBuild: kind === "element" || kind === "attribute" || kind === "text" || kind === "cdata",
      kind,
      supportsLocalName: kind === "element" || kind === "attribute"
    };
  }

  const api = { parseXmlToXPathTree, buildXPathForNode, getXPathNodeOptions };

  root.markdownViewerXPathBuilder = api;
  root.registerMarkdownViewerXPathBuilder = function registerMarkdownViewerXPathBuilder(app) {
    app?.registerModule?.("xpathBuilder", api);
    return api;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
