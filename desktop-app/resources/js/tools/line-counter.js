(function(global, document) {
  "use strict";

  /**
   * Owns the Line Counter tool: configuration, workspace discovery, line counting, progress, and report links.
   */
  function registerMarkdownViewerLineCounter(app, deps = {}) {
    const DEFAULT_EXCLUDED_FOLDERS = Object.freeze([
      "bin", "obj", "logs", "log", "node_modules", ".git", ".hg", ".svn", ".idea", ".vs",
      "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".cache", ".gradle", ".md-editor"
    ]);
    const DEFAULT_EXCLUDED_EXTENSIONS = Object.freeze([
      "exe", "dll", "so", "dylib", "a", "lib", "o", "obj", "class", "jar", "war", "ear",
      "zip", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "png", "jpg", "jpeg", "gif", "webp",
      "ico", "bmp", "tif", "tiff", "pdf", "mp3", "mp4", "mov", "avi", "mkv", "wav", "flac",
      "woff", "woff2", "ttf", "eot", "bin", "dat", "db", "sqlite", "pdb"
    ]);
    const DEFAULT_TOP_FILE_LIMIT = 100;
    const PREFERENCE_KEY = "lineCounterPreferences";
    const sourceByKey = new Map();
    let nextSourceKey = 1;
    let running = false;
    let cancelRequested = false;
    let pendingConfigResolve = null;
    const progress = {
      minimized: false,
      hideTimer: null
    };

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function getFileName(path) {
      return deps.getFileName ? deps.getFileName(path) : normalizePath(path).split("/").pop() || "file";
    }

    function joinPath(parent, name) {
      if (deps.joinPath) return deps.joinPath(parent, name);
      return String(parent || "").replace(/[\\/]+$/, "") + "/" + name;
    }

    function getEntryDisplayPath(entry) {
      return normalizePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
    }

    function getEntrySource(entry) {
      const path = entry.fullPath || entry.path || null;
      return {
        name: entry.name || getFileName(path),
        path,
        fullPath: entry.fullPath || null,
        file: entry.file || null,
        handle: entry.handle || null,
        size: Number(entry.size || entry.file?.size || 0) || 0
      };
    }

    function countLines(content) {
      const text = String(content || "");
      if (!text) return 0;
      const matches = text.match(/\r\n|\r|\n/g);
      return (matches ? matches.length : 0) + (/\r\n$|\r$|\n$/.test(text) ? 0 : 1);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function getProgressElements() {
      return deps.progressElements || {};
    }

    function getConfigElements() {
      return deps.configElements || {};
    }

    function setText(element, text) {
      if (element) element.textContent = text;
    }

    function parseList(value, options = {}) {
      const stripDot = options.stripDot === true;
      return String(value || "")
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .map((item) => stripDot ? item.replace(/^\.+/, "") : item)
        .filter(Boolean);
    }

    function formatList(items) {
      return (items || []).join(", ");
    }

    function normalizeCountFolder(value) {
      const normalized = normalizePath(value).trim().replace(/^\/+|\/+$/g, "");
      return normalized && normalized !== "." ? normalized : ".";
    }

    function createDefaultConfig() {
      return {
        folder: ".",
        excludedFolders: [...DEFAULT_EXCLUDED_FOLDERS],
        excludedExtensions: [...DEFAULT_EXCLUDED_EXTENSIONS],
        topLimit: DEFAULT_TOP_FILE_LIMIT
      };
    }

    function normalizeConfig(value) {
      const defaults = createDefaultConfig();
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const topLimit = Math.max(1, Math.min(10000, Number.parseInt(source.topLimit, 10) || defaults.topLimit));
      return {
        folder: normalizeCountFolder(source.folder || defaults.folder),
        excludedFolders: Array.isArray(source.excludedFolders)
          ? source.excludedFolders.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
          : defaults.excludedFolders,
        excludedExtensions: Array.isArray(source.excludedExtensions)
          ? source.excludedExtensions.map((item) => String(item || "").trim().toLowerCase().replace(/^\.+/, "")).filter(Boolean)
          : defaults.excludedExtensions,
        topLimit
      };
    }

    function getSavedConfig() {
      return normalizeConfig(deps.loadGlobalState?.()?.[PREFERENCE_KEY]);
    }

    function saveConfigPreference(config) {
      deps.saveGlobalState?.({ [PREFERENCE_KEY]: normalizeConfig(config) });
    }

    function resetConfigPreference() {
      deps.saveGlobalState?.({ [PREFERENCE_KEY]: undefined });
      fillConfigDialog(createDefaultConfig());
      setText(getConfigElements().status, "Line Counter defaults restored.");
    }

    function readConfigFromDialog() {
      const elements = getConfigElements();
      const topLimit = Math.max(1, Math.min(10000, Number.parseInt(elements.topLimitInput?.value, 10) || DEFAULT_TOP_FILE_LIMIT));
      return {
        folder: normalizeCountFolder(elements.folderInput?.value || "."),
        excludedFolders: parseList(elements.excludedFoldersInput?.value, { stripDot: false }),
        excludedExtensions: parseList(elements.excludedExtensionsInput?.value, { stripDot: true }),
        topLimit
      };
    }

    function fillConfigDialog(config = getSavedConfig()) {
      const elements = getConfigElements();
      config = normalizeConfig(config);
      if (elements.folderInput) elements.folderInput.value = config.folder;
      if (elements.excludedFoldersInput) elements.excludedFoldersInput.value = formatList(config.excludedFolders);
      if (elements.excludedExtensionsInput) elements.excludedExtensionsInput.value = formatList(config.excludedExtensions);
      if (elements.topLimitInput) elements.topLimitInput.value = String(config.topLimit);
      setText(elements.status, "");
    }

    function closeConfigDialog(result) {
      const elements = getConfigElements();
      if (elements.modal) elements.modal.style.display = "none";
      const resolve = pendingConfigResolve;
      pendingConfigResolve = null;
      if (resolve) resolve(result);
    }

    function showConfigDialog() {
      const elements = getConfigElements();
      if (!elements.modal) return Promise.resolve(createDefaultConfig());
      fillConfigDialog();
      elements.modal.style.display = "flex";
      elements.folderInput?.focus();
      return new Promise((resolve) => {
        pendingConfigResolve = resolve;
      });
    }

    function handleConfigCount() {
      const config = readConfigFromDialog();
      saveConfigPreference(config);
      closeConfigDialog(config);
    }

    function handleConfigReset() {
      resetConfigPreference();
    }

    function handleConfigCancel() {
      closeConfigDialog(null);
    }

    function isAbsolutePath(path) {
      return /^[a-zA-Z]:\//.test(path) || path.startsWith("/") || path.startsWith("//");
    }

    function getScanRootPath(config) {
      const activeFolderPath = normalizePath(deps.getActiveFolderPath?.() || "");
      if (!activeFolderPath) return "";
      if (config.folder === ".") return activeFolderPath;
      if (isAbsolutePath(config.folder)) return config.folder;
      return joinPath(activeFolderPath, config.folder);
    }

    function getRelativeFolderPrefix(config) {
      return config.folder === "." ? "" : normalizePath(config.folder).replace(/^\/+|\/+$/g, "");
    }

    function pathStartsWithFolder(path, folderPrefix) {
      if (!folderPrefix) return true;
      const normalizedPath = normalizePath(path).replace(/^\/+/, "");
      return normalizedPath === folderPrefix || normalizedPath.startsWith(`${folderPrefix}/`);
    }

    function getPathSegments(path) {
      return normalizePath(path).split("/").filter(Boolean);
    }

    function getFileExtension(path) {
      const name = getFileName(path);
      const index = name.lastIndexOf(".");
      return index > 0 ? name.slice(index + 1).toLowerCase() : "";
    }

    function createScanFilters(config) {
      return {
        excludedFolderSet: new Set((config.excludedFolders || []).map((item) => item.toLowerCase())),
        excludedExtensionSet: new Set((config.excludedExtensions || []).map((item) => item.toLowerCase()))
      };
    }

    function isExcludedFolderName(name, filters) {
      return filters.excludedFolderSet.has(String(name || "").toLowerCase());
    }

    function isExcludedByPath(path, filters) {
      return getPathSegments(path).some((segment) => isExcludedFolderName(segment, filters));
    }

    function isExcludedFile(entry, filters) {
      const path = getEntryDisplayPath(entry);
      if (isExcludedByPath(path, filters)) return true;
      const extension = getFileExtension(path);
      return extension ? filters.excludedExtensionSet.has(extension) : false;
    }

    function setProgressValue(completed, total) {
      const elements = getProgressElements();
      const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      setText(elements.percent, `${percent}%`);
      setText(elements.pillLabel, total > 0 ? `${completed} / ${total}` : "Scanning...");
      if (elements.fill) elements.fill.style.width = `${percent}%`;
      if (elements.track) elements.track.setAttribute("aria-valuenow", String(percent));
    }

    function appendProgressLog(message) {
      const elements = getProgressElements();
      if (!elements.log) return;
      const timestamp = new Date().toLocaleTimeString();
      const line = `[${timestamp}] ${message}`;
      elements.log.textContent = elements.log.textContent ? `${elements.log.textContent}\n${line}` : line;
      elements.log.scrollTop = elements.log.scrollHeight;
    }

    function showProgressLayer(statusText = "Preparing scan...") {
      const elements = getProgressElements();
      if (progress.hideTimer) {
        clearTimeout(progress.hideTimer);
        progress.hideTimer = null;
      }
      progress.minimized = false;
      if (elements.log) elements.log.textContent = "";
      if (elements.layer) elements.layer.hidden = false;
      if (elements.pill) elements.pill.hidden = true;
      if (elements.cancelButton) {
        elements.cancelButton.hidden = false;
        elements.cancelButton.disabled = false;
      }
      setText(elements.status, statusText);
      setText(elements.count, "Starting...");
      setText(elements.pillStatus, "running");
      setProgressValue(0, 0);
      appendProgressLog(statusText);
    }

    function minimizeProgressLayer() {
      const elements = getProgressElements();
      if (!running || !elements.layer || !elements.pill) return;
      progress.minimized = true;
      elements.layer.hidden = true;
      elements.pill.hidden = false;
    }

    function restoreProgressLayer() {
      const elements = getProgressElements();
      if (!running || !elements.layer || !elements.pill) return;
      progress.minimized = false;
      elements.layer.hidden = false;
      elements.pill.hidden = true;
    }

    function requestCancelCount() {
      if (!running || cancelRequested) return;
      cancelRequested = true;
      const elements = getProgressElements();
      setText(elements.status, "Canceling after the current file...");
      setText(elements.pillLabel, "Canceling...");
      if (elements.cancelButton) elements.cancelButton.disabled = true;
      appendProgressLog("Cancellation requested. A partial report will open.");
    }

    function updateProgress(statusText, completed, total) {
      const elements = getProgressElements();
      setText(elements.status, statusText);
      setText(elements.count, total > 0 ? `${completed} of ${total} files processed` : statusText);
      setText(elements.pillLabel, total > 0 ? `${completed} / ${total}` : statusText);
      setProgressValue(completed, total);
    }

    function scheduleProgressHide(delay) {
      const elements = getProgressElements();
      progress.hideTimer = setTimeout(() => {
        if (elements.layer) elements.layer.hidden = true;
        if (elements.pill) elements.pill.hidden = true;
        if (elements.cancelButton) elements.cancelButton.disabled = false;
      }, delay);
    }

    function completeProgress(statusText, options = {}) {
      const elements = getProgressElements();
      setText(elements.status, statusText);
      setText(elements.count, statusText);
      setText(elements.pillStatus, options.cancelled ? "cancelled" : "complete");
      setText(elements.pillLabel, options.cancelled ? "Partial report ready" : "Report ready");
      if (elements.cancelButton) elements.cancelButton.hidden = true;
      setProgressValue(1, 1);
      appendProgressLog(statusText);
      scheduleProgressHide(options.cancelled ? 1500 : 900);
    }

    function failProgress(statusText) {
      const elements = getProgressElements();
      setText(elements.status, statusText);
      setText(elements.count, statusText);
      setText(elements.pillStatus, "failed");
      setText(elements.pillLabel, "Failed");
      if (elements.cancelButton) elements.cancelButton.hidden = true;
      appendProgressLog(statusText);
      scheduleProgressHide(3000);
    }

    function createEmptyScanStats() {
      return {
        excludedFolders: 0,
        excludedFiles: 0,
        discoveredFiles: 0
      };
    }

    function collectTreeFiles(nodes, config, parentPath = "", files = [], stats = createEmptyScanStats()) {
      const filters = createScanFilters(config);
      const folderPrefix = getRelativeFolderPrefix(config);
      (nodes || []).forEach((node) => {
        if (cancelRequested || !node || node.isParentNavigation) return;
        const currentPath = parentPath ? `${parentPath}/${node.name}` : (node.path || node.name || "");
        if (node.kind === "directory") {
          if (isExcludedFolderName(node.name, filters) || isExcludedByPath(currentPath, filters)) {
            stats.excludedFolders += 1;
            return;
          }
          collectTreeFiles(node.children || [], config, currentPath, files, stats);
        } else if (node.kind === "file") {
          const entry = {
            ...node,
            path: node.path || currentPath,
            fullPath: node.fullPath || null
          };
          if (!pathStartsWithFolder(entry.path, folderPrefix)) return;
          stats.discoveredFiles += 1;
          if (isExcludedFile(entry, filters)) {
            stats.excludedFiles += 1;
            return;
          }
          files.push(entry);
        }
      });
      return { files, stats };
    }

    async function collectNeutralinoFiles(parentPath, config, parentRelativePath = "", files = [], stats = createEmptyScanStats()) {
      const Neutralino = deps.Neutralino;
      const filters = createScanFilters(config);
      if (!parentPath || !Neutralino?.filesystem?.readDirectory || cancelRequested) return { files, stats };
      const entries = await Neutralino.filesystem.readDirectory(parentPath);
      for (let index = 0; index < (entries || []).length; index += 1) {
        if (cancelRequested) break;
        const item = entries[index];
        const name = item?.entry || item?.name || "";
        if (!name || name === "." || name === "..") continue;
        const fullPath = joinPath(parentPath, name);
        const relativePath = parentRelativePath ? `${parentRelativePath}/${name}` : name;
        const type = String(item?.type || item?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || item?.isDirectory === true) {
          if (isExcludedFolderName(name, filters) || isExcludedByPath(relativePath, filters)) {
            stats.excludedFolders += 1;
            continue;
          }
          await collectNeutralinoFiles(fullPath, config, relativePath, files, stats);
        } else if (type === "FILE" || item?.isFile === true || !type) {
          const entry = { name, path: relativePath, fullPath, size: Number(item?.size || item?.fileSize || 0) || 0 };
          stats.discoveredFiles += 1;
          if (isExcludedFile(entry, filters)) {
            stats.excludedFiles += 1;
            continue;
          }
          files.push(entry);
        }
        if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { files, stats };
    }

    async function getWorkspaceFiles(config) {
      const activeFolderPath = deps.getActiveFolderPath?.() || "";
      if (activeFolderPath && deps.Neutralino?.filesystem?.readDirectory) {
        return collectNeutralinoFiles(getScanRootPath(config), config);
      }
      return collectTreeFiles(deps.getCurrentFolderTreeNodes?.() || [], config);
    }

    async function readEntryContent(entry) {
      if (typeof entry.content === "string") return entry.content;
      if (entry.file?.text) return entry.file.text();
      if (entry.handle?.getFile) return (await entry.handle.getFile()).text();
      const path = entry.fullPath || entry.path || "";
      if (path && deps.Neutralino?.filesystem?.readFile) return deps.Neutralino.filesystem.readFile(path);
      throw new Error("No readable file source was available.");
    }

    function rememberReportSource(entry) {
      const key = `line-counter-${nextSourceKey++}`;
      sourceByKey.set(key, getEntrySource(entry));
      return key;
    }

    function buildReportMarkdown(report) {
      const config = report.config || createDefaultConfig();
      const folderName = deps.getActiveFolderName?.() || deps.getActiveFolderPath?.() || "Open folder";
      const generatedAt = new Date().toLocaleString();
      const rows = report.results.slice(0, config.topLimit).map((entry, index) => {
        const sourceKey = rememberReportSource(entry);
        const path = getEntryDisplayPath(entry);
        const name = entry.name || getFileName(path);
        return [
          "<tr>",
          `<td>${index + 1}</td>`,
          `<td><a href="#" title="${escapeHtml(path)}" data-line-counter-key="${escapeHtml(sourceKey)}">${escapeHtml(name)}</a></td>`,
          `<td>${escapeHtml(path)}</td>`,
          `<td>${entry.lineCount}</td>`,
          "</tr>"
        ].join("");
      }).join("\n");
      const skippedText = report.skipped.length ? `\n\n${report.skipped.length} file${report.skipped.length === 1 ? "" : "s"} could not be read and were skipped.` : "";
      const cancelledText = report.cancelled ? "\n\nThe count was canceled. This report includes files counted before cancellation." : "";
      const summaryRows = [
        ["Folder", folderName],
        ["Count folder", config.folder],
        ["Generated", generatedAt],
        ["Status", report.cancelled ? "Canceled - partial results" : "Complete"],
        ["Excluded folders", formatList(config.excludedFolders)],
        ["Excluded file types", formatList(config.excludedExtensions.map((extension) => `.${extension}`))],
        ["Files discovered", report.stats.discoveredFiles],
        ["Files excluded by configuration", report.stats.excludedFiles],
        ["Folders excluded by configuration", report.stats.excludedFolders],
        ["Files selected for counting", report.totalFiles],
        ["Files counted", report.countedFiles],
        ["Showing", `${Math.min(report.results.length, config.topLimit)} of ${report.results.length} readable counted files`]
      ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("\n");
      return [
        "# Line Counter",
        "",
        "<details class=\"line-counter-report-summary\">",
        "<summary>Report summary</summary>",
        "<div>",
        "<table>",
        "<tbody>",
        summaryRows,
        "</tbody>",
        "</table>",
        `${skippedText}${cancelledText}`,
        "</div>",
        "</details>",
        "",
        "<table>",
        "<thead><tr><th>#</th><th>File</th><th>Path</th><th>Lines</th></tr></thead>",
        `<tbody>${rows || '<tr><td colspan="4">No readable files found.</td></tr>'}</tbody>`,
        "</table>"
      ].join("\n");
    }

    async function countWorkspaceLines(config) {
      appendProgressLog(`Scanning ${config.folder}...`);
      const scan = await getWorkspaceFiles(config);
      const files = scan.files || [];
      const stats = scan.stats || createEmptyScanStats();
      appendProgressLog(`Found ${files.length} matching file${files.length === 1 ? "" : "s"}.`);
      appendProgressLog(`Excluded ${stats.excludedFiles} file${stats.excludedFiles === 1 ? "" : "s"} and ${stats.excludedFolders} folder${stats.excludedFolders === 1 ? "" : "s"}.`);
      const results = [];
      const skipped = [];
      let countedFiles = 0;
      for (let index = 0; index < files.length; index += 1) {
        if (cancelRequested) break;
        const entry = files[index];
        try {
          const content = await readEntryContent(entry);
          if (cancelRequested) break;
          results.push({ ...entry, lineCount: countLines(content) });
          countedFiles += 1;
        } catch (error) {
          skipped.push({ entry, error });
        }
        const completed = index + 1;
        updateProgress(cancelRequested ? "Canceling..." : "Counting file lines...", completed, files.length);
        if (completed === files.length || completed % 25 === 0) {
          appendProgressLog(`Counted ${completed} of ${files.length} file${files.length === 1 ? "" : "s"}.`);
        }
        if (index > 0 && index % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      appendProgressLog("Sorting files by line count...");
      results.sort((left, right) => (right.lineCount - left.lineCount) || getEntryDisplayPath(left).localeCompare(getEntryDisplayPath(right)));
      return { results, skipped, stats, totalFiles: files.length, countedFiles, cancelled: cancelRequested, config };
    }

    async function openLineCounterReport() {
      if (running) return;
      if (!deps.isFolderOpen?.()) {
        deps.alert?.("Open a folder before running Line Counter.");
        return;
      }
      const config = await showConfigDialog();
      if (!config) return;
      running = true;
      cancelRequested = false;
      updateButtons();
      showProgressLayer("Preparing Line Counter scan...");
      try {
        const report = await countWorkspaceLines(config);
        appendProgressLog(report.cancelled ? "Building partial report tab..." : "Building report tab...");
        deps.openReportTab?.(buildReportMarkdown(report));
        completeProgress(report.cancelled ? "Partial Line Counter report ready." : "Line Counter report ready.", { cancelled: report.cancelled });
      } catch (error) {
        console.error("Line Counter failed:", error);
        failProgress("Line Counter failed: " + (error?.message || error));
        deps.alert?.("Line Counter failed: " + (error?.message || error));
      } finally {
        running = false;
        cancelRequested = false;
        updateButtons();
      }
    }

    async function openReportSource(key) {
      const source = sourceByKey.get(key);
      if (!source) return;
      try {
        await deps.openDocumentSourceFile?.(source, { temporary: false, title: source.name || getFileName(source.path || source.fullPath), skipExistingSourceTab: true });
      } catch (error) {
        console.error("Failed to open Line Counter file:", error);
        deps.alert?.("Unable to open this file.");
      }
    }

    function handleReportLinkClick(event) {
      const anchor = event.target?.closest?.("a[data-line-counter-key]");
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      void openReportSource(anchor.dataset.lineCounterKey || "");
    }

    function handleConfigKeydown(event) {
      const elements = getConfigElements();
      if (event.key !== "Escape" || elements.modal?.style.display === "none") return;
      event.preventDefault();
      handleConfigCancel();
    }

    function updateButtons() {
      const enabled = deps.isFolderOpen?.() === true && !running;
      (deps.buttons || []).forEach((button) => {
        button.disabled = !enabled;
        button.setAttribute("aria-disabled", enabled ? "false" : "true");
        button.title = enabled ? "Count lines in files under the open folder" : (running ? "Line Counter is scanning" : "Open a folder to count file lines");
      });
    }

    function bindButtons() {
      (deps.buttons || []).forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          if (button.disabled) return;
          deps.closeMobileMenu?.();
          void openLineCounterReport();
        });
      });
      document.addEventListener("click", handleReportLinkClick);
      document.addEventListener("keydown", handleConfigKeydown);
      deps.configElements?.countButton?.addEventListener("click", handleConfigCount);
      deps.configElements?.cancelButton?.addEventListener("click", handleConfigCancel);
      deps.configElements?.resetButton?.addEventListener("click", handleConfigReset);
      deps.progressElements?.minimizeButton?.addEventListener("click", minimizeProgressLayer);
      deps.progressElements?.pill?.addEventListener("click", restoreProgressLayer);
      deps.progressElements?.cancelButton?.addEventListener("click", requestCancelCount);
      updateButtons();
    }

    const api = { openLineCounterReport, updateButtons, _test: { countLines, buildReportMarkdown, collectTreeFiles, parseList, isExcludedFile } };
    bindButtons();
    app.registerModule?.("lineCounter", api);
    return api;
  }

  global.registerMarkdownViewerLineCounter = registerMarkdownViewerLineCounter;
})(typeof window !== "undefined" ? window : globalThis, document);
