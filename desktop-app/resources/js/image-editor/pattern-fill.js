// Deterministic two-color effect patterns for image-editor bucket regions.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PATTERN_TYPES = Object.freeze(["crosshatch", "halftone", "grain", "mosaic", "stained-glass", "pointillize"]);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value)));
  }

  function hash(x, y, seed = 0) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function mixColor(first, second, ratio) {
    return first.map((channel, index) => Math.round(channel + (second[index] - channel) * ratio));
  }

  function rotatePoint(x, y, angle) {
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return { x: x * cosine + y * sine, y: -x * sine + y * cosine };
  }

  function distanceToGridLine(value, spacing) {
    const wrapped = ((value % spacing) + spacing) % spacing;
    return Math.min(wrapped, spacing - wrapped);
  }

  function patternColorAt(type, x, y, settings, foreground, background) {
    const scale = clamp(settings.patternScale, 4, 64);
    const density = clamp(settings.patternDensity, 10, 90) / 100;
    const rotated = rotatePoint(x, y, settings.patternAngle);
    if (type === "crosshatch") {
      const spacing = scale;
      const thickness = Math.max(1, spacing * (0.04 + density * 0.12));
      const firstLine = distanceToGridLine(rotated.x + rotated.y, spacing);
      const secondLine = distanceToGridLine(rotated.x - rotated.y, spacing);
      return firstLine <= thickness || secondLine <= thickness ? foreground : background;
    }
    if (type === "halftone") {
      const cellX = Math.floor(rotated.x / scale);
      const cellY = Math.floor(rotated.y / scale);
      const localX = rotated.x - (cellX + 0.5) * scale;
      const localY = rotated.y - (cellY + 0.5) * scale;
      const radius = scale * (0.12 + density * 0.38);
      return Math.hypot(localX, localY) <= radius ? foreground : background;
    }
    if (type === "grain") {
      const noise = hash(Math.floor(x), Math.floor(y), 3);
      const contrast = clamp((noise - 0.5) * (0.8 + density * 1.8) + 0.5, 0, 1);
      return mixColor(background, foreground, contrast);
    }
    if (type === "mosaic") {
      const cellX = Math.floor(rotated.x / scale);
      const cellY = Math.floor(rotated.y / scale);
      const localX = ((rotated.x % scale) + scale) % scale;
      const localY = ((rotated.y % scale) + scale) % scale;
      const grout = Math.max(1, scale * (0.03 + density * 0.06));
      if (localX <= grout || localY <= grout) return foreground;
      return mixColor(background, foreground, 0.1 + hash(cellX, cellY, 5) * density * 0.65);
    }
    if (type === "stained-glass") {
      const rowHeight = scale * 0.78;
      const row = Math.floor(rotated.y / rowHeight);
      const offset = row % 2 ? scale / 2 : 0;
      const column = Math.floor((rotated.x - offset) / scale);
      const centerX = (column + 0.5) * scale + offset;
      const centerY = (row + 0.5) * rowHeight;
      const normalizedX = Math.abs(rotated.x - centerX) / (scale / 2);
      const normalizedY = Math.abs(rotated.y - centerY) / (rowHeight / 2);
      const border = normalizedX + normalizedY * 0.58 >= 0.88 - density * 0.08;
      return border ? foreground : mixColor(background, foreground, 0.08 + hash(column, row, 11) * 0.42);
    }
    const cellX = Math.floor(rotated.x / scale);
    const cellY = Math.floor(rotated.y / scale);
    const centerX = (cellX + 0.2 + hash(cellX, cellY, 17) * 0.6) * scale;
    const centerY = (cellY + 0.2 + hash(cellX, cellY, 23) * 0.6) * scale;
    const radius = scale * (0.08 + density * 0.28);
    return Math.hypot(rotated.x - centerX, rotated.y - centerY) <= radius ? foreground : background;
  }

  /**
   * Fill one contiguous bucket region with a selected two-color effect pattern.
   * @param {CanvasRenderingContext2D} context - Destination image canvas context.
   * @param {{x:number,y:number}} point - Bucket seed in canvas pixels.
   * @param {object} state - Pattern choice, geometry, and foreground/background colors.
   * @returns {boolean} Whether the region was painted.
   */
  function patternFill(context, point, state) {
    const region = namespace.createFloodFillRegion(context, point);
    const type = PATTERN_TYPES.includes(state.patternFillType) ? state.patternFillType : "crosshatch";
    const foreground = namespace.colorToRgba(state.foregroundColor);
    const background = namespace.colorToRgba(state.backgroundColor);
    return namespace.paintFloodFillRegion(context, region, (x, y) =>
      patternColorAt(type, x, y, state, foreground, background));
  }

  namespace.patternFillTypes = PATTERN_TYPES;
  namespace.patternFill = patternFill;
})(typeof window !== "undefined" ? window : globalThis);
