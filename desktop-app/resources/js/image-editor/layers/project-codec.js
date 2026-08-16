// Native .mdimage ZIP encoding, decoding, and legacy raster migration.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PROJECT_MIME_TYPE = "application/vnd.md-editor.image+zip";

  function imageDataToBlob(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    return namespace.encodeCanvas(canvas, "image/png", "#ffffff");
  }

  async function bytesToImageData(bytes) {
    const bitmap = await namespace.decodeBytes(bytes, "image/png");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  }

  class ImageEditorProjectCodec {
    /** Encode and decode portable layered image projects. */
    constructor(JSZip = global.JSZip) {
      if (!JSZip) throw new Error("Layered image projects require JSZip.");
      this.JSZip = JSZip;
    }

    async encode(store, previewCanvas) {
      namespace.validateImageDocument(store.document);
      const zip = new this.JSZip();
      zip.file("manifest.json", JSON.stringify(store.document, null, 2));
      zip.file("metadata.json", JSON.stringify({ application: "MD-Editor", format: namespace.IMAGE_DOCUMENT_FORMAT, version: namespace.IMAGE_DOCUMENT_VERSION }, null, 2));
      for (const assetId of namespace.referencedAssetIds(store.document)) {
        const imageData = store.assets.get(assetId);
        if (!imageData) throw new Error(`The layered image is missing raster asset ${assetId}.`);
        zip.file(`assets/${assetId}.png`, await imageDataToBlob(imageData));
      }
      if (previewCanvas) zip.file("preview.png", await namespace.encodeCanvas(previewCanvas, "image/png", "#ffffff"));
      const archive = await zip.generateAsync({ type: "blob", mimeType: PROJECT_MIME_TYPE, compression: "DEFLATE", compressionOptions: { level: 6 } });
      return archive.type === PROJECT_MIME_TYPE ? archive : new Blob([archive], { type: PROJECT_MIME_TYPE });
    }

    async decode(bytes) {
      const zip = await this.JSZip.loadAsync(bytes);
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) throw new Error("The .mdimage project does not contain manifest.json.");
      const document = JSON.parse(await manifestEntry.async("string"));
      namespace.normalizeCanvasBackgroundLayer(document);
      namespace.ImageEditorDropShadowEffect?.normalizeDocument(document);
      namespace.validateImageDocument(document);
      const assets = new Map();
      for (const assetId of namespace.referencedAssetIds(document)) {
        const entry = zip.file(`assets/${assetId}.png`);
        if (!entry) throw new Error(`The .mdimage project is missing assets/${assetId}.png.`);
        assets.set(assetId, await bytesToImageData(await entry.async("uint8array")));
      }
      return { document, assets };
    }

    /** Convert a decoded raster image into a one-layer editable document. */
    fromRasterImageData(imageData, backgroundColor = "#ffffff") {
      const document = namespace.createImageDocument(imageData.width, imageData.height, backgroundColor);
      const store = new namespace.ImageEditorDocumentStore(document);
      store.addRasterObject(imageData, { x: 0, y: 0, width: imageData.width, height: imageData.height }, { name: "Background", layerId: document.activeLayerId });
      store.selectedIds = new Set([document.activeLayerId]);
      return { document: store.document, assets: store.assets };
    }
  }

  Object.assign(namespace, { IMAGE_PROJECT_MIME_TYPE: PROJECT_MIME_TYPE, ImageEditorProjectCodec });
})(typeof window !== "undefined" ? window : globalThis);
