const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadSourceMap() {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ["models/diagram-component.js", "source-map.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../resources/js/markdown/mermaid-editing", file), "utf8"), context);
  }
  return context.window.MarkdownViewerMermaidSourceMap;
}

test("source map patches the effective declaration by node ID and preserves all other text", () => {
  const api = loadSourceMap();
  const source = '%% comment\r\nflowchart LR\r\n A["Same"] --> B["Same"]\r\n A{Last label}\r\n style A fill:#fff\r\n';
  const diagram = { source, ...api.scanNodes(source) };
  assert.equal(diagram.supported, true);
  assert.equal(diagram.nodes.get("A").originalText, "Last label");
  assert.equal(api.patchDiagram(diagram, new Map([["A", 'Review "input"\nשלום & #<>'] ])),
    source.replace('A{Last label}', 'A{"Review #34;input#34;<br/>שלום #38; #35;#60;#62;"}'));
  assert.equal(diagram.nodes.get("B").originalText, "Same");
});

test("implicit labels gain text without changing IDs or references", () => {
  const api = loadSourceMap();
  const source = 'graph TD; Start --> End; Start --> C';
  const diagram = { source, ...api.scanNodes(source) };
  assert.equal(diagram.supported, true);
  assert.equal(api.patchDiagram(diagram, new Map([["Start", "Begin"]])),
    'graph TD; Start["Begin"] --> End; Start --> C');
});

test("source map handles shapes, chained links, classes, notes and edge labels", () => {
  const api = loadSourceMap();
  const cases = [
    'A[Rect] --> B{Decision} --> C((Circle))',
    'A[Rect] -.-> B(Round)',
    'N["Note"] -.- X-Y[Target]',
    'A[Rect] -->|yes| B[[Subroutine]]',
    'A[Rect] -- some words --> B[(Database)]',
    'A[Rect]:::active --> B([Stadium])',
    'A[Rect] & B[Second] --> C[Third]'
  ];
  for (const body of cases) {
    const diagram = api.scanNodes('flowchart LR\n' + body);
    assert.equal(diagram.supported, true, body);
    assert.ok(diagram.nodes.size >= 2, body);
    assert.equal(diagram.nodes.has("yes"), false);
    assert.equal(diagram.nodes.has("some"), false);
  }
});

test("slanted shapes stop at their own closer without consuming following nodes", () => {
  const api = loadSourceMap();
  const source = 'flowchart LR\n A[/One\\] --> B[/Two/] --> C[\\Three/]';
  const diagram = { source, ...api.scanNodes(source) };
  assert.equal(diagram.supported, true);
  assert.equal(diagram.nodes.get("A").originalText, "One");
  assert.equal(diagram.nodes.get("B").originalText, "Two");
  assert.equal(diagram.nodes.get("C").originalText, "Three");
  assert.equal(api.patchDiagram(diagram, new Map([["A", "New"]])),
    source.replace('A[/One\\]', 'A[/"New"\\]'));
});

test("rich labels, new syntax and non-flowcharts remain read-only", () => {
  const api = loadSourceMap();
  assert.equal(api.scanNodes('flowchart LR\n A["<b>rich</b>"] --> B').nodes.get("A").editable, false);
  assert.equal(api.scanNodes('flowchart LR\n A["`**rich**`"] --> B').nodes.get("A").editable, false);
  const properties = api.scanNodes('flowchart LR\n A[old]\n A@{ label: "new" }');
  assert.equal(properties.supported, false);
  assert.equal(properties.nodes.get("A").editable, false);
  assert.equal(api.scanNodes('sequenceDiagram\n A->>B: Hi').supported, false);
});

test("diagram ranges distinguish identical fences and preserve surrounding Markdown and CRLF", () => {
  const api = loadSourceMap();
  const source = '# Heading\r\n```mermaid\r\nflowchart LR\r\n A --> B\r\n```\r\ntext\r\n~~~mermaid\r\nflowchart LR\r\n A --> B\r\n~~~\r\n';
  const blocks = api.findDiagrams(source, false);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].source, blocks[1].source);
  assert.notEqual(blocks[0].start, blocks[1].start);
  for (const block of blocks) assert.equal(source.slice(block.start, block.end), block.source);
  assert.equal(api.findDiagrams('```text\n```mermaid\nA\n```\n', false).length, 0);
  assert.equal(api.findDiagrams(source, true)[0].source, source);
});

test("preview mappings retain document ownership and refuse mismatched fence counts", () => {
  const api = loadSourceMap();
  const containers = [{}, {}];
  const preview = { querySelectorAll: () => containers };
  const source = '```mermaid\nflowchart LR\n A --> B\n```\n```mermaid\nflowchart LR\n A --> B\n```';
  api.setPreviewContext(preview, source, { id: "tab-1" }, false);
  api.capturePreview(preview);
  assert.equal(api.get(containers[1]).tabId, "tab-1");
  assert.equal(api.get(containers[1]).documentSource, source);
  assert.notEqual(api.get(containers[0]).diagramId, api.get(containers[1]).diagramId);
  api.setPreviewContext(preview, 'flowchart LR\n A --> B', { id: "other" }, true);
  api.capturePreview(preview);
  assert.equal(api.get(containers[0]), null);
});
