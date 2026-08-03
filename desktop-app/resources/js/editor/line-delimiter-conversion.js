(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.registerMarkdownViewerLineDelimiterConversion = api.registerMarkdownViewerLineDelimiterConversion;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  /** Owns line-delimiter target discovery and file conversion. */
  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function normalizeComparablePath(path) {
    return normalizePath(path).toLowerCase();
  }

  /** Parse editor-style extension filters into normalized extensions. */
  function parseExtensionPatterns(value) {
    const seen = new Set();
    return String(value || "")
      .split(/[\s,;]+/)
      .map((part) => part.trim().toLowerCase().replace(/^\*+/, "").replace(/^\./, ""))
      .filter((part) => part && !part.includes("/") && !part.includes("\\") && !part.includes("*"))
      .filter((part) => {
        if (seen.has(part)) return false;
        seen.add(part);
        return true;
      });
  }

  function getFileExtension(path) {
    const name = normalizePath(path).split("/").pop() || "";
    const dotIndex = name.lastIndexOf(".");
    return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
  }

  function isPathInsideFolder(path, folderPath) {
    const candidate = normalizeComparablePath(path);
    const folder = normalizeComparablePath(folderPath);
    return !!candidate && !!folder && (candidate === folder || candidate.startsWith(folder + "/"));
  }

  /** Convert every recognized line separator while preserving final-newline presence. */
  function convertLineDelimiters(content, delimiter) {
    const source = String(content == null ? "" : content);
    const target = delimiter === "\r\n" ? "\r\n" : "\n";
    return source.replace(/\r\n|\r|\n/g, target);
  }

  function isBinaryContent(content) {
    return String(content || "").includes("\0");
  }

  function relativeToWorkspace(path, workspacePath) {
    const candidate = normalizePath(path);
    const workspace = normalizePath(workspacePath);
    return candidate.slice(workspace.length).replace(/^\/+/, "");
  }

  async function readDirectoryEntries(filesystem, folderPath) {
    const entries = await filesystem.readDirectory(folderPath);
    return Array.isArray(entries) ? entries : [];
  }

  function getEntryDetails(entry) {
    const name = entry?.entry || entry?.name || "";
    const type = String(entry?.type || "").toUpperCase();
    return {
      name,
      isDirectory: type === "DIRECTORY" || entry?.isDirectory === true,
      isFile: type === "FILE" || entry?.isFile === true
    };
  }

  async function collectFolderPaths(filesystem, rootPath) {
    const folders = [normalizePath(rootPath)];
    async function visit(folderPath) {
      const entries = await readDirectoryEntries(filesystem, folderPath);
      for (const entry of entries) {
        const details = getEntryDetails(entry);
        if (!details.name || details.name === "." || details.name === ".." || details.name === ".md-editor") continue;
        if (!details.isDirectory) continue;
        const childPath = `${normalizePath(folderPath)}/${details.name}`;
        folders.push(childPath);
        await visit(childPath);
      }
    }
    await visit(normalizePath(rootPath));
    return folders.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }

  async function collectChildFolderPaths(filesystem, folderPath) {
    const folders = [];
    const normalizedFolderPath = normalizePath(folderPath);
    const entries = await readDirectoryEntries(filesystem, normalizedFolderPath);
    for (const entry of entries) {
      const details = getEntryDetails(entry);
      if (!details.name || details.name === "." || details.name === ".." || details.name === ".md-editor") continue;
      if (details.isDirectory) folders.push(`${normalizedFolderPath}/${details.name}`);
    }
    return folders.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }

  async function collectFilePaths(filesystem, folderPath, includeSubfolders) {
    const files = [];
    async function visit(currentPath) {
      const entries = await readDirectoryEntries(filesystem, currentPath);
      for (const entry of entries) {
        const details = getEntryDetails(entry);
        if (!details.name || details.name === "." || details.name === ".." || details.name === ".md-editor") continue;
        const childPath = `${normalizePath(currentPath)}/${details.name}`;
        if (details.isDirectory && includeSubfolders) await visit(childPath);
        else if (details.isFile) files.push(childPath);
      }
    }
    await visit(normalizePath(folderPath));
    return files;
  }

  /** Register the conversion service with the application module system. */
  function registerMarkdownViewerLineDelimiterConversion(app, deps) {
    const filesystem = deps.filesystem;

    async function collectPlan(options) {
      const workspacePath = normalizePath(options.workspacePath);
      const targetFolderPath = normalizePath(options.folderPath || workspacePath);
      if (!workspacePath || !isPathInsideFolder(targetFolderPath, workspacePath)) {
        throw new Error("The selected folder must be inside the current workspace.");
      }
      const extensions = Array.isArray(options.extensions) ? options.extensions : parseExtensionPatterns(options.extensions);
      if (!extensions.length) throw new Error("Enter at least one file extension.");
      const extensionSet = new Set(extensions.map((extension) => String(extension).toLowerCase()));
      const sourcePaths = options.currentFilePath
        ? [normalizePath(options.currentFilePath)]
        : await collectFilePaths(filesystem, targetFolderPath, options.includeSubfolders !== false);
      const entries = [];
      const skipped = [];
      for (const absolutePath of sourcePaths) {
        if (!isPathInsideFolder(absolutePath, targetFolderPath)) continue;
        if (!extensionSet.has(getFileExtension(absolutePath))) continue;
        try {
          const liveContent = await options.getOpenFileContent?.(absolutePath);
          const content = liveContent == null ? await filesystem.readFile(absolutePath) : liveContent;
          if (isBinaryContent(content)) {
            skipped.push({ absolutePath, reason: "binary" });
            continue;
          }
          const convertedContent = convertLineDelimiters(content, options.delimiter);
          if (convertedContent === content) continue;
          entries.push({
            absolutePath: normalizePath(absolutePath),
            relativePath: relativeToWorkspace(absolutePath, workspacePath),
            convertedContent
          });
        } catch (error) {
          skipped.push({ absolutePath: normalizePath(absolutePath), reason: "unreadable", error });
        }
      }
      entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: "base" }));
      return { workspacePath, folderPath: targetFolderPath, delimiter: options.delimiter, entries, skipped };
    }

    async function applyPlan(plan, selectedPaths) {
      const selected = new Set(Array.from(selectedPaths || []).map(normalizeComparablePath));
      const result = { converted: [], skipped: [], failed: [] };
      for (const entry of plan.entries || []) {
        if (!selected.has(normalizeComparablePath(entry.absolutePath))) {
          result.skipped.push(entry);
          continue;
        }
        if (!isPathInsideFolder(entry.absolutePath, plan.folderPath) || !isPathInsideFolder(entry.absolutePath, plan.workspacePath)) {
          result.failed.push({ entry, error: new Error("File is outside the selected workspace folder.") });
          continue;
        }
        try {
          await filesystem.writeFile(entry.absolutePath, entry.convertedContent);
          result.converted.push(entry);
        } catch (error) {
          result.failed.push({ entry, error });
        }
      }
      return result;
    }

    const api = {
      collectFolderPaths: (rootPath) => collectFolderPaths(filesystem, rootPath),
      collectChildFolderPaths: (folderPath) => collectChildFolderPaths(filesystem, folderPath),
      collectPlan,
      applyPlan
    };
    app.services.lineDelimiterConversion = api;
    app.registerModule?.("lineDelimiterConversion", api);
    return api;
  }

  return {
    registerMarkdownViewerLineDelimiterConversion,
    parseExtensionPatterns,
    convertLineDelimiters,
    isPathInsideFolder,
    collectChildFolderPaths,
    collectFilePaths
  };
});
