// Legacy web UI migration backlog.
// Tests confirmed as migrated to the desktop source of truth were removed from this file.
// See ../../../desktop-ui-test-migration-matrix.md for remaining migration status.
const { expect } = require("@playwright/test");

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
        .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, "<a href=\\"$2\\">$1</a>")
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

async function openApp(page, path = "/") {
  await page.goto(path);
  await expect(page.locator("#markdown-editor")).toBeVisible();
  await expect(page.locator("#markdown-preview")).toBeVisible();
}

async function clickEditorFormatButton(page, action) {
  await page.locator(`.editor-format-button[data-editor-format-action='${action}']`).evaluate((button) => button.click());
}

async function selectSettingsTab(page, tabName) {
  await page.locator(`.settings-tab-button[data-settings-tab="${tabName}"]`).click();
  await expect(page.locator(`.settings-panel[data-settings-panel="${tabName}"]`)).toBeVisible();
}

module.exports = {
  stubBrowserLibraries,
  openApp,
  clickEditorFormatButton,
  selectSettingsTab,
};
