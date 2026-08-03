const { test, expect } = require("./desktop-fixture");
const { openApp, openCodeConverterDialog } = require("../helpers/desktop-ui");

async function openJavaConverter(page) {
  await openCodeConverterDialog(page);
  await page.locator("#code-converter-type").selectOption("java");
  await page.locator("#code-converter-source-root").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, "C:/src/project");
  await page.locator("#code-converter-destination-root").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, "C:/docs/project-md");
  await page.locator("#code-converter-run").click();
}

function installJavaConverterCommandMock({ cwd = "C:/GitHub/shaybc/md-editor", statsEntries = [], directoryEntries = [] } = {}) {
  window.NL_VERSION = "test";
  if (cwd) {
    window.NL_CWD = cwd;
  } else {
    delete window.NL_CWD;
  }
  window.__execCommands = [];
  const stats = new Map(statsEntries);
  const directories = new Map(directoryEntries);
  window.Neutralino = {
    filesystem: {
      getStats: async (path) => {
        const normalized = String(path).replace(/\\/g, "/");
        if (stats.has(normalized)) return stats.get(normalized);
        throw new Error("missing");
      },
      readDirectory: async (path) => {
        const normalized = String(path).replace(/\\/g, "/");
        return directories.get(normalized) || [];
      },
    },
    os: {
      setTray: async () => true,
      execCommand: async (command) => {
        window.__execCommands.push(command);
        return command.includes("rebuild.bat")
          ? { exitCode: 0, stdOut: "rebuild ok" }
          : { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
      },
    },
  };
}

function repositoryJavaStats() {
  return [
    ["./desktop-app/converters/java_converter/rebuild.bat", { type: "file", modifiedAt: 200 }],
    ["./desktop-app/converters/java_converter/target/java_converter.jar", { type: "file", modifiedAt: 100 }],
    ["./desktop-app/converters/java_converter/pom.xml", { type: "file", modifiedAt: 250 }],
    ["./desktop-app/converters/java_converter/src/main/java/App.java", { type: "file", modifiedAt: 300 }],
  ];
}

function repositoryJavaDirectories() {
  return [
    ["./desktop-app/converters/java_converter/src", [{ entry: "main", type: "DIRECTORY" }]],
    ["./desktop-app/converters/java_converter/src/main", [{ entry: "java", type: "DIRECTORY" }]],
    ["./desktop-app/converters/java_converter/src/main/java", [{ entry: "App.java", type: "FILE" }]],
  ];
}

function siblingJavaStats() {
  return [
    ["converters/java_converter/rebuild.bat", { type: "file", modifiedAt: 200 }],
    ["converters/java_converter/target/java_converter.jar", { type: "file", modifiedAt: 100 }],
    ["converters/java_converter/pom.xml", { type: "file", modifiedAt: 250 }],
    ["converters/java_converter/src/main/java/App.java", { type: "file", modifiedAt: 300 }],
  ];
}

function siblingJavaDirectories() {
  return [
    ["converters/java_converter/src", [{ entry: "main", type: "DIRECTORY" }]],
    ["converters/java_converter/src/main", [{ entry: "java", type: "DIRECTORY" }]],
    ["converters/java_converter/src/main/java", [{ entry: "App.java", type: "FILE" }]],
  ];
}

test.describe("desktop Java converter runtime", () => {
  test("java converter resolves jar from neutralino working directory", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      window.NL_CWD = "C:/GitHub/shaybc/md-editor";
      window.NL_VERSION = "test";
      window.__execCommands = [];
      window.Neutralino = {
        os: {
          setTray: async () => true,
          execCommand: async (command) => {
            window.__execCommands.push(command);
            return { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
          },
        },
      };
    });

    await openJavaConverter(page);

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
      'java -Xmx8g -jar "./desktop-app/converters/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --source-root-home "C:/src/project" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package --include-external-dependencies --resolve-maven-dependencies --on-gradle-metadata-failure parse-only',
    ]);
  });

  test("java converter rebuilds stale jar before running conversion", async ({ page }) => {
    await openApp(page);
    await page.evaluate(installJavaConverterCommandMock, {
      statsEntries: repositoryJavaStats(),
      directoryEntries: repositoryJavaDirectories(),
    });

    await openJavaConverter(page);

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
      'cmd /c call "./desktop-app/converters/java_converter/rebuild.bat"',
      'java -Xmx8g -jar "./desktop-app/converters/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --source-root-home "C:/src/project" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package --include-external-dependencies --resolve-maven-dependencies --on-gradle-metadata-failure parse-only',
    ]);
  });

  test("java converter rebuild progress does not overwrite conversion progress", async ({ page }) => {
    await openApp(page);
    await page.evaluate(({ statsEntries, directoryEntries }) => {
      window.NL_CWD = "C:/GitHub/shaybc/md-editor";
      window.NL_VERSION = "test";
      window.__spawnedCommands = [];
      window.__finishConversion = null;
      const stats = new Map(statsEntries);
      const directories = new Map(directoryEntries);
      window.Neutralino = {
        filesystem: {
          getStats: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            if (stats.has(normalized)) return stats.get(normalized);
            throw new Error("missing");
          },
          readDirectory: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            return directories.get(normalized) || [];
          },
        },
        os: {
          setTray: async () => true,
          spawnProcess: async (command) => {
            const id = window.__spawnedCommands.length + 1;
            window.__spawnedCommands.push(command);
            if (command.includes("rebuild.bat")) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("spawnedProcess", {
                  detail: {
                    id,
                    action: "stdOut",
                    data: '::md-progress{"stage":"complete","stageLabel":"Complete","completed":4,"total":4}\nrebuild ok',
                  },
                }));
                window.dispatchEvent(new CustomEvent("spawnedProcess", {
                  detail: { id, action: "exit", data: { exitCode: 0 } },
                }));
              }, 0);
            } else {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("spawnedProcess", {
                  detail: {
                    id,
                    action: "stdOut",
                    data: '::md-progress{"stage":"scan","stageLabel":"Scanning Java source files","completed":1,"total":100}\n[2026-06-25 03:01:10] Scanning Java source files...',
                  },
                }));
              }, 0);
              window.__finishConversion = () => {
                window.dispatchEvent(new CustomEvent("spawnedProcess", {
                  detail: { id, action: "exit", data: { exitCode: 0 } },
                }));
              };
            }
            return { id, pid: 4200 + id };
          },
          updateSpawnedProcess: async () => {},
        },
      };
    }, { statsEntries: repositoryJavaStats(), directoryEntries: repositoryJavaDirectories() });

    await openJavaConverter(page);

    await expect.poll(() => page.evaluate(() => window.__spawnedCommands.length)).toBe(2);
    await expect(page.locator("#code-converter-progress-stage")).toHaveText("Scanning Java source files");
    await expect(page.locator("#code-converter-progress-percent")).toHaveText("1%");
    await expect(page.locator("#code-converter-progress-count")).toContainText("1 / 100 files");
    await expect(page.locator("#code-converter-console-output")).not.toContainText("::md-progress");

    await page.evaluate(() => window.__finishConversion());
    await expect(page.locator("#code-converter-finish")).toBeVisible();
  });

  test("java converter cancel during rebuild does not start conversion", async ({ page }) => {
    await openApp(page);
    await page.evaluate(({ statsEntries, directoryEntries }) => {
      window.NL_CWD = "C:/GitHub/shaybc/md-editor";
      window.NL_VERSION = "test";
      window.__spawnedCommands = [];
      window.__execCommands = [];
      window.__updatedProcesses = [];
      const stats = new Map(statsEntries);
      const directories = new Map(directoryEntries);
      window.Neutralino = {
        filesystem: {
          getStats: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            if (stats.has(normalized)) return stats.get(normalized);
            throw new Error("missing");
          },
          readDirectory: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            return directories.get(normalized) || [];
          },
        },
        os: {
          setTray: async () => true,
          spawnProcess: async (command) => {
            window.__spawnedCommands.push(command);
            return { id: 7, pid: 7007 };
          },
          execCommand: async (command) => {
            window.__execCommands.push(command);
            return { exitCode: 0 };
          },
          updateSpawnedProcess: async (id, event) => {
            window.__updatedProcesses.push({ id, event });
            return { success: true };
          },
        },
      };
    }, { statsEntries: repositoryJavaStats(), directoryEntries: repositoryJavaDirectories() });

    await openJavaConverter(page);
    await expect.poll(() => page.evaluate(() => window.__spawnedCommands.length)).toBe(1);
    await page.locator("#code-converter-cancel").click();

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toContain("cmd /c taskkill /PID 7007 /T /F");
    await expect(page.locator("#code-converter-status")).toHaveText("Java converter cancelled.");
    await expect.poll(() => page.evaluate(() => window.__spawnedCommands)).toEqual([
      'cmd /c call "./desktop-app/converters/java_converter/rebuild.bat"',
    ]);
  });

  test("java converter falls back to sibling repo jar when runtime path globals are missing", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      window.NL_VERSION = "test";
      delete window.NL_CWD;
      window.__execCommands = [];
      window.Neutralino = {
        filesystem: {
          getStats: async (path) => {
            if (path === "converters/java_converter/target/java_converter.jar") return { type: "file" };
            throw new Error("missing");
          },
        },
        os: {
          setTray: async () => true,
          execCommand: async (command) => {
            window.__execCommands.push(command);
            return { exitCode: 0, stdOut: "Created 3 markdown file(s) in C:/docs/project-md" };
          },
        },
      };
    });

    await openJavaConverter(page);

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
      'java -Xmx8g -jar "converters/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --source-root-home "C:/src/project" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package --include-external-dependencies --resolve-maven-dependencies --on-gradle-metadata-failure parse-only',
    ]);
  });

  test("java converter rebuilds stale sibling jar before fallback conversion", async ({ page }) => {
    await openApp(page);
    await page.evaluate(installJavaConverterCommandMock, {
      cwd: "",
      statsEntries: siblingJavaStats(),
      directoryEntries: siblingJavaDirectories(),
    });

    await openJavaConverter(page);

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
      'cmd /c call "converters/java_converter/rebuild.bat"',
      'java -Xmx8g -jar "converters/java_converter/target/java_converter.jar" --root "C:/src/project" --vault "C:/docs/project-md" --source-root-home "C:/src/project" --include-methods --include-accessors --include-signatures --include-return-codes --include-exceptions --include-package --include-external-dependencies --resolve-maven-dependencies --on-gradle-metadata-failure parse-only',
    ]);
  });
});
