// Resolve a Java superclass source file without waiting for language-server analysis.
(function(global) {
  "use strict";

  /**
   * Create the targeted Java superclass source resolver.
   * @param {{ readFile?: Function, classAnalysis?: object, getOutlineLanguage?: Function }} options Resolver dependencies.
   * @returns {object} Superclass declaration and source resolution API.
   */
  function createMarkdownViewerJavaSuperclassResolver(options = {}) {
    const readFile = options.readFile || (async function() { return null; });
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };
    const classAnalysis = options.classAnalysis || window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/");
    }

    function getPackageName(source) {
      return String(source || "").match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] || "";
    }

    function getTypeHeader(source, owner) {
      const value = String(source || "");
      const nameOffset = classAnalysis.positionToOffset(value, owner?.selectionRange?.start || owner?.range?.start);
      const openingBrace = value.indexOf("{", nameOffset);
      return value.slice(nameOffset, openingBrace >= 0 ? openingBrace : nameOffset);
    }
    function splitTypeReferences(references) {
      const result = [];
      let start = 0;
      let angleDepth = 0;
      const value = String(references || "");
      for (let index = 0; index <= value.length; index += 1) {
        const character = value[index];
        if (character === "<") angleDepth += 1;
        else if (character === ">") angleDepth = Math.max(0, angleDepth - 1);
        if ((character === "," && angleDepth === 0) || index === value.length) {
          result.push(value.slice(start, index));
          start = index + 1;
        }
      }
      return result.map((reference) => reference.replace(/<.*>/g, "").trim())
        .filter((reference) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(reference));
    }

    function getDirectTypeReferences(source, owner) {
      const header = getTypeHeader(source, owner);
      if (owner?.kind === "interface") {
        const extendedInterfaces = header.match(/\bextends\s+([^\{]+)/)?.[1] || "";
        return splitTypeReferences(extendedInterfaces).map((reference) => ({ reference, relation: "interface" }));
      }
      const superclass = header.match(/\bextends\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/)?.[1] || "";
      const implementsClause = header.match(/\bimplements\s+([^\{]+)/)?.[1] || "";
      return [
        ...(superclass ? [{ reference: superclass, relation: "superclass" }] : []),
        ...splitTypeReferences(implementsClause).map((reference) => ({ reference, relation: "interface" }))
      ];
    }


    function getImportedType(source, simpleName) {
      const matcher = /\bimport\s+(?!static\b)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/g;
      let match;
      while ((match = matcher.exec(String(source || "")))) {
        if (match[1].split(".").pop() === simpleName) return match[1];
      }
      return "";
    }

    function getSourceRoot(activePath, packageName) {
      const normalized = normalizePath(activePath);
      const directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
      const packagePath = String(packageName || "").replace(/\./g, "/");
      if (!packagePath) return directory;
      const suffix = "/" + packagePath;
      return directory.toLowerCase().endsWith(suffix.toLowerCase())
        ? directory.slice(0, directory.length - suffix.length)
        : directory;
    }

    function createCandidatePaths(source, activePath, typeReference) {
      const normalizedPath = normalizePath(activePath);
      const directory = normalizedPath.slice(0, Math.max(0, normalizedPath.lastIndexOf("/")));
      const simpleName = typeReference.split(".").pop();
      const packageName = getPackageName(source);
      const importedName = typeReference.includes(".")
        ? typeReference
        : getImportedType(source, simpleName);
      const qualifiedName = importedName || (packageName ? packageName + "." + simpleName : simpleName);
      const sourceRoot = getSourceRoot(normalizedPath, packageName);
      return Array.from(new Set([
        directory + "/" + simpleName + ".java",
        sourceRoot + "/" + qualifiedName.replace(/\./g, "/") + ".java"
      ].filter((candidate) => candidate && candidate !== normalizedPath)));
    }

    function findType(source, typeName) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      let found = null;
      function visit(node) {
        if (!found && ["class", "interface"].includes(node?.kind) && node.name === typeName) found = node;
        (node?.children || []).forEach(visit);
      }
      language.parse(String(source || ""), {}).forEach(visit);
      return found;
    }

    function sourceContainsType(source, typeName) {
      return !!findType(source, typeName);
    }

    /** Resolve a named source type from the active file or a deterministic project path. */
    async function resolveType(source, activePath, reference) {
      const value = String(source || "");
      const typeName = String(reference || "").split(".").pop();
      if (sourceContainsType(value, typeName)) {
        return { typeName, className: typeName, reference, source: value, path: normalizePath(activePath), reason: "resolved" };
      }
      for (const path of createCandidatePaths(value, activePath, reference)) {
        try {
          const typeSource = await readFile(path);
          if (typeSource != null && sourceContainsType(typeSource, typeName)) {
            return { typeName, className: typeName, reference, source: String(typeSource), path, reason: "resolved" };
          }
        } catch (_) {
          // Missing deterministic candidates are expected; the next candidate may still resolve.
        }
      }
      return { typeName, className: typeName, reference, source: "", path: "", reason: "not-found" };
    }

    /** Resolve the superclass source from the active file or a deterministic project path. */
    async function resolve(source, cursorOffset, activePath) {
      const value = String(source || "");
      const owner = classAnalysis?.findActiveClass(value, Math.max(0, Number(cursorOffset) || 0));
      if (!owner) return { owner: null, reason: "no-class" };
      const reference = getDirectTypeReferences(value, owner).find((candidate) => candidate.relation === "superclass")?.reference || "";
      if (!reference) return { owner, reason: "no-superclass" };
      return { owner, ...await resolveType(value, activePath, reference) };
    }

    return { findType, getDirectTypeReferences, resolve, resolveType };
  }

  global.createMarkdownViewerJavaSuperclassResolver = createMarkdownViewerJavaSuperclassResolver;
})(window);
