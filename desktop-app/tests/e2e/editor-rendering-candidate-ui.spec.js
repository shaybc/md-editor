const { expect, test } = require("./desktop-fixture");
const {
  stubBrowserLibraries,
  openApp,
  clickEditorFormatButton,
  selectSettingsTab,
} = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});
test("supports Alt drag rectangular selections in CodeMirror", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.codeMirrorEditor?.getView?.());
  await expect(page.locator(".codemirror-editor .cm-content")).toBeVisible();
  await page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: ["alpha one", "bravo two", "charlie three"].join("\n")
      }
    });
  });

  const editorContent = page.locator(".codemirror-editor .cm-content");
  await editorContent.focus();

  await page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    const start = view.coordsAtPos(1);
    const end = view.coordsAtPos(25);
    const startX = start.left + 1;
    const startY = (start.top + start.bottom) / 2;
    const endX = end.left + 1;
    const endY = (end.top + end.bottom) / 2;
    const eventOptions = {
      altKey: true,
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      view: window
    };
    view.contentDOM.dispatchEvent(new MouseEvent("mousedown", {
      ...eventOptions,
      clientX: startX,
      clientY: startY
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      ...eventOptions,
      clientX: endX,
      clientY: endY
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      ...eventOptions,
      buttons: 0,
      clientX: endX,
      clientY: endY
    }));
  });

  await expect.poll(() => page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    return view.state.selection.ranges.map((range) => view.state.sliceDoc(range.from, range.to));
  })).toEqual(["lpha", "ravo", "harl"]);
});

test("renders typed markdown in the preview", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill("# Project Notes\n\n- Alpha\n- Beta\n\n```js\nconsole.log('ok');\n```");

  const preview = page.locator("#markdown-preview");
  await expect(preview.getByRole("heading", { name: "Project Notes" })).toBeVisible();
  await expect(preview.locator("li", { hasText: "Alpha" })).toBeVisible();
  await expect(preview.locator("code", { hasText: "console.log" })).toBeVisible();
  await expect(preview.locator("code.hljs.js", { hasText: "console.log" })).toBeVisible();
});

test("renders title-prefixed frontmatter as a preview table", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill([
    "# Format Metadata",
    "",
    "---",
    "tags: [format, xml]",
    "---",
    "",
    "## Structure"
  ].join("\n"));

  const preview = page.locator("#markdown-preview");
  await expect(preview.getByRole("heading", { name: "Format Metadata" })).toBeVisible();
  await expect(preview.locator(".frontmatter-table")).toBeVisible();
  await expect(preview.locator(".frontmatter-table th", { hasText: "tags" })).toBeVisible();
  await expect(preview.locator(".frontmatter-table .fm-tag", { hasText: "format" })).toBeVisible();
  await expect(preview.locator(".frontmatter-table .fm-tag", { hasText: "xml" })).toBeVisible();
  await expect(preview.locator("p", { hasText: "tags: [format, xml]" })).toHaveCount(0);
  await expect(preview.getByRole("heading", { name: "Structure" })).toBeVisible();
});

test("syncs editor scrolling to the preview pane while enabled", async ({ page }) => {
  await openApp(page);

  const markdown = Array.from({ length: 80 }, (_, index) => `## Section ${index + 1}\n\nParagraph ${index + 1}`).join("\n\n");
  await page.locator("#markdown-editor").fill(markdown);
  await expect.poll(() => page.locator("#markdown-preview").textContent()).toContain("Section 80");
  await expect.poll(() => page.locator("#markdown-editor").evaluate((editor) => editor.scrollHeight > editor.clientHeight)).toBe(true);
  await expect.poll(() => page.locator(".preview-pane").evaluate((pane) => pane.scrollHeight > pane.clientHeight)).toBe(true);

  await page.locator("#markdown-editor").evaluate((editor) => {
    editor.scrollTop = editor.scrollHeight - editor.clientHeight;
    editor.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect.poll(() => page.locator(".preview-pane").evaluate((pane) => pane.scrollTop)).toBeGreaterThan(0);
});

test("keeps soft-wrapped editor overlays within the textarea text area", async ({ page }) => {
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  const wrappedLine = "MD-Editor is a modern client-side Markdown workspace for writing, previewing, importing, organizing, and exporting Markdown documents. This welcome document appears when the app starts with no saved tabs and when all tabs are reset.";
  await editor.fill(Array.from({ length: 40 }, () => wrappedLine).join("\n"));

  const metrics = await page.evaluate(() => {
    const textarea = document.querySelector("#markdown-editor");
    const syntaxOverlay = document.querySelector("#editor-syntax-highlight");
    const selectionOverlay = document.querySelector("#editor-selection-highlights");
    const wrapper = textarea.parentElement;
    const textareaStyle = window.getComputedStyle(textarea);
    const syntaxStyle = window.getComputedStyle(syntaxOverlay);
    const selectionStyle = window.getComputedStyle(selectionOverlay);
    const borderWidth = (parseFloat(textareaStyle.borderLeftWidth) || 0)
      + (parseFloat(textareaStyle.borderRightWidth) || 0);
    const scrollbarWidth = Math.max(0, textarea.offsetWidth - textarea.clientWidth - borderWidth);
    const overlayScrollbarWidth = parseFloat(window.getComputedStyle(wrapper).getPropertyValue("--editor-overlay-scrollbar-width")) || 0;
    const textareaRect = textarea.getBoundingClientRect();
    const syntaxRect = syntaxOverlay.getBoundingClientRect();

    return {
      scrollbarWidth,
      overlayScrollbarWidth,
      rightGap: textareaRect.right - syntaxRect.right,
      syntaxOverflowWrap: syntaxStyle.overflowWrap,
      syntaxWordBreak: syntaxStyle.wordBreak,
      selectionOverflowWrap: selectionStyle.overflowWrap,
      selectionWordBreak: selectionStyle.wordBreak
    };
  });

  expect(Math.abs(metrics.overlayScrollbarWidth - metrics.scrollbarWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.rightGap - metrics.scrollbarWidth)).toBeLessThanOrEqual(1);
  expect(metrics.syntaxOverflowWrap).toBe("normal");
  expect(metrics.syntaxWordBreak).toBe("normal");
  expect(metrics.selectionOverflowWrap).toBe("normal");
  expect(metrics.selectionWordBreak).toBe("normal");
});

test("keeps metric-changing markdown styles from shifting editor overlay text", async ({ page }) => {
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  await editor.fill("# Heading Overlay\n\nThis line has **strong words** and *emphasis words*.");

  const metrics = await page.evaluate(() => {
    const styledNodes = [
      document.querySelector("#editor-syntax-highlight .editor-md-heading"),
      document.querySelector("#editor-syntax-highlight .editor-md-strong"),
      document.querySelector("#editor-syntax-highlight .editor-md-emphasis")
    ];
    return styledNodes.map((node) => {
      const style = node ? window.getComputedStyle(node) : null;
      return style ? { fontWeight: style.fontWeight, fontStyle: style.fontStyle } : null;
    });
  });

  expect(metrics).toEqual([
    { fontWeight: "400", fontStyle: "normal" },
    { fontWeight: "400", fontStyle: "normal" },
    { fontWeight: "400", fontStyle: "normal" }
  ]);
});

test("find and replace navigation scrolls offscreen matches into view", async ({ page }) => {
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  await page.locator(".view-mode-btn[data-mode='split']").click();
  const wrappedLine = "plain wrapped line " + "word ".repeat(90);
  const lines = [
    "target line 1",
    ...Array.from({ length: 28 }, () => wrappedLine),
    "target line after wrapped content",
    ...Array.from({ length: 20 }, (_value, index) => `plain line ${index + 1}`)
  ];
  await editor.fill(lines.join("\n"));
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    textarea.scrollTop = 0;
  });

  await page.locator(".editor-format-button[data-editor-format-action='find-replace']").evaluate((button) => button.click());
  await expect(page.locator("#editor-find-replace-modal")).toBeVisible();
  await page.locator("#editor-find-input").fill("target");
  await expect(page.locator("#editor-find-replace-status")).toHaveText("1 of 2 matches");
  await editor.evaluate((textarea) => {
    textarea.scrollTop = 0;
    textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await page.locator("#editor-find-next").click();
  await expect(page.locator("#editor-find-replace-status")).toHaveText("2 of 2 matches");
  await expect.poll(() => editor.evaluate((textarea) => textarea.scrollTop)).toBeGreaterThan(1000);
});

test("mirrors editor markdown syntax in the highlight overlay", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill("# Overlay Title\n\n- **Important** item");

  await expect(page.locator("#editor-syntax-highlight .editor-md-marker")).toHaveText("#");
  await expect(page.locator("#editor-syntax-highlight .editor-md-heading")).toContainText("Overlay Title");
  await expect(page.locator("#editor-syntax-highlight .editor-md-list")).toHaveText("-");
  await expect(page.locator("#editor-syntax-highlight .editor-md-strong")).toHaveText("**Important**");
});

test("suggests and accepts known tags while typing", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["alpha", "archive"] }));
  });
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  await editor.fill("");
  await editor.focus();
  await page.keyboard.type("#alp");
  await expect(page.locator("#link-autocomplete-layer")).toBeVisible();
  await expect(page.locator("#link-autocomplete-layer .link-autocomplete-option").first()).toContainText("#alpha");

  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("#alpha");
});

test("suggests image files inside Markdown image targets", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.markdownViewerApp.state.isFolderOpen = true;
    window.markdownViewerApp.state.currentFolderTreeNodes = [
      { kind: "file", name: "README.md", path: "README.md" },
      {
        kind: "directory",
        name: "images",
        path: "images",
        children: [
          { kind: "file", name: "diagram.png", path: "images/diagram.png" },
          { kind: "file", name: "photo.webp", path: "images/photo.webp" }
        ]
      }
    ];
  });

  const editor = page.locator("#markdown-editor");
  await editor.fill("");
  await editor.focus();
  await page.keyboard.type("![Diagram](dia");

  const autocomplete = page.locator("#link-autocomplete-layer");
  await expect(autocomplete).toBeVisible();
  await expect(autocomplete).toHaveAttribute("aria-label", "Image suggestions");
  await expect(autocomplete.locator(".link-autocomplete-option")).toHaveCount(1);
  await expect(autocomplete.locator(".link-autocomplete-option").first()).toContainText("diagram.png");
  await expect(autocomplete).not.toContainText("README");

  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("![Diagram](images/diagram.png)");
});

test("opens preview links relative to an opened file when no folder is open", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.__alertMessages = [];
    window.alert = (message) => window.__alertMessages.push(String(message));
    window.Neutralino = {
      os: {
        showOpenDialog: async () => "C:/vault/index.md",
        open: async () => {}
      },
      filesystem: {
        readFile: async (path) => {
          const normalized = String(path || "").replace(/\\/g, "/");
          if (normalized === "C:/vault/index.md") return "# Index\n\n[[linked|Open linked]]";
          if (normalized === "C:/vault/linked.md") return "# Linked\n\nOpened from relative path.";
          throw new Error("Unexpected read path: " + path);
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").click();
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "Index" })).toBeVisible();
  await page.locator("#markdown-preview a", { hasText: "Open linked" }).click();

  await expect(page.locator("#tab-list .tab-item.active")).toContainText("linked");
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "Linked" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);
});

test("scrolls same-file preview links to heading anchors", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.Neutralino = {
      os: {
        showOpenDialog: async () => "C:/vault/my-page.md",
        open: async () => {}
      },
      filesystem: {
        readFile: async (path) => {
          const normalized = String(path || "").replace(/\\/g, "/");
          if (normalized === "C:/vault/my-page.md") {
            const filler = Array.from({ length: 45 }, (_, index) => `## Filler ${index + 1}\n\nBody ${index + 1}`).join("\n\n");
            return `# My Page\n\n[[my-page#title2|Jump to title 2]]\n\n${filler}\n\n## Title2\n\nTarget`;
          }
          throw new Error("Unexpected read path: " + path);
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").click();
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "My Page" })).toBeVisible();
  const tabCountBeforeClick = await page.locator("#tab-list .tab-item").count();
  await page.locator("#markdown-preview a", { hasText: "Jump to title 2" }).click();

  await expect.poll(() => page.locator(".preview-pane").evaluate((pane) => pane.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.locator("#markdown-preview h2", { hasText: "Title2" }).evaluate((heading) => {
    const headingRect = heading.getBoundingClientRect();
    const paneRect = document.querySelector(".preview-pane").getBoundingClientRect();
    return headingRect.top >= paneRect.top && headingRect.top <= paneRect.bottom;
  })).toBe(true);
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(tabCountBeforeClick);
});
