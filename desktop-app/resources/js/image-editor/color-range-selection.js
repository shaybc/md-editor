// Color-distance sampling and mask generation for the image editor's Color Range selection tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  /** Normalize Photoshop-style fuzziness to the supported 0-200 interval. */
  function normalizeFuzziness(value) {
    return Math.round(clamp(value, 0, 200));
  }

  /** Measure RGB distance between two colors. */
  function colorDistance(first, second) {
    const red = (Number(first?.[0]) || 0) - (Number(second?.[0]) || 0);
    const green = (Number(first?.[1]) || 0) - (Number(second?.[1]) || 0);
    const blue = (Number(first?.[2]) || 0) - (Number(second?.[2]) || 0);
    return Math.sqrt(red * red + green * green + blue * blue);
  }

  /** Read an RGBA sample from an ImageData-compatible value. */
  function samplePixel(imageData, x, y) {
    if (!imageData?.data || !imageData.width || !imageData.height) return null;
    const column = Math.max(0, Math.min(imageData.width - 1, Math.floor(Number(x) || 0)));
    const row = Math.max(0, Math.min(imageData.height - 1, Math.floor(Number(y) || 0)));
    const index = (row * imageData.width + column) * 4;
    return Array.from(imageData.data.slice(index, index + 4));
  }

  function sampleStrength(color, sample, fuzziness) {
    const distance = colorDistance(color, sample.color);
    if (!fuzziness) return distance < .5 ? 1 : 0;
    return Math.max(0, 1 - distance / (normalizeFuzziness(fuzziness) * 2.21));
  }

  /**
   * Build a tightly bounded, soft alpha mask from replace/add/subtract color samples.
   * @returns {{x:number,y:number,width:number,height:number,data:Uint8ClampedArray}|null}
   */
  function buildColorRangeMask(imageData, samples, options = {}) {
    if (!imageData?.data || !imageData.width || !imageData.height || !Array.isArray(samples) || !samples.length) return null;
    const fuzziness = normalizeFuzziness(options.fuzziness);
    const mask = new Uint8ClampedArray(imageData.width * imageData.height);
    let left = imageData.width;
    let top = imageData.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const pixelIndex = (y * imageData.width + x) * 4;
        const sourceAlpha = imageData.data[pixelIndex + 3] / 255;
        if (!sourceAlpha) continue;
        const color = [imageData.data[pixelIndex], imageData.data[pixelIndex + 1], imageData.data[pixelIndex + 2]];
        let included = 0;
        let excluded = 0;
        samples.forEach((sample) => {
          const strength = sampleStrength(color, sample, fuzziness);
          if (sample.operation === "subtract") excluded = Math.max(excluded, strength);
          else included = Math.max(included, strength);
        });
        const strength = Math.max(0, included - excluded) * sourceAlpha;
        const alpha = Math.round(strength * 255);
        if (!alpha) continue;
        mask[y * imageData.width + x] = alpha;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return null;
    const width = right - left + 1;
    const height = bottom - top + 1;
    const trimmed = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      const sourceStart = (top + y) * imageData.width + left;
      trimmed.set(mask.subarray(sourceStart, sourceStart + width), y * width);
    }
    return { x: left, y: top, width, height, data: trimmed };
  }

  namespace.ImageEditorColorRangeSelection = {
    normalizeFuzziness,
    colorDistance,
    samplePixel,
    sampleStrength,
    buildMask: buildColorRangeMask
  };
})(typeof window !== "undefined" ? window : globalThis);
