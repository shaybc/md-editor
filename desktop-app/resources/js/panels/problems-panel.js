(function(global) {
  "use strict";

  /**
   * Own structured project diagnostics in the shared bottom panel.
   * @param {object} app Application module registry.
   * @param {object} deps Bottom panel and source-navigation dependencies.
   * @returns {object} Problems panel API.
   */
  function registerMarkdownViewerProblemsPanel(app, deps = {}) {
    const PERSISTED_PROBLEMS_FILE = "problems.json";
    const FILTER_PREFERENCES_KEY = "markdownViewerProblemsPanelFilters";
    const DEFAULT_FILTERS = Object.freeze({ showWarnings: true, showInfo: true, showProjectErrors: true, showErrors: true, showTestSources: true });
    // Conventional JVM test source-set folders (src/test, src/testFixtures,
    // src/integrationTest, ...). Used by the "Test sources" filter to
    // suppress diagnostics that preference files cannot (for example ECJ-vs-javac
    // inference divergences that only exist in test code).
    const TEST_SOURCE_PATH_PATTERN = /\/src\/[^/]*test[^/]*\//i;
    const PROBLEMS_VIEW_IDS = Object.freeze(["problems", "files", "project"]);
    const JDT_COLLECTION_OWNER = "lsp:java:proxy";
    const DEFAULT_INITIAL_JDT_PROBLEM_LIMIT = 100;
    const JDT_SYNC_RENDER_LIMIT = 100;
    const DEFAULT_JDT_PROBLEM_RETRY_DELAYS_MS = [250, 1000, 2000];
    const JDT_RENDER_BATCH_SIZE = 50;
    const COLUMN_DEFINITIONS = Object.freeze([
      { key: "severity", label: "Type", cssVariable: "--problems-col-severity", minimumWidth: 56 },
      { key: "message", label: "Message", cssVariable: "--problems-col-message", minimumWidth: 140 },
      { key: "filePath", label: "File", cssVariable: "--problems-col-file", minimumWidth: 160 },
      { key: "line", label: "Line", cssVariable: "--problems-col-line", minimumWidth: 54, numeric: true },
      { key: "column", label: "Column", cssVariable: "--problems-col-column", minimumWidth: 66, numeric: true },
      { key: "source", label: "Source", cssVariable: "--problems-col-source", minimumWidth: 72 }
    ]);
    const bottomPanel = deps.bottomPanel;
    const view = deps.view || document.getElementById("bottom-panel-problems");
    const summary = deps.summary || document.getElementById("problems-panel-summary");
    const severityIndex = deps.severityIndex || document.getElementById("problems-panel-severity-index");
    const body = deps.body || document.getElementById("problems-panel-body");
    let diagnostics = [];
    const diagnosticCollections = new Map();
    let sortKey = "";
    let sortDirection = "asc";
    let activeProblemsViewId = "problems";
    const collapsedFileGroupKeys = new Set();
    let loadedProjectPath = "";
    let restoreGeneration = 0;
    let selectedDiagnostics = new Set();
    let contextDiagnostic = null;
    let contextMenu = null;
    let filterMenu = null;
    let problemFilters = readFilterPreferences();
    let jdtSummary = null;
    let jdtQueryGeneration = 0;
    let jdtLoadedCount = 0;
    let rowRenderGeneration = 0;
    let jdtActivated = false;
    let jdtSnapshotId = "";
    let jdtSnapshotRevision = 0;
    let jdtUpdatesAvailable = false;
    let jdtInitialLoadPending = false;
    let jdtInitialLoadPromise = null;
    let jdtInitialLoadState = "idle";
    let jdtAnalysisReady = deps.isJdtAnalysisReady?.() !== false;
    let jdtDiagnosticsSuspended = false;
    let analysisGenerationState = { status: "idle", workspaceRoot: "", generationId: 0, failure: null };
    let notifiedAnalysisFailureKey = "";
    let pendingJdtSummary = null;
    let jdtSnapshotSyncPending = false;
    let jdtSnapshotSyncQueued = false;

    function getInitialJdtProblemLimit() {
      const value = Number(deps.getInitialJdtProblemLimit?.());
      return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : DEFAULT_INITIAL_JDT_PROBLEM_LIMIT;
    }

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }
    function getPreferenceStorage() {
      return deps.localStorage || global.localStorage || null;
    }

    function readFilterPreferences() {
      const storage = getPreferenceStorage();
      if (!storage?.getItem) return { ...DEFAULT_FILTERS };
      try {
        const parsed = JSON.parse(storage.getItem(FILTER_PREFERENCES_KEY) || "{}");
        return {
          showWarnings: parsed?.showWarnings !== false,
          showInfo: parsed?.showInfo !== false,
          showProjectErrors: parsed?.showProjectErrors !== false,
          showErrors: parsed?.showErrors !== false,
          showTestSources: parsed?.showTestSources !== false
        };
      } catch (_error) {
        return { ...DEFAULT_FILTERS };
      }
    }

    function saveFilterPreferences() {
      const storage = getPreferenceStorage();
      if (!storage?.setItem) return;
      try {
        storage.setItem(FILTER_PREFERENCES_KEY, JSON.stringify(problemFilters));
      } catch (_error) {
        // Filtering is still usable when preferences cannot be persisted.
      }
    }

    function isFilterActive() {
      return !problemFilters.showWarnings || !problemFilters.showInfo || !problemFilters.showProjectErrors || !problemFilters.showErrors || !problemFilters.showTestSources;
    }

    function belongsToTestSources(diagnostic) {
      return TEST_SOURCE_PATH_PATTERN.test(`${normalizePath(diagnostic.filePath)}/`);
    }

    function diagnosticMatchesFilters(diagnostic) {
      if (!problemFilters.showWarnings && diagnostic.severity === "warning") return false;
      if (!problemFilters.showInfo && diagnostic.severity === "info") return false;
      if (!problemFilters.showErrors && diagnostic.severity === "error") return false;
      if (!problemFilters.showProjectErrors && diagnostic.severity === "error" && isProjectDiagnostic(diagnostic)) return false;
      if (!problemFilters.showTestSources && !isProjectDiagnostic(diagnostic) && belongsToTestSources(diagnostic)) return false;
      return true;
    }

    function getVisibleDiagnostics() {
      return getOrderedDiagnostics().filter(diagnosticMatchesFilters);
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getPersistencePath(projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), PERSISTED_PROBLEMS_FILE);
    }

    function canPersistDiagnostics() {
      const Neutralino = deps.Neutralino || global.Neutralino;
      return Boolean(deps.isDesktopRuntime?.() && Neutralino?.filesystem?.readFile && Neutralino?.filesystem?.writeFile);
    }

    function normalizeDiagnostic(diagnostic = {}) {
      const severity = ["error", "warning", "info"].includes(diagnostic.severity) ? diagnostic.severity : "info";
      return {
        ...diagnostic,
        severity,
        message: String(diagnostic.message || "Unknown problem"),
        filePath: String(diagnostic.filePath || diagnostic.path || ""),
        targetKind: diagnostic.targetKind === "project" || !(diagnostic.filePath || diagnostic.path) ? "project" : "file",
        line: Math.max(1, Number(diagnostic.line) || 1),
        column: Math.max(1, Number(diagnostic.column) || 1),
        source: String(diagnostic.source || "")
      };
    }

    function getDiagnosticIdentity(diagnostic) {
      return [
        normalizePath(diagnostic.filePath).toLowerCase(),
        diagnostic.line,
        diagnostic.column,
        diagnostic.message
      ].join("|");
    }

    function rebuildDiagnostics(options = {}) {
      const merged = new Map();
      diagnosticCollections.forEach((collection, owner) => {
        collection.diagnostics.forEach((diagnostic) => {
          const normalized = {
            ...normalizeDiagnostic(diagnostic),
            diagnosticCollectionOwner: owner,
            isPersistentDiagnostic: collection.persistent,
            isUserDeletable: collection.userDeletable !== false
          };
          const identity = getDiagnosticIdentity(normalized);
          const existing = merged.get(identity);
          if (!existing || normalized.source === "jdt") {
            if (existing && normalized.source === "jdt" && existing.source !== "jdt") {
              normalized.buildSources = Array.from(new Set([...(existing.buildSources || []), existing.source].filter(Boolean)));
            }
            merged.set(identity, normalized);
          } else if (existing.source === "jdt" && normalized.source !== "jdt") {
            existing.buildSources = Array.from(new Set([...(existing.buildSources || []), normalized.source].filter(Boolean)));
          }
        });
      });
      diagnostics = Array.from(merged.values());
      selectedDiagnostics = new Set(Array.from(selectedDiagnostics).filter((diagnostic) => diagnostics.includes(diagnostic)));
      render();
      if (options.revealErrors !== false && diagnostics.some((item) => item.severity === "error")) show();
      return diagnostics.slice();
    }

    function setDiagnosticCollection(owner, nextDiagnostics, options = {}) {
      const collectionOwner = String(owner || "project");
      diagnosticCollections.set(collectionOwner, {
        persistent: options.persistent === true,
        userDeletable: options.userDeletable !== false,
        diagnostics: Array.isArray(nextDiagnostics) ? nextDiagnostics.slice() : []
      });
      hideContextMenu();
      selectedDiagnostics = new Set();
      return rebuildDiagnostics(options);
    }

    function clearDiagnosticCollection(owner, options = {}) {
      diagnosticCollections.delete(String(owner || ""));
      return rebuildDiagnostics({ revealErrors: false, ...options });
    }

    function getSummaryText() {
      if (jdtSummary && jdtSummary.totalCount > 0) {
        if (jdtLoadedCount === 0) {
          const initialCount = Math.min(getInitialJdtProblemLimit(), Number(jdtSummary.availableCount) || Number(jdtSummary.totalCount));
          if (jdtInitialLoadState === "loading") return `Loading first ${initialCount} of ${jdtSummary.totalCount} problems...`;
          if (jdtInitialLoadState === "retrying") return `Retrying first ${initialCount} of ${jdtSummary.totalCount} problems...`;
          if (jdtInitialLoadState === "failed") return `Unable to load details for ${jdtSummary.totalCount} reported problems`;
          return `${jdtSummary.totalCount} problems reported — open Problems to load details`;
        }
        return `Displaying ${jdtLoadedCount} problems out of ${jdtSummary.totalCount}`;
      }
      const errors = diagnostics.filter((item) => item.severity === "error").length;
      const warnings = diagnostics.filter((item) => item.severity === "warning").length;
      if (!diagnostics.length) return "No problems detected";
      return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
    }

    /** Return complete analyzer severity totals when available, otherwise count the current rows. */
    function getSeverityCounts() {
      const diagnosticCounts = diagnostics.reduce((counts, diagnostic) => {
        counts[diagnostic.severity] += 1;
        return counts;
      }, { error: 0, warning: 0, info: 0 });
      if (!jdtSummary?.counts || Number(jdtSummary.totalCount) <= jdtLoadedCount) return diagnosticCounts;
      return {
        error: Number(jdtSummary.counts.error) || 0,
        warning: Number(jdtSummary.counts.warning) || 0,
        info: Number(jdtSummary.counts.info ?? jdtSummary.counts.information) || 0
      };
    }

    /** Keep the centered severity index synchronized with the committed Problems snapshot. */
    function renderSeverityIndex() {
      if (!severityIndex) return;
      const analyzerIsWorking = ["running", "committing"].includes(analysisGenerationState.status);
      severityIndex.hidden = analyzerIsWorking;
      if (analyzerIsWorking) return;
      const counts = getSeverityCounts();
      Object.entries(counts).forEach(([severity, count]) => {
        const countElement = severityIndex.querySelector(`[data-problems-severity-count="${severity}"]`);
        if (countElement) countElement.textContent = String(count);
      });
      severityIndex.setAttribute(
        "aria-label",
        `${counts.error} errors, ${counts.warning} warnings, ${counts.info} information messages`
      );
    }

    function renderSummary() {
      renderSeverityIndex();
      if (!summary) return;
      if (["running", "committing"].includes(analysisGenerationState.status)) {
        summary.textContent = "";
        return;
      }
      summary.textContent = getSummaryText();
      if (jdtUpdatesAvailable) {
        summary.appendChild(document.createTextNode(" — Updated problems available"));
      }
      if (jdtSummary && jdtLoadedCount >= jdtSummary.availableCount && jdtSummary.totalCount > jdtSummary.availableCount) {
        summary.appendChild(document.createTextNode(` — Only ${jdtSummary.availableCount} are available`));
      }
      if (!jdtSummary || jdtLoadedCount >= jdtSummary.availableCount) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "problems-panel-load-rest";
      button.title = `Load the rest of the problems (up to ${Number(jdtSummary.maximumProblems || jdtSummary.availableCount).toLocaleString()} max)`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = '<i class="bi bi-chevron-double-down" aria-hidden="true"></i>';
      button.addEventListener("click", () => {
        void loadJdtProblems(jdtSummary.availableCount - jdtLoadedCount, jdtLoadedCount, { snapshotId: jdtSnapshotId });
      });
      summary.appendChild(button);
    }

    function getSeverityLabel(severity) {
      return severity.charAt(0).toUpperCase() + severity.slice(1);
    }

    function notify(message) {
      if (typeof deps.alert === "function") {
        deps.alert(message);
        return;
      }
      global.alert?.(message);
    }

    /** Show one styled notification for each incomplete analysis generation. */
    function notifyAnalysisFailure(state) {
      if (state.status !== "incomplete" || !state.failure || state.failure.fatal !== true || state.failure.notificationHandled === true) return;
      const reason = String(state.failure.summary || state.failure.message || "Project analysis did not complete.").trim();
      const notificationKey = `${state.generationId}:${String(state.failure.code || "incomplete")}:${reason}`;
      if (notificationKey === notifiedAnalysisFailureKey) return;
      notifiedAnalysisFailureKey = notificationKey;
      if (state.failure.code === "jdt-project-scope-mismatch") {
        const copy = deps.createJdtScopeMismatchNotification?.(state) || {
          title: "Java Analysis Scope Mismatch",
          message: reason
        };
        const buttons = [{ id: "close", label: "Close", value: "close", variant: "secondary" }];
        if (typeof deps.openDebugLog === "function") {
          buttons.push({ id: "open-debug-log", label: "Open debug.log", action: () => deps.openDebugLog() });
        }
        if (typeof deps.openJavaBuildPath === "function") {
          buttons.push({
            id: "open-java-build-path",
            label: "Open Java Build Path",
            variant: "primary",
            autoFocus: true,
            action: () => deps.openJavaBuildPath()
          });
        }
        notify({
          title: copy.title,
          message: copy.message,
          dialogClassName: "java-analysis-failure-notification",
          buttons
        });
        return;
      }
      const buttons = [{ id: "close", label: "Close", value: "close", variant: "secondary" }];
      if (typeof deps.openDebugLog === "function") {
        buttons.push({ id: "open-debug-log", label: "Open Debug Log", action: () => deps.openDebugLog() });
      }
      if (typeof deps.retryAnalysis === "function") {
        buttons.push({
          id: "retry-analysis",
          label: "Retry Analysis",
          variant: "primary",
          autoFocus: true,
          action: () => deps.retryAnalysis(state.failure)
        });
      }
      notify({ title: "Project Analysis Incomplete", message: reason, buttons });
    }

    function getSortValue(diagnostic, key) {
      if (key === "filePath") return diagnostic.filePath || "Project";
      return diagnostic[key];
    }

    function getOrderedDiagnostics() {
      const indexed = diagnostics.map((diagnostic, index) => ({ diagnostic, index }));
      if (!sortKey) return indexed.map((entry) => entry.diagnostic);
      const definition = COLUMN_DEFINITIONS.find((column) => column.key === sortKey);
      indexed.sort((left, right) => {
        const leftValue = getSortValue(left.diagnostic, sortKey);
        const rightValue = getSortValue(right.diagnostic, sortKey);
        const comparison = definition?.numeric
          ? Number(leftValue) - Number(rightValue)
          : String(leftValue || "").localeCompare(String(rightValue || ""), undefined, { numeric: true, sensitivity: "base" });
        return (comparison || left.index - right.index) * (sortDirection === "asc" ? 1 : -1);
      });
      return indexed.map((entry) => entry.diagnostic);
    }

    function setColumnWidth(definition, width) {
      view?.style?.setProperty(definition.cssVariable, `${Math.max(definition.minimumWidth, Math.round(width))}px`);
    }

    function beginColumnResize(event, definition, cell) {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = cell.getBoundingClientRect().width;
      const move = (moveEvent) => setColumnWidth(definition, startWidth + moveEvent.clientX - startX);
      const finish = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", finish);
      };
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", finish);
    }

    function sortByColumn(key) {
      if (sortKey === key) sortDirection = sortDirection === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDirection = "asc";
      }
      render();
    }

    async function reloadFromRebuildOutput(button) {
      const projectPath = normalizePath(loadedProjectPath || deps.getActiveProjectPath?.());
      if (!projectPath) {
        notify("Open a project before reloading Problems from Java Rebuild output.");
        return;
      }
      if (!deps.getRebuildOutput || !deps.parseRebuildDiagnostics) {
        notify("Java Rebuild output reparsing is not available in this session.");
        return;
      }
      button.disabled = true;
      try {
        const output = await deps.getRebuildOutput(projectPath);
        if (!String(output || "").trim()) {
          notify("No Java Rebuild output is available to reload. Run Rebuild Project first, or keep its output tab populated.");
          return;
        }
        const parsed = deps.parseRebuildDiagnostics(output, { projectPath });
        const reparsedDiagnostics = Array.isArray(parsed) ? parsed : [];
        await setPersistentDiagnostics(reparsedDiagnostics, { projectPath, revealErrors: true });
        show();
        if (!reparsedDiagnostics.length) notify("Java Rebuild output was re-parsed, but no Java build problems were found.");
      } catch (error) {
        console.warn("Unable to reload Problems from Java Rebuild output:", error);
        notify(error?.message || "Unable to reload Problems from Java Rebuild output.");
      } finally {
        button.disabled = false;
      }
    }

    function updateFilterMenuState() {
      if (!filterMenu) return;
      filterMenu.querySelectorAll("[data-problems-filter]").forEach((button) => {
        const key = button.getAttribute("data-problems-filter");
        const checked = problemFilters[key] === true;
        button.setAttribute("aria-checked", checked ? "true" : "false");
        const icon = button.querySelector("i");
        if (icon) icon.className = `bi ${checked ? "bi-check-square" : "bi-square"}`;
      });
    }

    function hideFilterMenu() {
      filterMenu?.classList.add("hidden");
    }

    function toggleProblemFilter(key) {
      problemFilters = { ...problemFilters, [key]: problemFilters[key] !== true };
      saveFilterPreferences();
      updateFilterMenuState();
      render();
    }

    function clearProblemFilters() {
      problemFilters = { ...DEFAULT_FILTERS };
      saveFilterPreferences();
      hideFilterMenu();
      render();
    }

    function createFilterMenu() {
      if (filterMenu) return filterMenu;
      const menu = document.createElement("div");
      menu.className = "graph-context-menu problems-panel-filter-menu hidden";
      menu.setAttribute("role", "menu");
      [
        ["showErrors", "Error"],
        ["showWarnings", "Warning"],
        ["showInfo", "Info"],
        ["showProjectErrors", "Project level"],
        ["showTestSources", "Test sources"]
      ].forEach(([key, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "graph-context-menu-item problems-panel-filter-menu-item";
        button.setAttribute("role", "menuitemcheckbox");
        button.setAttribute("data-problems-filter", key);
        button.innerHTML = '<i class="bi bi-square" aria-hidden="true"></i><span></span>';
        button.querySelector("span").textContent = label;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleProblemFilter(key);
        });
        menu.appendChild(button);
      });
      document.body.appendChild(menu);
      document.addEventListener("pointerdown", (event) => {
        if (menu.classList.contains("hidden")) return;
        if (menu.contains(event.target) || event.target.closest?.(".problems-panel-filter-button")) return;
        hideFilterMenu();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideFilterMenu();
      });
      filterMenu = menu;
      updateFilterMenuState();
      return filterMenu;
    }

    function showFilterMenu(button) {
      const menu = createFilterMenu();
      updateFilterMenuState();
      menu.classList.toggle("hidden");
      if (menu.classList.contains("hidden")) return;
      const bounds = button.getBoundingClientRect();
      const appZoomFactor = Math.max(0.01, Number(document.documentElement?.dataset?.appZoomPercent || 100) / 100);
      const viewportLeft = Math.max(4, Math.min(bounds.right - 220, global.innerWidth - 224));
      const viewportTop = Math.min(bounds.bottom + 4, global.innerHeight - 120);
      menu.style.left = `${viewportLeft / appZoomFactor}px`;
      menu.style.top = `${viewportTop / appZoomFactor}px`;
      menu.querySelector(".graph-context-menu-item")?.focus();
    }

    function ensureFilterControls() {
      const row = summary?.parentElement;
      if (!row) return;
      let activeLabel = row.querySelector(".problems-panel-filter-active-label");
      if (!activeLabel) {
        activeLabel = document.createElement("button");
        activeLabel.type = "button";
        activeLabel.className = "problems-panel-filter-active-label";
        activeLabel.textContent = "Clear filter";
        activeLabel.addEventListener("click", clearProblemFilters);
        summary?.after(activeLabel);
      }
      activeLabel.hidden = !isFilterActive();

      if (!row.querySelector(".problems-panel-filter-button")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "problems-panel-filter-button";
        button.title = "Filter Problems";
        button.setAttribute("aria-label", "Filter Problems");
        button.innerHTML = '<i class="bi bi-funnel" aria-hidden="true"></i>';
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showFilterMenu(button);
        });
        row.appendChild(button);
      }
      row.querySelector(".problems-panel-filter-button")?.classList.toggle("active", isFilterActive());
    }
    function ensureReloadButton() {
      const row = summary?.parentElement;
      if (!row || row.querySelector(".problems-panel-reload-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "problems-panel-reload-button";
      button.title = "Refresh Problems";
      button.setAttribute("aria-label", "Refresh Problems");
      button.innerHTML = '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';
      button.addEventListener("click", () => {
        void refreshJdtProblems();
        void reloadFromRebuildOutput(button);
      });
      row.appendChild(button);
    }

    function getVisibleFileGroups() {
      return groupFileDiagnostics(getDiagnosticsForProblemsView("files"));
    }

    function areAllVisibleFileGroupsCollapsed(fileGroups = getVisibleFileGroups()) {
      return fileGroups.length > 0 && fileGroups.every((group) => collapsedFileGroupKeys.has(group.key));
    }

    function syncFileGroupsToggleButton() {
      const button = summary?.parentElement?.querySelector(".problems-panel-file-groups-toggle-button");
      if (!button) return;
      const fileGroups = getVisibleFileGroups();
      const allCollapsed = areAllVisibleFileGroupsCollapsed(fileGroups);
      button.hidden = activeProblemsViewId !== "files";
      button.disabled = activeProblemsViewId !== "files" || !fileGroups.length;
      button.title = allCollapsed ? "Expand all file problem groups" : "Collapse all file problem groups";
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<i class="bi ${allCollapsed ? "bi-arrows-expand" : "bi-arrows-collapse"}" aria-hidden="true"></i>`;
    }

    function toggleAllFileGroups() {
      const fileGroups = getVisibleFileGroups();
      if (areAllVisibleFileGroupsCollapsed(fileGroups)) {
        fileGroups.forEach((group) => collapsedFileGroupKeys.delete(group.key));
      } else {
        fileGroups.forEach((group) => collapsedFileGroupKeys.add(group.key));
      }
      render();
    }

    function ensureFileGroupsToggleButton() {
      const row = summary?.parentElement;
      if (!row) return;
      let button = row.querySelector(".problems-panel-file-groups-toggle-button");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "problems-panel-file-groups-toggle-button";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleAllFileGroups();
        });
        row.appendChild(button);
      }
      syncFileGroupsToggleButton();
    }

    function createHeader() {
      const header = document.createElement("div");
      header.className = "problems-panel-header";
      header.setAttribute("role", "row");
      COLUMN_DEFINITIONS.forEach((definition) => {
        const cell = document.createElement("div");
        cell.className = "problems-panel-header-cell";
        cell.setAttribute("role", "columnheader");
        cell.setAttribute("aria-sort", sortKey === definition.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none");
        const sortButton = document.createElement("button");
        sortButton.type = "button";
        sortButton.className = "problems-panel-sort-button";
        sortButton.title = `Sort by ${definition.label}`;
        sortButton.innerHTML = `<span>${definition.label}</span><i class="bi ${sortKey === definition.key ? (sortDirection === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill") : "bi-arrow-down-up"}" aria-hidden="true"></i>`;
        sortButton.addEventListener("click", () => sortByColumn(definition.key));
        const resizer = document.createElement("span");
        resizer.className = "problems-panel-column-resizer";
        resizer.setAttribute("role", "separator");
        resizer.setAttribute("aria-orientation", "vertical");
        resizer.setAttribute("aria-label", `Resize ${definition.label} column`);
        resizer.tabIndex = 0;
        resizer.addEventListener("pointerdown", (resizeEvent) => beginColumnResize(resizeEvent, definition, cell));
        resizer.addEventListener("keydown", (resizeEvent) => {
          if (resizeEvent.key !== "ArrowLeft" && resizeEvent.key !== "ArrowRight") return;
          resizeEvent.preventDefault();
          const delta = resizeEvent.key === "ArrowRight" ? 12 : -12;
          setColumnWidth(definition, cell.getBoundingClientRect().width + delta);
        });
        cell.append(sortButton, resizer);
        header.appendChild(cell);
      });
      return header;
    }

    function canNavigateDiagnostic(diagnostic) {
      return diagnostic?.targetKind !== "project" && Boolean(diagnostic?.filePath);
    }

    async function openDiagnostic(diagnostic) {
      if (!canNavigateDiagnostic(diagnostic)) {
        showDiagnosticProperties(diagnostic);
        return;
      }
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (Neutralino?.filesystem?.getStats) {
        try {
          const stats = await Neutralino.filesystem.getStats(diagnostic.filePath);
          if (String(stats?.type || "").toUpperCase() === "DIRECTORY") {
            diagnostic.targetKind = "project";
            render();
            showDiagnosticProperties(diagnostic);
            return;
          }
        } catch (_error) {
          // Let the canonical file opener report missing or inaccessible file paths.
        }
      }
      try {
        await deps.openDiagnostic?.(diagnostic);
      } catch (error) {
        console.warn("Unable to open problem location:", error);
        const message = error?.message || `Unable to open file: ${diagnostic.filePath}`;
        deps.alert?.(message) || global.alert?.(message);
      }
    }

    function getDiagnosticDescription(diagnostic) {
      const location = canNavigateDiagnostic(diagnostic)
        ? `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}`
        : (diagnostic.filePath || "Project");
      const source = diagnostic.source ? ` [${diagnostic.source}]` : "";
      return `${getSeverityLabel(diagnostic.severity)}: ${diagnostic.message} (${location})${source}`;
    }

    function getDiagnosticFullMessage(diagnostic) {
      const candidates = [
        diagnostic?.originalMessage,
        diagnostic?.fullMessage,
        diagnostic?.rawMessage,
        diagnostic?.details
      ];
      const shortMessage = String(diagnostic?.message || "");
      return String(candidates.find((value) => String(value || "").trim() && String(value || "") !== shortMessage) || shortMessage);
    }
    async function copyTextToClipboard(text) {
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (deps.isDesktopRuntime?.() && Neutralino?.clipboard?.writeText) {
        await Neutralino.clipboard.writeText(text);
        return;
      }
      if (global.navigator?.clipboard?.writeText && global.isSecureContext) {
        await global.navigator.clipboard.writeText(text);
        return;
      }
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select?.();
      document.execCommand("copy");
      textArea.remove();
    }

    async function copySelectedDiagnostics() {
      const selected = selectedDiagnostics.size ? Array.from(selectedDiagnostics) : [contextDiagnostic].filter(Boolean);
      if (!selected.length) return;
      await copyTextToClipboard(selected.map(getDiagnosticDescription).join("\n"));
      selectedDiagnostics = new Set();
      render();
    }

    function hideContextMenu() {
      contextMenu?.classList.add("hidden");
      contextDiagnostic = null;
    }

    function getSelectableDiagnosticsForActiveView() {
      return getDiagnosticsForProblemsView(activeProblemsViewId);
    }

    function selectAllDiagnostics() {
      selectedDiagnostics = new Set(getSelectableDiagnosticsForActiveView());
      render();
    }

    function hasUserDeletableSelection() {
      return Array.from(selectedDiagnostics).some((diagnostic) => diagnostic.isUserDeletable !== false);
    }

    async function deleteSelectedDiagnostics() {
      if (!selectedDiagnostics.size) return;
      const selectedByOwner = new Map();
      Array.from(selectedDiagnostics).forEach((diagnostic) => {
        const owner = diagnostic.diagnosticCollectionOwner || "project";
        if (!selectedByOwner.has(owner)) selectedByOwner.set(owner, new Set());
        selectedByOwner.get(owner).add(getDiagnosticIdentity(diagnostic));
      });
      let changed = false;
      let persistentChanged = false;
      diagnosticCollections.forEach((collection, owner) => {
        const selectedIdentities = selectedByOwner.get(owner);
        if (!selectedIdentities?.size || collection.userDeletable === false) return;
        const nextDiagnostics = collection.diagnostics.filter((diagnostic) => !selectedIdentities.has(getDiagnosticIdentity(normalizeDiagnostic(diagnostic))));
        if (nextDiagnostics.length === collection.diagnostics.length) return;
        diagnosticCollections.set(owner, { ...collection, diagnostics: nextDiagnostics });
        changed = true;
        persistentChanged = persistentChanged || collection.persistent;
      });
      if (!changed) return;
      selectedDiagnostics = new Set();
      rebuildDiagnostics({ revealErrors: false });
      if (persistentChanged) await persistDiagnostics(loadedProjectPath || deps.getActiveProjectPath?.());
    }

    function showDiagnosticProperties(diagnostic) {
      if (!diagnostic) return;
      document.querySelector(".problems-properties-modal")?.remove();
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay problems-properties-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "problems-properties-title");
      overlay.innerHTML = `
        <div class="reset-modal-box problems-properties-modal-box">
          <h2 id="problems-properties-title" class="problems-properties-title">Problem Properties</h2>
          <div class="problems-properties-grid">
            <label class="problems-properties-field">
              <span>Severity</span>
              <input class="rename-modal-input" data-field="severity" type="text" readonly>
            </label>
            <label class="problems-properties-field">
              <span>Source</span>
              <input class="rename-modal-input" data-field="source" type="text" readonly>
            </label>
            <label class="problems-properties-field">
              <span>Line</span>
              <input class="rename-modal-input" data-field="line" type="text" readonly>
            </label>
            <label class="problems-properties-field">
              <span>Column</span>
              <input class="rename-modal-input" data-field="column" type="text" readonly>
            </label>
            <label class="problems-properties-field problems-properties-field-wide">
              <span>File</span>
              <input class="rename-modal-input" data-field="filePath" type="text" readonly>
            </label>
            <label class="problems-properties-field problems-properties-field-wide">
              <span class="problems-properties-message-heading"><span>Message</span><button class="problems-properties-toggle-message" type="button" hidden>Show more...</button></span>
              <textarea class="rename-modal-input problems-properties-message" data-field="message" readonly></textarea>
            </label>
          </div>
          <div class="reset-modal-actions problems-properties-actions">
            <button class="reset-modal-btn problems-properties-go-to-line" type="button">Go to line</button>
            <button class="reset-modal-btn problems-properties-cancel" type="button">Cancel</button>
          </div>
        </div>
      `;
      overlay.querySelector('[data-field="severity"]').value = getSeverityLabel(diagnostic.severity);
      overlay.querySelector('[data-field="source"]').value = diagnostic.source || "";
      overlay.querySelector('[data-field="line"]').value = canNavigateDiagnostic(diagnostic) ? String(diagnostic.line) : "";
      overlay.querySelector('[data-field="column"]').value = canNavigateDiagnostic(diagnostic) ? String(diagnostic.column) : "";
      overlay.querySelector('[data-field="filePath"]').value = diagnostic.filePath || "Project";
      const shortMessage = String(diagnostic.message || "");
      const fullMessage = getDiagnosticFullMessage(diagnostic);
      const messageField = overlay.querySelector('[data-field="message"]');
      const toggleMessageButton = overlay.querySelector(".problems-properties-toggle-message");
      let showingFullMessage = false;
      messageField.value = shortMessage;
      toggleMessageButton.hidden = !fullMessage || fullMessage === shortMessage;
      toggleMessageButton.addEventListener("click", (event) => {
        event.preventDefault();
        showingFullMessage = !showingFullMessage;
        messageField.value = showingFullMessage ? fullMessage : shortMessage;
        toggleMessageButton.textContent = showingFullMessage ? "Show less..." : "Show more...";
      });
      const goToLineButton = overlay.querySelector(".problems-properties-go-to-line");
      const cancelButton = overlay.querySelector(".problems-properties-cancel");
      const closeDialog = () => overlay.remove();
      goToLineButton.disabled = !canNavigateDiagnostic(diagnostic);
      goToLineButton.addEventListener("click", () => {
        closeDialog();
        void openDiagnostic(diagnostic);
      });
      cancelButton.addEventListener("click", closeDialog);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDialog();
      });
      document.body.appendChild(overlay);
      (diagnostic.filePath ? goToLineButton : cancelButton).focus();
    }

    function createContextMenu() {
      const menu = document.createElement("div");
      menu.className = "graph-context-menu problems-panel-context-menu hidden";
      menu.setAttribute("role", "menu");
      menu.innerHTML =
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="go-to-line"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i><span class="graph-context-menu-item-label">Go to line</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="quick-fix"><i class="bi bi-lightbulb" aria-hidden="true"></i><span class="graph-context-menu-item-label">Quick Fix…</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="copy"><i class="bi bi-clipboard" aria-hidden="true"></i><span class="graph-context-menu-item-label">Copy</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="select-all"><i class="bi bi-card-text" aria-hidden="true"></i><span class="graph-context-menu-item-label">Select All</span></button>` +
        `<div class="graph-context-menu-separator" aria-hidden="true"></div>` +
        `<button class="graph-context-menu-item graph-context-menu-item-danger" type="button" role="menuitem" data-action="delete"><i class="bi bi-trash" aria-hidden="true"></i><span class="graph-context-menu-item-label">Delete</span></button>` +
        `<div class="graph-context-menu-separator" aria-hidden="true"></div>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="properties"><i class="bi bi-info-circle" aria-hidden="true"></i><span class="graph-context-menu-item-label">Properties</span></button>`;
      menu.querySelector('[data-action="go-to-line"]').addEventListener("click", () => {
        void openDiagnostic(contextDiagnostic);
        hideContextMenu();
      });
      menu.querySelector('[data-action="quick-fix"]').addEventListener("click", () => {
        const diagnostic = contextDiagnostic;
        hideContextMenu();
        void deps.openQuickFix?.(diagnostic);
      });
      menu.querySelector('[data-action="copy"]').addEventListener("click", async () => {
        await copySelectedDiagnostics();
        hideContextMenu();
      });
      menu.querySelector('[data-action="select-all"]').addEventListener("click", () => {
        selectAllDiagnostics();
        const deleteButton = menu.querySelector('[data-action="delete"]');
        if (deleteButton) deleteButton.disabled = !hasUserDeletableSelection();
        deleteButton?.focus();
      });
      menu.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        hideContextMenu();
        await deleteSelectedDiagnostics();
      });
      menu.querySelector('[data-action="properties"]').addEventListener("click", () => {
        const diagnostic = contextDiagnostic;
        hideContextMenu();
        showDiagnosticProperties(diagnostic);
      });
      document.body.appendChild(menu);
      global.addEventListener("pointerdown", (event) => {
        if (!menu.contains(event.target)) hideContextMenu();
      });
      global.addEventListener("blur", hideContextMenu);
      global.addEventListener("resize", hideContextMenu);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideContextMenu();
      });
      body?.addEventListener("scroll", hideContextMenu);
      return menu;
    }

    function showContextMenu(event, diagnostic) {
      event.preventDefault();
      contextDiagnostic = diagnostic;
      if (!selectedDiagnostics.has(diagnostic)) selectedDiagnostics = new Set([diagnostic]);
      render();
      contextMenu.classList.remove("hidden");
      const goToLine = contextMenu.querySelector('[data-action="go-to-line"]');
      if (goToLine) goToLine.disabled = !canNavigateDiagnostic(diagnostic);
      const quickFix = contextMenu.querySelector('[data-action="quick-fix"]');
      if (quickFix) quickFix.disabled = !deps.canOpenQuickFix?.(diagnostic);
      const deleteButton = contextMenu.querySelector('[data-action="delete"]');
      if (deleteButton) deleteButton.disabled = !hasUserDeletableSelection();
      const appZoomFactor = Math.max(0.01, Number(document.documentElement?.dataset?.appZoomPercent || 100) / 100);
      contextMenu.style.left = `${Math.max(4, event.clientX) / appZoomFactor}px`;
      contextMenu.style.top = `${Math.max(4, event.clientY) / appZoomFactor}px`;
      const bounds = contextMenu.getBoundingClientRect();
      const viewportLeft = Math.max(4, Math.min(event.clientX, global.innerWidth - bounds.width - 4));
      const viewportTop = Math.max(4, Math.min(event.clientY, global.innerHeight - bounds.height - 4));
      contextMenu.style.left = `${viewportLeft / appZoomFactor}px`;
      contextMenu.style.top = `${viewportTop / appZoomFactor}px`;
      contextMenu.querySelector(".graph-context-menu-item:not(:disabled)")?.focus();
    }

    function isProjectDiagnostic(diagnostic) {
      return diagnostic?.targetKind === "project" || !normalizePath(diagnostic?.filePath);
    }

    function getFileName(path) {
      const normalized = normalizePath(path);
      const parts = normalized.split("/").filter(Boolean);
      return parts.pop() || normalized || "Project";
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      const index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : "";
    }

    function getProblemCountText(count) {
      return `${count} problem${count === 1 ? "" : "s"}`;
    }

    function getDiagnosticsForProblemsView(viewId) {
      const visibleDiagnostics = getVisibleDiagnostics();
      if (viewId === "files") return visibleDiagnostics.filter((diagnostic) => !isProjectDiagnostic(diagnostic));
      if (viewId === "project") return visibleDiagnostics.filter(isProjectDiagnostic);
      return visibleDiagnostics;
    }

    function getProblemsViewLabel(viewId) {
      if (viewId === "files") return "Files";
      if (viewId === "project") return "Project";
      return "Problems";
    }

    function createProblemsViewTabs() {
      const tabs = document.createElement("div");
      tabs.className = "problems-panel-inner-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Problems views");
      PROBLEMS_VIEW_IDS.forEach((viewId) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `problems-panel-inner-tab${activeProblemsViewId === viewId ? " active" : ""}`;
        button.dataset.problemsView = viewId;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", activeProblemsViewId === viewId ? "true" : "false");
        button.textContent = `${getProblemsViewLabel(viewId)} ${getDiagnosticsForProblemsView(viewId).length}`;
        button.addEventListener("click", () => {
          activeProblemsViewId = viewId;
          hideContextMenu();
          render();
        });
        tabs.appendChild(button);
      });
      return tabs;
    }

    function ensureProblemsViewTabs() {
      const row = summary?.parentElement;
      if (!row) return;
      row.querySelector(".problems-panel-inner-tabs")?.remove();
      row.insertBefore(createProblemsViewTabs(), row.firstChild || null);
    }

    function groupFileDiagnostics(diagnosticsToGroup) {
      const fileGroups = new Map();
      diagnosticsToGroup.forEach((diagnostic) => {
        const filePath = normalizePath(diagnostic.filePath);
        const key = filePath.toLowerCase();
        if (!fileGroups.has(key)) {
          fileGroups.set(key, {
            type: "file",
            key,
            name: getFileName(filePath),
            detail: getParentPath(filePath),
            diagnostics: []
          });
        }
        fileGroups.get(key).diagnostics.push(diagnostic);
      });
      return Array.from(fileGroups.values());
    }

    function getGroupSeverity(group) {
      if (group.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return "error";
      if (group.diagnostics.some((diagnostic) => diagnostic.severity === "warning")) return "warning";
      return "info";
    }

    function createProblemsTreeGroupHeader(group, options = {}) {
      const collapsible = !!options.collapsible;
      const collapsed = !!options.collapsed;
      const row = document.createElement(collapsible ? "button" : "div");
      row.className = `problems-panel-tree-group problems-panel-tree-group-${group.type} problems-panel-${getGroupSeverity(group)}`;
      row.classList.toggle("problems-panel-tree-group-collapsible", collapsible);
      row.classList.toggle("collapsed", collapsed);
      if (collapsible) row.type = "button";
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const iconClass = group.type === "project" ? "bi-boxes" : "bi-file-earmark-code";
      const disclosureIcon = collapsed ? "bi-chevron-right" : "bi-chevron-down";
      row.innerHTML =
        (collapsible ? `<i class="bi ${disclosureIcon} problems-panel-tree-disclosure" aria-hidden="true"></i>` : "") +
        `<i class="bi ${iconClass} problems-panel-tree-group-icon" aria-hidden="true"></i>` +
        `<span class="problems-panel-tree-group-name"></span>` +
        `<span class="problems-panel-tree-group-detail"></span>` +
        `<span class="problems-panel-tree-group-count"></span>`;
      row.querySelector(".problems-panel-tree-group-name").textContent = group.name;
      row.querySelector(".problems-panel-tree-group-detail").textContent = group.detail;
      row.querySelector(".problems-panel-tree-group-count").textContent = getProblemCountText(group.diagnostics.length);
      if (collapsible) {
        row.addEventListener("click", (event) => {
          event.preventDefault();
          collapsedFileGroupKeys[collapsed ? "delete" : "add"](group.key);
          render();
        });
      }
      return row;
    }

    function createProblemsTreeDiagnosticRow(diagnostic) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `problems-panel-tree-row problems-panel-${diagnostic.severity}`;
      button.classList.toggle("selected", selectedDiagnostics.has(diagnostic));
      button.title = canNavigateDiagnostic(diagnostic) ? `Open ${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}` : diagnostic.message;
      const iconClass = diagnostic.severity === "error"
        ? "bi-x-circle-fill"
        : (diagnostic.severity === "warning" ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill");
      button.setAttribute("role", "treeitem");
      button.setAttribute("aria-selected", selectedDiagnostics.has(diagnostic) ? "true" : "false");
      button.innerHTML =
        `<span class="problems-panel-tree-severity"><i class="bi ${iconClass}" aria-hidden="true"></i></span>` +
        `<span class="problems-panel-tree-message"></span>` +
        `<span class="problems-panel-tree-source"></span>` +
        `<span class="problems-panel-tree-line"></span>`;
      button.querySelector(".problems-panel-tree-severity").setAttribute("aria-label", getSeverityLabel(diagnostic.severity));
      button.querySelector(".problems-panel-tree-message").textContent = diagnostic.message;
      button.querySelector(".problems-panel-tree-source").textContent = diagnostic.source || "";
      button.querySelector(".problems-panel-tree-line").textContent = canNavigateDiagnostic(diagnostic) ? `:${diagnostic.line}` : "";
      button.addEventListener("click", () => void openDiagnostic(diagnostic));
      button.addEventListener("contextmenu", (event) => showContextMenu(event, diagnostic));
      return button;
    }

    function renderProblemsTreeView(viewId, visibleDiagnostics) {
      const list = document.createElement("div");
      list.className = "problems-panel-tree";
      list.setAttribute("role", "tree");
      const groups = viewId === "files"
        ? groupFileDiagnostics(visibleDiagnostics)
        : (visibleDiagnostics.length ? [{ type: "project", name: "Project", detail: "", diagnostics: visibleDiagnostics }] : []);
      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "problems-panel-empty";
        empty.textContent = diagnostics.length ? "No problems match the active filters." : "No problems detected.";
        list.appendChild(empty);
        return list;
      }
      groups.forEach((group) => {
        const collapsed = viewId === "files" && collapsedFileGroupKeys.has(group.key);
        list.appendChild(createProblemsTreeGroupHeader(group, { collapsible: viewId === "files", collapsed }));
        if (!collapsed) {
          group.diagnostics.forEach((diagnostic) => list.appendChild(createProblemsTreeDiagnosticRow(diagnostic)));
        }
      });
      return list;
    }
    function createDiagnosticRow(diagnostic) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `problems-panel-row problems-panel-${diagnostic.severity}`;
      button.classList.toggle("selected", selectedDiagnostics.has(diagnostic));
      button.title = canNavigateDiagnostic(diagnostic) ? `Open ${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}` : diagnostic.message;
      const iconClass = diagnostic.severity === "error"
        ? "bi-x-circle-fill"
        : (diagnostic.severity === "warning" ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill");
      button.setAttribute("role", "row");
      button.setAttribute("aria-selected", selectedDiagnostics.has(diagnostic) ? "true" : "false");
      button.innerHTML =
        `<span class="problems-panel-severity" role="cell"><i class="bi ${iconClass}" aria-hidden="true"></i></span>` +
        `<span class="problems-panel-message" role="cell"></span>` +
        `<span class="problems-panel-file" role="cell"></span>` +
        `<span class="problems-panel-line" role="cell"></span>` +
        `<span class="problems-panel-column" role="cell"></span>` +
        `<span class="problems-panel-source" role="cell"></span>`;
      button.querySelector(".problems-panel-severity").setAttribute("aria-label", getSeverityLabel(diagnostic.severity));
      button.querySelector(".problems-panel-message").textContent = diagnostic.message;
      button.querySelector(".problems-panel-file").textContent = diagnostic.filePath || "Project";
      button.querySelector(".problems-panel-line").textContent = canNavigateDiagnostic(diagnostic) ? String(diagnostic.line) : "";
      button.querySelector(".problems-panel-column").textContent = canNavigateDiagnostic(diagnostic) ? String(diagnostic.column) : "";
      button.querySelector(".problems-panel-source").textContent = diagnostic.source || "";
      button.addEventListener("click", () => void openDiagnostic(diagnostic));
      button.addEventListener("contextmenu", (event) => showContextMenu(event, diagnostic));
      return button;
    }

    function isProblemsPanelActive() {
      return bottomPanel?.isPanelVisible?.() === true
        && bottomPanel?.getActiveTabId?.() === "problems"
        && view?.hidden !== true;
    }

    function canConsumeJdtDiagnostics() {
      return jdtAnalysisReady && !jdtDiagnosticsSuspended;
    }

    function resetJdtSnapshot(options = {}) {
      jdtQueryGeneration += 1;
      jdtSummary = null;
      jdtSnapshotId = "";
      jdtSnapshotRevision = 0;
      jdtLoadedCount = 0;
      jdtUpdatesAvailable = false;
      jdtInitialLoadPending = false;
      jdtInitialLoadPromise = null;
      jdtInitialLoadState = "idle";
      jdtSnapshotSyncPending = false;
      jdtSnapshotSyncQueued = false;
      if (options.discardPending === true) pendingJdtSummary = null;
      clearDiagnosticCollection(JDT_COLLECTION_OWNER, { revealErrors: false });
    }

    function consumePendingJdtSummary() {
      if (!canConsumeJdtDiagnostics() || !pendingJdtSummary) return;
      const nextSummary = pendingJdtSummary;
      pendingJdtSummary = null;
      acceptJdtSummary(nextSummary);
    }

    /** Gate project-wide JDT diagnostics until managed-project import is complete. */
    function setJdtAnalysisReady(ready, options = {}) {
      jdtAnalysisReady = ready === true;
      if (!jdtAnalysisReady) {
        if (options.discardPending === true) pendingJdtSummary = null;
        renderSummary();
        return;
      }
      consumePendingJdtSummary();
    }

    /** Temporarily quarantine JDT snapshots while an overlapping project build runs. */
    function setJdtDiagnosticsSuspended(suspended, options = {}) {
      jdtDiagnosticsSuspended = suspended === true;
      if (jdtDiagnosticsSuspended) {
        if (options.discardPending === true) pendingJdtSummary = null;
        renderSummary();
        return;
      }
      if (options.discardPending === true) pendingJdtSummary = null;
      consumePendingJdtSummary();
    }

    /** Display generation progress without replacing the last committed problem rows. */
    function setAnalysisGenerationState(nextState = {}) {
      const previousWorkspaceRoot = normalizePath(analysisGenerationState.workspaceRoot);
      const nextWorkspaceRoot = normalizePath(nextState.workspaceRoot);
      if (previousWorkspaceRoot && previousWorkspaceRoot !== nextWorkspaceRoot) resetJdtSnapshot({ discardPending: true });
      analysisGenerationState = {
        status: String(nextState.status || "idle"),
        workspaceRoot: String(nextState.workspaceRoot || ""),
        generationId: Number(nextState.generationId) || 0,
        failure: nextState.failure || null
      };
      notifyAnalysisFailure(analysisGenerationState);
      renderSummary();
    }

    function acceptJdtSummary(nextSummary) {
      const activeProject = normalizePath(deps.getActiveProjectPath?.());
      if (nextSummary?.workspaceRoot && normalizePath(nextSummary.workspaceRoot) !== activeProject) return;
      if (nextSummary?.analysisAvailable === false) {
        pendingJdtSummary = null;
        resetJdtSnapshot({ discardPending: true });
        return;
      }
      if (!canConsumeJdtDiagnostics()) {
        pendingJdtSummary = nextSummary || null;
        return;
      }
      if (jdtSummary && Number(nextSummary?.revision) < Number(jdtSummary.revision)) return;
      jdtSummary = nextSummary || null;
      if (jdtSnapshotId && Number(nextSummary?.revision) > jdtSnapshotRevision) {
        jdtUpdatesAvailable = true;
        if (jdtActivated && isProblemsPanelActive()) void syncJdtSnapshot();
      }
      renderSummary();
      if (jdtActivated && isProblemsPanelActive() && (!jdtSnapshotId || jdtLoadedCount === 0) && !jdtInitialLoadPending) {
        void loadJdtProblems(getInitialJdtProblemLimit());
      }
    }

    function getJdtProblemRetryDelays() {
      const configured = deps.getJdtProblemRetryDelays?.();
      return Array.isArray(configured) ? configured : DEFAULT_JDT_PROBLEM_RETRY_DELAYS_MS;
    }

    function waitForJdtProblemRetry(delayMs) {
      return new Promise((resolve) => global.setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
    }

    /** Query one stable Problems page and retry transient first-page failures. */
    async function performJdtProblemsLoad(limit, offset, options) {
      if (!canConsumeJdtDiagnostics() || !isProblemsPanelActive()) return [];
      const projectPath = normalizePath(deps.getActiveProjectPath?.());
      const generation = ++jdtQueryGeneration;
      const requestedSnapshotId = String(options.snapshotId || "");
      let result = null;
      const retryDelays = offset === 0 ? getJdtProblemRetryDelays() : [];
      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        try {
          result = await deps.getJdtProblems?.({ workspaceRoot: projectPath, offset, limit, snapshotId: requestedSnapshotId });
          break;
        } catch (_error) {
          if (generation !== jdtQueryGeneration || !isProblemsPanelActive()) return [];
          if (attempt >= retryDelays.length) {
            if (offset === 0) {
              jdtInitialLoadState = "failed";
              renderSummary();
            }
            return [];
          }
          if (offset === 0) {
            jdtInitialLoadState = "retrying";
            renderSummary();
          }
          await waitForJdtProblemRetry(retryDelays[attempt]);
        }
      }
      if (!result || generation !== jdtQueryGeneration || !isProblemsPanelActive()) return [];
      if (result.stale === true) {
        if (offset === 0) {
          jdtSnapshotId = "";
          jdtSnapshotRevision = 0;
        }
        return performJdtProblemsLoad(limit, 0, {});
      }
      if (projectPath !== normalizePath(deps.getActiveProjectPath?.())) return [];
      if (offset > 0 && (!requestedSnapshotId || String(result.snapshotId || "") !== requestedSnapshotId)) return [];
      const latestObservedRevision = Number(jdtSummary?.revision || 0);
      jdtSummary = {
        ...jdtSummary,
        revision: Math.max(latestObservedRevision, Number(result.revision) || 0),
        totalCount: result.totalCount,
        availableCount: result.availableCount,
        maximumProblems: result.maximumProblems
      };
      jdtSnapshotId = String(result.snapshotId || "");
      jdtSnapshotRevision = Number(result.snapshotRevision ?? result.revision) || 0;
      jdtUpdatesAvailable = latestObservedRevision > jdtSnapshotRevision;
      const existingProblems = offset > 0
        ? diagnosticCollections.get(JDT_COLLECTION_OWNER)?.diagnostics || []
        : [];
      const existingProblemIds = new Set(existingProblems.map((problem) => problem.problemId).filter(Boolean));
      const appendedProblems = result.problems.filter((problem) => !problem.problemId || !existingProblemIds.has(problem.problemId));
      const nextProblems = existingProblems.concat(appendedProblems);
      if (offset === 0 && requestedSnapshotId && nextProblems.length === 0 && Number(result.totalCount) > 0) {
        jdtSnapshotId = "";
      }
      jdtLoadedCount = nextProblems.length;
      if (offset === 0) jdtInitialLoadState = "idle";
      const renderedProblems = setDiagnosticCollection(JDT_COLLECTION_OWNER, nextProblems, { persistent: false, revealErrors: false });
      if (jdtUpdatesAvailable && !jdtInitialLoadPending && !jdtSnapshotSyncPending && jdtActivated && isProblemsPanelActive()) void syncJdtSnapshot();
      return renderedProblems;
    }

    function loadJdtProblems(limit = getInitialJdtProblemLimit(), offset = 0, options = {}) {
      if (offset !== 0) return performJdtProblemsLoad(limit, offset, options);
      if (jdtInitialLoadPromise) return jdtInitialLoadPromise;
      jdtInitialLoadPending = true;
      jdtInitialLoadState = "loading";
      renderSummary();
      const pending = performJdtProblemsLoad(limit, offset, options);
      const tracked = pending.finally(() => {
        if (jdtInitialLoadPromise !== tracked) return;
        jdtInitialLoadPending = false;
        jdtInitialLoadPromise = null;
        if (!jdtSnapshotId && jdtLoadedCount === 0 && Number(jdtSummary?.totalCount) > 0 && jdtActivated && isProblemsPanelActive()) {
          void loadJdtProblems(getInitialJdtProblemLimit());
          return;
        }
        if (jdtUpdatesAvailable && !jdtSnapshotSyncPending && jdtActivated && isProblemsPanelActive()) void syncJdtSnapshot();
      });
      jdtInitialLoadPromise = tracked;
      return tracked;
    }

    /** Reconcile removals while allowing a new snapshot to fill only to its current visible ceiling. */
    async function syncJdtSnapshot() {
      if (!jdtSnapshotId || !canConsumeJdtDiagnostics() || !isProblemsPanelActive()) return [];
      if (jdtInitialLoadPending) {
        jdtSnapshotSyncQueued = true;
        return [];
      }
      if (jdtSnapshotSyncPending) {
        jdtSnapshotSyncQueued = true;
        return [];
      }
      jdtSnapshotSyncPending = true;
      try {
        return await loadJdtProblems(Math.max(getInitialJdtProblemLimit(), jdtLoadedCount), 0, { snapshotId: jdtSnapshotId });
      } finally {
        jdtSnapshotSyncPending = false;
        if (jdtSnapshotSyncQueued) {
          jdtSnapshotSyncQueued = false;
          void syncJdtSnapshot();
        }
      }
    }

    async function refreshJdtProblems() {
      jdtQueryGeneration += 1;
      jdtSnapshotId = "";
      jdtSnapshotRevision = 0;
      jdtUpdatesAvailable = false;
      // Re-drive the aggregation before re-querying: a manual refresh must recover
      // even when the broker snapshot froze after a provider failure.
      await deps.requestProblemsRefresh?.();
      return loadJdtProblems(getInitialJdtProblemLimit());
    }

    function render() {
      renderSummary();
      ensureProblemsViewTabs();
      ensureFilterControls();
      ensureReloadButton();
      ensureFileGroupsToggleButton();
      if (!body) return;
      const visibleDiagnostics = getDiagnosticsForProblemsView(activeProblemsViewId);
      body.textContent = "";
      if (activeProblemsViewId !== "problems") {
        body.appendChild(renderProblemsTreeView(activeProblemsViewId, visibleDiagnostics));
        return;
      }
      body.appendChild(createHeader());
      if (!diagnostics.length || !visibleDiagnostics.length) {
        const empty = document.createElement("div");
        empty.className = "problems-panel-empty";
        empty.textContent = diagnostics.length ? "No problems match the active filters." : "No problems detected.";
        body.appendChild(empty);
        return;
      }
      if (!diagnosticCollections.has(JDT_COLLECTION_OWNER) || visibleDiagnostics.length <= JDT_SYNC_RENDER_LIMIT) {
        visibleDiagnostics.forEach((diagnostic) => body.appendChild(createDiagnosticRow(diagnostic)));
        return;
      }
      const generation = ++rowRenderGeneration;
      let offset = 0;
      function appendBatch() {
        if (generation !== rowRenderGeneration || !isProblemsPanelActive()) return;
        const fragment = document.createDocumentFragment();
        visibleDiagnostics.slice(offset, offset + JDT_RENDER_BATCH_SIZE)
          .forEach((diagnostic) => fragment.appendChild(createDiagnosticRow(diagnostic)));
        body.appendChild(fragment);
        offset += JDT_RENDER_BATCH_SIZE;
        if (offset < visibleDiagnostics.length) global.setTimeout(appendBatch, 0);
      }
      appendBatch();
    }
    function setDiagnostics(nextDiagnostics, options = {}) {
      return setDiagnosticCollection("project", nextDiagnostics, { ...options, persistent: true });
    }

    async function persistDiagnostics(projectPath) {
      const root = normalizePath(projectPath);
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (!root || !canPersistDiagnostics()) return false;
      try {
        await Neutralino.filesystem.createDirectory(joinPath(root, ".md-editor"));
      } catch (_error) {
        // Existing project metadata folders are valid.
      }
      try {
        await Neutralino.filesystem.writeFile(getPersistencePath(root), JSON.stringify({
          schemaVersion: 1,
          type: "md-editor-problems",
          updatedAt: new Date().toISOString(),
          diagnostics: diagnosticCollections.get("project")?.diagnostics || []
        }, null, 2) + "\n");
        return true;
      } catch (error) {
        console.warn("Failed to persist project problems:", error);
        return false;
      }
    }

    /** Replace the visible diagnostics and persist them for the active project. */
    async function setPersistentDiagnostics(nextDiagnostics, options = {}) {
      const projectPath = normalizePath(options.projectPath || deps.getActiveProjectPath?.());
      restoreGeneration += 1;
      loadedProjectPath = projectPath;
      const result = setDiagnostics(nextDiagnostics, options);
      await persistDiagnostics(projectPath);
      return result;
    }

    /** Restore the most recent compile diagnostics for a project folder. */
    async function restoreForProject(projectPath, options = {}) {
      const root = normalizePath(projectPath);
      if (root !== loadedProjectPath) {
        jdtQueryGeneration += 1;
        jdtSummary = null;
        jdtLoadedCount = 0;
        jdtSnapshotId = "";
        jdtSnapshotRevision = 0;
        jdtUpdatesAvailable = false;
        diagnosticCollections.delete(JDT_COLLECTION_OWNER);
      }
      if (!root) {
        restoreGeneration += 1;
        loadedProjectPath = "";
        setDiagnostics([], { revealErrors: false });
        return [];
      }
      if (!options.force && loadedProjectPath === root) return diagnostics.slice();
      loadedProjectPath = root;
      const generation = ++restoreGeneration;
      if (!canPersistDiagnostics()) return setDiagnostics([], { revealErrors: false });
      let restored = [];
      try {
        const Neutralino = deps.Neutralino || global.Neutralino;
        const payload = JSON.parse(await Neutralino.filesystem.readFile(getPersistencePath(root)));
        if (payload?.type === "md-editor-problems" && Array.isArray(payload.diagnostics)) restored = payload.diagnostics;
      } catch (_error) {
        // A project without saved compile diagnostics starts with an empty panel.
      }
      if (generation !== restoreGeneration || loadedProjectPath !== root) return diagnostics.slice();
      return setDiagnostics(restored, { revealErrors: false });
    }

    function clear() {
      return setDiagnostics([], { revealErrors: false });
    }

    function addProblemsTab(options = {}) {
      bottomPanel?.addTab?.({
        id: "problems",
        title: "Problems",
        icon: "bi-exclamation-triangle",
        view,
        permanent: true,
        activate: options.activate === true,
        onActivate() {
          jdtActivated = true;
          render();
          if ((!jdtSnapshotId || jdtLoadedCount === 0) && !jdtInitialLoadPending) void loadJdtProblems(getInitialJdtProblemLimit());
        }
      });
    }

    function show() {
      if (!bottomPanel?.hasTab?.("problems")) {
        addProblemsTab({ activate: true });
        return true;
      }
      return bottomPanel?.activateTab?.("problems") || null;
    }

    if (bottomPanel && view) {
      addProblemsTab();
    }
    deps.subscribeJdtDiagnosticSummary?.(acceptJdtSummary);
    render();
    contextMenu = createContextMenu();

    const api = {
      clear,
      clearDiagnosticCollection,
      getPersistencePath,
      restoreForProject,
      setDiagnostics,
      setDiagnosticCollection,
      setPersistentDiagnostics,
      setAnalysisGenerationState,
      setJdtAnalysisReady,
      setJdtDiagnosticsSuspended,
      show,
      getDiagnostics() {
        return diagnostics.slice();
      },
      getProblemFilters() {
        return { ...problemFilters };
      },
      clearProblemFilters
    };
    app.registerModule?.("problemsPanel", api);
    void restoreForProject(deps.getActiveProjectPath?.() || "");
    return api;
  }

  global.registerMarkdownViewerProblemsPanel = registerMarkdownViewerProblemsPanel;
})(typeof window !== "undefined" ? window : globalThis);
