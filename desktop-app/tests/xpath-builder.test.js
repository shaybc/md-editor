const assert = require("node:assert/strict");
const test = require("node:test");

const builder = require("../resources/js/tools/xpath/xpath-builder.js");

function attribute(name, value, options = {}) {
  return {
    nodeType: 2,
    name,
    nodeName: name,
    value,
    localName: options.localName || name,
    prefix: options.prefix || "",
    namespaceURI: options.namespaceURI || ""
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

function parseWithRoot(root, parserErrorText = "") {
  class FakeDomParser {
    parseFromString() {
      return {
        documentElement: root,
        getElementsByTagName(name) {
          if (name === "parsererror" && parserErrorText) return [{ textContent: parserErrorText }];
          return [];
        }
      };
    }
  }
  return builder.parseXmlToXPathTree("<root />", { DOMParser: FakeDomParser });
}

function findNode(tree, predicate) {
  return Object.values(tree.nodesById).find(predicate);
}

test("builds absolute element paths with same-name sibling indexes", () => {
  const firstName = node(1, "name");
  const secondName = node(1, "name");
  const firstItem = node(1, "item", { childNodes: [firstName] });
  const secondItem = node(1, "item", { childNodes: [secondName] });
  const items = node(1, "items", { childNodes: [firstItem, secondItem] });
  const root = node(1, "root", { childNodes: [items] });
  const tree = parseWithRoot(root);
  const selected = findNode(tree, (candidate) => candidate.name === "name" && tree.nodesById[candidate.parentId]?.id === firstItem.__id);
  const firstItemModel = Object.values(tree.nodesById).find((candidate) => candidate.name === "item");
  const firstNameModel = tree.nodesById[firstItemModel.children.find((child) => child.name === "name").id];

  assert.equal(tree.ok, true);
  assert.equal(builder.buildXPathForNode(tree, firstNameModel.id), "/root/items/item[1]/name");
});

test("builds attribute paths", () => {
  const root = node(1, "root", { childNodes: [node(1, "item", { attributes: [attribute("id", "42")] })] });
  const tree = parseWithRoot(root);
  const selected = findNode(tree, (candidate) => candidate.kind === "attribute" && candidate.name === "id");

  assert.equal(builder.buildXPathForNode(tree, selected.id), "/root/item/@id");
});

test("builds text node paths", () => {
  const root = node(1, "root", { childNodes: [node(1, "name", { childNodes: [node(3, "#text", { nodeValue: "demo" })] })] });
  const tree = parseWithRoot(root);
  const selected = findNode(tree, (candidate) => candidate.kind === "text");

  assert.equal(builder.buildXPathForNode(tree, selected.id), "/root/name/text()");
});

test("builds namespace-safe local-name paths", () => {
  const root = node(1, "m:root", {
    localName: "root",
    prefix: "m",
    namespaceURI: "urn:test",
    childNodes: [node(1, "m:item", { localName: "item", prefix: "m", namespaceURI: "urn:test" })]
  });
  const tree = parseWithRoot(root);
  const selected = findNode(tree, (candidate) => candidate.localName === "item");

  assert.equal(
    builder.buildXPathForNode(tree, selected.id, { useLocalName: true }),
    "/*[local-name()='root']/*[local-name()='item']"
  );
});

test("returns diagnostics for invalid and empty XML input", () => {
  const invalid = parseWithRoot(null, "mismatched tag");
  const empty = builder.parseXmlToXPathTree("");

  assert.equal(invalid.ok, false);
  assert.match(invalid.diagnostics[0].message, /mismatched tag/);
  assert.equal(empty.ok, false);
  assert.equal(empty.diagnostics[0].severity, "info");
});

test("reports builder capabilities for supported nodes", () => {
  assert.deepEqual(builder.getXPathNodeOptions({ kind: "attribute" }), {
    canBuild: true,
    kind: "attribute",
    supportsLocalName: true
  });
});
