const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const script = fs.readFileSync(path.join(repoRoot, "desktop-app", "resources", "js", "script.js"), "utf8").replace(/^\uFEFF/, "");
const html = fs.readFileSync(path.join(repoRoot, "desktop-app", "resources", "index.html"), "utf8").replace(/^\uFEFF/, "");

function getRegisteredCategories() {
  const registryMatch = script.match(/const DEBUG_LOG_CATEGORIES = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(registryMatch, "DEBUG_LOG_CATEGORIES registry should be present");
  return Array.from(registryMatch[1].matchAll(/id: "([^"]+)"/g), (match) => match[1]);
}

function getSettingsSwitchCategories() {
  return Array.from(html.matchAll(/data-debug-category="([^"]+)"/g), (match) => match[1]);
}

const expectedCategories = [
  "startup-perf",
  "tab-activation-perf",
  "tabs-session",
  "cache",
  "preview-render-perf",
  "lsp",
  "graph-perf",
  "graph",
  "graph-save",
  "graph-health",
  "maven-recovery",
  "folder-open",
  "large-file-open",
  "large-file-viewer",
  "original-export",
  "workspace-git",
  "terminal"
];

test("debug category registry and settings controls include expected categories", () => {
  for (const category of expectedCategories) {
    assert.match(script, new RegExp(`id: "${category}"`));
    assert.match(html, new RegExp(`id="settings-debug-category-${category}"`));
    assert.match(html, new RegExp(`data-debug-category="${category}"`));
  }
  assert.match(script, /debugCategories:\s*DEFAULT_DEBUG_CATEGORIES/);
});

test("every registered debug category has a settings switch", () => {
  assert.deepEqual(getSettingsSwitchCategories().sort(), getRegisteredCategories().sort());
});

test("debug category filtering is applied inside appDebugLog", () => {
  assert.match(script, /function getDebugLogCategory\(message\)/);
  assert.match(script, /function isDebugCategoryEnabled\(category, categories\)/);
  assert.match(script, /const debugCategory = getDebugLogCategory\(message\);/);
  assert.match(script, /if \(!isDebugCategoryEnabled\(debugCategory, preferences\.categories\)\) return null;/);
});

test("debug category normalization defaults missing and unknown categories to enabled", () => {
  assert.match(script, /categories\[category\.id\] = source\[category\.id\] !== false;/);
  assert.match(script, /if \(!category \|\| !DEBUG_LOG_CATEGORY_IDS\.has\(category\)\) return true;/);
});

test("debug category settings are loaded and saved with preferences", () => {
  assert.match(script, /const settingsDebugCategoryInputs = document\.querySelectorAll\("\.settings-debug-category-input"\);/);
  assert.match(script, /applyDebugCategoryInputs\(debugPreferences\.categories\);/);
  assert.match(script, /const debugCategories = collectDebugCategorySettings\(\);/);
  assert.match(script, /debugCategories,/);
});

test("desktop profile hydration starts after preference dependencies are initialized", () => {
  const hydrationIndex = script.indexOf("const globalStateHydrationPromise = hydrateGlobalStateFromProfile().then(function() {");
  const loadGlobalStateIndex = script.indexOf("const loadGlobalState = themePreferences.loadGlobalState;");
  const applicationMenuIndex = script.indexOf("const applicationMenu = window.registerMarkdownViewerApplicationMenu");
  const applyGlobalPreferencesIndex = script.indexOf("applyGlobalPreferences,");
  const graphSettingsIndex = script.indexOf("const graphSettings = {");

  assert.notEqual(hydrationIndex, -1);
  assert.equal(loadGlobalStateIndex < hydrationIndex, true);
  assert.equal(applicationMenuIndex < hydrationIndex, true);
  assert.equal(applyGlobalPreferencesIndex < hydrationIndex, true);
  assert.equal(graphSettingsIndex < hydrationIndex, true);
});

test("debug category tooltip registration starts after the category registry is initialized", () => {
  const categoryRegistryIndex = script.indexOf("const DEBUG_LOG_CATEGORIES = Object.freeze([");
  const tooltipRegistrationIndex = script.indexOf("DEBUG_LOG_CATEGORIES.forEach((category) => {");

  assert.notEqual(categoryRegistryIndex, -1);
  assert.notEqual(tooltipRegistrationIndex, -1);
  assert.equal(categoryRegistryIndex < tooltipRegistrationIndex, true);
});
