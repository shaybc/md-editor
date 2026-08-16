// Source color statistics and tonal transfer for Match Color adjustments.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  /** Calculate normalized RGB means and standard deviations for opaque source pixels. */
  function statistics(imageData) {
    const sums = [0, 0, 0];
    const squares = [0, 0, 0];
    let count = 0;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      count += 1;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = imageData.data[index + channel] / 255;
        sums[channel] += value;
        squares[channel] += value * value;
      }
    }
    const means = sums.map((sum) => count ? sum / count : 0);
    const deviations = squares.map((sum, channel) => count ? Math.sqrt(Math.max(0, sum / count - means[channel] ** 2)) : 0);
    return {
      redMean: means[0], greenMean: means[1], blueMean: means[2],
      redDeviation: deviations[0], greenDeviation: deviations[1], blueDeviation: deviations[2]
    };
  }

  /** Convert source statistics into the persistent Match Color property patch. */
  function sourcePatch(sourceNodeId, sourceName, sourceStatistics) {
    return {
      sourceNodeId: sourceNodeId || null,
      sourceName: String(sourceName || "None"),
      sourceRedMean: Number(sourceStatistics?.redMean) || 0,
      sourceGreenMean: Number(sourceStatistics?.greenMean) || 0,
      sourceBlueMean: Number(sourceStatistics?.blueMean) || 0,
      sourceRedDeviation: Number(sourceStatistics?.redDeviation) || 0,
      sourceGreenDeviation: Number(sourceStatistics?.greenDeviation) || 0,
      sourceBlueDeviation: Number(sourceStatistics?.blueDeviation) || 0
    };
  }

  /** Match destination color statistics to the stored source while preserving alpha. */
  function render(imageData, adjustment = {}) {
    if (!adjustment.sourceNodeId) return imageData;
    const target = statistics(imageData);
    const sourceMeans = [adjustment.sourceRedMean, adjustment.sourceGreenMean, adjustment.sourceBlueMean].map(Number);
    const sourceDeviations = [adjustment.sourceRedDeviation, adjustment.sourceGreenDeviation, adjustment.sourceBlueDeviation].map(Number);
    if (adjustment.neutralize === true) {
      const neutral = sourceMeans[0] * .2126 + sourceMeans[1] * .7152 + sourceMeans[2] * .0722;
      sourceMeans.fill(neutral);
    }
    const targetMeans = [target.redMean, target.greenMean, target.blueMean];
    const targetDeviations = [target.redDeviation, target.greenDeviation, target.blueDeviation];
    const intensity = Math.max(.01, Math.min(2, Number(adjustment.colorIntensity) / 100 || 1));
    const luminance = Math.max(.01, Math.min(2, Number(adjustment.luminance) / 100 || 1));
    const amount = 1 - Math.max(0, Math.min(100, Number(adjustment.fade) || 0)) / 100;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const original = imageData.data[index + channel] / 255;
        const deviation = targetDeviations[channel];
        const normalized = deviation > .000001 ? (original - targetMeans[channel]) / deviation : 0;
        const matched = (sourceMeans[channel] + normalized * sourceDeviations[channel] * intensity) * luminance;
        imageData.data[index + channel] = Math.round(clamp01(original + (matched - original) * amount) * 255);
      }
    }
    return imageData;
  }

  namespace.ImageEditorMatchColorAdjustment = { render, sourcePatch, statistics };
  namespace.ImageEditorAdjustmentRenderer.register("match-color", render);
})(typeof window !== "undefined" ? window : globalThis);
