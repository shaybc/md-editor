// OpenAPI editor tab, preview, validation, and API Client handoff.
(function(root, document) {
  "use strict";

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent !== undefined) element.textContent = textContent;
    return element;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function registerMarkdownViewerOpenApiEditor(app, deps = {}) {
    const detector = deps.detector || root.markdownViewerOpenApiDetector;
    const explorer = deps.explorer || root.markdownViewerOpenApiExplorer;
    const requestMapper = deps.requestMapper || root.markdownViewerOpenApiRequestMapper;
    const endpointScanner = deps.endpointScanner || root.markdownViewerOpenApiEndpointScanner;
    const generator = deps.generator || root.markdownViewerOpenApiGenerator;
    const codegenTool = deps.codegenTool || deps.codegen || root.markdownViewerOpenApiCodegen;
    const views = new Map();
    let openApiClipboard = null;
    const OPENAPI_HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"];
    function injectOpenApiEditorStyles() {
      if (!document) return;
      const existingStyle = document.getElementById("openapi-editor-styles");
      const style = existingStyle || document.createElement("style");
      style.id = "openapi-editor-styles";
      style.textContent = `
        .openapi-editor-shell { --openapi-explorer-width: 18%; --openapi-preview-width: 30%; display: grid; grid-template-columns: var(--openapi-explorer-width) calc(100% - var(--openapi-explorer-width) - var(--openapi-preview-width) - 20px) var(--openapi-preview-width); grid-template-rows: auto auto minmax(0, 1.35fr) minmax(180px, 0.65fr) auto; gap: 10px; width: 100%; max-width: none; height: 100%; min-width: 0; min-height: 0; padding: 10px; box-sizing: border-box; background: var(--app-bg, #111827); color: var(--text-color, #e5e7eb); }
        .openapi-toolbar { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .openapi-toolbar-button { display: inline-flex; gap: 6px; align-items: center; }
        .openapi-server-bar { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted-text-color, #9ca3af); }
        .openapi-server-input { flex: 1; min-width: 220px; padding: 6px 8px; border: 1px solid var(--border-color, #374151); border-radius: 6px; background: var(--input-bg, #0b1220); color: inherit; }
        .openapi-explorer, .openapi-center, .openapi-preview, .openapi-details { min-width: 0; max-width: 100%; min-height: 0; overflow: auto; border: 1px solid var(--border-color, #374151); border-radius: 8px; box-sizing: border-box; background: var(--panel-bg, #0f172a); }
        .openapi-explorer { grid-column: 1; grid-row: 3 / 5; padding: 8px 0; font-size: 13px; }
        .openapi-explorer-title { padding: 0 10px 8px; font-size: 13px; font-weight: 600; color: var(--text-color, #e5e7eb); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .openapi-tree-node { display: flex; align-items: center; gap: 6px; width: calc(100% - 4px); min-width: 0; min-height: 24px; margin: 2px 4px 2px 0; box-sizing: border-box; border: 0; border-radius: 4px; padding: 2px 8px; background: transparent; color: var(--text-color, #e5e7eb); text-align: left; white-space: nowrap; user-select: none; cursor: pointer; }
        .openapi-tree-node:hover,
        .openapi-tree-node.is-selected { background: var(--tree-selection-bg, var(--button-hover)); color: var(--text-color, #e5e7eb); }
        .openapi-tree-node:focus-visible { outline: 1px solid var(--accent-color, #60a5fa); outline-offset: -1px; }
        .openapi-tree-node-section,
        .openapi-tree-node-folder { font-weight: 500; }
        .openapi-tree-node-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .openapi-tree-node-value { min-width: 0; max-width: 82px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-text, var(--muted-text-color, #9ca3af)); font-size: 12px; }
        .openapi-tree-node-response .openapi-tree-node-label { flex: 0 0 56px; min-width: 56px; max-width: 56px; overflow: visible; text-overflow: clip; font-variant-numeric: tabular-nums; }
        .openapi-tree-node-response .openapi-tree-node-value { flex: 1 1 auto; max-width: none; margin-left: 8px; text-align: left; }
        .openapi-tree-disclosure { flex: 0 0 12px; width: 12px; color: var(--muted-text, var(--muted-text-color, #9ca3af)); text-align: center; font-size: 11px; line-height: 1; }
        .openapi-tree-disclosure-empty { visibility: hidden; }
        .openapi-tree-icon { flex: 0 0 16px; width: 16px; display: inline-flex; align-items: center; justify-content: center; color: var(--muted-text, var(--muted-text-color, #9ca3af)); font-size: 14px; line-height: 1; }
        .openapi-tree-icon-method { flex-basis: 34px; width: 34px; height: 18px; border-radius: 3px; background: color-mix(in srgb, var(--panel-bg, #0f172a) 72%, var(--accent-color, #60a5fa)); color: #38bdf8; font-size: 9px; font-weight: 700; letter-spacing: 0; }
        .openapi-tree-children { margin-left: 15px; padding-left: 8px; border-left: 1px solid var(--border-color, #374151); }
        .openapi-tree-children.is-collapsed { display: none; }
        .openapi-center { position: relative; grid-column: 2; grid-row: 3 / 5; display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; }
        .openapi-center.codemirror-enabled { overflow: hidden; }
        .openapi-center.codemirror-enabled .openapi-source-editor { display: none; }
        .openapi-center .codemirror-editor { position: relative; inset: auto; width: 100%; max-width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
        .openapi-center .cm-editor { width: 100%; max-width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
        .openapi-center .cm-scroller { width: 100%; max-width: 100%; min-width: 0; min-height: 0; overflow: auto; }
        .openapi-center .cm-content { min-width: max-content; }
        .openapi-source-editor { width: 100%; height: 100%; min-height: 0; resize: none; border: 0; outline: 0; padding: 12px; box-sizing: border-box; background: transparent; color: inherit; font-family: var(--monospace-font, Consolas, monospace); font-size: 13px; line-height: 1.5; }
        .openapi-preview { grid-column: 3; grid-row: 3; padding: 10px; }
        .openapi-details { grid-column: 3; grid-row: 4; padding: 10px; }
        .openapi-preview-title { margin: 0 0 4px; font-size: 18px; }
        .tab-view[data-tab-view-kind="openapi-preview"] { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
        .openapi-preview-tab-shell { flex: 1 1 auto; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: #ffffff; }
        .openapi-swagger-ui-host { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; color: #1f2937; background: #ffffff; border-radius: 6px; padding: 8px; box-sizing: border-box; }
        .openapi-preview-error { padding: 16px; color: #fca5a5; background: var(--panel-bg, #0f172a); border: 1px solid var(--border-color, #374151); border-radius: 8px; margin: 12px; }
        .openapi-swagger-ui-host .swagger-ui .scheme-container { display: none; }
        .openapi-swagger-ui-host .swagger-ui .try-out,
        .openapi-swagger-ui-host .swagger-ui .execute-wrapper { display: none !important; }
        .openapi-swagger-ui-try-button { margin-left: 8px; padding: 5px 10px; border: 1px solid #4990e2; border-radius: 4px; background: #ffffff; color: #1f69c0; font-family: sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .openapi-swagger-ui-try-button:hover { background: #eff6ff; }
        .openapi-swagger-ui-host .swagger-ui .models-control,
        .openapi-swagger-ui-host .swagger-ui .model-box-control {
          all: inherit;
          background: transparent !important;
          border: 0;
          border-bottom: 0;
          box-shadow: none !important;
          cursor: pointer;
          flex: 1;
          min-height: 0;
          padding: 0;
          text-shadow: none;
        }
        .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12 button,
        .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-accordion,
        .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-expand-deep-button {
          background: transparent !important;
          border: 0;
          box-shadow: none !important;
          color: inherit;
          min-height: 0;
          text-shadow: none;
        }
        .openapi-swagger-ui-host .swagger-ui .model-box-control .pointer,
        .openapi-swagger-ui-host .swagger-ui .model-box-control .model-title,
        .openapi-swagger-ui-host .swagger-ui .model-box-control .model-title__text,
        .openapi-swagger-ui-host .swagger-ui .model-box-control .model,
        .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__title,
        .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-expand-deep-button {
          background: transparent !important;
          box-shadow: none !important;
          text-shadow: none;
        }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models h4 { border-color: rgba(59, 65, 81, 0.3); }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models h4,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models h4 span { color: #606060; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models .model-container { background: rgba(0, 0, 0, 0.05); }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui section.models .model-container:hover { background: rgba(0, 0, 0, 0.07); }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model-box { background: rgba(0, 0, 0, 0.1) !important; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model-box .model,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model-box .model-title,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .brace-close,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .brace-open,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .description,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .property-row { color: #3b4151; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .property { color: #999; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .property.primitive,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .prop-format { color: #6b6b6b; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .model .prop-type { color: #55a; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12 button { background: transparent !important; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__title,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-keyword__name--primary { color: #505050; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-keyword__name--secondary,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12-keyword__value--secondary,
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__attribute--muted { color: #6b6b6b; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__attribute--primary { color: #55a; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__constraint { background: #805ad5; color: #fff; }
        html.dark-mode .openapi-swagger-ui-host .swagger-ui .json-schema-2020-12__constraint--string { background: #d69e2e; color: #fff; }
        .openapi-preview-meta, .openapi-operation-summary, .openapi-empty-state { color: var(--muted-text-color, #9ca3af); }
        .openapi-operation-card { min-width: 0; margin: 8px 0; border: 1px solid var(--border-color, #334155); border-radius: 8px; overflow: hidden; }
        .openapi-operation-card.is-selected { border-color: rgba(56, 189, 248, 0.95); box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35) inset; }
        .openapi-operation-header { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; align-items: center; width: 100%; padding: 8px; border: 0; background: rgba(15, 23, 42, 0.9); color: inherit; text-align: left; cursor: pointer; }
        .openapi-method { min-width: 54px; font-weight: 700; color: #38bdf8; }
        .openapi-operation-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .openapi-selected-title { margin: 0 0 6px; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
        .openapi-operation-json, .openapi-update-preview { white-space: pre-wrap; overflow: auto; font-size: 12px; max-width: 100%; }
        .reset-modal-box.app-notification-box.openapi-generation-scope-modal,
        .reset-modal-box.app-notification-box.openapi-document-choice-modal { width: min(1180px, calc(100vw - 80px)) !important; max-width: min(1180px, calc(100vw - 80px)) !important; max-height: min(88vh, 860px); min-height: 0; overflow: hidden; }
        .reset-modal-box.app-notification-box.openapi-update-preview-modal { width: min(770px, calc(100vw - 80px)) !important; max-width: min(770px, calc(100vw - 80px)) !important; max-height: min(94vh, 980px); min-height: 0; overflow: hidden; }
        .reset-modal-box.app-notification-box.openapi-generation-scope-modal .app-notification-body,
        .reset-modal-box.app-notification-box.openapi-document-choice-modal .app-notification-body,
        .reset-modal-box.app-notification-box.openapi-update-preview-modal .app-notification-body { width: 100%; min-width: 0; }
        .openapi-generation-scope-dialog,
        .openapi-document-choice-dialog,
        .openapi-update-preview-dialog { display: flex; flex-direction: column; width: 100%; max-height: min(78vh, 820px); min-height: 0; overflow: hidden; }
        .openapi-generation-scope-dialog { gap: 14px; }
        .openapi-generation-scope-intro { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid rgba(129, 140, 248, 0.24); border-radius: 8px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(14, 165, 233, 0.08)); color: var(--text-color, #e5e7eb); }
        .openapi-generation-scope-intro-icon { flex: 0 0 38px; width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(99, 102, 241, 0.18); color: #a5b4fc; font-size: 20px; }
        .openapi-generation-scope-intro-title { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 700; }
        .openapi-generation-scope-intro-text { display: block; color: var(--muted-text-color, #a5b4fc); font-size: 12px; line-height: 1.45; }
        .openapi-generation-scope-list { display: flex; flex-direction: column; gap: 8px; max-height: min(42vh, 380px); overflow: auto; padding: 2px 4px 2px 2px; min-height: 0; }
        .openapi-generation-scope-option { display: grid; grid-template-columns: 18px 34px minmax(0, 1fr); gap: 10px; align-items: center; min-width: 0; padding: 10px; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 8px; background: rgba(15, 23, 42, 0.36); cursor: pointer; transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease; }
        .openapi-generation-scope-option:hover,
        .openapi-generation-scope-option:has(input:checked) { border-color: rgba(129, 140, 248, 0.72); background: rgba(99, 102, 241, 0.15); box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.18) inset; }
        .openapi-generation-scope-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent-color, #818cf8); }
        .openapi-generation-scope-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; background: rgba(96, 165, 250, 0.14); color: #93c5fd; font-size: 16px; }
        .openapi-generation-scope-content { min-width: 0; display: grid; gap: 4px; }
        .openapi-generation-scope-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .openapi-generation-scope-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; color: var(--text-color, #f8fafc); }
        .openapi-generation-scope-badge { flex: 0 0 auto; padding: 2px 6px; border-radius: 999px; background: rgba(148, 163, 184, 0.16); color: var(--muted-text-color, #a5b4fc); font-size: 10px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
        .openapi-generation-scope-path { min-width: 0; color: var(--muted-text-color, #a5b4fc); font-family: var(--monospace-font, Consolas, monospace); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
        .openapi-update-preview-dialog { gap: 10px; }
        .openapi-update-preview { flex: 1 1 auto; width: 100%; min-height: min(62vh, 640px); max-height: min(72vh, 760px); margin: 0; padding: 12px; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 8px; background: rgba(15, 23, 42, 0.55); color: var(--text-color, #e5e7eb); font-family: var(--monospace-font, Consolas, monospace); font-size: 12px; line-height: 1.45; overflow: auto; resize: vertical; white-space: pre; }
        .openapi-issues { max-height: 120px; overflow: auto; border-top: 1px solid var(--border-color, #374151); padding: 6px 8px; font-size: 12px; }
        .openapi-issue-error { color: #fca5a5; }
        .openapi-issue-warning { color: #fde68a; }
        .openapi-status { grid-column: 1 / -1; font-size: 12px; color: var(--muted-text-color, #9ca3af); }
        .openapi-status[data-tone="error"] { color: #fca5a5; }
        .openapi-status[data-tone="warning"] { color: #fde68a; }
        .openapi-status[data-tone="success"] { color: #86efac; }
        .openapi-ref-hover { position: fixed; z-index: 10000; width: min(560px, calc(100vw - 24px)); max-height: min(360px, calc(100vh - 24px)); overflow: auto; padding: 10px; box-sizing: border-box; border: 1px solid var(--border-color, #374151); border-radius: 6px; background: var(--panel-bg, #0f172a); color: var(--text-color, #e5e7eb); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.38); font-size: 12px; user-select: text; }
        .openapi-ref-hover.hidden { display: none; }
        .openapi-ref-hover:focus { outline: 1px solid var(--accent-color, #60a5fa); outline-offset: 2px; }
        .openapi-ref-hover-title { margin: 0 0 8px; color: var(--muted-text-color, #9ca3af); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .openapi-ref-hover-value { margin: 0; white-space: pre; font-family: var(--monospace-font, Consolas, monospace); line-height: 1.45; }
        @media (max-width: 1100px) { .openapi-editor-shell { --openapi-explorer-width: 26%; grid-template-columns: var(--openapi-explorer-width) calc(100% - var(--openapi-explorer-width) - 10px); grid-template-rows: auto auto minmax(0, 1fr) minmax(220px, auto) minmax(180px, auto) auto; } .openapi-explorer { grid-column: 1; grid-row: 3; } .openapi-center { grid-column: 2; grid-row: 3; } .openapi-preview { grid-column: 1 / -1; grid-row: 4; } .openapi-details { grid-column: 1 / -1; grid-row: 5; } }
      `;
      if (!existingStyle) document.head.appendChild(style);
    }
    injectOpenApiEditorStyles();

    function parseTabDocument(tab) {
      return detector.parseJsonOrYaml(getTabContent(tab), tab?.sourceFilePath || tab?.sourceFileName || tab?.title || "", deps.yamlLibrary);
    }

    function getTabContent(tab) {
      const view = views.get(tab?.id);
      return view?.sourceInput ? getSourceValue(view) : String(tab?.content || "");
    }

    function setTabContent(tab, content) {
      const normalized = deps.normalizeEditorContent ? deps.normalizeEditorContent(content) : String(content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      tab.content = normalized;
      const view = views.get(tab.id);
      if (view?.sourceInput && view.sourceInput.value !== normalized) view.sourceInput.value = normalized;
      return normalized;
    }

    function syncTabContent(view) {
      const source = getSourceValue(view);
      view.tab.content = deps.normalizeEditorContent ? deps.normalizeEditorContent(source) : source;
      deps.refreshTabs?.();
    }

    function getSourceValue(view) {
      view?.sourceCodeMirror?.flushPendingSync?.();
      return String(view?.sourceInput?.value || "");
    }

    function getOpenApiCodeMirrorFactory() {
      if (typeof deps.createCodeMirrorEditorInstance === "function") return deps.createCodeMirrorEditorInstance;
      if (typeof deps.getCodeMirrorEditorFactory === "function") return deps.getCodeMirrorEditorFactory();
      return root.createMarkdownViewerCodeMirrorEditorInstance || null;
    }

    function mountSourceCodeMirror(view) {
      if (!view?.sourceInput || view.sourceCodeMirror?.isEnabled?.()) return true;
      const createCodeMirrorEditor = getOpenApiCodeMirrorFactory();
      if (!createCodeMirrorEditor || !root.MarkdownViewerCodeMirror) return false;
      view.sourceInput.dataset.language = "yaml";
      const editor = createCodeMirrorEditor(app, {
        markdownEditor: view.sourceInput,
        languageRegistry: deps.languageRegistry || null,
        getActiveEditorPath: function() { return getTabFilePath(view); },
        getLanguageOverride: function() { return "yaml"; },
        onLanguageChange: function() {},
        wordWrap: deps.getWordWrapEnabled?.() === true,
        documentWordAutocompleteEnabled: deps.getDocumentWordAutocompleteEnabled?.() === true,
        languageAutocompleteEnabled: deps.getLanguageAutocompleteEnabled?.() === true,
        languageServerAutocompleteEnabled: deps.getLanguageServerAutocompleteEnabled?.() !== false,
        snippetAutocompleteEnabled: deps.getSnippetAutocompleteEnabled?.() === true,
        unclosedBracketHighlightEnabled: deps.getUnclosedBracketHighlightEnabled?.() === true,
        showSymbolPreferences: deps.getShowSymbolPreferences?.() || {},
        getSnippetDefinitions: function(languageId) { return deps.getSnippetDefinitions?.(languageId) || []; },
        getLspSession: deps.getLspSession,
        openLspDefinitionTarget: deps.openLspDefinitionTarget,
        getEditorQuickFixSuggestions: deps.getEditorQuickFixSuggestions,
        openEditorQuickFix: deps.openEditorQuickFix,
        aiAutocomplete: deps.aiAutocomplete || null,
        goToEditorLinePrompt: deps.goToEditorLinePrompt,
        openEditorFindReplace: function(options) {
          setOpenApiActiveEditorOverride(view);
          deps.openEditorFindReplace?.(options);
        },
        registerModule: false
      });
      view.sourceCodeMirror = editor || null;
      if (editor?.isEnabled?.() === true) installOpenApiReferenceNavigation(view);
      return editor?.isEnabled?.() === true;
    }

    function ensureSourceCodeMirror(view) {
      if (mountSourceCodeMirror(view)) return;
      if (typeof deps.loadCodeMirrorBundle !== "function") return;
      deps.loadCodeMirrorBundle().then(function(loaded) {
        if (!loaded || views.get(view?.tab?.id) !== view) return;
        mountSourceCodeMirror(view);
      }).catch(function() {});
    }

    function getActiveEditorCommands() {
      return deps.activeEditorCommands || app?.services?.activeEditorCommands || app?.modules?.activeEditorCommands || null;
    }

    function getOpenApiActiveEditorOwner(view) {
      return `openapi:${view?.tab?.id || "active"}`;
    }

    function setOpenApiActiveEditorOverride(view) {
      getActiveEditorCommands()?.setActiveEditorOverride?.(view.sourceInput, {
        owner: getOpenApiActiveEditorOwner(view),
        codeMirrorEditor: view.sourceCodeMirror || null
      });
    }

    function clearOpenApiActiveEditorOverride(view) {
      getActiveEditorCommands()?.clearActiveEditorOverride?.(getOpenApiActiveEditorOwner(view));
    }

    function getOperationKey(operationRef) {
      return operationRef?.kind === "operation" ? `${String(operationRef.method || "").toUpperCase()} ${operationRef.path || ""}` : "";
    }

    function getSelectedOperationKey(view) {
      return getOperationKey(view.selectedOperation);
    }

    function decodePointerSegment(segment) {
      return String(segment || "").replace(/~1/g, "/").replace(/~0/g, "~");
    }

    function getPointerSegments(pointer) {
      return String(pointer || "").split("/").slice(1).map(decodePointerSegment).filter((segment) => segment !== "");
    }

    function getLineIndent(line) {
      const match = String(line || "").match(/^\s*/);
      return match ? match[0].replace(/\t/g, "  ").length : 0;
    }

    function getYamlLineKey(line) {
      let text = String(line || "").trim();
      if (text.startsWith("- ")) text = text.slice(2).trimStart();
      if (!text) return "";
      const quote = text[0];
      if (quote === '"' || quote === "'") {
        let index = 1;
        while (index < text.length) {
          if (text[index] === quote && text[index - 1] !== "\\") break;
          index += 1;
        }
        return text.slice(1, index);
      }
      const colonIndex = text.indexOf(":");
      return colonIndex >= 0 ? text.slice(0, colonIndex).trim() : "";
    }

    function findYamlDirectChildLine(lines, startLine, parentIndent, predicate) {
      let childIndent = null;
      for (let index = startLine; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = String(line || "").trim();
        if (!trimmed) continue;
        const indent = getLineIndent(line);
        if (indent <= parentIndent) break;
        if (childIndent === null) childIndent = indent;
        if (indent !== childIndent) continue;
        if (predicate(line, index)) return { line: index, indent };
      }
      return null;
    }

    function findYamlPointerLine(source, pointer) {
      const segments = getPointerSegments(pointer);
      if (!segments.length) return 1;
      const lines = String(source || "").split(/\r?\n/);
      let startLine = 0;
      let parentIndent = -1;
      for (const segment of segments) {
        let found = null;
        if (/^\d+$/.test(segment)) {
          found = findYamlDirectChildLine(lines, startLine, parentIndent, (line) => getYamlLineKey(line) === segment);
          if (!found) {
            const targetIndex = Number(segment);
            let currentIndex = -1;
            found = findYamlDirectChildLine(lines, startLine, parentIndent, (line) => {
              const trimmed = String(line || "").trimStart();
              if (!trimmed.startsWith("- ")) return false;
              currentIndex += 1;
              return currentIndex === targetIndex;
            });
          }
        } else {
          found = findYamlDirectChildLine(lines, startLine, parentIndent, (line) => getYamlLineKey(line) === segment);
        }
        if (!found) return null;
        parentIndent = found.indent;
        startLine = found.line + 1;
      }
      return startLine;
    }

    function escapeRegExp(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function findJsonPointerLine(source, pointer) {
      const segments = getPointerSegments(pointer).filter((segment) => !/^\d+$/.test(segment));
      if (!segments.length) return 1;
      const lines = String(source || "").split(/\r?\n/);
      let startLine = 0;
      let foundLine = -1;
      for (const segment of segments) {
        const pattern = new RegExp(`"${escapeRegExp(segment)}"\\s*:`);
        foundLine = -1;
        for (let index = startLine; index < lines.length; index += 1) {
          if (pattern.test(lines[index])) {
            foundLine = index;
            break;
          }
        }
        if (foundLine < 0) return null;
        startLine = foundLine + 1;
      }
      return foundLine + 1;
    }

    function findSourceLineForPointer(view, pointer) {
      if (!pointer) return null;
      const source = getSourceValue(view);
      const path = getTabFilePath(view);
      if (/\.json$/i.test(String(path || "")) || /^\s*[\[{]/.test(source)) return findJsonPointerLine(source, pointer);
      return findYamlPointerLine(source, pointer);
    }

    function getLineRangeForOffset(source, offset) {
      const text = String(source || "");
      const normalizedOffset = Math.max(0, Math.min(text.length, Number(offset) || 0));
      const start = text.lastIndexOf("\n", Math.max(0, normalizedOffset - 1)) + 1;
      const nextNewline = text.indexOf("\n", normalizedOffset);
      const end = nextNewline < 0 ? text.length : nextNewline;
      return { start, end, text: text.slice(start, end), offset: normalizedOffset };
    }

    function getLocalRefInfoAtOffset(source, offset) {
      const line = getLineRangeForOffset(source, offset);
      const relativeOffset = line.offset - line.start;
      const pattern = /(?:^|[\s{,])(?:["']?\$ref["']?\s*:\s*)(["']?)(#[^\s"',}\]]+)\1/g;
      let match;
      while ((match = pattern.exec(line.text))) {
        const refValue = match[2] || "";
        if (!refValue.startsWith("#/")) continue;
        const valueStart = match.index + match[0].indexOf(refValue);
        const valueEnd = valueStart + refValue.length;
        if (relativeOffset < valueStart || relativeOffset > valueEnd) continue;
        const segments = [];
        let cursor = 1;
        while (cursor < refValue.length) {
          if (refValue[cursor] !== "/") break;
          const start = cursor + 1;
          const nextSlash = refValue.indexOf("/", start);
          const end = nextSlash < 0 ? refValue.length : nextSlash;
          if (end > start) segments.push({ raw: refValue.slice(start, end), start, end });
          cursor = end;
        }
        if (!segments.length) return null;
        let clickedIndex = segments.findIndex((segment) => relativeOffset >= valueStart + segment.start && relativeOffset <= valueStart + segment.end);
        if (clickedIndex < 0) clickedIndex = segments.findIndex((segment) => relativeOffset === valueStart + segment.start - 1);
        if (clickedIndex < 0) return null;
        return {
          refValue,
          fullPointer: `/${segments.map((segment) => segment.raw).join("/")}`,
          targetPointer: `/${segments.slice(0, clickedIndex + 1).map((segment) => segment.raw).join("/")}`
        };
      }
      return null;
    }

    function getLocalRefTargetPointerAtOffset(source, offset) {
      return getLocalRefInfoAtOffset(source, offset)?.targetPointer || null;
    }

    function handleOpenApiReferenceNavigation(view, event) {
      if (!event || event.button !== 0 || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return false;
      const codeMirrorView = view.sourceCodeMirror?.getView?.();
      if (!codeMirrorView || typeof codeMirrorView.posAtCoords !== "function") return false;
      let position = null;
      try {
        position = codeMirrorView.posAtCoords({ x: event.clientX, y: event.clientY });
      } catch (_) {
        position = null;
      }
      if (!Number.isFinite(position)) return false;
      const targetPointer = getLocalRefTargetPointerAtOffset(getSourceValue(view), position);
      if (!targetPointer) return false;
      const targetLine = findSourceLineForPointer(view, targetPointer);
      if (!targetLine) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      setOpenApiActiveEditorOverride(view);
      scrollSourceEditorToLine(view, targetLine);
      return true;
    }

    function stringifyOpenApiHoverValue(value) {
      if (value === undefined) return "";
      if (value === null || typeof value !== "object") return String(value);
      const yaml = deps.yamlLibrary || root.jsyaml;
      if (typeof yaml?.dump === "function") return yaml.dump(value, { lineWidth: 100 }).trimEnd();
      return JSON.stringify(value, null, 2);
    }

    function ensureOpenApiReferenceHover(view) {
      if (view.refHoverElement) return view.refHoverElement;
      const hover = createElement("div", "openapi-ref-hover hidden");
      hover.tabIndex = 0;
      hover.setAttribute("role", "tooltip");
      const title = createElement("div", "openapi-ref-hover-title");
      const value = createElement("pre", "openapi-ref-hover-value");
      hover.append(title, value);
      hover.addEventListener("mouseenter", () => { view.refHoverInteractive = true; });
      hover.addEventListener("mouseleave", () => { view.refHoverInteractive = false; hideOpenApiReferenceHover(view); });
      hover.addEventListener("focusin", () => { view.refHoverInteractive = true; });
      hover.addEventListener("focusout", () => { view.refHoverInteractive = false; hideOpenApiReferenceHover(view); });
      hover.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideOpenApiReferenceHover(view, { force: true });
      });
      (document.body || view.root).appendChild(hover);
      view.refHoverElement = hover;
      view.refHoverTitle = title;
      view.refHoverValue = value;
      return hover;
    }

    function hideOpenApiReferenceHover(view, options = {}) {
      if (!view?.refHoverElement) return;
      if (!options.force && view.refHoverInteractive) return;
      view.refHoverElement.classList.add("hidden");
      view.refHoverPointer = "";
    }

    function positionOpenApiReferenceHover(view, event) {
      const hover = view.refHoverElement;
      if (!hover) return;
      const bounds = hover.getBoundingClientRect?.() || { width: 420, height: 220 };
      const viewportWidth = root.innerWidth || document.documentElement?.clientWidth || 1200;
      const viewportHeight = root.innerHeight || document.documentElement?.clientHeight || 800;
      const left = Math.max(8, Math.min((event.clientX || 0) + 14, viewportWidth - bounds.width - 8));
      const top = Math.max(8, Math.min((event.clientY || 0) + 18, viewportHeight - bounds.height - 8));
      hover.style.left = `${left}px`;
      hover.style.top = `${top}px`;
    }

    function showOpenApiReferenceHover(view, event, refInfo) {
      const documentModel = view.documentModel || parseTabDocument(view.tab);
      const targetValue = getValueAtPointer(documentModel, refInfo.fullPointer);
      if (targetValue === undefined) {
        hideOpenApiReferenceHover(view, { force: true });
        return false;
      }
      const hover = ensureOpenApiReferenceHover(view);
      const nextValue = stringifyOpenApiHoverValue(targetValue);
      if (view.refHoverPointer !== refInfo.fullPointer || view.refHoverValue.textContent !== nextValue) {
        view.refHoverTitle.textContent = refInfo.refValue;
        view.refHoverValue.textContent = nextValue;
        hover.scrollTop = 0;
      }
      view.refHoverPointer = refInfo.fullPointer;
      hover.classList.remove("hidden");
      positionOpenApiReferenceHover(view, event);
      return true;
    }

    function handleOpenApiReferenceHover(view, event) {
      const codeMirrorView = view.sourceCodeMirror?.getView?.();
      if (!codeMirrorView || typeof codeMirrorView.posAtCoords !== "function") return false;
      let position = null;
      try {
        position = codeMirrorView.posAtCoords({ x: event.clientX, y: event.clientY });
      } catch (_) {
        position = null;
      }
      if (!Number.isFinite(position)) {
        hideOpenApiReferenceHover(view);
        return false;
      }
      const refInfo = getLocalRefInfoAtOffset(getSourceValue(view), position);
      if (!refInfo) {
        hideOpenApiReferenceHover(view);
        return false;
      }
      return showOpenApiReferenceHover(view, event, refInfo);
    }
    function installOpenApiReferenceNavigation(view) {
      const dom = view.sourceCodeMirror?.getView?.()?.dom;
      if (!dom?.addEventListener || view.refNavigationDom === dom) return;
      if (view.refNavigationDom && view.refNavigationHandler) {
        view.refNavigationDom.removeEventListener?.("mousedown", view.refNavigationHandler, true);
        view.refNavigationDom.removeEventListener?.("mousemove", view.refHoverMoveHandler);
        view.refNavigationDom.removeEventListener?.("mouseleave", view.refHoverLeaveHandler);
      }
      const handler = (event) => handleOpenApiReferenceNavigation(view, event);
      const hoverMoveHandler = (event) => handleOpenApiReferenceHover(view, event);
      const hoverLeaveHandler = () => hideOpenApiReferenceHover(view);
      dom.addEventListener("mousedown", handler, true);
      dom.addEventListener("mousemove", hoverMoveHandler);
      dom.addEventListener("mouseleave", hoverLeaveHandler);
      view.refNavigationDom = dom;
      view.refNavigationHandler = handler;
      view.refHoverMoveHandler = hoverMoveHandler;
      view.refHoverLeaveHandler = hoverLeaveHandler;
    }

    function removeOpenApiReferenceNavigation(view) {
      if (!view?.refNavigationDom || !view.refNavigationHandler) return;
      view.refNavigationDom.removeEventListener?.("mousedown", view.refNavigationHandler, true);
      view.refNavigationDom.removeEventListener?.("mousemove", view.refHoverMoveHandler);
      view.refNavigationDom.removeEventListener?.("mouseleave", view.refHoverLeaveHandler);
      view.refNavigationDom = null;
      view.refNavigationHandler = null;
      view.refHoverMoveHandler = null;
      view.refHoverLeaveHandler = null;
      view.refHoverElement?.remove?.();
      view.refHoverElement = null;
      view.refHoverTitle = null;
      view.refHoverValue = null;
    }

    function getLineStartOffset(source, lineNumber) {
      const targetLine = Math.max(1, Number(lineNumber) || 1);
      let offset = 0;
      let currentLine = 1;
      const text = String(source || "");
      while (currentLine < targetLine && offset < text.length) {
        const nextIndex = text.indexOf("\n", offset);
        if (nextIndex < 0) return text.length;
        offset = nextIndex + 1;
        currentLine += 1;
      }
      return offset;
    }

    function scrollSourceEditorToLine(view, lineNumber) {
      const targetLine = Math.max(1, Number(lineNumber) || 1);
      const codeMirrorView = view.sourceCodeMirror?.getView?.();
      if (codeMirrorView?.state?.doc) {
        const line = codeMirrorView.state.doc.line(Math.min(targetLine, codeMirrorView.state.doc.lines));
        codeMirrorView.dispatch?.({ selection: { anchor: line.from, head: line.from } });
        const scrollDom = codeMirrorView.scrollDOM;
        if (scrollDom && typeof codeMirrorView.lineBlockAt === "function") {
          const block = codeMirrorView.lineBlockAt(line.from);
          const visibleHeight = scrollDom.clientHeight || 0;
          scrollDom.scrollTop = Math.max(0, block.top - Math.max(0, (visibleHeight - block.height) / 2));
        }
        return true;
      }
      const source = getSourceValue(view);
      const offset = getLineStartOffset(source, targetLine);
      view.sourceInput?.setSelectionRange?.(offset, offset);
      if (view.sourceInput) {
        const computed = root.getComputedStyle?.(view.sourceInput);
        const lineHeight = Number.parseFloat(computed?.lineHeight || "") || 18;
        const visibleHeight = view.sourceInput.clientHeight || 0;
        view.sourceInput.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - Math.max(0, (visibleHeight - lineHeight) / 2));
      }
      return true;
    }

    function scrollSourceEditorToNode(view, node) {
      const line = findSourceLineForPointer(view, node?.pointer);
      if (!line) return false;
      return scrollSourceEditorToLine(view, line);
    }

    function updateSelectionStyles(view) {
      const selectedNodeId = view.selectedNodeId || "";
      const selectedOperationKey = getSelectedOperationKey(view);
      view.explorer.querySelectorAll(".openapi-tree-node").forEach((item) => {
        item.classList.toggle("is-selected", item.dataset.nodeId === selectedNodeId);
        item.setAttribute("aria-selected", item.dataset.nodeId === selectedNodeId ? "true" : "false");
      });
      view.preview.querySelectorAll(".openapi-operation-card").forEach((card) => {
        card.classList.toggle("is-selected", card.dataset.operationKey === selectedOperationKey);
      });
    }

    function selectExplorerNode(view, node) {
      view.selectedNodeId = node.id || "";
      view.selectedOperation = node.kind === "operation" ? node : null;
      renderSelectedOperation(view);
      updateSelectionStyles(view);
      scrollSourceEditorToNode(view, node);
    }

    function getOperationPointer(operationRef) {
      if (!operationRef?.path || !operationRef?.method) return "";
      return `/paths/${encodePointerSegment(operationRef.path)}/${String(operationRef.method || "").toLowerCase()}`;
    }

    function expandExplorerAncestorsToPointer(view, pointer) {
      const segments = getPointerSegments(pointer);
      let changed = false;
      for (let index = 1; index < segments.length; index += 1) {
        const parentPointer = `/${segments.slice(0, index).map(encodePointerSegment).join("/")}`;
        const node = findTreeNodeByPointer(view.documentModel, parentPointer);
        if (node?.id && view.collapsedNodeIds?.has(node.id)) {
          view.collapsedNodeIds.delete(node.id);
          changed = true;
        }
      }
      if (changed) renderExplorer(view, view.documentModel);
    }

    function scrollExplorerNodeIntoView(view, nodeId) {
      const item = Array.from(view.explorer.querySelectorAll?.(".openapi-tree-node") || []).find((node) => node.dataset.nodeId === nodeId);
      item?.scrollIntoView?.({ block: "center", inline: "nearest" });
    }

    function selectPreviewOperation(view, operationRef) {
      const pointer = getOperationPointer(operationRef);
      const nodeId = `operation:${String(operationRef.method || "").toLowerCase()}:${operationRef.path || ""}`;
      const treeNode = findTreeNodeByPointer(view.documentModel, pointer);
      view.selectedNodeId = treeNode?.id || nodeId;
      view.selectedOperation = operationRef;
      expandExplorerAncestorsToPointer(view, pointer);
      renderSelectedOperation(view);
      updateSelectionStyles(view);
      scrollExplorerNodeIntoView(view, view.selectedNodeId);
      if (treeNode) scrollSourceEditorToNode(view, treeNode);
      else if (pointer) {
        const line = findSourceLineForPointer(view, pointer);
        if (line) scrollSourceEditorToLine(view, line);
      }
    }

    function getTreeIcon(node) {
      if (node.kind === "operation") return String(node.method || "OP").toUpperCase();
      if (node.kind === "section") return "bi-diagram-3";
      if (node.kind === "folder") return "bi-folder";
      if (node.kind === "path") return "bi-signpost-split";
      if (node.kind === "property") return "bi-braces";
      if (node.kind === "schema") return "bi-box";
      if (node.kind === "parameter") return "bi-sliders";
      if (node.kind === "response") return "bi-reply";
      if (node.kind === "example") return "bi-card-text";
      if (node.kind === "requestBody") return "bi-box-arrow-in-right";
      if (node.kind === "header") return "bi-layout-text-window";
      if (node.kind === "link") return "bi-link-45deg";
      if (node.kind === "callback") return "bi-arrow-return-left";
      if (node.kind === "pathItem") return "bi-signpost-split";
      if (node.kind === "server") return "bi-hdd-network";
      if (node.kind === "security") return "bi-shield-lock";
      if (node.kind === "tag") return "bi-tag";
      return "bi-file-earmark-text";
    }

    function getTreeIconClass(node) {
      if (node.kind === "operation") return "openapi-tree-icon-method";
      return `openapi-tree-icon-symbol bi ${getTreeIcon(node)}`;
    }

    function isNodeCollapsed(view, node) {
      return !!(node.children?.length && view.collapsedNodeIds?.has(node.id));
    }

    function renderTreeNode(view, node, depth = 0, parentElement = view.explorer) {
      if (node.kind === "root") {
        const title = createElement("div", "openapi-explorer-title", node.label || "OpenAPI");
        parentElement.appendChild(title);
        (node.children || []).forEach((child) => renderTreeNode(view, child, depth, parentElement));
        return;
      }
      const hasChildren = (node.children || []).length > 0;
      const collapsed = isNodeCollapsed(view, node);
      const item = createElement("button", `openapi-tree-node openapi-tree-node-${node.kind || "item"}`);
      item.type = "button";
      item.dataset.nodeId = node.id || "";
      item.dataset.pointer = node.pointer || "";
      item.style.paddingLeft = "8px";
      item.setAttribute("aria-expanded", hasChildren ? (collapsed ? "false" : "true") : "false");

      const disclosure = createElement("i", `openapi-tree-disclosure bi ${hasChildren ? (collapsed ? "bi-chevron-right" : "bi-chevron-down") : "openapi-tree-disclosure-empty"}`);
      disclosure.setAttribute("aria-hidden", "true");
      const icon = createElement(node.kind === "operation" ? "span" : "i", `openapi-tree-icon ${getTreeIconClass(node)}`, node.kind === "operation" ? getTreeIcon(node) : "");
      icon.setAttribute("aria-hidden", "true");
      const label = createElement("span", "openapi-tree-node-label", node.label || node.id);
      const value = createElement("span", "openapi-tree-node-value", node.value || "");
      item.append(disclosure, icon, label, value);
      item.addEventListener("click", () => {
        if (hasChildren) {
          if (collapsed) view.collapsedNodeIds.delete(node.id);
          else view.collapsedNodeIds.add(node.id);
          renderExplorer(view, view.documentModel);
        }
        selectExplorerNode(view, node);
      });
      item.addEventListener("contextmenu", (event) => showOpenApiContextMenu(view, event, node));
      parentElement.appendChild(item);
      if (!hasChildren) return;
      const childContainer = createElement("div", collapsed ? "openapi-tree-children is-collapsed" : "openapi-tree-children");
      parentElement.appendChild(childContainer);
      if (!collapsed) (node.children || []).forEach((child) => renderTreeNode(view, child, depth + 1, childContainer));
    }

    function getTabFilePath(view) {
      return view?.tab?.sourceFilePath || view?.tab?.sourceFileName || view?.tab?.title || "OpenAPI";
    }

    function getProblemsOwner(view) {
      const key = String(getTabFilePath(view) || view?.tab?.id || "active").replace(/\\/g, "/").toLowerCase();
      return `openapi:${key}`;
    }

    function getProblemsPanel() {
      return typeof deps.getProblemsPanel === "function" ? deps.getProblemsPanel() : deps.problemsPanel || app?.modules?.problemsPanel || null;
    }

    function publishOpenApiDiagnostics(view, diagnostics, options = {}) {
      const problemsPanel = getProblemsPanel();
      if (!problemsPanel) return;
      const owner = getProblemsOwner(view);
      if (diagnostics?.length) {
        problemsPanel.setDiagnosticCollection?.(owner, diagnostics, { persistent: false, revealErrors: options.revealErrors !== false });
      } else {
        problemsPanel.clearDiagnosticCollection?.(owner, { revealErrors: false });
      }
    }

    function statusMessageForValidation(result) {
      if (result?.status === "parse-error") return "Validation failed: unable to parse document.";
      const count = result?.diagnostics?.length || 0;
      if (!count) return "Validation complete: no issues found.";
      return `Validation complete: ${count} issue${count === 1 ? "" : "s"} found.`;
    }

    function setValidationStatus(view, result) {
      view.status.textContent = statusMessageForValidation(result);
      view.status.dataset.tone = result?.diagnostics?.some((item) => item.severity === "error") ? "error" : ((result?.diagnostics?.length || 0) ? "warning" : "success");
    }

    function resolveOperationFromDocument(documentModel, operationRef) {
      if (!operationRef?.path || !operationRef?.method) return null;
      const operation = documentModel?.paths?.[operationRef.path]?.[String(operationRef.method).toLowerCase()];
      return operation ? { kind: "operation", method: String(operationRef.method).toUpperCase(), path: operationRef.path, operation } : null;
    }

    function refreshOpenApiPanels(view, documentModel) {
      view.documentModel = documentModel;
      const previousOperation = view.selectedOperation;
      view.selectedOperation = resolveOperationFromDocument(documentModel, previousOperation);
      if (!view.selectedOperation && previousOperation?.kind === "operation") view.selectedNodeId = "";
      renderExplorer(view, documentModel);
      renderPreview(view, documentModel);
      renderSelectedOperation(view);
      updateSelectionStyles(view);
    }

    function renderExplorer(view, documentModel) {
      view.explorer.textContent = "";
      renderTreeNode(view, explorer.buildOpenApiExplorer(documentModel));
    }

    function renderPreview(view, documentModel) {
      view.preview.textContent = "";
      const title = createElement("h2", "openapi-preview-title", documentModel.info?.title || "OpenAPI");
      const meta = createElement("div", "openapi-preview-meta", `${documentModel.openapi ? `OpenAPI ${documentModel.openapi}` : `Swagger ${documentModel.swagger}`} | ${documentModel.info?.version || "no version"}`);
      view.preview.append(title, meta);
      Object.entries(documentModel.paths || {}).forEach(([path, pathItem]) => {
        Object.entries(pathItem || {}).forEach(([method, operation]) => {
          if (!/^(get|put|post|delete|options|head|patch|trace)$/i.test(method)) return;
          const operationRef = { kind: "operation", method: method.toUpperCase(), path, operation };
          const card = createElement("section", "openapi-operation-card");
          card.dataset.operationKey = getOperationKey(operationRef);
          const header = createElement("button", "openapi-operation-header");
          header.type = "button";
          header.innerHTML = `<span class="openapi-method">${escapeHtml(method.toUpperCase())}</span><span class="openapi-operation-path">${escapeHtml(path)}</span>`;
          header.addEventListener("click", () => selectPreviewOperation(view, operationRef));
          const summary = createElement("p", "openapi-operation-summary", operation.summary || operation.operationId || "No summary");
          card.append(header, summary);
          view.preview.appendChild(card);
        });
      });
    }

    function renderSelectedOperation(view) {
      view.details.textContent = "";
      const operation = view.selectedOperation?.operation;
      if (!operation) {
        view.details.appendChild(createElement("div", "openapi-empty-state", "Select an operation to inspect or test it."));
        return;
      }
      view.details.appendChild(createElement("h3", "openapi-selected-title", `${view.selectedOperation.method} ${view.selectedOperation.path}`));
      view.details.appendChild(createElement("p", "openapi-operation-summary", operation.summary || operation.operationId || "No summary"));
      const pre = createElement("pre", "openapi-operation-json", JSON.stringify(operation, null, 2));
      view.details.appendChild(pre);
    }

    function renderValidationIssues(view, diagnostics) {
      view.issues.textContent = "";
      (diagnostics || []).forEach((diagnostic) => {
        const item = createElement("div", `openapi-issue openapi-issue-${diagnostic.severity}`);
        item.textContent = `${String(diagnostic.severity || "warning").toUpperCase()} ${diagnostic.openApiPath || "Document"}: ${diagnostic.message}`;
        view.issues.appendChild(item);
      });
    }

    function validateOpenApiDocument(view, options = {}) {
      const result = detector.validateOpenApiText
        ? detector.validateOpenApiText(getSourceValue(view), getTabFilePath(view), { yamlLibrary: deps.yamlLibrary })
        : { status: "parse-error", document: null, diagnostics: [{ severity: "error", message: "OpenAPI validator is unavailable.", filePath: getTabFilePath(view), line: 1, column: 1, source: "openapi" }] };
      if (result.document) {
        refreshOpenApiPanels(view, result.document);
      } else {
        view.documentModel = null;
        view.explorer.textContent = "";
        view.preview.textContent = "";
        view.details.textContent = "";
        view.selectedOperation = null;
        view.selectedNodeId = "";
      }
      renderValidationIssues(view, result.diagnostics || []);
      setValidationStatus(view, result);
      if (options.publishProblems === true) publishOpenApiDiagnostics(view, result.diagnostics || [], { revealErrors: true });
      return result;
    }

    function validateTab(tab, options = {}) {
      const view = views.get(tab?.id);
      return view ? validateOpenApiDocument(view, options) : null;
    }

    function refreshView(view) {
      return validateOpenApiDocument(view, { publishProblems: false });
    }

    function normalizeOpenApiFileKey(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function getOpenApiViewForDiagnostic(diagnostic) {
      const targetPath = normalizeOpenApiFileKey(diagnostic?.filePath || "");
      if (!targetPath) return null;
      for (const view of views.values()) {
        if (normalizeOpenApiFileKey(getTabFilePath(view)) === targetPath) return view;
      }
      return null;
    }

    function getOpenApiQuickFixActions(diagnostic) {
      const code = String(diagnostic?.code || "");
      if (code === "openapi.missingRootFields") {
        return [{ id: "openapi.addRootFields", title: "Add missing OpenAPI root fields", description: "Adds the missing OpenAPI version, info, and paths root objects.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingVersionField") {
        return [{ id: "openapi.addVersionField", title: "Add OpenAPI version", description: "Adds openapi: 3.0.3 at the document root.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingInfo") {
        return [{ id: "openapi.addInfo", title: "Add info object", description: "Adds a minimal info object with title and version.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingInfoTitle") {
        return [{ id: "openapi.addInfoTitle", title: "Add API title", description: "Adds a placeholder info.title value.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingInfoVersion") {
        return [{ id: "openapi.addInfoVersion", title: "Add API version", description: "Adds a placeholder info.version value.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingPaths") {
        return [{ id: "openapi.addPaths", title: "Add empty paths object", description: "Adds paths: {} at the document root.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.pathItemNotObject") {
        return [{ id: "openapi.replacePathItem", title: "Replace with empty path item", description: "Replaces this invalid path item with an empty object.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingOperationResponses") {
        return [{ id: "openapi.addOperationResponses", title: "Add default responses object", description: "Adds a 200 response with a placeholder description.", provenance: "OpenAPI", isPreferred: true }];
      }
      if (code === "openapi.missingOperationId") {
        return [{ id: "openapi.addOperationId", title: "Add operationId", description: "Adds an operationId based on the HTTP method and path.", provenance: "OpenAPI", isPreferred: true }];
      }
      return [];
    }

    function canOpenQuickFix(diagnostic) {
      return diagnostic?.source === "openapi" && !!getOpenApiViewForDiagnostic(diagnostic) && getOpenApiQuickFixActions(diagnostic).length > 0;
    }

    function ensureOpenApiInfoObject(documentModel) {
      if (!documentModel.info || typeof documentModel.info !== "object" || Array.isArray(documentModel.info)) documentModel.info = {};
      if (!documentModel.info.title) documentModel.info.title = "Generated API";
      if (!documentModel.info.version) documentModel.info.version = "1.0.0";
    }

    function getOperationPointerFromDiagnostic(diagnostic) {
      const pointer = String(diagnostic?.openApiPointer || "");
      return pointer.endsWith("/responses") || pointer.endsWith("/operationId") ? getParentPointer(pointer) : pointer;
    }

    function applyOpenApiQuickFixToDocument(documentModel, diagnostic, action) {
      const next = cloneOpenApiDocument(documentModel);
      let focusPointer = diagnostic?.openApiPointer || "";
      if (action.id === "openapi.addRootFields") {
        if (!next.openapi && !next.swagger) next.openapi = "3.0.3";
        ensureOpenApiInfoObject(next);
        if (!next.paths || typeof next.paths !== "object" || Array.isArray(next.paths)) next.paths = {};
        focusPointer = "/paths";
      } else if (action.id === "openapi.addVersionField") {
        if (!next.openapi && !next.swagger) next.openapi = "3.0.3";
        focusPointer = "/openapi";
      } else if (action.id === "openapi.addInfo") {
        ensureOpenApiInfoObject(next);
        focusPointer = "/info";
      } else if (action.id === "openapi.addInfoTitle") {
        if (!next.info || typeof next.info !== "object" || Array.isArray(next.info)) next.info = {};
        next.info.title = next.info.title || "Generated API";
        focusPointer = "/info/title";
      } else if (action.id === "openapi.addInfoVersion") {
        if (!next.info || typeof next.info !== "object" || Array.isArray(next.info)) next.info = {};
        next.info.version = next.info.version || "1.0.0";
        focusPointer = "/info/version";
      } else if (action.id === "openapi.addPaths") {
        next.paths = {};
        focusPointer = "/paths";
      } else if (action.id === "openapi.replacePathItem") {
        const parentInfo = getParentAtPointer(next, diagnostic?.openApiPointer || "");
        if (!parentInfo?.parent) throw new Error("The path item location is no longer available.");
        parentInfo.parent[parentInfo.key] = {};
        focusPointer = diagnostic.openApiPointer;
      } else if (action.id === "openapi.addOperationResponses") {
        const operationPointer = getOperationPointerFromDiagnostic(diagnostic);
        const operation = getValueAtPointer(next, operationPointer);
        if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new Error("The operation is no longer available.");
        operation.responses = { "200": { description: "Successful response" } };
        focusPointer = `${operationPointer}/responses`;
      } else if (action.id === "openapi.addOperationId") {
        const operationPointer = getOperationPointerFromDiagnostic(diagnostic);
        const operation = getValueAtPointer(next, operationPointer);
        const segments = getPointerSegments(operationPointer);
        if (!operation || typeof operation !== "object" || Array.isArray(operation) || segments.length < 3) throw new Error("The operation is no longer available.");
        operation.operationId = operation.operationId || createOperationId(segments[2], segments[1]);
        focusPointer = `${operationPointer}/operationId`;
      }
      return { document: next, focusPointer };
    }

    function resolveOpenApiQuickFixPreview(view, diagnostic, action) {
      const beforeText = getSourceValue(view);
      const documentModel = detector.parseJsonOrYaml(beforeText, getTabFilePath(view), deps.yamlLibrary);
      if (!documentModel || typeof documentModel !== "object" || Array.isArray(documentModel)) throw new Error("OpenAPI quick fixes need a YAML or JSON object document.");
      const result = applyOpenApiQuickFixToDocument(documentModel, diagnostic, action);
      const afterText = generator.stringifyOpenApi(result.document, getTabFilePath(view));
      return {
        affectedPaths: [getTabFilePath(view)],
        beforeText,
        afterText,
        focusPointer: result.focusPointer,
        summary: [{ type: "modify", path: getTabFilePath(view), before: beforeText, after: afterText }]
      };
    }

    function applyOpenApiQuickFixPreview(view, preview) {
      const beforeText = preview.beforeText;
      setTabContent(view.tab, preview.afterText);
      const validation = validateOpenApiDocument(view, { publishProblems: true });
      if (preview.focusPointer) focusOpenApiPointer(view, preview.focusPointer);
      deps.refreshTabs?.();
      return {
        undo() {
          setTabContent(view.tab, beforeText);
          validateOpenApiDocument(view, { publishProblems: true });
          deps.refreshTabs?.();
        },
        validation
      };
    }

    async function openQuickFix(diagnostic) {
      const view = getOpenApiViewForDiagnostic(diagnostic);
      if (!view) return;
      const actions = getOpenApiQuickFixActions(diagnostic);
      if (!actions.length) return;
      const dialog = app?.modules?.quickFixDialog;
      if (!dialog?.open) {
        const preview = resolveOpenApiQuickFixPreview(view, diagnostic, actions[0]);
        applyOpenApiQuickFixPreview(view, preview);
        return;
      }
      await dialog.open({
        diagnostic,
        actions,
        reason: actions.length ? "" : "No OpenAPI quick fixes are available for this problem.",
        aiAvailable: false,
        resolvePreview: (action) => resolveOpenApiQuickFixPreview(view, diagnostic, action),
        applyPreview: (preview) => applyOpenApiQuickFixPreview(view, preview),
        verify: () => "OpenAPI quick fix applied. Validate again if you make additional edits."
      });
    }
    function renderSwaggerUiUnavailable(container) {
      container.textContent = "";
      container.appendChild(createElement("div", "openapi-empty-state", "Swagger UI assets are not available. Run the vendor setup and reload MD-Editor."));
    }

    function renderSwaggerUiError(container, message) {
      container.textContent = "";
      container.appendChild(createElement("div", "openapi-preview-error", message || "Swagger UI preview failed to render."));
    }

    function resolveOpenApiPreviewRef(documentModel, ref) {
      const value = String(ref || "");
      if (!value.startsWith("#/")) return null;
      let current = documentModel;
      for (const segment of value.slice(2).split("/").map(decodePointerSegment)) {
        if (current == null) return null;
        current = Array.isArray(current) ? current[Number(segment)] : current[segment];
      }
      return current && typeof current === "object" ? current : null;
    }

    function expandOpenApiPreviewRefs(rootDocument, value, seenRefs = new Set()) {
      if (Array.isArray(value)) return value.map((item) => expandOpenApiPreviewRefs(rootDocument, item, seenRefs));
      if (!value || typeof value !== "object") return value;
      const ref = String(value.$ref || "");
      if (ref.startsWith("#/") && !seenRefs.has(ref)) {
        const resolved = resolveOpenApiPreviewRef(rootDocument, ref);
        if (resolved) {
          const nextSeenRefs = new Set(seenRefs);
          nextSeenRefs.add(ref);
          const resolvedValue = expandOpenApiPreviewRefs(rootDocument, resolved, nextSeenRefs);
          const siblingEntries = Object.entries(value).filter(([key]) => key !== "$ref");
          if (!siblingEntries.length) return resolvedValue;
          const siblingValue = siblingEntries.reduce((next, [key, item]) => {
            next[key] = expandOpenApiPreviewRefs(rootDocument, item, nextSeenRefs);
            return next;
          }, {});
          return resolvedValue && typeof resolvedValue === "object" && !Array.isArray(resolvedValue) ? Object.assign({}, resolvedValue, siblingValue) : siblingValue;
        }
      }
      return Object.entries(value).reduce((next, [key, item]) => {
        next[key] = expandOpenApiPreviewRefs(rootDocument, item, seenRefs);
        return next;
      }, {});
    }

    function createSwaggerUiPreviewSpec(documentModel) {
      return expandOpenApiPreviewRefs(documentModel, documentModel);
    }
    function normalizeSwaggerUiOperationPath(value) {
      return String(value || "").replace(/\s+/g, " ").trim().split(" ")[0] || "";
    }

    function findSwaggerUiOperationElementText(element, className) {
      const child = element?.querySelector?.(`.${className}`);
      return String(child?.textContent || "").trim();
    }

    function findSwaggerUiOperationRef(opblock, previewState) {
      const method = findSwaggerUiOperationElementText(opblock, "opblock-summary-method").toLowerCase();
      const path = normalizeSwaggerUiOperationPath(findSwaggerUiOperationElementText(opblock, "opblock-summary-path"));
      const operation = previewState?.requestSpec?.paths?.[path]?.[method];
      if (!method || !path || !operation) return null;
      return { method: method.toUpperCase(), path, operation };
    }

    function openSwaggerUiOperationInApiClient(previewState, operationRef) {
      if (!operationRef || !requestMapper?.createOpenApiClientRequest) return false;
      const requestSpec = previewState?.requestSpec || previewState?.spec || {};
      const request = requestMapper.createOpenApiClientRequest(requestSpec, operationRef, {
        serverUrl: previewState?.serverUrl || ""
      });
      deps.openApiClientInTab?.({
        title: `API: ${request.name}`,
        request,
        forceNew: true
      });
      return true;
    }

    function createSwaggerUiTryButton(previewState, operationRef) {
      const button = createElement("button", "openapi-swagger-ui-try-button", "Try it");
      button.type = "button";
      button.title = "Open this operation in the API Client";
      button.addEventListener("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openSwaggerUiOperationInApiClient(previewState, operationRef);
      });
      return button;
    }

    function addSwaggerUiTryButtons(host, previewState) {
      const opblocks = Array.from(host?.querySelectorAll?.(".opblock") || []);
      opblocks.forEach((opblock) => {
        if (opblock.querySelector?.(".openapi-swagger-ui-try-button")) return;
        const operationRef = findSwaggerUiOperationRef(opblock, previewState);
        if (!operationRef) return;
        const summary = opblock.querySelector?.(".opblock-summary") || opblock;
        summary.appendChild(createSwaggerUiTryButton(previewState, operationRef));
      });
    }

    function scheduleSwaggerUiTryButtons(host, previewState) {
      addSwaggerUiTryButtons(host, previewState);
      const schedule = typeof root.requestAnimationFrame === "function"
        ? root.requestAnimationFrame.bind(root)
        : (callback) => (typeof root.setTimeout === "function" ? root.setTimeout(callback, 0) : callback());
      schedule(() => addSwaggerUiTryButtons(host, previewState));
      if (typeof root.setTimeout === "function") {
        root.setTimeout(() => addSwaggerUiTryButtons(host, previewState), 250);
        root.setTimeout(() => addSwaggerUiTryButtons(host, previewState), 1000);
      }
      if (typeof root.MutationObserver === "function") {
        const observer = new root.MutationObserver(() => addSwaggerUiTryButtons(host, previewState));
        observer.observe(host, { childList: true, subtree: true });
      }
    }
    function renderSwaggerUiSpec(container, previewState) {
      container.textContent = "";
      if (typeof root.SwaggerUIBundle !== "function") {
        renderSwaggerUiUnavailable(container);
        return false;
      }
      const host = createElement("div", "openapi-swagger-ui-host");
      container.appendChild(host);
      try {
        root.SwaggerUIBundle({
          domNode: host,
          spec: previewState?.spec || createSwaggerUiPreviewSpec(previewState?.requestSpec || previewState || {}),
          supportedSubmitMethods: [],
          docExpansion: "list",
          deepLinking: true,
          presets: root.SwaggerUIBundle.presets ? [root.SwaggerUIBundle.presets.apis] : undefined
        });
        scheduleSwaggerUiTryButtons(host, previewState || {});
      } catch (error) {
        renderSwaggerUiError(container, "Swagger UI preview failed to render: " + (error?.message || error || "Unknown error"));
        return false;
      }
      return true;
    }

    function openSwaggerUiPreview(view) {
      const result = validateOpenApiDocument(view, { publishProblems: true });
      if (result.status === "parse-error" || result.diagnostics.some((item) => item.severity === "error")) return result;
      const previewTab = deps.openSwaggerUiPreviewInTab?.({
        title: `${view.tab.title || "OpenAPI"} Preview`,
        spec: createSwaggerUiPreviewSpec(result.document),
        requestSpec: result.document,
        serverUrl: view.serverInput.value,
        sourceTabId: view.tab.id || null,
        sourceFilePath: getTabFilePath(view),
        sourceFileName: view.tab.sourceFileName || view.tab.openedSource?.name || view.tab.title || "OpenAPI",
        selectedOperation: view.selectedOperation ? { path: view.selectedOperation.path, method: view.selectedOperation.method } : null
      });
      if (previewTab) {
        view.status.textContent = "Swagger UI preview opened in a separate tab.";
        view.status.dataset.tone = "success";
      } else {
        view.status.textContent = "Swagger UI preview could not be opened.";
        view.status.dataset.tone = "error";
      }
      return result;
    }

    async function generateCodeFromOpenApi(view) {
      const result = validateOpenApiDocument(view, { publishProblems: true });
      if (result.status === "parse-error" || (result.diagnostics || []).some((item) => item.severity === "error")) return result;
      if (typeof codegenTool?.generateFromSource !== "function") {
        await showOpenApiSourceActionMessage("Generate Code From OpenAPI", "OpenAPI code generation is unavailable. Run the vendor setup and reload MD-Editor.");
        return result;
      }
      view.status.textContent = "Preparing OpenAPI code generation...";
      view.status.dataset.tone = "";
      try {
        const generated = await codegenTool.generateFromSource({
          specText: getSourceValue(view),
          specFileName: view.tab.sourceFileName || view.tab.title || "openapi.yaml",
          filePath: getTabFilePath(view),
          title: view.tab.title || "OpenAPI"
        }, { validationResult: result });
        if (generated?.status === "applied") {
          view.status.textContent = "Generated code from the current OpenAPI document.";
          view.status.dataset.tone = "success";
        }
      } catch (error) {
        view.status.textContent = `OpenAPI code generation failed: ${error?.message || error}`;
        view.status.dataset.tone = "error";
      }
      return result;
    }

    function openSelectedOperationInApiClient(view) {
      if (!view.selectedOperation) {
        view.status.textContent = "Select an operation before opening it in the API Client.";
        view.status.dataset.tone = "warning";
        return;
      }
      const request = requestMapper.createOpenApiClientRequest(view.documentModel, view.selectedOperation, {
        serverUrl: view.serverInput.value
      });
      deps.openApiClientInTab?.({
        title: `API: ${request.name}`,
        request,
        forceNew: true
      });
    }

    function normalizeFilesystemPath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinFilesystemPath(parent, child) {
      const base = normalizeFilesystemPath(parent);
      const segment = String(child || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return base ? `${base}/${segment}` : segment;
    }

    function getPathName(path) {
      return normalizeFilesystemPath(path).split("/").pop() || path || "sources";
    }

    function getDefaultJavaSourcePath() {
      const workspaceRoot = normalizeFilesystemPath(deps.getActiveFolderPath?.() || deps.getWorkspaceRoot?.() || "");
      return workspaceRoot ? joinFilesystemPath(workspaceRoot, "src/main/java") : "";
    }

    function buildEndpointGenerationScopeOptions() {
      const options = [];
      const activePath = normalizeFilesystemPath(deps.getActiveEditorPath?.() || "");
      const workspaceRoot = normalizeFilesystemPath(deps.getActiveFolderPath?.() || deps.getWorkspaceRoot?.() || "");
      const defaultJavaSourcePath = getDefaultJavaSourcePath();
      if (/\.java$/i.test(activePath)) {
        options.push({ id: "active-file", type: "file", label: "Active Java file", path: activePath });
      }
      if (defaultJavaSourcePath) {
        options.push({ id: "main-java", type: "folder", label: "Project Java source folder", path: defaultJavaSourcePath });
      }
      if (workspaceRoot) {
        options.push({ id: "workspace", type: "folder", label: "Whole workspace", path: workspaceRoot });
      }
      if (typeof deps.showFolderDialog === "function") {
        options.push({ id: "choose-folder", type: "choose-folder", label: "Choose folder...", path: workspaceRoot });
      }
      return options;
    }

    function getEndpointScopeIconClass(option) {
      if (option?.type === "file") return "bi bi-file-earmark-code";
      if (option?.type === "choose-folder") return "bi bi-folder-plus";
      if (option?.id === "workspace") return "bi bi-boxes";
      return "bi bi-folder2-open";
    }

    function getEndpointScopeBadge(option) {
      if (option?.type === "file") return "File";
      if (option?.type === "choose-folder") return "Browse";
      if (option?.id === "workspace") return "Workspace";
      return "Folder";
    }

    function getEndpointScopeDescription(option) {
      if (option?.type === "file") return "Scan only the active Java source file.";
      if (option?.type === "choose-folder") return "Pick a custom folder before scanning.";
      if (option?.id === "workspace") return "Scan every Java source under the open project.";
      return "Scan Java source files in this folder and its subfolders.";
    }

    function renderEndpointScopeOption(option, index, selectedIdRef) {
      const row = createElement("label", "openapi-generation-scope-option");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "openapi-generation-scope";
      input.value = option.id;
      input.checked = index === 0;
      input.addEventListener("change", () => { if (input.checked) selectedIdRef.value = option.id; });
      const icon = createElement("span", "openapi-generation-scope-icon");
      const iconGlyph = document.createElement("i");
      iconGlyph.className = getEndpointScopeIconClass(option);
      iconGlyph.setAttribute("aria-hidden", "true");
      icon.appendChild(iconGlyph);
      const content = createElement("span", "openapi-generation-scope-content");
      const heading = createElement("span", "openapi-generation-scope-heading");
      heading.appendChild(createElement("span", "openapi-generation-scope-title", option.label));
      heading.appendChild(createElement("span", "openapi-generation-scope-badge", getEndpointScopeBadge(option)));
      content.appendChild(heading);
      content.appendChild(createElement("span", "openapi-generation-scope-intro-text", getEndpointScopeDescription(option)));
      if (option.path) content.appendChild(createElement("span", "openapi-generation-scope-path", option.path));
      row.append(input, icon, content);
      return row;
    }
    async function chooseEndpointGenerationScope() {
      const options = buildEndpointGenerationScopeOptions();
      if (!options.length) return null;
      let selectedId = options[0].id;
      const selectedIdRef = { value: selectedId };
      const notify = deps.notify;
      if (notify?.show) {
        const result = await notify.show({
          title: "Generate From Endpoints",
          message: "Choose which Java sources to scan for REST endpoints.",
          dialogClassName: "openapi-generation-scope-modal",
          dismissValue: null,
          buttons: [
            { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
            { id: "scan", label: "Scan", variant: "primary", autoFocus: true, action: () => selectedIdRef.value }
          ],
          renderBody(body) {
            body.classList.add("openapi-generation-scope-dialog");
            const intro = createElement("div", "openapi-generation-scope-intro");
            const introIcon = createElement("span", "openapi-generation-scope-intro-icon");
            const introGlyph = document.createElement("i");
            introGlyph.className = "bi bi-diagram-3";
            introGlyph.setAttribute("aria-hidden", "true");
            introIcon.appendChild(introGlyph);
            const introText = createElement("span");
            introText.appendChild(createElement("span", "openapi-generation-scope-intro-title", "Choose the Java scope to scan"));
            introText.appendChild(createElement("span", "openapi-generation-scope-intro-text", "MD-Editor will inspect Spring and JAX-RS annotations, then preview the OpenAPI changes before anything is written."));
            intro.append(introIcon, introText);
            const list = createElement("div", "openapi-generation-scope-list");
            options.forEach((option, index) => list.appendChild(renderEndpointScopeOption(option, index, selectedIdRef)));
            body.append(intro, list);
          }
        });
        if (!result) return null;
        selectedId = result;
      }
      const selected = options.find((option) => option.id === selectedId) || options[0];
      if (selected.type !== "choose-folder") return selected;
      const pickedPath = await deps.showFolderDialog?.("Select Java source folder", selected.path ? { defaultPath: selected.path } : undefined);
      return pickedPath ? { id: "chosen-folder", type: "folder", label: "Chosen folder", path: normalizeFilesystemPath(pickedPath) } : null;
    }

    async function collectJavaFilesFromFolder(folderPath, files = []) {
      if (!folderPath || typeof deps.readDirectory !== "function") return files;
      const entries = await deps.readDirectory(folderPath) || [];
      for (const entry of entries) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        if ([".git", ".md-editor", "node_modules", "target", "build", "out"].includes(name)) continue;
        const fullPath = joinFilesystemPath(folderPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          await collectJavaFilesFromFolder(fullPath, files);
        } else if ((type === "FILE" || entry?.isFile === true || !type) && /\.java$/i.test(name)) {
          files.push(fullPath);
        }
      }
      return files.sort((left, right) => left.localeCompare(right));
    }

    async function readEndpointSourceFile(filePath) {
      const normalizedPath = normalizeFilesystemPath(filePath);
      const activePath = normalizeFilesystemPath(deps.getActiveEditorPath?.() || "");
      if (activePath && normalizedPath.toLowerCase() === activePath.toLowerCase()) {
        return { path: normalizedPath, content: deps.getActiveEditorValue?.() || "" };
      }
      return { path: normalizedPath, content: await deps.readFile?.(normalizedPath) };
    }

    async function collectEndpointSources(scope) {
      if (!scope) return [];
      if (scope.type === "file") return [await readEndpointSourceFile(scope.path)];
      const javaFiles = await collectJavaFilesFromFolder(scope.path);
      const sources = [];
      for (const filePath of javaFiles) sources.push(await readEndpointSourceFile(filePath));
      return sources;
    }

    function isOpenApiYamlPath(path) {
      return /\.ya?ml$/i.test(String(path || ""));
    }

    function getWorkspaceRootPath() {
      return normalizeFilesystemPath(deps.getWorkspaceRoot?.() || deps.getActiveFolderPath?.() || "");
    }

    async function collectOpenApiYamlFiles(folderPath, files = []) {
      if (!folderPath || typeof deps.readDirectory !== "function") return files;
      const entries = await deps.readDirectory(folderPath) || [];
      for (const entry of entries) {
        const name = entry?.entry || entry?.name || "";
        if (!name || name === "." || name === "..") continue;
        if ([".git", ".md-editor", "node_modules", "target", "build", "out"].includes(name)) continue;
        const fullPath = joinFilesystemPath(folderPath, name);
        const type = String(entry?.type || entry?.kind || "").toUpperCase();
        if (type === "DIRECTORY" || type === "DIR" || entry?.isDirectory === true) {
          await collectOpenApiYamlFiles(fullPath, files);
        } else if ((type === "FILE" || entry?.isFile === true || !type) && isOpenApiYamlPath(name)) {
          try {
            const content = await deps.readFile?.(fullPath);
            const detected = detector.detectOpenApiDocument?.(content, fullPath, { yamlLibrary: deps.yamlLibrary });
            if (detected?.openapi) files.push({ path: fullPath, content, document: detected.document });
          } catch (error) {
            console.warn("Failed to inspect OpenAPI candidate file:", fullPath, error);
          }
        }
      }
      return files.sort((left, right) => left.path.localeCompare(right.path));
    }

    function getUniqueOpenApiDocumentPath(existingFiles) {
      const workspaceRoot = getWorkspaceRootPath();
      const existing = new Set((existingFiles || []).map((file) => normalizeFilesystemPath(file.path).toLowerCase()));
      const candidates = ["openapi.yaml", "generated-openapi.yaml", "openapi-generated.yaml"];
      for (const name of candidates) {
        const candidate = joinFilesystemPath(workspaceRoot, name);
        if (!existing.has(candidate.toLowerCase())) return candidate;
      }
      for (let index = 2; index < 100; index += 1) {
        const candidate = joinFilesystemPath(workspaceRoot, `openapi-${index}.yaml`);
        if (!existing.has(candidate.toLowerCase())) return candidate;
      }
      return joinFilesystemPath(workspaceRoot, `openapi-${Date.now()}.yaml`);
    }

    function renderOpenApiDocumentChoiceOption(options) {
      const row = createElement("label", "openapi-generation-scope-option");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "openapi-document-choice";
      input.value = options.value;
      input.checked = options.checked === true;
      input.addEventListener("change", () => { if (input.checked) options.onSelect?.(options.value); });
      const icon = createElement("span", "openapi-generation-scope-icon");
      const iconGlyph = document.createElement("i");
      iconGlyph.className = options.iconClass || "bi bi-file-earmark-code";
      iconGlyph.setAttribute("aria-hidden", "true");
      icon.appendChild(iconGlyph);
      const content = createElement("span", "openapi-generation-scope-content");
      const heading = createElement("span", "openapi-generation-scope-heading");
      heading.appendChild(createElement("span", "openapi-generation-scope-title", options.title));
      heading.appendChild(createElement("span", "openapi-generation-scope-badge", options.badge || "OpenAPI"));
      content.appendChild(heading);
      if (options.description) content.appendChild(createElement("span", "openapi-generation-scope-intro-text", options.description));
      if (options.path) content.appendChild(createElement("span", "openapi-generation-scope-path", options.path));
      row.append(input, icon, content);
      return row;
    }
    async function chooseOpenApiDocumentFile() {
      const workspaceRoot = getWorkspaceRootPath();
      if (!workspaceRoot) throw new Error("Open a project folder before generating an OpenAPI document.");
      const openApiFiles = await collectOpenApiYamlFiles(workspaceRoot);
      const createPath = getUniqueOpenApiDocumentPath(openApiFiles);
      if (!openApiFiles.length) return { path: createPath, isNew: true, content: "", document: generator.createBaseDocument?.("Generated API") };
      if (openApiFiles.length === 1) return { ...openApiFiles[0], isNew: false };
      let selectedPath = openApiFiles[0].path;
      const createValue = "__create_openapi_doc__";
      const notify = deps.notify;
      if (notify?.show) {
        const result = await notify.show({
          title: "Choose OpenAPI Document",
          message: "Choose which OpenAPI YAML document to update for this source action.",
          dialogClassName: "openapi-document-choice-modal",
          dismissValue: null,
          buttons: [
            { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
            { id: "use", label: "Use Document", variant: "primary", autoFocus: true, action: () => selectedPath }
          ],
          renderBody(body) {
            body.classList.add("openapi-document-choice-dialog");
            const list = createElement("div", "openapi-generation-scope-list");
            openApiFiles.forEach((file, index) => {
              list.appendChild(renderOpenApiDocumentChoiceOption({
                value: file.path,
                checked: index === 0,
                title: getPathName(file.path),
                badge: "Existing",
                description: "Use this OpenAPI YAML document for the generated endpoint changes.",
                path: file.path,
                iconClass: "bi bi-file-earmark-code",
                onSelect: (value) => { selectedPath = value; }
              }));
            });
            list.appendChild(renderOpenApiDocumentChoiceOption({
              value: createValue,
              title: "Create a new doc ...",
              badge: "New",
              description: "Create a fresh OpenAPI YAML file in the project root.",
              path: createPath,
              iconClass: "bi bi-file-earmark-plus",
              onSelect: (value) => { selectedPath = value; }
            }));
            body.appendChild(list);
          }
        });
        if (!result) return null;
        selectedPath = result;
      }
      if (selectedPath === createValue) return { path: createPath, isNew: true, content: "", document: generator.createBaseDocument?.("Generated API") };
      const selected = openApiFiles.find((file) => file.path === selectedPath) || openApiFiles[0];
      return { ...selected, isNew: false };
    }

    async function loadOpenApiDocumentForAction(targetFile) {
      if (targetFile?.document) return targetFile.document;
      if (targetFile?.isNew) return generator.createBaseDocument?.("Generated API") || { openapi: "3.0.3", info: { title: "Generated API", version: "1.0.0" }, paths: {} };
      const content = await deps.readFile?.(targetFile.path);
      const result = detector.validateOpenApiText?.(content, targetFile.path, { yamlLibrary: deps.yamlLibrary });
      if (!result?.document || result.status === "parse-error" || detector.isOpenApiDocument?.(result.document) === false) {
        throw new Error("The selected file is not a valid OpenAPI YAML document.");
      }
      return result.document;
    }

    function removeEndpointsFromOpenApi(documentModel, endpoints) {
      const next = cloneOpenApiDocument(documentModel);
      let removed = 0;
      (endpoints || []).forEach((endpoint) => {
        const pathKey = endpoint.path || "/";
        const method = String(endpoint.method || "").toLowerCase();
        const pathItem = next.paths?.[pathKey];
        if (!pathItem || !method || !pathItem[method]) return;
        delete pathItem[method];
        removed += 1;
        if (!Object.keys(pathItem).length) delete next.paths[pathKey];
      });
      return { document: next, removed };
    }

    function createOpenApiYamlPreview(nextText) {
      const preview = createElement("textarea", "openapi-update-preview");
      preview.value = String(nextText || "");
      preview.readOnly = true;
      preview.spellcheck = false;
      preview.setAttribute("aria-label", "OpenAPI YAML preview");
      return preview;
    }

    async function confirmOpenApiSourceDocumentUpdate(title, message, nextText) {
      const notify = deps.notify;
      if (!notify?.show) return true;
      const result = await notify.show({
        title,
        message,
        dialogClassName: "openapi-update-preview-modal",
        dismissValue: "cancel",
        renderBody(body) {
          body.classList.add("openapi-update-preview-dialog");
          body.appendChild(createOpenApiYamlPreview(nextText));
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
          { id: "apply", label: "Apply", value: "apply", variant: "primary", autoFocus: true }
        ]
      });
      return result === "apply";
    }

    function openWrittenOpenApiDocument(filePath, nextText) {
      const tab = deps.openOpenApiEditorInTab?.({ name: getPathName(filePath), path: filePath, fullPath: filePath, content: nextText }, { temporary: false, pinExisting: true });
      if (tab) {
        const normalized = setTabContent(tab, nextText);
        tab.savedContent = normalized;
        tab.sourceFilePath = filePath;
        const openView = views.get(tab.id);
        if (openView) refreshView(openView);
      }
      deps.refreshTabs?.();
    }

    async function showOpenApiSourceActionMessage(title, message) {
      if (deps.notify?.show) {
        await deps.notify.show({
          title,
          message,
          dismissValue: "ok",
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
        return;
      }
      deps.alert?.(message);
    }

    function isOpenApiFileContent(content, filePath) {
      const detected = detector.detectOpenApiDocument?.(content, filePath, { yamlLibrary: deps.yamlLibrary });
      return detected?.openapi === true;
    }

    async function generateCodeFromFile(filePath, content) {
      if (typeof codegenTool?.generateFromSource !== "function") {
        await showOpenApiSourceActionMessage("Generate Code From OpenAPI", "OpenAPI code generation is unavailable. Run the vendor setup and reload MD-Editor.");
        return { status: "unavailable" };
      }
      const normalizedPath = normalizeFilesystemPath(filePath);
      const specText = content !== undefined ? String(content || "") : String(await deps.readFile?.(normalizedPath) || "");
      const validation = detector.validateOpenApiText?.(specText, normalizedPath, { yamlLibrary: deps.yamlLibrary });
      if (!validation?.document || validation.status === "parse-error" || (validation.diagnostics || []).some((item) => item.severity === "error")) {
        await showOpenApiSourceActionMessage("Generate Code From OpenAPI", "Fix OpenAPI validation errors before generating code.");
        return { status: "invalid", validation };
      }
      return codegenTool.generateFromSource({
        specText,
        specFileName: getPathName(normalizedPath),
        filePath: normalizedPath,
        title: getPathName(normalizedPath)
      }, { validationResult: validation });
    }

    async function runOpenApiSourceAction(actionName, scope) {
      const normalizedScope = { ...scope, path: normalizeFilesystemPath(scope?.path || "") };
      if (!normalizedScope.path) throw new Error("No source file or folder was selected.");
      const sources = await collectEndpointSources(normalizedScope);
      const endpoints = sources.flatMap((source) => endpointScanner.scanJavaEndpoints(source.content, source.path));
      if (!endpoints.length) {
        await showOpenApiSourceActionMessage("OpenAPI / Swagger", `No Java REST endpoints were found in ${normalizedScope.label || getPathName(normalizedScope.path)}.`);
        return { status: "empty", endpoints: [] };
      }
      const targetFile = await chooseOpenApiDocumentFile();
      if (!targetFile) return { status: "cancelled", endpoints };
      const currentDocument = await loadOpenApiDocumentForAction(targetFile);
      let nextDocument;
      let confirmTitle;
      let confirmMessage;
      if (actionName === "remove") {
        const result = removeEndpointsFromOpenApi(currentDocument, endpoints);
        if (!result.removed) {
          await showOpenApiSourceActionMessage("OpenAPI / Swagger", "No matching OpenAPI operations were found to remove.");
          return { status: "unchanged", endpoints, path: targetFile.path };
        }
        nextDocument = result.document;
        confirmTitle = "Remove endpoints from OpenAPI document?";
        confirmMessage = `Remove ${result.removed} operation${result.removed === 1 ? "" : "s"} from ${getPathName(targetFile.path)}?`;
      } else {
        nextDocument = generator.mergeEndpointsIntoOpenApi(currentDocument, endpoints);
        confirmTitle = targetFile.isNew ? "Create OpenAPI document?" : "Update OpenAPI document?";
        confirmMessage = `${targetFile.isNew ? "Create" : "Apply"} ${endpoints.length} discovered endpoint${endpoints.length === 1 ? "" : "s"} in ${getPathName(targetFile.path)}?`;
      }
      const nextText = generator.stringifyOpenApi(nextDocument, targetFile.path);
      const confirmed = await confirmOpenApiSourceDocumentUpdate(confirmTitle, confirmMessage, nextText);
      if (!confirmed) return { status: "cancelled", endpoints, path: targetFile.path };
      if (typeof deps.writeFile !== "function") throw new Error("Writing OpenAPI files is unavailable in this environment.");
      await deps.writeFile(targetFile.path, nextText);
      openWrittenOpenApiDocument(targetFile.path, nextText);
      await showOpenApiSourceActionMessage("OpenAPI / Swagger", `${getPathName(targetFile.path)} was ${actionName === "remove" ? "updated" : (targetFile.isNew ? "created" : "updated")}.`);
      return { status: "written", endpoints, path: targetFile.path, content: nextText };
    }
    async function generateFromSelectedScope(view) {
      const scope = await chooseEndpointGenerationScope();
      if (!scope) return;
      view.status.textContent = `Scanning ${scope.label || getPathName(scope.path)}...`;
      view.status.dataset.tone = "";
      let sources = [];
      try {
        sources = await collectEndpointSources(scope);
      } catch (error) {
        view.status.textContent = `Unable to scan Java sources: ${error?.message || error}`;
        view.status.dataset.tone = "error";
        return;
      }
      const endpoints = sources.flatMap((source) => endpointScanner.scanJavaEndpoints(source.content, source.path));
      if (!endpoints.length) {
        view.status.textContent = `No Java REST endpoints were found in ${scope.label || getPathName(scope.path)}.`;
        view.status.dataset.tone = "warning";
        return;
      }
      const current = view.documentModel || parseTabDocument(view.tab);
      const next = generator.mergeEndpointsIntoOpenApi(current, endpoints);
      const nextText = generator.stringifyOpenApi(next, view.tab.sourceFilePath || view.tab.sourceFileName || view.tab.title);
      const confirmed = await confirmOpenApiUpdate(view, endpoints, nextText);
      if (!confirmed) return;
      setTabContent(view.tab, nextText);
      refreshView(view);
      view.status.textContent = `Generated OpenAPI entries from ${endpoints.length} endpoint${endpoints.length === 1 ? "" : "s"}.`;
      view.status.dataset.tone = "success";
      deps.refreshTabs?.();
    }

    async function confirmOpenApiUpdate(view, endpoints, nextText) {
      const notify = deps.notify;
      if (!notify?.show) return true;
      const result = await notify.show({
        title: "Update OpenAPI document?",
        message: `Apply ${endpoints.length} discovered endpoint${endpoints.length === 1 ? "" : "s"} to this OpenAPI document?`,
        dialogClassName: "openapi-update-preview-modal",
        dismissValue: "cancel",
        renderBody(body) {
          body.classList.add("openapi-update-preview-dialog");
          body.appendChild(createOpenApiYamlPreview(nextText));
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
          { id: "apply", label: "Apply", value: "apply", variant: "primary", autoFocus: true }
        ]
      });
      return result === "apply";
    }

    function encodePointerSegment(segment) {
      return String(segment || "").replace(/~/g, "~0").replace(/\//g, "~1");
    }

    function getParentPointer(pointer) {
      const segments = getPointerSegments(pointer);
      if (segments.length <= 1) return "";
      return `/${segments.slice(0, -1).map(encodePointerSegment).join("/")}`;
    }

    function getValueAtPointer(documentModel, pointer) {
      if (!pointer) return documentModel;
      let current = documentModel;
      for (const segment of getPointerSegments(pointer)) {
        if (current == null) return undefined;
        current = Array.isArray(current) ? current[Number(segment)] : current[segment];
      }
      return current;
    }

    function getParentAtPointer(documentModel, pointer) {
      const segments = getPointerSegments(pointer);
      if (!segments.length) return null;
      let parent = documentModel;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        parent = Array.isArray(parent) ? parent[Number(segment)] : parent?.[segment];
        if (parent == null) return null;
      }
      return { parent, key: segments[segments.length - 1], parentPointer: getParentPointer(pointer) };
    }

    function cloneOpenApiDocument(documentModel) {
      return documentModel && typeof documentModel === "object" ? JSON.parse(JSON.stringify(documentModel)) : {};
    }

    function cloneOpenApiValue(value) {
      return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
    }

    function getPointerKey(pointer) {
      const segments = getPointerSegments(pointer);
      return segments.length ? segments[segments.length - 1] : "";
    }

    function getOpenApiClipboardLabel(clipboard) {
      if (!clipboard) return "OpenAPI element";
      return clipboard.kind === "response" ? `response ${clipboard.key || clipboard.label || ""}`.trim() : (clipboard.label || clipboard.key || "OpenAPI element");
    }

    function copyOpenApiElement(view, node) {
      const documentModel = view.documentModel || parseTabDocument(view.tab);
      const value = getValueAtPointer(documentModel, node.pointer);
      if (value === undefined) return;
      openApiClipboard = {
        kind: node.kind || "element",
        key: getPointerKey(node.pointer),
        label: node.label || getPointerKey(node.pointer),
        value: cloneOpenApiValue(value)
      };
      view.status.textContent = `Copied ${getOpenApiClipboardLabel(openApiClipboard)}.`;
      view.status.dataset.tone = "success";
    }

    function isResponseClipboard() {
      return openApiClipboard?.kind === "response"
        || (openApiClipboard?.key === "responses" && openApiClipboard?.value && typeof openApiClipboard.value === "object" && !Array.isArray(openApiClipboard.value));
    }

    function getResponseClipboardEntries() {
      if (openApiClipboard?.kind === "response") return [[openApiClipboard.key || openApiClipboard.label || "default", openApiClipboard.value]];
      return Object.entries(openApiClipboard?.value || {});
    }
    function ensureResponsePasteTargets(documentModel, node) {
      const responseKey = openApiClipboard?.key || openApiClipboard?.label || "default";
      if (isResponsesFolderNode(node)) return [{ responsesPointer: node.pointer, responses: getValueAtPointer(documentModel, node.pointer), responseKey }];
      if (node.kind === "response") {
        const responsesPointer = getParentPointer(node.pointer);
        return [{ responsesPointer, responses: getValueAtPointer(documentModel, responsesPointer), responseKey }];
      }
      if (node.kind === "operation") {
        const operation = getValueAtPointer(documentModel, node.pointer);
        if (!operation || typeof operation !== "object" || Array.isArray(operation)) return [];
        if (!operation.responses || typeof operation.responses !== "object" || Array.isArray(operation.responses)) operation.responses = {};
        return [{ responsesPointer: `${node.pointer}/responses`, responses: operation.responses, responseKey }];
      }
      if (node.kind === "path") {
        const pathItem = getValueAtPointer(documentModel, node.pointer);
        if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) return [];
        return OPENAPI_HTTP_METHODS.filter((method) => pathItem[method] && typeof pathItem[method] === "object" && !Array.isArray(pathItem[method])).map((method) => {
          if (!pathItem[method].responses || typeof pathItem[method].responses !== "object" || Array.isArray(pathItem[method].responses)) pathItem[method].responses = {};
          return { responsesPointer: `${node.pointer}/${method}/responses`, responses: pathItem[method].responses, responseKey };
        });
      }
      return [];
    }

    function getGenericPasteTarget(documentModel, node) {
      const target = getValueAtPointer(documentModel, node.pointer);
      if (Array.isArray(target)) return { parent: target, key: String(target.length), focusPointer: `${node.pointer}/${target.length}`, asArray: true };
      if (target && typeof target === "object") {
        const key = openApiClipboard?.key || uniqueObjectKey(target, "copied");
        return { parent: target, key, focusPointer: `${node.pointer}/${encodePointerSegment(key)}`, asArray: false };
      }
      const parentInfo = getParentAtPointer(documentModel, node.pointer);
      if (!parentInfo?.parent) return null;
      return { parent: parentInfo.parent, key: parentInfo.key, focusPointer: node.pointer, asArray: Array.isArray(parentInfo.parent) };
    }

    async function confirmOpenApiPaste(view, options) {
      const notify = deps.notify;
      if (notify?.confirm) return notify.confirm(options);
      view.status.textContent = options?.message || "Paste needs confirmation.";
      view.status.dataset.tone = "warning";
      return false;
    }

    async function pasteOpenApiResponse(view, node, nextDocument) {
      const targets = ensureResponsePasteTargets(nextDocument, node).filter((target) => target.responses && typeof target.responses === "object" && !Array.isArray(target.responses));
      if (!targets.length) return null;
      const responseEntries = getResponseClipboardEntries();
      if (!responseEntries.length) return null;
      const conflictingTargets = targets.filter((target) => responseEntries.some(([responseKey]) => Object.prototype.hasOwnProperty.call(target.responses, responseKey)));
      if (conflictingTargets.length) {
        const confirmed = await confirmOpenApiPaste(view, {
          title: `Overwrite ${getOpenApiClipboardLabel(openApiClipboard)}?`,
          message: `${getOpenApiClipboardLabel(openApiClipboard)} already exists in ${conflictingTargets.length} destination${conflictingTargets.length === 1 ? "" : "s"}. Overwrite it?`,
          confirmLabel: "Overwrite",
          confirmVariant: "danger",
          cancelLabel: "Cancel"
        });
        if (!confirmed) return false;
      }
      targets.forEach((target) => {
        responseEntries.forEach(([responseKey, responseValue]) => {
          target.responses[responseKey] = cloneOpenApiValue(responseValue);
        });
      });
      return `${targets[0].responsesPointer}/${encodePointerSegment(responseEntries[0][0])}`;
    }

    async function pasteOpenApiElement(view, node) {
      if (!openApiClipboard) return;
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      let focusPointer = null;
      if (isResponseClipboard()) {
        focusPointer = await pasteOpenApiResponse(view, node, nextDocument);
      }
      if (focusPointer === null) {
        const confirmed = await confirmOpenApiPaste(view, {
          title: "Paste OpenAPI Element Anyway?",
          message: `"${node.label || node.id || "This OpenAPI element"}" is not a standard destination for ${getOpenApiClipboardLabel(openApiClipboard)}. Paste it anyway?`,
          confirmLabel: "Paste Anyway",
          cancelLabel: "Cancel"
        });
        if (!confirmed) return;
        const target = getGenericPasteTarget(nextDocument, node);
        if (!target) return;
        if (!target.asArray && Object.prototype.hasOwnProperty.call(target.parent, target.key)) {
          const overwrite = await confirmOpenApiPaste(view, {
            title: `Overwrite ${target.key}?`,
            message: `"${target.key}" already exists at the selected destination. Overwrite it?`,
            confirmLabel: "Overwrite",
            confirmVariant: "danger",
            cancelLabel: "Cancel"
          });
          if (!overwrite) return;
        }
        if (target.asArray) target.parent.push(cloneOpenApiValue(openApiClipboard.value));
        else target.parent[target.key] = cloneOpenApiValue(openApiClipboard.value);
        focusPointer = target.focusPointer;
      }
      if (focusPointer === false) return;
      applyOpenApiDocumentEdit(view, nextDocument, focusPointer);
      view.status.textContent = `Pasted ${getOpenApiClipboardLabel(openApiClipboard)}.`;
      view.status.dataset.tone = "success";
    }
    function findTreeNode(rootNode, predicate) {
      if (!rootNode) return null;
      if (predicate(rootNode)) return rootNode;
      for (const child of rootNode.children || []) {
        const found = findTreeNode(child, predicate);
        if (found) return found;
      }
      return null;
    }

    function findTreeNodeByPointer(documentModel, pointer) {
      const tree = explorer.buildOpenApiExplorer(documentModel || {});
      return findTreeNode(tree, (node) => node.pointer === pointer);
    }

    function focusOpenApiPointer(view, pointer) {
      const node = findTreeNodeByPointer(view.documentModel, pointer) || findTreeNodeByPointer(view.documentModel, getParentPointer(pointer));
      if (!node) return;
      view.selectedNodeId = node.id || "";
      view.selectedOperation = node.kind === "operation" ? node : null;
      renderSelectedOperation(view);
      updateSelectionStyles(view);
      scrollSourceEditorToNode(view, node);
      Array.from(view.explorer.querySelectorAll?.(".openapi-tree-node") || []).find((item) => item.dataset.nodeId === (node.id || ""))?.focus?.();
    }

    function applyOpenApiDocumentEdit(view, nextDocument, focusPointer) {
      const nextText = generator.stringifyOpenApi(nextDocument, getTabFilePath(view));
      setTabContent(view.tab, nextText);
      refreshView(view);
      if (focusPointer) focusOpenApiPointer(view, focusPointer);
      deps.refreshTabs?.();
    }

    function uniqueObjectKey(object, baseKey) {
      const base = String(baseKey || "item");
      if (!Object.prototype.hasOwnProperty.call(object || {}, base)) return base;
      let suffix = 1;
      let candidate = `${base}-${suffix}`;
      while (Object.prototype.hasOwnProperty.call(object || {}, candidate)) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
      }
      return candidate;
    }

    function uniqueParameterName(parameters, baseName) {
      const names = new Set((parameters || []).map((parameter) => String(parameter?.name || "")));
      if (!names.has(baseName)) return baseName;
      let suffix = 1;
      let candidate = `${baseName}${suffix}`;
      while (names.has(candidate)) {
        suffix += 1;
        candidate = `${baseName}${suffix}`;
      }
      return candidate;
    }

    function createOperationId(method, path) {
      const words = String(path || "/").split(/[/{}/_-]+/).filter(Boolean);
      const suffix = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("") || "Root";
      return `${String(method || "get").toLowerCase()}${suffix}`;
    }

    function createOpenApiOperationTemplate(method, path) {
      return {
        summary: "TODO summary",
        operationId: createOperationId(method, path),
        tags: ["default"],
        parameters: [],
        responses: {
          "200": {
            description: "TODO response"
          }
        }
      };
    }

    function createOpenApiParameterTemplate(parameters) {
      return {
        name: uniqueParameterName(parameters, "newParameter"),
        in: "query",
        required: false,
        schema: { type: "string" },
        example: "TODO"
      };
    }

    function formatHttpMethodLabel(method) {
      const normalized = String(method || "").toLowerCase();
      return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Operation";
    }
    function addOpenApiPath(view) {
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      if (!nextDocument.paths || typeof nextDocument.paths !== "object" || Array.isArray(nextDocument.paths)) nextDocument.paths = {};
      const pathKey = uniqueObjectKey(nextDocument.paths, "/new-path");
      nextDocument.paths[pathKey] = {
        get: createOpenApiOperationTemplate("get", pathKey)
      };
      applyOpenApiDocumentEdit(view, nextDocument, `/paths/${encodePointerSegment(pathKey)}`);
    }

    function addOpenApiOperation(view, node, methodName) {
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      const pathItem = getValueAtPointer(nextDocument, node.pointer);
      if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) return;
      const requestedMethod = String(methodName || "").toLowerCase();
      const method = OPENAPI_HTTP_METHODS.includes(requestedMethod)
        ? requestedMethod
        : OPENAPI_HTTP_METHODS.find((candidate) => !Object.prototype.hasOwnProperty.call(pathItem, candidate));
      if (!method) {
        view.status.textContent = "Every OpenAPI operation method already exists for this path.";
        view.status.dataset.tone = "warning";
        return;
      }
      if (Object.prototype.hasOwnProperty.call(pathItem, method)) {
        view.status.textContent = `${formatHttpMethodLabel(method)} already exists for this path.`;
        view.status.dataset.tone = "warning";
        return;
      }
      const pathKey = getPointerSegments(node.pointer)[1] || "/";
      pathItem[method] = createOpenApiOperationTemplate(method, pathKey);
      applyOpenApiDocumentEdit(view, nextDocument, `${node.pointer}/${method}`);
    }

    function addOpenApiResponseCode(view, node) {
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      const responses = getValueAtPointer(nextDocument, node.pointer);
      if (!responses || typeof responses !== "object" || Array.isArray(responses)) return;
      const responseCode = ["201", "400", "404", "500"].find((code) => !Object.prototype.hasOwnProperty.call(responses, code)) || uniqueObjectKey(responses, "default");
      responses[responseCode] = {
        description: "TODO response",
        content: {
          "application/json": {
            schema: { type: "object" },
            example: {}
          }
        }
      };
      applyOpenApiDocumentEdit(view, nextDocument, `${node.pointer}/${encodePointerSegment(responseCode)}`);
    }

    function addOpenApiParameter(view, node) {
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      const parametersPointer = node.kind === "operation" ? `${node.pointer}/parameters` : node.pointer;
      const operationPointer = node.kind === "operation" ? node.pointer : getParentPointer(node.pointer);
      const operation = getValueAtPointer(nextDocument, operationPointer);
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) return;
      if (!Array.isArray(operation.parameters)) operation.parameters = [];
      const parameter = createOpenApiParameterTemplate(operation.parameters);
      operation.parameters.push(parameter);
      applyOpenApiDocumentEdit(view, nextDocument, `${parametersPointer}/${operation.parameters.length - 1}`);
    }

    function getRenameValue(view, node) {
      const value = getValueAtPointer(view.documentModel, node.pointer);
      if ((node.kind === "parameter" || node.kind === "tag") && value && typeof value === "object" && !Array.isArray(value)) return value.name || node.label || "";
      if (node.kind === "server" && value && typeof value === "object" && !Array.isArray(value)) return value.url || node.label || "";
      if (typeof value === "string") return value;
      const parentInfo = getParentAtPointer(view.documentModel, node.pointer);
      return parentInfo?.key || node.label || "";
    }

    function renameOpenApiElement(view, node, nextName) {
      const trimmedName = String(nextName || "").trim();
      if (!trimmedName) return;
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      const value = getValueAtPointer(nextDocument, node.pointer);
      let focusPointer = node.pointer;
      if ((node.kind === "parameter" || node.kind === "tag") && value && typeof value === "object" && !Array.isArray(value)) {
        value.name = trimmedName;
      } else if (node.kind === "server" && value && typeof value === "object" && !Array.isArray(value)) {
        value.url = trimmedName;
      } else if (typeof value === "string") {
        const parentInfo = getParentAtPointer(nextDocument, node.pointer);
        if (!parentInfo) return;
        if (Array.isArray(parentInfo.parent)) parentInfo.parent[Number(parentInfo.key)] = trimmedName;
        else parentInfo.parent[parentInfo.key] = trimmedName;
      } else {
        const parentInfo = getParentAtPointer(nextDocument, node.pointer);
        if (!parentInfo || !parentInfo.parent || Array.isArray(parentInfo.parent)) return;
        let newKey = trimmedName;
        if (node.kind === "operation") {
          newKey = newKey.toLowerCase();
          if (!OPENAPI_HTTP_METHODS.includes(newKey)) {
            view.status.textContent = "Operation name must be a valid OpenAPI HTTP method.";
            view.status.dataset.tone = "warning";
            return;
          }
        }
        if (newKey !== parentInfo.key && Object.prototype.hasOwnProperty.call(parentInfo.parent, newKey)) {
          view.status.textContent = `Cannot rename because "${newKey}" already exists.`;
          view.status.dataset.tone = "warning";
          return;
        }
        const nextValue = parentInfo.parent[parentInfo.key];
        delete parentInfo.parent[parentInfo.key];
        parentInfo.parent[newKey] = nextValue;
        focusPointer = `${parentInfo.parentPointer}/${encodePointerSegment(newKey)}`;
      }
      applyOpenApiDocumentEdit(view, nextDocument, focusPointer);
    }

    async function promptRenameOpenApiElement(view, node) {
      const notify = deps.notify;
      if (!notify?.prompt) return;
      const currentName = getRenameValue(view, node);
      const nextName = await notify.prompt({
        title: `Rename ${node.label || "OpenAPI element"}`,
        message: "Enter the new OpenAPI element name.",
        value: currentName,
        confirmLabel: "Rename",
        cancelLabel: "Cancel"
      });
      if (nextName === null || nextName === undefined || String(nextName) === String(currentName)) return;
      renameOpenApiElement(view, node, nextName);
    }

    async function deleteOpenApiElement(view, node) {
      const notify = deps.notify;
      const confirmed = notify?.confirm ? await notify.confirm({
        title: `Delete ${node.label || "OpenAPI element"}`,
        message: `Delete "${node.label || node.id || "this OpenAPI element"}" from the OpenAPI document?`,
        confirmLabel: "Delete",
        confirmVariant: "danger",
        cancelLabel: "Cancel"
      }) : false;
      if (!confirmed) return;
      const nextDocument = cloneOpenApiDocument(view.documentModel || parseTabDocument(view.tab));
      const parentInfo = getParentAtPointer(nextDocument, node.pointer);
      if (!parentInfo) return;
      if (Array.isArray(parentInfo.parent)) parentInfo.parent.splice(Number(parentInfo.key), 1);
      else delete parentInfo.parent[parentInfo.key];
      applyOpenApiDocumentEdit(view, nextDocument, parentInfo.parentPointer);
    }

    function isResponsesFolderNode(node) {
      const segments = getPointerSegments(node.pointer);
      return segments[segments.length - 1] === "responses";
    }

    function isOperationParametersFolderNode(node) {
      const segments = getPointerSegments(node.pointer);
      return segments.length >= 4 && segments[0] === "paths" && OPENAPI_HTTP_METHODS.includes(segments[2]) && segments[segments.length - 1] === "parameters";
    }

    function getOpenApiOperationMethodActions(view, node) {
      const pathItem = getValueAtPointer(view.documentModel || parseTabDocument(view.tab), node.pointer) || {};
      return OPENAPI_HTTP_METHODS.map((method) => ({
        label: formatHttpMethodLabel(method),
        icon: "bi-plus-circle",
        disabled: Object.prototype.hasOwnProperty.call(pathItem, method),
        run: () => addOpenApiOperation(view, node, method)
      }));
    }

    function getOpenApiContextActions(view, node) {
      const actions = [];
      if (node.pointer === "/paths") actions.push({ label: "Add Path", icon: "bi-signpost-split", run: () => addOpenApiPath(view) });
      if (node.kind === "path") actions.push({ label: "Add Operation", icon: "bi-plus-circle", children: getOpenApiOperationMethodActions(view, node) });
      if (isResponsesFolderNode(node)) actions.push({ label: "Add Response Code", icon: "bi-reply", run: () => addOpenApiResponseCode(view, node) });
      if (node.kind === "operation" || isOperationParametersFolderNode(node)) actions.push({ label: "Add Parameter", icon: "bi-sliders", run: () => addOpenApiParameter(view, node) });
      if (node.pointer) {
        if (actions.length) actions.push({ separator: true });
        actions.push({ label: `Copy ${node.label || "OpenAPI element"}`, icon: "bi-copy", run: () => copyOpenApiElement(view, node) });
        actions.push({ label: "Paste", icon: "bi-clipboard-plus", disabled: !openApiClipboard, run: () => pasteOpenApiElement(view, node) });
        actions.push({ separator: true });
        actions.push({ label: `Rename ${node.label || "OpenAPI element"}...`, icon: "bi-pencil", run: () => promptRenameOpenApiElement(view, node) });
        actions.push({ label: `Delete ${node.label || "OpenAPI element"}...`, icon: "bi-trash", danger: true, run: () => deleteOpenApiElement(view, node) });
      }
      return actions;
    }

    function hideOpenApiContextMenu(view) {
      if (!view?.contextMenu) return;
      view.contextMenu.classList.add("hidden");
      view.contextMenu.textContent = "";
    }

    function createOpenApiContextMenu(view) {
      if (view.contextMenu) return view.contextMenu;
      const menu = createElement("div", "graph-context-menu openapi-context-menu hidden");
      menu.setAttribute("role", "menu");
      (document.body || view.root).appendChild(menu);
      view.contextMenu = menu;
      root.addEventListener?.("resize", () => hideOpenApiContextMenu(view));
      document.addEventListener?.("pointerdown", (event) => {
        if (!menu.contains?.(event.target)) hideOpenApiContextMenu(view);
      });
      document.addEventListener?.("keydown", (event) => {
        if (event.key === "Escape") hideOpenApiContextMenu(view);
      });
      return menu;
    }

    function createOpenApiContextMenuButton(view, action) {
      const button = createElement("button", action.danger ? "graph-context-menu-item graph-context-menu-item-danger" : "graph-context-menu-item");
      button.type = "button";
      button.disabled = action.disabled === true;
      if (action.disabled) button.setAttribute("aria-disabled", "true");
      button.setAttribute("role", "menuitem");
      const icon = createElement("i", `bi ${action.icon || "bi-dot"}`);
      icon.setAttribute("aria-hidden", "true");
      const label = createElement("span", "graph-context-menu-item-label", action.label);
      button.append(icon, label);
      if (!action.disabled && typeof action.run === "function") {
        button.addEventListener("click", () => {
          hideOpenApiContextMenu(view);
          void action.run?.();
        });
      }
      return button;
    }

    function createOpenApiContextSubmenu(view, action) {
      const submenu = createElement("div", action.disabled ? "graph-context-menu-submenu disabled" : "graph-context-menu-submenu");
      const trigger = createOpenApiContextMenuButton(view, { ...action, run: null });
      trigger.setAttribute("aria-haspopup", "true");
      const arrow = createElement("span", "graph-context-menu-submenu-arrow", ">");
      trigger.appendChild(arrow);
      const panel = createElement("div", "graph-context-menu-submenu-panel");
      panel.setAttribute("role", "menu");
      (action.children || []).forEach((child) => panel.appendChild(createOpenApiContextMenuItem(view, child)));
      submenu.append(trigger, panel);
      return submenu;
    }

    function createOpenApiContextMenuItem(view, action) {
      if (action.separator) return createElement("div", "graph-context-menu-separator");
      if (Array.isArray(action.children)) return createOpenApiContextSubmenu(view, action);
      return createOpenApiContextMenuButton(view, action);
    }

    function showOpenApiContextMenu(view, event, node) {
      const actions = getOpenApiContextActions(view, node);
      if (!actions.length) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      selectExplorerNode(view, node);
      const menu = createOpenApiContextMenu(view);
      menu.textContent = "";
      actions.forEach((action) => menu.appendChild(createOpenApiContextMenuItem(view, action)));
      menu.classList.remove("hidden");
      const bounds = menu.getBoundingClientRect?.() || { width: 220, height: Math.max(32, actions.length * 32) };
      const viewportWidth = root.innerWidth || document.documentElement?.clientWidth || 1200;
      const viewportHeight = root.innerHeight || document.documentElement?.clientHeight || 800;
      const left = Math.max(4, Math.min(event.clientX || 0, viewportWidth - bounds.width - 4));
      const top = Math.max(4, Math.min(event.clientY || 0, viewportHeight - bounds.height - 4));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }
    function createToolbar(view) {
      const toolbar = createElement("div", "openapi-toolbar");
      [
        ["Preview", "bi-eye", () => openSwaggerUiPreview(view)],
        ["Validate", "bi-check2-circle", () => validateOpenApiDocument(view, { publishProblems: true })],
        ["Open in API Client", "bi-send", () => openSelectedOperationInApiClient(view)],
        ["Generate From Endpoints", "bi-diagram-3", () => { void generateFromSelectedScope(view); }],
        ["Update From Endpoints", "bi-arrow-repeat", () => { void generateFromSelectedScope(view); }]
      ].forEach(([label, iconClass, run]) => {
        const button = createElement("button", "tool-button openapi-toolbar-button");
        button.type = "button";
        button.title = label;
        button.innerHTML = `<i class="bi ${iconClass}" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
        button.addEventListener("click", run);
        toolbar.appendChild(button);
      });
      return toolbar;
    }

    function mountOpenApiEditorTab(tab, rootElement) {
      let view = views.get(tab.id);
      if (view?.root === rootElement) {
        ensureSourceCodeMirror(view);
        return;
      }
      rootElement.textContent = "";
      const shell = createElement("div", "openapi-editor-shell");
      const sourceInput = createElement("textarea", "openapi-source-editor");
      sourceInput.spellcheck = false;
      sourceInput.dataset.language = "yaml";
      sourceInput.value = String(tab.content || "");
      const explorerElement = createElement("nav", "openapi-explorer");
      const preview = createElement("main", "openapi-preview");
      const details = createElement("aside", "openapi-details");
      const issues = createElement("div", "openapi-issues");
      const status = createElement("div", "openapi-status");
      const serverInput = createElement("input", "openapi-server-input");
      serverInput.type = "text";
      serverInput.placeholder = "Server URL";
      view = { tab, root: rootElement, shell, sourceInput, explorer: explorerElement, preview, details, issues, status, serverInput, documentModel: null, selectedOperation: null, selectedNodeId: "", collapsedNodeIds: new Set() };
      const toolbar = createToolbar(view);
      const serverBar = createElement("label", "openapi-server-bar", "Server");
      serverBar.appendChild(serverInput);
      const center = createElement("section", "openapi-center");
      center.append(sourceInput, issues);
      shell.append(toolbar, serverBar, explorerElement, center, preview, details, status);
      rootElement.appendChild(shell);
      sourceInput.addEventListener("focus", () => setOpenApiActiveEditorOverride(view));
      sourceInput.addEventListener("click", () => setOpenApiActiveEditorOverride(view));
      sourceInput.addEventListener("input", () => {
        setOpenApiActiveEditorOverride(view);
        syncTabContent(view);
        refreshView(view);
      });
      views.set(tab.id, view);
      ensureSourceCodeMirror(view);
      refreshView(view);
    }

    function destroyOpenApiEditorTab(tabId) {
      const view = views.get(tabId);
      clearOpenApiActiveEditorOverride(view);
      removeOpenApiReferenceNavigation(view);
      view?.sourceCodeMirror?.destroy?.();
      view?.contextMenu?.remove?.();
      views.delete(tabId);
    }

    function mountOpenApiPreviewTab(tab, rootElement) {
      rootElement.textContent = "";
      const shell = createElement("div", "openapi-preview-tab-shell");
      shell.appendChild(createElement("div", "openapi-empty-state", "Loading Swagger UI preview..."));
      rootElement.appendChild(shell);
      const render = () => renderSwaggerUiSpec(shell, tab?.openapiPreview || {});
      if (rootElement.hidden === true) {
        const schedule = typeof root.requestAnimationFrame === "function"
          ? root.requestAnimationFrame.bind(root)
          : (callback) => (typeof root.setTimeout === "function" ? root.setTimeout(callback, 0) : callback());
        schedule(render);
      } else {
        render();
      }
    }

    function refreshOpenApiPreviewTab(tab) {
      if (!tab?.id) return;
      const rootElement = document?.querySelector?.(`[data-tab-id="${tab.id}"]`);
      if (rootElement && !rootElement.hidden) mountOpenApiPreviewTab(tab, rootElement);
    }

    const api = {
      getTabContent,
      setTabContent,
      mountOpenApiEditorTab,
      mountOpenApiPreviewTab,
      destroyOpenApiEditorTab,
      destroyOpenApiPreviewTab() {},
      parseTabDocument,
      validateOpenApiDocument,
      validateTab,
      canOpenQuickFix,
      openQuickFix,
      refreshOpenApiPreviewTab,
      isOpenApiFileContent,
      generateCodeFromFile,
      runOpenApiSourceAction,
      refreshTab(tab) {
        const view = views.get(tab?.id);
        if (view) refreshView(view);
      }
    };
    app.registerModule?.("openApiEditor", api);
    return api;
  }

  root.registerMarkdownViewerOpenApiEditor = registerMarkdownViewerOpenApiEditor;
})(typeof window !== "undefined" ? window : globalThis, typeof document !== "undefined" ? document : null);




