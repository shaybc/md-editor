// XPath Search evaluator.
(function(root) {
  "use strict";

  function createXmlParserErrorMessage(documentValue) {
    const errors = Array.from(documentValue.getElementsByTagName?.("parsererror") || []);
    if (!errors.length) return "";
    return errors.map((node) => node.textContent || "Invalid XML.").join("\n").trim();
  }

  /**
   * Parse XML text into a document suitable for XPath evaluation.
   * @param {string} xmlInput XML source entered by the user.
   * @param {object} deps Runtime XML dependencies.
   * @returns {Document} Parsed XML document.
   * @throws {Error} When XML parsing support is unavailable or the XML is invalid.
   */
  function parseXmlDocument(xmlInput, deps = {}) {
    const Parser = deps.DOMParser || root.DOMParser;
    if (typeof Parser !== "function") throw new Error("XML parser is unavailable.");
    const documentValue = new Parser().parseFromString(String(xmlInput || ""), "application/xml");
    const parserMessage = createXmlParserErrorMessage(documentValue);
    if (parserMessage) throw new Error(`Invalid XML: ${parserMessage}`);
    return documentValue;
  }

  function serializeNode(node, deps = {}) {
    if (!node) return "";
    if (node.nodeType === 2) return `${node.name}="${node.value}"`;
    if (node.nodeType === 3 || node.nodeType === 4 || node.nodeType === 7 || node.nodeType === 8) return node.nodeValue || "";
    const Serializer = deps.XMLSerializer || root.XMLSerializer;
    if (typeof Serializer === "function") return new Serializer().serializeToString(node);
    return node.textContent || "";
  }

  function collectNodeSet(result, deps = {}) {
    const matches = [];
    let node = result.iterateNext?.();
    while (node) {
      matches.push(serializeNode(node, deps));
      node = result.iterateNext?.();
    }
    return { kind: "nodes", matches };
  }

  function normalizeXPathResult(result, deps = {}) {
    const ResultType = deps.XPathResult || root.XPathResult || {};
    if (!result) return { kind: "nodes", matches: [] };
    if (result.resultType === ResultType.STRING_TYPE) return { kind: "string", matches: [String(result.stringValue ?? "")] };
    if (result.resultType === ResultType.NUMBER_TYPE) return { kind: "number", matches: [String(result.numberValue ?? "")] };
    if (result.resultType === ResultType.BOOLEAN_TYPE) return { kind: "boolean", matches: [String(Boolean(result.booleanValue))] };
    return collectNodeSet(result, deps);
  }

  /**
   * Evaluate an XPath expression against XML text.
   * @param {string} xmlInput XML source entered by the user.
   * @param {string} xpathInput XPath expression entered by the user.
   * @param {object} deps Optional parser/evaluator dependencies for tests.
   * @returns {{kind: string, matches: string[]}} XPath result values ready for display.
   * @throws {Error} When XML or XPath evaluation fails.
   */
  function evaluateXPath(xmlInput, xpathInput, deps = {}) {
    const documentValue = deps.parseXmlDocument ? deps.parseXmlDocument(xmlInput) : parseXmlDocument(xmlInput, deps);
    const expression = String(xpathInput || "").trim();
    const ResultType = deps.XPathResult || root.XPathResult || {};
    const evaluator = deps.evaluateExpression || ((documentNode, sourceExpression) => {
      if (typeof documentNode.evaluate !== "function") throw new Error("XPath evaluator is unavailable.");
      return documentNode.evaluate(sourceExpression, documentNode, null, ResultType.ANY_TYPE || 0, null);
    });
    try {
      return normalizeXPathResult(evaluator(documentValue, expression), deps);
    } catch (error) {
      throw new Error(`Invalid XPath: ${error?.message || String(error || "")}`);
    }
  }

  /**
   * Format XPath matches as display text for the tool output.
   * @param {{matches: string[]}} result Evaluated XPath result.
   * @returns {string} Result text.
   */
  function formatXPathResult(result) {
    return (result?.matches || []).join("\n\n");
  }

  root.registerMarkdownViewerXPathEvaluator = function registerMarkdownViewerXPathEvaluator(app, deps = {}) {
    const api = {
      evaluateXPath(xmlInput, xpathInput) {
        return evaluateXPath(xmlInput, xpathInput, deps);
      },
      formatXPathResult,
      parseXmlDocument
    };
    app?.registerModule?.("xpathEvaluator", api);
    return api;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { evaluateXPath, formatXPathResult, parseXmlDocument };
  }
})(typeof window !== "undefined" ? window : globalThis);
