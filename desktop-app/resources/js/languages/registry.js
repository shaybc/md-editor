(function(window) {
  "use strict";

  function registerMarkdownViewerLanguageRegistry(app) {
    const specialNameEntries = [
      { pattern: /(^|[\\/])pom\.xml$/i, id: "maven", openingModeKey: "extension:pom.xml", openingModeLabel: "pom.xml" },
      { pattern: /(^|[\\/])dockerfile(\.[^\\/]+)?$/i, id: "dockerfile", openingModeKey: "special:dockerfile", openingModeLabel: "Dockerfile / Dockerfile.*" },
      { pattern: /(^|[\\/])makefile$/i, id: "makefile", openingModeKey: "special:makefile", openingModeLabel: "Makefile" },
      { pattern: /(^|[\\/])rakefile$/i, id: "ruby", openingModeKey: "special:rakefile", openingModeLabel: "Rakefile" },
      { pattern: /(^|[\\/])gemfile$/i, id: "ruby", openingModeKey: "special:gemfile", openingModeLabel: "Gemfile" },
      { pattern: /(^|[\\/])md-editor-debug(?:-\d+)?\.log$/i, id: "csharp", openingModeKey: "special:md-editor-debug-log", openingModeLabel: "MD-Editor debug log" },
      { pattern: /(^|[\\/])license$/i, id: "text", openingModeKey: "special:license", openingModeLabel: "LICENSE" },
      { pattern: /(^|[\\/])readme$/i, id: "markdown", openingModeKey: "special:readme", openingModeLabel: "README" },
      { pattern: /(^|[\\/])changelog$/i, id: "markdown", openingModeKey: "special:changelog", openingModeLabel: "CHANGELOG" },
      { pattern: /(^|[\\/])authors$/i, id: "text", openingModeKey: "special:authors", openingModeLabel: "AUTHORS" },
      { pattern: /(^|[\\/])contributors$/i, id: "text", openingModeKey: "special:contributors", openingModeLabel: "CONTRIBUTORS" }
    ];

    const languages = [
      entry("markdown", "Markdown", ["md", "markdown"], "bi-file-earmark-text", "language-color-markdown", "markdown", "prettier-markdown"),
      entry("mermaid", "Mermaid", ["mermaid"], "bi-diagram-2", "language-color-markdown", "markdown", ""),
      entry("java", "Java", ["java", "aj"], "bi-filetype-java", "language-color-java", "java", "prettier-java"),
      entry("csharp", "C#", ["cs", "csx"], "bi-file-earmark-code", "language-color-csharp", "csharp", ""),
      entry("xml", "XML", ["xml", "xsd", "xsl", "xslt", "svg", "classpath", "project"], "bi-filetype-xml", "language-color-xml", "xml", "prettier-xml"),
      entry("maven", "Maven", ["pom"], "bi-box-seam", "language-color-maven", "xml", "prettier-xml"),
      entry("json", "JSON", ["json", "jsonc", "map"], "bi-filetype-json", "language-color-json", "json", "prettier-json"),
      entry("css", "CSS", ["css"], "bi-filetype-css", "language-color-css", "css", "prettier-css"),
      entry("scss", "SCSS", ["scss", "sass"], "bi-filetype-scss", "language-color-css", "sass", "prettier-css"),
      entry("html", "HTML", ["html", "htm"], "bi-filetype-html", "language-color-html", "html", "prettier-html"),
      entry("python", "Python", ["py", "pyw"], "bi-filetype-py", "language-color-python", "python", ""),
      entry("swift", "Swift", ["swift"], "bi-file-earmark-code", "language-color-swift", "swift", ""),
      entry("yaml", "YAML", ["yaml", "yml"], "bi-filetype-yml", "language-color-yaml", "yaml", "prettier-yaml"),
      entry("powershell", "PowerShell", ["ps1", "psm1", "psd1"], "bi-terminal", "language-color-powershell", "powershell", ""),
      entry("javascript", "JavaScript", ["js", "jsx", "mjs", "cjs"], "bi-filetype-js", "language-color-javascript", "javascript", "prettier-babel"),
      entry("typescript", "TypeScript", ["ts", "tsx"], "bi-filetype-tsx", "language-color-typescript", "typescript", "prettier-typescript"),
      entry("bash", "Bash", ["sh", "bash", "zsh", "fish"], "bi-terminal", "language-color-bash", "shell", ""),
      entry("batch", "Batch", ["bat", "cmd"], "bi-terminal", "language-color-bash", "batch", ""),
      entry("c", "C", ["c"], "bi-file-earmark-code", "language-color-c", "c", ""),
      entry("cpp", "C++", ["cpp", "cc", "cxx", "h", "hpp", "hh", "hxx"], "bi-file-earmark-code", "language-color-cpp", "cpp", ""),
      entry("gradle", "Gradle", ["gradle"], "bi-diagram-3", "language-color-gradle", "groovy", ""),
      entry("kotlin", "Kotlin", ["kt", "kts"], "bi-file-earmark-code", "language-color-kotlin", "kotlin", ""),
      entry("sql", "SQL", ["sql"], "bi-filetype-sql", "language-color-sql", "sql", ""),
      entry("groovy", "Groovy", ["groovy", "gvy", "gy", "gsh"], "bi-file-earmark-code", "language-color-groovy", "groovy", ""),
      entry("objectivec", "Objective-C", ["m", "mm"], "bi-file-earmark-code", "language-color-objectivec", "objectivec", ""),
      entry("perl", "Perl", ["pl", "pm", "t"], "bi-file-earmark-code", "language-color-perl", "perl", ""),
      entry("rust", "Rust", ["rs"], "bi-file-earmark-code", "language-color-rust", "rust", ""),
      entry("scala", "Scala", ["scala", "sc"], "bi-file-earmark-code", "language-color-scala", "scala", ""),
      entry("ruby", "Ruby", ["rb", "rake"], "bi-filetype-rb", "language-color-ruby", "ruby", ""),
      entry("go", "Go", ["go"], "bi-file-earmark-code", "language-color-go", "go", ""),
      entry("dart", "Dart", ["dart"], "bi-file-earmark-code", "language-color-dart", "dart", ""),
      entry("php", "PHP", ["php", "phtml"], "bi-filetype-php", "language-color-php", "php", ""),
      entry("properties", "Properties", ["properties"], "bi-sliders", "language-color-properties", "properties", ""),
      entry("toml", "TOML", ["toml"], "bi-sliders", "language-color-config", "toml", ""),
      entry("ini", "INI", ["ini", "conf", "config", "editorconfig", "env"], "bi-sliders", "language-color-config", "properties", ""),
      entry("registry", "Registry", ["reg"], "bi-sliders", "language-color-config", "registry", ""),
      entry("dockerfile", "Dockerfile", ["dockerfile"], "bi-box", "language-color-dockerfile", "dockerfile", ""),
      entry("dockerignore", "Docker Ignore", ["dockerignore"], "bi-file-earmark-minus", "language-color-dockerfile", "text", ""),
      entry("makefile", "Makefile", ["mk"], "bi-hammer", "language-color-makefile", "text", ""),
      entry("csv", "CSV", ["csv", "tsv"], "bi-filetype-csv", "language-color-text", "text", ""),
      entry("log", "Log", ["log"], "bi-file-text", "language-color-text", "text", ""),
      entry("text", "Text", ["txt", "text", "proto", "ftl", "sdkmanrc", "testexecutionlistener"], "bi-filetype-txt", "language-color-text", "text", "")
    ];

    function entry(id, label, extensions, icon, colorClass, codeMirrorLanguage, formatter) {
      return { id, label, extensions, icon, colorClass, codeMirrorLanguage, formatter };
    }

    const languagesById = new Map(languages.map(function(language) {
      return [language.id, Object.freeze({ ...language })];
    }));
    const languagesByExtension = new Map();
    languages.forEach(function(language) {
      language.extensions.forEach(function(extension) {
        languagesByExtension.set(extension.toLowerCase(), languagesById.get(language.id));
      });
    });
    const defaultSupportedTextExtensions = Array.from(languagesByExtension.keys()).sort();
    const requiredProjectTextExtensions = new Set(["aj", "classpath", "ftl", "mermaid", "project", "proto", "sdkmanrc", "testexecutionlistener"]);
    let supportedTextExtensions = new Set(defaultSupportedTextExtensions);

    function getFileName(path) {
      return String(path || "").split(/[\\/]/).pop() || "";
    }

    function getFileExtension(path) {
      const name = getFileName(path).toLowerCase();
      if (name === "pom.xml") return "pom.xml";
      if (name.endsWith(".gradle.kts")) return "gradle.kts";
      const match = name.match(/\.([a-z0-9+_-]+)$/i);
      return match ? match[1] : "";
    }

    function resolveBySpecialName(path) {
      const value = String(path || "");
      const match = specialNameEntries.find(function(candidate) {
        return candidate.pattern.test(value);
      });
      return match ? languagesById.get(match.id) || null : null;
    }

    function getDefaultOpeningMode(key) {
      return key === "extension:md"
        || key === "extension:markdown"
        || key === "extension:html"
        || key === "special:readme"
        || key === "special:changelog"
        ? "split"
        : "editor";
    }

    function createOpeningModeType(key, label, languageLabel) {
      return Object.freeze({
        key,
        label,
        languageLabel: languageLabel || "Text",
        defaultMode: getDefaultOpeningMode(key)
      });
    }

    /**
     * Classify a newly opened source into its configurable opening-mode type.
     * @param {object|null} sourceFile - Source descriptor containing a path or file name.
     * @returns {object} Stable preference key and display metadata for the source type.
     */
    function classifyOpeningModeSource(sourceFile) {
      if (!sourceFile) return createOpeningModeType("untitled", "Untitled / new document", "New file");
      const path = sourceFile.path || sourceFile.fullPath || sourceFile.name || sourceFile.file?.name || sourceFile.handle?.name || "";
      if (!path) return createOpeningModeType("untitled", "Untitled / new document", "New file");

      const special = specialNameEntries.find(function(candidate) {
        return candidate.pattern.test(String(path));
      });
      if (special) {
        return createOpeningModeType(
          special.openingModeKey,
          special.openingModeLabel,
          languagesById.get(special.id)?.label || "Text"
        );
      }

      const extension = getFileExtension(path);
      if (extension) {
        const language = extension === "gradle.kts"
          ? languagesById.get("kotlin")
          : languagesByExtension.get(extension);
        return createOpeningModeType(`extension:${extension}`, `.${extension}`, language?.label || "Custom text");
      }
      return createOpeningModeType("other", "Extensionless / other text", "Text");
    }

    /**
     * List every built-in and currently configured source type shown in opening-mode settings.
     * @param {string[]|string} additionalExtensions - Custom supported extensions to include.
     * @returns {object[]} Ordered opening-mode definitions.
     */
    function getOpeningModeFileTypes(additionalExtensions) {
      const definitions = [createOpeningModeType("untitled", "Untitled / new document", "New file")];
      const seenKeys = new Set(["untitled"]);

      specialNameEntries.forEach(function(entry) {
        if (seenKeys.has(entry.openingModeKey) || entry.openingModeKey.startsWith("extension:")) return;
        seenKeys.add(entry.openingModeKey);
        definitions.push(createOpeningModeType(entry.openingModeKey, entry.openingModeLabel, languagesById.get(entry.id)?.label));
      });

      const extensions = new Set(defaultSupportedTextExtensions);
      normalizeSupportedTextExtensions(additionalExtensions).forEach(function(extension) {
        extensions.add(extension);
      });
      extensions.add("pom.xml");
      extensions.add("gradle.kts");
      Array.from(extensions).sort().forEach(function(extension) {
        const key = `extension:${extension}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        const language = extension === "pom.xml"
          ? languagesById.get("maven")
          : extension === "gradle.kts"
            ? languagesById.get("kotlin")
            : languagesByExtension.get(extension);
        definitions.push(createOpeningModeType(key, `.${extension}`, language?.label || "Custom text"));
      });

      definitions.push(createOpeningModeType("other", "Extensionless / other text", "Text"));
      return definitions;
    }

    function resolveByShebang(content) {
      const firstLine = String(content || "").split(/\r?\n/, 1)[0] || "";
      if (!firstLine.startsWith("#!")) return null;
      if (/\b(pwsh|powershell)\b/i.test(firstLine)) return languagesById.get("powershell");
      if (/\b(node|deno)\b/i.test(firstLine)) return languagesById.get("javascript");
      if (/\b(python|python3)\b/i.test(firstLine)) return languagesById.get("python");
      if (/\b(bash|sh|zsh|fish)\b/i.test(firstLine)) return languagesById.get("bash");
      if (/\bruby\b/i.test(firstLine)) return languagesById.get("ruby");
      if (/\bperl\b/i.test(firstLine)) return languagesById.get("perl");
      if (/\bphp\b/i.test(firstLine)) return languagesById.get("php");
      return null;
    }

    function resolveLanguageForPath(path, options = {}) {
      const special = resolveBySpecialName(path);
      if (special) return special;

      const fileName = getFileName(path).toLowerCase();
      if (fileName.endsWith(".gradle.kts") && supportedTextExtensions.has("kts")) return languagesById.get("kotlin");

      const extension = getFileExtension(path);
      if (extension && !supportedTextExtensions.has(extension)) return null;
      const byExtension = extension ? languagesByExtension.get(extension) : null;
      if (byExtension) return byExtension;
      if (extension) return languagesById.get("text");

      const byShebang = resolveByShebang(options.content || "");
      if (byShebang) return byShebang;
      return languagesById.get("markdown") || null;
    }

    function isSupportedLanguagePath(path, options = {}) {
      return !!resolveLanguageForPath(path, options);
    }

    function getSupportedTextExtensions() {
      return Array.from(supportedTextExtensions).sort();
    }

    function getDefaultSupportedTextExtensions() {
      return defaultSupportedTextExtensions.slice();
    }

    function normalizeSupportedTextExtensions(value) {
      const source = Array.isArray(value)
        ? value
        : String(value || "").split(/[\s,;]+/);
      return Array.from(new Set(source.map(function(extension) {
        return String(extension || "").trim().replace(/^\.+/, "").toLowerCase();
      }).filter(function(extension) {
        return /^[a-z0-9+_-]+$/.test(extension);
      }))).sort();
    }

    function setSupportedTextExtensions(value) {
      const nextExtensions = normalizeSupportedTextExtensions(value);
      if (!nextExtensions.length) return false;
      supportedTextExtensions = new Set([...nextExtensions, ...requiredProjectTextExtensions]);
      return true;
    }

    const api = {
      getFileExtension,
      getFileName,
      getDefaultSupportedTextExtensions,
      getOpeningModeFileTypes,
      getSupportedTextExtensions,
      isSupportedLanguagePath,
      normalizeSupportedTextExtensions,
      resolveLanguageForPath,
      resolveByShebang,
      classifyOpeningModeSource,
      setSupportedTextExtensions,
      languages: languages.map(function(language) { return languagesById.get(language.id); })
    };

    app.registerModule("languageRegistry", api);
    return api;
  }

  window.registerMarkdownViewerLanguageRegistry = registerMarkdownViewerLanguageRegistry;
})(window);
