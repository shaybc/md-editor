#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".java",
]);

const JS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const PY_EXTENSIONS = [".py"];
const JAVA_EXTENSIONS = [".java"];

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "out",
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
  ].join("\n"));
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
  };
  const positional = [];

  for (const arg of argv) {
    if (arg === "--include-methods") options.includeMethods = true;
    else if (arg === "--include-accessors") options.includeAccessors = true;
    else if (arg === "--include-signatures") options.includeSignatures = true;
    else if (arg === "--include-return-codes") options.includeReturnCodes = true;
    else if (arg === "--include-exceptions") options.includeExceptions = true;
    else if (arg === "--include-package") options.includePackage = true;
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

function buildIndexes(sourceRoot, files) {
  const byPathNoExt = new Map();
  const javaByQualifiedName = new Map();
  const javaBySimpleName = new Map();
  const pythonModules = new Map();

  for (const file of files) {
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
  }

  return { byPathNoExt, javaByQualifiedName, javaBySimpleName, pythonModules };
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

  return new Set();
}

function markdownLink(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile) || path.basename(toFile);
  const href = encodeURI(toMarkdownPath(rel));
  return `[${toMarkdownPath(toFile)}](${href})`;
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

function isAccessorName(name) {
  return /^(get|set)[A-Z_]/.test(name) || /^(__get|__set)/.test(name);
}

function extractJavaMethods(content) {
  const methods = [];
  const pattern = /((?:public|protected|private|static|final|abstract|synchronized|native|strictfp|\s)+[\w<>\[\], ?.&]+\s+(\w+)\s*\([^;{}]*\)\s*(?:throws\s+[\w.,\s]+)?\s*)\{/g;

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
  if (ext === ".py") return extractPythonMethods(content);
  if (JS_EXTENSIONS.includes(ext)) return extractJsMethods(content);
  return [];
}

function appendMethodDocumentation(lines, methods, options, packageName) {
  if (options.includePackage && packageName) {
    lines.push("## Package", "", packageName, "");
  }

  const visibleMethods = methods.filter((method) => options.includeMethods || (options.includeAccessors && method.kind === "accessor"));
  if (visibleMethods.length === 0) return;

  lines.push("## Code Members", "");
  for (const method of visibleMethods) {
    lines.push(`### ${method.name}`, "");
    if (options.includeAccessors) lines.push(`Type: ${method.kind}`, "");
    if (options.includeSignatures) lines.push("Signature:", "", "```text", method.signature, "```", "");
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

function writeMarkdown(sourceRoot, destinationRoot, sourceFile, dependencies, options) {
  const relativeSource = path.relative(sourceRoot, sourceFile);
  const parsed = path.parse(relativeSource);
  const outputDir = path.join(destinationRoot, parsed.dir);
  const outputFile = path.join(outputDir, `${parsed.base}.md`);
  const rawContent = fs.readFileSync(sourceFile, "utf8");
  const ext = path.extname(sourceFile);
  const entity = getEntityInfo(rawContent, ext, sourceRoot, sourceFile);
  const methods = extractCodeInfo(rawContent, ext);

  fs.mkdirSync(outputDir, { recursive: true });

  const lines = [
    "---",
    `entity_type: ${yamlScalar(entity.entityType)}`,
    `entity_id: ${yamlScalar(entity.entityId)}`,
    "conversion_status: not_started",
    "shared: false",
    `source_file: ${yamlScalar(sourceFile)}`,
    `source_hash: ${sha256File(sourceFile)}`,
    "---",
    "",
    `# ${toMarkdownPath(relativeSource)}`,
    "",
    `Source: ${markdownLink(outputFile, sourceFile)}`,
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
      lines.push(`- ${markdownLink(outputFile, dependency)} (${relativeDependency})`);
    }
  }

  lines.push("");
  appendMethodDocumentation(lines, methods, options, entity.packageName);
  fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
}

function main() {
  const { sourceArg, destinationArg, options } = parseArgs(process.argv.slice(2));
  if (!sourceArg || !destinationArg) {
    usage();
    process.exit(1);
  }

  const sourceRoot = normalizePath(sourceArg);
  const destinationRoot = normalizePath(destinationArg);

  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    console.error(`Source root is not a directory: ${sourceRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(destinationRoot, { recursive: true });

  const files = walkSourceFiles(sourceRoot);
  const indexes = buildIndexes(sourceRoot, files);

  for (const file of files) {
    const dependencies = findDependencies(file, sourceRoot, indexes);
    dependencies.delete(file);
    writeMarkdown(sourceRoot, destinationRoot, file, dependencies, options);
  }

  console.log(`Created ${files.length} markdown file(s) in ${destinationRoot}`);
}

main();
