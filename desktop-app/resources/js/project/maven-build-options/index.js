(function(global) {
  "use strict";

  /** Coordinate Maven option providers, sessions, and the reusable rebuild panel. */
  function registerMarkdownViewerMavenBuildOptions(app, deps = {}) {
    const catalog = deps.catalog;
    const sessionFactory = deps.sessionFactory;
    const panel = deps.panel;
    const pluginInspector = deps.pluginInspector;
    const pluginAwareProvider = deps.pluginAwareProvider;
    const compilerWarningProvider = deps.compilerWarningProvider;
    if (!catalog || !sessionFactory || !panel) throw new Error("Maven Build Options dependencies are unavailable.");

    catalog.registerProvider({
      id: "core-maven-rebuild-options",
      getOptions() {
        return [
          {
            id: "tests.compile",
            group: { id: "tests", label: "Tests", order: 10 },
            label: "Compile tests",
            description: "Compile test sources as part of the package build.",
            help: "When disabled, Maven receives -Dmaven.test.skip=true and neither compiles nor runs tests. This project choice is remembered.",
            order: 10,
            defaultValue: true,
            persistence: "project",
            storagePath: "compileTests",
            reservedArguments: ["maven.test.skip"],
            getArguments(value) { return value ? [] : ["-Dmaven.test.skip=true"]; }
          },
          {
            id: "tests.run",
            group: { id: "tests", label: "Tests", order: 10 },
            label: "Run tests",
            description: "Execute compiled tests during this package build.",
            help: "When disabled while test compilation remains enabled, Maven receives -DskipTests. Enabling this option also enables test compilation. This project choice is remembered.",
            order: 20,
            defaultValue: false,
            persistence: "project",
            storagePath: "runTests",
            requires: ["tests.compile"],
            reservedArguments: ["skipTests"],
            getArguments(value, values) { return !value && values["tests.compile"] ? ["-DskipTests"] : []; }
          },
          {
            id: "reactor.fail-at-end",
            group: { id: "reactor", label: "Reactor", order: 15 },
            label: "Don't stop after first module has failures, Continue and report at end (-fae)",
            description: "Continue building other Maven modules that can still run, then report module failures at the end.",
            help: "Adds Maven's -fae flag for this rebuild only. This does not hide failures; it lets Maven continue through the reactor so you can see more module-level failures in one run.",
            order: 10,
            defaultValue: false,
            persistence: "invocation",
            reservedArguments: ["fae"],
            getArguments(value) { return value ? ["-fae"] : []; }
          },
          {
            id: "dependency.force-updates",
            group: { id: "dependency-resolution", label: "Dependency resolution", order: 18 },
            label: "Force Maven dependency updates (-U)",
            description: "Retry remote dependency and plugin metadata checks instead of using cached failed lookups.",
            help: "Adds Maven's -U flag for this rebuild only. Use this when Maven says a failed dependency lookup was cached or when a repository may have been temporarily unavailable. It does not change pom.xml or fix missing artifacts that truly do not exist.",
            order: 10,
            defaultValue: false,
            persistence: "invocation",
            reservedArguments: ["U", "update-snapshots"],
            getArguments(value) { return value ? ["-U"] : []; }
          }
        ];
      }
    });

    if (compilerWarningProvider?.createProvider) catalog.registerProvider(compilerWarningProvider.createProvider());
    if (pluginAwareProvider?.createProvider) catalog.registerProvider(pluginAwareProvider.createProvider());

    function mergePluginSummary(staticSummary, effectiveSummary) {
      const byId = new Map();
      for (const plugin of Array.isArray(staticSummary?.plugins) ? staticSummary.plugins : []) byId.set(plugin.id, plugin);
      for (const plugin of Array.isArray(effectiveSummary?.plugins) ? effectiveSummary.plugins : []) byId.set(plugin.id, plugin);
      return {
        plugins: Array.from(byId.values()),
        warnings: [
          ...Array.from(staticSummary?.warnings || []),
          ...Array.from(effectiveSummary?.warnings || [])
        ]
      };
    }

    /** Build a fresh, non-stale option session for one dialog invocation. */
    async function createSession(options = {}) {
      const context = Object.assign({}, options.context || {});
      context.requestedPluginSkips = Array.isArray(context.requestedPluginSkips) ? context.requestedPluginSkips : [];
      let staticPluginSummary = null;
      if (pluginInspector?.inspect && context.projectRoot && context.pomPath) {
        try {
          staticPluginSummary = await pluginInspector.inspect({
            projectRoot: context.projectRoot,
            pomPath: context.pomPath
          });
        } catch (error) {
          staticPluginSummary = { plugins: [], warnings: [error?.message || String(error)] };
        }
      }
      context.pluginSummary = options.effectivePomPluginSummary
        ? mergePluginSummary(staticPluginSummary, options.effectivePomPluginSummary)
        : staticPluginSummary;
      const catalogResult = await catalog.getOptions(context);
      return sessionFactory.createSession({
        definitions: catalogResult.options,
        providerErrors: catalogResult.providerErrors,
        persistedConfiguration: options.persistedConfiguration,
        invocationValues: options.invocationValues,
        advancedArguments: options.advancedArguments
      });
    }

    const api = { createSession, mount: panel.mount, registerProvider: catalog.registerProvider };
    app.registerModule?.("mavenBuildOptions", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildOptions = registerMarkdownViewerMavenBuildOptions;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenBuildOptions };
})(typeof window !== "undefined" ? window : globalThis);
