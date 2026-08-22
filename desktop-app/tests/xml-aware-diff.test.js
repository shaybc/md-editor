const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerXmlAwareDiff } = require("../resources/js/tools/xml-aware-diff.js");

const ELEMENT_NODE = 1;
const ATTRIBUTE_NODE = 2;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

function attribute(name, value, namespaceURI = "") {
  return { nodeType: ATTRIBUTE_NODE, name, nodeName: name, localName: name.replace(/^[^:]+:/, ""), namespaceURI, value };
}

function text(value) {
  return { nodeType: TEXT_NODE, nodeValue: value, textContent: value };
}

function cdata(value) {
  return { nodeType: CDATA_SECTION_NODE, nodeValue: value, textContent: value };
}

function comment(value) {
  return { nodeType: COMMENT_NODE, nodeValue: value, textContent: value };
}

function pi(target, data) {
  return { nodeType: PROCESSING_INSTRUCTION_NODE, target, nodeName: target, data };
}

function element(name, attrs = [], children = []) {
  return {
    nodeType: ELEMENT_NODE,
    nodeName: name,
    tagName: name,
    localName: name.replace(/^[^:]+:/, ""),
    attributes: attrs,
    childNodes: children
  };
}

function documentFromRoot(root, childNodes = [root], parserError = "") {
  return {
    documentElement: parserError ? null : root,
    childNodes: parserError ? [] : childNodes,
    getElementsByTagName(name) {
      return name === "parsererror" && parserError ? [{ textContent: parserError }] : [];
    }
  };
}

class FakeDOMParser {
  parseFromString(source) {
    if (/bad/i.test(source)) return documentFromRoot(null, [], "Invalid XML");
    if (/order-right/.test(source)) return documentFromRoot(element("root", [], [element("b"), element("a")]));
    if (/order-left/.test(source)) return documentFromRoot(element("root", [], [element("a"), element("b")]));
    if (/text-right/.test(source)) return documentFromRoot(element("root", [], [element("name", [], [text("two")])]));
    if (/text-left/.test(source)) return documentFromRoot(element("root", [], [element("name", [], [text("one")])]));
    if (/meta/.test(source)) {
      const root = element("m:root", [
        attribute("xmlns:m", "urn:test", "http://www.w3.org/2000/xmlns/"),
        attribute("z", "2"),
        attribute("a", "1")
      ], [comment("note"), element("m:value", [], [cdata("x < y")])]);
      return documentFromRoot(root, [pi("xml-stylesheet", 'href="style.xsl"'), root]);
    }
    const root = element("root", [], [
      text("\n  "),
      element("item", [attribute("b", "2"), attribute("a", "1")], [text("value")]),
      text("\n")
    ]);
    return documentFromRoot(root);
  }
}

function createApi() {
  return registerMarkdownViewerXmlAwareDiff({ registerModule() {} }, { DOMParser: FakeDOMParser });
}

test("normalizes equivalent XML formatting and attribute order", () => {
  const api = createApi();
  const left = api.normalizeXmlForDiff("<root>\n  <item b=\"2\" a=\"1\">value</item>\n</root>");
  const right = api.normalizeXmlForDiff("<root><item a=\"1\" b=\"2\">value</item></root>");
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(left.content, right.content);
  assert.match(left.content, /<item a="1" b="2">value<\/item>/);
});

test("keeps element order differences visible", () => {
  const api = createApi();
  const left = api.normalizeXmlForDiff("<order-left/>");
  const right = api.normalizeXmlForDiff("<order-right/>");
  assert.notEqual(left.content, right.content);
});

test("keeps text value differences visible", () => {
  const api = createApi();
  const left = api.normalizeXmlForDiff("<text-left/>");
  const right = api.normalizeXmlForDiff("<text-right/>");
  assert.notEqual(left.content, right.content);
  assert.match(left.content, /one/);
  assert.match(right.content, /two/);
});

test("preserves declaration, processing instructions, comments, cdata, and namespaces deterministically", () => {
  const api = createApi();
  const result = api.normalizeXmlForDiff('<?xml version="1.0"?><meta/>');
  assert.equal(result.ok, true);
  assert.match(result.content, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(result.content, /<\?xml-stylesheet href="style\.xsl"\?>/);
  assert.match(result.content, /<m:root a="1" xmlns:m="urn:test" z="2">/);
  assert.match(result.content, /<!--note-->/);
  assert.match(result.content, /<!\[CDATA\[x < y\]\]>/);
});

test("returns diagnostics for invalid XML", () => {
  const api = createApi();
  const result = api.normalizeXmlForDiff("<bad>");
  assert.equal(result.ok, false);
  assert.match(result.diagnostics[0].message, /Invalid XML/);
});

test("creates normalized compare sources and rejects non-XML sources", () => {
  const api = createApi();
  const normalized = api.createXmlAwareCompareSources(
    { name: "left.xml", content: "<root/>" },
    { name: "right.xml", content: "<root/>" }
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.left.content, normalized.right.content);

  const rejected = api.createXmlAwareCompareSources(
    { name: "left.txt", content: "<root/>" },
    { name: "right.xml", content: "<root/>" }
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.diagnostics[0].message, /not an XML-family file/);
});

test("file compare integration opens a read-only XML-aware descriptor", async () => {
  global.document = { createElement() { return {}; }, body: { appendChild() {} } };
  require("../resources/js/files/compare.js");
  const registerMarkdownViewerFileCompare = global.registerMarkdownViewerFileCompare;
  const xmlAwareDiff = createApi();
  let openedDescriptor = null;
  let alertMessage = "";
  const fileCompare = registerMarkdownViewerFileCompare({ registerModule() {} }, {
    xmlAwareDiff,
    openFileCompareInTab(descriptor) {
      openedDescriptor = descriptor;
      return { id: "compare-tab" };
    },
    alert(message) {
      alertMessage = message;
    }
  });

  const tab = await fileCompare.openXmlAwareCompareFiles(
    { name: "left.xml", content: "<root><item b=\"2\" a=\"1\"/></root>" },
    { name: "right.xml", content: "<root>\n  <item a=\"1\" b=\"2\"/>\n</root>" }
  );

  assert.deepEqual(tab, { id: "compare-tab" });
  assert.equal(alertMessage, "");
  assert.equal(openedDescriptor.title, "XML diff: left.xml <-> right.xml");
  assert.equal(openedDescriptor.readOnly, true);
  assert.equal(openedDescriptor.xmlAwareDiff.normalized, true);
  assert.equal(openedDescriptor.left.content, openedDescriptor.right.content);
});