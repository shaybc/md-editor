(function(global) {
  "use strict";

  /** Builds the JDT analysis inventory for unmanaged Java source folders. */
  function registerMarkdownViewerStandardSourceInventory(app) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function resolvePath(workspaceRoot, value) {
      const path = normalizePath(value);
      if (/^[A-Za-z]:\//.test(path) || path.startsWith("/")) return path;
      return joinPath(workspaceRoot, path === "." ? "" : path);
    }

    function relativePath(workspaceRoot, value) {
      const root = normalizePath(workspaceRoot);
      const path = normalizePath(value);
      if (path.toLowerCase() === root.toLowerCase()) return ".";
      return path.toLowerCase().startsWith(`${root.toLowerCase()}/`)
        ? path.slice(root.length + 1)
        : path;
    }

    /**
     * Resolve configured and conventionally detected Java source folders.
     * @param {object} context Workspace discovery context.
     * @returns {{kind: string, label: string, entries: object[]}} Canonical source inventory.
     */
    function resolve(context = {}) {
      const workspaceRoot = normalizePath(context.workspaceRoot);
      const configured = Array.isArray(context.configuration?.sourceFolders)
        ? context.configuration.sourceFolders.map((path) => resolvePath(workspaceRoot, path))
        : [];
      const detected = Array.isArray(context.standardJavaSourceRoots) ? context.standardJavaSourceRoots : [];
      const roots = new Map();
      [...configured, ...detected].map(normalizePath).filter(Boolean).forEach((path) => {
        const relative = relativePath(workspaceRoot, path);
        if (relative === ".") return;
        roots.set(path.toLowerCase(), {
          id: `standard:${relative.toLowerCase()}`,
          provider: "standard",
          kind: "source-root",
          name: relative,
          relativePath: relative,
          absolutePath: path,
          dependencies: [],
          aggregate: false,
          hasJavaSources: true
        });
      });
      return {
        kind: "standard-source-folders",
        label: "Java source folders",
        entries: Array.from(roots.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      };
    }

    const api = { resolve };
    app?.registerModule?.("standardSourceInventory", api);
    return api;
  }

  global.registerMarkdownViewerStandardSourceInventory = registerMarkdownViewerStandardSourceInventory;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerStandardSourceInventory };
  }
})(typeof window !== "undefined" ? window : globalThis);
