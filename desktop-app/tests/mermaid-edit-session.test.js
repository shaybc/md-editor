const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture(overrides = {}) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ["models/diagram-component.js", "source-map.js", "edit-session.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../resources/js/markdown/mermaid-editing", file), "utf8"), context);
  }
  const api = context.window.MarkdownViewerMermaidSourceMap;
  const before = '# Before\n```mermaid\n';
  const source = 'flowchart LR\n A[First] --> B[Second]\n';
  const after = '```\n# After\n';
  const diagram = { source, documentSource: before + source + after, tabId: "one", start: before.length,
    end: before.length + source.length, ...api.scanNodes(source) };
  let documentSource = diagram.documentSource;
  let transactions = 0;
  let saves = 0;
  const deps = {
    getDocument: () => ({ tabId: "one", source: documentSource }),
    validate: async () => true,
    applySource(start, end, replacement) {
      transactions++;
      documentSource = documentSource.slice(0, start) + replacement + documentSource.slice(end);
      return true;
    },
    persist: async () => { saves++; return true; },
    ...overrides
  };
  return { session: context.window.createMarkdownViewerMermaidEditSession(diagram, deps), deps,
    source: () => documentSource, changeSource: value => { documentSource = value; },
    transactions: () => transactions, saves: () => saves, diagram };
}

test("draft edits do not touch the document; Save commits all labels in one transaction and persists", async () => {
  const f = fixture();
  f.session.setLabel("A", "New first");
  f.session.setLabel("B", "New second");
  assert.equal(f.source(), f.diagram.documentSource);
  assert.equal(f.transactions(), 0);
  assert.equal(await f.session.save(), true);
  assert.equal(f.transactions(), 1);
  assert.equal(f.saves(), 1);
  assert.equal(f.source(), f.diagram.documentSource.replace('[First]', '["New first"]').replace('[Second]', '["New second"]'));
});

test("validation failures leave document and file untouched", async () => {
  const f = fixture({ validate: async () => { throw new Error("Invalid diagram"); } });
  f.session.setLabel("A", "Changed");
  await assert.rejects(f.session.save(), /Invalid diagram/);
  assert.equal(f.transactions(), 0);
  assert.equal(f.saves(), 0);
  assert.equal(f.session.hasChanges(), true);
});

test("source changes, tab changes and read-only documents cannot receive stale patches", async () => {
  for (const current of [{ tabId: "other", source: "" }, { tabId: "one", source: "changed" },
    { tabId: "one", source: "", readOnly: true }]) {
    const f = fixture({ getDocument: () => current });
    f.session.setLabel("A", "Changed");
    await assert.rejects(f.session.save(), /source document changed/);
    assert.equal(f.transactions(), 0);
  }
});

test("rechecks source after asynchronous validation", async () => {
  const f = fixture();
  f.deps.validate = async () => { f.changeSource("External edit"); return true; };
  f.session.setLabel("A", "Changed");
  await assert.rejects(f.session.save(), /source document changed/);
  assert.equal(f.transactions(), 0);
});

test("file save failure leaves source dirty and retries without applying the source transaction twice", async () => {
  const f = fixture();
  let attempts = 0;
  f.deps.persist = async () => ++attempts > 1;
  f.session.setLabel("A", "Changed");
  await assert.rejects(f.session.save(), /file was not saved/);
  assert.equal(f.session.isApplied(), true);
  assert.ok(f.source().includes('["Changed"]'));
  assert.throws(() => f.session.setLabel("A", "Another"), /Finish saving/);
  assert.equal(await f.session.save(), true);
  assert.equal(f.transactions(), 1);
  assert.equal(attempts, 2);
});

test("reverting a draft to its original label removes the pending change", () => {
  const f = fixture();
  f.session.setLabel("A", "Changed");
  f.session.setLabel("A", "First");
  assert.equal(f.session.hasChanges(), false);
  assert.equal(f.session.draftSource(), f.diagram.source);
});
