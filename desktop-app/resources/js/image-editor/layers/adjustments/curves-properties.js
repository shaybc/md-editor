// Interactive Curves graph, point editing, histogram, and automatic range controls.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  class ImageEditorCurvesProperties {
    constructor(options = {}) {
      this.getHistogram = options.getHistogram || (() => null);
      this.onBeginEdit = options.onBeginEdit || (() => null);
      this.onPreview = options.onPreview || (() => {});
      this.onCommitEdit = options.onCommitEdit || (() => {});
      this.onMutate = options.onMutate || (() => {});
      this.selected = { channel: "rgb", index: 0 };
      this.drag = null;
    }

    /** Return the Curves properties markup for the selected document descriptor. */
    controls(adjustment, disabled) {
      const channel = namespace.ImageEditorAdjustmentModel.LEVELS_CHANNELS.includes(adjustment.channel) ? adjustment.channel : "rgb";
      const points = adjustment[channel + "Points"];
      if (this.selected.channel !== channel || this.selected.index >= points.length) this.selected = { channel, index: 0 };
      const point = points[this.selected.index];
      const options = [["rgb", "RGB"], ["red", "Red"], ["green", "Green"], ["blue", "Blue"]];
      const inputDisabled = disabled || this.selected.index === 0 || this.selected.index === points.length - 1 ? " disabled" : "";
      return '<div class="image-editor-curves-properties"><div class="image-editor-curves-channel"><select data-curves-channel' + disabled + '>' +
        options.map(([value, label]) => '<option value="' + value + '"' + (channel === value ? " selected" : "") + '>' + label + '</option>').join("") +
        '</select><button type="button" data-adjustment-panel-action="curves-auto"' + disabled + '>Auto</button></div>' +
        '<canvas class="image-editor-curves-graph" width="232" height="188" tabindex="0" aria-label="Editable ' + channel.toUpperCase() + ' tone curve"></canvas>' +
        '<div class="image-editor-curves-coordinates"><label>Input<input type="number" min="0" max="255" value="' + point.x + '" data-curves-coordinate="input"' + inputDisabled + '></label>' +
        '<label>Output<input type="number" min="0" max="255" value="' + point.y + '" data-curves-coordinate="output"' + disabled + '></label></div></div>';
    }

    /** Bind graph and numeric-point editing after the host panel renders. */
    bind(container, node) {
      const channel = container.querySelector("[data-curves-channel]");
      channel?.addEventListener("change", () => {
        this.selected = { channel: channel.value, index: 0 };
        this.onMutate("Change Tone Curve channel", node.id, { type: "properties", patch: { channel: channel.value } });
      });
      const canvas = container.querySelector(".image-editor-curves-graph");
      if (canvas) {
        this.draw(canvas, node.adjustment);
        if (!node.locked) this.bindCanvas(canvas, node);
      }
      container.querySelectorAll("[data-curves-coordinate]").forEach((input) => {
        input.addEventListener("change", () => this.updateCoordinate(node, input.dataset.curvesCoordinate, Number(input.value)));
      });
    }

    bindCanvas(canvas, node) {
      canvas.addEventListener("pointerdown", (event) => this.beginDrag(canvas, node, event));
      canvas.addEventListener("pointermove", (event) => this.moveDrag(canvas, node, event));
      canvas.addEventListener("pointerup", (event) => this.finishDrag(event, false));
      canvas.addEventListener("pointercancel", (event) => this.finishDrag(event, true));
      canvas.addEventListener("keydown", (event) => {
        if (!["Delete", "Backspace"].includes(event.key)) return;
        const points = node.adjustment[node.adjustment.channel + "Points"];
        if (this.selected.index <= 0 || this.selected.index >= points.length - 1) return;
        const next = points.map((point) => ({ ...point }));
        next.splice(this.selected.index, 1);
        this.selected.index = Math.max(0, this.selected.index - 1);
        this.onMutate("Delete Tone Curve point", node.id, { type: "properties", patch: { [node.adjustment.channel + "Points"]: next } });
        event.preventDefault();
      });
    }

    pointFromEvent(canvas, event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp(Math.round((event.clientX - rect.left) / rect.width * 255), 0, 255),
        y: clamp(Math.round((rect.bottom - event.clientY) / rect.height * 255), 0, 255)
      };
    }

    beginDrag(canvas, node, event) {
      if (event.button !== 0) return;
      const channel = node.adjustment.channel;
      let points = node.adjustment[channel + "Points"].map((point) => ({ ...point }));
      const target = this.pointFromEvent(canvas, event);
      const rect = canvas.getBoundingClientRect();
      let index = points.findIndex((point) => Math.hypot((point.x - target.x) * rect.width / 255, (point.y - target.y) * rect.height / 255) <= 9);
      if (index < 0) {
        points.push(target);
        points = namespace.ImageEditorAdjustmentModel.normalizeCurvePoints(points);
        index = points.findIndex((point) => point.x === target.x);
      }
      this.selected = { channel, index };
      this.drag = { pointerId: event.pointerId, before: this.onBeginEdit(), points };
      canvas.setPointerCapture?.(event.pointerId);
      this.previewPoints(canvas, node, points);
      event.preventDefault();
    }

    moveDrag(canvas, node, event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const points = this.drag.points.map((point) => ({ ...point }));
      const index = this.selected.index;
      const target = this.pointFromEvent(canvas, event);
      points[index].y = target.y;
      if (index > 0 && index < points.length - 1) points[index].x = clamp(target.x, points[index - 1].x + 1, points[index + 1].x - 1);
      this.drag.points = points;
      this.previewPoints(canvas, node, points);
      event.preventDefault();
    }

    finishDrag(event, cancel) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const before = this.drag.before;
      this.drag = null;
      this.onCommitEdit(before, cancel ? "" : "Adjust Tone Curve", cancel);
    }

    previewPoints(canvas, node, points) {
      const property = node.adjustment.channel + "Points";
      this.onPreview(node.id, { [property]: points });
      this.draw(canvas, { ...node.adjustment, [property]: points });
    }

    updateCoordinate(node, axis, value) {
      const channel = node.adjustment.channel;
      const property = channel + "Points";
      const points = node.adjustment[property].map((point) => ({ ...point }));
      const index = this.selected.index;
      if (axis === "input" && index > 0 && index < points.length - 1) points[index].x = clamp(Math.round(value), points[index - 1].x + 1, points[index + 1].x - 1);
      if (axis === "output") points[index].y = clamp(Math.round(value), 0, 255);
      this.onMutate("Edit Tone Curve point", node.id, { type: "properties", patch: { [property]: points } });
    }

    /** Return an automatic endpoint curve based on clipped histogram bounds. */
    autoPatch(adjustment) {
      const channel = adjustment.channel;
      const histogram = this.getHistogram(channel);
      let points = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
      if (Array.isArray(histogram) && histogram.length === 256) {
        const total = histogram.reduce((sum, count) => sum + count, 0);
        const threshold = total * .005;
        let low = 0;
        let high = 255;
        let accumulated = 0;
        while (low < 255 && accumulated + histogram[low] <= threshold) accumulated += histogram[low++];
        accumulated = 0;
        while (high > 0 && accumulated + histogram[high] <= threshold) accumulated += histogram[high--];
        if (low < high) points = namespace.ImageEditorAdjustmentModel.normalizeCurvePoints([{ x: 0, y: 0 }, { x: low, y: 0 }, { x: high, y: 255 }, { x: 255, y: 255 }]);
      }
      this.selected = { channel, index: 0 };
      return { [channel + "Points"]: points };
    }

    draw(canvas, adjustment) {
      const context = canvas.getContext("2d");
      const channel = adjustment.channel;
      const points = adjustment[channel + "Points"];
      context.fillStyle = "#383838";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#505050";
      context.lineWidth = 1;
      for (let division = 1; division < 4; division += 1) {
        const x = division * canvas.width / 4;
        const y = division * canvas.height / 4;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
        context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
      }
      const histogram = this.getHistogram(channel);
      if (Array.isArray(histogram) && histogram.length === 256) {
        const maximum = Math.max(1, ...histogram);
        context.fillStyle = "rgba(190,190,190,.38)";
        histogram.forEach((count, input) => {
          const height = count / maximum * canvas.height * .72;
          context.fillRect(input * canvas.width / 256, canvas.height - height, Math.max(1, canvas.width / 256), height);
        });
      }
      const lookup = namespace.ImageEditorCurvesAdjustment.createLookup(points);
      context.strokeStyle = { red: "#ff6b6b", green: "#63df7d", blue: "#6f8fff" }[channel] || "#f4f4f4";
      context.lineWidth = 1.5;
      context.beginPath();
      lookup.forEach((output, input) => {
        const x = input / 255 * canvas.width;
        const y = (1 - output / 255) * canvas.height;
        if (!input) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      points.forEach((point, index) => {
        context.fillStyle = index === this.selected.index && channel === this.selected.channel ? "#1473e6" : "#f5f5f5";
        context.strokeStyle = "#111";
        context.beginPath();
        context.arc(point.x / 255 * canvas.width, (1 - point.y / 255) * canvas.height, 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });
      const selected = points[this.selected.index];
      if (selected) {
        const input = canvas.parentElement.querySelector('[data-curves-coordinate="input"]');
        const output = canvas.parentElement.querySelector('[data-curves-coordinate="output"]');
        if (input) input.value = String(selected.x);
        if (output) output.value = String(selected.y);
      }
    }
  }

  namespace.ImageEditorCurvesProperties = ImageEditorCurvesProperties;
})(typeof window !== "undefined" ? window : globalThis);
