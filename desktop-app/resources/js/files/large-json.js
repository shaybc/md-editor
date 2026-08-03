(function(window) {
  window.registerMarkdownViewerLargeJsonOpen = function registerMarkdownViewerLargeJsonOpen(app, deps) {
    const api = {};

    with (deps) {
  const LARGE_JSON_SAFE_OPEN_BYTES = 5 * 1024 * 1024;
  const LARGE_JSON_SAFE_OPEN_LINE_CHARS = 200000;

  function getLongestLineLength(content, limit) {
    const text = String(content || "");
    let currentLength = 0;
    let longestLength = 0;
    for (let index = 0; index < text.length; index += 1) {
      const char = text.charAt(index);
      if (char === "\n" || char === "\r") {
        if (currentLength > longestLength) longestLength = currentLength;
        currentLength = 0;
        if (longestLength > limit) return longestLength;
        if (char === "\r" && text.charAt(index + 1) === "\n") index += 1;
      } else {
        currentLength += 1;
        if (currentLength > limit) return currentLength;
      }
    }
    return Math.max(longestLength, currentLength);
  }

  function shouldOpenJsonInSafeView(content) {
    const text = String(content || "");
    return text.length > LARGE_JSON_SAFE_OPEN_BYTES
      || getLongestLineLength(text, LARGE_JSON_SAFE_OPEN_LINE_CHARS) > LARGE_JSON_SAFE_OPEN_LINE_CHARS;
  }

  function getSourceName(sourceFile, name) {
    return name
      || sourceFile?.name
      || (sourceFile?.path ? getFileName(sourceFile.path) : "")
      || sourceFile?.file?.name
      || sourceFile?.handle?.name
      || "document.json";
  }

  function getSourcePath(sourceFile, name) {
    return sourceFile?.path || sourceFile?.file?.webkitRelativePath || name || "";
  }

  function getFormattedJsonCopyName(name) {
    return String(name || "document.json").replace(/\.json$/i, "") + ".formatted.json";
  }

  function getLargeFileViewMetadata(sourceFile, name, content, reason) {
    return {
      kind: "json",
      transformedForViewing: true,
      originalName: name,
      originalPath: sourceFile?.path || null,
      originalSize: String(content || "").length,
      suggestedSaveName: getFormattedJsonCopyName(name),
      reason
    };
  }

  function createParseErrorContent(name, error) {
    return [
      "# Large JSON file was not opened raw",
      "",
      `${name} is large enough to risk freezing or crashing the editor if opened as a single line.`,
      "",
      "MD-Editor tried to format it for safe viewing, but JSON parsing failed.",
      "",
      "```text",
      String(error?.message || error || "Invalid JSON"),
      "```"
    ].join("\n");
  }

  function prepareLargeJsonForOpen(sourceFile, name, content, parsedJson) {
    const sourceName = getSourceName(sourceFile, name);
    const sourcePath = getSourcePath(sourceFile, sourceName);
    if (!isJsonPath(sourcePath || sourceName) || !shouldOpenJsonInSafeView(content)) return null;

    try {
      const parsed = parsedJson !== undefined ? parsedJson : JSON.parse(content);
      return {
        ...(sourceFile || {}),
        name: sourceName,
        content: JSON.stringify(parsed, null, 2),
        largeFileView: getLargeFileViewMetadata(sourceFile, sourceName, content, "large-json")
      };
    } catch (error) {
      return {
        ...(sourceFile || {}),
        name: sourceName,
        content: createParseErrorContent(sourceName, error),
        largeFileView: {
          ...getLargeFileViewMetadata(sourceFile, sourceName, content, "large-json-parse-error"),
          parseError: true
        }
      };
    }
  }

  Object.assign(api, {
    LARGE_JSON_SAFE_OPEN_BYTES,
    LARGE_JSON_SAFE_OPEN_LINE_CHARS,
    getLongestLineLength,
    shouldOpenJsonInSafeView,
    getFormattedJsonCopyName,
    prepareLargeJsonForOpen
  });
    }

    app.services.largeJsonOpen = api;
    app.registerModule("largeJsonOpen", api);
    return api;
  };
})(window);
