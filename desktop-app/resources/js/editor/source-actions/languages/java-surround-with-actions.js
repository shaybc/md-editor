// Java Surround With Source-action provider and JDT LS refactoring bridge.
(function(window) {
  'use strict';

  const JDT_ACTIONS = Object.freeze([
    Object.freeze({ id: 'jdt-try-catch', label: 'Try/catch Block', icon: 'bi-shield-exclamation', matches(title) {
      return /surround.*try\s*[/ -]?\s*catch/i.test(title) && !/multi/i.test(title);
    } }),
    Object.freeze({ id: 'jdt-try-multi-catch', label: 'Try/multi-catch Block', icon: 'bi-shield-exclamation', matches(title) {
      return /surround.*try\s*[/ -]?\s*multi[ -]?catch/i.test(title);
    } }),
    Object.freeze({ id: 'jdt-try-with-resources', label: 'Try-with-resources Block', icon: 'bi-box-seam', matches(title) {
      return /surround.*try[ -]?with[ -]?resources/i.test(title);
    } })
  ]);

  /**
   * Register Java Surround With actions with the shared Source submenu.
   * @param {object} app Application module registry.
   * @param {object} deps Editor and Java-language service dependencies.
   * @returns {{prepareAvailableActions:function(object=):Promise<boolean>, applyTemplate:function(string,object=):object, applyJdtAction:function(object,object=):Promise<object>}} Surround With API.
   */
  function registerMarkdownViewerJavaSurroundWithActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const templates = deps.templates || window.markdownViewerJavaSurroundWithTemplates;
    const javaSourceActions = deps.javaSourceActions || app.modules?.javaSourceActions || null;
    const activeEditorCommands = deps.activeEditorCommands || null;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ''; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ''; };
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return /\.java$/i.test(String(getActiveEditorPath() || '')); };
    const requestClient = deps.requestClient || null;
    const lspServerRegistry = deps.lspServerRegistry || null;
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const preparedActions = new Map();
    const pendingPreparations = new Map();

    function log(level, message, details) {
      try { appDebugLog(level, message, details); } catch (_error) {}
    }

    function normalizeSelection(context = {}) {
      const source = String(context.source ?? getActiveEditorValue());
      const start = Math.max(0, Math.min(source.length, Number(context.selection?.start) || 0));
      const end = Math.max(start, Math.min(source.length, Number(context.selection?.end) || start));
      return { source, start, end };
    }

    function hasJavaStatementSelection(context = {}) {
      if (!isActiveJavaFile()) return false;
      const selection = normalizeSelection(context);
      return selection.start < selection.end && !!selection.source.slice(selection.start, selection.end).trim();
    }

    function getSelectionKey(context = {}) {
      const selection = normalizeSelection(context);
      return [String(getActiveEditorPath() || '').replace(/\\/g, '/'), selection.start, selection.end, selection.source].join('|');
    }

    function offsetToPosition(source, offset) {
      const bounded = Math.max(0, Math.min(String(source || '').length, Number(offset) || 0));
      const before = String(source || '').slice(0, bounded);
      const lines = before.split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].replace(/\r$/, '').length };
    }

    function getWorkspaceEdit(action) {
      if (action?.edit) return action.edit;
      const command = action?.command;
      if (command?.command !== 'java.apply.workspaceEdit') return null;
      const candidate = Array.isArray(command.arguments) ? command.arguments[0] : null;
      return candidate && typeof candidate === 'object' ? candidate : null;
    }

    function recognizeJdtActions(actions, preparedContext) {
      return JDT_ACTIONS.flatMap(function(definition) {
        const action = (Array.isArray(actions) ? actions : []).find(function(candidate) {
          return definition.matches(String(candidate?.title || ''));
        });
        return action ? [{ definition, action, preparedContext }] : [];
      });
    }

    async function requestJdtActions(context = {}) {
      if (!javaSourceActions || !requestClient) return [];
      const selection = normalizeSelection(context);
      const javaContext = javaSourceActions.getActiveJavaContext?.();
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      if (!javaContext || !codeMirrorEditor) return [];
      const documentContext = await javaSourceActions.getActiveLspDocumentContext?.(javaContext, codeMirrorEditor);
      const fileUri = documentContext?.fileUri || lspServerRegistry?.toFileUri?.(javaContext.path);
      if (!documentContext?.transport || !fileUri) return [];
      const actions = await requestClient.request(documentContext.transport, 'textDocument/codeAction', {
        textDocument: { uri: fileUri },
        range: {
          start: offsetToPosition(selection.source, selection.start),
          end: offsetToPosition(selection.source, selection.end)
        },
        context: { diagnostics: [], only: ['refactor'] }
      }, { label: 'Java Surround With' });
      return recognizeJdtActions(actions, {
        source: selection.source,
        path: javaContext.path,
        fileUri,
        transport: documentContext.transport
      });
    }

    /** Prepare selection-aware JDT actions while local templates remain immediately available. */
    async function prepareAvailableActions(context = {}) {
      if (!hasJavaStatementSelection(context) || !javaSourceActions || !requestClient) return false;
      const key = getSelectionKey(context);
      if (preparedActions.has(key)) return false;
      if (pendingPreparations.has(key)) return pendingPreparations.get(key);
      const pending = requestJdtActions(context)
        .then(function(actions) {
          preparedActions.set(key, actions);
          return true;
        })
        .catch(function(error) {
          preparedActions.set(key, []);
          log('warning', '[lsp] Java Surround With discovery failed', { message: error?.message || String(error) });
          return true;
        })
        .finally(function() { pendingPreparations.delete(key); });
      pendingPreparations.set(key, pending);
      return pending;
    }

    function refreshEditorStatus() {
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }

    /** Apply one local structural template in one undoable editor replacement. */
    function applyTemplate(templateId, context = {}) {
      const selection = normalizeSelection(context);
      const edit = templates?.buildSurroundEdit?.(templateId, selection.source, selection);
      if (!edit) return { applied: false, reason: 'invalid-selection' };
      if (activeEditorCommands?.replaceActiveEditorRange?.(edit.start, edit.end, edit.replacement) !== true) {
        alertUser('Unable to surround the selected Java statements.');
        return { applied: false, reason: 'apply-failed' };
      }
      activeEditorCommands.setActiveEditorSelection?.(edit.placeholderStart, edit.placeholderEnd);
      activeEditorCommands.focusActiveEditor?.();
      refreshEditorStatus();
      return { applied: true, templateId };
    }

    async function resolveJdtAction(entry) {
      const action = entry?.action;
      if (!action || action.edit || action.command || !action.data) return action;
      return requestClient.request(entry.preparedContext.transport, 'codeAction/resolve', action, {
        label: 'Resolve Java Surround With'
      });
    }

    /** Apply one current-file JDT refactoring returned for the captured selection. */
    async function applyJdtAction(entry) {
      try {
        const preparedContext = entry?.preparedContext;
        if (!preparedContext || preparedContext.source !== getActiveEditorValue()
          || preparedContext.path.replace(/\\/g, '/') !== String(getActiveEditorPath() || '').replace(/\\/g, '/')) {
          throw new Error('The Java selection changed. Open Surround With again.');
        }
        const action = await resolveJdtAction(entry);
        const workspaceEdit = getWorkspaceEdit(action);
        if (!workspaceEdit) throw new Error('The Java language server did not return an editable Surround With change.');
        const edits = javaSourceActions.extractCurrentFileEdits?.(workspaceEdit, preparedContext.fileUri) || [];
        if (!edits.length) throw new Error('The Java language server returned no Surround With edits.');
        const codeMirrorEditor = getActiveCodeMirrorEditor();
        if (!codeMirrorEditor?.applyLspTextEdits?.(edits)) throw new Error('Unable to apply the Java Surround With edit.');
        refreshEditorStatus();
        return { applied: true, editCount: edits.length };
      } catch (error) {
        log('warning', '[lsp] Java Surround With apply failed', { message: error?.message || String(error) });
        alertUser(error?.message || 'The Java Surround With action failed.');
        return { applied: false, reason: 'error', error };
      }
    }

    function getLocalChildren() {
      return (templates?.getTemplates?.() || []).map(function(template) {
        return {
          id: `surround-with-template-${template.id}`,
          label: template.label,
          icon: template.icon,
          run(context) { return applyTemplate(template.id, context); }
        };
      });
    }

    function getJdtChildren(context = {}) {
      if (!javaSourceActions || !requestClient) return [];
      const key = getSelectionKey(context);
      if (!preparedActions.has(key)) {
        return [{ id: 'surround-with-loading', label: 'Loading Java refactorings...', icon: 'bi-hourglass-split', disabled: true }];
      }
      return (preparedActions.get(key) || []).map(function(entry) {
        return {
          id: `surround-with-${entry.definition.id}`,
          label: entry.definition.label,
          icon: entry.definition.icon,
          run() { return applyJdtAction(entry); }
        };
      });
    }

    const provider = sourceActions?.registerProvider?.({
      id: 'java-surround-with-actions',
      prepareAvailableActions,
      getAvailableActions(context = {}) {
        if (!hasJavaStatementSelection(context)) return [];
        const jdtChildren = getJdtChildren(context);
        const localChildren = getLocalChildren();
        return [{
          id: 'surround-with',
          label: 'Surround With',
          shortcut: '',
          icon: 'bi-braces',
          menu: 'root',
          children: jdtChildren.length ? [...jdtChildren, { type: 'separator' }, ...localChildren] : localChildren
        }];
      }
    });

    const api = { provider, prepareAvailableActions, applyTemplate, applyJdtAction, offsetToPosition };
    app.registerModule?.('javaSurroundWithActions', api);
    return api;
  }

  window.registerMarkdownViewerJavaSurroundWithActions = registerMarkdownViewerJavaSurroundWithActions;
})(window);
