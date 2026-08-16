// Non-destructive alpha, vector, and luminance mask compositing.
(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function canvas(width, height) {
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    return surface;
  }

  function convertMaskPixels(context, width, height, type) {
    if (type === "alpha") return;
    const image = context.getImageData(0, 0, width, height);
    for (let index = 0; index < image.data.length; index += 4) {
      const sourceAlpha = image.data[index + 3];
      image.data[index + 3] = type === "vector"
        ? (sourceAlpha > 0 ? 255 : 0)
        : Math.round(sourceAlpha * (0.2126 * image.data[index] + 0.7152 * image.data[index + 1] + 0.0722 * image.data[index + 2]) / 255);
    }
    context.putImageData(image, 0, 0);
  }

  /** Composite a mask group without changing its mask or content children. */
  function draw(context, group, options) {
    const descriptor = namespace.ImageEditorMaskModel.getDescriptor(group);
    const children = group.children || [];
    const maskIndex = children.findIndex((child) => child.id === descriptor?.maskId);
    if (!descriptor || maskIndex < 0) return false;
    const combined = canvas(options.width, options.height);
    const combinedContext = combined.getContext("2d");
    options.renderNodes(combinedContext, children.slice(maskIndex + 1));

    const content = canvas(options.width, options.height);
    const contentContext = content.getContext("2d");
    options.renderNodes(contentContext, children.slice(0, maskIndex));
    const matte = canvas(options.width, options.height);
    const matteContext = matte.getContext("2d");
    options.renderNodes(matteContext, [children[maskIndex]]);
    convertMaskPixels(matteContext, options.width, options.height, descriptor.type);
    contentContext.globalCompositeOperation = "destination-in";
    contentContext.drawImage(matte, 0, 0);
    combinedContext.drawImage(content, 0, 0);

    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(group.opacity ?? 1)));
    context.globalCompositeOperation = "source-over";
    context.drawImage(combined, 0, 0);
    context.restore();
    return true;
  }

  namespace.ImageEditorMaskRenderer = { draw };
})(typeof window !== "undefined" ? window : globalThis);
