const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");

test("JDT folder publications become project diagnostics", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-jdt-project-"));
  try {
    const store = new JdtDiagnosticStore();
    const problem = store.toProblem({ uri: pathToFileURL(folder).href }, {
      message: "The project cannot be built until build path errors are resolved",
      range: { start: { line: 0, character: 0 } }
    }, 0);
    assert.equal(problem.targetKind, "project");
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
