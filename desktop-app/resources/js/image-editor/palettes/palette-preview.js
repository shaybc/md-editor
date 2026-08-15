(function registerImageEditorPalettePreview(global) {
  "use strict";

  /** Render the constant twelve-region comparison scene for a palette. */
  function render(colors) {
    const values = Array.from({ length: 12 }, (_, index) => colors[index] || "#FFFFFF");
    return `<svg class="image-editor-palette-preview-scene" viewBox="0 0 480 250" role="img" aria-label="Palette preview illustration">
      <rect width="480" height="250" rx="18" fill="${values[0]}"/>
      <circle cx="104" cy="92" r="58" fill="${values[1]}"/>
      <path d="M52 196c28-68 75-75 108-12 34-48 76-37 98 12z" fill="${values[2]}"/>
      <path d="M310 38h112v158H310z" rx="12" fill="${values[3]}"/>
      <path d="M330 58h72v50h-72z" fill="${values[4]}"/>
      <circle cx="366" cy="152" r="28" fill="${values[5]}"/>
      <path d="M22 224h436v12H22z" fill="${values[6]}"/>
      <path d="M190 52l38 25-15 44-46-2-13-45z" fill="${values[7]}"/>
      <circle cx="229" cy="160" r="25" fill="${values[8]}"/>
      <path d="M262 119l28 77h-56z" fill="${values[9]}"/>
      <path d="M320 217c25-28 57-27 82 0z" fill="${values[10]}"/>
      <circle cx="438" cy="42" r="18" fill="${values[11]}"/>
    </svg>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPalettePreview = api;
})(typeof window !== "undefined" ? window : globalThis);
