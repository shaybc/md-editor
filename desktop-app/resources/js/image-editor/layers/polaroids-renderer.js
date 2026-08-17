// Scattered instant-photo collage renderer for the non-destructive Polaroids layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function withCardTransform(context, card, draw) {
    context.save();
    context.translate(card.centerX, card.centerY);
    context.rotate(card.angle);
    draw();
    context.restore();
  }

  function buildCards(width, height, descriptor) {
    const aspect = width / Math.max(1, height);
    const columns = Math.max(2, Math.ceil(Math.sqrt(descriptor.cardCount * aspect)));
    const rows = Math.ceil(descriptor.cardCount / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const requestedWidth = width * descriptor.cardSize / 100;
    const photoWidth = Math.max(8, Math.min(requestedWidth, cellWidth * 1.55));
    const photoHeight = Math.max(8, Math.min(photoWidth, cellHeight * 1.55));
    const jitterX = cellWidth * descriptor.scatter / 200;
    const jitterY = cellHeight * descriptor.scatter / 200;

    return Array.from({ length: descriptor.cardCount }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        centerX: (column + 0.5) * cellWidth + (randomAt(index * 3, descriptor.seed) * 2 - 1) * jitterX,
        centerY: (row + 0.5) * cellHeight + (randomAt(index * 3 + 1, descriptor.seed) * 2 - 1) * jitterY,
        angle: (randomAt(index * 3 + 2, descriptor.seed) * 2 - 1) * descriptor.rotation * Math.PI / 180,
        photoWidth,
        photoHeight
      };
    });
  }

  /**
   * Reveal one source image through a scattered collage of framed instant photographs.
   * @param {HTMLCanvasElement} source - Fully rendered layer surface.
   * @param {object|null} effect - Normalized Polaroids descriptor.
   * @returns {HTMLCanvasElement} Source or a collage canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPolaroidsEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    buildCards(canvas.width, canvas.height, descriptor).forEach((card) => {
      const outerWidth = card.photoWidth + descriptor.frameWidth * 2;
      const outerHeight = card.photoHeight + descriptor.frameWidth + descriptor.bottomBorder;
      const outerX = -outerWidth / 2;
      const outerY = -outerHeight / 2;
      const photoX = -card.photoWidth / 2;
      const photoY = outerY + descriptor.frameWidth;

      withCardTransform(context, card, () => {
        context.shadowColor = `rgba(0,0,0,${descriptor.shadowStrength})`;
        context.shadowBlur = descriptor.shadowBlur;
        context.shadowOffsetX = descriptor.shadowBlur * 0.45;
        context.shadowOffsetY = descriptor.shadowBlur * 0.55;
        context.fillStyle = descriptor.frameColor;
        context.fillRect(outerX, outerY, outerWidth, outerHeight);
      });

      context.save();
      context.translate(card.centerX, card.centerY);
      context.rotate(card.angle);
      context.beginPath();
      context.rect(photoX, photoY, card.photoWidth, card.photoHeight);
      context.clip();
      context.rotate(-card.angle);
      context.translate(-card.centerX, -card.centerY);
      context.drawImage(source, 0, 0);
      context.restore();
    });
    return canvas;
  }

  namespace.ImageEditorPolaroidsRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
