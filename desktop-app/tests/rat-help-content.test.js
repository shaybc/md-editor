const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadHelpContent() {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/help-content.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatHelpContent({ registerModule() {} });
}

test("RAT help explains the finding and links to official Apache guidance", () => {
  const help = loadHelpContent().getGeneralHelp();
  assert.match(help.introduction[0], /Release Audit Tool/);
  assert.match(help.buildImpact, /Maven/);
  assert.ok(help.links.every((link) => link.url.startsWith("https://creadur.apache.org/rat/")));
});

test("RAT help explains every action category including temporary and persistent bypasses", () => {
  const help = loadHelpContent();
  const actionIds = [
    "resolution.add-header",
    "resolution.exclude-file",
    "resolution.exclude-pattern",
    "resolution.approve-license-family",
    "documentation.third-party",
    "documentation.open-project-files",
    "investigate.file",
    "investigate.provenance",
    "investigate.configuration",
    "investigate.report",
    "run.check",
    "advanced.skip",
    "advanced.disable-execution"
  ];
  actionIds.forEach((actionId) => {
    const topic = help.getActionHelp(actionId);
    assert.ok(topic, `missing help for ${actionId}`);
    assert.ok(topic.does);
    assert.ok(topic.buildImpact);
    assert.ok(topic.developerImpact);
  });
  assert.match(help.getActionHelp("advanced.skip").buildImpact, /finding remains unresolved/i);
  assert.match(help.getActionHelp("documentation.third-party").buildImpact, /does not.*clear/i);
});
