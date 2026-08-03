// Java editor Source action for launching a declared main method.
(function(global) {
  "use strict";

  /**
   * Register the Java editor Run-main action.
   * @param {object} app Application module registry.
   * @param {object} deps Source-action registry, main finder, launcher, and project context.
   * @returns {object} Source-action provider.
   */
  function registerMarkdownViewerRunEditorActions(app, deps = {}) {
    function getFilePath(context) {
      const tab = context.activeTab || {};
      return String(tab.sourceFilePath || tab.sourceFileName || "");
    }

    function getMainClass(context) {
      const filePath = getFilePath(context);
      if (!/\.java$/i.test(filePath)) return null;
      return deps.mainClassFinder.inspectSource(context.source || "", filePath);
    }

    const provider = {
      getAvailableActions(context = {}) {
        if (!deps.getProjectPath?.()) return [];
        const mainClass = getMainClass(context);
        if (!mainClass) return [];
        return [{
          id: "run-java-main",
          label: `Run ${mainClass.simpleName}.main()`,
          icon: "bi-play-fill",
          menu: "root",
          run() {
            const filePath = getFilePath(context);
            void deps.launcher.runJavaFile(filePath).catch((error) => deps.alert?.(error?.message || "The Java class could not be run."));
            return true;
          }
        }];
      }
    };
    deps.sourceActions.registerProvider(provider);
    app.registerModule?.("runEditorActions", provider);
    return provider;
  }

  global.registerMarkdownViewerRunEditorActions = registerMarkdownViewerRunEditorActions;
})(typeof window !== "undefined" ? window : globalThis);
