(function(global) {
  "use strict";

  /** Java compiler filesystem, command, and diagnostic operations. */
  function registerMarkdownViewerJavaCompiler(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getName(path) {
      return normalizePath(path).split("/").pop() || "sources";
    }

    async function pathExists(path, kind) {
      try {
        const stats = await Neutralino.filesystem.getStats(path);
        if (kind === "file") return stats?.isFile === true;
        if (kind === "directory") return stats?.isDirectory === true;
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function collectJavaFiles(folderPath, files = []) {
      const entries = await Neutralino.filesystem.readDirectory(folderPath);
      for (const entry of entries || []) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        const fullPath = joinPath(folderPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          await collectJavaFiles(fullPath, files);
        } else if ((type === "FILE" || entry?.isFile === true || !type) && /\.java$/i.test(name)) {
          files.push(fullPath);
        }
      }
      return files.sort((left, right) => left.localeCompare(right));
    }

    async function collectJarFiles(folderPath, files = []) {
      const entries = await Neutralino.filesystem.readDirectory(folderPath);
      for (const entry of entries || []) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        const fullPath = joinPath(folderPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          await collectJarFiles(fullPath, files);
        } else if ((type === "FILE" || entry?.isFile === true || !type) && /\.jar$/i.test(name)) {
          files.push(fullPath);
        }
      }
      return files.sort((left, right) => left.localeCompare(right));
    }

    async function ensureDirectory(path) {
      try {
        await Neutralino.filesystem.createDirectory(path);
      } catch (_error) {
        // Existing directories are valid; subsequent IO surfaces real failures.
      }
    }

    async function ensureRelativeDirectories(rootPath, relativeFilePath) {
      const parts = String(relativeFilePath || "").replace(/\\/g, "/").split("/").slice(0, -1);
      let current = normalizePath(rootPath);
      await ensureDirectory(current);
      for (const part of parts) {
        current = joinPath(current, part);
        await ensureDirectory(current);
      }
    }

    function quoteArgumentFilePath(path) {
      return `"${normalizePath(path).replace(/"/g, '\\"')}"`;
    }

    function quoteShellArgument(value, osName = deps.osName || global.NL_OS) {
      const text = normalizePath(value);
      if (osName && osName !== "Windows") return `'${text.replace(/'/g, "'\\''")}'`;
      return `"${text.replace(/"/g, '\\"')}"`;
    }

    async function createSourceArgumentFiles(sourceRoots) {
      const tempRoot = normalizePath(await Neutralino.os.getPath("temp"));
      const tempPath = joinPath(tempRoot, `md-editor-java-build-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await ensureDirectory(tempPath);
      const preparedRoots = [];
      for (let index = 0; index < sourceRoots.length; index += 1) {
        const sourceRoot = sourceRoots[index];
        const argumentFile = joinPath(tempPath, `${String(index + 1).padStart(2, "0")}-${getName(sourceRoot.path).replace(/[^a-z0-9._-]/gi, "-")}.sources`);
        await Neutralino.filesystem.writeFile(argumentFile, sourceRoot.files.map(quoteArgumentFilePath).join("\n") + "\n");
        preparedRoots.push(Object.assign({}, sourceRoot, { argumentFile }));
      }
      return { tempPath, sourceRoots: preparedRoots };
    }

    async function prepareClasspathEntries(classpathEntries, tempPath) {
      const prepared = [];
      let zipIndex = 0;
      for (const entry of classpathEntries || []) {
        const path = normalizePath(entry);
        if (!path) continue;
        if (!/\.zip$/i.test(path)) {
          prepared.push(path);
          continue;
        }
        zipIndex += 1;
        const extractionPath = joinPath(tempPath, `classpath-zip-${String(zipIndex).padStart(2, "0")}`);
        await ensureDirectory(extractionPath);
        const result = await Neutralino.os.execCommand(`jar -xf ${quoteShellArgument(path)}`, { cwd: extractionPath });
        if (Number(result?.exitCode) !== 0) {
          throw new Error(result?.stdErr || result?.stdOut || `Unable to extract classpath ZIP: ${path}`);
        }
        prepared.push(extractionPath, ...await collectJarFiles(extractionPath));
      }
      return prepared;
    }

    function buildJavacCommand(options = {}) {
      const osName = options.osName || deps.osName || global.NL_OS;
      const parts = [options.javacExecutable ? quoteShellArgument(options.javacExecutable, osName) : "javac"];
      const classpath = (options.classpathEntries || []).map(normalizePath).filter(Boolean);
      if (classpath.length) {
        parts.push("-classpath", quoteShellArgument(classpath.join(osName === "Windows" ? ";" : ":"), osName));
      }
      if (options.outputMode === "classes" && options.outputPath) {
        parts.push("-d", quoteShellArgument(options.outputPath, osName));
      }
      for (const sourceRoot of options.sourceRoots || []) {
        parts.push(`@${quoteShellArgument(sourceRoot.argumentFile, osName)}`);
      }
      return parts.join(" ");
    }

    async function removeClassFiles(folderPath) {
      if (!await pathExists(folderPath, "directory")) return 0;
      let removed = 0;
      const entries = await Neutralino.filesystem.readDirectory(folderPath);
      for (const entry of entries || []) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        const fullPath = joinPath(folderPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          removed += await removeClassFiles(fullPath);
        } else if (/\.class$/i.test(name)) {
          await Neutralino.filesystem.remove(fullPath);
          removed += 1;
        }
      }
      return removed;
    }

    /** Remove an exact set of owned class files, ignoring already-missing outputs. */
    async function removeFiles(paths) {
      for (const path of Array.from(new Set((paths || []).map(normalizePath).filter(Boolean)))) {
        try { await Neutralino.filesystem.remove(path); } catch (_error) {}
      }
    }

    function getRelativeSourcePath(sourceRootPath, sourceFilePath) {
      const root = normalizePath(sourceRootPath);
      const file = normalizePath(sourceFilePath);
      return file.slice(root.length).replace(/^\/+/, "");
    }

    function findSourceExportCollisions(sourceRoots) {
      const destinations = new Map();
      const collisions = [];
      for (const root of sourceRoots || []) {
        for (const file of root.files || []) {
          const relativePath = getRelativeSourcePath(root.path, file).toLowerCase();
          if (destinations.has(relativePath) && destinations.get(relativePath) !== file) collisions.push(relativePath);
          destinations.set(relativePath, file);
        }
      }
      return Array.from(new Set(collisions));
    }

    async function exportSources(sourceRoots, outputPath) {
      let copied = 0;
      for (const root of sourceRoots || []) {
        for (const file of root.files || []) {
          const relativePath = getRelativeSourcePath(root.path, file);
          await ensureRelativeDirectories(outputPath, relativePath);
          await Neutralino.filesystem.writeFile(joinPath(outputPath, relativePath), await Neutralino.filesystem.readFile(file));
          copied += 1;
        }
      }
      return copied;
    }

    function parseJavacDiagnostics(output) {
      const lines = String(output || "").split(/\r?\n/);
      const diagnostics = [];
      for (let index = 0; index < lines.length; index += 1) {
        const match = lines[index].match(/^(.*\.java):(\d+):\s+(error|warning):\s+(.+)$/i);
        if (!match) {
          const projectMatch = lines[index].match(/^(error|warning):\s+(.+)$/i);
          if (projectMatch) diagnostics.push({
            severity: projectMatch[1].toLowerCase(),
            message: projectMatch[2].trim(),
            filePath: "",
            line: 1,
            column: 1,
            source: "javac"
          });
          continue;
        }
        let column = 1;
        if (index + 2 < lines.length && /\^/.test(lines[index + 2])) column = Math.max(1, lines[index + 2].indexOf("^") + 1);
        diagnostics.push({
          severity: match[3].toLowerCase(),
          message: match[4].trim(),
          filePath: normalizePath(match[1]),
          line: Number(match[2]) || 1,
          column,
          source: "javac"
        });
      }
      return diagnostics;
    }

    async function removeTemporaryFolder(tempPath) {
      if (!tempPath || !await pathExists(tempPath, "directory")) return;
      await Neutralino.filesystem.remove(tempPath);
    }

    const api = {
      buildJavacCommand,
      collectJavaFiles,
      createSourceArgumentFiles,
      exportSources,
      findSourceExportCollisions,
      joinPath,
      normalizePath,
      parseJavacDiagnostics,
      pathExists,
      prepareClasspathEntries,
      removeClassFiles,
      removeFiles,
      removeTemporaryFolder,
      resolveStoredPath(projectPath, storedPath) {
        return /^[a-zA-Z]:\//.test(normalizePath(storedPath)) || normalizePath(storedPath).startsWith("/")
          ? normalizePath(storedPath)
          : joinPath(projectPath, storedPath === "." ? "" : storedPath);
      }
    };
    app.registerModule?.("javaCompiler", api);
    return api;
  }

  global.registerMarkdownViewerJavaCompiler = registerMarkdownViewerJavaCompiler;
})(typeof window !== "undefined" ? window : globalThis);
