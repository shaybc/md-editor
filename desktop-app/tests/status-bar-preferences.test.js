const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const webRoot = path.resolve(__dirname, "..", "resources");

function readWebFile(relativePath) {
  const resourcePath = relativePath === "script.js" ? path.join("js", "script.js") : relativePath;
  return fs.readFileSync(path.join(webRoot, resourcePath), "utf8");
}

test("view menu exposes a persisted status bar toggle", () => {
  const html = readWebFile("index.html");
  const script = readWebFile("script.js");
  const styles = readWebFile("styles.css");
  const layoutPreferences = readWebFile("js/ui/layout-preferences.js");

  assert.match(html, /class="dropdown-item action-menu-item toggle-status-bar"/);
  assert.match(html, /aria-controls="app-status-line"/);
  assert.match(html, /id="app-status-line" class="app-status-line"/);
  assert.match(styles, /\.app-container\.status-bar-hidden\s*\{[\s\S]*padding-bottom:\s*0;/);
  assert.match(styles, /\.app-status-line\.status-bar-hidden\s*\{[\s\S]*display:\s*none;/);
  assert.match(script, /statusBarVisible:\s*true/);
  assert.match(script, /const toggleStatusBarButtons = document\.querySelectorAll\("\.toggle-status-bar"\)/);
  assert.match(script, /saveGlobalState\(\{ statusBarVisible: nextVisible \}\)/);
  assert.match(script, /toggleStatusBarButtons\.forEach\(function\(button\)/);
  assert.match(layoutPreferences, /setStatusBarVisible\(defaults\.statusBarVisible !== false, false\)/);
  assert.match(layoutPreferences, /setStatusBarVisible\(state\.statusBarVisible !== false, false\)/);
});
