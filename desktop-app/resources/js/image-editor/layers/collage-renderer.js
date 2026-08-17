// Square-tile photo renderer for the non-destructive Collage layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  /** Split one layer into bordered, independently offset photo tiles over a solid background. */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorCollageEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const count = descriptor.gridSize;
    const cellWidth = canvas.width / count;
    const cellHeight = canvas.height / count;
    const drawWidth = Math.max(1, cellWidth - descriptor.gap);
    const drawHeight = Math.max(1, cellHeight - descriptor.gap);
    const centerIndex = Math.floor(count * count / 2);

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        const index = row * count + column;
        const isCenter = index === centerIndex && count % 2 === 1;
        const rotation = isCenter ? 0 : (randomAt(index * 3, descriptor.seed) * 2 - 1) * descriptor.rotation * Math.PI / 180;
        const offsetX = isCenter ? 0 : (randomAt(index * 3 + 1, descriptor.seed) * 2 - 1) * descriptor.scatter;
        const offsetY = isCenter ? 0 : (randomAt(index * 3 + 2, descriptor.seed) * 2 - 1) * descriptor.scatter;
        const centerX = (column + 0.5) * cellWidth + offsetX;
        const centerY = (row + 0.5) * cellHeight + offsetY;

        context.save();
        context.translate(centerX, centerY);
        context.rotate(rotation);
        context.shadowColor = `rgba(0,0,0,${descriptor.shadowOpacity})`;
        context.shadowBlur = descriptor.shadowBlur;
        context.shadowOffsetX = descriptor.shadowDistance * 0.7;
        context.shadowOffsetY = descriptor.shadowDistance;
        context.fillStyle = descriptor.borderColor;
        context.fillRect(
          -drawWidth / 2 - descriptor.borderSize,
          -drawHeight / 2 - descriptor.borderSize,
          drawWidth + descriptor.borderSize * 2,
          drawHeight + descriptor.borderSize * 2
        );
        context.shadowColor = "transparent";
        context.drawImage(
          source,
          column * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight
        );
        context.restore();
      }
    }
    return canvas;
  }

  namespace.ImageEditorCollageRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
