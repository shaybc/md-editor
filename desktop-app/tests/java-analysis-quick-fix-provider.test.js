const assert = require("node:assert/strict");
const test = require("node:test");
const { registerMarkdownViewerJavaAnalysisQuickFixProvider } = require("../resources/js/quick-fix/java-analysis-quick-fix-provider.js");

test("JDT analysis Quick Fix exposes and executes all persistent recovery actions", async () => {
  const calls = [];
  const provider = registerMarkdownViewerJavaAnalysisQuickFixProvider({ registerModule() {} }, {
    retryProjectAnalysis: () => calls.push("retry"),
    showJdtLog: () => calls.push("log"),
    openJdkSettings: () => calls.push("settings"),
    openJavaBuildPath: () => calls.push("build-path")
  });
  const diagnostic = { diagnosticKind: "jdt-project-analysis" };
  const actions = await provider.getActions(diagnostic);

  assert.deepEqual(actions.map((action) => action.title), ["Retry Project Analysis", "Show JDT Log", "Open JDK Settings", "Open Java Build Path"]);
  assert.equal(actions[0].isPreferred, true);
  for (const action of actions) await provider.executeAction(diagnostic, action);
  assert.deepEqual(calls, ["retry", "log", "settings", "build-path"]);
  assert.deepEqual(await provider.getActions({ source: "jdt" }), []);
});
