/**
 * MD-Editor post-initialization restrictions for the bundled diagram editor.
 */
window.ICONSEARCH_PATH = null;
window.EMF_CONVERT_URL = null;

if (typeof Editor !== "undefined") {
  Editor.enableServiceWorker = false;
  Editor.enableWebFonts = false;
  Editor.enableExportUrl = false;
}

if (typeof EditorUi !== "undefined") {
  EditorUi.enablePlantUml = false;
  EditorUi.enableLogging = false;
}

/**
 * Select every shape library provided by the pinned offline draw.io runtime.
 * This runs before the editor UI is created, so every iframe starts with the same complete sidebar.
 */
(function selectAllBundledShapeLibraries() {
  if (typeof Sidebar === "undefined" || !Array.isArray(Sidebar.prototype.configuration)) return;
  const libraryIds = Sidebar.prototype.configuration
    .map((library) => library?.id)
    .filter((libraryId) => libraryId && libraryId !== "search");
  Sidebar.prototype.enabledLibraries = null;
  Sidebar.prototype.defaultEntries = libraryIds.join(";");
  urlParams.libs = Sidebar.prototype.defaultEntries;
})();
