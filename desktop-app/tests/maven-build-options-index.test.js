const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadMavenBuildOptions(deps) {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/index.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenBuildOptions({ registerModule() {} }, deps);
}

function loadCompilerWarningProvider() {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/compiler-warning-provider.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider({ registerModule() {} });
}
function createCatalog() {
  const providers = [];
  return {
    registerProvider(provider) { providers.push(provider); },
    async getOptions(context) {
      const options = [];
      for (const provider of providers) options.push(...(await provider.getOptions(context)));
      return { options, providerErrors: [] };
    }
  };
}

test("index enriches provider context with detected Maven plugins", async () => {
  const catalog = createCatalog();
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} },
    pluginInspector: { async inspect() { return { plugins: [{ id: "apache-rat" }], warnings: [] }; } },
    pluginAwareProvider: {
      createProvider() {
        return {
          id: "plugin-aware-test",
          getOptions(context) {
            return context.pluginSummary.plugins.map((plugin) => ({ id: `plugin.${plugin.id}.skip` }));
          }
        };
      }
    }
  });

  const session = await api.createSession({ context: { projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" } });
  assert.ok(session.definitions.some((definition) => definition.id === "tests.compile"));
  assert.ok(session.definitions.some((definition) => definition.id === "plugin.apache-rat.skip"));
});

test("index keeps core options available when Maven plugin inspection fails", async () => {
  const catalog = createCatalog();
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} },
    pluginInspector: { async inspect() { throw new Error("inspection failed"); } },
    pluginAwareProvider: {
      createProvider() {
        return { id: "plugin-aware-test", getOptions(context) { return context.pluginSummary.plugins; } };
      }
    }
  });

  const session = await api.createSession({ context: { projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" } });
  assert.deepEqual(Array.from(session.definitions, (definition) => definition.id), ["tests.compile", "tests.run", "reactor.fail-at-end", "dependency.force-updates"]);
});


test("index forwards requested plugin skips and advanced arguments into the session", async () => {
  const catalog = createCatalog();
  let providerContext;
  let sessionOptions;
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { sessionOptions = options; return options; } },
    panel: { mount() {} },
    pluginInspector: { async inspect() { return { plugins: [], warnings: [] }; } },
    pluginAwareProvider: {
      createProvider() {
        return {
          id: "plugin-aware-test",
          getOptions(context) {
            providerContext = context;
            return [{ id: `requested.${context.requestedPluginSkips[0]}` }];
          }
        };
      }
    }
  });

  const session = await api.createSession({
    context: {
      projectRoot: "C:/Project",
      pomPath: "C:/Project/pom.xml",
      requestedPluginSkips: ["apache-rat"]
    },
    invocationValues: { "plugin.apache-rat.skip": true },
    advancedArguments: "-Pdev"
  });

  assert.deepEqual(providerContext.requestedPluginSkips, ["apache-rat"]);
  assert.ok(session.definitions.some((definition) => definition.id === "requested.apache-rat"));
  assert.equal(sessionOptions.invocationValues["plugin.apache-rat.skip"], true);
  assert.equal(sessionOptions.advancedArguments, "-Pdev");
});
test("index merges effective POM plugin summary with static inspection", async () => {
  const catalog = createCatalog();
  let inspected = false;
  let providerContext;
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} },
    pluginInspector: { async inspect() { inspected = true; return { plugins: [{ id: "spotbugs" }], warnings: [] }; } },
    pluginAwareProvider: {
      createProvider() {
        return {
          id: "plugin-aware-test",
          getOptions(context) {
            providerContext = context;
            return context.pluginSummary.plugins.map((plugin) => ({ id: `plugin.${plugin.id}.skip` }));
          }
        };
      }
    }
  });

  const session = await api.createSession({
    context: { projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" },
    effectivePomPluginSummary: { plugins: [{ id: "apache-rat", confidence: "effective" }], warnings: [] }
  });

  assert.equal(inspected, true);
  assert.equal(JSON.stringify(providerContext.pluginSummary.plugins.map((plugin) => plugin.id)), JSON.stringify(["spotbugs", "apache-rat"]));
  assert.ok(session.definitions.some((definition) => definition.id === "plugin.spotbugs.skip"));
  assert.ok(session.definitions.some((definition) => definition.id === "plugin.apache-rat.skip"));
});

test("index exposes invocation-only Maven fail-at-end reactor option", async () => {
  const catalog = createCatalog();
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} }
  });

  const session = await api.createSession();
  const option = session.definitions.find((definition) => definition.id === "reactor.fail-at-end");
  assert.equal(option.label, "Don't stop after first module has failures, Continue and report at end (-fae)");
  assert.equal(option.persistence, "invocation");
  assert.deepEqual(Array.from(option.reservedArguments), ["fae"]);
  assert.deepEqual(Array.from(option.getArguments(true)), ["-fae"]);
  assert.deepEqual(Array.from(option.getArguments(false)), []);
});


test("index exposes invocation-only Maven force updates option", async () => {
  const catalog = createCatalog();
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} }
  });

  const session = await api.createSession();
  const option = session.definitions.find((definition) => definition.id === "dependency.force-updates");
  assert.equal(option.label, "Force Maven dependency updates (-U)");
  assert.equal(option.persistence, "invocation");
  assert.deepEqual(Array.from(option.reservedArguments), ["U", "update-snapshots"]);
  assert.deepEqual(Array.from(option.getArguments(true)), ["-U"]);
  assert.deepEqual(Array.from(option.getArguments(false)), []);
});

test("index exposes invocation-only compiler warning controls", async () => {
  const catalog = createCatalog();
  const api = loadMavenBuildOptions({
    catalog,
    sessionFactory: { createSession(options) { return options; } },
    panel: { mount() {} },
    compilerWarningProvider: loadCompilerWarningProvider()
  });

  const session = await api.createSession();
  const hideAll = session.definitions.find((definition) => definition.id === "compiler.warnings.hide-all");
  const deprecation = session.definitions.find((definition) => definition.id === "compiler.warnings.suppress-deprecation");
  const unchecked = session.definitions.find((definition) => definition.id === "compiler.warnings.suppress-unchecked");

  assert.equal(hideAll.label, "Do not show Java compiler warnings during this rebuild");
  assert.equal(hideAll.persistence, "invocation");
  assert.equal(hideAll.defaultValue, false);
  assert.deepEqual(Array.from(hideAll.getArguments(true)), ["-Dmaven.compiler.showWarnings=false"]);
  assert.equal(deprecation.defaultValue, false);
  assert.equal(unchecked.defaultValue, false);
  assert.deepEqual(Array.from(deprecation.getArguments(true, {
    "compiler.warnings.suppress-deprecation": true,
    "compiler.warnings.suppress-unchecked": true
  })), ["-Dmaven.compiler.compilerArgument=-Xlint:-deprecation,-unchecked"]);
  assert.deepEqual(Array.from(deprecation.getArguments(false, {
    "compiler.warnings.suppress-deprecation": false,
    "compiler.warnings.suppress-unchecked": true
  })), ["-Dmaven.compiler.compilerArgument=-Xlint:-unchecked"]);
  assert.deepEqual(Array.from(unchecked.getArguments(true, {
    "compiler.warnings.suppress-deprecation": false,
    "compiler.warnings.suppress-unchecked": true
  })), []);
});
