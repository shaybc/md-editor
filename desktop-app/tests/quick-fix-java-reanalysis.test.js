const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("applied Java Quick Fix reanalyzes before diagnostic verification", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const events = [];
  const diagnostic = {
    isLiveDiagnostic: true,
    filePath: "C:/Project/src/Main.java",
    uri: "file:///C:/Project/src/Main.java",
    message: "Unknown symbol",
    range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }
  };
  const action = { id: "fix", provenance: "JDT", title: "Create field" };
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: {
      async getActions() { return { actions: [action], diagnostic }; },
      async resolveAction(value) { return { ...value, workspaceEdit: { changes: {} } }; }
    },
    javaAnalysisProvider: { isDiagnostic: () => false },
    localProvider: { isRatDiagnostic: () => false, isSpotlessDiagnostic: () => false, isMavenDependencyResolutionDiagnostic: () => false, isMavenDiagnostic: () => false },
    diagnosticStore: {
      createFingerprint: () => "before",
      getDiagnosticsForUri: () => [diagnostic],
      async waitForChange() {
        events.push("verify");
        return { changed: true, match: null, diagnostics: [] };
      }
    },
    workspaceEditPreview: {
      async resolve() { return { affectedPaths: [diagnostic.filePath], summary: [] }; },
      async apply() {
        events.push("apply");
        return {};
      }
    },
    javaAnalysisRefresh: {
      async reanalyze() { events.push("reanalyze"); }
    },
    dialog: {
      async open(options) {
        const preview = await options.resolvePreview(action);
        await options.applyPreview(preview);
        await options.verify();
      }
    }
  });

  await controller.openForDiagnostic(diagnostic);
  assert.deepEqual(events, ["apply", "reanalyze", "verify"]);
});
