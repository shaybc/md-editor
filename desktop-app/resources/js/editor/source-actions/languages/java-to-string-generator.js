// Local Java member analysis and toString() source generation.
(function(global) {
  "use strict";

  const JAVA_MODIFIERS = /\b(?:public|protected|private|abstract|static|final|transient|volatile|synchronized|native|strictfp|default|sealed|non-sealed)\b/g;
  const PRIMITIVE_TYPES = new Set(["boolean", "byte", "short", "int", "long", "float", "double", "char"]);

  /**
   * Create the local Java toString generator.
   * @param {{ getOutlineLanguage?: Function }} options Generator dependencies.
   * @returns {{ analyze(source: string, cursorOffset?: number): object|null, createInsertion(source: string, analysis: object, members: Array<object>, options?: object): object|null }} Generator API.
   */
  function createMarkdownViewerJavaToStringGenerator(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({
      getOutlineLanguage
    });


    function getMethodSignature(node) {
      const value = String(node?.name || "");
      const open = value.indexOf("(");
      const close = value.lastIndexOf(")");
      return {
        name: open >= 0 ? value.slice(0, open).trim() : value.trim(),
        parameters: open >= 0 && close > open ? value.slice(open + 1, close).trim() : ""
      };
    }

    function cleanTypeName(detail) {
      return String(detail || "")
        .replace(/@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*/g, "")
        .replace(JAVA_MODIFIERS, "")
        .replace(/\s+/g, " ")
        .trim();
    }


    function createFieldCandidate(field, source) {
      const detail = String(field?.detail || "");
      const declaration = classAnalysis.getDeclarationPrefix(source, field);
      const typeName = cleanTypeName(detail);
      const name = String(field?.name || "");
      if (!name || !typeName || /\b(?:static|transient)\b/.test(detail + " " + declaration)) return null;
      return {
        id: "field:" + name,
        kind: "field",
        name,
        label: name,
        typeName,
        expression: name,
        isArray: /\[\s*\]$/.test(typeName),
        isPrimitive: PRIMITIVE_TYPES.has(typeName)
      };
    }

    function createMethodCandidate(method) {
      const detail = String(method?.detail || "");
      const signature = getMethodSignature(method);
      const returnType = cleanTypeName(detail);
      if (!signature.name || signature.parameters || signature.name === "toString") return null;
      if (!returnType || returnType === "void" || /\bstatic\b/.test(detail)) return null;
      return {
        id: "method:" + signature.name,
        kind: "method",
        name: signature.name,
        label: signature.name + "()",
        typeName: returnType,
        expression: signature.name + "()",
        isArray: /\[\s*\]$/.test(returnType),
        isPrimitive: PRIMITIVE_TYPES.has(returnType)
      };
    }

    function createInheritedMethodCandidates(methods) {
      const declaredNames = new Set(methods.map((method) => getMethodSignature(method).name));
      return [
        {
          id: "inherited-method:getClass",
          kind: "inherited-method",
          name: "getClass",
          label: "getClass()",
          typeName: "Class<?>",
          expression: "getClass()",
          isArray: false,
          isPrimitive: false
        },
        {
          id: "inherited-method:hashCode",
          kind: "inherited-method",
          name: "hashCode",
          label: "hashCode()",
          typeName: "int",
          expression: "hashCode()",
          isArray: false,
          isPrimitive: true
        },
        {
          id: "inherited-method:toString",
          kind: "inherited-method",
          name: "toString",
          label: "toString()",
          typeName: "String",
          expression: "super.toString()",
          isArray: false,
          isPrimitive: false
        }
      ].filter((member) => !declaredNames.has(member.name));
    }

    /** Analyze the active class without contacting JDT. */
    function analyze(source, cursorOffset = 0) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      const value = String(source || "");
      const owner = classAnalysis?.findActiveClass(value, Math.max(0, Number(cursorOffset) || 0));
      if (!owner) return null;
      const children = Array.isArray(owner.children) ? owner.children : [];
      const fields = children.filter((member) => member.kind === "field").map((field) => createFieldCandidate(field, value)).filter(Boolean);
      const methods = children.filter((member) => member.kind === "method");
      const hasToString = methods.some((method) => {
        const signature = getMethodSignature(method);
        return signature.name === "toString" && !signature.parameters;
      });
      return {
        owner,
        fields,
        methods: methods.map(createMethodCandidate).filter(Boolean),
        inheritedMethods: createInheritedMethodCandidates(methods),
        hasToString
      };
    }

    function renderValue(member, listArrays) {
      if (!listArrays || !member.isArray) return member.expression;
      return member.typeName.includes("[][]")
        ? "java.util.Arrays.deepToString(" + member.expression + ")"
        : "java.util.Arrays.toString(" + member.expression + ")";
    }

    function escapeJavaString(value) {
      return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    function createConcatenationBody(className, members, bodyIndent, listArrays) {
      if (!members.length) return bodyIndent + "return \"" + escapeJavaString(className) + " []\";";
      const pieces = members.map((member, index) => {
        const prefix = index === 0 ? "" : ", ";
        return "\"" + escapeJavaString(prefix + member.label + "=") + "\" + " + renderValue(member, listArrays);
      });
      return bodyIndent + "return \"" + escapeJavaString(className) + " [\" + " +
        pieces.join(" +\n" + bodyIndent + "    ") + " + \"]\";";
    }

    function createBuilderBody(className, members, bodyIndent, listArrays, chained) {
      if (chained) {
        const lines = [bodyIndent + "return new StringBuilder()", bodyIndent + "    .append(\"" + escapeJavaString(className) + " [\")"];
        members.forEach((member, index) => {
          lines.push(bodyIndent + "    .append(\"" + escapeJavaString((index ? ", " : "") + member.label + "=") + "\")");
          lines.push(bodyIndent + "    .append(" + renderValue(member, listArrays) + ")");
        });
        lines.push(bodyIndent + "    .append(\"]\")", bodyIndent + "    .toString();");
        return lines.join("\n");
      }
      const lines = [
        bodyIndent + "StringBuilder builder = new StringBuilder();",
        bodyIndent + "builder.append(\"" + escapeJavaString(className) + " [\");"
      ];
      members.forEach((member, index) => {
        lines.push(bodyIndent + "builder.append(\"" + escapeJavaString((index ? ", " : "") + member.label + "=") + "\");");
        lines.push(bodyIndent + "builder.append(" + renderValue(member, listArrays) + ");");
      });
      lines.push(bodyIndent + "builder.append(\"]\");", bodyIndent + "return builder.toString();");
      return lines.join("\n");
    }

    function createFormatBody(className, members, bodyIndent, listArrays) {
      const format = className + " [" + members.map((member) => member.label + "=%s").join(", ") + "]";
      const values = members.map((member) => renderValue(member, listArrays));
      return bodyIndent + "return String.format(\"" + escapeJavaString(format) + "\"" +
        (values.length ? ", " + values.join(", ") : "") + ");";
    }

    function createSkipNullBody(className, members, bodyIndent, listArrays) {
      const lines = [bodyIndent + "java.util.StringJoiner joiner = new java.util.StringJoiner(\", \", \"" + escapeJavaString(className) + " [\", \"]\");"];
      members.forEach((member) => {
        const add = "joiner.add(\"" + escapeJavaString(member.label + "=") + "\" + " + renderValue(member, listArrays) + ");";
        lines.push(member.isPrimitive ? bodyIndent + add : bodyIndent + "if (" + member.expression + " != null) " + add);
      });
      lines.push(bodyIndent + "return joiner.toString();");
      return lines.join("\n");
    }


    /** Create one undoable insertion containing the generated toString() method. */
    function createInsertion(source, analysis, members, generationOptions = {}) {
      const value = String(source || "");
      const selected = Array.isArray(members) ? members : [];
      if (!analysis?.owner || !selected.length || analysis.hasToString) return null;
      const insertionOffset = classAnalysis.findClosingBraceOffset(value, analysis.owner);
      if (insertionOffset < 0) return null;
      const classIndent = classAnalysis.getLineIndent(value, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
      const memberIndent = classIndent + "    ";
      const bodyIndent = memberIndent + "    ";
      const listArrays = generationOptions.listArrays === true;
      const style = generationOptions.codeStyle || "concatenation";
      let body;
      if (generationOptions.skipNulls === true) body = createSkipNullBody(analysis.owner.name, selected, bodyIndent, listArrays);
      else if (style === "builder") body = createBuilderBody(analysis.owner.name, selected, bodyIndent, listArrays, false);
      else if (style === "builder-chained") body = createBuilderBody(analysis.owner.name, selected, bodyIndent, listArrays, true);
      else if (style === "format") body = createFormatBody(analysis.owner.name, selected, bodyIndent, listArrays);
      else body = createConcatenationBody(analysis.owner.name, selected, bodyIndent, listArrays);
      const comment = generationOptions.generateComments === true
        ? memberIndent + "/**\n" + memberIndent + " * @see java.lang.Object#toString()\n" + memberIndent + " */\n"
        : "";
      const method = comment + memberIndent + "@Override\n" + memberIndent + "public String toString() {\n" + body + "\n" + memberIndent + "}";
      const before = value.slice(0, insertionOffset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset: insertionOffset, text: leading + method + "\n" };
    }

    return { analyze, createInsertion };
  }

  global.createMarkdownViewerJavaToStringGenerator = createMarkdownViewerJavaToStringGenerator;
})(window);
