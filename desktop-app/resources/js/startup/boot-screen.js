(function(global, document) {
  "use strict";

  const GLOBAL_STATE_KEY = "markdownViewerGlobalState";
  const STARTUP_THEME_COOKIE = "markdownViewerStartupTheme";
  const READY_EVENT = "markdownViewerStartupReady";
  const SHELL_READY_EVENT = "markdownViewerStartupShellReady";
  const MAX_SPLASH_MS = 15000;
  const SPLASH_REMOVE_MS = 450;
  let ready = false;
  let shellReady = false;
  let shellReadyCallbacks = [];

  const startupPerf = global.markdownViewerStartupPerf || (function createStartupPerf() {
    const startedAt = global.performance?.now ? global.performance.now() : Date.now();
    let lastAt = startedAt;
    const entries = [];

    function now() {
      return global.performance?.now ? global.performance.now() : Date.now();
    }

    function formatEntry(entry) {
      const details = entry.details === undefined ? "" : ` ${JSON.stringify(entry.details)}`;
      return `[startup-perf] +${entry.ms.toFixed(1)}ms (${entry.deltaMs.toFixed(1)}ms) ${entry.label}${details}`;
    }

    function mark(label, details) {
      const timestamp = now();
      const entry = {
        label: String(label || "mark"),
        details,
        ms: timestamp - startedAt,
        deltaMs: timestamp - lastAt,
        at: new Date().toISOString(),
        nativeFlushed: false,
        appFlushed: false
      };
      lastAt = timestamp;
      entries.push(entry);
      return entry;
    }

    async function flushToNative() {
      return;
    }

    async function flushToAppDebug(appDebugLog) {
      if (typeof appDebugLog !== "function") return;
      for (const entry of entries) {
        if (entry.appFlushed) continue;
        entry.appFlushed = true;
        try {
          const line = await appDebugLog("info", formatEntry(entry));
          if (!line) entry.appFlushed = false;
        } catch (_) {
          entry.appFlushed = false;
          return;
        }
      }
    }

    return {
      entries,
      mark,
      flushToNative,
      flushToAppDebug
    };
  })();

  global.markdownViewerStartupPerf = startupPerf;
  startupPerf.mark("boot-screen loaded", {
    readyState: document.readyState,
    href: global.location?.href || ""
  });

  function normalizeThemePreference(value) {
    return value === "dark" || value === "light" ? value : "";
  }

  function readStartupThemeCookie() {
    try {
      const cookies = String(document.cookie || "").split(";");
      for (const cookie of cookies) {
        const parts = cookie.trim().split("=");
        if (parts.shift() === STARTUP_THEME_COOKIE) {
          return normalizeThemePreference(decodeURIComponent(parts.join("=")));
        }
      }
    } catch (_) {
      // Cookies can be unavailable during very early startup.
    }
    return "";
  }

  function readSavedTheme() {
    try {
      const state = JSON.parse(global.localStorage?.getItem(GLOBAL_STATE_KEY) || "{}");
      const savedTheme = normalizeThemePreference(state.theme);
      if (savedTheme) return savedTheme;
    } catch (_) {
      // localStorage may be unavailable during very early startup.
    }
    const startupTheme = readStartupThemeCookie();
    if (startupTheme) return startupTheme;
    return "dark";
  }

  function readSavedThemeState(theme) {
    try {
      const state = JSON.parse(global.localStorage?.getItem(GLOBAL_STATE_KEY) || "{}");
      return Object.assign({}, state, { theme });
    } catch (_) {
      return { theme };
    }
  }

  function applyStartupTheme(theme) {
    const registry = global.markdownViewerThemeRegistry;
    if (!registry?.applyThemeFromState) return;
    try {
      registry.applyThemeFromState(document.documentElement, readSavedThemeState(theme));
    } catch (error) {
      console.warn("[md-editor] Startup theme application failed", error);
    }
  }

  function dispatch(name, detail) {
    global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function markShellReady() {
    if (shellReady) return;
    shellReady = true;
    startupPerf.mark("startup shell ready", { readyState: document.readyState });
    document.documentElement.classList.add("startup-shell-ready");
    dispatch(SHELL_READY_EVENT, { theme: document.documentElement.getAttribute("data-theme") });
    shellReadyCallbacks.splice(0).forEach(function(callback) {
      try {
        callback();
      } catch (error) {
        console.warn("[md-editor] Startup shell callback failed", error);
      }
    });
  }

  function removeSplashWhenHidden() {
    const splash = document.getElementById("startup-splash");
    if (!splash) return;
    global.setTimeout(function() {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, SPLASH_REMOVE_MS);
  }

  function markReady(reason) {
    if (ready) return;
    ready = true;
    startupPerf.mark("startup ready", { reason: reason || "ready" });
    document.documentElement.classList.remove("is-starting");
    document.documentElement.classList.add("startup-ready");
    dispatch(READY_EVENT, { reason: reason || "ready" });
    removeSplashWhenHidden();
  }

  function markFailed(error) {
    startupPerf.mark("startup failed", { error: error ? String(error.message || error) : "" });
    document.documentElement.classList.remove("is-starting");
    document.documentElement.classList.add("startup-failed");
    dispatch(READY_EVENT, { reason: "failed", error: error ? String(error.message || error) : "" });
    removeSplashWhenHidden();
  }

  function onShellReady(callback) {
    if (typeof callback !== "function") return;
    if (shellReady) {
      callback();
      return;
    }
    shellReadyCallbacks.push(callback);
  }

  const theme = readSavedTheme();
  document.documentElement.setAttribute("data-theme", theme);
  applyStartupTheme(theme);
  document.documentElement.classList.add("is-starting", "boot-theme-" + theme);

  global.markdownViewerBootScreen = {
    markReady,
    markFailed,
    onShellReady,
    get ready() { return ready; },
    get shellReady() { return shellReady; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      global.requestAnimationFrame ? global.requestAnimationFrame(markShellReady) : global.setTimeout(markShellReady, 0);
    }, { once: true });
  } else {
    global.requestAnimationFrame ? global.requestAnimationFrame(markShellReady) : global.setTimeout(markShellReady, 0);
  }

  global.setTimeout(function() {
    if (!ready) markReady("startup-timeout");
  }, MAX_SPLASH_MS);
})(window, document);
