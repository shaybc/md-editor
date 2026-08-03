const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("clean clears persisted and visible Java Rebuild output without activating it", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-rebuild-output.js"), "utf8");
  const files = new Map();
  const shown = [];
  const Neutralino = {
    filesystem: {
      async createDirectory() {},
      async readFile(filePath) {
        if (!files.has(filePath)) throw new Error("missing");
        return files.get(filePath);
      },
      async writeFile(filePath, value) { files.set(filePath, value); }
    }
  };
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  const output = context.window.registerMarkdownViewerJavaRebuildOutput({ registerModule() {} }, {
    Neutralino,
    isDesktopRuntime() { return true; },
    getActiveProjectPath() { return ""; },
    terminal: {
      showCommandOutput(content, options) { shown.push({ content, options }); },
      closeCommandOutput() {}
    }
  });

  await output.save("C:/Project", "previous build");
  await output.show("C:/Project");
  assert.equal(await output.clearForClean("C:/Project"), true);
  assert.equal(JSON.parse(files.get(output.getOutputPath("C:/Project"))).content, "");
  assert.equal(shown.at(-1).content, "");
  assert.equal(shown.at(-1).options.activate, false);
});

