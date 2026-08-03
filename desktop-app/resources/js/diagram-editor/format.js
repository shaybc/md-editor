(function(global) {
  "use strict";

  const DRAWIO_PATH = /\.drawio$/i;
  const XML_PATH = /\.xml$/i;

  function isDiagramPath(path) {
    return DRAWIO_PATH.test(String(path || ""));
  }

  function isDiagramCandidatePath(path) {
    return isDiagramPath(path) || XML_PATH.test(String(path || ""));
  }

  function parseDiagramXml(xml) {
    const source = String(xml || "").trim();
    if (!source) throw new Error("The diagram file is empty.");
    const documentNode = new DOMParser().parseFromString(source, "application/xml");
    if (documentNode.querySelector("parsererror")) throw new Error("The diagram file contains invalid XML.");
    const rootName = documentNode.documentElement?.localName;
    if (rootName !== "mxfile" && rootName !== "mxGraphModel") {
      throw new Error("This XML file is not a draw.io diagram.");
    }
    return documentNode;
  }

  function looksLikeDiagramXml(xml) {
    try {
      parseDiagramXml(xml);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function createBlankDiagramXml() {
    const modified = new Date().toISOString();
    const id = `md-editor-${Date.now().toString(36)}`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="MD-Editor" modified="${modified}" agent="MD-Editor" version="30.0.4"><diagram id="${id}" name="Page-1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
  }

  function getDiagramPageIds(xml) {
    const documentNode = parseDiagramXml(xml);
    if (documentNode.documentElement.localName === "mxGraphModel") return [null];
    const pages = Array.from(documentNode.documentElement.children)
      .filter((node) => node.localName === "diagram")
      .map((node) => node.getAttribute("id"))
      .filter(Boolean);
    return pages.length ? pages : [null];
  }

  function fileStem(name) {
    return String(name || "Untitled Diagram").replace(/\.(drawio|xml)$/i, "") || "Untitled Diagram";
  }

  global.MarkdownViewerDiagramFormat = {
    isDiagramPath,
    isDiagramCandidatePath,
    parseDiagramXml,
    looksLikeDiagramXml,
    createBlankDiagramXml,
    getDiagramPageIds,
    fileStem
  };
})(typeof window !== "undefined" ? window : globalThis);
