const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function loadRegistry() {
  const context = {
    window: null,
    Date,
    Math
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ui", "theme-registry.js"), "utf8"), context);
  return context.markdownViewerThemeRegistry;
}

test("theme registry exposes built-in light and dark themes", () => {
  const registry = loadRegistry();

  assert.equal(registry.getDefaultThemeId("light"), "default-light");
  const defaultLight = registry.getBuiltinThemes("light").find((theme) => theme.id === "default-light");
  assert.equal(defaultLight.colors["accent-color"], "#4b9ce7");
  assert.equal(defaultLight.colors["accent-text"], "#4b9ce7");
  assert.equal(defaultLight.colors["link-color"], "#4b9ce7");
  assert.equal(registry.getDefaultThemeId("dark"), "default-dark");
  const defaultDark = registry.getBuiltinThemes("dark").find((theme) => theme.id === "default-dark");
  assert.equal(defaultDark.colors["accent-color"], "#9c76cb");
  assert.equal(defaultDark.colors["accent-text"], "#4b3d61");
  assert.equal(defaultDark.colors["accent-contrast"], "#ffffff");
  assert.equal(defaultDark.colors["link-color"], "#9d82c9");
  assert.equal(defaultDark.colors["menu-separator-color"], "#3d444c");
  assert.equal(defaultDark.colors["editor-selection-match-text-color"], "#c9d1d9");
  assert.equal(defaultDark.colors["editor-current-selection-bg"], "rgba(255, 241, 118, 0.8)");
  assert.equal(defaultDark.colors["editor-current-selection-text-color"], "#000000");
  assert.ok(registry.getBuiltinThemes("light").some((theme) => theme.id === "vscode-light"));
  assert.ok(registry.getBuiltinThemes("dark").some((theme) => theme.id === "one-dark"));
  const intellijLight = registry.getBuiltinThemes("light").find((theme) => theme.id === "intellij-light");
  assert.equal(intellijLight.name, "IntelliJ Light Mode");
  assert.equal(intellijLight.source, "JetBrains");
  assert.equal(intellijLight.colors["editor-bg"], "#ffffff");
  assert.equal(intellijLight.colors["lsp-tooltip-bg"], "#f7f8fa");
  assert.equal(intellijLight.colors["lsp-tooltip-text-color"], "#1f2329");
  assert.equal(intellijLight.colors["panel-bg"], "#f7f8fa");
  assert.equal(intellijLight.colors["text-color"], "#1f2329");
  assert.equal(intellijLight.colors["accent-color"], "#3574f0");
  assert.equal(intellijLight.colors["border-color"], "#d1d2d3");
  assert.equal(intellijLight.colors["tree-selection-bg"], "#d4e2ff");
  const intellijDark = registry.getBuiltinThemes("dark").find((theme) => theme.id === "intellij-dark");
  assert.equal(intellijDark.name, "IntelliJ Dark Mode");
  assert.equal(intellijDark.source, "JetBrains");
  assert.equal(intellijDark.colors["editor-bg"], "#1e1f22");
  assert.equal(intellijDark.colors["lsp-tooltip-bg"], "#2b2d30");
  assert.equal(intellijDark.colors["lsp-tooltip-text-color"], "#dfe1e5");
  assert.equal(intellijDark.colors["panel-bg"], "#2b2d30");
  assert.equal(intellijDark.colors["text-color"], "#dfe1e5");
  assert.equal(intellijDark.colors["accent-color"], "#3574f0");
  assert.equal(intellijDark.colors["border-color"], "#393b40");
  assert.equal(intellijDark.colors["tree-selection-bg"], "#2e436e");
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "dropzone-bg" && token.alpha));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "lsp-tooltip-bg" && token.group === "Tooltips"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "lsp-tooltip-text-color" && token.group === "Tooltips"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "ai-companion-prompt-bg" && token.label === "companion-user-prompt-bg"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "menu-separator-color" && token.group === "Lines"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "editor-selection-match-bg" && token.alpha && token.group === "Editor"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "editor-selection-match-text-color" && !token.alpha && token.group === "Editor"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "editor-current-selection-bg" && token.alpha && token.group === "Editor"));
  assert.ok(registry.APP_THEME_TOKENS.some((token) => token.key === "editor-current-selection-text-color" && !token.alpha && token.group === "Editor"));
});

test("theme registry normalizes saved selections and invalid custom colors", () => {
  const registry = loadRegistry();
  const customThemes = registry.normalizeCustomThemes({
    light: [{
      id: "custom-light-test",
      name: "Readable Light",
      colors: {
        "bg-color": "#abc",
        "dropzone-bg": "rgba(1, 2, 3, 0.5)",
        "accent-color": "nope"
      }
    }]
  });
  const selections = registry.normalizeThemeSelections({
    light: "custom-light-test",
    dark: "missing"
  }, customThemes);

  assert.equal(customThemes.light[0].colors["bg-color"], "#aabbcc");
  assert.equal(customThemes.light[0].colors["dropzone-bg"], "rgba(1, 2, 3, 0.5)");
  assert.equal(customThemes.light[0].colors["accent-color"], "#4b9ce7");
  assert.equal(selections.light, "custom-light-test");
  assert.equal(selections.dark, "default-dark");
});

test("theme registry keeps saved IntelliJ theme selections", () => {
  const registry = loadRegistry();
  const selections = registry.normalizeThemeSelections({
    light: "intellij-light",
    dark: "intellij-dark"
  }, {});

  assert.equal(selections.light, "intellij-light");
  assert.equal(selections.dark, "intellij-dark");
});

test("theme registry applies selected theme variables to an element", () => {
  const registry = loadRegistry();
  const properties = new Map();
  const attributes = new Map();
  const element = {
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      }
    }
  };

  registry.applyThemeFromState(element, {
    theme: "dark",
    themeSelections: { dark: "solarized-dark" }
  });

  assert.equal(properties.get("--bg-color"), "#002b36");
  assert.equal(properties.get("--link-color"), "#268bd2");
  assert.equal(properties.get("--color-danger-fg"), "#dc322f");
  assert.equal(properties.get("--ai-companion-prompt-bg"), "#144652");
  assert.equal(properties.get("--editor-selection-match-text-color"), "#839496");
  assert.equal(properties.get("--editor-current-selection-bg"), "rgba(255, 241, 118, 0.8)");
  assert.equal(properties.get("--editor-current-selection-text-color"), "#000000");
  assert.equal(attributes.get("data-app-theme-id"), "solarized-dark");
});

test("theme registry creates editable custom themes from a selected base", () => {
  const registry = loadRegistry();
  const theme = registry.createCustomTheme("dark", "My Dark", "vscode-dark", {});

  assert.match(theme.id, /^custom-dark-/);
  assert.equal(theme.name, "My Dark");
  assert.equal(theme.baseThemeId, "vscode-dark");
  assert.equal(theme.colors["bg-color"], "#1e1e1e");
  assert.equal(theme.colors["ai-companion-prompt-bg"], "#252526");
});
