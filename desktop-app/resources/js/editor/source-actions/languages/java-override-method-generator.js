// Discover overridable Java methods and generate method stubs locally.
(function(global) {
  "use strict";

  const OBJECT_METHODS = Object.freeze([
    { name: "clone", returnType: "Object", parameters: [], accessModifier: "protected", throwsClause: "CloneNotSupportedException" },
    { name: "equals", returnType: "boolean", parameters: [{ typeName: "Object", name: "obj" }], accessModifier: "public" },
    { name: "hashCode", returnType: "int", parameters: [], accessModifier: "public" },
    { name: "toString", returnType: "String", parameters: [], accessModifier: "public" }
  ]);

  /**
   * Create the local Override/Implement Methods generator.
   * @param {{ getOutlineLanguage?: Function, classAnalysis?: object }} options Generator dependencies.
   * @returns {object} Method discovery and source-generation API.
   */
  function createMarkdownViewerJavaOverrideMethodGenerator(options = {}) {
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
      return match
        ? { typeName: match[1].trim(), name: match[2] }
        : { typeName: clean, name: "arg" + index };
    }

    function parseMethod(method) {
      const signature = String(method?.name || "");
      const open = signature.indexOf("(");
      const close = signature.lastIndexOf(")");
      const name = open >= 0 ? signature.slice(0, open) : signature;
      const parameters = open >= 0 && close >= open
        ? splitParameters(signature.slice(open + 1, close)).map(parseParameter)
        : [];
      return { name, parameters };
    }

    function parameterTypeKey(parameters) {
      return (parameters || []).map((parameter) => String(parameter.typeName || "").replace(/\s+/g, "")).join(",");
    }

    function signatureKey(name, parameters) {
      return String(name || "") + "(" + parameterTypeKey(parameters) + ")";
    }

    function findType(source, typeName) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      let result = null;
      function visit(node) {
        if (!result && ["class", "interface"].includes(node?.kind) && node.name === typeName) result = node;
        (node?.children || []).forEach(visit);
      }
      language.parse(String(source || ""), {}).forEach(visit);
      return result;
    }

    function getPackageName(source) {
      return String(source || "").match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] || "";
    }

    function getMethodSuffix(source, method) {
      const value = String(source || "");
      const signatureEnd = classAnalysis.positionToOffset(value, method?.range?.end);
      const bodyStart = value.indexOf("{", signatureEnd);
      const declarationEnd = value.indexOf(";", signatureEnd);
      const end = [bodyStart, declarationEnd].filter((offset) => offset >= 0).sort((left, right) => left - right)[0];
      return value.slice(signatureEnd, Number.isFinite(end) ? end : signatureEnd);
    }

    function getAccessModifier(prefix, isInterface) {
      if (isInterface || /\bpublic\b/.test(prefix)) return "public";
      if (/\bprotected\b/.test(prefix)) return "protected";
      if (/\bprivate\b/.test(prefix)) return "private";
      return "package";
    }

    function createCandidate(source, type, method, resolution, samePackage) {
      const parsed = parseMethod(method);
      const prefix = classAnalysis.getDeclarationPrefix(source, method);
      const isInterface = type.kind === "interface";
      const accessModifier = getAccessModifier(prefix, isInterface);
      if (/\bstatic\b/.test(prefix) || /\bfinal\b/.test(prefix) || accessModifier === "private") return null;
      if (accessModifier === "package" && !samePackage) return null;
      const suffix = getMethodSuffix(source, method);
      const isAbstract = isInterface && !/\bdefault\b/.test(prefix) || /\babstract\b/.test(prefix);
      return {
        id: type.name + ":" + signatureKey(parsed.name, parsed.parameters),
        declaringType: type.name,
        name: parsed.name,
        label: parsed.name + "(" + parsed.parameters.map((parameter) => parameter.typeName).join(", ") + ")",
        parameters: parsed.parameters,
        returnType: String(method.detail || "void").trim() || "void",
        accessModifier,
        throwsClause: suffix.match(/\bthrows\s+([^\{;]+?)\s*$/)?.[1]?.trim() || "",
        isAbstract,
        defaultSelected: isAbstract,
        invocationTarget: isAbstract ? "" : (resolution.relation === "interface"
          ? (resolution.invocationType || type.name) + ".super" : "super")
      };
    }

    function createObjectCandidates() {
      return OBJECT_METHODS.map((method) => ({
        ...method,
        id: "Object:" + signatureKey(method.name, method.parameters),
        declaringType: "Object",
        label: method.name + "(" + method.parameters.map((parameter) => parameter.typeName).join(", ") + ")",
        defaultSelected: false,
        isAbstract: false,
        invocationTarget: "super"
      }));
    }

    function getExistingMethodKeys(owner) {
      return new Set((owner?.children || []).filter((member) => member.kind === "method").map((method) => {
        const parsed = parseMethod(method);
        return signatureKey(parsed.name, parsed.parameters);
      }));
    }

    function createInsertionPoints(owner) {
      const points = [{ id: "first", label: "First member" }];
      (owner?.children || []).filter((member) => ["field", "constructor", "method"].includes(member.kind)).forEach((member) => {
        points.push({ id: "after-member:" + member.id, label: "After '" + member.name + "'", member });
      });
      points.push({ id: "end", label: "At end of class" });
      return points;
    }

    /** Analyze eligible methods from resolved direct supertypes. */
    function analyze(subclassSource, owner, resolvedTypes = []) {
      if (!owner) return null;
      const existing = getExistingMethodKeys(owner);
      const seen = new Set(existing);
      const candidates = [];
      resolvedTypes.forEach((resolution) => {
        const source = String(resolution?.source || "");
        const type = findType(source, resolution?.typeName || resolution?.className);
        if (!type) return;
        const samePackage = getPackageName(subclassSource) === getPackageName(source);
        (type.children || []).filter((member) => member.kind === "method").forEach((method) => {
          const candidate = createCandidate(source, type, method, resolution, samePackage);
          const key = candidate && signatureKey(candidate.name, candidate.parameters);
          if (!candidate || seen.has(key)) return;
          seen.add(key);
          candidates.push(candidate);
        });
      });
      createObjectCandidates().forEach((candidate) => {
        const key = signatureKey(candidate.name, candidate.parameters);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(candidate);
        }
      });
      return {
        owner,
        methods: candidates,
        groups: Array.from(new Set(candidates.map((candidate) => candidate.declaringType))),
        insertionPoints: createInsertionPoints(owner)
      };
    }

    function findMatchingBrace(source, openingBrace) {
      const value = String(source || "");
      let depth = 0;
      let state = "code";
      for (let index = openingBrace; index < value.length; index += 1) {
        const character = value[index];
        const next = value[index + 1];
        if (state === "code") {
          if (character === "/" && next === "/") { state = "line"; index += 1; }
          else if (character === "/" && next === "*") { state = "block"; index += 1; }
          else if (character === '"') state = "string";
          else if (character === "'") state = "char";
          else if (character === "{") depth += 1;
          else if (character === "}" && --depth === 0) return index + 1;
        } else if (state === "line") {
          if (character === "\n") state = "code";
        } else if (state === "block") {
          if (character === "*" && next === "/") { state = "code"; index += 1; }
        } else if (character === "\\") {
          index += 1;
        } else if ((state === "string" && character === '"') || (state === "char" && character === "'")) {
          state = "code";
        }
      }
      return -1;
    }

    function findMemberEndOffset(source, member) {
      const value = String(source || "");
      const signatureEnd = classAnalysis.positionToOffset(value, member?.range?.end);
      const openingBrace = value.indexOf("{", signatureEnd);
      const semicolon = value.indexOf(";", signatureEnd);
      if (member?.kind === "field" && semicolon >= 0) return semicolon + 1;
      if (semicolon >= 0 && (openingBrace < 0 || semicolon < openingBrace)) return semicolon + 1;
      return openingBrace >= 0 ? findMatchingBrace(value, openingBrace) : -1;
    }

    function resolveInsertionOffset(source, analysis, insertionPoint) {
      if (insertionPoint === "first") {
        const nameOffset = classAnalysis.positionToOffset(source, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
        const openingBrace = String(source || "").indexOf("{", nameOffset);
        return openingBrace >= 0 ? openingBrace + 1 : -1;
      }
      if (String(insertionPoint || "").startsWith("after-member:")) {
        const point = analysis.insertionPoints.find((candidate) => candidate.id === insertionPoint);
        const offset = findMemberEndOffset(source, point?.member);
        if (offset >= 0) return offset;
      }
      return classAnalysis.findClosingBraceOffset(source, analysis.owner);
    }

    function getDefaultReturn(returnType) {
      const normalized = String(returnType || "").replace(/<.*>/g, "").trim();
      if (normalized === "void") return "";
      if (normalized === "boolean") return "false";
      if (normalized === "char") return "'\\0'";
      if (["byte", "short", "int", "long", "float", "double"].includes(normalized)) return "0";
      return "null";
    }

    function createMethod(candidate, options, memberIndent, bodyIndent) {
      const comment = options.generateComments === true
        ? memberIndent + "/**\n" + memberIndent + " * {@inheritDoc}\n" + memberIndent + " */\n"
        : "";
      const access = candidate.accessModifier === "package" ? "" : candidate.accessModifier + " ";
      const parameters = candidate.parameters.map((parameter) => parameter.typeName + " " + parameter.name).join(", ");
      const argumentsList = candidate.parameters.map((parameter) => parameter.name).join(", ");
      const throwsClause = candidate.throwsClause ? " throws " + candidate.throwsClause : "";
      const body = [bodyIndent + "// TODO Auto-generated method stub"];
      if (candidate.invocationTarget) {
        const invocation = candidate.invocationTarget + "." + candidate.name + "(" + argumentsList + ")";
        body.push(bodyIndent + (candidate.returnType === "void" ? invocation + ";" : "return " + invocation + ";"));
      } else {
        const defaultReturn = getDefaultReturn(candidate.returnType);
        if (defaultReturn) body.push(bodyIndent + "return " + defaultReturn + ";");
      }
      return comment + memberIndent + "@Override\n" +
        memberIndent + access + candidate.returnType + " " + candidate.name + "(" + parameters + ")" + throwsClause + " {\n" +
        body.join("\n") + "\n" + memberIndent + "}";
    }

    /** Create one undoable insertion containing the selected override stubs. */
    function createInsertion(source, analysis, selectedMethods, generationOptions = {}) {
      const value = String(source || "");
      const selected = Array.isArray(selectedMethods) ? selectedMethods : [];
      if (!analysis?.owner || !selected.length) return null;
      const insertionOffset = resolveInsertionOffset(value, analysis, generationOptions.insertionPoint);
      if (insertionOffset < 0) return null;
      const classIndent = classAnalysis.getLineIndent(value, analysis.owner.selectionRange?.start || analysis.owner.range?.start);
      const memberIndent = classIndent + "    ";
      const methods = selected.map((method) => createMethod(method, generationOptions, memberIndent, memberIndent + "    ")).join("\n\n");
      const before = value.slice(0, insertionOffset);
      const leading = before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
      return { offset: insertionOffset, text: leading + methods + "\n" };
    }

    return { analyze, createInsertion };
  }

  global.createMarkdownViewerJavaOverrideMethodGenerator = createMarkdownViewerJavaOverrideMethodGenerator;
})(window);
