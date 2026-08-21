const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const resourcesRoot = path.resolve(__dirname, "..", "resources");

function readResourceFile(relativePath) {
  return fs.readFileSync(path.join(resourcesRoot, relativePath), "utf8");
}

test("CodeMirror refreshes snippet definitions when the active language is unchanged", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-editor.js"));
  const unchangedLanguageBranch = source.match(/if \(nextLanguageId === lastLanguageId\) \{([\s\S]*?)return;\s*\}/);
  assert.ok(unchangedLanguageBranch, "setLanguageForActivePath should keep an unchanged-language branch");
  assert.match(
    unchangedLanguageBranch[1],
    /codeMirror\.setSnippetDefinitions\?\.\(getSnippetDefinitions\(nextLanguageId\)\);/,
    "unchanged-language refresh should reload snippets for Parse as YAML and settings updates"
  );
});

test("active CodeMirror facade exposes snippet definition refresh", () => {
  const source = readResourceFile(path.join("js", "script.js"));
  assert.match(
    source,
    /refreshSnippetDefinitions:\s*callActive\("refreshSnippetDefinitions", undefined\)/,
    "settings refresh should reach the active editor snippet refresh method"
  );
  assert.ok(
    source.includes("activeEditorCommands?.refreshSnippetDefinitions?.();"),
    "settings refresh should fall back to the active editor facade"
  );
});


test("CodeMirror installs explicit completion trigger keys", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));
  assert.ok(source.includes("{ key: \"Ctrl-Space\", run: startCompletionWithSnippetDebug, preventDefault: true }"));
  assert.ok(source.includes("{ key: \"Mod-Space\", run: startCompletionWithSnippetDebug, preventDefault: true }"));
  assert.ok(generatedBundle.includes("{ key: \"Ctrl-Space\", run: startCompletionWithSnippetDebug, preventDefault: true }"));
  assert.ok(generatedBundle.includes("{ key: \"Mod-Space\", run: startCompletionWithSnippetDebug, preventDefault: true }"));
});
test("CodeMirror generated bundle enables YAML snippet completions", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));
  const supportedSnippetLanguages = '["javascript", "typescript", "java", "yaml", "python", "csharp"].includes(languageId)';

  assert.ok(source.includes(supportedSnippetLanguages));
  assert.ok(generatedBundle.includes(supportedSnippetLanguages));
});

test("CodeMirror snippet completion source uses an explicit word range", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));
  const wordMatcher = String.raw`context.matchBefore(/[\p{L}\p{N}_$-]+(?:\s+[\p{L}\p{N}_$-]+)*/u)`;
  const validFor = String.raw`validFor: /^[\p{L}\p{N}_$\s-]*$/u`;

  assert.ok(source.includes(wordMatcher));
  assert.ok(generatedBundle.includes(wordMatcher));
  assert.ok(source.includes("from: word?.from ?? context.pos"));
  assert.ok(generatedBundle.includes("from: word?.from ?? context.pos"));
  assert.ok(source.includes(validFor));
  assert.ok(generatedBundle.includes(validFor));
});
test("CodeMirror logs explicit completion UI state", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));

  assert.ok(source.includes("function startCompletionWithSnippetDebug(view)"));
  assert.ok(generatedBundle.includes("function startCompletionWithSnippetDebug(view)"));
  assert.ok(source.includes("Completion UI state"));
  assert.ok(generatedBundle.includes("Completion UI state"));
  assert.ok(source.includes("Completion DOM state"));
  assert.ok(generatedBundle.includes("Completion DOM state"));
  assert.ok(source.includes("logCodeMirrorCompletionDomState(\"snippet-source-returned-options\")"));
  assert.ok(generatedBundle.includes("logCodeMirrorCompletionDomState(\"snippet-source-returned-options\")"));
});
test("CodeMirror snippet completions expose a floating snippet preview panel", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));
  const styles = readResourceFile("styles.css");

  assert.ok(source.includes("function createSnippetPreviewElement(snippetDefinition)"));
  assert.ok(generatedBundle.includes("function createSnippetPreviewElement(snippetDefinition)"));
  assert.ok(source.includes("info: () => createSnippetPreviewElement(snippet)"));
  assert.ok(generatedBundle.includes("info: () => createSnippetPreviewElement(snippet2)"));
  assert.ok(source.includes("cm-snippetPreview-placeholder"));
  assert.ok(generatedBundle.includes("cm-snippetPreview-placeholder"));
  assert.ok(source.includes("function repositionCodeMirrorCompletionInfoTooltip(reason)"));
  assert.ok(generatedBundle.includes("function repositionCodeMirrorCompletionInfoTooltip(reason)"));
  assert.ok(source.includes("function scheduleCodeMirrorCompletionTooltipReposition(reason)"));
  assert.ok(generatedBundle.includes("function scheduleCodeMirrorCompletionTooltipReposition(reason)"));
  assert.ok(source.includes("runCodeMirrorCompletionTooltipReposition(`${reason}-settled`)"));
  assert.ok(generatedBundle.includes("runCodeMirrorCompletionTooltipReposition(`${reason}-settled`)"));
  assert.ok(!source.includes("new MutationObserver(() => scheduleCodeMirrorCompletionTooltipReposition"));
  assert.ok(!generatedBundle.includes("new MutationObserver(() => scheduleCodeMirrorCompletionTooltipReposition"));
  assert.ok(styles.includes(".cm-tooltip.cm-completionInfo"));
  assert.ok(styles.includes(".cm-snippetPreview"));
  assert.ok(styles.includes(".cm-snippetPreview-placeholder"));
  const autocompleteTooltipBlock = styles.match(/\.codemirror-editor \.cm-tooltip\.cm-tooltip-autocomplete,[\s\S]*?\.cm-tooltip-autocomplete \{([\s\S]*?)\n\}/)?.[1] || "";
  const completionInfoBlock = styles.match(/\.cm-tooltip\.cm-completionInfo \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(autocompleteTooltipBlock, /overflow: visible !important;/);
  assert.match(autocompleteTooltipBlock, /pointer-events: auto;/);
  assert.match(completionInfoBlock, /pointer-events: none;/);
});
test("CodeMirror autocomplete rows expose provider origin pills", () => {
  const source = readResourceFile(path.join("js", "editor", "codemirror-bundle-source.js"));
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));
  const styles = readResourceFile("styles.css");

  assert.ok(source.includes("COMPLETION_ORIGIN_PILL_OPTION"));
  assert.ok(generatedBundle.includes("COMPLETION_ORIGIN_PILL_OPTION"));
  assert.ok(source.includes("addToOptions: [COMPLETION_ORIGIN_PILL_OPTION]"));
  assert.ok(generatedBundle.includes("addToOptions: [COMPLETION_ORIGIN_PILL_OPTION]"));
  assert.ok(source.includes('origin: "Snippet"'));
  assert.ok(source.includes('origin: "LSP"'));
  assert.ok(source.includes('origin: "Document"'));
  assert.ok(generatedBundle.includes('origin: "Snippet"'));
  assert.ok(generatedBundle.includes('origin: "LSP"'));
  assert.ok(generatedBundle.includes('origin: "Document"'));
  assert.ok(styles.includes(".cm-completionOriginPill"));
  assert.ok(styles.includes(".cm-completionOriginPill-snippet"));
  assert.ok(styles.includes(".cm-completionOriginPill-lsp"));
  assert.ok(styles.includes(".cm-completionOriginPill-document"));
});
test("CodeMirror autocomplete rows select on mouse hover", () => {
  const generatedBundle = readResourceFile(path.join("js", "vendor", "codemirror.bundle.js"));

  assert.ok(generatedBundle.includes('ul5.addEventListener("mousemove"'));
  assert.ok(generatedBundle.includes("e.target.closest('li[role=\"option\"]')"));
  assert.ok(generatedBundle.includes("setSelectedEffect.of(optionIndex)"));
  assert.ok(generatedBundle.includes("cState.open.selected === optionIndex"));
});