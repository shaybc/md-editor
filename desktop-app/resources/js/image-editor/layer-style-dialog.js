// App-styled editor for non-destructive layer effects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorLayerStyleDialog {
    constructor() {
      this.overlay = document.createElement("div");
      this.overlay.className = "image-editor-layer-style-overlay hidden";
      this.overlay.innerHTML = `<section class="image-editor-layer-style-dialog" role="dialog" aria-modal="true" aria-labelledby="image-editor-layer-style-title">
        <header><div><h2 id="image-editor-layer-style-title">Layer Style</h2><p class="image-editor-layer-style-target"></p></div><button type="button" data-layer-style-action="cancel" aria-label="Close"><i class="bi bi-x-lg"></i></button></header>
        <div class="image-editor-layer-style-body">
          <nav><button type="button" class="selected"><i class="bi bi-check-square"></i> <span class="image-editor-layer-style-name">Cast Shadow</span></button></nav>
          <form>
            <label class="image-editor-layer-style-enabled"><input name="enabled" type="checkbox"> <span class="image-editor-layer-style-enabled-name">Enable Cast Shadow</span></label>
            <div class="image-editor-layer-style-grid">
              <label>Blend mode<select name="blendMode"><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="normal">Normal</option></select></label>
              <label data-color-field>Color<input name="color" type="color"></label>
              <label>Opacity <output data-output="opacity"></output><input name="opacity" type="range" min="0" max="100"></label>
              <label data-directional-shadow-field>Angle <output data-output="angle"></output><input name="angle" type="range" min="0" max="359"></label>
              <label data-directional-shadow-field>Distance <output data-output="distance"></output><input name="distance" type="range" min="0" max="200"></label>
              <label>Spread <output data-output="spread"></output><input name="spread" type="range" min="0" max="100"></label>
              <label data-choke-field hidden>Choke <output data-output="choke"></output><input name="choke" type="range" min="0" max="100"></label>
              <label data-size-field>Size <output data-output="blur"></output><input name="blur" type="range" min="0" max="200"></label>
              <label data-pattern-field hidden>Pattern<select name="patternType"><option value="crosshatch">Crosshatch</option><option value="halftone">Halftone</option><option value="grain">Grain</option><option value="mosaic">Mosaic</option><option value="stained-glass">Stained glass</option><option value="pointillize">Pointillize</option></select></label>
              <label data-pattern-field hidden>Foreground<input name="foregroundColor" type="color"></label>
              <label data-pattern-field hidden>Background<input name="backgroundColor" type="color"></label>
              <label data-pattern-field hidden>Scale <output data-output="scale"></output><input name="scale" type="range" min="10" max="400"></label>
              <label data-pattern-field hidden>Angle <output data-output="patternAngle"></output><input name="patternAngle" type="range" min="0" max="359"></label>
              <label data-pattern-field hidden>Density <output data-output="density"></output><input name="density" type="range" min="10" max="90"></label>
              <label data-pattern-field hidden>Offset X<input name="offsetX" type="number" min="-4096" max="4096"></label>
              <label data-pattern-field hidden>Offset Y<input name="offsetY" type="number" min="-4096" max="4096"></label>
              <label data-gradient-field hidden>Style<select name="gradientStyle"><option value="linear">Linear</option><option value="radial">Radial</option><option value="angle">Angle</option><option value="reflected">Reflected</option><option value="diamond">Diamond</option></select></label>
              <label data-gradient-field hidden>Start color<input name="gradientStartColor" type="color"></label>
              <label data-gradient-field hidden>End color<input name="gradientEndColor" type="color"></label>
              <label data-gradient-field hidden>Angle <output data-output="gradientAngle"></output><input name="gradientAngle" type="range" min="0" max="359"></label>
              <label data-gradient-field hidden>Scale <output data-output="gradientScale"></output><input name="gradientScale" type="range" min="10" max="400"></label>
              <label data-gradient-field hidden>Offset X<input name="gradientOffsetX" type="number" min="-4096" max="4096"></label>
              <label data-gradient-field hidden>Offset Y<input name="gradientOffsetY" type="number" min="-4096" max="4096"></label>
              <label data-bevel-field hidden>Style<select name="bevelStyle"><option value="inner-bevel">Inner Bevel</option><option value="outer-bevel">Outer Bevel</option><option value="emboss">Emboss</option><option value="pillow-emboss">Pillow Emboss</option><option value="stroke-emboss">Stroke Emboss</option></select></label>
              <label data-bevel-field hidden>Technique<select name="bevelTechnique"><option value="smooth">Smooth</option><option value="chisel-hard">Chisel Hard</option><option value="chisel-soft">Chisel Soft</option></select></label>
              <label data-bevel-field hidden>Depth <output data-output="depth"></output><input name="depth" type="range" min="1" max="1000"></label>
              <label data-bevel-field hidden>Direction<select name="direction"><option value="up">Up</option><option value="down">Down</option></select></label>
              <label data-bevel-field hidden>Size <output data-output="bevelSize"></output><input name="bevelSize" type="range" min="0" max="250"></label>
              <label data-bevel-field hidden>Soften <output data-output="soften"></output><input name="soften" type="range" min="0" max="50"></label>
              <label data-bevel-field hidden>Angle <output data-output="bevelAngle"></output><input name="bevelAngle" type="range" min="0" max="359"></label>
              <label data-bevel-field hidden>Altitude <output data-output="altitude"></output><input name="altitude" type="range" min="0" max="90"></label>
              <label data-bevel-field hidden>Gloss contour<select name="glossContour"><option value="linear">Linear</option><option value="cone">Cone</option><option value="ring">Ring</option></select></label>
              <label data-bevel-field hidden>Highlight mode<select name="highlightBlendMode"><option value="screen">Screen</option><option value="normal">Normal</option></select></label>
              <label data-bevel-field hidden>Highlight color<input name="highlightColor" type="color"></label>
              <label data-bevel-field hidden>Highlight opacity <output data-output="highlightOpacity"></output><input name="highlightOpacity" type="range" min="0" max="100"></label>
              <label data-bevel-field hidden>Shadow mode<select name="shadowBlendMode"><option value="multiply">Multiply</option><option value="normal">Normal</option></select></label>
              <label data-bevel-field hidden>Shadow color<input name="shadowColor" type="color"></label>
              <label data-bevel-field hidden>Shadow opacity <output data-output="shadowOpacity"></output><input name="shadowOpacity" type="range" min="0" max="100"></label>
              <label data-blur-effect-field hidden>Radius <output data-output="radius"></output><input name="radius" type="range" min="0" max="250" step="0.1"></label>
              <label data-grain-effect-field hidden>Amount <output data-output="grainAmount"></output><input name="grainAmount" type="range" min="0" max="100" step="0.1"></label>
              <fieldset class="image-editor-grain-distribution" data-grain-effect-field hidden><legend>Distribution</legend><label><input name="grainDistribution" type="radio" value="uniform"> Uniform</label><label><input name="grainDistribution" type="radio" value="gaussian"> Gaussian</label></fieldset>
              <label class="image-editor-grain-monochromatic" data-grain-effect-field hidden><input name="grainMonochromatic" type="checkbox"> Monochromatic</label>
              <label data-newspaper-effect-field hidden>Dot size <output data-output="newspaperDotSize"></output><input name="newspaperDotSize" type="range" min="2" max="40" step="1"></label>
              <label data-newspaper-effect-field hidden>Contrast <output data-output="newspaperContrast"></output><input name="newspaperContrast" type="range" min="0" max="100" step="1"></label>
              <label data-newspaper-effect-field hidden>Screen angle <output data-output="newspaperAngle"></output><input name="newspaperAngle" type="range" min="0" max="89" step="1"></label>
              <label data-newspaper-effect-field hidden>Ink color<input name="newspaperInkColor" type="color"></label>
              <label data-newspaper-effect-field hidden>Paper color<input name="newspaperPaperColor" type="color"></label>
              <label data-snow-effect-field hidden>Density <output data-output="snowDensity"></output><input name="snowDensity" type="range" min="0" max="100" step="1"></label>
              <label data-snow-effect-field hidden>Flake size <output data-output="snowFlakeSize"></output><input name="snowFlakeSize" type="range" min="1" max="20" step="0.5"></label>
              <label data-snow-effect-field hidden>Depth <output data-output="snowDepth"></output><input name="snowDepth" type="range" min="0" max="100" step="1"></label>
              <label data-snow-effect-field hidden>Fall angle <output data-output="snowAngle"></output><input name="snowAngle" type="range" min="-90" max="90" step="1"></label>
              <label data-snow-effect-field hidden>Motion <output data-output="snowMotion"></output><input name="snowMotion" type="range" min="0" max="40" step="1"></label>
              <label data-snow-effect-field hidden>Brightness <output data-output="snowBrightness"></output><input name="snowBrightness" type="range" min="0" max="100" step="1"></label>
              <label data-rain-effect-field hidden>Amount <output data-output="rainAmount"></output><input name="rainAmount" type="range" min="0" max="100" step="1"></label>
              <label data-rain-effect-field hidden>Drop length <output data-output="rainLength"></output><input name="rainLength" type="range" min="1" max="250" step="1"></label>
              <label data-rain-effect-field hidden>Thickness <output data-output="rainThickness"></output><input name="rainThickness" type="range" min="0.25" max="8" step="0.25"></label>
              <label data-rain-effect-field hidden>Direction <output data-output="rainAngle"></output><input name="rainAngle" type="range" min="-180" max="180" step="1"></label>
              <label data-rain-effect-field hidden>Brightness <output data-output="rainBrightness"></output><input name="rainBrightness" type="range" min="0" max="100" step="1"></label>
              <input data-rain-effect-field name="rainSeed" type="hidden">
              <button class="image-editor-ripple-randomize" data-rain-effect-field data-layer-style-action="randomize-rain" type="button" hidden>Randomize</button>
              <label data-rainbow-effect-field hidden>Horizontal position <output data-output="rainbowPositionX"></output><input name="rainbowPositionX" type="range" min="0" max="100" step="1"></label>
              <label data-rainbow-effect-field hidden>Vertical position <output data-output="rainbowPositionY"></output><input name="rainbowPositionY" type="range" min="0" max="140" step="1"></label>
              <label data-rainbow-effect-field hidden>Scale <output data-output="rainbowScale"></output><input name="rainbowScale" type="range" min="20" max="200" step="1"></label>
              <label data-rainbow-effect-field hidden>Band thickness <output data-output="rainbowThickness"></output><input name="rainbowThickness" type="range" min="2" max="50" step="1"></label>
              <label data-rainbow-effect-field hidden>Softness <output data-output="rainbowSoftness"></output><input name="rainbowSoftness" type="range" min="0" max="50" step="1"></label>
              <label data-rainbow-effect-field hidden>Horizon fade <output data-output="rainbowFade"></output><input name="rainbowFade" type="range" min="0" max="100" step="1"></label>
              <label data-rainbow-effect-field hidden>Intensity <output data-output="rainbowIntensity"></output><input name="rainbowIntensity" type="range" min="0" max="100" step="1"></label>
              <label data-spotlight-effect-field hidden>Horizontal position <output data-output="spotlightPositionX"></output><input name="spotlightPositionX" type="range" min="0" max="100" step="1"></label>
              <label data-spotlight-effect-field hidden>Vertical position <output data-output="spotlightPositionY"></output><input name="spotlightPositionY" type="range" min="0" max="100" step="1"></label>
              <label data-spotlight-effect-field hidden>Width <output data-output="spotlightWidth"></output><input name="spotlightWidth" type="range" min="5" max="200" step="1"></label>
              <label data-spotlight-effect-field hidden>Height <output data-output="spotlightHeight"></output><input name="spotlightHeight" type="range" min="5" max="200" step="1"></label>
              <label data-spotlight-effect-field hidden>Feather <output data-output="spotlightFeather"></output><input name="spotlightFeather" type="range" min="0" max="100" step="1"></label>
              <label data-spotlight-effect-field hidden>Brightness <output data-output="spotlightBrightness"></output><input name="spotlightBrightness" type="range" min="0" max="200" step="1"></label>
              <label data-spotlight-effect-field hidden>Light color<input name="spotlightColor" type="color"></label>
              <label data-vignette-effect-field hidden>Horizontal position <output data-output="vignettePositionX"></output><input name="vignettePositionX" type="range" min="0" max="100" step="1"></label>
              <label data-vignette-effect-field hidden>Vertical position <output data-output="vignettePositionY"></output><input name="vignettePositionY" type="range" min="0" max="100" step="1"></label>
              <label data-vignette-effect-field hidden>Width <output data-output="vignetteWidth"></output><input name="vignetteWidth" type="range" min="10" max="200" step="1"></label>
              <label data-vignette-effect-field hidden>Height <output data-output="vignetteHeight"></output><input name="vignetteHeight" type="range" min="10" max="200" step="1"></label>
              <label data-vignette-effect-field hidden>Clear center <output data-output="vignetteClearCenter"></output><input name="vignetteClearCenter" type="range" min="0" max="95" step="1"></label>
              <label data-vignette-effect-field hidden>Feather <output data-output="vignetteFeather"></output><input name="vignetteFeather" type="range" min="0" max="100" step="1"></label>
              <label data-vignette-effect-field hidden>Amount <output data-output="vignetteAmount"></output><input name="vignetteAmount" type="range" min="0" max="100" step="1"></label>
              <label data-vignette-effect-field hidden>Protect highlights <output data-output="vignetteHighlightProtection"></output><input name="vignetteHighlightProtection" type="range" min="0" max="100" step="1"></label>
              <label data-vignette-effect-field hidden>Edge color<input name="vignetteColor" type="color"></label>
              <label data-painted-texture-effect-field hidden>Stylization <output data-output="paintedStylization"></output><input name="paintedStylization" type="range" min="0" max="10" step="0.1"></label>
              <label data-painted-texture-effect-field hidden>Cleanliness <output data-output="paintedCleanliness"></output><input name="paintedCleanliness" type="range" min="0" max="10" step="0.1"></label>
              <label data-painted-texture-effect-field hidden>Scale <output data-output="paintedScale"></output><input name="paintedScale" type="range" min="0.1" max="10" step="0.1"></label>
              <label data-painted-texture-effect-field hidden>Bristle detail <output data-output="paintedBristleDetail"></output><input name="paintedBristleDetail" type="range" min="0" max="10" step="0.1"></label>
              <label class="image-editor-grain-monochromatic" data-painted-texture-effect-field hidden><input name="paintedLighting" type="checkbox"> Lighting</label>
              <label data-painted-texture-effect-field hidden>Light angle <output data-output="paintedAngle"></output><input name="paintedAngle" type="range" min="-180" max="180" step="1"></label>
              <label data-painted-texture-effect-field hidden>Shine <output data-output="paintedShine"></output><input name="paintedShine" type="range" min="0" max="10" step="0.1"></label>
              <label data-retro-3d-effect-field hidden>Separation <output data-output="retro3DSeparation"></output><input name="retro3DSeparation" type="range" min="0" max="100" step="1"></label>
              <label data-retro-3d-effect-field hidden>Direction <output data-output="retro3DAngle"></output><input name="retro3DAngle" type="range" min="-180" max="180" step="1"></label>
              <label data-retro-3d-effect-field hidden>Strength <output data-output="retro3DStrength"></output><input name="retro3DStrength" type="range" min="0" max="100" step="1"></label>
              <label data-retro-3d-effect-field hidden>Color pair<select name="retro3DColorPair"><option value="red-cyan">Red / Cyan</option><option value="green-magenta">Green / Magenta</option><option value="blue-yellow">Blue / Yellow</option></select></label>
              <label data-vortex-effect-field hidden>Angle <output data-output="vortexAngle"></output><input name="vortexAngle" type="range" min="-999" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Generators <output data-output="rippleGenerators"></output><input name="rippleGenerators" type="range" min="1" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Minimum wavelength <output data-output="rippleWavelengthMinimum"></output><input name="rippleWavelengthMinimum" type="range" min="1" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Maximum wavelength <output data-output="rippleWavelengthMaximum"></output><input name="rippleWavelengthMaximum" type="range" min="1" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Minimum amplitude <output data-output="rippleAmplitudeMinimum"></output><input name="rippleAmplitudeMinimum" type="range" min="0" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Maximum amplitude <output data-output="rippleAmplitudeMaximum"></output><input name="rippleAmplitudeMaximum" type="range" min="0" max="999" step="1"></label>
              <label data-ripple-effect-field hidden>Horizontal scale <output data-output="rippleHorizontalScale"></output><input name="rippleHorizontalScale" type="range" min="1" max="100" step="1"></label>
              <label data-ripple-effect-field hidden>Vertical scale <output data-output="rippleVerticalScale"></output><input name="rippleVerticalScale" type="range" min="1" max="100" step="1"></label>
              <label data-ripple-effect-field hidden>Waveform<select name="rippleWaveType"><option value="sine">Sine</option><option value="triangle">Triangle</option><option value="square">Square</option></select></label>
              <label data-ripple-effect-field hidden>Undefined areas<select name="rippleUndefinedAreas"><option value="repeat">Repeat edge pixels</option><option value="wrap">Wrap around</option></select></label>
              <input data-ripple-effect-field name="rippleSeed" type="hidden">
              <button class="image-editor-ripple-randomize" data-ripple-effect-field data-layer-style-action="randomize-ripple" type="button" hidden>Randomize</button>
              <label data-flare-effect-field hidden>Brightness <output data-output="flareBrightness"></output><input name="flareBrightness" type="range" min="0" max="300" step="1"></label>
              <label data-flare-effect-field hidden>Horizontal position <output data-output="flarePositionX"></output><input name="flarePositionX" type="range" min="0" max="100" step="1"></label>
              <label data-flare-effect-field hidden>Vertical position <output data-output="flarePositionY"></output><input name="flarePositionY" type="range" min="0" max="100" step="1"></label>
              <label data-flare-effect-field hidden>Lens character<select name="flareLensType"><option value="zoom">Zoom</option><option value="prime-35">Prime 35</option><option value="prime-105">Prime 105</option><option value="cinema">Cinema</option></select></label>
              <label data-gust-effect-field hidden>Character<select name="gustMethod"><option value="drift">Drift</option><option value="burst">Burst</option><option value="stagger">Stagger</option></select></label>
              <label data-gust-effect-field hidden>Direction<select name="gustDirection"><option value="right">From right</option><option value="left">From left</option></select></label>
            </div>
            <label data-directional-shadow-field><input name="useGlobalLight" type="checkbox"> Use Global Light</label>
            <label data-pattern-field hidden><input name="linkWithLayer" type="checkbox"> Link with layer</label>
            <button data-pattern-field data-layer-style-action="snap-pattern" type="button" hidden>Snap to origin</button>
            <label data-gradient-field hidden><input name="gradientReverse" type="checkbox"> Reverse</label>
            <label data-gradient-field hidden><input name="gradientAlignWithLayer" type="checkbox"> Align with layer</label>
            <button data-gradient-field data-layer-style-action="snap-gradient" type="button" hidden>Snap to origin</button>
            <label data-bevel-field hidden><input name="bevelUseGlobalLight" type="checkbox"> Use Global Light</label>
            <label data-bevel-field hidden><input name="antialiased" type="checkbox"> Anti-aliased</label>
            <label><input name="preview" type="checkbox" checked> Preview</label>
          </form>
        </div>
        <footer><button type="button" data-layer-style-action="remove">Remove</button><span></span><button type="button" data-layer-style-action="cancel">Cancel</button><button type="button" class="primary" data-layer-style-action="apply">Apply</button></footer>
      </section>`;
      document.body.appendChild(this.overlay);
      this.form = this.overlay.querySelector("form");
      this.overlay.addEventListener("input", () => this.refreshPreview());
      this.overlay.addEventListener("change", () => this.refreshPreview());
      this.overlay.addEventListener("click", (event) => {
        const action = event.target.closest("[data-layer-style-action]")?.dataset.layerStyleAction;
        if (action === "snap-pattern") {
          this.form.elements.offsetX.value = 0;
          this.form.elements.offsetY.value = 0;
          this.refreshPreview();
        } else if (action === "snap-gradient") {
          this.form.elements.gradientOffsetX.value = 0;
          this.form.elements.gradientOffsetY.value = 0;
          this.refreshPreview();
        } else if (action === "randomize-ripple" || action === "randomize-rain") {
          const seed = new Uint32Array(1);
          if (global.crypto?.getRandomValues) global.crypto.getRandomValues(seed);
          else seed[0] = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
          this.form.elements[action === "randomize-rain" ? "rainSeed" : "rippleSeed"].value = seed[0];
          this.refreshPreview();
        } else if (action) this.finish(action);
        else if (event.target === this.overlay) this.finish("cancel");
      });
      this.handleKeyDown = (event) => { if (!this.overlay.classList.contains("hidden") && event.key === "Escape") this.finish("cancel"); };
      document.addEventListener("keydown", this.handleKeyDown, true);
    }

    readEffect() {
      const data = new FormData(this.form);
      if (this.styleType === "gust") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          method: data.get("gustMethod"),
          direction: data.get("gustDirection")
        });
      }
      if (this.styleType === "flare") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          brightness: Number(data.get("flareBrightness")),
          positionX: Number(data.get("flarePositionX")) / 100,
          positionY: Number(data.get("flarePositionY")) / 100,
          lensType: data.get("flareLensType")
        });
      }
      if (this.styleType === "ripple-field") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          generators: Number(data.get("rippleGenerators")),
          wavelengthMinimum: Number(data.get("rippleWavelengthMinimum")),
          wavelengthMaximum: Number(data.get("rippleWavelengthMaximum")),
          amplitudeMinimum: Number(data.get("rippleAmplitudeMinimum")),
          amplitudeMaximum: Number(data.get("rippleAmplitudeMaximum")),
          horizontalScale: Number(data.get("rippleHorizontalScale")),
          verticalScale: Number(data.get("rippleVerticalScale")),
          waveType: data.get("rippleWaveType"),
          undefinedAreas: data.get("rippleUndefinedAreas"),
          seed: Number(data.get("rippleSeed"))
        });
      }
      if (this.styleType === "vortex") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          angle: Number(data.get("vortexAngle"))
        });
      }
      if (this.styleType === "grain") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          amount: Number(data.get("grainAmount")) / 100,
          distribution: data.get("grainDistribution"),
          monochromatic: data.get("grainMonochromatic") === "on"
        });
      }
      if (this.styleType === "newspaper") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          dotSize: Number(data.get("newspaperDotSize")),
          contrast: Number(data.get("newspaperContrast")) / 100,
          angle: Number(data.get("newspaperAngle")),
          inkColor: data.get("newspaperInkColor"),
          paperColor: data.get("newspaperPaperColor")
        });
      }
      if (this.styleType === "snow") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          density: Number(data.get("snowDensity")) / 100,
          flakeSize: Number(data.get("snowFlakeSize")),
          depth: Number(data.get("snowDepth")) / 100,
          angle: Number(data.get("snowAngle")),
          motion: Number(data.get("snowMotion")),
          brightness: Number(data.get("snowBrightness")) / 100
        });
      }
      if (this.styleType === "rain") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          amount: Number(data.get("rainAmount")) / 100,
          length: Number(data.get("rainLength")),
          thickness: Number(data.get("rainThickness")),
          angle: Number(data.get("rainAngle")),
          brightness: Number(data.get("rainBrightness")) / 100,
          seed: Number(data.get("rainSeed"))
        });
      }
      if (this.styleType === "rainbow") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          positionX: Number(data.get("rainbowPositionX")),
          positionY: Number(data.get("rainbowPositionY")),
          scale: Number(data.get("rainbowScale")),
          thickness: Number(data.get("rainbowThickness")),
          softness: Number(data.get("rainbowSoftness")),
          fade: Number(data.get("rainbowFade")),
          intensity: Number(data.get("rainbowIntensity")) / 100
        });
      }
      if (this.styleType === "spotlight") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          positionX: Number(data.get("spotlightPositionX")),
          positionY: Number(data.get("spotlightPositionY")),
          width: Number(data.get("spotlightWidth")),
          height: Number(data.get("spotlightHeight")),
          feather: Number(data.get("spotlightFeather")),
          brightness: Number(data.get("spotlightBrightness")) / 100,
          color: data.get("spotlightColor")
        });
      }
      if (this.styleType === "vignette") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          positionX: Number(data.get("vignettePositionX")),
          positionY: Number(data.get("vignettePositionY")),
          width: Number(data.get("vignetteWidth")),
          height: Number(data.get("vignetteHeight")),
          clearCenter: Number(data.get("vignetteClearCenter")),
          feather: Number(data.get("vignetteFeather")),
          amount: Number(data.get("vignetteAmount")) / 100,
          highlightProtection: Number(data.get("vignetteHighlightProtection")) / 100,
          color: data.get("vignetteColor")
        });
      }
      if (this.styleType === "painted-texture") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          stylization: Number(data.get("paintedStylization")),
          cleanliness: Number(data.get("paintedCleanliness")),
          scale: Number(data.get("paintedScale")),
          bristleDetail: Number(data.get("paintedBristleDetail")),
          lighting: data.get("paintedLighting") === "on",
          angle: Number(data.get("paintedAngle")),
          shine: Number(data.get("paintedShine"))
        });
      }
      if (this.styleType === "retro-3d") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          separation: Number(data.get("retro3DSeparation")),
          angle: Number(data.get("retro3DAngle")),
          strength: Number(data.get("retro3DStrength")) / 100,
          colorPair: data.get("retro3DColorPair")
        });
      }
      if (this.styleType === "blur") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          radius: Number(data.get("radius"))
        });
      }
      if (this.styleType === "bevel-emboss") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          style: data.get("bevelStyle"), technique: data.get("bevelTechnique"),
          depth: Number(data.get("depth")), direction: data.get("direction"),
          size: Number(data.get("bevelSize")), soften: Number(data.get("soften")),
          angle: Number(data.get("bevelAngle")), altitude: Number(data.get("altitude")),
          useGlobalLight: data.get("bevelUseGlobalLight") === "on",
          glossContour: data.get("glossContour"), antialiased: data.get("antialiased") === "on",
          highlightBlendMode: data.get("highlightBlendMode"), highlightColor: data.get("highlightColor"),
          highlightOpacity: Number(data.get("highlightOpacity")) / 100,
          shadowBlendMode: data.get("shadowBlendMode"), shadowColor: data.get("shadowColor"),
          shadowOpacity: Number(data.get("shadowOpacity")) / 100
        });
      }
      if (this.styleType === "gradient-overlay") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          blendMode: data.get("blendMode"),
          opacity: Number(data.get("opacity")) / 100,
          style: data.get("gradientStyle"),
          startColor: data.get("gradientStartColor"),
          endColor: data.get("gradientEndColor"),
          angle: Number(data.get("gradientAngle")),
          scale: Number(data.get("gradientScale")),
          offsetX: Number(data.get("gradientOffsetX")),
          offsetY: Number(data.get("gradientOffsetY")),
          reverse: data.get("gradientReverse") === "on",
          alignWithLayer: data.get("gradientAlignWithLayer") === "on"
        });
      }
      if (this.styleType === "pattern-overlay") {
        return this.effectModel.normalize({
          ...this.effect,
          enabled: data.get("enabled") === "on",
          blendMode: data.get("blendMode"),
          opacity: Number(data.get("opacity")) / 100,
          patternType: data.get("patternType"),
          foregroundColor: data.get("foregroundColor"),
          backgroundColor: data.get("backgroundColor"),
          scale: Number(data.get("scale")),
          angle: Number(data.get("patternAngle")),
          density: Number(data.get("density")),
          offsetX: Number(data.get("offsetX")),
          offsetY: Number(data.get("offsetY")),
          linkWithLayer: data.get("linkWithLayer") === "on"
        });
      }
      return this.effectModel.normalize({
        ...this.effect,
        enabled: data.get("enabled") === "on",
        blendMode: data.get("blendMode"), color: data.get("color"),
        opacity: Number(data.get("opacity")) / 100,
        ...(["inner-glow", "outer-glow", "color-overlay"].includes(this.styleType) ? {} : { angle: Number(data.get("angle")), distance: Number(data.get("distance")), useGlobalLight: data.get("useGlobalLight") === "on" }),
        ...(this.styleType === "color-overlay" ? {} : this.styleType === "inner-shadow" || this.styleType === "inner-glow"
          ? { choke: Number(data.get("choke")) / 100 }
          : { spread: Number(data.get("spread")) / 100 }),
        ...(this.styleType === "color-overlay" ? {} : { blur: Number(data.get("blur")) })
      });
    }

    updateOutputs() {
      const names = this.styleType === "gust"
        ? []
        : this.styleType === "vignette"
        ? ["vignettePositionX", "vignettePositionY", "vignetteWidth", "vignetteHeight", "vignetteClearCenter", "vignetteFeather", "vignetteAmount", "vignetteHighlightProtection"]
        : this.styleType === "spotlight"
        ? ["spotlightPositionX", "spotlightPositionY", "spotlightWidth", "spotlightHeight", "spotlightFeather", "spotlightBrightness"]
        : this.styleType === "rainbow"
        ? ["rainbowPositionX", "rainbowPositionY", "rainbowScale", "rainbowThickness", "rainbowSoftness", "rainbowFade", "rainbowIntensity"]
        : this.styleType === "rain"
        ? ["rainAmount", "rainLength", "rainThickness", "rainAngle", "rainBrightness"]
        : this.styleType === "retro-3d"
        ? ["retro3DSeparation", "retro3DAngle", "retro3DStrength"]
        : this.styleType === "painted-texture"
        ? ["paintedStylization", "paintedCleanliness", "paintedScale", "paintedBristleDetail", "paintedAngle", "paintedShine"]
        : this.styleType === "snow"
        ? ["snowDensity", "snowFlakeSize", "snowDepth", "snowAngle", "snowMotion", "snowBrightness"]
        : this.styleType === "flare"
        ? ["flareBrightness", "flarePositionX", "flarePositionY"]
        : this.styleType === "ripple-field"
        ? ["rippleGenerators", "rippleWavelengthMinimum", "rippleWavelengthMaximum", "rippleAmplitudeMinimum", "rippleAmplitudeMaximum", "rippleHorizontalScale", "rippleVerticalScale"]
        : this.styleType === "vortex"
        ? ["vortexAngle"]
        : this.styleType === "grain"
        ? ["grainAmount"]
        : this.styleType === "newspaper"
        ? ["newspaperDotSize", "newspaperContrast", "newspaperAngle"]
        : this.styleType === "blur"
        ? ["radius"]
        : this.styleType === "bevel-emboss"
        ? ["depth", "bevelSize", "soften", "bevelAngle", "altitude", "highlightOpacity", "shadowOpacity"]
        : this.styleType === "gradient-overlay"
        ? ["opacity", "gradientAngle", "gradientScale"]
        : this.styleType === "pattern-overlay"
        ? ["opacity", "scale", "patternAngle", "density"]
        : this.styleType === "color-overlay"
        ? ["opacity"]
        : ["inner-glow", "outer-glow"].includes(this.styleType)
        ? ["opacity", this.styleType === "inner-glow" ? "choke" : "spread", "blur"]
        : ["opacity", "angle", "distance", this.styleType === "inner-shadow" ? "choke" : "spread", "blur"];
      names.forEach((name) => {
        const input = this.form.elements[name];
        const suffix = name === "rippleGenerators" ? "" : ["angle", "patternAngle", "gradientAngle", "bevelAngle", "altitude", "vortexAngle", "newspaperAngle", "snowAngle", "paintedAngle", "retro3DAngle", "rainAngle"].includes(name) ? "°" : ["opacity", "spread", "choke", "scale", "density", "gradientScale", "depth", "highlightOpacity", "shadowOpacity", "grainAmount", "newspaperContrast", "rippleHorizontalScale", "rippleVerticalScale", "flareBrightness", "flarePositionX", "flarePositionY", "snowDensity", "snowDepth", "snowBrightness", "retro3DStrength", "rainAmount", "rainBrightness", "rainbowPositionX", "rainbowPositionY", "rainbowScale", "rainbowThickness", "rainbowSoftness", "rainbowFade", "rainbowIntensity", "spotlightPositionX", "spotlightPositionY", "spotlightWidth", "spotlightHeight", "spotlightFeather", "spotlightBrightness", "vignettePositionX", "vignettePositionY", "vignetteWidth", "vignetteHeight", "vignetteClearCenter", "vignetteFeather", "vignetteAmount", "vignetteHighlightProtection"].includes(name) ? "%" : ["paintedStylization", "paintedCleanliness", "paintedScale", "paintedBristleDetail", "paintedShine"].includes(name) ? "" : " px";
        const value = ["radius", "grainAmount", "snowFlakeSize", "paintedStylization", "paintedCleanliness", "paintedScale", "paintedBristleDetail", "paintedShine", "rainThickness"].includes(name) ? Number(input.value).toFixed(1).replace(/\.0$/, "") : input.value;
        this.overlay.querySelector(`[data-output="${name}"]`).textContent = `${value}${suffix}`;
      });
    }

    refreshPreview() {
      this.updateOutputs();
      this.options?.onPreview?.(this.readEffect(), this.form.elements.preview.checked);
    }

    /** Open the requested shadow editor for one or more layers. */
    open(options) {
      this.options = options;
      this.styleType = ["inner-shadow", "inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay", "bevel-emboss", "blur", "grain", "newspaper", "painted-texture", "retro-3d", "snow", "rain", "rainbow", "spotlight", "vignette", "vortex", "ripple-field", "flare", "gust"].includes(options.styleType) ? options.styleType : "drop-shadow";
      this.effectModel = this.styleType === "inner-shadow"
        ? namespace.ImageEditorInnerShadowEffect
        : this.styleType === "inner-glow" ? namespace.ImageEditorInnerGlowEffect
          : this.styleType === "outer-glow" ? namespace.ImageEditorOuterGlowEffect
            : this.styleType === "color-overlay" ? namespace.ImageEditorColorOverlayEffect
              : this.styleType === "gradient-overlay" ? namespace.ImageEditorGradientOverlayEffect
                : this.styleType === "pattern-overlay" ? namespace.ImageEditorPatternOverlayEffect
                  : this.styleType === "bevel-emboss" ? namespace.ImageEditorBevelEmbossEffect
                    : this.styleType === "blur" ? namespace.ImageEditorBlurEffect
                      : this.styleType === "grain" ? namespace.ImageEditorGrainEffect
                        : this.styleType === "newspaper" ? namespace.ImageEditorNewspaperEffect
                          : this.styleType === "painted-texture" ? namespace.ImageEditorPaintedTextureEffect
                          : this.styleType === "retro-3d" ? namespace.ImageEditorRetro3DEffect
                          : this.styleType === "snow" ? namespace.ImageEditorSnowEffect
                          : this.styleType === "rain" ? namespace.ImageEditorRainEffect
                          : this.styleType === "rainbow" ? namespace.ImageEditorRainbowEffect
                          : this.styleType === "spotlight" ? namespace.ImageEditorSpotlightEffect
                          : this.styleType === "vignette" ? namespace.ImageEditorVignetteEffect
                          : this.styleType === "vortex" ? namespace.ImageEditorVortexEffect
                          : this.styleType === "ripple-field" ? namespace.ImageEditorRippleFieldEffect
                            : this.styleType === "flare" ? namespace.ImageEditorFlareEffect
                              : this.styleType === "gust" ? namespace.ImageEditorGustEffect : namespace.ImageEditorDropShadowEffect;
      const styleName = this.styleType === "inner-shadow" ? "Inset Shadow" : this.styleType === "inner-glow" ? "Inner Aura" : this.styleType === "outer-glow" ? "Outer Aura" : this.styleType === "color-overlay" ? "Color Coat" : this.styleType === "gradient-overlay" ? "Gradient Coat" : this.styleType === "pattern-overlay" ? "Pattern Coat" : this.styleType === "bevel-emboss" ? "Raised Edge" : this.styleType === "blur" ? "Blur" : this.styleType === "grain" ? "Grain" : this.styleType === "newspaper" ? "Newspaper" : this.styleType === "painted-texture" ? "Painted Texture" : this.styleType === "retro-3d" ? "Retro 3D" : this.styleType === "snow" ? "Snow" : this.styleType === "rain" ? "Rain" : this.styleType === "rainbow" ? "Rainbow" : this.styleType === "spotlight" ? "Spotlight" : this.styleType === "vignette" ? "Vignette" : this.styleType === "vortex" ? "Vortex" : this.styleType === "ripple-field" ? "Ripple Field" : this.styleType === "flare" ? "Flare" : this.styleType === "gust" ? "Gust" : "Cast Shadow";
      this.effect = this.effectModel.normalize(options.effect || {});
      this.overlay.querySelector(".image-editor-layer-style-target").textContent = options.targetName || "Selected layers";
      this.overlay.querySelector(".image-editor-layer-style-name").textContent = styleName;
      this.overlay.querySelector(".image-editor-layer-style-enabled-name").textContent = `Enable ${styleName}`;
      ["blendMode", "color", "opacity", "angle", "distance", "spread", "choke", "blur", "useGlobalLight"].forEach((name) => {
        this.form.elements[name].closest("label").hidden = ["blur", "grain", "newspaper", "painted-texture", "retro-3d", "snow", "rain", "rainbow", "spotlight", "vignette", "vortex", "ripple-field", "flare", "gust"].includes(this.styleType);
      });
      this.form.elements.spread.closest("label").hidden = !["drop-shadow", "outer-glow"].includes(this.styleType);
      this.overlay.querySelector("[data-choke-field]").hidden = !["inner-shadow", "inner-glow"].includes(this.styleType);
      this.overlay.querySelector("[data-size-field]").hidden = ["color-overlay", "gradient-overlay", "pattern-overlay", "blur", "grain", "newspaper", "painted-texture", "retro-3d", "snow", "rain", "rainbow", "spotlight", "vignette", "vortex", "ripple-field", "flare", "gust"].includes(this.styleType);
      this.overlay.querySelector("[data-color-field]").hidden = ["gradient-overlay", "pattern-overlay", "blur", "grain", "newspaper", "painted-texture", "retro-3d", "snow", "rain", "rainbow", "spotlight", "vignette", "vortex", "ripple-field", "flare", "gust"].includes(this.styleType);
      this.overlay.querySelectorAll("[data-gradient-field]").forEach((field) => { field.hidden = this.styleType !== "gradient-overlay"; });
      this.overlay.querySelectorAll("[data-pattern-field]").forEach((field) => { field.hidden = this.styleType !== "pattern-overlay"; });
      this.overlay.querySelectorAll("[data-bevel-field]").forEach((field) => { field.hidden = this.styleType !== "bevel-emboss"; });
      this.overlay.querySelectorAll("[data-blur-effect-field]").forEach((field) => { field.hidden = this.styleType !== "blur"; });
      this.overlay.querySelectorAll("[data-grain-effect-field]").forEach((field) => { field.hidden = this.styleType !== "grain"; });
      this.overlay.querySelectorAll("[data-newspaper-effect-field]").forEach((field) => { field.hidden = this.styleType !== "newspaper"; });
      this.overlay.querySelectorAll("[data-painted-texture-effect-field]").forEach((field) => { field.hidden = this.styleType !== "painted-texture"; });
      this.overlay.querySelectorAll("[data-retro-3d-effect-field]").forEach((field) => { field.hidden = this.styleType !== "retro-3d"; });
      this.overlay.querySelectorAll("[data-snow-effect-field]").forEach((field) => { field.hidden = this.styleType !== "snow"; });
      this.overlay.querySelectorAll("[data-rain-effect-field]").forEach((field) => { field.hidden = this.styleType !== "rain"; });
      this.overlay.querySelectorAll("[data-rainbow-effect-field]").forEach((field) => { field.hidden = this.styleType !== "rainbow"; });
      this.overlay.querySelectorAll("[data-spotlight-effect-field]").forEach((field) => { field.hidden = this.styleType !== "spotlight"; });
      this.overlay.querySelectorAll("[data-vignette-effect-field]").forEach((field) => { field.hidden = this.styleType !== "vignette"; });
      this.overlay.querySelectorAll("[data-vortex-effect-field]").forEach((field) => { field.hidden = this.styleType !== "vortex"; });
      this.overlay.querySelectorAll("[data-ripple-effect-field]").forEach((field) => { field.hidden = this.styleType !== "ripple-field"; });
      this.overlay.querySelectorAll("[data-flare-effect-field]").forEach((field) => { field.hidden = this.styleType !== "flare"; });
      this.overlay.querySelectorAll("[data-gust-effect-field]").forEach((field) => { field.hidden = this.styleType !== "gust"; });
      this.overlay.querySelectorAll("[data-directional-shadow-field]").forEach((field) => { field.hidden = ["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay", "blur", "grain", "newspaper", "painted-texture", "retro-3d", "snow", "rain", "rainbow", "spotlight", "vignette", "vortex", "ripple-field", "flare", "gust"].includes(this.styleType); });
      const screenBlendOption = this.form.elements.blendMode.querySelector('option[value="screen"]');
      screenBlendOption.hidden = !["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType);
      screenBlendOption.disabled = !["inner-glow", "outer-glow", "color-overlay", "gradient-overlay", "pattern-overlay"].includes(this.styleType);
      ["blendMode", "color", "opacity", "angle", "distance", "spread", "choke", "blur", "useGlobalLight"].forEach((name) => {
        if (this.styleType === "bevel-emboss") this.form.elements[name].closest("label").hidden = true;
      });
      const values = this.effect;
      this.form.elements.radius.value = values.radius ?? 5;
      this.form.elements.grainAmount.value = Math.round((values.amount ?? 0.125) * 1000) / 10;
      const grainDistribution = this.form.querySelector(`[name="grainDistribution"][value="${values.distribution || "gaussian"}"]`);
      if (grainDistribution) grainDistribution.checked = true;
      this.form.elements.grainMonochromatic.checked = values.monochromatic === true;
      this.form.elements.newspaperDotSize.value = values.dotSize ?? 6;
      this.form.elements.newspaperContrast.value = Math.round((values.contrast ?? 0.35) * 100);
      this.form.elements.newspaperAngle.value = values.angle ?? 45;
      this.form.elements.newspaperInkColor.value = values.inkColor || "#111111";
      this.form.elements.newspaperPaperColor.value = values.paperColor || "#F7F2E7";
      this.form.elements.paintedStylization.value = values.stylization ?? 4;
      this.form.elements.paintedCleanliness.value = values.cleanliness ?? 2.3;
      this.form.elements.paintedScale.value = values.scale ?? 0.8;
      this.form.elements.paintedBristleDetail.value = values.bristleDetail ?? 10;
      this.form.elements.paintedLighting.checked = values.lighting !== false;
      this.form.elements.paintedAngle.value = values.angle ?? -60;
      this.form.elements.paintedShine.value = values.shine ?? 1.3;
      this.form.elements.retro3DSeparation.value = values.separation ?? 8;
      this.form.elements.retro3DAngle.value = values.angle ?? 0;
      this.form.elements.retro3DStrength.value = Math.round((values.strength ?? 1) * 100);
      this.form.elements.retro3DColorPair.value = values.colorPair || "red-cyan";
      this.form.elements.snowDensity.value = Math.round((values.density ?? 0.35) * 100);
      this.form.elements.snowFlakeSize.value = values.flakeSize ?? 4;
      this.form.elements.snowDepth.value = Math.round((values.depth ?? 0.45) * 100);
      this.form.elements.snowAngle.value = values.angle ?? -65;
      this.form.elements.snowMotion.value = values.motion ?? 10;
      this.form.elements.snowBrightness.value = Math.round((values.brightness ?? 0.9) * 100);
      this.form.elements.rainAmount.value = Math.round((values.amount ?? 0.35) * 100);
      this.form.elements.rainLength.value = values.length ?? 75;
      this.form.elements.rainThickness.value = values.thickness ?? 1.25;
      this.form.elements.rainAngle.value = values.angle ?? 65;
      this.form.elements.rainBrightness.value = Math.round((values.brightness ?? 0.75) * 100);
      this.form.elements.rainSeed.value = values.seed >>> 0;
      this.form.elements.rainbowPositionX.value = values.positionX ?? 50;
      this.form.elements.rainbowPositionY.value = values.positionY ?? 88;
      this.form.elements.rainbowScale.value = values.scale ?? 85;
      this.form.elements.rainbowThickness.value = values.thickness ?? 14;
      this.form.elements.rainbowSoftness.value = values.softness ?? 12;
      this.form.elements.rainbowFade.value = values.fade ?? 28;
      this.form.elements.rainbowIntensity.value = Math.round((values.intensity ?? 0.72) * 100);
      this.form.elements.spotlightPositionX.value = values.positionX ?? 50;
      this.form.elements.spotlightPositionY.value = values.positionY ?? 45;
      this.form.elements.spotlightWidth.value = values.width ?? 70;
      this.form.elements.spotlightHeight.value = values.height ?? 75;
      this.form.elements.spotlightFeather.value = values.feather ?? 65;
      this.form.elements.spotlightBrightness.value = Math.round((values.brightness ?? 0.75) * 100);
      this.form.elements.spotlightColor.value = values.color || "#FFD6A0";
      this.form.elements.vignettePositionX.value = values.positionX ?? 50;
      this.form.elements.vignettePositionY.value = values.positionY ?? 50;
      this.form.elements.vignetteWidth.value = values.width ?? 115;
      this.form.elements.vignetteHeight.value = values.height ?? 115;
      this.form.elements.vignetteClearCenter.value = values.clearCenter ?? 38;
      this.form.elements.vignetteFeather.value = values.feather ?? 85;
      this.form.elements.vignetteAmount.value = Math.round((values.amount ?? 0.8) * 100);
      this.form.elements.vignetteHighlightProtection.value = Math.round((values.highlightProtection ?? 0.35) * 100);
      this.form.elements.vignetteColor.value = values.color || "#17100E";
      this.form.elements.vortexAngle.value = values.angle ?? 120;
      this.form.elements.rippleGenerators.value = values.generators ?? 5;
      this.form.elements.rippleWavelengthMinimum.value = values.wavelengthMinimum ?? 10;
      this.form.elements.rippleWavelengthMaximum.value = values.wavelengthMaximum ?? 120;
      this.form.elements.rippleAmplitudeMinimum.value = values.amplitudeMinimum ?? 5;
      this.form.elements.rippleAmplitudeMaximum.value = values.amplitudeMaximum ?? 35;
      this.form.elements.rippleHorizontalScale.value = values.horizontalScale ?? 100;
      this.form.elements.rippleVerticalScale.value = values.verticalScale ?? 100;
      this.form.elements.rippleWaveType.value = values.waveType || "sine";
      this.form.elements.rippleUndefinedAreas.value = values.undefinedAreas || "repeat";
      this.form.elements.rippleSeed.value = values.seed >>> 0;
      this.form.elements.flareBrightness.value = values.brightness ?? 100;
      this.form.elements.flarePositionX.value = Math.round((values.positionX ?? 0.5) * 100);
      this.form.elements.flarePositionY.value = Math.round((values.positionY ?? 0.5) * 100);
      this.form.elements.flareLensType.value = values.lensType || "zoom";
      this.form.elements.gustMethod.value = values.method || "drift";
      this.form.elements.gustDirection.value = values.direction || "right";
      Object.entries({ enabled: values.enabled, blendMode: values.blendMode, color: values.color || "#000000", opacity: Math.round(values.opacity * 100), angle: values.angle || 0, distance: values.distance || 0, spread: Math.round((values.spread || 0) * 100), choke: Math.round((values.choke || 0) * 100), blur: values.blur || 0, useGlobalLight: values.useGlobalLight, patternType: values.patternType || "crosshatch", foregroundColor: values.foregroundColor || "#000000", backgroundColor: values.backgroundColor || "#FFFFFF", scale: values.scale || 100, patternAngle: values.angle || 0, density: values.density || 50, offsetX: values.offsetX || 0, offsetY: values.offsetY || 0, linkWithLayer: values.linkWithLayer, gradientStyle: values.style || "linear", gradientStartColor: values.startColor || "#000000", gradientEndColor: values.endColor || "#FFFFFF", gradientAngle: values.angle ?? 90, gradientScale: values.scale || 100, gradientOffsetX: values.offsetX || 0, gradientOffsetY: values.offsetY || 0, gradientReverse: values.reverse, gradientAlignWithLayer: values.alignWithLayer, bevelStyle: values.style || "inner-bevel", bevelTechnique: values.technique || "smooth", depth: values.depth || 100, direction: values.direction || "up", bevelSize: values.size ?? 5, soften: values.soften || 0, bevelAngle: values.angle ?? 120, altitude: values.altitude ?? 30, glossContour: values.glossContour || "linear", highlightBlendMode: values.highlightBlendMode || "screen", highlightColor: values.highlightColor || "#FFFFFF", highlightOpacity: Math.round((values.highlightOpacity ?? 0.75) * 100), shadowBlendMode: values.shadowBlendMode || "multiply", shadowColor: values.shadowColor || "#000000", shadowOpacity: Math.round((values.shadowOpacity ?? 0.75) * 100), bevelUseGlobalLight: values.useGlobalLight, antialiased: values.antialiased }).forEach(([name, value]) => {
        const input = this.form.elements[name];
        if (input.type === "checkbox") input.checked = !!value; else input.value = value;
      });
      this.form.elements.preview.checked = true;
      this.overlay.querySelector('[data-layer-style-action="remove"]').disabled = options.hasEffect !== true;
      this.updateOutputs();
      this.overlay.classList.remove("hidden");
      (this.styleType === "gradient-overlay" ? this.form.elements.gradientStyle : this.styleType === "pattern-overlay" ? this.form.elements.patternType : this.styleType === "bevel-emboss" ? this.form.elements.bevelStyle : this.styleType === "blur" ? this.form.elements.radius : this.styleType === "grain" ? this.form.elements.grainAmount : this.styleType === "newspaper" ? this.form.elements.newspaperDotSize : this.styleType === "painted-texture" ? this.form.elements.paintedStylization : this.styleType === "retro-3d" ? this.form.elements.retro3DSeparation : this.styleType === "snow" ? this.form.elements.snowDensity : this.styleType === "rain" ? this.form.elements.rainAmount : this.styleType === "rainbow" ? this.form.elements.rainbowPositionX : this.styleType === "spotlight" ? this.form.elements.spotlightPositionX : this.styleType === "vignette" ? this.form.elements.vignettePositionX : this.styleType === "vortex" ? this.form.elements.vortexAngle : this.styleType === "ripple-field" ? this.form.elements.rippleGenerators : this.styleType === "flare" ? this.form.elements.flareBrightness : this.styleType === "gust" ? this.form.elements.gustMethod : this.form.elements.opacity).focus({ preventScroll: true });
      this.options.onPreview?.(this.effect, true);
    }

    finish(action) {
      if (!this.options) return;
      const options = this.options;
      const effect = this.readEffect();
      this.options = null;
      this.overlay.classList.add("hidden");
      if (action === "apply") options.onApply?.(effect);
      else if (action === "remove") options.onRemove?.();
      else options.onCancel?.();
    }

    destroy() {
      if (this.options) this.finish("cancel");
      document.removeEventListener("keydown", this.handleKeyDown, true);
      this.overlay.remove();
    }
  }

  namespace.ImageEditorLayerStyleDialog = ImageEditorLayerStyleDialog;
})(typeof window !== "undefined" ? window : globalThis);
