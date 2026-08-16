const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class TestImageData {
  constructor(dataOrWidth, widthOrHeight, height) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height;
    }
  }
}

function loadAdjustments() {
  let nextId = 0;
  const context = {
    window: {},
    ImageData: TestImageData,
    Uint8ClampedArray,
    Map,
    Set,
    structuredClone,
    crypto: { randomUUID: () => "id-" + ++nextId }
  };
  context.window.window = context.window;
  context.window.ImageData = TestImageData;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  [
    "document-model.js",
    "adjustments/adjustment-model.js",
    "document-store.js",
    "../selection-shapes.js",
    "adjustments/adjustment-renderer.js",
    "adjustments/brightness-contrast-adjustment.js",
    "adjustments/exposure-adjustment.js",
    "adjustments/vibrance-adjustment.js",
    "adjustments/hue-saturation-adjustment.js",
    "adjustments/color-balance-adjustment.js",
    "adjustments/black-white-adjustment.js",
    "adjustments/channel-mixer-adjustment.js",
    "adjustments/levels-adjustment.js",
    "adjustments/curves-adjustment.js",
    "adjustments/photo-filter-adjustment.js",
    "adjustments/invert-adjustment.js",
    "adjustments/selective-color-adjustment.js",
    "adjustments/match-color-adjustment.js",
    "../color-range-selection.js",
    "adjustments/replace-color-adjustment.js",
    "adjustments/adjustment-mask-editor.js",
    "adjustments/adjustment-operations.js"
  ].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers", name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

function pixel(red, green, blue, alpha = 255) {
  return new TestImageData(new Uint8ClampedArray([red, green, blue, alpha]), 1, 1);
}

test("version-one documents migrate and adjustment layers validate in version two", () => {
  const editor = loadAdjustments();
  const document = editor.createImageDocument(8, 6);
  document.version = 1;
  const store = new editor.ImageEditorDocumentStore(document);

  assert.equal(store.document.version, 2);
  const adjustment = store.addAdjustmentLayer("brightness-contrast");
  assert.equal(adjustment.kind, "adjustment");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), {
    type: "brightness-contrast",
    brightness: 0,
    contrast: 0
  });
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("selection-aware adjustment creation preserves hierarchy placement and mask assets", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(4, 4, "transparent"));
  const content = store.addLayer("Content");
  store.select(content.id);
  const adjustment = store.addAdjustmentLayer("brightness-contrast", {
    selectionRegion: { x: 1, y: 1, width: 2, height: 2, shape: "rectangle", rotation: 0, inverted: false }
  });

  assert.equal(store.document.nodes[0].id, adjustment.id);
  assert.equal(store.document.nodes[1].id, content.id);
  assert.equal(adjustment.mask.defaultValue, 0);
  assert.ok(adjustment.mask.assetId);
  assert.equal(editor.referencedAssetIds(store.document).has(adjustment.mask.assetId), true);
  assert.deepEqual(JSON.parse(JSON.stringify(store.adjustmentTarget)), { nodeId: adjustment.id, part: "adjustment" });

  store.selectAdjustmentPart(adjustment.id, "mask");
  const snapshot = store.snapshot();
  store.restore(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(store.adjustmentTarget)), { nodeId: adjustment.id, part: "mask" });
});

test("brightness and contrast preserve alpha and honor their documented extremes", () => {
  const editor = loadAdjustments();
  const bright = new TestImageData(new Uint8ClampedArray([80, 120, 160, 255, 40, 60, 80, 0]), 2, 1);
  editor.ImageEditorBrightnessContrastAdjustment.render(bright, { brightness: 150, contrast: 0 });
  assert.deepEqual([...bright.data], [255, 255, 255, 255, 40, 60, 80, 0]);

  const dark = pixel(80, 120, 160);
  editor.ImageEditorBrightnessContrastAdjustment.render(dark, { brightness: -150, contrast: 0 });
  assert.deepEqual([...dark.data], [0, 0, 0, 255]);

  const flat = pixel(10, 200, 250);
  editor.ImageEditorBrightnessContrastAdjustment.render(flat, { brightness: 0, contrast: -50 });
  assert.deepEqual([...flat.data], [128, 128, 128, 255]);
});

test("exposure adjustment applies stops, offset, and gamma without changing transparent pixels", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(2, 1));
  const adjustment = store.addAdjustmentLayer("exposure");
  assert.equal(adjustment.name, "Exposure");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), { type: "exposure", exposure: 0, offset: 0, gamma: 1 });

  const exposed = new TestImageData(new Uint8ClampedArray([64, 64, 64, 255, 40, 60, 80, 0]), 2, 1);
  editor.ImageEditorExposureAdjustment.render(exposed, { exposure: 1, offset: 0, gamma: 1 });
  assert.deepEqual([...exposed.data], [128, 128, 128, 255, 40, 60, 80, 0]);

  const offset = pixel(0, 0, 0);
  editor.ImageEditorExposureAdjustment.render(offset, { exposure: 0, offset: .25, gamma: 1 });
  assert.deepEqual([...offset.data], [64, 64, 64, 255]);

  const gamma = pixel(64, 64, 64);
  editor.ImageEditorExposureAdjustment.render(gamma, { exposure: 0, offset: 0, gamma: 2 });
  assert.deepEqual([...gamma.data], [128, 128, 128, 255]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("vibrance favors muted colors while saturation can remove all chroma", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("vibrance");
  assert.equal(adjustment.name, "Vibrance");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), { type: "vibrance", vibrance: 0, saturation: 0 });

  const muted = pixel(80, 100, 120);
  editor.ImageEditorVibranceAdjustment.render(muted, { vibrance: 100, saturation: 0 });
  assert.ok(muted.data[2] - muted.data[0] > 40);

  const saturated = pixel(0, 100, 255);
  editor.ImageEditorVibranceAdjustment.render(saturated, { vibrance: 100, saturation: 0 });
  assert.deepEqual([...saturated.data], [0, 100, 255, 255]);

  const desaturated = new TestImageData(new Uint8ClampedArray([100, 80, 60, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorVibranceAdjustment.render(desaturated, { vibrance: 0, saturation: -100 });
  assert.deepEqual([...desaturated.data], [83, 83, 83, 255, 20, 30, 40, 0]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("hue and saturation support color families, lightness, colorize, and transparent pixels", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("hue-saturation");
  assert.equal(adjustment.name, "Hue/Saturation");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), {
    type: "hue-saturation", hue: 0, saturation: 0, lightness: 0, colorize: false, range: "master"
  });

  const shifted = pixel(255, 0, 0);
  editor.ImageEditorHueSaturationAdjustment.render(shifted, { hue: 120, saturation: 0, lightness: 0, range: "master" });
  assert.deepEqual([...shifted.data], [0, 255, 0, 255]);

  const ranged = new TestImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1);
  editor.ImageEditorHueSaturationAdjustment.render(ranged, { hue: 120, saturation: 0, lightness: 0, range: "reds" });
  assert.deepEqual([...ranged.data], [0, 255, 0, 255, 0, 0, 255, 255]);

  const desaturated = pixel(255, 0, 0);
  editor.ImageEditorHueSaturationAdjustment.render(desaturated, { hue: 0, saturation: -100, lightness: 0, range: "master" });
  assert.deepEqual([...desaturated.data], [128, 128, 128, 255]);

  const light = pixel(20, 40, 60);
  editor.ImageEditorHueSaturationAdjustment.render(light, { hue: 0, saturation: 0, lightness: 100, range: "master" });
  assert.deepEqual([...light.data], [255, 255, 255, 255]);

  const colorized = new TestImageData(new Uint8ClampedArray([128, 128, 128, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorHueSaturationAdjustment.render(colorized, { hue: 120, saturation: 100, lightness: 0, colorize: true, range: "blues" });
  assert.deepEqual([...colorized.data], [1, 255, 1, 255, 20, 30, 40, 0]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("color balance edits separate tone ranges and can preserve luminosity", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("color-balance");
  assert.equal(adjustment.name, "Color Balance");
  assert.equal(adjustment.adjustment.tone, "midtones");
  assert.equal(adjustment.adjustment.preserveLuminosity, true);
  assert.equal(adjustment.adjustment.midtonesCyanRed, 0);
  assert.equal(adjustment.adjustment.highlightsYellowBlue, 0);

  const redMidtone = pixel(128, 128, 128);
  editor.ImageEditorColorBalanceAdjustment.render(redMidtone, { midtonesCyanRed: 40, preserveLuminosity: true });
  assert.ok(redMidtone.data[0] > redMidtone.data[1]);
  assert.equal(redMidtone.data[1], redMidtone.data[2]);
  const originalLuminance = 128;
  const balancedLuminance = redMidtone.data[0] * .2126 + redMidtone.data[1] * .7152 + redMidtone.data[2] * .0722;
  assert.ok(Math.abs(balancedLuminance - originalLuminance) < 2);

  const cyanMidtone = pixel(128, 128, 128);
  editor.ImageEditorColorBalanceAdjustment.render(cyanMidtone, { midtonesCyanRed: -40, preserveLuminosity: false });
  assert.ok(cyanMidtone.data[0] < cyanMidtone.data[1]);

  const tones = new TestImageData(new Uint8ClampedArray([32, 32, 32, 255, 224, 224, 224, 255]), 2, 1);
  editor.ImageEditorColorBalanceAdjustment.render(tones, { shadowsCyanRed: 100, preserveLuminosity: false });
  assert.ok(tones.data[0] - tones.data[1] > tones.data[4] - tones.data[5]);

  const transparent = pixel(20, 30, 40, 0);
  editor.ImageEditorColorBalanceAdjustment.render(transparent, { midtonesYellowBlue: 100, preserveLuminosity: false });
  assert.deepEqual([...transparent.data], [20, 30, 40, 0]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("black and white mixes hue families, supports tinting, and preserves transparency", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("black-white");
  assert.equal(adjustment.name, "Black & White");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), {
    type: "black-white", reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, tint: false, tintColor: "#d8c5a0"
  });

  const colors = new TestImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 20, 30, 40, 0]), 3, 1);
  editor.ImageEditorBlackWhiteAdjustment.render(colors, adjustment.adjustment);
  assert.deepEqual([...colors.data], [102, 102, 102, 255, 51, 51, 51, 255, 20, 30, 40, 0]);

  const lighterRed = pixel(255, 0, 0);
  editor.ImageEditorBlackWhiteAdjustment.render(lighterRed, { reds: 80 });
  assert.deepEqual([...lighterRed.data], [204, 204, 204, 255]);

  const tinted = pixel(255, 0, 0);
  editor.ImageEditorBlackWhiteAdjustment.render(tinted, { reds: 40, tint: true, tintColor: "#ff0000" });
  assert.ok(tinted.data[0] > tinted.data[1]);
  assert.equal(tinted.data[1], tinted.data[2]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("channel mixer applies independent RGB matrices, constants, and monochrome output", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("channel-mixer");
  assert.equal(adjustment.name, "Channel Mixer");
  assert.equal(adjustment.adjustment.outputChannel, "red");
  assert.equal(adjustment.adjustment.redOutputRed, 100);
  assert.equal(adjustment.adjustment.greenOutputGreen, 100);
  assert.equal(adjustment.adjustment.blueOutputBlue, 100);
  assert.equal(adjustment.adjustment.monochrome, false);

  const identity = new TestImageData(new Uint8ClampedArray([64, 96, 128, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorChannelMixerAdjustment.render(identity, adjustment.adjustment);
  assert.deepEqual([...identity.data], [64, 96, 128, 255, 20, 30, 40, 0]);

  const remixed = pixel(64, 96, 128);
  editor.ImageEditorChannelMixerAdjustment.render(remixed, { redOutputRed: 0, redOutputGreen: 100, redOutputBlue: 0 });
  assert.deepEqual([...remixed.data], [96, 96, 128, 255]);

  const constant = pixel(0, 0, 0);
  editor.ImageEditorChannelMixerAdjustment.render(constant, { redOutputConstant: 25 });
  assert.deepEqual([...constant.data], [64, 0, 0, 255]);

  const monochrome = pixel(64, 96, 128);
  editor.ImageEditorChannelMixerAdjustment.render(monochrome, { monochrome: true, monochromeRed: 40, monochromeGreen: 40, monochromeBlue: 20 });
  assert.deepEqual([...monochrome.data], [90, 90, 90, 255]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("levels applies composite and channel mappings and calculates opaque histograms", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("levels");
  assert.equal(adjustment.name, "Levels");
  assert.equal(adjustment.adjustment.channel, "rgb");
  assert.equal(adjustment.adjustment.rgbInputBlack, 0);
  assert.equal(adjustment.adjustment.rgbGamma, 1);
  assert.equal(adjustment.adjustment.rgbInputWhite, 255);

  const identity = new TestImageData(new Uint8ClampedArray([64, 128, 192, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorLevelsAdjustment.render(identity, adjustment.adjustment);
  assert.deepEqual([...identity.data], [64, 128, 192, 255, 20, 30, 40, 0]);

  const gamma = pixel(128, 128, 128);
  editor.ImageEditorLevelsAdjustment.render(gamma, { rgbGamma: 2 });
  assert.deepEqual([...gamma.data], [181, 181, 181, 255]);

  const redChannel = pixel(64, 128, 192);
  editor.ImageEditorLevelsAdjustment.render(redChannel, { redInputBlack: 64, redInputWhite: 255 });
  assert.deepEqual([...redChannel.data], [0, 128, 192, 255]);

  const output = pixel(0, 255, 128);
  editor.ImageEditorLevelsAdjustment.render(output, { rgbOutputBlack: 64, rgbOutputWhite: 192 });
  assert.deepEqual([...output.data], [64, 192, 128, 255]);

  const histogram = editor.ImageEditorLevelsAdjustment.histogram(new TestImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 10, 20, 30, 0]), 3, 1), "red");
  assert.equal(histogram[255], 1);
  assert.equal(histogram[0], 1);
  assert.equal(histogram.reduce((sum, count) => sum + count, 0), 2);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("curves creates smooth composite and channel mappings with normalized control points", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("curves");
  assert.equal(adjustment.name, "Curves");
  assert.equal(adjustment.adjustment.channel, "rgb");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment.rgbPoints)), [{ x: 0, y: 0 }, { x: 255, y: 255 }]);

  const identity = new TestImageData(new Uint8ClampedArray([64, 128, 192, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorCurvesAdjustment.render(identity, adjustment.adjustment);
  assert.deepEqual([...identity.data], [64, 128, 192, 255, 20, 30, 40, 0]);

  const lifted = pixel(128, 128, 128);
  editor.ImageEditorCurvesAdjustment.render(lifted, { rgbPoints: [{ x: 0, y: 0 }, { x: 128, y: 192 }, { x: 255, y: 255 }] });
  assert.deepEqual([...lifted.data], [192, 192, 192, 255]);

  const redOnly = pixel(128, 128, 128);
  editor.ImageEditorCurvesAdjustment.render(redOnly, { redPoints: [{ x: 0, y: 0 }, { x: 128, y: 64 }, { x: 255, y: 255 }] });
  assert.deepEqual([...redOnly.data], [64, 128, 128, 255]);

  const normalized = editor.ImageEditorAdjustmentModel.normalizeCurvePoints([{ x: 128, y: 200 }, { x: 128, y: 180 }, { x: 300, y: -2 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), [{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 0 }]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("photo filter supports presets, custom colors, density, and luminosity preservation", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("photo-filter");
  assert.equal(adjustment.name, "Photo Filter");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), {
    type: "photo-filter", filterMode: "filter", filter: "warming-85", color: "#ec8a00", density: 25, preserveLuminosity: true
  });

  const custom = new TestImageData(new Uint8ClampedArray([128, 128, 128, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorPhotoFilterAdjustment.render(custom, { filterMode: "color", color: "#ff0000", density: 100, preserveLuminosity: false });
  assert.deepEqual([...custom.data], [255, 0, 0, 255, 20, 30, 40, 0]);

  const preserved = pixel(128, 128, 128);
  editor.ImageEditorPhotoFilterAdjustment.render(preserved, { filterMode: "color", color: "#ff0000", density: 100, preserveLuminosity: true });
  assert.deepEqual([...preserved.data], [255, 94, 94, 255]);

  const green = pixel(128, 128, 128);
  editor.ImageEditorPhotoFilterAdjustment.render(green, { filterMode: "filter", filter: "green", density: 100, preserveLuminosity: false });
  assert.deepEqual([...green.data], [0, 176, 80, 255]);
  assert.equal(editor.ImageEditorPhotoFilterAdjustment.resolveColor({ filter: "cooling-80" }), "#006dff");
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("invert reverses opaque RGB channels while preserving transparent pixels", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("invert");
  assert.equal(adjustment.name, "Invert");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), { type: "invert" });

  const pixels = new TestImageData(new Uint8ClampedArray([32, 64, 96, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorInvertAdjustment.render(pixels);
  assert.deepEqual([...pixels.data], [223, 191, 159, 255, 20, 30, 40, 0]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("selective color retains independent family corrections and supports relative and absolute methods", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("selective-color");
  assert.equal(adjustment.name, "Selective Color");
  assert.equal(adjustment.adjustment.selectedColor, "reds");
  assert.equal(adjustment.adjustment.relative, true);
  assert.equal(adjustment.adjustment.redsCyan, 0);
  assert.equal(adjustment.adjustment.bluesYellow, 0);
  assert.equal(adjustment.adjustment.neutralsBlack, 0);

  const blue = pixel(0, 0, 255);
  editor.ImageEditorSelectiveColorAdjustment.render(blue, { bluesYellow: 100, relative: true });
  assert.deepEqual([...blue.data], [0, 0, 0, 255]);

  const red = pixel(255, 0, 0);
  editor.ImageEditorSelectiveColorAdjustment.render(red, { redsCyan: 100, relative: true });
  assert.deepEqual([...red.data], [0, 0, 0, 255]);

  const relativeGray = pixel(128, 128, 128);
  editor.ImageEditorSelectiveColorAdjustment.render(relativeGray, { neutralsBlack: 50, relative: true });
  assert.deepEqual([...relativeGray.data], [64, 64, 64, 255]);

  const absoluteGray = new TestImageData(new Uint8ClampedArray([128, 128, 128, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorSelectiveColorAdjustment.render(absoluteGray, { neutralsBlack: 50, relative: false });
  assert.deepEqual([...absoluteGray.data], [1, 1, 1, 255, 20, 30, 40, 0]);

  store.updateAdjustment(adjustment.id, { selectedColor: "blues", bluesYellow: 75, redsCyan: -20, relative: false });
  assert.equal(adjustment.adjustment.bluesYellow, 75);
  assert.equal(adjustment.adjustment.redsCyan, -20);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("match color transfers stored source statistics with luminance, intensity, fade, and neutralization", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("match-color");
  assert.equal(adjustment.name, "Match Color");
  assert.equal(adjustment.adjustment.sourceNodeId, null);
  assert.equal(adjustment.adjustment.luminance, 100);
  assert.equal(adjustment.adjustment.colorIntensity, 100);
  assert.equal(adjustment.adjustment.fade, 0);
  assert.equal(adjustment.adjustment.neutralize, false);

  const source = new TestImageData(new Uint8ClampedArray([200, 50, 25, 255, 100, 150, 225, 255]), 2, 1);
  const statistics = editor.ImageEditorMatchColorAdjustment.statistics(source);
  const patch = editor.ImageEditorMatchColorAdjustment.sourcePatch("source-layer", "Source layer", statistics);
  store.updateAdjustment(adjustment.id, patch);

  const matched = new TestImageData(new Uint8ClampedArray([128, 128, 128, 255, 20, 30, 40, 0]), 2, 1);
  editor.ImageEditorMatchColorAdjustment.render(matched, adjustment.adjustment);
  assert.deepEqual([...matched.data], [150, 100, 125, 255, 20, 30, 40, 0]);

  const faded = pixel(128, 128, 128);
  editor.ImageEditorMatchColorAdjustment.render(faded, { ...adjustment.adjustment, fade: 50 });
  assert.deepEqual([...faded.data], [139, 114, 126, 255]);

  const neutralized = pixel(128, 128, 128);
  editor.ImageEditorMatchColorAdjustment.render(neutralized, { ...adjustment.adjustment, neutralize: true });
  assert.deepEqual([...neutralized.data], [112, 112, 112, 255]);
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("replace color limits HSL changes to colors within the configured fuzziness", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(1, 1));
  const adjustment = store.addAdjustmentLayer("replace-color");
  assert.equal(adjustment.name, "Replace Color");
  assert.deepEqual(JSON.parse(JSON.stringify(adjustment.adjustment)), {
    type: "replace-color", sourceColor: "#000000", fuzziness: 40, hue: 0, saturation: 0, lightness: 0
  });

  store.updateAdjustment(adjustment.id, { sourceColor: "#ff0000", fuzziness: 0, hue: 120 });
  const pixels = new TestImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 20, 30, 40, 0]), 3, 1);
  editor.ImageEditorReplaceColorAdjustment.render(pixels, adjustment.adjustment);
  assert.deepEqual([...pixels.data], [0, 255, 0, 255, 0, 0, 255, 255, 20, 30, 40, 0]);

  store.updateAdjustment(adjustment.id, { fuzziness: 200, hue: 0, saturation: -100, lightness: 0 });
  const nearRed = pixel(240, 20, 10);
  editor.ImageEditorReplaceColorAdjustment.render(nearRed, adjustment.adjustment);
  assert.ok(Math.max(nearRed.data[0], nearRed.data[1], nearRed.data[2]) - Math.min(nearRed.data[0], nearRed.data[1], nearRed.data[2]) < 230);
  assert.equal(editor.ImageEditorReplaceColorAdjustment.resultColor({ sourceColor: "#ff0000", hue: 120 }), "#00ff00");
  assert.equal(editor.validateImageDocument(store.document), true);
});

test("adjustment masks blend black, gray, and white strengths without changing alpha", () => {
  const editor = loadAdjustments();
  const apply = (maskValue) => {
    const pixels = pixel(100, 100, 100);
    const context = {
      canvas: { width: 1, height: 1 },
      getImageData() { return new TestImageData(new Uint8ClampedArray(pixels.data), 1, 1); },
      putImageData(value) { pixels.data.set(value.data); }
    };
    const node = editor.ImageEditorAdjustmentModel.create("brightness-contrast", {
      adjustment: { brightness: 150, contrast: 0 },
      mask: { defaultValue: maskValue }
    });
    editor.ImageEditorAdjustmentRenderer.apply(context, node, new Map());
    return [...pixels.data];
  };

  assert.deepEqual(apply(0), [100, 100, 100, 255]);
  assert.deepEqual(apply(255), [255, 255, 255, 255]);
  assert.deepEqual(apply(128), [178, 178, 178, 255]);
});

test("mask reset, invert, selection fill, and lock behavior remain transactional assets", () => {
  const editor = loadAdjustments();
  const store = new editor.ImageEditorDocumentStore(editor.createImageDocument(3, 3));
  const adjustment = store.addAdjustmentLayer("brightness-contrast");

  assert.equal(store.updateAdjustmentMask(adjustment.id, { type: "black" }), true);
  assert.equal(adjustment.mask.defaultValue, 0);
  assert.equal(store.updateAdjustmentMask(adjustment.id, { type: "invert" }), true);
  assert.equal(adjustment.mask.defaultValue, 255);
  assert.equal(store.updateAdjustmentMask(adjustment.id, {
    type: "fill-region",
    value: 0,
    region: { x: 1, y: 1, width: 1, height: 1, shape: "rectangle", rotation: 0, inverted: false }
  }), true);
  assert.ok(adjustment.mask.assetId);

  adjustment.locked = true;
  assert.equal(store.updateAdjustment(adjustment.id, { brightness: 20 }), false);
  assert.equal(store.updateAdjustmentMask(adjustment.id, { type: "white" }), false);
});
