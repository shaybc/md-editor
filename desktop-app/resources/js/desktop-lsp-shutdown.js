(function(window) {
  "use strict";

  async function stopLanguageServerProcessesBeforeExit() {
    const jdtProxyClient = window.markdownViewerApp?.modules?.jdtProxyClient;
    const lspBridge = window.markdownViewerApp?.modules?.neutralinoLspBridge;
    if (typeof lspBridge?.stopAllSessions === "function") {
      try {
        await lspBridge.stopAllSessions();
      } catch (error) {
        console.warn("Could not stop language server processes before exit:", error);
      }
    }
    try {
      await jdtProxyClient?.stopAllSessions?.();
    } catch (error) {
      console.warn("Could not stop JDT proxy processes before exit:", error);
    }
  }

  window.markdownViewerStopLanguageServerProcessesBeforeExit = stopLanguageServerProcessesBeforeExit;
})(window);
