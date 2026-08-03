// Safe preparation and customization of JDT Extract Method workspace edits.
(function(global) {
  "use strict";

  const JAVA_KEYWORDS = new Set((
    "abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new " +
    "package private protected public record return sealed short static strictfp super switch synchronized " +
    "this throw throws transient try var void volatile while yield permits non-sealed true false null"
  ).split(/\s+/));

  function isValidJavaIdentifier(value) {
    const name = String(value || "").trim();
    return /^[A-Za-z_$][\w$]*$/.test(name) && !JAVA_KEYWORDS.has(name);
  }

  function createMarkdownViewerJavaExtractMethodWorkspaceEdit(options = {}) {
    const getWorkspaceEditPreview = options.getWorkspaceEditPreview || function() { return null; };
    const getActiveEditorPath = options.getActiveEditorPath || function() { return ""; };
    const fromFileUri = options.fromFileUri || function() { return ""; };

    function clone(value) {
      if (typeof structuredClone === "function") return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    }

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function comparePosition(left, right) {
      return (Number(left?.line) || 0) - (Number(right?.line) || 0)
        || (Number(left?.character) || 0) - (Number(right?.character) || 0);
    }

    function collectTextEditGroups(workspaceEdit) {
      const groups = [];
      Object.entries(workspaceEdit?.changes || {}).forEach(([uri, edits]) => {
        groups.push({ uri, edits });
      });
      (workspaceEdit?.documentChanges || []).forEach((change) => {
        if (change?.textDocument?.uri) groups.push({ uri: change.textDocument.uri, edits: change.edits });
        else if (change?.kind) throw new Error("Extract Method returned a resource operation.");
      });
      return groups;
    }

    function validateTextEdits(workspaceEdit, expectedUri) {
      const groups = collectTextEditGroups(workspaceEdit);
      if (!groups.length || groups.every((group) => !Array.isArray(group.edits) || !group.edits.length)) {
        throw new Error("JDT returned an empty Extract Method workspace edit.");
      }
      groups.forEach((group) => {
        if (group.uri !== expectedUri) throw new Error("Extract Method returned edits for another file.");
        const edits = Array.isArray(group.edits) ? group.edits : [];
        edits.forEach((edit) => {
          if (!edit?.range) throw new Error("Extract Method returned a text edit without a range.");
        });
        const sorted = edits.slice().sort((left, right) =>
          comparePosition(left.range.start, right.range.start) || comparePosition(left.range.end, right.range.end)
        );
        for (let index = 1; index < sorted.length; index += 1) {
          if (comparePosition(sorted[index].range.start, sorted[index - 1].range.end) < 0) {
            throw new Error("Extract Method returned overlapping text edits.");
          }
        }
      });
      return groups;
    }

    function getRenamePosition(refactor) {
      const command = refactor?.command;
      const position = Array.isArray(command?.arguments) ? command.arguments[0] : null;
      if (command?.command !== "java.action.rename" || !position?.uri
        || !Number.isFinite(Number(position.offset)) || !Number.isFinite(Number(position.length))) {
        throw new Error("JDT did not return Extract Method naming metadata.");
      }
      return {
        uri: position.uri,
        offset: Math.max(0, Number(position.offset)),
        length: Math.max(0, Number(position.length))
      };
    }

    function getModifiedOperation(preview, expectedPath) {
      const operations = (preview?.operations || []).filter((operation) => operation.type === "modify");
      if (operations.length !== 1 || normalizePath(operations[0].path) !== normalizePath(expectedPath)) {
        throw new Error("Extract Method must modify only the active Java file.");
      }
      return operations[0];
    }

    function getInferredMethodName(preview, renamePosition, expectedPath) {
      const operation = getModifiedOperation(preview, expectedPath);
      const name = String(operation.afterContent || "").slice(
        renamePosition.offset,
        renamePosition.offset + renamePosition.length
      );
      if (!isValidJavaIdentifier(name)) throw new Error("JDT returned an invalid generated method name.");
      return name;
    }

    function escapeRegExp(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function replaceGeneratedNames(workspaceEdit, inferredName, methodName) {
      if (methodName === inferredName) return workspaceEdit;
      const pattern = new RegExp(`\\b${escapeRegExp(inferredName)}(?=\\s*\\()`, "g");
      let replacementCount = 0;
      collectTextEditGroups(workspaceEdit).forEach((group) => {
        (group.edits || []).forEach((edit) => {
          const original = String(edit.newText ?? "");
          edit.newText = original.replace(pattern, () => {
            replacementCount += 1;
            return methodName;
          });
        });
      });
      if (replacementCount < 2) {
        throw new Error("JDT did not expose both generated Extract Method name occurrences.");
      }
      return workspaceEdit;
    }

    function customizeMethodSignature(signature, inferredName, settings = {}) {
      const methodName = String(settings.methodName || inferredName).trim();
      const text = String(signature || "").replace(new RegExp(`\\b${escapeRegExp(inferredName)}(?=\\s*\\()`), methodName);
      const nameMatch = new RegExp(`\\b${escapeRegExp(methodName)}(?=\\s*\\()`).exec(text);
      if (!nameMatch) throw new Error("JDT generated method declaration could not be customized safely.");
      const prefix = text.slice(0, nameMatch.index);
      const indentation = /^[\t ]*/.exec(prefix)?.[0] || "";
      const header = prefix.slice(indentation.length);
      const inferredAccess = /\b(public|protected|private)\b/.exec(header)?.[1] || "package";
      const accessModifier = settings.accessModifier || inferredAccess;
      if (!["public", "protected", "package", "private"].includes(accessModifier)) throw new Error("Select a valid Java access modifier.");
      const isStatic = /\bstatic\b/.test(header);
      const isFinal = settings.declareFinal === undefined ? /\bfinal\b/.test(header) : settings.declareFinal === true;
      const isSynchronized = settings.declareSynchronized === undefined
        ? /\bsynchronized\b/.test(header)
        : settings.declareSynchronized === true;
      const remainingHeader = header
        .replace(/\b(?:public|protected|private|static|final|synchronized)\b[\t ]*/g, "")
        .trimStart();
      const modifiers = [
        accessModifier === "package" ? "" : accessModifier,
        isStatic ? "static" : "",
        isFinal ? "final" : "",
        isSynchronized ? "synchronized" : ""
      ].filter(Boolean);
      return `${indentation}${modifiers.length ? `${modifiers.join(" ")} ` : ""}${remainingHeader}${text.slice(nameMatch.index)}`;
    }

    function customizeGeneratedMethodDeclaration(workspaceEdit, methodName, settings) {
      const declarationPattern = new RegExp(
        `^[\\t ]*(?:(?:public|protected|private|static|final|synchronized|native|abstract|strictfp|default)\\s+)*` +
        `(?:[\\w$@.<>,?\\[\\]&]+[\\t ]+)+${escapeRegExp(methodName)}\\s*\\([^)]*\\)` +
        `(?:\\s+throws\\s+[^\\{]+)?\\s*\\{`,
        "m"
      );
      let declarationCount = 0;
      collectTextEditGroups(workspaceEdit).forEach((group) => {
        (group.edits || []).forEach((edit) => {
          const original = String(edit.newText ?? "");
          const match = declarationPattern.exec(original);
          if (!match) return;
          declarationCount += 1;
          if (declarationCount > 1) throw new Error("JDT returned multiple generated method declarations.");
          let declaration = customizeMethodSignature(match[0], methodName, { ...settings, methodName });
          if (settings.generateMethodComment === true) {
            const indentation = /^[\t ]*/.exec(match[0])?.[0] || "";
            const precedingText = original.slice(0, match.index).trimEnd();
            if (!precedingText.endsWith("*/")) {
              declaration = `${indentation}/**\n${indentation} * Extracted method.\n${indentation} */\n${declaration}`;
            }
          }
          edit.newText = `${original.slice(0, match.index)}${declaration}${original.slice(match.index + match[0].length)}`;
        });
      });
      if (declarationCount !== 1) throw new Error("JDT did not expose one generated method declaration.");
      return workspaceEdit;
    }
    function deriveMethodSignature(source, methodName) {
      const escapedName = escapeRegExp(methodName);
      const pattern = new RegExp(
        `^[\\t ]*(?:(?:public|protected|private|static|final|synchronized|native|abstract|strictfp|default)\\s+)*` +
        `[\\w$@.<>,?\\[\\]&\\s]+\\s+${escapedName}\\s*\\([^)]*\\)(?:\\s+throws\\s+[^\\{]+)?\\s*\\{`,
        "m"
      );
      const match = pattern.exec(String(source || ""));
      if (!match) return `${methodName}(...)`;
      return match[0].trim().replace(/\s*\{$/, "").replace(/\s+/g, " ");
    }

    async function resolvePreview(workspaceEdit) {
      const previewService = getWorkspaceEditPreview();
      if (!previewService?.resolve || !previewService?.apply) {
        throw new Error("Workspace edit preview is unavailable.");
      }
      return previewService.resolve({
        title: "Extract Method",
        provenance: "JDT",
        workspaceEdit
      });
    }

    /**
     * Prepare one validated Extract Method proposal for display or application.
     * @param {object} refactor JDT RefactorWorkspaceEdit response.
     * @param {{fileUri:string, methodName?:string, accessModifier?:string, declareFinal?:boolean,
     * declareSynchronized?:boolean, generateMethodComment?:boolean}} settings Safe generated-method customizations.
     * @returns {Promise<object>} Preview plus inferred naming and signature metadata.
     */
    async function prepare(refactor, settings = {}) {
      if (refactor?.errorMessage) throw new Error(refactor.errorMessage);
      if (!refactor?.edit) throw new Error("JDT did not return an Extract Method workspace edit.");
      const fileUri = String(settings.fileUri || "");
      const activePath = getActiveEditorPath();
      if (!fileUri || normalizePath(fromFileUri(fileUri)) !== normalizePath(activePath)) {
        throw new Error("Extract Method is stale for the active Java file.");
      }
      const renamePosition = getRenamePosition(refactor);
      if (renamePosition.uri !== fileUri) throw new Error("Extract Method naming metadata targets another file.");

      const originalEdit = clone(refactor.edit);
      validateTextEdits(originalEdit, fileUri);
      const inferredPreview = await resolvePreview(originalEdit);
      const inferredName = getInferredMethodName(inferredPreview, renamePosition, activePath);
      const methodName = String(settings.methodName || inferredName).trim();
      if (!isValidJavaIdentifier(methodName)) throw new Error("Enter a valid Java method name.");

      const workspaceEdit = replaceGeneratedNames(clone(refactor.edit), inferredName, methodName);
      const hasDeclarationCustomization = ["accessModifier", "declareFinal", "declareSynchronized", "generateMethodComment"]
        .some((name) => Object.prototype.hasOwnProperty.call(settings, name));
      if (hasDeclarationCustomization) customizeGeneratedMethodDeclaration(workspaceEdit, methodName, settings);
      validateTextEdits(workspaceEdit, fileUri);
      const preview = methodName === inferredName && !hasDeclarationCustomization
        ? inferredPreview
        : await resolvePreview(workspaceEdit);
      const operation = getModifiedOperation(preview, activePath);
      preview.defaultMethodName = inferredName;
      preview.methodName = methodName;
      preview.methodSignature = deriveMethodSignature(operation.afterContent, methodName);
      return preview;
      preview.extractMethodSettings = {
        accessModifier: settings.accessModifier,
        declareFinal: settings.declareFinal,
        declareSynchronized: settings.declareSynchronized,
        generateMethodComment: settings.generateMethodComment === true
      };
    }

    /** Apply one previously prepared Extract Method preview transactionally. */
    async function apply(preview) {
      return getWorkspaceEditPreview().apply(preview);
    }

    return { apply, customizeMethodSignature, prepare };
  }

  createMarkdownViewerJavaExtractMethodWorkspaceEdit._test = { isValidJavaIdentifier };
  global.createMarkdownViewerJavaExtractMethodWorkspaceEdit = createMarkdownViewerJavaExtractMethodWorkspaceEdit;
})(typeof window !== "undefined" ? window : globalThis);
