const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sourcePath = path.resolve(__dirname, "../resources/js/editor/codemirror-bundle-source.js");
const wrapperPath = path.resolve(__dirname, "../resources/js/editor/codemirror-editor.js");
const viewManagerPath = path.resolve(__dirname, "../resources/js/editor/view-manager.js");
const javaFormatterSourcePath = path.resolve(__dirname, "../resources/js/editor/java-formatter-bundle-source.js");
const scriptPath = path.resolve(__dirname, "../resources/js/script.js");
const stylesPath = path.resolve(__dirname, "../resources/styles.css");
const tabsPath = path.resolve(__dirname, "../resources/js/tabs/index.js");

test("CodeMirror bundle source exposes configurable word wrap", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /const wordWrapCompartment = new Compartment\(\)/);
  assert.match(source, /wordWrapCompartment\.of\(wordWrapEnabled \? EditorView\.lineWrapping : \[\]\)/);
  assert.match(source, /setWordWrap\(enabled\)/);
  assert.match(source, /isWordWrapEnabled\(\)/);
});

test("CodeMirror bundle source renders optional word wrap symbols", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /const wrapSymbolCompartment = new Compartment\(\)/);
  assert.match(source, /const wrapSymbolExtension = ViewPlugin\.fromClass/);
  assert.match(source, /measureWrapSymbolMarkers\(view\)/);
  assert.match(source, /renderWrapSymbolMarkers\(markerLayer, markers\)/);
  assert.match(source, /wrapSymbolCompartment\.of\(showSymbolOptions\.wrapSymbol === false \? \[\] : wrapSymbolExtension\)/);
  assert.match(source, /wrapSymbolCompartment\.reconfigure\(showSymbolOptions\.wrapSymbol === false \? \[\] : wrapSymbolExtension\)/);
  assert.match(source, /cm-visible-wrap/);
});

test("CodeMirror editor wrapper passes and exposes word wrap state", () => {
  const source = fs.readFileSync(wrapperPath, "utf8");

  assert.match(source, /wordWrap: wordWrapEnabled/);
  assert.match(source, /function setWordWrap\(enabled\)/);
  assert.match(source, /function isWordWrapEnabled\(\)/);
});

test("CodeMirror defers large-document compatibility synchronization", () => {
  const wrapperSource = fs.readFileSync(wrapperPath, "utf8");
  const viewManagerSource = fs.readFileSync(viewManagerPath, "utf8");

  assert.match(wrapperSource, /LARGE_DOCUMENT_LINE_THRESHOLD = 10000/);
  assert.match(wrapperSource, /LARGE_DOCUMENT_CHARACTER_THRESHOLD = 250000/);
  assert.match(wrapperSource, /LARGE_DOCUMENT_SYNC_DELAY_MS = 150/);
  assert.match(wrapperSource, /if \(isLargeCodeMirrorDocument\(update\.state\.doc\)\) \{\s+applyCodeMirrorChangesToBackingValue\(update\.changes\);/);
  assert.match(wrapperSource, /get: function\(\) \{\s+flushCompatibilitySync\(\);\s+return backingValue;/);
  assert.match(wrapperSource, /destroy: function\(\) \{\s+flushCompatibilitySync\(\);/);
  assert.match(viewManagerSource, /activeView\.codeMirrorEditor\?\.flushPendingSync\?\.\(\);/);
});

test("large CodeMirror edits update cached content without rewriting the native textarea", () => {
  const wrapperSource = fs.readFileSync(wrapperPath, "utf8");
  const scriptSource = fs.readFileSync(scriptPath, "utf8");

  assert.match(wrapperSource, /applyCodeMirrorChangesToBackingValue\(update\.changes\)/);
  assert.match(wrapperSource, /largeDocumentCompatibilitySyncPending = true/);
  assert.match(wrapperSource, /detail: \{ largeCodeMirrorDocument: true \}/);
  assert.match(scriptSource, /const isLargeCodeMirrorDocument = event\?\.detail\?\.largeCodeMirrorDocument === true/);
  assert.match(scriptSource, /if \(isLargeCodeMirrorDocument\) \{[\s\S]*activeTab\.content = activeContent;[\s\S]*clearTimeout\(saveTabStateTimeout\);[\s\S]*return;/);
});

test("CodeMirror defers large-document unmatched-bracket analysis", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /LARGE_DOCUMENT_ANALYSIS_DELAY_MS = 150/);
  assert.match(source, /this\.decorations = this\.decorations\.map\(update\.changes\)/);
  assert.match(source, /refreshUnclosedBracketDecorationsEffect\.of\(null\)/);
  assert.match(source, /destroy\(\) \{\s+clearTimeout\(this\.refreshTimer\);/);
});

test("large-document word completion scans a bounded line window", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /LARGE_DOCUMENT_WORD_COMPLETION_LINE_RADIUS = 500/);
  assert.match(source, /if \(!isLargeCodeMirrorDocument\(doc\)\) return doc\.toString\(\)/);
  assert.match(source, /return context\.state\.sliceDoc\(doc\.line\(firstLine\)\.from, doc\.line\(lastLine\)\.to\)/);
  assert.match(source, /const source = getDocumentWordCompletionText\(context\)/);
});

test("non-Markdown editor input skips Markdown-only processing", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /const isActiveMarkdownDocument = !activeTab\?\.sourceFilePath \|\| isMarkdownPath\(activeTab\.sourceFilePath\)/);
  assert.match(source, /if \(isActiveMarkdownDocument\) renderLinkAutocomplete\(\)/);
  assert.match(source, /if \(isActiveMarkdownDocument\) syncMarkdownTabTagsToFolderState\(activeTab, activeContent\)/);
  assert.match(source, /if \(isActiveMarkdownDocument\) debouncedRender\(\)/);
});

test("CodeMirror formatter accepts registry formatter ids", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /"prettier-markdown": markdownFormatterConfig/);
  assert.match(source, /"prettier-json": jsonFormatterConfig/);
  assert.match(source, /"prettier-xml": xmlFormatterConfig/);
  assert.match(source, /"prettier-babel": javascriptFormatterConfig/);
  assert.match(source, /"prettier-typescript": typescriptFormatterConfig/);
  assert.match(source, /"prettier-java": javaFormatterConfig/);
  assert.match(source, /script\.src = "js\/vendor\/prettier-java\.bundle\.js"/);
  assert.match(fs.readFileSync(javaFormatterSourcePath, "utf8"), /import prettierJava from "prettier-plugin-java"/);
  assert.match(source, /formatCodeWithCursor/);
  assert.match(fs.readFileSync(javaFormatterSourcePath, "utf8"), /formatJavaCodeWithCursor/);
});

test("CodeMirror editor wrapper resolves the active formatter id", () => {
  const source = fs.readFileSync(wrapperPath, "utf8");

  assert.match(source, /function getActiveFormatterId\(\)/);
  assert.match(source, /CodeMirror\.canFormatCode\(language\.id\)/);
  assert.match(source, /return language\.formatter \|\| language\.id \|\| ""/);
  assert.match(source, /CodeMirror\.formatCode\(backingValue, formatterId\)/);
  assert.match(source, /CodeMirror\.canFormatCode\(formatterId\)/);
  assert.match(source, /function formatSelectedLines\(\)/);
  assert.match(source, /CodeMirror\.formatCodeWithCursor/);
  assert.match(source, /canFormatSelectedLines/);
});
test("CodeMirror bundle source exposes configurable language completions", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /const autocompleteCompartment = new Compartment\(\)/);
  assert.match(source, /function getLanguageCompletionSources\(languageId\)/);
  assert.match(source, /htmlCompletionSource/);
  assert.match(source, /cssCompletionSource/);
  assert.match(source, /keywordCompletionSource\(StandardSQL\)/);
  assert.match(source, /JAVASCRIPT_GLOBAL_COMPLETION_SCOPE/);
  assert.match(source, /scopeCompletionSource\(JAVASCRIPT_GLOBAL_COMPLETION_SCOPE\)/);
  assert.match(source, /NODE_COMPLETION_SOURCE/);
  assert.match(source, /JAVA_COMPLETION_SOURCE/);
  assert.match(source, /PYTHON_COMPLETION_SOURCE/);
  assert.match(source, /CSHARP_COMPLETION_SOURCE/);
  assert.match(source, /localCompletionSource, NODE_COMPLETION_SOURCE/);
  assert.match(source, /case "java":\s+return \[JAVA_COMPLETION_SOURCE\]/);
  assert.match(source, /case "python":\s+return \[PYTHON_COMPLETION_SOURCE\]/);
  assert.match(source, /case "csharp":\s+return \[CSHARP_COMPLETION_SOURCE\]/);
  assert.match(source, /System\.out\.println\(\)/);
  assert.match(source, /apply: "System\.out\.println\(\);"/);
  assert.match(source, /java\.util\.Scanner/);
  assert.match(source, /label: "String"/);
  assert.match(source, /console\.log\(\)/);
  assert.match(source, /const fs = require\(\\"fs\\"\)/);
  assert.match(source, /print\(\)/);
  assert.match(source, /from pathlib import Path/);
  assert.match(source, /Console\.WriteLine\(\)/);
  assert.match(source, /using System\.Collections\.Generic/);
  assert.doesNotMatch(source, /return \[localCompletionSource, scopeCompletionSource\]/);
  assert.match(source, /snippetCompletion/);
  assert.match(source, /getSnippetCompletionSource\(languageId, snippetDefinitions/);
  assert.match(source, /\["javascript", "typescript", "java", "python", "csharp"\]\.includes\(languageId\)/);
  assert.match(source, /setSnippetDefinitions\(definitions\)/);
  assert.doesNotMatch(source, /typescriptSnippets/);
  assert.match(source, /autocompleteCompartment\.of\(createCurrentAutocompleteExtension/);
  assert.match(source, /setAutocompletePreferences\(preferences\)/);
  assert.match(source, /setLanguageAutocomplete\(enabled\)/);
  assert.match(source, /setLanguageServerAutocomplete\(enabled\)/);
  assert.match(source, /setSnippetAutocomplete\(enabled\)/);
});

test("CodeMirror bundle source exposes LSP parameter completions without signature popup", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /function requestLspParameterCompletionOption\(plugin, context\)/);
  assert.match(source, /textDocument\/signatureHelp/);
  assert.match(source, /boost: 100/);
  assert.match(source, /options\.unshift\(parameterOption\)/);
  assert.doesNotMatch(source, /signatureHelp\(\)/);
});

test("CodeMirror bundle source returns sectioned LSP workspace configuration", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /function getConfigurationSection\(section\)/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(configuration, sectionName\)/);
  assert.match(source, /items\.map\(\(item\) => getConfigurationSection\(item\?\.section\)\)/);
});

test("CodeMirror bundle source exposes LSP go to definition", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /const lspGoToDefinitionMouseHandler = EditorView\.domEventHandlers/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /Unable to resolve LSP definition click position/);
  assert.match(source, /Unable to resolve LSP definition hover position/);
  assert.match(source, /function getLspDefinitionTarget\(response\)/);
  assert.match(source, /location\.targetUri \|\| location\.uri/);
  assert.match(source, /location\.targetSelectionRange \|\| location\.targetRange \|\| location\.range/);
  assert.match(source, /function normalizeLspFileUri\(uri\)/);
  assert.match(source, /decodeURIComponent\(value\)/);
  assert.match(source, /function isSameLspFileUri\(left, right\)/);
  assert.match(source, /const lspDefinitionOpeners = new WeakMap\(\)/);
  assert.match(source, /function openExternalLspDefinitionTarget\(view, target\)/);
  assert.match(source, /openLspDefinitionTarget/);
  assert.match(source, /return openExternalLspDefinitionTarget\(view, target\)/);
  assert.match(source, /function goToLspDefinition\(view\)/);
  assert.match(source, /goToLspDefinition\(view\)/);
  assert.match(source, /if \(!goToLspDefinition\(view\)\) return false/);
  assert.match(source, /function showCodeMirrorLspNotification\(message\)/);
  assert.match(source, /dedupeKey: `codemirror-lsp:\$\{normalizedMessage\}`/);
  assert.match(source, /notificationHandlers: \{ "window\/showMessage": handleLspServerNotification \}/);
  assert.match(source, /if \(isJdtStillInitializing\(plugin\)\) \{[\s\S]*JDT is still initializing, please try again later[\s\S]*return true;/);
  assert.match(source, /LSPPlugin\.prototype\.reportError = function reportLspErrorInAppModal/);
});

test("CodeMirror bundle source opens LSP tooltip links outside the app view", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /function openLspTooltipLink\(target\)/);
  assert.match(source, /\.cm-tooltip a\[href\]/);
  assert.match(source, /Neutralino\.os\.open\(normalizedUrl\)/);
  assert.match(source, /window\.open\(normalizedUrl, "_blank", "noopener,noreferrer"\)/);
  assert.match(source, /lspTooltipLinkClickHandler/);
});

test("CodeMirror bundle source renders one unified diagnostics and information hover", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /import \{ forEachDiagnostic, lintGutter, linter, lintKeymap \} from "@codemirror\/lint"/);
  assert.match(source, /function collectHoverDiagnostics\(view, pos, side\)/);
  assert.match(source, /hoverDiagnosticSeverityPriority = Object\.freeze\(\{ error: 0, warning: 1, info: 2, hint: 3 \}\)/);
  assert.match(source, /function createUnifiedHoverTooltipElement\(view, diagnostics, informationProviders, options = \{\}, requestDoc = view\.state\.doc, focusActions = false\)/);
  assert.match(source, /shell\.className = "cm-unified-hover-tooltip"/);
  assert.match(source, /scroller\.className = "cm-unified-hover-tooltip-content"/);
  assert.match(source, /scroller\.append\(diagnosticsElement, divider, informationElement\)/);
  assert.match(source, /action\.apply\(view, entry\.from, entry\.to\)/);
  assert.match(source, /linter\(null, \{ tooltipFilter: \(\) => null \}\),[\s\S]*lintGutter\(\),[\s\S]*createUnifiedEditorHoverTooltipExtension\(\(\) => currentLanguageId, unifiedHoverOptions\)/);
  assert.doesNotMatch(source, /createSharedLspHoverTooltipExtension/);
  assert.doesNotMatch(source, /createBashHoverExtension/);
  assert.doesNotMatch(source, /createSqlHoverExtension/);
});

test("CodeMirror unified hover offers exact Java quick fixes and keyboard access", () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const bundle = fs.readFileSync(path.resolve(__dirname, "../resources/js/vendor/codemirror.bundle.js"), "utf8");

  for (const content of [source, bundle]) {
    assert.match(content, /function createEditorQuickFixRequest/);
    assert.match(content, /getEditorQuickFixSuggestions/);
    assert.match(content, /Open Quick Fix\.\.\./);
    assert.match(content, /keyboardUnifiedHoverField/);
    assert.match(content, /key: "F2"/);
    assert.match(content, /openEditorQuickFix/);
  }
  assert.match(source, /view\.state\.doc !== requestDoc/);
  assert.match(source, /entry\.diagnostic\.message/);
});

test("CodeMirror unified hover appends live LSP information only to the current popup", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /function requestLspHoverInformation\(view, pos, requestDoc\)/);
  assert.match(source, /view\.state\.doc !== requestDoc/);
  assert.match(source, /\.catch\(\(\) => null\)/);
  assert.match(source, /provider && popup\.dom\.isConnected && view\.state\.doc === requestDoc/);
  assert.match(source, /popup\.appendInformation\(provider\)/);
  assert.doesNotMatch(source, /Loading symbol information/);
  assert.match(source, /function createLspHoverInformationElement\(plugin, contents\)/);
  assert.match(source, /content\.className = "cm-lsp-hover-tooltip-content cm-lsp-documentation"/);
});

test("CodeMirror unified hover CSS confines overflow and separates diagnostics from information", () => {
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.cm-tooltip \.cm-unified-hover-tooltip \{[\s\S]*width: min\(720px, calc\(100vw - 32px\)\);[\s\S]*max-height: min\(360px, calc\(100vh - 140px\)\);[\s\S]*overflow: hidden;/);
  assert.match(styles, /\.cm-tooltip \.cm-unified-hover-tooltip-content \{[\s\S]*max-height: min\(360px, calc\(100vh - 140px\)\);[\s\S]*overflow: auto;/);
  assert.match(styles, /\.cm-tooltip \.cm-unified-hover-diagnostic \{[\s\S]*grid-template-columns: 10px minmax\(0, 1fr\)/);
  assert.match(styles, /\.cm-tooltip \.cm-unified-hover-divider \{[\s\S]*border-top:/);
  assert.match(styles, /\.cm-tooltip \.cm-unified-hover-diagnostic-action:hover/);
  assert.match(styles, /\[data-theme="dark"\] \{[\s\S]*--lsp-tooltip-text-color: #c9d1d9;[\s\S]*--lsp-tooltip-bg: #161b22;/);
  assert.match(styles, /\.cm-tooltip \.cm-lsp-documentation a \{[\s\S]*color: var\(--lsp-tooltip-link-color, var\(--link-color\)\) !important;/);
  assert.match(styles, /\.cm-tooltip \.cm-lsp-hover-tooltip-content pre/);
});

test("CodeMirror bundle source routes CSS, Bash, and SQL information through unified hover", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /const BASH_HOVER_DESCRIPTIONS = Object\.freeze/);
  assert.match(source, /printf: "Bash builtin: format and print arguments using a format string\."/);
  assert.match(source, /function getCssCustomPropertyHoverInformation\(view, pos, languageId\)/);
  assert.match(source, /function getSimpleLanguageHoverInformation\(view, pos, languageId\)/);
  assert.match(source, /function getLocalHoverInformation\(view, pos, languageId\)/);
  assert.match(source, /provider: "css-custom-property"/);
  assert.match(source, /cm-bashHoverTooltip/);
  assert.match(source, /cm-sqlHoverTooltip/);
});

test("CodeMirror editor wrapper passes and exposes autocomplete preferences", () => {
  const source = fs.readFileSync(wrapperPath, "utf8");

  assert.match(source, /languageAutocompleteEnabled = deps\.languageAutocompleteEnabled === true/);
  assert.match(source, /languageServerAutocompleteEnabled = deps\.languageServerAutocompleteEnabled === true/);
  assert.match(source, /snippetAutocompleteEnabled = deps\.snippetAutocompleteEnabled === true/);
  assert.match(source, /languageAutocompleteEnabled,/);
  assert.match(source, /snippetAutocompleteEnabled,/);
  assert.match(source, /snippetDefinitions: getSnippetDefinitions/);
  assert.match(source, /function setAutocompletePreferences\(preferences\)/);
  assert.match(source, /function setLanguageAutocomplete\(enabled\)/);
  assert.match(source, /function setLanguageServerAutocomplete\(enabled\)/);
  assert.match(source, /function setSnippetAutocomplete\(enabled\)/);
  assert.match(source, /function refreshSnippetDefinitions\(\)/);
});

test("CodeMirror editor wrapper exposes go to definition", () => {
  const source = fs.readFileSync(wrapperPath, "utf8");

  assert.match(source, /function getDocumentSymbols\(\)/);
  assert.match(source, /codeMirror\.setLspSession/);
  assert.match(source, /async function refreshLspSessionForActivePath\(\)/);
  assert.match(source, /codeMirror\.setLspSession\(session\)/);
  assert.match(source, /function moveSelectionToContextMenuPosition\(event\)/);
  assert.match(source, /codeMirror\.view\.posAtCoords/);
  assert.match(source, /getDocumentSymbols,/);
  assert.match(source, /refreshLspSessionForActivePath,/);
});

test("word wrap menu wiring gates graph and file preview tabs", () => {
  const scriptSource = fs.readFileSync(scriptPath, "utf8");
  const tabsSource = fs.readFileSync(tabsPath, "utf8");

  assert.match(scriptSource, /function isWordWrapEligibleTab/);
  assert.match(scriptSource, /tab\.type !== "graph" && tab\.type !== "file-preview"/);
  assert.match(scriptSource, /saveGlobalState\(\{ wordWrapEnabled: nextEnabled \}\)/);
  assert.match(scriptSource, /largeFileViewer\?\.setWordWrap/);
  assert.match(tabsSource, /deps\.onActiveTabChanged\?\.\(tab\)/);
});
