// Generate Java source replacements, a ResourceBundle accessor, and properties entries.
(function(global) {
  "use strict";

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function parsePropertyEntries(content) {
    const entries = new Map();
    String(content || "").split(/\r?\n/).forEach((line) => {
      if (!line || /^\s*[#!]/.test(line)) return;
      const match = line.match(/^\s*([^:=\s]+)\s*[:=]\s*(.*)$/);
      if (match) entries.set(match[1], match[2]);
    });
    return entries;
  }

  function escapePropertyValue(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/^([ #!:])/g, "\\$1");
  }

  function addNonNlsMarkers(source, markerIndexesByLine) {
    const lines = String(source || "").split("\n");
    markerIndexesByLine.forEach((indexes, lineNumber) => {
      if (lineNumber < 0 || lineNumber >= lines.length) return;
      const existing = new Set(Array.from(lines[lineNumber].matchAll(/\$NON-NLS-(\d+)\$/g), (match) => Number(match[1])));
      indexes.forEach((index) => existing.add(index));
      const missing = Array.from(existing).sort((left, right) => left - right)
        .filter((index) => !lines[lineNumber].includes("$NON-NLS-" + index + "$"));
      if (!missing.length) return;
      const tags = missing.map((index) => "$NON-NLS-" + index + "$").join(" ");
      lines[lineNumber] += lines[lineNumber].includes("//") ? " " + tags : " //$" + tags.slice(1);
    });
    return lines.join("\n");
  }

  function getLineStartOffsets(source) {
    const offsets = [0];
    const value = String(source || '');
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === '\n') offsets.push(index + 1);
    }
    return offsets;
  }

  /** Locate generated accessor calls in the final source without changing generation output. */
  function createSourceReplacementHighlights(source, generatedSource, replacements) {
    const originalLineStarts = getLineStartOffsets(source);
    const generatedLineStarts = getLineStartOffsets(generatedSource);
    const changedCharactersByLine = new Map();
    return replacements.map(({ literal, replacement }) => {
      const lineNumber = Number(literal.lineNumber) || 0;
      const changedCharacters = changedCharactersByLine.get(lineNumber) || 0;
      const originalLineStart = originalLineStarts[lineNumber] || 0;
      const generatedLineStart = generatedLineStarts[lineNumber] || 0;
      const start = generatedLineStart + literal.start - originalLineStart + changedCharacters;
      const end = start + replacement.length;
      changedCharactersByLine.set(lineNumber,
        changedCharacters + replacement.length - (literal.end - literal.start));
      return { start, end, status: 'externalize' };
    });
  }

  /** Create standard ResourceBundle externalization output. */
  function createMarkdownViewerJavaMessageBundleGenerator() {
    function resolvePaths(configuration) {
      const sourceRoot = normalizePath(configuration.sourceRoot);
      const packagePath = String(configuration.packageName || "").replace(/\./g, "/");
      const targetDirectory = packagePath ? sourceRoot + "/" + packagePath : sourceRoot;
      return {
        targetDirectory,
        accessorPath: targetDirectory + "/" + configuration.accessorClassName + ".java",
        propertiesPath: targetDirectory + "/" + configuration.propertyFileName
      };
    }

    function assignDefaultKeys(literals, prefix, existingProperties) {
      const existing = parsePropertyEntries(existingProperties);
      let index = 0;
      return (literals || []).map((literal) => {
        let key;
        do { key = String(prefix || "") + index++; } while (existing.has(key));
        return { ...literal, key };
      });
    }

    function createAccessorContent(configuration) {
      const packageDeclaration = configuration.packageName ? "package " + configuration.packageName + ";\n\n" : "";
      const bundleName = (configuration.packageName ? configuration.packageName + "." : "") +
        configuration.propertyFileName.replace(/\.properties$/i, "");
      return packageDeclaration +
        "import java.util.MissingResourceException;\n" +
        "import java.util.ResourceBundle;\n\n" +
        "public class " + configuration.accessorClassName + " {\n" +
        "    private static final String BUNDLE_NAME = \"" + bundleName + "\"; //$NON-NLS-1$\n\n" +
        "    private static final ResourceBundle RESOURCE_BUNDLE = ResourceBundle.getBundle(BUNDLE_NAME);\n\n" +
        "    private " + configuration.accessorClassName + "() {\n" +
        "    }\n\n" +
        "    public static String getString(String key) {\n" +
        "        try {\n" +
        "            return RESOURCE_BUNDLE.getString(key);\n" +
        "        } catch (MissingResourceException exception) {\n" +
        "            return '!' + key + '!';\n" +
        "        }\n" +
        "    }\n" +
        "}\n";
    }

    function validateAccessor(content, className) {
      if (!content) return;
      const classPattern = new RegExp("\\bclass\\s+" + className.replace(/[$]/g, "\\$") + "\\b");
      if (!classPattern.test(content) || !/\bstatic\s+String\s+getString\s*\(/.test(content)) {
        throw new Error("The existing accessor file does not provide " + className + ".getString(String).");
      }
    }

    /** Build the complete preview and file-write plan for the selected literal actions. */
    function createPlan(source, literals, configuration, existingFiles = {}) {
      const paths = resolvePaths(configuration);
      const selected = (literals || []).filter((literal) => literal.status === "externalize");
      const ignored = (literals || []).filter((literal) => literal.status === "ignore");
      const keys = new Set();
      selected.forEach((literal) => {
        const key = String(literal.key || "").trim();
        if (!key || /[\s:=#!]/.test(key)) throw new Error("Every externalized string must have a valid properties key.");
        if (keys.has(key)) throw new Error("Externalized string keys must be unique: " + key);
        keys.add(key);
        literal.key = key;
      });
      const existingProperties = parsePropertyEntries(existingFiles.propertiesContent);
      selected.forEach((literal) => {
        if (existingProperties.has(literal.key) && existingProperties.get(literal.key) !== escapePropertyValue(literal.value)) {
          throw new Error("The properties file already contains a different value for key " + literal.key + ".");
        }
      });
      validateAccessor(existingFiles.accessorContent, configuration.accessorClassName);

      let nextSource = String(source || "");
      const accessorReference = configuration.packageName && configuration.packageName !== configuration.sourcePackageName
        ? configuration.packageName + "." + configuration.accessorClassName : configuration.accessorClassName;
      const sourceReplacements = selected.slice().sort((left, right) => left.start - right.start).map((literal) => ({
        literal,
        replacement: accessorReference + ".getString(\"" + literal.key.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + "\")"
      }));
      sourceReplacements.slice().reverse().forEach(({ literal, replacement }) => {
        nextSource = nextSource.slice(0, literal.start) + replacement + nextSource.slice(literal.end);
      });
      const markers = new Map();
      [...selected, ...ignored].forEach((literal) => {
        if (!markers.has(literal.lineNumber)) markers.set(literal.lineNumber, new Set());
        markers.get(literal.lineNumber).add(literal.lineLiteralIndex);
      });
      nextSource = addNonNlsMarkers(nextSource, markers);
      const sourceHighlights = createSourceReplacementHighlights(source, nextSource, sourceReplacements);

      const newPropertyLines = selected.filter((literal) => !existingProperties.has(literal.key))
        .map((literal) => literal.key + "=" + escapePropertyValue(literal.value));
      let propertiesContent = String(existingFiles.propertiesContent || "");
      if (newPropertyLines.length) {
        if (propertiesContent && !propertiesContent.endsWith("\n")) propertiesContent += "\n";
        propertiesContent += newPropertyLines.join("\n") + "\n";
      }
      const accessorContent = selected.length
        ? (existingFiles.accessorContent || createAccessorContent(configuration))
        : String(existingFiles.accessorContent || "");
      const changedFiles = [];
      if (selected.length && !existingFiles.accessorExists) {
        changedFiles.push({ path: paths.accessorPath, content: accessorContent, previousContent: "", existed: false });
      }
      if (selected.length && (!existingFiles.propertiesExists || propertiesContent !== existingFiles.propertiesContent)) {
        changedFiles.push({ path: paths.propertiesPath, content: propertiesContent,
          previousContent: existingFiles.propertiesContent, existed: existingFiles.propertiesExists });
      }
      return {
        sourceContent: nextSource,
        sourceHighlights,
        configuration: { ...configuration, ...paths },
        selectedCount: selected.length,
        ignoredCount: ignored.length,
        files: changedFiles
      };
    }

    return { assignDefaultKeys, createPlan, resolvePaths };
  }

  global.createMarkdownViewerJavaMessageBundleGenerator = createMarkdownViewerJavaMessageBundleGenerator;
})(window);
