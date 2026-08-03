const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const webRoot = path.resolve(__dirname, "..", "resources");

function getSettingsModalCss() {
  const css = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");
  const start = css.indexOf("SETTINGS MODAL");
  const end = css.indexOf(".rename-modal-input", start);
  assert.notEqual(start, -1, "settings modal CSS section should exist");
  assert.notEqual(end, -1, "settings modal CSS section should end before rename modal styles");
  return css.slice(start, end);
}

test("settings modal surfaces stay tied to the selected app theme", () => {
  const settingsCss = getSettingsModalCss();

  assert.match(settingsCss, /--settings-panel-bg:\s*color-mix\(in srgb, var\(--bg-color\) 76%, var\(--header-bg\)\)/);
  assert.match(settingsCss, /--settings-chrome-bg:\s*color-mix\(in srgb, var\(--header-bg\) 88%, var\(--bg-color\)\)/);
  assert.match(settingsCss, /--settings-field-bg:\s*color-mix\(in srgb, var\(--bg-color\) 92%, var\(--header-bg\)\)/);
  assert.doesNotMatch(
    settingsCss,
    /color-mix\(in srgb, var\(--(?:bg-color|header-bg)\)[^)]*#000\)/,
    "settings surfaces should not darken light mode by mixing app surface tokens toward black"
  );
});
