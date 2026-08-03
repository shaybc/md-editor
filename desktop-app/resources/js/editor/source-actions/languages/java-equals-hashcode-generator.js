// Local Java equals() and hashCode() field analysis and source generation.
(function(global) {
  "use strict";

  const MODIFIERS = /\b(?:public|protected|private|abstract|static|final|transient|volatile)\b/g;
  const INTEGRAL_TYPES = new Set(["byte", "short", "int", "char"]);

  /** Create the local equals() and hashCode() generator. */
  function createMarkdownViewerJavaEqualsHashCodeGenerator(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });

    function cleanTypeName(detail) {
      return String(detail || "").replace(MODIFIERS, "").replace(/\s+/g, " ").trim();
    }

    function createField(source, node) {
      const declaration = classAnalysis.getDeclarationPrefix(source, node);
      const typeName = cleanTypeName(node?.detail);
      const name = String(node?.name || "");
      if (!name || !typeName || /\bstatic\b/.test(String(node?.detail || "") + " " + declaration)) return null;
      return {
        id: "field:" + name,
        name,
        label: name,
        typeName,
        node,
        isArray: /\[\s*\]$/.test(typeName),
        isDeepArray: /\[\s*\]\s*\[\s*\]/.test(typeName)
      };
    }

    function methodSignature(node) {
      const value = String(node?.name || "");
      const open = value.indexOf("(");
      const close = value.lastIndexOf(")");
      return {
        name: open >= 0 ? value.slice(0, open).trim() : value.trim(),
        parameters: open >= 0 && close > open ? value.slice(open + 1, close).trim() : ""
      };
    }

    /** Analyze selectable fields and existing equality methods in the active class. */
    function analyze(source, cursorOffset = 0) {
      const value = String(source || "");
      const owner = classAnalysis?.findActiveClass(value, Math.max(0, Number(cursorOffset) || 0));
      if (!owner) return null;
      const members = Array.isArray(owner.children) ? owner.children : [];
      const methods = members.filter((member) => member.kind === "method");
      return {
        owner,
        fields: members.filter((member) => member.kind === "field")
          .map((field) => createField(value, field))
          .filter(Boolean),
        hasHashCode: methods.some((method) => {
          const signature = methodSignature(method);
          return signature.name === "hashCode" && !signature.parameters;
        }),
        hasEquals: methods.some((method) => {
          const signature = methodSignature(method);
          return signature.name === "equals" && !!signature.parameters;
        })
      };
    }

    function arrayHash(field) {
      return "java.util.Arrays." + (field.isDeepArray ? "deepHashCode" : "hashCode") + "(" + field.name + ")";
    }

    function manualHashExpression(field) {
      const name = field.name;
      if (field.isArray) return arrayHash(field);
      if (field.typeName === "boolean") return "(" + name + " ? 1231 : 1237)";
      if (INTEGRAL_TYPES.has(field.typeName)) return name;
      if (field.typeName === "long") return "(int) (" + name + " ^ (" + name + " >>> 32))";
      if (field.typeName === "float") return "Float.floatToIntBits(" + name + ")";
      if (field.typeName === "double") {
        return "(int) (Double.doubleToLongBits(" + name + ") ^ (Double.doubleToLongBits(" + name + ") >>> 32))";
      }
      return "((" + name + " == null) ? 0 : " + name + ".hashCode())";
    }

    function createHashCodeBody(fields, indent, useObjects) {
      if (useObjects) {
        const normalFields = fields.filter((field) => !field.isArray);
        const arrays = fields.filter((field) => field.isArray);
        if (!arrays.length) {
          return indent + "return java.util.Objects.hash(" + normalFields.map((field) => field.name).join(", ") + ");";
        }
        const lines = [
          indent + "int result = " + (normalFields.length
            ? "java.util.Objects.hash(" + normalFields.map((field) => field.name).join(", ") + ")"
            : "1") + ";"
        ];
        arrays.forEach((field) => lines.push(indent + "result = 31 * result + " + arrayHash(field) + ";"));
        lines.push(indent + "return result;");
        return lines.join("\n");
      }
      const lines = [indent + "final int prime = 31;", indent + "int result = 1;"];
      fields.forEach((field) => lines.push(indent + "result = prime * result + " + manualHashExpression(field) + ";"));
      lines.push(indent + "return result;");
      return lines.join("\n");
    }

    function equalityExpression(field, useObjects) {
      const left = field.name;
      const right = "other." + field.name;
      if (field.isArray) {
        return "java.util.Arrays." + (field.isDeepArray ? "deepEquals" : "equals") + "(" + left + ", " + right + ")";
      }
      if (field.typeName === "float") return "Float.compare(" + left + ", " + right + ") == 0";
      if (field.typeName === "double") return "Double.compare(" + left + ", " + right + ") == 0";
      if (field.typeName === "boolean" || field.typeName === "long" || INTEGRAL_TYPES.has(field.typeName)) {
        return left + " == " + right;
      }
      return useObjects
        ? "java.util.Objects.equals(" + left + ", " + right + ")"
        : "(" + left + " == null ? " + right + " == null : " + left + ".equals(" + right + "))";
    }

    function ifReturn(condition, result, indent, useBlocks) {
      if (!useBlocks) return indent + "if (" + condition + ") return " + result + ";";
      return indent + "if (" + condition + ") {\n" + indent + "    return " + result + ";\n" + indent + "}";
    }

    function createEqualsBody(ownerName, fields, indent, generationOptions) {
      const useBlocks = generationOptions.useBlocks === true;
      const lines = [ifReturn("this == obj", "true", indent, useBlocks)];
      if (generationOptions.useInstanceof === true) {
        lines.push(ifReturn("!(obj instanceof " + ownerName + ")", "false", indent, useBlocks));
      } else {
        lines.push(ifReturn("obj == null", "false", indent, useBlocks));
        lines.push(ifReturn("getClass() != obj.getClass()", "false", indent, useBlocks));
      }
      lines.push(indent + ownerName + " other = (" + ownerName + ") obj;");
      lines.push(indent + "return " + fields.map((field) =>
        equalityExpression(field, generationOptions.useObjects === true)).join(" &&\n" + indent + "    ") + ";");
      return lines.join("\n");
    }

    function methodComment(target, indent) {
      return indent + "/**\n" + indent + " * @see java.lang.Object#" + target + "\n" + indent + " */\n";
    }

    function findFieldEndOffset(source, field) {
      const value = String(source || "");
      const start = classAnalysis.positionToOffset(value, field?.node?.selectionRange?.start || field?.node?.range?.start);
      const semicolon = value.indexOf(";", start);
      return semicolon >= 0 ? semicolon + 1 : -1;
    }

    function resolveInsertionOffset(source, analysis, insertionPoint) {
      if (String(insertionPoint || "").startsWith("after-field:")) {
        const id = String(insertionPoint).slice("after-field:".length);
        const offset = findFieldEndOffset(source, analysis.fields.find((field) => field.id === id));
        if (offset >= 0) return offset;
      }
      return classAnalysis.findClosingBraceOffset(source, analysis.owner);
    }

    /** Create one undoable insertion containing hashCode() and equals(). */
    function createInsertion(source, analysis, fields, generationOptions = {}) {
      const selected = Array.isArray(fields) ? fields : [];
      const value = String(source || "");
      if (!analysis?.owner || !selected.length || analysis.hasHashCode || analysis.hasEquals) return null;
      const offset = resolveInsertionOffset(value, analysis, generationOptions.insertionPoint);
      if (offset < 0) return null;
      const classIndent = classAnalysis.getLineIndent(value, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
      const memberIndent = classIndent + "    ";
      const bodyIndent = memberIndent + "    ";
      const comments = generationOptions.generateComments === true;
      const hashCode = (comments ? methodComment("hashCode()", memberIndent) : "") +
        memberIndent + "@Override\n" +
        memberIndent + "public int hashCode() {\n" +
        createHashCodeBody(selected, bodyIndent, generationOptions.useObjects === true) + "\n" +
        memberIndent + "}";
      const equals = (comments ? methodComment("equals(java.lang.Object)", memberIndent) : "") +
        memberIndent + "@Override\n" +
        memberIndent + "public boolean equals(Object obj) {\n" +
        createEqualsBody(analysis.owner.name, selected, bodyIndent, generationOptions) + "\n" +
        memberIndent + "}";
      const before = value.slice(0, offset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset, text: leading + hashCode + "\n\n" + equals + "\n" };
    }

    return { analyze, createInsertion };
  }

  global.createMarkdownViewerJavaEqualsHashCodeGenerator = createMarkdownViewerJavaEqualsHashCodeGenerator;
})(window);
