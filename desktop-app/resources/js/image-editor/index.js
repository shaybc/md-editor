// Managed-tab orchestration for the built-in raster image editor.
(function(global) {
  "use strict";

  global.registerMarkdownViewerImageEditor = function registerMarkdownViewerImageEditor(app, deps) {
    const namespace = global.MarkdownViewerImageEditor;
    const rotationCursorSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10a7 7 0 0 1 12-4l2-2v6h-6l2-2a5 5 0 0 0-8 3"/><path d="M19 14a7 7 0 0 1-12 4l-2 2v-6h6l-2 2a5 5 0 0 0 8-3"/></g></svg>';
    const rotationCursor = `url("data:image/svg+xml,${encodeURIComponent(rotationCursorSvg)}") 12 12, grab`;
    const views = new Map();

    function snapshot(view) {
      return view.context.getImageData(0, 0, view.canvas.width, view.canvas.height);
    }

    function restoreSnapshot(controller, imageData) {
      if (!imageData) return false;
      const { view, state } = controller;
      const restored = imageData instanceof ImageData
        ? imageData
        : new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      if (view.canvas.width !== restored.width || view.canvas.height !== restored.height) view.setDimensions(restored.width, restored.height);
      view.context.putImageData(restored, 0, 0);
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      state.width = restored.width;
      state.height = restored.height;
      view.setZoom(state.zoom);
      return true;
    }
    function normalizeCanvasDimensions(width, height) {
      return {
        width: Math.max(16, Math.round(width)),
        height: Math.max(16, Math.round(height))
      };
    }

    function resizeCanvas(controller, width, height) {
      const { view, state } = controller;
      const { width: nextWidth, height: nextHeight } = normalizeCanvasDimensions(width, height);
      if (nextWidth === view.canvas.width && nextHeight === view.canvas.height) return false;
      const previous = document.createElement("canvas");
      previous.width = view.canvas.width;
      previous.height = view.canvas.height;
      previous.getContext("2d").drawImage(view.canvas, 0, 0);
      view.setDimensions(nextWidth, nextHeight);
      view.context.fillStyle = state.backgroundColor || "#ffffff";
      view.context.fillRect(0, 0, nextWidth, nextHeight);
      view.context.drawImage(previous, 0, 0);
      state.width = nextWidth;
      state.height = nextHeight;
      view.setZoom(state.zoom);
      return true;
    }

    function syncTab(controller) {
      const { tab, state, history, selection, view } = controller;
      tab.imageEditorDirty = state.isDirty;
      tab.imageEditorState = {
        tool: state.tool,
        foregroundColor: state.foregroundColor,
        backgroundColor: state.backgroundColor,
        brushSize: state.brushSize,
        lineWidth: state.lineWidth,
        fillShapes: state.fillShapes,
        starPoints: state.starPoints,
        arrowDirection: state.arrowDirection,
        arrowHeadAngle: state.arrowHeadAngle,
        cornerRadius: state.cornerRadius,
        adjustAllCorners: state.adjustAllCorners,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        fontBold: state.fontBold,
        fontItalic: state.fontItalic,
        zoom: state.zoom
      };
      tab.imageEditorSource = {
        ...(tab.imageEditorSource || {}),
        mimeType: state.mimeType,
        width: state.width,
        height: state.height
      };
      view.update(state, state.getCommandState(history, selection));
      deps.onImageEditorStateChanged?.(tab);
    }

    function commitTransaction(controller, before) {
      const after = snapshot(controller.view);
      if (!controller.history.push(before, after)) return false;
      controller.state.markChanged();
      syncTab(controller);
      return true;
    }

    function drawSelectionOverlay(controller) {
      const { view, selection, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      if (!selection.hasSelection) return;
      if (selection.floating && selection.imageData) {
        selection.drawFloatingLayer(view.overlayContext);
      }
      view.overlayContext.save();
      view.overlayContext.setLineDash([5, 4]);
      view.overlayContext.lineWidth = 1;
      view.overlayContext.strokeStyle = "#ffffff";
      selection.strokeOutline(view.overlayContext);
      view.overlayContext.lineDashOffset = 4;
      view.overlayContext.strokeStyle = "#111111";
      selection.strokeOutline(view.overlayContext);
      view.overlayContext.restore();
      const zoom = Math.max(0.25, Number(state.zoom) || 1);
      const guideSize = 6 / zoom;
      const halfGuide = guideSize / 2;
      view.overlayContext.save();
      view.overlayContext.fillStyle = "#ffffff";
      view.overlayContext.strokeStyle = "#1473e6";
      view.overlayContext.lineWidth = 1 / zoom;
      Object.values(selection.resizeGuidePoints(guideSize / 2 + 1 / zoom)).forEach((point) => {
        view.overlayContext.fillRect(point.x - halfGuide, point.y - halfGuide, guideSize, guideSize);
        view.overlayContext.strokeRect(point.x - halfGuide, point.y - halfGuide, guideSize, guideSize);
      });
      view.overlayContext.restore();
    }

    function commitSelection(controller) {
      if (!controller.selection.floating) return false;
      const preservesSavedPixels = controller.selection.matchesSavedFloatingLayer();
      const before = controller.selectionBefore || snapshot(controller.view);
      controller.selection.commit(controller.view.context);
      controller.selectionBefore = null;
      drawSelectionOverlay(controller);
      const changed = commitTransaction(controller, before);
      if (preservesSavedPixels) {
        controller.state.markSaved();
        controller.history.markSaved?.();
        controller.tab.imageEditorDirty = false;
        syncTab(controller);
      }
      return changed;
    }

    function renderCurvePreview(controller) {
      const { view, curveTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      curveTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableCurve(controller) {
      controller.curveTool.reset();
      controller.curveBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function floatGeneratedLayer(controller, layer, before, origin = "shape") {
      if (!layer) return false;
      controller.selectionBefore = before || snapshot(controller.view);
      controller.selection.setFloatingLayer(layer.imageData, layer.rect, origin, controller.state.tool);
      controller.state.setTool("select");
      controller.state.setDirty(true);
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }

    function finishEditableCurve(controller) {
      const { curveTool, state } = controller;
      if (!curveTool.isEditing) return false;
      const layer = curveTool.rasterize(state, state);
      if (!layer) {
        cancelEditableCurve(controller);
        return false;
      }
      const before = controller.curveBefore;
      curveTool.reset();
      controller.curveBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before, "curve");
    }

    function renderRoundedRectanglePreview(controller) {
      const { view, roundedRectangleTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      roundedRectangleTool.drawPreview(view.overlayContext, state);
    }

    function updateRoundedRectangleRadiusControl(controller) {
      const model = controller.roundedRectangleTool.model;
      if (!model) return;
      const corner = controller.roundedRectangleTool.activeCorner;
      controller.state.cornerRadius = model.radii[corner];
      controller.view.shell.querySelector(".image-editor-corner-radius").value = String(controller.state.cornerRadius);
    }

    function cancelEditableRoundedRectangle(controller) {
      controller.roundedRectangleTool.reset();
      controller.roundedRectangleBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableRoundedRectangle(controller) {
      const { roundedRectangleTool, state, view } = controller;
      const model = roundedRectangleTool.model;
      if (!roundedRectangleTool.isEditing || !model?.rect.width || !model?.rect.height) {
        cancelEditableRoundedRectangle(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = namespace.rasterizeRoundedRectangleLayer(model, state, state);
      const before = controller.roundedRectangleBefore;
      roundedRectangleTool.reset();
      controller.roundedRectangleBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderHeartPreview(controller) {
      const { view, heartTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      heartTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableHeart(controller) {
      controller.heartTool.reset();
      controller.heartBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableHeart(controller) {
      const { heartTool, state, view } = controller;
      if (!heartTool.isEditing || !heartTool.model) {
        cancelEditableHeart(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = heartTool.rasterize(state, state);
      const before = controller.heartBefore;
      heartTool.reset();
      controller.heartBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderTrianglePreview(controller) {
      const { view, triangleTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      triangleTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableTriangle(controller) {
      controller.triangleTool.reset();
      controller.triangleBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableTriangle(controller) {
      const { triangleTool, state, view } = controller;
      if (!triangleTool.isEditing || !triangleTool.model) {
        cancelEditableTriangle(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = triangleTool.rasterize(state, state);
      const before = controller.triangleBefore;
      triangleTool.reset();
      controller.triangleBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderEllipsePreview(controller) {
      const { view, ellipseTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      ellipseTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableEllipse(controller) {
      controller.ellipseTool.reset();
      controller.ellipseBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableEllipse(controller) {
      const { ellipseTool, state, view } = controller;
      if (!ellipseTool.isEditing || !ellipseTool.model) {
        cancelEditableEllipse(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = ellipseTool.rasterize(state, state);
      const before = controller.ellipseBefore;
      ellipseTool.reset();
      controller.ellipseBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderArcPreview(controller) {
      const { view, arcTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      arcTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableArc(controller) {
      controller.arcTool.reset();
      controller.arcBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableArc(controller) {
      const { arcTool, state, view } = controller;
      if (!arcTool.isEditing || !arcTool.model) {
        cancelEditableArc(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = arcTool.rasterize(state, state);
      const before = controller.arcBefore;
      arcTool.reset();
      controller.arcBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function isCalloutTool(tool) {
      return tool === "callout" || tool === "oval-callout" || tool === "cloud-callout";
    }

    function calloutToolFor(controller, tool = controller.state.tool) {
      if (tool === "oval-callout") return controller.ovalCalloutTool;
      if (tool === "cloud-callout") return controller.cloudCalloutTool;
      return controller.calloutTool;
    }

    function editingCalloutTool(controller) {
      if (controller.calloutTool.isEditing) return controller.calloutTool;
      if (controller.ovalCalloutTool.isEditing) return controller.ovalCalloutTool;
      if (controller.cloudCalloutTool.isEditing) return controller.cloudCalloutTool;
      return null;
    }

    function renderCalloutPreview(controller) {
      const { view, state } = controller;
      const calloutTool = editingCalloutTool(controller) || calloutToolFor(controller);
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      calloutTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableCallout(controller) {
      (editingCalloutTool(controller) || calloutToolFor(controller)).reset();
      controller.calloutBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableCallout(controller) {
      const { state, view } = controller;
      const calloutTool = editingCalloutTool(controller) || calloutToolFor(controller);
      if (!calloutTool.isEditing || !calloutTool.model) {
        cancelEditableCallout(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = calloutTool.rasterize(state, state);
      const before = controller.calloutBefore;
      calloutTool.reset();
      controller.calloutBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    /** Build an export-only canvas without changing live floating pixels or editable text. */
    function createCompositeCanvas(controller) {
      const { view, selection, state } = controller;
      const hasFloatingSelection = selection.floating && selection.imageData && selection.rect;
      const editableText = view.textInput.hidden ? '' : view.textInput.value;
      const editableTextRect = editableText
        ? (view.getTextContentRect() || view.getTextInputRect() || controller.textRect)
        : null;
      if (!hasFloatingSelection && !editableTextRect) return view.canvas;
      const composite = document.createElement("canvas");
      composite.width = view.canvas.width;
      composite.height = view.canvas.height;
      const context = composite.getContext("2d");
      context.drawImage(view.canvas, 0, 0);
      if (hasFloatingSelection) selection.drawFloatingLayer(context);
      if (editableTextRect) namespace.drawText(context, editableTextRect, editableText, state);
      return composite;
    }

    /** Encode visible canvas layers without committing floating pixels or editable text. */
    function encodeCompositeCanvas(controller, mimeType) {
      return namespace.encodeCanvas(createCompositeCanvas(controller), mimeType, controller.state.backgroundColor);
    }

    async function copySelectionToClipboard(controller) {
      const data = controller.selection.copy(controller.view.context);
      if (!data) return false;
      if (global.ClipboardItem && global.navigator?.clipboard?.write) {
        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;
        canvas.getContext("2d").putImageData(data, 0, 0);
        try {
          const blob = await namespace.encodeCanvas(canvas, "image/png", "#ffffff");
          await global.navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch (_error) {
          // The retained in-app clipboard remains available when system permission is denied.
        }
      }
      syncTab(controller);
      return true;
    }

    async function readSystemClipboardImage() {
      if (!global.navigator?.clipboard?.read) return null;
      try {
        const items = await global.navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((candidate) => candidate.startsWith("image/"));
          if (!type) continue;
          const bitmap = await namespace.decodeBytes(new Uint8Array(await (await item.getType(type)).arrayBuffer()), type);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0);
          bitmap.close?.();
          return context.getImageData(0, 0, canvas.width, canvas.height);
        }
      } catch (_error) {
        return null;
      }
      return null;
    }

    async function readSystemClipboardText() {
      let text = null;
      const browserClipboard = global.navigator?.clipboard;
      if (browserClipboard && !browserClipboard.readText) return null;
      if (browserClipboard?.readText) {
        try {
          text = await browserClipboard.readText();
          if (text) return text;
        } catch (_error) {}
      }
      if (global.Neutralino?.clipboard?.readText) {
        try {
          return await global.Neutralino.clipboard.readText();
        } catch (_error) {}
      }
      return text;
    }

    function applyZoom(controller, zoom, anchor) {
      controller.state.setZoom(zoom);
      if (anchor) controller.view.setZoomAtClientPoint(controller.state.zoom, anchor.clientX, anchor.clientY);
      else controller.view.setZoom(controller.state.zoom);
      if (editingCalloutTool(controller)) renderCalloutPreview(controller);
      if (controller.roundedRectangleTool?.isEditing) renderRoundedRectanglePreview(controller);
      if (controller.heartTool?.isEditing) renderHeartPreview(controller);
      if (controller.triangleTool?.isEditing) renderTrianglePreview(controller);
      if (controller.ellipseTool?.isEditing) renderEllipsePreview(controller);
      if (controller.arcTool?.isEditing) renderArcPreview(controller);
      syncTab(controller);
      return controller.state.zoom;
    }

    async function runAction(controller, action) {
      const { view, state, history, selection } = controller;
      if (action === "undo" || action === "redo") {
        selection.clear();
        const next = action === "undo" ? history.undo() : history.redo();
        if (restoreSnapshot(controller, next)) {
          state.setDirty(history.isAtSavedState !== true);
          syncTab(controller);
        }
        return;
      }
      if (action === "zoom-in" || action === "zoom-out") {
        applyZoom(controller, state.zoom * (action === "zoom-in" ? 1.25 : 0.8));
        return;
      }
      if (action === "copy") return copySelectionToClipboard(controller);
      if (action === "paste") {
        if (!view.textInput.hidden) {
          const clipboardText = await readSystemClipboardText();
          if (clipboardText?.length && pasteTextIntoActiveEditor(controller, clipboardText)) return;
        }
        commitSelection(controller);
        const pasteRevision = selection.beginPaste();
        state.setTool("select");
        drawSelectionOverlay(controller);
        syncTab(controller);
        const clipboardText = await readSystemClipboardText();
        if (!selection.isPastePending(pasteRevision)) return;
        if (clipboardText?.length) {
          openPastedTextBox(controller, clipboardText);
          return;
        }
        const clipboardImage = await readSystemClipboardImage();
        if (!selection.isPastePending(pasteRevision)) return;
        const pasteData = clipboardImage || selection.internalClipboard;
        if (!pasteData) {
          selection.clear();
          drawSelectionOverlay(controller);
          syncTab(controller);
          return;
        }
        const pasteOrigin = view.getPasteOrigin(state.zoom);
        controller.selectionBefore = snapshot(view);
        resizeCanvas(
          controller,
          Math.max(view.canvas.width, pasteOrigin.x + pasteData.width),
          Math.max(view.canvas.height, pasteOrigin.y + pasteData.height)
        );
        if (selection.paste(view.context, pasteData, state, pasteRevision, pasteOrigin)) {
          drawSelectionOverlay(controller);
        }
        syncTab(controller);
        return;
      }
      if (!selection.hasSelection) return;
      const before = snapshot(view);
      if (action === "cut") {
        await copySelectionToClipboard(controller);
        selection.delete(view.context, state.backgroundColor);
      } else if (action === "delete") {
        selection.delete(view.context, state.backgroundColor);
      }
      drawSelectionOverlay(controller);
      commitTransaction(controller, before);
    }

    function openEditableTextBox(controller, rect, text = '') {
      controller.textRect = rect;
      controller.textInputOpening = true;
      controller.view.showTextInput(rect, controller.state);
      controller.view.textInput.value = text;
      setTimeout(() => { controller.textInputOpening = false; }, 150);
    }

    /** Insert clipboard text at the cursor without ending the current text edit. */
    function pasteTextIntoActiveEditor(controller, text) {
      const input = controller.view.textInput;
      if (input.hidden) return false;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText(text, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      return true;
    }

    function openPastedTextBox(controller, text) {
      const { view, state, selection } = controller;
      const pasteOrigin = view.getPasteOrigin(state.zoom);
      controller.pastedTextEditing = true;
      const lineCount = String(text).split(/\r?\n/).length;
      const lineHeight = state.fontSize * 1.2;
      selection.clear();
      state.setTool('text');
      drawSelectionOverlay(controller);
      openEditableTextBox(controller, {
        x: pasteOrigin.x,
        y: pasteOrigin.y,
        width: Math.min(view.canvas.width - pasteOrigin.x, Math.max(120, view.canvas.width * 0.5)),
        height: Math.min(view.canvas.height - pasteOrigin.y, Math.max(lineHeight + 12, lineCount * lineHeight + 12))
      }, text);
      syncTab(controller);
    }

    function commitText(controller) {
      const input = controller.view.textInput;
      if (input.hidden) return false;
      controller.pastedTextEditing = false;
      const text = input.value;
      const textRect = controller.view.getTextContentRect() || controller.view.getTextInputRect() || controller.textRect;
      controller.view.hideTextInput();
      controller.textRect = null;
      if (!text) return false;
      const before = snapshot(controller.view);
      namespace.drawText(controller.view.context, textRect, text, controller.state);
      return commitTransaction(controller, before);
    }

    function drawTextCreationOverlay(controller, point) {
      const { view } = controller;
      const rect = view.rectFromPoints(controller.startPoint, point);
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      view.overlayContext.save();
      view.overlayContext.setLineDash([5, 4]);
      view.overlayContext.strokeStyle = "#1473e6";
      view.overlayContext.lineWidth = 1;
      view.overlayContext.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
      view.overlayContext.restore();
    }

    function isTextFormattingTarget(target) {
      return Boolean(target?.closest?.(".image-editor-text-controls, .image-editor-foreground, .image-editor-background, [data-palette-color], [data-color-target], [data-format]"));
    }

    function keepTextInputLive(controller) {
      controller.keepTextInputLive = true;
      setTimeout(() => { controller.keepTextInputLive = false; }, 300);
    }

    function refreshLiveTextStyle(controller) {
      controller.view.applyTextInputStyle?.(controller.state);
    }

    function applyToolbarColor(controller, target, color) {
      const colorTarget = target === "background" ? "background" : "foreground";
      const stateProperty = colorTarget === "background" ? "backgroundColor" : "foregroundColor";
      const inputSelector = colorTarget === "background" ? ".image-editor-background" : ".image-editor-foreground";
      controller.state[stateProperty] = color;
      controller.view.shell.querySelector(inputSelector).value = color;
      controller.view.setActiveColorTarget(colorTarget, controller.state);
      if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
      if (editingCalloutTool(controller)) renderCalloutPreview(controller);
      if (controller.heartTool.isEditing) renderHeartPreview(controller);
      if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
      if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
      if (controller.arcTool.isEditing) renderArcPreview(controller);
      if (colorTarget === "foreground") {
        refreshLiveTextStyle(controller);
        if (controller.curveTool.isEditing) renderCurvePreview(controller);
        if (controller.selection.recolorFloatingLayer(color, "curve")) {
          drawSelectionOverlay(controller);
          syncTab(controller);
        }
      }
    }

    function bindToolbar(controller) {
      const { view, state } = controller;
      view.toolbar.addEventListener("pointerdown", (event) => {
        if (!view.textInput.hidden && isTextFormattingTarget(event.target)) keepTextInputLive(controller);
      }, true);
      view.toolbar.addEventListener("focusin", (event) => {
        if (!view.textInput.hidden && isTextFormattingTarget(event.target)) keepTextInputLive(controller);
      });
      view.toolbar.addEventListener("click", (event) => {
        const toolButton = event.target.closest("[data-tool]");
        if (toolButton) {
          if (state.tool === "curve" && controller.curveTool.isEditing) finishEditableCurve(controller);
          if (state.tool === "rounded-rectangle" && controller.roundedRectangleTool.isEditing) finishEditableRoundedRectangle(controller);
          if (isCalloutTool(state.tool) && editingCalloutTool(controller)) finishEditableCallout(controller);
          if (state.tool === "heart" && controller.heartTool.isEditing) finishEditableHeart(controller);
          if (state.tool === "triangle" && controller.triangleTool.isEditing) finishEditableTriangle(controller);
          if (state.tool === "ellipse" && controller.ellipseTool.isEditing) finishEditableEllipse(controller);
          if (state.tool === "arc" && controller.arcTool.isEditing) finishEditableArc(controller);
          commitText(controller);
          if (toolButton.dataset.tool !== "select") dropSelection(controller);
          state.setTool(toolButton.dataset.tool);
          syncTab(controller);
          return;
        }
        const actionButton = event.target.closest("[data-action]");
        if (actionButton && !actionButton.disabled) void runAction(controller, actionButton.dataset.action);
        const paletteButton = event.target.closest("[data-palette-color]");
        if (paletteButton) {
          applyToolbarColor(controller, view.activeColorTarget, paletteButton.dataset.paletteColor);
          return;
        }
        const formatButton = event.target.closest("[data-format]");
        if (formatButton) {
          const key = formatButton.dataset.format === "bold" ? "fontBold" : "fontItalic";
          state[key] = !state[key];
          formatButton.classList.toggle("active", state[key]);
          refreshLiveTextStyle(controller);
          if (!view.textInput.hidden) setTimeout(() => view.textInput.focus(), 0);
        }
      });
      [["foreground", ".image-editor-foreground"], ["background", ".image-editor-background"]].forEach(([target, selector]) => {
        const input = view.shell.querySelector(selector);
        input.addEventListener("pointerdown", () => view.setActiveColorTarget(target, state));
        input.addEventListener("focus", () => view.setActiveColorTarget(target, state));
        input.addEventListener("input", (event) => applyToolbarColor(controller, target, event.target.value));
      });
      view.shell.querySelector(".image-editor-size").addEventListener("input", (event) => {
        state.brushSize = state.lineWidth = Number(event.target.value);
        if (controller.curveTool.isEditing) renderCurvePreview(controller);
        if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
        if (editingCalloutTool(controller)) renderCalloutPreview(controller);
        if (controller.heartTool.isEditing) renderHeartPreview(controller);
        if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
        if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
        if (controller.arcTool.isEditing) renderArcPreview(controller);
      });
      view.shell.querySelector(".image-editor-fill").addEventListener("change", (event) => {
        state.fillShapes = event.target.checked;
        if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
        if (editingCalloutTool(controller)) renderCalloutPreview(controller);
        if (controller.heartTool.isEditing) renderHeartPreview(controller);
        if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
        if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
        if (controller.arcTool.isEditing) renderArcPreview(controller);
      });
      view.shell.querySelector(".image-editor-callout-type").addEventListener("change", (event) => {
        const nextTool = event.target.value;
        if (!isCalloutTool(nextTool) || nextTool === state.tool) return;
        if (isCalloutTool(state.tool) && editingCalloutTool(controller)) finishEditableCallout(controller);
        commitText(controller);
        dropSelection(controller);
        state.setTool(nextTool);
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-star-points").addEventListener("change", (event) => {
        const starPoints = Number(event.target.value);
        if (![4, 5, 6].includes(starPoints)) return;
        state.starPoints = starPoints;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-arrow-direction").addEventListener("change", (event) => {
        if (!["up", "down", "left", "right"].includes(event.target.value)) return;
        state.arrowDirection = event.target.value;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-arrow-head-angle").addEventListener("change", (event) => {
        const arrowHeadAngle = Number(event.target.value);
        if (![30, 45, 60, 90].includes(arrowHeadAngle)) return;
        state.arrowHeadAngle = arrowHeadAngle;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-corner-radius").addEventListener("input", (event) => {
        state.cornerRadius = Number(event.target.value);
        if (controller.roundedRectangleTool.setRadius(state.cornerRadius, state.adjustAllCorners)) renderRoundedRectanglePreview(controller);
      });
      view.shell.querySelector(".image-editor-all-corners").addEventListener("change", (event) => {
        state.adjustAllCorners = event.target.checked;
        if (state.adjustAllCorners && controller.roundedRectangleTool.isEditing) {
          controller.roundedRectangleTool.unifyCorners();
          updateRoundedRectangleRadiusControl(controller);
          renderRoundedRectanglePreview(controller);
        }
      });
      view.shell.querySelector(".image-editor-font").addEventListener("change", (event) => {
        state.fontFamily = event.target.value;
        refreshLiveTextStyle(controller);
      });
      view.shell.querySelector(".image-editor-font-size").addEventListener("input", (event) => {
        state.fontSize = Number(event.target.value);
        refreshLiveTextStyle(controller);
      });
    }

    function stampFloatingSelection(controller) {
      const { view, selection } = controller;
      if (!selection.floating || !selection.imageData || !selection.rect) return false;
      return selection.drawFloatingLayer(view.context);
    }
    function dropSelection(controller) {
      const { selection } = controller;
      if (!selection.hasSelection && !selection.isPasting) return false;
      const returnTool = selection.returnToolAfterPlacement;
      if (selection.floating) commitSelection(controller);
      controller.selectionBefore = null;
      selection.clear();
      if (returnTool && controller.state.tool === "select") controller.state.setTool(returnTool);
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }
    function updateSelectionHoverCursor(controller, point) {
      const { view, state, selection } = controller;
      const rotationHandle = state.tool === "select" ? selection.findRotationHandle(point, state.zoom) : null;
      const resizeHandle = state.tool === "select" ? selection.findResizeHandle(point, state.zoom) : null;
      const resizeCursor = {
        n: "ns-resize",
        s: "ns-resize",
        e: "ew-resize",
        w: "ew-resize",
        nw: "nwse-resize",
        se: "nwse-resize",
        ne: "nesw-resize",
        sw: "nesw-resize"
      }[resizeHandle];
      view.overlay.style.cursor = rotationHandle ? rotationCursor :
        (resizeCursor || (state.tool === "select" && selection.contains(point) ? "move" : "crosshair"));
    }
    function bindPointerTools(controller) {
      const { view, state, selection } = controller;
      const overlay = view.overlay;
      overlay.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const point = view.pointFromEvent(event);
        if (state.tool === "curve") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.curveTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.curveBefore = snapshot(view);
          }
          if (!controller.curveTool.begin(point, state.lineWidth)) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderCurvePreview(controller);
          return;
        }
        if (state.tool === "rounded-rectangle") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.roundedRectangleTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.roundedRectangleBefore = snapshot(view);
          }
          const result = controller.roundedRectangleTool.begin(point, state.cornerRadius, state.adjustAllCorners);
          if (result.action === "outside") {
            finishEditableRoundedRectangle(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          updateRoundedRectangleRadiusControl(controller);
          renderRoundedRectanglePreview(controller);
          return;
        }
        if (isCalloutTool(state.tool)) {
          event.preventDefault();
          event.stopPropagation();
          const calloutTool = calloutToolFor(controller);
          if (!calloutTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.calloutBefore = snapshot(view);
          }
          const result = calloutTool.begin(point, state.cornerRadius, state);
          if (result.action === "outside") {
            finishEditableCallout(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderCalloutPreview(controller);
          return;
        }
        if (state.tool === "heart") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.heartTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.heartBefore = snapshot(view);
          }
          const result = controller.heartTool.begin(point);
          if (result.action === "outside") {
            finishEditableHeart(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderHeartPreview(controller);
          return;
        }
        if (state.tool === "triangle") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.triangleTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.triangleBefore = snapshot(view);
          }
          const result = controller.triangleTool.begin(point);
          if (result.action === "outside") {
            finishEditableTriangle(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderTrianglePreview(controller);
          return;
        }
        if (state.tool === "ellipse") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.ellipseTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.ellipseBefore = snapshot(view);
          }
          const result = controller.ellipseTool.begin(point);
          if (result.action === "outside") {
            finishEditableEllipse(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderEllipsePreview(controller);
          return;
        }
        if (state.tool === "arc") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.arcTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.arcBefore = snapshot(view);
          }
          const result = controller.arcTool.begin(point);
          if (result.action === "outside") {
            finishEditableArc(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderArcPreview(controller);
          return;
        }
        if (state.tool === "text") {
          event.preventDefault();
          event.stopPropagation();
          commitText(controller);
          controller.startPoint = controller.lastPoint = point;
          controller.dragging = true;
          controller.creatingTextBox = true;
          overlay.setPointerCapture?.(event.pointerId);
          return;
        }
        if (state.tool === "bucket") {
          event.preventDefault();
          commitText(controller);
          commitSelection(controller);
          const before = snapshot(view);
          if (namespace.floodFill(view.context, point, state)) commitTransaction(controller, before);
          else syncTab(controller);
          return;
        }        if (state.tool === "polygon") {
          if (!controller.polygonPoints.length) controller.gestureBefore = snapshot(view);
          controller.polygonPoints.push(point);
          namespace.drawPolygon(view.overlayContext, controller.polygonPoints, state, false);
          return;
        }
        controller.gestureBefore = snapshot(view);
        controller.startPoint = controller.lastPoint = point;
        controller.dragging = true;
        if (state.tool === "select") {
          if (selection.hasSelection && !selection.floating) controller.selectionBefore = snapshot(view);
          const gesture = selection.beginPointerGesture(point, view.context, state.backgroundColor, {
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            shift: event.shiftKey,
            zoom: state.zoom
          });
          if (gesture.action === "drop") dropSelection(controller);
          if (gesture.action === "drop" || gesture.action === "ignore") {
            controller.dragging = false;
            return;
          }
          overlay.setPointerCapture?.(event.pointerId);
          return;
        }
        overlay.setPointerCapture?.(event.pointerId);
      });
      overlay.addEventListener("pointermove", (event) => {
        const point = view.pointFromEvent(event, !selection.isTransforming);
        if (!controller.dragging) {
          updateSelectionHoverCursor(controller, point);
          return;
        }
        if (state.tool === "curve") {
          controller.curveTool.update(point);
          renderCurvePreview(controller);
          return;
        }
        if (state.tool === "rounded-rectangle") {
          controller.roundedRectangleTool.update(point);
          updateRoundedRectangleRadiusControl(controller);
          renderRoundedRectanglePreview(controller);
          return;
        }
        if (isCalloutTool(state.tool)) {
          calloutToolFor(controller).update(point);
          renderCalloutPreview(controller);
          return;
        }
        if (state.tool === "heart") {
          controller.heartTool.update(point);
          renderHeartPreview(controller);
          return;
        }
        if (state.tool === "triangle") {
          controller.triangleTool.update(point);
          renderTrianglePreview(controller);
          return;
        }
        if (state.tool === "ellipse") {
          controller.ellipseTool.update(point);
          renderEllipsePreview(controller);
          return;
        }
        if (state.tool === "arc") {
          controller.arcTool.update(point);
          renderArcPreview(controller);
          return;
        }
        if (state.tool === "text" && controller.creatingTextBox) {
          drawTextCreationOverlay(controller, point);
          return;
        }
        if (state.tool === "pencil" || state.tool === "brush") {
          namespace.drawFreehand(view.context, controller.lastPoint, point, state, state.tool);
          controller.lastPoint = point;
          return;
        }
        if (state.tool === "select") {
          const movement = selection.updatePointerGesture(point, state);
          if (movement.stamp) stampFloatingSelection(controller);
          drawSelectionOverlay(controller);
          return;
        }
        view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
        namespace.drawShape(view.overlayContext, state.tool, controller.startPoint, point, state);
      });
      overlay.addEventListener("pointerup", (event) => {
        if (!controller.dragging) return;
        controller.dragging = false;
        const point = view.pointFromEvent(event);
        if (state.tool === "curve") {
          const result = controller.curveTool.completeStage(point);
          if (result.complete) finishEditableCurve(controller);
          else renderCurvePreview(controller);
        } else if (state.tool === "rounded-rectangle") {
          controller.roundedRectangleTool.completeStage(point);
          updateRoundedRectangleRadiusControl(controller);
          renderRoundedRectanglePreview(controller);
        } else if (isCalloutTool(state.tool)) {
          calloutToolFor(controller).completeStage(point);
          renderCalloutPreview(controller);
        } else if (state.tool === "heart") {
          controller.heartTool.completeStage(point);
          renderHeartPreview(controller);
        } else if (state.tool === "triangle") {
          controller.triangleTool.completeStage(point);
          renderTrianglePreview(controller);
        } else if (state.tool === "ellipse") {
          controller.ellipseTool.completeStage(point);
          renderEllipsePreview(controller);
        } else if (state.tool === "arc") {
          controller.arcTool.completeStage(point);
          renderArcPreview(controller);
        } else if (state.tool === "text" && controller.creatingTextBox) {
          controller.creatingTextBox = false;
          view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
          const draggedRect = view.rectFromPoints(controller.startPoint, point);
          if (draggedRect.width < 3 && draggedRect.height < 3) return;
          const textRect = {
            ...draggedRect,
            width: Math.max(24, draggedRect.width),
            height: Math.max(state.fontSize * 1.2 + 12, draggedRect.height)
          };
          textRect.width = Math.min(textRect.width, state.width - textRect.x);
          textRect.height = Math.min(textRect.height, state.height - textRect.y);
          openEditableTextBox(controller, textRect);
        } else if (state.tool === "pencil" || state.tool === "brush") {
          commitTransaction(controller, controller.gestureBefore);
        } else if (state.tool === "select") {
          selection.endPointerGesture();
          drawSelectionOverlay(controller);
          syncTab(controller);
        } else {
          view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
          const layer = namespace.rasterizeShapeLayer(state.tool, controller.startPoint, point, state, state);
          floatGeneratedLayer(controller, layer, controller.gestureBefore);
        }
      });
      overlay.addEventListener("dblclick", () => {
        if (state.tool !== "polygon" || controller.polygonPoints.length < 3) return;
        view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
        const layer = namespace.rasterizePolygonLayer(controller.polygonPoints, state, state);
        const before = controller.gestureBefore;
        controller.polygonPoints = [];
        floatGeneratedLayer(controller, layer, before);
      });
    }


    function bindTextInputMove(controller) {
      const { view } = controller;
      const textBox = view.textBox;
      let drag = null;

      function resizeTextRect(startRect, handle, deltaX, deltaY) {
        const minimumWidth = 24;
        const minimumHeight = controller.state.fontSize * 1.2 + 12;
        let { x, y, width, height } = startRect;
        if (handle.includes("e")) width += deltaX;
        if (handle.includes("s")) height += deltaY;
        if (handle.includes("w")) {
          x += deltaX;
          width -= deltaX;
        }
        if (handle.includes("n")) {
          y += deltaY;
          height -= deltaY;
        }
        if (width < minimumWidth) {
          if (handle.includes("w")) x -= minimumWidth - width;
          width = minimumWidth;
        }
        if (height < minimumHeight) {
          if (handle.includes("n")) y -= minimumHeight - height;
          height = minimumHeight;
        }
        x = Math.max(0, Math.min(view.canvas.width - width, x));
        y = Math.max(0, Math.min(view.canvas.height - height, y));
        width = Math.min(width, view.canvas.width - x);
        height = Math.min(height, view.canvas.height - y);
        return { x, y, width, height };
      }

      textBox.addEventListener("pointerdown", (event) => {
        const resizeHandle = event.target.closest?.("[data-text-resize]");
        if (!resizeHandle && event.target !== textBox) return;
        if (event.button !== 0 || view.textInput.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        controller.textInputOpening = true;
        drag = {
          mode: resizeHandle ? "resize" : "move",
          handle: resizeHandle?.dataset.textResize || "",
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          rect: view.getTextInputRect()
        };
        textBox.setPointerCapture?.(event.pointerId);
        textBox.classList.toggle("moving", drag.mode === "move");
        textBox.classList.toggle("resizing", drag.mode === "resize");
      });
      textBox.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const scale = view.getScale();
        const deltaX = (event.clientX - drag.x) / scale.x;
        const deltaY = (event.clientY - drag.y) / scale.y;
        const nextRect = drag.mode === "resize" ? resizeTextRect(drag.rect, drag.handle, deltaX, deltaY) : {
          ...drag.rect,
          x: Math.max(0, Math.min(view.canvas.width - drag.rect.width, drag.rect.x + deltaX)),
          y: Math.max(0, Math.min(view.canvas.height - drag.rect.height, drag.rect.y + deltaY))
        };
        controller.textRect = nextRect;
        view.positionTextInput(nextRect);
        event.preventDefault();
      });
      const finishDrag = (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        textBox.releasePointerCapture?.(event.pointerId);
        textBox.classList.remove("moving", "resizing");
        drag = null;
        setTimeout(() => {
          controller.textInputOpening = false;
          view.textInput.focus();
        }, 0);
      };
      textBox.addEventListener("pointerup", finishDrag);
      textBox.addEventListener("pointercancel", finishDrag);
    }


    function bindCanvasResize(controller) {
      const { view } = controller;
      let drag = null;
      view.wrap.addEventListener("pointerdown", (event) => {
        const handle = event.target.closest?.("[data-canvas-resize]");
        if (!handle || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        commitText(controller);
        commitSelection(controller);
        drag = {
          pointerId: event.pointerId,
          handle: handle.dataset.canvasResize,
          x: event.clientX,
          y: event.clientY,
          width: view.canvas.width,
          height: view.canvas.height,
          nextWidth: view.canvas.width,
          nextHeight: view.canvas.height,
          before: snapshot(view),
        };
        handle.setPointerCapture?.(event.pointerId);
        view.beginCanvasResizePreview(drag.handle);
      });
      view.wrap.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const scale = view.getScale();
        const deltaX = (event.clientX - drag.x) / scale.x;
        const deltaY = (event.clientY - drag.y) / scale.y;
        const nextDimensions = normalizeCanvasDimensions(
          drag.handle.includes("e") ? drag.width + deltaX : drag.width,
          drag.handle.includes("s") ? drag.height + deltaY : drag.height
        );
        drag.nextWidth = nextDimensions.width;
        drag.nextHeight = nextDimensions.height;
        view.updateCanvasResizePreview(drag.nextWidth, drag.nextHeight);
        event.preventDefault();
      });
      const finishResize = (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.target.releasePointerCapture?.(event.pointerId);
        const before = drag.before;
        view.endCanvasResizePreview();
        const changed = resizeCanvas(controller, drag.nextWidth, drag.nextHeight);
        drag = null;
        if (changed) commitTransaction(controller, before);
        else syncTab(controller);
      };
      view.wrap.addEventListener("pointerup", finishResize);
      view.wrap.addEventListener("pointercancel", finishResize);
    }
    function keyboardSelectionDelta(event) {
      if (event.key === "ArrowLeft") return { x: -1, y: 0 };
      if (event.key === "ArrowRight") return { x: 1, y: 0 };
      if (event.key === "ArrowUp") return { x: 0, y: -1 };
      if (event.key === "ArrowDown") return { x: 0, y: 1 };
      return null;
    }

    function dropSelectionWithKeyboard(controller, event) {
      const { selection } = controller;
      if (event.key !== "Escape" || (!selection.hasSelection && !selection.isPasting)) return false;
      event.preventDefault();
      dropSelection(controller);
      return true;
    }
    function moveSelectionWithKeyboard(controller, event) {
      const delta = keyboardSelectionDelta(event);
      const { view, state, selection } = controller;
      if (!delta || state.tool !== "select" || !selection.hasSelection) return false;
      event.preventDefault();
      if (!selection.floating) controller.selectionBefore = snapshot(view);
      else if (!controller.selectionBefore) controller.selectionBefore = snapshot(view);
      const move = selection.beginMove(view.context, state.backgroundColor, {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey
      });
      if (!move.started) return true;
      const movement = selection.moveSelection(delta.x, delta.y, state);
      selection.endMove();
      drawSelectionOverlay(controller);
      if (!movement.moved) {
        syncTab(controller);
        return true;
      }
      if (movement.stamp) stampFloatingSelection(controller);
      syncTab(controller);
      return true;
    }
    function selectAllCanvas(controller) {
      const { view, state, selection } = controller;
      commitText(controller);
      commitSelection(controller);
      selection.setRect(
        { x: 0, y: 0 },
        { x: view.canvas.width, y: view.canvas.height },
        state
      );
      state.setTool("select");
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }
    function bindKeyboard(controller) {
      const listener = (event) => {
        if (deps.getActiveTab?.()?.id !== controller.tab.id) return;
        const primary = event.ctrlKey || event.metaKey;
        if (primary && event.key.toLowerCase() === "s" && event.defaultPrevented) return;
        if (controller.view.textInput.hidden === false) {
          if (event.key === "Escape") {
            controller.view.hideTextInput();
            event.preventDefault();
          } else if (primary && event.key === "Enter") {
            commitText(controller);
            event.preventDefault();
          }
          return;
        }
        if (controller.state.tool === "curve" && controller.curveTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableCurve(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableCurve(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "rounded-rectangle" && controller.roundedRectangleTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableRoundedRectangle(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableRoundedRectangle(controller);
            event.preventDefault();
            return;
          }
        }
        if (isCalloutTool(controller.state.tool) && editingCalloutTool(controller)) {
          if (event.key === "Escape") {
            cancelEditableCallout(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableCallout(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "heart" && controller.heartTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableHeart(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableHeart(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "triangle" && controller.triangleTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableTriangle(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableTriangle(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "ellipse" && controller.ellipseTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableEllipse(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableEllipse(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "arc" && controller.arcTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableArc(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableArc(controller);
            event.preventDefault();
            return;
          }
        }
        if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "a") {
          event.preventDefault();
          selectAllCanvas(controller);
          return;
        }
        if (dropSelectionWithKeyboard(controller, event)) return;
        if (moveSelectionWithKeyboard(controller, event)) return;
        let action = "";
        if (primary && event.key.toLowerCase() === "z") action = event.shiftKey ? "redo" : "undo";
        else if (primary && event.key.toLowerCase() === "y") action = "redo";
        else if (primary && event.key.toLowerCase() === "x") action = "cut";
        else if (primary && event.key.toLowerCase() === "c") action = "copy";
        else if (event.key === "Delete") action = "delete";
        else if (primary && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void (event.shiftKey ? saveTabAs(controller.tab) : saveTab(controller.tab));
          return;
        } else if (event.key === "Enter" && controller.state.tool === "polygon" && controller.polygonPoints.length > 2) {
          controller.view.overlay.dispatchEvent(new MouseEvent("dblclick"));
          event.preventDefault();
          return;
        } else if (event.key === "Escape" && controller.polygonPoints.length) {
          controller.polygonPoints = [];
          controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
          event.preventDefault();
          return;
        }
        if (action) {
          event.preventDefault();
          void runAction(controller, action);
        }
      };
      global.addEventListener("keydown", listener, true);
      controller.removeKeyboardListener = () => global.removeEventListener("keydown", listener, true);
    }

    function bindNativeTextPaste(controller) {
      const listener = (event) => {
        if (deps.getActiveTab?.()?.id !== controller.tab.id) return;
        const text = event.clipboardData?.getData('text/plain');
        event.preventDefault();
        event.stopPropagation();
        if (text) {
          keepTextInputLive(controller);
          if (pasteTextIntoActiveEditor(controller, text)) return;
          openPastedTextBox(controller, text);
          return;
        }
        void runAction(controller, 'paste');
      };
      global.document.addEventListener('paste', listener, true);
      controller.removeNativeTextPasteListener = () => global.document.removeEventListener('paste', listener, true);
    }

    function bindSelectionDismissal(controller) {
      const listener = (event) => {
        if (deps.getActiveTab?.()?.id !== controller.tab.id) return;
        if (event.target.closest?.('[data-tool="select"]')) return;
        if (event.target.closest?.(".image-editor-selection-actions, .image-editor-history-actions")) return;
        if (event.target.closest?.(".image-editor-color-targets, .image-editor-color-palette")) return;
        if ((!controller.selection.hasSelection && !controller.selection.isPasting) || controller.view.wrap.contains(event.target)) return;
        dropSelection(controller);
      };
      global.document.addEventListener("pointerdown", listener, true);
      controller.removeSelectionDismissalListener = () => global.document.removeEventListener("pointerdown", listener, true);
    }

    async function createController(tab, root) {
      const source = {
        ...(tab.imageEditorSource || {}),
        name: tab.sourceFileName || tab.imageEditorSource?.name,
        path: tab.sourceFilePath || tab.imageEditorSource?.path,
        handle: tab.sourceFileHandle || tab.imageEditorSource?.handle,
        file: tab.imageEditorSource?.file,
        draftBytes: tab.imageEditorDraftBytes
      };
      const mimeType = tab.imageEditorDirty && tab.imageEditorDraftBytes ? "image/png" :
        (source.mimeType || namespace.mimeTypeForName(source.name || source.path) || "image/png");
      const view = new namespace.ImageEditorView(root);
      if (source.blank === true && !source.draftBytes) {
        const width = Math.max(16, Number(source.width || tab.imageEditorState?.width || 640) || 640);
        const height = Math.max(16, Number(source.height || tab.imageEditorState?.height || 360) || 360);
        view.setDimensions(width, height);
        view.context.fillStyle = tab.imageEditorState?.backgroundColor || "#ffffff";
        view.context.fillRect(0, 0, width, height);
      } else {
        const bytes = await namespace.readSourceBytes(source, deps);
        const bitmap = await namespace.decodeBytes(bytes, mimeType);
        view.setDimensions(bitmap.width, bitmap.height);
        view.context.drawImage(bitmap, 0, 0);
        bitmap.close?.();
      }
      const state = new namespace.ImageEditorState({
        ...(tab.imageEditorState || {}),
        width: view.canvas.width,
        height: view.canvas.height,
        mimeType: tab.imageEditorSource?.mimeType || mimeType
      });
      if (tab.imageEditorDirty) state.setDirty(true);
      const controller = {
        tab, view, state,
        history: new namespace.ImageEditorHistory(),
        selection: new namespace.ImageEditorSelection(),
        polygonPoints: [],
        dragging: false,
        selectionBefore: null,
        curveTool: new namespace.ImageEditorCurveTool(),
        curveBefore: null,
        roundedRectangleTool: new namespace.ImageEditorRoundedRectangleTool(),
        roundedRectangleBefore: null,
        calloutTool: new namespace.ImageEditorCalloutTool(),
        ovalCalloutTool: new namespace.ImageEditorOvalCalloutTool(),
        cloudCalloutTool: new namespace.ImageEditorCloudCalloutTool(),
        calloutBefore: null,
        heartTool: new namespace.ImageEditorHeartTool(),
        heartBefore: null,
        triangleTool: new namespace.ImageEditorTriangleTool(),
        triangleBefore: null,
        ellipseTool: new namespace.ImageEditorEllipseTool(),
        ellipseBefore: null,
        arcTool: new namespace.ImageEditorArcTool(),
        arcBefore: null,
        textRect: null,
        creatingTextBox: false,
        textInputOpening: false,
        keepTextInputLive: false,
        pastedTextEditing: false
      };
      views.set(tab.id, controller);
      bindToolbar(controller);
      bindPointerTools(controller);
      bindTextInputMove(controller);
      bindCanvasResize(controller);
      bindKeyboard(controller);
      bindNativeTextPaste(controller);
      bindSelectionDismissal(controller);
      view.textInput.addEventListener("blur", () => setTimeout(() => {
        const activeElement = global.document?.activeElement;
        if (controller.pastedTextEditing && !controller.view.textInput.hidden) {
          controller.view.textInput.focus();
          return;
        }
        if (controller.keepTextInputLive || controller.view.toolbar.contains(activeElement) || controller.view.textBox.contains(activeElement)) {
          controller.textInputOpening = false;
          return;
        }
        if (controller.textInputOpening) {
          controller.view.textInput.focus();
          return;
        }
        commitText(controller);
      }, 0));
      view.setZoom(state.zoom);
      syncTab(controller);
      return controller;
    }

    async function mountImageEditorTab(tab, root) {
      if (!tab?.id || !root) return null;
      const existing = views.get(tab.id);
      if (existing?.view?.root === root) {
        syncTab(existing);
        return existing;
      }
      destroyImageEditorTab(tab.id);
      try {
        tab.missingSource = false;
        return await createController(tab, root);
      } catch (error) {
        tab.missingSource = true;
        root.innerHTML = `<div class="image-editor-missing"><h2>Image unavailable</h2><p></p></div>`;
        root.querySelector("p").textContent = error?.message || "The image source could not be read.";
        return null;
      }
    }

    function destroyImageEditorTab(tabId) {
      const controller = views.get(tabId);
      if (!controller) return;
      controller.removeKeyboardListener?.();
      controller.removeNativeTextPasteListener?.();
      controller.removeSelectionDismissalListener?.();
      controller.view.destroy();
      views.delete(tabId);
    }

    function hasUnsavedChanges(tab) {
      return views.get(tab?.id)?.state?.isDirty === true || tab?.imageEditorDirty === true;
    }

    async function getDraftBinary(tab) {
      const controller = views.get(tab?.id);
      if (!controller) return tab?.imageEditorDraftBytes || null;
      return namespace.blobToUint8Array(await encodeCompositeCanvas(controller, "image/png"));
    }

    async function writeBlobToSource(tab, blob) {
      if (typeof deps.NL_VERSION !== "undefined" && tab.sourceFilePath && deps.Neutralino?.filesystem?.writeBinaryFile) {
        await deps.Neutralino.filesystem.writeBinaryFile(tab.sourceFilePath, await blob.arrayBuffer());
        return true;
      }
      if (tab.sourceFileHandle?.createWritable) {
        const writable = await tab.sourceFileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
      return false;
    }

    async function chooseSaveDestination(tab) {
      const suggestedName = tab.sourceFileName || "image.png";
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const path = await deps.Neutralino.os.showSaveDialog("Save image", {
          defaultPath: suggestedName,
          filters: [{ name: "Editable images", extensions: ["png", "jpg", "jpeg", "webp"] }]
        });
        return path ? { path, name: path.split(/[\\/]/).pop() } : null;
      }
      if (global.showSaveFilePicker) {
        const handle = await global.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Editable images", accept: {
            "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"]
          } }]
        });
        return { handle, name: handle.name };
      }
      return { downloadOnly: true, name: suggestedName };
    }

    async function finishSave(controller, destination) {
      const { tab, state, history, selection } = controller;
      if (destination && !destination.downloadOnly) {
        tab.sourceFilePath = destination.path || null;
        tab.sourceFileHandle = destination.handle || null;
        tab.sourceFileName = destination.name || tab.sourceFileName;
        tab.title = `${tab.sourceFileName} — Image Editor`;
        tab.openedSource = { name: tab.sourceFileName, path: tab.sourceFilePath, kind: "image-editor" };
        tab.imageEditorSource = {
          ...(tab.imageEditorSource || {}),
          name: tab.sourceFileName,
          path: tab.sourceFilePath,
          handle: tab.sourceFileHandle,
          mimeType: state.mimeType,
          file: null
        };
      }
      state.markSaved();
      history.markSaved?.();
      selection.markSavedFloatingLayer();
      tab.imageEditorDirty = false;
      tab.imageEditorDraftBytes = null;
      await deps.tabSessionPersistence?.cleanupDraftForTab?.(tab);
      deps.suppressFolderWatcher?.(1000);
      deps.refreshImagePreviews?.(tab.sourceFilePath);
      try {
        await deps.refreshWorkspaceGitStatus?.();
      } catch (_error) {
        // Saving an image should not fail because no Git workspace is open.
      }
      syncTab(controller);
      return true;
    }

    async function saveTab(tab) {
      const controller = views.get(tab?.id);
      if (!controller) return false;
      commitText(controller);
      const mimeType = namespace.mimeTypeForName(tab.sourceFileName || tab.sourceFilePath) || controller.state.mimeType;
      try {
        const blob = await encodeCompositeCanvas(controller, mimeType);
        if (!await writeBlobToSource(tab, blob)) return saveTabAs(tab);
        return finishSave(controller);
      } catch (error) {
        deps.alert?.(error?.message || "Unable to save this image.");
        return false;
      }
    }

    async function saveTabAs(tab) {
      const controller = views.get(tab?.id);
      if (!controller) return false;
      commitText(controller);
      try {
        const destination = await chooseSaveDestination(tab);
        if (!destination) return false;
        const mimeType = namespace.mimeTypeForName(destination.name || destination.path);
        if (!mimeType) throw new Error("Save As supports .png, .jpg, .jpeg, and .webp files.");
        const blob = await encodeCompositeCanvas(controller, mimeType);
        if (destination.downloadOnly) {
          deps.saveAs?.(blob, destination.name);
        } else if (destination.path) {
          await deps.Neutralino.filesystem.writeBinaryFile(destination.path, await blob.arrayBuffer());
        } else {
          const writable = await destination.handle.createWritable();
          await writable.write(blob);
          await writable.close();
        }
        controller.state.mimeType = mimeType;
        return finishSave(controller, destination);
      } catch (error) {
        if (error?.name === "AbortError") return false;
        deps.alert?.(error?.message || "Unable to save this image.");
        return false;
      }
    }

    function refreshCommandState(tab) {
      const controller = views.get(tab?.id);
      if (controller) syncTab(controller);
    }

    /**
     * Select the complete canvas for an image-editor tab.
     * @param {object} tab - Active image-editor tab.
     * @returns {boolean} Whether an active image-editor controller handled the command.
     */
    function selectAll(tab) {
      const controller = views.get(tab?.id);
      return controller ? selectAllCanvas(controller) : false;
    }

    /**
     * Set the zoom factor for an active image-editor tab.
     * @param {object} tab - Image-editor tab whose canvas should be zoomed.
     * @param {number} zoom - Requested zoom factor, where 1 is 100 percent.
     * @returns {number|false} Applied zoom factor, or false when the tab is not mounted.
     */
    function setZoom(tab, zoom) {
      const controller = views.get(tab?.id);
      return controller ? applyZoom(controller, zoom) : false;
    }

    /**
     * Route Ctrl/Cmd+wheel over an image editor to its canvas zoom.
     * @param {object} tab - Active image-editor tab under the wheel event.
     * @param {WheelEvent} event - Wheel input whose target identifies the editor surface.
     * @returns {boolean} Whether the image editor consumed the zoom gesture.
     */
    function handleWheelZoom(tab, event) {
      const controller = views.get(tab?.id);
      if (!controller || !controller.view.shell.contains(event.target)) return false;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !Number.isFinite(Number(event.deltaY)) || Number(event.deltaY) === 0) return false;
      event.preventDefault();
      applyZoom(controller, controller.state.zoom * (Number(event.deltaY) < 0 ? 1.25 : 0.8), {
        clientX: event.clientX,
        clientY: event.clientY
      });
      return true;
    }

    const api = {
      canEditSource: namespace.canEditSource,
      mountImageEditorTab,
      destroyImageEditorTab,
      hasUnsavedChanges,
      saveTab,
      saveTabAs,
      getDraftBinary,
      refreshCommandState,
      selectAll,
      setZoom,
      handleWheelZoom,
      getView(tabId) { return views.get(tabId) || null; }
    };
    app.services.imageEditor = api;
    app.registerModule?.("imageEditor", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
