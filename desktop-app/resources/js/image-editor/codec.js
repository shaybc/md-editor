// Raster decode and encode helpers for PNG, JPEG, and WebP image-editor files.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const FORMAT_BY_EXTENSION = Object.freeze({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp"
  });
  const PROJECT_FORMAT_BY_EXTENSION = Object.freeze({ mdimage: "application/vnd.md-editor.image+zip" });

  function extensionOf(value) {
    const match = String(value || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function mimeTypeForName(name) {
    const extension = extensionOf(name);
    return FORMAT_BY_EXTENSION[extension] || PROJECT_FORMAT_BY_EXTENSION[extension] || "";
  }

  function canEditSource(source = {}) {
    const mimeType = String(source.mimeType || source.type || source.file?.type || "").toLowerCase();
    return Object.values(FORMAT_BY_EXTENSION).includes(mimeType) || Object.values(PROJECT_FORMAT_BY_EXTENSION).includes(mimeType) || !!mimeTypeForName(source.name || source.path);
  }

  async function readSourceBytes(source, deps = {}) {
    if (source?.draftBytes) return new Uint8Array(source.draftBytes);
    if (typeof deps.NL_VERSION !== "undefined" && source?.path && deps.Neutralino?.filesystem?.readBinaryFile) {
      return new Uint8Array(await deps.Neutralino.filesystem.readBinaryFile(source.path));
    }
    const file = source?.file || (source?.handle?.getFile ? await source.handle.getFile() : null);
    if (!file?.arrayBuffer) throw new Error("The image source is not readable.");
    return new Uint8Array(await file.arrayBuffer());
  }

  async function decodeBytes(bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType || "image/png" });
    if (typeof global.createImageBitmap === "function") return global.createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The image could not be decoded."));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`Unable to encode ${mimeType}.`)), mimeType, quality);
    });
  }

  async function encodeCanvas(canvas, mimeType, backgroundColor) {
    if (!Object.values(FORMAT_BY_EXTENSION).includes(mimeType)) {
      throw new Error("Save As supports PNG, JPEG, and WebP files.");
    }
    let output = canvas;
    if (mimeType === "image/jpeg") {
      output = document.createElement("canvas");
      output.width = canvas.width;
      output.height = canvas.height;
      const context = output.getContext("2d", { alpha: false });
      context.fillStyle = backgroundColor || "#ffffff";
      context.fillRect(0, 0, output.width, output.height);
      context.drawImage(canvas, 0, 0);
    }
    return canvasToBlob(output, mimeType, mimeType === "image/png" ? undefined : 0.92);
  }

  async function blobToUint8Array(blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }

  Object.assign(namespace, {
    FORMAT_BY_EXTENSION,
    PROJECT_FORMAT_BY_EXTENSION,
    extensionOf,
    mimeTypeForName,
    canEditSource,
    readSourceBytes,
    decodeBytes,
    encodeCanvas,
    blobToUint8Array
  });
})(typeof window !== "undefined" ? window : globalThis);
