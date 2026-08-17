// Shallow-focus tilt renderer for the non-destructive Miniature layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createBlurredPixels(source, radius) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.filter = "none";
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  function smoothstep(value) {
    const amount = Math.max(0, Math.min(1, value));
    return amount * amount * (3 - 2 * amount);
  }

  function sampleIndex(x, y, width, height, distortion, amount, centerX, centerY) {
    if (!distortion || !amount) return (y * width + x) * 4;
    const strength = distortion / 100 * amount;
    let sampleX = x;
    let sampleY = y;
    if (strength > 0) {
      const scale = 1 + strength * 0.12;
      sampleX = centerX + (x - centerX) / scale;
      sampleY = centerY + (y - centerY) / scale;
    } else {
      const angle = strength * 0.16;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const offsetX = x - centerX;
      const offsetY = y - centerY;
      sampleX = centerX + offsetX * cosine - offsetY * sine;
      sampleY = centerY + offsetX * sine + offsetY * cosine;
    }
    const clampedX = Math.max(0, Math.min(width - 1, Math.round(sampleX)));
    const clampedY = Math.max(0, Math.min(height - 1, Math.round(sampleY)));
    return (clampedY * width + clampedX) * 4;
  }

  function applySaturation(red, green, blue, adjustment) {
    const amount = adjustment >= 0 ? 1 + adjustment / 100 : 1 + adjustment / 100;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    return [
      Math.max(0, Math.min(255, luminance + (red - luminance) * amount)),
      Math.max(0, Math.min(255, luminance + (green - luminance) * amount)),
      Math.max(0, Math.min(255, luminance + (blue - luminance) * amount))
    ];
  }

  /**
   * Apply an angled shallow-focus band with progressive blur and model-like color intensity.
   * @param {HTMLCanvasElement} source - Fully rendered layer surface.
   * @param {object|null} effect - Normalized Miniature descriptor.
   * @returns {HTMLCanvasElement} Source or a miniature-effect canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorMiniatureEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const original = new Uint8ClampedArray(image.data);
    const blurred = createBlurredPixels(source, descriptor.blurRadius);
    const radians = descriptor.angle * Math.PI / 180;
    const normalX = -Math.sin(radians);
    const normalY = Math.cos(radians);
    const centerX = canvas.width / 2;
    const centerY = canvas.height * descriptor.focusPosition / 100;
    const sharpHalfWidth = canvas.height * descriptor.focusWidth / 200;
    const transitionWidth = Math.max(1, canvas.height * descriptor.transition / 100);

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const targetIndex = (y * canvas.width + x) * 4;
        if (original[targetIndex + 3] === 0) continue;
        const signedDistance = (x - centerX) * normalX + (y - centerY) * normalY;
        const blurAmount = smoothstep((Math.abs(signedDistance) - sharpHalfWidth) / transitionWidth);
        const distortionAmount = descriptor.symmetricDistortion || signedDistance > 0 ? blurAmount : 0;
        const sample = sampleIndex(x, y, canvas.width, canvas.height, descriptor.distortion, distortionAmount, centerX, centerY);
        const red = original[targetIndex] + (blurred[sample] - original[targetIndex]) * blurAmount;
        const green = original[targetIndex + 1] + (blurred[sample + 1] - original[targetIndex + 1]) * blurAmount;
        const blue = original[targetIndex + 2] + (blurred[sample + 2] - original[targetIndex + 2]) * blurAmount;
        const saturated = applySaturation(red, green, blue, descriptor.saturation);
        image.data[targetIndex] = saturated[0];
        image.data[targetIndex + 1] = saturated[1];
        image.data[targetIndex + 2] = saturated[2];
        image.data[targetIndex + 3] = original[targetIndex + 3];
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorMiniatureRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
