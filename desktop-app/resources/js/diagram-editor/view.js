(function(global) {
  "use strict";

  function createView(root) {
    root.textContent = "";
    const shell = document.createElement("div");
    shell.className = "diagram-editor-shell";
    const iframe = document.createElement("iframe");
    iframe.className = "diagram-editor-frame";
    iframe.title = "Diagram Editor";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-downloads allow-modals allow-forms");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    shell.appendChild(iframe);
    root.appendChild(shell);
    return {
      shell,
      iframe,
      setStatus() {},
      setBusy() {}
    };
  }

  global.MarkdownViewerDiagramView = { createView };
})(typeof window !== "undefined" ? window : globalThis);
