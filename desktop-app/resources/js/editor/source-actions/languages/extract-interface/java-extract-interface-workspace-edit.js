// Safe adaptation and preview preparation for JDT Extract Interface workspace edits.
(function(global) {
  "use strict";

  function createMarkdownViewerJavaExtractInterfaceWorkspaceEdit(options = {}) {
    const getWorkspaceEditPreview = options.getWorkspaceEditPreview || function() { return null; };
    const getActiveEditorPath = options.getActiveEditorPath || function() { return ""; };

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function clone(value) {
      if (typeof structuredClone === "function") return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    }

    function rangesOverlap(left, right) {
      function compare(a, b) {
        return (Number(a?.line) || 0) - (Number(b?.line) || 0)
          || (Number(a?.character) || 0) - (Number(b?.character) || 0);
      }
      return compare(left.range.start, right.range.end) < 0 && compare(right.range.start, left.range.end) < 0;
    }

    function mergeTextEdits(workspaceEdit, editsByUri) {
      Object.entries(editsByUri || {}).forEach(([uri, additions]) => {
        if (!Array.isArray(additions) || !additions.length) return;
        let existing = null;
        if (Array.isArray(workspaceEdit.documentChanges)) {
          const change = workspaceEdit.documentChanges.find((candidate) => candidate?.textDocument?.uri === uri);
          if (change) existing = change.edits;
        }
        if (!existing && workspaceEdit.changes?.[uri]) existing = workspaceEdit.changes[uri];
        if (!existing) {
          workspaceEdit.changes = workspaceEdit.changes || {};
          existing = workspaceEdit.changes[uri] = [];
        }
        additions.forEach((addition) => {
          if (existing.some((edit) => rangesOverlap(edit, addition))) {
            throw new Error("The Java language server returned overlapping Extract Interface edits.");
          }
          existing.push(addition);
        });
      });
      return workspaceEdit;
    }

    function getLine(text, lineNumber) {
      return String(text || "").split(/\r?\n/)[Math.max(0, Number(lineNumber) || 0)] || "";
    }

    /** Build replacements only for semantic references used as instanceof type operands. */
    async function collectInstanceofEdits(references, settings = {}) {
      const editsByUri = {};
      const readUri = settings.readUri;
      for (const reference of Array.isArray(references) ? references : []) {
        const uri = reference?.uri || reference?.targetUri || "";
        const range = reference?.range || reference?.targetSelectionRange;
        if (!uri || !range || typeof readUri !== "function") continue;
        const source = await readUri(uri);
        const line = getLine(source, range.start.line);
        const prefix = line.slice(0, Math.max(0, Number(range.start.character) || 0));
        if (!/\binstanceof\s+(?:[A-Za-z_$][\w$]*\.)*$/.test(prefix)) continue;
        const packageName = String(source || "").match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
        const hasVisibleInterface = packageName === settings.packageName
          || new RegExp(`^\\s*import\\s+${String(settings.qualifiedName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`, "m").test(source);
        const newText = hasVisibleInterface || !settings.packageName
          ? settings.interfaceName
          : settings.qualifiedName;
        (editsByUri[uri] ||= []).push({ range, newText });
      }
      return editsByUri;
    }

    function declarationAfter(lines, index) {
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const value = lines[cursor].trim();
        if (value && !value.startsWith("//")) return value.replace(/\s+/g, " ");
      }
      return "";
    }

    function overrideDeclarationCounts(text) {
      const lines = String(text || "").split(/\r?\n/);
      const counts = new Map();
      lines.forEach((line, index) => {
        if (!/^\s*@Override\b/.test(line)) return;
        const declaration = declarationAfter(lines, index);
        counts.set(declaration, (counts.get(declaration) || 0) + 1);
      });
      return counts;
    }

    function removeNewOverrideAnnotations(before, after) {
      const remaining = overrideDeclarationCounts(before);
      const newline = String(after || "").includes("\r\n") ? "\r\n" : "\n";
      const lines = String(after || "").split(/\r?\n/);
      return lines.filter((line, index) => {
        if (!/^\s*@Override\b/.test(line)) return true;
        const declaration = declarationAfter(lines, index);
        const count = remaining.get(declaration) || 0;
        if (!count) return false;
        remaining.set(declaration, count - 1);
        return true;
      }).join(newline);
    }

    function removeGeneratedMemberComments(text) {
      return String(text || "").replace(
        /^[ \t]*\/\*\*[\s\S]*?^[ \t]*\*\/[ \t]*\r?\n(?=[ \t]*(?:(?:public|protected|private|static|final|abstract|default)\s+)*(?:[\w$@.<>,?\[\]&]+\s+)+[A-Za-z_$][\w$]*\s*(?:\(|=|;))/gm,
        ""
      );
    }

    function updateSummary(preview, operation, previousAfterContent) {
      const summary = preview.summary?.find((entry) => entry.type === "modify"
        && normalizePath(entry.path) === normalizePath(operation.path)
        && entry.after === previousAfterContent);
      if (summary) summary.after = operation.afterContent;
    }

    /** Resolve and customize a JDT edit without weakening workspace or dirty-tab validation. */
    async function prepare(workspaceEdit, settings = {}) {
      const previewService = getWorkspaceEditPreview();
      if (!previewService?.resolve || !previewService?.apply) {
        throw new Error("Workspace edit preview is unavailable.");
      }
      const adaptedEdit = mergeTextEdits(clone(workspaceEdit), settings.instanceofEditsByUri || {});
      const preview = await previewService.resolve({
        title: "Extract Interface",
        provenance: "JDT",
        workspaceEdit: adaptedEdit
      });
      const activePath = normalizePath(getActiveEditorPath());
      for (const operation of preview.operations) {
        if (operation.type !== "modify") continue;
        const operationPath = normalizePath(operation.path);
        if (operation.snapshot?.isDirty && operationPath !== activePath) {
          throw new Error(`Save or discard unsaved changes in ${operation.path} before extracting an interface.`);
        }
        if (settings.generateOverrideAnnotations === false && operationPath === activePath) {
          const previousAfterContent = operation.afterContent;
          operation.afterContent = removeNewOverrideAnnotations(operation.beforeContent, operation.afterContent);
          updateSummary(preview, operation, previousAfterContent);
        }
        if (settings.generateMethodComments === false
          && operationPath.endsWith(`/${String(settings.interfaceName || "").toLowerCase()}.java`)
          && operation.beforeContent === "") {
          const previousAfterContent = operation.afterContent;
          operation.afterContent = removeGeneratedMemberComments(operation.afterContent);
          updateSummary(preview, operation, previousAfterContent);
        }
      }
      return preview;
    }

    async function apply(preview) {
      return getWorkspaceEditPreview().apply(preview);
    }

    return { apply, collectInstanceofEdits, mergeTextEdits, prepare };
  }

  global.createMarkdownViewerJavaExtractInterfaceWorkspaceEdit = createMarkdownViewerJavaExtractInterfaceWorkspaceEdit;
})(typeof window !== "undefined" ? window : globalThis);
