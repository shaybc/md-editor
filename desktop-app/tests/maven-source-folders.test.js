const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeDOMParser {
  parseFromString(xml) {
    const moduleNames = Array.from(String(xml || "").matchAll(/<module>\s*([^<]+?)\s*<\/module>/g))
      .map((match) => match[1]);
    return {
      getElementsByTagName(name) {
        if (name !== "modules" || !moduleNames.length) return [];
        return [{
          getElementsByTagName(childName) {
            return childName === "module"
              ? moduleNames.map((moduleName) => ({ textContent: moduleName }))
              : [];
          }
        }];
      }
    };
  }
}

function loadMavenSourceFolders({ directories = [], files = {} } = {}) {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../resources/js/project/maven-source-folders.js"),
    "utf8"
  );
  const context = {
    window: { DOMParser: FakeDOMParser },
    globalThis: { DOMParser: FakeDOMParser },
    DOMParser: FakeDOMParser
  };
  vm.runInNewContext(source, context);
  const app = {
    registerModule(name, api) {
      this[name] = api;
    }
  };
  return context.window.registerMarkdownViewerMavenSourceFolders(app, {
    Neutralino: {
      filesystem: {
        async getStats(candidatePath) {
          if (!directories.includes(candidatePath)) throw new Error("missing directory");
          return { isDirectory: true };
        },
        async readFile(candidatePath) {
          if (!Object.prototype.hasOwnProperty.call(files, candidatePath)) throw new Error("missing file");
          return files[candidatePath];
        }
      }
    }
  });
}

test("scanProject returns readable Maven modules and their standard source folders", async () => {
  const scanner = loadMavenSourceFolders({
    directories: [
      "C:/Project/module-a/src/main/java",
      "C:/Project/module-a/nested/src/test/java"
    ],
    files: {
      "C:/Project/pom.xml": "<modules><module>module-a</module><module>missing</module></modules>",
      "C:/Project/module-a/pom.xml": "<modules><module>nested</module></modules>",
      "C:/Project/module-a/nested/pom.xml": "<project />"
    }
  });

  const result = JSON.parse(JSON.stringify(await scanner.scanProject("C:/Project")));

  assert.deepEqual(result.modules, [
    { path: ".", absolutePath: "C:/Project" },
    { path: "module-a", absolutePath: "C:/Project/module-a" },
    { path: "module-a/nested", absolutePath: "C:/Project/module-a/nested" }
  ]);
  assert.deepEqual(result.sourceFolders, [
    {
      path: "module-a/nested/src/test/java",
      absolutePath: "C:/Project/module-a/nested/src/test/java",
      type: "Test source"
    },
    {
      path: "module-a/src/main/java",
      absolutePath: "C:/Project/module-a/src/main/java",
      type: "Main source"
    }
  ]);
});

test("scan preserves the source-folder-only compatibility contract", async () => {
  const scanner = loadMavenSourceFolders({
    directories: ["C:/Project/src/main/java"],
    files: { "C:/Project/pom.xml": "<project />" }
  });

  const result = JSON.parse(JSON.stringify(await scanner.scan("C:/Project")));

  assert.deepEqual(result, [{
    path: "src/main/java",
    absolutePath: "C:/Project/src/main/java",
    type: "Main source"
  }]);
});
