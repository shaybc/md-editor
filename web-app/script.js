document.addEventListener("DOMContentLoaded", function () {
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
  let selectedFolderTreeTags = new Set();
  let currentFolderSortMode = "name-asc";
  let showUnsupportedFolderFiles = false;
  let isFolderOpen = false;

  const markdownEditor = document.getElementById("markdown-editor");
  const editorLineNumbers = document.getElementById("editor-line-numbers");
  const editorCurrentLine = document.getElementById("editor-current-line");
  const editorSelectionHighlights = document.getElementById("editor-selection-highlights");
  const editorSyntaxHighlight = document.getElementById("editor-syntax-highlight");
  const markdownPreview = document.getElementById("markdown-preview");
  const appHeader = document.querySelector(".app-header");
  const headerFolderIdentity = document.getElementById("header-folder-identity");
  const headerFolderNameButton = document.getElementById("header-folder-name");
  const headerFolderPathButton = document.getElementById("header-folder-path");
  const headerBrandLeft = document.getElementById("header-brand-left");
  const headerBrandRight = document.getElementById("header-brand-right");
  const themeToggle = document.getElementById("theme-toggle");
  const restoreDefaultsButtons = document.querySelectorAll(".restore-defaults-button");
  const importFromFileButtons = document.querySelectorAll("#import-from-file");
  const newDocumentButtons = document.querySelectorAll(".new-document-button");
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
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");
  let shownFolderInputFallbackNotice = false;
  const exportMd = document.getElementById("export-md");
  const exportHtml = document.getElementById("export-html");
  const exportPdf = document.getElementById("export-pdf");
  const copyMarkdownButton = document.getElementById("copy-markdown-button");
  const dropzone = document.getElementById("dropzone");
  const closeDropzoneBtn = document.getElementById("close-dropzone");
  const syncToggleButtons = document.querySelectorAll(".sync-toggle-button");
  const editorPane = document.getElementById("markdown-editor");
  const previewPane = document.querySelector(".preview-pane");
  const readingTimeElement = document.getElementById("reading-time");
  const wordCountElement = document.getElementById("word-count");
  const charCountElement = document.getElementById("char-count");
  const statusTipElement = document.getElementById("status-tip");
  const graphZoomStatusElement = document.getElementById("graph-zoom-status");
  const graphZoomPercentElement = document.getElementById("graph-zoom-percent");
  const graphPointsStatusElement = document.getElementById("graph-points-status");
  const graphPointsCountElement = document.getElementById("graph-points-count");
  const graphCollapsedNodesStatusElement = document.getElementById("graph-collapsed-nodes-status");
  const graphEdgesCountElement = document.getElementById("graph-edges-count");
  const graphClustersCountElement = document.getElementById("graph-clusters-count");
  const graphClustersLabelElement = document.getElementById("graph-clusters-label");
  const graphCollapsedNodesCountElement = document.getElementById("graph-collapsed-nodes-count");
  const graphSelectedNodesStatusElement = document.getElementById("graph-selected-nodes-status");
  const graphSelectedNodesCountElement = document.getElementById("graph-selected-nodes-count");
  const appStatusLineElement = document.querySelector(".app-status-line");
  const folderFileCountElement = document.getElementById("folder-file-count");
  const folderDirectoryCountElement = document.getElementById("folder-directory-count");
  const editorTextpadStatusElement = document.getElementById("editor-textpad-status");
  const editorTotalLengthElement = document.getElementById("editor-total-length");
  const editorTotalLinesElement = document.getElementById("editor-total-lines");
  const editorCursorLineElement = document.getElementById("editor-cursor-line");
  const editorCursorColumnElement = document.getElementById("editor-cursor-column");
  const editorPositionLabelElement = document.getElementById("editor-position-label");
  const editorPositionValueElement = document.getElementById("editor-position-value");
  const editorFormattingToolbarButtons = document.querySelectorAll(".editor-formatting-toolbar [data-editor-format-action]");
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
  const editorFindReplaceModal = document.getElementById("editor-find-replace-modal");
  const editorFindReplaceCloseButton = document.getElementById("editor-find-replace-close");
  const editorFindReplaceCancelButton = document.getElementById("editor-find-replace-cancel");
  const editorFindInput = document.getElementById("editor-find-input");
  const editorReplaceInput = document.getElementById("editor-replace-input");
  const editorFindReplaceStatus = document.getElementById("editor-find-replace-status");
  const editorFindPrevButton = document.getElementById("editor-find-prev");
  const editorFindNextButton = document.getElementById("editor-find-next");
  const editorReplaceOneButton = document.getElementById("editor-replace-one");
  const editorReplaceAllButton = document.getElementById("editor-replace-all");
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
  const editorSymbols = [
    { group: "Common Symbols", symbol: "©", entity: "&copy;", keywords: "copyright c" },
    { group: "Common Symbols", symbol: "®", entity: "&reg;", keywords: "registered trademark r" },
    { group: "Common Symbols", symbol: "™", entity: "&trade;", keywords: "trademark tm" },
    { group: "Common Symbols", symbol: "✓", entity: "&check;", keywords: "check tick done" },
    { group: "Common Symbols", symbol: "★", entity: "&star;", keywords: "star favorite" },
    { group: "Common Symbols", symbol: "•", entity: "&bull;", keywords: "bullet dot" },
    { group: "Common Symbols", symbol: "…", entity: "&hellip;", keywords: "ellipsis dots" },
    { group: "Common Symbols", symbol: "—", entity: "&mdash;", keywords: "em dash long dash" },
    { group: "Common Symbols", symbol: "–", entity: "&ndash;", keywords: "en dash" },
    { group: "Common Symbols", symbol: "→", entity: "&rarr;", keywords: "right arrow" },
    { group: "Common Symbols", symbol: "←", entity: "&larr;", keywords: "left arrow" },
    { group: "Common Symbols", symbol: "↑", entity: "&uarr;", keywords: "up arrow" },
    { group: "Common Symbols", symbol: "↓", entity: "&darr;", keywords: "down arrow" },
    { group: "HTML Entities", symbol: "€", entity: "&euro;", keywords: "euro currency" },
    { group: "HTML Entities", symbol: "£", entity: "&pound;", keywords: "pound currency" },
    { group: "HTML Entities", symbol: "¥", entity: "&yen;", keywords: "yen currency" },
    { group: "HTML Entities", symbol: "§", entity: "&sect;", keywords: "section" },
    { group: "HTML Entities", symbol: "°", entity: "&deg;", keywords: "degree" },
    { group: "HTML Entities", symbol: "±", entity: "&plusmn;", keywords: "plus minus" },
    { group: "HTML Entities", symbol: "×", entity: "&times;", keywords: "multiply times" },
    { group: "HTML Entities", symbol: "÷", entity: "&divide;", keywords: "divide division" },
    { group: "HTML Entities", symbol: "≠", entity: "&ne;", keywords: "not equal" },
    { group: "HTML Entities", symbol: "<", entity: "&lt;", keywords: "less than angle bracket" },
    { group: "HTML Entities", symbol: ">", entity: "&gt;", keywords: "greater than angle bracket" },
    { group: "HTML Entities", symbol: "&", entity: "&amp;", keywords: "ampersand and" },
    { group: "HTML Entities", symbol: "\"", entity: "&quot;", keywords: "quote quotation" },
    { group: "HTML Entities", symbol: "'", entity: "&apos;", keywords: "apostrophe quote" },
    { group: "HTML Entities", symbol: " ", entity: "&nbsp;", keywords: "non breaking space nbsp" },
    { group: "Greek Letters", symbol: "α", entity: "&alpha;", keywords: "alpha greek" },
    { group: "Greek Letters", symbol: "β", entity: "&beta;", keywords: "beta greek" },
    { group: "Greek Letters", symbol: "γ", entity: "&gamma;", keywords: "gamma greek" },
    { group: "Greek Letters", symbol: "δ", entity: "&delta;", keywords: "delta greek" },
    { group: "Greek Letters", symbol: "π", entity: "&pi;", keywords: "pi greek" },
    { group: "Greek Letters", symbol: "Ω", entity: "&Omega;", keywords: "omega greek" }
  ];
  const editorEmojis = [
    { emoji: "👎", shortcode: ":-1:", keywords: "thumbs down no dislike" },
    { emoji: "👍", shortcode: ":+1:", keywords: "thumbs up yes like" },
    { emoji: "💯", shortcode: ":100:", keywords: "hundred score perfect" },
    { emoji: "🔢", shortcode: ":1234:", keywords: "numbers input" },
    { emoji: "🥇", shortcode: ":1st_place_medal:", keywords: "gold medal first" },
    { emoji: "🥈", shortcode: ":2nd_place_medal:", keywords: "silver medal second" },
    { emoji: "🥉", shortcode: ":3rd_place_medal:", keywords: "bronze medal third" },
    { emoji: "🎱", shortcode: ":8ball:", keywords: "pool billiards" },
    { emoji: "🅰️", shortcode: ":a:", keywords: "letter a blood type" },
    { emoji: "🆎", shortcode: ":ab:", keywords: "letter ab blood type" },
    { emoji: "🔤", shortcode: ":abc:", keywords: "letters alphabet" },
    { emoji: "🔡", shortcode: ":abcd:", keywords: "letters alphabet" },
    { emoji: "🉑", shortcode: ":accept:", keywords: "accept japanese" },
    { emoji: "♿", shortcode: ":accessibility:", keywords: "wheelchair access" },
    { emoji: "🪗", shortcode: ":accordion:", keywords: "music instrument" },
    { emoji: "🩹", shortcode: ":adhesive_bandage:", keywords: "bandage medical" },
    { emoji: "🧑", shortcode: ":adult:", keywords: "person adult" },
    { emoji: "🚡", shortcode: ":aerial_tramway:", keywords: "tram cable car" },
    { emoji: "🇦🇫", shortcode: ":afghanistan:", keywords: "flag afghanistan" },
    { emoji: "✈️", shortcode: ":airplane:", keywords: "plane travel" },
    { emoji: "⏰", shortcode: ":alarm_clock:", keywords: "alarm clock time" },
    { emoji: "⚗️", shortcode: ":alembic:", keywords: "science chemistry" },
    { emoji: "👽", shortcode: ":alien:", keywords: "alien ufo" },
    { emoji: "🚑", shortcode: ":ambulance:", keywords: "medical emergency" },
    { emoji: "⚓", shortcode: ":anchor:", keywords: "ship nautical" },
    { emoji: "😇", shortcode: ":angel:", keywords: "smile halo" },
    { emoji: "💢", shortcode: ":anger:", keywords: "angry mad" },
    { emoji: "😠", shortcode: ":angry:", keywords: "angry mad" },
    { emoji: "🐜", shortcode: ":ant:", keywords: "bug insect" },
    { emoji: "🍎", shortcode: ":apple:", keywords: "fruit red" },
    { emoji: "♈", shortcode: ":aries:", keywords: "zodiac" },
    { emoji: "◀️", shortcode: ":arrow_backward:", keywords: "arrow left" },
    { emoji: "⏬", shortcode: ":arrow_double_down:", keywords: "arrow down" },
    { emoji: "⏫", shortcode: ":arrow_double_up:", keywords: "arrow up" },
    { emoji: "⬇️", shortcode: ":arrow_down:", keywords: "arrow down" },
    { emoji: "➡️", shortcode: ":arrow_forward:", keywords: "arrow right" },
    { emoji: "⬅️", shortcode: ":arrow_left:", keywords: "arrow left" },
    { emoji: "↘️", shortcode: ":arrow_lower_right:", keywords: "arrow down right" },
    { emoji: "↙️", shortcode: ":arrow_lower_left:", keywords: "arrow down left" },
    { emoji: "➡️", shortcode: ":arrow_right:", keywords: "arrow right" },
    { emoji: "⬆️", shortcode: ":arrow_up:", keywords: "arrow up" },
    { emoji: "😊", shortcode: ":blush:", keywords: "smile happy" },
    { emoji: "🎉", shortcode: ":tada:", keywords: "party celebration" },
    { emoji: "❤️", shortcode: ":heart:", keywords: "love heart" },
    { emoji: "🔥", shortcode: ":fire:", keywords: "hot flame" },
    { emoji: "🚀", shortcode: ":rocket:", keywords: "ship launch" },
    { emoji: "✅", shortcode: ":white_check_mark:", keywords: "check done success" },
    { emoji: "❌", shortcode: ":x:", keywords: "cross fail no" },
    { emoji: "⚠️", shortcode: ":warning:", keywords: "warning caution" },
    { emoji: "💡", shortcode: ":bulb:", keywords: "idea light" },
    { emoji: "📌", shortcode: ":pushpin:", keywords: "pin note" },
    { emoji: "🐛", shortcode: ":bug:", keywords: "bug issue" }
  ];

  const clipboard = window.registerMarkdownViewerClipboard(app, {
    copyMarkdownButton,
    getMarkdownText: function() { return markdownEditor.value; }
  });
  const copyToClipboard = clipboard.copyToClipboard;
  const showCopiedMessage = clipboard.showCopiedMessage;

  Object.assign(app.constants, {
    RENDER_DELAY,
    SCROLL_SYNC_DELAY
  });

  Object.assign(app.dom, {
    markdownEditor,
    editorLineNumbers,
    editorCurrentLine,
    editorSelectionHighlights,
    editorSyntaxHighlight,
    markdownPreview,
    themeToggle,
    restoreDefaultsButtons,
    importFromFileButtons,
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
    charCountElement,
    statusTipElement,
    graphZoomStatusElement,
    graphZoomPercentElement,
    graphPointsStatusElement,
    graphPointsCountElement,
    graphEdgesCountElement,
    graphSelectedNodesStatusElement,
    graphSelectedNodesCountElement,
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
    folderTreeFilterText: { get: () => folderTreeFilterText, set: (value) => { folderTreeFilterText = value; }, configurable: true },
    selectedFolderTreeTags: { get: () => selectedFolderTreeTags, set: (value) => { selectedFolderTreeTags = value; }, configurable: true },
    currentFolderSortMode: { get: () => currentFolderSortMode, set: (value) => { currentFolderSortMode = value; }, configurable: true },
    showUnsupportedFolderFiles: { get: () => showUnsupportedFolderFiles, set: (value) => { showUnsupportedFolderFiles = value; }, configurable: true },
    isFolderOpen: { get: () => isFolderOpen, set: (value) => { isFolderOpen = value; }, configurable: true },
    shownFolderInputFallbackNotice: { get: () => shownFolderInputFallbackNotice, set: (value) => { shownFolderInputFallbackNotice = value; }, configurable: true },
    previewHoveredLinkUrl: { get: () => previewHoveredLinkUrl, set: (value) => { previewHoveredLinkUrl = value; }, configurable: true }
  });

  const frontmatterRenderer = window.registerMarkdownViewerFrontmatter(app, {
    jsyaml
  });
  const {
    parseFrontmatter,
    renderFrontmatterValue,
    renderFrontmatterTable,
    escapeHtml
  } = frontmatterRenderer;

  const fileTypes = window.registerMarkdownViewerFileTypes(app, {
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
    getSuggestedMarkdownFileName,
    joinPath,
    isMarkdownPath,
    getFileName
  } = fileTypes;

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
    looksLikeGraphDocument,
    isMarkdownPath,
    get listMarkdownTreeNeutralino() { return listMarkdownTreeNeutralino; },
    get collectMarkdownFilesFromTreeNeutralino() { return collectMarkdownFilesFromTreeNeutralino; },
    get renderFolderTree() { return renderFolderTree; },
    get renderFolderLoadingState() { return renderFolderLoadingState; },
    get renderFolderLoadingError() { return renderFolderLoadingError; },
    get rememberRecentFolder() { return rememberRecentFolder; },
    get openSidebarFileInPermanentTab() { return openSidebarFileInPermanentTab; },
    get rememberRecentFile() { return rememberRecentFile; },
    get openSavedGraphDocument() { return openSavedGraphDocument; },
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    alert
  });
  const openFolderTreeFromNeutralinoPath = fileOpen.openFolderTreeFromNeutralinoPath;
  const openMarkdownSourceFile = fileOpen.openMarkdownSourceFile;
  const readOpenFileSourceContent = fileOpen.readOpenFileSourceContent;
  const openDocumentSourceFile = fileOpen.openDocumentSourceFile;
  const openDocumentFileFromPicker = fileOpen.openDocumentFileFromPicker;
  const importDocumentFile = fileOpen.importDocumentFile;

  const markdownLinks = window.registerMarkdownViewerMarkdownLinks(app, {
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get tabs() { return tabs; },
    get markdownPreview() { return markdownPreview; },
    get previewHoveredLinkUrl() { return previewHoveredLinkUrl; },
    set previewHoveredLinkUrl(value) { previewHoveredLinkUrl = value; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    getFileName,
    get getActiveMarkdownTab() { return getActiveMarkdownTab; },
    get findTabForSourceFile() { return findTabForSourceFile; },
    get switchTab() { return switchTab; },
    get pinTemporaryTab() { return pinTemporaryTab; },
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    get newTab() { return newTab; },
    fetchBundledWikiMarkdown,
    getMarkdownTitleFromFileName,
    joinPath,
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
  const autocomplete = window.registerMarkdownViewerAutocomplete(app, {
    markdownEditor,
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
  const editorContextMenu = window.registerMarkdownViewerEditorContextMenu(app, {
    markdownEditor,
    escapeHtml,
    getActiveTabId: function() { return activeTabId; },
    getEditorInputEventCount: function() { return editorInputEventCount; },
    hideLinkAutocomplete,
    updateEditorLineNumbers: function() { updateEditorLineNumbers(); },
    updateEditorSelectionHighlights: function() { updateEditorSelectionHighlights(); },
    updateStatusLine: function() { updateStatusLine(); }
  });
  const hideEditorContextMenu = editorContextMenu.hideEditorContextMenu;
  const handleEditorContextMenu = editorContextMenu.handleEditorContextMenu;
  const redoEditorContextMenuConversion = editorContextMenu.redoEditorContextMenuConversion;
  const undoEditorContextMenuConversion = editorContextMenu.undoEditorContextMenuConversion;
  function runNativeEditorHistoryCommand(command) {
    markdownEditor.focus();
    try {
      return document.execCommand(command);
    } catch (_) {
      return false;
    }
  }
  function undoEditorToolbarAction() {
    if (runNativeEditorHistoryCommand("undo")) return;
    undoEditorContextMenuConversion();
  }
  function redoEditorToolbarAction() {
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
    const start = Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    const end = Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    if (start === end) {
      markdownEditor.focus();
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
    markdownEditor.focus();
  }
  function applyEditorClearMarkdownModal() {
    if (!editorClearMarkdownSelection) return;
    const selectedText = markdownEditor.value.slice(editorClearMarkdownSelection.start, editorClearMarkdownSelection.end);
    markdownEditor.focus();
    markdownEditor.selectionStart = editorClearMarkdownSelection.start;
    markdownEditor.selectionEnd = editorClearMarkdownSelection.end;
    editorContextMenu.replaceSelectionWithText(stripMarkdownFormatting(selectedText));
    closeEditorClearMarkdownModal();
  }
  function getEditorFindQuery() {
    return String(editorFindInput?.value || "");
  }
  function collectEditorFindMatches(query) {
    const matches = [];
    if (!query) return matches;
    const value = markdownEditor.value;
    let index = value.indexOf(query);
    while (index >= 0) {
      matches.push({ start: index, end: index + query.length });
      index = value.indexOf(query, index + Math.max(query.length, 1));
    }
    return matches;
  }
  function updateEditorFindReplaceStatus() {
    if (!editorFindReplaceStatus) return;
    if (!getEditorFindQuery()) {
      editorFindReplaceStatus.textContent = "0 matches";
      return;
    }
    if (!editorFindMatches.length) {
      editorFindReplaceStatus.textContent = "0 matches";
      return;
    }
    editorFindReplaceStatus.textContent = `${editorFindCurrentIndex + 1} of ${editorFindMatches.length} matches`;
  }
  function selectEditorFindMatch(index) {
    if (!editorFindMatches.length) {
      editorFindCurrentIndex = -1;
      updateEditorFindReplaceStatus();
      return;
    }
    editorFindCurrentIndex = (index + editorFindMatches.length) % editorFindMatches.length;
    const match = editorFindMatches[editorFindCurrentIndex];
    markdownEditor.focus();
    markdownEditor.selectionStart = match.start;
    markdownEditor.selectionEnd = match.end;
    markdownEditor.scrollIntoView({ block: "nearest" });
    updateEditorFindReplaceStatus();
  }
  function refreshEditorFindMatches(options = {}) {
    const query = getEditorFindQuery();
    const previousStart = editorFindMatches[editorFindCurrentIndex]?.start ?? markdownEditor.selectionStart ?? 0;
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
  function openEditorFindReplaceModal() {
    if (!editorFindReplaceModal) return;
    const selectedText = getSelectedEditorText();
    if (editorFindInput) editorFindInput.value = selectedText;
    if (editorReplaceInput) editorReplaceInput.value = "";
    editorFindReplaceModal.style.display = "flex";
    refreshEditorFindMatches({ select: !!selectedText });
    window.setTimeout(function() {
      editorFindInput?.focus();
      editorFindInput?.select();
    }, 0);
  }
  function closeEditorFindReplaceModal() {
    if (!editorFindReplaceModal) return;
    editorFindReplaceModal.style.display = "none";
    markdownEditor.focus();
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
    if (!editorFindMatches.length) refreshEditorFindMatches();
    const match = editorFindMatches[editorFindCurrentIndex];
    if (!match) return;
    markdownEditor.focus();
    markdownEditor.selectionStart = match.start;
    markdownEditor.selectionEnd = match.end;
    editorContextMenu.replaceSelectionWithText(editorReplaceInput?.value || "");
    refreshEditorFindMatches();
  }
  function replaceAllEditorFindMatches() {
    const query = getEditorFindQuery();
    if (!query) {
      editorFindInput?.focus();
      return;
    }
    const replacement = editorReplaceInput?.value || "";
    const value = markdownEditor.value;
    if (!value.includes(query)) {
      refreshEditorFindMatches({ select: false });
      return;
    }
    markdownEditor.focus();
    markdownEditor.selectionStart = 0;
    markdownEditor.selectionEnd = value.length;
    editorContextMenu.replaceSelectionWithText(value.split(query).join(replacement));
    refreshEditorFindMatches({ select: false });
  }
  function getSelectedEditorText() {
    const selectionStart = Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    const selectionEnd = Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    return markdownEditor.value.slice(selectionStart, selectionEnd);
  }
  function openEditorLinkModal() {
    if (!editorLinkModal) return;
    editorLinkSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
  }
  function applyEditorLinkModal() {
    if (!editorLinkSelection) return;
    const url = editorLinkUrlInput.value.trim();
    const linkText = editorLinkTextInput.value || url;
    if (!url) {
      editorLinkUrlInput.focus();
      return;
    }
    markdownEditor.focus();
    markdownEditor.selectionStart = editorLinkSelection.start;
    markdownEditor.selectionEnd = editorLinkSelection.end;
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
    editorReferenceSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
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

    const value = markdownEditor.value;
    const selectedText = value.slice(editorReferenceSelection.start, editorReferenceSelection.end);
    const inlineReference = `${selectedText}${referenceNumber}`;
    const trailingContent = value.slice(editorReferenceSelection.end);
    const definition = getEditorReferenceDefinition(referenceNumber, url, editorReferenceTitleInput.value);
    const separator = value.trimEnd() ? "\n\n" : "";
    const replacement = `${inlineReference}${trailingContent}${separator}${definition}`;

    markdownEditor.focus();
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
    editorImageSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
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

    markdownEditor.focus();
    markdownEditor.selectionStart = editorImageSelection.start;
    markdownEditor.selectionEnd = editorImageSelection.end;
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
    editorAlertSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
  }
  function applyEditorAlertModal() {
    if (!editorAlertSelection) return;
    const selectedText = markdownEditor.value.slice(editorAlertSelection.start, editorAlertSelection.end);
    markdownEditor.focus();
    markdownEditor.selectionStart = editorAlertSelection.start;
    markdownEditor.selectionEnd = editorAlertSelection.end;
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
    editorSymbolSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
  }
  function applyEditorSymbolModal() {
    if (!editorSymbolSelection || !editorSelectedSymbolEntity) return;
    markdownEditor.focus();
    markdownEditor.selectionStart = editorSymbolSelection.start;
    markdownEditor.selectionEnd = editorSymbolSelection.end;
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
    editorEmojiSelection = {
      start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
      end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
    };
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
    markdownEditor.focus();
  }
  function applyEditorEmojiModal() {
    if (!editorEmojiSelection || !editorSelectedEmojiShortcode) return;
    markdownEditor.focus();
    markdownEditor.selectionStart = editorEmojiSelection.start;
    markdownEditor.selectionEnd = editorEmojiSelection.end;
    editorContextMenu.replaceSelectionWithText(editorSelectedEmojiShortcode);
    closeEditorEmojiModal();
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
        openEditorFindReplaceModal();
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
  const editorLineStatus = window.registerMarkdownViewerEditorLineStatus(app, {
    markdownEditor,
    editorLineNumbers,
    editorCurrentLine,
    editorSelectionHighlights,
    escapeHtml
  });
  const getEditorLineHeight = editorLineStatus.getEditorLineHeight;
  const updateEditorLineNumbers = editorLineStatus.updateEditorLineNumbers;
  const scheduleEditorLineNumbersUpdate = editorLineStatus.scheduleEditorLineNumbersUpdate;
  const updateEditorSelectionHighlights = editorLineStatus.updateEditorSelectionHighlights;
  const syncEditorSelectionHighlightsScroll = editorLineStatus.syncEditorSelectionHighlightsScroll;
  const syncEditorLineNumberScroll = editorLineStatus.syncEditorLineNumberScroll;

  const recentItems = window.registerMarkdownViewerRecentItems(app, {
    applyGlobalPreferences: function(state) { return applyGlobalPreferences(state); },
    escapeHtml,
    getFileName,
    getMaxRecentFiles: function() { return getMaxRecentFiles(); },
    getMaxRecentFolders: function() { return getMaxRecentFolders(); },
    globalStateKey: "markdownViewerGlobalState",
    loadGlobalState: function() { return loadGlobalState(); }
  });
  const isNeutralinoRuntime = recentItems.isNeutralinoRuntime;
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
    isGraphFilePath,
    get findGraphTabForSourceFile() { return findGraphTabForSourceFile; },
    get findTabForSourceFile() { return findTabForSourceFile; },
    get switchTab() { return switchTab; },
    get pinTemporaryTab() { return pinTemporaryTab; },
    rememberRecentFile,
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
    alert
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
      <div id="folder-tree-root" class="folder-tree-root">
        ${getClosedFolderPlaceholder()}
      </div>
      <div class="sidebar-dropzone-resizer" id="sidebar-dropzone-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize sidebar dropzone" tabindex="0"></div>
      <div class="sidebar-dropzone-panel">
        <div id="dropzone" class="dropzone">
          <button id="close-dropzone" class="close-btn" title="Close dropzone">
            <i class="bi bi-x-lg"></i>
          </button>
          <p class="mb-0"><i class="bi bi-cloud-arrow-up me-2"></i>Drop a Markdown file, graph file, or folder here, or click to browse</p>
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
  hydrateRecentItemsFromProfile();
  hydrateGlobalStateFromProfile();
  hydrateRecentHandlesFromIndexedDB();
  const sidebarDropzonePanel = document.querySelector(".sidebar-dropzone-panel");
  const sidebarDropzoneResizer = document.getElementById("sidebar-dropzone-resizer");
  const sidebarWidthResizer = document.getElementById("sidebar-width-resizer");
  const toggleDropzonePanelButtons = document.querySelectorAll(".toggle-dropzone-panel");
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
    get getFolderTreeChildrenContainer() { return getFolderTreeChildrenContainer; },
    get resetFolderTreeAnimation() { return resetFolderTreeAnimation; },
    get renderFolderTree() { return renderFolderTree; },
    get renderTagManagementList() { return renderTagManagementList; },
    get saveGlobalState() { return saveGlobalState; },
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get getActiveGraphTab() { return getActiveGraphTab; },
    get renderGraphView() { return renderGraphView; },
    get closeMobileMenu() { return closeMobileMenu; },
    get createTag() { return createTag; },
    get deleteTag() { return deleteTag; }
  });
  const {
    getComparableFilePath,
    getTabTreeFileCandidates,
    updateAutoSelectFileButtons,
    hasCollapsedFolderTreeDetails,
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
    button.addEventListener("click", function() {
      if (!isFolderOpen) return;
      setAllFolderTreeDetails(hasCollapsedFolderTreeDetails());
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
      folderTreeFilterInput.value = "";
      renderFilteredFolderTree();
    });
  });

  if (folderTreeFilterInput) {
    folderTreeFilterInput.addEventListener("input", function() {
      folderTreeFilterText = folderTreeFilterInput.value;
      renderFilteredFolderTree();
      updateFolderTreeFilterControls();
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
  let resizePointerOffset = 0;
  let editorWidthPercent = 50; // Default 50%
  const MIN_PANE_PERCENT = 20; // Minimum 20% width
  const MIN_SIDEBAR_PANEL_HEIGHT = 120;
  const DEFAULT_SIDEBAR_WIDTH = 280;
  const MIN_SIDEBAR_WIDTH = 160;
  const MIN_EDITOR_WORKSPACE_WIDTH = 320;
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
    get isSidebarWidthResizing() { return isSidebarWidthResizing; },
    set isSidebarWidthResizing(value) { isSidebarWidthResizing = value; },
    get isSidebarDropzoneResizing() { return isSidebarDropzoneResizing; },
    set isSidebarDropzoneResizing(value) { isSidebarDropzoneResizing = value; },
    contentContainer,
    viewModeButtons,
    mobileViewModeButtons,
    syncToggleButtons,
    resizeDivider,
    sidebarDropzoneResizer,
    sidebarWidthResizer,
    appStatusLineElement,
    folderTreePane,
    sidebarDropzonePanel,
    editorPaneElement,
    previewPaneElement,
    MIN_SIDEBAR_WIDTH,
    MIN_EDITOR_WORKSPACE_WIDTH,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_PANEL_HEIGHT,
    MIN_PANE_PERCENT,
    get getActiveTab() { return getActiveTab; },
    get isUnsupportedFileTab() { return isUnsupportedFileTab; },
    get getAllowedViewModeForActiveTab() { return getAllowedViewModeForActiveTab; },
    get saveGlobalState() { return saveGlobalState; },
    renderMarkdown: function() { return renderMarkdown(); },
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
  const aboutModal = document.getElementById("about-modal");
  const aboutModalClose = document.getElementById("about-modal-close");
  const settingsModal = document.getElementById("settings-modal");
  const settingsGraphAutoClusterThresholdInput = document.getElementById("settings-graph-auto-cluster-threshold");
  const settingsGraphAutoClusterLargeMapsInput = document.getElementById("settings-graph-auto-cluster-large-maps");
  const settingsGraphLargeHoverDimInput = document.getElementById("settings-graph-large-hover-dim");
  const settingsGraphLargeHoverLabelsInput = document.getElementById("settings-graph-large-hover-labels");
  const settingsGraphLargeHoverLinesInput = document.getElementById("settings-graph-large-hover-lines");
  const settingsGraphRenderWarningThresholdInput = document.getElementById("settings-graph-render-warning-threshold");
  const settingsGraphMostReferencedPercentInput = document.getElementById("settings-graph-most-referenced-percent");
  const settingsGraphShowFileExtensionsInput = document.getElementById("settings-graph-show-file-extensions");
  const settingsGraphNodeDefaultColorInput = document.getElementById("settings-graph-node-default-color");
  const settingsGraphFindHighlightColorInput = document.getElementById("settings-graph-find-highlight-color");
  const settingsConfirmOpenManyGraphNodesInput = document.getElementById("settings-confirm-open-many-graph-nodes");
  const settingsConfirmDeleteFilesInput = document.getElementById("settings-confirm-delete-files");
  const settingsConfirmResetStateInput = document.getElementById("settings-confirm-reset-state");
  const settingsMaxRecentFilesInput = document.getElementById("settings-max-recent-files");
  const settingsMaxRecentFoldersInput = document.getElementById("settings-max-recent-folders");
  const settingsContextMenuTooltipDelayInput = document.getElementById("settings-context-menu-tooltip-delay");
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsModalCancel = document.getElementById("settings-modal-cancel");
  const settingsModalSave = document.getElementById("settings-modal-save");
  const settingsModalSaveDefaultText = settingsModalSave?.textContent || "Save settings";
  const settingsResetCacheButton = document.getElementById("settings-reset-cache");
  const settingsResetPreferencesButton = document.getElementById("settings-reset-preferences");
  const settingsResetRecentHistoryButton = document.getElementById("settings-reset-recent-history");
  const settingsResetAllButton = document.getElementById("settings-reset-all");
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
  const codeConverterConsoleCopyButton = document.getElementById("code-converter-console-copy");
  const codeConverterTaskPill = document.getElementById("code-converter-task-pill");
  const codeConverterTaskName = document.getElementById("code-converter-task-name");
  const codeConverterTaskStatus = document.getElementById("code-converter-task-status");
  const codeConverterTaskLabel = document.getElementById("code-converter-task-label");
  let activeCodeConverterProcessId = null;
  let codeConverterIsRunning = false;
  let codeConverterCancelRequested = false;
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
  const DEFAULT_GRAPH_NODE_COLOR = "#58a6ff";
  const DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR = "#ffff00";
  const DEFAULT_CONTEXT_MENU_TOOLTIP_DELAY_MS = 3000;
  const DEFAULT_MAX_RECENT_FILES = 10;
  const DEFAULT_MAX_RECENT_FOLDERS = 10;
  const DEFAULT_GLOBAL_STATE = Object.freeze({
    autoSelectFileEnabled: true,
    editorWidthPercent: 50,
    folderSortMode: "name-asc",
    confirmDeleteFiles: true,
    confirmOpenManyGraphNodes: true,
    confirmResetState: true,
    contextMenuTooltipDelayMs: DEFAULT_CONTEXT_MENU_TOOLTIP_DELAY_MS,
    codeConverterDestinationRoot: "",
    codeConverterSourceRoot: "",
    graphAutoClusterLargeMapsEnabled: false,
    graphAutoClusterThreshold: DEFAULT_GRAPH_AUTO_CLUSTER_THRESHOLD,
    graphLargeMapHoverDimOtherNodes: false,
    graphLargeMapHoverShowConnectedLabels: true,
    graphLargeMapHoverHighlightConnectedLines: true,
    graphRenderWarningThreshold: DEFAULT_GRAPH_RENDER_WARNING_THRESHOLD,
    graphMostReferencedPercent: DEFAULT_GRAPH_MOST_REFERENCED_PERCENT,
    graphShowFileExtensions: false,
    graphNodeDefaultColor: DEFAULT_GRAPH_NODE_COLOR,
    graphFindHighlightColor: DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR,
    graphMagneticEnabled: true,
    graphViewPreferences: {},
    maxRecentFiles: DEFAULT_MAX_RECENT_FILES,
    maxRecentFolders: DEFAULT_MAX_RECENT_FOLDERS,
    showUnsupportedFolderFiles: false,
    sidebarDropzoneVisible: true,
    sidebarVisible: true,
    syncScrollingEnabled: true,
    viewMode: "split"
  });
  let settingsDialogSaving = false;
  const themePreferences = window.registerMarkdownViewerThemePreferences(app, {
    defaultState: DEFAULT_GLOBAL_STATE,
    mobileThemeToggle,
    renderMarkdown: function() { renderMarkdown(); },
    scheduleGlobalProfileWrite: function() { scheduleGlobalProfileWrite(); },
    storageKey: GLOBAL_STATE_KEY,
    themeToggle
  });
  const loadGlobalState = themePreferences.loadGlobalState;
  const saveGlobalState = themePreferences.saveGlobalState;
  const getDefaultGlobalState = themePreferences.getDefaultGlobalState;
  const updateThemeButtonLabels = themePreferences.updateThemeButtonLabels;
  themePreferences.initializeTheme();

  function getGraphAutoClusterThreshold() {
    const value = Number(loadGlobalState().graphAutoClusterThreshold);
    if (!Number.isFinite(value)) return DEFAULT_GRAPH_AUTO_CLUSTER_THRESHOLD;
    return Math.max(0, Math.min(100000, Math.floor(value)));
  }

  function isGraphAutoClusterLargeMapsEnabled() {
    return loadGlobalState().graphAutoClusterLargeMapsEnabled !== false;
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

  function getGraphShowFileExtensions() {
    return loadGlobalState().graphShowFileExtensions === true;
  }

  function getGraphFindHighlightColor() {
    const savedColor = loadGlobalState().graphFindHighlightColor;
    if (typeof normalizeGraphGroupColor === "function") {
      return normalizeGraphGroupColor(savedColor, DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR);
    }
    return /^#[0-9a-f]{6}$/i.test(String(savedColor || "")) ? savedColor : DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR;
  }

  function getGraphNodeDefaultColor() {
    const savedColor = loadGlobalState().graphNodeDefaultColor;
    if (typeof normalizeGraphGroupColor === "function") {
      return normalizeGraphGroupColor(savedColor, DEFAULT_GRAPH_NODE_COLOR);
    }
    return /^#[0-9a-f]{6}$/i.test(String(savedColor || "")) ? savedColor : DEFAULT_GRAPH_NODE_COLOR;
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

  function shouldConfirmOpenManyGraphNodes() {
    return loadGlobalState().confirmOpenManyGraphNodes !== false;
  }

  function shouldConfirmDeleteFiles() {
    return loadGlobalState().confirmDeleteFiles !== false;
  }

  function shouldConfirmResetState() {
    return loadGlobalState().confirmResetState !== false;
  }

  function getMaxRecentFiles() {
    const value = Number(loadGlobalState().maxRecentFiles);
    if (!Number.isFinite(value)) return DEFAULT_MAX_RECENT_FILES;
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function getMaxRecentFolders() {
    const value = Number(loadGlobalState().maxRecentFolders);
    if (!Number.isFinite(value)) return DEFAULT_MAX_RECENT_FOLDERS;
    return Math.max(0, Math.min(100, Math.floor(value)));
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
    marked,
    hljs,
    mermaid
  });
  rendererConfig.initialize();
  const initMermaid = rendererConfig.initMermaid;

  const layoutPreferences = window.registerMarkdownViewerLayoutPreferences(app, {
    GLOBAL_STATE_KEY,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_PANE_PERCENT,
    get currentFolderSortMode() { return currentFolderSortMode; },
    set currentFolderSortMode(value) { currentFolderSortMode = value; },
    get editorWidthPercent() { return editorWidthPercent; },
    set editorWidthPercent(value) { editorWidthPercent = value; },
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
    loadGlobalState,
    saveGlobalState,
    getDefaultGlobalState,
    shouldConfirmResetState,
    updateThemeButtonLabels,
    getValidFolderSortMode,
    updateDropzoneToggleButtons,
    applySidebarWidth,
    applySidebarDropzoneHeight,
    setSidebarVisible,
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
    resetSidebarDropzoneLayoutToDefault,
    restoreDefaultPreferences,
    applyGlobalPreferences,
    applySavedLayoutPreferences
  } = layoutPreferences;

  currentFolderSortMode = getValidFolderSortMode(loadGlobalState().folderSortMode || currentFolderSortMode);
  editorWidthPercent = getClampedEditorWidthPercent(loadGlobalState().editorWidthPercent);
  const graphSettings = {
    magneticEnabled: loadGlobalState().graphMagneticEnabled !== false
  };
  autoSelectFileEnabled = loadGlobalState().autoSelectFileEnabled !== false;
  showUnsupportedFolderFiles = loadGlobalState().showUnsupportedFolderFiles === true;
  updateAutoSelectFileButtons();
  updateUnsupportedFileToggleButtons();
  applySavedLayoutPreferences(loadGlobalState());

  const editorSyntaxHighlighter = window.registerMarkdownViewerEditorSyntaxHighlight(app, {
    markdownEditor,
    editorSyntaxHighlight,
    escapeHtml
  });
  const renderEditorSyntaxHighlights = editorSyntaxHighlighter.renderEditorSyntaxHighlights;
  const syncEditorSyntaxHighlightScroll = editorSyntaxHighlighter.syncEditorSyntaxHighlightScroll;

  // Markdown link helpers are registered near startup from js/markdown/links.js.

  const mermaidTools = window.registerMarkdownViewerMermaidTools(app, {
    markdownPreview
  });
  const addMermaidToolbars = mermaidTools.addMermaidToolbars;
  const closeMermaidModal = mermaidTools.closeMermaidModal;

  const markdownRender = window.registerMarkdownViewerRender(app, {
    RENDER_DELAY,
    markdownEditor,
    markdownPreview,
    getMarkdownRenderTimeout: function() { return markdownRenderTimeout; },
    setMarkdownRenderTimeout: function(value) { markdownRenderTimeout = value; },
    parseFrontmatter,
    renderFrontmatterTable,
    updateEditorLineNumbers,
    enhanceWikiLinks,
    enhancePreviewMarkdownImages,
    annotatePreviewMarkdownLinks,
    get enhanceGitHubAlerts() { return enhanceGitHubAlerts; },
    get initMermaid() { return initMermaid; },
    addMermaidToolbars,
    get updateDocumentStats() { return updateDocumentStats; },
    document,
    NodeFilter,
    get marked() { return marked; },
    get DOMPurify() { return DOMPurify; },
    get mermaid() { return mermaid; },
    get MathJax() { return window.MathJax; },
    get joypixels() { return joypixels; }
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

MD-Editor is a modern, client-side Markdown workspace for writing, previewing, importing, organizing, and exporting Markdown documents. This welcome document appears when the app starts with no saved tabs and when all tabs are reset.

- **Repository:** [shaybc/md-editor](https://github.com/shaybc/md-editor)
- **Privacy model:** Your Markdown is rendered in your browser; document tabs are saved locally in this browser with localStorage.
- **Best for:** Notes, READMEs, technical docs, wiki pages, research snippets, diagrams, math-heavy docs, and quick export workflows.
- **App info:** Updated May 9, 2026.

## 🚀 What You Can Do Here

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
- Emoji shortcode support plus native Unicode emoji 😀
- Local wiki-style links for connected note workflows
- Folder graph view for seeing relationships across imported Markdown files

### Export and share
- Export Markdown, standalone HTML, or PDF
- Copy rendered HTML for use in other tools
- Share compressed Markdown through the page URL when you need a quick handoff

## 💻 Code with Syntax Highlighting

\`\`\`javascript
function renderMarkdown(markdown) {
  const html = marked.parse(markdown);
  const cleanHtml = DOMPurify.sanitize(html);
  markdownPreview.innerHTML = cleanHtml;
}
\`\`\`

## 🧮 Math Support

Inline math: $$E = mc^2$$

Block math:
$$\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}$$

## 📊 Mermaid Diagrams

\`\`\`mermaid
flowchart LR
    Start["Open MD-Editor"] --> Write["Write or import Markdown"]
    Write --> Preview["Preview instantly"]
    Preview --> Export{"Need output?"}
    Export -->|Yes| Files["Export MD, HTML, or PDF"]
    Export -->|No| KeepWriting["Keep writing"]
    KeepWriting --> Preview
\`\`\`

## ✅ Markdown Task Lists

- [x] Live Markdown preview
- [x] Multi-tab documents
- [x] Local and GitHub import workflows
- [x] Mermaid diagrams
- [x] LaTeX math
- [x] HTML and PDF export
- [x] Folder graph workflows
- [ ] Your next document

## 📋 Feature Snapshot

| Capability | MD-Editor |
|:--|:--|
| Runs in browser | ✅ |
| Client-side rendering | ✅ |
| GitHub-flavored Markdown | ✅ |
| Multi-document tabs | ✅ |
| Folder import and graph view | ✅ |
| Mermaid diagrams | ✅ |
| LaTeX math | ✅ |
| Export to MD, HTML, and PDF | ✅ |
| Public GitHub import | ✅ |

## ✨ Formatting Examples

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, <mark>highlighting</mark>, and <u>underlines</u>.

Chemical formulas: H<sub>2</sub>O and CO<sub>2</sub><br>
Keyboard shortcuts: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> to export Markdown.

> [!TIP]
> Drag Markdown files into the app or use the import menu to bring in existing documentation quickly.

## 🔗 Helpful Links

- [MD-Editor repository](https://github.com/shaybc/md-editor)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
- [Mermaid documentation](https://mermaid.js.org/)
- [MathJax documentation](https://docs.mathjax.org/)

---

## 🔒 Security and Privacy

Markdown content is processed client-side in your browser and sanitized before preview rendering. Public GitHub import uses GitHub-hosted resources only for the files you choose to import, and local tab persistence stays in this browser's storage.`;

  markdownEditor.value = sampleMarkdown;

  // ========================================
  // DOCUMENT TABS & SESSION MANAGEMENT
  // ========================================

  const STORAGE_KEY = 'markdownViewerTabs';
  const ACTIVE_TAB_KEY = 'markdownViewerActiveTab';
  const UNTITLED_COUNTER_KEY = 'markdownViewerUntitledCounter';
  let tabs = [];
  let activeTabId = null;
  let folderMarkdownFiles = [];
  let folderTagCounts = new Map();
  let folderTagCountsRefreshId = 0;
  let openGraphSnapshotTagSyncRequestId = 0;
  let activeFolderName = "Graph View";
  let activeFolderHandle = null;
  let activeFolderPath = null;
  let draggedTabId = null;
  let saveTabStateTimeout = null;
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
    hiddenTagIds: [],
    hiddenNodeIds: [],
    selectedTagIds: [],
    groups: [],
    collapsedClusters: [],
    searchQuery: "",
    showArrows: true,
    showOrphans: true,
    showLabels: true,
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
    getFileTagsFromContent,
    get readFolderMarkdownFileContent() { return readFolderMarkdownFileContent; },
    getFileName,
    get isNeutralinoRuntime() { return isNeutralinoRuntime; },
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    get renderGraphView() { return renderGraphView; },
    saveGlobalState,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; }
  });
  const {    normalizeGraphTagNodeId,
    normalizeGraphTagNodeIds,
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
    ensureSavedGraphModePill,
    updateSavedGraphModePill,
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
    promptForStaleSavedGraphIfNeeded,
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
    serializeGraphExportDocument,
    serializeGraphViewDocument,
    createGraphSnapshot,
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
    isFirefoxBrowser,
    getFileName,
    joinPath,
    isPathInsideFolder,
    get reloadOpenFolderTree() { return reloadOpenFolderTree; },
    get getRootFolderGraphScopeKey() { return getRootFolderGraphScopeKey; },
    get focusExistingFolderGraphTab() { return focusExistingFolderGraphTab; },
    get createGraphTab() { return createGraphTab; },
    get switchTab() { return switchTab; },
    get getGraphTitleFromFileName() { return getGraphTitleFromFileName; },
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get getActiveGraphTab() { return getActiveGraphTab; },
    get promptForStaleSavedGraphIfNeeded() { return promptForStaleSavedGraphIfNeeded; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return saveAs; },
    get refreshFolderFilesForGraphComparison() { return refreshFolderFilesForGraphComparison; },
    get refreshOpenFolderGraphTabsFromFolderFiles() { return refreshOpenFolderGraphTabsFromFolderFiles; },
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
    readFolderMarkdownFileContent,
    refreshFolderTagCounts,
    clearFolderTagCounts,
    renderTagManagementList,
    createTag,
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
    get tabs() { return tabs; },
    normalizeEditorContent,
    getMarkdownTitleFromFileName,
    syncMarkdownTabTagsToFolderState,
    saveTabsToStorage,
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    getFileName,
    getSuggestedMarkdownFileName,
    joinPath,
    isPathInsideFolder,
    get reloadOpenFolderTree() { return reloadOpenFolderTree; },
    isFirefoxBrowser,
    get getActiveMarkdownTab() { return getActiveMarkdownTab; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    get saveAs() { return saveAs; }
  });
  const updateTabAfterSave = fileSave.updateTabAfterSave;
  const getMarkdownTabContentForSave = fileSave.getMarkdownTabContentForSave;
  const saveMarkdownTabToSource = fileSave.saveMarkdownTabToSource;
  const saveMarkdownTabWithSaveDialog = fileSave.saveMarkdownTabWithSaveDialog;
  const saveActiveTabWithSaveDialog = fileSave.saveActiveTabWithSaveDialog;
  const saveActiveTabToSource = fileSave.saveActiveTabToSource;

  const tabsModule = window.registerMarkdownViewerTabs(app, {
    sampleMarkdown,
    unsavedChanges,
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
    loadUntitledCounter,
    saveUntitledCounter,
    setViewMode,
    loadGlobalState,
    saveGlobalState,
    get setGraphViewMode() { return setGraphViewMode; },
    get renderGraphView() { return renderGraphView; },
    renderMarkdown,
    renderEditorSyntaxHighlights,
    updateEditorLineNumbers,
    syncEditorSyntaxHighlightScroll,
    syncFolderTreeSelectionToActiveTab,
    get hideSidebarContextMenus() { return hideSidebarContextMenus; },
    suspendActiveGraphRender,
    removeGraphRenderForTab,
    get updateGraphTagToolbar() { return updateGraphTagToolbar; },
    getActiveGraphTab,
    get updateStatusLine() { return updateStatusLine; },
    saveActiveTabToSource,
    saveActiveTabWithSaveDialog,
    saveMarkdownTabToSource,
    saveMarkdownTabWithSaveDialog,
    saveActiveGraphToSource,
    saveActiveGraphWithSaveDialog,
    isKeepSavedGraphMode,
    get renameSidebarNodeOnDisk() { return renameSidebarNodeOnDisk; },
    openDocumentSourceFile,
    getMarkdownTitleFromFileName,
    getFileName,
    joinPath,
    isNeutralinoRuntime,
    isMarkdownPath,
    isTextDocumentPath,
    isSupportedFolderTreeDocumentPath,
    get closeMobileMenu() { return closeMobileMenu; },
    readFolderMarkdownFileContent,
    getGraphFileEntryNodeId,
    promptForStaleSavedGraphIfNeeded,
    clearGraphTabUnsavedChanges
  });
  const {    nextUntitledTitle,
    createTab,
    createGraphTab,
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
    getActiveMarkdownTab,
    activeTabHasUnsavedChanges,
    getUnsavedTabs,
    updateSaveCurrentFileButtons,
    saveChangedTab,
    saveAllChangedTabs,
    saveCurrentFileIfChanged,
    restoreViewMode,
    setNoOpenTabsMode,
    switchTab,
    pinTemporaryTab,
    findTemporaryTab,
    applySidebarFileMetadata,
    isUnsupportedSourceFile,
    isUnsupportedFileTab,
    getActiveTab,
    getAllowedViewModeForActiveTab,
    getDefaultViewModeForOpenedFile,
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

  async function fetchBundledWikiMarkdown(wikiPath = "wiki/Home.md") {
    const normalizedPath = String(wikiPath || "wiki/Home.md").replace(/\\/g, "/").replace(/^\/+/, "");
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

  async function fetchHelpHomeMarkdown() {
    return fetchBundledWikiMarkdown("wiki/Home.md");
  }

  async function fetchReadmeMarkdown() {
    return fetchBundledWikiMarkdown("README.md");
  }

  function normalizeBundledReadmeMarkdown(markdown) {
    return String(markdown || "").replace(/\]\(web-app\/assets\//g, "](assets/");
  }

  async function openHelpHome() {
    try {
      const markdown = await fetchHelpHomeMarkdown();
      newTab(markdown, "Help", { viewMode: "preview", linkBasePath: "wiki/Home.md" });
    } catch (error) {
      console.error("Failed to open help:", error);
      alert("Unable to open the help file.");
    }
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

  function openWelcomePage() {
    newTab(sampleMarkdown, "Welcome to MD-Editor", { viewMode: "preview" });
  }

  function showAboutDialog() {
    if (!aboutModal) return;
    aboutModal.style.display = "flex";
  }

  function hideAboutDialog() {
    if (!aboutModal) return;
    aboutModal.style.display = "none";
  }

  async function exitApplication() {
    const confirmDiscardBeforeExit = window.markdownViewerConfirmDiscardUnsavedBeforeExit;
    if (
      typeof confirmDiscardBeforeExit === "function" &&
      !confirmDiscardBeforeExit()
    ) {
      return;
    }
    try {
      if (typeof Neutralino !== "undefined" && Neutralino?.app?.exit) {
        await Neutralino.app.exit();
        return;
      }
    } catch (error) {
      console.error("Failed to exit the desktop app:", error);
    }
    window.close();
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
    if (settingsGraphShowFileExtensionsInput) {
      settingsGraphShowFileExtensionsInput.checked = getGraphShowFileExtensions();
    }
    if (settingsGraphNodeDefaultColorInput) {
      settingsGraphNodeDefaultColorInput.value = getGraphColorInputValue(getGraphNodeDefaultColor());
    }
    if (settingsGraphFindHighlightColorInput) {
      settingsGraphFindHighlightColorInput.value = getGraphColorInputValue(getGraphFindHighlightColor());
    }
    if (settingsConfirmOpenManyGraphNodesInput) {
      settingsConfirmOpenManyGraphNodesInput.checked = shouldConfirmOpenManyGraphNodes();
    }
    if (settingsConfirmDeleteFilesInput) {
      settingsConfirmDeleteFilesInput.checked = shouldConfirmDeleteFiles();
    }
    if (settingsConfirmResetStateInput) {
      settingsConfirmResetStateInput.checked = shouldConfirmResetState();
    }
    if (settingsMaxRecentFilesInput) {
      settingsMaxRecentFilesInput.value = String(getMaxRecentFiles());
    }
    if (settingsMaxRecentFoldersInput) {
      settingsMaxRecentFoldersInput.value = String(getMaxRecentFolders());
    }
    if (settingsContextMenuTooltipDelayInput) {
      settingsContextMenuTooltipDelayInput.value = String(getContextMenuTooltipDelayMs());
    }
    settingsModal.style.display = "flex";
    settingsGraphAutoClusterThresholdInput?.focus();
    settingsGraphAutoClusterThresholdInput?.select();
  }

  function hideSettingsDialog() {
    if (!settingsModal) return;
    if (settingsDialogSaving) return;
    settingsModal.style.display = "none";
  }

  function setSettingsDialogSaving(isSaving) {
    settingsDialogSaving = !!isSaving;
    if (settingsModal) {
      settingsModal.classList.toggle("settings-modal-saving", settingsDialogSaving);
      settingsModal.setAttribute("aria-busy", settingsDialogSaving ? "true" : "false");
    }
    const controls = settingsModal?.querySelectorAll("input, button") || [];
    controls.forEach((control) => {
      control.disabled = settingsDialogSaving;
    });
    if (settingsModalSave) {
      settingsModalSave.textContent = settingsDialogSaving ? "Saving..." : settingsModalSaveDefaultText;
    }
  }

  async function saveSettingsDialog() {
    if (settingsDialogSaving) return;
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
    const contextMenuTooltipDelayMs = Number(settingsContextMenuTooltipDelayInput?.value);
    if (!Number.isFinite(contextMenuTooltipDelayMs) || contextMenuTooltipDelayMs < 0) {
      alert("Enter a menu tooltip delay of 0 or higher.");
      return;
    }
    const graphNodeDefaultColor = getGraphColorInputValue(settingsGraphNodeDefaultColorInput?.value || DEFAULT_GRAPH_NODE_COLOR);
    const graphFindHighlightColor = getGraphColorInputValue(settingsGraphFindHighlightColorInput?.value || DEFAULT_GRAPH_FIND_HIGHLIGHT_COLOR);
    setSettingsDialogSaving(true);
    try {
      saveGlobalState({
        graphAutoClusterLargeMapsEnabled: !!settingsGraphAutoClusterLargeMapsInput?.checked,
        graphAutoClusterThreshold: Math.min(100000, Math.floor(threshold)),
        graphLargeMapHoverDimOtherNodes: !!settingsGraphLargeHoverDimInput?.checked,
        graphLargeMapHoverShowConnectedLabels: !!settingsGraphLargeHoverLabelsInput?.checked,
        graphLargeMapHoverHighlightConnectedLines: !!settingsGraphLargeHoverLinesInput?.checked,
        graphRenderWarningThreshold: Math.min(100000, Math.floor(graphRenderWarningThreshold)),
        graphMostReferencedPercent: Math.max(1, Math.min(100, Math.floor(graphMostReferencedPercent))),
        graphShowFileExtensions: !!settingsGraphShowFileExtensionsInput?.checked,
        graphNodeDefaultColor,
        graphFindHighlightColor,
        confirmOpenManyGraphNodes: !!settingsConfirmOpenManyGraphNodesInput?.checked,
        confirmDeleteFiles: !!settingsConfirmDeleteFilesInput?.checked,
        confirmResetState: !!settingsConfirmResetStateInput?.checked,
        contextMenuTooltipDelayMs: Math.min(10000, Math.floor(contextMenuTooltipDelayMs)),
        maxRecentFiles: Math.min(100, Math.floor(maxRecentFiles)),
        maxRecentFolders: Math.min(100, Math.floor(maxRecentFolders))
      });
      applyRecentItemLimits();
      const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
      if (activeGraphTab) {
        removeGraphRenderForTab(activeGraphTab.id);
        await renderGraphView();
      }
      settingsModal.style.display = "none";
    } finally {
      setSettingsDialogSaving(false);
    }
  }

  async function clearAppCacheFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !window.confirm("Clear app cache? Open documents, preferences, and recent history will not be removed.")) return false;

    graphRenderCache.forEach((entry) => {
      if (typeof entry?.destroy === "function") entry.destroy();
      else {
        if (entry?.simulation) entry.simulation.stop();
        if (entry?.wrapper) entry.wrapper.remove();
      }
    });
    graphRenderCache.clear();

    if (window.caches?.keys) {
      try {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      } catch (error) {
        console.warn("Failed to clear browser caches:", error);
      }
    }

    if (tabs.some((tab) => tab.id === activeTabId && tab.type === "graph")) {
      renderGraphView();
    }

    if (options.notify !== false) window.alert("Cache cleared.");
    return true;
  }

  function clearPreferencesFromSettings(options = {}) {
    const restored = restoreDefaultPreferences({
      confirm: options.confirm !== false,
      notify: options.notify !== false,
      message: "Clear preferences and restore defaults? Open documents and recent history are not removed."
    });
    if (restored && settingsModal?.style.display !== "none") {
      showSettingsDialog();
    }
    return restored;
  }

  function clearRecentHistoryFromSettings(options = {}) {
    const shouldConfirm = options.confirm !== false && shouldConfirmResetState();
    if (shouldConfirm && !window.confirm("Clear recent file and folder history? Open documents and preferences are not removed.")) return false;
    clearRecentHistory();
    if (options.notify !== false) window.alert("Recent history cleared.");
    return true;
  }

  async function resetAllFromSettings() {
    if (shouldConfirmResetState() && !window.confirm("Reset all settings data? This clears cache, preferences, and recent file/folder history. Open documents are not removed.")) return;
    await clearAppCacheFromSettings({ confirm: false, notify: false });
    clearRecentHistoryFromSettings({ confirm: false, notify: false });
    clearPreferencesFromSettings({ confirm: false, notify: false });
    showSettingsDialog();
    window.alert("Cache, preferences, and recent history reset.");
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
    if (codeConverterTaskLabel) codeConverterTaskLabel.textContent = codeConverterTask.statusText || "Running...";
    codeConverterTaskPill.title = `${codeConverterTask.converterName || "Code converter"}: ${codeConverterTask.statusText || state}`;
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

  function clearCodeConverterConsole() {
    if (codeConverterConsoleOutput) codeConverterConsoleOutput.textContent = "";
    if (codeConverterTask) codeConverterTask.consoleText = "";
    setCodeConverterConsoleState("idle");
  }

  function appendCodeConverterConsole(text) {
    if (!codeConverterConsoleOutput || !text) return;
    const current = codeConverterConsoleOutput.textContent || "";
    codeConverterConsoleOutput.textContent = current ? `${current}\n${text}` : text;
    if (codeConverterTask) codeConverterTask.consoleText = codeConverterConsoleOutput.textContent || "";
    codeConverterConsoleOutput.scrollTop = codeConverterConsoleOutput.scrollHeight;
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
      setCodeConverterConsoleState("empty");
      return;
    }

    try {
      await copyTextToSystemClipboard(text);
      setCodeConverterConsoleState("copied");
    } catch (error) {
      console.warn("Failed to copy converter console:", error);
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

  async function executeCodeConverterCommand(command) {
    if (Neutralino.os?.spawnProcess && Neutralino.os?.updateSpawnedProcess) {
      return new Promise(async (resolve, reject) => {
        let spawnedProcess = null;
        let isSettled = false;
        const cleanup = () => {
          window.removeEventListener("spawnedProcess", handleSpawnedProcessEvent);
          activeCodeConverterProcessId = null;
        };
        const settle = (callback, value) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          callback(value);
        };
        const handleSpawnedProcessEvent = (event) => {
          const detail = event?.detail || {};
          if (!spawnedProcess || (detail.id !== spawnedProcess.id && detail.pid !== spawnedProcess.pid)) return;
          const action = detail.action || detail.event || detail.type;
          if (isSpawnedProcessExitAction(action)) {
            settle(resolve, { exitCode: getSpawnedProcessExitCode(detail) });
            return;
          }
          const outputText = getSpawnedProcessOutputText(detail);
          if (outputText) appendCodeConverterConsole(outputText.trimEnd());
        };

        window.addEventListener("spawnedProcess", handleSpawnedProcessEvent);
        try {
          spawnedProcess = await Neutralino.os.spawnProcess(command);
          activeCodeConverterProcessId = spawnedProcess?.id ?? null;
          if (codeConverterTask) codeConverterTask.processId = activeCodeConverterProcessId;
        } catch (error) {
          settle(reject, error);
        }
      });
    }

    const result = await Neutralino.os.execCommand(command);
    const outputText = getCodeConverterResultText(result);
    if (outputText) appendCodeConverterConsole(outputText);
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

  function showCodeConverterDialog() {
    if (!codeConverterModal) return;
    if (hasActiveCodeConverterTask()) {
      restoreCodeConverterTaskDialog();
      return;
    }
    resetCodeConverterDialogForNewTask();
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
    if (activeCodeConverterProcessId === null || !Neutralino.os?.updateSpawnedProcess) {
      hideCodeConverterDialog();
      return;
    }
    codeConverterCancelRequested = true;
    setCodeConverterStatus("Cancelling converter...");
    setCodeConverterConsoleState("cancelling");
    try {
      await Neutralino.os.updateSpawnedProcess(activeCodeConverterProcessId, "exit");
    } catch (error) {
      console.warn("Failed to cancel code converter:", error);
      appendCodeConverterConsole(error?.message || String(error));
      setCodeConverterStatus("Unable to cancel converter. See console.");
      setCodeConverterConsoleState("cancel failed");
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

  function getNeutralinoGlobalValue(name) {
    if (name === "NL_PATH" && typeof NL_PATH !== "undefined") return NL_PATH;
    if (name === "NL_CWD" && typeof NL_CWD !== "undefined") return NL_CWD;
    return typeof window !== "undefined" ? window[name] : "";
  }

  function normalizeLocalPath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getCodeConverterScriptPath() {
    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    if (!basePath) return "resources/code_converter/dependency-md-generator.js";
    return `${basePath}/resources/code_converter/dependency-md-generator.js`;
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

  async function getJavaConverterJarPath() {
    const basePath = normalizeLocalPath(getNeutralinoGlobalValue("NL_PATH"));
    const cwdPath = normalizeLocalPath(getNeutralinoGlobalValue("NL_CWD"));
    const projectRoot = (basePath || cwdPath).replace(/\/desktop-app$/i, "");
    const candidates = [
      projectRoot ? `${projectRoot}/java_converter/target/java_converter.jar` : "",
      "java_converter/target/java_converter.jar",
      "../java_converter/target/java_converter.jar"
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (await canAccessLocalPath(candidate)) return candidate;
    }

    return candidates[0] || "java_converter/target/java_converter.jar";
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
        ...switches
      ],
      missingRuntimeMessage: "Unable to run the code converter. Make sure Node.js is installed and available on PATH."
    },
    java: {
      statusName: "Java converter",
      languageSupport: "Supported language: Java. Supported extension: .java.",
      buildCommandParts: async (sourceRoot, destinationRoot, switches) => [
        "java",
        "-Xmx8g",
        "-jar",
        quoteCommandArg(await getJavaConverterJarPath()),
        "--root",
        quoteCommandArg(sourceRoot),
        "--vault",
        quoteCommandArg(destinationRoot),
        ...switches
      ],
      missingRuntimeMessage: "Unable to run the Java converter. Make sure Java is installed and java_converter/target/java_converter.jar has been built."
    }
  });

  function getSelectedCodeConverterType() {
    const value = codeConverterTypeSelect?.value || "builtin";
    return CODE_CONVERTER_TYPES[value] ? value : "builtin";
  }

  function getSelectedCodeConverterConfig() {
    return CODE_CONVERTER_TYPES[getSelectedCodeConverterType()];
  }

  function updateCodeConverterLanguageSupport() {
    if (codeConverterLanguageSupport) {
      codeConverterLanguageSupport.textContent = getSelectedCodeConverterConfig().languageSupport;
    }
  }

  function quoteCommandArg(value) {
    return `"${String(value || "").replace(/\\/g, "/").replace(/"/g, '\\"')}"`;
  }

  function getCodeConverterSwitches() {
    return [
      [codeConverterIncludeMethodsInput, "--include-methods"],
      [codeConverterIncludeAccessorsInput, "--include-accessors"],
      [codeConverterIncludeSignaturesInput, "--include-signatures"],
      [codeConverterIncludeReturnCodesInput, "--include-return-codes"],
      [codeConverterIncludeExceptionsInput, "--include-exceptions"],
      [codeConverterIncludePackageInput, "--include-package"],
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
      const command = (await converterConfig.buildCommandParts(sourceRoot, destinationRoot, getCodeConverterSwitches()))
        .join(" ");
      createCodeConverterTask({
        converterType,
        converterName: converterConfig.statusName,
        sourceRoot,
        destinationRoot,
        command
      });
      setCodeConverterRunningState(true);
      clearCodeConverterConsole();
      setCodeConverterConsoleExpanded(true);
      setCodeConverterConsoleState("running");
      appendCodeConverterConsole(`> ${command}`);
      setCodeConverterStatus(`Running ${converterConfig.statusName}...`);
      const result = await executeCodeConverterCommand(command);
      const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
      if (codeConverterCancelRequested) {
        setCodeConverterTaskState("cancelled", `${converterConfig.statusName} cancelled.`, { exitCode, attention: true });
        setCodeConverterConsoleState("cancelled");
        setCodeConverterStatus(`${converterConfig.statusName} cancelled.`);
        setCodeConverterTerminalState(false);
        codeConverterFinishButton?.focus();
        return;
      }
      if (exitCode !== 0) {
        setCodeConverterTaskState("failed", `${converterConfig.statusName} failed. See console.`, { exitCode, attention: true });
        setCodeConverterConsoleState(`failed (${exitCode})`);
        setCodeConverterStatus(`${converterConfig.statusName} failed. See console.`);
        setCodeConverterTerminalState(false);
        codeConverterFinishButton?.focus();
        return;
      }
      setCodeConverterTaskState("complete", `Markdown files created in ${getLocalPathName(destinationRoot)}.`, { exitCode, attention: true });
      setCodeConverterConsoleState("complete");
      completedCodeConverterDestinationRoot = normalizeLocalPath(destinationRoot);
      setCodeConverterCompleteStatus(completedCodeConverterDestinationRoot);
      setCodeConverterTerminalState(true);
      codeConverterOpenFolderButton?.focus();
    } catch (error) {
      console.error("Failed to run code converter:", error);
      setCodeConverterConsoleExpanded(true);
      setCodeConverterTaskState("failed", getSelectedCodeConverterConfig().missingRuntimeMessage, { attention: true });
      setCodeConverterConsoleState("error");
      appendCodeConverterConsole(error?.stack || error?.message || String(error));
      setCodeConverterStatus(getSelectedCodeConverterConfig().missingRuntimeMessage);
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
        <button class="folder-tree-open-folder-button" type="button" title="Open a folder to browse text and graph files" aria-label="Open a folder to browse text and graph files">
          <i class="bi bi-folder2-open" aria-hidden="true"></i>
          <span>Open a folder to<br>browse Markdown<br>and graph files.</span>
        </button>
      </div>`;
  }

  function updateCloseFolderButtons() {
    document.querySelectorAll(".close-folder-button").forEach((button) => {
      button.disabled = !isFolderOpen;
      button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      button.title = isFolderOpen ? "Close the currently open folder" : "Open a folder before closing it";
    });
  }

  function updateHeaderFolderIdentity() {
    if (!appHeader || !headerFolderIdentity || !headerFolderNameButton || !headerFolderPathButton) return;
    const hasFolder = Boolean(activeFolderName && activeFolderName !== "Graph View" && (isFolderOpen || activeFolderPath || activeFolderHandle));
    const folderPath = activeFolderPath || "";
    appHeader.classList.toggle("has-open-folder", hasFolder);
    headerFolderIdentity.setAttribute("aria-hidden", hasFolder ? "false" : "true");
    headerFolderNameButton.textContent = hasFolder ? activeFolderName : "";
    headerFolderNameButton.title = folderPath || (hasFolder ? activeFolderName : "");
    headerFolderNameButton.disabled = !folderPath;
    headerFolderPathButton.textContent = folderPath;
    headerFolderPathButton.title = folderPath;
    headerFolderPathButton.disabled = !folderPath;
    headerFolderPathButton.classList.toggle("is-empty", !folderPath);
    headerBrandLeft?.setAttribute("aria-hidden", hasFolder ? "true" : "false");
    headerBrandRight?.setAttribute("aria-hidden", hasFolder ? "false" : "true");
    headerBrandLeft?.querySelectorAll("a").forEach((link) => {
      link.tabIndex = hasFolder ? -1 : 0;
    });
    headerBrandRight?.querySelectorAll("a").forEach((link) => {
      link.tabIndex = hasFolder ? 0 : -1;
    });
  }

  async function openActiveFolderInExplorer() {
    if (!activeFolderPath || typeof Neutralino === "undefined" || !Neutralino.os?.open) return;
    try {
      await Neutralino.os.open(activeFolderPath);
    } catch (error) {
      console.error("Unable to open active folder in Explorer:", error);
      alert("Unable to open this folder: " + (error?.message || error));
    }
  }

  headerFolderNameButton?.addEventListener("click", openActiveFolderInExplorer);
  headerFolderPathButton?.addEventListener("click", openActiveFolderInExplorer);

  function closeFolderTree() {
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
    updateHeaderFolderIdentity();
  }

  function getFolderTreeStats(nodes) {
    return (nodes || []).reduce(function(stats, node) {
      if (!node) return stats;
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

  function updateFolderStatusLine() {
    const stats = isFolderOpen ? getFolderTreeStats(currentFolderTreeNodes) : { files: 0, folders: 0 };
    if (folderFileCountElement) folderFileCountElement.textContent = stats.files.toLocaleString();
    if (folderDirectoryCountElement) folderDirectoryCountElement.textContent = stats.folders.toLocaleString();
  }

  function renderFolderLoadingState(message = "Loading folder...") {
    if (!folderTreeRoot) return;
    updateHeaderFolderIdentity();
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

  function renderFolderTree(nodes, options = {}) {
    isFolderOpen = true;
    updateHeaderFolderIdentity();
    folderTreeRoot.removeAttribute("aria-busy");
    if (!options.preserveNodes) {
      currentFolderTreeNodes = nodes || [];
      folderTreeFilterText = "";
      if (folderTreeFilterInput) {
        folderTreeFilterInput.value = "";
      }
    }
    hideSidebarClosedFolderContextMenu();
    folderTreeRoot.removeEventListener("contextmenu", handleFolderTreeRootContextMenu);
    folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
    const displayNodes = getVisibleFolderTreeNodes(nodes || []);
    folderTreeRoot.innerHTML = "";
    if (!displayNodes.length) {
      const hasSelectedTagFilter = selectedFolderTreeTags.size > 0;
      folderTreeRoot.innerHTML = folderTreeFilterText
        ? '<p class="folder-tree-placeholder">No files or folders match this filter.</p>'
        : hasSelectedTagFilter
          ? '<p class="folder-tree-placeholder">No Markdown files match the selected tag filter.</p>'
          : '<p class="folder-tree-placeholder">No Markdown or graph files found in this folder.</p>';
      updateFolderStatusLine();
      updateCloseFolderButtons();
      updateFolderTreeToolbarState();
      updateHeaderFolderIdentity();
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "folder-tree-list";
    displayNodes.forEach((node) => ul.appendChild(renderFolderTreeNode(node)));
    folderTreeRoot.appendChild(ul);
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
    updateFolderStatusLine();
    updateHeaderFolderIdentity();
    syncFolderTreeSelectionToActiveTab({ scroll: false });
    renderLinkAutocomplete();
    if (!options.skipTagRefresh) {
      refreshFolderTagCounts();
    }
  }

  async function reloadOpenFolderTree() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      const nodes = await listMarkdownTreeNeutralino(activeFolderPath);
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
      renderFolderTree(nodes);
      await refreshOpenFolderGraphTabsFromFolderFiles();
      await promptActiveSavedGraphForCurrentFolder();
      return true;
    }

    if (activeFolderHandle) {
      const nodes = await listMarkdownTree(activeFolderHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      await refreshOpenFolderGraphTabsFromFolderFiles();
      await promptActiveSavedGraphForCurrentFolder();
      return true;
    }

    return false;
  }

  async function refreshFolderFilesForGraphComparison() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      const nodes = await listMarkdownTreeNeutralino(activeFolderPath);
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
      renderFolderTree(nodes);
      return true;
    }

    if (activeFolderHandle) {
      const nodes = await listMarkdownTree(activeFolderHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
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
      return await reloadOpenFolderTree();
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
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(currentFolderTreeNodes);
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

async function listMarkdownTreeNeutralino(dirPath) {
  const entries = [];
  try {
    const items = await Neutralino.filesystem.readDirectory(dirPath);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (item.entry === "." || item.entry === "..") continue;
      const fullPath = `${dirPath}/${item.entry}`;
      if (item.type === "DIRECTORY") {
        const children = await listMarkdownTreeNeutralino(fullPath);
        entries.push({ kind: "directory", name: item.entry, children, fullPath, createdAt: 0, modifiedAt: 0, size: 0 });
      } else if (item.type === "FILE") {
        entries.push({ kind: "file", name: item.entry, fullPath, createdAt: 0, modifiedAt: 0, size: 0, isGraphDocumentFile: isGraphFilePath(fullPath) });
      }
    }
  } catch (error) {
    console.warn("Failed to read directory:", dirPath, error);
  }
  return sortFolderTreeNodes(entries);
}

async function collectMarkdownFilesFromTreeNeutralino(nodes, parentPath = "") {
  const perfSession = !parentPath && typeof createGraphPerfSession === "function"
    ? createGraphPerfSession("folder markdown file discovery", { runtime: "neutralino" })
    : null;
  const files = [];
  try {
    for (let index = 0; index < (nodes || []).length; index += 1) {
      const node = (nodes || [])[index];
      if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.kind === "directory") {
        const nestedFiles = await collectMarkdownFilesFromTreeNeutralino(node.children || [], currentPath);
        files.push(...nestedFiles);
      } else if (node.kind === "file" && isMarkdownPath(node.name)) {
        files.push({
          path: currentPath,
          fullPath: node.fullPath,
          name: node.name,
          size: Number(node.size || 0),
          modifiedAt: Number(node.modifiedAt || 0)
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
    openOriginalInNewTab: { label: "Open original in a new tab", icon: "bi bi-box-arrow-up-right" },
    openOriginalWithDefaultApp: { label: "Open original in default app", icon: "bi bi-window" },
    revealOriginalInFileExplorer: { label: "Reveal original in file explorer", icon: "bi bi-folder2-open" },
    revealInFileExplorer: { label: "Reveal in file explorer", icon: "bi bi-folder2-open" },
    revealOriginalFolder: { label: "Reveal original folder", icon: "bi bi-folder-symlink" },
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
    addTag: { label: "Add tag…", icon: "bi bi-tag" },
    removeTag: { label: "Remove tag…", icon: "bi bi-tag-fill" },
    deleteTag: { label: "Delete tag", icon: "bi bi-trash3" },
    turnMagneticForcesOff: { label: "Turn magnetic forces off", icon: "bi bi-magnet" },
    copyDependencies: { label: "Copy dependencies", icon: "bi bi-list-ul" },
    copyFullDependencies: { label: "Copy full dependencies", icon: "bi bi-bezier2" },
    copyBacklinks: { label: "Copy backlinks", icon: "bi bi-arrow-left-circle" },
    copyFullNetwork: { label: "Copy full network", icon: "bi bi-diagram-3" },
    openFolder: { label: "Open folder", icon: "bi bi-folder2-open" }
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
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    set folderMarkdownFiles(value) { folderMarkdownFiles = value; },
    get currentFolderTreeNodes() { return currentFolderTreeNodes; },
    set currentFolderTreeNodes(value) { currentFolderTreeNodes = value; },
    get selectedFolderTreeTags() { return selectedFolderTreeTags; },
    set selectedFolderTreeTags(value) { selectedFolderTreeTags = value; },
    get isFolderOpen() { return isFolderOpen; },
    set isFolderOpen(value) { isFolderOpen = value; },
    get shownFolderInputFallbackNotice() { return shownFolderInputFallbackNotice; },
    set shownFolderInputFallbackNotice(value) { shownFolderInputFallbackNotice = value; },
    get markdownEditor() { return markdownEditor; },
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
    get renderTagManagementList() { return renderTagManagementList; },
    get renderFilteredFolderTree() { return renderFilteredFolderTree; },
    get renderLinkAutocomplete() { return renderLinkAutocomplete; },
    get renderEditorSyntaxHighlights() { return renderEditorSyntaxHighlights; },
    get updateEditorLineNumbers() { return updateEditorLineNumbers; },
    get renderMarkdown() { return renderMarkdown; },
    get renderTabBar() { return renderTabBar; },
    get updateSaveCurrentFileButtons() { return updateSaveCurrentFileButtons; },
    get openSidebarFileInPermanentTab() { return openSidebarFileInPermanentTab; },
    get openSidebarFileInTemporaryTab() { return openSidebarFileInTemporaryTab; },
    get openDocumentSourceFile() { return openDocumentSourceFile; },
    get findTabForSourceFile() { return findTabForSourceFile; },
    get switchTab() { return switchTab; },
    get pinTemporaryTab() { return pinTemporaryTab; },
    get createGraphTab() { return createGraphTab; },
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
    isNeutralinoRuntime,
    joinPath,
    getFileName,
    getFileExtension,
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
    listMarkdownTree,
    collectMarkdownFilesFromTree,
    sortFolderTreeNodes,
    listMarkdownTreeNeutralino,
    collectMarkdownFilesFromTreeNeutralino,
    renderFolderTree,
    renderFolderLoadingState,
    renderFolderLoadingError,
    rememberRecentFile,
    rememberRecentFolder,
    updateCloseFolderButtons,
    updateFolderTreeToolbarState,
    clearFolderTagCounts,
    closeFolderTree,
    closeTabsForDeletedPath,
    refreshOpenFolderTreeAfterFileDelete,
    isPathInsideFolder,
    reloadOpenFolderTree,
    openFolderTreeFromNeutralinoPath,
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; }
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
    renderFolderTreeNode,
    findTabForSidebarFile,
    buildTreeFromFileList,
    openFolderTree
  } = sidebarContextTree;

  function isSidebarDropzoneVisible() {
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
        folderTreePane.hidden = true;
        contentContainer.classList.remove("sidebar-animating");
        sidebarVisibilityAnimationTimer = null;
      }, SIDEBAR_VISIBILITY_ANIMATION_MS);
    } else {
      contentContainer.classList.add("sidebar-hidden");
      contentContainer.classList.remove("sidebar-animating");
      folderTreePane.hidden = true;
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

  const statusLine = window.registerMarkdownViewerStatusLine(app, {
    markdownEditor,
    readingTimeElement,
    wordCountElement,
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
    editorTextpadStatusElement,
    editorTotalLengthElement,
    editorTotalLinesElement,
    editorCursorLineElement,
    editorCursorColumnElement,
    editorPositionLabelElement,
    editorPositionValueElement,
    formatGraphZoomPercent,
    getActiveTab: function() {
      return tabs.find((tab) => tab.id === activeTabId);
    },
    getGraphZoomScaleFromLayout,
    getPreviewHoveredLinkUrl: function() {
      return previewHoveredLinkUrl;
    }
  });
  const updateDocumentStats = statusLine.updateDocumentStats;
  const updateMobileStats = statusLine.updateMobileStats;
  const updateStatusLine = statusLine.updateStatusLine;

  mobileMenu.bindMobileMenu();

  // View Mode Button Event Listeners - Story 1.1
  viewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      saveCurrentTabState();
    });
  });

  // Story 1.4: Mobile View Mode Button Event Listeners
  mobileViewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      saveCurrentTabState();
      closeMobileMenu();
    });
  });

  let editorInputEventCount = 0;

  markdownEditor.addEventListener("input", function() {
    editorInputEventCount += 1;
    renderLinkAutocomplete();
    renderEditorSyntaxHighlights();
    updateEditorLineNumbers();
    updateEditorSelectionHighlights();
    updateStatusLine();
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab) {
      activeTab.content = markdownEditor.value;
      syncMarkdownTabTagsToFolderState(activeTab, markdownEditor.value);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
    debouncedRender();
    clearTimeout(saveTabStateTimeout);
    saveTabStateTimeout = setTimeout(saveCurrentTabState, 500);
  });

  // Tab key handler to insert indentation instead of moving focus
  markdownEditor.addEventListener("keydown", function(e) {
    if (handleLinkAutocompleteKeydown(e)) return;
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

      // Insert 2 spaces
      const indent = '  '; // 2 spaces

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
    if (document.activeElement === markdownEditor) {
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
    const editorLineNumberResizeObserver = new ResizeObserver(scheduleEditorLineNumbersUpdate);
    editorLineNumberResizeObserver.observe(markdownEditor);
  } else {
    window.addEventListener("resize", scheduleEditorLineNumbersUpdate);
  }

  scrollSync.bindScrollSync();
  themePreferences.bindThemeToggle();

  restoreDefaultsButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      restoreDefaultPreferences();
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

  newDocumentButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      newTab();
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
      showCodeConverterDialog();
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

  if (aboutModal) {
    aboutModal.addEventListener("click", function(e) {
      if (e.target === aboutModal) hideAboutDialog();
    });
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

  if (settingsResetCacheButton) {
    settingsResetCacheButton.addEventListener("click", function() {
      clearAppCacheFromSettings();
    });
  }

  if (settingsResetPreferencesButton) {
    settingsResetPreferencesButton.addEventListener("click", function() {
      clearPreferencesFromSettings();
    });
  }

  if (settingsResetRecentHistoryButton) {
    settingsResetRecentHistoryButton.addEventListener("click", function() {
      clearRecentHistoryFromSettings();
    });
  }

  if (settingsResetAllButton) {
    settingsResetAllButton.addEventListener("click", function() {
      resetAllFromSettings();
    });
  }

  if (settingsGraphAutoClusterThresholdInput) {
    settingsGraphAutoClusterThresholdInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") saveSettingsDialog();
      if (e.key === "Escape") hideSettingsDialog();
    });
  }

  [settingsGraphRenderWarningThresholdInput, settingsMaxRecentFilesInput, settingsMaxRecentFoldersInput].forEach(function(input) {
    if (!input) return;
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
    codeConverterTypeSelect.addEventListener("change", updateCodeConverterLanguageSupport);
    updateCodeConverterLanguageSupport();
  }

  if (codeConverterConsoleToggle) {
    codeConverterConsoleToggle.addEventListener("click", function() {
      setCodeConverterConsoleExpanded(!codeConverterShell?.classList.contains("console-open"));
    });
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
    get graphFilterPanelToggle() { return graphFilterPanelToggle; },
    get graphGroupsList() { return graphGroupsList; },
    get graphAddGroupButton() { return graphAddGroupButton; },
    get graphShowTagsButton() { return graphShowTagsButton; },
    get graphHideTagsButton() { return graphHideTagsButton; },
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

  const graphRenderer = window.registerMarkdownViewerGraphRenderer(app, {
    get graphRenderRequestId() { return graphRenderRequestId; },
    set graphRenderRequestId(value) { graphRenderRequestId = value; },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
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
    getGraphShowFileExtensions,
    getGraphNodeDefaultColor,
    getGraphFindHighlightColor,
    shouldConfirmOpenManyGraphNodes,
    shouldConfirmDeleteFiles,
    createGraphPerfSession,
    normalizeGraphViewConfig,
    hideInactiveGraphRenders,
    updateStatusLine,
    updateGraphTagToolbar,
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
    getNextDefaultGraphGroupColor,
    getGraphDisplayLabel,
    getGraphContextMenuTitle,
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
    renderEditorSyntaxHighlights,
    updateEditorLineNumbers,
    renderMarkdown,
    openGraphNodeFileInPermanentTab,
    findFolderTreeFileButtonForTab,
    setSidebarVisible,
    openSidebarFileInPermanentTab,
    findTabForSourceFile,
    switchTab,
    pinTemporaryTab,
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

  initTabs();
  if (loadGlobalState().syncScrollingEnabled === false) toggleSyncScrolling();
  updateSyncToggleButtons();
  updateMobileStats();
  updateStatusLine();
  updateEditorLineNumbers();
  renderEditorSyntaxHighlights();

  // Initialize resizer - Story 1.3
  initResizer();

  document.querySelectorAll(".save-current-file-button").forEach(function(button) {
    button.addEventListener("click", saveCurrentFileIfChanged);
  });

  document.querySelectorAll(".save-all-files-button").forEach(function(button) {
    button.addEventListener("click", saveAllChangedTabs);
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
      const markdown = markdownEditor.value;
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
  exportPdf.addEventListener("click", async function () {
    try {
      const originalText = exportPdf.innerHTML;
      exportPdf.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
      exportPdf.disabled = true;

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

      const markdown = markdownEditor.value;
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

  window.registerMarkdownViewerShareUrl(app, {
    markdownEditor,
    mobileShareButton,
    renderEditorSyntaxHighlights,
    renderMarkdown: function() { return renderMarkdown(); },
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
    renderFolderTree,
    rememberRecentFolder,
    get promptActiveSavedGraphForCurrentFolder() { return promptActiveSavedGraphForCurrentFolder; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    alert
  });
  const handleDrop = droppedItems.handleDrop;

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
    hideSidebarDropzone();
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
  updateDropzoneToggleButtons();
  updateSidebarToggleButtons();

  window.registerMarkdownViewerKeyboardShortcuts(app, {
    closeGraphComparisonDetailsModal,
    closeMermaidModal,
    closeTab,
    copyMarkdownButton,
    graphViewCanvas,
    getActiveTabId: function() { return activeTabId; },
    getActiveTabType: function() {
      return tabs.find((tab) => tab.id === activeTabId)?.type || "";
    },
    getCurrentViewMode: function() { return currentViewMode; },
    hideGraphStaleModal,
    markdownEditor,
    newTab,
    openGraphFindDialog,
    saveCurrentFileIfChanged,
    toggleSyncScrolling
  });

  document.getElementById('tab-reset-btn').addEventListener('click', function() {
    resetAllTabs();
  });

});
