// SOAP envelope and HTTP request builder for the SOAP Client railbar tool.
(function(root) {
  "use strict";

  const SOAP11_ENVELOPE_NS = "http://schemas.xmlsoap.org/soap/envelope/";
  const SOAP12_ENVELOPE_NS = "http://www.w3.org/2003/05/soap-envelope";

  function escapeXml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function sampleValueForType(type) {
    const normalized = String(type || "").toLowerCase();
    if (["int", "integer", "long", "short", "byte", "nonnegativeinteger"].includes(normalized)) return "0";
    if (["decimal", "double", "float"].includes(normalized)) return "0.0";
    if (normalized === "boolean") return "false";
    if (normalized === "date") return "2026-01-01";
    if (normalized === "datetime") return "2026-01-01T00:00:00Z";
    return "string";
  }

  function createBodyContent(operation) {
    const operationName = operation?.inputElementName || operation?.name || "Operation";
    const namespace = operation?.targetNamespace || "";
    const children = Array.isArray(operation?.inputElement?.children) ? operation.inputElement.children : [];
    const lines = [`    <m:${operationName}${namespace ? ` xmlns:m="${escapeXml(namespace)}"` : ""}>`];
    if (children.length) {
      children.forEach((child) => {
        lines.push(`      <m:${child.name}>${escapeXml(sampleValueForType(child.type))}</m:${child.name}>`);
      });
    } else {
      lines.push("      <!-- Add request values here. -->");
    }
    lines.push(`    </m:${operationName}>`);
    return lines.join("\n");
  }

  /**
   * Creates an editable SOAP envelope for an operation snapshot.
   * @param {object} operation Normalized operation returned by the WSDL parser.
   * @param {object} options Envelope options.
   * @returns {string} SOAP envelope XML.
   */
  function createSoapEnvelope(operation, options = {}) {
    const soapVersion = String(options.soapVersion || operation?.soapVersion || "1.1") === "1.2" ? "1.2" : "1.1";
    const envelopeNs = soapVersion === "1.2" ? SOAP12_ENVELOPE_NS : SOAP11_ENVELOPE_NS;
    return [
      `<?xml version="1.0" encoding="utf-8"?>`,
      `<soap:Envelope xmlns:soap="${envelopeNs}">`,
      "  <soap:Header/>",
      "  <soap:Body>",
      createBodyContent(operation),
      "  </soap:Body>",
      "</soap:Envelope>"
    ].join("\n");
  }

  /**
   * Builds the API Client bridge payload used to send the SOAP request.
   * @param {object} tabState SOAP tab state.
   * @param {object} requestSettings Existing API Client request settings.
   * @returns {object} API Client bridge request payload.
   */
  function createSoapHttpRequest(tabState, requestSettings = {}) {
    const soapVersion = String(tabState?.soapVersion || "1.1") === "1.2" ? "1.2" : "1.1";
    const soapAction = String(tabState?.soapAction || "").trim();
    const headers = soapVersion === "1.2"
      ? { "Content-Type": `application/soap+xml; charset=utf-8${soapAction ? `; action="${soapAction}"` : ""}` }
      : { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${soapAction}"` };
    return {
      method: "POST",
      url: String(tabState?.endpointUrl || "").trim(),
      headers,
      bodyMode: "raw",
      body: String(tabState?.requestXml || ""),
      requestSettings: { ...(requestSettings || {}), responseRenderMode: "xml" }
    };
  }

  const api = { createSoapEnvelope, createSoapHttpRequest, SOAP11_ENVELOPE_NS, SOAP12_ENVELOPE_NS };
  root.markdownViewerSoapRequestBuilder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
