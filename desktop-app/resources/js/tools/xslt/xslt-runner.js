// Native XSLT 1.0 runner for XML-family tool workflows.
(function(root) {
  "use strict";

  function getParserError(documentValue) {
    const parserError = documentValue?.getElementsByTagName?.("parsererror")?.[0] || null;
    return parserError ? (parserError.textContent || "XML parse error.").trim() : "";
  }

  function parseXml(source, label, Parser = root.DOMParser) {
    if (typeof Parser !== "function") throw new Error("XML parser is unavailable.");
    const documentValue = new Parser().parseFromString(String(source || ""), "application/xml");
    const parserError = getParserError(documentValue);
    if (parserError) throw new Error(`${label || "XML"} parse error: ${parserError}`);
    return documentValue;
  }

  function serializeResult(resultDocument, Serializer = root.XMLSerializer) {
    if (!resultDocument) return "";
    if (typeof Serializer !== "function") throw new Error("XML serializer is unavailable.");
    const target = resultDocument.nodeType === 9
      ? (resultDocument.documentElement || resultDocument.body || resultDocument)
      : resultDocument;
    return new Serializer().serializeToString(target);
  }

  function normalizeParameters(parameters) {
    if (!Array.isArray(parameters)) return [];
    return parameters
      .map((parameter) => ({
        name: String(parameter?.name || "").trim(),
        value: String(parameter?.value ?? "")
      }))
      .filter((parameter) => parameter.name);
  }

  function transform(options = {}, deps = {}) {
    const Processor = deps.XSLTProcessor || root.XSLTProcessor;
    if (typeof Processor !== "function") {
      throw new Error("Native XSLT 1.0 processing is unavailable in this runtime.");
    }
    const xmlDocument = parseXml(options.xmlText, "XML", deps.DOMParser || root.DOMParser);
    const xsltDocument = parseXml(options.xsltText, "XSLT", deps.DOMParser || root.DOMParser);
    const processor = new Processor();
    try {
      processor.importStylesheet(xsltDocument);
      normalizeParameters(options.parameters).forEach((parameter) => {
        processor.setParameter(null, parameter.name, parameter.value);
      });
      const resultDocument = processor.transformToDocument(xmlDocument);
      return {
        resultDocument,
        output: serializeResult(resultDocument, deps.XMLSerializer || root.XMLSerializer)
      };
    } catch (error) {
      throw new Error(error?.message || "XSLT transform failed.");
    }
  }

  root.markdownViewerXsltRunner = {
    transform,
    serializeResult,
    _test: {
      getParserError,
      normalizeParameters,
      parseXml
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { transform, serializeResult, _test: { getParserError, normalizeParameters, parseXml } };
  }
})(typeof window !== "undefined" ? window : globalThis);
