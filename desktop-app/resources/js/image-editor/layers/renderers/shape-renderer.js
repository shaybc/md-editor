// Shape and path renderer using semantic contours or the stored transparent fallback asset.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor;

  function renderVectorContours(context, object) {
    const contours = object.payload?.geometry?.contours;
    if (!Array.isArray(contours) || !contours.length) return false;
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const width = Math.max(1, Math.abs((Number(bounds.width) || 1) * scaleX));
    const height = Math.max(1, Math.abs((Number(bounds.height) || 1) * scaleY));
    const sourceWidth = Math.max(1, Number(bounds.width) || 1);
    const sourceHeight = Math.max(1, Number(bounds.height) || 1);
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    const style = object.payload?.style || {};
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.scale(Math.sign(scaleX), Math.sign(scaleY));
    context.scale(width / sourceWidth, height / sourceHeight);
    context.translate(-sourceWidth / 2, -sourceHeight / 2);
    context.beginPath();
    contours.forEach((contour) => {
      const anchors = contour?.anchors || [];
      if (!anchors.length) return;
      context.moveTo(anchors[0].point.x, anchors[0].point.y);
      for (let index = 1; index < anchors.length; index += 1) {
        const previous = anchors[index - 1];
        const anchor = anchors[index];
        if (previous.outHandle || anchor.inHandle) {
          const first = previous.outHandle || previous.point;
          const second = anchor.inHandle || anchor.point;
          context.bezierCurveTo(first.x, first.y, second.x, second.y, anchor.point.x, anchor.point.y);
        } else context.lineTo(anchor.point.x, anchor.point.y);
      }
      if (contour.closed !== false) context.closePath();
    });
    if (style.fillColor && style.fillColor !== "transparent") {
      context.fillStyle = style.fillColor;
      context.fill(style.fillRule === "nonzero" ? "nonzero" : "evenodd");
    }
    if (style.strokeColor && Number(style.strokeWidth) > 0) {
      context.strokeStyle = style.strokeColor;
      context.lineWidth = Number(style.strokeWidth);
      context.stroke();
    }
    context.restore();
    return true;
  }

  const render = (context, object, assets) => {
    if (renderVectorContours(context, object)) return;
    namespace.renderImageEditorRasterObject(context, object, assets, object.payload?.fallbackAssetId);
  };
  namespace.imageEditorContentRenderers.register("shape", render).register("path", render).register("fallback", render);
})(typeof window !== "undefined" ? window : globalThis);
