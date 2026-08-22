import { EditorView } from "codemirror";
import { EditorState, Compartment, EditorSelection, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, GutterMarker, WidgetType, crosshairCursor, drawSelection, dropCursor, gutter, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, keymap, lineNumbers, rectangularSelection, showTooltip, tooltips, ViewPlugin } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, indentSelection, indentWithTab, isolateHistory, redo, selectAll, toggleComment, undo } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completeFromList, completionKeymap, insertCompletionText, snippet, snippetCompletion, startCompletion } from "@codemirror/autocomplete";
import { bracketMatching, ensureSyntaxTree, foldEffect, foldable, foldedRanges, foldGutter, foldKeymap, foldService, HighlightStyle, highlightingFor, indentOnInput, language, syntaxHighlighting, syntaxTree, StreamLanguage, unfoldEffect } from "@codemirror/language";
import { forEachDiagnostic, lintGutter, linter, lintKeymap } from "@codemirror/lint";
import { LSPClient, LSPPlugin, serverDiagnostics } from "@codemirror/lsp-client";
import { searchKeymap } from "@codemirror/search";
import { MergeView, getChunks, goToNextChunk, goToPreviousChunk, rejectChunk, unifiedMergeView } from "@codemirror/merge";
import { highlightCode, tags } from "@lezer/highlight";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript, localCompletionSource, scopeCompletionSource } from "@codemirror/lang-javascript";
import { html, htmlCompletionSource } from "@codemirror/lang-html";
import { css, cssCompletionSource } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { keywordCompletionSource, sql, StandardSQL } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { php } from "@codemirror/lang-php";
import { rust } from "@codemirror/lang-rust";
import { sass } from "@codemirror/lang-sass";
import { c, csharp, dart, kotlin, objectiveC, objectiveCpp, scala } from "@codemirror/legacy-modes/mode/clike";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { go } from "@codemirror/legacy-modes/mode/go";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import * as prettier from "prettier/standalone";
import prettierBabel from "prettier/plugins/babel";
import prettierEstree from "prettier/plugins/estree";
import prettierHtml from "prettier/plugins/html";
import prettierMarkdown from "prettier/plugins/markdown";
import prettierPostcss from "prettier/plugins/postcss";
import prettierTypescript from "prettier/plugins/typescript";
import prettierYaml from "prettier/plugins/yaml";
import prettierXml from "@prettier/plugin-xml";

function stream(parser) {
  return StreamLanguage.define(parser);
}

const batchMode = {
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/\s*@?rem\b.*/i) || stream.match(/\s*::.*/)) return "comment";
      if (stream.match(/\s*:[A-Za-z0-9_.$?@#-]+/)) return "labelName";
      if (stream.match(/\s*@?echo\s+off\b/i)) return "keyword";
    }
    if (stream.match(/\b(?:assoc|call|cd|chcp|choice|cls|color|copy|del|dir|echo|endlocal|erase|exit|for|goto|if|md|mkdir|move|path|pause|popd|prompt|pushd|rd|ren|rename|rmdir|set|setlocal|shift|start|title|type|where)\b/i)) return "keyword";
    if (stream.match(/%%?[A-Za-z0-9_]/)) return "variableName";
    if (stream.match(/%~[a-zA-Z$pnxsfatz0-9]+/)) return "variableName special";
    if (stream.match(/%[A-Za-z_][A-Za-z0-9_]*%/)) return "variableName";
    if (stream.match(/![A-Za-z_][A-Za-z0-9_]*!/)) return "variableName";
    if (stream.match(/"(?:[^"]|"")*"?/)) return "string";
    if (stream.match(/[()]/)) return "bracket";
    stream.next();
    return null;
  }
};

const registryMode = {
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/\s*;.*/)) return "comment";
      if (stream.match(/\s*Windows Registry Editor Version 5\.00\s*$/i)) return "meta";
      if (stream.match(/\s*REGEDIT4\s*$/i)) return "meta";
      if (stream.match(/\s*\[-?(?:HKEY_CLASSES_ROOT|HKEY_CURRENT_USER|HKEY_LOCAL_MACHINE|HKEY_USERS|HKEY_CURRENT_CONFIG|HKCR|HKCU|HKLM|HKU|HKCC)\\[^\]]*\]/i)) return "heading";
    }
    if (stream.match(/"(?:[^"]|"")*"(?=\s*=)/)) return "propertyName";
    if (stream.match(/@(?=\s*=)/)) return "propertyName special";
    if (stream.match(/=\s*(?:hex(?:\([0-9a-f]+\))?|dword|qword|hex\(7\)|hex\(2\)):/i)) return "typeName";
    if (stream.match(/"(?:[^"]|"")*"/)) return "string";
    if (stream.match(/\b[0-9a-f]{2}\b/i)) return "number";
    if (stream.match(/[\\,]/)) return "punctuation";
    stream.next();
    return null;
  }
};

function getLanguageExtension(languageId) {
  switch (languageId) {
    case "markdown":
      return markdown({ base: markdownLanguage, codeLanguages: [] });
    case "javascript":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ jsx: true, typescript: true });
    case "html":
      return html({ autoCloseTags: true, matchClosingTags: true });
    case "css":
      return css();
    case "sass":
      return sass({ indented: true });
    case "json":
      return json();
    case "xml":
      return xml({ autoCloseTags: true });
    case "python":
      return python();
    case "java":
      return java();
    case "c":
      return stream(c);
    case "cpp":
      return cpp();
    case "csharp":
      return stream(csharp);
    case "kotlin":
      return stream(kotlin);
    case "sql":
      return sql();
    case "yaml":
      return yaml();
    case "php":
      return php();
    case "rust":
      return rust();
    case "swift":
      return stream(swift);
    case "powershell":
      return stream(powerShell);
    case "batch":
      return stream(batchMode);
    case "registry":
      return stream(registryMode);
    case "shell":
      return stream(shell);
    case "groovy":
      return stream(groovy);
    case "objectivec":
      return stream(objectiveC);
    case "objectivecpp":
      return stream(objectiveCpp);
    case "perl":
      return stream(perl);
    case "scala":
      return stream(scala);
    case "ruby":
      return stream(ruby);
    case "go":
      return stream(go);
    case "dart":
      return stream(dart);
    case "properties":
      return stream(properties);
    case "toml":
      return stream(toml);
    case "dockerfile":
      return stream(dockerFile);
    default:
      return [];
  }
}

const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--editor-syntax-heading)", fontWeight: "700" },
  { tag: tags.heading1, color: "var(--editor-syntax-heading)", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--editor-syntax-heading)", fontWeight: "700" },
  { tag: tags.heading3, color: "var(--editor-syntax-heading)", fontWeight: "700" },
  { tag: tags.keyword, color: "var(--editor-syntax-keyword)", fontWeight: "600" },
  { tag: tags.controlKeyword, color: "var(--editor-syntax-keyword)", fontWeight: "600" },
  { tag: tags.operatorKeyword, color: "var(--editor-syntax-keyword)", fontWeight: "600" },
  { tag: tags.moduleKeyword, color: "var(--editor-syntax-keyword)", fontWeight: "600" },
  { tag: tags.modifier, color: "var(--editor-syntax-keyword)" },
  { tag: tags.atom, color: "var(--editor-syntax-atom)" },
  { tag: tags.bool, color: "var(--editor-syntax-atom)" },
  { tag: tags.number, color: "var(--editor-syntax-number)" },
  { tag: tags.string, color: "var(--editor-syntax-string)" },
  { tag: tags.special(tags.string), color: "var(--editor-syntax-code)" },
  { tag: tags.regexp, color: "var(--editor-syntax-code)" },
  { tag: tags.escape, color: "var(--editor-syntax-code)" },
  { tag: tags.comment, color: "var(--editor-syntax-comment)", fontStyle: "italic" },
  { tag: tags.docComment, color: "var(--editor-syntax-comment)", fontStyle: "italic" },
  { tag: tags.typeName, color: "var(--editor-syntax-type)" },
  { tag: tags.className, color: "var(--editor-syntax-type)" },
  { tag: tags.namespace, color: "var(--editor-syntax-type)" },
  { tag: tags.definition(tags.variableName), color: "var(--editor-syntax-variable)" },
  { tag: tags.variableName, color: "var(--editor-syntax-variable)" },
  { tag: tags.local(tags.variableName), color: "var(--editor-syntax-variable)" },
  { tag: tags.self, color: "var(--editor-syntax-variable)" },
  { tag: tags.definition(tags.function(tags.variableName)), color: "var(--editor-syntax-function)", fontWeight: "600" },
  { tag: tags.function(tags.variableName), color: "var(--editor-syntax-function)" },
  { tag: tags.propertyName, color: "var(--editor-syntax-property)" },
  { tag: tags.attributeName, color: "var(--editor-syntax-attribute)" },
  { tag: tags.attributeValue, color: "var(--editor-syntax-string)" },
  { tag: tags.tagName, color: "var(--editor-syntax-tag)" },
  { tag: tags.angleBracket, color: "var(--editor-syntax-bracket)" },
  { tag: tags.bracket, color: "var(--editor-syntax-bracket)" },
  { tag: tags.squareBracket, color: "var(--editor-syntax-bracket)" },
  { tag: tags.paren, color: "var(--editor-syntax-bracket)" },
  { tag: tags.brace, color: "var(--editor-syntax-bracket)" },
  { tag: tags.operator, color: "var(--editor-syntax-operator)" },
  { tag: tags.arithmeticOperator, color: "var(--editor-syntax-operator)" },
  { tag: tags.logicOperator, color: "var(--editor-syntax-operator)" },
  { tag: tags.compareOperator, color: "var(--editor-syntax-operator)" },
  { tag: tags.definitionOperator, color: "var(--editor-syntax-operator)" },
  { tag: tags.processingInstruction, color: "var(--editor-syntax-muted)" },
  { tag: tags.punctuation, color: "var(--editor-syntax-muted)" },
  { tag: tags.strong, color: "var(--editor-syntax-strong)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--editor-syntax-emphasis)", fontStyle: "italic" },
  { tag: tags.monospace, color: "var(--editor-syntax-code)" },
  { tag: tags.link, color: "var(--editor-syntax-link)" },
  { tag: tags.url, color: "var(--editor-syntax-url)", textDecoration: "underline" },
  { tag: tags.quote, color: "var(--editor-syntax-quote)" },
  { tag: tags.list, color: "var(--editor-syntax-list)" },
  { tag: tags.contentSeparator, color: "var(--editor-syntax-table)" },
  { tag: tags.invalid, color: "var(--editor-syntax-invalid)" }
]);

const indentGuideSize = 2;

function getLineIndentDepth(text) {
  const leadingWhitespace = text.match(/^[\t ]+/)?.[0] || "";
  if (!leadingWhitespace) return 0;

  let column = 0;
  for (let index = 0; index < leadingWhitespace.length; index += 1) {
    column += leadingWhitespace[index] === "\t" ? indentGuideSize : 1;
  }

  return Math.floor(column / indentGuideSize);
}

function getActiveIndentBlock(view) {
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);
  const activeDepth = getLineIndentDepth(cursorLine.text);
  if (activeDepth <= 0) return null;

  let startLine = cursorLine.number;
  let endLine = cursorLine.number;

  for (let lineNumber = cursorLine.number - 1; lineNumber >= 1; lineNumber -= 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.trim() && getLineIndentDepth(line.text) < activeDepth) break;
    startLine = lineNumber;
  }

  for (let lineNumber = cursorLine.number + 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.trim() && getLineIndentDepth(line.text) < activeDepth) break;
    endLine = lineNumber;
  }

  return { depth: activeDepth, startLine, endLine };
}

function getIndentGuideDecorations(view) {
  const builder = new RangeSetBuilder();
  const activeBlock = getActiveIndentBlock(view);

  for (const visibleRange of view.visibleRanges) {
    let line = view.state.doc.lineAt(visibleRange.from);
    while (line.from <= visibleRange.to) {
      const levelCount = getLineIndentDepth(line.text);
      if (levelCount > 0) {
        const isActiveBlockLine = activeBlock
          && activeBlock.depth <= levelCount
          && line.number >= activeBlock.startLine
          && line.number <= activeBlock.endLine;
        const activeStyle = isActiveBlockLine
          ? ` --cm-active-indent-left: ${(activeBlock.depth - 1) * indentGuideSize}ch;`
          : "";
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: `cm-indent-guide-line${isActiveBlockLine ? " cm-indent-guide-active-block" : ""}`,
            attributes: { style: `--cm-indent-depth: ${levelCount};${activeStyle}` }
          })
        );
      }

      if (line.to >= visibleRange.to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  return builder.finish();
}

const indentGuideExtension = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = getIndentGuideDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = getIndentGuideDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations
});

const defaultShowSymbolOptions = {
  spaceTab: false,
  endOfLine: false,
  nonPrinting: false,
  controlCharactersUnicodeEol: false,
  allCharacters: false,
  indentGuide: true,
  wrapSymbol: true
};

function normalizeShowSymbolOptions(options = {}) {
  return Object.assign({}, defaultShowSymbolOptions, options || {});
}

class VisibleSymbolWidget extends WidgetType {
  constructor(text, className) {
    super();
    this.text = text;
    this.className = className;
  }

  eq(other) {
    return other.text === this.text && other.className === this.className;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = `cm-visible-symbol ${this.className || ""}`.trim();
    element.setAttribute("aria-hidden", "true");
    element.textContent = this.text;
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

function getControlCharacterLabel(char) {
  const code = char.charCodeAt(0);
  if (code <= 0x1f) return `^${String.fromCharCode(code + 64)}`;
  if (code === 0x7f) return "^?";
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isControlOrInvisibleCharacter(char) {
  const code = char.charCodeAt(0);
  return (
    code < 0x20
    || code === 0x7f
    || (code >= 0x80 && code <= 0x9f)
    || code === 0x00a0
    || code === 0x1680
    || code === 0x180e
    || (code >= 0x2000 && code <= 0x200f)
    || code === 0x2028
    || code === 0x2029
    || code === 0x202f
    || code === 0x205f
    || code === 0x2060
    || code === 0x3000
    || code === 0xfeff
  );
}

function getVisibleSymbolDecorations(view, options) {
  const settings = normalizeShowSymbolOptions(options);
  const showSpaceTab = settings.allCharacters || settings.spaceTab;
  const showEndOfLine = settings.allCharacters || settings.endOfLine || settings.controlCharactersUnicodeEol;
  const showControl = settings.allCharacters || settings.nonPrinting || settings.controlCharactersUnicodeEol;
  const builder = new RangeSetBuilder();

  for (const visibleRange of view.visibleRanges) {
    let line = view.state.doc.lineAt(visibleRange.from);
    while (line.from <= visibleRange.to) {
      const text = line.text;
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const position = line.from + index;
        if (showSpaceTab && char === " ") {
          builder.add(position, position + 1, Decoration.replace({
            widget: new VisibleSymbolWidget("·", "cm-visible-space")
          }));
        } else if (showSpaceTab && char === "\t") {
          builder.add(position, position + 1, Decoration.replace({
            widget: new VisibleSymbolWidget("→", "cm-visible-tab")
          }));
        } else if (showControl && isControlOrInvisibleCharacter(char)) {
          builder.add(position, position + 1, Decoration.replace({
            widget: new VisibleSymbolWidget(getControlCharacterLabel(char), "cm-visible-control")
          }));
        }
      }

      if (showEndOfLine) {
        builder.add(line.to, line.to, Decoration.widget({
          widget: new VisibleSymbolWidget("¶", "cm-visible-eol"),
          side: 1
        }));
      }

      if (line.to >= visibleRange.to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  return builder.finish();
}

function createShowSymbolsExtension(options = {}) {
  const settings = normalizeShowSymbolOptions(options);
  const hasVisibleMarkers = settings.allCharacters
    || settings.spaceTab
    || settings.endOfLine
    || settings.nonPrinting
    || settings.controlCharactersUnicodeEol;
  if (!hasVisibleMarkers) return [];

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = getVisibleSymbolDecorations(view, settings);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getVisibleSymbolDecorations(update.view, settings);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

/**
 * AI Companion inline autocomplete ghost text. Renders as real CodeMirror decorations
 * (not a floating DOM overlay positioned by pixel math) so multiline suggestions actually
 * push the document's real lines down and reserve their own space, instead of floating on
 * top of and overlapping whatever content already occupies those rows. The first suggested
 * line renders as an inline widget right at the cursor (continuing that row, same as a
 * single-line suggestion always has); any further lines render as a block widget anchored
 * to the end of the cursor's line, which CodeMirror lays out as genuine new rows below it.
 */
class AiGhostInlineWidget extends WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }

  eq(other) {
    return other.text === this.text;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-aiGhostInline";
    element.setAttribute("aria-hidden", "true");
    element.textContent = this.text;
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

class AiGhostBlockWidget extends WidgetType {
  constructor(lines) {
    super();
    this.lines = lines;
  }

  eq(other) {
    return Array.isArray(other.lines)
      && other.lines.length === this.lines.length
      && other.lines.every((line, index) => line === this.lines[index]);
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-aiGhostBlock";
    container.setAttribute("aria-hidden", "true");
    this.lines.forEach((lineText) => {
      const lineElement = document.createElement("div");
      lineElement.className = "cm-aiGhostBlockLine";
      // A literal empty string collapses to zero height in a block-level div; a blank
      // suggested line should still reserve a full row like every other line does.
      lineElement.textContent = lineText.length ? lineText : " ";
      container.appendChild(lineElement);
    });
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

const setAiGhostSuggestionEffect = StateEffect.define();
const clearAiGhostSuggestionEffect = StateEffect.define();

function buildAiGhostDecorations(doc, suggestion) {
  if (!suggestion || typeof suggestion.position !== "number" || !suggestion.completion) return Decoration.none;
  const position = Math.max(0, Math.min(suggestion.position, doc.length));
  const lines = String(suggestion.completion).split("\n");
  const builder = new RangeSetBuilder();
  builder.add(position, position, Decoration.widget({ widget: new AiGhostInlineWidget(lines[0] || ""), side: 1 }));
  if (lines.length > 1) {
    const line = doc.lineAt(position);
    builder.add(line.to, line.to, Decoration.widget({
      widget: new AiGhostBlockWidget(lines.slice(1)),
      side: 1,
      block: true
    }));
  }
  return builder.finish();
}

const aiGhostSuggestionField = StateField.define({
  create() {
    return { decorations: Decoration.none, suggestion: null };
  },
  update(value, transaction) {
    let nextSuggestion = value.suggestion;
    let changed = false;
    for (const effect of transaction.effects) {
      if (effect.is(setAiGhostSuggestionEffect)) {
        nextSuggestion = effect.value;
        changed = true;
      } else if (effect.is(clearAiGhostSuggestionEffect)) {
        nextSuggestion = null;
        changed = true;
      }
    }
    if (!changed && transaction.docChanged && nextSuggestion) {
      // The document changed for some other reason (typing, an accepted edit, undo, etc.)
      // without an explicit set/clear effect riding along — the suggestion's anchor
      // position can no longer be trusted, so drop it rather than risk rendering ghost
      // text at a stale or misleading position.
      nextSuggestion = null;
      changed = true;
    }
    if (!changed) return value;
    return { decorations: buildAiGhostDecorations(transaction.state.doc, nextSuggestion), suggestion: nextSuggestion };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

const aiGhostSuggestionTheme = EditorView.theme({
  ".cm-aiGhostInline": {
    color: "color-mix(in srgb, var(--text-color, #24292e) 46%, transparent)",
    pointerEvents: "none",
    userSelect: "none"
  },
  ".cm-aiGhostBlock": {
    color: "color-mix(in srgb, var(--text-color, #24292e) 46%, transparent)",
    pointerEvents: "none",
    userSelect: "none"
  },
  ".cm-aiGhostBlockLine": {
    whiteSpace: "pre"
  }
});

const aiGhostSuggestionExtension = [aiGhostSuggestionField, aiGhostSuggestionTheme];

/**
 * Unclosed-bracket highlighting: scan the document for `(`/`[`/`{` openers that never got a
 * matching closer and mark them with a yellow background, so a syntax error introduced by a
 * paste, an accepted AI suggestion, or ordinary editing is visible immediately instead of
 * waiting on a language server diagnostic (if one is even configured). Deliberately shallow
 * — a single-pass character scan that tracks quotes (with backslash-escape handling) and a
 * best-effort per-language comment token, not a real parser — consistent with how the rest
 * of this app's lightweight heuristics work. It only flags *unmatched openers*; a stray extra
 * closer is a different kind of mistake (deleting the user's own text, not adding to it) and
 * isn't handled here.
 */
const BRACKET_CLOSER_FOR_OPENER = { "(": ")", "[": "]", "{": "}" };
const BRACKET_OPENER_FOR_CLOSER = { ")": "(", "]": "[", "}": "{" };
const HASH_COMMENT_LANGUAGE_IDS = new Set(["python", "yaml", "shell", "bash", "dockerfile", "properties", "toml", "ruby", "perl"]);

function getLineCommentTokenForLanguage(languageId) {
  return HASH_COMMENT_LANGUAGE_IDS.has(languageId) ? "#" : "//";
}

function findUnmatchedBracketOpeners(text, languageId) {
  const lineComment = getLineCommentTokenForLanguage(languageId);
  const useBlockComment = lineComment === "//";
  const stack = [];
  let quote = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (quote) {
      if (char === "\\") { index += 2; continue; }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (useBlockComment && char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    if (lineComment && text.startsWith(lineComment, index)) {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      index += 1;
      continue;
    }
    if (BRACKET_CLOSER_FOR_OPENER[char]) {
      stack.push({ char, index });
      index += 1;
      continue;
    }
    if (BRACKET_OPENER_FOR_CLOSER[char]) {
      if (stack.length && stack[stack.length - 1].char === BRACKET_OPENER_FOR_CLOSER[char]) {
        stack.pop();
      }
      index += 1;
      continue;
    }
    index += 1;
  }
  return stack;
}

// A full-document scan on every keystroke is fine at ordinary source-file sizes (the same
// assumption the existing find-bookmark and CSS-custom-property scans in this file already
// make), but skip it past a size where that stops being true rather than risk stalling
// input on a huge file.
const MAX_UNCLOSED_BRACKET_SCAN_LENGTH = 500000;
const LARGE_DOCUMENT_LINE_THRESHOLD = 10000;
const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 250000;
const LARGE_DOCUMENT_ANALYSIS_DELAY_MS = 150;

const unclosedBracketMark = Decoration.mark({ class: "cm-unclosedBracket" });
const refreshUnclosedBracketDecorationsEffect = StateEffect.define();

function isLargeCodeMirrorDocument(doc) {
  return doc.lines > LARGE_DOCUMENT_LINE_THRESHOLD || doc.length > LARGE_DOCUMENT_CHARACTER_THRESHOLD;
}

function buildUnclosedBracketDecorations(state, languageId) {
  const text = state.doc.toString();
  if (text.length > MAX_UNCLOSED_BRACKET_SCAN_LENGTH) return Decoration.none;
  const unmatched = findUnmatchedBracketOpeners(text, languageId);
  if (!unmatched.length) return Decoration.none;
  const builder = new RangeSetBuilder();
  unmatched.forEach(({ index }) => {
    builder.add(index, index + 1, unclosedBracketMark);
  });
  return builder.finish();
}

function createUnclosedBracketExtension(enabled, languageId) {
  if (!enabled) return [];
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildUnclosedBracketDecorations(view.state, languageId);
      this.refreshTimer = null;
    }

    update(update) {
      if (update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshUnclosedBracketDecorationsEffect)))) {
        this.decorations = buildUnclosedBracketDecorations(update.state, languageId);
        return;
      }
      if (!update.docChanged) return;
      if (!isLargeCodeMirrorDocument(update.state.doc)) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        this.decorations = buildUnclosedBracketDecorations(update.state, languageId);
        return;
      }
      this.decorations = this.decorations.map(update.changes);
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        update.view.dispatch({ effects: refreshUnclosedBracketDecorationsEffect.of(null) });
      }, LARGE_DOCUMENT_ANALYSIS_DELAY_MS);
    }

    destroy() {
      clearTimeout(this.refreshTimer);
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

const unclosedBracketTheme = EditorView.theme({
  ".cm-unclosedBracket": {
    backgroundColor: "color-mix(in srgb, #f1c40f 55%, transparent)",
    borderRadius: "2px"
  }
});

function getIndentTextOfLine(lineText) {
  const match = String(lineText || "").match(/^[ \t]*/);
  return match ? match[0] : "";
}

/**
 * Where to put the missing closer for `opener`: right after the last non-blank line that's
 * indented deeper than the opener's own line (the natural end of whatever body belongs to
 * it), on its own line at the opener's indentation — the same shape a human closing the
 * block by hand would produce. If nothing deeper follows (the opener has no body yet), close
 * it immediately instead of manufacturing an indented line for no reason.
 */
function computeMissingCloserInsertion(state, opener) {
  const doc = state.doc;
  const closer = BRACKET_CLOSER_FOR_OPENER[opener.char];
  const openerLine = doc.lineAt(opener.index);
  const openerIndent = getIndentTextOfLine(openerLine.text);
  let lastContentLine = openerLine;
  for (let lineNumber = openerLine.number + 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (line.text.trim() === "") continue;
    if (getIndentTextOfLine(line.text).length <= openerIndent.length) break;
    lastContentLine = line;
  }
  if (lastContentLine.number === openerLine.number) {
    return { from: opener.index + 1, to: opener.index + 1, insert: closer };
  }
  return { from: lastContentLine.to, to: lastContentLine.to, insert: `\n${openerIndent}${closer}` };
}

function measureWrapSymbolMarkers(view) {
  if (!view.lineWrapping) return null;

  const scrollerRect = view.scrollDOM.getBoundingClientRect();
  const markerOffset = 1;
  const markerWidth = 16;
  const markers = [];

  for (const block of view.viewportLineBlocks) {
    const line = view.state.doc.lineAt(block.from);
    let cursor = EditorSelection.cursor(line.from);
    let guard = 0;

    while (cursor.head < line.to && guard < 200) {
      guard += 1;
      const boundary = view.moveToLineBoundary(cursor, true, true);
      if (!boundary || boundary.head <= cursor.head || boundary.head >= line.to) break;

      const coords = view.coordsAtPos(boundary.head, -1) || view.coordsAtPos(Math.max(line.from, boundary.head - 1), 1);
      if (coords) {
        const left = coords.right - scrollerRect.left + markerOffset;
        markers.push({
          left: Math.round(Math.min(
            scrollerRect.width - markerWidth,
            Math.max(0, left)
          )),
          top: Math.round(coords.top - scrollerRect.top)
        });
      }
      cursor = EditorSelection.cursor(boundary.head);
    }
  }

  return markers;
}

function renderWrapSymbolMarkers(markerLayer, markers) {
  markerLayer.textContent = "";
  for (const entry of markers || []) {
    const marker = document.createElement("span");
    marker.className = "cm-visible-symbol cm-visible-wrap";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = "↩";
    marker.style.left = `${entry.left}px`;
    marker.style.top = `${entry.top}px`;
    markerLayer.appendChild(marker);
  }
}

const wrapSymbolExtension = ViewPlugin.fromClass(class {
  constructor(view) {
    this.markerLayer = document.createElement("div");
    this.markerLayer.className = "cm-wrap-symbol-layer";
    view.scrollDOM.appendChild(this.markerLayer);
    this.updateMarkers(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged || update.heightChanged) {
      this.updateMarkers(update.view);
    }
  }

  docViewUpdate(view) {
    this.updateMarkers(view);
  }

  updateMarkers(view) {
    view.requestMeasure({
      key: this,
      read: measureWrapSymbolMarkers,
      write: (markers) => renderWrapSymbolMarkers(this.markerLayer, markers)
    });
  }

  destroy() {
    this.markerLayer.remove();
  }
});

function getDefaultPlugin(module) {
  return module && module.default ? module.default : module;
}

const markdownFormatterConfig = { parser: "markdown", plugins: [prettierMarkdown] };
const javascriptFormatterConfig = { parser: "babel", plugins: [prettierBabel, prettierEstree] };
const typescriptFormatterConfig = { parser: "typescript", plugins: [prettierTypescript, prettierEstree] };
const htmlFormatterConfig = { parser: "html", plugins: [prettierHtml] };
const cssFormatterConfig = { parser: "css", plugins: [prettierPostcss] };
const scssFormatterConfig = { parser: "scss", plugins: [prettierPostcss] };
const jsonFormatterConfig = { parser: "json", plugins: [prettierBabel, prettierEstree] };
const yamlFormatterConfig = { parser: "yaml", plugins: [prettierYaml] };
const xmlFormatterConfig = { parser: "xml", plugins: [getDefaultPlugin(prettierXml)] };
const javaFormatterConfig = { format: formatJavaCode, formatWithCursor: formatJavaCodeWithCursor };
const formatterConfigs = {
  markdown: markdownFormatterConfig,
  "prettier-markdown": markdownFormatterConfig,
  javascript: javascriptFormatterConfig,
  nodejs: javascriptFormatterConfig,
  "prettier-babel": javascriptFormatterConfig,
  typescript: typescriptFormatterConfig,
  "prettier-typescript": typescriptFormatterConfig,
  html: htmlFormatterConfig,
  "prettier-html": htmlFormatterConfig,
  css: cssFormatterConfig,
  "prettier-css": cssFormatterConfig,
  sass: scssFormatterConfig,
  scss: scssFormatterConfig,
  less: { parser: "less", plugins: [prettierPostcss] },
  json: jsonFormatterConfig,
  "prettier-json": jsonFormatterConfig,
  yaml: yamlFormatterConfig,
  "prettier-yaml": yamlFormatterConfig,
  xml: xmlFormatterConfig,
  java: javaFormatterConfig,
  "prettier-java": javaFormatterConfig,
  maven: xmlFormatterConfig,
  "prettier-xml": xmlFormatterConfig
};

let javaFormatterLoadPromise = null;

function loadJavaFormatter() {
  if (window.MarkdownViewerJavaFormatter?.formatJavaCode) return Promise.resolve(window.MarkdownViewerJavaFormatter);
  if (javaFormatterLoadPromise) return javaFormatterLoadPromise;
  javaFormatterLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/vendor/prettier-java.bundle.js";
    script.async = true;
    script.onload = function() {
      if (window.MarkdownViewerJavaFormatter?.formatJavaCode) resolve(window.MarkdownViewerJavaFormatter);
      else reject(new Error("Java formatter bundle loaded without exposing a formatter."));
    };
    script.onerror = function() {
      reject(new Error("Java formatter bundle could not be loaded."));
    };
    document.head.appendChild(script);
  }).finally(() => {
    javaFormatterLoadPromise = null;
  });
  return javaFormatterLoadPromise;
}

async function formatJavaCode(source) {
  const javaFormatter = await loadJavaFormatter();
  return javaFormatter.formatJavaCode(source);
}

async function formatJavaCodeWithCursor(source, cursorOffset) {
  const javaFormatter = await loadJavaFormatter();
  return javaFormatter.formatJavaCodeWithCursor(source, cursorOffset);
}

async function formatCode(source, languageId) {
  const config = formatterConfigs[languageId || ""];
  if (!config) {
    throw new Error("No formatter is registered for this file type.");
  }
  if (typeof config.format === "function") return config.format(source);

  const formatted = await prettier.format(String(source || ""), {
    parser: config.parser,
    plugins: config.plugins,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false
  });

  return typeof formatted === "string" ? formatted : String(formatted || "");
}

async function formatCodeWithCursor(source, languageId, cursorOffset) {
  const config = formatterConfigs[languageId || ""];
  if (!config) throw new Error("No formatter is registered for this file type.");
  if (typeof config.formatWithCursor === "function") return config.formatWithCursor(source, cursorOffset);

  const result = await prettier.formatWithCursor(String(source || ""), {
    parser: config.parser,
    plugins: config.plugins,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    cursorOffset: Math.max(0, Number(cursorOffset) || 0)
  });
  return {
    formatted: typeof result?.formatted === "string" ? result.formatted : String(result?.formatted || ""),
    cursorOffset: Math.max(0, Number(result?.cursorOffset) || 0)
  };
}

function canFormatCode(languageId) {
  return Object.prototype.hasOwnProperty.call(formatterConfigs, languageId || "");
}

function isIndexInQuotedText(line, index) {
  let quote = "";
  let escaped = false;

  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = line[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if ((char === "\"" || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char;
    }
  }

  return !!quote;
}

function collectMermaidDiagnosticsForLine(line, lineStart) {
  const diagnostics = [];

  function add(start, end, message, suggestion) {
    if (end <= start) return;
    diagnostics.push({
      from: lineStart + start,
      to: lineStart + end,
      severity: "warning",
      message: suggestion ? `${message}\n${suggestion}` : message
    });
  }

  let match;
  const reservedWordRegex = /\b(end|default)\b/gi;
  while ((match = reservedWordRegex.exec(line)) !== null) {
    const value = match[1].toLowerCase();
    if (isIndexInQuotedText(line, match.index)) continue;
    add(
      match.index,
      match.index + match[0].length,
      `"${match[0]}" is a Mermaid keyword and can break flowchart parsing when used as a node id.`,
      `Rename the node id, for example ${value === "end" ? 'EndNode["end"]' : 'DefaultNode["default"]'}, then point links at the new id.`
    );
  }

  const labelRegex = /([A-Za-z_][\w.-]*)\[((?:[^\]"']|"[^"]*"|'[^']*')*)\]/g;
  while ((match = labelRegex.exec(line)) !== null) {
    const label = match[2];
    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel[0] === "\"" || trimmedLabel[0] === "'") continue;
    if (/[():,\[\]<>]/.test(label)) {
      const labelStart = match.index + match[1].length + 1;
      add(
        labelStart,
        labelStart + label.length,
        "This unquoted Mermaid label contains punctuation that Mermaid v11 parses more strictly.",
        `Quote the label, for example ${match[1]}["${label.replace(/"/g, '\\"')}"].`
      );
    }
  }

  const htmlRegex = /<[^>\s]+[^>]*>/g;
  while ((match = htmlRegex.exec(line)) !== null) {
    if (isIndexInQuotedText(line, match.index)) {
      add(
        match.index,
        match.index + match[0].length,
        "HTML inside Mermaid labels can be rejected depending on Mermaid security settings.",
        "Use a plain-text label or replace line breaks with \\n."
      );
    }
  }

  const invisibleRegex = /[\u200B-\u200D\uFEFF\u00A0]/g;
  while ((match = invisibleRegex.exec(line)) !== null) {
    add(
      match.index,
      match.index + 1,
      "This invisible Unicode character can make Mermaid fail to parse the line.",
      "Delete and retype the surrounding text as plain text."
    );
  }

  return diagnostics;
}

function mermaidDiagnostics(view) {
  const diagnostics = [];
  const text = view.state.doc.toString();
  const lines = text.split("\n");
  let offset = 0;
  let inFence = false;
  let fenceLanguage = "";

  lines.forEach((line) => {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLanguage = fenceMatch[3].trim().split(/\s+/)[0].toLowerCase();
      } else {
        inFence = false;
        fenceLanguage = "";
      }
    } else if (inFence && fenceLanguage === "mermaid") {
      diagnostics.push(...collectMermaidDiagnosticsForLine(line, offset));
    }
    offset += line.length + 1;
  });

  return diagnostics;
}

function createFoldMarker(open) {
  const marker = document.createElement("span");
  marker.className = `cm-fold-marker cm-fold-marker-${open ? "open" : "closed"}`;
  marker.title = open ? "Fold line" : "Unfold line";
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

function getTopLevelFoldRanges(view) {
  const { state } = view;
  const ranges = [];

  for (let position = 0; position < state.doc.length;) {
    const line = view.lineBlockAt(position);
    const range = foldable(state, line.from, line.to);
    if (range) ranges.push(range);
    position = (range ? view.lineBlockAt(range.to) : line).to + 1;
  }

  return ranges;
}

function collapseTopLevelFolds(view) {
  const effects = getTopLevelFoldRanges(view).map((range) => foldEffect.of(range));
  if (!effects.length) return false;
  view.dispatch({ effects });
  return true;
}

function expandTopLevelFolds(view) {
  const ranges = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    if (!ranges.some((range) => from >= range.from && to <= range.to)) {
      ranges.push({ from, to });
    }
  });
  if (!ranges.length) return false;
  view.dispatch({ effects: ranges.map((range) => unfoldEffect.of(range)) });
  return true;
}

const selectionMatchMark = Decoration.mark({ class: "cm-selectionMatch" });
const selectedSelectionMatchMark = Decoration.mark({ class: "cm-selectionMatch-selected" });
const selectionMatchTheme = EditorView.baseTheme({
  ".cm-selectionMatch": { backgroundColor: "var(--editor-selection-match-bg)" },
  ".cm-selectionMatch, .cm-selectionMatch *": { color: "var(--editor-selection-match-text-color) !important" },
  ".cm-selectionMatch-selected": { backgroundColor: "transparent" },
  ".cm-selectionMatch-selected, .cm-selectionMatch-selected *": { color: "var(--editor-current-selection-text-color) !important" },
  ".cm-activeLine:has(.cm-selectionMatch-selected)": { backgroundColor: "transparent !important" },
  ".cm-searchMatch .cm-selectionMatch": { backgroundColor: "transparent" }
});

const cssCustomPropertyPattern = /--[A-Za-z_][A-Za-z0-9_-]*/g;
const cssCustomPropertyMark = Decoration.mark({ class: "cm-cssCustomPropertyName" });
const cssCustomPropertyTheme = EditorView.baseTheme({
  ".cm-cssCustomPropertyName": {
    color: "var(--editor-syntax-property)",
    fontWeight: "600"
  },
  ".cm-cssCustomPropertyTooltip": {
    maxWidth: "360px",
    padding: "8px 10px",
    border: "1px solid var(--border-color)",
    borderRadius: "6px",
    background: "var(--panel-bg)",
    color: "var(--text-color)",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    fontSize: "12px",
    lineHeight: "1.45"
  },
  ".cm-cssCustomPropertyTooltip-name": {
    color: "var(--editor-syntax-property)",
    fontWeight: "700"
  },
  ".cm-cssCustomPropertyTooltip-meta": {
    marginTop: "3px",
    color: "var(--disabled-text-color)"
  },
  ".cm-cssCustomPropertyTooltip-value": {
    marginTop: "5px",
    whiteSpace: "pre-wrap"
  }
});

function isCssCustomPropertyLanguage(languageId) {
  return languageId === "css" || languageId === "sass";
}

function findCssCustomPropertyAtPosition(state, position) {
  const line = state.doc.lineAt(position);
  cssCustomPropertyPattern.lastIndex = 0;
  let match;
  while ((match = cssCustomPropertyPattern.exec(line.text)) !== null) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (position >= from && position <= to) return { name: match[0], from, to };
  }
  return null;
}

function findCssCustomPropertyDefinition(state, propertyName) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
    const match = line.text.match(pattern);
    if (!match) continue;
    const colonIndex = line.text.indexOf(":", match.index + match[1].length);
    const valueStart = colonIndex + 1;
    const semicolonIndex = line.text.indexOf(";", valueStart);
    const valueEnd = semicolonIndex >= 0 ? semicolonIndex : line.text.length;
    return {
      lineNumber,
      value: line.text.slice(valueStart, valueEnd).trim()
    };
  }
  return null;
}

function createCssCustomPropertyTooltip(propertyName, definition) {
  const dom = document.createElement("div");
  dom.className = "cm-cssCustomPropertyTooltip";
  const nameElement = document.createElement("div");
  nameElement.className = "cm-cssCustomPropertyTooltip-name";
  nameElement.textContent = propertyName;
  const metaElement = document.createElement("div");
  metaElement.className = "cm-cssCustomPropertyTooltip-meta";
  metaElement.textContent = definition
    ? `CSS custom property, defined on line ${definition.lineNumber}`
    : "CSS custom property";
  dom.append(nameElement, metaElement);
  if (definition?.value) {
    const valueElement = document.createElement("div");
    valueElement.className = "cm-cssCustomPropertyTooltip-value";
    valueElement.textContent = definition.value;
    dom.appendChild(valueElement);
  }
  return dom;
}

function buildCssCustomPropertyDecorations(view) {
  const builder = new RangeSetBuilder();
  for (const range of view.visibleRanges) {
    const text = view.state.sliceDoc(range.from, range.to);
    cssCustomPropertyPattern.lastIndex = 0;
    let match;
    while ((match = cssCustomPropertyPattern.exec(text)) !== null) {
      builder.add(range.from + match.index, range.from + match.index + match[0].length, cssCustomPropertyMark);
    }
  }
  return builder.finish();
}

function createCssCustomPropertyExtension(languageId) {
  if (!isCssCustomPropertyLanguage(languageId)) return [];
  const decorations = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildCssCustomPropertyDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCssCustomPropertyDecorations(update.view);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
  return [
    cssCustomPropertyTheme,
    decorations
  ];
}

function createSelectionMatchExtension(caseSensitive = true) {
  const selectionMatchPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view) {
      const selection = view.state.selection.main;
      const selectionFrom = Math.min(selection.anchor, selection.head);
      const selectionTo = Math.max(selection.anchor, selection.head);
      const selectedText = view.state.sliceDoc(selectionFrom, selectionTo);

      if (selectedText.length < 2 || selectedText.trim() === "") return Decoration.none;

      const builder = new RangeSetBuilder();
      const needle = caseSensitive ? selectedText : selectedText.toLocaleLowerCase();
      const needleLength = selectedText.length;

      for (const range of view.visibleRanges) {
        const visibleText = view.state.sliceDoc(range.from, range.to);
        const haystack = caseSensitive ? visibleText : visibleText.toLocaleLowerCase();
        let index = haystack.indexOf(needle);

        while (index !== -1) {
          const from = range.from + index;
          const to = from + needleLength;
          if (to > from) {
            const matchMark = from === selectionFrom && to === selectionTo
              ? selectedSelectionMatchMark
              : selectionMatchMark;
            builder.add(from, to, matchMark);
          }
          index = haystack.indexOf(needle, index + needleLength);
        }
      }

      return builder.finish();
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });

  return [selectionMatchTheme, selectionMatchPlugin];
}

class FindLineBookmarkMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-findLineBookmarkMarker";
    marker.title = "Bookmarked find result";
    marker.setAttribute("aria-hidden", "true");
    marker.addEventListener("contextmenu", (event) => {
      showFindLineBookmarkContextMenuForElement(marker, event);
    });
    return marker;
  }
}

class EmptyFindLineBookmarkMarker extends GutterMarker {
  constructor(lineNumber) {
    super();
    this.lineNumber = lineNumber;
  }

  eq(other) {
    return other instanceof EmptyFindLineBookmarkMarker && other.lineNumber === this.lineNumber;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-findLineBookmarkEmptyMarker";
    marker.title = "Bookmark line";
    marker.dataset.bookmarkLine = String(this.lineNumber);
    marker.setAttribute("aria-hidden", "true");
    marker.addEventListener("contextmenu", (event) => {
      showFindLineBookmarkContextMenuForElement(marker, event);
    });
    return marker;
  }
}

const findLineBookmarkMarker = new FindLineBookmarkMarker();
const findLineBookmarkDecoration = Decoration.line({ class: "cm-findLineBookmark" });
const setFindLineBookmarksEffect = StateEffect.define();
const clearFindLineBookmarksEffect = StateEffect.define();
const toggleFindLineBookmarkEffect = StateEffect.define();
let findLineBookmarkContextMenu = null;
let findLineBookmarkContextMenuView = null;
let activeFindLineBookmarkView = null;
let findLineBookmarkDocumentContextMenuRegistered = false;
const findLineBookmarkViews = new WeakMap();

function getFindLineBookmarkViewForElement(element) {
  const editor = element?.closest?.(".cm-editor");
  return editor ? findLineBookmarkViews.get(editor) : null;
}

function showFindLineBookmarkContextMenuForElement(element, event) {
  const view = getFindLineBookmarkViewForElement(element) || activeFindLineBookmarkView;
  if (!view) return;
  showFindLineBookmarkContextMenu(view, event);
}

function isFindLineBookmarkContextMenuTarget(target) {
  return !!(
    target?.closest?.(".cm-findLineBookmarkGutter") ||
    target?.closest?.(".cm-findLineBookmarkMarker") ||
    target?.closest?.(".cm-findLineBookmarkEmptyMarker")
  );
}

function ensureFindLineBookmarkDocumentContextMenu() {
  if (findLineBookmarkDocumentContextMenuRegistered) return;
  document.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const view = getFindLineBookmarkViewForElement(target) || activeFindLineBookmarkView;
    if (!isFindLineBookmarkContextMenuTarget(target) || !view) return;
    showFindLineBookmarkContextMenu(view, event);
  }, true);
  findLineBookmarkDocumentContextMenuRegistered = true;
}

function normalizeFindLineBookmarkNumbers(doc, lineNumbers) {
  return Array.from(new Set((lineNumbers || []).map((lineNumber) => Math.floor(Number(lineNumber) || 0))))
    .filter((lineNumber) => lineNumber >= 1 && lineNumber <= doc.lines)
    .sort((a, b) => a - b);
}

function buildFindLineBookmarkRanges(doc, lineNumbers, value) {
  const builder = new RangeSetBuilder();
  normalizeFindLineBookmarkNumbers(doc, lineNumbers).forEach((lineNumber) => {
    const line = doc.line(lineNumber);
    builder.add(line.from, line.from, value);
  });
  return builder.finish();
}

function getFindLineBookmarkNumbers(doc, bookmarks) {
  const lineNumbers = [];
  bookmarks.between(0, doc.length, (from) => {
    lineNumbers.push(doc.lineAt(from).number);
  });
  return normalizeFindLineBookmarkNumbers(doc, lineNumbers);
}

function hasFindLineBookmarks(state) {
  let hasBookmarks = false;
  state.field(findLineBookmarkMarkers).between(0, state.doc.length, () => {
    hasBookmarks = true;
    return false;
  });
  return hasBookmarks;
}

function getFindLineBookmarkNumbersForState(state) {
  return getFindLineBookmarkNumbers(state.doc, state.field(findLineBookmarkMarkers));
}

function getFindLineBookmarkText(state) {
  return getFindLineBookmarkNumbersForState(state)
    .map((lineNumber) => state.doc.line(lineNumber).text)
    .join("\n");
}

function getFindLineBookmarkDeleteChanges(state) {
  const lineNumbers = getFindLineBookmarkNumbersForState(state);
  if (!lineNumbers.length) return [];
  if (lineNumbers.length === state.doc.lines) {
    return [{ from: 0, to: state.doc.length, insert: "" }];
  }

  const groups = [];
  lineNumbers.forEach((lineNumber) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lineNumber === lastGroup.end + 1) {
      lastGroup.end = lineNumber;
    } else {
      groups.push({ start: lineNumber, end: lineNumber });
    }
  });

  return groups.map((group) => {
    if (group.end < state.doc.lines) {
      return {
        from: state.doc.line(group.start).from,
        to: state.doc.line(group.end + 1).from,
        insert: ""
      };
    }
    return {
      from: state.doc.line(group.start - 1).to,
      to: state.doc.line(group.end).to,
      insert: ""
    };
  });
}

function deleteFindLineBookmarkLines(view) {
  const changes = getFindLineBookmarkDeleteChanges(view.state);
  if (!changes.length) return false;
  view.dispatch({
    changes,
    effects: clearFindLineBookmarksEffect.of(null),
    scrollIntoView: true
  });
  return true;
}

async function writeFindLineBookmarkTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_error) {
      // Fall back to the textarea path below when browser permissions block the Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function toggleFindLineBookmarkNumber(doc, bookmarks, lineNumber) {
  const normalizedLineNumber = Math.floor(Number(lineNumber) || 0);
  if (normalizedLineNumber < 1 || normalizedLineNumber > doc.lines) {
    return getFindLineBookmarkNumbers(doc, bookmarks);
  }
  const lineNumbers = new Set(getFindLineBookmarkNumbers(doc, bookmarks));
  if (lineNumbers.has(normalizedLineNumber)) lineNumbers.delete(normalizedLineNumber);
  else lineNumbers.add(normalizedLineNumber);
  return Array.from(lineNumbers).sort((a, b) => a - b);
}

function findLineNumberForBlock(view, line) {
  if (!line || typeof line.from !== "number") return 0;
  return view.state.doc.lineAt(line.from).number;
}

function emptyFindLineBookmarkMarkers() {
  return new RangeSetBuilder().finish();
}

function hideFindLineBookmarkContextMenu() {
  if (findLineBookmarkContextMenu) {
    findLineBookmarkContextMenu.classList.add("hidden");
  }
  findLineBookmarkContextMenuView = null;
}

function positionFindLineBookmarkContextMenu(menu, clientX, clientY) {
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.classList.remove("hidden");

  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(Math.max(clientX, margin), window.innerWidth - menuRect.width - margin);
  const top = Math.min(Math.max(clientY, margin), window.innerHeight - menuRect.height - margin);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function createFindLineBookmarkContextMenuButton(action, iconClass, label, handler) {
  const button = document.createElement("button");
  button.className = "graph-context-menu-item";
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.dataset.bookmarkContextAction = action;
  button.innerHTML = `<i class="bi ${iconClass}" aria-hidden="true"></i><span class="graph-context-menu-item-label">${label}</span>`;
  button.addEventListener("click", () => {
    const view = findLineBookmarkContextMenuView;
    if (!view || button.disabled) return;
    Promise.resolve(handler(view))
      .catch((error) => console.error("Bookmark action failed", error))
      .finally(() => {
        view.focus();
        hideFindLineBookmarkContextMenu();
      });
  });
  return button;
}

function getFindLineBookmarkContextMenu() {
  if (findLineBookmarkContextMenu) return findLineBookmarkContextMenu;

  const menu = document.createElement("div");
  menu.id = "editor-bookmark-context-menu";
  menu.className = "graph-context-menu cm-findLineBookmarkContextMenu hidden";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Bookmark actions");
  menu.style.position = "fixed";
  menu.style.zIndex = "5000";

  const cutButton = createFindLineBookmarkContextMenuButton("cut-lines", "bi-scissors", "Cut bookmarked lines", async (view) => {
    const text = getFindLineBookmarkText(view.state);
    await writeFindLineBookmarkTextToClipboard(text);
    deleteFindLineBookmarkLines(view);
  });
  const copyButton = createFindLineBookmarkContextMenuButton("copy-lines", "bi-clipboard", "Copy bookmarked lines", async (view) => {
    await writeFindLineBookmarkTextToClipboard(getFindLineBookmarkText(view.state));
  });
  const deleteButton = createFindLineBookmarkContextMenuButton("delete-lines", "bi-trash", "Delete bookmarked lines", (view) => {
    deleteFindLineBookmarkLines(view);
  });
  const clearButton = createFindLineBookmarkContextMenuButton("clear-all", "bi-bookmark-x", "Clear all bookmarks", (view) => {
    view.dispatch({ effects: clearFindLineBookmarksEffect.of(null) });
  });

  menu.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  menu.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  menu.appendChild(cutButton);
  menu.appendChild(copyButton);
  menu.appendChild(deleteButton);
  menu.appendChild(clearButton);
  document.body.appendChild(menu);

  document.addEventListener("mousedown", (event) => {
    if (!findLineBookmarkContextMenu || findLineBookmarkContextMenu.classList.contains("hidden")) return;
    if (event.target instanceof Node && findLineBookmarkContextMenu.contains(event.target)) return;
    hideFindLineBookmarkContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideFindLineBookmarkContextMenu();
  });

  findLineBookmarkContextMenu = menu;
  return findLineBookmarkContextMenu;
}

function showFindLineBookmarkContextMenu(view, event) {
  event.preventDefault();
  event.stopPropagation();
  const menu = getFindLineBookmarkContextMenu();
  findLineBookmarkContextMenuView = view;
  const hasBookmarks = hasFindLineBookmarks(view.state);
  menu.querySelectorAll("[data-bookmark-context-action]").forEach((button) => {
    button.disabled = !hasBookmarks;
  });
  positionFindLineBookmarkContextMenu(menu, event.clientX, event.clientY);
}

const findLineBookmarkDecorations = StateField.define({
  create() {
    return Decoration.none;
  },
  update(bookmarks, transaction) {
    let nextBookmarks = transaction.docChanged ? bookmarks.map(transaction.changes) : bookmarks;
    for (const effect of transaction.effects) {
      if (effect.is(setFindLineBookmarksEffect)) {
        nextBookmarks = buildFindLineBookmarkRanges(transaction.state.doc, effect.value, findLineBookmarkDecoration);
      } else if (effect.is(clearFindLineBookmarksEffect)) {
        nextBookmarks = Decoration.none;
      } else if (effect.is(toggleFindLineBookmarkEffect)) {
        nextBookmarks = buildFindLineBookmarkRanges(
          transaction.state.doc,
          toggleFindLineBookmarkNumber(transaction.state.doc, nextBookmarks, effect.value),
          findLineBookmarkDecoration
        );
      }
    }
    return nextBookmarks;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const findLineBookmarkMarkers = StateField.define({
  create() {
    return emptyFindLineBookmarkMarkers();
  },
  update(bookmarks, transaction) {
    let nextBookmarks = transaction.docChanged ? bookmarks.map(transaction.changes) : bookmarks;
    for (const effect of transaction.effects) {
      if (effect.is(setFindLineBookmarksEffect)) {
        nextBookmarks = buildFindLineBookmarkRanges(transaction.state.doc, effect.value, findLineBookmarkMarker);
      } else if (effect.is(clearFindLineBookmarksEffect)) {
        nextBookmarks = emptyFindLineBookmarkMarkers();
      } else if (effect.is(toggleFindLineBookmarkEffect)) {
        nextBookmarks = buildFindLineBookmarkRanges(
          transaction.state.doc,
          toggleFindLineBookmarkNumber(transaction.state.doc, nextBookmarks, effect.value),
          findLineBookmarkMarker
        );
      }
    }
    return nextBookmarks;
  }
});

const findLineBookmarkGutter = gutter({
  class: "cm-findLineBookmarkGutter",
  markers: (view) => view.state.field(findLineBookmarkMarkers),
  lineMarker(view, line) {
    return new EmptyFindLineBookmarkMarker(findLineNumberForBlock(view, line));
  },
  domEventHandlers: {
    mousedown(view, line, event) {
      if (event.button !== 0) return false;
      event.preventDefault();
      const target = event.target instanceof Element ? event.target : null;
      const lineNumber = Number(target?.closest("[data-bookmark-line]")?.dataset.bookmarkLine || findLineNumberForBlock(view, line));
      view.dispatch({ effects: toggleFindLineBookmarkEffect.of(lineNumber) });
      view.focus();
      return true;
    },
    contextmenu(view, _line, event) {
      showFindLineBookmarkContextMenu(view, event);
      return true;
    }
  }
});

const findLineBookmarkContextMenuHandler = EditorView.domEventHandlers({
  contextmenu(event, view) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".cm-findLineBookmarkGutter")) return false;
    showFindLineBookmarkContextMenu(view, event);
    return true;
  }
});

const lspGoToDefinitionMouseHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
    let position = null;
    try {
      position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    } catch (error) {
      console.warn("[md-editor] Unable to resolve LSP definition click position.", error);
      return false;
    }
    if (typeof position !== "number") return false;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    if (!goToLspDefinition(view)) return false;
    event.preventDefault();
    return true;
  }
});

function openLspTooltipLink(target) {
  const url = String(target || "").trim();
  if (!/^(?:https?:\/\/|mailto:|\/\/)/i.test(url)) return false;
  const normalizedUrl = url.startsWith("//") ? `${window.location.protocol}${url}` : url;

  try {
    if (typeof Neutralino !== "undefined" && Neutralino.os && typeof Neutralino.os.open === "function") {
      Promise.resolve(Neutralino.os.open(normalizedUrl)).catch((error) => {
        console.error("Failed to open LSP tooltip link with the OS:", error);
      });
      return true;
    }
  } catch (error) {
    console.error("Failed to open LSP tooltip link with the OS:", error);
  }

  window.open(normalizedUrl, "_blank", "noopener,noreferrer");
  return true;
}

const lspTooltipLinkClickHandler = EditorView.domEventHandlers({
  click(event) {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest?.(".cm-tooltip a[href]");
    if (!link || !openLspTooltipLink(link.href || link.getAttribute("href"))) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
});

function escapeLspTooltipHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[character]));
}

function renderLspTooltipCode(plugin, code) {
  if (typeof code === "string") return plugin.docToHTML(code, "markdown");
  const languageId = String(code?.language || "");
  const value = String(code?.value || "");
  let tooltipLanguage = plugin.client.config.highlightLanguage && plugin.client.config.highlightLanguage(languageId);
  if (!tooltipLanguage) {
    const viewLanguage = plugin.view.state.facet(language);
    if (viewLanguage && (!languageId || viewLanguage.name === languageId)) tooltipLanguage = viewLanguage;
  }
  if (!tooltipLanguage) return escapeLspTooltipHtml(value);
  let result = "";
  highlightCode(value, tooltipLanguage.parser.parse(value), { style: (tagSet) => highlightingFor(plugin.view.state, tagSet) }, (text, className) => {
    result += className ? `<span class="${className}">${escapeLspTooltipHtml(text)}</span>` : escapeLspTooltipHtml(text);
  }, () => {
    result += "<br>";
  });
  return result;
}

function renderLspTooltipContent(plugin, value) {
  if (Array.isArray(value)) return value.map((entry) => renderLspTooltipCode(plugin, entry)).join("<br>");
  if (typeof value === "string" || (value && typeof value === "object" && "language" in value)) return renderLspTooltipCode(plugin, value);
  return plugin.docToHTML(value);
}

function createLspHoverInformationElement(plugin, contents) {
  const content = document.createElement("div");
  content.className = "cm-lsp-hover-tooltip-content cm-lsp-documentation";
  content.innerHTML = renderLspTooltipContent(plugin, contents);
  return content;
}

function requestLspHover(plugin, pos) {
  if (plugin.client.hasCapability("hoverProvider") === false) return Promise.resolve(null);
  plugin.client.sync();
  return plugin.client.request("textDocument/hover", {
    position: plugin.toPosition(pos),
    textDocument: { uri: plugin.uri }
  });
}

function requestLspHoverInformation(view, pos, requestDoc) {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return Promise.resolve(null);
  return requestLspHover(plugin, pos).then((result) => {
    if (!result || view.state.doc !== requestDoc) return null;
    return {
      from: result.range ? plugin.fromPosition(result.range.start, requestDoc) : pos,
      to: result.range ? plugin.fromPosition(result.range.end, requestDoc) : pos,
      provider: "lsp",
      createDom: () => createLspHoverInformationElement(plugin, result.contents)
    };
  }).catch(() => null);
}

const hoverDiagnosticSeverityPriority = Object.freeze({ error: 0, warning: 1, info: 2, hint: 3 });

/** Collect diagnostics whose ranges contain the hovered editor position. */
function collectHoverDiagnostics(view, pos, side) {
  const diagnostics = [];
  forEachDiagnostic(view.state, (diagnostic, from, to) => {
    const containsPosition = side == null
      ? pos >= from && pos <= to
      : pos >= from && pos <= to && (from === to || (pos > from || side > 0) && (pos < to || side < 0));
    if (containsPosition) diagnostics.push({ diagnostic, from, to });
  });
  return diagnostics.sort((left, right) => {
    const leftPriority = hoverDiagnosticSeverityPriority[left.diagnostic.severity] ?? 4;
    const rightPriority = hoverDiagnosticSeverityPriority[right.diagnostic.severity] ?? 4;
    return leftPriority - rightPriority;
  });
}

function createEditorQuickFixRequest(view, entry) {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.uri || typeof plugin.toPosition !== "function") return null;
  return {
    uri: plugin.uri,
    range: {
      start: plugin.toPosition(entry.from),
      end: plugin.toPosition(entry.to)
    },
    message: String(entry.diagnostic.message || "")
  };
}

function focusFirstUnifiedHoverAction(root) {
  const action = root.querySelector(".cm-unified-hover-diagnostic-action:not(:disabled)");
  if (action instanceof HTMLElement) action.focus();
}

function createUnifiedHoverDiagnosticElement(view, entry, options, requestDoc, focusActions) {
  const severity = entry.diagnostic.severity || "error";
  const row = document.createElement("div");
  row.className = "cm-unified-hover-diagnostic cm-unified-hover-diagnostic-" + severity;
  const marker = document.createElement("span");
  marker.className = "cm-unified-hover-diagnostic-marker";
  marker.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "cm-unified-hover-diagnostic-body";
  const message = document.createElement("div");
  message.className = "cm-unified-hover-diagnostic-message";
  message.textContent = entry.diagnostic.message;
  body.appendChild(message);
  if (entry.diagnostic.source) {
    const source = document.createElement("div");
    source.className = "cm-unified-hover-diagnostic-source";
    source.textContent = entry.diagnostic.source;
    body.appendChild(source);
  }
  let actionsElement = null;
  function ensureActionsElement() {
    if (actionsElement) return actionsElement;
    actionsElement = document.createElement("div");
    actionsElement.className = "cm-unified-hover-diagnostic-actions";
    body.appendChild(actionsElement);
    return actionsElement;
  }
  if (entry.diagnostic.actions?.length) {
    const actions = ensureActionsElement();
    for (const action of entry.diagnostic.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-unified-hover-diagnostic-action";
      button.textContent = action.name;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        action.apply(view, entry.from, entry.to);
      });
      actions.appendChild(button);
    }
  }
  const quickFixRequest = options.languageId === "java"
    && typeof options.getEditorQuickFixSuggestions === "function"
    ? createEditorQuickFixRequest(view, entry)
    : null;
  if (quickFixRequest) {
    const actions = ensureActionsElement();
    const status = document.createElement("span");
    status.className = "cm-unified-hover-quick-fix-status";
    status.textContent = "Loading quick fixes...";
    status.setAttribute("aria-live", "polite");
    actions.appendChild(status);
    Promise.resolve(options.getEditorQuickFixSuggestions(quickFixRequest)).then((result) => {
      if (!row.isConnected || view.state.doc !== requestDoc) return;
      if (!result?.diagnostic) {
        status.remove();
        if (!actions.childElementCount) actions.remove();
        return;
      }
      const quickFixActions = Array.isArray(result.actions) ? result.actions : [];
      status.textContent = quickFixActions.length ? "Quick fixes available:" : (result.reason || "No JDT fixes are available.");
      for (const action of quickFixActions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cm-unified-hover-diagnostic-action cm-unified-hover-jdt-action";
        button.disabled = action.disabled === true;
        button.textContent = (action.isPreferred ? "\u2605 " : "") + action.title;
        button.title = action.disabledReason || action.description || action.title;
        button.dataset.actionId = String(action.id || "");
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
          event.preventDefault();
          if (!button.disabled) {
            closeKeyboardUnifiedHover(view);
            options.openEditorQuickFix?.(result, action.id);
          }
        });
        actions.appendChild(button);
      }
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "cm-unified-hover-diagnostic-action cm-unified-hover-open-quick-fix";
      openButton.textContent = "Open Quick Fix...";
      openButton.addEventListener("mousedown", (event) => event.preventDefault());
      openButton.addEventListener("click", (event) => {
        event.preventDefault();
        closeKeyboardUnifiedHover(view);
        options.openEditorQuickFix?.(result, "");
      });
      actions.appendChild(openButton);
      if (focusActions) focusFirstUnifiedHoverAction(row);
    }).catch((error) => {
      if (!row.isConnected || view.state.doc !== requestDoc) return;
      status.textContent = error?.message || "Unable to load JDT quick fixes.";
    });
  }
  row.append(marker, body);
  return row;
}

/** Create the single scrollable shell shared by diagnostics and information providers. */
function createUnifiedHoverTooltipElement(view, diagnostics, informationProviders, options = {}, requestDoc = view.state.doc, focusActions = false) {
  const shell = document.createElement("div");
  shell.className = "cm-unified-hover-tooltip";
  shell.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const actions = Array.from(shell.querySelectorAll(".cm-unified-hover-diagnostic-action:not(:disabled)"));
    if (!actions.length) return;
    const currentIndex = actions.indexOf(document.activeElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + actions.length) % actions.length;
    actions[nextIndex].focus();
    event.preventDefault();
  });
  const scroller = document.createElement("div");
  scroller.className = "cm-unified-hover-tooltip-content";
  const diagnosticsElement = document.createElement("div");
  diagnosticsElement.className = "cm-unified-hover-diagnostics";
  for (const diagnostic of diagnostics) {
    diagnosticsElement.appendChild(createUnifiedHoverDiagnosticElement(view, diagnostic, options, requestDoc, focusActions));
  }
  const divider = document.createElement("div");
  divider.className = "cm-unified-hover-divider";
  divider.hidden = true;
  const informationElement = document.createElement("div");
  informationElement.className = "cm-unified-hover-information";
  scroller.append(diagnosticsElement, divider, informationElement);
  shell.appendChild(scroller);

  const appendInformation = (provider) => {
    if (!provider) return;
    const section = document.createElement("div");
    section.className = "cm-unified-hover-information-item";
    section.dataset.provider = provider.provider;
    section.appendChild(provider.createDom());
    informationElement.appendChild(section);
    divider.hidden = diagnosticsElement.childElementCount === 0 || informationElement.childElementCount === 0;
  };
  for (const provider of informationProviders) appendInformation(provider);
  if (focusActions) requestAnimationFrame(() => focusFirstUnifiedHoverAction(shell));
  return { dom: shell, appendInformation };
}

function resolveUnifiedHoverAnchor(view, pos, diagnostics, informationProviders) {
  const word = view.state.wordAt(pos);
  if (word && pos >= word.from && pos <= word.to) return { from: word.from, to: word.to };
  const rangedItem = diagnostics[0] || informationProviders[0];
  return rangedItem
    ? { from: rangedItem.from, to: rangedItem.to }
    : { from: pos, to: pos };
}

function createUnifiedHoverDescriptor(view, pos, diagnostics, informationProviders, pendingLspInformation, requestDoc, options = {}, focusActions = false) {
  const anchor = resolveUnifiedHoverAnchor(view, pos, diagnostics, informationProviders);
  return {
    pos: anchor.from,
    end: anchor.to,
    above: true,
    create() {
      const popup = createUnifiedHoverTooltipElement(view, diagnostics, informationProviders, options, requestDoc, focusActions);
      if (pendingLspInformation) {
        pendingLspInformation.then((provider) => {
          if (provider && popup.dom.isConnected && view.state.doc === requestDoc) {
            popup.appendInformation(provider);
          }
        });
      }
      return { dom: popup.dom };
    }
  };
}

function createUnifiedEditorHoverTooltipExtension(getLanguageId, options = {}) {
  return hoverTooltip((view, pos, side) => {
    const requestDoc = view.state.doc;
    const diagnostics = collectHoverDiagnostics(view, pos, side);
    const languageId = getLanguageId();
    const hoverOptions = { ...options, languageId };
    const localInformation = getLocalHoverInformation(view, pos, languageId);
    const pendingLspInformation = requestLspHoverInformation(view, pos, requestDoc);
    if (diagnostics.length || localInformation.length) {
      return createUnifiedHoverDescriptor(
        view,
        pos,
        diagnostics,
        localInformation,
        pendingLspInformation,
        requestDoc,
        hoverOptions
      );
    }
    return pendingLspInformation.then((provider) => provider
      ? createUnifiedHoverDescriptor(view, pos, [], [provider], null, requestDoc, hoverOptions)
      : null);
  }, {
    hideOn: (transaction) => transaction.docChanged,
    hoverTime: options.hoverTime
  });
}

const setKeyboardUnifiedHoverEffect = StateEffect.define();
const keyboardUnifiedHoverField = StateField.define({
  create() {
    return null;
  },
  update(tooltip, transaction) {
    if (transaction.docChanged || transaction.selection) tooltip = null;
    for (const effect of transaction.effects) {
      if (effect.is(setKeyboardUnifiedHoverEffect)) tooltip = effect.value;
    }
    return tooltip;
  },
  provide: (field) => showTooltip.from(field)
});

function createOpenKeyboardUnifiedHover(getLanguageId, options = {}) {
  return (view) => {
    const pos = view.state.selection.main.head;
    const diagnostics = collectHoverDiagnostics(view, pos, null);
    if (!diagnostics.length) return false;
    const requestDoc = view.state.doc;
    const languageId = getLanguageId();
    const localInformation = getLocalHoverInformation(view, pos, languageId);
    const pendingLspInformation = requestLspHoverInformation(view, pos, requestDoc);
    const descriptor = createUnifiedHoverDescriptor(
      view,
      pos,
      diagnostics,
      localInformation,
      pendingLspInformation,
      requestDoc,
      { ...options, languageId },
      true
    );
    view.dispatch({ effects: setKeyboardUnifiedHoverEffect.of(descriptor) });
    return true;
  };
}

function closeKeyboardUnifiedHover(view) {
  if (!view.state.field(keyboardUnifiedHoverField, false)) return false;
  view.dispatch({ effects: setKeyboardUnifiedHoverEffect.of(null) });
  return true;
}

const lspDefinitionHoverMark = Decoration.mark({ class: "cm-lspDefinitionHover" });
const setLspDefinitionHoverRangeEffect = StateEffect.define();
const lspDefinitionOpeners = new WeakMap();

function getLspDefinitionHoverRange(view, event) {
  if (!(event.ctrlKey || event.metaKey)) return null;
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability("definitionProvider") === false) return null;
  let position = null;
  try {
    position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  } catch (error) {
    console.warn("[md-editor] Unable to resolve LSP definition hover position.", error);
    return null;
  }
  if (typeof position !== "number") return null;
  const word = view.state.wordAt(position);
  return word && position >= word.from && position <= word.to ? word : null;
}

function buildLspDefinitionHoverDecorations(range) {
  if (!range || range.from === range.to) return Decoration.none;
  const builder = new RangeSetBuilder();
  builder.add(range.from, range.to, lspDefinitionHoverMark);
  return builder.finish();
}

const lspDefinitionHoverDecorations = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let nextDecorations = transaction.docChanged ? decorations.map(transaction.changes) : decorations;
    for (const effect of transaction.effects) {
      if (effect.is(setLspDefinitionHoverRangeEffect)) {
        nextDecorations = buildLspDefinitionHoverDecorations(effect.value);
      }
    }
    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

function setLspDefinitionHoverRange(view, range) {
  view.dispatch({ effects: setLspDefinitionHoverRangeEffect.of(range) });
}

const lspDefinitionHoverMouseHandler = EditorView.domEventHandlers({
  mousemove(event, view) {
    setLspDefinitionHoverRange(view, getLspDefinitionHoverRange(view, event));
  },
  mouseleave(_event, view) {
    setLspDefinitionHoverRange(view, null);
  },
  keyup(_event, view) {
    setLspDefinitionHoverRange(view, null);
  }
});

const lspDefinitionHoverExtension = [
  lspDefinitionHoverDecorations,
  lspDefinitionHoverMouseHandler
];

const setLspFoldingRangesEffect = StateEffect.define();
const lspFoldingRefreshTimers = new WeakMap();

const lspFoldingRangeField = StateField.define({
  create() {
    return [];
  },
  update(ranges, transaction) {
    let nextRanges = transaction.docChanged
      ? ranges.map((range) => ({ from: transaction.changes.mapPos(range.from), to: transaction.changes.mapPos(range.to) })).filter((range) => range.to > range.from)
      : ranges;
    for (const effect of transaction.effects) {
      if (effect.is(setLspFoldingRangesEffect)) nextRanges = effect.value;
    }
    return nextRanges;
  }
});

function getLspFoldRange(state, lineStart, lineEnd) {
  const ranges = state.field(lspFoldingRangeField, false) || [];
  return ranges.find((range) => range.from >= lineStart && range.from <= lineEnd && range.to > range.from) || null;
}

function lspFoldingRangesChanged(update) {
  return update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setLspFoldingRangesEffect)));
}

function lspFoldingRangeToDocumentRange(doc, foldingRange) {
  const startLineNumber = Number(foldingRange?.startLine) + 1;
  const endLineNumber = Number(foldingRange?.endLine) + 1;
  if (!Number.isFinite(startLineNumber) || !Number.isFinite(endLineNumber)) return null;
  if (startLineNumber < 1 || endLineNumber < startLineNumber || endLineNumber > doc.lines) return null;
  const startLine = doc.line(startLineNumber);
  const endLine = doc.line(endLineNumber);
  const from = startLine.to;
  const to = endLine.to;
  return to > from ? { from, to } : null;
}

function setLspFoldingRanges(view, ranges) {
  view.dispatch({ effects: setLspFoldingRangesEffect.of(ranges) });
}

function refreshLspFoldingRanges(view) {
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability("foldingRangeProvider") === false) {
    setLspFoldingRanges(view, []);
    return Promise.resolve([]);
  }
  plugin.client.sync();
  return plugin.client.request("textDocument/foldingRange", { textDocument: { uri: plugin.uri } }).then((result) => {
    const ranges = (Array.isArray(result) ? result : [])
      .map((range) => lspFoldingRangeToDocumentRange(view.state.doc, range))
      .filter(Boolean);
    setLspFoldingRanges(view, ranges);
    logCodeMirrorLspDebug("LSP folding ranges refreshed", { uri: plugin.uri, count: ranges.length });
    return ranges;
  }, (error) => {
    logCodeMirrorLspDebug("LSP folding ranges failed", { message: error?.message || String(error || "") });
    return [];
  });
}

function scheduleLspFoldingRangeRefresh(view) {
  const existingTimer = lspFoldingRefreshTimers.get(view);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    lspFoldingRefreshTimers.delete(view);
    void refreshLspFoldingRanges(view);
  }, 120);
  lspFoldingRefreshTimers.set(view, timer);
}

function clearLspFoldingRangeRefresh(view) {
  const existingTimer = lspFoldingRefreshTimers.get(view);
  if (existingTimer) clearTimeout(existingTimer);
  lspFoldingRefreshTimers.delete(view);
  setLspFoldingRanges(view, []);
}

function normalizeLspDocumentSymbol(symbol) {
  return {
    name: String(symbol?.name || ""),
    detail: String(symbol?.detail || symbol?.containerName || ""),
    kind: symbol?.kind || 0,
    range: symbol?.range || symbol?.location?.range || null,
    selectionRange: symbol?.selectionRange || symbol?.range || symbol?.location?.range || null,
    children: Array.isArray(symbol?.children) ? symbol.children.map(normalizeLspDocumentSymbol) : []
  };
}

function requestLspDocumentSymbols(view) {
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability("documentSymbolProvider") === false) return Promise.resolve([]);
  plugin.client.sync();
  return plugin.client.request("textDocument/documentSymbol", { textDocument: { uri: plugin.uri } }).then((result) => {
    const symbols = (Array.isArray(result) ? result : []).map(normalizeLspDocumentSymbol);
    logCodeMirrorLspDebug("LSP document symbols refreshed", { uri: plugin.uri, count: symbols.length });
    return symbols;
  }, (error) => {
    logCodeMirrorLspDebug("LSP document symbols failed", { message: error?.message || String(error || "") });
    return [];
  });
}
const findLineBookmarkTheme = EditorView.baseTheme({
  ".cm-findLineBookmark": {
    backgroundColor: "color-mix(in srgb, var(--accent-color) 14%, transparent)"
  },
  ".cm-findLineBookmarkGutter .cm-gutterElement": {
    minWidth: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  },
  ".cm-findLineBookmarkMarker": {
    width: "8px",
    height: "12px",
    display: "inline-block",
    borderRadius: "1px 1px 2px 2px",
    background: "var(--accent-color)",
    clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)",
    opacity: "0.85"
  },
  ".cm-findLineBookmarkEmptyMarker": {
    width: "8px",
    height: "12px",
    display: "inline-block",
    borderRadius: "1px 1px 2px 2px",
    opacity: "0"
  },
  ".cm-findLineBookmarkGutter .cm-gutterElement:hover .cm-findLineBookmarkEmptyMarker": {
    background: "var(--editor-line-number-color)",
    clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)",
    opacity: "0.28"
  },
  ".cm-lspDefinitionHover": {
    color: "var(--editor-syntax-link)",
    textDecoration: "underline",
    cursor: "pointer"
  }
});

const findLineBookmarkExtension = [
  findLineBookmarkDecorations,
  findLineBookmarkMarkers,
  findLineBookmarkGutter,
  findLineBookmarkContextMenuHandler,
  findLineBookmarkTheme
];

function normalizeAutocompletePreferences(preferences = {}) {
  return {
    documentWords: preferences.documentWords === true,
    language: preferences.language === true,
    languageServer: preferences.languageServer === true,
    snippets: preferences.snippets === true
  };
}

const COMPLETION_ORIGIN_PILL_OPTION = Object.freeze({
  position: 90,
  render(completion) {
    const origin = String(completion?.origin || "").trim();
    if (!origin) return null;
    const pill = document.createElement("span");
    pill.className = `cm-completionOriginPill cm-completionOriginPill-${origin.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    pill.textContent = origin;
    return pill;
  }
});

function appendSnippetPreviewText(preview, text) {
  const source = String(text || "");
  const placeholderPattern = /\$\{[^}\n]+\}/g;
  let offset = 0;
  let match;
  while ((match = placeholderPattern.exec(source)) !== null) {
    if (match.index > offset) preview.appendChild(document.createTextNode(source.slice(offset, match.index)));
    const placeholder = document.createElement("span");
    placeholder.className = "cm-snippetPreview-placeholder";
    placeholder.textContent = match[0];
    preview.appendChild(placeholder);
    offset = match.index + match[0].length;
  }
  if (offset < source.length) preview.appendChild(document.createTextNode(source.slice(offset)));
}

function createSnippetPreviewElement(snippetDefinition) {
  const container = document.createElement("div");
  container.className = "cm-snippetPreview";
  const heading = document.createElement("div");
  heading.className = "cm-snippetPreview-heading";
  const title = document.createElement("strong");
  title.textContent = String(snippetDefinition?.label || "Snippet");
  heading.appendChild(title);
  const detail = String(snippetDefinition?.detail || "Snippet").trim();
  if (detail) {
    const origin = document.createElement("span");
    origin.textContent = detail;
    heading.appendChild(origin);
  }
  const code = document.createElement("pre");
  code.className = "cm-snippetPreview-code";
  appendSnippetPreviewText(code, String(snippetDefinition?.template || "").trimEnd());
  container.appendChild(heading);
  container.appendChild(code);
  return container;
}

function getSnippetCompletionSource(languageId, snippetDefinitions = []) {
  const definitionCount = Array.isArray(snippetDefinitions) ? snippetDefinitions.length : 0;
  if (!["javascript", "typescript", "java", "yaml", "python", "csharp"].includes(languageId)) {
    logCodeMirrorSnippetDebug("Snippet completion source skipped unsupported language", { languageId, definitionCount });
    return null;
  }
  const completionOptions = (Array.isArray(snippetDefinitions) ? snippetDefinitions : [])
    .filter((snippet) => snippet && snippet.label && snippet.template)
    .map((snippet) => snippetCompletion(String(snippet.template), {
      label: String(snippet.label),
      detail: String(snippet.detail || ""),
      type: String(snippet.type || "keyword"),
      origin: "Snippet",
      info: () => createSnippetPreviewElement(snippet)
    }));
  logCodeMirrorSnippetDebug("Snippet completion source prepared", {
    languageId,
    definitionCount,
    optionCount: completionOptions.length,
    labels: completionOptions.slice(0, 12).map((option) => option.label)
  });
  if (!completionOptions.length) return null;
  return (context) => {
    const word = context.matchBefore(/[\p{L}\p{N}_$-]+(?:\s+[\p{L}\p{N}_$-]+)*/u);
    const line = context.state.doc.lineAt(context.pos);
    const beforeCursor = line.text.slice(0, Math.max(0, context.pos - line.from));
    logCodeMirrorSnippetDebug("Snippet completion source invoked", {
      languageId,
      explicit: context.explicit === true,
      pos: context.pos,
      lineNumber: line.number,
      beforeCursor: beforeCursor.slice(-80),
      matchedText: word?.text || "",
      matchedFrom: word?.from ?? null,
      matchedTo: word?.to ?? null,
      optionCount: completionOptions.length
    });
    if (!context.explicit && !word) {
      logCodeMirrorSnippetDebug("Snippet completion source ignored implicit empty context", { languageId, pos: context.pos });
      return null;
    }
    const result = {
      from: word?.from ?? context.pos,
      options: completionOptions,
      validFor: /^[\p{L}\p{N}_$\s-]*$/u
    };
    logCodeMirrorSnippetDebug("Snippet completion source returned options", {
      languageId,
      from: result.from,
      optionCount: result.options.length,
      labels: result.options.slice(0, 12).map((option) => option.label)
    });
    logCodeMirrorCompletionDomState("snippet-source-returned-options");
    return result;
  };
}

const JAVASCRIPT_GLOBAL_COMPLETION_SCOPE = Object.freeze({
  Array,
  Boolean,
  Date,
  Error,
  JSON,
  Math,
  Map,
  Number,
  Object,
  Promise,
  RegExp,
  Set,
  String,
  Symbol,
  TypeError,
  URL: typeof URL !== "undefined" ? URL : {},
  URLSearchParams: typeof URLSearchParams !== "undefined" ? URLSearchParams : {},
  clearInterval,
  clearTimeout,
  console,
  document: typeof document !== "undefined" ? document : {},
  fetch: typeof fetch !== "undefined" ? fetch : function fetch() {},
  globalThis,
  localStorage: typeof localStorage !== "undefined" ? localStorage : {},
  requestAnimationFrame: typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : function requestAnimationFrame() {},
  sessionStorage: typeof sessionStorage !== "undefined" ? sessionStorage : {},
  setInterval,
  setTimeout,
  window: typeof window !== "undefined" ? window : {}
});

function logCodeMirrorLspDebug(message, details) {
  try {
    const logger = typeof window !== "undefined" ? window.markdownViewerAppDebugLog : null;
    if (typeof logger === "function") {
      void logger("debug", `[lsp] ${message}`, details);
      return;
    }
  } catch (_error) {
    // Debug logging must not affect editor behavior.
  }
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[lsp] ${message}`, details || "");
  }
}

function logCodeMirrorSnippetDebug(message, details) {
  try {
    const logger = typeof window !== "undefined" ? window.markdownViewerAppDebugLog : null;
    if (typeof logger === "function") {
      void logger("debug", `[snippets] ${message}`, details);
      return;
    }
  } catch (_error) {
    // Debug logging must not affect editor behavior.
  }
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[snippets] ${message}`, details || "");
  }
}

function createStaticCompletionSource(completions) {
  return completeFromList(completions.map((completion) => {
    const option = {
      label: completion.label,
      type: completion.type || "keyword",
      detail: completion.detail || ""
    };
    if (completion.apply) option.apply = completion.apply;
    return option;
  }));
}

function getHelmCompletionItems() {
  try {
    const provider = typeof window !== "undefined" ? window.markdownViewerHelmCompletionProvider : null;
    const items = typeof provider === "function" ? provider() : [];
    if (items && typeof items.then === "function") return items.then((resolved) => Array.isArray(resolved) ? resolved : []);
    return Array.isArray(items) ? items : [];
  } catch (_error) {
    return [];
  }
}

function getOpenHelmTemplateAction(state, pos) {
  const beforeCursor = state.sliceDoc(0, pos);
  const open = beforeCursor.lastIndexOf("{{");
  if (open < 0) return null;
  const close = beforeCursor.lastIndexOf("}}");
  if (close > open) return null;
  return { from: open + 2, text: beforeCursor.slice(open + 2) };
}

function toHelmCompletionOptions(items, predicate = () => true) {
  return items.filter(predicate).map((completion) => {
    const option = {
      label: String(completion.label || ""),
      type: String(completion.type || "variable"),
      detail: String(completion.detail || "Helm"),
      origin: String(completion.origin || "Language")
    };
    if (completion.info) option.info = String(completion.info);
    if (completion.apply) option.apply = String(completion.apply);
    return option;
  }).filter((completion) => completion.label);
}

function isHelmChartYamlCompletion(completion) {
  return String(completion?.detail || "") === "Helm Chart.yaml";
}

function isHelmTemplateCompletion(completion) {
  return !isHelmChartYamlCompletion(completion);
}
function createHelmCompletionResult(context, items, from) {
  const options = toHelmCompletionOptions(items, isHelmTemplateCompletion);
  if (!options.length) return null;
  return {
    from,
    options,
    validFor: /[\p{L}\p{N}_." -]*/u
  };
}

function createHelmChartYamlCompletionResult(context, items, from) {
  const options = toHelmCompletionOptions(items, isHelmChartYamlCompletion);
  if (!options.length) return null;
  return {
    from,
    options,
    validFor: /[\p{L}\p{N}_-]*/u
  };
}

function createHelmChartYamlCompletion(context) {
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = line.text.slice(0, context.pos - line.from);
  if (!/^\s*[\p{L}\p{N}_-]*$/u.test(beforeCursor)) return null;
  const word = context.matchBefore(/[\p{L}\p{N}_-]*$/u);
  if (!context.explicit && (!word || word.from === word.to)) return null;
  const items = getHelmCompletionItems();
  const from = word?.from ?? context.pos;
  if (items && typeof items.then === "function") return items.then((resolved) => createHelmChartYamlCompletionResult(context, resolved, from));
  return createHelmChartYamlCompletionResult(context, items, from);
}

function createHelmCompletionSource() {
  return (context) => {
    const action = getOpenHelmTemplateAction(context.state, context.pos);
    if (!action) return createHelmChartYamlCompletion(context);
    const word = context.matchBefore(/(?:\.Values[\p{L}\p{N}_.-]*|include\s+"[^"]*|[\p{L}\p{N}_.-]*)$/u);
    if (!context.explicit && (!word || word.from === word.to)) return null;
    const items = getHelmCompletionItems();
    const from = word?.from ?? context.pos;
    if (items && typeof items.then === "function") return items.then((resolved) => createHelmCompletionResult(context, resolved, from));
    return createHelmCompletionResult(context, items, from);
  };
}

const HELM_COMPLETION_SOURCE = createHelmCompletionSource();

function createDockerfileCompletionSource() {
  const source = createStaticCompletionSource(DOCKERFILE_COMPLETIONS);
  return (context) => {
    const word = context.matchBefore(/[\p{L}\p{N}_$-]+/u);
    logCodeMirrorLspDebug("Dockerfile fallback completion source invoked", {
      explicit: context.explicit === true,
      pos: context.pos,
      token: word?.text || "",
      from: word?.from ?? null,
      to: word?.to ?? null
    });
    const result = source(context);
    logCodeMirrorLspDebug("Dockerfile fallback completion source result", {
      returned: !!result,
      from: result?.from ?? null,
      to: result?.to ?? null,
      optionCount: Array.isArray(result?.options) ? result.options.length : 0,
      labels: Array.isArray(result?.options) ? result.options.slice(0, 8).map((option) => option.label) : []
    });
    return result;
  };
}

const SQL_KEYWORD_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "SELECT", type: "keyword", detail: "SQL query" }),
  Object.freeze({ label: "FROM", type: "keyword", detail: "SQL source table" }),
  Object.freeze({ label: "WHERE", type: "keyword", detail: "SQL filter" }),
  Object.freeze({ label: "JOIN", type: "keyword", detail: "SQL table join" }),
  Object.freeze({ label: "LEFT JOIN", type: "keyword", detail: "SQL left join", apply: "LEFT JOIN " }),
  Object.freeze({ label: "INNER JOIN", type: "keyword", detail: "SQL inner join", apply: "INNER JOIN " }),
  Object.freeze({ label: "GROUP BY", type: "keyword", detail: "SQL grouping", apply: "GROUP BY " }),
  Object.freeze({ label: "ORDER BY", type: "keyword", detail: "SQL sorting", apply: "ORDER BY " }),
  Object.freeze({ label: "HAVING", type: "keyword", detail: "SQL grouped filter" }),
  Object.freeze({ label: "LIMIT", type: "keyword", detail: "SQL row limit" }),
  Object.freeze({ label: "INSERT INTO", type: "keyword", detail: "SQL insert", apply: "INSERT INTO " }),
  Object.freeze({ label: "UPDATE", type: "keyword", detail: "SQL update" }),
  Object.freeze({ label: "DELETE FROM", type: "keyword", detail: "SQL delete", apply: "DELETE FROM " }),
  Object.freeze({ label: "CREATE TABLE", type: "keyword", detail: "SQL table creation", apply: "CREATE TABLE " }),
  Object.freeze({ label: "ALTER TABLE", type: "keyword", detail: "SQL table change", apply: "ALTER TABLE " }),
  Object.freeze({ label: "DROP TABLE", type: "keyword", detail: "SQL table removal", apply: "DROP TABLE " }),
  Object.freeze({ label: "UNION", type: "keyword", detail: "SQL set union" }),
  Object.freeze({ label: "WITH", type: "keyword", detail: "SQL common table expression" }),
  Object.freeze({ label: "CASE", type: "keyword", detail: "SQL conditional expression" })
]);

const SQL_FUNCTION_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "COUNT", type: "function", detail: "SQL aggregate" }),
  Object.freeze({ label: "SUM", type: "function", detail: "SQL aggregate" }),
  Object.freeze({ label: "AVG", type: "function", detail: "SQL aggregate" }),
  Object.freeze({ label: "MIN", type: "function", detail: "SQL aggregate" }),
  Object.freeze({ label: "MAX", type: "function", detail: "SQL aggregate" }),
  Object.freeze({ label: "COALESCE", type: "function", detail: "SQL null fallback" }),
  Object.freeze({ label: "NULLIF", type: "function", detail: "SQL null comparison" }),
  Object.freeze({ label: "CAST", type: "function", detail: "SQL type conversion" }),
  Object.freeze({ label: "LOWER", type: "function", detail: "SQL text function" }),
  Object.freeze({ label: "UPPER", type: "function", detail: "SQL text function" }),
  Object.freeze({ label: "SUBSTRING", type: "function", detail: "SQL text function" }),
  Object.freeze({ label: "ROUND", type: "function", detail: "SQL number function" }),
  Object.freeze({ label: "DATE_TRUNC", type: "function", detail: "SQL date function" }),
  Object.freeze({ label: "ROW_NUMBER", type: "function", detail: "SQL window function" }),
  Object.freeze({ label: "RANK", type: "function", detail: "SQL window function" })
]);

const SQL_SNIPPET_COMPLETIONS = Object.freeze([
  snippetCompletion("SELECT ${columns}\nFROM ${table}", { label: "SELECT FROM", type: "keyword", detail: "SQL select query" }),
  snippetCompletion("WITH ${name} AS (\n  SELECT ${columns}\n  FROM ${table}\n)\nSELECT *\nFROM ${name}", { label: "WITH CTE", type: "keyword", detail: "SQL common table expression" }),
  snippetCompletion("JOIN ${table} ON ${left_column} = ${right_column}", { label: "JOIN ON", type: "keyword", detail: "SQL join clause" }),
  snippetCompletion("CASE\n  WHEN ${condition} THEN ${value}\n  ELSE ${fallback}\nEND", { label: "CASE WHEN", type: "keyword", detail: "SQL case expression" }),
  snippetCompletion("CREATE TABLE ${table} (\n  ${column} ${type}\n)", { label: "CREATE TABLE", type: "keyword", detail: "SQL table creation" }),
  snippetCompletion("INSERT INTO ${table} (${columns})\nVALUES (${values})", { label: "INSERT INTO", type: "keyword", detail: "SQL insert row" })
]);

const SQL_RESERVED_WORDS = new Set([
  "ADD", "ALL", "ALTER", "AND", "AS", "ASC", "BY", "CASE", "CREATE", "DELETE", "DESC", "DISTINCT",
  "DROP", "ELSE", "END", "FROM", "GROUP", "HAVING", "IN", "INNER", "INSERT", "INTO", "IS", "JOIN",
  "LEFT", "LIKE", "LIMIT", "NOT", "NULL", "ON", "OR", "ORDER", "OUTER", "RIGHT", "SELECT", "SET",
  "TABLE", "THEN", "UNION", "UPDATE", "VALUES", "WHEN", "WHERE", "WITH"
]);

function isSqlIdentifierCandidate(value) {
  const label = String(value || "");
  return /^[A-Za-z_][\w$]*$/.test(label) && !SQL_RESERVED_WORDS.has(label.toUpperCase());
}

function addSqlDocumentCompletion(target, seen, label, type, detail, boost = 40) {
  if (!isSqlIdentifierCandidate(label) || seen.has(label.toLowerCase())) return;
  seen.add(label.toLowerCase());
  target.push({ label, type, detail, boost });
}

function collectSqlDocumentCompletions(source) {
  const text = String(source || "");
  const completions = [];
  const seen = new Set();
  let match;
  const tablePattern = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?)/gi;
  while ((match = tablePattern.exec(text)) !== null) {
    const tableName = match[1];
    addSqlDocumentCompletion(completions, seen, tableName, "class", "SQL table", 75);
    addSqlDocumentCompletion(completions, seen, tableName.split(".").pop(), "class", "SQL table", 74);
  }
  const aliasPattern = /\b(?:FROM|JOIN)\s+[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?\s+(?:AS\s+)?([A-Za-z_][\w$]*)/gi;
  while ((match = aliasPattern.exec(text)) !== null) addSqlDocumentCompletion(completions, seen, match[1], "namespace", "SQL alias", 70);
  const ctePattern = /\b(?:WITH|,)\s*([A-Za-z_][\w$]*)\s+AS\s*\(/gi;
  while ((match = ctePattern.exec(text)) !== null) addSqlDocumentCompletion(completions, seen, match[1], "class", "SQL CTE", 78);
  const aliasColumnPattern = /\bAS\s+([A-Za-z_][\w$]*)/gi;
  while ((match = aliasColumnPattern.exec(text)) !== null) addSqlDocumentCompletion(completions, seen, match[1], "property", "SQL alias", 62);
  const identifierPattern = /\b([A-Za-z_][\w$]*)\b/g;
  while ((match = identifierPattern.exec(text)) !== null && completions.length < 240) {
    addSqlDocumentCompletion(completions, seen, match[1], "property", "SQL document", 30);
  }
  return completions;
}

function getSqlCompletionKind(context, tokenText) {
  if (tokenText.includes(".")) return "member";
  const line = context.state.doc.lineAt(context.pos);
  const prefix = context.state.doc.sliceString(line.from, context.pos);
  const clauses = Array.from(prefix.matchAll(/\b(SELECT|FROM|JOIN|UPDATE|INTO|WHERE|GROUP\s+BY|ORDER\s+BY|ON|HAVING|AND|OR|SET)\b/gi));
  const clause = clauses.length ? clauses[clauses.length - 1][1].toUpperCase().replace(/\s+/g, " ") : "";
  if (["FROM", "JOIN", "UPDATE", "INTO"].includes(clause)) return "table";
  if (["SELECT", "WHERE", "GROUP BY", "ORDER BY", "ON", "HAVING", "AND", "OR", "SET"].includes(clause)) return "column";
  return "general";
}

function createSqlIntelligenceCompletionSource(context, settings = {}) {
  const token = context.matchBefore(/[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?/);
  if (!token && !context.explicit) return null;
  const tokenText = token?.text || "";
  const memberOffset = tokenText.lastIndexOf(".");
  const from = memberOffset >= 0 ? token.from + memberOffset + 1 : (token?.from ?? context.pos);
  const documentCompletions = settings.includeDocumentWords === true
    ? collectSqlDocumentCompletions(context.state.doc.toString())
    : [];
  const kind = getSqlCompletionKind(context, tokenText);
  let completionOptions = [];
  if (kind === "table") {
    completionOptions = documentCompletions.length
      ? documentCompletions.filter((option) => option.type === "class" || option.type === "namespace")
      : SQL_KEYWORD_COMPLETIONS;
  } else if (kind === "member" || kind === "column") {
    completionOptions = [
      ...documentCompletions.filter((option) => option.type === "property" || option.type === "namespace"),
      ...SQL_FUNCTION_COMPLETIONS
    ];
  } else {
    completionOptions = [
      ...SQL_KEYWORD_COMPLETIONS,
      ...SQL_FUNCTION_COMPLETIONS,
      ...SQL_SNIPPET_COMPLETIONS,
      ...documentCompletions
    ];
  }
  if (!completionOptions.length) return null;
  return {
    from,
    options: completionOptions,
    validFor: /^[A-Za-z_][\w$]*$/
  };
}

const LSP_CLIENT_CAPABILITIES = Object.freeze({
  workspace: Object.freeze({
    configuration: true,
    workspaceEdit: Object.freeze({
      documentChanges: true,
      resourceOperations: Object.freeze(["create", "rename", "delete"])
    })
  }),
  textDocument: Object.freeze({
    completion: Object.freeze({
      completionItem: Object.freeze({
        snippetSupport: true,
        resolveSupport: Object.freeze({
          properties: Object.freeze(["documentation", "detail", "additionalTextEdits", "insertText", "insertTextFormat", "textEdit"])
        })
      })
    }),
    codeAction: Object.freeze({
      dynamicRegistration: false,
      codeActionLiteralSupport: Object.freeze({
        codeActionKind: Object.freeze({
          valueSet: Object.freeze(["quickfix", "source.organizeImports"])
        })
      }),
      resolveSupport: Object.freeze({
        properties: Object.freeze(["edit", "command"])
      })
    }),
    publishDiagnostics: Object.freeze({
      relatedInformation: true,
      tagSupport: Object.freeze({
        valueSet: Object.freeze([1, 2])
      })
    })
  })
});

function installLspWorkspaceConfigurationHandler(client, configuration) {
  if (!client || client.__mdEditorWorkspaceConfigurationHandler) return;
  if (typeof client.receiveMessage !== "function") return;
  const originalReceiveMessage = client.receiveMessage.bind(client);
  function getConfigurationSection(section) {
    const sectionName = String(section || "");
    if (!sectionName) return configuration;
    if (Object.prototype.hasOwnProperty.call(configuration, sectionName)) return configuration[sectionName];
    const parts = sectionName.split(".").filter(Boolean);
    let current = configuration;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) {
        const keys = Object.keys(configuration);
        const onlyValue = keys.length === 1 ? configuration[keys[0]] : null;
        return onlyValue && typeof onlyValue === "object" ? {} : configuration;
      }
      current = current[part];
    }
    return current;
  }
  client.receiveMessage = (message) => {
    let value = null;
    try {
      value = JSON.parse(message);
    } catch (_) {
      return originalReceiveMessage(message);
    }
    if (value && value.id != null && value.method === "workspace/configuration") {
      const items = Array.isArray(value.params?.items) ? value.params.items : [];
      const result = items.map((item) => getConfigurationSection(item?.section));
      client.transport?.send?.(JSON.stringify({ jsonrpc: "2.0", id: value.id, result }));
      return;
    }
    if (value && value.id != null && value.method === "client/registerCapability") {
      client.transport?.send?.(JSON.stringify({ jsonrpc: "2.0", id: value.id, result: null }));
      return;
    }
    return originalReceiveMessage(message);
  };
  client.__mdEditorWorkspaceConfigurationHandler = true;
}

function configureLspWorkspace(client, configuration) {
  installLspWorkspaceConfigurationHandler(client, configuration);
  if (!configuration) return;
  client.initializing.then(() => {
    client.notification("workspace/didChangeConfiguration", { settings: configuration });
  }).catch(() => {});
}

const JDT_INITIALIZING_PHASES = new Set(["initializing", "importing"]);

function showCodeMirrorLspNotification(message) {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) return;
  const notification = window.markdownViewerApp?.services?.notify;
  if (typeof notification?.alert === "function") {
    void notification.alert({
      message: normalizedMessage,
      dedupeKey: `codemirror-lsp:${normalizedMessage}`
    });
    return;
  }
  window.alert?.(normalizedMessage);
}

function installCodeMirrorLspNotificationReporter() {
  if (LSPPlugin.prototype.__mdEditorAppNotificationReporter) return;
  LSPPlugin.prototype.reportError = function reportLspErrorInAppModal(message, error) {
    const title = this.view?.state?.phrase?.(message) || String(message || "Language server request failed");
    showCodeMirrorLspNotification(`${title}: ${error?.message || error}`);
  };
  Object.defineProperty(LSPPlugin.prototype, "__mdEditorAppNotificationReporter", { value: true });
}

function handleLspServerNotification(_client, params) {
  if (Number(params?.type || 0) > 3) return false;
  showCodeMirrorLspNotification(params?.message);
  return true;
}

function isJdtStillInitializing(plugin) {
  const documentUri = String(plugin?.uri || "").split(/[?#]/, 1)[0].toLowerCase();
  if (!documentUri.endsWith(".java")) return false;
  const phase = window.markdownViewerApp?.modules?.javaWorkspaceController?.getState?.()?.phase;
  return JDT_INITIALIZING_PHASES.has(String(phase || ""));
}

installCodeMirrorLspNotificationReporter();

const sharedLspClientsByTransport = new WeakMap();

/** Include Java workspace settings in JDT's initialize request before project import starts. */
function createLspInitializationTransport(session) {
  if (session.languageId !== "java" || !session.workspaceConfiguration) return session.transport;
  const transport = session.transport;
  return {
    getRequestTimeoutMs(method) {
      return transport.getRequestTimeoutMs?.(method) || 0;
    },
    send(message) {
      let outgoingMessage = message;
      try {
        const request = JSON.parse(message);
        if (request?.method === "initialize" && request.params && typeof request.params === "object") {
          request.params.initializationOptions = Object.assign(
            {},
            request.params.initializationOptions || {},
            Object.assign({}, session.initializationOptions || {}, { settings: session.workspaceConfiguration })
          );
          outgoingMessage = JSON.stringify(request);
        }
      } catch (_) {
        // Preserve non-JSON transport messages unchanged.
      }
      return transport.send(outgoingMessage);
    },
    subscribe(handler) {
      return transport.subscribe(handler);
    },
    unsubscribe(handler) {
      return transport.unsubscribe(handler);
    }
  };
}

/** Return the single initialized CodeMirror LSP client for a server transport. */
function getSharedLspClient(session) {
  const existingClient = sharedLspClientsByTransport.get(session.transport);
  if (existingClient) return existingClient;
  const client = new LSPClient({
    rootUri: session.rootUri || null,
    timeout: session.transport.getRequestTimeoutMs?.("textDocument/completion") || 3000,
    notificationHandlers: { "window/showMessage": handleLspServerNotification },
    extensions: [
      { clientCapabilities: LSP_CLIENT_CAPABILITIES },
      serverDiagnostics()
    ]
  });
  configureLspWorkspace(client, session.workspaceConfiguration);
  client.connect(createLspInitializationTransport(session));
  sharedLspClientsByTransport.set(session.transport, client);
  return client;
}

function getLspDefinitionTarget(response) {
  const location = Array.isArray(response) ? response[0] : response;
  if (!location) return null;
  const uri = location.targetUri || location.uri || "";
  const range = location.targetSelectionRange || location.targetRange || location.range || null;
  return uri && range?.start ? { uri, range } : null;
}

function normalizeLspFileUri(uri) {
  const value = String(uri || "");
  if (!value.toLowerCase().startsWith("file://")) return value;
  try {
    const decoded = decodeURIComponent(value).replace(/\\/g, "/");
    return decoded.replace(/^file:\/\/\/([A-Za-z]):\//, (_match, drive) => `file:///${drive.toLowerCase()}:/`);
  } catch (_error) {
    return value.replace(/\\/g, "/").toLowerCase();
  }
}

function isSameLspFileUri(left, right) {
  return normalizeLspFileUri(left) === normalizeLspFileUri(right);
}

function dispatchLspDefinitionTarget(plugin, mapping, target, targetView) {
  const mappedPosition = mapping.getMapping(target.uri)
    ? mapping.mapPosition(target.uri, target.range.start)
    : plugin.fromPosition(target.range.start, targetView.state.doc);
  if (typeof mappedPosition !== "number") return false;
  targetView.dispatch({ selection: { anchor: mappedPosition }, scrollIntoView: true, userEvent: "select.definition" });
  targetView.focus();
  return true;
}

function openExternalLspDefinitionTarget(view, target) {
  const opener = lspDefinitionOpeners.get(view);
  if (typeof opener !== "function") {
    console.info("[md-editor] LSP definition resolved outside the active editor, but no cross-file opener is registered.", { uri: target.uri });
    return Promise.resolve(false);
  }
  return Promise.resolve(opener({ uri: target.uri, range: target.range })).catch((error) => {
    console.warn("[md-editor] Failed to open cross-file LSP definition target.", error);
    return false;
  });
}

function goToLspDefinition(view) {
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability("definitionProvider") === false) return false;
  if (isJdtStillInitializing(plugin)) {
    showCodeMirrorLspNotification("JDT is still initializing, please try again later");
    return true;
  }
  const params = {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(view.state.selection.main.head)
  };
  plugin.client.sync();
  plugin.client.withMapping((mapping) => plugin.client.request("textDocument/definition", params).then((response) => {
    const target = getLspDefinitionTarget(response);
    if (!target) return;
    if (isSameLspFileUri(target.uri, plugin.uri)) {
      dispatchLspDefinitionTarget(plugin, mapping, { ...target, uri: plugin.uri }, view);
      return;
    }
    return plugin.client.workspace.displayFile(target.uri).then((targetView) => {
      if (targetView) {
        dispatchLspDefinitionTarget(plugin, mapping, target, targetView);
      } else {
        return openExternalLspDefinitionTarget(view, target);
      }
    });
  }, (error) => plugin.reportError("Find definition failed", error)));
  return true;
}

function lspSnippetToCodeMirrorSnippet(text) {
  return String(text || "").replace(/\\([$}\\])|\$(\d+)/g, (_match, escaped, field) => escaped || `\${${field}}`);
}

function getLspCompletionText(item) {
  return item?.textEdit?.newText || item?.textEditText || item?.insertText || item?.label || "";
}

function fromLspPositionChecked(doc, position) {
  if (!position || position.line < 0 || position.line >= doc.lines) return null;
  const line = doc.line(position.line + 1);
  if (position.character < 0 || position.character > line.length) return null;
  return line.from + position.character;
}

function getLspCompletionFallbackRange(context) {
  const match = context.matchBefore(/[\p{L}\p{N}_$!%~:\\.-]+/u);
  if (match) {
    const finalDotOffset = match.text.lastIndexOf(".");
    return finalDotOffset < 0
      ? match
      : { from: match.from + finalDotOffset + 1, to: match.to };
  }
  return context.state.wordAt(context.pos) || { from: context.pos, to: context.pos };
}

function getLspCompletionRange(context, result) {
  if (!result.items.length) return { from: context.pos, to: context.pos };
  const defaultRange = result.itemDefaults?.editRange;
  const firstItem = result.items[0];
  const range = defaultRange
    ? ("insert" in defaultRange ? defaultRange.insert : defaultRange)
    : firstItem.textEdit
      ? ("range" in firstItem.textEdit ? firstItem.textEdit.range : firstItem.textEdit.insert)
      : null;
  if (!range) return getLspCompletionFallbackRange(context);
  const line = context.state.doc.lineAt(context.pos);
  return { from: line.from + range.start.character, to: line.from + range.end.character };
}

function getLspCompletionType(kind) {
  switch (kind) {
    case 2:
      return "method";
    case 3:
      return "function";
    case 4:
    case 7:
      return "class";
    case 5:
    case 10:
      return "property";
    case 6:
      return "variable";
    case 8:
      return "interface";
    case 9:
      return "namespace";
    case 11:
    case 14:
      return "keyword";
    case 12:
    case 13:
    case 16:
    case 20:
    case 21:
      return "constant";
    case 25:
      return "type";
    default:
      return undefined;
  }
}

function applyResolvedLspCompletionItem(view, completion, from, to, item, itemDefaults) {
  const text = getLspCompletionText(item);
  const insertTextFormat = item?.insertTextFormat ?? itemDefaults?.insertTextFormat;
  if (insertTextFormat === 2) {
    snippet(lspSnippetToCodeMirrorSnippet(text))(view, completion, from, to);
    return;
  }
  const transactions = [insertCompletionText(view.state, text, from, to)];
  if (Array.isArray(item?.additionalTextEdits)) {
    const additionalChanges = [];
    for (const edit of item.additionalTextEdits) {
      const editFrom = fromLspPositionChecked(view.state.doc, edit.range?.start);
      const editTo = fromLspPositionChecked(view.state.doc, edit.range?.end);
      if (editFrom != null && editTo != null) additionalChanges.push({ from: editFrom, to: editTo, insert: edit.newText || "" });
    }
    if (additionalChanges.length) transactions.push({ changes: additionalChanges });
  }
  view.dispatch(...transactions);
}

function shouldResolveLspCompletionItem(plugin, item) {
  const resolveProvider = plugin.client.serverCapabilities?.completionProvider?.resolveProvider;
  return resolveProvider === true && (item?.kind === 2 || item?.kind === 3);
}

function createResolvingLspApply(plugin, item, itemDefaults) {
  return (view, completion, from, to) => {
    plugin.client.request("completionItem/resolve", item).then((resolvedItem) => {
      applyResolvedLspCompletionItem(view, completion, from, to, resolvedItem || item, itemDefaults);
    }, () => {
      applyResolvedLspCompletionItem(view, completion, from, to, item, itemDefaults);
    });
  };
}

function shouldTriggerLspCompletion(plugin, character, lspLanguageId = "") {
  const triggers = plugin.client.serverCapabilities?.completionProvider?.triggerCharacters;
  if (triggers && triggers.indexOf(character) > -1) return "triggerCharacter";
  if (lspLanguageId === "xml" && /[<\/\s="':]/.test(character)) return "triggerCharacter";
  if (/[\p{L}\p{N}_$!%~:\\\\."\[\]@-]/u.test(character)) return "identifier";
  return null;
}

function hasLspCompletionWordPrefix(context) {
  const word = context.matchBefore(/[\p{L}\p{N}_$-]+/u);
  return !!word && word.from < word.to;
}

/** Return whether a Java completion position is inside a parsed comment node. */
function isJavaCompletionPositionInComment(state, pos) {
  let node = syntaxTree(state).resolveInner(Math.max(0, pos - 1), -1);
  while (node) {
    if (node.name === "LineComment" || node.name === "BlockComment") return true;
    node = node.parent;
  }
  return false;
}

/** Suppress only Java dot completion inside comments, leaving existing triggers unchanged. */
function shouldSuppressJavaDotCompletion(state, pos, character, lspLanguageId) {
  return lspLanguageId === "java"
    && character === "."
    && isJavaCompletionPositionInComment(state, pos);
}

function getPreviousNonWhitespaceCharacter(doc, pos) {
  let index = pos - 1;
  while (index >= 0 && /\s/.test(doc.sliceString(index, index + 1))) index -= 1;
  return index >= 0 ? doc.sliceString(index, index + 1) : "";
}

function getLspParameterLabel(signature, parameter) {
  if (!signature || !parameter) return "";
  if (Array.isArray(parameter.label)) return signature.label.slice(parameter.label[0], parameter.label[1]);
  return String(parameter.label || "");
}

function getLspParameterName(label) {
  const normalized = String(label || "").trim().replace(/^\.\.\./, "");
  const match = normalized.match(/^([A-Za-z_$][\w$]*)\??\s*(?::|=|$)/);
  return match ? match[1] : "";
}

function getLspParameterCompletionOption(signatureHelpResult) {
  if (!signatureHelpResult?.signatures?.length) return null;
  const activeSignatureIndex = signatureHelpResult.activeSignature ?? 0;
  const signature = signatureHelpResult.signatures[activeSignatureIndex] || signatureHelpResult.signatures[0];
  const activeParameterIndex = signature?.activeParameter ?? signatureHelpResult.activeParameter;
  if (activeParameterIndex == null || !signature?.parameters?.[activeParameterIndex]) return null;
  const parameterLabel = getLspParameterLabel(signature, signature.parameters[activeParameterIndex]);
  const parameterName = getLspParameterName(parameterLabel);
  if (!parameterName) return null;
  return {
    label: parameterName,
    displayLabel: parameterName,
    type: "variable",
    detail: parameterLabel,
    boost: 100,
    apply: parameterName,
    origin: "LSP"
  };
}

function requestLspParameterCompletionOption(plugin, context) {
  if (plugin.client.hasCapability("signatureHelpProvider") === false) return Promise.resolve(null);
  const triggerCharacter = getPreviousNonWhitespaceCharacter(context.state.doc, context.pos);
  if (triggerCharacter !== "," && triggerCharacter !== "(") return Promise.resolve(null);
  const params = {
    position: plugin.toPosition(context.pos),
    textDocument: { uri: plugin.uri },
    context: {
      triggerKind: 2,
      triggerCharacter
    }
  };
  context.addEventListener?.("abort", () => plugin.client.cancelRequest(params));
  return plugin.client.request("textDocument/signatureHelp", params)
    .then(getLspParameterCompletionOption, () => null);
}

function resolvingServerCompletionSource(context, lspLanguageId = "") {
  const plugin = context.view && LSPPlugin.get(context.view);
  if (!plugin || plugin.client.hasCapability("completionProvider") === false) return null;
  const triggerChar = context.state.sliceDoc(context.pos - 1, context.pos);
  if (shouldSuppressJavaDotCompletion(context.state, context.pos, triggerChar, lspLanguageId)) return null;
  const triggerReason = context.explicit
    ? "invoked"
    : shouldTriggerLspCompletion(plugin, triggerChar, lspLanguageId) || (hasLspCompletionWordPrefix(context) ? "identifier" : null);
  if (!triggerReason) return null;
  logCodeMirrorLspDebug("LSP completion source requesting completions", {
    explicit: context.explicit === true,
    pos: context.pos,
    triggerChar,
    triggerReason,
    uri: plugin.uri,
    serverCapabilities: Object.keys(plugin.client.serverCapabilities || {})
  });
  const params = {
    position: plugin.toPosition(context.pos),
    textDocument: { uri: plugin.uri },
    context: triggerReason === "triggerCharacter"
      ? { triggerKind: 2, triggerCharacter: triggerChar }
      : { triggerKind: 1 }
  };
  plugin.client.sync();
  context.addEventListener?.("abort", () => plugin.client.cancelRequest(params));
  const parameterOptionPromise = requestLspParameterCompletionOption(plugin, context);
  return Promise.all([
    plugin.client.request("textDocument/completion", params),
    parameterOptionPromise
  ]).then(([result, parameterOption]) => {
    if (Array.isArray(result)) result = { items: result };
    const itemDefaults = result?.itemDefaults || {};
    const range = result?.items?.length ? getLspCompletionRange(context, result) : { from: context.pos, to: context.pos };
    const options = (result?.items || []).map((item) => {
      const text = getLspCompletionText(item);
      const option = {
        label: item.filterText || item.label,
        displayLabel: item.label,
        type: getLspCompletionType(item.kind),
        origin: "LSP"
      };
      if (item.detail) option.detail = item.detail;
      if (item.sortText) option.sortText = item.sortText;
      if (shouldResolveLspCompletionItem(plugin, item)) {
        option.apply = createResolvingLspApply(plugin, item, itemDefaults);
      } else if ((item.insertTextFormat ?? itemDefaults.insertTextFormat) === 2) {
        option.apply = (view, completion, from, to) => snippet(lspSnippetToCodeMirrorSnippet(text))(view, completion, from, to);
      } else if (option.label !== text) {
        option.apply = text;
      }
      return option;
    }).filter((option) => !parameterOption || option.label !== parameterOption.label);
    if (parameterOption) options.unshift(parameterOption);
    logCodeMirrorLspDebug("LSP completion source received completions", {
      explicit: context.explicit === true,
      rawItemCount: Array.isArray(result?.items) ? result.items.length : 0,
      optionCount: options.length,
      hasParameterOption: !!parameterOption,
      labels: options.slice(0, 8).map((option) => option.displayLabel || option.label)
    });
    if (!options.length) return null;
    return {
      ...range,
      options,
      validFor: result?.isIncomplete ? undefined : /^[\p{L}\p{N}_$!%~:\\\\.-]*$/u
    };
  }, (error) => {
    logCodeMirrorLspDebug("LSP completion source failed", {
      message: error?.message || String(error || ""),
      code: error?.code ?? null
    });
    if ("code" in error && error.code === -32800) return null;
    throw error;
  });
}

const NODE_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "process", type: "variable", detail: "Node.js global" }),
  Object.freeze({ label: "Buffer", type: "class", detail: "Node.js global" }),
  Object.freeze({ label: "__dirname", type: "variable", detail: "Node.js path global" }),
  Object.freeze({ label: "__filename", type: "variable", detail: "Node.js path global" }),
  Object.freeze({ label: "require", type: "function", detail: "Node.js CommonJS import" }),
  Object.freeze({ label: "module", type: "variable", detail: "Node.js CommonJS module" }),
  Object.freeze({ label: "exports", type: "variable", detail: "Node.js CommonJS exports" }),
  Object.freeze({ label: "fs", type: "namespace", detail: "Node.js file system" }),
  Object.freeze({ label: "path", type: "namespace", detail: "Node.js path utilities" }),
  Object.freeze({ label: "http", type: "namespace", detail: "Node.js HTTP module" }),
  Object.freeze({ label: "crypto", type: "namespace", detail: "Node.js crypto module" }),
  Object.freeze({ label: "events", type: "namespace", detail: "Node.js events module" }),
  Object.freeze({ label: "stream", type: "namespace", detail: "Node.js streams module" }),
  Object.freeze({ label: "console.log()", type: "function", detail: "JavaScript log line", apply: "console.log();" }),
  Object.freeze({ label: "process.env", type: "variable", detail: "Node.js environment" }),
  Object.freeze({ label: "const fs = require(\"fs\")", type: "keyword", detail: "Node.js CommonJS import", apply: "const fs = require(\"fs\");" }),
  Object.freeze({ label: "const path = require(\"path\")", type: "keyword", detail: "Node.js CommonJS import", apply: "const path = require(\"path\");" }),
  Object.freeze({ label: "import fs from \"node:fs\"", type: "keyword", detail: "Node.js ESM import", apply: "import fs from \"node:fs\";" }),
  Object.freeze({ label: "import path from \"node:path\"", type: "keyword", detail: "Node.js ESM import", apply: "import path from \"node:path\";" }),
  Object.freeze({ label: "await fs.promises.readFile()", type: "function", detail: "Node.js file read", apply: "await fs.promises.readFile();" }),
  Object.freeze({ label: "Array", type: "class", detail: "JavaScript built-in" }),
  Object.freeze({ label: "Object", type: "class", detail: "JavaScript built-in" }),
  Object.freeze({ label: "Promise", type: "class", detail: "JavaScript built-in" }),
  Object.freeze({ label: "Error", type: "class", detail: "JavaScript built-in" }),
  Object.freeze({ label: "Map", type: "class", detail: "JavaScript built-in" }),
  Object.freeze({ label: "Set", type: "class", detail: "JavaScript built-in" })
]);

const DOCKERFILE_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "FROM baseImage", type: "keyword", detail: "Dockerfile base image", apply: "FROM " }),
  Object.freeze({ label: "RUN", type: "keyword", detail: "Dockerfile build command" }),
  Object.freeze({ label: "CMD", type: "keyword", detail: "Dockerfile default command" }),
  Object.freeze({ label: "LABEL", type: "keyword", detail: "Dockerfile image metadata" }),
  Object.freeze({ label: "MAINTAINER", type: "keyword", detail: "Dockerfile maintainer metadata" }),
  Object.freeze({ label: "EXPOSE", type: "keyword", detail: "Dockerfile exposed port" }),
  Object.freeze({ label: "ENV", type: "keyword", detail: "Dockerfile environment variable" }),
  Object.freeze({ label: "ADD", type: "keyword", detail: "Dockerfile add files" }),
  Object.freeze({ label: "COPY", type: "keyword", detail: "Dockerfile copy files" }),
  Object.freeze({ label: "ENTRYPOINT", type: "keyword", detail: "Dockerfile entrypoint command" }),
  Object.freeze({ label: "VOLUME", type: "keyword", detail: "Dockerfile volume mount" }),
  Object.freeze({ label: "USER", type: "keyword", detail: "Dockerfile runtime user" }),
  Object.freeze({ label: "WORKDIR", type: "keyword", detail: "Dockerfile working directory" }),
  Object.freeze({ label: "ARG", type: "keyword", detail: "Dockerfile build argument" }),
  Object.freeze({ label: "ONBUILD", type: "keyword", detail: "Dockerfile build trigger" }),
  Object.freeze({ label: "STOPSIGNAL", type: "keyword", detail: "Dockerfile stop signal" }),
  Object.freeze({ label: "HEALTHCHECK", type: "keyword", detail: "Dockerfile health check" }),
  Object.freeze({ label: "SHELL", type: "keyword", detail: "Dockerfile default shell" })
]);

const JAVA_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "class", type: "keyword", detail: "Java declaration" }),
  Object.freeze({ label: "interface", type: "keyword", detail: "Java declaration" }),
  Object.freeze({ label: "enum", type: "keyword", detail: "Java declaration" }),
  Object.freeze({ label: "record", type: "keyword", detail: "Java declaration" }),
  Object.freeze({ label: "public", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "private", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "protected", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "static", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "final", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "abstract", type: "keyword", detail: "Java modifier" }),
  Object.freeze({ label: "void", type: "type", detail: "Java return type" }),
  Object.freeze({ label: "boolean", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "byte", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "short", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "int", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "long", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "float", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "double", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "char", type: "type", detail: "Java primitive" }),
  Object.freeze({ label: "String", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "Integer", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "Long", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "Double", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "Boolean", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "List", type: "class", detail: "java.util" }),
  Object.freeze({ label: "ArrayList", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Map", type: "class", detail: "java.util" }),
  Object.freeze({ label: "HashMap", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Set", type: "class", detail: "java.util" }),
  Object.freeze({ label: "HashSet", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Optional", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Scanner", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Arrays", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Collections", type: "class", detail: "java.util" }),
  Object.freeze({ label: "Stream", type: "class", detail: "java.util.stream" }),
  Object.freeze({ label: "System", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "Math", type: "class", detail: "java.lang" }),
  Object.freeze({ label: "LocalDate", type: "class", detail: "java.time" }),
  Object.freeze({ label: "LocalDateTime", type: "class", detail: "java.time" }),
  Object.freeze({ label: "System.out.println()", type: "function", detail: "Java print line", apply: "System.out.println();" }),
  Object.freeze({ label: "System.out.print()", type: "function", detail: "Java print", apply: "System.out.print();" }),
  Object.freeze({ label: "new Scanner(System.in)", type: "class", detail: "Java console scanner", apply: "new Scanner(System.in)" }),
  Object.freeze({ label: "java.util.Scanner", type: "class", detail: "Java import target", apply: "java.util.Scanner;" }),
  Object.freeze({ label: "import java.util.Scanner", type: "keyword", detail: "Java import", apply: "import java.util.Scanner;" }),
  Object.freeze({ label: "java.util.ArrayList", type: "class", detail: "Java import target", apply: "java.util.ArrayList;" }),
  Object.freeze({ label: "java.util.HashMap", type: "class", detail: "Java import target", apply: "java.util.HashMap;" }),
  Object.freeze({ label: "if", type: "keyword", detail: "Java control flow" }),
  Object.freeze({ label: "else", type: "keyword", detail: "Java control flow" }),
  Object.freeze({ label: "for", type: "keyword", detail: "Java control flow" }),
  Object.freeze({ label: "while", type: "keyword", detail: "Java control flow" }),
  Object.freeze({ label: "try", type: "keyword", detail: "Java exception handling" }),
  Object.freeze({ label: "catch", type: "keyword", detail: "Java exception handling" }),
  Object.freeze({ label: "return", type: "keyword", detail: "Java control flow" })
]);

const PYTHON_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "def", type: "keyword", detail: "Python function" }),
  Object.freeze({ label: "class", type: "keyword", detail: "Python declaration" }),
  Object.freeze({ label: "import", type: "keyword", detail: "Python import" }),
  Object.freeze({ label: "from", type: "keyword", detail: "Python import" }),
  Object.freeze({ label: "as", type: "keyword", detail: "Python alias" }),
  Object.freeze({ label: "if", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "elif", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "else", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "for", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "while", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "try", type: "keyword", detail: "Python exception handling" }),
  Object.freeze({ label: "except", type: "keyword", detail: "Python exception handling" }),
  Object.freeze({ label: "with", type: "keyword", detail: "Python context manager" }),
  Object.freeze({ label: "return", type: "keyword", detail: "Python control flow" }),
  Object.freeze({ label: "print", type: "function", detail: "Python built-in" }),
  Object.freeze({ label: "print()", type: "function", detail: "Python print line", apply: "print()" }),
  Object.freeze({ label: "input()", type: "function", detail: "Python input line", apply: "input()" }),
  Object.freeze({ label: "len", type: "function", detail: "Python built-in" }),
  Object.freeze({ label: "range", type: "function", detail: "Python built-in" }),
  Object.freeze({ label: "enumerate", type: "function", detail: "Python built-in" }),
  Object.freeze({ label: "str", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "int", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "float", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "bool", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "dict", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "list", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "tuple", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "set", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "open", type: "function", detail: "Python built-in" }),
  Object.freeze({ label: "Exception", type: "class", detail: "Python built-in" }),
  Object.freeze({ label: "os", type: "namespace", detail: "Python standard library" }),
  Object.freeze({ label: "sys", type: "namespace", detail: "Python standard library" }),
  Object.freeze({ label: "json", type: "namespace", detail: "Python standard library" }),
  Object.freeze({ label: "pathlib", type: "namespace", detail: "Python standard library" }),
  Object.freeze({ label: "datetime", type: "namespace", detail: "Python standard library" }),
  Object.freeze({ label: "Path", type: "class", detail: "pathlib" }),
  Object.freeze({ label: "import os", type: "keyword", detail: "Python import", apply: "import os" }),
  Object.freeze({ label: "import sys", type: "keyword", detail: "Python import", apply: "import sys" }),
  Object.freeze({ label: "import json", type: "keyword", detail: "Python import", apply: "import json" }),
  Object.freeze({ label: "from pathlib import Path", type: "keyword", detail: "Python import", apply: "from pathlib import Path" }),
  Object.freeze({ label: "from datetime import datetime", type: "keyword", detail: "Python import", apply: "from datetime import datetime" }),
  Object.freeze({ label: "import requests", type: "keyword", detail: "Popular Python package", apply: "import requests" }),
  Object.freeze({ label: "import numpy as np", type: "keyword", detail: "Popular Python package", apply: "import numpy as np" }),
  Object.freeze({ label: "import pandas as pd", type: "keyword", detail: "Popular Python package", apply: "import pandas as pd" }),
  Object.freeze({ label: "if __name__ == \"__main__\"", type: "keyword", detail: "Python entry point", apply: "if __name__ == \"__main__\":\n\t" })
]);

const CSHARP_COMPLETIONS = Object.freeze([
  Object.freeze({ label: "class", type: "keyword", detail: "C# declaration" }),
  Object.freeze({ label: "interface", type: "keyword", detail: "C# declaration" }),
  Object.freeze({ label: "enum", type: "keyword", detail: "C# declaration" }),
  Object.freeze({ label: "record", type: "keyword", detail: "C# declaration" }),
  Object.freeze({ label: "namespace", type: "keyword", detail: "C# declaration" }),
  Object.freeze({ label: "using", type: "keyword", detail: "C# import" }),
  Object.freeze({ label: "public", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "private", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "protected", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "internal", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "static", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "async", type: "keyword", detail: "C# modifier" }),
  Object.freeze({ label: "await", type: "keyword", detail: "C# asynchronous flow" }),
  Object.freeze({ label: "var", type: "keyword", detail: "C# implicit local type" }),
  Object.freeze({ label: "object", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "void", type: "type", detail: "C# return type" }),
  Object.freeze({ label: "string", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "int", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "bool", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "double", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "decimal", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "long", type: "type", detail: "C# built-in type" }),
  Object.freeze({ label: "List", type: "class", detail: "System.Collections.Generic" }),
  Object.freeze({ label: "List<string>", type: "class", detail: "System.Collections.Generic" }),
  Object.freeze({ label: "Dictionary", type: "class", detail: "System.Collections.Generic" }),
  Object.freeze({ label: "Dictionary<string, string>", type: "class", detail: "System.Collections.Generic" }),
  Object.freeze({ label: "Task", type: "class", detail: "System.Threading.Tasks" }),
  Object.freeze({ label: "DateTime", type: "class", detail: "System" }),
  Object.freeze({ label: "Guid", type: "class", detail: "System" }),
  Object.freeze({ label: "TimeSpan", type: "class", detail: "System" }),
  Object.freeze({ label: "Console", type: "class", detail: "System" }),
  Object.freeze({ label: "Math", type: "class", detail: "System" }),
  Object.freeze({ label: "IEnumerable", type: "interface", detail: "System.Collections.Generic" }),
  Object.freeze({ label: "Console.WriteLine()", type: "function", detail: "C# print line", apply: "Console.WriteLine();" }),
  Object.freeze({ label: "Console.ReadLine()", type: "function", detail: "C# console input", apply: "Console.ReadLine();" }),
  Object.freeze({ label: "using System", type: "keyword", detail: "C# using directive", apply: "using System;" }),
  Object.freeze({ label: "using System.Collections.Generic", type: "keyword", detail: "C# using directive", apply: "using System.Collections.Generic;" }),
  Object.freeze({ label: "using System.Linq", type: "keyword", detail: "C# using directive", apply: "using System.Linq;" }),
  Object.freeze({ label: "using System.Threading.Tasks", type: "keyword", detail: "C# using directive", apply: "using System.Threading.Tasks;" }),
  Object.freeze({ label: "if", type: "keyword", detail: "C# control flow" }),
  Object.freeze({ label: "else", type: "keyword", detail: "C# control flow" }),
  Object.freeze({ label: "foreach", type: "keyword", detail: "C# control flow" }),
  Object.freeze({ label: "return", type: "keyword", detail: "C# control flow" })
]);

const NODE_COMPLETION_SOURCE = createStaticCompletionSource(NODE_COMPLETIONS);
const DOCKERFILE_COMPLETION_SOURCE = createDockerfileCompletionSource();
const JAVA_COMPLETION_SOURCE = createStaticCompletionSource(JAVA_COMPLETIONS);
const PYTHON_COMPLETION_SOURCE = createStaticCompletionSource(PYTHON_COMPLETIONS);
const CSHARP_COMPLETION_SOURCE = createStaticCompletionSource(CSHARP_COMPLETIONS);

const BASH_HOVER_DESCRIPTIONS = Object.freeze({
  printf: "Bash builtin: format and print arguments using a format string.",
  echo: "Bash builtin: write arguments to standard output.",
  read: "Bash builtin: read a line from standard input into variables.",
  cd: "Bash builtin: change the current working directory.",
  pwd: "Bash builtin: print the current working directory.",
  test: "Bash builtin: evaluate a conditional expression.",
  source: "Bash builtin: read and execute commands from another file in the current shell.",
  alias: "Bash builtin: define or display command aliases.",
  export: "Bash builtin: mark variables or functions for child processes.",
  unset: "Bash builtin: remove variable or function definitions.",
  if: "Bash keyword: start a conditional command block.",
  then: "Bash keyword: start commands executed when an if condition succeeds.",
  else: "Bash keyword: start the fallback branch of a conditional block.",
  elif: "Bash keyword: add another conditional branch.",
  fi: "Bash keyword: end an if block.",
  for: "Bash keyword: loop over a list of words.",
  while: "Bash keyword: loop while a command succeeds.",
  until: "Bash keyword: loop until a command succeeds.",
  do: "Bash keyword: start the body of a loop.",
  done: "Bash keyword: end a loop.",
  case: "Bash keyword: match a word against patterns.",
  esac: "Bash keyword: end a case block.",
  function: "Bash keyword: define a shell function.",
  return: "Bash builtin: return from a shell function.",
  exit: "Bash builtin: exit the shell or script.",
  local: "Bash builtin: declare variables scoped to a function."
});

const SQL_HOVER_DESCRIPTIONS = Object.freeze({
  SELECT: "SQL keyword: choose columns or expressions for the result set.",
  FROM: "SQL keyword: name the table, view, CTE, or subquery to read from.",
  WHERE: "SQL keyword: filter rows before grouping or ordering.",
  JOIN: "SQL keyword: combine rows from another table or subquery.",
  LEFT: "SQL keyword: keep rows from the left side of a join.",
  INNER: "SQL keyword: keep only rows that match on both sides of a join.",
  ON: "SQL keyword: define a join condition.",
  GROUP: "SQL keyword: group rows for aggregate calculations.",
  ORDER: "SQL keyword: sort the result set.",
  BY: "SQL keyword: introduce grouping or sorting expressions.",
  HAVING: "SQL keyword: filter grouped rows after aggregation.",
  LIMIT: "SQL keyword: restrict the number of returned rows.",
  WITH: "SQL keyword: define common table expressions before the main query.",
  CASE: "SQL keyword: start a conditional expression.",
  WHEN: "SQL keyword: define a condition inside a CASE expression.",
  THEN: "SQL keyword: define the value returned by a CASE branch.",
  ELSE: "SQL keyword: define the fallback value in a CASE expression.",
  END: "SQL keyword: close a CASE expression.",
  INSERT: "SQL keyword: add rows to a table.",
  UPDATE: "SQL keyword: change existing rows in a table.",
  DELETE: "SQL keyword: remove rows from a table.",
  CREATE: "SQL keyword: create a database object.",
  TABLE: "SQL keyword: reference or create a table object.",
  COUNT: "SQL function: count rows or non-null values.",
  SUM: "SQL function: add numeric values.",
  AVG: "SQL function: calculate the average of numeric values.",
  MIN: "SQL function: return the smallest value.",
  MAX: "SQL function: return the largest value.",
  COALESCE: "SQL function: return the first non-null argument.",
  NULLIF: "SQL function: return null when two expressions are equal.",
  CAST: "SQL function: convert a value to another type.",
  LOWER: "SQL function: convert text to lowercase.",
  UPPER: "SQL function: convert text to uppercase.",
  SUBSTRING: "SQL function: extract part of a string.",
  ROUND: "SQL function: round a numeric value."
});

function createSimpleHoverInformationElement(className, label, description) {
  const dom = document.createElement("div");
  dom.className = className;
  const title = document.createElement("strong");
  title.textContent = label;
  const body = document.createElement("span");
  body.textContent = description;
  dom.append(title, body);
  return dom;
}

function getCssCustomPropertyHoverInformation(view, pos, languageId) {
  if (!isCssCustomPropertyLanguage(languageId)) return null;
  const property = findCssCustomPropertyAtPosition(view.state, pos);
  if (!property) return null;
  const definition = findCssCustomPropertyDefinition(view.state, property.name);
  return {
    from: property.from,
    to: property.to,
    provider: "css-custom-property",
    createDom: () => createCssCustomPropertyTooltip(property.name, definition)
  };
}

function getSimpleLanguageHoverInformation(view, pos, languageId) {
  const descriptions = languageId === "shell"
    ? BASH_HOVER_DESCRIPTIONS
    : languageId === "sql"
      ? SQL_HOVER_DESCRIPTIONS
      : null;
  if (!descriptions) return null;
  const word = view.state.wordAt(pos);
  if (!word || pos < word.from || pos > word.to) return null;
  const rawLabel = view.state.doc.sliceString(word.from, word.to);
  const label = languageId === "sql" ? rawLabel.toUpperCase() : rawLabel;
  const description = descriptions[label];
  if (!description) return null;
  return {
    from: word.from,
    to: word.to,
    provider: languageId,
    createDom: () => createSimpleHoverInformationElement(
      languageId === "sql" ? "cm-sqlHoverTooltip" : "cm-bashHoverTooltip",
      label,
      description
    )
  };
}

/** Return synchronous informational hover sections for the active editor language. */
function getLocalHoverInformation(view, pos, languageId) {
  return [
    getCssCustomPropertyHoverInformation(view, pos, languageId),
    getSimpleLanguageHoverInformation(view, pos, languageId)
  ].filter(Boolean);
}

function getLanguageCompletionSources(languageId) {
  switch (languageId) {
    case "javascript":
    case "typescript":
      return [scopeCompletionSource(JAVASCRIPT_GLOBAL_COMPLETION_SCOPE), localCompletionSource, NODE_COMPLETION_SOURCE];
    case "dockerfile":
      return [DOCKERFILE_COMPLETION_SOURCE];
    case "java":
      return [JAVA_COMPLETION_SOURCE];
    case "python":
      return [PYTHON_COMPLETION_SOURCE];
    case "csharp":
      return [CSHARP_COMPLETION_SOURCE];
    case "html":
      return [htmlCompletionSource];
    case "css":
    case "sass":
      return [cssCompletionSource];
    case "sql":
      return [keywordCompletionSource(StandardSQL)];
    case "yaml":
      return [HELM_COMPLETION_SOURCE];
    default:
      return [];
  }
}

function shouldUseDockerfileCompletionSource(languageId, lspLanguageId) {
  return languageId === "dockerfile" || lspLanguageId === "dockerfile";
}

/** Return whether completion is currently naming a Java member after a dot. */
function isJavaMemberCompletionContext(context, languageId) {
  return languageId === "java" && !!context.matchBefore(/\.[\p{L}\p{N}_$-]*$/u);
}

/** Keep non-semantic completion sources out of Java member-access results. */
function suppressJavaMemberFallback(source, languageId) {
  if (languageId !== "java") return source;
  return (context) => isJavaMemberCompletionContext(context, languageId) ? null : source(context);
}

function createAutocompleteExtension(languageId, preferences, documentWordCompletionSource, snippetDefinitions = [], lspLanguageId = "") {
  const normalizedPreferences = normalizeAutocompletePreferences(preferences);
  const sources = [];
  const sourceNames = [];
  if (normalizedPreferences.languageServer) sources.push((context) => resolvingServerCompletionSource(context, lspLanguageId));
  if (normalizedPreferences.languageServer) sourceNames.push("lsp");
  if (normalizedPreferences.languageServer && shouldUseDockerfileCompletionSource(languageId, lspLanguageId)) {
    sources.push(DOCKERFILE_COMPLETION_SOURCE);
    sourceNames.push("dockerfile-fallback");
  }
  if (normalizedPreferences.documentWords) {
    sources.push(suppressJavaMemberFallback(documentWordCompletionSource, languageId));
    sourceNames.push("document-words");
  }
  if (languageId === "sql") {
    sources.push((context) => createSqlIntelligenceCompletionSource(context, { includeDocumentWords: normalizedPreferences.documentWords === true }));
    sourceNames.push("sql-intelligence");
  }
  if (normalizedPreferences.language) {
    const languageSources = getLanguageCompletionSources(languageId);
    sources.push(...languageSources.map((source) => suppressJavaMemberFallback(source, languageId)));
    if (languageSources.length) sourceNames.push(`language:${languageId}`);
  }
  if (normalizedPreferences.snippets) {
    const snippetSource = getSnippetCompletionSource(languageId, snippetDefinitions);
    if (snippetSource) {
      sources.push(suppressJavaMemberFallback(snippetSource, languageId));
      sourceNames.push("snippets");
    }
  }
  logCodeMirrorSnippetDebug("Snippet autocomplete extension configured", {
    languageId,
    lspLanguageId,
    snippetAutocompleteEnabled: normalizedPreferences.snippets === true,
    snippetDefinitionCount: Array.isArray(snippetDefinitions) ? snippetDefinitions.length : 0,
    snippetSourceEnabled: sourceNames.includes("snippets"),
    sourceNames,
    sourceCount: sources.length
  });
  logCodeMirrorLspDebug("CodeMirror autocomplete extension configured", {
    languageId,
    lspLanguageId,
    preferences: normalizedPreferences,
    sourceNames,
    sourceCount: sources.length
  });
  return autocompletion({ override: sources, addToOptions: [COMPLETION_ORIGIN_PILL_OPTION] });
}

function createMermaidLintExtension(languageId) {
  return languageId === "markdown" ? linter(mermaidDiagnostics) : [];
}

let latestCodeMirrorEditorView = null;

function repositionOffscreenCodeMirrorAutocompleteTooltip(tooltip, reason) {
  if (!tooltip || !latestCodeMirrorEditorView) return;
  const rect = tooltip.getBoundingClientRect?.();
  if (!rect || (rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth)) return;
  const view = latestCodeMirrorEditorView;
  const selectionHead = view.state.selection.main.head;
  const cursorRect = view.coordsAtPos(selectionHead, 1) || view.coordsAtPos(Math.max(0, selectionHead - 1), -1) || view.dom.getBoundingClientRect();
  const tooltipWidth = Math.max(rect.width || tooltip.offsetWidth || 260, 260);
  const tooltipHeight = Math.max(rect.height || tooltip.offsetHeight || 80, 80);
  const viewportPadding = 8;
  const left = Math.min(Math.max(cursorRect.left, viewportPadding), Math.max(viewportPadding, window.innerWidth - tooltipWidth - viewportPadding));
  const belowTop = cursorRect.bottom + 4;
  const aboveTop = cursorRect.top - tooltipHeight - 4;
  const top = belowTop + tooltipHeight <= window.innerHeight - viewportPadding
    ? belowTop
    : Math.max(viewportPadding, aboveTop);
  tooltip.style.position = "fixed";
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.right = "auto";
  tooltip.style.bottom = "auto";
  tooltip.style.transform = "none";
  logCodeMirrorSnippetDebug("Completion tooltip repositioned", {
    reason,
    left: Math.round(left),
    top: Math.round(top),
    cursorRect: {
      left: Math.round(cursorRect.left),
      top: Math.round(cursorRect.top),
      right: Math.round(cursorRect.right),
      bottom: Math.round(cursorRect.bottom)
    }
  });
}

let codeMirrorCompletionTooltipRepositionFrame = 0;

function repositionCodeMirrorCompletionInfoTooltip(reason) {
  const doc = latestCodeMirrorEditorView?.dom?.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) return;
  const autocomplete = doc.querySelector(".cm-tooltip-autocomplete");
  const info = doc.querySelector(".cm-tooltip.cm-completionInfo");
  if (!autocomplete || !info) return;
  const autocompleteRect = autocomplete.getBoundingClientRect?.();
  const infoRect = info.getBoundingClientRect?.();
  if (!autocompleteRect || !infoRect) return;
  const viewportPadding = 8;
  const gap = 8;
  const infoWidth = Math.max(infoRect.width || info.offsetWidth || 320, 260);
  const infoHeight = Math.max(infoRect.height || info.offsetHeight || 120, 80);
  const rightLeft = autocompleteRect.right + gap;
  const leftLeft = autocompleteRect.left - infoWidth - gap;
  const hasRightRoom = rightLeft + infoWidth <= window.innerWidth - viewportPadding;
  const hasLeftRoom = leftLeft >= viewportPadding;
  const unclampedLeft = hasRightRoom || !hasLeftRoom ? rightLeft : leftLeft;
  const left = Math.min(Math.max(unclampedLeft, viewportPadding), Math.max(viewportPadding, window.innerWidth - infoWidth - viewportPadding));
  const top = Math.min(Math.max(autocompleteRect.top, viewportPadding), Math.max(viewportPadding, window.innerHeight - infoHeight - viewportPadding));
  info.style.position = "fixed";
  info.style.left = `${Math.round(left)}px`;
  info.style.top = `${Math.round(top)}px`;
  info.style.right = "auto";
  info.style.bottom = "auto";
  info.style.transform = "none";
  logCodeMirrorSnippetDebug("Completion info tooltip repositioned", {
    reason,
    side: hasRightRoom || !hasLeftRoom ? "right" : "left",
    left: Math.round(left),
    top: Math.round(top),
    autocompleteRect: {
      left: Math.round(autocompleteRect.left),
      top: Math.round(autocompleteRect.top),
      right: Math.round(autocompleteRect.right),
      bottom: Math.round(autocompleteRect.bottom)
    }
  });
}

function runCodeMirrorCompletionTooltipReposition(reason) {
  try {
    const doc = latestCodeMirrorEditorView?.dom?.ownerDocument || (typeof document !== "undefined" ? document : null);
    const autocomplete = doc?.querySelector?.(".cm-tooltip-autocomplete") || null;
    repositionOffscreenCodeMirrorAutocompleteTooltip(autocomplete, reason);
    repositionCodeMirrorCompletionInfoTooltip(reason);
  } catch (error) {
    logCodeMirrorSnippetDebug("Completion tooltip reposition failed", { reason, message: error?.message || String(error) });
  }
}

function scheduleCodeMirrorCompletionTooltipReposition(reason) {
  if (codeMirrorCompletionTooltipRepositionFrame) return;
  const scheduleFrame = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 16);
  codeMirrorCompletionTooltipRepositionFrame = scheduleFrame(() => {
    codeMirrorCompletionTooltipRepositionFrame = 0;
    runCodeMirrorCompletionTooltipReposition(reason);
    setTimeout(() => runCodeMirrorCompletionTooltipReposition(`${reason}-settled`), 80);
  });
}

function logCodeMirrorCompletionDomState(reason) {
  const logState = (delayMs) => {
    setTimeout(() => {
      try {
        const doc = typeof document !== "undefined" ? document : null;
        const tooltip = doc?.querySelector?.(".cm-tooltip-autocomplete") || null;
        scheduleCodeMirrorCompletionTooltipReposition(reason);
        const completionItems = tooltip ? Array.from(tooltip.querySelectorAll(".cm-completionLabel")) : [];
        const tooltipRect = tooltip?.getBoundingClientRect?.();
        const tooltipStyle = tooltip ? getComputedStyle(tooltip) : null;
        logCodeMirrorSnippetDebug("Completion DOM state", {
          reason,
          delayMs,
          tooltipExists: !!tooltip,
          completionDomCount: completionItems.length,
          labels: completionItems.slice(0, 12).map((item) => item.textContent || ""),
          activeElementClass: doc?.activeElement?.className || "",
          rect: tooltipRect ? {
            left: Math.round(tooltipRect.left),
            top: Math.round(tooltipRect.top),
            width: Math.round(tooltipRect.width),
            height: Math.round(tooltipRect.height),
            right: Math.round(tooltipRect.right),
            bottom: Math.round(tooltipRect.bottom)
          } : null,
          computed: tooltipStyle ? {
            zIndex: tooltipStyle.zIndex,
            display: tooltipStyle.display,
            visibility: tooltipStyle.visibility,
            opacity: tooltipStyle.opacity,
            position: tooltipStyle.position,
            pointerEvents: tooltipStyle.pointerEvents
          } : null
        });
      } catch (error) {
        logCodeMirrorSnippetDebug("Completion DOM state failed", { reason, message: error?.message || String(error) });
      }
    }, delayMs);
  };
  logState(0);
  logState(50);
  logState(200);
}

function logCodeMirrorCompletionUiState(view, reason) {
  const logState = (delayMs) => {
    setTimeout(() => {
      try {
        const doc = view.dom?.ownerDocument || document;
        const tooltip = doc.querySelector(".cm-tooltip-autocomplete");
        scheduleCodeMirrorCompletionTooltipReposition(reason);
        const completionItems = tooltip ? Array.from(tooltip.querySelectorAll(".cm-completionLabel")) : [];
        const tooltipRect = tooltip?.getBoundingClientRect?.();
        const tooltipStyle = tooltip ? getComputedStyle(tooltip) : null;
        logCodeMirrorSnippetDebug("Completion UI state", {
          reason,
          delayMs,
          languageId: view.state.facet(language)?.name || "",
          tooltipExists: !!tooltip,
          completionDomCount: completionItems.length,
          labels: completionItems.slice(0, 12).map((item) => item.textContent || ""),
          activeElementClass: doc.activeElement?.className || ""
        });
      } catch (error) {
        logCodeMirrorSnippetDebug("Completion UI state failed", { reason, message: error?.message || String(error) });
      }
    }, delayMs);
  };
  logState(0);
  logState(50);
  logState(200);
}

function startCompletionWithSnippetDebug(view) {
  logCodeMirrorSnippetDebug("Explicit completion command started", {
    languageId: view.state.facet(language)?.name || "",
    pos: view.state.selection.main.head
  });
  const result = startCompletion(view);
  logCodeMirrorCompletionUiState(view, "explicit-completion-command");
  return result;
}

function createEditor(options) {
  const parent = options.parent;
  const doc = options.doc || "";
  const languageCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const selectionMatchCompartment = new Compartment();
  const wordWrapCompartment = new Compartment();
  const indentGuideCompartment = new Compartment();
  const showSymbolsCompartment = new Compartment();
  const wrapSymbolCompartment = new Compartment();
  const autocompleteCompartment = new Compartment();
  const cssCustomPropertyCompartment = new Compartment();
  const mermaidLintCompartment = new Compartment();
  const lspCompartment = new Compartment();
  const unclosedBracketCompartment = new Compartment();
  let currentLanguageId = options.language || "markdown";
  let wordWrapEnabled = options.wordWrap === true;
  let unclosedBracketHighlightEnabled = options.unclosedBracketHighlightEnabled === true;
  let activeLspClient = null;
  let activeLspTransport = null;
  let activeLspFileUri = "";
  let activeLspLanguageId = "";
  let autocompletePreferences = normalizeAutocompletePreferences({
    documentWords: options.documentWordAutocompleteEnabled === true,
    language: options.languageAutocompleteEnabled === true,
    languageServer: options.languageServerAutocompleteEnabled === true,
    snippets: options.snippetAutocompleteEnabled === true
  });
  let snippetDefinitions = Array.isArray(options.snippetDefinitions) ? options.snippetDefinitions : [];
  let showSymbolOptions = normalizeShowSymbolOptions(options.showSymbols);
  const LARGE_DOCUMENT_WORD_COMPLETION_LINE_RADIUS = 500;
  function getDocumentWordCompletionText(context) {
    const doc = context.state.doc;
    if (!isLargeCodeMirrorDocument(doc)) return doc.toString();
    const cursorLine = doc.lineAt(context.pos);
    const firstLine = Math.max(1, cursorLine.number - LARGE_DOCUMENT_WORD_COMPLETION_LINE_RADIUS);
    const lastLine = Math.min(doc.lines, cursorLine.number + LARGE_DOCUMENT_WORD_COMPLETION_LINE_RADIUS);
    return context.state.sliceDoc(doc.line(firstLine).from, doc.line(lastLine).to);
  }
  function documentWordCompletionSource(context) {
    if (!autocompletePreferences.documentWords) return null;
    const word = context.matchBefore(/[\p{L}\p{N}_$-]+/u);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const query = word.text || "";
    const seen = new Set();
    const completionOptions = [];
    const source = getDocumentWordCompletionText(context);
    const wordPattern = /[\p{L}\p{N}_$-]{2,}/gu;
    let match;
    while ((match = wordPattern.exec(source)) !== null) {
      const label = match[0];
      if (label === query || seen.has(label)) continue;
      seen.add(label);
      completionOptions.push({ label, type: "text", detail: "document", origin: "Document" });
      if (completionOptions.length >= 200) break;
    }
    if (!completionOptions.length) return null;
    return {
      from: word.from,
      options: completionOptions,
      validFor: /^[\p{L}\p{N}_$-]*$/u
    };
  }
  function createCurrentAutocompleteExtension() {
    return createAutocompleteExtension(currentLanguageId, autocompletePreferences, documentWordCompletionSource, snippetDefinitions, activeLspLanguageId);
  }
  logCodeMirrorLspDebug("CodeMirror editor autocomplete state initialized", {
    languageId: currentLanguageId,
    lspLanguageId: activeLspLanguageId,
    preferences: autocompletePreferences
  });
  const updateListener = EditorView.updateListener.of((update) => {
    if (typeof options.onUpdate === "function") options.onUpdate(update);
  });
  const lspCompletionStarter = EditorView.updateListener.of((update) => {
    if (update.docChanged && activeLspClient) scheduleLspFoldingRangeRefresh(update.view);
    if (!update.docChanged || !autocompletePreferences.languageServer || !activeLspClient) return;
    if (!update.state.selection.main.empty) return;
    const pos = update.state.selection.main.head;
    const character = update.state.sliceDoc(Math.max(0, pos - 1), pos);
    const isIdentifierTrigger = /[\p{L}\p{N}_$-]/u.test(character);
    const isJavaDotTrigger = currentLanguageId === "java"
      && character === "."
      && !isJavaCompletionPositionInComment(update.state, pos);
    if (!isIdentifierTrigger && !isJavaDotTrigger) return;
    logCodeMirrorLspDebug("LSP completion starter requested CodeMirror completion", {
      languageId: currentLanguageId,
      lspLanguageId: activeLspLanguageId,
      pos,
      character
    });
    setTimeout(() => startCompletion(update.view), 0);
  });
  const unifiedHoverOptions = {
    hoverTime: 450,
    getEditorQuickFixSuggestions: options.getEditorQuickFixSuggestions,
    openEditorQuickFix: options.openEditorQuickFix
  };
  const openKeyboardUnifiedHover = createOpenKeyboardUnifiedHover(() => currentLanguageId, unifiedHoverOptions);
  const extensions = [
    lineNumbers(),
    findLineBookmarkExtension,
    aiGhostSuggestionExtension,
    highlightActiveLineGutter(),
    EditorState.allowMultipleSelections.of(true),
    history(),
    drawSelection({ drawRangeCursor: false }),
    dropCursor(),
    tooltips({ position: "fixed", parent: document.body }),
    foldGutter({ markerDOM: createFoldMarker, foldingChanged: (update) => update.docChanged || lspFoldingRangesChanged(update) }),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompleteCompartment.of(createCurrentAutocompleteExtension()),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    selectionMatchCompartment.of(createSelectionMatchExtension(options.selectionMatchCaseSensitive !== false)),
    linter(null, { tooltipFilter: () => null }),
    lintGutter(),
    createUnifiedEditorHoverTooltipExtension(() => currentLanguageId, unifiedHoverOptions),
    keyboardUnifiedHoverField,
    mermaidLintCompartment.of(createMermaidLintExtension(currentLanguageId)),
    syntaxHighlighting(editorHighlightStyle),
    indentGuideCompartment.of(showSymbolOptions.indentGuide === false ? [] : indentGuideExtension),
    showSymbolsCompartment.of(createShowSymbolsExtension(showSymbolOptions)),
    wrapSymbolCompartment.of(showSymbolOptions.wrapSymbol === false ? [] : wrapSymbolExtension),
    cssCustomPropertyCompartment.of(createCssCustomPropertyExtension(currentLanguageId)),
    lspGoToDefinitionMouseHandler,
    lspTooltipLinkClickHandler,
    lspDefinitionHoverExtension,
    lspFoldingRangeField,
    foldService.of(getLspFoldRange),
    lspCompartment.of([]),
    unclosedBracketCompartment.of(createUnclosedBracketExtension(unclosedBracketHighlightEnabled, currentLanguageId)),
    unclosedBracketTheme,
    lspCompletionStarter,
    keymap.of([
      { key: "F2", run: openKeyboardUnifiedHover, preventDefault: true },
      { key: "Escape", run: closeKeyboardUnifiedHover },
      indentWithTab,
      ...closeBracketsKeymap,
      { key: "Mod-i", run: indentSelection, preventDefault: true },
      { key: "Ctrl-Space", run: startCompletionWithSnippetDebug, preventDefault: true },
      { key: "Mod-Space", run: startCompletionWithSnippetDebug, preventDefault: true },
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      ...searchKeymap
    ]),
    languageCompartment.of(getLanguageExtension(options.language || "markdown")),
    editableCompartment.of(EditorView.editable.of(options.editable !== false)),
    wordWrapCompartment.of(wordWrapEnabled ? EditorView.lineWrapping : []),
    updateListener,
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": {
        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        fontSize: "14px",
        lineHeight: "1.5"
      },
      ".cm-content": { padding: "10px 10px 10px 0" },
      ".cm-line": { paddingLeft: "0" },
      ".cm-gutters": { backgroundColor: "var(--editor-gutter-bg)", color: "var(--editor-line-number-color)", border: "0" },
      ".cm-activeLineGutter": { color: "var(--editor-active-line-number-color)", backgroundColor: "var(--editor-current-line-bg)" },
      ".cm-foldGutter": {
        minWidth: "16px"
      },
      ".cm-foldGutter .cm-gutterElement": {
        padding: "0 2px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      ".cm-fold-marker": {
        position: "relative",
        width: "12px",
        height: "12px",
        display: "inline-block",
        color: "var(--editor-line-number-color)",
        cursor: "pointer",
        opacity: "0",
        transition: "opacity 140ms ease, color 140ms ease",
        transform: "translateY(1px)"
      },
      ".cm-fold-marker::before": {
        content: "''",
        position: "absolute",
        left: "3px",
        top: "2px",
        width: "6px",
        height: "6px",
        borderRight: "1.5px solid currentColor",
        borderBottom: "1.5px solid currentColor",
        transformOrigin: "50% 50%"
      },
      ".cm-fold-marker-open::before": {
        transform: "rotate(45deg)"
      },
      ".cm-fold-marker-closed": {
        opacity: "1"
      },
      ".cm-fold-marker-closed::before": {
        transform: "rotate(-45deg)"
      },
      ".cm-foldGutter:hover .cm-fold-marker": {
        opacity: "1"
      },
      ".cm-foldGutter .cm-gutterElement:hover .cm-fold-marker": {
        color: "var(--editor-active-line-number-color)"
      },
      ".cm-activeLine": { backgroundColor: "var(--editor-current-line-bg)" },
      ".cm-cursor": { borderLeftColor: "var(--accent-color)" },
      ".cm-selectionBackground": { backgroundColor: "var(--editor-current-selection-bg) !important" },
      ".cm-matchingBracket": {
        outline: "1px solid color-mix(in srgb, var(--accent-color) 48%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--accent-color) 10%, transparent)"
      },
      ".cm-nonmatchingBracket": {
        outline: "1px solid color-mix(in srgb, var(--editor-syntax-invalid) 48%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--editor-syntax-invalid) 10%, transparent)"
      },
      ".cm-line.cm-indent-guide-line": {
        backgroundImage: "repeating-linear-gradient(to right, var(--editor-indent-guide-color) 0 1px, transparent 1px 2ch)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "calc(var(--cm-indent-depth, 0) * 2ch) 100%"
      },
      ".cm-line.cm-indent-guide-active-block": {
        backgroundImage: [
          "linear-gradient(to right, transparent 0 var(--cm-active-indent-left, 0), var(--editor-active-indent-guide-color) var(--cm-active-indent-left, 0) calc(var(--cm-active-indent-left, 0) + 1px), transparent calc(var(--cm-active-indent-left, 0) + 1px))",
          "repeating-linear-gradient(to right, var(--editor-indent-guide-color) 0 1px, transparent 1px 2ch)"
        ].join(", "),
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundSize: "100% 100%, calc(var(--cm-indent-depth, 0) * 2ch) 100%"
      },
      ".cm-visible-symbol": {
        color: "var(--editor-syntax-muted)",
        opacity: "0.46",
        fontWeight: "400"
      },
      ".cm-visible-eol": {
        paddingLeft: "1px"
      },
      ".cm-wrap-symbol-layer": {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        zIndex: "4"
      },
      ".cm-visible-wrap": {
        position: "absolute",
        opacity: "0.42",
        padding: "0 1px",
        transform: "translateY(1px)"
      },
      ".cm-visible-control": {
        borderRadius: "3px",
        padding: "0 2px",
        backgroundColor: "color-mix(in srgb, var(--editor-syntax-muted) 7%, transparent)"
      },
      ".cm-bashHoverTooltip": {
        maxWidth: "min(520px, calc(100vw - 48px))",
        display: "grid",
        gap: "4px",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        lineHeight: "1.35"
      },
      ".cm-bashHoverTooltip strong": {
        color: "var(--editor-syntax-keyword)"
      },
      ".cm-lintRange-warning": {
        textDecorationLine: "underline",
        textDecorationStyle: "wavy",
        textDecorationColor: "#ff4d4f",
        textDecorationThickness: "1.5px",
        textUnderlineOffset: "3px"
      }
    })
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions })
  });
  if (typeof options.openLspDefinitionTarget === "function") {
    lspDefinitionOpeners.set(view, options.openLspDefinitionTarget);
  }
  findLineBookmarkViews.set(view.dom, view);
  activeFindLineBookmarkView = view;
  latestCodeMirrorEditorView = view;
  view.dom.addEventListener("focusin", () => { latestCodeMirrorEditorView = view; }, true);
  scheduleCodeMirrorCompletionTooltipReposition("editor-created");
  view.dom.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!isFindLineBookmarkContextMenuTarget(target)) return;
    showFindLineBookmarkContextMenu(view, event);
  }, true);
  ensureFindLineBookmarkDocumentContextMenu();

  return {
    view,
    setLanguage(languageId) {
      currentLanguageId = languageId || "text";
      logCodeMirrorLspDebug("CodeMirror language changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: [
          languageCompartment.reconfigure(getLanguageExtension(currentLanguageId)),
          cssCustomPropertyCompartment.reconfigure(createCssCustomPropertyExtension(currentLanguageId)),
          mermaidLintCompartment.reconfigure(createMermaidLintExtension(currentLanguageId)),
          autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension()),
          unclosedBracketCompartment.reconfigure(createUnclosedBracketExtension(unclosedBracketHighlightEnabled, currentLanguageId))
        ]
      });
    },
    setLspSession(session) {
      const hasSession = !!(session && session.transport && session.fileUri && session.languageId);
      if (hasSession
        && activeLspTransport === session.transport
        && activeLspFileUri === session.fileUri
        && activeLspLanguageId === session.languageId) {
        return true;
      }
      if (activeLspClient) clearLspFoldingRangeRefresh(view);
      activeLspClient = null;
      activeLspTransport = null;
      activeLspFileUri = "";
      activeLspLanguageId = "";
      if (!hasSession) {
        logCodeMirrorLspDebug("CodeMirror LSP session cleared", {
          languageId: currentLanguageId,
          preferences: autocompletePreferences
        });
        view.dispatch({
          effects: [
            lspCompartment.reconfigure([]),
            setLspFoldingRangesEffect.of([]),
            autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
          ]
        });
        return false;
      }
      activeLspClient = getSharedLspClient(session);
      activeLspTransport = session.transport;
      activeLspFileUri = session.fileUri;
      activeLspLanguageId = session.languageId;
      logCodeMirrorLspDebug("CodeMirror LSP session attached", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        fileUri: session.fileUri,
        rootUri: session.rootUri || null,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: [
          lspCompartment.reconfigure(activeLspClient.plugin(session.fileUri, session.languageId)),
          autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
        ]
      });
      scheduleLspFoldingRangeRefresh(view);
      return true;
    },
    getDocumentSymbols() {
      return requestLspDocumentSymbols(view);
    },
    getDiagnostics() {
      const diagnostics = [];
      forEachDiagnostic(view.state, (diagnostic, from, to) => {
        const startLine = view.state.doc.lineAt(from);
        const endLine = view.state.doc.lineAt(to);
        diagnostics.push({
          diagnostic,
          from,
          to,
          line: startLine.number,
          column: from - startLine.from + 1,
          endLine: endLine.number,
          endColumn: to - endLine.from + 1
        });
      });
      return diagnostics;
    },
    getSyntaxTree() {
      return ensureSyntaxTree(view.state, view.state.doc.length, 100) || syntaxTree(view.state);
    },
    setEditable(editable) {
      view.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(editable !== false)) });
    },
    setSelectionMatchCaseSensitive(caseSensitive) {
      view.dispatch({
        effects: selectionMatchCompartment.reconfigure(createSelectionMatchExtension(caseSensitive !== false))
      });
    },
    setWordWrap(enabled) {
      wordWrapEnabled = enabled === true;
      view.dispatch({ effects: wordWrapCompartment.reconfigure(wordWrapEnabled ? EditorView.lineWrapping : []) });
    },
    setShowSymbols(options) {
      showSymbolOptions = normalizeShowSymbolOptions(options);
      view.dispatch({
        effects: [
          indentGuideCompartment.reconfigure(showSymbolOptions.indentGuide === false ? [] : indentGuideExtension),
          showSymbolsCompartment.reconfigure(createShowSymbolsExtension(showSymbolOptions)),
          wrapSymbolCompartment.reconfigure(showSymbolOptions.wrapSymbol === false ? [] : wrapSymbolExtension)
        ]
      });
    },
    isWordWrapEnabled() {
      return wordWrapEnabled;
    },
    setDocumentWordAutocomplete(enabled) {
      autocompletePreferences = normalizeAutocompletePreferences({
        ...autocompletePreferences,
        documentWords: enabled === true
      });
      logCodeMirrorLspDebug("CodeMirror document word autocomplete preference changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    isDocumentWordAutocompleteEnabled() {
      return autocompletePreferences.documentWords;
    },
    setAutocompletePreferences(preferences) {
      autocompletePreferences = normalizeAutocompletePreferences(preferences);
      logCodeMirrorLspDebug("CodeMirror autocomplete preferences changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    setLanguageAutocomplete(enabled) {
      autocompletePreferences = normalizeAutocompletePreferences({
        ...autocompletePreferences,
        language: enabled === true
      });
      logCodeMirrorLspDebug("CodeMirror language autocomplete preference changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    isLanguageAutocompleteEnabled() {
      return autocompletePreferences.language;
    },
    setLanguageServerAutocomplete(enabled) {
      autocompletePreferences = normalizeAutocompletePreferences({
        ...autocompletePreferences,
        languageServer: enabled === true
      });
      logCodeMirrorLspDebug("CodeMirror language server autocomplete preference changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    isLanguageServerAutocompleteEnabled() {
      return autocompletePreferences.languageServer;
    },
    setSnippetAutocomplete(enabled) {
      autocompletePreferences = normalizeAutocompletePreferences({
        ...autocompletePreferences,
        snippets: enabled === true
      });
      logCodeMirrorLspDebug("CodeMirror snippet autocomplete preference changed", {
        languageId: currentLanguageId,
        lspLanguageId: activeLspLanguageId,
        preferences: autocompletePreferences
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    setSnippetDefinitions(definitions) {
      snippetDefinitions = Array.isArray(definitions) ? definitions : [];
      logCodeMirrorSnippetDebug("Snippet definitions refreshed", {
        languageId: currentLanguageId,
        definitionCount: snippetDefinitions.length,
        labels: snippetDefinitions.slice(0, 12).map((snippetDefinition) => snippetDefinition?.label || "")
      });
      view.dispatch({
        effects: autocompleteCompartment.reconfigure(createCurrentAutocompleteExtension())
      });
    },
    isSnippetAutocompleteEnabled() {
      return autocompletePreferences.snippets;
    },
    setValue(value) {
      const nextValue = String(value || "");
      const currentValue = view.state.doc.toString();
      if (nextValue === currentValue) return;
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: nextValue },
        effects: clearFindLineBookmarksEffect.of(null)
      });
    },
    setBookmarkedLines(lineNumbers) {
      view.dispatch({ effects: setFindLineBookmarksEffect.of(lineNumbers || []) });
      return true;
    },
    clearBookmarkedLines() {
      view.dispatch({ effects: clearFindLineBookmarksEffect.of(null) });
      return true;
    },
    clearBookmarkedLinesEffect() {
      return clearFindLineBookmarksEffect.of(null);
    },
    setAiGhostSuggestion(suggestion) {
      view.dispatch({ effects: setAiGhostSuggestionEffect.of(suggestion || null) });
      return true;
    },
    clearAiGhostSuggestion() {
      view.dispatch({ effects: clearAiGhostSuggestionEffect.of(null) });
      return true;
    },
    setUnclosedBracketHighlightEnabled(enabled) {
      unclosedBracketHighlightEnabled = enabled === true;
      view.dispatch({
        effects: unclosedBracketCompartment.reconfigure(createUnclosedBracketExtension(unclosedBracketHighlightEnabled, currentLanguageId))
      });
      return true;
    },
    /**
     * Close the innermost unmatched bracket the cursor currently sits inside (the one whose
     * opener has the largest index at or before the cursor), if any. Returns false — without
     * touching the document or the caller's event — when the feature is off or there's
     * nothing to fix, so callers can safely fall through to Tab's normal behavior.
     */
    fixNearestUnclosedBracket() {
      if (!unclosedBracketHighlightEnabled) return false;
      const cursor = view.state.selection.main.head;
      const unmatched = findUnmatchedBracketOpeners(view.state.doc.toString(), currentLanguageId);
      const candidate = unmatched
        .filter((opener) => opener.index <= cursor)
        .sort((a, b) => b.index - a.index)[0];
      if (!candidate) return false;
      const change = computeMissingCloserInsertion(view.state, candidate);
      view.dispatch({
        changes: change,
        selection: { anchor: change.from + change.insert.length },
        scrollIntoView: true
      });
      return true;
    },
    getValue() {
      return view.state.doc.toString();
    },
    setSelection(start, end) {
      const length = view.state.doc.length;
      const anchor = Math.max(0, Math.min(Number(start) || 0, length));
      const head = Math.max(0, Math.min(Number(end) || anchor, length));
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
    },
    getSelection() {
      const range = view.state.selection.main;
      return { start: Math.min(range.anchor, range.head), end: Math.max(range.anchor, range.head) };
    },
    destroy() {
      lspDefinitionOpeners.delete(view);
      if (activeLspClient) {
        clearLspFoldingRangeRefresh(view);
        activeLspClient = null;
      }
      view.destroy();
    }
  };
}

function createCompareEditorExtensions(languageId, onUpdate, extraExtensions = []) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    EditorState.allowMultipleSelections.of(true),
    history(),
    drawSelection({ drawRangeCursor: false }),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    syntaxHighlighting(editorHighlightStyle),
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap
    ]),
    getLanguageExtension(languageId || "text"),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (typeof onUpdate === "function") onUpdate(update);
    }),
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": {
        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        fontSize: "14px",
        lineHeight: "1.5"
      },
      ".cm-content": { padding: "10px 10px 10px 0" },
      ".cm-line": { paddingLeft: "0" },
      ".cm-gutters": { backgroundColor: "var(--editor-gutter-bg)", color: "var(--editor-line-number-color)", border: "0" },
      ".cm-activeLineGutter": { color: "var(--editor-active-line-number-color)", backgroundColor: "var(--editor-current-line-bg)" },
      ".cm-activeLine": { backgroundColor: "var(--editor-current-line-bg)" },
      ".cm-cursor": { borderLeftColor: "var(--accent-color)" },
      ".cm-selectionBackground": { backgroundColor: "var(--editor-current-selection-bg) !important" },
      ".cm-matchingBracket": {
        outline: "1px solid color-mix(in srgb, var(--accent-color) 48%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--accent-color) 10%, transparent)"
      }
    }),
    ...extraExtensions
  ];
}

function createModifiedLineHighlightExtension() {
  const modifiedLine = Decoration.line({ class: "cm-modifiedLine" });

  function buildModifiedLineDecorations(view) {
    const chunkInfo = getChunks(view.state);
    if (!chunkInfo?.side) return Decoration.none;
    const builder = new RangeSetBuilder();
    const isLeftSide = chunkInfo.side === "a";
    for (const chunk of chunkInfo.chunks) {
      const hasLeftText = chunk.fromA !== chunk.toA;
      const hasRightText = chunk.fromB !== chunk.toB;
      if (!hasLeftText || !hasRightText) continue;
      const from = isLeftSide ? chunk.fromA : chunk.fromB;
      const to = isLeftSide ? chunk.toA : chunk.toB;
      if (from === to) continue;
      const firstLine = view.state.doc.lineAt(from).number;
      const lastLine = view.state.doc.lineAt(Math.max(from, to - 1)).number;
      for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
        const line = view.state.doc.line(lineNumber);
        builder.add(line.from, line.from, modifiedLine);
      }
    }
    return builder.finish();
  }

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildModifiedLineDecorations(view);
    }

    update(update) {
      const previousChunks = getChunks(update.startState)?.chunks;
      const nextChunks = getChunks(update.state)?.chunks;
      if (update.docChanged || update.viewportChanged || previousChunks !== nextChunks) {
        this.decorations = buildModifiedLineDecorations(update.view);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

function getCompareViewForSide(compareEditor, side) {
  if (!compareEditor) return null;
  return side === "left" ? compareEditor.a : compareEditor.b;
}

function getActiveCompareSide(compareEditor) {
  if (compareEditor?.a?.hasFocus) return "left";
  if (compareEditor?.b?.hasFocus) return "right";
  return "right";
}

function getChunkForSidePosition(compareEditor, side, position) {
  const chunks = compareEditor?.chunks || [];
  if (!chunks.length) return null;
  const isLeft = side === "left";
  return chunks.find((chunk) => {
    const from = isLeft ? chunk.fromA : chunk.fromB;
    const to = isLeft ? chunk.endA : chunk.endB;
    return from <= position && to >= position;
  }) || chunks[0];
}

function applySideBySideChunk(compareEditor, direction) {
  if (!compareEditor?.chunks?.length) return false;
  const side = getActiveCompareSide(compareEditor);
  const activeView = getCompareViewForSide(compareEditor, side);
  const head = activeView?.state?.selection?.main?.head || 0;
  const chunk = getChunkForSidePosition(compareEditor, side, head);
  if (!chunk) return false;
  const leftToRight = direction !== "right-to-left";
  const source = leftToRight ? compareEditor.a : compareEditor.b;
  const destination = leftToRight ? compareEditor.b : compareEditor.a;
  const sourceFrom = leftToRight ? chunk.fromA : chunk.fromB;
  const sourceTo = leftToRight ? chunk.toA : chunk.toB;
  const destinationFrom = leftToRight ? chunk.fromB : chunk.fromA;
  const destinationTo = leftToRight ? chunk.toB : chunk.toA;
  let insert = source.state.sliceDoc(sourceFrom, Math.max(sourceFrom, sourceTo - 1));
  if (sourceFrom !== sourceTo && destinationTo <= destination.state.doc.length) {
    insert += source.state.lineBreak;
  }
  destination.dispatch({
    changes: {
      from: destinationFrom,
      to: Math.min(destination.state.doc.length, destinationTo),
      insert
    },
    userEvent: "merge.applyChunk"
  });
  return true;
}

function createMergeEditor(options) {
  const parent = options.parent;
  const languageId = options.language || "text";
  let mode = options.mode === "inline" ? "inline" : "side-by-side";
  let leftDoc = String(options.leftDoc || "");
  let rightDoc = String(options.rightDoc || "");
  let sideBySideView = null;
  let unifiedView = null;

  function notifyUpdate() {
    if (typeof options.onUpdate === "function") options.onUpdate();
  }

  function clearParent() {
    if (sideBySideView) {
      sideBySideView.destroy();
      sideBySideView = null;
    }
    if (unifiedView) {
      unifiedView.destroy();
      unifiedView = null;
    }
    if (parent) parent.textContent = "";
  }

  function renderSideBySide() {
    clearParent();
    sideBySideView = new MergeView({
      parent,
      a: {
        doc: leftDoc,
        extensions: createCompareEditorExtensions(languageId, notifyUpdate, [createModifiedLineHighlightExtension()])
      },
      b: {
        doc: rightDoc,
        extensions: createCompareEditorExtensions(languageId, notifyUpdate, [createModifiedLineHighlightExtension()])
      },
      highlightChanges: true,
      gutter: true,
      revertControls: "a-to-b",
      collapseUnchanged: { margin: 3, minSize: 8 },
      diffConfig: { scanLimit: 5000, timeout: 1000 }
    });
    notifyUpdate();
  }

  function renderUnified() {
    clearParent();
    unifiedView = new EditorView({
      parent,
      state: EditorState.create({
        doc: rightDoc,
        extensions: createCompareEditorExtensions(languageId, notifyUpdate, [
          unifiedMergeView({
            original: leftDoc,
            highlightChanges: true,
            gutter: true,
            allowInlineDiffs: true,
            mergeControls: true,
            collapseUnchanged: { margin: 3, minSize: 8 },
            diffConfig: { scanLimit: 5000, timeout: 1000 }
          })
        ])
      })
    });
    notifyUpdate();
  }

  function renderCurrentMode() {
    if (mode === "inline") renderUnified();
    else renderSideBySide();
  }

  function syncDocumentsFromActiveView() {
    if (sideBySideView) {
      leftDoc = sideBySideView.a.state.doc.toString();
      rightDoc = sideBySideView.b.state.doc.toString();
    } else if (unifiedView) {
      rightDoc = unifiedView.state.doc.toString();
    }
  }

  renderCurrentMode();

  return {
    setMode(nextMode) {
      syncDocumentsFromActiveView();
      mode = nextMode === "inline" ? "inline" : "side-by-side";
      renderCurrentMode();
    },
    getMode() {
      return mode;
    },
    getLeftValue() {
      syncDocumentsFromActiveView();
      return leftDoc;
    },
    getRightValue() {
      syncDocumentsFromActiveView();
      return rightDoc;
    },
    getDifferenceCount() {
      if (sideBySideView) return sideBySideView.chunks.length;
      if (unifiedView) return getChunks(unifiedView.state)?.chunks?.length || 0;
      return 0;
    },
    canSaveLeft() {
      return true;
    },
    canSaveRight() {
      return true;
    },
    goToNextDifference() {
      if (sideBySideView) return goToNextChunk(getCompareViewForSide(sideBySideView, getActiveCompareSide(sideBySideView)));
      if (unifiedView) return goToNextChunk(unifiedView);
      return false;
    },
    goToPreviousDifference() {
      if (sideBySideView) return goToPreviousChunk(getCompareViewForSide(sideBySideView, getActiveCompareSide(sideBySideView)));
      if (unifiedView) return goToPreviousChunk(unifiedView);
      return false;
    },
    applyCurrentChunk(direction) {
      if (sideBySideView) return applySideBySideChunk(sideBySideView, direction);
      if (unifiedView) return direction === "right-to-left" ? rejectChunk(unifiedView) : false;
      return false;
    },
    destroy() {
      clearParent();
    }
  };
}


/** Toggle block comments using the active language's CodeMirror comment tokens. */
function toggleBlockComment(target) {
  const state = target.state;
  if (state.readOnly) return false;
  const ranges = state.selection.ranges;
  const tokens = ranges.map(function(range) {
    const data = state.languageDataAt("commentTokens", range.from, 1);
    return data.length ? data[0]?.block : null;
  });
  if (!tokens.every(Boolean)) return false;
  const searchMargin = 50;
  function findComment(range, token) {
    const textBefore = state.sliceDoc(range.from - searchMargin, range.from);
    const textAfter = state.sliceDoc(range.to, range.to + searchMargin);
    const spaceBefore = /\s*$/.exec(textBefore)[0].length;
    const spaceAfter = /^\s*/.exec(textAfter)[0].length;
    const beforeOffset = textBefore.length - spaceBefore;
    if (textBefore.slice(beforeOffset - token.open.length, beforeOffset) === token.open
        && textAfter.slice(spaceAfter, spaceAfter + token.close.length) === token.close) {
      return { open: { pos: range.from - spaceBefore, margin: spaceBefore ? 1 : 0 }, close: { pos: range.to + spaceAfter, margin: spaceAfter ? 1 : 0 } };
    }
    const selectedText = state.sliceDoc(range.from, range.to);
    const startSpace = /^\s*/.exec(selectedText)[0].length;
    const endSpace = /\s*$/.exec(selectedText)[0].length;
    const endOffset = selectedText.length - endSpace - token.close.length;
    if (selectedText.slice(startSpace, startSpace + token.open.length) === token.open
        && selectedText.slice(endOffset, endOffset + token.close.length) === token.close) {
      return {
        open: { pos: range.from + startSpace + token.open.length, margin: /\s/.test(selectedText.charAt(startSpace + token.open.length)) ? 1 : 0 },
        close: { pos: range.to - endSpace - token.close.length, margin: /\s/.test(selectedText.charAt(endOffset - 1)) ? 1 : 0 }
      };
    }
    return null;
  }
  const comments = ranges.map(function(range, index) { return findComment(range, tokens[index]); });
  let changes;
  if (!comments.every(Boolean)) {
    changes = state.changes(ranges.flatMap(function(range, index) {
      return comments[index] ? [] : [{ from: range.from, insert: tokens[index].open + " " }, { from: range.to, insert: " " + tokens[index].close }];
    }));
  } else {
    const removals = [];
    comments.forEach(function(comment, index) {
      const token = tokens[index];
      removals.push(
        { from: comment.open.pos - token.open.length, to: comment.open.pos + comment.open.margin },
        { from: comment.close.pos - comment.close.margin, to: comment.close.pos + token.close.length }
      );
    });
    changes = state.changes(removals);
  }
  target.dispatch(state.update({ changes }));
  return true;
}
window.MarkdownViewerCodeMirror = {
  createEditor,
  createMergeEditor,
  canFormatCode,
  formatCode,
  formatCodeWithCursor,
  collapseTopLevelFolds,
  expandTopLevelFolds,
  createAutocompleteExtension,
  getSnippetCompletionSource,
  indentLess,
  indentMore,
  indentSelection,
  isolateHistory,
  redo,
  selectAll,
  startCompletion,
  createShowSymbolsExtension,
  createSelectionMatchExtension,
  getLanguageCompletionSources,
  toggleComment,
  toggleBlockComment,
  undo,
  getLanguageExtension
};



