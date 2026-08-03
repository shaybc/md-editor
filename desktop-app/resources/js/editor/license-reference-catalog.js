(function(global) {
  "use strict";

  // Offline license identification: filename eligibility, catalog loading, and template-aware exact matching.
  const MANIFEST_URL = "/assets/license-header/manifest.json";
  const CANDIDATE_FILE_NAMES = new Set([
    "LICENSE",
    "LICENSE.TXT",
    "LICENSE.MD",
    "LICENSE.RST",
    "LICENCE",
    "LICENCE.TXT",
    "LICENCE.MD",
    "COPYING",
    "COPYING.TXT",
    "COPYING.MD",
    "COPYRIGHT",
    "COPYRIGHT.TXT",
    "COPYRIGHT.MD",
    "NOTICE",
    "NOTICE.TXT",
    "NOTICE.MD",
    "LEGAL",
    "LEGAL.TXT",
    "LEGAL.MD",
    "PATENTS",
    "PATENTS.TXT",
    "UNLICENSE",
    "UNLICENSE.TXT",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "LICENSE-GPL",
    "LICENSE.BSD",
    "LICENSE.THIRD-PARTY",
    "LICENSES.TXT",
    "THIRD_PARTY_LICENSES",
    "THIRD-PARTY-NOTICES",
    "THIRDPARTYNOTICES.TXT",
    "OPENSOURCENOTICES.TXT"
  ]);

  /**
   * Normalize only encoding markers and line endings allowed by exact matching.
   * @param {string} content - Complete license file content.
   * @returns {string} Content suitable for exact catalog comparison.
   */
  function normalizeLicenseContent(content) {
    return String(content ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function escapeRegularExpression(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Compile declared template fields while keeping every surrounding character exact.
   * @param {string} canonicalText - Normalized canonical license template.
   * @param {string[]} placeholderTokens - Explicit upstream fields allowed to vary.
   * @returns {Function|null} Deterministic single-line placeholder matcher when fields exist.
   */
  function createTemplateMatcher(canonicalText, placeholderTokens) {
    const tokens = (placeholderTokens || [])
      .filter((token) => token && canonicalText.includes(token))
      .sort((left, right) => right.length - left.length);
    if (!tokens.length) return null;
    const placeholderPattern = new RegExp(tokens.map(escapeRegularExpression).join("|"), "g");
    const literalSegments = [];
    let cursor = 0;
    let placeholderMatch = null;
    while ((placeholderMatch = placeholderPattern.exec(canonicalText))) {
      literalSegments.push(canonicalText.slice(cursor, placeholderMatch.index));
      cursor = placeholderMatch.index + placeholderMatch[0].length;
    }
    literalSegments.push(canonicalText.slice(cursor));

    return function matchesCanonicalTemplate(content) {
      let contentCursor = 0;
      if (!content.startsWith(literalSegments[0])) return false;
      contentCursor = literalSegments[0].length;
      for (let index = 1; index < literalSegments.length; index += 1) {
        const nextLiteral = literalSegments[index];
        const placeholderEnd = nextLiteral
          ? content.indexOf(nextLiteral, contentCursor)
          : content.length;
        if (placeholderEnd < contentCursor) return false;
        const placeholderValue = content.slice(contentCursor, placeholderEnd);
        if (!placeholderValue.trim() || /[\r\n]/.test(placeholderValue)) return false;
        contentCursor = placeholderEnd + nextLiteral.length;
      }
      return contentCursor === content.length;
    };
  }

  /**
   * Return whether a path has one of the explicitly supported license basenames.
   * @param {string} pathOrName - File path or basename to classify.
   * @returns {boolean} True only for a configured candidate filename.
   */
  function isCandidateFileName(pathOrName) {
    const normalized = String(pathOrName || "").replace(/\\/g, "/");
    const basename = normalized.slice(normalized.lastIndexOf("/") + 1).toUpperCase();
    return CANDIDATE_FILE_NAMES.has(basename);
  }

  /**
   * Register the cached offline license catalog.
   * @param {object} app - MD-Editor application registry.
   * @param {object} deps - Injectable resource loading and logging dependencies.
   * @returns {object} Template-aware exact license matching service.
   */
  function registerMarkdownViewerLicenseReferenceCatalog(app, deps = {}) {
    let catalogPromise = null;
    let didWarnAboutCatalogFailure = false;

    function resolveCategoryLabels(keys, labels) {
      return Object.freeze((keys || []).map((key) => labels?.[key] || key));
    }

    function createLicensePresentation(entry, labels) {
      return Object.freeze({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        permissions: resolveCategoryLabels(entry.permissions, labels),
        limitations: resolveCategoryLabels(entry.limitations, labels),
        conditions: resolveCategoryLabels(entry.conditions, labels)
      });
    }

    /**
     * Load and cache all bundled canonical texts after the first eligible request.
     * @returns {Promise<object>} Catalog indexed by normalized complete text.
     */
    async function loadCatalog() {
      if (catalogPromise) return catalogPromise;
      const fetchImpl = deps.fetch || global.fetch;
      catalogPromise = (async function() {
        const manifestResponse = await fetchImpl(MANIFEST_URL);
        if (!manifestResponse?.ok) throw new Error("The offline license manifest is unavailable.");
        const manifest = await manifestResponse.json();
        if (manifest?.formatVersion !== 1 || !Array.isArray(manifest.licenses)) {
          throw new Error("The offline license manifest format is unsupported.");
        }
        const entries = await Promise.all(manifest.licenses.map(async function(entry) {
          const textResponse = await fetchImpl(entry.textPath);
          if (!textResponse?.ok) throw new Error(`The canonical text for ${entry.id || "a license"} is unavailable.`);
          const normalizedText = normalizeLicenseContent(await textResponse.text());
          return {
            normalizedText,
            templateMatcher: createTemplateMatcher(normalizedText, manifest.placeholderTokens),
            presentation: createLicensePresentation(entry, manifest.labels)
          };
        }));
        return Object.freeze({
          manifest: Object.freeze(manifest),
          byNormalizedText: new Map(entries.map((entry) => [entry.normalizedText, entry.presentation])),
          templateEntries: Object.freeze(entries.filter((entry) => entry.templateMatcher))
        });
      })().catch(function(error) {
        catalogPromise = null;
        throw error;
      });
      return catalogPromise;
    }

    /**
     * Match an eligible file against complete bundled canonical texts and declared template fields.
     * @param {string} pathOrName - Current source path or basename.
     * @param {string} content - Complete current editor content.
     * @returns {Promise<object|null>} Immutable display metadata for an exact match.
     */
    async function match(pathOrName, content) {
      if (!isCandidateFileName(pathOrName)) return null;
      try {
        const catalog = await loadCatalog();
        const normalizedContent = normalizeLicenseContent(content);
        const exactMatch = catalog.byNormalizedText.get(normalizedContent);
        if (exactMatch) return exactMatch;
        return catalog.templateEntries.find((entry) => entry.templateMatcher(normalizedContent))?.presentation || null;
      } catch (error) {
        if (!didWarnAboutCatalogFailure) {
          didWarnAboutCatalogFailure = true;
          (deps.console || global.console)?.warn?.("Unable to load offline license references:", error);
        }
        return null;
      }
    }

    const api = { isCandidateFileName, loadCatalog, match };
    app?.registerModule?.("licenseReferenceCatalog", api);
    return api;
  }

  global.registerMarkdownViewerLicenseReferenceCatalog = registerMarkdownViewerLicenseReferenceCatalog;
})(typeof window !== "undefined" ? window : globalThis);
