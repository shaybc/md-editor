// Transaction-ready mutations for text-object visual effects.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function applyPresetTypography(object, preset) {
    if (!preset.typography) return false;
    const payload = object.payload || {};
    const currentStyle = namespace.normalizeImageEditorTextStyle(payload.style || {});
    const nextStyle = namespace.normalizeImageEditorTextStyle({
      ...currentStyle,
      ...preset.typography,
      foregroundColor: preset.fill?.[0] || currentStyle.foregroundColor
    });
    const transform = { ...(object.transform || {}) };
    const nextRotation = Number(preset.typography.rotationDegrees || 0) * Math.PI / 180;
    const styleChanged = JSON.stringify(nextStyle) !== JSON.stringify(currentStyle);
    const rotationChanged = Math.abs((Number(transform.rotation) || 0) - nextRotation) > .000001;
    if (!styleChanged && !rotationChanged) return false;

    const bounds = { ...(object.bounds || {}) };
    const currentSize = Math.max(8, Number(currentStyle.fontSize) || 24);
    const sizeRatio = Math.max(.25, Math.min(4, nextStyle.fontSize / currentSize));
    if (Math.abs(sizeRatio - 1) > .000001) {
      const oldWidth = Math.max(1, Number(bounds.width) || 1);
      const oldHeight = Math.max(1, Number(bounds.height) || 1);
      const newWidth = Math.max(1, oldWidth * sizeRatio);
      const newHeight = Math.max(1, oldHeight * sizeRatio);
      const oldX = Number(transform.x ?? bounds.x) || 0;
      const oldY = Number(transform.y ?? bounds.y) || 0;
      transform.x = oldX - (newWidth - oldWidth) / 2;
      transform.y = oldY - (newHeight - oldHeight) / 2;
      bounds.x = transform.x;
      bounds.y = transform.y;
      bounds.width = newWidth;
      bounds.height = newHeight;
    }
    transform.rotation = nextRotation;
    object.bounds = bounds;
    object.transform = transform;
    object.payload = {
      ...payload,
      style: nextStyle,
      box: { ...(payload.box || {}), lineHeight: nextStyle.fontSize * nextStyle.textLineSpacing }
    };
    return true;
  }

  /**
   * Apply one registered preset to an exact editable text object.
   * @param {ImageEditorDocumentStore} store - Layered document store owning the object.
   * @param {string} objectId - Selected text-object identifier, never a parent layer ID.
   * @param {string} effectId - Registered preset identifier.
   * @returns {boolean} Whether the object changed.
   */
  function apply(store, objectId, effectId) {
    const target = namespace.findDocumentObject(store.document, objectId);
    const preset = namespace.ImageEditorTextEffectCatalog.get(effectId);
    if (!target || target.object?.type !== "text" || target.locked || !preset) return false;
    const effectChanged = target.object.payload?.textEffect?.id !== preset.id;
    const typographyChanged = applyPresetTypography(target.object, preset);
    if (!effectChanged && !typographyChanged) return false;
    target.object.payload = { ...(target.object.payload || {}), textEffect: namespace.ImageEditorTextEffectCatalog.descriptor(preset.id) };
    store.notify({ type: "update-text-effect", ids: [target.object.id] });
    return true;
  }

  /** Update settings for the effect already assigned to an editable text object. */
  function update(store, objectId, patch, options = {}) {
    const target = namespace.findDocumentObject(store.document, objectId);
    if (!target || target.object?.type !== "text" || target.locked) return false;
    const current = target.object.payload?.textEffect;
    const next = namespace.ImageEditorTextEffectCatalog.normalize({ ...(current || {}), ...(patch || {}) });
    if (!next || JSON.stringify(next) === JSON.stringify(current)) return false;
    target.object.payload = { ...(target.object.payload || {}), textEffect: next };
    if (options.notify !== false) store.notify({ type: "update-text-effect", ids: [target.object.id] });
    return true;
  }

  namespace.ImageEditorTextEffectActions = Object.freeze({ apply, update });
})(typeof window !== "undefined" ? window : globalThis);
