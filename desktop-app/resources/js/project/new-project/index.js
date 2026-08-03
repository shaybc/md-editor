(function(global) {
  "use strict";

  /** Wires the focused New Project modules into one application feature. */
  function registerMarkdownViewerNewProject(app, deps = {}) {
    const catalog = global.registerMarkdownViewerProjectTemplateCatalog?.(app);
    const specification = global.registerMarkdownViewerProjectSpecification?.(app, { catalog });
    const generators = {
      java: global.registerMarkdownViewerNewProjectJavaGenerator?.(app),
      python: global.registerMarkdownViewerNewProjectPythonGenerator?.(app),
      node: global.registerMarkdownViewerNewProjectNodeGenerator?.(app),
      typescript: global.registerMarkdownViewerNewProjectTypeScriptGenerator?.(app),
      csharp: global.registerMarkdownViewerNewProjectCSharpGenerator?.(app)
    };
    const scaffolder = global.registerMarkdownViewerProjectScaffolder?.(app, {
      Neutralino: deps.Neutralino,
      specification
    });
    return global.registerMarkdownViewerNewProjectDialog?.(app, {
      ...deps,
      catalog,
      specification,
      generators,
      scaffolder
    });
  }

  global.registerMarkdownViewerNewProject = registerMarkdownViewerNewProject;
})(typeof window !== "undefined" ? window : globalThis);
