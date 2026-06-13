import { EditorView } from "codemirror";
import { EditorState, Compartment, RangeSetBuilder } from "@codemirror/state";
import { Decoration, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection, ViewPlugin } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, foldEffect, foldable, foldedRanges, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting, StreamLanguage, unfoldEffect } from "@codemirror/language";
import { lintGutter, linter, lintKeymap } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { sql } from "@codemirror/lang-sql";
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

function getDefaultPlugin(module) {
  return module && module.default ? module.default : module;
}

const formatterConfigs = {
  markdown: { parser: "markdown", plugins: [prettierMarkdown] },
  javascript: { parser: "babel", plugins: [prettierBabel, prettierEstree] },
  nodejs: { parser: "babel", plugins: [prettierBabel, prettierEstree] },
  typescript: { parser: "typescript", plugins: [prettierTypescript, prettierEstree] },
  html: { parser: "html", plugins: [prettierHtml] },
  css: { parser: "css", plugins: [prettierPostcss] },
  sass: { parser: "scss", plugins: [prettierPostcss] },
  scss: { parser: "scss", plugins: [prettierPostcss] },
  less: { parser: "less", plugins: [prettierPostcss] },
  json: { parser: "json", plugins: [prettierBabel, prettierEstree] },
  yaml: { parser: "yaml", plugins: [prettierYaml] },
  xml: { parser: "xml", plugins: [getDefaultPlugin(prettierXml)] },
  maven: { parser: "xml", plugins: [getDefaultPlugin(prettierXml)] }
};

async function formatCode(source, languageId) {
  const config = formatterConfigs[languageId || ""];
  if (!config) {
    throw new Error("No formatter is registered for this file type.");
  }

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

function createEditor(options) {
  const parent = options.parent;
  const doc = options.doc || "";
  const languageCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const updateListener = EditorView.updateListener.of((update) => {
    if (typeof options.onUpdate === "function") options.onUpdate(update);
  });
  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    foldGutter({ markerDOM: createFoldMarker }),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lintGutter(),
    linter(mermaidDiagnostics),
    syntaxHighlighting(editorHighlightStyle),
    indentGuideExtension,
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      ...searchKeymap
    ]),
    languageCompartment.of(getLanguageExtension(options.language || "markdown")),
    editableCompartment.of(EditorView.editable.of(options.editable !== false)),
    updateListener,
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": {
        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        fontSize: "14px",
        lineHeight: "1.5"
      },
      ".cm-content": { padding: "10px 10px 10px 8px" },
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
      ".cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--accent-color) 18%, transparent) !important" },
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

  return {
    view,
    setLanguage(languageId) {
      view.dispatch({ effects: languageCompartment.reconfigure(getLanguageExtension(languageId || "text")) });
    },
    setEditable(editable) {
      view.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(editable !== false)) });
    },
    setValue(value) {
      const nextValue = String(value || "");
      const currentValue = view.state.doc.toString();
      if (nextValue === currentValue) return;
      view.dispatch({ changes: { from: 0, to: currentValue.length, insert: nextValue } });
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
    }
  };
}

window.MarkdownViewerCodeMirror = {
  createEditor,
  canFormatCode,
  formatCode,
  collapseTopLevelFolds,
  expandTopLevelFolds,
  getLanguageExtension
};
