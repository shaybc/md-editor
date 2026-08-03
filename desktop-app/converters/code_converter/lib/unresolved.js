const path = require("path");
const { JS_EXTENSIONS, PY_EXTENSIONS, JAVA_EXTENSIONS, CSHARP_EXTENSIONS } = require("./constants");

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "crypto", "dns", "events", "fs",
  "http", "https", "module", "net", "os", "path", "process", "querystring", "readline", "stream",
  "string_decoder", "timers", "tls", "tty", "url", "util", "vm", "zlib",
]);

const PYTHON_STDLIB = new Set([
  "abc", "argparse", "asyncio", "collections", "contextlib", "csv", "dataclasses", "datetime",
  "functools", "hashlib", "http", "io", "itertools", "json", "logging", "math", "os", "pathlib",
  "re", "shutil", "sqlite3", "subprocess", "sys", "tempfile", "time", "typing", "unittest", "urllib",
]);

function packageBase(importPath) {
  const source = String(importPath || "").trim();
  if (!source || source.startsWith(".") || source.startsWith("/")) return "";
  if (source.startsWith("node:")) return source.slice(5).split("/")[0];
  if (source.startsWith("@")) return source.split("/").slice(0, 2).join("/");
  return source.split("/")[0];
}

function dependencyNames(index, language, kinds = []) {
  return new Set((index?.byLanguage?.get(language) || [])
    .filter((dependency) => !kinds.length || kinds.includes(dependency.kind))
    .flatMap((dependency) => {
      const names = [dependency.name];
      if (dependency.metadata?.artifactId) names.push(dependency.metadata.artifactId);
      if (dependency.metadata?.groupId && dependency.metadata?.artifactId) {
        names.push(`${dependency.metadata.groupId}.${dependency.metadata.artifactId}`);
        names.push(`${dependency.metadata.groupId}:${dependency.metadata.artifactId}`);
      }
      return names;
    })
    .filter(Boolean));
}

function lineNumber(content, index) {
  return String(content || "").slice(0, index).split(/\r?\n/).length;
}

function isProbablyJdkSymbol(qualifiedName) {
  return /^((java|javax|jdk|sun)\.|com\.sun\.)/.test(qualifiedName || "");
}

function findJavaUnresolvedDependencies(content, indexes) {
  const unresolved = [];
  for (const match of content.matchAll(/^(\s*)import\s+(static\s+)?([\w.]+)(\.\*)?\s*;/gm)) {
    const isStatic = Boolean(match[2]);
    const wildcard = Boolean(match[4]);
    const importName = match[3];
    const symbol = isStatic && !wildcard ? importName.split(".").slice(0, -1).join(".") : importName;
    if (!symbol || isProbablyJdkSymbol(symbol)) continue;
    const resolved = wildcard
      ? Array.from(indexes.javaByQualifiedName.keys()).some((qualifiedName) => qualifiedName.startsWith(`${symbol}.`))
      : indexes.javaByQualifiedName.has(symbol);
    if (!resolved) {
      unresolved.push({
        symbol: wildcard ? `${symbol}.*` : symbol,
        kind: wildcard ? "package" : isStatic ? "static-owner" : "class",
        language: "java",
        staticImport: isStatic,
        wildcard,
        line: lineNumber(content, match.index),
      });
    }
  }
  return unresolved;
}

function isSdkCsharpNamespace(value) {
  return /^(System|Microsoft|Windows)(\.|$)/.test(value || "");
}

function findCsharpUnresolvedDependencies(content, indexes, externalIndex) {
  const known = dependencyNames(externalIndex, "csharp", ["nuget", "dll"]);
  const unresolved = [];
  for (const match of content.matchAll(/^\s*using\s+(?:(\w+)\s*=\s*)?([\w.]+)\s*;/gm)) {
    const usingName = match[2];
    if (!usingName || isSdkCsharpNamespace(usingName)) continue;
    const local = indexes.csharpByQualifiedName.has(usingName)
      || Array.from(indexes.csharpByQualifiedName.keys()).some((qualifiedName) => qualifiedName.startsWith(`${usingName}.`));
    const external = Array.from(known).some((name) => usingName === name || usingName.startsWith(`${name}.`) || name.startsWith(`${usingName}.`));
    if (!local && !external) {
      unresolved.push({
        symbol: usingName,
        kind: "namespace",
        language: "csharp",
        staticImport: false,
        wildcard: false,
        line: lineNumber(content, match.index),
      });
    }
  }
  return unresolved;
}

function collectJsPackageImports(content) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]*\s+from\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of content.matchAll(pattern)) {
      const name = packageBase(match[1]);
      if (name) imports.push({ name, index: match.index });
    }
  });
  return imports;
}

function findJsUnresolvedDependencies(content, externalIndex, language) {
  const known = dependencyNames(externalIndex, "javascript", ["npm"]);
  const unresolved = [];
  collectJsPackageImports(content).forEach((entry) => {
    const builtin = NODE_BUILTINS.has(entry.name) || entry.name.startsWith("node:");
    if (!builtin && !known.has(entry.name) && !unresolved.some((item) => item.symbol === entry.name)) {
      unresolved.push({
        symbol: entry.name,
        kind: "package",
        language,
        staticImport: false,
        wildcard: false,
        line: lineNumber(content, entry.index),
      });
    }
  });
  return unresolved;
}

function normalizePythonPackageName(value) {
  return String(value || "").toLowerCase().replace(/[-_.]+/g, "-");
}

function findPythonUnresolvedDependencies(content, indexes, externalIndex) {
  const known = new Set(Array.from(dependencyNames(externalIndex, "python", ["python-package"])).map(normalizePythonPackageName));
  const unresolved = [];
  const add = (symbol, index) => {
    const root = String(symbol || "").split(".")[0];
    if (!root || PYTHON_STDLIB.has(root)) return;
    if (indexes.pythonModules.has(root) || indexes.pythonModules.has(symbol)) return;
    if (known.has(normalizePythonPackageName(root))) return;
    if (unresolved.some((item) => item.symbol === root)) return;
    unresolved.push({
      symbol: root,
      kind: "package",
      language: "python",
      staticImport: false,
      wildcard: false,
      line: lineNumber(content, index),
    });
  };
  for (const match of content.matchAll(/^\s*import\s+(.+)$/gm)) {
    match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0]).forEach((name) => add(name, match.index));
  }
  for (const match of content.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/gm)) {
    if (!match[1].startsWith(".")) add(match[1], match.index);
  }
  return unresolved;
}

function languageForExtension(ext) {
  if (JAVA_EXTENSIONS.includes(ext)) return "java";
  if (CSHARP_EXTENSIONS.includes(ext)) return "csharp";
  if (PY_EXTENSIONS.includes(ext)) return "python";
  if ([".ts", ".tsx"].includes(ext)) return "typescript";
  if (JS_EXTENSIONS.includes(ext)) return "javascript";
  return "unknown";
}

function findUnresolvedDependencies(file, content, indexes, externalIndex) {
  const ext = path.extname(file).toLowerCase();
  if (JAVA_EXTENSIONS.includes(ext)) return findJavaUnresolvedDependencies(content, indexes);
  if (CSHARP_EXTENSIONS.includes(ext)) return findCsharpUnresolvedDependencies(content, indexes, externalIndex);
  if (PY_EXTENSIONS.includes(ext)) return findPythonUnresolvedDependencies(content, indexes, externalIndex);
  if (JS_EXTENSIONS.includes(ext)) return findJsUnresolvedDependencies(content, externalIndex, languageForExtension(ext));
  return [];
}

module.exports = {
  findUnresolvedDependencies,
  findJavaUnresolvedDependencies,
  languageForExtension,
  collectJsPackageImports,
};
