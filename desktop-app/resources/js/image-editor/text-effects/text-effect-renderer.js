// Canvas compositor for persisted text-object effect presets.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function canvas(width, height) {
    const element = document.createElement("canvas");
    element.width = Math.max(1, Math.ceil(width));
    element.height = Math.max(1, Math.ceil(height));
    return element;
  }

  function paddingFor(preset) {
    const outlines = [...(preset.outlineLayers || []), ...(preset.stroke ? [preset.stroke] : [])];
    const stroke = Math.max(0, ...outlines.map((outline) => Number(outline?.[1] || 0)));
    const glow = Number(preset.glow?.[1] || 0) * 1.6;
    const shadows = [...(preset.shadows || []), ...(preset.shadow ? [preset.shadow] : [])];
    const shadow = Math.max(0, ...shadows.map((item) => Number(item?.[1] || 0) * 1.6 + Math.max(Math.abs(item?.[2] || 0), Math.abs(item?.[3] || 0))));
    const extrusions = [...(preset.extrusions || []), ...(preset.extrusion ? [preset.extrusion] : [])];
    const extrusion = Math.max(0, ...extrusions.map((item) => Number(item?.[1] || 0) * Math.max(Math.abs(item?.[2] || 0), Math.abs(item?.[3] || 0))));
    return Math.min(48, Math.max(5, Math.ceil(Math.max(stroke, glow, shadow, extrusion)) + 3));
  }

  function pixelatedMask(mask, amount) {
    const scale = Math.max(2, Number(amount) || 2);
    const reduced = canvas(Math.max(1, Math.ceil(mask.width / scale)), Math.max(1, Math.ceil(mask.height / scale)));
    reduced.getContext("2d").drawImage(mask, 0, 0, reduced.width, reduced.height);
    const output = canvas(mask.width, mask.height);
    const context = output.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(reduced, 0, 0, output.width, output.height);
    return output;
  }

  function coloredMask(mask, color) {
    const output = canvas(mask.width, mask.height);
    const context = output.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, output.width, output.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    return output;
  }

  function gradientPaint(context, preset, width, height) {
    const colors = preset.fill || ["#ffffff"];
    if (colors.length === 1) return colors[0];
    const angle = (Number(preset.gradientAngle) || 135) * Math.PI / 180;
    const directionX = Math.sin(angle);
    const directionY = -Math.cos(angle);
    const extent = Math.abs(directionX) * width / 2 + Math.abs(directionY) * height / 2;
    const centerX = width / 2;
    const centerY = height / 2;
    const gradient = context.createLinearGradient(
      centerX - directionX * extent,
      centerY - directionY * extent,
      centerX + directionX * extent,
      centerY + directionY * extent
    );
    colors.forEach((color, index) => gradient.addColorStop(index / Math.max(1, colors.length - 1), color));
    return gradient;
  }

  function roundedRectangle(context, x, y, width, height, radius) {
    const corner = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + corner, y);
    context.lineTo(x + width - corner, y);
    context.quadraticCurveTo(x + width, y, x + width, y + corner);
    context.lineTo(x + width, y + height - corner);
    context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
    context.lineTo(x + corner, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - corner);
    context.lineTo(x, y + corner);
    context.quadraticCurveTo(x, y, x + corner, y);
    context.closePath();
  }

  function drawPresetBackground(context, preset, padding, width, height) {
    const background = preset.background;
    if (!background?.colors?.length) return;
    const inset = Math.max(0, Number(background.inset) || 0);
    const x = padding + inset;
    const y = padding + inset;
    const backgroundWidth = Math.max(1, width - inset * 2);
    const backgroundHeight = Math.max(1, height - inset * 2);
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, Number(background.opacity ?? 1)));
    context.fillStyle = gradientPaint(context, { fill: background.colors, gradientAngle: background.angle }, backgroundWidth, backgroundHeight);
    roundedRectangle(context, x, y, backgroundWidth, backgroundHeight, background.radius);
    context.fill();
    context.restore();
  }

  function texturePattern(context, kind) {
    if (!kind) return null;
    const tile = canvas(kind === "noise" ? 18 : 10, kind === "noise" ? 18 : 10);
    const paint = tile.getContext("2d");
    if (kind === "stripes" || kind === "scanlines") {
      paint.strokeStyle = kind === "scanlines" ? "rgba(0,0,0,.28)" : "rgba(255,255,255,.34)";
      paint.lineWidth = kind === "scanlines" ? 1 : 3;
      for (let offset = -10; offset < 20; offset += kind === "scanlines" ? 3 : 7) {
        paint.beginPath();
        if (kind === "scanlines") { paint.moveTo(0, offset); paint.lineTo(10, offset); }
        else { paint.moveTo(offset, 10); paint.lineTo(offset + 10, 0); }
        paint.stroke();
      }
    } else if (kind === "dots") {
      paint.fillStyle = "rgba(255,255,255,.42)";
      paint.beginPath(); paint.arc(2.5, 2.5, 1.3, 0, Math.PI * 2); paint.fill();
      paint.beginPath(); paint.arc(7.5, 7.5, 1.3, 0, Math.PI * 2); paint.fill();
    } else if (kind === "noise") {
      let seed = 173;
      for (let index = 0; index < 85; index += 1) {
        seed = (seed * 9301 + 49297) % 233280;
        const x = seed % tile.width;
        seed = (seed * 9301 + 49297) % 233280;
        const y = seed % tile.height;
        paint.fillStyle = index % 2 ? "rgba(255,255,255,.24)" : "rgba(0,0,0,.18)";
        paint.fillRect(x, y, 1, 1);
      }
    }
    return context.createPattern(tile, "repeat");
  }

  function filledMask(mask, preset) {
    const output = canvas(mask.width, mask.height);
    const context = output.getContext("2d");
    context.fillStyle = gradientPaint(context, preset, output.width, output.height);
    context.fillRect(0, 0, output.width, output.height);
    const texture = texturePattern(context, preset.texture);
    if (texture) {
      context.globalAlpha = .85;
      context.fillStyle = texture;
      context.fillRect(0, 0, output.width, output.height);
      context.globalAlpha = 1;
    }
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
    return output;
  }

  function drawShadow(context, mask, color, blur, x, y) {
    const tinted = coloredMask(mask, color);
    context.save();
    context.shadowColor = color;
    context.shadowBlur = Math.max(0, Number(blur) || 0);
    context.shadowOffsetX = Number(x) || 0;
    context.shadowOffsetY = Number(y) || 0;
    context.drawImage(tinted, 0, 0);
    context.restore();
  }

  function drawOutline(context, mask, color, width) {
    const radius = Math.max(0, Number(width) || 0);
    if (!radius) return;
    const tinted = coloredMask(mask, color);
    const steps = Math.max(12, Math.ceil(radius * 8));
    for (let index = 0; index < steps; index += 1) {
      const angle = index / steps * Math.PI * 2;
      context.drawImage(tinted, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }

  function erodedMask(mask, width) {
    const radius = Math.max(1, Number(width) || 1);
    const output = canvas(mask.width, mask.height);
    const context = output.getContext("2d");
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "destination-in";
    const steps = Math.max(12, Math.ceil(radius * 4));
    for (let index = 0; index < steps; index += 1) {
      const angle = index / steps * Math.PI * 2;
      context.drawImage(mask, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    return output;
  }

  function drawInnerGlow(context, mask, color, width, opacity) {
    const glow = coloredMask(mask, color);
    const glowContext = glow.getContext("2d");
    glowContext.globalCompositeOperation = "destination-out";
    glowContext.drawImage(erodedMask(mask, width), 0, 0);
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, Number(opacity ?? 1)));
    context.drawImage(glow, 0, 0);
    context.restore();
  }

  function renderCurve(options) {
    const width = Math.max(1, Math.ceil(Number(options.width) || 1));
    const height = Math.max(1, Math.ceil(Number(options.height) || 1));
    const descriptor = namespace.ImageEditorTextEffectCatalog.normalize(options.effect);
    const curve = Number(descriptor?.curve || 0) / 100;
    if (Math.abs(curve) < .001) {
      const output = canvas(width, height);
      namespace.drawText(output.getContext("2d"), { x: 0, y: 0, width, height, lineHeight: options.box?.lineHeight }, options.text || "", options.style || {});
      return { canvas: output, padding: 0 };
    }
    const style = namespace.normalizeImageEditorTextStyle(options.style || {});
    const measuring = canvas(width, height).getContext("2d");
    const formatted = namespace.formatImageEditorText(options.text || "", style).replace(/\r?\n/g, " ");
    const layout = namespace.createImageEditorTextLayout(measuring, { x: 0, y: 0, width, height, lineHeight: options.box?.lineHeight }, formatted, style);
    let glyphs = namespace.imageEditorTextGraphemes(formatted);
    if (style.textDirection === "rtl") glyphs = glyphs.reverse();
    const advances = glyphs.map((glyph, index) => measuring.measureText(glyph).width + (index < glyphs.length - 1 ? layout.letterSpacing : 0));
    const totalWidth = Math.max(1, advances.reduce((sum, advance) => sum + advance, 0));
    const maximumBend = Math.min(width * .42, Math.max(height * .65, layout.effectiveFontSize * 2.5));
    const bend = curve * maximumBend;
    const padding = Math.min(96, Math.max(6, Math.ceil(Math.abs(bend) + layout.effectiveFontSize * .45)));
    const output = canvas(width + padding * 2, height + padding * 2);
    const context = output.getContext("2d");
    namespace.createImageEditorTextLayout(context, { x: 0, y: 0, width, height }, formatted, style);
    context.fillStyle = namespace.imageEditorColorWithOpacity(style.foregroundColor, style.foregroundOpacity);
    context.strokeStyle = context.fillStyle;
    context.lineWidth = Math.max(1, layout.effectiveFontSize / 16);
    const pathWidth = Math.min(width, Math.max(totalWidth, width * .45));
    const scale = Math.min(1, pathWidth / totalWidth);
    const centerX = padding + width / 2;
    const baseline = padding + (height + layout.ascent) / 2;
    let cursor = 0;
    glyphs.forEach((glyph, index) => {
      const advance = advances[index] * scale;
      const progress = (cursor + advance / 2) / Math.max(1, totalWidth * scale);
      const normalizedX = progress * 2 - 1;
      const x = centerX + normalizedX * pathWidth / 2;
      const y = baseline + bend * (normalizedX * normalizedX - 1);
      const slope = pathWidth ? (4 * bend * normalizedX / pathWidth) : 0;
      context.save();
      context.translate(x, y);
      context.rotate(Math.atan(slope));
      context.scale(scale, scale);
      const glyphWidth = measuring.measureText(glyph).width;
      context.fillText(glyph, -glyphWidth / 2, 0);
      const drawDecoration = (lineY) => {
        context.beginPath();
        context.moveTo(-glyphWidth / 2, lineY);
        context.lineTo(glyphWidth / 2, lineY);
        context.stroke();
      };
      if (style.fontUnderline) drawDecoration(Math.max(1, layout.effectiveFontSize * .1));
      if (style.fontStrikethrough) drawDecoration(-layout.effectiveFontSize * .3);
      context.restore();
      cursor += advance;
    });
    return { canvas: output, padding };
  }

  function textEffectMask(options, effectPadding, width, height) {
    if (Number.isFinite(Number(options.effect?.curve))) {
      const curved = renderCurve({
        ...options,
        width,
        height,
        effect: { id: "curve", curve: Number(options.effect.curve) },
        style: { ...(options.style || {}), foregroundColor: "#ffffff", foregroundOpacity: 1 }
      });
      const padding = effectPadding + curved.padding;
      const surface = canvas(width + padding * 2, height + padding * 2);
      surface.getContext("2d").drawImage(curved.canvas, effectPadding, effectPadding);
      return { surface, padding };
    }
    const surface = canvas(width + effectPadding * 2, height + effectPadding * 2);
    const context = surface.getContext("2d");
    namespace.drawText(context, {
      x: effectPadding, y: effectPadding, width, height,
      lineHeight: options.box?.lineHeight
    }, options.text || "", { ...(options.style || {}), foregroundColor: "#ffffff" });
    return { surface, padding: effectPadding };
  }

  /**
   * Render one editable text object into a padded transparent effect surface.
   * @param {object} options - Text, bounds, formatting, and persisted effect descriptor.
   * @returns {{canvas:HTMLCanvasElement,padding:number}|null} Effect surface or null for an unknown preset.
   */
  function render(options) {
    const preset = namespace.ImageEditorTextEffectCatalog.get(options.effect?.id);
    if (!preset) return null;
    if (preset.kind === "curve") return renderCurve(options);
    const width = Math.max(1, Math.ceil(Number(options.width) || 1));
    const height = Math.max(1, Math.ceil(Number(options.height) || 1));
    const maskResult = textEffectMask(options, paddingFor(preset), width, height);
    const padding = maskResult.padding;
    const maskSurface = maskResult.surface;
    const mask = preset.pixelate ? pixelatedMask(maskSurface, preset.pixelate) : maskSurface;
    const output = canvas(mask.width, mask.height);
    const context = output.getContext("2d");

    drawPresetBackground(context, preset, padding, width, height);
    if (preset.glow) drawShadow(context, mask, preset.glow[0], preset.glow[1], 0, 0);
    [...(preset.shadows || []), ...(preset.shadow ? [preset.shadow] : [])]
      .forEach((shadow) => drawShadow(context, mask, ...shadow));
    [...(preset.extrusions || []), ...(preset.extrusion ? [preset.extrusion] : [])].forEach((extrusion) => {
      const [color, depth, x, y] = extrusion;
      const tinted = coloredMask(mask, color);
      for (let step = depth; step >= 1; step -= 1) context.drawImage(tinted, x * step, y * step);
    });
    if (preset.glitch) {
      context.drawImage(coloredMask(mask, "#00e5ff"), -3, 0);
      context.drawImage(coloredMask(mask, "#ff00bf"), 3, 0);
    }
    [...(preset.outlineLayers || [])]
      .sort((left, right) => Number(right?.[1] || 0) - Number(left?.[1] || 0))
      .forEach((outline) => drawOutline(context, mask, outline[0], outline[1]));
    if (preset.stroke) drawOutline(context, mask, preset.stroke[0], preset.stroke[1]);
    if (preset.highlight) context.drawImage(coloredMask(mask, preset.highlight), -1, -1);
    context.drawImage(filledMask(mask, preset), 0, 0);
    if (preset.innerGlow) drawInnerGlow(context, mask, ...preset.innerGlow);
    return { canvas: output, padding };
  }

  namespace.ImageEditorTextEffectRenderer = Object.freeze({ render, paddingFor });
})(typeof window !== "undefined" ? window : globalThis);
