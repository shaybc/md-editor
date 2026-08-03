(function(window, document) {
  "use strict";

  function registerMarkdownViewerRecentItems(app, deps) {
    const RECENT_FILES_KEY = "markdownViewerRecentFiles";
    const RECENT_FOLDERS_KEY = "markdownViewerRecentFolders";
    const DESKTOP_PROFILE_DIR = app.constants?.DESKTOP_PROFILE_DIR || ".md-editor";
    const RECENT_PROFILE_FILE = "recent-items.json";
    const GLOBAL_PROFILE_FILE = "preferences.json";
    const GLOBAL_PROFILE_VERSION = 2;
    const STARTUP_THEME_COOKIE = "markdownViewerStartupTheme";
    const RECENT_HANDLES_DB = "markdownViewerRecentHandles";
    const RECENT_HANDLES_STORE = "handles";
    const DEFAULT_MAX_RECENT_ITEMS = 10;
    const recentFileHandles = new Map();
    const recentFolderHandles = new Map();
    const recentItemsCache = {
      [RECENT_FILES_KEY]: readRecentItemsFromLocalStorage(RECENT_FILES_KEY),
      [RECENT_FOLDERS_KEY]: readRecentItemsFromLocalStorage(RECENT_FOLDERS_KEY)
    };
    let recentProfilePathPromise = null;
    let recentProfileWriteTimer = null;
    let globalProfilePathPromise = null;
    let globalProfileWriteTimer = null;
    const extraProfilePathPromises = new Map();
    let recentHandlesDbPromise = null;

    function isNeutralinoRuntime() {
      return typeof NL_VERSION !== "undefined" && typeof Neutralino !== "undefined";
    }

    function normalizeThemePreference(value) {
      return value === "dark" || value === "light" ? value : "";
    }

    function saveStartupThemePreference(theme) {
      const normalizedTheme = normalizeThemePreference(theme);
      if (!normalizedTheme) return;
      try {
        document.cookie = `${STARTUP_THEME_COOKIE}=${encodeURIComponent(normalizedTheme)}; Max-Age=31536000; Path=/; SameSite=Lax`;
      } catch (_) {
        // Cookie persistence is best-effort and only affects next-start first paint.
      }
    }

    function getRecentItemLimit(storageKey) {
      const getter = storageKey === RECENT_FOLDERS_KEY ? deps.getMaxRecentFolders : deps.getMaxRecentFiles;
      try {
        const value = Number(typeof getter === "function" ? getter() : DEFAULT_MAX_RECENT_ITEMS);
        if (!Number.isFinite(value)) return DEFAULT_MAX_RECENT_ITEMS;
        return Math.max(0, Math.min(100, Math.floor(value)));
      } catch (_error) {
        return DEFAULT_MAX_RECENT_ITEMS;
      }
    }

    function normalizeRecentItems(items, storageKey) {
      if (!Array.isArray(items)) return [];

      const normalizedItems = [];
      const indexByKey = new Map();
      items.forEach((item) => {
        const key = getRecentItemKey(item);
        if (!key) return;

        if (!indexByKey.has(key)) {
          indexByKey.set(key, normalizedItems.length);
          normalizedItems.push(item);
          return;
        }

        const existingIndex = indexByKey.get(key);
        const existingItem = normalizedItems[existingIndex];
        if (Number(item.updatedAt || 0) > Number(existingItem.updatedAt || 0)) {
          normalizedItems[existingIndex] = item;
        }
      });

      return normalizedItems.slice(0, getRecentItemLimit(storageKey));
    }

    function readRecentItemsFromLocalStorage(storageKey) {
      try {
        const items = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const normalizedItems = normalizeRecentItems(items, storageKey);
        if (JSON.stringify(items) !== JSON.stringify(normalizedItems)) {
          localStorage.setItem(storageKey, JSON.stringify(normalizedItems));
        }
        return normalizedItems;
      } catch (error) {
        console.warn("Failed to read recent items:", error);
        return [];
      }
    }

    function writeRecentItemsToLocalStorage(storageKey, items) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalizeRecentItems(items, storageKey)));
      } catch (error) {
        console.warn("Failed to save recent items:", error);
      }
    }

    function readRecentItems(storageKey) {
      return normalizeRecentItems(recentItemsCache[storageKey] || [], storageKey);
    }

    function writeRecentItems(storageKey, items) {
      recentItemsCache[storageKey] = normalizeRecentItems(items, storageKey);
      writeRecentItemsToLocalStorage(storageKey, recentItemsCache[storageKey]);
      scheduleRecentProfileWrite();
    }

    function getRecentItemKey(item) {
      return String(item && (item.path || item.handleName || item.name || item.label) || "").toLowerCase();
    }

    function getRecentHandleStore(storageKey) {
      return storageKey === RECENT_FOLDERS_KEY ? recentFolderHandles : recentFileHandles;
    }

    function getRecentHandleId(storageKey, key) {
      return `${storageKey}:${key}`;
    }

    function openRecentHandlesDatabase() {
      if (isNeutralinoRuntime() || !window.indexedDB) return Promise.resolve(null);

      if (!recentHandlesDbPromise) {
        recentHandlesDbPromise = new Promise((resolve) => {
          const request = window.indexedDB.open(RECENT_HANDLES_DB, 1);

          request.onupgradeneeded = function(event) {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(RECENT_HANDLES_STORE)) {
              database.createObjectStore(RECENT_HANDLES_STORE, { keyPath: "id" });
            }
          };

          request.onsuccess = function(event) {
            resolve(event.target.result);
          };

          request.onerror = function(event) {
            console.warn("Failed to open recent handles database:", event.target.error);
            resolve(null);
          };

          request.onblocked = function() {
            console.warn("Opening the recent handles database was blocked by another tab.");
            resolve(null);
          };
        });
      }

      return recentHandlesDbPromise;
    }

    async function persistRecentHandle(storageKey, key, handle) {
      if (!handle || isNeutralinoRuntime()) return;

      const database = await openRecentHandlesDatabase();
      if (!database) return;

      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(RECENT_HANDLES_STORE, "readwrite");
          const store = transaction.objectStore(RECENT_HANDLES_STORE);
          store.put({
            id: getRecentHandleId(storageKey, key),
            storageKey,
            key,
            handle,
            updatedAt: Date.now()
          });
          transaction.oncomplete = resolve;
          transaction.onerror = function(event) { reject(event.target.error); };
          transaction.onabort = function(event) { reject(event.target.error); };
        });
      } catch (error) {
        console.warn("Failed to save recent file-system handle:", error);
      }
    }

    async function getPersistedRecentHandle(storageKey, key) {
      const handleStore = getRecentHandleStore(storageKey);
      const cachedHandle = handleStore.get(key);
      if (cachedHandle) return cachedHandle;

      const database = await openRecentHandlesDatabase();
      if (!database) return null;

      try {
        const record = await new Promise((resolve, reject) => {
          const transaction = database.transaction(RECENT_HANDLES_STORE, "readonly");
          const request = transaction.objectStore(RECENT_HANDLES_STORE).get(getRecentHandleId(storageKey, key));
          request.onsuccess = function(event) { resolve(event.target.result || null); };
          request.onerror = function(event) { reject(event.target.error); };
        });
        if (record && record.handle) {
          handleStore.set(key, record.handle);
          return record.handle;
        }
      } catch (error) {
        console.warn("Failed to read recent file-system handle:", error);
      }

      return null;
    }

    async function hydrateRecentHandlesFromIndexedDB() {
      const database = await openRecentHandlesDatabase();
      if (!database) return;

      try {
        const records = await new Promise((resolve, reject) => {
          const transaction = database.transaction(RECENT_HANDLES_STORE, "readonly");
          const request = transaction.objectStore(RECENT_HANDLES_STORE).getAll();
          request.onsuccess = function(event) { resolve(event.target.result || []); };
          request.onerror = function(event) { reject(event.target.error); };
        });

        records.forEach((record) => {
          if (!record || !record.storageKey || !record.key || !record.handle) return;
          getRecentHandleStore(record.storageKey).set(record.key, record.handle);
        });
      } catch (error) {
        console.warn("Failed to hydrate recent file-system handles:", error);
      }
    }

    async function ensureFileSystemHandlePermission(handle, mode = "read") {
      if (!handle || typeof handle.queryPermission !== "function") return true;

      const options = { mode };
      try {
        if (await handle.queryPermission(options) === "granted") return true;
        if (typeof handle.requestPermission !== "function") return false;
        return await handle.requestPermission(options) === "granted";
      } catch (error) {
        console.warn("Failed to verify file-system handle permission:", error);
        return false;
      }
    }

    function mergeRecentItems(...itemGroups) {
      const mergedByKey = new Map();

      itemGroups.flat().forEach((item) => {
        const key = getRecentItemKey(item);
        if (!key) return;

        const existing = mergedByKey.get(key);
        if (!existing || Number(item.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
          mergedByKey.set(key, item);
        }
      });

      return Array.from(mergedByKey.values())
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, Math.max(getRecentItemLimit(RECENT_FILES_KEY), getRecentItemLimit(RECENT_FOLDERS_KEY)));
    }

    function getProfileSeparator(profileDir) {
      return profileDir.includes("\\") ? "\\" : "/";
    }

    async function getUserProfileDir() {
      if (!isNeutralinoRuntime() || !Neutralino.os || !Neutralino.os.getEnv) return null;

      const envVars = NL_OS === "Windows" ? ["USERPROFILE", "HOME"] : ["HOME", "USERPROFILE"];
      for (const envVar of envVars) {
        try {
          const value = await Neutralino.os.getEnv(envVar);
          if (value) return value;
        } catch (error) {
          // Try the next platform-appropriate profile variable.
        }
      }

      return null;
    }

    async function getProfileDataDirPath() {
      if (!isNeutralinoRuntime()) return null;

      const profileDir = await getUserProfileDir();
      if (!profileDir) return null;

      const separator = getProfileSeparator(profileDir);
      const dataDir = `${profileDir}${separator}${DESKTOP_PROFILE_DIR}`;
      try {
        if (Neutralino.filesystem && Neutralino.filesystem.createDirectory) {
          await Neutralino.filesystem.createDirectory(dataDir);
        }
      } catch (error) {
        // The directory may already exist; reads/writes below will report real failures.
      }

      return dataDir;
    }

    async function getProfileFilePath(fileName, cacheKey) {
      if (!isNeutralinoRuntime()) return null;

      if (!cacheKey.promise) {
        cacheKey.promise = (async () => {
          const dataDir = await getProfileDataDirPath();
          if (!dataDir) return null;
          const separator = getProfileSeparator(dataDir);
          return `${dataDir}${separator}${fileName}`;
        })();
      }

      return cacheKey.promise;
    }

    async function getRecentProfilePath() {
      return getProfileFilePath(RECENT_PROFILE_FILE, {
        get promise() { return recentProfilePathPromise; },
        set promise(value) { recentProfilePathPromise = value; }
      });
    }

    async function getGlobalProfilePath() {
      return getProfileFilePath(GLOBAL_PROFILE_FILE, {
        get promise() { return globalProfilePathPromise; },
        set promise(value) { globalProfilePathPromise = value; }
      });
    }

    async function getProfileDataFilePath(fileName) {
      const normalizedFileName = String(fileName || "").trim();
      if (!normalizedFileName) return null;
      if (!extraProfilePathPromises.has(normalizedFileName)) {
        const cacheKey = { promise: null };
        extraProfilePathPromises.set(normalizedFileName, cacheKey);
      }
      return getProfileFilePath(normalizedFileName, extraProfilePathPromises.get(normalizedFileName));
    }

    function getRecentProfilePayload() {
      return {
        version: 1,
        updatedAt: Date.now(),
        recentFiles: readRecentItems(RECENT_FILES_KEY),
        recentFolders: readRecentItems(RECENT_FOLDERS_KEY)
      };
    }

    async function writeRecentItemsToProfile() {
      const profilePath = await getRecentProfilePath();
      if (!profilePath) return;

      try {
        await Neutralino.filesystem.writeFile(profilePath, JSON.stringify(getRecentProfilePayload(), null, 2));
      } catch (error) {
        console.warn("Failed to save recent items to user profile:", error);
      }
    }

    function scheduleRecentProfileWrite() {
      if (!isNeutralinoRuntime()) return;

      clearTimeout(recentProfileWriteTimer);
      recentProfileWriteTimer = setTimeout(() => {
        writeRecentItemsToProfile();
      }, 100);
    }

    async function hydrateRecentItemsFromProfile() {
      const profilePath = await getRecentProfilePath();
      if (!profilePath) return;

      try {
        const rawProfileData = await Neutralino.filesystem.readFile(profilePath);
        const profileData = JSON.parse(rawProfileData || "{}");
        recentItemsCache[RECENT_FILES_KEY] = mergeRecentItems(
          profileData.recentFiles || [],
          recentItemsCache[RECENT_FILES_KEY]
        );
        recentItemsCache[RECENT_FOLDERS_KEY] = mergeRecentItems(
          profileData.recentFolders || [],
          recentItemsCache[RECENT_FOLDERS_KEY]
        );
        writeRecentItemsToLocalStorage(RECENT_FILES_KEY, recentItemsCache[RECENT_FILES_KEY]);
        writeRecentItemsToLocalStorage(RECENT_FOLDERS_KEY, recentItemsCache[RECENT_FOLDERS_KEY]);
        renderRecentMenus();
        scheduleRecentProfileWrite();
      } catch (error) {
        // First launch is expected to have no profile data file yet. Seed it from localStorage.
        scheduleRecentProfileWrite();
      }
    }

    function getGlobalProfilePayload() {
      return {
        version: GLOBAL_PROFILE_VERSION,
        updatedAt: Date.now(),
        state: deps.loadGlobalState()
      };
    }

    function migrateGlobalProfileState(profileData) {
      const state = profileData && profileData.state && typeof profileData.state === "object"
        ? profileData.state
        : {};
      if (Number(profileData?.version) >= GLOBAL_PROFILE_VERSION) return state;

      // Older profiles stored the previous disabled default, so enable it once during upgrade.
      return { ...state, languageServerAutocompleteEnabled: true };
    }

    async function writeGlobalStateToProfile() {
      const profilePath = await getGlobalProfilePath();
      if (!profilePath) return;

      try {
        if (typeof deps.appDebugLog === "function") {
          void deps.appDebugLog("debug", "[tabs-session] Writing preferences profile", {
            profilePath,
            startupBehavior: deps.loadGlobalState()?.startupBehavior || null
          });
        }
        await Neutralino.filesystem.writeFile(profilePath, JSON.stringify(getGlobalProfilePayload(), null, 2));
      } catch (error) {
        if (typeof deps.appDebugLog === "function") {
          void deps.appDebugLog("warning", "[tabs-session] Failed to write preferences profile", error);
        }
        console.warn("Failed to save preferences to user profile:", error);
      }
    }

    function scheduleGlobalProfileWrite() {
      if (!isNeutralinoRuntime()) return;

      clearTimeout(globalProfileWriteTimer);
      globalProfileWriteTimer = setTimeout(() => {
        writeGlobalStateToProfile();
      }, 100);
    }

    async function hydrateGlobalStateFromProfile() {
      const profilePath = await getGlobalProfilePath();
      if (!profilePath) {
        if (typeof deps.appDebugLog === "function") {
          void deps.appDebugLog("debug", "[tabs-session] Preferences profile hydration skipped outside desktop runtime");
        }
        return;
      }

      try {
        if (typeof deps.appDebugLog === "function") {
          void deps.appDebugLog("debug", "[tabs-session] Reading preferences profile", { profilePath });
        }
        const rawProfileData = await Neutralino.filesystem.readFile(profilePath);
        const profileData = JSON.parse(rawProfileData || "{}");
        if (profileData && profileData.state && typeof profileData.state === "object") {
          const profileState = migrateGlobalProfileState(profileData);
          localStorage.setItem(deps.globalStateKey, JSON.stringify({ ...deps.loadGlobalState(), ...profileState }));
          saveStartupThemePreference(profileState.theme);
          deps.applyGlobalPreferences(deps.loadGlobalState());
          if (typeof deps.appDebugLog === "function") {
            void deps.appDebugLog("info", "[tabs-session] Hydrated preferences profile", {
              profilePath,
              startupBehavior: profileData.state.startupBehavior || null
            });
          }
        }
        scheduleGlobalProfileWrite();
      } catch (error) {
        // First launch is expected to have no profile data file yet. Seed it from localStorage.
        if (typeof deps.appDebugLog === "function") {
          void deps.appDebugLog("warning", "[tabs-session] Preferences profile missing or unreadable; seeding from localStorage", {
            profilePath,
            startupBehavior: deps.loadGlobalState()?.startupBehavior || null
          });
        }
        scheduleGlobalProfileWrite();
      }
    }

    function createRecentEntry(entry) {
      const path = entry && entry.path ? String(entry.path) : null;
      const handleName = entry && entry.handle && entry.handle.name ? entry.handle.name : null;
      const name = entry && entry.name ? String(entry.name) : (path ? deps.getFileName(path) : handleName);
      const label = entry && entry.label ? String(entry.label) : (name || path || handleName || "Untitled");
      return {
        name: name || label,
        label,
        path,
        handleName,
        updatedAt: Date.now()
      };
    }

    function rememberRecentItem(storageKey, entry, handleStore) {
      const recentEntry = createRecentEntry(entry);
      const key = getRecentItemKey(recentEntry);
      if (!key) return;

      if (entry && entry.handle) {
        handleStore.set(key, entry.handle);
        persistRecentHandle(storageKey, key, entry.handle);
      }

      const items = readRecentItems(storageKey).filter((item) => getRecentItemKey(item) !== key);
      items.unshift(recentEntry);
      writeRecentItems(storageKey, items);
      renderRecentMenus();
    }

    function rememberRecentFile(entry) {
      rememberRecentItem(RECENT_FILES_KEY, entry, recentFileHandles);
    }

    function rememberRecentFolder(entry) {
      rememberRecentItem(RECENT_FOLDERS_KEY, entry, recentFolderHandles);
    }

    function getRecentSubmenuMarkup(kind, iconClass, title) {
      return `
        <div class="dropdown-submenu action-menu-submenu recent-${kind}-submenu">
          <button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false">
            <i class="bi ${iconClass} me-2"></i> ${title}
          </button>
          <div class="dropdown-menu action-submenu recent-${kind}-menu" aria-label="${title}"></div>
        </div>`;
    }

    function ensureRecentMenuContainers() {
      document.querySelectorAll(".action-menu").forEach((menu) => {
        const openFolderButton = menu.querySelector("#import-from-folder");
        if (!openFolderButton || menu.querySelector(".recent-files-submenu")) return;

        openFolderButton.insertAdjacentHTML("afterend", getRecentSubmenuMarkup("folders", "bi-clock-history", "Recent folders"));
        openFolderButton.insertAdjacentHTML("afterend", getRecentSubmenuMarkup("files", "bi-clock-history", "Recent files"));
      });
      renderRecentMenus();
    }

    function renderRecentMenu(menu, items, emptyText, itemType) {
      menu.innerHTML = "";

      if (!items.length) {
        const emptyItem = document.createElement("button");
        emptyItem.type = "button";
        emptyItem.className = "dropdown-item action-menu-item recent-empty-item";
        emptyItem.disabled = true;
        emptyItem.textContent = emptyText;
        menu.appendChild(emptyItem);
        return;
      }

      items.slice(0, getRecentItemLimit(itemType === "folder" ? RECENT_FOLDERS_KEY : RECENT_FILES_KEY)).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-item action-menu-item recent-menu-item";
        button.dataset.recentType = itemType;
        button.dataset.recentKey = getRecentItemKey(item);
        button.title = item.path || item.label || item.name;
        button.innerHTML = `
          <span class="recent-menu-label">${deps.escapeHtml(item.label || item.name || item.path || "Untitled")}</span>
          <span class="recent-menu-remove" role="button" tabindex="0" aria-label="Remove recent ${itemType}" title="Remove from recent ${itemType === "folder" ? "folders" : "files"}">×</span>
        `;
        menu.appendChild(button);
      });
    }

    function renderRecentMenus() {
      const recentFiles = readRecentItems(RECENT_FILES_KEY);
      const recentFolders = readRecentItems(RECENT_FOLDERS_KEY);

      document.querySelectorAll(".recent-files-menu").forEach((menu) => {
        renderRecentMenu(menu, recentFiles, "No recent files", "file");
      });

      document.querySelectorAll(".recent-folders-menu").forEach((menu) => {
        renderRecentMenu(menu, recentFolders, "No recent folders", "folder");
      });
    }

    function applyRecentItemLimits() {
      writeRecentItems(RECENT_FILES_KEY, recentItemsCache[RECENT_FILES_KEY] || []);
      writeRecentItems(RECENT_FOLDERS_KEY, recentItemsCache[RECENT_FOLDERS_KEY] || []);
      renderRecentMenus();
    }

    function clearRecentHistory() {
      recentItemsCache[RECENT_FILES_KEY] = [];
      recentItemsCache[RECENT_FOLDERS_KEY] = [];
      recentFileHandles.clear();
      recentFolderHandles.clear();
      writeRecentItemsToLocalStorage(RECENT_FILES_KEY, []);
      writeRecentItemsToLocalStorage(RECENT_FOLDERS_KEY, []);
      if (!isNeutralinoRuntime() && window.indexedDB?.deleteDatabase) {
        try {
          window.indexedDB.deleteDatabase(RECENT_HANDLES_DB);
          recentHandlesDbPromise = null;
        } catch (error) {
          console.warn("Failed to clear recent handles database:", error);
        }
      }
      renderRecentMenus();
      scheduleRecentProfileWrite();
    }

    function removeRecentItem(storageKey, key) {
      if (!key) return;
      recentItemsCache[storageKey] = readRecentItems(storageKey).filter((item) => getRecentItemKey(item) !== key);
      getRecentHandleStore(storageKey).delete(key);
      writeRecentItemsToLocalStorage(storageKey, recentItemsCache[storageKey]);
      renderRecentMenus();
      scheduleRecentProfileWrite();
    }

    const api = {
      applyRecentItemLimits,
      clearRecentHistory,
      ensureFileSystemHandlePermission,
      ensureRecentMenuContainers,
      getPersistedRecentHandle,
      getProfileDataDirPath,
      getProfileDataFilePath,
      getRecentItemKey,
      hydrateGlobalStateFromProfile,
      hydrateRecentHandlesFromIndexedDB,
      hydrateRecentItemsFromProfile,
      isNeutralinoRuntime,
      readRecentItems,
      rememberRecentFile,
      rememberRecentFolder,
      removeRecentItem,
      renderRecentMenus,
      scheduleGlobalProfileWrite,
      keys: {
        files: RECENT_FILES_KEY,
        folders: RECENT_FOLDERS_KEY
      }
    };

    app.registerModule("recentItems", api);
    return api;
  }

  window.registerMarkdownViewerRecentItems = registerMarkdownViewerRecentItems;
})(window, document);
