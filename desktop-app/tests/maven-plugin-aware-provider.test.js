const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadProviderFactory() {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/plugin-aware-provider.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenPluginAwareBuildOptionsProvider({ registerModule() {} });
}

test("provider exposes enabled invocation-only options for active plugins", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: {
      plugins: [{ id: "apache-rat", displayName: "Apache RAT", skipArgument: "-Drat.skip=true", declarationKind: "active-plugin" }]
    }
  });

  assert.equal(options[0].id, "plugin.apache-rat.skip");
  assert.equal(options[0].persistence, "invocation");
  assert.equal(options[0].getArguments(true)[0], "-Drat.skip=true");
  assert.equal(options[0].disabledReason, "");
  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Audit bypass"]));
});

test("provider enables uncertain plugin options with warning badges", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: {
      plugins: [
        { id: "checkstyle", displayName: "Checkstyle", skipArgument: "-Dcheckstyle.skip=true", declarationKind: "plugin-management" },
        { id: "spotbugs", displayName: "SpotBugs", skipArgument: "-Dspotbugs.skip=true", declarationKind: "profile" }
      ]
    }
  });

  assert.equal(options[0].disabledReason, "");
  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Quality bypass", "Configured only"]));
  assert.match(options[0].warning, /pluginManagement/);
  assert.equal(options[0].getArguments(true)[0], "-Dcheckstyle.skip=true");
  assert.equal(options[1].disabledReason, "");
  assert.equal(JSON.stringify(options[1].badges), JSON.stringify(["Quality bypass", "Profile only"]));
  assert.match(options[1].warning, /profile/);
  assert.equal(options[1].getArguments(true)[0], "-Dspotbugs.skip=true");
});


test("provider returns only statically detected plugin options", () => {
  const provider = loadProviderFactory().createProvider();
  const none = provider.getOptions({ pluginSummary: { plugins: [] } });
  const one = provider.getOptions({
    pluginSummary: {
      plugins: [{ id: "checkstyle", displayName: "Checkstyle", skipArgument: "-Dcheckstyle.skip=true", declarationKind: "active-plugin" }]
    }
  });

  assert.equal(none.length, 0);
  assert.deepEqual(Array.from(one, (option) => option.id), ["plugin.checkstyle.skip"]);
});
test("provider exposes a diagnostic-requested RAT skip when static inspection misses RAT", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: { plugins: [] },
    requestedPluginSkips: ["apache-rat"]
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].id, "plugin.apache-rat.skip");
  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Audit bypass", "Diagnostic requested"]));
  assert.match(options[0].warning, /selected diagnostic/);
  assert.equal(options[0].getArguments(true)[0], "-Drat.skip=true");
});

test("provider does not duplicate requested plugin skips that were statically detected", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: {
      plugins: [{ id: "apache-rat", displayName: "Apache RAT", skipArgument: "-Drat.skip=true", declarationKind: "active-plugin" }]
    },
    requestedPluginSkips: ["apache-rat"]
  });

  assert.equal(options.length, 1);
  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Audit bypass"]));
});
test("provider marks effective active plugins as verified", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: {
      plugins: [{ id: "spotbugs", displayName: "SpotBugs", skipArgument: "-Dspotbugs.skip=true", declarationKind: "active-plugin", confidence: "effective" }]
    }
  });

  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Quality bypass", "Verified"]));
  assert.equal(options[0].getArguments(true)[0], "-Dspotbugs.skip=true");
});


test("provider exposes Spotless skip guidance", () => {
  const provider = loadProviderFactory().createProvider();
  const options = provider.getOptions({
    pluginSummary: {
      plugins: [{ id: "spotless", displayName: "Spotless", skipArgument: "-Dspotless.check.skip=true", declarationKind: "active-plugin" }]
    }
  });

  assert.equal(options[0].id, "plugin.spotless.skip");
  assert.equal(options[0].label, "Skip Spotless for this rebuild");
  assert.equal(options[0].getArguments(true)[0], "-Dspotless.check.skip=true");
  assert.equal(JSON.stringify(options[0].badges), JSON.stringify(["Quality bypass"]));
  assert.match(options[0].help, /spotless:check/);
  assert.match(options[0].help, /mvn spotless:apply/);
  assert.match(options[0].warning, /formatting violations remain unchanged/);
});
