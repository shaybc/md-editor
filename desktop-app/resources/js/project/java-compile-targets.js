(function(global) {
  "use strict";

  /** Resolve disk-backed Java file and folder compile targets. */
  function registerMarkdownViewerJavaCompileTargets(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const normalizePath = (value) => String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const isJavaFile = (path) => /\.java$/i.test(normalizePath(path));
    const isInside = (root, path) => {
      const parent = normalizePath(root).toLowerCase();
      const child = normalizePath(path).toLowerCase();
      return child === parent || child.startsWith(`${parent}/`);
    };

    async function collectFolder(folderPath, files = []) {
      for (const entry of await Neutralino.filesystem.readDirectory(folderPath) || []) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        const path = `${normalizePath(folderPath)}/${name}`;
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) await collectFolder(path, files);
        else if (isJavaFile(path)) files.push(path);
      }
      return files;
    }

    /** Return Java files under the requested file or directory and configured source roots. */
    async function resolve(context, sourceRoots) {
      const targetPath = normalizePath(context?.targetPath || context?.filePath);
      if (!targetPath) return [];
      const candidates = context?.targetKind === "directory" ? await collectFolder(targetPath) : (isJavaFile(targetPath) ? [targetPath] : []);
      return Array.from(new Set(candidates.filter((path) => sourceRoots.some((root) => isInside(root, path))))).sort();
    }

    const api = { isInside, isJavaFile, resolve };
    app.registerModule?.("javaCompileTargets", api);
    return api;
  }

  global.registerMarkdownViewerJavaCompileTargets = registerMarkdownViewerJavaCompileTargets;
})(typeof window !== "undefined" ? window : globalThis);
