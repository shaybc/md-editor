// Canvas drawing primitives for raster image-editor gestures.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const FLOOD_FILL_COLOR_TOLERANCE = 48;
  const FLOOD_FILL_EDGE_SEARCH_RADIUS = 3;
  const FLOOD_FILL_EDGE_DIRECTION_ALIGNMENT = 0.97;

  function configureStroke(context, state, width, pathDistance = 0) {
    context.strokeStyle = state.foregroundColor;
    context.fillStyle = state.backgroundColor;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (namespace.applyStrokeType) namespace.applyStrokeType(context, state.strokeType, width, pathDistance);
    else {
      context.setLineDash([]);
      context.lineDashOffset = 0;
    }
  }

  function drawFreehand(context, from, to, state, tool, pathDistance = 0) {
    const width = tool === "pencil" ? 1 : state.brushSize;
    configureStroke(context, state, width, pathDistance);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    return pathDistance + Math.hypot(to.x - from.x, to.y - from.y);
  }

  function resolveCurveGeometry(curve) {
    const start = curve.start;
    const end = curve.end;
    const bends = curve.bends || [];
    if (!bends.length) return { kind: "line", start, end };
    if (bends.length === 1) {
      const bend = bends[0];
      const t = Math.max(0.05, Math.min(0.95, bend.t));
      const inverse = 1 - t;
      return {
        kind: "quadratic",
        start,
        end,
        control: {
          x: (bend.point.x - inverse * inverse * start.x - t * t * end.x) / (2 * inverse * t),
          y: (bend.point.y - inverse * inverse * start.y - t * t * end.y) / (2 * inverse * t)
        }
      };
    }
    const first = bends[0];
    const second = bends[1];
    const t1 = Math.max(0.03, Math.min(0.97, first.t));
    const t2 = Math.max(0.03, Math.min(0.97, second.t));
    const inverse1 = 1 - t1;
    const inverse2 = 1 - t2;
    const a1 = 3 * inverse1 * inverse1 * t1;
    const b1 = 3 * inverse1 * t1 * t1;
    const a2 = 3 * inverse2 * inverse2 * t2;
    const b2 = 3 * inverse2 * t2 * t2;
    const determinant = a1 * b2 - a2 * b1;
    if (Math.abs(determinant) < 0.00001) return resolveCurveGeometry({ start, end, bends: [second] });
    const remainder = (bend, t, inverse) => ({
      x: bend.point.x - inverse * inverse * inverse * start.x - t * t * t * end.x,
      y: bend.point.y - inverse * inverse * inverse * start.y - t * t * t * end.y
    });
    const firstRemainder = remainder(first, t1, inverse1);
    const secondRemainder = remainder(second, t2, inverse2);
    return {
      kind: "cubic",
      start,
      end,
      control1: {
        x: (firstRemainder.x * b2 - secondRemainder.x * b1) / determinant,
        y: (firstRemainder.y * b2 - secondRemainder.y * b1) / determinant
      },
      control2: {
        x: (a1 * secondRemainder.x - a2 * firstRemainder.x) / determinant,
        y: (a1 * secondRemainder.y - a2 * firstRemainder.y) / determinant
      }
    };
  }

  /** Resolve a point along the currently edited line or curve. */
  function curvePointAt(curve, t) {
    const geometry = resolveCurveGeometry(curve);
    const inverse = 1 - t;
    if (geometry.kind === "line") {
      return { x: inverse * geometry.start.x + t * geometry.end.x, y: inverse * geometry.start.y + t * geometry.end.y };
    }
    if (geometry.kind === "quadratic") {
      return {
        x: inverse * inverse * geometry.start.x + 2 * inverse * t * geometry.control.x + t * t * geometry.end.x,
        y: inverse * inverse * geometry.start.y + 2 * inverse * t * geometry.control.y + t * t * geometry.end.y
      };
    }
    return {
      x: inverse * inverse * inverse * geometry.start.x + 3 * inverse * inverse * t * geometry.control1.x + 3 * inverse * t * t * geometry.control2.x + t * t * t * geometry.end.x,
      y: inverse * inverse * inverse * geometry.start.y + 3 * inverse * inverse * t * geometry.control1.y + 3 * inverse * t * t * geometry.control2.y + t * t * t * geometry.end.y
    };
  }

  /** Draw a straight, once-bent, or twice-bent Paint-style curve. */
  function drawCurve(context, curve, state) {
    if (!curve?.start || !curve?.end) return;
    const geometry = resolveCurveGeometry(curve);
    configureStroke(context, state, state.lineWidth);
    context.beginPath();
    context.moveTo(geometry.start.x, geometry.start.y);
    if (geometry.kind === "line") context.lineTo(geometry.end.x, geometry.end.y);
    else if (geometry.kind === "quadratic") context.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.end.x, geometry.end.y);
    else context.bezierCurveTo(geometry.control1.x, geometry.control1.y, geometry.control2.x, geometry.control2.y, geometry.end.x, geometry.end.y);
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
    } else if (tool === "triangle") {
      context.moveTo(x + width / 2, y);
      context.lineTo(x + width, y + height);
      context.lineTo(x, y + height);
      context.closePath();
    } else if (tool === "diamond") {
      context.moveTo(x + width / 2, y);
      context.lineTo(x + width, y + height / 2);
      context.lineTo(x + width / 2, y + height);
      context.lineTo(x, y + height / 2);
      context.closePath();
    } else if (tool === "star") {
      namespace.traceStar(context, start, end, state.starPoints);
    } else if (tool === "arrow") {
      namespace.traceArrow(context, start, end, state.arrowDirection, state.arrowHeadAngle);
    } else if (tool === "lightning") {
      namespace.traceLightning(context, start, end);
    }
    if (state.fillShapes && tool !== "line") context.fill();
    context.stroke();
  }

  /** Draw a rectangle whose four corners may use different radii. */
  function drawRoundedRectangle(context, rect, radii, state) {
    if (!rect?.width || !rect?.height) return;
    configureStroke(context, state, state.lineWidth);
    const maximum = Math.min(rect.width, rect.height) / 2;
    const radius = (corner) => Math.max(0, Math.min(maximum, Number(radii?.[corner] || 0)));
    const topLeft = radius("topLeft");
    const topRight = radius("topRight");
    const bottomRight = radius("bottomRight");
    const bottomLeft = radius("bottomLeft");
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    context.beginPath();
    context.moveTo(rect.x + topLeft, rect.y);
    context.lineTo(right - topRight, rect.y);
    context.quadraticCurveTo(right, rect.y, right, rect.y + topRight);
    context.lineTo(right, bottom - bottomRight);
    context.quadraticCurveTo(right, bottom, right - bottomRight, bottom);
    context.lineTo(rect.x + bottomLeft, bottom);
    context.quadraticCurveTo(rect.x, bottom, rect.x, bottom - bottomLeft);
    context.lineTo(rect.x, rect.y + topLeft);
    context.quadraticCurveTo(rect.x, rect.y, rect.x + topLeft, rect.y);
    context.closePath();
    if (state.fillShapes) context.fill();
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

  /** Convert a supported editor color to RGBA channel values. */
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

  function pixelsMatchFillTarget(data, index, color) {
    return Math.abs(data[index] - color[0]) <= FLOOD_FILL_COLOR_TOLERANCE &&
      Math.abs(data[index + 1] - color[1]) <= FLOOD_FILL_COLOR_TOLERANCE &&
      Math.abs(data[index + 2] - color[2]) <= FLOOD_FILL_COLOR_TOLERANCE &&
      Math.abs(data[index + 3] - color[3]) <= FLOOD_FILL_COLOR_TOLERANCE;
  }

  function setPixel(data, index, color) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }

  function colorDistanceSquared(data, index, color) {
    const red = data[index] - color[0];
    const green = data[index + 1] - color[1];
    const blue = data[index + 2] - color[2];
    return red * red + green * green + blue * blue;
  }

  function colorDirectionsAlign(data, firstIndex, secondIndex, targetColor) {
    let dotProduct = 0;
    let firstLength = 0;
    let secondLength = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const first = data[firstIndex + channel] - targetColor[channel];
      const second = data[secondIndex + channel] - targetColor[channel];
      dotProduct += first * second;
      firstLength += first * first;
      secondLength += second * second;
    }
    return firstLength > 0 && secondLength > 0 &&
      dotProduct / Math.sqrt(firstLength * secondLength) >= FLOOD_FILL_EDGE_DIRECTION_ALIGNMENT;
  }

  /** Replace only the source-background contribution in antialiased boundary pixels. */
  function recolorFloodFillEdge(original, data, filled, width, height, targetColor, fillColor) {
    const frontier = new Set();
    for (let pixelIndex = 0; pixelIndex < filled.length; pixelIndex += 1) {
      if (!filled[pixelIndex]) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) continue;
          const neighborIndex = neighborY * width + neighborX;
          if (!filled[neighborIndex]) frontier.add(neighborIndex);
        }
      }
    }
    frontier.forEach((pixelIndex) => {
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const index = pixelIndex * 4;
      const pixelDistance = colorDistanceSquared(original, index, targetColor);
      if (!pixelDistance) return;
      let referenceIndex = index;
      let referenceDistance = pixelDistance;
      for (let candidateY = Math.max(0, y - FLOOD_FILL_EDGE_SEARCH_RADIUS); candidateY <= Math.min(height - 1, y + FLOOD_FILL_EDGE_SEARCH_RADIUS); candidateY += 1) {
        for (let candidateX = Math.max(0, x - FLOOD_FILL_EDGE_SEARCH_RADIUS); candidateX <= Math.min(width - 1, x + FLOOD_FILL_EDGE_SEARCH_RADIUS); candidateX += 1) {
          const candidateIndex = (candidateY * width + candidateX) * 4;
          const candidateDistance = colorDistanceSquared(original, candidateIndex, targetColor);
          if (candidateDistance <= referenceDistance || !colorDirectionsAlign(original, index, candidateIndex, targetColor)) continue;
          referenceDistance = candidateDistance;
          referenceIndex = candidateIndex;
        }
      }
      if (referenceIndex === index || referenceDistance < pixelDistance * 1.1) return;
      const boundaryCoverage = Math.min(1, Math.sqrt(pixelDistance / referenceDistance));
      for (let channel = 0; channel < 4; channel += 1) {
        data[index + channel] = Math.round(original[index + channel] +
          (1 - boundaryCoverage) * (fillColor[channel] - targetColor[channel]));
      }
    });
  }

  function floodFill(context, point, state) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const startX = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const startY = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const original = new Uint8ClampedArray(data);
    const startIndex = (startY * width + startX) * 4;
    const targetColor = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
    const fillColor = colorToRgba(state.foregroundColor);
    if (targetColor.every((channel, index) => channel === fillColor[index])) return false;
    const stack = [[startX, startY]];
    const visited = new Uint8Array(width * height);
    const filled = new Uint8Array(width * height);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const pixelIndex = y * width + x;
      if (visited[pixelIndex]) continue;
      visited[pixelIndex] = 1;
      const index = pixelIndex * 4;
      if (!pixelsMatchFillTarget(original, index, targetColor)) continue;
      filled[pixelIndex] = 1;
      setPixel(data, index, fillColor);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    recolorFloodFillEdge(original, data, filled, width, height, targetColor, fillColor);
    context.putImageData(imageData, 0, 0);
    return true;
  }

  function splitWordToWidth(context, word, maxWidth) {
    if (!word || context.measureText(word).width <= maxWidth) return [word];
    const segments = [];
    let segment = "";
    Array.from(word).forEach((character) => {
      const candidate = segment + character;
      if (segment && context.measureText(candidate).width > maxWidth) {
        segments.push(segment);
        segment = character;
      } else {
        segment = candidate;
      }
    });
    if (segment) segments.push(segment);
    return segments;
  }

  function wrapText(context, text, maxWidth) {
    const output = [];
    String(text).split(/\r?\n/).forEach((sourceLine) => {
      const words = sourceLine.split(/\s+/);
      let line = "";
      words.forEach((word) => {
        splitWordToWidth(context, word, maxWidth).forEach((segment, index, segments) => {
          const candidate = line ? `${line}${index ? "" : " "}${segment}` : segment;
          if (line && context.measureText(candidate).width > maxWidth) {
            output.push(line);
            line = segment;
          } else {
            line = candidate;
          }
          if (index < segments.length - 1) {
            output.push(line);
            line = "";
          }
        });
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

  Object.assign(namespace, { configureStroke, drawFreehand, curvePointAt, drawCurve, drawShape, drawRoundedRectangle, drawPolygon, colorToRgba, floodFill, drawText });
})(typeof window !== "undefined" ? window : globalThis);
