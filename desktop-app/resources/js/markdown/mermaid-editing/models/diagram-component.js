/* Source and SVG identity for one Mermaid diagram component. */
(function(global) {
  "use strict";

  /**
   * Create the source-to-SVG record for a node, edge or subgraph.
   * nodeId preserves Mermaid identity; labelStart/labelEnd are block-relative replacement
   * offsets including any quotes (or an insertion point for implicit labels).
   * originalText is decoded plain text; editable/reason describe safe editing support.
   * svgElement/labelElement retain rendered targets; svgBounds uses root SVG coordinates.
   */
  global.createMarkdownViewerMermaidComponent = function(nodeId, fields = {}) {
    return Object.assign({
      nodeId, kind: "node", labelStart: null, labelEnd: null,
      originalText: nodeId, editable: false, reason: "No supported label declaration.",
      svgElement: null, labelElement: null, svgBounds: null
    }, fields);
  };
})(window);
