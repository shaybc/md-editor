// Layer-self-compositing renderer for the non-destructive Pic-in-Pic effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function paintMonochromeBackground(context, source, strength) {
    context.drawImage(source, 0, 0);
    if (strength <= 0) return;
    const image = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    const pixels = image.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      const gray = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      pixels[offset] = Math.round(pixels[offset] + (gray - pixels[offset]) * strength);
      pixels[offset + 1] = Math.round(pixels[offset + 1] + (gray - pixels[offset + 1]) * strength);
      pixels[offset + 2] = Math.round(pixels[offset + 2] + (gray - pixels[offset + 2]) * strength);
    }
    context.putImageData(image, 0, 0);
  }

  function resolveCrop(source, descriptor, frameWidth, frameHeight) {
    let width = source.width / (descriptor.zoom / 100);
    let height = source.height / (descriptor.zoom / 100);
    const frameAspect = frameWidth / frameHeight;
    if (width / height > frameAspect) width = height * frameAspect;
    else height = width / frameAspect;
    const availableX = Math.max(0, source.width - width);
    const availableY = Math.max(0, source.height - height);
    return {
      x: availableX * descriptor.cropX / 100,
      y: availableY * descriptor.cropY / 100,
      width,
      height
    };
  }

  /**
   * Build a bordered color inset over a monochrome version of the same layer surface.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Pic-in-Pic descriptor.
   * @returns {HTMLCanvasElement} Source or a Pic-in-Pic composite canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPicInPicEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    paintMonochromeBackground(context, source, descriptor.backgroundBw);

    const centerX = canvas.width * descriptor.positionX / 100;
    const centerY = canvas.height * descriptor.positionY / 100;
    const frameWidth = Math.max(1, canvas.width * descriptor.width / 100);
    const frameHeight = Math.max(1, canvas.height * descriptor.height / 100);
    const crop = resolveCrop(source, descriptor, frameWidth, frameHeight);
    const angle = descriptor.rotation * Math.PI / 180;
    const shadowAngle = descriptor.shadowAngle * Math.PI / 180;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(angle);
    context.shadowColor = `rgba(0, 0, 0, ${descriptor.shadowOpacity})`;
    context.shadowBlur = descriptor.shadowBlur;
    context.shadowOffsetX = Math.cos(shadowAngle) * descriptor.shadowDistance;
    context.shadowOffsetY = Math.sin(shadowAngle) * descriptor.shadowDistance;
    context.fillStyle = descriptor.borderColor;
    context.fillRect(
      -frameWidth / 2 - descriptor.borderSize,
      -frameHeight / 2 - descriptor.borderSize,
      frameWidth + descriptor.borderSize * 2,
      frameHeight + descriptor.borderSize * 2
    );
    context.shadowColor = "transparent";
    context.beginPath();
    context.rect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
    context.clip();
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -frameWidth / 2,
      -frameHeight / 2,
      frameWidth,
      frameHeight
    );
    context.restore();
    return canvas;
  }

  namespace.ImageEditorPicInPicRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
