(function(global) {
  "use strict";

  /** Convert statically detected Maven plugins into one-invocation Build Options. */
  function registerMarkdownViewerMavenPluginAwareBuildOptionsProvider(app) {
    const REQUESTED_PLUGIN_SKIPS = {
      "apache-rat": {
        id: "apache-rat",
        groupId: "org.apache.rat",
        artifactId: "apache-rat-plugin",
        displayName: "Apache RAT",
        skipArgument: "-Drat.skip=true",
        declarationKind: "diagnostic-requested",
        confidence: "diagnostic"
      }
    };

    function uncertaintyFor(plugin) {
      if (plugin.confidence === "effective" && plugin.declarationKind === "active-plugin") return null;
      if (plugin.declarationKind === "diagnostic-requested") {
        return {
          badge: "Diagnostic requested",
          warning: `${plugin.displayName} was requested by the selected diagnostic. This skip flag is allowed for this rebuild only and does not resolve the underlying finding.`
        };
      }
      if (plugin.declarationKind === "plugin-management") {
        return {
          badge: "Configured only",
          warning: `${plugin.displayName} was found only in pluginManagement. This skip flag is allowed, but it has an effect only if Maven actually executes that plugin.`
        };
      }
      if (plugin.declarationKind === "profile") {
        return {
          badge: "Profile only",
          warning: `${plugin.displayName} was found inside a Maven profile. This skip flag is allowed, but it has an effect only if that profile is active for this rebuild.`
        };
      }
      return null;
    }

    function badgesFor(plugin) {
      const category = plugin.id === "apache-rat" ? "Audit bypass" : "Quality bypass";
      const uncertainty = uncertaintyFor(plugin);
      if (uncertainty) return [category, uncertainty.badge];
      if (plugin.confidence === "effective") return [category, "Verified"];
      return [category];
    }

    function describe(plugin) {
      if (plugin.id === "apache-rat") {
        return "Temporarily bypass the Apache RAT license audit for this command.";
      }
      if (plugin.id === "spotless") {
        return "Temporarily bypass Spotless format checks for this Maven command.";
      }
      return "Temporarily bypass " + plugin.displayName + " for this Maven command.";
    }

    function helpFor(plugin) {
      if (plugin.id === "spotless") {
        return "Adds -Dspotless.check.skip=true to this Maven command only. This skips spotless:check for this rebuild only; it does not format files or fix the underlying Spotless finding. The real fix is usually mvn spotless:apply followed by reviewing the diff.";
      }
      const uncertainty = uncertaintyFor(plugin);
      const suffix = uncertainty ? " If Maven does not execute this plugin, the property has no effect." : "";
      return "Adds " + plugin.skipArgument + " to this Maven command only. This does not edit pom.xml, change project policy, or fix the underlying " + plugin.displayName + " issue." + suffix;
    }

    function warningFor(plugin, uncertainty) {
      if (uncertainty) return uncertainty.warning;
      if (plugin.id === "spotless") {
        return "Spotless check is bypassed for this rebuild only; formatting violations remain unchanged. The real fix is usually mvn spotless:apply followed by reviewing the diff.";
      }
      return plugin.displayName + " is bypassed for this rebuild only; the underlying plugin finding is unchanged.";
    }

    function createOption(plugin, order) {
      const uncertainty = uncertaintyFor(plugin);
      return {
        id: `plugin.${plugin.id}.skip`,
        group: { id: "detected-plugins", label: "Detected plugins", order: 20 },
        label: `Skip ${plugin.displayName} for this rebuild`,
        description: describe(plugin),
        help: helpFor(plugin),
        badges: badgesFor(plugin),
        warning: warningFor(plugin, uncertainty),
        order,
        defaultValue: false,
        persistence: "invocation",
        disabledReason: "",
        reservedArguments: [plugin.skipArgument.replace(/^-D/, "").replace(/=.*/, "")],
        getArguments(value) { return value ? [plugin.skipArgument] : []; }
      };
    }

    function createProvider() {
      return {
        id: "plugin-aware-maven-build-options",
        getOptions(context = {}) {
          const plugins = Array.isArray(context.pluginSummary?.plugins) ? context.pluginSummary.plugins : [];
          const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
          for (const id of Array.isArray(context.requestedPluginSkips) ? context.requestedPluginSkips : []) {
            if (!byId.has(id) && REQUESTED_PLUGIN_SKIPS[id]) byId.set(id, REQUESTED_PLUGIN_SKIPS[id]);
          }
          return Array.from(byId.values()).map((plugin, index) => createOption(plugin, (index + 1) * 10));
        }
      };
    }

    const api = { createProvider };
    app.registerModule?.("mavenPluginAwareBuildOptionsProvider", api);
    return api;
  }

  global.registerMarkdownViewerMavenPluginAwareBuildOptionsProvider = registerMarkdownViewerMavenPluginAwareBuildOptionsProvider;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenPluginAwareBuildOptionsProvider };
})(typeof window !== "undefined" ? window : globalThis);