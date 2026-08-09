/** Language-specific extraction of declarations and reference-like identifiers. */

"use strict";

const path = require("node:path");

let typescript;
try { typescript = require("typescript"); } catch (_error) { typescript = null; }

/** Extract structural symbols from one supported source file. */
function extractSourceStructure(filePath, content) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"].includes(extension) && typescript) return extractTypeScript(filePath, content, extension);
  if (extension === ".py") return extractWithPatterns(content, PYTHON_DECLARATIONS);
  if (extension === ".java") return extractWithPatterns(content, JAVA_DECLARATIONS);
  if ([".kt", ".kts"].includes(extension)) return extractWithPatterns(content, KOTLIN_DECLARATIONS);
  return null;
}

function extractTypeScript(filePath, content, extension) {
  const kind = [".ts", ".tsx"].includes(extension) ? typescript.ScriptKind.TS : typescript.ScriptKind.JS;
  const source = typescript.createSourceFile(filePath, content, typescript.ScriptTarget.Latest, false, kind);
  const definitions = [];
  const references = [];
  const visit = (node) => {
    if (isDeclaration(node)) {
      const name = declarationName(node);
      if (name) definitions.push({ name, signature: declarationSignature(node, source), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if (typescript.isIdentifier(node)) references.push(node.text);
    typescript.forEachChild(node, visit);
  };
  visit(source);
  return compact(definitions, references);
}

function isDeclaration(node) {
  return typescript.isFunctionDeclaration(node) || typescript.isClassDeclaration(node) || typescript.isInterfaceDeclaration(node)
    || typescript.isTypeAliasDeclaration(node) || typescript.isEnumDeclaration(node) || typescript.isMethodDeclaration(node);
}

function declarationName(node) { return node.name && typeof node.name.text === "string" ? node.name.text : ""; }
function declarationSignature(node, source) { return node.getText(source).split("{")[0].replace(/\s+/g, " ").trim().slice(0, 400); }

function extractWithPatterns(content, patterns) {
  const lines = String(content || "").split(/\r?\n/);
  const definitions = [];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) { definitions.push({ name: match[1], signature: line.trim().slice(0, 400), line: index + 1 }); break; }
    }
  });
  const references = String(content || "").match(/[A-Za-z_$][\w$]{2,}/g) || [];
  return compact(definitions, references);
}

function compact(definitions, references) {
  const defined = new Set(definitions.map((entry) => entry.name));
  return {
    definitions: definitions.slice(0, 500),
    references: Array.from(new Set(references.filter((name) => !defined.has(name) && !COMMON_WORDS.has(name)))).slice(0, 3000)
  };
}

const PYTHON_DECLARATIONS = [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, /^\s*class\s+([A-Za-z_]\w*)\b/];
const JAVA_DECLARATIONS = [/^\s*(?:public|protected|private|static|final|abstract|sealed|non-sealed|\s)*\s*(?:class|interface|enum|record)\s+([A-Za-z_$]\w*)\b/, /^\s*(?:public|protected|private|static|final|abstract|synchronized|native|\s)+[\w<>\[\],.?]+\s+([A-Za-z_$]\w*)\s*\(/];
const KOTLIN_DECLARATIONS = [/^\s*(?:public|private|protected|internal|open|abstract|sealed|data|enum|annotation|value|\s)*\s*(?:class|interface|object)\s+([A-Za-z_]\w*)\b/, /^\s*(?:public|private|protected|internal|suspend|inline|operator|override|\s)*fun\s+([A-Za-z_]\w*)\s*\(/, /^\s*(?:public|private|protected|internal|const|lateinit|\s)*(?:val|var)\s+([A-Za-z_]\w*)\b/];
const COMMON_WORDS = new Set(["const", "function", "return", "class", "this", "that", "with", "from", "import", "export", "public", "private", "protected", "static", "final", "true", "false", "null", "undefined", "string", "number", "boolean"]);

module.exports = { extractSourceStructure };
