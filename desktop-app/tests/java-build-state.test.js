const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadState() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-build-state.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerJavaBuildState({ registerModule() {} }, { Neutralino: { filesystem: {} } });
}

test("incremental plan includes changed sources and transitive reverse dependents", () => {
  const state = loadState();
  const manifest = {
    complete: true,
    fingerprint: "same",
    sources: {
      "C:/Project/src/A.java": { hash: "a" },
      "C:/Project/src/B.java": { hash: "b" },
      "C:/Project/src/C.java": { hash: "c" }
    },
    ownership: {
      "C:/Project/src/A.java": ["A.class"],
      "C:/Project/src/B.java": ["B.class"],
      "C:/Project/src/C.java": ["C.class"]
    },
    reverseDependencies: {
      "C:/Project/src/A.java": ["C:/Project/src/B.java"],
      "C:/Project/src/B.java": ["C:/Project/src/C.java"]
    }
  };
  const plan = state.planIncremental(manifest, {
    "C:/Project/src/A.java": { hash: "changed" },
    "C:/Project/src/B.java": { hash: "b" },
    "C:/Project/src/C.java": { hash: "c" }
  }, ["C:/Project/src/A.java"], "same");
  assert.equal(plan.full, false);
  assert.deepEqual(Array.from(plan.files), ["C:/Project/src/A.java", "C:/Project/src/B.java", "C:/Project/src/C.java"]);
});

test("incomplete state and deleted sources require a full compile", () => {
  const state = loadState();
  assert.equal(state.planIncremental(null, {}, [], "x").full, true);
  const manifest = {
    complete: true,
    fingerprint: "x",
    sources: { "A.java": { hash: "a" }, "Deleted.java": { hash: "d" } },
    ownership: { "A.java": ["A.class"], "Deleted.java": ["Deleted.class"] }
  };
  assert.equal(state.planIncremental(manifest, { "A.java": { hash: "a" } }, ["A.java"], "x").reason, "source-removed");
});

