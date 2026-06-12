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

          var image = line.match(/^!\\[([^\\]]*)\\]\\((\\S+)(?:\\s+"([^"]*)")?\\)$/);
          if (image) {
            if (inList) {
              html += "</ul>";
              inList = false;
            }
            html += "<p><img src=\\"" + escapeHtml(image[2]) + "\\" alt=\\"" + escapeHtml(image[1]) + "\\"" + (image[3] ? " title=\\"" + escapeHtml(image[3]) + "\\"" : "") + "></p>";
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

test("switches between editor, preview, and split views", async ({ page }) => {
  await openApp(page);

  const editorPane = page.locator(".editor-pane");
  const previewPane = page.locator(".preview-pane");
  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();

  await page.locator(".view-mode-btn[data-mode='preview']").click();
  await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");
  await expect(previewPane).toBeVisible();
  await expect(editorPane).not.toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();

  await page.locator(".view-mode-btn[data-mode='editor']").click();
  await expect(page.locator(".view-mode-btn[data-mode='editor']")).toHaveAttribute("aria-pressed", "true");
  await expect(editorPane).toBeVisible();
  await expect(previewPane).not.toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();

  await page.locator(".view-mode-btn[data-mode='split']").click();
  await expect(page.locator(".view-mode-btn[data-mode='split']")).toHaveAttribute("aria-pressed", "true");
  await expect(editorPane).toBeVisible();
  await expect(previewPane).toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();
});

test("hides the markdown formatting toolbar for graph tabs", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "toolbar_graph_e2e",
      title: "Toolbar Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Toolbar Graph E2E",
      graphViewConfig: { showTags: true, hiddenTagIds: [], hiddenNodeIds: [], selectedTagIds: [], groups: [], searchQuery: "", showArrows: true },
      graphSnapshot: {
        version: 1,
        folderName: "Toolbar Graph E2E",
        createdAt: Date.now(),
        nodes: [{ id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: [] }],
        links: [],
        files: [{ id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: [] }]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");

  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
  await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();
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

test("opens help and about from the action menu", async ({ page }) => {
  await page.route("**/wiki/Home.md", async (route) => {
    await route.fulfill({
      contentType: "text/markdown",
      body: "# MD-Editor Wiki\n\nHelp content from the wiki home file."
    });
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".help-menu-submenu > .dropdown-toggle").hover();
  await page.locator(".help-menu-submenu .open-welcome-page").click();

  await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "Welcome to MD-Editor" })).toBeVisible();
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Welcome to MD-Editor");

  await page.locator("#desktopActionMenu").click();
  await page.locator(".help-menu-submenu > .dropdown-toggle").hover();
  await page.locator(".help-menu-submenu .open-help-home").click();

  await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#markdown-preview").getByRole("heading", { name: "MD-Editor Wiki" })).toBeVisible();

  await page.locator("#desktopActionMenu").click();
  await page.locator(".help-menu-submenu > .dropdown-toggle").hover();
  await page.locator(".help-menu-submenu .show-about-dialog").click();

  const aboutModal = page.locator("#about-modal");
  await expect(aboutModal).toBeVisible();
  await expect(aboutModal.getByText("MD-Editor", { exact: true })).toBeVisible();
  await expect(aboutModal.locator("#about-app-version")).toHaveText("v7.1");
  await expect(aboutModal.locator("#about-release-date")).toHaveText("June 9, 2026");
  await expect(aboutModal.locator("#about-app-author")).toHaveText("ShayBC");
  await expect(aboutModal.getByText("Apache License 2.0")).toBeVisible();
  await expect(aboutModal.locator(".about-modal-logo")).toBeVisible();
});

test("settings menu updates graph auto-clustering threshold", async ({ page }) => {
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await expect(page.locator("#settings-modal")).toBeVisible();
  await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1000");
  await expect(page.locator("#settings-graph-render-warning-threshold")).toHaveValue("1500");
  await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("10");
  await expect(page.locator("#settings-graph-show-file-extensions")).not.toBeChecked();
  await expect(page.locator("#settings-graph-node-default-color")).toHaveValue("#58a6ff");
  await expect(page.locator("#settings-confirm-open-many-graph-nodes")).toBeChecked();
  await expect(page.locator("#settings-confirm-delete-files")).toBeChecked();
  await expect(page.locator("#settings-confirm-reset-state")).toBeChecked();
  await expect(page.locator("#settings-max-recent-files")).toHaveValue("10");
  await expect(page.locator("#settings-max-recent-folders")).toHaveValue("10");
  await expect(page.locator("#settings-context-menu-tooltip-delay")).toHaveValue("3000");

  await page.locator("#settings-graph-auto-cluster-threshold").fill("1200");
  await page.locator("#settings-graph-render-warning-threshold").fill("1800");
  await page.locator("#settings-graph-most-referenced-percent").fill("25");
  await page.locator("#settings-graph-show-file-extensions").check();
  await page.locator("#settings-graph-node-default-color").fill("#ff66cc");
  await page.locator("#settings-confirm-open-many-graph-nodes").uncheck();
  await page.locator("#settings-confirm-delete-files").uncheck();
  await page.locator("#settings-confirm-reset-state").uncheck();
  await page.locator("#settings-max-recent-files").fill("7");
  await page.locator("#settings-max-recent-folders").fill("5");
  await page.locator("#settings-context-menu-tooltip-delay").fill("900");
  await page.locator("#settings-modal-save").click();
  await expect(page.locator("#settings-modal")).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    return {
      threshold: state.graphAutoClusterThreshold,
      renderWarningThreshold: state.graphRenderWarningThreshold,
      mostReferencedPercent: state.graphMostReferencedPercent,
      showFileExtensions: state.graphShowFileExtensions,
      nodeDefaultColor: state.graphNodeDefaultColor,
      confirmOpenManyGraphNodes: state.confirmOpenManyGraphNodes,
      confirmDeleteFiles: state.confirmDeleteFiles,
      confirmResetState: state.confirmResetState,
      maxRecentFiles: state.maxRecentFiles,
      maxRecentFolders: state.maxRecentFolders,
      contextMenuTooltipDelayMs: state.contextMenuTooltipDelayMs
    };
  })).toEqual({
    threshold: 1200,
    renderWarningThreshold: 1800,
    mostReferencedPercent: 25,
    showFileExtensions: true,
    nodeDefaultColor: "#ff66cc",
    confirmOpenManyGraphNodes: false,
    confirmDeleteFiles: false,
    confirmResetState: false,
    maxRecentFiles: 7,
    maxRecentFolders: 5,
    contextMenuTooltipDelayMs: 900
  });

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1200");
  await expect(page.locator("#settings-graph-render-warning-threshold")).toHaveValue("1800");
  await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("25");
  await expect(page.locator("#settings-graph-show-file-extensions")).toBeChecked();
  await expect(page.locator("#settings-graph-node-default-color")).toHaveValue("#ff66cc");
  await expect(page.locator("#settings-confirm-open-many-graph-nodes")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-delete-files")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-reset-state")).not.toBeChecked();
  await expect(page.locator("#settings-max-recent-files")).toHaveValue("7");
  await expect(page.locator("#settings-max-recent-folders")).toHaveValue("5");
  await expect(page.locator("#settings-context-menu-tooltip-delay")).toHaveValue("900");
});

test("settings menu toggles graph node file extensions", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_label_extensions_e2e",
      title: "Label Extensions Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Label Extensions Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
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
        folderName: "Label Extensions Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "notes/alpha", label: "alpha", type: "file", status: "current" }
        ],
        links: [],
        files: [
          { id: "notes/alpha", path: "notes/alpha.md", name: "alpha.md", content: "# Alpha", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator(".graph-label-file")).toHaveText("alpha");

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await page.locator("#settings-graph-node-default-color").fill("#ff66cc");
  await page.locator("#settings-graph-show-file-extensions").check();
  await page.locator("#settings-modal-save").click();

  await expect(page.locator(".graph-label-file")).toHaveText("alpha.md");
  await expect.poll(() => page.locator(".graph-node-file").first().evaluate((node) => getComputedStyle(node).fill)).toBe("rgb(255, 102, 204)");
});

test("graph ctrl+f finds and highlights nodes without filtering the map", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_find_e2e",
      title: "Find Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Find Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1.2,
        centerForce: 0.7,
        repelForce: 240,
        linkForce: 0.6,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Find Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "Alpha Node", type: "file", status: "current" },
          { id: "alpha-notes.md", label: "Alpha Notes", type: "file", status: "current" },
          { id: "beta.md", label: "Beta Node", type: "file", status: "current" },
          { id: "gamma.md", label: "Gamma Node", type: "file", status: "current" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "alpha-notes.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", name: "Alpha Node.md", path: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha" },
          { id: "alpha-notes.md", name: "Alpha Notes.md", path: "alpha-notes.md", fullPath: "C:/vault/alpha-notes.md", content: "# Alpha Notes" },
          { id: "beta.md", name: "Beta Node.md", path: "beta.md", fullPath: "C:/vault/beta.md", content: "# Beta" },
          { id: "gamma.md", name: "Gamma Node.md", path: "gamma.md", fullPath: "C:/vault/gamma.md", content: "# Gamma" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(4);

  await page.locator(".graph-tab-render").click();
  await page.keyboard.press("Control+F");
  await expect(page.locator("#graph-find-dialog")).toBeVisible();

  await page.locator("#graph-find-input").fill("Alpha");
  await page.locator("#graph-find-ok").click();
  await expect(page.locator(".graph-node-file")).toHaveCount(4);
  await expect(page.locator(".graph-node-found")).toHaveCount(2);
  await expect(page.locator("#graph-find-dialog")).toHaveClass(/transparent/);

  await expect.poll(() => page.locator(".graph-tab-render:not(.hidden)").evaluate((render) => {
    const graphLayer = render.querySelector(".graph-layer");
    const transform = graphLayer?.getAttribute("transform") || "";
    return /translate\([^)]+\)\s*scale\([^)]+\)/.test(transform);
  })).toBe(true);

  await page.locator("#graph-find-dialog").dispatchEvent("click");
  await expect(page.locator("#graph-find-dialog")).not.toHaveClass(/transparent/);
  await page.locator("#graph-find-input").fill("Gamma");
  await page.locator("#graph-find-ok").click();
  await expect(page.locator(".graph-node-found")).toHaveCount(1);
  await expect(page.locator(".graph-label-found")).toHaveText("Gamma Node");

  await page.locator("#graph-find-dialog").dispatchEvent("click");
  await page.locator("#graph-find-cancel").click();
  await expect(page.locator("#graph-find-dialog")).toBeHidden();
  await expect(page.locator(".graph-node-found")).toHaveCount(0);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await page.locator("#settings-graph-find-highlight-color").fill("#ffea00");
  await page.locator("#settings-modal-save").click();
  await expect(page.locator("#settings-modal")).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}").graphFindHighlightColor)).toBe("#ffea00");

  await page.locator(".graph-tab-render").click();
  await page.keyboard.press("Control+F");
  await page.locator("#graph-find-input").fill("Beta");
  await page.locator("#graph-find-ok").click();
  await expect(page.locator(".graph-node-found")).toHaveCount(1);
  await expect.poll(() => page.locator(".graph-node-found").evaluate((node) => getComputedStyle(node).fill)).toBe("rgb(255, 234, 0)");
});

test("code converter dialog browses folders and runs converter", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_PATH = "C:/GitHub/shaybc/md-editor/desktop-app";
    window.NL_VERSION = "test";
    window.__folderDialogTitles = [];
    window.__execCommands = [];
    window.__clipboardText = "";
    window.__openedPaths = [];
    window.__readDirectories = [];
    document.execCommand = (command) => {
      if (command === "copy") {
        window.__clipboardText = document.activeElement?.value || "";
        return true;
      }
      return false;
    };
    const folderSelections = ["C:/src/project", "C:/docs/project-md"];
    window.Neutralino = {
      clipboard: {
        writeText: async (text) => {
          window.__clipboardText = text;
        }
      },
      os: {
        open: async (path) => {
          window.__openedPaths.push(path);
        },
        showFolderDialog: async (title) => {
          window.__folderDialogTitles.push(title);
          return folderSelections.shift();
        },
        execCommand: async (command) => {
          window.__execCommands.push(command);
          return { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
        }
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__readDirectories.push(path);
          return [];
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  const modal = page.locator("#code-converter-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Generates Markdown files from a source code folder");
  await expect(page.locator("#code-converter-type")).toHaveValue("builtin");
  await expect(page.locator("#code-converter-language-support")).toHaveText("Supported languages: JavaScript, TypeScript, Python, Java, and C#. Supported extensions: .js, .jsx, .mjs, .cjs, .ts, .tsx, .py, .java, and .cs.");
  await expect(page.locator("#code-converter-include-methods")).toBeChecked();
  await expect(page.locator("#code-converter-include-accessors")).toBeChecked();
  await expect(page.locator("#code-converter-include-signatures")).toBeChecked();
  await expect(page.locator("#code-converter-include-return-codes")).toBeChecked();
  await expect(page.locator("#code-converter-include-exceptions")).toBeChecked();
  await expect(page.locator("#code-converter-include-package")).toBeChecked();

  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await expect(page.locator("#code-converter-source-root")).toHaveValue("C:/src/project");
  await expect(page.locator("#code-converter-destination-root")).toHaveValue("C:/docs/project-md");

  await page.locator("#code-converter-run").click();
  await expect(page.locator("#code-converter-status")).toHaveText("Markdown files created in project-md.");
  await expect(page.locator("#code-converter-status .code-converter-status-link")).toHaveText("project-md");
  await expect(page.locator("#code-converter-status .code-converter-status-link")).toHaveAttribute("title", "C:/docs/project-md");
  await page.locator("#code-converter-status .code-converter-status-link").click();
  await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual(["C:/docs/project-md"]);
  await expect(page.locator("#code-converter-console-panel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#code-converter-console-output")).toContainText("Created 3 markdown file(s) in C:/docs/project-md");
  await page.locator("#code-converter-console-copy").click();
  await expect.poll(() => page.evaluate(() => window.__clipboardText)).toContain("Created 3 markdown file(s) in C:/docs/project-md");
  await expect(page.locator("#code-converter-cancel")).toBeHidden();
  await expect(page.locator("#code-converter-run")).toBeHidden();
  await expect(page.locator("#code-converter-open-folder")).toBeVisible();
  await expect(page.locator("#code-converter-finish")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    titles: window.__folderDialogTitles,
    commands: window.__execCommands
  }))).toEqual({
    titles: ["Select source code root folder", "Select destination Markdown root folder"],
    commands: ['node "C:/GitHub/shaybc/md-editor/desktop-app/resources/code_converter/dependency-md-generator.js" "C:/src/project" "C:/docs/project-md" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package']
  });

  await page.locator("#code-converter-open-folder").click();
  await expect.poll(() => page.evaluate(() => window.__readDirectories)).toEqual(["C:/docs/project-md"]);
  await expect(modal).toBeHidden();

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await expect(modal).toBeVisible();
  await page.locator("#code-converter-type").selectOption("java");
  await expect(page.locator("#code-converter-language-support")).toHaveText("Supported language: Java. Supported extension: .java.");
  await page.locator("#code-converter-include-signatures").uncheck();
  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await page.locator("#code-converter-run").click();
  await expect(page.locator("#code-converter-status")).toHaveText("Markdown files created in project-md.");
  await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
    'node "C:/GitHub/shaybc/md-editor/desktop-app/resources/code_converter/dependency-md-generator.js" "C:/src/project" "C:/docs/project-md" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package',
    'java -Xmx8g -jar "C:/GitHub/shaybc/md-editor/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --include-methods --include-accessors --include-return-codes --include-exceptions --include-package'
  ]);
});

test("code converter locks form controls while conversion is running", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_PATH = "C:/GitHub/shaybc/md-editor/desktop-app";
    window.NL_VERSION = "test";
    const folderSelections = ["C:/src/project", "C:/docs/project-md"];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => folderSelections.shift(),
        execCommand: async () => new Promise((resolve) => {
          window.__finishConversion = () => resolve({ exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" });
        })
      }
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await page.locator("#code-converter-run").click();

  await expect(page.locator("#code-converter-run")).toBeDisabled();
  await expect(page.locator("#code-converter-type")).toBeDisabled();
  await expect(page.locator("#code-converter-source-browse")).toBeDisabled();
  await expect(page.locator("#code-converter-destination-browse")).toBeDisabled();
  await expect(page.locator("#code-converter-include-methods")).toBeDisabled();
  await expect(page.locator("#code-converter-include-package")).toBeDisabled();
  await expect(page.locator("#code-converter-cancel")).toBeEnabled();

  await page.evaluate(() => window.__finishConversion());
  await expect(page.locator("#code-converter-finish")).toBeVisible();
  await expect(page.locator("#code-converter-type")).toBeEnabled();
  await expect(page.locator("#code-converter-include-methods")).toBeEnabled();
});

test("code converter streams spawned process output", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_PATH = "C:/GitHub/shaybc/md-editor/desktop-app";
    window.NL_VERSION = "test";
    const folderSelections = ["C:/src/project", "C:/docs/project-md"];
    window.__spawnedCommands = [];
    window.__finishConversion = null;
    window.Neutralino = {
      os: {
        showFolderDialog: async () => folderSelections.shift(),
        spawnProcess: async (command) => {
          window.__spawnedCommands.push(command);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("spawnedProcess", {
              detail: { id: 42, action: "stdOut", data: "[2026-06-12 20:11:00] Indexing 9355 Java files..." }
            }));
          }, 0);
          return { id: 42, pid: 4242 };
        },
        updateSpawnedProcess: async () => {},
      }
    };
    window.__finishConversion = () => {
      window.dispatchEvent(new CustomEvent("spawnedProcess", {
        detail: { id: 42, action: "exit", data: { exitCode: 0 } }
      }));
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await page.locator("#code-converter-run").click();

  await expect(page.locator("#code-converter-console-output")).toContainText("Indexing 9355 Java files");
  await expect(page.locator("#code-converter-run")).toBeDisabled();
  await page.evaluate(() => window.__finishConversion());
  await expect(page.locator("#code-converter-finish")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__spawnedCommands.length)).toBe(1);
});

test("code converter ignores backdrop clicks", async ({ page }) => {
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  const modal = page.locator("#code-converter-modal");
  await expect(modal).toBeVisible();

  await modal.dispatchEvent("click");
  await expect(modal).toBeVisible();

  await page.locator("#code-converter-cancel").click();
  await expect(modal).toBeHidden();
});

test("code converter remembers source and destination folder choices", async ({ page }) => {
  await page.addInitScript(() => {
    window.__folderDialogCalls = [];
    const folderSelections = [
      "C:/src/first",
      "C:/src/second",
      "C:/vault/first",
      "C:/vault/second"
    ];
    window.Neutralino = {
      os: {
        showFolderDialog: async (title, options) => {
          window.__folderDialogCalls.push({ title, options: options || null });
          return folderSelections.shift();
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await page.locator("#code-converter-source-browse").click();
  await expect(page.locator("#code-converter-source-root")).toHaveValue("C:/src/first");
  await page.locator("#code-converter-source-browse").click();
  await expect(page.locator("#code-converter-source-root")).toHaveValue("C:/src/second");

  await page.locator("#code-converter-destination-browse").click();
  await expect(page.locator("#code-converter-destination-root")).toHaveValue("C:/vault/first");
  await page.locator("#code-converter-destination-browse").click();
  await expect(page.locator("#code-converter-destination-root")).toHaveValue("C:/vault/second");

  await expect.poll(() => page.evaluate(() => window.__folderDialogCalls)).toEqual([
    { title: "Select source code root folder", options: null },
    { title: "Select source code root folder", options: { defaultPath: "C:/src/first" } },
    { title: "Select destination Markdown root folder", options: null },
    { title: "Select destination Markdown root folder", options: { defaultPath: "C:/vault/first" } }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    return {
      destination: state.codeConverterDestinationRoot,
      source: state.codeConverterSourceRoot
    };
  })).toEqual({
    destination: "C:/vault/second",
    source: "C:/src/second"
  });
});

test("java converter resolves jar from neutralino working directory", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_CWD = "C:/GitHub/shaybc/md-editor";
    window.NL_VERSION = "test";
    window.__execCommands = [];
    const folderSelections = ["C:/src/project", "C:/docs/project-md"];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => folderSelections.shift(),
        execCommand: async (command) => {
          window.__execCommands.push(command);
          return { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await page.locator("#code-converter-type").selectOption("java");
  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await page.locator("#code-converter-run").click();

  await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
    'java -Xmx8g -jar "C:/GitHub/shaybc/md-editor/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package'
  ]);
});

test("java converter falls back to sibling repo jar when runtime path globals are missing", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.__execCommands = [];
    const folderSelections = ["C:/src/project", "C:/docs/project-md"];
    window.Neutralino = {
      filesystem: {
        getStats: async (path) => {
          if (path === "../java_converter/target/java_converter.jar") return { type: "file" };
          throw new Error("missing");
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift(),
        execCommand: async (command) => {
          window.__execCommands.push(command);
          return { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
        }
      }
    };
  });
  await openApp(page);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-code-converter-dialog").first().click();
  await page.locator("#code-converter-type").selectOption("java");
  await page.locator("#code-converter-source-browse").click();
  await page.locator("#code-converter-destination-browse").click();
  await page.locator("#code-converter-run").click();

  await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
    'java -Xmx8g -jar "../java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package'
  ]);
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
  await expect.poll(() => page.locator("#markdown-preview").textContent()).toContain("Section 80");
  await expect.poll(() => page.locator("#markdown-editor").evaluate((editor) => editor.scrollHeight > editor.clientHeight)).toBe(true);
  await expect.poll(() => page.locator(".preview-pane").evaluate((pane) => pane.scrollHeight > pane.clientHeight)).toBe(true);

  await page.locator("#markdown-editor").evaluate((editor) => {
    editor.scrollTop = editor.scrollHeight - editor.clientHeight;
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

test("converts selected editor text from the formatting toolbar", async ({ page }) => {
  await openApp(page);

  const editor = page.locator("#markdown-editor");
  await editor.fill("Toolbar heading");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });

  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();
  await page.locator(".editor-format-button[data-editor-format-action='heading-1']").click();

  await expect(editor).toHaveValue("# Toolbar heading");
  await page.locator(".editor-format-button[data-editor-format-action='undo']").click();
  await expect(editor).toHaveValue("Toolbar heading");
  await page.locator(".editor-format-button[data-editor-format-action='redo']").click();
  await expect(editor).toHaveValue("# Toolbar heading");

  await editor.fill("**Bold** and [link](https://example.com)");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='clear-formatting']").click();
  await expect(page.locator("#editor-clear-markdown-modal")).toBeVisible();
  await page.locator("#editor-clear-markdown-apply").click();
  await expect(editor).toHaveValue("Bold and link");

  await editor.fill("small heading");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='heading-6']").click();
  await expect(editor).toHaveValue("###### small heading");

  await editor.fill("removed");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='strikethrough']").click();

  await expect(editor).toHaveValue("~~removed~~");

  await editor.fill("mIXed WORDS");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='title-case']").click();
  await expect(editor).toHaveValue("Mixed Words");

  await editor.fill("make me loud");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='uppercase']").click();
  await expect(editor).toHaveValue("MAKE ME LOUD");

  await editor.fill("MAKE ME QUIET");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='lowercase']").click();
  await expect(editor).toHaveValue("make me quiet");

  await editor.fill("OpenAI docs");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='link']").click();
  await expect(page.locator("#editor-link-modal")).toBeVisible();
  await expect(page.locator("#editor-link-text")).toHaveValue("OpenAI docs");
  await page.locator("#editor-link-url").fill("https://openai.com");
  await page.locator("#editor-link-apply").click();
  await expect(editor).toHaveValue("[OpenAI docs](https://openai.com)");

  await editor.fill("italic text");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='reference']").click();
  await expect(page.locator("#editor-reference-modal")).toBeVisible();
  await expect(page.locator("#editor-reference-number")).toHaveValue("[1]");
  await page.locator("#editor-reference-url").fill("https://example.com/ref");
  await page.locator("#editor-reference-title").fill("Reference title");
  await page.locator("#editor-reference-apply").click();
  await expect(editor).toHaveValue('italic text[1]\n\n[1]: https://example.com/ref "Reference title"');

  await editor.fill("Architecture chart");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='image']").click();
  await expect(page.locator("#editor-image-modal")).toBeVisible();
  await expect(page.locator("#editor-image-alt")).toHaveValue("Architecture chart");
  await page.locator("#editor-image-url").fill("https://example.com/chart.png");
  await page.locator("#editor-image-apply").click();
  await expect(editor).toHaveValue('![Architecture chart](https://example.com/chart.png "Architecture chart")');

  await page.evaluate(() => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", { type: "image/png" });
    window.markdownViewerApp.state.currentFolderTreeNodes = [
      {
        kind: "directory",
        name: "images",
        path: "images",
        children: [{ kind: "file", name: "diagram.png", path: "images/diagram.png", file }]
      }
    ];
  });
  await editor.fill("Local diagram");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='image']").click();
  await page.locator("input[name='editor-image-source'][value='file']").check();
  await expect(page.locator("#editor-image-file-fields")).toBeVisible();
  await page.locator("#editor-image-file-path").fill("images/diagram.png");
  await page.locator("#editor-image-apply").click();
  await expect(editor).toHaveValue('![Local diagram](images/diagram.png "Local diagram")');
  await expect.poll(() => page.locator("#markdown-preview img[alt='Local diagram']").getAttribute("src"))
    .toContain("blob:");

  await editor.fill("Review this before release.");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='alert']").click();
  await expect(page.locator("#editor-alert-modal")).toBeVisible();
  await expect(page.locator(".editor-alert-card.is-selected")).toHaveAttribute("data-alert-type", "NOTE");
  await page.locator(".editor-alert-card[data-alert-type='WARNING']").click();
  await page.locator("#editor-alert-apply").click();
  await expect(editor).toHaveValue("> [!WARNING]\n> Review this before release.");

  await editor.fill("Copyright ");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='symbol']").click();
  await expect(page.locator("#editor-symbol-modal")).toBeVisible();
  await expect(page.locator(".editor-symbol-card.is-selected")).toHaveAttribute("data-entity", "&copy;");
  await page.locator("#editor-symbol-search").fill("right arrow");
  await page.locator(".editor-symbol-card[data-entity='&rarr;']").click();
  await page.locator("#editor-symbol-apply").click();
  await expect(editor).toHaveValue("Copyright &rarr;");

  await editor.fill("Ship it ");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
  });
  await page.locator(".editor-format-button[data-editor-format-action='emoji']").click();
  await expect(page.locator("#editor-emoji-modal")).toBeVisible();
  await expect(page.locator(".editor-emoji-card.is-selected")).toHaveAttribute("data-shortcode", ":+1:");
  await page.locator("#editor-emoji-search").fill("rocket");
  await page.locator(".editor-emoji-card[data-shortcode=':rocket:']").click();
  await page.locator("#editor-emoji-apply").click();
  await expect(editor).toHaveValue("Ship it :rocket:");

  await editor.fill("alpha beta alpha");
  await editor.evaluate((textarea) => {
    textarea.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = 5;
  });
  await page.locator(".editor-format-button[data-editor-format-action='find-replace']").click();
  await expect(page.locator("#editor-find-replace-modal")).toBeVisible();
  await expect(page.locator("#editor-find-input")).toHaveValue("alpha");
  await expect(page.locator("#editor-find-replace-status")).toHaveText("1 of 2 matches");
  await page.locator("#editor-replace-input").fill("gamma");
  await page.locator("#editor-replace-one").click();
  await expect(editor).toHaveValue("gamma beta alpha");
  await expect(page.locator("#editor-find-replace-status")).toHaveText("1 of 1 matches");
  await page.locator("#editor-replace-all").click();
  await expect(editor).toHaveValue("gamma beta gamma");
});

test("mirrors editor markdown syntax in the highlight overlay", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill("# Overlay Title\n\n- **Important** item");

  await expect(page.locator("#editor-syntax-highlight .editor-md-marker")).toHaveText("#");
  await expect(page.locator("#editor-syntax-highlight .editor-md-heading")).toContainText("Overlay Title");
  await expect(page.locator("#editor-syntax-highlight .editor-md-list")).toHaveText("-");
  await expect(page.locator("#editor-syntax-highlight .editor-md-strong")).toHaveText("**Important**");
});

test("marks Mermaid v11 syntax risks in the editor", async ({ page }) => {
  await openApp(page);

  await page.locator("#markdown-editor").fill([
    "```mermaid",
    "graph TD",
    "    A -->|ok| end",
    "    B[User (Admin)] --> C",
    "```"
  ].join("\n"));

  const warnings = page.locator("#editor-syntax-highlight .editor-mermaid-warning");
  await expect(warnings.filter({ hasText: "end" })).toHaveCount(1);
  await expect(warnings.filter({ hasText: "User (Admin)" })).toHaveCount(1);

  await warnings.filter({ hasText: "end" }).dispatchEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    clientX: 180,
    clientY: 180
  });

  await expect(page.locator(".editor-mermaid-tooltip")).toBeVisible();
  await expect(page.locator(".editor-mermaid-tooltip")).toContainText("Mermaid syntax risk");
  await expect(page.locator(".editor-mermaid-tooltip")).toContainText("keyword");

  await page.locator("#markdown-editor").dispatchEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 20
  });
  await expect(page.locator(".editor-mermaid-tooltip")).toBeHidden();
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
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "delta.md", label: "delta.md", fullPath: "C:/vault/delta.md", type: "file", status: "current", tags: [] },
          { id: "epsilon.md", label: "epsilon.md", fullPath: "C:/vault/epsilon.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] },
          { id: "tag:defined", label: "#defined", type: "tag", status: "current", tag: "defined" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "delta.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "epsilon.md", target: "gamma.md", type: "link", status: "current" },
          { source: "alpha.md", target: "tag:defined", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha\n\n[[beta]]", fullPath: "C:/vault/alpha.md", status: "current", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "---\nsource_file: C:\\src\\Beta.java\n---\n# Beta\n\n[[delta]]", fullPath: "C:/vault/beta.md", status: "current", tags: [] },
          { id: "delta.md", path: "delta.md", name: "delta.md", content: "---\nsource_file: C:\\src\\nested\\Delta.java\n---\n# Delta", fullPath: "C:/vault/delta.md", status: "current", tags: [] },
          { id: "epsilon.md", path: "epsilon.md", name: "epsilon.md", content: "---\nsource_file: C:\\src\\Epsilon.java\n---\n# Epsilon\n\n[[gamma]]", fullPath: "C:/vault/epsilon.md", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "---\nsource_file: C:\\src\\Gamma.java\n---\n# Gamma\n\n[[alpha]]", fullPath: "C:/vault/gamma.md", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["ghost", "archive"], graphMagneticEnabled: true, contextMenuTooltipDelayMs: 0 }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");

  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(6);

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
  await expect(graphMenu).toContainText("Open in a new tab");
  await expect(graphMenu.getByRole("button", { name: "Turn magnetic forces off" })).toBeHidden();
  await expect(graphMenu.getByRole("button", { name: "Open all" })).toBeHidden();
  await expect(graphMenu.getByRole("button", { name: "Remove Leaf Nodes" })).toBeHidden();
  await expect(graphMenu.getByRole("button", { name: "Center Graph" })).toBeHidden();
  await expect(graphMenu.locator(".tags-context-menu-item")).toHaveText(["#defined"]);
  await expect(graphMenu.evaluate((menu) => Array.from(menu.children).map((child) => child.textContent.trim()))).resolves.not.toContain("Share");
  await graphMenu.locator(".graph-context-menu-submenu", { hasText: "Export" }).evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(graphMenu.locator(".graph-context-menu-submenu", { hasText: "Export" }).locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Share",
    "Export as Markdown",
    "Export as HTML",
    "Export as PDF",
    "Export original node"
  ]);
  await expect.poll(() => graphMenu.evaluate(async (menu) => {
    const getMenuButton = (label) => Array.from(menu.querySelectorAll(".graph-context-menu-item"))
      .find((button) => button.querySelector(".graph-context-menu-item-label")?.textContent?.trim() === label);
    const openInNewTabItem = getMenuButton("Open in a new tab");
    const renameItem = getMenuButton("Rename");
    const copyItem = getMenuButton("Copy");
    openInNewTabItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const openVisibleAfterEnter = openInNewTabItem.classList.contains("tooltip-visible");
    renameItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const openHiddenAfterRenameEnter = !openInNewTabItem.classList.contains("tooltip-visible");
    const renameVisibleAfterEnter = renameItem.classList.contains("tooltip-visible");
    copyItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const renameHiddenAfterSubmenuEnter = !renameItem.classList.contains("tooltip-visible");
    const copySubmenuHasNoTooltip = !copyItem.classList.contains("graph-context-menu-tooltip")
      && !copyItem.classList.contains("tooltip-visible")
      && !copyItem.dataset.tooltip;
    return {
      openVisibleAfterEnter,
      openHiddenAfterRenameEnter,
      renameVisibleAfterEnter,
      renameHiddenAfterSubmenuEnter,
      copySubmenuHasNoTooltip
    };
  })).toEqual({
    openVisibleAfterEnter: true,
    openHiddenAfterRenameEnter: true,
    renameVisibleAfterEnter: true,
    renameHiddenAfterSubmenuEnter: true,
    copySubmenuHasNoTooltip: true
  });

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  const mapMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(mapMenu).toContainText("Turn magnetic forces off");
  await expect(mapMenu).toContainText("Remove Leaf Nodes");
  await expect(mapMenu.getByRole("button", { name: "Center Graph" })).toBeVisible();
  await expect(mapMenu.getByRole("button", { name: "Open in a new tab" })).toBeHidden();

  await mapMenu.getByText("Turn magnetic forces off").click();
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
  await expect.poll(() => page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).locator(".graph-context-menu-submenu-panel").evaluate((panel) => {
    return Array.from(panel.children).map((child) => {
      if (child.classList.contains("graph-context-menu-separator")) return "separator";
      return child.textContent.trim();
    });
  })).toEqual([
    "Copy path",
    "Copy content",
    "Copy frontmatter",
    "Copy tags",
    "separator",
    "Copy dependencies",
    "Copy full dependencies",
    "Copy backlinks",
    "Copy full network"
  ]);
  await page.locator(".graph-context-menu-item", { hasText: "Copy path" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("C:/vault/alpha.md");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy content" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain("# Alpha");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy frontmatter" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("---\ntags: [defined]\n---");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy tags" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("defined");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy full dependencies" }).dispatchEvent("click");
  const copyOptionsModal = page.locator("#graph-copy-options-modal");
  await expect(copyOptionsModal).toBeVisible();
  await expect(page.locator("#graph-copy-option-file-name")).toBeChecked();
  await expect(page.locator("#graph-copy-option-extension")).toBeChecked();
  await expect(page.locator("#graph-copy-option-full-path")).toBeChecked();
  await expect(page.locator("#graph-copy-option-source-file")).not.toBeChecked();
  await page.locator("#graph-copy-option-file-name").uncheck();
  await page.locator("#graph-copy-option-extension").uncheck();
  await page.locator("#graph-copy-option-full-path").uncheck();
  await expect(page.locator("#graph-copy-options-ok")).toBeDisabled();
  await page.locator("#graph-copy-option-file-name").check();
  await page.locator("#graph-copy-option-extension").check();
  await page.locator("#graph-copy-option-full-path").check();
  await page.locator("#graph-copy-options-ok").click();
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("C:/vault/alpha.md\nC:/vault/beta.md\nC:/vault/delta.md");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy full network" }).dispatchEvent("click");
  await expect(copyOptionsModal).toBeVisible();
  await page.locator("#graph-copy-option-full-path").uncheck();
  await page.locator("#graph-copy-option-source-file").check();
  await page.locator("#graph-copy-options-ok").click();
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("alpha.md\nGamma.java\nEpsilon.java\nBeta.java\nDelta.java");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Show graph" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Show full network" }).dispatchEvent("click");
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Full Network: alpha.md");
  const activeGraph = page.locator(".graph-tab-render:not(.hidden)");
  await expect(activeGraph.locator(".graph-node-file")).toHaveCount(5);
  await expect(activeGraph.locator(".graph-node-tag")).toHaveCount(0);
});

test("local graph warning uses the focused graph node count", async ({ page }) => {
  await page.addInitScript(() => {
    window.__graphConfirmMessages = [];
    window.confirm = (message) => {
      window.__graphConfirmMessages.push(String(message));
      return false;
    };

    const nodes = Array.from({ length: 12 }, (_, index) => {
      const number = index + 1;
      return {
        id: `node-${number}.md`,
        label: `node-${number}.md`,
        type: "file",
        status: "current",
        fullPath: `C:/vault/node-${number}.md`
      };
    });
    const links = [
      { source: "node-1.md", target: "node-2.md", type: "link", status: "current" },
      { source: "node-1.md", target: "node-3.md", type: "link", status: "current" },
      { source: "node-4.md", target: "node-5.md", type: "link", status: "current" },
      { source: "node-6.md", target: "node-7.md", type: "link", status: "current" }
    ];
    const graphTab = {
      id: "local_warning_graph_e2e",
      title: "Large Source Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Large Source Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Large Source Graph",
        createdAt: Date.now(),
        nodes,
        links,
        files: nodes.map((node) => ({
          id: node.id,
          path: node.id,
          name: node.id,
          content: `# ${node.label}`,
          fullPath: node.fullPath,
          status: "current",
          tags: []
        }))
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      graphRenderWarningThreshold: 5,
      confirmOpenManyGraphNodes: true,
      contextMenuTooltipDelayMs: 0
    }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(12);

  const seedNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "node-1.md" }) }).first();
  await seedNode.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Show graph" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Show local graph" }).dispatchEvent("click");

  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Local Graph: node-1.md");
  await expect(page.locator(".graph-tab-render:not(.hidden)").locator(".graph-node-file")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__graphConfirmMessages)).toEqual([]);
});

test("graph node context menu adds point scopes to other graph tabs", async ({ page }) => {
  await page.addInitScript(() => {
    const baseConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true,
      textFadeThreshold: 0.35,
      nodeSize: 0.8,
      linkThickness: 1,
      centerForce: 1,
      repelForce: 650,
      linkForce: 0.4,
      linkDistance: 170
    };
    const sourceNodes = [
      { id: "alpha.md", label: "alpha.md", fullPath: "C:/source/alpha.md", type: "file", status: "current", tags: [] },
      { id: "beta.md", label: "beta.md", fullPath: "C:/source/beta.md", type: "file", status: "current", tags: [] },
      { id: "gamma.md", label: "gamma.md", fullPath: "C:/source/gamma.md", type: "file", status: "current", tags: [] },
      { id: "delta.md", label: "delta.md", fullPath: "C:/source/delta.md", type: "file", status: "current", tags: [] },
      { id: "epsilon.md", label: "epsilon.md", fullPath: "C:/source/epsilon.md", type: "file", status: "current", tags: [] }
    ];
    const sourceLinks = [
      { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
      { source: "alpha.md", target: "gamma.md", type: "link", status: "current" },
      { source: "beta.md", target: "delta.md", type: "link", status: "current" },
      { source: "epsilon.md", target: "alpha.md", type: "link", status: "current" }
    ];
    const sourceFiles = sourceNodes.map((node) => ({
      id: node.id,
      path: node.id,
      name: node.id,
      content: `# ${node.label}`,
      fullPath: node.fullPath,
      status: "current",
      tags: []
    }));
    const createTargetTab = (id, title, nodes = [], links = [], extraConfig = {}) => ({
      id,
      title,
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: title,
      graphViewConfig: { ...baseConfig, ...extraConfig },
      graphSnapshot: {
        version: 1,
        folderName: title,
        createdAt: Date.now(),
        nodes,
        links,
        files: nodes.map((node) => ({
          id: node.id,
          path: node.id,
          name: node.id,
          content: `# ${node.label}`,
          fullPath: node.fullPath,
          status: "current",
          tags: []
        }))
      }
    });
    const sourceTab = createTargetTab("add_scope_source", "Source Graph", sourceNodes, sourceLinks);
    const pointTarget = createTargetTab("add_scope_point", "Point Target", [
      { id: "beta.md", label: "beta.md", fullPath: "C:/source/beta.md", type: "file", status: "current", tags: [] }
    ]);
    const localTarget = createTargetTab("add_scope_local", "Focused Target", [
      { id: "seed.md", label: "seed.md", fullPath: "C:/target/seed.md", type: "file", status: "current", tags: [] },
      ...sourceNodes
    ], sourceLinks, { mode: "local", focusNodeId: "seed.md" });
    const fullLocalTarget = createTargetTab("add_scope_full_local", "Full Local Target");
    const fullNetworkTarget = createTargetTab("add_scope_full_network", "Full Network Target");
    sourceTab.graphSnapshot.files = sourceFiles;
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ contextMenuTooltipDelayMs: 0 }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([sourceTab, pointTarget, localTarget, fullLocalTarget, fullNetworkTarget]));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  const addAlphaScopeToTarget = async (targetText, actionText) => {
    await page.locator("#tab-list .tab-item", { hasText: "Source Graph" }).click();
    const alphaNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "alpha.md" }) }).first();
    await alphaNode.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 220,
      clientY: 220
    });
    const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
    await addSubmenu.hover();
    await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: actionText }).evaluate((button) => button.click());
    const chooser = page.locator(".graph-add-to-tab-modal");
    await expect(chooser).toBeVisible();
    const targetRow = chooser.locator(".graph-add-to-tab-row", { hasText: targetText });
    await expect(targetRow).toHaveAttribute("title", targetText);
    await targetRow.click();
    await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();
    await expect(page.locator("#tab-list .tab-item.active")).toContainText(targetText);
  };

  await addAlphaScopeToTarget("Point Target", "Add point to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_point");
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "beta.md"],
    links: ["alpha.md->beta.md"]
  });

  await addAlphaScopeToTarget("Focused Target", "Add local graph to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_local");
    return {
      mode: target.graphViewConfig.mode,
      allowedNodeIds: target.graphViewConfig.allowedNodeIds.slice().sort(),
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort()
    };
  })).toEqual({
    mode: "custom",
    allowedNodeIds: ["alpha.md", "beta.md", "gamma.md", "seed.md"],
    nodes: ["alpha.md", "beta.md", "delta.md", "epsilon.md", "gamma.md", "seed.md"]
  });

  await addAlphaScopeToTarget("Full Local Target", "Add full local graph to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_full_local");
    return target.graphSnapshot.nodes.map((node) => node.id).sort();
  })).toEqual(["alpha.md", "beta.md", "delta.md", "gamma.md"]);

  await addAlphaScopeToTarget("Full Network Target", "Add full network to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_full_network");
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "beta.md", "delta.md", "epsilon.md", "gamma.md"],
    links: ["alpha.md->beta.md", "alpha.md->gamma.md", "beta.md->delta.md", "epsilon.md->alpha.md"]
  });
});

test("graph add to tab asks before preserving conflicting points", async ({ page }) => {
  await page.addInitScript(() => {
    window.__graphConfirmMessages = [];
    window.__graphConfirmResponses = [true, false];
    window.confirm = (message) => {
      window.__graphConfirmMessages.push(String(message));
      return window.__graphConfirmResponses.shift() ?? false;
    };
    const graphViewConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true
    };
    const sourceTab = {
      id: "conflict_source",
      title: "Conflict Source",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Conflict Source",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Conflict Source",
        createdAt: Date.now(),
        nodes: [{ id: "alpha.md", label: "alpha.md", fullPath: "C:/source/alpha.md", type: "file", status: "current", tags: [] }],
        links: [],
        files: [{ id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Source Alpha", fullPath: "C:/source/alpha.md", status: "current", tags: [] }]
      }
    };
    const targetTab = {
      id: "conflict_target",
      title: "Conflict Target",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Conflict Target",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Conflict Target",
        createdAt: Date.now(),
        nodes: [{ id: "alpha.md", label: "alpha.md", fullPath: "C:/target/alpha.md", type: "file", status: "current", tags: [] }],
        links: [],
        files: [{ id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Target Alpha", fullPath: "C:/target/alpha.md", status: "current", tags: [] }]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([sourceTab, targetTab]));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  const addPointToConflictTarget = async () => {
    await page.locator("#tab-list .tab-item", { hasText: "Conflict Source" }).click();
    await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 220,
      clientY: 220
    });
    const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
    await addSubmenu.hover();
    await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Add point to Tab ..." }).evaluate((button) => button.click());
    const chooser = page.locator(".graph-add-to-tab-modal");
    await expect(chooser).toBeVisible();
    const targetRow = chooser.locator(".graph-add-to-tab-row", { hasText: "Conflict Target" });
    await expect(targetRow).toHaveAttribute("title", "Conflict Target");
    await targetRow.click();
    await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();
  };

  await addPointToConflictTarget();
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "conflict_target");
    return target.graphSnapshot.nodes.map((node) => ({
      id: node.id,
      originalId: node.originalId || "",
      sourceGraphTitle: node.sourceGraphTitle || ""
    })).sort((a, b) => a.id.localeCompare(b.id));
  })).toEqual([
    { id: "alpha.md", originalId: "", sourceGraphTitle: "" },
    { id: "alpha.md@@conflict-source", originalId: "alpha.md", sourceGraphTitle: "Conflict Source" }
  ]);

  await addPointToConflictTarget();
  await expect.poll(() => page.evaluate(() => window.__graphConfirmMessages.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "conflict_target");
    return target.graphSnapshot.nodes.length;
  })).toBe(2);
});

test("graph add to tab skips same source relative path conflicts", async ({ page }) => {
  await page.addInitScript(() => {
    window.__graphConfirmMessages = [];
    window.confirm = (message) => {
      window.__graphConfirmMessages.push(String(message));
      return true;
    };
    const graphViewConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true
    };
    const sourceTab = {
      id: "same_source_import",
      title: "Same Source Import",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Same Source Import",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Same Source Import",
        createdAt: Date.now(),
        nodes: [{ id: "docs/alpha.md", label: "alpha.md", fullPath: "C:/vault/docs/alpha.md", type: "file", status: "current", tags: [] }],
        links: [],
        files: [{ id: "docs/alpha.md", path: "docs/alpha.md", name: "alpha.md", content: "# Source Alpha", fullPath: "C:/vault/docs/alpha.md", status: "current", tags: [] }]
      }
    };
    const targetTab = {
      id: "same_source_target",
      title: "Same Source Target",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Same Source Target",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Same Source Target",
        createdAt: Date.now(),
        nodes: [{ id: "docs/alpha.md", label: "alpha.md", fullPath: "C:/vault/docs/alpha.md", type: "file", status: "current", tags: ["existing"] }],
        links: [],
        files: [{ id: "docs/alpha.md", path: "docs/alpha.md", name: "alpha.md", content: "# Target Alpha", fullPath: "C:/vault/docs/alpha.md", status: "current", tags: ["existing"] }]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([sourceTab, targetTab]));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
  await addSubmenu.hover();
  await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Add point to Tab ..." }).evaluate((button) => button.click());
  const chooser = page.locator(".graph-add-to-tab-modal");
  await expect(chooser).toBeVisible();
  await chooser.locator(".graph-add-to-tab-row", { hasText: "Same Source Target" }).click();
  await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();

  await expect.poll(() => page.evaluate(() => window.__graphConfirmMessages)).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "same_source_target");
    return target.graphSnapshot.nodes.map((node) => node.id);
  })).toEqual(["docs/alpha.md"]);
});

test("center graph action restores nodes when saved pan is off screen", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "center_graph_e2e",
      title: "Center Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Center Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphLayout: {
        magneticEnabled: false,
        zoom: { x: -10000, y: -10000, k: 1 },
        nodes: {
          "alpha.md": { x: 120, y: 140 },
          "beta.md": { x: 280, y: 140 },
          "gamma.md": { x: 200, y: 300 }
        }
      },
      graphSnapshot: {
        version: 1,
        folderName: "Center Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", fullPath: "C:/vault/alpha.md", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", fullPath: "C:/vault/beta.md", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", fullPath: "C:/vault/gamma.md", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  const graphRender = page.locator(".graph-tab-render");
  await expect(graphRender).toBeVisible();

  await graphRender.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  const mapMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(mapMenu.getByRole("button", { name: "Center Graph" })).toBeVisible();
  await mapMenu.getByRole("button", { name: "Center Graph" }).click();

  await expect.poll(() => page.evaluate(() => {
    const render = document.querySelector(".graph-tab-render:not(.hidden)");
    if (!render) return false;
    const renderRect = render.getBoundingClientRect();
    const nodeRects = Array.from(render.querySelectorAll(".graph-node-file"))
      .map((node) => node.getBoundingClientRect());
    const nodesInView = nodeRects.filter((nodeRect) => (
      nodeRect.right >= renderRect.left
      && nodeRect.left <= renderRect.right
      && nodeRect.bottom >= renderRect.top
      && nodeRect.top <= renderRect.bottom
    )).length;
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    const zoom = tabs[0]?.graphLayout?.zoom;
    return nodeRects.length === 3
      && nodesInView >= 2
      && Number.isFinite(zoom?.x)
      && Number.isFinite(zoom?.y)
      && Math.abs(zoom.x + 10000) > 1000
      && Math.abs(zoom.y + 10000) > 1000;
  })).toBe(true);
});

test("graph map context menu exports original source files for visible nodes", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/src/util/a.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/a.java\"\n---\n# A";
          if (path === "C:/vault/src/util/b.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/b.java\"\n---\n# B";
          if (path === "C:/workspace/my_project/src/util/a.java") return "class A {}";
          if (path === "C:/workspace/my_project/src/util/b.java") return "class B {}";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
    const graphTab = {
      id: "export_original_nodes_graph_e2e",
      title: "Export Original Nodes Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Export Original Nodes Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Export Original Nodes Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "src/util/a.java", label: "a.java", type: "file", status: "current", fullPath: "C:/vault/src/util/a.java.md" },
          { id: "src/util/b.java", label: "b.java", type: "file", status: "current", fullPath: "C:/vault/src/util/b.java.md" }
        ],
        links: [],
        files: [
          { id: "src/util/a.java", path: "src/util/a.java.md", name: "a.java.md", fullPath: "C:/vault/src/util/a.java.md", status: "current" },
          { id: "src/util/b.java", path: "src/util/b.java.md", name: "b.java.md", fullPath: "C:/vault/src/util/b.java.md", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await page.locator(".graph-context-menu-item", { hasText: "Export original nodes" }).click();

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/src/util/a.java", content: "class A {}" },
    { path: "C:/temp/sub_project/my_project/src/util/b.java", content: "class B {}" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/src",
    "C:/temp/sub_project/my_project/src/util"
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 2 original files." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
  await expect(completeModal).toBeHidden();
});

test("graph node export submenu exports only that original source file", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__writes = [];
    window.__openedFolders = [];
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/src/util/a.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/a.java\"\n---\n# A";
          if (path === "C:/vault/src/util/b.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/b.java\"\n---\n# B";
          if (path === "C:/workspace/my_project/src/util/a.java") return "class A {}";
          if (path === "C:/workspace/my_project/src/util/b.java") return "class B {}";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async () => {},
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
    const graphTab = {
      id: "export_original_node_graph_e2e",
      title: "Export Original Node Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Export Original Node Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Export Original Node Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "src/util/a.java", label: "a.java", type: "file", status: "current", fullPath: "C:/vault/src/util/a.java.md" },
          { id: "src/util/b.java", label: "b.java", type: "file", status: "current", fullPath: "C:/vault/src/util/b.java.md" }
        ],
        links: [],
        files: [
          { id: "src/util/a.java", path: "src/util/a.java.md", name: "a.java.md", fullPath: "C:/vault/src/util/a.java.md", status: "current" },
          { id: "src/util/b.java", path: "src/util/b.java.md", name: "b.java.md", fullPath: "C:/vault/src/util/b.java.md", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  const nodeA = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "a.java" }) }).first();
  await nodeA.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Export" }).hover();
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-submenu", { hasText: "Export" })
    .locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Export original node" })
    .evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/src/util/a.java", content: "class A {}" }
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 1 original file." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar folder context menu exports original source files for that subtree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    const folderSelections = ["C:/vault", "C:/temp/sub_project"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" },
        { entry: "editor", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" },
        { entry: "apiClient.js.md", type: "FILE" }
      ],
      "C:/vault/client/editor": [
        { entry: "editor.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API";
          if (path === "C:/vault/client/api/apiClient.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/apiClient.js\"\n---\n# API Client";
          if (path === "C:/vault/client/editor/editor.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/editor/editor.js\"\n---\n# Editor";
          if (path === "C:/workspace/my_project/client/api/aboutApi.js") return "export const aboutApi = {};";
          if (path === "C:/workspace/my_project/client/api/apiClient.js") return "export const apiClient = {};";
          if (path === "C:/workspace/my_project/client/editor/editor.js") return "export const editor = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-label", { hasText: "api" })).toBeVisible();
  await expect(page.locator(".folder-tree-file", { hasText: "editor.js.md" })).toBeVisible();

  await page.locator(".folder-tree-label", { hasText: "api" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 220
  });
  await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Export original nodes" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/client/api/aboutApi.js", content: "export const aboutApi = {};" },
    { path: "C:/temp/sub_project/my_project/client/api/apiClient.js", content: "export const apiClient = {};" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/client",
    "C:/temp/sub_project/my_project/client/api"
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 2 original files." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar file context menu exports original source file for that node", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    const folderSelections = ["C:/vault", "C:/temp/sub_project"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" },
        { entry: "apiClient.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API";
          if (path === "C:/vault/client/api/apiClient.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/apiClient.js\"\n---\n# API Client";
          if (path === "C:/workspace/my_project/client/api/aboutApi.js") return "export const aboutApi = {};";
          if (path === "C:/workspace/my_project/client/api/apiClient.js") return "export const apiClient = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" })).toBeVisible();

  await page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 150,
    clientY: 160
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-submenu", { hasText: "Export" })
    .locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Export original node" })
    .evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/client/api/aboutApi.js", content: "export const aboutApi = {};" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/client",
    "C:/temp/sub_project/my_project/client/api"
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 1 original file." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar file context menu opens original source file", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__openedPaths = [];
    const folderSelections = ["C:/vault"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "# About API\n\n---\nsource_file: C:/workspace/my_project/client/api/aboutApi.js\n---\n\n## Details";
          throw new Error(`Unexpected read: ${path}`);
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/vault",
        open: async (path) => {
          window.__openedPaths.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" })).toBeVisible();

  await page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 150,
    clientY: 160
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open original file" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual([
    "C:/workspace/my_project/client/api/aboutApi.js"
  ]);
});

test("sidebar folder context menu reveals original source folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__openedPaths = [];
    const folderSelections = ["C:/vault"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" },
        { entry: "editor", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" }
      ],
      "C:/vault/client/editor": [
        { entry: "editor.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API";
          if (path === "C:/vault/client/editor/editor.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/editor/editor.js\"\n---\n# Editor";
          throw new Error(`Unexpected read: ${path}`);
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/vault",
        open: async (path) => {
          window.__openedPaths.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-label", { hasText: "client" })).toBeVisible();

  await page.locator(".folder-tree-label", { hasText: "client" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 160
  });
  await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal original folder" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual([
    "C:/workspace/my_project/client"
  ]);
});

test("saved graph view details buttons open restored comparison details", async ({ page }) => {
  await page.addInitScript(() => {
    const savedGraphComparisonDetails = {
      sections: [
        { title: "New in current folder", items: ["current.md"] },
        { title: "Only in saved graph", items: ["saved-only.md"] },
        { title: "New connections", items: [] },
        { title: "Saved-only connections", items: ["saved-only.md -> alpha.md"] }
      ]
    };
    const graphTab = {
      id: "saved_details_graph_e2e",
      title: "Saved Details Graph",
      content: "",
      savedContent: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Saved Details Graph",
      keepSavedGraphMode: true,
      savedGraphComparisonDetails,
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1.2,
        centerForce: 0.7,
        repelForce: 240,
        linkForce: 0.6,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Saved Details Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current" }
        ],
        links: [],
        files: [
          { id: "alpha.md", name: "alpha.md", path: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".saved-graph-mode-details-button")).toBeVisible();

  await page.locator(".saved-graph-mode-details-button").click();
  await expect(page.locator("#graph-comparison-details-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-comparison-details-content")).toContainText("Only in saved graph");
  await expect(page.locator("#graph-comparison-details-content")).toContainText("saved-only.md");
  await page.locator("#graph-comparison-details-done").click();
  await expect(page.locator("#graph-comparison-details-modal")).toHaveClass(/hidden/);

  await page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    window.markdownViewerApp.modules.graphPersistence.showSavedGraphModeBanner(tab);
  });
  await expect(page.locator(".graph-update-banner-details-button")).toBeVisible();
  await page.locator(".graph-update-banner-details-button").click();
  await expect(page.locator("#graph-comparison-details-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-comparison-details-content")).toContainText("current.md");

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    window.markdownViewerApp.modules.graphPersistence.saveTabsToStorage(tabs);
    return JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0]?.savedGraphComparisonDetails?.sections?.length || 0;
  })).toBe(4);
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

test("graph group order can be rearranged and changes point priority", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "group_order_graph_e2e",
      title: "Group Order Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Group Order Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "first_group", query: "tag:shared", color: "#ff0000", enabled: true },
          { id: "second_group", query: "file:alpha", color: "#0000ff", enabled: true }
        ],
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
        folderName: "Group Order Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["shared"] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [shared]\n---\n# Alpha", status: "current", tags: ["shared"] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();

  const getAlphaGroupId = () => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    return alpha?.__data__?.groupId || "";
  });

  await expect.poll(getAlphaGroupId).toBe("first_group");

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Groups" }).locator("summary").click();
  await expect(page.locator(".graph-group-row")).toHaveCount(2);
  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-drag-handle")).toBeVisible();
  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-drag-handle")).toHaveAttribute("draggable", "true");

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".graph-group-row"));
    const handle = rows[0]?.querySelector(".graph-group-drag-handle");
    const dataTransfer = new DataTransfer();
    handle?.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    rows[1]?.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    rows[1]?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    handle?.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-query-input")).toHaveValue("file:alpha");
  await expect(page.locator(".graph-group-row").nth(1).locator(".graph-group-query-input")).toHaveValue("tag:shared");
  await expect.poll(getAlphaGroupId).toBe("second_group");
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs[0]?.graphViewConfig?.groups?.map((group) => group.id);
  })).toEqual(["second_group", "first_group"]);
});

test("graph group query suggestions can be selected with the mouse", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "group_mouse_suggestions_e2e",
      title: "Group Mouse Suggestions E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Group Mouse Suggestions E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "mouse_group", query: "", color: "#ff0000", enabled: true }
        ],
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
        folderName: "Group Mouse Suggestions E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current" }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Groups" }).locator("summary").click();
  const queryInput = page.locator(".graph-group-query-input").first();
  await queryInput.click();
  await page.keyboard.type("li");
  await page.locator(".graph-group-query-suggestion", { hasText: "links:" }).click();
  await expect(queryInput).toHaveValue("links:");

  await page.locator(".graph-group-query-suggestion", { hasText: "max-in" }).click();
  await expect(queryInput).toHaveValue("links:max-in");
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs[0]?.graphViewConfig?.groups?.[0]?.query || "";
  })).toBe("links:max-in");

  await queryInput.fill("");
  await page.keyboard.type("links:mi");
  await page.keyboard.press("Enter");
  await expect(queryInput).toHaveValue("links:min-in");
});

test("graph group hide button removes and restores matching points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "group_hide_graph_e2e",
      title: "Group Hide Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Group Hide Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "shared_group", query: "tag:shared", color: "#ff0000", enabled: true, hidden: false }
        ],
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
        folderName: "Group Hide Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["shared"] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [shared]\n---\n# Alpha", status: "current", tags: ["shared"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await expect(page.locator(".graph-link")).toHaveCount(1);

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Groups" }).locator("summary").click();
  const hideButton = page.locator(".graph-group-row").first().locator(".graph-group-hide-button");
  const switchLabel = page.locator(".graph-group-row").first().locator(".graph-group-switch-label");
  await expect(hideButton).toHaveAttribute("aria-pressed", "false");
  await expect(hideButton.locator("i")).toHaveClass(/bi-eye-slash/);

  await switchLabel.click();
  await expect.poll(() => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { enabled: tabs[0]?.graphViewConfig?.groups?.[0]?.enabled, groupId: alpha?.__data__?.groupId || "" };
  })).toEqual({ enabled: false, groupId: "" });
  await switchLabel.click();
  await expect.poll(() => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { enabled: tabs[0]?.graphViewConfig?.groups?.[0]?.enabled, groupId: alpha?.__data__?.groupId || "" };
  })).toEqual({ enabled: true, groupId: "shared_group" });

  await hideButton.click();
  await expect(hideButton).toHaveAttribute("aria-pressed", "true");
  await expect(hideButton.locator("i")).toHaveClass(/bi-eye/);
  await expect(page.locator(".graph-node")).toHaveCount(1);
  await expect(page.locator(".graph-link")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const nodeIds = Array.from(document.querySelectorAll(".graph-node")).map((node) => node.__data__?.id).sort();
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { nodeIds, hidden: tabs[0]?.graphViewConfig?.groups?.[0]?.hidden, hiddenNodeIds: tabs[0]?.graphViewConfig?.hiddenNodeIds };
  })).toEqual({ nodeIds: ["beta.md"], hidden: true, hiddenNodeIds: [] });

  await hideButton.click();
  await expect(hideButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await expect(page.locator(".graph-link")).toHaveCount(1);
});

test("graph link metric groups color ranked points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "links_group_graph_e2e",
      title: "Links Group Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Links Group Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "incoming_group", query: "links:max-in", color: "#ffff00", enabled: true, hidden: false }
        ],
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
        folderName: "Links Group Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "hub.md", label: "hub.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "gamma.md", label: "gamma.md", type: "file", status: "current" },
          { id: "lonely.md", label: "lonely.md", type: "file", status: "current" }
        ],
        links: [
          { source: "mid.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "hub.md", type: "link", status: "current" },
          { source: "beta.md", target: "hub.md", type: "link", status: "current" },
          { source: "gamma.md", target: "hub.md", type: "link", status: "current" },
          { source: "lonely.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "mid.md", type: "link", status: "current" },
          { source: "gamma.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "hub.md", path: "hub.md", name: "hub.md", content: "# Hub", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "# Mid", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", status: "current" },
          { id: "lonely.md", path: "lonely.md", name: "lonely.md", content: "# Lonely", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => {
    return Array.from(document.querySelectorAll(".graph-node-file"))
      .filter((node) => node.__data__?.groupId === "incoming_group")
      .map((node) => node.__data__.id)
      .sort();
  })).toEqual(["alpha.md", "beta.md", "gamma.md", "hub.md", "mid.md"]);
});

test("graph hidden link metric groups remove ranked points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "links_hidden_group_graph_e2e",
      title: "Links Hidden Group Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Links Hidden Group Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "low_incoming_group", query: "links:min-in", color: "#ff00ff", enabled: true, hidden: true }
        ],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkDistance: 170
      },
      graphSnapshot: {
        version: 1,
        folderName: "Links Hidden Group Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "hub.md", label: "hub.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "gamma.md", label: "gamma.md", type: "file", status: "current" },
          { id: "lonely.md", label: "lonely.md", type: "file", status: "current" }
        ],
        links: [
          { source: "mid.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "hub.md", type: "link", status: "current" },
          { source: "beta.md", target: "hub.md", type: "link", status: "current" },
          { source: "gamma.md", target: "hub.md", type: "link", status: "current" },
          { source: "lonely.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "mid.md", type: "link", status: "current" },
          { source: "gamma.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "hub.md", path: "hub.md", name: "hub.md", content: "# Hub", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "# Mid", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", status: "current" },
          { id: "lonely.md", path: "lonely.md", name: "lonely.md", content: "# Lonely", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    return Array.from(document.querySelectorAll(".graph-node-file")).map((node) => node.__data__?.id);
  })).toEqual(["hub.md"]);
});

test("graph quick action groups most referenced files by percentile", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.prompt = () => "infra";

    const files = new Map();
    const nodes = [];
    const snapshotFiles = [];
    for (let index = 1; index <= 20; index += 1) {
      const id = `file-${index}.md`;
      const fullPath = `C:/vault/${id}`;
      const content = `# File ${index}`;
      files.set(fullPath, content);
      nodes.push({ id, label: id, fullPath, type: "file", status: "current", tags: [] });
      snapshotFiles.push({ id, path: id, name: id, fullPath, content, status: "current", tags: [] });
    }

    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          files.set(path, content);
          window.__writes.push({ path, content });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };

    const graphTab = {
      id: "most_referenced_graph_e2e",
      title: "Most Referenced Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Most Referenced Graph E2E",
      graphScopeKey: "root-folder:c:/vault",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Most Referenced Graph E2E",
        createdAt: Date.now(),
        nodes,
        links: [
          { source: "file-3.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-4.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-5.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-6.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-7.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-8.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-9.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-10.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-11.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-12.md", target: "file-3.md", type: "link", status: "current" }
        ],
        files: snapshotFiles
      }
    };

    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      knownTags: ["infra"],
      graphMostReferencedPercent: 10,
      graphMagneticEnabled: true
    }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(20);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group most referenced" }).click();
  await expect(page.locator(".graph-quick-action-status")).toBeVisible();
  await expect(page.locator(".graph-quick-action-status")).toHaveText(/Detecting most referenced|Tagging|Creating hidden group|Refreshing graph/);

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path).sort())).toEqual([
    "C:/vault/file-1.md",
    "C:/vault/file-2.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((tab) => tab.id === "most_referenced_graph_e2e");
    return {
      tagged: graphTab.graphSnapshot.files
        .filter((file) => (file.tags || []).includes("infra"))
        .map((file) => file.id)
        .sort(),
      groups: graphTab.graphViewConfig.groups.map((group) => ({
        query: group.query,
        enabled: group.enabled,
        hidden: group.hidden,
        hasColor: /^#[0-9a-f]{6}$/i.test(group.color || "")
      }))
    };
  })).toEqual({
    tagged: ["file-1", "file-2"],
    groups: [{ query: "tag:infra", enabled: true, hidden: true, hasColor: true }]
  });
  await expect(page.locator(".graph-node-file")).toHaveCount(18);
  await expect(page.locator(".graph-quick-action-status")).toBeHidden();
});

test("graph quick action blocks most referenced grouping in saved graph mode", async ({ page }) => {
  await page.addInitScript(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.prompt = () => "infra";
    const graphTab = {
      id: "saved_most_referenced_graph_e2e",
      title: "Saved Most Referenced Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Saved Most Referenced Graph E2E",
      keepSavedGraphMode: true,
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Saved Most Referenced Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [{ source: "beta.md", target: "alpha.md", type: "link", status: "current" }],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group most referenced" }).click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual(["Saved graph mode does not update saved tags or links."]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((tab) => tab.id === "saved_most_referenced_graph_e2e");
    return {
      groups: graphTab.graphViewConfig.groups,
      tags: graphTab.graphSnapshot.files.map((file) => file.tags || [])
    };
  })).toEqual({ groups: [], tags: [[], []] });
});

test("graph display can hide and show orphan points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "orphan_toggle_graph_e2e",
      title: "Orphan Toggle Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Orphan Toggle Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
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
        folderName: "Orphan Toggle Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] },
          { id: "orphan.md", label: "orphan.md", fullPath: "orphan.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] },
          { id: "orphan.md", path: "orphan.md", name: "orphan.md", content: "# Orphan", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(3);

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Display" }).locator("summary").click();
  const orphansToggle = page.locator("#graph-display-orphans");
  const orphansToggleLabel = page.locator('label[for="graph-display-orphans"]');
  await expect(orphansToggle).toBeChecked();

  await orphansToggleLabel.click();
  await expect.poll(() => page.evaluate(() => {
    const nodeIds = Array.from(document.querySelectorAll(".graph-node")).map((node) => node.__data__?.id).sort();
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { nodeIds, showOrphans: tabs[0]?.graphViewConfig?.showOrphans };
  })).toEqual({ nodeIds: ["alpha.md", "beta.md"], showOrphans: false });

  await orphansToggleLabel.click();
  await expect(page.locator(".graph-node")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs[0]?.graphViewConfig?.showOrphans;
  })).toBe(true);
});

test("graph context menu opens all visible file points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "open_all_graph_e2e",
      title: "Open All Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Open All Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
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
        folderName: "Open All Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["doc"] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] },
          { id: "tag:doc", label: "#doc", type: "tag", status: "current", tag: "doc" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "alpha.md", target: "tag:doc", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: ["doc"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(3);

  await page.locator(".graph-tab-render").click({ button: "right", position: { x: 60, y: 60 } });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open all" }).click();

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs.map((tab) => ({ title: tab.title, type: tab.type || "file", content: tab.content }));
  })).toEqual([
    { title: "Open All Graph E2E", type: "graph", content: "" },
    { title: "alpha", type: "markdown", content: "# Alpha" },
    { title: "beta", type: "markdown", content: "# Beta" }
  ]);
});

test("graph open all asks before opening more than twenty visible file points", async ({ page }) => {
  await page.addInitScript(() => {
    window.__confirms = [];
    window.confirm = (message) => {
      window.__confirms.push(String(message));
      return false;
    };
    const nodes = [];
    const files = [];
    for (let index = 1; index <= 21; index += 1) {
      const id = `file-${index}.md`;
      nodes.push({ id, label: id, fullPath: id, type: "file", status: "current", tags: [] });
      files.push({ id, path: id, name: id, content: `# File ${index}`, status: "current", tags: [] });
    }
    const graphTab = {
      id: "open_all_warning_graph_e2e",
      title: "Open All Warning Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Open All Warning Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
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
        folderName: "Open All Warning Graph E2E",
        createdAt: Date.now(),
        nodes,
        links: [],
        files
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(21);

  await page.locator(".graph-tab-render").click({ button: "right", position: { x: 60, y: 60 } });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open all" }).click();

  await expect.poll(() => page.evaluate(() => ({
    confirms: window.__confirms,
    tabCount: JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").length
  }))).toEqual({
    confirms: ["Open 21 files in editor tabs?\n\nThis might slow down your computer or crash the app."],
    tabCount: 1
  });
});

test("graph context menu removes visible leaf nodes generation by generation", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_leaf_e2e",
      title: "Leaf Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Leaf Graph",
      graphViewConfig: {
        showTags: false,
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
        folderName: "Leaf Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "root.md", label: "root.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "leaf.md", label: "leaf.md", type: "file", status: "current" }
        ],
        links: [
          { source: "root.md", target: "mid.md", type: "link", status: "current" },
          { source: "mid.md", target: "leaf.md", type: "link", status: "current" }
        ],
        files: [
          { id: "root.md", path: "root.md", name: "root.md", content: "[[mid]]", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "[[leaf]]", status: "current" },
          { id: "leaf.md", path: "leaf.md", name: "leaf.md", content: "# Leaf", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(3);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await page.locator(".graph-context-menu-item", { hasText: "Remove Leaf Nodes" }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig.hiddenNodeIds.sort()))
    .toEqual(["leaf.md"]);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await page.locator(".graph-context-menu-item", { hasText: "Remove Leaf Nodes" }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig.hiddenNodeIds.sort()))
    .toEqual(["leaf.md", "mid.md"]);
});

test("graph context menu removes collapsed clusters with their child points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_cluster_remove_e2e",
      title: "Cluster Remove Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Cluster Remove Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [
          {
            id: "cluster_root",
            label: "root.md",
            mode: "direct-outgoing",
            seedNodeId: "root.md",
            memberNodeIds: ["root.md", "alpha.md", "beta.md"],
            createdAt: Date.now()
          }
        ],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
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
        folderName: "Cluster Remove Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "root.md", label: "root.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "outside.md", label: "outside.md", type: "file", status: "current" }
        ],
        links: [
          { source: "root.md", target: "alpha.md", type: "link", status: "current" },
          { source: "root.md", target: "beta.md", type: "link", status: "current" },
          { source: "outside.md", target: "root.md", type: "link", status: "current" }
        ],
        files: [
          { id: "root.md", path: "root.md", name: "root.md", content: "[[alpha]]\n[[beta]]", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "outside.md", path: "outside.md", name: "outside.md", content: "[[root]]", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-cluster")).toHaveCount(1);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);

  await page.locator(".graph-node-cluster").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await page.locator(".graph-context-menu-item", { hasText: "Remove this point" }).click();

  await expect(page.locator(".graph-node-cluster")).toHaveCount(0);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig;
    return {
      hiddenNodeIds: config.hiddenNodeIds.sort(),
      collapsedClusters: config.collapsedClusters
    };
  })).toEqual({
    hiddenNodeIds: ["alpha.md", "beta.md", "root.md"],
    collapsedClusters: []
  });
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
  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu > .graph-context-menu-item")).toContainText("Tag graph");
  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item")).toHaveText([
    "Tag Local Graph",
    "Tag full Local Graph",
    "Tag full Network"
  ]);
  await expect(page.locator(".graph-tab-render .tags-context-submenu-panel > .graph-context-menu-item", { hasText: "New tag ..." })).toHaveCount(1);
  await page.locator(".graph-context-menu-submenu.tags-context-submenu").hover();
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
    const archiveFile = graphTab.graphSnapshot.files.find((file) => {
      const path = String(file.fullPath || file.path || "");
      return path.endsWith("archive/alpha.md") || path.endsWith("archive\\alpha.md");
    });
    return {
      archive: archiveFile?.tags || [],
      unrelated: unrelatedGraphTab.graphSnapshot.files[0]?.tags || []
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
  await page.evaluate(() => { window.prompt = () => "Fresh Graph"; });
  await page.locator(".graph-tab-render .tags-context-submenu-panel .graph-context-menu-item", { hasText: "New tag ..." }).evaluate((button) => button.click());

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
    content: "---\ntags: [defined, other, fresh graph]\n---\n# Alpha",
    savedContent: "---\ntags: [defined, other, fresh graph]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator(".graph-link-tag")).toHaveCount(5);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .tags-context-menu-item", { hasText: "#defined" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(3);
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [other, fresh graph]\n---\n# Alpha",
    savedContent: "---\ntags: [other, fresh graph]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await expect(page.locator(".graph-tab-render .tags-context-menu-item")).toHaveText(["#archive", "#fresh graph", "#other"]);

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

test("graph tags submenu can tag the full local graph", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/alpha.md", "# Alpha\n\n[[beta]]"],
      ["C:/vault/beta.md", "# Beta\n\n[[gamma]]"],
      ["C:/vault/gamma.md", "# Gamma"]
    ]);
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          files.set(path, String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const graphTab = {
      id: "full_local_tag_graph_e2e",
      title: "Full Local Tag Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Full Local Tag Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [{ id: "hidden-full-group", query: "tag:full", color: "#7c3aed", enabled: false, hidden: true }],
        searchQuery: "",
        showArrows: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Full Local Tag Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha\n\n[[beta]]", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", fullPath: "C:/vault/beta.md", content: "# Beta\n\n[[gamma]]", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", fullPath: "C:/vault/gamma.md", content: "# Gamma", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["full"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(3);

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item")).toHaveText([
    "Tag Local Graph",
    "Tag full Local Graph",
    "Tag full Network"
  ]);
  await page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item", { hasText: "Tag full Local Graph" }).evaluate((button) => button.click());
  await expect(page.locator(".graph-tag-picker-title")).toHaveText("Tag full Local Graph");
  await page.locator(".graph-tag-picker-item", { hasText: "#full" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path))).toEqual([
    "C:/vault/alpha.md",
    "C:/vault/beta.md",
    "C:/vault/gamma.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return graphTab.graphSnapshot.files.map((file) => ({ id: file.id, tags: file.tags }));
  })).toEqual([
    { id: "alpha.md", tags: ["full"] },
    { id: "beta.md", tags: ["full"] },
    { id: "gamma.md", tags: ["full"] }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return (graphTab.graphViewConfig.groups || []).map((group) => ({
      id: group.id,
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { id: "hidden-full-group", query: "tag:full", enabled: true, hidden: false, hasColor: true }
  ]);
});

test("graph tags submenu can tag the full network", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/alpha.md", "# Alpha\n\n[[beta]]"],
      ["C:/vault/beta.md", "# Beta\n\n[[gamma]]"],
      ["C:/vault/gamma.md", "# Gamma"],
      ["C:/vault/delta.md", "# Delta"]
    ]);
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          files.set(path, String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const graphTab = {
      id: "full_network_tag_graph_e2e",
      title: "Full Network Tag Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Full Network Tag Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Full Network Tag Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] },
          { id: "delta.md", label: "delta.md", fullPath: "C:/vault/delta.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha\n\n[[beta]]", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", fullPath: "C:/vault/beta.md", content: "# Beta\n\n[[gamma]]", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", fullPath: "C:/vault/gamma.md", content: "# Gamma", status: "current", tags: [] },
          { id: "delta.md", path: "delta.md", name: "delta.md", fullPath: "C:/vault/delta.md", content: "# Delta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["network"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(4);

  const betaNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "beta.md" }) }).first();
  await betaNode.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  await page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item", { hasText: "Tag full Network" }).evaluate((button) => button.click());
  await expect(page.locator(".graph-tag-picker-title")).toHaveText("Tag full Network");
  await page.locator(".graph-tag-picker-item", { hasText: "#network" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path))).toEqual([
    "C:/vault/alpha.md",
    "C:/vault/beta.md",
    "C:/vault/gamma.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return graphTab.graphSnapshot.files.map((file) => ({ id: file.id, tags: file.tags }));
  })).toEqual([
    { id: "alpha.md", tags: ["network"] },
    { id: "beta.md", tags: ["network"] },
    { id: "gamma.md", tags: ["network"] },
    { id: "delta.md", tags: [] }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return (graphTab.graphViewConfig.groups || []).map((group) => ({
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { query: "tag:network", enabled: true, hidden: false, hasColor: true }
  ]);
});

test("desktop tree context menu can update file tags", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.__clipboard = "";
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
      clipboard: { writeText: async (text) => { window.__clipboard = String(text || ""); } }
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
  await expect(treeMenu.evaluate((menu) => Array.from(menu.children).map((child) => child.textContent.trim()))).resolves.not.toContain("Share");
  const treeExportSubmenu = treeMenu.locator(".graph-context-menu-submenu", { hasText: "Export" });
  await treeExportSubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(treeExportSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Share",
    "Export as Markdown",
    "Export as HTML",
    "Export as PDF",
    "Export original node"
  ]);
  const treeCopySubmenu = treeMenu.locator(".graph-context-menu-submenu", { hasText: "Copy" });
  await treeCopySubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(treeCopySubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Copy path",
    "Copy content",
    "Copy frontmatter",
    "Copy tags"
  ]);
  await treeMenu.locator(".graph-context-menu-item", { hasText: "Copy frontmatter" }).dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.__clipboard.replace(/\r\n/g, "\n"))).toBe("---\ntags: [defined]\n---");

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await treeCopySubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await treeMenu.locator(".graph-context-menu-item", { hasText: "Copy tags" }).dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.__clipboard)).toBe("defined");

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await expect(treeMenu.locator(".tags-context-menu-item")).toHaveText(["#defined", "#other"]);
  await expect(treeMenu.locator(".tags-context-submenu-panel .graph-context-menu-item")).toHaveText([
    "#defined",
    "#other",
    "New tag ..."
  ]);
  await treeMenu.locator(".tags-context-menu-item", { hasText: "#other" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__writes[0].content)).toContain("defined, other");

  await page.evaluate(() => { window.prompt = () => "Fresh Tree"; });
  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await treeMenu.locator(".tags-context-submenu-panel .graph-context-menu-item", { hasText: "New tag ..." }).evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__writes[1].content)).toContain("defined, other, fresh tree");

  await page.locator(".open-graph-view").first().click();
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.type === "graph");
    return graphTab?.graphSnapshot?.files?.find((file) => file.path === "alpha.md")?.tags || [];
  })).toEqual(["defined", "other", "fresh tree"]);
  await expect(page.locator("#graph-selected-tag-filter option")).toHaveText(["All files", "#defined", "#fresh tree", "#other"]);
  await page.locator("#graph-show-tags").evaluate((button) => button.click());
  await expect(page.locator(".graph-node-tag")).toHaveCount(3);
  await expect(page.locator(".graph-label-tag", { hasText: "#other" })).toHaveCount(1);
  await expect(page.locator(".graph-label-tag", { hasText: "#fresh tree" })).toHaveCount(1);
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
});

test("tree file context menu opens a recursive full graph for that file", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "# Alpha\n\n[[beta]]"],
      ["beta.md", "# Beta\n\n[[gamma]]"],
      ["gamma.md", "# Gamma"],
      ["delta.md", "# Delta\n\n[[alpha]]"],
      ["isolated.md", "# Isolated"]
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
      clipboard: { writeText: async (text) => { window.__clipboard = String(text || ""); } }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  const alphaFile = page.locator(".folder-tree-file", { hasText: "alpha.md" });
  await expect(alphaFile).toBeVisible();
  await alphaFile.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const treeMenu = page.locator(".sidebar-file-context-menu:not(.hidden)");
  await expect(treeMenu.locator(".graph-context-menu-item", { hasText: "Show full graph" })).toBeVisible();
  await treeMenu.locator(".graph-context-menu-item", { hasText: "Show full graph" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    const graphTab = tabs.find((tab) => tab.type === "graph" && tab.title === "Full Graph: alpha.md");
    return {
      mode: graphTab?.graphViewConfig?.mode,
      focusNodeId: graphTab?.graphViewConfig?.focusNodeId,
      snapshotNodeIds: (graphTab?.graphSnapshot?.nodes || []).map((node) => node.id).sort()
    };
  })).toEqual({
    mode: "full-network",
    focusNodeId: "alpha",
    snapshotNodeIds: ["alpha", "beta", "delta", "gamma", "isolated"]
  });
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("tree folder context menu tags markdown files in that folder tree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/docs/alpha.md", "---\ntags: [project]\n---\n# Alpha"],
      ["C:/vault/docs/nested/beta.md", "# Beta"],
      ["C:/vault/root.md", "# Root"]
    ]);
    const directoryEntries = new Map([
      ["C:/vault", [{ entry: "docs", type: "DIRECTORY" }, { entry: "root.md", type: "FILE" }]],
      ["C:/vault/docs", [{ entry: "alpha.md", type: "FILE" }, { entry: "nested", type: "DIRECTORY" }]],
      ["C:/vault/docs/nested", [{ entry: "beta.md", type: "FILE" }]]
    ]);
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => directoryEntries.get(normalizePath(path)) || [],
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          const normalizedPath = normalizePath(path);
          files.set(normalizedPath, String(content));
          window.__writes.push({ path: normalizedPath, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(3);
  const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" });
  await expect(docsFolder).toBeVisible();
  await expect.poll(() => page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" }).count()).toBe(1);

  await docsFolder.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const folderMenu = page.locator(".sidebar-folder-context-menu:not(.hidden)");
  await expect(folderMenu).toBeVisible();
  await expect(folderMenu.locator(".tags-context-submenu")).toBeVisible();
  await expect(folderMenu.locator(".tags-context-submenu-panel .graph-context-menu-item")).toHaveText([
    "#project",
    "New tag ..."
  ]);
  await expect(folderMenu.locator(".graph-context-menu-item", { hasText: "Tag Local Graph" })).toHaveCount(0);

  await folderMenu.locator(".tags-context-menu-item", { hasText: "#project" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/vault/docs/nested/beta.md", content: "---\ntags: [project]\n---\n# Beta" }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.type === "graph");
    return (graphTab?.graphViewConfig?.groups || []).map((group) => ({
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { query: "tag:project", enabled: true, hidden: false, hasColor: true }
  ]);
  await expect.poll(() => page.evaluate(async () => ({
    alpha: await Neutralino.filesystem.readFile("C:/vault/docs/alpha.md"),
    beta: await Neutralino.filesystem.readFile("C:/vault/docs/nested/beta.md"),
    root: await Neutralino.filesystem.readFile("C:/vault/root.md")
  }))).toEqual({
    alpha: "---\ntags: [project]\n---\n# Alpha",
    beta: "---\ntags: [project]\n---\n# Beta",
    root: "# Root"
  });
});

test("tree file full graph reports when no sidebar file is selected", async ({ page }) => {
  const consoleMessages = [];
  page.on("console", (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  await page.addInitScript(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
  });
  await openApp(page);

  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openSidebarFileFullGraphView(null));

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([
    "Unable to open a full graph because no sidebar file is selected."
  ]);
  await expect.poll(() => consoleMessages.some((message) => message.includes("[Sidebar full graph]"))).toBe(true);
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

test("removes recent file and folder entries from the action menu", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem("markdownViewerRecentFiles", JSON.stringify([
      { name: "one.md", label: "one.md", path: "docs/one.md", updatedAt: now },
      { name: "two.md", label: "two.md", path: "docs/two.md", updatedAt: now - 1 }
    ]));
    localStorage.setItem("markdownViewerRecentFolders", JSON.stringify([
      { name: "Vault One", label: "Vault One", path: "C:/vault-one", updatedAt: now },
      { name: "Vault Two", label: "Vault Two", path: "C:/vault-two", updatedAt: now - 1 }
    ]));
  });
  await openApp(page);

  await page.locator(".recent-files-menu .recent-menu-item", { hasText: "one.md" }).locator(".recent-menu-remove").click();
  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(1);
  await expect(page.locator(".recent-files-menu .recent-menu-item")).toContainText("two.md");

  await page.locator(".recent-folders-menu .recent-menu-item", { hasText: "Vault One" }).locator(".recent-menu-remove").click();
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toHaveCount(1);
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toContainText("Vault Two");
  await expect.poll(() => page.evaluate(() => ({
    files: JSON.parse(localStorage.getItem("markdownViewerRecentFiles") || "[]").map((item) => item.name),
    folders: JSON.parse(localStorage.getItem("markdownViewerRecentFolders") || "[]").map((item) => item.name)
  }))).toEqual({
    files: ["two.md"],
    folders: ["Vault Two"]
  });
});

test("settings menu limits remembered recent files and folders", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem("markdownViewerRecentFiles", JSON.stringify([
      { name: "one.md", label: "one.md", path: "docs/one.md", updatedAt: now },
      { name: "two.md", label: "two.md", path: "docs/two.md", updatedAt: now - 1 },
      { name: "three.md", label: "three.md", path: "docs/three.md", updatedAt: now - 2 }
    ]));
    localStorage.setItem("markdownViewerRecentFolders", JSON.stringify([
      { name: "Vault One", label: "Vault One", path: "C:/vault-one", updatedAt: now },
      { name: "Vault Two", label: "Vault Two", path: "C:/vault-two", updatedAt: now - 1 },
      { name: "Vault Three", label: "Vault Three", path: "C:/vault-three", updatedAt: now - 2 }
    ]));
  });
  await openApp(page);
  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(3);
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toHaveCount(3);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await page.locator("#settings-max-recent-files").fill("2");
  await page.locator("#settings-max-recent-folders").fill("1");
  await page.locator("#settings-modal-save").click();

  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(2);
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => ({
    files: JSON.parse(localStorage.getItem("markdownViewerRecentFiles") || "[]").map((item) => item.name),
    folders: JSON.parse(localStorage.getItem("markdownViewerRecentFolders") || "[]").map((item) => item.name)
  }))).toEqual({
    files: ["one.md", "two.md"],
    folders: ["Vault One"]
  });
});

test("settings reset all clears cache preferences and recent history", async ({ page }) => {
  await page.addInitScript(() => {
    window.__alerts = [];
    window.__confirms = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.confirm = (message) => {
      window.__confirms.push(String(message));
      return true;
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      graphAutoClusterThreshold: 1200,
      graphShowFileExtensions: true,
      maxRecentFiles: 2,
      maxRecentFolders: 1,
      sidebarVisible: false
    }));
    localStorage.setItem("markdownViewerRecentFiles", JSON.stringify([
      { name: "one.md", label: "one.md", path: "docs/one.md", updatedAt: Date.now() }
    ]));
    localStorage.setItem("markdownViewerRecentFolders", JSON.stringify([
      { name: "Vault One", label: "Vault One", path: "C:/vault-one", updatedAt: Date.now() }
    ]));
  });
  await openApp(page);
  await page.evaluate(async () => {
    const cache = await caches.open("md-editor-test-cache");
    await cache.put("/cached-test", new Response("cached"));
  });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("md-editor-test-cache"))).toBe(true);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await page.locator("#settings-reset-all").click();

  await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1000");
  await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("10");
  await expect(page.locator("#settings-graph-show-file-extensions")).not.toBeChecked();
  await expect(page.locator("#settings-max-recent-files")).toHaveValue("10");
  await expect(page.locator("#settings-max-recent-folders")).toHaveValue("10");
  await expect(page.locator(".recent-files-menu .recent-empty-item")).toHaveText("No recent files");
  await expect(page.locator(".recent-folders-menu .recent-empty-item")).toHaveText("No recent folders");
  await expect.poll(() => page.evaluate(async () => ({
    cacheKeys: await caches.keys(),
    globalState: JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}"),
    recentFiles: JSON.parse(localStorage.getItem("markdownViewerRecentFiles") || "[]"),
    recentFolders: JSON.parse(localStorage.getItem("markdownViewerRecentFolders") || "[]"),
    confirms: window.__confirms,
    alerts: window.__alerts
  }))).toEqual({
    cacheKeys: [],
    globalState: {},
    recentFiles: [],
    recentFolders: [],
    confirms: ["Reset all settings data? This clears cache, preferences, and recent file/folder history. Open documents are not removed."],
    alerts: ["Cache, preferences, and recent history reset."]
  });
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
    window.confirm = () => true;
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
  await expect(page.locator(".tag-management-menu-button")).toHaveClass(/tag-filter-active/);
  await expect(page.locator(".tag-management-menu-button")).toHaveCSS("color", "rgb(3, 102, 214)");

  await page.locator("#clear-tag-filter-button").evaluate((button) => button.click());
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();
  await expect(page.locator(".tag-management-menu-button")).not.toHaveClass(/tag-filter-active/);
  await expect(page.locator("#clear-tag-filter-button")).toBeDisabled();

  await tagButton.evaluate((button) => button.click());
  await expect(page.locator(".tag-management-menu-button")).toHaveClass(/tag-filter-active/);
  await expect(untaggedFile).toHaveCount(0);

  await page.evaluate(() => {
    window.prompt = () => "project";
  });
  await page.locator("#delete-tag-button").evaluate((button) => button.click());
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();
  await expect(page.locator(".tag-management-menu-button")).not.toHaveClass(/tag-filter-active/);
  await expect(page.locator("#clear-tag-filter-button")).toBeDisabled();
  await expect(page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" })).toHaveCount(0);
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

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal in TreeView" }).click();
  const revealedTreeFile = page.locator(".folder-tree-file", { hasText: "alpha.md" });
  await expect(revealedTreeFile).toHaveClass(/auto-selected/);
  await expect(revealedTreeFile).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("folder-tree-file"))).toBe(true);

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
          return title === "Export Folder to Graph"
            ? "C:/vault/backup.mdviewer-graph.json"
            : "C:/vault/graph.mdviewer-graph.json";
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
  await expect(page.locator(".folder-tree-file", { hasText: "graph.mdviewer-graph.json" })).toBeVisible();

  await page.locator(".export-folder-to-graph").first().click();
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs[1].title)).toBe("Export Folder to Graph");
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/backup.mdviewer-graph.json")))
    .toContain('"documentType": "graph-export"');
  await expect(page.locator(".folder-tree-file", { hasText: "backup.mdviewer-graph.json" })).toBeVisible();
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
  await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
  await expect(page.locator("#tab-bar")).toBeVisible();
  await expect(page.locator(".tab-new-btn")).toBeVisible();
  await expect(page.locator("#tab-reset-btn")).toBeVisible();
  await expect(page.locator("#markdown-editor")).not.toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();
});

test("new file from an empty workspace shows the editor immediately", async ({ page }) => {
  await openApp(page);

  await page.locator("#tab-reset-btn").click();
  await page.locator("#reset-modal-confirm").click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
  await expect(page.locator("#tab-bar")).toBeVisible();
  await expect(page.locator(".tab-new-btn")).toBeVisible();
  await expect(page.locator("#tab-reset-btn")).toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();

  await page.locator(".new-document-button").first().click();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
  await expect(page.locator(".content-container")).not.toHaveClass(/no-open-tabs/);
  await expect(page.locator(".content-container")).toHaveClass(/markdown-tab-active/);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await expect(page.locator("#markdown-editor")).toBeFocused();
  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();
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
  await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
  await expect(page.locator("#markdown-editor")).not.toBeVisible();
  await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();
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
  await expect(page.locator(".content-container")).toHaveClass(/markdown-tab-active/);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await expect(page.locator("#markdown-editor")).toHaveValue(/Folder Note/);
  await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();

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
