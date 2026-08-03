(function(window) {
  "use strict";

  const TOOL_NAMES = new Set([
    "get_conversion_export_state",
    "get_code_conversion_status",
    "export_active_document",
    "export_active_folder_graph",
    "start_code_conversion"
  ]);
  const NON_EDITABLE_TAB_TYPES = new Set(["graph", "large-file", "file-preview", "file-compare", "api-client"]);

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeFormat(format) {
    const value = String(format || "markdown").trim().toLowerCase();
    if (value === "md") return "markdown";
    if (["markdown", "html", "pdf"].includes(value)) return value;
    throw new Error("Unsupported export format. Use markdown, html, or pdf.");
  }

  function registerMarkdownViewerAiCompanionConversionExportTools(_app, deps = {}) {
    function getActiveEditableTab() {
      const tab = deps.getActiveTab?.() || null;
      if (!tab) throw new Error("No active tab is available to export.");
      if (NON_EDITABLE_TAB_TYPES.has(tab.type)) throw new Error("The active tab cannot be exported as a document.");
      return tab;
    }

    function getActiveDocumentName(tab, args = {}) {
      return String(args.fileName || tab.sourceFileName || tab.title || "document.md");
    }

    function getActiveDocumentContent() {
      if (typeof deps.getActiveEditorValue !== "function") throw new Error("Active editor content is unavailable.");
      return deps.getActiveEditorValue();
    }

    function getCodeConversionStatus() {
      return deps.getCodeConverterState?.() || { available: false };
    }

    function getConversionExportState() {
      if (typeof deps.getConversionExportState === "function") return deps.getConversionExportState();
      const activeTab = deps.getActiveTab?.() || null;
      return {
        activeDocument: {
          exportable: !!activeTab && !NON_EDITABLE_TAB_TYPES.has(activeTab.type),
          title: activeTab?.title || "",
          path: activeTab?.path || ""
        },
        activeFolderGraph: {
          exportable: typeof deps.exportActiveFolderToGraph === "function",
          path: deps.getActiveFolderPath?.() || ""
        },
        codeConverter: getCodeConversionStatus()
      };
    }

    async function exportActiveDocument(rawArgs = {}) {
      const args = asObject(rawArgs);
      const format = normalizeFormat(args.format);
      const tab = getActiveEditableTab();
      const content = getActiveDocumentContent();
      if (format === "markdown") {
        if (typeof deps.exportMarkdownContent !== "function") throw new Error("Markdown export is unavailable.");
        deps.exportMarkdownContent(content, getActiveDocumentName(tab, args));
      }
      if (format === "html") {
        if (typeof deps.exportHtmlContent !== "function") throw new Error("HTML export is unavailable.");
        deps.exportHtmlContent(content);
      }
      if (format === "pdf") {
        if (typeof deps.exportPdfContent !== "function") throw new Error("PDF export is unavailable.");
        deps.exportPdfContent(content);
      }
      return { exported: true, format, title: tab.title || "", path: tab.path || "" };
    }

    async function exportActiveFolderGraph() {
      if (typeof deps.exportActiveFolderToGraph !== "function") throw new Error("Folder graph export is unavailable.");
      await deps.exportActiveFolderToGraph();
      return { exported: true, format: "graph", path: deps.getActiveFolderPath?.() || "" };
    }

    async function startCodeConversion(rawArgs = {}) {
      if (typeof deps.startCodeConversion !== "function") throw new Error("Code conversion is unavailable.");
      return deps.startCodeConversion(asObject(rawArgs));
    }

    async function execute(toolName, args = {}) {
      if (!TOOL_NAMES.has(toolName)) throw new Error(`Unsupported conversion/export tool: ${toolName}`);
      if (toolName === "get_conversion_export_state") return getConversionExportState();
      if (toolName === "get_code_conversion_status") return getCodeConversionStatus();
      if (toolName === "export_active_document") return exportActiveDocument(args);
      if (toolName === "export_active_folder_graph") return exportActiveFolderGraph();
      if (toolName === "start_code_conversion") return startCodeConversion(args);
      throw new Error(`Unsupported conversion/export tool: ${toolName}`);
    }

    return { execute };
  }

  window.registerMarkdownViewerAiCompanionConversionExportTools = registerMarkdownViewerAiCompanionConversionExportTools;
})(window);
