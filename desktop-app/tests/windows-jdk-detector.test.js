const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerWindowsJdkDetector } = require("../resources/js/java/windows-jdk-detector.js");

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function createDetector(options = {}) {
  const registeredModules = new Map();
  const environment = options.environment || {};
  const directories = options.directories || new Map();
  const features = options.features || new Map();
  const inaccessibleDirectories = options.inaccessibleDirectories || new Set();
  const app = {
    registerModule(name, api) {
      registeredModules.set(name, api);
    }
  };
  const detector = registerMarkdownViewerWindowsJdkDetector(app, {
    execCommand: async () => {
      if (options.commandError) throw options.commandError;
      return { exitCode: 0, stdOut: options.javacOutput || "", stdErr: "" };
    },
    getBundledToolingJdkHome: () => options.bundledToolingJdkHome || "",
    getEnv: async (name) => {
      if (environment[name] instanceof Error) throw environment[name];
      return environment[name] || "";
    },
    getOsName: () => options.osName || "Windows",
    readDirectory: async (path) => {
      const normalized = normalizePath(path);
      if (inaccessibleDirectories.has(normalized)) throw new Error("Access denied");
      return directories.get(normalized) || [];
    },
    validateJdk: async ({ path }) => {
      const normalized = normalizePath(path);
      const feature = features.get(normalized.toLowerCase()) || 0;
      if (!feature) return { valid: false, reason: "missing-javac", runtime: { path: normalized } };
      return {
        valid: true,
        runtime: {
          id: `jdk:${normalized.toLowerCase()}`,
          name: "JDK",
          path: normalized,
          feature,
          detectedName: ""
        }
      };
    }
  });
  return { detector, registeredModules };
}

test("Windows JDK detector combines environment, PATH, and nested vendor installations", async () => {
  const directories = new Map([
    ["C:/Program Files/Java", [
      { entry: "jdk-11", type: "DIRECTORY" },
      { entry: "runtime-only", type: "DIRECTORY" }
    ]],
    ["C:/Program Files/Eclipse Adoptium", [{ entry: "releases", type: "DIRECTORY" }]],
    ["C:/Program Files/Eclipse Adoptium/releases", [{ entry: "jdk-25", type: "DIRECTORY" }]]
  ]);
  const features = new Map([
    ["c:/env/jdk-17", 17],
    ["c:/path/jdk-21", 21],
    ["c:/program files/java/jdk-11", 11],
    ["c:/program files/eclipse adoptium/releases/jdk-25", 25],
    ["c:/desktop/bin/tooling-jdk", 99]
  ]);
  const { detector, registeredModules } = createDetector({
    environment: {
      JAVA_HOME: '"C:\\Env\\jdk-17"',
      JDK_HOME: "c:\\ENV\\JDK-17",
      ProgramFiles: "C:\\Program Files",
      ProgramW6432: "C:\\Program Files"
    },
    javacOutput: [
      "C:\\Path\\jdk-21\\bin\\javac.exe",
      "C:\\ENV\\JDK-17\\bin\\javac.exe",
      "C:\\Desktop\\bin\\tooling-jdk\\bin\\javac.exe"
    ].join("\r\n"),
    directories,
    features,
    inaccessibleDirectories: new Set(["C:/Program Files/Microsoft"]),
    bundledToolingJdkHome: "C:/Desktop/bin/tooling-jdk"
  });

  const detected = await detector.detectInstalledJdks();

  assert.equal(registeredModules.get("windowsJdkDetector"), detector);
  assert.deepEqual(detected.map((jdk) => jdk.feature), [25, 21, 17, 11]);
  assert.deepEqual(detected.map((jdk) => jdk.name), ["JDK 25", "JDK 21", "JDK 17", "JDK 11"]);
  assert.equal(detected.filter((jdk) => jdk.path.toLowerCase() === "c:/env/jdk-17").length, 1);
  assert.equal(detected.some((jdk) => jdk.path.endsWith("runtime-only")), false);
  assert.equal(detected.some((jdk) => jdk.feature === 99), false);
});

test("Windows JDK detector continues when optional environment, PATH, and folders are unavailable", async () => {
  const directories = new Map([
    ["C:/Users/test/.jdks", [
      { entry: "jdk-23", type: "DIRECTORY" },
      { entry: "jre-8", type: "DIRECTORY" }
    ]]
  ]);
  const { detector } = createDetector({
    environment: {
      JAVA_HOME: new Error("Unavailable"),
      USERPROFILE: "C:/Users/test"
    },
    commandError: new Error("where.exe failed"),
    directories,
    features: new Map([["c:/users/test/.jdks/jdk-23", 23]]),
    inaccessibleDirectories: new Set(["C:/Users/test/.jdks/jdk-23"])
  });

  const detected = await detector.detectInstalledJdks();

  assert.deepEqual(detected.map((jdk) => ({ path: jdk.path, feature: jdk.feature })), [
    { path: "C:/Users/test/.jdks/jdk-23", feature: 23 }
  ]);
});

test("Windows JDK detector is unavailable outside Windows", async () => {
  const { detector } = createDetector({ osName: "Linux" });

  assert.equal(detector.isSupported(), false);
  assert.deepEqual(await detector.detectInstalledJdks(), []);
});
