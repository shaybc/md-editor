(function(global) {
  "use strict";

  /** Resolve source roots and checked Java files for Javadoc generation scopes. */
  function registerMarkdownViewerJavadocSourceSelection(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function isJavaFile(path) {
      return /\.java$/i.test(String(path || ""));
    }

    function isInside(parent, child) {
      const root = normalizePath(parent).toLowerCase();
      const target = normalizePath(child).toLowerCase();
      return target === root || target.startsWith(root + "/");
    }

    function getDefaultScope(context) {
      if (context?.scope === "method") return "file";
      if (context?.scope === "file" || context?.scope === "folder" || context?.scope === "project") return context.scope;
      if (context?.targetKind === "directory") return "folder";
      if (isJavaFile(context?.targetPath || context?.filePath)) return "file";
      return "project";
    }

    function selectRootFiles(root, scope, context) {
      const files = Array.isArray(root.files) ? root.files : [];
      const targetPath = normalizePath(context?.targetPath || context?.filePath || "");
      if (scope === "project") return files.slice();
      if ((scope === "file" || scope === "method") && isJavaFile(targetPath)) {
        if (!files.length && isInside(root.path, targetPath)) return [targetPath];
        return files.filter((file) => normalizePath(file) === targetPath);
      }
      if (scope === "folder" && targetPath) return files.filter((file) => isInside(targetPath, file));
      return [];
    }

    function resolveFromEntries(sourceEntries, context = {}) {
      const existingRoots = sourceEntries.filter((entry) => entry.exists);
      const selectedScope = getDefaultScope(context);
      const roots = existingRoots.map((entry) => {
        const selectedFiles = selectRootFiles(entry, selectedScope, context);
        const checked = selectedScope === "project" ? true : selectedFiles.length > 0;
        return Object.assign({}, entry, { checked, selectedFiles });
      });
      if (!roots.some((entry) => entry.checked) && roots.length) {
        roots.forEach((entry) => {
          entry.checked = true;
          entry.selectedFiles = (entry.files || []).slice();
        });
      }
      return { scope: selectedScope, roots };
    }

    async function resolve(projectPath, configuration, context = {}) {
      if (typeof deps.resolveSourceEntries !== "function") throw new Error("Javadoc source resolution is unavailable.");
      return resolveFromEntries(await deps.resolveSourceEntries(projectPath, configuration), context);
    }

    function getSelectedRoots(sourceEntries) {
      return (sourceEntries || []).filter((entry) => entry.checked).map((entry) => Object.assign({}, entry, {
        files: (entry.selectedFiles?.length ? entry.selectedFiles : entry.files || []).slice()
      }));
    }

    const api = { getDefaultScope, getSelectedRoots, isJavaFile, resolve, resolveFromEntries };
    app.registerModule?.("javadocSourceSelection", api);
    return api;
  }

  global.registerMarkdownViewerJavadocSourceSelection = registerMarkdownViewerJavadocSourceSelection;
})(typeof window !== "undefined" ? window : globalThis);