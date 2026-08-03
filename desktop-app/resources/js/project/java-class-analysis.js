(function(global) {
  "use strict";

  /** Analyze project class outputs for source ownership and reverse dependencies. */
  function registerMarkdownViewerJavaClassAnalysis(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const normalizePath = (value) => String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const quote = (value) => `"${normalizePath(value).replace(/"/g, '\\"')}"`;

    async function collectClasses(folderPath, files = []) {
      try {
        for (const entry of await Neutralino.filesystem.readDirectory(folderPath) || []) {
          const name = entry?.entry || entry?.name || "";
          if (!name || name === "." || name === "..") continue;
          const path = `${normalizePath(folderPath)}/${name}`;
          const type = String(entry?.type || entry?.kind || "").toUpperCase();
          if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) await collectClasses(path, files);
          else if (/\.class$/i.test(name)) files.push(path);
        }
      } catch (_error) {}
      return files;
    }

    function findSource(sourceFiles, sourceName, packagePath) {
      const suffix = `${packagePath ? `${packagePath}/` : ""}${sourceName}`.toLowerCase();
      const matches = sourceFiles.filter((path) => normalizePath(path).toLowerCase().endsWith(suffix));
      return matches.length === 1 ? matches[0] : "";
    }

    /** Build exact class ownership; dependency analysis is conservative when jdeps is unavailable. */
    async function analyze(sourceFiles, outputRoots) {
      const ownership = Object.fromEntries((sourceFiles || []).map((path) => [normalizePath(path), []]));
      const classToSource = {};
      let complete = true;
      for (const root of outputRoots || []) {
        for (const classPath of await collectClasses(root)) {
          try {
            const result = await Neutralino.os.execCommand(`javap -verbose ${quote(classPath)}`);
            if (Number(result.exitCode) !== 0) throw new Error("javap failed");
            const output = `${result.stdOut || ""}\n${result.stdErr || ""}`;
            const sourceName = output.match(/SourceFile:\s+"([^"]+\.java)"/)?.[1] || "";
            const relative = normalizePath(classPath).slice(normalizePath(root).length).replace(/^\/+/, "");
            const packagePath = relative.split("/").slice(0, -1).join("/");
            const sourcePath = sourceName && findSource(sourceFiles, sourceName, packagePath);
            if (!sourcePath) { complete = false; continue; }
            ownership[sourcePath].push(normalizePath(classPath));
            classToSource[relative.replace(/\.class$/i, "").replace(/\//g, ".")] = sourcePath;
          } catch (_error) { complete = false; }
        }
      }
      const reverseSets = {};
      for (const root of outputRoots || []) {
        try {
          const result = await Neutralino.os.execCommand(`jdeps -verbose:class -filter:none ${quote(root)}`);
          if (Number(result.exitCode) !== 0) throw new Error("jdeps failed");
          for (const line of String(result.stdOut || "").split(/\r?\n/)) {
            const match = line.match(/^\s*([^\s]+)\s+->\s+([^\s]+)/);
            const from = classToSource[match?.[1]];
            const to = classToSource[match?.[2]];
            if (!from || !to || from === to) continue;
            (reverseSets[to] ||= new Set()).add(from);
          }
        } catch (_error) { complete = false; }
      }
      const reverseDependencies = Object.fromEntries(Object.entries(reverseSets).map(([path, values]) => [path, Array.from(values).sort()]));
      Object.values(ownership).forEach((paths) => paths.sort());
      if (Object.values(ownership).some((paths) => !paths.length)) complete = false;
      return { complete, ownership, reverseDependencies };
    }

    const api = { analyze, collectClasses };
    app.registerModule?.("javaClassAnalysis", api);
    return api;
  }

  global.registerMarkdownViewerJavaClassAnalysis = registerMarkdownViewerJavaClassAnalysis;
})(typeof window !== "undefined" ? window : globalThis);
