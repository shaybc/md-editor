// Managed-tab orchestration for the built-in raster image editor.
(function(global) {
  "use strict";

  global.registerMarkdownViewerImageEditor = function registerMarkdownViewerImageEditor(app, deps) {
    const namespace = global.MarkdownViewerImageEditor;
    const views = new Map();

    function snapshot(view) {
      return view.context.getImageData(0, 0, view.canvas.width, view.canvas.height);
    }

    function restoreSnapshot(view, imageData) {
      if (!imageData) return false;
      const restored = imageData instanceof ImageData
        ? imageData
        : new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      if (view.canvas.width !== restored.width || view.canvas.height !== restored.height) view.setDimensions(restored.width, restored.height);
      view.context.putImageData(restored, 0, 0);
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
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
      const { view, selection } = controller;
      view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
      if (!selection.hasSelection) return;
      if (selection.floating && selection.imageData) {
        view.overlayContext.putImageData(selection.imageData, selection.rect.x, selection.rect.y);
      }
      view.overlayContext.save();
      view.overlayContext.setLineDash([5, 4]);
      view.overlayContext.lineWidth = 1;
      view.overlayContext.strokeStyle = "#ffffff";
      view.overlayContext.strokeRect(selection.rect.x + 0.5, selection.rect.y + 0.5, selection.rect.width, selection.rect.height);
      view.overlayContext.lineDashOffset = 4;
      view.overlayContext.strokeStyle = "#111111";
      view.overlayContext.strokeRect(selection.rect.x + 0.5, selection.rect.y + 0.5, selection.rect.width, selection.rect.height);
      view.overlayContext.restore();
    }

    function commitSelection(controller) {
      if (!controller.selection.floating) return false;
      const before = controller.selectionBefore || snapshot(controller.view);
      controller.selection.commit(controller.view.context);
      controller.selectionBefore = null;
      drawSelectionOverlay(controller);
      return commitTransaction(controller, before);
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

    async function runAction(controller, action) {
      const { view, state, history, selection } = controller;
      if (action === "undo" || action === "redo") {
        selection.clear();
        const next = action === "undo" ? history.undo() : history.redo();
        if (restoreSnapshot(view, next)) {
          state.setDirty(history.isAtSavedState !== true);
          syncTab(controller);
        }
        return;
      }
      if (action === "zoom-in" || action === "zoom-out") {
        state.setZoom(state.zoom * (action === "zoom-in" ? 1.25 : 0.8));
        view.setZoom(state.zoom);
        syncTab(controller);
        return;
      }
      if (action === "copy") return copySelectionToClipboard(controller);
      if (action === "paste") {
        commitSelection(controller);
        const clipboardImage = await readSystemClipboardImage();
        controller.selectionBefore = snapshot(view);
        if (selection.paste(view.context, clipboardImage, state)) drawSelectionOverlay(controller);
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

    function commitText(controller) {
      const input = controller.view.textInput;
      if (input.hidden) return false;
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
      return Boolean(target?.closest?.(".image-editor-text-controls, .image-editor-foreground, .image-editor-background, [data-format]"));
    }

    function keepTextInputLive(controller) {
      controller.keepTextInputLive = true;
      setTimeout(() => { controller.keepTextInputLive = false; }, 300);
    }

    function refreshLiveTextStyle(controller) {
      controller.view.applyTextInputStyle?.(controller.state);
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
          commitText(controller);
          commitSelection(controller);
          state.setTool(toolButton.dataset.tool);
          syncTab(controller);
          return;
        }
        const actionButton = event.target.closest("[data-action]");
        if (actionButton && !actionButton.disabled) void runAction(controller, actionButton.dataset.action);
        const formatButton = event.target.closest("[data-format]");
        if (formatButton) {
          const key = formatButton.dataset.format === "bold" ? "fontBold" : "fontItalic";
          state[key] = !state[key];
          formatButton.classList.toggle("active", state[key]);
          refreshLiveTextStyle(controller);
          if (!view.textInput.hidden) setTimeout(() => view.textInput.focus(), 0);
        }
      });
      view.shell.querySelector(".image-editor-foreground").addEventListener("input", (event) => {
        state.foregroundColor = event.target.value;
        refreshLiveTextStyle(controller);
      });
      view.shell.querySelector(".image-editor-background").addEventListener("input", (event) => { state.backgroundColor = event.target.value; });
      view.shell.querySelector(".image-editor-size").addEventListener("input", (event) => {
        state.brushSize = state.lineWidth = Number(event.target.value);
      });
      view.shell.querySelector(".image-editor-fill").addEventListener("change", (event) => { state.fillShapes = event.target.checked; });
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
      view.context.putImageData(selection.imageData, selection.rect.x, selection.rect.y);
      return true;
    }
    function clearSelectionAfterOutsideClick(controller) {
      const { selection } = controller;
      if (!selection.hasSelection) return false;
      if (selection.floating) commitSelection(controller);
      selection.clear();
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }
    function bindPointerTools(controller) {
      const { view, state, selection } = controller;
      const overlay = view.overlay;
      overlay.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const point = view.pointFromEvent(event);
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
        if (state.tool === "select" && selection.hasSelection && !selection.contains(point)) {
          clearSelectionAfterOutsideClick(controller);
        }
        if (state.tool === "select" && selection.hasSelection && selection.contains(point)) {
          const wasFloatingSelection = selection.floating;
          let cloneSelection = false;
          if (!selection.floating) {
            cloneSelection = event.ctrlKey || event.metaKey || event.shiftKey;
            controller.selectionBefore = snapshot(view);
            selection.lift(view.context, state.backgroundColor, !cloneSelection);
          }
          controller.movingSelection = true;
          controller.stampingSelection = event.shiftKey;
          controller.commitSelectionOnPointerUp = !wasFloatingSelection && !cloneSelection;
        }
        overlay.setPointerCapture?.(event.pointerId);
      });
      overlay.addEventListener("pointermove", (event) => {
        if (!controller.dragging) return;
        const point = view.pointFromEvent(event);
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
          if (controller.movingSelection) {
            const previousRect = { ...selection.rect };
            selection.moveBy(point.x - controller.lastPoint.x, point.y - controller.lastPoint.y, state);
            if (controller.stampingSelection && (selection.rect.x !== previousRect.x || selection.rect.y !== previousRect.y)) stampFloatingSelection(controller);
            controller.lastPoint = point;
          } else {
            selection.setRect(controller.startPoint, point, state);
          }
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
        if (state.tool === "text" && controller.creatingTextBox) {
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
          controller.textRect = textRect;
          controller.textInputOpening = true;
          view.showTextInput(textRect, state);
          setTimeout(() => { controller.textInputOpening = false; }, 150);
        } else if (state.tool === "pencil" || state.tool === "brush") {
          commitTransaction(controller, controller.gestureBefore);
        } else if (state.tool === "select") {
          const movedSelection = controller.movingSelection;
          const commitMovedSelection = controller.commitSelectionOnPointerUp;
          controller.movingSelection = false;
          controller.stampingSelection = false;
          controller.commitSelectionOnPointerUp = false;
          if (movedSelection && commitMovedSelection) commitSelection(controller);
          else drawSelectionOverlay(controller);
          syncTab(controller);
        } else {
          view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
          namespace.drawShape(view.context, state.tool, controller.startPoint, point, state);
          commitTransaction(controller, controller.gestureBefore);
        }
      });
      overlay.addEventListener("dblclick", () => {
        if (state.tool !== "polygon" || controller.polygonPoints.length < 3) return;
        view.overlayContext.clearRect(0, 0, view.overlay.width, view.overlay.height);
        namespace.drawPolygon(view.context, controller.polygonPoints, state, true);
        controller.polygonPoints = [];
        commitTransaction(controller, controller.gestureBefore);
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
        view.status.textContent = `Resize: ${drag.nextWidth} x ${drag.nextHeight}px`;
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

    function cancelSelectionWithKeyboard(controller, event) {
      const { view, selection } = controller;
      if (event.key !== "Escape" || !selection.hasSelection) return false;
      event.preventDefault();
      if (selection.floating && controller.selectionBefore) restoreSnapshot(view, controller.selectionBefore);
      controller.selectionBefore = null;
      controller.movingSelection = false;
      controller.stampingSelection = false;
      selection.clear();
      drawSelectionOverlay(controller);
      syncTab(controller);
      return true;
    }
    function moveSelectionWithKeyboard(controller, event) {
      const delta = keyboardSelectionDelta(event);
      const { view, state, selection } = controller;
      if (!delta || state.tool !== "select" || !selection.hasSelection) return false;
      event.preventDefault();
      const wasFloating = selection.floating;
      const stampSelection = event.shiftKey;
      const cloneSelection = !wasFloating && (event.ctrlKey || event.metaKey || stampSelection);
      if (!selection.floating) {
        controller.selectionBefore = snapshot(view);
        selection.lift(view.context, state.backgroundColor, !cloneSelection);
      } else if (!controller.selectionBefore) {
        controller.selectionBefore = snapshot(view);
      }
      const previousRect = { ...selection.rect };
      selection.moveBy(delta.x, delta.y, state);
      drawSelectionOverlay(controller);
      if (selection.rect.x === previousRect.x && selection.rect.y === previousRect.y) {
        syncTab(controller);
        return true;
      }
      if (stampSelection) {
        commitSelection(controller);
      } else if (wasFloating || cloneSelection) {
        syncTab(controller);
      } else {
        commitSelection(controller);
      }
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
        if (cancelSelectionWithKeyboard(controller, event)) return;
        if (moveSelectionWithKeyboard(controller, event)) return;
        let action = "";
        if (primary && event.key.toLowerCase() === "z") action = event.shiftKey ? "redo" : "undo";
        else if (primary && event.key.toLowerCase() === "y") action = "redo";
        else if (primary && event.key.toLowerCase() === "x") action = "cut";
        else if (primary && event.key.toLowerCase() === "c") action = "copy";
        else if (primary && event.key.toLowerCase() === "v") action = "paste";
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
        movingSelection: false,
        stampingSelection: false,
        commitSelectionOnPointerUp: false,
        selectionBefore: null,
        textRect: null,
        creatingTextBox: false,
        textInputOpening: false,
        keepTextInputLive: false
      };
      views.set(tab.id, controller);
      bindToolbar(controller);
      bindPointerTools(controller);
      bindTextInputMove(controller);
      bindCanvasResize(controller);
      bindKeyboard(controller);
      view.textInput.addEventListener("blur", () => setTimeout(() => {
        const activeElement = global.document?.activeElement;
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
      controller.view.destroy();
      views.delete(tabId);
    }

    function hasUnsavedChanges(tab) {
      return views.get(tab?.id)?.state?.isDirty === true || tab?.imageEditorDirty === true;
    }

    async function getDraftBinary(tab) {
      const controller = views.get(tab?.id);
      if (!controller) return tab?.imageEditorDraftBytes || null;
      commitText(controller);
      commitSelection(controller);
      return namespace.blobToUint8Array(await namespace.encodeCanvas(controller.view.canvas, "image/png", controller.state.backgroundColor));
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
      const { tab, state, history } = controller;
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
      commitSelection(controller);
      const mimeType = namespace.mimeTypeForName(tab.sourceFileName || tab.sourceFilePath) || controller.state.mimeType;
      try {
        const blob = await namespace.encodeCanvas(controller.view.canvas, mimeType, controller.state.backgroundColor);
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
      commitSelection(controller);
      try {
        const destination = await chooseSaveDestination(tab);
        if (!destination) return false;
        const mimeType = namespace.mimeTypeForName(destination.name || destination.path);
        if (!mimeType) throw new Error("Save As supports .png, .jpg, .jpeg, and .webp files.");
        const blob = await namespace.encodeCanvas(controller.view.canvas, mimeType, controller.state.backgroundColor);
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

    const api = {
      canEditSource: namespace.canEditSource,
      mountImageEditorTab,
      destroyImageEditorTab,
      hasUnsavedChanges,
      saveTab,
      saveTabAs,
      getDraftBinary,
      refreshCommandState,
      getView(tabId) { return views.get(tabId) || null; }
    };
    app.services.imageEditor = api;
    app.registerModule?.("imageEditor", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
