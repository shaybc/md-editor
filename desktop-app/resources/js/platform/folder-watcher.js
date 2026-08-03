(function(window) {
  "use strict";

  function registerMarkdownViewerFolderWatcher(app, deps) {
    var activeWatcherId = null;
    var activeWatcherPath = "";
    var tabWatchersByPath = new Map();
    var watcherScopes = new Map();
    var pendingEvents = [];
    var pendingTimer = null;
    var isProcessing = false;
    var listenerAttached = false;
    var tabSyncTimer = null;
    var suppressUntil = 0;
    var DEBOUNCE_MS = 250;
    var PROMPT_THROTTLE_MS = 5000;
    var recentPromptTimesByPath = new Map();
    var pendingChangedOpenTabPaths = new Map();
    var workspaceActivityClient = deps.workspaceActivityClient || null;
    var workspaceActivityId = "";
    var workspaceDerivedRoots = [];
    var workspacePatchQueue = Promise.resolve();

    function getNeutralino() {
      return typeof deps.Neutralino !== "undefined" ? deps.Neutralino : null;
    }

    function isDesktopRuntime() {
      return typeof deps.isNeutralinoRuntime === "function"
        ? deps.isNeutralinoRuntime()
        : typeof deps.NL_VERSION !== "undefined";
    }

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
    }

    function getComparablePath(path) {
      return normalizePath(path).toLowerCase();
    }

    function joinPath(folderPath, name) {
      var folder = normalizePath(folderPath);
      var child = String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return folder ? folder + "/" + child : child;
    }

    function getParentPath(path) {
      var normalized = normalizePath(path);
      var index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : "";
    }

    function isSamePath(left, right) {
      return getComparablePath(left) === getComparablePath(right);
    }

    function getFileName(path) {
      return typeof deps.getFileName === "function"
        ? deps.getFileName(path)
        : (String(path || "").split(/[\\/]/).pop() || "");
    }

    function getFilePromptLabel(path) {
      var name = getFileName(path);
      return name && name !== path ? name + " (" + path + ")" : String(path || "This file");
    }

    function isInsideActiveFolder(path) {
      var activePath = normalizePath(deps.activeFolderPath || activeWatcherPath || "");
      var targetPath = normalizePath(path);
      return !!activePath && (targetPath === activePath || targetPath.startsWith(activePath + "/"));
    }

    function getTabSourcePath(tab) {
      return tab && (tab.sourceFilePath || (tab.openedSource && tab.openedSource.path) || "");
    }

    function getOpenTabWatcherParentPaths() {
      var parentPaths = new Map();
      (deps.tabs || []).forEach(function(tab) {
        if (!tab || tab.type === "graph") return;
        var sourcePath = normalizePath(getTabSourcePath(tab));
        if (!sourcePath || isInsideActiveFolder(sourcePath)) return;
        var parentPath = getParentPath(sourcePath);
        if (parentPath) parentPaths.set(getComparablePath(parentPath), parentPath);
      });
      return parentPaths;
    }

    function getEventPath(eventDetail) {
      return joinPath(eventDetail && eventDetail.dir, eventDetail && eventDetail.filename);
    }

    function getMovedOldPath(eventDetail) {
      if (!eventDetail || !eventDetail.oldFilename) return "";
      return joinPath(eventDetail.dir || "", eventDetail.oldFilename);
    }

    function isGraphRelevantPath(path) {
      if (!path) return false;
      if (typeof deps.isMarkdownPath === "function" && deps.isMarkdownPath(path)) return true;
      if (typeof deps.isGraphFilePath === "function" && deps.isGraphFilePath(path)) return true;
      return /\.(md|markdown|mdviewer-graph\.json|mdgraph\.json)$/i.test(path);
    }

    function isLikelyFolderPath(path) {
      var name = getFileName(path);
      return !!name && !/\.[^./\\]+$/i.test(name);
    }

    function isGraphRelevantFolderEvent(eventDetail) {
      var path = getEventPath(eventDetail);
      var oldPath = getMovedOldPath(eventDetail);
      if (eventDetail && eventDetail.action === "modified") {
        return isGraphRelevantPath(path) || isGraphRelevantPath(oldPath);
      }
      return isGraphRelevantPath(path)
        || isGraphRelevantPath(oldPath)
        || isLikelyFolderPath(path)
        || isLikelyFolderPath(oldPath);
    }

    function findTabsForPath(path, kind) {
      var targetKey = getComparablePath(path);
      if (!targetKey) return [];
      return (deps.tabs || []).filter(function(tab) {
        if (!tab || tab.type === "graph") return false;
        var tabPathKey = getComparablePath(tab.sourceFilePath || (tab.openedSource && tab.openedSource.path) || "");
        if (!tabPathKey) return false;
        return kind === "folder"
          ? (tabPathKey === targetKey || tabPathKey.startsWith(targetKey + "/"))
          : tabPathKey === targetKey;
      });
    }

    function updateTabPathAfterMove(oldPath, newPath) {
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      var oldName = getFileName(oldPath);
      var newName = getFileName(newPath);
      if (sidebarTree && sidebarTree.updateTabsAfterSidebarFileRename) {
        sidebarTree.updateTabsAfterSidebarFileRename({ name: oldName, fullPath: oldPath }, oldPath, newPath, newName);
        return true;
      }
      var changed = false;
      findTabsForPath(oldPath, "file").forEach(function(tab) {
        tab.sourceFileName = newName;
        tab.sourceFilePath = newPath;
        if (tab.openedSource) {
          tab.openedSource = Object.assign({}, tab.openedSource, { path: newPath, name: newName });
        }
        tab.title = newName.replace(/\.(md|markdown)$/i, "") || newName;
        changed = true;
      });
      if (changed) {
        if (typeof deps.saveTabsToStorage === "function") deps.saveTabsToStorage(deps.tabs || []);
        if (typeof deps.renderTabBar === "function") deps.renderTabBar(deps.tabs || [], deps.activeTabId);
        if (typeof deps.updateSaveCurrentFileButtons === "function") deps.updateSaveCurrentFileButtons();
      }
      return changed;
    }

    function isTabDirty(tab) {
      var normalize = typeof deps.normalizeEditorContent === "function"
        ? deps.normalizeEditorContent
        : function(value) { return String(value || ""); };
      return normalize((tab && tab.content) || "") !== normalize((tab && tab.savedContent) || "");
    }

    function getExternalFileChangeBehavior() {
      return typeof deps.getExternalFileChangeBehavior === "function"
        ? deps.getExternalFileChangeBehavior()
        : "prompt";
    }

    function rememberChangedOpenTabPath(path) {
      var pathKey = getComparablePath(path);
      if (!pathKey || !findTabsForPath(path, "file").length) return;
      pendingChangedOpenTabPaths.set(pathKey, path);
    }

    function forgetChangedOpenTabPath(path) {
      var pathKey = getComparablePath(path);
      if (pathKey) pendingChangedOpenTabPaths.delete(pathKey);
    }

    function getPendingChangedOpenTabPaths() {
      var paths = [];
      pendingChangedOpenTabPaths.forEach(function(path, pathKey) {
        if (findTabsForPath(path, "file").length) {
          paths.push(path);
        } else {
          pendingChangedOpenTabPaths.delete(pathKey);
        }
      });
      return paths;
    }

    function hasDirtyOpenTabsForPaths(paths) {
      return (paths || []).some(function(path) {
        return findTabsForPath(path, "file").some(isTabDirty);
      });
    }

    function rememberBatchChangedOpenTabPaths(events) {
      (events || []).forEach(function(eventDetail) {
        var scope = eventDetail && eventDetail._watchScope || {};
        if (eventDetail && eventDetail.action === "modified" && (!scope.type || scope.type === "tabs" || scope.type === "folder")) {
          rememberChangedOpenTabPath(getEventPath(eventDetail));
        }
      });
    }

    function shouldSkipRecentPrompt(path) {
      var pathKey = getComparablePath(path);
      if (!pathKey) return false;
      var now = Date.now();
      var lastPromptTime = recentPromptTimesByPath.get(pathKey);
      if (Number.isFinite(lastPromptTime) && now - lastPromptTime < PROMPT_THROTTLE_MS) return true;
      recentPromptTimesByPath.set(pathKey, now);
      return false;
    }

    async function confirmFileWatcherAction(message, options) {
      if (typeof app?.services?.confirm === "function") {
        return app.services.confirm(Object.assign({ message: message }, options || {}));
      }
      return typeof window.confirm === "function" ? window.confirm(message) : false;
    }

    async function promptReloadFileAction(path, dirty) {
      var fileLabel = getFilePromptLabel(path);
      var pendingPaths = getPendingChangedOpenTabPaths();
      var hasMultiplePendingFiles = pendingPaths.length > 1;
      var message = dirty
        ? fileLabel + " changed on disk and has unsaved edits in MD-Editor. Reload it from disk and discard the in-app edits?"
        : fileLabel + " changed on disk. Reload it from disk?";
      if (hasMultiplePendingFiles) {
        message += "\n\nReload All will reload " + pendingPaths.length + " changed open files.";
      }
      if (hasDirtyOpenTabsForPaths(pendingPaths)) {
        message += "\n\nReload All will discard unsaved edits in changed open files.";
      }

      if (typeof app?.services?.notify?.show === "function") {
        var result = await app.services.notify.show({
          title: "Reload File",
          message: message,
          dismissValue: "cancel",
          buttons: [
            { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
            { id: "reload", label: "Reload", value: "reload", variant: "secondary" },
            { id: "reload-all", label: "Reload All", value: "reload-all", variant: "primary", autoFocus: true }
          ]
        });
        return result === "reload-all" || result === "reload" ? result : "cancel";
      }

      var shouldReload = await confirmFileWatcherAction(message, {
        title: "Reload File",
        confirmLabel: "Reload",
        cancelLabel: "Cancel"
      });
      return shouldReload ? "reload" : "cancel";
    }
    function updateActiveEditorIfNeeded(tab) {
      if (!tab || tab.id !== deps.activeTabId) return;
      if (typeof deps.setActiveEditorContent === "function") deps.setActiveEditorContent(tab.content || "");
      if (typeof deps.renderEditorSyntaxHighlights === "function") deps.renderEditorSyntaxHighlights();
      if (typeof deps.updateEditorLineNumbers === "function") deps.updateEditorLineNumbers();
      if (typeof deps.renderMarkdown === "function") deps.renderMarkdown();
    }

    async function reloadOpenTabFromDisk(tab, path) {
      var Neutralino = getNeutralino();
      if (!tab || !path || !Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.readFile) return false;
      var content = await Neutralino.filesystem.readFile(path);
      var normalize = typeof deps.normalizeEditorContent === "function"
        ? deps.normalizeEditorContent
        : function(value) { return String(value || ""); };
      var normalized = normalize(content);
      tab.content = normalized;
      tab.savedContent = normalized;
      tab.sourceFileName = getFileName(path);
      tab.sourceFilePath = path;
      if (tab.openedSource) {
        tab.openedSource = Object.assign({}, tab.openedSource, {
          path: path,
          name: tab.sourceFileName
        });
      }
      if (tab.id === deps.activeTabId) {
        updateActiveEditorIfNeeded(tab);
      } else if (typeof deps.destroyTabView === "function") {
        deps.destroyTabView(tab.id);
      }
      return true;
    }

    function persistOpenTabReloadChanges() {
      if (typeof deps.saveTabsToStorage === "function") deps.saveTabsToStorage(deps.tabs || []);
      if (typeof deps.renderTabBar === "function") deps.renderTabBar(deps.tabs || [], deps.activeTabId);
      if (typeof deps.updateSaveCurrentFileButtons === "function") deps.updateSaveCurrentFileButtons();
    }

    async function reloadOpenTabsForPathFromDisk(path) {
      var openTabs = findTabsForPath(path, "file");
      if (!openTabs.length) return false;
      var changed = false;
      for (var index = 0; index < openTabs.length; index += 1) {
        changed = await reloadOpenTabFromDisk(openTabs[index], path) || changed;
      }
      if (changed) forgetChangedOpenTabPath(path);
      return changed;
    }

    async function reloadPendingChangedOpenTabsFromDisk() {
      var paths = getPendingChangedOpenTabPaths();
      var changed = false;
      for (var index = 0; index < paths.length; index += 1) {
        changed = await reloadOpenTabsForPathFromDisk(paths[index]) || changed;
      }
      return changed;
    }

    async function handleOpenTabModified(path) {
      var openTabs = findTabsForPath(path, "file");
      if (!openTabs.length) return false;
      var changed = false;
      for (var index = 0; index < openTabs.length; index += 1) {
        var tab = openTabs[index];
        if (!pendingChangedOpenTabPaths.has(getComparablePath(path))) continue;
        var behavior = getExternalFileChangeBehavior();
        if (behavior === "ignore") {
          forgetChangedOpenTabPath(path);
          continue;
        }
        var dirty = isTabDirty(tab);
        if (behavior === "auto-refresh" && !dirty) {
          changed = await reloadOpenTabsForPathFromDisk(path) || changed;
          continue;
        }
        if (shouldSkipRecentPrompt(path)) continue;
        var reloadAction = await promptReloadFileAction(path, dirty);
        if (reloadAction === "reload-all") {
          changed = await reloadPendingChangedOpenTabsFromDisk() || changed;
        } else if (reloadAction === "reload") {
          changed = await reloadOpenTabsForPathFromDisk(path) || changed;
        }
      }
      if (changed) {
        persistOpenTabReloadChanges();
      }
      return changed;
    }

    async function reloadOpenTabsFromDisk(path) {
      var changed = await reloadOpenTabsForPathFromDisk(path);
      if (changed) {
        persistOpenTabReloadChanges();
      }
      return changed;
    }

    function keepDeletedTab(tab) {
      if (!tab) return;
      tab.sourceFilePath = null;
      tab.sourceFileHandle = null;
      tab.isOpenFolderFile = false;
      if (tab.openedSource) tab.openedSource = Object.assign({}, tab.openedSource, { path: null });
      if (!isTabDirty(tab)) tab.savedContent = "";
      updateActiveEditorIfNeeded(tab);
    }

    async function handleOpenTabsDeleted(path, kind) {
      var openTabs = findTabsForPath(path, kind);
      if (!openTabs.length) return false;
      var changed = false;
      for (var index = 0; index < openTabs.length; index += 1) {
        var tab = openTabs[index];
        var keep = await confirmFileWatcherAction(
          getFilePromptLabel(getTabSourcePath(tab) || path) + " no longer exists. Keep this file tab open?",
          { title: "File Deleted", confirmLabel: "Keep Open", cancelLabel: "Close Tab" }
        );
        if (keep) {
          keepDeletedTab(tab);
        } else if (typeof deps.closeTab === "function") {
          deps.closeTab(tab.id, { promptForUnsaved: false });
        }
        changed = true;
      }
      if (changed) {
        if (typeof deps.saveTabsToStorage === "function") deps.saveTabsToStorage(deps.tabs || []);
        if (typeof deps.renderTabBar === "function") deps.renderTabBar(deps.tabs || [], deps.activeTabId);
        if (typeof deps.updateSaveCurrentFileButtons === "function") deps.updateSaveCurrentFileButtons();
      }
      return changed;
    }

    async function processTabEvent(eventDetail) {
      var path = getEventPath(eventDetail);
      if (!path) return false;
      if (eventDetail.action === "modified") {
        return await handleOpenTabModified(path);
      }
      if (eventDetail.action === "delete") {
        return await handleOpenTabsDeleted(path, "file") || await handleOpenTabsDeleted(path, "folder");
      }
      if (eventDetail.action === "moved") {
        var oldPath = getMovedOldPath(eventDetail);
        if (!oldPath) return false;
        return updateTabPathAfterMove(oldPath, path);
      }
      return false;
    }

    async function getPathKind(path) {
      var Neutralino = getNeutralino();
      if (!path || !Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.getStats) return "file";
      try {
        var stats = await Neutralino.filesystem.getStats(path);
        if (stats && stats.isDirectory) return "folder";
        return "file";
      } catch (_) {
        return "unknown";
      }
    }

    async function normalizeDeleteEvent(eventDetail) {
      if (!eventDetail || eventDetail.action !== "delete") return eventDetail;
      var Neutralino = getNeutralino();
      if (!Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.getStats) return eventDetail;
      try {
        await Neutralino.filesystem.getStats(getEventPath(eventDetail));
        // Native watchers can report a transient delete while Java tooling updates a project.
        // Preserve a path that still exists and refresh its metadata instead of removing it.
        return Object.assign({}, eventDetail, { action: "modified" });
      } catch (_) {
        return eventDetail;
      }
    }

    async function addPath(path) {
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      if (!sidebarTree || !sidebarTree.createFilesystemTreeNode || !sidebarTree.upsertCreatedPathInFolderTree) return false;
      var kind = await getPathKind(path);
      if (kind === "unknown") return false;
      var node = await sidebarTree.createFilesystemTreeNode(path, { scanDirectory: kind === "folder" });
      if (!node) return false;
      return sidebarTree.upsertCreatedPathInFolderTree(node) === true;
    }

    async function deleteTreePath(path) {
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      if (!sidebarTree || !sidebarTree.removeDeletedPathFromFolderTree) return false;
      var removedFile = sidebarTree.removeDeletedPathFromFolderTree(path, { kind: "file" }) === true;
      var removedFolder = sidebarTree.removeDeletedPathFromFolderTree(path, { kind: "folder" }) === true;
      return removedFile || removedFolder;
    }

    async function moveTreePath(oldPath, newPath) {
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      if (!sidebarTree || !sidebarTree.updateRenamedPathInFolderTree) return false;
      var kind = await getPathKind(newPath);
      if (kind === "unknown") {
        await reconcileParent(getParentPath(oldPath));
        await reconcileParent(getParentPath(newPath));
        return true;
      }
      var treeKind = kind === "folder" ? "folder" : "file";
      var changed = await sidebarTree.updateRenamedPathInFolderTree({
        kind: treeKind,
        oldPath: oldPath,
        newPath: newPath,
        oldName: getFileName(oldPath),
        newName: getFileName(newPath)
      });
      if (changed) return true;
      await reconcileParent(getParentPath(oldPath));
      await reconcileParent(getParentPath(newPath));
      return true;
    }

    async function modifyTreePath(path) {
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      var changed = false;
      if (sidebarTree && sidebarTree.updateModifiedPathInFolderTree) {
        changed = await sidebarTree.updateModifiedPathInFolderTree(path) === true;
      }
      return changed;
    }

    async function reconcileParent(parentPath) {
      if (!parentPath || !isInsideActiveFolder(parentPath)) return false;
      var sidebarTree = app.modules && app.modules.sidebarContextTree;
      if (!sidebarTree || !sidebarTree.reconcileFolderTreeParentFromDisk) return false;
      return await sidebarTree.reconcileFolderTreeParentFromDisk(parentPath);
    }

    async function processTreeEvent(eventDetail) {
      if (!deps.isFolderOpen) return { changed: false, parentPath: "" };
      var path = getEventPath(eventDetail);
      if (!path || !isInsideActiveFolder(path)) return { changed: false, parentPath: "" };
      if (eventDetail.action === "add") {
        return { changed: await addPath(path), parentPath: getParentPath(path) };
      }
      if (eventDetail.action === "delete") {
        return { changed: await deleteTreePath(path), parentPath: "" };
      }
      if (eventDetail.action === "moved") {
        var oldPath = getMovedOldPath(eventDetail);
        if (oldPath) return { changed: await moveTreePath(oldPath, path), parentPath: "" };
        return { changed: false, parentPath: getParentPath(path) };
      }
      if (eventDetail.action === "modified") {
        return { changed: await modifyTreePath(path), parentPath: "" };
      }
      return { changed: false, parentPath: getParentPath(path) };
    }

    async function processBatch(events) {
      if (!events.length) return;
      var normalizedEvents = [];
      for (var normalizeIndex = 0; normalizeIndex < events.length; normalizeIndex += 1) {
        normalizedEvents.push(await normalizeDeleteEvent(events[normalizeIndex]));
      }
      rememberBatchChangedOpenTabPaths(normalizedEvents);
      var treeChanged = false;
      var graphRelevantTreeChanged = false;
      var tabsChanged = false;
      var parentsToReconcile = new Set();
      for (var index = 0; index < normalizedEvents.length; index += 1) {
        var eventDetail = normalizedEvents[index];
        var path = getEventPath(eventDetail);
        if (!path) continue;
        var scope = eventDetail._watchScope || {};
        try {
          if (!scope.type || scope.type === "folder") {
            var treeResult = await processTreeEvent(eventDetail);
            treeChanged = treeResult.changed || treeChanged;
            graphRelevantTreeChanged = (treeResult.changed && isGraphRelevantFolderEvent(eventDetail)) || graphRelevantTreeChanged;
            if (treeResult.parentPath) parentsToReconcile.add(treeResult.parentPath);
          }
          if (!scope.type || scope.type === "tabs" || scope.type === "folder") {
            tabsChanged = await processTabEvent(eventDetail) || tabsChanged;
          }
        } catch (error) {
          console.warn("Folder watcher failed to apply event:", eventDetail, error);
          if (!scope.type || scope.type === "folder") parentsToReconcile.add(getParentPath(path));
        }
      }

      for (var parentPath of parentsToReconcile) {
        treeChanged = await reconcileParent(parentPath) || treeChanged;
      }

      if (tabsChanged) await syncOpenTabWatchers();

      if (treeChanged) {
        if (typeof deps.renderLinkAutocomplete === "function") deps.renderLinkAutocomplete();
        if (typeof deps.refreshFolderTagCounts === "function") await deps.refreshFolderTagCounts();
        if (graphRelevantTreeChanged && typeof deps.refreshOpenFolderGraphTabsFromFolderFiles === "function") await deps.refreshOpenFolderGraphTabsFromFolderFiles();
      }
    }

    async function flush() {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
      if (isProcessing) return;
      var events = pendingEvents.splice(0);
      if (!events.length) return;
      isProcessing = true;
      try {
        await processBatch(events);
      } finally {
        isProcessing = false;
        if (pendingEvents.length) scheduleFlush();
      }
    }

    function scheduleFlush() {
      window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(flush, DEBOUNCE_MS);
    }

    function onWatchFile(event) {
      var detail = (event && event.detail) || {};
      var scope = watcherScopes.get(detail.id);
      if (!scope) return;
      if (Date.now() < suppressUntil) return;
      var scopedEvent = Object.assign({}, detail, { _watchScope: scope });
      if (scope.type === "folder" && workspaceActivityClient && workspaceActivityId) {
        workspaceActivityClient.pushWatchEvents(workspaceActivityId, [scopedEvent]);
        return;
      }
      pendingEvents.push(scopedEvent);
      scheduleFlush();
    }

    function handleWorkspaceActivity(message) {
      if (message.type !== "filesystem-patch") return;
      var patch = message.patch || {};
      workspacePatchQueue = workspacePatchQueue.then(async function() {
        if (patch.changes?.length) await processBatch(patch.changes);
        var sidebarTree = app.modules && app.modules.sidebarContextTree;
        if (patch.invalidatedRoots?.length) {
          var derivedRoots = patch.invalidatedRoots.filter(function(path) {
            return workspaceDerivedRoots.some(function(root) { return getComparablePath(root) === getComparablePath(path); });
          });
          if (derivedRoots.length) {
            var markedDerivedRootCount = sidebarTree?.markDerivedRootsDirty?.(derivedRoots) || 0;
            if (markedDerivedRootCount < derivedRoots.length) {
              for (var derivedRoot of derivedRoots) await reconcileParent(getParentPath(derivedRoot));
              sidebarTree?.markDerivedRootsDirty?.(derivedRoots);
            }
          }
          if (patch.invalidatedRoots.length > derivedRoots.length) await reconcileParent(activeWatcherPath);
        }
      }).catch(function(error) {
        console.warn("Failed to apply reduced workspace events:", error);
      });
    }

    function setDerivedRoots(paths) {
      workspaceDerivedRoots = Array.from(new Set((paths || []).map(normalizePath).filter(Boolean)));
      if (workspaceActivityId) workspaceActivityClient?.updateDerivedRoots?.(workspaceActivityId, workspaceDerivedRoots);
    }

    async function ensureListener() {
      var Neutralino = getNeutralino();
      if (listenerAttached || !Neutralino || !Neutralino.events || !Neutralino.events.on) return listenerAttached;
      await Neutralino.events.on("watchFile", onWatchFile);
      listenerAttached = true;
      return true;
    }

    async function detachListenerIfIdle() {
      var Neutralino = getNeutralino();
      if (!listenerAttached || activeWatcherId || tabWatchersByPath.size || !Neutralino || !Neutralino.events || !Neutralino.events.off) return;
      try {
        await Neutralino.events.off("watchFile", onWatchFile);
      } catch (_) {}
      listenerAttached = false;
    }

    async function removeWatcher(id) {
      var Neutralino = getNeutralino();
      if (!id || !Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.removeWatcher) return;
      watcherScopes.delete(id);
      try {
        await Neutralino.filesystem.removeWatcher(id);
      } catch (error) {
        console.warn("Failed to remove folder watcher:", error);
      }
    }

    async function stop() {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingEvents = [];
      if (workspaceActivityId) workspaceActivityClient?.disposeWorkspace?.(workspaceActivityId);
      workspaceActivityId = "";
      workspaceDerivedRoots = [];
      if (activeWatcherId) {
        await removeWatcher(activeWatcherId);
      }
      activeWatcherId = null;
      activeWatcherPath = "";
      await detachListenerIfIdle();
    }

    async function start(folderPath) {
      var Neutralino = getNeutralino();
      if (!isDesktopRuntime() || !folderPath || !Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.createWatcher || !Neutralino.events || !Neutralino.events.on) return false;
      var normalizedPath = normalizePath(folderPath);
      if (activeWatcherId && getComparablePath(activeWatcherPath) === getComparablePath(normalizedPath)) return true;
      await stop();
      try {
        await ensureListener();
        activeWatcherId = await Neutralino.filesystem.createWatcher(normalizedPath);
        activeWatcherPath = normalizedPath;
        watcherScopes.set(activeWatcherId, { type: "folder", path: normalizedPath });
        workspaceActivityId = `folder:${getComparablePath(normalizedPath)}`;
        workspaceActivityClient?.registerWorkspace?.(workspaceActivityId, {
          workspaceRoot: normalizedPath,
          derivedRoots: workspaceDerivedRoots
        }, handleWorkspaceActivity);
        await syncOpenTabWatchers();
        return true;
      } catch (error) {
        console.warn("Failed to start folder watcher:", error);
        activeWatcherId = null;
        activeWatcherPath = "";
        return false;
      }
    }

    async function syncOpenTabWatchers() {
      var Neutralino = getNeutralino();
      if (!isDesktopRuntime() || !Neutralino || !Neutralino.filesystem || !Neutralino.filesystem.createWatcher) return false;
      var wantedPaths = getOpenTabWatcherParentPaths();
      var changed = false;

      for (var entry of Array.from(tabWatchersByPath.entries())) {
        var pathKey = entry[0];
        var watcher = entry[1];
        if (wantedPaths.has(pathKey)) continue;
        await removeWatcher(watcher.id);
        tabWatchersByPath.delete(pathKey);
        changed = true;
      }

      for (var wantedEntry of Array.from(wantedPaths.entries())) {
        var wantedKey = wantedEntry[0];
        var wantedPath = wantedEntry[1];
        if (tabWatchersByPath.has(wantedKey)) continue;
        try {
          await ensureListener();
          var watcherId = await Neutralino.filesystem.createWatcher(wantedPath);
          tabWatchersByPath.set(wantedKey, { id: watcherId, path: wantedPath });
          watcherScopes.set(watcherId, { type: "tabs", path: wantedPath });
          changed = true;
        } catch (error) {
          console.warn("Failed to start open tab watcher:", wantedPath, error);
        }
      }

      await detachListenerIfIdle();
      return changed;
    }

    function startTabWatcherSyncTimer() {
      if (tabSyncTimer || !window.setInterval) return;
      tabSyncTimer = window.setInterval(function() {
        void syncOpenTabWatchers();
      }, 2000);
    }

    function suppress(milliseconds) {
      suppressUntil = Math.max(suppressUntil, Date.now() + Math.max(0, Number(milliseconds) || 0));
    }

    var api = {
      start: start,
      stop: stop,
      suppress: suppress,
      setDerivedRoots: setDerivedRoots,
      reloadOpenTabsFromDisk: reloadOpenTabsFromDisk,
      syncOpenTabWatchers: syncOpenTabWatchers,
      flush: flush,
      _test: {
        processBatch: processBatch,
        getActiveWatcherId: function() { return activeWatcherId; },
        getTabWatcherCount: function() { return tabWatchersByPath.size; },
        getWatcherScopes: function() { return watcherScopes; }
      }
    };

    if (app && app.registerModule) app.registerModule("folderWatcher", api);
    startTabWatcherSyncTimer();
    return api;
  }

  window.registerMarkdownViewerFolderWatcher = registerMarkdownViewerFolderWatcher;
})(window);
