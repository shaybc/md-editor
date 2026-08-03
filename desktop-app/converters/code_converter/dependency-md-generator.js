#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { discoverExternalDependencies, createExternalDependencyIndex } = require("./lib/external-discovery");
const unresolvedApi = require("./lib/unresolved");
const { createReport, writeMissingDependenciesReport } = require("./lib/report-writer");
const { MD_EDITOR_DIR, MD_EDITOR_RECOVERY_DIR, PROJECT_METADATA_FILE } = require("./lib/constants");

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cs",
]);

const JS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const PY_EXTENSIONS = [".py"];
const JAVA_EXTENSIONS = [".java"];
const CSHARP_EXTENSIONS = [".cs"];

const IGNORED_DIRS = new Set([
  ".git",
  ".github",
  ".gitlab",
  ".gitea",
  ".md-editor",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  ".vs",
  ".settings",
  ".metadata",
  ".recommenders",
  ".externalToolBuilders",
  ".mvn",
  ".gradle",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".yarn-cache",
  "bower_components",
  "dist",
  "build",
  "coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".angular",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vite",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".ipynb_checkpoints",
  "target",
  "out",
  "bin",
  "obj",
  ".cxx",
  ".externalNativeBuild",
  "captures",
  "DerivedData",
  ".swiftpm",
  ".build",
]);

function usage() {
  console.error([
    "Usage: node dependency-md-generator.js <source-root> <destination-root> [switches]",
    "",
    "Switches:",
    "  --include-methods",
    "  --include-accessors",
    "  --include-signatures",
    "  --include-return-codes",
    "  --include-exceptions",
    "  --include-package",
    "  --include-comments",
    "  --source-root-home <folder>",
  ].join("\n"));
}

function logProgress(message) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${timestamp}] ${message}`);
}

function normalizePath(filePath) {
  return path.resolve(filePath);
}

function toMarkdownPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function stripComments(content, ext) {
  if (ext === ".py") {
    return content
      .replace(/'''[\s\S]*?'''/g, "")
      .replace(/"""[\s\S]*?"""/g, "")
      .replace(/#.*$/gm, "");
  }

  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function parseArgs(argv) {
  const options = {
    includeMethods: false,
    includeAccessors: false,
    includeSignatures: false,
    includeReturnCodes: false,
    includeExceptions: false,
    includePackage: false,
    includeComments: false,
    sourceRootHome: "",
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--include-methods") options.includeMethods = true;
    else if (arg === "--include-accessors") options.includeAccessors = true;
    else if (arg === "--include-signatures") options.includeSignatures = true;
    else if (arg === "--include-return-codes") options.includeReturnCodes = true;
    else if (arg === "--include-exceptions") options.includeExceptions = true;
    else if (arg === "--include-package") options.includePackage = true;
    else if (arg === "--include-comments") options.includeComments = true;
    else if (arg === "--source-root-home") {
      options.sourceRootHome = argv[index + 1] || "";
      index += 1;
    }
    else if (arg.startsWith("--")) {
      console.error(`Unknown switch: ${arg}`);
      usage();
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }

  return { sourceArg: positional[0], destinationArg: positional[1], options };
}

function walkSourceFiles(root) {
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  walk(root);
  return files;
}

function shouldLogProgress(count, total, interval) {
  return count === total || count % interval === 0;
}

function buildIndexes(sourceRoot, files) {
  const byPathNoExt = new Map();
  const javaByQualifiedName = new Map();
  const javaBySimpleName = new Map();
  const csharpByQualifiedName = new Map();
  const csharpBySimpleName = new Map();
  const pythonModules = new Map();

  files.forEach((file, index) => {
    const ext = path.extname(file);
    byPathNoExt.set(file.slice(0, -ext.length), file);

    if (ext === ".py") {
      const relNoExt = path.relative(sourceRoot, file).slice(0, -ext.length);
      const moduleName = relNoExt
        .split(path.sep)
        .filter((part) => part !== "__init__")
        .join(".");
      if (moduleName) {
        pythonModules.set(moduleName, file);
      }
    }

    if (ext === ".java") {
      const content = fs.readFileSync(file, "utf8");
      const packageName = content.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
      const className = content.match(/\b(?:class|interface|enum|record)\s+([A-Z]\w*)\b/)?.[1];
      if (className) {
        const qualifiedName = packageName ? `${packageName}.${className}` : className;
        javaByQualifiedName.set(qualifiedName, file);
        if (!javaBySimpleName.has(className)) {
          javaBySimpleName.set(className, []);
        }
        javaBySimpleName.get(className).push({ file, packageName, qualifiedName });
      }
    }

    if (ext === ".cs") {
      const content = fs.readFileSync(file, "utf8");
      const namespaceName =
        content.match(/^\s*namespace\s+([\w.]+)\s*;/m)?.[1] ||
        content.match(/^\s*namespace\s+([\w.]+)\s*\{/m)?.[1] ||
        "";
      const typeName = content.match(/\b(?:class|interface|enum|record|struct)\s+([A-Z]\w*)\b/)?.[1];
      if (typeName) {
        const qualifiedName = namespaceName ? `${namespaceName}.${typeName}` : typeName;
        csharpByQualifiedName.set(qualifiedName, file);
        if (!csharpBySimpleName.has(typeName)) {
          csharpBySimpleName.set(typeName, []);
        }
        csharpBySimpleName.get(typeName).push({ file, namespaceName, qualifiedName });
      }
    }
    const indexedCount = index + 1;
    if (shouldLogProgress(indexedCount, files.length, 1000)) {
      logProgress(`Indexed ${indexedCount} / ${files.length} source files...`);
    }
  });

  return { byPathNoExt, javaByQualifiedName, javaBySimpleName, csharpByQualifiedName, csharpBySimpleName, pythonModules };
}

function resolveFileCandidates(basePath, extensions) {
  const candidates = [];

  if (path.extname(basePath)) {
    candidates.push(basePath);
  } else {
    for (const ext of extensions) {
      candidates.push(`${basePath}${ext}`);
    }

    for (const ext of extensions) {
      candidates.push(path.join(basePath, `index${ext}`));
    }
  }

  return candidates;
}

function firstExistingFile(candidates, sourceRoot) {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (isInside(sourceRoot, resolved) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return null;
}

function isInside(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolveJsDependency(importPath, file, sourceRoot) {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const basePath = importPath.startsWith("/")
    ? path.join(sourceRoot, importPath)
    : path.resolve(path.dirname(file), importPath);

  return firstExistingFile(resolveFileCandidates(basePath, JS_EXTENSIONS), sourceRoot);
}

function findJsDependencies(content, file, sourceRoot) {
  const dependencies = new Set();
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]*\s+from\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const dependency = resolveJsDependency(match[1], file, sourceRoot);
      if (dependency) {
        dependencies.add(dependency);
      }
    }
  }

  return dependencies;
}

function resolvePythonModule(moduleName, indexes) {
  if (!moduleName) {
    return null;
  }

  return indexes.pythonModules.get(moduleName) || null;
}

function resolvePythonRelativeModule(dots, moduleName, file, sourceRoot) {
  let dir = path.dirname(file);
  for (let i = 1; i < dots.length; i += 1) {
    dir = path.dirname(dir);
  }

  const parts = moduleName ? moduleName.split(".") : [];
  const basePath = path.join(dir, ...parts);
  return firstExistingFile(
    [
      ...resolveFileCandidates(basePath, PY_EXTENSIONS),
      path.join(basePath, "__init__.py"),
    ],
    sourceRoot,
  );
}

function findPythonDependencies(content, file, sourceRoot, indexes) {
  const dependencies = new Set();

  for (const match of content.matchAll(/^\s*import\s+(.+)$/gm)) {
    const imports = match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0]);
    for (const importName of imports) {
      const dependency = resolvePythonModule(importName, indexes);
      if (dependency) {
        dependencies.add(dependency);
      }
    }
  }

  for (const match of content.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/gm)) {
    const moduleRef = match[1];
    const importedNames = match[2]
      .split(",")
      .map((part) => part.trim().split(/\s+as\s+/)[0])
      .filter((part) => part && part !== "*");

    let dependency = null;
    if (moduleRef.startsWith(".")) {
      const dots = moduleRef.match(/^\.+/)?.[0] || "";
      const moduleName = moduleRef.slice(dots.length);
      dependency = resolvePythonRelativeModule(dots, moduleName, file, sourceRoot);
    } else {
      dependency = resolvePythonModule(moduleRef, indexes);
    }

    if (dependency) {
      dependencies.add(dependency);
    }

    for (const importedName of importedNames) {
      const nestedModule = moduleRef.startsWith(".")
        ? null
        : resolvePythonModule(`${moduleRef}.${importedName}`, indexes);
      if (nestedModule) {
        dependencies.add(nestedModule);
      }
    }
  }

  return dependencies;
}

function findJavaDependencies(content, file, indexes) {
  const dependencies = new Set();
  const packageName = content.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";

  for (const match of content.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;/gm)) {
    const importName = match[1];
    const dependency =
      indexes.javaByQualifiedName.get(importName) ||
      indexes.javaByQualifiedName.get(importName.split(".").slice(0, -1).join("."));

    if (dependency) {
      dependencies.add(dependency);
    }
  }

  for (const [simpleName, matches] of indexes.javaBySimpleName.entries()) {
    if (!new RegExp(`\\b${simpleName}\\b`).test(content)) {
      continue;
    }

    for (const candidate of matches) {
      if (candidate.file !== file && candidate.packageName === packageName) {
        dependencies.add(candidate.file);
      }
    }
  }

  return dependencies;
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
        staticImport: isStatic,
        wildcard,
        line: content.slice(0, match.index).split(/\r?\n/).length
      });
    }
  }
  return unresolved;
}

function isProbablyJdkSymbol(qualifiedName) {
  return /^((java|javax|jdk|sun)\.|com\.sun\.)/.test(qualifiedName || "");
}

function findCsharpDependencies(content, file, indexes) {
  const dependencies = new Set();
  const namespaceName =
    content.match(/^\s*namespace\s+([\w.]+)\s*;/m)?.[1] ||
    content.match(/^\s*namespace\s+([\w.]+)\s*\{/m)?.[1] ||
    "";
  const usingNamespaces = new Set();
  const aliasTargets = new Map();

  for (const match of content.matchAll(/^\s*using\s+(?:(\w+)\s*=\s*)?([\w.]+)\s*;/gm)) {
    const alias = match[1] || "";
    const usingName = match[2];

    if (alias) {
      aliasTargets.set(alias, usingName);
      const dependency = indexes.csharpByQualifiedName.get(usingName);
      if (dependency) {
        dependencies.add(dependency);
      }
    } else {
      usingNamespaces.add(usingName);
      const dependency = indexes.csharpByQualifiedName.get(usingName);
      if (dependency) {
        dependencies.add(dependency);
      }
    }
  }

  for (const [alias, qualifiedName] of aliasTargets.entries()) {
    const dependency = indexes.csharpByQualifiedName.get(qualifiedName);
    if (dependency && new RegExp(`\\b${alias}\\b`).test(content)) {
      dependencies.add(dependency);
    }
  }

  for (const [simpleName, matches] of indexes.csharpBySimpleName.entries()) {
    if (!new RegExp(`\\b${simpleName}\\b`).test(content)) {
      continue;
    }

    for (const candidate of matches) {
      if (
        candidate.file !== file &&
        (candidate.namespaceName === namespaceName || usingNamespaces.has(candidate.namespaceName))
      ) {
        dependencies.add(candidate.file);
      }
    }
  }

  return dependencies;
}

function findDependencies(file, sourceRoot, indexes) {
  const ext = path.extname(file);
  const rawContent = fs.readFileSync(file, "utf8");
  const content = stripComments(rawContent, ext);

  if (JS_EXTENSIONS.includes(ext)) {
    return findJsDependencies(content, file, sourceRoot);
  }

  if (PY_EXTENSIONS.includes(ext)) {
    return findPythonDependencies(content, file, sourceRoot, indexes);
  }

  if (JAVA_EXTENSIONS.includes(ext)) {
    return findJavaDependencies(content, file, indexes);
  }

  if (CSHARP_EXTENSIONS.includes(ext)) {
    return findCsharpDependencies(content, file, indexes);
  }

  return new Set();
}

function markdownLink(fromFile, toFile, label = toMarkdownPath(toFile)) {
  const rel = path.relative(path.dirname(fromFile), toFile) || path.basename(toFile);
  const href = encodeURI(toMarkdownPath(rel));
  return `[${label}](${href})`;
}

function getMarkdownOutputFile(sourceRoot, destinationRoot, sourceFile) {
  const relativeSource = path.relative(sourceRoot, sourceFile);
  return path.join(destinationRoot, `${relativeSource}.md`);
}

function getPortableSourcePath(sourceRootHome, sourceFile) {
  const relativeSource = path.relative(sourceRootHome, sourceFile);
  if (relativeSource && !relativeSource.startsWith("..") && !path.isAbsolute(relativeSource)) {
    return toMarkdownPath(relativeSource);
  }
  return toMarkdownPath(sourceFile);
}

function writeProjectMetadata(destinationRoot, sourceRootHome) {
  const now = new Date().toISOString();
  const metadataDir = path.join(destinationRoot, MD_EDITOR_DIR);
  fs.mkdirSync(path.join(metadataDir, MD_EDITOR_RECOVERY_DIR), { recursive: true });
  const metadataPath = path.join(metadataDir, PROJECT_METADATA_FILE);
  const metadata = {
    schemaVersion: 1,
    type: "md-editor-generated-code-folder",
    sourceRootPath: toMarkdownPath(sourceRootHome),
    sourcePathMode: "relative-to-source-root",
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function getPackageName(content, ext, sourceRoot, sourceFile) {
  if (ext === ".java") {
    return content.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
  }

  if (ext === ".cs") {
    return content.match(/^\s*namespace\s+([\w.]+)\s*;/m)?.[1] ||
      content.match(/^\s*namespace\s+([\w.]+)\s*\{/m)?.[1] ||
      "";
  }

  if (ext === ".py") {
    return path.relative(sourceRoot, sourceFile)
      .slice(0, -ext.length)
      .split(path.sep)
      .filter((part) => part !== "__init__")
      .join(".");
  }

  return "";
}

function getEntityInfo(content, ext, sourceRoot, sourceFile) {
  const packageName = getPackageName(content, ext, sourceRoot, sourceFile);

  if (ext === ".java") {
    const declaration = content.match(/\b(class|interface|enum|record)\s+([A-Z]\w*)\b/);
    const kind = declaration?.[1] || "class";
    const name = declaration?.[2] || path.basename(sourceFile, ext);
    return {
      entityType: `java_${kind}`,
      entityId: packageName ? `${packageName}.${name}` : name,
      packageName,
    };
  }

  if (ext === ".cs") {
    const declaration = content.match(/\b(class|interface|enum|record|struct)\s+([A-Z]\w*)\b/);
    const kind = declaration?.[1] || "class";
    const name = declaration?.[2] || path.basename(sourceFile, ext);
    return {
      entityType: `csharp_${kind}`,
      entityId: packageName ? `${packageName}.${name}` : name,
      packageName,
    };
  }

  const relativeNoExt = path.relative(sourceRoot, sourceFile).slice(0, -ext.length);
  const moduleId = toMarkdownPath(relativeNoExt).replace(/\//g, ".");
  if (ext === ".py") {
    return { entityType: "python_module", entityId: packageName || moduleId, packageName };
  }

  if ([".ts", ".tsx"].includes(ext)) {
    return { entityType: "typescript_module", entityId: moduleId, packageName };
  }

  return { entityType: "javascript_module", entityId: moduleId, packageName };
}

function compactSignature(signature) {
  return signature.replace(/\s+/g, " ").replace(/\s*{\s*$/, "").trim();
}

function findMatchingBrace(content, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function getBlockAfterSignature(content, signatureIndex, signatureText) {
  const openIndex = content.indexOf("{", signatureIndex + signatureText.length - 1);
  if (openIndex === -1) return "";
  const closeIndex = findMatchingBrace(content, openIndex);
  if (closeIndex === -1) return "";
  return content.slice(openIndex + 1, closeIndex);
}

function uniqueList(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractReturnCodes(body, ext) {
  const pattern = ext === ".py"
    ? /^\s*return(?:\s+(.+?))?\s*$/gm
    : /\breturn(?:\s+([^;]+))?\s*;/g;
  return uniqueList([...body.matchAll(pattern)].map((match) => match[1] || "void"));
}

function extractThrownExceptions(body, ext) {
  if (ext === ".py") {
    return uniqueList([...body.matchAll(/^\s*raise\s+([\w.]+)/gm)].map((match) => match[1]));
  }

  return uniqueList([...body.matchAll(/\bthrow\s+new\s+([\w.]+)/g)].map((match) => match[1]));
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function trimOuterBlankLines(lines) {
  const trimmedLines = [...lines];
  while (trimmedLines.length && /^\s*$/.test(trimmedLines[0])) trimmedLines.shift();
  while (trimmedLines.length && /^\s*$/.test(trimmedLines[trimmedLines.length - 1])) trimmedLines.pop();
  return trimmedLines;
}

function cleanDocumentationText(text) {
  const lines = decodeXmlEntities(String(text || ""))
    .replace(/^\s*\/\*\*?[ \t]?/g, "")
    .replace(/[ \t]?\*\/\s*$/g, "")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*\* ?/, "")
      .replace(/^\s*\/\/\/? ?/, "")
      .replace(/^\s*# ?/, "")
      .replace(/<\/?(summary|remarks|returns|value|param|typeparam|exception|inheritdoc|see|seealso|para|code|c)[^>]*>/gi, "")
      .replace(/<[^>]+>/g, ""));

  return trimOuterBlankLines(lines).join("\n");
}

function getMarkdownFence(content) {
  let fence = "```";
  while (String(content || "").includes(fence)) {
    fence += "`";
  }
  return fence;
}

function appendDocumentationBlock(lines, documentation) {
  const fence = getMarkdownFence(documentation);
  lines.push("Documentation:", "", fence, documentation, fence, "");
}

function getLineStart(content, index) {
  return content.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
}

function stripTrailingAnnotationLines(text) {
  const lines = String(text || "").replace(/\s+$/g, "").split(/\r?\n/);
  while (lines.length && /^\s*@[\w.]+(?:\([^)]*\))?\s*$/.test(lines[lines.length - 1])) {
    lines.pop();
  }
  return lines.join("\n");
}

function getLeadingDocumentation(content, declarationIndex, ext) {
  const beforeDeclaration = stripTrailingAnnotationLines(content.slice(0, getLineStart(content, declarationIndex)));
  if (!beforeDeclaration) return "";

  if (beforeDeclaration.endsWith("*/")) {
    const blockStart = beforeDeclaration.lastIndexOf("/*");
    if (blockStart !== -1) return cleanDocumentationText(beforeDeclaration.slice(blockStart));
  }

  const lineCommentPattern = ext === ".py" ? /^\s*#/ : /^\s*\/\/\/?/;
  const lines = beforeDeclaration.split(/\r?\n/);
  const collected = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!lineCommentPattern.test(line)) break;
    collected.unshift(line);
  }

  return collected.length ? cleanDocumentationText(collected.join("\n")) : "";
}

function getMatchDeclarationIndex(match) {
  const offset = String(match?.[0] || "").search(/\S/);
  return match.index + (offset === -1 ? 0 : offset);
}

function readQuotedString(content, quoteIndex) {
  const quote = content[quoteIndex];
  if (quote !== "'" && quote !== '"') return null;
  const triple = content.slice(quoteIndex, quoteIndex + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  const valueStart = quoteIndex + delimiter.length;
  const valueEnd = content.indexOf(delimiter, valueStart);
  if (valueEnd === -1) return null;
  return {
    value: content.slice(valueStart, valueEnd),
    endIndex: valueEnd + delimiter.length,
  };
}

function getPythonDocstringAfter(content, bodyStartIndex) {
  const rest = content.slice(bodyStartIndex);
  const match = rest.match(/^\s*(?:[rubfRUBF]{0,3})("""|''')/);
  if (!match) return "";
  const quoteIndex = bodyStartIndex + match.index + match[0].lastIndexOf(match[1]);
  const docstring = readQuotedString(content, quoteIndex);
  return docstring ? cleanDocumentationText(docstring.value) : "";
}

function getPythonModuleDocstring(content) {
  const match = content.match(/^\s*(?:[rubfRUBF]{0,3})("""|''')/);
  if (!match) return "";
  const quoteIndex = match.index + match[0].lastIndexOf(match[1]);
  const docstring = readQuotedString(content, quoteIndex);
  return docstring ? cleanDocumentationText(docstring.value) : "";
}

function addDocumentationEntry(entries, name, signature, documentation) {
  const cleaned = cleanDocumentationText(documentation);
  if (!name || !cleaned) return;
  entries.push({ name, signature: compactSignature(signature || ""), documentation: cleaned });
}

function findDocumentationForMethod(method, entries) {
  const exactMatch = entries.find((entry) => entry.name === method.name && entry.signature === method.signature);
  if (exactMatch) return exactMatch.documentation;
  return entries.find((entry) => entry.name === method.name)?.documentation || "";
}

function getEntityDisplayName(entity) {
  const id = String(entity?.entityId || "").trim();
  if (!id) return "Source";
  return id.split(".").filter(Boolean).pop() || id;
}

function getEntityKind(entity) {
  return String(entity?.entityType || "source").replace(/^[^_]+_/, "") || "source";
}

function getSourceDocumentationMember(entity, documentationInfo) {
  const documentation = documentationInfo?.sourceDocumentation || "";
  if (!documentation) return null;
  const kind = documentationInfo.sourceKind || getEntityKind(entity);
  const name = documentationInfo.sourceName || getEntityDisplayName(entity);
  return {
    name,
    heading: `${kind.charAt(0).toUpperCase()}${kind.slice(1)}: ${name}`,
    kind,
    signature: "",
    documentation,
    returnCodes: [],
    exceptions: [],
    isSourceEntity: true,
  };
}

function extractJavaDocumentation(rawContent) {
  const entries = [];
  const typeMatch = rawContent.match(/\b(?:class|interface|enum|record)\s+[A-Z]\w*\b/);
  const sourceDeclaration = typeMatch?.[0]?.match(/\b(class|interface|enum|record)\s+([A-Z]\w*)\b/);
  const sourceDocumentation = typeMatch ? getLeadingDocumentation(rawContent, typeMatch.index, ".java") : "";
  const methodPattern = /((?:public|protected|private|static|final|abstract|synchronized|native|strictfp|\s)+(?:<[^;{}()]+>\s+)?[\w<>\[\], ?.&]+\s+(\w+)\s*\([^;{}]*\)\s*(?:throws\s+[\w.,\s]+)?\s*)\{/g;

  for (const match of rawContent.matchAll(methodPattern)) {
    const signature = compactSignature(match[1]);
    if (/^(if|for|while|switch|catch)\b/.test(signature)) continue;
    addDocumentationEntry(entries, match[2], signature, getLeadingDocumentation(rawContent, getMatchDeclarationIndex(match), ".java"));
  }

  return {
    sourceDocumentation,
    sourceKind: sourceDeclaration?.[1] || "",
    sourceName: sourceDeclaration?.[2] || "",
    memberDocumentation: entries,
  };
}

function extractCsharpDocumentation(rawContent) {
  const entries = [];
  const typeMatch = rawContent.match(/\b(?:class|interface|enum|record|struct)\s+[A-Z]\w*\b/);
  const sourceDeclaration = typeMatch?.[0]?.match(/\b(class|interface|enum|record|struct)\s+([A-Z]\w*)\b/);
  const sourceDocumentation = typeMatch ? getLeadingDocumentation(rawContent, typeMatch.index, ".cs") : "";
  const methodPattern = /((?:public|protected|private|internal|static|sealed|abstract|virtual|override|async|extern|partial|new|\s)+[\w<>\[\], ?.&]+\s+(\w+)\s*\([^;{}]*\)\s*)\{/g;
  const propertyPattern = /((?:public|protected|private|internal|static|sealed|abstract|virtual|override|new|\s)+[\w<>\[\], ?.&]+\s+(\w+)\s*)\{\s*(?:get|set|init)\b/g;

  for (const match of rawContent.matchAll(methodPattern)) {
    const signature = compactSignature(match[1]);
    if (/^(if|for|foreach|while|switch|catch|using|lock)\b/.test(signature)) continue;
    addDocumentationEntry(entries, match[2], signature, getLeadingDocumentation(rawContent, getMatchDeclarationIndex(match), ".cs"));
  }

  for (const match of rawContent.matchAll(propertyPattern)) {
    addDocumentationEntry(entries, match[2], compactSignature(match[1]), getLeadingDocumentation(rawContent, getMatchDeclarationIndex(match), ".cs"));
  }

  return {
    sourceDocumentation,
    sourceKind: sourceDeclaration?.[1] || "",
    sourceName: sourceDeclaration?.[2] || "",
    memberDocumentation: entries,
  };
}

function extractPythonDocumentation(rawContent) {
  const entries = [];
  const classMatch = rawContent.match(/^(\s*)class\s+([A-Z_]\w*)[^\n]*:/m);
  const sourceDocumentation = classMatch
    ? (getPythonDocstringAfter(rawContent, classMatch.index + classMatch[0].length) || getLeadingDocumentation(rawContent, classMatch.index, ".py"))
    : getPythonModuleDocstring(rawContent);
  const pattern = /^(\s*)def\s+(\w+)\s*(\([^)]*\)(?:\s*->\s*[^:]+)?)\s*:/gm;

  for (const match of rawContent.matchAll(pattern)) {
    const signature = `def ${match[2]}${compactSignature(match[3])}`;
    const documentation =
      getPythonDocstringAfter(rawContent, match.index + match[0].length) ||
      getLeadingDocumentation(rawContent, getMatchDeclarationIndex(match), ".py");
    addDocumentationEntry(entries, match[2], signature, documentation);
  }

  return {
    sourceDocumentation,
    sourceKind: classMatch ? "class" : "module",
    sourceName: classMatch?.[2] || "",
    memberDocumentation: entries,
  };
}

function extractJsDocumentation(rawContent) {
  const entries = [];
  const sourceMatch = rawContent.match(/^\s*(?:export\s+default\s+)?(?:export\s+)?(class|function)\s+(\w+)\b/m);
  const sourceDocumentation = sourceMatch ? getLeadingDocumentation(rawContent, sourceMatch.index, ".js") : "";
  const patterns = [
    /((?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\))/g,
    /((?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g,
    /((?:async\s+)?(get|set)\s+(\w+)\s*\([^)]*\))/g,
    /((?:async\s+)?(\w+)\s*\([^)]*\)\s*)\{/g,
  ];

  for (const pattern of patterns) {
    for (const match of rawContent.matchAll(pattern)) {
      const name = match[3] || match[2];
      if (!name || /^(if|for|while|switch|catch|function)$/.test(name)) continue;
      const signature = compactSignature(match[1]);
      if (entries.some((entry) => entry.name === name && entry.signature === signature)) continue;
      addDocumentationEntry(entries, name, signature, getLeadingDocumentation(rawContent, getMatchDeclarationIndex(match), ".js"));
    }
  }

  return {
    sourceDocumentation,
    sourceKind: sourceMatch?.[1] || "module",
    sourceName: sourceMatch?.[2] || "",
    memberDocumentation: entries,
  };
}

function extractDocumentationInfo(rawContent, ext) {
  if (ext === ".java") return extractJavaDocumentation(rawContent);
  if (ext === ".cs") return extractCsharpDocumentation(rawContent);
  if (ext === ".py") return extractPythonDocumentation(rawContent);
  if (JS_EXTENSIONS.includes(ext)) return extractJsDocumentation(rawContent);
  return { sourceDocumentation: "", memberDocumentation: [] };
}

function isAccessorName(name) {
  return /^(get|set)[A-Z_]/.test(name) || /^(__get|__set)/.test(name);
}

function extractJavaMethods(content) {
  const methods = [];
  const pattern = /((?:public|protected|private|static|final|abstract|synchronized|native|strictfp|\s)+(?:<[^;{}()]+>\s+)?[\w<>\[\], ?.&]+\s+(\w+)\s*\([^;{}]*\)\s*(?:throws\s+[\w.,\s]+)?\s*)\{/g;

  for (const match of content.matchAll(pattern)) {
    const signature = compactSignature(match[1]);
    if (/^(if|for|while|switch|catch)\b/.test(signature)) continue;
    const name = match[2];
    const body = getBlockAfterSignature(content, match.index, match[0]);
    const declaredThrows = signature.match(/\bthrows\s+(.+)$/)?.[1]
      ?.split(",")
      .map((part) => part.trim()) || [];
    methods.push({
      name,
      kind: isAccessorName(name) ? "accessor" : "method",
      signature,
      returnCodes: extractReturnCodes(body, ".java"),
      exceptions: uniqueList([...declaredThrows, ...extractThrownExceptions(body, ".java")]),
    });
  }

  return methods;
}

function extractCsharpMethods(content) {
  const methods = [];
  const methodPattern = /((?:public|protected|private|internal|static|sealed|abstract|virtual|override|async|extern|partial|new|\s)+[\w<>\[\], ?.&]+\s+(\w+)\s*\([^;{}]*\)\s*)\{/g;
  const propertyPattern = /((?:public|protected|private|internal|static|sealed|abstract|virtual|override|new|\s)+[\w<>\[\], ?.&]+\s+(\w+)\s*)\{\s*(?:get|set|init)\b/g;

  for (const match of content.matchAll(methodPattern)) {
    const signature = compactSignature(match[1]);
    if (/^(if|for|foreach|while|switch|catch|using|lock)\b/.test(signature)) continue;
    const name = match[2];
    const body = getBlockAfterSignature(content, match.index, match[0]);
    methods.push({
      name,
      kind: isAccessorName(name) ? "accessor" : "method",
      signature,
      returnCodes: extractReturnCodes(body, ".cs"),
      exceptions: extractThrownExceptions(body, ".cs"),
    });
  }

  for (const match of content.matchAll(propertyPattern)) {
    const name = match[2];
    const signature = compactSignature(match[1]);
    if (methods.some((method) => method.name === name && method.signature === signature)) continue;
    methods.push({
      name,
      kind: "accessor",
      signature,
      returnCodes: [],
      exceptions: [],
    });
  }

  return methods;
}

function extractPythonMethods(content) {
  const methods = [];
  const pattern = /^(\s*)def\s+(\w+)\s*(\([^)]*\)(?:\s*->\s*[^:]+)?)\s*:/gm;

  for (const match of content.matchAll(pattern)) {
    const indent = match[1] || "";
    const name = match[2];
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const nextSibling = rest.search(new RegExp(`\\n${indent}def\\s+|\\n${indent}class\\s+`));
    const body = nextSibling === -1 ? rest : rest.slice(0, nextSibling);
    const previous = content.slice(Math.max(0, match.index - 120), match.index);
    const isProperty = /@\w*\.?setter\s*$|@property\s*$/m.test(previous);
    methods.push({
      name,
      kind: isProperty || isAccessorName(name) ? "accessor" : "function",
      signature: `def ${name}${compactSignature(match[3])}`,
      returnCodes: extractReturnCodes(body, ".py"),
      exceptions: extractThrownExceptions(body, ".py"),
    });
  }

  return methods;
}

function extractJsMethods(content) {
  const methods = [];
  const patterns = [
    /((?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\))/g,
    /((?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g,
    /((?:async\s+)?(get|set)\s+(\w+)\s*\([^)]*\))/g,
    /((?:async\s+)?(\w+)\s*\([^)]*\)\s*)\{/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const rawName = match[3] || match[2];
      if (!rawName || /^(if|for|while|switch|catch|function)$/.test(rawName)) continue;
      const signature = compactSignature(match[1]);
      if (methods.some((method) => method.name === rawName && method.signature === signature)) continue;
      const body = getBlockAfterSignature(content, match.index, match[0]);
      methods.push({
        name: rawName,
        kind: match[2] === "get" || match[2] === "set" || isAccessorName(rawName) ? "accessor" : "function",
        signature,
        returnCodes: extractReturnCodes(body, ".js"),
        exceptions: extractThrownExceptions(body, ".js"),
      });
    }
  }

  return methods;
}

function extractCodeInfo(rawContent, ext) {
  const content = stripComments(rawContent, ext);
  if (ext === ".java") return extractJavaMethods(content);
  if (ext === ".cs") return extractCsharpMethods(content);
  if (ext === ".py") return extractPythonMethods(content);
  if (JS_EXTENSIONS.includes(ext)) return extractJsMethods(content);
  return [];
}

function appendMethodDocumentation(lines, methods, options, packageName) {
  if (options.includePackage && packageName) {
    lines.push("## Package", "", packageName, "");
  }

  const visibleMethods = methods.filter((method) => (
    method.isSourceEntity ||
    options.includeMethods ||
    (options.includeAccessors && method.kind === "accessor")
  ));
  if (visibleMethods.length === 0) return;

  lines.push("## Code Members", "");
  for (const method of visibleMethods) {
    lines.push(`### ${method.heading || method.name}`, "");
    if (options.includeAccessors) lines.push(`Type: ${method.kind}`, "");
    if (options.includeSignatures && method.signature) lines.push("Signature:", "", "```text", method.signature, "```", "");
    if (options.includeComments && method.documentation) appendDocumentationBlock(lines, method.documentation);
    if (options.includeReturnCodes) {
      lines.push("Return codes:", "");
      if (method.returnCodes.length === 0) lines.push("- None detected");
      else method.returnCodes.forEach((returnCode) => lines.push(`- ${returnCode}`));
      lines.push("");
    }
    if (options.includeExceptions) {
      lines.push("Exceptions:", "");
      if (method.exceptions.length === 0) lines.push("- None detected");
      else method.exceptions.forEach((exceptionName) => lines.push(`- ${exceptionName}`));
      lines.push("");
    }
  }
}

function writeMarkdown(sourceRoot, destinationRoot, sourceRootHome, sourceFile, dependencies, unresolvedDependencies, options) {
  const relativeSource = path.relative(sourceRoot, sourceFile);
  const parsed = path.parse(relativeSource);
  const outputDir = path.join(destinationRoot, parsed.dir);
  const outputFile = getMarkdownOutputFile(sourceRoot, destinationRoot, sourceFile);
  const rawContent = fs.readFileSync(sourceFile, "utf8");
  const ext = path.extname(sourceFile);
  const entity = getEntityInfo(rawContent, ext, sourceRoot, sourceFile);
  const language = unresolvedApi.languageForExtension(ext);
  const documentationInfo = options.includeComments
    ? extractDocumentationInfo(rawContent, ext)
    : { sourceDocumentation: "", memberDocumentation: [] };
  const sourceDocumentationMember = options.includeComments
    ? getSourceDocumentationMember(entity, documentationInfo)
    : null;
  const methods = extractCodeInfo(rawContent, ext).map((method) => ({
    ...method,
    documentation: options.includeComments
      ? findDocumentationForMethod(method, documentationInfo.memberDocumentation)
      : "",
  }));
  const codeMembers = sourceDocumentationMember ? [sourceDocumentationMember, ...methods] : methods;

  fs.mkdirSync(outputDir, { recursive: true });

  const lines = [
    "---",
    `entity_type: ${yamlScalar(entity.entityType)}`,
    `entity_id: ${yamlScalar(entity.entityId)}`,
    `language: ${yamlScalar(language)}`,
    "conversion_status: not_started",
    "shared: false",
    `source_file: ${yamlScalar(getPortableSourcePath(sourceRootHome, sourceFile))}`,
    `source_hash: ${sha256File(sourceFile)}`,
    "---",
    "",
    `# ${toMarkdownPath(relativeSource)}`,
    "",
    `Source: \`${getPortableSourcePath(sourceRootHome, sourceFile)}\``,
    "",
    "## Dependencies",
    "",
  ];

  const sortedDependencies = [...dependencies].sort((a, b) => a.localeCompare(b));
  if (sortedDependencies.length === 0) {
    lines.push("No local code dependencies found.");
  } else {
    for (const dependency of sortedDependencies) {
      const relativeDependency = toMarkdownPath(path.relative(sourceRoot, dependency));
      const dependencyOutputFile = getMarkdownOutputFile(sourceRoot, destinationRoot, dependency);
      lines.push(`- ${markdownLink(outputFile, dependencyOutputFile, path.basename(dependency))} (${relativeDependency})`);
    }
  }

  if (unresolvedDependencies.length > 0) {
    lines.push("", "## Unresolved Dependencies", "");
    unresolvedDependencies
      .slice()
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.line - b.line)
      .forEach((dependency) => {
        const details = [
          `missing ${dependency.kind.replace("-", " ")}`,
          `language ${dependency.language || language}`,
          dependency.wildcard ? "wildcard" : "",
          dependency.staticImport ? "static" : "",
          dependency.line > 0 ? `line ${dependency.line}` : ""
        ].filter(Boolean).join(", ");
        lines.push(`- \`${dependency.symbol}\` (${details})`);
      });
  }

  lines.push("");
  appendMethodDocumentation(lines, codeMembers, options, entity.packageName);
  fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
}

function getSourceExternalDependencies(file, content, externalIndex) {
  const ext = path.extname(file).toLowerCase();
  const language = unresolvedApi.languageForExtension(ext);
  const candidates = externalIndex?.byLanguage?.get(language === "typescript" ? "javascript" : language) || [];
  if (!candidates.length) return [];

  if (JS_EXTENSIONS.includes(ext)) {
    const names = new Set(unresolvedApi.collectJsPackageImports(content).map((entry) => entry.name));
    return candidates.filter((dependency) => names.has(dependency.name));
  }

  if (CSHARP_EXTENSIONS.includes(ext)) {
    const usings = Array.from(content.matchAll(/^\s*using\s+(?:(\w+)\s*=\s*)?([\w.]+)\s*;/gm)).map((match) => match[2]);
    return candidates.filter((dependency) => usings.some((usingName) => (
      usingName === dependency.name
      || usingName.startsWith(`${dependency.name}.`)
      || String(dependency.name || "").startsWith(`${usingName}.`)
    )));
  }

  if (PY_EXTENSIONS.includes(ext)) {
    const imports = new Set();
    for (const match of content.matchAll(/^\s*import\s+(.+)$/gm)) {
      match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0].split(".")[0]).forEach((name) => imports.add(name));
    }
    for (const match of content.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/gm)) {
      if (!match[1].startsWith(".")) imports.add(match[1].split(".")[0]);
    }
    return candidates.filter((dependency) => imports.has(String(dependency.name || "").split(/[._-]/)[0]));
  }

  return [];
}

function main() {
  const { sourceArg, destinationArg, options } = parseArgs(process.argv.slice(2));
  if (!sourceArg || !destinationArg) {
    usage();
    process.exit(1);
  }

  const sourceRoot = normalizePath(sourceArg);
  const destinationRoot = normalizePath(destinationArg);
  const sourceRootHome = normalizePath(options.sourceRootHome || sourceRoot);

  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    console.error(`Source root is not a directory: ${sourceRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(destinationRoot, { recursive: true });
  writeProjectMetadata(destinationRoot, sourceRootHome);
  const startedAt = new Date().toISOString();
  const warnings = [];

  logProgress("Starting built-in code conversion");
  logProgress(`Scanning source files in ${sourceRoot}`);
  const files = walkSourceFiles(sourceRoot);
  logProgress(`Found ${files.length} supported source file(s).`);

  logProgress("Discovering external dependencies...");
  const externalDependencies = discoverExternalDependencies(sourceRoot, destinationRoot, sourceRootHome, warnings);
  const externalIndex = createExternalDependencyIndex(externalDependencies);
  logProgress("Building dependency indexes...");
  const indexes = buildIndexes(sourceRoot, files);
  logProgress("Analyzing dependencies and writing Markdown files...");
  const sources = [];

  files.forEach((file, index) => {
    const dependencies = findDependencies(file, sourceRoot, indexes);
    dependencies.delete(file);
    const ext = path.extname(file).toLowerCase();
    const content = fs.readFileSync(file, "utf8");
    const unresolvedDependencies = unresolvedApi.findUnresolvedDependencies(file, content, indexes, externalIndex);
    const entity = getEntityInfo(content, ext, sourceRoot, file);
    const sourceExternalDependencies = getSourceExternalDependencies(file, content, externalIndex);
    writeMarkdown(sourceRoot, destinationRoot, sourceRootHome, file, dependencies, unresolvedDependencies, options);
    sources.push({
      sourceFile: getPortableSourcePath(sourceRootHome, file),
      sourceFileAbsolute: file,
      markdownFile: getMarkdownOutputFile(sourceRoot, destinationRoot, file),
      language: unresolvedApi.languageForExtension(ext),
      entityType: entity.entityType,
      entityId: entity.entityId,
      localDependencies: [...dependencies].sort(),
      unresolvedDependencies,
      externalDependencies: sourceExternalDependencies.map((dependency) => ({
        id: dependency.id,
        kind: dependency.kind,
        language: dependency.language,
        name: dependency.name,
        version: dependency.version,
        path: dependency.path,
        source: dependency.source,
        markdownFile: dependency.markdownFile,
        metadata: dependency.metadata,
      })),
    });
    const writtenCount = index + 1;
    if (shouldLogProgress(writtenCount, files.length, 500)) {
      logProgress(`Analyzed and wrote ${writtenCount} / ${files.length} source files...`);
    }
  });
  const finishedAt = new Date().toISOString();
  const report = createReport({
    sourceRoot,
    sourceRootHome,
    destinationRoot,
    files,
    startedAt,
    finishedAt,
    sources,
    externalDependencies,
    warnings,
  });
  writeMissingDependenciesReport(destinationRoot, report);

  logProgress("Built-in code converter summary");
  logProgress(`Markdown files written: ${files.length}`);
  logProgress(`Discovered external dependencies: ${externalDependencies.length}`);
  console.log(`Created ${files.length} markdown file(s) in ${destinationRoot}`);
}

main();
