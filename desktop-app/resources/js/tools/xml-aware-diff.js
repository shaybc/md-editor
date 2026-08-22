// XML-aware diff normalization helpers.
(function(global) {
  "use strict";

  const ELEMENT_NODE = 1;
  const ATTRIBUTE_NODE = 2;
  const TEXT_NODE = 3;
  const CDATA_SECTION_NODE = 4;
  const PROCESSING_INSTRUCTION_NODE = 7;
  const COMMENT_NODE = 8;

  const XML_FAMILY_PATH_PATTERN = /(\.xml|\.xsd|\.xsl|\.xslt|\.svg)$/i;

  /**
   * Register XML-aware diff helpers.
   * @param {object} app Shared MD-Editor app object.
   * @param {object} deps Optional XML parser and serializer dependencies.
   * @returns {object} Public XML-aware diff API.
   */
  function registerMarkdownViewerXmlAwareDiff(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;

    function escapeXmlText(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function escapeXmlAttribute(value) {
      return escapeXmlText(value).replace(/"/g, "&quot;");
    }

    function getParserErrorText(documentValue) {
      const errors = Array.from(documentValue?.getElementsByTagName?.("parsererror") || []);
      return errors.map((node) => String(node.textContent || "").trim()).filter(Boolean).join("\n");
    }

    function getSourcePath(source) {
      return String(source?.path || source?.fullPath || source?.name || source?.file?.name || source?.handle?.name || "");
    }

    /**
     * Determine whether a compare source looks like an XML-family file.
     * @param {object} source Compare source with path, fullPath, name, file, or handle.
     * @returns {boolean} True when the source has an XML-family name.
     */
    function isXmlLikeSource(source) {
      const path = getSourcePath(source);
      return XML_FAMILY_PATH_PATTERN.test(path) || /(^|[/\\])pom\.xml$/i.test(path);
    }

    function sortAttributes(attributes) {
      return Array.from(attributes || []).sort((left, right) => {
        const leftKey = [left.namespaceURI || "", left.localName || left.name || "", left.name || ""].join("\u0000");
        const rightKey = [right.namespaceURI || "", right.localName || right.name || "", right.name || ""].join("\u0000");
        return leftKey.localeCompare(rightKey);
      });
    }

    function hasElementChild(node) {
      return Array.from(node?.childNodes || []).some((child) => child.nodeType === ELEMENT_NODE);
    }

    function getMeaningfulChildren(node) {
      return Array.from(node?.childNodes || []).filter((child) => {
        if (child.nodeType !== TEXT_NODE) return true;
        if (!hasElementChild(node)) return true;
        return String(child.nodeValue || "").trim() !== "";
      });
    }

    function renderAttribute(attribute) {
      const name = attribute.name || attribute.nodeName || attribute.localName || "attribute";
      return `${name}="${escapeXmlAttribute(attribute.value ?? attribute.nodeValue ?? "")}"`;
    }

    function renderNode(node, level) {
      const indent = "  ".repeat(level);
      if (!node) return [];
      if (node.nodeType === TEXT_NODE) return [`${indent}${escapeXmlText(node.nodeValue ?? node.textContent ?? "")}`];
      if (node.nodeType === CDATA_SECTION_NODE) return [`${indent}<![CDATA[${node.nodeValue ?? node.textContent ?? ""}]]>`];
      if (node.nodeType === COMMENT_NODE) return [`${indent}<!--${node.nodeValue ?? node.textContent ?? ""}-->`];
      if (node.nodeType === PROCESSING_INSTRUCTION_NODE) {
        const target = node.target || node.nodeName || "";
        const data = node.data || node.nodeValue || "";
        return [`${indent}<?${target}${data ? ` ${data}` : ""}?>`];
      }
      if (node.nodeType !== ELEMENT_NODE) return [];

      const name = node.nodeName || node.tagName || node.localName || "element";
      const attributes = sortAttributes(node.attributes).map(renderAttribute);
      const open = attributes.length ? `<${name} ${attributes.join(" ")}>` : `<${name}>`;
      const children = getMeaningfulChildren(node);
      if (!children.length) {
        const selfClosing = attributes.length ? `<${name} ${attributes.join(" ")}/>` : `<${name}/>`;
        return [`${indent}${selfClosing}`];
      }
      if (!children.some((child) => child.nodeType === ELEMENT_NODE || child.nodeType === COMMENT_NODE || child.nodeType === PROCESSING_INSTRUCTION_NODE)) {
        return [`${indent}${open}${children.map((child) => {
          if (child.nodeType === CDATA_SECTION_NODE) return `<![CDATA[${child.nodeValue ?? child.textContent ?? ""}]]>`;
          return escapeXmlText(child.nodeValue ?? child.textContent ?? "");
        }).join("")}</${name}>`];
      }
      return [
        `${indent}${open}`,
        ...children.flatMap((child) => renderNode(child, level + 1)),
        `${indent}</${name}>`
      ];
    }

    function getDocumentNodes(documentValue) {
      const nodes = Array.from(documentValue?.childNodes || []);
      return nodes.length ? nodes.filter((node) => node.nodeType !== PROCESSING_INSTRUCTION_NODE || !/^xml$/i.test(node.target || node.nodeName || "")) : [documentValue.documentElement].filter(Boolean);
    }

    /**
     * Parse and normalize XML for stable text comparison.
     * @param {string} xmlText XML source to normalize.
     * @param {object} options Normalization options.
     * @returns {{ok: boolean, content?: string, diagnostics: object[]}} Normalized content or diagnostics.
     */
    function normalizeXmlForDiff(xmlText, options = {}) {
      const source = String(xmlText || "");
      if (!source.trim()) return { ok: false, diagnostics: [{ severity: "error", message: "XML content is empty." }] };
      if (typeof DOMParserRef !== "function") return { ok: false, diagnostics: [{ severity: "error", message: "XML parser is unavailable." }] };
      const documentValue = new DOMParserRef().parseFromString(source, "application/xml");
      const parserError = getParserErrorText(documentValue);
      if (parserError) return { ok: false, diagnostics: [{ severity: "error", message: parserError }] };
      if (!documentValue.documentElement) return { ok: false, diagnostics: [{ severity: "error", message: "XML document has no root element." }] };

      const hasXmlDeclaration = /^\s*<\?xml\b/i.test(source);
      const lines = [];
      if (hasXmlDeclaration && options.preserveDeclaration !== false) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
      getDocumentNodes(documentValue).forEach((node) => {
        lines.push(...renderNode(node, 0));
      });
      return { ok: true, content: lines.join("\n"), diagnostics: [] };
    }

    /**
     * Normalize two loaded compare sources for XML-aware comparison.
     * @param {object} leftSource Loaded left compare source.
     * @param {object} rightSource Loaded right compare source.
     * @param {object} options Normalization options.
     * @returns {{ok: boolean, left?: object, right?: object, diagnostics: object[]}} Normalized compare sources.
     */
    function createXmlAwareCompareSources(leftSource, rightSource, options = {}) {
      const diagnostics = [];
      if (!isXmlLikeSource(leftSource)) diagnostics.push({ severity: "error", side: "left", message: `"${getSourcePath(leftSource) || "Left"}" is not an XML-family file.` });
      if (!isXmlLikeSource(rightSource)) diagnostics.push({ severity: "error", side: "right", message: `"${getSourcePath(rightSource) || "Right"}" is not an XML-family file.` });
      if (diagnostics.length) return { ok: false, diagnostics };

      const left = normalizeXmlForDiff(leftSource?.content, options);
      const right = normalizeXmlForDiff(rightSource?.content, options);
      if (!left.ok) diagnostics.push(...left.diagnostics.map((diagnostic) => ({ ...diagnostic, side: "left" })));
      if (!right.ok) diagnostics.push(...right.diagnostics.map((diagnostic) => ({ ...diagnostic, side: "right" })));
      if (diagnostics.length) return { ok: false, diagnostics };
      return {
        ok: true,
        diagnostics: [],
        left: { ...leftSource, content: left.content },
        right: { ...rightSource, content: right.content }
      };
    }

    const api = { normalizeXmlForDiff, createXmlAwareCompareSources, isXmlLikeSource };
    app?.registerModule?.("xmlAwareDiff", api);
    return api;
  }

  global.registerMarkdownViewerXmlAwareDiff = registerMarkdownViewerXmlAwareDiff;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerXmlAwareDiff };
  }
})(typeof window !== "undefined" ? window : globalThis);
