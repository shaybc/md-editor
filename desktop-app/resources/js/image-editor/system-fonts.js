// Installed font-family discovery for the image editor text tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const DEFAULT_FONT_FAMILIES = Object.freeze(["Arial", "Georgia", "Courier New"]);
  let cachedFamiliesPromise = null;

  function normalizeFontFamilies(values) {
    const families = new Map();
    (Array.isArray(values) ? values : []).forEach((value) => {
      const family = String(value || "").replace(/^@/, "").trim();
      if (!family) return;
      const key = family.toLocaleLowerCase();
      if (!families.has(key)) families.set(key, family);
    });
    return [...families.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }

  function normalizeWindowsFontName(value) {
    let family = String(value || "")
      .replace(/\s+\((?:TrueType|OpenType|All res)\)\s*$/i, "")
      .replace(/^@/, "")
      .trim();
    const styleSuffix = /(?:\s+|-)(?:Regular|Roman|Bold(?:\s+Italic)?|Italic|Oblique|Light|Semilight|Semi Light|Semibold|Semi Bold|Medium|Thin|Extra Light|ExtraLight|Extra Bold|ExtraBold|Condensed|Narrow)$/i;
    while (styleSuffix.test(family)) family = family.replace(styleSuffix, "").trim();
    return family;
  }

  function parseWindowsRegistry(output) {
    const names = [];
    String(output || "").split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+/);
      if (match) match[1].split(/\s*&\s*/).forEach((name) => names.push(normalizeWindowsFontName(name)));
    });
    return normalizeFontFamilies(names);
  }

  function parseFontConfig(output) {
    const names = [];
    String(output || "").split(/\r?\n/).forEach((line) => {
      line.split(",").forEach((family) => names.push(family));
    });
    return normalizeFontFamilies(names);
  }

  function collectMacFontFamilies(value, families = []) {
    if (Array.isArray(value)) {
      value.forEach((entry) => collectMacFontFamilies(entry, families));
      return families;
    }
    if (!value || typeof value !== "object") return families;
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof entry === "string" && ["family", "family_name", "fullname"].includes(key.toLowerCase())) families.push(entry);
      else collectMacFontFamilies(entry, families);
    });
    return families;
  }

  async function execute(command) {
    if (!global.Neutralino?.os?.execCommand) return "";
    const result = await global.Neutralino.os.execCommand(command);
    return Number(result?.exitCode || 0) === 0 ? String(result?.stdOut || "") : "";
  }

  async function discoverWindowsFonts() {
    const machine = await execute('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"');
    const user = await execute('reg query "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"');
    return normalizeFontFamilies([...parseWindowsRegistry(machine), ...parseWindowsRegistry(user)]);
  }

  async function discoverUnixFonts() {
    return parseFontConfig(await execute('fc-list -f "%{family}\\n"'));
  }

  async function discoverMacFonts() {
    const fontConfigFamilies = await discoverUnixFonts();
    if (fontConfigFamilies.length) return fontConfigFamilies;
    const output = await execute("system_profiler SPFontsDataType -json");
    try {
      return normalizeFontFamilies(collectMacFontFamilies(JSON.parse(output)));
    } catch {
      return [];
    }
  }

  async function discoverNativeFontFamilies() {
    if (!global.Neutralino?.os?.execCommand) return [];
    const osName = String(global.NL_OS || "").toLowerCase();
    if (osName === "windows") return discoverWindowsFonts();
    if (osName === "darwin" || osName === "macos") return discoverMacFonts();
    return discoverUnixFonts();
  }

  async function discoverBrowserFontFamilies() {
    if (typeof global.queryLocalFonts !== "function") return [];
    try {
      const fonts = await global.queryLocalFonts();
      return normalizeFontFamilies(fonts.map((font) => font.family || font.fullName));
    } catch {
      return [];
    }
  }

  /**
   * Discover and cache font families installed on the current operating system.
   * @returns {Promise<string[]>} Sorted family names, or the safe built-in list when discovery is unavailable.
   */
  async function listInstalledFontFamilies() {
    if (!cachedFamiliesPromise) {
      cachedFamiliesPromise = (async () => {
        const nativeFamilies = await discoverNativeFontFamilies();
        const discovered = nativeFamilies.length ? nativeFamilies : await discoverBrowserFontFamilies();
        return normalizeFontFamilies([...DEFAULT_FONT_FAMILIES, ...discovered]);
      })();
    }
    return cachedFamiliesPromise;
  }

  Object.assign(namespace, {
    ImageEditorSystemFonts: {
      DEFAULT_FONT_FAMILIES,
      normalizeFontFamilies,
      parseWindowsRegistry,
      listInstalledFontFamilies
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
