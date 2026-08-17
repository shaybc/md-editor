// Shared tonal mountain-landscape preview for image-editor color palettes.
(function registerImageEditorPalettePreview(global) {
  "use strict";

  function normalizeHex(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color || ""));
    return match ? "#" + match[1].toUpperCase() : "#FFFFFF";
  }

  function blendHex(color, target, amount) {
    const source = Number.parseInt(normalizeHex(color).slice(1), 16);
    const destination = Number.parseInt(target.slice(1), 16);
    const channel = (shift) => Math.round(
      ((source >> shift) & 255) * (1 - amount) + ((destination >> shift) & 255) * amount
    ).toString(16).padStart(2, "0");
    return "#" + channel(16) + channel(8) + channel(0);
  }

  function lighter(color, amount) { return blendHex(color, "#FFFFFF", amount); }
  function darker(color, amount) { return blendHex(color, "#000000", amount); }

  /** Render a layered landscape that demonstrates every palette color across several tonal shades. */
  function render(colors) {
    const values = Array.from({ length: 12 }, (_, index) => normalizeHex(colors[index]));
    const light = values.map((color) => lighter(color, 0.34));
    const pale = values.map((color) => lighter(color, 0.62));
    const dark = values.map((color) => darker(color, 0.34));
    const deep = values.map((color) => darker(color, 0.58));

    return `<svg class="image-editor-palette-preview-scene" viewBox="0 0 640 420" role="img" aria-label="Layered mountain and lake palette preview">
      <defs>
        <linearGradient id="palette-preview-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${light[0]}"/>
          <stop offset=".55" stop-color="${pale[1]}"/>
          <stop offset="1" stop-color="${light[2]}"/>
        </linearGradient>
        <radialGradient id="palette-preview-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="${pale[2]}" stop-opacity="1"/>
          <stop offset=".36" stop-color="${values[2]}" stop-opacity=".88"/>
          <stop offset="1" stop-color="${values[2]}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="palette-preview-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${light[6]}"/>
          <stop offset=".52" stop-color="${values[6]}"/>
          <stop offset="1" stop-color="${dark[6]}"/>
        </linearGradient>
      </defs>

      <rect width="640" height="420" fill="url(#palette-preview-sky)"/>
      <circle cx="220" cy="122" r="72" fill="url(#palette-preview-sun)"/>
      <circle cx="220" cy="122" r="19" fill="${pale[2]}"/>

      <path d="M0 203l71-64 37 31 70-77 42 29 47-67 74 76 45-31 67 82 52-43 65 69 70-31v81H0z" fill="${pale[3]}"/>
      <path d="M101 170l77-77 42 29 47-67 36 37-37-20-45 70-43-25-46 66z" fill="${light[3]}"/>
      <path d="M0 221l75-44 55 28 76-55 65 57 68-36 69 48 70-54 63 56 79-28v67H0z" fill="${light[4]}"/>
      <path d="M0 240c59-31 114-38 165-19 43 16 84 18 124 5 58-18 114-13 169 17 49 26 110 25 182-4v47H0z" fill="${values[5]}"/>

      <path d="M0 213l13-19 13 19h-8l13 21H18v30H8v-30H-5l13-21zm42 8 11-17 11 17h-7l12 19H58v28h-9v-28H38l11-19zm77-4 10-15 10 15h-6l10 17h-10v25h-8v-25h-10l10-17zm279 4 11-17 11 17h-7l12 19h-11v26h-9v-26h-11l12-19zm55-8 13-20 13 20h-8l14 22h-14v31h-10v-31h-14l14-22zm69 4 11-17 11 17h-7l12 19h-11v28h-9v-28h-11l12-19z" fill="${dark[10]}"/>
      <path d="M0 249c72-21 132-17 180 12 47 28 98 31 153 8 67-28 127-23 181 14 38 26 80 28 126 8v129H0z" fill="url(#palette-preview-lake)"/>

      <path d="M164 271c46-8 91-7 136 3-45 8-89 10-132 6zm76 27c63-9 126-7 188 5-63 7-124 8-184 2zm-115 36c62-8 123-5 184 8-64 8-126 7-186-2zm226 34c52-8 105-6 159 5-55 8-108 8-159 2z" fill="${pale[7]}" opacity=".78"/>
      <path d="M186 286c27-5 54-5 82 0-27 6-54 7-82 2zm85 31c38-6 76-5 115 2-39 5-77 5-115 1zm-94 56c54-8 108-6 163 4-57 7-111 7-163 1z" fill="${light[7]}" opacity=".9"/>
      <path d="M202 143l9 119h18l10-119-19-20z" fill="${values[2]}" opacity=".18"/>

      <path d="M0 251c35 2 67 18 96 49 25 26 59 40 102 43-29 17-57 42-85 77H0z" fill="${dark[8]}"/>
      <path d="M0 284c38 0 69 14 93 42 22 26 49 42 82 48-21 12-43 27-64 46H0z" fill="${deep[8]}"/>
      <path d="M640 241c-46 3-83 20-112 50-25 26-57 43-96 50 33 19 65 45 97 79h111z" fill="${dark[9]}"/>
      <path d="M640 286c-38 0-69 14-94 42-22 25-48 40-79 47 21 11 43 26 65 45h108z" fill="${deep[9]}"/>

      <path d="M0 0h50L29 72h15L18 141h18L7 226h25L0 294zM63 23l-18 60h13l-24 63h17l-27 76h22v72h14v-72h22l-27-76h17L68 83h13z" fill="${deep[10]}"/>
      <path d="M640 53h-30l17 51h-12l21 55h-15l19 54zm-42 33-17 54h12l-22 59h16l-24 69h20v63h13v-63h20l-24-69h16l-22-59h12z" fill="${dark[10]}"/>
      <path d="M0 403c74-17 144-20 210-8 70 13 142 12 217-4 69-15 140-14 213 3v26H0z" fill="${deep[11]}"/>
      <path d="M53 391c57-11 110-10 160 2-53 5-103 12-151 23zm347 2c54-10 106-8 158 4-53 5-104 11-151 19z" fill="${dark[11]}"/>
    </svg>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPalettePreview = api;
})(typeof window !== "undefined" ? window : globalThis);
