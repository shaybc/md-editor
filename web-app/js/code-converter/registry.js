(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.registerMarkdownViewerCodeConverterRegistry = factory;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const KNOWN_FLAGS = [
    "--include-methods",
    "--include-accessors",
    "--include-signatures",
    "--include-return-codes",
    "--include-exceptions",
    "--include-package",
  ];

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function normalizeStringArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => String(value || "").trim()).filter(Boolean);
  }

  function normalizeBasePath(basePath) {
    return String(basePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getConverterExtensionsRoot(basePath) {
    const normalizedBase = normalizeBasePath(basePath);
    if (!normalizedBase) return "";
    return `${normalizedBase}/extensions/code-converters`;
  }

  function validateConverterManifest(manifest, manifestDir) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return { valid: false, error: "Manifest must be a JSON object." };
    }

    const id = String(manifest.id || "").trim();
    const name = String(manifest.name || "").trim();
    const command = String(manifest.command || "").trim();
    const supportedLanguages = normalizeStringArray(manifest.supportedLanguages);
    const args = normalizeStringArray(manifest.args || []);
    const supportedFlags = Array.isArray(manifest.supportedFlags)
      ? normalizeStringArray(manifest.supportedFlags).filter((flag) => KNOWN_FLAGS.includes(flag))
      : KNOWN_FLAGS.slice();

    if (!id) return { valid: false, error: "Manifest is missing id." };
    if (!name) return { valid: false, error: "Manifest is missing name." };
    if (!command) return { valid: false, error: "Manifest is missing command." };
    if (!supportedLanguages.length) return { valid: false, error: "Manifest is missing supportedLanguages." };
    if (args.includes("--root") || args.includes("--vault")) {
      return { valid: false, error: "Manifest args must not include --root or --vault." };
    }

    return {
      valid: true,
      converter: {
        id,
        name,
        version: String(manifest.version || "").trim(),
        description: String(manifest.description || "").trim(),
        supportedLanguages,
        command,
        args,
        supportedFlags,
        manifestDir: normalizeBasePath(manifestDir),
        isBuiltIn: false,
      },
    };
  }

  async function loadInstalledConverters(options) {
    const Neutralino = options?.Neutralino;
    const appPath = options?.appPath || "";
    const extensionsRoot = options?.extensionsRoot || getConverterExtensionsRoot(appPath);
    const converters = [];
    const warnings = [];

    if (!extensionsRoot || !Neutralino?.filesystem?.readDirectory || !Neutralino.filesystem?.readFile) {
      return { converters, warnings };
    }

    let entries = [];
    try {
      entries = await Neutralino.filesystem.readDirectory(extensionsRoot);
    } catch (_error) {
      return { converters, warnings };
    }

    for (const entry of entries || []) {
      if (entry?.entry === "." || entry?.entry === ".." || entry?.type !== "DIRECTORY") continue;
      const manifestDir = `${extensionsRoot}/${entry.entry}`;
      const manifestPath = `${manifestDir}/converter.json`;

      try {
        const rawManifest = await Neutralino.filesystem.readFile(manifestPath);
        const parsedManifest = JSON.parse(rawManifest || "{}");
        const result = validateConverterManifest(parsedManifest, manifestDir);
        if (result.valid) converters.push(result.converter);
        else warnings.push(`${entry.entry}: ${result.error}`);
      } catch (error) {
        warnings.push(`${entry.entry}: Unable to read converter.json.`);
      }
    }

    converters.sort((a, b) => a.name.localeCompare(b.name));
    return { converters, warnings };
  }

  return {
    KNOWN_FLAGS,
    getConverterExtensionsRoot,
    loadInstalledConverters,
    validateConverterManifest,
  };
});
