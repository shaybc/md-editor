// Adobe Swatch Exchange 1.0 binary encoding and decoding for image-editor palettes.
(function(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorAseCodec = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const BLOCK_COLOR = 0x0001;
  const BLOCK_GROUP_START = 0xC001;
  const BLOCK_GROUP_END = 0xC002;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function rgbHex(red, green, blue) {
    return `#${[red, green, blue].map((value) => Math.round(clamp(value) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function cmykToRgb(cyan, magenta, yellow, black) {
    return [1 - Math.min(1, clamp(cyan) * (1 - clamp(black)) + clamp(black)), 1 - Math.min(1, clamp(magenta) * (1 - clamp(black)) + clamp(black)), 1 - Math.min(1, clamp(yellow) * (1 - clamp(black)) + clamp(black))];
  }

  function labToRgb(lightness, a, b) {
    const l = Number(lightness) <= 1 ? Number(lightness) * 100 : Number(lightness);
    const fy = (l + 16) / 116;
    const fx = fy + Number(a) / 500;
    const fz = fy - Number(b) / 200;
    const inverse = (value) => value ** 3 > 0.008856 ? value ** 3 : (116 * value - 16) / 903.3;
    const x50 = 0.96422 * inverse(fx);
    const y50 = 1 * inverse(fy);
    const z50 = 0.82521 * inverse(fz);
    const x = x50 * 0.9555766 + y50 * -0.0230393 + z50 * 0.0631636;
    const y = x50 * -0.0282895 + y50 * 1.0099416 + z50 * 0.0210077;
    const z = x50 * 0.0122982 + y50 * -0.020483 + z50 * 1.3299098;
    const linear = [x * 3.2404542 + y * -1.5371385 + z * -0.4985314, x * -0.969266 + y * 1.8760108 + z * 0.041556, x * 0.0556434 + y * -0.2040259 + z * 1.0572252];
    return linear.map((value) => clamp(value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
  }

  function readName(view, state, limit) {
    if (state.offset + 2 > limit) throw new Error("Truncated ASE name.");
    const length = view.getUint16(state.offset, false);
    state.offset += 2;
    if (!length || state.offset + length * 2 > limit) throw new Error("Invalid ASE name length.");
    let value = "";
    for (let index = 0; index < length; index += 1) {
      const code = view.getUint16(state.offset, false);
      state.offset += 2;
      if (code) value += String.fromCharCode(code);
    }
    return value;
  }

  function decodeColor(view, start, end) {
    const state = { offset: start };
    const name = readName(view, state, end);
    if (state.offset + 4 > end) throw new Error("Missing ASE color model.");
    const model = String.fromCharCode(view.getUint8(state.offset), view.getUint8(state.offset + 1), view.getUint8(state.offset + 2), view.getUint8(state.offset + 3));
    state.offset += 4;
    const componentCount = { "RGB ": 3, "CMYK": 4, "LAB ": 3, "Gray": 1 }[model];
    if (!componentCount) throw new Error(`Unsupported ASE color model ${model.trim() || "unknown"}.`);
    if (state.offset + componentCount * 4 + 2 > end) throw new Error("Truncated ASE color components.");
    const values = Array.from({ length: componentCount }, () => {
      const value = view.getFloat32(state.offset, false);
      state.offset += 4;
      return value;
    });
    let rgb;
    if (model === "RGB ") rgb = values.map((value) => clamp(value));
    else if (model === "CMYK") rgb = cmykToRgb(...values);
    else if (model === "LAB ") rgb = labToRgb(...values);
    else rgb = [clamp(values[0]), clamp(values[0]), clamp(values[0])];
    return { name, hex: rgbHex(...rgb), model: model.trim() };
  }

  function decode(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength < 12) throw new Error("The ASE file is truncated.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "ASEF") throw new Error("The file is not an Adobe ASE palette.");
    const major = view.getUint16(4, false);
    const minor = view.getUint16(6, false);
    if (major !== 1) throw new Error(`Unsupported ASE version ${major}.${minor}.`);
    const blockCount = view.getUint32(8, false);
    let offset = 12;
    const groups = [];
    const ungrouped = [];
    const warnings = [];
    const stack = [];
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (offset + 6 > bytes.byteLength) throw new Error("The ASE block table is truncated.");
      const type = view.getUint16(offset, false);
      const size = view.getUint32(offset + 2, false);
      const start = offset + 6;
      const end = start + size;
      if (end > bytes.byteLength) throw new Error("An ASE block extends beyond the file.");
      try {
        if (type === BLOCK_GROUP_START) {
          const group = { name: readName(view, { offset: start }, end) || "Imported palette", colors: [] };
          groups.push(group);
          stack.push(group);
        } else if (type === BLOCK_GROUP_END) {
          stack.pop();
        } else if (type === BLOCK_COLOR) {
          const color = decodeColor(view, start, end);
          const current = stack[stack.length - 1];
          (current ? current.colors : ungrouped).push(color);
        }
      } catch (error) {
        warnings.push(`Block ${blockIndex + 1}: ${error.message}`);
      }
      offset = end;
    }
    return { version: `${major}.${minor}`, groups: groups.filter((group) => group.colors.length), ungrouped, warnings };
  }

  function nameBytes(value) {
    const text = String(value || "");
    const bytes = new Uint8Array(2 + (text.length + 1) * 2);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, text.length + 1, false);
    for (let index = 0; index < text.length; index += 1) view.setUint16(2 + index * 2, text.charCodeAt(index), false);
    return bytes;
  }

  function block(type, payload) {
    const bytes = new Uint8Array(6 + payload.byteLength);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, type, false);
    view.setUint32(2, payload.byteLength, false);
    bytes.set(payload, 6);
    return bytes;
  }

  function colorBlock(name, hex) {
    const named = nameBytes(name);
    const payload = new Uint8Array(named.byteLength + 4 + 12 + 2);
    payload.set(named, 0);
    payload.set([82, 71, 66, 32], named.byteLength);
    const normalized = String(hex).replace("#", "");
    const view = new DataView(payload.buffer);
    [0, 2, 4].forEach((sourceOffset, index) => view.setFloat32(named.byteLength + 4 + index * 4, parseInt(normalized.slice(sourceOffset, sourceOffset + 2), 16) / 255, false));
    view.setUint16(payload.byteLength - 2, 2, false);
    return block(BLOCK_COLOR, payload);
  }

  function encode(palette) {
    const colors = (palette?.colors || []).filter((color) => /^#[0-9a-f]{6}$/i.test(color.hex || color));
    if (!colors.length) throw new Error("The palette has no colors to export.");
    const blocks = [block(BLOCK_GROUP_START, nameBytes(palette.name || "MD-Editor Palette"))];
    colors.forEach((color, index) => blocks.push(colorBlock(color.name || `Color ${index + 1}`, color.hex || color)));
    blocks.push(block(BLOCK_GROUP_END, new Uint8Array(0)));
    const total = 12 + blocks.reduce((sum, value) => sum + value.byteLength, 0);
    const bytes = new Uint8Array(total);
    bytes.set([65, 83, 69, 70], 0);
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 1, false);
    view.setUint16(6, 0, false);
    view.setUint32(8, blocks.length, false);
    let offset = 12;
    blocks.forEach((value) => { bytes.set(value, offset); offset += value.byteLength; });
    return bytes;
  }

  return Object.freeze({ decode, encode, cmykToRgb, labToRgb, rgbHex });
});
