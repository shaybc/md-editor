(function registerImageEditorPalettePreview(global) {
  "use strict";

  /** Render the constant twelve-region mountain landscape used to compare palettes. */
  function render(colors) {
    const values = Array.from({ length: 12 }, (_, index) => colors[index] || "#FFFFFF");
    return `<svg class="image-editor-palette-preview-scene" viewBox="0 0 640 360" role="img" aria-label="Mountain landscape palette preview">
      <defs>
        <linearGradient id="palette-preview-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${values[0]}"/>
          <stop offset="1" stop-color="${values[1]}"/>
        </linearGradient>
        <radialGradient id="palette-preview-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="${values[2]}" stop-opacity="1"/>
          <stop offset="1" stop-color="${values[2]}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#palette-preview-sky)"/>
      <circle cx="236" cy="120" r="52" fill="url(#palette-preview-sun)"/>
      <circle cx="236" cy="120" r="20" fill="${values[2]}"/>
      <path d="M0 187L72 98l42 47 89-83 69 71 62-43 91 86 54-54 89 65z" fill="${values[3]}"/>
      <path d="M0 214l80-57 72 30 82-52 69 55 81-32 68 43 83-62 105 80z" fill="${values[4]}"/>
      <path d="M0 224c74-26 126-25 190 4 68 31 126 26 190-9 76-42 164-32 260 16v59H0z" fill="${values[5]}"/>
      <path d="M0 254c88-41 162-36 231 13 45 32 101 36 161 12 83-33 166-26 248 21v60H0z" fill="${values[6]}"/>
      <path d="M0 295c82-30 150-29 218 5-66 2-120 12-164 32 90-5 171 2 244 28H0z" fill="${values[7]}"/>
      <path d="M640 230c-55-4-103 11-144 45-40 34-83 50-128 48 70 18 139 30 207 37h65z" fill="${values[8]}"/>
      <path d="M0 0h70l-28 73h18l-38 80h22L0 232zM73 37l-23 67h16l-30 75h21v83h17V175h22l-29-71h16z" fill="${values[9]}"/>
      <path d="M73 168c50-31 94-31 134 1l-7 31c-42-25-83-24-123 3z" fill="${values[10]}"/>
      <path d="M143 286c72-15 138-7 198 22-56-8-108-4-155 12 76-2 142 8 198 30H102c24-21 38-42 41-64z" fill="${values[11]}"/>
    </svg>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPalettePreview = api;
})(typeof window !== "undefined" ? window : globalThis);
