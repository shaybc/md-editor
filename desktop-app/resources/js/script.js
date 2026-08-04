(function() {
const startupPerf = window.markdownViewerStartupPerf || null;
startupPerf?.mark?.("script.js loaded", { readyState: document.readyState });

async function startMarkdownViewer() {
  startupPerf?.mark?.("startMarkdownViewer start", { readyState: document.readyState });
  const app = window.markdownViewerApp || (window.markdownViewerApp = window.createMarkdownViewerApp
    ? window.createMarkdownViewerApp()
    : {
        constants: {},
        dom: {},
        state: {},
        actions: {},
        services: {},
        modules: {},
        registerModule: function registerModule(name, moduleApi) {
          if (!name) return;
          this.modules[name] = moduleApi || {};
        }
      });
  const nativeWindowAlert = typeof window.alert === "function" ? window.alert.bind(window) : null;
  const notificationModal = typeof window.registerMarkdownViewerNotificationModal === "function"
    ? window.registerMarkdownViewerNotificationModal(app, { nativeAlert: nativeWindowAlert })
    : null;
  if (notificationModal) {
    window.alert = function showAppNotification(message) {
      notificationModal.alert(message);
    };
  }

  function confirmWithAppModal(message, options = {}) {
    if (app.services?.confirm) {
      return app.services.confirm(Object.assign({ message }, options));
    }
    return Promise.resolve(window.confirm(message));
  }

  function suppressBrowserContextMenu(event) {
    event.preventDefault();
  }

  document.addEventListener("contextmenu", suppressBrowserContextMenu, true);

  let markdownRenderTimeout = null;
  const RENDER_DELAY = 100;
  let syncScrollingEnabled = true;
  let isEditorScrolling = false;
  let isPreviewScrolling = false;
  let scrollSyncTimeout = null;
  const SCROLL_SYNC_DELAY = 10;

  // View Mode State - Story 1.1
  let currentViewMode = 'split'; // 'editor', 'split', or 'preview'
  let autoSelectFileEnabled = true;
  let currentFolderTreeNodes = [];
  let folderTreeFilterText = "";
  let folderTreeFilterRenderTimeout = null;
  const FOLDER_TREE_FILTER_IDLE_DELAY = 400;
  let selectedFolderTreeTags = new Set();
  let currentFolderSortMode = "name-asc";
  let showUnsupportedFolderFiles = false;
  let isFolderOpen = false;

  function isWordWrapEnabled() {
    return loadGlobalState().wordWrapEnabled === true;
  }

  const DEFAULT_SHOW_SYMBOL_PREFERENCES = Object.freeze({
    spaceTab: false,
    endOfLine: false,
    nonPrinting: false,
    controlCharactersUnicodeEol: false,
    allCharacters: false,
    indentGuide: true,
    wrapSymbol: true
  });

  function getShowSymbolPreferences() {
    return Object.assign({}, DEFAULT_SHOW_SYMBOL_PREFERENCES, loadGlobalState().showSymbolPreferences || {});
  }

  const markdownEditor = document.getElementById("markdown-editor");
  let codeMirrorEditor = null;
  const editorLineNumbers = document.getElementById("editor-line-numbers");
  const editorCurrentLine = document.getElementById("editor-current-line");
  const editorSelectionHighlights = document.getElementById("editor-selection-highlights");
  const editorSyntaxHighlight = document.getElementById("editor-syntax-highlight");
  const markdownPreview = document.getElementById("markdown-preview");
  const appContainer = document.querySelector(".app-container");
  const themeToggle = document.getElementById("theme-toggle");
  const appZoomInButtons = document.querySelectorAll(".app-zoom-in-button");
  const appZoomOutButtons = document.querySelectorAll(".app-zoom-out-button");
  const appZoomResetButtons = document.querySelectorAll(".app-zoom-reset-button");
  const toggleFullscreenButtons = document.querySelectorAll(".toggle-fullscreen-button");
  const openDownloadsWindowButtons = document.querySelectorAll(".open-downloads-window-button");
  const restoreDefaultsButtons = document.querySelectorAll(".restore-defaults-button");
  const toggleStatusBarButtons = document.querySelectorAll(".toggle-status-bar");
  const wordWrapToggleButtons = document.querySelectorAll(".toggle-word-wrap");
  const showSymbolToggleButtons = document.querySelectorAll(".show-symbol-toggle");
  const editCommandButtons = document.querySelectorAll(".edit-command");
  const documentWordAutocompleteToggleButtons = document.querySelectorAll(".document-word-autocomplete-toggle");
  const spaceToTabLabelElements = document.querySelectorAll(".space-to-tab-label");
  const importFromFileButtons = document.querySelectorAll("#import-from-file");
  const fileCompareButtons = document.querySelectorAll(".open-file-compare");
  const lineCounterButtons = document.querySelectorAll(".open-line-counter");
  const apiClientButtons = document.querySelectorAll(".open-api-client");
  const regexTesterButtons = document.querySelectorAll(".open-regex-tester");
  const newDocumentButtons = document.querySelectorAll(".new-document-button");
  const newUnsavedFileButtons = document.querySelectorAll(".new-unsaved-file-button");
  const importFromGithubButton = document.getElementById("import-from-github");
  const importFromFolderButton = document.getElementById("import-from-folder");
  const folderTreeFilterInput = document.getElementById("folder-tree-filter-input");
  const createTagButton = document.getElementById("create-tag-button");
  const deleteTagButton = document.getElementById("delete-tag-button");
  const clearTagFilterButton = document.getElementById("clear-tag-filter-button");
  const tagManagementSearch = document.getElementById("tag-management-search");
  const tagManagementList = document.getElementById("tag-management-list");
  const folderTreeFilterToggleButtons = document.querySelectorAll(".toggle-folder-tree-filter");
  const folderTreeExpandToggleButtons = document.querySelectorAll(".toggle-folder-tree-expanded");
  let folderTreeRoot = document.getElementById("folder-tree-root");

  console.error("[FolderTree] init", {
    hasPane: !!document.getElementById("folder-tree-pane"),
    hasRoot: !!folderTreeRoot,
    hasImportOption: !!document.getElementById("import-from-folder"),
    viewportWidth: window.innerWidth
  });
  startupPerf?.mark?.("startMarkdownViewer DOM references collected");
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");
  let shownFolderInputFallbackNotice = false;
  const exportMd = document.getElementById("export-md");
  const exportHtml = document.getElementById("export-html");
  const exportPdf = document.getElementById("export-pdf");
  const copyMarkdownButton = document.getElementById("copy-markdown-button");
  const dropzone = document.getElementById("dropzone");
  const closeDropzoneBtn = document.getElementById("close-sidebar-lower-panel");
  const syncToggleButtons = document.querySelectorAll(".sync-toggle-button");
  const editorPane = document.getElementById("markdown-editor");
  const previewPane = document.querySelector(".preview-pane");
  const readingTimeElement = document.getElementById("reading-time");
  const wordCountElement = document.getElementById("word-count");
  const lineCountElement = document.getElementById("line-count");
  const charCountElement = document.getElementById("char-count");
  const statusTipElement = document.getElementById("status-tip");
  const graphZoomStatusElement = document.getElementById("graph-zoom-status");
  const graphZoomPercentElement = document.getElementById("graph-zoom-percent");
  const appZoomStatusElement = document.getElementById("app-zoom-status");
  const appZoomPercentElement = document.getElementById("app-zoom-percent");
  const graphPointsStatusElement = document.getElementById("graph-points-status");
  const graphPointsCountElement = document.getElementById("graph-points-count");
  const graphCollapsedNodesStatusElement = document.getElementById("graph-collapsed-nodes-status");
  const graphEdgesCountElement = document.getElementById("graph-edges-count");
  const graphClustersCountElement = document.getElementById("graph-clusters-count");
  const graphClustersLabelElement = document.getElementById("graph-clusters-label");
  const graphCollapsedNodesCountElement = document.getElementById("graph-collapsed-nodes-count");
  const graphSelectedNodesStatusElement = document.getElementById("graph-selected-nodes-status");
  const graphSelectedNodesCountElement = document.getElementById("graph-selected-nodes-count");
  const editorEngineStatusElement = document.getElementById("editor-engine-status");
  const editorEngineLabelElement = document.getElementById("editor-engine-label");
  const tabViewHost = document.getElementById("tab-view-host");
  const legacyEditorTabView = document.getElementById("legacy-editor-tab-view");
  const appStatusLineElement = document.querySelector(".app-status-line");
  const folderFileCountElement = document.getElementById("folder-file-count");
  const folderDirectoryCountElement = document.getElementById("folder-directory-count");
  const FOLDER_COUNT_BRIDGE_PATH = "resources/bridges/folder-count-bridge/folder-count-bridge.cjs";
  const editorTextpadStatusElement = document.getElementById("editor-textpad-status");
  const editorTotalLengthElement = document.getElementById("editor-total-length");
  const editorTotalLinesElement = document.getElementById("editor-total-lines");
  const editorCursorLineElement = document.getElementById("editor-cursor-line");
  const editorCursorColumnElement = document.getElementById("editor-cursor-column");
  const editorPositionLabelElement = document.getElementById("editor-position-label");
  const editorPositionValueElement = document.getElementById("editor-position-value");
  const editorFormattingToolbarButtons = document.querySelectorAll(".editor-formatting-toolbar [data-editor-format-action]");
  const editorFormattingToolbar = document.querySelector(".editor-formatting-toolbar");
  const editorLinkModal = document.getElementById("editor-link-modal");
  const editorLinkUrlInput = document.getElementById("editor-link-url");
  const editorLinkTextInput = document.getElementById("editor-link-text");
  const editorLinkCancelButton = document.getElementById("editor-link-cancel");
  const editorLinkApplyButton = document.getElementById("editor-link-apply");
  const editorReferenceModal = document.getElementById("editor-reference-modal");
  const editorReferenceNumberInput = document.getElementById("editor-reference-number");
  const editorReferenceUrlInput = document.getElementById("editor-reference-url");
  const editorReferenceTitleInput = document.getElementById("editor-reference-title");
  const editorReferenceCancelButton = document.getElementById("editor-reference-cancel");
  const editorReferenceApplyButton = document.getElementById("editor-reference-apply");
  const editorImageModal = document.getElementById("editor-image-modal");
  const editorImageSourceInputs = document.querySelectorAll("input[name='editor-image-source']");
  const editorImageUrlFields = document.getElementById("editor-image-url-fields");
  const editorImageFileFields = document.getElementById("editor-image-file-fields");
  const editorImageUrlInput = document.getElementById("editor-image-url");
  const editorImageFilePathInput = document.getElementById("editor-image-file-path");
  const editorImageFileInput = document.getElementById("editor-image-file-input");
  const editorImageBrowseButton = document.getElementById("editor-image-browse");
  const editorImageAltInput = document.getElementById("editor-image-alt");
  const editorImageCancelButton = document.getElementById("editor-image-cancel");
  const editorImageApplyButton = document.getElementById("editor-image-apply");
  const editorAlertModal = document.getElementById("editor-alert-modal");
  const editorAlertCards = document.querySelectorAll(".editor-alert-card");
  const editorAlertCancelButton = document.getElementById("editor-alert-cancel");
  const editorAlertApplyButton = document.getElementById("editor-alert-apply");
  const editorSymbolModal = document.getElementById("editor-symbol-modal");
  const editorSymbolSearchInput = document.getElementById("editor-symbol-search");
  const editorSymbolList = document.getElementById("editor-symbol-list");
  const editorSymbolCancelButton = document.getElementById("editor-symbol-cancel");
  const editorSymbolApplyButton = document.getElementById("editor-symbol-apply");
  const editorEmojiModal = document.getElementById("editor-emoji-modal");
  const editorEmojiSearchInput = document.getElementById("editor-emoji-search");
  const editorEmojiList = document.getElementById("editor-emoji-list");
  const editorEmojiCancelButton = document.getElementById("editor-emoji-cancel");
  const editorEmojiApplyButton = document.getElementById("editor-emoji-apply");
  const editorClearMarkdownModal = document.getElementById("editor-clear-markdown-modal");
  const editorClearMarkdownCloseButton = document.getElementById("editor-clear-markdown-close");
  const editorClearMarkdownCancelButton = document.getElementById("editor-clear-markdown-cancel");
  const editorClearMarkdownApplyButton = document.getElementById("editor-clear-markdown-apply");
  const editorSortDialogButtons = document.querySelectorAll(".open-editor-sort-dialog");
  const editorSortModal = document.getElementById("editor-sort-modal");
  const editorSortCancelButton = document.getElementById("editor-sort-cancel");
  const editorSortApplyButton = document.getElementById("editor-sort-apply");
  const editorSortCharacterCodeOrderInput = document.getElementById("editor-sort-character-code-order");
  const editorSortDeleteDuplicatesInput = document.getElementById("editor-sort-delete-duplicates");
  const editorFindReplaceModal = document.getElementById("editor-find-replace-modal");
  const editorFindReplaceCloseButton = document.getElementById("editor-find-replace-close");
  const editorFindReplaceCancelButton = document.getElementById("editor-find-replace-cancel");
  const editorFindInput = document.getElementById("editor-find-input");
  const editorReplaceInput = document.getElementById("editor-replace-input");
  const editorFindReplaceStatus = document.getElementById("editor-find-replace-status");
  const editorFindReplaceExpandButton = document.getElementById("editor-find-replace-expand");
  const editorFindMatchCaseButton = document.getElementById("editor-find-match-case");
  const editorFindPreserveCaseButton = document.getElementById("editor-find-preserve-case");
  const editorFindSelectionOnlyInput = document.getElementById("editor-find-selection-only");
  const editorFindPrevButton = document.getElementById("editor-find-prev");
  const editorFindNextButton = document.getElementById("editor-find-next");
  const editorReplaceOneButton = document.getElementById("editor-replace-one");
  const editorReplaceAllButton = document.getElementById("editor-replace-all");
  const editorBookmarkFindLinesButton = document.getElementById("editor-bookmark-find-lines");
  let previewHoveredLinkUrl = "";
  let editorLinkSelection = null;
  let editorReferenceSelection = null;
  let editorImageSelection = null;
  let editorAlertSelection = null;
  let editorSelectedAlertType = "NOTE";
  let editorSymbolSelection = null;
  let editorSelectedSymbolEntity = "&copy;";
  let editorEmojiSelection = null;
  let editorSelectedEmojiShortcode = ":+1:";
  let editorClearMarkdownSelection = null;
  let editorFindMatches = [];
  let editorFindCurrentIndex = -1;
  let editorFindReplaceExpanded = true;
  let editorFindMatchCase = false;
  let editorFindPreserveCase = false;
  let editorFindSelectionScope = null;
  let editorFindLineMeasure = null;
  const editorSymbols = [
    { group: "Common Symbols", symbol: "ֲ©", entity: "&copy;", keywords: "copyright c" },
    { group: "Common Symbols", symbol: "ֲ®", entity: "&reg;", keywords: "registered trademark r" },
    { group: "Common Symbols", symbol: "ג„¢", entity: "&trade;", keywords: "trademark tm" },
    { group: "Common Symbols", symbol: "ג“", entity: "&check;", keywords: "check tick done" },
    { group: "Common Symbols", symbol: "ג˜…", entity: "&star;", keywords: "star favorite" },
    { group: "Common Symbols", symbol: "ג€¢", entity: "&bull;", keywords: "bullet dot" },
    { group: "Common Symbols", symbol: "ג€¦", entity: "&hellip;", keywords: "ellipsis dots" },
    { group: "Common Symbols", symbol: "ג€”", entity: "&mdash;", keywords: "em dash long dash" },
    { group: "Common Symbols", symbol: "ג€“", entity: "&ndash;", keywords: "en dash" },
    { group: "Common Symbols", symbol: "ג†’", entity: "&rarr;", keywords: "right arrow" },
    { group: "Common Symbols", symbol: "ג†", entity: "&larr;", keywords: "left arrow" },
    { group: "Common Symbols", symbol: "ג†‘", entity: "&uarr;", keywords: "up arrow" },
    { group: "Common Symbols", symbol: "ג†“", entity: "&darr;", keywords: "down arrow" },
    { group: "HTML Entities", symbol: "ג‚¬", entity: "&euro;", keywords: "euro currency" },
    { group: "HTML Entities", symbol: "ֲ£", entity: "&pound;", keywords: "pound currency" },
    { group: "HTML Entities", symbol: "ֲ¥", entity: "&yen;", keywords: "yen currency" },
    { group: "HTML Entities", symbol: "ֲ§", entity: "&sect;", keywords: "section" },
    { group: "HTML Entities", symbol: "ֲ°", entity: "&deg;", keywords: "degree" },
    { group: "HTML Entities", symbol: "ֲ±", entity: "&plusmn;", keywords: "plus minus" },
    { group: "HTML Entities", symbol: "ֳ—", entity: "&times;", keywords: "multiply times" },
    { group: "HTML Entities", symbol: "ֳ·", entity: "&divide;", keywords: "divide division" },
    { group: "HTML Entities", symbol: "ג‰ ", entity: "&ne;", keywords: "not equal" },
    { group: "HTML Entities", symbol: "<", entity: "&lt;", keywords: "less than angle bracket" },
    { group: "HTML Entities", symbol: ">", entity: "&gt;", keywords: "greater than angle bracket" },
    { group: "HTML Entities", symbol: "&", entity: "&amp;", keywords: "ampersand and" },
    { group: "HTML Entities", symbol: "\"", entity: "&quot;", keywords: "quote quotation" },
    { group: "HTML Entities", symbol: "'", entity: "&apos;", keywords: "apostrophe quote" },
    { group: "HTML Entities", symbol: "ֲ ", entity: "&nbsp;", keywords: "non breaking space nbsp" },
    { group: "Greek Letters", symbol: "־±", entity: "&alpha;", keywords: "alpha greek" },
    { group: "Greek Letters", symbol: "־²", entity: "&beta;", keywords: "beta greek" },
    { group: "Greek Letters", symbol: "־³", entity: "&gamma;", keywords: "gamma greek" },
    { group: "Greek Letters", symbol: "־´", entity: "&delta;", keywords: "delta greek" },
    { group: "Greek Letters", symbol: "ֿ€", entity: "&pi;", keywords: "pi greek" },
    { group: "Greek Letters", symbol: "־©", entity: "&Omega;", keywords: "omega greek" }
  ];
  const editorEmojis = [
    { emoji: "נ‘", shortcode: ":-1:", keywords: "thumbs down no dislike" },
    { emoji: "נ‘", shortcode: ":+1:", keywords: "thumbs up yes like" },
    { emoji: "נ’¯", shortcode: ":100:", keywords: "hundred score perfect" },
    { emoji: "נ”¢", shortcode: ":1234:", keywords: "numbers input" },
    { emoji: "נ¥‡", shortcode: ":1st_place_medal:", keywords: "gold medal first" },
    { emoji: "נ¥ˆ", shortcode: ":2nd_place_medal:", keywords: "silver medal second" },
    { emoji: "נ¥‰", shortcode: ":3rd_place_medal:", keywords: "bronze medal third" },
    { emoji: "נ±", shortcode: ":8ball:", keywords: "pool billiards" },
    { emoji: "נ…°ן¸", shortcode: ":a:", keywords: "letter a blood type" },
    { emoji: "נ†", shortcode: ":ab:", keywords: "letter ab blood type" },
    { emoji: "נ”₪", shortcode: ":abc:", keywords: "letters alphabet" },
    { emoji: "נ”¡", shortcode: ":abcd:", keywords: "letters alphabet" },
    { emoji: "נ‰‘", shortcode: ":accept:", keywords: "accept japanese" },
    { emoji: "ג™¿", shortcode: ":accessibility:", keywords: "wheelchair access" },
    { emoji: "נ×—", shortcode: ":accordion:", keywords: "music instrument" },
    { emoji: "נ©¹", shortcode: ":adhesive_bandage:", keywords: "bandage medical" },
    { emoji: "נ§‘", shortcode: ":adult:", keywords: "person adult" },
    { emoji: "נ¡", shortcode: ":aerial_tramway:", keywords: "tram cable car" },
    { emoji: "נ‡¦נ‡«", shortcode: ":afghanistan:", keywords: "flag afghanistan" },
    { emoji: "גˆן¸", shortcode: ":airplane:", keywords: "plane travel" },
    { emoji: "ג°", shortcode: ":alarm_clock:", keywords: "alarm clock time" },
    { emoji: "ג—ן¸", shortcode: ":alembic:", keywords: "science chemistry" },
    { emoji: "נ‘½", shortcode: ":alien:", keywords: "alien ufo" },
    { emoji: "נ‘", shortcode: ":ambulance:", keywords: "medical emergency" },
    { emoji: "ג“", shortcode: ":anchor:", keywords: "ship nautical" },
    { emoji: "נ˜‡", shortcode: ":angel:", keywords: "smile halo" },
    { emoji: "נ’¢", shortcode: ":anger:", keywords: "angry mad" },
    { emoji: "נ˜ ", shortcode: ":angry:", keywords: "angry mad" },
    { emoji: "נ", shortcode: ":ant:", keywords: "bug insect" },
    { emoji: "נ", shortcode: ":apple:", keywords: "fruit red" },
    { emoji: "ג™ˆ", shortcode: ":aries:", keywords: "zodiac" },
    { emoji: "ג—€ן¸", shortcode: ":arrow_backward:", keywords: "arrow left" },
    { emoji: "ג¬", shortcode: ":arrow_double_down:", keywords: "arrow down" },
    { emoji: "ג«", shortcode: ":arrow_double_up:", keywords: "arrow up" },
    { emoji: "ג¬‡ן¸", shortcode: ":arrow_down:", keywords: "arrow down" },
    { emoji: "ג¡ן¸", shortcode: ":arrow_forward:", keywords: "arrow right" },
    { emoji: "ג¬…ן¸", shortcode: ":arrow_left:", keywords: "arrow left" },
    { emoji: "ג†˜ן¸", shortcode: ":arrow_lower_right:", keywords: "arrow down right" },
    { emoji: "ג†™ן¸", shortcode: ":arrow_lower_left:", keywords: "arrow down left" },
    { emoji: "ג¡ן¸", shortcode: ":arrow_right:", keywords: "arrow right" },
    { emoji: "ג¬†ן¸", shortcode: ":arrow_up:", keywords: "arrow up" },
    { emoji: "נ˜", shortcode: ":blush:", keywords: "smile happy" },
    { emoji: "נ‰", shortcode: ":tada:", keywords: "party celebration" },
    { emoji: "ג₪ן¸", shortcode: ":heart:", keywords: "love heart" },
    { emoji: "נ”¥", shortcode: ":fire:", keywords: "hot flame" },
    { emoji: "נ€", shortcode: ":rocket:", keywords: "ship launch" },
    { emoji: "ג…", shortcode: ":white_check_mark:", keywords: "check done success" },
    { emoji: "ג", shortcode: ":x:", keywords: "cross fail no" },
    { emoji: "ג ן¸", shortcode: ":warning:", keywords: "warning caution" },
    { emoji: "נ’¡", shortcode: ":bulb:", keywords: "idea light" },
    { emoji: "נ“", shortcode: ":pushpin:", keywords: "pin note" },
    { emoji: "נ›", shortcode: ":bug:", keywords: "bug issue" }
  ];

  const activeEditorCommands = window.registerMarkdownViewerActiveEditorCommands(app, {
    markdownEditor,
    getCodeMirrorEditor: function() { return codeMirrorEditor; },
    getSpacesPerIndentLevel: function() { return getSpacesPerIndentLevel(); },
    getTabsPerIndentLevel: function() { return getTabsPerIndentLevel(); },
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); }
  });

  const clipboard = window.registerMarkdownViewerClipboard(app, {
    copyMarkdownButton,
    getMarkdownText: function() { return activeEditorCommands.getActiveEditorValue(); }
  });
  const copyToClipboard = clipboard.copyToClipboard;
  const showCopiedMessage = clipboard.showCopiedMessage;

  Object.assign(app.constants, {
    RENDER_DELAY,
    SCROLL_SYNC_DELAY
  });

  Object.assign(app.dom, {
    markdownEditor,
    tabViewHost,
    legacyEditorTabView,
    editorLineNumbers,
    editorCurrentLine,
    editorSelectionHighlights,
    editorSyntaxHighlight,
    markdownPreview,
    themeToggle,
    restoreDefaultsButtons,
    importFromFileButtons,
    newUnsavedFileButtons,
    newDocumentButtons,
    importFromGithubButton,
    importFromFolderButton,
    folderTreeFilterInput,
    createTagButton,
    deleteTagButton,
    tagManagementSearch,
    tagManagementList,
    folderTreeFilterToggleButtons,
    folderTreeExpandToggleButtons,
    folderTreeRoot,
    fileInput,
    folderInput,
    exportMd,
    exportHtml,
    exportPdf,
    copyMarkdownButton,
    dropzone,
    closeDropzoneBtn,
    syncToggleButtons,
    editorPane,
    previewPane,
    readingTimeElement,
    wordCountElement,
    lineCountElement,
    charCountElement,
    statusTipElement,
    graphZoomStatusElement,
    graphZoomPercentElement,
    appZoomStatusElement,
    appZoomPercentElement,
    graphPointsStatusElement,
    graphPointsCountElement,
    graphEdgesCountElement,
    graphSelectedNodesStatusElement,
    graphSelectedNodesCountElement,
    editorEngineStatusElement,
    editorEngineLabelElement,
    editorTextpadStatusElement,
    editorTotalLengthElement,
    editorTotalLinesElement,
    editorCursorLineElement,
    editorCursorColumnElement,
    editorPositionLabelElement,
    editorPositionValueElement
  });

  Object.defineProperties(app.state, {
    markdownRenderTimeout: { get: () => markdownRenderTimeout, set: (value) => { markdownRenderTimeout = value; }, configurable: true },
    syncScrollingEnabled: { get: () => syncScrollingEnabled, set: (value) => { syncScrollingEnabled = value; }, configurable: true },
    isEditorScrolling: { get: () => isEditorScrolling, set: (value) => { isEditorScrolling = value; }, configurable: true },
    isPreviewScrolling: { get: () => isPreviewScrolling, set: (value) => { isPreviewScrolling = value; }, configurable: true },
    scrollSyncTimeout: { get: () => scrollSyncTimeout, set: (value) => { scrollSyncTimeout = value; }, configurable: true },
    currentViewMode: { get: () => currentViewMode, set: (value) => { currentViewMode = value; }, configurable: true },
    autoSelectFileEnabled: { get: () => autoSelectFileEnabled, set: (value) => { autoSelectFileEnabled = value; }, configurable: true },
    currentFolderTreeNodes: { get: () => currentFolderTreeNodes, set: (value) => { currentFolderTreeNodes = value; }, configurable: true },
    folderMarkdownFiles: { get: () => folderMarkdownFiles, set: (value) => { folderMarkdownFiles = value; }, configurable: true },
    folderTreeFilterText: { get: () => folderTreeFilterText, set: (value) => { folderTreeFilterText = value; }, configurable: true },
    selectedFolderTreeTags: { get: () => selectedFolderTreeTags, set: (value) => { selectedFolderTreeTags = value; }, configurable: true },
    currentFolderSortMode: { get: () => currentFolderSortMode, set: (value) => { currentFolderSortMode = value; }, configurable: true },
    showUnsupportedFolderFiles: { get: () => showUnsupportedFolderFiles, set: (value) => { showUnsupportedFolderFiles = value; }, configurable: true },
    isFolderOpen: { get: () => isFolderOpen, set: (value) => { isFolderOpen = value; }, configurable: true },
    shownFolderInputFallbackNotice: { get: () => shownFolderInputFallbackNotice, set: (value) => { shownFolderInputFallbackNotice = value; }, configurable: true },
    previewHoveredLinkUrl: { get: () => previewHoveredLinkUrl, set: (value) => { previewHoveredLinkUrl = value; }, configurable: true }
  });

  const frontmatterRenderer = window.registerMarkdownViewerFrontmatter(app, {
    jsyaml: typeof jsyaml !== "undefined" ? jsyaml : null
  });
  const {
    parseFrontmatter,
    renderFrontmatterValue,
    renderFrontmatterTable,
    escapeHtml
  } = frontmatterRenderer;

  const languageRegistry = window.registerMarkdownViewerLanguageRegistry(app);

  const fileTypes = window.registerMarkdownViewerFileTypes(app, {
    languageRegistry,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    navigator
  });
  const {
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
  } = fileTypes;

  const largeFileViewer = window.registerMarkdownViewerLargeFileViewer(app, {
    getFileName,
    isTextDocumentPath,
    appDebugLog,
    getWordWrapEnabled: function() { return isWordWrapEnabled(); },
    getActiveTab: function() {
      return tabs.find((tab) => tab.id === activeTabId) || null;
    },
    updateDocumentStats: function() {
      if (typeof updateDocumentStats === "function") updateDocumentStats();
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; }
  });

  const imagePreviewControls = window.registerMarkdownViewerImagePreviewControls(app);
  const imageEditor = window.registerMarkdownViewerImageEditor(app, {
    getActiveTab: function() { return tabs.find((tab) => tab.id === activeTabId) || null; },
    onImageEditorStateChanged: function() {
      if (tabsModule) {
        renderTabBar(tabs, activeTabId);
        updateSaveCurrentFileButtons();
        saveTabsToStorage(tabs);
      }
    },
    get tabSessionPersistence() { return tabSessionPersistence; },
    refreshImagePreviews: function(path) { return filePreview?.refreshImagePreviews?.(path); },
    suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
    refreshWorkspaceGitStatus: function() { return app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.(); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return typeof saveAs === "function" ? saveAs : null; },
    alert: function(message) { window.alert(message); }
  });

  const diagramEditor = window.registerMarkdownViewerDiagramEditor(app, {
    onDiagramStateChanged: function() {
      if (tabsModule) {
        renderTabBar(tabs, activeTabId);
        updateSaveCurrentFileButtons();
        saveTabsToStorage(tabs);
      }
    },
    suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return typeof saveAs === "function" ? saveAs : null; },
    log: function(level, message, details) { return appDebugLog(level, message, details); },
    alert: function(message) { window.alert(message); }
  });

  const filePreview = window.registerMarkdownViewerFilePreview(app, {
    getFileName,
    getFileExtension,
    get archiveViewer() { return archiveViewer; },
    imagePreviewControls,
    imageEditor,
    get openImageEditorInTab() { return tabsModule?.openImageEditorInTab; },
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; }
  });

  const hexEditor = window.registerMarkdownViewerHexEditor(app, {
    get openHexEditorInTab() { return tabsModule?.openHexEditorInTab; },
    onHexEditorStateChanged: function() {
      if (tabsModule) {
        renderTabBar(tabs, activeTabId);
        updateSaveCurrentFileButtons();
        saveTabsToStorage(tabs);
      }
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return typeof saveAs === "function" ? saveAs : null; },
    alert: function(message) { window.alert(message); }
  });

  const archiveViewer = window.registerMarkdownViewerArchiveViewer(app, {
    getFileName,
    getFileExtension,
    isKnownTextFilePath,
    filePreview,
    get JSZip() { return typeof JSZip !== "undefined" ? JSZip : undefined; },
    get saveAs() { return typeof saveAs === "function" ? saveAs : null; }
  });

  const largeJsonOpen = window.registerMarkdownViewerLargeJsonOpen(app, {
    getFileName,
    isJsonPath
  });

  const foregroundWaitIndicator = window.registerMarkdownViewerForegroundWaitIndicator(app, {
    rootElement: document.body
  });

  const fileOpen = window.registerMarkdownViewerFileOpen(app, {
    get activeFolderName() { return activeFolderName; },
    set activeFolderName(value) { activeFolderName = value; },
    get activeFolderHandle() { return activeFolderHandle; },
    set activeFolderHandle(value) { activeFolderHandle = value; },
    get activeFolderPath() { return activeFolderPath; },
    set activeFolderPath(value) { activeFolderPath = value; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    set folderMarkdownFiles(value) { folderMarkdownFiles = value; },
    get fileInput() { return fileInput; },
    getFileName,
    getMarkdownTitleFromFileName,
    isGraphFilePath,
    isJsonPath,
    largeFileViewer,
    largeJsonOpen,
    foregroundWaitIndicator,
    appDebugLog,
    looksLikeGraphDocument,
    isMarkdownPath,
    isMermaidPath,
    isTextDocumentPath,
    isTextFileLike,
    get listMarkdownTreeNeutralino() { return listMarkdownTreeNeutralino; },
    get getNeutralinoFolderScanDetails() { return getNeutralinoFolderScanDetails; },
    get collectMarkdownFilesFromTreeNeutralino() { return collectMarkdownFilesFromTreeNeutralino; },
    get renderFolderTree() { return renderFolderTree; },
    get renderFolderLoadingState() { return renderFolderLoadingState; },
    get renderFolderLoadingError() { return renderFolderLoadingError; },
    get rememberRecentFolder() { return rememberRecentFolder; },
    get saveGlobalState() { return saveGlobalState; },
    get openSidebarFileInTab() { return openSidebarFileInTab; },
    get findGraphTabForSourceFile() { return findGraphTabForSourceFile; },
    get switchTab() { return switchTab; },
    get rememberRecentFile() { return rememberRecentFile; },
    get openSavedGraphDocument() { return openSavedGraphDocument; },
    get openLargeFileInTab() { return openLargeFileInTab; },
    get openFilePreviewInTab() { return openFilePreviewInTab; },
    get openHexEditorInTab() { return tabsModule?.openHexEditorInTab; },
    get openDiagramEditorInTab() { return tabsModule?.openDiagramEditorInTab; },
    isDiagramPath: diagramEditor.isDiagramPath,
    isDiagramCandidatePath: diagramEditor.isDiagramCandidatePath,
    looksLikeDiagramXml: diagramEditor.looksLikeDiagramXml,
    get refreshSourceRootMetadata() { return refreshSourceRootMetadata; },
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    onDesktopFolderOpened: async function(folderPath) {
      await app.modules?.folderWatcher?.start?.(folderPath);
      void app.modules?.javaWorkspaceController?.openWorkspace?.(folderPath);
      mavenBuildPathAutoScan?.schedule?.(folderPath);
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    alert: function(message) { window.alert(message); }
  });
  const openFolderTreeFromNeutralinoPath = fileOpen.openFolderTreeFromNeutralinoPath;
  const openMarkdownSourceFile = fileOpen.openMarkdownSourceFile;
  const readOpenFileSourceContent = fileOpen.readOpenFileSourceContent;
  const openDocumentSourceFile = fileOpen.openDocumentSourceFile;
  const openDocumentFileFromPicker = fileOpen.openDocumentFileFromPicker;
  const importDocumentFile = fileOpen.importDocumentFile;

  const hexFileInput = document.getElementById("hex-file-input");
  async function openFileInHexEditorFromPicker() {
    if (typeof NL_VERSION !== "undefined" && Neutralino?.os?.showOpenDialog) {
      const selection = await Neutralino.os.showOpenDialog("Open file in Hex Editor", { multiSelections: false });
      const path = Array.isArray(selection) ? selection[0] : selection;
      if (path) await openDocumentSourceFile({ name: getFileName(path), path }, { forceHex: true, temporary: false });
      return;
    }
    hexFileInput?.click();
  }

  document.querySelectorAll(".open-file-in-hex-editor").forEach(function(button) {
    button.addEventListener("click", async function() {
      try {
        await openFileInHexEditorFromPicker();
      } catch (error) {
        console.error("Failed to choose a file for the hex editor:", error);
        window.alert("Unable to open a file in the hex editor.");
      }
      closeMobileMenu?.();
    });
  });

  hexFileInput?.addEventListener("change", async function() {
    const file = hexFileInput.files?.[0] || null;
    hexFileInput.value = "";
    if (!file) return;
    try {
      await openDocumentSourceFile({ name: file.name, file, size: file.size }, { forceHex: true, temporary: false });
    } catch (error) {
      console.error("Failed to open browser file in hex editor:", error);
      window.alert("Unable to open this file in the hex editor.");
    }
  });

  const markdownLinks = window.registerMarkdownViewerMarkdownLinks(app, {
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get tabs() { return tabs; },
    get helpBrowser() { return helpBrowser; },
    get markdownPreview() { return markdownPreview; },
    get previewHoveredLinkUrl() { return previewHoveredLinkUrl; },
    set previewHoveredLinkUrl(value) { previewHoveredLinkUrl = value; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    getFileName,
    get getActiveMarkdownTab() { return getActiveMarkdownTab; },
    get switchTab() { return switchTab; },
    get pinTemporaryTab() { return pinTemporaryTab; },
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    get newTab() { return newTab; },
    fetchBundledWikiMarkdown,
    getMarkdownTitleFromFileName,
    joinPath,
    getNeutralinoGlobalValue,
    get updateStatusLine() { return updateStatusLine; }
  });
  const getWikiLinkParts = markdownLinks.getWikiLinkParts;
  const isExternalOrSpecialLinkTarget = markdownLinks.isExternalOrSpecialLinkTarget;
  const isExternalWebLinkTarget = markdownLinks.isExternalWebLinkTarget;
  const normalizeExternalWebLinkTarget = markdownLinks.normalizeExternalWebLinkTarget;
  const openExternalWebLink = markdownLinks.openExternalWebLink;
  const getWikiLinkHref = markdownLinks.getWikiLinkHref;
  const splitLinkTarget = markdownLinks.splitLinkTarget;
  const safeDecodeLinkPath = markdownLinks.safeDecodeLinkPath;
  const normalizeMarkdownLinkPath = markdownLinks.normalizeMarkdownLinkPath;
  const getDirectoryPath = markdownLinks.getDirectoryPath;
  const getLinkPathExtension = markdownLinks.getLinkPathExtension;
  const isMarkdownDocumentLinkPath = markdownLinks.isMarkdownDocumentLinkPath;
  const ensureMarkdownLinkExtension = markdownLinks.ensureMarkdownLinkExtension;
  const isSameOriginMarkdownUrl = markdownLinks.isSameOriginMarkdownUrl;
  const getSameOriginMarkdownUrlPath = markdownLinks.getSameOriginMarkdownUrlPath;
  const isAbsoluteFilesystemPath = markdownLinks.isAbsoluteFilesystemPath;
  const normalizeFilesystemLinkPath = markdownLinks.normalizeFilesystemLinkPath;
  const resolveMarkdownLinkPath = markdownLinks.resolveMarkdownLinkPath;
  const getActiveMarkdownSourcePath = markdownLinks.getActiveMarkdownSourcePath;
  const getFolderEntryPathCandidates = markdownLinks.getFolderEntryPathCandidates;
  const findOpenFolderMarkdownEntry = markdownLinks.findOpenFolderMarkdownEntry;
  const getMarkdownLinkSourceFile = markdownLinks.getMarkdownLinkSourceFile;
  const scrollMarkdownPreviewToHash = markdownLinks.scrollMarkdownPreviewToHash;
  const openMarkdownLinkFromPreview = markdownLinks.openMarkdownLinkFromPreview;
  const enhancePreviewMarkdownImages = markdownLinks.enhancePreviewMarkdownImages;
  const annotatePreviewMarkdownLinks = markdownLinks.annotatePreviewMarkdownLinks;
  const getPreviewLinkStatusUrl = markdownLinks.getPreviewLinkStatusUrl;
  const handlePreviewLinkMouseOver = markdownLinks.handlePreviewLinkMouseOver;
  const handlePreviewLinkMouseOut = markdownLinks.handlePreviewLinkMouseOut;
  const handlePreviewLinkClick = markdownLinks.handlePreviewLinkClick;
  const createWikiLinkAnchor = markdownLinks.createWikiLinkAnchor;
  const shouldSkipWikiLinkTextNode = markdownLinks.shouldSkipWikiLinkTextNode;
  const enhanceWikiLinks = markdownLinks.enhanceWikiLinks;

  function isExternalNavigationAnchor(anchor) {
    const rawHref = anchor?.getAttribute?.("href") || "";
    if (!rawHref || rawHref.startsWith("#")) return false;
    if (!isExternalWebLinkTarget(rawHref) && !/^(?:https?:)$/i.test(anchor.protocol || "")) return false;

    try {
      const url = new URL(anchor.href || rawHref, window.location.href);
      return /^(?:http:|https:)$/i.test(url.protocol) && url.origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function handleExternalNavigationClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest?.("a[href]");
    if (!anchor || !isExternalNavigationAnchor(anchor)) return;

    event.preventDefault();
    event.stopPropagation();
    openExternalWebLink(anchor.href || anchor.getAttribute("href"));
  }

  document.addEventListener("click", handleExternalNavigationClick, true);

  const graphExtraction = window.registerMarkdownViewerGraphExtraction(app, {
    get jsyaml() { return typeof jsyaml !== "undefined" ? jsyaml : undefined; },
    isExternalOrSpecialLinkTarget,
    getWikiLinkParts
  });
  const normalizeGraphNodeName = graphExtraction.normalizeGraphNodeName;
  const getGraphDisplayLabel = graphExtraction.getGraphDisplayLabel;
  const getGraphContextMenuTitle = graphExtraction.getGraphContextMenuTitle;
  const createGraphTargetLookup = graphExtraction.createGraphTargetLookup;
  const resolveGraphTargetId = graphExtraction.resolveGraphTargetId;
  const stripMarkdownCodeForLinkExtraction = graphExtraction.stripMarkdownCodeForLinkExtraction;
  const getMarkdownLinkTarget = graphExtraction.getMarkdownLinkTarget;
  const normalizeExtractedLinkTarget = graphExtraction.normalizeExtractedLinkTarget;
  const getMarkdownFrontmatterMatch = graphExtraction.getMarkdownFrontmatterMatch;
  const extractSourceFileFromFrontmatter = graphExtraction.extractSourceFileFromFrontmatter;
  const normalizeTagName = graphExtraction.normalizeTagName;
  const collectNormalizedTags = graphExtraction.collectNormalizedTags;
  const extractYamlFrontmatterTags = graphExtraction.extractYamlFrontmatterTags;
  const getFileTagsFromContent = graphExtraction.getFileTagsFromContent;
  const normalizeFileTagList = graphExtraction.normalizeFileTagList;
  const setFileTagsInContent = graphExtraction.setFileTagsInContent;
  const addTagToContent = graphExtraction.addTagToContent;
  const removeTagFromContent = graphExtraction.removeTagFromContent;
  const extractMarkdownTags = graphExtraction.extractMarkdownTags;
  const extractMarkdownLinks = graphExtraction.extractMarkdownLinks;
  const extractUnresolvedDependencies = graphExtraction.extractUnresolvedDependencies;
  const javaImportCleanup = typeof window.registerMarkdownViewerJavaImportCleanup === "function"
    ? window.registerMarkdownViewerJavaImportCleanup(app)
    : null;
  const autocomplete = window.registerMarkdownViewerAutocomplete(app, {
    markdownEditor,
    activeEditorCommands,
    escapeHtml,
    extractMarkdownTags,
    getActiveFolderName: function() { return activeFolderName; },
    getActiveGraphTab: function() { return getActiveGraphTab(); },
    getEditorLineHeight: function() { return getEditorLineHeight(); },
    getFileName,
    getFolderMarkdownFiles: function() { return folderMarkdownFiles; },
    getCurrentFolderTreeNodes: function() { return currentFolderTreeNodes; },
    getFolderTagCounts: function() { return folderTagCounts; },
    getIsFolderOpen: function() { return isFolderOpen; },
    getKnownTags: function() { return getKnownTags(); },
    getTabs: function() { return tabs; },
    isMarkdownPath,
    normalizeFileTagList,
    normalizeMarkdownLinkPath,
    normalizeTagName
  });
  const hideLinkAutocomplete = autocomplete.hideLinkAutocomplete;
  const renderLinkAutocomplete = autocomplete.renderLinkAutocomplete;
  const positionLinkAutocompleteLayer = autocomplete.positionLinkAutocompleteLayer;
  const handleLinkAutocompleteKeydown = autocomplete.handleLinkAutocompleteKeydown;
  const sourceActions = window.registerMarkdownViewerSourceActions(app);
  window.registerMarkdownViewerCommentSourceActions(app, {
    sourceActions,
    activeEditorCommands,
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); }
  });
  window.registerMarkdownViewerIndentationSourceActions(app, {
    sourceActions,
    activeEditorCommands,
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); }
  });
  const javaMethodJavadoc = window.createMarkdownViewerJavaMethodJavadoc?.();
  window.registerMarkdownViewerProjectDocumentationSourceActions(app, {
    appDebugLog,
    sourceActions,
    activeEditorCommands,
    generator: javaMethodJavadoc,
    getActiveEditorPath: getActiveEditorPathForLanguage,
    getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); },
    alertUser: function(message) { alert(message); }
  });
  const unicodeConverter = window.registerMarkdownViewerUnicodeConverter(app);
  const base64Converter = window.registerMarkdownViewerBase64Converter(app);
  const editorContextMenu = window.registerMarkdownViewerEditorContextMenu(app, {
    markdownEditor,
    activeEditorCommands,
    escapeHtml,
    getActiveTabId: function() { return activeTabId; },
    getEditorInputEventCount: function() { return editorInputEventCount; },
    hideLinkAutocomplete,
    openEditorEmojiModal,
    getCodeMirrorEditor: function() { return codeMirrorEditor; },
    getActiveTab: function() { return getActiveTab(); },
    getUnicodeConverter: function() { return unicodeConverter; },
    getBase64Converter: function() { return base64Converter; },
    isMarkdownPath: function(path) { return isMarkdownPath(path); },
    isUnsupportedFileTab: function(tab) { return isUnsupportedFileTab(tab); },
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); }
  });
  const hideEditorContextMenu = editorContextMenu.hideEditorContextMenu;
  const handleEditorContextMenu = editorContextMenu.handleEditorContextMenu;
  const redoEditorContextMenuConversion = editorContextMenu.redoEditorContextMenuConversion;
  const undoEditorContextMenuConversion = editorContextMenu.undoEditorContextMenuConversion;
  function getActiveEditorValue() {
    return activeEditorCommands.getActiveEditorValue();
  }
  function getActiveEditorSelection() {
    return activeEditorCommands.getActiveEditorSelection();
  }
  function setActiveEditorSelection(start, end) {
    activeEditorCommands.setActiveEditorSelection(start, end);
  }
  function focusActiveEditor() {
    activeEditorCommands.focusActiveEditor();
  }
  function runNativeEditorHistoryCommand(command) {
    focusActiveEditor();
    try {
      return document.execCommand(command);
    } catch (_) {
      return false;
    }
  }
  function undoEditorToolbarAction() {
    if (typeof codeMirrorEditor?.undo === "function" && codeMirrorEditor.undo()) return;
    if (runNativeEditorHistoryCommand("undo")) return;
    undoEditorContextMenuConversion();
  }
  function redoEditorToolbarAction() {
    if (typeof codeMirrorEditor?.redo === "function" && codeMirrorEditor.redo()) return;
    if (runNativeEditorHistoryCommand("redo")) return;
    redoEditorContextMenuConversion();
  }
  function stripMarkdownFormatting(text) {
    let plainText = String(text || "");
    plainText = plainText.replace(/^```[^\n]*\n?/gm, "").replace(/^```\s*$/gm, "");
    plainText = plainText.replace(/^#{1,6}\s+/gm, "");
    plainText = plainText.replace(/^>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gmi, "");
    plainText = plainText.replace(/^>\s?/gm, "");
    plainText = plainText.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "");
    plainText = plainText.replace(/^\s*[-*+]\s+/gm, "");
    plainText = plainText.replace(/^\s*\d+\.\s+/gm, "");
    plainText = plainText.replace(/^\s*\[[^\]]+\]:\s+\S+(?:\s+"[^"]*")?\s*$/gm, "");
    plainText = plainText.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    plainText = plainText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    plainText = plainText.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
    plainText = plainText.replace(/`([^`]+)`/g, "$1");
    plainText = plainText.replace(/~~([^~]+)~~/g, "$1");
    plainText = plainText.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
    plainText = plainText.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1");
    plainText = plainText.replace(/^\s*\|?(.+?)\|?\s*$/gm, function(match, content) {
      if (!match.includes("|")) return match;
      if (/^\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+$/.test(match)) return "";
      return content.split("|").map(function(cell) { return cell.trim(); }).filter(Boolean).join(" ");
    });
    return plainText.replace(/\n{3,}/g, "\n\n").trim();
  }
  function openEditorClearMarkdownModal() {
    if (!editorClearMarkdownModal) return;
    const { start, end } = getActiveEditorSelection();
    if (start === end) {
      focusActiveEditor();
      return;
    }
    editorClearMarkdownSelection = { start, end };
    editorClearMarkdownModal.style.display = "flex";
    window.setTimeout(function() {
      editorClearMarkdownApplyButton?.focus();
    }, 0);
  }
  function closeEditorClearMarkdownModal() {
    if (!editorClearMarkdownModal) return;
    editorClearMarkdownModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorClearMarkdownModal() {
    if (!editorClearMarkdownSelection) return;
    const selectedText = getActiveEditorValue().slice(editorClearMarkdownSelection.start, editorClearMarkdownSelection.end);
    focusActiveEditor();
    setActiveEditorSelection(editorClearMarkdownSelection.start, editorClearMarkdownSelection.end);
    editorContextMenu.replaceSelectionWithText(stripMarkdownFormatting(selectedText));
    closeEditorClearMarkdownModal();
  }
  function getEditorFindQuery() {
    return String(editorFindInput?.value || "");
  }
  function getEditorFindSearchValue(value) {
    return editorFindMatchCase ? String(value || "") : String(value || "").toLocaleLowerCase();
  }
  function getEditorFindSearchScope(value) {
    const textLength = String(value || "").length;
    if (!editorFindSelectionOnlyInput?.checked || !editorFindSelectionScope) {
      return { start: 0, end: textLength };
    }
    const start = Math.max(0, Math.min(textLength, editorFindSelectionScope.start));
    const end = Math.max(start, Math.min(textLength, editorFindSelectionScope.end));
    return { start, end };
  }
  function updateEditorFindSelectionScopeAfterReplacement(match, replacementText) {
    if (!editorFindSelectionOnlyInput?.checked || !editorFindSelectionScope || !match) return;
    editorFindSelectionScope.end += String(replacementText || "").length - (match.end - match.start);
  }
  function collectEditorFindMatches(query) {
    const matches = [];
    if (!query) return matches;
    const value = getActiveEditorValue();
    const scope = getEditorFindSearchScope(value);
    const searchableValue = getEditorFindSearchValue(value.slice(scope.start, scope.end));
    const searchableQuery = getEditorFindSearchValue(query);
    let index = searchableValue.indexOf(searchableQuery);
    while (index >= 0) {
      matches.push({ start: scope.start + index, end: scope.start + index + query.length });
      index = searchableValue.indexOf(searchableQuery, index + Math.max(searchableQuery.length, 1));
    }
    return matches;
  }
  function getEditorLineNumbersForMatches(matches) {
    const value = getActiveEditorValue();
    const lineNumbers = new Set();
    matches.forEach(function(match) {
      lineNumbers.add(value.slice(0, match.start).split("\n").length);
    });
    return Array.from(lineNumbers).sort(function(a, b) { return a - b; });
  }
  function bookmarkEditorFindLines() {
    const query = getEditorFindQuery();
    if (!query) {
      editorFindInput?.focus();
      return;
    }

    const matches = collectEditorFindMatches(query);
    editorFindMatches = matches;
    if (!matches.length) {
      editorFindCurrentIndex = -1;
      activeEditorCommands.clearActiveEditorBookmarkedLines?.();
      updateEditorFindReplaceStatus();
      editorFindInput?.focus();
      return;
    }

    const previousStart = getActiveEditorSelection().start || 0;
    let nextIndex = matches.findIndex(function(match) {
      return match.start >= previousStart;
    });
    if (nextIndex < 0) nextIndex = 0;
    editorFindCurrentIndex = nextIndex;
    activeEditorCommands.setActiveEditorBookmarkedLines?.(getEditorLineNumbersForMatches(matches));
    updateEditorFindReplaceStatus();
    editorFindInput?.focus();
  }
  function updateEditorFindReplaceStatus() {
    if (!editorFindReplaceStatus) return;
    if (!getEditorFindQuery()) {
      editorFindReplaceStatus.textContent = "No results";
      return;
    }
    if (!editorFindMatches.length) {
      editorFindReplaceStatus.textContent = "No results";
      return;
    }
    editorFindReplaceStatus.textContent = `${editorFindCurrentIndex + 1} of ${editorFindMatches.length} matches`;
  }
  function updateEditorFindReplaceMode() {
    if (!editorFindReplaceModal) return;
    editorFindReplaceModal.classList.toggle("find-replace-expanded", editorFindReplaceExpanded);
    editorFindReplaceModal.classList.toggle("find-replace-collapsed", !editorFindReplaceExpanded);
    if (editorFindReplaceExpandButton) {
      editorFindReplaceExpandButton.setAttribute("aria-expanded", String(editorFindReplaceExpanded));
      editorFindReplaceExpandButton.setAttribute("aria-label", editorFindReplaceExpanded ? "Hide replace field" : "Show replace field");
      const icon = editorFindReplaceExpandButton.querySelector("i");
      if (icon) icon.className = editorFindReplaceExpanded ? "bi bi-chevron-down" : "bi bi-chevron-right";
    }
  }
  function setEditorFindReplaceExpanded(expanded) {
    editorFindReplaceExpanded = !!expanded;
    updateEditorFindReplaceMode();
  }
  function updateEditorFindOptionButtons() {
    editorFindMatchCaseButton?.classList.toggle("active", editorFindMatchCase);
    editorFindMatchCaseButton?.setAttribute("aria-pressed", String(editorFindMatchCase));
    editorFindPreserveCaseButton?.classList.toggle("active", editorFindPreserveCase);
    editorFindPreserveCaseButton?.setAttribute("aria-pressed", String(editorFindPreserveCase));
  }
  function getCasePreservedReplacement(sourceText, replacementText) {
    const source = String(sourceText || "");
    const replacement = String(replacementText || "");
    if (!editorFindPreserveCase || !source || !replacement) return replacement;
    if (source === source.toLocaleUpperCase()) return replacement.toLocaleUpperCase();
    if (source === source.toLocaleLowerCase()) return replacement.toLocaleLowerCase();
    const first = source.charAt(0);
    const rest = source.slice(1);
    if (first === first.toLocaleUpperCase() && rest === rest.toLocaleLowerCase()) {
      return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1).toLocaleLowerCase();
    }
    return replacement;
  }
  function getEditorFindLineMeasure() {
    if (!editorFindLineMeasure) {
      editorFindLineMeasure = document.createElement("textarea");
      editorFindLineMeasure.className = "editor-line-measure";
      editorFindLineMeasure.setAttribute("aria-hidden", "true");
      editorFindLineMeasure.setAttribute("tabindex", "-1");
      editorFindLineMeasure.setAttribute("wrap", "soft");
      document.body.appendChild(editorFindLineMeasure);
    }
    return editorFindLineMeasure;
  }
  function syncEditorFindLineMeasureStyles(measure, computedStyle) {
    [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "letterSpacing",
      "textTransform",
      "textIndent",
      "textRendering",
      "wordSpacing",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "boxSizing",
      "tabSize"
    ].forEach(function(property) {
      measure.style[property] = computedStyle[property];
    });
    const activeEditor = activeEditorCommands.getActiveEditor();
    measure.style.width = `${activeEditor?.clientWidth || markdownEditor.clientWidth}px`;
  }
  function getEditorFindMeasuredLineHeight(measure, computedStyle, lineHeight, line) {
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    measure.value = line || " ";
    return Math.max(lineHeight, Math.ceil(measure.scrollHeight - paddingTop - paddingBottom));
  }
  function getEditorFindMatchMetrics(match) {
    const activeEditor = activeEditorCommands.getActiveEditor() || markdownEditor;
    const computedStyle = window.getComputedStyle(activeEditor);
    const parsedLineHeight = parseFloat(computedStyle.lineHeight);
    const parsedFontSize = parseFloat(computedStyle.fontSize);
    const lineHeight = Number.isNaN(parsedLineHeight)
      ? (Number.isNaN(parsedFontSize) ? 21 : parsedFontSize * 1.5)
      : parsedLineHeight;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const beforeMatch = getActiveEditorValue().slice(0, match.start);
    const linesBeforeMatch = beforeMatch.split("\n");
    const previousLines = linesBeforeMatch.slice(0, -1);
    const currentLinePrefix = linesBeforeMatch[linesBeforeMatch.length - 1] || "";
    const measure = getEditorFindLineMeasure();
    syncEditorFindLineMeasureStyles(measure, computedStyle);
    const previousTop = previousLines.reduce(function(total, line) {
      return total + getEditorFindMeasuredLineHeight(measure, computedStyle, lineHeight, line);
    }, 0);
    const prefixHeight = currentLinePrefix
      ? getEditorFindMeasuredLineHeight(measure, computedStyle, lineHeight, currentLinePrefix)
      : lineHeight;
    const wrappedPrefixTop = Math.max(0, prefixHeight - lineHeight);
    return {
      lineHeight,
      top: Math.max(0, paddingTop + previousTop + wrappedPrefixTop)
    };
  }
  function scrollEditorFindMatchIntoView(match) {
    if (!match) return;
    const metrics = getEditorFindMatchMetrics(match);
    const activeEditor = activeEditorCommands.getActiveEditor() || markdownEditor;
    const visibleTop = activeEditor.scrollTop;
    const visibleBottom = visibleTop + activeEditor.clientHeight;
    const safeMargin = Math.min(140, Math.max(48, activeEditor.clientHeight * 0.22));
    const targetBottom = metrics.top + metrics.lineHeight;
    if (metrics.top >= visibleTop + safeMargin && targetBottom <= visibleBottom - safeMargin) return;

    const nextScrollTop = Math.max(0, metrics.top - (activeEditor.clientHeight * 0.42));
    const applyFindScroll = function() {
      activeEditor.scrollTop = nextScrollTop;
      activeEditor.dispatchEvent(new Event("scroll", { bubbles: true }));
    };
    applyFindScroll();
    window.requestAnimationFrame(applyFindScroll);
  }
  function selectEditorTextRange(start, end) {
    const valueLength = getActiveEditorValue().length;
    const selectionStart = Math.max(0, Math.min(valueLength, Number(start) || 0));
    const selectionEnd = Math.max(selectionStart, Math.min(valueLength, Number(end) || selectionStart));
    const applySelection = function() {
      focusActiveEditor();
      setActiveEditorSelection(selectionStart, selectionEnd);
      scrollEditorFindMatchIntoView({ start: selectionStart, end: selectionEnd });
    };
    applySelection();
    window.requestAnimationFrame(applySelection);
  }
  function restoreEditorFindReplaceFocus(element) {
    if (!element || !editorFindReplaceModal?.contains(element)) return;
    const restoreFocus = function() {
      if (editorFindReplaceModal?.style.display === "flex" && element.isConnected) element.focus();
    };
    restoreFocus();
    // Match selection focuses the editor again on the next frame, so restore the widget after that update too.
    window.requestAnimationFrame(restoreFocus);
  }
  function getEditorOffsetForLineNumber(lineNumber) {
    const value = getActiveEditorValue();
    const lines = value.split("\n");
    const maxLine = Math.max(1, lines.length);
    const targetLine = Math.max(1, Math.min(Number(lineNumber) || 1, maxLine));
    let offset = 0;
    for (let index = 1; index < targetLine; index += 1) {
      offset += lines[index - 1].length + 1;
    }
    return offset;
  }
  function getEditorOffsetForLspPosition(position) {
    const value = getActiveEditorValue();
    const lines = value.split("\n");
    const maxLineIndex = Math.max(0, lines.length - 1);
    const targetLineIndex = Math.max(0, Math.min(Number(position?.line) || 0, maxLineIndex));
    const targetCharacter = Math.max(0, Math.min(Number(position?.character) || 0, lines[targetLineIndex]?.length || 0));
    let offset = 0;
    for (let index = 0; index < targetLineIndex; index += 1) {
      offset += lines[index].length + 1;
    }
    return offset + targetCharacter;
  }
  function getEditorLineNumberForOffset(offset) {
    const value = getActiveEditorValue();
    const targetOffset = Math.max(0, Math.min(value.length, Number(offset) || 0));
    return value.slice(0, targetOffset).split("\n").length;
  }
  async function goToEditorLinePrompt() {
    if (typeof app.services?.prompt !== "function") return;
    let message = "Go to line:";
    const currentLine = getEditorLineNumberForOffset(getActiveEditorSelection().start);
    let value = String(currentLine);
    while (true) {
      const input = await app.services.prompt({ message, value });
      if (input === null) return;
      const trimmed = String(input).trim();
      if (/^[1-9]\d*$/.test(trimmed)) {
        const offset = getEditorOffsetForLineNumber(Number(trimmed));
        selectEditorTextRange(offset, offset);
        return;
      }
      message = "Enter a valid line number:";
      value = String(input);
    }
  }
  function selectEditorFindMatch(index) {
    if (!editorFindMatches.length) {
      editorFindCurrentIndex = -1;
      updateEditorFindReplaceStatus();
      return;
    }
    const focusedControl = editorFindReplaceModal?.contains(document.activeElement) ? document.activeElement : null;
    editorFindCurrentIndex = (index + editorFindMatches.length) % editorFindMatches.length;
    const match = editorFindMatches[editorFindCurrentIndex];
    selectEditorTextRange(match.start, match.end);
    updateEditorFindReplaceStatus();
    restoreEditorFindReplaceFocus(focusedControl);
  }
  function refreshEditorFindMatches(options = {}) {
    const query = getEditorFindQuery();
    const previousStart = options.searchFrom
      ?? editorFindMatches[editorFindCurrentIndex]?.start
      ?? getActiveEditorSelection().start
      ?? 0;
    editorFindMatches = collectEditorFindMatches(query);
    if (!editorFindMatches.length) {
      editorFindCurrentIndex = -1;
      updateEditorFindReplaceStatus();
      return;
    }
    let nextIndex = editorFindMatches.findIndex(function(match) {
      return match.start >= previousStart;
    });
    if (nextIndex < 0) nextIndex = 0;
    if (options.select !== false) {
      selectEditorFindMatch(nextIndex);
    } else {
      editorFindCurrentIndex = nextIndex;
      updateEditorFindReplaceStatus();
    }
  }
  function positionEditorFindReplaceModal() {
    const modalBox = editorFindReplaceModal?.querySelector(".editor-find-replace-modal-box");
    if (!modalBox || window.matchMedia("(max-width: 760px)").matches) {
      editorFindReplaceModal?.style.removeProperty("--editor-find-replace-top");
      return;
    }
    const activeEditorPane = document.querySelector(".tab-view.active .editor-pane");
    if (!activeEditorPane) return;
    const editorTop = activeEditorPane.getBoundingClientRect().top;
    editorFindReplaceModal.style.setProperty("--editor-find-replace-top", Math.round(editorTop + 12) + "px");
  }
  function openEditorFindReplaceModal(options = {}) {
    if (!editorFindReplaceModal) return;
    const openingSelection = getActiveEditorSelection();
    editorFindSelectionScope = openingSelection.start < openingSelection.end
      ? { start: openingSelection.start, end: openingSelection.end }
      : null;
    if (editorFindSelectionOnlyInput) {
      editorFindSelectionOnlyInput.checked = false;
      editorFindSelectionOnlyInput.disabled = !editorFindSelectionScope;
    }
    const selectedText = getSelectedEditorText();
    if (editorFindInput) editorFindInput.value = selectedText;
    if (options.resetReplace !== false && editorReplaceInput) editorReplaceInput.value = "";
    setEditorFindReplaceExpanded(options.replace !== false);
    updateEditorFindOptionButtons();
    positionEditorFindReplaceModal();
    editorFindReplaceModal.style.display = "flex";
    refreshEditorFindMatches({ select: !!selectedText });
    window.setTimeout(function() {
      if (options.focusReplace && editorFindReplaceExpanded) {
        editorReplaceInput?.focus();
        editorReplaceInput?.select();
      } else {
        editorFindInput?.focus();
        editorFindInput?.select();
      }
    }, 0);
  }
  function closeEditorFindReplaceModal() {
    if (!editorFindReplaceModal) return;
    editorFindReplaceModal.style.display = "none";
    editorFindSelectionScope = null;
    focusActiveEditor();
  }
  function goToNextEditorFindMatch() {
    if (!editorFindMatches.length) refreshEditorFindMatches();
    if (editorFindMatches.length) selectEditorFindMatch(editorFindCurrentIndex + 1);
  }
  function goToPreviousEditorFindMatch() {
    if (!editorFindMatches.length) refreshEditorFindMatches();
    if (editorFindMatches.length) selectEditorFindMatch(editorFindCurrentIndex - 1);
  }
  function replaceCurrentEditorFindMatch() {
    const query = getEditorFindQuery();
    if (!query) {
      editorFindInput?.focus();
      return;
    }
    const focusedControl = document.activeElement === editorReplaceInput ? editorReplaceInput : null;
    if (!editorFindMatches.length) refreshEditorFindMatches();
    const match = editorFindMatches[editorFindCurrentIndex];
    if (!match) return;
    focusActiveEditor();
    setActiveEditorSelection(match.start, match.end);
    const originalText = getActiveEditorValue().slice(match.start, match.end);
    const replacement = getCasePreservedReplacement(originalText, editorReplaceInput?.value || "");
    editorContextMenu.replaceSelectionWithText(replacement);
    updateEditorFindSelectionScopeAfterReplacement(match, replacement);
    refreshEditorFindMatches({ searchFrom: match.start + replacement.length });
    restoreEditorFindReplaceFocus(focusedControl);
  }
  function replaceAllEditorFindMatches() {
    const query = getEditorFindQuery();
    if (!query) {
      editorFindInput?.focus();
      return;
    }
    const replacement = editorReplaceInput?.value || "";
    const value = getActiveEditorValue();
    const scope = getEditorFindSearchScope(value);
    const matches = collectEditorFindMatches(query);
    if (!matches.length) {
      refreshEditorFindMatches({ select: false });
      return;
    }
    let nextValue = "";
    let cursor = scope.start;
    matches.forEach(function(match) {
      nextValue += value.slice(cursor, match.start);
      nextValue += getCasePreservedReplacement(value.slice(match.start, match.end), replacement);
      cursor = match.end;
    });
    nextValue += value.slice(cursor, scope.end);
    focusActiveEditor();
    setActiveEditorSelection(scope.start, scope.end);
    editorContextMenu.replaceSelectionWithText(nextValue);
    if (editorFindSelectionOnlyInput?.checked && editorFindSelectionScope) {
      editorFindSelectionScope.end = scope.start + nextValue.length;
    }
    refreshEditorFindMatches({ select: false });
  }
  function getSelectedEditorText() {
    const { start, end } = getActiveEditorSelection();
    return getActiveEditorValue().slice(start, end);
  }
  function snapshotActiveEditorSelection() {
    const { start, end } = getActiveEditorSelection();
    return { start, end };
  }
  function restoreActiveEditorSelection(selection) {
    if (!selection) return;
    focusActiveEditor();
    setActiveEditorSelection(selection.start, selection.end);
  }
  function openEditorLinkModal() {
    if (!editorLinkModal) return;
    editorLinkSelection = snapshotActiveEditorSelection();
    editorLinkUrlInput.value = "https://";
    editorLinkTextInput.value = getSelectedEditorText();
    editorLinkModal.style.display = "flex";
    window.setTimeout(function() {
      editorLinkUrlInput.focus();
      editorLinkUrlInput.select();
    }, 0);
  }
  function closeEditorLinkModal() {
    if (!editorLinkModal) return;
    editorLinkModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorLinkModal() {
    if (!editorLinkSelection) return;
    const url = editorLinkUrlInput.value.trim();
    const linkText = editorLinkTextInput.value || url;
    if (!url) {
      editorLinkUrlInput.focus();
      return;
    }
    restoreActiveEditorSelection(editorLinkSelection);
    editorContextMenu.replaceSelectionWithText(`[${linkText}](${url})`);
    closeEditorLinkModal();
  }
  function normalizeReferenceNumber(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    return /^\[[^\]]+\]$/.test(trimmed) ? trimmed : `[${trimmed.replace(/^\[|\]$/g, "")}]`;
  }
  function getEditorReferenceDefinition(referenceNumber, url, title) {
    const trimmedTitle = (title || "").trim();
    const escapedTitle = trimmedTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return trimmedTitle ? `${referenceNumber}: ${url} "${escapedTitle}"` : `${referenceNumber}: ${url}`;
  }
  function openEditorReferenceModal() {
    if (!editorReferenceModal) return;
    editorReferenceSelection = snapshotActiveEditorSelection();
    editorReferenceNumberInput.value = "[1]";
    editorReferenceUrlInput.value = "https://";
    editorReferenceTitleInput.value = "";
    editorReferenceModal.style.display = "flex";
    window.setTimeout(function() {
      editorReferenceNumberInput.focus();
      editorReferenceNumberInput.select();
    }, 0);
  }
  function closeEditorReferenceModal() {
    if (!editorReferenceModal) return;
    editorReferenceModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorReferenceModal() {
    if (!editorReferenceSelection) return;
    const referenceNumber = normalizeReferenceNumber(editorReferenceNumberInput.value);
    const url = editorReferenceUrlInput.value.trim();
    if (!referenceNumber) {
      editorReferenceNumberInput.focus();
      return;
    }
    if (!url) {
      editorReferenceUrlInput.focus();
      return;
    }

    const value = getActiveEditorValue();
    const selectedText = value.slice(editorReferenceSelection.start, editorReferenceSelection.end);
    const inlineReference = `${selectedText}${referenceNumber}`;
    const trailingContent = value.slice(editorReferenceSelection.end);
    const definition = getEditorReferenceDefinition(referenceNumber, url, editorReferenceTitleInput.value);
    const separator = value.trimEnd() ? "\n\n" : "";
    const replacement = `${inlineReference}${trailingContent}${separator}${definition}`;

    focusActiveEditor();
    editorContextMenu.replaceRangeWithText(editorReferenceSelection.start, value.length, replacement);
    closeEditorReferenceModal();
  }
  function getEditorImageSourceMode() {
    const selected = Array.from(editorImageSourceInputs).find((input) => input.checked);
    return selected ? selected.value : "url";
  }
  function setEditorImageSourceMode(mode) {
    editorImageSourceInputs.forEach(function(input) {
      input.checked = input.value === mode;
    });
    updateEditorImageSourceFields();
  }
  function updateEditorImageSourceFields() {
    const isFileMode = getEditorImageSourceMode() === "file";
    if (editorImageUrlFields) editorImageUrlFields.style.display = isFileMode ? "none" : "block";
    if (editorImageFileFields) editorImageFileFields.style.display = isFileMode ? "flex" : "none";
  }
  function escapeMarkdownImageAltText(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/]/g, "\\]");
  }
  function escapeMarkdownImageTitle(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function getMarkdownImageText(target, altText) {
    const trimmedAltText = String(altText || "").trim();
    const escapedAltText = escapeMarkdownImageAltText(trimmedAltText);
    const escapedTitle = escapeMarkdownImageTitle(trimmedAltText);
    return trimmedAltText ? `![${escapedAltText}](${target} "${escapedTitle}")` : `![](${target})`;
  }
  function getRelativeImagePathForEditor(imagePath) {
    const normalizedImagePath = normalizeFilesystemLinkPath(imagePath || "");
    if (!normalizedImagePath) return "";
    const activeSourcePath = normalizeFilesystemLinkPath(getActiveMarkdownSourcePath() || "");
    if (activeSourcePath && isAbsoluteFilesystemPath(activeSourcePath) && isAbsoluteFilesystemPath(normalizedImagePath)) {
      return getRelativePathBetweenFiles(activeSourcePath, normalizedImagePath);
    }
    if (activeFolderPath && isAbsoluteFilesystemPath(normalizedImagePath) && isPathInsideFolder(normalizedImagePath, activeFolderPath)) {
      return getPathRelativeToFolder(normalizedImagePath, activeFolderPath);
    }
    return normalizedImagePath.split("/").pop() || normalizedImagePath;
  }
  function openEditorImageModal() {
    if (!editorImageModal) return;
    editorImageSelection = snapshotActiveEditorSelection();
    setEditorImageSourceMode("url");
    editorImageUrlInput.value = "https://";
    editorImageFilePathInput.value = "";
    editorImageAltInput.value = getSelectedEditorText();
    editorImageModal.style.display = "flex";
    window.setTimeout(function() {
      editorImageUrlInput.focus();
      editorImageUrlInput.select();
    }, 0);
  }
  function closeEditorImageModal() {
    if (!editorImageModal) return;
    editorImageModal.style.display = "none";
    focusActiveEditor();
  }
  async function browseEditorImageFile() {
    if (typeof Neutralino !== "undefined" && Neutralino.os?.showOpenDialog) {
      try {
        const selected = await Neutralino.os.showOpenDialog("Select image file", {
          multiSelections: false,
          filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"] }]
        });
        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        if (selectedPath) editorImageFilePathInput.value = getRelativeImagePathForEditor(selectedPath);
        return;
      } catch (error) {
        console.warn("Failed to open image picker:", error);
      }
    }
    if (editorImageFileInput) editorImageFileInput.click();
  }
  function applyEditorImageModal() {
    if (!editorImageSelection) return;
    const isFileMode = getEditorImageSourceMode() === "file";
    const target = (isFileMode ? editorImageFilePathInput.value : editorImageUrlInput.value).trim();
    if (!target) {
      (isFileMode ? editorImageFilePathInput : editorImageUrlInput).focus();
      return;
    }

    restoreActiveEditorSelection(editorImageSelection);
    editorContextMenu.replaceSelectionWithText(getMarkdownImageText(target, editorImageAltInput.value));
    closeEditorImageModal();
  }
  function setEditorAlertType(alertType) {
    editorSelectedAlertType = alertType || "NOTE";
    editorAlertCards.forEach(function(card) {
      const isSelected = card.dataset.alertType === editorSelectedAlertType;
      card.classList.toggle("is-selected", isSelected);
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }
  function getMarkdownAlertBody(alertType, selectedText) {
    const title = String(alertType || "NOTE").toLowerCase().replace(/^\w/, function(letter) {
      return letter.toUpperCase();
    });
    const body = String(selectedText || "").trim() || `${title} details go here.`;
    return body.split(/\r?\n/).map(function(line) {
      return line ? `> ${line}` : ">";
    }).join("\n");
  }
  function getMarkdownAlertText(alertType, selectedText) {
    return `> [!${alertType}]\n${getMarkdownAlertBody(alertType, selectedText)}`;
  }
  function openEditorAlertModal() {
    if (!editorAlertModal) return;
    editorAlertSelection = snapshotActiveEditorSelection();
    setEditorAlertType("NOTE");
    editorAlertModal.style.display = "flex";
    window.setTimeout(function() {
      const selectedCard = editorAlertModal.querySelector(".editor-alert-card.is-selected");
      if (selectedCard) selectedCard.focus();
    }, 0);
  }
  function closeEditorAlertModal() {
    if (!editorAlertModal) return;
    editorAlertModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorAlertModal() {
    if (!editorAlertSelection) return;
    const selectedText = getActiveEditorValue().slice(editorAlertSelection.start, editorAlertSelection.end);
    restoreActiveEditorSelection(editorAlertSelection);
    editorContextMenu.replaceSelectionWithText(getMarkdownAlertText(editorSelectedAlertType, selectedText));
    closeEditorAlertModal();
  }
  function getFilteredEditorSymbols() {
    const query = String(editorSymbolSearchInput?.value || "").trim().toLowerCase();
    if (!query) return editorSymbols;
    return editorSymbols.filter(function(item) {
      return [item.group, item.symbol, item.entity, item.keywords].join(" ").toLowerCase().includes(query);
    });
  }
  function setEditorSelectedSymbol(entity) {
    editorSelectedSymbolEntity = entity || "&copy;";
    if (!editorSymbolList) return;
    editorSymbolList.querySelectorAll(".editor-symbol-card").forEach(function(card) {
      const isSelected = card.dataset.entity === editorSelectedSymbolEntity;
      card.classList.toggle("is-selected", isSelected);
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }
  function renderEditorSymbolList() {
    if (!editorSymbolList) return;
    const filteredSymbols = getFilteredEditorSymbols();
    const groups = [];
    filteredSymbols.forEach(function(item) {
      let group = groups.find(function(groupItem) { return groupItem.name === item.group; });
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    editorSymbolList.innerHTML = "";
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "editor-symbol-empty";
      empty.textContent = "No symbols found";
      editorSymbolList.appendChild(empty);
      return;
    }

    groups.forEach(function(group) {
      const section = document.createElement("section");
      section.className = "editor-symbol-section";
      const heading = document.createElement("h3");
      heading.className = "editor-symbol-section-title";
      heading.textContent = group.name;
      const grid = document.createElement("div");
      grid.className = "editor-symbol-grid";
      group.items.forEach(function(item) {
        const card = document.createElement("button");
        card.className = "editor-symbol-card";
        card.type = "button";
        card.dataset.entity = item.entity;
        card.setAttribute("aria-pressed", item.entity === editorSelectedSymbolEntity ? "true" : "false");
        card.innerHTML = `<span class="editor-symbol-glyph">${escapeHtml(item.symbol)}</span><span class="editor-symbol-entity">${escapeHtml(item.entity)} <i class="bi bi-clipboard" aria-hidden="true"></i></span>`;
        card.addEventListener("click", function() {
          setEditorSelectedSymbol(item.entity);
        });
        grid.appendChild(card);
      });
      section.appendChild(heading);
      section.appendChild(grid);
      editorSymbolList.appendChild(section);
    });
    setEditorSelectedSymbol(editorSelectedSymbolEntity);
  }
  function openEditorSymbolModal() {
    if (!editorSymbolModal) return;
    editorSymbolSelection = snapshotActiveEditorSelection();
    editorSelectedSymbolEntity = "&copy;";
    if (editorSymbolSearchInput) editorSymbolSearchInput.value = "";
    renderEditorSymbolList();
    editorSymbolModal.style.display = "flex";
    window.setTimeout(function() {
      editorSymbolSearchInput?.focus();
    }, 0);
  }
  function closeEditorSymbolModal() {
    if (!editorSymbolModal) return;
    editorSymbolModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorSymbolModal() {
    if (!editorSymbolSelection || !editorSelectedSymbolEntity) return;
    restoreActiveEditorSelection(editorSymbolSelection);
    editorContextMenu.replaceSelectionWithText(editorSelectedSymbolEntity);
    closeEditorSymbolModal();
  }
  function getFilteredEditorEmojis() {
    const query = String(editorEmojiSearchInput?.value || "").trim().toLowerCase();
    if (!query) return editorEmojis;
    return editorEmojis.filter(function(item) {
      return [item.emoji, item.shortcode, item.keywords].join(" ").toLowerCase().includes(query);
    });
  }
  function setEditorSelectedEmoji(shortcode) {
    editorSelectedEmojiShortcode = shortcode || ":+1:";
    if (!editorEmojiList) return;
    editorEmojiList.querySelectorAll(".editor-emoji-card").forEach(function(card) {
      const isSelected = card.dataset.shortcode === editorSelectedEmojiShortcode;
      card.classList.toggle("is-selected", isSelected);
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }
  function renderEditorEmojiList() {
    if (!editorEmojiList) return;
    const filteredEmojis = getFilteredEditorEmojis();
    editorEmojiList.innerHTML = "";
    if (!filteredEmojis.length) {
      const empty = document.createElement("div");
      empty.className = "editor-symbol-empty";
      empty.textContent = "No emojis found";
      editorEmojiList.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "editor-symbol-grid editor-emoji-grid";
    filteredEmojis.forEach(function(item) {
      const card = document.createElement("button");
      card.className = "editor-symbol-card editor-emoji-card";
      card.type = "button";
      card.dataset.shortcode = item.shortcode;
      card.setAttribute("aria-pressed", item.shortcode === editorSelectedEmojiShortcode ? "true" : "false");
      card.innerHTML = `<span class="editor-symbol-glyph editor-emoji-glyph">${escapeHtml(item.emoji)}</span><span class="editor-symbol-entity">${escapeHtml(item.shortcode)} <i class="bi bi-clipboard" aria-hidden="true"></i></span>`;
      card.addEventListener("click", function() {
        setEditorSelectedEmoji(item.shortcode);
      });
      grid.appendChild(card);
    });
    editorEmojiList.appendChild(grid);
    setEditorSelectedEmoji(editorSelectedEmojiShortcode);
  }
  function openEditorEmojiModal() {
    if (!editorEmojiModal) return;
    editorEmojiSelection = snapshotActiveEditorSelection();
    editorSelectedEmojiShortcode = ":+1:";
    if (editorEmojiSearchInput) editorEmojiSearchInput.value = "";
    renderEditorEmojiList();
    editorEmojiModal.style.display = "flex";
    window.setTimeout(function() {
      editorEmojiSearchInput?.focus();
    }, 0);
  }
  function closeEditorEmojiModal() {
    if (!editorEmojiModal) return;
    editorEmojiModal.style.display = "none";
    focusActiveEditor();
  }
  function applyEditorEmojiModal() {
    if (!editorEmojiSelection || !editorSelectedEmojiShortcode) return;
    restoreActiveEditorSelection(editorEmojiSelection);
    editorContextMenu.replaceSelectionWithText(editorSelectedEmojiShortcode);
    closeEditorEmojiModal();
  }
  function getEditorSortGroupInput(groupIndex, field) {
    return document.getElementById(`editor-sort-group-${groupIndex + 1}-${field}`);
  }
  function resetEditorSortModalDefaults() {
    const defaults = [
      { from: "1", length: "500", order: "ascending", comparison: "case-insensitive" },
      { from: "", length: "", order: "ascending", comparison: "case-insensitive" },
      { from: "", length: "", order: "ascending", comparison: "case-insensitive" }
    ];
    defaults.forEach(function(groupDefaults, index) {
      const groupNumber = index + 1;
      const fromInput = getEditorSortGroupInput(index, "from");
      const lengthInput = getEditorSortGroupInput(index, "length");
      if (fromInput) fromInput.value = groupDefaults.from;
      if (lengthInput) lengthInput.value = groupDefaults.length;
      const orderInput = editorSortModal?.querySelector(`input[name="editor-sort-group-${groupNumber}-order"][value="${groupDefaults.order}"]`);
      const comparisonInput = editorSortModal?.querySelector(`input[name="editor-sort-group-${groupNumber}-comparison"][value="${groupDefaults.comparison}"]`);
      if (orderInput) orderInput.checked = true;
      if (comparisonInput) comparisonInput.checked = true;
    });
    if (editorSortCharacterCodeOrderInput) editorSortCharacterCodeOrderInput.checked = false;
    if (editorSortDeleteDuplicatesInput) editorSortDeleteDuplicatesInput.checked = true;
  }
  function openEditorSortModal() {
    if (!editorSortModal || !isEditorSortEligibleTab()) return;
    hideLinkAutocomplete();
    hideEditorContextMenu();
    resetEditorSortModalDefaults();
    editorSortModal.style.display = "flex";
    window.setTimeout(function() {
      getEditorSortGroupInput(0, "from")?.focus();
    }, 0);
  }
  function closeEditorSortModal() {
    if (!editorSortModal) return;
    editorSortModal.style.display = "none";
    activeEditorCommands.focusActiveEditor?.();
  }
  function parseEditorSortPositiveInteger(input) {
    const value = Number(input?.value);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  function getEditorSortGroupOptions(groupIndex) {
    const groupNumber = groupIndex + 1;
    const from = parseEditorSortPositiveInteger(getEditorSortGroupInput(groupIndex, "from"));
    const length = parseEditorSortPositiveInteger(getEditorSortGroupInput(groupIndex, "length"));
    const order = editorSortModal?.querySelector(`input[name="editor-sort-group-${groupNumber}-order"]:checked`)?.value || "ascending";
    const comparison = editorSortModal?.querySelector(`input[name="editor-sort-group-${groupNumber}-comparison"]:checked`)?.value || "case-insensitive";
    const enabled = groupIndex === 0 || (from !== null && length !== null);
    return {
      enabled,
      from: from || 1,
      length: length || (groupIndex === 0 ? 500 : 1),
      descending: order === "descending",
      comparison
    };
  }
  function getEditorSortOptions() {
    return {
      inCharacterCodeOrder: editorSortCharacterCodeOrderInput?.checked === true,
      deleteDuplicateLines: editorSortDeleteDuplicatesInput?.checked === true,
      groups: [0, 1, 2].map(getEditorSortGroupOptions)
    };
  }
  function applyEditorSortModal() {
    if (!isEditorSortEligibleTab()) return;
    activeEditorCommands.sortCurrentDocumentLines?.(getEditorSortOptions());
    closeEditorSortModal();
  }
  editorFormattingToolbarButtons.forEach(function(button) {
    button.addEventListener("mousedown", function(event) {
      event.preventDefault();
    });
    button.addEventListener("click", function(event) {
      event.preventDefault();
      hideLinkAutocomplete();
      hideEditorContextMenu();
      if (button.dataset.editorFormatAction === "undo") {
        undoEditorToolbarAction();
        return;
      }
      if (button.dataset.editorFormatAction === "redo") {
        redoEditorToolbarAction();
        return;
      }
      if (button.dataset.editorFormatAction === "clear-formatting") {
        openEditorClearMarkdownModal();
        return;
      }
      if (button.dataset.editorFormatAction === "find-replace") {
        openEditorFindReplaceModal({ replace: true });
        return;
      }
      if (button.dataset.editorFormatAction === "link") {
        openEditorLinkModal();
        return;
      }
      if (button.dataset.editorFormatAction === "reference") {
        openEditorReferenceModal();
        return;
      }
      if (button.dataset.editorFormatAction === "image") {
        openEditorImageModal();
        return;
      }
      if (button.dataset.editorFormatAction === "alert") {
        openEditorAlertModal();
        return;
      }
      if (button.dataset.editorFormatAction === "symbol") {
        openEditorSymbolModal();
        return;
      }
      if (button.dataset.editorFormatAction === "emoji") {
        openEditorEmojiModal();
        return;
      }
      editorContextMenu.applyMarkdownActionToSelection(button.dataset.editorFormatAction);
    });
  });
  editorSortDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      updateEditorSortDialogButtons();
      if (button.disabled) return;
      openEditorSortModal();
    });
  });
  document.getElementById("desktopActionMenu")?.addEventListener("click", updateEditorSortDialogButtons);
  document.querySelector(".tools-menu-submenu > .dropdown-toggle")?.addEventListener("mouseenter", updateEditorSortDialogButtons);
  if (editorSortCancelButton) {
    editorSortCancelButton.addEventListener("click", closeEditorSortModal);
  }
  if (editorSortApplyButton) {
    editorSortApplyButton.addEventListener("click", applyEditorSortModal);
  }
  if (editorSortModal) {
    editorSortModal.addEventListener("click", function(event) {
      if (event.target === editorSortModal) closeEditorSortModal();
    });
  }
  if (editorLinkCancelButton) {
    editorLinkCancelButton.addEventListener("click", closeEditorLinkModal);
  }
  if (editorLinkApplyButton) {
    editorLinkApplyButton.addEventListener("click", applyEditorLinkModal);
  }
  if (editorLinkModal) {
    editorLinkModal.addEventListener("click", function(event) {
      if (event.target === editorLinkModal) closeEditorLinkModal();
    });
  }
  if (editorReferenceCancelButton) {
    editorReferenceCancelButton.addEventListener("click", closeEditorReferenceModal);
  }
  if (editorReferenceApplyButton) {
    editorReferenceApplyButton.addEventListener("click", applyEditorReferenceModal);
  }
  if (editorReferenceModal) {
    editorReferenceModal.addEventListener("click", function(event) {
      if (event.target === editorReferenceModal) closeEditorReferenceModal();
    });
  }
  editorImageSourceInputs.forEach(function(input) {
    input.addEventListener("change", function() {
      updateEditorImageSourceFields();
      window.setTimeout(function() {
        const targetInput = getEditorImageSourceMode() === "file" ? editorImageFilePathInput : editorImageUrlInput;
        targetInput.focus();
        targetInput.select();
      }, 0);
    });
  });
  if (editorImageBrowseButton) {
    editorImageBrowseButton.addEventListener("click", browseEditorImageFile);
  }
  if (editorImageFileInput) {
    editorImageFileInput.addEventListener("change", function() {
      const file = editorImageFileInput.files && editorImageFileInput.files[0];
      if (!file) return;
      editorImageFilePathInput.value = (file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
    });
  }
  if (editorImageCancelButton) {
    editorImageCancelButton.addEventListener("click", closeEditorImageModal);
  }
  if (editorImageApplyButton) {
    editorImageApplyButton.addEventListener("click", applyEditorImageModal);
  }
  if (editorImageModal) {
    editorImageModal.addEventListener("click", function(event) {
      if (event.target === editorImageModal) closeEditorImageModal();
    });
  }
  editorAlertCards.forEach(function(card) {
    card.addEventListener("click", function() {
      setEditorAlertType(card.dataset.alertType);
    });
  });
  if (editorAlertCancelButton) {
    editorAlertCancelButton.addEventListener("click", closeEditorAlertModal);
  }
  if (editorAlertApplyButton) {
    editorAlertApplyButton.addEventListener("click", applyEditorAlertModal);
  }
  if (editorAlertModal) {
    editorAlertModal.addEventListener("click", function(event) {
      if (event.target === editorAlertModal) closeEditorAlertModal();
    });
    editorAlertModal.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorAlertModal();
      }
      if (event.key === "Enter" && event.target && event.target.classList.contains("editor-alert-card")) {
        event.preventDefault();
        applyEditorAlertModal();
      }
    });
  }
  if (editorSymbolSearchInput) {
    editorSymbolSearchInput.addEventListener("input", renderEditorSymbolList);
    editorSymbolSearchInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorSymbolModal();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorSymbolModal();
      }
    });
  }
  if (editorSymbolCancelButton) {
    editorSymbolCancelButton.addEventListener("click", closeEditorSymbolModal);
  }
  if (editorSymbolApplyButton) {
    editorSymbolApplyButton.addEventListener("click", applyEditorSymbolModal);
  }
  if (editorSymbolModal) {
    editorSymbolModal.addEventListener("click", function(event) {
      if (event.target === editorSymbolModal) closeEditorSymbolModal();
    });
    editorSymbolModal.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorSymbolModal();
      }
      if (event.key === "Enter" && event.target && event.target.classList.contains("editor-symbol-card")) {
        event.preventDefault();
        applyEditorSymbolModal();
      }
    });
  }
  if (editorEmojiSearchInput) {
    editorEmojiSearchInput.addEventListener("input", renderEditorEmojiList);
    editorEmojiSearchInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorEmojiModal();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorEmojiModal();
      }
    });
  }
  if (editorEmojiCancelButton) {
    editorEmojiCancelButton.addEventListener("click", closeEditorEmojiModal);
  }
  if (editorEmojiApplyButton) {
    editorEmojiApplyButton.addEventListener("click", applyEditorEmojiModal);
  }
  if (editorEmojiModal) {
    editorEmojiModal.addEventListener("click", function(event) {
      if (event.target === editorEmojiModal) closeEditorEmojiModal();
    });
    editorEmojiModal.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorEmojiModal();
      }
      if (event.key === "Enter" && event.target && event.target.classList.contains("editor-emoji-card")) {
        event.preventDefault();
        applyEditorEmojiModal();
      }
    });
  }
  [editorClearMarkdownCloseButton, editorClearMarkdownCancelButton].forEach(function(button) {
    if (!button) return;
    button.addEventListener("click", closeEditorClearMarkdownModal);
  });
  if (editorClearMarkdownApplyButton) {
    editorClearMarkdownApplyButton.addEventListener("click", applyEditorClearMarkdownModal);
  }
  if (editorClearMarkdownModal) {
    editorClearMarkdownModal.addEventListener("click", function(event) {
      if (event.target === editorClearMarkdownModal) closeEditorClearMarkdownModal();
    });
    editorClearMarkdownModal.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorClearMarkdownModal();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorClearMarkdownModal();
      }
    });
  }
  [editorFindReplaceCloseButton, editorFindReplaceCancelButton].forEach(function(button) {
    if (!button) return;
    button.addEventListener("click", closeEditorFindReplaceModal);
  });
  if (editorFindInput) {
    editorFindInput.addEventListener("input", function() {
      refreshEditorFindMatches({ select: false });
    });
    editorFindInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) goToPreviousEditorFindMatch();
        else goToNextEditorFindMatch();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorFindReplaceModal();
      }
    });
  }
  if (editorReplaceInput) {
    editorReplaceInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        replaceCurrentEditorFindMatch();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorFindReplaceModal();
      }
    });
  }
  if (editorFindPrevButton) {
    editorFindPrevButton.addEventListener("click", goToPreviousEditorFindMatch);
  }
  if (editorFindNextButton) {
    editorFindNextButton.addEventListener("click", goToNextEditorFindMatch);
  }
  if (editorReplaceOneButton) {
    editorReplaceOneButton.addEventListener("click", replaceCurrentEditorFindMatch);
  }
  if (editorReplaceAllButton) {
    editorReplaceAllButton.addEventListener("click", replaceAllEditorFindMatches);
  }
  if (editorBookmarkFindLinesButton) {
    editorBookmarkFindLinesButton.addEventListener("click", bookmarkEditorFindLines);
  }
  if (editorFindReplaceModal) {
    editorFindReplaceModal.addEventListener("click", function(event) {
      if (event.target === editorFindReplaceModal) closeEditorFindReplaceModal();
    });
  }
  [editorLinkUrlInput, editorLinkTextInput].forEach(function(input) {
    if (!input) return;
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorLinkModal();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorLinkModal();
      }
    });
  });
  [editorImageUrlInput, editorImageFilePathInput, editorImageAltInput].forEach(function(input) {
    if (!input) return;
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorImageModal();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorImageModal();
      }
    });
  });
  [editorReferenceNumberInput, editorReferenceUrlInput, editorReferenceTitleInput].forEach(function(input) {
    if (!input) return;
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyEditorReferenceModal();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorReferenceModal();
      }
    });
  });
  // View Mode Elements - Story 1.1
  const contentContainer = document.querySelector(".content-container");
  const viewModeButtons = document.querySelectorAll(".view-mode-btn");
  const folderPicker = window.registerMarkdownViewerFolderPicker(app);
  let lspServerRegistry = null;
  let lspVsixInstaller = null;
  let neutralinoLspBridge = null;
  let jdtProxyClient = null;
  let kotlinAdapterClient = null;
  let kotlinWorkspaceCoordinator = null;
  let eclipsePreferencesController = null;
  let projectProblemsBroker = null;
  let lspRequestClient = null;
  let jdtProjectInventoryClient = null;
  let jdtProjectScopeValidator = null;
  let jdtScopeMismatchNotification = null;
  let spawnedProcessRouter = null;
  let workspaceActivityClient = null;
  let diagnosticLifecycleTrace = null;
  let analysisGenerationCoordinator = null;
  let javaAnalysisRefresh = null;
  let eclipseAnalysisScopePolicy = null;
  let mavenProjectDetection = null;
  let javaProjectDetectionBridgeClient = null;
  let javaAnalysisInventory = null;
  let javaWorkspaceModel = null;
  let javaWorkspaceController = null;
  let jdtTerminalFailureHandler = null;
  let jdkRegistry = null;
  let javaProjectRuntime = null;
  let javaAnalysisFailureMonitor = null;
  let javaAnalysisProblems = null;
  let aspectjAnalysisProblems = null;
  let javaGradleRuntimeGuidance = null;
  let javaAnalysisFailureWorkspaceId = "";
  let neutralinoAiBridge = null;
  let aiCompanionPanel = null;
  let aiSecuritySettings = null;
  let aiApprovalSettings = null;
  let structuredExecutionActions = null;
  let aiCompanionEditorActionTools = null;
  let aiCompanionSettingsTools = null;
  let aiCompanionConversionExportTools = null;
  let graphCompanionControl = null;
  let apiClient = null;
  let regexTester = null;
  let markdownRender = null;
  const SOURCEGRAPH_TYPESCRIPT_VSIX_URL = "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/sourcegraph/vsextensions/javascript-typescript/latest/vspackage";
  const ECLIPSE_JDTLS_MILESTONES_URL = "https://download.eclipse.org/jdtls/milestones/";
  const ECLIPSE_JDTLS_SNAPSHOTS_URL = "https://download.eclipse.org/justj/?file=jdtls/snapshots";
  const LEMMINX_RELEASES_URL = "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/org.eclipse.lemminx/";
  const LEMMINX_MAVEN_RELEASES_URL = "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/lemminx-maven/";
  const LANGUAGE_SERVER_IDS = Object.freeze(["typescript", "java", "kotlin", "xml", "python", "html", "css", "json", "yaml", "bash", "dockerfile", "windows-scripting"]);
  const settingsLanguageServerPendingActions = new Map();
  const bundledLanguageServerInstallPromises = new Map();
  const DEFAULT_LANGUAGE_SERVER_AUTO_START_PREFERENCES = Object.freeze({
    typescript: true,
    java: true,
    kotlin: true,
    xml: true,
    python: true,
    html: true,
    css: true,
    json: true,
    yaml: true,
    bash: true,
    dockerfile: true
  });
  const aiCompanionSettings = window.registerMarkdownViewerAiCompanionSettings
    ? window.registerMarkdownViewerAiCompanionSettings(app)
    : null;
  const aiCompanionAutocomplete = window.registerMarkdownViewerAiCompanionAutocomplete
    ? window.registerMarkdownViewerAiCompanionAutocomplete(app, {
      bridge: { autocomplete: function(payload, onEvent) { return neutralinoAiBridge?.autocomplete?.(payload, onEvent) || Promise.resolve({ completion: "" }); } },
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getOpenDocuments: getOpenDocumentsForAiCompanionAutocomplete,
      getSettings: function() { return getAiCompanionSettings(); },
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); }
    })
    : null;
  const licenseReferenceCatalog = window.registerMarkdownViewerLicenseReferenceCatalog
    ? window.registerMarkdownViewerLicenseReferenceCatalog(app)
    : null;
  const licenseSummaryHeader = window.registerMarkdownViewerLicenseSummaryHeader
    ? window.registerMarkdownViewerLicenseSummaryHeader(app, { catalog: licenseReferenceCatalog })
    : null;
  const editorViewManager = window.registerMarkdownViewerEditorViewManager(app, {
    markdownEditor,
    markdownPreview,
    editorLineNumbers,
    editorCurrentLine,
    editorSelectionHighlights,
    editorSyntaxHighlight,
    getCodeMirrorEditorFactory: function() { return window.createMarkdownViewerCodeMirrorEditorInstance; },
    languageRegistry,
    getActiveEditorPath: getActiveEditorPathForLanguage,
    getEditorPath: getEditorPathForTab,
    getEditorLanguageOverride,
    onEditorLanguageChange: function(tabId, language) {
      if (tabId !== activeTabId) return;
      editorFormattingToolbar?.toggleAttribute("hidden", language?.id !== "markdown");
    },
    getWordWrapEnabled: function() { return isWordWrapEnabled(); },
    getDocumentWordAutocompleteEnabled: function() { return isDocumentWordAutocompleteEnabled(); },
    getLanguageAutocompleteEnabled: function() { return isLanguageAutocompleteEnabled(); },
    getSnippetAutocompleteEnabled: function() { return isSnippetAutocompleteEnabled(); },
    getUnclosedBracketHighlightEnabled: function() { return isUnclosedBracketHighlightEnabled(); },
    getAutocompletePreferences,
    getSnippetDefinitions: function(languageId) { return getEditorSnippetDefinitions(languageId); },
    getLspSession: getLspSessionForEditor,
    getJavaWorkspaceController: function() { return app.modules?.javaWorkspaceController || null; },
    openLspDefinitionTarget,
    getEditorQuickFixSuggestions: async function(request) {
      const diagnosticStore = app.modules?.quickFixDiagnosticStore;
      const controller = app.modules?.quickFixController;
      const diagnostic = diagnosticStore?.findEditorDiagnostic?.(request);
      return diagnostic && controller?.getEditorSuggestions
        ? controller.getEditorSuggestions(diagnostic)
        : null;
    },
    openEditorQuickFix: function(preparedResult, initialActionId) {
      const controller = app.modules?.quickFixController;
      if (!preparedResult?.diagnostic || !controller?.openForDiagnostic) return false;
      return controller.openForDiagnostic(preparedResult.diagnostic, { preparedResult, initialActionId });
    },
    getShowSymbolPreferences,
    licenseSummaryHeader,
    aiAutocomplete: aiCompanionAutocomplete,
    goToEditorLinePrompt,
    openEditorFindReplace: openEditorFindReplaceModal
  });
  const editorLineStatus = window.registerMarkdownViewerEditorLineStatus(app, {
    markdownEditor,
    editorLineNumbers,
    editorCurrentLine,
    editorSelectionHighlights,
    getActiveMarkdownEditor: function() { return editorViewManager.getActiveMarkdownEditor(); },
    getActiveOverlay: function(name) { return editorViewManager.getActiveOverlay(name); },
    escapeHtml,
    getEditorSelectionMatchCaseSensitive: function() {
      return editorContextMenu.getEditorSelectionMatchCaseSensitive();
    }
  });
  const getEditorLineHeight = editorLineStatus.getEditorLineHeight;
  const updateEditorLineNumbers = editorLineStatus.updateEditorLineNumbers;
  const scheduleEditorLineNumbersUpdate = editorLineStatus.scheduleEditorLineNumbersUpdate;
  const updateEditorSelectionHighlights = editorLineStatus.updateEditorSelectionHighlights;
  const syncEditorSelectionHighlightsScroll = editorLineStatus.syncEditorSelectionHighlightsScroll;
  const syncEditorLineNumberScroll = editorLineStatus.syncEditorLineNumberScroll;
  var editorLineNumberResizeObserver = null;
  var observedEditorLineNumberResizeTarget = null;
  function refreshEditorLineNumberResizeObserver() {
    if (!editorLineNumberResizeObserver) return;
    const nextTarget = editorViewManager.getActiveMarkdownEditor?.() || markdownEditor;
    if (observedEditorLineNumberResizeTarget === nextTarget) return;
    if (observedEditorLineNumberResizeTarget) {
      editorLineNumberResizeObserver.unobserve(observedEditorLineNumberResizeTarget);
    }
    observedEditorLineNumberResizeTarget = nextTarget || null;
    if (observedEditorLineNumberResizeTarget) {
      editorLineNumberResizeObserver.observe(observedEditorLineNumberResizeTarget);
    }
  }

  const recentItems = window.registerMarkdownViewerRecentItems(app, {
    applyGlobalPreferences: function(state) { return applyGlobalPreferences(state); },
    appDebugLog,
    escapeHtml,
    getFileName,
    getMaxRecentFiles: function() { return getMaxRecentFiles(); },
    getMaxRecentFolders: function() { return getMaxRecentFolders(); },
    globalStateKey: "markdownViewerGlobalState",
    loadGlobalState: function() { return loadGlobalState(); }
  });
  const isNeutralinoRuntime = recentItems.isNeutralinoRuntime;
  if (typeof window.registerMarkdownViewerSpawnedProcessRouter === "function") {
    spawnedProcessRouter = window.registerMarkdownViewerSpawnedProcessRouter(app, {
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerWorkspaceActivityClient === "function") {
    workspaceActivityClient = window.registerMarkdownViewerWorkspaceActivityClient(app);
  }
  if (typeof window.registerMarkdownViewerDiagnosticLifecycleTrace === "function") {
    diagnosticLifecycleTrace = window.registerMarkdownViewerDiagnosticLifecycleTrace(app, {
      debugLog: appDebugLog,
      getWorkspaceRoot: function() { return activeFolderPath || ""; }
    });
  }
  if (typeof window.registerMarkdownViewerJdtProjectScopeValidator === "function") {
    jdtProjectScopeValidator = window.registerMarkdownViewerJdtProjectScopeValidator(app);
  }
  if (typeof window.registerMarkdownViewerJdtScopeMismatchNotification === "function") {
    jdtScopeMismatchNotification = window.registerMarkdownViewerJdtScopeMismatchNotification(app);
  }
  if (typeof window.registerMarkdownViewerJdtTerminalFailureHandler === "function") {
    jdtTerminalFailureHandler = window.registerMarkdownViewerJdtTerminalFailureHandler(app, {
      getJavaWorkspaceController: function() { return javaWorkspaceController; },
      getLspBridge: function() { return neutralinoLspBridge; },
      log: appDebugLog
    });
  }
  if (typeof window.registerMarkdownViewerAnalysisGenerationCoordinator === "function") {
    analysisGenerationCoordinator = window.registerMarkdownViewerAnalysisGenerationCoordinator(app, {
      diagnosticLifecycleTrace,
      getWorkspaceRoot: function() { return activeFolderPath || ""; },
      requestFinalJdtBuild: function(value) {
        const session = jdtProxyClient?.getSession?.(`java:${normalizeLocalPath(value.workspaceRoot)}`);
        if (!session) throw new Error("JDT session is unavailable for the final workspace build.");
        if (!kotlinAdapterClient?.requestJdtWorkspaceBuild) throw new Error("The JDT workspace-build request client is unavailable.");
        return kotlinAdapterClient.requestJdtWorkspaceBuild({ transport: session.transport });
      },
      finalizeJdtGeneration: function(value) { return jdtProxyClient?.finalizeAnalysisGeneration?.(value); },
      requestJdtProjectInventory: function(value) { return jdtProjectInventoryClient?.requestInventory?.(value); },
      validateJdtProjectScope: function(value) { return jdtProjectScopeValidator?.validate?.(value); },
      onJdtProjectScopeValidated: function() {
        javaAnalysisProblems?.clear?.();
        javaWorkspaceController?.markClasspathReady?.();
      },
      onJdtProjectScopeFailed: function(value) {
        const validation = value?.validation || {};
        const missing = [...(validation.missingProjectRoots || []), ...(validation.missingSourceRoots || [])]
          .join(", ") || "none";
        const actual = (validation.projects || []).map((project) => project.locationUri || project.name).filter(Boolean).join(", ") || "none";
        void appDebugLog?.("error", "[lsp] JDT project scope validation failed", {
          generationId: value?.generationId || 0,
          workspaceRoot: value?.workspaceRoot || "",
          expectedProjectRoots: validation.expectedProjectRoots || [],
          validatedProjectRoots: validation.validatedProjectRoots || [],
          missingProjectRoots: validation.missingProjectRoots || [],
          unexpectedProjects: validation.unexpectedProjects || [],
          expectedSourceRoots: validation.expectedSourceRoots || [],
          importedSourceRoots: validation.importedSourceRoots || [],
          missingSourceRoots: validation.missingSourceRoots || [],
          jdtProjects: validation.projects || value?.inventory?.projects || [],
          analysisScope: javaWorkspaceController?.getModel?.()?.analysis || null,
          message: value?.error?.message || String(value?.error || ""),
        });
        javaAnalysisProblems?.publish?.({
          code: value?.error ? "jdt-project-inventory-failed" : "jdt-project-scope-mismatch",
          summary: value?.error
            ? `JDT project inventory validation failed: ${value.error?.message || value.error}`
            : "JDT did not import every entry selected for Java analysis.",
          reason: `Missing selected modules or source folders: ${missing}. Actual JDT projects: ${actual}`,
          projectPath: value?.workspaceRoot || "",
          logPath: javaWorkspaceController?.getState?.()?.logPath || "",
          fatal: true,
          remediation: "Review the selected Java analysis modules and the JDT workspace log, then retry project analysis."
        });
      },
      commitProblemsGeneration: function(value) { return projectProblemsBroker?.commitGeneration?.(value); },
      clearProblemsWorkspace: function(workspaceRoot) { projectProblemsBroker?.clearWorkspace?.(workspaceRoot); },
      onGenerationStarted: function(value) { jdtProxyClient?.beginAnalysisGeneration?.(value); },
      onCommitted: function() { javaWorkspaceController?.markReady?.(); },
      onIncomplete: function(value) { void jdtTerminalFailureHandler?.handleIncomplete?.(value); },

      onInactivity: function(value) {
        void appDebugLog?.("warning", "[lsp] Project analysis has not reported recent progress; providers remain active", {
          generationId: value.generationId,
          workspaceRoot: value.workspaceRoot,
          status: value.status,
          providers: value.providers,
          inactivity: value.inactivity
        });
      },
      onStateChanged: function(value) {
        problemsPanel?.setAnalysisGenerationState?.(value);
        problemsPanel?.setJdtAnalysisReady?.(["committed", "incomplete", "idle"].includes(value.status), {
          discardPending: value.status === "idle"
        });
        kotlinWorkspaceCoordinator?.onAnalysisGenerationState?.(value);
      }
    });
  }

  if (typeof window.registerMarkdownViewerJavaAnalysisRefresh === "function") {
    javaAnalysisRefresh = window.registerMarkdownViewerJavaAnalysisRefresh(app, {
      analysisGenerationCoordinator,
      getWorkspaceRoot: function() { return activeFolderPath || ""; },
      get javaWorkspaceController() { return javaWorkspaceController; },
      retryJavaWorkspace: function() { return retryJavaWorkspaceFromSettings({ manageSettingsState: false }); }
    });
  }

  let ajdtStatusBaseState = null;
  const AJDT_BACKGROUND_PROCESS_ID = "ajdt-project-analysis";

  function updateAjdtBackgroundProcess(description, outcome = "") {
    const processes = app.modules?.backgroundProcesses;
    if (!processes) return;
    const label = `AspectJ: ${String(description || "Analyzing").replace(/^AspectJ:\s*/i, "")}`;
    if (outcome) processes.complete(AJDT_BACKGROUND_PROCESS_ID, outcome, { description: label });
    else processes.start({ ownerId: AJDT_BACKGROUND_PROCESS_ID, category: "aspectj", icon: "bi-bounding-box-circles", description: label });
  }

  function markAjdtWorkspaceStatus(status = {}) {
    const phaseLabel = status.phase === "ajdt-diagnostics-waiting" ? "Waiting for JDT" : status.phase === "ajdt-diagnostics-started" ? "Starting" : "Analyzing";
    const detail = String(status.message || phaseLabel).replace(/\.+$/, "");
    const currentState = javaWorkspaceController?.getState?.() || { phase: "ready", label: "Java: Ready" };
    const currentLabel = String(currentState.label || "Java: Ready");
    if (!/\s+\(AJDT:/.test(currentLabel)) ajdtStatusBaseState = currentState;
    const javaLabel = currentLabel.replace(/\s+\(AJDT:.*\)$/, "");
    javaWorkspaceController?.markImporting?.(`${javaLabel} (AJDT: ${detail})`);
    updateAjdtBackgroundProcess(detail);
  }

  function finishAjdtWorkspaceStatus() {
    const state = javaWorkspaceController?.getState?.();
    const baseState = ajdtStatusBaseState;
    ajdtStatusBaseState = null;
    if (!/\s+\(AJDT:/.test(String(state?.label || ""))) return;
    if (baseState?.phase === "ready") javaWorkspaceController?.markReady?.();
    else javaWorkspaceController?.markImporting?.(baseState?.label || "Java: Building workspace...");
  }

  if (typeof window.registerMarkdownViewerJdtProxyClient === "function") {
    jdtProxyClient = window.registerMarkdownViewerJdtProxyClient(app, {
      appDebugLog,
      diagnosticLifecycleTrace,
      onRestartGeneration: function(value) {
        const generation = analysisGenerationCoordinator?.getState?.();
        return analysisGenerationCoordinator?.beginGeneration?.({
          workspaceRoot: value.workspaceRoot,
          reason: value.reason,
          requirements: generation?.requirements,
          kotlinReady: generation?.providers?.kotlin?.ready === true,
          kotlinAbiReady: generation?.providers?.kotlin?.abiReady === true
        });
      },
      onJdtDiagnosticsSettled: function(value) { analysisGenerationCoordinator?.markJdtDiagnosticsSettled?.(value); },
      onJdtDiagnosticsUnsettled: function(value) { analysisGenerationCoordinator?.markJdtDiagnosticsUnsettled?.(value); },
      onJdtProgress: function(value) {
        analysisGenerationCoordinator?.markProgress?.({
          ...value,
          providerId: "jdt",
          milestone: "analysis-jdt-progress",
          message: value?.phase || ""
        });
      },
      processRouter: spawnedProcessRouter,
      getDesktopAppRootPath,
      getInteractiveRequestTimeoutMs: getJdtInteractiveRequestTimeoutMs,
      getMaximumProblems: getJdtMaximumProblems,
      getAspectjDiagnosticsEnabled: isAjdtDiagnosticsEnabled,
      getWorkspaceModel: function() { return javaWorkspaceController?.getModel?.() || null; },
      getWorkspaceRuntime: function() { return javaWorkspaceController?.getRuntime?.() || null; },
      getAspectjGradleSettings: function(projectGradle) { return getGradleProjectLauncherSettings(projectGradle); },
      onAspectjDiagnosticsFailure: function(failure) {
        aspectjAnalysisProblems?.publish?.(failure);
        analysisGenerationCoordinator?.markAjdtTerminal?.({ ...failure, outcome: "failed" });
        updateAjdtBackgroundProcess(failure?.summary || failure?.message || "Analysis failed", "failed");
        finishAjdtWorkspaceStatus();
      },
      onAspectjDiagnosticsReady: function(value) {
        aspectjAnalysisProblems?.clear?.();
        analysisGenerationCoordinator?.markAjdtTerminal?.({ ...value, outcome: "ready" });
        updateAjdtBackgroundProcess(value?.message || "Analysis ready", "finished");
        finishAjdtWorkspaceStatus();
      },
      onAspectjDiagnosticsCleared: function() {
        aspectjAnalysisProblems?.clear?.();
        updateAjdtBackgroundProcess("Analysis cleared", "finished");
        finishAjdtWorkspaceStatus();
      },
      onAspectjDiagnosticsStatus: function(value) {
        markAjdtWorkspaceStatus(value);
        const generation = analysisGenerationCoordinator?.getState?.();
        analysisGenerationCoordinator?.markProgress?.({
          generationId: value?.generationId ?? generation?.generationId,
          workspaceRoot: value?.workspaceRoot || generation?.workspaceRoot || "",
          providerId: "ajdt",
          milestone: "analysis-ajdt-progress",
          message: String(value?.message || "")
        });
      },
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerKotlinAdapterClient === "function") {
    kotlinAdapterClient = window.registerMarkdownViewerKotlinAdapterClient(app, {
      appDebugLog,
      fromFileUri: function(uri) { return lspServerRegistry?.fromFileUri?.(uri) || uri; }
    });
  }
  if (typeof window.registerMarkdownViewerJdkRegistry === "function") {
    jdkRegistry = window.registerMarkdownViewerJdkRegistry(app, {
      getEntries: function() { return loadGlobalState().codeConverterJavaJdks || []; },
      pathExists: canAccessLocalPath,
      detectFeature: getJavaFeatureForJdkHome,
      getOsName: function() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
    });
  }
  if (jdkRegistry && typeof window.registerMarkdownViewerJavaProjectRuntime === "function") {
    javaProjectRuntime = window.registerMarkdownViewerJavaProjectRuntime(app, {
      jdkRegistry,
      getBundledToolingJdkHome: function() { return `${getDesktopAppRootPath()}/bin/tooling-jdk`; }
    });
  }
  if (typeof window.registerMarkdownViewerJavaAnalysisFailureMonitor === "function") {
    javaAnalysisFailureMonitor = window.registerMarkdownViewerJavaAnalysisFailureMonitor(app);
  }
  if (typeof window.registerMarkdownViewerGradleJvmGuidance === "function") {
    javaGradleRuntimeGuidance = window.registerMarkdownViewerGradleJvmGuidance(app, {
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerEclipseAnalysisScopePolicy === "function") {
    eclipseAnalysisScopePolicy = window.registerMarkdownViewerEclipseAnalysisScopePolicy(app);
  }
  if (typeof window.registerMarkdownViewerJavaProjectDetectionBridgeClient === "function") {
    javaProjectDetectionBridgeClient = window.registerMarkdownViewerJavaProjectDetectionBridgeClient(app, {
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerMavenProjectDetection === "function") {
    mavenProjectDetection = window.registerMarkdownViewerMavenProjectDetection(app, {
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerJavaAnalysisInventory === "function") {
    const standardSourceInventory = window.registerMarkdownViewerStandardSourceInventory?.(app);
    const mavenModuleInventory = window.registerMarkdownViewerMavenModuleInventory?.(app, {
      bridge: javaProjectDetectionBridgeClient,
      mavenDetection: mavenProjectDetection,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
    const gradleModuleInventory = window.registerMarkdownViewerGradleModuleInventory?.(app, {
      getDesktopAppRootPath,
      getGradleInstallations: getJavaConverterGradleInstallations,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
    javaAnalysisInventory = window.registerMarkdownViewerJavaAnalysisInventory(app, {
      standard: standardSourceInventory,
      maven: mavenModuleInventory,
      gradle: gradleModuleInventory
    });
  }
  if (typeof window.registerMarkdownViewerJavaWorkspaceModel === "function") {
    javaWorkspaceModel = window.registerMarkdownViewerJavaWorkspaceModel(app, {
      bridge: javaProjectDetectionBridgeClient,
      javaAnalysisInventory,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (javaWorkspaceModel && typeof window.registerMarkdownViewerJavaWorkspaceController === "function") {
    javaWorkspaceController = window.registerMarkdownViewerJavaWorkspaceController(app, {
      workspaceModel: javaWorkspaceModel,
      projectRuntime: javaProjectRuntime,
      workspaceActivityClient,
      diagnosticLifecycleTrace,
      analysisGenerationCoordinator,
      onModelResolved: function(value) {
        const generation = analysisGenerationCoordinator?.getState?.();
        const model = value?.model || {};
        const configuredBuildSystem = model.projectConfiguration?.buildSystem;
        const markerMode = configuredBuildSystem === "maven" || configuredBuildSystem === "gradle"
          ? configuredBuildSystem
          : model.kind === "gradle"
            ? "gradle"
            : (model.kind === "maven" || model.kind === "mixed" ? "maven" : "java");
        app.modules?.sidebarContextTree?.setJavaProjectMarkerMode?.(markerMode);
        app.modules?.sidebarContextTree?.setGradleModulePaths?.(
          (model.modules || [])
            .filter((module) => module.kind === "gradle" || module.kind === "mixed" || module.kinds?.includes?.("gradle"))
            .map((module) => module.root)
        );
        app.modules?.sidebarContextTree?.setJavaSourceRootPaths?.(model.standardJavaSourceRoots || []);
        analysisGenerationCoordinator?.setRequirements?.({
          generationId: generation?.generationId,
          workspaceRoot: value?.workspaceRoot,
          requirements: {
            jdt: model.hasJavaContent === true,
            kotlin: model.hasKotlinContent === true && isLanguageServerAutoStartEnabled("kotlin") !== false,
            ajdt: model.hasJavaContent === true && model.hasAspectjContent === true
              && model.importers?.gradle === true && isAjdtDiagnosticsEnabled(),
            jdtImportRequired: model.importers?.gradle === true || model.importers?.maven === true,
            kotlinAbiRequired: model.hasJavaContent === true && model.hasKotlinContent === true,
            expectedProjectRoots: model.analysis?.includedModuleRoots || [],
            expectedSourceRoots: model.analysis?.selectedSourceRoots || []
          }
        });
        kotlinWorkspaceCoordinator?.onModelResolved?.(value);
        void eclipsePreferencesController?.onModelResolved?.(value);
      },
      onWorkspaceSessionStarted: function(projectPath) {
        const workspaceId = `java:${normalizeLocalPath(projectPath)}`;
        javaAnalysisFailureMonitor?.reset?.(workspaceId, { preserveNotifications: workspaceId === javaAnalysisFailureWorkspaceId });
        javaAnalysisFailureWorkspaceId = workspaceId;
      },
      onRuntimeResolved: function() {
        void editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
      },
      confirmCancellation: confirmJdtCancellation,
      cancelAnalysis: function() {
        return neutralinoLspBridge?.stopServerSessions?.("java", { force: true });
      },
      onRuntimeRequired: showProjectJdkRequiredNotification,
      onLauncherRequired: showJdtLauncherRequiredNotification,
      folderWatcher: {
        setDerivedRoots: function(paths) { app.modules?.folderWatcher?.setDerivedRoots?.(paths); }
      }
    });
  }
  if (typeof window.registerMarkdownViewerLspServerRegistry === "function") {
    lspServerRegistry = window.registerMarkdownViewerLspServerRegistry(app, {
      getDesktopAppRootPath,
      getJavaLanguageServerExecutable,
      getJavaExecutableForJdkHome,
      getWorkspaceRoot: function() { return activeFolderPath || ""; },
      getJavaWorkspaceModel: function() { return javaWorkspaceController?.getModel?.() || null; },
      getJavaWorkspaceRuntime: function() { return javaWorkspaceController?.getRuntime?.() || null; },
      getValidatedJdtProjectRoots: function() { return analysisGenerationCoordinator?.getValidatedProjectRoots?.() || []; },
      getConfiguredJdks: function() { return jdkRegistry?.list?.() || []; },
      getConfiguredGradles: getJavaConverterGradleInstallations,
      getProfileDataDirPath: recentItems.getProfileDataDirPath,
      getMaximumProblems: getJdtMaximumProblems,
      isNeutralinoRuntime,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (lspServerRegistry && typeof window.registerMarkdownViewerNeutralinoLspBridge === "function") {
    neutralinoLspBridge = window.registerMarkdownViewerNeutralinoLspBridge(app, {
      appDebugLog,
      diagnosticLifecycleTrace,
      getAnalysisGenerationCoordinator: function() { return analysisGenerationCoordinator; },
      registry: lspServerRegistry,
      processRouter: spawnedProcessRouter,
      workspaceActivityClient,
      jdtProxyClient,
      getJavaWorkspaceController: function() { return javaWorkspaceController; },
      onJavaAnalysisFailure: handleJavaAnalysisFailure,
      onJdtUnavailable: showJdtUnavailableNotification,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerKotlinWorkspaceCoordinator === "function") {
    kotlinWorkspaceCoordinator = window.registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
      registry: lspServerRegistry,
      bridge: neutralinoLspBridge,
      diagnosticLifecycleTrace,
      analysisGenerationCoordinator,
      kotlinClient: kotlinAdapterClient,
      jdtClient: jdtProxyClient,
      javaController: javaWorkspaceController,
      getJavaState: function() { return javaWorkspaceController?.getState?.() || null; },
      isAutoStartEnabled: isLanguageServerAutoStartEnabled,
      normalizePath: normalizeLocalPath,
      getStatusManager: function() { return app.modules?.statusManager || null; }
    });
    javaWorkspaceController?.subscribe?.(kotlinWorkspaceCoordinator.onJavaStateChanged);
  }
  if (typeof window.registerMarkdownViewerLspRequestClient === "function") {
    lspRequestClient = window.registerMarkdownViewerLspRequestClient(app);
  }
  if (typeof window.registerMarkdownViewerJdtProjectInventoryClient === "function") {
    jdtProjectInventoryClient = window.registerMarkdownViewerJdtProjectInventoryClient(app, {
      requestClient: lspRequestClient,
      getJdtSession: function(workspaceRoot) {
        return jdtProxyClient?.getSession?.(`java:${normalizeLocalPath(workspaceRoot)}`) || null;
      }
    });
  }
  if (lspServerRegistry && typeof window.registerMarkdownViewerLspVsixInstaller === "function") {
    lspVsixInstaller = window.registerMarkdownViewerLspVsixInstaller(app, {
      appDebugLog,
      registry: lspServerRegistry,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  let javaSourceActionsModule = null;
  if (lspServerRegistry && neutralinoLspBridge && typeof window.registerMarkdownViewerJavaSourceActions === "function") {
    javaSourceActionsModule = window.registerMarkdownViewerJavaSourceActions(app, {
      appDebugLog,
      sourceActions,
      languageRegistry,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getLspSession: getLspSessionForEditor,
      updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
      updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (typeof window.registerMarkdownViewerJavaSurroundWithActions === "function") {
    window.registerMarkdownViewerJavaSurroundWithActions(app, {
      appDebugLog,
      sourceActions,
      templates: window.markdownViewerJavaSurroundWithTemplates,
      javaSourceActions: javaSourceActionsModule,
      activeEditorCommands,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
      updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
      updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaPullUpActions === "function") {
    window.registerMarkdownViewerJavaPullUpActions(app, {
      appDebugLog,
      sourceActions,
      javaSourceActions: javaSourceActionsModule,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getWorkspaceEditPreview: function() { return app.modules?.workspaceEditPreview || null; },
      isDesktopRuntime: function() { return isNeutralinoRuntime(); },
      suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
      reloadFolderTree: function(options) { return reloadOpenFolderTree(options); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaPushDownActions === "function") {
    window.registerMarkdownViewerJavaPushDownActions(app, {
      appDebugLog,
      sourceActions,
      javaSourceActions: javaSourceActionsModule,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getWorkspaceEditPreview: function() { return app.modules?.workspaceEditPreview || null; },
      isDesktopRuntime: function() { return isNeutralinoRuntime(); },
      suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
      reloadFolderTree: function(options) { return reloadOpenFolderTree(options); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaExtractInterfaceActions === "function") {
    window.registerMarkdownViewerJavaExtractInterfaceActions(app, {
      appDebugLog,
      sourceActions,
      javaSourceActions: javaSourceActionsModule,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getWorkspaceEditPreview: function() { return app.modules?.workspaceEditPreview || null; },
      isDesktopRuntime: function() { return isNeutralinoRuntime(); },
      readUri: async function(uri) {
        const path = lspServerRegistry?.fromFileUri?.(uri) || "";
        if (!path) throw new Error("JDT returned a non-local Java reference.");
        const normalizedPath = String(path).replace(/\\/g, "/").toLowerCase();
        const workspaceRoot = String(activeFolderPath || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
        if (!workspaceRoot || (normalizedPath !== workspaceRoot && !normalizedPath.startsWith(`${workspaceRoot}/`))) return "";
        if (normalizedPath === String(getActiveEditorPathForLanguage() || "").replace(/\\/g, "/").toLowerCase()) {
          return activeEditorCommands.getActiveEditorValue();
        }
        const snapshot = tabsModule?.getExternalDocumentSnapshot?.(path);
        return snapshot?.content ?? Neutralino.filesystem.readFile(path);
      },
      suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
      reloadFolderTree: function(options) { return reloadOpenFolderTree(options); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaExtractMethodActions === "function") {
    window.registerMarkdownViewerJavaExtractMethodActions(app, {
      appDebugLog,
      sourceActions,
      javaSourceActions: javaSourceActionsModule,
      activeEditorCommands,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getWorkspaceEditPreview: function() { return app.modules?.workspaceEditPreview || null; },
      isDesktopRuntime: function() { return isNeutralinoRuntime(); },
      updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
      updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
  if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaIntroduceParameterObjectActions === "function") {
    window.registerMarkdownViewerJavaIntroduceParameterObjectActions(app, {
      appDebugLog,
      sourceActions,
      javaSourceActions: javaSourceActionsModule,
      activeEditorCommands,
      lspServerRegistry,
      requestClient: lspRequestClient,
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
      getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getWorkspaceEditPreview: function() { return app.modules?.workspaceEditPreview || null; },
      isDesktopRuntime: function() { return isNeutralinoRuntime(); },
      readUri: async function(uri) {
        const path = lspServerRegistry?.fromFileUri?.(uri) || "";
        if (!path) throw new Error("JDT returned a non-local Java reference.");
        const normalizedPath = String(path).replace(/\\/g, "/").toLowerCase();
        const workspaceRoot = String(activeFolderPath || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
        if (!workspaceRoot || (normalizedPath !== workspaceRoot && !normalizedPath.startsWith(`${workspaceRoot}/`))) return "";
        if (normalizedPath === String(getActiveEditorPathForLanguage() || "").replace(/\\/g, "/").toLowerCase()) {
          return activeEditorCommands.getActiveEditorValue();
        }
        const snapshot = tabsModule?.getExternalDocumentSnapshot?.(path);
        return snapshot?.content ?? Neutralino.filesystem.readFile(path);
      },
      suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
      reloadFolderTree: function(options) { return reloadOpenFolderTree(options); },
      updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
      updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
      updateStatusLine: function() { updateStatusLine(); },
      alertUser: function(message) { alert(message); }
    });
  }
    if (javaSourceActionsModule && lspRequestClient && typeof window.registerMarkdownViewerJavaAddImportActions === "function") {
      window.registerMarkdownViewerJavaAddImportActions(app, {
        appDebugLog,
        javaSourceActions: javaSourceActionsModule,
        lspServerRegistry,
        requestClient: lspRequestClient,
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaGetterSetterActions === "function") {
      window.registerMarkdownViewerJavaGetterSetterActions(app, {
        appDebugLog,
        sourceActions,
        javaSourceActions: javaSourceActionsModule,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaToStringActions === "function") {
      window.registerMarkdownViewerJavaToStringActions(app, {
        sourceActions,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaConstructorActions === "function") {
      window.registerMarkdownViewerJavaConstructorActions(app, {
        sourceActions,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaSuperclassConstructorActions === "function") {
      window.registerMarkdownViewerJavaSuperclassConstructorActions(app, {
        sourceActions,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveEditorPath: getActiveEditorPathForLanguage,
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        readFile: function(path) { return Neutralino.filesystem.readFile(path); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaOverrideMethodActions === "function") {
      window.registerMarkdownViewerJavaOverrideMethodActions(app, {
        sourceActions,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveEditorPath: getActiveEditorPathForLanguage,
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        readFile: function(path) { return Neutralino.filesystem.readFile(path); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaEqualsHashCodeActions === "function") {
      window.registerMarkdownViewerJavaEqualsHashCodeActions(app, {
        sourceActions,
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
    if (typeof window.registerMarkdownViewerJavaExternalizeStringsActions === "function") {
      window.registerMarkdownViewerJavaExternalizeStringsActions(app, {
        sourceActions,
        filesystem: typeof Neutralino !== "undefined" ? Neutralino.filesystem : {},
        isActiveJavaFile: function() { return /\.java$/i.test(String(getActiveEditorPathForLanguage() || "")); },
        isDesktopRuntime: function() { return isNeutralinoRuntime(); },
        getActiveEditorPath: getActiveEditorPathForLanguage,
        getActiveCodeMirrorEditor: function() { return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null; },
        getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
        suppressFolderWatcher: function(milliseconds) { app.modules?.folderWatcher?.suppress?.(milliseconds); },
        reloadFolderTree: function(options) { return reloadOpenFolderTree(options); },
        updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
        updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
        updateStatusLine: function() { updateStatusLine(); },
        alertUser: function(message) { alert(message); }
      });
    }
  if (typeof window.registerMarkdownViewerNeutralinoAiBridge === "function") {
    neutralinoAiBridge = window.registerMarkdownViewerNeutralinoAiBridge(app, {
      appDebugLog,
      getDesktopAppRootPath,
      getSettings: function() { return getAiCompanionSettings(); },
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); },
      getProfileDataDirPath: recentItems.getProfileDataDirPath,
      getMaximumProblems: getJdtMaximumProblems,
      joinPath,
      processRouter: spawnedProcessRouter,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    });
  }
  if (typeof window.registerMarkdownViewerAiSecuritySettings === "function") {
    aiSecuritySettings = window.registerMarkdownViewerAiSecuritySettings(app, {
      bridge: neutralinoAiBridge,
      getSettings: function() { return getAiCompanionSettings(); },
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); }
    });
  }
  if (typeof window.registerMarkdownViewerAiApprovalSettings === "function") {
    aiApprovalSettings = window.registerMarkdownViewerAiApprovalSettings(app, {
      bridge: neutralinoAiBridge,
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); }
    });
  }
  // Model registry must register before the panel: the panel's context indicator resolves the
  // configured model's context window through app.modules.aiCompanionModelRegistry.
  const aiCompanionModelRegistry = typeof window.registerMarkdownViewerAiCompanionModelRegistry === "function"
    ? window.registerMarkdownViewerAiCompanionModelRegistry(app, {
      isNeutralinoRuntime,
      getProfileDataDirPath: function() { return recentItems.getProfileDataDirPath(); },
      joinPath,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
    })
    : null;
  if (neutralinoAiBridge && typeof window.registerMarkdownViewerAiCompanionPanel === "function") {
    aiCompanionPanel = window.registerMarkdownViewerAiCompanionPanel(app, {
      bridge: neutralinoAiBridge,
      get editorActionTools() { return aiCompanionEditorActionTools; },
      get settingsTools() { return aiCompanionSettingsTools; },
      get conversionExportTools() { return aiCompanionConversionExportTools; },
      get structuredExecutionActions() { return structuredExecutionActions; },
      get graphCompanionControl() { return graphCompanionControl; },
      getSettings: function() { return getAiCompanionSettings(); },
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); },
      getActiveFolderName: function() { return activeFolderName || ""; },
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getTabs: function() { return tabs; },
      getActiveTabId: function() { return activeTabId; },
      getActiveEditorSelection: function() { return getActiveEditorSelection(); },
      getUnsavedTabs: function() { return tabsModule?.getUnsavedTabs?.() || []; },
      getFolderMarkdownFiles: function() { return folderMarkdownFiles || []; },
      getProfileDataDirPath: recentItems.getProfileDataDirPath,
      getMaximumProblems: getJdtMaximumProblems,
      refreshApiClientFromAgentTool: function(event) { return apiClient?.refreshFromStorage?.({ source: "ai-companion", tool: event?.tool || "" }); },
      refreshWorkspaceGitFromAgentTool: function() { return app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.(); },
      appDebugLog,
      loadGlobalState: function() { return loadGlobalState(); },
      saveGlobalState: function(patch) { return saveGlobalState(patch); },
      isNeutralinoRuntime,
      get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
      getActiveEditorPath: getActiveEditorPathForLanguage,
      getActiveEditorContent: function() { return getActiveEditorValue(); },
      getFileName,
      joinPath,
      openDocumentSourceFile,
      reloadOpenTabsFromDisk: function(path) { return app.modules?.folderWatcher?.reloadOpenTabsFromDisk?.(path); },
      focusEditorLine: function(line) {
        const offset = getEditorOffsetForLineNumber(line);
        setActiveEditorSelection(offset, offset);
        scrollEditorFindMatchIntoView({ start: offset, end: offset });
      },
      openFileCompareInTab: function(compareDescriptor) {
        return tabsModule?.openFileCompareInTab?.(compareDescriptor) || null;
      },
      openMarkdownInNewTab: function(markdown) {
        return tabsModule?.newTab?.(String(markdown || ""), null, { viewMode: "preview" }) || null;
      },
      shouldConfirmEditedPromptAttachmentRemoval,
      confirm: confirmWithAppModal,
      openPathInExplorer: async function(path) {
        if (!isNeutralinoRuntime() || typeof Neutralino === "undefined" || !Neutralino.os?.open) return;
        await Neutralino.os.open(path);
      },
      getWorkspaceSearch: function() { return app.modules?.workspaceSearch || null; },
      getBottomPanel: function() { return app.modules?.bottomPanelTabs || null; },
      getSidebarView: function() { return app.modules?.workspaceSearch?.getActiveSidebarView?.() || "files"; },
      setSidebarView: function(view) { return app.modules?.workspaceSearch?.setSidebarView?.(view); },
      isSidebarVisible,
      setSidebarVisible,
      renderMarkdownContent: function(target, markdown, options) {
        return markdownRender?.renderMarkdownContent?.(target, markdown, options) === true;
      }
    });
  }
  if (aiCompanionModelRegistry && typeof window.registerMarkdownViewerAiCompanionModelsSettings === "function") {
    window.registerMarkdownViewerAiCompanionModelsSettings(app, {
      registry: aiCompanionModelRegistry,
      openDocumentSourceFile,
      onRegistryChanged: function() { app.modules?.aiCompanionPanel?.refreshModeMessages?.(); }
    });
  }
  if (neutralinoAiBridge && typeof window.registerMarkdownViewerAiCompanionPromptsSettings === "function") {
    window.registerMarkdownViewerAiCompanionPromptsSettings(app, {
      bridge: neutralinoAiBridge,
      notify: notificationModal,
      onPromptsChanged: function() { app.modules?.aiCompanionPanel?.refreshModeMessages?.(); }
    });
  }
  const sourceRoot = window.registerMarkdownViewerSourceRoot(app, {
    get activeFolderPath() { return activeFolderPath; },
    joinPath,
    isAbsoluteFilesystemPath,
    isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    alert,
    onSourceRootChanged: handleSourceRootChanged
  });
  const loadSourceRootMetadata = sourceRoot.loadSourceRootMetadata;
  const getOriginalSourceRootPath = sourceRoot.getOriginalSourceRootPath;
  const promptForSourceRoot = sourceRoot.promptForSourceRoot;
  const resolveOriginalSourcePath = sourceRoot.resolveOriginalSourcePath;
  const findGeneratedProjectFolderFromPath = sourceRoot.findGeneratedProjectFolderFromPath;
  const clearSourceRootMetadataCache = sourceRoot.clearSourceRootMetadataCache;


  function canTryBundledLanguageServerInstall(server, status) {
    if (!server || status?.desktopRuntime !== true) return false;
    if (typeof lspVsixInstaller?.ensureBundledLanguageServerInstalled !== "function") return false;
    if (server.id === "java") return status.installed !== true;
    return server.id === "xml";
  }

  async function ensureBundledLanguageServerInstallForEditor(server, status) {
    if (!canTryBundledLanguageServerInstall(server, status)) return status;
    let pendingInstall = bundledLanguageServerInstallPromises.get(server.id);
    if (!pendingInstall) {
      pendingInstall = lspVsixInstaller.ensureBundledLanguageServerInstalled(server.id)
        .then((result) => {
          if (result?.installed) {
            void appDebugLog?.("info", "[lsp] Installed bundled language server", {
              serverId: server.id,
              reason: result.reason || "installed"
            });
          } else if (result?.reason && result.reason !== "already-installed") {
            void appDebugLog?.("debug", "[lsp] Bundled language server not installed", {
              serverId: server.id,
              reason: result.reason
            });
          }
          return result;
        })
        .catch((error) => {
          void appDebugLog?.("warning", "[lsp] Bundled language server install failed", {
            serverId: server.id,
            message: error?.message || String(error)
          });
          return null;
        })
        .finally(() => {
          bundledLanguageServerInstallPromises.delete(server.id);
        });
      bundledLanguageServerInstallPromises.set(server.id, pendingInstall);
    }
    await pendingInstall;
    return lspServerRegistry.getServerStatus(server.id);
  }
  async function openLspDefinitionTarget(target = {}) {
    const uri = String(target?.uri || "").trim();
    const path = lspServerRegistry?.fromFileUri?.(uri) || "";
    if (!path) {
      void appDebugLog?.("debug", "[lsp] Cross-file definition target skipped", { reason: "unsupported-uri", uri });
      return false;
    }
    try {
      const tab = await openDocumentSourceFile({ name: getFileName(path), path }, { pinExisting: true });
      if (!tab) {
        void appDebugLog?.("warning", "[lsp] Cross-file definition target did not open", { uri, path });
        return false;
      }
      const start = target?.range?.start || null;
      if (start) {
        const selectTarget = function() {
          const offset = getEditorOffsetForLspPosition(start);
          selectEditorTextRange(offset, offset);
        };
        selectTarget();
        window.requestAnimationFrame(selectTarget);
      }
      void appDebugLog?.("debug", "[lsp] Cross-file definition target opened", { uri, path, tabId: tab.id || null });
      return true;
    } catch (error) {
      void appDebugLog?.("warning", "[lsp] Cross-file definition target failed", {
        uri,
        path,
        message: error?.message || String(error)
      });
      return false;
    }
  }
  async function getLspSessionForEditor(options = {}) {
    if (!lspServerRegistry || !neutralinoLspBridge) {
      void appDebugLog?.("debug", "[lsp] Editor session skipped", { reason: "registry-or-bridge-missing" });
      return null;
    }
    const language = options.language || null;
    const codeMirrorLanguage = language?.codeMirrorLanguage || options.codeMirrorLanguage || "";
    const path = lspServerRegistry.normalizeLocalPath(options.path || "");
    if (!path) {
      jdtProxyClient?.clearActiveDocuments?.();
      void appDebugLog?.("debug", "[lsp] Editor session skipped", {
        reason: "missing-path",
        languageId: language?.id || "",
        codeMirrorLanguage
      });
      return null;
    }
    const server = lspServerRegistry.getServerForLanguage(language?.id || codeMirrorLanguage || "");
    if (server?.id !== "java") jdtProxyClient?.clearActiveDocuments?.();
    void appDebugLog?.("debug", "[lsp] Resolving editor language server session", {
      path,
      languageId: language?.id || "",
      codeMirrorLanguage,
      serverId: server?.id || ""
    });
    if (!server) return null;
    const autoStartEnabled = isLanguageServerAutoStartEnabled(server.id);
    const hasRunningSession = autoStartEnabled
      ? true
      : await neutralinoLspBridge.hasRunningSessionForFile?.({ server, filePath: path });
    if (!autoStartEnabled && !hasRunningSession) {
      void appDebugLog?.("debug", "[lsp] Editor session skipped", {
        reason: "autostart-disabled-and-no-running-session",
        path,
        serverId: server.id,
        languageId: language?.id || "",
        codeMirrorLanguage
      });
      return null;
    }
    let status = await lspServerRegistry.getServerStatus(server.id);
    if (autoStartEnabled && canTryBundledLanguageServerInstall(server, status)) {
      status = await ensureBundledLanguageServerInstallForEditor(server, status);
    }
    if (!status.desktopRuntime || !status.installed) {
      void appDebugLog?.("debug", "[lsp] Editor session skipped", {
        reason: "server-not-installed-or-not-desktop",
        path,
        serverId: server.id,
        languageId: language?.id || "",
        codeMirrorLanguage,
        desktopRuntime: status.desktopRuntime === true,
        installed: status.installed === true,
        missingFiles: status.missingFiles || []
      });
      return null;
    }
    const session = await neutralinoLspBridge.ensureSession({ server, filePath: path });
    if (!session) {
      void appDebugLog?.("debug", "[lsp] Editor session skipped", {
        reason: "bridge-returned-no-session",
        path,
        serverId: server.id,
        languageId: language?.id || "",
        codeMirrorLanguage
      });
      return null;
    }
    const lspLanguageId = lspServerRegistry.getLspLanguageId(server, codeMirrorLanguage);
    void appDebugLog?.("debug", "[lsp] Editor session resolved", {
      path,
      serverId: server.id,
      languageId: language?.id || "",
      codeMirrorLanguage,
      lspLanguageId,
      rootUri: session.rootUri || "",
      processId: session.processId ?? "",
      processPid: session.processPid ?? ""
    });
    return {
      fileUri: lspServerRegistry.toFileUri(path),
      languageId: lspLanguageId,
      rootUri: session.rootUri,
      initializationOptions: session.initializationOptions || {},
      workspaceConfiguration: lspServerRegistry.getServerWorkspaceConfiguration(server.id, {
        filePath: path,
        content: typeof options.content === "string" ? options.content : options.view?.state?.doc?.toString?.() || ""
      }),
      transport: session.transport
    };
  }

  function logCacheClear(name, details = {}) {
    void appDebugLog?.("info", `[cache] ${name}`, details);
  }

  function clearGraphRenderCache(details = {}) {
    const entryCount = graphRenderCache.size;
    graphRenderCache.forEach((entry) => {
      if (typeof entry?.destroy === "function") entry.destroy();
      else {
        if (entry?.simulation) entry.simulation.stop();
        if (entry?.wrapper) entry.wrapper.remove();
      }
    });
    graphRenderCache.clear();
    logCacheClear("Clear graph render cache", { ...details, entryCount });
  }

  function clearGraphPersistenceCache(details = {}) {
    clearGraphPersistenceCaches?.();
    logCacheClear("Clear graph persistence cache", details);
  }

  function clearMarkdownContentCache(details = {}) {
    clearFolderMarkdownContentCache?.();
    logCacheClear("Clear Markdown content cache", details);
  }

  function clearProjectDerivedCaches(details = {}) {
    clearGraphPersistenceCache(details);
    clearMarkdownContentCache(details);
    clearGraphRenderCache(details);
  }

  async function invalidateWorkspaceDerivedState(options = {}) {
    const {
      reason = "workspace-files-changed",
      paths = [],
      reloadTree = false,
      refreshGraphs = true,
      refreshSourceRoot = false,
      forceSourceRoot = false,
      refreshOpenFolderFileTabs = false,
      renderActiveMarkdown = true
    } = options || {};

    logCacheClear("Clear central workspace derived state", {
      reason,
      paths: Array.isArray(paths) ? paths : [],
      reloadTree,
      refreshGraphs,
      refreshSourceRoot,
      refreshOpenFolderFileTabs
    });
    clearProjectDerivedCaches({ trigger: "invalidateWorkspaceDerivedState", reason });
    if (refreshSourceRoot) {
      await refreshSourceRootMetadata({ force: forceSourceRoot });
    }

    let treeReloaded = false;
    let graphTabsRefreshed = false;
    if (reloadTree) {
      treeReloaded = await reloadOpenFolderTree();
      graphTabsRefreshed = treeReloaded;
    } else if (refreshGraphs) {
      graphTabsRefreshed = await refreshOpenFolderGraphTabsFromFolderFiles();
    }

    let openFolderFileTabsRefreshed = false;
    if (refreshOpenFolderFileTabs) {
      tabs.forEach((tab) => {
        if (tab && tab.type !== "graph" && tab.isOpenFolderFile) {
          tab.renderVersion = Number(tab.renderVersion || 0) + 1;
          openFolderFileTabsRefreshed = true;
        }
      });
      if (openFolderFileTabsRefreshed && renderActiveMarkdown && typeof renderMarkdown === "function") {
        renderMarkdown();
      }
      if (openFolderFileTabsRefreshed) saveTabsToStorage(tabs);
    }

    return {
      reason,
      paths: Array.isArray(paths) ? paths : [],
      treeReloaded,
      graphTabsRefreshed,
      openFolderFileTabsRefreshed
    };
  }

  app.services.invalidateWorkspaceDerivedState = invalidateWorkspaceDerivedState;

  const recoveryUpdater = window.registerMarkdownViewerRecoveryUpdater?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    isNeutralinoRuntime,
    joinPath,
    findGeneratedProjectFolderFromPath,
    get activeFolderPath() { return activeFolderPath; },
    get graphMavenRecovery() { return graphMavenRecovery; },
    runRecoveryBatch: async (batchPath) => graphMavenRecovery?.runRecoveryBatch?.(batchPath),
    onProjectUpdated: async () => {
      await invalidateWorkspaceDerivedState({
        reason: "dependency-recovery-updated-project",
        reloadTree: true
      });
    },
    escapeHtml,
    mavenRuntimeTree: window.MdEditorMavenRuntimeTree
  });
  const readRecentItems = recentItems.readRecentItems;
  const getRecentItemKey = recentItems.getRecentItemKey;
  const getPersistedRecentHandle = recentItems.getPersistedRecentHandle;
  const ensureFileSystemHandlePermission = recentItems.ensureFileSystemHandlePermission;
  const rememberRecentFile = recentItems.rememberRecentFile;
  const rememberRecentFolder = recentItems.rememberRecentFolder;
  const ensureRecentMenuContainers = recentItems.ensureRecentMenuContainers;
  const hydrateRecentItemsFromProfile = recentItems.hydrateRecentItemsFromProfile;
  const hydrateGlobalStateFromProfile = recentItems.hydrateGlobalStateFromProfile;
  const hydrateRecentHandlesFromIndexedDB = recentItems.hydrateRecentHandlesFromIndexedDB;
  const scheduleGlobalProfileWrite = recentItems.scheduleGlobalProfileWrite;
  const applyRecentItemLimits = recentItems.applyRecentItemLimits;
  const clearRecentHistory = recentItems.clearRecentHistory;
  const RECENT_FILES_KEY = recentItems.keys.files;
  const RECENT_FOLDERS_KEY = recentItems.keys.folders;
  const recentActions = window.registerMarkdownViewerRecentActions(app, {
    RECENT_FILES_KEY,
    RECENT_FOLDERS_KEY,
    readRecentItems,
    getRecentItemKey,
    getPersistedRecentHandle,
    getFileName,
    ensureFileSystemHandlePermission,
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    get openFolderTreeFromNeutralinoPath() { return openFolderTreeFromNeutralinoPath; },
    get activeFolderName() { return activeFolderName; },
    set activeFolderName(value) { activeFolderName = value; },
    get activeFolderHandle() { return activeFolderHandle; },
    set activeFolderHandle(value) { activeFolderHandle = value; },
    get activeFolderPath() { return activeFolderPath; },
    set activeFolderPath(value) { activeFolderPath = value; },
    get listMarkdownTree() { return listMarkdownTree; },
    get collectMarkdownFilesFromTree() { return collectMarkdownFilesFromTree; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    set folderMarkdownFiles(value) { folderMarkdownFiles = value; },
    get renderFolderTree() { return renderFolderTree; },
    rememberRecentFolder,
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    alert: function(message) { window.alert(message); }
  });
  const openRecentFile = recentActions.openRecentFile;
  const openRecentFolder = recentActions.openRecentFolder;
  const removeRecentItem = recentItems.removeRecentItem;

  document.addEventListener("click", function(event) {
    const recentRemoveButton = event.target.closest(".recent-menu-remove");
    if (recentRemoveButton) {
      const recentItem = recentRemoveButton.closest(".recent-menu-item");
      if (!recentItem) return;
      event.preventDefault();
      event.stopPropagation();
      removeRecentItem(
        recentItem.dataset.recentType === "folder" ? RECENT_FOLDERS_KEY : RECENT_FILES_KEY,
        recentItem.dataset.recentKey
      );
      return;
    }

    const recentButton = event.target.closest(".recent-menu-item");
    if (!recentButton) return;

    event.preventDefault();

    if (recentButton.dataset.recentType === "folder") {
      openRecentFolder(recentButton.dataset.recentKey);
    } else {
      openRecentFile(recentButton.dataset.recentKey);
    }
  });

  document.addEventListener("keydown", function(event) {
    const recentRemoveButton = event.target.closest?.(".recent-menu-remove");
    if (!recentRemoveButton || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    recentRemoveButton.click();
  });

  markdownPreview.addEventListener("click", handlePreviewLinkClick);
  markdownPreview.addEventListener("mouseover", handlePreviewLinkMouseOver);
  markdownPreview.addEventListener("mouseout", handlePreviewLinkMouseOut);

  function ensureFolderTreePane() {
    let pane = document.getElementById("folder-tree-pane");
    if (pane || !contentContainer) return;

    pane = document.createElement("aside");
    pane.className = "folder-tree-pane";
    pane.id = "folder-tree-pane";
    pane.innerHTML = `
      <div class="sidebar-width-resizer" id="sidebar-width-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabindex="0"></div>
      <nav class="sidebar-view-rail" aria-label="Sidebar views">
        <button class="sidebar-view-rail-button sidebar-view-option active" type="button" data-sidebar-rail-icon="files" data-sidebar-view="files" title="Files" aria-label="Files" aria-pressed="true">
          <i class="bi bi-files" aria-hidden="true"></i><span class="sidebar-view-rail-label">Files</span>
        </button>
        <button class="sidebar-view-rail-button sidebar-view-option" type="button" data-sidebar-rail-icon="search" data-sidebar-view="search" title="Workspace Search" aria-label="Workspace Search" aria-pressed="false">
          <i class="bi bi-search" aria-hidden="true"></i><span class="sidebar-view-rail-label">Search</span>
        </button>
        <button class="sidebar-view-rail-button sidebar-view-option" type="button" data-sidebar-rail-icon="git" data-sidebar-view="git" title="Git" aria-label="Git" aria-pressed="false">
          <i class="bi bi-git" aria-hidden="true"></i><span class="sidebar-view-rail-label">Git</span>
        </button>
        <button class="sidebar-view-rail-button sidebar-view-option" type="button" data-sidebar-rail-icon="api-client" data-sidebar-view="api-client" title="API Client" aria-label="API Client" aria-pressed="false">
          <i class="bi bi-send" aria-hidden="true"></i><span class="sidebar-view-rail-label">API</span>
        </button>
        <button class="sidebar-view-rail-button open-regex-tester" type="button" data-sidebar-rail-icon="regex-tester" title="Regex-Tester" aria-label="Regex-Tester" aria-pressed="false">
          <i class="bi bi-regex" aria-hidden="true"></i><span class="sidebar-view-rail-label">Regex</span>
        </button>
        <button class="sidebar-view-rail-button open-code-converter-dialog" type="button" data-sidebar-rail-icon="convert" title="Convert Code to MD" aria-label="Convert Code to MD">
          <i class="bi bi-code-slash" aria-hidden="true"></i><span class="sidebar-view-rail-label">Convert</span>
        </button>
        <button class="sidebar-view-rail-button sidebar-view-option sidebar-ai-companion-rail-button" type="button" data-sidebar-rail-icon="ai-companion" data-sidebar-view="ai-companion" title="AI Companion workspace" aria-label="AI Companion workspace" aria-pressed="false">
          <i class="bi bi-stars" aria-hidden="true"></i><span class="sidebar-view-rail-label">AI</span>
        </button>
        <button class="sidebar-view-rail-button sidebar-settings-rail-button open-settings-dialog" type="button" data-sidebar-rail-icon="settings" title="Open settings" aria-label="Settings">
          <i class="bi bi-gear" aria-hidden="true"></i><span class="sidebar-view-rail-label">Settings</span>
        </button>
      </nav>
      <div class="folder-tree-content">
        <div class="folder-tree-topbar">
          <div class="folder-tree-toolbar" role="toolbar" aria-label="Folder tree tools">
            <button class="folder-tree-tool-button toggle-folder-tree-expanded" type="button" title="Open a folder to expand or collapse folders" aria-label="Expand or collapse all folders" disabled aria-disabled="true">
              <i class="bi bi-arrows-expand" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button toggle-auto-select-file" type="button" title="Open a folder to enable Auto select file" aria-label="Auto select file Off" aria-pressed="true" disabled aria-disabled="true">
              <i class="bi bi-crosshair" aria-hidden="true"></i>
              <span class="auto-select-file-label visually-hidden">Auto select file Off</span>
            </button>
            <button class="folder-tree-tool-button open-graph-view" type="button" title="Open a folder to open Graph View" aria-label="Open Graph View" disabled aria-disabled="true">
              <i class="bi bi-diagram-3" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button export-folder-to-graph" type="button" title="Create a portable graph archive that includes Markdown file contents." aria-label="Export Folder to Graph" disabled aria-disabled="true">
              <i class="bi bi-download" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button toggle-unsupported-files" type="button" title="Open a folder to show unsupported file types" aria-label="Show unsupported file types in the folder view" aria-pressed="false" disabled aria-disabled="true">
              <i class="bi bi-file-earmark-x" aria-hidden="true"></i>
            </button>
            <div class="folder-tree-sort-menu dropdown">
              <button class="folder-tree-tool-button folder-tree-sort-menu-button dropdown-toggle" type="button" id="folderTreeSortMenu" data-bs-toggle="dropdown" aria-expanded="false" title="Open a folder to sort files and folders" aria-label="Sort files and folders" disabled aria-disabled="true">
                <i class="bi bi-sort-alpha-down" aria-hidden="true"></i>
              </button>
              <div class="dropdown-menu action-menu folder-tree-sort-options" aria-labelledby="folderTreeSortMenu">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="name-asc">
                <span>File name (A to Z)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="name-desc">
                <span>File name (Z to A)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <hr class="dropdown-divider">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="modified-desc">
                <span>Modified time (new to old)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="modified-asc">
                <span>Modified time (old to new)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <hr class="dropdown-divider">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="created-desc">
                <span>Created time (new to old)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="created-asc">
                <span>Created time (old to new)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button class="folder-tree-tool-button toggle-folder-tree-filter" type="button" title="Open a folder to filter files and folders" aria-label="Filter files and folders" aria-expanded="false" disabled aria-disabled="true">
            <i class="bi bi-funnel" aria-hidden="true"></i>
          </button>
          <input id="folder-tree-filter-input" class="folder-tree-filter-input" type="search" placeholder="Filter files..." aria-label="Filter files and folders" hidden disabled>
        </div>
      </div>
      <div id="workspace-search-panel" class="workspace-search-panel" hidden>
        <div class="workspace-search-header">
          <h3 id="workspace-search-title" class="workspace-search-title">
            <span>Search</span>
            <span id="workspace-search-busy" class="workspace-search-busy" aria-hidden="true" hidden></span>
          </h3>
          <div class="workspace-search-header-actions">
            <button class="folder-tree-tool-button" id="workspace-search-run" type="button" title="Refresh search" aria-label="Refresh search">
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button" id="workspace-search-clear" type="button" title="Clear search" aria-label="Clear search">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="workspace-search-controls">
          <div class="workspace-search-input-row">
            <input id="workspace-search-query" class="workspace-search-input" type="search" autocomplete="off" placeholder="Search" aria-label="Search workspace content, frontmatter, and tags">
            <button class="workspace-search-inline-option" id="workspace-search-match-case" type="button" title="Match Case" aria-label="Match Case" aria-pressed="false">Aa</button>
          </div>
          <input id="workspace-search-replace" class="workspace-search-input" type="text" autocomplete="off" placeholder="Replace" aria-label="Replace">
          <label class="workspace-search-filter-label" for="workspace-search-include">files to include</label>
          <input id="workspace-search-include" class="workspace-search-input" type="text" autocomplete="off" placeholder="e.g. *.md, docs/**" aria-label="Files to include">
          <label class="workspace-search-filter-label" for="workspace-search-exclude">files to exclude</label>
          <input id="workspace-search-exclude" class="workspace-search-input" type="text" autocomplete="off" placeholder="e.g. node_modules, *.log" aria-label="Files to exclude">
          <label class="workspace-search-check">
            <input id="workspace-search-include-unsupported" type="checkbox"> Include unsupported text files
          </label>
          <div class="workspace-search-actions">
            <button class="workspace-search-text-button" id="workspace-search-preview-replace" type="button">Preview Replace</button>
            <button class="workspace-search-text-button primary" id="workspace-search-apply-replace" type="button" disabled>Apply Replace</button>
          </div>
        </div>
        <p id="workspace-search-status" class="workspace-search-status">Open a folder to search the workspace.</p>
        <div id="workspace-search-results" class="workspace-search-results" aria-live="polite">
          <div class="workspace-search-empty">Open a folder to search all workspace files.</div>
        </div>
      </div>
      <div id="workspace-git-panel" class="workspace-git-panel" hidden>
        <div class="workspace-git-header">
          <h3 class="workspace-git-title">
            <span>Git</span>
          </h3>
          <div class="workspace-git-header-actions">
            <button class="folder-tree-tool-button" id="workspace-git-refresh" type="button" title="Refresh Git status" aria-label="Refresh Git status">
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button workspace-git-reset-button" id="workspace-git-reset" type="button" title="Reset checkout to origin branch" aria-label="Reset checkout">
              <i class="bi bi-trash3-fill" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div id="workspace-git-summary" class="workspace-git-summary">
          <button id="workspace-git-branch-button" class="workspace-git-branch-button" type="button" aria-haspopup="menu" aria-expanded="false">
            <i class="bi bi-diagram-2" aria-hidden="true"></i>
            <span id="workspace-git-branch-name">Detached HEAD</span>
            <i class="bi bi-chevron-down" aria-hidden="true"></i>
          </button>
          <span id="workspace-git-tracking" class="workspace-git-tracking"></span>
          <span id="workspace-git-divergence" class="workspace-git-divergence"></span>
        </div>
        <div id="workspace-git-branch-dropdown" class="workspace-git-branch-dropdown hidden" role="menu" aria-labelledby="workspace-git-branch-button" aria-hidden="true">
          <div class="workspace-git-branch-dropdown-header">
            <strong>Switch branches</strong>
            <span id="workspace-git-branch-count" class="workspace-git-branch-count"></span>
          </div>
          <label class="workspace-git-branch-search">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input id="workspace-git-branch-search" type="search" placeholder="Find a branch..." autocomplete="off">
          </label>
          <div id="workspace-git-branch-state" class="workspace-git-branch-state">Refreshing branches...</div>
          <div id="workspace-git-branch-list" class="workspace-git-branch-list"></div>
          <button id="workspace-git-branch-view-all" class="workspace-git-branch-view-all" type="button" hidden>View all branches</button>
        </div>
        <div id="workspace-git-branch-modal" class="workspace-git-branch-modal hidden" role="dialog" aria-modal="true" aria-labelledby="workspace-git-branch-modal-title" aria-hidden="true">
          <div class="workspace-git-branch-dialog">
            <div class="workspace-git-branch-dialog-header">
              <div>
                <h5 id="workspace-git-branch-modal-title">Switch branches</h5>
                <div id="workspace-git-branch-modal-count" class="workspace-git-branch-count"></div>
              </div>
              <button id="workspace-git-branch-modal-close" class="folder-tree-tool-button" type="button" aria-label="Close branch switcher">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <label class="workspace-git-branch-search">
              <i class="bi bi-search" aria-hidden="true"></i>
              <input id="workspace-git-branch-modal-search" type="search" placeholder="Find a branch..." autocomplete="off">
            </label>
            <div class="workspace-git-branch-tabs" aria-hidden="true">
              <span class="active">Branches</span>
            </div>
            <div id="workspace-git-branch-modal-state" class="workspace-git-branch-state">Refreshing branches...</div>
            <div id="workspace-git-branch-modal-list" class="workspace-git-branch-list"></div>
          </div>
        </div>
        <p id="workspace-git-status" class="workspace-git-status">Open a local folder to use Git.</p>
        <button id="workspace-git-status-details" class="workspace-git-status-details-button" type="button" hidden>Read more</button>
        <div id="workspace-git-status-details-modal" class="workspace-git-status-details-modal hidden" role="dialog" aria-modal="true" aria-labelledby="workspace-git-status-details-title" aria-hidden="true">
          <div class="workspace-git-status-details-dialog">
            <div class="workspace-git-status-details-header">
              <h5 id="workspace-git-status-details-title">Git details</h5>
              <button id="workspace-git-status-details-close" class="folder-tree-tool-button" type="button" aria-label="Close Git details">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <pre id="workspace-git-status-details-content" class="workspace-git-status-details-content"></pre>
            <button id="workspace-git-status-details-done" class="workspace-git-text-button" type="button">Done</button>
          </div>
        </div>
        <div class="workspace-git-remote-actions" role="toolbar" aria-label="Git remote actions">
          <button class="workspace-git-text-button" id="workspace-git-fetch" type="button">Fetch</button>
          <button class="workspace-git-text-button" id="workspace-git-pull" type="button">Pull</button>
        </div>
        <section class="workspace-git-section">
          <div class="workspace-git-section-header">
            <div class="workspace-git-mode-selector dropdown">
              <button class="workspace-git-section-title workspace-git-mode-button dropdown-toggle" id="workspace-git-mode-menu-button" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <span id="workspace-git-mode-title">Changed Files</span>
              </button>
              <ul class="dropdown-menu workspace-git-mode-menu" aria-labelledby="workspace-git-mode-menu-button">
                <li><button class="dropdown-item workspace-git-mode-option" type="button" data-git-mode="push">Push mode</button></li>
                <li><button class="dropdown-item workspace-git-mode-option" type="button" data-git-mode="stash">Stash mode</button></li>
              </ul>
            </div>
          </div>
          <div class="workspace-git-section-controls">
            <label class="workspace-git-select-all">
              <input id="workspace-git-select-all-unstaged" type="checkbox" disabled>
              <span>Select all</span>
            </label>
            <div class="workspace-git-section-actions">
              <button class="workspace-git-text-button" id="workspace-git-stage" type="button">Stage</button>
              <button class="workspace-git-text-button danger" id="workspace-git-discard" type="button">Discard</button>
            </div>
          </div>
          <div id="workspace-git-unstaged-files" class="workspace-git-files" aria-live="polite">
            <div class="workspace-git-empty">Open a local folder to use Git.</div>
          </div>
        </section>
        <section class="workspace-git-section">
          <div class="workspace-git-section-header">
            <h4 class="workspace-git-section-title" id="workspace-git-secondary-title">Staged Files</h4>
          </div>
          <div class="workspace-git-section-controls">
            <label class="workspace-git-select-all" id="workspace-git-select-all-staged-label">
              <input id="workspace-git-select-all-staged" type="checkbox" disabled>
              <span>Select all</span>
            </label>
            <div class="workspace-git-section-actions">
              <button class="workspace-git-text-button" id="workspace-git-unstage" type="button">Unstage</button>
              <button class="workspace-git-text-button danger" id="workspace-git-stash-drop" type="button" hidden>Drop</button>
            </div>
          </div>
          <div id="workspace-git-staged-files" class="workspace-git-files" aria-live="polite">
            <div class="workspace-git-empty">Open a local folder to use Git.</div>
          </div>
        </section>
        <div id="workspace-git-ai-summary-block" class="workspace-git-ai-summary-block" hidden>
          <div class="workspace-git-ai-summary-header">
            <span class="workspace-git-ai-summary-title">AI change summary</span>
            <div class="workspace-git-ai-summary-tools">
              <button class="workspace-git-text-button" id="workspace-git-ai-summary-copy" type="button" title="Copy the summary markdown for PR notes">Copy</button>
              <button class="workspace-git-text-button" id="workspace-git-ai-summary-insert" type="button" title="Replace the commit message with the AI suggestion" hidden>Insert message</button>
              <button class="folder-tree-tool-button" id="workspace-git-ai-summary-dismiss" type="button" title="Dismiss the AI summary" aria-label="Dismiss the AI summary"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            </div>
          </div>
          <div id="workspace-git-ai-summary-progress" class="workspace-git-ai-summary-progress" aria-live="polite" hidden></div>
          <div id="workspace-git-ai-summary-content" class="workspace-git-ai-summary-content"></div>
        </div>
        <label class="workspace-git-commit-label" id="workspace-git-commit-label" for="workspace-git-commit-message">Commit message</label>
        <textarea id="workspace-git-commit-message" class="workspace-git-commit-message" rows="3"></textarea>
        <div class="workspace-git-commit-actions" id="workspace-git-commit-actions">
          <button class="workspace-git-text-button" id="workspace-git-ai-summary" type="button" hidden title="Summarize local changes and suggest a commit message">ג¨ AI summary</button>
          <button class="workspace-git-text-button primary" id="workspace-git-commit" type="button">Commit</button>
          <button class="workspace-git-text-button" id="workspace-git-push" type="button">Push</button>
        </div>
      </div>
      <div id="api-client-sidebar-panel" class="api-client-sidebar-panel" hidden>
        <div class="api-client-sidebar-header">
          <h3 class="api-client-sidebar-title">API Client</h3>
          <div class="api-client-sidebar-actions">
            <button class="folder-tree-tool-button api-client-sidebar-new-folder" type="button" title="New folder" aria-label="New folder">
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
            <button class="folder-tree-tool-button api-client-sidebar-save-current" type="button" title="Save current request" aria-label="Save current request">
              <i class="bi bi-save" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="api-client-sidebar-tabs" role="tablist" aria-label="API Client sidebar views">
          <button id="api-client-sidebar-tab-saved" class="api-client-sidebar-tab api-client-sidebar-tab-saved active" type="button" role="tab" aria-selected="true" aria-controls="api-client-sidebar-saved-panel">
            <i class="bi bi-folder" aria-hidden="true"></i><span>Saved</span>
          </button>
          <button id="api-client-sidebar-tab-history" class="api-client-sidebar-tab api-client-sidebar-tab-history" type="button" role="tab" aria-selected="false" aria-controls="api-client-sidebar-history-panel">
            <i class="bi bi-clock-history" aria-hidden="true"></i><span>History</span>
          </button>
          <button id="api-client-sidebar-tab-environments" class="api-client-sidebar-tab api-client-sidebar-tab-environments" type="button" role="tab" aria-selected="false" aria-controls="api-client-sidebar-environments-panel">
            <i class="bi bi-cloud" aria-hidden="true"></i><span>Env</span>
          </button>
        </div>
        <label class="api-client-sidebar-filter" for="api-client-sidebar-filter">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input id="api-client-sidebar-filter" class="api-client-sidebar-filter-input" type="search" placeholder="Filter saved requests, history, and variables" aria-label="Filter saved requests, history, and variables">
        </label>
        <section id="api-client-sidebar-saved-panel" class="api-client-sidebar-section api-client-saved-section" role="tabpanel" aria-labelledby="api-client-sidebar-tab-saved">
          <div class="api-client-sidebar-section-title">Saved Requests</div>
          <div id="api-client-saved-tree" class="api-client-saved-tree"></div>
        </section>
        <section id="api-client-sidebar-history-panel" class="api-client-sidebar-section api-client-history-section" role="tabpanel" aria-labelledby="api-client-sidebar-tab-history" hidden>
          <div class="api-client-sidebar-section-title">
            <span>History</span>
            <button class="folder-tree-tool-button api-client-history-delete-selected" type="button" title="Delete selected history entry" aria-label="Delete selected history entry" disabled>
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div id="api-client-sidebar-history" class="api-client-sidebar-history"></div>
        </section>
        <section id="api-client-sidebar-environments-panel" class="api-client-sidebar-section api-client-environments-section" role="tabpanel" aria-labelledby="api-client-sidebar-tab-environments" hidden>
          <div class="api-client-sidebar-section-title">Environments</div>
          <div class="api-client-environment-toolbar">
            <button class="folder-tree-tool-button api-client-sidebar-new-environment" type="button" title="New environment" aria-label="New environment">
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div id="api-client-environment-list" class="api-client-environment-list"></div>
          <div class="api-client-sidebar-section-title">Globals</div>
          <div id="api-client-global-variables" class="api-client-global-variables"></div>
          <div class="api-client-sidebar-section-title">Active Environment Variables</div>
          <div id="api-client-environment-variables" class="api-client-environment-variables"></div>
        </section>
      </div>
      <div id="regex-tester-sidebar-panel" class="regex-tester-sidebar-panel" hidden>
        <div class="regex-tester-sidebar-header">
          <h3 class="regex-tester-sidebar-title">Regex-Tester</h3>
        </div>
        <aside class="regex-tester-inspector" aria-label="Regex-Tester inspector">
          <details open>
            <summary>Explanation</summary>
            <div class="regex-tester-explanation"></div>
          </details>
          <details open>
            <summary>Match Information</summary>
            <div class="regex-tester-match-information">No match selected.</div>
          </details>
          <details open>
            <summary>Quick Reference</summary>
            <div class="regex-tester-reference-controls">
              <select class="regex-tester-reference-group" aria-label="Quick Reference group"></select>
              <input class="regex-tester-reference-filter" type="search" placeholder="Filter token, name, or description" aria-label="Filter quick reference">
            </div>
            <div class="regex-tester-quick-reference"></div>
          </details>
        </aside>
      </div>
      <div id="folder-tree-root" class="folder-tree-root">
        ${getClosedFolderPlaceholder()}
      </div>
      <div class="sidebar-dropzone-resizer" id="sidebar-dropzone-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize lower sidebar panel" tabindex="0"></div>
      <div class="sidebar-dropzone-panel sidebar-lower-panel">
        <div id="sidebar-lower-tabs" class="sidebar-lower-tabs">
          <div class="sidebar-lower-tab-list" role="tablist" aria-label="Lower sidebar views">
            <button id="sidebar-lower-tab-dropzone" class="sidebar-lower-tab" type="button" role="tab" aria-controls="sidebar-lower-dropzone-view">Dropzone</button>
            <button id="sidebar-lower-tab-outline" class="sidebar-lower-tab" type="button" role="tab" aria-controls="sidebar-outline-panel">Outline</button>
          </div>
          <button id="close-sidebar-lower-panel" class="sidebar-lower-close" type="button" title="Close lower sidebar panel" aria-label="Close lower sidebar panel"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </div>
        <div id="sidebar-lower-dropzone-view" class="sidebar-lower-view sidebar-lower-dropzone-view" role="tabpanel" aria-labelledby="sidebar-lower-tab-dropzone">
          <div id="dropzone" class="dropzone">
            <p class="mb-0"><i class="bi bi-cloud-arrow-up me-2"></i>Drop a Markdown file, graph file, or folder here, or click to browse</p>
          </div>
        </div>
        <section id="sidebar-outline-panel" class="sidebar-lower-view outline-panel" role="tabpanel" aria-labelledby="sidebar-lower-tab-outline" hidden>
          <div id="outline-body" class="outline-body" aria-live="polite"></div>
        </section>
      </div>
      </div>
    `;

    contentContainer.insertBefore(pane, contentContainer.firstChild);
    console.error("[FolderTree] pane dynamically inserted.");
  }

  ensureFolderTreePane();
  folderTreeRoot = document.getElementById("folder-tree-root");
  const folderTreePane = document.getElementById("folder-tree-pane");
  ensureRecentMenuContainers();
  const recentItemsHydrationPromise = hydrateRecentItemsFromProfile();
  hydrateRecentHandlesFromIndexedDB();
  const sidebarDropzonePanel = document.querySelector(".sidebar-dropzone-panel");
  const sidebarDropzoneResizer = document.getElementById("sidebar-dropzone-resizer");
  const sidebarWidthResizer = document.getElementById("sidebar-width-resizer");
  const aiCompanionWidthResizer = document.getElementById("ai-companion-width-resizer");
  const aiCompanionPanelElement = document.getElementById("ai-companion-panel");
  const toggleDropzonePanelButtons = document.querySelectorAll(".toggle-dropzone-panel");
  const toggleOutlinePanelButtons = document.querySelectorAll(".toggle-outline-panel");
  let sidebarLowerPanelTabs = null;
  let outlinePanel = null;
  const toggleSidebarButtons = document.querySelectorAll(".toggle-sidebar");
  const toggleAutoSelectFileButtons = document.querySelectorAll(".toggle-auto-select-file");
  const folderTreeSortMenuButtons = document.querySelectorAll(".folder-tree-sort-menu-button");
  const folderTreeSortOptionButtons = document.querySelectorAll(".folder-tree-sort-option");
  const folderToolbar = window.registerMarkdownViewerFolderToolbar(app, {
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get folderTreeRoot() { return folderTreeRoot; },
    get folderTreeFilterInput() { return folderTreeFilterInput; },
    get folderTreeFilterText() { return folderTreeFilterText; },
    set folderTreeFilterText(value) { folderTreeFilterText = value; },
    get selectedFolderTreeTags() { return selectedFolderTreeTags; },
    set selectedFolderTreeTags(value) { selectedFolderTreeTags = value; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    shouldShowGitProjectFolder,
    shouldShowMdEditorProjectFolder,
    shouldSkipCustomHiddenFolder,
    get showUnsupportedFolderFiles() { return showUnsupportedFolderFiles; },
    set showUnsupportedFolderFiles(value) { showUnsupportedFolderFiles = value; },
    get currentFolderSortMode() { return currentFolderSortMode; },
    set currentFolderSortMode(value) { currentFolderSortMode = value; },
    get autoSelectFileEnabled() { return autoSelectFileEnabled; },
    set autoSelectFileEnabled(value) { autoSelectFileEnabled = value; },
    get folderTreeExpandToggleButtons() { return folderTreeExpandToggleButtons; },
    get folderTreeFilterToggleButtons() { return folderTreeFilterToggleButtons; },
    get folderTreeSortMenuButtons() { return folderTreeSortMenuButtons; },
    get folderTreeSortOptionButtons() { return folderTreeSortOptionButtons; },
    get toggleAutoSelectFileButtons() { return toggleAutoSelectFileButtons; },
    get createTagButton() { return createTagButton; },
    get deleteTagButton() { return deleteTagButton; },
    get clearTagFilterButton() { return clearTagFilterButton; },
    get tagManagementSearch() { return tagManagementSearch; },
    get isFolderOpen() { return isFolderOpen; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get activeFolderHandle() { return activeFolderHandle; },
    get getFolderMarkdownEntryForTab() { return getFolderMarkdownEntryForTab; },
    getFileName,
    get normalizeFileTagList() { return normalizeFileTagList; },
    get normalizeTagName() { return normalizeTagName; },
    get getValidFolderSortMode() { return getValidFolderSortMode; },
    get isSupportedFolderTreeDocumentNode() { return isSupportedFolderTreeDocumentNode; },
    get getFolderTreeChildrenContainer() { return app.modules?.sidebarContextTree?.getFolderTreeChildrenContainer; },
    get renderFolderTreeLazyChildren() { return app.modules?.sidebarContextTree?.renderFolderTreeLazyChildren; },
    get readFolderTreeRecursiveEntriesFromDisk() { return app.modules?.sidebarContextTree?.readFolderTreeRecursiveEntriesFromDisk; },
    get sortFolderTreeNodes() { return sortFolderTreeNodes; },
    get revealFolderTreeFileByPath() { return app.modules?.sidebarContextTree?.revealFolderTreeFileByPath; },
    get resetFolderTreeAnimation() { return app.modules?.sidebarContextTree?.resetFolderTreeAnimation; },
    get getFolderTreeExpandLimitThreshold() { return getFolderTreeExpandLimitThreshold; },
    get getFolderTreeExpandLimitDepth() { return getFolderTreeExpandLimitDepth; },
    get renderFolderTree() { return renderFolderTree; },
    get renderTagManagementList() { return renderTagManagementList; },
    get saveGlobalState() { return saveGlobalState; },
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get getActiveGraphTab() { return getActiveGraphTab; },
    get renderGraphView() { return renderGraphView; },
    get closeMobileMenu() { return closeMobileMenu; },
    get createTag() { return createTag; },
    get promptForNewTag() { return promptForNewTag; },
    get getAvailableTags() { return getAvailableTags; },
    get deleteTag() { return deleteTag; }
  });
  const {
    getComparableFilePath,
    getTabTreeFileCandidates,
    updateAutoSelectFileButtons,
    updateFolderTreeExpandToggleButtons,
    setAllFolderTreeDetails,
    getUnsupportedFileToggleButtons,
    getFolderTreeGraphViewButtons,
    getFolderTreeGraphExportButtons,
    getTagManagementMenuButtons,
    getVisibleFolderTreeNodes,
    getFolderTreeNodePathKey,
    getFolderTreeNodeTags,
    getTagFilteredFolderTreeNodes,
    toggleFolderTreeTagFilter,
    getFilteredFolderTreeNodes,
    renderFilteredFolderTree,
    updateFolderTreeFilterControls,
    getFolderSortLabel,
    updateFolderTreeSortControls,
    updateUnsupportedFileToggleButtons,
    updateFolderTreeGraphViewButtons,
    updateFolderTreeGraphExportButtons,
    updateTagManagementMenuButtons,
    setShowUnsupportedFolderFiles,
    updateFolderTreeToolbarState,
    setAutoSelectFileEnabled,
    findFolderTreeFileButtonForTab,
    syncFolderTreeSelectionToActiveTab,
    enhanceGitHubAlerts,
  } = folderToolbar;
  folderPicker.updateFolderImportHint();
  updateFolderTreeToolbarState();
  toggleAutoSelectFileButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (button.classList.contains("folder-tree-tool-button") && !isFolderOpen) return;
      setAutoSelectFileEnabled(!autoSelectFileEnabled);
    });
  });

  folderTreeExpandToggleButtons.forEach(function(button) {
    button.addEventListener("click", async function() {
      if (!isFolderOpen) return;
      app.modules?.sidebarContextTree?.cancelFolderTreeBranchExpansion?.();
      await setAllFolderTreeDetails(false);
    });
  });


  folderTreeFilterToggleButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (!isFolderOpen || !folderTreeFilterInput) return;
      const shouldShow = folderTreeFilterInput.hidden;
      folderTreeFilterInput.hidden = !shouldShow;
      updateFolderTreeFilterControls();
      if (shouldShow) {
        folderTreeFilterInput.focus();
        folderTreeFilterInput.select();
        return;
      }
      folderTreeFilterText = "";
      if (folderTreeFilterRenderTimeout) {
        clearTimeout(folderTreeFilterRenderTimeout);
        folderTreeFilterRenderTimeout = null;
      }
      folderTreeFilterInput.value = "";
      renderFilteredFolderTree();
    });
  });

  if (folderTreeFilterInput) {
    folderTreeFilterInput.addEventListener("input", function() {
      folderTreeFilterText = folderTreeFilterInput.value;
      updateFolderTreeFilterControls();
      if (folderTreeFilterRenderTimeout) clearTimeout(folderTreeFilterRenderTimeout);
      folderTreeFilterRenderTimeout = setTimeout(function() {
        folderTreeFilterRenderTimeout = null;
        renderFilteredFolderTree();
      }, FOLDER_TREE_FILTER_IDLE_DELAY);
    });
  }

  folderTreeSortOptionButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (!isFolderOpen) return;
      applyFolderSortMode(button.dataset.folderSort || "name-asc");
    });
  });

  function getClosestUnsupportedFileToggleButton(target) {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    return element?.closest?.(".toggle-unsupported-files") || null;
  }

  function handleUnsupportedFileToggleClick(event) {
    const button = getClosestUnsupportedFileToggleButton(event.target);
    if (!button || event.unsupportedFilesToggleHandled) return;
    event.unsupportedFilesToggleHandled = true;
    event.preventDefault();
    if (button.classList.contains("folder-tree-tool-button") && !isFolderOpen) return;
    setShowUnsupportedFolderFiles(!showUnsupportedFolderFiles);
  }

  getUnsupportedFileToggleButtons().forEach(function(button) {
    button.addEventListener("click", handleUnsupportedFileToggleClick);
  });
  document.addEventListener("click", handleUnsupportedFileToggleClick, true);


  // Mobile View Mode Elements - Story 1.4
  const mobileViewModeButtons = document.querySelectorAll(".mobile-view-mode-btn");

  // Resize Divider Elements - Story 1.3
  const resizeDivider = document.querySelector(".resize-divider");
  const editorPaneElement = document.querySelector(".editor-pane");
  const previewPaneElement = document.querySelector(".preview-pane");
  let isResizing = false;
  let isSidebarDropzoneResizing = false;
  let isSidebarWidthResizing = false;
  let isAiCompanionWidthResizing = false;
  let resizePointerOffset = 0;
  let editorWidthPercent = 50; // Default 50%
  let aiCompanionPanelWidth = 380;
  const MIN_PANE_PERCENT = 20; // Minimum 20% width
  const MIN_SIDEBAR_PANEL_HEIGHT = 120;
  const DEFAULT_SIDEBAR_WIDTH = 280;
  const MIN_SIDEBAR_WIDTH = 160;
  const MIN_EDITOR_WORKSPACE_WIDTH = 320;
  const DEFAULT_AI_COMPANION_PANEL_WIDTH = 380;
  const MIN_AI_COMPANION_PANEL_WIDTH = 320;
  const AI_COMPANION_PANEL_MAX_WIDTH_PERCENT = 40;
  const SIDEBAR_VISIBILITY_ANIMATION_MS = 240;
  let sidebarVisibilityAnimationTimer = null;

  const viewLayout = window.registerMarkdownViewerViewLayout(app, {
    get currentViewMode() { return currentViewMode; },
    set currentViewMode(value) { currentViewMode = value; },
    get isResizing() { return isResizing; },
    set isResizing(value) { isResizing = value; },
    get resizePointerOffset() { return resizePointerOffset; },
    set resizePointerOffset(value) { resizePointerOffset = value; },
    get editorWidthPercent() { return editorWidthPercent; },
    set editorWidthPercent(value) { editorWidthPercent = value; },
    get aiCompanionPanelWidth() { return aiCompanionPanelWidth; },
    set aiCompanionPanelWidth(value) { aiCompanionPanelWidth = value; },
    get isSidebarWidthResizing() { return isSidebarWidthResizing; },
    set isSidebarWidthResizing(value) { isSidebarWidthResizing = value; },
    get isAiCompanionWidthResizing() { return isAiCompanionWidthResizing; },
    set isAiCompanionWidthResizing(value) { isAiCompanionWidthResizing = value; },
    get isSidebarDropzoneResizing() { return isSidebarDropzoneResizing; },
    set isSidebarDropzoneResizing(value) { isSidebarDropzoneResizing = value; },
    contentContainer,
    viewModeButtons,
    mobileViewModeButtons,
    syncToggleButtons,
    markdownEditor,
    resizeDivider,
    sidebarDropzoneResizer,
    sidebarWidthResizer,
    aiCompanionWidthResizer,
    appStatusLineElement,
    folderTreePane,
    sidebarDropzonePanel,
    aiCompanionPanelElement,
    editorPaneElement,
    previewPaneElement,
    MIN_SIDEBAR_WIDTH,
    MIN_EDITOR_WORKSPACE_WIDTH,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_PANEL_HEIGHT,
    MIN_PANE_PERCENT,
    DEFAULT_AI_COMPANION_PANEL_WIDTH,
    MIN_AI_COMPANION_PANEL_WIDTH,
    AI_COMPANION_PANEL_MAX_WIDTH_PERCENT,
    get getActiveTab() { return getActiveTab; },
    get isPreviewableDocumentTab() { return isPreviewableDocumentTab; },
    isMarkdownPath,
    get getAllowedViewModeForActiveTab() { return getAllowedViewModeForActiveTab; },
    getActiveMarkdownEditor: function() { return editorViewManager.getActiveMarkdownEditor(); },
    getActiveEditorPane: function() { return editorViewManager.getActiveEditorPane(); },
    getActivePreviewPane: function() { return editorViewManager.getActivePreviewPane(); },
    getActiveResizeDivider: function() { return editorViewManager.getActiveResizeDivider(); },
    get saveGlobalState() { return saveGlobalState; },
    onViewModeChanged: function(mode) { setActiveMarkdownTabViewMode(mode); },
    renderMarkdown: function(options) { return renderMarkdown(options); },
    scheduleEditorLineNumbersUpdate,
    isSidebarVisible
  });
  const updateViewModeButtons = viewLayout.updateViewModeButtons;
  const setViewMode = viewLayout.setViewMode;
  const updateSyncToggleVisibility = viewLayout.updateSyncToggleVisibility;
  const initResizer = viewLayout.initResizer;
  const startSidebarWidthResize = viewLayout.startSidebarWidthResize;
  const startSidebarWidthResizeTouch = viewLayout.startSidebarWidthResizeTouch;
  const getMaxSidebarWidth = viewLayout.getMaxSidebarWidth;
  const getClampedSidebarWidth = viewLayout.getClampedSidebarWidth;
  const getMaxSidebarDropzoneHeight = viewLayout.getMaxSidebarDropzoneHeight;
  const getClampedSidebarDropzoneHeight = viewLayout.getClampedSidebarDropzoneHeight;
  const applySidebarDropzoneHeight = viewLayout.applySidebarDropzoneHeight;
  const applySidebarWidth = viewLayout.applySidebarWidth;
  const applyAiCompanionPanelWidth = viewLayout.applyAiCompanionPanelWidth;
  const updateSidebarWidthResizerAccessibility = viewLayout.updateSidebarWidthResizerAccessibility;
  const updateSidebarWidthFromClientX = viewLayout.updateSidebarWidthFromClientX;
  const handleSidebarWidthResizeKeydown = viewLayout.handleSidebarWidthResizeKeydown;
  const handleSidebarWidthResize = viewLayout.handleSidebarWidthResize;
  const handleSidebarWidthResizeTouch = viewLayout.handleSidebarWidthResizeTouch;
  const stopSidebarWidthResize = viewLayout.stopSidebarWidthResize;
  const clampSidebarWidthToViewport = viewLayout.clampSidebarWidthToViewport;
  const startSidebarDropzoneResize = viewLayout.startSidebarDropzoneResize;
  const handleSidebarDropzoneResize = viewLayout.handleSidebarDropzoneResize;
  const stopSidebarDropzoneResize = viewLayout.stopSidebarDropzoneResize;
  const startResize = viewLayout.startResize;
  const startResizeTouch = viewLayout.startResizeTouch;
  const getResizePointerOffset = viewLayout.getResizePointerOffset;
  const getSplitResizeMetrics = viewLayout.getSplitResizeMetrics;
  const updateResizePosition = viewLayout.updateResizePosition;
  const handleResize = viewLayout.handleResize;
  const handleResizeTouch = viewLayout.handleResizeTouch;
  const stopResize = viewLayout.stopResize;
  const applyPaneWidths = viewLayout.applyPaneWidths;
  const resetPaneWidths = viewLayout.resetPaneWidths;
  const refreshActiveResizeTarget = viewLayout.refreshActiveResizeTarget;

  const mobileMenuToggle    = document.getElementById("mobile-menu-toggle");
  const mobileMenuPanel     = document.getElementById("mobile-menu-panel");
  const mobileMenuOverlay   = document.getElementById("mobile-menu-overlay");
  const mobileCloseMenu     = document.getElementById("close-mobile-menu");
  const mobileReadingTime   = document.getElementById("mobile-reading-time");
  const mobileWordCount     = document.getElementById("mobile-word-count");
  const mobileCharCount     = document.getElementById("mobile-char-count");
  const mobileImportBtn     = document.getElementById("mobile-import-button");
  const mobileImportGithubBtn = document.getElementById("mobile-import-github-button");
  const mobileExportMd      = document.getElementById("mobile-export-md");
  const mobileExportHtml    = document.getElementById("mobile-export-html");
  const mobileExportPdf     = document.getElementById("mobile-export-pdf");
  const mobileCopyMarkdown  = document.getElementById("mobile-copy-markdown");
  const mobileThemeToggle   = document.getElementById("mobile-theme-toggle");
  const mobileOpenGraphView = document.getElementById("mobile-open-graph-view");
  const welcomePageButtons = document.querySelectorAll(".open-welcome-page");
  const helpHomeButtons = document.querySelectorAll(".open-help-home");
  const readmePageButtons = document.querySelectorAll(".open-readme-page");
  const aboutDialogButtons = document.querySelectorAll(".show-about-dialog");
  const settingsDialogButtons = document.querySelectorAll(".open-settings-dialog");
  const codeConverterDialogButtons = document.querySelectorAll(".open-code-converter-dialog");
  const imageEditorToolButtons = document.querySelectorAll(".open-image-editor-tool");
  const diagramEditorToolButtons = document.querySelectorAll(".open-diagram-editor-tool");
  const diagramExportSubmenus = document.querySelectorAll(".diagram-export-submenu");
  const diagramExportButtons = document.querySelectorAll(".export-active-diagram");
  const updateProjectButtons = document.querySelectorAll(".update-project-button");
  const setOriginalSourceRootButtons = document.querySelectorAll(".set-original-source-root");
  const editorFindDialogButtons = document.querySelectorAll(".open-editor-find-dialog");
  const editorFindReplaceDialogButtons = document.querySelectorAll(".open-editor-find-replace-dialog");
  const workspaceSearchDialogButtons = document.querySelectorAll(".open-workspace-search-dialog");
  const findInFilesResultsPanelToggleButtons = document.querySelectorAll(".toggle-find-in-files-results-panel");
  const aboutModal = document.getElementById("about-modal");
  const aboutModalClose = document.getElementById("about-modal-close");
  const aboutLicenseButton = document.getElementById("about-app-license");
  const settingsModal = document.getElementById("settings-modal");
  const settingsGraphAutoClusterThresholdInput = document.getElementById("settings-graph-auto-cluster-threshold");
  const settingsGraphAutoClusterLargeMapsInput = document.getElementById("settings-graph-auto-cluster-large-maps");
  const settingsGraphLargeHoverDimInput = document.getElementById("settings-graph-large-hover-dim");
  const settingsGraphLargeHoverLabelsInput = document.getElementById("settings-graph-large-hover-labels");
  const settingsGraphLargeHoverLinesInput = document.getElementById("settings-graph-large-hover-lines");
  const settingsGraphRenderWarningThresholdInput = document.getElementById("settings-graph-render-warning-threshold");
  const settingsGraphMostReferencedPercentInput = document.getElementById("settings-graph-most-referenced-percent");
  const settingsGraphStaticWarmupTicksInput = document.getElementById("settings-graph-static-warmup-ticks");
  const settingsGraphShowFileExtensionsInput = document.getElementById("settings-graph-show-file-extensions");
  const settingsGraphColorInputs = document.querySelectorAll(".settings-graph-color-input[data-graph-color-mode][data-graph-color-key]");
  const settingsConfirmExitApplicationInput = document.getElementById("settings-confirm-exit-application");
  const settingsConfirmCancelBackgroundProcessInput = document.getElementById("settings-confirm-cancel-background-process");
  const settingsConfirmOpenManyGraphNodesInput = document.getElementById("settings-confirm-open-many-graph-nodes");
  const settingsConfirmDeleteFilesInput = document.getElementById("settings-confirm-delete-files");
  const settingsConfirmMoveFilesInput = document.getElementById("settings-confirm-move-files");
  const settingsConfirmResetStateInput = document.getElementById("settings-confirm-reset-state");
  const settingsConfirmResetJdtWorkspaceInput = document.getElementById("settings-confirm-reset-jdt-workspace");
  const settingsConfirmJavaBuildPathRebuildInput = document.getElementById("settings-confirm-java-build-path-rebuild");
  const settingsConfirmEditedPromptAttachmentRemovalInput = document.getElementById("settings-confirm-edited-prompt-attachment-removal");
  const settingsMaxOpenTabsInput = document.getElementById("settings-max-open-tabs");
  const settingsMaxRecentFilesInput = document.getElementById("settings-max-recent-files");
  const settingsMaxRecentFoldersInput = document.getElementById("settings-max-recent-folders");
  const settingsApiClientRecentHistoryLimitInput = document.getElementById("settings-api-client-recent-history-limit");
  const settingsApiClientAutoFollowRedirectsInput = document.getElementById("settings-api-client-auto-follow-redirects");
  const settingsApiClientMaxRedirectsInput = document.getElementById("settings-api-client-max-redirects");
  const settingsApiClientPreserveMethodOnRedirectInput = document.getElementById("settings-api-client-preserve-method-on-redirect");
  const settingsApiClientRedirectAuthHeaderPolicyInput = document.getElementById("settings-api-client-redirect-auth-header-policy");
  const settingsApiClientRedirectCustomHeaderPolicyInput = document.getElementById("settings-api-client-redirect-custom-header-policy");
  const settingsApiClientTimeoutInput = document.getElementById("settings-api-client-timeout-ms");
  const settingsApiClientSslVerificationInput = document.getElementById("settings-api-client-ssl-verification");
  const settingsApiClientCookieJarInput = document.getElementById("settings-api-client-cookie-jar");
  const settingsApiClientSendNoCacheInput = document.getElementById("settings-api-client-send-no-cache");
  const settingsApiClientMaxResponseSizeInput = document.getElementById("settings-api-client-max-response-size-mb");
  const settingsApiClientResponseRenderModeInput = document.getElementById("settings-api-client-response-render-mode");
  const settingsApiClientDecompressResponsesInput = document.getElementById("settings-api-client-decompress-responses");
  const settingsApiClientProxyModeInput = document.getElementById("settings-api-client-proxy-mode");
  const settingsApiClientProxyUrlInput = document.getElementById("settings-api-client-proxy-url");
  const settingsApiClientHttpVersionInput = document.getElementById("settings-api-client-http-version");
  const settingsWorkspaceSearchResultLimitInput = document.getElementById("settings-workspace-search-result-limit");
  const settingsJdtMaximumProblemsInput = document.getElementById("settings-jdt-maximum-problems");
  const settingsJdtInitialProblemLimitInput = document.getElementById("settings-jdt-initial-problem-limit");
  const settingsAjdtDiagnosticsEnabledInput = document.getElementById("settings-ajdt-diagnostics-enabled");
  const settingsClosedTabHistoryLimitInput = document.getElementById("settings-closed-tab-history-limit");
  const settingsSidebarRailStyleInput = document.getElementById("settings-sidebar-rail-style");
  const settingsSidebarRailShowGitInput = document.getElementById("settings-sidebar-rail-show-git");
  const settingsSidebarRailShowApiClientInput = document.getElementById("settings-sidebar-rail-show-api-client");
  const settingsSidebarRailShowRegexTesterInput = document.getElementById("settings-sidebar-rail-show-regex-tester");
  const settingsSidebarRailShowAiCompanionInput = document.getElementById("settings-sidebar-rail-show-ai-companion");
  const settingsSidebarRailShowSettingsInput = document.getElementById("settings-sidebar-rail-show-settings");
  const settingsSupportedTextExtensionsInput = document.getElementById("settings-supported-text-extensions");
  const settingsContextMenuTooltipDelayInput = document.getElementById("settings-context-menu-tooltip-delay");
  const settingsMenuLayoutInput = document.getElementById("settings-menu-layout");
  const settingsAppHeaderSpacingInput = document.getElementById("settings-app-header-spacing");
  const settingsTabStyleInput = document.getElementById("settings-tab-style");
  const settingsThemeToggle = document.getElementById("settings-theme-toggle");
  const settingsStartupBehaviorInput = document.getElementById("settings-startup-behavior");
  const settingsRestoreLastFolderOnStartupInput = document.getElementById("settings-restore-last-folder-on-startup");
  const settingsShowGitFolderInput = document.getElementById("settings-show-git-folder");
  const settingsShowMdEditorFolderInput = document.getElementById("settings-show-md-editor-folder");
  const settingsHiddenFolderNamesInput = document.getElementById("settings-hidden-folder-names");
  const settingsFolderTreeExpandLimitThresholdInput = document.getElementById("settings-folder-tree-expand-limit-threshold");
  const settingsFolderTreeExpandLimitDepthInput = document.getElementById("settings-folder-tree-expand-limit-depth");
  const settingsExternalFileChangeBehaviorInputs = document.querySelectorAll("input[name='settings-external-file-change-behavior']");
  const settingsEditorFontFamilyInput = document.getElementById("settings-editor-font-family");
  const settingsEditorFontSizeInput = document.getElementById("settings-editor-font-size");
  const settingsJdtInteractiveRequestTimeoutInput = document.getElementById("settings-jdt-interactive-request-timeout-ms");
  const settingsSpacesPerIndentLevelInput = document.getElementById("settings-spaces-per-indent-level");
  const settingsTabsPerIndentLevelInput = document.getElementById("settings-tabs-per-indent-level");
  const settingsDocumentWordAutocompleteInput = document.getElementById("settings-document-word-autocomplete");
  const settingsLanguageAutocompleteInput = document.getElementById("settings-language-autocomplete");
  const settingsLanguageServerAutocompleteInput = document.getElementById("settings-language-server-autocomplete");
  const settingsSnippetAutocompleteInput = document.getElementById("settings-snippet-autocomplete");
  const settingsUnclosedBracketHighlightInput = document.getElementById("settings-unclosed-bracket-highlight");
  const settingsAiEnabledInput = document.getElementById("settings-ai-enabled");
  const settingsAiIntentContractsEnabledInput = document.getElementById("settings-ai-intent-contracts-enabled");
  const settingsAiIntentSteeringEnabledInput = document.getElementById("settings-ai-intent-steering-enabled");
  const settingsAiIntentMaxRevisionsInput = document.getElementById("settings-ai-intent-max-revisions");
  const settingsAiProviderModeInput = document.getElementById("settings-ai-provider-mode");
  const settingsAiBaseUrlInput = document.getElementById("settings-ai-base-url");
  const settingsAiApiKeyInput = document.getElementById("settings-ai-api-key");
  const settingsAiModelInput = document.getElementById("settings-ai-model");
  const settingsAiModelOptionsList = document.getElementById("settings-ai-model-options");
  const settingsAiProviderRequestDelayInput = document.getElementById("settings-ai-provider-request-delay-ms");
  const settingsAiMaxTokensPerChatMinuteInput = document.getElementById("settings-ai-max-tokens-per-chat-minute");
  const settingsAiMaxTasksPerChatInput = document.getElementById("settings-ai-max-tasks-per-chat");
  const settingsAiAgentMaxResponseTokensInput = document.getElementById("settings-ai-agent-max-response-tokens");
  const settingsAiInputSubmitModeInput = document.getElementById("settings-ai-input-submit-mode");
  const settingsAiLiteLlmAliasInput = document.getElementById("settings-ai-litellm-alias");
  const settingsAiLiteLlmRoutingInput = document.getElementById("settings-ai-litellm-routing");
  const settingsAiGeminiBaseUrlInput = document.getElementById("settings-ai-gemini-base-url");
  const settingsAiGeminiConnectorIdInput = document.getElementById("settings-ai-gemini-connector-id");
  const settingsAiGeminiApiKeyInput = document.getElementById("settings-ai-gemini-api-key");
  const settingsAiLiteLlmFields = Array.from(document.querySelectorAll(".settings-ai-litellm-field"));
  const settingsAiGeminiFields = Array.from(document.querySelectorAll(".settings-ai-gemini-field"));
  const settingsAiHttpProviderFields = Array.from(document.querySelectorAll(".settings-ai-http-provider-field"));
  const settingsAiChatEnabledInput = document.getElementById("settings-ai-chat-enabled");
  const settingsAiAutocompleteEnabledInput = document.getElementById("settings-ai-autocomplete-enabled");
  const settingsAiAgentEnabledInput = document.getElementById("settings-ai-agent-enabled");
  const settingsAiGitSummaryEnabledInput = document.getElementById("settings-ai-git-summary-enabled");
  const settingsAiShowReasoningInput = document.getElementById("settings-ai-show-reasoning");
  const settingsAiAutocompleteLineEnabledInput = document.getElementById("settings-ai-autocomplete-line-enabled");
  const settingsAiAutocompleteBlockEnabledInput = document.getElementById("settings-ai-autocomplete-block-enabled");
  const settingsAiAutocompleteCommentEnabledInput = document.getElementById("settings-ai-autocomplete-comment-enabled");
  const settingsAiAutocompleteIdleMsInput = document.getElementById("settings-ai-autocomplete-idle-ms");
  const settingsAiAutocompleteBlockIdleMsInput = document.getElementById("settings-ai-autocomplete-block-idle-ms");
  const settingsAiAutocompleteCommentIdleMsInput = document.getElementById("settings-ai-autocomplete-comment-idle-ms");
  const settingsAiAutocompleteRejectCharsInput = document.getElementById("settings-ai-autocomplete-reject-chars");
  const settingsAiAutocompleteRejectDelayInput = document.getElementById("settings-ai-autocomplete-reject-delay");
  const settingsAiAutocompletePrefixLinesInput = document.getElementById("settings-ai-autocomplete-prefix-lines");
  const settingsAiAutocompleteSuffixLinesInput = document.getElementById("settings-ai-autocomplete-suffix-lines");
  const settingsAiAutocompleteModelFamilyInput = document.getElementById("settings-ai-autocomplete-model-family");
  const settingsAiAutocompleteContextProvidersEnabledInput = document.getElementById("settings-ai-autocomplete-context-providers-enabled");
  const settingsAiAgentAutoRunCommandsInput = document.getElementById("settings-ai-agent-auto-run-commands");
  const settingsAiAgentConfirmBeforeWriteInput = document.getElementById("settings-ai-agent-confirm-before-write");
  const settingsAiApprovalAppPolicyInput = document.getElementById("settings-ai-approval-app-policy");
  const settingsAiApprovalFolderPolicyInput = document.getElementById("settings-ai-approval-folder-policy");
  const settingsAiApprovalAppPolicyPath = document.getElementById("settings-ai-approval-app-policy-path");
  const settingsAiApprovalFolderPolicyPath = document.getElementById("settings-ai-approval-folder-policy-path");
  const settingsAiApprovalPolicyStatus = document.getElementById("settings-ai-approval-policy-status");
  const settingsAiTestConnectionButton = document.getElementById("settings-ai-test-connection");
  const settingsAiConnectionStatus = document.getElementById("settings-ai-connection-status");
  const settingsSnippetLanguageInput = document.getElementById("settings-snippet-language");
  const settingsSnippetAddButton = document.getElementById("settings-snippet-add");
  const settingsSnippetList = document.getElementById("settings-snippet-list");
  const settingsSnippetLabelInput = document.getElementById("settings-snippet-label");
  const settingsSnippetDetailInput = document.getElementById("settings-snippet-detail");
  const settingsSnippetTypeInput = document.getElementById("settings-snippet-type");
  const settingsSnippetEnabledInput = document.getElementById("settings-snippet-enabled");
  const settingsSnippetTemplateInput = document.getElementById("settings-snippet-template");
  const settingsSnippetSaveButton = document.getElementById("settings-snippet-save");
  const settingsSnippetResetButton = document.getElementById("settings-snippet-reset");
  const settingsSnippetDeleteButton = document.getElementById("settings-snippet-delete");
  const settingsLspTypeScriptStatus = document.getElementById("settings-lsp-typescript-status");
  const settingsLspTypeScriptPath = document.getElementById("settings-lsp-typescript-path");
  const settingsLspTypeScriptDetail = document.getElementById("settings-lsp-typescript-detail");
  const settingsLspTypeScriptActionsButton = document.getElementById("settings-lsp-typescript-actions");
  const settingsLspTypeScriptActionsMenu = document.getElementById("settings-lsp-typescript-actions-menu");
  const settingsLspTypeScriptToggleButton = document.getElementById("settings-lsp-typescript-toggle");
  const settingsLspTypeScriptAutoStartInput = document.getElementById("settings-lsp-typescript-autostart");
  const settingsLspTypeScriptInstallButton = document.getElementById("settings-lsp-typescript-install");
  const settingsLspTypeScriptRemoveButton = document.getElementById("settings-lsp-typescript-remove");
  const settingsLspJavaStatus = document.getElementById("settings-lsp-java-status");
  const settingsLspJavaPath = document.getElementById("settings-lsp-java-path");
  const settingsLspJavaDetail = document.getElementById("settings-lsp-java-detail");
  const settingsLspJavaActionsButton = document.getElementById("settings-lsp-java-actions");
  const settingsLspJavaActionsMenu = document.getElementById("settings-lsp-java-actions-menu");
  const settingsLspJavaToggleButton = document.getElementById("settings-lsp-java-toggle");
  const settingsLspJavaAutoStartInput = document.getElementById("settings-lsp-java-autostart");
  const settingsLspJavaInstallButton = document.getElementById("settings-lsp-java-install");
  const settingsLspJavaInstallFileButton = document.getElementById("settings-lsp-java-install-file");
  const settingsLspJavaRemoveButton = document.getElementById("settings-lsp-java-remove");
  const settingsLspJavaRetryButton = document.getElementById("settings-lsp-java-retry");
  const settingsLspJavaShowLogButton = document.getElementById("settings-lsp-java-show-log");
  const settingsLspJavaResetWorkspaceButton = document.getElementById("settings-lsp-java-reset-workspace");
  const settingsLspKotlinStatus = document.getElementById("settings-lsp-kotlin-status");
  const settingsLspKotlinPath = document.getElementById("settings-lsp-kotlin-path");
  const settingsLspKotlinDetail = document.getElementById("settings-lsp-kotlin-detail");
  const settingsLspKotlinToggleButton = document.getElementById("settings-lsp-kotlin-toggle");
  const settingsLspKotlinAutoStartInput = document.getElementById("settings-lsp-kotlin-autostart");
  const settingsLspXmlStatus = document.getElementById("settings-lsp-xml-status");
  const settingsLspXmlPath = document.getElementById("settings-lsp-xml-path");
  const settingsLspXmlDetail = document.getElementById("settings-lsp-xml-detail");
  const settingsLspXmlActionsButton = document.getElementById("settings-lsp-xml-actions");
  const settingsLspXmlActionsMenu = document.getElementById("settings-lsp-xml-actions-menu");
  const settingsLspXmlToggleButton = document.getElementById("settings-lsp-xml-toggle");
  const settingsLspXmlAutoStartInput = document.getElementById("settings-lsp-xml-autostart");
  const settingsLspXmlInstallButton = document.getElementById("settings-lsp-xml-install");
  const settingsLspXmlInstallFileButton = document.getElementById("settings-lsp-xml-install-file");
  const settingsLspXmlInstallPomFileButton = document.getElementById("settings-lsp-xml-install-pom-file");
  const settingsLspXmlRemoveButton = document.getElementById("settings-lsp-xml-remove");
  const settingsLspPythonStatus = document.getElementById("settings-lsp-python-status");
  const settingsLspPythonPath = document.getElementById("settings-lsp-python-path");
  const settingsLspPythonDetail = document.getElementById("settings-lsp-python-detail");
  const settingsLspPythonToggleButton = document.getElementById("settings-lsp-python-toggle");
  const settingsLspPythonAutoStartInput = document.getElementById("settings-lsp-python-autostart");
  const settingsLspHtmlStatus = document.getElementById("settings-lsp-html-status");
  const settingsLspHtmlPath = document.getElementById("settings-lsp-html-path");
  const settingsLspHtmlDetail = document.getElementById("settings-lsp-html-detail");
  const settingsLspHtmlToggleButton = document.getElementById("settings-lsp-html-toggle");
  const settingsLspHtmlAutoStartInput = document.getElementById("settings-lsp-html-autostart");
  const settingsLspCssStatus = document.getElementById("settings-lsp-css-status");
  const settingsLspCssPath = document.getElementById("settings-lsp-css-path");
  const settingsLspCssDetail = document.getElementById("settings-lsp-css-detail");
  const settingsLspCssToggleButton = document.getElementById("settings-lsp-css-toggle");
  const settingsLspCssAutoStartInput = document.getElementById("settings-lsp-css-autostart");
  const settingsLspJsonStatus = document.getElementById("settings-lsp-json-status");
  const settingsLspJsonPath = document.getElementById("settings-lsp-json-path");
  const settingsLspJsonDetail = document.getElementById("settings-lsp-json-detail");
  const settingsLspJsonToggleButton = document.getElementById("settings-lsp-json-toggle");
  const settingsLspJsonAutoStartInput = document.getElementById("settings-lsp-json-autostart");
  const settingsLspYamlStatus = document.getElementById("settings-lsp-yaml-status");
  const settingsLspYamlPath = document.getElementById("settings-lsp-yaml-path");
  const settingsLspYamlDetail = document.getElementById("settings-lsp-yaml-detail");
  const settingsLspYamlToggleButton = document.getElementById("settings-lsp-yaml-toggle");
  const settingsLspYamlAutoStartInput = document.getElementById("settings-lsp-yaml-autostart");
  const settingsLspBashStatus = document.getElementById("settings-lsp-bash-status");
  const settingsLspBashPath = document.getElementById("settings-lsp-bash-path");
  const settingsLspBashDetail = document.getElementById("settings-lsp-bash-detail");
  const settingsLspBashToggleButton = document.getElementById("settings-lsp-bash-toggle");
  const settingsLspBashAutoStartInput = document.getElementById("settings-lsp-bash-autostart");
  const settingsLspDockerfileStatus = document.getElementById("settings-lsp-dockerfile-status");
  const settingsLspDockerfilePath = document.getElementById("settings-lsp-dockerfile-path");
  const settingsLspDockerfileDetail = document.getElementById("settings-lsp-dockerfile-detail");
  const settingsLspDockerfileToggleButton = document.getElementById("settings-lsp-dockerfile-toggle");
  const settingsLspDockerfileAutoStartInput = document.getElementById("settings-lsp-dockerfile-autostart");
  const settingsLspWindowsScriptingStatus = document.getElementById("settings-lsp-windows-scripting-status");
  const settingsLspWindowsScriptingPath = document.getElementById("settings-lsp-windows-scripting-path");
  const settingsLspWindowsScriptingDetail = document.getElementById("settings-lsp-windows-scripting-detail");
  const settingsLspWindowsScriptingToggleButton = document.getElementById("settings-lsp-windows-scripting-toggle");
  const settingsLspWindowsScriptingAutoStartInput = document.getElementById("settings-lsp-windows-scripting-autostart");
  const settingsJdkList = document.getElementById("settings-jdk-list");
  const settingsJdkEmpty = document.getElementById("settings-jdk-empty");
  const settingsAddJdkButton = document.getElementById("settings-add-jdk");
  const settingsGradleModeInputs = document.querySelectorAll('input[name="settings-gradle-mode"]');
  const settingsGradleOfflineInput = document.getElementById("settings-gradle-offline");
  const settingsGradleMetadataFailureInput = document.getElementById("settings-gradle-metadata-failure");
  const settingsGradleUserHomeInput = document.getElementById("settings-gradle-user-home");
  const settingsGradleUserHomeBrowseButton = document.getElementById("settings-gradle-user-home-browse");
  const settingsGradleInstallationSelect = document.getElementById("settings-gradle-installation-select");
  const settingsGradleList = document.getElementById("settings-gradle-list");
  const settingsGradleEmpty = document.getElementById("settings-gradle-empty");
  const settingsAddGradleButton = document.getElementById("settings-add-gradle");
  const settingsDebugEnabledInput = document.getElementById("settings-debug-enabled");
  const settingsDebugWriteFileInput = document.getElementById("settings-debug-write-file");
  const settingsDebugLevelInput = document.getElementById("settings-debug-level");
  const settingsDebugLogPathInput = document.getElementById("settings-debug-log-path");
  const settingsDebugMaxLogSizeInput = document.getElementById("settings-debug-max-log-size");
  const settingsDebugMaxLogFilesInput = document.getElementById("settings-debug-max-log-files");
  const settingsDebugCategoryInputs = document.querySelectorAll(".settings-debug-category-input");
  const settingsDebugAiFullPayloadsInput = document.getElementById("settings-debug-ai-full-payloads");
  const settingsOpenDebugLogTabButton = document.getElementById("settings-open-debug-log-tab");
  const settingsOpenDebugLogDefaultButton = document.getElementById("settings-open-debug-log-default");
  const settingsOpenProfileFolderButton = document.getElementById("settings-open-profile-folder");
  const settingsClearDebugLogButton = document.getElementById("settings-clear-debug-log");
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsModalCancel = document.getElementById("settings-modal-cancel");
  const settingsModalSave = document.getElementById("settings-modal-save");
  const settingsExportFileButton = document.getElementById("settings-export-file");
  const settingsImportFileButton = document.getElementById("settings-import-file");
  const settingsModalSaveDefaultText = settingsModalSave?.textContent || "Save settings";
  const settingsResetCacheButton = document.getElementById("settings-reset-cache");
  const settingsResetGraphPersistenceCacheButton = document.getElementById("settings-reset-graph-persistence-cache");
  const settingsResetMarkdownContentCacheButton = document.getElementById("settings-reset-markdown-content-cache");
  const settingsResetGraphRenderCacheButton = document.getElementById("settings-reset-graph-render-cache");
  const settingsResetBrowserCacheButton = document.getElementById("settings-reset-browser-cache");
  const settingsResetPreferencesButton = document.getElementById("settings-reset-preferences");
  const settingsResetRecentHistoryButton = document.getElementById("settings-reset-recent-history");
  const settingsClearDraftsButton = document.getElementById("settings-clear-drafts");
  const settingsResetThemesButton = document.getElementById("settings-reset-themes");
  const settingsResetAllButton = document.getElementById("settings-reset-all");
  const settingsThemeSelects = document.querySelectorAll(".settings-theme-select");
  const settingsThemeCreateButtons = document.querySelectorAll(".settings-theme-create");
  const settingsThemeDuplicateButtons = document.querySelectorAll(".settings-theme-duplicate");
  const settingsThemeRenameButtons = document.querySelectorAll(".settings-theme-rename");
  const settingsThemeDeleteButtons = document.querySelectorAll(".settings-theme-delete");
  const settingsThemeTokenEditors = document.querySelectorAll(".settings-theme-token-editor");
  const settingsSyntaxLanguageSelect = document.getElementById("settings-syntax-language");
  const settingsSyntaxColorGrid = document.getElementById("settings-syntax-color-grid");
  const settingsSyntaxOpenEditorButton = document.getElementById("settings-syntax-open-editor");
  const settingsSyntaxResetLanguageButton = document.getElementById("settings-syntax-reset-language");
  const settingsScreen = window.createMarkdownViewerSettingsScreen
    ? window.createMarkdownViewerSettingsScreen({ modal: settingsModal, defaultTab: "interface" })
    : null;
  const snippetRegistry = typeof window.registerMarkdownViewerSnippetRegistry === "function"
    ? window.registerMarkdownViewerSnippetRegistry(app)
    : null;
  settingsApiClientProxyModeInput?.addEventListener?.("change", updateApiClientProxySettingsFields);

  const SETTINGS_CONTROL_TOOLTIPS = {
    "settings-search-input": "Search settings by category, label, or description.",
    "settings-modal-close": "Close the settings dialog without saving pending changes.",
    "settings-modal-cancel": "Close settings without saving pending changes.",
    "settings-modal-save": "Save the current settings.",
    "settings-export-file": "Save current preferences to a portable JSON settings file.",
    "settings-import-file": "Replace current preferences from a previously exported settings file.",
    "settings-graph-auto-cluster-threshold": "Set the graph size where automatic cluster collapse can begin.",
    "settings-graph-render-warning-threshold": "Set the graph size that triggers a large-render warning.",
    "settings-graph-most-referenced-percent": "Choose how much of the graph is grouped by the most referenced files action.",
    "settings-graph-static-warmup-ticks": "Set how many simulation ticks run before static graph rendering settles.",
    "settings-graph-auto-cluster-large-maps": "Toggle automatic cluster collapse for large graph maps.",
    "settings-graph-large-hover-dim": "Toggle dimming unrelated nodes when hovering large graphs.",
    "settings-graph-large-hover-labels": "Toggle labels for hovered nodes and their connected nodes.",
    "settings-graph-large-hover-lines": "Toggle highlighted lines connected to the hovered node.",
    "settings-graph-show-file-extensions": "Toggle file extensions in graph node labels.",
    "settings-graph-node-default-color": "Choose the default color for graph file nodes.",
    "settings-graph-link-color": "Choose the color for regular graph dependency lines.",
    "settings-graph-external-dependency-color": "Choose the color for external dependency nodes.",
    "settings-graph-external-dependency-line-color": "Choose the color for external dependency lines.",
    "settings-graph-missing-dependency-color": "Choose the color for missing dependency nodes.",
    "settings-graph-missing-dependency-line-color": "Choose the color for missing dependency lines.",
    "settings-graph-tag-node-color": "Choose the color for tag nodes.",
    "settings-graph-tag-line-color": "Choose the color for tag links.",
    "settings-graph-cluster-node-color": "Choose the color for collapsed cluster nodes.",
    "settings-graph-find-highlight-color": "Choose the graph find highlight color.",
    "settings-max-open-tabs": "Set the maximum number of tabs that can be open at once.",
    "settings-max-recent-files": "Set how many recently opened files are kept in the menu.",
    "settings-max-recent-folders": "Set how many recently opened folders are kept in the menu.",
    "settings-context-menu-tooltip-delay": "Set how long menu tooltips wait before appearing, in milliseconds.",
    "settings-closed-tab-history-limit": "Set how many source-backed tabs remain available to reopen after they are closed.",
    "settings-sidebar-rail-style": "Choose whether the side rail bar is thin or spacious with labeled buttons.",
    "settings-tab-style": "Choose the visual style used by outer document, sidebar, and bottom-panel tabs.",
    "settings-supported-text-extensions": "Edit the file extensions treated as supported text files.",
    "settings-startup-behavior": "Choose what MD-Editor opens when it starts.",
    "settings-folder-tree-expand-limit-threshold": "Set the folder count where Expand All limits itself to a shallow tree expansion.",
    "settings-folder-tree-expand-limit-depth": "Set how many folder levels Expand All opens for large trees.",
    "settings-editor-font-family": "Choose the editor font family.",
    "settings-editor-font-size": "Set the editor font size in pixels.",
    "settings-jdt-interactive-request-timeout-ms": "Set how long interactive JDT requests may wait before the editor stops expecting a response.",
    "settings-spaces-per-indent-level": "Set how many spaces make one indent level.",
    "settings-tabs-per-indent-level": "Set how many tab characters make one indent level.",
    "settings-document-word-autocomplete": "Toggle word suggestions from the current open document.",
    "settings-language-autocomplete": "Toggle language-specific suggestions when CodeMirror supports the active file type.",
    "settings-language-server-autocomplete": "Toggle suggestions from installed desktop language servers.",
    "settings-snippet-autocomplete": "Toggle snippet suggestions for supported CodeMirror languages.",
    "settings-snippet-language": "Choose which language snippet list to edit.",
    "settings-snippet-add": "Add a custom snippet for the selected language.",
    "settings-snippet-label": "Set the completion name shown in the suggestion list.",
    "settings-snippet-detail": "Set the short description shown beside the snippet name.",
    "settings-snippet-type": "Set the CodeMirror completion type metadata.",
    "settings-snippet-enabled": "Toggle this snippet within snippet auto-completion.",
    "settings-snippet-template": "Edit the CodeMirror snippet template.",
    "settings-snippet-save": "Save the current snippet into settings.",
    "settings-snippet-reset": "Restore this built-in snippet to its default template.",
    "settings-snippet-delete": "Delete this custom snippet.",
    "settings-lsp-typescript-toggle": "Start or stop the TypeScript language server for the active workspace.",
    "settings-lsp-typescript-autostart": "Toggle automatic TypeScript language server startup for matching open files.",
    "settings-lsp-typescript-actions": "Open TypeScript language server actions.",
    "settings-lsp-typescript-install": "Show the supported TypeScript VSIX download link, then install the selected VSIX into the desktop profile.",
    "settings-lsp-typescript-remove": "Remove the installed TypeScript language server from the desktop profile.",
    "settings-lsp-java-toggle": "Start or stop the Java language server for the active workspace.",
    "settings-lsp-java-autostart": "Toggle automatic Java language server startup for matching open files.",
    "settings-lsp-java-actions": "Open Java language server actions.",
    "settings-lsp-java-install": `Download and install supported Eclipse JDT Language Server ${getSupportedJdtLsVersion()} into the desktop profile.`,
    "settings-lsp-java-install-file": `Show the Eclipse JDT Language Server download page, then install a supported ${getSupportedJdtLsVersion()} local archive.`,
    "settings-lsp-java-remove": "Remove the installed Java language server from the desktop profile.",
    "settings-lsp-java-retry": "Stop the current Java session and retry project detection and import.",
    "settings-lsp-java-show-log": "Open the detailed log for the active generated JDT workspace.",
    "settings-lsp-java-reset-workspace": "Delete only generated JDT workspace data for the active folder, then import it again.",
    "settings-lsp-python-toggle": "Start or stop the Python language server for the active workspace.",
    "settings-lsp-python-autostart": "Toggle automatic Python language server startup for matching open files.",
    "settings-lsp-html-toggle": "Start or stop the HTML language server for the active workspace.",
    "settings-lsp-html-autostart": "Toggle automatic HTML language server startup for matching open files.",
    "settings-lsp-css-toggle": "Start or stop the CSS and SCSS language server for the active workspace.",
    "settings-lsp-css-autostart": "Toggle automatic CSS and SCSS language server startup for matching open files.",
    "settings-lsp-json-toggle": "Start or stop the JSON language server for the active workspace.",
    "settings-lsp-json-autostart": "Toggle automatic JSON language server startup for matching open files.",
    "settings-lsp-yaml-toggle": "Start or stop the YAML language server for the active workspace.",
    "settings-lsp-yaml-autostart": "Toggle automatic YAML language server startup for matching open files.",
    "settings-lsp-bash-toggle": "Start or stop the Bash language server for the active workspace.",
    "settings-lsp-bash-autostart": "Toggle automatic Bash language server startup for matching open files.",
    "settings-lsp-dockerfile-toggle": "Start or stop the Dockerfile language server for the active workspace.",
    "settings-lsp-dockerfile-autostart": "Toggle automatic Dockerfile language server startup for matching open files.",
    "settings-lsp-windows-scripting-toggle": "Start or stop the Windows scripting language server for the active workspace.",
    "settings-lsp-windows-scripting-autostart": "Toggle automatic Windows scripting language server startup for matching open files.",
    "settings-add-jdk": "Add a JDK home folder for the Java converter.",
    "settings-gradle-mode-auto": "Try the project Gradle wrapper first, with local Gradle available for configured offline runs.",
    "settings-gradle-mode-wrapper": "Use the project Gradle wrapper and the converter's existing PATH fallback.",
    "settings-gradle-mode-local": "Run the selected local Gradle distribution directly.",
    "settings-gradle-offline": "Pass --offline when the Java converter asks Gradle for source-set metadata.",
    "settings-gradle-metadata-failure": "Choose whether Gradle metadata failures fall back to parse-only analysis or stop conversion.",
    "settings-gradle-user-home": "Optional Gradle user home for wrapper and dependency caches.",
    "settings-gradle-user-home-browse": "Choose a Gradle user home folder.",
    "settings-gradle-installation-select": "Choose the default local Gradle distribution for local mode and projects without a saved Project Gradle selection.",
    "settings-add-gradle": "Add an installed Gradle home folder.",
    "settings-theme-light-select": "Choose the app color theme used in light mode.",
    "settings-theme-dark-select": "Choose the app color theme used in dark mode.",
    "settings-debug-enabled": "Toggle diagnostic logging for app workflows.",
    "settings-debug-write-file": "Toggle writing debug logs to the configured file path.",
    "settings-debug-level": "Choose the minimum diagnostic level to log.",
    "settings-debug-log-path": "Set the local file path used for debug logs.",
    "settings-debug-max-log-size": "Set the maximum debug log file size before rotation.",
    "settings-debug-max-log-files": "Set how many rotated debug log files to keep.",
    "settings-debug-log-menu": "Open the configured debug log.",
    "settings-open-debug-log-tab": "Open the debug log inside MD-Editor.",
    "settings-open-debug-log-default": "Open the debug log with the default system app.",
    "settings-open-profile-folder": "Open the folder where MD-Editor stores profile data.",
    "settings-clear-debug-log": "Clear only the configured current debug log file.",
    "settings-syntax-language": "Choose which language's syntax colors to edit.",
    "settings-syntax-reset-language": "Reset syntax colors for the selected language.",
    "settings-confirm-exit-application": "Toggle confirmation before exiting MD-Editor.",
    "settings-confirm-open-many-graph-nodes": "Toggle confirmation before opening many graph nodes at once.",
    "settings-confirm-delete-files": "Toggle confirmation before deleting files or folders.",
    "settings-confirm-move-files": "Toggle confirmation before moving or copying files or folders.",
    "settings-confirm-reset-state": "Toggle confirmation before clearing settings, caches, history, or drafts.",
    "settings-confirm-reset-jdt-workspace": "Toggle confirmation before deleting generated JDT workspace data and importing the active Java project again.",
    "settings-confirm-java-build-path-rebuild": "Toggle the rebuild prompt after saving changed Java Build Path settings.",
    "settings-confirm-edited-prompt-attachment-removal": "Toggle confirmation before removing attached files from edited AI prompts.",
    "settings-reset-cache": "Clear every app cache and refresh derived workspace state.",
    "settings-reset-graph-persistence-cache": "Clear cached graph document and graph state data.",
    "settings-reset-markdown-content-cache": "Clear cached Markdown file contents used by folder and graph features.",
    "settings-reset-graph-render-cache": "Clear rendered graph views so they rebuild on next display.",
    "settings-reset-browser-cache": "Clear browser Cache Storage used by the app.",
    "settings-reset-preferences": "Restore preferences to their defaults.",
    "settings-reset-recent-history": "Clear the recent files and recent folders lists.",
    "settings-api-client-recent-history-limit": "Set how many API Client calls stay in history.",
    "settings-clear-drafts": "Delete saved tab drafts from the profile draft folder.",
    "settings-reset-themes": "Delete all custom themes and restore the default light and dark themes.",
    "settings-reset-all": "Clear caches, preferences, recent history, and saved drafts."
  };
  const codeConverterModal = document.getElementById("code-converter-modal");
  const codeConverterTypeSelect = document.getElementById("code-converter-type");
  const codeConverterLanguageSupport = document.getElementById("code-converter-language-support");
  const codeConverterSourceRootInput = document.getElementById("code-converter-source-root");
  const codeConverterDestinationRootInput = document.getElementById("code-converter-destination-root");
  const codeConverterSourceBrowseButton = document.getElementById("code-converter-source-browse");
  const codeConverterDestinationBrowseButton = document.getElementById("code-converter-destination-browse");
  const codeConverterIncludeMethodsInput = document.getElementById("code-converter-include-methods");
  const codeConverterIncludeAccessorsInput = document.getElementById("code-converter-include-accessors");
  const codeConverterIncludeSignaturesInput = document.getElementById("code-converter-include-signatures");
  const codeConverterIncludeReturnCodesInput = document.getElementById("code-converter-include-return-codes");
  const codeConverterIncludeExceptionsInput = document.getElementById("code-converter-include-exceptions");
  const codeConverterIncludePackageInput = document.getElementById("code-converter-include-package");
  const codeConverterIncludeCommentsInput = document.getElementById("code-converter-include-comments");
  const codeConverterIncludeExternalDependenciesInput = document.getElementById("code-converter-include-external-dependencies");
  const codeConverterResolveMavenInput = document.getElementById("code-converter-resolve-maven");
  const codeConverterCancelButton = document.getElementById("code-converter-cancel");
  const codeConverterMinimizeButton = document.getElementById("code-converter-minimize");
  const codeConverterRunButton = document.getElementById("code-converter-run");
  const codeConverterOpenFolderButton = document.getElementById("code-converter-open-folder");
  const codeConverterFinishButton = document.getElementById("code-converter-finish");
  const codeConverterStatus = document.getElementById("code-converter-status");
  const codeConverterShell = document.getElementById("code-converter-shell");
  const codeConverterConsoleToggle = document.getElementById("code-converter-console-toggle");
  const codeConverterConsolePanel = document.getElementById("code-converter-console-panel");
  const codeConverterConsoleOutput = document.getElementById("code-converter-console-output");
  const codeConverterConsoleState = document.getElementById("code-converter-console-state");
  const codeConverterConsoleTimer = document.getElementById("code-converter-console-timer");
  const codeConverterConsoleAutoScrollButton = document.getElementById("code-converter-console-autoscroll");
  const codeConverterConsoleCopyButton = document.getElementById("code-converter-console-copy");
  const codeConverterProgressPanel = document.getElementById("code-converter-progress");
  const codeConverterProgressStage = document.getElementById("code-converter-progress-stage");
  const codeConverterProgressPercent = document.getElementById("code-converter-progress-percent");
  const codeConverterProgressTrack = codeConverterProgressPanel?.querySelector(".code-converter-progress-track") || null;
  const codeConverterProgressFill = document.getElementById("code-converter-progress-fill");
  const codeConverterProgressCount = document.getElementById("code-converter-progress-count");
  const codeConverterProgressTime = document.getElementById("code-converter-progress-time");
  const codeConverterTaskPill = document.getElementById("code-converter-task-pill");
  const codeConverterTaskName = document.getElementById("code-converter-task-name");
  const codeConverterTaskStatus = document.getElementById("code-converter-task-status");
  const codeConverterTaskLabel = document.getElementById("code-converter-task-label");
  let activeCodeConverterProcessId = null;
  let activeCodeConverterProcessPid = null;
  let activeCodeConverterProcessCancel = null;
  let codeConverterIsRunning = false;
  let codeConverterCancelRequested = false;
  let codeConverterConsoleAutoScrollPaused = false;
  let codeConverterConsoleCopyFeedbackTimer = null;
  let codeConverterProgressTimer = null;
  let codeConverterOutputLineBuffer = "";
  let codeConverterProgress = createEmptyCodeConverterProgress();
  let completedCodeConverterDestinationRoot = "";
  let codeConverterTask = null;
  const desktopOpenGraphButtons = document.querySelectorAll(".open-graph-view");
  const exitAppButtons = document.querySelectorAll(".exit-app-button");
  const graphViewCanvas = document.getElementById("graph-view-canvas");
  const graphFindDialog = document.getElementById("graph-find-dialog");
  const graphFindInput = document.getElementById("graph-find-input");
  const graphFindStatus = document.getElementById("graph-find-status");
  const graphFindOkButton = document.getElementById("graph-find-ok");
  const graphFindCancelButton = document.getElementById("graph-find-cancel");
  const graphViewToolbar = document.querySelector(".graph-view-toolbar");
  const graphFilterPanelToggle = document.getElementById("graph-filter-panel-toggle");
  const graphShowTagsButton = document.getElementById("graph-show-tags");
  const graphHideTagsButton = document.getElementById("graph-hide-tags");
  const graphDisplayExternalJars = document.getElementById("graph-display-external-jars");
  const graphDisplayMissingDependencies = document.getElementById("graph-display-missing-dependencies");
  const graphSelectedTagFilter = document.getElementById("graph-selected-tag-filter");
  const graphOnlySelectedTagButton = document.getElementById("graph-only-selected-tag");
  const graphGroupsList = document.getElementById("graph-groups-list");
  const graphAddGroupButton = document.getElementById("graph-add-group");
  const graphFileSearchFilter = document.getElementById("graph-file-search-filter");
  const graphDisplayArrows = document.getElementById("graph-display-arrows");
  const graphDisplayOrphans = document.getElementById("graph-display-orphans");
  const graphDisplayLabels = document.getElementById("graph-display-labels");
  const graphTextFadeThreshold = document.getElementById("graph-text-fade-threshold");
  const graphNodeSize = document.getElementById("graph-node-size");
  const graphLinkThickness = document.getElementById("graph-link-thickness");
  const graphCenterForce = document.getElementById("graph-center-force");
  const graphRepelForce = document.getElementById("graph-repel-force");
  const graphLinkForce = document.getElementById("graph-link-force");
  const graphLinkDistance = document.getElementById("graph-link-distance");
  const graphGroupForce = document.getElementById("graph-group-force");
  const graphResetDefaultsButton = document.getElementById("graph-reset-defaults");
  const graphStaleModal = document.getElementById("graph-stale-modal");
  const graphStaleCloseButton = document.getElementById("graph-stale-close");
  const graphStaleUpdateButton = document.getElementById("graph-stale-update");
  const graphStaleKeepButton = document.getElementById("graph-stale-keep");
  const graphStaleCompareButton = document.getElementById("graph-stale-compare");
  const graphStaleViewDetailsButton = document.getElementById("graph-stale-view-details");
  const graphComparisonDetailsModal = document.getElementById("graph-comparison-details-modal");
  const graphComparisonDetailsCloseButton = document.getElementById("graph-comparison-details-close");
  const graphComparisonDetailsDoneButton = document.getElementById("graph-comparison-details-done");
  const graphComparisonDetailsContent = document.getElementById("graph-comparison-details-content");
  const graphStaleNewFilesCount = document.getElementById("graph-stale-new-files");
  const graphStaleSavedOnlyFilesCount = document.getElementById("graph-stale-saved-only-files");
  const graphStaleChangedConnectionsCount = document.getElementById("graph-stale-changed-connections");
  const graphStaleChangedTagsCount = document.getElementById("graph-stale-changed-tags");
  const shareButton         = document.getElementById("share-button");
  const mobileShareButton   = document.getElementById("mobile-share-button");
  const githubImportModal = document.getElementById("github-import-modal");
  const githubImportTitle = document.getElementById("github-import-title");
  const githubImportUrlInput = document.getElementById("github-import-url");
  const githubImportFileSelect = document.getElementById("github-import-file-select");
  const githubImportSelectionToolbar = document.getElementById("github-import-selection-toolbar");
  const githubImportSelectedCount = document.getElementById("github-import-selected-count");
  const githubImportSelectAllBtn = document.getElementById("github-import-select-all");
  const githubImportTree = document.getElementById("github-import-tree");
  const githubImportError = document.getElementById("github-import-error");
  const githubImportCancelBtn = document.getElementById("github-import-cancel");
  const githubImportSubmitBtn = document.getElementById("github-import-submit");

  // ========================================
  // GLOBAL STATE (persisted across reloads)
  // ========================================
  const GLOBAL_STATE_KEY = 'markdownViewerGlobalState';
  const DEFAULT_GRAPH_AUTO_CLUSTER_THRESHOLD = 1000;
  const DEFAULT_GRAPH_RENDER_WARNING_THRESHOLD = 1500;
  const DEFAULT_GRAPH_MOST_REFERENCED_PERCENT = 10;
  const DEFAULT_GRAPH_STATIC_WARMUP_TICKS = 12;
  const DEFAULT_GRAPH_COLOR_SCHEMES = Object.freeze({
    light: Object.freeze({
      nodeDefault: "#58a6ff",
      link: "#d0d7de",
      externalDependency: "#c26a1b",
      externalDependencyLine: "#9a6700",
      missingDependency: "#1a288e",
      missingDependencyLine: "#6c76f9",
      tagNode: "#14b8a6",
      tagLine: "#8c959f",
      clusterNode: "#f59e0b",
      findHighlight: "#fff8c5"
    }),
    dark: Object.freeze({
      nodeDefault: "#58a6ff",
      link: "#30363d",
      externalDependency: "#c26a1b",
      externalDependencyLine: "#5e4e40",
      missingDependency: "#1a288e",
      missingDependencyLine: "#6c76f9",
      tagNode: "#14b8a6",
      tagLine: "#6e7781",
      clusterNode: "#f59e0b",
      findHighlight: "#ffff00"
    })
  });
  const DEFAULT_GRAPH_NODE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.nodeDefault;
  const DEFAULT_GRAPH_LINK_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.link;
  const DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.externalDependency;
  const DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_LINE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.externalDependencyLine;
  const DEFAULT_GRAPH_MISSING_DEPENDENCY_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.missingDependency;
  const DEFAULT_GRAPH_MISSING_DEPENDENCY_LINE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.missingDependencyLine;
  const DEFAULT_GRAPH_TAG_NODE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.tagNode;
  const DEFAULT_GRAPH_TAG_LINE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.tagLine;
  const DEFAULT_GRAPH_CLUSTER_NODE_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.clusterNode;
  const DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR = DEFAULT_GRAPH_COLOR_SCHEMES.dark.findHighlight;
  const GRAPH_COLOR_SETTINGS = Object.freeze([
    { key: "nodeDefault", stateKey: "graphNodeDefaultColor", fallback: DEFAULT_GRAPH_NODE_COLOR },
    { key: "link", stateKey: "graphLinkColor", fallback: DEFAULT_GRAPH_LINK_COLOR },
    { key: "externalDependency", stateKey: "graphExternalDependencyColor", fallback: DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_COLOR },
    { key: "externalDependencyLine", stateKey: "graphExternalDependencyLineColor", fallback: DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_LINE_COLOR },
    { key: "missingDependency", stateKey: "graphMissingDependencyColor", fallback: DEFAULT_GRAPH_MISSING_DEPENDENCY_COLOR },
    { key: "missingDependencyLine", stateKey: "graphMissingDependencyLineColor", fallback: DEFAULT_GRAPH_MISSING_DEPENDENCY_LINE_COLOR },
    { key: "tagNode", stateKey: "graphTagNodeColor", fallback: DEFAULT_GRAPH_TAG_NODE_COLOR },
    { key: "tagLine", stateKey: "graphTagLineColor", fallback: DEFAULT_GRAPH_TAG_LINE_COLOR },
    { key: "clusterNode", stateKey: "graphClusterNodeColor", fallback: DEFAULT_GRAPH_CLUSTER_NODE_COLOR },
    { key: "findHighlight", stateKey: "graphFindHighlightColor", fallback: DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR }
  ]);
  const DEFAULT_CONTEXT_MENU_TOOLTIP_DELAY_MS = 3000;
  const DEFAULT_CLOSED_TAB_HISTORY_LIMIT = 20;
  const DEFAULT_MAX_OPEN_TABS = 40;
  const MIN_OPEN_TAB_LIMIT = 1;
  const MAX_OPEN_TAB_LIMIT = 60;
  const DEFAULT_MAX_RECENT_FILES = 10;
  const DEFAULT_MAX_RECENT_FOLDERS = 10;
  const DEFAULT_JDT_MAXIMUM_PROBLEMS = 5000;
  const DEFAULT_JDT_INITIAL_PROBLEM_LIMIT = 100;
  const DEFAULT_AJDT_DIAGNOSTICS_ENABLED = false;
  const DEFAULT_API_CLIENT_RECENT_HISTORY_LIMIT = 50;
  const DEFAULT_API_CLIENT_REQUEST_SETTINGS = Object.freeze({
    autoFollowRedirects: true,
    maxRedirects: 10,
    preserveMethodOnRedirect: false,
    redirectAuthHeaderPolicy: "same-origin",
    redirectCustomHeaderPolicy: "same-origin",
    timeoutMs: 60000,
    sslCertificateVerification: true,
    trustedCertificates: [],
    cookieJarEnabled: true,
    sendNoCacheHeader: false,
    maxResponseSizeBytes: 52428800,
    responseRenderMode: "auto",
    decompressResponses: true,
    proxyMode: "system",
    proxyUrl: "",
    httpVersion: "auto"
  });
  const API_CLIENT_REDIRECT_HEADER_POLICIES = new Set(["same-origin", "always", "never"]);
  const API_CLIENT_RESPONSE_RENDER_MODES = new Set(["auto", "json", "text", "html", "xml", "binary"]);
  const API_CLIENT_PROXY_MODES = new Set(["system", "custom"]);
  const API_CLIENT_HTTP_VERSIONS = new Set(["auto", "http1.1"]);
  const DEFAULT_WORKSPACE_SEARCH_RESULT_LIMIT = 300;
  const DEFAULT_SUPPORTED_TEXT_EXTENSIONS_TEXT = (languageRegistry?.getDefaultSupportedTextExtensions?.() || languageRegistry?.getSupportedTextExtensions?.() || []).join(", ");
  const DEFAULT_FOLDER_TREE_EXPAND_LIMIT_THRESHOLD = 1000;
  const DEFAULT_FOLDER_TREE_EXPAND_LIMIT_DEPTH = 5;
  const DEFAULT_DEBUG_LEVEL = "warning";
  const DEFAULT_DEBUG_MAX_LOG_SIZE_MB = 10;
  const DEFAULT_DEBUG_MAX_LOG_FILES = 10;
  const DEFAULT_STARTUP_BEHAVIOR = "last-tabs";
  const DEFAULT_EXTERNAL_FILE_CHANGE_BEHAVIOR = "prompt";
  const DEFAULT_EDITOR_FONT_FAMILY = "mono";
  const DEFAULT_EDITOR_FONT_SIZE = 14;
  const DEFAULT_SPACES_PER_INDENT_LEVEL = 4;
  const DEFAULT_TABS_PER_INDENT_LEVEL = 1;
  const STARTUP_BEHAVIORS = new Set(["last-tabs", "welcome", "untitled", "empty"]);
  const EXTERNAL_FILE_CHANGE_BEHAVIORS = new Set(["ignore", "prompt", "auto-refresh"]);
  const DEFAULT_GRADLE_MODE = "auto";
  const DEFAULT_GRADLE_METADATA_FAILURE = "parse-only";
  const GRADLE_MODES = new Set(["auto", "wrapper", "local"]);
  const GRADLE_METADATA_FAILURE_MODES = new Set(["parse-only", "fail"]);
  const EDITOR_FONT_FAMILIES = Object.freeze({
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    cascadia: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
    consolas: "Consolas, 'Courier New', monospace",
    jetbrains: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
    fira: "'Fira Code', 'SFMono-Regular', Consolas, monospace",
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif"
  });
  const DEBUG_LEVELS = Object.freeze({
    debug: 10,
    info: 20,
    warning: 30,
    error: 40
  });
  const DEBUG_LOG_CATEGORIES = Object.freeze([
    { id: "startup-perf", label: "Startup performance", description: "Startup timing marks and native launch timing." },
    { id: "tab-activation-perf", label: "Tabs performance", description: "Tab switching and tab activation timings." },
    { id: "tabs-session", label: "Session", description: "Tab session persistence, hydration, and lifecycle events." },
    { id: "cache", label: "Cache", description: "Cache clearing and cache maintenance diagnostics." },
    { id: "preview-render-perf", label: "Preview render performance", description: "Markdown preview render and enhancement timings." },
    { id: "lsp", label: "Language servers", description: "Language server startup, install, and protocol diagnostics." },
    { id: "graph-perf", label: "Graph performance", description: "Graph rendering, tagging, and persistence timings." },
    { id: "graph", label: "Graph", description: "Graph tagging and bulk graph operation diagnostics." },
    { id: "graph-save", label: "Graph save", description: "Graph document save diagnostics." },
    { id: "graph-health", label: "Graph health", description: "Graph health checks and recovery diagnostics." },
    { id: "maven-recovery", label: "Maven recovery", description: "Maven dependency recovery diagnostics." },
    { id: "folder-open", label: "Folder open", description: "Folder open and folder scan diagnostics." },
    { id: "large-file-open", label: "Large file open", description: "Large file open decisions and sidebar diagnostics." },
    { id: "large-file-viewer", label: "Large file viewer", description: "Large file viewer diagnostics." },
    { id: "original-export", label: "Original export", description: "Original source export diagnostics." },
    { id: "workspace-git", label: "Workspace Git", description: "Workspace Git command and status diagnostics." },
    { id: "terminal", label: "Terminal", description: "Desktop terminal lifecycle and command diagnostics." },
    { id: "ai-companion", label: "AI Companion", description: "AI Companion request/response diagnostics: provider calls, retries, and completion results for chat, autocomplete, and agent mode." }
  ]);
  const DEBUG_LOG_CATEGORY_IDS = new Set(DEBUG_LOG_CATEGORIES.map((category) => category.id));
  const DEFAULT_DEBUG_CATEGORIES = Object.freeze(DEBUG_LOG_CATEGORIES.reduce((categories, category) => {
    categories[category.id] = true;
    return categories;
  }, {}));
  DEBUG_LOG_CATEGORIES.forEach((category) => {
    SETTINGS_CONTROL_TOOLTIPS[`settings-debug-category-${category.id}`] = `${category.label}: ${category.description}`;
  });
  SETTINGS_CONTROL_TOOLTIPS["settings-debug-ai-full-payloads"] = "Include full AI request and response bodies in AI Companion debug logs. May include prompts, file snippets, tool results, and model output.";
  const originalConsoleMethods = Object.freeze({
    debug: console.debug.bind(console),
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  });
  const SYNTAX_HIGHLIGHT_TOKENS = Object.freeze([
    { key: "muted", label: "Markers and punctuation", cssVar: "--editor-syntax-muted", previewVars: [] },
    { key: "heading", label: "Headings", cssVar: "--editor-syntax-heading", previewVars: ["--color-prettylights-syntax-markup-heading"] },
    { key: "strong", label: "Bold text", cssVar: "--editor-syntax-strong", previewVars: ["--color-prettylights-syntax-markup-bold"] },
    { key: "emphasis", label: "Emphasis", cssVar: "--editor-syntax-emphasis", previewVars: ["--color-prettylights-syntax-markup-italic"] },
    { key: "code", label: "Inline code and regex", cssVar: "--editor-syntax-code", previewVars: ["--color-prettylights-syntax-string-regexp"] },
    { key: "link", label: "Links", cssVar: "--editor-syntax-link", previewVars: [] },
    { key: "url", label: "URLs", cssVar: "--editor-syntax-url", previewVars: [] },
    { key: "quote", label: "Quotes", cssVar: "--editor-syntax-quote", previewVars: ["--color-prettylights-syntax-comment"] },
    { key: "list", label: "Lists", cssVar: "--editor-syntax-list", previewVars: ["--color-prettylights-syntax-markup-list"] },
    { key: "table", label: "Tables", cssVar: "--editor-syntax-table", previewVars: [] },
    { key: "keyword", label: "Keywords", cssVar: "--editor-syntax-keyword", previewVars: ["--color-prettylights-syntax-keyword"] },
    { key: "atom", label: "Atoms and booleans", cssVar: "--editor-syntax-atom", previewVars: ["--color-prettylights-syntax-constant"] },
    { key: "string", label: "Strings", cssVar: "--editor-syntax-string", previewVars: ["--color-prettylights-syntax-string"] },
    { key: "number", label: "Numbers", cssVar: "--editor-syntax-number", previewVars: ["--color-prettylights-syntax-constant"] },
    { key: "type", label: "Types and classes", cssVar: "--editor-syntax-type", previewVars: ["--color-prettylights-syntax-entity"] },
    { key: "function", label: "Functions", cssVar: "--editor-syntax-function", previewVars: ["--color-prettylights-syntax-entity"] },
    { key: "variable", label: "Variables", cssVar: "--editor-syntax-variable", previewVars: ["--color-prettylights-syntax-variable"] },
    { key: "property", label: "Properties", cssVar: "--editor-syntax-property", previewVars: ["--color-prettylights-syntax-constant"] },
    { key: "operator", label: "Operators", cssVar: "--editor-syntax-operator", previewVars: ["--color-prettylights-syntax-constant"] },
    { key: "bracket", label: "Brackets", cssVar: "--editor-syntax-bracket", previewVars: ["--color-prettylights-syntax-brackethighlighter-angle"] },
    { key: "comment", label: "Comments", cssVar: "--editor-syntax-comment", previewVars: ["--color-prettylights-syntax-comment"] },
    { key: "tag", label: "Tags", cssVar: "--editor-syntax-tag", previewVars: ["--color-prettylights-syntax-entity-tag"] },
    { key: "attribute", label: "Attributes", cssVar: "--editor-syntax-attribute", previewVars: ["--color-prettylights-syntax-constant"] },
    { key: "invalid", label: "Invalid syntax", cssVar: "--editor-syntax-invalid", previewVars: ["--color-prettylights-syntax-invalid-illegal-bg"] }
  ]);
  const DEFAULT_SYNTAX_TOKEN_COLORS = Object.freeze({
    light: Object.freeze({
      muted: "#57606a",
      heading: "#0550ae",
      strong: "#24292f",
      emphasis: "#24292f",
      code: "#cf222e",
      link: "#0969da",
      url: "#0550ae",
      quote: "#57606a",
      list: "#953800",
      table: "#57606a",
      keyword: "#cf222e",
      atom: "#0550ae",
      string: "#0a3069",
      number: "#0550ae",
      type: "#953800",
      function: "#8250df",
      variable: "#24292f",
      property: "#0550ae",
      operator: "#24292f",
      bracket: "#57606a",
      comment: "#6e7781",
      tag: "#116329",
      attribute: "#0550ae",
      invalid: "#82071e"
    }),
    dark: Object.freeze({
      muted: "#9aa6b2",
      heading: "#7dd3fc",
      strong: "#e5e7eb",
      emphasis: "#f0abfc",
      code: "#fca5a5",
      link: "#93c5fd",
      url: "#86efac",
      quote: "#a7d76f",
      list: "#fbbf24",
      table: "#eab308",
      keyword: "#c4b5fd",
      atom: "#67e8f9",
      string: "#fbbf8f",
      number: "#fde68a",
      type: "#5eead4",
      function: "#7dd3fc",
      variable: "#e2e8f0",
      property: "#d8b4fe",
      operator: "#cbd5e1",
      bracket: "#94a3b8",
      comment: "#9ac26b",
      tag: "#5eead4",
      attribute: "#facc15",
      invalid: "#f87171"
    })
  });
  const DEFAULT_SIDEBAR_RAIL_ICON_ORDER = Object.freeze([
    "files",
    "search",
    "git",
    "api-client",
    "regex-tester",
    "convert",
    "ai-companion",
    "settings"
  ]);
  const DEFAULT_SIDEBAR_RAIL_ICON_VISIBILITY = Object.freeze({
    git: true,
    "api-client": true,
    "regex-tester": true,
    "ai-companion": true,
    settings: true
  });
  const DEFAULT_GLOBAL_STATE = Object.freeze({
    autoSelectFileEnabled: true,
    editorWidthPercent: 50,
    aiCompanionPanelWidth: 380,
    aiCompanionWorkspaceHistoryWidth: 320,
    aiCompanionWorkspaceInspectorWidth: 320,
    folderSortMode: "name-asc",
    folderTreeExpandLimitThreshold: DEFAULT_FOLDER_TREE_EXPAND_LIMIT_THRESHOLD,
    folderTreeExpandLimitDepth: DEFAULT_FOLDER_TREE_EXPAND_LIMIT_DEPTH,
    confirmExitApplication: false,
    confirmCancelBackgroundProcess: true,
    confirmDeleteFiles: true,
    confirmMoveFiles: true,
    confirmOpenManyGraphNodes: true,
    backgroundProcessHistory: [],
    confirmResetState: true,
    confirmResetJdtWorkspace: true,
    confirmJavaBuildPathRebuild: true,
    confirmEditedPromptAttachmentRemoval: false,
    contextMenuTooltipDelayMs: DEFAULT_CONTEXT_MENU_TOOLTIP_DELAY_MS,
    closedTabHistoryLimit: DEFAULT_CLOSED_TAB_HISTORY_LIMIT,
    codeConverterDestinationRoot: "",
    codeConverterGradleInstallations: [],
    codeConverterGradleMetadataFailure: DEFAULT_GRADLE_METADATA_FAILURE,
    codeConverterGradleMode: DEFAULT_GRADLE_MODE,
    codeConverterGradleOffline: false,
    codeConverterGradleUserHome: "",
    codeConverterJavaJdks: [],
    codeConverterSelectedGradleInstallationId: "",
    codeConverterSourceRoot: "",
    debugEnabled: false,
    debugLevel: DEFAULT_DEBUG_LEVEL,
    debugLogPath: "",
    debugMaxLogFiles: DEFAULT_DEBUG_MAX_LOG_FILES,
    debugMaxLogSizeMb: DEFAULT_DEBUG_MAX_LOG_SIZE_MB,
    debugCategories: DEFAULT_DEBUG_CATEGORIES,
    debugWriteToFile: false,
    fileOpeningModes: { version: 1, modes: {} },
    documentWordAutocompleteEnabled: true,
    editorSnippetPreferences: { version: 1, overrides: {}, custom: {} },
    keyboardShortcutOverrides: {},
    editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
    jdtInteractiveRequestTimeoutMs: 3000,
    externalFileChangeBehavior: DEFAULT_EXTERNAL_FILE_CHANGE_BEHAVIOR,
    graphAutoClusterLargeMapsEnabled: false,
    graphAutoClusterThreshold: DEFAULT_GRAPH_AUTO_CLUSTER_THRESHOLD,
    graphLargeMapHoverDimOtherNodes: false,
    graphLargeMapHoverShowConnectedLabels: true,
    graphLargeMapHoverHighlightConnectedLines: true,
    graphRenderWarningThreshold: DEFAULT_GRAPH_RENDER_WARNING_THRESHOLD,
    graphMostReferencedPercent: DEFAULT_GRAPH_MOST_REFERENCED_PERCENT,
    graphStaticWarmupTicks: DEFAULT_GRAPH_STATIC_WARMUP_TICKS,
    graphShowFileExtensions: false,
    graphColorSchemes: DEFAULT_GRAPH_COLOR_SCHEMES,
    graphNodeDefaultColor: DEFAULT_GRAPH_NODE_COLOR,
    graphLinkColor: DEFAULT_GRAPH_LINK_COLOR,
    graphExternalDependencyColor: DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_COLOR,
    graphExternalDependencyLineColor: DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_LINE_COLOR,
    graphMissingDependencyColor: DEFAULT_GRAPH_MISSING_DEPENDENCY_COLOR,
    graphMissingDependencyLineColor: DEFAULT_GRAPH_MISSING_DEPENDENCY_LINE_COLOR,
    graphTagNodeColor: DEFAULT_GRAPH_TAG_NODE_COLOR,
    graphTagLineColor: DEFAULT_GRAPH_TAG_LINE_COLOR,
    graphClusterNodeColor: DEFAULT_GRAPH_CLUSTER_NODE_COLOR,
    graphFindHighlightColor: DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR,
    graphMagneticEnabled: true,
    graphViewPreferences: {},
    languageAutocompleteEnabled: true,
    languageServerAutocompleteEnabled: true,
    languageServerAutoStartPreferences: DEFAULT_LANGUAGE_SERVER_AUTO_START_PREFERENCES,
    maxOpenTabs: DEFAULT_MAX_OPEN_TABS,
    maxRecentFiles: DEFAULT_MAX_RECENT_FILES,
    maxRecentFolders: DEFAULT_MAX_RECENT_FOLDERS,
    jdtMaximumProblems: DEFAULT_JDT_MAXIMUM_PROBLEMS,
    jdtInitialProblemLimit: DEFAULT_JDT_INITIAL_PROBLEM_LIMIT,
    ajdtDiagnosticsEnabled: DEFAULT_AJDT_DIAGNOSTICS_ENABLED,
    apiClientRecentHistoryLimit: DEFAULT_API_CLIENT_RECENT_HISTORY_LIMIT,
    apiClientRequestSettings: DEFAULT_API_CLIENT_REQUEST_SETTINGS,
    workspaceSearchResultLimit: DEFAULT_WORKSPACE_SEARCH_RESULT_LIMIT,
    supportedTextExtensions: DEFAULT_SUPPORTED_TEXT_EXTENSIONS_TEXT,
    appZoomPercent: 100,
    showSymbolPreferences: DEFAULT_SHOW_SYMBOL_PREFERENCES,
    showGitProjectFolder: false,
    showMdEditorProjectFolder: false,
    hiddenFolderNames: "",
    showUnsupportedFolderFiles: false,
    sidebarDropzoneVisible: true,
    outlinePanelVisible: true,
    sidebarLowerPanelActiveTab: "outline",
    sidebarVisible: true,
    sidebarRailStyle: "thin",
    sidebarRailIconOrder: DEFAULT_SIDEBAR_RAIL_ICON_ORDER,
    sidebarRailIconVisibility: DEFAULT_SIDEBAR_RAIL_ICON_VISIBILITY,
    appHeaderSpacing: "thin",
    tabStyle: "modern",
    snippetAutocompleteEnabled: true,
    spacesPerIndentLevel: DEFAULT_SPACES_PER_INDENT_LEVEL,
    statusBarVisible: true,
    lastOpenFolderPath: "",
    restoreLastFolderOnStartup: true,
    desktopTerminalTabs: [],
    menuLayout: "full",
    startupBehavior: DEFAULT_STARTUP_BEHAVIOR,
    syncScrollingEnabled: true,
    tabsPerIndentLevel: DEFAULT_TABS_PER_INDENT_LEVEL,
    themeSelections: window.markdownViewerThemeRegistry?.DEFAULT_SELECTIONS || { light: "default-light", dark: "default-dark" },
    customThemes: { light: [], dark: [] },
    syntaxHighlightColors: {},
    unclosedBracketHighlightEnabled: false,
    viewMode: "split",
    wordWrapEnabled: false,
    aiCompanionPanelVisible: false,
    aiCompanionSelectedMode: "chat",
    aiCompanionSettings: window.markdownViewerApp?.modules?.aiCompanionSettings?.defaults || {
      enabled: false,
      providerMode: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3.1",
      litellmModelAlias: "",
      litellmRoutingConfig: "",
      geminiConnectorBaseUrl: "",
      geminiConnectorId: "",
      geminiConnectorApiKey: "",
      trustedCertificates: [],
      chatEnabled: true,
      autocompleteEnabled: false,
      agentEnabled: false,
      providerRequestDelayMs: 1000,
      maxTokensPerChatMinute: 0,
      maxTasksPerChat: 30,
      agentMaxResponseTokens: 0,
      showReasoning: true,
      debugLogFullAiPayloads: false,
      inputSubmitMode: "ctrl-enter",
      autocompleteIdleMs: 700,
      autocompleteRejectCharacters: 24,
      autocompleteRejectDelayMs: 2500,
      agentAutoRunCommands: false,
      agentConfirmBeforeWrite: true
    }
  });
  let settingsDialogSaving = false;
  let syntaxHighlightColorDraft = null;
  let syntaxEditorLayer = null;
  let syntaxEditorLanguageSelect = null;
  let syntaxEditorTokenList = null;
  let syntaxEditorPreviewHost = null;
  let syntaxEditorPreview = null;
  let syntaxEditorDraftSnapshot = null;
  let appThemeDraft = null;
  let settingsGradleInstallationsDraft = [];
  let settingsJavaConverterJdksDraft = [];
  let settingsSnippetPreferencesDraft = null;
  let settingsSnippetLanguageId = "javascript";
  let settingsSelectedSnippetId = "";
  let keyboardShortcutsSettings = null;
  const themePreferences = window.registerMarkdownViewerThemePreferences(app, {
    defaultState: DEFAULT_GLOBAL_STATE,
    mobileThemeToggle,
    renderMarkdown: function() {
      renderMarkdown();
      const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
      if (activeGraphTab && typeof renderGraphView === "function") {
        renderGraphView({ skipToolbar: true }).catch((error) => console.warn("Failed to refresh graph theme:", error));
      }
    },
    scheduleGlobalProfileWrite: function() { scheduleGlobalProfileWrite(); },
    settingsThemeToggle,
    storageKey: GLOBAL_STATE_KEY,
    themeToggle
  });
  const loadGlobalState = themePreferences.loadGlobalState;
  const saveGlobalState = themePreferences.saveGlobalState;
  const fileOpeningModeSettings = window.registerMarkdownViewerFileOpeningModeSettings(app, {
    languageRegistry,
    loadGlobalState,
    supportedExtensionsInput: settingsSupportedTextExtensionsInput
  });
  const getDefaultGlobalState = themePreferences.getDefaultGlobalState;
  const sidebarRailPreferences = window.registerMarkdownViewerSidebarRailPreferences(app, {
    defaultOrder: DEFAULT_SIDEBAR_RAIL_ICON_ORDER,
    defaultVisibility: DEFAULT_SIDEBAR_RAIL_ICON_VISIBILITY,
    loadGlobalState,
    saveGlobalState,
    scheduleGlobalProfileWrite
  });
  const updateThemeButtonLabels = themePreferences.updateThemeButtonLabels;
  const applicationMenu = window.registerMarkdownViewerApplicationMenu?.(app, {
    hamburgerHost: document.querySelector(".header-action-menu"),
    hamburgerMenu: document.querySelector(".header-action-menu .action-menu"),
    fixedMenuHost: document.getElementById("desktop-application-menu"),
    layoutInput: settingsMenuLayoutInput,
    loadGlobalState,
    saveGlobalState
  });
  function replaceGlobalState(nextState) {
    const state = nextState && typeof nextState === "object" && !Array.isArray(nextState) ? nextState : {};
    try {
      localStorage.setItem(GLOBAL_STATE_KEY, JSON.stringify(state));
      scheduleGlobalProfileWrite();
    } catch (error) {
      console.warn("Failed to replace preferences:", error);
      throw error;
    }
  }
  themePreferences.initializeTheme();
  const settingsTransfer = window.registerMarkdownViewerSettingsTransfer?.(app, {
    getDefaultGlobalState,
    isFirefoxBrowser,
    loadGlobalState,
    localStorage,
    refreshPreferences: function() { return refreshPreferencesAfterSettingsChange({ refreshSettingsDialog: true }); },
    replaceGlobalState,
    saveAs: typeof saveAs === "function" ? saveAs : undefined,
    scheduleGlobalProfileWrite,
    storageKey: GLOBAL_STATE_KEY,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; }
  });
  if (typeof window.registerMarkdownViewerAiCompanionSettingsTools === "function") {
    aiCompanionSettingsTools = window.registerMarkdownViewerAiCompanionSettingsTools(app, {
      aiCompanionSettings,
      getDefaultGlobalState,
      loadGlobalState,
      refreshPreferences: function(options) { return refreshPreferencesAfterSettingsChange(Object.assign({ refreshSettingsDialog: true }, options || {})); },
      replaceGlobalState,
      saveGlobalState,
      settingsTransfer
    });
  }
  const viewWindowControls = window.registerMarkdownViewerViewWindowControls(app, {
    appZoomPercentElement,
    appZoomStatusElement,
    fullscreenButtons: toggleFullscreenButtons,
    loadGlobalState: function() { return loadGlobalState(); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    openDownloadsWindowButtons,
    saveGlobalState: function(patch) { return saveGlobalState(patch); },
    zoomInButtons: appZoomInButtons,
    zoomOutButtons: appZoomOutButtons,
    zoomResetButtons: appZoomResetButtons
  });

  function normalizeDebugLevel(level) {
    const key = String(level || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(DEBUG_LEVELS, key) ? key : DEFAULT_DEBUG_LEVEL;
  }

  function normalizeDebugPositiveInteger(value, fallback, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(1, Math.min(max, Math.floor(numericValue)));
  }

  function normalizeDebugCategories(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return DEBUG_LOG_CATEGORIES.reduce((categories, category) => {
      categories[category.id] = source[category.id] !== false;
      return categories;
    }, {});
  }

  function getDebugLogCategory(message) {
    const match = String(message || "").match(/^\s*\[([a-z0-9]+(?:-[a-z0-9]+)*)\]/i);
    const category = match ? match[1].toLowerCase() : "";
    return DEBUG_LOG_CATEGORY_IDS.has(category) ? category : "";
  }

  function isDebugCategoryEnabled(category, categories) {
    if (!category || !DEBUG_LOG_CATEGORY_IDS.has(category)) return true;
    const normalizedCategories = categories && typeof categories === "object" && !Array.isArray(categories)
      ? categories
      : DEFAULT_DEBUG_CATEGORIES;
    return normalizedCategories[category] !== false;
  }

  function applyDebugCategoryInputs(categories) {
    if (!settingsDebugCategoryInputs?.length) return;
    const normalizedCategories = normalizeDebugCategories(categories);
    settingsDebugCategoryInputs.forEach((input) => {
      const category = input.dataset.debugCategory || "";
      input.checked = isDebugCategoryEnabled(category, normalizedCategories);
    });
  }

  function collectDebugCategorySettings() {
    const inputsByCategory = new Map(Array.from(settingsDebugCategoryInputs || []).map((input) => [
      input.dataset.debugCategory || "",
      input
    ]));
    return DEBUG_LOG_CATEGORIES.reduce((categories, category) => {
      const input = inputsByCategory.get(category.id);
      categories[category.id] = input ? input.checked !== false : true;
      return categories;
    }, {});
  }

  function getDebugMaxLogSizeMb() {
    return normalizeDebugPositiveInteger(loadGlobalState().debugMaxLogSizeMb, DEFAULT_DEBUG_MAX_LOG_SIZE_MB, 1024);
  }

  function getDebugMaxLogFiles() {
    return normalizeDebugPositiveInteger(loadGlobalState().debugMaxLogFiles, DEFAULT_DEBUG_MAX_LOG_FILES, 1000);
  }

  function getDebugPreferences() {
    const state = loadGlobalState();
    return {
      categories: normalizeDebugCategories(state.debugCategories),
      enabled: state.debugEnabled === true,
      level: normalizeDebugLevel(state.debugLevel),
      logPath: normalizeLocalPath(state.debugLogPath || ""),
      maxLogFiles: normalizeDebugPositiveInteger(state.debugMaxLogFiles, DEFAULT_DEBUG_MAX_LOG_FILES, 1000),
      maxLogSizeMb: normalizeDebugPositiveInteger(state.debugMaxLogSizeMb, DEFAULT_DEBUG_MAX_LOG_SIZE_MB, 1024),
      writeToFile: state.debugWriteToFile === true
    };
  }

  function shouldWriteAppDebugLog(level) {
    const preferences = getDebugPreferences();
    if (!preferences.enabled) return false;
    return DEBUG_LEVELS[normalizeDebugLevel(level)] >= DEBUG_LEVELS[preferences.level];
  }

  function getConsoleMethodForDebugLevel(level) {
    const normalizedLevel = normalizeDebugLevel(level);
    if (normalizedLevel === "error") return "error";
    if (normalizedLevel === "warning") return "warn";
    if (normalizedLevel === "info") return "info";
    return "debug";
  }

  function formatDebugDetails(details) {
    if (details === undefined || details === null || details === "") return "";
    if (details instanceof Error) return `${details.name || "Error"}: ${details.message || details}`;
    try {
      return JSON.stringify(details);
    } catch (_error) {
      return String(details);
    }
  }

  function formatDebugLine(level, message, details) {
    const suffix = details === undefined ? "" : ` ${formatDebugDetails(details)}`;
    return `[${new Date().toISOString()}] [${normalizeDebugLevel(level).toUpperCase()}] ${message}${suffix}`;
  }

  let debugLogFileWriteQueue = Promise.resolve();

  async function appendDebugLogFile(logPath, line) {
    if (!logPath || !isNeutralinoRuntime() || typeof Neutralino === "undefined" || !Neutralino.filesystem) return false;
    try {
      const rotation = window.markdownViewerLogRotation;
      const preferences = getDebugPreferences();
      if (rotation?.appendLogFileWithRotation) {
        return await rotation.appendLogFileWithRotation(Neutralino.filesystem, logPath, line, {
          maxLogFiles: preferences.maxLogFiles,
          maxLogSizeMb: preferences.maxLogSizeMb
        });
      }
      if (Neutralino.filesystem.appendFile) {
        await Neutralino.filesystem.appendFile(logPath, `${line}\n`);
        return true;
      }
      if (Neutralino.filesystem.writeFile) {
        let existing = "";
        try {
          if (Neutralino.filesystem.readFile) existing = await Neutralino.filesystem.readFile(logPath);
        } catch (_error) {
          existing = "";
        }
        await Neutralino.filesystem.writeFile(logPath, `${existing || ""}${line}\n`);
        return true;
      }
    } catch (error) {
      const method = originalConsoleMethods.warn || originalConsoleMethods.log;
      method("[md-editor] Failed to write debug log file:", error);
    }
    return false;
  }

  const debugLogBufferedWriter = window.markdownViewerLogRotation?.createBufferedLogWriter?.(
    function(logPath, content) {
      return appendDebugLogFile(logPath, content);
    },
    { flushDelayMs: 50, maxBatchLines: 50 }
  ) || null;

  function queueDebugLogFileWrite(logPath, line) {
    if (debugLogBufferedWriter) return debugLogBufferedWriter.write(logPath, line);
    const pendingWrite = debugLogFileWriteQueue.then(function() {
      return appendDebugLogFile(logPath, line);
    });
    debugLogFileWriteQueue = pendingWrite.catch(function() {
      return false;
    });
    return pendingWrite;
  }

  function flushDebugLogFileWrites() {
    return debugLogBufferedWriter?.flush?.() || debugLogFileWriteQueue;
  }

  async function appDebugLog(level, message, details) {
    const preferences = getDebugPreferences();
    const normalizedLevel = normalizeDebugLevel(level);
    if (!preferences.enabled || DEBUG_LEVELS[normalizedLevel] < DEBUG_LEVELS[preferences.level]) return null;
    const debugCategory = getDebugLogCategory(message);
    if (!isDebugCategoryEnabled(debugCategory, preferences.categories)) return null;
    const line = formatDebugLine(normalizedLevel, message, details);
    const consoleMethod = originalConsoleMethods[getConsoleMethodForDebugLevel(normalizedLevel)] || originalConsoleMethods.log;
    consoleMethod("[md-editor]", message, details || "");
    const wroteFile = preferences.writeToFile && preferences.logPath
      ? await queueDebugLogFileWrite(preferences.logPath, line)
      : false;
    return line;
  }
  window.markdownViewerAppDebugLog = appDebugLog;

  function shouldConsoleMethodWrite(methodName) {
    if (methodName === "log") return shouldWriteAppDebugLog("debug");
    if (methodName === "debug") return shouldWriteAppDebugLog("debug");
    if (methodName === "info") return shouldWriteAppDebugLog("info");
    if (methodName === "warn") return shouldWriteAppDebugLog("warning");
    if (methodName === "error") return shouldWriteAppDebugLog("error");
    return false;
  }

  function applyDebugConsolePreferences() {
    ["debug", "log", "info", "warn", "error"].forEach((methodName) => {
      console[methodName] = (...args) => {
        if (!shouldConsoleMethodWrite(methodName)) return;
        originalConsoleMethods[methodName](...args);
      };
    });
  }

  applyDebugConsolePreferences();
  startupPerf?.mark?.("debug logging initialized");
  startupPerf?.flushToAppDebug?.(appDebugLog);

  function getGraphAutoClusterThreshold() {
    const value = Number(loadGlobalState().graphAutoClusterThreshold);
    if (!Number.isFinite(value)) return DEFAULT_GRAPH_AUTO_CLUSTER_THRESHOLD;
    return Math.max(0, Math.min(100000, Math.floor(value)));
  }

  function isGraphAutoClusterLargeMapsEnabled() {
    return loadGlobalState().graphAutoClusterLargeMapsEnabled === true;
  }

  function getGraphRenderWarningThreshold() {
    const value = Number(loadGlobalState().graphRenderWarningThreshold);
    if (!Number.isFinite(value)) return DEFAULT_GRAPH_RENDER_WARNING_THRESHOLD;
    return Math.max(0, Math.min(100000, Math.floor(value)));
  }

  function getGraphMostReferencedPercent() {
    const value = Number(loadGlobalState().graphMostReferencedPercent);
    if (!Number.isFinite(value)) return DEFAULT_GRAPH_MOST_REFERENCED_PERCENT;
    return Math.max(1, Math.min(100, Math.floor(value)));
  }

  function getGraphStaticWarmupTicks() {
    const value = Number(loadGlobalState().graphStaticWarmupTicks);
    if (!Number.isFinite(value)) return DEFAULT_GRAPH_STATIC_WARMUP_TICKS;
    return Math.max(0, Math.min(200, Math.floor(value)));
  }

  function getGraphShowFileExtensions() {
    return loadGlobalState().graphShowFileExtensions === true;
  }

  function getGraphThemeMode(value) {
    return value === "dark" ? "dark" : "light";
  }

  function getCurrentGraphThemeMode() {
    return getGraphThemeMode(document.documentElement.getAttribute("data-theme"));
  }

  function normalizeGraphPreferenceColor(value, fallbackColor) {
    if (typeof normalizeGraphGroupColor === "function") {
      return normalizeGraphGroupColor(value, fallbackColor);
    }
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallbackColor;
  }

  function normalizeGraphColorScheme(mode, state = loadGlobalState()) {
    const normalizedMode = getGraphThemeMode(mode);
    const defaults = DEFAULT_GRAPH_COLOR_SCHEMES[normalizedMode];
    const schemes = state?.graphColorSchemes && typeof state.graphColorSchemes === "object" && !Array.isArray(state.graphColorSchemes)
      ? state.graphColorSchemes
      : {};
    const source = schemes[normalizedMode] && typeof schemes[normalizedMode] === "object" && !Array.isArray(schemes[normalizedMode])
      ? schemes[normalizedMode]
      : {};
    return GRAPH_COLOR_SETTINGS.reduce((colors, setting) => {
      const savedColor = normalizeGraphPreferenceColor(source[setting.key], defaults[setting.key]);
      const hasSavedColor = Object.prototype.hasOwnProperty.call(source, setting.key);
      const legacyColor = normalizeGraphPreferenceColor(state?.[setting.stateKey], setting.fallback);
      const hasLegacyCustomColor = Object.prototype.hasOwnProperty.call(state || {}, setting.stateKey) && legacyColor !== setting.fallback;
      colors[setting.key] = hasSavedColor ? savedColor : (hasLegacyCustomColor ? legacyColor : defaults[setting.key]);
      return colors;
    }, {});
  }

  function getGraphColorScheme(mode = getCurrentGraphThemeMode()) {
    return normalizeGraphColorScheme(mode);
  }

  function getGraphPreferenceColor(colorKey, fallbackColor) {
    return getGraphColorScheme()[colorKey] || fallbackColor;
  }

  function getGraphFindHighlightColor() {
    return getGraphPreferenceColor("findHighlight", DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR);
  }

  function getGraphExternalDependencyColor() {
    return getGraphPreferenceColor("externalDependency", DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_COLOR);
  }

  function getGraphExternalDependencyLineColor() {
    return getGraphPreferenceColor("externalDependencyLine", DEFAULT_GRAPH_EXTERNAL_DEPENDENCY_LINE_COLOR);
  }

  function getGraphMissingDependencyColor() {
    return getGraphPreferenceColor("missingDependency", DEFAULT_GRAPH_MISSING_DEPENDENCY_COLOR);
  }

  function getGraphMissingDependencyLineColor() {
    return getGraphPreferenceColor("missingDependencyLine", DEFAULT_GRAPH_MISSING_DEPENDENCY_LINE_COLOR);
  }

  function getGraphTagNodeColor() {
    return getGraphPreferenceColor("tagNode", DEFAULT_GRAPH_TAG_NODE_COLOR);
  }

  function getGraphTagLineColor() {
    return getGraphPreferenceColor("tagLine", DEFAULT_GRAPH_TAG_LINE_COLOR);
  }

  function getGraphClusterNodeColor() {
    return getGraphPreferenceColor("clusterNode", DEFAULT_GRAPH_CLUSTER_NODE_COLOR);
  }

  function getGraphLinkColor() {
    return getGraphPreferenceColor("link", DEFAULT_GRAPH_LINK_COLOR);
  }

  function getGraphNodeDefaultColor() {
    return getGraphPreferenceColor("nodeDefault", DEFAULT_GRAPH_NODE_COLOR);
  }

  function collectGraphColorSchemes() {
    const schemes = {
      light: normalizeGraphColorScheme("light"),
      dark: normalizeGraphColorScheme("dark")
    };
    settingsGraphColorInputs.forEach((input) => {
      const mode = getGraphThemeMode(input.dataset.graphColorMode);
      const setting = GRAPH_COLOR_SETTINGS.find((candidate) => candidate.key === input.dataset.graphColorKey);
      if (!setting) return;
      schemes[mode][setting.key] = getGraphColorInputValue(input.value || DEFAULT_GRAPH_COLOR_SCHEMES[mode][setting.key]);
    });
    return schemes;
  }

  function getLargeMapHoverPreferences() {
    const state = loadGlobalState();
    return {
      dimOtherNodes: state.graphLargeMapHoverDimOtherNodes === true,
      showConnectedLabels: state.graphLargeMapHoverShowConnectedLabels !== false,
      highlightConnectedLines: state.graphLargeMapHoverHighlightConnectedLines !== false
    };
  }

  function getContextMenuTooltipDelayMs() {
    const value = Number(loadGlobalState().contextMenuTooltipDelayMs);
    if (!Number.isFinite(value)) return DEFAULT_CONTEXT_MENU_TOOLTIP_DELAY_MS;
    return Math.max(0, Math.min(10000, Math.floor(value)));
  }

  function normalizeStartupBehavior(value) {
    const behavior = String(value || "").trim();
    return STARTUP_BEHAVIORS.has(behavior) ? behavior : DEFAULT_STARTUP_BEHAVIOR;
  }

  function normalizeSidebarRailStyle(value) {
    const style = String(value || "").trim();
    return style === "spacious" ? "spacious" : "thin";
  }

  function getSidebarRailStyle(state = loadGlobalState()) {
    return normalizeSidebarRailStyle(state.sidebarRailStyle);
  }

  function applySidebarRailStylePreference(state = loadGlobalState()) {
    const style = getSidebarRailStyle(state);
    document.body.classList.toggle("sidebar-rail-thin", style === "thin");
    document.body.classList.toggle("sidebar-rail-spacious", style === "spacious");
  }

  function normalizeAppHeaderSpacing(value) {
    return String(value || "").trim() === "spacious" ? "spacious" : "thin";
  }

  function getAppHeaderSpacing(state = loadGlobalState()) {
    return normalizeAppHeaderSpacing(state.appHeaderSpacing);
  }

  function applyAppHeaderSpacingPreference(state = loadGlobalState()) {
    const spacing = getAppHeaderSpacing(state);
    document.body.classList.toggle("app-header-thin", spacing === "thin");
    document.body.classList.toggle("app-header-spacious", spacing === "spacious");
  }

  function getStartupBehavior() {
    return normalizeStartupBehavior(loadGlobalState().startupBehavior);
  }

  function shouldRestoreLastFolderOnStartup() {
    return loadGlobalState().restoreLastFolderOnStartup !== false;
  }

  function shouldShowGitProjectFolder() {
    return loadGlobalState().showGitProjectFolder === true;
  }

  function shouldShowMdEditorProjectFolder() {
    return loadGlobalState().showMdEditorProjectFolder === true;
  }

  function normalizeHiddenFolderNames(value) {
    return Array.from(new Set(String(value || "").split(/[\s,]+/).map((name) => name.trim()).filter(Boolean)));
  }

  function getHiddenFolderNamesSetting() {
    return normalizeHiddenFolderNames(loadGlobalState().hiddenFolderNames).join(", ");
  }

  function shouldSkipCustomHiddenFolder(name) {
    return normalizeHiddenFolderNames(loadGlobalState().hiddenFolderNames).includes(String(name || ""));
  }

  function shouldSkipGitProjectFolder(name) {
    return name === ".git" && !shouldShowGitProjectFolder();
  }

  function shouldSkipMdEditorProjectFolder(name) {
    return name === ".md-editor" && !shouldShowMdEditorProjectFolder();
  }

  function getLastOpenFolderPathFromState() {
    const state = loadGlobalState();
    if (!Object.prototype.hasOwnProperty.call(state, "lastOpenFolderPath")) return null;
    return String(state.lastOpenFolderPath || "").trim();
  }

  function normalizeJavaConverterJdkEntry(entry) {
    if (jdkRegistry?.normalize) return jdkRegistry.normalize(entry);
    const source = entry && typeof entry === "object" ? entry : {};
    const path = normalizeLocalPath(source.path || "");
    if (!path) return null;
    const feature = Number(source.feature);
    const detectedName = String(source.detectedName || "").trim();
    const name = String(source.name || detectedName || (Number.isFinite(feature) && feature > 0 ? `JDK ${feature}` : "JDK")).trim();
    return {
      id: String(source.id || `jdk:${path.toLowerCase()}`),
      name,
      path,
      feature: Number.isFinite(feature) && feature > 0 ? Math.floor(feature) : 0,
      detectedName
    };
  }

  function normalizeJavaConverterJdks(value) {
    if (jdkRegistry?.normalizeEntries) return jdkRegistry.normalizeEntries(value);
    const entries = Array.isArray(value) ? value : [];
    const seenPaths = new Set();
    return entries
      .map(normalizeJavaConverterJdkEntry)
      .filter(Boolean)
      .filter((entry) => {
        const key = entry.path.toLowerCase();
        if (seenPaths.has(key)) return false;
        seenPaths.add(key);
        return true;
      });
  }

  function getJavaConverterJdks() {
    return normalizeJavaConverterJdks(loadGlobalState().codeConverterJavaJdks);
  }

  function normalizeGradleMode(value) {
    const mode = String(value || "").trim();
    return GRADLE_MODES.has(mode) ? mode : DEFAULT_GRADLE_MODE;
  }

  function normalizeGradleMetadataFailure(value) {
    const mode = String(value || "").trim();
    return GRADLE_METADATA_FAILURE_MODES.has(mode) ? mode : DEFAULT_GRADLE_METADATA_FAILURE;
  }

  function getGradleInstallationId(path) {
    return normalizeLocalPath(path).toLowerCase();
  }

  function normalizeJavaConverterGradleInstallation(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    const path = normalizeLocalPath(source.path || "");
    if (!path) return null;
    const version = String(source.version || "").trim();
    const detectedName = String(source.detectedName || "").trim();
    const name = String(source.name || detectedName || (version ? `Gradle ${version}` : "Gradle")).trim();
    return {
      id: String(source.id || getGradleInstallationId(path)).trim() || getGradleInstallationId(path),
      name,
      path,
      version,
      detectedName,
      executablePath: normalizeLocalPath(source.executablePath || getGradleExecutableForHome(path))
    };
  }

  function normalizeJavaConverterGradleInstallations(value) {
    const entries = Array.isArray(value) ? value : [];
    const seenPaths = new Set();
    return entries
      .map(normalizeJavaConverterGradleInstallation)
      .filter(Boolean)
      .filter((entry) => {
        const key = entry.path.toLowerCase();
        if (seenPaths.has(key)) return false;
        seenPaths.add(key);
        return true;
      });
  }

  function getJavaConverterGradleInstallations() {
    return normalizeJavaConverterGradleInstallations(loadGlobalState().codeConverterGradleInstallations);
  }

  function getJavaConverterGradleMode() {
    return normalizeGradleMode(loadGlobalState().codeConverterGradleMode);
  }

  function getJavaConverterGradleMetadataFailure() {
    return normalizeGradleMetadataFailure(loadGlobalState().codeConverterGradleMetadataFailure);
  }

  function isJavaConverterGradleOffline() {
    return loadGlobalState().codeConverterGradleOffline === true;
  }

  function getJavaConverterGradleUserHome() {
    return normalizeLocalPath(loadGlobalState().codeConverterGradleUserHome || "");
  }

  function getSelectedGradleInstallationId() {
    const state = loadGlobalState();
    const selectedId = String(state.codeConverterSelectedGradleInstallationId || "").trim();
    if (selectedId) return selectedId;
    const first = getJavaConverterGradleInstallations()[0];
    return first?.id || "";
  }

  function normalizeExternalFileChangeBehavior(value) {
    const behavior = String(value || "").trim();
    return EXTERNAL_FILE_CHANGE_BEHAVIORS.has(behavior) ? behavior : DEFAULT_EXTERNAL_FILE_CHANGE_BEHAVIOR;
  }

  function getExternalFileChangeBehavior() {
    return normalizeExternalFileChangeBehavior(loadGlobalState().externalFileChangeBehavior);
  }

  function isFolderTreeDefaultExpanded() {
    return false;
  }

  function normalizeFolderTreeExpandLimitThreshold(value) {
    const threshold = Number(value);
    if (!Number.isFinite(threshold)) return DEFAULT_FOLDER_TREE_EXPAND_LIMIT_THRESHOLD;
    return Math.max(0, Math.min(1000000, Math.floor(threshold)));
  }

  function getFolderTreeExpandLimitThreshold() {
    return normalizeFolderTreeExpandLimitThreshold(loadGlobalState().folderTreeExpandLimitThreshold);
  }

  function normalizeFolderTreeExpandLimitDepth(value) {
    const depth = Number(value);
    if (!Number.isFinite(depth)) return DEFAULT_FOLDER_TREE_EXPAND_LIMIT_DEPTH;
    return Math.max(1, Math.min(100, Math.floor(depth)));
  }

  function getFolderTreeExpandLimitDepth() {
    return normalizeFolderTreeExpandLimitDepth(loadGlobalState().folderTreeExpandLimitDepth);
  }

  function normalizeEditorFontFamily(value) {
    const key = String(value || "").trim();
    return Object.prototype.hasOwnProperty.call(EDITOR_FONT_FAMILIES, key) ? key : DEFAULT_EDITOR_FONT_FAMILY;
  }

  function getEditorFontFamily() {
    return normalizeEditorFontFamily(loadGlobalState().editorFontFamily);
  }

  function getEditorFontFamilyStack(fontFamily = getEditorFontFamily()) {
    return EDITOR_FONT_FAMILIES[normalizeEditorFontFamily(fontFamily)] || EDITOR_FONT_FAMILIES[DEFAULT_EDITOR_FONT_FAMILY];
  }

  function normalizeEditorFontSize(value) {
    const size = Number(value);
    if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
    return Math.max(10, Math.min(28, Math.floor(size)));
  }

  function getEditorFontSize() {
    return normalizeEditorFontSize(loadGlobalState().editorFontSize);
  }

  function normalizeJdtInteractiveRequestTimeoutMs(value) {
    const timeout = Number(value);
    if (!Number.isFinite(timeout)) return 3000;
    return Math.max(500, Math.min(60000, Math.round(timeout / 500) * 500));
  }

  function getJdtInteractiveRequestTimeoutMs() {
    return normalizeJdtInteractiveRequestTimeoutMs(loadGlobalState().jdtInteractiveRequestTimeoutMs);
  }

  function normalizeIndentLevelUnit(value, fallback) {
    const unit = Number(value);
    if (!Number.isFinite(unit)) return fallback;
    return Math.max(1, Math.min(16, Math.floor(unit)));
  }

  function normalizeSpacesPerIndentLevel(value) {
    return normalizeIndentLevelUnit(value, DEFAULT_SPACES_PER_INDENT_LEVEL);
  }

  function normalizeTabsPerIndentLevel(value) {
    return normalizeIndentLevelUnit(value, DEFAULT_TABS_PER_INDENT_LEVEL);
  }

  function getSpacesPerIndentLevel() {
    return normalizeSpacesPerIndentLevel(loadGlobalState().spacesPerIndentLevel);
  }

  function getTabsPerIndentLevel() {
    return normalizeTabsPerIndentLevel(loadGlobalState().tabsPerIndentLevel);
  }

  function isDocumentWordAutocompleteEnabled() {
    return loadGlobalState().documentWordAutocompleteEnabled === true;
  }

  function isLanguageAutocompleteEnabled() {
    return loadGlobalState().languageAutocompleteEnabled === true;
  }

  function isLanguageServerAutocompleteEnabled() {
    return loadGlobalState().languageServerAutocompleteEnabled !== false;
  }

  function getLanguageServerAutoStartPreferences(state = loadGlobalState()) {
    const savedPreferences = state.languageServerAutoStartPreferences && typeof state.languageServerAutoStartPreferences === "object" && !Array.isArray(state.languageServerAutoStartPreferences)
      ? state.languageServerAutoStartPreferences
      : {};
    return LANGUAGE_SERVER_IDS.reduce((preferences, serverId) => {
      preferences[serverId] = savedPreferences[serverId] !== false;
      return preferences;
    }, {});
  }

  function isLanguageServerAutoStartEnabled(serverId, state = loadGlobalState()) {
    return getLanguageServerAutoStartPreferences(state)[serverId] !== false;
  }

  function isSnippetAutocompleteEnabled() {
    return loadGlobalState().snippetAutocompleteEnabled === true;
  }

  function isUnclosedBracketHighlightEnabled() {
    return loadGlobalState().unclosedBracketHighlightEnabled === true;
  }

  function getAutocompletePreferences(state = loadGlobalState()) {
    return {
      documentWords: state.documentWordAutocompleteEnabled === true,
      language: state.languageAutocompleteEnabled === true,
      languageServer: state.languageServerAutocompleteEnabled !== false,
      snippets: state.snippetAutocompleteEnabled === true
    };
  }


  function getAiCompanionSettings(state = loadGlobalState()) {
    const fallback = aiCompanionSettings?.defaults || {};
    return aiCompanionSettings?.normalize ? aiCompanionSettings.normalize(state.aiCompanionSettings || fallback) : fallback;
  }  function getEditorSnippetPreferences(state = loadGlobalState()) {
    return snippetRegistry?.normalizeSnippetPreferences
      ? snippetRegistry.normalizeSnippetPreferences(state.editorSnippetPreferences)
      : { version: 1, overrides: {}, custom: {} };
  }

  function getEditorSnippetDefinitions(languageId, state = loadGlobalState()) {
    return snippetRegistry?.getCompletionSnippets
      ? snippetRegistry.getCompletionSnippets(languageId, getEditorSnippetPreferences(state))
      : [];
  }

  function updateSpaceToTabLabels() {
    const spaces = getSpacesPerIndentLevel();
    spaceToTabLabelElements.forEach((element) => {
      element.textContent = `${spaces} Space to TAB`;
    });
  }

  function updateDocumentWordAutocompleteToggleButtons() {
    const enabled = isDocumentWordAutocompleteEnabled();
    documentWordAutocompleteToggleButtons.forEach((button) => {
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      button.classList.toggle("active", enabled);
    });
  }

  function applyDocumentWordAutocompletePreference(enabled = isDocumentWordAutocompleteEnabled()) {
    if (typeof editorViewManager?.setDocumentWordAutocompleteForEditorViews === "function") {
      editorViewManager.setDocumentWordAutocompleteForEditorViews(enabled === true);
      return;
    }
    activeEditorCommands?.setDocumentWordAutocomplete?.(enabled === true);
  }

  function applyUnclosedBracketHighlightPreference(enabled = isUnclosedBracketHighlightEnabled()) {
    if (typeof editorViewManager?.setUnclosedBracketHighlightEnabledForEditorViews === "function") {
      editorViewManager.setUnclosedBracketHighlightEnabledForEditorViews(enabled === true);
      return;
    }
    activeEditorCommands?.setUnclosedBracketHighlightEnabled?.(enabled === true);
  }

  function applyAutocompletePreferences(preferences = getAutocompletePreferences()) {
    if (typeof editorViewManager?.setAutocompletePreferencesForEditorViews === "function") {
      editorViewManager.setAutocompletePreferencesForEditorViews(preferences);
      return;
    }
    activeEditorCommands?.setAutocompletePreferences?.(preferences);
  }

  function applyEditorSnippetPreferences() {
    if (typeof editorViewManager?.refreshSnippetDefinitionsForEditorViews === "function") {
      editorViewManager.refreshSnippetDefinitionsForEditorViews();
    }
  }

  function applyEditorFontPreferences(state = loadGlobalState()) {
    const fontFamily = normalizeEditorFontFamily(state.editorFontFamily);
    const fontSize = normalizeEditorFontSize(state.editorFontSize);
    document.documentElement.style.setProperty("--editor-font-family", getEditorFontFamilyStack(fontFamily));
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
    renderEditorSyntaxHighlights?.();
    updateEditorLineNumbers?.();
  }

  function getAppThemeRegistry() {
    return window.markdownViewerThemeRegistry || null;
  }

  function createNormalizedThemeDraft(state = loadGlobalState()) {
    const registry = getAppThemeRegistry();
    if (!registry) {
      return {
        themeSelections: { light: "default-light", dark: "default-dark" },
        customThemes: { light: [], dark: [] }
      };
    }
    const customThemes = registry.normalizeCustomThemes(state.customThemes);
    const themeSelections = registry.normalizeThemeSelections(state.themeSelections, customThemes);
    return { themeSelections, customThemes };
  }

  function getThemeDraftState() {
    const draft = appThemeDraft || createNormalizedThemeDraft();
    return {
      theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      themeSelections: draft.themeSelections,
      customThemes: draft.customThemes
    };
  }

  function applyAppThemeDraftPreview() {
    const registry = getAppThemeRegistry();
    if (!registry) return;
    registry.applyThemeFromState(document.documentElement, getThemeDraftState());
    renderEditorSyntaxHighlights?.();
    renderMarkdown?.();
  }

  function restoreSavedAppTheme() {
    themePreferences.applySelectedAppTheme(loadGlobalState());
  }

  function isCustomThemeId(mode, themeId) {
    const registry = getAppThemeRegistry();
    const normalizedMode = registry?.getMode ? registry.getMode(mode) : mode;
    return !!appThemeDraft?.customThemes?.[normalizedMode]?.some((theme) => theme.id === themeId);
  }

  function getSelectedDraftTheme(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return null;
    const normalizedMode = registry.getMode(mode);
    return registry.getThemeById(normalizedMode, appThemeDraft.themeSelections[normalizedMode], appThemeDraft.customThemes);
  }

  function updateThemeDraftTheme(mode, updater) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return false;
    const normalizedMode = registry.getMode(mode);
    const selectedId = appThemeDraft.themeSelections[normalizedMode];
    const themes = appThemeDraft.customThemes[normalizedMode] || [];
    const index = themes.findIndex((theme) => theme.id === selectedId);
    if (index === -1) return false;
    const nextTheme = Object.assign({}, themes[index], updater(themes[index]), {
      updatedAt: new Date().toISOString()
    });
    appThemeDraft = {
      themeSelections: Object.assign({}, appThemeDraft.themeSelections),
      customThemes: Object.assign({}, appThemeDraft.customThemes, {
        [normalizedMode]: themes.map((theme, themeIndex) => themeIndex === index ? nextTheme : theme)
      })
    };
    return true;
  }

  function renderThemeSelect(mode) {
    const registry = getAppThemeRegistry();
    const normalizedMode = registry?.getMode ? registry.getMode(mode) : mode;
    const select = Array.from(settingsThemeSelects).find((input) => input.dataset.themeMode === normalizedMode);
    if (!registry || !appThemeDraft || !select) return;
    select.innerHTML = "";

    const builtinGroup = document.createElement("optgroup");
    builtinGroup.label = "Built-in";
    registry.getBuiltinThemes(normalizedMode).forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.name;
      builtinGroup.appendChild(option);
    });
    select.appendChild(builtinGroup);

    const customThemes = appThemeDraft.customThemes[normalizedMode] || [];
    if (customThemes.length) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "Custom";
      customThemes.forEach((theme) => {
        const option = document.createElement("option");
        option.value = theme.id;
        option.textContent = theme.name;
        customGroup.appendChild(option);
      });
      select.appendChild(customGroup);
    }
    select.value = appThemeDraft.themeSelections[normalizedMode] || registry.getDefaultThemeId(normalizedMode);
  }

  function renderThemePreview(mode) {
    const registry = getAppThemeRegistry();
    const normalizedMode = registry?.getMode ? registry.getMode(mode) : mode;
    const preview = document.getElementById(`settings-theme-${normalizedMode}-preview`);
    const theme = getSelectedDraftTheme(normalizedMode);
    if (!preview || !theme) return;
    preview.innerHTML = "";
    [
      ["bg-color", "Background"],
      ["editor-bg", "Editor"],
      ["preview-bg", "Preview"],
      ["header-bg", "Header"],
      ["button-bg", "Button"],
      ["text-color", "Text"],
      ["border-color", "Border"],
      ["accent-color", "Accent"],
      ["error-color", "Error"],
      ["disabled-text-color", "Muted"]
    ].forEach(([key, label]) => {
      const swatch = document.createElement("span");
      swatch.className = "settings-theme-swatch";
      swatch.title = label;
      swatch.style.background = theme.colors[key];
      swatch.style.borderColor = theme.colors["border-color"];
      preview.appendChild(swatch);
    });
  }

  function renderThemeTokenEditor(mode) {
    const registry = getAppThemeRegistry();
    const normalizedMode = registry?.getMode ? registry.getMode(mode) : mode;
    const editor = Array.from(settingsThemeTokenEditors).find((element) => element.dataset.themeMode === normalizedMode);
    const theme = getSelectedDraftTheme(normalizedMode);
    if (!registry || !editor || !theme) return;
    const canEdit = isCustomThemeId(normalizedMode, theme.id);
    editor.innerHTML = "";
    editor.classList.toggle("is-readonly", !canEdit);

    const status = document.createElement("p");
    status.className = "settings-theme-editor-note";
    status.textContent = canEdit ? `Editing ${theme.name}.` : "Create or duplicate a custom theme to edit colors.";
    editor.appendChild(status);

    const groups = registry.APP_THEME_TOKENS.reduce((result, token) => {
      const group = token.group || "Colors";
      if (!result[group]) result[group] = [];
      result[group].push(token);
      return result;
    }, {});

    Object.entries(groups).forEach(([groupName, tokens]) => {
      const group = document.createElement("section");
      group.className = "settings-theme-token-group";
      const title = document.createElement("h5");
      title.className = "settings-theme-token-group-title";
      title.textContent = groupName;
      group.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "settings-theme-token-grid";
      tokens.forEach((token) => {
        const row = document.createElement("label");
        row.className = token.alpha ? "settings-theme-token-row settings-theme-token-row-alpha" : "settings-theme-token-row";
        const label = document.createElement("span");
        label.className = "settings-field-label";
        label.textContent = token.label;
        row.appendChild(label);
        const parts = registry.rgbaToParts(theme.colors[token.key], "#000000", 1);
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.className = "settings-color-input settings-theme-color-input";
        colorInput.dataset.themeMode = normalizedMode;
        colorInput.dataset.themeToken = token.key;
        colorInput.value = parts.color;
        colorInput.disabled = !canEdit;
        row.appendChild(colorInput);
        if (token.alpha) {
          const alphaInput = document.createElement("input");
          alphaInput.type = "range";
          alphaInput.className = "settings-theme-alpha-input";
          alphaInput.min = "0";
          alphaInput.max = "1";
          alphaInput.step = "0.01";
          alphaInput.value = String(parts.alpha);
          alphaInput.dataset.themeMode = normalizedMode;
          alphaInput.dataset.themeToken = token.key;
          alphaInput.disabled = !canEdit;
          row.appendChild(alphaInput);
        }
        grid.appendChild(row);
      });
      group.appendChild(grid);
      editor.appendChild(group);
    });
  }

  function renderThemeSettings(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const modes = mode ? [registry.getMode(mode)] : ["light", "dark"];
    modes.forEach((modeName) => {
      renderThemeSelect(modeName);
      renderThemePreview(modeName);
      renderThemeTokenEditor(modeName);
      const canEdit = isCustomThemeId(modeName, appThemeDraft.themeSelections[modeName]);
      settingsThemeRenameButtons.forEach((button) => {
        if (button.dataset.themeMode === modeName) button.disabled = !canEdit;
      });
      settingsThemeDeleteButtons.forEach((button) => {
        if (button.dataset.themeMode === modeName) button.disabled = !canEdit;
      });
    });
  }

  function setThemeDraftSelection(mode, themeId) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const normalizedMode = registry.getMode(mode);
    const theme = registry.getThemeById(normalizedMode, themeId, appThemeDraft.customThemes);
    appThemeDraft = {
      themeSelections: Object.assign({}, appThemeDraft.themeSelections, { [normalizedMode]: theme.id }),
      customThemes: appThemeDraft.customThemes
    };
    renderThemeSettings(normalizedMode);
    applyAppThemeDraftPreview();
  }

  async function createThemeDraftTheme(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const normalizedMode = registry.getMode(mode);
    const baseTheme = getSelectedDraftTheme(normalizedMode);
    const name = await app.services.prompt({
      title: "Create custom theme",
      message: "Custom theme name",
      value: baseTheme ? `${baseTheme.name} Custom` : "Custom Theme"
    });
    if (name === null) return;
    const theme = registry.createCustomTheme(normalizedMode, name, baseTheme?.id, appThemeDraft);
    appThemeDraft = {
      themeSelections: Object.assign({}, appThemeDraft.themeSelections, { [normalizedMode]: theme.id }),
      customThemes: Object.assign({}, appThemeDraft.customThemes, {
        [normalizedMode]: (appThemeDraft.customThemes[normalizedMode] || []).concat(theme)
      })
    };
    renderThemeSettings(normalizedMode);
    applyAppThemeDraftPreview();
  }

  function duplicateThemeDraftTheme(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const normalizedMode = registry.getMode(mode);
    const sourceTheme = getSelectedDraftTheme(normalizedMode);
    if (!sourceTheme) return;
    const theme = registry.createCustomTheme(normalizedMode, `${sourceTheme.name} Copy`, sourceTheme.id, {
      customThemes: appThemeDraft.customThemes
    });
    theme.colors = registry.normalizeThemeColors(normalizedMode, sourceTheme.colors);
    appThemeDraft = {
      themeSelections: Object.assign({}, appThemeDraft.themeSelections, { [normalizedMode]: theme.id }),
      customThemes: Object.assign({}, appThemeDraft.customThemes, {
        [normalizedMode]: (appThemeDraft.customThemes[normalizedMode] || []).concat(theme)
      })
    };
    renderThemeSettings(normalizedMode);
    applyAppThemeDraftPreview();
  }

  async function renameThemeDraftTheme(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const normalizedMode = registry.getMode(mode);
    const theme = getSelectedDraftTheme(normalizedMode);
    if (!theme || !isCustomThemeId(normalizedMode, theme.id)) return;
    const name = await app.services.prompt({ title: "Rename custom theme", message: "Theme name", value: theme.name });
    if (name === null) return;
    const nextName = String(name || "").trim();
    if (!nextName) return;
    updateThemeDraftTheme(normalizedMode, () => ({ name: nextName.slice(0, 80) }));
    renderThemeSettings(normalizedMode);
  }

  async function deleteThemeDraftTheme(mode) {
    const registry = getAppThemeRegistry();
    if (!registry || !appThemeDraft) return;
    const normalizedMode = registry.getMode(mode);
    const theme = getSelectedDraftTheme(normalizedMode);
    if (!theme || !isCustomThemeId(normalizedMode, theme.id)) return;
    if (!await confirmWithAppModal(`Delete custom theme "${theme.name}"?`, { confirmLabel: "Delete", confirmVariant: "danger" })) return;
    const nextThemes = (appThemeDraft.customThemes[normalizedMode] || []).filter((candidate) => candidate.id !== theme.id);
    appThemeDraft = {
      themeSelections: Object.assign({}, appThemeDraft.themeSelections, { [normalizedMode]: registry.getDefaultThemeId(normalizedMode) }),
      customThemes: Object.assign({}, appThemeDraft.customThemes, { [normalizedMode]: nextThemes })
    };
    renderThemeSettings(normalizedMode);
    applyAppThemeDraftPreview();
  }

  function handleThemeTokenInput(input) {
    const registry = getAppThemeRegistry();
    if (!registry || !input || !appThemeDraft) return;
    const mode = registry.getMode(input.dataset.themeMode);
    const tokenKey = input.dataset.themeToken;
    const token = registry.APP_THEME_TOKENS.find((candidate) => candidate.key === tokenKey);
    if (!token || !isCustomThemeId(mode, appThemeDraft.themeSelections[mode])) return;
    const editor = Array.from(settingsThemeTokenEditors).find((element) => element.dataset.themeMode === mode);
    const colorInput = editor?.querySelector(`.settings-theme-color-input[data-theme-token="${tokenKey}"]`);
    const alphaInput = editor?.querySelector(`.settings-theme-alpha-input[data-theme-token="${tokenKey}"]`);
    const color = colorInput?.value || "#000000";
    const value = token.alpha ? registry.toRgba(color, alphaInput?.value || 1) : color;
    updateThemeDraftTheme(mode, (theme) => ({
      colors: registry.normalizeThemeColors(mode, Object.assign({}, theme.colors, { [tokenKey]: value }))
    }));
    renderThemePreview(mode);
    applyAppThemeDraftPreview();
  }

  function shouldConfirmExitApplication() {
    return loadGlobalState().confirmExitApplication === true;
  }
  function shouldConfirmCancelBackgroundProcess() {
    return loadGlobalState().confirmCancelBackgroundProcess !== false;
  }


  function shouldConfirmOpenManyGraphNodes() {
    return loadGlobalState().confirmOpenManyGraphNodes !== false;
  }

  function shouldConfirmDeleteFiles() {
    return loadGlobalState().confirmDeleteFiles !== false;
  }

  function shouldConfirmMoveFiles() {
    return loadGlobalState().confirmMoveFiles !== false;
  }

  function shouldConfirmResetState() {
    return loadGlobalState().confirmResetState !== false;
  }

  function shouldConfirmResetJdtWorkspace() {
    return loadGlobalState().confirmResetJdtWorkspace !== false;
  }

  function shouldConfirmJavaBuildPathRebuild() {
    return loadGlobalState().confirmJavaBuildPathRebuild !== false;
  }

  function shouldConfirmEditedPromptAttachmentRemoval() {
    return loadGlobalState().confirmEditedPromptAttachmentRemoval === true;
  }

  function getMaxOpenTabs() {
    const value = Number(loadGlobalState().maxOpenTabs);
    if (!Number.isFinite(value)) return DEFAULT_MAX_OPEN_TABS;
    return Math.max(MIN_OPEN_TAB_LIMIT, Math.min(MAX_OPEN_TAB_LIMIT, Math.floor(value)));
  }

  function getMaxRecentFiles() {
    const value = Number(loadGlobalState().maxRecentFiles);
    if (!Number.isFinite(value)) return DEFAULT_MAX_RECENT_FILES;
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function getClosedTabHistoryLimit() {
    const value = Number(loadGlobalState().closedTabHistoryLimit);
    if (!Number.isFinite(value)) return DEFAULT_CLOSED_TAB_HISTORY_LIMIT;
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function getMaxRecentFolders() {
    const value = Number(loadGlobalState().maxRecentFolders);
    if (!Number.isFinite(value)) return DEFAULT_MAX_RECENT_FOLDERS;
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function normalizeApiClientRecentHistoryLimit(value) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) return DEFAULT_API_CLIENT_RECENT_HISTORY_LIMIT;
    return Math.max(0, Math.min(500, Math.floor(limit)));
  }

  function getApiClientRecentHistoryLimit() {
    return normalizeApiClientRecentHistoryLimit(loadGlobalState().apiClientRecentHistoryLimit);
  }

  function normalizeApiClientRedirectHeaderPolicy(value) {
    const policy = String(value || "").toLowerCase();
    return API_CLIENT_REDIRECT_HEADER_POLICIES.has(policy) ? policy : "same-origin";
  }

  function normalizeApiClientEnum(value, allowedValues, fallback) {
    const normalized = String(value || "").toLowerCase();
    return allowedValues.has(normalized) ? normalized : fallback;
  }

  function normalizeApiClientTrustedCertificates(value) {
    return (Array.isArray(value) ? value : [])
      .map((certificate) => ({
        host: String(certificate?.host || "").trim().toLowerCase(),
        port: String(certificate?.port || "443").trim() || "443",
        fingerprint256: String(certificate?.fingerprint256 || "").trim(),
        subject: certificate?.subject || null,
        issuer: certificate?.issuer || null,
        validFrom: String(certificate?.validFrom || ""),
        validTo: String(certificate?.validTo || ""),
        serialNumber: String(certificate?.serialNumber || ""),
        pem: String(certificate?.pem || "").trim()
      }))
      .filter((certificate) => certificate.host && certificate.fingerprint256 && certificate.pem);
  }

  function normalizeApiClientRequestSettings(value) {
    const settings = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const timeoutMs = Number(settings.timeoutMs);
    const maxRedirects = Number(settings.maxRedirects);
    const maxResponseSizeBytes = Number(settings.maxResponseSizeBytes);
    return {
      autoFollowRedirects: settings.autoFollowRedirects !== false,
      maxRedirects: Number.isFinite(maxRedirects) ? Math.max(0, Math.min(50, Math.floor(maxRedirects))) : DEFAULT_API_CLIENT_REQUEST_SETTINGS.maxRedirects,
      preserveMethodOnRedirect: settings.preserveMethodOnRedirect === true,
      redirectAuthHeaderPolicy: normalizeApiClientRedirectHeaderPolicy(settings.redirectAuthHeaderPolicy),
      redirectCustomHeaderPolicy: normalizeApiClientRedirectHeaderPolicy(settings.redirectCustomHeaderPolicy),
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(300000, Math.floor(timeoutMs))) : DEFAULT_API_CLIENT_REQUEST_SETTINGS.timeoutMs,
      sslCertificateVerification: settings.sslCertificateVerification !== false,
      trustedCertificates: normalizeApiClientTrustedCertificates(settings.trustedCertificates),
      cookieJarEnabled: settings.cookieJarEnabled !== false,
      sendNoCacheHeader: settings.sendNoCacheHeader === true,
      maxResponseSizeBytes: Number.isFinite(maxResponseSizeBytes) ? Math.max(1024, Math.min(1073741824, Math.floor(maxResponseSizeBytes))) : DEFAULT_API_CLIENT_REQUEST_SETTINGS.maxResponseSizeBytes,
      responseRenderMode: normalizeApiClientEnum(settings.responseRenderMode, API_CLIENT_RESPONSE_RENDER_MODES, DEFAULT_API_CLIENT_REQUEST_SETTINGS.responseRenderMode),
      decompressResponses: settings.decompressResponses !== false,
      proxyMode: normalizeApiClientEnum(settings.proxyMode, API_CLIENT_PROXY_MODES, DEFAULT_API_CLIENT_REQUEST_SETTINGS.proxyMode),
      proxyUrl: String(settings.proxyUrl || "").trim(),
      httpVersion: normalizeApiClientEnum(settings.httpVersion, API_CLIENT_HTTP_VERSIONS, DEFAULT_API_CLIENT_REQUEST_SETTINGS.httpVersion)
    };
  }

  function getApiClientRequestSettings() {
    return normalizeApiClientRequestSettings(loadGlobalState().apiClientRequestSettings);
  }

  function normalizeWorkspaceSearchResultLimit(value) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) return DEFAULT_WORKSPACE_SEARCH_RESULT_LIMIT;
    return Math.max(1, Math.min(100000, Math.floor(limit)));
  }

  function getWorkspaceSearchResultLimit() {
    return normalizeWorkspaceSearchResultLimit(loadGlobalState().workspaceSearchResultLimit);
  }

  function normalizeJdtMaximumProblems(value) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) return DEFAULT_JDT_MAXIMUM_PROBLEMS;
    return Math.max(1, Math.min(100000, Math.floor(limit)));
  }

  function getJdtMaximumProblems() {
    return normalizeJdtMaximumProblems(loadGlobalState().jdtMaximumProblems);
  }

  function normalizeJdtInitialProblemLimit(value, maximumProblems = getJdtMaximumProblems()) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) return Math.min(DEFAULT_JDT_INITIAL_PROBLEM_LIMIT, maximumProblems);
    return Math.max(1, Math.min(maximumProblems, Math.floor(limit)));
  }

  function getJdtInitialProblemLimit() {
    return normalizeJdtInitialProblemLimit(loadGlobalState().jdtInitialProblemLimit);
  }

  function isAjdtDiagnosticsEnabled() {
    return loadGlobalState().ajdtDiagnosticsEnabled === true;
  }

  function normalizeSupportedTextExtensionsSetting(value) {
    return languageRegistry?.normalizeSupportedTextExtensions?.(value) || [];
  }

  function formatSupportedTextExtensionsSetting(value) {
    const extensions = normalizeSupportedTextExtensionsSetting(value);
    return (extensions.length ? extensions : languageRegistry?.getDefaultSupportedTextExtensions?.() || []).join(", ");
  }

  function getSupportedTextExtensionsSetting() {
    return formatSupportedTextExtensionsSetting(loadGlobalState().supportedTextExtensions || DEFAULT_SUPPORTED_TEXT_EXTENSIONS_TEXT);
  }

  function applySupportedTextExtensionsPreference(state = loadGlobalState()) {
    const extensions = normalizeSupportedTextExtensionsSetting(state.supportedTextExtensions || DEFAULT_SUPPORTED_TEXT_EXTENSIONS_TEXT);
    languageRegistry?.setSupportedTextExtensions?.(extensions.length ? extensions : DEFAULT_SUPPORTED_TEXT_EXTENSIONS_TEXT);
  }

  function normalizeSyntaxColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  function getCurrentSyntaxThemeName() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function getDefaultSyntaxTokenColor(tokenKey) {
    return DEFAULT_SYNTAX_TOKEN_COLORS[getCurrentSyntaxThemeName()][tokenKey] || "#888888";
  }

  function getSyntaxTokenDefaultForMode(mode, tokenKey) {
    const palette = DEFAULT_SYNTAX_TOKEN_COLORS[mode === "dark" ? "dark" : "light"];
    return palette[tokenKey] || "#888888";
  }

  // Drops saved language overrides that exactly capture a full default palette.
  // Those entries are artifacts of saving the syntax grid after a light/dark
  // mode switch (the grid held the other mode's defaults), never user intent.
  function sanitizeSavedSyntaxHighlightColors() {
    const saved = loadGlobalState().syntaxHighlightColors;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    // Includes the pre-GitHub-Light legacy light palette so captures made
    // before the light defaults changed are also cleaned up.
    const LEGACY_LIGHT_SYNTAX_DEFAULTS = {
      muted: "#5f6673", heading: "#0b6e99", strong: "#1f2937", emphasis: "#8f3f71",
      code: "#b42318", link: "#1d4ed8", url: "#047857", quote: "#3f7d20",
      list: "#b45309", table: "#876a00", keyword: "#6d28d9", atom: "#0e7490",
      string: "#9a3412", number: "#a16207", type: "#047481", function: "#0f5e9c",
      variable: "#334155", property: "#7e22ce", operator: "#64748b", bracket: "#64748b",
      comment: "#587a2e", tag: "#0f766e", attribute: "#a15c07", invalid: "#b91c1c"
    };
    const palettes = [DEFAULT_SYNTAX_TOKEN_COLORS.light, DEFAULT_SYNTAX_TOKEN_COLORS.dark, LEGACY_LIGHT_SYNTAX_DEFAULTS];
    const next = {};
    let changed = false;
    Object.entries(saved).forEach(([languageId, colors]) => {
      if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
        changed = true;
        return;
      }
      const keys = Object.keys(colors);
      const matchesFullDefaultPalette = keys.length >= SYNTAX_HIGHLIGHT_TOKENS.length && palettes.some((palette) =>
        SYNTAX_HIGHLIGHT_TOKENS.every((token) => normalizeSyntaxColor(colors[token.key], "") === palette[token.key])
      );
      if (matchesFullDefaultPalette) {
        changed = true;
        return;
      }
      next[languageId] = colors;
    });
    if (changed) saveGlobalState({ syntaxHighlightColors: next });
  }

  let syntaxHighlightColorsSanitized = false;

  function getSyntaxHighlightColors() {
    if (!syntaxHighlightColorsSanitized) {
      syntaxHighlightColorsSanitized = true;
      sanitizeSavedSyntaxHighlightColors();
    }
    const saved = loadGlobalState().syntaxHighlightColors;
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }

  function getLanguageSyntaxColors(languageId) {
    const source = syntaxHighlightColorDraft || getSyntaxHighlightColors();
    const colors = source[languageId];
    return colors && typeof colors === "object" && !Array.isArray(colors) ? colors : {};
  }

  function cloneSyntaxHighlightColors(colors = getSyntaxHighlightColors()) {
    return Object.fromEntries(Object.entries(colors).map(([languageId, languageColors]) => [
      languageId,
      { ...(languageColors && typeof languageColors === "object" && !Array.isArray(languageColors) ? languageColors : {}) }
    ]));
  }

  function getSyntaxLanguageIdForPath(path, content) {
    return languageRegistry?.resolveLanguageForPath(path || "document.md", { content: content || "" })?.id || "markdown";
  }

  function getActiveSyntaxLanguageId() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab || activeTab.type === "graph") return "markdown";
    const path = activeTab.sourceFilePath || activeTab.sourceFileName || activeTab.title || "document.md";
    return getSyntaxLanguageIdForPath(path, activeTab.content || markdownEditor?.value || "");
  }

  function applySyntaxTokenOverridesForLanguage(languageId, targetElement) {
    if (!targetElement) return;
    const colors = getLanguageSyntaxColors(languageId);
    SYNTAX_HIGHLIGHT_TOKENS.forEach((token) => {
      targetElement.style.removeProperty(token.cssVar);
      token.previewVars.forEach((previewVar) => targetElement.style.removeProperty(previewVar));
      const override = normalizeSyntaxColor(colors[token.key], "");
      if (!override) return;
      targetElement.style.setProperty(token.cssVar, override);
      token.previewVars.forEach((previewVar) => targetElement.style.setProperty(previewVar, override));
    });
  }

  function applySyntaxHighlightColorsForActiveLanguage() {
    applySyntaxTokenOverridesForLanguage(getActiveSyntaxLanguageId(), document.documentElement);
  }

  function getSyntaxHighlightStyleForLanguage(language) {
    const rawLanguage = String(language || "").trim().toLowerCase();
    const languageInfo = languageRegistry?.languages?.find((candidate) => (
      candidate.id === rawLanguage ||
      candidate.codeMirrorLanguage === rawLanguage ||
      candidate.extensions?.includes(rawLanguage)
    ));
    const languageId = languageInfo?.id || rawLanguage || "text";
    const colors = getLanguageSyntaxColors(languageId);
    const styleParts = [];
    SYNTAX_HIGHLIGHT_TOKENS.forEach((token) => {
      const override = normalizeSyntaxColor(colors[token.key], "");
      if (!override) return;
      styleParts.push(`${token.cssVar}: ${override}`);
      token.previewVars.forEach((previewVar) => styleParts.push(`${previewVar}: ${override}`));
    });
    return styleParts.length ? styleParts.join("; ") : "";
  }

  function populateSyntaxLanguageOptions() {
    if (!settingsSyntaxLanguageSelect) return;
    settingsSyntaxLanguageSelect.innerHTML = "";
    (languageRegistry?.languages || []).forEach((language) => {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      settingsSyntaxLanguageSelect.appendChild(option);
    });
    settingsSyntaxLanguageSelect.value = getActiveSyntaxLanguageId();
  }

  function getSettingsControlFallbackTooltip(control) {
    if (!control) return "";
    const id = control.id || "";
    if (id && SETTINGS_CONTROL_TOOLTIPS[id]) return SETTINGS_CONTROL_TOOLTIPS[id];
    if (control.classList?.contains("settings-tab-button")) {
      return `Open ${(control.textContent || "this").trim()} settings.`;
    }
    if (control.classList?.contains("settings-syntax-color-input")) {
      const tokenLabel = control.closest(".settings-syntax-color-row")?.querySelector(".settings-switch-title")?.textContent?.trim();
      return tokenLabel ? `Choose the syntax highlight color for ${tokenLabel}.` : "Choose a syntax highlight color.";
    }
    const label = control.closest("label");
    const labelText = label?.querySelector(".settings-field-label, .settings-switch-title")?.textContent?.trim();
    const description = label?.querySelector(".settings-switch-description")?.textContent?.trim();
    if (labelText && description) return `${labelText}: ${description}`;
    if (labelText) return labelText;
    const ariaLabel = control.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;
    const text = (control.textContent || "").trim().replace(/\s+/g, " ");
    return text || "";
  }

  function applySettingsControlTooltips(root = settingsModal) {
    if (!root) return;
    root.querySelectorAll("button, input, select, textarea").forEach((control) => {
      const tooltip = getSettingsControlFallbackTooltip(control);
      if (!tooltip) return;
      control.title = tooltip;
      if (!control.getAttribute("aria-label") && !control.closest("label")) {
        control.setAttribute("aria-label", tooltip);
      }
    });
  }

  function renderSyntaxTokenColorRows(container, languageId, options = {}) {
    if (!container) return;
    const colors = getLanguageSyntaxColors(languageId);
    const idPrefix = options.idPrefix || "settings-syntax-color";
    const inputClassName = options.inputClassName || "settings-syntax-color-input";
    container.innerHTML = "";
    // Remember which mode's defaults the inputs were rendered with, so saving
    // after a light/dark toggle compares against the right palette.
    container.dataset.syntaxDefaultsMode = getCurrentSyntaxThemeName();
    SYNTAX_HIGHLIGHT_TOKENS.forEach((token) => {
      const row = document.createElement("label");
      row.className = "settings-syntax-color-row";
      row.setAttribute("for", `${idPrefix}-${token.key}`);

      const text = document.createElement("span");
      text.className = "settings-syntax-color-text";
      const title = document.createElement("span");
      title.className = "settings-switch-title";
      title.textContent = token.label;
      const description = document.createElement("span");
      description.className = "settings-switch-description";
      description.textContent = token.key;
      text.append(title, description);

      const input = document.createElement("input");
      input.type = "color";
      input.id = `${idPrefix}-${token.key}`;
      input.className = `settings-color-input ${inputClassName}`;
      input.dataset.syntaxToken = token.key;
      input.value = normalizeSyntaxColor(colors[token.key], getDefaultSyntaxTokenColor(token.key));
      input.setAttribute("aria-label", `${token.label} color`);
      input.title = `Choose the syntax highlight color for ${token.label}.`;

      row.append(text, input);
      container.appendChild(row);
    });
  }

  function renderSyntaxColorSettings() {
    if (!settingsSyntaxColorGrid || !settingsSyntaxLanguageSelect) return;
    renderSyntaxTokenColorRows(settingsSyntaxColorGrid, settingsSyntaxLanguageSelect.value || getActiveSyntaxLanguageId());
  }

  function updateSyntaxColorDraftFromInput(languageId, tokenKey, value, defaultsMode) {
    if (!languageId || !tokenKey) return;
    const defaultColor = getSyntaxTokenDefaultForMode(defaultsMode || getCurrentSyntaxThemeName(), tokenKey);
    const next = { ...(syntaxHighlightColorDraft || cloneSyntaxHighlightColors()) };
    const languageColors = { ...(next[languageId] || {}) };
    const color = normalizeSyntaxColor(value, defaultColor);
    if (color === defaultColor) delete languageColors[tokenKey];
    else languageColors[tokenKey] = color;
    if (Object.keys(languageColors).length) next[languageId] = languageColors;
    else delete next[languageId];
    syntaxHighlightColorDraft = next;
  }

  function getSyntaxEditorSample(languageId) {
    const samples = {
      markdown: "# Syntax preview\n\n> Quotes, **bold text**, and _emphasis_ update live.\n\n- Lists show marker color\n- `inline code` and [links](https://example.com)\n\n| Token | Value |\n| --- | --- |\n| string | `sample` |\n\n```javascript\nconst enabled = true;\nfunction render(value) {\n  return `Color ${value}`;\n}\n```",
      javascript: "import { palette } from \"./theme.js\";\n\nconst enabled = true;\nconst count = 42;\n\nfunction renderToken(name, color) {\n  if (!enabled) return null;\n  return `${name}: ${color}`;\n}\n\n// Preview comments, strings, numbers, and functions.\nrenderToken(\"keyword\", palette.keyword);",
      typescript: "type TokenColor = {\n  name: string;\n  color: string;\n  enabled?: boolean;\n};\n\nexport function formatToken(token: TokenColor): string {\n  const fallback = token.enabled ?? true;\n  return `${token.name}: ${fallback ? token.color : \"disabled\"}`;\n}",
      java: "package preview;\n\npublic final class TokenPreview {\n  private static final int COUNT = 42;\n\n  public String render(String name, boolean enabled) {\n    // Comments use the comment token color.\n    return enabled ? \"Token: \" + name + COUNT : null;\n  }\n}",
      csharp: "namespace Preview;\n\npublic sealed class TokenPreview\n{\n    private const int Count = 42;\n\n    public string Render(string name, bool enabled)\n    {\n        // Comments use the comment token color.\n        return enabled ? $\"Token: {name} {Count}\" : string.Empty;\n    }\n}",
      python: "from dataclasses import dataclass\n\n@dataclass\nclass TokenPreview:\n    name: str\n    color: str\n\n    def render(self, enabled=True):\n        # Comments use the comment token color.\n        return f\"{self.name}: {self.color}\" if enabled else None\n",
      html: "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <title>Syntax Preview</title>\n  </head>\n  <body data-theme=\"light\">\n    <!-- Comments use the comment token color. -->\n    <button class=\"primary\" disabled>Save</button>\n  </body>\n</html>",
      css: ":root {\n  --accent-color: #2563eb;\n}\n\n.preview-button {\n  display: inline-flex;\n  color: var(--accent-color);\n  border: 1px solid currentColor;\n}\n\n/* Comments use the comment token color. */",
      json: "{\n  \"name\": \"Syntax Preview\",\n  \"enabled\": true,\n  \"count\": 42,\n  \"tokens\": [\"keyword\", \"string\", \"number\"]\n}",
      yaml: "name: Syntax Preview\nenabled: true\ncount: 42\ntokens:\n  - keyword\n  - string\n  - number\n",
      xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<preview enabled=\"true\" count=\"42\">\n  <!-- Comments use the comment token color. -->\n  <token name=\"keyword\">#6d28d9</token>\n</preview>",
      sql: "SELECT token_name, token_color, enabled\nFROM syntax_tokens\nWHERE enabled = TRUE\n  AND token_count > 4\nORDER BY token_name ASC;",
      bash: "#!/usr/bin/env bash\nset -euo pipefail\n\nname=\"keyword\"\ncount=42\n\nif [[ \"$count\" -gt 0 ]]; then\n  echo \"Token: $name\"\nfi",
      powershell: "$Name = \"keyword\"\n$Count = 42\n\nif ($Count -gt 0) {\n    Write-Output \"Token: $Name\"\n}\n# Comments use the comment token color.",
      text: "Syntax Preview\n\nPlain text has no language-specific tokens, but the editor surface still shows the selected theme and base text color."
    };
    return samples[languageId] || samples.text;
  }

  function getSyntaxEditorLanguageInfo(languageId) {
    return (languageRegistry?.languages || []).find((language) => language.id === languageId) || null;
  }

  function applySyntaxEditorPreviewColors() {
    if (!syntaxEditorPreviewHost || !syntaxEditorLanguageSelect) return;
    applySyntaxTokenOverridesForLanguage(syntaxEditorLanguageSelect.value || getActiveSyntaxLanguageId(), syntaxEditorPreviewHost);
  }

  function destroySyntaxEditorPreview() {
    if (syntaxEditorPreview?.destroy) syntaxEditorPreview.destroy();
    syntaxEditorPreview = null;
    if (syntaxEditorPreviewHost) {
      syntaxEditorPreviewHost.classList.remove("codemirror-editor");
      syntaxEditorPreviewHost.innerHTML = "";
    }
  }

  function updateSyntaxEditorPreview() {
    if (!syntaxEditorPreviewHost || !syntaxEditorLanguageSelect) return;
    const languageId = syntaxEditorLanguageSelect.value || getActiveSyntaxLanguageId();
    const languageInfo = getSyntaxEditorLanguageInfo(languageId);
    const codeMirrorLanguage = languageInfo?.codeMirrorLanguage || languageId || "text";
    const sample = getSyntaxEditorSample(languageId);
    applySyntaxEditorPreviewColors();
    if (window.MarkdownViewerCodeMirror?.createEditor) {
      if (!syntaxEditorPreview) {
        syntaxEditorPreviewHost.innerHTML = "";
        syntaxEditorPreviewHost.classList.add("codemirror-editor");
        syntaxEditorPreview = window.MarkdownViewerCodeMirror.createEditor({
          parent: syntaxEditorPreviewHost,
          doc: sample,
          language: codeMirrorLanguage,
          editable: false
        });
      } else {
        syntaxEditorPreview.setLanguage?.(codeMirrorLanguage);
        syntaxEditorPreview.setValue?.(sample);
        syntaxEditorPreview.setEditable?.(false);
      }
      return;
    }
    syntaxEditorPreviewHost.classList.remove("codemirror-editor");
    syntaxEditorPreviewHost.innerHTML = "";
    const fallback = document.createElement("pre");
    fallback.className = "settings-syntax-editor-fallback";
    fallback.textContent = sample;
    syntaxEditorPreviewHost.appendChild(fallback);
  }

  function populateSyntaxLanguageSelect(select, selectedLanguageId) {
    if (!select) return;
    select.innerHTML = "";
    (languageRegistry?.languages || []).forEach((language) => {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      select.appendChild(option);
    });
    select.value = selectedLanguageId || getActiveSyntaxLanguageId();
  }

  function renderSyntaxEditorTokenSettings() {
    if (!syntaxEditorTokenList || !syntaxEditorLanguageSelect) return;
    renderSyntaxTokenColorRows(syntaxEditorTokenList, syntaxEditorLanguageSelect.value || getActiveSyntaxLanguageId(), {
      idPrefix: "settings-syntax-editor-color",
      inputClassName: "settings-syntax-editor-color-input"
    });
    applySettingsControlTooltips(syntaxEditorTokenList);
  }

  function closeSyntaxEditorLayer(options = {}) {
    if (!syntaxEditorLayer) return;
    const savedLanguageId = syntaxEditorLanguageSelect?.value || getActiveSyntaxLanguageId();
    if (options.save !== true && syntaxEditorDraftSnapshot) {
      syntaxHighlightColorDraft = cloneSyntaxHighlightColors(syntaxEditorDraftSnapshot);
    }
    syntaxEditorDraftSnapshot = null;
    destroySyntaxEditorPreview();
    syntaxEditorLayer.remove();
    syntaxEditorLayer = null;
    syntaxEditorLanguageSelect = null;
    syntaxEditorTokenList = null;
    syntaxEditorPreviewHost = null;
    if (options.save === true) {
      if (settingsSyntaxLanguageSelect) {
        settingsSyntaxLanguageSelect.value = savedLanguageId;
      }
      renderSyntaxColorSettings();
    }
    settingsSyntaxOpenEditorButton?.focus?.();
  }

  function saveSyntaxEditorLayer() {
    closeSyntaxEditorLayer({ save: true });
  }

  function ensureSyntaxEditorLayer() {
    if (syntaxEditorLayer || !settingsModal) return syntaxEditorLayer;
    syntaxEditorLayer = document.createElement("div");
    syntaxEditorLayer.id = "settings-syntax-editor-layer";
    syntaxEditorLayer.className = "settings-syntax-editor-layer";
    syntaxEditorLayer.hidden = true;
    syntaxEditorLayer.innerHTML = `
      <div class="settings-syntax-editor-header">
        <h3 class="settings-syntax-editor-title"><i class="bi bi-window-sidebar" aria-hidden="true"></i><span>Interactive Syntax Editor</span></h3>
        <div class="settings-syntax-editor-actions">
          <button class="reset-modal-btn settings-secondary-action" id="settings-syntax-editor-close" type="button">Close</button>
          <button class="reset-modal-btn settings-primary-action" id="settings-syntax-editor-save" type="button">Save</button>
        </div>
      </div>
      <div class="settings-syntax-editor-body">
        <div class="settings-syntax-editor-sidebar" aria-label="Interactive syntax color controls">
          <label class="settings-field" for="settings-syntax-editor-language">
            <span class="settings-field-label">Language</span>
            <select id="settings-syntax-editor-language" class="rename-modal-input settings-select-input"></select>
          </label>
          <div id="settings-syntax-editor-token-list" class="settings-syntax-editor-token-list" aria-label="Interactive syntax token color settings"></div>
        </div>
        <div class="settings-syntax-editor-preview" aria-label="Syntax color preview">
          <div class="settings-syntax-editor-preview-shell">
            <div id="settings-syntax-editor-preview" class="settings-syntax-editor-preview-host"></div>
          </div>
        </div>
      </div>
    `;
    settingsModal.querySelector(".settings-modal-box")?.appendChild(syntaxEditorLayer);
    syntaxEditorLanguageSelect = syntaxEditorLayer.querySelector("#settings-syntax-editor-language");
    syntaxEditorTokenList = syntaxEditorLayer.querySelector("#settings-syntax-editor-token-list");
    syntaxEditorPreviewHost = syntaxEditorLayer.querySelector("#settings-syntax-editor-preview");
    syntaxEditorLayer.querySelector("#settings-syntax-editor-close")?.addEventListener("click", () => closeSyntaxEditorLayer());
    syntaxEditorLayer.querySelector("#settings-syntax-editor-save")?.addEventListener("click", saveSyntaxEditorLayer);
    syntaxEditorLanguageSelect?.addEventListener("change", function() {
      renderSyntaxEditorTokenSettings();
      updateSyntaxEditorPreview();
    });
    syntaxEditorTokenList?.addEventListener("input", function(event) {
      const input = event.target.closest?.(".settings-syntax-editor-color-input");
      if (!input || !syntaxEditorLanguageSelect) return;
      updateSyntaxColorDraftFromInput(
        syntaxEditorLanguageSelect.value || getActiveSyntaxLanguageId(),
        input.dataset.syntaxToken,
        input.value,
        input.closest("[data-syntax-defaults-mode]")?.dataset.syntaxDefaultsMode
      );
      applySyntaxEditorPreviewColors();
    });
    syntaxEditorLayer.addEventListener("keydown", function(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSyntaxEditorLayer();
    });
    applySettingsControlTooltips(syntaxEditorLayer);
    return syntaxEditorLayer;
  }

  function openSyntaxEditorLayer() {
    const layer = ensureSyntaxEditorLayer();
    if (!layer) return;
    syntaxEditorDraftSnapshot = cloneSyntaxHighlightColors(syntaxHighlightColorDraft || cloneSyntaxHighlightColors());
    populateSyntaxLanguageSelect(syntaxEditorLanguageSelect, settingsSyntaxLanguageSelect?.value || getActiveSyntaxLanguageId());
    renderSyntaxEditorTokenSettings();
    updateSyntaxEditorPreview();
    layer.hidden = false;
    syntaxEditorLanguageSelect?.focus?.();
  }

  function collectSyntaxColorSettings() {
    const current = syntaxHighlightColorDraft || cloneSyntaxHighlightColors();
    const next = { ...current };
    if (!settingsSyntaxLanguageSelect) return next;
    const languageId = settingsSyntaxLanguageSelect.value || getActiveSyntaxLanguageId();
    const defaultsMode = settingsSyntaxColorGrid?.dataset.syntaxDefaultsMode || getCurrentSyntaxThemeName();
    const languageColors = {};
    settingsSyntaxColorGrid?.querySelectorAll(".settings-syntax-color-input").forEach((input) => {
      const tokenKey = input.dataset.syntaxToken;
      if (!tokenKey) return;
      const defaultColor = getSyntaxTokenDefaultForMode(defaultsMode, tokenKey);
      const color = normalizeSyntaxColor(input.value, defaultColor);
      if (color !== defaultColor) {
        languageColors[tokenKey] = color;
      }
    });
    if (Object.keys(languageColors).length) next[languageId] = languageColors;
    else delete next[languageId];
    syntaxHighlightColorDraft = next;
    return next;
  }

  function resetSelectedSyntaxLanguageColors() {
    if (!settingsSyntaxLanguageSelect) return;
    const languageId = settingsSyntaxLanguageSelect.value || getActiveSyntaxLanguageId();
    const next = { ...(syntaxHighlightColorDraft || cloneSyntaxHighlightColors()) };
    delete next[languageId];
    syntaxHighlightColorDraft = next;
    renderSyntaxColorSettings();
    applySyntaxHighlightColorsForActiveLanguage();
    renderEditorSyntaxHighlights();
    renderMarkdown();
  }

  function initializeContextMenuTooltips() {
    let tooltipTimer = null;
    let tooltipTarget = null;

    const hideTooltip = () => {
      if (tooltipTimer) {
        window.clearTimeout(tooltipTimer);
        tooltipTimer = null;
      }
      if (tooltipTarget) tooltipTarget.classList.remove("tooltip-visible");
      tooltipTarget = null;
    };

    const scheduleTooltip = (target) => {
      if (!target?.dataset?.tooltip) return;
      if (tooltipTarget === target) return;
      hideTooltip();
      tooltipTarget = target;
      tooltipTimer = window.setTimeout(() => {
        if (tooltipTarget !== target) return;
        target.classList.add("tooltip-visible");
        tooltipTimer = null;
      }, getContextMenuTooltipDelayMs());
    };

    document.addEventListener("pointerover", (event) => {
      const target = event.target.closest?.(".graph-context-menu-tooltip");
      if (!target) {
        if (event.target.closest?.(".graph-context-menu-item")) hideTooltip();
        return;
      }
      if (event.relatedTarget && target.contains(event.relatedTarget)) return;
      scheduleTooltip(target);
    });

    document.addEventListener("pointerout", (event) => {
      if (!tooltipTarget) return;
      const target = event.target.closest?.(".graph-context-menu-tooltip");
      if (target !== tooltipTarget) return;
      if (event.relatedTarget && target.contains(event.relatedTarget)) return;
      hideTooltip();
    });

    document.addEventListener("focusin", (event) => {
      const target = event.target.closest?.(".graph-context-menu-tooltip");
      if (target) scheduleTooltip(target);
      else hideTooltip();
    });

    document.addEventListener("focusout", (event) => {
      if (!tooltipTarget) return;
      if (event.relatedTarget?.closest?.(".graph-context-menu-tooltip") === tooltipTarget) return;
      hideTooltip();
    });

    document.addEventListener("pointerdown", (event) => {
      if (!tooltipTarget || tooltipTarget.contains(event.target)) return;
      hideTooltip();
    }, true);
    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("blur", hideTooltip);
  }

  initializeContextMenuTooltips();

  const rendererConfig = window.registerMarkdownViewerRendererConfig(app, {
    marked: typeof marked !== "undefined" ? marked : null,
    hljs: typeof hljs !== "undefined" ? hljs : null,
    mermaid: function() { return typeof mermaid !== "undefined" ? mermaid : null; },
    getSyntaxHighlightStyleForLanguage
  });
  rendererConfig.initialize();
  const initMermaid = rendererConfig.initMermaid;

  const tabStylePreferences = window.registerMarkdownViewerTabStylePreferences(app, { loadGlobalState });
  const { applyTabStylePreference, getTabStyle, normalizeTabStyle } = tabStylePreferences;

  const layoutPreferences = window.registerMarkdownViewerLayoutPreferences(app, {
    GLOBAL_STATE_KEY,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_PANE_PERCENT,
    DEFAULT_AI_COMPANION_PANEL_WIDTH,
    MIN_AI_COMPANION_PANEL_WIDTH,
    AI_COMPANION_PANEL_MAX_WIDTH_PERCENT,
    contentContainer,
    get currentFolderSortMode() { return currentFolderSortMode; },
    set currentFolderSortMode(value) { currentFolderSortMode = value; },
    get editorWidthPercent() { return editorWidthPercent; },
    set editorWidthPercent(value) { editorWidthPercent = value; },
    get aiCompanionPanelWidth() { return aiCompanionPanelWidth; },
    set aiCompanionPanelWidth(value) { aiCompanionPanelWidth = value; },
    get graphSettings() { return graphSettings; },
    get autoSelectFileEnabled() { return autoSelectFileEnabled; },
    set autoSelectFileEnabled(value) { autoSelectFileEnabled = value; },
    get showUnsupportedFolderFiles() { return showUnsupportedFolderFiles; },
    set showUnsupportedFolderFiles(value) { showUnsupportedFolderFiles = value; },
    get syncScrollingEnabled() { return syncScrollingEnabled; },
    set syncScrollingEnabled(value) { syncScrollingEnabled = value; },
    get sidebarDropzonePanel() { return sidebarDropzonePanel; },
    get dropzone() { return dropzone; },
    get sidebarDropzoneResizer() { return sidebarDropzoneResizer; },
    get outlinePanel() { return outlinePanel; },
    get sidebarLowerPanelTabs() { return sidebarLowerPanelTabs; },
    loadGlobalState,
    saveGlobalState,
    getDefaultGlobalState,
    applySelectedAppTheme: function(state) { themePreferences.applySelectedAppTheme(state); },
    applySidebarRailStylePreference,
    applyAppHeaderSpacingPreference,
    applyTabStylePreference,
    shouldConfirmResetState,
    updateThemeButtonLabels,
    getValidFolderSortMode,
    updateDropzoneToggleButtons,
    applySidebarWidth,
    applyAiCompanionPanelWidth,
    applySidebarDropzoneHeight,
    setSidebarVisible,
    setStatusBarVisible,
    hideSidebarDropzone,
    showSidebarDropzone,
    setViewMode,
    get updateSyncToggleButtons() { return updateSyncToggleButtons; },
    updateAutoSelectFileButtons,
    updateUnsupportedFileToggleButtons,
    updateFolderTreeToolbarState,
    get renderFilteredFolderTree() { return renderFilteredFolderTree; },
    get renderMarkdown() { return renderMarkdown; },
    scheduleGlobalProfileWrite,
    get updateFolderTreeSortControls() { return updateFolderTreeSortControls; }
  });
  const {
    getClampedEditorWidthPercent,
    getClampedAiCompanionPanelWidth,
    resetSidebarDropzoneLayoutToDefault,
  } = layoutPreferences;

  async function restoreDefaultPreferences(options = {}) {
    const restored = await layoutPreferences.restoreDefaultPreferences(options);
    if (restored) sidebarRailPreferences.applyPreferences(getDefaultGlobalState());
    return restored;
  }

  function applyGlobalPreferences(state = loadGlobalState()) {
    layoutPreferences.applyGlobalPreferences(state);
    sidebarRailPreferences.applyPreferences(state);
  }

  function applySavedLayoutPreferences(state = loadGlobalState()) {
    layoutPreferences.applySavedLayoutPreferences(state);
    sidebarRailPreferences.applyPreferences(state);
  }

  currentFolderSortMode = getValidFolderSortMode(loadGlobalState().folderSortMode || currentFolderSortMode);
  editorWidthPercent = getClampedEditorWidthPercent(loadGlobalState().editorWidthPercent);
  aiCompanionPanelWidth = getClampedAiCompanionPanelWidth(loadGlobalState().aiCompanionPanelWidth);
  const graphSettings = {
    magneticEnabled: loadGlobalState().graphMagneticEnabled !== false
  };
  autoSelectFileEnabled = loadGlobalState().autoSelectFileEnabled !== false;
  showUnsupportedFolderFiles = loadGlobalState().showUnsupportedFolderFiles === true;
  applySupportedTextExtensionsPreference(loadGlobalState());
  updateAutoSelectFileButtons();
  updateUnsupportedFileToggleButtons();
  applyWordWrapPreference(isWordWrapEnabled());
  applyAutocompletePreferences();
  applyEditorSnippetPreferences();
  updateDocumentWordAutocompleteToggleButtons();
  updateSpaceToTabLabels();
  applySavedLayoutPreferences(loadGlobalState());
  const globalStateHydrationPromise = hydrateGlobalStateFromProfile().then(function() {
    applicationMenu?.applyLayout?.(loadGlobalState().menuLayout);
  });

  const editorSyntaxHighlighter = window.registerMarkdownViewerEditorSyntaxHighlight(app, {
    markdownEditor,
    editorSyntaxHighlight,
    getActiveMarkdownEditor: function() { return editorViewManager.getActiveMarkdownEditor(); },
    getActiveOverlay: function(name) { return editorViewManager.getActiveOverlay(name); },
    getShowSymbolPreferences,
    escapeHtml,
    getCodeMirrorEditor: function() { return codeMirrorEditor; },
    shouldRenderEditorSyntaxHighlights: function() {
      const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
      return !(activeTab && activeTab.transformedForViewing === true);
    }
  });
  const renderEditorSyntaxHighlights = editorSyntaxHighlighter.renderEditorSyntaxHighlights;
  const syncEditorSyntaxHighlightScroll = editorSyntaxHighlighter.syncEditorSyntaxHighlightScroll;

  // Markdown link helpers are registered near startup from js/markdown/links.js.

  const mermaidTools = window.registerMarkdownViewerMermaidTools(app, {
    markdownPreview,
    getActiveMarkdownPreview: function() { return editorViewManager.getActiveMarkdownPreview(); }
  });
  const addMermaidToolbars = mermaidTools.addMermaidToolbars;
  const closeMermaidModal = mermaidTools.closeMermaidModal;

  markdownRender = window.registerMarkdownViewerRender(app, {
    RENDER_DELAY,
    markdownEditor,
    markdownPreview,
    appDebugLog,
    getActiveTab: function() { return tabs.find(function(tab) { return tab.id === activeTabId; }) || null; },
    getActiveMarkdownEditor: function() { return editorViewManager.getActiveMarkdownEditor(); },
    getActiveMarkdownPreview: function() { return editorViewManager.getActiveMarkdownPreview(); },
    getMarkdownRenderTimeout: function() { return markdownRenderTimeout; },
    setMarkdownRenderTimeout: function(value) { markdownRenderTimeout = value; },
    parseFrontmatter,
    renderFrontmatterTable,
    updateEditorLineNumbers,
    enhanceWikiLinks,
    enhancePreviewMarkdownImages,
    annotatePreviewMarkdownLinks,
    get enhanceGitHubAlerts() { return enhanceGitHubAlerts; },
    shouldRenderMarkdownPreview: function() {
      const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
      if (!activeTab || activeTab.type === "graph") return false;
      const path = activeTab.sourceFilePath || activeTab.sourceFileName || activeTab.sourceFileHandle?.name || "";
      return !path || isTextDocumentPath(path) || /\.(html|htm)$/i.test(path);
    },
    isMermaidPath,
    get initMermaid() { return initMermaid; },
    addMermaidToolbars,
    get updateDocumentStats() { return updateDocumentStats; },
    copyTextToClipboard: copyTextToSystemClipboard,
    document,
    NodeFilter,
    get marked() { return typeof marked !== "undefined" ? marked : null; },
    get DOMPurify() { return typeof DOMPurify !== "undefined" ? DOMPurify : null; },
    get mermaid() { return typeof mermaid !== "undefined" ? mermaid : null; },
    get MathJax() { return window.MathJax; },
    get joypixels() { return typeof joypixels !== "undefined" ? joypixels : null; },
    htmlPreviewFrame: document.getElementById("html-preview")
  });
  const processEmojis = markdownRender.processEmojis;
  const renderMarkdown = markdownRender.renderMarkdown;
  const debouncedRender = markdownRender.debouncedRender;


  const sampleMarkdown = `---
title: Welcome to MD-Editor
description: A client-side GitHub-flavored Markdown editor and previewer with tabs, graph workflows, math, diagrams, imports, and export tools.
author: ShayBC
tags: ["markdown", "preview", "mermaid", "latex", "graph", "open-source"]
updated: 2026-05-09
repository: https://github.com/shaybc/md-editor
---

# Welcome to MD-Editor

MD-Editor is a modern, client-side Markdown workspace for writing, previewing, importing, organizing, and exporting Markdown documents. This welcome document appears when startup behavior is set to Welcome or when you open it from the Help menu.

- **Repository:** [shaybc/md-editor](https://github.com/shaybc/md-editor)
- **Privacy model:** Your Markdown is rendered in your browser; document tabs are saved locally in this browser with localStorage.
- **Best for:** Notes, READMEs, technical docs, wiki pages, research snippets, diagrams, math-heavy docs, and quick export workflows.
- **App info:** Updated May 9, 2026.

## נ€ What You Can Do Here

### Write and preview Markdown
- GitHub-flavored Markdown (GFM), including tables, task lists, strikethrough, and autolinks
- Live split-screen rendering with editor-only, preview-only, and split view modes
- GitHub-style alerts such as \`> [!NOTE]\` and \`> [!WARNING]\`
- Syntax highlighting for code blocks
- Frontmatter parsing with rendered document metadata

### Work with files and tabs
- Open local Markdown files or import an entire folder of Markdown documents
- Import Markdown directly from public GitHub URLs
- Manage multiple document tabs: create, rename, duplicate, reorder, and close
- Restore or reset the workspace when you want a fresh start

### Build richer documentation
- Mermaid diagrams with interactive zoom, pan, copy, PNG export, and SVG export controls
- LaTeX math rendering through MathJax
- Emoji shortcode support plus native Unicode emoji נ˜€
- Local wiki-style links for connected note workflows
- Folder graph view for seeing relationships across imported Markdown files

### Export and share
- Export Markdown, standalone HTML, or PDF
- Copy rendered HTML for use in other tools
- Share compressed Markdown through the page URL when you need a quick handoff

## נ’» Code with Syntax Highlighting

\`\`\`javascript
function renderMarkdown(markdown) {
  const html = marked.parse(markdown);
  const cleanHtml = DOMPurify.sanitize(html);
  markdownPreview.innerHTML = cleanHtml;
}
\`\`\`

## נ§® Math Support

Inline math: $$E = mc^2$$

Block math:
$$\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}$$

## נ“ Mermaid Diagrams

\`\`\`mermaid
flowchart LR
    Start["Open MD-Editor"] --> Write["Write or import Markdown"]
    Write --> Preview["Preview instantly"]
    Preview --> Export{"Need output?"}
    Export -->|Yes| Files["Export MD, HTML, or PDF"]
    Export -->|No| KeepWriting["Keep writing"]
    KeepWriting --> Preview
\`\`\`

## ג… Markdown Task Lists

- [x] Live Markdown preview
- [x] Multi-tab documents
- [x] Local and GitHub import workflows
- [x] Mermaid diagrams
- [x] LaTeX math
- [x] HTML and PDF export
- [x] Folder graph workflows
- [ ] Your next document

## נ“‹ Feature Snapshot

| Capability | MD-Editor |
|:--|:--|
| Runs in browser | ג… |
| Client-side rendering | ג… |
| GitHub-flavored Markdown | ג… |
| Multi-document tabs | ג… |
| Folder import and graph view | ג… |
| Mermaid diagrams | ג… |
| LaTeX math | ג… |
| Export to MD, HTML, and PDF | ג… |
| Public GitHub import | ג… |

## ג¨ Formatting Examples

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, <mark>highlighting</mark>, and <u>underlines</u>.

Chemical formulas: H<sub>2</sub>O and CO<sub>2</sub><br>
Keyboard shortcuts: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> to export Markdown.

> [!TIP]
> Drag Markdown files into the app or use the import menu to bring in existing documentation quickly.

## נ”— Helpful Links

- [MD-Editor repository](https://github.com/shaybc/md-editor)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
- [Mermaid documentation](https://mermaid.js.org/)
- [MathJax documentation](https://docs.mathjax.org/)

---

## נ”’ Security and Privacy

Markdown content is processed client-side in your browser and sanitized before preview rendering. Public GitHub import uses GitHub-hosted resources only for the files you choose to import, and local tab persistence stays in this browser's storage.
`;

  // ========================================
  // DOCUMENT TABS & SESSION MANAGEMENT
  // ========================================

  const STORAGE_KEY = 'markdownViewerTabs';
  const ACTIVE_TAB_KEY = 'markdownViewerActiveTab';
  const UNTITLED_COUNTER_KEY = 'markdownViewerUntitledCounter';
  const TABS_PROFILE_FILE = "tabs.json";
  let tabs = [];
  let activeTabId = null;
  let folderMarkdownFiles = [];
  let folderTagCounts = new Map();
  let folderTagCountsRefreshId = 0;
  let openGraphSnapshotTagSyncRequestId = 0;
  let activeFolderName = "Graph View";
  let activeFolderHandle = null;
  let activeFolderPath = null;
  let lazyFolderCountSession = null;
  let lazyFolderCountResult = null;
  let lazyFolderCountGeneration = 0;
  let draggedTabId = null;
  let saveTabStateTimeout = null;
  let pendingTabsProfileWrite = null;
  let tabsProfileWriteInFlight = null;
  let tabsProfileWriteGate = null;
  let currentTabSessionFlushInFlight = null;
  let tabSessionPersistence = null;
  let closedTabHistory = null;
  let graphLayoutSaveTimeout = null;
  let untitledCounter = 0;
  const graphRenderCache = new Map();
  let graphRenderRequestId = 0;
  const GRAPH_GROUP_QUERY_UPDATE_DELAY = 180;
  const GRAPH_GROUP_DEFAULT_COLORS = Object.freeze([
    "#7c3aed",
    "#2563eb",
    "#059669",
    "#d97706",
    "#dc2626",
    "#db2777",
    "#0891b2",
    "#4f46e5"
  ]);
  const GRAPH_DOCUMENT_SCHEMA_VERSION = 1;
  const GRAPH_DOCUMENT_TYPE_VIEW = "graph-view";
  const GRAPH_DOCUMENT_TYPE_EXPORT = "graph-export";
  const GRAPH_DOCUMENT_TYPES = new Set([GRAPH_DOCUMENT_TYPE_VIEW, GRAPH_DOCUMENT_TYPE_EXPORT]);
  const LARGE_GRAPH_DISPLAY_NODE_LIMIT = 1500;
  const LIGHTWEIGHT_SAVED_GRAPH_TEXT_SEARCH_MESSAGE = "Text search is unavailable because this saved graph view does not contain file contents. Use Update graph to search current files, or open Export Folder to Graph.";
  const DEFAULT_GRAPH_VIEW_CONFIG = Object.freeze({
    showTags: false,
    showExternalJars: false,
    showMissingDependencies: true,
    hiddenTagIds: [],
    hiddenNodeIds: [],
    selectedTagIds: [],
    groups: [],
    collapsedClusters: [],
    searchQuery: "",
    showArrows: false,
    showOrphans: true,
    showLabels: false,
    textFadeThreshold: 0.35,
    nodeSize: 0.8,
    linkThickness: 1,
    centerForce: 1,
    repelForce: 650,
    linkForce: 0.4,
    linkDistance: 170,
    groupForce: 0.18
  });
  const GRAPH_VIEW_PREFERENCE_KEYS = Object.freeze([
    "showArrows",
    "showMissingDependencies",
    "showOrphans",
    "showLabels",
    "textFadeThreshold",
    "nodeSize",
    "linkThickness",
    "centerForce",
    "repelForce",
    "linkForce",
    "linkDistance",
    "groupForce"
  ]);

  function getActiveEditorPathForLanguage() {
    return getEditorPathForTab(activeTabId);
  }

  function getEditorPathForTab(tabId) {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    return tab?.sourceFilePath || tab?.sourceFileName || tab?.title || "document.md";
  }

  function getEditorLanguageOverride(tabId) {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    const languageId = typeof tab?.parseAsLanguageId === "string" ? tab.parseAsLanguageId : "";
    return languageRegistry?.languages?.some?.((language) => language.id === languageId) ? languageId : null;
  }

  function getOpenDocumentsForAiCompanionAutocomplete() {
    return tabs
      .filter((tab) => tab.id !== activeTabId && typeof tab.content === "string" && tab.content.trim())
      .map((tab) => ({
        path: tab.sourceFilePath || tab.sourceFileName || tab.title || "",
        content: tab.content
      }))
      .filter((doc) => doc.path);
  }

  function createActiveCodeMirrorEditorFacade() {
    const getActiveInstance = function() {
      return editorViewManager?.getActiveCodeMirrorEditor?.() || null;
    };
    const callActive = function(methodName, fallbackValue) {
      return function() {
        const activeInstance = getActiveInstance();
        if (!activeInstance || typeof activeInstance[methodName] !== "function") return fallbackValue;
        return activeInstance[methodName].apply(activeInstance, arguments);
      };
    };
    return {
      isEnabled: function() { return !!getActiveInstance()?.isEnabled?.(); },
      isFocused: function() { return !!getActiveInstance()?.isFocused?.(); },
      canFormatActiveDocument: function() { return !!getActiveInstance()?.canFormatActiveDocument?.(); },
      collapseTopLevelFolds: callActive("collapseTopLevelFolds", false),
      expandTopLevelFolds: callActive("expandTopLevelFolds", false),
      getDocumentSymbols: callActive("getDocumentSymbols", Promise.resolve([])),
      getSyntaxTree: callActive("getSyntaxTree", null),
      getActiveLanguage: function() { return getActiveInstance()?.getActiveLanguage?.() || null; },
      formatActiveDocument: async function() {
        const activeInstance = getActiveInstance();
        return activeInstance?.formatActiveDocument ? activeInstance.formatActiveDocument() : false;
      },
      indentLess: callActive("indentLess", false),
      indentMore: callActive("indentMore", false),
      correctIndentation: callActive("correctIndentation", false),
      replaceRange: callActive("replaceRange", false),
      redo: callActive("redo", false),
      setLanguageForActivePath: callActive("setLanguageForActivePath", undefined),
      setBookmarkedLines: callActive("setBookmarkedLines", false),
      clearBookmarkedLines: callActive("clearBookmarkedLines", false),
      setSelectionMatchCaseSensitive: callActive("setSelectionMatchCaseSensitive", undefined),
      syncFromTextarea: callActive("syncFromTextarea", undefined),
      setAutocompletePreferences: callActive("setAutocompletePreferences", undefined),
      setDocumentWordAutocomplete: callActive("setDocumentWordAutocomplete", undefined),
      isDocumentWordAutocompleteEnabled: function() { return !!getActiveInstance()?.isDocumentWordAutocompleteEnabled?.(); },
      setLanguageAutocomplete: callActive("setLanguageAutocomplete", undefined),
      isLanguageAutocompleteEnabled: function() { return !!getActiveInstance()?.isLanguageAutocompleteEnabled?.(); },
      setLanguageServerAutocomplete: callActive("setLanguageServerAutocomplete", undefined),
      isLanguageServerAutocompleteEnabled: function() { return !!getActiveInstance()?.isLanguageServerAutocompleteEnabled?.(); },
      setSnippetAutocomplete: callActive("setSnippetAutocomplete", undefined),
      isSnippetAutocompleteEnabled: function() { return !!getActiveInstance()?.isSnippetAutocompleteEnabled?.(); },
      selectAll: callActive("selectAll", false),
      startCompletion: callActive("startCompletion", false),
      getCommentCapabilities: function() { return getActiveInstance()?.getCommentCapabilities?.() || { canToggleComment: false, canToggleBlockComment: false }; },
      toggleComment: callActive("toggleComment", false),
      toggleBlockComment: callActive("toggleBlockComment", false),
      getView: function() { return getActiveInstance()?.getView?.() || null; },
      undo: callActive("undo", false)
    };
  }

  codeMirrorEditor = createActiveCodeMirrorEditorFacade();
  app.registerModule("codeMirrorEditor", codeMirrorEditor);

  const CODEMIRROR_LOAD_RETRY_DELAYS_MS = Object.freeze([250, 1000]);
  let codeMirrorBundleLoadPromise = null;

  function loadDeferredCodeMirrorBundle(attempt = 0) {
    if (window.MarkdownViewerCodeMirror) {
      const upgraded = editorViewManager?.upgradeCodeMirrorEditors?.() || 0;
      startupPerf?.mark?.("deferred CodeMirror already available", { upgraded });
      return Promise.resolve(true);
    }
    if (codeMirrorBundleLoadPromise) return codeMirrorBundleLoadPromise;

    startupPerf?.mark?.("deferred CodeMirror load start");
    codeMirrorBundleLoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "js/vendor/codemirror.bundle.js";
      script.async = true;
      script.onload = function() {
        const upgraded = editorViewManager?.upgradeCodeMirrorEditors?.() || 0;
        startupPerf?.mark?.("deferred CodeMirror load complete", { upgraded });
        startupPerf?.flushToAppDebug?.(appDebugLog);
        resolve(true);
      };
      script.onerror = function() {
        const retryDelayMs = CODEMIRROR_LOAD_RETRY_DELAYS_MS[attempt];
        const willRetry = Number.isFinite(retryDelayMs);
        startupPerf?.mark?.("deferred CodeMirror load failed", { attempt: attempt + 1, willRetry });
        startupPerf?.flushToAppDebug?.(appDebugLog);
        script.remove();
        if (!willRetry) {
          codeMirrorBundleLoadPromise = null;
          resolve(false);
          return;
        }
        window.setTimeout(function() {
          codeMirrorBundleLoadPromise = null;
          resolve(loadDeferredCodeMirrorBundle(attempt + 1));
        }, retryDelayMs);
      };
      document.body.appendChild(script);
    });
    return codeMirrorBundleLoadPromise;
  }

  function getDeferredVendorSrc(webSrc, desktopSrc) {
    return isNeutralinoRuntime() ? desktopSrc : webSrc;
  }

  function loadDeferredScriptOnce(isAvailable, src, label) {
    if (typeof isAvailable === "function" && isAvailable()) {
      startupPerf?.mark?.(`deferred ${label} already available`);
      return Promise.resolve(true);
    }

    startupPerf?.mark?.(`deferred ${label} load start`);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function() {
        startupPerf?.mark?.(`deferred ${label} load complete`);
        resolve(true);
      };
      script.onerror = function() {
        startupPerf?.mark?.(`deferred ${label} load failed`);
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }

  async function loadDeferredPreviewEnhancementVendors() {
    const results = await Promise.all([
      loadDeferredScriptOnce(
        function() { return typeof window.MathJax?.typesetPromise === "function"; },
        getDeferredVendorSrc(
          "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js",
          "/vendor/mathjax/es5/tex-mml-chtml.min.js"
        ),
        "MathJax"
      ),
      loadDeferredScriptOnce(
        function() { return typeof window.mermaid?.initialize === "function"; },
        getDeferredVendorSrc(
          "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js",
          "/vendor/js/mermaid.min.js"
        ),
        "Mermaid"
      ),
      loadDeferredScriptOnce(
        function() { return typeof window.joypixels?.shortnameToUnicode === "function"; },
        getDeferredVendorSrc(
          "https://cdn.jsdelivr.net/npm/emoji-toolkit@9.0.1/lib/js/joypixels.min.js",
          "/vendor/js/joypixels.min.js"
        ),
        "JoyPixels"
      )
    ]);

    try {
      rendererConfig.initialize();
      if (results.some(Boolean)) {
        renderMarkdown({ reason: "deferred-preview-vendors", reuseCache: false });
      }
    } catch (error) {
      console.warn("Deferred preview enhancement refresh failed:", error);
    }
    startupPerf?.flushToAppDebug?.(appDebugLog);
  }

  function getGraphViewPreferenceDefaults() {
    const savedPreferences = loadGlobalState().graphViewPreferences;
    if (!savedPreferences || typeof savedPreferences !== "object") return {};
    return GRAPH_VIEW_PREFERENCE_KEYS.reduce((preferences, key) => {
      if (Object.prototype.hasOwnProperty.call(savedPreferences, key)) {
        preferences[key] = savedPreferences[key];
      }
      return preferences;
    }, {});
  }

  function saveGraphViewPreferenceDefaults(patch) {
    if (!patch || typeof patch !== "object") return;
    const currentPreferences = getGraphViewPreferenceDefaults();
    const nextPreferences = GRAPH_VIEW_PREFERENCE_KEYS.reduce((preferences, key) => {
      if (Object.prototype.hasOwnProperty.call(currentPreferences, key)) {
        preferences[key] = currentPreferences[key];
      }
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        preferences[key] = patch[key];
      }
      return preferences;
    }, {});
    saveGlobalState({ graphViewPreferences: nextPreferences });
  }

  const graphPersistence = window.registerMarkdownViewerGraphPersistence(app, {
    GRAPH_GROUP_DEFAULT_COLORS,
    DEFAULT_GRAPH_VIEW_CONFIG,
    GRAPH_DOCUMENT_SCHEMA_VERSION,
    GRAPH_DOCUMENT_TYPE_VIEW,
    GRAPH_DOCUMENT_TYPE_EXPORT,
    GRAPH_DOCUMENT_TYPES,
    LARGE_GRAPH_DISPLAY_NODE_LIMIT,
    getGraphViewPreferenceDefaults,
    STORAGE_KEY,
    ACTIVE_TAB_KEY,
    get activeTabId() { return activeTabId; },
    set activeTabId(value) { activeTabId = value; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get graphSettings() { return graphSettings; },
    get graphRenderCache() { return graphRenderCache; },
    get graphComparisonDetailsModal() { return graphComparisonDetailsModal; },
    get graphComparisonDetailsContent() { return graphComparisonDetailsContent; },
    get graphStaleModal() { return graphStaleModal; },
    get graphStaleSummary() { return graphStaleSummary; },
    get graphStaleNewFilesCount() { return graphStaleNewFilesCount; },
    get graphStaleSavedOnlyFilesCount() { return graphStaleSavedOnlyFilesCount; },
    get graphStaleChangedConnectionsCount() { return graphStaleChangedConnectionsCount; },
    get graphStaleChangedTagsCount() { return graphStaleChangedTagsCount; },
    get graphViewCanvas() { return graphViewCanvas; },
    get graphViewToolbar() { return graphViewToolbar; },
    get savedGraphModePill() { return savedGraphModePill; },
    set savedGraphModePill(value) { savedGraphModePill = value; },
    get tabs() { return tabs; },
    set tabs(value) { tabs = value; },
    normalizeGraphNodeName,
    getGraphDisplayLabel,
    createGraphTargetLookup,
    resolveGraphTargetId,
    normalizeTagName,
    normalizeFileTagList,
    escapeHtml,
    looksLikeGraphDocument,
    extractMarkdownLinks,
    extractSourceFileFromFrontmatter,
    extractUnresolvedDependencies,
    getFileTagsFromContent,
    get readFolderMarkdownFileContent() { return readFolderMarkdownFileContent; },
    getFileName,
    get isNeutralinoRuntime() { return isNeutralinoRuntime; },
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get renderGraphView() { return renderGraphView; },
    saveGlobalState,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get tabSessionPersistence() { return tabSessionPersistence; },
    scheduleTabsProfileWrite,
    appDebugLog
  });
  const {    normalizeGraphTagNodeId,
    normalizeGraphTagNodeIds,
    clearGraphPersistenceCaches,
    clampGraphNumber,
    createGraphGroupId,
    normalizeGraphGroupColor,
    getGraphColorInputValue,
    getNextDefaultGraphGroupColor,
    normalizeGraphGroups,
    normalizeGraphViewConfig,
    cloneGraphPersistenceValue,
    normalizeGraphTimestamp,
    normalizeGraphSnapshot,
    graphSnapshotHasEmbeddedFileContent,
    isGraphFileNode,
    getGraphNodePath,
    getGraphNodeName,
    createGraphFileDataFromNode,
    getGraphSnapshotFileEntries,
    getGraphFileKey,
    getGraphLinkEndpointKey,
    getGraphLinkKey,
    getGraphSnapshotFilesForComparison,
    getGraphSnapshotLinksForComparison,
    getGraphTagRelationKeys,
    compareGraphCollections,
    compareGraphViewToCurrentFolder,
    hasGraphComparisonChanges,
    buildCompareGraphSnapshot,
    isKeepSavedGraphMode,
    getGraphNodeNormalizedPath,
    getGraphSnapshotNodeIds,
    getGraphLayoutEntryByNormalizedPath,
    getGraphLayoutEntryForSnapshotNode,
    shouldPreserveGraphZoomTransform,
    preserveGraphLayoutForCurrentSnapshot,
    preserveGraphLayoutForCompareSnapshot,
    preserveGraphConfigForCurrentSnapshot,
    applyCurrentFolderSnapshotToSavedGraphTab,
    showGraphUpdatedBanner,
    showSavedGraphModeBanner,
    showGraphBanner,
    hideGraphBanner,
    ensureSavedGraphModePill,
    updateSavedGraphModePill,
    refreshGraphModeNoticesForTab,
    getGraphComparisonSummaryCounts,
    getGraphFileDifferenceLabel,
    createGraphComparisonLabelLookup,
    getGraphComparisonEndpointLabel,
    getGraphLinkDifferenceLabel,
    getGraphTagRelationDifferenceLabel,
    createGraphComparisonSection,
    buildGraphComparisonDetailsModel,
    renderGraphComparisonDetailsModel,
    openGraphComparisonDetailsModal,
    closeGraphComparisonDetailsModal,
    openGraphStaleComparisonDetailsModal,
    hideGraphStaleModal,
    showGraphStaleModal,
    shouldCompareSavedGraphWithCurrentFolder,
    promptForStaleSavedGraphIfNeeded,
    promptSavedGraphTabForCurrentFolder,
    promptActiveSavedGraphForCurrentFolder,
    keepSavedGraphFromStaleModal,
    updateGraphFromStaleModal,
    loadGraphComparisonFromStaleModal,
    shouldPreserveGraphSnapshotFullPath,
    stripGraphSnapshotContent,
    serializeGraphViewDocument,
    serializeGraphExportDocument,
    getExplicitGraphDocumentType,
    inferLegacyGraphDocumentType,
    normalizeGraphDocumentType,
    getGraphDocumentKind,
    validateParsedGraphDocument,
    normalizeGraphDocument,
    serializeGraphTab,
    deserializeGraphDocument,
    syncGraphTabDocument,
    getActiveGraphTab,
    getSuggestedGraphFileName,
    isFileBackedGraphTab,
    markGraphTabAsChanged,
    clearGraphTabUnsavedChanges,
    getGraphFileSignature,
    getGraphViewSignature,
    createGraphPerfSession,
    createGraphSnapshot,
    getGraphSnapshotSignature,
    toFiniteNumber,
    formatGraphZoomPercent,
    getGraphZoomScaleFromLayout,
    getSavedGraphNodeLayout,
    applySavedGraphLayout,
    getSavedGraphZoomTransform,
    captureGraphLayout,
    getGraphRenderWrappersForTab,
    removeGraphRenderForTab,
    hideInactiveGraphRenders,
    suspendGraphRender,
    suspendActiveGraphRender,
    loadTabsFromStorage,
    saveTabsToStorage,
    scheduleGraphLayoutStorageSave,
    loadActiveTabId,
    saveActiveTabId,
  } = graphPersistence;

  async function getTabsProfilePayload(tabsSnapshot) {
    const profileTabs = Array.isArray(tabsSnapshot) ? tabsSnapshot : tabs;
    if (tabSessionPersistence?.createProfilePayload) {
      return tabSessionPersistence.createProfilePayload(profileTabs, activeTabId || loadActiveTabId() || null);
    }
    return {
      version: 2,
      updatedAt: Date.now(),
      activeTabId: activeTabId || loadActiveTabId() || null,
      tabs: []
    };
  }

  async function writeTabsSessionToProfile(tabsSnapshot) {
    if (!isNeutralinoRuntime() || !recentItems.getProfileDataFilePath) return;
    const profilePath = await recentItems.getProfileDataFilePath(TABS_PROFILE_FILE);
    if (!profilePath) return;
    try {
      const payload = await getTabsProfilePayload(tabsSnapshot);
      void appDebugLog("info", "[tabs-session] Writing tabs profile", {
        profilePath,
        activeTabId: payload.activeTabId,
        count: payload.tabs.length,
        titles: payload.tabs.map((tab) => tab?.title).filter(Boolean)
      });
      await Neutralino.filesystem.writeFile(profilePath, JSON.stringify(payload, null, 2));
    } catch (error) {
      await appDebugLog("error", "[tabs-session] Failed to write tabs profile", error);
      console.warn("Failed to save tabs profile:", error);
    }
  }

  function cloneTabsProfileSnapshot(tabsSnapshot) {
    if (!Array.isArray(tabsSnapshot)) return null;
    return tabsSnapshot.slice();
  }

  function queueTabsSessionProfileWrite(tabsSnapshot) {
    pendingTabsProfileWrite = cloneTabsProfileSnapshot(tabsSnapshot);
    if (tabsProfileWriteInFlight) return tabsProfileWriteInFlight;
    tabsProfileWriteInFlight = (async () => {
      while (pendingTabsProfileWrite !== null) {
        const tabsToWrite = pendingTabsProfileWrite;
        pendingTabsProfileWrite = null;
        await writeTabsSessionToProfile(tabsToWrite);
      }
    })().finally(() => {
      tabsProfileWriteInFlight = null;
    });
    return tabsProfileWriteInFlight;
  }

  function scheduleTabsProfileWrite(tabsSnapshot) {
    tabsProfileWriteGate?.schedule(tabsSnapshot, "tabs-session-save");
  }

  async function flushTabsSessionProfileWrite() {
    await tabsProfileWriteGate?.flushNow("explicit-flush");
  }

  function pauseTabsSessionProfileWrites(reason = "operation") {
    if (!tabsProfileWriteGate?.pause) return async function resumeNoop() {};
    return tabsProfileWriteGate.pause(reason);
  }

  async function withPausedTabsSessionProfileWrites(reason, asyncWork) {
    if (!tabsProfileWriteGate?.withPaused) return asyncWork();
    return tabsProfileWriteGate.withPaused(reason, asyncWork);
  }

  tabsProfileWriteGate = window.registerMarkdownViewerTabsProfileWriteGate?.(app, {
    appDebugLog,
    cloneSnapshot: cloneTabsProfileSnapshot,
    delayMs: 100,
    isEnabled: isNeutralinoRuntime,
    queueWrite: queueTabsSessionProfileWrite
  });

  async function hydrateTabsSessionFromProfile() {
    if (!isNeutralinoRuntime() || !recentItems.getProfileDataFilePath) return;
    const profilePath = await recentItems.getProfileDataFilePath(TABS_PROFILE_FILE);
    if (!profilePath) return;
    try {
      void appDebugLog("debug", "[tabs-session] Reading tabs profile", { profilePath });
      const rawProfileData = await Neutralino.filesystem.readFile(profilePath);
      const profileData = JSON.parse(rawProfileData || "{}");
      if (!tabSessionPersistence?.isSessionPayload?.(profileData)) {
        void appDebugLog("warning", "[tabs-session] Ignoring tabs profile because it is not a v2 typed session", {
          profilePath,
          version: profileData?.version || null
        });
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_TAB_KEY);
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profileData));
      if (profileData.activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, String(profileData.activeTabId));
      else localStorage.removeItem(ACTIVE_TAB_KEY);
      void appDebugLog("info", "[tabs-session] Hydrated tabs profile", {
        profilePath,
        activeTabId: profileData.activeTabId || null,
        count: profileData.tabs.length,
        titles: profileData.tabs.map((tab) => tab?.title).filter(Boolean)
      });
    } catch (error) {
      void appDebugLog("warning", "[tabs-session] Tabs profile missing or unreadable; startup will use browser session storage if available", {
        profilePath,
        localStorageTabCount: loadTabsFromStorage().tabs?.length || 0,
        localStorageActiveTabId: loadActiveTabId()
      });
    }
  }

  const graphDocuments = window.registerMarkdownViewerGraphDocuments(app, {
    GRAPH_DOCUMENT_TYPE_VIEW,
    GRAPH_DOCUMENT_TYPE_EXPORT,
    get activeTabId() { return activeTabId; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get activeFolderHandle() { return activeFolderHandle; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get graphRenderCache() { return graphRenderCache; },
    get tabs() { return tabs; },
    getMaxOpenTabs,
    serializeGraphExportDocument,
    serializeGraphViewDocument,
    createGraphSnapshot,
    createGraphPerfSession,
    getSuggestedGraphFileName,
    syncGraphTabDocument,
    captureGraphLayout,
    clearGraphTabUnsavedChanges,
    validateParsedGraphDocument,
    normalizeGraphSnapshot,
    getGraphDocumentKind,
    stripGraphSnapshotContent,
    deserializeGraphDocument,
    saveTabsToStorage,
    get tabSessionPersistence() { return tabSessionPersistence; },
    isFirefoxBrowser,
    getFileName,
    joinPath,
    isPathInsideFolder,
    get reloadOpenFolderTree() { return reloadOpenFolderTree; },
    get getRootFolderGraphScopeKey() { return getRootFolderGraphScopeKey; },
    get focusExistingFolderGraphTab() { return focusExistingFolderGraphTab; },
    get createGraphTab() { return createGraphTab; },
    get createOpenedSource() { return createOpenedSource; },
    get setTabOpenedSource() { return setTabOpenedSource; },
    get switchTab() { return switchTab; },
    get getGraphTitleFromFileName() { return getGraphTitleFromFileName; },
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get getActiveGraphTab() { return getActiveGraphTab; },
    get shouldCompareSavedGraphWithCurrentFolder() { return shouldCompareSavedGraphWithCurrentFolder; },
    get promptForStaleSavedGraphIfNeeded() { return promptForStaleSavedGraphIfNeeded; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return saveAs; },
    get refreshFolderFilesForGraphComparison() { return refreshFolderFilesForGraphComparison; },
    get refreshOpenFolderGraphTabsFromFolderFiles() { return refreshOpenFolderGraphTabsFromFolderFiles; },
    appDebugLog,
    alert
  });
  const openGraphView = graphDocuments.openGraphView;
  const getGraphExportContent = graphDocuments.getGraphExportContent;
  const writeGraphExportWithSaveDialog = graphDocuments.writeGraphExportWithSaveDialog;
  const exportFolderFilesToGraph = graphDocuments.exportFolderFilesToGraph;
  const exportActiveFolderToGraph = graphDocuments.exportActiveFolderToGraph;
  const getActiveGraphSaveContent = graphDocuments.getActiveGraphSaveContent;
  const updateGraphTabAfterSave = graphDocuments.updateGraphTabAfterSave;
  const saveGraphTabToSource = graphDocuments.saveGraphTabToSource;
  const saveActiveGraphToSource = graphDocuments.saveActiveGraphToSource;
  const saveGraphTabWithSaveDialog = graphDocuments.saveGraphTabWithSaveDialog;
  const saveActiveGraphWithSaveDialog = graphDocuments.saveActiveGraphWithSaveDialog;
  const openSavedGraphDocument = graphDocuments.openSavedGraphDocument;

  const tagsModule = window.registerMarkdownViewerTags(app, {
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get folderTagCounts() { return folderTagCounts; },
    set folderTagCounts(value) { folderTagCounts = value; },
    get folderTagCountsRefreshId() { return folderTagCountsRefreshId; },
    set folderTagCountsRefreshId(value) { folderTagCountsRefreshId = value; },
    get selectedFolderTreeTags() { return selectedFolderTreeTags; },
    set selectedFolderTreeTags(value) { selectedFolderTreeTags = value; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    get openGraphSnapshotTagSyncRequestId() { return openGraphSnapshotTagSyncRequestId; },
    set openGraphSnapshotTagSyncRequestId(value) { openGraphSnapshotTagSyncRequestId = value; },
    get activeFolderPath() { return activeFolderPath; },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    get markdownEditor() { return markdownEditor; },
    activeEditorCommands,
    get graphRenderCache() { return graphRenderCache; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get tagManagementList() { return tagManagementList; },
    get tagManagementSearch() { return tagManagementSearch; },
    normalizeFileTagList,
    normalizeTagName,
    loadGlobalState,
    saveGlobalState,
    getComparableFilePath,
    getFileName,
    getFolderTreeNodePathKey,
    get normalizeEditorContent() { return normalizeEditorContent; },
    getFileTagsFromContent,
    getActiveGraphTab,
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get renderGraphView() { return renderGraphView; },
    createGraphSnapshot,
    isKeepSavedGraphMode,
    markGraphTabAsChanged,
    saveTabsToStorage,
    invalidateWorkspaceDerivedState,
    isNeutralinoRuntime,
    shouldConfirmDeleteFiles,
    joinPath,
    get toggleFolderTreeTagFilter() { return toggleFolderTreeTagFilter; },
    get renderFilteredFolderTree() { return renderFilteredFolderTree; },
    get updateTagManagementMenuButtons() { return updateTagManagementMenuButtons; },
    get renderLinkAutocomplete() { return renderLinkAutocomplete; },
    get renderEditorSyntaxHighlights() { return renderEditorSyntaxHighlights; },
    get updateEditorLineNumbers() { return updateEditorLineNumbers; },
    get renderMarkdown() { return renderMarkdown; },
    get sidebarNodeMatchesSnapshotFile() { return sidebarNodeMatchesSnapshotFile; },
    get updateOpenMarkdownTabsForSidebarNode() { return updateOpenMarkdownTabsForSidebarNode; },
    removeTagFromContent,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    normalizeGraphNodeName,
    escapeHtml
  });
  const {
    getKnownTags,
    saveKnownTags,
    addTagsToCountMap,
    removeTagsFromCountMap,
    areTagListsEqual,
    getComparableFolderEntryPath,
    getFolderMarkdownEntryForTab,
    updateFolderTreeNodeTagsForEntry,
    syncMarkdownTabTagsToFolderState,
    getActiveGraphSnapshotTagCounts,
    getReferencedTagCounts,
    getAllKnownAndReferencedTags,
    getAvailableTags,
    getReferencedTags,
    getGraphFileEntryNodeId,
    findFolderMarkdownEntryForGraphFile,
    clearFolderMarkdownContentCache,
    readFolderMarkdownFileContent,
    refreshFolderTagCounts,
    clearFolderTagCounts,
    renderTagManagementList,
    createTag,
    promptForNewTag,
    snapshotFileMatchesTab,
    updateOpenMarkdownTabsForSnapshotFile,
    getOpenGraphSnapshotTagsForMarkdownTab,
    updateFolderMarkdownEntryForSnapshotFile,
    syncOpenGraphSnapshotsForMarkdownTabTagChange,
    getTagDeletionEntryKey,
    getActiveGraphSnapshotFileDeletionTargets,
    getNeutralinoTagDeletionWritePath,
    writeTagDeletionTargetContent,
    updateOpenGraphSnapshotsForChangedTagFiles,
    deleteTag
  } = tagsModule;

  renderTagManagementList();

  const tabCounter = window.registerMarkdownViewerTabCounter(app, {
    UNTITLED_COUNTER_KEY,
    localStorage
  });
  const loadUntitledCounter = tabCounter.loadUntitledCounter;
  const saveUntitledCounter = tabCounter.saveUntitledCounter;

  const unsavedChanges = window.registerMarkdownViewerUnsavedChanges(app, {
    isFileBackedGraphTab
  });
  const normalizeEditorContent = unsavedChanges.normalizeEditorContent;
  const tabHasUnsavedChanges = unsavedChanges.tabHasUnsavedChanges;

  const fileSave = window.registerMarkdownViewerFileSave(app, {
    get activeTabId() { return activeTabId; },
    get activeFolderHandle() { return activeFolderHandle; },
    get activeFolderPath() { return activeFolderPath; },
    get markdownEditor() { return markdownEditor; },
    activeEditorCommands,
    imageEditor,
    diagramEditor,
    get tabs() { return tabs; },
    normalizeEditorContent,
    getMarkdownTitleFromFileName,
    syncMarkdownTabTagsToFolderState,
    saveTabsToStorage,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get tabSessionPersistence() { return tabSessionPersistence; },
    onTabSourceMetadataChanged: function(tab) {
      void editorViewManager?.refreshLicenseHeaderForTab?.(tab?.id);
    },
    tabHasUnsavedChanges,
    getFileName,
    getSuggestedMarkdownFileName,
    getSuggestedDocumentFileName,
    joinPath,
    isPathInsideFolder,
    invalidateWorkspaceDerivedState,
    get reloadOpenFolderTree() { return reloadOpenFolderTree; },
    suppressFolderWatcher: function(milliseconds) {
      app.modules?.folderWatcher?.suppress?.(milliseconds);
    },
    refreshWorkspaceGitStatus: function() {
      app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.();
    },
    rememberRecentFile,
    isFirefoxBrowser,
    get getActiveMarkdownTab() { return getActiveMarkdownTab; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return saveAs; },
    enhanceGitHubAlerts
  });
  const updateTabAfterSave = fileSave.updateTabAfterSave;
  const getMarkdownTabContentForSave = fileSave.getMarkdownTabContentForSave;
  const saveMarkdownTabToSource = fileSave.saveMarkdownTabToSource;
  const saveMarkdownTabWithSaveDialog = fileSave.saveMarkdownTabWithSaveDialog;
  const saveGeneratedHtmlTabWithSaveDialog = fileSave.saveGeneratedHtmlTabWithSaveDialog;
  const saveActiveTabWithSaveDialog = fileSave.saveActiveTabWithSaveDialog;
  const saveActiveFileTabAs = fileSave.saveActiveFileTabAs;
  const saveActiveTabToSource = fileSave.saveActiveTabToSource;

  let tabsModule = null;
  let helpBrowser = null;
  const fileCompare = window.registerMarkdownViewerFileCompare(app, {
    getFileName,
    normalizeEditorContent,
    languageRegistry,
    loadCodeMirrorBundle: loadDeferredCodeMirrorBundle,
    isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    openFileCompareInTab: function(compareDescriptor) {
      return tabsModule?.openFileCompareInTab?.(compareDescriptor) || null;
    },
    suppressFolderWatcher: function(milliseconds) {
      app.modules?.folderWatcher?.suppress?.(milliseconds);
    },
    reloadOpenTabsFromDisk: function(path) {
      return app.modules?.folderWatcher?.reloadOpenTabsFromDisk?.(path);
    },
    refreshWorkspaceGitStatus: function() {
      app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.();
    },
    markWorkspaceGitConflictResolved: function(filePath) {
      return app.modules?.workspaceGit?.markWorkspaceGitConflictResolved?.(filePath);
    },
    alert: function(message) { window.alert(message); }
  });

  apiClient = window.registerMarkdownViewerApiClient(app, {
    isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    localStorage,
    getProfileDataFilePath: recentItems.getProfileDataFilePath,
    getRecentHistoryLimit: function() { return getApiClientRecentHistoryLimit(); },
    getRequestSettings: function() { return getApiClientRequestSettings(); },
    saveRequestSettings: function(settings) { saveGlobalState({ apiClientRequestSettings: normalizeApiClientRequestSettings(settings) }); },
    copyTextToClipboard: copyTextToSystemClipboard,
    openApiClientInTab: function(options) {
      return tabsModule?.openApiClientInTab?.(options) || null;
    },
    refreshTabs: function() {
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    },
    setSidebarVisible,
    setSidebarView: function(view) { workspaceSearch?.setSidebarView?.(view); },
    getSidebarView: function() { return workspaceSearch?.getActiveSidebarView?.() || "files"; },
    alert: function(message) { window.alert(message); }
  });
  const regexTesterStorage = window.registerMarkdownViewerRegexTesterStorage(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    localStorage,
    getProfileDataFilePath: recentItems.getProfileDataFilePath
  });
  const regexTesterJavascriptEngine = window.registerMarkdownViewerRegexTesterJavascriptEngine(app);
  const regexTesterJavaEngine = window.registerMarkdownViewerRegexTesterJavaEngine(app, {
    isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    processRouter: spawnedProcessRouter,
    getAppRoot: function() { return typeof NL_PATH !== "undefined" ? NL_PATH : "."; }
  });
  regexTester = window.registerMarkdownViewerRegexTester(app, {
    storage: regexTesterStorage,
    javascriptEngine: regexTesterJavascriptEngine,
    javaEngine: regexTesterJavaEngine,
    explanation: window.RegexTesterExplanation,
    quickReference: window.RegexTesterQuickReference,
    copyTextToClipboard: copyTextToSystemClipboard,
    openRegexTesterInTab: function() {
      return tabsModule?.openRegexTesterInTab?.() || null;
    },
    alert: function(message) { window.alert(message); },
    setSidebarVisible,
    isSidebarVisible,
    setSidebarView: function(view) { workspaceSearch?.setSidebarView?.(view); },
    getActiveTab: function() { return tabsModule?.getActiveTab?.() || null; },
    getSidebarView: function() { return workspaceSearch?.getActiveSidebarView?.() || "files"; }
  });

  const tabViewManager = window.registerMarkdownViewerTabViewManager(app, {
    tabViewHost,
    legacyEditorSurface: legacyEditorTabView,
    largeFileViewer,
    filePreview,
    imageEditor,
    diagramEditor,
    hexEditor,
    fileCompare,
    apiClient,
    regexTester,
    editorViewManager
  });

  tabsModule = window.registerMarkdownViewerTabs(app, {
    sampleMarkdown,
    unsavedChanges,
    tabViewManager,
    diagramEditor,
    editorViewManager,
    activeEditorCommands,
    languageRegistry,
    createTabParseAsMenu: window.createMarkdownViewerTabParseAsMenu,
    contentContainer,
    appDebugLog,
    get activeTabId() { return activeTabId; },
    set activeTabId(value) { activeTabId = value; },
    get tabs() { return tabs; },
    set tabs(value) { tabs = value; },
    get untitledCounter() { return untitledCounter; },
    set untitledCounter(value) { untitledCounter = value; },
    get tabContextMenu() { return tabContextMenu; },
    set tabContextMenu(value) { tabContextMenu = value; },
    get tabContextTargetId() { return tabContextTargetId; },
    set tabContextTargetId(value) { tabContextTargetId = value; },
    get tabContextCloseMobileMenuOnAction() { return tabContextCloseMobileMenuOnAction; },
    set tabContextCloseMobileMenuOnAction(value) { tabContextCloseMobileMenuOnAction = value; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get markdownEditor() { return markdownEditor; },
    get graphRenderCache() { return graphRenderCache; },
    get graphViewCanvas() { return graphViewCanvas; },
    get folderTreeRoot() { return folderTreeRoot; },
    normalizeEditorContent,
    DEFAULT_GRAPH_VIEW_CONFIG,
    LARGE_GRAPH_DISPLAY_NODE_LIMIT,
    getGraphViewPreferenceDefaults,
    normalizeGraphDocument,
    deserializeGraphDocument,
    serializeGraphTab,
    get getFileIconClass() { return getFileIconClass; },
    tabHasUnsavedChanges,
    isFileBackedGraphTab,
    saveTabsToStorage,
    loadTabsFromStorage,
    saveActiveTabId,
    loadActiveTabId,
    get tabSessionPersistence() { return tabSessionPersistence; },
    get closedTabHistory() { return closedTabHistory; },
    loadUntitledCounter,
    saveUntitledCounter,
    getMaxOpenTabs,
    setViewMode,
    loadGlobalState,
    saveGlobalState,
    getStartupBehavior,
    resolveFileOpeningMode: fileOpeningModeSettings.resolveModeForSource,
    get setGraphViewMode() { return setGraphViewMode; },
    get renderGraphView() { return renderGraphView; },
    applySyntaxHighlightColorsForActiveLanguage,
    renderMarkdown,
    renderEditorSyntaxHighlights,
    refreshActiveResizeTarget,
    refreshEditorLineNumberResizeObserver,
    updateEditorLineNumbers,
    syncEditorSyntaxHighlightScroll,
    syncFolderTreeSelectionToActiveTab,
    findFolderTreeFileButtonForTab,
    get revealFolderTreeFileByPath() { return app.modules?.sidebarContextTree?.revealFolderTreeFileByPath; },
    setSidebarVisible,
    get hideSidebarContextMenus() { return hideSidebarContextMenus; },
    suspendActiveGraphRender,
    removeGraphRenderForTab,
    hideInactiveGraphRenders,
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    getActiveGraphTab,
    get updateStatusLine() { return updateStatusLine; },
    get updateDocumentStats() { return updateDocumentStats; },
    filePreview,
    imageEditor,
    hexEditor,
    saveActiveTabToSource,
    saveActiveTabWithSaveDialog,
    saveActiveFileTabAs,
    getMarkdownTabContentForSave,
    saveMarkdownTabToSource,
    saveMarkdownTabWithSaveDialog,
    saveGeneratedHtmlTabWithSaveDialog,
    saveActiveGraphToSource,
    saveActiveGraphWithSaveDialog,
    isKeepSavedGraphMode,
    get renameSidebarNodeOnDisk() { return renameSidebarNodeOnDisk; },
    openDocumentSourceFile,
    openFolderTreeFromNeutralinoPath,
    findGeneratedProjectFolderFromPath,
    getMarkdownTitleFromFileName,
    getFileName,
    createGraphFileDataFromNode,
    getGraphSnapshotFileEntries,
    joinPath,
    isPathInsideFolder,
    isNeutralinoRuntime,
    isMarkdownPath,
    isTextDocumentPath,
    isSupportedFolderTreeDocumentPath,
    get closeMobileMenu() { return closeMobileMenu; },
    readFolderMarkdownFileContent,
    getGraphFileEntryNodeId,
    promptForStaleSavedGraphIfNeeded,
    refreshGraphModeNoticesForTab,
    clearGraphTabUnsavedChanges,
    onActiveTabChanged: function(tab) {
      updateDiagramExportMenu(tab);
      applyWordWrapPreference(isWordWrapEnabled());
      updateWordWrapToggleButtons();
      updateEditorSortDialogButtons();
      applyDocumentWordAutocompletePreference();
      updateDocumentWordAutocompleteToggleButtons();
      void helpBrowser?.activateTab?.(tab);
      if (editorFindReplaceModal?.style.display === "flex") {
        window.requestAnimationFrame(positionEditorFindReplaceModal);
      }
      if (outlinePanel?.isVisible?.() && outlinePanel.supports?.(tab)) {
        sidebarLowerPanelTabs?.activate?.("outline", { persist: false });
      }
      window.requestAnimationFrame(function() { void outlinePanel?.refresh?.(tab); });
    }
  });
  const {    nextUntitledTitle,
    createTab,
    createGraphTab,
    normalizeOpenedSource,
    createOpenedSource,
    createOpenedSourceFromSourceFile,
    setTabOpenedSource,
    normalizeGraphScopePath,
    createFolderGraphScopeKey,
    getRootFolderGraphScopeKey,
    findExistingFolderGraphTab,
    focusExistingFolderGraphTab,
    getGraphTitleFromFileName,
    getGraphTabTitle,
    getTabDisplayName,
    getTabTooltipText,
    updateTabScrollControls,
    scrollTabsBy,
    setupTabScrolling,
    renderTabBar,
    renderMobileTabList,
    ensureTabContextMenu,
    positionTabContextMenu,
    setTabContextMenuActionEnabled,
    updateTabContextMenuActionStates,
    showTabContextMenu,
    hideTabContextMenu,
    saveCurrentTabState,
    markCurrentTabSessionDirty,
    getActiveMarkdownTab,
    canReloadActiveTabFromDisk,
    reloadActiveTabFromDisk,
    activeTabHasUnsavedChanges,
    getUnsavedTabs,
    updateSaveCurrentFileButtons,
    saveChangedTab,
    saveAllChangedTabs,
    saveCurrentFileIfChanged,
    setActiveMarkdownTabViewMode,
    restoreViewMode,
    setNoOpenTabsMode,
    switchTab,
    pinTemporaryTab,
    findTemporaryTab,
    applySidebarFileMetadata,
    isUnsupportedSourceFile,
    isUnsupportedFileTab,
    isPreviewableDocumentTab,
    isMarkdownDocumentTab,
    getActiveTab,
    getAllowedViewModeForActiveTab,
    getDefaultViewModeForOpenedFile,
    createLargeFileTab,
    createFilePreviewTab,
    createImageEditorTab,
    createDiagramEditorTab,
    createHexEditorTab,
    openLargeFileInTab,
    openFilePreviewInTab,
    openImageEditorInTab,
    openDiagramEditorInTab,
    openBlankDiagramEditorInTab,
    openHexEditorInTab,
    activateSidebarTab,
    openSidebarFileInTab,
    openSidebarFileInTemporaryTab,
    openSidebarFileInPermanentTab,
    findTabForSourceFile,
    findGraphTabForSourceFile,
    showSavedGraphMissingPathDialog,
    locateReplacementMarkdownFileForSavedGraphNode,
    openLocatedSavedGraphFile,
    removeSavedGraphNodeFromActiveTab,
    handleMissingSavedGraphNodePath,
    openGraphNodeFileInPermanentTab,
    newTab,
    closeTab,
    renameUnsourcedTabTitle,
    renameTab,
    duplicateTab,
    confirmCloseTabsIfNeeded,
    closeTabsByIds,
    closeOtherTabs,
    closeAllTabs,
    resetAllTabs,
    initTabs,
  } = tabsModule;
  const lineDelimiterConversion = window.registerMarkdownViewerLineDelimiterConversion(app, {
    filesystem: typeof Neutralino !== "undefined" ? Neutralino.filesystem : null
  });
  window.registerMarkdownViewerLineDelimiterDialog(app, {
    conversion: lineDelimiterConversion,
    activeEditorCommands,
    getWorkspacePath: function() { return activeFolderPath || ""; },
    getActiveTab: function() { return tabs.find(function(tab) { return tab.id === activeTabId; }) || null; },
    getActiveTabId: function() { return activeTabId; },
    getTabs: function() { return tabs; },
    getUnsavedTabs,
    saveChangedTab,
    saveAllChangedTabs,
    getDefaultExtensions: getSupportedTextExtensionsSetting,
    beforeApply: function() {
      app.modules?.folderWatcher?.suppress?.(5000);
    },
    persistTabs: function() {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    },
    onApplied: function() {
      void invalidateWorkspaceDerivedState({ reason: "line-delimiter-conversion" });
      app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.();
    },
    showResult: function(message) {
      window.alert(message);
    }
  });

  if (typeof window.registerMarkdownViewerAiCompanionEditorActionTools === "function") {
    aiCompanionEditorActionTools = window.registerMarkdownViewerAiCompanionEditorActionTools(app, {
      activeEditorCommands,
      fileSave,
      tabsModule,
      getTabs: function() { return tabs; },
      getActiveTabId: function() { return activeTabId; },
      getWorkspaceRoot: function() { return activeFolderPath || getDesktopAppRootPath(); },
      getFileName,
      joinPath,
      openDocumentSourceFile,
      focusEditorLine: function(line) {
        const offset = getEditorOffsetForLineNumber(line);
        setActiveEditorSelection(offset, offset);
        scrollEditorFindMatchIntoView({ start: offset, end: offset });
      },
      fileExists: async function(path) {
        if (!isNeutralinoRuntime() || !path || typeof Neutralino === "undefined" || !Neutralino?.filesystem?.getStats) return false;
        try {
          await Neutralino.filesystem.getStats(path);
          return true;
        } catch (_error) {
          return false;
        }
      }
    });
  }
  tabSessionPersistence = window.registerMarkdownViewerTabPersistence(app, {
    get activeTabId() { return activeTabId; },
    activeEditorCommands,
    createTab,
    createGraphTab,
    createLargeFileTab,
    createFilePreviewTab,
    createImageEditorTab,
    createDiagramEditorTab,
    createHexEditorTab,
    imageEditor,
    diagramEditor,
    hexEditor,
    serializeGraphTab,
    serializeGraphViewDocument,
    stripGraphSnapshotContent,
    isFileBackedGraphTab,
    normalizeEditorContent,
    getFileName,
    GRAPH_DOCUMENT_TYPE_VIEW,
    getProfileDataFilePath: recentItems.getProfileDataFilePath,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    appDebugLog
  });
  helpBrowser = window.registerMarkdownViewerHelpBrowser(app, {
    toolbar: document.getElementById("help-browser-toolbar"),
    backButton: document.getElementById("help-browser-back"),
    forwardButton: document.getElementById("help-browser-forward"),
    getActivePreviewPane: function() {
      return editorViewManager?.getActivePreviewPane?.() || previewPane;
    },
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    get newTab() { return newTab; },
    get switchTab() { return switchTab; },
    fetchBundledWikiMarkdown,
    fetchReadmeMarkdown,
    fetchLicenseMarkdown,
    normalizeBundledReadmeMarkdown,
    setActiveEditorContent: function(content) {
      activeEditorCommands.setActiveEditorValue(content);
    },
    renderMarkdown,
    renderTabBar,
    saveTabsToStorage,
    scrollMarkdownPreviewToHash,
    alert: function(message) { window.alert(message); }
  });
  helpBrowser.init();
  closedTabHistory = window.registerMarkdownViewerClosedTabHistory(app, {
    serializeTab: tabSessionPersistence.serializeTab,
    getLimit: getClosedTabHistoryLimit
  });

  function getNeutralinoGlobalValue(name) {
    if (name === "NL_PATH" && typeof NL_PATH !== "undefined") return NL_PATH;
    if (name === "NL_CWD" && typeof NL_CWD !== "undefined") return NL_CWD;
    return typeof window !== "undefined" ? window[name] : "";
  }
  if (editorFindReplaceExpandButton) {
    editorFindReplaceExpandButton.addEventListener("click", function() {
      setEditorFindReplaceExpanded(!editorFindReplaceExpanded);
      if (editorFindReplaceExpanded) editorReplaceInput?.focus();
      else editorFindInput?.focus();
    });
  }
  if (editorFindMatchCaseButton) {
    editorFindMatchCaseButton.addEventListener("click", function() {
      editorFindMatchCase = !editorFindMatchCase;
      updateEditorFindOptionButtons();
      refreshEditorFindMatches();
      editorFindInput?.focus();
    });
  }
  if (editorFindPreserveCaseButton) {
    editorFindPreserveCaseButton.addEventListener("click", function() {
      editorFindPreserveCase = !editorFindPreserveCase;
      updateEditorFindOptionButtons();
      editorReplaceInput?.focus();
    });
  }
  if (editorFindSelectionOnlyInput) {
    editorFindSelectionOnlyInput.addEventListener("change", function() {
      refreshEditorFindMatches();
      editorFindInput?.focus();
    });
  }

  function normalizeLocalPath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getDesktopAppRootPath() {
    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    const cwdPath = normalizeLocalPath(getNeutralinoGlobalValue("NL_CWD"));
    if (!basePath || basePath === "." || basePath === "./") return cwdPath || basePath;
    return basePath;
  }

  async function readBundledDesktopMarkdown(normalizedPath) {
    if (typeof NL_VERSION === "undefined" || typeof Neutralino === "undefined" || !Neutralino.filesystem?.readFile) {
      return null;
    }

    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    const cwdPath = normalizeLocalPath(getNeutralinoGlobalValue("NL_CWD"));
    const isHelpPath = String(normalizedPath || "").startsWith("help/");
    const candidates = [
      isHelpPath && basePath ? `${basePath}/${normalizedPath}` : "",
      isHelpPath && cwdPath ? `${cwdPath}/${normalizedPath}` : "",
      basePath ? `${basePath}/resources/${normalizedPath}` : "",
      cwdPath ? `${cwdPath}/resources/${normalizedPath}` : "",
      `resources/${normalizedPath}`,
      normalizedPath
    ].filter(Boolean);
    let lastError = null;

    for (const candidate of candidates) {
      try {
        return await Neutralino.filesystem.readFile(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  async function fetchBundledWikiMarkdown(wikiPath = "help/user/index.md") {
    const normalizedPath = String(wikiPath || "help/user/index.md").replace(/\\/g, "/").replace(/^\/+/, "");
    const desktopMarkdown = await readBundledDesktopMarkdown(normalizedPath);
    if (desktopMarkdown !== null) return desktopMarkdown;

    const helpPaths = [normalizedPath, `../${normalizedPath}`, `/${normalizedPath}`];
    let lastError = null;

    for (const path of helpPaths) {
      try {
        const response = await fetch(path, { cache: "no-cache" });
        if (response.ok) return response.text();
        lastError = new Error(`Help file request failed with ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Help file is unavailable.");
  }

  async function fetchBundledMarkdownFromCandidates(paths) {
    let lastError = null;
    for (const path of paths) {
      try {
        return await fetchBundledWikiMarkdown(path);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Help file is unavailable.");
  }

  async function fetchHelpHomeMarkdown() {
    return fetchBundledWikiMarkdown("help/user/index.md");
  }

  async function fetchReadmeMarkdown() {
    return fetchBundledMarkdownFromCandidates(["../../README.md", "README.md"]);
  }

  async function fetchLicenseMarkdown() {
    return fetchBundledMarkdownFromCandidates(["../../LICENSE", "LICENSE"]);
  }

  function normalizeBundledReadmeMarkdown(markdown) {
    return String(markdown || "").replace(/\]\(web-app\/assets\//g, "](assets/");
  }

  async function openHelpHome() {
    await helpBrowser.openHome();
  }

  async function openReadmePage() {
    try {
      const markdown = normalizeBundledReadmeMarkdown(await fetchReadmeMarkdown());
      newTab(markdown, "Readme", { viewMode: "preview", linkBasePath: "README.md" });
    } catch (error) {
      console.error("Failed to open readme:", error);
      alert("Unable to open the readme file.");
    }
  }

  async function openLicensePage() {
    try {
      const markdown = await fetchLicenseMarkdown();
      newTab(markdown, "License", { viewMode: "preview", linkBasePath: "LICENSE" });
    } catch (error) {
      console.error("Failed to open license:", error);
      alert("Unable to open the license file.");
    }
  }

  function openWelcomePage() {
    newTab(sampleMarkdown, "Welcome to MD-Editor", { viewMode: "preview" });
  }

  function closeOpenActionMenus() {
    const desktopActionMenuButton = document.getElementById("desktopActionMenu");
    if (desktopActionMenuButton && typeof bootstrap !== "undefined" && bootstrap?.Dropdown) {
      bootstrap.Dropdown.getOrCreateInstance(desktopActionMenuButton).hide();
    }
    document.querySelectorAll(".dropdown-menu.show, .action-submenu.show").forEach((menu) => {
      menu.classList.remove("show");
    });
    resetAdaptiveActionSubmenus();
    document.querySelectorAll('[aria-expanded="true"]').forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
    resetDesktopActionMenuSubmenus();
    closeMobileMenu();
  }

  function resetDesktopActionMenuSubmenus() {
    const desktopActionMenu = document.querySelector(".header-action-menu .action-menu");
    if (!desktopActionMenu) return;

    desktopActionMenu.querySelectorAll(".action-submenu").forEach((submenu) => {
      submenu.classList.remove("show");
      resetAdaptiveActionSubmenu(submenu);
    });
    desktopActionMenu.querySelectorAll('.action-menu-submenu > .dropdown-toggle[aria-expanded="true"]').forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });

    const activeElement = document.activeElement;
    if (activeElement && desktopActionMenu.contains(activeElement) && typeof activeElement.blur === "function") {
      activeElement.blur();
    }
  }

  function resetAdaptiveActionSubmenu(submenu) {
    if (!submenu) return;
    submenu.classList.remove("action-submenu-adaptive", "action-submenu-measuring");
    submenu.style.removeProperty("--action-submenu-left");
    submenu.style.removeProperty("--action-submenu-top");
    submenu.style.removeProperty("--action-submenu-max-height");
  }

  function resetAdaptiveActionSubmenus(root = document) {
    root.querySelectorAll(".action-submenu.action-submenu-adaptive, .action-submenu.action-submenu-measuring").forEach(resetAdaptiveActionSubmenu);
  }

  function getFixedPositionContainingBlockOffset(element) {
    let current = element?.parentElement || null;
    while (current && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const hasContainingBlockStyle = style.transform !== "none"
        || style.perspective !== "none"
        || style.filter !== "none"
        || style.backdropFilter !== "none"
        || /\b(layout|paint|strict|content)\b/.test(style.contain || "");
      if (hasContainingBlockStyle) {
        const rect = current.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
      }
      current = current.parentElement;
    }
    return { left: 0, top: 0 };
  }

  function positionAdaptiveActionSubmenu(submenuWrapper) {
    const submenu = submenuWrapper?.querySelector(":scope > .action-submenu");
    const trigger = submenuWrapper?.querySelector(":scope > .dropdown-toggle, :scope > .action-menu-item");
    if (!submenu || !trigger) return;
    if (submenuWrapper.parentElement?.id === "desktop-application-menu") {
      resetAdaptiveActionSubmenu(submenu);
      return;
    }

    const viewportPadding = 8;
    const submenuOverlap = 1;
    resetAdaptiveActionSubmenu(submenu);
    submenu.classList.add("action-submenu-adaptive", "action-submenu-measuring");
    submenu.style.setProperty("--action-submenu-left", "0px");
    submenu.style.setProperty("--action-submenu-top", "0px");
    submenu.style.removeProperty("--action-submenu-max-height");

    const triggerRect = trigger.getBoundingClientRect();
    const parentMenuRect = submenuWrapper.parentElement?.getBoundingClientRect?.() || triggerRect;
    const submenuRect = submenu.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const maxHeight = Math.max(120, viewportHeight - viewportPadding * 2);
    const submenuWidth = Math.min(submenuRect.width, Math.max(120, viewportWidth - viewportPadding * 2));
    const submenuHeight = Math.min(submenuRect.height, maxHeight);
    const appZoomFactor = Math.max(0.01, Number(viewWindowControls?.getZoomPercent?.() || 100) / 100);

    let left = parentMenuRect.right - submenuOverlap;
    if (left + submenuWidth > viewportWidth - viewportPadding) {
      left = parentMenuRect.left - submenuWidth + submenuOverlap;
    }
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - submenuWidth - viewportPadding));

    let top = triggerRect.top;
    if (top + submenuHeight > viewportHeight - viewportPadding) {
      top = triggerRect.bottom - submenuHeight;
    }
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - submenuHeight - viewportPadding));

    const containingBlockOffset = getFixedPositionContainingBlockOffset(submenu);
    submenu.style.setProperty("--action-submenu-left", `${Math.round((left - containingBlockOffset.left) / appZoomFactor)}px`);
    submenu.style.setProperty("--action-submenu-top", `${Math.round((top - containingBlockOffset.top) / appZoomFactor)}px`);
    submenu.style.setProperty("--action-submenu-max-height", `${Math.floor(maxHeight / appZoomFactor)}px`);
    submenu.classList.remove("action-submenu-measuring");
  }

  function installAdaptiveActionSubmenus() {
    const showSubmenu = (submenuWrapper) => {
      window.requestAnimationFrame(() => positionAdaptiveActionSubmenu(submenuWrapper));
    };
    const desktopActionMenuButton = document.getElementById("desktopActionMenu");
    if (desktopActionMenuButton) {
      desktopActionMenuButton.addEventListener("show.bs.dropdown", resetDesktopActionMenuSubmenus);
      desktopActionMenuButton.addEventListener("hidden.bs.dropdown", resetDesktopActionMenuSubmenus);
    }

    document.addEventListener("pointerover", (event) => {
      const submenuWrapper = event.target?.closest?.(".action-menu-submenu");
      if (!submenuWrapper || !submenuWrapper.contains(event.target)) return;
      showSubmenu(submenuWrapper);
    });

    document.addEventListener("focusin", (event) => {
      const submenuWrapper = event.target?.closest?.(".action-menu-submenu");
      if (submenuWrapper) showSubmenu(submenuWrapper);
    });

    document.addEventListener("pointerout", (event) => {
      const submenuWrapper = event.target?.closest?.(".action-menu-submenu");
      if (!submenuWrapper || submenuWrapper.contains(event.relatedTarget)) return;
      resetAdaptiveActionSubmenu(submenuWrapper.querySelector(":scope > .action-submenu"));
    });

    window.addEventListener("resize", () => resetAdaptiveActionSubmenus());
    window.addEventListener("scroll", () => resetAdaptiveActionSubmenus(), true);
  }

  function showAboutDialog() {
    if (!aboutModal) return;
    aboutModal.style.display = "flex";
  }

  function hideAboutDialog() {
    if (!aboutModal) return;
    aboutModal.style.display = "none";
  }

  async function stopDesktopTerminalsBeforeExit() {
    try {
      await app.modules?.desktopTerminal?.stopAllTerminals?.();
    } catch (error) {
      console.warn("Failed to stop terminal processes before exit:", error);
    }
  }

  async function stopLanguageServerProcessesBeforeExit() {
    try {
      await window.markdownViewerStopLanguageServerProcessesBeforeExit?.();
    } catch (error) {
      console.warn("Failed to stop language server processes before exit:", error);
    }
  }

  let applicationExitRequestInProgress = false;

  async function exitApplication() {
    if (applicationExitRequestInProgress) return false;
    applicationExitRequestInProgress = true;
    if (shouldConfirmExitApplication()) {
      const confirmed = await confirmWithAppModal("Are you sure you want to exit MD-Editor?", {
        title: "Exit MD-Editor",
        confirmLabel: "Exit"
      });
      if (!confirmed) {
        applicationExitRequestInProgress = false;
        return false;
      }
    }
    await flushCurrentTabSession();
    await regexTesterStorage.flush();
    await stopDesktopTerminalsBeforeExit();
    await stopLanguageServerProcessesBeforeExit();
    await flushDebugLogFileWrites();
    try {
      if (typeof Neutralino !== "undefined" && Neutralino?.app?.exit) {
        await Neutralino.app.exit();
        return true;
      }
    } catch (error) {
      console.error("Failed to exit the desktop app:", error);
    }
    window.close();
    return true;
  }

  window.markdownViewerRequestApplicationExit = exitApplication;

  function getDefaultAiApprovalPolicyText() {
    return JSON.stringify({ version: 1, allow: { write: [], command: [], test: [] } }, null, 2);
  }

  function getParentPath(filePath) {
    const normalizedPath = String(filePath || "");
    const index = Math.max(normalizedPath.lastIndexOf("\\"), normalizedPath.lastIndexOf("/"));
    return index > 0 ? normalizedPath.slice(0, index) : "";
  }

  async function ensureAiApprovalPolicyDirectory(filePath) {
    if (!filePath || !isNeutralinoRuntime() || !Neutralino?.filesystem?.createDirectory) return;
    const parent = getParentPath(filePath);
    const separator = parent.includes("\\") ? "\\" : "/";
    const normalizedParent = String(parent || "").replace(/[\\/]+/g, separator);
    const parts = normalizedParent.split(/[\\/]+/).filter(Boolean);
    let current = normalizedParent.startsWith(separator) ? separator : "";
    for (const part of parts) {
      current = current && current !== separator ? `${current}${separator}${part}` : (current === separator ? `${separator}${part}` : part);
      if (/^[A-Za-z]:$/.test(current)) continue;
      try {
        await Neutralino.filesystem.createDirectory(current);
      } catch (_error) {
        // Existing folders are fine; writeFile surfaces real failures.
      }
    }
  }

  async function getAiApprovalAppPolicyPath() {
    if (!isNeutralinoRuntime() || typeof recentItems.getProfileDataDirPath !== "function") return "";
    const profileDir = await recentItems.getProfileDataDirPath();
    return profileDir ? `${profileDir.replace(/[\\/]+$/, "")}${profileDir.includes("\\") ? "\\" : "/"}companion${profileDir.includes("\\") ? "\\" : "/"}approvals.json` : "";
  }

  function getAiApprovalFolderPolicyPath() {
    return activeFolderPath ? joinPath(activeFolderPath, ".md-editor", "companion", "approvals.local.json") : "";
  }

  async function readAiApprovalPolicyText(filePath) {
    if (!filePath || !isNeutralinoRuntime() || !Neutralino?.filesystem?.readFile) return getDefaultAiApprovalPolicyText();
    try {
      const text = await Neutralino.filesystem.readFile(filePath);
      return String(text || "").trim() || getDefaultAiApprovalPolicyText();
    } catch (_error) {
      return getDefaultAiApprovalPolicyText();
    }
  }

  function parseAiApprovalPolicyText(text, label) {
    try {
      const parsed = JSON.parse(String(text || "").trim() || getDefaultAiApprovalPolicyText());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Policy must be a JSON object.");
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      throw new Error(`${label} approval policy is not valid JSON: ${error?.message || String(error)}`);
    }
  }

  function updateApiClientProxySettingsFields() {
    if (settingsApiClientProxyUrlInput) settingsApiClientProxyUrlInput.disabled = settingsApiClientProxyModeInput?.value !== "custom";
  }

  function updateAiConnectionProviderFields() {
    const providerMode = settingsAiProviderModeInput?.value || "openai-compatible";
    const showLiteLlmFields = providerMode === "litellm";
    const showGeminiFields = providerMode === "gemini-connector" || providerMode === "gemini-connector-raw";
    settingsAiLiteLlmFields.forEach((field) => {
      field.hidden = !showLiteLlmFields;
    });
    settingsAiGeminiFields.forEach((field) => {
      field.hidden = !showGeminiFields;
    });
    settingsAiHttpProviderFields.forEach((field) => {
      field.hidden = showGeminiFields;
    });
    window.markdownViewerAiProviderPresets?.populateProviderModelSuggestions(providerMode, settingsAiModelOptionsList);
  }

  function applyAiConnectionProviderPreset() {
    const providerMode = settingsAiProviderModeInput?.value || "openai-compatible";
    window.markdownViewerAiProviderPresets?.applyProviderPresetSelection(providerMode, {
      baseUrlInput: settingsAiBaseUrlInput,
      modelInput: settingsAiModelInput,
      apiKeyInput: settingsAiApiKeyInput,
      modelOptionsList: settingsAiModelOptionsList,
      requestDelayInput: settingsAiProviderRequestDelayInput
    });
    updateAiConnectionProviderFields();
  }

  async function loadAiApprovalPoliciesForSettings() {
    if (settingsAiApprovalPolicyStatus) settingsAiApprovalPolicyStatus.textContent = "";
    const appPolicyPath = await getAiApprovalAppPolicyPath();
    const folderPolicyPath = getAiApprovalFolderPolicyPath();
    if (settingsAiApprovalAppPolicyPath) settingsAiApprovalAppPolicyPath.textContent = appPolicyPath || "Desktop profile unavailable";
    if (settingsAiApprovalFolderPolicyPath) settingsAiApprovalFolderPolicyPath.textContent = folderPolicyPath || "Open a folder to enable folder policy";
    if (settingsAiApprovalAppPolicyInput) {
      settingsAiApprovalAppPolicyInput.disabled = !appPolicyPath;
      settingsAiApprovalAppPolicyInput.value = await readAiApprovalPolicyText(appPolicyPath);
    }
    if (settingsAiApprovalFolderPolicyInput) {
      settingsAiApprovalFolderPolicyInput.disabled = !folderPolicyPath;
      settingsAiApprovalFolderPolicyInput.value = folderPolicyPath ? await readAiApprovalPolicyText(folderPolicyPath) : getDefaultAiApprovalPolicyText();
    }
  }

  async function writeAiApprovalPolicyFromSettings(filePath, text) {
    if (!filePath || !isNeutralinoRuntime() || !Neutralino?.filesystem?.writeFile) return;
    await ensureAiApprovalPolicyDirectory(filePath);
    await Neutralino.filesystem.writeFile(filePath, text);
  }

  async function saveAiApprovalPoliciesFromSettings() {
    const appPolicyPath = await getAiApprovalAppPolicyPath();
    const folderPolicyPath = getAiApprovalFolderPolicyPath();
    const appPolicyText = parseAiApprovalPolicyText(settingsAiApprovalAppPolicyInput?.value, "App");
    const folderPolicyText = parseAiApprovalPolicyText(settingsAiApprovalFolderPolicyInput?.value, "Folder");
    await writeAiApprovalPolicyFromSettings(appPolicyPath, appPolicyText);
    if (folderPolicyPath && settingsAiApprovalFolderPolicyInput?.disabled !== true) {
      await writeAiApprovalPolicyFromSettings(folderPolicyPath, folderPolicyText);
    }
  }
  function showSettingsDialog() {
    if (!settingsModal) return;
    if (settingsGraphAutoClusterThresholdInput) {
      settingsGraphAutoClusterThresholdInput.value = String(getGraphAutoClusterThreshold());
    }
    if (settingsGraphAutoClusterLargeMapsInput) {
      settingsGraphAutoClusterLargeMapsInput.checked = isGraphAutoClusterLargeMapsEnabled();
    }
    const largeMapHoverPreferences = getLargeMapHoverPreferences();
    if (settingsGraphLargeHoverDimInput) {
      settingsGraphLargeHoverDimInput.checked = largeMapHoverPreferences.dimOtherNodes;
    }
    if (settingsGraphLargeHoverLabelsInput) {
      settingsGraphLargeHoverLabelsInput.checked = largeMapHoverPreferences.showConnectedLabels;
    }
    if (settingsGraphLargeHoverLinesInput) {
      settingsGraphLargeHoverLinesInput.checked = largeMapHoverPreferences.highlightConnectedLines;
    }
    if (settingsGraphRenderWarningThresholdInput) {
      settingsGraphRenderWarningThresholdInput.value = String(getGraphRenderWarningThreshold());
    }
    if (settingsGraphMostReferencedPercentInput) {
      settingsGraphMostReferencedPercentInput.value = String(getGraphMostReferencedPercent());
    }
    if (settingsGraphStaticWarmupTicksInput) {
      settingsGraphStaticWarmupTicksInput.value = String(getGraphStaticWarmupTicks());
    }
    if (settingsGraphShowFileExtensionsInput) {
      settingsGraphShowFileExtensionsInput.checked = getGraphShowFileExtensions();
    }
    const graphColorSchemes = {
      light: normalizeGraphColorScheme("light"),
      dark: normalizeGraphColorScheme("dark")
    };
    settingsGraphColorInputs.forEach((input) => {
      const mode = getGraphThemeMode(input.dataset.graphColorMode);
      const key = input.dataset.graphColorKey;
      if (!Object.prototype.hasOwnProperty.call(graphColorSchemes[mode], key)) return;
      input.value = getGraphColorInputValue(graphColorSchemes[mode][key]);
    });
    if (settingsConfirmCancelBackgroundProcessInput) {
      settingsConfirmCancelBackgroundProcessInput.checked = shouldConfirmCancelBackgroundProcess();
    }
    if (settingsConfirmExitApplicationInput) {
      settingsConfirmExitApplicationInput.checked = shouldConfirmExitApplication();
    }
    if (settingsConfirmOpenManyGraphNodesInput) {
      settingsConfirmOpenManyGraphNodesInput.checked = shouldConfirmOpenManyGraphNodes();
    }
    if (settingsConfirmDeleteFilesInput) {
      settingsConfirmDeleteFilesInput.checked = shouldConfirmDeleteFiles();
    }
    if (settingsConfirmMoveFilesInput) {
      settingsConfirmMoveFilesInput.checked = shouldConfirmMoveFiles();
    }
    if (settingsConfirmResetStateInput) {
      settingsConfirmResetStateInput.checked = shouldConfirmResetState();
    }
    if (settingsConfirmResetJdtWorkspaceInput) {
      settingsConfirmResetJdtWorkspaceInput.checked = shouldConfirmResetJdtWorkspace();
    }
    if (settingsConfirmJavaBuildPathRebuildInput) {
      settingsConfirmJavaBuildPathRebuildInput.checked = shouldConfirmJavaBuildPathRebuild();
    }
    if (settingsConfirmEditedPromptAttachmentRemovalInput) {
      settingsConfirmEditedPromptAttachmentRemovalInput.checked = shouldConfirmEditedPromptAttachmentRemoval();
    }
    if (settingsMaxOpenTabsInput) {
      settingsMaxOpenTabsInput.value = String(getMaxOpenTabs());
    }
    if (settingsMaxRecentFilesInput) {
      settingsMaxRecentFilesInput.value = String(getMaxRecentFiles());
    }
    if (settingsMaxRecentFoldersInput) {
      settingsMaxRecentFoldersInput.value = String(getMaxRecentFolders());
    }
    if (settingsClosedTabHistoryLimitInput) {
      settingsClosedTabHistoryLimitInput.value = String(getClosedTabHistoryLimit());
    }
    if (settingsApiClientRecentHistoryLimitInput) {
      settingsApiClientRecentHistoryLimitInput.value = String(getApiClientRecentHistoryLimit());
    }
    const apiClientRequestSettings = getApiClientRequestSettings();
    if (settingsApiClientAutoFollowRedirectsInput) settingsApiClientAutoFollowRedirectsInput.checked = apiClientRequestSettings.autoFollowRedirects;
    if (settingsApiClientMaxRedirectsInput) settingsApiClientMaxRedirectsInput.value = String(apiClientRequestSettings.maxRedirects);
    if (settingsApiClientPreserveMethodOnRedirectInput) settingsApiClientPreserveMethodOnRedirectInput.checked = apiClientRequestSettings.preserveMethodOnRedirect;
    if (settingsApiClientRedirectAuthHeaderPolicyInput) settingsApiClientRedirectAuthHeaderPolicyInput.value = apiClientRequestSettings.redirectAuthHeaderPolicy;
    if (settingsApiClientRedirectCustomHeaderPolicyInput) settingsApiClientRedirectCustomHeaderPolicyInput.value = apiClientRequestSettings.redirectCustomHeaderPolicy;
    if (settingsApiClientTimeoutInput) settingsApiClientTimeoutInput.value = String(apiClientRequestSettings.timeoutMs);
    if (settingsApiClientSslVerificationInput) settingsApiClientSslVerificationInput.checked = apiClientRequestSettings.sslCertificateVerification;
    if (settingsApiClientCookieJarInput) settingsApiClientCookieJarInput.checked = apiClientRequestSettings.cookieJarEnabled;
    if (settingsApiClientSendNoCacheInput) settingsApiClientSendNoCacheInput.checked = apiClientRequestSettings.sendNoCacheHeader;
    if (settingsApiClientMaxResponseSizeInput) settingsApiClientMaxResponseSizeInput.value = String(Math.ceil(apiClientRequestSettings.maxResponseSizeBytes / 1024 / 1024));
    if (settingsApiClientResponseRenderModeInput) settingsApiClientResponseRenderModeInput.value = apiClientRequestSettings.responseRenderMode;
    if (settingsApiClientDecompressResponsesInput) settingsApiClientDecompressResponsesInput.checked = apiClientRequestSettings.decompressResponses;
    if (settingsApiClientProxyModeInput) settingsApiClientProxyModeInput.value = apiClientRequestSettings.proxyMode;
    if (settingsApiClientProxyUrlInput) settingsApiClientProxyUrlInput.value = apiClientRequestSettings.proxyUrl;
    if (settingsApiClientHttpVersionInput) settingsApiClientHttpVersionInput.value = apiClientRequestSettings.httpVersion;
    updateApiClientProxySettingsFields();
    if (settingsWorkspaceSearchResultLimitInput) {
      settingsWorkspaceSearchResultLimitInput.value = String(getWorkspaceSearchResultLimit());
    }
    if (settingsJdtMaximumProblemsInput) {
      settingsJdtMaximumProblemsInput.value = String(getJdtMaximumProblems());
    }
    if (settingsJdtInitialProblemLimitInput) {
      settingsJdtInitialProblemLimitInput.value = String(getJdtInitialProblemLimit());
    }
    if (settingsAjdtDiagnosticsEnabledInput) {
      settingsAjdtDiagnosticsEnabledInput.checked = isAjdtDiagnosticsEnabled();
    }
    if (settingsSupportedTextExtensionsInput) {
      settingsSupportedTextExtensionsInput.value = getSupportedTextExtensionsSetting();
    }
    if (settingsContextMenuTooltipDelayInput) {
      settingsContextMenuTooltipDelayInput.value = String(getContextMenuTooltipDelayMs());
    }
    if (settingsMenuLayoutInput) {
      settingsMenuLayoutInput.value = applicationMenu?.getLayout?.() || "full";
    }
    if (settingsAppHeaderSpacingInput) {
      settingsAppHeaderSpacingInput.value = getAppHeaderSpacing();
    }
    if (settingsSidebarRailStyleInput) {
      settingsSidebarRailStyleInput.value = getSidebarRailStyle();
    }
    const sidebarRailIconVisibility = sidebarRailPreferences.normalizeVisibility(loadGlobalState().sidebarRailIconVisibility);
    if (settingsSidebarRailShowGitInput) settingsSidebarRailShowGitInput.checked = sidebarRailIconVisibility.git;
    if (settingsSidebarRailShowApiClientInput) settingsSidebarRailShowApiClientInput.checked = sidebarRailIconVisibility["api-client"];
    if (settingsSidebarRailShowRegexTesterInput) settingsSidebarRailShowRegexTesterInput.checked = sidebarRailIconVisibility["regex-tester"];
    if (settingsSidebarRailShowAiCompanionInput) settingsSidebarRailShowAiCompanionInput.checked = sidebarRailIconVisibility["ai-companion"];
    if (settingsSidebarRailShowSettingsInput) settingsSidebarRailShowSettingsInput.checked = sidebarRailIconVisibility.settings;
    if (settingsTabStyleInput) {
      settingsTabStyleInput.value = getTabStyle();
    }
    if (settingsStartupBehaviorInput) {
      settingsStartupBehaviorInput.value = getStartupBehavior();
    }
    if (settingsRestoreLastFolderOnStartupInput) {
      settingsRestoreLastFolderOnStartupInput.checked = shouldRestoreLastFolderOnStartup();
    }
    if (settingsShowGitFolderInput) {
      settingsShowGitFolderInput.checked = shouldShowGitProjectFolder();
    }
    if (settingsShowMdEditorFolderInput) {
      settingsShowMdEditorFolderInput.checked = shouldShowMdEditorProjectFolder();
    }
    if (settingsHiddenFolderNamesInput) {
      settingsHiddenFolderNamesInput.value = getHiddenFolderNamesSetting();
    }
    if (settingsFolderTreeExpandLimitThresholdInput) {
      settingsFolderTreeExpandLimitThresholdInput.value = String(getFolderTreeExpandLimitThreshold());
    }
    if (settingsFolderTreeExpandLimitDepthInput) {
      settingsFolderTreeExpandLimitDepthInput.value = String(getFolderTreeExpandLimitDepth());
    }
    const externalFileChangeBehavior = getExternalFileChangeBehavior();
    settingsExternalFileChangeBehaviorInputs.forEach((input) => {
      input.checked = input.value === externalFileChangeBehavior;
    });
    if (settingsEditorFontFamilyInput) {
      settingsEditorFontFamilyInput.value = getEditorFontFamily();
    }
    if (settingsEditorFontSizeInput) {
      settingsEditorFontSizeInput.value = String(getEditorFontSize());
    }
    if (settingsJdtInteractiveRequestTimeoutInput) {
      settingsJdtInteractiveRequestTimeoutInput.value = String(getJdtInteractiveRequestTimeoutMs());
    }
    if (settingsSpacesPerIndentLevelInput) {
      settingsSpacesPerIndentLevelInput.value = String(getSpacesPerIndentLevel());
    }
    if (settingsTabsPerIndentLevelInput) {
      settingsTabsPerIndentLevelInput.value = String(getTabsPerIndentLevel());
    }
    if (settingsDocumentWordAutocompleteInput) {
      settingsDocumentWordAutocompleteInput.checked = isDocumentWordAutocompleteEnabled();
    }
    if (settingsLanguageAutocompleteInput) {
      settingsLanguageAutocompleteInput.checked = isLanguageAutocompleteEnabled();
    }
    if (settingsLanguageServerAutocompleteInput) {
      settingsLanguageServerAutocompleteInput.checked = isLanguageServerAutocompleteEnabled();
    }
    if (settingsSnippetAutocompleteInput) {
      settingsSnippetAutocompleteInput.checked = isSnippetAutocompleteEnabled();
    }
    if (settingsUnclosedBracketHighlightInput) {
      settingsUnclosedBracketHighlightInput.checked = isUnclosedBracketHighlightEnabled();
    }
    const aiSettings = getAiCompanionSettings();
    if (settingsAiEnabledInput) settingsAiEnabledInput.checked = aiSettings.enabled;
    if (settingsAiIntentContractsEnabledInput) settingsAiIntentContractsEnabledInput.checked = aiSettings.intentContractsEnabled === true;
    if (settingsAiIntentSteeringEnabledInput) settingsAiIntentSteeringEnabledInput.checked = aiSettings.intentCompletionSteeringEnabled !== false;
    if (settingsAiIntentMaxRevisionsInput) settingsAiIntentMaxRevisionsInput.value = aiSettings.intentMaxCompletionRevisions ?? 3;
    if (settingsAiProviderModeInput) settingsAiProviderModeInput.value = aiSettings.providerMode;
    if (settingsAiBaseUrlInput) settingsAiBaseUrlInput.value = aiSettings.baseUrl;
    if (settingsAiApiKeyInput) settingsAiApiKeyInput.value = aiSettings.apiKey;
    if (settingsAiModelInput) settingsAiModelInput.value = aiSettings.model;
    if (settingsAiProviderRequestDelayInput) settingsAiProviderRequestDelayInput.value = String(aiSettings.providerRequestDelayMs);
    if (settingsAiMaxTokensPerChatMinuteInput) settingsAiMaxTokensPerChatMinuteInput.value = String(aiSettings.maxTokensPerChatMinute);
    if (settingsAiMaxTasksPerChatInput) settingsAiMaxTasksPerChatInput.value = String(aiSettings.maxTasksPerChat);
    if (settingsAiAgentMaxResponseTokensInput) settingsAiAgentMaxResponseTokensInput.value = String(aiSettings.agentMaxResponseTokens);
    if (settingsAiInputSubmitModeInput) settingsAiInputSubmitModeInput.value = aiSettings.inputSubmitMode;
    if (settingsAiLiteLlmAliasInput) settingsAiLiteLlmAliasInput.value = aiSettings.litellmModelAlias;
    if (settingsAiLiteLlmRoutingInput) settingsAiLiteLlmRoutingInput.value = aiSettings.litellmRoutingConfig;
    if (settingsAiGeminiBaseUrlInput) settingsAiGeminiBaseUrlInput.value = aiSettings.geminiConnectorBaseUrl;
    if (settingsAiGeminiConnectorIdInput) settingsAiGeminiConnectorIdInput.value = aiSettings.geminiConnectorId;
    if (settingsAiGeminiApiKeyInput) settingsAiGeminiApiKeyInput.value = aiSettings.geminiConnectorApiKey;
    updateAiConnectionProviderFields();
    if (settingsAiChatEnabledInput) settingsAiChatEnabledInput.checked = aiSettings.chatEnabled;
    if (settingsAiAutocompleteEnabledInput) settingsAiAutocompleteEnabledInput.checked = aiSettings.autocompleteEnabled;
    if (settingsAiAgentEnabledInput) settingsAiAgentEnabledInput.checked = aiSettings.agentEnabled;
    if (settingsAiGitSummaryEnabledInput) settingsAiGitSummaryEnabledInput.checked = aiSettings.gitSummaryEnabled;
    if (settingsAiShowReasoningInput) settingsAiShowReasoningInput.checked = aiSettings.showReasoning !== false;
    if (settingsAiAutocompleteLineEnabledInput) settingsAiAutocompleteLineEnabledInput.checked = aiSettings.autocompleteLineEnabled;
    if (settingsAiAutocompleteBlockEnabledInput) settingsAiAutocompleteBlockEnabledInput.checked = aiSettings.autocompleteBlockEnabled;
    if (settingsAiAutocompleteCommentEnabledInput) settingsAiAutocompleteCommentEnabledInput.checked = aiSettings.autocompleteCommentEnabled;
    if (settingsAiAutocompleteIdleMsInput) settingsAiAutocompleteIdleMsInput.value = String(aiSettings.autocompleteIdleMs);
    if (settingsAiAutocompleteBlockIdleMsInput) settingsAiAutocompleteBlockIdleMsInput.value = String(aiSettings.autocompleteBlockIdleMs);
    if (settingsAiAutocompleteCommentIdleMsInput) settingsAiAutocompleteCommentIdleMsInput.value = String(aiSettings.autocompleteCommentIdleMs);
    if (settingsAiAutocompleteRejectCharsInput) settingsAiAutocompleteRejectCharsInput.value = String(aiSettings.autocompleteRejectCharacters);
    if (settingsAiAutocompleteRejectDelayInput) settingsAiAutocompleteRejectDelayInput.value = String(aiSettings.autocompleteRejectDelayMs);
    if (settingsAiAutocompletePrefixLinesInput) settingsAiAutocompletePrefixLinesInput.value = String(aiSettings.autocompletePrefixLines);
    if (settingsAiAutocompleteSuffixLinesInput) settingsAiAutocompleteSuffixLinesInput.value = String(aiSettings.autocompleteSuffixLines);
    if (settingsAiAutocompleteModelFamilyInput) settingsAiAutocompleteModelFamilyInput.value = aiSettings.autocompleteModelFamily;
    if (settingsAiAutocompleteContextProvidersEnabledInput) settingsAiAutocompleteContextProvidersEnabledInput.checked = aiSettings.autocompleteContextProvidersEnabled;
    if (settingsAiAgentAutoRunCommandsInput) settingsAiAgentAutoRunCommandsInput.checked = aiSettings.agentAutoRunCommands;
    aiSecuritySettings?.apply?.(aiSettings.aiSecurityPolicy, aiSettings.agentAutoRunCommands);
    if (settingsAiAgentConfirmBeforeWriteInput) settingsAiAgentConfirmBeforeWriteInput.checked = true;
    void loadAiApprovalPoliciesForSettings();
    void aiApprovalSettings?.refresh?.();
    if (settingsAiConnectionStatus) settingsAiConnectionStatus.textContent = "";
    const languageServerAutoStartPreferences = getLanguageServerAutoStartPreferences();
    if (settingsLspTypeScriptAutoStartInput) settingsLspTypeScriptAutoStartInput.checked = languageServerAutoStartPreferences.typescript;
    if (settingsLspJavaAutoStartInput) settingsLspJavaAutoStartInput.checked = languageServerAutoStartPreferences.java;
    if (settingsLspKotlinAutoStartInput) settingsLspKotlinAutoStartInput.checked = languageServerAutoStartPreferences.kotlin;
    if (settingsLspXmlAutoStartInput) settingsLspXmlAutoStartInput.checked = languageServerAutoStartPreferences.xml;
    if (settingsLspPythonAutoStartInput) settingsLspPythonAutoStartInput.checked = languageServerAutoStartPreferences.python;
    if (settingsLspHtmlAutoStartInput) settingsLspHtmlAutoStartInput.checked = languageServerAutoStartPreferences.html;
    if (settingsLspCssAutoStartInput) settingsLspCssAutoStartInput.checked = languageServerAutoStartPreferences.css;
    if (settingsLspJsonAutoStartInput) settingsLspJsonAutoStartInput.checked = languageServerAutoStartPreferences.json;
    if (settingsLspYamlAutoStartInput) settingsLspYamlAutoStartInput.checked = languageServerAutoStartPreferences.yaml;
    if (settingsLspBashAutoStartInput) settingsLspBashAutoStartInput.checked = languageServerAutoStartPreferences.bash;
    if (settingsLspDockerfileAutoStartInput) settingsLspDockerfileAutoStartInput.checked = languageServerAutoStartPreferences.dockerfile;
    if (settingsLspWindowsScriptingAutoStartInput) settingsLspWindowsScriptingAutoStartInput.checked = languageServerAutoStartPreferences["windows-scripting"];
    settingsSnippetPreferencesDraft = snippetRegistry?.cloneSnippetPreferences
      ? snippetRegistry.cloneSnippetPreferences(getEditorSnippetPreferences())
      : getEditorSnippetPreferences();
    renderSettingsSnippets();
    void renderSettingsLanguageServers();
    settingsJavaConverterJdksDraft = getJavaConverterJdks();
    renderSettingsJdkTable();
    settingsGradleInstallationsDraft = getJavaConverterGradleInstallations();
    const gradleMode = getJavaConverterGradleMode();
    settingsGradleModeInputs.forEach((input) => {
      input.checked = input.value === gradleMode;
    });
    if (settingsGradleOfflineInput) {
      settingsGradleOfflineInput.checked = isJavaConverterGradleOffline();
    }
    if (settingsGradleMetadataFailureInput) {
      settingsGradleMetadataFailureInput.value = getJavaConverterGradleMetadataFailure();
    }
    if (settingsGradleUserHomeInput) {
      settingsGradleUserHomeInput.value = getJavaConverterGradleUserHome();
    }
    renderSettingsGradleTable();
    const debugPreferences = getDebugPreferences();
    if (settingsDebugEnabledInput) {
      settingsDebugEnabledInput.checked = debugPreferences.enabled;
    }
    if (settingsDebugWriteFileInput) {
      settingsDebugWriteFileInput.checked = debugPreferences.writeToFile;
    }
    if (settingsDebugLevelInput) {
      settingsDebugLevelInput.value = debugPreferences.level;
    }
    if (settingsDebugLogPathInput) {
      settingsDebugLogPathInput.value = debugPreferences.logPath;
    }
    if (settingsDebugMaxLogSizeInput) {
      settingsDebugMaxLogSizeInput.value = String(debugPreferences.maxLogSizeMb);
    }
    if (settingsDebugMaxLogFilesInput) {
      settingsDebugMaxLogFilesInput.value = String(debugPreferences.maxLogFiles);
    }
    applyDebugCategoryInputs(debugPreferences.categories);
    if (settingsDebugAiFullPayloadsInput) settingsDebugAiFullPayloadsInput.checked = aiSettings.debugLogFullAiPayloads === true;
    appThemeDraft = createNormalizedThemeDraft();
    renderThemeSettings();
    applyAppThemeDraftPreview();
    syntaxHighlightColorDraft = cloneSyntaxHighlightColors();
    populateSyntaxLanguageOptions();
    renderSyntaxColorSettings();
    keyboardShortcutsSettings?.open?.(loadGlobalState().keyboardShortcutOverrides);
    applySettingsControlTooltips();
    fileOpeningModeSettings.open();
    settingsModal.style.display = "flex";
    if (settingsScreen) {
      settingsScreen.open();
    } else {
      settingsGraphAutoClusterThresholdInput?.focus();
      settingsGraphAutoClusterThresholdInput?.select();
    }
  }

  function hideSettingsDialog() {
    if (!settingsModal) return;
    if (settingsDialogSaving) return;
    closeSyntaxEditorLayer();
    settingsModal.style.display = "none";
    syntaxHighlightColorDraft = null;
    appThemeDraft = null;
    settingsSnippetPreferencesDraft = null;
    keyboardShortcutsSettings?.discard?.();
    fileOpeningModeSettings.discard();
    restoreSavedAppTheme();
    applySyntaxHighlightColorsForActiveLanguage();
    renderEditorSyntaxHighlights();
    renderMarkdown();
  }

  function setSettingsDialogSaving(isSaving) {
    settingsDialogSaving = !!isSaving;
    if (settingsModal) {
      settingsModal.classList.toggle("settings-modal-saving", settingsDialogSaving);
      settingsModal.setAttribute("aria-busy", settingsDialogSaving ? "true" : "false");
    }
    const controls = settingsModal?.querySelectorAll("input, button, select, textarea") || [];
    controls.forEach((control) => {
      control.disabled = settingsDialogSaving;
    });
    if (settingsModalSave) {
      settingsModalSave.textContent = settingsDialogSaving ? "Saving..." : settingsModalSaveDefaultText;
    }
  }

  function getSettingsSnippetLanguages() {
    return snippetRegistry?.getSupportedLanguages?.() || [];
  }

  function getSettingsSnippetRows() {
    return snippetRegistry?.getSnippetRows?.(settingsSnippetLanguageId, settingsSnippetPreferencesDraft) || [];
  }

  function renderSettingsSnippetLanguages() {
    if (!settingsSnippetLanguageInput) return;
    const languages = getSettingsSnippetLanguages();
    settingsSnippetLanguageInput.innerHTML = "";
    languages.forEach((language) => {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      settingsSnippetLanguageInput.append(option);
    });
    if (!languages.some((language) => language.id === settingsSnippetLanguageId)) {
      settingsSnippetLanguageId = languages[0]?.id || "javascript";
    }
    settingsSnippetLanguageInput.value = settingsSnippetLanguageId;
  }

  function getSettingsSelectedSnippet() {
    return getSettingsSnippetRows().find((snippet) => snippet.id === settingsSelectedSnippetId) || null;
  }

  function selectSettingsSnippet(snippetId) {
    const rows = getSettingsSnippetRows();
    const selected = rows.find((snippet) => snippet.id === snippetId) || rows[0] || null;
    settingsSelectedSnippetId = selected?.id || "";
    hydrateSettingsSnippetEditor(selected);
    renderSettingsSnippetList();
  }

  function renderSettingsSnippetList() {
    if (!settingsSnippetList) return;
    settingsSnippetList.innerHTML = "";
    const rows = getSettingsSnippetRows();
    if (rows.length && !rows.some((snippet) => snippet.id === settingsSelectedSnippetId)) {
      settingsSelectedSnippetId = rows[0].id;
    }
    rows.forEach((snippet) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "settings-table-row";
      row.setAttribute("role", "row");
      row.dataset.snippetId = snippet.id;
      row.classList.toggle("active", snippet.id === settingsSelectedSnippetId);
      row.innerHTML = `
        <span role="cell">${escapeHtml(snippet.label || snippet.id)}</span>
        <span role="cell">${escapeHtml(snippet.detail || snippet.source)}</span>
        <span role="cell">${snippet.enabled === false ? "Off" : "On"}</span>
      `;
      row.addEventListener("click", () => selectSettingsSnippet(snippet.id));
      settingsSnippetList.append(row);
    });
  }

  function hydrateSettingsSnippetEditor(snippet) {
    const hasSnippet = !!snippet;
    if (settingsSnippetLabelInput) settingsSnippetLabelInput.value = snippet?.label || "";
    if (settingsSnippetDetailInput) settingsSnippetDetailInput.value = snippet?.detail || "";
    if (settingsSnippetTypeInput) settingsSnippetTypeInput.value = snippet?.type || "keyword";
    if (settingsSnippetEnabledInput) settingsSnippetEnabledInput.checked = snippet?.enabled !== false;
    if (settingsSnippetTemplateInput) settingsSnippetTemplateInput.value = snippet?.template || "";
    [
      settingsSnippetLabelInput,
      settingsSnippetDetailInput,
      settingsSnippetTypeInput,
      settingsSnippetEnabledInput,
      settingsSnippetTemplateInput,
      settingsSnippetSaveButton
    ].forEach((control) => {
      if (control) control.disabled = !hasSnippet;
    });
    if (settingsSnippetResetButton) {
      settingsSnippetResetButton.disabled = !hasSnippet || snippet.source !== "builtin" || !snippet.hasOverride;
    }
    if (settingsSnippetDeleteButton) {
      settingsSnippetDeleteButton.disabled = !hasSnippet || snippet.source !== "custom";
    }
  }

  function collectSettingsSnippetForm() {
    const current = getSettingsSelectedSnippet();
    if (!current) return null;
    const label = String(settingsSnippetLabelInput?.value || "").trim();
    const template = String(settingsSnippetTemplateInput?.value || "");
    if (!label) {
      alert("Enter a snippet name.");
      settingsSnippetLabelInput?.focus();
      return null;
    }
    if (!template.trim()) {
      alert("Enter a snippet template.");
      settingsSnippetTemplateInput?.focus();
      return null;
    }
    return {
      id: current.id,
      label,
      detail: String(settingsSnippetDetailInput?.value || "").trim(),
      type: String(settingsSnippetTypeInput?.value || "keyword").trim() || "keyword",
      template,
      enabled: settingsSnippetEnabledInput?.checked !== false
    };
  }

  function hasSettingsSnippetFormChanges(snippet) {
    if (!snippet) return false;
    return String(settingsSnippetLabelInput?.value || "").trim() !== String(snippet.label || "").trim()
      || String(settingsSnippetDetailInput?.value || "").trim() !== String(snippet.detail || "").trim()
      || (String(settingsSnippetTypeInput?.value || "keyword").trim() || "keyword") !== String(snippet.type || "keyword").trim()
      || String(settingsSnippetTemplateInput?.value || "") !== String(snippet.template || "")
      || (settingsSnippetEnabledInput?.checked !== false) !== (snippet.enabled !== false);
  }

  function saveSettingsSnippet() {
    if (!snippetRegistry) return;
    const snippet = collectSettingsSnippetForm();
    if (!snippet) return;
    settingsSnippetPreferencesDraft = snippetRegistry.saveSnippet(settingsSnippetPreferencesDraft, settingsSnippetLanguageId, snippet);
    settingsSelectedSnippetId = snippet.id;
    renderSettingsSnippetList();
    hydrateSettingsSnippetEditor(getSettingsSelectedSnippet());
  }

  function addSettingsSnippet() {
    if (!snippetRegistry) return;
    const snippet = snippetRegistry.createCustomSnippet();
    settingsSnippetPreferencesDraft = snippetRegistry.saveSnippet(settingsSnippetPreferencesDraft, settingsSnippetLanguageId, snippet);
    settingsSelectedSnippetId = snippet.id;
    renderSettingsSnippetList();
    hydrateSettingsSnippetEditor(getSettingsSelectedSnippet());
    settingsSnippetLabelInput?.focus();
    settingsSnippetLabelInput?.select();
  }

  function resetSettingsSnippet() {
    const current = getSettingsSelectedSnippet();
    if (!snippetRegistry || !current || current.source !== "builtin") return;
    settingsSnippetPreferencesDraft = snippetRegistry.resetBuiltinSnippet(settingsSnippetPreferencesDraft, settingsSnippetLanguageId, current.id);
    settingsSelectedSnippetId = current.id;
    renderSettingsSnippetList();
    hydrateSettingsSnippetEditor(getSettingsSelectedSnippet());
  }

  function deleteSettingsSnippet() {
    const current = getSettingsSelectedSnippet();
    if (!snippetRegistry || !current || current.source !== "custom") return;
    settingsSnippetPreferencesDraft = snippetRegistry.deleteCustomSnippet(settingsSnippetPreferencesDraft, settingsSnippetLanguageId, current.id);
    const nextSnippet = getSettingsSnippetRows()[0] || null;
    settingsSelectedSnippetId = nextSnippet?.id || "";
    renderSettingsSnippetList();
    hydrateSettingsSnippetEditor(nextSnippet);
  }

  function renderSettingsSnippets() {
    if (!snippetRegistry) return;
    renderSettingsSnippetLanguages();
    const rows = getSettingsSnippetRows();
    if (!rows.some((snippet) => snippet.id === settingsSelectedSnippetId)) {
      settingsSelectedSnippetId = rows[0]?.id || "";
    }
    renderSettingsSnippetList();
    hydrateSettingsSnippetEditor(getSettingsSelectedSnippet());
  }

  function getSettingsLanguageServerRows() {
    return [
      {
        id: "typescript",
        label: "TypeScript",
        statusElement: settingsLspTypeScriptStatus,
        pathElement: settingsLspTypeScriptPath,
        detailElement: settingsLspTypeScriptDetail,
        actionsButton: settingsLspTypeScriptActionsButton,
        actionsMenu: settingsLspTypeScriptActionsMenu,
        toggleButton: settingsLspTypeScriptToggleButton,
        autoStartInput: settingsLspTypeScriptAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.metadata?.variantLabel || status.variant?.label || "TypeScript language server";
          return status.bundled
            ? `Using bundled ${variantLabel} from the desktop app dependencies. Function-call completions, diagnostics, hover, and go-to-definition are provided over LSP.`
            : `Installed ${variantLabel} from ${status.metadata?.vsixName || "VSIX"}${status.metadata?.installedAt ? ` on ${status.metadata.installedAt}` : ""}.`;
        },
        missingDetail: `Bundled TypeScript language-server dependencies were not found. Legacy VSIX install remains available for manual testing: <a href="${SOURCEGRAPH_TYPESCRIPT_VSIX_URL}" target="_blank" rel="noopener noreferrer">Sourcegraph JavaScript and TypeScript IntelliSense</a>.`,
        missingDetailIsHtml: true
      },
      {
        id: "java",
        label: "Java",
        statusElement: settingsLspJavaStatus,
        pathElement: settingsLspJavaPath,
        detailElement: settingsLspJavaDetail,
        actionsButton: settingsLspJavaActionsButton,
        actionsMenu: settingsLspJavaActionsMenu,
        toggleButton: settingsLspJavaToggleButton,
        autoStartInput: settingsLspJavaAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.metadata?.variantLabel || status.variant?.label || "Eclipse JDT Language Server";
          const version = status.metadata?.releaseVersion ? ` ${status.metadata.releaseVersion}` : "";
          return `Using installed ${variantLabel}${version} from the desktop profile. Java diagnostics, hover, completion, and go-to-definition are provided over LSP with the configured JDK.`;
        },
        missingDetail: "Install Eclipse JDT Language Server to enable Java diagnostics, hover, completion, and go-to-definition. A configured JDK 21 or newer is recommended."
      },
      {
        id: "kotlin",
        label: "Kotlin",
        statusElement: settingsLspKotlinStatus,
        pathElement: settingsLspKotlinPath,
        detailElement: settingsLspKotlinDetail,
        toggleButton: settingsLspKotlinToggleButton,
        autoStartInput: settingsLspKotlinAutoStartInput,
        installedDetail() { return "Using the bundled official JetBrains Kotlin LSP with MD-Editor project diagnostics and Kotlin ABI integration."; },
        missingDetail: "Bundled Kotlin language tools were not found. Run the Kotlin setup step for this desktop release."
      },
      {
        id: "xml",
        label: "XML and POM",
        statusElement: settingsLspXmlStatus,
        pathElement: settingsLspXmlPath,
        detailElement: settingsLspXmlDetail,
        actionsButton: settingsLspXmlActionsButton,
        actionsMenu: settingsLspXmlActionsMenu,
        toggleButton: settingsLspXmlToggleButton,
        autoStartInput: settingsLspXmlAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.metadata?.variantLabel || status.variant?.label || "Eclipse LemMinX XML Language Server";
          const version = status.metadata?.releaseVersion ? ` ${status.metadata.releaseVersion}` : "";
          const pomDetail = status.metadata?.mavenExtensionName ? ` POM support is installed from ${status.metadata.mavenExtensionName}.` : " Install POM support to add Maven-specific intelligence.";
          return `Using installed ${variantLabel}${version} from the desktop profile. XML diagnostics, hover, and completion are provided over LSP.${pomDetail}`;
        },
        missingDetail: "Install LemMinX XML Language Server to enable XML diagnostics, hover, completion, and optional POM intelligence."
      },
      {
        id: "python",
        label: "Python",
        statusElement: settingsLspPythonStatus,
        pathElement: settingsLspPythonPath,
        detailElement: settingsLspPythonDetail,
        toggleButton: settingsLspPythonToggleButton,
        autoStartInput: settingsLspPythonAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "Pyright";
          return `Using bundled ${variantLabel} from the desktop app dependencies. Python diagnostics, hover, completion, and go-to-definition are provided over LSP.`;
        },
        missingDetail: "Bundled Pyright language-server dependencies were not found."
      },
      {
        id: "html",
        label: "HTML",
        statusElement: settingsLspHtmlStatus,
        pathElement: settingsLspHtmlPath,
        detailElement: settingsLspHtmlDetail,
        toggleButton: settingsLspHtmlToggleButton,
        autoStartInput: settingsLspHtmlAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "VS Code HTML Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. HTML hover, completion, diagnostics, and document intelligence are provided over LSP.`;
        },
        missingDetail: "Bundled VS Code HTML language-server dependencies were not found."
      },
      {
        id: "css",
        label: "CSS and SCSS",
        statusElement: settingsLspCssStatus,
        pathElement: settingsLspCssPath,
        detailElement: settingsLspCssDetail,
        toggleButton: settingsLspCssToggleButton,
        autoStartInput: settingsLspCssAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "VS Code CSS Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. CSS and SCSS hover, completion, diagnostics, and document intelligence are provided over LSP.`;
        },
        missingDetail: "Bundled VS Code CSS language-server dependencies were not found."
      },
      {
        id: "json",
        label: "JSON",
        statusElement: settingsLspJsonStatus,
        pathElement: settingsLspJsonPath,
        detailElement: settingsLspJsonDetail,
        toggleButton: settingsLspJsonToggleButton,
        autoStartInput: settingsLspJsonAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "VS Code JSON Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. JSON hover, completion, diagnostics, and document intelligence are provided over LSP.`;
        },
        missingDetail: "Bundled VS Code JSON language-server dependencies were not found."
      },
      {
        id: "yaml",
        label: "YAML",
        statusElement: settingsLspYamlStatus,
        pathElement: settingsLspYamlPath,
        detailElement: settingsLspYamlDetail,
        toggleButton: settingsLspYamlToggleButton,
        autoStartInput: settingsLspYamlAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "YAML Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. YAML hover, completion, diagnostics, and document intelligence are provided over LSP.`;
        },
        missingDetail: "Bundled YAML language-server dependencies were not found."
      },
      {
        id: "bash",
        label: "Bash",
        statusElement: settingsLspBashStatus,
        pathElement: settingsLspBashPath,
        detailElement: settingsLspBashDetail,
        toggleButton: settingsLspBashToggleButton,
        autoStartInput: settingsLspBashAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "Bash Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. Bash hover, completion, diagnostics, and document intelligence are provided over LSP. ShellCheck and shfmt are used when available on PATH.`;
        },
        missingDetail: "Bundled Bash language-server dependencies were not found."
      },
      {
        id: "dockerfile",
        label: "Dockerfile",
        statusElement: settingsLspDockerfileStatus,
        pathElement: settingsLspDockerfilePath,
        detailElement: settingsLspDockerfileDetail,
        toggleButton: settingsLspDockerfileToggleButton,
        autoStartInput: settingsLspDockerfileAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "Dockerfile Language Server";
          return `Using bundled ${variantLabel} from the desktop app dependencies. Dockerfile hover, completion, diagnostics, and document intelligence are provided over LSP.`;
        },
        missingDetail: "Bundled Dockerfile language-server dependencies were not found."
      },
      {
        id: "windows-scripting",
        label: "Windows Scripting",
        statusElement: settingsLspWindowsScriptingStatus,
        pathElement: settingsLspWindowsScriptingPath,
        detailElement: settingsLspWindowsScriptingDetail,
        toggleButton: settingsLspWindowsScriptingToggleButton,
        autoStartInput: settingsLspWindowsScriptingAutoStartInput,
        installedDetail(status) {
          const variantLabel = status.variant?.label || "Windows Scripting Language Server";
          return `Using bundled ${variantLabel} from the desktop app resources. Batch, CMD, PowerShell, and Registry hover, completion, diagnostics, symbols, folding, and go-to-definition are provided over LSP.`;
        },
        missingDetail: "Bundled Windows scripting language-server resources were not found."
      }
    ];
  }

  function getActiveLanguageServerStartContext(serverId) {
    if (!lspServerRegistry) return null;
    const filePath = lspServerRegistry.normalizeLocalPath(getActiveEditorPathForLanguage());
    if (!filePath) return null;
    const activeContent = activeEditorCommands?.getActiveEditorValue?.() || "";
    const language = languageRegistry?.resolveLanguageForPath?.(filePath, { content: activeContent }) || null;
    const server = lspServerRegistry.getServerForLanguage(language?.id || language?.codeMirrorLanguage || "");
    return server?.id === serverId ? { filePath, server, language } : null;
  }

  function getSettingsLanguageServerActionMenus() {
    return getSettingsLanguageServerRows()
      .map((row) => ({ button: row.actionsButton, menu: row.actionsMenu }))
      .filter((entry) => entry.button && entry.menu);
  }

  function closeSettingsLanguageServerActionMenus(exceptMenu = null) {
    getSettingsLanguageServerActionMenus().forEach(({ button, menu }) => {
      if (menu === exceptMenu) return;
      menu.hidden = true;
      menu.style.removeProperty("left");
      menu.style.removeProperty("top");
      button.setAttribute("aria-expanded", "false");
    });
  }

  function positionSettingsLanguageServerActionMenu(button, menu) {
    if (!button || !menu || menu.hidden) return;
    const viewportPadding = 8;
    const gap = 6;
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let left = buttonRect.right - menuRect.width;
    let top = buttonRect.bottom + gap;
    if (top + menuRect.height > viewportHeight - viewportPadding) {
      top = buttonRect.top - menuRect.height - gap;
    }
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - menuRect.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - menuRect.height - viewportPadding));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function toggleSettingsLanguageServerActionMenu(button, menu) {
    if (!button || !menu || button.disabled) return;
    const opening = menu.hidden;
    closeSettingsLanguageServerActionMenus(opening ? menu : null);
    menu.hidden = !opening;
    button.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) positionSettingsLanguageServerActionMenu(button, menu);
  }

  function updateSettingsLanguageServerActionMenuState(row) {
    if (!row.actionsButton || !row.actionsMenu) return;
    const buttons = Array.from(row.actionsMenu.querySelectorAll("button"));
    row.actionsButton.disabled = buttons.length > 0 && buttons.every((button) => button.disabled);
    if (row.actionsButton.disabled) closeSettingsLanguageServerActionMenus();
  }

  function setSettingsLanguageServerActionLabel(button, label) {
    const labelElement = button?.querySelector?.(".settings-lsp-action-label");
    if (labelElement) labelElement.textContent = label;
  }

  const LANGUAGE_SERVER_MANUAL_INSTALL_DIALOGS = Object.freeze({
    typescript: {
      title: "Install TypeScript Language Server VSIX",
      description: "Download the supported Sourcegraph JavaScript and TypeScript IntelliSense VSIX, then select the downloaded .vsix file.",
      url: SOURCEGRAPH_TYPESCRIPT_VSIX_URL,
      urlLabel: "Download Sourcegraph JavaScript and TypeScript IntelliSense VSIX",
      fileType: "Expected file type: .vsix"
    },
    java: {
      title: "Install Eclipse JDT Language Server from File",
      description: `MD-Editor currently supports Eclipse JDT LS ${getSupportedJdtLsVersion()}. Download that version, bring it to this computer, then select its .tar.gz or .tgz archive.`,
      url: ECLIPSE_JDTLS_MILESTONES_URL,
      urlLabel: "Open Eclipse JDT LS milestones download page",
      additionalLinks: [{
        url: ECLIPSE_JDTLS_SNAPSHOTS_URL,
        label: "Open Eclipse JDT LS snapshots download page"
      }],
      fileType: "Expected file type: .tar.gz or .tgz"
    },
    xml: {
      title: "Install LemMinX XML Server from File",
      description: "Download the LemMinX XML Language Server uber JAR, bring it to this computer, then select the downloaded .jar file.",
      url: LEMMINX_RELEASES_URL,
      urlLabel: "Open LemMinX XML releases repository",
      fileType: "Expected file type: LemMinX XML Language Server uber .jar"
    },
    "xml-pom": {
      title: "Install LemMinX Maven Extension from File",
      description: "Download the LemMinX Maven extension dependency ZIP, bring it to this computer, then select the downloaded .zip file.",
      url: LEMMINX_MAVEN_RELEASES_URL,
      urlLabel: "Open LemMinX Maven releases repository",
      fileType: "Expected file type: LemMinX Maven extension dependency .zip"
    }
  });

  function getSupportedJdtLsVersion() {
    return lspServerRegistry?.serverDefinitions?.java?.variants
      ?.find((variant) => variant.id === "eclipse-jdt-ls")?.supportedVersion || "unknown";
  }

  function confirmJavaLanguageServerDownload() {
    if (!notificationModal) return Promise.resolve(true);
    const supportedVersion = getSupportedJdtLsVersion();
    return notificationModal.show({
      title: "Download Eclipse JDT Language Server",
      message: `MD-Editor supports Eclipse JDT LS ${supportedVersion}. Download and install this version into the desktop profile?`,
      dismissible: true,
      dismissValue: false,
      buttons: [
        { id: "cancel", label: "Cancel", value: false, variant: "cancel" },
        { id: "download", label: `Download ${supportedVersion}`, value: true, variant: "primary", autoFocus: true }
      ]
    });
  }

  function promptLanguageServerManualInstall(serverId) {
    const config = LANGUAGE_SERVER_MANUAL_INSTALL_DIALOGS[serverId];
    if (!config || !notificationModal) return Promise.resolve(true);
    return notificationModal.show({
      title: config.title,
      message: config.description,
      dismissible: true,
      dismissValue: false,
      renderBody: (body) => {
        const linkRows = [{ url: config.url, label: config.urlLabel || config.url }]
          .concat(config.additionalLinks || [])
          .map((linkConfig) => {
            const linkRow = document.createElement("p");
            linkRow.className = "settings-lsp-manual-install-link-row";
            const link = document.createElement("a");
            link.href = linkConfig.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = linkConfig.label || linkConfig.url;
            linkRow.appendChild(link);
            return linkRow;
          });

        const fileType = document.createElement("p");
        fileType.className = "settings-lsp-manual-install-file-type";
        fileType.textContent = config.fileType;
        body.append(...linkRows, fileType);
      },
      buttons: [
        { id: "cancel", label: "Cancel", value: false, variant: "cancel" },
        { id: "browse", label: "Browse...", value: true, variant: "primary", autoFocus: true }
      ]
    });
  }

  function renderSettingsLanguageServerToggle(row, status, runtimeStatus, canStart) {
    const button = row.toggleButton;
    if (!button) return;
    const running = runtimeStatus.running === true;
    const stopping = (runtimeStatus.stoppingSessionCount || 0) > 0;
    const action = running || stopping ? "Shutdown" : "Start";
    const pendingAction = settingsLanguageServerPendingActions.get(row.id) || "";
    button.disabled = !!pendingAction || stopping || !status.desktopRuntime || !status.installed;
    button.title = stopping ? `Stopping ${row.label} language server` : `${action} ${row.label} language server`;
    button.setAttribute("aria-label", stopping ? `Stopping ${row.label} language server` : `${action} ${row.label} language server`);
    button.setAttribute("aria-pressed", running || stopping ? "true" : "false");
    button.classList.toggle("active", running || stopping);
    setSettingsLanguageServerActionLabel(button, stopping ? "Stopping" : (running ? "Shutdown" : "Start"));
  }

  function renderUnavailableLanguageServerRow(row) {
    if (row.statusElement) {
      row.statusElement.textContent = "Unavailable";
      row.statusElement.title = "Language servers are unavailable in this runtime.";
      row.statusElement.classList.remove("settings-lsp-status-pending");
    }
    if (row.pathElement) {
      row.pathElement.replaceChildren("-");
      row.pathElement.title = "";
    }
    if (row.detailElement) row.detailElement.textContent = "Language servers are unavailable in this runtime.";
    if (row.toggleButton) row.toggleButton.disabled = true;
    updateSettingsLanguageServerActionMenuState(row);
  }

  async function openLanguageServerInstallPathFromSettings(path) {
    if (!path || !isNeutralinoRuntime() || typeof Neutralino === "undefined" || !Neutralino.os?.open) {
      window.alert("Opening language-server folders is available only in the desktop app.");
      return;
    }
    try {
      await Neutralino.os.open(path);
    } catch (error) {
      console.warn("Failed to open language server install folder:", error);
      window.alert("Unable to open that language-server folder.");
    }
  }

  function renderSettingsLanguageServerPath(row, status) {
    const path = status.installDir || "";
    row.pathElement.replaceChildren();
    row.pathElement.title = status.installed ? path : "";
    if (!path || !status.installed) {
      row.pathElement.textContent = "-";
      return;
    }

    const pathButton = document.createElement("button");
    pathButton.type = "button";
    pathButton.className = "settings-table-path-link";
    pathButton.textContent = path;
    pathButton.title = `Open ${path} in File Explorer`;
    pathButton.setAttribute("aria-label", `Open ${row.label} language server folder in File Explorer`);
    pathButton.addEventListener("click", () => openLanguageServerInstallPathFromSettings(path));
    row.pathElement.append(pathButton);
  }

  function formatSettingsLanguageServerProcessTooltip(row, statusText, runtimeStatus) {
    const sessions = Array.isArray(runtimeStatus?.sessions) ? runtimeStatus.sessions : [];
    const stoppingSessions = Array.isArray(runtimeStatus?.stoppingSessions) ? runtimeStatus.stoppingSessions : [];
    const lines = [`${row.label}: ${statusText}`];
    function appendSession(label, session) {
      const processPid = session?.processPid || "unknown";
      const processId = session?.processId ?? "";
      let processLine = `${label} PID: ${processPid}`;
      if (processId !== "") processLine += `, Neutralino id: ${processId}`;
      if (session?.workspaceRoot) processLine += `, workspace: ${session.workspaceRoot}`;
      lines.push(processLine);
      if (session?.processCommand) lines.push(`${label} command: ${session.processCommand}`);
    }
    sessions.forEach((session) => appendSession("Running process", session));
    stoppingSessions.forEach((session) => appendSession("Stopping process", session));
    if (!sessions.length && !stoppingSessions.length) lines.push("No tracked language-server process.");
    return lines.join("\n");
  }

  async function renderSettingsLanguageServers() {
    const rows = getSettingsLanguageServerRows();
    if (rows.some((row) => !row.statusElement || !row.pathElement || !row.detailElement)) return;
    const autoStartPreferences = getLanguageServerAutoStartPreferences();
    rows.forEach((row) => {
      if (row.autoStartInput) row.autoStartInput.checked = autoStartPreferences[row.id] !== false;
    });
    if (!lspServerRegistry) {
      rows.forEach(renderUnavailableLanguageServerRow);
      if (settingsLspTypeScriptInstallButton) settingsLspTypeScriptInstallButton.disabled = true;
      if (settingsLspTypeScriptRemoveButton) settingsLspTypeScriptRemoveButton.disabled = true;
      if (settingsLspJavaInstallButton) settingsLspJavaInstallButton.disabled = true;
      if (settingsLspJavaInstallFileButton) settingsLspJavaInstallFileButton.disabled = true;
      if (settingsLspJavaRemoveButton) settingsLspJavaRemoveButton.disabled = true;
      if (settingsLspJavaRetryButton) settingsLspJavaRetryButton.disabled = true;
      if (settingsLspJavaShowLogButton) settingsLspJavaShowLogButton.disabled = true;
      if (settingsLspJavaResetWorkspaceButton) settingsLspJavaResetWorkspaceButton.disabled = true;
      if (settingsLspXmlInstallButton) settingsLspXmlInstallButton.disabled = true;
      if (settingsLspXmlInstallFileButton) settingsLspXmlInstallFileButton.disabled = true;
      if (settingsLspXmlInstallPomFileButton) settingsLspXmlInstallPomFileButton.disabled = true;
      if (settingsLspXmlRemoveButton) settingsLspXmlRemoveButton.disabled = true;
      rows.forEach(updateSettingsLanguageServerActionMenuState);
      return;
    }

    for (const row of rows) {
      const status = await lspServerRegistry.getServerStatus(row.id);
      const runtimeStatus = neutralinoLspBridge?.getServerRuntimeStatus?.(row.id) || { running: false, sessionCount: 0, sessions: [] };
      const canStart = !!(neutralinoLspBridge && status.desktopRuntime && status.installed);
      const pendingAction = settingsLanguageServerPendingActions.get(row.id) || "";
      const hasStoppingSession = (runtimeStatus.stoppingSessionCount || 0) > 0;
      const statusText = !status.desktopRuntime
        ? "Unavailable"
        : (!status.installed ? "Not installed" : (pendingAction === "starting" ? "Starting..." : (pendingAction === "stopping" || hasStoppingSession ? "Stopping..." : (runtimeStatus.running ? "Running" : "Down"))));
      row.statusElement.textContent = statusText;
      row.statusElement.title = formatSettingsLanguageServerProcessTooltip(row, statusText, runtimeStatus);
      row.statusElement.classList.toggle("settings-lsp-status-pending", !!pendingAction || hasStoppingSession);
      renderSettingsLanguageServerPath(row, status);
      if (status.installed) {
        row.detailElement.textContent = row.installedDetail(status);
      } else if (row.missingDetailIsHtml) {
        row.detailElement.innerHTML = row.missingDetail;
      } else {
        row.detailElement.textContent = row.missingDetail;
      }
      renderSettingsLanguageServerToggle(row, status, runtimeStatus, canStart);
      updateSettingsLanguageServerActionMenuState(row);
    }

    const typeScriptStatus = await lspServerRegistry.getServerStatus("typescript");
    if (settingsLspTypeScriptInstallButton) settingsLspTypeScriptInstallButton.disabled = !typeScriptStatus.desktopRuntime || !lspVsixInstaller;
    if (settingsLspTypeScriptRemoveButton) settingsLspTypeScriptRemoveButton.disabled = !typeScriptStatus.desktopRuntime || !typeScriptStatus.installed || typeScriptStatus.bundled || !lspVsixInstaller;
    const javaStatus = await lspServerRegistry.getServerStatus("java");
    if (settingsLspJavaInstallButton) settingsLspJavaInstallButton.disabled = !javaStatus.desktopRuntime || !lspVsixInstaller;
    if (settingsLspJavaInstallFileButton) settingsLspJavaInstallFileButton.disabled = !javaStatus.desktopRuntime || !lspVsixInstaller;
    if (settingsLspJavaRemoveButton) settingsLspJavaRemoveButton.disabled = !javaStatus.desktopRuntime || !javaStatus.installed || javaStatus.bundled || !lspVsixInstaller;
    if (settingsLspJavaRetryButton) settingsLspJavaRetryButton.disabled = !activeFolderPath || !javaStatus.installed;
    if (settingsLspJavaShowLogButton) settingsLspJavaShowLogButton.disabled = !activeFolderPath || !javaStatus.installed;
    if (settingsLspJavaResetWorkspaceButton) settingsLspJavaResetWorkspaceButton.disabled = !activeFolderPath || !javaStatus.installed;
    const xmlStatus = await lspServerRegistry.getServerStatus("xml");
    if (settingsLspXmlInstallButton) settingsLspXmlInstallButton.disabled = !xmlStatus.desktopRuntime || !lspVsixInstaller;
    if (settingsLspXmlInstallFileButton) settingsLspXmlInstallFileButton.disabled = !xmlStatus.desktopRuntime || !lspVsixInstaller;
    if (settingsLspXmlInstallPomFileButton) settingsLspXmlInstallPomFileButton.disabled = !xmlStatus.desktopRuntime || !xmlStatus.installed || !lspVsixInstaller;
    if (settingsLspXmlRemoveButton) settingsLspXmlRemoveButton.disabled = !xmlStatus.desktopRuntime || !xmlStatus.installed || xmlStatus.bundled || !lspVsixInstaller;
    rows.forEach(updateSettingsLanguageServerActionMenuState);
  }

  async function toggleLanguageServerFromSettings(serverId) {
    if (!lspServerRegistry || !neutralinoLspBridge) return;
    const runtimeStatus = neutralinoLspBridge.getServerRuntimeStatus?.(serverId) || { running: false };
    let shouldRefreshActiveLsp = false;
    try {
      settingsLanguageServerPendingActions.set(serverId, runtimeStatus.running ? "stopping" : "starting");
      await renderSettingsLanguageServers();
      setSettingsDialogSaving(true);
      if (runtimeStatus.running) {
        await neutralinoLspBridge.stopServerSessions?.(serverId);
        await appDebugLog("info", "[lsp] Stopped language server from settings", { serverId });
      } else {
        const startContext = getActiveLanguageServerStartContext(serverId);
        if (!startContext) {
          window.alert("Open a matching language file before starting that language server.");
          return;
        }
        const status = await lspServerRegistry.getServerStatus(serverId);
        if (!status.desktopRuntime || !status.installed) return;
        await neutralinoLspBridge.ensureSession({ server: startContext.server, filePath: startContext.filePath });
        shouldRefreshActiveLsp = true;
        await appDebugLog("info", "[lsp] Started language server from settings", {
          serverId,
          filePath: startContext.filePath
        });
      }
    } catch (error) {
      console.warn("Failed to toggle language server:", error);
      alert(error?.message || "Unable to toggle that language server.");
    } finally {
      settingsLanguageServerPendingActions.delete(serverId);
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      if (shouldRefreshActiveLsp) {
        editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
      }
    }
  }

  async function installTypeScriptLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    try {
      const shouldBrowse = await promptLanguageServerManualInstall("typescript");
      if (!shouldBrowse) return;
      setSettingsDialogSaving(true);
      const metadata = await lspVsixInstaller.installTypeScriptVsixFromDialog();
      if (metadata) {
        await neutralinoLspBridge?.stopAllSessions?.();
        await appDebugLog("info", "[lsp] Installed TypeScript language server", metadata);
      }
    } catch (error) {
      console.warn("Failed to install TypeScript language server:", error);
      alert(error?.message || "Unable to install that TypeScript language server VSIX.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  function openJdkSettingsFromJavaProject() {
    showSettingsDialog();
    settingsScreen?.selectTab?.("jdks");
  }

  function openGradleSettingsFromJavaProject() {
    showSettingsDialog();
    settingsScreen?.selectTab?.("gradle");
  }

  function openJavaBuildPathForRuntime() {
    if (!activeFolderPath) return;
    window.setTimeout(() => void javaBuildPath?.openDialog?.(activeFolderPath, { initialTab: "source", focusProjectJdk: true }), 0);
  }

  async function showProjectJdkRequiredNotification() {
    if (!activeFolderPath) return;
    await app.services?.notify?.show?.({
      title: "Project JDK Required",
      message: "This Java project has no configured Project JDK. Java analysis and compilation will remain disabled until one is selected.",
      buttons: [
        { id: "dismiss", label: "Dismiss", variant: "cancel" },
        { id: "build-path", label: "Open Java Build Path", variant: "primary", autoFocus: true, action: openJavaBuildPathForRuntime }
      ]
    });
  }

  async function showJdtLauncherRequiredNotification() {
    await app.services?.notify?.show?.({
      title: "JDT Runtime Required",
      message: "The Project JDK can compile this project, but JDT requires a configured JDK 21 or newer. Add one in Java Runtimes settings.",
      buttons: [
        { id: "dismiss", label: "Dismiss", variant: "cancel" },
        { id: "jdk-settings", label: "Open JDK Settings", variant: "primary", autoFocus: true, action: () => window.setTimeout(openJdkSettingsFromJavaProject, 0) }
      ]
    });
  }

  /** Confirm that the user accepts losing project-aware Java features before JDT stops. */
  async function confirmJdtCancellation() {
    const decision = await app.services?.notify?.show?.({
      title: "Cancel Java analysis?",
      message: "This stops Eclipse JDT for the current workspace. Your files remain open and editable, but Java completion, hover information, Ctrl+click navigation, symbols, references, refactoring, live diagnostics, JDT Quick Fix, and project-aware analysis will be unavailable until JDT starts again.",
      dismissValue: "keep-running",
      buttons: [
        { id: "keep-running", label: "Keep JDT Running", value: "keep-running", variant: "cancel", autoFocus: true },
        { id: "cancel-jdt", label: "Cancel JDT", value: "cancel-jdt", variant: "primary" }
      ]
    });
    return decision === "cancel-jdt";
  }

  async function showJdtUnavailableNotification(proxySession, processDetail = {}) {
    const workspaceModel = javaWorkspaceController?.getModel?.();
    const importers = workspaceModel?.importers || {};
    const buildSystem = importers.gradle && importers.maven ? "gradle/maven" : (importers.gradle ? "gradle" : (importers.maven ? "maven" : ""));
    const exitCode = processDetail?.exitCode;
    const reason = processDetail?.error
      || (exitCode !== undefined && exitCode !== null ? "the JDT process exited twice with exit code " + exitCode : "the JDT process failed twice during startup");
    const fatalFailure = javaAnalysisProblems?.createFatalJdtProcessFailure?.({
      buildSystem,
      reason,
      projectPath: proxySession?.workspaceRoot || activeFolderPath || "",
      projectJdk: javaWorkspaceController?.getRuntime?.()?.projectJdk || null,
      logPath: await getActiveJdtLogPath("", proxySession?.workspaceRoot || activeFolderPath || "")
    });
    if (fatalFailure) {
      javaAnalysisProblems.publish(fatalFailure, { severity: "error", projectPath: fatalFailure.projectPath });
      javaWorkspaceController?.markAnalysisFailed?.(fatalFailure);
    } else {
      javaWorkspaceController?.markDegraded?.(new Error("JDT is unavailable."));
    }
    await app.services?.notify?.show?.({
      title: "Java Language Features Unavailable",
      message: "JDT failed twice. Accurate Java completion, hover, Ctrl+click and project navigation, symbols, references, refactoring, live diagnostics, and JDT Quick Fix are unavailable. Normal editing and local intelligence remain usable.",
      buttons: [
        {
          id: "continue",
          label: "Continue without JDT",
          variant: "cancel",
          action: function() { javaWorkspaceController?.markDegraded?.(new Error("JDT is unavailable.")); }
        },
        {
          id: "restart",
          label: "Restart JDT",
          variant: "primary",
          autoFocus: true,
          action: async function() {
            await jdtProxyClient?.restartSession?.(proxySession);
            javaWorkspaceController?.markInitializing?.();
          }
        }
      ]
    });
  }

  /** Remove one generated JDT workspace so a recreated project cannot inherit a stale classpath. */
  async function clearGeneratedJdtWorkspace(projectPath) {
    await neutralinoLspBridge?.stopServerSessions?.("java");
    javaWorkspaceModel?.invalidate?.(projectPath);
    const projectModel = await javaWorkspaceModel?.detect?.(projectPath);
    const workspacePath = await lspServerRegistry?.getServerWorkspaceDir?.("java", normalizeLocalPath(projectPath), "", {
      scopeSignature: projectModel?.analysis?.scopeSignature || ""
    });
    const comparablePath = normalizeLocalPath(workspacePath).toLowerCase();
    if (workspacePath && comparablePath.includes("/language-server-workspaces/java/") && await canAccessLocalPath(workspacePath)) {
      await Neutralino.filesystem.remove(workspacePath);
    }
    javaWorkspaceModel?.invalidate?.(projectPath);
    javaAnalysisFailureMonitor?.reset?.(`java:${normalizeLocalPath(projectPath)}`);
  }

  async function restartJavaWorkspaceAfterProjectJdkChange(projectPath, options = {}) {
    if (!projectPath || normalizeLocalPath(projectPath) !== normalizeLocalPath(activeFolderPath)) return;
    await clearGeneratedJdtWorkspace(projectPath);
    await javaWorkspaceController?.openWorkspace?.(projectPath, { traceReason: options.traceReason || "project-jdk-changed" });
    await editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
  }

  async function handleJavaAnalysisFailure(event) {
    const decision = javaAnalysisFailureMonitor?.record?.(Object.assign({ workspaceId: event?.sessionId || event?.key }, event));
    if (!decision) return;
    const runtime = javaWorkspaceController?.getRuntime?.();
    const selected = runtime?.projectJdk;
    const guidance = ["gradle-import-failed", "jdk-incompatible"].includes(decision.code)
      ? await javaGradleRuntimeGuidance?.detect?.(activeFolderPath || event?.workspaceRoot || "")
      : null;
    // A failure-specific remediation from the proxy classification (e.g. corrupted
    // Gradle build state) is more actionable than generic Gradle/JDK guidance.
    const remediation = decision.remediation
      || (["gradle-import-failed", "jdk-incompatible"].includes(decision.code)
        ? javaGradleRuntimeGuidance?.createRemediation?.(decision, selected, guidance)
        : "Fix the project import error, then retry Java project analysis.");
    const actionableRemediation = remediation || "Fix the Gradle project import error or select a compatible Project JDK, then retry Java project analysis.";
    const logPath = await getActiveJdtLogPath(event?.logPath || "", event?.workspaceRoot || activeFolderPath || "");
    const details = Object.assign({}, decision, {
      summary: decision.summary || "Java project analysis failed.",
      projectJdk: selected || null,
      logPath,
      remediation: actionableRemediation,
      recommendedGradleJvmFeature: guidance?.feature || null,
      recommendationSource: guidance?.source || ""
    });
    javaAnalysisProblems?.publish?.(details, { severity: decision.trip ? "error" : "warning", projectPath: activeFolderPath || "" });
    if (!decision.trip) return;
    const analysisGeneration = analysisGenerationCoordinator?.getState?.();
    analysisGenerationCoordinator?.markIncomplete?.({
      generationId: analysisGeneration?.generationId,
      workspaceRoot: event?.workspaceRoot || activeFolderPath || "",
      providerId: "jdt",
      code: details.code || "java-analysis-failed",
      summary: details.summary || "Java project analysis failed.",
      details,
      notificationHandled: decision.shouldNotify
    });
    await appDebugLog("error", "[lsp] Java project analysis circuit breaker opened", {
      code: details.code,
      fingerprint: details.fingerprint,
      count: details.count,
      projectJdk: selected ? { id: selected.id, name: selected.name, feature: selected.feature, path: selected.path } : null,
      logPath: details.logPath
    });
    if (!decision.shouldNotify) return;
    javaAnalysisFailureMonitor.markNotified(decision.workspaceId, decision.fingerprint);
    await app.services?.notify?.show?.({
      title: "Java Project Analysis Failed",
      dialogClassName: "java-analysis-failure-notification",
      message: `${details.summary}\n\nProject JDK: ${selected ? `${selected.name} (Java ${selected.feature})` : "Unavailable"}\n${actionableRemediation}`,
      buttons: [
        { id: "dismiss", label: "Dismiss", variant: "cancel" },
        { id: "show-log", label: "Show JDT Log", action: () => window.setTimeout(() => void showActiveJdtLogFromSettings(details.logPath, event?.workspaceRoot || activeFolderPath || ""), 0) },
        { id: "jdk-settings", label: "Open JDK Settings", action: () => window.setTimeout(openJdkSettingsFromJavaProject, 0) },
        { id: "build-path", label: "Open Java Build Path", action: openJavaBuildPathForRuntime },
        { id: "retry", label: "Retry Project Analysis", variant: "primary", autoFocus: true, action: () => window.setTimeout(() => void retryJavaWorkspaceFromSettings(), 0) }
      ]
    });
  }

  async function retryJavaWorkspaceFromSettings(options = {}) {
    if (!activeFolderPath || !neutralinoLspBridge || !javaWorkspaceController) return;
    const manageSettingsState = options.manageSettingsState !== false;
    try {
      if (manageSettingsState) setSettingsDialogSaving(true);
      problemsPanel?.setJdtAnalysisReady?.(false, { discardPending: true });
      problemsPanel?.setJdtDiagnosticsSuspended?.(false, { discardPending: true });
      await neutralinoLspBridge.stopServerSessions?.("java");
      javaWorkspaceModel?.invalidate?.(activeFolderPath);
      await javaWorkspaceController.openWorkspace(activeFolderPath, { traceReason: "workspace-retry" });
      if (!javaWorkspaceController.getRuntime?.()?.ok) return;
      await editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    } catch (error) {
      javaWorkspaceController.markDegraded?.(error);
      alert(error?.message || "Unable to retry the Java project import.");
    } finally {
      if (manageSettingsState) {
        setSettingsDialogSaving(false);
        await renderSettingsLanguageServers();
      }
    }
  }

  async function getActiveJdtWorkspacePath(projectPath = activeFolderPath) {
    const workspaceRoot = normalizeLocalPath(projectPath || activeFolderPath);
    if (!workspaceRoot || !lspServerRegistry) return "";
    return lspServerRegistry.getServerWorkspaceDir("java", workspaceRoot, "");
  }

  /** Resolve the native JDT log without allowing the active editor tab to change its project workspace. */
  async function getActiveJdtLogPath(preferredLogPath = "", projectPath = activeFolderPath) {
    const recordedLogPath = normalizeLocalPath(preferredLogPath || javaWorkspaceController?.getState?.()?.logPath || "");
    if (recordedLogPath) return recordedLogPath;
    const workspacePath = await getActiveJdtWorkspacePath(projectPath);
    return workspacePath ? joinPath(joinPath(workspacePath, ".metadata"), ".log") : "";
  }

  async function showActiveJdtLogFromSettings(preferredLogPath = "", projectPath = activeFolderPath) {
    try {
      const logPath = await getActiveJdtLogPath(preferredLogPath, projectPath);
      if (!logPath) throw new Error("Open a Java workspace first.");
      try {
        await Neutralino.filesystem.getStats(logPath);
      } catch (error) {
        const reason = error?.message || "The file does not exist or cannot be read.";
        throw new Error("Unable to access the JDT log at:\n" + logPath + "\n\n" + reason);
      }
      await openLocalFileWithDefaultApp(logPath);
    } catch (error) {
      alert(error?.message || "Unable to open the JDT workspace log.");
    }
  }

  async function resetActiveJdtWorkspaceFromSettings() {
    if (!activeFolderPath || typeof Neutralino === "undefined" || !Neutralino.filesystem?.remove) return;
    const workspacePath = await getActiveJdtWorkspacePath();
    const comparablePath = normalizeLocalPath(workspacePath).toLowerCase();
    if (!workspacePath || !comparablePath.includes("/language-server-workspaces/java/")) {
      alert("The generated JDT workspace path could not be verified.");
      return;
    }
    if (shouldConfirmResetJdtWorkspace()) {
      const confirmed = await app.services?.notify?.confirm?.({
        title: "Reset JDT Workspace",
        message: "Reset generated JDT workspace data for the active folder? Project sources and build files will not be changed.",
        confirmLabel: "Reset",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
    }
    try {
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopServerSessions?.("java");
      if (await canAccessLocalPath(workspacePath)) await Neutralino.filesystem.remove(workspacePath);
      javaWorkspaceModel?.invalidate?.(activeFolderPath);
      await javaWorkspaceController?.openWorkspace?.(activeFolderPath, { traceReason: "workspace-reset" });
      await editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    } catch (error) {
      javaWorkspaceController?.markDegraded?.(error);
      alert(error?.message || "Unable to reset the generated JDT workspace.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
    }
  }

  async function installJavaLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    try {
      const shouldDownload = await confirmJavaLanguageServerDownload();
      if (!shouldDownload) return;
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const metadata = await lspVsixInstaller.installJavaJdtLsFromEclipse();
      if (metadata) {
        await appDebugLog("info", "[lsp] Installed Java language server", metadata);
      }
    } catch (error) {
      console.warn("Failed to install Java language server:", error);
      alert(error?.message || "Unable to install the Java language server.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function installJavaLanguageServerFromFileSettings() {
    if (!lspVsixInstaller) return;
    try {
      const shouldBrowse = await promptLanguageServerManualInstall("java");
      if (!shouldBrowse) return;
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const metadata = await lspVsixInstaller.installJavaJdtLsFromDialog();
      if (metadata) {
        await appDebugLog("info", "[lsp] Installed Java language server from file", metadata);
      }
    } catch (error) {
      console.warn("Failed to install Java language server from file:", error);
      alert(error?.message || "Unable to install the Java language server archive.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }


  async function installXmlLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    try {
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const metadata = await lspVsixInstaller.installXmlLemMinXFromEclipse();
      if (metadata) {
        await appDebugLog("info", "[lsp] Installed XML and POM language server", metadata);
      }
    } catch (error) {
      console.warn("Failed to install XML and POM language server:", error);
      alert(error?.message || "Unable to install the XML and POM language server.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function installXmlLanguageServerFromFileSettings() {
    if (!lspVsixInstaller) return;
    try {
      const shouldBrowse = await promptLanguageServerManualInstall("xml");
      if (!shouldBrowse) return;
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const metadata = await lspVsixInstaller.installXmlLemMinXFromDialog();
      if (metadata) {
        await appDebugLog("info", "[lsp] Installed XML language server from file", metadata);
      }
    } catch (error) {
      console.warn("Failed to install XML language server from file:", error);
      alert(error?.message || "Unable to install the XML language server JAR.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function installPomLanguageServerFromFileSettings() {
    if (!lspVsixInstaller) return;
    try {
      const shouldBrowse = await promptLanguageServerManualInstall("xml-pom");
      if (!shouldBrowse) return;
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const metadata = await lspVsixInstaller.installXmlLemMinXMavenExtensionFromDialog();
      if (metadata) {
        await appDebugLog("info", "[lsp] Installed POM language server from file", metadata);
      }
    } catch (error) {
      console.warn("Failed to install POM language server from file:", error);
      alert(error?.message || "Unable to install the POM language server JAR.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }


  function getXmlLanguageServerRemoveErrorDetails(error) {
    const message = String(error?.message || error || "");
    const normalized = message.toLowerCase();
    if (/\b(eacces|eperm|access is denied|permission|unauthorized|operation not permitted)\b/i.test(message)) {
      return { code: 100, reason: "permission-denied" };
    }
    if (/\b(enoent|not found|cannot find|does not exist|missing)\b/i.test(message)) {
      return { code: 101, reason: "path-not-found" };
    }
    if (/\b(ebusy|enotempty|locked|in use|not empty|io|i\/o|filesystem|file system|remove|delete|directory)\b/i.test(message)) {
      return { code: 102, reason: "io-remove-failed" };
    }
    if (normalized.includes("desktop command execution is unavailable") || normalized.includes("execcommand")) {
      return { code: 103, reason: "desktop-command-unavailable" };
    }
    return { code: 199, reason: "unknown" };
  }
  async function removeXmlLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    if (!await confirmWithAppModal("Remove the installed XML and POM language server?", { confirmLabel: "Remove", confirmVariant: "danger" })) return;
    try {
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const removed = await lspVsixInstaller.removeServer("xml");
      const status = await lspServerRegistry?.getServerStatus?.("xml");
      await appDebugLog("info", "[lsp] Removed XML and POM language server", {
        removed,
        activeSource: status?.installed ? (status.bundled ? "bundled" : "profile") : "none",
        activeInstallDir: status?.installDir || "",
        activeVariantId: status?.variant?.id || ""
      });
    } catch (error) {
      const errorDetails = getXmlLanguageServerRemoveErrorDetails(error);
      const status = await lspServerRegistry?.getServerStatus?.("xml").catch(() => null);
      console.warn("Failed to remove XML and POM language server:", error);
      await appDebugLog("error", "[lsp] Failed to remove XML and POM language server", {
        errorCode: errorDetails.code,
        errorReason: errorDetails.reason,
        message: error?.message || String(error || "Unknown error"),
        stack: error?.stack || "",
        activeSource: status?.installed ? (status.bundled ? "bundled" : "profile") : "none",
        activeInstallDir: status?.installDir || "",
        activeVariantId: status?.variant?.id || ""
      });
      alert(`Unable to remove the XML and POM language server. (${errorDetails.code})`);
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function removeJavaLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    if (!await confirmWithAppModal("Remove the installed Java language server?", { confirmLabel: "Remove", confirmVariant: "danger" })) return;
    try {
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const removed = await lspVsixInstaller.removeServer("java");
      const status = await lspServerRegistry?.getServerStatus?.("java");
      await appDebugLog("info", "[lsp] Removed Java language server", {
        removed,
        activeSource: status?.installed ? (status.bundled ? "bundled" : "profile") : "none",
        activeInstallDir: status?.installDir || "",
        activeVariantId: status?.variant?.id || ""
      });
    } catch (error) {
      console.warn("Failed to remove Java language server:", error);
      alert("Unable to remove the Java language server.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function removeTypeScriptLanguageServerFromSettings() {
    if (!lspVsixInstaller) return;
    if (!await confirmWithAppModal("Remove the installed TypeScript language server?", { confirmLabel: "Remove", confirmVariant: "danger" })) return;
    try {
      setSettingsDialogSaving(true);
      await neutralinoLspBridge?.stopAllSessions?.();
      const removed = await lspVsixInstaller.removeServer("typescript");
      const status = await lspServerRegistry?.getServerStatus?.("typescript");
      await appDebugLog("info", "[lsp] Removed TypeScript language server", {
        removed,
        activeSource: status?.installed ? (status.bundled ? "bundled" : "profile") : "none",
        activeInstallDir: status?.installDir || "",
        activeVariantId: status?.variant?.id || ""
      });
    } catch (error) {
      console.warn("Failed to remove TypeScript language server:", error);
      alert("Unable to remove the TypeScript language server.");
    } finally {
      setSettingsDialogSaving(false);
      await renderSettingsLanguageServers();
      editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    }
  }

  async function ensureLanguageServerInstallDirectory(path) {
    const NeutralinoApi = typeof Neutralino !== "undefined" ? Neutralino : null;
    if (!path || !NeutralinoApi?.filesystem?.createDirectory) throw new Error("Desktop profile folder access is unavailable.");
    const parts = lspServerRegistry.normalizeLocalPath(path).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? lspServerRegistry.joinPath(current, part) : part;
      if (/^[A-Za-z]:$/.test(current)) continue;
      try {
        await NeutralinoApi.filesystem.createDirectory(current);
      } catch (_error) {
        // Existing directories are fine; Neutralino reports them as create failures.
      }
    }
  }

  function withLanguageServerInstallTimeout(promise, label, timeoutMs = 60000) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} did not finish within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    });
  }

  function renderSettingsJdkTable() {
    if (!settingsJdkList) return;
    settingsJdkList.innerHTML = "";
    const jdks = normalizeJavaConverterJdks(settingsJavaConverterJdksDraft);
    settingsJavaConverterJdksDraft = jdks;
    if (settingsJdkEmpty) settingsJdkEmpty.style.display = jdks.length ? "none" : "";

    jdks.forEach((jdk, index) => {
      const row = document.createElement("div");
      row.className = "settings-table-row";
      row.setAttribute("role", "row");
      row.dataset.jdkIndex = String(index);
      row.dataset.jdkId = jdk.id;
      row.dataset.jdkPath = jdk.path;
      row.dataset.jdkFeature = String(jdk.feature || 0);
      row.dataset.jdkDetectedName = jdk.detectedName || "";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "rename-modal-input settings-jdk-name-input";
      nameInput.value = jdk.name;
      nameInput.setAttribute("aria-label", "JDK name");

      const pathText = document.createElement("span");
      pathText.className = "settings-table-path";
      pathText.textContent = jdk.path;
      pathText.title = jdk.path;
      pathText.setAttribute("role", "cell");

      const actions = document.createElement("span");
      actions.className = "settings-table-actions";
      actions.setAttribute("role", "cell");

      const chooseButton = document.createElement("button");
      chooseButton.type = "button";
      chooseButton.className = "settings-icon-action";
      chooseButton.title = "Choose JDK folder";
      chooseButton.setAttribute("aria-label", "Choose JDK folder");
      chooseButton.innerHTML = '<i class="bi bi-folder2-open" aria-hidden="true"></i>';
      chooseButton.addEventListener("click", () => chooseSettingsJdkFolder(index));

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "settings-icon-action";
      removeButton.title = "Remove JDK";
      removeButton.setAttribute("aria-label", "Remove JDK");
      removeButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
      removeButton.addEventListener("click", () => {
        settingsJavaConverterJdksDraft = collectSettingsJdkRows();
        settingsJavaConverterJdksDraft.splice(index, 1);
        renderSettingsJdkTable();
      });

      actions.append(chooseButton, removeButton);
      row.append(nameInput, pathText, actions);
      settingsJdkList.append(row);
    });
  }

  function collectSettingsJdkRows() {
    if (!settingsJdkList) return [];
    return Array.from(settingsJdkList.querySelectorAll(".settings-table-row"))
      .map((row) => normalizeJavaConverterJdkEntry({
        id: row.dataset.jdkId || "",
        name: row.querySelector(".settings-jdk-name-input")?.value || "",
        path: row.dataset.jdkPath || "",
        feature: Number(row.dataset.jdkFeature || 0),
        detectedName: row.dataset.jdkDetectedName || ""
      }))
      .filter(Boolean);
  }

  async function inspectJavaConverterJdkHome(jdkHome) {
    const path = normalizeLocalPath(jdkHome);
    if (!path) return null;
    const javaExecutable = getJavaExecutableForJdkHome(path);
    if (!await canAccessLocalPath(javaExecutable)) {
      alert("Choose a JDK home folder that contains bin/java.");
      return null;
    }
    const javacExecutable = getJavacExecutableForJdkHome(path);
    if (!await canAccessLocalPath(javacExecutable)) {
      alert("Choose a JDK home folder that contains bin/javac, not a JRE.");
      return null;
    }
    const feature = await getJavaFeatureForJdkHome(path);
    if (!feature) {
      alert("Unable to detect the Java version for that JDK home.");
      return null;
    }
    const detectedName = `JDK ${feature}`;
    return { id: jdkRegistry?.getRuntimeId?.(path) || `jdk:${path.toLowerCase()}`, name: detectedName, path, feature, detectedName };
  }

  async function chooseSettingsJdkFolder(index = -1) {
    if (typeof Neutralino === "undefined" || !Neutralino.os?.showFolderDialog) {
      alert("JDK selection requires the desktop app so folders can be selected from disk.");
      return;
    }
    try {
      settingsJavaConverterJdksDraft = collectSettingsJdkRows();
      const existing = index >= 0 ? settingsJavaConverterJdksDraft[index] : null;
      const selectedPath = await Neutralino.os.showFolderDialog(
        "Choose JDK home folder",
        existing?.path ? { defaultPath: existing.path } : undefined
      );
      if (!selectedPath) return;
      const inspected = await inspectJavaConverterJdkHome(selectedPath);
      if (!inspected) return;
      if (existing) {
        const keepCustomName = existing.name && existing.name !== existing.detectedName;
        settingsJavaConverterJdksDraft[index] = {
          ...inspected,
          name: keepCustomName ? existing.name : inspected.name
        };
      } else {
        settingsJavaConverterJdksDraft.push(inspected);
      }
      renderSettingsJdkTable();
    } catch (error) {
      console.warn("Failed to choose JDK folder:", error);
      alert("Unable to choose that JDK folder.");
    }
  }

  function renderSettingsGradleTable() {
    if (!settingsGradleList) return;
    settingsGradleList.innerHTML = "";
    const installations = normalizeJavaConverterGradleInstallations(settingsGradleInstallationsDraft);
    settingsGradleInstallationsDraft = installations;
    if (settingsGradleEmpty) settingsGradleEmpty.style.display = installations.length ? "none" : "";

    installations.forEach((installation, index) => {
      const row = document.createElement("div");
      row.className = "settings-table-row";
      row.setAttribute("role", "row");
      row.dataset.gradleIndex = String(index);
      row.dataset.gradleId = installation.id;
      row.dataset.gradlePath = installation.path;
      row.dataset.gradleVersion = installation.version;
      row.dataset.gradleDetectedName = installation.detectedName || "";
      row.dataset.gradleExecutablePath = installation.executablePath || "";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "rename-modal-input settings-gradle-name-input";
      nameInput.value = installation.name;
      nameInput.setAttribute("aria-label", "Gradle name");

      const versionText = document.createElement("span");
      versionText.className = "settings-table-version";
      versionText.textContent = installation.version || "Unknown";
      versionText.title = installation.version || "Unknown Gradle version";
      versionText.setAttribute("role", "cell");

      const pathText = document.createElement("span");
      pathText.className = "settings-table-path";
      pathText.textContent = installation.path;
      pathText.title = installation.path;
      pathText.setAttribute("role", "cell");

      const actions = document.createElement("span");
      actions.className = "settings-table-actions";
      actions.setAttribute("role", "cell");

      const chooseButton = document.createElement("button");
      chooseButton.type = "button";
      chooseButton.className = "settings-icon-action";
      chooseButton.title = "Choose Gradle folder";
      chooseButton.setAttribute("aria-label", "Choose Gradle folder");
      chooseButton.innerHTML = '<i class="bi bi-folder2-open" aria-hidden="true"></i>';
      chooseButton.addEventListener("click", () => chooseSettingsGradleFolder(index));

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "settings-icon-action";
      removeButton.title = "Remove Gradle";
      removeButton.setAttribute("aria-label", "Remove Gradle");
      removeButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
      removeButton.addEventListener("click", () => {
        settingsGradleInstallationsDraft = collectSettingsGradleRows();
        const removed = settingsGradleInstallationsDraft[index];
        settingsGradleInstallationsDraft.splice(index, 1);
        if (settingsGradleInstallationSelect?.value && removed?.id === settingsGradleInstallationSelect.value) {
          settingsGradleInstallationSelect.value = settingsGradleInstallationsDraft[0]?.id || "";
        }
        renderSettingsGradleTable();
      });

      actions.append(chooseButton, removeButton);
      row.append(nameInput, versionText, pathText, actions);
      settingsGradleList.append(row);
    });
    renderSettingsGradleInstallationSelect();
  }

  function collectSettingsGradleRows() {
    if (!settingsGradleList) return [];
    return Array.from(settingsGradleList.querySelectorAll(".settings-table-row"))
      .map((row) => normalizeJavaConverterGradleInstallation({
        id: row.dataset.gradleId || "",
        name: row.querySelector(".settings-gradle-name-input")?.value || "",
        path: row.dataset.gradlePath || "",
        version: row.dataset.gradleVersion || "",
        detectedName: row.dataset.gradleDetectedName || "",
        executablePath: row.dataset.gradleExecutablePath || ""
      }))
      .filter(Boolean);
  }

  function renderSettingsGradleInstallationSelect() {
    if (!settingsGradleInstallationSelect) return;
    const previousValue = settingsGradleInstallationSelect.value || getSelectedGradleInstallationId();
    settingsGradleInstallationSelect.innerHTML = "";
    const installations = normalizeJavaConverterGradleInstallations(settingsGradleInstallationsDraft);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = installations.length ? "Select Gradle installation" : "No Gradle installations configured";
    settingsGradleInstallationSelect.append(placeholder);
    installations.forEach((installation) => {
      const option = document.createElement("option");
      option.value = installation.id;
      option.textContent = installation.version
        ? `${installation.name} (${installation.version})`
        : installation.name;
      settingsGradleInstallationSelect.append(option);
    });
    const selected = installations.find((installation) => installation.id === previousValue) || installations[0];
    settingsGradleInstallationSelect.value = selected?.id || "";
  }

  async function inspectJavaConverterGradleHome(gradleHome) {
    const path = normalizeLocalPath(gradleHome);
    if (!path) return null;
    const gradleExecutable = getGradleExecutableForHome(path);
    if (!await canAccessLocalPath(gradleExecutable)) {
      alert("Choose a Gradle home folder that contains bin/gradle.");
      return null;
    }
    const version = await getGradleVersionForExecutable(gradleExecutable);
    if (!version) {
      alert("Unable to detect the Gradle version for that Gradle home.");
      return null;
    }
    const detectedName = `Gradle ${version}`;
    return {
      id: getGradleInstallationId(path),
      name: detectedName,
      path,
      version,
      detectedName,
      executablePath: gradleExecutable
    };
  }

  async function chooseSettingsGradleFolder(index = -1) {
    if (typeof Neutralino === "undefined" || !Neutralino.os?.showFolderDialog) {
      alert("Gradle selection requires the desktop app so folders can be selected from disk.");
      return;
    }
    try {
      settingsGradleInstallationsDraft = collectSettingsGradleRows();
      const existing = index >= 0 ? settingsGradleInstallationsDraft[index] : null;
      const selectedPath = await Neutralino.os.showFolderDialog(
        "Choose Gradle home folder",
        existing?.path ? { defaultPath: existing.path } : undefined
      );
      if (!selectedPath) return;
      const inspected = await inspectJavaConverterGradleHome(selectedPath);
      if (!inspected) return;
      if (existing) {
        const keepCustomName = existing.name && existing.name !== existing.detectedName;
        settingsGradleInstallationsDraft[index] = {
          ...inspected,
          name: keepCustomName ? existing.name : inspected.name
        };
      } else {
        settingsGradleInstallationsDraft.push(inspected);
      }
      renderSettingsGradleTable();
    } catch (error) {
      console.warn("Failed to choose Gradle folder:", error);
      alert("Unable to choose that Gradle folder.");
    }
  }

  async function chooseSettingsGradleUserHomeFolder() {
    if (typeof Neutralino === "undefined" || !Neutralino.os?.showFolderDialog) {
      alert("Gradle user home selection requires the desktop app so folders can be selected from disk.");
      return;
    }
    try {
      const selectedPath = await Neutralino.os.showFolderDialog(
        "Choose Gradle user home folder",
        settingsGradleUserHomeInput?.value ? { defaultPath: settingsGradleUserHomeInput.value } : undefined
      );
      if (selectedPath && settingsGradleUserHomeInput) {
        settingsGradleUserHomeInput.value = normalizeLocalPath(selectedPath);
      }
    } catch (error) {
      console.warn("Failed to choose Gradle user home:", error);
      alert("Unable to choose that Gradle user home folder.");
    }
  }

  async function refreshPreferencesAfterSettingsChange(options = {}) {
    const state = loadGlobalState();
    applyGlobalPreferences(state);
    app.modules?.keyboardShortcuts?.setOverrides?.(state.keyboardShortcutOverrides);
    applySupportedTextExtensionsPreference(state);
    if (options.reloadFolderTree && isFolderOpen) {
      const reloaded = await reloadOpenFolderTree({ skipSavedGraphPrompt: true });
      if (!reloaded) renderFilteredFolderTree();
    } else if (isFolderOpen) {
      renderFilteredFolderTree();
    }
    applyRecentItemLimits();
    applyDebugConsolePreferences();
    applyEditorFontPreferences(state);
    applyWordWrapPreference(state.wordWrapEnabled === true);
    updateWordWrapToggleButtons();
    applyAutocompletePreferences(getAutocompletePreferences(state));
    applyUnclosedBracketHighlightPreference(state.unclosedBracketHighlightEnabled === true);
    applyEditorSnippetPreferences();
    editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
    updateDocumentWordAutocompleteToggleButtons();
    updateSpaceToTabLabels();
    themePreferences.applySelectedAppTheme(state);
    applySyntaxHighlightColorsForActiveLanguage();
    renderEditorSyntaxHighlights();
    renderMarkdown();
    app.modules?.aiCompanionPanel?.refreshModeMessages?.();
    app.modules?.gitAiCommitSummary?.updateAvailability?.();
    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    if (activeGraphTab) {
      removeGraphRenderForTab(activeGraphTab.id);
      await renderGraphView();
    }
    if (options.refreshSettingsDialog && settingsModal?.style.display !== "none") {
      const activeSettingsTab = settingsScreen?.getActiveTab?.();
      showSettingsDialog();
      if (activeSettingsTab) settingsScreen?.selectTab?.(activeSettingsTab);
    }
  }

  async function revalidateActiveProjectJdkAfterSettingsChange() {
    const activeRuntime = javaWorkspaceController?.getRuntime?.();
    const selectedId = activeRuntime?.projectJdk?.id || javaWorkspaceController?.getModel?.()?.projectJdkId;
    if (!activeFolderPath || !selectedId) return;
    const configured = jdkRegistry?.resolve?.(selectedId);
    const validation = configured ? await jdkRegistry.validate(configured) : null;
    if (validation?.valid) return;
    await neutralinoLspBridge?.stopServerSessions?.("java");
    javaWorkspaceModel?.invalidate?.(activeFolderPath);
    await javaWorkspaceController?.openWorkspace?.(activeFolderPath, { traceReason: "project-jdk-invalid" });
  }

  async function saveSettingsDialog() {
    if (settingsDialogSaving) return;
    const previousKotlinAutoStart = isLanguageServerAutoStartEnabled("kotlin");
    const threshold = Number(settingsGraphAutoClusterThresholdInput?.value);
    if (!Number.isFinite(threshold) || threshold < 0) {
      alert("Enter a graph auto-clustering threshold of 0 or higher.");
      return;
    }
    const graphRenderWarningThreshold = Number(settingsGraphRenderWarningThresholdInput?.value);
    if (!Number.isFinite(graphRenderWarningThreshold) || graphRenderWarningThreshold < 0) {
      alert("Enter a graph render node warning threshold of 0 or higher.");
      return;
    }
    const graphMostReferencedPercent = Number(settingsGraphMostReferencedPercentInput?.value);
    if (!Number.isFinite(graphMostReferencedPercent) || graphMostReferencedPercent < 1 || graphMostReferencedPercent > 100) {
      alert("Enter a most referenced group size between 1 and 100.");
      return;
    }
    const graphStaticWarmupTicks = Number(settingsGraphStaticWarmupTicksInput?.value);
    if (!Number.isFinite(graphStaticWarmupTicks) || graphStaticWarmupTicks < 0 || graphStaticWarmupTicks > 200) {
      alert("Enter static warmup ticks between 0 and 200.");
      return;
    }
    const maxOpenTabs = Number(settingsMaxOpenTabsInput?.value);
    if (!Number.isInteger(maxOpenTabs) || maxOpenTabs < MIN_OPEN_TAB_LIMIT || maxOpenTabs > MAX_OPEN_TAB_LIMIT) {
      alert("Enter a maximum open tabs value between 1 and 60.");
      return;
    }
    const maxRecentFiles = Number(settingsMaxRecentFilesInput?.value);
    if (!Number.isFinite(maxRecentFiles) || maxRecentFiles < 0) {
      alert("Enter a maximum recent files value of 0 or higher.");
      return;
    }
    const maxRecentFolders = Number(settingsMaxRecentFoldersInput?.value);
    if (!Number.isFinite(maxRecentFolders) || maxRecentFolders < 0) {
      alert("Enter a maximum recent folders value of 0 or higher.");
      return;
    }
    const closedTabHistoryLimit = Number(settingsClosedTabHistoryLimitInput?.value);
    if (!Number.isFinite(closedTabHistoryLimit) || closedTabHistoryLimit < 0) {
      alert("Enter a closed tab history value of 0 or higher.");
      return;
    }
    const apiClientRecentHistoryLimit = Number(settingsApiClientRecentHistoryLimitInput?.value);
    if (!Number.isFinite(apiClientRecentHistoryLimit) || apiClientRecentHistoryLimit < 0) {
      alert("Enter an API Client history limit of 0 or higher.");
      return;
    }
    const apiClientMaxRedirects = Number(settingsApiClientMaxRedirectsInput?.value);
    if (!Number.isFinite(apiClientMaxRedirects) || apiClientMaxRedirects < 0) {
      alert("Enter an API Client max redirects value of 0 or higher.");
      return;
    }
    const apiClientTimeoutMs = Number(settingsApiClientTimeoutInput?.value);
    if (!Number.isFinite(apiClientTimeoutMs) || apiClientTimeoutMs < 1000) {
      alert("Enter an API Client timeout of 1000 ms or higher.");
      return;
    }
    const apiClientMaxResponseSizeMb = Number(settingsApiClientMaxResponseSizeInput?.value);
    if (!Number.isFinite(apiClientMaxResponseSizeMb) || apiClientMaxResponseSizeMb < 1) {
      alert("Enter an API Client max response size of 1 MB or higher.");
      return;
    }
    if (settingsApiClientProxyModeInput?.value === "custom") {
      try {
        const proxyUrl = new URL(settingsApiClientProxyUrlInput?.value || "");
        if (proxyUrl.protocol !== "http:") throw new Error("Only HTTP proxy URLs are supported.");
      } catch (_error) {
        alert("Enter a valid HTTP proxy URL or switch proxy mode to System / none.");
        return;
      }
    }
    const apiClientRequestSettings = normalizeApiClientRequestSettings({
      autoFollowRedirects: settingsApiClientAutoFollowRedirectsInput?.checked !== false,
      maxRedirects: apiClientMaxRedirects,
      preserveMethodOnRedirect: settingsApiClientPreserveMethodOnRedirectInput?.checked === true,
      redirectAuthHeaderPolicy: settingsApiClientRedirectAuthHeaderPolicyInput?.value,
      redirectCustomHeaderPolicy: settingsApiClientRedirectCustomHeaderPolicyInput?.value,
      timeoutMs: apiClientTimeoutMs,
      sslCertificateVerification: settingsApiClientSslVerificationInput?.checked !== false,
      trustedCertificates: getApiClientRequestSettings().trustedCertificates,
      cookieJarEnabled: settingsApiClientCookieJarInput?.checked !== false,
      sendNoCacheHeader: settingsApiClientSendNoCacheInput?.checked === true,
      maxResponseSizeBytes: Number(settingsApiClientMaxResponseSizeInput?.value) * 1024 * 1024,
      responseRenderMode: settingsApiClientResponseRenderModeInput?.value,
      decompressResponses: settingsApiClientDecompressResponsesInput?.checked !== false,
      proxyMode: settingsApiClientProxyModeInput?.value,
      proxyUrl: settingsApiClientProxyUrlInput?.value,
      httpVersion: settingsApiClientHttpVersionInput?.value
    });
    const workspaceSearchResultLimit = Number(settingsWorkspaceSearchResultLimitInput?.value);
    if (!Number.isFinite(workspaceSearchResultLimit) || workspaceSearchResultLimit < 1) {
      alert("Enter a workspace search result limit of 1 or higher.");
      return;
    }
    const jdtMaximumProblems = Number(settingsJdtMaximumProblemsInput?.value);
    if (!Number.isInteger(jdtMaximumProblems) || jdtMaximumProblems < 1 || jdtMaximumProblems > 100000) {
      alert("Enter a maximum stored Java problems value between 1 and 100000.");
      return;
    }
    const jdtInitialProblemLimit = Number(settingsJdtInitialProblemLimitInput?.value);
    if (!Number.isInteger(jdtInitialProblemLimit) || jdtInitialProblemLimit < 1 || jdtInitialProblemLimit > jdtMaximumProblems) {
      alert("Enter an initial Java problems value between 1 and the maximum stored problems value.");
      return;
    }
    const supportedTextExtensions = normalizeSupportedTextExtensionsSetting(settingsSupportedTextExtensionsInput?.value || "");
    if (!supportedTextExtensions.length) {
      alert("Enter at least one supported file extension.");
      return;
    }
    const contextMenuTooltipDelayMs = Number(settingsContextMenuTooltipDelayInput?.value);
    if (!Number.isFinite(contextMenuTooltipDelayMs) || contextMenuTooltipDelayMs < 0) {
      alert("Enter a menu tooltip delay of 0 or higher.");
      return;
    }
    const folderTreeExpandLimitThreshold = Number(settingsFolderTreeExpandLimitThresholdInput?.value);
    if (!Number.isFinite(folderTreeExpandLimitThreshold) || folderTreeExpandLimitThreshold < 0) {
      alert("Enter a large tree expand threshold of 0 or higher.");
      return;
    }
    const folderTreeExpandLimitDepth = Number(settingsFolderTreeExpandLimitDepthInput?.value);
    if (!Number.isFinite(folderTreeExpandLimitDepth) || folderTreeExpandLimitDepth < 1) {
      alert("Enter a large tree expand depth of 1 or higher.");
      return;
    }
    const graphColorSchemes = collectGraphColorSchemes();
    const graphNodeDefaultColor = graphColorSchemes.dark.nodeDefault;
    const graphLinkColor = graphColorSchemes.dark.link;
    const graphExternalDependencyColor = graphColorSchemes.dark.externalDependency;
    const graphExternalDependencyLineColor = graphColorSchemes.dark.externalDependencyLine;
    const graphMissingDependencyColor = graphColorSchemes.dark.missingDependency;
    const graphMissingDependencyLineColor = graphColorSchemes.dark.missingDependencyLine;
    const graphTagNodeColor = graphColorSchemes.dark.tagNode;
    const graphTagLineColor = graphColorSchemes.dark.tagLine;
    const graphClusterNodeColor = graphColorSchemes.dark.clusterNode;
    const graphFindHighlightColor = graphColorSchemes.dark.findHighlight;
    const debugEnabled = !!settingsDebugEnabledInput?.checked;
    const debugWriteToFile = !!settingsDebugWriteFileInput?.checked;
    const debugLevel = normalizeDebugLevel(settingsDebugLevelInput?.value || DEFAULT_DEBUG_LEVEL);
    const debugLogPath = normalizeLocalPath(settingsDebugLogPathInput?.value || "");
    const debugMaxLogSizeMb = Number(settingsDebugMaxLogSizeInput?.value);
    const debugMaxLogFiles = Number(settingsDebugMaxLogFilesInput?.value);
    const debugCategories = collectDebugCategorySettings();
    const startupBehavior = normalizeStartupBehavior(settingsStartupBehaviorInput?.value);
    const menuLayout = applicationMenu?.normalizeLayout?.(settingsMenuLayoutInput?.value) || "full";
    const appHeaderSpacing = normalizeAppHeaderSpacing(settingsAppHeaderSpacingInput?.value);
    const tabStyle = normalizeTabStyle(settingsTabStyleInput?.value);
    const sidebarRailStyle = normalizeSidebarRailStyle(settingsSidebarRailStyleInput?.value);
    const sidebarRailIconVisibility = sidebarRailPreferences.normalizeVisibility({
      git: settingsSidebarRailShowGitInput?.checked !== false,
      "api-client": settingsSidebarRailShowApiClientInput?.checked !== false,
      "regex-tester": settingsSidebarRailShowRegexTesterInput?.checked !== false,
      "ai-companion": settingsSidebarRailShowAiCompanionInput?.checked !== false,
      settings: settingsSidebarRailShowSettingsInput?.checked !== false
    });
    const sidebarRailIconOrder = sidebarRailPreferences.normalizeOrder(loadGlobalState().sidebarRailIconOrder);
    const restoreLastFolderOnStartup = settingsRestoreLastFolderOnStartupInput?.checked !== false;
    const previousShowGitProjectFolder = shouldShowGitProjectFolder();
    const showGitProjectFolder = settingsShowGitFolderInput?.checked === true;
    const previousShowMdEditorProjectFolder = shouldShowMdEditorProjectFolder();
    const showMdEditorProjectFolder = settingsShowMdEditorFolderInput?.checked === true;
    const previousHiddenFolderNames = getHiddenFolderNamesSetting();
    const hiddenFolderNames = normalizeHiddenFolderNames(settingsHiddenFolderNamesInput?.value).join(", ");
    const fileOpeningModes = fileOpeningModeSettings.getDraft();
    const selectedExternalFileChangeBehaviorInput = Array.from(settingsExternalFileChangeBehaviorInputs).find((input) => input.checked);
    const externalFileChangeBehavior = normalizeExternalFileChangeBehavior(selectedExternalFileChangeBehaviorInput?.value);
    const editorFontFamily = normalizeEditorFontFamily(settingsEditorFontFamilyInput?.value);
    const editorFontSize = normalizeEditorFontSize(settingsEditorFontSizeInput?.value);
    const rawJdtInteractiveRequestTimeoutMs = Number(settingsJdtInteractiveRequestTimeoutInput?.value);
    if (!Number.isFinite(rawJdtInteractiveRequestTimeoutMs) || rawJdtInteractiveRequestTimeoutMs < 500 || rawJdtInteractiveRequestTimeoutMs > 60000) {
      alert("Enter a JDT interactive request timeout between 500 and 60000 ms.");
      return;
    }
    const jdtInteractiveRequestTimeoutMs = normalizeJdtInteractiveRequestTimeoutMs(rawJdtInteractiveRequestTimeoutMs);
    const spacesPerIndentLevel = Number(settingsSpacesPerIndentLevelInput?.value);
    if (!Number.isFinite(spacesPerIndentLevel) || spacesPerIndentLevel < 1) {
      alert("Enter spaces per indent level of 1 or higher.");
      return;
    }
    const tabsPerIndentLevel = Number(settingsTabsPerIndentLevelInput?.value);
    if (!Number.isFinite(tabsPerIndentLevel) || tabsPerIndentLevel < 1) {
      alert("Enter tabs per indent level of 1 or higher.");
      return;
    }
    const documentWordAutocompleteEnabled = !!settingsDocumentWordAutocompleteInput?.checked;
    const languageAutocompleteEnabled = !!settingsLanguageAutocompleteInput?.checked;
    const languageServerAutocompleteEnabled = !!settingsLanguageServerAutocompleteInput?.checked;
    const snippetAutocompleteEnabled = !!settingsSnippetAutocompleteInput?.checked;
    const unclosedBracketHighlightEnabled = !!settingsUnclosedBracketHighlightInput?.checked;
    const aiProviderRequestDelayMs = Number(settingsAiProviderRequestDelayInput?.value);
    if (!Number.isFinite(aiProviderRequestDelayMs) || aiProviderRequestDelayMs < 0 || aiProviderRequestDelayMs > 60000) {
      alert("Enter an AI provider request spacing between 0 and 60000 ms.");
      return;
    }
    const aiMaxTokensPerChatMinute = Number(settingsAiMaxTokensPerChatMinuteInput?.value);
    if (!Number.isFinite(aiMaxTokensPerChatMinute) || aiMaxTokensPerChatMinute < 0 || aiMaxTokensPerChatMinute > 1000000) {
      alert("Enter AI max tokens per chat minute between 0 and 1000000.");
      return;
    }
    const aiMaxTasksPerChat = Number(settingsAiMaxTasksPerChatInput?.value);
    if (!Number.isFinite(aiMaxTasksPerChat) || aiMaxTasksPerChat < 1 || aiMaxTasksPerChat > 200) {
      alert("Enter AI max tasks per chat between 1 and 200.");
      return;
    }
    const aiAgentMaxResponseTokens = Number(settingsAiAgentMaxResponseTokensInput?.value);
    if (!Number.isFinite(aiAgentMaxResponseTokens) || aiAgentMaxResponseTokens < 0 || aiAgentMaxResponseTokens > 128000) {
      alert("Enter AI max tokens per response between 0 and 128000 (0 disables the cap).");
      return;
    }
    const aiAutocompleteIdleMs = Number(settingsAiAutocompleteIdleMsInput?.value);
    if (!Number.isFinite(aiAutocompleteIdleMs) || aiAutocompleteIdleMs < 100) {
      alert("Enter an AI autocomplete idle trigger of 100 ms or higher.");
      return;
    }
    const aiAutocompleteBlockIdleMs = Number(settingsAiAutocompleteBlockIdleMsInput?.value);
    if (!Number.isFinite(aiAutocompleteBlockIdleMs) || aiAutocompleteBlockIdleMs < 100) {
      alert("Enter an AI autocomplete block idle trigger of 100 ms or higher.");
      return;
    }
    const aiAutocompleteCommentIdleMs = Number(settingsAiAutocompleteCommentIdleMsInput?.value);
    if (!Number.isFinite(aiAutocompleteCommentIdleMs) || aiAutocompleteCommentIdleMs < 100) {
      alert("Enter an AI autocomplete comment idle trigger of 100 ms or higher.");
      return;
    }
    const aiAutocompleteRejectCharacters = Number(settingsAiAutocompleteRejectCharsInput?.value);
    if (!Number.isFinite(aiAutocompleteRejectCharacters) || aiAutocompleteRejectCharacters < 1) {
      alert("Enter AI autocomplete chars after reject of 1 or higher.");
      return;
    }
    const aiAutocompleteRejectDelayMs = Number(settingsAiAutocompleteRejectDelayInput?.value);
    if (!Number.isFinite(aiAutocompleteRejectDelayMs) || aiAutocompleteRejectDelayMs < 0) {
      alert("Enter AI autocomplete delay after reject of 0 ms or higher.");
      return;
    }
    const aiCompanionSettingsValue = aiCompanionSettings?.normalize ? aiCompanionSettings.normalize({
      enabled: !!settingsAiEnabledInput?.checked,
      intentContractsEnabled: !!settingsAiIntentContractsEnabledInput?.checked,
      intentCompletionSteeringEnabled: !!settingsAiIntentSteeringEnabledInput?.checked,
      intentMaxCompletionRevisions: settingsAiIntentMaxRevisionsInput?.value,
      providerMode: settingsAiProviderModeInput?.value,
      baseUrl: settingsAiBaseUrlInput?.value,
      apiKey: settingsAiApiKeyInput?.value,
      model: settingsAiModelInput?.value,
      litellmModelAlias: settingsAiLiteLlmAliasInput?.value,
      litellmRoutingConfig: settingsAiLiteLlmRoutingInput?.value,
      geminiConnectorBaseUrl: settingsAiGeminiBaseUrlInput?.value,
      geminiConnectorId: settingsAiGeminiConnectorIdInput?.value,
      geminiConnectorApiKey: settingsAiGeminiApiKeyInput?.value,
      trustedCertificates: getAiCompanionSettings().trustedCertificates,
      chatEnabled: settingsAiChatEnabledInput?.checked !== false,
      autocompleteEnabled: !!settingsAiAutocompleteEnabledInput?.checked,
      agentEnabled: !!settingsAiAgentEnabledInput?.checked,
      gitSummaryEnabled: settingsAiGitSummaryEnabledInput?.checked !== false,
      providerRequestDelayMs: aiProviderRequestDelayMs,
      maxTokensPerChatMinute: aiMaxTokensPerChatMinute,
      maxTasksPerChat: aiMaxTasksPerChat,
      agentMaxResponseTokens: aiAgentMaxResponseTokens,
      showReasoning: settingsAiShowReasoningInput?.checked !== false,
      debugLogFullAiPayloads: settingsDebugAiFullPayloadsInput?.checked === true,
      inputSubmitMode: settingsAiInputSubmitModeInput?.value,
      autocompleteLineEnabled: !!settingsAiAutocompleteLineEnabledInput?.checked,
      autocompleteBlockEnabled: !!settingsAiAutocompleteBlockEnabledInput?.checked,
      autocompleteCommentEnabled: !!settingsAiAutocompleteCommentEnabledInput?.checked,
      autocompleteIdleMs: aiAutocompleteIdleMs,
      autocompleteBlockIdleMs: aiAutocompleteBlockIdleMs,
      autocompleteCommentIdleMs: aiAutocompleteCommentIdleMs,
      autocompleteRejectCharacters: aiAutocompleteRejectCharacters,
      autocompleteRejectDelayMs: aiAutocompleteRejectDelayMs,
      autocompletePrefixLines: Number(settingsAiAutocompletePrefixLinesInput?.value),
      autocompleteSuffixLines: Number(settingsAiAutocompleteSuffixLinesInput?.value),
      autocompleteModelFamily: settingsAiAutocompleteModelFamilyInput?.value,
      autocompleteContextProvidersEnabled: !!settingsAiAutocompleteContextProvidersEnabledInput?.checked,
      agentAutoRunCommands: !!settingsAiAgentAutoRunCommandsInput?.checked,
      agentConfirmBeforeWrite: settingsAiAgentConfirmBeforeWriteInput?.checked !== false,
      aiSecurityPolicy: aiSecuritySettings?.collect?.() || aiCompanionSettings?.defaults?.aiSecurityPolicy
    }) : {};
    const languageServerAutoStartPreferences = {
      typescript: settingsLspTypeScriptAutoStartInput?.checked !== false,
      java: settingsLspJavaAutoStartInput?.checked !== false,
      kotlin: settingsLspKotlinAutoStartInput?.checked !== false,
      xml: settingsLspXmlAutoStartInput?.checked !== false,
      python: settingsLspPythonAutoStartInput?.checked !== false,
      html: settingsLspHtmlAutoStartInput?.checked !== false,
      css: settingsLspCssAutoStartInput?.checked !== false,
      json: settingsLspJsonAutoStartInput?.checked !== false,
      yaml: settingsLspYamlAutoStartInput?.checked !== false,
      bash: settingsLspBashAutoStartInput?.checked !== false,
      dockerfile: settingsLspDockerfileAutoStartInput?.checked !== false,
      "windows-scripting": settingsLspWindowsScriptingAutoStartInput?.checked !== false
    };
    let editorSnippetPreferences = getEditorSnippetPreferences();
    if (snippetRegistry) {
      const activeSnippet = getSettingsSelectedSnippet();
      if (activeSnippet && hasSettingsSnippetFormChanges(activeSnippet)) {
        const snippet = collectSettingsSnippetForm();
        if (!snippet) return;
        settingsSnippetPreferencesDraft = snippetRegistry.saveSnippet(settingsSnippetPreferencesDraft, settingsSnippetLanguageId, snippet);
      }
      editorSnippetPreferences = snippetRegistry.normalizeSnippetPreferences(settingsSnippetPreferencesDraft);
    }
    const codeConverterJavaJdks = collectSettingsJdkRows();
    const codeConverterGradleInstallations = collectSettingsGradleRows();
    const selectedGradleModeInput = Array.from(settingsGradleModeInputs).find((input) => input.checked);
    const codeConverterGradleMode = normalizeGradleMode(selectedGradleModeInput?.value);
    const codeConverterGradleOffline = !!settingsGradleOfflineInput?.checked;
    const codeConverterGradleMetadataFailure = normalizeGradleMetadataFailure(settingsGradleMetadataFailureInput?.value);
    const codeConverterGradleUserHome = normalizeLocalPath(settingsGradleUserHomeInput?.value || "");
    const selectedGradleInstallationId = String(settingsGradleInstallationSelect?.value || "").trim();
    if (codeConverterGradleMode === "local" && !selectedGradleInstallationId) {
      alert("Choose a Gradle installation or switch Gradle mode to wrapper/automatic.");
      return;
    }
    if (debugEnabled && debugWriteToFile && !debugLogPath) {
      alert("Enter a debug log file path or turn off debug file logging.");
      return;
    }
    if (!Number.isFinite(debugMaxLogSizeMb) || debugMaxLogSizeMb < 1) {
      alert("Enter a debug max log size of 1 MB or higher.");
      return;
    }
    if (!Number.isFinite(debugMaxLogFiles) || debugMaxLogFiles < 1) {
      alert("Enter a debug max log files value of 1 or higher.");
      return;
    }
    const themeDraft = appThemeDraft || createNormalizedThemeDraft();
    const syntaxHighlightColors = collectSyntaxColorSettings();
    setSettingsDialogSaving(true);
    try {
      await saveAiApprovalPoliciesFromSettings();
      await aiApprovalSettings?.saveAdvanced?.();
      saveGlobalState({
        debugEnabled,
        debugLevel,
        debugLogPath,
        debugMaxLogFiles: Math.min(1000, Math.floor(debugMaxLogFiles)),
        debugMaxLogSizeMb: Math.min(1024, Math.floor(debugMaxLogSizeMb)),
        debugCategories,
        debugWriteToFile,
        graphAutoClusterLargeMapsEnabled: !!settingsGraphAutoClusterLargeMapsInput?.checked,
        graphAutoClusterThreshold: Math.min(100000, Math.floor(threshold)),
        graphLargeMapHoverDimOtherNodes: !!settingsGraphLargeHoverDimInput?.checked,
        graphLargeMapHoverShowConnectedLabels: !!settingsGraphLargeHoverLabelsInput?.checked,
        graphLargeMapHoverHighlightConnectedLines: !!settingsGraphLargeHoverLinesInput?.checked,
        graphRenderWarningThreshold: Math.min(100000, Math.floor(graphRenderWarningThreshold)),
        graphMostReferencedPercent: Math.max(1, Math.min(100, Math.floor(graphMostReferencedPercent))),
        graphStaticWarmupTicks: Math.max(0, Math.min(200, Math.floor(graphStaticWarmupTicks))),
        graphShowFileExtensions: !!settingsGraphShowFileExtensionsInput?.checked,
        graphColorSchemes,
        graphNodeDefaultColor,
        graphLinkColor,
        graphExternalDependencyColor,
        graphExternalDependencyLineColor,
        graphMissingDependencyColor,
        graphMissingDependencyLineColor,
        graphTagNodeColor,
        graphTagLineColor,
        graphClusterNodeColor,
        graphFindHighlightColor,
        confirmCancelBackgroundProcess: !!settingsConfirmCancelBackgroundProcessInput?.checked,
        confirmExitApplication: !!settingsConfirmExitApplicationInput?.checked,
        confirmOpenManyGraphNodes: !!settingsConfirmOpenManyGraphNodesInput?.checked,
        confirmDeleteFiles: !!settingsConfirmDeleteFilesInput?.checked,
        confirmMoveFiles: !!settingsConfirmMoveFilesInput?.checked,
        confirmResetState: !!settingsConfirmResetStateInput?.checked,
        confirmResetJdtWorkspace: !!settingsConfirmResetJdtWorkspaceInput?.checked,
        confirmJavaBuildPathRebuild: !!settingsConfirmJavaBuildPathRebuildInput?.checked,
        confirmEditedPromptAttachmentRemoval: !!settingsConfirmEditedPromptAttachmentRemovalInput?.checked,
        contextMenuTooltipDelayMs: Math.min(10000, Math.floor(contextMenuTooltipDelayMs)),
        sidebarRailStyle,
        sidebarRailIconOrder,
        sidebarRailIconVisibility,
        workspaceSearchResultLimit: normalizeWorkspaceSearchResultLimit(workspaceSearchResultLimit),
        jdtMaximumProblems: normalizeJdtMaximumProblems(jdtMaximumProblems),
        jdtInitialProblemLimit: normalizeJdtInitialProblemLimit(jdtInitialProblemLimit, jdtMaximumProblems),
        ajdtDiagnosticsEnabled: settingsAjdtDiagnosticsEnabledInput?.checked === true,
        supportedTextExtensions: supportedTextExtensions.join(", "),
        restoreLastFolderOnStartup,
        showGitProjectFolder,
        showMdEditorProjectFolder,
        hiddenFolderNames,
        menuLayout,
        appHeaderSpacing,
        tabStyle,
        startupBehavior,
        fileOpeningModes,
        folderTreeExpandLimitThreshold: normalizeFolderTreeExpandLimitThreshold(folderTreeExpandLimitThreshold),
        folderTreeExpandLimitDepth: normalizeFolderTreeExpandLimitDepth(folderTreeExpandLimitDepth),
        externalFileChangeBehavior,
        editorFontFamily,
        editorFontSize,
        jdtInteractiveRequestTimeoutMs,
        spacesPerIndentLevel: normalizeSpacesPerIndentLevel(spacesPerIndentLevel),
        tabsPerIndentLevel: normalizeTabsPerIndentLevel(tabsPerIndentLevel),
        documentWordAutocompleteEnabled,
        languageAutocompleteEnabled,
        languageServerAutocompleteEnabled,
        languageServerAutoStartPreferences,
        snippetAutocompleteEnabled,
        unclosedBracketHighlightEnabled,
        editorSnippetPreferences,
        aiCompanionSettings: aiCompanionSettingsValue,
        codeConverterGradleInstallations,
        codeConverterGradleMetadataFailure,
        codeConverterGradleMode,
        codeConverterGradleOffline,
        codeConverterGradleUserHome,
        codeConverterJavaJdks,
        codeConverterSelectedGradleInstallationId: selectedGradleInstallationId,
        maxOpenTabs,
        maxRecentFiles: Math.min(100, Math.floor(maxRecentFiles)),
        maxRecentFolders: Math.min(100, Math.floor(maxRecentFolders)),
        closedTabHistoryLimit: Math.min(100, Math.floor(closedTabHistoryLimit)),
        apiClientRecentHistoryLimit: normalizeApiClientRecentHistoryLimit(apiClientRecentHistoryLimit),
        apiClientRequestSettings,
        theme: getThemeDraftState().theme,
        themeSelections: themeDraft.themeSelections,
        customThemes: themeDraft.customThemes,
        syntaxHighlightColors,
        keyboardShortcutOverrides: keyboardShortcutsSettings?.getDraft?.() || {}
      });
      fileOpeningModeSettings.commit(fileOpeningModes);
      jdtProxyClient?.configure?.();
      if (previousKotlinAutoStart !== languageServerAutoStartPreferences.kotlin) {
        await kotlinWorkspaceCoordinator?.setEnabled?.(languageServerAutoStartPreferences.kotlin);
        await editorViewManager?.getActiveCodeMirrorEditor?.()?.refreshLspSessionForActivePath?.();
      }
      closedTabHistory?.trim?.();
      void appDebugLog("info", "[tabs-session] Saved interface startup preferences", {
        startupBehavior,
        restoreLastFolderOnStartup,
        showGitProjectFolder,
        showMdEditorProjectFolder,
        fileOpeningModeOverrides: Object.keys(fileOpeningModes.modes).length,
        folderTreeExpandLimitThreshold: normalizeFolderTreeExpandLimitThreshold(folderTreeExpandLimitThreshold),
        folderTreeExpandLimitDepth: normalizeFolderTreeExpandLimitDepth(folderTreeExpandLimitDepth),
        editorFontFamily,
        editorFontSize,
        codeConverterGradleInstallations: codeConverterGradleInstallations.length,
        codeConverterGradleMetadataFailure,
        codeConverterGradleMode,
        codeConverterGradleOffline,
        codeConverterJavaJdks: codeConverterJavaJdks.length
      });
      applicationMenu?.applyLayout?.(menuLayout);
      await apiClient?.trimRecentHistoryToLimit?.();
      await refreshPreferencesAfterSettingsChange({
        refreshSettingsDialog: false,
        reloadFolderTree: isFolderOpen && (
          showGitProjectFolder !== previousShowGitProjectFolder
          || showMdEditorProjectFolder !== previousShowMdEditorProjectFolder
          || hiddenFolderNames !== previousHiddenFolderNames
        )
      });
      await revalidateActiveProjectJdkAfterSettingsChange();
      await javaBuildPath?.refreshProjectJdks?.();
      await javaBuildPath?.refreshGradleInstallations?.();
      syntaxHighlightColorDraft = null;
      appThemeDraft = null;
      settingsModal.style.display = "none";
    } catch (error) {
      console.warn("Failed to save settings:", error);
      alert(error?.message || "Unable to save settings.");
    } finally {
      setSettingsDialogSaving(false);
    }
  }

  async function clearBrowserCacheStorage() {
    let cacheCount = 0;
    if (window.caches?.keys) {
      try {
        const cacheNames = await window.caches.keys();
        cacheCount = cacheNames.length;
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
        logCacheClear("Clear browser cache", { cacheCount, available: true });
        return true;
      } catch (error) {
        console.warn("Failed to clear browser caches:", error);
        logCacheClear("Clear browser cache failed", { message: error?.message || String(error || "") });
        return false;
      }
    }
    logCacheClear("Clear browser cache", { cacheCount, available: false });
    return false;
  }

  async function clearAllCachesFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear all caches? Open documents, preferences, and recent history will not be removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;

    logCacheClear("Clear all caches", { trigger: options.trigger || "settings" });
    await invalidateWorkspaceDerivedState({
      reason: options.reason || "settings-clear-all-caches",
      reloadTree: !!isFolderOpen
    });
    await clearBrowserCacheStorage();

    if (options.notify !== false) window.alert("All caches cleared.");
    return true;
  }

  async function clearGraphPersistenceCacheFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear graph persistence cache? Open documents, preferences, and recent history will not be removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;
    clearGraphPersistenceCache({ trigger: options.trigger || "settings" });
    if (options.notify !== false) window.alert("Graph persistence cache cleared.");
    return true;
  }

  async function clearMarkdownContentCacheFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear Markdown content cache? Open documents, preferences, and recent history will not be removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;
    clearMarkdownContentCache({ trigger: options.trigger || "settings" });
    if (options.notify !== false) window.alert("Markdown content cache cleared.");
    return true;
  }

  async function clearGraphRenderCacheFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear graph render cache? Open documents, preferences, and recent history will not be removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;
    clearGraphRenderCache({ trigger: options.trigger || "settings" });

    if (tabs.some((tab) => tab.id === activeTabId && tab.type === "graph")) {
      renderGraphView();
    }

    if (options.notify !== false) window.alert("Graph render cache cleared.");
    return true;
  }

  async function clearBrowserCacheFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear browser cache storage? Open documents, preferences, and recent history will not be removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;
    await clearBrowserCacheStorage();
    if (options.notify !== false) window.alert("Browser cache cleared.");
    return true;
  }

  async function clearPreferencesFromSettings(options = {}) {
    const restored = await restoreDefaultPreferences({
      confirm: options.confirm !== false,
      notify: options.notify !== false,
      message: "Clear preferences and restore defaults? Open documents and recent history are not removed."
    });
    if (restored && settingsModal?.style.display !== "none") {
      showSettingsDialog();
    }
    if (restored) {
      applyEditorFontPreferences();
      applySupportedTextExtensionsPreference();
      if (isFolderOpen) renderFilteredFolderTree();
      applySyntaxHighlightColorsForActiveLanguage();
      renderEditorSyntaxHighlights();
      renderMarkdown();
    }
    return restored;
  }

  async function resetThemesFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Reset themes? This deletes every custom theme and restores the default light and dark themes. Other preferences are not changed.", { confirmLabel: "Reset", confirmVariant: "danger" })) return false;

    const registry = getAppThemeRegistry();
    saveGlobalState({
      themeSelections: Object.assign({}, registry?.DEFAULT_SELECTIONS || { light: "default-light", dark: "default-dark" }),
      customThemes: { light: [], dark: [] }
    });
    appThemeDraft = createNormalizedThemeDraft();
    renderThemeSettings();
    restoreSavedAppTheme();
    renderEditorSyntaxHighlights?.();
    renderMarkdown?.();

    if (options.notify !== false) window.alert("Theme customizations reset to defaults.");
    return true;
  }

  async function clearRecentHistoryFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !await confirmWithAppModal("Clear recent file and folder history? Open documents and preferences are not removed.", { confirmLabel: "Clear", confirmVariant: "danger" })) return false;
    clearRecentHistory();
    if (options.notify !== false) window.alert("Recent history cleared.");
    return true;
  }

  function isDraftBackedTab(tab) {
    if (!tab) return false;
    if (tab.draft || tab.draftFilePath || tab.draftPath) return true;
    const sourcePath = normalizeLocalPath(tab.sourceFilePath || tab.openedSource?.path || "");
    const normalizedSourcePath = sourcePath.replace(/\\/g, "/").toLowerCase();
    const profileDir = String(app.constants?.DESKTOP_PROFILE_DIR || ".md-editor").toLowerCase();
    return normalizedSourcePath.includes(`/${profileDir}/drafts/`) || normalizedSourcePath.startsWith(`${profileDir}/drafts/`);
  }

  async function clearDraftsFromSettings() {
    const draftTabs = tabs.filter(isDraftBackedTab);
    const tabWarning = draftTabs.length
      ? `\n\n${draftTabs.length} open draft-backed tab${draftTabs.length === 1 ? "" : "s"} will be closed. Unsaved draft content in those tabs will be discarded.`
      : "";
    if (!await confirmWithAppModal(`Delete all saved tab drafts from the draft folder?${tabWarning}\n\nThis cannot be undone.`, { confirmLabel: "Delete", confirmVariant: "danger" })) return false;

    if (draftTabs.length) {
      closeTabsByIds(draftTabs.map((tab) => tab.id), { allowEmpty: true, promptForUnsaved: false });
    }

    if (!tabSessionPersistence?.cleanupAllDrafts) {
      window.alert("Draft cleanup is not available in this runtime.");
      return false;
    }

    const result = await tabSessionPersistence.cleanupAllDrafts();
    showSettingsDialog();
    window.alert(`Drafts cleared.${Number.isFinite(result?.deleted) ? ` Deleted ${result.deleted} draft item${result.deleted === 1 ? "" : "s"}.` : ""}`);
    return true;
  }

  async function resetAllFromSettings() {
    if (shouldConfirmResetState() && !await confirmWithAppModal("Reset all settings data? This clears cache, preferences, recent file/folder history, and saved tab drafts. Open documents are not removed.", { confirmLabel: "Reset", confirmVariant: "danger" })) return;
    await clearAllCachesFromSettings({ confirm: false, notify: false, trigger: "settings-reset-all", reason: "settings-reset-all" });
    await clearRecentHistoryFromSettings({ confirm: false, notify: false });
    await clearPreferencesFromSettings({ confirm: false, notify: false });
    if (tabSessionPersistence?.cleanupAllDrafts) {
      await tabSessionPersistence.cleanupAllDrafts();
    }
    showSettingsDialog();
    window.alert("Cache, preferences, recent history, and saved tab drafts reset.");
  }

  async function openProfileDataLocationFromSettings() {
    if (isNeutralinoRuntime() && Neutralino.os?.open && recentItems.getProfileDataDirPath) {
      try {
        const profileDir = await recentItems.getProfileDataDirPath();
        if (!profileDir) throw new Error("Profile folder path is not available.");
        await Neutralino.os.open(profileDir);
      } catch (error) {
        console.error("Failed to open profile folder:", error);
        window.alert("Unable to open the profile folder.");
      }
      return;
    }

    window.alert("In the web app, the equivalent profile data is stored in this site's browser storage (localStorage, IndexedDB, and Cache Storage). Browsers do not expose a folder that MD-Editor can open directly.");
  }

  function getDebugLogPathFromSettings() {
    return normalizeLocalPath(settingsDebugLogPathInput?.value || getDebugPreferences().logPath || "");
  }

  async function openLocalFileWithDefaultApp(filePath) {
    if (!isNeutralinoRuntime() || typeof Neutralino === "undefined") throw new Error("Desktop runtime is not available.");
    const osName = typeof NL_OS !== "undefined" ? String(NL_OS).toLowerCase() : "";
    if (Neutralino.os?.execCommand) {
      const quotedPath = quoteCommandArg(filePath);
      const command = osName.includes("windows")
        ? `cmd /c start "" ${quotedPath}`
        : osName.includes("darwin") || osName.includes("mac")
          ? `open ${quotedPath}`
          : `xdg-open ${quotedPath}`;
      const result = await Neutralino.os.execCommand(command);
      if (Number(result?.exitCode || 0) !== 0) throw new Error(result?.stdErr || result?.stdOut || `Open command failed with exit code ${result?.exitCode}`);
      return;
    }
    if (Neutralino.os?.open) {
      await Neutralino.os.open(filePath);
      return;
    }
    throw new Error("No supported default app launcher is available.");
  }

  async function openDebugLogInAppFromSettings() {
    const logPath = getDebugLogPathFromSettings();
    if (!logPath) {
      window.alert("Enter a debug log file path before opening the debug log.");
      return;
    }
    if (!isNeutralinoRuntime() || !Neutralino.filesystem?.readFile) {
      window.alert("Debug log files can only be opened from the desktop app.");
      return;
    }

    try {
      await flushDebugLogFileWrites();
      const content = await Neutralino.filesystem.readFile(logPath);
      openSidebarFileInPermanentTab(content || "", getFileName(logPath) || "Debug log", {
        name: getFileName(logPath) || "Debug log",
        path: logPath
      });
      hideSettingsDialog();
    } catch (error) {
      console.error("Failed to open debug log in app:", error);
      window.alert("Unable to open the debug log file in the app.");
    }
  }

  async function openDebugLogInDefaultAppFromSettings() {
    const logPath = getDebugLogPathFromSettings();
    if (!logPath) {
      window.alert("Enter a debug log file path before opening the debug log.");
      return;
    }
    if (!isNeutralinoRuntime() || (!Neutralino.os?.execCommand && !Neutralino.os?.open)) {
      window.alert("Debug log files can only be opened from the desktop app.");
      return;
    }

    try {
      await flushDebugLogFileWrites();
      await openLocalFileWithDefaultApp(logPath);
    } catch (error) {
      console.error("Failed to open debug log in default app:", error);
      window.alert("Unable to open the debug log file in the default app.");
    }
  }

  async function clearDebugLogFromSettings() {
    const logPath = getDebugLogPathFromSettings();
    if (!logPath) {
      window.alert("Enter a debug log file path before clearing the debug log.");
      return;
    }
    if (!isNeutralinoRuntime() || !Neutralino.filesystem?.writeFile) {
      window.alert("Debug log files can only be cleared from the desktop app.");
      return;
    }

    try {
      await flushDebugLogFileWrites();
      await Neutralino.filesystem.writeFile(logPath, "");
      window.alert("Debug log cleared.");
    } catch (error) {
      console.error("Failed to clear debug log:", error);
      window.alert("Unable to clear the debug log file.");
    }
  }

  function createEmptyCodeConverterProgress() {
    return {
      running: false,
      startedAt: 0,
      finishedAt: 0,
      stage: "",
      stageLabel: "Waiting to start",
      completed: 0,
      total: 0,
      currentUnit: "",
      currentUnitCompleted: 0,
      currentUnitTotal: 0,
      currentFile: "",
      lastRate: 0
    };
  }

  function formatCodeConverterDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    const two = (value) => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${two(minutes)}:${two(remainingSeconds)}` : `${two(minutes)}:${two(remainingSeconds)}`;
  }

  function getCodeConverterElapsedSeconds() {
    if (!codeConverterProgress.startedAt) return 0;
    const endTime = codeConverterProgress.running ? Date.now() : codeConverterProgress.finishedAt || Date.now();
    return Math.max(0, (endTime - codeConverterProgress.startedAt) / 1000);
  }

  function getCodeConverterProgressPercent() {
    const total = Number(codeConverterProgress.total) || 0;
    if (total <= 0) return null;
    const completed = Math.max(0, Math.min(total, Number(codeConverterProgress.completed) || 0));
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  }

  function getCodeConverterEtaSeconds() {
    const total = Number(codeConverterProgress.total) || 0;
    const completed = Number(codeConverterProgress.completed) || 0;
    const elapsed = getCodeConverterElapsedSeconds();
    if (!codeConverterProgress.running || total <= 0 || completed <= 0 || completed >= total || elapsed < 5) return null;
    const currentRate = completed / elapsed;
    const rate = codeConverterProgress.lastRate > 0
      ? (codeConverterProgress.lastRate * 0.65) + (currentRate * 0.35)
      : currentRate;
    codeConverterProgress.lastRate = rate;
    return rate > 0 ? (total - completed) / rate : null;
  }

  function getCodeConverterProgressCountText() {
    const total = Number(codeConverterProgress.total) || 0;
    const completed = Number(codeConverterProgress.completed) || 0;
    const unitTotal = Number(codeConverterProgress.currentUnitTotal) || 0;
    const unitCompleted = Number(codeConverterProgress.currentUnitCompleted) || 0;
    if (total > 0) {
      const base = `${Math.min(completed, total).toLocaleString()} / ${total.toLocaleString()} files`;
      if (codeConverterProgress.currentUnit && unitTotal > 0) {
        return `${base} ֲ· ${codeConverterProgress.currentUnit} ${Math.min(unitCompleted, unitTotal).toLocaleString()} / ${unitTotal.toLocaleString()}`;
      }
      if (codeConverterProgress.currentFile) return `${base} ֲ· ${codeConverterProgress.currentFile}`;
      return base;
    }
    if (codeConverterProgress.currentFile) return codeConverterProgress.currentFile;
    if (codeConverterProgress.currentUnit) return codeConverterProgress.currentUnit;
    return codeConverterProgress.running ? "Preparing..." : "Ready.";
  }

  function getCodeConverterProgressTimeText() {
    const etaSeconds = getCodeConverterEtaSeconds();
    const etaText = etaSeconds === null ? "--" : formatCodeConverterDuration(etaSeconds);
    return `ETA ${etaText}`;
  }

  function renderCodeConverterProgress() {
    const hasStarted = !!codeConverterProgress.startedAt;
    if (codeConverterProgressPanel) {
      codeConverterProgressPanel.hidden = !hasStarted;
      codeConverterProgressPanel.classList.toggle("is-indeterminate", hasStarted && !(Number(codeConverterProgress.total) > 0));
    }
    const percent = getCodeConverterProgressPercent();
    if (codeConverterProgressStage) codeConverterProgressStage.textContent = codeConverterProgress.stageLabel || "Working...";
    if (codeConverterProgressPercent) codeConverterProgressPercent.textContent = percent === null ? "--" : `${percent}%`;
    if (codeConverterProgressFill) codeConverterProgressFill.style.width = percent === null ? "" : `${percent}%`;
    if (codeConverterProgressTrack) {
      if (percent === null) codeConverterProgressTrack.removeAttribute("aria-valuenow");
      else codeConverterProgressTrack.setAttribute("aria-valuenow", String(percent));
    }
    if (codeConverterProgressCount) codeConverterProgressCount.textContent = getCodeConverterProgressCountText();
    if (codeConverterProgressTime) codeConverterProgressTime.textContent = getCodeConverterProgressTimeText();
    if (codeConverterConsoleTimer) codeConverterConsoleTimer.textContent = formatCodeConverterDuration(getCodeConverterElapsedSeconds());
    updateCodeConverterTaskPill();
  }

  function startCodeConverterProgressTimer() {
    if (codeConverterProgressTimer !== null) window.clearInterval(codeConverterProgressTimer);
    codeConverterProgressTimer = window.setInterval(renderCodeConverterProgress, 1000);
  }

  function stopCodeConverterProgressTimer() {
    if (codeConverterProgressTimer !== null) {
      window.clearInterval(codeConverterProgressTimer);
      codeConverterProgressTimer = null;
    }
  }

  function resetCodeConverterProgress(options = {}) {
    const keepTimer = !!options.keepTimer && !!codeConverterProgress.startedAt;
    const startedAt = codeConverterProgress.startedAt;
    const running = codeConverterProgress.running;
    if (!keepTimer) stopCodeConverterProgressTimer();
    codeConverterProgress = createEmptyCodeConverterProgress();
    if (keepTimer) {
      codeConverterProgress.running = running;
      codeConverterProgress.startedAt = startedAt;
      codeConverterProgress.stage = options.stage || "startup";
      codeConverterProgress.stageLabel = options.stageLabel || "Starting converter...";
    }
    codeConverterOutputLineBuffer = "";
    if (codeConverterConsoleTimer && !keepTimer) codeConverterConsoleTimer.textContent = "00:00";
    renderCodeConverterProgress();
    if (codeConverterProgressPanel) codeConverterProgressPanel.hidden = !keepTimer;
  }

  function beginCodeConverterProgress(stageLabel = "Starting converter...") {
    codeConverterProgress = {
      ...createEmptyCodeConverterProgress(),
      running: true,
      startedAt: Date.now(),
      stage: "startup",
      stageLabel
    };
    startCodeConverterProgressTimer();
    renderCodeConverterProgress();
  }

  function completeCodeConverterProgress(stageLabel = "Complete") {
    if (!codeConverterProgress.startedAt) return;
    codeConverterProgress.running = false;
    codeConverterProgress.finishedAt = Date.now();
    codeConverterProgress.stage = "complete";
    codeConverterProgress.stageLabel = stageLabel;
    if (Number(codeConverterProgress.total) > 0) codeConverterProgress.completed = Number(codeConverterProgress.total);
    stopCodeConverterProgressTimer();
    renderCodeConverterProgress();
  }

  function stopCodeConverterProgress(stageLabel) {
    if (!codeConverterProgress.startedAt) return;
    codeConverterProgress.running = false;
    codeConverterProgress.finishedAt = Date.now();
    if (stageLabel) codeConverterProgress.stageLabel = stageLabel;
    stopCodeConverterProgressTimer();
    renderCodeConverterProgress();
  }

  function updateCodeConverterProgress(payload = {}) {
    if (!codeConverterProgress.startedAt) beginCodeConverterProgress(payload.stageLabel || "Starting converter...");
    ["completed", "total", "currentUnitCompleted", "currentUnitTotal"].forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
      const value = Number(payload[field]);
      codeConverterProgress[field] = Number.isFinite(value) && value >= 0 ? value : 0;
    });
    ["stage", "stageLabel", "currentUnit", "currentFile"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) codeConverterProgress[field] = String(payload[field] || "");
    });
    if (!codeConverterProgress.stageLabel) codeConverterProgress.stageLabel = "Working...";
    if (codeConverterProgress.total > 0 && codeConverterProgress.completed > codeConverterProgress.total) {
      codeConverterProgress.completed = codeConverterProgress.total;
    }
    renderCodeConverterProgress();
  }

  function getCodeConverterRunningTaskLabel() {
    if (!codeConverterProgress.startedAt) return "Running...";
    const percent = getCodeConverterProgressPercent();
    const etaSeconds = getCodeConverterEtaSeconds();
    const parts = [];
    if (percent !== null) parts.push(`${percent}%`);
    parts.push(formatCodeConverterDuration(getCodeConverterElapsedSeconds()));
    if (etaSeconds !== null) parts.push(`ETA ${formatCodeConverterDuration(etaSeconds)}`);
    return parts.join(" ֲ· ");
  }

  function handleCodeConverterProgressLine(line, options = {}) {
    if (!line.startsWith("::md-progress")) return false;
    const payloadText = line.slice("::md-progress".length).trim();
    if (!payloadText) return true;
    if (options.trackProgress === false) return true;
    try {
      updateCodeConverterProgress(JSON.parse(payloadText));
    } catch (error) {
      console.warn("Failed to parse converter progress line:", error, line);
    }
    return true;
  }

  function inferCodeConverterProgressFromLog(line) {
    const cleaned = String(line || "").replace(/^\[[^\]]+\]\s*/, "").trim();
    if (!cleaned) return;
    let match = cleaned.match(/^Found\s+(\d+)\s+supported source file\(s\)\./i)
      || cleaned.match(/^Discovered\s+(\d+)\s+Java source file\(s\)/i);
    if (match) {
      updateCodeConverterProgress({ stage: "scan", stageLabel: "Scanning source files", completed: 0, total: Number(match[1]) });
      return;
    }
    match = cleaned.match(/^Indexed\s+(\d+)\s*\/\s*(\d+)\s+(?:source|Java)\s+files/i);
    if (match) {
      updateCodeConverterProgress({ stage: "index", stageLabel: "Building dependency indexes", completed: Number(match[1]), total: Number(match[2]) });
      return;
    }
    match = cleaned.match(/^Analyzed and wrote\s+(\d+)\s*\/\s*(\d+)\s+(?:source|Java)\s+files/i);
    if (match) {
      updateCodeConverterProgress({ stage: "analysis", stageLabel: "Analyzing dependencies and writing Markdown", completed: Number(match[1]), total: Number(match[2]) });
      return;
    }
    match = cleaned.match(/^Analyzing compile unit\s+(.+?)\s+with\s+(\d+)\s+file/i);
    if (match) {
      updateCodeConverterProgress({ stage: "analysis", stageLabel: "Analyzing Java compile unit", currentUnit: match[1], currentUnitCompleted: 0, currentUnitTotal: Number(match[2]) });
      return;
    }
    if (/Scanning source files|Scanning Java source files/i.test(cleaned)) {
      updateCodeConverterProgress({ stage: "scan", stageLabel: "Scanning source files" });
    } else if (/Building dependency indexes|Indexing \d+ Java files/i.test(cleaned)) {
      updateCodeConverterProgress({ stage: "index", stageLabel: "Building dependency indexes" });
    } else if (/Discovering external dependencies|Indexing external jars/i.test(cleaned)) {
      updateCodeConverterProgress({ stage: "external", stageLabel: "Discovering external dependencies" });
    } else if (/Analyzing dependencies and writing Markdown/i.test(cleaned)) {
      updateCodeConverterProgress({ stage: "analysis", stageLabel: "Analyzing dependencies and writing Markdown" });
    }
  }

  function appendCodeConverterConsoleLine(line) {
    if (!codeConverterConsoleOutput || line === "") return;
    const current = codeConverterConsoleOutput.textContent || "";
    codeConverterConsoleOutput.textContent = current ? `${current}\n${line}` : line;
    if (codeConverterTask) codeConverterTask.consoleText = codeConverterConsoleOutput.textContent || "";
    restoreRunningCodeConverterConsoleState();
    if (!codeConverterConsoleAutoScrollPaused) scrollCodeConverterConsoleToBottom();
  }

  function appendCodeConverterProcessOutput(text, options = {}) {
    if (!text && !options.flush) return;
    const trackProgress = options.trackProgress !== false;
    const normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const combined = codeConverterOutputLineBuffer + normalized;
    const hasTrailingNewline = combined.endsWith("\n");
    const lines = combined.split("\n");
    codeConverterOutputLineBuffer = hasTrailingNewline ? "" : lines.pop() || "";
    for (const line of lines) {
      if (handleCodeConverterProgressLine(line, { trackProgress })) continue;
      if (trackProgress) inferCodeConverterProgressFromLog(line);
      appendCodeConverterConsoleLine(line);
    }
    if (options.flush && codeConverterOutputLineBuffer) {
      const line = codeConverterOutputLineBuffer;
      codeConverterOutputLineBuffer = "";
      if (!handleCodeConverterProgressLine(line, { trackProgress })) {
        if (trackProgress) inferCodeConverterProgressFromLog(line);
        appendCodeConverterConsoleLine(line);
      }
    }
  }

  function hasActiveCodeConverterTask() {
    return !!codeConverterTask;
  }

  function updateCodeConverterTaskPill() {
    if (!codeConverterTaskPill) return;
    const shouldShow = Boolean(codeConverterTask && codeConverterTask.minimized);
    codeConverterTaskPill.hidden = !shouldShow;
    if (!shouldShow) {
      codeConverterTaskPill.classList.remove("is-running", "is-complete", "is-failed", "is-cancelled", "needs-attention");
      return;
    }

    const state = codeConverterTask.state || "running";
    if (codeConverterTaskName) codeConverterTaskName.textContent = codeConverterTask.converterName || "Code converter";
    if (codeConverterTaskStatus) codeConverterTaskStatus.textContent = state;
    const label = state === "running" ? getCodeConverterRunningTaskLabel() : codeConverterTask.statusText || state;
    if (codeConverterTaskLabel) codeConverterTaskLabel.textContent = label || "Running...";
    codeConverterTaskPill.title = `${codeConverterTask.converterName || "Code converter"}: ${label || state}`;
    codeConverterTaskPill.classList.toggle("is-running", state === "running");
    codeConverterTaskPill.classList.toggle("is-complete", state === "complete");
    codeConverterTaskPill.classList.toggle("is-failed", state === "failed" || state === "error");
    codeConverterTaskPill.classList.toggle("is-cancelled", state === "cancelled");
    codeConverterTaskPill.classList.toggle("needs-attention", !!codeConverterTask.attention);
  }

  function updateCodeConverterTaskControls() {
    if (codeConverterMinimizeButton) {
      codeConverterMinimizeButton.hidden = !codeConverterTask;
      codeConverterMinimizeButton.disabled = false;
    }
  }

  function clearCodeConverterTask() {
    codeConverterTask = null;
    completedCodeConverterDestinationRoot = "";
    resetCodeConverterProgress();
    updateCodeConverterTaskPill();
    updateCodeConverterTaskControls();
  }

  function createCodeConverterTask(task) {
    codeConverterTask = {
      converterType: task.converterType || "builtin",
      converterName: task.converterName || "code converter",
      sourceRoot: task.sourceRoot || "",
      destinationRoot: task.destinationRoot || "",
      command: task.command || "",
      processId: null,
      state: "running",
      exitCode: null,
      statusText: `Running ${task.converterName || "code converter"}...`,
      consoleText: "",
      consoleState: "running",
      minimized: false,
      attention: false
    };
    updateCodeConverterTaskPill();
    updateCodeConverterTaskControls();
  }

  function setCodeConverterTaskState(state, statusText, options = {}) {
    if (!codeConverterTask) return;
    codeConverterTask.state = state;
    codeConverterTask.statusText = statusText || codeConverterTask.statusText || state;
    if (Object.prototype.hasOwnProperty.call(options, "exitCode")) codeConverterTask.exitCode = options.exitCode;
    if (codeConverterTask.minimized && state !== "running" && options.attention !== false) {
      codeConverterTask.attention = true;
    }
    updateCodeConverterTaskPill();
  }

  function minimizeCodeConverterTask() {
    if (!codeConverterTask || !codeConverterModal) return;
    codeConverterTask.minimized = true;
    codeConverterTask.attention = false;
    hideCodeConverterDialog();
    updateCodeConverterTaskPill();
  }

  function restoreCodeConverterTaskDialog() {
    if (!codeConverterTask || !codeConverterModal) return;
    codeConverterTask.minimized = false;
    codeConverterTask.attention = false;
    updateCodeConverterTaskPill();
    codeConverterModal.style.display = "flex";
    if (codeConverterTask.state === "running") {
      codeConverterCancelButton?.focus();
    } else if (!codeConverterOpenFolderButton?.hidden) {
      codeConverterOpenFolderButton.focus();
    } else {
      codeConverterFinishButton?.focus();
    }
  }

  function resetCodeConverterDialogForNewTask() {
    setCodeConverterStatus("", { syncTask: false });
    clearCodeConverterConsole();
    setCodeConverterConsoleExpanded(false);
    setCodeConverterCompleteState(false);
    setCodeConverterRunningState(false);
    clearCodeConverterTask();
    if (codeConverterIncludeCommentsInput) codeConverterIncludeCommentsInput.checked = false;
    if (codeConverterIncludeExternalDependenciesInput) codeConverterIncludeExternalDependenciesInput.checked = true;
    if (codeConverterResolveMavenInput) codeConverterResolveMavenInput.checked = true;
    hydrateCodeConverterFolderInputs();
    updateCodeConverterLanguageSupport();
  }

  function setCodeConverterStatus(message, options = {}) {
    if (codeConverterStatus) codeConverterStatus.textContent = message || "";
    if (codeConverterTask && options.syncTask !== false) {
      codeConverterTask.statusText = message || "";
      updateCodeConverterTaskPill();
    }
  }

  function getLocalPathName(path) {
    return normalizeLocalPath(path).split("/").filter(Boolean).pop() || normalizeLocalPath(path) || "folder";
  }

  function setCodeConverterCompleteStatus(destinationRoot) {
    if (!codeConverterStatus) return;
    const normalizedDestination = normalizeLocalPath(destinationRoot);
    const statusText = `Markdown files created in ${getLocalPathName(normalizedDestination)}.`;
    if (codeConverterTask) {
      codeConverterTask.statusText = statusText;
      updateCodeConverterTaskPill();
    }
    codeConverterStatus.textContent = "";
    codeConverterStatus.append("Markdown files created in ");
    const folderLink = document.createElement("button");
    folderLink.type = "button";
    folderLink.className = "code-converter-status-link";
    folderLink.textContent = getLocalPathName(normalizedDestination);
    folderLink.title = normalizedDestination;
    folderLink.addEventListener("click", async () => {
      try {
        if (typeof Neutralino === "undefined" || !Neutralino.os?.open) throw new Error("No supported folder opener is available.");
        await Neutralino.os.open(normalizedDestination);
      } catch (error) {
        console.error("Failed to open generated folder:", error);
        setCodeConverterStatus("Unable to open generated folder.");
      }
    });
    codeConverterStatus.append(folderLink, ".");
  }

  function setCodeConverterConsoleExpanded(isExpanded) {
    codeConverterShell?.classList.toggle("console-open", !!isExpanded);
    if (codeConverterConsolePanel) codeConverterConsolePanel.setAttribute("aria-hidden", isExpanded ? "false" : "true");
    if (codeConverterConsoleToggle) {
      codeConverterConsoleToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      codeConverterConsoleToggle.setAttribute("aria-label", isExpanded ? "Hide conversion console" : "Show conversion console");
      codeConverterConsoleToggle.title = isExpanded ? "Hide conversion console" : "Show conversion console";
    }
  }

  function setCodeConverterConsoleState(state) {
    if (codeConverterConsoleState) codeConverterConsoleState.textContent = state || "idle";
    if (codeConverterTask) {
      codeConverterTask.consoleState = state || "idle";
      updateCodeConverterTaskPill();
    }
  }

  function isCodeConverterConsoleActivelyRunning() {
    if (codeConverterTask) return codeConverterTask.state === "running";
    return codeConverterIsRunning;
  }

  function restoreRunningCodeConverterConsoleState() {
    if (isCodeConverterConsoleActivelyRunning()) setCodeConverterConsoleState("running");
  }

  function resetCodeConverterConsoleCopyFeedback() {
    if (codeConverterConsoleCopyFeedbackTimer !== null) {
      window.clearTimeout(codeConverterConsoleCopyFeedbackTimer);
      codeConverterConsoleCopyFeedbackTimer = null;
    }
    if (!codeConverterConsoleCopyButton) return;
    codeConverterConsoleCopyButton.classList.remove("is-copied");
    codeConverterConsoleCopyButton.setAttribute("aria-label", "Copy console output");
    codeConverterConsoleCopyButton.title = "Copy console output";
  }

  function showCodeConverterConsoleCopiedFeedback() {
    if (!codeConverterConsoleCopyButton) return;
    if (codeConverterConsoleCopyFeedbackTimer !== null) {
      window.clearTimeout(codeConverterConsoleCopyFeedbackTimer);
      codeConverterConsoleCopyFeedbackTimer = null;
    }
    codeConverterConsoleCopyButton.classList.add("is-copied");
    codeConverterConsoleCopyButton.setAttribute("aria-label", "Console output copied");
    codeConverterConsoleCopyButton.title = "Console output copied";
    codeConverterConsoleCopyFeedbackTimer = window.setTimeout(resetCodeConverterConsoleCopyFeedback, 1200);
  }

  function scrollCodeConverterConsoleToBottom() {
    if (!codeConverterConsoleOutput) return;
    codeConverterConsoleOutput.scrollTop = codeConverterConsoleOutput.scrollHeight;
  }

  function setCodeConverterConsoleAutoScrollPaused(isPaused) {
    codeConverterConsoleAutoScrollPaused = !!isPaused;
    if (codeConverterConsoleAutoScrollButton) {
      codeConverterConsoleAutoScrollButton.classList.toggle("is-paused", codeConverterConsoleAutoScrollPaused);
      codeConverterConsoleAutoScrollButton.setAttribute("aria-pressed", codeConverterConsoleAutoScrollPaused ? "true" : "false");
      codeConverterConsoleAutoScrollButton.setAttribute("aria-label", codeConverterConsoleAutoScrollPaused ? "Resume console auto-scroll" : "Pause console auto-scroll");
      codeConverterConsoleAutoScrollButton.title = codeConverterConsoleAutoScrollPaused ? "Resume console auto-scroll" : "Pause console auto-scroll";
    }
    if (!codeConverterConsoleAutoScrollPaused) scrollCodeConverterConsoleToBottom();
  }

  function toggleCodeConverterConsoleAutoScroll() {
    setCodeConverterConsoleAutoScrollPaused(!codeConverterConsoleAutoScrollPaused);
  }

  function clearCodeConverterConsole() {
    if (codeConverterConsoleOutput) codeConverterConsoleOutput.textContent = "";
    if (codeConverterTask) codeConverterTask.consoleText = "";
    codeConverterOutputLineBuffer = "";
    setCodeConverterConsoleAutoScrollPaused(false);
    resetCodeConverterConsoleCopyFeedback();
    setCodeConverterConsoleState("idle");
  }

  function appendCodeConverterConsole(text) {
    appendCodeConverterConsoleLine(String(text || ""));
  }

  async function copyTextWithTextareaFallback(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "readonly");
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "1px";
    textArea.style.height = "1px";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (!successful) throw new Error("Copy command was unsuccessful.");
  }

  async function copyTextToSystemClipboard(text) {
    const errors = [];
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await copyTextWithTextareaFallback(text);
      return;
    } catch (error) {
      errors.push(error);
    }
    if (typeof Neutralino !== "undefined" && Neutralino.clipboard?.writeText) {
      try {
        await Neutralino.clipboard.writeText(text);
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    throw errors[errors.length - 1] || new Error("Clipboard is unavailable.");
  }

  async function copyCodeConverterConsole() {
    const text = codeConverterConsoleOutput?.textContent || "";
    if (!text.trim()) {
      resetCodeConverterConsoleCopyFeedback();
      setCodeConverterConsoleState("empty");
      return;
    }

    try {
      await copyTextToSystemClipboard(text);
      showCodeConverterConsoleCopiedFeedback();
      restoreRunningCodeConverterConsoleState();
    } catch (error) {
      console.warn("Failed to copy converter console:", error);
      resetCodeConverterConsoleCopyFeedback();
      setCodeConverterConsoleState("copy failed");
    }
  }

  function getCodeConverterResultText(result) {
    return [
      result?.stdOut || result?.stdout || "",
      result?.stdErr || result?.stderr || "",
      result?.output || ""
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function getSpawnedProcessOutputText(detail) {
    const data = detail?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      return data.stdOut || data.stdout || data.stdErr || data.stderr || data.output || data.data || "";
    }
    return detail?.stdOut || detail?.stdout || detail?.stdErr || detail?.stderr || detail?.output || "";
  }

  function getSpawnedProcessExitCode(detail) {
    const data = detail?.data;
    const value = data && typeof data === "object"
      ? data.exitCode ?? data.code
      : detail?.exitCode ?? detail?.code ?? data;
    const exitCode = Number(value);
    return Number.isFinite(exitCode) ? exitCode : 0;
  }

  function isSpawnedProcessExitAction(action) {
    return ["exit", "close", "exited", "terminated"].includes(String(action || "").toLowerCase());
  }

  async function executeCodeConverterCommand(command, options = {}) {
    if (Neutralino.os?.spawnProcess && Neutralino.os?.updateSpawnedProcess) {
      return new Promise(async (resolve, reject) => {
        let spawnedProcess = null;
        let isSettled = false;
        const cleanup = () => {
          window.removeEventListener("spawnedProcess", handleSpawnedProcessEvent);
          activeCodeConverterProcessId = null;
          activeCodeConverterProcessPid = null;
          activeCodeConverterProcessCancel = null;
          if (codeConverterTask) {
            codeConverterTask.processId = null;
            codeConverterTask.processPid = null;
          }
        };
        const settle = (callback, value) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          callback(value);
        };
        const requestProcessExit = async () => {
          const processId = spawnedProcess?.id ?? activeCodeConverterProcessId;
          const processPid = spawnedProcess?.pid ?? activeCodeConverterProcessPid;
          if (processPid && Neutralino.os?.execCommand) {
            try {
              await Neutralino.os.execCommand(`cmd /c taskkill /PID ${processPid} /T /F`);
            } catch (error) {
              console.warn("Failed to kill converter process tree:", error);
            }
          }
          if (processId !== null && Neutralino.os?.updateSpawnedProcess) {
            try {
              await Neutralino.os.updateSpawnedProcess(processId, "exit");
            } catch (error) {
              console.warn("Failed to signal converter process exit:", error);
            }
          }
          settle(resolve, { exitCode: -1, cancelled: true });
        };
        const handleSpawnedProcessEvent = (event) => {
          const detail = event?.detail || {};
          if (!spawnedProcess || (detail.id !== spawnedProcess.id && detail.pid !== spawnedProcess.pid)) return;
          const action = detail.action || detail.event || detail.type;
          if (isSpawnedProcessExitAction(action)) {
            appendCodeConverterProcessOutput("", { flush: true, trackProgress: options.trackProgress });
            settle(resolve, { exitCode: getSpawnedProcessExitCode(detail) });
            return;
          }
          const outputText = getSpawnedProcessOutputText(detail);
          if (outputText) appendCodeConverterProcessOutput(outputText, { trackProgress: options.trackProgress });
        };

        window.addEventListener("spawnedProcess", handleSpawnedProcessEvent);
        try {
          spawnedProcess = await Neutralino.os.spawnProcess(command);
          activeCodeConverterProcessId = spawnedProcess?.id ?? null;
          activeCodeConverterProcessPid = spawnedProcess?.pid ?? null;
          activeCodeConverterProcessCancel = requestProcessExit;
          if (codeConverterTask) {
            codeConverterTask.processId = activeCodeConverterProcessId;
            codeConverterTask.processPid = activeCodeConverterProcessPid;
          }
          if (codeConverterCancelRequested) {
            await requestProcessExit();
          }
        } catch (error) {
          settle(reject, error);
        }
      });
    }

    const result = await Neutralino.os.execCommand(command);
    const outputText = getCodeConverterResultText(result);
    if (outputText) appendCodeConverterProcessOutput(outputText, { flush: true, trackProgress: options.trackProgress });
    return result;
  }

  function setCodeConverterCompleteState(isComplete) {
    if (codeConverterCancelButton) codeConverterCancelButton.hidden = !!isComplete;
    if (codeConverterRunButton) codeConverterRunButton.hidden = !!isComplete;
    if (codeConverterOpenFolderButton) codeConverterOpenFolderButton.hidden = !isComplete;
    if (codeConverterFinishButton) codeConverterFinishButton.hidden = !isComplete;
    updateCodeConverterTaskControls();
  }

  function setCodeConverterTerminalState(canOpenFolder) {
    if (codeConverterCancelButton) codeConverterCancelButton.hidden = true;
    if (codeConverterRunButton) codeConverterRunButton.hidden = true;
    if (codeConverterOpenFolderButton) codeConverterOpenFolderButton.hidden = !canOpenFolder;
    if (codeConverterFinishButton) codeConverterFinishButton.hidden = false;
    updateCodeConverterTaskControls();
  }

  function getCodeConverterFormControls() {
    return [
      codeConverterTypeSelect,
      codeConverterSourceRootInput,
      codeConverterDestinationRootInput,
      codeConverterSourceBrowseButton,
      codeConverterDestinationBrowseButton,
      codeConverterIncludeMethodsInput,
      codeConverterIncludeAccessorsInput,
      codeConverterIncludeSignaturesInput,
      codeConverterIncludeReturnCodesInput,
      codeConverterIncludeExceptionsInput,
      codeConverterIncludePackageInput,
      codeConverterIncludeCommentsInput,
      codeConverterIncludeExternalDependenciesInput,
      codeConverterResolveMavenInput,
      codeConverterRunButton
    ].filter(Boolean);
  }

  function setCodeConverterRunningState(isRunning) {
    codeConverterIsRunning = !!isRunning;
    codeConverterShell?.classList.toggle("is-running", codeConverterIsRunning);
    getCodeConverterFormControls().forEach((control) => {
      control.disabled = codeConverterIsRunning;
      control.setAttribute("aria-disabled", codeConverterIsRunning ? "true" : "false");
    });
    if (codeConverterCancelButton) codeConverterCancelButton.disabled = false;
    if (codeConverterMinimizeButton) codeConverterMinimizeButton.disabled = false;
    if (codeConverterOpenFolderButton && !codeConverterOpenFolderButton.hidden) codeConverterOpenFolderButton.disabled = !!isRunning;
    if (codeConverterFinishButton && !codeConverterFinishButton.hidden) codeConverterFinishButton.disabled = !!isRunning;
    updateCodeConverterLanguageSupport();
    updateCodeConverterTaskControls();
  }

  function getSavedCodeConverterFolder(fieldName) {
    return normalizeLocalPath(loadGlobalState()[fieldName]);
  }

  function setSavedCodeConverterFolder(fieldName, folderPath) {
    const normalizedPath = normalizeLocalPath(folderPath);
    saveGlobalState({ [fieldName]: normalizedPath });
    return normalizedPath;
  }

  function hydrateCodeConverterFolderInputs() {
    if (codeConverterSourceRootInput && !codeConverterSourceRootInput.value.trim()) {
      codeConverterSourceRootInput.value = getSavedCodeConverterFolder("codeConverterSourceRoot");
    }
    if (codeConverterDestinationRootInput && !codeConverterDestinationRootInput.value.trim()) {
      codeConverterDestinationRootInput.value = getSavedCodeConverterFolder("codeConverterDestinationRoot");
    }
  }

  function setAllCodeConverterOptionChecks(checked) {
    [
      codeConverterIncludeMethodsInput,
      codeConverterIncludeAccessorsInput,
      codeConverterIncludeSignaturesInput,
      codeConverterIncludeReturnCodesInput,
      codeConverterIncludeExceptionsInput,
      codeConverterIncludePackageInput
    ].forEach((input) => {
      if (input) input.checked = !!checked;
    });
  }

  function applyCodeConverterDialogOptions(options = {}) {
    if (options.selectAllOptions) setAllCodeConverterOptionChecks(true);
    if (Object.prototype.hasOwnProperty.call(options, "sourceRoot") && codeConverterSourceRootInput) {
      codeConverterSourceRootInput.value = normalizeLocalPath(options.sourceRoot);
    }
    if (Object.prototype.hasOwnProperty.call(options, "destinationRoot") && codeConverterDestinationRootInput) {
      codeConverterDestinationRootInput.value = normalizeLocalPath(options.destinationRoot);
    } else if (options.useSavedDestination && codeConverterDestinationRootInput) {
      codeConverterDestinationRootInput.value = getSavedCodeConverterFolder("codeConverterDestinationRoot");
    }
    if (options.statusMessage) setCodeConverterStatus(options.statusMessage, { syncTask: false });
  }

  function showCodeConverterDialog(options = {}) {
    if (!codeConverterModal) return;
    if (hasActiveCodeConverterTask()) {
      restoreCodeConverterTaskDialog();
      return;
    }
    resetCodeConverterDialogForNewTask();
    applyCodeConverterDialogOptions(options);
    codeConverterModal.style.display = "flex";
    codeConverterSourceRootInput?.focus();
  }

  async function openCompletedCodeConverterFolder() {
    if (!completedCodeConverterDestinationRoot) return;
    const destinationRoot = completedCodeConverterDestinationRoot;
    hideCodeConverterDialog();
    try {
      await openFolderTreeFromNeutralinoPath(destinationRoot);
      setCodeConverterCompleteState(false);
      setCodeConverterRunningState(false);
      clearCodeConverterTask();
    } catch (error) {
      console.error("Failed to open generated Markdown folder:", error);
      if (codeConverterModal) codeConverterModal.style.display = "flex";
      setCodeConverterStatus("Unable to open generated folder in MD-Editor.");
    }
  }

  function hideCodeConverterDialog() {
    if (!codeConverterModal) return;
    codeConverterModal.style.display = "none";
  }

  function finishCodeConverterTask() {
    hideCodeConverterDialog();
    setCodeConverterCompleteState(false);
    setCodeConverterRunningState(false);
    clearCodeConverterTask();
  }

  async function cancelCodeConverterDialog() {
    if (!codeConverterIsRunning && !codeConverterTask) {
      hideCodeConverterDialog();
      return;
    }
    codeConverterCancelRequested = true;
    setCodeConverterStatus("Cancelling converter...");
    setCodeConverterConsoleState("cancelling");
    if (codeConverterCancelButton) codeConverterCancelButton.disabled = true;
    try {
      if (typeof activeCodeConverterProcessCancel === "function") {
        await activeCodeConverterProcessCancel();
      }
    } catch (error) {
      console.warn("Failed to cancel code converter:", error);
      appendCodeConverterConsole(error?.message || String(error));
      setCodeConverterStatus("Unable to cancel converter. See console.");
      setCodeConverterConsoleState("cancel failed");
      if (codeConverterCancelButton) codeConverterCancelButton.disabled = false;
    }
  }

  async function browseCodeConverterFolder(input, title, stateFieldName) {
    if (!input) return;
    if (typeof Neutralino === "undefined" || !Neutralino.os?.showFolderDialog) {
      alert("Code conversion requires the desktop app so folders can be selected from disk.");
      return;
    }
    try {
      const defaultPath = normalizeLocalPath(input.value) || getSavedCodeConverterFolder(stateFieldName);
      const selectedPath = await Neutralino.os.showFolderDialog(title, defaultPath ? { defaultPath } : undefined);
      if (selectedPath) input.value = setSavedCodeConverterFolder(stateFieldName, selectedPath);
    } catch (error) {
      console.warn("Failed to choose code converter folder:", error);
      setCodeConverterStatus("Unable to choose that folder.");
    }
  }

  function getCodeConverterScriptPath() {
    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    if (!basePath) return "converters/code_converter/dependency-md-generator.js";
    return `${basePath}/converters/code_converter/dependency-md-generator.js`;
  }

  async function canAccessLocalPath(path) {
    if (!path || typeof Neutralino === "undefined" || !Neutralino.filesystem?.getStats) return false;
    try {
      await Neutralino.filesystem.getStats(path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function getJavaConverterProjectRoot() {
    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    const cwdPath = normalizeLocalPath(getNeutralinoGlobalValue("NL_CWD"));
    return (basePath || cwdPath).replace(/\/desktop-app$/i, "");
  }

  function getJavaConverterRootCandidates() {
    const projectRoot = getJavaConverterProjectRoot();
    return [
      projectRoot ? `${projectRoot}/desktop-app/converters/java_converter` : "",
      "converters/java_converter",
      "./converters/java_converter"
    ].filter(Boolean);
  }

  async function getJavaConverterJarPath() {
    const candidates = getJavaConverterRootCandidates()
      .map((rootPath) => joinPath(rootPath, "target/java_converter.jar"));

    for (const candidate of candidates) {
      if (await canAccessLocalPath(candidate)) return candidate;
    }

    return candidates[0] || "desktop-app/converters/java_converter/target/java_converter.jar";
  }

  function getJavaExecutableForJdkHome(jdkHome) {
    const home = normalizeLocalPath(jdkHome);
    if (!home) return "";
    const executable = typeof NL_OS !== "undefined" && String(NL_OS).toLowerCase().includes("windows")
      ? "java.exe"
      : "java";
    return joinPath(joinPath(home, "bin"), executable);
  }

  function getJavacExecutableForJdkHome(jdkHome) {
    const home = normalizeLocalPath(jdkHome);
    if (!home) return "";
    const executable = typeof NL_OS !== "undefined" && String(NL_OS).toLowerCase().includes("windows")
      ? "javac.exe"
      : "javac";
    return joinPath(joinPath(home, "bin"), executable);
  }

  function getGradleExecutableForHome(gradleHome) {
    const home = normalizeLocalPath(gradleHome);
    if (!home) return "";
    const executable = typeof NL_OS !== "undefined" && String(NL_OS).toLowerCase().includes("windows")
      ? "gradle.bat"
      : "gradle";
    return joinPath(joinPath(home, "bin"), executable);
  }

  function getGradleVersionFromText(text) {
    const match = String(text || "").match(/(?:^|\n)\s*Gradle\s+([^\s]+)/i);
    return match ? match[1].trim() : "";
  }

  async function getGradleVersionForExecutable(gradleExecutable) {
    if (!gradleExecutable || typeof Neutralino === "undefined" || !Neutralino.os?.execCommand) return "";
    try {
      const result = await Neutralino.os.execCommand(`${quoteCommandArg(gradleExecutable)} --version`);
      return getGradleVersionFromText(getCodeConverterResultText(result));
    } catch (error) {
      console.warn("Failed to inspect configured Gradle:", gradleExecutable, error);
      return "";
    }
  }

  function getJavaFeatureFromVersionText(text) {
    const versionText = String(text || "");
    const match = versionText.match(/(?:openjdk|java)\s+version\s+"([^"]+)"/i)
      || versionText.match(/version\s+"([^"]+)"/i);
    if (!match) return 0;
    const raw = match[1] || "";
    const legacy = raw.match(/^1\.(\d+)/);
    if (legacy) return Number(legacy[1]) || 0;
    const modern = raw.match(/^(\d+)/);
    return modern ? Number(modern[1]) || 0 : 0;
  }

  function getJavaFeatureFromJdkReleaseText(text) {
    const match = String(text || "").match(/^JAVA_VERSION="([^"]+)"/m);
    return match ? getJavaFeatureFromVersionText(`java version "${match[1]}"`) : 0;
  }

  function getJavaFeatureFromJdkPath(jdkHome) {
    const match = normalizeLocalPath(jdkHome).match(/(?:^|[/\\])(?:jdk|java|openjdk)[-_ ]?(\d+)(?:[._-]|$)/i);
    return match ? Number(match[1]) || 0 : 0;
  }

  async function getJavaFeatureForJdkHome(jdkHome) {
    const home = normalizeLocalPath(jdkHome);
    if (!home) return 0;
    if (typeof Neutralino !== "undefined" && Neutralino.filesystem?.readFile) {
      try {
        const releaseText = await Neutralino.filesystem.readFile(joinPath(home, "release"));
        const releaseFeature = getJavaFeatureFromJdkReleaseText(releaseText);
        if (releaseFeature) return releaseFeature;
      } catch (_error) {
        // Some custom JDK layouts omit the release file; fall back to java -version.
      }
    }
    const executableFeature = await getJavaFeatureForExecutable(getJavaExecutableForJdkHome(home));
    return executableFeature || getJavaFeatureFromJdkPath(home);
  }

  async function getJavaFeatureForExecutable(javaExecutable) {
    if (!javaExecutable || typeof Neutralino === "undefined" || !Neutralino.os?.execCommand) return 0;
    try {
      const result = await Neutralino.os.execCommand(`${quoteCommandArg(javaExecutable)} -version`);
      return getJavaFeatureFromVersionText(getCodeConverterResultText(result));
    } catch (error) {
      console.warn("Failed to inspect configured JDK:", javaExecutable, error);
      return 0;
    }
  }

  async function getJavaLanguageServerExecutable() {
    const configuredJdks = getJavaConverterJdks();
    const candidates = [];
    for (const jdk of configuredJdks) {
      const javaExecutable = getJavaExecutableForJdkHome(jdk.path);
      if (!javaExecutable || !await canAccessLocalPath(javaExecutable)) continue;
      const feature = jdk.feature || await getJavaFeatureForJdkHome(jdk.path);
      if (feature > 0) candidates.push({ javaExecutable, feature });
    }
    candidates.sort((left, right) => right.feature - left.feature);
    return candidates[0]?.javaExecutable || "java";
  }

  async function getPreferredJavaLauncher(sourceRoot = "") {
    const normalizedSourceRoot = normalizeLocalPath(sourceRoot);
    const normalizedProjectRoot = normalizeLocalPath(activeFolderPath || "");
    const isProjectScoped = normalizedProjectRoot && (normalizedSourceRoot.toLowerCase() === normalizedProjectRoot.toLowerCase()
      || normalizedSourceRoot.toLowerCase().startsWith(`${normalizedProjectRoot.toLowerCase()}/`));
    if (isProjectScoped) {
      const runtime = javaWorkspaceController?.getRuntime?.();
      if (!runtime?.ok || !runtime.javaExecutable) {
        throw new Error("Select a valid Project JDK in Java Build Path before converting this project.");
      }
      appendCodeConverterConsole(`Using Project JDK ${runtime.projectJdk.feature}: ${runtime.javaExecutable}`);
      return quoteCommandArg(runtime.javaExecutable);
    }
    const configuredJdks = getJavaConverterJdks();
    const candidates = [];
    for (const jdk of configuredJdks) {
      const javaExecutable = getJavaExecutableForJdkHome(jdk.path);
      if (!javaExecutable || !await canAccessLocalPath(javaExecutable)) continue;
      const feature = jdk.feature || await getJavaFeatureForJdkHome(jdk.path);
      if (feature > 0) candidates.push({ javaExecutable, feature });
    }
    candidates.sort((left, right) => right.feature - left.feature);
    if (candidates.length) {
      const selected = candidates[0];
      appendCodeConverterConsole(`Using configured JDK ${selected.feature}: ${selected.javaExecutable}`);
      return quoteCommandArg(selected.javaExecutable);
    }
    if (configuredJdks.length) {
      appendCodeConverterConsole("No configured JDK entry contained a usable java executable; using Java from PATH.");
    }
    return "java";
  }

  function getSelectedGradleInstallation(installations = getJavaConverterGradleInstallations()) {
    const selectedId = getSelectedGradleInstallationId();
    return installations.find((installation) => installation.id === selectedId)
      || installations[0]
      || null;
  }

  function getGradleLauncherSettings() {
    const mode = getJavaConverterGradleMode();
    const offline = isJavaConverterGradleOffline();
    const metadataFailure = getJavaConverterGradleMetadataFailure();
    const userHome = getJavaConverterGradleUserHome();
    const installations = getJavaConverterGradleInstallations();
    const selectedInstallation = getSelectedGradleInstallation(installations);
    let executable = "";

    if (mode === "local") {
      executable = selectedInstallation?.executablePath || "";
      if (!executable) {
        const error = new Error("Gradle local mode requires a configured Gradle installation in Settings > Gradle.");
        error.isConfigurationError = true;
        throw error;
      }
    } else if (mode === "auto" && offline && selectedInstallation?.executablePath) {
      executable = selectedInstallation.executablePath;
    }

    return {
      mode,
      offline,
      metadataFailure,
      userHome,
      executable,
      selectedInstallation
    };
  }

  function getGradleProjectLauncherSettings(selection = "") {
    const projectGradle = selection && typeof selection === "object"
      ? selection
      : { mode: "installation", installationId: selection };
    const projectMode = ["wrapper", "built-in", "installation"].includes(projectGradle.mode)
      ? projectGradle.mode
      : "installation";
    const commonSettings = {
      offline: isJavaConverterGradleOffline(),
      userHome: getJavaConverterGradleUserHome(),
      executable: "",
      selectedInstallation: null,
      requireInstallation: false,
      configurationError: ""
    };
    if (projectMode === "wrapper") return Object.assign({ mode: "wrapper" }, commonSettings);
    if (projectMode === "built-in") return Object.assign({ mode: "built-in" }, commonSettings);
    const installations = getJavaConverterGradleInstallations();
    const requestedId = String(projectGradle.installationId || "").trim();
    const selectedInstallation = requestedId
      ? installations.find((installation) => installation.id === requestedId) || null
      : getSelectedGradleInstallation(installations);
    return {
      mode: "local",
      offline: isJavaConverterGradleOffline(),
      userHome: getJavaConverterGradleUserHome(),
      executable: selectedInstallation?.executablePath || "",
      selectedInstallation,
      requireInstallation: true,
      configurationError: selectedInstallation
        ? ""
        : (requestedId
          ? "The Project Gradle installation is no longer available. Select another installation in Java Build Path."
          : "Select a Project Gradle installation in Java Build Path.")
    };
  }

  function getGradleLauncherSwitches(settings = getGradleLauncherSettings()) {
    const switches = ["--on-gradle-metadata-failure", settings.metadataFailure];
    if (settings.offline) switches.push("--gradle-offline");
    if (settings.executable) {
      switches.push("--gradle-executable", quoteCommandArg(settings.executable));
    }
    if (settings.userHome) {
      switches.push("--gradle-user-home", quoteCommandArg(settings.userHome));
    }
    return switches;
  }

  function appendGradleLauncherConsole(settings) {
    appendCodeConverterConsole(`Gradle mode: ${settings.mode}`);
    appendCodeConverterConsole(`Gradle offline mode: ${settings.offline ? "enabled" : "disabled"}`);
    appendCodeConverterConsole(`Gradle metadata failure behavior: ${settings.metadataFailure}`);
    if (settings.userHome) {
      appendCodeConverterConsole(`Gradle user home: ${settings.userHome}`);
    }
    if (settings.executable) {
      const version = settings.selectedInstallation?.version || "unknown";
      appendCodeConverterConsole(`Using local Gradle ${version}: ${settings.executable}`);
    }
  }

  function getStatsModifiedTime(stats) {
    const value = stats?.modifiedAt ?? stats?.lastModified ?? stats?.mtime ?? stats?.modifiedTime;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsedNumber = Number(value);
      if (Number.isFinite(parsedNumber)) return parsedNumber;
      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) return parsedDate;
    }
    return 0;
  }

  function getStatsCreatedTime(stats) {
    const value = stats?.createdAt ?? stats?.birthtime ?? stats?.createdTime;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsedNumber = Number(value);
      if (Number.isFinite(parsedNumber)) return parsedNumber;
      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) return parsedDate;
    }
    return 0;
  }

  function getStatsSize(stats) {
    const value = stats?.size ?? stats?.bytes ?? stats?.byteLength;
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? size : 0;
  }

  function createFilesystemMetadata(source = {}) {
    return {
      size: getStatsSize(source),
      modifiedAt: getStatsModifiedTime(source),
      createdAt: getStatsCreatedTime(source) || getStatsModifiedTime(source)
    };
  }

  async function getNeutralinoPathMetadata(path, fallback = {}) {
    const fallbackMetadata = createFilesystemMetadata(fallback);
    if (fallbackMetadata.size || fallbackMetadata.modifiedAt || fallbackMetadata.createdAt) {
      return fallbackMetadata;
    }
    const stats = await getLocalPathStats(path);
    return createFilesystemMetadata(stats || fallback);
  }

  async function getLocalPathStats(path) {
    if (!path || typeof Neutralino === "undefined" || !Neutralino.filesystem?.getStats) return null;
    try {
      return await Neutralino.filesystem.getStats(path);
    } catch (_error) {
      return null;
    }
  }

  async function getNewestJavaConverterSourceTime(rootPath) {
    if (!rootPath || typeof Neutralino === "undefined" || !Neutralino.filesystem?.readDirectory) return 0;
    let newest = 0;
    const visitFile = async (filePath) => {
      const stats = await getLocalPathStats(filePath);
      newest = Math.max(newest, getStatsModifiedTime(stats));
    };
    const walkDirectory = async (dirPath) => {
      let entries = [];
      try {
        entries = await Neutralino.filesystem.readDirectory(dirPath);
      } catch (_error) {
        return;
      }
      for (const entry of entries || []) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === ".." || name === "target") continue;
        const fullPath = joinPath(dirPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          await walkDirectory(fullPath);
        } else if (type === "FILE" || entry?.isFile === true || !type) {
          await visitFile(fullPath);
        }
      }
    };
    await visitFile(joinPath(rootPath, "pom.xml"));
    await visitFile(joinPath(rootPath, "rebuild.bat"));
    await walkDirectory(joinPath(rootPath, "src"));
    return newest;
  }

  async function rebuildJavaConverterIfNeeded() {
    if (typeof Neutralino === "undefined" || (!Neutralino.os?.spawnProcess && !Neutralino.os?.execCommand)) {
      return { rebuilt: false, skipped: true };
    }

    for (const javaConverterRoot of getJavaConverterRootCandidates()) {
      const rebuildPath = joinPath(javaConverterRoot, "rebuild.bat");
      if (!await canAccessLocalPath(rebuildPath)) continue;
      const sourceNewest = await getNewestJavaConverterSourceTime(javaConverterRoot);
      if (!sourceNewest) continue;
      const jarPath = joinPath(javaConverterRoot, "target/java_converter.jar");
      const jarStats = await getLocalPathStats(jarPath);
      const jarModified = getStatsModifiedTime(jarStats);
      if (jarModified >= sourceNewest) return { rebuilt: false, skipped: false, javaConverterRoot };

      const reason = jarModified ? "stale" : "missing";
      appendCodeConverterConsole(`Java converter jar is ${reason}. Rebuilding...`);
      setCodeConverterStatus("Rebuilding Java converter...");
      const rebuildCommand = `cmd /c call ${quoteCommandArg(rebuildPath)}`;
      appendCodeConverterConsole(`> ${rebuildCommand}`);
      const result = await executeCodeConverterCommand(rebuildCommand, { trackProgress: false });
      if (codeConverterCancelRequested || result?.cancelled) {
        return { rebuilt: false, skipped: false, cancelled: true, javaConverterRoot };
      }
      const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
      if (exitCode !== 0) {
        const error = new Error(`Java converter rebuild failed with exit code ${exitCode}.`);
        error.exitCode = exitCode;
        throw error;
      }
      appendCodeConverterConsole("Java converter rebuild complete.");
      return { rebuilt: true, skipped: false, javaConverterRoot };
    }

    return { rebuilt: false, skipped: true };
  }

  const CODE_CONVERTER_TYPES = Object.freeze({
    builtin: {
      statusName: "code converter",
      languageSupport: "Supported languages: JavaScript, TypeScript, Python, Java, and C#. Supported extensions: .js, .jsx, .mjs, .cjs, .ts, .tsx, .py, .java, and .cs.",
      buildCommandParts: (sourceRoot, destinationRoot, switches) => [
        "node",
        quoteCommandArg(getCodeConverterScriptPath()),
        quoteCommandArg(sourceRoot),
        quoteCommandArg(destinationRoot),
        "--source-root-home",
        quoteCommandArg(sourceRoot),
        ...switches
      ],
      missingRuntimeMessage: "Unable to run the code converter. Make sure Node.js is installed and available on PATH."
    },
    java: {
      statusName: "Java converter",
      languageSupport: "Supported language: Java. Supported extension: .java.",
      buildCommandParts: async (sourceRoot, destinationRoot, switches) => [
        await getPreferredJavaLauncher(sourceRoot),
        "-Xmx8g",
        "-jar",
        quoteCommandArg(await getJavaConverterJarPath()),
        "--root",
        quoteCommandArg(sourceRoot),
        "--vault",
        quoteCommandArg(destinationRoot),
        "--source-root-home",
        quoteCommandArg(sourceRoot),
        ...switches
      ],
      missingRuntimeMessage: "Unable to run the Java converter. Make sure Java is installed and desktop-app/converters/java_converter/target/java_converter.jar has been built."
    }
  });

  function getSelectedCodeConverterType() {
    const value = codeConverterTypeSelect?.value || "builtin";
    return CODE_CONVERTER_TYPES[value] ? value : "builtin";
  }

  function getSelectedCodeConverterConfig() {
    return CODE_CONVERTER_TYPES[getSelectedCodeConverterType()];
  }

  function resetCodeConverterExternalDependencyDefault() {
    if (getSelectedCodeConverterType() === "java" && codeConverterIncludeExternalDependenciesInput && !codeConverterIsRunning) {
      codeConverterIncludeExternalDependenciesInput.checked = true;
      if (codeConverterResolveMavenInput) codeConverterResolveMavenInput.checked = true;
    }
  }

  function updateCodeConverterLanguageSupport() {
    if (codeConverterLanguageSupport) {
      codeConverterLanguageSupport.textContent = getSelectedCodeConverterConfig().languageSupport;
    }
    const isJava = getSelectedCodeConverterType() === "java";
    const includeExternalDependencies = isJava && codeConverterIncludeExternalDependenciesInput?.checked;
    const externalDependenciesLabel = codeConverterIncludeExternalDependenciesInput?.closest("label");
    if (externalDependenciesLabel) {
      externalDependenciesLabel.hidden = !isJava;
      externalDependenciesLabel.style.display = isJava ? "" : "none";
    }
    if (codeConverterIncludeExternalDependenciesInput) {
      codeConverterIncludeExternalDependenciesInput.disabled = !isJava || codeConverterIsRunning;
      codeConverterIncludeExternalDependenciesInput.setAttribute("aria-disabled", codeConverterIncludeExternalDependenciesInput.disabled ? "true" : "false");
    }
    const resolveMavenLabel = codeConverterResolveMavenInput?.closest("label");
    if (resolveMavenLabel) {
      resolveMavenLabel.hidden = !isJava;
      resolveMavenLabel.style.display = isJava ? "" : "none";
    }
    if (codeConverterResolveMavenInput) {
      if (!includeExternalDependencies) {
        codeConverterResolveMavenInput.checked = false;
      }
      codeConverterResolveMavenInput.disabled = !includeExternalDependencies || codeConverterIsRunning;
      codeConverterResolveMavenInput.setAttribute("aria-disabled", codeConverterResolveMavenInput.disabled ? "true" : "false");
    }
  }

  function quoteCommandArg(value) {
    return `"${String(value || "").replace(/\\/g, "/").replace(/"/g, '\\"')}"`;
  }

  function getGitCloneCommandResultText(result) {
    return [result?.stdOut || result?.stdout || "", result?.stdErr || result?.stderr || "", result?.output || ""]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function getGitCloneProgressLabel(outputText) {
    const lines = String(outputText || "").replace(/\r/g, "\n").split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const match = lines[index].trim().match(/^(?:remote:\s*)?([^:]+):\s*(\d{1,3})%/i);
      if (match) return `Cloning repository: ${match[1].trim()} ${match[2]}%`;
    }
    return "";
  }

  async function executeGitCloneCommand(command, onProgress) {
    const neutralino = window.Neutralino || (typeof Neutralino !== "undefined" ? Neutralino : null);
    if (!neutralino?.os?.spawnProcess) {
      const result = await neutralino.os.execCommand(command);
      return Object.assign({}, result, { output: getGitCloneCommandResultText(result) });
    }

    return new Promise(async (resolve, reject) => {
      let processHandle = null;
      let output = "";
      let isSettled = false;
      const cleanup = () => window.removeEventListener("spawnedProcess", handleSpawnedProcessEvent);
      const settle = (callback, value) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        callback(value);
      };
      const appendOutput = (value) => {
        const text = String(value || "");
        if (!text) return;
        output += text;
        if (output.length > 64000) output = `[Earlier clone output omitted]\n${output.slice(-64000)}`;
        const progressLabel = getGitCloneProgressLabel(output);
        if (progressLabel) onProgress?.(progressLabel);
      };
      const handleSpawnedProcessEvent = (event) => {
        const detail = event?.detail || {};
        if (!processHandle || (detail.id !== processHandle.id && detail.pid !== processHandle.pid)) return;
        const action = detail.action || detail.event || detail.type;
        if (isSpawnedProcessExitAction(action)) {
          settle(resolve, { exitCode: getSpawnedProcessExitCode(detail), output });
          return;
        }
        appendOutput(getSpawnedProcessOutputText(detail));
      };

      window.addEventListener("spawnedProcess", handleSpawnedProcessEvent);
      try {
        processHandle = await neutralino.os.spawnProcess(command);
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function showGitCloneFailure(error) {
    const details = String(error?.cloneOutput || error?.message || error || "Unknown error");
    if (!app.services?.alert) {
      alert("Unable to clone Git repository: " + details);
      return Promise.resolve();
    }
    return app.services.alert({
      title: "Unable to clone Git repository",
      message: "Git could not clone the repository. Review the details below.",
      dialogClassName: "git-clone-failure-notification",
      renderBody: function renderGitCloneFailureDetails(body) {
        const output = document.createElement("pre");
        output.className = "git-clone-failure-details";
        output.textContent = details;
        body.appendChild(output);
      }
    });
  }

  function getGitCloneTargetFolderName(repoUrl) {
    const normalized = String(repoUrl || "").trim().replace(/[\\/]+$/g, "");
    const candidate = (normalized.split(/[/:\\]/).filter(Boolean).pop() || "repository").replace(/\.git$/i, "");
    return (candidate || "repository").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  }

  async function cloneGitRepositoryFromEmptyFolderView() {
    const neutralino = window.Neutralino || (typeof Neutralino !== "undefined" ? Neutralino : null);
    if (!neutralino?.os?.showFolderDialog || (!neutralino.os?.spawnProcess && !neutralino.os?.execCommand)) {
      alert("Git clone is available in the desktop app.");
      return;
    }
    const repoUrl = await app.services.prompt({ title: "Clone Git repository", message: "Git repository URL:" });
    if (repoUrl === null || repoUrl === undefined) return;
    const trimmedRepoUrl = String(repoUrl || "").trim();
    if (!trimmedRepoUrl) return;
    let destinationParent = "";
    try {
      destinationParent = await neutralino.os.showFolderDialog("Select destination folder");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      throw error;
    }
    if (!destinationParent) return;
    const clonedPath = joinPath(destinationParent, getGitCloneTargetFolderName(trimmedRepoUrl));
    const cloneStatusId = `git-clone-${Date.now()}`;
    try {
      app.modules?.statusManager?.setStatus?.({
        id: cloneStatusId,
        label: "Cloning repository...",
        showProgress: true,
        priority: 20,
        backgroundProcess: { category: "git", icon: "bi-git" }
      });
      const result = await executeGitCloneCommand(
        `git -c core.longpaths=true clone --progress ${quoteCommandArg(trimmedRepoUrl)} ${quoteCommandArg(clonedPath)}`,
        (label) => app.modules?.statusManager?.setStatus?.({
          id: cloneStatusId,
          label,
          showProgress: true,
          priority: 20,
          backgroundProcess: { category: "git", icon: "bi-git" }
        })
      );
      const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
      if (Number.isFinite(exitCode) && exitCode !== 0) {
        const cloneError = new Error(`git clone failed with exit code ${exitCode}.`);
        cloneError.cloneOutput = getGitCloneCommandResultText(result) || cloneError.message;
        throw cloneError;
      }
      app.modules?.statusManager?.unsetStatus?.(cloneStatusId, { outcome: "finished", description: "Repository cloned" });
      await openFolderTreeFromNeutralinoPath(clonedPath);
    } catch (error) {
      app.modules?.statusManager?.unsetStatus?.(cloneStatusId, { outcome: "failed", description: "Repository clone failed" });
      console.error("Git clone failed:", error);
      await showGitCloneFailure(error);
    }
  }
  function getCodeConverterOptionValues() {
    return {
      includeMethods: !!codeConverterIncludeMethodsInput?.checked,
      includeAccessors: !!codeConverterIncludeAccessorsInput?.checked,
      includeSignatures: !!codeConverterIncludeSignaturesInput?.checked,
      includeReturnCodes: !!codeConverterIncludeReturnCodesInput?.checked,
      includeExceptions: !!codeConverterIncludeExceptionsInput?.checked,
      includePackage: !!codeConverterIncludePackageInput?.checked,
      includeExternalDependencies: !!codeConverterIncludeExternalDependenciesInput?.checked,
      resolveMavenDependencies: !!codeConverterResolveMavenInput?.checked,
      includeComments: !!codeConverterIncludeCommentsInput?.checked
    };
  }

  function getCodeConverterState() {
    const neutralino = window.Neutralino || (typeof Neutralino !== "undefined" ? Neutralino : null);
    const converterConfig = getSelectedCodeConverterConfig();
    return {
      available: !!(neutralino?.os?.spawnProcess || neutralino?.os?.execCommand),
      running: codeConverterIsRunning,
      hasTask: !!codeConverterTask,
      state: codeConverterTask?.state || (codeConverterIsRunning ? "running" : "idle"),
      converterType: getSelectedCodeConverterType(),
      converterName: converterConfig.statusName,
      sourceRoot: normalizeLocalPath(codeConverterSourceRootInput?.value || codeConverterTask?.sourceRoot || ""),
      destinationRoot: normalizeLocalPath(codeConverterDestinationRootInput?.value || codeConverterTask?.destinationRoot || completedCodeConverterDestinationRoot || ""),
      statusText: codeConverterTask?.statusText || codeConverterStatus?.textContent || "",
      consoleState: codeConverterTask?.consoleState || codeConverterConsoleState?.textContent || "idle",
      command: codeConverterTask?.command || "",
      progress: {
        running: !!codeConverterProgress.running,
        stage: codeConverterProgress.stage || "",
        stageLabel: codeConverterProgress.stageLabel || "",
        completed: Number(codeConverterProgress.completed) || 0,
        total: Number(codeConverterProgress.total) || 0,
        percent: getCodeConverterProgressPercent(),
        countText: getCodeConverterProgressCountText(),
        timeText: getCodeConverterProgressTimeText()
      },
      options: getCodeConverterOptionValues()
    };
  }

  function setCodeConverterCheckbox(input, value) {
    if (typeof value === "boolean" && input) input.checked = value;
  }

  function applyCodeConverterAgentOptions(options = {}) {
    const converterType = String(options.converterType || "").trim();
    if (converterType && CODE_CONVERTER_TYPES[converterType] && codeConverterTypeSelect) {
      codeConverterTypeSelect.value = converterType;
      resetCodeConverterExternalDependencyDefault();
    }
    applyCodeConverterDialogOptions(options);
    setCodeConverterCheckbox(codeConverterIncludeMethodsInput, options.includeMethods);
    setCodeConverterCheckbox(codeConverterIncludeAccessorsInput, options.includeAccessors);
    setCodeConverterCheckbox(codeConverterIncludeSignaturesInput, options.includeSignatures);
    setCodeConverterCheckbox(codeConverterIncludeReturnCodesInput, options.includeReturnCodes);
    setCodeConverterCheckbox(codeConverterIncludeExceptionsInput, options.includeExceptions);
    setCodeConverterCheckbox(codeConverterIncludePackageInput, options.includePackage);
    setCodeConverterCheckbox(codeConverterIncludeExternalDependenciesInput, options.includeExternalDependencies);
    setCodeConverterCheckbox(codeConverterResolveMavenInput, options.resolveMavenDependencies);
    setCodeConverterCheckbox(codeConverterIncludeCommentsInput, options.includeComments);
    updateCodeConverterLanguageSupport();
  }

  function startCodeConversionFromAgent(options = {}) {
    if (codeConverterIsRunning) throw new Error("Code converter is already running.");
    showCodeConverterDialog({ statusMessage: "Starting code converter from AI Companion..." });
    applyCodeConverterAgentOptions(options);
    void runCodeConverter();
    return getCodeConverterState();
  }

  function getConversionExportState() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;
    const nonEditableTypes = new Set(["graph", "large-file", "file-preview", "image-editor", "hex-editor", "file-compare", "api-client"]);
    return {
      activeDocument: {
        exportable: !!activeTab && !nonEditableTypes.has(activeTab.type),
        title: activeTab?.title || "",
        path: activeTab?.path || ""
      },
      activeFolderGraph: {
        exportable: typeof exportActiveFolderToGraph === "function" && !!activeFolderPath,
        path: activeFolderPath || ""
      },
      codeConverter: getCodeConverterState()
    };
  }
  function getCodeConverterSwitches() {
    return [
      [codeConverterIncludeMethodsInput, "--include-methods"],
      [codeConverterIncludeAccessorsInput, "--include-accessors"],
      [codeConverterIncludeSignaturesInput, "--include-signatures"],
      [codeConverterIncludeReturnCodesInput, "--include-return-codes"],
      [codeConverterIncludeExceptionsInput, "--include-exceptions"],
      [codeConverterIncludePackageInput, "--include-package"],
      [getSelectedCodeConverterType() === "builtin" ? codeConverterIncludeCommentsInput : null, "--include-comments"],
      [getSelectedCodeConverterType() === "java" ? codeConverterIncludeExternalDependenciesInput : null, "--include-external-dependencies"],
      [getSelectedCodeConverterType() === "java" ? codeConverterResolveMavenInput : null, "--resolve-maven-dependencies"],
    ]
      .filter(([input]) => input?.checked)
      .map(([, flag]) => flag);
  }

  async function runCodeConverter() {
    if (codeConverterIsRunning) return;
    if (typeof Neutralino === "undefined" || (!Neutralino.os?.spawnProcess && !Neutralino.os?.execCommand)) {
      alert("Code conversion requires the desktop app because it runs the local Node.js converter.");
      return;
    }

    const sourceRoot = (codeConverterSourceRootInput?.value || "").trim();
    const destinationRoot = (codeConverterDestinationRootInput?.value || "").trim();
    setCodeConverterCompleteState(false);
    if (!sourceRoot) {
      setCodeConverterStatus("Choose a source root folder.");
      codeConverterSourceRootInput?.focus();
      return;
    }
    if (!destinationRoot) {
      setCodeConverterStatus("Choose a destination MD root folder.");
      codeConverterDestinationRootInput?.focus();
      return;
    }

    try {
      codeConverterCancelRequested = false;
      const converterConfig = getSelectedCodeConverterConfig();
      const converterType = getSelectedCodeConverterType();
      setCodeConverterRunningState(true);
      clearCodeConverterConsole();
      setCodeConverterConsoleExpanded(true);
      setCodeConverterConsoleState("running");
      createCodeConverterTask({
        converterType,
        converterName: converterConfig.statusName,
        sourceRoot,
        destinationRoot,
        command: ""
      });
      beginCodeConverterProgress(`Starting ${converterConfig.statusName}...`);
      if (converterType === "java") {
        await rebuildJavaConverterIfNeeded();
        resetCodeConverterProgress({ keepTimer: true, stageLabel: `Starting ${converterConfig.statusName}...` });
      }
      if (codeConverterCancelRequested) {
        stopCodeConverterProgress("Cancelled");
        setCodeConverterTaskState("cancelled", `${converterConfig.statusName} cancelled.`, { exitCode: -1, attention: true });
        setCodeConverterConsoleState("cancelled");
        setCodeConverterStatus(`${converterConfig.statusName} cancelled.`);
        setCodeConverterTerminalState(false);
        codeConverterFinishButton?.focus();
        return;
      }
      let switches = getCodeConverterSwitches();
      if (converterType === "java") {
        const gradleSettings = getGradleLauncherSettings();
        appendGradleLauncherConsole(gradleSettings);
        switches = [...switches, ...getGradleLauncherSwitches(gradleSettings)];
      }
      const command = (await converterConfig.buildCommandParts(sourceRoot, destinationRoot, switches))
        .join(" ");
      if (codeConverterTask) codeConverterTask.command = command;
      appendCodeConverterConsole(`> ${command}`);
      setCodeConverterStatus(`Running ${converterConfig.statusName}...`);
      const result = await executeCodeConverterCommand(command);
      const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
      if (codeConverterCancelRequested) {
        stopCodeConverterProgress("Cancelled");
        setCodeConverterTaskState("cancelled", `${converterConfig.statusName} cancelled.`, { exitCode, attention: true });
        setCodeConverterConsoleState("cancelled");
        setCodeConverterStatus(`${converterConfig.statusName} cancelled.`);
        setCodeConverterTerminalState(false);
        codeConverterFinishButton?.focus();
        return;
      }
      if (exitCode !== 0) {
        stopCodeConverterProgress("Failed");
        setCodeConverterTaskState("failed", `${converterConfig.statusName} failed. See console.`, { exitCode, attention: true });
        setCodeConverterConsoleState(`failed (${exitCode})`);
        setCodeConverterStatus(`${converterConfig.statusName} failed. See console.`);
        setCodeConverterTerminalState(false);
        codeConverterFinishButton?.focus();
        return;
      }
      completeCodeConverterProgress("Complete");
      setCodeConverterTaskState("complete", `Markdown files created in ${getLocalPathName(destinationRoot)}.`, { exitCode, attention: true });
      setCodeConverterConsoleState("complete");
      completedCodeConverterDestinationRoot = normalizeLocalPath(destinationRoot);
      setCodeConverterCompleteStatus(completedCodeConverterDestinationRoot);
      setCodeConverterTerminalState(true);
      codeConverterOpenFolderButton?.focus();
    } catch (error) {
      console.error("Failed to run code converter:", error);
      setCodeConverterConsoleExpanded(true);
      const failureMessage = Number.isFinite(Number(error?.exitCode))
        ? (error?.message || `${getSelectedCodeConverterConfig().statusName} failed. See console.`)
        : error?.isConfigurationError
          ? error.message
        : getSelectedCodeConverterConfig().missingRuntimeMessage;
      setCodeConverterTaskState("failed", failureMessage, { attention: true });
      setCodeConverterConsoleState("error");
      appendCodeConverterConsole(error?.stack || error?.message || String(error));
      setCodeConverterStatus(failureMessage);
      stopCodeConverterProgress("Failed");
      setCodeConverterTerminalState(false);
      codeConverterFinishButton?.focus();
    } finally {
      activeCodeConverterProcessId = null;
      codeConverterCancelRequested = false;
      setCodeConverterRunningState(false);
    }
  }

  async function listMarkdownTree(dirHandle, parentPath = "") {
    const entries = [];
    let processedEntries = 0;
    for await (const entry of dirHandle.values()) {
      processedEntries += 1;
      if (processedEntries % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (entry.kind === "directory") {
        if (shouldSkipGitProjectFolder(entry.name) || shouldSkipMdEditorProjectFolder(entry.name) || shouldSkipCustomHiddenFolder(entry.name)) continue;
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        const children = await listMarkdownTree(entry, currentPath);
        entries.push({ kind: "directory", name: entry.name, path: currentPath, children, handle: entry });
      } else if (entry.kind === "file") {
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        let file = null;
        try {
          file = await entry.getFile();
        } catch (error) {
          console.warn("Failed to read file metadata:", currentPath, error);
        }
        const modifiedAt = Number(file?.lastModified || 0) || 0;
        const isGraphDocumentFile = await fileContainsGraphDocument(file);
        entries.push({ kind: "file", name: entry.name, path: currentPath, handle: entry, file, size: Number(file?.size || 0), modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
      }
    }
    return sortFolderTreeNodes(entries);
  }

  async function collectMarkdownFilesFromTree(nodes, parentPath = "") {
    const perfSession = !parentPath && typeof createGraphPerfSession === "function"
      ? createGraphPerfSession("folder markdown file discovery", { runtime: "browser" })
      : null;
    const files = [];
    let processedNodes = 0;
    try {
      for (const node of (nodes || [])) {
        processedNodes += 1;
        if (processedNodes % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (node.kind === "directory") {
          if (node.name === ".md-editor") continue;
          const nestedFiles = await collectMarkdownFilesFromTree(node.children || [], currentPath);
          files.push(...nestedFiles);
        } else if (node.kind === "file" && isMarkdownPath(node.name)) {
          if (node.file) {
            files.push({ path: currentPath, file: node.file, handle: node.handle || null, size: Number(node.file.size || node.size || 0), modifiedAt: Number(node.file.lastModified || node.modifiedAt || 0) });
          } else if (node.handle) {
            try {
              const file = await node.handle.getFile();
              files.push({ path: currentPath, file, handle: node.handle, size: Number(file.size || 0), modifiedAt: Number(file.lastModified || node.modifiedAt || 0) });
            } catch (error) {
              console.warn("Failed to read file handle for graph view:", currentPath, error);
            }
          }
        }
      }
      perfSession?.end({ files: files.length, rootEntries: (nodes || []).length });
    } catch (error) {
      perfSession?.end({ failed: true, files: files.length, rootEntries: (nodes || []).length });
      throw error;
    }
    return files;
  }

  function getClosedFolderPlaceholder() {
    return `
      <div class="folder-tree-empty-state">
        <div class="folder-tree-empty-actions">
          <button class="folder-tree-open-folder-button" type="button" title="Open a folder to browse text and graph files" aria-label="Open a folder to browse text and graph files">
            <i class="bi bi-folder2-open" aria-hidden="true"></i>
            <span>Open a folder to<br>browse Markdown<br>and graph files.</span>
          </button>
          <button class="folder-tree-clone-repository-link" type="button" title="Clone a Git repository into a local folder" aria-label="Clone Git Repository">
            <i class="bi bi-git" aria-hidden="true"></i>
            <span>Clone Git Repository...</span>
          </button>
        </div>
      </div>`;
  }

  function updateCloseFolderButtons() {
    document.querySelectorAll(".close-folder-button").forEach((button) => {
      button.disabled = !isFolderOpen;
      button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      button.title = isFolderOpen ? "Close the currently open folder" : "Open a folder before closing it";
    });
  }

  function updateFolderDependentControls() {
    const hasFolder = Boolean(activeFolderName && activeFolderName !== "Graph View" && (isFolderOpen || activeFolderPath || activeFolderHandle));
    const folderPath = activeFolderPath || "";
    updateOriginalSourceRootButtons(hasFolder && !!folderPath);
    updateProjectMenuButtons(hasFolder && !!folderPath);
    void app.modules?.problemsPanel?.restoreForProject?.(hasFolder ? folderPath : "");
    void app.modules?.javaRebuildOutput?.restoreForProject?.(hasFolder ? folderPath : "");
    void app.modules?.runConfigurationStore?.loadProject?.(hasFolder ? folderPath : "");
    void app.modules?.runOutput?.restoreForProject?.(hasFolder ? folderPath : "");
    const nextTaskWorkspace = hasFolder ? folderPath : "";
    const currentTaskWorkspace = app.modules?.projectTaskStore?.getState?.().workspaceRoot || "";
    if (normalizeLocalPath(currentTaskWorkspace).toLowerCase() !== normalizeLocalPath(nextTaskWorkspace).toLowerCase()) {
      app.modules?.jdtTaskSource?.closeWorkspace?.(currentTaskWorkspace);
    }
    void app.modules?.projectTaskStore?.openProject?.(nextTaskWorkspace);
    app.modules?.workspaceGit?.updateWorkspaceGitAvailability?.();
  }

  function updateOriginalSourceRootButtons(enabled) {
    setOriginalSourceRootButtons.forEach((button) => {
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", enabled ? "false" : "true");
      button.title = enabled
        ? "Set the original source root for the open generated Markdown folder"
        : "Open a generated Markdown folder before setting its original source root";
    });
  }

  async function refreshSourceRootMetadata(options = {}) {
    if (!activeFolderPath) {
      clearSourceRootMetadataCache?.();
      updateFolderDependentControls();
      return null;
    }
    const metadata = await loadSourceRootMetadata({ force: !!options.force });
    updateFolderDependentControls();
    return metadata;
  }

  async function handleSetOriginalSourceRoot() {
    if (!activeFolderPath) {
      alert("Open a generated Markdown folder before setting its original source root.");
      return;
    }
    try {
      await promptForSourceRoot({ reason: "user-action" });
    } catch (error) {
      console.error("Failed to set original source root:", error);
      alert("Unable to set the original source root.");
    }
  }

  async function handleSourceRootChanged() {
    await invalidateWorkspaceDerivedState({
      reason: "source-root-changed",
      refreshSourceRoot: true,
      forceSourceRoot: true,
      refreshGraphs: true,
      refreshOpenFolderFileTabs: true
    });
  }

  function closeFolderTree() {
    foregroundWaitIndicator.clear();
    cancelActiveLazyFolderCountBridge();
    lazyFolderCountResult = null;
    app.modules?.sidebarContextTree?.setJavaProjectMarkerMode?.("none");
    app.modules?.sidebarContextTree?.setMavenModulePaths?.([]);
    app.modules?.sidebarContextTree?.setGradleModulePaths?.([]);
    app.modules?.sidebarContextTree?.setJavaSourceRootPaths?.([]);
    void app.modules?.folderWatcher?.stop?.();
    app.modules?.javaWorkspaceController?.closeWorkspace?.();
    void neutralinoLspBridge?.stopServerSessions?.("java");
    void neutralinoLspBridge?.stopServerSessions?.("kotlin");
    hideLinkAutocomplete();
    folderMarkdownFiles = [];
    clearFolderTagCounts();
    selectedFolderTreeTags = new Set();
    currentFolderTreeNodes = [];
    folderTreeFilterText = "";
    activeFolderName = "Graph View";
    activeFolderHandle = null;
    activeFolderPath = null;
    isFolderOpen = false;
    clearFolderStatusLine();
    saveGlobalState({ lastOpenFolderPath: "" });
    clearSourceRootMetadataCache?.();
    if (folderTreeFilterInput) {
      folderTreeFilterInput.value = "";
      folderTreeFilterInput.hidden = true;
    }
    if (folderTreeRoot) {
      folderTreeRoot.removeEventListener("contextmenu", handleFolderTreeRootContextMenu);
      folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
      folderTreeRoot.innerHTML = getClosedFolderPlaceholder();
    }
    renderTagManagementList();
    updateFolderStatusLine();
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
    lineCounter?.updateButtons?.();
    updateFolderDependentControls();
  }

  function getFolderTreeStats(nodes) {
    return (nodes || []).reduce(function(stats, node) {
      if (!node) return stats;
      if (node.isParentNavigation) return stats;
      if (node.kind === "directory") {
        stats.folders += 1;
        const childStats = getFolderTreeStats(node.children || []);
        stats.files += childStats.files;
        stats.folders += childStats.folders;
      } else {
        stats.files += 1;
      }
      return stats;
    }, { files: 0, folders: 0 });
  }

  function encodeFolderCountBridgeRequest(request) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(request || {}))));
  }

  function createFolderCountBridgeLineParser(onLine) {
    let pending = "";
    return function parseFolderCountBridgeOutput(chunk, options = {}) {
      const combined = pending + String(chunk || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = combined.split("\n");
      pending = options.flush ? "" : (lines.pop() || "");
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      });
      if (options.flush && pending.trim()) {
        onLine(pending.trim());
        pending = "";
      }
    };
  }

  function normalizeFolderCountPath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function isLazyNeutralinoFolderScan(details) {
    if (!details || details.reason !== "opened-folder-lazy-root") return false;
    const scannedFolder = normalizeFolderCountPath(details.folder || "");
    const activeFolder = normalizeFolderCountPath(activeFolderPath || "");
    return !scannedFolder || !activeFolder || scannedFolder === activeFolder;
  }

  function isFolderCountBridgeAvailable() {
    return isNeutralinoRuntime()
      && typeof NL_OS !== "undefined"
      && NL_OS === "Windows"
      && typeof Neutralino !== "undefined"
      && !!Neutralino.os?.spawnProcess
      && !!Neutralino.os?.updateSpawnedProcess;
  }

  function isCurrentLazyFolderCountSession(session) {
    return !!session
      && !session.cancelled
      && session.token === lazyFolderCountGeneration
      && isFolderOpen
      && normalizeFolderCountPath(session.folderPath) === normalizeFolderCountPath(activeFolderPath || "");
  }

  function cleanupLazyFolderCountSession(session, outcome = "finished") {
    if (!session) return;
    window.removeEventListener("spawnedProcess", session.handleSpawnedProcessEvent);
    app.modules?.statusManager?.unsetStatus?.(session.statusId, { outcome });
    if (lazyFolderCountSession === session) lazyFolderCountSession = null;
  }

  function hasLazyFolderCountProcessMatch(session, detail) {
    if (!session || !detail) return false;
    const detailId = detail.id ?? null;
    const detailPid = detail.pid ?? null;
    return (session.processId !== null && session.processId !== undefined && detailId === session.processId)
      || (session.processPid !== null && session.processPid !== undefined && detailPid === session.processPid);
  }

  function handleFolderCountBridgeMessage(session, line) {
    if (!isCurrentLazyFolderCountSession(session)) return;
    let message = null;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.warn("Ignoring invalid folder count bridge output:", error);
      return;
    }

    if (message.type === "result") {
      const files = Number(message.files);
      const folders = Number(message.folders);
      if (!Number.isFinite(files) || !Number.isFinite(folders)) return;
      session.result = {
        files: Math.max(0, Math.floor(files)),
        folders: Math.max(0, Math.floor(folders))
      };
      lazyFolderCountResult = {
        token: session.token,
        folderPath: session.folderPath,
        stats: session.result
      };
      updateFolderStatusLine();
      cleanupLazyFolderCountSession(session);
    } else if (message.type === "error") {
      console.warn("Folder count bridge failed:", message.message || "Unknown error");
      cleanupLazyFolderCountSession(session, "failed");
    }
  }

  function cancelActiveLazyFolderCountBridge() {
    const session = lazyFolderCountSession;
    if (!session) return;
    lazyFolderCountGeneration += 1;
    session.cancelled = true;
    lazyFolderCountResult = null;
    cleanupLazyFolderCountSession(session, "cancelled");

    const processId = session.processId;
    const processPid = session.processPid;
    if (processId !== null && processId !== undefined && Neutralino?.os?.updateSpawnedProcess) {
      try {
        void Neutralino.os.updateSpawnedProcess(processId, "stdIn", `${JSON.stringify({ type: "close" })}\n`);
      } catch (_error) {
        // Bridge cancellation is best-effort during folder teardown.
      }
      try {
        void Neutralino.os.updateSpawnedProcess(processId, "exit");
      } catch (_error) {
        // Bridge cancellation is best-effort during folder teardown.
      }
    }
    if (processPid && Neutralino?.os?.execCommand) {
      try {
        void Neutralino.os.execCommand(`cmd /c taskkill /PID ${processPid} /T /F`);
      } catch (_error) {
        // Process tree cleanup is best-effort when the bridge is already gone.
      }
    }
  }

  async function startLazyFolderCountBridge(scanDetails) {
    cancelActiveLazyFolderCountBridge();
    if (!isFolderCountBridgeAvailable() || !isLazyNeutralinoFolderScan(scanDetails) || !activeFolderPath) return;

    const token = lazyFolderCountGeneration + 1;
    lazyFolderCountGeneration = token;
    lazyFolderCountResult = null;
    const session = {
      token,
      statusId: `folder-count-${token}`,
      folderPath: activeFolderPath,
      processId: null,
      processPid: null,
      result: null,
      cancelled: false,
      parseOutput: null,
      handleSpawnedProcessEvent: null
    };
    session.parseOutput = createFolderCountBridgeLineParser((line) => handleFolderCountBridgeMessage(session, line));
    session.handleSpawnedProcessEvent = (event) => {
      const detail = event?.detail || {};
      if (!hasLazyFolderCountProcessMatch(session, detail)) return;
      const action = detail.action || detail.event || detail.type;
      if (isSpawnedProcessExitAction(action)) {
        session.parseOutput("", { flush: true });
        cleanupLazyFolderCountSession(session);
        return;
      }
      if (action === "stdOut") session.parseOutput(getSpawnedProcessOutputText(detail));
      else if (action === "stdErr") console.warn("Folder count bridge stderr:", getSpawnedProcessOutputText(detail));
    };

    lazyFolderCountSession = session;
    app.modules?.statusManager?.setStatus?.({
      id: session.statusId,
      label: "Counting files and folders...",
      showProgress: true,
      onCancel: function() {
        if (lazyFolderCountSession !== session) return false;
        cancelActiveLazyFolderCountBridge();
        return true;
      },
      backgroundProcess: { category: "workspace", icon: "bi-folder2-open" }
    });
    window.addEventListener("spawnedProcess", session.handleSpawnedProcessEvent);
    try {
      const command = `node ${quoteCommandArg(FOLDER_COUNT_BRIDGE_PATH)} ${encodeFolderCountBridgeRequest({ folderPath: activeFolderPath })}`;
      const processHandle = await Neutralino.os.spawnProcess(command);
      if (!isCurrentLazyFolderCountSession(session)) {
        cleanupLazyFolderCountSession(session);
        return;
      }
      session.processId = processHandle?.id ?? processHandle;
      session.processPid = processHandle?.pid ?? null;
      await Neutralino.os.updateSpawnedProcess(session.processId, "stdIn", `${JSON.stringify({ type: "start" })}\n`);
    } catch (error) {
      if (isCurrentLazyFolderCountSession(session)) console.warn("Failed to start folder count bridge:", error);
      cleanupLazyFolderCountSession(session, "failed");
    }
  }

  function getLazyNeutralinoFolderStats() {
    if (!isFolderOpen || !isNeutralinoRuntime() || !activeFolderPath) return null;
    if (folderTreeFilterText || selectedFolderTreeTags.size > 0) return null;
    if (typeof getNeutralinoFolderScanDetails !== "function") return null;
    if (!isLazyNeutralinoFolderScan(getNeutralinoFolderScanDetails())) return null;
    if (
      lazyFolderCountResult
      && lazyFolderCountResult.token === lazyFolderCountGeneration
      && normalizeFolderCountPath(lazyFolderCountResult.folderPath) === normalizeFolderCountPath(activeFolderPath || "")
    ) {
      return lazyFolderCountResult.stats;
    }
    return { files: 0, folders: 0 };
  }

  function clearFolderStatusLine() {
    if (folderFileCountElement) folderFileCountElement.textContent = "0";
    if (folderDirectoryCountElement) folderDirectoryCountElement.textContent = "0";
  }

  function updateFolderStatusLine() {
    const stats = isFolderOpen ? (getLazyNeutralinoFolderStats() || getFolderTreeStats(currentFolderTreeNodes)) : { files: 0, folders: 0 };
    if (folderFileCountElement) folderFileCountElement.textContent = stats.files.toLocaleString();
    if (folderDirectoryCountElement) folderDirectoryCountElement.textContent = stats.folders.toLocaleString();
  }

  function getFolderTreeDetailStateKeys(details) {
    return [
      normalizeFolderCountPath(details?.dataset?.fullPath || ""),
      normalizeFolderCountPath(details?.dataset?.path || "")
    ].filter(Boolean);
  }

  function captureOpenFolderTreeState() {
    const openKeys = new Set();
    if (!folderTreeRoot) return openKeys;
    folderTreeRoot.querySelectorAll("details").forEach((details) => {
      if (!details.open) return;
      getFolderTreeDetailStateKeys(details).forEach((key) => openKeys.add(key));
    });
    return openKeys;
  }

  function restoreOpenFolderTreeState(openKeys) {
    if (!folderTreeRoot || !openKeys?.size) return;
    folderTreeRoot.querySelectorAll("details").forEach((details) => {
      const shouldOpen = getFolderTreeDetailStateKeys(details).some((key) => openKeys.has(key));
      if (!shouldOpen) return;
      details.open = true;
      const lazyChildrenRenderer = app.modules?.sidebarContextTree?.renderFolderTreeLazyChildren;
      if (details.dataset.childrenRendered !== "true" && typeof lazyChildrenRenderer === "function") {
        void Promise.resolve(lazyChildrenRenderer(details)).then(() => {
          if (details.dataset.childrenRendered === "true") restoreOpenFolderTreeState(openKeys);
        });
      }
    });
  }
  function renderFolderLoadingState(message = "Loading folder...") {
    cancelActiveLazyFolderCountBridge();
    app.modules?.sidebarContextTree?.setJavaProjectMarkerMode?.("none");
    app.modules?.sidebarContextTree?.setMavenModulePaths?.([]);
    app.modules?.sidebarContextTree?.setGradleModulePaths?.([]);
    app.modules?.sidebarContextTree?.setJavaSourceRootPaths?.([]);
    if (!folderTreeRoot) return;
    clearFolderStatusLine();
    updateFolderDependentControls();
    folderTreeRoot.setAttribute("aria-busy", "true");
    folderTreeRoot.innerHTML = "";
    const loadingState = document.createElement("div");
    loadingState.className = "folder-loading-state";
    loadingState.setAttribute("role", "status");
    loadingState.setAttribute("aria-live", "polite");
    const spinner = document.createElement("span");
    spinner.className = "folder-loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = message;
    loadingState.append(spinner, label);
    folderTreeRoot.appendChild(loadingState);
  }

  function renderFolderLoadingError(message = "Unable to load this folder.") {
    if (!folderTreeRoot) return;
    folderTreeRoot.removeAttribute("aria-busy");
    folderTreeRoot.innerHTML = "";
    const errorMessage = document.createElement("p");
    errorMessage.className = "folder-tree-placeholder folder-loading-error";
    errorMessage.textContent = message;
    folderTreeRoot.appendChild(errorMessage);
  }

  /** Create the collapsible tree node representing the currently open folder. */
  function createOpenFolderRootTreeNode(children) {
    return {
      kind: "directory",
      name: activeFolderName || "Folder",
      path: "",
      fullPath: activeFolderPath || "",
      handle: activeFolderHandle || null,
      children,
      isOpenFolderRootContext: true
    };
  }

  function renderFolderTree(nodes, options = {}) {
    isFolderOpen = true;
    updateFolderDependentControls();
    folderTreeRoot.removeAttribute("aria-busy");
    const preservedOpenFolderKeys = options.preserveExpandedFolders ? captureOpenFolderTreeState() : null;
    if (!options.preserveNodes) {
      currentFolderTreeNodes = nodes || [];
      folderTreeFilterText = "";
      if (folderTreeFilterInput) {
        folderTreeFilterInput.value = "";
      }
      if (typeof getNeutralinoFolderScanDetails === "function") {
        void startLazyFolderCountBridge(getNeutralinoFolderScanDetails());
      }
    }
    hideSidebarClosedFolderContextMenu();
    folderTreeRoot.removeEventListener("contextmenu", handleFolderTreeRootContextMenu);
    folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
    const displayNodes = getVisibleFolderTreeNodes(nodes || []);
    folderTreeRoot.innerHTML = "";
    if (!displayNodes.length && (folderTreeFilterText || selectedFolderTreeTags.size > 0)) {
      const hasSelectedTagFilter = selectedFolderTreeTags.size > 0;
      folderTreeRoot.innerHTML = folderTreeFilterText
        ? '<p class="folder-tree-placeholder">No files or folders match this filter.</p>'
        : hasSelectedTagFilter
          ? '<p class="folder-tree-placeholder">No Markdown files match the selected tag filter.</p>'
          : '<p class="folder-tree-placeholder">No files or folders found in this folder.</p>';
      updateFolderStatusLine();
      updateCloseFolderButtons();
      updateFolderTreeToolbarState();
      lineCounter?.updateButtons?.();
      updateFolderDependentControls();
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "folder-tree-list";
    ul.appendChild(renderFolderTreeNode(createOpenFolderRootTreeNode(displayNodes)));
    folderTreeRoot.appendChild(ul);
    restoreOpenFolderTreeState(preservedOpenFolderKeys);
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
    lineCounter?.updateButtons?.();
    updateFolderStatusLine();
    updateFolderDependentControls();
    if (!options.skipDerivedRefresh) void refreshSourceRootMetadata();
    syncFolderTreeSelectionToActiveTab({ scroll: false });
    if (!options.skipDerivedRefresh) renderLinkAutocomplete();
    if (!options.skipTagRefresh) {
      refreshFolderTagCounts();
    }
  }

  async function reloadOpenFolderTree(options = {}) {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      const nodes = await listMarkdownTreeNeutralino(activeFolderPath);
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes, "", { resolveLazyDirectories: true });
      renderFolderTree(nodes);
      await refreshOpenFolderGraphTabsFromFolderFiles();
      if (options.skipSavedGraphPrompt !== true) await promptActiveSavedGraphForCurrentFolder();
      return true;
    }

    if (activeFolderHandle) {
      const nodes = await listMarkdownTree(activeFolderHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      await refreshOpenFolderGraphTabsFromFolderFiles();
      if (options.skipSavedGraphPrompt !== true) await promptActiveSavedGraphForCurrentFolder();
      return true;
    }

    return false;
  }

  async function refreshFolderFilesForGraphComparison() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      const nodes = await listMarkdownTreeNeutralino(activeFolderPath);
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes, "", { resolveLazyDirectories: true });
      return true;
    }

    if (activeFolderHandle) {
      const nodes = await listMarkdownTree(activeFolderHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      return true;
    }

    return false;
  }

  let openFolderGraphRefreshRequestId = 0;

  const refreshOpenFolderGraphTabsFromFolderFiles = async function() {
    const refreshRequestId = ++openFolderGraphRefreshRequestId;
    const refreshFolderPath = activeFolderPath || "";
    const graphTabs = tabs.filter((tab) => (
      tab
      && tab.type === "graph"
      && !isFileBackedGraphTab(tab)
      && !isKeepSavedGraphMode(tab)
      && !tab.graphComparisonSnapshot
    ));
    if (!graphTabs.length) return false;

    let changed = false;
    for (const tab of graphTabs) {
      const currentSnapshot = tab.graphSnapshot || null;
      const nextSnapshot = await createGraphSnapshot(folderMarkdownFiles || [], currentSnapshot?.folderName || tab.folderName || tab.title);
      if (refreshRequestId !== openFolderGraphRefreshRequestId || refreshFolderPath !== (activeFolderPath || "")) return false;
      if (currentSnapshot?.createdAt) nextSnapshot.createdAt = currentSnapshot.createdAt;
      if (currentSnapshot && getGraphSnapshotSignature(currentSnapshot, tab.graphViewConfig || null) === getGraphSnapshotSignature(nextSnapshot, tab.graphViewConfig || null)) continue;
      tab.graphSnapshot = nextSnapshot;
      syncGraphTabDocument(tab);
      graphRenderCache.delete(tab.id);
      changed = true;
    }

    if (!changed) return false;
    saveTabsToStorage(tabs);
    updateGraphTagToolbar(getActiveGraphTab(), getActiveGraphTab()?.graphSnapshot || null);
    if (getActiveGraphTab()) renderGraphView();
    return true;
  };

  async function refreshOpenFolderTreeAfterFileDelete(filePath) {
    if (!isFolderOpen || !filePath) return false;

    if (activeFolderPath && !isPathInsideFolder(filePath, activeFolderPath)) {
      return false;
    }

    try {
      return app.modules?.sidebarContextTree?.removeDeletedPathFromFolderTree?.(filePath, { kind: "file" }) === true;
    } catch (error) {
      console.warn("Failed to refresh folder tree after deleting file:", error);
      return false;
    }
  }

  function isPathInsideFolder(filePath, folderPath) {
    if (!filePath || !folderPath) return false;
    const normalize = (path) => String(path).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedFile = normalize(filePath);
    const normalizedFolder = normalize(folderPath);
    return normalizedFile === normalizedFolder || normalizedFile.startsWith(normalizedFolder + "/");
  }

  function normalizeDeletedPathComparison(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getDeletedPathCandidates(path) {
    const candidates = new Set();
    if (!path) return candidates;

    const addCandidate = (candidate) => {
      const normalized = normalizeDeletedPathComparison(candidate);
      if (normalized) candidates.add(normalized);
    };

    addCandidate(path);
    if (activeFolderPath) {
      const relativePath = getPathRelativeToFolder(path, activeFolderPath);
      addCandidate(relativePath);
      if (!isPathInsideFolder(path, activeFolderPath)) {
        addCandidate(joinPath(activeFolderPath, path));
      }
    }

    return candidates;
  }

  function tabMatchesDeletedPath(tab, deletedPath, options = {}) {
    if (!tab || !deletedPath) return false;
    if (options.targetHandle && tab.sourceFileHandle === options.targetHandle) return true;

    const tabCandidates = getDeletedPathCandidates(tab.sourceFilePath);
    const deletedCandidates = getDeletedPathCandidates(deletedPath);
    if (!tabCandidates.size || !deletedCandidates.size) return false;

    for (const tabPath of tabCandidates) {
      for (const deletedPathCandidate of deletedCandidates) {
        if (options.kind === "folder") {
          if (tabPath === deletedPathCandidate || tabPath.startsWith(deletedPathCandidate + "/")) {
            return true;
          }
        } else if (tabPath === deletedPathCandidate) {
          return true;
        }
      }
    }

    return false;
  }

  function closeTabsForDeletedPath(deletedPath, options = {}) {
    const tabIdsToClose = tabs
      .filter((tab) => tabMatchesDeletedPath(tab, deletedPath, options))
      .map((tab) => tab.id);

    tabIdsToClose.forEach((tabId) => closeTab(tabId, { promptForUnsaved: false }));
    return tabIdsToClose.length;
  }


  function getValidFolderSortMode(mode) {
    return ["name-asc", "name-desc", "modified-desc", "modified-asc", "created-desc", "created-asc"].includes(mode)
      ? mode
      : "name-asc";
  }

  function getNodeTimestamp(node, field) {
    const value = Number(node?.[field] || 0);
    if (value > 0) return value;
    return Number(node?.modifiedAt || node?.file?.lastModified || 0) || 0;
  }

  function compareFolderTreeNodes(a, b) {
    if (a?.isParentNavigation && !b?.isParentNavigation) return -1;
    if (!a?.isParentNavigation && b?.isParentNavigation) return 1;
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;

    const mode = getValidFolderSortMode(currentFolderSortMode);
    if (mode === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
    if (mode === "modified-desc" || mode === "modified-asc") {
      const diff = getNodeTimestamp(a, "modifiedAt") - getNodeTimestamp(b, "modifiedAt");
      if (diff !== 0) return mode === "modified-desc" ? -diff : diff;
    }
    if (mode === "created-desc" || mode === "created-asc") {
      const diff = getNodeTimestamp(a, "createdAt") - getNodeTimestamp(b, "createdAt");
      if (diff !== 0) return mode === "created-desc" ? -diff : diff;
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  function sortFolderTreeNodes(nodes) {
    nodes.sort(compareFolderTreeNodes);
    nodes.forEach((node) => {
      if (node.kind === "directory") sortFolderTreeNodes(node.children || []);
    });
    return nodes;
  }

  async function updateFolderMarkdownFileOrderFromTree() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(currentFolderTreeNodes, "", { resolveLazyDirectories: true });
      return;
    }
    folderMarkdownFiles = await collectMarkdownFilesFromTree(currentFolderTreeNodes);
  }

  async function applyFolderSortMode(mode) {
    currentFolderSortMode = getValidFolderSortMode(mode);
    saveGlobalState({ folderSortMode: currentFolderSortMode });
    sortFolderTreeNodes(currentFolderTreeNodes);
    await updateFolderMarkdownFileOrderFromTree();
    updateFolderTreeSortControls();
    renderFilteredFolderTree();
  }

let lastNeutralinoFolderScanDetails = null;

function getNeutralinoFolderScanStartTime() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function getNeutralinoFolderScanDurationMs(startTime) {
  if (!startTime || typeof performance === "undefined") return 0;
  return Math.round((performance.now() - startTime) * 10) / 10;
}

function setNeutralinoFolderScanDetails(details = {}) {
  lastNeutralinoFolderScanDetails = {
    ...details,
    timestamp: Date.now()
  };
}

function getNeutralinoFolderScanDetails() {
  return lastNeutralinoFolderScanDetails;
}

function getNeutralinoDirectoryEntryRelativePath(rootPath, item) {
  const root = String(rootPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const candidates = [
    item?.path,
    item?.fullPath,
    item?.absolutePath,
    item?.entry
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!value || value === "." || value === "..") continue;
    if (root && (value === root || value.startsWith(root + "/"))) {
      const relative = value.slice(root.length).replace(/^\/+/, "");
      if (relative) return relative;
    }
    return value;
  }
  return "";
}

function hasNestedNeutralinoDirectoryEntries(rootPath, items) {
  return (items || []).some((item) => getNeutralinoDirectoryEntryRelativePath(rootPath, item).includes("/"));
}

function buildNeutralinoTreeFromRecursiveEntries(rootPath, items) {
  const rootChildren = [];
  const directoryByPath = new Map();

  function ensureDirectory(relativePath, name, source = {}) {
    const normalizedPath = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) return null;
    const normalizedParts = normalizedPath.split("/");
    if ((!shouldShowGitProjectFolder() && normalizedParts.includes(".git")) || (!shouldShowMdEditorProjectFolder() && normalizedParts.includes(".md-editor"))) return null;
    const existing = directoryByPath.get(normalizedPath);
    if (existing) return existing;

    const parts = normalizedPath.split("/").filter(Boolean);
    const directoryName = name || parts[parts.length - 1] || normalizedPath;
    const parentPath = parts.slice(0, -1).join("/");
    const node = {
      kind: "directory",
      name: directoryName,
      path: normalizedPath,
      children: [],
      fullPath: `${String(rootPath || "").replace(/\\/g, "/").replace(/\/+$/, "")}/${normalizedPath}`,
      ...createFilesystemMetadata(source)
    };
    directoryByPath.set(normalizedPath, node);
    const parent = parentPath ? ensureDirectory(parentPath, parts[parts.length - 2]) : null;
    if (parent) parent.children.push(node);
    else rootChildren.push(node);
    return node;
  }

  (items || []).forEach((item) => {
    const relativePath = getNeutralinoDirectoryEntryRelativePath(rootPath, item);
    if (!relativePath) return;
    const parts = relativePath.split("/").filter(Boolean);
    if (!parts.length || (!shouldShowGitProjectFolder() && parts.includes(".git")) || (!shouldShowMdEditorProjectFolder() && parts.includes(".md-editor"))) return;
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const type = String(item?.type || "").toUpperCase();
    if (type === "DIRECTORY" || item?.isDirectory === true) {
      ensureDirectory(relativePath, name, item);
      return;
    }
    if (type !== "FILE" && item?.isFile !== true) return;
    const parent = parentPath ? ensureDirectory(parentPath, parts[parts.length - 2]) : null;
    const fullPath = `${String(rootPath || "").replace(/\\/g, "/").replace(/\/+$/, "")}/${relativePath}`;
    const node = {
      kind: "file",
      name,
      path: relativePath,
      fullPath,
      ...createFilesystemMetadata(item),
      isGraphDocumentFile: isGraphFilePath(fullPath)
    };
    if (parent) parent.children.push(node);
    else rootChildren.push(node);
  });

  return sortFolderTreeNodes(rootChildren);
}

async function readNeutralinoDirectoryChildren(parentPath, rootPath) {
  const entries = await Neutralino.filesystem.readDirectory(parentPath);
  const children = [];
  for (let index = 0; index < (entries || []).length; index += 1) {
    const item = entries[index];
    const name = item?.entry || item?.name;
    if (!name || name === "." || name === ".." || shouldSkipGitProjectFolder(name) || shouldSkipMdEditorProjectFolder(name)) continue;
    const fullPath = `${String(parentPath || "").replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`;
    const relativePath = getNeutralinoDirectoryEntryRelativePath(rootPath, { path: fullPath });
    const type = String(item?.type || "").toUpperCase();
    if (type === "DIRECTORY" || item?.isDirectory === true) {
      if (shouldSkipCustomHiddenFolder(name)) continue;
      children.push({
        kind: "directory",
        name,
        path: relativePath,
        fullPath,
        children: [],
        childrenLazy: true,
        ...createFilesystemMetadata(item)
      });
    } else if (type === "FILE" || item?.isFile === true) {
      children.push({
        kind: "file",
        name,
        path: relativePath,
        fullPath,
        ...createFilesystemMetadata(item),
        isGraphDocumentFile: isGraphFilePath(fullPath)
      });
    }
    if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return sortFolderTreeNodes(children);
}

async function scanNeutralinoDirectoryTree(parentPath, rootPath, options = {}) {
  const threshold = Number.isFinite(Number(options.threshold)) ? Math.max(0, Math.floor(Number(options.threshold))) : Number.MAX_SAFE_INTEGER;
  const collectNodes = options.collectNodes !== false;
  const entries = await Neutralino.filesystem.readDirectory(parentPath);
  const children = [];
  let fileCount = 0;
  let directoryCount = 0;
  let entryCount = 0;
  let thresholdReached = false;

  for (let index = 0; index < (entries || []).length; index += 1) {
    const item = entries[index];
    const name = item?.entry || item?.name;
    if (!name || name === "." || name === ".." || shouldSkipGitProjectFolder(name) || shouldSkipMdEditorProjectFolder(name)) continue;
    entryCount += 1;
    const fullPath = `${String(parentPath || "").replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`;
    const relativePath = getNeutralinoDirectoryEntryRelativePath(rootPath, { path: fullPath });
    const type = String(item?.type || "").toUpperCase();

    if (type === "DIRECTORY" || item?.isDirectory === true) {
      if (shouldSkipCustomHiddenFolder(name)) continue;
      directoryCount += 1;
      const shouldCollectNestedNodes = collectNodes && !thresholdReached;
      const nested = await scanNeutralinoDirectoryTree(fullPath, rootPath, {
        threshold: threshold - fileCount,
        collectNodes: shouldCollectNestedNodes
      });
      fileCount += nested.fileCount;
      directoryCount += nested.directoryCount;
      entryCount += nested.entryCount;
      thresholdReached = nested.thresholdReached || fileCount >= threshold;
      if (collectNodes && shouldCollectNestedNodes) {
        children.push({
          kind: "directory",
          name,
          path: relativePath,
          fullPath,
          children: thresholdReached ? [] : nested.nodes,
          childrenLazy: thresholdReached,
          ...createFilesystemMetadata(item)
        });
      }
    } else if (type === "FILE" || item?.isFile === true) {
      fileCount += 1;
      if (collectNodes && !thresholdReached) {
        children.push({
          kind: "file",
          name,
          path: relativePath,
          fullPath,
          ...createFilesystemMetadata(item),
          isGraphDocumentFile: isGraphFilePath(fullPath)
        });
      }
      thresholdReached = fileCount >= threshold;
    }

    if (thresholdReached) break;
    if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    nodes: sortFolderTreeNodes(children),
    fileCount,
    directoryCount,
    entryCount,
    thresholdReached
  };
}

async function listMarkdownTreeNeutralino(dirPath, options = {}) {
  const scanStart = getNeutralinoFolderScanStartTime();
  try {
    const directNodes = await readNeutralinoDirectoryChildren(dirPath, dirPath);
    setNeutralinoFolderScanDetails({
      method: "neutralino-readDirectory-direct",
      reason: "opened-folder-lazy-root",
      folder: dirPath,
      rootCount: directNodes.length,
      entryCount: directNodes.length,
      durationMs: getNeutralinoFolderScanDurationMs(scanStart)
    });
    return directNodes;
  } catch (error) {
    const durationMs = getNeutralinoFolderScanDurationMs(scanStart);
    console.warn("Failed to read directory tree:", dirPath, error);
    setNeutralinoFolderScanDetails({
      method: "neutralino-readDirectory",
      reason: "open-error",
      folder: dirPath,
      rootCount: 0,
      entryCount: 0,
      durationMs,
      error: error?.message || String(error || "Unknown error")
    });
    throw error;
  }
}

async function collectMarkdownFilesFromTreeNeutralino(nodes, parentPath = "", options = {}) {
  const shouldResolveLazyDirectories = options.resolveLazyDirectories === true;
  const perfSession = !parentPath && typeof createGraphPerfSession === "function"
    ? createGraphPerfSession("folder markdown file discovery", { runtime: "neutralino" })
    : null;
  const files = [];
  try {
    for (let index = 0; index < (nodes || []).length; index += 1) {
      const node = (nodes || [])[index];
      if (node.isParentNavigation) continue;
      if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.kind === "directory") {
        if (node.name === ".md-editor") continue;
        const nestedFiles = shouldResolveLazyDirectories && node.childrenLazy === true && node.fullPath
          ? await collectMarkdownFilesFromNeutralinoDirectory(node.fullPath, currentPath)
          : await collectMarkdownFilesFromTreeNeutralino(node.children || [], currentPath, options);
        files.push(...nestedFiles);
      } else if (node.kind === "file" && isMarkdownPath(node.name)) {
        const metadata = createFilesystemMetadata(node);
        files.push({
          path: currentPath,
          fullPath: node.fullPath,
          name: node.name,
          size: metadata.size,
          modifiedAt: metadata.modifiedAt,
          createdAt: metadata.createdAt
        });
      }
    }
    perfSession?.end({ files: files.length, rootEntries: (nodes || []).length });
  } catch (error) {
    perfSession?.end({ failed: true, files: files.length, rootEntries: (nodes || []).length });
    throw error;
  }
  return files;
}

/**
 * Collect Markdown files from a Neutralino filesystem directory without rendering tree children.
 * @param {string} parentPath - Absolute desktop folder path to scan.
 * @param {string} parentRelativePath - Folder path relative to the open workspace root.
 * @returns {Promise<Array>} Graph-ready Markdown file entries found below the folder.
 */
async function collectMarkdownFilesFromNeutralinoDirectory(parentPath, parentRelativePath = "") {
  if (!parentPath || typeof Neutralino === "undefined" || !Neutralino.filesystem?.readDirectory) return [];
  const entries = await Neutralino.filesystem.readDirectory(parentPath);
  const files = [];

  for (let index = 0; index < (entries || []).length; index += 1) {
    const item = entries[index];
    const name = item?.entry || item?.name || "";
    if (!name || name === "." || name === ".." || name === ".md-editor") continue;
    const fullPath = joinPath(parentPath, name);
    const relativePath = parentRelativePath ? `${parentRelativePath}/${name}` : name;
    const type = String(item?.type || item?.kind || "").toUpperCase();

    if (type === "DIRECTORY" || type === "DIR" || item?.isDirectory === true) {
      files.push(...await collectMarkdownFilesFromNeutralinoDirectory(fullPath, relativePath));
    } else if (type === "FILE" || item?.isFile === true || !type) {
      if (isMarkdownPath(name)) {
        const metadata = await getNeutralinoPathMetadata(fullPath, item);
        files.push({
          path: relativePath,
          fullPath,
          name,
          size: metadata.size,
          modifiedAt: metadata.modifiedAt,
          createdAt: metadata.createdAt
        });
      }
    }

    if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  files.sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
  return files;
}


/**
 * Stream supported workspace-search files from Neutralino tree nodes.
 * @param {Array} nodes - Folder tree nodes to inspect.
 * @param {string} parentPath - Workspace-relative parent path for nested nodes.
 * @param {object} options - Search collection options.
 * @yields {object} Supported file entries for Workspace Search.
 */
async function* collectWorkspaceSearchFilesFromTreeNeutralino(nodes, parentPath = "", options = {}) {
  const shouldResolveLazyDirectories = options.resolveLazyDirectories === true;
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = (nodes || [])[index];
    if (node.isParentNavigation) continue;
    if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.kind === "directory") {
      if (node.name === ".md-editor") continue;
      if (shouldResolveLazyDirectories && node.childrenLazy === true && node.fullPath) {
        yield* collectWorkspaceSearchFilesFromNeutralinoDirectory(node.fullPath, currentPath);
      } else {
        yield* collectWorkspaceSearchFilesFromTreeNeutralino(node.children || [], currentPath, options);
      }
    } else if (node.kind === "file" && isSupportedFolderTreeDocumentNode(node)) {
      const metadata = createFilesystemMetadata(node);
      yield {
        path: currentPath,
        fullPath: node.fullPath,
        name: node.name,
        size: metadata.size,
        modifiedAt: metadata.modifiedAt,
        createdAt: metadata.createdAt
      };
    }
  }
}

/**
 * Stream supported workspace-search files from a Neutralino directory without rendering children.
 * @param {string} parentPath - Absolute desktop folder path to scan.
 * @param {string} parentRelativePath - Folder path relative to the open workspace root.
 * @yields {object} Supported file entries found below the folder.
 */
async function* collectWorkspaceSearchFilesFromNeutralinoDirectory(parentPath, parentRelativePath = "") {
  if (!parentPath || typeof Neutralino === "undefined" || !Neutralino.filesystem?.readDirectory) return;
  const entries = await Neutralino.filesystem.readDirectory(parentPath);

  for (let index = 0; index < (entries || []).length; index += 1) {
    const item = entries[index];
    const name = item?.entry || item?.name || "";
    if (!name || name === "." || name === ".." || name === ".md-editor") continue;
    const fullPath = joinPath(parentPath, name);
    const relativePath = parentRelativePath ? `${parentRelativePath}/${name}` : name;
    const type = String(item?.type || item?.kind || "").toUpperCase();

    if (type === "DIRECTORY" || type === "DIR" || item?.isDirectory === true) {
      yield* collectWorkspaceSearchFilesFromNeutralinoDirectory(fullPath, relativePath);
    } else if (type === "FILE" || item?.isFile === true || !type) {
      const node = {
        kind: "file",
        name,
        path: relativePath,
        fullPath,
        ...createFilesystemMetadata(item),
        isGraphDocumentFile: isGraphFilePath(fullPath)
      };
      if (isSupportedFolderTreeDocumentNode(node)) {
        const metadata = await getNeutralinoPathMetadata(fullPath, item);
        yield {
          path: relativePath,
          fullPath,
          name,
          size: metadata.size,
          modifiedAt: metadata.modifiedAt,
          createdAt: metadata.createdAt
        };
      }
    }

    if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

  let sidebarFileContextMenu = null;
  let sidebarFolderContextMenu = null;
  let sidebarClosedFolderContextMenu = null;
  let sidebarContextTarget = null;

  const CONTEXT_MENU_ACTIONS = Object.freeze({
    openInNewTab: { label: "Open in a new tab", icon: "bi bi-box-arrow-up-right" },
    openAll: { label: "Open all", icon: "bi bi-folder2-open" },
    exportOriginalNodes: { label: "Export original nodes", icon: "bi bi-files" },
    exportOriginalNode: { label: "Export original node", icon: "bi bi-file-earmark-arrow-down" },
    openWithDefaultApp: { label: "Open in default app", icon: "bi bi-window" },
    openInHexEditor: { label: "Open in Hex Editor", icon: "bi bi-file-binary" },
    originalSource: { label: "Original Source", icon: "bi bi-file-earmark-code" },
    openOriginalInNewTab: { label: "Open original in a new tab", icon: "bi bi-box-arrow-up-right" },
    openOriginalWithDefaultApp: { label: "Open original in default app", icon: "bi bi-window" },
    revealOriginalInFileExplorer: { label: "Reveal original in file explorer", icon: "bi bi-folder2-open" },
    revealInFileExplorer: { label: "Reveal in file explorer", icon: "bi bi-folder2-open" },
    revealOriginalFolder: { label: "Reveal original folder", icon: "bi bi-folder-symlink" },
    setOriginalSourceRoot: { label: "Set original source root", icon: "bi bi-folder-symlink" },
    revealInTreeView: { label: "Reveal in TreeView", icon: "bi bi-list-ul" },
    rename: { label: "Rename", icon: "bi bi-pencil" },
    copy: { label: "Copy", icon: "bi bi-clipboard" },
    copyPath: { label: "Copy path", icon: "bi bi-file-earmark-text" },
    copyContent: { label: "Copy content", icon: "bi bi-file-text" },
    copyFrontmatter: { label: "Copy frontmatter", icon: "bi bi-card-text" },
    copyTags: { label: "Copy tags", icon: "bi bi-tags" },
    share: { label: "Share", icon: "bi bi-share" },
    deleteFile: { label: "Delete file", icon: "bi bi-trash3" },
    deleteFolder: { label: "Delete folder", icon: "bi bi-trash3" },
    export: { label: "Export", icon: "bi bi-download" },
    exportMarkdown: { label: "Export as Markdown", icon: "bi bi-file-earmark-text" },
    exportHtml: { label: "Export as HTML", icon: "bi bi-file-earmark-code" },
    exportPdf: { label: "Export as PDF", icon: "bi bi-file-earmark-pdf" },
    exportFolderToGraph: { label: "Export Folder to Graph", icon: "bi bi-download" },
    convertCodeToMd: { label: "Convert Code to MD", icon: "bi bi-filetype-md" },
    updateProject: { label: "Update project", icon: "bi bi-arrow-repeat" },
    showGraphView: { label: "Show graph view", icon: "bi bi-diagram-3" },
    refresh: { label: "Refresh", icon: "bi bi-arrow-clockwise" },
    newFile: { label: "New file ...", icon: "bi bi-file-earmark-plus" },
    newFolder: { label: "New folder ...", icon: "bi bi-folder-plus" },
    centerGraph: { label: "Center Graph", icon: "bi bi-bullseye" },
    removePoint: { label: "Remove this point", icon: "bi bi-eye-slash" },
    removeLeafNodes: { label: "Remove Leaf Nodes", icon: "bi bi-diagram-2" },
    collapseToCluster: { label: "Collapse to Cluster", icon: "bi bi-collection" },
    collapseFullOutgoingToCluster: { label: "Collapse Full Outgoing Tree", icon: "bi bi-diagram-3" },
    collapseDetectedCommunity: { label: "Collapse Detected Community", icon: "bi bi-bounding-box-circles" },
    expandCluster: { label: "Expand Cluster", icon: "bi bi-arrows-angle-expand" },
    showGraph: { label: "Show graph", icon: "bi bi-diagram-3" },
    showLocalGraph: { label: "Show local graph", icon: "bi bi-diagram-2" },
    showFullLocalGraph: { label: "Show full local graph", icon: "bi bi-diagram-3" },
    showFullGraph: { label: "Show full graph", icon: "bi bi-diagram-3" },
    showFullNetwork: { label: "Show full network", icon: "bi bi-diagram-3" },
    showExpandedCluster: { label: "Show expanded cluster", icon: "bi bi-arrows-angle-expand" },
    addToTab: { label: "Add to Tab", icon: "bi bi-plus-circle" },
    addPointToTab: { label: "Add point to Tab ...", icon: "bi bi-plus-circle" },
    tags: { label: "Tags", icon: "bi bi-tags" },
    tagLocalGraph: { label: "Tag Local Graph", icon: "bi bi-tags" },
    tagFullLocalGraph: { label: "Tag full Local Graph", icon: "bi bi-tags-fill" },
    tagFullNetwork: { label: "Tag full Network", icon: "bi bi-diagram-3-fill" },
    addTag: { label: "Add tagג€¦", icon: "bi bi-tag" },
    removeTag: { label: "Remove tagג€¦", icon: "bi bi-tag-fill" },
    deleteTag: { label: "Delete tag", icon: "bi bi-trash3" },
    turnMagneticForcesOff: { label: "Turn magnetic forces off", icon: "bi bi-magnet" },
    copyDependencies: { label: "Copy dependencies", icon: "bi bi-list-ul" },
    copyFullDependencies: { label: "Copy full dependencies", icon: "bi bi-bezier2" },
    copyBacklinks: { label: "Copy backlinks", icon: "bi bi-arrow-left-circle" },
    copyFullNetwork: { label: "Copy full network", icon: "bi bi-diagram-3" },
    openFolder: { label: "Open folder", icon: "bi bi-folder2-open" }
  });

  const javaMainClassFinder = window.registerMarkdownViewerJavaMainClassFinder?.(app, {
    get compiler() { return app.modules?.javaCompiler; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });

  const sidebarContextTree = window.registerMarkdownViewerSidebarContextTree(app, {
    CONTEXT_MENU_ACTIONS,
    get activeFolderName() { return activeFolderName; },
    set activeFolderName(value) { activeFolderName = value; },
    get activeFolderHandle() { return activeFolderHandle; },
    set activeFolderHandle(value) { activeFolderHandle = value; },
    get activeFolderPath() { return activeFolderPath; },
    set activeFolderPath(value) { activeFolderPath = value; },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    getMaxOpenTabs,
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    set folderMarkdownFiles(value) { folderMarkdownFiles = value; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    set currentFolderTreeNodes(value) { currentFolderTreeNodes = value; },
    get selectedFolderTreeTags() { return selectedFolderTreeTags; },
    set selectedFolderTreeTags(value) { selectedFolderTreeTags = value; },
    get isFolderOpen() { return isFolderOpen; },
    set isFolderOpen(value) { isFolderOpen = value; },
    get showUnsupportedFolderFiles() { return showUnsupportedFolderFiles; },
    get shownFolderInputFallbackNotice() { return shownFolderInputFallbackNotice; },
    set shownFolderInputFallbackNotice(value) { shownFolderInputFallbackNotice = value; },
    get markdownEditor() { return markdownEditor; },
    activeEditorCommands,
    get graphRenderCache() { return graphRenderCache; },
    get folderTreeRoot() { return folderTreeRoot; },
    get folderInput() { return folderInput; },
    get sidebarFileContextMenu() { return sidebarFileContextMenu; },
    set sidebarFileContextMenu(value) { sidebarFileContextMenu = value; },
    get sidebarFileContextTargetNode() { return sidebarFileContextTargetNode; },
    set sidebarFileContextTargetNode(value) { sidebarFileContextTargetNode = value; },
    get sidebarFolderContextMenu() { return sidebarFolderContextMenu; },
    set sidebarFolderContextMenu(value) { sidebarFolderContextMenu = value; },
    get sidebarFolderContextTargetNode() { return sidebarFolderContextTargetNode; },
    set sidebarFolderContextTargetNode(value) { sidebarFolderContextTargetNode = value; },
    get sidebarClosedFolderContextMenu() { return sidebarClosedFolderContextMenu; },
    set sidebarClosedFolderContextMenu(value) { sidebarClosedFolderContextMenu = value; },
    get sidebarRenameModal() { return sidebarRenameModal; },
    get sidebarRenameTitle() { return sidebarRenameTitle; },
    get sidebarRenameInput() { return sidebarRenameInput; },
    get sidebarRenameError() { return sidebarRenameError; },
    get sidebarRenameConfirm() { return sidebarRenameConfirm; },
    get sidebarRenameCancel() { return sidebarRenameCancel; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get bootstrap() { return typeof bootstrap !== "undefined" ? bootstrap : undefined; },
    get navigator() { return navigator; },
    languageRegistry,
    folderPicker,
    get normalizeEditorContent() { return normalizeEditorContent; },
    normalizeFileTagList,
    normalizeTagName,
    setFileTagsInContent,
    addTagToContent,
    removeTagFromContent,
    getFileTagsFromContent,
    getKnownTags,
    getAvailableTags,
    getReferencedTags,
    createTag,
    promptForNewTag,
    saveKnownTags,
    getComparableFilePath,
    getFolderTreeNodePathKey,
    readFolderMarkdownFileContent,
    updateFolderTreeNodeTagsForEntry,
    refreshFolderTagCounts,
    getActiveGraphTab,
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get renderGraphView() { return renderGraphView; },
    createGraphSnapshot,
    isKeepSavedGraphMode,
    markGraphTabAsChanged,
    saveTabsToStorage,
    invalidateWorkspaceDerivedState,
    get saveAs() { return saveAs; },
    get exportHtml() { return exportHtml; },
    get exportPdf() { return exportPdf; },
    get renderTagManagementList() { return renderTagManagementList; },
    get renderFilteredFolderTree() { return renderFilteredFolderTree; },
    get updateFolderTreeExpandToggleButtons() { return updateFolderTreeExpandToggleButtons; },
    get renderLinkAutocomplete() { return renderLinkAutocomplete; },
    get renderEditorSyntaxHighlights() { return renderEditorSyntaxHighlights; },
    get updateEditorLineNumbers() { return updateEditorLineNumbers; },
    get renderMarkdown() { return renderMarkdown; },
    showCodeConverterDialog,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    resolveOriginalSourcePath,
    promptForSourceRoot,
    get switchTab() { return switchTab; },
    get pinTemporaryTab() { return pinTemporaryTab; },
    get createGraphTab() { return createGraphTab; },
    get createOpenedSource() { return createOpenedSource; },
    get setTabOpenedSource() { return setTabOpenedSource; },
    createFolderGraphScopeKey,
    focusExistingFolderGraphTab,
    getGraphTitleFromFileName,
    getGraphDisplayLabel,
    resolveGraphTargetId,
    normalizeGraphNodeName,
    getGraphLinkKey,
    normalizeGraphTagNodeId,
    normalizeGraphTagNodeIds,
    normalizeGraphViewConfig,
    getGraphColorInputValue,
    createGraphGroupId,
    normalizeGraphGroups,
    getNextDefaultGraphGroupColor,
    serializeGraphExportDocument,
    getSuggestedGraphFileName,
    getGraphExportContent,
    exportFolderFilesToGraph,
    copyToClipboard,
    showCopiedMessage,
    get copyShareUrlFromText() { return app.actions.copyShareUrlFromText; },
    isNeutralinoRuntime,
    joinPath,
    shouldConfirmMoveFiles,
    getFileName,
    getFileExtension,
    sanitizeMarkdownFileName,
    getMarkdownTitleFromFileName,
    isGraphFilePath,
    isJsonPath,
    isSidebarDocumentPath,
    isSidebarDocumentNode,
    isSupportedFolderTreeDocumentNode,
    getFolderTreeNodeTags,
    isMarkdownPath,
    isKnownTextFilePath,
    fileContainsGraphDocument,
    appDebugLog,
    listMarkdownTree,
    collectMarkdownFilesFromTree,
    sortFolderTreeNodes,
    listMarkdownTreeNeutralino,
    collectMarkdownFilesFromTreeNeutralino,
    collectMarkdownFilesFromNeutralinoDirectory,
    renderFolderTree,
    renderFolderLoadingState,
    renderFolderLoadingError,
    rememberRecentFile,
    rememberRecentFolder,
    shouldShowGitProjectFolder,
    shouldShowMdEditorProjectFolder,
    shouldSkipCustomHiddenFolder,
    updateCloseFolderButtons,
    updateFolderTreeToolbarState,
    updateFolderStatusLine,
    clearFolderTagCounts,
    closeFolderTree,
    closeTabsForDeletedPath,
    refreshOpenFolderTreeAfterFileDelete,
    isPathInsideFolder,
    reloadOpenFolderTree,
    openFolderTreeFromNeutralinoPath,
    cloneGitRepositoryFromEmptyFolderView,
    handleUpdateProject,
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    getFolderTreeExpandLimitThreshold,
    getFolderTreeExpandLimitDepth,
    isFolderTreeDefaultExpanded
  });
  const folderWatcher = window.registerMarkdownViewerFolderWatcher?.(app, {
    get activeFolderPath() { return activeFolderPath; },
    get activeTabId() { return activeTabId; },
    get isFolderOpen() { return isFolderOpen; },
    get tabs() { return tabs; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    isNeutralinoRuntime,
    getFileName,
    normalizeEditorContent,
    getExternalFileChangeBehavior,
    setActiveEditorContent: function(content) {
      if (activeEditorCommands?.setActiveEditorValue) {
        activeEditorCommands.setActiveEditorValue(content);
      } else {
        markdownEditor.value = content;
      }
    },
    renderEditorSyntaxHighlights,
    updateEditorLineNumbers,
    renderMarkdown,
    saveTabsToStorage,
    renderTabBar,
    destroyTabView: function(tabId) {
      tabViewManager?.destroyTabView?.(tabId);
    },
    updateSaveCurrentFileButtons,
    closeTab,
    refreshFolderTagCounts,
    refreshOpenFolderGraphTabsFromFolderFiles,
    renderLinkAutocomplete,
    workspaceActivityClient
  });
  const {
    createFileContextMenuButton,
    createTagsContextSubmenu,
    renderTagsContextSubmenu,
    getSidebarNodeSource,
    getSidebarNodeClipboardPath,
    readSidebarNodeContent,
    writeSidebarNodeContent,
    sidebarNodeMatchesSnapshotFile,
    updateGraphSnapshotsForSidebarFileTagChange,
    updateOpenMarkdownTabsForSidebarNode,
    setSidebarNodeTags,
    runWithTemporaryEditorContent,
    exportMarkdownContent,
    exportHtmlContent,
    exportPdfContent,
    getSidebarNodeFilesystemPath,
    copySidebarContextText,
    hideSidebarFileContextMenu,
    hideSidebarFolderContextMenu,
    hideSidebarClosedFolderContextMenu,
    hideSidebarContextMenus,
    positionSidebarContextMenu,
    positionSidebarFileContextMenu,
    positionSidebarFolderContextMenu,
    positionSidebarClosedFolderContextMenu,
    getOpenFolderMainMenuButton,
    getOpenFolderActionLabel,
    getOpenFolderActionTitle,
    getPathDirectory,
    getRenamedSiblingPath,
    validateSidebarRenameName,
    promptSidebarRename,
    promptSidebarNewFileName,
    promptSidebarNewFolderName,
    updateTabsAfterSidebarFileRename,
    stripMarkdownExtension,
    splitMarkdownLinkSuffix,
    getRelativePathBetweenFiles,
    getRenameReferenceTargetPath,
    updateMarkdownRenameLinks,
    writeFolderMarkdownEntryContent,
    getEntryContent,
    updateOpenTabsAfterMarkdownLinkRename,
    updateOpenFolderLinksAfterSidebarRename,
    replacePathPrefix,
    getPathRelativeToFolder,
    renameGraphSnapshotPathReferences,
    updateGraphTabConfigAfterNodeRename,
    updateGraphTabsAfterPathRename,
    getSidebarRenamePathMappings,
    updateTabsAfterSidebarFolderRename,
    sidebarFileExists,
    createSidebarFileOnDisk,
    createSidebarFolderOnDisk,
    renameSidebarNodeOnDisk,
    ensureSidebarFileContextMenu,
    isOpenFolderRootContextNode,
    getOpenFolderRootContextNode,
    getSidebarFolderClipboardPath,
    getSidebarFolderFilesystemPath,
    getSidebarFolderGraphTitle,
    collectMarkdownFilesForSidebarFolder,
    openSidebarFolderGraphView,
    exportSidebarFolderToGraph,
    revealSidebarFolder,
    deleteSidebarFolder,
    ensureSidebarFolderContextMenu,
    showSidebarFileContextMenu,
    showSidebarFolderContextMenu,
    ensureSidebarClosedFolderContextMenu,
    showSidebarClosedFolderContextMenu,
    handleFolderTreeRootContextMenu,
    handleFolderTreeRootClick,
    getFolderTreeChildrenContainer,
    resetFolderTreeAnimation,
    finishFolderTreeAnimation,
    prefersReducedFolderTreeMotion,
    toggleFolderTreeDetails,
    getFileIconClass,
    getFileLanguageClass,
    renderFolderTreeNode,
    findTabForSidebarFile,
    buildTreeFromFileList,
    openFolderTree
  } = sidebarContextTree;
  if (typeof window.registerMarkdownViewerAiCompanionConversionExportTools === "function") {
    aiCompanionConversionExportTools = window.registerMarkdownViewerAiCompanionConversionExportTools(app, {
      exportActiveFolderToGraph,
      exportHtmlContent,
      exportMarkdownContent,
      exportPdfContent,
      getActiveEditorValue,
      getActiveFolderPath: function() { return activeFolderPath || ""; },
      getActiveTab: function() { return tabs.find((tab) => tab.id === activeTabId) || null; },
      getCodeConverterState,
      getConversionExportState,
      startCodeConversion: startCodeConversionFromAgent
    });
  }

  const flatFolderView = window.registerMarkdownViewerFlatFolderView?.(app, {
    get folderTreeRoot() { return folderTreeRoot; },
    get folderTreeFilterText() { return folderTreeFilterText; },
    matchesFolderFilterText: folderToolbar.matchesFolderFilterText,
    get selectedFolderTreeTags() { return selectedFolderTreeTags; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get activeFolderPath() { return activeFolderPath; },
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    get currentFolderSortMode() { return currentFolderSortMode; },
    get showUnsupportedFolderFiles() { return showUnsupportedFolderFiles; },
    getFileName,
    joinPath,
    shouldShowGitProjectFolder,
    shouldShowMdEditorProjectFolder,
    shouldSkipCustomHiddenFolder,
    normalizeFileTagList,
    getValidFolderSortMode,
    isSupportedFolderTreeDocumentNode,
    isGraphFilePath,
    openDocumentSourceFile,
    showSidebarFileContextMenu,
    getFileIconClass,
    getFileLanguageClass,
    getFilesystemMetadata: createFilesystemMetadata,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  function getWorkspaceEntryPath(entry) {
    return String(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "").replace(/\\/g, "/");
  }

  function findWorkspaceFolderEntry(entry) {
    const entryPath = getComparableFilePath(getWorkspaceEntryPath(entry));
    if (!entryPath) return null;
    return (folderMarkdownFiles || []).find(function(candidate) {
      return getComparableFilePath(candidate.fullPath || candidate.path || candidate.file?.webkitRelativePath || candidate.file?.name || candidate.name || "") === entryPath;
    }) || null;
  }

  async function readWorkspaceEntryContent(entry) {
    const folderEntry = findWorkspaceFolderEntry(entry);
    if (folderEntry) return readFolderMarkdownFileContent(folderEntry);
    return getEntryContent(entry);
  }

  async function writeWorkspaceEntryContent(entry, content) {
    const folderEntry = findWorkspaceFolderEntry(entry);
    return writeFolderMarkdownEntryContent(folderEntry || entry, content);
  }

  async function onWorkspaceEntryChanged(entry, content) {
    const normalizedContent = normalizeEditorContent(content);
    const folderEntry = findWorkspaceFolderEntry(entry);
    if (folderEntry) {
      folderEntry.content = normalizedContent;
      folderEntry.tags = getFileTagsFromContent(normalizedContent);
      updateFolderTreeNodeTagsForEntry(folderEntry, folderEntry.tags);
    }
    if (entry && entry !== folderEntry) {
      entry.content = normalizedContent;
      entry.tags = getFileTagsFromContent(normalizedContent);
      updateFolderTreeNodeTagsForEntry(entry, entry.tags);
    }
    updateOpenMarkdownTabsForSidebarNode(folderEntry || entry, normalizedContent);
    await updateGraphSnapshotsForChangedTagFiles([folderEntry || entry]);
    await refreshFolderTagCounts();
    renderFilteredFolderTree();
    renderTagManagementList();
    renderLinkAutocomplete();
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    if (getActiveGraphTab()) renderGraphView();
  }

  async function openWorkspaceEntry(entry, options = {}) {
    const content = await readWorkspaceEntryContent(entry);
    const path = getWorkspaceEntryPath(entry);
    const name = entry?.name || getFileName(path);
    const source = {
      name,
      file: entry?.file || null,
      handle: entry?.handle || null,
      path: getSidebarNodeFilesystemPath(entry) || entry?.fullPath || entry?.path || null
    };
    await openDocumentSourceFile(
      { ...source, content },
      { temporary: false, title: getMarkdownTitleFromFileName(name) }
    );
    if (Number.isFinite(options.matchStart) && options.matchStart >= 0) {
      selectEditorTextRange(options.matchStart, options.matchStart + Math.max(0, Number(options.matchLength) || 0));
    }
  }

  const workspaceSearch = window.registerMarkdownViewerWorkspaceSearch(app, {
    isFolderOpen: function() { return isFolderOpen; },
    getFolderMarkdownFiles: function() { return folderMarkdownFiles; },
    getWorkspaceSearchFiles: async function() {
      if (isNeutralinoRuntime() && activeFolderPath && typeof collectWorkspaceSearchFilesFromTreeNeutralino === "function") {
        try {
          return await collectWorkspaceSearchFilesFromTreeNeutralino(currentFolderTreeNodes, "", { resolveLazyDirectories: true });
        } catch (error) {
          console.warn("Failed to resolve workspace search files:", error);
        }
      }
      return folderMarkdownFiles;
    },
    getCurrentFolderTreeNodes: function() { return currentFolderTreeNodes; },
    getWorkspaceSearchResultLimit: function() { return getWorkspaceSearchResultLimit(); },
    readWorkspaceEntryContent,
    writeWorkspaceEntryContent,
    onWorkspaceEntryChanged,
    openWorkspaceEntry,
    parseFrontmatter,
    getFileTagsFromContent,
    normalizeTagName,
    isMarkdownPath,
    isTextDocumentPath,
    isSupportedFolderTreeDocumentNode,
    isSidebarVisible,
    setSidebarVisible
  });
  const openWorkspaceSearchModal = workspaceSearch.openWorkspaceSearchModal;
  const workspaceGit = window.registerMarkdownViewerWorkspaceGit?.(app, {
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    isDesktopRuntime: function() { return isNeutralinoRuntime(); },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    setSidebarView: workspaceSearch.setSidebarView,
    openFileCompareInTab: function(compareDescriptor) {
      return tabsModule?.openFileCompareInTab?.(compareDescriptor) || null;
    },
    suppressFolderWatcher: function(milliseconds) {
      app.modules?.folderWatcher?.suppress?.(milliseconds);
    },
    debugLog: appDebugLog,
    reloadOpenFolderTree,
    normalizeEditorContent,
    setActiveEditorContent: function(content) {
      if (activeEditorCommands?.setActiveEditorValue) {
        activeEditorCommands.setActiveEditorValue(content);
      } else {
        markdownEditor.value = content;
      }
    },
    renderEditorSyntaxHighlights,
    updateEditorLineNumbers,
    renderMarkdown,
    saveTabsToStorage,
    renderTabBar,
    destroyTabView: function(tabId) {
      tabViewManager?.destroyTabView?.(tabId);
    },
    closeTab: function(tabId, options) {
      return closeTab?.(tabId, options);
    },
    updateSaveCurrentFileButtons,
    alert: function(message) { window.alert(message); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const gitAiCommitSummary = window.registerMarkdownViewerGitAiCommitSummary?.(app, {
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    isDesktopRuntime: function() { return isNeutralinoRuntime(); },
    getAiCompanionSettings: function() { return getAiCompanionSettings(); },
    get aiBridge() { return neutralinoAiBridge; },
    workspaceGit,
    debugLog: appDebugLog
  });
  const backgroundProcesses = window.registerMarkdownViewerBackgroundProcesses?.(app, {
    loadGlobalState,
    saveGlobalState,
    shouldConfirmCancel: shouldConfirmCancelBackgroundProcess,
    confirm: function(options) {
      return app.services?.confirm ? app.services.confirm(options) : Promise.resolve(false);
    },
    notifyError: function(error, entry) {
      return app.services?.notify?.show?.({
        title: "Background process could not be cancelled",
        message: `${entry?.description || "The background process"} is still running.\n\n${error?.message || String(error || "")}`,
        buttons: [{ id: "close", label: "Close", variant: "primary", autoFocus: true }]
      });
    }
  });
  const bottomPanelTabs = window.registerMarkdownViewerBottomPanelTabs?.(app, {
    loadGlobalState,
    saveGlobalState,
    setSidebarVisible,
    getAiCompanionPanel: function() { return app.modules?.aiCompanionPanel || null; }
  });
  if (typeof window.registerMarkdownViewerProjectProblemsBroker === "function") {
    projectProblemsBroker = window.registerMarkdownViewerProjectProblemsBroker(app, {
      diagnosticLifecycleTrace,
      getMaximumProblems: getJdtMaximumProblems,
      getWorkspaceRoot: function() { return activeFolderPath || ""; },
      onProviderInvalidated: function(providerId) { analysisGenerationCoordinator?.invalidateProvider?.(providerId); },
      isGenerationCurrent: function(generationId, workspaceRoot) {
        const generation = analysisGenerationCoordinator?.getState?.();
        return generation?.generationId === Number(generationId)
          && normalizeLocalPath(generation?.workspaceRoot || "").toLowerCase() === normalizeLocalPath(workspaceRoot || "").toLowerCase();
      }
    });
  }
  const projectTaskStore = window.registerMarkdownViewerProjectTaskStore?.(app, {
    isDesktopRuntime: isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const jdtTaskSource = window.registerMarkdownViewerJdtTaskSource?.(app, {
    taskStore: projectTaskStore,
    projectProblemsBroker,
    diagnosticLifecycleTrace,
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    getJdtTasks: function(options) { return jdtProxyClient?.getTasks?.(options); }
  });
  void projectTaskStore?.openProject?.(activeFolderPath || "");
  kotlinWorkspaceCoordinator?.setProblemsBroker?.(projectProblemsBroker);
  const problemsPanel = window.registerMarkdownViewerProblemsPanel?.(app, {
    bottomPanel: bottomPanelTabs,
    getJdtProblems: function(options) { return projectProblemsBroker?.getProblems?.(options) || jdtProxyClient?.getProblems?.(options); },
    requestProblemsRefresh: function() {
      const generation = analysisGenerationCoordinator?.getState?.();
      analysisGenerationCoordinator?.beginGeneration?.({
        workspaceRoot: activeFolderPath || "",
        reason: "manual-problems-refresh",
        requirements: generation?.requirements,
        jdtReady: ["classpath-ready", "ready"].includes(javaWorkspaceController?.getState?.()?.phase),
        kotlinReady: generation?.providers?.kotlin?.ready === true,
        kotlinAbiReady: generation?.providers?.kotlin?.abiReady === true
      });
      return Promise.resolve();
    },
    getInitialJdtProblemLimit: getJdtInitialProblemLimit,
    subscribeJdtDiagnosticSummary: function(listener) { return projectProblemsBroker?.subscribe?.(listener) || jdtProxyClient?.subscribeDiagnosticSummary?.(listener); },
    getActiveProjectPath: function() { return activeFolderPath || ""; },
    isJdtAnalysisReady: function() {
      return ["idle", "committed", "incomplete"].includes(analysisGenerationCoordinator?.getState?.()?.status);
    },
    isDesktopRuntime: isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    getRebuildOutput: async function(projectPath) {
      return await app.modules?.javaRebuildOutput?.read?.(projectPath);
    },
    parseRebuildDiagnostics: function(output, options) {
      const mavenDiagnostics = app.modules?.mavenDiagnostics?.parseDiagnostics?.(output, options) || [];
      const javacDiagnostics = app.modules?.javaCompiler?.parseJavacDiagnostics?.(output) || [];
      return [...mavenDiagnostics, ...javacDiagnostics];
    },
    alert: function(message) { window.alert(message); },
    retryAnalysis: async function(failure) {
      const code = String(failure?.code || "");
      if (/kotlin|analysis-generation-stalled|analysis-generation-timeout/.test(code)) {
        const retried = await kotlinWorkspaceCoordinator?.retryAbiReconciliation?.();
        if (retried) return true;
      }
      return retryJavaWorkspaceFromSettings();
    },
    openDebugLog: function() { return openDebugLogInAppFromSettings(); },
    openJavaBuildPath: function() { return openJavaBuildPathForRuntime(); },
    createJdtScopeMismatchNotification: function(state) { return jdtScopeMismatchNotification?.create?.(state); },
    canOpenQuickFix: function(diagnostic) {
      return app.modules?.quickFixController?.canOpenForDiagnostic?.(diagnostic) === true;
    },
    openQuickFix: function(diagnostic) {
      return app.modules?.quickFixController?.openForDiagnostic?.(diagnostic);
    },
    openDiagnostic: async function(diagnostic) {
      await openDocumentSourceFile({
        name: getFileName(diagnostic.filePath),
        path: diagnostic.filePath,
        sourceFilePath: diagnostic.filePath
      });
      const diagnosticOffset = getEditorOffsetForLineNumber(diagnostic.line) + Math.max(0, diagnostic.column - 1);
      const wordRange = activeEditorCommands.getActiveEditorWordRangeNearOffset?.(diagnosticOffset)
        || { start: diagnosticOffset, end: diagnosticOffset + 1 };
      selectEditorTextRange(wordRange.start, wordRange.end);
    }
  });
  const tasksPanel = window.registerMarkdownViewerTasksPanel?.(app, {
    bottomPanel: bottomPanelTabs,
    taskStore: projectTaskStore,
    taskSource: jdtTaskSource,
    alert: function(message) { window.alert(message); },
    openTaskLocation: async function(task) {
      const relativePath = String(task?.location?.path || "").replace(/^[/\\]+/, "");
      if (!relativePath || !activeFolderPath) return;
      const filePath = normalizeLocalPath(`${activeFolderPath}/${relativePath}`);
      await openDocumentSourceFile({ name: getFileName(filePath), path: filePath, sourceFilePath: filePath });
      const markerStart = task.range?.start
        ? getEditorOffsetForLspPosition(task.range.start)
        : getEditorOffsetForLineNumber(task.location.line) + Math.max(0, Number(task.location.column) - 1);
      const markerEnd = task.range?.end
        ? getEditorOffsetForLspPosition(task.range.end)
        : markerStart + 1;
      selectEditorTextRange(markerStart, Math.max(markerStart + 1, markerEnd));
    }
  });
  const backgroundProcessesPanel = window.registerMarkdownViewerBackgroundProcessesPanel?.(app, {
    bottomPanel: bottomPanelTabs,
    store: backgroundProcesses,
    statusTip: statusTipElement
  });

  if (typeof window.registerMarkdownViewerEclipsePreferencesDetection === "function"
    && typeof window.registerMarkdownViewerEclipsePreferencesController === "function") {
    const eclipsePreferencesDetection = window.registerMarkdownViewerEclipsePreferencesDetection(app, {});

    eclipsePreferencesController = window.registerMarkdownViewerEclipsePreferencesController(app, {
      detection: eclipsePreferencesDetection,
      problemsPanel,
      jdtClient: jdtProxyClient,
      getJavaState: function() { return javaWorkspaceController?.getState?.() || null; },
      getJdtSession: function(workspaceRoot) { return jdtProxyClient?.getSession?.(`java:${normalizeLocalPath(workspaceRoot)}`) || null; },
      requestJdtWorkspaceBuild: function(session) {
        return kotlinAdapterClient?.requestJdtWorkspaceBuild?.({ transport: session.transport });
      },
      showNotification: function(options) { return app.services?.notify?.show?.(options); },
      refreshEclipseAnalysisScope: function(workspaceRoot) {
        return app.modules?.javaBuildPath?.refreshEclipseAnalysisScope?.(workspaceRoot);
      },
      restartJavaAnalysis: function(workspaceRoot) {
        return restartJavaWorkspaceAfterProjectJdkChange(workspaceRoot, { traceReason: "eclipse-analysis-scope-refresh" });
      },
      scheduleProblemsRefresh: function() { projectProblemsBroker?.scheduleRefresh?.(); },
      getStatusManager: function() { return app.modules?.statusManager || null; }
    });
  }
  if (typeof window.registerMarkdownViewerJavaAnalysisProblems === "function") {
    javaAnalysisProblems = window.registerMarkdownViewerJavaAnalysisProblems(app, {
      problemsPanel,
      getWorkspacePath: function() { return activeFolderPath || ""; }
    });
    javaWorkspaceController?.subscribe?.((state) => {
      eclipsePreferencesController?.onJavaStateChanged?.(state);
      javaAnalysisProblems?.syncWorkspaceState?.(state);
      if (state?.phase === "closed" || state?.model?.hasAspectjContent === false) aspectjAnalysisProblems?.clear?.();
      if (state?.phase === "closed") javaAnalysisFailureWorkspaceId = "";
    });
    const currentJavaWorkspaceState = javaWorkspaceController?.getState?.();
    javaAnalysisProblems.syncWorkspaceState(currentJavaWorkspaceState);
  }
  analysisGenerationCoordinator?.subscribe?.((state) => {
    problemsPanel?.setAnalysisGenerationState?.(state);
    jdtTaskSource?.onAnalysisGenerationState?.(state);
    tasksPanel?.setAnalysisGenerationState?.(state);
    problemsPanel?.setJdtAnalysisReady?.(["idle", "committed", "incomplete"].includes(state.status), {
      discardPending: state.status === "idle"
    });
  });
  if (typeof window.registerMarkdownViewerAspectjAnalysisProblems === "function") {
    aspectjAnalysisProblems = window.registerMarkdownViewerAspectjAnalysisProblems(app, {
      problemsPanel,
      getWorkspacePath: function() { return activeFolderPath || ""; }
    });
  }
  const quickFixDiagnosticStore = window.registerMarkdownViewerQuickFixDiagnosticStore?.(app, {
    bridge: neutralinoLspBridge,
    registry: lspServerRegistry,
    problemsPanel
  });
  const javaQuickFixProvider = window.registerMarkdownViewerJavaQuickFixProvider?.(app, {
    requestClient: lspRequestClient,
    diagnosticStore: quickFixDiagnosticStore,
    openDiagnostic: async function(diagnostic) {
      await openDocumentSourceFile({
        name: getFileName(diagnostic.filePath),
        path: diagnostic.filePath,
        sourceFilePath: diagnostic.filePath
      });
    },
    getDocumentContext: async function() {
      const editor = editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null;
      let context = editor?.getLspDocumentContext?.() || null;
      if (!context?.transport && typeof editor?.refreshLspDocumentContext === "function") {
        context = await editor.refreshLspDocumentContext();
      }
      return context;
    }
  });
  const mavenProblemExplainer = window.registerMarkdownViewerMavenProblemExplainer?.(app);
  const localQuickFixProvider = window.registerMarkdownViewerLocalQuickFixProvider?.(app, {
    mavenProblemExplainer,
    getProblemContext: async function(diagnostic) {
      await openDocumentSourceFile({
        name: getFileName(diagnostic.filePath),
        path: diagnostic.filePath,
        sourceFilePath: diagnostic.filePath
      });
      return { sourceContent: activeEditorCommands.getActiveEditorValue() };
    }
  });
  const javaAnalysisQuickFixProvider = window.registerMarkdownViewerJavaAnalysisQuickFixProvider?.(app, {
    retryProjectAnalysis: function() { return retryJavaWorkspaceFromSettings(); },
    showJdtLog: function() { return showActiveJdtLogFromSettings(); },
    openJdkSettings: function() { return openJdkSettingsFromJavaProject(); },
    openJavaBuildPath: function() { return openJavaBuildPathForRuntime(); }
  });
  const workspaceEditPreview = window.registerMarkdownViewerWorkspaceEditPreview?.(app, {
    registry: lspServerRegistry,
    tabs: tabsModule,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    openDocument: async function(path) {
      return openDocumentSourceFile({ name: getFileName(path), path, sourceFilePath: path });
    },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const quickFixDialog = window.registerMarkdownViewerQuickFixDialog?.(app);
  window.registerMarkdownViewerQuickFixController?.(app, {
    javaProvider: javaQuickFixProvider,
    javaAnalysisProvider: javaAnalysisQuickFixProvider,
    localProvider: localQuickFixProvider,
    diagnosticStore: quickFixDiagnosticStore,
    workspaceEditPreview,
    javaAnalysisRefresh,
    dialog: quickFixDialog,
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    getAiSettings: function() { return getAiCompanionSettings(); },
    getAiCompanion: function() { return app.modules?.aiCompanionPanel || null; },
    getRatManager: function() { return app.modules?.ratManager || null; },
    mavenProblemExplainer,
    getProblemContext: async function(diagnostic) {
      await openDocumentSourceFile({
        name: getFileName(diagnostic.filePath),
        path: diagnostic.filePath,
        sourceFilePath: diagnostic.filePath
      });
      const sourceContent = activeEditorCommands.getActiveEditorValue();
      const lines = String(sourceContent || "").split(/\r?\n/);
      const start = diagnostic.range?.start || { line: Math.max(0, Number(diagnostic.line || 1) - 1), character: Math.max(0, Number(diagnostic.column || 1) - 1) };
      const end = diagnostic.range?.end || start;
      const selectedLines = lines.slice(start.line, end.line + 1);
      if (selectedLines.length) {
        selectedLines[0] = selectedLines[0].slice(start.character);
        selectedLines[selectedLines.length - 1] = selectedLines[selectedLines.length - 1].slice(0, end.character);
      }
      return { sourceContent, selectedSource: selectedLines.join("\n") };
    },
    getJavaProjectProvider: function() { return app.modules?.javaProjectProvider || null; },
    mavenProblemExplainer,
    openExternalWebSearch: function(query) {
      const url = `https://www.google.com/search?q=${encodeURIComponent(String(query || "Maven build error"))}`;
      return openExternalWebLink(url);
    },
  });
  const projectCommands = window.registerMarkdownViewerProjectCommandMenu?.(app, {
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    getActiveFilePath: getActiveEditorPathForLanguage,
    problemsPanel,
    tasksPanel,
    get javaRebuildOutput() { return app.modules?.javaRebuildOutput; },
    getRatManager: function() { return app.modules?.ratManager || null; },
    getRatPolicyManager: function() { return app.modules?.ratPolicyManager || null; },
    alert: function(message) { window.alert(message); }
  });
  if (typeof window.registerMarkdownViewerStructuredExecutionActions === "function") {
    structuredExecutionActions = window.registerMarkdownViewerStructuredExecutionActions(app, { projectCommands });
  }
  const terminalContextMenu = window.registerMarkdownViewerTerminalContextMenu?.(app, {
    openOutputInNewTab: function(content, title) {
      const outputTitle = title || "Terminal Output";
      return tabsModule?.openLargeFileInTab?.({
        name: `${outputTitle}.txt`,
        content: String(content || ""),
        largeFileReason: "terminal-output"
      }, outputTitle, { temporary: false }) || null;
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const desktopTerminal = window.registerMarkdownViewerDesktopTerminal?.(app, {
    bottomPanel: bottomPanelTabs,
    contextMenu: terminalContextMenu,
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    isNeutralinoRuntime,
    closeActionMenus: closeOpenActionMenus,
    debugLog: appDebugLog,
    closeMobileMenu: function() { return closeMobileMenu?.(); },
    loadGlobalState: function() { return loadGlobalState(); },
    saveGlobalState: function(patch) { return saveGlobalState(patch); },
    alert: function(message) { window.alert(message); },
    processRouter: spawnedProcessRouter,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const gradleProjectDetection = window.registerMarkdownViewerGradleProjectDetection?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const mavenBuildOptionsCatalog = window.registerMarkdownViewerMavenBuildOptionsCatalog?.(app);
  const mavenBuildOptionsAdvancedArguments = window.registerMarkdownViewerMavenBuildOptionsAdvancedArguments?.(app);
  const mavenBuildOptionsSession = window.registerMarkdownViewerMavenBuildOptionsSession?.(app, {
    advancedArguments: mavenBuildOptionsAdvancedArguments
  });
  const mavenBuildOptionsPanel = window.registerMarkdownViewerMavenBuildOptionsPanel?.(app, {
    get notify() { return app.services?.notify; }
  });
  const mavenPluginInspector = window.registerMarkdownViewerMavenPluginInspector?.(app, { Neutralino });
  const mavenEffectivePomParser = window.registerMarkdownViewerMavenEffectivePomParser?.(app);
  const mavenCompilerWarningBuildOptionsProvider = window.registerMarkdownViewerMavenCompilerWarningBuildOptionsProvider?.(app);
  const mavenPluginAwareBuildOptionsProvider = window.registerMarkdownViewerMavenPluginAwareBuildOptionsProvider?.(app);
  const mavenBuildOptions = window.registerMarkdownViewerMavenBuildOptions?.(app, {
    catalog: mavenBuildOptionsCatalog,
    sessionFactory: mavenBuildOptionsSession,
    panel: mavenBuildOptionsPanel,
    pluginInspector: mavenPluginInspector,
    effectivePomParser: mavenEffectivePomParser,
    compilerWarningProvider: mavenCompilerWarningBuildOptionsProvider,
    pluginAwareProvider: mavenPluginAwareBuildOptionsProvider
  });
  const mavenBuildCommand = window.registerMarkdownViewerMavenBuildCommand?.(app);
  const gradleBuildCommand = window.registerMarkdownViewerGradleBuildCommand?.(app);
  const spotlessMavenDiagnosticsParser = window.registerMarkdownViewerSpotlessMavenDiagnosticsParser?.(app);
  const mavenCompilerDiagnosticsParser = window.registerMarkdownViewerMavenCompilerDiagnosticsParser?.(app);
  const mavenDependencyResolutionParser = window.registerMarkdownViewerMavenDependencyResolutionParser?.(app);
  const mavenMultilineDiagnosticsParser = window.registerMarkdownViewerMavenMultilineDiagnosticsParser?.(app);
  const mavenProjectFailureParser = window.registerMarkdownViewerMavenProjectFailureParser?.(app);
  const mavenDiagnostics = window.registerMarkdownViewerMavenDiagnostics?.(app, {
    parsers: [
      spotlessMavenDiagnosticsParser,
      mavenCompilerDiagnosticsParser,
      mavenDependencyResolutionParser,
      mavenMultilineDiagnosticsParser,
      mavenProjectFailureParser
    ].filter(Boolean)
  });
  const gradleCompilerDiagnosticsParser = window.registerMarkdownViewerGradleCompilerDiagnosticsParser?.(app);
  const gradleBuildScriptDiagnosticsParser = window.registerMarkdownViewerGradleBuildScriptDiagnosticsParser?.(app);
  const gradleProjectFailureParser = window.registerMarkdownViewerGradleProjectFailureParser?.(app);
  const gradleDiagnostics = window.registerMarkdownViewerGradleDiagnostics?.(app, {
    parsers: [gradleCompilerDiagnosticsParser, gradleBuildScriptDiagnosticsParser, gradleProjectFailureParser]
  });
  const ratFindingParser = window.registerMarkdownViewerRatFindingParser?.(app);
  const ratConfigurationReader = window.registerMarkdownViewerRatConfigurationReader?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratProjectContext = window.registerMarkdownViewerRatProjectContext?.(app, {
    findingParser: ratFindingParser,
    configurationReader: ratConfigurationReader,
    mavenDetection: mavenProjectDetection,
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratFileInspector = window.registerMarkdownViewerRatFileInspector?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratProvenanceAnalyzer = window.registerMarkdownViewerRatProvenanceAnalyzer?.(app, {
    runGitAction: async function(_projectPath, action) {
      return workspaceGit?.runGitPanelAction?.(action);
    }
  });
  const ratPatternImpact = window.registerMarkdownViewerRatPatternImpact?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratActionCatalog = window.registerMarkdownViewerRatActionCatalog?.(app);
  const ratXmlEditPlanner = window.registerMarkdownViewerRatXmlEditPlanner?.(app);
  const ratChangePlanner = window.registerMarkdownViewerRatChangePlanner?.(app, {
    tabs: tabsModule,
    xmlEditPlanner: ratXmlEditPlanner,
    patternImpact: ratPatternImpact,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratChangeSet = window.registerMarkdownViewerRatChangeSet?.(app, {
    tabs: tabsModule,
    confirmDelete: function(message) { return window.confirm(message); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const ratCommandBuilder = window.registerMarkdownViewerRatCommandBuilder?.(app);
  const ratRunner = window.registerMarkdownViewerRatRunner?.(app, {
    findingParser: ratFindingParser,
    commandBuilder: ratCommandBuilder,
    terminal: desktopTerminal
  });
  const ratHelpContent = window.registerMarkdownViewerRatHelpContent?.(app);
  const ratDialog = window.registerMarkdownViewerRatDialog?.(app, { helpContent: ratHelpContent });
  window.registerMarkdownViewerRatManager?.(app, {
    findingParser: ratFindingParser,
    projectContext: ratProjectContext,
    fileInspector: ratFileInspector,
    provenanceAnalyzer: ratProvenanceAnalyzer,
    actionCatalog: ratActionCatalog,
    changePlanner: ratChangePlanner,
    changeSet: ratChangeSet,
    commandBuilder: ratCommandBuilder,
    runner: ratRunner,
    terminal: desktopTerminal,
    dialog: ratDialog,
    tabs: tabsModule,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    openDocument: async function(path) {
      return openDocumentSourceFile({ name: getFileName(path), path, sourceFilePath: path });
    },
    openExternal: async function(path) {
      if (!isNeutralinoRuntime() || !Neutralino?.os?.open) throw new Error("External file opening is unavailable.");
      await Neutralino.os.open(path);
    }
  });
  window.registerMarkdownViewerRatPolicyFeature?.(app, {
    projectContext: ratProjectContext,
    configurationReader: ratConfigurationReader,
    xmlEditPlanner: ratXmlEditPlanner,
    changeSet: ratChangeSet,
    runner: ratRunner,
    tabs: tabsModule,
    fetch: window.fetch.bind(window),
    confirm: function(options) {
      return app.services?.confirm ? app.services.confirm(options) : Promise.resolve(false);
    },
    getWorkspaceRoot: function() { return activeFolderPath || ""; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const mavenSourceFolders = window.registerMarkdownViewerMavenSourceFolders?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaBuildPathSaveConfirmation = window.registerMarkdownViewerJavaBuildPathSaveConfirmation?.(app, {
    notify: app.services?.notify,
    shouldConfirm: shouldConfirmJavaBuildPathRebuild,
    rebuildProject: function(projectPath, options) {
      return javaProjectProvider?.rebuildProject?.({ folderPath: projectPath }, Object.assign({ useLastOptions: true }, options));
    },
    runAnalyzers: function(projectPath) {
      return restartJavaWorkspaceAfterProjectJdkChange(projectPath, { traceReason: "java-build-path-rebuild" });
    }
  });
  const javaBuildPath = window.registerMarkdownViewerJavaBuildPath?.(app, {
    jdkRegistry,
    get eclipsePreferences() { return eclipsePreferencesController; },
    mavenDetection: mavenProjectDetection,
    mavenSourceFolders,
    gradleDetection: gradleProjectDetection,
    getGradleLauncherSettings: getGradleProjectLauncherSettings,
    getGradleInstallations: getJavaConverterGradleInstallations,
    getSelectedGradleInstallationId,
    javaWorkspaceModel,
    javaAnalysisInventory,
    eclipseAnalysisScopePolicy,
    confirmEclipseAnalysisScope: async function(plan) {
      const decision = await app.services?.notify?.show?.({
        title: "Update Java Analysis Scope?",
        message: `Applying the Eclipse preferences found ${plan.moduleCount} Eclipse projects. Replace your customized Java Analysis module selection with those projects?`,
        dismissValue: "keep",
        buttons: [
          { id: "keep", label: "Keep Current Selection", value: "keep", variant: "cancel" },
          { id: "update", label: "Use Eclipse Projects", value: "update", variant: "primary", autoFocus: true }
        ]
      });
      return decision === "update";
    },
    onConfigurationSaved: function(projectPath, configuration, options) {
      return javaBuildPathSaveConfirmation?.confirmAfterSave?.(projectPath, configuration, options);
    },
    openJdkSettings: function() {
      openJdkSettingsFromJavaProject();
    },
    openGradleSettings: function() {
      openGradleSettingsFromJavaProject();
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const newProjectDialog = window.registerMarkdownViewerNewProject?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    jdkRegistry,
    getGradleInstallations: getJavaConverterGradleInstallations,
    getDefaultParentDirectory: async function() {
      if (activeFolderPath) return activeFolderPath;
      try {
        const documentsPath = typeof Neutralino !== "undefined" ? await Neutralino.os?.getPath?.("documents") : "";
        if (documentsPath) return documentsPath;
      } catch (error) {
        console.warn("Unable to resolve the Documents directory for New Project:", error);
      }
      return normalizeLocalPath(getNeutralinoGlobalValue("NL_CWD"));
    },
    onCreated: async function(result, specification) {
      if (specification?.language === "java") await clearGeneratedJdtWorkspace(result.projectPath);
      await fileOpen.openFolderTreeFromNeutralinoPath(result.projectPath);
      await fileOpen.openMarkdownSourceFile({
        name: "README.md",
        path: joinPath(result.projectPath, "README.md")
      });
    }
  });
  const mavenBuildPathAutoScan = window.registerMarkdownViewerMavenBuildPathAutoScan?.(app, {
    javaBuildPath,
    mavenDetection: mavenProjectDetection,
    mavenSourceFolders,
    appDebugLog,
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const javaCompiler = window.registerMarkdownViewerJavaCompiler?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const javaRebuildDialog = window.registerMarkdownViewerJavaRebuildDialog?.(app, {
    compiler: javaCompiler,
    mavenCommand: mavenBuildCommand,
    gradleCommand: gradleBuildCommand,
    mavenBuildOptions,
    effectivePomParser: mavenEffectivePomParser,
    terminal: desktopTerminal,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaCleanDialog = window.registerMarkdownViewerJavaCleanDialog?.(app);

  const javaCompileTargets = window.registerMarkdownViewerJavaCompileTargets?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaBuildState = window.registerMarkdownViewerJavaBuildState?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaClassAnalysis = window.registerMarkdownViewerJavaClassAnalysis?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaCompileSaveDialog = window.registerMarkdownViewerJavaCompileSaveDialog?.(app);

  function getJavaTabPath(tab) {
    return String(tab?.sourceFilePath || tab?.sourceFileName || "").replace(/\\/g, "/");
  }

  function getDirtyProjectJavaTabs(projectPath) {
    tabsModule?.saveCurrentTabState?.();
    const root = String(projectPath || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return (tabsModule?.getUnsavedTabs?.() || []).filter((tab) => {
      const path = getJavaTabPath(tab);
      const normalized = path.toLowerCase();
      return /\.java$/i.test(path) && (normalized === root || normalized.startsWith(root + "/"));
    });
  }

  async function saveCurrentJavaFileForCompile() {
    await tabsModule?.saveCurrentFileIfChanged?.();
    return tabsModule?.activeTabHasUnsavedChanges?.() !== true;
  }

  async function saveAllProjectJavaFilesForCompile(projectPath) {
    tabsModule?.saveCurrentTabState?.();
    const activeTab = tabsModule?.getActiveTab?.();
    try {
      for (const tab of getDirtyProjectJavaTabs(projectPath)) {
        if (!await tabsModule?.saveChangedTab?.(tab, { activateSaveDialog: true })) return false;
      }
      return getDirtyProjectJavaTabs(projectPath).length === 0;
    } finally {
      if (activeTab?.id) tabsModule?.switchTab?.(activeTab.id);
    }
  }

  const javaRebuildOutput = window.registerMarkdownViewerJavaRebuildOutput?.(app, {
    terminal: desktopTerminal,
    getActiveProjectPath: function() { return activeFolderPath || ""; },
    isDesktopRuntime: isNeutralinoRuntime,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javadocSettings = window.registerMarkdownViewerJavadocSettings?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javadocSourceSelection = window.registerMarkdownViewerJavadocSourceSelection?.(app);
  const javadocCommand = window.registerMarkdownViewerJavadocCommand?.(app, {
    compiler: javaCompiler,
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const javadocRunner = window.registerMarkdownViewerJavadocRunner?.(app, {
    terminal: desktopTerminal,
    confirm: function(options) {
      return app.services?.confirm ? app.services.confirm(options) : Promise.resolve(window.confirm(options?.message || "Replace generated Javadoc output?"));
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javadocWizard = window.registerMarkdownViewerJavadocWizard?.(app, {
    sourceSelection: javadocSourceSelection,
    mavenBuildOptions,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaProjectProvider = window.registerMarkdownViewerJavaProjectProvider?.(app, {
    buildPath: javaBuildPath,
    compileTargets: javaCompileTargets,
    buildState: javaBuildState,
    classAnalysis: javaClassAnalysis,
    compileSaveDialog: javaCompileSaveDialog,
    compiler: javaCompiler,
    mavenCommand: mavenBuildCommand,
    mavenBuildOptions,
    mavenDetection: mavenProjectDetection,
    mavenDiagnostics,
    gradleCommand: gradleBuildCommand,
    gradleDetection: gradleProjectDetection,
    gradleDiagnostics,
    getGradleLauncherSettings: getGradleProjectLauncherSettings,
    javadocSettings,
    javadocSourceSelection,
    javadocCommand,
    javadocRunner,
    javadocWizard,
    projectRuntime: javaProjectRuntime,
    getWorkspaceRuntime: function() { return javaWorkspaceController?.getRuntime?.(); },
    getWorkspaceModel: function() { return javaWorkspaceController?.getModel?.(); },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; },
    rebuildDialog: javaRebuildDialog,
    cleanDialog: javaCleanDialog,
    projectCommands,
    terminal: desktopTerminal,
    rebuildOutput: javaRebuildOutput,
    problemsPanel,
    isDesktopRuntime: isNeutralinoRuntime,
    getDirtyJavaTabs: getDirtyProjectJavaTabs,
    saveCurrentJavaFile: saveCurrentJavaFileForCompile,
    saveAllProjectJavaFiles: saveAllProjectJavaFilesForCompile,
    alert: function(message) { window.alert(message); },
    onGradleBuildStarted: function(result) {
      if (normalizeLocalPath(result?.projectPath).toLowerCase() !== normalizeLocalPath(activeFolderPath).toLowerCase()) return null;
      const workspaceState = javaWorkspaceController?.getState?.();
      const analysisWasInProgress = javaAnalysisProblems?.isWorkspaceAnalysisInProgress?.(workspaceState) === true;
      if (analysisWasInProgress) problemsPanel?.setJdtDiagnosticsSuspended?.(true, { discardPending: true });
      return { analysisWasInProgress, phase: String(workspaceState?.phase || "") };
    },
    onGradleBuildFinished: function(result) {
      if (normalizeLocalPath(result?.projectPath).toLowerCase() !== normalizeLocalPath(activeFolderPath).toLowerCase()) return false;
      const analysisWasInProgress = result?.lifecycle?.analysisWasInProgress === true;
      if (!result?.succeeded) {
        if (analysisWasInProgress) problemsPanel?.setJdtDiagnosticsSuspended?.(false);
        return false;
      }
      const analysisProblem = javaAnalysisProblems?.getCurrent?.();
      const recoverableFailure = analysisProblem
        && javaAnalysisProblems.isBuildRecoverable(analysisProblem.failure, "gradle");
      if (!analysisWasInProgress && !recoverableFailure) return false;
      if (recoverableFailure && !javaAnalysisProblems.markAutomaticRetryStarted(analysisProblem.diagnostic?.fingerprint)) {
        if (analysisWasInProgress) problemsPanel?.setJdtDiagnosticsSuspended?.(false);
        return false;
      }
      window.setTimeout(() => void retryJavaWorkspaceFromSettings({ manageSettingsState: false }), 0);
      return true;
    },
    onSuccessfulRebuild: function(result) {
      const buildSystem = String(result?.buildSystem || "").toLowerCase();
      if (buildSystem === "gradle") return false;
      if (buildSystem === "maven"
          && normalizeLocalPath(result?.projectPath).toLowerCase() === normalizeLocalPath(activeFolderPath).toLowerCase()) {
        return javaAnalysisRefresh?.reanalyze?.({ reason: "maven-rebuild-succeeded" }).catch(async (error) => {
          await appDebugLog("error", "[lsp] JDT reanalysis after Maven rebuild failed", { message: error?.message || String(error) });
          return false;
        });
      }
      const analysisProblem = javaAnalysisProblems?.getCurrent?.();
      if (!analysisProblem || normalizeLocalPath(result?.projectPath).toLowerCase() !== normalizeLocalPath(activeFolderPath).toLowerCase()) return false;
      if (!javaAnalysisProblems.isBuildRecoverable(analysisProblem.failure, result?.buildSystem)) return false;
      if (!javaAnalysisProblems.markAutomaticRetryStarted(analysisProblem.diagnostic?.fingerprint)) return false;
      window.setTimeout(() => void retryJavaWorkspaceFromSettings({ manageSettingsState: false }), 0);
      return true;
    },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const runConfigurationStore = window.registerMarkdownViewerRunConfigurationStore?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const runConfigurationValidation = window.registerMarkdownViewerRunConfigurationValidation?.(app, {
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const runCommandBuilder = window.registerMarkdownViewerRunCommandBuilder?.(app, {
    mavenCommand: mavenBuildCommand,
    gradleCommand: gradleBuildCommand,
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const runOutput = window.registerMarkdownViewerRunOutput?.(app, {
    terminal: desktopTerminal,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  const javaRuntimeClasspath = window.registerMarkdownViewerJavaRuntimeClasspath?.(app, {
    buildPath: javaBuildPath,
    compiler: javaCompiler,
    mavenDetection: mavenProjectDetection,
    gradleDetection: gradleProjectDetection,
    projectRuntime: javaProjectRuntime,
    getGradleLauncherSettings: getGradleProjectLauncherSettings,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const runBuildBeforeLaunch = window.registerMarkdownViewerRunBuildBeforeLaunch?.(app, {
    compiler: javaCompiler,
    projectProvider: javaProjectProvider,
    mavenCommand: mavenBuildCommand,
    gradleCommand: gradleBuildCommand,
    projectRuntime: javaProjectRuntime,
    terminal: desktopTerminal,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; }
  });
  const runConfigurationEditor = window.registerMarkdownViewerRunConfigurationEditor?.(app);
  const runLauncher = window.registerMarkdownViewerRunLauncher?.(app, {
    store: runConfigurationStore,
    validation: runConfigurationValidation,
    buildPath: javaBuildPath,
    compiler: javaCompiler,
    mainClassFinder: javaMainClassFinder,
    projectRuntime: javaProjectRuntime,
    mavenDetection: mavenProjectDetection,
    gradleDetection: gradleProjectDetection,
    getGradleLauncherSettings: getGradleProjectLauncherSettings,
    commandBuilder: runCommandBuilder,
    runtimeClasspath: javaRuntimeClasspath,
    buildBeforeLaunch: runBuildBeforeLaunch,
    terminal: desktopTerminal,
    backgroundProcesses,
    output: runOutput,
    getProjectPath: function() { return activeFolderPath || ""; },
    get osName() { return typeof NL_OS !== "undefined" ? NL_OS : "Windows"; },
    alert: function(message) { window.alert(message); }
  });
  const runConfigurationDialog = window.registerMarkdownViewerRunConfigurationDialog?.(app, {
    store: runConfigurationStore,
    editor: runConfigurationEditor,
    launcher: runLauncher,
    buildPath: javaBuildPath,
    compiler: javaCompiler,
    mainClassFinder: javaMainClassFinder,
    jdkRegistry,
    confirm: function(options) {
      return app.services?.confirm ? app.services.confirm(options) : Promise.resolve(false);
    }
  });
  window.registerMarkdownViewerRunCommandMenu?.(app, {
    store: runConfigurationStore,
    launcher: runLauncher,
    dialog: runConfigurationDialog,
    applicationMenu,
    closeActionMenus: closeOpenActionMenus,
    alert: function(message) { window.alert(message); }
  });
  window.registerMarkdownViewerRunEditorActions?.(app, {
    sourceActions,
    mainClassFinder: javaMainClassFinder,
    launcher: runLauncher,
    getProjectPath: function() { return activeFolderPath || ""; },
    alert: function(message) { window.alert(message); }
  });
  void runConfigurationStore?.loadProject?.(activeFolderPath || "");
  void runOutput?.restoreForProject?.(activeFolderPath || "");
  const findInFiles = window.registerMarkdownViewerFindInFiles(app, {
    loadGlobalState,
    saveGlobalState,
    openDocumentSourceFile,
    selectEditorTextRange,
    getFileName,
    isTextDocumentPath,
    isNeutralinoRuntime,
    bottomPanel: bottomPanelTabs,
    closeMobileMenu: function() { return closeMobileMenu?.(); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; }
  });
  const openFindInFilesModal = findInFiles.openFindInFilesModal;
  const toggleFindInFilesResultsPanel = findInFiles.toggleResultsPanel;
  const openFileByName = window.registerMarkdownViewerOpenFileByName(app, {
    isFolderOpen: function() { return isFolderOpen; },
    getCurrentFolderTreeNodes: function() { return currentFolderTreeNodes; },
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    readNeutralinoDirectoryChildren,
    getFileIconClass,
    getFileName,
    openDocumentSourceFile,
    closeMobileMenu: function() { return closeMobileMenu?.(); }
  });
  const openFileByNameModal = openFileByName.openFileByNameModal;

  const lineCounter = window.registerMarkdownViewerLineCounter?.(app, {
    buttons: lineCounterButtons,
    isFolderOpen: function() { return isFolderOpen; },
    getActiveFolderName: function() { return activeFolderName; },
    getActiveFolderPath: function() { return activeFolderPath || ""; },
    getCurrentFolderTreeNodes: function() { return currentFolderTreeNodes; },
    getFileName,
    joinPath,
    openDocumentSourceFile,
    loadGlobalState,
    saveGlobalState,
    openReportTab: function(content) {
      const tab = newTab(content, "Line Counter", { viewMode: "preview" });
      if (tab) {
        tab.generatedHtmlSave = { suggestedName: "line-counter.html", title: "Line Counter" };
        saveTabsToStorage(tabs);
      }
      return tab;
    },
    configElements: {
      modal: document.getElementById("line-counter-config-modal"),
      folderInput: document.getElementById("line-counter-config-folder"),
      excludedFoldersInput: document.getElementById("line-counter-config-excluded-folders"),
      excludedExtensionsInput: document.getElementById("line-counter-config-excluded-extensions"),
      topLimitInput: document.getElementById("line-counter-config-top-limit"),
      status: document.getElementById("line-counter-config-status"),
      countButton: document.getElementById("line-counter-config-count"),
      cancelButton: document.getElementById("line-counter-config-cancel"),
      resetButton: document.getElementById("line-counter-config-reset")
    },
    progressElements: {
      layer: document.getElementById("line-counter-progress-layer"),
      status: document.getElementById("line-counter-progress-status"),
      track: document.getElementById("line-counter-progress-track"),
      fill: document.getElementById("line-counter-progress-fill"),
      count: document.getElementById("line-counter-progress-count"),
      percent: document.getElementById("line-counter-progress-percent"),
      log: document.getElementById("line-counter-progress-log"),
      cancelButton: document.getElementById("line-counter-progress-cancel"),
      minimizeButton: document.getElementById("line-counter-progress-minimize"),
      pill: document.getElementById("line-counter-progress-pill"),
      pillStatus: document.getElementById("line-counter-progress-pill-status"),
      pillLabel: document.getElementById("line-counter-progress-pill-label")
    },
    closeMobileMenu: function() { return closeMobileMenu?.(); },
    alert: function(message) { window.alert(message); },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; }
  });
  function isSidebarDropzoneVisible() {
    if (sidebarLowerPanelTabs) return sidebarLowerPanelTabs.isEnabled("dropzone");
    return !!sidebarDropzonePanel && sidebarDropzonePanel.style.display !== "none";
  }

  function updateDropzoneToggleButtons() {
    const isVisible = isSidebarDropzoneVisible();
    const label = isVisible ? "Hide Dropzone Panel" : "Show Dropzone Panel";
    const title = `${label}`;

    toggleDropzonePanelButtons.forEach(function(button) {
      const labelElement = button.querySelector(".dropzone-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(!isVisible));
    });
  }

  function hideSidebarDropzone(shouldPersist = true) {
    if (sidebarLowerPanelTabs) {
      if (dropzone) dropzone.style.display = "none";
      sidebarLowerPanelTabs.setEnabled("dropzone", false, {
        activate: false,
        persist: shouldPersist,
        stateKey: "sidebarDropzoneVisible"
      });
      updateDropzoneToggleButtons();
      return;
    }
    if (dropzone) {
      dropzone.style.display = "none";
    }
    if (sidebarDropzonePanel) {
      if (sidebarDropzonePanel.style.flex && sidebarDropzonePanel.style.flex !== "0 0 0px") {
        sidebarDropzonePanel.dataset.previousFlex = sidebarDropzonePanel.style.flex;
      }
      sidebarDropzonePanel.style.display = "none";
      sidebarDropzonePanel.style.flex = "0 0 0px";
      sidebarDropzonePanel.style.padding = "0";
      sidebarDropzonePanel.style.minHeight = "0";
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "none";
      sidebarDropzoneResizer.style.flex = "0 0 0px";
    }
    if (shouldPersist) {
      saveGlobalState({ sidebarDropzoneVisible: false });
    }
    updateDropzoneToggleButtons();
  }

  function showSidebarDropzone(shouldPersist = true) {
    if (sidebarLowerPanelTabs) {
      if (dropzone) dropzone.style.display = "";
      sidebarLowerPanelTabs.setEnabled("dropzone", true, {
        activate: true,
        persist: shouldPersist,
        stateKey: "sidebarDropzoneVisible"
      });
      updateDropzoneToggleButtons();
      return;
    }
    if (dropzone) {
      dropzone.style.display = "";
    }
    if (sidebarDropzonePanel) {
      sidebarDropzonePanel.style.display = "";
      sidebarDropzonePanel.style.flex = sidebarDropzonePanel.dataset.previousFlex || "";
      sidebarDropzonePanel.style.padding = "";
      sidebarDropzonePanel.style.minHeight = "";
      applySidebarDropzoneHeight(loadGlobalState().sidebarDropzoneHeight, false);
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "";
      sidebarDropzoneResizer.style.flex = "";
    }
    if (shouldPersist) {
      saveGlobalState({ sidebarDropzoneVisible: true });
    }
    updateDropzoneToggleButtons();
  }

  function toggleSidebarDropzone() {
    if (isSidebarDropzoneVisible()) {
      hideSidebarDropzone();
    } else {
      showSidebarDropzone();
    }
  }

  function isSidebarVisible() {
    return !!folderTreePane && !contentContainer.classList.contains("sidebar-hidden");
  }

  function updateSidebarToggleButtons() {
    const isVisible = isSidebarVisible();
    const label = isVisible ? "Hide Sidebar" : "Show Sidebar";

    toggleSidebarButtons.forEach(function(button) {
      const labelElement = button.querySelector(".sidebar-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(!isVisible));
    });
  }

  function setSidebarVisible(isVisible, shouldPersist = true, shouldAnimate = shouldPersist) {
    if (!folderTreePane || !contentContainer) return;

    if (sidebarVisibilityAnimationTimer) {
      window.clearTimeout(sidebarVisibilityAnimationTimer);
      sidebarVisibilityAnimationTimer = null;
    }

    const shouldUseAnimation = shouldAnimate && !prefersReducedFolderTreeMotion();
    folderTreePane.hidden = false;

    if (isVisible) {
      if (shouldUseAnimation) {
        contentContainer.classList.add("sidebar-animating");
        window.requestAnimationFrame(() => {
          contentContainer.classList.remove("sidebar-hidden");
        });
        sidebarVisibilityAnimationTimer = window.setTimeout(() => {
          contentContainer.classList.remove("sidebar-animating");
          sidebarVisibilityAnimationTimer = null;
        }, SIDEBAR_VISIBILITY_ANIMATION_MS);
      } else {
        contentContainer.classList.remove("sidebar-hidden", "sidebar-animating");
      }
    } else if (shouldUseAnimation) {
      contentContainer.classList.add("sidebar-animating", "sidebar-hidden");
      sidebarVisibilityAnimationTimer = window.setTimeout(() => {
        contentContainer.classList.remove("sidebar-animating");
        sidebarVisibilityAnimationTimer = null;
      }, SIDEBAR_VISIBILITY_ANIMATION_MS);
    } else {
      contentContainer.classList.add("sidebar-hidden");
      contentContainer.classList.remove("sidebar-animating");
    }

    if (shouldPersist) {
      saveGlobalState({ sidebarVisible: isVisible });
    }

    if (appStatusLineElement) {
      appStatusLineElement.classList.toggle("sidebar-hidden", !isVisible);
    }

    updateSidebarToggleButtons();

    if (currentViewMode === 'split') {
      requestAnimationFrame(applyPaneWidths);
    }
  }

  function toggleSidebar() {
    setSidebarVisible(!isSidebarVisible());
  }

  function isStatusBarVisible() {
    return !!appStatusLineElement && appStatusLineElement.hidden !== true && !appStatusLineElement.classList.contains("status-bar-hidden");
  }

  function updateStatusBarToggleButtons() {
    const isVisible = isStatusBarVisible();
    const label = isVisible ? "Hide Status Bar" : "Show Status Bar";

    toggleStatusBarButtons.forEach(function(button) {
      const labelElement = button.querySelector(".status-bar-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(!isVisible));
    });
  }

  function setStatusBarVisible(isVisible, shouldPersist = true) {
    const nextVisible = isVisible !== false;
    if (appStatusLineElement) {
      appStatusLineElement.hidden = !nextVisible;
      appStatusLineElement.classList.toggle("status-bar-hidden", !nextVisible);
    }
    if (appContainer) {
      appContainer.classList.toggle("status-bar-hidden", !nextVisible);
    }
    if (shouldPersist) {
      saveGlobalState({ statusBarVisible: nextVisible });
    }
    updateStatusBarToggleButtons();
    scheduleEditorLineNumbersUpdate();
  }

  function toggleStatusBar() {
    setStatusBarVisible(!isStatusBarVisible());
  }

  const MAX_GITHUB_FILES_SHOWN = 30;
  const GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS = 800;
  let lastGitHubImportRequestAt = 0;
  const selectedGitHubImportPaths = new Set();
  let availableGitHubImportPaths = [];

  const githubImport = window.registerMarkdownViewerGitHubImport(app, {
    get lastGitHubImportRequestAt() { return lastGitHubImportRequestAt; },
    set lastGitHubImportRequestAt(value) { lastGitHubImportRequestAt = value; },
    get availableGitHubImportPaths() { return availableGitHubImportPaths; },
    set availableGitHubImportPaths(value) { availableGitHubImportPaths = value; },
    MAX_GITHUB_FILES_SHOWN,
    GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS,
    selectedGitHubImportPaths,
    githubImportSelectedCount,
    githubImportSelectAllBtn,
    githubImportTree,
    githubImportFileSelect,
    githubImportSubmitBtn,
    githubImportError,
    githubImportUrlInput,
    githubImportTitle,
    githubImportSelectionToolbar,
    githubImportModal,
    githubImportCancelBtn,
    isMarkdownPath,
    getFileName,
    newTab
  });
  const buildRawGitHubUrl = githubImport.buildRawGitHubUrl;
  const fetchGitHubJson = githubImport.fetchGitHubJson;
  const fetchTextContent = githubImport.fetchTextContent;
  const parseGitHubImportUrl = githubImport.parseGitHubImportUrl;
  const getDefaultBranch = githubImport.getDefaultBranch;
  const listMarkdownFiles = githubImport.listMarkdownFiles;
  const buildMarkdownFileTree = githubImport.buildMarkdownFileTree;
  const updateGitHubImportSelectedCount = githubImport.updateGitHubImportSelectedCount;
  const updateGitHubSelectAllButtonLabel = githubImport.updateGitHubSelectAllButtonLabel;
  const syncGitHubSelectionToButtons = githubImport.syncGitHubSelectionToButtons;
  const setGitHubSelectedPaths = githubImport.setGitHubSelectedPaths;
  const toggleGitHubSelectedPath = githubImport.toggleGitHubSelectedPath;
  const renderGitHubImportTree = githubImport.renderGitHubImportTree;
  const setGitHubImportLoading = githubImport.setGitHubImportLoading;
  const setGitHubImportMessage = githubImport.setGitHubImportMessage;
  const resetGitHubImportModal = githubImport.resetGitHubImportModal;
  const openGitHubImportModal = githubImport.openGitHubImportModal;
  const closeGitHubImportModal = githubImport.closeGitHubImportModal;
  const handleGitHubImportSubmit = githubImport.handleGitHubImportSubmit;
  const scrollSync = window.registerMarkdownViewerScrollSync(app, {
    delay: SCROLL_SYNC_DELAY,
    editorPane,
    previewPane,
    getActiveMarkdownEditor: function() { return editorViewManager.getActiveMarkdownEditor(); },
    getActivePreviewPane: function() { return editorViewManager.getActivePreviewPane(); },
    getActiveTab: function() { return tabs.find(function(tab) { return tab.id === activeTabId; }) || null; },
    saveGlobalState,
    syncToggleButtons
  });
  const updateSyncToggleButtons = scrollSync.updateSyncToggleButtons;
  const toggleSyncScrolling = scrollSync.toggleSyncScrolling;

  const mobileMenu = window.registerMarkdownViewerMobileMenu(app, {
    mobileMenuToggle,
    mobileMenuPanel,
    mobileMenuOverlay,
    mobileCloseMenu,
    mobileImportBtn,
    mobileImportGithubBtn,
    mobileExportMd,
    mobileExportHtml,
    mobileExportPdf,
    mobileCopyMarkdown,
    mobileThemeToggle,
    mobileNewTabBtn: document.getElementById("mobile-new-tab-btn"),
    mobileTabResetBtn: document.getElementById("mobile-tab-reset-btn"),
    copyMarkdownButton,
    exportMd,
    exportHtml,
    exportPdf,
    newTab,
    openDocumentFileFromPicker,
    openGitHubImportModal,
    resetAllTabs,
    themeToggle
  });
  const closeMobileMenu = mobileMenu.closeMobileMenu;

  function isEditableEditCommandTarget() {
    const tab = getActiveTab();
    return !!activeEditorCommands.getActiveEditor?.() && (!tab || (tab.type !== "graph" && tab.type !== "file-preview" && tab.type !== "image-editor" && tab.type !== "hex-editor"));
  }

  function setDocumentWordAutocompleteEnabled(enabled) {
    const nextEnabled = enabled === true;
    saveGlobalState({ documentWordAutocompleteEnabled: nextEnabled });
    applyDocumentWordAutocompletePreference(nextEnabled);
    updateDocumentWordAutocompleteToggleButtons();
  }

  function convertSelectedEditorText(command) {
    const selection = activeEditorCommands.getActiveEditorSelection?.();
    if (!selection || selection.end <= selection.start) return false;
    const selectedText = activeEditorCommands.getActiveEditorValue().slice(selection.start, selection.end);
    let replacement;

    try {
      switch (command) {
        case "unicode-hex-ncr":
          replacement = unicodeConverter.encode(selectedText, "hex-ncr");
          break;
        case "unicode-javascript-es6":
          replacement = unicodeConverter.encode(selectedText, "javascript-es6");
          break;
        case "unicode-java-c":
          replacement = unicodeConverter.encode(selectedText, "java-c");
          break;
        case "unicode-css":
          replacement = unicodeConverter.encode(selectedText, "css");
          break;
        case "unicode-encoded-uri":
        case "uri-encode":
          replacement = unicodeConverter.encode(selectedText, "encoded-uri");
          break;
        case "unicode-decode":
          replacement = unicodeConverter.decode(selectedText);
          break;
        case "uri-decode":
          replacement = unicodeConverter.decodeUri(selectedText);
          break;
        case "base64-encode":
          replacement = base64Converter.encode(selectedText);
          break;
        case "base64-decode":
          replacement = base64Converter.decode(selectedText);
          break;
        default:
          return false;
      }
    } catch (error) {
      console.warn("Edit conversion command failed:", command, error);
      window.alert(error?.message || "The selected text could not be converted.");
      return false;
    }

    const replaced = activeEditorCommands.replaceActiveEditorRange?.(selection.start, selection.end, replacement);
    if (replaced) {
      activeEditorCommands.setActiveEditorSelection?.(selection.start, selection.start + replacement.length);
      activeEditorCommands.focusActiveEditor?.();
    }
    return !!replaced;
  }

  async function runEditMenuCommand(command) {
    if (command === "autocomplete-toggle") {
      setDocumentWordAutocompleteEnabled(!isDocumentWordAutocompleteEnabled());
      return true;
    }
    if (!isEditableEditCommandTarget()) return false;

    switch (command) {
      case "undo":
        return activeEditorCommands.undo?.();
      case "redo":
        return activeEditorCommands.redo?.();
      case "cut":
        return activeEditorCommands.cutSelection?.();
      case "copy":
        return activeEditorCommands.copySelection?.();
      case "paste":
        return activeEditorCommands.pasteClipboard?.();
      case "delete":
        return activeEditorCommands.deleteSelection?.();
      case "select-all":
        return activeEditorCommands.selectAll?.();
      case "duplicate-line":
        return activeEditorCommands.duplicateCurrentLine?.();
      case "indent-more":
        return activeEditorCommands.increaseLineIndent?.();
      case "indent-less":
        return activeEditorCommands.decreaseLineIndent?.();
      case "uppercase":
        return activeEditorCommands.transformToUppercase?.();
      case "lowercase":
        return activeEditorCommands.transformToLowercase?.();
      case "title-case":
        return activeEditorCommands.transformToTitleCase?.();
      case "invert-case":
        return activeEditorCommands.invertSelectionCase?.();
      case "path-separators-backslash-to-slash":
        return activeEditorCommands.replaceSelectedPathSeparators?.("\\", "/");
      case "path-separators-slash-to-backslash":
        return activeEditorCommands.replaceSelectedPathSeparators?.("/", "\\");
      case "unicode-hex-ncr":
      case "unicode-javascript-es6":
      case "unicode-java-c":
      case "unicode-css":
      case "unicode-encoded-uri":
      case "unicode-decode":
      case "uri-encode":
      case "uri-decode":
      case "base64-encode":
      case "base64-decode":
        return convertSelectedEditorText(command);
      case "compact-json":
      case "json-for-code":
      case "json-from-code":
        return app.modules?.editorContextMenu?.runJsonEditCommand?.(command);
      case "toggle-comment":
        return activeEditorCommands.toggleComment?.();
      case "trim-trailing":
        return activeEditorCommands.trimSelectedTrailingSpace?.();
      case "trim-leading":
        return activeEditorCommands.trimSelectedLeadingSpace?.();
      case "trim-both":
        return activeEditorCommands.trimSelectedLeadingAndTrailingSpace?.();
      case "tab-to-space":
        return activeEditorCommands.selectedTabsToSpaces?.();
      case "space-to-tab":
        return activeEditorCommands.selectedSpacesToTabs?.();
      default:
        return false;
    }
  }

  editCommandButtons.forEach(function(button) {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      const command = button.dataset.editCommand || "";
      Promise.resolve(runEditMenuCommand(command)).catch(function(error) {
        console.warn("Edit command failed:", command, error);
      });
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  document.addEventListener("keydown", function(event) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "d") return;
    if (!isEditableEditCommandTarget()) return;
    if (!activeEditorCommands.isActiveEditorFocused?.()) return;
    event.preventDefault();
    Promise.resolve(runEditMenuCommand("duplicate-line")).catch(function(error) {
      console.warn("Edit command failed: duplicate-line", error);
    });
  });

  const statusLine = window.registerMarkdownViewerStatusLine(app, {
    markdownEditor,
    readingTimeElement,
    wordCountElement,
    lineCountElement,
    backgroundProcesses,
    charCountElement,
    mobileReadingTime,
    mobileWordCount,
    mobileCharCount,
    statusTipElement,
    graphZoomStatusElement,
    graphZoomPercentElement,
    graphPointsStatusElement,
    graphPointsCountElement,
    graphCollapsedNodesStatusElement,
    graphEdgesCountElement,
    graphClustersCountElement,
    graphClustersLabelElement,
    graphCollapsedNodesCountElement,
    editorEngineStatusElement,
    editorEngineLabelElement,
    editorTextpadStatusElement,
    editorTotalLengthElement,
    editorTotalLinesElement,
    editorCursorLineElement,
    editorCursorColumnElement,
    editorPositionLabelElement,
    editorPositionValueElement,
    formatGraphZoomPercent,
    activeEditorCommands,
    getActiveCodeMirrorEditor: function() {
      return editorViewManager?.getActiveCodeMirrorEditor?.() || codeMirrorEditor || null;
    },
    isEditorFocused: function() {
      return codeMirrorEditor?.isFocused ? codeMirrorEditor.isFocused() : activeEditorCommands.isActiveEditorFocused();
    },
    getActiveTab: function() {
      return tabs.find((tab) => tab.id === activeTabId);
    },
    getAppZoomPercent: function() {
      return viewWindowControls.getZoomPercent();
    },
    getGraphZoomScaleFromLayout,
    getLargeFileDocumentStats: function(activeTab) {
      return largeFileViewer.getLargeFileDocumentStats(activeTab);
    },
    getPreviewHoveredLinkUrl: function() {
      return previewHoveredLinkUrl;
    }
  });
  const updateDocumentStats = statusLine.updateDocumentStats;
  const updateMobileStats = statusLine.updateMobileStats;
  const updateStatusLine = statusLine.updateStatusLine;

  mobileMenu.bindMobileMenu();
  installAdaptiveActionSubmenus();

  function getEditorSortTabPath(tab) {
    return tab?.sourceFilePath || tab?.sourceFileName || tab?.sourceFileHandle?.name || "";
  }

  function isEditorSortEligibleTab(tab = getActiveTab()) {
    if (!tab || tab.type === "graph" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "hex-editor") return false;
    if (!activeEditorCommands.getActiveEditor?.()) return false;
    const sourcePath = getEditorSortTabPath(tab);
    return tab.type === "markdown" || !sourcePath || isTextDocumentPath(sourcePath);
  }

  function updateEditorSortDialogButtons() {
    const isEligible = isEditorSortEligibleTab();
    editorSortDialogButtons.forEach(function(button) {
      button.disabled = !isEligible;
      button.setAttribute("aria-disabled", isEligible ? "false" : "true");
      button.title = isEligible
        ? "Sort lines in the current text editor tab"
        : "Sort is available for text-based editor tabs";
    });
  }

  function isWordWrapEligibleTab(tab = getActiveTab()) {
    if (!tab) return false;
    return tab.type !== "graph" && tab.type !== "file-preview" && tab.type !== "image-editor" && tab.type !== "hex-editor";
  }

  function applyWordWrapPreference(enabled) {
    editorViewManager?.setWordWrapForEditorViews?.(enabled === true);
    largeFileViewer?.setWordWrap?.(enabled === true);
  }

  function updateWordWrapToggleButtons() {
    const enabled = isWordWrapEnabled();
    const isEligible = isWordWrapEligibleTab();
    wordWrapToggleButtons.forEach(function(button) {
      const icon = button.querySelector("i");
      const label = button.querySelector(".word-wrap-toggle-label");
      button.classList.toggle("active", enabled);
      button.disabled = !isEligible;
      button.setAttribute("aria-disabled", isEligible ? "false" : "true");
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      button.title = isEligible
        ? (enabled ? "Disable word wrap for text editor tabs" : "Enable word wrap for text editor tabs")
        : "Word wrap is available for text editor tabs";
      if (icon) {
        icon.classList.toggle("bi-check2-square", enabled);
        icon.classList.toggle("bi-text-wrap", !enabled);
      }
      if (label) label.textContent = enabled ? "Word Wrap On" : "Word Wrap";
    });
  }

  function applyShowSymbolPreferences(preferences = getShowSymbolPreferences()) {
    editorViewManager?.setShowSymbolPreferencesForEditorViews?.(preferences);
    document.body.classList.toggle("show-wrap-symbols", preferences.wrapSymbol !== false);
    renderEditorSyntaxHighlights();
  }

  function updateShowSymbolToggleButtons() {
    const preferences = getShowSymbolPreferences();
    showSymbolToggleButtons.forEach(function(button) {
      const key = button.dataset.showSymbol;
      const enabled = preferences[key] === true;
      const icon = button.querySelector("i");
      button.classList.toggle("active", enabled);
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      if (icon) icon.classList.toggle("invisible", !enabled);
    });
  }

  function setShowSymbolPreference(key, enabled) {
    const preferences = getShowSymbolPreferences();
    preferences[key] = enabled === true;
    saveGlobalState({ showSymbolPreferences: preferences });
    applyShowSymbolPreferences(preferences);
    updateShowSymbolToggleButtons();
  }

  function setWordWrapEnabled(enabled) {
    const nextEnabled = enabled === true;
    saveGlobalState({ wordWrapEnabled: nextEnabled });
    applyWordWrapPreference(nextEnabled);
    updateWordWrapToggleButtons();
    scheduleEditorLineNumbersUpdate();
  }

  wordWrapToggleButtons.forEach(function(button) {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      if (!isWordWrapEligibleTab()) return;
      setWordWrapEnabled(!isWordWrapEnabled());
    });
  });

  showSymbolToggleButtons.forEach(function(button) {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      const key = button.dataset.showSymbol;
      if (!key) return;
      const preferences = getShowSymbolPreferences();
      setShowSymbolPreference(key, preferences[key] !== true);
    });
  });

  updateShowSymbolToggleButtons();
  applyShowSymbolPreferences();

  // View Mode Button Event Listeners - Story 1.1
  viewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      setActiveMarkdownTabViewMode(mode);
      saveCurrentTabState();
    });
  });

  // Story 1.4: Mobile View Mode Button Event Listeners
  mobileViewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      setActiveMarkdownTabViewMode(mode);
      saveCurrentTabState();
      closeMobileMenu();
    });
  });

  let editorInputEventCount = 0;

  async function flushCurrentTabSession() {
    if (currentTabSessionFlushInFlight) return currentTabSessionFlushInFlight;
    currentTabSessionFlushInFlight = (async () => {
      await appDebugLog("info", "[tabs-session] Flushing current tab session", {
        activeTabId,
        tabCount: tabs.length,
        titles: tabs.map((tab) => tab?.title).filter(Boolean)
      });
      clearTimeout(saveTabStateTimeout);
      saveCurrentTabState({ lifecycle: true });
      if (tabs.length > 0) {
        saveTabsToStorage(tabs);
      }
      await flushTabsSessionProfileWrite();
    })().finally(() => {
      currentTabSessionFlushInFlight = null;
    });
    return currentTabSessionFlushInFlight;
  }

  function bindCurrentTabSessionLifecycleSave() {
    window.addEventListener("pagehide", function() {
      void appDebugLog("info", "[tabs-session] pagehide fired");
      void flushCurrentTabSession();
    });
    window.addEventListener("beforeunload", function() {
      void appDebugLog("info", "[tabs-session] beforeunload fired");
      void flushCurrentTabSession();
    });
    document.addEventListener("visibilitychange", function() {
      void appDebugLog("debug", "[tabs-session] visibilitychange fired", {
        visibilityState: document.visibilityState
      });
      if (document.visibilityState === "hidden") void flushCurrentTabSession();
    });
    try {
      if (typeof Neutralino === "undefined") {
        void appDebugLog("debug", "[tabs-session] Neutralino windowClose binding skipped outside desktop runtime");
        return;
      }
      Neutralino?.events?.on?.("windowClose", async function() {
        void appDebugLog("info", "[tabs-session] Neutralino windowClose fired");
        await exitApplication();
      });
    } catch (error) {
      console.warn("Failed to bind desktop close persistence:", error);
    }
  }
  bindCurrentTabSessionLifecycleSave();

  markdownEditor.addEventListener("input", function(event) {
    editorInputEventCount += 1;
    const activeContent = getActiveEditorValue();
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    const isLargeCodeMirrorDocument = event?.detail?.largeCodeMirrorDocument === true;
    if (isLargeCodeMirrorDocument) {
      if (activeTab) {
        if (activeTab.content !== activeContent) markCurrentTabSessionDirty();
        activeTab.content = activeContent;
        renderTabBar(tabs, activeTabId);
        updateSaveCurrentFileButtons();
      }
      clearTimeout(saveTabStateTimeout);
      return;
    }
    const isActiveMarkdownDocument = !activeTab?.sourceFilePath || isMarkdownPath(activeTab.sourceFilePath);
    if (isActiveMarkdownDocument) renderLinkAutocomplete();
    renderEditorSyntaxHighlights();
    updateEditorLineNumbers();
    updateEditorSelectionHighlights();
    updateStatusLine();
    if (activeTab) {
      if (activeTab.content !== activeContent) {
        markCurrentTabSessionDirty();
      }
      activeTab.content = activeContent;
      if (isActiveMarkdownDocument) syncMarkdownTabTagsToFolderState(activeTab, activeContent);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
    if (isActiveMarkdownDocument) debouncedRender();
    clearTimeout(saveTabStateTimeout);
    saveTabStateTimeout = setTimeout(saveCurrentTabState, 500);
  });

  // Tab key handler to insert indentation instead of moving focus
  markdownEditor.addEventListener("keydown", function(e) {
    if (handleLinkAutocompleteKeydown(e)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openEditorFindReplaceModal({ replace: false });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") {
      e.preventDefault();
      openEditorFindReplaceModal({ replace: true, focusReplace: true });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && undoEditorContextMenuConversion()) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "y" && redoEditorContextMenuConversion()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();

      const start = this.selectionStart;
      const end = this.selectionEnd;
      const value = this.value;

      const indent = " ".repeat(getSpacesPerIndentLevel());

      // Update textarea value
      this.value = value.substring(0, start) + indent + value.substring(end);

      // Update cursor position
      this.selectionStart = this.selectionEnd = start + indent.length;

      // Trigger input event to update preview
      this.dispatchEvent(new Event('input'));
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
    }
  });

  ["click", "keyup", "select"].forEach(function(eventName) {
    markdownEditor.addEventListener(eventName, function() {
      renderLinkAutocomplete();
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    });
  });
  markdownEditor.addEventListener("contextmenu", handleEditorContextMenu);
  markdownEditor.addEventListener("focus", function() {
    renderLinkAutocomplete();
    updateEditorLineNumbers();
    updateEditorSelectionHighlights();
    updateStatusLine();
  });
  markdownEditor.addEventListener("blur", function() {
    window.setTimeout(function() {
      if (!autocomplete.isLayerHovered()) hideLinkAutocomplete();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }, 0);
  });
  document.addEventListener("selectionchange", function() {
    if (activeEditorCommands.isActiveEditorFocused()) {
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }
  });
  markdownEditor.addEventListener("scroll", function() {
    positionLinkAutocompleteLayer();
    syncEditorLineNumberScroll();
    syncEditorSyntaxHighlightScroll();
    syncEditorSelectionHighlightsScroll();
    hideEditorContextMenu();
  });
  document.addEventListener("click", function(event) {
    if (!editorContextMenu || editorContextMenu.contains(event.target)) return;
    hideEditorContextMenu();
  });
  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") hideEditorContextMenu();
  });
  window.addEventListener("resize", function() {
    positionLinkAutocompleteLayer();
    hideEditorContextMenu();
  });

  if (typeof ResizeObserver !== "undefined") {
    editorLineNumberResizeObserver = new ResizeObserver(scheduleEditorLineNumbersUpdate);
    refreshEditorLineNumberResizeObserver();
  } else {
    window.addEventListener("resize", scheduleEditorLineNumbersUpdate);
  }

  scrollSync.bindScrollSync();
  themePreferences.bindThemeToggle();

  restoreDefaultsButtons.forEach(function(button) {
    button.addEventListener("click", async function(e) {
      e.preventDefault();
      if (await restoreDefaultPreferences()) {
        applyEditorFontPreferences();
        applySupportedTextExtensionsPreference();
        if (isFolderOpen) renderFilteredFolderTree();
        applyDocumentWordAutocompletePreference();
        updateDocumentWordAutocompleteToggleButtons();
        updateSpaceToTabLabels();
      }
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  importFromFileButtons.forEach(function(button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      openDocumentFileFromPicker();
    });
  });

  fileCompareButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      fileCompare.openCompareFilesFromPicker();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  apiClientButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      apiClient.openApiClient();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });
  newUnsavedFileButtons.forEach(function(button) {
    button.addEventListener("click", async function(e) {
      e.preventDefault();
      const fileName = await promptSidebarNewFileName(null, { title: "New File" });
      if (fileName) tabsModule.openNewUnsavedFileInTab(fileName);
    });
  });
  regexTesterButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      regexTester.openRegexTester();
    });
  });

  newDocumentButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      newTab();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  editorFindDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openEditorFindReplaceModal({ replace: false });
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  editorFindReplaceDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openEditorFindReplaceModal({ replace: true, focusReplace: true });
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  workspaceSearchDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openWorkspaceSearchModal();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  findInFilesResultsPanelToggleButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      toggleFindInFilesResultsPanel();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  welcomePageButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openWelcomePage();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  helpHomeButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openHelpHome();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  readmePageButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      openReadmePage();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  aboutDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      showAboutDialog();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  settingsDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      showSettingsDialog();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  codeConverterDialogButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      aiCompanionPanel?.closeWorkspaceForExternalNavigation?.();
      showCodeConverterDialog();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  imageEditorToolButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      if (typeof tabsModule?.openBlankImageEditorInTab === "function") {
        tabsModule.openBlankImageEditorInTab();
      } else {
        console.warn("Image editor tool is unavailable: tabs API is not ready.");
      }
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  function updateDiagramExportMenu(tab = tabsModule?.getActiveTab?.()) {
    const isDiagramTab = tab?.type === "diagram-editor";
    diagramExportSubmenus.forEach((submenu) => { submenu.hidden = !isDiagramTab; });
  }

  diagramExportButtons.forEach(function(button) {
    button.addEventListener("click", async function(e) {
      e.preventDefault();
      const activeTab = tabsModule?.getActiveTab?.();
      if (activeTab?.type !== "diagram-editor") return;
      await diagramEditor.exportTab(activeTab, button.dataset.diagramExportFormat);
    });
  });

  document.querySelectorAll("#desktopActionMenu, .application-menu-file > .application-menu-category-toggle").forEach(function(button) {
    button.addEventListener("click", function() {
      updateDiagramExportMenu();
    });
  });

  updateDiagramExportMenu();

  diagramEditorToolButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      if (typeof tabsModule?.openBlankDiagramEditorInTab === "function") {
        tabsModule.openBlankDiagramEditorInTab();
      } else {
        console.warn("Diagram Editor is unavailable: tabs API is not ready.");
      }
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  exitAppButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      exitApplication();
    });
  });

  if (aboutModalClose) {
    aboutModalClose.addEventListener("click", hideAboutDialog);
  }

  if (aboutLicenseButton) {
    aboutLicenseButton.addEventListener("click", function(e) {
      e.preventDefault();
      hideAboutDialog();
      closeOpenActionMenus();
      openLicensePage();
    });
  }

  if (aboutModal) {
    aboutModal.addEventListener("click", function(e) {
      if (e.target === aboutModal) hideAboutDialog();
    });
  }


  function isGeminiConnectorSettings(settings) {
    return settings?.providerMode === "gemini-connector" || settings?.providerMode === "gemini-connector-raw";
  }

  function getAiConnectorCertificateUrl(settings) {
    const rawUrl = String(settings?.geminiConnectorBaseUrl || settings?.baseUrl || "").trim();
    if (!rawUrl) return "";
    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === "https:" ? parsed.toString() : "";
    } catch (_error) {
      return "";
    }
  }

  function mergeTrustedAiCertificates(existingCertificates, inspection) {
    const existing = Array.isArray(existingCertificates) ? existingCertificates : [];
    const certificates = Array.isArray(inspection?.certificates) ? inspection.certificates : [];
    const fingerprints = new Set(certificates.map((certificate) => String(certificate.fingerprint256 || "")).filter(Boolean));
    const host = String(inspection?.host || "").trim().toLowerCase();
    const port = String(inspection?.port || "").trim();
    const retained = existing.filter((entry) => {
      if (String(entry?.host || "").trim().toLowerCase() !== host) return true;
      if (String(entry?.port || "").trim() !== port) return true;
      return !fingerprints.has(String(entry?.fingerprint256 || ""));
    });
    const trustedAt = new Date().toISOString();
    return retained.concat(certificates.map((certificate) => ({
      host,
      port,
      subject: String(certificate.subject || ""),
      issuer: String(certificate.issuer || ""),
      validFrom: String(certificate.validFrom || ""),
      validTo: String(certificate.validTo || ""),
      fingerprint256: String(certificate.fingerprint256 || ""),
      pem: String(certificate.pem || ""),
      trustedAt
    })));
  }

  function appendCertificateDetailRow(parent, label, value) {
    const row = document.createElement("div");
    const labelElement = document.createElement("strong");
    labelElement.textContent = `${label}: `;
    row.append(labelElement, document.createTextNode(String(value || "")));
    parent.appendChild(row);
  }

  function applyCertificateTrustDialogLayout(body) {
    const dialog = body?.closest?.(".app-notification-box");
    if (dialog) dialog.style.width = "min(760px, calc(100vw - 32px))";
  }

  function renderAiCertificateTrustBody(body, inspection) {
    applyCertificateTrustDialogLayout(body);
    const certificates = Array.isArray(inspection?.certificates) ? inspection.certificates : [];
    const host = `${inspection?.host || ""}${inspection?.port ? `:${inspection.port}` : ""}`;
    const summary = document.createElement("div");
    summary.className = "settings-help-text";
    summary.textContent = "Only trust this certificate if you recognize the host and fingerprint. The certificate will be trusted only by MD-Editor AI Companion requests for this host.";
    body.appendChild(summary);

    certificates.forEach((certificate, index) => {
      const section = document.createElement("div");
      section.className = "settings-section-block";
      const heading = document.createElement("p");
      heading.className = "settings-section-heading";
      heading.textContent = index === 0 ? `Server certificate for ${host}` : `Chain certificate ${index + 1}`;
      section.appendChild(heading);
      appendCertificateDetailRow(section, "Subject", certificate.subject);
      appendCertificateDetailRow(section, "Issuer", certificate.issuer);
      appendCertificateDetailRow(section, "Valid from", certificate.validFrom);
      appendCertificateDetailRow(section, "Valid to", certificate.validTo);
      appendCertificateDetailRow(section, "SHA-256", certificate.fingerprint256);
      body.appendChild(section);
    });

    const pem = document.createElement("textarea");
    pem.className = "settings-textarea";
    pem.readOnly = true;
    pem.rows = 8;
    pem.style.width = "95%";
    pem.style.maxWidth = "95%";
    pem.style.boxSizing = "border-box";
    pem.value = certificates.map((certificate) => certificate.pem).join("\n");
    body.appendChild(pem);
  }

  async function promptTrustAiConnectorCertificate(settings, errorMessage) {
    if (!isGeminiConnectorSettings(settings) || typeof neutralinoAiBridge?.inspectCertificate !== "function") return null;
    const url = getAiConnectorCertificateUrl(settings);
    if (!url || !/fetch failed|certificate|SELF_SIGNED_CERT/i.test(String(errorMessage || ""))) return null;
    let inspection;
    try {
      inspection = await neutralinoAiBridge.inspectCertificate({ url });
    } catch (inspectError) {
      await appDebugLog("warning", "[ai-companion] Unable to inspect connector certificate", { url, error: inspectError?.message || String(inspectError) });
      return null;
    }
    if (!Array.isArray(inspection?.certificates) || !inspection.certificates.length) return null;
    const decision = await app.services?.notify?.show?.({
      title: "Trust AI connector certificate?",
      message: `The AI connector presented a certificate that Node does not currently trust. Trust it for ${inspection.host}:${inspection.port}?`,
      dismissValue: "cancel",
      renderBody: (body) => renderAiCertificateTrustBody(body, inspection),
      buttons: [
        { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
        { id: "trust", label: "Trust and retry", value: "trust", variant: "primary", autoFocus: true }
      ]
    });
    if (decision !== "trust") return null;
    const trustedCertificates = mergeTrustedAiCertificates(getAiCompanionSettings().trustedCertificates, inspection);
    const updatedSettings = aiCompanionSettings?.normalize
      ? aiCompanionSettings.normalize({ ...settings, trustedCertificates })
      : { ...settings, trustedCertificates };
    saveGlobalState({ aiCompanionSettings: updatedSettings });
    await appDebugLog("info", "[ai-companion] Trusted AI connector certificate", {
      host: inspection.host,
      port: inspection.port,
      fingerprints: inspection.certificates.map((certificate) => certificate.fingerprint256)
    });
    return updatedSettings;
  }
  async function testAiCompanionConnectionFromSettings() {
    if (!neutralinoAiBridge || !settingsAiConnectionStatus) return;
    let settings = aiCompanionSettings?.normalize ? aiCompanionSettings.normalize({
      enabled: true,
      providerMode: settingsAiProviderModeInput?.value,
      baseUrl: settingsAiBaseUrlInput?.value,
      apiKey: settingsAiApiKeyInput?.value,
      model: settingsAiModelInput?.value,
      providerRequestDelayMs: Number(settingsAiProviderRequestDelayInput?.value),
      debugLogFullAiPayloads: settingsDebugAiFullPayloadsInput?.checked === true,
      litellmModelAlias: settingsAiLiteLlmAliasInput?.value,
      litellmRoutingConfig: settingsAiLiteLlmRoutingInput?.value,
      geminiConnectorBaseUrl: settingsAiGeminiBaseUrlInput?.value,
      geminiConnectorId: settingsAiGeminiConnectorIdInput?.value,
      geminiConnectorApiKey: settingsAiGeminiApiKeyInput?.value,
      trustedCertificates: getAiCompanionSettings().trustedCertificates
    }) : getAiCompanionSettings();
    settingsAiConnectionStatus.textContent = "Testing connection...";
    try {
      await neutralinoAiBridge.testConnection(settings);
      settingsAiConnectionStatus.textContent = "Connection succeeded.";
    } catch (error) {
      let finalError = error;
      const trustedSettings = await promptTrustAiConnectorCertificate(settings, error?.message || String(error));
      if (trustedSettings) {
        settings = trustedSettings;
        settingsAiConnectionStatus.textContent = "Certificate trusted. Retesting connection...";
        try {
          await neutralinoAiBridge.testConnection(settings);
          settingsAiConnectionStatus.textContent = "Connection succeeded.";
          return;
        } catch (retryError) {
          finalError = retryError;
        }
      }
      const errorMessage = finalError?.message || String(finalError);
      settingsAiConnectionStatus.textContent = "Connection failed. See details.";
      window.alert({
        title: "AI Companion connection failed",
        message: errorMessage
      });
    }
  }

  if (settingsModalCancel) {
    settingsModalCancel.addEventListener("click", hideSettingsDialog);
  }

  if (settingsModalClose) {
    settingsModalClose.addEventListener("click", hideSettingsDialog);
  }

  if (settingsModalSave) {
    settingsModalSave.addEventListener("click", saveSettingsDialog);
  }

  if (settingsAiTestConnectionButton) {
    settingsAiTestConnectionButton.addEventListener("click", testAiCompanionConnectionFromSettings);
  }

  if (settingsAiProviderModeInput) {
    settingsAiProviderModeInput.addEventListener("change", applyAiConnectionProviderPreset);
  }

  if (settingsExportFileButton) {
    settingsExportFileButton.addEventListener("click", async function() {
      if (!settingsTransfer || settingsDialogSaving) return;
      setSettingsDialogSaving(true);
      try {
        const exported = await settingsTransfer.exportSettingsFile();
        if (exported) alert("Settings exported.");
      } catch (error) {
        console.warn("Failed to export settings:", error);
        alert("Unable to export settings: " + (error?.message || "Unknown error"));
      } finally {
        setSettingsDialogSaving(false);
      }
    });
  }

  if (settingsImportFileButton) {
    settingsImportFileButton.addEventListener("click", async function() {
      if (!settingsTransfer || settingsDialogSaving) return;
      setSettingsDialogSaving(true);
      try {
        const imported = await settingsTransfer.importSettingsFile();
        if (imported) alert("Settings imported.");
      } catch (error) {
        console.warn("Failed to import settings:", error);
        alert("Unable to import settings: " + (error?.message || "Unknown error"));
      } finally {
        setSettingsDialogSaving(false);
      }
    });
  }

  if (settingsSnippetLanguageInput) {
    settingsSnippetLanguageInput.addEventListener("change", function() {
      settingsSnippetLanguageId = settingsSnippetLanguageInput.value || "javascript";
      settingsSelectedSnippetId = "";
      renderSettingsSnippets();
    });
  }

  if (settingsSnippetAddButton) {
    settingsSnippetAddButton.addEventListener("click", addSettingsSnippet);
  }

  if (settingsSnippetSaveButton) {
    settingsSnippetSaveButton.addEventListener("click", saveSettingsSnippet);
  }

  if (settingsSnippetResetButton) {
    settingsSnippetResetButton.addEventListener("click", resetSettingsSnippet);
  }

  if (settingsSnippetDeleteButton) {
    settingsSnippetDeleteButton.addEventListener("click", deleteSettingsSnippet);
  }

  if (settingsLspTypeScriptInstallButton) {
    settingsLspTypeScriptInstallButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installTypeScriptLanguageServerFromSettings();
    });
  }

  if (settingsLspTypeScriptRemoveButton) {
    settingsLspTypeScriptRemoveButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      removeTypeScriptLanguageServerFromSettings();
    });
  }

  if (settingsLspJavaInstallButton) {
    settingsLspJavaInstallButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installJavaLanguageServerFromSettings();
    });
  }

  if (settingsLspJavaRetryButton) {
    settingsLspJavaRetryButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      void retryJavaWorkspaceFromSettings();
    });
  }

  if (settingsLspJavaShowLogButton) {
    settingsLspJavaShowLogButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      void showActiveJdtLogFromSettings();
    });
  }

  if (settingsLspJavaResetWorkspaceButton) {
    settingsLspJavaResetWorkspaceButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      void resetActiveJdtWorkspaceFromSettings();
    });
  }

  if (settingsLspJavaInstallFileButton) {
    settingsLspJavaInstallFileButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installJavaLanguageServerFromFileSettings();
    });
  }

  if (settingsLspJavaRemoveButton) {
    settingsLspJavaRemoveButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      removeJavaLanguageServerFromSettings();
    });
  }
  if (settingsLspXmlInstallButton) {
    settingsLspXmlInstallButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installXmlLanguageServerFromSettings();
    });
  }

  if (settingsLspXmlInstallFileButton) {
    settingsLspXmlInstallFileButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installXmlLanguageServerFromFileSettings();
    });
  }

  if (settingsLspXmlInstallPomFileButton) {
    settingsLspXmlInstallPomFileButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      installPomLanguageServerFromFileSettings();
    });
  }

  if (settingsLspXmlRemoveButton) {
    settingsLspXmlRemoveButton.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      removeXmlLanguageServerFromSettings();
    });
  }

  [
    [settingsLspTypeScriptToggleButton, "typescript"],
    [settingsLspJavaToggleButton, "java"],
    [settingsLspXmlToggleButton, "xml"],
    [settingsLspPythonToggleButton, "python"],
    [settingsLspHtmlToggleButton, "html"],
    [settingsLspCssToggleButton, "css"],
    [settingsLspJsonToggleButton, "json"],
    [settingsLspYamlToggleButton, "yaml"],
    [settingsLspBashToggleButton, "bash"],
    [settingsLspDockerfileToggleButton, "dockerfile"],
    [settingsLspWindowsScriptingToggleButton, "windows-scripting"]
  ].forEach(([button, serverId]) => {
    if (button) button.addEventListener("click", () => {
      closeSettingsLanguageServerActionMenus();
      toggleLanguageServerFromSettings(serverId);
    });
  });

  getSettingsLanguageServerActionMenus().forEach(({ button, menu }) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSettingsLanguageServerActionMenu(button, menu);
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
  });

  document.addEventListener("click", () => closeSettingsLanguageServerActionMenus());
  window.addEventListener("resize", () => closeSettingsLanguageServerActionMenus());
  window.addEventListener("scroll", () => closeSettingsLanguageServerActionMenus(), true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsLanguageServerActionMenus();
    }
  });

  if (settingsAddJdkButton) {
    settingsAddJdkButton.addEventListener("click", () => chooseSettingsJdkFolder());
  }

  if (settingsAddGradleButton) {
    settingsAddGradleButton.addEventListener("click", () => chooseSettingsGradleFolder());
  }

  if (settingsGradleUserHomeBrowseButton) {
    settingsGradleUserHomeBrowseButton.addEventListener("click", chooseSettingsGradleUserHomeFolder);
  }

  settingsThemeSelects.forEach(function(select) {
    select.addEventListener("change", function() {
      setThemeDraftSelection(select.dataset.themeMode, select.value);
    });
  });

  settingsThemeCreateButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      createThemeDraftTheme(button.dataset.themeMode);
    });
  });

  settingsThemeDuplicateButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      duplicateThemeDraftTheme(button.dataset.themeMode);
    });
  });

  settingsThemeRenameButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      renameThemeDraftTheme(button.dataset.themeMode);
    });
  });

  settingsThemeDeleteButtons.forEach(function(button) {
    button.addEventListener("click", async function() {
      await deleteThemeDraftTheme(button.dataset.themeMode);
    });
  });

  settingsThemeTokenEditors.forEach(function(editor) {
    editor.addEventListener("input", function(event) {
      const input = event.target.closest?.(".settings-theme-color-input, .settings-theme-alpha-input");
      if (!input) return;
      handleThemeTokenInput(input);
    });
  });

  if (settingsResetCacheButton) {
    settingsResetCacheButton.addEventListener("click", async function() {
      await clearAllCachesFromSettings();
    });
  }

  if (settingsResetGraphPersistenceCacheButton) {
    settingsResetGraphPersistenceCacheButton.addEventListener("click", async function() {
      await clearGraphPersistenceCacheFromSettings();
    });
  }

  if (settingsResetMarkdownContentCacheButton) {
    settingsResetMarkdownContentCacheButton.addEventListener("click", async function() {
      await clearMarkdownContentCacheFromSettings();
    });
  }

  if (settingsResetGraphRenderCacheButton) {
    settingsResetGraphRenderCacheButton.addEventListener("click", async function() {
      await clearGraphRenderCacheFromSettings();
    });
  }

  if (settingsResetBrowserCacheButton) {
    settingsResetBrowserCacheButton.addEventListener("click", async function() {
      await clearBrowserCacheFromSettings();
    });
  }

  if (settingsResetPreferencesButton) {
    settingsResetPreferencesButton.addEventListener("click", function() {
      clearPreferencesFromSettings();
    });
  }

  if (settingsResetRecentHistoryButton) {
    settingsResetRecentHistoryButton.addEventListener("click", async function() {
      await clearRecentHistoryFromSettings();
    });
  }

  function updateProjectMenuButtons(enabled) {
    updateProjectButtons.forEach((button) => {
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", enabled ? "false" : "true");
      button.title = enabled
        ? "Apply pending dependency recovery updates to the open generated Markdown project"
        : "Open a generated Markdown project before updating it";
    });
  }

  async function handleUpdateProject(seedPath = activeFolderPath) {
    if (!recoveryUpdater?.runProjectUpdateFromSeed) {
      alert("Update project is not available in this build.");
      return null;
    }
    try {
      return await recoveryUpdater.runProjectUpdateFromSeed(seedPath, {
        onProjectUpdated: async () => {
          await invalidateWorkspaceDerivedState({
            reason: "dependency-recovery-updated-project",
            reloadTree: true
          });
        }
      });
    } catch (error) {
      console.error("Failed to update project:", error);
      alert("Unable to update project: " + (error?.message || error || "Unknown error"));
      return null;
    }
  }

  if (settingsClearDraftsButton) {
    settingsClearDraftsButton.addEventListener("click", async function() {
      await clearDraftsFromSettings();
    });
  }

  if (settingsResetThemesButton) {
    settingsResetThemesButton.addEventListener("click", async function() {
      await resetThemesFromSettings();
    });
  }

  if (settingsResetAllButton) {
    settingsResetAllButton.addEventListener("click", async function() {
      await resetAllFromSettings();
    });
  }

  if (settingsOpenProfileFolderButton) {
    settingsOpenProfileFolderButton.addEventListener("click", function() {
      openProfileDataLocationFromSettings();
    });
  }

  if (settingsOpenDebugLogTabButton) {
    settingsOpenDebugLogTabButton.addEventListener("click", function() {
      openDebugLogInAppFromSettings();
    });
  }

  if (settingsOpenDebugLogDefaultButton) {
    settingsOpenDebugLogDefaultButton.addEventListener("click", function() {
      openDebugLogInDefaultAppFromSettings();
    });
  }

  if (settingsClearDebugLogButton) {
    settingsClearDebugLogButton.addEventListener("click", function() {
      clearDebugLogFromSettings();
    });
  }

  if (settingsSyntaxLanguageSelect) {
    settingsSyntaxLanguageSelect.addEventListener("change", renderSyntaxColorSettings);
  }

  if (settingsSyntaxOpenEditorButton) {
    settingsSyntaxOpenEditorButton.addEventListener("click", openSyntaxEditorLayer);
  }

  if (settingsSyntaxResetLanguageButton) {
    settingsSyntaxResetLanguageButton.addEventListener("click", resetSelectedSyntaxLanguageColors);
  }

  if (settingsSyntaxColorGrid) {
    settingsSyntaxColorGrid.addEventListener("input", function(event) {
      const input = event.target.closest?.(".settings-syntax-color-input");
      if (!input || !settingsSyntaxLanguageSelect) return;
      updateSyntaxColorDraftFromInput(
        settingsSyntaxLanguageSelect.value || getActiveSyntaxLanguageId(),
        input.dataset.syntaxToken,
        input.value,
        input.closest("[data-syntax-defaults-mode]")?.dataset.syntaxDefaultsMode
      );
    });
  }

  // Keep syntax color grids in sync when light/dark mode is toggled while the
  // settings dialog is open, so stale defaults are never saved as overrides.
  if (settingsModal && typeof MutationObserver === "function") {
    new MutationObserver(function() {
      if (settingsModal.style.display === "none" || !settingsModal.style.display) return;
      renderSyntaxColorSettings();
      renderSyntaxEditorTokenSettings();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  settingsModal?.querySelectorAll(".settings-number-input").forEach(function(input) {
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") saveSettingsDialog();
      if (e.key === "Escape") hideSettingsDialog();
    });
  });

  if (settingsModal) {
    settingsModal.addEventListener("click", function(e) {
      if (e.target === settingsModal) hideSettingsDialog();
    });
  }

  if (codeConverterSourceBrowseButton) {
    codeConverterSourceBrowseButton.addEventListener("click", function() {
      browseCodeConverterFolder(codeConverterSourceRootInput, "Select source code root folder", "codeConverterSourceRoot");
    });
  }

  if (codeConverterDestinationBrowseButton) {
    codeConverterDestinationBrowseButton.addEventListener("click", function() {
      browseCodeConverterFolder(codeConverterDestinationRootInput, "Select destination Markdown root folder", "codeConverterDestinationRoot");
    });
  }

  if (codeConverterTypeSelect) {
    codeConverterTypeSelect.addEventListener("change", function() {
      resetCodeConverterExternalDependencyDefault();
      updateCodeConverterLanguageSupport();
    });
    updateCodeConverterLanguageSupport();
  }

  if (codeConverterIncludeExternalDependenciesInput) {
    codeConverterIncludeExternalDependenciesInput.addEventListener("change", updateCodeConverterLanguageSupport);
  }

  if (codeConverterConsoleToggle) {
    codeConverterConsoleToggle.addEventListener("click", function() {
      setCodeConverterConsoleExpanded(!codeConverterShell?.classList.contains("console-open"));
    });
  }

  if (codeConverterConsoleAutoScrollButton) {
    codeConverterConsoleAutoScrollButton.addEventListener("click", toggleCodeConverterConsoleAutoScroll);
  }

  if (codeConverterConsoleCopyButton) {
    codeConverterConsoleCopyButton.addEventListener("click", copyCodeConverterConsole);
  }

  if (codeConverterCancelButton) {
    codeConverterCancelButton.addEventListener("click", cancelCodeConverterDialog);
  }

  if (codeConverterMinimizeButton) {
    codeConverterMinimizeButton.addEventListener("click", minimizeCodeConverterTask);
  }

  if (codeConverterTaskPill) {
    codeConverterTaskPill.addEventListener("click", restoreCodeConverterTaskDialog);
  }

  if (codeConverterOpenFolderButton) {
    codeConverterOpenFolderButton.addEventListener("click", openCompletedCodeConverterFolder);
  }

  if (codeConverterFinishButton) {
    codeConverterFinishButton.addEventListener("click", finishCodeConverterTask);
  }

  if (codeConverterRunButton) {
    codeConverterRunButton.addEventListener("click", runCodeConverter);
  }

  setOriginalSourceRootButtons.forEach((button) => {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      handleSetOriginalSourceRoot();
    });
  });

  updateProjectButtons.forEach((button) => {
    button.addEventListener("click", function(event) {
      event.preventDefault();
      if (button.disabled) return;
      void handleUpdateProject(activeFolderPath);
    });
  });

  document.querySelectorAll("#import-from-folder").forEach(function(button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      openFolderTree(e);
    });
  });

  document.querySelectorAll(".close-folder-button").forEach((button) => {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      closeFolderTree();
    });
  });
  updateCloseFolderButtons();
  if (folderTreeRoot) {
    folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
    folderTreeRoot.addEventListener("click", handleFolderTreeRootClick);
  }

  if (importFromGithubButton) {
    importFromGithubButton.addEventListener("click", function (e) {
      e.preventDefault();
      openGitHubImportModal();
    });
  }

  if (githubImportSubmitBtn) {
    githubImportSubmitBtn.addEventListener("click", handleGitHubImportSubmit);
  }
  if (githubImportCancelBtn) {
    githubImportCancelBtn.addEventListener("click", closeGitHubImportModal);
  }
  const handleGitHubImportInputKeydown = function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGitHubImportSubmit();
    } else if (e.key === "Escape") {
      closeGitHubImportModal();
    }
  };
  if (githubImportUrlInput) {
    githubImportUrlInput.addEventListener("keydown", handleGitHubImportInputKeydown);
  }
  if (githubImportFileSelect) {
    githubImportFileSelect.addEventListener("keydown", handleGitHubImportInputKeydown);
  }
  if (githubImportSelectAllBtn) {
    githubImportSelectAllBtn.addEventListener("click", function() {
      const allPaths = availableGitHubImportPaths.slice();
      const shouldSelectAll = selectedGitHubImportPaths.size !== allPaths.length;
      setGitHubSelectedPaths(shouldSelectAll ? allPaths : []);
    });
  }

  setTimeout(() => {
    const pane = document.getElementById("folder-tree-pane");
    if (!pane) {
      console.warn("[FolderTree] pane element not found in DOM.");
      return;
    }
    const rect = pane.getBoundingClientRect();
    const style = window.getComputedStyle(pane);
    console.error("[FolderTree] pane layout", {
      rect: { width: rect.width, left: rect.left, right: rect.right },
      display: style.display,
      visibility: style.visibility,
      flex: style.flex,
      minWidth: style.minWidth
    });
  }, 0);

  fileInput.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (file) {
      await importDocumentFile(file);
    }
    this.value = "";
  });



  if (folderInput) {
    folderInput.addEventListener("change", async function(e) {
      const files = e.target.files;
      if (!files || !files.length) {
        this.value = "";
        return;
      }
      const firstRelativePath = Array.from(files).find((file) => file.webkitRelativePath)?.webkitRelativePath || "";
      activeFolderName = firstRelativePath.split("/")[0] || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      renderFolderLoadingState(`Loading ${activeFolderName}...`);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        const nodes = await buildTreeFromFileList(files);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
        await promptActiveSavedGraphForCurrentFolder();
      } catch (error) {
        console.error("Failed to open folder:", error);
        renderFolderLoadingError("Unable to load this folder.");
        alert("Unable to load this folder: " + (error?.message || error));
      } finally {
        this.value = "";
      }
    });
  }

  // Graph extraction helpers are registered near startup from js/graph/extraction.js.

  const graphToolbar = window.registerMarkdownViewerGraphToolbar(app, {
    DEFAULT_GRAPH_VIEW_CONFIG,
    GRAPH_VIEW_PREFERENCE_KEYS,
    GRAPH_GROUP_QUERY_UPDATE_DELAY,
    LIGHTWEIGHT_SAVED_GRAPH_TEXT_SEARCH_MESSAGE,
    get activeFolderPath() { return activeFolderPath; },
    get tabs() { return tabs; },
    get graphSettings() { return graphSettings; },
    get graphRenderCache() { return graphRenderCache; },
    get graphViewCanvas() { return graphViewCanvas; },
    get graphViewToolbar() { return graphViewToolbar; },
    getActiveGraphViewRoot: function() {
      const root = tabViewManager?.getActiveTabView?.();
      return root?.dataset?.tabViewKind === "graph" || root?.dataset?.tabViewKind === "graph-health-report" ? root : null;
    },
    getActivePreviewPane: function() { return editorViewManager.getActivePreviewPane(); },
    get graphFilterPanelToggle() { return graphFilterPanelToggle; },
    get graphGroupsList() { return graphGroupsList; },
    get graphAddGroupButton() { return graphAddGroupButton; },
    get graphShowTagsButton() { return graphShowTagsButton; },
    get graphHideTagsButton() { return graphHideTagsButton; },
    get graphDisplayExternalJars() { return graphDisplayExternalJars; },
    get graphDisplayMissingDependencies() { return graphDisplayMissingDependencies; },
    get graphFileSearchFilter() { return graphFileSearchFilter; },
    get graphSelectedTagFilter() { return graphSelectedTagFilter; },
    get graphOnlySelectedTagButton() { return graphOnlySelectedTagButton; },
    get graphDisplayArrows() { return graphDisplayArrows; },
    get graphDisplayOrphans() { return graphDisplayOrphans; },
    get graphDisplayLabels() { return graphDisplayLabels; },
    get graphTextFadeThreshold() { return graphTextFadeThreshold; },
    get graphNodeSize() { return graphNodeSize; },
    get graphLinkThickness() { return graphLinkThickness; },
    get graphCenterForce() { return graphCenterForce; },
    get graphRepelForce() { return graphRepelForce; },
    get graphLinkForce() { return graphLinkForce; },
    get graphLinkDistance() { return graphLinkDistance; },
    get graphGroupForce() { return graphGroupForce; },
    get graphResetDefaultsButton() { return graphResetDefaultsButton; },
    get graphStaleCloseButton() { return graphStaleCloseButton; },
    get graphStaleKeepButton() { return graphStaleKeepButton; },
    get graphStaleUpdateButton() { return graphStaleUpdateButton; },
    get graphStaleViewDetailsButton() { return graphStaleViewDetailsButton; },
    get graphStaleCompareButton() { return graphStaleCompareButton; },
    get graphStaleModal() { return graphStaleModal; },
    get graphComparisonDetailsCloseButton() { return graphComparisonDetailsCloseButton; },
    get graphComparisonDetailsDoneButton() { return graphComparisonDetailsDoneButton; },
    get graphComparisonDetailsModal() { return graphComparisonDetailsModal; },
    desktopOpenGraphButtons,
    mobileOpenGraphView,
    openGraphView,
    normalizeGraphTagNodeId,
    graphSnapshotHasEmbeddedFileContent,
    isKeepSavedGraphMode,
    showGraphBanner,
    hideGraphBanner,
    findFolderMarkdownEntryForGraphFile,
    getFileTagsFromContent,
    getFileName,
    normalizeFileTagList,
    extractMarkdownTags,
    normalizeTagName,
    getAllKnownAndReferencedTags,
    getGraphLinkEndpointKey,
    getPathRelativeToFolder,
    getActiveGraphTab,
    normalizeGraphViewConfig,
    updateSavedGraphModePill,
    refreshGraphModeNoticesForTab,
    getGraphColorInputValue,
    createGraphGroupId,
    getNextDefaultGraphGroupColor,
    normalizeGraphGroups,
    removeGraphRenderForTab,
    markGraphTabAsChanged,
    saveTabsToStorage,
    get renderGraphView() { return renderGraphView; },
    saveGlobalState,
    saveGraphViewPreferenceDefaults,
    getGraphDisplayLabel,
    createGraphPerfSession,
    openGraphStaleComparisonDetailsModal,
    keepSavedGraphFromStaleModal,
    updateGraphFromStaleModal,
    loadGraphComparisonFromStaleModal,
    hideGraphStaleModal,
    closeGraphComparisonDetailsModal
  });
  const {
    setGraphFilterPanelCollapsed,
    setGraphViewMode,
    getGraphSnapshotTagNodeIds,
    getGraphFilterTagNodeIds,
    getGraphTagLabelFromId,
    parseGraphGroupQuery,
    graphQueryRequiresFileContent,
    isLightweightSavedGraphView,
    showLightweightSavedGraphTextSearchUnavailable,
    getGraphSnapshotFileCachedContent,
    getGraphFilterFileData,
    graphFileMatchesGroupQuery,
    getGraphGroupMatch,
    updateGraphGroup,
    deleteGraphGroup,
    getGraphGroupQueryContext,
    isGraphGroupAbsolutePathSuggestion,
    getGraphGroupRelativeFilePath,
    addGraphGroupPathFolderSuggestions,
    getGraphGroupSuggestionEntries,
    attachGraphGroupQuerySuggestions,
    renderGraphGroupsToolbar,
    updateGraphTagToolbar,
    resetActiveGraphViewToDefaults,
    updateActiveGraphViewConfig,
    animateActiveGraphView,
    initializeGraphFilterTooltips
  } = graphToolbar;

  const graphPackageSummary = window.registerMarkdownViewerGraphPackageSummary(app, {
    copyTextToSystemClipboard,
    get saveAs() { return saveAs; },
    escapeHtml
  });

  let graphMavenRecovery = null;
  if (typeof window.registerMarkdownViewerGraphMavenRecovery === "function") {
    try {
      graphMavenRecovery = window.registerMarkdownViewerGraphMavenRecovery(app, {
        get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
        get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
        isNeutralinoRuntime,
        joinPath,
        loadSourceRootMetadata,
        getOriginalSourceRootPath,
        appDebugLog
      });
    } catch (error) {
      console.error("Failed to initialize graph Maven recovery:", error);
      void appDebugLog("error", "[maven-recovery] Failed to initialize optional module", {
        message: error?.message || String(error || "")
      });
    }
  }

  const graphHealth = window.registerMarkdownViewerGraphHealth(app, {
    graphHealthPanel: null,
    graphPackageSummary,
    graphMavenRecovery,
    recoveryUpdater,
    get graphViewToolbar() { return graphViewToolbar; },
    get tabs() { return tabs; },
    getActiveGraphTab,
    createGraphTab,
    createOpenedSource,
    setTabOpenedSource,
    switchTab,
    saveTabsToStorage,
    saveCurrentFileIfChanged,
    updateSaveCurrentFileButtons,
    openDocumentSourceFile,
    openFolderTreeFromNeutralinoPath,
    get activeFolderPath() { return activeFolderPath; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    getFileName,
    joinPath,
    isAbsoluteFilesystemPath,
    appDebugLog,
    getOriginalSourceRootPath,
    resolveOriginalSourcePath,
    findGeneratedProjectFolderFromPath,
    createGraphFileDataFromNode,
    getGraphSnapshotFileEntries,
    invalidateWorkspaceDerivedState,
    escapeHtml
  });
  const renderGraphHealthPanel = graphHealth.renderGraphHealthPanel;
  const renderGraphHealthReportView = graphHealth.renderGraphHealthReportView;
  const openGraphHealthReportTab = graphHealth.openGraphHealthReportTab;

  const graphRenderer = window.registerMarkdownViewerGraphRenderer(app, {
    get graphRenderRequestId() { return graphRenderRequestId; },
    set graphRenderRequestId(value) { graphRenderRequestId = value; },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    getMaxOpenTabs,
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get graphViewCanvas() { return graphViewCanvas; },
    get graphFindDialog() { return graphFindDialog; },
    get graphFindInput() { return graphFindInput; },
    get graphFindStatus() { return graphFindStatus; },
    get graphFindOkButton() { return graphFindOkButton; },
    get graphFindCancelButton() { return graphFindCancelButton; },
    get graphRenderCache() { return graphRenderCache; },
    get graphSettings() { return graphSettings; },
    get folderTreeRoot() { return folderTreeRoot; },
    withPausedTabsSessionProfileWrites,
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    DEFAULT_GRAPH_VIEW_CONFIG,
    LARGE_GRAPH_DISPLAY_NODE_LIMIT,
    getGraphViewPreferenceDefaults,
    getGraphAutoClusterThreshold,
    isGraphAutoClusterLargeMapsEnabled,
    getLargeMapHoverPreferences,
    getGraphRenderWarningThreshold,
    getGraphMostReferencedPercent,
    getGraphStaticWarmupTicks,
    getGraphShowFileExtensions,
    createGraphFileDataFromNode,
    getGraphSnapshotFileEntries,
    getGraphNodeDefaultColor,
    getGraphLinkColor,
    getGraphExternalDependencyColor,
    getGraphExternalDependencyLineColor,
    getGraphMissingDependencyColor,
    getGraphMissingDependencyLineColor,
    getGraphTagNodeColor,
    getGraphTagLineColor,
    getGraphClusterNodeColor,
    getGraphFindHighlightColor,
    getDebugPreferences,
    appDebugLog,
    shouldConfirmOpenManyGraphNodes,
    shouldConfirmDeleteFiles,
    createGraphPerfSession,
    normalizeGraphViewConfig,
    invalidateWorkspaceDerivedState,
    hideInactiveGraphRenders,
    updateStatusLine,
    openFolderTreeFromNeutralinoPath,
    updateGraphTagToolbar,
    renderGraphHealthPanel,
    renderGraphHealthReportView,
    openGraphHealthReportTab,
    renderTagManagementList,
    isKeepSavedGraphMode,
    createGraphSnapshot,
    saveTabsToStorage,
    getGraphSnapshotSignature,
    getGraphZoomScaleFromLayout,
    removeGraphRenderForTab,
    syncGraphTabDocument,
    parseGraphGroupQuery,
    createGraphGroupId,
    graphFileMatchesGroupQuery,
    normalizeGraphTagNodeIds,
    getGraphGroupMatch,
    applySavedGraphLayout,
    getSavedGraphZoomTransform,
    captureGraphLayout,
    scheduleGraphLayoutStorageSave,
    markGraphTabAsChanged,
    saveGlobalState,
    getKnownTags,
    saveKnownTags,
    getAllKnownAndReferencedTags,
    createTag,
    promptForNewTag,
    getNextDefaultGraphGroupColor,
    getGraphDisplayLabel,
    getGraphContextMenuTitle,
    javaImportCleanup,
    getFolderMarkdownEntryForTab,
    normalizeGraphNodeName,
    getFileTagsFromContent,
    normalizeFileTagList,
    normalizeTagName,
    addTagToContent,
    removeTagFromContent,
    createTagsContextSubmenu,
    renderTagsContextSubmenu,
    normalizeEditorContent,
    activeEditorCommands,
    renderEditorSyntaxHighlights,
    updateEditorLineNumbers,
    renderMarkdown,
    openDocumentSourceFile,
    resolveOriginalSourcePath,
    findFolderTreeFileButtonForTab,
    get revealFolderTreeFileByPath() { return app.modules?.sidebarContextTree?.revealFolderTreeFileByPath; },
    setSidebarVisible,
    switchTab,
    getFileName,
    joinPath,
    isNeutralinoRuntime,
    closeTabsForDeletedPath,
    refreshOpenFolderTreeAfterFileDelete,
    removeSavedGraphNodeFromActiveTab,
    createGraphTab,
    exportMarkdownContent,
    exportHtmlContent,
    exportPdfContent,
    CONTEXT_MENU_ACTIONS,
    copyToClipboard,
    showCopiedMessage,
    refreshFolderTagCounts,
    updateFolderTreeNodeTagsForEntry,
    updateSaveCurrentFileButtons,
    renderFilteredFolderTree,
    renderLinkAutocomplete,
    renderTabBar,
    renameSidebarNodeOnDisk,
    get copyShareUrlFromText() { return app.actions.copyShareUrlFromText; },
    get markdownEditor() { return markdownEditor; },
    deleteTag
  });
  const renderGraphView = graphRenderer.renderGraphView;
  const openGraphFindDialog = graphRenderer.openGraphFindDialog;
  if (typeof window.registerMarkdownViewerGraphCompanionControl === "function") {
    graphCompanionControl = window.registerMarkdownViewerGraphCompanionControl(app, {
      getTabs: function() { return tabs; },
      getActiveTabId: function() { return activeTabId; },
      get graphRenderCache() { return graphRenderCache; },
      switchTab,
      updateActiveGraphViewConfig,
      renderGraphView
    });
  }

  function getMostRecentRestorableFolderPath() {
    const lastOpenFolderPath = getLastOpenFolderPathFromState();
    if (lastOpenFolderPath !== null) return lastOpenFolderPath;
    return readRecentItems(RECENT_FOLDERS_KEY)
      .filter((item) => item && item.path)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0]?.path || "";
  }

  async function restoreLastFolderOnStartupIfNeeded() {
    if (!isNeutralinoRuntime() || !shouldRestoreLastFolderOnStartup() || activeFolderPath || activeFolderHandle) return;
    await recentItemsHydrationPromise;
    const folderPath = getMostRecentRestorableFolderPath();
    if (!folderPath) return;
    try {
      void appDebugLog("info", "[folder-open] Restoring last folder on startup", { path: folderPath });
      await openFolderTreeFromNeutralinoPath(folderPath, { skipSavedGraphPrompt: true, preferLazyRoot: true });
    } catch (error) {
      void appDebugLog("warning", "[folder-open] Failed to restore last folder on startup", {
        path: folderPath,
        message: error?.message || String(error || "")
      });
      console.warn("Failed to restore last folder on startup:", error);
    }
  }

  async function restoreLastFolderOnStartupInBackground() {
    startupPerf?.mark?.("startup folder restore scheduled");
    void startupPerf?.flushToAppDebug?.(appDebugLog);
    try {
      await restoreLastFolderOnStartupIfNeeded();
    } finally {
      await app.modules?.folderWatcher?.syncOpenTabWatchers?.();
      startupPerf?.mark?.("startup folder restore background complete", {
        hasFolder: Boolean(activeFolderPath || activeFolderHandle)
      });
      void startupPerf?.flushToAppDebug?.(appDebugLog);
    }
  }

  try {
    startupPerf?.mark?.("startup profile hydration start");
    void appDebugLog("info", "[tabs-session] Waiting for desktop preference hydration before tab startup");
    await globalStateHydrationPromise;
    startupPerf?.mark?.("startup preference hydration complete");
    void startupPerf?.flushToAppDebug?.(appDebugLog);
    void appDebugLog("info", "[tabs-session] Preference hydration complete before tab startup", {
      startupBehavior: getStartupBehavior(),
      localStorageTabCount: loadTabsFromStorage().tabs?.length || 0,
      localStorageActiveTabId: loadActiveTabId()
    });
    await hydrateTabsSessionFromProfile();
    startupPerf?.mark?.("startup tabs profile hydration complete", {
      localStorageTabCount: loadTabsFromStorage().tabs?.length || 0,
      localStorageActiveTabId: loadActiveTabId()
    });
    void startupPerf?.flushToAppDebug?.(appDebugLog);
    void appDebugLog("info", "[tabs-session] Tabs profile hydration complete before tab startup", {
      localStorageTabCount: loadTabsFromStorage().tabs?.length || 0,
      localStorageActiveTabId: loadActiveTabId()
    });
  } catch (error) {
    startupPerf?.mark?.("startup profile hydration failed", { message: error?.message || String(error) });
    void appDebugLog("warning", "[tabs-session] Desktop profile hydration failed before tab startup", error);
    console.warn("Failed to hydrate desktop profile before startup:", error);
  }
  const restoredGlobalState = loadGlobalState();
  bottomPanelTabs?.restoreSavedPanelState?.();
  applySupportedTextExtensionsPreference(restoredGlobalState);
  aiCompanionPanel?.selectTab(restoredGlobalState.aiCompanionSelectedMode, { persist: false });
  aiCompanionPanel?.setOpen(restoredGlobalState.aiCompanionPanelVisible === true, { persist: false });
  applyEditorFontPreferences();
  startupPerf?.mark?.("initTabs start");
  await initTabs();
  window.markdownViewerOpenDocumentSourceFile = openDocumentSourceFile;
  updateDiagramExportMenu(tabsModule?.getActiveTab?.() || null);
  startupPerf?.mark?.("initTabs complete", {
    activeTabId,
    tabCount: Array.isArray(tabs) ? tabs.length : 0
  });
  applySyntaxHighlightColorsForActiveLanguage();
  if (loadGlobalState().syncScrollingEnabled === false) toggleSyncScrolling();
  updateSyncToggleButtons();
  updateWordWrapToggleButtons();
  updateEditorSortDialogButtons();
  updateDocumentWordAutocompleteToggleButtons();
  updateSpaceToTabLabels();
  updateMobileStats();
  updateStatusLine();
  updateEditorLineNumbers();
  renderEditorSyntaxHighlights();

  // Initialize resizer - Story 1.3
  initResizer();

  document.querySelectorAll(".save-current-file-button").forEach(function(button) {
    button.addEventListener("click", saveCurrentFileIfChanged);
  });

  document.querySelectorAll(".save-as-file-button").forEach(function(button) {
    button.addEventListener("click", async function() {
      try {
        const activeTab = tabsModule?.getActiveTab?.();
        if (activeTab?.type === "hex-editor") {
          await hexEditor.saveHexEditorTab(activeTab, { saveAs: true });
          return;
        }
        saveCurrentTabState();
        await saveActiveFileTabAs();
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Save As failed:", error);
        alert("Save As failed: " + error.message);
      }
    });
  });

  document.querySelectorAll(".save-all-files-button").forEach(function(button) {
    button.addEventListener("click", saveAllChangedTabs);
  });

  document.querySelectorAll(".reload-current-file-button").forEach(function(button) {
    button.addEventListener("click", function() {
      void reloadActiveTabFromDisk();
      if (button.classList.contains("mobile-menu-item")) closeMobileMenu();
    });
  });

  document.addEventListener("click", async function(event) {
    const button = event.target.closest(".export-folder-to-graph");
    if (!button || button.disabled) return;
    event.preventDefault();
    try {
      await exportActiveFolderToGraph();
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.error("Failed to export folder to graph:", error);
      alert("Failed to export folder to graph: " + error.message);
    }
  });

  exportMd.addEventListener("click", async function () {
    try {
      saveCurrentTabState();
      if (await saveActiveTabToSource()) {
        return;
      }
      await saveActiveTabWithSaveDialog();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.error("Export failed:", e);
      alert("Export failed: " + e.message);
    }
  });

  exportHtml.addEventListener("click", function () {
    try {
      const markdown = getActiveEditorValue();
      const html = marked.parse(markdown);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container'],
        ADD_ATTR: ['id', 'class', 'style']
      });
      const tempContainer = document.createElement("div");
      tempContainer.innerHTML = sanitizedHtml;
      enhanceGitHubAlerts(tempContainer);
      const enhancedHtml = tempContainer.innerHTML;
      const isDarkTheme =
        document.documentElement.getAttribute("data-theme") === "dark";
      const cssTheme = isDarkTheme
        ? "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown-dark.min.css"
        : "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown.min.css";
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <link rel="stylesheet" href="${cssTheme}">
  <script>
      window.MathJax = {
          tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
              displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
              processEscapes: true
          }
      };
  </script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>
  <style>
      body {
          background-color: ${isDarkTheme ? "#0d1117" : "#ffffff"};
          color: ${isDarkTheme ? "#c9d1d9" : "#24292e"};
      }
      .markdown-body {
          box-sizing: border-box;
          min-width: 200px;
          max-width: 980px;
          margin: 0 auto;
          padding: 45px;
          background-color: ${isDarkTheme ? "#0d1117" : "#ffffff"};
          color: ${isDarkTheme ? "#c9d1d9" : "#24292e"};
      }

      /* Syntax Highlighting */
      .hljs-doctag, .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_ { color: ${isDarkTheme ? "#ff7b72" : "#d73a49"}; }
      .hljs-title, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-title.function_ { color: ${isDarkTheme ? "#d2a8ff" : "#6f42c1"}; }
      .hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-variable, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: ${isDarkTheme ? "#79c0ff" : "#005cc5"}; }
      .hljs-regexp, .hljs-string, .hljs-meta .hljs-string { color: ${isDarkTheme ? "#a5d6ff" : "#032f62"}; }
      .hljs-built_in, .hljs-symbol { color: ${isDarkTheme ? "#ffa657" : "#e36209"}; }
      .hljs-comment, .hljs-code, .hljs-formula { color: ${isDarkTheme ? "#8b949e" : "#6a737d"}; }
      .hljs-name, .hljs-quote, .hljs-selector-tag, .hljs-selector-pseudo { color: ${isDarkTheme ? "#7ee787" : "#22863a"}; }
      .hljs-subst { color: ${isDarkTheme ? "#c9d1d9" : "#24292e"}; }
      .hljs-section { color: ${isDarkTheme ? "#1f6feb" : "#005cc5"}; font-weight: bold; }
      .hljs-bullet { color: ${isDarkTheme ? "#79c0ff" : "#005cc5"}; }
      .hljs-emphasis { font-style: italic; }
      .hljs-strong { font-weight: bold; }
      .hljs-addition { color: ${isDarkTheme ? "#aff5b4" : "#22863a"}; background-color: ${isDarkTheme ? "#033a16" : "#f0fff4"}; }
      .hljs-deletion { color: ${isDarkTheme ? "#ffdcd7" : "#b31d28"}; background-color: ${isDarkTheme ? "#67060c" : "#ffeef0"}; }

      .markdown-alert {
          padding: 0.5rem 1rem;
          margin-bottom: 16px;
          border-left: 0.25em solid;
          border-radius: 0.375rem;
      }
      .markdown-alert > :last-child {
          margin-bottom: 0;
      }
      .markdown-alert-title {
          margin: 0 0 8px;
          font-weight: 600;
          line-height: 1.25;
          display: flex;
          align-items: center;
          gap: 8px;
      }
      .markdown-alert-icon {
          display: inline-flex;
          width: 16px;
          height: 16px;
      }
      .markdown-alert-icon svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
      }
      .markdown-alert-note { color: ${isDarkTheme ? "#4493f8" : "#0969da"}; border-left-color: ${isDarkTheme ? "#4493f8" : "#0969da"}; background-color: ${isDarkTheme ? "rgba(31, 111, 235, 0.15)" : "#ddf4ff"}; }
      .markdown-alert-tip { color: ${isDarkTheme ? "#3fb950" : "#1a7f37"}; border-left-color: ${isDarkTheme ? "#3fb950" : "#1a7f37"}; background-color: ${isDarkTheme ? "rgba(35, 134, 54, 0.15)" : "#dafbe1"}; }
      .markdown-alert-important { color: ${isDarkTheme ? "#ab7df8" : "#8250df"}; border-left-color: ${isDarkTheme ? "#ab7df8" : "#8250df"}; background-color: ${isDarkTheme ? "rgba(137, 87, 229, 0.15)" : "#fbefff"}; }
      .markdown-alert-warning { color: ${isDarkTheme ? "#d29922" : "#9a6700"}; border-left-color: ${isDarkTheme ? "#d29922" : "#9a6700"}; background-color: ${isDarkTheme ? "rgba(210, 153, 34, 0.18)" : "#fff8c5"}; }
      .markdown-alert-caution { color: ${isDarkTheme ? "#f85149" : "#cf222e"}; border-left-color: ${isDarkTheme ? "#f85149" : "#cf222e"}; background-color: ${isDarkTheme ? "rgba(248, 81, 73, 0.18)" : "#ffebe9"}; }
      .markdown-alert > *:not(.markdown-alert-title) { color: ${isDarkTheme ? "#c9d1d9" : "#24292e"}; }

      @media (max-width: 767px) {
          .markdown-body {
              padding: 15px;
          }
      }
  </style>
</head>
<body>
  <article class="markdown-body">
      ${enhancedHtml}
  </article>
  <script>
      window.addEventListener('load', function () {
          if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
              window.MathJax.typesetPromise().catch(function (err) {
                  console.warn('MathJax typeset failed:', err);
              });
          }
      });
  </script>
</body>
</html>`;
      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
      saveAs(blob, "document.html");
    } catch (e) {
      console.error("HTML export failed:", e);
      alert("HTML export failed: " + e.message);
    }
  });

  // ============================================
  // Page-Break Detection Functions (Story 1.1)
  // ============================================

  const exportPageBreaks = window.registerMarkdownViewerExportPageBreaks(app, {});
  const PAGE_CONFIG = exportPageBreaks.PAGE_CONFIG;
  const identifyGraphicElements = exportPageBreaks.identifyGraphicElements;
  const calculateElementPositions = exportPageBreaks.calculateElementPositions;
  const calculatePageBoundaries = exportPageBreaks.calculatePageBoundaries;
  const detectSplitElements = exportPageBreaks.detectSplitElements;
  const analyzeGraphicsForPageBreaks = exportPageBreaks.analyzeGraphicsForPageBreaks;
  const PAGE_BREAK_THRESHOLD = exportPageBreaks.PAGE_BREAK_THRESHOLD;
  const categorizeBySize = exportPageBreaks.categorizeBySize;
  const insertPageBreaks = exportPageBreaks.insertPageBreaks;
  const applyPageBreaksWithCascade = exportPageBreaks.applyPageBreaksWithCascade;
  const MIN_SCALE_FACTOR = exportPageBreaks.MIN_SCALE_FACTOR;
  const calculateScaleFactor = exportPageBreaks.calculateScaleFactor;
  const applyGraphicScaling = exportPageBreaks.applyGraphicScaling;
  const handleOversizedElements = exportPageBreaks.handleOversizedElements;

  function waitForPdfExportLibraries(timeoutMs = 5000) {
    if (window.jspdf?.jsPDF && typeof window.html2canvas === "function") {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (window.jspdf?.jsPDF && typeof window.html2canvas === "function") {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          reject(new Error("PDF export libraries are still loading. Please try again in a moment."));
        }
      }, 50);
    });
  }

  exportPdf.addEventListener("click", async function () {
    try {
      const originalText = exportPdf.innerHTML;
      exportPdf.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
      exportPdf.disabled = true;
      await waitForPdfExportLibraries();

      const progressContainer = document.createElement('div');
      progressContainer.style.position = 'fixed';
      progressContainer.style.top = '50%';
      progressContainer.style.left = '50%';
      progressContainer.style.transform = 'translate(-50%, -50%)';
      progressContainer.style.padding = '15px 20px';
      progressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      progressContainer.style.color = 'white';
      progressContainer.style.borderRadius = '5px';
      progressContainer.style.zIndex = '9999';
      progressContainer.style.textAlign = 'center';

      const statusText = document.createElement('div');
      statusText.textContent = 'Generating PDF...';
      progressContainer.appendChild(statusText);
      document.body.appendChild(progressContainer);

      const markdown = getActiveEditorValue();
      const html = marked.parse(markdown);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container', 'svg', 'path', 'g', 'marker', 'defs', 'pattern', 'clipPath'],
        ADD_ATTR: ['id', 'class', 'style', 'viewBox', 'd', 'fill', 'stroke', 'transform', 'marker-end', 'marker-start']
      });

      const tempElement = document.createElement("div");
      tempElement.className = "markdown-body pdf-export";
      tempElement.innerHTML = sanitizedHtml;
      enhanceGitHubAlerts(tempElement);
      tempElement.style.padding = "20px";
      tempElement.style.width = "210mm";
      tempElement.style.margin = "0 auto";
      tempElement.style.fontSize = "14px";
      tempElement.style.position = "fixed";
      tempElement.style.left = "-9999px";
      tempElement.style.top = "0";

      const currentTheme = document.documentElement.getAttribute("data-theme");
      tempElement.style.backgroundColor = currentTheme === "dark" ? "#0d1117" : "#ffffff";
      tempElement.style.color = currentTheme === "dark" ? "#c9d1d9" : "#24292e";

      document.body.appendChild(tempElement);

      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        await mermaid.run({
          nodes: tempElement.querySelectorAll('.mermaid'),
          suppressErrors: true
        });
      } catch (mermaidError) {
        console.warn("Mermaid rendering issue:", mermaidError);
      }

      if (window.MathJax) {
        try {
          await MathJax.typesetPromise([tempElement]);
        } catch (mathJaxError) {
          console.warn("MathJax rendering issue:", mathJaxError);
        }

        // Hide MathJax assistive elements that cause duplicate text in PDF
        // These are screen reader elements that html2canvas captures as visible
        // Use multiple CSS properties to ensure html2canvas doesn't render them
        const assistiveElements = tempElement.querySelectorAll('mjx-assistive-mml');
        assistiveElements.forEach(el => {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.position = 'absolute';
          el.style.width = '0';
          el.style.height = '0';
          el.style.overflow = 'hidden';
          el.remove(); // Remove entirely from DOM
        });

        // Also hide any MathJax script elements that might contain source
        const mathScripts = tempElement.querySelectorAll('script[type*="math"], script[type*="tex"]');
        mathScripts.forEach(el => el.remove());
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Analyze and apply page-breaks for graphics (Story 1.1 + 1.2)
      const pageBreakAnalysis = applyPageBreaksWithCascade(tempElement, PAGE_CONFIG);

      // Scale oversized graphics that can't fit on a single page (Story 1.3)
      if (pageBreakAnalysis.oversizedElements && pageBreakAnalysis.pageHeightPx) {
        handleOversizedElements(pageBreakAnalysis.oversizedElements, pageBreakAnalysis.pageHeightPx);
      }

      const pdfOptions = {
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        hotfixes: ["px_scaling"]
      };

      const pdf = new jspdf.jsPDF(pdfOptions);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);

      const canvas = await html2canvas(tempElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: 1000,
        windowHeight: tempElement.scrollHeight
      });

      const scaleFactor = canvas.width / contentWidth;
      const imgHeight = canvas.height / scaleFactor;
      const pagesCount = Math.ceil(imgHeight / (pageHeight - margin * 2));

      for (let page = 0; page < pagesCount; page++) {
        if (page > 0) pdf.addPage();

        const sourceY = page * (pageHeight - margin * 2) * scaleFactor;
        const sourceHeight = Math.min(canvas.height - sourceY, (pageHeight - margin * 2) * scaleFactor);
        const destHeight = sourceHeight / scaleFactor;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;

        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

        const imgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, destHeight);
      }

      pdf.save("document.pdf");

      statusText.textContent = 'Download successful!';
      setTimeout(() => {
        document.body.removeChild(progressContainer);
      }, 1500);

      document.body.removeChild(tempElement);
      exportPdf.innerHTML = originalText;
      exportPdf.disabled = false;

    } catch (error) {
      console.error("PDF export failed:", error);
      alert("PDF export failed: " + error.message);
      exportPdf.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Export';
      exportPdf.disabled = false;

      const progressContainer = document.querySelector('div[style*="Preparing PDF"]');
      if (progressContainer) {
        document.body.removeChild(progressContainer);
      }
    }
  });

  clipboard.bindCopyMarkdownButton();

  function renderSharedMarkdownPreview(markdownText) {
    const source = String(markdownText || "");
    const parseMarkdown = typeof marked !== "undefined" && marked?.parse
      ? (markdown) => marked.parse(markdown)
      : (markdown) => `<pre>${escapeHtml(markdown)}</pre>`;
    const sanitizeHtml = typeof DOMPurify !== "undefined" && DOMPurify?.sanitize
      ? (html) => DOMPurify.sanitize(html, {
          ADD_TAGS: ["mjx-container"],
          ADD_ATTR: ["id", "class", "style"]
        })
      : (html) => html;
    const { frontmatter, frontmatterPrefix, body } = parseFrontmatter(source);
    const html = sanitizeHtml(
      (frontmatterPrefix ? parseMarkdown(frontmatterPrefix) : "") +
      (frontmatter ? renderFrontmatterTable(frontmatter) : "") +
      parseMarkdown(body)
    );

    markdownPreview.innerHTML = html;
    markdownPreview.dataset.previewCacheKey = "";
    enhanceWikiLinks(markdownPreview);
    enhancePreviewMarkdownImages(markdownPreview);
    annotatePreviewMarkdownLinks(markdownPreview);
    enhanceGitHubAlerts(markdownPreview);
    processEmojis(markdownPreview);
    initMermaid();

    try {
      const mermaidNodes = markdownPreview.querySelectorAll(".mermaid");
      if (mermaidNodes.length > 0 && typeof mermaid !== "undefined" && mermaid?.init) {
        Promise.resolve(mermaid.init(undefined, mermaidNodes))
          .then(() => addMermaidToolbars())
          .catch((error) => {
            console.warn("Mermaid rendering failed:", error);
            addMermaidToolbars();
          });
      }
    } catch (error) {
      console.warn("Mermaid rendering failed:", error);
    }

    if (window.MathJax?.typesetPromise) {
      try {
        window.MathJax.typesetPromise([markdownPreview]).catch((error) => {
          console.warn("MathJax typesetting failed:", error);
        });
      } catch (error) {
        console.warn("MathJax rendering failed:", error);
      }
    }

    updateDocumentStats();
  }

  window.registerMarkdownViewerShareUrl(app, {
    markdownEditor,
    mobileShareButton,
    renderEditorSyntaxHighlights,
    renderMarkdown: function() { return renderMarkdown(); },
    renderSharedMarkdown: renderSharedMarkdownPreview,
    saveCurrentTabState,
    shareButton
  });

  const droppedItems = window.registerMarkdownViewerDroppedItems(app, {
    get activeFolderName() { return activeFolderName; },
    set activeFolderName(value) { activeFolderName = value; },
    get activeFolderHandle() { return activeFolderHandle; },
    set activeFolderHandle(value) { activeFolderHandle = value; },
    get activeFolderPath() { return activeFolderPath; },
    set activeFolderPath(value) { activeFolderPath = value; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    set folderMarkdownFiles(value) { folderMarkdownFiles = value; },
    isTextDocumentPath,
    isTextFileLike,
    getFileName,
    fileContainsGraphDocument,
    sortFolderTreeNodes,
    openDocumentSourceFile,
    openFolderTreeFromNeutralinoPath,
    listMarkdownTree,
    collectMarkdownFilesFromTree,
    renderFolderLoadingState,
    renderFolderLoadingError,
    renderFolderTree,
    rememberRecentFolder,
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    alert
  });
  const handleDrop = droppedItems.handleDrop;

  const lowerPanelState = loadGlobalState();
  sidebarLowerPanelTabs = window.registerMarkdownViewerSidebarLowerPanelTabs(app, {
    host: sidebarDropzonePanel,
    resizer: sidebarDropzoneResizer,
    tabList: document.getElementById("sidebar-lower-tabs"),
    initialActiveViewId: lowerPanelState.sidebarLowerPanelActiveTab || "outline",
    saveGlobalState,
    restoreHeight: function() {
      applySidebarDropzoneHeight(loadGlobalState().sidebarDropzoneHeight, false);
    }
  });
  sidebarLowerPanelTabs.registerView({
    id: "dropzone",
    panel: document.getElementById("sidebar-lower-dropzone-view"),
    tab: document.getElementById("sidebar-lower-tab-dropzone"),
    enabled: lowerPanelState.sidebarDropzoneVisible !== false
  });
  const outlineDocumentSymbols = window.registerMarkdownViewerOutlineDocumentSymbols(app);
  const outlineSyntaxTree = window.registerMarkdownViewerOutlineSyntaxTree(app);
  const outlineLanguageDependencies = {
    syntaxTree: outlineSyntaxTree,
    getSyntaxTree: function() { return codeMirrorEditor?.getSyntaxTree?.() || null; },
    normalizeDocumentSymbols: outlineDocumentSymbols.normalize
  };
  const javaOutlineLanguage = window.registerMarkdownViewerJavaOutlineLanguage(app);
  const markdownOutlineLanguage = window.registerMarkdownViewerMarkdownOutlineLanguage(app, outlineLanguageDependencies);
  const jsonOutlineLanguage = window.registerMarkdownViewerJsonOutlineLanguage(app, outlineLanguageDependencies);
  const xmlOutlineLanguage = window.registerMarkdownViewerXmlOutlineLanguage(app, outlineLanguageDependencies);
  const cssOutlineLanguage = window.registerMarkdownViewerCssOutlineLanguage(app, outlineLanguageDependencies);
  const javaScriptOutlineLanguage = window.registerMarkdownViewerJavaScriptOutlineLanguage(app, outlineLanguageDependencies);
  const pythonOutlineLanguage = window.registerMarkdownViewerPythonOutlineLanguage(app, outlineLanguageDependencies);
  const yamlOutlineLanguage = window.registerMarkdownViewerYamlOutlineLanguage(app, outlineLanguageDependencies);
  const htmlOutlineLanguage = window.registerMarkdownViewerHtmlOutlineLanguage(app, outlineLanguageDependencies);
  const batchOutlineLanguage = window.registerMarkdownViewerBatchOutlineLanguage(app, outlineLanguageDependencies);
  outlinePanel = window.registerMarkdownViewerOutlinePanel(app, {
    lowerPanel: sidebarLowerPanelTabs,
    panel: document.getElementById("sidebar-outline-panel"),
    tab: document.getElementById("sidebar-lower-tab-outline"),
    body: document.getElementById("outline-body"),
    toggleButtons: toggleOutlinePanelButtons,
    languages: [
      javaOutlineLanguage,
      markdownOutlineLanguage,
      jsonOutlineLanguage,
      xmlOutlineLanguage,
      cssOutlineLanguage,
      javaScriptOutlineLanguage,
      pythonOutlineLanguage,
      yamlOutlineLanguage,
      htmlOutlineLanguage,
      batchOutlineLanguage
    ],
    initiallyVisible: lowerPanelState.outlinePanelVisible !== false,
    editor: markdownEditor,
    getActiveTab: function() { return tabs.find(function(tab) { return tab.id === activeTabId; }) || null; },
    getActiveEditor: function() { return activeEditorCommands.getActiveEditor(); },
    getActiveEditorValue: function() { return activeEditorCommands.getActiveEditorValue(); },
    getDocumentSymbols: function() { return codeMirrorEditor?.getDocumentSymbols?.() || Promise.resolve([]); }
  });
  const initialLowerPanelView = lowerPanelState.sidebarLowerPanelActiveTab || "outline";
  if (!sidebarLowerPanelTabs.activate(initialLowerPanelView, { persist: false })) sidebarLowerPanelTabs.sync();
  const initialOutlineTab = tabs.find(function(tab) { return tab.id === activeTabId; }) || null;
  if (outlinePanel.isVisible() && outlinePanel.supports(initialOutlineTab)) {
    sidebarLowerPanelTabs.activate("outline", { persist: false });
  }
  void outlinePanel.refresh(initialOutlineTab);

  window.registerMarkdownViewerDragDrop(app, {
    dropzone,
    handleDrop
  }).bindDropzone();
  dropzone.addEventListener("click", function (e) {
    if (e.target !== closeDropzoneBtn && !closeDropzoneBtn.contains(e.target)) {
      openDocumentFileFromPicker();
    }
  });
  closeDropzoneBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    if (sidebarLowerPanelTabs.getActiveViewId() === "outline") outlinePanel.setVisible(false);
    else hideSidebarDropzone();
  });
  toggleDropzonePanelButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebarDropzone();
    });
  });
  toggleSidebarButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  });
  toggleStatusBarButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleStatusBar();
    });
  });
  updateDropzoneToggleButtons();
  updateSidebarToggleButtons();
  updateStatusBarToggleButtons();

  const keyboardShortcuts = window.registerMarkdownViewerKeyboardShortcuts(app, {
    keyboardShortcutOverrides: loadGlobalState().keyboardShortcutOverrides,
    closeGraphComparisonDetailsModal,
    closeMermaidModal,
    closeTab,
    canReloadActiveTabFromDisk,
    copyMarkdownButton,
    graphViewCanvas,
    getActiveTabId: function() { return activeTabId; },
    getActiveTabType: function() {
      return tabs.find((tab) => tab.id === activeTabId)?.type || "";
    },
    getCurrentViewMode: function() { return currentViewMode; },
    hideGraphStaleModal,
    goToEditorLinePrompt,
    isActiveEditorFocused: function() {
      return codeMirrorEditor?.isFocused ? codeMirrorEditor.isFocused() : activeEditorCommands.isActiveEditorFocused();
    },
    markdownEditor,
    newTab,
    openEditorFindReplaceModal,
    openGraphFindDialog,
    openFindInFilesModal,
    openFileByNameModal,
    toggleFindInFilesResultsPanel,
    toggleProblemsPanel: function() {
      if (bottomPanelTabs?.isPanelVisible?.() && bottomPanelTabs?.getActiveTabId?.() === "problems") {
        return bottomPanelTabs.hidePanel?.();
      }
      return problemsPanel?.show?.();
    },
    toggleTasksPanel: function() { return tasksPanel?.toggle?.(); },
    openWorkspaceSearchModal,
    reloadActiveTabFromDisk,
    resetZoom: viewWindowControls.resetZoom,
    saveCurrentFileIfChanged,
    toggleFullscreen: viewWindowControls.toggleFullscreen,
    zoomIn: viewWindowControls.zoomIn,
    zoomOut: viewWindowControls.zoomOut,
    toggleSyncScrolling
  });
  keyboardShortcutsSettings = window.createMarkdownViewerKeyboardShortcutsSettings?.({
    root: document,
    shortcuts: keyboardShortcuts
  }) || null;
  if (settingsModal?.style.display !== "none") keyboardShortcutsSettings?.open?.(loadGlobalState().keyboardShortcutOverrides);

  document.getElementById('tab-reset-btn').addEventListener('click', function() {
    resetAllTabs();
  });

  startupPerf?.mark?.("workspace ready mark requested");
  startupPerf?.flushToAppDebug?.(appDebugLog);
  window.markdownViewerBootScreen?.markReady?.("workspace-ready");
  window.setTimeout(function() {
    void app.modules?.desktopTerminal?.restoreTerminalsFromPreferences?.();
  }, 0);
  window.setTimeout(function() {
    void restoreLastFolderOnStartupInBackground();
  }, 0);
  window.setTimeout(loadDeferredCodeMirrorBundle, 0);
  window.setTimeout(function() {
    void loadDeferredPreviewEnhancementVendors();
  }, 0);
}

if (window.markdownViewerStartupErrors?.guardStartup) {
  window.markdownViewerStartupErrors.guardStartup(startMarkdownViewer);
} else {
  document.addEventListener("DOMContentLoaded", function() {
    startMarkdownViewer().catch(function(error) {
      console.error("[md-editor] Startup failed", error);
      window.markdownViewerBootScreen?.markFailed?.(error);
      alert("MD-Editor could not launch. Check the console for startup error details.");
    });
  });
}
})();
