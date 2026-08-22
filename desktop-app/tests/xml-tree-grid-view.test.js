const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { registerMarkdownViewerXmlTreeGridView } = require("../resources/js/editor/xml-tree-grid-view.js");

function attribute(name, value, options = {}) {
  return {
    name,
    nodeName: name,
    value,
    namespaceURI: options.namespaceURI || "",
    prefix: options.prefix || "",
    localName: options.localName || name
  };
}

function node(nodeType, nodeName, options = {}) {
  return {
    nodeType,
    nodeName,
    localName: options.localName || nodeName,
    prefix: options.prefix || "",
    namespaceURI: options.namespaceURI || "",
    nodeValue: options.nodeValue || "",
    textContent: options.textContent || options.nodeValue || "",
    attributes: options.attributes || [],
    childNodes: options.childNodes || []
  };
}

function createApi(documentElement, parserErrorText = "") {
  class FakeDomParser {
    parseFromString() {
      return {
        documentElement,
        getElementsByTagName(name) {
          if (name === "parsererror" && parserErrorText) return [{ textContent: parserErrorText }];
          return [];
        }
      };
    }
  }

  return registerMarkdownViewerXmlTreeGridView({ registerModule() {} }, { DOMParser: FakeDomParser });
}

test("parses XML nodes, attributes, text, and comments into a tree", () => {
  const titleText = node(3, "#text", { nodeValue: "Hello" });
  const comment = node(8, "#comment", { nodeValue: "note" });
  const title = node(1, "title", {
    attributes: [attribute("lang", "en")],
    childNodes: [titleText, comment]
  });
  const root = node(1, "book", { attributes: [attribute("id", "b1")], childNodes: [title] });
  const api = createApi(root);

  const result = api.parseXmlToTree("<book />");

  assert.equal(result.ok, true);
  assert.equal(result.tree.name, "book");
  assert.equal(result.tree.attributes[0].name, "id");
  assert.equal(result.tree.children[0].name, "title");
  assert.equal(result.tree.children[0].children[0].type, "text");
  assert.equal(result.tree.children[0].children[1].type, "comment");
  assert.equal(Object.keys(result.nodesById).length, 4);
});

test("returns diagnostics for invalid XML", () => {
  const api = createApi(null, "line 1: mismatched tag");

  const result = api.parseXmlToTree("<root>");

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].severity, "error");
  assert.match(result.diagnostics[0].message, /mismatched tag/);
});

test("returns an empty-content diagnostic without throwing", () => {
  const api = createApi(node(1, "root"));

  const result = api.parseXmlToTree("");

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].severity, "info");
  assert.match(result.diagnostics[0].message, /No XML content/);
});

test("recognizes XML-family paths", () => {
  const api = createApi(node(1, "root"));
  const { isXmlFamilyPath } = api._test;

  assert.equal(isXmlFamilyPath("C:/work/file.xml"), true);
  assert.equal(isXmlFamilyPath("C:/work/schema.xsd"), true);
  assert.equal(isXmlFamilyPath("C:/work/transform.xslt"), true);
  assert.equal(isXmlFamilyPath("C:/work/pom.xml"), true);
  assert.equal(isXmlFamilyPath("C:/work/file.json"), false);
});

test("XML Tree/Grid action is wired into menus and tab mounting", () => {
  const root = path.resolve(__dirname, "..", "resources", "js");
  const contextMenu = fs.readFileSync(path.join(root, "editor", "context-menu.js"), "utf8");
  const tabsIndex = fs.readFileSync(path.join(root, "tabs", "index.js"), "utf8");
  const viewManager = fs.readFileSync(path.join(root, "tabs", "view-manager.js"), "utf8");

  assert.match(contextMenu, /xml-tree-grid/);
  assert.match(tabsIndex, /function createXmlTreeGridTab/);
  assert.match(tabsIndex, /function openXmlTreeGridTab/);
  assert.match(tabsIndex, /type = "xml-tree-grid"/);
  assert.match(viewManager, /mountXmlTreeGridTab/);
  assert.match(viewManager, /destroyXmlTreeGridTab/);
});
