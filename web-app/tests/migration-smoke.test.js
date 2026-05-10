const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const webRoot = path.resolve(__dirname, "..");

function readWebFile(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

test("classic migration scripts load before the legacy monolith", () => {
  const html = readWebFile("index.html");
  const expectedOrder = [
    'src="js/core/context.js"',
    'src="js/app.js"',
    'src="js/platform/folder-picker.js"',
    'src="js/ui/theme-preferences.js"',
    'src="js/ui/mobile-menu.js"',
    'src="js/recent/index.js"',
    'src="js/clipboard.js"',
    'src="js/scroll-sync.js"',
    'src="js/unsaved-changes.js"',
    'src="js/editor/line-status.js"',
    'src="js/editor/status-line.js"',
    'src="js/editor/context-menu.js"',
    'src="js/editor/autocomplete.js"',
    'src="js/editor/syntax-highlight.js"',
    'src="js/markdown/renderer-config.js"',
    'src="js/import/drag-drop.js"',
    'src="js/share-url.js"',
    'src="js/keyboard-shortcuts.js"',
    'src="script.js"',
  ];

  let lastIndex = -1;
  for (const scriptReference of expectedOrder) {
    const index = html.indexOf(scriptReference);
    assert.notEqual(index, -1, `${scriptReference} should be present`);
    assert.ok(index > lastIndex, `${scriptReference} should load after the previous migration script`);
    lastIndex = index;
  }
});

test("legacy script bridges into the shared classic app context", () => {
  const script = readWebFile("script.js");

  assert.match(script, /window\.markdownViewerApp/);
  assert.match(script, /Object\.assign\(app\.dom,/);
  assert.match(script, /Object\.defineProperties\(app\.state,/);
});

test("share URL logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const shareScript = readWebFile("js/share-url.js");

  assert.match(html, /src="js\/share-url\.js"/);
  assert.match(shareScript, /window\.registerMarkdownViewerShareUrl\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerShareUrl\(app,/);
});

test("theme preference logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const themeScript = readWebFile("js/ui/theme-preferences.js");

  assert.match(html, /src="js\/ui\/theme-preferences\.js"/);
  assert.match(themeScript, /window\.registerMarkdownViewerThemePreferences\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerThemePreferences\(app,/);
  assert.doesNotMatch(legacyScript, /themeToggle\.addEventListener\("click"/);
});

test("mobile menu logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const mobileMenuScript = readWebFile("js/ui/mobile-menu.js");

  assert.match(html, /src="js\/ui\/mobile-menu\.js"/);
  assert.match(mobileMenuScript, /window\.registerMarkdownViewerMobileMenu\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerMobileMenu\(app,/);
  assert.doesNotMatch(legacyScript, /function openMobileMenu/);
  assert.doesNotMatch(legacyScript, /function closeMobileMenu/);
  assert.doesNotMatch(legacyScript, /mobileMenuToggle\.addEventListener\("click"/);
});

test("recent item helpers are registered from their extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const recentScript = readWebFile("js/recent/index.js");

  assert.match(html, /src="js\/recent\/index\.js"/);
  assert.match(recentScript, /window\.registerMarkdownViewerRecentItems\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerRecentItems\(app,/);
  assert.doesNotMatch(legacyScript, /function readRecentItemsFromLocalStorage/);
  assert.doesNotMatch(legacyScript, /function renderRecentMenus/);
  assert.doesNotMatch(legacyScript, /function scheduleGlobalProfileWrite/);
});

test("keyboard shortcuts are registered from their extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const shortcutScript = readWebFile("js/keyboard-shortcuts.js");

  assert.match(html, /src="js\/keyboard-shortcuts\.js"/);
  assert.match(shortcutScript, /window\.registerMarkdownViewerKeyboardShortcuts\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerKeyboardShortcuts\(app,/);
  assert.doesNotMatch(legacyScript, /document\.addEventListener\("keydown", function \(e\)/);
});

test("clipboard logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const clipboardScript = readWebFile("js/clipboard.js");

  assert.match(html, /src="js\/clipboard\.js"/);
  assert.match(clipboardScript, /window\.registerMarkdownViewerClipboard\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerClipboard\(app,/);
  assert.doesNotMatch(legacyScript, /async function copyToClipboard/);
  assert.doesNotMatch(legacyScript, /function showCopiedMessage/);
});

test("scroll sync logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const scrollSyncScript = readWebFile("js/scroll-sync.js");

  assert.match(html, /src="js\/scroll-sync\.js"/);
  assert.match(scrollSyncScript, /window\.registerMarkdownViewerScrollSync\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerScrollSync\(app,/);
  assert.doesNotMatch(legacyScript, /function syncEditorToPreview/);
  assert.doesNotMatch(legacyScript, /function syncPreviewToEditor/);
  assert.doesNotMatch(legacyScript, /function toggleSyncScrolling/);
});

test("unsaved-change logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const unsavedScript = readWebFile("js/unsaved-changes.js");

  assert.match(html, /src="js\/unsaved-changes\.js"/);
  assert.match(unsavedScript, /window\.registerMarkdownViewerUnsavedChanges\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerUnsavedChanges\(app,/);
  assert.doesNotMatch(legacyScript, /function normalizeEditorContent/);
  assert.doesNotMatch(legacyScript, /function tabHasUnsavedChanges/);
  assert.doesNotMatch(legacyScript, /window\.markdownViewerConfirmDiscardUnsavedBeforeExit =/);
});

test("editor line UI is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const lineStatusScript = readWebFile("js/editor/line-status.js");

  assert.match(html, /src="js\/editor\/line-status\.js"/);
  assert.match(lineStatusScript, /window\.registerMarkdownViewerEditorLineStatus\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerEditorLineStatus\(app,/);
  assert.doesNotMatch(legacyScript, /function updateEditorLineNumbers/);
  assert.doesNotMatch(legacyScript, /function updateEditorSelectionHighlights/);
  assert.doesNotMatch(legacyScript, /let editorLineMeasure/);
});

test("status line logic is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const statusLineScript = readWebFile("js/editor/status-line.js");

  assert.match(html, /src="js\/editor\/status-line\.js"/);
  assert.match(statusLineScript, /window\.registerMarkdownViewerStatusLine\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerStatusLine\(app,/);
  assert.doesNotMatch(legacyScript, /function updateDocumentStats/);
  assert.doesNotMatch(legacyScript, /function updateStatusLine/);
  assert.doesNotMatch(legacyScript, /function updateMobileStats/);
});

test("editor context menu is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const contextMenuScript = readWebFile("js/editor/context-menu.js");

  assert.match(html, /src="js\/editor\/context-menu\.js"/);
  assert.match(contextMenuScript, /window\.registerMarkdownViewerEditorContextMenu\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerEditorContextMenu\(app,/);
  assert.doesNotMatch(legacyScript, /function renderEditorContextMenu/);
  assert.doesNotMatch(legacyScript, /function replaceEditorSelectionPreservingUndo/);
  assert.doesNotMatch(legacyScript, /const editorMarkdownActions/);
});

test("editor autocomplete is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const autocompleteScript = readWebFile("js/editor/autocomplete.js");

  assert.match(html, /src="js\/editor\/autocomplete\.js"/);
  assert.match(autocompleteScript, /window\.registerMarkdownViewerAutocomplete\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerAutocomplete\(app,/);
  assert.doesNotMatch(legacyScript, /function getLinkAutocompleteLayer/);
  assert.doesNotMatch(legacyScript, /function getLinkAutocompleteContext/);
  assert.doesNotMatch(legacyScript, /function handleLinkAutocompleteKeydown/);
});

test("editor syntax highlighting is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const syntaxScript = readWebFile("js/editor/syntax-highlight.js");

  assert.match(html, /src="js\/editor\/syntax-highlight\.js"/);
  assert.match(syntaxScript, /window\.registerMarkdownViewerEditorSyntaxHighlight\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerEditorSyntaxHighlight\(app,/);
  assert.doesNotMatch(legacyScript, /function renderEditorSyntaxHighlights/);
  assert.doesNotMatch(legacyScript, /function renderMarkdownSyntaxLine/);
  assert.doesNotMatch(legacyScript, /function renderInlineMarkdownSyntax/);
});

test("markdown renderer configuration is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const rendererConfigScript = readWebFile("js/markdown/renderer-config.js");

  assert.match(html, /src="js\/markdown\/renderer-config\.js"/);
  assert.match(rendererConfigScript, /window\.registerMarkdownViewerRendererConfig\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerRendererConfig\(app,/);
  assert.doesNotMatch(legacyScript, /const markedOptions =/);
  assert.doesNotMatch(legacyScript, /new marked\.Renderer\(\)/);
  assert.doesNotMatch(legacyScript, /renderer\.code = function/);
});

test("drag and drop behavior is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const dragDropScript = readWebFile("js/import/drag-drop.js");

  assert.match(html, /src="js\/import\/drag-drop\.js"/);
  assert.match(dragDropScript, /window\.registerMarkdownViewerDragDrop\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerDragDrop\(app,/);
  assert.doesNotMatch(legacyScript, /function preventDefaults/);
  assert.doesNotMatch(legacyScript, /function highlight\(\)/);
  assert.doesNotMatch(legacyScript, /function unhighlight\(\)/);
});

test("folder open defaults to native directory picker when the browser supports it", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const folderPickerScript = readWebFile("js/platform/folder-picker.js");
  const sidebarContextTreeScript = readWebFile("js/sidebar/context-tree.js");
  const match = folderPickerScript.match(/function shouldUseNativeDirectoryPicker\(\) \{([\s\S]*?)\n    \}/);

  assert.match(html, /src="js\/platform\/folder-picker\.js"/);
  assert.match(folderPickerScript, /window\.registerMarkdownViewerFolderPicker\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerFolderPicker\(app\)/);
  assert.match(html, /src="js\/sidebar\/context-tree\.js"/);
  assert.match(sidebarContextTreeScript, /folderPicker\.shouldUseNativeDirectoryPicker\(event\)/);
  assert.ok(match, "shouldUseNativeDirectoryPicker should exist");
  assert.match(match[1], /supported = supportsNativeDirectoryPicker\(\);/);
  assert.match(match[1], /return supported;/);
  assert.doesNotMatch(match[1], /event\.altKey/);
});

test("folder input fallback remains available for unsupported browsers", () => {
  const html = readWebFile("index.html");
  const sidebarContextTreeScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(html, /id="folder-input"[^>]*webkitdirectory[^>]*directory[^>]*multiple/);
  assert.match(sidebarContextTreeScript, /folderInput\.click\(\)/);
  assert.match(sidebarContextTreeScript, /Folder selection is not supported in this environment/);
});
