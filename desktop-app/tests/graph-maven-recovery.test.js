const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGraphMavenRecoveryApi(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/maven-recovery.js"), "utf8");
  const coordinateMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/maven-coordinate-map.json"), "utf8"));
  const context = {
    window: {},
    console,
    Date,
    Map,
    Set,
    String
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGraphMavenRecovery({}, {
    Neutralino: undefined,
    isNeutralinoRuntime() {
      return false;
    },
    joinPath(dirPath, fileName) {
      if (!dirPath) return fileName;
      return String(dirPath).replace(/[\\/]+$/, "") + "/" + String(fileName || "").replace(/^[\\/]+/, "");
    },
    getOriginalSourceRootPath() {
      return "";
    },
    loadSourceRootMetadata() {
      return null;
    },
    promptForSourceRoot() {
      return null;
    },
    mavenCoordinateMap: coordinateMap,
    ...overrides
  });
}

test("maven recovery matches curated package roots by longest prefix", () => {
  const api = loadGraphMavenRecoveryApi();

  const jackson = api.findMavenCoordinate("com.fasterxml.jackson.core.JsonFactory");
  const springBoot = api.findMavenCoordinate("org.springframework.boot.SpringApplication");

  assert.equal(jackson[0], "com.fasterxml.jackson.core");
  assert.deepEqual(JSON.parse(JSON.stringify(jackson[1])), {
    groupId: "com.fasterxml.jackson.core",
    artifactId: "jackson-databind",
    version: "2.17.1"
  });
  assert.equal(springBoot[0], "org.springframework.boot");
  assert.deepEqual(JSON.parse(JSON.stringify(springBoot[1])), {
    groupId: "org.springframework.boot",
    artifactId: "spring-boot",
    version: "3.3.0"
  });
  assert.equal(api.findMavenCoordinate("missing.example.Client"), null);
});

test("maven recovery coordinate map is loaded from external JSON data", () => {
  const api = loadGraphMavenRecoveryApi();

  assert.ok(api.getMavenCoordinateMap().length >= 100);
  assert.equal(api.MAVEN_COORDINATE_MAP_URL, "js/graph/maven-coordinate-map.json");
  const reactor = api.findMavenCoordinate("reactor.test.StepVerifier");
  assert.equal(reactor[0], "reactor.test");
  assert.deepEqual(JSON.parse(JSON.stringify(reactor[1])), {
    groupId: "io.projectreactor",
    artifactId: "reactor-test",
    version: "3.6.7"
  });
  const micrometerJms = api.findMavenCoordinate("io.micrometer.jakarta9.instrument.jms.JmsInstrumentation");
  assert.equal(micrometerJms[0], "io.micrometer.jakarta9.instrument.jms");
  assert.deepEqual(JSON.parse(JSON.stringify(micrometerJms[1])), {
    groupId: "io.micrometer",
    artifactId: "micrometer-jakarta9",
    version: "1.13.0"
  });
  const springWeb = api.findMavenCoordinate("org.springframework.web.client.RestTemplate");
  assert.equal(springWeb[0], "org.springframework.web");
  assert.deepEqual(JSON.parse(JSON.stringify(springWeb[1])), {
    groupId: "org.springframework",
    artifactId: "spring-web",
    version: "6.1.8"
  });
  const poi = api.findMavenCoordinate("org.apache.poi.xssf.usermodel.XSSFWorkbook");
  assert.equal(poi[0], "org.apache.poi");
  assert.deepEqual(JSON.parse(JSON.stringify(poi[1])), {
    groupId: "org.apache.poi",
    artifactId: "poi-ooxml",
    version: "5.2.5"
  });
});

test("maven recovery maps Apache ZooKeeper missing dependency groups", () => {
  const api = loadGraphMavenRecoveryApi();
  const expectations = new Map([
    ["ch.qos.logback.classic", "ch.qos.logback:logback-classic:1.5.6"],
    ["ch.qos.logback.classic.spi", "ch.qos.logback:logback-classic:1.5.6"],
    ["ch.qos.logback.core", "ch.qos.logback:logback-core:1.5.6"],
    ["ch.qos.logback.core.encoder", "ch.qos.logback:logback-core:1.5.6"],
    ["ch.qos.logback.core.read", "ch.qos.logback:logback-core:1.5.6"],
    ["edu.umd.cs.findbugs.annotations", "com.github.spotbugs:spotbugs-annotations:4.9.3"],
    ["io.prometheus.metrics.model.registry", "io.prometheus:prometheus-metrics-model:1.3.10"],
    ["io.prometheus.metrics.model.snapshots", "io.prometheus:prometheus-metrics-model:1.3.10"],
    ["mockit.Mock", "org.jmockit:jmockit:1.48"],
    ["mockit.MockUp", "org.jmockit:jmockit:1.48"],
    ["mockit.Invocation", "org.jmockit:jmockit:1.48"],
    ["io.netty.bootstrap", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.buffer", "io.netty:netty-buffer:4.1.130.Final"],
    ["io.netty.channel", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.channel.ChannelHandler", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.channel.epoll", "io.netty:netty-transport-classes-epoll:4.1.130.Final"],
    ["io.netty.channel.group", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.channel.nio", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.channel.socket", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.channel.socket.nio", "io.netty:netty-transport:4.1.130.Final"],
    ["io.netty.handler.ssl", "io.netty:netty-handler:4.1.130.Final"],
    ["io.netty.util", "io.netty:netty-common:4.1.130.Final"],
    ["io.netty.util.concurrent", "io.netty:netty-common:4.1.130.Final"]
  ]);

  assert.equal(expectations.size, 23);
  for (const [packageName, coordinateKey] of expectations) {
    const match = api.findMavenCoordinate(packageName);
    assert.ok(match, `${packageName} should be mapped`);
    const coordinate = match[1];
    assert.equal(
      `${coordinate.groupId}:${coordinate.artifactId}:${coordinate.version}`,
      coordinateKey,
      packageName
    );
  }
});

test("maven recovery model deduplicates coordinates and tracks unmapped packages", () => {
  const api = loadGraphMavenRecoveryApi();
  const model = api.createMavenRecoveryModel({
    folderName: "Demo",
    packages: [
      { packageName: "org.slf4j", languages: ["java"], symbols: [] },
      { packageName: "org.slf4j.event", languages: ["java"], symbols: [] },
      { packageName: "com.google.common.collect", languages: ["java"], symbols: [] },
      { packageName: "requests", languages: ["python"], symbols: [] },
      { packageName: "missing.example", languages: ["java"], symbols: [] }
    ]
  });

  assert.equal(model.mappedDependencies.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(model.mappedDependencies.map((entry) => `${entry.groupId}:${entry.artifactId}:${entry.version}`))),
    ["com.google.guava:guava:33.2.1-jre", "org.slf4j:slf4j-api:2.0.13"]
  );
  const slf4j = model.mappedDependencies.find((entry) => entry.artifactId === "slf4j-api");
  assert.deepEqual(JSON.parse(JSON.stringify(slf4j.packages)), ["org.slf4j", "org.slf4j.event"]);
  assert.deepEqual(JSON.parse(JSON.stringify(model.unmappedPackages)), ["missing.example"]);
});

test("maven recovery generated pom includes dependencies, source comments, and unmapped TODOs", () => {
  const api = loadGraphMavenRecoveryApi();
  const files = api.createMavenRecoveryFiles({
    folderName: "Demo",
    packages: [
      { packageName: "org.junit.jupiter.api", languages: ["java"], symbols: [] },
      { packageName: "org.junit.jupiter.api.extension", languages: ["java"], symbols: [] },
      { packageName: "unknown.lib", languages: ["java"], symbols: [] }
    ]
  });

  assert.match(files.pomXml, /<artifactId>md-editor-missing-dependencies<\/artifactId>/);
  assert.match(files.pomXml, /<!-- Missing package group\(s\): org\.junit\.jupiter\.api, org\.junit\.jupiter\.api\.extension -->/);
  assert.match(files.pomXml, /<groupId>org\.junit\.jupiter<\/groupId>/);
  assert.match(files.pomXml, /<artifactId>junit-jupiter-api<\/artifactId>/);
  assert.equal((files.pomXml.match(/<artifactId>junit-jupiter-api<\/artifactId>/g) || []).length, 1);
  assert.match(files.pomXml, /TODO unknown\.lib/);
  assert.match(files.unmappedPackages, /unknown\.lib/);
});

test("maven recovery generated batch copies runtime dependency jars into lib external", () => {
  const api = loadGraphMavenRecoveryApi();
  const batch = api.formatFetchBatch("C:/source/project/lib/external");

  assert.match(batch, /call mvn -f pom\.xml org\.apache\.maven\.plugins:maven-dependency-plugin:3\.8\.1:tree/);
  assert.match(batch, /call mvn -f pom\.xml org\.apache\.maven\.plugins:maven-dependency-plugin:3\.8\.1:copy-dependencies/);
  assert.match(batch, /set "TARGET_LIB=C:\\source\\project\\lib\\external"/);
  assert.match(batch, /"-DoutputDirectory=%TARGET_LIB%"/);
  assert.match(batch, /-DincludeScope=runtime/);
  assert.match(batch, /Missing dependency jars were copied to %TARGET_LIB%/);
});

test("maven recovery snapshots the configured executable and Maven arguments", () => {
  const api = loadGraphMavenRecoveryApi();
  const batch = api.formatFetchBatch("C:/source/project/lib/external", {
    runner: '"C:/Tools/Apache Maven/mvn.cmd"',
    arguments: ["--settings", '"C:/Maven Config/settings.xml"', "--offline", '"-Dmaven.repo.local=D:/Maven Cache"']
  });
  assert.match(batch, /call "C:\/Tools\/Apache Maven\/mvn\.cmd" --settings "C:\/Maven Config\/settings\.xml" --offline "-Dmaven\.repo\.local=D:\/Maven Cache" -f pom\.xml/);
});

test("maven recovery rejects file generation outside desktop runtime", async () => {
  const api = loadGraphMavenRecoveryApi();

  await assert.rejects(
    () => api.createRecoveryWorkspace({ packages: [] }),
    /desktop app/
  );
});

test("maven recovery writes pom batch and optional unmapped files to source root", async () => {
  const writes = new Map();
  const created = [];
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        },
        async createDirectory(filePath) {
          created.push(filePath);
        },
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isNeutralinoRuntime() {
      return true;
    },
    getOriginalSourceRootPath() {
      return "C:/source/project";
    }
  });

  const result = await api.createRecoveryWorkspace({
    packages: [
      { packageName: "org.slf4j", languages: ["java"], symbols: [] },
      { packageName: "unknown.lib", languages: ["java"], symbols: [] }
    ]
  });

  assert.equal(result.recoveryFolder, "C:/source/project/md-editor-missing-dependencies");
  assert.equal(result.targetJarFolder, "C:/source/project/lib/external");
  assert.deepEqual(JSON.parse(JSON.stringify(created)), [
    "C:/source/project/md-editor-missing-dependencies",
    "C:/source/project/lib",
    "C:/source/project/lib/external"
  ]);
  assert.ok(writes.has("C:/source/project/md-editor-missing-dependencies/pom.xml"));
  assert.ok(writes.has("C:/source/project/md-editor-missing-dependencies/fetch-missing-dependencies.bat"));
  assert.ok(writes.has("C:/source/project/md-editor-missing-dependencies/unmapped-packages.txt"));
});

test("maven recovery writes pending update context to generated project metadata folder", async () => {
  const writes = new Map();
  const created = [];
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        },
        async createDirectory(filePath) {
          created.push(filePath);
        },
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isNeutralinoRuntime() {
      return true;
    },
    getOriginalSourceRootPath() {
      return "C:/source/project";
    }
  });

  const result = await api.createRecoveryWorkspace({
    folderName: "Demo",
    packages: [
      {
        packageName: "org.slf4j",
        languages: ["java"],
        affectedFileIds: ["src/App.md"],
        symbols: [{ symbol: "org.slf4j.Logger", language: "java", kind: "class" }]
      },
      {
        packageName: "unknown.lib",
        languages: ["java"],
        symbols: [{ symbol: "unknown.lib.Client", language: "java", kind: "class" }]
      }
    ]
  }, {
    generatedProjectRootPath: "C:/generated/project",
    updateContext: {
      packages: [{
        packageName: "org.slf4j",
        resolvedSymbols: ["org.slf4j.Logger"],
        affectedMarkdownFiles: ["src/App.java.md"],
        missingDependencyNodeIds: ["missing:org.slf4j.Logger"]
      }]
    }
  });

  const contextPath = "C:/generated/project/.md-editor/recovery/maven-recovery-context.json";
  assert.equal(result.contextPath, contextPath);
  assert.ok(created.includes("C:/generated/project/.md-editor/recovery"));
  assert.ok(writes.has(contextPath));
  const context = JSON.parse(writes.get(contextPath));
  assert.equal(typeof context.generatedAt, "string");
  assert.deepEqual({
    ...context,
    generatedAt: "<generated>"
  }, {
    schemaVersion: 2,
    type: "md-editor-dependency-recovery-context",
    status: "pending",
    recoveryKind: "java-maven",
    generatedAt: "<generated>",
    generatedProjectRootPath: "C:/generated/project",
    sourceRootPath: "C:/source/project",
    batchPath: "C:/source/project/md-editor-missing-dependencies/fetch-missing-dependencies.bat",
    resolvedDependencyTreePath: "C:/source/project/md-editor-missing-dependencies/resolved-runtime-dependency-tree.json",
    targetJarRelativeFolder: "lib/external",
    mappedDependencies: [{
      coordinateKey: "org.slf4j:slf4j-api:2.0.13",
      expectedJarFileName: "slf4j-api-2.0.13.jar",
      expectedJarRelativePath: "lib/external/slf4j-api-2.0.13.jar",
      resolvedPackages: ["org.slf4j"],
      resolvedSymbols: ["org.slf4j.Logger"],
      affectedMarkdownFiles: ["src/App.java.md"],
      missingDependencyNodeIds: ["missing:org.slf4j.Logger"]
    }],
    unmappedPackages: ["unknown.lib"]
  });
  assert.equal(Object.hasOwn(context, "recoveryFolder"), false);
  assert.equal(Object.hasOwn(context, "pomPath"), false);
  assert.equal(Object.hasOwn(context, "targetJarFolder"), false);
  assert.equal(Object.hasOwn(context, "contextPath"), false);
  assert.equal(Object.hasOwn(context, "updateHints"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "coordinate"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "matchedPrefix"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "expectedJarFolder"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "packages"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "affectedFiles"), false);
  assert.equal(Object.hasOwn(context.mappedDependencies[0], "missingSymbols"), false);
});

test("maven recovery can write files to an explicit output folder", async () => {
  const writes = new Map();
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      filesystem: {
        async getStats() {
          return { isDirectory: true };
        },
        async createDirectory() {},
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isNeutralinoRuntime() {
      return true;
    },
    getOriginalSourceRootPath() {
      return "C:/source/project";
    }
  });

  const result = await api.createRecoveryWorkspace({
    packages: [{ packageName: "org.slf4j", languages: ["java"], symbols: [] }]
  }, { outputFolderPath: "D:/exports/recovery" });

  assert.equal(result.recoveryFolder, "D:/exports/recovery");
  assert.equal(result.targetJarFolder, "C:/source/project/lib/external");
  assert.ok(writes.has("D:/exports/recovery/pom.xml"));
  assert.match(writes.get("D:/exports/recovery/fetch-missing-dependencies.bat"), /C:\\source\\project\\lib\\external/);
});

test("maven recovery asks for an output folder with the source root as default", async () => {
  let dialogTitle = "";
  let dialogOptions = null;
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      os: {
        async showFolderDialog(title, options) {
          dialogTitle = title;
          dialogOptions = options;
          return "C:/source/project/md-editor-missing-dependencies";
        }
      }
    },
    isNeutralinoRuntime() {
      return true;
    }
  });

  const selected = await api.chooseRecoveryOutputFolder("C:/source/project");

  assert.equal(selected, "C:/source/project/md-editor-missing-dependencies");
  assert.equal(dialogTitle, "Select Maven recovery output folder");
  assert.deepEqual(JSON.parse(JSON.stringify(dialogOptions)), {
    defaultPath: "C:/source/project"
  });
});

test("maven recovery loads source-root metadata without prompting", async () => {
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      filesystem: {
        async getStats() {
          return { isDirectory: true };
        },
        async createDirectory() {},
        async writeFile() {}
      }
    },
    isNeutralinoRuntime() {
      return true;
    },
    async loadSourceRootMetadata() {
      return { sourceRootPath: "C:/source/from-metadata" };
    }
  });

  const result = await api.createRecoveryWorkspace({
    packages: [{ packageName: "org.slf4j", languages: ["java"], symbols: [] }]
  });

  assert.equal(result.recoveryFolder, "C:/source/from-metadata/md-editor-missing-dependencies");
});

test("maven recovery uses explicit source-root option before metadata", async () => {
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      filesystem: {
        async getStats() {
          return { isDirectory: true };
        },
        async createDirectory() {},
        async writeFile() {}
      }
    },
    isNeutralinoRuntime() {
      return true;
    },
    async loadSourceRootMetadata() {
      return { sourceRootPath: "C:/source/from-metadata" };
    }
  });

  const result = await api.createRecoveryWorkspace({
    packages: [{ packageName: "org.slf4j", languages: ["java"], symbols: [] }]
  }, { sourceRootPath: "C:/source/from-report" });

  assert.equal(result.recoveryFolder, "C:/source/from-report/md-editor-missing-dependencies");
});

test("maven recovery runs generated batch through desktop command shell", async () => {
  let command = "";
  const api = loadGraphMavenRecoveryApi({
    Neutralino: {
      os: {
        async execCommand(value) {
          command = value;
          return { exitCode: 0 };
        }
      }
    },
    isNeutralinoRuntime() {
      return true;
    }
  });

  const result = await api.runRecoveryBatch("C:/source project/md-editor-missing-dependencies/fetch-missing-dependencies.bat");

  assert.deepEqual(result, { exitCode: 0 });
  assert.equal(command, 'cmd /c start "MD-Editor Maven Recovery" /D "C:\\source project\\md-editor-missing-dependencies" cmd /k call "C:\\source project\\md-editor-missing-dependencies\\fetch-missing-dependencies.bat"');
});

test("maven recovery rejects batch execution outside desktop runtime", async () => {
  const api = loadGraphMavenRecoveryApi();

  await assert.rejects(
    () => api.runRecoveryBatch("C:/source/project/fetch-missing-dependencies.bat"),
    /desktop app/
  );
});
