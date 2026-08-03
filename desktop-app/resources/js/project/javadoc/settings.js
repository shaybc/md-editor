(function(global) {
  "use strict";

  /** Persist per-project settings for the Generate Documentation wizard. */
  function registerMarkdownViewerJavadocSettings(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const SETTINGS_FILE = "javadoc-settings.json";

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getSettingsPath(projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), SETTINGS_FILE);
    }

    function createDefaults(projectPath) {
      return {
        schemaVersion: 1,
        type: "md-editor-javadoc-settings",
        javadocCommand: "javadoc",
        visibility: "public",
        destination: joinPath(projectPath, "doc"),
        doclet: "standard",
        customDocletName: "",
        customDocletClassPath: "",
        documentTitleEnabled: false,
        documentTitle: "",
        usePage: true,
        hierarchyTree: true,
        navigatorBar: true,
        index: true,
        splitIndex: true,
        author: true,
        version: true,
        deprecated: true,
        deprecatedList: true,
        links: [],
        stylesheetEnabled: false,
        stylesheetPath: "",
        overviewEnabled: false,
        overviewPath: "",
        vmOptions: "",
        extraOptions: "",
        mavenOptions: {
          invocationValues: {},
          advancedArguments: "",
          persistedConfiguration: {}
        },
        sourceCompatibility: "",
        openIndex: false
      };
    }

    function normalizeSettings(projectPath, value) {
      const source = value && typeof value === "object" ? value : {};
      const defaults = createDefaults(projectPath);
      const bool = (name) => source[name] === undefined ? defaults[name] : source[name] === true;
      return Object.assign({}, defaults, {
        javadocCommand: String(source.javadocCommand || defaults.javadocCommand),
        visibility: ["private", "package", "protected", "public"].includes(source.visibility) ? source.visibility : defaults.visibility,
        destination: normalizePath(source.destination || defaults.destination),
        doclet: source.doclet === "custom" ? "custom" : "standard",
        customDocletName: String(source.customDocletName || ""),
        customDocletClassPath: String(source.customDocletClassPath || ""),
        documentTitleEnabled: bool("documentTitleEnabled"),
        documentTitle: String(source.documentTitle || ""),
        usePage: bool("usePage"),
        hierarchyTree: bool("hierarchyTree"),
        navigatorBar: bool("navigatorBar"),
        index: bool("index"),
        splitIndex: bool("splitIndex"),
        author: bool("author"),
        version: bool("version"),
        deprecated: bool("deprecated"),
        deprecatedList: bool("deprecatedList"),
        links: Array.from(new Set((Array.isArray(source.links) ? source.links : []).map((item) => String(item || "").trim()).filter(Boolean))),
        stylesheetEnabled: bool("stylesheetEnabled"),
        stylesheetPath: normalizePath(source.stylesheetPath || ""),
        overviewEnabled: bool("overviewEnabled"),
        overviewPath: normalizePath(source.overviewPath || ""),
        vmOptions: String(source.vmOptions || ""),
        extraOptions: String(source.extraOptions || ""),
        mavenOptions: {
          invocationValues: source.mavenOptions && typeof source.mavenOptions.invocationValues === "object" ? Object.assign({}, source.mavenOptions.invocationValues) : {},
          advancedArguments: String(source.mavenOptions?.advancedArguments || ""),
          persistedConfiguration: source.mavenOptions && typeof source.mavenOptions.persistedConfiguration === "object" ? Object.assign({}, source.mavenOptions.persistedConfiguration) : {}
        },
        sourceCompatibility: String(source.sourceCompatibility || ""),
        openIndex: bool("openIndex")
      });
    }

    async function load(projectPath) {
      const normalizedProject = normalizePath(projectPath);
      try {
        return normalizeSettings(normalizedProject, JSON.parse(await Neutralino.filesystem.readFile(getSettingsPath(normalizedProject))));
      } catch (_error) {
        return createDefaults(normalizedProject);
      }
    }

    async function save(projectPath, settings) {
      const normalizedProject = normalizePath(projectPath);
      const normalized = normalizeSettings(normalizedProject, settings);
      try {
        await Neutralino.filesystem.createDirectory(joinPath(normalizedProject, ".md-editor"));
      } catch (_error) {
        // Existing metadata directories are valid.
      }
      await Neutralino.filesystem.writeFile(getSettingsPath(normalizedProject), JSON.stringify(normalized, null, 2) + "\n");
      return normalized;
    }

    const api = { createDefaults, getSettingsPath, load, normalizeSettings, save };
    app.registerModule?.("javadocSettings", api);
    return api;
  }

  global.registerMarkdownViewerJavadocSettings = registerMarkdownViewerJavadocSettings;
})(typeof window !== "undefined" ? window : globalThis);
