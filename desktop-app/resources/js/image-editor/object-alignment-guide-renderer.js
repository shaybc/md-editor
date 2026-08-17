// Presentation-overlay rendering for transient object alignment guides.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /**
   * Draw screen-consistent magenta alignment guides without changing document pixels.
   * @param {CanvasRenderingContext2D} context - Image-editor overlay context.
   * @param {Array<{orientation:string,position:number,start:number,end:number}>} guides - Exact snapped guide spans.
   * @param {number} zoom - Current canvas zoom factor.
   */
  function drawObjectAlignmentGuides(context, guides, zoom) {
    if (!Array.isArray(guides) || !guides.length) return;
    const scale = 1 / Math.max(0.25, Number(zoom) || 1);
    context.save();
    context.strokeStyle = "#ff00c8";
    context.lineWidth = scale;
    context.setLineDash([3 * scale, 3 * scale]);
    context.beginPath();
    guides.forEach((guide) => {
      if (guide.orientation === "vertical") {
        context.moveTo(guide.position, guide.start);
        context.lineTo(guide.position, guide.end);
      } else {
        context.moveTo(guide.start, guide.position);
        context.lineTo(guide.end, guide.position);
      }
    });
    context.stroke();
    context.restore();
  }

  namespace.drawObjectAlignmentGuides = drawObjectAlignmentGuides;
})(typeof window !== "undefined" ? window : globalThis);
