const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("about:blank");
  for (const file of [
    "resources/js/image-editor/layers/vignette-effect.js",
    "resources/js/image-editor/layers/vignette-renderer.js"
  ]) {
    await page.addScriptTag({ content: fs.readFileSync(file, "utf8") });
  }
  const result = await page.evaluate(() => {
    const width = 120;
    const height = 80;
    const input = new ImageData(width, height);
    for (let i = 0; i < input.data.length; i += 4) {
      input.data[i] = 180;
      input.data[i + 1] = 180;
      input.data[i + 2] = 180;
      input.data[i + 3] = 173;
    }
    const layer = {
      effects: [{
        type: "vignette",
        positionX: 50,
        positionY: 50,
        width: 100,
        height: 100,
        clearCenter: 30,
        feather: 70,
        amount: 1,
        highlightProtection: 0,
        color: "#000000"
      }]
    };
    const output = window.ImageEditorVignetteRenderer.apply(input, layer, width, height);
    const pixel = (x, y) => {
      const index = (y * width + x) * 4;
      return Array.from(output.data.slice(index, index + 4));
    };
    let changed = 0;
    let alphaMismatch = 0;
    for (let i = 0; i < input.data.length; i += 4) {
      if (
        output.data[i] !== input.data[i]
        || output.data[i + 1] !== input.data[i + 1]
        || output.data[i + 2] !== input.data[i + 2]
      ) changed += 1;
      if (output.data[i + 3] !== input.data[i + 3]) alphaMismatch += 1;
    }
    const center = pixel(60, 40);
    const corner = pixel(0, 0);
    return {
      changed,
      alphaMismatch,
      center,
      corner,
      centerUnchanged: center[0] === 180,
      cornerDarkened: corner[0] < 180
    };
  });
  console.log(JSON.stringify(result));
  if (!result.changed || result.alphaMismatch || !result.centerUnchanged || !result.cornerDarkened) {
    process.exitCode = 1;
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
