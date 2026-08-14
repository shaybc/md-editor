// Managed-tab orchestration for the built-in raster image editor.
(function(global) {
  "use strict";

  global.registerMarkdownViewerImageEditor = function registerMarkdownViewerImageEditor(app, deps) {
    const namespace = global.MarkdownViewerImageEditor;
    const rotationCursorSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10a7 7 0 0 1 12-4l2-2v6h-6l2-2a5 5 0 0 0-8 3"/><path d="M19 14a7 7 0 0 1-12 4l-2 2v-6h6l-2 2a5 5 0 0 0 8-3"/></g></svg>';
    const rotationCursor = `url("data:image/svg+xml,${encodeURIComponent(rotationCursorSvg)}") 12 12, grab`;
    const views = new Map();

    function renderLayeredDocument(controller) {
      if (!controller.compositor) return;
      controller.compositor.render({ canvas: controller.view.canvas });
      controller.state.width = controller.documentStore.document.canvas.width;
      controller.state.height = controller.documentStore.document.canvas.height;
      controller.view.setZoom(controller.state.zoom);
    }

    function selectedPlacementLayer(controller, name) {
      const mode = controller.layerPanel?.state.placementMode || controller.tab.imageEditorState?.layersPanel?.placementMode || "new";
      const selectedId = [...controller.documentStore.selectedIds][0];
      const selectedNode = namespace.findDocumentNode(controller.documentStore.document, selectedId)?.node;
      if (selectedNode?.kind === "group") return controller.documentStore.addLayer(name, selectedNode.id);
      if (mode === "new") return controller.documentStore.addLayer(name, controller.documentStore.activeLayer()?.id);
      const active = controller.documentStore.activeLayer();
      return active && active.visible && !active.locked && !namespace.isCanvasBackgroundLayer(active) ? active : controller.documentStore.addLayer(name);
    }

    function changedPixelOverlay(before, after) {
      if (!before || !after || before.width !== after.width || before.height !== after.height) return null;
      const pixels = new ImageData(after.width, after.height);
      let changed = false;
      for (let index = 0; index < after.data.length; index += 4) {
        if (before.data[index] === after.data[index] && before.data[index + 1] === after.data[index + 1] && before.data[index + 2] === after.data[index + 2] && before.data[index + 3] === after.data[index + 3]) continue;
        pixels.data[index] = after.data[index];
        pixels.data[index + 1] = after.data[index + 1];
        pixels.data[index + 2] = after.data[index + 2];
        pixels.data[index + 3] = after.data[index + 3];
        changed = true;
      }
      return changed ? pixels : null;
    }

    function appendLayerPixelEdit(controller, layer, pixels, compositeOperation = "source-over") {
      if (!layer || layer.locked || !layer.visible || !pixels) return false;
      const assetId = controller.documentStore.addRasterAsset(pixels);
      layer.pixelEdits = [...(layer.pixelEdits || []), { assetId, compositeOperation }];
      controller.documentStore.notify({ type: "edit-layer", ids: [layer.id] });
      return true;
    }
    function appendLayerPixelReplacement(controller, layer, before, after) {
      const replacement = changedPixelOverlay(before, after);
      if (!replacement) return false;
      const erasure = new ImageData(after.width, after.height);
      for (let index = 0; index < replacement.data.length; index += 4) {
        if (before.data[index] === after.data[index] && before.data[index + 1] === after.data[index + 1]
          && before.data[index + 2] === after.data[index + 2] && before.data[index + 3] === after.data[index + 3]) continue;
        erasure.data[index + 3] = 255;
      }
      appendLayerPixelEdit(controller, layer, erasure, "destination-out");
      appendLayerPixelEdit(controller, layer, replacement);
      return true;
    }

    function selectedPixelToolLayer(controller) {
      return controller.documentStore.selectedContentLayers({ editableOnly: true, fallbackToActive: false })
        .find((layer) => !namespace.isCanvasBackgroundLayer(layer)) || null;
    }


    function cloneStampTargetLayer(controller) {
      return selectedPixelToolLayer(controller);
    }

    function drawCloneStampOverlay(controller, point = null) {
      const { view, state, cloneStampTool } = controller;
      const context = view.overlayContext;
      context.clearRect(0, 0, view.overlay.width, view.overlay.height);
      context.save();
      context.lineWidth = 1 / Math.max(0.01, Number(state.zoom) || 1);
      if (cloneStampTool.sourcePoint) {
        const source = cloneStampTool.sourcePoint;
        const marker = 7 / Math.max(0.01, Number(state.zoom) || 1);
        context.strokeStyle = "#0a84ff";
        context.beginPath();
        context.moveTo(source.x - marker, source.y);
        context.lineTo(source.x + marker, source.y);
        context.moveTo(source.x, source.y - marker);
        context.lineTo(source.x, source.y + marker);
        context.stroke();
      }
      if (point) {
        context.lineWidth = 3 / Math.max(0.01, Number(state.zoom) || 1);
        context.strokeStyle = "rgba(0,0,0,.95)";
        context.beginPath();
        context.arc(point.x, point.y, Math.max(0.5, state.brushSize / 2), 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = 1 / Math.max(0.01, Number(state.zoom) || 1);
        context.strokeStyle = "rgba(255,255,255,.98)";
        context.stroke();
      }
      context.restore();
    }

    function renderCloneStampPreview(controller, point) {
      renderLayeredDocument(controller);
      if (controller.cloneStampTool.strokeCanvas) controller.view.context.drawImage(controller.cloneStampTool.strokeCanvas, 0, 0);
      drawCloneStampOverlay(controller, point);
    }

    function drawSmudgeOverlay(controller, point) {
      const { view, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      if (!point) return;
      view.overlayContext.save();
      view.overlayContext.lineWidth = 3 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(0,0,0,.95)";
      view.overlayContext.beginPath();
      view.overlayContext.arc(point.x, point.y, Math.max(0.5, state.brushSize / 2), 0, Math.PI * 2);
      view.overlayContext.stroke();
      view.overlayContext.lineWidth = 1 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(255,255,255,.98)";
      view.overlayContext.stroke();
      view.overlayContext.restore();
    }
    function drawEraserOverlay(controller, point) {
      const { view, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      if (!point) return;
      view.overlayContext.save();
      view.overlayContext.lineWidth = 3 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(0,0,0,.95)";
      view.overlayContext.beginPath();
      view.overlayContext.arc(point.x, point.y, Math.max(0.5, state.brushSize / 2), 0, Math.PI * 2);
      view.overlayContext.stroke();
      view.overlayContext.lineWidth = 1 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(255,255,255,.98)";
      view.overlayContext.stroke();
      view.overlayContext.restore();
    }

    function renderSmudgePreview(controller, point) {
      renderLayeredDocument(controller);
      const tool = controller.smudgeTool;
      if (tool.previewCanvas && controller.smudgeLayerBefore) {
        const after = tool.previewCanvas.getContext("2d").getImageData(0, 0, tool.previewCanvas.width, tool.previewCanvas.height);
        const overlay = changedPixelOverlay(controller.smudgeLayerBefore, after);
        if (overlay) {
          const preview = document.createElement("canvas");
          preview.width = overlay.width;
          preview.height = overlay.height;
          preview.getContext("2d").putImageData(overlay, 0, 0);
          controller.view.context.drawImage(preview, 0, 0);
        }
      }
      drawSmudgeOverlay(controller, point);
    }

    function drawBlurOverlay(controller, point) {
      const { view, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      if (!point) return;
      view.overlayContext.save();
      view.overlayContext.lineWidth = 3 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(0,0,0,.95)";
      view.overlayContext.beginPath();
      view.overlayContext.arc(point.x, point.y, Math.max(0.5, state.brushSize / 2), 0, Math.PI * 2);
      view.overlayContext.stroke();
      view.overlayContext.lineWidth = 1 / Math.max(0.01, Number(state.zoom) || 1);
      view.overlayContext.strokeStyle = "rgba(255,255,255,.98)";
      view.overlayContext.stroke();
      view.overlayContext.restore();
    }

    function renderBlurPreview(controller, point) {
      renderLayeredDocument(controller);
      const tool = controller.blurTool;
      if (tool.previewCanvas && controller.blurLayerBefore) {
        const after = tool.previewCanvas.getContext("2d").getImageData(0, 0, tool.previewCanvas.width, tool.previewCanvas.height);
        const overlay = changedPixelOverlay(controller.blurLayerBefore, after);
        if (overlay) {
          const preview = document.createElement("canvas");
          preview.width = overlay.width;
          preview.height = overlay.height;
          preview.getContext("2d").putImageData(overlay, 0, 0);
          controller.view.context.drawImage(preview, 0, 0);
        }
      }
      drawBlurOverlay(controller, point);
    }

    function applyPresentationEditsToLayer(controller, layer, before, after) {
      return appendLayerPixelEdit(controller, layer, changedPixelOverlay(before, after));
    }

    /** Adopt legacy or externally written presentation pixels as a raster baseline. */
    function synchronizePresentationCanvas(controller) {
      if (!controller.compositor) return false;
      const rendered = controller.compositor.render();
      const expected = rendered.getContext("2d").getImageData(0, 0, rendered.width, rendered.height);
      const current = snapshot(controller.view);
      let differs = expected.data.length !== current.data.length;
      for (let index = 0; !differs && index < current.data.length; index += 1) differs = expected.data[index] !== current.data[index];
      if (!differs) return false;
      const layer = controller.documentStore.addLayer("Imported canvas pixels", controller.documentStore.activeLayer()?.id);
      controller.documentStore.addRasterObject(current, { x: 0, y: 0, width: current.width, height: current.height }, { name: "Imported canvas pixels", layerId: layer.id });
      return true;
    }

    function commitDocumentMutation(controller, label, callback) {
      const before = controller.documentStore.snapshot();
      const result = callback?.();
      if (result === false) return false;
      const after = controller.documentStore.snapshot();
      controller.history.push(before, after, label);
      controller.state.markChanged();
      renderLayeredDocument(controller);
      syncTab(controller);
      return true;
    }

    /** Rasterize a selected layer with the immediate panel sibling below it. */
    function mergeSelectedLayerDown(controller) {
      const selectedId = [...controller.documentStore.selectedIds][0];
      const selected = namespace.findDocumentNode(controller.documentStore.document, selectedId);
      if (!selected || selected.node.kind !== "layer" || selected.node.locked) return false;
      const below = selected.collection[selected.index + 1];
      if (!below || below.kind !== "layer" || below.locked) return false;
      return commitDocumentMutation(controller, "Merge down", () => {
        const mergeDocument = namespace.createImageDocument(controller.documentStore.document.canvas.width, controller.documentStore.document.canvas.height, controller.documentStore.document.canvas.backgroundColor);
        mergeDocument.nodes = [namespace.cloneImageDocument(selected.node), namespace.cloneImageDocument(below)];
        mergeDocument.activeLayerId = selected.node.id;
        const mergeStore = new namespace.ImageEditorDocumentStore(mergeDocument, controller.documentStore.assets);
        const canvas = new namespace.ImageEditorCompositor(mergeStore).render();
        const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const mergesIntoBackground = namespace.isCanvasBackgroundLayer(below);
        const mergedLayer = namespace.createContentLayer(mergesIntoBackground ? "Background" : selected.node.name);
        if (mergesIntoBackground) mergedLayer.extensions.canvasBackground = true;
        const assetId = controller.documentStore.addRasterAsset(imageData);
        mergedLayer.objects.push(namespace.createContentObject("raster", { assetId }, {
          name: mergesIntoBackground ? "Background" : selected.node.name,
          bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height }
        }));
        selected.collection.splice(selected.index, 2, mergedLayer);
        controller.documentStore.document.activeLayerId = mergedLayer.id;
        controller.documentStore.selectedIds = new Set([mergedLayer.id]);
        controller.documentStore.notify({ type: "merge-down", ids: [mergedLayer.id] });
        return true;
      });
    }

    /** Replace visible document content with one raster layer after confirmation. */
    function flattenDocument(controller) {
      if (global.confirm && !global.confirm("Flatten visible content into one layer? Hidden content will be discarded.")) return false;
      return commitDocumentMutation(controller, "Flatten document", () => {
        const canvas = controller.compositor.render();
        const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const document = namespace.createImageDocument(canvas.width, canvas.height, controller.documentStore.document.canvas.backgroundColor);
        const store = new namespace.ImageEditorDocumentStore(document);
        store.document.nodes[0].name = "Flattened image";
        store.addRasterObject(imageData, { x: 0, y: 0, width: canvas.width, height: canvas.height }, { name: "Flattened image", layerId: store.document.nodes[0].id });
        controller.documentStore.document = store.document;
        controller.documentStore.assets = store.assets;
        controller.documentStore.selectedIds = new Set([store.document.activeLayerId]);
        controller.documentStore.notify({ type: "flatten" });
        return true;
      });
    }

    /** Merge visible user layers without discarding hidden layers. */
    function mergeVisibleLayers(controller) {
      return commitDocumentMutation(controller, "Merge visible", () => namespace.ImageEditorLayerDocumentActions.mergeVisible(controller.documentStore));
    }

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
      const previousWidth = view.canvas.width;
      const previousHeight = view.canvas.height;
      const previous = document.createElement("canvas");
      previous.width = view.canvas.width;
      previous.height = view.canvas.height;
      previous.getContext("2d").drawImage(view.canvas, 0, 0);
      view.setDimensions(nextWidth, nextHeight);
      const canvasBackgroundColor = controller.documentStore?.document?.canvas?.backgroundColor || "#ffffff";
      view.context.clearRect(0, 0, nextWidth, nextHeight);
      if (canvasBackgroundColor !== "transparent") {
        view.context.fillStyle = canvasBackgroundColor;
        view.context.fillRect(0, 0, nextWidth, nextHeight);
      }
      view.context.drawImage(previous, 0, 0);
      state.width = nextWidth;
      state.height = nextHeight;
      if (controller.documentStore) {
        namespace.ImageEditorObjectPixelEditor.resizeCanvasBackground(controller.documentStore, previousWidth, previousHeight, nextWidth, nextHeight, canvasBackgroundColor);
        controller.documentStore.document.canvas.width = nextWidth;
        controller.documentStore.document.canvas.height = nextHeight;
      }
      view.setZoom(state.zoom);
      return true;
    }

    function syncTab(controller) {
      const { tab, state, history, selection, view } = controller;
      tab.imageEditorDirty = state.isDirty;
      tab.imageEditorState = {
        tool: state.tool,
        selectionMode: state.selectionMode,
        foregroundColor: state.foregroundColor,
        backgroundColor: state.backgroundColor,
        brushSize: state.brushSize,
        brushType: state.brushType,
        cloneStampHardness: state.cloneStampHardness,
        cloneStampOpacity: state.cloneStampOpacity,
        cloneStampAligned: state.cloneStampAligned,
        cloneStampSample: state.cloneStampSample,
        lineWidth: state.lineWidth,
        strokeType: state.strokeType,
        fillShapes: state.fillShapes,
        bucketFillMode: state.bucketFillMode,
        gradientStartColor: state.gradientStartColor,
        gradientEndColor: state.gradientEndColor,
        patternFillType: state.patternFillType,
        patternScale: state.patternScale,
        patternAngle: state.patternAngle,
        patternDensity: state.patternDensity,
        spiralDirection: state.spiralDirection,
        smudgeHardness: state.smudgeHardness,
        eraserHardness: state.eraserHardness,
        blurHardness: state.blurHardness,
        blurStrength: state.blurStrength,
        smudgeStrength: state.smudgeStrength,
        smudgeSampleAllLayers: state.smudgeSampleAllLayers,
        smudgeFingerPainting: state.smudgeFingerPainting,
        spiralCapInside: state.spiralCapInside,
        rectangularGridHorizontalDividers: state.rectangularGridHorizontalDividers,
        rectangularGridVerticalDividers: state.rectangularGridVerticalDividers,
        rectangularGridFrame: state.rectangularGridFrame,
        polarGridConcentricDividers: state.polarGridConcentricDividers,
        polarGridRadialDividers: state.polarGridRadialDividers,
        polarGridCompoundRings: state.polarGridCompoundRings,
        starPoints: state.starPoints,
        arrowDirection: state.arrowDirection,
        arrowHeadAngle: state.arrowHeadAngle,
        cornerRadius: state.cornerRadius,
        adjustAllCorners: state.adjustAllCorners,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        fontBold: state.fontBold,
        fontItalic: state.fontItalic,
        zoom: state.zoom,
        layersPanel: controller.layerPanel ? { ...controller.layerPanel.state, expandedIds: [...controller.layerPanel.expandedIds], selectedIds: [...controller.documentStore.selectedIds] } : (tab.imageEditorState?.layersPanel || { mode: "expanded", height: 360, placementMode: "new", expandedIds: [], selectedIds: [] })
      };
      tab.imageEditorSource = {
        ...(tab.imageEditorSource || {}),
        mimeType: state.mimeType,
        width: state.width,
        height: state.height
      };
      const commandState = state.getCommandState(history, selection);
      if (state.tool === "move" && controller.documentStore.selectedIds.size) {
        commandState.canCut = commandState.canCopy = commandState.canDelete = true;
      }
      view.update(state, commandState);
      deps.onImageEditorStateChanged?.(tab);
    }

    function commitTransaction(controller, before) {
      const after = snapshot(controller.view);
      const documentBefore = controller.documentStore.snapshot();
      const layers = controller.documentStore.selectedContentLayers({ editableOnly: true });
      let changed = false;
      layers.forEach((layer) => {
        if (applyPresentationEditsToLayer(controller, layer, before, after)) changed = true;
      });
      if (!changed) {
        if (before?.width !== after.width || before?.height !== after.height) {
          controller.state.markChanged();
          renderLayeredDocument(controller);
          syncTab(controller);
          return true;
        }
        return false;
      }
      controller.history.push(documentBefore, controller.documentStore.snapshot(), controller.state.tool);
      controller.state.markChanged();
      renderLayeredDocument(controller);
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
      if (selection.inverted) {
        view.overlayContext.save();
        view.overlayContext.setLineDash([5, 4]);
        view.overlayContext.lineWidth = 1;
        view.overlayContext.strokeStyle = "#1473e6";
        view.overlayContext.strokeRect(0.5, 0.5, view.overlay.width - 1, view.overlay.height - 1);
        view.overlayContext.restore();
      }
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

    /** Provide pixel-marquee lifting with only the explicitly selected editable layers. */
    function pixelSelectionSourceContext(controller) {
      const layers = controller.documentStore.selectedContentLayers({ editableOnly: true });
      return controller.compositor.renderLayers(layers).getContext("2d", { willReadFrequently: true });
    }

    /** Synchronize pixel-marquee editing with the topmost object under its starting point. */
    function selectPixelEditingObjectAtPoint(controller, point) {
      const objectId = controller.objectSelection.hitTest(point);
      if (!objectId) return false;
      controller.documentStore.select(objectId);
      return true;
    }

    function selectedDocumentObjects(controller) {
      const objects = [];
      const seen = new Set();
      const includeLayer = (layer) => (layer.objects || []).forEach((object) => {
        if (!seen.has(object.id)) { seen.add(object.id); objects.push(object); }
      });
      controller.documentStore.selectedIds.forEach((id) => {
        const object = namespace.findDocumentObject(controller.documentStore.document, id)?.object;
        if (object) {
          if (!seen.has(object.id)) { seen.add(object.id); objects.push(object); }
          return;
        }
        const node = namespace.findDocumentNode(controller.documentStore.document, id)?.node;
        if (!node) return;
        if (node.kind === "layer") includeLayer(node);
        else namespace.walkDocumentNodes({ nodes: node.children || [] }, (child) => { if (child.kind === "layer") includeLayer(child); });
      });
      return objects;
    }

    function objectDisplayBounds(object) {
      const bounds = object.bounds || {};
      const transform = object.transform || {};
      return {
        x: Number(transform.x ?? bounds.x) || 0,
        y: Number(transform.y ?? bounds.y) || 0,
        width: Math.max(1, Math.abs((Number(bounds.width) || 1) * (Number(transform.scaleX) || 1))),
        height: Math.max(1, Math.abs((Number(bounds.height) || 1) * (Number(transform.scaleY) || 1)))
      };
    }

    function combinedObjectBounds(objects) {
      if (!objects.length) return null;
      const bounds = objects.map(objectDisplayBounds);
      const left = Math.min(...bounds.map((rect) => rect.x));
      const top = Math.min(...bounds.map((rect) => rect.y));
      const right = Math.max(...bounds.map((rect) => rect.x + rect.width));
      const bottom = Math.max(...bounds.map((rect) => rect.y + rect.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }

    function objectTransformHandleAt(controller, point) {
      const rect = combinedObjectBounds(selectedDocumentObjects(controller));
      if (!rect) return null;
      const zoom = Math.max(0.25, Number(controller.state.zoom) || 1);
      const hitRadius = 7 / zoom;
      const corners = { nw: [rect.x, rect.y], ne: [rect.x + rect.width, rect.y], sw: [rect.x, rect.y + rect.height], se: [rect.x + rect.width, rect.y + rect.height] };
      const distance = (candidate) => Math.hypot(point.x - candidate[0], point.y - candidate[1]);
      for (const [handle, candidate] of Object.entries(corners)) if (distance(candidate) <= hitRadius) return { type: "resize", handle, rect };
      const edges = { n: [rect.x + rect.width / 2, rect.y], e: [rect.x + rect.width, rect.y + rect.height / 2], s: [rect.x + rect.width / 2, rect.y + rect.height], w: [rect.x, rect.y + rect.height / 2] };
      for (const [handle, candidate] of Object.entries(edges)) if (distance(candidate) <= hitRadius) return { type: "resize", handle, rect };
      for (const [handle, candidate] of Object.entries(corners)) {
        const cornerDistance = distance(candidate);
        if (cornerDistance > hitRadius && cornerDistance <= 20 / zoom) return { type: "rotate", handle, rect };
      }
      return null;
    }

    function resizeObjectGesture(controller, gesture, point) {
      const start = gesture.bounds;
      let left = start.x;
      let top = start.y;
      let right = start.x + start.width;
      let bottom = start.y + start.height;
      if (gesture.handle.includes("w")) left = point.x;
      if (gesture.handle.includes("e")) right = point.x;
      if (gesture.handle.includes("n")) top = point.y;
      if (gesture.handle.includes("s")) bottom = point.y;
      if (gesture.handle.length === 2) {
        const anchorX = gesture.handle.includes("w") ? right : left;
        const anchorY = gesture.handle.includes("n") ? bottom : top;
        const scale = Math.max(0.01, Math.max(Math.abs(point.x - anchorX) / Math.max(1, start.width), Math.abs(point.y - anchorY) / Math.max(1, start.height)));
        const width = start.width * scale;
        const height = start.height * scale;
        left = gesture.handle.includes("w") ? anchorX - width : anchorX;
        right = gesture.handle.includes("w") ? anchorX : anchorX + width;
        top = gesture.handle.includes("n") ? anchorY - height : anchorY;
        bottom = gesture.handle.includes("n") ? anchorY : anchorY + height;
      }
      const next = { x: Math.min(left, right), y: Math.min(top, bottom), width: Math.max(1, Math.abs(right - left)), height: Math.max(1, Math.abs(bottom - top)) };
      const scaleX = next.width / Math.max(1, start.width);
      const scaleY = next.height / Math.max(1, start.height);
      selectedDocumentObjects(controller).forEach((object) => {
        const original = gesture.transforms.get(object.id);
        if (!original) return;
        const originalRect = original.displayBounds;
        object.transform.x = next.x + (originalRect.x - start.x) * scaleX;
        object.transform.y = next.y + (originalRect.y - start.y) * scaleY;
        object.transform.scaleX = original.transform.scaleX * scaleX;
        object.transform.scaleY = original.transform.scaleY * scaleY;
      });
    }

    function rotateObjectGesture(controller, gesture, point) {
      const angle = Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x);
      const delta = angle - gesture.startAngle;
      selectedDocumentObjects(controller).forEach((object) => {
        const original = gesture.transforms.get(object.id);
        if (!original) return;
        const objectCenter = { x: original.displayBounds.x + original.displayBounds.width / 2, y: original.displayBounds.y + original.displayBounds.height / 2 };
        const offsetX = objectCenter.x - gesture.center.x;
        const offsetY = objectCenter.y - gesture.center.y;
        const rotatedCenter = { x: gesture.center.x + offsetX * Math.cos(delta) - offsetY * Math.sin(delta), y: gesture.center.y + offsetX * Math.sin(delta) + offsetY * Math.cos(delta) };
        object.transform.x = rotatedCenter.x - original.displayBounds.width / 2;
        object.transform.y = rotatedCenter.y - original.displayBounds.height / 2;
        object.transform.rotation = (Number(original.transform.rotation) || 0) + delta;
      });
    }

    /** Draw object-selection guides only on the presentation overlay. */
    function drawObjectSelectionOverlay(controller, marquee) {
      const { view, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const rect = marquee || combinedObjectBounds(selectedDocumentObjects(controller));
      if (!rect) return;
      const zoom = Math.max(0.25, Number(state.zoom) || 1);
      const guideSize = 6 / zoom;
      const points = [
        [rect.x, rect.y], [rect.x + rect.width / 2, rect.y], [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height / 2], [rect.x + rect.width, rect.y + rect.height / 2],
        [rect.x, rect.y + rect.height], [rect.x + rect.width / 2, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]
      ];
      view.overlayContext.save();
      view.overlayContext.setLineDash([4 / zoom, 3 / zoom]);
      view.overlayContext.lineWidth = 1 / zoom;
      view.overlayContext.strokeStyle = "#1473e6";
      view.overlayContext.strokeRect(rect.x, rect.y, rect.width, rect.height);
      if (!marquee) {
        view.overlayContext.setLineDash([]);
        points.forEach(([x, y]) => {
          view.overlayContext.fillStyle = "#ffffff";
          view.overlayContext.fillRect(x - guideSize / 2, y - guideSize / 2, guideSize, guideSize);
          view.overlayContext.strokeRect(x - guideSize / 2, y - guideSize / 2, guideSize, guideSize);
        });
      }
      view.overlayContext.restore();
    }

    function commitSelection(controller) {
      if (!controller.selection.floating) return false;
      const { selection } = controller;
      const before = controller.pixelSelectionDocumentBefore || controller.documentStore.snapshot();
      controller.pixelSelectionDocumentBefore = null;
      if (controller.pendingContentDescriptor) {
        const layer = selectedPlacementLayer(controller, controller.pendingContentDescriptor.name || "Shape");
        const object = namespace.ImageEditorToolContentAdapter.createShapeObject(controller.documentStore, selection.imageData, selection.rect, controller.pendingContentDescriptor, { name: controller.pendingContentDescriptor.name || "Shape", rotation: selection.rotation });
        controller.documentStore.addObject(object, layer.id);
      } else if (selection.origin === "paste") {
        const layer = selectedPlacementLayer(controller, "Pasted image");
        controller.documentStore.addRasterObject(selection.imageData, selection.rect, { name: "Pasted image", rotation: selection.rotation, layerId: layer.id });
      } else {
        const layer = controller.documentStore.activeLayer();
        namespace.ImageEditorObjectPixelEditor.applySelectionPatchToLayerObject(controller.documentStore, layer, selection.imageData, selection.rect, selection.rotation);
      }
      controller.pendingContentDescriptor = null;
      controller.selectionBefore = null;
      selection.clear();
      drawSelectionOverlay(controller);
      controller.history.push(before, controller.documentStore.snapshot(), "Place content");
      controller.state.markChanged();
      renderLayeredDocument(controller);
      syncTab(controller);
      return true;
    }

    function fillSelectedLayers(controller, point, mode) {
      const layers = controller.documentStore.selectedContentLayers({ editableOnly: true });
      if (!layers.length) return false;
      const before = controller.documentStore.snapshot();
      const changedLayers = layers.filter((layer) => {
        const objectFill = namespace.ImageEditorObjectPixelEditor.fillLayerObjectAtPoint(controller.documentStore, layer, point, controller.state, mode);
        if (objectFill.handled) return objectFill.changed;
        const canvas = controller.compositor.renderLayer(layer);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const layerBefore = context.getImageData(0, 0, canvas.width, canvas.height);
        const changed = mode === "pattern" ? namespace.patternFill(context, point, controller.state) : namespace.floodFill(context, point, controller.state);
        if (changed) appendLayerPixelEdit(controller, layer, changedPixelOverlay(layerBefore, context.getImageData(0, 0, canvas.width, canvas.height)));
        return changed;
      });
      if (!changedLayers.length) return false;
      controller.documentStore.notify({ type: "fill-layer", ids: changedLayers.map((layer) => layer.id) });
      controller.history.push(before, controller.documentStore.snapshot(), "Bucket fill");
      controller.state.markChanged();
      renderLayeredDocument(controller);
      syncTab(controller);
      return true;
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
      controller.pixelSelectionDocumentBefore = controller.documentStore.snapshot();
      const descriptor = layer.descriptor || {
        tool: controller.state.tool,
        geometry: null,
        style: namespace.captureImageEditorToolStyle(controller.state)
      };
      controller.pendingContentDescriptor = {
        ...descriptor,
        name: descriptor.name || namespace.imageEditorToolContentName(descriptor.tool)
      };
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

    function renderPathPreview(controller) {
      const { view, pathTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      pathTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditablePath(controller) {
      controller.pathTool.reset();
      controller.pathBefore = null;
      controller.dragging = false;
      controller.view.overlay.style.cursor = "crosshair";
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditablePath(controller) {
      const { pathTool, state, view } = controller;
      if (!pathTool.isEditing || !pathTool.model) {
        cancelEditablePath(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = pathTool.rasterize(state, state);
      const before = controller.pathBefore;
      pathTool.reset();
      controller.pathBefore = null;
      controller.dragging = false;
      view.overlay.style.cursor = "crosshair";
      return floatGeneratedLayer(controller, layer, before);
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

    function renderPolygonPreview(controller) {
      const { view, polygonTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      polygonTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditablePolygon(controller) {
      controller.polygonTool.reset();
      controller.polygonPoints = [];
      controller.gestureBefore = null;
      controller.dragging = false;
      controller.view.overlay.style.cursor = "crosshair";
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditablePolygon(controller) {
      const { polygonTool, state, view } = controller;
      if (!polygonTool.isEditing || !polygonTool.model) {
        cancelEditablePolygon(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = polygonTool.rasterize(state, state);
      const before = controller.gestureBefore;
      polygonTool.reset();
      controller.polygonPoints = [];
      controller.gestureBefore = null;
      controller.dragging = false;
      view.overlay.style.cursor = "crosshair";
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderStarPreview(controller) {
      const { view, starTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      starTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableStar(controller) {
      controller.starTool.reset();
      controller.starBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableStar(controller) {
      const { starTool, state, view } = controller;
      if (!starTool.isEditing || !starTool.model) {
        cancelEditableStar(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = starTool.rasterize(state, state);
      const before = controller.starBefore;
      starTool.reset();
      controller.starBefore = null;
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

    function renderSpiralPreview(controller) {
      const { view, spiralTool, state } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      spiralTool.drawPreview(view.overlayContext, state);
    }

    function cancelEditableSpiral(controller) {
      controller.spiralTool.reset();
      controller.spiralBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableSpiral(controller) {
      const { spiralTool, state, view } = controller;
      if (!spiralTool.isEditing || !spiralTool.model) {
        cancelEditableSpiral(controller);
        return false;
      }
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      const layer = spiralTool.rasterize(state, state);
      const before = controller.spiralBefore;
      spiralTool.reset();
      controller.spiralBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function isGridTool(tool) {
      return tool === "rectangular-grid" || tool === "polar-grid";
    }

    function gridToolFor(controller, tool = controller.state.tool) {
      return tool === "polar-grid" ? controller.polarGridTool : controller.rectangularGridTool;
    }

    function renderGridPreview(controller) {
      const tool = gridToolFor(controller);
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      tool.drawPreview(controller.view.overlayContext, controller.state);
    }

    function cancelEditableGrid(controller) {
      const tool = gridToolFor(controller);
      tool.reset();
      controller.gridBefore = null;
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishEditableGrid(controller) {
      const tool = gridToolFor(controller);
      if (!tool.isEditing || !tool.rect) {
        cancelEditableGrid(controller);
        return false;
      }
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      const layer = tool.rasterize(controller.state, controller.state);
      const before = controller.gridBefore;
      tool.reset();
      controller.gridBefore = null;
      controller.dragging = false;
      return floatGeneratedLayer(controller, layer, before);
    }

    function renderGradientFill(controller) {
      const { gradientFillTool, view, state } = controller;
      if (!gradientFillTool.isEditing) return;
      gradientFillTool.paint(view.context);
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      gradientFillTool.drawGuides(view.overlayContext, state.zoom);
    }

    function cancelGradientFill(controller) {
      if (controller.gradientBefore) restoreSnapshot(controller, controller.gradientBefore);
      controller.gradientFillTool.reset();
      controller.gradientBefore = null;
      controller.activeGradientColorSide = "";
      controller.dragging = false;
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      syncTab(controller);
    }

    function finishGradientFill(controller) {
      if (!controller.gradientFillTool.isEditing) return false;
      controller.gradientFillTool.paint(controller.view.context);
      controller.view.overlayContext.clearRect(0, 0, controller.view.overlay.width, controller.view.overlay.height);
      const before = controller.gradientBefore;
      controller.gradientFillTool.reset();
      controller.gradientBefore = null;
      controller.activeGradientColorSide = "";
      controller.dragging = false;
      return commitTransaction(controller, before);
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
      if (!hasFloatingSelection && !editableTextRect && !controller.compositor) return view.canvas;
      const composite = controller.compositor ? controller.compositor.render() : document.createElement("canvas");
      if (!controller.compositor) {
        composite.width = view.canvas.width;
        composite.height = view.canvas.height;
      }
      const context = composite.getContext("2d");
      if (!controller.compositor) context.drawImage(view.canvas, 0, 0);
      if (hasFloatingSelection) selection.drawFloatingLayer(context);
      if (editableTextRect) namespace.drawText(context, editableTextRect, editableText, state);
      return composite;
    }

    /** Build an isolated document snapshot that includes provisional content for session recovery. */
    function createDraftDocumentStore(controller) {
      const snapshot = controller.documentStore.snapshot();
      const draftStore = new namespace.ImageEditorDocumentStore(snapshot.document, snapshot.assets);
      draftStore.selectedIds = new Set(snapshot.selectedIds);
      const { selection, view, state } = controller;
      if (selection.floating && selection.imageData && selection.rect) {
        draftStore.addRasterObject(selection.imageData, { ...selection.rect }, {
          name: selection.origin === "paste" ? "Pasted image" : "Floating content",
          rotation: selection.rotation || 0
        });
      }
      const editableText = view.textInput.hidden ? "" : view.textInput.value;
      const editableTextRect = editableText
        ? (view.getTextContentRect() || view.getTextInputRect() || controller.textRect)
        : null;
      if (editableTextRect) {
        draftStore.addObject(namespace.createContentObject("text", {
          text: editableText,
          box: { width: editableTextRect.width, height: editableTextRect.height },
          font: state.fontFamily,
          size: state.fontSize,
          bold: state.fontBold,
          italic: state.fontItalic,
          color: state.foregroundColor
        }, {
          name: "Text",
          bounds: { ...editableTextRect },
          transform: { x: editableTextRect.x, y: editableTextRect.y, scaleX: 1, scaleY: 1, rotation: 0 }
        }));
      }
      return draftStore;
    }

    /** Encode visible canvas layers without committing floating pixels or editable text. */
    function encodeCompositeCanvas(controller, mimeType) {
      return namespace.encodeCanvas(createCompositeCanvas(controller), mimeType, controller.state.backgroundColor);
    }

    async function copySelectionToClipboard(controller) {
      const data = controller.selection.copy(pixelSelectionSourceContext(controller));
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

    async function copyObjectSelectionToClipboard(controller) {
      const objects = selectedDocumentObjects(controller);
      const bounds = combinedObjectBounds(objects);
      if (!objects.length || !bounds) return false;
      const layeredDocument = namespace.createImageDocument(controller.documentStore.document.canvas.width, controller.documentStore.document.canvas.height, "transparent");
      layeredDocument.nodes[0].objects = objects.map((object) => namespace.cloneImageDocument(object));
      const store = new namespace.ImageEditorDocumentStore(layeredDocument, controller.documentStore.assets);
      const rendered = new namespace.ImageEditorCompositor(store).render();
      const crop = document.createElement("canvas");
      crop.width = Math.max(1, Math.ceil(bounds.width));
      crop.height = Math.max(1, Math.ceil(bounds.height));
      crop.getContext("2d").drawImage(rendered, -bounds.x, -bounds.y);
      controller.selection.internalClipboard = crop.getContext("2d").getImageData(0, 0, crop.width, crop.height);
      if (global.ClipboardItem && global.navigator?.clipboard?.write) {
        try {
          const blob = await namespace.encodeCanvas(crop, "image/png", "#ffffff");
          await global.navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch (_error) {
          // The internal clipboard remains available when system permission is denied.
        }
      }
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
      if (controller.polygonTool?.isEditing) renderPolygonPreview(controller);
      if (controller.starTool?.isEditing) renderStarPreview(controller);
      if (controller.ellipseTool?.isEditing) renderEllipsePreview(controller);
      if (controller.arcTool?.isEditing) renderArcPreview(controller);
      if (controller.spiralTool?.isEditing) renderSpiralPreview(controller);
      if (controller.pathTool?.isEditing) renderPathPreview(controller);
      if (isGridTool(controller.state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
      if (controller.gradientFillTool?.isEditing) renderGradientFill(controller);
      syncTab(controller);
      return controller.state.zoom;
    }

    async function runAction(controller, action) {
      const { view, state, history, selection } = controller;
      if (action === "undo" || action === "redo") {
        selection.clear();
        const next = action === "undo" ? history.undo() : history.redo();
        if (next) {
          controller.documentStore.restore(next);
          renderLayeredDocument(controller);
          state.setDirty(history.isAtSavedState !== true);
          syncTab(controller);
        }
        return;
      }
      if (action === "zoom-in" || action === "zoom-out") {
        applyZoom(controller, state.zoom * (action === "zoom-in" ? 1.25 : 0.8));
        return;
      }
      if (state.tool === "move" && !selection.floating && selectedDocumentObjects(controller).length) {
        if (action === "copy") return copyObjectSelectionToClipboard(controller);
        if (action === "cut") await copyObjectSelectionToClipboard(controller);
        if (action === "cut" || action === "delete") return commitDocumentMutation(controller, action === "cut" ? "Cut objects" : "Delete objects", () => controller.documentStore.deleteSelected());
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
        controller.pixelSelectionDocumentBefore = controller.documentStore.snapshot();
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
      const rect = { ...selection.rect };
      const regions = selection.inverted
        ? namespace.imageEditorInverseSelectionRects(rect, { width: view.canvas.width, height: view.canvas.height })
        : [rect];
      const documentBefore = controller.documentStore.snapshot();
      if (action === "cut") {
        await copySelectionToClipboard(controller);
        selection.clear();
      } else if (action === "delete") {
        selection.clear();
      }
      let changed = false;
      if (action === "cut" || action === "delete") {
        regions.forEach((region) => {
          if (clearPixelRegionFromSelectedLayers(controller, region)) changed = true;
        });
      }
      drawSelectionOverlay(controller);
      if (changed) {
        controller.history.push(documentBefore, controller.documentStore.snapshot(), action === "cut" ? "Cut pixels" : "Delete pixels");
        state.markChanged();
        renderLayeredDocument(controller);
      }
      syncTab(controller);
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
      if (!text) { controller.editingTextObjectId = null; return false; }
      const before = controller.documentStore.snapshot();
      const editing = controller.editingTextObjectId ? namespace.findDocumentObject(controller.documentStore.document, controller.editingTextObjectId) : null;
      controller.editingTextObjectId = null;
      if (editing?.object?.type === "text") {
        editing.object.payload = {
          ...editing.object.payload,
          text,
          box: { ...textRect },
          style: { fontFamily: controller.state.fontFamily, fontSize: controller.state.fontSize, fontBold: controller.state.fontBold, fontItalic: controller.state.fontItalic, foregroundColor: controller.state.foregroundColor }
        };
        editing.object.bounds = { ...textRect };
        editing.object.transform = { ...editing.object.transform, x: textRect.x, y: textRect.y, scaleX: 1, scaleY: 1 };
        controller.documentStore.notify({ type: "update-text", ids: [editing.object.id] });
        controller.history.push(before, controller.documentStore.snapshot(), "Edit text");
        controller.state.markChanged();
        renderLayeredDocument(controller);
        syncTab(controller);
        return true;
      }
      const layer = selectedPlacementLayer(controller, "Text");
      const object = namespace.createContentObject("text", {
        text, box: { ...textRect },
        style: { fontFamily: controller.state.fontFamily, fontSize: controller.state.fontSize, fontBold: controller.state.fontBold, fontItalic: controller.state.fontItalic, foregroundColor: controller.state.foregroundColor }
      }, { name: "Text", bounds: { ...textRect }, transform: { x: textRect.x, y: textRect.y, scaleX: 1, scaleY: 1, rotation: 0 } });
      controller.documentStore.addObject(object, layer.id);
      controller.history.push(before, controller.documentStore.snapshot(), "Text");
      controller.state.markChanged();
      renderLayeredDocument(controller);
      syncTab(controller);
      return true;
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
        if (controller.polygonTool.isEditing) renderPolygonPreview(controller);
        if (controller.starTool.isEditing) renderStarPreview(controller);
      if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
      if (controller.arcTool.isEditing) renderArcPreview(controller);
      if (controller.spiralTool.isEditing) renderSpiralPreview(controller);
      if (controller.pathTool.isEditing) renderPathPreview(controller);
      if (isGridTool(controller.state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
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
      const handleToolbarClick = (event) => {
        if (event.target.closest("[data-layers-toggle]")) {
          controller.layerPanel?.toggle();
          syncTab(controller);
          return;
        }
        const bucketModeButton = event.target.closest("[data-bucket-mode]");
        if (bucketModeButton) {
          if (controller.gradientFillTool.isEditing) finishGradientFill(controller);
          state.bucketFillMode = ["gradient", "pattern"].includes(bucketModeButton.dataset.bucketMode) ? bucketModeButton.dataset.bucketMode : "solid";
          state.setTool("bucket");
          view.shell.querySelector(".image-editor-bucket-mode").open = false;
          syncTab(controller);
          return;
        }
        const brushTypeButton = event.target.closest("[data-brush-type]");
        if (brushTypeButton) {
          state.brushType = namespace.normalizeBrushPreset(brushTypeButton.dataset.brushType);
          state.setTool("brush");
          view.shell.querySelector(".image-editor-brush-mode").open = false;
          syncTab(controller);
          return;
        }
        const selectionShapeButton = event.target.closest("[data-selection-shape]");
        if (selectionShapeButton) {
          state.selectionShape = namespace.ImageEditorSelectionShapes.normalize(selectionShapeButton.dataset.selectionShape);
          state.setTool("select");
          view.shell.querySelector(".image-editor-select-mode").open = false;
          syncTab(controller);
          return;
        }
        const toolButton = event.target.closest("[data-tool]");
        if (toolButton) {
          if (controller.gradientFillTool.isEditing) finishGradientFill(controller);
          if (state.tool === "curve" && controller.curveTool.isEditing) finishEditableCurve(controller);
          if (state.tool === "path" && controller.pathTool.isEditing) finishEditablePath(controller);
          if (state.tool === "rounded-rectangle" && controller.roundedRectangleTool.isEditing) finishEditableRoundedRectangle(controller);
          if (isCalloutTool(state.tool) && editingCalloutTool(controller)) finishEditableCallout(controller);
          if (state.tool === "heart" && controller.heartTool.isEditing) finishEditableHeart(controller);
          if (state.tool === "triangle" && controller.triangleTool.isEditing) finishEditableTriangle(controller);
          if (state.tool === "polygon" && controller.polygonTool.isEditing) finishEditablePolygon(controller);
          if (state.tool === "star" && controller.starTool.isEditing) finishEditableStar(controller);
          if (state.tool === "ellipse" && controller.ellipseTool.isEditing) finishEditableEllipse(controller);
          if (state.tool === "arc" && controller.arcTool.isEditing) finishEditableArc(controller);
          if (state.tool === "spiral" && controller.spiralTool.isEditing) finishEditableSpiral(controller);
          if (isGridTool(state.tool) && gridToolFor(controller).isEditing) finishEditableGrid(controller);
          commitText(controller);
          if (toolButton.dataset.tool !== "select") dropSelection(controller);
          state.setTool(toolButton.dataset.tool);
          toolButton.closest(".image-editor-grouped-tool-mode")?.removeAttribute("open");
          if (state.tool === "move") drawObjectSelectionOverlay(controller);
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
      };
      view.toolbar.addEventListener("click", handleToolbarClick);
      view.toolSidebar.addEventListener("click", handleToolbarClick);
      [["foreground", ".image-editor-foreground"], ["background", ".image-editor-background"]].forEach(([target, selector]) => {
        const input = view.shell.querySelector(selector);
        input.addEventListener("pointerdown", () => view.setActiveColorTarget(target, state));
        input.addEventListener("focus", () => view.setActiveColorTarget(target, state));
        input.addEventListener("input", (event) => applyToolbarColor(controller, target, event.target.value));
      });
      view.shell.querySelector(".image-editor-gradient-side-color").addEventListener("input", (event) => {
        const side = controller.activeGradientColorSide;
        if (!side || !controller.gradientFillTool.isEditing) return;
        controller.gradientFillTool.setColor(side, event.target.value);
        if (side === "start") state.gradientStartColor = event.target.value;
        else state.gradientEndColor = event.target.value;
        renderGradientFill(controller);
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-pattern-fill-type").addEventListener("change", (event) => {
        if (!namespace.patternFillTypes.includes(event.target.value)) return;
        state.patternFillType = event.target.value;
        syncTab(controller);
      });
      [
        [".image-editor-pattern-scale", "patternScale", 4, 64],
        [".image-editor-pattern-angle", "patternAngle", 0, 180],
        [".image-editor-pattern-density", "patternDensity", 10, 90]
      ].forEach(([selector, property, minimum, maximum]) => {
        view.shell.querySelector(selector).addEventListener("input", (event) => {
          state[property] = Math.max(minimum, Math.min(maximum, Number(event.target.value)));
          syncTab(controller);
        });
      });
      view.shell.querySelector(".image-editor-size").addEventListener("input", (event) => {
        state.brushSize = state.lineWidth = Number(event.target.value);
        if (controller.curveTool.isEditing) renderCurvePreview(controller);
        if (controller.pathTool.isEditing) renderPathPreview(controller);
        if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
        if (editingCalloutTool(controller)) renderCalloutPreview(controller);
        if (controller.heartTool.isEditing) renderHeartPreview(controller);
        if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
        if (controller.polygonTool.isEditing) renderPolygonPreview(controller);
        if (controller.starTool.isEditing) renderStarPreview(controller);
        if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
        if (controller.arcTool.isEditing) renderArcPreview(controller);
        if (controller.spiralTool.isEditing) renderSpiralPreview(controller);
        if (isGridTool(state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
      });
      view.shell.querySelector(".image-editor-clone-stamp-hardness").addEventListener("input", (event) => {
        state.cloneStampHardness = Math.max(0, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-clone-stamp-opacity").addEventListener("input", (event) => {
        state.cloneStampOpacity = Math.max(1, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-clone-stamp-aligned").addEventListener("change", (event) => {
        state.cloneStampAligned = event.target.checked;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-clone-stamp-sample").addEventListener("change", (event) => {
        state.cloneStampSample = event.target.value === "all" ? "all" : "current";
        syncTab(controller);
      });
      namespace.bindStrokeTypeSelector(view.shell.querySelector(".image-editor-stroke-type"), (strokeType) => {
        state.strokeType = strokeType;
        if (controller.curveTool.isEditing) renderCurvePreview(controller);
        if (controller.pathTool.isEditing) renderPathPreview(controller);
        if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
        if (editingCalloutTool(controller)) renderCalloutPreview(controller);
        if (controller.heartTool.isEditing) renderHeartPreview(controller);
        if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
        if (controller.polygonTool.isEditing) renderPolygonPreview(controller);
        if (controller.starTool.isEditing) renderStarPreview(controller);
        if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
        if (controller.arcTool.isEditing) renderArcPreview(controller);
        if (controller.spiralTool.isEditing) renderSpiralPreview(controller);
        if (isGridTool(state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
      });
      view.shell.querySelector(".image-editor-eraser-hardness").addEventListener("input", (event) => {
        state.eraserHardness = Math.max(0, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-blur-hardness").addEventListener("input", (event) => {
        state.blurHardness = Math.max(0, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-blur-strength").addEventListener("input", (event) => {
        state.blurStrength = Math.max(1, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-smudge-hardness").addEventListener("input", (event) => {
        state.smudgeHardness = Math.max(0, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-smudge-strength").addEventListener("input", (event) => {
        state.smudgeStrength = Math.max(1, Math.min(100, Number(event.target.value)));
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-smudge-sample-all").addEventListener("change", (event) => {
        state.smudgeSampleAllLayers = event.target.checked;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-smudge-finger-painting").addEventListener("change", (event) => {
        state.smudgeFingerPainting = event.target.checked;
        syncTab(controller);
      });
      view.shell.querySelector(".image-editor-spiral-direction").addEventListener("change", (event) => {
        state.spiralDirection = event.target.value === "counter-clockwise" ? "counter-clockwise" : "clockwise";
        controller.spiralTool.setDirection(state.spiralDirection);
        if (controller.spiralTool.isEditing) renderSpiralPreview(controller);
      });
      view.shell.querySelector(".image-editor-spiral-cap-inside").addEventListener("change", (event) => {
        state.spiralCapInside = event.target.checked;
        if (controller.spiralTool.isEditing) renderSpiralPreview(controller);
      });
      view.shell.querySelector(".image-editor-spiral-convert").addEventListener("click", (event) => {
        event.preventDefault();
        finishEditableSpiral(controller);
      });
      [
        [".image-editor-rectangular-grid-horizontal", "rectangularGridHorizontalDividers"],
        [".image-editor-rectangular-grid-vertical", "rectangularGridVerticalDividers"],
        [".image-editor-polar-grid-concentric", "polarGridConcentricDividers"],
        [".image-editor-polar-grid-radial", "polarGridRadialDividers"]
      ].forEach(([selector, property]) => {
        view.shell.querySelector(selector).addEventListener("input", (event) => {
          state[property] = Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)));
          if (isGridTool(state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
        });
      });
      view.shell.querySelector(".image-editor-rectangular-grid-frame").addEventListener("change", (event) => {
        state.rectangularGridFrame = event.target.checked;
        if (state.tool === "rectangular-grid" && controller.rectangularGridTool.isEditing) renderGridPreview(controller);
      });
      view.shell.querySelector(".image-editor-polar-grid-compound").addEventListener("change", (event) => {
        state.polarGridCompoundRings = event.target.checked;
        if (state.tool === "polar-grid" && controller.polarGridTool.isEditing) renderGridPreview(controller);
      });
      view.shell.querySelector(".image-editor-fill").addEventListener("change", (event) => {
        state.fillShapes = event.target.checked;
        if (controller.pathTool.isEditing) renderPathPreview(controller);
        if (controller.roundedRectangleTool.isEditing) renderRoundedRectanglePreview(controller);
        if (editingCalloutTool(controller)) renderCalloutPreview(controller);
        if (controller.heartTool.isEditing) renderHeartPreview(controller);
        if (controller.triangleTool.isEditing) renderTrianglePreview(controller);
        if (controller.polygonTool.isEditing) renderPolygonPreview(controller);
        if (controller.starTool.isEditing) renderStarPreview(controller);
        if (controller.ellipseTool.isEditing) renderEllipsePreview(controller);
        if (controller.arcTool.isEditing) renderArcPreview(controller);
        if (isGridTool(state.tool) && gridToolFor(controller).isEditing) renderGridPreview(controller);
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
        if (controller.starTool.setPointCount(starPoints)) renderStarPreview(controller);
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
      const layer = controller.documentStore.activeLayer();
      if (!layer || layer.locked || !layer.visible) return false;
      const changed = namespace.ImageEditorObjectPixelEditor.applySelectionPatchToLayerObject(controller.documentStore, layer, selection.imageData, selection.rect, selection.rotation);
      if (changed) renderLayeredDocument(controller);
      return changed;
    }

    function clearPixelRegionFromSelectedLayers(controller, rect) {
      if (!rect) return false;
      let changed = false;
      controller.documentStore.selectedContentLayers({ editableOnly: true }).forEach((layer) => {
        if (namespace.ImageEditorObjectPixelEditor.eraseLayerRegion(controller.documentStore, layer, rect)) changed = true;
      });
      return changed;
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
        const adoptedLegacyPixels = synchronizePresentationCanvas(controller);
        if (adoptedLegacyPixels && state.tool === "select") state.selectionMode = "pixel";
        const point = view.pointFromEvent(event);
        if (state.tool === "clone-stamp") {
          event.preventDefault();
          event.stopPropagation();
          if (event.altKey) {
            controller.cloneStampTool.setSource(point);
            drawCloneStampOverlay(controller, point);
            return;
          }
          const layer = cloneStampTargetLayer(controller);
          if (!layer || !controller.cloneStampTool.sourcePoint) {
            drawCloneStampOverlay(controller, point);
            return;
          }
          commitText(controller);
          commitSelection(controller);
          controller.cloneStampBefore = controller.documentStore.snapshot();
          controller.cloneStampLayerId = layer.id;
          const sourceCanvas = state.cloneStampSample === "all"
            ? controller.compositor.render()
            : controller.compositor.renderLayer(layer);
          if (!controller.cloneStampTool.begin(point, sourceCanvas, {
            size: state.brushSize,
            hardness: state.cloneStampHardness / 100,
            opacity: state.cloneStampOpacity / 100,
            aligned: state.cloneStampAligned
          })) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderCloneStampPreview(controller, point);
          return;
        }
        if (state.tool === "eraser") {
          event.preventDefault();
          event.stopPropagation();
          const layer = selectedPixelToolLayer(controller);
          if (!layer) {
            drawEraserOverlay(controller, point);
            return;
          }
          commitText(controller);
          commitSelection(controller);
          controller.eraserBefore = controller.documentStore.snapshot();
          controller.eraserLayerId = layer.id;
          if (!controller.eraserTool.begin(point, view.canvas.width, view.canvas.height, {
            size: state.brushSize, hardness: state.eraserHardness / 100
          })) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          drawEraserOverlay(controller, point);
          return;
        }
        if (state.tool === "blur") {
          event.preventDefault();
          event.stopPropagation();
          const layer = selectedPixelToolLayer(controller);
          if (!layer) {
            drawBlurOverlay(controller, point);
            return;
          }
          commitText(controller);
          commitSelection(controller);
          controller.blurBefore = controller.documentStore.snapshot();
          controller.blurLayerId = layer.id;
          const targetCanvas = controller.compositor.renderLayer(layer);
          controller.blurLayerBefore = targetCanvas.getContext("2d").getImageData(0, 0, targetCanvas.width, targetCanvas.height);
          if (!controller.blurTool.begin(point, targetCanvas, {
            size: state.brushSize,
            hardness: state.blurHardness / 100,
            strength: state.blurStrength / 100
          })) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderBlurPreview(controller, point);
          return;
        }
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
        if (state.tool === "smudge") {
          event.preventDefault();
          event.stopPropagation();
          const layer = selectedPixelToolLayer(controller);
          if (!layer) {
            drawSmudgeOverlay(controller, point);
            return;
          }
          commitText(controller);
          commitSelection(controller);
          controller.smudgeBefore = controller.documentStore.snapshot();
          controller.smudgeLayerId = layer.id;
          const targetCanvas = controller.compositor.renderLayer(layer);
          const sourceCanvas = state.smudgeSampleAllLayers ? controller.compositor.render() : targetCanvas;
          controller.smudgeLayerBefore = targetCanvas.getContext("2d").getImageData(0, 0, targetCanvas.width, targetCanvas.height);
          const fingerColor = state.smudgeFingerPainting ? namespace.colorToRgba(state.foregroundColor) : null;
          if (!controller.smudgeTool.begin(point, targetCanvas, sourceCanvas, {
            size: state.brushSize,
            hardness: state.smudgeHardness / 100,
            strength: state.smudgeStrength / 100,
            fingerColor
          })) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderSmudgePreview(controller, point);
          return;
        }
        if (state.tool === "path") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.pathTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.pathBefore = snapshot(view);
          }
          const result = controller.pathTool.begin(point, state);
          if (result.action === "outside") {
            finishEditablePath(controller);
            return;
          }
          if (result.action === "closed") {
            renderPathPreview(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderPathPreview(controller);
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
        if (state.tool === "star") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.starTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.starBefore = snapshot(view);
          }
          const result = controller.starTool.begin(point, state.starPoints);
          if (result.action === "outside") {
            finishEditableStar(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderStarPreview(controller);
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
        if (state.tool === "spiral") {
          event.preventDefault();
          event.stopPropagation();
          if (!controller.spiralTool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.spiralBefore = snapshot(view);
          }
          const result = controller.spiralTool.begin(point, state);
          if (result.action === "outside") {
            finishEditableSpiral(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderSpiralPreview(controller);
          return;
        }
        if (isGridTool(state.tool)) {
          event.preventDefault();
          event.stopPropagation();
          const tool = gridToolFor(controller);
          if (!tool.isEditing) {
            commitText(controller);
            commitSelection(controller);
            controller.gridBefore = snapshot(view);
          }
          const result = tool.begin(point);
          if (result.action === "outside") {
            finishEditableGrid(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderGridPreview(controller);
          return;
        }
        if (state.tool === "polygon" && controller.polygonTool.isEditing) {
          event.preventDefault();
          event.stopPropagation();
          const result = controller.polygonTool.begin(point);
          if (result.action === "outside") {
            finishEditablePolygon(controller);
            return;
          }
          if (!result.started) return;
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          renderPolygonPreview(controller);
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
          if (state.bucketFillMode === "gradient") {
            if (controller.gradientFillTool.isEditing) {
              const result = controller.gradientFillTool.begin(point, state.zoom);
              if (result.action === "outside") {
                finishGradientFill(controller);
                return;
              }
              if (result.action === "guide") {
                controller.dragging = true;
                overlay.setPointerCapture?.(event.pointerId);
              }
              return;
            }
            controller.gradientBefore = snapshot(view);
            controller.gradientFillTool.start(view.context, point, state.gradientStartColor, state.gradientEndColor);
            renderGradientFill(controller);
            return;
          }
          if (state.bucketFillMode === "pattern") {
            if (!fillSelectedLayers(controller, point, "pattern")) syncTab(controller);
            return;
          }
          if (!fillSelectedLayers(controller, point, "solid")) syncTab(controller);
          return;
        }        if (state.tool === "polygon") {
          if (!controller.polygonPoints.length) controller.gestureBefore = snapshot(view);
          controller.polygonPoints.push(point);
          namespace.drawPolygon(view.overlayContext, controller.polygonPoints, state, false);
          return;
        }
        if (state.tool === "move" && !selection.floating) {
          event.preventDefault();
          const transformHandle = objectTransformHandleAt(controller, point);
          const existingHit = transformHandle ? null : controller.objectSelection.hitTest(point, { cycle: event.altKey });
          const selectedObjectIds = new Set(selectedDocumentObjects(controller).map((object) => object.id));
          const hit = transformHandle || (existingHit && selectedObjectIds.has(existingHit)
            ? existingHit
            : controller.objectSelection.selectPoint(point, { additive: event.shiftKey, cycle: event.altKey }));
          const objects = selectedDocumentObjects(controller);
          const bounds = combinedObjectBounds(objects);
          controller.objectGesture = {
            mode: transformHandle?.type || (hit ? "move" : "marquee"),
            handle: transformHandle?.handle || "",
            start: point,
            point,
            additive: event.shiftKey,
            before: controller.documentStore.snapshot(),
            bounds,
            center: bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null,
            startAngle: bounds ? Math.atan2(point.y - (bounds.y + bounds.height / 2), point.x - (bounds.x + bounds.width / 2)) : 0,
            transforms: new Map(objects.map((object) => [object.id, { transform: { ...object.transform }, displayBounds: objectDisplayBounds(object) }]))
          };
          controller.dragging = true;
          overlay.setPointerCapture?.(event.pointerId);
          drawObjectSelectionOverlay(controller, hit ? null : { x: point.x, y: point.y, width: 0, height: 0 });
          syncTab(controller);
          return;
        }
        controller.gestureBefore = snapshot(view);
        controller.startPoint = controller.lastPoint = point;
        controller.dragging = true;
        if (state.tool === "pencil" || state.tool === "brush") controller.freehandStrokeDistance = 0;
        if (state.tool === "select") {
          if (selection.hasSelection && !selection.contains(point) && !selection.isPasting) {
            const returnsToDrawingTool = !!selection.returnToolAfterPlacement;
            dropSelection(controller);
            if (returnsToDrawingTool) { controller.dragging = false; return; }
          }
          if (!selection.hasSelection) selectPixelEditingObjectAtPoint(controller, point);
          if (selection.hasSelection && !selection.floating) {
            controller.selectionBefore = snapshot(view);
            controller.pixelSelectionDocumentBefore = controller.documentStore.snapshot();
          }
          const gesture = selection.beginPointerGesture(point, pixelSelectionSourceContext(controller), state.backgroundColor, {
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            shift: event.shiftKey,
            zoom: state.zoom,
            shape: state.selectionShape
          });
          if (gesture.sourceCleared && clearPixelRegionFromSelectedLayers(controller, selection.region())) renderLayeredDocument(controller);
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
        const point = view.pointFromEvent(event, state.tool !== "path" && !selection.isTransforming && state.tool !== "move");
        if (!controller.dragging) {
          if (state.tool === "clone-stamp") {
            overlay.style.cursor = event.altKey ? "crosshair" : "none";
            drawCloneStampOverlay(controller, point);
            return;
          }
          if (state.tool === "move" && !selection.floating) {
            const handle = objectTransformHandleAt(controller, point);
            if (handle?.type === "rotate") overlay.style.cursor = rotationCursor;
            else if (handle?.type === "resize") overlay.style.cursor = handle.handle.length === 2 ? `${handle.handle}-resize` : `${handle.handle}-resize`;
            else overlay.style.cursor = controller.objectSelection.hitTest(point) ? "move" : "crosshair";
            return;
          }
          if (state.tool === "bucket" && controller.gradientFillTool.isEditing) {
            const result = controller.gradientFillTool.begin(point, state.zoom);
            controller.gradientFillTool.end();
            overlay.style.cursor = result.action === "guide" ? "move" : (result.action === "side" ? "crosshair" : "default");
            return;
          }
          if (state.tool === "eraser") {
            overlay.style.cursor = "none";
            drawEraserOverlay(controller, point);
            return;
          }
          if (state.tool === "blur") {
            overlay.style.cursor = "none";
            drawBlurOverlay(controller, point);
            return;
          }
          if (state.tool === "smudge") {
            overlay.style.cursor = "none";
            drawSmudgeOverlay(controller, point);
            return;
          }
          if (state.tool === "polygon" && controller.polygonTool.isEditing) {
            const guide = controller.polygonTool.guideAt(point);
            overlay.style.cursor = guide?.type === "edge" ? "copy" : (guide?.type === "vertex" ? "move" : "crosshair");
            return;
          }
          if (state.tool === "path" && controller.pathTool.isEditing) {
            const guide = controller.pathTool.guideAt(point);
            overlay.style.cursor = guide?.type === "segment" ? "grab" : (guide ? "move" : "crosshair");
            return;
          }
          updateSelectionHoverCursor(controller, point);
          return;
        }
        if (state.tool === "bucket" && controller.gradientFillTool.isEditing) {
          controller.gradientFillTool.update(point);
          renderGradientFill(controller);
          return;
        }
        if (state.tool === "blur") {
          controller.blurTool.update(point);
          renderBlurPreview(controller, point);
          return;
        }
        if (state.tool === "clone-stamp") {
          controller.cloneStampTool.update(point);
          renderCloneStampPreview(controller, point);
          return;
        }
        if (state.tool === "curve") {
          controller.curveTool.update(point);
          renderCurvePreview(controller);
          return;
        }
        if (state.tool === "path") {
          controller.pathTool.update(point, event.shiftKey);
          renderPathPreview(controller);
          return;
        }
        if (state.tool === "rounded-rectangle") {
          controller.roundedRectangleTool.update(point);
          updateRoundedRectangleRadiusControl(controller);
          renderRoundedRectanglePreview(controller);
          return;
        }
        if (state.tool === "eraser") {
          controller.eraserTool.update(point);
          drawEraserOverlay(controller, point);
          return;
        }
        if (state.tool === "smudge") {
          controller.smudgeTool.update(point);
          renderSmudgePreview(controller, point);
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
        if (state.tool === "polygon" && controller.polygonTool.isEditing) {
          controller.polygonTool.update(point);
          renderPolygonPreview(controller);
          return;
        }
        if (state.tool === "star") {
          controller.starTool.update(point);
          renderStarPreview(controller);
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
        if (state.tool === "spiral") {
          controller.spiralTool.update(point);
          renderSpiralPreview(controller);
          return;
        }
        if (isGridTool(state.tool)) {
          gridToolFor(controller).update(point);
          renderGridPreview(controller);
          return;
        }
        if (state.tool === "text" && controller.creatingTextBox) {
          drawTextCreationOverlay(controller, point);
          return;
        }
        if (state.tool === "pencil" || state.tool === "brush") {
          controller.freehandStrokeDistance = namespace.drawFreehand(
            view.context, controller.lastPoint, point, state, state.tool, controller.freehandStrokeDistance
          );
          controller.lastPoint = point;
          return;
        }
        if (state.tool === "move" && controller.objectGesture) {
          const gesture = controller.objectGesture;
          gesture.point = point;
          if (gesture.mode === "move") {
            const deltaX = point.x - gesture.start.x;
            const deltaY = point.y - gesture.start.y;
            selectedDocumentObjects(controller).forEach((object) => {
              const original = gesture.transforms.get(object.id);
              if (!original) return;
              object.transform.x = (Number(original.transform.x ?? object.bounds.x) || 0) + deltaX;
              object.transform.y = (Number(original.transform.y ?? object.bounds.y) || 0) + deltaY;
            });
            renderLayeredDocument(controller);
            drawObjectSelectionOverlay(controller);
          } else if (gesture.mode === "resize") {
            resizeObjectGesture(controller, gesture, point);
            renderLayeredDocument(controller);
            drawObjectSelectionOverlay(controller);
          } else if (gesture.mode === "rotate") {
            rotateObjectGesture(controller, gesture, point);
            renderLayeredDocument(controller);
            drawObjectSelectionOverlay(controller);
          } else drawObjectSelectionOverlay(controller, view.rectFromPoints(gesture.start, point));
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
        const point = view.pointFromEvent(event, state.tool !== "path" && state.tool !== "move");
        if (state.tool === "clone-stamp") {
          const pixels = controller.cloneStampTool.finish();
          const found = namespace.findDocumentNode(controller.documentStore.document, controller.cloneStampLayerId);
          if (pixels && found?.node?.kind === "layer" && appendLayerPixelEdit(controller, found.node, pixels)) {
            controller.history.push(controller.cloneStampBefore, controller.documentStore.snapshot(), "Clone stamp");
            state.markChanged();
          }
          controller.cloneStampBefore = null;
          controller.cloneStampLayerId = null;
          renderLayeredDocument(controller);
          drawCloneStampOverlay(controller, point);
          syncTab(controller);
        } else if (state.tool === "bucket" && controller.gradientFillTool.isEditing) {
          controller.gradientFillTool.update(point);
          controller.gradientFillTool.end();
          renderGradientFill(controller);
        } else if (state.tool === "eraser") {
          const mask = controller.eraserTool.finish();
          const found = namespace.findDocumentNode(controller.documentStore.document, controller.eraserLayerId);
          if (mask && found?.node?.kind === "layer" && appendLayerPixelEdit(controller, found.node, mask, "destination-out")) {
            controller.history.push(controller.eraserBefore, controller.documentStore.snapshot(), "Eraser");
            state.markChanged();
          }
          controller.eraserBefore = null;
          controller.eraserLayerId = null;
          renderLayeredDocument(controller);
          drawEraserOverlay(controller, point);
          syncTab(controller);
        } else if (state.tool === "blur") {
          const pixels = controller.blurTool.finish();
          const found = namespace.findDocumentNode(controller.documentStore.document, controller.blurLayerId);
          if (pixels && found?.node?.kind === "layer" && appendLayerPixelReplacement(controller, found.node, controller.blurLayerBefore, pixels)) {
            controller.history.push(controller.blurBefore, controller.documentStore.snapshot(), "Blur");
            state.markChanged();
          }
          controller.blurBefore = null;
          controller.blurLayerBefore = null;
          controller.blurLayerId = null;
          renderLayeredDocument(controller);
          drawBlurOverlay(controller, point);
          syncTab(controller);
        } else if (state.tool === "smudge") {
          const pixels = controller.smudgeTool.finish();
          const found = namespace.findDocumentNode(controller.documentStore.document, controller.smudgeLayerId);
          if (pixels && found?.node?.kind === "layer" && appendLayerPixelReplacement(controller, found.node, controller.smudgeLayerBefore, pixels)) {
            controller.history.push(controller.smudgeBefore, controller.documentStore.snapshot(), "Smudge");
            state.markChanged();
          }
          controller.smudgeBefore = null;
          controller.smudgeLayerBefore = null;
          controller.smudgeLayerId = null;
          renderLayeredDocument(controller);
          drawSmudgeOverlay(controller, point);
          syncTab(controller);
        } else if (state.tool === "curve") {
          const result = controller.curveTool.completeStage(point);
          if (result.complete) finishEditableCurve(controller);
          else renderCurvePreview(controller);
        } else if (state.tool === "path") {
          controller.pathTool.completeStage(point, event.shiftKey);
          renderPathPreview(controller);
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
        } else if (state.tool === "polygon" && controller.polygonTool.isEditing) {
          controller.polygonTool.completeStage(point);
          renderPolygonPreview(controller);
        } else if (state.tool === "star") {
          controller.starTool.completeStage(point);
          renderStarPreview(controller);
        } else if (state.tool === "ellipse") {
          controller.ellipseTool.completeStage(point);
          renderEllipsePreview(controller);
        } else if (state.tool === "arc") {
          controller.arcTool.completeStage(point);
          renderArcPreview(controller);
        } else if (state.tool === "spiral") {
          controller.spiralTool.completeStage(point);
          renderSpiralPreview(controller);
        } else if (isGridTool(state.tool)) {
          gridToolFor(controller).completeStage(point);
          renderGridPreview(controller);
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
        } else if (state.tool === "move" && controller.objectGesture) {
          const gesture = controller.objectGesture;
          controller.objectGesture = null;
          if (gesture.mode === "marquee") {
            controller.objectSelection.selectMarquee(view.rectFromPoints(gesture.start, point), gesture.additive);
          } else if (Math.abs(point.x - gesture.start.x) > 0.01 || Math.abs(point.y - gesture.start.y) > 0.01) {
            controller.documentStore.notify({ type: "transform", ids: [...controller.documentStore.selectedIds] });
            const label = gesture.mode === "rotate" ? "Rotate objects" : gesture.mode === "resize" ? "Resize objects" : "Move objects";
            controller.history.push(gesture.before, controller.documentStore.snapshot(), label);
            state.markChanged();
          }
          renderLayeredDocument(controller);
          drawObjectSelectionOverlay(controller);
          syncTab(controller);
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
      overlay.addEventListener("dblclick", (event) => {
        if (state.tool === "move") {
          const objectId = controller.objectSelection.hitTest(view.pointFromEvent(event, false));
          const found = objectId ? namespace.findDocumentObject(controller.documentStore.document, objectId) : null;
          if (found?.object?.type === "text" && !found.object.locked && !found.layer.locked) {
            event.preventDefault();
            controller.documentStore.select(objectId);
            const style = found.object.payload?.style || {};
            ["fontFamily", "fontSize", "fontBold", "fontItalic", "foregroundColor"].forEach((key) => { if (style[key] != null) state[key] = style[key]; });
            controller.editingTextObjectId = objectId;
            state.setTool("text");
            openEditableTextBox(controller, objectDisplayBounds(found.object), found.object.payload?.text || "");
            syncTab(controller);
            return;
          }
        }
        if (state.tool === "bucket" && state.bucketFillMode === "gradient" && controller.gradientFillTool.isEditing) {
          const point = view.pointFromEvent(event);
          if (!controller.gradientFillTool.contains(point)) return;
          event.preventDefault();
          controller.activeGradientColorSide = controller.gradientFillTool.sideAt(point);
          const input = view.shell.querySelector(".image-editor-gradient-side-color");
          input.value = controller.activeGradientColorSide === "start" ? controller.gradientFillTool.startColor : controller.gradientFillTool.endColor;
          try {
            if (typeof input.showPicker === "function") input.showPicker();
            else input.click();
          } catch (_error) {
            input.click();
          }
          return;
        }
        if (state.tool === "path" && controller.pathTool.isEditing) {
          event.preventDefault();
          if (controller.pathTool.doubleClick(view.pointFromEvent(event, false))) renderPathPreview(controller);
          return;
        }
        if (state.tool !== "polygon" || controller.polygonPoints.length < 3) return;
        event.preventDefault();
        view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
        controller.polygonTool.beginEditing(controller.polygonPoints);
        controller.polygonPoints = [];
        renderPolygonPreview(controller);
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
      if (event.key === "Escape" && controller.state.tool === "move" && !selection.floating && controller.documentStore.selectedIds.size) {
        event.preventDefault();
        controller.documentStore.select([]);
        drawObjectSelectionOverlay(controller);
        syncTab(controller);
        return true;
      }
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
      if (!selection.floating) {
        controller.selectionBefore = snapshot(view);
        controller.pixelSelectionDocumentBefore = controller.documentStore.snapshot();
      }
      else if (!controller.selectionBefore) controller.selectionBefore = snapshot(view);
      const move = selection.beginMove(pixelSelectionSourceContext(controller), state.backgroundColor, {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey
      });
      if (!move.started) return true;
      if (move.sourceCleared && clearPixelRegionFromSelectedLayers(controller, selection.region())) renderLayeredDocument(controller);
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
      const { state } = controller;
      commitText(controller);
      commitSelection(controller);
      const objectIds = [];
      namespace.walkDocumentNodes(controller.documentStore.document, (node) => {
        if (node.kind !== "layer" || node.visible === false || node.locked) return;
        (node.objects || []).forEach((object) => { if (object.visible !== false && !object.locked) objectIds.push(object.id); });
      });
      state.setTool("move");
      controller.documentStore.select(objectIds);
      drawObjectSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }
    /** Keep editor shortcuts out of native text-entry controls and application dialogs. */
    function pixelSelectionRegions(controller) {
      const { selection, view } = controller;
      if (!selection.hasSelection) return [];
      if (selection.shape === "rectangle" && selection.inverted) {
        return namespace.imageEditorInverseSelectionRects(selection.rect, { width: view.canvas.width, height: view.canvas.height });
      }
      return [selection.region()];
    }

    function deselectCanvas(controller) {
      if (controller.selection.floating) commitSelection(controller);
      else controller.selection.clear();
      controller.documentStore.select([]);
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }

    function inverseCanvasSelection(controller) {
      if (controller.selection.hasSelection && !controller.selection.floating) {
        controller.selection.inverted = !controller.selection.inverted;
        drawSelectionOverlay(controller);
        syncTab(controller);
        return true;
      }
      const selected = controller.documentStore.selectedIds;
      const invertedIds = [];
      namespace.walkDocumentNodes(controller.documentStore.document, (node) => {
        if (node.kind !== "layer" || node.visible === false || node.locked) return;
        (node.objects || []).forEach((object) => {
          if (object.visible !== false && !object.locked && !selected.has(object.id) && !selected.has(node.id)) invertedIds.push(object.id);
        });
      });
      controller.state.setTool("move");
      controller.documentStore.select(invertedIds);
      drawObjectSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }

    function flipCanvasTarget(controller, horizontal) {
      const { selection, documentStore, state } = controller;
      if (selection.hasSelection) {
        if (selection.floating && selection.imageData) {
          selection.imageData = namespace.flipImageEditorImageData(selection.imageData, horizontal);
          drawSelectionOverlay(controller);
          syncTab(controller);
          return true;
        }
        const before = documentStore.snapshot();
        const layers = documentStore.selectedContentLayers({ editableOnly: true });
        const changed = namespace.ImageEditorCanvasEditActions.flipSelectedLayerRegions(documentStore, layers, pixelSelectionRegions(controller), horizontal);
        if (changed) {
          controller.history.push(before, documentStore.snapshot(), horizontal ? "Flip pixels horizontal" : "Flip pixels vertical");
          state.markChanged();
          renderLayeredDocument(controller);
          drawSelectionOverlay(controller);
          syncTab(controller);
        }
        return changed;
      }
      const objects = selectedDocumentObjects(controller);
      const bounds = combinedObjectBounds(objects);
      if (!objects.length || !bounds) return false;
      return commitDocumentMutation(controller, horizontal ? "Flip objects horizontal" : "Flip objects vertical", () => {
        objects.forEach((object) => {
          const display = objectDisplayBounds(object);
          object.transform = { ...(object.transform || {}) };
          if (horizontal) {
            object.transform.x = bounds.x + bounds.width - (display.x - bounds.x) - display.width;
            object.transform.scaleX = -(Number(object.transform.scaleX) || 1);
          } else {
            object.transform.y = bounds.y + bounds.height - (display.y - bounds.y) - display.height;
            object.transform.scaleY = -(Number(object.transform.scaleY) || 1);
          }
        });
        documentStore.notify({ type: "flip-objects", ids: objects.map((object) => object.id) });
        return true;
      });
    }

    function cropCanvasToSelection(controller) {
      const { selection, documentStore, view, state } = controller;
      if (!selection.hasSelection || selection.inverted) return false;
      const rect = { ...selection.rect };
      if (rect.width < 16 || rect.height < 16) return false;
      if (selection.floating) commitSelection(controller);
      const before = documentStore.snapshot();
      namespace.ImageEditorCanvasEditActions.cropDocument(documentStore, rect);
      view.setDimensions(rect.width, rect.height);
      state.width = rect.width;
      state.height = rect.height;
      selection.clear();
      controller.history.push(before, documentStore.snapshot(), "Crop image");
      state.markChanged();
      view.setZoom(state.zoom);
      renderLayeredDocument(controller);
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }

    async function runCanvasContextAction(controller, action) {
      const hasPixels = controller.selection.hasSelection;
      const hasObjects = selectedDocumentObjects(controller).length > 0;
      if (action === "paste") return runAction(controller, "paste");
      if (action === "select-all") return selectAllCanvas(controller);
      if (action === "deselect") return deselectCanvas(controller);
      if (action === "inverse-select") return inverseCanvasSelection(controller);
      if (action === "crop") return cropCanvasToSelection(controller);
      if (action === "flip-horizontal" || action === "flip-vertical") return flipCanvasTarget(controller, action === "flip-horizontal");
      if (action === "copy") return hasPixels ? copySelectionToClipboard(controller) : copyObjectSelectionToClipboard(controller);
      if (action === "delete" && hasObjects && !hasPixels) return commitDocumentMutation(controller, "Delete objects", () => controller.documentStore.deleteSelected());
      if (action === "delete" && hasPixels) {
        const before = controller.documentStore.snapshot();
        let changed = false;
        pixelSelectionRegions(controller).forEach((rect) => {
          if (clearPixelRegionFromSelectedLayers(controller, rect)) changed = true;
        });
        controller.selection.clear();
        if (changed) {
          controller.history.push(before, controller.documentStore.snapshot(), "Delete pixels");
          controller.state.markChanged();
          renderLayeredDocument(controller);
        }
        drawSelectionOverlay(controller);
        syncTab(controller);
        return changed;
      }
      return false;
    }

    function bindCanvasContextMenu(controller) {
      const listener = (event) => {
        event.preventDefault();
        const point = controller.view.pointFromEvent(event);
        const selectionAtPoint = controller.selection.hasSelection &&
          (controller.selection.inverted ? !controller.selection.contains(point) : controller.selection.contains(point));
        const objectId = selectionAtPoint ? null : controller.objectSelection.hitTest(point);
        if (objectId) {
          controller.documentStore.select(objectId);
          if (controller.selection.hasSelection) {
            controller.selection.clear();
            drawSelectionOverlay(controller);
          }
        }
        const hasPixels = selectionAtPoint;
        const hasObjects = !hasPixels && !!objectId;
        controller.canvasContextMenu.show(event.clientX, event.clientY, {
          copy: hasPixels || hasObjects, delete: hasPixels || hasObjects,
          crop: hasPixels && !controller.selection.inverted,
          "flip-horizontal": hasPixels || hasObjects, "flip-vertical": hasPixels || hasObjects,
          deselect: controller.selection.hasSelection || controller.documentStore.selectedIds.size > 0,
          "inverse-select": controller.selection.hasSelection || controller.documentStore.selectedIds.size > 0
        }, (action) => runCanvasContextAction(controller, action));
        if (objectId) { drawObjectSelectionOverlay(controller); syncTab(controller); }
      };
      controller.view.overlay.addEventListener("contextmenu", listener);
      controller.removeCanvasContextMenuListener = () => controller.view.overlay.removeEventListener("contextmenu", listener);
    }
    function isNativeTextEditingTarget(target) {
      return target instanceof global.HTMLElement && !!target.closest("input, textarea, select, [contenteditable=true], [contenteditable='']");
    }
    function bindKeyboard(controller) {
      const listener = (event) => {
        if (deps.getActiveTab?.()?.id !== controller.tab.id) return;
        if (isNativeTextEditingTarget(event.target) && event.target !== controller.view.textInput) return;
        const primary = event.ctrlKey || event.metaKey;
        if (primary && event.key.toLowerCase() === "s" && event.defaultPrevented) return;
        if (controller.view.textInput.hidden === false) {
          if (event.key === "Escape") {
            controller.view.hideTextInput();
            controller.editingTextObjectId = null;
            event.preventDefault();
          } else if (primary && event.key === "Enter") {
            commitText(controller);
            event.preventDefault();
          }
          return;
        }
        if (controller.state.tool === "bucket" && controller.gradientFillTool.isEditing) {
          if (event.key === "Escape") {
            cancelGradientFill(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishGradientFill(controller);
            event.preventDefault();
            return;
          }
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
        if (controller.state.tool === "path" && controller.pathTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditablePath(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditablePath(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            if (controller.pathTool.removeSelectedAnchor()) renderPathPreview(controller);
            event.preventDefault();
            return;
          }
          const delta = keyboardSelectionDelta(event);
          if (delta) {
            const amount = event.shiftKey ? 10 : 1;
            if (controller.pathTool.nudgeSelectedAnchor(delta.x * amount, delta.y * amount)) renderPathPreview(controller);
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
        if (controller.state.tool === "polygon" && controller.polygonTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditablePolygon(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditablePolygon(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            if (controller.polygonTool.removeSelectedPoint()) renderPolygonPreview(controller);
            event.preventDefault();
            return;
          }
        }
        if (controller.state.tool === "star" && controller.starTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableStar(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableStar(controller);
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
        if (controller.state.tool === "spiral" && controller.spiralTool.isEditing) {
          if (event.key === "Escape") {
            cancelEditableSpiral(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableSpiral(controller);
            event.preventDefault();
            return;
          }
        }
        if (isGridTool(controller.state.tool) && gridToolFor(controller).isEditing) {
          if (event.key === "Escape") {
            cancelEditableGrid(controller);
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            finishEditableGrid(controller);
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
        if (controller.gradientFillTool.isEditing && !controller.view.wrap.contains(event.target) &&
            !event.target.closest?.(".image-editor-gradient-side-color")) {
          finishGradientFill(controller);
        }
        if (event.target.closest?.('.image-editor-layers-panel')) return;
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
      const mimeType = source.mimeType || namespace.mimeTypeForName(source.name || source.path) || "image/png";
      const view = new namespace.ImageEditorView(root);
      const projectCodec = new namespace.ImageEditorProjectCodec();
      let documentBundle;
      if (source.blank === true && !source.draftBytes) {
        const width = Math.max(16, Number(source.width || tab.imageEditorState?.width || 640) || 640);
        const height = Math.max(16, Number(source.height || tab.imageEditorState?.height || 360) || 360);
        const blankBackground = source.background?.mode === "transparent"
          ? { mode: "transparent" }
          : { mode: "solid", color: String(source.background?.color || "#ffffff") };
        const canvasBackgroundColor = blankBackground.mode === "transparent" ? "transparent" : blankBackground.color;
        view.setDimensions(width, height);
        view.context.clearRect(0, 0, width, height);
        if (blankBackground.mode === "solid") {
          view.context.fillStyle = blankBackground.color;
          view.context.fillRect(0, 0, width, height);
        }
        documentBundle = projectCodec.fromRasterImageData(view.context.getImageData(0, 0, width, height), canvasBackgroundColor);
      } else {
        const bytes = await namespace.readSourceBytes(source, deps);
        const isProject = mimeType === namespace.IMAGE_PROJECT_MIME_TYPE || namespace.extensionOf(source.name || source.path) === "mdimage" || (bytes[0] === 0x50 && bytes[1] === 0x4b);
        if (isProject) {
          documentBundle = await projectCodec.decode(bytes);
          view.setDimensions(documentBundle.document.canvas.width, documentBundle.document.canvas.height);
        } else {
          const bitmap = await namespace.decodeBytes(bytes, mimeType);
          view.setDimensions(bitmap.width, bitmap.height);
          view.context.drawImage(bitmap, 0, 0);
          bitmap.close?.();
          documentBundle = projectCodec.fromRasterImageData(view.context.getImageData(0, 0, view.canvas.width, view.canvas.height), "transparent");
        }
      }
      const state = new namespace.ImageEditorState({
        ...(tab.imageEditorState || {}),
        width: view.canvas.width,
        height: view.canvas.height,
        mimeType: documentBundle.document.format === namespace.IMAGE_DOCUMENT_FORMAT ? namespace.IMAGE_PROJECT_MIME_TYPE : mimeType
      });
      if (tab.imageEditorDirty) state.setDirty(true);
      const controller = {
        tab, view, state, projectCodec,
        documentStore: new namespace.ImageEditorDocumentStore(documentBundle.document, documentBundle.assets),
        history: new namespace.ImageEditorDocumentHistory(),
        selection: new namespace.ImageEditorSelection(),
        polygonPoints: [],
        polygonTool: new namespace.ImageEditorPolygonTool(),
        cloneStampTool: new namespace.ImageEditorCloneStampTool(),
        cloneStampBefore: null,
        cloneStampLayerId: null,
        dragging: false,
        freehandStrokeDistance: 0,
        selectionBefore: null,
        curveTool: new namespace.ImageEditorCurveTool(),
        smudgeTool: new namespace.ImageEditorSmudgeTool(),
        smudgeBefore: null,
        smudgeLayerBefore: null,
        smudgeLayerId: null,
        eraserTool: new namespace.ImageEditorEraserTool(),
        eraserBefore: null,
        eraserLayerId: null,
        blurTool: new namespace.ImageEditorBlurTool(),
        blurBefore: null,
        blurLayerBefore: null,
        blurLayerId: null,
        curveBefore: null,
        pathTool: new namespace.ImageEditorPathTool(),
        pathBefore: null,
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
        starTool: new namespace.ImageEditorStarTool(),
        starBefore: null,
        ellipseTool: new namespace.ImageEditorEllipseTool(),
        ellipseBefore: null,
        arcTool: new namespace.ImageEditorArcTool(),
        arcBefore: null,
        spiralTool: new namespace.ImageEditorSpiralTool(),
        spiralBefore: null,
        rectangularGridTool: new namespace.ImageEditorRectangularGridTool(),
        polarGridTool: new namespace.ImageEditorPolarGridTool(),
        gridBefore: null,
        gradientFillTool: new namespace.ImageEditorGradientFillTool(),
        gradientBefore: null,
        activeGradientColorSide: "",
        textRect: null,
        creatingTextBox: false,
        textInputOpening: false,
        keepTextInputLive: false,
        pastedTextEditing: false,
        canvasContextMenu: new namespace.ImageEditorCanvasContextMenu()
      };
      if (tab.imageEditorState?.layersPanel?.selectedIds?.length) controller.documentStore.selectedIds = new Set(tab.imageEditorState.layersPanel.selectedIds);
      controller.compositor = new namespace.ImageEditorCompositor(controller.documentStore);
      controller.objectSelection = new namespace.ImageEditorObjectSelection(controller.documentStore);
      controller.layerPanel = new namespace.ImageEditorLayerPanel(view.stageFrame, controller.documentStore, {
        state: tab.imageEditorState?.layersPanel,
        requestRename(options) {
          return deps.prompt?.(options) || Promise.resolve(null);
        },
        requestDeleteConfirmation(options) {
          return deps.confirm?.(options) || Promise.resolve(true);
        },
        shouldConfirmDelete() {
          return deps.shouldConfirmLayerDeletion?.() !== false;
        },
        onMutate(label, callback) {
          if (label === "merge-down") return mergeSelectedLayerDown(controller);
          if (label === "merge-visible") return mergeVisibleLayers(controller);
          if (label === "flatten") return flattenDocument(controller);
          if (label === "export") return exportFlattenedImage(tab);
          if (label === "export-layer-png") return exportLayerImage(tab, callback?.layerIds, { mimeType: "image/png" });
          if (label === "export-layer-as") return exportLayerImage(tab, callback?.layerIds);
          if (label === "create-text-outlines") return commitDocumentMutation(controller, "Create text outlines", () => namespace.ImageEditorTextOutlineConverter.convertSelected(controller.documentStore));
          const changed = commitDocumentMutation(controller, label, callback);
          return changed;
        },
        onStateChanged(panelState) {
          tab.imageEditorState = { ...(tab.imageEditorState || {}), layersPanel: panelState };
          syncTab(controller);
        }
      });
      controller.removeObjectOverlayListener = controller.documentStore.subscribe((change) => {
        if (change.type === "selection" && controller.state.tool === "move") drawObjectSelectionOverlay(controller);
      });
      views.set(tab.id, controller);
      bindToolbar(controller);
      bindPointerTools(controller);
      bindCanvasContextMenu(controller);
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
      renderLayeredDocument(controller);
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
      controller.removeObjectOverlayListener?.();
      controller.removeCanvasContextMenuListener?.();
      controller.canvasContextMenu?.destroy?.();
      controller.layerPanel?.destroy?.();
      controller.view.destroy();
      views.delete(tabId);
    }

    function hasUnsavedChanges(tab) {
      return views.get(tab?.id)?.state?.isDirty === true || tab?.imageEditorDirty === true;
    }

    async function getDraftBinary(tab) {
      const controller = views.get(tab?.id);
      if (!controller) return tab?.imageEditorDraftBytes || null;
      const draftStore = createDraftDocumentStore(controller);
      const draftPreview = new namespace.ImageEditorCompositor(draftStore).render();
      const blob = await controller.projectCodec.encode(draftStore, draftPreview);
      return namespace.blobToUint8Array(blob);
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
      const sourceName = tab.sourceFileName || "image";
      const suggestedName = /\.mdimage$/i.test(sourceName) ? sourceName : sourceName.replace(/\.[^.]+$/, "") + ".mdimage";
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const path = await deps.Neutralino.os.showSaveDialog("Save layered image project", {
          defaultPath: suggestedName,
          filters: [{ name: "MD-Editor layered image", extensions: ["mdimage"] }]
        });
        return path ? { path, name: path.split(/[\\/]/).pop() } : null;
      }
      if (global.showSaveFilePicker) {
        const handle = await global.showSaveFilePicker({
          suggestedName,
          types: [{ description: "MD-Editor layered image", accept: { [namespace.IMAGE_PROJECT_MIME_TYPE]: [".mdimage"] } }]
        });
        return { handle, name: handle.name };
      }
      return { downloadOnly: true, name: suggestedName };
    }

    async function chooseExportDestination(tab, mimeType) {
      const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/webp" ? ".webp" : ".png";
      const sourceName = tab.sourceFileName || "image";
      const suggestedName = sourceName.replace(/\.[^.]+$/, "") + extension;
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const path = await deps.Neutralino.os.showSaveDialog("Export flattened image", {
          defaultPath: suggestedName,
          filters: [{ name: "Image", extensions: [extension.slice(1)] }]
        });
        return path ? { path, name: path.split(/[\\/]/).pop() } : null;
      }
      if (global.showSaveFilePicker) {
        const handle = await global.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Image", accept: { [mimeType]: [extension] } }]
        });
        return { handle, name: handle.name };
      }
      return { downloadOnly: true, name: suggestedName };
    }

    /** Choose a destination for exporting one isolated layer. */
    async function chooseLayerExportDestination(tab, layerName, mimeType = null) {
      const resolvedMimeType = mimeType || "image/png";
      const extension = resolvedMimeType === "image/jpeg" ? ".jpg" : resolvedMimeType === "image/webp" ? ".webp" : ".png";
      const suggestedName = `${layerName || (tab.sourceFileName || "layer").replace(/\.[^.]+$/, "")}${extension}`;
      const formats = mimeType
        ? [{ name: "Image", extensions: [extension.slice(1)] }]
        : [{ name: "PNG image", extensions: ["png"] }, { name: "JPEG image", extensions: ["jpg", "jpeg"] }, { name: "WebP image", extensions: ["webp"] }];
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const path = await deps.Neutralino.os.showSaveDialog("Export layer", { defaultPath: suggestedName, filters: formats });
        return path ? { path, name: path.split(/[\\/]/).pop() } : null;
      }
      if (global.showSaveFilePicker) {
        const types = mimeType
          ? [{ description: "Image", accept: { [resolvedMimeType]: [extension] } }]
          : [
              { description: "PNG image", accept: { "image/png": [".png"] } },
              { description: "JPEG image", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
              { description: "WebP image", accept: { "image/webp": [".webp"] } }
            ];
        const handle = await global.showSaveFilePicker({ suggestedName, types });
        return { handle, name: handle.name };
      }
      return { downloadOnly: true, name: suggestedName };
    }

    function mimeTypeForExportName(name, fallback = "image/png") {
      if (/\.jpe?g$/i.test(name || "")) return "image/jpeg";
      if (/\.webp$/i.test(name || "")) return "image/webp";
      if (/\.png$/i.test(name || "")) return "image/png";
      return fallback;
    }

    async function writeBlobToDestination(destination, blob) {
      if (destination.downloadOnly) deps.saveAs?.(blob, destination.name);
      else if (destination.path) await deps.Neutralino.filesystem.writeBinaryFile(destination.path, await blob.arrayBuffer());
      else {
        const writable = await destination.handle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
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
      if (!/\.mdimage$/i.test(tab.sourceFileName || tab.sourceFilePath || "")) return saveTabAs(tab);
      try {
        const blob = await controller.projectCodec.encode(controller.documentStore, createCompositeCanvas(controller));
        if (!await writeBlobToSource(tab, blob)) return saveTabAs(tab);
        controller.state.mimeType = namespace.IMAGE_PROJECT_MIME_TYPE;
        return finishSave(controller);
      } catch (error) {
        deps.alert?.(error?.message || "Unable to save this layered image.");
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
        if (!/\.mdimage$/i.test(destination.name || destination.path || "")) throw new Error("Layered image projects use the .mdimage extension.");
        const blob = await controller.projectCodec.encode(controller.documentStore, createCompositeCanvas(controller));
        await writeBlobToDestination(destination, blob);
        controller.state.mimeType = namespace.IMAGE_PROJECT_MIME_TYPE;
        return finishSave(controller, destination);
      } catch (error) {
        if (error?.name === "AbortError") return false;
        deps.alert?.(error?.message || "Unable to save this layered image.");
        return false;
      }
    }

    async function exportFlattenedImage(tab, options = {}) {
      const controller = views.get(tab?.id);
      if (!controller) return false;
      const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(options.mimeType) ? options.mimeType : "image/png";
      try {
        const destination = options.destination || await chooseExportDestination(tab, mimeType);
        if (!destination) return false;
        const blob = await encodeCompositeCanvas(controller, mimeType);
        await writeBlobToDestination(destination, blob);
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
        deps.alert?.(error?.message || "Unable to export the flattened image.");
        return false;
      }
    }

    /** Export one layer on a transparent full-canvas surface. */
    async function exportLayerImage(tab, layerIds, options = {}) {
      const controller = views.get(tab?.id);
      const layer = namespace.findDocumentNode(controller?.documentStore?.document, layerIds?.[0])?.node;
      if (!controller || layer?.kind !== "layer") return false;
      try {
        const destination = await chooseLayerExportDestination(tab, layer.name, options.mimeType);
        if (!destination) return false;
        const mimeType = mimeTypeForExportName(destination.name || destination.path, options.mimeType || "image/png");
        const canvas = namespace.ImageEditorLayerDocumentActions.renderLayers(controller.documentStore, [layer.id]);
        const blob = await namespace.encodeCanvas(canvas, mimeType, controller.state.backgroundColor);
        await writeBlobToDestination(destination, blob);
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
        deps.alert?.(error?.message || "Unable to export the selected layer.");
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
      exportFlattenedImage,
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
