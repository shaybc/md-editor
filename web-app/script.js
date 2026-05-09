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
  const themeToggle = document.getElementById("theme-toggle");
  const restoreDefaultsButtons = document.querySelectorAll(".restore-defaults-button");
  const importFromFileButtons = document.querySelectorAll("#import-from-file");
  const newDocumentButtons = document.querySelectorAll(".new-document-button");
  const importFromGithubButton = document.getElementById("import-from-github");
  const importFromFolderButton = document.getElementById("import-from-folder");
  const folderTreeFilterInput = document.getElementById("folder-tree-filter-input");
  const createTagButton = document.getElementById("create-tag-button");
  const deleteTagButton = document.getElementById("delete-tag-button");
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
  const editorTextpadStatusElement = document.getElementById("editor-textpad-status");
  const editorTotalLengthElement = document.getElementById("editor-total-length");
  const editorTotalLinesElement = document.getElementById("editor-total-lines");
  const editorCursorLineElement = document.getElementById("editor-cursor-line");
  const editorCursorColumnElement = document.getElementById("editor-cursor-column");
  const editorPositionLabelElement = document.getElementById("editor-position-label");
  const editorPositionValueElement = document.getElementById("editor-position-value");
  let previewHoveredLinkUrl = "";

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

  const markdownLinks = window.registerMarkdownViewerMarkdownLinks(app, {
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get markdownPreview() { return markdownPreview; },
    get previewHoveredLinkUrl() { return previewHoveredLinkUrl; },
    set previewHoveredLinkUrl(value) { previewHoveredLinkUrl = value; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
    getFileName,
    getActiveMarkdownTab,
    findTabForSourceFile,
    switchTab,
    pinTemporaryTab,
    openDocumentSourceFile,
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
    getFolderTagCounts: function() { return folderTagCounts; },
    getIsFolderOpen: function() { return isFolderOpen; },
    getKnownTags,
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
    applyGlobalPreferences,
    escapeHtml,
    getFileName,
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
  const RECENT_FILES_KEY = recentItems.keys.files;
  const RECENT_FOLDERS_KEY = recentItems.keys.folders;
  async function openRecentFile(key) {
    const item = readRecentItems(RECENT_FILES_KEY).find((recentItem) => getRecentItemKey(recentItem) === key);
    if (!item) return;

    const handle = await getPersistedRecentHandle(RECENT_FILES_KEY, key);
    const sourceFile = {
      name: item.name || item.label || (item.path ? getFileName(item.path) : null),
      path: item.path || null,
      handle
    };

    const isGraphFile = isGraphFilePath(sourceFile.path || sourceFile.name);
    const existingTab = isGraphFile ? findGraphTabForSourceFile(sourceFile) : findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      rememberRecentFile(sourceFile);
      return;
    }

    if (!item.path && !handle) {
      alert("This recent file was opened with a browser picker that did not provide a reusable file handle. Please choose it again with Open file ...");
      return;
    }

    try {
      if (handle && !(await ensureFileSystemHandlePermission(handle))) {
        alert("Permission is required to reopen this recent file. Please allow access or choose it again with Open file ...");
        return;
      }
      await openDocumentSourceFile(sourceFile);
    } catch (error) {
      console.error("Failed to open recent file:", error);
      alert("Unable to open the recent file.");
    }
  }

  async function openRecentFolder(key) {
    const item = readRecentItems(RECENT_FOLDERS_KEY).find((recentItem) => getRecentItemKey(recentItem) === key);
    if (!item) return;

    const handle = await getPersistedRecentHandle(RECENT_FOLDERS_KEY, key);
    if (typeof NL_VERSION !== "undefined" && item.path) {
      try {
        await openFolderTreeFromNeutralinoPath(item.path);
      } catch (error) {
        console.error("Failed to open recent folder:", error);
        alert("Unable to open the recent folder.");
      }
      return;
    }

    if (handle) {
      try {
        if (!(await ensureFileSystemHandlePermission(handle))) {
          alert("Permission is required to reopen this recent folder. Please allow access or choose it again with Open folder ...");
          return;
        }
        activeFolderName = handle.name || item.name || "Graph View";
        activeFolderHandle = handle;
        activeFolderPath = null;
        const nodes = await listMarkdownTree(handle);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle });
      } catch (error) {
        console.error("Failed to open recent folder:", error);
        alert("Unable to open the recent folder.");
      }
      return;
    }

    alert("This recent folder was opened with a browser picker that did not provide a reusable folder handle. Please choose it again with Open folder ...");
  }

  document.addEventListener("click", function(event) {
    const recentButton = event.target.closest(".recent-menu-item");
    if (!recentButton) return;

    event.preventDefault();

    if (recentButton.dataset.recentType === "folder") {
      openRecentFolder(recentButton.dataset.recentKey);
    } else {
      openRecentFile(recentButton.dataset.recentKey);
    }
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

  function getClampedEditorWidthPercent(percent) {
    const numericPercent = Number.parseFloat(percent);
    const fallbackPercent = Number.isFinite(numericPercent) ? numericPercent : 50;
    return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, fallbackPercent));
  }
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
    folderTreePane,
    sidebarDropzonePanel,
    editorPaneElement,
    previewPaneElement,
    MIN_SIDEBAR_WIDTH,
    MIN_EDITOR_WORKSPACE_WIDTH,
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_PANEL_HEIGHT,
    MIN_PANE_PERCENT,
    getActiveTab,
    isUnsupportedFileTab,
    getAllowedViewModeForActiveTab,
    get saveGlobalState() { return saveGlobalState; },
    renderMarkdown,
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
  const desktopOpenGraphButtons = document.querySelectorAll(".open-graph-view");
  const graphViewCanvas = document.getElementById("graph-view-canvas");
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
  const graphTextFadeThreshold = document.getElementById("graph-text-fade-threshold");
  const graphNodeSize = document.getElementById("graph-node-size");
  const graphLinkThickness = document.getElementById("graph-link-thickness");
  const graphCenterForce = document.getElementById("graph-center-force");
  const graphRepelForce = document.getElementById("graph-repel-force");
  const graphLinkForce = document.getElementById("graph-link-force");
  const graphLinkDistance = document.getElementById("graph-link-distance");
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
  const DEFAULT_GLOBAL_STATE = Object.freeze({
    autoSelectFileEnabled: true,
    editorWidthPercent: 50,
    folderSortMode: "name-asc",
    graphMagneticEnabled: true,
    showUnsupportedFolderFiles: false,
    sidebarDropzoneVisible: true,
    sidebarVisible: true,
    syncScrollingEnabled: true,
    viewMode: "split"
  });
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

  function resetSidebarDropzoneLayoutToDefault() {
    if (sidebarDropzonePanel) {
      delete sidebarDropzonePanel.dataset.previousFlex;
      sidebarDropzonePanel.style.flex = "";
      sidebarDropzonePanel.style.display = "";
      sidebarDropzonePanel.style.padding = "";
      sidebarDropzonePanel.style.minHeight = "";
    }
    if (dropzone) {
      dropzone.style.display = "";
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "";
      sidebarDropzoneResizer.style.flex = "";
    }
  }

  function restoreDefaultPreferences() {
    const confirmed = window.confirm(
      "Restore default preferences? This resets saved view, theme, layout, graph, folder, sync, and tag preferences. Open documents and recent items are not removed."
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem(GLOBAL_STATE_KEY);
    } catch (error) {
      console.warn("Failed to clear saved preferences:", error);
    }

    const defaults = getDefaultGlobalState();
    currentFolderSortMode = defaults.folderSortMode;
    editorWidthPercent = defaults.editorWidthPercent;
    graphSettings.magneticEnabled = defaults.graphMagneticEnabled;
    autoSelectFileEnabled = defaults.autoSelectFileEnabled;
    showUnsupportedFolderFiles = defaults.showUnsupportedFolderFiles;
    syncScrollingEnabled = defaults.syncScrollingEnabled;

    document.documentElement.setAttribute("data-theme", defaults.theme);
    updateThemeButtonLabels(defaults.theme);
    resetSidebarDropzoneLayoutToDefault();
    setSidebarVisible(defaults.sidebarVisible, false, false);
    updateDropzoneToggleButtons();
    applySidebarWidth(DEFAULT_SIDEBAR_WIDTH, false);
    setViewMode(defaults.viewMode, false);
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeToolbarState();
    renderFilteredFolderTree();
    renderMarkdown();
    scheduleGlobalProfileWrite();

    window.alert("Preferences restored to defaults.");
  }

  function applyGlobalPreferences(state = loadGlobalState()) {
    currentFolderSortMode = getValidFolderSortMode(state.folderSortMode || currentFolderSortMode);
    editorWidthPercent = getClampedEditorWidthPercent(state.editorWidthPercent);
    graphSettings.magneticEnabled = state.graphMagneticEnabled !== false;
    autoSelectFileEnabled = state.autoSelectFileEnabled !== false;
    showUnsupportedFolderFiles = state.showUnsupportedFolderFiles === true;
    syncScrollingEnabled = state.syncScrollingEnabled !== false;
    if (state.theme === "dark" || state.theme === "light") {
      document.documentElement.setAttribute("data-theme", state.theme);
      updateThemeButtonLabels(state.theme);
      renderMarkdown();
    }
    updateSyncToggleButtons();
    updateAutoSelectFileButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeSortControls();
    applySavedLayoutPreferences(state);
  }

  function applySavedLayoutPreferences(state = loadGlobalState()) {
    applySidebarWidth(state.sidebarWidth, false);
    applySidebarDropzoneHeight(state.sidebarDropzoneHeight, false);
    if (state.sidebarDropzoneVisible === false) {
      hideSidebarDropzone(false);
    } else {
      showSidebarDropzone(false);
    }
    setSidebarVisible(state.sidebarVisible !== false, false);
  }

  function getKnownTags() {
    return normalizeFileTagList(loadGlobalState().knownTags || []);
  }

  function saveKnownTags(tags) {
    saveGlobalState({ knownTags: normalizeFileTagList(tags).sort((a, b) => a.localeCompare(b)) });
  }

  function addTagsToCountMap(counts, tags) {
    normalizeFileTagList(tags).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  }

  function removeTagsFromCountMap(counts, tags) {
    normalizeFileTagList(tags).forEach((tag) => {
      const nextCount = (counts.get(tag) || 0) - 1;
      if (nextCount > 0) {
        counts.set(tag, nextCount);
      } else {
        counts.delete(tag);
      }
    });
  }

  function areTagListsEqual(firstTags, secondTags) {
    const first = normalizeFileTagList(firstTags).sort();
    const second = normalizeFileTagList(secondTags).sort();
    return first.length === second.length && first.every((tag, index) => tag === second[index]);
  }

  function getComparableFolderEntryPath(entry) {
    return getComparableFilePath(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "");
  }

  function getFolderMarkdownEntryForTab(tab) {
    if (!tab || tab.type === "graph") return null;

    if (tab.sourceFileHandle) {
      const handleMatch = (folderMarkdownFiles || []).find((entry) => entry.handle && entry.handle === tab.sourceFileHandle);
      if (handleMatch) return handleMatch;
    }

    const tabPathKey = getComparableFilePath(tab.sourceFilePath || "");
    if (tabPathKey) {
      const pathMatch = (folderMarkdownFiles || []).find((entry) => getComparableFolderEntryPath(entry) === tabPathKey);
      if (pathMatch) return pathMatch;
    }

    const tabName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : "");
    if (!tabName) return null;

    return (folderMarkdownFiles || []).find((entry) => {
      const entryName = entry.name || entry.file?.name || (entry.path ? getFileName(entry.path) : "") || (entry.fullPath ? getFileName(entry.fullPath) : "");
      return entryName === tabName;
    }) || null;
  }

  function updateFolderTreeNodeTagsForEntry(fileEntry, tags) {
    const entryPathKey = getComparableFolderEntryPath(fileEntry);
    if (!entryPathKey) return;

    const updateNodes = (nodes) => {
      (nodes || []).forEach((node) => {
        if (node.kind === "directory") {
          updateNodes(node.children || []);
          return;
        }

        if (getFolderTreeNodePathKey(node) === entryPathKey) {
          node.tags = normalizeFileTagList(tags);
        }
      });
    };

    updateNodes(currentFolderTreeNodes);
  }

  function syncMarkdownTabTagsToFolderState(tab, content) {
    const normalizedContent = normalizeEditorContent(content);
    const nextTags = getFileTagsFromContent(normalizedContent);
    const fileEntry = getFolderMarkdownEntryForTab(tab);
    const previousTags = fileEntry
      ? normalizeFileTagList(fileEntry.tags || [])
      : normalizeFileTagList(tab?.graphSyncedTags || getOpenGraphSnapshotTagsForMarkdownTab(tab));

    if (fileEntry) {
      fileEntry.content = normalizedContent;
    }

    if (areTagListsEqual(previousTags, nextTags)) return;

    if (fileEntry) {
      fileEntry.tags = nextTags;
      removeTagsFromCountMap(folderTagCounts, previousTags);
      addTagsToCountMap(folderTagCounts, nextTags);
      updateFolderTreeNodeTagsForEntry(fileEntry, nextTags);
    }
    if (tab) tab.graphSyncedTags = nextTags;

    saveKnownTags([...getKnownTags(), ...nextTags]);
    syncOpenGraphSnapshotsForMarkdownTabTagChange(tab, normalizedContent);
    renderTagManagementList();
    renderLinkAutocomplete();
    if (selectedFolderTreeTags.size) {
      renderFilteredFolderTree();
    }
  }

  function getActiveGraphSnapshotTagCounts() {
    const counts = new Map();
    const activeGraphTab = getActiveGraphTab();
    (activeGraphTab?.graphSnapshot?.files || []).forEach((snapshotFile) => {
      const tags = snapshotFile.tags?.length ? snapshotFile.tags : getFileTagsFromContent(snapshotFile.content || "");
      addTagsToCountMap(counts, tags);
    });
    return counts;
  }

  function getReferencedTagCounts() {
    const graphCounts = getActiveGraphSnapshotTagCounts();
    if (graphCounts.size) return graphCounts;
    return new Map(folderTagCounts || []);
  }

  function getAllKnownAndReferencedTags() {
    const tagSet = new Set(getKnownTags());
    getReferencedTagCounts().forEach((_count, tag) => tagSet.add(tag));
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  function getGraphFileEntryNodeId(fileEntry) {
    if (!fileEntry) return "";
    return fileEntry.id || normalizeGraphNodeName(fileEntry.path || fileEntry.fullPath || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || fileEntry.name || "");
  }

  function findFolderMarkdownEntryForGraphFile(fileEntry) {
    const fileNodeId = getGraphFileEntryNodeId(fileEntry);
    if (!fileNodeId) return null;
    return (folderMarkdownFiles || []).find((entry) => getGraphFileEntryNodeId(entry) === fileNodeId) || null;
  }

  async function readFolderMarkdownFileContent(fileEntry) {
    if (!fileEntry) return "";
    if (typeof fileEntry.content === "string") return fileEntry.content;
    if (fileEntry.file?.text) return fileEntry.file.text();
    if (fileEntry.handle?.getFile) {
      const file = await fileEntry.handle.getFile();
      return file.text();
    }
    if (typeof NL_VERSION !== "undefined" && fileEntry.fullPath) {
      return Neutralino.filesystem.readFile(fileEntry.fullPath);
    }

    const folderEntry = findFolderMarkdownEntryForGraphFile(fileEntry);
    if (folderEntry && folderEntry !== fileEntry) return readFolderMarkdownFileContent(folderEntry);
    return "";
  }

  async function refreshFolderTagCounts() {
    const refreshId = ++folderTagCountsRefreshId;
    const counts = new Map();
    const files = (folderMarkdownFiles || []).slice();

    for (const fileEntry of files) {
      try {
        const content = await readFolderMarkdownFileContent(fileEntry);
        if (refreshId !== folderTagCountsRefreshId) return;
        fileEntry.content = content || "";
        fileEntry.tags = getFileTagsFromContent(fileEntry.content);
        addTagsToCountMap(counts, fileEntry.tags);
      } catch (error) {
        console.warn("Failed to read folder file tags:", fileEntry.path || fileEntry.fullPath || fileEntry.name, error);
      }
    }

    if (refreshId !== folderTagCountsRefreshId) return;
    folderTagCounts = counts;
    renderTagManagementList();
    renderLinkAutocomplete();
    if (selectedFolderTreeTags.size) {
      renderFilteredFolderTree();
    }
  }

  function clearFolderTagCounts() {
    folderTagCountsRefreshId += 1;
    folderTagCounts = new Map();
    renderTagManagementList();
  }

  function renderTagManagementList() {
    if (!tagManagementList) return;
    tagManagementList.setAttribute("aria-multiselectable", "true");
    const query = String(tagManagementSearch?.value || "").trim().toLowerCase();
    const counts = getReferencedTagCounts();
    const tags = getAllKnownAndReferencedTags().filter((tag) => !query || tag.includes(query));
    tagManagementList.innerHTML = "";

    if (!tags.length) {
      const empty = document.createElement("div");
      empty.className = "tag-management-list-empty";
      empty.textContent = query ? "No matching tags" : "No known tags yet";
      tagManagementList.appendChild(empty);
      return;
    }

    tags.forEach((tag) => {
      const button = document.createElement("button");
      const isSelected = selectedFolderTreeTags.has(tag);
      button.type = "button";
      button.className = "tag-management-list-item" + (isSelected ? " selected" : "");
      button.dataset.tagName = tag;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
      button.title = isSelected ? `Remove #${tag} from the folder tree tag filter` : `Show files tagged #${tag} in the folder tree`;
      button.innerHTML = `<i class="bi ${isSelected ? "bi-tag-fill" : "bi-tag"}" aria-hidden="true"></i><span>#${escapeHtml(tag)}</span><span class="tag-management-list-item-count">${counts.get(tag) || 0}</span>`;
      button.addEventListener("click", () => {
        toggleFolderTreeTagFilter(tag);
      });
      tagManagementList.appendChild(button);
    });
  }

  function createTag(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) {
      alert("Enter a tag name to create.");
      return false;
    }

    const tags = getKnownTags();
    if (!tags.includes(normalizedTag)) {
      saveKnownTags([...tags, normalizedTag]);
    }
    renderTagManagementList();
    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
    }
    return true;
  }

  function snapshotFileMatchesTab(snapshotFile, tab) {
    if (!snapshotFile || !tab || tab.type === "graph") return false;
    const candidatePaths = new Set([snapshotFile.fullPath, snapshotFile.path].filter(Boolean).map(getComparableFilePath));
    const candidateNames = new Set([
      snapshotFile.name,
      snapshotFile.path ? getFileName(snapshotFile.path) : null,
      snapshotFile.fullPath ? getFileName(snapshotFile.fullPath) : null
    ].filter(Boolean));

    if (tab.sourceFilePath && candidatePaths.has(getComparableFilePath(tab.sourceFilePath))) return true;
    if (tab.sourceFileName && candidateNames.has(tab.sourceFileName)) return true;
    return !!(tab.title && candidateNames.has(tab.title));
  }

  function updateOpenMarkdownTabsForSnapshotFile(snapshotFile) {
    const normalizedContent = normalizeEditorContent(snapshotFile.content || "");
    tabs.forEach((tab) => {
      if (!snapshotFileMatchesTab(snapshotFile, tab)) return;
      tab.content = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
        renderEditorSyntaxHighlights();
        updateEditorLineNumbers();
        renderMarkdown();
      }
    });
  }

  function getOpenGraphSnapshotTagsForMarkdownTab(sourceTab) {
    if (!sourceTab || sourceTab.type === "graph") return [];
    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files) continue;
      const matchingSnapshotFile = tab.graphSnapshot.files.find((snapshotFile) => snapshotFileMatchesTab(snapshotFile, sourceTab));
      if (matchingSnapshotFile) {
        return normalizeFileTagList(matchingSnapshotFile.tags?.length ? matchingSnapshotFile.tags : getFileTagsFromContent(matchingSnapshotFile.content || ""));
      }
    }
    return [];
  }

  function updateFolderMarkdownEntryForSnapshotFile(snapshotFile) {
    const snapshotNodeId = snapshotFile.id || normalizeGraphNodeName(snapshotFile.path || snapshotFile.fullPath || snapshotFile.name || "");
    const folderEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
      return normalizeGraphNodeName(entryPath) === snapshotNodeId;
    });
    if (folderEntry) {
      folderEntry.content = snapshotFile.content || "";
      folderEntry.tags = getFileTagsFromContent(folderEntry.content);
      updateFolderTreeNodeTagsForEntry(folderEntry, folderEntry.tags);
    }
  }

  async function syncOpenGraphSnapshotsForMarkdownTabTagChange(sourceTab, content) {
    if (!sourceTab || sourceTab.type === "graph") return false;
    const syncRequestId = ++openGraphSnapshotTagSyncRequestId;
    const normalizedContent = normalizeEditorContent(content);
    let changedActiveGraph = false;

    for (const tab of tabs) {
      if (syncRequestId !== openGraphSnapshotTagSyncRequestId) return false;
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

      let graphChanged = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        if (!snapshotFileMatchesTab(snapshotFile, sourceTab)) return;
        snapshotFile.content = normalizedContent;
        snapshotFile.tags = getFileTagsFromContent(normalizedContent);
        graphChanged = true;
      });

      if (!graphChanged) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (syncRequestId !== openGraphSnapshotTagSyncRequestId) return false;
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedActiveGraph = changedActiveGraph || tab.id === activeTabId;
    }

    if (changedActiveGraph) {
      const activeGraphTab = getActiveGraphTab();
      updateGraphTagToolbar(activeGraphTab, activeGraphTab?.graphSnapshot || null);
      renderGraphView();
    }

    saveTabsToStorage(tabs);
    return changedActiveGraph;
  }

  function getTagDeletionEntryKey(entry) {
    return getComparableFilePath(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "");
  }

  function getActiveGraphSnapshotFileDeletionTargets(tagName, existingKeys) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab?.graphSnapshot?.files || isKeepSavedGraphMode(activeGraphTab)) return [];

    return activeGraphTab.graphSnapshot.files
      .filter((snapshotFile) => !existingKeys.has(getTagDeletionEntryKey(snapshotFile)))
      .filter((snapshotFile) => getFileTagsFromContent(snapshotFile.content || "").includes(tagName))
      .map((snapshotFile) => ({
        id: snapshotFile.id,
        name: snapshotFile.name || (snapshotFile.path ? getFileName(snapshotFile.path) : "document.md"),
        path: snapshotFile.path || snapshotFile.fullPath || snapshotFile.name || "",
        fullPath: snapshotFile.fullPath || null,
        content: snapshotFile.content || "",
        tags: snapshotFile.tags || []
      }));
  }

  function getNeutralinoTagDeletionWritePath(entry) {
    if (!isNeutralinoRuntime()) return null;
    if (entry.fullPath) return entry.fullPath;
    if (!entry.path) return null;
    const entryPath = String(entry.path);
    const isAbsolutePath = /^[a-zA-Z]:[\\/]/.test(entryPath) || /^\\\\/.test(entryPath) || entryPath.startsWith("/");
    return isAbsolutePath ? entryPath : (activeFolderPath ? joinPath(activeFolderPath, entryPath) : null);
  }

  async function writeTagDeletionTargetContent(entry, content) {
    const neutralinoWritePath = getNeutralinoTagDeletionWritePath(entry);
    if (neutralinoWritePath) {
      if (!Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(neutralinoWritePath, content);
      return;
    }

    if (entry.handle?.createWritable) {
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }

    throw new Error("No writable file handle is available.");
  }

  async function updateOpenGraphSnapshotsForChangedTagFiles(changedEntries) {
    if (!changedEntries.length) return false;
    let changedActiveGraph = false;

    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

      let graphChanged = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        const changedEntry = changedEntries.find((entry) => sidebarNodeMatchesSnapshotFile(entry, snapshotFile));
        if (!changedEntry) return;
        snapshotFile.content = changedEntry.content || "";
        snapshotFile.tags = getFileTagsFromContent(snapshotFile.content);
        graphChanged = true;
      });

      if (!graphChanged) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedActiveGraph = changedActiveGraph || tab.id === activeTabId;
    }

    return changedActiveGraph;
  }

  async function deleteTag(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) {
      alert("Enter a tag name to delete.");
      return false;
    }

    const confirmed = window.confirm(`Delete tag "#${normalizedTag}"? This removes it from every file that has the tag and saves those files.`);
    if (!confirmed) return false;

    const folderTargets = [];
    const targetKeys = new Set();
    for (const fileEntry of (folderMarkdownFiles || [])) {
      try {
        const currentContent = await readFolderMarkdownFileContent(fileEntry);
        const currentTags = getFileTagsFromContent(currentContent);
        fileEntry.content = currentContent || "";
        fileEntry.tags = currentTags;
        updateFolderTreeNodeTagsForEntry(fileEntry, currentTags);
        if (!currentTags.includes(normalizedTag)) continue;
        folderTargets.push(fileEntry);
        const targetKey = getTagDeletionEntryKey(fileEntry);
        if (targetKey) targetKeys.add(targetKey);
      } catch (error) {
        console.warn("Failed to read folder file tags before deleting tag:", fileEntry.path || fileEntry.fullPath || fileEntry.name, error);
      }
    }

    const targets = [
      ...folderTargets,
      ...getActiveGraphSnapshotFileDeletionTargets(normalizedTag, targetKeys)
    ];

    const changedEntries = [];
    const failedEntries = [];
    for (const entry of targets) {
      try {
        const currentContent = typeof entry.content === "string" ? entry.content : await readFolderMarkdownFileContent(entry);
        const nextContent = removeTagFromContent(currentContent, normalizedTag);
        if (nextContent === currentContent) continue;

        await writeTagDeletionTargetContent(entry, nextContent);
        entry.content = nextContent;
        entry.tags = getFileTagsFromContent(nextContent);
        updateFolderTreeNodeTagsForEntry(entry, entry.tags);
        updateOpenMarkdownTabsForSidebarNode(entry, nextContent);
        changedEntries.push(entry);
      } catch (error) {
        failedEntries.push(entry);
        console.error("Failed to delete tag from file:", entry.path || entry.fullPath || entry.name, error);
      }
    }

    const activeGraphChanged = await updateOpenGraphSnapshotsForChangedTagFiles(changedEntries);

    if (selectedFolderTreeTags.has(normalizedTag)) {
      selectedFolderTreeTags = new Set(selectedFolderTreeTags);
      selectedFolderTreeTags.delete(normalizedTag);
    }

    await refreshFolderTagCounts();
    if (!failedEntries.length) {
      saveKnownTags(getKnownTags().filter((tag) => tag !== normalizedTag));
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    renderFilteredFolderTree();
    renderTagManagementList();
    renderLinkAutocomplete();

    if (activeGraphChanged || (getActiveGraphTab() && activeTabId === getActiveGraphTab().id)) {
      renderGraphView();
    }

    if (failedEntries.length) {
      alert(`Unable to delete #${normalizedTag} from ${failedEntries.length} file${failedEntries.length === 1 ? "" : "s"}. Files opened without write permission cannot be saved.`);
      return false;
    }

    return true;
  }

  function getComparableFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  if (createTagButton) {
    createTagButton.addEventListener("click", () => {
      const suggestedTag = tagManagementSearch?.value || "";
      const tag = window.prompt("Create tag:", suggestedTag);
      createTag(tag);
    });
  }

  if (deleteTagButton) {
    deleteTagButton.addEventListener("click", () => {
      const suggestedTag = tagManagementSearch?.value || "";
      const tag = window.prompt("Delete tag:", suggestedTag);
      deleteTag(tag);
    });
  }

  if (tagManagementSearch) {
    tagManagementSearch.addEventListener("input", renderTagManagementList);
    tagManagementSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      createTag(tagManagementSearch.value);
    });
  }

  function getTabTreeFileCandidates(tab) {
    if (!tab || tab.type === "graph") return [];
    return [tab.sourceFilePath, tab.sourceFileName, tab.title]
      .filter(Boolean)
      .map(getComparableFilePath);
  }

  function updateAutoSelectFileButtons() {
    const label = autoSelectFileEnabled ? "Auto select file Off" : "Auto select file On";
    const title = autoSelectFileEnabled ? "Disable Auto select file" : "Enable Auto select file";

    toggleAutoSelectFileButtons.forEach(function(button) {
      const labelElement = button.querySelector(".auto-select-file-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = isFolderOpen ? title : "Open a folder to enable Auto select file";
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(autoSelectFileEnabled));
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !isFolderOpen;
        button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      }
    });
  }

  function hasCollapsedFolderTreeDetails() {
    return !!folderTreeRoot && Array.from(folderTreeRoot.querySelectorAll("details")).some(function(details) {
      return !details.open;
    });
  }

  function updateFolderTreeExpandToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const shouldExpand = hasCollapsedFolderTreeDetails();
    const title = !hasFolder
      ? "Open a folder to expand or collapse folders"
      : shouldExpand
        ? "Expand all folders"
        : "Collapse all folders";
    const iconClass = shouldExpand ? "bi bi-arrows-expand" : "bi bi-arrows-collapse";

    folderTreeExpandToggleButtons.forEach(function(button) {
      const icon = button.querySelector("i");
      if (icon) icon.className = iconClass;
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function setAllFolderTreeDetails(open) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll("details").forEach(function(details) {
      resetFolderTreeAnimation(details, getFolderTreeChildrenContainer(details));
      details.open = open;
    });
    updateFolderTreeExpandToggleButtons();
  }

  function getUnsupportedFileToggleButtons() {
    return document.querySelectorAll(".toggle-unsupported-files");
  }

  function getFolderTreeGraphViewButtons() {
    return document.querySelectorAll(".folder-tree-tool-button.open-graph-view");
  }

  function getFolderTreeGraphExportButtons() {
    return document.querySelectorAll(".export-folder-to-graph");
  }

  function getTagManagementMenuButtons() {
    return document.querySelectorAll(".tag-management-menu-button");
  }

  function getVisibleFolderTreeNodes(nodes) {
    return (nodes || []).reduce(function(visibleNodes, node) {
      if (node.kind === "directory") {
        const visibleChildren = getVisibleFolderTreeNodes(node.children || []);
        visibleNodes.push({ ...node, children: visibleChildren });
        return visibleNodes;
      }

      if (showUnsupportedFolderFiles || isSupportedFolderTreeDocumentNode(node)) {
        visibleNodes.push(node);
      }
      return visibleNodes;
    }, []);
  }

  function getFolderTreeNodePathKey(node) {
    return getComparableFilePath(node?.fullPath || node?.path || node?.file?.webkitRelativePath || node?.file?.name || node?.name || "");
  }

  function getFolderTreeNodeTags(node) {
    if (!node || node.kind !== "file") return [];
    if (Array.isArray(node.tags)) return normalizeFileTagList(node.tags);
    const nodePathKey = getFolderTreeNodePathKey(node);
    const matchingEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      return entryPathKey && nodePathKey && entryPathKey === nodePathKey;
    });
    return normalizeFileTagList(matchingEntry?.tags || []);
  }

  function getTagFilteredFolderTreeNodes(nodes) {
    const selectedTags = Array.from(selectedFolderTreeTags || []);
    if (!selectedTags.length) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      if (node.kind === "directory") {
        const filteredChildren = getTagFilteredFolderTreeNodes(node.children || []);
        if (filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      const nodeTags = getFolderTreeNodeTags(node);
      if (selectedTags.some((tag) => nodeTags.includes(tag))) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function toggleFolderTreeTagFilter(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) return;
    selectedFolderTreeTags = new Set(selectedFolderTreeTags);
    if (selectedFolderTreeTags.has(normalizedTag)) {
      selectedFolderTreeTags.delete(normalizedTag);
    } else {
      selectedFolderTreeTags.add(normalizedTag);
    }
    renderTagManagementList();
    renderFilteredFolderTree();
  }

  function getFilteredFolderTreeNodes(nodes, filterText) {
    const normalizedFilter = String(filterText || "").trim().toLowerCase();
    if (!normalizedFilter) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      const nameMatches = String(node.name || "").toLowerCase().includes(normalizedFilter);

      if (node.kind === "directory") {
        const filteredChildren = getFilteredFolderTreeNodes(node.children || [], normalizedFilter);
        if (nameMatches || filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      if (nameMatches) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function renderFilteredFolderTree() {
    if (!folderTreeRoot || !isFolderOpen) return;
    const visibleNodes = getVisibleFolderTreeNodes(currentFolderTreeNodes);
    const tagFilteredNodes = getTagFilteredFolderTreeNodes(visibleNodes);
    const nodes = getFilteredFolderTreeNodes(tagFilteredNodes, folderTreeFilterText);
    renderFolderTree(nodes, { preserveNodes: true, skipTagRefresh: true });
    if (folderTreeFilterText || selectedFolderTreeTags.size) {
      setAllFolderTreeDetails(true);
    }
  }

  function updateFolderTreeFilterControls() {
    const hasFolder = !!isFolderOpen;
    const isVisible = !!(folderTreeFilterInput && !folderTreeFilterInput.hidden);
    folderTreeFilterToggleButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = hasFolder ? "Filter files and folders" : "Open a folder to filter files and folders";
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      button.setAttribute("aria-expanded", String(hasFolder && isVisible));
      button.setAttribute("aria-pressed", String(hasFolder && (isVisible || !!folderTreeFilterText)));
    });

    if (folderTreeFilterInput) {
      folderTreeFilterInput.disabled = !hasFolder;
      if (!hasFolder) {
        folderTreeFilterInput.value = "";
        folderTreeFilterInput.hidden = true;
      }
    }
  }

  function getFolderSortLabel(mode) {
    const labels = {
      "name-asc": "File name (A to Z)",
      "name-desc": "File name (Z to A)",
      "modified-desc": "Modified time (new to old)",
      "modified-asc": "Modified time (old to new)",
      "created-desc": "Created time (new to old)",
      "created-asc": "Created time (old to new)"
    };
    return labels[getValidFolderSortMode(mode)];
  }

  function updateFolderTreeSortControls() {
    const hasFolder = !!isFolderOpen;
    const activeLabel = getFolderSortLabel(currentFolderSortMode);
    const title = hasFolder ? `Sort files and folders: ${activeLabel}` : "Open a folder to sort files and folders";

    folderTreeSortMenuButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });

    folderTreeSortOptionButtons.forEach(function(button) {
      const isActive = button.dataset.folderSort === currentFolderSortMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
  }

  function updateUnsupportedFileToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const label = showUnsupportedFolderFiles ? "Hide unsupported file types" : "Show unsupported file types";
    const title = hasFolder ? `${label} in the folder view` : "Open a folder to show unsupported file types";

    getUnsupportedFileToggleButtons().forEach(function(button) {
      const labelElement = button.querySelector(".unsupported-files-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      }
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !hasFolder;
        button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      }
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(hasFolder && showUnsupportedFolderFiles));
    });
  }

  function updateFolderTreeGraphViewButtons() {
    const hasFolder = !!isFolderOpen;
    const title = hasFolder ? "Open Graph View" : "Open a folder to open Graph View";
    getFolderTreeGraphViewButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateFolderTreeGraphExportButtons() {
    const hasFolder = !!isFolderOpen;
    const label = "Export Folder to Graph";
    const description = "Create a portable graph archive that includes Markdown file contents.";
    const title = hasFolder ? description : "Create a portable graph archive that includes Markdown file contents.";
    getFolderTreeGraphExportButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateTagManagementMenuButtons() {
    const hasFolder = !!isFolderOpen;
    const title = hasFolder ? "Manage tags" : "Open a folder to manage tags";
    getTagManagementMenuButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
    [createTagButton, deleteTagButton, tagManagementSearch].forEach(function(control) {
      if (!control) return;
      control.disabled = !hasFolder;
      control.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function setShowUnsupportedFolderFiles(enabled) {
    showUnsupportedFolderFiles = !!enabled;
    saveGlobalState({ showUnsupportedFolderFiles });
    updateUnsupportedFileToggleButtons();
    renderFilteredFolderTree();
  }

  function updateFolderTreeToolbarState() {
    updateAutoSelectFileButtons();
    updateFolderTreeGraphViewButtons();
    updateFolderTreeGraphExportButtons();
    updateTagManagementMenuButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeExpandToggleButtons();
    updateFolderTreeFilterControls();
    updateFolderTreeSortControls();
  }

  function setAutoSelectFileEnabled(enabled) {
    autoSelectFileEnabled = !!enabled;
    saveGlobalState({ autoSelectFileEnabled });
    updateAutoSelectFileButtons();
    syncFolderTreeSelectionToActiveTab({ scroll: autoSelectFileEnabled });
  }

  function findFolderTreeFileButtonForTab(tab) {
    if (!folderTreeRoot) return null;
    const candidates = getTabTreeFileCandidates(tab);
    if (!candidates.length) return null;

    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find(function(button) {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path, button.dataset.name, button.textContent]
        .filter(Boolean)
        .map(getComparableFilePath);

      return candidates.some(function(candidate) {
        return buttonCandidates.some(function(buttonCandidate) {
          return buttonCandidate === candidate || buttonCandidate.endsWith(`/${candidate}`) || candidate.endsWith(`/${buttonCandidate}`);
        });
      });
    }) || null;
  }

  function syncFolderTreeSelectionToActiveTab(options = {}) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach(function(button) {
      button.classList.remove("auto-selected");
      button.removeAttribute("aria-current");
    });

    if (!autoSelectFileEnabled) return;

    const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
    const selectedButton = findFolderTreeFileButtonForTab(activeTab);
    if (!selectedButton) return;

    selectedButton.classList.add("auto-selected");
    selectedButton.setAttribute("aria-current", "page");

    if (options.scroll !== false) {
      selectedButton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  themePreferences.initializeTheme();

  const rendererConfig = window.registerMarkdownViewerRendererConfig(app, {
    marked,
    hljs,
    mermaid
  });
  rendererConfig.initialize();
  const initMermaid = rendererConfig.initMermaid;

  const GITHUB_ALERT_META = {
    note: {
      label: "Note",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z",
    },
    tip: {
      label: "Tip",
      viewBox: "0 0 384 512",
      path: "M297.2 248.9C311.6 228.3 320 203.2 320 176c0-70.7-57.3-128-128-128S64 105.3 64 176c0 27.2 8.4 52.3 22.8 72.9c3.7 5.3 8.1 11.3 12.8 17.7c0 0 0 0 0 0c12.9 17.7 28.3 38.9 39.8 59.8c10.4 19 15.7 38.8 18.3 57.5L109 384c-2.2-12-5.9-23.7-11.8-34.5c-9.9-18-22.2-34.9-34.5-51.8c0 0 0 0 0 0s0 0 0 0c-5.2-7.1-10.4-14.2-15.4-21.4C27.6 247.9 16 213.3 16 176C16 78.8 94.8 0 192 0s176 78.8 176 176c0 37.3-11.6 71.9-31.4 100.3c-5 7.2-10.2 14.3-15.4 21.4c0 0 0 0 0 0s0 0 0 0c-12.3 16.8-24.6 33.7-34.5 51.8c-5.9 10.8-9.6 22.5-11.8 34.5l-48.6 0c2.6-18.7 7.9-38.6 18.3-57.5c11.5-20.9 26.9-42.1 39.8-59.8c0 0 0 0 0 0s0 0 0 0s0 0 0 0c4.7-6.4 9-12.4 12.7-17.7zM192 128c-26.5 0-48 21.5-48 48c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-44.2 35.8-80 80-80c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0 384c-44.2 0-80-35.8-80-80l0-16 160 0 0 16c0 44.2-35.8 80-80 80z",
    },
    important: {
      label: "Important",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z",
    },
    warning: {
      label: "Warning",
      viewBox: "0 0 512 512",
      path: "M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z",
    },
    caution: {
      label: "Caution",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z",
    },
  };
  const GITHUB_ALERT_MARKER_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+|$)/i;

  function enhanceGitHubAlerts(container) {
    if (!container) return;

    const blockquotes = container.querySelectorAll("blockquote");
    blockquotes.forEach((blockquote) => {
      let firstParagraph = null;
      for (const child of blockquote.children) {
        if (child.tagName === "P") {
          firstParagraph = child;
          break;
        }
      }
      if (!firstParagraph) return;

      const firstParagraphHtml = firstParagraph.innerHTML.trim();
      const markerMatch = firstParagraphHtml.match(GITHUB_ALERT_MARKER_REGEX);
      if (!markerMatch) return;

      const alertType = markerMatch[1].toLowerCase();
      blockquote.classList.add("markdown-alert", `markdown-alert-${alertType}`);

      const title = document.createElement("p");
      title.className = "markdown-alert-title";
      const alertMeta = GITHUB_ALERT_META[alertType] || { label: markerMatch[1], path: "" };
      const icon = document.createElement("span");
      icon.className = "markdown-alert-icon";
      icon.setAttribute("aria-hidden", "true");

      if (alertMeta.path) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", alertMeta.viewBox || "0 0 512 512");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", alertMeta.path);
        svg.appendChild(path);
        icon.appendChild(svg);
      }

      const label = document.createElement("span");
      label.textContent = alertMeta.label;
      title.appendChild(icon);
      title.appendChild(label);

      blockquote.insertBefore(title, blockquote.firstChild);

      const remainingHtml = firstParagraphHtml
        .replace(GITHUB_ALERT_MARKER_REGEX, "")
        .trim();
      if (remainingHtml) {
        firstParagraph.innerHTML = remainingHtml;
      } else {
        firstParagraph.remove();
      }
    });
  }

  function parseFrontmatter(markdown) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (!match) return { frontmatter: null, body: markdown };
    try {
      const data = jsyaml.load(match[1]) || {};
      return { frontmatter: data, body: markdown.slice(match[0].length) };
    } catch (e) {
      console.warn('Frontmatter YAML parse error:', e);
      return { frontmatter: null, body: markdown };
    }
  }

  function renderFrontmatterValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (Array.isArray(value)) {
      const allPrimitive = value.every(v => v === null || typeof v !== 'object');
      if (allPrimitive) {
        return value
          .map(v => `<span class="fm-tag">${escapeHtml(String(v ?? ''))}</span>`)
          .join('');
      }
      return `<pre class="fm-complex">${escapeHtml(jsyaml.dump(value).trimEnd())}</pre>`;
    }
    if (typeof value === 'object') {
      return `<pre class="fm-complex">${escapeHtml(jsyaml.dump(value).trimEnd())}</pre>`;
    }
    return escapeHtml(String(value));
  }

  function renderFrontmatterTable(data) {
    const rows = Object.entries(data).map(([key, value]) =>
      `<tr><th>${escapeHtml(key)}</th><td>${renderFrontmatterValue(value)}</td></tr>`
    );
    return `<table class="frontmatter-table"><tbody>${rows.join('')}</tbody></table>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


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


  const sampleMarkdown = `---
title: Welcome to ShayBC Markdown-Viewer
description: A client-side GitHub-flavored Markdown editor and previewer with tabs, graph workflows, math, diagrams, imports, and export tools.
author: ShayBC
tags: ["markdown", "preview", "mermaid", "latex", "graph", "open-source"]
updated: 2026-05-09
repository: https://github.com/ShayBC/Markdown-Viewer
---

# Welcome to ShayBC Markdown-Viewer

ShayBC Markdown-Viewer is a modern, client-side Markdown workspace for writing, previewing, importing, organizing, and exporting Markdown documents. This welcome document appears when the app starts with no saved tabs and when all tabs are reset.

- **Repository:** [github.com/ShayBC/Markdown-Viewer](https://github.com/ShayBC/Markdown-Viewer)
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
- Emoji shortcode support plus native Unicode emoji 😄
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
    Start[Open ShayBC Markdown-Viewer] --> Write[Write or import Markdown]
    Write --> Preview[Preview instantly]
    Preview --> Export{Need output?}
    Export -->|Yes| Files[Export MD, HTML, or PDF]
    Export -->|No| KeepWriting[Keep writing]
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

## 🆚 Feature Snapshot

| Capability | ShayBC Markdown-Viewer |
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

## 📝 Formatting Examples

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, <mark>highlighting</mark>, and <u>underlines</u>.

Chemical formulas: H<sub>2</sub>O and CO<sub>2</sub>  
Keyboard shortcuts: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> to export Markdown.

> [!TIP]
> Drag Markdown files into the app or use the import menu to bring in existing documentation quickly.

## 🔗 Helpful Links

- [ShayBC Markdown-Viewer repository](https://github.com/ShayBC/Markdown-Viewer)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
- [Mermaid documentation](https://mermaid.js.org/)
- [MathJax documentation](https://docs.mathjax.org/)

---

## 🛡️ Security and Privacy

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
  let activeGraphStaleComparison = null;
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
  const LIGHTWEIGHT_SAVED_GRAPH_TEXT_SEARCH_MESSAGE = "Text search is unavailable because this saved graph view does not contain file contents. Use Update graph to search current files, or open Export Folder to Graph.";
  const DEFAULT_GRAPH_VIEW_CONFIG = Object.freeze({
    showTags: false,
    hiddenTagIds: [],
    hiddenNodeIds: [],
    selectedTagIds: [],
    groups: [],
    searchQuery: "",
    showArrows: true,
    textFadeThreshold: 0.35,
    nodeSize: 0.8,
    linkThickness: 1,
    centerForce: 1,
    repelForce: 650,
    linkForce: 0.4,
    linkDistance: 170
  });

  renderTagManagementList();

  function normalizeGraphTagNodeId(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";
    if (rawValue.startsWith("tag:")) return `tag:${normalizeTagName(rawValue.slice(4))}`;
    return `tag:${normalizeTagName(rawValue)}`;
  }

  function normalizeGraphTagNodeIds(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(normalizeGraphTagNodeId)
      .filter((tagId) => tagId && tagId !== "tag:")));
  }

  function clampGraphNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  function createGraphGroupId(seed) {
    const rawSeed = String(seed || "graph-group");
    let hash = 2166136261;
    for (let i = 0; i < rawSeed.length; i += 1) {
      hash ^= rawSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `graph-group-${(hash >>> 0).toString(36)}`;
  }

  function normalizeGraphGroupColor(value, fallback) {
    const fallbackColor = String(fallback || "#7c3aed").trim() || "#7c3aed";
    const rawValue = String(value || "").trim();
    if (!rawValue) return fallbackColor;
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawValue)) return rawValue;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", rawValue)) return rawValue;
    return fallbackColor;
  }

  function getGraphColorInputValue(value) {
    const color = normalizeGraphGroupColor(value, GRAPH_GROUP_DEFAULT_COLORS[0]);
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((digit) => digit + digit).join("")}`;
    }
    return GRAPH_GROUP_DEFAULT_COLORS[0];
  }

  function getNextDefaultGraphGroupColor(groups) {
    const groupCount = Array.isArray(groups) ? groups.length : 0;
    return GRAPH_GROUP_DEFAULT_COLORS[groupCount % GRAPH_GROUP_DEFAULT_COLORS.length];
  }

  function normalizeGraphGroups(groups) {
    const seenIds = new Set();
    return (Array.isArray(groups) ? groups : [])
      .map((group) => {
        const source = group && typeof group === "object" ? group : {};
        const query = String(source.query || "").trim();
        const color = normalizeGraphGroupColor(source.color, GRAPH_GROUP_DEFAULT_COLORS[0]);
        const baseId = String(source.id || "").trim() || createGraphGroupId(`${query}:${color}`);
        let id = baseId;
        let suffix = 2;
        while (seenIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        seenIds.add(id);
        return {
          id,
          query,
          color,
          enabled: source.enabled !== false
        };
      });
  }

  function normalizeGraphViewConfig(config) {
    const source = config && typeof config === "object" ? config : {};
    return {
      ...DEFAULT_GRAPH_VIEW_CONFIG,
      ...source,
      showTags: source.showTags === true,
      hiddenTagIds: normalizeGraphTagNodeIds(source.hiddenTagIds),
      hiddenNodeIds: Array.from(new Set((Array.isArray(source.hiddenNodeIds) ? source.hiddenNodeIds : [])
        .map((nodeId) => String(nodeId || "").trim())
        .filter(Boolean))),
      selectedTagIds: normalizeGraphTagNodeIds(source.selectedTagIds),
      groups: normalizeGraphGroups(source.groups),
      searchQuery: String(source.searchQuery || "").trim().toLowerCase(),
      showArrows: source.showArrows !== false,
      textFadeThreshold: clampGraphNumber(source.textFadeThreshold, DEFAULT_GRAPH_VIEW_CONFIG.textFadeThreshold, 0, 1),
      nodeSize: clampGraphNumber(source.nodeSize, DEFAULT_GRAPH_VIEW_CONFIG.nodeSize, 0.4, 1.8),
      linkThickness: clampGraphNumber(source.linkThickness, DEFAULT_GRAPH_VIEW_CONFIG.linkThickness, 0.5, 4),
      centerForce: clampGraphNumber(source.centerForce, DEFAULT_GRAPH_VIEW_CONFIG.centerForce, 0, 2),
      repelForce: clampGraphNumber(source.repelForce, DEFAULT_GRAPH_VIEW_CONFIG.repelForce, 0, 1200),
      linkForce: clampGraphNumber(source.linkForce, DEFAULT_GRAPH_VIEW_CONFIG.linkForce, 0, 1),
      linkDistance: clampGraphNumber(source.linkDistance, DEFAULT_GRAPH_VIEW_CONFIG.linkDistance, 40, 320)
    };
  }

  function cloneGraphPersistenceValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      console.warn("Failed to clone graph persistence value:", e);
      return null;
    }
  }

  function normalizeGraphTimestamp(value, fallback) {
    const timestamp = typeof value === "string" ? Date.parse(value) : Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
  }

  function normalizeGraphSnapshot(snapshot) {
    const normalizedSnapshot = cloneGraphPersistenceValue(snapshot || null);
    if (!normalizedSnapshot || typeof normalizedSnapshot !== "object") return normalizedSnapshot;

    if (Array.isArray(normalizedSnapshot.nodes)) {
      normalizedSnapshot.nodes = normalizedSnapshot.nodes.map((node) => ({
        ...node,
        type: node?.type || "file",
        status: node?.status || "current"
      }));
    }

    if (Array.isArray(normalizedSnapshot.links)) {
      normalizedSnapshot.links = normalizedSnapshot.links.map((link) => ({
        ...link,
        type: link?.type || "link",
        status: link?.status || "current"
      }));
    }

    return normalizedSnapshot;
  }

  function graphSnapshotHasEmbeddedFileContent(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.files)) return false;
    return snapshot.files.some((file) => file && typeof file === "object" && Object.prototype.hasOwnProperty.call(file, "content"));
  }

  function getGraphFileKey(file) {
    if (!file) return "";
    const source = file && typeof file === "object" ? file : { path: file };
    const path = source.path || source.fullPath || source.file?.webkitRelativePath || source.file?.name || source.name || "";
    if (path) return normalizeGraphNodeName(path);
    return String(source.id || "").trim().toLowerCase();
  }

  function getGraphLinkEndpointKey(endpoint) {
    if (!endpoint) return "";
    if (typeof endpoint === "object") {
      return String(endpoint.id || getGraphFileKey(endpoint) || "").trim().toLowerCase();
    }
    return String(endpoint || "").trim().toLowerCase();
  }

  function getGraphLinkKey(link) {
    if (!link) return "";
    const source = getGraphLinkEndpointKey(link.source);
    const target = getGraphLinkEndpointKey(link.target);
    if (!source || !target) return "";
    return `${source}->${target}:${link.type || "link"}`;
  }

  function getGraphSnapshotFilesForComparison(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return [];
    const files = Array.isArray(snapshot.files) ? snapshot.files : [];
    if (files.length) return files;
    return (Array.isArray(snapshot.nodes) ? snapshot.nodes : []).filter((node) => (node?.type || "file") === "file");
  }

  function getGraphSnapshotLinksForComparison(snapshot) {
    return (Array.isArray(snapshot?.links) ? snapshot.links : [])
      .filter((link) => (link?.type || "link") !== "tag");
  }

  function getGraphTagRelationKeys(snapshot) {
    const relationKeys = new Set();

    (Array.isArray(snapshot?.links) ? snapshot.links : [])
      .filter((link) => (link?.type || "link") === "tag")
      .forEach((link) => {
        const key = getGraphLinkKey({ ...link, type: "tag" });
        if (key) relationKeys.add(key);
      });

    getGraphSnapshotFilesForComparison(snapshot).forEach((file) => {
      const fileKey = getGraphFileKey(file);
      if (!fileKey) return;
      normalizeFileTagList(file.tags || getFileTagsFromContent(file.content || "")).forEach((tag) => {
        const tagId = normalizeGraphTagNodeId(tag);
        if (tagId && tagId !== "tag:") relationKeys.add(`${fileKey}->${tagId}:tag`);
      });
    });

    return Array.from(relationKeys).sort();
  }

  function compareGraphCollections(savedItems, currentItems, keyGetter) {
    const savedByKey = new Map();
    const currentByKey = new Map();

    (savedItems || []).forEach((item) => {
      const key = keyGetter(item);
      if (key && !savedByKey.has(key)) savedByKey.set(key, item);
    });

    (currentItems || []).forEach((item) => {
      const key = keyGetter(item);
      if (key && !currentByKey.has(key)) currentByKey.set(key, item);
    });

    return {
      currentOnly: Array.from(currentByKey.entries())
        .filter(([key]) => !savedByKey.has(key))
        .map(([, item]) => item),
      savedOnly: Array.from(savedByKey.entries())
        .filter(([key]) => !currentByKey.has(key))
        .map(([, item]) => item)
    };
  }

  function compareGraphViewToCurrentFolder(savedSnapshot, currentSnapshot) {
    const fileComparison = compareGraphCollections(
      getGraphSnapshotFilesForComparison(savedSnapshot),
      getGraphSnapshotFilesForComparison(currentSnapshot),
      getGraphFileKey
    );
    const linkComparison = compareGraphCollections(
      getGraphSnapshotLinksForComparison(savedSnapshot),
      getGraphSnapshotLinksForComparison(currentSnapshot),
      getGraphLinkKey
    );
    const tagRelationComparison = compareGraphCollections(
      getGraphTagRelationKeys(savedSnapshot),
      getGraphTagRelationKeys(currentSnapshot),
      (key) => key
    );

    const result = {
      newFiles: fileComparison.currentOnly,
      savedOnlyFiles: fileComparison.savedOnly,
      newLinks: linkComparison.currentOnly,
      savedOnlyLinks: linkComparison.savedOnly,
      newTagRelations: tagRelationComparison.currentOnly,
      savedOnlyTagRelations: tagRelationComparison.savedOnly
    };

    result.counts = {
      newFiles: result.newFiles.length,
      savedOnlyFiles: result.savedOnlyFiles.length,
      newLinks: result.newLinks.length,
      savedOnlyLinks: result.savedOnlyLinks.length,
      newTagRelations: result.newTagRelations.length,
      savedOnlyTagRelations: result.savedOnlyTagRelations.length
    };

    return result;
  }

  function hasGraphComparisonChanges(comparison) {
    const counts = comparison?.counts || {};
    return [
      counts.newFiles,
      counts.savedOnlyFiles,
      counts.newLinks,
      counts.savedOnlyLinks,
      counts.newTagRelations,
      counts.savedOnlyTagRelations
    ].some((count) => Number(count) > 0);
  }

  function buildCompareGraphSnapshot(savedSnapshot, currentSnapshot, comparison) {
    const sourceCurrentSnapshot = currentSnapshot && typeof currentSnapshot === "object" ? currentSnapshot : {};
    const sourceSavedSnapshot = savedSnapshot && typeof savedSnapshot === "object" ? savedSnapshot : {};
    const nodes = [];
    const links = [];
    const files = [];
    const nodesById = new Map();
    const linksByKey = new Map();
    const savedNodesById = new Map((Array.isArray(sourceSavedSnapshot.nodes) ? sourceSavedSnapshot.nodes : [])
      .map((node) => [String(node?.id || "").trim(), node])
      .filter(([id]) => id));
    const savedFilesById = new Map(getGraphSnapshotFilesForComparison(sourceSavedSnapshot)
      .map((file) => [String(file?.id || getGraphFileKey(file) || "").trim(), file])
      .filter(([id]) => id));

    const addNode = (node, status = "current") => {
      const nodeId = String(node?.id || getGraphFileKey(node) || "").trim();
      if (!nodeId || nodesById.has(nodeId)) return nodesById.get(nodeId) || null;
      const type = node?.type || (String(nodeId).startsWith("tag:") ? "tag" : "file");
      const nextNode = {
        ...node,
        id: nodeId,
        type,
        status
      };
      if (!nextNode.label) nextNode.label = type === "tag" ? getGraphTagLabelFromId(nodeId) : getGraphDisplayLabel(node?.path || node?.fullPath || nodeId);
      nodesById.set(nodeId, nextNode);
      nodes.push(nextNode);
      return nextNode;
    };

    const addFile = (file, status = "current") => {
      const fileId = String(file?.id || getGraphFileKey(file) || "").trim();
      if (!fileId) return;
      const node = savedNodesById.get(fileId) || file;
      addNode({
        ...node,
        id: fileId,
        type: "file",
        label: node?.label || getGraphDisplayLabel(file?.path || file?.fullPath || fileId),
        fullPath: node?.fullPath || file?.fullPath || file?.path || null,
        tags: node?.tags || file?.tags || []
      }, status);
      files.push({
        ...file,
        id: fileId,
        status
      });
    };

    const ensureNodeForEndpoint = (endpointId, status = "saved-only") => {
      const nodeId = String(endpointId || "").trim();
      if (!nodeId || nodesById.has(nodeId)) return;
      if (nodeId.startsWith("tag:")) {
        addNode({ id: nodeId, label: getGraphTagLabelFromId(nodeId), type: "tag", tag: nodeId.replace(/^tag:/, "") }, status);
        return;
      }
      const savedFile = savedFilesById.get(nodeId);
      const savedNode = savedNodesById.get(nodeId);
      addNode({
        ...(savedNode || savedFile || {}),
        id: nodeId,
        type: "file",
        label: savedNode?.label || getGraphDisplayLabel(savedFile?.path || savedFile?.fullPath || nodeId),
        fullPath: savedNode?.fullPath || savedFile?.fullPath || savedFile?.path || null,
        tags: savedNode?.tags || savedFile?.tags || []
      }, status);
      if (savedFile && !files.some((file) => file.id === nodeId)) files.push({ ...savedFile, id: nodeId, status });
    };

    const addLink = (link, status = "current") => {
      const source = getGraphLinkEndpointKey(link?.source);
      const target = getGraphLinkEndpointKey(link?.target);
      if (!source || !target) return;
      ensureNodeForEndpoint(source, status);
      ensureNodeForEndpoint(target, status);
      const type = link?.type || "link";
      const key = `${source}->${target}:${type}`;
      if (linksByKey.has(key)) return;
      linksByKey.set(key, true);
      links.push({
        ...link,
        source,
        target,
        type,
        status
      });
    };

    (Array.isArray(sourceCurrentSnapshot.nodes) ? sourceCurrentSnapshot.nodes : []).forEach((node) => addNode(node, "current"));
    getGraphSnapshotFilesForComparison(sourceCurrentSnapshot).forEach((file) => addFile(file, "current"));
    (Array.isArray(sourceCurrentSnapshot.links) ? sourceCurrentSnapshot.links : []).forEach((link) => addLink(link, "current"));

    (comparison?.savedOnlyFiles || []).forEach((file) => addFile(file, "saved-only"));
    (comparison?.savedOnlyLinks || []).forEach((link) => addLink(link, "saved-only"));
    (comparison?.savedOnlyTagRelations || []).forEach((relationKey) => {
      const relationMatch = String(relationKey || "").match(/^(.*)->(tag:[^:]+):tag$/);
      if (!relationMatch) return;
      addLink({ source: relationMatch[1], target: relationMatch[2], type: "tag" }, "saved-only");
    });

    return {
      version: sourceCurrentSnapshot.version || 1,
      folderName: sourceCurrentSnapshot.folderName || sourceSavedSnapshot.folderName || "Graph Comparison",
      createdAt: Date.now(),
      nodes,
      links,
      files
    };
  }

  function isKeepSavedGraphMode(tab) {
    return !!(tab && tab.type === "graph" && tab.keepSavedGraphMode);
  }


  function getGraphNodeNormalizedPath(node) {
    if (!node) return "";
    if ((node.type || "file") === "tag" || String(node.id || "").startsWith("tag:")) return "";
    return normalizeGraphNodeName(node.path || node.fullPath || node.id || node.name || "");
  }

  function getGraphSnapshotNodeIds(snapshot) {
    return new Set((Array.isArray(snapshot?.nodes) ? snapshot.nodes : [])
      .map((node) => String(node?.id || "").trim())
      .filter(Boolean));
  }

  function getGraphLayoutEntryByNormalizedPath(graphLayout, savedSnapshot, normalizedPath) {
    if (!graphLayout || !normalizedPath) return null;
    const directEntry = getSavedGraphNodeLayout(graphLayout, normalizedPath);
    if (directEntry) return directEntry;

    const savedNodes = Array.isArray(savedSnapshot?.nodes) ? savedSnapshot.nodes : [];
    const savedFiles = Array.isArray(savedSnapshot?.files) ? savedSnapshot.files : [];
    const savedCandidates = [...savedNodes, ...savedFiles];
    const matchingSavedNode = savedCandidates.find((candidate) => getGraphNodeNormalizedPath(candidate) === normalizedPath);
    return matchingSavedNode?.id ? getSavedGraphNodeLayout(graphLayout, matchingSavedNode.id) : null;
  }

  function getGraphLayoutEntryForSnapshotNode(graphLayout, savedSnapshot, node) {
    if (!graphLayout || !node?.id) return null;
    const directEntry = getSavedGraphNodeLayout(graphLayout, node.id);
    if (directEntry) return directEntry;
    if ((node.type || "file") === "tag") return null;
    return getGraphLayoutEntryByNormalizedPath(graphLayout, savedSnapshot, getGraphNodeNormalizedPath(node));
  }

  function shouldPreserveGraphZoomTransform(savedZoomTransform, preservedNodeCount) {
    return !!savedZoomTransform && preservedNodeCount > 0;
  }

  function preserveGraphLayoutForCurrentSnapshot(savedLayout, savedSnapshot, currentSnapshot) {
    const sourceLayout = savedLayout && typeof savedLayout === "object" ? savedLayout : {};
    const currentNodes = Array.isArray(currentSnapshot?.nodes) ? currentSnapshot.nodes : [];
    const nextNodes = {};

    currentNodes.forEach((node) => {
      if (!node?.id || (node.type || "file") === "tag") return;
      const savedEntry = getGraphLayoutEntryForSnapshotNode(sourceLayout, savedSnapshot, node);
      if (savedEntry) nextNodes[node.id] = cloneGraphPersistenceValue(savedEntry);
    });

    const nextLayout = {
      ...sourceLayout,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    const savedZoomTransform = getSavedGraphZoomTransform(sourceLayout);
    if (shouldPreserveGraphZoomTransform(savedZoomTransform, Object.keys(nextNodes).length)) nextLayout.zoom = savedZoomTransform;
    else {
      delete nextLayout.zoom;
      delete nextLayout.transform;
    }
    return nextLayout;
  }

  function preserveGraphLayoutForCompareSnapshot(savedLayout, savedSnapshot, compareSnapshot) {
    const sourceLayout = savedLayout && typeof savedLayout === "object" ? savedLayout : {};
    const compareNodes = Array.isArray(compareSnapshot?.nodes) ? compareSnapshot.nodes : [];
    const nextNodes = {};

    compareNodes.forEach((node) => {
      if (!node?.id) return;
      const savedEntry = getGraphLayoutEntryForSnapshotNode(sourceLayout, savedSnapshot, node);
      if (savedEntry) nextNodes[node.id] = cloneGraphPersistenceValue(savedEntry);
    });

    const nextLayout = {
      ...sourceLayout,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    const savedZoomTransform = getSavedGraphZoomTransform(sourceLayout);
    if (shouldPreserveGraphZoomTransform(savedZoomTransform, Object.keys(nextNodes).length)) nextLayout.zoom = savedZoomTransform;
    else {
      delete nextLayout.zoom;
      delete nextLayout.transform;
    }
    return nextLayout;
  }

  function preserveGraphConfigForCurrentSnapshot(savedConfig, currentSnapshot) {
    const normalizedConfig = normalizeGraphViewConfig(savedConfig);
    const currentNodeIds = getGraphSnapshotNodeIds(currentSnapshot);
    const currentTagIds = new Set(Array.from(currentNodeIds).filter((nodeId) => nodeId.startsWith("tag:")));

    normalizedConfig.hiddenNodeIds = normalizedConfig.hiddenNodeIds.filter((nodeId) => currentNodeIds.has(nodeId));
    normalizedConfig.hiddenTagIds = normalizedConfig.hiddenTagIds.filter((tagId) => currentTagIds.has(tagId));
    normalizedConfig.selectedTagIds = normalizedConfig.selectedTagIds.filter((tagId) => currentTagIds.has(tagId));

    if (Array.isArray(normalizedConfig.allowedNodeIds)) {
      normalizedConfig.allowedNodeIds = normalizedConfig.allowedNodeIds.filter((nodeId) => currentNodeIds.has(nodeId));
    }
    if (normalizedConfig.focusNodeId && !currentNodeIds.has(normalizedConfig.focusNodeId)) {
      delete normalizedConfig.focusNodeId;
      delete normalizedConfig.mode;
    }

    return normalizedConfig;
  }

  function applyCurrentFolderSnapshotToSavedGraphTab(tab, currentSnapshot, options = {}) {
    if (!tab || tab.type !== "graph" || !currentSnapshot) return false;
    const savedSnapshot = options.savedSnapshot || tab.graphSnapshot || tab.graphDocument?.snapshot || null;
    const savedLayout = options.savedLayout !== undefined
      ? options.savedLayout
      : (tab.graphLayout !== undefined ? tab.graphLayout : (tab.graphDocument?.graphLayout ?? tab.graphDocument?.layout));
    const savedConfig = options.savedConfig !== undefined
      ? options.savedConfig
      : (tab.graphViewConfig || tab.graphDocument?.viewConfig || null);

    tab.graphSnapshot = currentSnapshot;
    tab.graphViewConfig = preserveGraphConfigForCurrentSnapshot(savedConfig, currentSnapshot);
    tab.graphLayout = preserveGraphLayoutForCurrentSnapshot(savedLayout, savedSnapshot, currentSnapshot);
    tab.folderName = tab.folderName || currentSnapshot.folderName || "Graph View";
    tab.graphDocument = serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    return true;
  }

  let graphUpdateBannerTimeout = null;
  let activeGraphComparisonDetailsModel = null;

  function showGraphUpdatedBanner() {
    showGraphBanner("Graph updated from current folder. Saved layout was preserved where possible.");
  }

  function showSavedGraphModeBanner(tab) {
    const detailsModel = tab?.savedGraphComparisonDetails || null;
    showGraphBanner("Saved graph mode — current folder changes are ignored.", detailsModel);
  }

  function showGraphBanner(message, detailsModel = null) {
    let banner = document.getElementById("graph-update-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "graph-update-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.style.position = "fixed";
      banner.style.left = "50%";
      banner.style.bottom = "24px";
      banner.style.transform = "translateX(-50%)";
      banner.style.zIndex = "2147483647";
      banner.style.maxWidth = "min(92vw, 640px)";
      banner.style.padding = "10px 14px";
      banner.style.borderRadius = "999px";
      banner.style.background = "#111827";
      banner.style.color = "#ffffff";
      banner.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.25)";
      banner.style.fontSize = "0.92rem";
      banner.style.fontWeight = "600";
      banner.style.textAlign = "center";
      document.body.appendChild(banner);
    }

    banner.innerHTML = "";
    const messageSpan = document.createElement("span");
    messageSpan.textContent = message;
    banner.appendChild(messageSpan);
    if (detailsModel) {
      banner.appendChild(document.createTextNode(" "));
      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "graph-update-banner-details-button";
      detailsButton.textContent = "View details";
      detailsButton.style.color = "#93c5fd";
      detailsButton.addEventListener("click", () => openGraphComparisonDetailsModal(detailsModel));
      banner.appendChild(detailsButton);
    }
    banner.classList.remove("hidden");
    window.clearTimeout(graphUpdateBannerTimeout);
    graphUpdateBannerTimeout = window.setTimeout(() => {
      banner.classList.add("hidden");
    }, detailsModel ? 8000 : 4500);
  }

  function ensureSavedGraphModePill() {
    if (!graphViewToolbar) return null;
    let pill = graphViewToolbar.querySelector(".saved-graph-mode-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "saved-graph-mode-pill hidden";
      pill.setAttribute("role", "status");
      pill.setAttribute("aria-live", "polite");
      const panelHeading = graphViewToolbar.querySelector(".graph-filter-panel-heading");
      if (panelHeading?.nextSibling) {
        graphViewToolbar.insertBefore(pill, panelHeading.nextSibling);
      } else {
        graphViewToolbar.prepend(pill);
      }
    }
    return pill;
  }

  function updateSavedGraphModePill(tab) {
    const pill = ensureSavedGraphModePill();
    if (!pill) return;
    const isGraphTab = !!(tab && tab.type === "graph");
    const isCompareMode = !!tab?.graphComparisonSnapshot;
    const isSavedMode = isKeepSavedGraphMode(tab);
    pill.classList.toggle("hidden", !isGraphTab);
    pill.innerHTML = "";
    if (!isGraphTab) return;

    pill.classList.toggle("compare-mode", isCompareMode);
    pill.classList.toggle("saved-mode", isSavedMode && !isCompareMode);
    pill.classList.toggle("current-folder-mode", !isSavedMode && !isCompareMode);

    const label = document.createElement("span");
    label.textContent = isCompareMode ? "Compare" : (isSavedMode ? "Saved graph" : "Current folder");
    pill.appendChild(label);
    if (isSavedMode && !isCompareMode && tab?.savedGraphComparisonDetails) {
      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "saved-graph-mode-details-button";
      detailsButton.textContent = "View details";
      detailsButton.addEventListener("click", () => openGraphComparisonDetailsModal(tab.savedGraphComparisonDetails));
      pill.appendChild(detailsButton);
    }
  }

  function getGraphComparisonSummaryCounts(comparison) {
    const counts = comparison?.counts || {};
    return {
      newFiles: counts.newFiles || 0,
      savedOnlyFiles: counts.savedOnlyFiles || 0,
      changedConnections: (counts.newLinks || 0) + (counts.savedOnlyLinks || 0),
      changedTags: (counts.newTagRelations || 0) + (counts.savedOnlyTagRelations || 0)
    };
  }

  function getGraphFileDifferenceLabel(file) {
    if (!file) return "Unknown file";
    return file.path || file.fullPath || file.name || file.id || "Unknown file";
  }

  function createGraphComparisonLabelLookup(savedSnapshot, currentSnapshot) {
    const labels = new Map();
    const addLabel = (id, label) => {
      const key = String(id || "").trim();
      const value = String(label || "").trim();
      if (key && value && !labels.has(key)) labels.set(key, value);
    };
    [currentSnapshot, savedSnapshot].forEach((snapshot) => {
      getGraphSnapshotFilesForComparison(snapshot).forEach((file) => {
        const label = getGraphFileDifferenceLabel(file);
        addLabel(file?.id, label);
        addLabel(getGraphFileKey(file), label);
        addLabel(file?.path, label);
        addLabel(file?.fullPath, label);
      });
      (Array.isArray(snapshot?.nodes) ? snapshot.nodes : []).forEach((node) => {
        const nodeId = String(node?.id || "").trim();
        if (!nodeId) return;
        if (nodeId.startsWith("tag:")) {
          addLabel(nodeId, `#${getGraphTagLabelFromId(nodeId)}`);
          return;
        }
        addLabel(nodeId, node?.path || node?.fullPath || node?.label || nodeId);
      });
    });
    return labels;
  }

  function getGraphComparisonEndpointLabel(endpoint, labels) {
    const endpointKey = getGraphLinkEndpointKey(endpoint) || String(endpoint || "").trim();
    if (!endpointKey) return "unknown";
    if (endpointKey.startsWith("tag:")) return `#${getGraphTagLabelFromId(endpointKey)}`;
    return labels.get(endpointKey) || endpointKey;
  }

  function getGraphLinkDifferenceLabel(link, labels = new Map()) {
    if (!link) return "Unknown connection";
    const source = getGraphComparisonEndpointLabel(link.source, labels);
    const target = getGraphComparisonEndpointLabel(link.target, labels);
    return `${source} → ${target}`;
  }

  function getGraphTagRelationDifferenceLabel(relationKey, labels = new Map()) {
    const rawKey = String(relationKey || "");
    const relationMatch = rawKey.match(/^(.*)->(tag:[^:]+):tag$/);
    if (!relationMatch) return rawKey || "Unknown tag";
    const fileLabel = labels.get(relationMatch[1]) || relationMatch[1];
    return `${fileLabel} → #${relationMatch[2].replace(/^tag:/, "")}`;
  }

  function createGraphComparisonSection(title, items, formatter) {
    return {
      title,
      items: (items || []).map((item) => String(formatter(item) || "").trim()).filter(Boolean)
    };
  }

  function buildGraphComparisonDetailsModel(comparison, savedSnapshot, currentSnapshot) {
    const labels = createGraphComparisonLabelLookup(savedSnapshot, currentSnapshot);
    return {
      sections: [
        createGraphComparisonSection("New in current folder", comparison?.newFiles || [], getGraphFileDifferenceLabel),
        createGraphComparisonSection("Only in saved graph", comparison?.savedOnlyFiles || [], getGraphFileDifferenceLabel),
        createGraphComparisonSection("New connections", comparison?.newLinks || [], (link) => getGraphLinkDifferenceLabel(link, labels)),
        createGraphComparisonSection("Saved-only connections", comparison?.savedOnlyLinks || [], (link) => getGraphLinkDifferenceLabel(link, labels)),
        createGraphComparisonSection("New tags", comparison?.newTagRelations || [], (relationKey) => getGraphTagRelationDifferenceLabel(relationKey, labels)),
        createGraphComparisonSection("Saved-only tags", comparison?.savedOnlyTagRelations || [], (relationKey) => getGraphTagRelationDifferenceLabel(relationKey, labels))
      ]
    };
  }

  function renderGraphComparisonDetailsModel(model) {
    const sections = Array.isArray(model?.sections) ? model.sections : [];
    if (!sections.length) {
      return '<p class="graph-comparison-details-empty">No graph comparison details are available.</p>';
    }
    return sections.map((section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      const body = items.length
        ? `<ul class="graph-comparison-details-list">${items.map((item) => `<li class="graph-comparison-details-item">${escapeHtml(String(item))}</li>`).join("")}</ul>`
        : '<p class="graph-comparison-details-empty">None</p>';
      return `<section class="graph-comparison-details-section"><h6>${escapeHtml(String(section.title || "Details"))}</h6>${body}</section>`;
    }).join("");
  }

  function openGraphComparisonDetailsModal(model) {
    if (!graphComparisonDetailsModal || !graphComparisonDetailsContent) return;
    activeGraphComparisonDetailsModel = model || activeGraphComparisonDetailsModel;
    graphComparisonDetailsContent.innerHTML = renderGraphComparisonDetailsModel(activeGraphComparisonDetailsModel);
    graphComparisonDetailsModal.classList.remove("hidden");
    graphComparisonDetailsModal.setAttribute("aria-hidden", "false");
    graphComparisonDetailsContent.focus({ preventScroll: true });
  }

  function closeGraphComparisonDetailsModal() {
    if (!graphComparisonDetailsModal) return;
    graphComparisonDetailsModal.classList.add("hidden");
    graphComparisonDetailsModal.setAttribute("aria-hidden", "true");
  }

  function hideGraphStaleModal() {
    activeGraphStaleComparison = null;
    if (!graphStaleModal) return;
    graphStaleModal.classList.add("hidden");
    graphStaleModal.setAttribute("aria-hidden", "true");
  }

  function showGraphStaleModal(tab, savedSnapshot, currentSnapshot, comparison) {
    if (!graphStaleModal) return;
    const detailsModel = buildGraphComparisonDetailsModel(comparison, savedSnapshot, currentSnapshot);
    activeGraphStaleComparison = { tabId: tab?.id || null, savedSnapshot, currentSnapshot, comparison, detailsModel };
    activeGraphComparisonDetailsModel = detailsModel;
    const summary = getGraphComparisonSummaryCounts(comparison);
    if (graphStaleNewFilesCount) graphStaleNewFilesCount.textContent = String(summary.newFiles);
    if (graphStaleSavedOnlyFilesCount) graphStaleSavedOnlyFilesCount.textContent = String(summary.savedOnlyFiles);
    if (graphStaleChangedConnectionsCount) graphStaleChangedConnectionsCount.textContent = String(summary.changedConnections);
    if (graphStaleChangedTagsCount) graphStaleChangedTagsCount.textContent = String(summary.changedTags);
    graphStaleModal.classList.remove("hidden");
    graphStaleModal.setAttribute("aria-hidden", "false");
    graphStaleUpdateButton?.focus({ preventScroll: true });
  }

  async function promptForStaleSavedGraphIfNeeded(tab, options = {}) {
    const shouldPromptWhileKeepingSavedGraph = options.force === true;
    if (!tab?.graphSnapshot || !folderMarkdownFiles.length || (!shouldPromptWhileKeepingSavedGraph && isKeepSavedGraphMode(tab))) return;
    const graphDocumentType = tab.graphDocument?.documentType || inferLegacyGraphDocumentType(tab.graphSnapshot);
    if (graphDocumentType !== GRAPH_DOCUMENT_TYPE_VIEW) return;

    try {
      const currentSnapshot = await createGraphSnapshot(folderMarkdownFiles.slice(), activeFolderName || tab.folderName || tab.title);
      const comparison = compareGraphViewToCurrentFolder(tab.graphSnapshot, currentSnapshot);
      if (hasGraphComparisonChanges(comparison)) {
        showGraphStaleModal(tab, tab.graphSnapshot, currentSnapshot, comparison);
      }
    } catch (error) {
      console.warn("Failed to compare saved graph with the current folder:", error);
    }
  }

  function keepSavedGraphFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    const tab = tabs.find((candidate) => candidate.id === staleComparison?.tabId) || getActiveGraphTab();
    if (tab?.type === "graph") {
      tab.keepSavedGraphMode = true;
      tab.savedGraphComparisonDetails = staleComparison?.detailsModel || null;
      delete tab.graphComparisonSnapshot;
      delete tab.graphComparisonLayout;
      saveTabsToStorage(tabs);
      if (activeTabId === tab.id) {
        updateSavedGraphModePill(tab);
        showSavedGraphModeBanner(tab);
      }
    }
    hideGraphStaleModal();
  }

  async function updateGraphFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    if (!staleComparison?.currentSnapshot) return;
    const tab = tabs.find((candidate) => candidate.id === staleComparison.tabId) || getActiveGraphTab();
    if (!tab || tab.type !== "graph") return;

    applyCurrentFolderSnapshotToSavedGraphTab(tab, staleComparison.currentSnapshot, {
      savedSnapshot: staleComparison.savedSnapshot,
      savedLayout: tab.graphLayout,
      savedConfig: tab.graphViewConfig
    });
    delete tab.graphComparisonSnapshot;
    delete tab.graphComparisonLayout;
    delete tab.savedGraphComparisonDetails;
    tab.keepSavedGraphMode = false;
    markGraphTabAsChanged(tab);
    saveTabsToStorage(tabs);
    hideGraphStaleModal();
    if (activeTabId === tab.id) {
      graphRenderCache.delete(tab.id);
      renderGraphView();
      showGraphUpdatedBanner();
    }
  }

  function loadGraphComparisonFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    if (!staleComparison?.currentSnapshot || !staleComparison?.savedSnapshot) return;
    const tab = tabs.find((candidate) => candidate.id === staleComparison.tabId) || getActiveGraphTab();
    if (!tab || tab.type !== "graph") return;

    tab.graphComparisonSnapshot = buildCompareGraphSnapshot(
      staleComparison.savedSnapshot,
      staleComparison.currentSnapshot,
      staleComparison.comparison
    );
    tab.graphComparisonLayout = preserveGraphLayoutForCompareSnapshot(
      tab.graphLayout,
      staleComparison.savedSnapshot,
      tab.graphComparisonSnapshot
    );
    tab.savedGraphComparisonDetails = staleComparison.detailsModel || buildGraphComparisonDetailsModel(
      staleComparison.comparison,
      staleComparison.savedSnapshot,
      staleComparison.currentSnapshot
    );
    hideGraphStaleModal();
    if (activeTabId === tab.id) {
      graphRenderCache.delete(tab.id);
      renderGraphView();
    }
  }

  function shouldPreserveGraphSnapshotFullPath(snapshotFile) {
    return !!(snapshotFile?.fullPath && isNeutralinoRuntime());
  }

  function stripGraphSnapshotContent(snapshot) {
    const strippedSnapshot = cloneGraphPersistenceValue(snapshot || null);
    if (!strippedSnapshot || typeof strippedSnapshot !== "object") return strippedSnapshot;

    strippedSnapshot.nodes = Array.isArray(strippedSnapshot.nodes) ? cloneGraphPersistenceValue(strippedSnapshot.nodes) : [];
    strippedSnapshot.links = Array.isArray(strippedSnapshot.links) ? cloneGraphPersistenceValue(strippedSnapshot.links) : [];
    strippedSnapshot.files = (Array.isArray(strippedSnapshot.files) ? strippedSnapshot.files : [])
      .map((snapshotFile) => {
        const source = snapshotFile && typeof snapshotFile === "object" ? snapshotFile : {};
        const strippedFile = {
          id: source.id || normalizeGraphNodeName(source.path || source.fullPath || source.name || ""),
          path: source.path || "",
          name: source.name || getFileName(source.path || source.fullPath || "document.md"),
          tags: normalizeFileTagList(source.tags || [])
        };
        if (shouldPreserveGraphSnapshotFullPath(source)) strippedFile.fullPath = source.fullPath;
        return strippedFile;
      });

    return strippedSnapshot;
  }

  function serializeGraphViewDocument(tab) {
    const graphDocument = serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    return normalizeGraphDocument({
      ...graphDocument,
      documentType: GRAPH_DOCUMENT_TYPE_VIEW,
      snapshot: stripGraphSnapshotContent(graphDocument.snapshot)
    });
  }

  function serializeGraphExportDocument(tab) {
    return serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_EXPORT });
  }

  function getExplicitGraphDocumentType(source) {
    if (!source || typeof source !== "object") return "";
    if (Object.prototype.hasOwnProperty.call(source, "documentType")) {
      return typeof source.documentType === "string" ? source.documentType.trim() : "";
    }

    // Accept a document-level `type` alias for imported graph documents, but avoid
    // treating persisted application tab types such as `graph` as graph document types.
    const explicitTypeAlias = typeof source.type === "string" ? source.type.trim() : "";
    return GRAPH_DOCUMENT_TYPES.has(explicitTypeAlias) ? explicitTypeAlias : "";
  }

  function inferLegacyGraphDocumentType(snapshot) {
    // Legacy graph documents did not include a document type. Files with embedded
    // snapshot file content are full exports; files without embedded content are
    // view-only graph documents.
    return graphSnapshotHasEmbeddedFileContent(snapshot) ? GRAPH_DOCUMENT_TYPE_EXPORT : GRAPH_DOCUMENT_TYPE_VIEW;
  }

  function normalizeGraphDocumentType(source, snapshot) {
    const explicitDocumentType = getExplicitGraphDocumentType(source);
    if (GRAPH_DOCUMENT_TYPES.has(explicitDocumentType)) return explicitDocumentType;

    if (Object.prototype.hasOwnProperty.call(source, "documentType")) {
      throw new Error(`Unsupported graph document type: ${String(source.documentType || "(empty)")}.`);
    }

    const typeAlias = typeof source.type === "string" ? source.type.trim() : "";
    if (typeAlias && typeAlias !== "graph" && typeAlias !== "markdown" && looksLikeGraphDocument(source)) {
      throw new Error(`Unsupported graph document type: ${typeAlias}.`);
    }

    return inferLegacyGraphDocumentType(snapshot);
  }

  function getGraphDocumentKind(source, snapshot) {
    const explicitDocumentType = getExplicitGraphDocumentType(source);
    if (GRAPH_DOCUMENT_TYPES.has(explicitDocumentType)) {
      return { documentType: explicitDocumentType, isLegacy: false };
    }

    return { documentType: inferLegacyGraphDocumentType(snapshot), isLegacy: true };
  }

  function validateParsedGraphDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("The selected JSON file is not a valid graph document.");
    }

    if (Object.prototype.hasOwnProperty.call(document, "documentType")) {
      const documentType = typeof document.documentType === "string" ? document.documentType.trim() : "";
      if (!GRAPH_DOCUMENT_TYPES.has(documentType)) {
        throw new Error(`Unsupported graph document type: ${String(document.documentType || "(empty)")}. Supported types are ${GRAPH_DOCUMENT_TYPE_EXPORT} and ${GRAPH_DOCUMENT_TYPE_VIEW}.`);
      }
    }

    const typeAlias = typeof document.type === "string" ? document.type.trim() : "";
    if (typeAlias && typeAlias !== "graph" && typeAlias !== "markdown" && !GRAPH_DOCUMENT_TYPES.has(typeAlias) && looksLikeGraphDocument(document)) {
      throw new Error(`Unsupported graph document type: ${typeAlias}. Supported types are ${GRAPH_DOCUMENT_TYPE_EXPORT} and ${GRAPH_DOCUMENT_TYPE_VIEW}.`);
    }

    if (!looksLikeGraphDocument(document)) {
      throw new Error("The selected JSON file is not a Markdown Viewer graph file.");
    }
  }

  function normalizeGraphDocument(document) {
    const source = document && typeof document === "object" ? document : {};
    const snapshot = normalizeGraphSnapshot(source.snapshot || source.graphSnapshot || null);
    const documentType = normalizeGraphDocumentType(source, snapshot);
    const hasViewConfig = Object.prototype.hasOwnProperty.call(source, "viewConfig");
    const viewConfig = normalizeGraphViewConfig(cloneGraphPersistenceValue(hasViewConfig ? source.viewConfig : (source.graphViewConfig || null)));
    const layoutSource = source.graphLayout !== undefined ? source.graphLayout : (
      source.graphLayoutData !== undefined ? source.graphLayoutData : (
        source.layout !== undefined ? source.layout : source.layoutData
      )
    );
    const createdAt = normalizeGraphTimestamp(source.createdAt || snapshot?.createdAt, Date.now());
    const normalized = {
      schemaVersion: source.schemaVersion || GRAPH_DOCUMENT_SCHEMA_VERSION,
      documentType,
      folderName: source.folderName || snapshot?.folderName || source.title || "Graph View",
      createdAt,
      updatedAt: normalizeGraphTimestamp(source.updatedAt, createdAt),
      snapshot,
      viewConfig
    };

    if (layoutSource !== undefined && layoutSource !== null) {
      normalized.graphLayout = cloneGraphPersistenceValue(layoutSource);
    }

    return normalized;
  }

  function serializeGraphTab(tab, options) {
    const existingDocument = tab?.graphDocument && typeof tab.graphDocument === "object" ? tab.graphDocument : {};
    return normalizeGraphDocument({
      ...existingDocument,
      documentType: options?.documentType || existingDocument.documentType,
      folderName: tab?.folderName || tab?.title || existingDocument.folderName || "Graph View",
      createdAt: existingDocument.createdAt || tab?.createdAt,
      updatedAt: Date.now(),
      snapshot: tab?.graphSnapshot !== undefined ? tab.graphSnapshot : existingDocument.snapshot,
      viewConfig: tab?.graphViewConfig !== undefined ? tab.graphViewConfig : existingDocument.viewConfig,
      graphLayout: tab?.graphLayout !== undefined ? tab.graphLayout : (existingDocument.graphLayout !== undefined ? existingDocument.graphLayout : existingDocument.layout)
    });
  }

  function deserializeGraphDocument(document) {
    const normalizedDocument = normalizeGraphDocument(document);
    const graphData = {
      folderName: normalizedDocument.folderName,
      graphSnapshot: normalizedDocument.snapshot,
      graphViewConfig: normalizedDocument.viewConfig,
      graphDocument: normalizedDocument
    };

    if (Object.prototype.hasOwnProperty.call(normalizedDocument, "graphLayout")) {
      graphData.graphLayout = normalizedDocument.graphLayout;
    }

    return graphData;
  }

  function syncGraphTabDocument(tab) {
    if (!tab || tab.type !== "graph") return tab;
    const graphDocument = serializeGraphTab(tab);
    tab.folderName = graphDocument.folderName;
    tab.graphSnapshot = graphDocument.snapshot;
    tab.graphViewConfig = graphDocument.viewConfig;
    tab.graphDocument = graphDocument;
    if (Object.prototype.hasOwnProperty.call(graphDocument, "graphLayout")) tab.graphLayout = graphDocument.graphLayout;
    return tab;
  }

  function getActiveGraphTab() {
    return tabs.find((tab) => tab.id === activeTabId && tab.type === "graph") || null;
  }

  function getSuggestedGraphFileName(tab) {
    const rawName = (tab?.folderName || tab?.title || "graph-view").trim() || "graph-view";
    const safeName = rawName.replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "graph-view";
    return /\.mdviewer-graph\.json$/i.test(safeName) ? safeName : `${safeName}.mdviewer-graph.json`;
  }

  function isFileBackedGraphTab(tab) {
    return !!(tab && tab.type === "graph" && (tab.sourceFileHandle || tab.sourceFilePath || tab.sourceFileName));
  }

  function markGraphTabAsChanged(tab) {
    if (!isFileBackedGraphTab(tab)) return;
    tab.graphHasUnsavedChanges = true;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  function clearGraphTabUnsavedChanges(tab) {
    if (!tab || tab.type !== "graph") return;
    tab.graphHasUnsavedChanges = false;
  }

  function getGraphFileSignature(files) {
    return (files || []).map((fileEntry) => {
      const file = fileEntry.file || fileEntry;
      return {
        path: fileEntry.path || file?.webkitRelativePath || file?.name || "",
        name: file?.name || "",
        size: file?.size || 0,
        lastModified: file?.lastModified || 0
      };
    });
  }

  function getGraphViewSignature(files, graphViewConfig) {
    return JSON.stringify({
      files: getGraphFileSignature(files),
      config: graphViewConfig || null
    });
  }

  async function createGraphSnapshot(files, folderName) {
    const nodes = [];
    const links = [];
    const seenEdges = new Set();
    const nodeIndex = new Map();
    const snapshotFiles = [];

    for (const fileEntry of (files || [])) {
      const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || "";
      const name = getFileName(path || fileEntry.file?.name || "document.md");
      const content = await readFolderMarkdownFileContent(fileEntry);
      const fileContent = content || "";
      const tags = getFileTagsFromContent(fileContent);
      const id = normalizeGraphNodeName(path);
      nodeIndex.set(id, path);
      nodes.push({ id, label: getGraphDisplayLabel(path), fullPath: path, type: "file", status: "current", tags });
      snapshotFiles.push({
        id,
        path,
        name,
        content: fileContent,
        fullPath: fileEntry.fullPath || null,
        status: "current",
        tags
      });
    }

    const tagIndex = new Map();

    for (const snapshotFile of snapshotFiles) {
      const source = snapshotFile.id;
      (snapshotFile.tags || []).forEach((tag) => {
        const normalizedTag = normalizeTagName(tag);
        if (!normalizedTag) return;
        const tagNodeId = `tag:${normalizedTag}`;
        if (!tagIndex.has(tagNodeId)) {
          tagIndex.set(tagNodeId, normalizedTag);
          nodes.push({
            id: tagNodeId,
            label: `#${normalizedTag}`,
            type: "tag",
            status: "current",
            tag: normalizedTag
          });
        }
        const edgeKey = `${source}->${tagNodeId}:tag`;
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        links.push({ source, target: tagNodeId, type: "tag", status: "current" });
      });
    }

    for (const snapshotFile of snapshotFiles) {
      const source = snapshotFile.id;
      extractMarkdownLinks(snapshotFile.content).forEach((ref) => {
        const target = resolveGraphTargetId(ref, snapshotFile.path, nodeIndex);
        if (!target || target === source) return;
        const edgeKey = `${source}->${target}:link`;
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        links.push({ source, target, type: "link", status: "current" });
      });
    }

    return {
      version: 1,
      folderName: folderName || "Graph View",
      createdAt: Date.now(),
      nodes,
      links,
      files: snapshotFiles
    };
  }

  function getGraphSnapshotSignature(snapshot, graphViewConfig) {
    return JSON.stringify({
      snapshot: {
        version: snapshot?.version || 0,
        folderName: snapshot?.folderName || "",
        createdAt: snapshot?.createdAt || 0,
        nodes: (snapshot?.nodes || []).map((node) => `${node.id}:${node.status || "current"}`),
        links: (snapshot?.links || []).map((link) => `${link.source}->${link.target}:${link.type || "link"}:${link.status || "current"}`)
      },
      config: graphViewConfig || null
    });
  }

  function toFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function formatGraphZoomPercent(zoomScale) {
    const scale = Number.isFinite(Number(zoomScale)) && Number(zoomScale) > 0 ? Number(zoomScale) : 1;
    return `${Math.round(scale * 100)}%`;
  }

  function getGraphZoomScaleFromLayout(graphLayout) {
    return getSavedGraphZoomTransform(graphLayout)?.k || 1;
  }

  function getSavedGraphNodeLayout(graphLayout, nodeId) {
    if (!graphLayout || !nodeId) return null;
    if (graphLayout.nodes && typeof graphLayout.nodes === "object") return graphLayout.nodes[nodeId] || null;
    if (Array.isArray(graphLayout.nodePositions)) {
      return graphLayout.nodePositions.find((entry) => entry && entry.id === nodeId) || null;
    }
    return null;
  }

  function applySavedGraphLayout(nodes, graphLayout) {
    (nodes || []).forEach((node) => {
      const savedNode = getSavedGraphNodeLayout(graphLayout, node.id);
      if (!savedNode) return;
      const x = toFiniteNumber(savedNode.x);
      const y = toFiniteNumber(savedNode.y);
      const fx = toFiniteNumber(savedNode.fx);
      const fy = toFiniteNumber(savedNode.fy);
      if (x !== null) node.x = x;
      if (y !== null) node.y = y;
      if (fx !== null) node.fx = fx;
      if (fy !== null) node.fy = fy;
    });
  }

  function getSavedGraphZoomTransform(graphLayout) {
    const zoom = graphLayout?.zoom || graphLayout?.transform || null;
    if (!zoom) return null;
    const x = toFiniteNumber(zoom.x);
    const y = toFiniteNumber(zoom.y);
    const k = toFiniteNumber(zoom.k ?? zoom.scale);
    if (x === null || y === null || k === null || k <= 0) return null;
    return { x, y, k };
  }

  function captureGraphLayout(tab, nodes, zoomTransform, options) {
    if (!tab || tab.type !== "graph") return null;
    const storePinnedPositions = !!options?.storePinnedPositions;
    const isCompareMode = !!tab.graphComparisonSnapshot;
    const layoutSource = isCompareMode ? (tab.graphComparisonLayout || tab.graphLayout) : tab.graphLayout;
    const existingLayout = layoutSource && typeof layoutSource === "object" ? layoutSource : {};
    const existingNodes = existingLayout.nodes && typeof existingLayout.nodes === "object" ? existingLayout.nodes : {};
    const nextNodes = { ...existingNodes };

    (nodes || []).forEach((node) => {
      if (!node?.id) return;
      const x = toFiniteNumber(node.x);
      const y = toFiniteNumber(node.y);
      const fx = toFiniteNumber(node.fx);
      const fy = toFiniteNumber(node.fy);
      const entry = {};
      if (x !== null) entry.x = x;
      if (y !== null) entry.y = y;
      if (storePinnedPositions && fx !== null) entry.fx = fx;
      if (storePinnedPositions && fy !== null) entry.fy = fy;
      if (Object.keys(entry).length) nextNodes[node.id] = entry;
    });

    const zoom = zoomTransform ? { x: zoomTransform.x, y: zoomTransform.y, k: zoomTransform.k } : getSavedGraphZoomTransform(existingLayout);
    const nextLayout = {
      ...existingLayout,
      magneticEnabled: graphSettings.magneticEnabled,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    if (zoom) nextLayout.zoom = zoom;

    if (isCompareMode) {
      tab.graphComparisonLayout = nextLayout;
      return nextLayout;
    }

    tab.graphLayout = nextLayout;
    if (tab.graphDocument && typeof tab.graphDocument === "object") {
      tab.graphDocument.graphLayout = nextLayout;
      tab.graphDocument.updatedAt = Date.now();
    }
    return nextLayout;
  }

  function getGraphRenderWrappersForTab(tabId) {
    if (!graphViewCanvas || !tabId) return [];
    return Array.from(graphViewCanvas.querySelectorAll(".graph-tab-render"))
      .filter((wrapper) => wrapper.dataset.graphTabId === String(tabId));
  }

  function removeGraphRenderForTab(tabId) {
    if (!tabId) return;
    const entry = graphRenderCache.get(tabId);
    if (entry?.simulation) entry.simulation.stop();
    if (entry?.wrapper) entry.wrapper.remove();
    graphRenderCache.delete(tabId);
    getGraphRenderWrappersForTab(tabId).forEach((wrapper) => wrapper.remove());
  }

  function hideInactiveGraphRenders(activeGraphTabId) {
    graphRenderCache.forEach((entry, tabId) => {
      if (!entry || !entry.wrapper) return;
      entry.wrapper.classList.toggle("hidden", tabId !== activeGraphTabId);
    });
  }

  function suspendGraphRender(tabId) {
    const entry = graphRenderCache.get(tabId);
    if (entry && entry.simulation) entry.simulation.stop();
  }

  function suspendActiveGraphRender() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (activeTab && activeTab.type === "graph") suspendGraphRender(activeTab.id);
  }

  function loadTabsFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveTabsToStorage(tabsArr) {
    try {
      (tabsArr || []).forEach((tab) => syncGraphTabDocument(tab));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsArr));
    } catch (e) {
      console.warn('Failed to save tabs to localStorage:', e);
    }
  }

  function scheduleGraphLayoutStorageSave() {
    clearTimeout(graphLayoutSaveTimeout);
    graphLayoutSaveTimeout = setTimeout(() => {
      graphLayoutSaveTimeout = null;
      saveTabsToStorage(tabs);
    }, 750);
  }

  function loadActiveTabId() {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  }

  function saveActiveTabId(id) {
    localStorage.setItem(ACTIVE_TAB_KEY, id);
  }

  function loadUntitledCounter() {
    return parseInt(localStorage.getItem(UNTITLED_COUNTER_KEY) || '0', 10);
  }

  function saveUntitledCounter(val) {
    localStorage.setItem(UNTITLED_COUNTER_KEY, String(val));
  }

  const unsavedChanges = window.registerMarkdownViewerUnsavedChanges(app, {
    isFileBackedGraphTab
  });
  const normalizeEditorContent = unsavedChanges.normalizeEditorContent;
  const tabHasUnsavedChanges = unsavedChanges.tabHasUnsavedChanges;

  function nextUntitledTitle() {
    untitledCounter += 1;
    saveUntitledCounter(untitledCounter);
    return 'Untitled ' + untitledCounter;
  }

  function createTab(content, title, viewMode) {
    if (content === undefined) content = '';
    content = normalizeEditorContent(content);
    if (title === undefined) title = null;
    if (viewMode === undefined) viewMode = loadGlobalState().viewMode || 'split';
    return {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      title: title || 'Untitled',
      content: content,
      scrollPos: 0,
      viewMode: viewMode,
      createdAt: Date.now(),
      isTemporary: false,
      sourceFileName: null,
      sourceFileHandle: null,
      sourceFilePath: null,
      savedContent: content,
      type: "markdown",
      folderName: null,
      isUnsupportedFile: false
    };
  }

  function createGraphTab(folderName, options) {
    if (options === undefined) options = {};
    const graphDocument = normalizeGraphDocument({
      ...(options.graphDocument || {}),
      folderName: folderName || options.folderName || "Graph View",
      snapshot: options.graphSnapshot !== undefined ? options.graphSnapshot : options.graphDocument?.snapshot,
      viewConfig: options.graphViewConfig !== undefined ? options.graphViewConfig : options.graphDocument?.viewConfig,
      graphLayout: options.graphLayout !== undefined ? options.graphLayout : (options.graphDocument?.graphLayout !== undefined ? options.graphDocument.graphLayout : options.graphDocument?.layout)
    });
    const graphData = deserializeGraphDocument(graphDocument);
    const tab = createTab("", graphData.folderName, "preview");
    tab.type = "graph";
    tab.folderName = graphData.folderName;
    tab.graphViewConfig = graphData.graphViewConfig;
    tab.graphSnapshot = graphData.graphSnapshot;
    tab.graphDocument = graphData.graphDocument;
    if (options.graphScopeKey) tab.graphScopeKey = options.graphScopeKey;
    if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
    return tab;
  }

  function normalizeGraphScopePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/+$|^\s+|\s+$/g, "")
      .toLowerCase();
  }

  function createFolderGraphScopeKey(scope, value) {
    const normalizedPath = normalizeGraphScopePath(value);
    return normalizedPath ? `${scope}:${normalizedPath}` : "";
  }

  function getRootFolderGraphScopeKey() {
    return createFolderGraphScopeKey("root-folder", activeFolderPath || activeFolderName || "Graph View");
  }

  function findExistingFolderGraphTab(scopeKey, fallbackTitle) {
    if (!scopeKey && !fallbackTitle) return null;
    return tabs.find((tab) => {
      if (!tab || tab.type !== "graph" || isFileBackedGraphTab(tab)) return false;
      if (scopeKey && tab.graphScopeKey === scopeKey) return true;
      return !!(fallbackTitle && !tab.graphScopeKey && getGraphTabTitle(tab) === fallbackTitle);
    }) || null;
  }

  function focusExistingFolderGraphTab(scopeKey, fallbackTitle) {
    const existingGraphTab = findExistingFolderGraphTab(scopeKey, fallbackTitle);
    if (!existingGraphTab) return false;
    switchTab(existingGraphTab.id);
    saveActiveTabId(existingGraphTab.id);
    return true;
  }

  function getGraphTitleFromFileName(fileName) {
    return (fileName || "Saved Graph")
      .replace(/\.mdviewer-graph\.json$/i, "")
      .replace(/\.mdgraph\.json$/i, "")
      .replace(/\.json$/i, "");
  }

  function getGraphTabTitle(tab) {
    if (!tab || tab.type !== "graph") return tab?.title || 'Untitled';
    if (tab.sourceFileName) return getGraphTitleFromFileName(tab.sourceFileName) || "Saved Graph";
    if (tab.sourceFilePath) return getGraphTitleFromFileName(getFileName(tab.sourceFilePath)) || "Saved Graph";
    return tab.title || tab.folderName || "Graph View";
  }

  function getTabDisplayName(tab) {
    const baseName = tab && tab.type === "graph" ? getGraphTabTitle(tab) : (tab.title || 'Untitled');
    return tabHasUnsavedChanges(tab) ? baseName + ' *' : baseName;
  }

  function getTabTooltipText(tab) {
    if (!tab) return 'Untitled';
    return tab.sourceFilePath || tab.sourceFileName || tab.title || tab.folderName || 'Untitled';
  }

  function updateTabScrollControls() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const hasOverflow = tabList.scrollWidth > tabList.clientWidth + 1;
    scrollLeftBtn.classList.toggle('visible', hasOverflow);
    scrollRightBtn.classList.toggle('visible', hasOverflow);

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    scrollLeftBtn.disabled = !hasOverflow || tabList.scrollLeft <= 1;
    scrollRightBtn.disabled = !hasOverflow || tabList.scrollLeft >= maxScrollLeft - 1;
  }

  function scrollTabsBy(delta) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.scrollBy({ left: delta, behavior: 'smooth' });
    window.setTimeout(updateTabScrollControls, 180);
  }

  function setupTabScrolling() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const getScrollAmount = function() {
      return Math.max(160, Math.floor(tabList.clientWidth * 0.75));
    };

    scrollLeftBtn.addEventListener('click', function() {
      scrollTabsBy(-getScrollAmount());
    });

    scrollRightBtn.addEventListener('click', function() {
      scrollTabsBy(getScrollAmount());
    });

    tabList.addEventListener('wheel', function(e) {
      if (tabList.scrollWidth <= tabList.clientWidth) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      e.preventDefault();
      tabList.scrollLeft += delta;
      updateTabScrollControls();
    }, { passive: false });

    tabList.addEventListener('scroll', updateTabScrollControls);
    window.addEventListener('resize', updateTabScrollControls);
    updateTabScrollControls();
  }

  setupTabScrolling();

  function renderTabBar(tabsArr, currentActiveTabId) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;
    tabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('data-tab-id', tab.id);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('draggable', 'true');

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        const tabIcon = document.createElement("i");
        tabIcon.className = `bi ${getFileIconClass(tab.sourceFileName || tab.sourceFilePath || tab.title)} me-1`;
        titleSpan.appendChild(tabIcon);
        titleSpan.append(document.createTextNode(displayName));
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTab(tab.id, { promptForUnsaved: true });
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab);
      });

      item.addEventListener('dblclick', function() {
        pinTemporaryTab(tab.id);
      });

      item.addEventListener('dragstart', function() {
        draggedTabId = tab.id;
        setTimeout(function() { item.classList.add('dragging'); }, 0);
      });

      item.addEventListener('dragend', function() {
        item.classList.remove('dragging');
        draggedTabId = null;
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!draggedTabId || draggedTabId === tab.id) return;
        const fromIdx = tabs.findIndex(function(t) { return t.id === draggedTabId; });
        const toIdx = tabs.findIndex(function(t) { return t.id === tab.id; });
        if (fromIdx === -1 || toIdx === -1) return;
        const moved = tabs.splice(fromIdx, 1)[0];
        tabs.splice(toIdx, 0, moved);
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      });

      tabList.appendChild(item);
    });

    // "+ Create" button at end of tab list
    const newBtn = document.createElement('button');
    newBtn.className = 'tab-new-btn';
    newBtn.title = 'New Tab (Ctrl+T)';
    newBtn.setAttribute('aria-label', 'Open new tab');
    newBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    newBtn.addEventListener('click', function() { newTab(); });
    tabList.appendChild(newBtn);

    // Auto-scroll active tab into view
    const activeItem = tabList.querySelector('.tab-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    updateTabScrollControls();
    requestAnimationFrame(updateTabScrollControls);

    renderMobileTabList(tabsArr, currentActiveTabId);
    updateSaveCurrentFileButtons();
  }

  function renderMobileTabList(tabsArr, currentActiveTabId) {
    const mobileTabList = document.getElementById('mobile-tab-list');
    if (!mobileTabList) return;
    mobileTabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'mobile-tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('data-tab-id', tab.id);

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'mobile-tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        titleSpan.textContent = displayName;
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTab(tab.id, { promptForUnsaved: true });
        closeMobileMenu();
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
        closeMobileMenu();
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab, { closeMobileMenuOnAction: true });
      });

      mobileTabList.appendChild(item);
    });
  }

  let tabContextMenu = null;
  let tabContextTargetId = null;
  let tabContextCloseMobileMenuOnAction = false;

  function ensureTabContextMenu() {
    if (tabContextMenu) return tabContextMenu;

    tabContextMenu = document.createElement('div');
    tabContextMenu.className = 'graph-context-menu tab-context-menu hidden';
    tabContextMenu.setAttribute('role', 'menu');
    tabContextMenu.innerHTML =
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="rename"><i class="bi bi-pencil" aria-hidden="true"></i><span class="graph-context-menu-item-label">Rename</span></button>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="duplicate"><i class="bi bi-files" aria-hidden="true"></i><span class="graph-context-menu-item-label">Duplicate</span></button>' +
      '<div class="graph-context-menu-separator" aria-hidden="true"></div>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-others"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close others</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-all"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close all</span></button>';

    tabContextMenu.addEventListener('click', function(e) {
      e.stopPropagation();
      const actionBtn = e.target.closest('.tab-context-menu-action');
      if (!actionBtn || !tabContextTargetId) return;
      if (actionBtn.disabled) return;
      const action = actionBtn.getAttribute('data-action');
      const targetTab = tabs.find(function(tab) { return tab.id === tabContextTargetId; });
      const shouldCloseMobileMenu = tabContextCloseMobileMenuOnAction;
      hideTabContextMenu();
      if (!targetTab) return;
      if (action === 'rename') renameTab(targetTab.id);
      else if (action === 'duplicate') duplicateTab(targetTab.id);
      else if (action === 'close') closeTab(targetTab.id, { promptForUnsaved: true });
      else if (action === 'close-others') closeOtherTabs(targetTab.id);
      else if (action === 'close-all') closeAllTabs();
      if (shouldCloseMobileMenu) closeMobileMenu();
    });

    document.body.appendChild(tabContextMenu);
    return tabContextMenu;
  }

  function positionTabContextMenu(menu, event) {
    const margin = 8;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, event.clientX),
      Math.max(margin, window.innerWidth - rect.width - margin)
    );
    const top = Math.min(
      Math.max(margin, event.clientY),
      Math.max(margin, window.innerHeight - rect.height - margin)
    );
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function setTabContextMenuActionEnabled(menu, action, enabled) {
    const button = menu.querySelector('[data-action="' + action + '"]');
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.classList.toggle('disabled', !enabled);
  }

  function updateTabContextMenuActionStates(menu, tab) {
    const hasTargetTab = !!tab && tabs.some(function(openTab) { return openTab.id === tab.id; });
    setTabContextMenuActionEnabled(menu, 'close', hasTargetTab);
    setTabContextMenuActionEnabled(menu, 'close-others', hasTargetTab && tabs.length > 1);
    setTabContextMenuActionEnabled(menu, 'close-all', tabs.length > 0);
  }

  function showTabContextMenu(event, tab, options) {
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarContextMenus();
    hideTabContextMenu();

    tabContextTargetId = tab.id;
    tabContextCloseMobileMenuOnAction = !!(options && options.closeMobileMenuOnAction);
    const menu = ensureTabContextMenu();
    const isGraphTab = tab.type === 'graph';
    menu.querySelectorAll('[data-action="rename"], [data-action="duplicate"]').forEach(function(button) {
      button.classList.toggle('hidden', isGraphTab);
    });
    const separator = menu.querySelector('.graph-context-menu-separator');
    if (separator) separator.classList.toggle('hidden', isGraphTab);
    updateTabContextMenuActionStates(menu, tab);
    menu.classList.remove('hidden');
    positionTabContextMenu(menu, event);
  }

  function hideTabContextMenu() {
    if (tabContextMenu) tabContextMenu.classList.add('hidden');
    tabContextTargetId = null;
    tabContextCloseMobileMenuOnAction = false;
  }

  // Close any open tab context menu when clicking elsewhere in the document
  document.addEventListener('click', function() {
    hideTabContextMenu();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideTabContextMenu();
  });

  window.addEventListener('blur', hideTabContextMenu);

  function saveCurrentTabState() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) return;
    if (tab.type === "graph") return;
    tab.content = markdownEditor.value;
    tab.scrollPos = markdownEditor.scrollTop;
    tab.viewMode = isUnsupportedFileTab(tab) ? 'editor' : (currentViewMode || 'split');
    saveTabsToStorage(tabs);
  }

  function getActiveMarkdownTab() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab || tab.type === "graph") return null;
    return tab;
  }

  function activeTabHasUnsavedChanges() {
    const tab = getActiveMarkdownTab();
    return tabHasUnsavedChanges(tab, markdownEditor.value);
  }

  function getUnsavedTabs() {
    return tabs.filter(function(tab) {
      if (!tab) return false;
      if (tab.type === "graph") return tabHasUnsavedChanges(tab);
      const currentContent = tab.id === activeTabId ? markdownEditor.value : tab.content;
      return tabHasUnsavedChanges(tab, currentContent);
    });
  }

  const confirmDiscardUnsavedChangesBeforeExit = unsavedChanges.bindWindowExitGuards({
    getUnsavedTabs
  });

  function updateSaveCurrentFileButtons() {
    const graphTab = getActiveGraphTab();
    const tab = getActiveMarkdownTab();
    const hasUnsavedChanges = activeTabHasUnsavedChanges();
    const graphHasUnsavedChanges = tabHasUnsavedChanges(graphTab);
    const graphNeedsSave = !!(graphTab && (!isFileBackedGraphTab(graphTab) || graphHasUnsavedChanges));
    const hasWritableSource = !!(tab && (tab.sourceFileHandle || (isNeutralinoRuntime() && tab.sourceFilePath)));
    const title = graphTab
      ? "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included."
      : (hasUnsavedChanges
        ? (hasWritableSource ? "Save changes to current file" : "Save changes as Markdown")
        : "No changes to save");
    const label = graphTab ? "Save Graph View" : "Save Changes";

    document.querySelectorAll(".save-current-file-button").forEach(function(button) {
      button.disabled = graphTab ? !graphNeedsSave : !hasUnsavedChanges;
      button.title = graphTab && !graphNeedsSave ? "No graph changes to save" : title;
      button.setAttribute("aria-label", title);
      const icon = button.querySelector("i");
      button.textContent = "";
      if (icon) button.append(icon, document.createTextNode(` ${label}`));
      else button.textContent = label;
    });

    const unsavedCount = getUnsavedTabs().length;
    const saveAllTitle = unsavedCount
      ? `Save all unsaved changes in ${unsavedCount} tab${unsavedCount === 1 ? "" : "s"}`
      : "No changes to save";
    document.querySelectorAll(".save-all-files-button").forEach(function(button) {
      button.disabled = unsavedCount === 0;
      button.title = saveAllTitle;
      button.setAttribute("aria-label", saveAllTitle);
    });
  }

  async function saveChangedTab(tab) {
    if (!tab) return false;
    if (tab.type === "graph") {
      if (!tabHasUnsavedChanges(tab)) return true;
      return (await saveGraphTabToSource(tab)) || (await saveGraphTabWithSaveDialog(tab));
    }

    const content = getMarkdownTabContentForSave(tab);
    if (!tabHasUnsavedChanges(tab, content)) return true;
    return (await saveMarkdownTabToSource(tab)) || (await saveMarkdownTabWithSaveDialog(tab));
  }

  async function saveAllChangedTabs() {
    saveCurrentTabState();
    const changedTabs = getUnsavedTabs();
    if (!changedTabs.length) {
      updateSaveCurrentFileButtons();
      return;
    }

    const failedTabs = [];
    let wasCanceled = false;

    for (const tab of changedTabs) {
      try {
        const saved = await saveChangedTab(tab);
        if (!saved) {
          wasCanceled = true;
          break;
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          wasCanceled = true;
          break;
        }
        console.error("Failed to save changed tab:", error);
        failedTabs.push(getTabDisplayName(tab));
      }
    }

    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();

    if (failedTabs.length) {
      alert("Unable to save: " + failedTabs.join(", "));
    } else if (wasCanceled && getUnsavedTabs().length) {
      console.info("Save All canceled before all changed tabs were saved.");
    }
  }

  async function saveCurrentFileIfChanged() {
    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      if (isFileBackedGraphTab(activeGraphTab) && !tabHasUnsavedChanges(activeGraphTab)) {
        updateSaveCurrentFileButtons();
        return;
      }
      if (!(await saveActiveGraphToSource())) {
        await saveActiveGraphWithSaveDialog();
      }
      updateSaveCurrentFileButtons();
      return;
    }

    if (!activeTabHasUnsavedChanges()) {
      updateSaveCurrentFileButtons();
      return;
    }

    exportMd.click();
  }

  function restoreViewMode(mode) {
    currentViewMode = null;
    setViewMode(getAllowedViewModeForActiveTab(mode || loadGlobalState().viewMode || 'split'), false);
  }

  function switchTab(tabId) {
    if (tabId === activeTabId) return;
    suspendActiveGraphRender();
    saveCurrentTabState();
    activeTabId = tabId;
    saveActiveTabId(activeTabId);
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tab.type === "graph") {
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      syncFolderTreeSelectionToActiveTab();
      renderGraphView();
      return;
    }
    setGraphViewMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
  }



  function pinTemporaryTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab || !tab.isTemporary) return;
    tab.isTemporary = false;
    // Promote preview tab to a normal tab without marking it dirty.
    tab.savedContent = tab.content;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function findTemporaryTab() {
    return tabs.find(function(t) { return !!t.isTemporary; }) || null;
  }

  function applySidebarFileMetadata(tab, sourceFile) {
    tab.sourceFileName = sourceFile && sourceFile.name ? sourceFile.name : null;
    tab.sourceFileHandle = sourceFile && sourceFile.handle ? sourceFile.handle : null;
    tab.sourceFilePath = sourceFile && sourceFile.path ? sourceFile.path : null;
    tab.isUnsupportedFile = isUnsupportedSourceFile(sourceFile);
    if (tab.isUnsupportedFile) tab.viewMode = 'editor';
  }

  function isUnsupportedSourceFile(sourceFile) {
    if (!sourceFile) return false;
    if (sourceFile.isUnsupportedFile === true) return true;
    const path = sourceFile.path || sourceFile.name || sourceFile.file?.name || sourceFile.handle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function isUnsupportedFileTab(tab) {
    if (!tab || tab.type === "graph") return false;
    if (tab.isUnsupportedFile === true) return true;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function getActiveTab() {
    return tabs.find(function(tab) { return tab.id === activeTabId; }) || null;
  }

  function getAllowedViewModeForActiveTab(mode) {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.type === "graph") return 'preview';
    return isUnsupportedFileTab(activeTab) ? 'editor' : (mode || 'split');
  }

  function getDefaultViewModeForOpenedFile(sourceFile) {
    return isUnsupportedSourceFile(sourceFile) ? 'editor' : 'split';
  }

  function activateSidebarTab(tab) {
    activeTabId = tab.id;
    saveActiveTabId(activeTabId);
    setGraphViewMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
    markdownEditor.focus();
  }

  function openSidebarFileInTab(content, title, sourceFile, options) {
    options = options || {};
    const isTemporary = options.temporary !== false;
    saveCurrentTabState();

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return null;
    }

    if (!tab) {
      const normalizedContent = normalizeEditorContent(content);
      const requestedViewMode = getDefaultViewModeForOpenedFile(sourceFile);
      tab = createTab(normalizedContent, title || 'Untitled', requestedViewMode);
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
      tabs.push(tab);
    } else {
      const normalizedContent = normalizeEditorContent(content);
      tab.title = title || 'Untitled';
      tab.content = normalizedContent;
      tab.scrollPos = 0;
      tab.viewMode = getDefaultViewModeForOpenedFile(sourceFile);
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openSidebarFileInTemporaryTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: true });
  }

  function openSidebarFileInPermanentTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: false });
  }

  function findTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getMarkdownTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type !== "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function findGraphTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getGraphTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type === "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function showSavedGraphMissingPathDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "saved-graph-missing-file-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "saved-graph-missing-file-title");
      overlay.innerHTML = `
        <div class="saved-graph-missing-file-dialog">
          <p id="saved-graph-missing-file-title" class="saved-graph-missing-file-message">This file no longer exists at the saved path.</p>
          <div class="saved-graph-missing-file-actions">
            <button class="tool-button saved-graph-locate-file" type="button">Locate file</button>
            <button class="tool-button saved-graph-remove-file" type="button">Remove from graph</button>
            <button class="tool-button saved-graph-cancel-file" type="button">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = (action) => {
        overlay.remove();
        resolve(action);
      };

      overlay.querySelector(".saved-graph-locate-file")?.addEventListener("click", () => cleanup("locate"));
      overlay.querySelector(".saved-graph-remove-file")?.addEventListener("click", () => cleanup("remove"));
      overlay.querySelector(".saved-graph-cancel-file")?.addEventListener("click", () => cleanup("cancel"));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup("cancel");
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cleanup("cancel");
      });

      document.body.appendChild(overlay);
      overlay.querySelector(".saved-graph-locate-file")?.focus({ preventScroll: true });
    });
  }

  async function locateReplacementMarkdownFileForSavedGraphNode() {
    if (isNeutralinoRuntime() && Neutralino.os?.showOpenDialog) {
      const selected = await Neutralino.os.showOpenDialog("Locate Markdown file", {
        multiSelections: false,
        filters: [{ name: "Markdown files", extensions: ["md", "markdown"] }]
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return {
        name: getFileName(selectedPath),
        path: selectedPath,
        content: await Neutralino.filesystem.readFile(selectedPath)
      };
    }

    if (typeof window.showOpenFilePicker === "function") {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".md", ".markdown"] }
          }
        ]
      });
      const handle = handles && handles[0];
      if (!handle) return null;
      const file = await handle.getFile();
      return {
        name: file.name || handle.name || "document.md",
        handle,
        content: await file.text()
      };
    }

    alert("Locate file is available in browsers that support the file picker or in the desktop app.");
    return null;
  }

  async function openLocatedSavedGraphFile(graphNode) {
    try {
      const locatedFile = await locateReplacementMarkdownFileForSavedGraphNode();
      if (!locatedFile) return null;
      return openSidebarFileInPermanentTab(
        normalizeEditorContent(locatedFile.content || ""),
        getMarkdownTitleFromFileName(locatedFile.name || graphNode?.label || "document.md"),
        { name: locatedFile.name, handle: locatedFile.handle || null, path: locatedFile.path || null }
      );
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      console.error("Failed to locate saved graph file:", error);
      alert("Unable to open the located file.");
      return null;
    }
  }

  function removeSavedGraphNodeFromActiveTab(nodeId) {
    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    if (!activeGraphTab?.graphSnapshot || !nodeId) return;
    activeGraphTab.graphSnapshot = {
      ...activeGraphTab.graphSnapshot,
      nodes: (activeGraphTab.graphSnapshot.nodes || []).filter((node) => node.id !== nodeId),
      links: (activeGraphTab.graphSnapshot.links || []).filter((link) => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        return sourceId !== nodeId && targetId !== nodeId;
      }),
      files: (activeGraphTab.graphSnapshot.files || []).filter((file) => file.id !== nodeId)
    };
    activeGraphTab.graphDocument = serializeGraphTab(activeGraphTab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    markGraphTabAsChanged(activeGraphTab);
    saveTabsToStorage(tabs);
    graphRenderCache.delete(activeGraphTab.id);
    renderGraphView();
  }

  async function handleMissingSavedGraphNodePath(graphNode) {
    const action = await showSavedGraphMissingPathDialog();
    if (action === "locate") return openLocatedSavedGraphFile(graphNode);
    if (action === "remove") removeSavedGraphNodeFromActiveTab(graphNode?.id);
    return null;
  }

  async function openGraphNodeFileInPermanentTab(graphNode) {
    if (!graphNode) return null;

    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    const keepSavedMode = isKeepSavedGraphMode(activeGraphTab);
    const snapshotFile = activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id);
    const folderEntry = keepSavedMode ? null : (folderMarkdownFiles || []).find(function(entry) {
      return getGraphFileEntryNodeId(entry) === graphNode.id;
    });
    const fileEntry = snapshotFile || folderEntry;
    const readableFileEntry = keepSavedMode
      ? snapshotFile
      : ((fileEntry && typeof fileEntry.content === "string") ? fileEntry : (folderEntry || fileEntry));

    if (!fileEntry) {
      alert("Unable to find the selected file in this graph snapshot.");
      return null;
    }

    if (keepSavedMode && readableFileEntry?.content === undefined && !readableFileEntry?.handle && !(isNeutralinoRuntime() && readableFileEntry?.fullPath)) {
      return handleMissingSavedGraphNodePath(graphNode);
    }

    const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || graphNode.fullPath || null;
    const name = fileEntry.name || getFileName(path || graphNode.fullPath || graphNode.label || "document.md");
    const sourceFile = {
      name,
      handle: fileEntry.handle || readableFileEntry?.handle || null,
      path: fileEntry.fullPath || readableFileEntry?.fullPath || path
    };

    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    try {
      const content = await readFolderMarkdownFileContent(readableFileEntry);
      if (content === undefined || content === null) throw new Error("No readable Markdown file was provided.");
      if (!sourceFile.handle && readableFileEntry?.handle) sourceFile.handle = readableFileEntry.handle;
      if (readableFileEntry?.fullPath) sourceFile.path = readableFileEntry.fullPath;

      return openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), sourceFile);
    } catch (error) {
      console.error("Failed to open graph node file:", error);
      if (keepSavedMode) return handleMissingSavedGraphNodePath(graphNode);
      alert("Unable to open selected file.");
      return null;
    }
  }

  function newTab(content, title) {
    if (content === undefined) content = '';
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    if (!title) title = nextUntitledTitle();
    const tab = createTab(content, title);
    tabs.push(tab);
    switchTab(tab.id);
    markdownEditor.focus();
  }

  function closeTab(tabId, options) {
    if (options === undefined) options = {};
    const tabToClose = tabs.find(function(t) { return t.id === tabId; });
    if (!tabToClose) return;
    const hasUnsavedChanges = tabHasUnsavedChanges(tabToClose);
    if (options.promptForUnsaved && hasUnsavedChanges) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close this tab?');
      if (!shouldClose) return;
    }

    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx === -1) return;
    const cachedGraphRender = graphRenderCache.get(tabId);
    if (cachedGraphRender) {
      if (cachedGraphRender.simulation) cachedGraphRender.simulation.stop();
      if (cachedGraphRender.wrapper) cachedGraphRender.wrapper.remove();
      graphRenderCache.delete(tabId);
    }
    tabs.splice(idx, 1);
    if (tabs.length === 0) {
      // Auto-create new "Untitled" when last tab is deleted
      const newT = createTab('', nextUntitledTitle());
      tabs.push(newT);
      activeTabId = newT.id;
      saveActiveTabId(activeTabId);
      setGraphViewMode(false);
      markdownEditor.value = '';
      restoreViewMode('split');
      renderEditorSyntaxHighlights();
      renderMarkdown();
    } else if (activeTabId === tabId) {
      const newIdx = Math.max(0, idx - 1);
      activeTabId = tabs[newIdx].id;
      saveActiveTabId(activeTabId);
      const newActiveTab = tabs[newIdx];
      if (newActiveTab.type === 'graph') {
        setViewMode('preview');
        setGraphViewMode(true);
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
        renderGraphView();
        saveTabsToStorage(tabs);
        return;
      }
      setGraphViewMode(false);
      markdownEditor.value = newActiveTab.content;
      restoreViewMode(newActiveTab.viewMode);
      renderEditorSyntaxHighlights();
      renderMarkdown();
      requestAnimationFrame(function() {
        markdownEditor.scrollTop = newActiveTab.scrollPos || 0;
        syncEditorSyntaxHighlightScroll();
      });
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function renameUnsourcedTabTitle(tab) {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-modal-input');
    const confirmBtn = document.getElementById('rename-modal-confirm');
    const cancelBtn = document.getElementById('rename-modal-cancel');
    const title = document.getElementById('rename-modal-title');
    if (!modal || !input || !confirmBtn || !cancelBtn) return;
    if (title) title.textContent = 'Rename tab';
    input.placeholder = 'Tab name';
    input.value = tab.title;
    confirmBtn.textContent = 'Rename';
    modal.style.display = 'flex';
    input.focus();
    input.select();

    function doRename() {
      const newName = input.value.trim();
      if (newName) {
        tab.title = newName;
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      }
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doRename);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function onKey(e) {
      if (e.key === 'Enter') doRename();
      else if (e.key === 'Escape') doCancel();
    }

    confirmBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  }

  async function renameTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;

    const sourceName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : tab.sourceFileHandle?.name);
    if (!sourceName || (!tab.sourceFileHandle && !tab.sourceFilePath)) {
      renameUnsourcedTabTitle(tab);
      return;
    }

    try {
      await renameSidebarNodeOnDisk({
        kind: "file",
        name: sourceName,
        handle: tab.sourceFileHandle || null,
        fullPath: isNeutralinoRuntime() ? tab.sourceFilePath : null,
        path: tab.sourceFilePath || null
      }, "file");
    } catch (error) {
      console.error("Failed to rename tab source file:", error);
      alert("Unable to rename this file.");
    }
  }

  function duplicateTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    saveCurrentTabState();
    const dupTitle = tab.title + ' (copy)';
    const dup = createTab(tab.content, dupTitle, isUnsupportedFileTab(tab) ? 'editor' : tab.viewMode);
    dup.savedContent = tab.savedContent;
    dup.isUnsupportedFile = isUnsupportedFileTab(tab);
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    tabs.splice(idx + 1, 0, dup);
    switchTab(dup.id);
  }

  function confirmCloseTabsIfNeeded(tabsToClose) {
    const unsavedTabsToClose = tabsToClose.filter(function(tab) {
      return tabHasUnsavedChanges(tab);
    });
    if (unsavedTabsToClose.length === 0) return true;
    if (unsavedTabsToClose.length === 1) {
      return window.confirm('You have unsaved changes. Are you sure you want to close this tab?');
    }
    return window.confirm('You have unsaved changes in ' + unsavedTabsToClose.length + ' tabs. Are you sure you want to close them?');
  }

  function closeTabsByIds(tabIds) {
    const idsToClose = Array.from(new Set(tabIds));
    const tabsToClose = idsToClose
      .map(function(tabId) { return tabs.find(function(tab) { return tab.id === tabId; }); })
      .filter(Boolean);
    if (tabsToClose.length === 0 || !confirmCloseTabsIfNeeded(tabsToClose)) return;
    idsToClose.forEach(function(tabId) {
      closeTab(tabId, { promptForUnsaved: false });
    });
  }

  function closeOtherTabs(tabId) {
    const targetTab = tabs.find(function(tab) { return tab.id === tabId; });
    if (!targetTab || tabs.length <= 1) return;
    closeTabsByIds(tabs
      .filter(function(tab) { return tab.id !== tabId; })
      .map(function(tab) { return tab.id; }));
    if (tabs.some(function(tab) { return tab.id === tabId; }) && activeTabId !== tabId) {
      switchTab(tabId);
    }
  }

  function closeAllTabs() {
    if (tabs.length === 0) return;
    closeTabsByIds(tabs.map(function(tab) { return tab.id; }));
  }

  function resetAllTabs() {
    const modal = document.getElementById('reset-confirm-modal');
    const confirmBtn = document.getElementById('reset-modal-confirm');
    const cancelBtn = document.getElementById('reset-modal-cancel');
    if (!modal) return;
    modal.style.display = 'flex';

    function doReset() {
      modal.style.display = 'none';
      cleanup();
      tabs = [];
      untitledCounter = 0;
      saveUntitledCounter(0);
      const welcome = createTab(sampleMarkdown, 'Welcome to ShayBC Markdown-Viewer');
      tabs.push(welcome);
      activeTabId = welcome.id;
      saveActiveTabId(activeTabId);
      saveTabsToStorage(tabs);
      setGraphViewMode(false);
      markdownEditor.value = sampleMarkdown;
      restoreViewMode('split');
      renderEditorSyntaxHighlights();
      renderMarkdown();
      renderTabBar(tabs, activeTabId);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doReset);
      cancelBtn.removeEventListener('click', doCancel);
    }

    confirmBtn.addEventListener('click', doReset);
    cancelBtn.addEventListener('click', doCancel);
  }

  function initTabs() {
    untitledCounter = loadUntitledCounter();
    tabs = loadTabsFromStorage();
    tabs.forEach(function(tab) {
      tab.content = normalizeEditorContent(tab.content);
      if (typeof tab.savedContent !== 'string') tab.savedContent = tab.content || '';
      tab.savedContent = normalizeEditorContent(tab.savedContent);
      if (!tab.type) tab.type = 'markdown';
      if (tab.type === 'graph') {
        const graphData = deserializeGraphDocument({
          ...(tab.graphDocument || tab),
          graphLayout: tab.graphLayout !== undefined
            ? tab.graphLayout
            : (tab.graphDocument?.graphLayout !== undefined ? tab.graphDocument.graphLayout : tab.graphDocument?.layout)
        });
        tab.folderName = graphData.folderName;
        tab.graphSnapshot = graphData.graphSnapshot;
        tab.graphViewConfig = graphData.graphViewConfig;
        tab.graphDocument = graphData.graphDocument;
        if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
      }
    });
    activeTabId = loadActiveTabId();
    if (tabs.length === 0) {
      const tab = createTab(sampleMarkdown, 'Welcome to ShayBC Markdown-Viewer');
      tabs.push(tab);
      activeTabId = tab.id;
      saveTabsToStorage(tabs);
      saveActiveTabId(activeTabId);
    } else if (!tabs.find(function(t) { return t.id === activeTabId; })) {
      activeTabId = tabs[0].id;
      saveActiveTabId(activeTabId);
    }
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab.type === 'graph') {
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      renderGraphView();
      return;
    }
    setGraphViewMode(false);
    markdownEditor.value = activeTab.content;
    restoreViewMode(activeTab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = activeTab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    renderTabBar(tabs, activeTabId);
  }

  function renderMarkdown() {
    updateEditorLineNumbers();
    try {
      const { frontmatter, body } = parseFrontmatter(markdownEditor.value);
      const tableHtml = frontmatter ? renderFrontmatterTable(frontmatter) : '';
      const html = tableHtml + marked.parse(body);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container'],
        ADD_ATTR: ['id', 'class', 'style']
      });
      markdownPreview.innerHTML = sanitizedHtml;
      enhanceWikiLinks(markdownPreview);
      annotatePreviewMarkdownLinks(markdownPreview);
      enhanceGitHubAlerts(markdownPreview);

      processEmojis(markdownPreview);
      
      // Reinitialize mermaid with current theme before rendering diagrams
      initMermaid();
      
      try {
        const mermaidNodes = markdownPreview.querySelectorAll('.mermaid');
        if (mermaidNodes.length > 0) {
          Promise.resolve(mermaid.init(undefined, mermaidNodes))
            .then(() => addMermaidToolbars())
            .catch((e) => {
              console.warn("Mermaid rendering failed:", e);
              addMermaidToolbars();
            });
        }
      } catch (e) {
        console.warn("Mermaid rendering failed:", e);
      }
      
      if (window.MathJax) {
        try {
          MathJax.typesetPromise([markdownPreview]).catch((err) => {
            console.warn('MathJax typesetting failed:', err);
          });
        } catch (e) {
          console.warn("MathJax rendering failed:", e);
        }
      }

      updateDocumentStats();
    } catch (e) {
      console.error("Markdown rendering failed:", e);
      markdownPreview.innerHTML = `<div class="alert alert-danger">
              <strong>Error rendering markdown:</strong> ${e.message}
          </div>
          <pre>${markdownEditor.value}</pre>`;
    }
  }



  async function listMarkdownTree(dirHandle, parentPath = "") {
    const entries = [];
    for await (const entry of dirHandle.values()) {
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
        entries.push({ kind: "file", name: entry.name, path: currentPath, handle: entry, modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
      }
    }
    return sortFolderTreeNodes(entries);
  }

  async function collectMarkdownFilesFromTree(nodes, parentPath = "") {
    const files = [];
    for (const node of (nodes || [])) {
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.kind === "directory") {
        const nestedFiles = await collectMarkdownFilesFromTree(node.children || [], currentPath);
        files.push(...nestedFiles);
      } else if (node.kind === "file" && isMarkdownPath(node.name)) {
        if (node.file) {
          files.push({ path: currentPath, file: node.file, handle: node.handle || null });
        } else if (node.handle) {
          try {
            const file = await node.handle.getFile();
            files.push({ path: currentPath, file, handle: node.handle });
          } catch (error) {
            console.warn("Failed to read file handle for graph view:", currentPath, error);
          }
        }
      }
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
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
  }

  function renderFolderTree(nodes, options = {}) {
    isFolderOpen = true;
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
      updateCloseFolderButtons();
      updateFolderTreeToolbarState();
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "folder-tree-list";
    displayNodes.forEach((node) => ul.appendChild(renderFolderTreeNode(node)));
    folderTreeRoot.appendChild(ul);
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
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

  async function openFolderTreeFromNeutralinoPath(selectedPath) {
    if (!selectedPath) return;
    activeFolderName = selectedPath.split(/[\\/]/).pop() || "Graph View";
    activeFolderHandle = null;
    activeFolderPath = selectedPath;
    const nodes = await listMarkdownTreeNeutralino(selectedPath);
    folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
    renderFolderTree(nodes);
    rememberRecentFolder({ name: activeFolderName, label: activeFolderName, path: selectedPath });
  }

  function getMarkdownTitleFromFileName(fileName) {
    return (fileName || "document.md").replace(/\.(md|markdown)$/i, "");
  }

  async function openMarkdownSourceFile(sourceFile) {
    if (!sourceFile) return null;

    let content = sourceFile.content;
    let file = sourceFile.file || null;
    const handle = sourceFile.handle || null;
    const path = sourceFile.path || null;
    let name = sourceFile.name || (path ? getFileName(path) : null);

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && path) {
        content = await Neutralino.filesystem.readFile(path);
      } else {
        if (!file && handle) {
          file = await handle.getFile();
        }
        if (!file) {
          throw new Error("No readable Markdown file was provided.");
        }
        content = await file.text();
        name = name || file.name;
      }
    }

    name = name || (file && file.name) || "document.md";
    const tab = openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), {
      name,
      handle,
      path
    });
    rememberRecentFile({
      name,
      label: name,
      path,
      handle
    });
    return tab;
  }

  function isGraphFilePath(path) {
    return /\.(mdviewer-graph\.json|mdgraph\.json)$/i.test(path || "");
  }

  function isJsonPath(path) {
    return /\.json$/i.test(path || "");
  }

  function isPotentialGraphFilePath(path) {
    return isGraphFilePath(path) || isJsonPath(path);
  }

  function getFileExtension(path) {
    const match = String(path || "").toLowerCase().match(/\.([a-z0-9+_-]+)$/i);
    return match ? match[1] : "";
  }

  function isKnownTextFilePath(path) {
    const extension = getFileExtension(path);
    if (!extension) {
      return /(^|[\/])(dockerfile|makefile|rakefile|gemfile|license|readme|changelog|authors|contributors)$/i.test(path || "");
    }
    return new Set([
      "txt", "text", "md", "markdown", "json", "jsonc", "js", "jsx", "ts", "tsx", "mjs", "cjs",
      "css", "scss", "sass", "less", "html", "htm", "xml", "svg", "csv", "tsv", "yaml", "yml",
      "toml", "ini", "conf", "config", "env", "properties", "java", "c", "h", "cpp", "hpp", "cc",
      "cs", "go", "rs", "py", "rb", "php", "swift", "kt", "kts", "sh", "bash", "zsh", "fish",
      "bat", "cmd", "ps1", "sql", "r", "lua", "pl", "pm", "scala", "clj", "ex", "exs", "erl",
      "hrl", "fs", "fsx", "vb", "dockerfile", "gitignore", "gitattributes", "editorconfig", "log"
    ]).has(extension) || /(^|[\/])(dockerfile|makefile|rakefile|gemfile|license|readme|changelog|authors|contributors)$/i.test(path || "");
  }

  function isTextFileLike(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    return type.startsWith("text/")
      || type === "application/json"
      || type === "application/xml"
      || type === "application/javascript"
      || type === "application/x-javascript"
      || isKnownTextFilePath(file.name || file.path);
  }

  function isTextDocumentPath(path) {
    return isMarkdownPath(path) || isPotentialGraphFilePath(path) || isKnownTextFilePath(path);
  }

  function isSidebarDocumentPath(path) {
    return isTextDocumentPath(path);
  }

  function isSidebarDocumentNode(node) {
    return !!(node && (isSidebarDocumentPath(node.name || node.path || node.fullPath) || isTextFileLike(node.file)));
  }

  function isSupportedFolderTreeDocumentPath(path) {
    return isMarkdownPath(path) || isGraphFilePath(path);
  }

  function isSupportedFolderTreeDocumentNode(node) {
    return !!(node && node.kind === "file" && (
      isSupportedFolderTreeDocumentPath(node.name || node.path || node.fullPath)
      || node.isGraphDocumentFile === true
    ));
  }

  async function fileContainsGraphDocument(file) {
    if (!file || !isJsonPath(file.name || file.path)) return false;
    try {
      return looksLikeGraphDocument(JSON.parse(await file.text()));
    } catch (_) {
      return false;
    }
  }

  async function neutralinoPathContainsGraphDocument(filePath) {
    if (!isJsonPath(filePath)) return false;
    try {
      return looksLikeGraphDocument(JSON.parse(await Neutralino.filesystem.readFile(filePath)));
    } catch (_) {
      return false;
    }
  }

  function looksLikeGraphDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) return false;
    const documentType = typeof document.documentType === "string" ? document.documentType : document.type;
    if (GRAPH_DOCUMENT_TYPES.has(documentType)) return true;
    return Object.prototype.hasOwnProperty.call(document, "snapshot")
      || Object.prototype.hasOwnProperty.call(document, "graphSnapshot")
      || Object.prototype.hasOwnProperty.call(document, "viewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphViewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphLayout")
      || Object.prototype.hasOwnProperty.call(document, "layout")
      || (Object.prototype.hasOwnProperty.call(document, "schemaVersion") && Object.prototype.hasOwnProperty.call(document, "folderName"));
  }

  async function readOpenFileSourceContent(sourceFile) {
    if (sourceFile.content !== undefined) return sourceFile.content;
    if (typeof NL_VERSION !== "undefined" && sourceFile.path) {
      return Neutralino.filesystem.readFile(sourceFile.path);
    }
    let file = sourceFile.file || null;
    if (!file && sourceFile.handle) file = await sourceFile.handle.getFile();
    if (!file) throw new Error("No readable file was provided.");
    return file.text();
  }

  async function openDocumentSourceFile(sourceFile) {
    if (!sourceFile) return null;
    const path = sourceFile.path || null;
    const name = sourceFile.name || (path ? getFileName(path) : sourceFile.file?.name || sourceFile.handle?.name || "document.md");
    const filePath = path || name;

    if (isGraphFilePath(filePath)) {
      return openSavedGraphDocument({ ...sourceFile, name });
    }

    if (isMarkdownPath(filePath)) {
      return openMarkdownSourceFile({ ...sourceFile, name });
    }

    const content = await readOpenFileSourceContent(sourceFile);
    if (isJsonPath(filePath)) {
      try {
        const parsed = JSON.parse(content);
        if (looksLikeGraphDocument(parsed)) {
          return openSavedGraphDocument({ ...sourceFile, name, content });
        }
      } catch (_) {
        // Invalid JSON is still text and can be edited in the basic text editor.
      }
    }

    return openMarkdownSourceFile({ ...sourceFile, name, content });
  }

  async function openDocumentFileFromPicker() {
    if (typeof NL_VERSION !== "undefined") {
      try {
        const selected = await Neutralino.os.showOpenDialog("Open file", {
          filters: [
            { name: "Text-based files", extensions: ["md", "markdown", "mdviewer-graph.json", "mdgraph.json", "json", "txt", "java", "css", "js", "ts", "html", "xml", "csv", "yml", "yaml", "toml", "ini", "log"] }
          ]
        });
        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        if (!selectedPath) return;
        await openDocumentSourceFile({
          name: getFileName(selectedPath),
          path: selectedPath
        });
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Neutralino file picker error:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    if (typeof window.showOpenFilePicker === "function") {
      let handle = null;
      try {
        const handles = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Text-based files",
              accept: {
                "text/markdown": [".md", ".markdown"],
                "text/plain": [".txt", ".text", ".java", ".css", ".js", ".ts", ".html", ".xml", ".csv", ".yml", ".yaml", ".toml", ".ini", ".log"],
                "application/json": [".json"]
              }
            }
          ]
        });
        handle = handles && handles[0];
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.warn("File picker unavailable, using fallback input.", error);
        fileInput.click();
        return;
      }

      if (!handle) return;
      try {
        await openDocumentSourceFile({
          name: handle.name,
          handle
        });
      } catch (error) {
        console.error("Failed to open selected file:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    fileInput.click();
  }

  async function getFileSystemHandlesFromDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    const handles = [];

    for (const item of items) {
      if (typeof item.getAsFileSystemHandle !== "function") continue;
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle) handles.push(handle);
      } catch (error) {
        console.warn("Unable to read dropped file system handle:", error);
      }
    }

    return handles;
  }

  async function getDirectoryHandleFromDrop(dataTransfer, fileSystemHandles) {
    const handles = fileSystemHandles || await getFileSystemHandlesFromDrop(dataTransfer);
    return handles.find((handle) => handle && handle.kind === "directory") || null;
  }

  function getDirectoryEntryFromDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    for (const item of items) {
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) return entry;
    }
    return null;
  }

  function readDirectoryEntries(directoryEntry) {
    const reader = directoryEntry.createReader();
    const entries = [];

    return new Promise((resolve, reject) => {
      function readNextBatch() {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readNextBatch();
        }, reject);
      }

      readNextBatch();
    });
  }

  function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
  }

  async function listMarkdownTreeFromEntry(directoryEntry) {
    const entries = [];
    const childEntries = await readDirectoryEntries(directoryEntry);

    for (const entry of childEntries) {
      if (entry.isDirectory) {
        const children = await listMarkdownTreeFromEntry(entry);
        entries.push({ kind: "directory", name: entry.name, children, handle: entry });
      } else if (entry.isFile) {
        try {
          const file = await getFileFromEntry(entry);
          const modifiedAt = Number(file?.lastModified || 0) || 0;
          const isGraphDocumentFile = await fileContainsGraphDocument(file);
          entries.push({ kind: "file", name: entry.name, file, path: entry.fullPath || entry.name, modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
        } catch (error) {
          console.warn("Failed to read dropped document file:", entry.name, error);
        }
      }
    }

    return sortFolderTreeNodes(entries);
  }

  async function getDocumentFileHandleFromDrop(dataTransfer, fileSystemHandles) {
    const handles = fileSystemHandles || await getFileSystemHandlesFromDrop(dataTransfer);
    return handles.find((handle) => handle && handle.kind === "file" && isTextDocumentPath(handle.name)) || null;
  }

  async function getDocumentFileFromEntryDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    for (const item of items) {
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (!entry || !entry.isFile || !isTextDocumentPath(entry.name)) continue;
      try {
        const file = await getFileFromEntry(entry);
        return { file, name: entry.name };
      } catch (error) {
        console.warn("Failed to read dropped file entry:", entry.name, error);
      }
    }
    return null;
  }

  async function openDroppedDocumentFile(dataTransfer, fileSystemHandles) {
    const files = Array.from((dataTransfer && dataTransfer.files) || []);

    if (typeof NL_VERSION !== "undefined") {
      const droppedPath = files.find((file) => file && file.path && (isTextDocumentPath(file.path || file.name) || isTextFileLike(file)));
      if (droppedPath) {
        await openDocumentSourceFile({
          name: getFileName(droppedPath.path || droppedPath.name),
          path: droppedPath.path
        });
        return true;
      }
    }

    const handle = await getDocumentFileHandleFromDrop(dataTransfer, fileSystemHandles);
    if (handle) {
      await openDocumentSourceFile({
        name: handle.name,
        handle
      });
      return true;
    }

    const entryFile = await getDocumentFileFromEntryDrop(dataTransfer);
    if (entryFile) {
      await openDocumentSourceFile(entryFile);
      return true;
    }

    const file = files.find((candidate) => candidate && (isTextDocumentPath(candidate.name) || isTextFileLike(candidate)));
    if (file) {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
      return true;
    }

    return false;
  }

  async function openDroppedFolder(dataTransfer, fileSystemHandles) {
    if (typeof NL_VERSION !== "undefined") {
      const files = Array.from((dataTransfer && dataTransfer.files) || []);
      const droppedPath = files.find((file) => file && file.path && !isTextDocumentPath(file.path || file.name));
      if (droppedPath) {
        await openFolderTreeFromNeutralinoPath(droppedPath.path);
        return true;
      }
    }

    const dirHandle = await getDirectoryHandleFromDrop(dataTransfer, fileSystemHandles);
    if (dirHandle) {
      activeFolderName = dirHandle.name || "Graph View";
      activeFolderHandle = dirHandle;
      activeFolderPath = null;
      const nodes = await listMarkdownTree(dirHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
      return true;
    }

    const directoryEntry = getDirectoryEntryFromDrop(dataTransfer);
    if (directoryEntry) {
      activeFolderName = directoryEntry.name || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      const nodes = await listMarkdownTreeFromEntry(directoryEntry);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      return true;
    }

    return false;
  }

async function listMarkdownTreeNeutralino(dirPath) {
  const entries = [];
  try {
    const items = await Neutralino.filesystem.readDirectory(dirPath);
    for (const item of items) {
      if (item.entry === "." || item.entry === "..") continue;
      const fullPath = `${dirPath}/${item.entry}`;
      let stats = null;
      try {
        stats = await Neutralino.filesystem.getStats(fullPath);
      } catch (error) {
        console.warn("Failed to read file metadata:", fullPath, error);
      }
      if (item.type === "DIRECTORY") {
        const children = await listMarkdownTreeNeutralino(fullPath);
        entries.push({ kind: "directory", name: item.entry, children, fullPath, createdAt: Number(stats?.createdAt || 0), modifiedAt: Number(stats?.modifiedAt || 0) });
      } else if (item.type === "FILE") {
        const isGraphDocumentFile = await neutralinoPathContainsGraphDocument(fullPath);
        entries.push({ kind: "file", name: item.entry, fullPath, createdAt: Number(stats?.createdAt || stats?.modifiedAt || 0), modifiedAt: Number(stats?.modifiedAt || 0), isGraphDocumentFile });
      }
    }
  } catch (error) {
    console.warn("Failed to read directory:", dirPath, error);
  }
  return sortFolderTreeNodes(entries);
}

async function collectMarkdownFilesFromTreeNeutralino(nodes, parentPath = "") {
  const files = [];
  for (const node of (nodes || [])) {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.kind === "directory") {
      const nestedFiles = await collectMarkdownFilesFromTreeNeutralino(node.children || [], currentPath);
      files.push(...nestedFiles);
    } else if (node.kind === "file" && isMarkdownPath(node.name)) {
      try {
        const content = await Neutralino.filesystem.readFile(node.fullPath);
        const file = new File([content], node.name, { type: "text/markdown" });
        files.push({ path: currentPath, fullPath: node.fullPath, file });
      } catch (error) {
        console.warn("Failed to read file:", currentPath, error);
      }
    }
  }
  return files;
}


  let sidebarFileContextMenu = null;
  let sidebarFolderContextMenu = null;
  let sidebarClosedFolderContextMenu = null;
  let sidebarContextTarget = null;

  const CONTEXT_MENU_ACTIONS = Object.freeze({
    openInNewTab: { label: "Open in a new tab", icon: "bi bi-box-arrow-up-right" },
    openWithDefaultApp: { label: "Open with default app", icon: "bi bi-window" },
    revealInFileExplorer: { label: "Reveal in file explorer", icon: "bi bi-folder2-open" },
    rename: { label: "Rename", icon: "bi bi-pencil" },
    copy: { label: "Copy", icon: "bi bi-clipboard" },
    copyPath: { label: "Copy path", icon: "bi bi-file-earmark-text" },
    copyContent: { label: "Copy content", icon: "bi bi-file-text" },
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
    removePoint: { label: "Remove this point", icon: "bi bi-eye-slash" },
    showLocalGraph: { label: "Show local graph", icon: "bi bi-diagram-2" },
    showFullLocalGraph: { label: "Show full local graph", icon: "bi bi-diagram-3" },
    tags: { label: "Tags", icon: "bi bi-tags" },
    addTag: { label: "Add tag…", icon: "bi bi-tag" },
    removeTag: { label: "Remove tag…", icon: "bi bi-tag-fill" },
    deleteTag: { label: "Delete tag", icon: "bi bi-trash3" },
    turnMagneticForcesOff: { label: "Turn magnetic forces off", icon: "bi bi-magnet" },
    copyDependencies: { label: "Copy dependencies", icon: "bi bi-list-ul" },
    copyFullDependencies: { label: "Copy full dependencies", icon: "bi bi-bezier2" },
    copyBacklinks: { label: "Copy backlinks", icon: "bi bi-arrow-left-circle" },
    openFolder: { label: "Open folder", icon: "bi bi-folder2-open" }
  });

  function createFileContextMenuButton(labelText, iconClass, tooltipText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-context-menu-item graph-context-menu-tooltip";
    button.dataset.tooltip = tooltipText;
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "graph-context-menu-item-label";
    label.textContent = labelText;
    button.appendChild(icon);
    button.appendChild(label);
    return button;
  }

  function createTagsContextSubmenu(tooltipText) {
    const submenu = document.createElement("div");
    submenu.className = "graph-context-menu-submenu tags-context-submenu";
    const submenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.tags.label,
      CONTEXT_MENU_ACTIONS.tags.icon,
      tooltipText || "Add or remove frontmatter tags for this file."
    );
    submenuBtn.setAttribute("aria-haspopup", "true");
    const submenuArrow = document.createElement("span");
    submenuArrow.className = "graph-context-menu-submenu-arrow";
    submenuArrow.textContent = "›";
    submenuBtn.appendChild(submenuArrow);
    const submenuPanel = document.createElement("div");
    submenuPanel.className = "graph-context-menu-submenu-panel tags-context-submenu-panel";
    submenu.appendChild(submenuBtn);
    submenu.appendChild(submenuPanel);
    return { submenu, submenuBtn, submenuPanel };
  }

  function renderTagsContextSubmenu(submenuPanel, currentTags, onToggleTag) {
    if (!submenuPanel) return;
    const fileTags = new Set(normalizeFileTagList(currentTags || []));
    const tags = Array.from(new Set([...getAllKnownAndReferencedTags(), ...fileTags])).sort((a, b) => a.localeCompare(b));
    submenuPanel.innerHTML = "";

    if (!tags.length) {
      const empty = document.createElement("div");
      empty.className = "graph-context-menu-empty";
      empty.textContent = "No available tags";
      submenuPanel.appendChild(empty);
      return;
    }

    tags.forEach((tag) => {
      const isChecked = fileTags.has(tag);
      const button = createFileContextMenuButton(
        `#${tag}`,
        isChecked ? "bi bi-check-lg" : "bi",
        isChecked ? `Remove #${tag} from this file.` : `Add #${tag} to this file.`
      );
      button.classList.add("tags-context-menu-item");
      button.dataset.tagName = tag;
      button.setAttribute("aria-checked", isChecked ? "true" : "false");
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await onToggleTag(tag, !isChecked);
      });
      submenuPanel.appendChild(button);
    });
  }

  function getSidebarNodeSource(node) {
    if (!node) return null;
    return {
      name: node.name,
      file: node.file || null,
      handle: node.handle || null,
      path: node.fullPath || node.path || null
    };
  }

  function getSidebarNodeClipboardPath(node) {
    if (!node) return "";
    return node.fullPath || node.path || node.name || "";
  }

  async function readSidebarNodeContent(node) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime() && node.fullPath) {
      return Neutralino.filesystem.readFile(node.fullPath);
    }
    if (node.file) return node.file.text();
    if (node.handle) {
      const file = await node.handle.getFile();
      return file.text();
    }
    throw new Error("No readable file was provided.");
  }

  async function writeSidebarNodeContent(node, content) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime()) {
      const writePath = getSidebarNodeFilesystemPath(node);
      if (!writePath || !Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(writePath, content);
      return;
    }
    if (node.handle?.createWritable) {
      const writable = await node.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }
    throw new Error("No writable file handle is available.");
  }

  function sidebarNodeMatchesSnapshotFile(node, snapshotFile) {
    if (!node || !snapshotFile) return false;
    if (node.handle && snapshotFile.handle && node.handle === snapshotFile.handle) return true;
    const nodePaths = [node.fullPath, node.path, node.file?.webkitRelativePath, node.file?.name, node.name]
      .filter(Boolean)
      .map(getComparableFilePath);
    const snapshotPaths = [snapshotFile.fullPath, snapshotFile.path, snapshotFile.file?.webkitRelativePath, snapshotFile.file?.name, snapshotFile.name]
      .filter(Boolean)
      .map(getComparableFilePath);
    return nodePaths.some((nodePath) => snapshotPaths.some((snapshotPath) => nodePath === snapshotPath || nodePath.endsWith(`/${snapshotPath}`) || snapshotPath.endsWith(`/${nodePath}`)));
  }

  async function updateGraphSnapshotsForSidebarFileTagChange(node, content) {
    const changedGraphTabs = [];
    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files) continue;
      let changed = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        if (!sidebarNodeMatchesSnapshotFile(node, snapshotFile)) return;
        snapshotFile.content = content;
        snapshotFile.tags = getFileTagsFromContent(content);
        changed = true;
      });
      if (!changed) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedGraphTabs.push(tab);
    }
    return changedGraphTabs;
  }

  function updateOpenMarkdownTabsForSidebarNode(node, content) {
    const normalizedContent = normalizeEditorContent(content);
    let changed = false;
    tabs.forEach((tab) => {
      if (!tab || tab.type === "graph") return;
      const matchesHandle = node.handle && tab.sourceFileHandle === node.handle;
      const nodePathKey = getComparableFilePath(node.fullPath || node.path || "");
      const tabPathKey = getComparableFilePath(tab.sourceFilePath || "");
      const matchesPath = nodePathKey && tabPathKey && nodePathKey === tabPathKey;
      const matchesName = node.name && (tab.sourceFileName === node.name || tab.title === getMarkdownTitleFromFileName(node.name));
      if (!matchesHandle && !matchesPath && !matchesName) return;
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
        renderEditorSyntaxHighlights();
        updateEditorLineNumbers();
        renderMarkdown();
      }
      changed = true;
    });
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
  }

  async function setSidebarNodeTags(node, nextTags) {
    const currentContent = await readSidebarNodeContent(node);
    const nextContent = setFileTagsInContent(currentContent, nextTags);
    if (nextContent === currentContent) return;

    await writeSidebarNodeContent(node, nextContent);
    node.tags = getFileTagsFromContent(nextContent);

    const folderEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      const nodePathKey = getFolderTreeNodePathKey(node);
      return entry.handle === node.handle || (entryPathKey && nodePathKey && entryPathKey === nodePathKey);
    });
    if (folderEntry) {
      folderEntry.content = nextContent;
      folderEntry.tags = node.tags;
    }
    updateFolderTreeNodeTagsForEntry(folderEntry || node, node.tags);
    updateOpenMarkdownTabsForSidebarNode(node, nextContent);
    saveKnownTags([...getKnownTags(), ...node.tags]);
    await updateGraphSnapshotsForSidebarFileTagChange(node, nextContent);
    await refreshFolderTagCounts();
    renderFilteredFolderTree();
    renderTagManagementList();
    renderLinkAutocomplete();
    saveTabsToStorage(tabs);
    if (getActiveGraphTab()) renderGraphView();
  }

  function runWithTemporaryEditorContent(content, action) {
    const previousValue = markdownEditor.value;
    markdownEditor.value = content || "";
    try {
      action();
    } finally {
      markdownEditor.value = previousValue;
      renderEditorSyntaxHighlights();
      updateEditorLineNumbers();
    }
  }

  function exportMarkdownContent(content, name) {
    const suggestedName = sanitizeMarkdownFileName(name || "document");
    saveAs(new Blob([content || ""], { type: "text/markdown;charset=utf-8" }), suggestedName);
  }

  function exportHtmlContent(content) {
    runWithTemporaryEditorContent(content, () => exportHtml.click());
  }

  function exportPdfContent(content) {
    runWithTemporaryEditorContent(content, () => exportPdf.click());
  }

  function getSidebarNodeFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (node.fullPath) return node.fullPath;
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  async function copySidebarContextText(text) {
    if (isNeutralinoRuntime() && Neutralino.clipboard?.writeText) {
      await Neutralino.clipboard.writeText(text || "");
      showCopiedMessage();
      return;
    }
    await copyToClipboard(text || "");
  }

  function hideSidebarFileContextMenu() {
    if (!sidebarFileContextMenu) return;
    sidebarFileContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarFolderContextMenu() {
    if (!sidebarFolderContextMenu) return;
    sidebarFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarClosedFolderContextMenu() {
    if (!sidebarClosedFolderContextMenu) return;
    sidebarClosedFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarContextMenus() {
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    hideSidebarClosedFolderContextMenu();
  }

  function positionSidebarContextMenu(menu, event, fallbackHeight) {
    if (!menu) return;
    const menuWidth = menu.offsetWidth || 230;
    const menuHeight = menu.offsetHeight || fallbackHeight || 280;
    const left = Math.max(0, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const top = Math.max(0, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function positionSidebarFileContextMenu(event) {
    positionSidebarContextMenu(sidebarFileContextMenu, event, 320);
  }

  function positionSidebarFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarFolderContextMenu, event, 250);
  }

  function positionSidebarClosedFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarClosedFolderContextMenu, event, 80);
  }

  function getOpenFolderMainMenuButton() {
    return document.querySelector("#import-from-folder");
  }

  function getOpenFolderActionLabel() {
    const button = getOpenFolderMainMenuButton();
    const buttonLabel = button ? button.textContent.replace(/\s+/g, " ").trim() : "";
    return buttonLabel ? buttonLabel.replace(/\s*\.\.\.$/, "") : CONTEXT_MENU_ACTIONS.openFolder.label;
  }

  function getOpenFolderActionTitle() {
    const button = getOpenFolderMainMenuButton();
    return (button && button.title) || "Open a folder to browse text and graph files.";
  }

  function getPathDirectory(path) {
    if (!path) return "";
    const normalized = String(path);
    const lastSlash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  }

  function getRenamedSiblingPath(path, newName) {
    const directory = getPathDirectory(path);
    return directory ? joinPath(directory, newName) : newName;
  }

  function validateSidebarRenameName(name, kind) {
    const value = String(name || "").trim();
    if (!value) return `Enter a name before ${kind === "new-file" ? "creating the file" : "renaming"}.`;
    if (/[\\/]/.test(value)) return "Enter a name only, without folder separators.";
    if (/^\.+$/.test(value)) return "Enter a name that is not only dots.";
    if (kind === "file" && !isSidebarDocumentPath(value)) {
      return "File names must end in .md, .markdown, .mdviewer-graph.json, .mdgraph.json, or .json.";
    }
    return "";
  }

  function promptSidebarRename(node, kind) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = kind === "folder" ? "Rename folder" : "Rename file";
      input.value = node?.name || "";
      input.placeholder = kind === "folder" ? "Folder name" : "File name";
      confirmBtn.textContent = "Rename";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        resolve(result);
      }

      function onConfirm() {
        const newName = input.value.trim();
        const validationMessage = validateSidebarRenameName(newName, kind);
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(newName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFileName(parentNode) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = `New file in ${parentNode?.name || "folder"}`;
      input.value = "Untitled.md";
      input.placeholder = "File name (for example, notes.md)";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const fileName = input.value.trim();
        const validationMessage = validateSidebarRenameName(fileName, "new-file");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(fileName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFolderName(parentNode) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = `New folder in ${parentNode?.name || "folder"}`;
      input.value = "";
      input.placeholder = "Folder name";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const folderName = input.value.trim();
        const validationMessage = validateSidebarRenameName(folderName, "folder");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        if ((parentNode?.children || []).some((child) => child.kind === "directory" && child.name.toLowerCase() === folderName.toLowerCase())) {
          alert("A folder with this name already exists here.");
          input.focus();
          return;
        }
        cleanup(folderName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function updateTabsAfterSidebarFileRename(target, oldPath, newPath, newName) {
    let changed = false;
    tabs.forEach((tab) => {
      const matchesPath = oldPath && tab.sourceFilePath === oldPath;
      const matchesHandle = target?.handle && tab.sourceFileHandle === target.handle;
      if (!matchesPath && !matchesHandle) return;
      tab.sourceFileName = newName;
      if (newPath) tab.sourceFilePath = newPath;
      if (tab.type !== "graph") {
        tab.title = isGraphFilePath(newName) ? getGraphTitleFromFileName(newName) : getMarkdownTitleFromFileName(newName);
      }
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath || target?.path, newPath, "file")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  function stripMarkdownExtension(path) {
    return String(path || "").replace(/\.(md|markdown)$/i, "");
  }

  function splitMarkdownLinkSuffix(reference) {
    const value = String(reference || "");
    let suffixIndex = -1;
    ["#", "?"].forEach((marker) => {
      const index = value.indexOf(marker);
      if (index >= 0 && (suffixIndex < 0 || index < suffixIndex)) suffixIndex = index;
    });
    if (suffixIndex < 0) return { target: value, suffix: "" };
    return {
      target: value.slice(0, suffixIndex),
      suffix: value.slice(suffixIndex)
    };
  }

  function getRelativePathBetweenFiles(sourcePath, targetPath) {
    const sourceParts = String(sourcePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    const targetParts = String(targetPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    sourceParts.pop();
    while (sourceParts.length && targetParts.length && sourceParts[0].toLowerCase() === targetParts[0].toLowerCase()) {
      sourceParts.shift();
      targetParts.shift();
    }
    return [...sourceParts.map(() => ".."), ...targetParts].join("/");
  }

  function getRenameReferenceTargetPath(referenceTarget, sourcePath, oldPath, newPath, kind, resolvedTargetPath) {
    const normalizedTarget = String(referenceTarget || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    const targetHasMarkdownExtension = /\.(md|markdown)$/i.test(normalizedTarget);
    const useExtension = targetHasMarkdownExtension;
    const isBareReference = !normalizedTarget.includes("/");
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const newRelativePath = activeFolderPath ? getPathRelativeToFolder(newPath, activeFolderPath) : newPath;
    const normalizedOldRelativePath = String(oldRelativePath || oldPath || "").replace(/\\/g, "/");
    const normalizedNewRelativePath = String(newRelativePath || newPath || "").replace(/\\/g, "/");
    if (!normalizedOldRelativePath || !normalizedNewRelativePath) return null;

    const renamedPath = kind === "folder"
      ? stripMarkdownExtension(replacePathPrefix(resolvedTargetPath, normalizedOldRelativePath, normalizedNewRelativePath))
      : stripMarkdownExtension(normalizedNewRelativePath);

    if (!renamedPath || renamedPath === normalizedTarget) return null;

    const sourceAfterRename = kind === "folder"
      ? replacePathPrefix(sourcePath, normalizedOldRelativePath, normalizedNewRelativePath)
      : sourcePath;
    let replacement = isBareReference
      ? (renamedPath.split("/").pop() || renamedPath)
      : getRelativePathBetweenFiles(sourceAfterRename, useExtension ? `${renamedPath}.md` : renamedPath);
    if (!useExtension) replacement = stripMarkdownExtension(replacement);
    if (useExtension && !/\.(md|markdown)$/i.test(replacement)) replacement += ".md";
    if (String(referenceTarget || "").startsWith("./") && !replacement.startsWith(".") && !replacement.startsWith("/")) {
      replacement = `./${replacement}`;
    }
    if (String(referenceTarget || "").startsWith("/") && !replacement.startsWith("/")) {
      replacement = `/${useExtension ? `${renamedPath}.md` : stripMarkdownExtension(renamedPath)}`;
    }
    return replacement;
  }

  function updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind) {
    if (!content || !oldPath || !newPath) return content;
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const oldTargetId = normalizeGraphNodeName(oldRelativePath || oldPath);
    const getResolvedRenameTarget = (reference) => {
      const target = resolveGraphTargetId(reference, sourcePath, nodeIndex);
      if (!target) return null;
      const isMatch = kind === "folder" ? (target === oldTargetId || target.startsWith(oldTargetId + "/")) : target === oldTargetId;
      return isMatch ? { id: target, path: nodeIndex.get(target) || target } : null;
    };
    const renameReference = (reference) => {
      const { target, suffix } = splitMarkdownLinkSuffix(reference);
      const resolvedTarget = getResolvedRenameTarget(target);
      if (!resolvedTarget) return reference;
      const renamedTarget = getRenameReferenceTargetPath(target, sourcePath, oldPath, newPath, kind, resolvedTarget.path);
      return renamedTarget ? `${renamedTarget}${suffix}` : reference;
    };

    return String(content)
      .replace(/\[\[([^\]]+)\]\]/g, (fullMatch, inner) => {
        const pipeIndex = String(inner).indexOf("|");
        const target = pipeIndex >= 0 ? String(inner).slice(0, pipeIndex) : String(inner);
        const alias = pipeIndex >= 0 ? String(inner).slice(pipeIndex) : "";
        const renamedTarget = renameReference(target.trim());
        return renamedTarget === target.trim() ? fullMatch : `[[${renamedTarget}${alias}]]`;
      })
      .replace(/(\[[^\]]*?\]\()([^\s)]+)(\))/g, (fullMatch, prefix, url, suffix) => {
        if (/^(https?:|mailto:|tel:|#)/i.test(url)) return fullMatch;
        const renamedUrl = renameReference(url);
        return renamedUrl === url ? fullMatch : `${prefix}${renamedUrl}${suffix}`;
      });
  }

  async function writeFolderMarkdownEntryContent(entry, content, oldPath, newPath, kind) {
    const entryFullPath = entry.fullPath || null;
    let writePath = entryFullPath;
    if (kind === "folder") writePath = replacePathPrefix(entryFullPath, oldPath, newPath);
    if (kind === "file" && entryFullPath === oldPath) writePath = newPath;

    if (isNeutralinoRuntime()) {
      if (!writePath || !Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(writePath, content);
      return writePath;
    }

    if (entry.handle?.createWritable) {
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return entry.path;
    }

    throw new Error("No writable file handle is available.");
  }

  function getEntryContent(entry) {
    if (entry.content !== undefined) return Promise.resolve(entry.content);
    if (entry.file) return entry.file.text();
    if (entry.handle) return entry.handle.getFile().then((file) => file.text());
    if (isNeutralinoRuntime() && entry.fullPath) return Neutralino.filesystem.readFile(entry.fullPath);
    return Promise.reject(new Error("No readable Markdown file is available."));
  }

  function updateOpenTabsAfterMarkdownLinkRename(changedFiles) {
    if (!changedFiles || !changedFiles.size) return;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type === "graph") return;
      const pathKey = tab.sourceFilePath || "";
      const handleEntry = Array.from(changedFiles.values()).find((item) => item.handle && item.handle === tab.sourceFileHandle);
      const changedEntry = changedFiles.get(pathKey) || handleEntry;
      if (!changedEntry) return;
      const normalizedContent = normalizeEditorContent(changedEntry.content);
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
        renderEditorSyntaxHighlights();
        renderMarkdown();
      }
      changed = true;
    });
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
  }

  async function updateOpenFolderLinksAfterSidebarRename(oldPath, newPath, kind) {
    if (!oldPath || !newPath || !folderMarkdownFiles.length) return 0;
    const files = folderMarkdownFiles.slice();
    const nodeIndex = new Map();
    files.forEach((entry) => {
      const path = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      const id = normalizeGraphNodeName(path);
      if (id) nodeIndex.set(id, path);
    });

    const changedFiles = new Map();
    for (const entry of files) {
      const sourcePath = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      if (!sourcePath) continue;
      try {
        const content = await getEntryContent(entry);
        const updatedContent = updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind);
        if (updatedContent === content) continue;
        const writePath = await writeFolderMarkdownEntryContent(entry, updatedContent, oldPath, newPath, kind);
        const changedEntry = {
          content: updatedContent,
          handle: entry.handle || null
        };
        [writePath, entry.fullPath, entry.path, sourcePath]
          .filter(Boolean)
          .forEach((pathKey) => changedFiles.set(pathKey, changedEntry));
      } catch (error) {
        console.warn(`Failed to update Markdown links in ${sourcePath}:`, error);
      }
    }
    updateOpenTabsAfterMarkdownLinkRename(changedFiles);
    return changedFiles.size;
  }

  function replacePathPrefix(path, oldPrefix, newPrefix) {
    if (!path || !oldPrefix || !newPrefix) return path;
    const originalPath = String(path);
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = originalPath.replace(/\\/g, "/");
    const normalizedOldPrefix = normalize(oldPrefix);
    if (normalizedPath !== normalizedOldPrefix && !normalizedPath.startsWith(normalizedOldPrefix + "/")) {
      return path;
    }
    return String(newPrefix).replace(/\/+$/, "") + normalizedPath.slice(normalizedOldPrefix.length);
  }

  function getPathRelativeToFolder(path, folderPath) {
    if (!path || !folderPath || !isPathInsideFolder(path, folderPath)) return "";
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedFolder = normalize(folderPath);
    const normalizedPath = String(path).replace(/\\/g, "/");
    return normalizedPath === normalizedFolder ? "" : normalizedPath.slice(normalizedFolder.length + 1);
  }

  function renameGraphSnapshotPathReferences(snapshot, pathMappings) {
    if (!snapshot || !Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    const idMappings = new Map();
    const getRenamedPath = (path) => {
      for (const mapping of pathMappings) {
        const renamed = mapping.isPrefix
          ? replacePathPrefix(path, mapping.oldPath, mapping.newPath)
          : (path === mapping.oldPath ? mapping.newPath : path);
        if (renamed !== path) return renamed;
      }
      return path;
    };

    (snapshot.nodes || []).forEach((node) => {
      const oldId = node.id;
      const oldPath = node.fullPath || oldId;
      const newPath = getRenamedPath(oldPath);
      if (newPath === oldPath) return;
      const newId = normalizeGraphNodeName(newPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      node.id = newId || oldId;
      node.label = getGraphDisplayLabel(newPath);
      node.fullPath = newPath;
      changed = true;
    });

    (snapshot.files || []).forEach((file) => {
      const oldId = file.id;
      const oldPath = file.path || oldId;
      const oldFullPath = file.fullPath || "";
      const newPath = getRenamedPath(oldPath);
      const newFullPath = getRenamedPath(oldFullPath);
      if (newPath === oldPath && newFullPath === oldFullPath) return;
      const idPath = newPath !== oldPath ? newPath : (newFullPath || oldPath);
      const newId = normalizeGraphNodeName(idPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      file.id = newId || oldId;
      file.path = newPath;
      file.name = getFileName(newPath || newFullPath || file.name);
      if (file.fullPath !== undefined) file.fullPath = newFullPath || file.fullPath;
      changed = true;
    });

    if (idMappings.size) {
      (snapshot.links || []).forEach((link) => {
        const newSource = idMappings.get(link.source);
        const newTarget = idMappings.get(link.target);
        if (newSource) {
          link.source = newSource;
          changed = true;
        }
        if (newTarget) {
          link.target = newTarget;
          changed = true;
        }
      });
    }

    return { changed, idMappings };
  }

  function updateGraphTabConfigAfterNodeRename(tab, idMappings) {
    if (!tab || !idMappings || !idMappings.size) return false;
    let changed = false;
    const renameId = (id) => idMappings.get(id) || id;
    const renameIds = (ids) => Array.isArray(ids) ? ids.map(renameId) : ids;

    if (tab.graphViewConfig) {
      if (tab.graphViewConfig.focusNodeId && idMappings.has(tab.graphViewConfig.focusNodeId)) {
        tab.graphViewConfig.focusNodeId = renameId(tab.graphViewConfig.focusNodeId);
        changed = true;
      }
      ["allowedNodeIds", "hiddenNodeIds"].forEach((key) => {
        const renamedIds = renameIds(tab.graphViewConfig[key]);
        if (renamedIds && renamedIds !== tab.graphViewConfig[key]) {
          tab.graphViewConfig[key] = renamedIds;
          changed = true;
        }
      });
    }

    if (tab.graphLayout?.nodes && typeof tab.graphLayout.nodes === "object") {
      idMappings.forEach((newId, oldId) => {
        if (!Object.prototype.hasOwnProperty.call(tab.graphLayout.nodes, oldId)) return;
        tab.graphLayout.nodes[newId] = tab.graphLayout.nodes[oldId];
        delete tab.graphLayout.nodes[oldId];
        changed = true;
      });
    }

    return changed;
  }

  function updateGraphTabsAfterPathRename(pathMappings) {
    if (!Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type !== "graph" || !tab.graphSnapshot) return;
      const result = renameGraphSnapshotPathReferences(tab.graphSnapshot, pathMappings);
      if (!result?.changed) return;
      updateGraphTabConfigAfterNodeRename(tab, result.idMappings);
      const cachedRender = graphRenderCache.get(tab.id);
      if (cachedRender?.simulation) cachedRender.simulation.stop();
      if (cachedRender?.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(tab.id);
      changed = true;
    });
    return changed;
  }

  function getSidebarRenamePathMappings(oldPath, newPath, kind) {
    const mappings = [];
    if (oldPath && newPath) {
      mappings.push({ oldPath, newPath, isPrefix: kind === "folder" });
    }
    if (activeFolderPath && oldPath && newPath) {
      const oldRelativePath = getPathRelativeToFolder(oldPath, activeFolderPath);
      const newRelativePath = getPathRelativeToFolder(newPath, activeFolderPath);
      if (oldRelativePath && newRelativePath) {
        mappings.push({ oldPath: oldRelativePath, newPath: newRelativePath, isPrefix: kind === "folder" });
      }
    }
    return mappings;
  }

  function updateTabsAfterSidebarFolderRename(oldPath, newPath) {
    if (!oldPath || !newPath) return;
    let changed = false;
    tabs.forEach((tab) => {
      const renamedPath = replacePathPrefix(tab.sourceFilePath, oldPath, newPath);
      if (renamedPath === tab.sourceFilePath) return;
      tab.sourceFilePath = renamedPath;
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath, newPath, "folder")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  async function sidebarFileExists(parentNode, fileName) {
    if (!parentNode || !fileName) return false;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(parentNode);
      if (!parentPath || !Neutralino.filesystem?.readDirectory) return false;
      const entries = await Neutralino.filesystem.readDirectory(parentPath);
      return entries.some((entry) => entry.entry.toLowerCase() === fileName.toLowerCase());
    }

    if (parentNode.handle && typeof parentNode.handle.getFileHandle === "function") {
      try {
        await parentNode.handle.getFileHandle(fileName, { create: false });
        return true;
      } catch (error) {
        if (error && (error.name === "NotFoundError" || error.code === 8)) return false;
        throw error;
      }
    }

    return (parentNode.children || []).some((child) => child.kind === "file" && child.name.toLowerCase() === fileName.toLowerCase());
  }

  async function createSidebarFileOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const fileName = await promptSidebarNewFileName(node);
    if (!fileName) return;

    if (await sidebarFileExists(node, fileName)) {
      alert("A file with this name already exists here.");
      return;
    }

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.writeFile) {
        alert("Creating files is available only in the desktop app for folders opened from disk.");
        return;
      }
      const filePath = joinPath(parentPath, fileName);
      await Neutralino.filesystem.writeFile(filePath, "");
    } else if (node.handle && typeof node.handle.getFileHandle === "function") {
      const fileHandle = await node.handle.getFileHandle(fileName, { create: true });
      if (!fileHandle || typeof fileHandle.createWritable !== "function") {
        alert("Creating files from the folder tree requires write access to the opened folder.");
        return;
      }
      const writable = await fileHandle.createWritable();
      await writable.write("");
      await writable.close();
    } else {
      alert("Creating files from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
  }

  async function createSidebarFolderOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const folderName = await promptSidebarNewFolderName(node);
    if (!folderName) return;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.createDirectory) {
        alert("Creating folders is available only in the desktop app for folders opened from disk.");
        return;
      }
      await Neutralino.filesystem.createDirectory(joinPath(parentPath, folderName));
    } else if (node.handle && typeof node.handle.getDirectoryHandle === "function") {
      await node.handle.getDirectoryHandle(folderName, { create: true });
    } else {
      alert("Creating folders from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
  }

  async function renameSidebarNodeOnDisk(node, kind) {
    if (!node) return;
    const oldName = node.name || "";
    const newName = await promptSidebarRename(node, kind);
    if (!newName || newName === oldName) return;

    const oldPath = kind === "folder" ? getSidebarFolderFilesystemPath(node) : getSidebarNodeFilesystemPath(node);
    const newPath = oldPath ? getRenamedSiblingPath(oldPath, newName) : (node.path ? getRenamedSiblingPath(node.path, newName) : newName);

    if (isNeutralinoRuntime()) {
      if (!oldPath || !Neutralino.filesystem?.move) {
        alert(`Renaming ${kind}s requires filesystem.move permission in the desktop app for ${kind}s opened from disk.`);
        return;
      }
      await Neutralino.filesystem.move(oldPath, newPath);
    } else if (node.handle && typeof node.handle.move === "function") {
      await node.handle.move(newName);
    } else {
      alert(`Renaming ${kind}s from the folder tree is available in the desktop app for ${kind}s opened from disk.`);
      return;
    }

    try {
      await updateOpenFolderLinksAfterSidebarRename(oldPath || node.path, newPath, kind);
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to update Markdown links:`, error);
    }

    if (kind === "folder") {
      updateTabsAfterSidebarFolderRename(oldPath || node.path, newPath);
    } else {
      updateTabsAfterSidebarFileRename(node, oldPath || node.path, newPath, newName);
    }

    try {
      await reloadOpenFolderTree();
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to refresh the folder tree:`, error);
    }
  }

  function ensureSidebarFileContextMenu() {
    if (sidebarFileContextMenu) return sidebarFileContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-file-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const openFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInNewTab.label,
      CONTEXT_MENU_ACTIONS.openInNewTab.icon,
      "Open this file in a dedicated tab from the sidebar tree."
    );
    const openDefaultAppBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.label,
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.icon,
      "Ask the operating system to open this file with its configured default application."
    );
    const revealFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    const renameFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this file on disk and refresh the folder tree."
    );

    const { submenu: tagsSubmenu, submenuPanel: tagsSubmenuPanel } = createTagsContextSubmenu(
      "Add or remove YAML frontmatter tags for this file."
    );

    const copySubmenu = document.createElement("div");
    copySubmenu.className = "graph-context-menu-submenu";
    const copySubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copy.label,
      CONTEXT_MENU_ACTIONS.copy.icon,
      "Open copy actions for this file, including its path and content."
    );
    copySubmenuBtn.setAttribute("aria-haspopup", "true");
    const copySubmenuArrow = document.createElement("span");
    copySubmenuArrow.className = "graph-context-menu-submenu-arrow";
    copySubmenuArrow.textContent = "›";
    copySubmenuBtn.appendChild(copySubmenuArrow);
    const copySubmenuPanel = document.createElement("div");
    copySubmenuPanel.className = "graph-context-menu-submenu-panel";
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this file's path and file name to the clipboard."
    );
    const copyContentBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire content of this file to the clipboard."
    );
    copySubmenuPanel.appendChild(copyPathBtn);
    copySubmenuPanel.appendChild(copyContentBtn);
    copySubmenu.appendChild(copySubmenuBtn);
    copySubmenu.appendChild(copySubmenuPanel);

    const shareFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.share.label,
      CONTEXT_MENU_ACTIONS.share.icon,
      "Copy a shareable URL containing this file's Markdown content."
    );

    const deleteFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFile.label,
      CONTEXT_MENU_ACTIONS.deleteFile.icon,
      "Delete this file from disk after confirmation."
    );
    deleteFileBtn.classList.add("graph-context-menu-item-danger");

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu";
    const exportSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this file."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this file as Markdown.");
    const exportHtmlBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this file as HTML.");
    const exportPdfBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this file as PDF.");
    [exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    const deleteFileTopSeparator = document.createElement("div");
    deleteFileTopSeparator.className = "graph-context-menu-separator";
    const deleteFileBottomSeparator = document.createElement("div");
    deleteFileBottomSeparator.className = "graph-context-menu-separator";

    [
      title,
      separator,
      openFileBtn,
      openDefaultAppBtn,
      revealFileBtn,
      renameFileBtn,
      tagsSubmenu,
      copySubmenu,
      shareFileBtn,
      deleteFileTopSeparator,
      deleteFileBtn,
      deleteFileBottomSeparator,
      exportSubmenu
    ].forEach((item) => {
      menu.appendChild(item);
    });
    document.body.appendChild(menu);

    openFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openDocumentSourceFile({ ...getSidebarNodeSource(target), content: await readSidebarNodeContent(target) });
        rememberRecentFile(getSidebarNodeSource(target));
      } catch (error) {
        console.error("Failed to open sidebar context file:", error);
        alert("Unable to open selected file.");
      }
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await Neutralino.os.open(filePath);
      } catch (error) {
        console.error("Failed to open sidebar file with default app:", error);
        alert("Unable to open this file with the default app.");
      }
    });

    revealFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime()) {
        alert("Revealing files is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        if (typeof NL_OS !== "undefined" && NL_OS === "Windows" && Neutralino.os?.execCommand) {
          const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
          await Neutralino.os.execCommand(`explorer.exe /select,"${windowsPath}"`);
        } else if (Neutralino.os?.open) {
          const normalized = filePath.replace(/\\/g, "/");
          const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
          await Neutralino.os.open(folderPath);
        } else {
          throw new Error("No supported reveal command is available.");
        }
      } catch (error) {
        console.error("Failed to reveal sidebar file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    renameFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "file");
      } catch (error) {
        console.error("Failed to rename sidebar file:", error);
        alert("Unable to rename this file.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarNodeClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar file path:", error);
        alert("Unable to copy this file path.");
      }
    });

    copyContentBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to copy sidebar file content:", error);
        alert("Unable to copy this file content.");
      }
    });

    shareFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        copyShareUrlFromText(await readSidebarNodeContent(target), shareFileBtn);
      } catch (error) {
        console.error("Failed to share sidebar file:", error);
        alert("Unable to share this file.");
      }
    });

    exportMarkdownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportMarkdownContent(await readSidebarNodeContent(target), target.name);
      } catch (error) {
        console.error("Failed to export sidebar file as Markdown:", error);
        alert("Unable to export this file as Markdown.");
      }
    });

    exportHtmlBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportHtmlContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as HTML:", error);
        alert("Unable to export this file as HTML.");
      }
    });

    exportPdfBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportPdfContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as PDF:", error);
        alert("Unable to export this file as PDF.");
      }
    });

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
        alert("Deleting files is available only in the desktop app for files opened from disk.");
        return;
      }
      const confirmed = window.confirm(`Delete "${target.name}" from disk? This action cannot be undone.`);
      if (!confirmed) return;
      try {
        await Neutralino.filesystem.remove(filePath);
        closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: target.handle || null });
        await refreshOpenFolderTreeAfterFileDelete(filePath);
      } catch (error) {
        console.error("Failed to delete sidebar file:", error);
        alert("Unable to delete this file.");
      }
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFileContextMenu = menu;
    return sidebarFileContextMenu;
  }

  function isOpenFolderRootContextNode(node) {
    return !!(node && node.isOpenFolderRootContext === true);
  }

  function getOpenFolderRootContextNode() {
    return {
      kind: "directory",
      name: activeFolderName || "Folder",
      path: "",
      fullPath: activeFolderPath || "",
      handle: activeFolderHandle || null,
      isOpenFolderRootContext: true
    };
  }

  function getSidebarFolderClipboardPath(node) {
    if (!node) return "";
    if (isOpenFolderRootContextNode(node)) {
      return activeFolderPath || activeFolderName || "";
    }
    return node.fullPath || node.path || node.name || "";
  }

  function getSidebarFolderFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (isOpenFolderRootContextNode(node)) return activeFolderPath || null;
    if (node.fullPath) return node.fullPath;
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  function getSidebarFolderGraphTitle(node) {
    const folderPath = getSidebarFolderClipboardPath(node);
    return folderPath ? `Graph View: ${folderPath}` : `Graph View: ${node?.name || "Folder"}`;
  }

  async function collectMarkdownFilesForSidebarFolder(node) {
    if (!node || node.kind !== "directory") return [];
    const parentPath = node.path || node.name || "";
    if (isNeutralinoRuntime()) {
      return collectMarkdownFilesFromTreeNeutralino(node.children || [], parentPath);
    }
    return collectMarkdownFilesFromTree(node.children || [], parentPath);
  }

  async function openSidebarFolderGraphView(node) {
    if (!node || node.kind !== "directory") return;
    if (isOpenFolderRootContextNode(node)) {
      await openGraphView();
      return;
    }

    const folderName = getSidebarFolderGraphTitle(node);
    const graphScopeKey = createFolderGraphScopeKey("sidebar-folder", getSidebarFolderClipboardPath(node) || folderName);
    if (focusExistingFolderGraphTab(graphScopeKey, folderName)) return;

    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to graph.");
      return;
    }

    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName);
    const graphTab = createGraphTab(folderName, { graphSnapshot, graphViewConfig: null, graphScopeKey });
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }

  async function exportSidebarFolderToGraph(node) {
    if (!node || node.kind !== "directory") return false;
    if (isOpenFolderRootContextNode(node)) {
      return exportActiveFolderToGraph();
    }

    const folderName = getSidebarFolderGraphTitle(node);
    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    return exportFolderFilesToGraph(folderFiles, folderName);
  }

  async function revealSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Revealing folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    await Neutralino.os.open(folderPath);
  }

  async function deleteSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    const confirmed = window.confirm(`Delete folder "${node.name}" and its contents from disk? This action cannot be undone.`);
    if (!confirmed) return;
    await Neutralino.filesystem.remove(folderPath);
    closeTabsForDeletedPath(folderPath, { kind: "folder" });
    if (isOpenFolderRootContextNode(node)) {
      closeFolderTree();
    } else {
      await reloadOpenFolderTree();
    }
  }

  function ensureSidebarFolderContextMenu() {
    if (sidebarFolderContextMenu) return sidebarFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-folder-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const showGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showGraphView.label,
      CONTEXT_MENU_ACTIONS.showGraphView.icon,
      "Open a graph view containing only Markdown files in this folder and its sub-folders."
    );
    const exportFolderToGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportFolderToGraph.label,
      CONTEXT_MENU_ACTIONS.exportFolderToGraph.icon,
      "Create a portable graph archive that includes Markdown file contents."
    );
    const refreshFolderTreeBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.refresh.label,
      CONTEXT_MENU_ACTIONS.refresh.icon,
      "Reload the open folder tree from disk to show file system changes."
    );
    const revealFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open this folder in the system file explorer."
    );
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this folder path to the clipboard."
    );
    const newFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFile.label,
      CONTEXT_MENU_ACTIONS.newFile.icon,
      "Create a new empty text file under this folder."
    );
    const newFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFolder.label,
      CONTEXT_MENU_ACTIONS.newFolder.icon,
      "Create a new folder under this folder."
    );
    const renameFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this folder on disk and refresh the folder tree."
    );
    const deleteFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFolder.label,
      CONTEXT_MENU_ACTIONS.deleteFolder.icon,
      "Delete this folder and its contents from disk after confirmation."
    );
    const deleteFolderSeparator = document.createElement("div");
    deleteFolderSeparator.className = "graph-context-menu-separator";
    renameFolderBtn.dataset.sidebarFolderAction = "rename";
    deleteFolderBtn.dataset.sidebarFolderAction = "delete";
    deleteFolderSeparator.dataset.sidebarFolderAction = "delete";
    deleteFolderBtn.classList.add("graph-context-menu-item-danger");

    [
      title,
      separator,
      revealFolderBtn,
      renameFolderBtn,
      copyPathBtn,
      newFileBtn,
      newFolderBtn,
      showGraphBtn,
      exportFolderToGraphBtn,
      refreshFolderTreeBtn,
      deleteFolderSeparator,
      deleteFolderBtn
    ].forEach((item) => menu.appendChild(item));
    document.body.appendChild(menu);

    refreshFolderTreeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideSidebarFolderContextMenu();
      try {
        const refreshed = await reloadOpenFolderTree();
        if (!refreshed) {
          alert("Unable to refresh the folder tree because no reusable folder source is available. Please reopen the folder.");
        }
      } catch (error) {
        console.error("Failed to refresh folder tree:", error);
        alert("Unable to refresh the folder tree.");
      }
    });

    showGraphBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await openSidebarFolderGraphView(target);
      } catch (error) {
        console.error("Failed to open sidebar folder graph view:", error);
        alert("Unable to open a graph view for this folder.");
      }
    });

    exportFolderToGraphBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await exportSidebarFolderToGraph(target);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Failed to export sidebar folder to graph:", error);
        alert("Unable to export this folder to a graph archive.");
      }
    });

    newFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFileOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar file:", error);
        alert("Unable to create a new file here.");
      }
    });

    newFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFolderOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar folder:", error);
        alert("Unable to create a new folder here.");
      }
    });

    revealFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await revealSidebarFolder(target);
      } catch (error) {
        console.error("Failed to reveal sidebar folder:", error);
        alert("Unable to reveal this folder in the file explorer.");
      }
    });

    renameFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "folder");
      } catch (error) {
        console.error("Failed to rename sidebar folder:", error);
        alert("Unable to rename this folder.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarFolderClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar folder path:", error);
        alert("Unable to copy this folder path.");
      }
    });

    deleteFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await deleteSidebarFolder(target);
      } catch (error) {
        console.error("Failed to delete sidebar folder:", error);
        alert("Unable to delete this folder.");
      }
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFolderContextMenu = menu;
    return sidebarFolderContextMenu;
  }

  function showSidebarFileContextMenu(event, node) {
    if (!node || node.kind !== "file") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFolderContextMenu();
    sidebarContextTarget = node;
    const menu = ensureSidebarFileContextMenu();
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = node.name || "File";
    const tagsSubmenu = menu.querySelector(".tags-context-submenu");
    const tagsSubmenuPanel = menu.querySelector(".tags-context-submenu-panel");
    const canManageTags = isMarkdownPath(node.name || node.path || node.fullPath || "");
    if (tagsSubmenu) tagsSubmenu.classList.toggle("hidden", !canManageTags);
    if (canManageTags) {
      const renderSidebarTags = (currentTags) => {
        renderTagsContextSubmenu(tagsSubmenuPanel, currentTags, async (tag, shouldAdd) => {
          const latestContent = await readSidebarNodeContent(node);
          const latestTags = getFileTagsFromContent(latestContent);
          const nextTags = shouldAdd
            ? [...latestTags, tag]
            : latestTags.filter((existingTag) => existingTag !== tag);
          hideSidebarFileContextMenu();
          try {
            await setSidebarNodeTags(node, nextTags);
          } catch (error) {
            console.error("Failed to update sidebar file tags:", error);
            alert("Unable to update this file's tags.");
          }
        });
      };
      renderSidebarTags(getFolderTreeNodeTags(node));
      readSidebarNodeContent(node)
        .then((content) => renderSidebarTags(getFileTagsFromContent(content)))
        .catch((error) => console.warn("Failed to refresh sidebar context tag checks:", error));
    }
    menu.classList.remove("hidden");
    positionSidebarFileContextMenu(event);
  }

  function showSidebarFolderContextMenu(event, node) {
    if (!node || node.kind !== "directory") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    sidebarContextTarget = node;
    const menu = ensureSidebarFolderContextMenu();
    const isRootContext = isOpenFolderRootContextNode(node);
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = isRootContext ? (activeFolderName || "Folder") : (node.name || "Folder");
    menu.querySelectorAll('[data-sidebar-folder-action="rename"], [data-sidebar-folder-action="delete"]').forEach((item) => {
      item.classList.toggle("hidden", isRootContext);
    });
    menu.classList.remove("hidden");
    positionSidebarFolderContextMenu(event);
  }

  function ensureSidebarClosedFolderContextMenu() {
    if (sidebarClosedFolderContextMenu) return sidebarClosedFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-closed-folder-context-menu hidden";

    const openFolderBtn = createFileContextMenuButton(
      getOpenFolderActionLabel(),
      CONTEXT_MENU_ACTIONS.openFolder.icon,
      getOpenFolderActionTitle()
    );
    openFolderBtn.dataset.sidebarClosedFolderAction = "open-folder";

    menu.appendChild(openFolderBtn);
    document.body.appendChild(menu);

    openFolderBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideSidebarClosedFolderContextMenu();
      await openFolderTree(event);
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarClosedFolderContextMenu = menu;
    return sidebarClosedFolderContextMenu;
  }

  function showSidebarClosedFolderContextMenu(event) {
    if (isFolderOpen) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    const menu = ensureSidebarClosedFolderContextMenu();
    const openFolderBtn = menu.querySelector('[data-sidebar-closed-folder-action="open-folder"]');
    if (openFolderBtn) {
      const label = openFolderBtn.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = getOpenFolderActionLabel();
      openFolderBtn.dataset.tooltip = getOpenFolderActionTitle();
    }
    menu.classList.remove("hidden");
    positionSidebarClosedFolderContextMenu(event);
  }

  function handleFolderTreeRootContextMenu(event) {
    if (!folderTreeRoot) return;
    if (!isFolderOpen) {
      hideSidebarClosedFolderContextMenu();
      return;
    }
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (targetElement?.closest(".folder-tree-label, .folder-tree-file")) return;
    showSidebarFolderContextMenu(event, getOpenFolderRootContextNode());
  }

  async function handleFolderTreeRootClick(event) {
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    const openFolderButton = targetElement?.closest(".folder-tree-open-folder-button");
    if (!openFolderButton || isFolderOpen) return;
    event.preventDefault();
    await openFolderTree(event);
  }

  const folderTreeAnimationTimers = new WeakMap();

  function getFolderTreeChildrenContainer(details) {
    return details.querySelector(":scope > .folder-tree-children");
  }

  function resetFolderTreeAnimation(details, childrenContainer) {
    const existingTimer = folderTreeAnimationTimers.get(details);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      folderTreeAnimationTimers.delete(details);
    }

    details.classList.remove("is-expanding", "is-collapsing");
    if (childrenContainer) {
      childrenContainer.style.height = "";
      childrenContainer.style.opacity = "";
    }
  }

  function finishFolderTreeAnimation(details, childrenContainer, shouldOpen) {
    details.open = shouldOpen;
    resetFolderTreeAnimation(details, childrenContainer);
  }

  function prefersReducedFolderTreeMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function toggleFolderTreeDetails(details) {
    const childrenContainer = getFolderTreeChildrenContainer(details);
    if (!childrenContainer || prefersReducedFolderTreeMotion()) {
      resetFolderTreeAnimation(details, childrenContainer);
      details.open = !details.open;
      updateFolderTreeExpandToggleButtons();
      return;
    }

    const shouldExpand = !details.open || details.classList.contains("is-collapsing");
    resetFolderTreeAnimation(details, childrenContainer);

    if (shouldExpand) {
      details.open = true;
      details.classList.add("is-expanding");
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";

      window.requestAnimationFrame(() => {
        childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
        childrenContainer.style.opacity = "1";
      });

      const timer = window.setTimeout(() => {
        finishFolderTreeAnimation(details, childrenContainer, true);
        updateFolderTreeExpandToggleButtons();
      }, 220);
      folderTreeAnimationTimers.set(details, timer);
      return;
    }

    details.classList.add("is-collapsing");
    childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
    childrenContainer.style.opacity = "1";

    window.requestAnimationFrame(() => {
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";
    });

    const timer = window.setTimeout(() => {
      finishFolderTreeAnimation(details, childrenContainer, false);
      updateFolderTreeExpandToggleButtons();
    }, 220);
    folderTreeAnimationTimers.set(details, timer);
  }

  function getFileIconClass(fileName, options = {}) {
    if (options.isUnsupportedFile) return "bi-file-earmark-x";
    if (options.isGraphFile || isGraphFilePath(fileName)) return "bi-diagram-3";
    const extension = getFileExtension(fileName);
    const iconByExtension = {
      json: "bi-filetype-json",
      js: "bi-filetype-js",
      mjs: "bi-filetype-js",
      cjs: "bi-filetype-js",
      ts: "bi-filetype-tsx",
      tsx: "bi-filetype-tsx",
      jsx: "bi-filetype-jsx",
      css: "bi-filetype-css",
      html: "bi-filetype-html",
      htm: "bi-filetype-html",
      java: "bi-filetype-java",
      py: "bi-filetype-py",
      php: "bi-filetype-php",
      rb: "bi-filetype-rb",
      sql: "bi-filetype-sql",
      xml: "bi-filetype-xml",
      yaml: "bi-filetype-yml",
      yml: "bi-filetype-yml",
      csv: "bi-filetype-csv",
      txt: "bi-filetype-txt",
      text: "bi-filetype-txt"
    };
    if (iconByExtension[extension]) return iconByExtension[extension];
    return isMarkdownPath(fileName) ? "bi-file-earmark-text" : "bi-file-text";
  }

  function renderFolderTreeNode(node, parentPath = "") {
    const li = document.createElement("li");
    li.className = "folder-tree-item";
    if (node.kind === "directory") {
      const currentPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
      node.path = currentPath;
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.className = "folder-tree-label";
      const icon = document.createElement("i");
      icon.className = "bi bi-folder";
      const label = document.createElement("span");
      label.textContent = node.name;
      summary.appendChild(icon);
      summary.appendChild(label);
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFolderTreeDetails(details);
      });
      summary.addEventListener("contextmenu", (event) => showSidebarFolderContextMenu(event, node));
      details.appendChild(summary);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-tree-children";
      const ul = document.createElement("ul");
      ul.className = "folder-tree-list";
      node.children.forEach((child) => ul.appendChild(renderFolderTreeNode(child, currentPath)));
      childrenContainer.appendChild(ul);
      details.appendChild(childrenContainer);
      li.appendChild(details);
      return li;
    }

    const button = document.createElement("button");
    let sidebarOpenClickTimer = null;
    const isGraphFile = isGraphFilePath(node.name) || node.isGraphDocumentFile === true;
    const isJsonFile = isJsonPath(node.name);
    const isUnsupportedFile = !isSupportedFolderTreeDocumentNode(node);
    const canOpenAsTextFile = isSidebarDocumentNode(node);
    button.type = "button";
    button.className = "folder-tree-file"
      + (isGraphFile ? " folder-tree-graph-file" : "")
      + (isUnsupportedFile ? " folder-tree-unsupported-file" : "");
    button.title = isUnsupportedFile
      ? (canOpenAsTextFile
        ? "Click to preview this text file; double-click to keep open"
        : "Unsupported files are hidden by default and shown here only because unsupported files are enabled")
      : (isGraphFile ? "Click to open graph" : "Click to preview in the text editor; double-click to keep open");
    button.dataset.name = node.name || "";
    button.dataset.path = node.path || "";
    button.dataset.fullPath = node.fullPath || "";
    const fileIconClass = getFileIconClass(node.name, { isGraphFile, isJsonFile, isUnsupportedFile });
    button.innerHTML = `<i class="bi ${fileIconClass}"></i><span>${node.name}</span>`;

    async function readSidebarFileContent() {
      if (typeof NL_VERSION !== "undefined" && node.fullPath) {
        // Desktop: read file via Neutralino filesystem
        return Neutralino.filesystem.readFile(node.fullPath);
      }

      // Browser: read file via File System Access API or upload fallback
      const file = node.file ? node.file : await node.handle.getFile();
      return file.text();
    }

    function getSidebarFileSource() {
      return {
        name: node.name,
        handle: node.handle || null,
        path: node.fullPath || node.path || null
      };
    }

    async function openSidebarFile(options) {
      try {
        const existingTab = findTabForSidebarFile(node);
        if (existingTab) {
          switchTab(existingTab.id);
          if (options && options.temporary === false) {
            pinTemporaryTab(existingTab.id);
          }
          rememberRecentFile(getSidebarFileSource());
          return;
        }

        const content = await readSidebarFileContent();
        const sourceFile = getSidebarFileSource();
        if (isGraphFile || isJsonFile) {
          const openedTab = await openDocumentSourceFile({ ...sourceFile, content });
          if (openedTab && options && options.temporary === false) {
            pinTemporaryTab(openedTab.id);
          }
        } else {
          const title = getMarkdownTitleFromFileName(node.name);
          if (options && options.temporary === false) {
            openSidebarFileInPermanentTab(content, title, sourceFile);
          } else {
            openSidebarFileInTemporaryTab(content, title, sourceFile);
          }
        }
        rememberRecentFile(sourceFile);
      } catch (error) {
        console.error("Failed to open sidebar file:", error);
        alert("Unable to open selected file.");
      }
    }

    if (canOpenAsTextFile) {
      button.addEventListener("click", () => {
        window.clearTimeout(sidebarOpenClickTimer);
        sidebarOpenClickTimer = window.setTimeout(() => {
          openSidebarFile({ temporary: true });
        }, 200);
      });

      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        window.clearTimeout(sidebarOpenClickTimer);
        openSidebarFile({ temporary: false });
      });
    }

    button.addEventListener("contextmenu", (event) => {
      window.clearTimeout(sidebarOpenClickTimer);
      showSidebarFileContextMenu(event, node);
    });

    li.appendChild(button);
    return li;
  }

  function findTabForSidebarFile(node) {
    if (!node || node.kind !== "file") return null;

    if (node.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.sourceFileHandle === node.handle;
      });
      if (handleMatch) return handleMatch;
    }

    const nodePath = node.fullPath || node.path || null;
    if (nodePath) {
      const pathMatch = tabs.find(function(tab) {
        return tab.sourceFilePath === nodePath;
      });
      if (pathMatch) return pathMatch;
    }

    const title = isGraphFilePath(node.name) ? getGraphTitleFromFileName(node.name) : getMarkdownTitleFromFileName(node.name);
    return tabs.find(function(tab) {
      return tab.sourceFileName === node.name || tab.title === title;
    }) || null;
  }

  async function buildTreeFromFileList(fileList) {
    const root = [];
    const ensureDir = (nodes, name) => {
      let dir = nodes.find((n) => n.kind === "directory" && n.name === name);
      if (!dir) {
        dir = { kind: "directory", name, children: [] };
        nodes.push(dir);
      }
      return dir;
    };

    for (const file of Array.from(fileList)) {
      const relPath = (file.webkitRelativePath || file.name).split("/");
      const fileName = relPath.pop();
      let cursor = root;
      relPath.forEach((segment) => {
        cursor = ensureDir(cursor, segment).children;
      });
      const modifiedAt = Number(file?.lastModified || 0) || 0;
      const isGraphDocumentFile = await fileContainsGraphDocument(file);
      cursor.push({ kind: "file", name: fileName, file, path: (file.webkitRelativePath || file.name), modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
    }

    return sortFolderTreeNodes(root);
  }
  async function openFolderTree(event) {
  // Desktop app: use Neutralino native folder picker (no permission dialog)
  if (typeof NL_VERSION !== "undefined") {
    try {
      const selectedPath = await Neutralino.os.showFolderDialog("Select a folder");
      await openFolderTreeFromNeutralinoPath(selectedPath);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.error("Neutralino folder picker error:", error);
    }
    return;
  }

  if (folderPicker.shouldUseNativeDirectoryPicker(event)) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      activeFolderName = dirHandle && dirHandle.name ? dirHandle.name : "Graph View";
      activeFolderHandle = dirHandle || null;
      activeFolderPath = null;
      const nodes = await listMarkdownTree(dirHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.warn("Directory picker unavailable, using browser folder input.", error);
    }
  }

  if (folderInput) {
    if (!shownFolderInputFallbackNotice) {
      console.info(folderPicker.getFolderPickerFallbackMessage());
      shownFolderInputFallbackNotice = true;
    }
    folderInput.click();
  } else {
    alert("Folder selection is not supported in this environment.");
  }
}

  async function importDocumentFile(file) {
    try {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
    } catch (error) {
      console.error("Failed to open file:", error);
      alert("Unable to open selected file: " + error.message);
    }
  }

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

    updateSidebarToggleButtons();

    if (currentViewMode === 'split') {
      requestAnimationFrame(applyPaneWidths);
    }
  }

  function toggleSidebar() {
    setSidebarVisible(!isSidebarVisible());
  }

  function isFirefoxBrowser() {
    return /firefox\//i.test(navigator.userAgent || "");
  }

  function sanitizeMarkdownFileName(fileName) {
    const fallback = "document";
    let cleaned = String(fileName || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
    cleaned = cleaned.replace(/^\.+$/, "") || fallback;
    if (!/\.(md|markdown)$/i.test(cleaned)) {
      cleaned += ".md";
    }
    return cleaned;
  }

  function getSuggestedMarkdownFileName(tab) {
    return sanitizeMarkdownFileName((tab && tab.title) || "document");
  }

  function joinPath(dirPath, fileName) {
    if (!dirPath) return fileName;
    return dirPath.replace(/[\\/]+$/, "") + "/" + fileName;
  }

  function updateTabAfterSave(tab, content, metadata) {
    const normalizedContent = normalizeEditorContent(content);
    tab.content = normalizedContent;
    tab.savedContent = normalizedContent;
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getMarkdownTitleFromFileName(metadata.name);
      }
      if (metadata.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata.path) tab.sourceFilePath = metadata.path;
    }
    syncMarkdownTabTagsToFolderState(tab, normalizedContent);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  function getMarkdownTabContentForSave(tab) {
    if (!tab) return '';
    return normalizeEditorContent(tab.id === activeTabId ? markdownEditor.value : tab.content);
  }

  async function saveMarkdownTabToSource(tab) {
    if (!tab || tab.type === "graph" || (!tab.sourceFileHandle && !tab.sourceFilePath)) return false;

    try {
      const content = getMarkdownTabContentForSave(tab);
      if (tab.sourceFileHandle && typeof tab.sourceFileHandle.createWritable === "function") {
        const writable = await tab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateTabAfterSave(tab, content, {
          name: tab.sourceFileHandle.name || tab.sourceFileName,
          handle: tab.sourceFileHandle
        });
      } else if (typeof NL_VERSION !== "undefined" && tab.sourceFilePath) {
        await Neutralino.filesystem.writeFile(tab.sourceFilePath, content);
        updateTabAfterSave(tab, content, {
          name: getFileName(tab.sourceFilePath),
          path: tab.sourceFilePath
        });
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save file to original location:", error);
      return false;
    }
  }

  async function saveMarkdownTabWithSaveDialog(tab) {
    if (!tab || tab.type === "graph") return false;

    const content = getMarkdownTabContentForSave(tab);
    const suggestedName = getSuggestedMarkdownFileName(tab);

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog("Save Markdown file", {
        defaultPath,
        filters: [
          { name: "Markdown files", extensions: ["md", "markdown"] }
        ]
      });
      if (!selectedPath) return false;
      const finalPath = /\.(md|markdown)$/i.test(selectedPath) ? selectedPath : selectedPath + ".md";
      await Neutralino.filesystem.writeFile(finalPath, content);
      updateTabAfterSave(tab, content, {
        name: getFileName(finalPath),
        path: finalPath
      });
      if (isPathInsideFolder(finalPath, activeFolderPath)) {
        await reloadOpenFolderTree();
      }
      return true;
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const pickerOptions = {
        suggestedName,
        types: [
          {
            description: "Markdown files",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".md", ".markdown"]
            }
          }
        ]
      };
      if (activeFolderHandle) {
        pickerOptions.startIn = activeFolderHandle;
      }
      const handle = await window.showSaveFilePicker(pickerOptions);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      updateTabAfterSave(tab, content, {
        name: handle.name,
        handle
      });
      if (activeFolderHandle) {
        await reloadOpenFolderTree();
      }
      return true;
    }

    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    saveAs(blob, suggestedName);
    updateTabAfterSave(tab, content, {
      name: suggestedName
    });
    return true;
  }

  async function saveActiveTabWithSaveDialog() {
    const tab = getActiveMarkdownTab();
    return saveMarkdownTabWithSaveDialog(tab);
  }

  async function saveActiveTabToSource() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    return saveMarkdownTabToSource(tab);
  }

  function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(path || "");
  }
  const MAX_GITHUB_FILES_SHOWN = 30;
  const GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS = 800;
  let lastGitHubImportRequestAt = 0;
  const selectedGitHubImportPaths = new Set();
  let availableGitHubImportPaths = [];

  function getFileName(path) {
    return (path || "").split(/[\\/]/).pop() || "document.md";
  }

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
  function processEmojis(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      let parent = node.parentNode;
      let isInCode = false;
      while (parent && parent !== element) {
        if (parent.tagName === 'PRE' || parent.tagName === 'CODE') {
          isInCode = true;
          break;
        }
        parent = parent.parentNode;
      }
      
      if (!isInCode && node.nodeValue.includes(':')) {
        textNodes.push(node);
      }
    }
    
    textNodes.forEach(textNode => {
      const text = textNode.nodeValue;
      const emojiRegex = /:([\w+-]+):/g;
      
      let match;
      let lastIndex = 0;
      let result = '';
      let hasEmoji = false;
      
      while ((match = emojiRegex.exec(text)) !== null) {
        const shortcode = match[1];
        const emoji = joypixels.shortnameToUnicode(`:${shortcode}:`);
        
        if (emoji !== `:${shortcode}:`) { // If conversion was successful
          hasEmoji = true;
          result += text.substring(lastIndex, match.index) + emoji;
          lastIndex = emojiRegex.lastIndex;
        } else {
          result += text.substring(lastIndex, emojiRegex.lastIndex);
          lastIndex = emojiRegex.lastIndex;
        }
      }
      
      if (hasEmoji) {
        result += text.substring(lastIndex);
        const span = document.createElement('span');
        span.innerHTML = result;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
  }

  function debouncedRender() {
    clearTimeout(markdownRenderTimeout);
    markdownRenderTimeout = setTimeout(renderMarkdown, RENDER_DELAY);
  }

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
  
  initTabs();
  if (loadGlobalState().syncScrollingEnabled === false) toggleSyncScrolling();
  updateSyncToggleButtons();
  updateMobileStats();
  updateStatusLine();
  updateEditorLineNumbers();
  renderEditorSyntaxHighlights();

  // Initialize resizer - Story 1.3
  initResizer();

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
  markdownEditor.addEventListener("contextmenu", handleEditorContextMenu);
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
      const firstRelativePath = Array.from(files || []).find((file) => file.webkitRelativePath)?.webkitRelativePath || "";
      activeFolderName = firstRelativePath.split("/")[0] || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      const nodes = await buildTreeFromFileList(files || []);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      this.value = "";
    });
  }

  // Graph extraction helpers are registered near startup from js/graph/extraction.js.

  async function openGraphView() {
    if (!folderMarkdownFiles.length) {
      alert("Open a folder first to build the graph view.");
      return;
    }

    const folderName = activeFolderName || "Graph View";
    const graphScopeKey = getRootFolderGraphScopeKey();
    if (focusExistingFolderGraphTab(graphScopeKey, folderName)) return;

    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const graphTab = createGraphTab(folderName, { graphViewConfig: null, graphScopeKey });
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }


  function getGraphExportContent(graphSnapshot, folderName, graphViewConfig) {
    const graphTab = createGraphTab(folderName || graphSnapshot?.folderName || "Graph View", {
      graphSnapshot,
      graphViewConfig: graphViewConfig || null
    });
    const graphDocument = serializeGraphExportDocument(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  async function writeGraphExportWithSaveDialog(content, suggestedName, options = {}) {
    const includeMarkdownContents = options.includeMarkdownContents === true;
    const dialogTitle = includeMarkdownContents ? "Export Folder to Graph" : "Save Graph View";
    const fileTypeDescription = includeMarkdownContents
      ? "Create a portable graph archive that includes Markdown file contents."
      : "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included.";

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog(dialogTitle, {
        defaultPath,
        filters: [
          { name: fileTypeDescription, extensions: ["mdviewer-graph.json", "mdgraph.json", "json"] }
        ]
      });
      if (!selectedPath) return null;
      const finalPath = /\.(mdviewer-graph\.json|mdgraph\.json|json)$/i.test(selectedPath) ? selectedPath : `${selectedPath}.mdviewer-graph.json`;
      await Neutralino.filesystem.writeFile(finalPath, content);
      return { name: getFileName(finalPath), path: finalPath };
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: fileTypeDescription,
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { name: handle.name, handle };
    }

    saveAs(new Blob([content], { type: "application/json;charset=utf-8" }), suggestedName);
    return { name: suggestedName };
  }

  async function exportFolderFilesToGraph(folderFiles, folderName) {
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to export to a graph archive.");
      return false;
    }

    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName || "Graph View");
    const content = getGraphExportContent(graphSnapshot, folderName || graphSnapshot.folderName || "Graph View", null);
    const suggestedName = getSuggestedGraphFileName({ folderName: folderName || graphSnapshot.folderName || "Graph View" });
    return !!(await writeGraphExportWithSaveDialog(content, suggestedName, { includeMarkdownContents: true }));
  }

  async function exportActiveFolderToGraph() {
    if (!folderMarkdownFiles.length) {
      alert("Open a folder first to export it to a graph archive.");
      return false;
    }
    return exportFolderFilesToGraph(folderMarkdownFiles, activeFolderName || "Graph View");
  }


  function getActiveGraphSaveContent(graphTab) {
    const cachedRender = graphRenderCache.get(graphTab.id);
    if (cachedRender?.nodes) {
      captureGraphLayout(graphTab, cachedRender.nodes, cachedRender.getZoomTransform?.());
    }
    syncGraphTabDocument(graphTab);
    const graphDocument = serializeGraphViewDocument(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  function updateGraphTabAfterSave(tab, metadata) {
    if (!tab) return;
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getGraphTitleFromFileName(metadata.name) || metadata.name;
      }
      if (metadata.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata.path) tab.sourceFilePath = metadata.path;
    }
    syncGraphTabDocument(tab);
    clearGraphTabUnsavedChanges(tab);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  async function saveGraphTabToSource(graphTab) {
    if (!graphTab || (!graphTab.sourceFileHandle && !graphTab.sourceFilePath)) return false;

    try {
      const content = getActiveGraphSaveContent(graphTab);
      if (graphTab.sourceFileHandle && typeof graphTab.sourceFileHandle.createWritable === "function") {
        const writable = await graphTab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateGraphTabAfterSave(graphTab, { name: graphTab.sourceFileHandle.name || graphTab.sourceFileName });
      } else if (typeof NL_VERSION !== "undefined" && graphTab.sourceFilePath) {
        await Neutralino.filesystem.writeFile(graphTab.sourceFilePath, content);
        updateGraphTabAfterSave(graphTab, {
          name: getFileName(graphTab.sourceFilePath),
          path: graphTab.sourceFilePath
        });
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save graph to original location:", error);
      return false;
    }
  }

  async function saveActiveGraphToSource() {
    return saveGraphTabToSource(getActiveGraphTab());
  }

  async function saveGraphTabWithSaveDialog(graphTab) {
    if (!graphTab) {
      return false;
    }

    const content = getActiveGraphSaveContent(graphTab);
    const suggestedName = getSuggestedGraphFileName(graphTab);

    try {
      const metadata = await writeGraphExportWithSaveDialog(content, suggestedName);
      if (!metadata) return false;
      updateGraphTabAfterSave(graphTab, metadata);
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      console.error("Failed to export graph:", error);
      alert("Failed to export graph: " + error.message);
      return false;
    }
  }

  async function saveActiveGraphWithSaveDialog() {
    return saveGraphTabWithSaveDialog(getActiveGraphTab());
  }

  async function openSavedGraphDocument(source) {
    if (!source) return null;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a saved graph.');
      return null;
    }
    let content = source.content;
    let name = source.name || "Saved Graph";

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && source.path) {
        content = await Neutralino.filesystem.readFile(source.path);
        name = getFileName(source.path) || name;
      } else {
        let file = source.file || null;
        if (!file && source.handle) file = await source.handle.getFile();
        if (!file) throw new Error("No readable graph file was provided.");
        content = await file.text();
        name = file.name || name;
      }
    }

    let graphDocument;
    try {
      graphDocument = JSON.parse(content);
    } catch (error) {
      throw new Error("The selected graph file is not valid JSON.");
    }

    validateParsedGraphDocument(graphDocument);

    const normalizedSnapshot = normalizeGraphSnapshot(graphDocument.snapshot || graphDocument.graphSnapshot || null);
    const graphDocumentKind = getGraphDocumentKind(graphDocument, normalizedSnapshot);
    const graphDocumentForTab = graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT
      ? graphDocument
      : {
        ...graphDocument,
        documentType: GRAPH_DOCUMENT_TYPE_VIEW,
        snapshot: stripGraphSnapshotContent(normalizedSnapshot),
        graphSnapshot: undefined
      };
    const graphData = deserializeGraphDocument(graphDocumentForTab);
    const fallbackName = getGraphTitleFromFileName(name) || "Saved Graph";
    const graphTab = createGraphTab(graphData.folderName || fallbackName, { graphDocument: graphData.graphDocument });
    graphTab.keepSavedGraphMode = graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW;
    graphTab.sourceFileName = name;
    graphTab.title = fallbackName;
    if (source.handle) graphTab.sourceFileHandle = source.handle;
    if (source.path) graphTab.sourceFilePath = source.path;
    clearGraphTabUnsavedChanges(graphTab);
    tabs.push(graphTab);
    saveTabsToStorage(tabs);
    switchTab(graphTab.id);
    promptForStaleSavedGraphIfNeeded(graphTab, {
      force: graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW
    });
    return graphTab;
  }

  function setGraphFilterPanelCollapsed(collapsed) {
    if (!graphViewToolbar || !graphFilterPanelToggle) return;
    graphViewToolbar.classList.toggle("collapsed", collapsed);
    graphFilterPanelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    graphFilterPanelToggle.setAttribute("aria-label", collapsed ? "Expand graph filters" : "Collapse graph filters");
    graphFilterPanelToggle.setAttribute("title", collapsed ? "Expand filters" : "Collapse filters");
  }

  function setGraphViewMode(enabled) {
    const contentContainer = document.querySelector(".content-container");
    if (!contentContainer || !graphViewCanvas) return;
    const previewPane = document.querySelector(".preview-pane");
    const graphViewHeader = document.querySelector("#graph-view-modal .graph-view-header");
    const graphViewContent = document.querySelector("#graph-view-modal .graph-view-content");
    if (enabled) {
      contentContainer.classList.add("graph-view-active");
      if (previewPane) {
        if (graphViewToolbar && graphViewToolbar.parentElement !== previewPane) {
          previewPane.insertBefore(graphViewToolbar, previewPane.firstChild);
        }
        if (!graphViewCanvas.parentElement || !graphViewCanvas.closest(".preview-pane")) {
          previewPane.appendChild(graphViewCanvas);
        } else if (graphViewToolbar && graphViewCanvas.previousElementSibling !== graphViewToolbar) {
          previewPane.insertBefore(graphViewToolbar, graphViewCanvas);
        }
      }
      if (graphViewToolbar) graphViewToolbar.classList.add("graph-tab-toolbar");
      graphViewCanvas.classList.add("tab-graph-canvas");
    } else {
      contentContainer.classList.remove("graph-view-active");
      if (graphViewToolbar) {
        graphViewToolbar.classList.remove("graph-tab-toolbar");
        if (graphViewHeader && graphViewToolbar.parentElement !== graphViewHeader) {
          graphViewHeader.appendChild(graphViewToolbar);
        }
      }
      graphViewCanvas.classList.remove("tab-graph-canvas");
      if (graphViewContent && graphViewCanvas.parentElement !== graphViewContent) {
        graphViewContent.appendChild(graphViewCanvas);
      }
    }
  }

  function getGraphSnapshotTagNodeIds(graphSnapshot) {
    return (graphSnapshot?.nodes || [])
      .filter((node) => (node?.type || "file") === "tag")
      .map((node) => normalizeGraphTagNodeId(node.id || node.tag || node.label))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function getGraphFilterTagNodeIds(graphSnapshot) {
    const tagIds = new Set(getGraphSnapshotTagNodeIds(graphSnapshot));
    getAllKnownAndReferencedTags().forEach((tag) => {
      const tagId = normalizeGraphTagNodeId(tag);
      if (tagId) tagIds.add(tagId);
    });
    return Array.from(tagIds).sort((a, b) => a.localeCompare(b));
  }

  function getGraphTagLabelFromId(tagNodeId) {
    return `#${String(tagNodeId || "").replace(/^tag:/, "")}`;
  }

  function parseGraphGroupQuery(query) {
    const rawQuery = String(query || "").trim();
    const prefixMatch = rawQuery.match(/^([a-z]+)\s*:\s*(.*)$/i);
    const supportedPrefixes = new Set(["path", "file", "name", "tag", "link", "text", "line"]);
    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
    const type = supportedPrefixes.has(prefix) ? prefix : "";
    const value = (type ? prefixMatch[2] : rawQuery).trim();
    const terms = value
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    return {
      type,
      value,
      terms
    };
  }

  function graphQueryRequiresFileContent(query) {
    const parsedQuery = parseGraphGroupQuery(query);
    return parsedQuery.type === "text" || parsedQuery.type === "line";
  }

  function isLightweightSavedGraphView(tab, graphSnapshot) {
    return !!(isKeepSavedGraphMode(tab) && !graphSnapshotHasEmbeddedFileContent(graphSnapshot || tab?.graphSnapshot));
  }

  function showLightweightSavedGraphTextSearchUnavailable() {
    showGraphBanner(LIGHTWEIGHT_SAVED_GRAPH_TEXT_SEARCH_MESSAGE);
  }

  function getGraphSnapshotFileCachedContent(snapshotFile) {
    if (typeof snapshotFile?.content === "string") return snapshotFile.content;
    const folderEntry = findFolderMarkdownEntryForGraphFile(snapshotFile);
    return typeof folderEntry?.content === "string" ? folderEntry.content : "";
  }

  function getGraphFilterFileData(nodeData, snapshotFile, options = {}) {
    const status = nodeData?.status || snapshotFile?.status || "current";
    const canUseCurrentFolder = options.useCurrentFolderData && status !== "saved-only";
    const currentEntry = canUseCurrentFolder ? findFolderMarkdownEntryForGraphFile({
      ...(snapshotFile || {}),
      id: snapshotFile?.id || nodeData?.id,
      path: snapshotFile?.path || nodeData?.path || nodeData?.fullPath || nodeData?.id,
      fullPath: snapshotFile?.fullPath || nodeData?.fullPath || nodeData?.path || null,
      name: snapshotFile?.name || nodeData?.name || getFileName(nodeData?.path || nodeData?.fullPath || nodeData?.id || "")
    }) : null;
    const metadataSource = currentEntry || snapshotFile || nodeData || {};
    const path = metadataSource.path || nodeData?.path || nodeData?.fullPath || nodeData?.id || "";
    const name = metadataSource.name || nodeData?.name || getFileName(path || nodeData?.id || "");
    const fullPath = metadataSource.fullPath || nodeData?.fullPath || path;
    const rawContent = typeof currentEntry?.content === "string"
      ? currentEntry.content
      : (typeof snapshotFile?.content === "string" ? snapshotFile.content : "");
    const content = options.allowContentSearch ? rawContent : "";
    const sourceTags = Array.isArray(metadataSource.tags) ? metadataSource.tags : [];
    const tags = sourceTags.length ? sourceTags : (content ? getFileTagsFromContent(content) : []);

    return {
      id: metadataSource.id || nodeData?.id || "",
      path,
      name,
      fullPath,
      content,
      tags,
      linkText: String(options.linkText || "")
    };
  }

  function graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, options = {}) {
    if ((nodeData?.type || "file") !== "file") return false;
    if (!snapshotFile || !parsedQuery || !parsedQuery.terms?.length) return false;

    const fileData = getGraphFilterFileData(nodeData, snapshotFile, options);
    const path = String(fileData.path || "").toLowerCase();
    const name = String(fileData.name || "").toLowerCase();
    const fullPath = String(fileData.fullPath || "").toLowerCase();
    const content = String(fileData.content || "").toLowerCase();
    const tagText = (Array.isArray(fileData.tags) ? fileData.tags : [])
      .map((tag) => String(tag || "").toLowerCase())
      .filter(Boolean)
      .join(" ");
    const linkText = String(fileData.linkText || "").toLowerCase();
    const terms = parsedQuery.terms;
    const allTermsMatchText = (text) => terms.every((term) => text.includes(term));

    switch (parsedQuery.type) {
      case "path":
        return allTermsMatchText([path, fullPath].filter(Boolean).join(" "));
      case "file":
        return allTermsMatchText([name, path, fullPath].filter(Boolean).join(" "));
      case "name":
        return allTermsMatchText(name);
      case "tag":
        return allTermsMatchText(tagText);
      case "link":
        return allTermsMatchText(linkText);
      case "text":
        return options.allowContentSearch && allTermsMatchText(content);
      case "line":
        return options.allowContentSearch && content
          .split(/\r?\n/)
          .some((line) => terms.every((term) => line.includes(term)));
      default:
        return allTermsMatchText([path, name, fullPath, tagText, linkText, options.allowContentSearch ? content : ""].filter(Boolean).join(" "));
    }
  }

  function getGraphGroupMatch(nodeData, snapshotFile, graphViewConfig, options = {}) {
    const groups = Array.isArray(graphViewConfig?.groups) ? graphViewConfig.groups : [];
    for (const group of groups) {
      if (!group || group.enabled === false) continue;
      const parsedQuery = parseGraphGroupQuery(group.query);
      if (graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, options)) return group;
    }
    return null;
  }

  function updateGraphGroup(groupId, patch, options = {}) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    const groups = graphViewConfig.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
    updateActiveGraphViewConfig({ groups }, options);
  }

  function deleteGraphGroup(groupId) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    updateActiveGraphViewConfig({ groups: graphViewConfig.groups.filter((group) => group.id !== groupId) });
  }

  const GRAPH_GROUP_QUERY_PREFIX_HELP = [
    { prefix: "path", label: "path:", description: "Match folders, path segments, or full paths." },
    { prefix: "file", label: "file:", description: "Match Markdown file names." },
    { prefix: "tag", label: "tag:", description: "Match normalized frontmatter tags." },
    { prefix: "link", label: "link:", description: "Match linked file paths and names." },
    { prefix: "text", label: "text:", description: "Match file contents." },
    { prefix: "line", label: "line:", description: "Match individual Markdown lines." }
  ];
  let activeGraphGroupSuggestionClose = null;

  function getGraphGroupQueryContext(input) {
    const value = String(input?.value || "");
    const cursor = typeof input?.selectionStart === "number" ? input.selectionStart : value.length;
    const beforeCursor = value.slice(0, cursor);
    const prefixMatch = beforeCursor.match(/(^|\s)(path|file|tag|link|text|line):([^\s]*)$/i);
    if (!prefixMatch) {
      return { prefix: "", query: "", replaceStart: cursor, replaceEnd: cursor };
    }

    return {
      prefix: prefixMatch[2].toLowerCase(),
      query: prefixMatch[3] || "",
      replaceStart: cursor - (prefixMatch[3] || "").length,
      replaceEnd: cursor
    };
  }

  function isGraphGroupAbsolutePathSuggestion(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/");
    return /^([a-z]:\/|\/|~\/|\/\/)/i.test(normalizedPath);
  }

  function getGraphGroupRelativeFilePath(snapshotFile) {
    const relativePath = String(snapshotFile?.path || snapshotFile?.file?.webkitRelativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (relativePath && !isGraphGroupAbsolutePathSuggestion(relativePath)) return relativePath;

    const fullPath = String(snapshotFile?.fullPath || "").replace(/\\/g, "/");
    if (fullPath && activeFolderPath) {
      const relativeFullPath = getPathRelativeToFolder(fullPath, activeFolderPath);
      if (relativeFullPath) return relativeFullPath.replace(/\\/g, "/").replace(/^\/+/, "");
    }

    return "";
  }

  function addGraphGroupPathFolderSuggestions(snapshotFile, addEntry) {
    const relativePath = getGraphGroupRelativeFilePath(snapshotFile);
    if (!relativePath) return;

    const segments = relativePath.split("/").filter(Boolean);
    segments.pop();
    let folderPath = "";
    segments.forEach((segment) => {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      addEntry(folderPath, "path", "Folder");
    });
  }

  function getGraphGroupSuggestionEntries(graphSnapshot, prefix, query, options = {}) {
    const normalizedQuery = String(query || "").toLowerCase();
    const entryMap = new Map();
    const addEntry = (value, type, detail) => {
      const normalizedValue = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      if (!normalizedValue || isGraphGroupAbsolutePathSuggestion(normalizedValue)) return;
      if (normalizedQuery && !normalizedValue.toLowerCase().includes(normalizedQuery)) return;
      const key = `${type}:${normalizedValue.toLowerCase()}`;
      if (!entryMap.has(key)) entryMap.set(key, { value: normalizedValue, type, detail: detail || "" });
    };

    if (prefix === "path") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        addGraphGroupPathFolderSuggestions(snapshotFile, addEntry);
      });
    } else if (prefix === "file") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        const path = String(snapshotFile.fullPath || snapshotFile.path || "");
        addEntry(snapshotFile.name || getFileName(path), "file", path || "File name");
      });
    } else if (prefix === "tag") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        normalizeFileTagList(snapshotFile.tags || []).forEach((tag) => addEntry(tag, "tag", "File tag"));
        if (!options.savedMetadataOnly) extractMarkdownTags(getGraphSnapshotFileCachedContent(snapshotFile)).forEach((tag) => addEntry(tag, "tag", "Markdown tag"));
      });
      (graphSnapshot?.nodes || []).forEach((node) => {
        if ((node?.type || "file") !== "tag") return;
        const tag = normalizeTagName(node.tag || node.label || String(node.id || "").replace(/^tag:/, ""));
        addEntry(tag, "tag", "Tag node");
      });
      if (!options.savedMetadataOnly) getAllKnownAndReferencedTags().forEach((tag) => addEntry(tag, "tag", "Known tag"));
    } else if (prefix === "link") {
      const filesById = new Map((graphSnapshot?.files || []).map((file) => [file.id, file]));
      (graphSnapshot?.links || []).forEach((link) => {
        if ((link?.type || "link") === "tag") return;
        const sourceId = getGraphLinkEndpointKey(link.source);
        const targetId = getGraphLinkEndpointKey(link.target);
        [sourceId, targetId].forEach((nodeId) => {
          const file = filesById.get(nodeId);
          if (!file) return;
          addEntry(file.path || file.fullPath || file.name || nodeId, "link", "Linked file");
          addEntry(file.name || getFileName(file.path || file.fullPath || nodeId), "link", "Linked file name");
        });
      });
    }

    return Array.from(entryMap.values())
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: "base" }));
  }

  function attachGraphGroupQuerySuggestions(row, queryInput, group, sourceTab) {
    const popover = document.createElement("div");
    popover.className = "graph-group-query-suggestions hidden";
    popover.setAttribute("role", "listbox");
    popover.setAttribute("aria-label", "Graph group query suggestions");
    row.appendChild(popover);

    let selectedIndex = 0;
    let isPointerSelectingSuggestion = false;

    const closePopover = () => {
      popover.classList.add("hidden");
      popover.innerHTML = "";
      queryInput.removeAttribute("aria-activedescendant");
      if (activeGraphGroupSuggestionClose === closePopover) activeGraphGroupSuggestionClose = null;
      document.removeEventListener("mousedown", handleOutsideMouseDown, true);
    };

    function handleOutsideMouseDown(event) {
      if (row.contains(event.target)) return;
      closePopover();
    }

    const insertSuggestion = (suggestion) => {
      if (!suggestion) return;
      const context = getGraphGroupQueryContext(queryInput);
      const replacement = context.prefix ? suggestion.value : `${suggestion.prefix}:`;
      const value = String(queryInput.value || "");
      const nextValue = `${value.slice(0, context.replaceStart)}${replacement}${value.slice(context.replaceEnd)}`;
      const cursor = context.replaceStart + replacement.length;
      const activeGraphTab = getActiveGraphTab();
      if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(nextValue)) {
        closePopover();
        showLightweightSavedGraphTextSearchUnavailable();
        return;
      }
      queryInput.value = nextValue;
      queryInput.focus();
      queryInput.setSelectionRange(cursor, cursor);
      closePopover();
      updateGraphGroup(group.id, { query: nextValue }, { skipToolbar: true });
    };

    const scrollSelectedSuggestionIntoView = () => {
      const selectedOption = popover.querySelector(".graph-group-query-suggestion.active");
      if (!selectedOption) return;
      selectedOption.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const renderPopover = () => {
      if (queryInput.disabled) return;
      const context = getGraphGroupQueryContext(queryInput);
      const activeGraphTab = getActiveGraphTab();
      const graphSnapshot = activeGraphTab?.graphSnapshot || sourceTab?.graphSnapshot || null;
      let suggestions = [];

      if (context.prefix) {
        suggestions = getGraphGroupSuggestionEntries(graphSnapshot, context.prefix, context.query, { savedMetadataOnly: isKeepSavedGraphMode(activeGraphTab) });
      } else {
        suggestions = GRAPH_GROUP_QUERY_PREFIX_HELP.map((item) => ({ ...item, value: item.label }));
      }

      popover.innerHTML = "";
      selectedIndex = Math.min(selectedIndex, Math.max(suggestions.length - 1, 0));

      if (!suggestions.length) {
        const empty = document.createElement("div");
        empty.className = "graph-group-query-suggestion-empty";
        empty.textContent = `No ${context.prefix}: suggestions.`;
        popover.appendChild(empty);
      } else {
        suggestions.forEach((suggestion, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.id = `graph-group-query-suggestion-${group.id}-${index}`;
          button.className = `graph-group-query-suggestion${index === selectedIndex ? " active" : ""}`;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
          button.dataset.index = String(index);
          const title = document.createElement("span");
          title.className = "graph-group-query-suggestion-title";
          title.textContent = context.prefix ? suggestion.value : suggestion.label;
          const detail = document.createElement("span");
          detail.className = "graph-group-query-suggestion-detail";
          detail.textContent = context.prefix ? suggestion.detail : suggestion.description;
          button.append(title, detail);
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            isPointerSelectingSuggestion = true;
          });
          button.addEventListener("mouseenter", () => {
            selectedIndex = index;
            renderPopover();
          });
          button.addEventListener("click", () => {
            isPointerSelectingSuggestion = false;
            insertSuggestion(suggestion);
          });
          popover.appendChild(button);
        });
        queryInput.setAttribute("aria-activedescendant", `graph-group-query-suggestion-${group.id}-${selectedIndex}`);
      }

      if (activeGraphGroupSuggestionClose && activeGraphGroupSuggestionClose !== closePopover) activeGraphGroupSuggestionClose();
      activeGraphGroupSuggestionClose = closePopover;
      popover.classList.remove("hidden");
      scrollSelectedSuggestionIntoView();
      document.addEventListener("mousedown", handleOutsideMouseDown, true);
    };

    queryInput.addEventListener("focus", renderPopover);
    queryInput.addEventListener("click", renderPopover);
    queryInput.addEventListener("keyup", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
      renderPopover();
    });
    queryInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!isPointerSelectingSuggestion) closePopover();
        isPointerSelectingSuggestion = false;
      }, 120);
    });
    queryInput.addEventListener("keydown", (event) => {
      if (popover.classList.contains("hidden")) {
        if (event.key !== "Escape") renderPopover();
        return;
      }

      const options = Array.from(popover.querySelectorAll(".graph-group-query-suggestion"));
      if (event.key === "Escape") {
        event.preventDefault();
        closePopover();
      } else if (event.key === "ArrowDown" && options.length) {
        event.preventDefault();
        selectedIndex = (selectedIndex + 1) % options.length;
        renderPopover();
      } else if (event.key === "ArrowUp" && options.length) {
        event.preventDefault();
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        renderPopover();
      } else if (event.key === "Enter" && options.length) {
        event.preventDefault();
        const context = getGraphGroupQueryContext(queryInput);
        const activeGraphTab = getActiveGraphTab();
        const graphSnapshot = activeGraphTab?.graphSnapshot || sourceTab?.graphSnapshot || null;
        const suggestions = context.prefix
          ? getGraphGroupSuggestionEntries(graphSnapshot, context.prefix, context.query, { savedMetadataOnly: isKeepSavedGraphMode(activeGraphTab) })
          : GRAPH_GROUP_QUERY_PREFIX_HELP.map((item) => ({ ...item, value: item.label }));
        insertSuggestion(suggestions[selectedIndex]);
      }
    });
  }

  function renderGraphGroupsToolbar(tab) {
    if (!graphGroupsList) return;
    const graphViewConfig = normalizeGraphViewConfig(tab?.graphViewConfig);
    const isGraphTab = !!(tab && tab.type === "graph");
    graphGroupsList.innerHTML = "";

    if (!graphViewConfig.groups.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "graph-groups-empty";
      emptyMessage.textContent = "No groups yet.";
      graphGroupsList.appendChild(emptyMessage);
    }

    graphViewConfig.groups.forEach((group, index) => {
      const row = document.createElement("div");
      row.className = "graph-group-row";

      const enabledLabel = document.createElement("label");
      enabledLabel.className = "graph-group-enabled graph-toggle-row";
      enabledLabel.title = "Enable or disable this graph group";

      const enabledText = document.createElement("span");
      enabledText.textContent = `Group ${index + 1}`;
      const enabledInput = document.createElement("input");
      enabledInput.className = "graph-switch-input";
      enabledInput.type = "checkbox";
      enabledInput.checked = group.enabled !== false;
      enabledInput.disabled = !isGraphTab;
      enabledInput.setAttribute("aria-label", `Enable graph group ${index + 1}`);
      enabledInput.addEventListener("change", () => updateGraphGroup(group.id, { enabled: enabledInput.checked }));
      const enabledSwitch = document.createElement("span");
      enabledSwitch.className = "graph-switch";
      enabledSwitch.setAttribute("aria-hidden", "true");
      enabledLabel.append(enabledText, enabledInput, enabledSwitch);

      const queryInput = document.createElement("input");
      queryInput.className = "graph-group-query-input";
      queryInput.type = "text";
      queryInput.placeholder = "tag:project or path:docs";
      queryInput.value = group.query || "";
      queryInput.disabled = !isGraphTab;
      queryInput.autocomplete = "off";
      queryInput.setAttribute("aria-label", `Graph group ${index + 1} query`);
      queryInput.setAttribute("aria-haspopup", "listbox");
      let queryUpdateTimeout = null;
      const updateGroupQuery = () => {
        window.clearTimeout(queryUpdateTimeout);
        queryUpdateTimeout = null;
        const activeGraphTab = getActiveGraphTab();
        if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(queryInput.value)) {
          queryInput.value = group.query || "";
          showLightweightSavedGraphTextSearchUnavailable();
          return;
        }
        updateGraphGroup(group.id, { query: queryInput.value }, { skipToolbar: true });
      };
      queryInput.addEventListener("input", () => {
        window.clearTimeout(queryUpdateTimeout);
        queryUpdateTimeout = window.setTimeout(updateGroupQuery, GRAPH_GROUP_QUERY_UPDATE_DELAY);
      });
      queryInput.addEventListener("change", updateGroupQuery);
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !queryInput.getAttribute("aria-activedescendant")) {
          event.preventDefault();
          queryInput.blur();
        }
      });

      const colorInput = document.createElement("input");
      colorInput.className = "graph-group-color-input";
      colorInput.type = "color";
      colorInput.value = getGraphColorInputValue(group.color);
      colorInput.disabled = !isGraphTab;
      colorInput.setAttribute("aria-label", `Graph group ${index + 1} color`);
      colorInput.addEventListener("change", () => updateGraphGroup(group.id, { color: colorInput.value }));

      const deleteButton = document.createElement("button");
      deleteButton.className = "tool-button graph-group-delete-button";
      deleteButton.type = "button";
      deleteButton.title = "Delete graph group";
      deleteButton.disabled = !isGraphTab;
      deleteButton.setAttribute("aria-label", `Delete graph group ${index + 1}`);
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", () => deleteGraphGroup(group.id));

      row.append(enabledLabel, queryInput, colorInput, deleteButton);
      attachGraphGroupQuerySuggestions(row, queryInput, group, tab);
      graphGroupsList.appendChild(row);
    });

    if (graphAddGroupButton) graphAddGroupButton.disabled = !isGraphTab;
  }

  function updateGraphTagToolbar(tab, graphSnapshot) {
    const graphViewConfig = normalizeGraphViewConfig(tab?.graphViewConfig);
    const isGraphTab = !!(tab && tab.type === "graph");
    updateSavedGraphModePill(tab);
    renderGraphGroupsToolbar(tab);
    if (graphShowTagsButton) {
      graphShowTagsButton.disabled = !isGraphTab;
      graphShowTagsButton.classList.toggle("active", isGraphTab && graphViewConfig.showTags);
      graphShowTagsButton.setAttribute("aria-pressed", isGraphTab && graphViewConfig.showTags ? "true" : "false");
    }
    if (graphHideTagsButton) {
      graphHideTagsButton.disabled = !isGraphTab;
      graphHideTagsButton.classList.toggle("active", isGraphTab && !graphViewConfig.showTags);
      graphHideTagsButton.setAttribute("aria-pressed", isGraphTab && !graphViewConfig.showTags ? "true" : "false");
    }
    if (graphFileSearchFilter) {
      graphFileSearchFilter.disabled = !isGraphTab;
      if (document.activeElement !== graphFileSearchFilter) {
        graphFileSearchFilter.value = graphViewConfig.searchQuery || "";
      }
    }
    if (graphSelectedTagFilter) {
      const selectedTagId = graphViewConfig.selectedTagIds[0] || "";
      const tagIds = isKeepSavedGraphMode(tab) ? getGraphSnapshotTagNodeIds(graphSnapshot) : getGraphFilterTagNodeIds(graphSnapshot);
      graphSelectedTagFilter.innerHTML = '<option value="">All files</option>';
      tagIds.forEach((tagId) => {
        const option = document.createElement("option");
        option.value = tagId;
        option.textContent = getGraphTagLabelFromId(tagId);
        graphSelectedTagFilter.appendChild(option);
      });
      graphSelectedTagFilter.value = tagIds.includes(selectedTagId) ? selectedTagId : "";
      graphSelectedTagFilter.disabled = !isGraphTab || !tagIds.length;
    }
    if (graphOnlySelectedTagButton) {
      graphOnlySelectedTagButton.disabled = !isGraphTab;
      graphOnlySelectedTagButton.classList.toggle("active", isGraphTab && graphViewConfig.selectedTagIds.length > 0);
      graphOnlySelectedTagButton.setAttribute("aria-pressed", isGraphTab && graphViewConfig.selectedTagIds.length > 0 ? "true" : "false");
    }
    const graphControlInputs = [
      graphDisplayArrows,
      graphTextFadeThreshold,
      graphNodeSize,
      graphLinkThickness,
      graphCenterForce,
      graphRepelForce,
      graphLinkForce,
      graphLinkDistance
    ].filter(Boolean);
    graphControlInputs.forEach((input) => { input.disabled = !isGraphTab; });
    if (graphDisplayArrows) graphDisplayArrows.checked = graphViewConfig.showArrows;
    if (graphTextFadeThreshold) graphTextFadeThreshold.value = graphViewConfig.textFadeThreshold;
    if (graphNodeSize) graphNodeSize.value = graphViewConfig.nodeSize;
    if (graphLinkThickness) graphLinkThickness.value = graphViewConfig.linkThickness;
    if (graphCenterForce) graphCenterForce.value = graphViewConfig.centerForce;
    if (graphRepelForce) graphRepelForce.value = graphViewConfig.repelForce;
    if (graphLinkForce) graphLinkForce.value = graphViewConfig.linkForce;
    if (graphLinkDistance) graphLinkDistance.value = graphViewConfig.linkDistance;
    if (graphResetDefaultsButton) graphResetDefaultsButton.disabled = !isGraphTab;
  }

  function resetActiveGraphViewToDefaults() {
    const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
    updateActiveGraphViewConfig({
      showTags: DEFAULT_GRAPH_VIEW_CONFIG.showTags,
      selectedTagIds: [],
      searchQuery: DEFAULT_GRAPH_VIEW_CONFIG.searchQuery,
      groups: currentConfig.groups.map((group) => ({ ...group, enabled: false })),
      showArrows: DEFAULT_GRAPH_VIEW_CONFIG.showArrows,
      textFadeThreshold: DEFAULT_GRAPH_VIEW_CONFIG.textFadeThreshold,
      nodeSize: DEFAULT_GRAPH_VIEW_CONFIG.nodeSize,
      linkThickness: DEFAULT_GRAPH_VIEW_CONFIG.linkThickness,
      centerForce: DEFAULT_GRAPH_VIEW_CONFIG.centerForce,
      repelForce: DEFAULT_GRAPH_VIEW_CONFIG.repelForce,
      linkForce: DEFAULT_GRAPH_VIEW_CONFIG.linkForce,
      linkDistance: DEFAULT_GRAPH_VIEW_CONFIG.linkDistance
    });
  }

  function updateActiveGraphViewConfig(patch, options = {}) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    activeGraphTab.graphViewConfig = normalizeGraphViewConfig({
      ...(activeGraphTab.graphViewConfig || {}),
      ...patch
    });
    if (activeGraphTab.graphDocument && typeof activeGraphTab.graphDocument === "object") {
      activeGraphTab.graphDocument.viewConfig = activeGraphTab.graphViewConfig;
      activeGraphTab.graphDocument.updatedAt = Date.now();
    }
    removeGraphRenderForTab(activeGraphTab.id);
    if (!options.skipToolbar) updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
    markGraphTabAsChanged(activeGraphTab);
    saveTabsToStorage(tabs);
    renderGraphView({ skipToolbar: options.skipToolbar });
  }

  function animateActiveGraphView() {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const cachedRender = graphRenderCache.get(activeGraphTab.id);
    if (cachedRender?.simulation) {
      graphSettings.magneticEnabled = true;
      if (activeGraphTab.graphLayout) activeGraphTab.graphLayout.magneticEnabled = true;
      if (typeof cachedRender.animate === "function") cachedRender.animate();
      else cachedRender.simulation.alpha(0.9).restart();
      saveGlobalState({ graphMagneticEnabled: graphSettings.magneticEnabled });
      saveTabsToStorage(tabs);
    } else {
      renderGraphView();
    }
  }

  const graphRenderer = window.registerMarkdownViewerGraphRenderer(app, {
    get graphRenderRequestId() { return graphRenderRequestId; },
    set graphRenderRequestId(value) { graphRenderRequestId = value; },
    get activeTabId() { return activeTabId; },
    get tabs() { return tabs; },
    get folderMarkdownFiles() { return folderMarkdownFiles; },
    get activeFolderName() { return activeFolderName; },
    get activeFolderPath() { return activeFolderPath; },
    get graphViewCanvas() { return graphViewCanvas; },
    get graphRenderCache() { return graphRenderCache; },
    get graphSettings() { return graphSettings; },
    get Neutralino() { return typeof Neutralino !== "undefined" ? Neutralino : undefined; },
    get NL_VERSION() { return typeof NL_VERSION !== "undefined" ? NL_VERSION : undefined; },
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
    parseGraphGroupQuery,
    graphFileMatchesGroupQuery,
    normalizeGraphTagNodeIds,
    getGraphGroupMatch,
    applySavedGraphLayout,
    getSavedGraphZoomTransform,
    captureGraphLayout,
    scheduleGraphLayoutStorageSave,
    markGraphTabAsChanged,
    saveGlobalState,
    getGraphDisplayLabel,
    getGraphContextMenuTitle,
    getFolderMarkdownEntryForTab,
    getFileTagsFromContent,
    normalizeTagName,
    addTagToContent,
    removeTagFromContent,
    renderMarkdown,
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
    copyToClipboard,
    deleteTag
  });
  const renderGraphView = graphRenderer.renderGraphView;
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

  desktopOpenGraphButtons.forEach((button) => button.addEventListener("click", openGraphView));
  if (mobileOpenGraphView) mobileOpenGraphView.addEventListener("click", openGraphView);
  if (graphShowTagsButton) graphShowTagsButton.addEventListener("click", () => updateActiveGraphViewConfig({ showTags: true }));
  if (graphHideTagsButton) graphHideTagsButton.addEventListener("click", () => updateActiveGraphViewConfig({ showTags: false }));
  if (graphFileSearchFilter) {
    graphFileSearchFilter.addEventListener("input", () => {
      const activeGraphTab = getActiveGraphTab();
      if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(graphFileSearchFilter.value)) {
        graphFileSearchFilter.value = activeGraphTab?.graphViewConfig?.searchQuery || "";
        showLightweightSavedGraphTextSearchUnavailable();
        return;
      }
      updateActiveGraphViewConfig({ searchQuery: graphFileSearchFilter.value });
    });
  }
  if (graphSelectedTagFilter) {
    graphSelectedTagFilter.addEventListener("change", () => {
      const selectedTagId = normalizeGraphTagNodeId(graphSelectedTagFilter.value);
      updateActiveGraphViewConfig({ selectedTagIds: selectedTagId ? [selectedTagId] : [] });
    });
  }
  if (graphFilterPanelToggle) {
    graphFilterPanelToggle.addEventListener("click", () => {
      setGraphFilterPanelCollapsed(!graphViewToolbar?.classList.contains("collapsed"));
    });
  }
  if (graphOnlySelectedTagButton) {
    graphOnlySelectedTagButton.addEventListener("click", () => {
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      if (currentConfig.selectedTagIds.length) {
        updateActiveGraphViewConfig({ selectedTagIds: [] });
        return;
      }
      const selectedTagId = normalizeGraphTagNodeId(graphSelectedTagFilter?.value);
      if (!selectedTagId) {
        alert("Choose a tag before filtering the graph to selected-tag files.");
        return;
      }
      updateActiveGraphViewConfig({ selectedTagIds: [selectedTagId], showTags: true });
    });
  }
  if (graphAddGroupButton) {
    graphAddGroupButton.addEventListener("click", () => {
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      const nextIndex = currentConfig.groups.length + 1;
      const nextDefaultColor = getNextDefaultGraphGroupColor(currentConfig.groups);
      const group = normalizeGraphGroups([{
        id: createGraphGroupId(`group:${Date.now()}:${nextIndex}`),
        query: "",
        color: nextDefaultColor,
        enabled: true
      }])[0];
      updateActiveGraphViewConfig({ groups: [...currentConfig.groups, group] });
    });
  }
  if (graphDisplayArrows) graphDisplayArrows.addEventListener("change", () => updateActiveGraphViewConfig({ showArrows: graphDisplayArrows.checked }));
  const bindGraphRangeControl = (input, configKey) => {
    if (!input) return;
    input.addEventListener("input", () => updateActiveGraphViewConfig({ [configKey]: Number(input.value) }));
  };
  bindGraphRangeControl(graphTextFadeThreshold, "textFadeThreshold");
  bindGraphRangeControl(graphNodeSize, "nodeSize");
  bindGraphRangeControl(graphLinkThickness, "linkThickness");
  bindGraphRangeControl(graphCenterForce, "centerForce");
  bindGraphRangeControl(graphRepelForce, "repelForce");
  bindGraphRangeControl(graphLinkForce, "linkForce");
  bindGraphRangeControl(graphLinkDistance, "linkDistance");
  if (graphResetDefaultsButton) graphResetDefaultsButton.addEventListener("click", resetActiveGraphViewToDefaults);
  graphStaleCloseButton?.addEventListener("click", keepSavedGraphFromStaleModal);
  graphStaleKeepButton?.addEventListener("click", keepSavedGraphFromStaleModal);
  graphStaleUpdateButton?.addEventListener("click", updateGraphFromStaleModal);
  graphStaleViewDetailsButton?.addEventListener("click", () => {
    openGraphComparisonDetailsModal(activeGraphStaleComparison?.detailsModel || activeGraphComparisonDetailsModel);
  });
  graphStaleCompareButton?.addEventListener("click", loadGraphComparisonFromStaleModal);
  graphStaleModal?.addEventListener("click", (event) => {
    if (event.target === graphStaleModal) hideGraphStaleModal();
  });
  graphComparisonDetailsCloseButton?.addEventListener("click", closeGraphComparisonDetailsModal);
  graphComparisonDetailsDoneButton?.addEventListener("click", closeGraphComparisonDetailsModal);
  graphComparisonDetailsModal?.addEventListener("click", (event) => {
    if (event.target === graphComparisonDetailsModal) closeGraphComparisonDetailsModal();
  });

  function initializeGraphFilterTooltips() {
    if (!graphViewToolbar) return;
    const tooltipTextBySelector = [
      ["#graph-file-search-filter", "Filter graph points by file name, path, tag, or text without changing the files on disk."],
      ["#graph-show-tags", "Show tag points and the connections between tags and files."],
      ["#graph-hide-tags", "Hide tag points so only file points and Markdown links are drawn."],
      ["#graph-selected-tag-filter", "Choose a tag to focus the graph on files that contain that tag."],
      ["#graph-only-selected-tag", "Limit the graph to files with the selected tag and their connected tag points."],
      ["#graph-add-group", "Add a color group. Groups use queries like path:, file:, tag:, text:, and line: to color matching files."],
      ["#graph-display-arrows", "Toggle arrowheads on Markdown links to show link direction."],
      ["#graph-text-fade-threshold", "Control how aggressively labels disappear while zooming out. At the default, labels are gone near 45% zoom and only larger points keep faded labels around 65%."],
      ["#graph-node-size", "Scale every graph point. Larger points are easier to hit and keep labels visible slightly longer while zoomed out."],
      ["#graph-link-thickness", "Adjust the stroke width of Markdown links between file points."],
      ["#graph-center-force", "Pull points toward the middle of the graph. Higher values make the layout cluster closer to center."],
      ["#graph-repel-force", "Push points away from each other. Higher values spread the graph out more."],
      ["#graph-link-force", "Control how strongly linked points pull toward their target link distance."],
      ["#graph-link-distance", "Set the preferred distance between connected points."],
      ["#graph-reset-defaults", "Reset search, selected tag, group toggles, display options, and force settings to defaults."],
      ["#graph-view-close", "Close graph view and return to the document view."],
      [".graph-collapsible-summary", "Expand or collapse this section of graph filters."],
      [".graph-group-query-input", "Type a group query. Use prefixes such as path:, file:, tag:, text:, or line:."],
      [".graph-group-enabled-input", "Enable or disable this group color without deleting it."],
      [".graph-group-color-input", "Pick the color used for files that match this group query."],
      [".graph-group-delete-button", "Delete this color group from the graph filter settings."]
    ];

    tooltipTextBySelector.forEach(([selector, text]) => {
      graphViewToolbar.querySelectorAll(selector).forEach((element) => {
        const target = element.closest("label, button, summary, p, div") || element;
        if (!target.dataset.graphTooltip) target.dataset.graphTooltip = text;
      });
    });

    const tooltip = document.createElement("div");
    tooltip.className = "graph-filter-tooltip hidden";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);

    let tooltipTimer = null;
    let tooltipTarget = null;

    const hideTooltip = () => {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
      tooltipTarget = null;
      tooltip.classList.add("hidden");
    };

    const positionTooltip = (target) => {
      const rect = target.getBoundingClientRect();
      tooltip.style.left = `${Math.min(window.innerWidth - tooltip.offsetWidth - 12, Math.max(12, rect.left))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - tooltip.offsetHeight - 12, rect.bottom + 8)}px`;
    };

    const getTooltipTarget = (source) => {
      const directTarget = source?.closest?.("[data-graph-tooltip]");
      if (directTarget && graphViewToolbar.contains(directTarget)) return directTarget;
      const controlTarget = source?.closest?.("label, button, summary, input, select, p, div");
      if (!controlTarget || !graphViewToolbar.contains(controlTarget)) return null;
      const matchedTooltip = tooltipTextBySelector.find(([selector]) => {
        if (controlTarget.matches(selector)) return true;
        return !!controlTarget.querySelector?.(selector);
      });
      if (!matchedTooltip) return null;
      controlTarget.dataset.graphTooltip = matchedTooltip[1];
      return controlTarget;
    };

    const scheduleTooltip = (target) => {
      const tooltipText = target?.dataset?.graphTooltip;
      if (!tooltipText) return;
      hideTooltip();
      tooltipTarget = target;
      tooltipTimer = window.setTimeout(() => {
        if (tooltipTarget !== target) return;
        tooltip.textContent = tooltipText;
        tooltip.classList.remove("hidden");
        positionTooltip(target);
      }, 3000);
    };

    graphViewToolbar.addEventListener("mouseover", (event) => {
      const target = getTooltipTarget(event.target);
      if (target) scheduleTooltip(target);
    });
    graphViewToolbar.addEventListener("focusin", (event) => {
      const target = getTooltipTarget(event.target);
      if (target) scheduleTooltip(target);
    });
    graphViewToolbar.addEventListener("mouseout", (event) => {
      if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip();
    });
    graphViewToolbar.addEventListener("focusout", hideTooltip);
    graphViewToolbar.addEventListener("input", hideTooltip);
    graphViewToolbar.addEventListener("click", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
  }

  initializeGraphFilterTooltips();

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
    renderMarkdown,
    saveCurrentTabState,
    shareButton
  });

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

  async function handleDrop(e) {
    const dt = e.dataTransfer;

    try {
      // Folder drops can expose their contained files through dataTransfer.files,
      // so check for a dropped directory before falling back to a single document file.
      // Cache File System Access handles because some browsers do not reliably
      // return the same dropped file handle after a previous directory check.
      const fileSystemHandles = await getFileSystemHandlesFromDrop(dt);
      if (await openDroppedFolder(dt, fileSystemHandles)) {
        return;
      }
      if (await openDroppedDocumentFile(dt, fileSystemHandles)) {
        return;
      }
    } catch (error) {
      console.error("Failed to open dropped item:", error);
      alert("Unable to open the dropped file or folder.");
      return;
    }

    const files = dt.files;
    if (files.length) {
      alert("Please open a text-based file (for example .md, .txt, .java, .css, or .json), a saved graph file (.mdviewer-graph.json or .mdgraph.json), or a folder that contains text files.");
    }
  }

  window.registerMarkdownViewerKeyboardShortcuts(app, {
    closeGraphComparisonDetailsModal,
    closeMermaidModal,
    closeTab,
    copyMarkdownButton,
    getActiveTabId: function() { return activeTabId; },
    getCurrentViewMode: function() { return currentViewMode; },
    hideGraphStaleModal,
    markdownEditor,
    newTab,
    saveCurrentFileIfChanged,
    toggleSyncScrolling
  });

  document.getElementById('tab-reset-btn').addEventListener('click', function() {
    resetAllTabs();
  });

});








