// Original MD-Editor vector iconography for image effects and adjustment tools.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const ICONS = Object.freeze({
    effects: '<path d="M5 7h8l3 3v8H5z"/><path d="M9 4v6M6 7h6M18 3l.8 2.2L21 6l-2.2.8L18 9l-.8-2.2L15 6l2.2-.8z"/>',
    "brightness-contrast": '<circle cx="12" cy="12" r="5"/><path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
    exposure: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M7 15 17 9M7 9h4v4M17 15h-4v-4"/>',
    vibrance: '<path d="M3 15c3-8 5 4 8-4s5 4 10-3"/><path d="M4 19h16"/><circle cx="6" cy="9" r="1" fill="currentColor" stroke="none"/>',
    "hue-saturation": '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 6.9 4M5.1 16A8 8 0 0 1 5 8M18.9 16A8 8 0 0 1 12 20"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
    "color-balance": '<path d="M12 4v15M7 20h10M5 8h14"/><path d="m5 8-3 6h6zm14 0-3 6h6z"/>',
    "black-white": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 20 20 4v16z" fill="currentColor" stroke="none"/>',
    "channel-mixer": '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="12" cy="17" r="3"/><path d="m9 9 2 5m4-5-2 5M10 7h4"/>',
    levels: '<path d="M3 20h18M4 17V9h3v8M9 17V5h3v12M14 17v-6h3v6M19 17V8h2v9"/>',
    curves: '<path d="M4 4v16h16"/><path d="M5 18c4 0 4-8 8-8s3-5 7-6"/><circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none"/>',
    "photo-filter": '<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="4"/><path d="M7 6 9 3h6l2 3M16 12a4 4 0 0 1-4 4"/>',
    invert: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/><path d="m5 6-2 2 2 2M19 18l2-2-2-2"/>',
    "selective-color": '<path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/><circle cx="12" cy="12" r="3"/><path d="M12 7v2M12 15v2M7 12h2M15 12h2"/>',
    "match-color": '<rect x="3" y="5" width="8" height="11" rx="2"/><rect x="13" y="8" width="8" height="11" rx="2"/><path d="m8 19 8-14M7 12h1M16 12h1"/>',
    "replace-color": '<path d="M5 7h11l-2-2M19 17H8l2 2"/><path d="M7 10c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6zm10-6c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6z"/>',
    compositing: '<path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4"/>',
    "raised-edge": '<path d="M4 4h16v16H4zM8 8h8v8H8z"/><path d="m4 4 4 4m12-4-4 4m4 12-4-4M4 20l4-4"/>',
    "cast-shadow": '<rect x="4" y="4" width="11" height="11" rx="2"/><path d="M9 16v3h10V9h-3"/><path d="M16 16h2v2h-2z" fill="currentColor" stroke="none"/>',
    "inset-shadow": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7 17V8a1 1 0 0 1 1-1h9M8 10h6"/>',
    "inner-aura": '<rect x="4" y="4" width="16" height="16" rx="4"/><rect x="8" y="8" width="8" height="8" rx="3"/><path d="M6 12h2M16 12h2M12 6v2M12 16v2"/>',
    "outer-aura": '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    "color-coat": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15h16v5H4z" fill="currentColor" stroke="none"/><path d="M12 7c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6z"/>',
    "gradient-coat": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 20 20 4v16z" fill="currentColor" stroke="none"/><path d="m7 16 9-9"/>',
    "pattern-coat": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/><path d="M9 9h6v6H9z" fill="currentColor" stroke="none"/>',
    grayscale: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/><path d="M8 8h8M8 12h8M8 16h8"/>',
    blur: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" opacity=".72"/><circle cx="12" cy="12" r="9" opacity=".38"/><path d="M4 5h3M17 19h3M19 5l-2 2M7 17l-2 2"/>',
    grain: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="16" r=".8" fill="currentColor" stroke="none"/>',
    newspaper: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="7" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="17" r="2.2" fill="currentColor" stroke="none"/>',
    "painted-texture": '<path d="M4 17c4-7 8-10 16-11-3 2-5 5-6 9-3-1-6 0-10 2z"/><path d="M5 19c4-2 8-3 13-2M8 14c2-2 5-4 8-5M10 17c2-2 4-3 7-4"/><circle cx="5" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
    "paint-edge": '<path d="M4 5c2 1 3-1 5 0s3-1 5 0 3-1 6 0v14c-2-1-3 1-5 0s-3 1-5 0-3 1-6 0V5Z"/><path d="M7 8c2 .8 3-.7 5 0s3-.8 5 0v8c-2-.8-3 .7-5 0s-3 .8-5 0V8Z"/><path d="M3 8h2M19 10h2M5 21v-2" opacity=".55"/>',
    collage: '<rect x="3" y="3" width="8" height="8" rx="1" transform="rotate(-5 7 7)"/><rect x="13" y="3" width="8" height="8" rx="1" transform="rotate(5 17 7)"/><rect x="3" y="13" width="8" height="8" rx="1" transform="rotate(4 7 17)"/><rect x="13" y="13" width="8" height="8" rx="1" transform="rotate(-4 17 17)"/><path d="m5 9 2-2 2 2m6 0 2-2 2 2m-14 10 2-2 2 2m6 0 2-2 2 2" opacity=".55"/>',
    dots: '<circle cx="6" cy="6" r="2.4" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="2.4" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="2.4" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="2.4" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="2.4" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r="2.4" fill="currentColor" stroke="none"/>',
    points: '<circle cx="6" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="13" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="8" r="2.8" fill="currentColor" stroke="none"/><circle cx="9" cy="14" r="2.3" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="3.4" fill="currentColor" stroke="none"/><circle cx="5" cy="19" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="2.5" fill="currentColor" stroke="none"/><circle cx="20" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
    watercolor: '<path d="M5 17c1-5 4-10 8-13 1 4 5 6 5 10 0 4-3 7-7 7-3 0-6-1-6-4Z"/><path d="M7 16c2-1 3-4 4-7m0 8c2-2 3-4 3-7" opacity=".55"/><circle cx="18.5" cy="6" r="1.5" fill="currentColor" stroke="none"/>',
    sunset: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 3v3M4.2 7.2l2.1 2.1M19.8 7.2l-2.1 2.1M2 12h3M19 12h3"/><path d="m5 21 3-2 4 2 4-2 3 2" opacity=".55"/>',
    "color-grid": '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="M4 4h4v4H4zm6 6h4v4h-4zm6 6h4v4h-4z" fill="currentColor" stroke="none" opacity=".45"/>',
    "vertical-panels": '<path d="m3 5 4-1v16l-4-1Zm7-2h4v18h-4Zm7 1 4 1-1 14-3 1Z"/><path d="M7 7h3M14 8h3M7 17h3M14 16h3" opacity=".5"/>',
    polaroids: '<rect x="3" y="5" width="11" height="13" rx="1" transform="rotate(-10 8.5 11.5)"/><rect x="10" y="4" width="11" height="14" rx="1" transform="rotate(9 15.5 11)"/><path d="m5.5 7.5 7-1.2m-6.2 8.2 7-1.2M12 7l7.5 1.2M11 15l7.5 1.2" opacity=".5"/>',
    miniature: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M4 8h16M4 16h16" opacity=".4"/><path d="m6 15 3-4 2 2 3-5 4 7"/><circle cx="16.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>',
    puzzle: '<path d="M4 4h6v3c-2-1-3 .2-3 1.5S8 11 10 10v4H7c1 2-.2 3-1.5 3S3 16 4 14V4Zm6 0h4v3c-1-2 .2-3 1.5-3S18 5 17 7h3v7h-3c1-2-.2-3-1.5-3S13 12 14 14h-4v-4c2 1 3-.2 3-1.5S12 6 10 7V4Zm0 10h4c-1 2 .2 3 1.5 3s2.5-1 1.5-3h3v6H10v-6Zm-6 0c-1 2 .2 3 1.5 3S8 16 7 14h3v6H4v-6Z"/>',
    texturize: '<path d="M3 5h18M3 9h18M3 13h18M3 17h18"/><path d="M9 4c4-2 8 1 8 5 0 2-1 3-2 4v4l-3 3-3-3v-4c-1-1-2-2-2-4 0-2 1-4 2-5Z" fill="currentColor" stroke="none" opacity=".35"/>',
    "retro-3d": '<path d="M9 5 4 12l5 7M15 5l5 7-5 7"/><path d="M11 7 7 12l4 5M13 7l4 5-4 5" opacity=".65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 4l3 3 3-3M9 20l3-3 3 3M4.7 10.2l4.1.8-1.4-3.9M19.3 13.8l-4.1-.8 1.4 3.9M19.3 10.2l-4.1.8 1.4-3.9M4.7 13.8l4.1-.8-1.4 3.9"/>',
    rain: '<path d="M6 4 3 10M12 2 8 10M18 4l-4 8M9 13l-4 8M15 13l-4 8M21 12l-4 8"/><path d="M4 8h3M10 7h3M16 9h3" opacity=".55"/>',
    rainbow: '<path d="M3 18a9 9 0 0 1 18 0M6 18a6 6 0 0 1 12 0M9 18a3 3 0 0 1 6 0"/><path d="M3 20h18" opacity=".45"/>',
    spotlight: '<path d="M9 3h6l1 4H8l1-4z"/><path d="m8 7-4 12h16L16 7"/><circle cx="12" cy="14" r="2.5" fill="currentColor" stroke="none"/><path d="M12 1v2M4.5 5.5 7 7M19.5 5.5 17 7" opacity=".55"/>',
    vignette: '<rect x="3" y="4" width="18" height="16" rx="3"/><ellipse cx="12" cy="12" rx="6" ry="5"/><path d="M3 8c3-2 5-3 9-3s7 1 9 3M3 16c3 2 5 3 9 3s7-1 9-3" opacity=".55"/>',
    posterize: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16" opacity=".6"/><path d="M4 4h5v5H4zM9 9h6v6H9zM15 15h5v5h-5z" fill="currentColor" stroke="none"/>',
    "contrast-bw": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M5 17c3 0 4-3 7-5s4-5 7-5"/><path d="M4 4h8v16H4z" fill="currentColor" stroke="none" opacity=".28"/>',
    monochromatic: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity=".32"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    "pencil-sketch": '<path d="m4 19 3.5-1 10-10-2.5-2.5-10 10L4 19Z"/><path d="m13.5 7 2.5 2.5M4 19l3.5-1-2.5-2.5L4 19Z" fill="currentColor"/><path d="M10 19h10M18 4l2 2"/>',
    "pic-in-pic": '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="9" y="8" width="9" height="8" rx="1" fill="currentColor" stroke="none"/><path d="m8 18 2-2 2 2 3-3 4 4" opacity=".55"/>',
    vortex: '<path d="M20 12a8 8 0 1 1-3-6.2C19 7.4 19.5 10 18 12c-1.2 1.7-3.8 2.3-5.4 1-1.3-1-1.2-3 .1-3.8 1-.6 2.3-.2 2.7.8"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    "ripple-field": '<path d="M3 7c3-4 5 4 8 0s5 4 10 0M3 12c3-4 5 4 8 0s5 4 10 0M3 17c3-4 5 4 8 0s5 4 10 0"/>',
    flare: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" opacity=".5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
    gust: '<path d="M3 7h11c2.5 0 2.5-4 0-4-1 0-1.8.5-2.2 1.3M3 12h15c3 0 3 5 0 5-1.2 0-2.1-.6-2.6-1.5M3 17h7"/>'
  });

  /** Render one MD-Editor-owned effect icon without relying on vendor glyphs. */
  function markup(name, className = "") {
    const body = ICONS[name] || ICONS.effects;
    return '<svg class="image-editor-effect-icon ' + className + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  namespace.ImageEditorEffectIcons = Object.freeze({ markup, names: Object.freeze(Object.keys(ICONS)) });
})(typeof window !== "undefined" ? window : globalThis);
