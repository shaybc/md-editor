(function(global) {
  "use strict";

  /** Owns the supported New Project templates, their defaults, and their editable fields. */
  function registerMarkdownViewerProjectTemplateCatalog(app) {
    const common = [
      field("projectName", "Project name", "text", { required: true }),
      field("parentDirectory", "Parent directory", "folder", { required: true }),
      field("language", "Language", "select", { required: true })
    ];

    const templates = [
      template("java", "Java", {
        projectType: "standard",
        projectJdkId: "",
        groupId: "com.example",
        artifactId: "hello-world",
        version: "1.0.0-SNAPSHOT",
        packageName: "com.example.helloworld",
        mainClass: "Main",
        sourceFolder: "src/main/java",
        testFolder: "src/test/java",
        outputFolder: "build/classes",
        jarFiles: "",
        classpathFolders: "",
        dependencies: "",
        gradleDsl: "groovy",
        gradleInstallationId: "built-in",
        eclipseSettingsEnabled: false,
        eclipseSettingsSource: ""
      }, [
        field("projectType", "Project type", "select", { options: [["standard", "Standard Java"], ["maven", "Maven"], ["gradle", "Gradle"]] }),
        field("projectJdkId", "Project JDK", "jdk", { required: true }),
        field("groupId", "Group ID", "text", { required: true }),
        field("artifactId", "Artifact ID", "text", { required: true }),
        field("version", "Project version", "text", { required: true }),
        field("packageName", "Base package", "text", { required: true }),
        field("mainClass", "Main class", "text", { required: true }),
        field("sourceFolder", "Source folder", "text", { required: true }),
        field("testFolder", "Test folder", "text", { required: true }),
        field("outputFolder", "Output folder", "text", { when: { projectType: "standard" }, required: true }),
        field("jarFiles", "JAR files", "multiline", { when: { projectType: "standard" }, browse: "java-archives", help: "One absolute or project-relative path per line." }),
        field("classpathFolders", "Compiled-class folders", "multiline", { when: { projectType: "standard" }, browse: "folder", help: "One absolute or project-relative path per line." }),
        field("dependencies", "Dependencies", "multiline", { whenAny: { projectType: ["maven", "gradle"] }, help: "One group:artifact:version[:scope] coordinate per line." }),
        field("gradleDsl", "Gradle DSL", "select", { when: { projectType: "gradle" }, options: [["groovy", "Groovy"], ["kotlin", "Kotlin"]] }),
        field("gradleInstallationId", "Gradle installation", "gradle", { when: { projectType: "gradle" }, required: true }),
        field("eclipseSettingsEnabled", "Copy Eclipse .settings", "checkbox"),
        field("eclipseSettingsSource", "Eclipse .settings source", "folder", { when: { eclipseSettingsEnabled: true }, required: true })
      ]),
      template("python", "Python", {
        pythonVersion: "3.12",
        interpreter: "python",
        packageLayout: "src",
        packageName: "hello_world",
        entryScript: "main.py",
        dependencyFormat: "pyproject",
        virtualEnvironment: ".venv"
      }, [
        field("pythonVersion", "Python version", "text", { required: true }),
        field("interpreter", "Interpreter command or path", "text", { required: true }),
        field("packageLayout", "Package layout", "select", { options: [["src", "src package"], ["flat", "Flat package"]] }),
        field("packageName", "Import package", "text", { required: true }),
        field("entryScript", "Entry script", "text", { required: true }),
        field("dependencyFormat", "Dependencies", "select", { options: [["pyproject", "pyproject.toml"], ["requirements", "requirements.txt"]] }),
        field("virtualEnvironment", "Virtual environment directory", "text", { required: true })
      ]),
      template("node", "JavaScript / Node.js", {
        nodeVersion: "22",
        packageManager: "npm",
        packageManagerVersion: "10",
        moduleSystem: "module",
        packageName: "hello-world",
        packageVersion: "1.0.0",
        entryScript: "src/index.js"
      }, nodeFields("js")),
      template("typescript", "TypeScript", {
        nodeVersion: "22",
        packageManager: "npm",
        packageManagerVersion: "10",
        moduleSystem: "module",
        packageName: "hello-world",
        packageVersion: "1.0.0",
        entryScript: "src/index.ts",
        sourceFolder: "src",
        outputFolder: "dist",
        ecmaTarget: "ES2022",
        moduleResolution: "NodeNext",
        strict: true,
        sourceMaps: true,
        declarations: false
      }, nodeFields("ts").concat([
        field("sourceFolder", "Source folder", "text", { required: true }),
        field("outputFolder", "Output folder", "text", { required: true }),
        field("ecmaTarget", "ECMAScript target", "select", { options: [["ES2020", "ES2020"], ["ES2022", "ES2022"], ["ESNext", "ESNext"]] }),
        field("moduleResolution", "Module resolution", "select", { options: [["NodeNext", "NodeNext"], ["Bundler", "Bundler"], ["Node", "Node"]] }),
        field("strict", "Strict type checking", "checkbox"),
        field("sourceMaps", "Source maps", "checkbox"),
        field("declarations", "Declaration output", "checkbox")
      ])),
      template("csharp", "C#", {
        dotnetSdkVersion: "8.0",
        targetFramework: "net8.0",
        rootNamespace: "HelloWorld",
        nullable: true,
        implicitUsings: true,
        entryClass: "Program"
      }, [
        field("dotnetSdkVersion", ".NET SDK version", "text", { required: true }),
        field("targetFramework", "Target framework", "text", { required: true }),
        field("rootNamespace", "Root namespace", "text", { required: true }),
        field("nullable", "Nullable reference types", "checkbox"),
        field("implicitUsings", "Implicit usings", "checkbox"),
        field("entryClass", "Entry class", "text", { required: true })
      ])
    ];

    function field(id, label, type, options = {}) {
      return Object.freeze({ id, label, type, ...options });
    }

    function template(id, label, defaults, fields) {
      return Object.freeze({ id, label, defaults: Object.freeze({ ...defaults }), fields: Object.freeze(fields.slice()) });
    }

    function nodeFields(extension) {
      return [
        field("nodeVersion", "Node.js version", "text", { required: true }),
        field("packageManager", "Package manager", "select", { options: [["npm", "npm"], ["yarn", "Yarn"], ["pnpm", "pnpm"]] }),
        field("packageManagerVersion", "Package manager version", "text", { required: true }),
        field("moduleSystem", "Module system", "select", { options: [["module", "ES modules"], ["commonjs", "CommonJS"]] }),
        field("packageName", "Package name", "text", { required: true }),
        field("packageVersion", "Package version", "text", { required: true }),
        field("entryScript", "Entry script", "text", { required: true, help: `Use a .${extension} file inside the project.` })
      ];
    }

    function list() {
      return templates.slice();
    }

    function get(id) {
      return templates.find((candidate) => candidate.id === id) || null;
    }

    function createDraft(language = "java") {
      const selected = get(language) || templates[0];
      return { projectName: "hello-world", parentDirectory: "", language: selected.id, initializeGit: false, ...selected.defaults };
    }

    const api = { common, createDraft, get, list };
    app?.registerModule?.("projectTemplateCatalog", api);
    return api;
  }

  global.registerMarkdownViewerProjectTemplateCatalog = registerMarkdownViewerProjectTemplateCatalog;
})(typeof window !== "undefined" ? window : globalThis);
