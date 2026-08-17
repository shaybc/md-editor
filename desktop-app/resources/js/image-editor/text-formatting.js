// Shared formatting, layout, and rendering rules for editable image text.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TEXT_STYLE_KEYS = Object.freeze([
    "fontFamily", "fontSize", "fontBold", "fontItalic", "fontUnderline", "fontStrikethrough",
    "textCase", "textAlign", "textListStyle", "textDirection", "textLetterSpacing",
    "textLineSpacing", "textAnchor", "textPosition", "textKerning", "textLigatures",
    "foregroundColor", "foregroundOpacity"
  ]);

  function oneOf(value, values, fallback) {
    return values.includes(value) ? value : fallback;
  }

  /**
   * Normalize persisted and legacy text style values.
   * @param {object} style - Stored text style or current editor state.
   * @returns {object} Complete backward-compatible text style.
   */
  function normalizeImageEditorTextStyle(style = {}) {
    return {
      fontFamily: style.fontFamily || style.font || "Arial",
      fontSize: Math.max(8, Math.min(144, Number(style.fontSize || style.size || 24))),
      fontBold: style.fontBold === true || style.bold === true,
      fontItalic: style.fontItalic === true || style.italic === true,
      fontUnderline: style.fontUnderline === true,
      fontStrikethrough: style.fontStrikethrough === true,
      textCase: oneOf(style.textCase, ["normal", "lowercase", "uppercase"], "normal"),
      textAlign: oneOf(style.textAlign, ["left", "center", "right", "justify"], "left"),
      textListStyle: style.textListStyle === "bullet" ? "bullet" : "none",
      textDirection: style.textDirection === "rtl" ? "rtl" : "ltr",
      textLetterSpacing: Math.max(-5, Math.min(20, Number(style.textLetterSpacing) || 0)),
      textLineSpacing: Math.max(0.8, Math.min(3, Number(style.textLineSpacing) || 1.2)),
      textAnchor: oneOf(style.textAnchor, ["top", "middle", "bottom"], "top"),
      textPosition: oneOf(style.textPosition, ["normal", "superscript", "subscript"], "normal"),
      textKerning: style.textKerning === "none" ? "none" : "auto",
      textLigatures: style.textLigatures === "none" ? "none" : "normal",
      foregroundColor: style.foregroundColor || style.color || "#000000",
      foregroundOpacity: Math.max(0, Math.min(1, Number(style.foregroundOpacity ?? 1)))
    };
  }

  /** Return the persistent text-style subset from editor state. */
  function imageEditorTextStyleFromState(state) {
    const normalized = normalizeImageEditorTextStyle(state);
    return Object.fromEntries(TEXT_STYLE_KEYS.map((key) => [key, normalized[key]]));
  }

  /** Apply a stored text style to the current editor state. */
  function applyImageEditorTextStyleToState(state, style) {
    const normalized = normalizeImageEditorTextStyle(style);
    TEXT_STYLE_KEYS.forEach((key) => { state[key] = normalized[key]; });
    return normalized;
  }

  function imageEditorTextGraphemes(value) {
    if (global.Intl?.Segmenter) {
      return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(value))]
        .map((part) => part.segment);
    }
    return Array.from(String(value));
  }

  function transformTextCase(value, textCase) {
    if (textCase === "lowercase") return String(value).toLocaleLowerCase();
    if (textCase === "uppercase") return String(value).toLocaleUpperCase();
    return String(value);
  }

  /*
  /*
  function stripImageEditorBulletPrefixes(value) {
    return String(value).split(/\r?\n/).map((line) => line.replace(/^\s+�u���b\s?/, "")).join("\n");
  }

  function addImageEditorBulletPrefixes(value) {
    return stripImageEditorBulletPrefixes(value).split("\n").map((line) => b��y��y� ${line}`).join("\n");
  }

  */
  function stripImageEditorBulletPrefixes(value) {
    return String(value).split(/\r?\n/).map((line) => line.replace(/^\s*\u2022\s?/, "")).join("\n");
  }

  function addImageEditorBulletPrefixes(value) {
    return stripImageEditorBulletPrefixes(value).split("\n").map((line) => `\u2022 ${line}`).join("\n");
  }

  /*
  function stripImageEditorBulletPrefixes(value) {
    return String(value).split(/\r?\n/).map((line) => line.replace(/^\s*\u2022\s?/, "")).join("\n");
  }

  function addImageEditorBulletPrefixes(value) {
    return stripImageEditorBulletPrefixes(value).split("\n").map((line) => `\u2022 ${line}`).join("\n");
  }

  */
  /** Convert stored text into the visible text used by the editor and renderer. */
  function formatImageEditorText(value, style) {
    const normalized = normalizeImageEditorTextStyle(style);
    let text = transformTextCase(value, normalized.textCase);
    if (normalized.textListStyle === "bullet") text = addImageEditorBulletPrefixes(text);
    return text;
  }

  /** Convert the live textarea value back into semantic stored text. */
  function prepareImageEditorTextForStorage(value, style) {
    return normalizeImageEditorTextStyle(style).textListStyle === "bullet"
      ? stripImageEditorBulletPrefixes(value)
      : String(value);
  }

  function configureTextContext(context, style, fontSize) {
    const positionScale = style.textPosition === "normal" ? 1 : 0.65;
    const effectiveFontSize = fontSize * positionScale;
    context.font = `${style.fontItalic ? "italic " : ""}${style.fontBold ? "bold " : ""}${effectiveFontSize}px ${style.fontFamily}`;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    context.direction = style.textDirection;
    if ("fontKerning" in context) context.fontKerning = style.textKerning;
    if ("fontVariantLigatures" in context) context.fontVariantLigatures = style.textLigatures;
    return effectiveFontSize;
  }

  function measureRun(context, value, letterSpacing) {
    const graphemes = imageEditorTextGraphemes(value);
    if (!graphemes.length) return 0;
    return graphemes.reduce((width, glyph) => width + context.measureText(glyph).width, 0) +
      Math.max(0, graphemes.length - 1) * letterSpacing;
  }

  function splitToken(context, token, maximumWidth, letterSpacing) {
    const parts = [];
    let part = "";
    imageEditorTextGraphemes(token).forEach((glyph) => {
      const candidate = part + glyph;
      if (part && measureRun(context, candidate, letterSpacing) > maximumWidth) {
        parts.push(part);
        part = glyph;
      } else part = candidate;
    });
    if (part || !parts.length) parts.push(part);
    return parts;
  }

  function layoutParagraph(context, paragraph, maximumWidth, letterSpacing) {
    if (!paragraph) return [{ text: "", paragraphEnd: true }];
    const tokens = paragraph.match(/\S+\s*|\s+/g) || [paragraph];
    const lines = [];
    let line = "";
    tokens.forEach((token) => {
      const pieces = measureRun(context, token, letterSpacing) > maximumWidth
        ? splitToken(context, token, maximumWidth, letterSpacing)
        : [token];
      pieces.forEach((piece) => {
        const candidate = line + piece;
        if (line && measureRun(context, candidate.trimEnd(), letterSpacing) > maximumWidth) {
          lines.push({ text: line.trimEnd(), paragraphEnd: false });
          line = piece.trimStart();
        } else line = candidate;
      });
    });
    lines.push({ text: line.trimEnd(), paragraphEnd: true });
    return lines;
  }

  /**
   * Calculate formatted text lines and their shared vertical placement.
   * @param {CanvasRenderingContext2D} context - Destination canvas context.
   * @param {object} box - Text bounds in canvas pixels.
   * @param {string} text - Semantic stored text.
   * @param {object} sourceStyle - Text style or editor state.
   * @returns {object} Reusable layout for canvas rendering and outline conversion.
   */
  function createImageEditorTextLayout(context, box, text, sourceStyle) {
    const style = normalizeImageEditorTextStyle(sourceStyle);
    const fontSize = Number(box.fontSize) || style.fontSize;
    const effectiveFontSize = configureTextContext(context, style, fontSize);
    const width = Math.max(1, Number(box.width) || context.canvas.width - (Number(box.x) || 0));
    const height = Math.max(1, Number(box.height) || context.canvas.height - (Number(box.y) || 0));
    const letterSpacing = style.textLetterSpacing;
    const formatted = formatImageEditorText(text, style);
    const lines = formatted.split(/\r?\n/).flatMap((paragraph) => layoutParagraph(context, paragraph, width, letterSpacing));
    lines.forEach((line) => {
      line.width = measureRun(context, line.text, letterSpacing);
      const spaces = (line.text.match(/\s/g) || []).length;
      line.wordSpacing = style.textAlign === "justify" && !line.paragraphEnd && spaces
        ? Math.max(0, width - line.width) / spaces
        : 0;
    });
    const lineHeight = Number(box.lineHeight) || fontSize * style.textLineSpacing;
    const metrics = context.measureText("Mg");
    const ascent = metrics.actualBoundingBoxAscent || effectiveFontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent || effectiveFontSize * 0.2;
    const baselineOffset = Math.max(ascent, ((lineHeight - ascent - descent) / 2) + ascent);
    const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
    const freeHeight = Math.max(0, height - totalHeight);
    const anchorOffset = style.textAnchor === "middle" ? freeHeight / 2 : style.textAnchor === "bottom" ? freeHeight : 0;
    const positionOffset = style.textPosition === "superscript" ? -fontSize * 0.22 :
      style.textPosition === "subscript" ? fontSize * 0.2 : 0;
    const lineX = (line) => {
      if (style.textAlign === "center") return (width - line.width) / 2;
      if (style.textAlign === "right") return width - line.width;
      return 0;
    };
    return { style, width, height, fontSize, effectiveFontSize, letterSpacing, lineHeight, lines, ascent, baselineOffset, anchorOffset, positionOffset, lineX };
  }

  function drawTrackedRun(context, text, x, y, layout, extraWordSpacing = 0) {
    if (!layout.letterSpacing && !extraWordSpacing) {
      context.fillText(text, x, y);
      return;
    }
    const glyphs = imageEditorTextGraphemes(text);
    if (layout.style.textDirection === "rtl") {
      let cursor = x + measureRun(context, text, layout.letterSpacing) + (text.match(/\s/g) || []).length * extraWordSpacing;
      glyphs.forEach((glyph, index) => {
        const advance = context.measureText(glyph).width +
          (index < glyphs.length - 1 ? layout.letterSpacing : 0) +
          (/\s/.test(glyph) ? extraWordSpacing : 0);
        cursor -= advance;
        context.fillText(glyph, cursor, y);
      });
      return;
    }
    let cursor = x;
    glyphs.forEach((glyph, index) => {
      context.fillText(glyph, cursor, y);
      cursor += context.measureText(glyph).width +
        (index < glyphs.length - 1 ? layout.letterSpacing : 0) +
        (/\s/.test(glyph) ? extraWordSpacing : 0);
    });
  }

  /** Draw text with every image-editor typography option applied. */
  function drawFormattedImageEditorText(context, box, text, sourceStyle) {
    if (!String(text || "")) return;
    context.save();
    const layout = createImageEditorTextLayout(context, box, text, sourceStyle);
    const originX = Number(box.x) || 0;
    const originY = Number(box.y) || 0;
    context.beginPath();
    context.rect(originX, originY, layout.width, layout.height);
    context.clip();
    context.fillStyle = namespace.imageEditorColorWithOpacity(layout.style.foregroundColor, layout.style.foregroundOpacity);
    context.strokeStyle = context.fillStyle;
    context.lineWidth = Math.max(1, layout.effectiveFontSize / 16);
    layout.lines.forEach((line, index) => {
      const baselineY = originY + layout.anchorOffset + layout.baselineOffset + index * layout.lineHeight + layout.positionOffset;
      if (baselineY - layout.ascent >= originY + layout.height) return;
      const lineX = originX + layout.lineX(line);
      drawTrackedRun(context, line.text, lineX, baselineY, layout, line.wordSpacing);
      const renderedWidth = line.wordSpacing ? layout.width : line.width;
      if (layout.style.fontUnderline) {
        const y = baselineY + Math.max(1, layout.effectiveFontSize * 0.1);
        context.beginPath(); context.moveTo(lineX, y); context.lineTo(lineX + renderedWidth, y); context.stroke();
      }
      if (layout.style.fontStrikethrough) {
        const y = baselineY - layout.effectiveFontSize * 0.3;
        context.beginPath(); context.moveTo(lineX, y); context.lineTo(lineX + renderedWidth, y); context.stroke();
      }
    });
    context.restore();
  }

  /** Apply the current text formatting to the live editable textarea. */
  function applyImageEditorTextInputStyle(input, sourceStyle, scale = { x: 1, y: 1 }) {
    const style = normalizeImageEditorTextStyle(sourceStyle);
    input.style.font = `${style.fontItalic ? "italic " : ""}${style.fontBold ? "bold " : ""}${style.fontSize * scale.y}px ${style.fontFamily}`;
    input.style.color = namespace.imageEditorColorWithOpacity(style.foregroundColor, style.foregroundOpacity);
    input.style.textDecorationLine = [style.fontUnderline && "underline", style.fontStrikethrough && "line-through"].filter(Boolean).join(" ") || "none";
    input.style.textTransform = style.textCase === "normal" ? "none" : style.textCase;
    input.style.textAlign = style.textAlign;
    input.style.direction = style.textDirection;
    input.style.letterSpacing = `${style.textLetterSpacing * scale.x}px`;
    input.style.lineHeight = String(style.textLineSpacing);
    input.style.fontKerning = style.textKerning;
    input.style.fontVariantLigatures = style.textLigatures === "none" ? "none" : "common-ligatures";
    input.style.fontVariantPosition = style.textPosition === "normal" ? "normal" : style.textPosition === "superscript" ? "super" : "sub";
  }

  Object.assign(namespace, {
    IMAGE_EDITOR_TEXT_STYLE_KEYS: TEXT_STYLE_KEYS,
    normalizeImageEditorTextStyle,
    imageEditorTextStyleFromState,
    applyImageEditorTextStyleToState,
    imageEditorTextGraphemes,
    stripImageEditorBulletPrefixes,
    addImageEditorBulletPrefixes,
    formatImageEditorText,
    prepareImageEditorTextForStorage,
    createImageEditorTextLayout,
    drawFormattedImageEditorText,
    applyImageEditorTextInputStyle
  });
})(typeof window !== "undefined" ? window : globalThis);
