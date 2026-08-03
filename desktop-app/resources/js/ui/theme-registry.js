(function(window) {
  "use strict";

  const MODE_LIGHT = "light";
  const MODE_DARK = "dark";
  const DEFAULT_SELECTIONS = Object.freeze({
    light: "default-light",
    dark: "default-dark"
  });

  const APP_THEME_TOKENS = Object.freeze([
    { key: "bg-color", label: "App background", alpha: false, group: "Surfaces" },
    { key: "editor-bg", label: "Editor background", alpha: false, group: "Surfaces" },
    { key: "preview-bg", label: "Preview background", alpha: false, group: "Surfaces" },
    { key: "lsp-tooltip-bg", label: "LSP tooltip background", alpha: false, group: "Tooltips" },
    { key: "header-bg", label: "Header background", alpha: false, group: "Surfaces" },
    { key: "panel-bg", label: "Panel background", alpha: false, group: "Surfaces" },
    { key: "toolbar-bg", label: "Toolbar background", alpha: false, group: "Surfaces" },
    { key: "button-bg", label: "Button background", alpha: false, group: "Controls" },
    { key: "button-hover", label: "Button hover", alpha: false, group: "Controls" },
    { key: "button-active", label: "Button active", alpha: false, group: "Controls" },
    { key: "hover-bg", label: "Row hover", alpha: false, group: "Controls" },
    { key: "input-bg", label: "Input background", alpha: false, group: "Controls" },
    { key: "tree-selection-bg", label: "Tree selection", alpha: false, group: "Controls" },
    { key: "text-color", label: "Primary text", alpha: false, group: "Text" },
    { key: "preview-text-color", label: "Preview text", alpha: false, group: "Text" },
    { key: "lsp-tooltip-text-color", label: "LSP tooltip text", alpha: false, group: "Tooltips" },
    { key: "lsp-tooltip-border-color", label: "LSP tooltip border", alpha: false, group: "Tooltips" },
    { key: "lsp-tooltip-link-color", label: "LSP tooltip link", alpha: false, group: "Tooltips" },
    { key: "lsp-tooltip-muted-text-color", label: "LSP tooltip muted text", alpha: false, group: "Tooltips" },
    { key: "lsp-tooltip-code-bg", label: "LSP tooltip code background", alpha: true, group: "Tooltips" },
    { key: "disabled-text-color", label: "Muted text", alpha: false, group: "Text" },
    { key: "secondary-text", label: "Secondary text", alpha: false, group: "Text" },
    { key: "link-color", label: "Link text", alpha: false, group: "Text" },
    { key: "border-color", label: "Borders", alpha: false, group: "Lines" },
    { key: "menu-separator-color", label: "Menu separator", alpha: false, group: "Lines" },
    { key: "scrollbar-thumb", label: "Scrollbar thumb", alpha: false, group: "Lines" },
    { key: "scrollbar-track", label: "Scrollbar track", alpha: false, group: "Lines" },
    { key: "accent-color", label: "Accent", alpha: false, group: "Status" },
    { key: "accent-text", label: "Accent text", alpha: false, group: "Status" },
    { key: "accent-contrast", label: "Accent contrast", alpha: false, group: "Status" },
    { key: "success-color", label: "Success", alpha: false, group: "Status" },
    { key: "error-color", label: "Error", alpha: false, group: "Status" },
    { key: "color-danger-fg", label: "Danger text", alpha: false, group: "Status" },
    { key: "table-bg", label: "Table background", alpha: false, group: "Content" },
    { key: "code-bg", label: "Code background", alpha: false, group: "Content" },
    { key: "ai-companion-prompt-bg", label: "companion-user-prompt-bg", alpha: false, group: "Content" },
    { key: "color-attention-subtle", label: "Attention background", alpha: true, group: "Content" },
    { key: "dropzone-bg", label: "Dropzone overlay", alpha: true, group: "Overlays" },
    { key: "editor-current-line-bg", label: "Current editor line", alpha: true, group: "Editor" },
    { key: "editor-indent-guide-color", label: "Indent guide", alpha: true, group: "Editor" },
    { key: "editor-active-indent-guide-color", label: "Active indent guide", alpha: true, group: "Editor" },
    { key: "editor-selection-match-bg", label: "Selection match background", alpha: true, group: "Editor" },
    { key: "editor-selection-match-text-color", label: "Selection match text", alpha: false, group: "Editor" },
    { key: "editor-current-selection-bg", label: "Current selection background", alpha: true, group: "Editor" },
    { key: "editor-current-selection-text-color", label: "Current selection text", alpha: false, group: "Editor" },
    { key: "editor-gutter-bg", label: "Editor gutter", alpha: false, group: "Editor" },
    { key: "editor-line-number-color", label: "Line numbers", alpha: false, group: "Editor" },
    { key: "editor-active-line-number-color", label: "Active line number", alpha: false, group: "Editor" },
    { key: "color-neutral-muted", label: "Neutral overlay", alpha: true, group: "Markdown Preview" },
    { key: "color-fg-default", label: "Preview fg", alpha: false, group: "Markdown Preview" },
    { key: "color-fg-muted", label: "Preview muted fg", alpha: false, group: "Markdown Preview" },
    { key: "color-fg-subtle", label: "Preview subtle fg", alpha: false, group: "Markdown Preview" },
    { key: "color-canvas-default", label: "Preview canvas", alpha: false, group: "Markdown Preview" },
    { key: "color-canvas-subtle", label: "Preview subtle canvas", alpha: false, group: "Markdown Preview" },
    { key: "color-border-default", label: "Preview border", alpha: false, group: "Markdown Preview" },
    { key: "color-border-muted", label: "Preview muted border", alpha: false, group: "Markdown Preview" },
    { key: "color-accent-fg", label: "Preview accent fg", alpha: false, group: "Markdown Preview" },
    { key: "color-accent-emphasis", label: "Preview accent emphasis", alpha: false, group: "Markdown Preview" }
  ]);

  const ALIASES = Object.freeze({
    "menu-separator-color": "border-color",
    "muted-text": "disabled-text-color",
    "text-muted": "disabled-text-color",
    "muted-text-color": "disabled-text-color",
    "text-secondary": "secondary-text",
    "color-danger-fg": "error-color",
    "color-accent-fg": "link-color",
    "color-accent-emphasis": "accent-color",
    "color-fg-default": "preview-text-color",
    "color-canvas-default": "preview-bg",
    "color-canvas-subtle": "code-bg",
    "color-border-default": "border-color"
  });

  function freezeTheme(theme) {
    return Object.freeze(Object.assign({}, theme, {
      colors: Object.freeze(Object.assign({}, theme.colors))
    }));
  }

  function withAliases(colors) {
    const next = Object.assign({}, colors);
    Object.entries(ALIASES).forEach(([alias, source]) => {
      if (!next[alias]) next[alias] = next[source];
    });
    return next;
  }

  const BUILTIN_THEMES = Object.freeze({
    light: Object.freeze([
      freezeTheme({
        id: "default-light",
        mode: MODE_LIGHT,
        name: "Default Light",
        source: "MD-Editor",
        colors: withAliases({
          "bg-color": "#ffffff",
          "editor-bg": "#fbfcff",
          "preview-bg": "#ffffff",
          "text-color": "#24292e",
          "preview-text-color": "#24292e",
          "lsp-tooltip-text-color": "#24292f",
          "lsp-tooltip-bg": "#ffffff",
          "lsp-tooltip-border-color": "#d0d7de",
          "lsp-tooltip-link-color": "#0969da",
          "lsp-tooltip-muted-text-color": "#57606a",
          "lsp-tooltip-code-bg": "rgba(175, 184, 193, 0.2)",
          "border-color": "#e1e4e8",
          "header-bg": "#f6f8fa",
          "panel-bg": "#ffffff",
          "toolbar-bg": "#f6f8fa",
          "button-bg": "#f6f8fa",
          "button-hover": "#e1e4e8",
          "button-active": "#d1d5da",
          "hover-bg": "#e1e4e8",
          "input-bg": "#ffffff",
          "tree-selection-bg": "#d1d5da",
          "dropzone-bg": "rgba(255, 255, 255, 0.8)",
          "scrollbar-thumb": "#c1c1c1",
          "scrollbar-track": "#f1f1f1",
          "accent-color": "#4b9ce7",
          "accent-text": "#4b9ce7",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#6e7781",
          "secondary-text": "#57606a",
          "link-color": "#4b9ce7",
          "success-color": "#22863a",
          "error-color": "#d73a49",
          "table-bg": "#ffffff",
          "code-bg": "#f6f8fa",
          "ai-companion-prompt-bg": "#f6f8fa",
          "editor-line-number-color": "#6e7781",
          "editor-active-line-number-color": "#24292f",
          "editor-current-line-bg": "rgba(220, 226, 235, 0.62)",
          "editor-indent-guide-color": "rgba(95, 111, 135, 0.28)",
          "editor-active-indent-guide-color": "rgba(75, 85, 184, 0.36)",
          "editor-selection-match-bg": "rgba(105, 189, 119, 0.55)",
          "editor-selection-match-text-color": "#24292e",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#24292e",
          "editor-gutter-bg": "#fbfcff",
          "color-fg-muted": "#586069",
          "color-fg-subtle": "#6a737d",
          "color-border-muted": "#eaecef",
          "color-neutral-muted": "rgba(175, 184, 193, 0.2)",
          "color-attention-subtle": "#fff5b1"
        })
      }),
      freezeTheme({
        id: "vscode-light",
        mode: MODE_LIGHT,
        name: "VS Code Light+",
        source: "VS Code",
        colors: withAliases({
          "bg-color": "#ffffff",
          "editor-bg": "#ffffff",
          "preview-bg": "#ffffff",
          "text-color": "#1f2328",
          "preview-text-color": "#1f2328",
          "lsp-tooltip-text-color": "#24292f",
          "lsp-tooltip-bg": "#ffffff",
          "lsp-tooltip-border-color": "#d0d7de",
          "lsp-tooltip-link-color": "#0969da",
          "lsp-tooltip-muted-text-color": "#57606a",
          "lsp-tooltip-code-bg": "rgba(175, 184, 193, 0.2)",
          "border-color": "#d0d7de",
          "header-bg": "#f3f3f3",
          "panel-bg": "#f8f8f8",
          "toolbar-bg": "#f3f3f3",
          "button-bg": "#f3f3f3",
          "button-hover": "#e8e8e8",
          "button-active": "#d4d4d4",
          "hover-bg": "#e8e8e8",
          "input-bg": "#ffffff",
          "tree-selection-bg": "#e4e6f1",
          "dropzone-bg": "rgba(255, 255, 255, 0.84)",
          "scrollbar-thumb": "#c8c8c8",
          "scrollbar-track": "#f1f1f1",
          "accent-color": "#007acc",
          "accent-text": "#005a9e",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#6f6f6f",
          "secondary-text": "#606060",
          "link-color": "#006ab1",
          "success-color": "#16825d",
          "error-color": "#c72e0f",
          "table-bg": "#ffffff",
          "code-bg": "#f3f3f3",
          "ai-companion-prompt-bg": "#f3f3f3",
          "editor-line-number-color": "#237893",
          "editor-active-line-number-color": "#0b216f",
          "editor-current-line-bg": "rgba(240, 240, 240, 0.82)",
          "editor-indent-guide-color": "rgba(196, 196, 196, 0.72)",
          "editor-active-indent-guide-color": "rgba(147, 147, 147, 0.72)",
          "editor-selection-match-bg": "rgba(234, 92, 0, 0.22)",
          "editor-selection-match-text-color": "#1f2328",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#1f2328",
          "editor-gutter-bg": "#ffffff",
          "color-fg-muted": "#57606a",
          "color-fg-subtle": "#6e7781",
          "color-border-muted": "#d8dee4",
          "color-neutral-muted": "rgba(175, 184, 193, 0.2)",
          "color-attention-subtle": "#fff8c5"
        })
      }),
      freezeTheme({
        id: "intellij-light",
        mode: MODE_LIGHT,
        name: "IntelliJ Light Mode",
        source: "JetBrains",
        colors: withAliases({
          "bg-color": "#f2f3f5",
          "editor-bg": "#ffffff",
          "preview-bg": "#ffffff",
          "text-color": "#1f2329",
          "preview-text-color": "#1f2329",
          "lsp-tooltip-text-color": "#1f2329",
          "lsp-tooltip-bg": "#f7f8fa",
          "lsp-tooltip-border-color": "#d1d2d3",
          "lsp-tooltip-link-color": "#2459b3",
          "lsp-tooltip-muted-text-color": "#818594",
          "lsp-tooltip-code-bg": "rgba(235, 236, 240, 1)",
          "border-color": "#d1d2d3",
          "header-bg": "#f2f3f5",
          "panel-bg": "#f7f8fa",
          "toolbar-bg": "#f2f3f5",
          "button-bg": "#f7f8fa",
          "button-hover": "#e9eaee",
          "button-active": "#dfe1e5",
          "hover-bg": "#e9eaee",
          "input-bg": "#ffffff",
          "tree-selection-bg": "#d4e2ff",
          "dropzone-bg": "rgba(255, 255, 255, 0.84)",
          "scrollbar-thumb": "#a8adbd",
          "scrollbar-track": "#f2f3f5",
          "accent-color": "#3574f0",
          "accent-text": "#2459b3",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#8c8f94",
          "secondary-text": "#5a5d63",
          "link-color": "#2459b3",
          "success-color": "#208a3c",
          "error-color": "#db3b4b",
          "table-bg": "#ffffff",
          "code-bg": "#f2f3f5",
          "ai-companion-prompt-bg": "#f2f3f5",
          "editor-line-number-color": "#8c8f94",
          "editor-active-line-number-color": "#1f2329",
          "editor-current-line-bg": "rgba(53, 116, 240, 0.08)",
          "editor-indent-guide-color": "rgba(31, 35, 41, 0.16)",
          "editor-active-indent-guide-color": "rgba(53, 116, 240, 0.4)",
          "editor-selection-match-bg": "rgba(53, 116, 240, 0.18)",
          "editor-selection-match-text-color": "#1f2329",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#1f2329",
          "editor-gutter-bg": "#ffffff",
          "color-fg-muted": "#5a5d63",
          "color-fg-subtle": "#8c8f94",
          "color-border-muted": "#dfe1e5",
          "color-neutral-muted": "rgba(31, 35, 41, 0.12)",
          "color-attention-subtle": "rgba(245, 166, 35, 0.2)"
        })
      }),
      freezeTheme({
        id: "solarized-light",
        mode: MODE_LIGHT,
        name: "Solarized Light",
        source: "Solarized",
        colors: withAliases({
          "bg-color": "#fdf6e3",
          "editor-bg": "#eee8d5",
          "preview-bg": "#fdf6e3",
          "text-color": "#586e75",
          "preview-text-color": "#586e75",
          "lsp-tooltip-text-color": "#24292f",
          "lsp-tooltip-bg": "#ffffff",
          "lsp-tooltip-border-color": "#d0d7de",
          "lsp-tooltip-link-color": "#0969da",
          "lsp-tooltip-muted-text-color": "#57606a",
          "lsp-tooltip-code-bg": "rgba(175, 184, 193, 0.2)",
          "border-color": "#d6ccad",
          "header-bg": "#eee8d5",
          "panel-bg": "#f7efd2",
          "toolbar-bg": "#eee8d5",
          "button-bg": "#eee8d5",
          "button-hover": "#e2d9bd",
          "button-active": "#d6ccad",
          "hover-bg": "#e2d9bd",
          "input-bg": "#fffaf0",
          "tree-selection-bg": "#d6ccad",
          "dropzone-bg": "rgba(253, 246, 227, 0.86)",
          "scrollbar-thumb": "#93a1a1",
          "scrollbar-track": "#eee8d5",
          "accent-color": "#268bd2",
          "accent-text": "#2075b2",
          "accent-contrast": "#fdf6e3",
          "disabled-text-color": "#839496",
          "secondary-text": "#657b83",
          "link-color": "#268bd2",
          "success-color": "#859900",
          "error-color": "#dc322f",
          "table-bg": "#fdf6e3",
          "code-bg": "#eee8d5",
          "ai-companion-prompt-bg": "#eee8d5",
          "editor-line-number-color": "#839496",
          "editor-active-line-number-color": "#586e75",
          "editor-current-line-bg": "rgba(238, 232, 213, 0.78)",
          "editor-indent-guide-color": "rgba(147, 161, 161, 0.35)",
          "editor-active-indent-guide-color": "rgba(38, 139, 210, 0.38)",
          "editor-selection-match-bg": "rgba(133, 153, 0, 0.24)",
          "editor-selection-match-text-color": "#586e75",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#586e75",
          "editor-gutter-bg": "#eee8d5",
          "color-fg-muted": "#657b83",
          "color-fg-subtle": "#839496",
          "color-border-muted": "#e2d9bd",
          "color-neutral-muted": "rgba(147, 161, 161, 0.23)",
          "color-attention-subtle": "rgba(181, 137, 0, 0.2)"
        })
      }),
      freezeTheme({
        id: "one-light",
        mode: MODE_LIGHT,
        name: "Atom One Light",
        source: "Atom",
        colors: withAliases({
          "bg-color": "#fafafa",
          "editor-bg": "#fafafa",
          "preview-bg": "#ffffff",
          "text-color": "#383a42",
          "preview-text-color": "#383a42",
          "lsp-tooltip-text-color": "#24292f",
          "lsp-tooltip-bg": "#ffffff",
          "lsp-tooltip-border-color": "#d0d7de",
          "lsp-tooltip-link-color": "#0969da",
          "lsp-tooltip-muted-text-color": "#57606a",
          "lsp-tooltip-code-bg": "rgba(175, 184, 193, 0.2)",
          "border-color": "#d7dae0",
          "header-bg": "#f0f0f0",
          "panel-bg": "#f4f4f4",
          "toolbar-bg": "#f0f0f0",
          "button-bg": "#f4f4f4",
          "button-hover": "#e8e8e8",
          "button-active": "#dbdbdc",
          "hover-bg": "#e8e8e8",
          "input-bg": "#ffffff",
          "tree-selection-bg": "#e5e5e6",
          "dropzone-bg": "rgba(250, 250, 250, 0.86)",
          "scrollbar-thumb": "#bababa",
          "scrollbar-track": "#eeeeee",
          "accent-color": "#4078f2",
          "accent-text": "#2c5ec4",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#696c77",
          "secondary-text": "#5c6370",
          "link-color": "#4078f2",
          "success-color": "#50a14f",
          "error-color": "#e45649",
          "table-bg": "#ffffff",
          "code-bg": "#f0f0f0",
          "ai-companion-prompt-bg": "#f0f0f0",
          "editor-line-number-color": "#9d9d9f",
          "editor-active-line-number-color": "#383a42",
          "editor-current-line-bg": "rgba(232, 232, 232, 0.8)",
          "editor-indent-guide-color": "rgba(157, 157, 159, 0.32)",
          "editor-active-indent-guide-color": "rgba(64, 120, 242, 0.34)",
          "editor-selection-match-bg": "rgba(80, 161, 79, 0.24)",
          "editor-selection-match-text-color": "#383a42",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#383a42",
          "editor-gutter-bg": "#fafafa",
          "color-fg-muted": "#5c6370",
          "color-fg-subtle": "#696c77",
          "color-border-muted": "#e5e5e6",
          "color-neutral-muted": "rgba(157, 157, 159, 0.22)",
          "color-attention-subtle": "rgba(193, 132, 1, 0.18)"
        })
      })
    ]),
    dark: Object.freeze([
      freezeTheme({
        id: "default-dark",
        mode: MODE_DARK,
        name: "Default Dark",
        source: "MD-Editor",
        colors: withAliases({
          "bg-color": "#0d1117",
          "editor-bg": "#1f2024",
          "preview-bg": "#0d1117",
          "text-color": "#c9d1d9",
          "preview-text-color": "#c9d1d9",
          "lsp-tooltip-text-color": "#c9d1d9",
          "lsp-tooltip-bg": "#161b22",
          "lsp-tooltip-border-color": "#30363d",
          "lsp-tooltip-link-color": "#9d82c9",
          "lsp-tooltip-muted-text-color": "#8b949e",
          "lsp-tooltip-code-bg": "rgba(110, 118, 129, 0.4)",
          "border-color": "#30363d",
          "menu-separator-color": "#3d444c",
          "header-bg": "#161b22",
          "panel-bg": "#161b22",
          "toolbar-bg": "#161b22",
          "button-bg": "#21262d",
          "button-hover": "#30363d",
          "button-active": "#3b434b",
          "hover-bg": "#30363d",
          "input-bg": "#1f2024",
          "tree-selection-bg": "#30363d",
          "dropzone-bg": "rgba(13, 17, 23, 0.8)",
          "scrollbar-thumb": "#484f58",
          "scrollbar-track": "#21262d",
          "accent-color": "#9c76cb",
          "accent-text": "#4b3d61",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#8b949e",
          "secondary-text": "#8b949e",
          "link-color": "#9d82c9",
          "success-color": "#3fb950",
          "error-color": "#f85149",
          "table-bg": "#161b22",
          "code-bg": "#161b22",
          "ai-companion-prompt-bg": "#2b3036",
          "editor-line-number-color": "#7d8590",
          "editor-active-line-number-color": "#ffffff",
          "editor-current-line-bg": "rgba(255, 255, 255, 0.055)",
          "editor-indent-guide-color": "rgba(180, 190, 205, 0.2)",
          "editor-active-indent-guide-color": "rgba(139, 182, 232, 0.34)",
          "editor-selection-match-bg": "rgba(139, 181, 128, 0.34)",
          "editor-selection-match-text-color": "#c9d1d9",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#1f2024",
          "color-fg-muted": "#8b949e",
          "color-fg-subtle": "#484f58",
          "color-border-muted": "#21262d",
          "color-neutral-muted": "rgba(110, 118, 129, 0.4)",
          "color-attention-subtle": "rgba(187, 128, 9, 0.15)"
        })
      }),
      freezeTheme({
        id: "vscode-dark",
        mode: MODE_DARK,
        name: "VS Code Dark+",
        source: "VS Code",
        colors: withAliases({
          "bg-color": "#1e1e1e",
          "editor-bg": "#1e1e1e",
          "preview-bg": "#1e1e1e",
          "text-color": "#d4d4d4",
          "preview-text-color": "#d4d4d4",
          "lsp-tooltip-text-color": "#d4d4d4",
          "lsp-tooltip-bg": "#252526",
          "lsp-tooltip-border-color": "#454545",
          "lsp-tooltip-link-color": "#3794ff",
          "lsp-tooltip-muted-text-color": "#a0a0a0",
          "lsp-tooltip-code-bg": "rgba(255, 255, 255, 0.12)",
          "border-color": "#3c3c3c",
          "header-bg": "#252526",
          "panel-bg": "#252526",
          "toolbar-bg": "#252526",
          "button-bg": "#333333",
          "button-hover": "#3e3e42",
          "button-active": "#094771",
          "hover-bg": "#2a2d2e",
          "input-bg": "#3c3c3c",
          "tree-selection-bg": "#37373d",
          "dropzone-bg": "rgba(30, 30, 30, 0.84)",
          "scrollbar-thumb": "#5a5a5a",
          "scrollbar-track": "#2d2d30",
          "accent-color": "#007acc",
          "accent-text": "#4fc1ff",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#858585",
          "secondary-text": "#cccccc",
          "link-color": "#3794ff",
          "success-color": "#89d185",
          "error-color": "#f48771",
          "table-bg": "#252526",
          "code-bg": "#252526",
          "ai-companion-prompt-bg": "#252526",
          "editor-line-number-color": "#858585",
          "editor-active-line-number-color": "#c6c6c6",
          "editor-current-line-bg": "rgba(255, 255, 255, 0.04)",
          "editor-indent-guide-color": "rgba(64, 64, 64, 0.72)",
          "editor-active-indent-guide-color": "rgba(112, 112, 112, 0.72)",
          "editor-selection-match-bg": "rgba(234, 92, 0, 0.28)",
          "editor-selection-match-text-color": "#d4d4d4",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#1e1e1e",
          "color-fg-muted": "#a0a0a0",
          "color-fg-subtle": "#858585",
          "color-border-muted": "#333333",
          "color-neutral-muted": "rgba(128, 128, 128, 0.28)",
          "color-attention-subtle": "rgba(156, 117, 31, 0.22)"
        })
      }),
      freezeTheme({
        id: "intellij-dark",
        mode: MODE_DARK,
        name: "IntelliJ Dark Mode",
        source: "JetBrains",
        colors: withAliases({
          "bg-color": "#2b2d30",
          "editor-bg": "#1e1f22",
          "preview-bg": "#1e1f22",
          "text-color": "#dfe1e5",
          "preview-text-color": "#dfe1e5",
          "lsp-tooltip-text-color": "#dfe1e5",
          "lsp-tooltip-bg": "#2b2d30",
          "lsp-tooltip-border-color": "#393b40",
          "lsp-tooltip-link-color": "#548af7",
          "lsp-tooltip-muted-text-color": "#9b9fa6",
          "lsp-tooltip-code-bg": "rgba(57, 59, 64, 1)",
          "border-color": "#393b40",
          "header-bg": "#2b2d30",
          "panel-bg": "#2b2d30",
          "toolbar-bg": "#2b2d30",
          "button-bg": "#393b40",
          "button-hover": "#43454a",
          "button-active": "#2e436e",
          "hover-bg": "#393b40",
          "input-bg": "#1e1f22",
          "tree-selection-bg": "#2e436e",
          "dropzone-bg": "rgba(30, 31, 34, 0.86)",
          "scrollbar-thumb": "#5a5d63",
          "scrollbar-track": "#2b2d30",
          "accent-color": "#3574f0",
          "accent-text": "#548af7",
          "accent-contrast": "#ffffff",
          "disabled-text-color": "#6f737a",
          "secondary-text": "#bcbec4",
          "link-color": "#548af7",
          "success-color": "#57965c",
          "error-color": "#db5c5c",
          "table-bg": "#2b2d30",
          "code-bg": "#2b2d30",
          "ai-companion-prompt-bg": "#2b2d30",
          "editor-line-number-color": "#6f737a",
          "editor-active-line-number-color": "#dfe1e5",
          "editor-current-line-bg": "rgba(53, 116, 240, 0.12)",
          "editor-indent-guide-color": "rgba(223, 225, 229, 0.16)",
          "editor-active-indent-guide-color": "rgba(84, 138, 247, 0.4)",
          "editor-selection-match-bg": "rgba(84, 138, 247, 0.22)",
          "editor-selection-match-text-color": "#dfe1e5",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#1e1f22",
          "color-fg-muted": "#bcbec4",
          "color-fg-subtle": "#6f737a",
          "color-border-muted": "#323438",
          "color-neutral-muted": "rgba(188, 190, 196, 0.18)",
          "color-attention-subtle": "rgba(245, 166, 35, 0.18)"
        })
      }),
      freezeTheme({
        id: "one-dark",
        mode: MODE_DARK,
        name: "Atom One Dark",
        source: "Atom",
        colors: withAliases({
          "bg-color": "#282c34",
          "editor-bg": "#282c34",
          "preview-bg": "#282c34",
          "text-color": "#abb2bf",
          "preview-text-color": "#abb2bf",
          "lsp-tooltip-text-color": "#abb2bf",
          "lsp-tooltip-bg": "#21252b",
          "lsp-tooltip-border-color": "#3e4451",
          "lsp-tooltip-link-color": "#61afef",
          "lsp-tooltip-muted-text-color": "#828997",
          "lsp-tooltip-code-bg": "rgba(255, 255, 255, 0.08)",
          "border-color": "#3e4451",
          "header-bg": "#21252b",
          "panel-bg": "#21252b",
          "toolbar-bg": "#21252b",
          "button-bg": "#2c313a",
          "button-hover": "#3a3f4b",
          "button-active": "#3e4451",
          "hover-bg": "#3a3f4b",
          "input-bg": "#1f2329",
          "tree-selection-bg": "#3e4451",
          "dropzone-bg": "rgba(40, 44, 52, 0.84)",
          "scrollbar-thumb": "#4b5263",
          "scrollbar-track": "#21252b",
          "accent-color": "#61afef",
          "accent-text": "#61afef",
          "accent-contrast": "#1f2329",
          "disabled-text-color": "#828997",
          "secondary-text": "#9da5b4",
          "link-color": "#61afef",
          "success-color": "#98c379",
          "error-color": "#e06c75",
          "table-bg": "#21252b",
          "code-bg": "#21252b",
          "ai-companion-prompt-bg": "#21252b",
          "editor-line-number-color": "#636d83",
          "editor-active-line-number-color": "#abb2bf",
          "editor-current-line-bg": "rgba(153, 187, 255, 0.05)",
          "editor-indent-guide-color": "rgba(171, 178, 191, 0.18)",
          "editor-active-indent-guide-color": "rgba(97, 175, 239, 0.36)",
          "editor-selection-match-bg": "rgba(152, 195, 121, 0.24)",
          "editor-selection-match-text-color": "#abb2bf",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#282c34",
          "color-fg-muted": "#9da5b4",
          "color-fg-subtle": "#828997",
          "color-border-muted": "#353b45",
          "color-neutral-muted": "rgba(130, 137, 151, 0.3)",
          "color-attention-subtle": "rgba(229, 192, 123, 0.2)"
        })
      }),
      freezeTheme({
        id: "dracula-dark",
        mode: MODE_DARK,
        name: "Dracula",
        source: "Dracula",
        colors: withAliases({
          "bg-color": "#282a36",
          "editor-bg": "#282a36",
          "preview-bg": "#282a36",
          "text-color": "#f8f8f2",
          "preview-text-color": "#f8f8f2",
          "lsp-tooltip-text-color": "#f8f8f2",
          "lsp-tooltip-bg": "#21222c",
          "lsp-tooltip-border-color": "#44475a",
          "lsp-tooltip-link-color": "#8be9fd",
          "lsp-tooltip-muted-text-color": "#a7abbe",
          "lsp-tooltip-code-bg": "rgba(255, 255, 255, 0.08)",
          "border-color": "#44475a",
          "header-bg": "#21222c",
          "panel-bg": "#21222c",
          "toolbar-bg": "#21222c",
          "button-bg": "#343746",
          "button-hover": "#44475a",
          "button-active": "#6272a4",
          "hover-bg": "#44475a",
          "input-bg": "#21222c",
          "tree-selection-bg": "#44475a",
          "dropzone-bg": "rgba(40, 42, 54, 0.84)",
          "scrollbar-thumb": "#6272a4",
          "scrollbar-track": "#21222c",
          "accent-color": "#bd93f9",
          "accent-text": "#bd93f9",
          "accent-contrast": "#282a36",
          "disabled-text-color": "#a7abbe",
          "secondary-text": "#c0c4d6",
          "link-color": "#8be9fd",
          "success-color": "#50fa7b",
          "error-color": "#ff5555",
          "table-bg": "#21222c",
          "code-bg": "#21222c",
          "ai-companion-prompt-bg": "#21222c",
          "editor-line-number-color": "#6272a4",
          "editor-active-line-number-color": "#f8f8f2",
          "editor-current-line-bg": "rgba(68, 71, 90, 0.48)",
          "editor-indent-guide-color": "rgba(98, 114, 164, 0.28)",
          "editor-active-indent-guide-color": "rgba(189, 147, 249, 0.38)",
          "editor-selection-match-bg": "rgba(80, 250, 123, 0.23)",
          "editor-selection-match-text-color": "#f8f8f2",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#282a36",
          "color-fg-muted": "#c0c4d6",
          "color-fg-subtle": "#a7abbe",
          "color-border-muted": "#343746",
          "color-neutral-muted": "rgba(98, 114, 164, 0.32)",
          "color-attention-subtle": "rgba(241, 250, 140, 0.18)"
        })
      }),
      freezeTheme({
        id: "solarized-dark",
        mode: MODE_DARK,
        name: "Solarized Dark",
        source: "Solarized",
        colors: withAliases({
          "bg-color": "#002b36",
          "editor-bg": "#073642",
          "preview-bg": "#002b36",
          "text-color": "#839496",
          "preview-text-color": "#839496",
          "lsp-tooltip-text-color": "#93a1a1",
          "lsp-tooltip-bg": "#073642",
          "lsp-tooltip-border-color": "#144652",
          "lsp-tooltip-link-color": "#268bd2",
          "lsp-tooltip-muted-text-color": "#657b83",
          "lsp-tooltip-code-bg": "rgba(255, 255, 255, 0.06)",
          "border-color": "#144652",
          "header-bg": "#073642",
          "panel-bg": "#073642",
          "toolbar-bg": "#073642",
          "button-bg": "#0b3c49",
          "button-hover": "#144652",
          "button-active": "#195160",
          "hover-bg": "#144652",
          "input-bg": "#002b36",
          "tree-selection-bg": "#144652",
          "dropzone-bg": "rgba(0, 43, 54, 0.86)",
          "scrollbar-thumb": "#586e75",
          "scrollbar-track": "#073642",
          "accent-color": "#268bd2",
          "accent-text": "#2aa6ff",
          "accent-contrast": "#002b36",
          "disabled-text-color": "#657b83",
          "secondary-text": "#93a1a1",
          "link-color": "#268bd2",
          "success-color": "#859900",
          "error-color": "#dc322f",
          "table-bg": "#073642",
          "code-bg": "#073642",
          "ai-companion-prompt-bg": "#144652",
          "editor-line-number-color": "#586e75",
          "editor-active-line-number-color": "#93a1a1",
          "editor-current-line-bg": "rgba(255, 255, 255, 0.045)",
          "editor-indent-guide-color": "rgba(147, 161, 161, 0.2)",
          "editor-active-indent-guide-color": "rgba(38, 139, 210, 0.36)",
          "editor-selection-match-bg": "rgba(133, 153, 0, 0.24)",
          "editor-selection-match-text-color": "#839496",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#073642",
          "color-fg-muted": "#93a1a1",
          "color-fg-subtle": "#657b83",
          "color-border-muted": "#0b3c49",
          "color-neutral-muted": "rgba(88, 110, 117, 0.3)",
          "color-attention-subtle": "rgba(181, 137, 0, 0.18)"
        })
      }),
      freezeTheme({
        id: "darcula-dark",
        mode: MODE_DARK,
        name: "Darcula",
        source: "JetBrains",
        colors: withAliases({
          "bg-color": "#2b2b2b",
          "editor-bg": "#2b2b2b",
          "preview-bg": "#2b2b2b",
          "text-color": "#bbbbbb",
          "preview-text-color": "#bbbbbb",
          "lsp-tooltip-text-color": "#bbbbbb",
          "lsp-tooltip-bg": "#3c3f41",
          "lsp-tooltip-border-color": "#555555",
          "lsp-tooltip-link-color": "#589df6",
          "lsp-tooltip-muted-text-color": "#8c8c8c",
          "lsp-tooltip-code-bg": "rgba(0, 0, 0, 0.25)",
          "border-color": "#3c3f41",
          "header-bg": "#3c3f41",
          "panel-bg": "#313335",
          "toolbar-bg": "#3c3f41",
          "button-bg": "#4c5052",
          "button-hover": "#5a5d5f",
          "button-active": "#365880",
          "hover-bg": "#4b4b4b",
          "input-bg": "#3c3f41",
          "tree-selection-bg": "#4b6eaf",
          "dropzone-bg": "rgba(43, 43, 43, 0.84)",
          "scrollbar-thumb": "#555555",
          "scrollbar-track": "#3c3f41",
          "accent-color": "#589df6",
          "accent-text": "#6aa8f7",
          "accent-contrast": "#1f2326",
          "disabled-text-color": "#8c8c8c",
          "secondary-text": "#a9b7c6",
          "link-color": "#6897bb",
          "success-color": "#6a8759",
          "error-color": "#bc3f3c",
          "table-bg": "#313335",
          "code-bg": "#313335",
          "ai-companion-prompt-bg": "#313335",
          "editor-line-number-color": "#606366",
          "editor-active-line-number-color": "#a9b7c6",
          "editor-current-line-bg": "rgba(50, 55, 59, 0.86)",
          "editor-indent-guide-color": "rgba(128, 128, 128, 0.24)",
          "editor-active-indent-guide-color": "rgba(88, 157, 246, 0.34)",
          "editor-selection-match-bg": "rgba(106, 135, 89, 0.28)",
          "editor-selection-match-text-color": "#bbbbbb",
          "editor-current-selection-bg": "rgba(255, 241, 118, 0.8)",
          "editor-current-selection-text-color": "#000000",
          "editor-gutter-bg": "#313335",
          "color-fg-muted": "#a9b7c6",
          "color-fg-subtle": "#8c8c8c",
          "color-border-muted": "#3c3f41",
          "color-neutral-muted": "rgba(128, 128, 128, 0.28)",
          "color-attention-subtle": "rgba(255, 198, 109, 0.18)"
        })
      })
    ])
  });

  function getMode(mode) {
    return mode === MODE_DARK ? MODE_DARK : MODE_LIGHT;
  }

  function getBuiltinThemes(mode) {
    return BUILTIN_THEMES[getMode(mode)];
  }

  function getDefaultThemeId(mode) {
    return DEFAULT_SELECTIONS[getMode(mode)];
  }

  function normalizeHexColor(value, fallback = "#000000") {
    const stringValue = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(stringValue)) return stringValue.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(stringValue)) {
      return ("#" + stringValue.slice(1).split("").map((part) => part + part).join("")).toLowerCase();
    }
    return fallback;
  }

  function rgbaToParts(value, fallback = "#000000", fallbackAlpha = 1) {
    const stringValue = String(value || "").trim();
    const rgbaMatch = stringValue.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i);
    if (rgbaMatch) {
      const channels = rgbaMatch.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel) || 0)));
      const alpha = rgbaMatch[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgbaMatch[4])));
      return {
        color: "#" + channels.map((channel) => channel.toString(16).padStart(2, "0")).join(""),
        alpha
      };
    }
    return {
      color: normalizeHexColor(stringValue, fallback),
      alpha: fallbackAlpha
    };
  }

  function toRgba(hexColor, alpha) {
    const hex = normalizeHexColor(hexColor);
    const opacity = Math.max(0, Math.min(1, Number(alpha)));
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Number.isFinite(opacity) ? Number(opacity.toFixed(3)) : 1})`;
  }

  function normalizeColorValue(value, token, fallback) {
    if (token.alpha) {
      const fallbackParts = rgbaToParts(fallback || "#000000");
      const parts = rgbaToParts(value, fallbackParts.color, fallbackParts.alpha);
      return toRgba(parts.color, parts.alpha);
    }
    return normalizeHexColor(value, normalizeHexColor(fallback || "#000000"));
  }

  function getThemeById(mode, themeId, customThemes) {
    const normalizedMode = getMode(mode);
    const builtIn = getBuiltinThemes(normalizedMode).find((theme) => theme.id === themeId);
    if (builtIn) return builtIn;
    const custom = normalizeCustomThemes(customThemes)[normalizedMode].find((theme) => theme.id === themeId);
    if (custom) return custom;
    return getBuiltinThemes(normalizedMode)[0];
  }

  function normalizeThemeColors(mode, colors) {
    const fallback = getBuiltinThemes(mode)[0].colors;
    const rawColors = colors && typeof colors === "object" && !Array.isArray(colors) ? colors : {};
    const next = {};
    APP_THEME_TOKENS.forEach((token) => {
      next[token.key] = normalizeColorValue(rawColors[token.key], token, fallback[token.key]);
    });
    return withAliases(next);
  }

  function normalizeCustomThemes(customThemes) {
    const source = customThemes && typeof customThemes === "object" && !Array.isArray(customThemes) ? customThemes : {};
    return [MODE_LIGHT, MODE_DARK].reduce((result, mode) => {
      const seen = new Set();
      result[mode] = (Array.isArray(source[mode]) ? source[mode] : [])
        .filter((theme) => theme && typeof theme === "object")
        .map((theme, index) => {
          const id = /^custom-[a-z0-9-]+$/i.test(String(theme.id || "")) ? String(theme.id) : `custom-${mode}-${Date.now()}-${index}`;
          if (seen.has(id)) return null;
          seen.add(id);
          return {
            id,
            mode,
            name: String(theme.name || "Custom Theme").trim().slice(0, 80) || "Custom Theme",
            baseThemeId: String(theme.baseThemeId || getDefaultThemeId(mode)),
            colors: normalizeThemeColors(mode, theme.colors),
            updatedAt: String(theme.updatedAt || new Date().toISOString())
          };
        })
        .filter(Boolean);
      return result;
    }, {});
  }

  function normalizeThemeSelections(selections, customThemes) {
    const source = selections && typeof selections === "object" && !Array.isArray(selections) ? selections : {};
    const normalizedCustomThemes = normalizeCustomThemes(customThemes);
    return [MODE_LIGHT, MODE_DARK].reduce((result, mode) => {
      const themeId = String(source[mode] || getDefaultThemeId(mode));
      result[mode] = getThemeById(mode, themeId, normalizedCustomThemes).id;
      return result;
    }, {});
  }

  function getSelectedTheme(mode, state = {}) {
    const customThemes = normalizeCustomThemes(state.customThemes);
    const selections = normalizeThemeSelections(state.themeSelections, customThemes);
    return getThemeById(mode, selections[getMode(mode)], customThemes);
  }

  function createCustomTheme(mode, name, baseThemeId, state = {}) {
    const normalizedMode = getMode(mode);
    const baseTheme = getThemeById(normalizedMode, baseThemeId || getDefaultThemeId(normalizedMode), state.customThemes);
    return {
      id: `custom-${normalizedMode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      mode: normalizedMode,
      name: String(name || "Custom Theme").trim().slice(0, 80) || "Custom Theme",
      baseThemeId: baseTheme.id,
      colors: normalizeThemeColors(normalizedMode, baseTheme.colors),
      updatedAt: new Date().toISOString()
    };
  }

  function applyThemeToElement(element, theme) {
    if (!element || !theme) return;
    if (typeof element.setAttribute === "function") element.setAttribute("data-app-theme-id", theme.id);
    const colors = normalizeThemeColors(theme.mode, theme.colors);
    Object.entries(colors).forEach(([key, value]) => {
      element.style.setProperty(`--${key}`, value);
    });
  }

  function applyThemeFromState(element, state = {}) {
    const mode = getMode(state.theme);
    applyThemeToElement(element, getSelectedTheme(mode, state));
  }

  window.markdownViewerThemeRegistry = {
    APP_THEME_TOKENS,
    BUILTIN_THEMES,
    DEFAULT_SELECTIONS,
    createCustomTheme,
    getBuiltinThemes,
    getDefaultThemeId,
    getMode,
    getSelectedTheme,
    getThemeById,
    normalizeColorValue,
    normalizeCustomThemes,
    normalizeHexColor,
    normalizeThemeColors,
    normalizeThemeSelections,
    rgbaToParts,
    toRgba,
    applyThemeFromState,
    applyThemeToElement
  };
})(window);
