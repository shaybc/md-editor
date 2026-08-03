// Known Java platform imports that remain available while workspace analysis is unavailable.
(function(global) {
  "use strict";

  const QUALIFIED_NAMES_BY_SIMPLE_NAME = Object.freeze({
    List: Object.freeze([
      "java.util.List",
      "java.awt.List"
    ])
  });

  /**
   * Find Java platform types matching a simple type name.
   * @param {string} simpleName Unqualified Java type name selected in the editor.
   * @returns {Array<{simpleName: string, qualifiedName: string}>} Matching platform types.
   */
  function findBySimpleName(simpleName) {
    return (QUALIFIED_NAMES_BY_SIMPLE_NAME[String(simpleName || "")] || []).map((qualifiedName) => ({
      simpleName,
      qualifiedName
    }));
  }

  global.markdownViewerJavaStandardImports = Object.freeze({
    findBySimpleName
  });
})(window);
