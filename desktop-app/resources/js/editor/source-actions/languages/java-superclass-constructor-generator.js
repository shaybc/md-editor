// Analyze superclass constructors and generate matching subclass constructors.
(function(global) {
  "use strict";

  /**
   * Create the local Generate Constructors from Superclass generator.
   * @param {{ getOutlineLanguage?: Function, classAnalysis?: object }} options Generator dependencies.
   * @returns {object} Superclass-constructor analysis and source-generation API.
   */
  function createMarkdownViewerJavaSuperclassConstructorGenerator(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });

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

    function parseParameter(parameter, index) {
      const clean = String(parameter || "")
        .replace(/@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*/g, "")
        .replace(/\bfinal\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const match = clean.match(/^(.*?)([A-Za-z_$][\w$]*)$/);
      if (!match) return { typeName: clean, name: "arg" + index };
      return { typeName: match[1].trim(), name: match[2] };
    }

    function getConstructorParameters(constructor) {
      const signature = String(constructor?.name || "");
      const open = signature.indexOf("(");
      const close = signature.lastIndexOf(")");
      if (open < 0 || close < open) return [];
      return splitParameters(signature.slice(open + 1, close)).map(parseParameter);
    }

    function parameterTypeKey(parameters) {
      return (parameters || []).map((parameter) => String(parameter.typeName || "").replace(/\s+/g, "")).join(",");
    }

    function findClass(source, className) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      let result = null;
      function visit(node) {
        if (!result && node?.kind === "class" && node.name === className) result = node;
        (node?.children || []).forEach(visit);
      }
      language.parse(String(source || ""), {}).forEach(visit);
      return result;
    }

    function getAccessModifier(source, constructor) {
      const declaration = classAnalysis.getDeclarationPrefix(source, constructor);
      if (/\bprivate\b/.test(declaration)) return "private";
      if (/\bprotected\b/.test(declaration)) return "protected";
      if (/\bpublic\b/.test(declaration)) return "public";
      return "package";
    }

    function getPackageName(source) {
      return String(source || "").match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] || "";
    }

    function getThrowsClause(source, constructor) {
      if (constructor?.implicit) return "";
      const value = String(source || "");
      const signatureEnd = classAnalysis.positionToOffset(value, constructor?.range?.end);
      const bodyStart = value.indexOf("{", signatureEnd);
      const suffix = value.slice(signatureEnd, bodyStart >= 0 ? bodyStart : signatureEnd);
      return suffix.match(/\bthrows\s+([^\{]+?)\s*$/)?.[1]?.trim() || "";
    }

    function existingConstructorKeys(owner) {
      return new Set((owner?.children || [])
        .filter((member) => member.kind === "constructor")
        .map((constructor) => parameterTypeKey(getConstructorParameters(constructor))));
    }

    function createCandidate(source, constructor, className) {
      const parameters = getConstructorParameters(constructor);
      return {
        id: "constructor:" + parameterTypeKey(parameters),
        label: className + "(" + parameters.map((parameter) => parameter.typeName).join(", ") + ")",
        parameters,
        accessModifier: "package",
        throwsClause: getThrowsClause(source, constructor)
      };
    }

    /** Analyze accessible superclass constructors that are not implemented by the subclass. */
    function analyze(subclassSource, subclassOwner, superclassResolution) {
      const superclassSource = String(superclassResolution?.source || "");
      const superclass = findClass(superclassSource, superclassResolution?.className);
      if (!subclassOwner || !superclass) return null;
      const existing = existingConstructorKeys(subclassOwner);
      const samePackage = getPackageName(subclassSource) === getPackageName(superclassSource);
      let constructors = (superclass.children || []).filter((member) => member.kind === "constructor");
      if (!constructors.length) {
        constructors = [{ name: superclass.name + "()", detail: "constructor", range: superclass.range, selectionRange: superclass.selectionRange, implicit: true }];
      }
      const candidates = constructors.map((constructor) => {
        const candidate = createCandidate(superclassSource, constructor, superclass.name);
        candidate.accessModifier = constructor.implicit ? "public" : getAccessModifier(superclassSource, constructor);
        return candidate;
      }).filter((candidate) => candidate.accessModifier !== "private")
        .filter((candidate) => candidate.accessModifier !== "package" || samePackage)
        .filter((candidate) => !existing.has(parameterTypeKey(candidate.parameters)));
      return { owner: subclassOwner, superclass, constructors: candidates };
    }

    function resolveInsertionOffset(source, owner, insertionPoint) {
      if (insertionPoint === "first") {
        const value = String(source || "");
        const nameOffset = classAnalysis.positionToOffset(value, owner?.selectionRange?.start || owner?.range?.start);
        const openingBrace = value.indexOf("{", nameOffset);
        return openingBrace >= 0 ? openingBrace + 1 : -1;
      }
      return classAnalysis.findClosingBraceOffset(source, owner);
    }

    function createConstructor(ownerName, candidate, options, memberIndent, bodyIndent) {
      const accessModifier = ["public", "protected", "private"].includes(options.accessModifier)
        ? options.accessModifier + " "
        : "";
      const comment = options.generateComments === true
        ? memberIndent + "/**\n" + candidate.parameters.map((parameter) => memberIndent + " * @param " + parameter.name).join("\n") +
          (candidate.parameters.length ? "\n" : "") + memberIndent + " */\n"
        : "";
      const declaration = candidate.parameters.map((parameter) => parameter.typeName + " " + parameter.name).join(", ");
      const argumentsList = candidate.parameters.map((parameter) => parameter.name).join(", ");
      const throwsClause = candidate.throwsClause ? " throws " + candidate.throwsClause : "";
      const body = [];
      if (candidate.parameters.length || options.omitSuper !== true) body.push(bodyIndent + "super(" + argumentsList + ");");
      body.push(bodyIndent + "// TODO Auto-generated constructor stub");
      return comment + memberIndent + accessModifier + ownerName + "(" + declaration + ")" + throwsClause + " {\n" +
        body.join("\n") + "\n" + memberIndent + "}";
    }

    /** Create one undoable insertion containing the selected superclass constructors. */
    function createInsertion(source, analysis, selectedConstructors, generationOptions = {}) {
      const value = String(source || "");
      const selected = Array.isArray(selectedConstructors) ? selectedConstructors : [];
      if (!analysis?.owner || !selected.length) return null;
      const insertionOffset = resolveInsertionOffset(value, analysis.owner, generationOptions.insertionPoint);
      if (insertionOffset < 0) return null;
      const classIndent = classAnalysis.getLineIndent(value, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
      const memberIndent = classIndent + "    ";
      const bodyIndent = memberIndent + "    ";
      const constructors = selected.map((candidate) =>
        createConstructor(analysis.owner.name, candidate, generationOptions, memberIndent, bodyIndent)
      ).join("\n\n");
      const before = value.slice(0, insertionOffset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset: insertionOffset, text: leading + constructors + "\n" };
    }

    return { analyze, createInsertion };
  }

  global.createMarkdownViewerJavaSuperclassConstructorGenerator = createMarkdownViewerJavaSuperclassConstructorGenerator;
})(window);
