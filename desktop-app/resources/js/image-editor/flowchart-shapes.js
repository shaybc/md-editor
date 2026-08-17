// Flowchart shape catalog, toolbar icons, and canvas contour tracers.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const DEFINITIONS = Object.freeze({
    "flowchart-preparation": Object.freeze({
      label: "Preparation", iconPath: "M4 2.5h10l3 6-3 6H4l-3-6Z",
      trace(context, point) { context.moveTo(...point(0.22, 0)); context.lineTo(...point(0.78, 0)); context.lineTo(...point(1, 0.5)); context.lineTo(...point(0.78, 1)); context.lineTo(...point(0.22, 1)); context.lineTo(...point(0, 0.5)); context.closePath(); }
    }),
    "flowchart-terminator": Object.freeze({
      label: "Start / end", iconPath: "M5 2.5h8a6 6 0 0 1 0 12H5a6 6 0 0 1 0-12Z",
      trace(context, point) { context.moveTo(...point(0.25, 0)); context.bezierCurveTo(...point(0.11, 0), ...point(0, 0.22), ...point(0, 0.5)); context.bezierCurveTo(...point(0, 0.78), ...point(0.11, 1), ...point(0.25, 1)); context.lineTo(...point(0.75, 1)); context.bezierCurveTo(...point(0.89, 1), ...point(1, 0.78), ...point(1, 0.5)); context.bezierCurveTo(...point(1, 0.22), ...point(0.89, 0), ...point(0.75, 0)); context.closePath(); }
    }),
    "flowchart-process": Object.freeze({
      label: "Process", iconPath: "M2 2.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H2A1.5 1.5 0 0 1 .5 13V4A1.5 1.5 0 0 1 2 2.5Z",
      trace(context, point) { context.moveTo(...point(0.05, 0)); context.lineTo(...point(0.95, 0)); context.quadraticCurveTo(...point(1, 0), ...point(1, 0.06)); context.lineTo(...point(1, 0.94)); context.quadraticCurveTo(...point(1, 1), ...point(0.95, 1)); context.lineTo(...point(0.05, 1)); context.quadraticCurveTo(...point(0, 1), ...point(0, 0.94)); context.lineTo(...point(0, 0.06)); context.quadraticCurveTo(...point(0, 0), ...point(0.05, 0)); context.closePath(); }
    }),
    "flowchart-decision": Object.freeze({ label: "Decision", iconPath: "M9 1 17 8.5 9 16 .8 8.5Z", trace(context, point) { context.moveTo(...point(0.5, 0)); context.lineTo(...point(1, 0.5)); context.lineTo(...point(0.5, 1)); context.lineTo(...point(0, 0.5)); context.closePath(); } }),
    "flowchart-document": Object.freeze({ label: "Document", iconPath: "M1 2h16v10c-4-2.2-8 2.2-16 0Z", trace(context, point) { context.moveTo(...point(0, 0)); context.lineTo(...point(1, 0)); context.lineTo(...point(1, 0.76)); context.bezierCurveTo(...point(0.72, 0.58), ...point(0.35, 1.08), ...point(0, 0.78)); context.closePath(); } }),
    "flowchart-data": Object.freeze({ label: "Data", iconPath: "M4 2h13l-3 13H1Z", trace(context, point) { context.moveTo(...point(0.24, 0)); context.lineTo(...point(1, 0)); context.lineTo(...point(0.76, 1)); context.lineTo(...point(0, 1)); context.closePath(); } }),
    "flowchart-manual-operation": Object.freeze({ label: "Manual operation", iconPath: "M1 2h16l-3 13H4Z", trace(context, point) { context.moveTo(...point(0, 0)); context.lineTo(...point(1, 0)); context.lineTo(...point(0.82, 1)); context.lineTo(...point(0.18, 1)); context.closePath(); } }),
    "flowchart-delay": Object.freeze({
      label: "Delay", iconPath: "M1 2h9a6.5 6.5 0 0 1 0 13H1Z",
      trace(context, point) { context.moveTo(...point(0, 0)); context.lineTo(...point(0.55, 0)); context.bezierCurveTo(...point(0.8, 0), ...point(1, 0.22), ...point(1, 0.5)); context.bezierCurveTo(...point(1, 0.78), ...point(0.8, 1), ...point(0.55, 1)); context.lineTo(...point(0, 1)); context.closePath(); }
    }),
    "flowchart-merge": Object.freeze({ label: "Merge", iconPath: "M1 2h16L9 16Z", trace(context, point) { context.moveTo(...point(0, 0)); context.lineTo(...point(1, 0)); context.lineTo(...point(0.5, 1)); context.closePath(); } }),
    "flowchart-display": Object.freeze({
      label: "Display", iconPath: "M5 2h7c3 0 5 2.9 5 6.5S15 15 12 15H5L1 8.5Z",
      trace(context, point) { context.moveTo(...point(0.26, 0)); context.lineTo(...point(0.72, 0)); context.bezierCurveTo(...point(0.9, 0), ...point(1, 0.22), ...point(1, 0.5)); context.bezierCurveTo(...point(1, 0.78), ...point(0.9, 1), ...point(0.72, 1)); context.lineTo(...point(0.26, 1)); context.lineTo(...point(0, 0.5)); context.closePath(); }
    }),
    "flowchart-off-page-connector": Object.freeze({ label: "Off-page connector", iconPath: "M1.5 2h15v9L9 16 1.5 11Z", trace(context, point) { context.moveTo(...point(0, 0)); context.lineTo(...point(1, 0)); context.lineTo(...point(1, 0.68)); context.lineTo(...point(0.5, 1)); context.lineTo(...point(0, 0.68)); context.closePath(); } })
  });

  const FLOWCHART_SHAPE_TOOLS = Object.freeze(Object.keys(DEFINITIONS));

  /** Return the user-facing name of a registered flowchart shape. */
  function flowchartShapeLabel(tool) { return DEFINITIONS[tool]?.label || ""; }

  /** Render an original outline icon for a registered flowchart shape. */
  function flowchartShapeIcon(tool) {
    const definition = DEFINITIONS[tool];
    if (!definition) return "";
    return '<svg class="image-editor-flowchart-shape-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="' + definition.iconPath + '"></path></svg>';
  }

  /** Trace a registered flowchart silhouette inside the rectangle defined by two drag points. */
  function traceFlowchartShape(context, tool, start, end) {
    const definition = DEFINITIONS[tool];
    if (!definition) return false;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.max(1, Math.abs(end.x - start.x));
    const height = Math.max(1, Math.abs(end.y - start.y));
    const point = (x, y) => [left + width * x, top + height * y];
    definition.trace(context, point);
    return true;
  }

  Object.assign(namespace, { flowchartShapeTools: FLOWCHART_SHAPE_TOOLS, flowchartShapeLabel, flowchartShapeIcon, traceFlowchartShape });
})(typeof window !== "undefined" ? window : globalThis);
