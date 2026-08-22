const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { registerMarkdownViewerXmlSchemaAutocomplete } = require("../resources/js/editor/xml-schema-autocomplete.js");

const webRoot = path.resolve(__dirname, "..", "resources");

function createApp() {
  const modules = {};
  return {
    modules,
    registerModule(name, api) {
      modules[name] = api;
    }
  };
}

function createDocument(attributes = {}) {
  const root = {
    getAttribute(name) {
      return attributes[name] || "";
    },
    getAttributeNS(_namespace, name) {
      return attributes["xsi:" + name] || attributes[name] || "";
    }
  };
  return {
    documentElement: root,
    getElementsByTagName() {
      return [];
    }
  };
}

function createParser(attributes) {
  return class FakeDOMParser {
    parseFromString() {
      return createDocument(attributes);
    }
  };
}

test("inline no-namespace schema references resolve relative to the XML file", () => {
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    DOMParser: createParser({ "xsi:noNamespaceSchemaLocation": "schemas/order.xsd" })
  });

  const configuration = autocomplete.getWorkspaceConfiguration({
    filePath: "C:/Project/documents/order.xml",
    content: "<order/>"
  });

  assert.deepEqual(configuration, {
    xml: {
      fileAssociations: [{
        pattern: "C:/Project/documents/order.xml",
        systemId: "C:/Project/documents/schemas/order.xsd"
      }]
    }
  });
});

test("inline namespace schema pairs produce one association for each local schema", () => {
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    DOMParser: createParser({
      "xsi:schemaLocation": "urn:first first.xsd urn:second schemas/second.xsd"
    })
  });

  const configuration = autocomplete.getWorkspaceConfiguration({
    filePath: "C:/Project/order.xml",
    content: "<order/>"
  });

  assert.deepEqual(configuration.xml.fileAssociations, [
    { pattern: "C:/Project/order.xml", systemId: "C:/Project/first.xsd" },
    { pattern: "C:/Project/order.xml", systemId: "C:/Project/schemas/second.xsd" }
  ]);
});

test("manual schema association produces an XML file association", async () => {
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    Neutralino: {
      filesystem: {
        async getStats() {
          return {};
        }
      }
    }
  });

  const result = await autocomplete.setSchemaAssociation({
    filePath: "C:/Project/order.xml",
    schemaPath: "C:/Project/schema/order.xsd"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(autocomplete.getWorkspaceConfiguration(), {
    xml: {
      fileAssociations: [{
        pattern: "C:/Project/order.xml",
        systemId: "C:/Project/schema/order.xsd"
      }]
    }
  });
});

test("missing schema selection is rejected", async () => {
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        }
      }
    }
  });

  const result = await autocomplete.setSchemaAssociation({
    filePath: "C:/Project/order.xml",
    schemaPath: "C:/Project/schema/order.xsd"
  });

  assert.equal(result.ok, false);
  assert.deepEqual(autocomplete.getAssociations(), []);
});

test("clearing an association removes only the matching XML file", async () => {
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    Neutralino: {
      filesystem: {
        async getStats() {
          return {};
        }
      }
    }
  });

  await autocomplete.setSchemaAssociation({ filePath: "C:/Project/a.xml", schemaPath: "C:/Project/a.xsd" });
  await autocomplete.setSchemaAssociation({ filePath: "C:/Project/b.xml", schemaPath: "C:/Project/b.xsd" });
  autocomplete.clearSchemaAssociation("C:/Project/a.xml");

  assert.deepEqual(autocomplete.getAssociations(), [{ filePath: "C:/Project/b.xml", schemaPath: "C:/Project/b.xsd" }]);
});

test("associating from the active editor refreshes XML server configuration", async () => {
  let refreshed = 0;
  const messages = [];
  const autocomplete = registerMarkdownViewerXmlSchemaAutocomplete(createApp(), {
    getActiveEditorPath: () => "C:/Project/order.xml",
    Neutralino: {
      os: {
        async showOpenDialog() {
          return ["C:/Project/order.xsd"];
        }
      },
      filesystem: {
        async getStats() {
          return {};
        }
      }
    },
    notify: {
      success(entry) {
        messages.push(entry.message);
      }
    },
    refreshWorkspaceConfiguration() {
      refreshed += 1;
    }
  });

  const result = await autocomplete.associateSchemaForActiveEditor();

  assert.equal(result.ok, true);
  assert.equal(refreshed, 1);
  assert.deepEqual(messages, ["XML schema associated. Autocomplete will use it for this session."]);
});

test("XML server workspace configuration includes generated associations", () => {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {},
    app: {
      constants: { DESKTOP_PROFILE_DIR: ".md-editor" },
      registerModule() {}
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js/lsp/server-registry.js"), "utf8"), context);

  const registry = context.registerMarkdownViewerLspServerRegistry(context.app, {
    getXmlWorkspaceConfiguration() {
      return { xml: { fileAssociations: [{ pattern: "C:/Project/order.xml", systemId: "C:/Project/order.xsd" }] } };
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("xml"))), {
    xml: {
      fileAssociations: [{ pattern: "C:/Project/order.xml", systemId: "C:/Project/order.xsd" }]
    }
  });
});

test("XML completion trigger characters stay scoped to XML in source and generated bundle", () => {
  const source = fs.readFileSync(path.join(webRoot, "js/editor/codemirror-bundle-source.js"), "utf8");
  const bundle = fs.readFileSync(path.join(webRoot, "js/vendor/codemirror.bundle.js"), "utf8");

  assert.match(source, /lspLanguageId === "xml" && \/\[<\\\/\\s="':\]\//);
  assert.match(bundle, /lspLanguageId === "xml" && \/\[<\\\/\\s="':\]\//);
  assert.match(source, /shouldTriggerLspCompletion\(plugin, triggerChar, lspLanguageId\)/);
  assert.match(bundle, /shouldTriggerLspCompletion\(plugin2, triggerChar, lspLanguageId\)/);
});
