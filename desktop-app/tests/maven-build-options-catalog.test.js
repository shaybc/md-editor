const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCatalog() {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/catalog.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenBuildOptionsCatalog({ registerModule() {} });
}

test("catalog orders provider options by group and option order", async () => {
  const catalog = loadCatalog();
  catalog.registerProvider({
    id: "example",
    getOptions() {
      return [
        { id: "later", label: "Later", group: { id: "second", label: "Second", order: 20 } },
        { id: "first-b", label: "B", group: { id: "first", label: "First", order: 10 }, order: 20 },
        { id: "first-a", label: "A", group: { id: "first", label: "First", order: 10 }, order: 10 }
      ];
    }
  });

  const result = await catalog.getOptions({ projectRoot: "C:/Project" });
  assert.deepEqual(Array.from(result.options, (option) => option.id), ["first-a", "first-b", "later"]);
  assert.equal(result.providerErrors.length, 0);
});

test("catalog isolates provider failures while retaining valid providers", async () => {
  const catalog = loadCatalog();
  catalog.registerProvider({ id: "broken", getOptions() { throw new Error("Unavailable"); } });
  catalog.registerProvider({
    id: "working",
    getOptions() { return [{ id: "valid", label: "Valid", group: { id: "core", label: "Core" } }]; }
  });

  const result = await catalog.getOptions();
  assert.deepEqual(Array.from(result.options, (option) => option.id), ["valid"]);
  assert.equal(result.providerErrors[0].providerId, "broken");
  assert.equal(result.providerErrors[0].message, "Unavailable");
});

test("catalog rejects duplicate providers and invalid relationships", async () => {
  const catalog = loadCatalog();
  catalog.registerProvider({ id: "one", getOptions() { return []; } });
  assert.throws(() => catalog.registerProvider({ id: "one", getOptions() { return []; } }), /already registered/);

  const invalid = loadCatalog();
  invalid.registerProvider({
    id: "invalid",
    getOptions() {
      return [{ id: "child", label: "Child", group: { id: "core", label: "Core" }, requires: ["missing"] }];
    }
  });
  await assert.rejects(() => invalid.getOptions(), /unknown option 'missing'/);
});
