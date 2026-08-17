// Editable text-object renderer for the layered image compositor.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor;

  namespace.imageEditorContentRenderers.register("text", (context, object) => {
    const payload = object.payload || {};
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const sourceWidth = Math.max(1, Math.ceil(Number(bounds.width) || 1));
    const sourceHeight = Math.max(1, Math.ceil(Number(bounds.height) || 1));
    const effectSource = payload.textEffect && namespace.ImageEditorTextEffectRenderer?.render({
      width: sourceWidth,
      height: sourceHeight,
      text: payload.text || "",
      box: payload.box || {},
      style: payload.style || {},
      effect: payload.textEffect
    });
    const source = effectSource?.canvas || document.createElement("canvas");
    const padding = Number(effectSource?.padding) || 0;
    if (!effectSource) {
      source.width = sourceWidth;
      source.height = sourceHeight;
      namespace.drawText?.(source.getContext("2d"), { x: 0, y: 0, width: source.width, height: source.height, lineHeight: payload.box?.lineHeight }, payload.text || "", payload.style || {});
    }
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const width = Math.max(1, Math.abs(sourceWidth * scaleX));
    const height = Math.max(1, Math.abs(sourceHeight * scaleY));
    const effectWidth = Math.max(1, Math.abs((sourceWidth + padding * 2) * scaleX));
    const effectHeight = Math.max(1, Math.abs((sourceHeight + padding * 2) * scaleY));
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.scale(Math.sign(scaleX), Math.sign(scaleY));
    context.drawImage(source, -effectWidth / 2, -effectHeight / 2, effectWidth, effectHeight);
    context.restore();
  });
})(typeof window !== "undefined" ? window : globalThis);
