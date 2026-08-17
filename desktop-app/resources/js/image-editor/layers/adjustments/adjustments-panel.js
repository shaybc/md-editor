// Floating Properties and Adjustments inspector for image-editor adjustment layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const TUNE_CATALOG = Object.freeze([
    ["create-brightness-contrast", "brightness-contrast", "Brightness/<br>Contrast"],
    ["create-exposure", "exposure", "Exposure<br>Control"],
    ["create-vibrance", "vibrance", "Smart<br>Saturation"],
    ["create-hue-saturation", "hue-saturation", "Hue/<br>Saturation"],
    ["create-color-balance", "color-balance", "Color<br>Balance"],
    ["create-black-white", "black-white", "Monochrome<br>Mixer"],
    ["create-channel-mixer", "channel-mixer", "Channel<br>Blend"],
    ["create-levels", "levels", "Tonal<br>Range"],
    ["create-curves", "curves", "Tone<br>Curve"],
    ["create-photo-filter", "photo-filter", "Lens<br>Tint"],
    ["create-invert", "invert", "Invert"],
    ["create-selective-color", "selective-color", "Color<br>Components"],
    ["create-match-color", "match-color", "Palette<br>Match"],
    ["create-replace-color", "replace-color", "Color<br>Swap"]
  ]);

  const LAYER_EFFECT_CATALOG = Object.freeze([
    ["edit-blur", "blur", "Blur"],
    ["edit-grain", "grain", "Grain"],
    ["edit-newspaper", "newspaper", "Newspaper"],
    ["edit-painted-texture", "painted-texture", "Painted<br>Texture"],
    ["edit-snow", "snow", "Snow"],
    ["edit-vortex", "vortex", "Vortex"],
    ["edit-ripple-field", "ripple-field", "Ripple<br>Field"],
    ["edit-flare", "flare", "Flare"],
    ["edit-gust", "gust", "Gust"]
  ]);

  function effectIcon(name, className = "") {
    return namespace.ImageEditorEffectIcons.markup(name, className);
  }

  function button(icon, label, action) {
    return '<button type="button" data-adjustment-panel-action="' + action + '" title="' + label + '" aria-label="' + label + '"><i class="bi ' + icon + '" aria-hidden="true"></i></button>';
  }

  function curveTuneButton(textTarget) {
    const active = textTarget?.object?.payload?.textEffect?.id === "curve";
    const disabled = !textTarget || textTarget.locked ? " disabled" : "";
    return '<button type="button" class="image-editor-adjustment-tile' + (active ? " active" : "") + '" data-text-effect="curve" title="Curve text" aria-label="Curve text" aria-pressed="' + String(active) + '"' + disabled + '>' +
      '<span class="image-editor-text-effect-curve-preview" aria-hidden="true"><i>A</i><i>B</i><i>C</i><i>D</i></span><span>Curve</span></button>';
  }

  class ImageEditorAdjustmentsPanel {
    /**
     * Render the per-tab adjustment catalog and selected adjustment properties.
     * @param {HTMLElement} stage - Fixed stage frame used for floating editor panels.
     * @param {ImageEditorDocumentStore} store - Layered document state.
     * @param {object} options - Transaction, preview, layout, and persistence callbacks.
     */
    constructor(stage, store, options = {}) {
      this.store = store;
      this.onCreate = options.onCreate || (() => {});
      this.onLayerEffect = options.onLayerEffect || (() => false);
      this.onApplyTextEffect = options.onApplyTextEffect || (() => false);
      this.onTextEffectPreview = options.onTextEffectPreview || (() => false);
      this.onTextEffectCommit = options.onTextEffectCommit || (() => {});
      this.onTextEffectMutate = options.onTextEffectMutate || (() => false);
      this.onBeginEdit = options.onBeginEdit || (() => null);
      this.onPreview = options.onPreview || (() => {});
      this.onCommitEdit = options.onCommitEdit || (() => {});
      this.onMutate = options.onMutate || (() => {});
      this.getHistogram = options.getHistogram || (() => null);
      this.curvesProperties = new namespace.ImageEditorCurvesProperties({
        getHistogram: (channel) => this.getHistogram(channel),
        onBeginEdit: () => this.onBeginEdit(),
        onPreview: (nodeId, patch) => this.onPreview(nodeId, patch),
        onCommitEdit: (before, label, cancel) => this.onCommitEdit(before, label, cancel),
        onMutate: (label, nodeId, operation) => this.onMutate(label, nodeId, operation)
      });
      this.photoFilterProperties = new namespace.ImageEditorPhotoFilterProperties({
        onMutate: (label, nodeId, operation) => this.onMutate(label, nodeId, operation)
      });
      this.selectiveColorProperties = new namespace.ImageEditorSelectiveColorProperties({
        onMutate: (label, nodeId, operation) => this.onMutate(label, nodeId, operation)
      });
      this.matchColorProperties = new namespace.ImageEditorMatchColorProperties({
        getSources: () => options.getMatchColorSources?.() || [],
        getStatistics: (sourceId) => options.getMatchColorStatistics?.(sourceId) || null,
        onMutate: (label, nodeId, operation) => this.onMutate(label, nodeId, operation)
      });
      this.replaceColorProperties = new namespace.ImageEditorReplaceColorProperties({
        onMutate: (label, nodeId, operation) => this.onMutate(label, nodeId, operation)
      });
      this.objectProperties = new namespace.ImageEditorObjectProperties(store, {
        onMutate: options.onObjectMutate || (() => false)
      });
      this.textEffectProperties = new namespace.ImageEditorTextEffectProperties({
        onBeginEdit: () => this.onBeginEdit(),
        onPreview: (objectId, patch) => this.onTextEffectPreview(objectId, patch),
        onCommitEdit: (before, label, cancel, objectId) => this.onTextEffectCommit(before, label, cancel, objectId),
        onMutate: (label, objectId, patch) => this.onTextEffectMutate(label, objectId, patch)
      });
      this.onStateChanged = options.onStateChanged || (() => {});
      this.onLayoutChanged = options.onLayoutChanged || (() => {});
      this.state = {
        mode: ["expanded", "minimized", "hidden"].includes(options.state?.mode) ? options.state.mode : "expanded",
        height: Math.max(220, Number(options.state?.height || 300)),
        activeTab: ["properties", "tune", "effects"].includes(options.state?.activeTab) ? options.state.activeTab : "effects"
      };
      this.editSnapshot = null;
      this.element = document.createElement("aside");
      this.element.className = "image-editor-adjustments-panel";
      this.element.setAttribute("aria-label", "Image properties, tune, and effects");
      this.element.innerHTML = '<header><div class="image-editor-adjustment-tabs" role="tablist"><button type="button" role="tab" data-adjustment-tab="properties">Properties</button><button type="button" role="tab" data-adjustment-tab="tune">Tune</button><button type="button" role="tab" data-adjustment-tab="effects">Effects</button></div><span class="image-editor-adjustment-panel-actions">' + button("bi-dash-lg", "Minimize adjustments", "minimize") + button("bi-x-lg", "Hide adjustments", "hide") + '</span></header><div class="image-editor-adjustment-panel-content"></div><div class="image-editor-adjustment-panel-resize" title="Resize adjustments panel"></div>';
      stage.appendChild(this.element);
      this.content = this.element.querySelector(".image-editor-adjustment-panel-content");
      this.bind();
      this.applyState();
      this.render();
      this.unsubscribe = store.subscribe((change) => {
        if (["selection", "add-adjustment"].includes(change.type)) {
          const target = this.selectedAdjustment();
          if (target || this.objectProperties.hasSelection()) {
            this.state.activeTab = "properties";
            this.reveal();
          }
        }
        this.render();
      });
    }

    selectedAdjustment() {
      const targetId = this.store.adjustmentTarget?.nodeId || [...this.store.selectedIds][0];
      const node = namespace.findDocumentNode(this.store.document, targetId)?.node;
      return namespace.ImageEditorAdjustmentModel.isAdjustment(node) ? node : null;
    }

    /** Resolve a text object only when its own hierarchy row is the sole selection. */
    selectedTextTarget() {
      const selected = [...this.store.selectedIds];
      if (selected.length !== 1) return null;
      const target = namespace.findDocumentObject(this.store.document, selected[0]);
      return target?.object?.id === selected[0] && target.object.type === "text" ? target : null;
    }

    bind() {
      this.element.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-adjustment-tab]")?.dataset.adjustmentTab;
        if (tab) {
          this.state.activeTab = tab;
          this.state.mode = "expanded";
          this.applyState();
          this.render();
          this.reportState();
          return;
        }
        const action = event.target.closest("[data-adjustment-panel-action]")?.dataset.adjustmentPanelAction;
        if (action === "minimize") {
          this.state.mode = this.state.mode === "minimized" ? "expanded" : "minimized";
          this.applyState();
          this.reportState();
          return;
        }
        if (action === "hide") {
          this.state.mode = "hidden";
          this.applyState();
          this.reportState();
          return;
        }
        const textEffectId = event.target.closest("[data-text-effect]")?.dataset.textEffect;
        const textTarget = this.selectedTextTarget();
        if (textEffectId && textTarget && !textTarget.locked) {
          this.onApplyTextEffect(textTarget.object.id, textEffectId);
          const appliedPreset = namespace.ImageEditorTextEffectCatalog.get(textEffectId);
          if (textEffectId === "curve" || Number.isFinite(appliedPreset?.typography?.curve)) {
            this.state.activeTab = "properties";
            this.reveal();
            this.render();
            this.reportState();
          }
          return;
        }
        if (["edit-blur", "edit-grain", "edit-newspaper", "edit-painted-texture", "edit-snow", "edit-vortex", "edit-ripple-field", "edit-flare", "edit-gust"].includes(action)) {
          this.onLayerEffect(action);
          return;
        }
        const adjustmentType = {
          "create-brightness-contrast": "brightness-contrast",
          "create-exposure": "exposure",
          "create-vibrance": "vibrance",
          "create-hue-saturation": "hue-saturation",
          "create-color-balance": "color-balance",
          "create-black-white": "black-white",
          "create-channel-mixer": "channel-mixer",
          "create-levels": "levels",
          "create-curves": "curves",
          "create-photo-filter": "photo-filter",
          "create-invert": "invert",
          "create-selective-color": "selective-color",
          "create-match-color": "match-color",
          "create-replace-color": "replace-color"
        }[action];
        if (adjustmentType) {
          this.onCreate(adjustmentType);
          return;
        }
        const hueRange = event.target.closest("[data-adjustment-range]")?.dataset.adjustmentRange;
        const rangeNode = this.selectedAdjustment();
        if (hueRange && rangeNode?.adjustment?.type === "hue-saturation" && !rangeNode.locked) {
          this.onMutate("Change Hue/Saturation range", rangeNode.id, { type: "properties", patch: { range: hueRange } });
          return;
        }
        const maskAction = event.target.closest("[data-adjustment-mask-action]")?.dataset.adjustmentMaskAction;
        const node = this.selectedAdjustment();
        if (maskAction && maskAction !== "enabled" && node && !node.locked) this.onMutate("Adjustment mask " + maskAction, node.id, { type: maskAction });
        if (action === "reset" && node && !node.locked) {
          this.onMutate("Reset " + namespace.ImageEditorAdjustmentModel.nameForType(node.adjustment.type), node.id, {
            type: "properties",
            patch: namespace.ImageEditorAdjustmentModel.defaultsForType(node.adjustment.type)
          });
        }
        if (action === "black-white-auto" && node?.adjustment?.type === "black-white" && !node.locked) {
          const defaults = namespace.ImageEditorAdjustmentModel.defaultsForType("black-white");
          this.onMutate("Auto Monochrome Mixer", node.id, {
            type: "properties",
            patch: { reds: defaults.reds, yellows: defaults.yellows, greens: defaults.greens, cyans: defaults.cyans, blues: defaults.blues, magentas: defaults.magentas }
          });
        }
        if (action === "levels-auto" && node?.adjustment?.type === "levels" && !node.locked) {
          this.onMutate("Auto Tonal Range", node.id, { type: "properties", patch: this.autoLevelsPatch(node.adjustment) });
        }
        if (action === "curves-auto" && node?.adjustment?.type === "curves" && !node.locked) {
          this.onMutate("Auto Tone Curve", node.id, { type: "properties", patch: this.curvesProperties.autoPatch(node.adjustment) });
        }
      });
      this.element.addEventListener("pointerdown", (event) => {
        const input = event.target.closest("[data-adjustment-property]");
        if (!input || this.editSnapshot) return;
        this.editSnapshot = this.onBeginEdit();
      });
      this.element.addEventListener("input", (event) => {
        const input = event.target.closest("[data-adjustment-property]");
        const node = this.selectedAdjustment();
        if (!input || !node || node.locked) return;
        if (!this.editSnapshot) this.editSnapshot = this.onBeginEdit();
        this.syncPropertyInputs(input.dataset.adjustmentProperty, Number(input.value));
        this.onPreview(node.id, { [input.dataset.adjustmentProperty]: Number(input.value) });
      });
      this.element.addEventListener("change", (event) => {
        const input = event.target.closest("[data-adjustment-property]");
        if (!input || !this.editSnapshot) return;
        const before = this.editSnapshot;
        this.editSnapshot = null;
        const node = this.selectedAdjustment();
        this.onCommitEdit(before, "Adjust " + namespace.ImageEditorAdjustmentModel.nameForType(node?.adjustment?.type));
      });
      this.element.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !this.editSnapshot) return;
        event.preventDefault();
        const before = this.editSnapshot;
        this.editSnapshot = null;
        this.onCommitEdit(before, "", true);
      });
      this.bindResize();
    }

    bindResize() {
      const handle = this.element.querySelector(".image-editor-adjustment-panel-resize");
      let drag = null;
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        drag = { pointerId: event.pointerId, y: event.clientY, height: this.element.getBoundingClientRect().height };
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        this.state.height = Math.max(220, Math.min(520, Math.round(drag.height + event.clientY - drag.y)));
        this.applyState();
      });
      const finish = (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        this.reportState();
      };
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    }

    syncPropertyInputs(property, value) {
      this.content.querySelectorAll('[data-adjustment-property="' + property + '"]').forEach((input) => { input.value = String(value); });
      const output = this.content.querySelector('[data-adjustment-output="' + property + '"]');
      if (output) output.textContent = this.formatPropertyValue(property, value);
      this.updateChannelMixerTotal();
    }

    formatPropertyValue(property, value) {
      const number = Number(value);
      if (property === "exposure" || property === "gamma") return number.toFixed(2);
      if (property === "offset") return number.toFixed(4);
      return number > 0 ? "+" + number : String(number);
    }

    render() {
      this.element.querySelectorAll("[data-adjustment-tab]").forEach((tab) => {
        const active = tab.dataset.adjustmentTab === this.state.activeTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      if (this.state.activeTab === "effects") {
        const textTarget = this.selectedTextTarget();
        if (textTarget) {
          const selectedEffect = textTarget.object.payload?.textEffect?.id || "";
          const disabled = textTarget.locked ? " disabled" : "";
          const tools = namespace.ImageEditorTextEffectCatalog.all().filter((preset) => preset.id !== "curve").map((preset) => {
            const active = selectedEffect === preset.id;
            return '<button type="button" class="image-editor-text-effect-tile' + (active ? " active" : "") + '" data-text-effect="' + preset.id + '" title="' + preset.label + '" aria-label="Apply ' + preset.label + ' text effect" aria-pressed="' + String(active) + '"' + disabled + '>' +
              '<span class="image-editor-text-effect-preview" style="' + namespace.ImageEditorTextEffectCatalog.previewStyle(preset) + '"><span>Ag</span></span><span class="image-editor-text-effect-label">' + preset.label + '</span></button>';
          }).join("");
          this.content.innerHTML = '<section class="image-editor-text-effect-catalog"><h3>Text effects</h3>' + tools + '</section>';
          return;
        }
        const tools = LAYER_EFFECT_CATALOG.map(([action, type, label]) =>
          '<button type="button" class="image-editor-adjustment-tile" data-adjustment-panel-action="' + action + '">' + effectIcon(type) + '<span>' + label + '</span></button>'
        ).join("");
        this.content.innerHTML = '<section class="image-editor-adjustment-catalog"><h3>Layer effects</h3>' + tools + '</section>';
        return;
      }
      if (this.state.activeTab === "tune") {
        const textTarget = this.selectedTextTarget();
        const tools = TUNE_CATALOG.map(([action, type, label]) =>
          '<button type="button" class="image-editor-adjustment-tile" data-adjustment-panel-action="' + action + '">' + effectIcon(type) + '<span>' + label + '</span></button>'
        ).join("");
        this.content.innerHTML = '<section class="image-editor-adjustment-catalog"><h3>Tune</h3>' + curveTuneButton(textTarget) + tools + '</section>';
        return;
      }
      const node = this.selectedAdjustment();
      if (!node) {
        if (this.textEffectProperties.render(this.content, this.selectedTextTarget())) return;
        if (this.objectProperties.render(this.content)) return;
        this.content.innerHTML = '<div class="image-editor-adjustment-empty"><i class="bi bi-sliders"></i><p>Select an object or adjustment layer to edit its properties.</p></div>';
        return;
      }
      const adjustment = node.adjustment;
      const disabled = node.locked ? " disabled" : "";
      const maskEnabled = node.mask?.enabled !== false;
      const isExposure = adjustment.type === "exposure";
      const isVibrance = adjustment.type === "vibrance";
      const isHueSaturation = adjustment.type === "hue-saturation";
      const isColorBalance = adjustment.type === "color-balance";
      const isBlackWhite = adjustment.type === "black-white";
      const isChannelMixer = adjustment.type === "channel-mixer";
      const isLevels = adjustment.type === "levels";
      const isCurves = adjustment.type === "curves";
      const isPhotoFilter = adjustment.type === "photo-filter";
      const isInvert = adjustment.type === "invert";
      const isSelectiveColor = adjustment.type === "selective-color";
      const isMatchColor = adjustment.type === "match-color";
      const isReplaceColor = adjustment.type === "replace-color";
      const name = namespace.ImageEditorAdjustmentModel.nameForType(adjustment.type);
      const icon = effectIcon(adjustment.type);
      const controls = isExposure
        ? this.propertyControl("Exposure", "exposure", -20, 20, adjustment.exposure, disabled, .01) +
          this.propertyControl("Offset", "offset", -.5, .5, adjustment.offset, disabled, .0001) +
          this.propertyControl("Gamma Correction", "gamma", .01, 9.99, adjustment.gamma, disabled, .01)
        : isVibrance
          ? this.propertyControl("Vibrance", "vibrance", -100, 100, adjustment.vibrance, disabled) +
            this.propertyControl("Saturation", "saturation", -100, 100, adjustment.saturation, disabled)
        : isHueSaturation
          ? this.hueRangeControls(adjustment, disabled) +
            this.propertyControl("Hue", "hue", -180, 180, adjustment.hue, disabled) +
            this.propertyControl("Saturation", "saturation", -100, 100, adjustment.saturation, disabled) +
            this.propertyControl("Lightness", "lightness", -100, 100, adjustment.lightness, disabled) +
            '<label class="image-editor-hue-colorize"><input type="checkbox" data-adjustment-toggle="colorize"' + (adjustment.colorize ? " checked" : "") + disabled + '> Colorize</label>'
        : isColorBalance
          ? this.colorBalanceControls(adjustment, disabled)
        : isBlackWhite
          ? this.blackWhiteControls(adjustment, disabled)
        : isChannelMixer
          ? this.channelMixerControls(adjustment, disabled)
        : isLevels
          ? this.levelsControls(adjustment, disabled)
        : isCurves
          ? this.curvesProperties.controls(adjustment, disabled)
        : isPhotoFilter
          ? this.photoFilterProperties.controls(adjustment, disabled, (...args) => this.propertyControl(...args))
        : isInvert
          ? '<p class="image-editor-invert-properties-note">Invert reverses the RGB channels of the visible content beneath this adjustment. Use its mask or opacity to limit the effect.</p>'
        : isSelectiveColor
          ? this.selectiveColorProperties.controls(adjustment, disabled, (...args) => this.propertyControl(...args))
        : isMatchColor
          ? this.matchColorProperties.controls(adjustment, disabled, (...args) => this.propertyControl(...args))
        : isReplaceColor
          ? this.replaceColorProperties.controls(adjustment, disabled, (...args) => this.propertyControl(...args))
        : this.propertyControl("Brightness", "brightness", -150, 150, adjustment.brightness, disabled) +
          this.propertyControl("Contrast", "contrast", -50, 100, adjustment.contrast, disabled);
      this.content.innerHTML = '<section class="image-editor-brightness-contrast-properties"><div class="image-editor-adjustment-property-heading"><span>' + icon + name + '</span>' + (isInvert ? "" : button("bi-arrow-counterclockwise", "Reset adjustment", "reset")) + '</div>' +
        controls +
        '<fieldset class="image-editor-adjustment-mask-controls"' + disabled + '><legend>Layer mask</legend><label><input type="checkbox" data-adjustment-mask-action="enabled"' + (maskEnabled ? " checked" : "") + disabled + '> Enabled</label><div><button type="button" data-adjustment-mask-action="invert"' + disabled + '>Invert</button><button type="button" data-adjustment-mask-action="white"' + disabled + '>Reset white</button><button type="button" data-adjustment-mask-action="black"' + disabled + '>Fill black</button></div><p>Paint black to conceal, white to reveal, or gray for partial strength.</p></fieldset>' +
        (node.locked ? '<p class="image-editor-adjustment-locked"><i class="bi bi-lock-fill"></i> Unlock this adjustment layer to edit it.</p>' : "") +
        '</section>';
      const reset = this.content.querySelector('[data-adjustment-panel-action="reset"]');
      if (reset) reset.disabled = node.locked;
      if (isLevels) this.drawLevelsHistogram(adjustment);
      if (isCurves) this.curvesProperties.bind(this.content, node);
      if (isPhotoFilter) this.photoFilterProperties.bind(this.content, node);
      if (isSelectiveColor) this.selectiveColorProperties.bind(this.content, node);
      if (isMatchColor) this.matchColorProperties.bind(this.content, node);
      if (isReplaceColor) this.replaceColorProperties.bind(this.content, node);
      const enabled = this.content.querySelector('[data-adjustment-mask-action="enabled"]');
      enabled?.addEventListener("change", () => this.onMutate("Toggle adjustment mask", node.id, { type: "enabled", enabled: enabled.checked }));
      const colorize = this.content.querySelector('[data-adjustment-toggle="colorize"]');
      colorize?.addEventListener("change", () => this.onMutate("Toggle Hue/Saturation colorize", node.id, { type: "properties", patch: { colorize: colorize.checked } }));
      const colorBalanceTone = this.content.querySelector('[data-adjustment-select="tone"]');
      colorBalanceTone?.addEventListener("change", () => this.onMutate("Change Color Balance tone", node.id, { type: "properties", patch: { tone: colorBalanceTone.value } }));
      const preserveLuminosity = this.content.querySelector('[data-adjustment-toggle="preserveLuminosity"]');
      preserveLuminosity?.addEventListener("change", () => this.onMutate("Toggle Color Balance luminosity preservation", node.id, { type: "properties", patch: { preserveLuminosity: preserveLuminosity.checked } }));
      const tint = this.content.querySelector('[data-adjustment-toggle="blackWhiteTint"]');
      tint?.addEventListener("change", () => this.onMutate("Toggle Monochrome Mixer tint", node.id, { type: "properties", patch: { tint: tint.checked } }));
      const tintColor = this.content.querySelector('[data-adjustment-color="tintColor"]');
      tintColor?.addEventListener("change", () => this.onMutate("Change Monochrome Mixer tint color", node.id, { type: "properties", patch: { tintColor: tintColor.value } }));
      const outputChannel = this.content.querySelector('[data-adjustment-select="outputChannel"]');
      outputChannel?.addEventListener("change", () => this.onMutate("Change Channel Blend output", node.id, { type: "properties", patch: { outputChannel: outputChannel.value } }));
      const monochrome = this.content.querySelector('[data-adjustment-toggle="channelMixerMonochrome"]');
      monochrome?.addEventListener("change", () => this.onMutate("Toggle Channel Blend monochrome", node.id, { type: "properties", patch: { monochrome: monochrome.checked } }));
      const levelsChannel = this.content.querySelector('[data-adjustment-select="levelsChannel"]');
      levelsChannel?.addEventListener("change", () => this.onMutate("Change Tonal Range channel", node.id, { type: "properties", patch: { channel: levelsChannel.value } }));
    }

    hueRangeControls(adjustment, disabled) {
      const ranges = [
        ["master", "Master", "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"],
        ["reds", "Reds", "#ef4444"],
        ["yellows", "Yellows", "#eab308"],
        ["greens", "Greens", "#22c55e"],
        ["cyans", "Cyans", "#06b6d4"],
        ["blues", "Blues", "#2563eb"],
        ["magentas", "Magentas", "#d946ef"]
      ];
      const unavailable = disabled || adjustment.colorize ? " disabled" : "";
      return '<div class="image-editor-hue-range" role="listbox" aria-label="Hue/Saturation color range">' + ranges.map(([value, label, color]) =>
        '<button type="button" role="option" data-adjustment-range="' + value + '" title="' + label + '" aria-label="' + label + '" aria-selected="' + String(adjustment.range === value) + '" class="' + (adjustment.range === value ? "active" : "") + '"' + unavailable + '><span style="--image-editor-hue-range-color:' + color + '"></span></button>'
      ).join("") + '</div>';
    }

    colorBalanceControls(adjustment, disabled) {
      const tone = namespace.ImageEditorAdjustmentModel.COLOR_BALANCE_TONES.includes(adjustment.tone) ? adjustment.tone : "midtones";
      const toneOptions = [["shadows", "Shadows"], ["midtones", "Midtones"], ["highlights", "Highlights"]];
      return '<label class="image-editor-color-balance-tone"><span>Tone</span><select data-adjustment-select="tone"' + disabled + '>' +
        toneOptions.map(([value, label]) => '<option value="' + value + '"' + (tone === value ? " selected" : "") + '>' + label + '</option>').join("") +
        '</select></label>' +
        this.propertyControl("Cyan  -  Red", tone + "CyanRed", -100, 100, adjustment[tone + "CyanRed"], disabled) +
        this.propertyControl("Magenta  -  Green", tone + "MagentaGreen", -100, 100, adjustment[tone + "MagentaGreen"], disabled) +
        this.propertyControl("Yellow  -  Blue", tone + "YellowBlue", -100, 100, adjustment[tone + "YellowBlue"], disabled) +
        '<label class="image-editor-color-balance-preserve"><input type="checkbox" data-adjustment-toggle="preserveLuminosity"' + (adjustment.preserveLuminosity ? " checked" : "") + disabled + '> Preserve Luminosity</label>';
    }

    blackWhiteControls(adjustment, disabled) {
      const tintColorDisabled = disabled || !adjustment.tint ? " disabled" : "";
      return '<div class="image-editor-black-white-options"><label><input type="checkbox" data-adjustment-toggle="blackWhiteTint"' + (adjustment.tint ? " checked" : "") + disabled + '> Tint</label><input type="color" data-adjustment-color="tintColor" value="' + adjustment.tintColor + '" title="Tint color" aria-label="Tint color"' + tintColorDisabled + '><button type="button" data-adjustment-panel-action="black-white-auto"' + disabled + '>Auto</button></div>' +
        this.propertyControl("Reds", "reds", -200, 300, adjustment.reds, disabled) +
        this.propertyControl("Yellows", "yellows", -200, 300, adjustment.yellows, disabled) +
        this.propertyControl("Greens", "greens", -200, 300, adjustment.greens, disabled) +
        this.propertyControl("Cyans", "cyans", -200, 300, adjustment.cyans, disabled) +
        this.propertyControl("Blues", "blues", -200, 300, adjustment.blues, disabled) +
        this.propertyControl("Magentas", "magentas", -200, 300, adjustment.magentas, disabled);
    }

    channelMixerControls(adjustment, disabled) {
      const output = namespace.ImageEditorAdjustmentModel.CHANNEL_MIXER_OUTPUTS.includes(adjustment.outputChannel) ? adjustment.outputChannel : "red";
      const prefix = adjustment.monochrome ? "monochrome" : output + "Output";
      const outputOptions = adjustment.monochrome
        ? '<option value="gray">Gray</option>'
        : [["red", "Red"], ["green", "Green"], ["blue", "Blue"]].map(([value, label]) => '<option value="' + value + '"' + (output === value ? " selected" : "") + '>' + label + '</option>').join("");
      const total = Number(adjustment[prefix + "Red"]) + Number(adjustment[prefix + "Green"]) + Number(adjustment[prefix + "Blue"]);
      return '<div class="image-editor-channel-mixer-properties"><label class="image-editor-channel-mixer-output"><span>Output Channel</span><select data-adjustment-select="outputChannel"' + (adjustment.monochrome ? " disabled" : disabled) + '>' + outputOptions + '</select></label>' +
        '<label class="image-editor-channel-mixer-monochrome"><input type="checkbox" data-adjustment-toggle="channelMixerMonochrome"' + (adjustment.monochrome ? " checked" : "") + disabled + '> Monochrome</label>' +
        this.propertyControl("Red", prefix + "Red", -200, 200, adjustment[prefix + "Red"], disabled) +
        this.propertyControl("Green", prefix + "Green", -200, 200, adjustment[prefix + "Green"], disabled) +
        this.propertyControl("Blue", prefix + "Blue", -200, 200, adjustment[prefix + "Blue"], disabled) +
        '<div class="image-editor-channel-mixer-total"><span>Total</span><output data-channel-mixer-total>' + this.formatPropertyValue("total", total) + '%</output></div>' +
        this.propertyControl("Constant", prefix + "Constant", -200, 200, adjustment[prefix + "Constant"], disabled) + '</div>';
    }

    updateChannelMixerTotal() {
      const node = this.selectedAdjustment();
      if (node?.adjustment?.type !== "channel-mixer") return;
      const prefix = node.adjustment.monochrome ? "monochrome" : node.adjustment.outputChannel + "Output";
      const total = ["Red", "Green", "Blue"].reduce((sum, channel) => {
        return sum + Number(this.content.querySelector('[data-adjustment-property="' + prefix + channel + '"][type="range"]')?.value || 0);
      }, 0);
      const output = this.content.querySelector("[data-channel-mixer-total]");
      if (output) output.textContent = this.formatPropertyValue("total", total) + "%";
    }

    levelsControls(adjustment, disabled) {
      const channel = namespace.ImageEditorAdjustmentModel.LEVELS_CHANNELS.includes(adjustment.channel) ? adjustment.channel : "rgb";
      const options = [["rgb", "RGB"], ["red", "Red"], ["green", "Green"], ["blue", "Blue"]];
      return '<div class="image-editor-levels-properties"><div class="image-editor-levels-channel"><select data-adjustment-select="levelsChannel"' + disabled + '>' +
        options.map(([value, label]) => '<option value="' + value + '"' + (channel === value ? " selected" : "") + '>' + label + '</option>').join("") +
        '</select><button type="button" data-adjustment-panel-action="levels-auto"' + disabled + '>Auto</button></div><canvas class="image-editor-levels-histogram" width="232" height="92" aria-label="' + channel.toUpperCase() + ' histogram"></canvas>' +
        this.propertyControl("Input Black", channel + "InputBlack", 0, 254, adjustment[channel + "InputBlack"], disabled) +
        this.propertyControl("Gamma", channel + "Gamma", .1, 9.99, adjustment[channel + "Gamma"], disabled, .01) +
        this.propertyControl("Input White", channel + "InputWhite", 1, 255, adjustment[channel + "InputWhite"], disabled) +
        this.propertyControl("Output Black", channel + "OutputBlack", 0, 254, adjustment[channel + "OutputBlack"], disabled) +
        this.propertyControl("Output White", channel + "OutputWhite", 1, 255, adjustment[channel + "OutputWhite"], disabled) + '</div>';
    }

    autoLevelsPatch(adjustment) {
      const channel = namespace.ImageEditorAdjustmentModel.LEVELS_CHANNELS.includes(adjustment.channel) ? adjustment.channel : "rgb";
      const histogram = this.getHistogram(channel);
      const prefix = channel;
      if (!Array.isArray(histogram) || histogram.length !== 256) {
        return { [prefix + "InputBlack"]: 0, [prefix + "Gamma"]: 1, [prefix + "InputWhite"]: 255, [prefix + "OutputBlack"]: 0, [prefix + "OutputWhite"]: 255 };
      }
      const total = histogram.reduce((sum, count) => sum + count, 0);
      const threshold = total * .005;
      let low = 0;
      let high = 255;
      let accumulated = 0;
      while (low < 255 && accumulated + histogram[low] <= threshold) accumulated += histogram[low++];
      accumulated = 0;
      while (high > 0 && accumulated + histogram[high] <= threshold) accumulated += histogram[high--];
      if (low >= high) { low = 0; high = 255; }
      return { [prefix + "InputBlack"]: low, [prefix + "Gamma"]: 1, [prefix + "InputWhite"]: high, [prefix + "OutputBlack"]: 0, [prefix + "OutputWhite"]: 255 };
    }

    drawLevelsHistogram(adjustment) {
      const canvas = this.content.querySelector(".image-editor-levels-histogram");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const histogram = this.getHistogram(adjustment.channel);
      context.fillStyle = "#383838";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (!Array.isArray(histogram) || histogram.length !== 256) return;
      const maximum = Math.max(1, ...histogram);
      context.fillStyle = { red: "#ef6666", green: "#62d67a", blue: "#6c8cff" }[adjustment.channel] || "#c8c8c8";
      histogram.forEach((count, index) => {
        const height = Math.round(count / maximum * (canvas.height - 4));
        context.fillRect(index * canvas.width / 256, canvas.height - height, Math.max(1, canvas.width / 256), height);
      });
    }

    propertyControl(label, property, minimum, maximum, value, disabled, step = 1) {
      const display = this.formatPropertyValue(property, value);
      return '<label class="image-editor-adjustment-property"><span>' + label + '<output data-adjustment-output="' + property + '">' + display + '</output></span><div><input type="range" min="' + minimum + '" max="' + maximum + '" step="' + step + '" value="' + value + '" data-adjustment-property="' + property + '"' + disabled + '><input type="number" min="' + minimum + '" max="' + maximum + '" step="' + step + '" value="' + value + '" data-adjustment-property="' + property + '"' + disabled + '></div></label>';
    }

    reveal(tab = this.state.activeTab) {
      this.state.mode = "expanded";
      this.state.activeTab = tab;
      this.applyState();
      this.render();
      this.reportState();
    }

    toggle() {
      if (this.state.mode === "hidden") this.reveal("effects");
      else {
        this.state.mode = "hidden";
        this.applyState();
        this.reportState();
      }
    }

    occupiedHeight() {
      if (this.state.mode === "hidden") return 0;
      return this.state.mode === "minimized" ? 35 : this.state.height;
    }

    applyState() {
      this.element.hidden = this.state.mode === "hidden";
      this.element.classList.toggle("minimized", this.state.mode === "minimized");
      this.element.style.height = this.state.height + "px";
      this.onLayoutChanged(this.occupiedHeight());
    }

    reportState() {
      this.onStateChanged({ ...this.state });
      this.onLayoutChanged(this.occupiedHeight());
    }

    destroy() {
      this.unsubscribe?.();
      this.element.remove();
    }
  }

  namespace.ImageEditorAdjustmentsPanel = ImageEditorAdjustmentsPanel;
})(typeof window !== "undefined" ? window : globalThis);
