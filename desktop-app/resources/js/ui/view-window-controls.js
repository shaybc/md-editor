(function (window, document) {
  "use strict";

  var ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
  var DEFAULT_ZOOM_PERCENT = 100;

  function registerViewWindowControls(app, deps) {
    var zoomInButtons = deps.zoomInButtons || [];
    var zoomOutButtons = deps.zoomOutButtons || [];
    var zoomResetButtons = deps.zoomResetButtons || [];
    var fullscreenButtons = deps.fullscreenButtons || [];
    var openDownloadsWindowButtons = deps.openDownloadsWindowButtons || [];
    var appZoomStatusElement = deps.appZoomStatusElement || null;
    var appZoomPercentElement = deps.appZoomPercentElement || null;
    var currentZoomPercent = normalizeZoomPercent(deps.loadGlobalState?.().appZoomPercent);
    var wasMaximizedBeforeNeutralinoFullscreen = false;

    function normalizeZoomPercent(value) {
      var numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return DEFAULT_ZOOM_PERCENT;
      return ZOOM_LEVELS.reduce(function (best, candidate) {
        return Math.abs(candidate - numericValue) < Math.abs(best - numericValue) ? candidate : best;
      }, DEFAULT_ZOOM_PERCENT);
    }

    function getZoomLevelIndex(percent) {
      var normalized = normalizeZoomPercent(percent);
      var index = ZOOM_LEVELS.indexOf(normalized);
      return index >= 0 ? index : ZOOM_LEVELS.indexOf(DEFAULT_ZOOM_PERCENT);
    }

    function setButtonDisabled(button, disabled) {
      if (!button) return;
      button.disabled = !!disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    function updateZoomButtons() {
      var index = getZoomLevelIndex(currentZoomPercent);
      var atMinimum = index <= 0;
      var atMaximum = index >= ZOOM_LEVELS.length - 1;
      var atDefault = currentZoomPercent === DEFAULT_ZOOM_PERCENT;

      zoomInButtons.forEach(function (button) {
        setButtonDisabled(button, atMaximum);
        button.title = atMaximum ? "Maximum zoom reached" : "Zoom in";
      });
      zoomOutButtons.forEach(function (button) {
        setButtonDisabled(button, atMinimum);
        button.title = atMinimum ? "Minimum zoom reached" : "Zoom out";
      });
      zoomResetButtons.forEach(function (button) {
        setButtonDisabled(button, atDefault);
        button.title = atDefault ? "Already at actual size" : "Actual size";
      });
    }

    function updateAppZoomStatus() {
      if (!appZoomStatusElement || !appZoomPercentElement) return;
      appZoomPercentElement.textContent = currentZoomPercent + "%";
      appZoomStatusElement.classList.toggle("hidden", currentZoomPercent === DEFAULT_ZOOM_PERCENT);
    }

    function applyZoom(percent, options) {
      var nextZoomPercent = normalizeZoomPercent(percent);
      var nextZoomFactor = nextZoomPercent / 100;
      currentZoomPercent = nextZoomPercent;
      document.documentElement.style.zoom = nextZoomPercent === DEFAULT_ZOOM_PERCENT ? "" : String(nextZoomFactor);
      document.documentElement.style.setProperty("--app-zoom-viewport-height", (100 / nextZoomFactor) + "vh");
      document.documentElement.dataset.appZoomPercent = String(nextZoomPercent);
      if (!options || options.persist !== false) {
        deps.saveGlobalState?.({ appZoomPercent: nextZoomPercent });
      }
      updateZoomButtons();
      updateAppZoomStatus();
      window.dispatchEvent(new CustomEvent("markdownViewerAppZoomChanged", {
        detail: { zoomPercent: nextZoomPercent }
      }));
      return nextZoomPercent;
    }

    function zoomIn() {
      var index = getZoomLevelIndex(currentZoomPercent);
      return applyZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, index + 1)]);
    }

    function zoomOut() {
      var index = getZoomLevelIndex(currentZoomPercent);
      return applyZoom(ZOOM_LEVELS[Math.max(0, index - 1)]);
    }

    function resetZoom() {
      return applyZoom(DEFAULT_ZOOM_PERCENT);
    }

    function isNeutralinoFullscreenSupported() {
      return typeof deps.Neutralino !== "undefined"
        && !!deps.Neutralino?.window
        && typeof deps.Neutralino.window.isFullScreen === "function"
        && typeof deps.Neutralino.window.setFullScreen === "function"
        && typeof deps.Neutralino.window.exitFullScreen === "function";
    }

    async function toggleFullscreen() {
      try {
        if (isNeutralinoFullscreenSupported()) {
          if (await deps.Neutralino.window.isFullScreen()) {
            await deps.Neutralino.window.exitFullScreen();
            if (wasMaximizedBeforeNeutralinoFullscreen && typeof deps.Neutralino.window.maximize === "function") {
              await deps.Neutralino.window.maximize();
            }
            wasMaximizedBeforeNeutralinoFullscreen = false;
          } else {
            wasMaximizedBeforeNeutralinoFullscreen = typeof deps.Neutralino.window.isMaximized === "function"
              && await deps.Neutralino.window.isMaximized();
            if (wasMaximizedBeforeNeutralinoFullscreen && typeof deps.Neutralino.window.unmaximize === "function") {
              await deps.Neutralino.window.unmaximize();
            }
            await deps.Neutralino.window.setFullScreen();
          }
          return true;
        }

        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
          return true;
        }

        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          return true;
        }
      } catch (error) {
        console.warn("Could not toggle full screen:", error);
      }
      return false;
    }

    async function openDownloadsWindow() {
      try {
        if (typeof deps.openDownloadsWindow === "function") {
          await deps.openDownloadsWindow();
          return true;
        }

        if (typeof deps.Neutralino !== "undefined" && typeof deps.Neutralino?.os?.execCommand === "function") {
          await deps.Neutralino.os.execCommand("powershell -NoProfile -WindowStyle Hidden -Command \"Add-Type -Namespace Win32 -Name Keyboard -MemberDefinition '[DllImport(\\\"user32.dll\\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'; Start-Sleep -Milliseconds 80; [Win32.Keyboard]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [Win32.Keyboard]::keybd_event(0x4A,0,0,[UIntPtr]::Zero); [Win32.Keyboard]::keybd_event(0x4A,0,2,[UIntPtr]::Zero); [Win32.Keyboard]::keybd_event(0x11,0,2,[UIntPtr]::Zero)\"");
          return true;
        }

        if (typeof window.open === "function") {
          var userAgent = String(window.navigator?.userAgent || "");
          var downloadsUrl = /\bEdg\//.test(userAgent) ? "edge://downloads/all" : "chrome://downloads/";
          var downloadsWindow = window.open(downloadsUrl, "_blank");
          return !!downloadsWindow;
        }
      } catch (error) {
        console.warn("Could not open downloads:", error);
      }
      return false;
    }

    function bindButtons() {
      zoomInButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (!button.disabled) zoomIn();
        });
      });
      zoomOutButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (!button.disabled) zoomOut();
        });
      });
      zoomResetButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (!button.disabled) resetZoom();
        });
      });
      fullscreenButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (!button.disabled) void toggleFullscreen();
        });
      });
      openDownloadsWindowButtons.forEach(function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!button.disabled) void openDownloadsWindow();
        });
      });
    }

    applyZoom(currentZoomPercent, { persist: false });
    bindButtons();

    var api = {
      applyZoom: applyZoom,
      getZoomPercent: function () { return currentZoomPercent; },
      openDownloadsWindow: openDownloadsWindow,
      resetZoom: resetZoom,
      toggleFullscreen: toggleFullscreen,
      updateAppZoomStatus: updateAppZoomStatus,
      updateZoomButtons: updateZoomButtons,
      zoomIn: zoomIn,
      zoomOut: zoomOut,
      zoomLevels: ZOOM_LEVELS.slice()
    };

    app.actions.zoomIn = zoomIn;
    app.actions.zoomOut = zoomOut;
    app.actions.resetZoom = resetZoom;
    app.actions.openDownloadsWindow = openDownloadsWindow;
    app.actions.toggleFullscreen = toggleFullscreen;
    app.registerModule("viewWindowControls", api);

    return api;
  }

  window.registerMarkdownViewerViewWindowControls = registerViewWindowControls;
})(window, document);
