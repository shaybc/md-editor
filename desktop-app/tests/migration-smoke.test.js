const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function readWebFile(relativePath) {
  const resourcePath = relativePath === "script.js" ? path.join("js", "script.js") : relativePath;
  return fs.readFileSync(path.join(webRoot, resourcePath), "utf8");
}

test("classic migration scripts load before the legacy monolith", () => {
  const html = readWebFile("index.html");
  const expectedOrder = [
    'src="js/startup-errors.js"',
    'src="js/core/context.js"',
    'src="js/app.js"',
    'src="js/platform/folder-picker.js"',
    'src="js/files/types.js"',
    'src="js/files/large-file-viewer.js"',
    'src="js/files/large-json.js"',
    'src="js/files/save.js"',
    'src="js/files/open.js"',
    'src="js/ui/theme-preferences.js"',
    'src="js/ui/mobile-menu.js"',
    'src="js/recent/index.js"',
    'src="js/recent/actions.js"',
    'src="js/lsp/analysis-generation-coordinator.js"',
    'src="js/lsp/server-registry.js"',
    'src="js/lsp/vsix-installer.js"',
    'src="js/lsp/neutralino-lsp-bridge.js"',
    'src="js/clipboard.js"',
    'src="js/scroll-sync.js"',
    'src="js/unsaved-changes.js"',
    'src="js/editor/line-status.js"',
    'src="js/editor/status-line.js"',
    'src="js/editor/commands.js"',
    'src="js/editor/line-delimiter-conversion.js"',
    'src="js/editor/unicode-converter.js"',
    'src="js/editor/base64-converter.js"',
    'src="js/editor/line-delimiter-dialog.js"',
    'src="js/editor/snippets.js"',
    'src="js/editor/codemirror-editor.js"',
    'src="js/editor/license-reference-catalog.js"',
    'src="js/editor/license-summary-header.js"',
    'src="js/editor/view-manager.js"',
    'src="js/editor/source-actions/index.js"',
    'src="js/editor/source-actions/comment-actions.js"',
    'src="js/editor/source-actions/indentation-actions.js"',
    'src="js/editor/source-actions/formatting-actions.js"',
    'src="js/editor/source-actions/languages/java-method-javadoc.js"',
    'src="js/editor/source-actions/project-documentation-actions.js"',
    'src="js/editor/source-actions/languages/java-surround-with-templates.js"',
    'src="js/editor/source-actions/languages/java-surround-with-actions.js"',
    'src="js/editor/source-actions/languages/java.js"',
    'src="js/editor/source-actions/dialogs/extract-interface-dialog.js"',
    'src="js/editor/source-actions/languages/extract-interface/java-extract-interface-workspace-edit.js"',
    'src="js/editor/source-actions/languages/extract-interface/java-extract-interface-actions.js"',
    'src="js/editor/source-actions/dialogs/push-down-dialog.js"',
    'src="js/editor/source-actions/languages/push-down/java-push-down-actions.js"',
    'src="js/editor/source-actions/dialogs/extract-method-dialog.js"',
    'src="js/editor/source-actions/languages/extract-method/java-extract-method-workspace-edit.js"',
    'src="js/editor/source-actions/languages/extract-method/java-extract-method-actions.js"',
    'src="js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-model.js"',
    'src="js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-analysis.js"',
    'src="js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-workspace-edit.js"',
    'src="js/editor/source-actions/dialogs/introduce-parameter-object-dialog.js"',
    'src="js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-actions.js"',
    'src="js/editor/context-menu.js"',
    'src="js/editor/autocomplete.js"',
    'src="js/editor/syntax-highlight.js"',
    'src="js/markdown/renderer-config.js"',
    'src="js/markdown/render.js"',
    'src="js/java/import-cleanup.js"',
    'src="js/graph/documents.js"',
    'src="js/tabs/counter.js"',
    'src="js/tabs/view-manager.js"',
    'src="js/tabs/persistence.js"',
    'src="js/tabs/parse-as-menu.js"',
    'src="js/tabs/index.js"',
    'src="js/import/dropped-items.js"',
    'src="js/import/drag-drop.js"',
    'src="js/search/workspace-search.js"',
    'src="js/share-url.js"',
    'src="js/keyboard-shortcuts.js"',
    'loadScript("js/script.js")',
  ];

  let lastIndex = -1;
  for (const scriptReference of expectedOrder) {
    const index = html.indexOf(scriptReference);
    assert.notEqual(index, -1, `${scriptReference} should be present`);
    assert.ok(index > lastIndex, `${scriptReference} should load after the previous migration script`);
    lastIndex = index;
  }
});

test("Extract Interface classic scripts and dialog style are loaded", () => {
  const html = readWebFile("index.html");
  assert.ok(html.includes('href="/css/editor/extract-interface-dialog.css"'));
  assert.ok(html.includes('src="js/editor/source-actions/dialogs/extract-interface-dialog.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/extract-interface/java-extract-interface-workspace-edit.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/extract-interface/java-extract-interface-actions.js"'));
});

test("Extract Method classic scripts and dialog style are loaded", () => {
  const html = readWebFile("index.html");
  assert.ok(html.includes('href="/css/editor/extract-method-dialog.css"'));
  assert.ok(html.includes('src="js/editor/source-actions/dialogs/extract-method-dialog.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/extract-method/java-extract-method-workspace-edit.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/extract-method/java-extract-method-actions.js"'));
});

test("Push Down classic scripts and dialog style are loaded", () => {
  const html = readWebFile("index.html");
  assert.ok(html.includes('href="/css/editor/push-down-dialog.css"'));
  assert.ok(html.includes('src="js/editor/source-actions/dialogs/push-down-dialog.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/push-down/java-push-down-actions.js"'));
});

test("Introduce Parameter Object classic scripts and dialog style are loaded", () => {
  const html = readWebFile("index.html");
  assert.ok(html.includes('href="/css/editor/introduce-parameter-object-dialog.css"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-model.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-analysis.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-workspace-edit.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/dialogs/introduce-parameter-object-dialog.js"'));
  assert.ok(html.includes('src="js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-actions.js"'));
});

test("legacy script bridges into the shared classic app context", () => {
  const script = readWebFile("script.js");

  assert.match(script, /window\.markdownViewerApp/);
  assert.match(script, /Object\.assign\(app\.dom,/);
  assert.match(script, /Object\.defineProperties\(app\.state,/);
  assert.match(script, /startMarkdownViewer/);
  assert.match(script, /markdownViewerStartupErrors\.guardStartup/);
});

test("settings debug clear action truncates only the configured current log", () => {
  const html = readWebFile("index.html");
  const script = readWebFile("script.js");
  const functionStart = script.indexOf("async function clearDebugLogFromSettings()");
  const nextFunctionStart = script.indexOf("\n  function ", functionStart + 1);
  const clearFunction = script.slice(functionStart, nextFunctionStart);

  assert.match(html, /id="settings-clear-debug-log"/);
  assert.match(html, />Clear debug log</);
  assert.match(script, /const settingsClearDebugLogButton = document\.getElementById\("settings-clear-debug-log"\)/);
  assert.notEqual(functionStart, -1, "clearDebugLogFromSettings should exist");
  assert.match(clearFunction, /await Neutralino\.filesystem\.writeFile\(logPath, ""\)/);
  assert.match(script, /settingsClearDebugLogButton\.addEventListener\("click"/);
  assert.doesNotMatch(clearFunction, /rotateLogFile/);
  assert.doesNotMatch(clearFunction, /Neutralino\.filesystem\.remove/);
});

test("header permanently renders one right-side brand without folder identity controls", () => {
  const html = readWebFile("index.html");
  const script = readWebFile("script.js");
  const styles = readWebFile("styles.css");
  const functionStart = script.indexOf("function updateFolderDependentControls()");
  const nextFunctionStart = script.indexOf("\n  function ", functionStart + 1);
  const updateFunction = script.slice(functionStart, nextFunctionStart);

  assert.equal((html.match(/id="header-brand-right"/g) || []).length, 1);
  assert.equal((html.match(/class="header-brand(?:\s|")/g) || []).length, 1);
  assert.match(html, /id="header-brand-right" class="header-brand header-brand-right">/);
  assert.match(html, /class="github-link" title="View on GitHub"/);
  assert.doesNotMatch(html, /id="header-folder-(?:identity|name|path)"/);
  assert.doesNotMatch(html, /id="header-source-root"/);
  assert.doesNotMatch(html, /id="header-brand-left"/);
  assert.notEqual(functionStart, -1, "updateFolderDependentControls should exist");
  assert.match(updateFunction, /updateOriginalSourceRootButtons\(hasFolder && !!folderPath\)/);
  assert.match(updateFunction, /updateProjectMenuButtons\(hasFolder && !!folderPath\)/);
  assert.match(updateFunction, /workspaceGit\?\.updateWorkspaceGitAvailability/);
  assert.doesNotMatch(script, /renameActiveRootFolder|openActiveFolderInExplorer|updateHeaderFolderIdentity/);
  assert.doesNotMatch(styles, /header-folder-identity|header-folder-name|header-folder-path|header-source-root|has-open-folder/);
});

test("root folder rename reuses the sidebar context refresh action", () => {
  const sidebarScript = readWebFile("js/sidebar/context-tree.js");
  const functionStart = sidebarScript.indexOf("async function refreshOpenFolderTreeFromContextMenu");
  const nextFunctionStart = sidebarScript.indexOf("\n  function ", functionStart + 1);
  const refreshFunction = sidebarScript.slice(functionStart, nextFunctionStart);

  assert.notEqual(functionStart, -1, "refreshOpenFolderTreeFromContextMenu should exist");
  assert.match(refreshFunction, /const refreshed = await reloadOpenFolderTree\(\)/);
  assert.match(sidebarScript, /refreshFolderTreeBtn\.addEventListener\("click", async \(event\) => \{[\s\S]*await refreshOpenFolderTreeFromContextMenu\(\);/);
  assert.match(sidebarScript, /refreshOpenFolderTreeFromContextMenu,/);
});

test("sidebar file open rebuilds stale full paths after root folder rename", () => {
  const sidebarScript = readWebFile("js/sidebar/context-tree.js");
  const functionStart = sidebarScript.indexOf("function getSidebarNodeFilesystemPath(node)");
  const nextFunctionStart = sidebarScript.indexOf("\n  async function ", functionStart + 1);
  const pathFunction = sidebarScript.slice(functionStart, nextFunctionStart);

  assert.notEqual(functionStart, -1, "getSidebarNodeFilesystemPath should exist");
  assert.match(pathFunction, /activeFolderPath && node\.path && !isPathInsideFolder\(node\.fullPath, activeFolderPath\)/);
  assert.match(pathFunction, /return joinPath\(activeFolderPath, node\.path\)/);
  assert.match(pathFunction, /if \(node\.fullPath\)/);
});

test("startup crash guard loads before app scripts", () => {
  const html = readWebFile("index.html");
  const startupScript = readWebFile("js/startup-errors.js");

  assert.ok(
    html.indexOf('src="js/startup-errors.js"') < html.indexOf('src="js/core/context.js"'),
    "startup crash guard should load before app scripts"
  );
  assert.match(startupScript, /addEventListener\("error"/);
  assert.match(startupScript, /addEventListener\("unhandledrejection"/);
  assert.match(startupScript, /guardStartup/);
  assert.match(startupScript, /startup-crash-overlay/);
  assert.match(startupScript, /Neutralino/);
  assert.match(startupScript, /writeNativeCrashLog/);
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
  const registryScript = readWebFile("js/ui/theme-registry.js");
  const themeScript = readWebFile("js/ui/theme-preferences.js");

  assert.match(html, /src="js\/ui\/theme-registry\.js"/);
  assert.ok(
    html.indexOf('src="js/ui/theme-registry.js"') < html.indexOf('src="/js/startup/boot-screen.js"'),
    "theme registry should load before startup boot"
  );
  assert.match(registryScript, /window\.markdownViewerThemeRegistry\s*=/);
  assert.match(html, /src="js\/ui\/theme-preferences\.js"/);
  assert.match(themeScript, /window\.registerMarkdownViewerThemePreferences\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerThemePreferences\(app,/);
  assert.doesNotMatch(legacyScript, /themeToggle\.addEventListener\("click"/);
});

test("settings exposes app theme customization", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /data-settings-tab="themes"/);
  assert.match(html, /data-settings-panel="themes"/);
  assert.match(html, /id="settings-theme-light-select"/);
  assert.match(html, /id="settings-theme-dark-select"/);
  assert.match(legacyScript, /let appThemeDraft = null/);
  assert.match(legacyScript, /themeSelections: themeDraft\.themeSelections/);
  assert.match(legacyScript, /customThemes: themeDraft\.customThemes/);
});

test("settings exposes import and export file actions", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /id="settings-export-file"/);
  assert.match(html, /id="settings-import-file"/);
  assert.ok(
    html.indexOf('src="js/ui/settings-transfer.js"') < html.indexOf('loadScript("js/script.js")'),
    "settings transfer module should load before the legacy app script"
  );
  assert.match(legacyScript, /window\.registerMarkdownViewerSettingsTransfer\?\.\(app,/);
});

test("app startup suppresses the browser context menu globally", () => {
  const legacyScript = readWebFile("script.js");

  assert.match(legacyScript, /function suppressBrowserContextMenu\(event\)/);
  assert.match(legacyScript, /suppressBrowserContextMenu[\s\S]*event\.preventDefault\(\)/);
  assert.match(legacyScript, /document\.addEventListener\("contextmenu", suppressBrowserContextMenu, true\)/);
});

test("hamburger and mobile menus expose edit commands before find", () => {
  const html = readWebFile("index.html");
  const desktopEditIndex = html.indexOf("edit-menu-submenu");
  const desktopFindIndex = html.indexOf("find-menu-submenu");
  const mobileEditIndex = html.indexOf('<div class="mobile-menu-section-label">Edit</div>');
  const mobileFindIndex = html.indexOf('<div class="mobile-menu-section-label">Find</div>');

  assert.ok(desktopEditIndex !== -1, "desktop Edit submenu should exist");
  assert.ok(desktopFindIndex !== -1, "desktop Find submenu should exist");
  assert.ok(desktopEditIndex < desktopFindIndex, "desktop Edit submenu should appear before Find");
  assert.ok(mobileEditIndex !== -1, "mobile Edit section should exist");
  assert.ok(mobileFindIndex !== -1, "mobile Find section should exist");
  assert.ok(mobileEditIndex < mobileFindIndex, "mobile Edit section should appear before Find");
  assert.match(html, /data-edit-command="indent-more"/);
  assert.match(html, /data-edit-command="autocomplete-toggle"/);
  assert.match(html, /data-edit-command="duplicate-line"/);
  assert.match(html, /data-edit-command="space-to-tab"/);
  assert.match(html, /data-edit-command="compact-xml"/);
  assert.match(html, /data-edit-command="xml-for-code"/);
  assert.match(html, /data-edit-command="xml-from-code"/);
  assert.match(html, /data-edit-command="xml-create-schema"/);
  assert.match(html, /data-edit-command="xml-create-stub"/);
  assert.match(html, /data-line-delimiter="crlf"/);
  assert.match(html, /data-line-delimiter="lf"/);
  assert.match(html, /id="line-delimiter-scope-modal"/);
  assert.match(html, /id="line-delimiter-folder-tree"/);
  assert.match(html, /id="line-delimiter-confirm-modal"/);
  assert.match(html, /This will save all affected files and cannot be undone\./);
});

test("interface settings expose indent and autocomplete controls", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const styles = readWebFile("styles.css");

  assert.match(html, /id="settings-spaces-per-indent-level"/);
  assert.match(html, /id="settings-tabs-per-indent-level"/);
  assert.match(html, /id="settings-document-word-autocomplete"/);
  assert.match(html, /id="settings-sidebar-rail-style"/);
  assert.match(html, /id="settings-sidebar-rail-show-git"/);
  assert.match(html, /id="settings-sidebar-rail-show-api-client"/);
  assert.match(html, /id="settings-sidebar-rail-show-regex-tester"/);
  assert.match(html, /open-base64-tool/);
  assert.match(html, /open-certificate-decoder/);
  assert.match(html, /open-jwt-tool/);
  assert.match(html, /open-json-yaml-tool/);
  assert.match(html, /open-jsonpath-tool/);
  assert.match(html, /open-xpath-tool/);
  assert.match(html, /open-uuid-tool/);
  assert.match(html, /open-qr-tool/);
  assert.match(html, /open-hash-tool/);
  assert.match(html, /open-json-array-table-tool/);
  assert.match(html, /open-text-escape-tool/);
  assert.match(html, /open-unicode-tool/);
  assert.match(html, /open-string-bytes-tool/);
  assert.match(html, /open-database-connection-string-tool/);
  assert.match(html, /id="settings-sidebar-rail-show-ai-companion"/);
  assert.match(html, /id="settings-sidebar-rail-show-settings"/);
  assert.match(html, /data-sidebar-rail-icon="files"/);
  assert.match(html, /data-sidebar-rail-icon="settings"/);
  assert.match(html, /js\/sidebar\/rail-preferences\.js/);
  assert.match(html, /<span class="settings-field-label">Side rail bar<\/span>/);
  assert.match(html, /<option value="thin">Thin<\/option>/);
  assert.match(html, /<option value="spacious">Spacious<\/option>/);
  assert.match(html, /<span class="sidebar-view-rail-label">Files<\/span>/);
  assert.match(html, /<span class="sidebar-view-rail-label">Settings<\/span>/);
  assert.match(html, /id="settings-language-autocomplete"/);
  assert.match(html, /id="settings-language-server-autocomplete"/);
  assert.match(html, /id="settings-snippet-autocomplete"/);
  assert.match(html, /data-settings-tab="snippets"/);
  assert.match(html, /data-settings-panel="snippets"/);
  assert.match(html, /id="settings-snippet-language"/);
  assert.match(html, /id="settings-snippet-list"/);
  assert.match(html, /id="settings-snippet-template"/);
  assert.match(legacyScript, /spacesPerIndentLevel: DEFAULT_SPACES_PER_INDENT_LEVEL/);
  assert.match(legacyScript, /tabsPerIndentLevel: DEFAULT_TABS_PER_INDENT_LEVEL/);
  assert.match(legacyScript, /documentWordAutocompleteEnabled: true/);
  assert.match(legacyScript, /languageAutocompleteEnabled: true/);
  assert.match(legacyScript, /languageServerAutocompleteEnabled: true/);
  assert.match(legacyScript, /languageServerAutocompleteEnabled !== false/);
  assert.match(legacyScript, /snippetAutocompleteEnabled: true/);
  const recentItemsSource = readWebFile("js/recent/index.js");
  assert.match(recentItemsSource, /const GLOBAL_PROFILE_VERSION = 2/);
  assert.match(recentItemsSource, /Number\(profileData\?\.version\) >= GLOBAL_PROFILE_VERSION/);
  assert.match(recentItemsSource, /languageServerAutocompleteEnabled: true/);
  assert.match(legacyScript, /sidebarRailStyle: "thin"/);
  assert.match(legacyScript, /sidebarRailIconOrder: DEFAULT_SIDEBAR_RAIL_ICON_ORDER/);
  assert.match(legacyScript, /sidebarRailIconVisibility: DEFAULT_SIDEBAR_RAIL_ICON_VISIBILITY/);
  const railPreferencesSource = readWebFile("js/sidebar/rail-preferences.js");
  assert.match(railPreferencesSource, /LONG_PRESS_DELAY_MS = 400/);
  assert.match(railPreferencesSource, /PRESS_MOVEMENT_THRESHOLD_PX = 8/);
  assert.match(railPreferencesSource, /registerMarkdownViewerSidebarRailPreferences/);
  assert.match(railPreferencesSource, /fixedBottomIconId = "settings"/);
  assert.match(styles, /\.sidebar-settings-rail-button\s*\{\s*margin-top: auto/);
  assert.match(styles, /\.sidebar-rail-ai-bottom \.sidebar-ai-companion-rail-button/);
  assert.match(legacyScript, /sidebarRailStyle,\s*\n\s*sidebarRailIconOrder,\s*\n\s*sidebarRailIconVisibility,\s*\n\s*workspaceSearchResultLimit/);
  assert.match(styles, /body\.sidebar-rail-spacious \.sidebar-view-rail/);
  assert.match(styles, /body\.sidebar-rail-spacious \.sidebar-view-rail-label/);
  assert.doesNotMatch(styles, /body\.ai-companion-workspace-open \.sidebar-view-rail(?:-button|-label)?\s*\{/);
  assert.match(legacyScript, /editorSnippetPreferences: \{ version: 1, overrides: \{\}, custom: \{\} \}/);
  assert.match(legacyScript, /registerMarkdownViewerSnippetRegistry/);
  assert.match(legacyScript, /settingsSnippetPreferencesDraft/);
  const snippetRegistry = readWebFile("js/editor/snippets.js");
  assert.match(snippetRegistry, /id: "java", label: "Java"/);
  assert.match(snippetRegistry, /id: "yaml", label: "YAML"/);
  assert.match(snippetRegistry, /kubernetes-deployment/);
  assert.match(snippetRegistry, /docker-compose-spring-postgres/);
  assert.match(snippetRegistry, /id: "python", label: "Python"/);
  assert.match(snippetRegistry, /id: "csharp", label: "C#"/);
  assert.match(snippetRegistry, /CSHARP_SNIPPETS/);
  assert.match(snippetRegistry, /node-express-route/);
  assert.match(legacyScript, /function normalizeSpacesPerIndentLevel/);
});

test("CodeMirror source exposes edit command hooks and configurable completion", () => {
  const html = readWebFile("index.html");
  const source = readWebFile("js/editor/codemirror-bundle-source.js");
  const wrapper = readWebFile("js/editor/codemirror-editor.js");

  assert.match(source, /indentMore/);
  assert.match(source, /indentLess/);
  assert.match(source, /toggleComment/);
  assert.match(source, /toggleBlockComment/);
  assert.match(source, /indentSelection/);
  assert.match(source, /key: "Mod-i", run: indentSelection/);
  assert.match(wrapper, /event\.code === "Slash"/);
  assert.match(wrapper, /toggleEditorComment\(\)/);
  assert.match(wrapper, /toggleEditorBlockComment\(\)/);
  assert.match(html, /data-edit-command="toggle-comment"[\s\S]*?menu-shortcut-label">Ctrl\+\/<\/span>/);
  assert.match(source, /startCompletion/);
  assert.match(source, /documentWordCompletionSource/);
  assert.match(source, /documentWordAutocompleteEnabled/);
  assert.match(source, /getLanguageCompletionSources/);
  assert.match(source, /getSnippetCompletionSource/);
  assert.match(source, /snippetCompletion/);
  assert.match(source, /\["javascript", "typescript", "java", "yaml", "python", "csharp"\]\.includes\(languageId\)/);
  assert.match(source, /createAutocompleteExtension/);
  assert.match(source, /languageAutocompleteEnabled/);
  assert.match(source, /languageServerAutocompleteEnabled/);
  assert.match(source, /resolvingServerCompletionSource/);
  assert.match(source, /hasLspCompletionWordPrefix/);
  assert.match(source, /syntaxTree\(state\)\.resolveInner/);
  assert.match(source, /node\.name === "LineComment" \|\| node\.name === "BlockComment"/);
  assert.match(source, /function shouldSuppressJavaDotCompletion/);
  assert.match(source, /currentLanguageId === "java"[\s\S]*character === "\."[\s\S]*!isJavaCompletionPositionInComment/);
  assert.match(source, /resolvingServerCompletionSource\(context, lspLanguageId\)/);
  assert.match(source, /triggerReason === "triggerCharacter"[\s\S]*triggerKind: 2, triggerCharacter: triggerChar/);
  assert.match(source, /finalDotOffset = match\.text\.lastIndexOf\("\."\)/);
  assert.match(source, /function isJavaMemberCompletionContext/);
  assert.match(source, /function suppressJavaMemberFallback/);
  assert.match(source, /languageSources\.map\(\(source\) => suppressJavaMemberFallback\(source, languageId\)\)/);
  assert.match(source, /suppressJavaMemberFallback\(snippetSource, languageId\)/);
  assert.match(source, /DOCKERFILE_COMPLETIONS/);
  assert.match(source, /FROM baseImage/);
  assert.match(source, /shouldUseDockerfileCompletionSource/);
  assert.match(source, /activeLspLanguageId/);
  assert.match(source, /logCodeMirrorLspDebug/);
  assert.match(source, /Dockerfile fallback completion source invoked/);
  assert.match(source, /LSP_CLIENT_CAPABILITIES/);
  assert.match(source, /snippetSupport: true/);
  assert.match(source, /codeAction/);
  assert.match(source, /source\.organizeImports/);
  assert.match(source, /publishDiagnostics/);
  assert.match(source, /workspace:\s*Object\.freeze\(\{\s*configuration:\s*true/);
  assert.match(source, /workspace\/configuration/);
  assert.match(source, /function configureLspWorkspace\(client, configuration\)/);
  assert.match(source, /workspace\/didChangeConfiguration/);
  assert.match(source, /createCssCustomPropertyExtension/);
  assert.match(source, /cm-cssCustomPropertyName/);
  assert.match(source, /cm-cssCustomPropertyTooltip/);
  assert.match(source, /if \(normalizedPreferences\.languageServer\) sources\.push\(\(context\) => resolvingServerCompletionSource\(context, lspLanguageId\)\);[\s\S]*if \(normalizedPreferences\.documentWords\)/);
  assert.match(source, /snippetAutocompleteEnabled/);
  assert.match(source, /setSnippetDefinitions/);
  assert.match(wrapper, /setDocumentWordAutocomplete/);
  assert.match(wrapper, /setAutocompletePreferences/);
  assert.match(wrapper, /setLanguageAutocomplete/);
  assert.match(wrapper, /setLanguageServerAutocomplete/);
  assert.match(wrapper, /setSnippetAutocomplete/);
  assert.match(wrapper, /refreshSnippetDefinitions/);
  assert.match(wrapper, /startEditorCompletion/);
});

test("CodeMirror source exposes optional LSP session hooks", () => {
  const source = readWebFile("js/editor/codemirror-bundle-source.js");
  const wrapper = readWebFile("js/editor/codemirror-editor.js");
  const manager = readWebFile("js/editor/view-manager.js");
  const legacyScript = readWebFile("script.js");
  const html = readWebFile("index.html");
  const registry = readWebFile("js/lsp/server-registry.js");
  const bridge = readWebFile("js/lsp/neutralino-lsp-bridge.js");

  assert.match(source, /@codemirror\/lsp-client/);
  assert.match(source, /setLspSession/);
  assert.match(source, /serverDiagnostics/);
  assert.match(source, /const batchMode =/);
  assert.match(source, /const registryMode =/);
  assert.match(source, /resolvingServerCompletionSource/);
  assert.match(source, /createSharedLspHoverTooltipExtension/);
  assert.match(source, /foldService\.of\(getLspFoldRange\)/);
  assert.match(source, /textDocument\/foldingRange/);
  assert.match(source, /textDocument\/documentSymbol/);
  assert.match(source, /lspGoToDefinitionMouseHandler/);
  assert.match(source, /lspDefinitionHoverExtension/);
  assert.match(source, /cm-lspDefinitionHover/);
  assert.match(source, /function goToLspDefinition\(view\)/);
  assert.match(source, /session\.workspaceConfiguration/);
  assert.match(source, /client\/registerCapability/);
  assert.match(wrapper, /getLspSession/);
  assert.match(wrapper, /getDocumentSymbols/);
  assert.match(wrapper, /getLspDocumentContext/);
  assert.match(wrapper, /applyLspTextEdits/);
  assert.match(wrapper, /refreshLspSessionForActivePath/);
  assert.doesNotMatch(wrapper, /goToDefinitionAt/);
  assert.doesNotMatch(wrapper, /dispatchSyntheticCtrlClick/);
  assert.match(manager, /getLspSession/);
  assert.match(manager, /setLanguageForActivePath/);
  assert.match(legacyScript, /getDesktopAppRootPath/);
  assert.match(wrapper, /getLspSession\({[\s\S]*codeMirrorLanguage: language\?\.codeMirrorLanguage \|\| "text"/);
  assert.match(legacyScript, /\[lsp\] Resolving editor language server session/);
  assert.match(legacyScript, /\[lsp\] Editor session resolved/);
  assert.match(legacyScript, /Using bundled \$\{variantLabel\}/);
  assert.match(legacyScript, /Bundled TypeScript language-server dependencies/);
  assert.match(legacyScript, /Bundled Pyright language-server dependencies/);
  assert.match(legacyScript, /Bundled VS Code HTML language-server dependencies/);
  assert.match(legacyScript, /Bundled VS Code CSS language-server dependencies/);
  assert.match(legacyScript, /Bundled VS Code JSON language-server dependencies/);
  assert.match(legacyScript, /Bundled YAML language-server dependencies/);
  assert.match(legacyScript, /Bundled Bash language-server dependencies/);
  assert.match(legacyScript, /Bundled Dockerfile language-server dependencies/);
  assert.match(legacyScript, /windows-scripting/);
  assert.match(legacyScript, /installJavaLanguageServerFromSettings/);
  assert.match(legacyScript, /window\.markdownViewerAppDebugLog = appDebugLog/);
  assert.doesNotMatch(legacyScript, /SQLS_RELEASES_URL/);
  assert.doesNotMatch(legacyScript, /installSqlLanguageServerFromSettings/);
  assert.match(registry, /completeFunctionCalls: true/);
  assert.match(registry, /PYRIGHT_ENTRY = "node_modules\/pyright\/langserver\.index\.js"/);
  assert.match(registry, /VSCODE_HTML_LANGUAGE_SERVER_ENTRY = "node_modules\/vscode-langservers-extracted\/bin\/vscode-html-language-server"/);
  assert.match(registry, /VSCODE_CSS_LANGUAGE_SERVER_ENTRY = "node_modules\/vscode-langservers-extracted\/bin\/vscode-css-language-server"/);
  assert.match(registry, /VSCODE_JSON_LANGUAGE_SERVER_ENTRY = "node_modules\/vscode-langservers-extracted\/bin\/vscode-json-language-server"/);
  assert.match(registry, /YAML_LANGUAGE_SERVER_ENTRY = "node_modules\/yaml-language-server\/bin\/yaml-language-server"/);
  assert.match(registry, /BASH_LANGUAGE_SERVER_ENTRY = "node_modules\/bash-language-server\/out\/cli\.js"/);
  assert.match(registry, /DOCKERFILE_LANGUAGE_SERVER_ENTRY = "node_modules\/dockerfile-language-server-nodejs\/bin\/docker-langserver"/);
  assert.match(registry, /WINDOWS_SCRIPTING_SERVER_ID = "windows-scripting"/);
  assert.match(registry, /WINDOWS_SCRIPTING_LSP_ENTRY = "resources\/windows-scripting-lsp\/server\.cjs"/);
  assert.match(registry, /JDTLS_LAUNCHER_JAR = "plugins\/org\.eclipse\.equinox\.launcher_\*\.jar"/);
  assert.match(registry, /instructionJSONInSingleQuotes: "warning"/);
  assert.doesNotMatch(registry, /SQLS_LANGUAGE_SERVER_ENTRY/);
  assert.doesNotMatch(registry, /SQL_SERVER_ID/);
  assert.doesNotMatch(registry, /sql-language-server/);
  assert.doesNotMatch(legacyScript, /https:\/\/github\.com\/sqls-server\/sqls\/releases/);
  assert.match(source, /SQL_KEYWORD_COMPLETIONS/);
  assert.match(source, /createSqlIntelligenceCompletionSource/);
  assert.match(source, /collectSqlDocumentCompletions/);
  assert.match(source, /SQL_HOVER_DESCRIPTIONS/);
  assert.match(source, /createSqlHoverExtension/);
  assert.match(source, /includeDocumentWords: normalizedPreferences\.documentWords === true/);
  assert.match(registry, /https:\/\/json\.schemastore\.org\/package\.json/);
  assert.match(legacyScript, /registerMarkdownViewerLspServerRegistry/);
  assert.match(legacyScript, /languageServerAutoStartPreferences/);
  assert.match(legacyScript, /isLanguageServerAutoStartEnabled/);
  assert.match(legacyScript, /hasRunningSessionForFile/);
  assert.match(legacyScript, /stopServerSessions/);
  assert.match(legacyScript, /installTypeScriptLanguageServerFromSettings/);
  assert.match(bridge, /getServerRuntimeStatus/);
  assert.match(bridge, /hasRunningSessionForFile/);
  assert.match(bridge, /summarizeHoverResult/);
  assert.match(bridge, /hoverResult/);
  assert.match(bridge, /stopServerSessions/);
  assert.match(html, /data-settings-tab="language-servers"/);
  assert.match(html, /id="settings-lsp-typescript-actions"/);
  assert.match(html, /id="settings-lsp-typescript-actions-menu"/);
  assert.match(html, /id="settings-lsp-typescript-toggle"/);
  assert.match(html, /id="settings-lsp-typescript-autostart"/);
  assert.match(html, /id="settings-lsp-typescript-install"/);
  assert.match(html, />Download and Install</);
  assert.match(html, /id="settings-lsp-java-status"/);
  assert.match(html, /id="settings-lsp-java-actions"/);
  assert.match(html, /id="settings-lsp-java-actions-menu"/);
  assert.match(html, /id="settings-lsp-java-toggle"/);
  assert.match(html, /id="settings-lsp-java-autostart"/);
  assert.match(html, /id="settings-lsp-java-install"/);
  assert.match(html, /id="settings-lsp-java-install-file"/);
  assert.match(html, /id="settings-lsp-java-remove"/);
  assert.match(html, /id="settings-lsp-manual-install-modal"/);
  assert.match(html, /id="app-notification-modal"/);
  assert.match(html, /src="js\/ui\/notification-modal\.js"/);
  assert.match(html, /id="settings-lsp-python-status"/);
  assert.match(html, /id="settings-lsp-python-toggle"/);
  assert.match(html, /id="settings-lsp-python-autostart"/);
  assert.match(html, /id="settings-lsp-html-status"/);
  assert.match(html, /id="settings-lsp-html-toggle"/);
  assert.match(html, /id="settings-lsp-html-autostart"/);
  assert.match(html, /id="settings-lsp-css-status"/);
  assert.match(html, /id="settings-lsp-css-toggle"/);
  assert.match(html, /id="settings-lsp-css-autostart"/);
  assert.match(html, /id="settings-lsp-json-status"/);
  assert.match(html, /id="settings-lsp-json-toggle"/);
  assert.match(html, /id="settings-lsp-json-autostart"/);
  assert.match(html, /id="settings-lsp-yaml-status"/);
  assert.match(html, /id="settings-lsp-yaml-toggle"/);
  assert.match(html, /id="settings-lsp-yaml-autostart"/);
  assert.match(html, /id="settings-lsp-bash-status"/);
  assert.match(html, /id="settings-lsp-bash-toggle"/);
  assert.match(html, /id="settings-lsp-bash-autostart"/);
  assert.match(html, /id="settings-lsp-dockerfile-status"/);
  assert.match(html, /id="settings-lsp-dockerfile-toggle"/);
  assert.match(html, /id="settings-lsp-dockerfile-autostart"/);
  assert.match(html, /id="settings-lsp-windows-scripting-status"/);
  assert.match(html, /id="settings-lsp-windows-scripting-toggle"/);
  assert.match(html, /id="settings-lsp-windows-scripting-autostart"/);
  assert.match(legacyScript, /installJavaLanguageServerFromFileSettings/);
  assert.match(legacyScript, /registerMarkdownViewerNotificationModal/);
  assert.match(legacyScript, /notificationModal\.show/);
  assert.match(legacyScript, /ECLIPSE_JDTLS_MILESTONES_URL = "https:\/\/download\.eclipse\.org\/jdtls\/milestones\//);
  assert.match(legacyScript, /SOURCEGRAPH_TYPESCRIPT_VSIX_URL = "https:\/\/marketplace\.visualstudio\.com\/_apis\/public\/gallery\/publishers\/sourcegraph\/vsextensions\/javascript-typescript\/latest\/vspackage"/);
  assert.doesNotMatch(html, /id="settings-lsp-sql-status"/);
  assert.doesNotMatch(html, /id="settings-lsp-sql-toggle"/);
  assert.doesNotMatch(html, /id="settings-lsp-sql-autostart"/);
  assert.doesNotMatch(html, /id="settings-lsp-sql-install"/);
  assert.doesNotMatch(html, /id="settings-lsp-sql-remove"/);
  assert.match(html, /bundled TypeScript Language Server/);
  assert.match(html, /bundled Pyright/);
  assert.match(html, /bundled VS Code HTML Language Server/);
  assert.match(html, /bundled VS Code CSS Language Server/);
  assert.match(html, /bundled VS Code JSON Language Server/);
  assert.match(html, /bundled YAML Language Server/);
  assert.match(html, /bundled Bash Language Server/);
  assert.match(html, /Windows Scripting Language Server/);
  assert.doesNotMatch(html, /Install sqls from GitHub releases and select sqls\.exe/);
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

test("recent item storage is deduplicated when helpers register", () => {
  const recentScript = readWebFile("js/recent/index.js");
  const storedItems = new Map();
  const now = Date.now();
  storedItems.set("markdownViewerRecentFiles", JSON.stringify([
    { name: "notes.md", label: "notes.md", path: "docs/notes.md", updatedAt: now - 5 },
    { name: "draft.md", label: "draft.md", path: "docs/draft.md", updatedAt: now - 4 },
    { name: "notes.md", label: "notes.md", path: "docs/notes.md", updatedAt: now }
  ]));
  storedItems.set("markdownViewerRecentFolders", JSON.stringify([
    { name: "Vault", label: "Vault", path: "C:/vault", updatedAt: now - 5 },
    { name: "Archive", label: "Archive", path: "C:/archive", updatedAt: now - 4 },
    { name: "Vault", label: "Vault", path: "C:/vault", updatedAt: now }
  ]));

  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const context = {
    console,
    document: { querySelectorAll: () => [] },
    localStorage: {
      getItem: (key) => storedItems.get(key) || null,
      setItem: (key, value) => storedItems.set(key, String(value))
    },
    window: {}
  };
  context.window = context;
  vm.runInNewContext(recentScript, context);

  const recentItems = context.window.registerMarkdownViewerRecentItems(app, {
    escapeHtml: (value) => String(value || ""),
    getFileName: (filePath) => String(filePath || "").split(/[\\/]/).pop(),
    getMaxRecentFiles: () => 10,
    getMaxRecentFolders: () => 10
  });

  assert.deepEqual(
    Array.from(recentItems.readRecentItems(recentItems.keys.files), (item) => item.path),
    ["docs/notes.md", "docs/draft.md"]
  );
  assert.deepEqual(
    Array.from(JSON.parse(storedItems.get("markdownViewerRecentFolders")), (item) => item.path),
    ["C:/vault", "C:/archive"]
  );
});

test("recent open actions are registered from their extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const recentActionsScript = readWebFile("js/recent/actions.js");

  assert.match(html, /src="js\/recent\/actions\.js"/);
  assert.match(recentActionsScript, /window\.registerMarkdownViewerRecentActions\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerRecentActions\(app,/);
  assert.doesNotMatch(legacyScript, /async function openRecentFile/);
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

test("workspace search is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const workspaceSearchScript = readWebFile("js/search/workspace-search.js");

  assert.match(html, /src="js\/search\/workspace-search\.js"/);
  assert.match(workspaceSearchScript, /global\.registerMarkdownViewerWorkspaceSearch\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerWorkspaceSearch\(app,/);
  assert.match(legacyScript, /openWorkspaceSearchModal/);
});

test("find in files is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const findInFilesScript = readWebFile("js/search/find-in-files.js");

  assert.match(html, /src="js\/search\/find-in-files\.js"/);
  assert.ok(
    html.indexOf('src="js/search/workspace-search.js"') < html.indexOf('src="js/search/find-in-files.js"')
      && html.indexOf('src="js/search/find-in-files.js"') < html.indexOf('src="js/keyboard-shortcuts.js"'),
    "find in files should load after workspace search and before keyboard shortcuts"
  );
  assert.match(findInFilesScript, /global\.registerMarkdownViewerFindInFiles\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerFindInFiles\(app,/);
  assert.match(legacyScript, /openFindInFilesModal/);
});

test("graph persistence receives unresolved dependency extraction", () => {
  const legacyScript = readWebFile("script.js");

  assert.match(
    legacyScript,
    /const extractUnresolvedDependencies = graphExtraction\.extractUnresolvedDependencies;/
  );
  assert.match(
    legacyScript,
    /registerMarkdownViewerGraphPersistence\(app,[\s\S]*extractMarkdownLinks,[\s\S]*extractUnresolvedDependencies,/
  );
});

test("graph health panel is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const packageSummaryScript = readWebFile("js/graph/package-summary.js");
  const mavenRecoveryScript = readWebFile("js/graph/maven-recovery.js");
  const healthScript = readWebFile("js/graph/health.js");
  const rendererScript = readWebFile("js/graph/renderer.js");

  assert.match(html, /src="js\/graph\/package-summary\.js"/);
  assert.match(html, /src="js\/graph\/maven-recovery\.js"/);
  assert.match(html, /src="js\/graph\/health\.js"/);
  assert.ok(
    html.indexOf('src="js/graph/package-summary.js"') < html.indexOf('src="js/graph/maven-recovery.js"')
      && html.indexOf('src="js/graph/maven-recovery.js"') < html.indexOf('src="js/graph/health.js"'),
    "graph health helpers should load before graph health"
  );
  assert.match(packageSummaryScript, /global\.registerMarkdownViewerGraphPackageSummary\s*=/);
  assert.match(mavenRecoveryScript, /global\.registerMarkdownViewerGraphMavenRecovery\s*=/);
  assert.match(healthScript, /global\.registerMarkdownViewerGraphHealth\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerGraphPackageSummary\(app,/);
  assert.match(legacyScript, /window\.registerMarkdownViewerGraphMavenRecovery\(app,/);
  assert.match(legacyScript, /window\.registerMarkdownViewerGraphHealth\(app,/);
  assert.match(legacyScript, /graphPackageSummary,/);
  assert.match(legacyScript, /graphMavenRecovery,/);
  assert.match(legacyScript, /renderGraphHealthReportView/);
  assert.match(legacyScript, /openGraphHealthReportTab/);
  assert.match(rendererScript, /Show Health graph report/);
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
  const statusManagerScript = readWebFile("js/editor/status-manager.js");
  const statusLineScript = readWebFile("js/editor/status-line.js");

  assert.match(html, /src="js\/editor\/status-manager\.js"/);
  assert.match(html, /src="js\/editor\/status-line\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/status-manager.js"') < html.indexOf('src="js/editor/status-line.js"'),
    "status manager should load before the status line"
  );
  assert.match(html, /id="editor-engine-status"/);
  assert.match(statusManagerScript, /global\.registerMarkdownViewerStatusManager\s*=/);
  assert.match(statusManagerScript, /unsetStatus/);
  assert.match(statusLineScript, /window\.registerMarkdownViewerStatusLine\s*=/);
  assert.match(statusLineScript, /updateEditorEngineStatus/);
  assert.match(statusLineScript, /getActiveCodeMirrorEditor/);
  assert.match(legacyScript, /window\.registerMarkdownViewerStatusLine\(app,/);
  assert.match(legacyScript, /editorEngineStatusElement/);
  assert.doesNotMatch(legacyScript, /function updateDocumentStats/);
  assert.doesNotMatch(legacyScript, /function updateStatusLine/);
  assert.doesNotMatch(legacyScript, /function updateMobileStats/);
});

test("active editor commands route editor actions through the active tab view", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const commandsScript = readWebFile("js/editor/commands.js");
  const autocompleteScript = readWebFile("js/editor/autocomplete.js");
  const contextMenuScript = readWebFile("js/editor/context-menu.js");
  const shortcutScript = readWebFile("js/keyboard-shortcuts.js");
  const tabsScript = readWebFile("js/tabs/index.js");
  const sidebarScript = readWebFile("js/sidebar/context-tree.js");
  const graphScript = readWebFile("js/graph/renderer.js");
  const tagsScript = readWebFile("js/tags/index.js");

  assert.match(html, /src="js\/editor\/commands\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/commands.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "active editor commands should load before editor command consumers"
  );
  assert.match(commandsScript, /global\.registerMarkdownViewerActiveEditorCommands\s*=/);
  assert.match(commandsScript, /getActiveEditorValue/);
  assert.match(commandsScript, /getActiveEditorSelection/);
  assert.match(commandsScript, /replaceActiveEditorRange/);
  assert.match(commandsScript, /getActiveEditorScroll/);
  assert.match(commandsScript, /isActiveEditorFocused/);
  assert.match(legacyScript, /window\.registerMarkdownViewerActiveEditorCommands\(app,/);
  assert.match(legacyScript, /registerMarkdownViewerAutocomplete\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerEditorContextMenu\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerFileSave\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerTabs\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerSidebarContextTree\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerGraphRenderer\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerTags\(app,[\s\S]*activeEditorCommands,/);
  assert.match(legacyScript, /registerMarkdownViewerStatusLine\(app,[\s\S]*activeEditorCommands,/);
  assert.match(autocompleteScript, /activeEditorCommands/);
  assert.match(contextMenuScript, /activeEditorCommands/);
  assert.match(shortcutScript, /activeEditorCommands/);
  assert.match(tabsScript, /getActiveEditorContent/);
  assert.match(sidebarScript, /setActiveEditorContent/);
  assert.match(graphScript, /activeEditorCommands\?\.setActiveEditorValue/);
  assert.match(tagsScript, /setActiveEditorContent/);
});

test("editor context menu is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const contextMenuScript = readWebFile("js/editor/context-menu.js");
  const unicodeConverterScript = readWebFile("js/editor/unicode-converter.js");
  const base64ConverterScript = readWebFile("js/editor/base64-converter.js");
  const xmlSchemaGeneratorScript = readWebFile("js/editor/xml-schema-generator.js");
  const xmlStubGeneratorScript = readWebFile("js/editor/xml-stub-generator.js");
  const sidebarScript = readWebFile("js/sidebar/context-tree.js");
  const sourceActionsScript = readWebFile("js/editor/source-actions/index.js");
  const indentationSourceActionsScript = readWebFile("js/editor/source-actions/indentation-actions.js");
  const formattingSourceActionsScript = readWebFile("js/editor/source-actions/formatting-actions.js");
  const commentSourceActionsScript = readWebFile("js/editor/source-actions/comment-actions.js");
  const javaMethodJavadocScript = readWebFile("js/editor/source-actions/languages/java-method-javadoc.js");
  const javaSurroundTemplatesScript = readWebFile("js/editor/source-actions/languages/java-surround-with-templates.js");
  const javaSurroundActionsScript = readWebFile("js/editor/source-actions/languages/java-surround-with-actions.js");
  const javaSourceActionsScript = readWebFile("js/editor/source-actions/languages/java.js");
  const javaAccessorGeneratorScript = readWebFile("js/editor/source-actions/languages/java-accessor-generator.js");
  const javaGetterSetterActionsScript = readWebFile("js/editor/source-actions/languages/java-getter-setter-actions.js");
  const getterSetterDialogScript = readWebFile("js/editor/source-actions/dialogs/getter-setter-dialog.js");
  const toStringGeneratorScript = readWebFile("js/editor/source-actions/languages/java-to-string-generator.js");
  const toStringActionsScript = readWebFile("js/editor/source-actions/languages/java-to-string-actions.js");
  const constructorGeneratorScript = readWebFile("js/editor/source-actions/languages/java-constructor-generator.js");
  const constructorActionsScript = readWebFile("js/editor/source-actions/languages/java-constructor-actions.js");
  const equalsHashCodeGeneratorScript = readWebFile("js/editor/source-actions/languages/java-equals-hashcode-generator.js");
  const equalsHashCodeActionsScript = readWebFile("js/editor/source-actions/languages/java-equals-hashcode-actions.js");

  assert.match(html, /src="js\/editor\/source-actions\/index\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/indentation-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/formatting-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/comment-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-method-javadoc\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-surround-with-templates\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-surround-with-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-class-analysis\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-accessor-generator\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/dialogs\/getter-setter-dialog\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-getter-setter-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/dialogs\/to-string-dialog\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-to-string-generator\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-to-string-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/dialogs\/constructor-dialog\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-constructor-generator\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-constructor-actions\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/dialogs\/equals-hashcode-dialog\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-equals-hashcode-generator\.js"/);
  assert.match(html, /src="js\/editor\/source-actions\/languages\/java-equals-hashcode-actions\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/source-actions/index.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "Source actions should load before the editor context menu"
  );
  assert.match(javaSourceActionsScript, /window\.registerMarkdownViewerJavaSourceActions\s*=/);
  assert.match(javaSourceActionsScript, /textDocument\/codeAction/);
  assert.match(javaSourceActionsScript, /source\.organizeImports/);
  assert.match(html, /src="js\/editor\/context-menu\.js"/);
  assert.match(html, /src="js\/editor\/unicode-converter\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/unicode-converter.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "Unicode converter should load before the editor context menu"
  );
  assert.match(unicodeConverterScript, /root\.registerMarkdownViewerUnicodeConverter =/);
  assert.match(legacyScript, /registerMarkdownViewerUnicodeConverter\(app\)/);
  assert.match(contextMenuScript, /getUnicodeConverter/);
  assert.match(html, /src="js\/editor\/base64-converter\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/base64-converter.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "Base64 converter should load before the editor context menu"
  );
  assert.match(base64ConverterScript, /root\.registerMarkdownViewerBase64Converter =/);
  assert.match(html, /src="js\/editor\/xml-schema-generator\.js"/);
  assert.match(html, /src="js\/editor\/xml-stub-generator\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/xml-schema-generator.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "XML schema generator should load before the editor context menu"
  );
  assert.ok(
    html.indexOf('src="js/editor/xml-stub-generator.js"') < html.indexOf('src="js/editor/context-menu.js"'),
    "XML stub generator should load before the editor context menu"
  );
  assert.match(xmlSchemaGeneratorScript, /registerMarkdownViewerXmlSchemaGenerator/);
  assert.match(xmlSchemaGeneratorScript, /createXmlSchemaFromXml/);
  assert.match(xmlStubGeneratorScript, /registerMarkdownViewerXmlStubGenerator/);
  assert.match(xmlStubGeneratorScript, /createXmlStubFromXsd/);
  assert.match(html, /js\/tools\/base64\/base64-tool\.js/);
  assert.match(html, /js\/tools\/certificate-decoder\/certificate-parser\.js/);
  assert.match(html, /js\/tools\/certificate-decoder\/certificate-decoder\.js/);
  assert.match(html, /js\/tools\/jwt\/jwt-codec\.js/);
  assert.match(html, /js\/tools\/jwt\/jwt-tool\.js/);
  assert.match(html, /js\/tools\/json-yaml\/json-yaml-codec\.js/);
  assert.match(html, /js\/tools\/json-yaml\/json-yaml-tool\.js/);
  assert.match(html, /js\/tools\/jsonpath\/jsonpath-evaluator\.js/);
  assert.match(html, /js\/tools\/jsonpath\/jsonpath-tool\.js/);
  assert.match(html, /js\/tools\/xpath\/xpath-evaluator\.js/);
  assert.match(html, /js\/tools\/xpath\/xpath-tool\.js/);
  assert.match(html, /js\/tools\/uuid\/uuid-codec\.js/);
  assert.match(html, /js\/tools\/uuid\/uuid-tool\.js/);
  assert.match(html, /js\/tools\/qr\/qr-codec\.js/);
  assert.match(html, /js\/tools\/qr\/qr-tool\.js/);
  assert.match(html, /js\/tools\/hash\/hash-codec\.js/);
  assert.match(html, /js\/tools\/hash\/hash-tool\.js/);
  assert.match(html, /js\/tools\/json-array-table\/json-array-table-codec\.js/);
  assert.match(html, /js\/tools\/json-array-table\/json-array-table-tool\.js/);
  assert.match(html, /js\/tools\/text-escape\/text-escape-codec\.js/);
  assert.match(html, /js\/tools\/text-escape\/text-escape-tool\.js/);
  assert.match(html, /js\/tools\/unicode\/unicode-codec\.js/);
  assert.match(html, /js\/tools\/unicode\/unicode-tool\.js/);
  assert.match(html, /js\/tools\/string-bytes\/string-bytes-codec\.js/);
  assert.match(html, /js\/tools\/string-bytes\/string-bytes-tool\.js/);
  assert.match(html, /js\/tools\/database-connection-string\/database-connection-string-codec\.js/);
  assert.match(html, /js\/tools\/database-connection-string\/database-connection-string-tool\.js/);
  assert.match(legacyScript, /registerMarkdownViewerBase64Tool/);
  assert.match(legacyScript, /registerMarkdownViewerCertificateParser/);
  assert.match(legacyScript, /registerMarkdownViewerCertificateDecoder/);
  assert.match(legacyScript, /registerMarkdownViewerJsonPathEvaluator/);
  assert.match(legacyScript, /registerMarkdownViewerJsonPathTool/);
  assert.match(legacyScript, /registerMarkdownViewerXPathEvaluator/);
  assert.match(legacyScript, /registerMarkdownViewerXPathTool/);
  assert.match(legacyScript, /registerMarkdownViewerUuidCodec/);
  assert.match(legacyScript, /registerMarkdownViewerUuidTool/);
  assert.match(legacyScript, /registerMarkdownViewerQrCodec/);
  assert.match(legacyScript, /registerMarkdownViewerQrTool/);
  assert.match(legacyScript, /registerMarkdownViewerHashCodec/);
  assert.match(legacyScript, /registerMarkdownViewerHashTool/);
  assert.match(legacyScript, /registerMarkdownViewerJsonArrayTableCodec/);
  assert.match(legacyScript, /registerMarkdownViewerJsonArrayTableTool/);
  assert.match(legacyScript, /registerMarkdownViewerTextEscapeCodec/);
  assert.match(legacyScript, /registerMarkdownViewerTextEscapeTool/);
  assert.match(legacyScript, /registerMarkdownViewerUnicodeCodec/);
  assert.match(legacyScript, /registerMarkdownViewerUnicodeTool/);
  assert.match(legacyScript, /registerMarkdownViewerStringBytesCodec/);
  assert.match(legacyScript, /registerMarkdownViewerStringBytesTool/);
  assert.match(legacyScript, /registerMarkdownViewerDatabaseConnectionStringCodec/);
  assert.match(legacyScript, /registerMarkdownViewerDatabaseConnectionStringTool/);
  assert.match(legacyScript, /registerMarkdownViewerBase64Converter\(app\)/);
  assert.match(contextMenuScript, /getBase64Converter/);
  assert.match(contextMenuScript, /window\.registerMarkdownViewerEditorContextMenu\s*=/);
  assert.match(sourceActionsScript, /registerProvider/);
  assert.match(sourceActionsScript, /getAvailableActions/);
  assert.match(sourceActionsScript, /executeAction/);
  assert.match(sourceActionsScript, /prepareAvailableActions/);
  assert.match(sourceActionsScript, /findAvailableAction/);
  assert.match(commentSourceActionsScript, /label: "Toggle Comment"/);
  assert.match(indentationSourceActionsScript, /label: "Correct Indentation"/);
  assert.match(formattingSourceActionsScript, /label: "Format File"/);
  assert.match(formattingSourceActionsScript, /formatActiveDocument/);
  assert.match(indentationSourceActionsScript, /shortcut: "Ctrl\+I"/);
  assert.match(legacyScript, /window\.registerMarkdownViewerIndentationSourceActions\(app,/);
  assert.match(commentSourceActionsScript, /label: "Toggle Block Comment"/);
  assert.match(javaMethodJavadocScript, /createInsertion/);
  assert.match(legacyScript, /generator: javaMethodJavadoc/);
  assert.match(contextMenuScript, /editor-context-menu-submenu/);
  assert.match(contextMenuScript, /<span>Source<\/span>/);
  assert.match(contextMenuScript, /action\.children\.map\(renderEditorContextAction\)/);
  assert.match(contextMenuScript, /function insertEditorSourceActionSeparators\(actions\)/);
  assert.match(contextMenuScript, /groupedActions\.push\(\{ type: "separator" \}\)/);
  assert.match(contextMenuScript, /id === "toggle-comment" \|\| id === "toggle-block-comment"/);
  assert.match(contextMenuScript, /id === "add-import" \|\| id === "organize-imports"/);
  assert.match(contextMenuScript, /function getEditorJsonSourceActions\(\)/);
  assert.match(contextMenuScript, /menu: "source-json"/);
  assert.match(contextMenuScript, /\.\.\.\(isJsonContext \? getEditorJsonSourceActions\(\) : \[\]\)/);
  assert.match(contextMenuScript, /function getEditorXmlSourceActions\(\)/);
  assert.match(contextMenuScript, /menu: "source-xml"/);
  assert.match(contextMenuScript, /\.\.\.\.\(isXmlContext \? getEditorXmlSourceActions\(\) : \[\]\)/);
  assert.match(contextMenuScript, /case "compact-json":[\s\S]*case "json-for-code":[\s\S]*case "json-from-code":[\s\S]*runJsonEditCommand\(action, \{ useContextSelection: true \}\)/);
  assert.match(contextMenuScript, /case "compact-xml":[\s\S]*case "xml-for-code":[\s\S]*case "xml-from-code":[\s\S]*case "xml-create-schema":[\s\S]*case "xml-create-stub":[\s\S]*runXmlEditCommand\(action, \{ useContextSelection: true \}\)/);
  assert.match(contextMenuScript, /type: "xml-create-schema", label: "Create XML Schema from XML"/);
  assert.match(contextMenuScript, /type: "xml-create-stub", label: "Create XML Stub from XSD"/);
  assert.match(contextMenuScript, /openGeneratedXmlSchemaInTab\(schemaSource, getXmlSchemaOutputTitle\(\)\)/);
  assert.match(contextMenuScript, /openGeneratedXmlStubInTab\(stubSource, getXmlStubOutputTitle\(\)\)/);
  assert.match(legacyScript, /registerMarkdownViewerXmlSchemaGenerator/);
  assert.match(legacyScript, /registerMarkdownViewerXmlStubGenerator/);
  assert.match(legacyScript, /openGeneratedXmlSchemaInTab/);
  assert.match(legacyScript, /openGeneratedXmlStubInTab/);
  assert.match(javaSurroundTemplatesScript, /label: '1 do \(do while statement\)'/);
  assert.match(javaSurroundActionsScript, /label: 'Surround With'/);
  assert.match(javaSurroundActionsScript, /textDocument\/codeAction/);
  assert.match(legacyScript, /registerMarkdownViewerJavaSurroundWithActions\(app,/);
  assert.match(javaSourceActionsScript, /label: "Organize Imports"/);
  assert.match(javaSourceActionsScript, /label: "Format File"/);
  assert.match(javaSourceActionsScript, /label: "Format Selected"/);
  assert.match(sidebarScript, /sidebar-file-source-submenu/);
  assert.match(sidebarScript, /sidebar-file-run-submenu/);
  assert.match(sidebarScript, /"Run As"/);
  assert.match(sidebarScript, /"Config new Run \.\.\."/);
  assert.match(sidebarScript, /openNewJavaConfiguration/);
  assert.match(sidebarScript, /readSidebarNodeContent\(node\)/);
  assert.match(javaGetterSetterActionsScript, /label: "Generate Getters and Setters\.\.\."/);
  assert.match(javaGetterSetterActionsScript, /accessorGenerator\.analyze/);
  assert.ok(legacyScript.indexOf("registerMarkdownViewerJavaMainClassFinder") < legacyScript.indexOf("registerMarkdownViewerSidebarContextTree"));
  assert.match(legacyScript, /get compiler\(\) \{ return app\.modules\?\.javaCompiler; \}/);
  assert.match(javaAccessorGeneratorScript, /function analyze/);
  assert.match(javaAccessorGeneratorScript, /function createInsertion/);
  assert.match(getterSetterDialogScript, /data-selection-action="getters"/);
  assert.match(getterSetterDialogScript, /getter-setter-order/);
  assert.match(getterSetterDialogScript, /getter-setter-generate-comments/);
  assert.match(javaAccessorGeneratorScript, /getters-first/);
  assert.match(javaAccessorGeneratorScript, /createMethodComment/);
  assert.match(toStringActionsScript, /label: "Generate toString\(\)\.\.\."/);
  assert.match(toStringGeneratorScript, /function createInsertion/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaToStringActions\(app,/);
  assert.match(constructorActionsScript, /label: "Generate Constructor using Fields\.\.\."/);
  assert.match(constructorGeneratorScript, /function createInsertion/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaConstructorActions\(app,/);
  assert.match(equalsHashCodeActionsScript, /label: "Generate hashCode\(\) and equals\(\)\.\.\."/);
  assert.match(equalsHashCodeGeneratorScript, /function createInsertion/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaEqualsHashCodeActions\(app,/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaGetterSetterActions\(app,/);
  assert.match(sidebarScript, /runSidebarJavaSourceAction/);
  assert.doesNotMatch(contextMenuScript, /go-to-definition/);
  assert.doesNotMatch(contextMenuScript, /Go to Definition/);
  assert.doesNotMatch(contextMenuScript, /editorContextMenuPoint/);
  assert.doesNotMatch(contextMenuScript, /goToEditorDefinition/);
  assert.doesNotMatch(contextMenuScript, /bindEditorContextActionButton/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaSourceActions\(app,/);
  assert.match(legacyScript, /window\.registerMarkdownViewerEditorContextMenu\(app,/);
  assert.doesNotMatch(legacyScript, /function renderEditorContextMenu/);
  assert.doesNotMatch(legacyScript, /function replaceEditorSelectionPreservingUndo/);
  assert.doesNotMatch(legacyScript, /const editorMarkdownActions/);
});

test("tab context menu wires reveal in tree view action", () => {
  const legacyScript = readWebFile("script.js");
  const tabsScript = readWebFile("js/tabs/index.js");

  assert.match(tabsScript, /data-action="reveal-in-tree-view"/);
  assert.match(tabsScript, /Reveal in TreeView/);
  assert.match(tabsScript, /revealTabInTreeView\(targetTab\)/);
  assert.match(tabsScript, /findFolderTreeFileButtonForTab\(tab\)/);
  assert.match(tabsScript, /hasTabTreeAuthoritativePath\(tab\)/);
  assert.match(tabsScript, /if \(!treeButton && hasTabTreeAuthoritativePath\(tab\)\) \{/);
  assert.match(tabsScript, /setTabContextMenuActionEnabled\(menu,\s*'reveal-in-tree-view'/);
  assert.match(legacyScript, /registerMarkdownViewerTabs\(app,[\s\S]*findFolderTreeFileButtonForTab,/);
  assert.match(legacyScript, /registerMarkdownViewerTabs\(app,[\s\S]*setSidebarVisible,/);
});

test("tab context menu wires the searchable Parse as language override", () => {
  const html = readWebFile("index.html");
  const tabsScript = readWebFile("js/tabs/index.js");
  const parseAsScript = readWebFile("js/tabs/parse-as-menu.js");
  const editorScript = readWebFile("js/editor/codemirror-editor.js");

  assert.ok(html.indexOf('src="js/tabs/parse-as-menu.js"') < html.indexOf('src="js/tabs/index.js"'));
  assert.match(parseAsScript, /Automatic \(file extension\)/);
  assert.match(parseAsScript, /Filter languages/);
  assert.match(parseAsScript, /language\?\.extensions/);
  assert.match(tabsScript, /parseAsLanguageId/);
  assert.match(tabsScript, /refreshLanguageForTab/);
  assert.match(editorScript, /getLanguageOverride/);
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
  assert.match(syntaxScript, /shouldRenderEditorSyntaxHighlights/);
  assert.match(legacyScript, /shouldRenderEditorSyntaxHighlights:\s*function/);
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

test("dropped item open behavior is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const droppedItemsScript = readWebFile("js/import/dropped-items.js");

  assert.match(html, /src="js\/import\/dropped-items\.js"/);
  assert.match(droppedItemsScript, /window\.registerMarkdownViewerDroppedItems\s*=/);
  assert.match(droppedItemsScript, /function showDroppedFolderLoadingState/);
  assert.match(droppedItemsScript, /renderFolderLoadingState\(`Loading \$\{activeFolderName\}\.\.\.`\)/);
  assert.match(legacyScript, /window\.registerMarkdownViewerDroppedItems\(app,/);
  assert.match(legacyScript, /renderFolderLoadingState,\s*[\r\n\s]*renderFolderLoadingError,/);
  assert.doesNotMatch(legacyScript, /async function openDroppedFolder/);
});

test("graph document actions are registered from their extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const graphDocumentsScript = readWebFile("js/graph/documents.js");

  assert.match(html, /src="js\/graph\/documents\.js"/);
  assert.match(graphDocumentsScript, /window\.registerMarkdownViewerGraphDocuments\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerGraphDocuments\(app,/);
  assert.doesNotMatch(legacyScript, /async function openGraphView/);
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

test("desktop folder picker and folder loading errors are reported separately", () => {
  const sidebarContextTreeScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(sidebarContextTreeScript, /selectedPath = await Neutralino\.os\.showFolderDialog\("Select a folder"\)/);
  assert.match(sidebarContextTreeScript, /await openFolderTreeFromNeutralinoPath\(selectedPath\)/);
  assert.match(sidebarContextTreeScript, /Unable to open the desktop folder picker/);
  assert.match(sidebarContextTreeScript, /Unable to load this folder:/);
});

test("settings screen opens on Interface by default", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const settingsScreenScript = readWebFile("js/ui/settings-screen.js");

  assert.match(html, /settings-tab-button settings-tab-child active[^>]*data-settings-tab="interface"/);
  assert.match(html, /data-settings-tab-group-toggle="interface"[^>]*aria-expanded="true"/);
  assert.match(html, /data-settings-tab="keyboard-shortcuts"[^>]*data-settings-parent-tab-group="interface"/);
  assert.match(html, /src="js\/ui\/keyboard-shortcuts-settings\.js"/);
  assert.match(html, /settings-panel active[^>]*data-settings-panel="interface"/);
  assert.match(html, /settings-graph-panel"[^>]*data-settings-panel="graph"[^>]*hidden/);
  assert.match(legacyScript, /defaultTab: "interface"/);
  assert.match(settingsScreenScript, /options\.defaultTab \|\| "interface"/);
});

test("folder view settings have their own tab", () => {
  const html = readWebFile("index.html");

  assert.match(html, /data-settings-tab="folder-view"/);
  assert.match(html, /data-settings-panel="folder-view"/);
  assert.match(html, /id="settings-folder-view-title"/);
  assert.match(html, /settings-folder-view-title[\s\S]*settings-restore-last-folder-on-startup[\s\S]*settings-show-git-folder[\s\S]*settings-show-md-editor-folder[\s\S]*settings-hidden-folder-names[\s\S]*settings-folder-tree-expand-limit-threshold[\s\S]*settings-folder-tree-expand-limit-depth/);
  assert.doesNotMatch(html, /settings-folder-tree-default-state/);
  assert.doesNotMatch(html, /settings-folder-tree-lazy-threshold/);
  assert.doesNotMatch(html, /data-settings-panel="interface"[\s\S]*settings-restore-last-folder-on-startup[\s\S]*<section class="settings-panel" data-settings-panel="folder-view"/);
});

test("folder view settings can hide additional named folders", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const folderToolbarScript = readWebFile("js/sidebar/folder-toolbar.js");
  const flatFolderViewScript = readWebFile("js/sidebar/flat-folder-view.js");
  const sidebarContextScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(html, /id="settings-hidden-folder-names"/);
  assert.match(html, /Comma, space, or newline separated folder names/);
  assert.match(legacyScript, /hiddenFolderNames: ""/);
  assert.match(legacyScript, /split\(\/\[\\s,\]\+\//);
  assert.match(legacyScript, /hiddenFolderNames = normalizeHiddenFolderNames\(settingsHiddenFolderNamesInput\?\.value\)\.join\(", "\)/);
  assert.match(legacyScript, /hiddenFolderNames !== previousHiddenFolderNames/);
  assert.match(legacyScript, /registerMarkdownViewerFolderToolbar\(app, \{[\s\S]*shouldSkipCustomHiddenFolder,/);
  assert.match(legacyScript, /registerMarkdownViewerSidebarContextTree\(app, \{[\s\S]*shouldSkipCustomHiddenFolder,/);
  assert.match(legacyScript, /registerMarkdownViewerFlatFolderView\?\.\(app, \{[\s\S]*shouldSkipCustomHiddenFolder,/);
  assert.match(folderToolbarScript, /shouldSkipCustomHiddenFolder\(node\.name\)/);
  assert.match(flatFolderViewScript, /shouldSkipCustomHiddenFolder\(name\)/);
  assert.match(sidebarContextScript, /shouldSkipCustomHiddenFolder\(entry\.entry\)/);
});

test("folder view settings can show the md-editor project folder in the tree", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const folderToolbarScript = readWebFile("js/sidebar/folder-toolbar.js");
  const sidebarContextScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(html, /id="settings-show-md-editor-folder"/);
  assert.match(legacyScript, /showMdEditorProjectFolder: false/);
  assert.match(legacyScript, /function shouldShowMdEditorProjectFolder\(\)/);
  assert.match(legacyScript, /showMdEditorProjectFolder = settingsShowMdEditorFolderInput\?\.checked === true/);
  assert.match(legacyScript, /showMdEditorProjectFolder !== previousShowMdEditorProjectFolder/);
  assert.match(folderToolbarScript, /node\.name === "\.md-editor" && !\(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder\(\)\)/);
  assert.match(sidebarContextScript, /entry\.entry === "\.md-editor" && !\(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder\(\)\)/);
});

test("folder view hidden-folder policies apply to live tree creation and rename updates", () => {
  const sidebarContextScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(sidebarContextScript, /function shouldHideFolderTreeDirectory\(name\)/);
  assert.match(sidebarContextScript, /name === "\.git" && !\(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder\(\)\)/);
  assert.match(sidebarContextScript, /name === "\.md-editor" && !\(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder\(\)\)/);
  assert.match(sidebarContextScript, /shouldSkipCustomHiddenFolder\(name\)/);
  assert.match(sidebarContextScript, /createdNode\.kind === "directory" && shouldHideFolderTreeDirectory\(createdNode\.name\)/);
  assert.match(sidebarContextScript, /kind === "folder" && shouldHideFolderTreeDirectory\(options\.newName \|\| getFileName\(newTreePath\)\)/);
  assert.match(sidebarContextScript, /removeDeletedPathFromFolderTree\(options\.oldPath \|\| oldTreePath, \{ kind: "folder" \}\)/);
});

test("folder view settings can show the git project folder in the tree", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const folderToolbarScript = readWebFile("js/sidebar/folder-toolbar.js");
  const sidebarContextScript = readWebFile("js/sidebar/context-tree.js");

  assert.match(html, /id="settings-show-git-folder"/);
  assert.match(legacyScript, /showGitProjectFolder: false/);
  assert.match(legacyScript, /function shouldShowGitProjectFolder\(\)/);
  assert.match(legacyScript, /showGitProjectFolder = settingsShowGitFolderInput\?\.checked === true/);
  assert.match(legacyScript, /showGitProjectFolder !== previousShowGitProjectFolder/);
  assert.match(folderToolbarScript, /node\.name === "\.git" && !\(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder\(\)\)/);
  assert.match(sidebarContextScript, /entry\.entry === "\.git" && !\(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder\(\)\)/);
});

test("editor settings tabs are grouped under an expandable Editor parent", () => {
  const html = readWebFile("index.html");
  const editorSettingIds = [
    "settings-external-file-change-behavior",
    "settings-editor-font-family",
    "settings-editor-font-size",
    "settings-spaces-per-indent-level",
    "settings-tabs-per-indent-level",
    "settings-document-word-autocomplete",
    "settings-language-autocomplete",
    "settings-language-server-autocomplete",
    "settings-snippet-autocomplete",
    "settings-unclosed-bracket-highlight"
  ];
  const interfacePanel = html.slice(
    html.indexOf('data-settings-panel="interface"'),
    html.indexOf('data-settings-panel="editor"')
  );

  assert.match(html, /data-settings-tab-group-toggle="editor"/);
  assert.match(html, /id="settings-editor-tab-group"/);
  assert.match(html, /data-settings-parent-tab-group="editor"[\s\S]*data-settings-tab="editor"|data-settings-tab="editor"[\s\S]*data-settings-parent-tab-group="editor"/);
  assert.match(html, /data-settings-parent-tab-group="editor"[\s\S]*data-settings-tab="snippets"|data-settings-tab="snippets"[\s\S]*data-settings-parent-tab-group="editor"/);
  assert.match(html, /data-settings-parent-tab-group="editor"[\s\S]*data-settings-tab="language-servers"|data-settings-tab="language-servers"[\s\S]*data-settings-parent-tab-group="editor"/);
  assert.match(html, /data-settings-parent-tab-group="editor"[\s\S]*data-settings-tab="syntax"|data-settings-tab="syntax"[\s\S]*data-settings-parent-tab-group="editor"/);
  assert.match(html, /data-settings-panel="editor"/);
  assert.match(html, /id="settings-editor-title"/);
  assert.ok(html.indexOf('data-settings-tab="folder-view"') < html.indexOf('data-settings-tab-group-toggle="editor"'));
  assert.ok(html.indexOf('data-settings-tab-group-toggle="editor"') < html.indexOf('data-settings-tab-group-toggle="ai"'));
  assert.match(html, /data-settings-tab-group-toggle="editor"[\s\S]*data-settings-tab="editor"[\s\S]*data-settings-tab="snippets"[\s\S]*data-settings-tab="language-servers"[\s\S]*data-settings-tab="syntax"/);
  assert.match(html, /settings-editor-title[\s\S]*settings-external-file-change-behavior[\s\S]*settings-editor-font-family[\s\S]*settings-editor-font-size[\s\S]*settings-spaces-per-indent-level[\s\S]*settings-tabs-per-indent-level[\s\S]*settings-document-word-autocomplete[\s\S]*settings-language-autocomplete[\s\S]*settings-language-server-autocomplete[\s\S]*settings-snippet-autocomplete[\s\S]*settings-unclosed-bracket-highlight/);
  editorSettingIds.forEach((settingId) => {
    assert.doesNotMatch(interfacePanel, new RegExp(settingId));
  });
});

test("file opening modes have their own Interface settings page", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const settingsScript = readWebFile("js/ui/file-opening-mode-settings.js");

  assert.match(html, /data-settings-tab="file-opening-modes"[^>]*data-settings-parent-tab-group="interface"/);
  assert.match(html, /data-settings-panel="file-opening-modes"/);
  assert.match(html, /id="settings-file-opening-mode-search"/);
  assert.match(html, /id="settings-file-opening-mode-apply-all"/);
  assert.match(html, /id="settings-file-opening-mode-restore"/);
  assert.match(html, /src="js\/ui\/file-opening-mode-settings\.js"/);
  assert.doesNotMatch(html, /settings-default-open-view-mode/);
  assert.doesNotMatch(legacyScript, /defaultOpenViewMode|getDefaultOpenViewMode/);
  assert.match(legacyScript, /fileOpeningModes: \{ version: 1, modes: \{\} \}/);
  assert.match(settingsScript, /resolveModeForSource/);
  assert.match(settingsScript, /supportedExtensionsInput\?\.addEventListener\("input", render\)/);
});

test("desktop folder scan always uses lazy top-level loading", () => {
  const legacyScript = readWebFile("script.js");
  const html = readWebFile("index.html");

  assert.doesNotMatch(html, /id="settings-folder-tree-lazy-threshold"/);
  assert.doesNotMatch(legacyScript, /DEFAULT_FOLDER_TREE_LAZY_THRESHOLD/);
  assert.doesNotMatch(legacyScript, /folderTreeLazyThreshold/);
  assert.doesNotMatch(legacyScript, /getFolderTreeLazyThreshold/);
  assert.match(legacyScript, /function listMarkdownTreeNeutralino\(dirPath, options = \{\}\)/);
  assert.match(legacyScript, /readNeutralinoDirectoryChildren\(dirPath, dirPath\)/);
  assert.match(legacyScript, /opened-folder-lazy-root/);
  assert.doesNotMatch(legacyScript, /scanNeutralinoDirectoryTree\(dirPath, dirPath, \{ threshold:/);
  assert.doesNotMatch(legacyScript, /recursive-file-threshold-lazy/);
  assert.doesNotMatch(legacyScript, /startup-restore-lazy-root/);
});

test("empty folder tree message no longer says only Markdown or graph files are shown", () => {
  const legacyScript = readWebFile("script.js");

  assert.match(legacyScript, /No files or folders found in this folder\./);
  assert.doesNotMatch(legacyScript, /No Markdown or graph files found in this folder\./);
});

test("file type helpers are registered from their extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const fileTypesScript = readWebFile("js/files/types.js");

  assert.match(html, /src="js\/files\/types\.js"/);
  assert.match(fileTypesScript, /window\.registerMarkdownViewerFileTypes\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerFileTypes\(app,/);
  assert.doesNotMatch(legacyScript, /function isGraphFilePath/);
});

test("file save behavior is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const saveScript = readWebFile("js/files/save.js");

  assert.match(html, /src="js\/files\/save\.js"/);
  assert.match(saveScript, /window\.registerMarkdownViewerFileSave\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerFileSave\(app,/);
  assert.match(legacyScript, /registerMarkdownViewerTabs\(app,\s*\{[\s\S]*getMarkdownTabContentForSave,[\s\S]*saveMarkdownTabToSource,/);
  assert.doesNotMatch(legacyScript, /function saveMarkdownTabToSource/);
});

test("file open behavior is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const openScript = readWebFile("js/files/open.js");

  assert.match(html, /src="js\/files\/open\.js"/);
  assert.match(openScript, /window\.registerMarkdownViewerFileOpen\s*=/);
  assert.match(openScript, /largeJsonOpen\?\.prepareLargeJsonForOpen/);
  assert.match(openScript, /largeFileViewer\?\.classifyLargeDocumentOpen/);
  assert.match(openScript, /preferLazyRoot: options\.preferLazyRoot === true/);
  const openDocumentStart = openScript.indexOf("async function openDocumentSourceFile");
  const savedGraphRoute = openScript.indexOf("if (isGraphFilePath(filePath))", openDocumentStart);
  const firstOpenClassification = openScript.indexOf("classifyLargeDocumentOpen", openDocumentStart);
  assert.ok(savedGraphRoute > openDocumentStart && savedGraphRoute < firstOpenClassification, "saved graph files should be routed before heavy document classification");
  assert.match(legacyScript, /window\.registerMarkdownViewerFileOpen\(app,/);
  assert.match(legacyScript, /largeJsonOpen,/);
  assert.doesNotMatch(legacyScript, /async function openDocumentSourceFile/);
});

test("large JSON safe-open behavior is shared by file and sidebar opens", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const largeJsonScript = readWebFile("js/files/large-json.js");
  const openScript = readWebFile("js/files/open.js");

  assert.match(html, /src="js\/files\/large-json\.js"/);
  assert.ok(
    html.indexOf('src="js/files/large-json.js"') < html.indexOf('src="js/files/open.js"'),
    "large JSON helper should load before file open behavior"
  );
  assert.match(largeJsonScript, /window\.registerMarkdownViewerLargeJsonOpen\s*=/);
  assert.match(largeJsonScript, /LARGE_JSON_SAFE_OPEN_BYTES/);
  assert.match(largeJsonScript, /prepareLargeJsonForOpen/);
  assert.match(legacyScript, /window\.registerMarkdownViewerLargeJsonOpen\(app,/);
  assert.match(openScript, /openDocumentSourceFile\(sourceFile, options = \{\}\)/);
  assert.match(openScript, /largeJsonOpen\?\.prepareLargeJsonForOpen/);
  assert.doesNotMatch(readWebFile("js/tabs/index.js"), /largeJsonOpen/);
});

test("user-facing file opens route through the canonical opener", () => {
  const sidebarScript = readWebFile("js/sidebar/context-tree.js");
  const graphScript = readWebFile("js/graph/renderer.js");
  const healthScript = readWebFile("js/graph/health.js");
  const recentScript = readWebFile("js/recent/actions.js");
  const markdownLinksScript = readWebFile("js/markdown/links.js");
  const legacyScript = readWebFile("script.js");

  for (const [name, source] of [
    ["sidebar", sidebarScript],
    ["graph renderer", graphScript],
    ["graph health", healthScript],
    ["recent actions", recentScript],
    ["markdown links", markdownLinksScript]
  ]) {
    assert.match(source, /openDocumentSourceFile/, `${name} should call the canonical opener`);
    assert.doesNotMatch(source, /openSidebarFileInPermanentTab\(/, `${name} should not call permanent tab helper directly`);
    assert.doesNotMatch(source, /openSidebarFileInTemporaryTab\(/, `${name} should not call temporary tab helper directly`);
  }

  assert.match(sidebarScript, /temporary:\s*!\(options && options\.temporary === false\)/);
  assert.match(graphScript, /openGraphNodeFileFromCurrentRender\(targetNode\)/);
  assert.match(graphScript, /openGraphNodeOriginalFileInNewTab/);
  assert.doesNotMatch(recentScript, /findTabForSourceFile|findGraphTabForSourceFile|pinTemporaryTab/);
});

test("external anchor navigation opens outside the app webview", () => {
  const legacyScript = readWebFile("script.js");

  assert.match(legacyScript, /function handleExternalNavigationClick\(event\)/);
  assert.match(legacyScript, /document\.addEventListener\("click", handleExternalNavigationClick, true\)/);
  assert.match(legacyScript, /url\.origin !== window\.location\.origin/);
  assert.match(legacyScript, /openExternalWebLink\(anchor\.href \|\| anchor\.getAttribute\("href"\)\)/);
});

test("markdown rendering is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const renderScript = readWebFile("js/markdown/render.js");

  assert.match(html, /src="js\/markdown\/render\.js"/);
  assert.match(renderScript, /window\.registerMarkdownViewerRender\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerRender\(app,/);
  assert.match(renderScript, /shouldRenderMarkdownPreview/);
  assert.match(renderScript, /LARGE_MARKDOWN_PREVIEW_BYTES/);
  assert.match(renderScript, /function getMarkdownPreviewPolicy/);
  assert.match(renderScript, /markdownPreviewCache/);
  assert.match(renderScript, /schedulePreviewEnhancements/);
  assert.match(renderScript, /\[preview-render-perf\]/);
  assert.match(legacyScript, /shouldRenderMarkdownPreview:\s*function/);
  assert.match(legacyScript, /registerMarkdownViewerRender\(app,[\s\S]*appDebugLog/);
  assert.match(legacyScript, /registerMarkdownViewerRender\(app,[\s\S]*getActiveTab:\s*function/);
  assert.doesNotMatch(legacyScript, /function processEmojis/);
});

test("untitled tab counter persistence is registered from its extracted classic script", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const counterScript = readWebFile("js/tabs/counter.js");

  assert.match(html, /src="js\/tabs\/counter\.js"/);
  assert.match(counterScript, /window\.registerMarkdownViewerTabCounter\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerTabCounter\(app,/);
  assert.doesNotMatch(legacyScript, /function loadUntitledCounter/);
});

test("persistent tab view manager is registered before tabs", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const tabViewManagerScript = readWebFile("js/tabs/view-manager.js");

  assert.match(html, /id="tab-view-host"/);
  assert.match(html, /src="js\/tabs\/view-manager\.js"/);
  assert.ok(
    html.indexOf('src="js/tabs/view-manager.js"') < html.indexOf('src="js/tabs/index.js"'),
    "tab view manager should load before tabs"
  );
  assert.match(tabViewManagerScript, /global\.registerMarkdownViewerTabViewManager\s*=/);
  assert.match(legacyScript, /window\.registerMarkdownViewerTabViewManager\(app,/);
  assert.match(legacyScript, /tabViewManager,/);
});

test("typed tab persistence is registered before tabs", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const persistenceScript = readWebFile("js/tabs/persistence.js");

  assert.match(html, /src="js\/tabs\/persistence\.js"/);
  assert.ok(
    html.indexOf('src="js/tabs/persistence.js"') < html.indexOf('src="js/tabs/index.js"'),
    "typed tab persistence should load before tabs"
  );
  assert.match(persistenceScript, /global\.registerMarkdownViewerTabPersistence\s*=/);
  assert.match(persistenceScript, /createProfilePayload/);
  assert.match(persistenceScript, /restoreTabsFromPayload/);
  assert.match(legacyScript, /window\.registerMarkdownViewerTabPersistence\(app,/);
  assert.match(legacyScript, /tabSessionPersistence/);
});

test("persistent editor view manager is registered before tab view manager", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const editorViewScript = readWebFile("js/editor/view-manager.js");
  const codeMirrorEditorScript = readWebFile("js/editor/codemirror-editor.js");
  const tabViewManagerScript = readWebFile("js/tabs/view-manager.js");

  assert.match(html, /src="js\/editor\/view-manager\.js"/);
  assert.ok(
    html.indexOf('src="js/editor/view-manager.js"') < html.indexOf('src="js/tabs/view-manager.js"'),
    "editor view manager should load before tab view manager"
  );
  assert.match(editorViewScript, /global\.registerMarkdownViewerEditorViewManager\s*=/);
  assert.match(editorViewScript, /mountEditorTab/);
  assert.match(editorViewScript, /activateEditorTab/);
  assert.match(editorViewScript, /captureEditorTabState/);
  assert.match(editorViewScript, /getActiveMarkdownEditor/);
  assert.match(editorViewScript, /getActiveMarkdownPreview/);
  assert.match(editorViewScript, /getActiveEditorPane/);
  assert.match(editorViewScript, /getActivePreviewPane/);
  assert.match(editorViewScript, /getActiveResizeDivider/);
  assert.match(editorViewScript, /getActiveEditorParts/);
  assert.match(editorViewScript, /primaryPreviewNativeAddEventListener/);
  assert.match(editorViewScript, /target === primaryPreview/);
  assert.match(editorViewScript, /primaryTextareaNativeAddEventListener/);
  assert.match(editorViewScript, /target === primaryTextarea/);
  assert.match(editorViewScript, /CodeMirror editor factory is unavailable/);
  assert.match(editorViewScript, /CodeMirror did not create an enabled editor instance/);
  assert.match(codeMirrorEditorScript, /CodeMirror 6 bundle is unavailable/);
  assert.doesNotMatch(codeMirrorEditorScript, /function createFallbackApi/);
  assert.doesNotMatch(codeMirrorEditorScript, /isEnabled:\s*function\(\)\s*\{\s*return false;/);
  assert.match(legacyScript, /window\.registerMarkdownViewerEditorViewManager\(app,/);
  assert.match(legacyScript, /editorViewManager,/);
  assert.match(tabViewManagerScript, /editorViewManager\.activateEditorTab/);
  assert.match(tabViewManagerScript, /Editable text tabs require the CodeMirror editor view manager/);
  assert.doesNotMatch(tabViewManagerScript, /tab\?\.type !== "graph" && editorViewManager\?\.activateEditorTab/);
});

test("editor services resolve active tab-owned DOM at call time", () => {
  const lineStatusScript = readWebFile("js/editor/line-status.js");
  const syntaxScript = readWebFile("js/editor/syntax-highlight.js");
  const renderScript = readWebFile("js/markdown/render.js");
  const mermaidScript = readWebFile("js/markdown/mermaid-tools.js");
  const scrollSyncScript = readWebFile("js/scroll-sync.js");
  const statusLineScript = readWebFile("js/editor/status-line.js");
  const viewLayoutScript = readWebFile("js/ui/view-layout.js");
  const tabsScript = readWebFile("js/tabs/index.js");
  const legacyScript = readWebFile("script.js");

  assert.match(lineStatusScript, /getActiveMarkdownEditor/);
  assert.match(lineStatusScript, /getActiveOverlay/);
  assert.match(lineStatusScript, /function isCodeMirrorBackedEditor/);
  assert.match(lineStatusScript, /clearLegacyEditorOverlays/);
  assert.match(syntaxScript, /getActiveMarkdownEditor/);
  assert.match(syntaxScript, /getActiveSyntaxHighlight/);
  assert.match(renderScript, /getActiveMarkdownPreview/);
  assert.match(mermaidScript, /getActiveMarkdownPreview/);
  assert.match(scrollSyncScript, /refreshActiveScrollTargets/);
  assert.match(scrollSyncScript, /app\.services\.scrollSync = api/);
  assert.match(viewLayoutScript, /function getActiveLayoutTargets\(\)/);
  assert.match(viewLayoutScript, /function refreshActiveResizeTarget\(\)/);
  assert.match(viewLayoutScript, /getActiveEditorPane/);
  assert.match(viewLayoutScript, /getActivePreviewPane/);
  assert.match(viewLayoutScript, /getActiveResizeDivider/);
  assert.match(tabsScript, /refreshActiveResizeTarget/);
  assert.match(tabsScript, /refreshEditorLineNumberResizeObserver/);
  assert.match(tabsScript, /refreshActiveScrollTargets/);
  assert.match(tabsScript, /activationViewMode/);
  assert.match(tabsScript, /restoreViewMode\(activationViewMode,\s*\{\s*skipRender:\s*shouldDeferLargeSplit \|\| !shouldInitializeRender\s*\}\)/);
  assert.match(tabsScript, /\[tab-activation-perf\]/);
  assert.match(tabsScript, /createActivationPerfSession/);
  assert.match(tabsScript, /LARGE_EDITABLE_AUTO_FOCUS_BYTES/);
  assert.match(tabsScript, /function shouldSkipEditableAutoFocus/);
  assert.match(tabsScript, /focus skipped/);
  assert.match(tabsScript, /lastTabBarSignature/);
  assert.match(tabsScript, /function updateTabBarActiveState/);
  assert.match(tabsScript, /function scheduleDeferredLargeSplitActivation/);
  assert.match(tabsScript, /deferred large split layout/);
  assert.match(tabsScript, /reason:\s*"deferred-large-split"/);
  assert.match(tabsScript, /deferHeavyEnhancements:\s*true/);
  assert.match(tabsScript, /reason:\s*"tab-activation"/);
  assert.match(tabsScript, /deferHeavyEnhancements:\s*isLargeEditableTab\(tab\)/);
  assert.match(tabsScript, /setActiveMarkdownTabViewMode/);
  assert.match(legacyScript, /registerMarkdownViewerTabs\(app,\s*\{[\s\S]*appDebugLog/);
  assert.match(viewLayoutScript, /onViewModeChanged\(mode/);
  assert.match(legacyScript, /onViewModeChanged:\s*function\(mode\)\s*\{\s*setActiveMarkdownTabViewMode\(mode\);/);
  assert.match(tabsScript, /previousViewMode/);
  assert.match(tabsScript, /nextViewMode/);
  assert.match(tabsScript, /function getActiveDocumentViewModeForSave/);
  assert.match(tabsScript, /deps\.contentContainer \|\| document\.querySelector\("\.content-container"\)/);
  assert.match(tabsScript, /activeContentContainer\.classList\.contains\("view-editor-only"\)/);
  assert.doesNotMatch(tabsScript, /const nextViewMode = isPreviewableDocumentTab\(tab\) \? \(currentViewMode \|\| ['"]split['"]\) : ['"]editor['"]/);
  assert.match(viewLayoutScript, /options\.skipRender !== true/);
  assert.match(legacyScript, /getActiveMarkdownEditor:\s*function/);
  assert.match(legacyScript, /getActiveMarkdownPreview:\s*function/);
  assert.match(legacyScript, /getActiveEditorPane:\s*function/);
  assert.match(legacyScript, /getActivePreviewPane:\s*function/);
  assert.match(legacyScript, /getActiveResizeDivider:\s*function/);
  assert.match(legacyScript, /refreshEditorLineNumberResizeObserver/);
  assert.match(statusLineScript, /getLargeFileDocumentStats/);
  assert.match(statusLineScript, /activeTab\?\.type === "large-file"/);
  assert.match(tabsScript, /updateDocumentStats/);
});

test("CodeMirror-backed editors use native line number gutters instead of legacy overlays", () => {
  const bundleSource = readWebFile("js/editor/codemirror-bundle-source.js");
  const lineStatusScript = readWebFile("js/editor/line-status.js");
  const styles = readWebFile("styles.css");

  assert.match(bundleSource, /import \{[^}]*lineNumbers[^}]*\} from "@codemirror\/view"/);
  assert.match(bundleSource, /lineNumbers\(\)/);
  assert.match(bundleSource, /drawSelection\(\{ drawRangeCursor: false \}\)/);
  assert.match(bundleSource, /highlightActiveLineGutter\(\)/);
  assert.match(styles, /\.editor-shell:has\(\.codemirror-editor\) > \.editor-line-numbers/);
  assert.match(lineStatusScript, /isCodeMirrorBackedEditor\(markdownEditor\)[\s\S]*clearLegacyEditorOverlays\(\);[\s\S]*return;/);
  assert.match(lineStatusScript, /isCodeMirrorBackedEditor\(markdownEditor\)[\s\S]*return;[\s\S]*const text = markdownEditor\.value;/);
});

test("graph original export wires Java import cleanup", () => {
  const html = readWebFile("index.html");
  const cleanupScript = readWebFile("js/java/import-cleanup.js");
  const rendererScript = readWebFile("js/graph/renderer.js");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /src="js\/java\/import-cleanup\.js"/);
  assert.ok(
    html.indexOf('src="js/java/import-cleanup.js"') < html.indexOf('src="js/graph/renderer.js"'),
    "Java import cleanup should load before the graph renderer"
  );
  assert.match(cleanupScript, /window\.registerMarkdownViewerJavaImportCleanup\s*=/);
  assert.match(cleanupScript, /cleanupJavaUnusedImports/);
  assert.match(legacyScript, /window\.registerMarkdownViewerJavaImportCleanup\(app\)/);
  assert.match(legacyScript, /javaImportCleanup,/);
  assert.match(rendererScript, /cleanupExportedJavaSourceContent/);
  assert.match(rendererScript, /removedJavaImportCount/);
  assert.match(rendererScript, /writeJavaOriginalExportCompileBatch/);
  assert.match(rendererScript, /compile\.bat/);
});
test("graph renderer exposes large graph render reuse helpers", () => {
  const rendererScript = readWebFile("js/graph/renderer.js");
  const tabsScript = readWebFile("js/tabs/index.js");

  assert.match(rendererScript, /function canReuseGraphRender\(tab\)/);
  assert.match(rendererScript, /function activateCachedGraphRender\(tab/);
  assert.match(rendererScript, /app\.services\.graphRenderer = api/);
  assert.match(tabsScript, /activateReusableGraphRender/);
  assert.match(tabsScript, /function updateActiveGraphStatusLine\(tab\)/);
  assert.match(tabsScript, /updateActiveGraphStatusLine\(tab\)/);
  assert.match(tabsScript, /updateActiveGraphStatusLine\(activeTab\)/);
});

test("graph tab mode mounts graph canvas into the active graph tab root", () => {
  const toolbarScript = readWebFile("js/graph/toolbar.js");
  const legacyScript = readWebFile("script.js");
  const styles = readWebFile("styles.css");

  assert.match(toolbarScript, /getActiveGraphViewRoot/);
  assert.doesNotMatch(toolbarScript, /const previewPane = document\.querySelector\("\.preview-pane"\)/);
  assert.match(legacyScript, /getActiveGraphViewRoot:\s*function/);
  assert.match(legacyScript, /tabViewKind === "graph"/);
  assert.match(styles, /\.tab-view\[data-tab-view-kind="graph"\]/);
  assert.match(styles, /\.tab-graph-canvas/);
});

test("AI model registry has its own settings tab", () => {
  const html = readWebFile("index.html");

  assert.match(html, /data-settings-tab="ai-models"/);
  assert.match(html, /data-settings-panel="ai-models"/);
  assert.match(html, /id="settings-ai-models-title"/);
  assert.match(html, /id="settings-ai-models-table"/);
  assert.match(html, /id="settings-ai-model-editor-modal"/);
  assert.match(html, /id="settings-ai-model-editor-id"/);
  assert.match(html, /id="settings-ai-model-editor-save"/);
  assert.match(html, /<span role="columnheader">Model<\/span>\s*<span role="columnheader">Actions<\/span>/);
});
test("AI prompt settings has its own settings tab", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /data-settings-tab="ai-prompts"/);
  assert.match(html, /data-settings-panel="ai-prompts"/);
  assert.match(html, /id="settings-ai-prompts-title"/);
  assert.match(html, /id="settings-ai-prompts-table"/);
  assert.match(html, /id="settings-ai-prompts-rows"/);
  assert.match(html, /id="settings-ai-prompt-editor-modal"/);
  assert.match(html, /id="settings-ai-prompt-editor-text"/);
  assert.match(html, /id="settings-ai-prompt-editor-save"/);
  assert.match(html, /js\/ai-companion\/prompts-settings\.js/);
  assert.match(legacyScript, /registerMarkdownViewerAiCompanionPromptsSettings/);
});

test("AI settings tabs are grouped under an expandable AI parent", () => {
  const html = readWebFile("index.html");
  const settingsScreenScript = readWebFile("js/ui/settings-screen.js");
  const styles = readWebFile("styles.css");

  assert.match(html, /data-settings-tab-group-toggle="ai"/);
  assert.match(html, /id="settings-ai-tab-group"/);
  assert.match(html, /data-settings-parent-tab-group="ai"[\s\S]*data-settings-tab="ai-companion"|data-settings-tab="ai-companion"[\s\S]*data-settings-parent-tab-group="ai"/);
  assert.match(html, /data-settings-parent-tab-group="ai"[\s\S]*data-settings-tab="ai-approvals"|data-settings-tab="ai-approvals"[\s\S]*data-settings-parent-tab-group="ai"/);
  assert.match(html, /data-settings-parent-tab-group="ai"[\s\S]*data-settings-tab="ai-models"|data-settings-tab="ai-models"[\s\S]*data-settings-parent-tab-group="ai"/);
  assert.match(html, /data-settings-parent-tab-group="ai"[\s\S]*data-settings-tab="ai-prompts"|data-settings-tab="ai-prompts"[\s\S]*data-settings-parent-tab-group="ai"/);
  assert.match(html, /data-settings-parent-tab-group="ai"[\s\S]*data-settings-tab="ai-companion-autocomplete"|data-settings-tab="ai-companion-autocomplete"[\s\S]*data-settings-parent-tab-group="ai"/);
  assert.match(settingsScreenScript, /function setTabGroupExpanded\(groupName, isExpanded\)/);
  assert.match(settingsScreenScript, /function expandTabGroupForTab\(tabName\)/);
  assert.match(styles, /\.settings-tab-group-toggle/);
  assert.match(styles, /\.settings-tab-subtree\[hidden\]/);
});

test("AI Companion settings hide provider-specific connection fields", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /Connection provider/);
  assert.doesNotMatch(html, /Connection mode/);
  assert.match(html, /value="openai"/);
  assert.match(html, /value="google-gemini"/);
  assert.match(html, /value="anthropic"/);
  assert.match(html, /value="xai"/);
  assert.match(html, /value="ollama"/);
  assert.match(html, /value="gemini-connector"/);
  assert.match(html, /value="gemini-connector-raw"/);
  assert.match(html, /id="settings-ai-model-options"/);
  assert.match(html, /js\/ai-companion\/provider-presets\.js/);
  assert.match(html, /settings-ai-litellm-field/);
  assert.match(html, /settings-ai-gemini-field/);
  assert.match(html, /settings-ai-http-provider-field/);
  assert.match(legacyScript, /function updateAiConnectionProviderFields\(\)/);
  assert.match(legacyScript, /providerMode === "gemini-connector" \|\| providerMode === "gemini-connector-raw"/);
  assert.match(legacyScript, /field\.hidden = !showLiteLlmFields/);
  assert.match(legacyScript, /field\.hidden = !showGeminiFields/);
  assert.match(legacyScript, /field\.hidden = showGeminiFields/);
  assert.match(legacyScript, /function applyAiConnectionProviderPreset\(\)/);
  assert.match(legacyScript, /settingsAiProviderModeInput\.addEventListener\("change", applyAiConnectionProviderPreset\)/);
});

test("AI approval allowlists have their own stacked settings tab", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.match(html, /data-settings-tab="ai-approvals"/);
  assert.match(html, /data-settings-panel="ai-approvals"/);
  assert.match(html, /id="settings-ai-approvals-title"/);
  assert.match(html, /id="settings-ai-approval-app-policy"/);
  assert.match(html, /id="settings-ai-approval-folder-policy"/);
  assert.match(html, /id="settings-ai-approval-policy-status"/);
  assert.match(html, /settings-ai-approvals-title[\s\S]*settings-ai-approval-app-policy[\s\S]*settings-ai-approval-folder-policy/);
  assert.doesNotMatch(html, /data-settings-panel="ai-companion"[\s\S]*settings-ai-approval-app-policy[\s\S]*<section class="settings-panel" data-settings-panel="ai-approvals"/);
  assert.match(legacyScript, /getAiApprovalAppPolicyPath/);
  assert.match(legacyScript, /getAiApprovalFolderPolicyPath/);
  assert.match(legacyScript, /saveAiApprovalPoliciesFromSettings/);
  assert.match(legacyScript, /await saveAiApprovalPoliciesFromSettings\(\)/);
});

test("flat folder view module loads without a global toolbar mode", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");

  assert.doesNotMatch(html, /class="folder-tree-tool-button toggle-folder-view-mode"/);
  assert.ok(
    html.indexOf('src="js/sidebar/flat-folder-view.js"') < html.indexOf('src="js/sidebar/folder-toolbar.js"'),
    "flat folder view should load before the folder toolbar"
  );
  assert.doesNotMatch(legacyScript, /folderViewMode: "tree"/);
  assert.doesNotMatch(legacyScript, /folderViewMode = loadGlobalState().folderViewMode/);
});

test("offline license header resources and services are bundled before editor views", () => {
  const html = readWebFile("index.html");
  const legacyScript = readWebFile("script.js");
  const catalogScript = readWebFile("js/editor/license-reference-catalog.js");
  const headerScript = readWebFile("js/editor/license-summary-header.js");
  const manifest = JSON.parse(readWebFile("assets/license-header/manifest.json"));

  assert.match(html, /css\/editor\/license-summary-header\.css/);
  assert.ok(
    html.indexOf('src="js/editor/license-reference-catalog.js"') < html.indexOf('src="js/editor/license-summary-header.js"')
      && html.indexOf('src="js/editor/license-summary-header.js"') < html.indexOf('src="js/editor/view-manager.js"'),
    "license services should load before persistent editor views"
  );
  assert.match(legacyScript, /registerMarkdownViewerLicenseReferenceCatalog/);
  assert.match(legacyScript, /registerMarkdownViewerLicenseSummaryHeader/);
  assert.match(catalogScript, /global\.registerMarkdownViewerLicenseReferenceCatalog/);
  assert.match(headerScript, /global\.registerMarkdownViewerLicenseSummaryHeader/);
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.source.revision, "d6277c04899ce98b13d713186b48d110ac998d0b");
  assert.deepEqual(manifest.placeholderTokens, ["[year]", "[yyyy]", "[fullname]", "[name of copyright owner]"]);
  assert.equal(manifest.licenses.length, 13);
  manifest.licenses.forEach((license) => {
    const relativeTextPath = license.textPath.replace(/^\//, "");
    const canonicalText = readWebFile(relativeTextPath);
    assert.equal(canonicalText.length > 0, true, `${license.id} canonical text should be bundled`);
    assert.doesNotMatch(canonicalText, /^---\r?\n/, `${license.id} should not include upstream front matter`);
  });
});

test("Kubernetes project commands are bundled and exposed from the Project menu", () => {
  const html = readWebFile("index.html");
  const applicationMenuScript = readWebFile("js/ui/application-menu.js");
  const projectCommandMenuScript = readWebFile("js/project/project-command-menu.js");
  const kubernetesScriptIndex = html.indexOf('src="js/project/kubernetes-project-commands.js"');
  const projectMenuScriptIndex = html.indexOf('src="js/project/project-command-menu.js"');

  assert.ok(kubernetesScriptIndex >= 0, "Kubernetes project commands should be loaded");
  assert.ok(projectMenuScriptIndex >= 0, "Project command menu should be loaded");
  assert.ok(kubernetesScriptIndex < projectMenuScriptIndex, "Kubernetes commands should load before the project command menu");

  ["kubernetes-dry-run", "kubernetes-server-dry-run", "kubernetes-apply", "kubernetes-delete", "kubernetes-explain"].forEach((commandName) => {
    assert.match(applicationMenuScript, new RegExp(`data-project-command="${commandName}"`));
  });
  assert.doesNotMatch(applicationMenuScript, /Server Dry Run \(Skip Schema Validation\)/);
  assert.match(projectCommandMenuScript, /kubernetesCommandOptionsDialog[\s\S]*open/);
  assert.match(projectCommandMenuScript, /projectCommandResultModal[\s\S]*open/);
  assert.match(projectCommandMenuScript, /attachCommandResult/);
});

test("Helm project commands are bundled and exposed from the Project menu", () => {
  const html = readWebFile("index.html");
  const applicationMenuScript = readWebFile("js/ui/application-menu.js");
  const projectCommandMenuScript = readWebFile("js/project/project-command-menu.js");
  const codeMirrorSource = readWebFile("js/editor/codemirror-bundle-source.js");
  const chartContextIndex = html.indexOf('src="js/project/helm-chart-context.js"');
  const helmCommandsIndex = html.indexOf('src="js/project/helm-project-commands.js"');
  const projectMenuScriptIndex = html.indexOf('src="js/project/project-command-menu.js"');

  assert.ok(chartContextIndex >= 0, "Helm chart context should be loaded");
  assert.ok(helmCommandsIndex >= 0, "Helm project commands should be loaded");
  assert.ok(chartContextIndex < helmCommandsIndex, "Helm context should load before Helm commands");
  assert.ok(helmCommandsIndex < projectMenuScriptIndex, "Helm commands should load before the project command menu");

  ["helm-lint-chart", "helm-template-chart", "helm-template-active-file", "helm-preview-template", "helm-preview-chart", "helm-dependency-update", "helm-render-kubernetes-dry-run"].forEach((commandName) => {
    assert.match(applicationMenuScript, new RegExp(`data-project-command="${commandName}"`));
  });
  assert.match(projectCommandMenuScript, /helmCommands[\s\S]*execute\(commandName, context\)/);
  assert.match(codeMirrorSource, /createHelmCompletionSource/);
  assert.match(codeMirrorSource, /markdownViewerHelmCompletionProvider/);
});
