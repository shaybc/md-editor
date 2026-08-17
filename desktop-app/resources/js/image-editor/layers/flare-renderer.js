// Canvas renderer for the non-destructive layer Flare effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const PROFILES = Object.freeze({
    zoom: { color: [255, 174, 135], radius: 0.24, ghosts: 6, rays: 12 },
    "prime-35": { color: [255, 218, 160], radius: 0.19, ghosts: 5, rays: 8 },
    "prime-105": { color: [160, 205, 255], radius: 0.15, ghosts: 4, rays: 6 },
    cinema: { color: [130, 190, 255], radius: 0.28, ghosts: 8, rays: 4, streak: true }
  });

  function rgba(color, alpha) {
    return `rgba(${color[0]},${color[1]},${color[2]},${Math.max(0, Math.min(1, alpha))})`;
  }

  function drawCore(context, x, y, radius, profile, intensity) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba([255, 255, 255], intensity));
    gradient.addColorStop(0.08, rgba(profile.color, intensity * 0.9));
    gradient.addColorStop(0.35, rgba(profile.color, intensity * 0.32));
    gradient.addColorStop(1, rgba(profile.color, 0));
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawRays(context, x, y, radius, profile, intensity) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = rgba(profile.color, intensity * 0.42);
    context.lineWidth = Math.max(1, radius * 0.012);
    for (let index = 0; index < profile.rays; index += 1) {
      const angle = index / profile.rays * Math.PI * 2;
      const length = radius * (index % 2 === 0 ? 1.8 : 1.15);
      context.beginPath();
      context.moveTo(Math.cos(angle) * radius * 0.05, Math.sin(angle) * radius * 0.05);
      context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
      context.stroke();
    }
    if (profile.streak) {
      context.strokeStyle = rgba([155, 215, 255], intensity * 0.5);
      context.lineWidth = Math.max(1, radius * 0.03);
      context.beginPath();
      context.moveTo(-radius * 2.4, 0);
      context.lineTo(radius * 2.4, 0);
      context.stroke();
    }
    context.restore();
  }

  function drawGhosts(context, x, y, centerX, centerY, radius, profile, intensity) {
    const colors = [[90, 220, 190], [120, 160, 255], [235, 100, 175], [255, 190, 90]];
    for (let index = 0; index < profile.ghosts; index += 1) {
      const progress = (index + 1) / (profile.ghosts + 1) * 1.75;
      const ghostX = x + (centerX - x) * progress;
      const ghostY = y + (centerY - y) * progress;
      const ghostRadius = radius * (0.08 + (index % 3) * 0.035);
      const color = colors[index % colors.length];
      const gradient = context.createRadialGradient(ghostX, ghostY, ghostRadius * 0.15, ghostX, ghostY, ghostRadius);
      gradient.addColorStop(0, rgba(color, intensity * 0.2));
      gradient.addColorStop(0.65, rgba(color, intensity * 0.08));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(ghostX, ghostY, ghostRadius, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * Return a copy of a rendered layer with an alpha-clipped optical flare.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Flare descriptor.
   * @returns {HTMLCanvasElement} Source or a flare-enhanced transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || Number(effect.brightness) <= 0) return source;
    const descriptor = namespace.ImageEditorFlareEffect.normalize(effect);
    const profile = PROFILES[descriptor.lensType] || PROFILES.zoom;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const flare = document.createElement("canvas");
    flare.width = source.width;
    flare.height = source.height;
    const flareContext = flare.getContext("2d");
    const x = descriptor.positionX * Math.max(0, source.width - 1);
    const y = descriptor.positionY * Math.max(0, source.height - 1);
    const intensity = Math.min(1, descriptor.brightness / 100);
    const radius = Math.max(12, Math.min(source.width, source.height) * profile.radius * (0.7 + Math.sqrt(descriptor.brightness / 100) * 0.3));
    drawGhosts(flareContext, x, y, source.width / 2, source.height / 2, radius, profile, intensity);
    drawRays(flareContext, x, y, radius, profile, intensity);
    drawCore(flareContext, x, y, radius, profile, intensity);
    flareContext.globalCompositeOperation = "destination-in";
    flareContext.drawImage(source, 0, 0);
    context.globalCompositeOperation = "source-atop";
    context.drawImage(flare, 0, 0);
    context.globalCompositeOperation = "source-over";
    return canvas;
  }

  namespace.ImageEditorFlareRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
