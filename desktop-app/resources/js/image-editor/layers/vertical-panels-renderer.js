// Segmented photo-panel renderer for the non-destructive Vertical Panels layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function panelPath(context, centerX, centerY, width, height, angle) {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(angle);
    context.rect(-width / 2, -height / 2, width, height);
    context.restore();
  }

  /**
   * Reveal one source image through staggered, rotated vertical panels over a solid background.
   * @param {HTMLCanvasElement} source - Fully rendered layer surface.
   * @param {object|null} effect - Normalized Vertical Panels descriptor.
   * @returns {HTMLCanvasElement} Source or a panel-composition canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorVerticalPanelsEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const margin = Math.min(canvas.width * 0.12, Math.max(8, descriptor.shadowBlur + descriptor.borderWidth));
    const usableWidth = Math.max(descriptor.panelCount, canvas.width - margin * 2 - descriptor.gap * (descriptor.panelCount - 1));
    const panelWidth = usableWidth / descriptor.panelCount;
    const panelHeight = Math.max(1, canvas.height - margin * 2 - descriptor.stagger);
    const startX = margin + panelWidth / 2;

    for (let index = 0; index < descriptor.panelCount; index += 1) {
      const centerX = startX + index * (panelWidth + descriptor.gap);
      const verticalOffset = (randomAt(index * 2, descriptor.seed) * 2 - 1) * descriptor.stagger / 2;
      const angle = (randomAt(index * 2 + 1, descriptor.seed) * 2 - 1) * descriptor.rotation * Math.PI / 180;
      const centerY = canvas.height / 2 + verticalOffset;

      context.save();
      context.shadowColor = `rgba(0,0,0,${descriptor.shadowStrength})`;
      context.shadowBlur = descriptor.shadowBlur;
      context.shadowOffsetX = descriptor.shadowBlur * 0.45;
      context.shadowOffsetY = descriptor.shadowBlur * 0.45;
      context.fillStyle = "#000000";
      context.beginPath();
      panelPath(context, centerX, centerY, panelWidth, panelHeight, angle);
      context.fill();
      context.restore();

      context.save();
      context.beginPath();
      panelPath(context, centerX, centerY, panelWidth, panelHeight, angle);
      context.clip();
      context.drawImage(source, 0, 0);
      context.restore();

      if (descriptor.borderWidth > 0) {
        context.save();
        context.strokeStyle = descriptor.borderColor;
        context.lineWidth = descriptor.borderWidth;
        context.beginPath();
        panelPath(context, centerX, centerY, panelWidth, panelHeight, angle);
        context.stroke();
        context.restore();
      }
    }
    return canvas;
  }

  namespace.ImageEditorVerticalPanelsRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
