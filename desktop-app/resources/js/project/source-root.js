(function(global) {
  global.registerMarkdownViewerSourceRoot = function registerMarkdownViewerSourceRoot(app, deps) {
    const api = {};

    with (deps) {
    const MD_EDITOR_DIR = ".md-editor";
    const MD_EDITOR_RECOVERY_DIR = "recovery";
    const PROJECT_METADATA_FILE = "_md_editor_project.json";
    let metadataCacheFolderPath = "";
    let metadataCache = null;
    let metadataCacheLoaded = false;

    function normalizeLocalPath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function isAbsolutePath(value) {
      if (typeof isAbsoluteFilesystemPath === "function") {
        return isAbsoluteFilesystemPath(value);
      }
      const path = String(value || "");
      return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.startsWith("/");
    }

    function joinLocalPath(folderPath, relativePath) {
      if (typeof joinPath === "function") return joinPath(folderPath, relativePath);
      return normalizeLocalPath(folderPath).replace(/\/+$/, "") + "/" + normalizeLocalPath(relativePath).replace(/^\/+/, "");
    }

    function getActiveGeneratedFolderPath() {
      return normalizeLocalPath(activeFolderPath || "");
    }

    function dirnameLocalPath(path) {
      const normalized = normalizeLocalPath(path).replace(/\/+$/, "");
      if (!normalized) return "";
      const slashIndex = normalized.lastIndexOf("/");
      if (slashIndex <= 0) {
        return /^[a-zA-Z]:$/.test(normalized.slice(0, slashIndex)) ? normalized.slice(0, slashIndex + 1) : "";
      }
      return normalized.slice(0, slashIndex);
    }

    function getProjectMetadataPath(folderPath = getActiveGeneratedFolderPath()) {
      const root = normalizeLocalPath(folderPath);
      return root ? joinLocalPath(joinLocalPath(root, MD_EDITOR_DIR), PROJECT_METADATA_FILE) : "";
    }

    function normalizeComparablePath(value) {
      const normalized = normalizeLocalPath(value).replace(/\/+$/, "");
      return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
    }

    function getGeneratedMarkdownRootPath(metadata) {
      return normalizeLocalPath(metadata?.generatedMarkdownRootPath || "");
    }

    async function loadCodeProjectMetadata(codeProjectRoot) {
      const metadataPath = getProjectMetadataPath(codeProjectRoot);
      if (!metadataPath || !isNeutralinoRuntime?.() || !Neutralino?.filesystem?.readFile) return {};
      try {
        const parsed = JSON.parse(await Neutralino.filesystem.readFile(metadataPath));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (error) {
        if (await localPathExists(metadataPath)) throw error;
        return {};
      }
    }

    async function linkCodeProjectToGeneratedMarkdown(codeProjectRoot, generatedMarkdownRoot, options = {}) {
      const normalizedCodeProjectRoot = normalizeLocalPath(codeProjectRoot);
      const normalizedMarkdownRoot = normalizeLocalPath(generatedMarkdownRoot);
      if (!normalizedCodeProjectRoot) throw new Error("No source code project root was provided.");
      if (!normalizedMarkdownRoot) throw new Error("No generated Markdown project root was provided.");
      if (!isNeutralinoRuntime?.() || !Neutralino?.filesystem?.writeFile) {
        throw new Error("Linking generated Markdown projects is available only in the desktop app.");
      }

      const previous = await loadCodeProjectMetadata(normalizedCodeProjectRoot);
      const existingRoot = getGeneratedMarkdownRootPath(previous);
      const pointsToGeneratedRoot = normalizeComparablePath(existingRoot) === normalizeComparablePath(normalizedMarkdownRoot);
      if (existingRoot && !pointsToGeneratedRoot) {
        const shouldReplace = typeof options.confirmReplace === "function"
          ? await options.confirmReplace({ existingRoot, generatedMarkdownRoot: normalizedMarkdownRoot })
          : false;
        if (!shouldReplace) {
          return { status: "kept-existing", metadata: previous, generatedMarkdownRootPath: existingRoot };
        }
      }
      if (pointsToGeneratedRoot) {
        return { status: "unchanged", metadata: previous, generatedMarkdownRootPath: existingRoot };
      }

      const now = new Date().toISOString();
      const next = Object.assign({}, previous, {
        schemaVersion: Math.max(1, Number(previous.schemaVersion) || 1),
        type: previous.type || "md-editor-code-project",
        generatedMarkdownRootPath: normalizedMarkdownRoot,
        createdAt: previous.createdAt || now,
        updatedAt: now
      });
      const metadataDirectory = joinLocalPath(normalizedCodeProjectRoot, MD_EDITOR_DIR);
      try {
        await Neutralino.filesystem.createDirectory?.(metadataDirectory);
      } catch (_error) {
        // Directory creation is best-effort because some Neutralino versions fail if it already exists.
      }
      await Neutralino.filesystem.writeFile(getProjectMetadataPath(normalizedCodeProjectRoot), JSON.stringify(next, null, 2) + "\n");
      return { status: existingRoot ? "replaced" : "created", metadata: next, generatedMarkdownRootPath: normalizedMarkdownRoot };
    }

    async function ensureProjectMetadataDirectory(folderPath = getActiveGeneratedFolderPath()) {
      if (!folderPath || !isNeutralinoRuntime?.() || !Neutralino?.filesystem?.createDirectory) return;
      const metadataDir = joinLocalPath(folderPath, MD_EDITOR_DIR);
      try {
        await Neutralino.filesystem.createDirectory(metadataDir);
      } catch (_error) {
        // Directory creation is best-effort because some Neutralino versions fail if it already exists.
      }
      try {
        await Neutralino.filesystem.createDirectory(joinLocalPath(metadataDir, MD_EDITOR_RECOVERY_DIR));
      } catch (_error) {
        // Directory creation is best-effort because some Neutralino versions fail if it already exists.
      }
    }

    async function localPathExists(path) {
      if (!path || !isNeutralinoRuntime?.() || !Neutralino?.filesystem?.getStats) return false;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function findGeneratedProjectFolderFromPath(seedPath) {
      if (!seedPath || !isNeutralinoRuntime?.() || !Neutralino?.filesystem?.getStats) return "";
      let folder = normalizeLocalPath(seedPath);
      const seen = new Set();
      while (folder && !seen.has(folder)) {
        seen.add(folder);
        if (await localPathExists(getProjectMetadataPath(folder))) return folder;
        const parent = dirnameLocalPath(folder);
        if (!parent || parent === folder) break;
        folder = parent;
      }
      return "";
    }

    function normalizeSourceRootMetadata(value) {
      if (!value || typeof value !== "object") return null;
      const sourceRootPath = normalizeLocalPath(value.sourceRootPath);
      return {
        schemaVersion: Number(value.schemaVersion) || 1,
        type: value.type || "md-editor-generated-code-folder",
        sourceRootPath,
        sourcePathMode: value.sourcePathMode || "relative-to-source-root",
        createdAt: value.createdAt || "",
        updatedAt: value.updatedAt || ""
      };
    }

    async function loadSourceRootMetadata(options = {}) {
      const folderPath = getActiveGeneratedFolderPath();
      if (!folderPath || !isNeutralinoRuntime?.() || !Neutralino?.filesystem?.readFile) {
        metadataCacheFolderPath = folderPath;
        metadataCache = null;
        metadataCacheLoaded = true;
        return null;
      }
      if (!options.force && metadataCacheLoaded && metadataCacheFolderPath === folderPath) return metadataCache;
      metadataCacheFolderPath = folderPath;
      metadataCacheLoaded = true;
      try {
        const raw = await Neutralino.filesystem.readFile(getProjectMetadataPath(folderPath));
        metadataCache = normalizeSourceRootMetadata(JSON.parse(raw));
      } catch (error) {
        metadataCache = null;
      }
      return metadataCache;
    }

    function getCachedSourceRootMetadata() {
      return metadataCacheFolderPath === getActiveGeneratedFolderPath() ? metadataCache : null;
    }

    async function saveSourceRootMetadata(sourceRootPath) {
      const folderPath = getActiveGeneratedFolderPath();
      const normalizedSourceRoot = normalizeLocalPath(sourceRootPath);
      if (!folderPath) throw new Error("No generated Markdown folder is open.");
      if (!normalizedSourceRoot) throw new Error("No original source root was selected.");
      if (!isNeutralinoRuntime?.() || !Neutralino?.filesystem?.writeFile) {
        throw new Error("Saving source roots is available only in the desktop app.");
      }
      const now = new Date().toISOString();
      const previous = await loadSourceRootMetadata({ force: true });
      const next = {
        schemaVersion: 1,
        type: "md-editor-generated-code-folder",
        sourceRootPath: normalizedSourceRoot,
        sourcePathMode: "relative-to-source-root",
        createdAt: previous?.createdAt || now,
        updatedAt: now
      };
      await ensureProjectMetadataDirectory(folderPath);
      await Neutralino.filesystem.writeFile(getProjectMetadataPath(folderPath), JSON.stringify(next, null, 2) + "\n");
      metadataCacheFolderPath = folderPath;
      metadataCache = next;
      metadataCacheLoaded = true;
      return next;
    }

    function clearSourceRootMetadataCache() {
      metadataCacheFolderPath = "";
      metadataCache = null;
      metadataCacheLoaded = false;
    }

    async function resolveOriginalSourcePath(sourcePath, options = {}) {
      const rawPath = normalizeLocalPath(sourcePath);
      if (!rawPath || isAbsolutePath(rawPath)) {
        return { rawPath, resolvedPath: rawPath, metadata: getCachedSourceRootMetadata(), needsSourceRoot: false };
      }
      const metadata = await loadSourceRootMetadata();
      if (metadata?.sourceRootPath) {
        return {
          rawPath,
          resolvedPath: joinLocalPath(metadata.sourceRootPath, rawPath),
          metadata,
          needsSourceRoot: false
        };
      }
      if (options.prompt !== false && typeof promptForSourceRoot === "function") {
        const nextMetadata = await promptForSourceRoot({ reason: "resolve-original-source" });
        if (nextMetadata?.sourceRootPath) {
          return {
            rawPath,
            resolvedPath: joinLocalPath(nextMetadata.sourceRootPath, rawPath),
            metadata: nextMetadata,
            needsSourceRoot: false
          };
        }
      }
      return { rawPath, resolvedPath: "", metadata: null, needsSourceRoot: true };
    }

    function getOriginalSourceRootPath() {
      return getCachedSourceRootMetadata()?.sourceRootPath || "";
    }

    async function chooseSourceRootFolder(defaultPath = "") {
      if (!isNeutralinoRuntime?.() || !Neutralino?.os?.showFolderDialog) {
        alert("Setting the original source root is available only in the desktop app.");
        return "";
      }
      return normalizeLocalPath(await Neutralino.os.showFolderDialog(
        "Select original source root folder",
        defaultPath ? { defaultPath } : undefined
      ));
    }

    async function promptForSourceRoot(options = {}) {
      const current = getOriginalSourceRootPath();
      const selected = await chooseSourceRootFolder(current);
      if (!selected) return null;
      const metadata = await saveSourceRootMetadata(selected);
      if (typeof onSourceRootChanged === "function") {
        await onSourceRootChanged(metadata, options);
      }
      return metadata;
    }

      Object.assign(api, {
        PROJECT_METADATA_FILE,
        MD_EDITOR_DIR,
        MD_EDITOR_RECOVERY_DIR,
        clearSourceRootMetadataCache,
        chooseSourceRootFolder,
        dirnameLocalPath,
        ensureProjectMetadataDirectory,
        findGeneratedProjectFolderFromPath,
        getActiveGeneratedFolderPath,
        getCachedSourceRootMetadata,
        getGeneratedMarkdownRootPath,
        getOriginalSourceRootPath,
        getProjectMetadataPath,
        isAbsolutePath,
        joinLocalPath,
        loadSourceRootMetadata,
        loadCodeProjectMetadata,
        linkCodeProjectToGeneratedMarkdown,
        normalizeLocalPath,
        normalizeSourceRootMetadata,
        promptForSourceRoot,
        resolveOriginalSourcePath,
        saveSourceRootMetadata
      });
    }

    app.registerModule?.("sourceRoot", api);
    return api;
  };
})(window);
