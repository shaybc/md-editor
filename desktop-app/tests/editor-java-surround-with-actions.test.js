const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadModules() {
  const context = { console, window: {} };
  context.window = context;
  for (const relativePath of [
    '../resources/js/editor/source-actions/index.js',
    '../resources/js/editor/source-actions/languages/java-surround-with-templates.js',
    '../resources/js/editor/source-actions/languages/java-surround-with-actions.js'
  ]) {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8'), context, { filename: relativePath });
  }
  return context;
}

function createHarness(options = {}) {
  const loaded = loadModules();
  const modules = {};
  const app = { modules, registerModule(name, api) { modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  let source = 'class Demo {\n    void run() {\n        work();\n    }\n}\n';
  const start = source.indexOf('work();');
  const end = start + 'work();'.length;
  const replacements = [];
  const selections = [];
  const appliedEdits = [];
  const requests = [];
  const refreshes = [];
  const alerts = [];
  const transport = {};
  const javaSourceActions = options.withJdt === false ? null : {
    getActiveJavaContext() { return { path: 'C:/workspace/Demo.java', content: source, language: { id: 'java' } }; },
    async getActiveLspDocumentContext() { return { fileUri: 'file:///C:/workspace/Demo.java', languageId: 'java', transport }; },
    extractCurrentFileEdits(edit, fileUri) { return edit.changes[fileUri] || []; }
  };
  const editor = {
    applyLspTextEdits(edits) { appliedEdits.push(...edits); return true; }
  };
  const activeEditorCommands = {
    replaceActiveEditorRange(from, to, text) {
      replacements.push({ from, to, text });
      source = source.slice(0, from) + text + source.slice(to);
      return true;
    },
    setActiveEditorSelection(from, to) { selections.push({ from, to }); },
    focusActiveEditor() {}
  };
  const requestClient = options.withJdt === false ? null : {
    async request(receivedTransport, method, params) {
      requests.push({ receivedTransport, method, params });
      if (method === 'codeAction/resolve') return params;
      return [{
        title: 'Surround with try/catch',
        kind: 'refactor.rewrite',
        edit: { changes: { 'file:///C:/workspace/Demo.java': [{ range: params.range, newText: 'try { work(); } catch (Exception e) {}' }] } }
      }];
    }
  };
  const api = loaded.registerMarkdownViewerJavaSurroundWithActions(app, {
    sourceActions,
    templates: loaded.markdownViewerJavaSurroundWithTemplates,
    javaSourceActions,
    activeEditorCommands,
    requestClient,
    getActiveEditorPath: () => options.isJava === false ? 'C:/workspace/readme.md' : 'C:/workspace/Demo.java',
    getActiveEditorValue: () => source,
    getActiveCodeMirrorEditor: () => editor,
    isActiveJavaFile: () => options.isJava !== false,
    updateEditorLineNumbers() { refreshes.push('lines'); },
    updateEditorSelectionHighlights() { refreshes.push('selection'); },
    updateStatusLine() { refreshes.push('status'); },
    alertUser(message) { alerts.push(message); }
  });
  return { api, sourceActions, getSource: () => source, start, end, replacements, selections, appliedEdits, requests, refreshes, alerts };
}

test('Surround With is Java-only and requires selected statements', () => {
  const harness = createHarness({ withJdt: false });
  assert.equal(harness.sourceActions.getAvailableActions({ source: harness.getSource(), selection: { start: harness.start, end: harness.end } })[0].id, 'surround-with');
  assert.deepEqual(Array.from(harness.sourceActions.getAvailableActions({ source: harness.getSource(), selection: { start: harness.start, end: harness.start } })), []);
  const markdown = createHarness({ isJava: false, withJdt: false });
  assert.deepEqual(Array.from(markdown.sourceActions.getAvailableActions({ source: markdown.getSource(), selection: { start: markdown.start, end: markdown.end } })), []);
});

test('local Surround With templates replace once and select the first placeholder', () => {
  const harness = createHarness({ withJdt: false });
  const context = { source: harness.getSource(), selection: { start: harness.start, end: harness.end } };
  const result = harness.sourceActions.executeAction('surround-with-template-if', context);

  assert.equal(result.applied, true);
  assert.equal(harness.replacements.length, 1);
  assert.match(harness.replacements[0].text, /^if \(condition\)/);
  assert.equal(harness.getSource().slice(harness.selections[0].from, harness.selections[0].to), 'condition');
  assert.deepEqual(harness.refreshes, ['lines', 'selection', 'status']);
});

test('JDT Surround With actions load for the exact selection and apply current-file edits', async () => {
  const harness = createHarness();
  const context = { source: harness.getSource(), selection: { start: harness.start, end: harness.end } };
  assert.equal(await harness.sourceActions.prepareAvailableActions(context), true);
  const group = harness.sourceActions.getAvailableActions(context)[0];
  assert.equal(group.children[0].id, 'surround-with-jdt-try-catch');
  assert.equal(harness.requests[0].method, 'textDocument/codeAction');
  assert.equal(harness.requests[0].params.range.start.line, 2);
  assert.equal(harness.requests[0].params.range.start.character, 8);
  assert.equal(harness.requests[0].params.range.end.line, 2);
  assert.equal(harness.requests[0].params.range.end.character, 15);

  const result = await harness.sourceActions.executeAction('surround-with-jdt-try-catch', context);
  assert.equal(result.applied, true);
  assert.equal(harness.appliedEdits.length, 1);
  assert.deepEqual(harness.alerts, []);
});
