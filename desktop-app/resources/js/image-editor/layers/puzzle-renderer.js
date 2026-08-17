// Interlocking jigsaw-piece renderer for the non-destructive Puzzle layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function edgeDirection(index, seed) {
    return randomAt(index, seed) < 0.5 ? -1 : 1;
  }

  function buildPiecePath(x, y, width, height, row, column, rows, columns, seed) {
    const path = new Path2D();
    const tabX = Math.min(width * 0.24, height * 0.2);
    const tabY = Math.min(height * 0.24, width * 0.2);
    const top = row === 0 ? 0 : edgeDirection((row * columns + column) * 2, seed);
    const right = column === columns - 1 ? 0 : edgeDirection((row * columns + column) * 2 + 1, seed);
    const bottom = row === rows - 1 ? 0 : edgeDirection(((row + 1) * columns + column) * 2, seed);
    const left = column === 0 ? 0 : edgeDirection((row * columns + column - 1) * 2 + 1, seed);

    path.moveTo(x, y);
    path.lineTo(x + width * 0.35, y);
    if (top) {
      path.bezierCurveTo(x + width * 0.4, y, x + width * 0.38, y + top * tabY, x + width * 0.5, y + top * tabY);
      path.bezierCurveTo(x + width * 0.62, y + top * tabY, x + width * 0.6, y, x + width * 0.65, y);
    }
    path.lineTo(x + width, y);
    path.lineTo(x + width, y + height * 0.35);
    if (right) {
      path.bezierCurveTo(x + width, y + height * 0.4, x + width + right * tabX, y + height * 0.38, x + width + right * tabX, y + height * 0.5);
      path.bezierCurveTo(x + width + right * tabX, y + height * 0.62, x + width, y + height * 0.6, x + width, y + height * 0.65);
    }
    path.lineTo(x + width, y + height);
    path.lineTo(x + width * 0.65, y + height);
    if (bottom) {
      path.bezierCurveTo(x + width * 0.6, y + height, x + width * 0.62, y + height + bottom * tabY, x + width * 0.5, y + height + bottom * tabY);
      path.bezierCurveTo(x + width * 0.38, y + height + bottom * tabY, x + width * 0.4, y + height, x + width * 0.35, y + height);
    }
    path.lineTo(x, y + height);
    path.lineTo(x, y + height * 0.65);
    if (left) {
      path.bezierCurveTo(x, y + height * 0.6, x + left * tabX, y + height * 0.62, x + left * tabX, y + height * 0.5);
      path.bezierCurveTo(x + left * tabX, y + height * 0.38, x, y + height * 0.4, x, y + height * 0.35);
    }
    path.closePath();
    return path;
  }

  function setPieceTransform(context, centerX, centerY, offsetX, offsetY, angle) {
    context.translate(centerX + offsetX, centerY + offsetY);
    context.rotate(angle);
    context.translate(-centerX, -centerY);
  }

  /**
   * Divide one source image into interlocking pieces with optional missing and lifted pieces.
   * @param {HTMLCanvasElement} source - Fully rendered layer surface.
   * @param {object|null} effect - Normalized Puzzle descriptor.
   * @returns {HTMLCanvasElement} Source or a puzzle canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPuzzleEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const pieceWidth = canvas.width / descriptor.columns;
    const pieceHeight = canvas.height / descriptor.rows;

    for (let row = 0; row < descriptor.rows; row += 1) {
      for (let column = 0; column < descriptor.columns; column += 1) {
        const index = row * descriptor.columns + column;
        if (randomAt(index * 7, descriptor.seed) * 100 < descriptor.missingPieces) continue;
        const x = column * pieceWidth;
        const y = row * pieceHeight;
        const centerX = x + pieceWidth / 2;
        const centerY = y + pieceHeight / 2;
        const lifted = randomAt(index * 7 + 1, descriptor.seed) * 100 < descriptor.liftedPieces;
        const offsetX = lifted ? (randomAt(index * 7 + 2, descriptor.seed) * 2 - 1) * descriptor.scatter : 0;
        const offsetY = lifted ? (randomAt(index * 7 + 3, descriptor.seed) * 2 - 1) * descriptor.scatter : 0;
        const angle = lifted ? (randomAt(index * 7 + 4, descriptor.seed) * 2 - 1) * descriptor.rotation * Math.PI / 180 : 0;
        const path = buildPiecePath(x, y, pieceWidth, pieceHeight, row, column, descriptor.rows, descriptor.columns, descriptor.seed);

        if (lifted) {
          context.save();
          setPieceTransform(context, centerX, centerY, offsetX, offsetY, angle);
          context.shadowColor = `rgba(0,0,0,${descriptor.shadowStrength})`;
          context.shadowBlur = descriptor.shadowBlur;
          context.shadowOffsetX = descriptor.shadowBlur * 0.55;
          context.shadowOffsetY = descriptor.shadowBlur * 0.65;
          context.fillStyle = "#000000";
          context.fill(path);
          context.restore();
        }

        context.save();
        setPieceTransform(context, centerX, centerY, offsetX, offsetY, angle);
        context.clip(path);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(source, 0, 0);
        context.restore();

        context.save();
        setPieceTransform(context, centerX, centerY, offsetX, offsetY, angle);
        context.lineJoin = "round";
        context.strokeStyle = `rgba(0,0,0,${descriptor.seamStrength})`;
        context.lineWidth = Math.max(0.5, descriptor.relief * 1.7);
        context.stroke(path);
        context.strokeStyle = `rgba(255,255,255,${descriptor.seamStrength * 0.72})`;
        context.lineWidth = Math.max(0.35, descriptor.relief * 0.65);
        context.stroke(path);
        context.restore();
      }
    }
    return canvas;
  }

  namespace.ImageEditorPuzzleRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
