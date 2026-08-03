const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSourceRootApi(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/source-root.js"), "utf8");
  const files = new Map(Object.entries(overrides.files || {}));
  const context = {
    window: {},
    console,
    Date,
    JSON,
    alert() {}
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerSourceRoot({}, {
    activeFolderPath: "C:/vault",
    isNeutralinoRuntime() { return true; },
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          if (!files.has(filePath)) throw new Error("missing");
          return { isFile: true };
        },
        async readFile(filePath) {
          if (!files.has(filePath)) throw new Error("missing");
          return files.get(filePath);
        },
        async writeFile(filePath, content) {
          files.set(filePath, content);
        }
      },
      os: {
        async showFolderDialog() {
          return "C:/workspace/project";
        }
      }
    },
    joinPath(folderPath, fileName) {
      return String(folderPath).replace(/[\\/]+$/, "") + "/" + String(fileName).replace(/^[\\/]+/, "");
    },
    isAbsoluteFilesystemPath(value) {
      const sourcePath = String(value || "");
      return /^[a-zA-Z]:[\\/]/.test(sourcePath) || /^\\\\/.test(sourcePath) || sourcePath.startsWith("/");
    },
    ...overrides
  });
}

test("source root resolves relative original paths through project metadata", async () => {
  const api = loadSourceRootApi({
    files: {
      "C:/vault/.md-editor/_md_editor_project.json": JSON.stringify({
        schemaVersion: 1,
        sourceRootPath: "C:/workspace/project",
        sourcePathMode: "relative-to-source-root"
      })
    }
  });

  const result = await api.resolveOriginalSourcePath("src/app/Main.cs");

  assert.equal(result.resolvedPath, "C:/workspace/project/src/app/Main.cs");
  assert.equal(result.needsSourceRoot, false);
});

test("source root leaves absolute original paths unchanged", async () => {
  const api = loadSourceRootApi();
  const result = await api.resolveOriginalSourcePath("D:/source/app.py");

  assert.equal(result.resolvedPath, "D:/source/app.py");
  assert.equal(result.needsSourceRoot, false);
});

test("source root reports missing metadata without crashing", async () => {
  const api = loadSourceRootApi();
  const result = await api.resolveOriginalSourcePath("src/app/index.ts", { prompt: false });

  assert.equal(result.resolvedPath, "");
  assert.equal(result.needsSourceRoot, true);
});

test("source root finds generated project folder from nested file path", async () => {
  const api = loadSourceRootApi({
    files: {
      "C:/vault/.md-editor/_md_editor_project.json": JSON.stringify({
        schemaVersion: 1,
        sourceRootPath: "C:/workspace/project"
      })
    }
  });

  const projectFolder = await api.findGeneratedProjectFolderFromPath("C:/vault/src/app/Main.java.md");

  assert.equal(projectFolder, "C:/vault");
});
