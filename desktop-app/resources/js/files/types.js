(function(window) {
  window.registerMarkdownViewerFileTypes = function registerMarkdownViewerFileTypes(app, deps) {
    const GRAPH_DOCUMENT_TYPES = new Set(["graph-view", "graph-export"]);
    const languageRegistry = deps.languageRegistry || null;

    with (deps) {
  function getMarkdownTitleFromFileName(fileName) {
    return (fileName || "document.md").replace(/\.(md|markdown|mermaid)$/i, "");
  }

  function isGraphFilePath(path) {
    return /\.(mdviewer-graph\.json|mdgraph\.json)$/i.test(path || "");
  }

  function isJsonPath(path) {
    return /\.json$/i.test(path || "");
  }

  function isPotentialGraphFilePath(path) {
    return isGraphFilePath(path) || isJsonPath(path);
  }

  function getFileExtension(path) {
    const match = String(path || "").toLowerCase().match(/\.([a-z0-9+_-]+)$/i);
    return match ? match[1] : "";
  }

  function isKnownTextFilePath(path) {
    if (languageRegistry?.isSupportedLanguagePath(path)) return true;
    const extension = getFileExtension(path);
    if (!extension) {
      return /(^|[\/])(dockerfile|makefile|rakefile|gemfile|license|readme|changelog|authors|contributors)$/i.test(path || "");
    }
    return new Set([
      "txt", "text", "md", "markdown", "mermaid", "drawio", "json", "jsonc", "js", "jsx", "ts", "tsx", "mjs", "cjs",
      "css", "scss", "sass", "less", "html", "htm", "xml", "svg", "csv", "tsv", "yaml", "yml",
      "toml", "ini", "conf", "config", "env", "properties", "java", "c", "h", "cpp", "hpp", "cc",
      "cs", "go", "rs", "py", "rb", "php", "swift", "kt", "kts", "sh", "bash", "zsh", "fish",
      "bat", "cmd", "ps1", "sql", "r", "lua", "pl", "pm", "scala", "clj", "ex", "exs", "erl",
      "hrl", "fs", "fsx", "vb", "dockerfile", "gitignore", "gitattributes", "editorconfig", "log"
    ]).has(extension) || /(^|[\/])(dockerfile|makefile|rakefile|gemfile|license|readme|changelog|authors|contributors)$/i.test(path || "");
  }

  function isTextFileLike(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    return type.startsWith("text/")
      || type === "application/json"
      || type === "application/xml"
      || type === "application/javascript"
      || type === "application/x-javascript"
      || isKnownTextFilePath(file.name || file.path);
  }

  function isTextDocumentPath(path) {
    return isMarkdownPath(path) || isPotentialGraphFilePath(path) || isKnownTextFilePath(path);
  }

  function isSidebarDocumentPath(path) {
    return isTextDocumentPath(path);
  }

  function isSidebarDocumentNode(node) {
    return !!(node && (isSidebarDocumentPath(node.name || node.path || node.fullPath) || isTextFileLike(node.file)));
  }

  function isSupportedFolderTreeDocumentPath(path) {
    return isMarkdownPath(path) || isMermaidPath(path) || isGraphFilePath(path) || /\.drawio$/i.test(path || "") || languageRegistry?.isSupportedLanguagePath(path) === true;
  }

  function isSupportedFolderTreeDocumentNode(node) {
    return !!(node && node.kind === "file" && (
      isSupportedFolderTreeDocumentPath(node.name || node.path || node.fullPath)
      || node.isGraphDocumentFile === true
    ));
  }

  async function fileContainsGraphDocument(file) {
    if (!file || !isJsonPath(file.name || file.path)) return false;
    try {
      return looksLikeGraphDocument(JSON.parse(await file.text()));
    } catch (_) {
      return false;
    }
  }

  async function neutralinoPathContainsGraphDocument(filePath) {
    if (!isJsonPath(filePath)) return false;
    try {
      return looksLikeGraphDocument(JSON.parse(await Neutralino.filesystem.readFile(filePath)));
    } catch (_) {
      return false;
    }
  }

  function looksLikeGraphDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) return false;
    const documentType = typeof document.documentType === "string" ? document.documentType : document.type;
    if (GRAPH_DOCUMENT_TYPES.has(documentType)) return true;
    return Object.prototype.hasOwnProperty.call(document, "snapshot")
      || Object.prototype.hasOwnProperty.call(document, "graphSnapshot")
      || Object.prototype.hasOwnProperty.call(document, "viewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphViewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphLayout")
      || Object.prototype.hasOwnProperty.call(document, "layout")
      || (Object.prototype.hasOwnProperty.call(document, "schemaVersion") && Object.prototype.hasOwnProperty.call(document, "folderName"));
  }

  function isFirefoxBrowser() {
    return /firefox\//i.test(navigator.userAgent || "");
  }

  function sanitizeMarkdownFileName(fileName) {
    const fallback = "document";
    let cleaned = String(fileName || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
    cleaned = cleaned.replace(/^\.+$/, "") || fallback;
    if (!/\.(md|markdown)$/i.test(cleaned)) {
      cleaned += ".md";
    }
    return cleaned;
  }

  function sanitizeDocumentFileName(fileName) {
    const fallback = "document.md";
    let cleaned = String(fileName || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
    cleaned = cleaned.replace(/^\.+$/, "") || fallback;
    if (!getFileExtension(cleaned)) cleaned += ".md";
    return cleaned;
  }

  function getSuggestedMarkdownFileName(tab) {
    return sanitizeMarkdownFileName((tab && tab.title) || "document");
  }

  function getSuggestedDocumentFileName(tab) {
    const sourceName = tab?.sourceFileName
      || (tab?.sourceFilePath ? getFileName(tab.sourceFilePath) : "")
      || tab?.sourceFileHandle?.name
      || tab?.title
      || "document.md";
    return sanitizeDocumentFileName(sourceName);
  }

  function joinPath(dirPath, fileName) {
    if (!dirPath) return fileName;
    return dirPath.replace(/[\\/]+$/, "") + "/" + fileName;
  }

  function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(path || "");
  }

  /** Return whether a path represents a standalone Mermaid diagram source file. */
  function isMermaidPath(path) {
    return /\.mermaid$/i.test(path || "");
  }

  function getFileName(path) {
    return (path || "").split(/[\\/]/).pop() || "document.md";
  }

  const api = {
    getMarkdownTitleFromFileName,
    isGraphFilePath,
    isJsonPath,
    isPotentialGraphFilePath,
    getFileExtension,
    isKnownTextFilePath,
    isTextFileLike,
    isTextDocumentPath,
    isSidebarDocumentPath,
    isSidebarDocumentNode,
    isSupportedFolderTreeDocumentPath,
    isSupportedFolderTreeDocumentNode,
    fileContainsGraphDocument,
    neutralinoPathContainsGraphDocument,
    looksLikeGraphDocument,
    isFirefoxBrowser,
    sanitizeMarkdownFileName,
    sanitizeDocumentFileName,
    getSuggestedMarkdownFileName,
    getSuggestedDocumentFileName,
    joinPath,
    isMarkdownPath,
    isMermaidPath,
    getFileName
  };

  app.registerModule("fileTypes", api);
  return api;
    }
  };
})(window);
