// Painterly color grouping and bristle-relief rendering for the Painted Texture layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const MAXIMUM_WORKING_EDGE = 720;

  function clamp(value, minimum = 0, maximum = 255) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function luminance(data, index) {
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  }

  function alphaBounds(data, width, height) {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return right < left ? null : { left, top, right, bottom };
  }

  function paintColors(sourcePixels, width, height, bounds, descriptor) {
    const output = new ImageData(new Uint8ClampedArray(sourcePixels.data), width, height);
    const radius = Math.max(1, Math.min(6, Math.round(1 + descriptor.cleanliness * 0.35 + descriptor.scale * 0.15)));
    const bins = Math.max(5, Math.min(20, Math.round(5 + descriptor.stylization * 1.5)));
    const blend = 0.82 - descriptor.stylization * 0.025;
    const counts = new Uint16Array(bins);
    const red = new Float64Array(bins);
    const green = new Float64Array(bins);
    const blue = new Float64Array(bins);
    const step = radius > 4 ? 2 : 1;

    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const destination = (y * width + x) * 4;
        if (sourcePixels.data[destination + 3] === 0) continue;
        counts.fill(0);
        red.fill(0);
        green.fill(0);
        blue.fill(0);
        for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
          const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
          for (let offsetX = -radius; offsetX <= radius; offsetX += step) {
            const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
            const sample = (sampleY * width + sampleX) * 4;
            if (sourcePixels.data[sample + 3] === 0) continue;
            const bin = Math.min(bins - 1, Math.floor(luminance(sourcePixels.data, sample) / 256 * bins));
            counts[bin] += 1;
            red[bin] += sourcePixels.data[sample];
            green[bin] += sourcePixels.data[sample + 1];
            blue[bin] += sourcePixels.data[sample + 2];
          }
        }
        let strongest = 0;
        for (let bin = 1; bin < bins; bin += 1) {
          if (counts[bin] > counts[strongest]) strongest = bin;
        }
        if (!counts[strongest]) continue;
        const inverseCount = 1 / counts[strongest];
        output.data[destination] = sourcePixels.data[destination] * (1 - blend) + red[strongest] * inverseCount * blend;
        output.data[destination + 1] = sourcePixels.data[destination + 1] * (1 - blend) + green[strongest] * inverseCount * blend;
        output.data[destination + 2] = sourcePixels.data[destination + 2] * (1 - blend) + blue[strongest] * inverseCount * blend;
      }
    }
    return output;
  }

  function applyBristleLighting(pixels, width, height, bounds, descriptor) {
    if (!descriptor.lighting || descriptor.shine <= 0) return pixels;
    const source = new Uint8ClampedArray(pixels.data);
    const radians = descriptor.angle * Math.PI / 180;
    const lightX = Math.cos(radians);
    const lightY = Math.sin(radians);
    const bristleStrength = descriptor.bristleDetail / 10;
    const reliefStrength = descriptor.shine / 10;
    const grooveFrequency = 0.22 + 0.16 / Math.max(0.1, descriptor.scale);

    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const index = (y * width + x) * 4;
        if (source[index + 3] === 0) continue;
        const left = (y * width + Math.max(0, x - 1)) * 4;
        const right = (y * width + Math.min(width - 1, x + 1)) * 4;
        const top = (Math.max(0, y - 1) * width + x) * 4;
        const bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
        const gradientX = (luminance(source, right) - luminance(source, left)) / 255;
        const gradientY = (luminance(source, bottom) - luminance(source, top)) / 255;
        const surfaceLight = -(gradientX * lightX + gradientY * lightY) * (0.35 + descriptor.scale * 0.12);
        const groove = Math.sin((x * -lightY + y * lightX) * grooveFrequency) * bristleStrength * 0.075;
        const highlight = (surfaceLight + groove) * reliefStrength * 255;
        pixels.data[index] = clamp(source[index] + highlight);
        pixels.data[index + 1] = clamp(source[index + 1] + highlight);
        pixels.data[index + 2] = clamp(source[index + 2] + highlight);
      }
    }
    return pixels;
  }

  /**
   * Return a painterly copy of the rendered layer while preserving its original alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Painted Texture descriptor.
   * @returns {HTMLCanvasElement} Source or a painted transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPaintedTextureEffect.normalize(effect);
    const workingScale = Math.min(1, MAXIMUM_WORKING_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * workingScale));
    const height = Math.max(1, Math.round(source.height * workingScale));
    const working = document.createElement("canvas");
    working.width = width;
    working.height = height;
    const workingContext = working.getContext("2d", { willReadFrequently: true });
    workingContext.imageSmoothingEnabled = true;
    workingContext.imageSmoothingQuality = "high";
    workingContext.drawImage(source, 0, 0, width, height);
    const sourcePixels = workingContext.getImageData(0, 0, width, height);
    const bounds = alphaBounds(sourcePixels.data, width, height);
    if (!bounds) return source;
    const painted = paintColors(sourcePixels, width, height, bounds, descriptor);
    applyBristleLighting(painted, width, height, bounds, descriptor);
    workingContext.putImageData(painted, 0, 0);

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    context.save();
    context.globalCompositeOperation = "source-atop";
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(working, 0, 0, source.width, source.height);
    context.restore();
    return canvas;
  }

  namespace.ImageEditorPaintedTextureRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
