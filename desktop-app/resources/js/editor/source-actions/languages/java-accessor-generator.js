// Local Java field analysis and getter/setter source generation.
(function(global) {
  "use strict";

  function createMarkdownViewerJavaAccessorGenerator(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });

    function capitalizeFieldName(name) {
      const value = String(name || "");
      return value ? value[0].toUpperCase() + value.slice(1) : "";
    }


    function getMethodSignature(node) {
      const value = String(node?.name || "");
      const open = value.indexOf("(");
      const close = value.lastIndexOf(")");
      return {
        name: open >= 0 ? value.slice(0, open).trim() : value.trim(),
        parameters: open >= 0 && close > open ? value.slice(open + 1, close).trim() : ""
      };
    }

    function hasGetter(methods, fieldName, typeName) {
      const suffix = capitalizeFieldName(fieldName);
      const acceptedNames = String(typeName || "") === "boolean"
        ? new Set(["is" + suffix, "get" + suffix])
        : new Set(["get" + suffix]);
      return methods.some((method) => {
        const signature = getMethodSignature(method);
        return acceptedNames.has(signature.name) && !signature.parameters;
      });
    }

    function hasSetter(methods, fieldName) {
      const expectedName = "set" + capitalizeFieldName(fieldName);
      return methods.some((method) => {
        const signature = getMethodSignature(method);
        return signature.name === expectedName && !!signature.parameters;
      });
    }

    /**
     * Find fields in the active class that still need JavaBean accessors.
     * @param {string} source Active Java document text.
     * @param {number} cursorOffset Active editor cursor offset.
     * @returns {{ owner: object, fields: Array<object> }|null} Active class and dialog candidates.
     */
    function analyze(source, cursorOffset = 0) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      const value = String(source || "");
      const owner = classAnalysis?.findActiveClass(value, Math.max(0, Number(cursorOffset) || 0));
      if (!owner) return null;
      const members = Array.isArray(owner.children) ? owner.children : [];
      const methods = members.filter((member) => member.kind === "method");
      const fields = members.filter((member) => member.kind === "field").flatMap((field) => {
        const fieldName = String(field.name || "");
        const typeName = String(field.detail || "").trim();
        if (!fieldName || !typeName) return [];
        const declarationPrefix = classAnalysis.getDeclarationPrefix(value, field);
        const isFinal = /\bfinal\b/.test(declarationPrefix);
        const generateGetter = !hasGetter(methods, fieldName, typeName);
        const generateSetter = !isFinal && !hasSetter(methods, fieldName);
        if (!generateGetter && !generateSetter) return [];
        return [{
          fieldName,
          typeName,
          isStatic: /\bstatic\b/.test(declarationPrefix),
          generateGetter,
          generateSetter
        }];
      });
      return { owner, fields };
    }


    function createMethodComment(tag, memberIndent) {
      return memberIndent + "/**\n" +
        memberIndent + " * " + tag + "\n" +
        memberIndent + " */\n";
    }

    function createGetterBlock(field, ownerName, memberIndent, bodyIndent, generateComments) {
      const suffix = capitalizeFieldName(field.fieldName);
      const getterName = String(field.typeName) === "boolean" ? "is" + suffix : "get" + suffix;
      const staticModifier = field.isStatic ? "static " : "";
      const target = field.isStatic ? ownerName + "." + field.fieldName : field.fieldName;
      const comment = generateComments
        ? createMethodComment("@return the " + field.fieldName, memberIndent)
        : "";
      return comment +
        memberIndent + "public " + staticModifier + field.typeName + " " + getterName + "() {\n" +
        bodyIndent + "return " + target + ";\n" +
        memberIndent + "}";
    }

    function createSetterBlock(field, ownerName, memberIndent, bodyIndent, generateComments) {
      const suffix = capitalizeFieldName(field.fieldName);
      const staticModifier = field.isStatic ? "static " : "";
      const assignmentTarget = field.isStatic ? ownerName + "." + field.fieldName : "this." + field.fieldName;
      const comment = generateComments
        ? createMethodComment("@param " + field.fieldName + " the " + field.fieldName + " to set", memberIndent)
        : "";
      return comment +
        memberIndent + "public " + staticModifier + "void set" + suffix + "(" + field.typeName + " " + field.fieldName + ") {\n" +
        bodyIndent + assignmentTarget + " = " + field.fieldName + ";\n" +
        memberIndent + "}";
    }

    function createAccessorBlocks(fields, ownerName, memberIndent, bodyIndent, options) {
      const getters = [];
      const setters = [];
      const pairs = [];
      fields.forEach((field) => {
        const getter = field.generateGetter
          ? createGetterBlock(field, ownerName, memberIndent, bodyIndent, options.generateComments === true)
          : null;
        const setter = field.generateSetter
          ? createSetterBlock(field, ownerName, memberIndent, bodyIndent, options.generateComments === true)
          : null;
        if (getter) getters.push(getter);
        if (setter) setters.push(setter);
        if (getter) pairs.push(getter);
        if (setter) pairs.push(setter);
      });
      return options.order === "getters-first" ? getters.concat(setters) : pairs;
    }

    /**
     * Build one insertion containing the selected accessors before the active class closing brace.
     * @param {string} source Active Java document text.
     * @param {object} owner Active class returned by analyze.
     * @param {Array<object>} fields Selected accessor candidates.
     * @param {{ order?: string, generateComments?: boolean }} options Generation ordering and comment preferences.
     * @returns {{ offset: number, text: string }|null} Undoable editor insertion data.
     */
    function createInsertion(source, owner, fields, options = {}) {
      const value = String(source || "");
      const selected = Array.isArray(fields) ? fields : [];
      if (!owner || !selected.length) return null;
      const closingBraceOffset = classAnalysis.findClosingBraceOffset(value, owner);
      if (closingBraceOffset < 0) return null;
      const closingLineStart = value.lastIndexOf("\n", Math.max(0, closingBraceOffset - 1)) + 1;
      const closingPrefix = value.slice(closingLineStart, closingBraceOffset);
      const insertionOffset = /^\s*$/.test(closingPrefix) ? closingLineStart : closingBraceOffset;
      const classIndent = classAnalysis.getLineIndent(value, owner.selectionRange?.start || owner.range?.start);
      const firstField = (owner.children || []).find((member) => member.kind === "field");
      const detectedMemberIndent = firstField
        ? classAnalysis.getLineIndent(value, firstField.selectionRange?.start || firstField.range?.start)
        : "";
      const memberIndent = detectedMemberIndent.length > classIndent.length
        ? detectedMemberIndent
        : classIndent + "    ";
      const indentUnit = memberIndent.slice(classIndent.length) || "    ";
      const bodyIndent = memberIndent + indentUnit;
      const blocks = createAccessorBlocks(selected, owner.name, memberIndent, bodyIndent, options);
      if (!blocks.length) return null;
      const before = value.slice(0, insertionOffset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset: insertionOffset, text: leading + blocks.join("\n\n") + "\n" };
    }

    return { analyze, createInsertion };
  }

  global.createMarkdownViewerJavaAccessorGenerator = createMarkdownViewerJavaAccessorGenerator;
})(typeof window !== "undefined" ? window : globalThis);
