const { expect, test } = require("@playwright/test");

const browserLibraryStub = `
  (function () {
    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function inlineMarkdown(value) {
      return escapeHtml(value)
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
    }

    var markedOptions = {};
    window.marked = {
      Renderer: function Renderer() {},
      setOptions: function setOptions(options) {
        markedOptions = options || {};
      },
      parse: function parse(markdown) {
        var lines = String(markdown || "").split(/\\r?\\n/);
        var html = "";
        var inList = false;

        for (var index = 0; index < lines.length; index += 1) {
          var line = lines[index];

          if (/^\`\`\`/.test(line)) {
            var language = line.replace(/^\`\`\`/, "").trim();
            var codeLines = [];
            index += 1;
            while (index < lines.length && !/^\`\`\`/.test(lines[index])) {
              codeLines.push(lines[index]);
              index += 1;
            }
            if (inList) {
              html += "</ul>";
              inList = false;
            }
            if (markedOptions.renderer && typeof markedOptions.renderer.code === "function") {
              html += markedOptions.renderer.code(codeLines.join("\\n"), language);
            } else {
              html += "<pre><code>" + escapeHtml(codeLines.join("\\n")) + "</code></pre>";
            }
            continue;
          }

          var heading = line.match(/^(#{1,6})\\s+(.+)$/);
          if (heading) {
            if (inList) {
              html += "</ul>";
              inList = false;
            }
            var level = heading[1].length;
            html += "<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">";
            continue;
          }

          var listItem = line.match(/^[-*]\\s+(.+)$/);
          if (listItem) {
            if (!inList) {
              html += "<ul>";
              inList = true;
            }
            html += "<li>" + inlineMarkdown(listItem[1]) + "</li>";
            continue;
          }

          if (!line.trim()) {
            if (inList) {
              html += "</ul>";
              inList = false;
            }
            continue;
          }

          if (inList) {
            html += "</ul>";
            inList = false;
          }
          html += "<p>" + inlineMarkdown(line) + "</p>";
        }

        if (inList) html += "</ul>";
        return html;
      }
    };

    window.hljs = {
      getLanguage: function () { return true; },
      highlight: function (code) { return { value: escapeHtml(code) }; }
    };
    window.DOMPurify = { sanitize: function (html) { return html; } };
    window.mermaid = {
      initialize: function () {},
      init: function () { return Promise.resolve(); },
      run: function () { return Promise.resolve(); }
    };
    window.MathJax = { typesetPromise: function () { return Promise.resolve(); } };
    window.joypixels = { shortnameToUnicode: function (value) { return value; } };
    window.pako = {
      deflate: function (bytes) { return bytes; },
      inflate: function (bytes) { return bytes; }
    };
    window.jsyaml = {
      load: function (yaml) {
        var data = {};
        String(yaml || "").split(/\\r?\\n/).forEach(function (line) {
          var inlineTags = line.match(/^tags:\\s*\\[([^\\]]*)\\]\\s*$/);
          if (inlineTags) {
            data.tags = inlineTags[1].split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
          }
        });
        return data;
      },
      dump: function (data) {
        var tags = Array.isArray(data && data.tags) ? data.tags : [];
        return "tags: [" + tags.join(", ") + "]\\n";
      }
    };
    window.saveAs = function () {};
    window.html2pdf = function () { return { set: function () { return this; }, from: function () { return this; }, save: function () { return Promise.resolve(); } }; };
    window.jspdf = { jsPDF: function () { return { internal: { pageSize: { getWidth: function () { return 100; }, getHeight: function () { return 100; } } }, addImage: function () {}, save: function () {} }; } };
    window.html2canvas = function () { return Promise.resolve(document.createElement("canvas")); };
    window.pdfMake = {};
    function createD3Stub() {
      var svgTags = new Set(["svg", "g", "line", "path", "circle", "text", "title"]);

      function createElement(tagName) {
        return svgTags.has(tagName)
          ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
          : document.createElement(tagName);
      }

      function resolveValue(value, element, data, index) {
        return typeof value === "function" ? value.call(element, data, index) : value;
      }

      function Selection(elements, parents, enterData) {
        this.elements = elements || [];
        this.parents = parents || [];
        this.enterData = enterData || null;
      }

      Selection.prototype.append = function (tagName) {
        var created = [];
        if (this.enterData) {
          this.parents.forEach(function (parent) {
            this.enterData.forEach(function (dataItem) {
              var child = createElement(tagName);
              child.__data__ = dataItem;
              parent.appendChild(child);
              created.push(child);
            });
          }, this);
          return new Selection(created);
        }
        this.elements.forEach(function (element) {
          var child = createElement(tagName);
          child.__data__ = element.__data__;
          element.appendChild(child);
          created.push(child);
        });
        return new Selection(created);
      };

      Selection.prototype.attr = function (name, value) {
        this.elements.forEach(function (element, index) {
          var resolved = resolveValue(value, element, element.__data__, index);
          if (resolved === null || resolved === undefined) element.removeAttribute(name);
          else element.setAttribute(name, String(resolved));
        });
        return this;
      };

      Selection.prototype.style = function (name, value) {
        this.elements.forEach(function (element, index) {
          var resolved = resolveValue(value, element, element.__data__, index);
          if (resolved === null || resolved === undefined) element.style.removeProperty(name);
          else element.style[name] = String(resolved);
        });
        return this;
      };

      Selection.prototype.text = function (value) {
        this.elements.forEach(function (element, index) {
          element.textContent = String(resolveValue(value, element, element.__data__, index) || "");
        });
        return this;
      };

      Selection.prototype.classed = function (className, value) {
        this.elements.forEach(function (element, index) {
          element.classList.toggle(className, Boolean(resolveValue(value, element, element.__data__, index)));
        });
        return this;
      };

      Selection.prototype.on = function (eventName, handler) {
        var domEventName = String(eventName).split(".")[0];
        if (!domEventName) return this;
        this.elements.forEach(function (element) {
          element.addEventListener(domEventName, function (event) {
            handler.call(element, event, element.__data__);
          });
        });
        return this;
      };

      Selection.prototype.call = function (fn) {
        if (typeof fn === "function") fn(this);
        return this;
      };

      Selection.prototype.each = function (handler) {
        this.elements.forEach(function (element, index) {
          handler.call(element, element.__data__, index);
        });
        return this;
      };

      Selection.prototype.selectAll = function (selector) {
        var found = [];
        this.elements.forEach(function (element) {
          found = found.concat(Array.from(element.querySelectorAll(selector)));
        });
        return new Selection(found, this.elements);
      };

      Selection.prototype.data = function (dataItems) {
        this.enterData = dataItems || [];
        return this;
      };

      Selection.prototype.enter = function () {
        return new Selection([], this.parents, this.enterData || []);
      };

      function resolveLinks(links, nodes, idAccessor) {
        var nodeById = new Map();
        nodes.forEach(function (node) {
          nodeById.set(idAccessor(node), node);
        });
        links.forEach(function (link) {
          if (typeof link.source !== "object") link.source = nodeById.get(link.source) || { id: link.source, x: 0, y: 0 };
          if (typeof link.target !== "object") link.target = nodeById.get(link.target) || { id: link.target, x: 0, y: 0 };
        });
      }

      function forceSimulation(nodes) {
        var tickHandler = null;
        var idAccessor = function (node) { return node.id; };
        nodes.forEach(function (node, index) {
          if (typeof node.x !== "number") node.x = 160 + index * 120;
          if (typeof node.y !== "number") node.y = 180 + (index % 2) * 90;
        });
        var api = {
          force: function (name, forceValue) {
            if (name === "link" && forceValue && forceValue._links) {
              idAccessor = forceValue._idAccessor || idAccessor;
              resolveLinks(forceValue._links, nodes, idAccessor);
            }
            return api;
          },
          alpha: function () { return api; },
          alphaTarget: function () { return api; },
          restart: function () {
            if (tickHandler) tickHandler();
            return api;
          },
          stop: function () { return api; },
          on: function (eventName, handler) {
            if (eventName === "tick") {
              tickHandler = handler;
              handler();
            }
            return api;
          }
        };
        return api;
      }

      function forceLink(links) {
        var api = {
          _links: links || [],
          _idAccessor: function (node) { return node.id; },
          id: function (accessor) { api._idAccessor = accessor; return api; },
          distance: function () { return api; },
          strength: function () { return api; }
        };
        return api;
      }

      function chainableForce() {
        return {
          strength: function () { return this; },
          radius: function () { return this; }
        };
      }

      function zoomIdentity(x, y, k) {
        return {
          x: x || 0,
          y: y || 0,
          k: k || 1,
          translate: function (nextX, nextY) { return zoomIdentity(nextX, nextY, this.k); },
          scale: function (nextK) { return zoomIdentity(this.x, this.y, nextK); },
          toString: function () { return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")"; }
        };
      }

      function zoom() {
        var behavior = function () {};
        behavior.scaleExtent = function () { return behavior; };
        behavior.on = function () { return behavior; };
        behavior.transform = function () {};
        return behavior;
      }

      function drag() {
        var behavior = function () {};
        behavior.on = function () { return behavior; };
        return behavior;
      }

      return {
        select: function (element) { return new Selection([element]); },
        zoomIdentity: zoomIdentity(0, 0, 1),
        zoom: zoom,
        drag: drag,
        forceSimulation: forceSimulation,
        forceLink: forceLink,
        forceManyBody: chainableForce,
        forceCenter: function () { return chainableForce(); },
        forceX: function () { return chainableForce(); },
        forceY: function () { return chainableForce(); },
        forceCollide: chainableForce
      };
    }
    window.d3 = createD3Stub();
    window.bootstrap = {};
  })();
`;

async function stubBrowserLibraries(page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
      await route.continue();
      return;
    }

    if (/\.css(?:\?|$)/.test(url)) {
      await route.fulfill({ contentType: "text/css", body: "" });
      return;
    }

    await route.fulfill({ contentType: "application/javascript", body: browserLibraryStub });
  });
}

test.beforeEach(async ({ page }) => {
  page.errors = [];

  await stubBrowserLibraries(page);

  page.on("pageerror", (error) => page.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

async function openApp(page, path = "/") {
  await page.goto(path);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-preview")).toBeVisible();
}

test("loads into an editable split-view document", async ({ page }) => {
  await openApp(page);

  await expect(page.locator(".view-mode-btn[data-mode='split']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await expect(page.locator("#markdown-preview")).toBeVisible();
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

test("switches between editor, preview, and split views", async ({ page }) => {
  await openApp(page);

  const editorPane = page.locator(".editor-pane");
  const previewPane = page.locator(".preview-pane");

  await page.locator(".view-mode-btn[data-mode='preview']").click();
  await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");
  await expect(previewPane).toBeVisible();
  await expect(editorPane).not.toBeVisible();

  await page.locator(".view-mode-btn[data-mode='editor']").click();
  await expect(page.locator(".view-mode-btn[data-mode='editor']")).toHaveAttribute("aria-pressed", "true");
  await expect(editorPane).toBeVisible();
  await expect(previewPane).not.toBeVisible();

  await page.locator(".view-mode-btn[data-mode='split']").click();
  await expect(page.locator(".view-mode-btn[data-mode='split']")).toHaveAttribute("aria-pressed", "true");
  await expect(editorPane).toBeVisible();
  await expect(previewPane).toBeVisible();
});

test("opens new documents in split view regardless of the current view mode", async ({ page }) => {
  await openApp(page);

  await page.locator(".view-mode-btn[data-mode='preview']").click();
  await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");

  await page.locator(".tab-new-btn").click();

  await expect(page.locator(".view-mode-btn[data-mode='split']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs.find((tab) => /^Untitled \d+$/.test(tab.title))?.viewMode;
  })).toBe("split");
});

test("toggles theme and persists it across reloads", async ({ page }) => {
  await openApp(page);

  const initialTheme = await page.locator("html").getAttribute("data-theme");
  const expectedTheme = initialTheme === "dark" ? "light" : "dark";

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
  await expect(page.locator("#theme-toggle")).toContainText(initialTheme === "dark" ? "Dark Mode" : "Light Mode");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
});

test("opens and closes the mobile menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await page.locator("#mobile-menu-toggle").click();
  await expect(page.locator("#mobile-menu-panel")).toHaveClass(/active/);
  await expect(page.locator("#mobile-menu-overlay")).toHaveClass(/active/);

  await page.locator("#close-mobile-menu").click();
  await expect(page.locator("#mobile-menu-panel")).not.toHaveClass(/active/);

  await page.locator("#mobile-menu-toggle").click();
  await page.locator("#mobile-menu-overlay").dispatchEvent("click");
  await expect(page.locator("#mobile-menu-panel")).not.toHaveClass(/active/);
});

test("supports document keyboard shortcut for split-view sync scrolling", async ({ page }) => {
  await openApp(page);

  const syncButton = page.locator("#toggle-sync");
  const initialSyncText = await syncButton.innerText();

  await page.keyboard.press("Control+Shift+S");
  await expect(syncButton).not.toHaveText(initialSyncText);

  const toggledSyncText = await syncButton.innerText();
  await page.locator(".view-mode-btn[data-mode='preview']").click();
  await page.keyboard.press("Control+Shift+S");
  await expect(syncButton).toHaveText(toggledSyncText);
});

test("syncs editor scrolling to the preview pane while enabled", async ({ page }) => {
  await openApp(page);

  const markdown = Array.from({ length: 80 }, (_, index) => `## Section ${index + 1}\n\nParagraph ${index + 1}`).join("\n\n");
  await page.locator("#markdown-editor").fill(markdown);
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "Section 80" })).toBeVisible();

  await page.locator("#markdown-editor").evaluate((editor) => {
    editor.scrollTop = editor.scrollHeight;
    editor.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect.poll(() => page.locator(".preview-pane").evaluate((pane) => pane.scrollTop)).toBeGreaterThan(0);
});

test("keeps editor line numbers in sync with typed content", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill("First line\nSecond line\nThird line");

  const lineNumbers = page.locator("#editor-line-numbers .editor-line-number");
  await expect(lineNumbers).toHaveCount(3);
  await expect(lineNumbers.nth(0)).toHaveText("1");
  await expect(lineNumbers.nth(1)).toHaveText("2");
  await expect(lineNumbers.nth(2)).toHaveText("3");
});

test("updates document statistics and focused editor position", async ({ page }) => {
  await openApp(page);

  const markdown = "Alpha beta\nGamma delta";
  await page.locator("#markdown-editor").fill(markdown);

  await expect(page.locator("#word-count")).toHaveText("4");
  await expect(page.locator("#char-count")).toHaveText(String(markdown.length));
  await expect(page.locator("#reading-time")).toHaveText("1");

  await page.locator("#markdown-editor").evaluate((editor) => {
    editor.focus();
    editor.selectionStart = editor.value.length;
    editor.selectionEnd = editor.value.length;
    editor.dispatchEvent(new Event("keyup", { bubbles: true }));
  });

  await expect(page.locator("#editor-total-lines")).toHaveText("2");
  await expect(page.locator("#editor-cursor-line")).toHaveText("2");
  await expect(page.locator("#editor-cursor-column")).toHaveText("12");
  await expect(page.locator("#editor-position-label")).toHaveText("Pos");
  await expect(page.locator("#editor-position-value")).toHaveText(String(markdown.length + 1));
});

test("converts selected editor text from the context menu", async ({ page }) => {
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  await editor.fill("Context heading");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await editor.dispatchEvent("contextmenu", { button: 2, clientX: 160, clientY: 180 });

  await expect(page.locator("#editor-context-menu")).toBeVisible();
  await page.locator("#editor-context-menu [data-markdown-action='heading-1']").click();

  await expect(editor).toHaveValue("# Context heading");
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
  await editor.fill("#alp");
  await expect(page.locator("#link-autocomplete-layer")).toBeVisible();
  await expect(page.locator("#link-autocomplete-layer .link-autocomplete-option").first()).toContainText("#alpha");

  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("#alpha");
});

test("saved graph remains interactive and filters only graph snapshot tags", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_e2e",
      title: "Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      graphSnapshot: {
        version: 1,
        folderName: "Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] },
          { id: "tag:defined", label: "#defined", type: "tag", status: "current", tag: "defined" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "alpha.md", target: "tag:defined", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha\n\n[[beta]]", fullPath: "alpha.md", status: "current", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", fullPath: "beta.md", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["ghost", "archive"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");

  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(3);

  const tagOptions = await page.locator("#graph-selected-tag-filter option").allTextContents();
  expect(tagOptions).toEqual(["All files", "#defined"]);
  await expect(page.locator("#tag-management-list .tag-management-list-item")).toHaveText(["#defined1"]);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  const graphMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(graphMenu).toBeVisible();
  await expect(graphMenu).toContainText("Turn magnetic forces off");
  await expect(graphMenu).toContainText("Open in a new tab");
  await expect(graphMenu.locator(".tags-context-menu-item")).toHaveText(["#defined"]);

  await graphMenu.getByText("Turn magnetic forces off").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState")).graphMagneticEnabled)).toBe(false);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await expect(page.locator(".graph-tab-render .graph-context-menu:not(.hidden)")).toContainText("Turn magnetic forces on");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy path" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("alpha.md");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy content" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain("# Alpha");
});

test("creating a tag from the tag dialog shows the new tag", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["stale-known"] }));
    window.prompt = () => "Fresh Tag";
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield {
          kind: "file",
          name: "untagged.md",
          getFile: async () => new File(["# Untagged"], "untagged.md", { type: "text/markdown" }),
          createWritable: async () => ({ write: async () => {}, close: async () => {} })
        };
      }
    });
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await expect(page.locator("#tag-management-list .tag-management-list-empty")).toBeVisible();
  await page.locator("#create-tag-button").evaluate((button) => button.click());

  await expect(page.locator("#tag-management-search")).toHaveValue("");
  await expect(page.locator("#tag-management-list .tag-management-list-item")).toHaveText(["#fresh tag0"]);

  await page.locator(".folder-tree-file", { hasText: "untagged.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await expect(page.locator(".sidebar-file-context-menu:not(.hidden) .tags-context-menu-item")).toHaveText(["#fresh tag"]);
});

test("desktop graph context menu can update file tags", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.__moves = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/alpha.md") return "---\ntags: [defined]\n---\n# Alpha";
          if (path === "C:/vault/archive/alpha.md") return "---\ntags: [archive]\n---\n# Archived Alpha";
          return "---\ntags: [other]\n---\n# Beta";
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        },
        move: async (oldPath, newPath) => {
          window.__moves.push({ oldPath, newPath });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const graphTab = {
      id: "desktop_graph_e2e",
      title: "Desktop Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Desktop Graph E2E",
      graphScopeKey: "root-folder:c:/vault",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      graphSnapshot: {
        version: 1,
        folderName: "Desktop Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: ["other"] },
          { id: "archive/alpha.md", label: "alpha.md", fullPath: "C:/vault/archive/alpha.md", type: "file", status: "current", tags: ["archive"] },
          { id: "tag:archive", label: "#archive", type: "tag", status: "current", tag: "archive" },
          { id: "tag:defined", label: "#defined", type: "tag", status: "current", tag: "defined" },
          { id: "tag:other", label: "#other", type: "tag", status: "current", tag: "other" }
        ],
        links: [
          { source: "alpha.md", target: "tag:defined", type: "tag", status: "current" },
          { source: "beta.md", target: "tag:other", type: "tag", status: "current" },
          { source: "archive/alpha.md", target: "tag:archive", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha", status: "current", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "---\ntags: [other]\n---\n# Beta", fullPath: "C:/vault/beta.md", status: "current", tags: ["other"] },
          { id: "archive/alpha.md", path: "archive/alpha.md", name: "alpha.md", content: "---\ntags: [archive]\n---\n# Archived Alpha", fullPath: "C:/vault/archive/alpha.md", status: "current", tags: ["archive"] }
        ]
      }
    };
    const unrelatedGraphTab = {
      ...graphTab,
      id: "unrelated_graph_e2e",
      title: "Unrelated Graph E2E",
      folderName: "Unrelated Graph E2E",
      graphScopeKey: "root-folder:c:/other-vault",
      graphSnapshot: {
        version: 1,
        folderName: "Unrelated Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: ["unrelated"] },
          { id: "tag:unrelated", label: "#unrelated", type: "tag", status: "current", tag: "unrelated" }
        ],
        links: [
          { source: "alpha.md", target: "tag:unrelated", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [unrelated]\n---\n# Other Alpha", status: "current", tags: ["unrelated"] }
        ]
      }
    };
    const openMarkdownTab = {
      id: "alpha_markdown_tab",
      title: "Alpha",
      content: "---\ntags: [defined]\n---\n# Alpha",
      savedContent: "---\ntags: [defined]\n---\n# Alpha",
      scrollPos: 0,
      viewMode: "split",
      createdAt: Date.now(),
      isTemporary: false,
      type: "markdown",
      sourceFileName: "alpha.md",
      sourceFilePath: "C:/vault/alpha.md"
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["ghost"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab, unrelatedGraphTab, openMarkdownTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node")).toHaveCount(6);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  const tagItems = page.locator(".graph-tab-render .tags-context-menu-item");
  await expect(tagItems).toHaveText(["#archive", "#defined", "#other"]);
  await page.locator(".graph-context-menu-submenu", { hasText: "Tags" }).hover();
  await tagItems.filter({ hasText: "#other" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__writes[0].content)).toContain("other");
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [defined, other]\n---\n# Alpha",
    savedContent: "---\ntags: [defined, other]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "Alpha" })).not.toHaveClass(/unsaved/);
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs"));
    const graphTab = tabs.find((tab) => tab.id === "desktop_graph_e2e");
    const unrelatedGraphTab = tabs.find((tab) => tab.id === "unrelated_graph_e2e");
    return {
      archive: graphTab.graphSnapshot.files.find((file) => file.fullPath === "C:/vault/archive/alpha.md").tags,
      unrelated: unrelatedGraphTab.graphSnapshot.files[0].tags
    };
  })).toEqual({ archive: ["archive"], unrelated: ["unrelated"] });

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await expect(page.locator(".graph-tab-render .tags-context-menu-item", { hasText: "#other" })).toHaveAttribute("aria-checked", "true");
  await page.locator(".graph-tab-render .tags-context-menu-item", { hasText: "#defined" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [other]\n---\n# Alpha",
    savedContent: "---\ntags: [other]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator(".graph-link-tag")).toHaveCount(3);
  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await expect(page.locator(".graph-tab-render .tags-context-menu-item")).toHaveText(["#archive", "#other"]);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).click();
  await page.locator("#rename-modal-input").fill("renamed.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__moves)).toEqual([
    { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/renamed.md" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("desktop tree context menu can update file tags", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "---\ntags: [defined]\n---\n# Alpha"],
      ["beta.md", "---\ntags: [other]\n---\n# Beta"]
    ]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await page.locator("#import-from-folder").click();

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const treeMenu = page.locator(".sidebar-file-context-menu:not(.hidden)");
  await expect(treeMenu.locator(".tags-context-menu-item")).toHaveText(["#defined", "#other"]);
  await treeMenu.locator(".tags-context-menu-item", { hasText: "#other" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__writes[0].content)).toContain("defined, other");

  await page.locator(".open-graph-view").first().click();
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.type === "graph");
    return graphTab?.graphSnapshot?.files?.find((file) => file.path === "alpha.md")?.tags || [];
  })).toEqual(["defined", "other"]);
  await expect(page.locator("#graph-selected-tag-filter option")).toHaveText(["All files", "#defined", "#other"]);
  await page.locator("#graph-show-tags").evaluate((button) => button.click());
  await expect(page.locator(".graph-node-tag")).toHaveCount(2);
  await expect(page.locator(".graph-label-tag", { hasText: "#other" })).toHaveCount(1);
  await expect(page.locator(".graph-link-tag")).toHaveCount(3);
});

test("renders recent files in the action menu", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerRecentFiles", JSON.stringify([
      { name: "notes.md", label: "notes.md", path: "docs/notes.md", updatedAt: Date.now() }
    ]));
  });
  await openApp(page);

  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(1);
  await expect(page.locator(".recent-files-menu .recent-menu-item")).toContainText("notes.md");
});

test("shows active dropzone state during drag", async ({ page }) => {
  await openApp(page);

  const dropzone = page.locator("#dropzone");
  await dropzone.dispatchEvent("dragenter");
  await expect(dropzone).toHaveClass(/active/);

  await dropzone.dispatchEvent("dragleave");
  await expect(dropzone).not.toHaveClass(/active/);
});

test("marks edited documents as unsaved", async ({ page }) => {
  await openApp(page);

  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
  await page.locator("#markdown-editor").fill("# Unsaved Draft\n\nChanged content.");

  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);
  await expect.poll(() => page.evaluate(() => window.markdownViewerHasUnsavedChanges())).toBe(true);
});

test("saves folder-backed edits with Ctrl+S and the Save changes menu item", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    let fileContent = "# Folder Note\n\nOriginal";
    const fileHandle = {
      kind: "file",
      name: "folder-note.md",
      getFile: async () => new File([fileContent], "folder-note.md", { type: "text/markdown" }),
      createWritable: async () => ({
        write: async (content) => {
          fileContent = String(content);
          window.__lastWrittenFolderNote = fileContent;
        },
        close: async () => {}
      })
    };
    window.__lastWrittenFolderNote = null;
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#markdown-editor")).toHaveValue(/Original/);

  await page.locator("#markdown-editor").fill("# Folder Note\n\nSaved by shortcut.");
  await page.keyboard.press("Control+S");
  await expect.poll(() => page.evaluate(() => window.__lastWrittenFolderNote)).toBe("# Folder Note\n\nSaved by shortcut.");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);

  await page.locator("#markdown-editor").fill("# Folder Note\n\nSaved by button.");
  await page.locator(".save-current-file-button").first().click();
  await expect.poll(() => page.evaluate(() => window.__lastWrittenFolderNote)).toBe("# Folder Note\n\nSaved by button.");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
});

test("opens files from the folder tree without showing an error", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    window.__alertMessages = [];
    window.alert = (message) => {
      window.__alertMessages.push(String(message));
    };
    const markdownFile = new File(["# Folder Note\n\nOpened from tree."], "folder-note.md", {
      type: "text/markdown",
      lastModified: Date.now()
    });
    const fileHandle = {
      kind: "file",
      name: "folder-note.md",
      getFile: async () => markdownFile,
      createWritable: async () => ({ write: async () => {}, close: async () => {} })
    };
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect(page.locator("#markdown-editor")).toHaveValue(/Opened from tree/);
  await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);

  await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);

  await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).evaluate((button) => button.click());
  await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);
});

test("opens files from a desktop folder tree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault"
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return [{ entry: "desktop-note.md", type: "FILE" }];
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/desktop-note.md") return "# Desktop Note\n\nOpened from tree.";
          throw new Error("Unexpected read path: " + path);
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await expect(page.locator(".folder-tree-file", { hasText: "desktop-note.md" })).toBeVisible();
  await page.locator(".folder-tree-file", { hasText: "desktop-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect(page.locator("#tab-list .tab-item", { hasText: "desktop-note" })).toHaveCount(1);
  await expect(page.locator("#markdown-editor")).toHaveValue(/Desktop Note/);
});

test("clicking a tag in the tag dialog filters the folder tree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    const files = new Map([
      ["tagged.md", "---\ntags: [project]\n---\n# Tagged"],
      ["untagged.md", "# Untagged"]
    ]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  const taggedFile = page.locator(".folder-tree-file[data-name='tagged.md']");
  const untaggedFile = page.locator(".folder-tree-file[data-name='untagged.md']");
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();

  const tagButton = page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" });
  await expect(tagButton).toBeVisible();
  await tagButton.evaluate((button) => button.click());

  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toHaveCount(0);
  await expect(tagButton).toHaveAttribute("aria-selected", "true");
});

test("keeps open folder graph views in sync with saved and deleted files", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([["alpha.md", "# Alpha"]]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => "C:/vault/beta.md",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        },
        remove: async (path) => {
          files.delete(getName(path));
        }
      },
      clipboard: { writeText: async () => {} }
    };
    window.confirm = () => true;
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect(page.locator(".graph-label-file")).toContainText("alpha");

  await page.locator(".tab-new-btn").click();
  await page.locator(".view-mode-btn[data-mode='split']").click();
  await page.locator("#markdown-editor").fill("# Beta");
  await page.keyboard.press("Control+S");
  await expect(page.locator("#tab-list .tab-item", { hasText: "beta" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { has: page.locator(".bi-diagram-3") }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await expect(page.locator(".graph-label-file", { hasText: "beta" })).toHaveCount(1);

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Delete file" }).evaluate((button) => button.click());

  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect(page.locator(".graph-label-file", { hasText: "beta" })).toHaveCount(1);
  await expect(page.locator(".graph-label-file", { hasText: "alpha" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("saves a new graph view through the desktop save dialog", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__graphSaveDialogs = [];
    const files = new Map([["alpha.md", "# Alpha"]]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async (title, options) => {
          window.__graphSaveDialogs.push({ title, options });
          return "C:/vault/graph.mdviewer-graph.json";
        },
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);

  await page.locator(".save-current-file-button").first().click();

  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs[0].title)).toBe("Save Graph View");
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/graph.mdviewer-graph.json")))
    .toContain('"documentType": "graph-view"');
});

test("prompts for a stale app-saved graph view after folder files change", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "---\ntags: [old]\n---\n# Alpha"],
      ["beta.md", "# Beta"]
    ]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.__mutateVault = () => {
      files.set("alpha.md", "---\ntags: [new]\n---\n# Alpha");
      files.delete("beta.md");
    };
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => "C:/vault/graph.mdviewer-graph.json",
        showOpenDialog: async () => "C:/vault/graph.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  await page.locator(".save-current-file-button").first().click();
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/graph.mdviewer-graph.json")))
    .toContain('"documentType": "graph-view"');

  await page.evaluate(() => window.__mutateVault());
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect(page.locator("#graph-stale-saved-only-files")).toHaveText("1");
  await expect(page.locator("#graph-stale-changed-tags")).not.toHaveText("0");
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("opens a saved graph view file from the desktop file picker", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      folderName: "Saved Graph",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      snapshot: {
        version: 1,
        folderName: "Saved Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "alpha.md", status: "current", tags: [] }
        ]
      }
    };
    window.Neutralino = {
      os: {
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#tab-list .tab-item", { hasText: "saved" })).toHaveCount(1);
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened saved graph view is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["beta.md", "# Beta"]]);
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      folderName: "Saved Graph",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      snapshot: {
        version: 1,
        folderName: "Saved Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", fullPath: "alpha.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when a stale saved graph is opened before the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      folderName: "Saved Graph",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      snapshot: {
        version: 1,
        folderName: "Saved Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").first().click();
  await expect(page.locator("#graph-stale-modal")).toHaveClass(/hidden/);

  await page.locator("#import-from-folder").click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened saved graph export is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-export",
      folderName: "Saved Export",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      snapshot: {
        version: 1,
        folderName: "Saved Export",
        createdAt: Date.now(),
        nodes: [
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/export.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/export.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened legacy saved graph is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
    const legacySavedGraph = {
      folderName: "Legacy Graph",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      graphSnapshot: {
        version: 1,
        folderName: "Legacy Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/legacy.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/legacy.mdviewer-graph.json") return JSON.stringify(legacySavedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("folder and graph Open in a new tab focus existing file tabs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerTabs", JSON.stringify([{
      id: "graph_e2e",
      title: "Graph",
      content: "",
      savedContent: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Graph",
      graphViewConfig: { mode: "all", showTags: true },
      graphSnapshot: {
        folderName: "Graph",
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", tags: ["defined"] },
          { id: "tag:defined", label: "#defined", tag: "defined", type: "tag" }
        ],
        links: [{ source: "alpha.md", target: "tag:defined", type: "tag" }],
        files: [{ id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha", tags: ["defined"] }]
      }
    }]));
    localStorage.setItem("markdownViewerActiveTab", "graph_e2e");
  });
  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 140,
    clientY: 120
  });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).click();
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { hasText: "Graph" }).click();
  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 140,
    clientY: 120
  });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).click();
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.evaluate(() => {
    const markdownFile = new File(["# Folder Note"], "folder-note.md", { type: "text/markdown" });
    const fileHandle = {
      kind: "file",
      name: "folder-note.md",
      getFile: async () => markdownFile,
      createWritable: async () => ({ write: async () => {}, close: async () => {} })
    };
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });
  await page.locator("#import-from-folder").click();
  const folderFile = page.locator(".folder-tree-file", { hasText: "folder-note.md" });
  await folderFile.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 90, clientY: 180 });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).evaluate((button) => button.click());
  await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
  await folderFile.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 90, clientY: 180 });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).evaluate((button) => button.click());
  await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
});

test("closing the last tab leaves the workspace empty", async ({ page }) => {
  await openApp(page);

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
  await page.locator("#tab-list .tab-item .tab-close-btn").click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect(page.locator("#tab-bar")).toBeVisible();
  await expect(page.locator(".tab-new-btn")).toBeVisible();
  await expect(page.locator("#tab-reset-btn")).toBeVisible();
  await expect(page.locator("#markdown-editor")).not.toBeVisible();
});

test("new file from an empty workspace shows the editor immediately", async ({ page }) => {
  await openApp(page);

  await page.locator("#tab-reset-btn").click();
  await page.locator("#reset-modal-confirm").click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect(page.locator("#tab-bar")).toBeVisible();
  await expect(page.locator(".tab-new-btn")).toBeVisible();
  await expect(page.locator("#tab-reset-btn")).toBeVisible();

  await page.locator(".new-document-button").first().click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
  await expect(page.locator(".content-container")).not.toHaveClass(/no-open-tabs/);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await expect(page.locator("#markdown-editor")).toBeFocused();
});

test("renaming folder-backed files updates open tab titles", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    let fileName = "alpha.md";
    const fileHandle = {
      kind: "file",
      get name() { return fileName; },
      getFile: async () => new File(["# Alpha"], fileName, { type: "text/markdown" }),
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      move: async (nextName) => {
        fileName = nextName;
      }
    };
    window.__renamedFileName = () => fileName;
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { hasText: "alpha" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='rename']").evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("renamed.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__renamedFileName())).toBe("renamed.md");
  await expect(page.locator("#tab-list .tab-item", { hasText: "renamed" })).toHaveCount(1);
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(0);
});

test("renames desktop folder files from tree, tab, and graph without showing an error", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__moves = [];
    window.alert = (message) => window.__alerts.push(String(message));

    let fileName = "alpha.md";
    const getPath = () => `C:/vault/${fileName}`;
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") return [{ entry: fileName, type: "FILE" }];
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === getPath()) return "# Alpha";
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async () => {},
        move: async (oldPath, newPath) => {
          window.__moves.push({ oldPath, newPath });
          fileName = newPath.split(/[\\/]/).pop();
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { hasText: "alpha" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='rename']").evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("beta.md");
  await page.locator("#rename-modal-confirm").click();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect(page.locator("#tab-list .tab-item", { hasText: "beta" })).toHaveCount(1);

  await page.locator(".folder-tree-file", { hasText: "beta.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("gamma.md");
  await page.locator("#rename-modal-confirm").click();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect(page.locator("#tab-list .tab-item", { hasText: "gamma" })).toHaveCount(1);

  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await page.locator(".graph-node-file").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).click();
  await page.locator("#rename-modal-input").fill("delta.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__moves.map((move) => move.newPath))).toEqual([
    "C:/vault/beta.md",
    "C:/vault/gamma.md",
    "C:/vault/delta.md"
  ]);
});

test("hovering a graph tag point highlights directly tagged files", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerTabs", JSON.stringify([{
      id: "graph_hover_e2e",
      title: "Graph",
      content: "",
      savedContent: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Graph",
      graphViewConfig: { mode: "all", showTags: true },
      graphSnapshot: {
        folderName: "Graph",
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", type: "file", tags: [] },
          { id: "tag:defined", label: "#defined", tag: "defined", type: "tag" }
        ],
        links: [{ source: "alpha.md", target: "tag:defined", type: "tag" }],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", tags: [] }
        ]
      }
    }]));
    localStorage.setItem("markdownViewerActiveTab", "graph_hover_e2e");
  });
  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  await page.locator(".graph-node-tag").dispatchEvent("mouseenter", { bubbles: true, cancelable: true });
  await expect(page.locator(".graph-node-file").first()).not.toHaveClass(/dimmed/);
  await expect(page.locator(".graph-link-tag")).not.toHaveClass(/dimmed/);
});

test("close all leaves the workspace without replacement tabs", async ({ page }) => {
  const seedTabs = () => {
    const tabs = [
      {
        id: "tab_a",
        title: "A",
        content: "# A",
        savedContent: "# A",
        scrollPos: 0,
        viewMode: "split",
        createdAt: Date.now(),
        isTemporary: false,
        type: "markdown"
      },
      {
        id: "tab_b",
        title: "B",
        content: "# B",
        savedContent: "# B",
        scrollPos: 0,
        viewMode: "split",
        createdAt: Date.now(),
        isTemporary: false,
        type: "markdown"
      }
    ];
    localStorage.setItem("markdownViewerTabs", JSON.stringify(tabs));
    localStorage.setItem("markdownViewerActiveTab", "tab_a");
  };

  await page.addInitScript(seedTabs);
  await openApp(page);

  await page.locator("#tab-reset-btn").click();
  await page.locator("#reset-modal-confirm").click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect(page.locator("#markdown-editor")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs")))).toEqual([]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("markdownViewerActiveTab"))).toBe(null);

  await page.evaluate(() => {
    const markdownFile = new File(["# Folder Note\n\nOpened after close all."], "folder-note.md", {
      type: "text/markdown",
      lastModified: Date.now()
    });
    const fileHandle = {
      kind: "file",
      name: "folder-note.md",
      getFile: async () => markdownFile
    };
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });

  await page.locator("#import-from-folder").click();
  await expect(page.locator(".folder-tree-file", { hasText: "folder-note.md" })).toBeVisible();
  await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
  await expect(page.locator(".content-container")).not.toHaveClass(/no-open-tabs/);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await expect(page.locator("#markdown-editor")).toHaveValue(/Folder Note/);

  await page.evaluate(seedTabs);
  await page.reload();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(2);
  await page.locator("#markdown-editor").fill("# A\n\nUnsaved");
  await page.evaluate(() => {
    window.__confirmMessages = [];
    window.confirm = (message) => {
      window.__confirmMessages.push(String(message));
      return false;
    };
  });

  await page.locator("#tab-list .tab-item").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='close-all']").evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__confirmMessages)).toEqual([
    "You have unsaved changes. Are you sure you want to close this tab?"
  ]);
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(2);
  await expect(page.locator(".content-container")).not.toHaveClass(/no-open-tabs/);

  await page.evaluate(() => {
    window.__confirmMessages = [];
    window.confirm = (message) => {
      window.__confirmMessages.push(String(message));
      return true;
    };
  });
  await page.locator("#tab-list .tab-item").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='close-all']").evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__confirmMessages)).toEqual([
    "You have unsaved changes. Are you sure you want to close this tab?"
  ]);
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect(page.locator("#markdown-editor")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs")))).toEqual([]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("markdownViewerActiveTab"))).toBe(null);
});

test("copies markdown content to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);

  const markdown = "# Clipboard Check\n\nCopied from the editor.";
  await page.locator("#markdown-editor").fill(markdown);
  await page.locator("#copy-markdown-button").click({ force: true });

  await expect(page.locator("#copy-markdown-button")).toContainText("Copied!");
  await expect.poll(async () => {
    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    return copiedText.replace(/\r\n/g, "\n");
  }).toBe(markdown);
});

test("share URL restores markdown content on reload", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);

  await page.locator("#markdown-editor").fill("# Shared Document\n\nContent from a share link.");
  await page.locator("#share-button").click();

  await expect(page).toHaveURL(/#share=/);
  const sharedUrl = page.url();

  const sharedPage = await context.newPage();
  const sharedErrors = [];
  sharedPage.on("pageerror", (error) => sharedErrors.push(error.message));
  await stubBrowserLibraries(sharedPage);

  await sharedPage.goto(sharedUrl);
  await expect(sharedPage.locator("#markdown-editor")).toHaveValue(/Shared Document/);
  await expect(sharedPage.locator("#markdown-preview").getByRole("heading", { name: "Shared Document" })).toBeVisible();
  expect(sharedErrors).toEqual([]);
});

test("open folder uses the native directory picker when the browser exposes it", async ({ page }) => {
  await page.addInitScript(() => {
    window.__directoryPickerCalled = false;
    window.showDirectoryPicker = async () => {
      window.__directoryPickerCalled = true;
      throw new DOMException("User cancelled", "AbortError");
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();

  await expect.poll(() => page.evaluate(() => window.__directoryPickerCalled)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.markdownViewerFolderPickerMode)).toBe("native");
});

test("open folder falls back to folder input when native picker is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showDirectoryPicker;
    window.__folderInputClicked = false;
    var originalClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.id === "folder-input") {
        window.__folderInputClicked = true;
        return;
      }
      return originalClick.call(this);
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();

  await expect.poll(() => page.evaluate(() => window.__folderInputClicked)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.markdownViewerFolderPickerMode)).toBe("folder-input");
});
