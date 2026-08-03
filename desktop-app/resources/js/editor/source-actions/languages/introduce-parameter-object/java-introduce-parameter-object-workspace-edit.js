// Safe Java source transformation, preview, apply, and undo for Introduce Parameter Object.
(function(global) {
  "use strict";

  function createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit(options = {}) {
    const getWorkspaceEditPreview = options.getWorkspaceEditPreview || function() { return null; };
    const getActiveEditorPath = options.getActiveEditorPath || function() { return ""; };
    const toFileUri = options.toFileUri || function() { return ""; };
    const analysisTools = global.createMarkdownViewerJavaParameterObjectAnalysis?._test;
    const modelTools = global.markdownViewerJavaParameterObjectModel;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function offsetToPosition(text, offset) {
      return analysisTools.offsetToPosition(text, offset);
    }

    function locationOffsets(source, range) {
      return {
        start: analysisTools.positionToOffset(source, range.start),
        end: analysisTools.positionToOffset(source, range.end)
      };
    }

    function compareReplacements(left, right) {
      return left.start - right.start || left.end - right.end;
    }

    function applyReplacements(source, replacements, baseOffset = 0) {
      const normalized = replacements.map((replacement) => ({
        start: replacement.start - baseOffset,
        end: replacement.end - baseOffset,
        text: replacement.text
      })).sort(compareReplacements);
      for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index].start < normalized[index - 1].end) {
          throw new Error("Introduce Parameter Object produced overlapping Java edits.");
        }
      }
      let result = String(source || "");
      normalized.slice().reverse().forEach((replacement) => {
        result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
      });
      return result;
    }

    function capitalize(value) {
      const name = String(value || "");
      return name ? name[0].toUpperCase() + name.slice(1) : "";
    }

    function readAccess(model, field) {
      if (!model.createGetters) return `${model.parameterName}.${field.fieldName}`;
      const prefix = String(field.type || "").trim() === "boolean" ? "is" : "get";
      return `${model.parameterName}.${prefix}${capitalize(field.fieldName)}()`;
    }

    function isParameterWrite(source, offsets) {
      const masked = analysisTools.maskJava(source);
      const before = masked.slice(Math.max(0, offsets.start - 8), offsets.start);
      const after = masked.slice(offsets.end, Math.min(masked.length, offsets.end + 12));
      return /(?:\+\+|--)\s*$/.test(before)
        || /^\s*(?:\+\+|--|(?:[+\-*/%&|^]|<<|>>|>>>)?=(?!=))/.test(after);
    }

    function classTypeForCall(model, analysis, uri) {
      if (model.destination === "nested") {
        const qualifiedOwner = analysis.packageName
          ? `${analysis.packageName}.${analysis.owner.name}`
          : analysis.owner.name;
        return uri === analysis.fileUri ? `${analysis.owner.name}.${model.className}` : `${qualifiedOwner}.${model.className}`;
      }
      const callerPackage = String(analysis.sources[uri] || "").match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
      if (!analysis.packageName || callerPackage === analysis.packageName) return model.className;
      return `${analysis.packageName}.${model.className}`;
    }

    function changedArgumentText(argumentTexts, model, analysis, classType) {
      const fields = modelTools.selectedFields(model);
      const selected = new Set(fields.map((field) => field.originalIndex));
      if (argumentTexts.length !== analysis.parameters.length) {
        throw new Error("A Java invocation has an unsupported argument shape.");
      }
      const insertionIndex = Math.min(...fields.map((field) => field.originalIndex));
      const constructorArguments = fields.map((field) => argumentTexts[field.originalIndex].trim()).join(", ");
      const result = [];
      analysis.parameters.forEach((parameter) => {
        if (parameter.originalIndex === insertionIndex) {
          result.push(`new ${classType}(${constructorArguments})`);
        }
        if (!selected.has(parameter.originalIndex)) result.push(argumentTexts[parameter.originalIndex].trim());
      });
      return result.join(", ");
    }

    function referencedMethodToken(masked, offsets, methodName) {
      const escapedName = String(methodName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchStart = Math.max(0, offsets.start - 256);
      const searchEnd = Math.min(masked.length, offsets.end + 256);
      const candidates = [];
      for (const match of masked.slice(searchStart, searchEnd).matchAll(new RegExp(`\\b${escapedName}\\b`, "g"))) {
        const start = searchStart + match.index;
        const end = start + methodName.length;
        let before = start - 1;
        while (before >= 0 && /\s/.test(masked[before])) before -= 1;
        const isMethodReference = masked[before] === ":" && masked[before - 1] === ":";
        let open = end;
        while (open < masked.length && /\s/.test(masked[open])) open += 1;
        if (!isMethodReference && masked[open] !== "(") continue;
        const overlapsRange = start < offsets.end && end > offsets.start;
        const containedByRange = start >= offsets.start && end <= offsets.end;
        const distance = end < offsets.start ? offsets.start - end : (start > offsets.end ? start - offsets.end : 0);
        candidates.push({ start, end, open, isMethodReference, rank: containedByRange ? 0 : (overlapsRange ? 1 : 2), distance });
      }
      return candidates.sort((left, right) => left.rank - right.rank || left.distance - right.distance || left.start - right.start)[0] || null;
    }

    function invocationReplacement(source, reference, model, analysis, uri) {
      const offsets = locationOffsets(source, reference.range);
      const masked = analysisTools.maskJava(source);
      const methodToken = referencedMethodToken(masked, offsets, analysis.methodName);
      const line = offsetToPosition(source, offsets.start).line + 1;
      if (methodToken?.isMethodReference) {
        throw new Error(`Method reference '${analysis.methodName}' at ${uri}:${line} cannot be converted safely.`);
      }
      if (!methodToken) throw new Error(`JDT returned an unsupported '${analysis.methodName}' reference at ${uri}:${line}.`);
      const open = methodToken.open;
      const close = analysisTools.findMatching(masked, open, "(", ")");
      if (close < 0) throw new Error("A Java invocation has an unmatched argument list.");
      let after = close + 1;
      while (after < masked.length && /\s/.test(masked[after])) after += 1;
      const lineStart = masked.lastIndexOf("\n", offsets.start - 1) + 1;
      const declarationPrefix = masked.slice(lineStart, offsets.start).trim();
      const abstractDeclaration = masked[after] === ";"
        && declarationPrefix.includes(" ")
        && !declarationPrefix.includes("{")
        && !/[.=?:,(]\s*$/.test(declarationPrefix);
      if (masked[after] === "{" || masked.slice(after).startsWith("throws ") || abstractDeclaration) {
        throw new Error("Related overriding declarations are not supported by the repo-contained refactoring engine.");
      }
      const ranges = analysisTools.splitTopLevelRanges(source, open + 1, close);
      const argumentsList = ranges.map((range) => source.slice(range.start, range.end));
      return {
        start: open + 1,
        end: close,
        text: changedArgumentText(argumentsList, model, analysis, classTypeForCall(model, analysis, uri))
      };
    }

    function methodRangeContains(analysis, uri, replacement) {
      return uri === analysis.fileUri
        && replacement.start >= analysis.declaration.start
        && replacement.end <= analysis.declaration.end;
    }

    function isDeclarationReference(analysis, uri, offsets) {
      return uri === analysis.fileUri
        && offsets.start <= analysis.declaration.bodyOpen
        && offsets.end >= analysis.declaration.start;
    }

    function changedParameterList(model, analysis) {
      const fields = modelTools.selectedFields(model);
      const selected = new Set(fields.map((field) => field.originalIndex));
      const insertionIndex = Math.min(...fields.map((field) => field.originalIndex));
      const result = [];
      analysis.parameters.forEach((parameter) => {
        if (parameter.originalIndex === insertionIndex) {
          result.push(`${model.className} ${model.parameterName}`);
        }
        if (!selected.has(parameter.originalIndex)) {
          result.push(analysis.source.slice(parameter.declarationRange.start, parameter.declarationRange.end).trim());
        }
      });
      return result.join(", ");
    }

    function transformMethod(model, analysis, recursiveReplacements) {
      const declaration = analysis.declaration;
      const methodReplacements = [{
        start: declaration.parameterOpen + 1,
        end: declaration.parameterClose,
        text: changedParameterList(model, analysis)
      }, ...recursiveReplacements];
      const selectedByIndex = new Map(modelTools.selectedFields(model).map((field) => [String(field.originalIndex), field]));
      selectedByIndex.forEach((field, index) => {
        for (const reference of analysis.parameterReferences[index] || []) {
          if (reference.uri !== analysis.fileUri) {
            throw new Error("A method parameter reference unexpectedly resolved outside its declaration file.");
          }
          const offsets = locationOffsets(analysis.source, reference.range);
          if (offsets.start < declaration.bodyOpen || offsets.end > declaration.bodyClose) continue;
          if (model.createGetters && isParameterWrite(analysis.source, offsets)) {
            throw new Error(`Parameter '${field.originalName}' is modified; disable getters to preserve writable field access.`);
          }
          methodReplacements.push({ ...offsets, text: readAccess(model, field) });
        }
      });
      const originalMethod = analysis.source.slice(declaration.start, declaration.end);
      const changedMethod = applyReplacements(originalMethod, methodReplacements, declaration.start);
      if (!model.keepDelegate) return changedMethod;

      const originalHeader = analysis.source.slice(declaration.start, declaration.bodyOpen + 1);
      const fields = modelTools.selectedFields(model);
      const selected = new Set(fields.map((field) => field.originalIndex));
      const insertionIndex = Math.min(...fields.map((field) => field.originalIndex));
      const objectArguments = fields.map((field) => field.originalName).join(", ");
      const delegateArguments = [];
      analysis.parameters.forEach((parameter) => {
        if (parameter.originalIndex === insertionIndex) {
          delegateArguments.push(`new ${model.className}(${objectArguments})`);
        }
        if (!selected.has(parameter.originalIndex)) delegateArguments.push(parameter.name);
      });
      const indentation = /^[\t ]*/.exec(originalHeader)?.[0] || "";
      const unitIndent = analysis.source.slice(declaration.bodyOpen + 1).match(/\r?\n([\t ]+)\S/)?.[1]
        || `${indentation}    `;
      const call = analysis.isConstructor
        ? `this(${delegateArguments.join(", ")});`
        : `${String(analysis.returnType || "").trim() === "void" ? "" : "return "}${analysis.methodName}(${delegateArguments.join(", ")});`;
      const newline = analysis.source.includes("\r\n") ? "\r\n" : "\n";
      const deprecation = model.deprecateDelegate ? `${indentation}@Deprecated${newline}` : "";
      const delegate = `${deprecation}${originalHeader}${newline}${unitIndent}${call}${newline}${indentation}}`;
      return `${delegate}${newline}${newline}${changedMethod}`;
    }

    function generateClass(model, analysis, indentation = "") {
      const newline = analysis.source.includes("\r\n") ? "\r\n" : "\n";
      const unit = indentation ? `${indentation}    ` : "    ";
      const fields = modelTools.selectedFields(model);
      const lines = [];
      lines.push(`${indentation}public ${indentation ? "static " : ""}class ${model.className} {`);
      fields.forEach((field) => {
        lines.push(`${unit}${model.createGetters ? "private" : "public"} ${field.type} ${field.fieldName};`);
      });
      lines.push("");
      lines.push(`${unit}public ${model.className}(${fields.map((field) => `${field.type} ${field.fieldName}`).join(", ")}) {`);
      fields.forEach((field) => lines.push(`${unit}    this.${field.fieldName} = ${field.fieldName};`));
      lines.push(`${unit}}`);
      fields.forEach((field) => {
        if (model.createGetters) {
          const prefix = String(field.type || "").trim() === "boolean" ? "is" : "get";
          lines.push("", `${unit}public ${field.type} ${prefix}${capitalize(field.fieldName)}() {`, `${unit}    return ${field.fieldName};`, `${unit}}`);
        }
        if (model.createSetters) {
          lines.push("", `${unit}public void set${capitalize(field.fieldName)}(${field.type} ${field.fieldName}) {`, `${unit}    this.${field.fieldName} = ${field.fieldName};`, `${unit}}`);
        }
      });
      lines.push(`${indentation}}`);
      return lines.join(newline);
    }

    function topLevelClassSource(model, analysis) {
      const newline = analysis.source.includes("\r\n") ? "\r\n" : "\n";
      const parts = [];
      if (analysis.packageName) parts.push(`package ${analysis.packageName};`);
      if (analysis.imports) parts.push(analysis.imports);
      parts.push(generateClass(model, analysis));
      return `${parts.join(`${newline}${newline}`)}${newline}`;
    }

    function addTextEdit(changes, uri, source, replacement) {
      (changes[uri] ||= []).push({
        range: {
          start: offsetToPosition(source, replacement.start),
          end: offsetToPosition(source, replacement.end)
        },
        newText: replacement.text
      });
    }

    function buildWorkspaceEdit(analysis, model) {
      const validation = modelTools.validate(model, analysis);
      if (validation) throw new Error(validation);
      const selected = modelTools.selectedFields(model);
      if (selected.some((field) => /\.\.\./.test(field.type)
        || (() => {
          const parameter = analysis.parameters.find((candidate) => candidate.originalIndex === field.originalIndex);
          return parameter && /\.\.\./.test(analysis.source.slice(parameter.declarationRange.start, parameter.declarationRange.end));
        })())) {
        throw new Error("Selected varargs parameters are not supported.");
      }

      const changes = {};
      const recursive = [];
      for (const reference of analysis.methodReferences) {
        const source = analysis.sources[reference.uri];
        const offsets = locationOffsets(source, reference.range);
        if (isDeclarationReference(analysis, reference.uri, offsets)) continue;
        const replacement = invocationReplacement(source, reference, model, analysis, reference.uri);
        if (methodRangeContains(analysis, reference.uri, replacement)) recursive.push(replacement);
        else addTextEdit(changes, reference.uri, source, replacement);
      }
      const changedMethod = transformMethod(model, analysis, recursive);
      addTextEdit(changes, analysis.fileUri, analysis.source, {
        start: analysis.declaration.start,
        end: analysis.declaration.end,
        text: changedMethod
      });

      const documentChanges = [];
      if (model.destination === "nested") {
        const ownerLineStart = analysis.source.lastIndexOf("\n", analysis.owner.open) + 1;
        const ownerIndent = /^[\t ]*/.exec(analysis.source.slice(ownerLineStart, analysis.owner.open))?.[0] || "";
        const memberIndent = analysis.source.slice(analysis.owner.open + 1, analysis.owner.close).match(/\r?\n([\t ]+)\S/)?.[1]
          || `${ownerIndent}    `;
        const newline = analysis.source.includes("\r\n") ? "\r\n" : "\n";
        addTextEdit(changes, analysis.fileUri, analysis.source, {
          start: analysis.owner.close,
          end: analysis.owner.close,
          text: `${newline}${generateClass(model, analysis, memberIndent)}${newline}${ownerIndent}`
        });
      } else {
        const activePath = normalizePath(getActiveEditorPath());
        const slash = activePath.lastIndexOf("/");
        const classPath = `${slash >= 0 ? activePath.slice(0, slash + 1) : ""}${model.className}.java`;
        const classUri = toFileUri(classPath);
        if (!classUri) throw new Error("The parameter-object class path could not be resolved.");
        documentChanges.push({ kind: "create", uri: classUri });
        documentChanges.push({
          textDocument: { uri: classUri, version: null },
          edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: topLevelClassSource(model, analysis) }]
        });
      }
      Object.entries(changes).forEach(([uri, edits]) => {
        documentChanges.push({ textDocument: { uri, version: null }, edits });
      });
      return { documentChanges };
    }

    async function prepare(analysis, model) {
      const previewService = getWorkspaceEditPreview();
      if (!previewService?.resolve || !previewService?.apply) throw new Error("Workspace edit preview is unavailable.");
      const preview = await previewService.resolve({
        title: "Introduce Parameter Object",
        provenance: "JDT semantic references",
        workspaceEdit: buildWorkspaceEdit(analysis, model)
      });
      const activePath = normalizePath(getActiveEditorPath()).toLowerCase();
      preview.operations.forEach((operation) => {
        if (operation.type !== "modify") return;
        if (operation.snapshot?.isDirty && normalizePath(operation.path).toLowerCase() !== activePath) {
          throw new Error(`Save or discard unsaved changes in ${operation.path} before introducing a parameter object.`);
        }
      });
      preview.parameterObjectModel = modelTools.clone(model);
      preview.methodSignature = modelTools.buildSignature(model, analysis);
      return preview;
    }

    async function apply(preview) {
      return getWorkspaceEditPreview().apply(preview);
    }

    return { apply, buildWorkspaceEdit, generateClass, prepare };
  }

  global.createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit =
    createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit;
})(typeof window !== "undefined" ? window : globalThis);
