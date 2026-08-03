// Canvas drawing primitives for raster image-editor gestures.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function configureStroke(context, state, width) {
    context.strokeStyle = state.foregroundColor;
    context.fillStyle = state.backgroundColor;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  function drawFreehand(context, from, to, state, tool) {
    configureStroke(context, state, tool === "pencil" ? 1 : state.brushSize);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  function drawShape(context, tool, start, end, state) {
    configureStroke(context, state, state.lineWidth);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    context.beginPath();
    if (tool === "line") {
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    } else if (tool === "rectangle") {
      context.rect(x, y, width, height);
    } else if (tool === "ellipse") {
      context.ellipse(x + width / 2, y + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
    }
    if (state.fillShapes && tool !== "line") context.fill();
    context.stroke();
  }

  function drawPolygon(context, points, state, close) {
    if (!points?.length) return;
    configureStroke(context, state, state.lineWidth);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (close && points.length > 2) context.closePath();
    if (close && state.fillShapes) context.fill();
    context.stroke();
  }

  function colorToRgba(color) {
    const value = String(color || "#000000").trim();
    const hex = value.startsWith("#") ? value.slice(1) : value;
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return [0, 1, 2].map((index) => parseInt(hex[index] + hex[index], 16)).concat(255);
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)).concat(255);
    }
    return [0, 0, 0, 255];
  }

  function pixelsMatch(data, index, color) {
    return data[index] === color[0] && data[index + 1] === color[1] && data[index + 2] === color[2] && data[index + 3] === color[3];
  }

  function setPixel(data, index, color) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }

  function floodFill(context, point, state) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const startX = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const startY = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const startIndex = (startY * width + startX) * 4;
    const targetColor = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
    const fillColor = colorToRgba(state.foregroundColor);
    if (targetColor.every((channel, index) => channel === fillColor[index])) return false;
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = (y * width + x) * 4;
      if (!pixelsMatch(data, index, targetColor)) continue;
      setPixel(data, index, fillColor);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    context.putImageData(imageData, 0, 0);
    return true;
  }
  function wrapText(context, text, maxWidth) {
    const output = [];
    String(text).split(/\r?\n/).forEach((sourceLine) => {
      const words = sourceLine.split(/\s+/);
      let line = "";
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          output.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      output.push(line);
    });
    return output;
  }

  function drawText(context, box, text, state) {
    if (!String(text || "")) return;
    const fontSize = box.fontSize || state.fontSize;
    const font = `${state.fontItalic ? "italic " : ""}${state.fontBold ? "bold " : ""}${fontSize}px ${state.fontFamily}`;
    context.font = font;
    context.textBaseline = "alphabetic";
    context.fillStyle = state.foregroundColor;
    const width = Math.max(1, box.width || context.canvas.width - box.x);
    const height = Math.max(1, box.height || context.canvas.height - box.y);
    const lineHeight = box.lineHeight || fontSize * 1.2;
    const metrics = context.measureText("Mg");
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
    const baselineOffset = Math.max(ascent, ((lineHeight - ascent - descent) / 2) + ascent);
    const lines = wrapText(context, text, width);
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, width, height);
    context.clip();
    lines.forEach((line, index) => {
      const baselineY = box.y + baselineOffset + index * lineHeight;
      if (baselineY - ascent >= box.y + height) return;
      context.fillText(line, box.x, baselineY);
    });
    context.restore();
  }

  Object.assign(namespace, { configureStroke, drawFreehand, drawShape, drawPolygon, floodFill, drawText });
})(typeof window !== "undefined" ? window : globalThis);
