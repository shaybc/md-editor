const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadTemplates() {
  const context = { window: {} };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, '../resources/js/editor/source-actions/languages/java-surround-with-templates.js'), 'utf8'),
    context,
    { filename: 'java-surround-with-templates.js' }
  );
  return context.markdownViewerJavaSurroundWithTemplates;
}

test('Java Surround With exposes the Eclipse-style structural template order', () => {
  const ids = Array.from(loadTemplates().getTemplates(), (template) => template.id);
  assert.deepEqual(ids, ['do', 'for-array', 'if', 'lock', 'runnable', 'synchronized', 'try-catch', 'try-finally', 'while']);
});

test('Java Surround With preserves relative indentation and selects the condition placeholder', () => {
  const templates = loadTemplates();
  const source = 'class Demo {\n    void run() {\n        first();\n        second();\n    }\n}\n';
  const start = source.indexOf('first();');
  const end = source.indexOf('second();') + 'second();'.length;
  const edit = templates.buildSurroundEdit('if', source, { start, end });

  assert.equal(edit.replacement, [
    'if (condition) {',
    '            first();',
    '            second();',
    '        }'
  ].join('\n'));
  assert.equal(edit.replacement.slice(edit.placeholderStart - start, edit.placeholderEnd - start), 'condition');
});

test('Java Surround With keeps CRLF and a selected trailing line break', () => {
  const templates = loadTemplates();
  const source = 'class Demo {\r\n    void run() {\r\n        first();\r\n        second();\r\n    }\r\n}\r\n';
  const start = source.indexOf('        first();');
  const end = source.indexOf('    }');
  const edit = templates.buildSurroundEdit('while', source, { start, end });

  assert.equal(edit.replacement, [
    '        while (condition) {',
    '            first();',
    '            second();',
    '        }',
    ''
  ].join('\r\n'));
});

test('Java Surround With rejects empty selections and unknown templates', () => {
  const templates = loadTemplates();
  assert.equal(templates.buildSurroundEdit('if', 'value();', { start: 2, end: 2 }), null);
  assert.equal(templates.buildSurroundEdit('missing', 'value();', { start: 0, end: 8 }), null);
});
