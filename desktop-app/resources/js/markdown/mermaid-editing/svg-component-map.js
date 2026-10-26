/* Connect Mermaid source identities to SVG nodes and live geometry. */
(function(global) {
  "use strict";

  function bounds(rect) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  function svgBounds(element, svg) {
    const graphics = typeof element.getBBox === "function" ? element : element.closest("foreignObject");
    if (!graphics) return null;
    const rect = graphics.getBBox();
    const rootMatrix = svg.getCTM();
    const matrix = graphics.getCTM();
    if (!rootMatrix || !matrix) return bounds(rect);
    const transform = rootMatrix.inverse().multiply(matrix);
    const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
    const x = Math.min(...corners.map(point => point.x));
    const y = Math.min(...corners.map(point => point.y));
    return { x, y, width: Math.max(...corners.map(point => point.x)) - x,
      height: Math.max(...corners.map(point => point.y)) - y };
  }

  function normalizeTextLabel(component) {
    if (!component.editable || component.labelElement.querySelector("foreignObject")) return;
    if (component.labelElement.getAttribute("data-mermaid-text-decoded") === "true") return;
    // Mermaid 11.6 SVG-only labels can double-escape entities needed by quoted label
    // edits. Decode one layer in text nodes, never HTML, so literal input stays literal.
    const entities = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };
    component.labelElement.querySelectorAll("text .text-inner-tspan").forEach(span => {
      const original = span.textContent;
      const decoded = original.replace(/&(#\d+|quot|amp|lt|gt|nbsp);/g, (match, value) => {
        if (entities[value] !== undefined) return entities[value];
        const code = Number(value.slice(1));
        return code <= 0x10ffff ? String.fromCodePoint(code) : match;
      });
      if (decoded !== original) span.textContent = decoded;
    });
    // The viewer clones SVGs, and mapping runs again after Save. Never decode a
    // literal entity-looking label a second time when attaching the clone.
    component.labelElement.setAttribute("data-mermaid-text-decoded", "true");
  }

  /** Map the bundled Mermaid flowchart IDs, never matching by potentially duplicated visible text. */
  function attach(svg, diagram) {
    const components = [];
    const seen = new Set();
    svg.querySelectorAll("g.node").forEach(element => {
      const id = element.id.match(/^flowchart-(.+)-\d+$/)?.[1];
      const sourceNode = diagram.nodes.get(id);
      const component = global.createMarkdownViewerMermaidComponent(id || element.id, sourceNode || {});
      component.svgElement = element;
      component.labelElement = element.querySelector(".label") || element;
      normalizeTextLabel(component);
      component.svgBounds = svgBounds(element, svg);
      if (seen.has(component.nodeId)) component.editable = false;
      seen.add(component.nodeId);
      element.setAttribute("data-mermaid-component", component.nodeId);
      element.setAttribute("data-mermaid-editable", String(component.editable));
      if (sourceNode) {
        element.setAttribute("data-mermaid-source-start", String(diagram.start + sourceNode.labelStart));
        element.setAttribute("data-mermaid-source-end", String(diagram.start + sourceNode.labelEnd));
      }
      components.push(component);
    });
    svg.querySelectorAll("g.cluster, .edgeLabel, path.flowchart-link").forEach(element => {
      components.push(global.createMarkdownViewerMermaidComponent(element.id, {
        kind: element.matches("g.cluster") ? "subgraph" : "edge", svgElement: element,
        svgBounds: svgBounds(element, svg), reason: "Only flowchart node labels can be edited."
      }));
    });
    return components;
  }

  /** Resolve screen coordinates on demand so pan, zoom, scrolling and resizing cannot stale the editor position. */
  function screenBounds(component) {
    return bounds((component.labelElement || component.svgElement).getBoundingClientRect());
  }

  global.MarkdownViewerMermaidSvgMap = { attach, screenBounds };
})(window);
