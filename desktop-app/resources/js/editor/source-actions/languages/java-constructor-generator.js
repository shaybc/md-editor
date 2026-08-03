// Local Java field analysis and constructor source generation.
(function(global) {
  "use strict";

  const JAVA_MODIFIERS = /\b(?:public|protected|private|abstract|static|final|transient|volatile)\b/g;

  /**
   * Create the local constructor-using-fields generator.
   * @param {{ getOutlineLanguage?: Function, classAnalysis?: object }} options Generator dependencies.
   * @returns {object} Constructor analysis and generation API.
   */
  function createMarkdownViewerJavaConstructorGenerator(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });

    function cleanTypeName(detail) {
      return String(detail || "")
        .replace(/@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*/g, "")
        .replace(JAVA_MODIFIERS, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function createFieldCandidate(source, field) {
      const declaration = classAnalysis.getDeclarationPrefix(source, field);
      const typeName = cleanTypeName(field?.detail);
      const name = String(field?.name || "");
      const modifiers = String(field?.detail || "") + " " + declaration;
      const fieldOffset = classAnalysis.positionToOffset(source, field?.selectionRange?.start || field?.range?.start);
      const statementEnd = String(source || "").indexOf(";", fieldOffset);
      const hasInitializer = statementEnd >= 0 && /=/.test(String(source || "").slice(fieldOffset + name.length, statementEnd));
      if (!name || !typeName || /\bstatic\b/.test(modifiers) || (/\bfinal\b/.test(modifiers) && hasInitializer)) return null;
      return {
        id: "field:" + name,
        name,
        label: name,
        typeName,
        node: field
      };
    }

    function splitParameters(parameters) {
      const result = [];
      let start = 0;
      let angleDepth = 0;
      let arrayDepth = 0;
      const value = String(parameters || "");
      for (let index = 0; index <= value.length; index += 1) {
        const character = value[index];
        if (character === "<") angleDepth += 1;
        else if (character === ">") angleDepth = Math.max(0, angleDepth - 1);
        else if (character === "[") arrayDepth += 1;
        else if (character === "]") arrayDepth = Math.max(0, arrayDepth - 1);
        if ((character === "," && angleDepth === 0 && arrayDepth === 0) || index === value.length) {
          result.push(value.slice(start, index).trim());
          start = index + 1;
        }
      }
      return result.filter(Boolean);
    }

    function parameterType(parameter) {
      return String(parameter || "")
        .replace(/@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*/g, "")
        .replace(/\bfinal\b/g, "")
        .trim()
        .replace(/\s+[A-Za-z_$][\w$]*$/, "")
        .replace(/\s+/g, "");
    }

    function constructorParameterTypes(constructor) {
      const signature = String(constructor?.name || "");
      const open = signature.indexOf("(");
      const close = signature.lastIndexOf(")");
      if (open < 0 || close <= open) return [];
      return splitParameters(signature.slice(open + 1, close)).map(parameterType);
    }

    function getSuperConstructorLabel(source, owner) {
      const value = String(source || "");
      const nameOffset = classAnalysis.positionToOffset(value, owner?.selectionRange?.start || owner?.range?.start);
      const openingBrace = value.indexOf("{", nameOffset);
      const header = value.slice(nameOffset, openingBrace >= 0 ? openingBrace : nameOffset);
      const match = header.match(/\bextends\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/);
      if (!match) return "Object()";
      const parts = match[1].split(".");
      return parts[parts.length - 1] + "()";
    }

    /** Analyze selectable instance fields and existing constructors in the active class. */
    function analyze(source, cursorOffset = 0) {
      const value = String(source || "");
      const owner = classAnalysis?.findActiveClass(value, Math.max(0, Number(cursorOffset) || 0));
      if (!owner) return null;
      const members = Array.isArray(owner.children) ? owner.children : [];
      return {
        owner,
        fields: members.filter((member) => member.kind === "field")
          .map((field) => createFieldCandidate(value, field))
          .filter(Boolean),
        constructors: members.filter((member) => member.kind === "constructor"),
        superConstructorLabel: getSuperConstructorLabel(value, owner)
      };
    }

    function hasMatchingConstructor(analysis, fields) {
      const selectedTypes = (fields || []).map((field) => String(field.typeName || "").replace(/\s+/g, ""));
      return (analysis?.constructors || []).some((constructor) => {
        const existingTypes = constructorParameterTypes(constructor);
        return existingTypes.length === selectedTypes.length &&
          existingTypes.every((typeName, index) => typeName === selectedTypes[index]);
      });
    }

    function findFieldEndOffset(source, field) {
      const value = String(source || "");
      const start = classAnalysis.positionToOffset(value, field?.node?.selectionRange?.start || field?.node?.range?.start);
      const semicolon = value.indexOf(";", start);
      return semicolon >= 0 ? semicolon + 1 : -1;
    }

    function resolveInsertionOffset(source, analysis, insertionPoint) {
      if (String(insertionPoint || "").startsWith("after-field:")) {
        const fieldId = String(insertionPoint).slice("after-field:".length);
        const field = analysis.fields.find((candidate) => candidate.id === fieldId);
        const offset = findFieldEndOffset(source, field);
        if (offset >= 0) return offset;
      }
      return classAnalysis.findClosingBraceOffset(source, analysis.owner);
    }

    function createComment(fields, memberIndent) {
      const lines = [memberIndent + "/**"];
      fields.forEach((field) => lines.push(memberIndent + " * @param " + field.name + " the " + field.name));
      lines.push(memberIndent + " */");
      return lines.join("\n") + "\n";
    }

    /** Create one undoable constructor insertion. */
    function createInsertion(source, analysis, fields, generationOptions = {}) {
      const value = String(source || "");
      const selected = Array.isArray(fields) ? fields : [];
      if (!analysis?.owner || !selected.length || hasMatchingConstructor(analysis, selected)) return null;
      const insertionOffset = resolveInsertionOffset(value, analysis, generationOptions.insertionPoint);
      if (insertionOffset < 0) return null;
      const classIndent = classAnalysis.getLineIndent(value, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
      const memberIndent = classIndent + "    ";
      const bodyIndent = memberIndent + "    ";
      const accessModifier = ["public", "protected", "private"].includes(generationOptions.accessModifier)
        ? generationOptions.accessModifier + " "
        : "";
      const comment = generationOptions.generateComments === true ? createComment(selected, memberIndent) : "";
      const parameters = selected.map((field) => field.typeName + " " + field.name).join(", ");
      const body = [];
      if (generationOptions.omitSuper !== true) body.push(bodyIndent + "super();");
      selected.forEach((field) => body.push(bodyIndent + "this." + field.name + " = " + field.name + ";"));
      const constructor = comment +
        memberIndent + accessModifier + analysis.owner.name + "(" + parameters + ") {\n" +
        body.join("\n") + "\n" +
        memberIndent + "}";
      const before = value.slice(0, insertionOffset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset: insertionOffset, text: leading + constructor + "\n" };
    }

    return { analyze, createInsertion, hasMatchingConstructor };
  }

  global.createMarkdownViewerJavaConstructorGenerator = createMarkdownViewerJavaConstructorGenerator;
})(window);
