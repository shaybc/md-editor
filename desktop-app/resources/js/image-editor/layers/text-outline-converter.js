// Converts editable text objects into font-independent per-glyph vector contours.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const SCALE = 4;

  const styleOf = (object) => {
    const payload = object.payload || {};
    const style = payload.style || {};
    return {
      fontFamily: style.fontFamily || payload.font || "Arial",
      fontSize: Number(style.fontSize || payload.size || 24),
      fontBold: style.fontBold === true || payload.bold === true,
      fontItalic: style.fontItalic === true || payload.italic === true,
      fill: style.foregroundColor || payload.color || "#000000",
      stroke: style.strokeColor || null,
      strokeWidth: Math.max(0, Number(style.strokeWidth) || 0)
    };
  };

  function graphemes(value) {
    if (global.Intl?.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((part) => ({ text: part.segment, index: part.index }));
    let index = 0;
    return Array.from(value).map((text) => { const part = { text, index }; index += text.length; return part; });
  }

  function removeCollinear(points) {
    if (points.length < 4) return points;
    return points.filter((point, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      const next = points[(index + 1) % points.length];
      return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
    });
  }

  function simplify(points, tolerance) {
    if (points.length <= 3) return points;
    const first = points[0];
    const last = points.at(-1);
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    let distance = 0;
    let split = -1;
    for (let index = 1; index < points.length - 1; index += 1) {
      const candidate = Math.abs(dy * points[index].x - dx * points[index].y + last.x * first.y - last.y * first.x) / length;
      if (candidate > distance) { distance = candidate; split = index; }
    }
    if (distance <= tolerance || split < 0) return [first, last];
    return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
  }

  /** Trace a rendered glyph's alpha boundary into editable closed path contours. */
  function traceGlyphContours(imageData, scale = SCALE) {
    const { width, height, data } = imageData;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] >= 24;
    const edges = new Map();
    const add = (x1, y1, x2, y2) => {
      const key = `${x1},${y1}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ x: x2, y: y2 });
    };
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (!opaque(x, y)) continue;
      if (!opaque(x, y - 1)) add(x, y, x + 1, y);
      if (!opaque(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!opaque(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!opaque(x - 1, y)) add(x, y + 1, x, y);
    }
    const contours = [];
    while (edges.size) {
      const [startKey, destinations] = edges.entries().next().value;
      const [startX, startY] = startKey.split(",").map(Number);
      const points = [{ x: startX, y: startY }];
      let current = destinations.shift();
      if (!destinations.length) edges.delete(startKey);
      let guard = width * height * 4 + 4;
      while (current && guard-- > 0 && (current.x !== startX || current.y !== startY)) {
        points.push(current);
        const key = `${current.x},${current.y}`;
        const next = edges.get(key);
        current = next?.shift();
        if (next && !next.length) edges.delete(key);
      }
      if (points.length < 3) continue;
      const reduced = removeCollinear(points);
      const simplified = simplify([...reduced, reduced[0]], 1.1).slice(0, -1);
      if (simplified.length >= 3) contours.push({
        closed: true,
        anchors: simplified.map((point) => ({ point: { x: point.x / scale, y: point.y / scale }, inHandle: null, outHandle: null, smooth: false }))
      });
    }
    return contours;
  }

  function renderGlyph(context, glyph, style) {
    const metrics = context.measureText(glyph);
    const left = Math.max(0, Number(metrics.actualBoundingBoxLeft) || 0);
    const right = Math.max(1, Number(metrics.actualBoundingBoxRight) || metrics.width || style.fontSize / 2);
    const ascent = Math.max(1, Number(metrics.actualBoundingBoxAscent) || style.fontSize * 0.8);
    const descent = Math.max(0, Number(metrics.actualBoundingBoxDescent) || style.fontSize * 0.2);
    const padding = Math.ceil(style.strokeWidth + 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((left + right + padding * 2) * SCALE);
    canvas.height = Math.ceil((ascent + descent + padding * 2) * SCALE);
    const glyphContext = canvas.getContext("2d", { willReadFrequently: true });
    glyphContext.scale(SCALE, SCALE);
    glyphContext.font = context.font;
    glyphContext.textBaseline = "alphabetic";
    glyphContext.fillStyle = "#000";
    glyphContext.fillText(glyph, padding + left, padding + ascent);
    return {
      contours: traceGlyphContours(glyphContext.getImageData(0, 0, canvas.width, canvas.height)),
      left, ascent, padding, width: canvas.width / SCALE, height: canvas.height / SCALE
    };
  }

  function glyphOutlines(object) {
    const payload = object.payload || {};
    const style = styleOf(object);
    const width = Math.max(1, Number(object.bounds?.width) || 1);
    const height = Math.max(1, Number(object.bounds?.height) || 1);
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${style.fontItalic ? "italic " : ""}${style.fontBold ? "bold " : ""}${style.fontSize}px ${style.fontFamily}`;
    const lineHeight = Number(payload.box?.lineHeight) || style.fontSize * 1.2;
    const reference = context.measureText("Mg");
    const ascent = reference.actualBoundingBoxAscent || style.fontSize * 0.8;
    const descent = reference.actualBoundingBoxDescent || style.fontSize * 0.2;
    const baselineOffset = Math.max(ascent, ((lineHeight - ascent - descent) / 2) + ascent);
    const result = [];
    namespace.wrapImageEditorText(context, payload.text || "", width).forEach((line, lineIndex) => {
      const baseline = baselineOffset + lineIndex * lineHeight;
      if (baseline - ascent >= height) return;
      graphemes(line).forEach((part) => {
        if (!part.text.trim()) return;
        const rendered = renderGlyph(context, part.text, style);
        if (!rendered.contours.length) return;
        result.push({
          name: part.text,
          x: context.measureText(line.slice(0, part.index)).width - rendered.left - rendered.padding,
          y: baseline - rendered.ascent - rendered.padding,
          width: rendered.width,
          height: rendered.height,
          contours: rendered.contours,
          style
        });
      });
    });
    return result;
  }

  function rotate(point, center, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cosine - dy * sine, y: center.y + dx * sine + dy * cosine };
  }

  function createPath(source, glyph, index) {
    const bounds = source.bounds || {};
    const transform = source.transform || {};
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const rotation = Number(transform.rotation) || 0;
    const sourceWidth = Math.max(1, Number(bounds.width) || 1);
    const sourceHeight = Math.max(1, Number(bounds.height) || 1);
    const sourceX = Number(transform.x ?? bounds.x) || 0;
    const sourceY = Number(transform.y ?? bounds.y) || 0;
    const center = { x: sourceX + sourceWidth * scaleX / 2, y: sourceY + sourceHeight * scaleY / 2 };
    const glyphCenter = rotate({
      x: center.x + (glyph.x + glyph.width / 2 - sourceWidth / 2) * scaleX,
      y: center.y + (glyph.y + glyph.height / 2 - sourceHeight / 2) * scaleY
    }, center, rotation);
    return namespace.createContentObject("path", {
      tool: "path",
      geometry: { contours: glyph.contours },
      style: { fillColor: glyph.style.fill, strokeColor: glyph.style.stroke, strokeWidth: glyph.style.strokeWidth, fillRule: "evenodd" },
      outlinedFromText: true
    }, {
      name: glyph.name || `Glyph ${index + 1}`,
      visible: source.visible !== false,
      locked: source.locked === true,
      opacity: source.opacity,
      bounds: { x: 0, y: 0, width: glyph.width, height: glyph.height },
      transform: { x: glyphCenter.x - glyph.width * scaleX / 2, y: glyphCenter.y - glyph.height * scaleY / 2, scaleX, scaleY, rotation }
    });
  }

  function selectedText(store) {
    const results = [];
    const seen = new Set();
    const layer = (node) => {
      if (!node || node.locked || node.visible === false) return;
      (node.objects || []).forEach((object, index) => {
        if (object.type === "text" && !object.locked && object.visible !== false && !seen.has(object.id)) {
          seen.add(object.id);
          results.push({ object, layer: node, index });
        }
      });
    };
    const node = (item) => {
      if (!item || item.locked || item.visible === false) return;
      if (item.kind === "layer") layer(item);
      else (item.children || []).forEach(node);
    };
    store.selectedIds.forEach((id) => {
      const object = namespace.findDocumentObject(store.document, id);
      if (object?.object.type === "text" && !object.object.locked && object.object.visible !== false && !object.layer.locked && object.layer.visible !== false && !seen.has(id)) {
        seen.add(id);
        results.push(object);
      } else node(namespace.findDocumentNode(store.document, id)?.node);
    });
    return results;
  }

  class ImageEditorTextOutlineConverter {
    static canConvert(store) { return selectedText(store).length > 0; }

    /** Replace selected text in place with independent, font-free glyph paths. */
    static convertSelected(store, options = {}) {
      const targets = selectedText(store).sort((left, right) => right.index - left.index);
      if (!targets.length) return false;
      const convertedIds = [];
      targets.forEach((target) => {
        const paths = (options.createGlyphOutlines || glyphOutlines)(target.object).map((glyph, index) => createPath(target.object, glyph, index));
        if (!paths.length) return;
        target.layer.objects.splice(target.index, 1, ...paths);
        convertedIds.push(...paths.map((path) => path.id));
      });
      if (!convertedIds.length) return false;
      store.selectedIds = new Set([convertedIds[0]]);
      store.document.activeLayerId = namespace.findDocumentObject(store.document, convertedIds[0])?.layer.id || store.document.activeLayerId;
      store.notify({ type: "create-text-outlines", ids: convertedIds });
      return true;
    }
  }

  Object.assign(namespace, { ImageEditorTextOutlineConverter, traceImageEditorGlyphContours: traceGlyphContours });
})(typeof window !== "undefined" ? window : globalThis);
