const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function loadFileCompare(extraDeps = {}, extraWindow = {}) {
  const source = fs.readFileSync(path.join(webRoot, "js", "files", "compare.js"), "utf8");
  const modules = {};
  const document = {
    body: {
      appendChild() {}
    },
    createElement(tagName) {
      return {
        tagName,
        className: "",
        style: {},
        children: [],
        setAttribute() {},
        addEventListener() {},
        append() {
          this.children.push(...arguments);
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        remove() {},
        click() {}
      };
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: text };
    }
  };
  const context = {
    window: { ...extraWindow },
    document,
    console,
    module: { exports: {} }
  };
  context.globalThis = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "files/compare.js" });
  const app = {
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const deps = {
    getFileName(value) {
      return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
    },
    normalizeEditorContent(value) {
      return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    },
    isNeutralinoRuntime() {
      return false;
    },
    alert() {},
    ...extraDeps
  };
  return context.window.registerMarkdownViewerFileCompare(app, deps);
}

test("compare source normalization derives names from paths", () => {
  const compare = loadFileCompare();
  const source = compare.normalizeCompareSource({ path: "C:\\work\\left.sql" });

  assert.equal(source.name, "left.sql");
  assert.equal(source.path, "C:\\work\\left.sql");
});

test("compare source reader normalizes browser file line endings", async () => {
  const compare = loadFileCompare();
  const content = await compare.readCompareSourceContent({
    name: "right.txt",
    file: {
      async text() {
        return "one\r\ntwo\rthree";
      }
    }
  });

  assert.equal(content, "one\ntwo\nthree");
});

test("compare source reader uses Neutralino file paths when available", async () => {
  const compare = loadFileCompare({
    isNeutralinoRuntime() {
      return true;
    },
    Neutralino: {
      filesystem: {
        async readFile(filePath) {
          assert.equal(filePath, "C:/work/right.txt");
          return "alpha\r\nbeta";
        }
      }
    }
  });
  const content = await compare.readCompareSourceContent({ path: "C:/work/right.txt" });

  assert.equal(content, "alpha\nbeta");
});

test("compare descriptor keeps both side buffers", async () => {
  const compare = loadFileCompare();
  const descriptor = compare.createCompareTabDescriptor(
    { name: "left.txt", path: "C:/left.txt", content: "left" },
    { name: "right.txt", path: "C:/right.txt", content: "right" }
  );

  assert.equal(descriptor.title, "left.txt <-> right.txt");
  assert.equal(descriptor.left.content, "left");
  assert.equal(descriptor.right.path, "C:/right.txt");
  assert.equal(descriptor.viewMode, "side-by-side");
});

test("compare picker asks for two separate browser files", async () => {
  const pickerOptions = [];
  const openedDescriptors = [];
  const compare = loadFileCompare({
    openFileCompareInTab(descriptor) {
      openedDescriptors.push(descriptor);
      return { id: "compare-tab" };
    }
  }, {
    async showOpenFilePicker(options) {
      const callNumber = pickerOptions.length + 1;
      const name = callNumber === 1 ? "left.txt" : "right.txt";
      const content = callNumber === 1 ? "left" : "right";
      pickerOptions.push(options);
      return [{
        name,
        async getFile() {
          return {
            async text() {
              return content;
            }
          };
        }
      }];
    }
  });

  const tab = await compare.openCompareFilesFromPicker();

  assert.equal(tab.id, "compare-tab");
  assert.equal(pickerOptions.length, 2);
  assert.equal(pickerOptions[0].multiple, false);
  assert.equal(pickerOptions[1].multiple, false);
  assert.equal(openedDescriptors[0].left.name, "left.txt");
  assert.equal(openedDescriptors[0].right.name, "right.txt");
  assert.equal(openedDescriptors[0].left.content, "left");
  assert.equal(openedDescriptors[0].right.content, "right");
});
