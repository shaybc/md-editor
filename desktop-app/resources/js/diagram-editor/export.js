(function(global) {
  "use strict";

  function dataUriToBlob(dataUri) {
    const match = String(dataUri || "").match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
    if (!match) throw new Error("The Diagram Editor returned an invalid image.");
    const isBase64 = String(dataUri).slice(0, String(dataUri).indexOf(",")).includes(";base64");
    const decoded = isBase64 ? atob(match[2]) : decodeURIComponent(match[2]);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return new Blob([bytes], { type: match[1] || "application/octet-stream" });
  }

  function loadImage(dataUri) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode the exported diagram page."));
      image.src = dataUri;
    });
  }

  async function chooseDestination(deps, title, defaultName, extension) {
    if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
      const path = await deps.Neutralino.os.showSaveDialog(title, { defaultPath: defaultName });
      if (!path) return null;
      return { path: String(path).toLowerCase().endsWith(extension) ? path : `${path}${extension}` };
    }
    return { name: defaultName };
  }

  async function writeBlob(deps, destination, blob) {
    if (destination.path) {
      await deps.Neutralino.filesystem.writeBinaryFile(destination.path, await blob.arrayBuffer());
      return;
    }
    deps.saveAs(blob, destination.name);
  }

  async function exportPng(controller, deps) {
    const name = `${deps.format.fileStem(controller.tab.sourceFileName || controller.tab.title)}.png`;
    const destination = await chooseDestination(deps, "Export Diagram as PNG", name, ".png");
    if (!destination) return false;
    const result = await controller.bridge.exportImage({ format: "png" });
    const dataUri = result.data || result.xml;
    await writeBlob(deps, destination, dataUriToBlob(dataUri));
    return true;
  }

  function createPdfPage(pdf, image, firstPage) {
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const orientation = width > height ? "landscape" : "portrait";
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const orientedWidth = orientation === "landscape" ? pageHeight : pageWidth;
    const orientedHeight = orientation === "landscape" ? pageWidth : pageHeight;
    if (!firstPage) pdf.addPage([orientedWidth, orientedHeight], orientation);
    const scale = Math.min(orientedWidth / width, orientedHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    return { x: (orientedWidth - drawWidth) / 2, y: (orientedHeight - drawHeight) / 2, width: drawWidth, height: drawHeight };
  }

  async function exportPdf(controller, deps) {
    if (!global.jspdf?.jsPDF) throw new Error("PDF export is unavailable because jsPDF did not load.");
    const name = `${deps.format.fileStem(controller.tab.sourceFileName || controller.tab.title)}.pdf`;
    const destination = await chooseDestination(deps, "Export Diagram as PDF", name, ".pdf");
    if (!destination) return false;
    const pageIds = deps.format.getDiagramPageIds(controller.bridge.getXml());
    let pdf = null;
    for (let index = 0; index < pageIds.length; index += 1) {
      const exportOptions = pageIds[index] ? { pageId: pageIds[index] } : {};
      const result = await controller.bridge.exportImage(exportOptions);
      const dataUri = result.data || result.xml;
      const image = await loadImage(dataUri);
      if (!pdf) {
        const orientation = image.naturalWidth > image.naturalHeight ? "landscape" : "portrait";
        pdf = new global.jspdf.jsPDF({ unit: "pt", format: "a4", orientation, compress: true });
      }
      const placement = createPdfPage(pdf, image, index === 0);
      pdf.addImage(dataUri, "PNG", placement.x, placement.y, placement.width, placement.height, undefined, "FAST");
    }
    const blob = pdf.output("blob");
    await writeBlob(deps, destination, blob);
    return true;
  }

  global.MarkdownViewerDiagramExport = { dataUriToBlob, exportPng, exportPdf };
})(typeof window !== "undefined" ? window : globalThis);
