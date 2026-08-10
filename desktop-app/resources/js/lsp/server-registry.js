(function(window) {
  "use strict";

  /**
   * Owns the supported language-server recipes and fixed profile paths.
   */
  function registerMarkdownViewerLspServerRegistry(app, deps) {
    const DESKTOP_PROFILE_DIR = app.constants?.DESKTOP_PROFILE_DIR || ".md-editor";
    const LANGUAGE_SERVER_DIR = "language-servers";
    const LANGUAGE_SERVER_WORKSPACE_DIR = "language-server-workspaces";
    const METADATA_FILE = "md-editor-lsp-install.json";
    const TYPESCRIPT_SERVER_ID = "typescript";
    const JAVA_SERVER_ID = "java";
    const KOTLIN_SERVER_ID = "kotlin";
    const PYTHON_SERVER_ID = "python";
    const HTML_SERVER_ID = "html";
    const CSS_SERVER_ID = "css";
    const JSON_SERVER_ID = "json";
    const XML_SERVER_ID = "xml";
    const YAML_SERVER_ID = "yaml";
    const BASH_SERVER_ID = "bash";
    const DOCKERFILE_SERVER_ID = "dockerfile";
    const WINDOWS_SCRIPTING_SERVER_ID = "windows-scripting";
    const SOURCEGRAPH_JS_TS_ENTRY = "node_modules/javascript-typescript-langserver/lib/language-server-stdio.js";
    const SOURCEGRAPH_TYPESCRIPT_PACKAGE_JSON = "node_modules/typescript/package.json";
    const TYPESCRIPT_LANGUAGE_SERVER_CLI = "node_modules/typescript-language-server/lib/cli.mjs";
    const TYPESCRIPT_PACKAGE_JSON = "node_modules/typescript-language-server/package.json";
    const TYPESCRIPT_COMPILER_PACKAGE_JSON = "node_modules/typescript/package.json";
    const PYRIGHT_ENTRY = "node_modules/pyright/langserver.index.js";
    const PYRIGHT_PACKAGE_JSON = "node_modules/pyright/package.json";
    const VSCODE_LANGSERVERS_PACKAGE_JSON = "node_modules/vscode-langservers-extracted/package.json";
    const VSCODE_HTML_LANGUAGE_SERVER_ENTRY = "node_modules/vscode-langservers-extracted/bin/vscode-html-language-server";
    const VSCODE_CSS_LANGUAGE_SERVER_ENTRY = "node_modules/vscode-langservers-extracted/bin/vscode-css-language-server";
    const VSCODE_JSON_LANGUAGE_SERVER_ENTRY = "node_modules/vscode-langservers-extracted/bin/vscode-json-language-server";
    const YAML_LANGUAGE_SERVER_ENTRY = "node_modules/yaml-language-server/bin/yaml-language-server";
    const YAML_LANGUAGE_SERVER_PACKAGE_JSON = "node_modules/yaml-language-server/package.json";
    const DOCKER_COMPOSE_SCHEMA_URL = "https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json";
    const DOCKER_COMPOSE_FILE_NAMES = Object.freeze([
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml"
    ]);
    const BASH_LANGUAGE_SERVER_ENTRY = "node_modules/bash-language-server/out/cli.js";
    const BASH_LANGUAGE_SERVER_PACKAGE_JSON = "node_modules/bash-language-server/package.json";
    const DOCKERFILE_LANGUAGE_SERVER_ENTRY = "node_modules/dockerfile-language-server-nodejs/bin/docker-langserver";
    const DOCKERFILE_LANGUAGE_SERVER_PACKAGE_JSON = "node_modules/dockerfile-language-server-nodejs/package.json";
    const WINDOWS_SCRIPTING_LSP_ENTRY = "resources/windows-scripting-lsp/server.cjs";
    const WINDOWS_SCRIPTING_LSP_PACKAGE_JSON = "node_modules/vscode-languageserver/package.json";
    const WINDOWS_SCRIPTING_TEXTDOCUMENT_PACKAGE_JSON = "node_modules/vscode-languageserver-textdocument/package.json";
    const LEMMINX_LANGUAGE_SERVER_JAR = "org.eclipse.lemminx-*-uber.jar";
    const LEMMINX_MAVEN_EXTENSION_JAR = "extensions/*lemminx*maven*.jar";
    const LEMMINX_SERVER_MAIN_CLASS = "org.eclipse.lemminx.XMLServerLauncher";
    const JDTLS_LAUNCHER_JAR = "plugins/org.eclipse.equinox.launcher_*.jar";
    const JDTLS_CONFIG_WIN = "config_win";
    const JDTLS_FEATURES_DIR = "features";
    const JDTLS_PLUGINS_DIR = "plugins";
    const KOTLIN_ADAPTER_ENTRY = "resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs";
    const KOTLIN_LSP_ENTRY = "vendor/kotlin-lsp/bin/intellij-server.exe";
    const KOTLIN_COMPILER_ENTRY = "vendor/kotlin-compiler/kotlinc/bin/kotlinc.bat";
    const KOTLIN_ABI_PLUGIN = "vendor/kotlin-compiler/kotlinc/lib/jvm-abi-gen.jar";
    const SOURCEGRAPH_JS_TS_VARIANT = Object.freeze({
      id: "sourcegraph-javascript-typescript",
      label: "Sourcegraph JavaScript and TypeScript IntelliSense",
      entryFile: SOURCEGRAPH_JS_TS_ENTRY,
      launchArgs: "",
      requiredFiles: Object.freeze([
        SOURCEGRAPH_JS_TS_ENTRY,
        SOURCEGRAPH_TYPESCRIPT_PACKAGE_JSON
      ])
    });
    const TYPESCRIPT_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "typescript-language-server",
      label: "TypeScript Language Server",
      entryFile: TYPESCRIPT_LANGUAGE_SERVER_CLI,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        TYPESCRIPT_LANGUAGE_SERVER_CLI,
        TYPESCRIPT_PACKAGE_JSON,
        TYPESCRIPT_COMPILER_PACKAGE_JSON
      ])
    });
    const PYRIGHT_VARIANT = Object.freeze({
      id: "pyright",
      label: "Pyright",
      entryFile: PYRIGHT_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        PYRIGHT_ENTRY,
        PYRIGHT_PACKAGE_JSON
      ])
    });
    const VSCODE_HTML_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "vscode-html-language-server",
      label: "VS Code HTML Language Server",
      entryFile: VSCODE_HTML_LANGUAGE_SERVER_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        VSCODE_HTML_LANGUAGE_SERVER_ENTRY,
        VSCODE_LANGSERVERS_PACKAGE_JSON
      ])
    });
    const VSCODE_CSS_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "vscode-css-language-server",
      label: "VS Code CSS Language Server",
      entryFile: VSCODE_CSS_LANGUAGE_SERVER_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        VSCODE_CSS_LANGUAGE_SERVER_ENTRY,
        VSCODE_LANGSERVERS_PACKAGE_JSON
      ])
    });
    const VSCODE_JSON_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "vscode-json-language-server",
      label: "VS Code JSON Language Server",
      entryFile: VSCODE_JSON_LANGUAGE_SERVER_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        VSCODE_JSON_LANGUAGE_SERVER_ENTRY,
        VSCODE_LANGSERVERS_PACKAGE_JSON
      ])
    });
    const YAML_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "yaml-language-server",
      label: "YAML Language Server",
      entryFile: YAML_LANGUAGE_SERVER_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        YAML_LANGUAGE_SERVER_ENTRY,
        YAML_LANGUAGE_SERVER_PACKAGE_JSON
      ])
    });
    const BASH_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "bash-language-server",
      label: "Bash Language Server",
      entryFile: BASH_LANGUAGE_SERVER_ENTRY,
      launchArgs: "start",
      requiredFiles: Object.freeze([
        BASH_LANGUAGE_SERVER_ENTRY,
        BASH_LANGUAGE_SERVER_PACKAGE_JSON
      ])
    });
    const DOCKERFILE_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "dockerfile-language-server-nodejs",
      label: "Dockerfile Language Server",
      entryFile: DOCKERFILE_LANGUAGE_SERVER_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        DOCKERFILE_LANGUAGE_SERVER_ENTRY,
        DOCKERFILE_LANGUAGE_SERVER_PACKAGE_JSON
      ])
    });
    const WINDOWS_SCRIPTING_LANGUAGE_SERVER_VARIANT = Object.freeze({
      id: "windows-scripting-lsp",
      label: "Windows Scripting Language Server",
      entryFile: WINDOWS_SCRIPTING_LSP_ENTRY,
      launchArgs: "--stdio",
      requiredFiles: Object.freeze([
        WINDOWS_SCRIPTING_LSP_ENTRY,
        WINDOWS_SCRIPTING_LSP_PACKAGE_JSON,
        WINDOWS_SCRIPTING_TEXTDOCUMENT_PACKAGE_JSON
      ])
    });
    const JDTLS_VARIANT = Object.freeze({
      id: "eclipse-jdt-ls",
      label: "Eclipse JDT Language Server",
      supportedVersion: "1.61.0",
      entryFile: JDTLS_LAUNCHER_JAR,
      runtime: "java",
      requiredFiles: Object.freeze([
        JDTLS_LAUNCHER_JAR,
        JDTLS_CONFIG_WIN,
        JDTLS_FEATURES_DIR,
        JDTLS_PLUGINS_DIR
      ])
    });
    const KOTLIN_LSP_VARIANT = Object.freeze({
      id: "jetbrains-kotlin-lsp",
      label: "Kotlin Language Server by JetBrains",
      entryFile: KOTLIN_ADAPTER_ENTRY,
      runtime: "kotlin-adapter",
      requiredFiles: Object.freeze([KOTLIN_ADAPTER_ENTRY, KOTLIN_LSP_ENTRY, KOTLIN_COMPILER_ENTRY, KOTLIN_ABI_PLUGIN])
    });
    const LEMMINX_VARIANT = Object.freeze({
      id: "eclipse-lemminx",
      label: "Eclipse LemMinX XML Language Server",
      entryFile: LEMMINX_LANGUAGE_SERVER_JAR,
      runtime: "lemminx-java",
      requiredFiles: Object.freeze([
        LEMMINX_LANGUAGE_SERVER_JAR
      ])
    });
    const TYPESCRIPT_WORKSPACE_CONFIGURATION = Object.freeze({
      completions: Object.freeze({
        completeFunctionCalls: true
      })
    });
    const JAVA_STANDALONE_WORKSPACE_CONFIGURATION = Object.freeze({
      java: Object.freeze({
        import: Object.freeze({
          maven: Object.freeze({ enabled: false }),
          gradle: Object.freeze({ enabled: false })
        })
      })
    });

    /** Convert an absolute project path to the workspace-relative form required by JDT settings. */
    function toJavaWorkspaceRelativePath(workspaceRoot, candidatePath) {
      const root = normalizeLocalPath(workspaceRoot).replace(/\/+$/, "");
      const candidate = normalizeLocalPath(candidatePath);
      if (!root || !candidate) return candidate;
      if (candidate.toLowerCase() === root.toLowerCase()) return ".";
      return candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`)
        ? candidate.slice(root.length + 1)
        : candidate;
    }

    /** Build project-type-specific JDT settings for the opened Java workspace. */
    function getJavaWorkspaceConfiguration(options = {}) {
      const model = deps.getJavaWorkspaceModel?.() || null;
      const runtime = deps.getJavaWorkspaceRuntime?.() || null;
      const configuredRuntimes = (deps.getConfiguredJdks?.() || []).map((jdk) => ({
        name: `JavaSE-${jdk.feature}`,
        path: jdk.path,
        default: jdk.id === runtime?.projectJdk?.id
      }));
      const unmanagedModule = model?.kind === "unmanaged" ? model.modules?.[0] : null;
      const projectGradle = model?.projectConfiguration?.buildSystem === "gradle"
        ? model.projectConfiguration.gradle || {}
        : null;
      const gradleMode = ["wrapper", "built-in", "installation"].includes(projectGradle?.mode)
        ? projectGradle.mode
        : (projectGradle?.installationId ? "installation" : "");
      const selectedGradle = gradleMode === "installation"
        ? (deps.getConfiguredGradles?.() || []).find((gradle) => gradle.id === projectGradle.installationId) || null
        : null;
      const gradleImport = {
        enabled: model ? model.importers?.gradle === true : true,
        java: { home: runtime?.projectJdk?.path || null },
        annotationProcessing: { enabled: false },
        arguments: ["-x", "test"]
      };
      if (projectGradle && gradleMode) {
        gradleImport.wrapper = { enabled: gradleMode === "wrapper" };
        if (selectedGradle?.path) gradleImport.home = selectedGradle.path;
      }
      const project = {
        resourceFilters: ["node_modules", ".git", ".md-editor"]
      };
      const selectedSourceRoots = model?.analysis?.selectedSourceRoots?.length
        ? model.analysis.selectedSourceRoots
        : unmanagedModule?.sourceRoots || [];
      if (selectedSourceRoots.length) {
        project.sourcePaths = selectedSourceRoots.map((path) => toJavaWorkspaceRelativePath(model.workspaceRoot, path));
      }
      if (unmanagedModule?.referencedLibraries?.length) project.referencedLibraries = unmanagedModule.referencedLibraries;
      if (unmanagedModule?.outputRoots?.[0]) {
        project.outputPath = toJavaWorkspaceRelativePath(model.workspaceRoot, unmanagedModule.outputRoots[0]);
      }
      return {
        java: {
          autobuild: { enabled: options.javaAutobuildEnabled === true },
          maxConcurrentBuilds: 1,
          configuration: { updateBuildConfiguration: "automatic", runtimes: configuredRuntimes },
          import: {
            exclusions: model?.analysis?.importExclusions || [],
            maven: { enabled: model ? model.importers?.maven === true : true },
            gradle: gradleImport
          },
          project
        }
      };
    }
    function getProjectGradleExecutable() {
      const model = deps.getJavaWorkspaceModel?.() || null;
      const configured = model?.projectConfiguration?.gradle || {};
      if (configured.mode !== "installation" && !configured.installationId) return "";
      const selected = (deps.getConfiguredGradles?.() || []).find((gradle) => gradle.id === configured.installationId);
      if (!selected?.path) return "";
      return joinPath(selected.path, "bin", typeof window.NL_OS === "string" && window.NL_OS !== "Windows" ? "gradle" : "gradle.bat");
    }

    /** Encode the canonical build-path analysis roots for the Kotlin adapter process. */
    function getEncodedKotlinAnalysisRoots() {
      const model = deps.getJavaWorkspaceModel?.() || null;
      const validatedRoots = deps.getValidatedJdtProjectRoots?.() || [];
      const selectedRoots = model?.analysis?.inventoryKind === "standard-source-folders"
        ? (model?.analysis?.selectedSourceRoots || [])
        : (model?.hasJavaContent === true ? validatedRoots : (model?.analysis?.includedModuleRoots || []));
      const roots = selectedRoots.map(normalizeLocalPath).filter(Boolean);
      return roots.length ? encodeURIComponent(JSON.stringify(roots)) : "";
    }

    const JSON_WORKSPACE_CONFIGURATION = Object.freeze({
      json: Object.freeze({
        validate: Object.freeze({
          enable: true
        }),
        schemas: Object.freeze([
          Object.freeze({
            url: "https://json.schemastore.org/package.json",
            fileMatch: Object.freeze(["package.json"])
          })
        ])
      })
    });
    const YAML_WORKSPACE_CONFIGURATION = Object.freeze({
      yaml: Object.freeze({
        validate: true,
        hover: true,
        completion: true,
        schemaStore: Object.freeze({
          enable: false
        })
      })
    });
    const DOCKERFILE_WORKSPACE_CONFIGURATION = Object.freeze({
      docker: Object.freeze({
        languageserver: Object.freeze({
          diagnostics: Object.freeze({
            deprecatedMaintainer: "warning",
            directiveCasing: "warning",
            emptyContinuationLine: "warning",
            instructionCasing: "warning",
            instructionCmdMultiple: "warning",
            instructionEntrypointMultiple: "warning",
            instructionHealthcheckMultiple: "warning",
            instructionJSONInSingleQuotes: "warning",
            instructionWorkdirRelative: "warning"
          }),
          formatter: Object.freeze({
            ignoreMultilineInstructions: false
          })
        })
      })
    });
    const TYPESCRIPT_SERVER = Object.freeze({
      id: TYPESCRIPT_SERVER_ID,
      label: "TypeScript",
      languages: Object.freeze(["javascript", "typescript"]),
      codeMirrorLanguages: Object.freeze(["javascript", "typescript"]),
      extensions: Object.freeze(["js", "jsx", "mjs", "cjs", "ts", "tsx"]),
      lspLanguageIds: Object.freeze({
        javascript: "javascript",
        typescript: "typescript"
      }),
      bundledVariantId: TYPESCRIPT_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["tsconfig.json", "jsconfig.json", "package.json", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: TYPESCRIPT_WORKSPACE_CONFIGURATION,
      variants: Object.freeze([
        SOURCEGRAPH_JS_TS_VARIANT,
        TYPESCRIPT_LANGUAGE_SERVER_VARIANT
      ])
    });
    const JAVA_SERVER = Object.freeze({
      id: JAVA_SERVER_ID,
      label: "Java",
      languages: Object.freeze(["java"]),
      codeMirrorLanguages: Object.freeze(["java"]),
      extensions: Object.freeze(["java"]),
      lspLanguageIds: Object.freeze({
        java: "java"
      }),
      rootMarkers: Object.freeze(["pom.xml", "build.gradle", "settings.gradle", ".classpath", ".project", "src", ".git"]),
      metadataFile: METADATA_FILE,
      variants: Object.freeze([
        JDTLS_VARIANT
      ])
    });
    const KOTLIN_SERVER = Object.freeze({
      id: KOTLIN_SERVER_ID,
      label: "Kotlin",
      languages: Object.freeze(["kotlin"]),
      codeMirrorLanguages: Object.freeze(["kotlin"]),
      extensions: Object.freeze(["kt", "kts"]),
      lspLanguageIds: Object.freeze({ kotlin: "kotlin" }),
      bundledVariantId: KOTLIN_LSP_VARIANT.id,
      rootMarkers: Object.freeze(["settings.gradle.kts", "settings.gradle", "build.gradle.kts", "build.gradle", "pom.xml", ".classpath", ".git"]),
      metadataFile: METADATA_FILE,
      variants: Object.freeze([KOTLIN_LSP_VARIANT])
    });
    const PYTHON_SERVER = Object.freeze({
      id: PYTHON_SERVER_ID,
      label: "Python",
      languages: Object.freeze(["python"]),
      codeMirrorLanguages: Object.freeze(["python"]),
      extensions: Object.freeze(["py", "pyw"]),
      lspLanguageIds: Object.freeze({
        python: "python"
      }),
      bundledVariantId: PYRIGHT_VARIANT.id,
      rootMarkers: Object.freeze(["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock", ".git"]),
      metadataFile: METADATA_FILE,
      variants: Object.freeze([
        PYRIGHT_VARIANT
      ])
    });
    const HTML_SERVER = Object.freeze({
      id: HTML_SERVER_ID,
      label: "HTML",
      languages: Object.freeze(["html"]),
      codeMirrorLanguages: Object.freeze(["html"]),
      extensions: Object.freeze(["html", "htm"]),
      lspLanguageIds: Object.freeze({
        html: "html"
      }),
      bundledVariantId: VSCODE_HTML_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["package.json", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: Object.freeze({}),
      variants: Object.freeze([
        VSCODE_HTML_LANGUAGE_SERVER_VARIANT
      ])
    });
    const CSS_SERVER = Object.freeze({
      id: CSS_SERVER_ID,
      label: "CSS",
      languages: Object.freeze(["css", "scss"]),
      codeMirrorLanguages: Object.freeze(["css", "sass"]),
      extensions: Object.freeze(["css", "scss", "sass"]),
      lspLanguageIds: Object.freeze({
        css: "css",
        sass: "scss"
      }),
      bundledVariantId: VSCODE_CSS_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["package.json", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: Object.freeze({}),
      variants: Object.freeze([
        VSCODE_CSS_LANGUAGE_SERVER_VARIANT
      ])
    });
    const JSON_SERVER = Object.freeze({
      id: JSON_SERVER_ID,
      label: "JSON",
      languages: Object.freeze(["json"]),
      codeMirrorLanguages: Object.freeze(["json"]),
      extensions: Object.freeze(["json", "jsonc", "map"]),
      lspLanguageIds: Object.freeze({
        json: "json"
      }),
      bundledVariantId: VSCODE_JSON_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["package.json", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: JSON_WORKSPACE_CONFIGURATION,
      variants: Object.freeze([
        VSCODE_JSON_LANGUAGE_SERVER_VARIANT
      ])
    });
    const XML_SERVER = Object.freeze({
      id: XML_SERVER_ID,
      label: "XML and POM",
      languages: Object.freeze(["xml", "maven"]),
      codeMirrorLanguages: Object.freeze(["xml"]),
      extensions: Object.freeze(["xml", "xsd", "xsl", "xslt", "svg", "pom"]),
      lspLanguageIds: Object.freeze({
        xml: "xml",
        maven: "xml"
      }),
      rootMarkers: Object.freeze(["pom.xml", ".project", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: Object.freeze({}),
      variants: Object.freeze([
        LEMMINX_VARIANT
      ])
    });
    const YAML_SERVER = Object.freeze({
      id: YAML_SERVER_ID,
      label: "YAML",
      languages: Object.freeze(["yaml"]),
      codeMirrorLanguages: Object.freeze(["yaml"]),
      extensions: Object.freeze(["yaml", "yml"]),
      lspLanguageIds: Object.freeze({
        yaml: "yaml"
      }),
      bundledVariantId: YAML_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["package.json", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: YAML_WORKSPACE_CONFIGURATION,
      variants: Object.freeze([
        YAML_LANGUAGE_SERVER_VARIANT
      ])
    });
    const BASH_SERVER = Object.freeze({
      id: BASH_SERVER_ID,
      label: "Bash",
      languages: Object.freeze(["bash"]),
      codeMirrorLanguages: Object.freeze(["shell"]),
      extensions: Object.freeze(["sh", "bash", "zsh", "fish"]),
      lspLanguageIds: Object.freeze({
        bash: "shellscript",
        shell: "shellscript"
      }),
      bundledVariantId: BASH_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze([".shellcheckrc", ".editorconfig", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: Object.freeze({}),
      variants: Object.freeze([
        BASH_LANGUAGE_SERVER_VARIANT
      ])
    });
    const DOCKERFILE_SERVER = Object.freeze({
      id: DOCKERFILE_SERVER_ID,
      label: "Dockerfile",
      languages: Object.freeze(["dockerfile"]),
      codeMirrorLanguages: Object.freeze(["dockerfile"]),
      extensions: Object.freeze(["dockerfile"]),
      lspLanguageIds: Object.freeze({
        dockerfile: "dockerfile"
      }),
      bundledVariantId: DOCKERFILE_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze(["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: DOCKERFILE_WORKSPACE_CONFIGURATION,
      variants: Object.freeze([
        DOCKERFILE_LANGUAGE_SERVER_VARIANT
      ])
    });
    const WINDOWS_SCRIPTING_SERVER = Object.freeze({
      id: WINDOWS_SCRIPTING_SERVER_ID,
      label: "Windows Scripting",
      languages: Object.freeze(["batch", "cmd", "powershell", "registry"]),
      codeMirrorLanguages: Object.freeze(["batch", "powershell", "registry"]),
      extensions: Object.freeze(["bat", "cmd", "ps1", "psm1", "psd1", "reg"]),
      lspLanguageIds: Object.freeze({
        batch: "batch",
        powershell: "powershell",
        registry: "registry"
      }),
      bundledVariantId: WINDOWS_SCRIPTING_LANGUAGE_SERVER_VARIANT.id,
      rootMarkers: Object.freeze([".editorconfig", ".git"]),
      metadataFile: METADATA_FILE,
      workspaceConfiguration: Object.freeze({}),
      variants: Object.freeze([
        WINDOWS_SCRIPTING_LANGUAGE_SERVER_VARIANT
      ])
    });
    const serverDefinitions = Object.freeze({
      [TYPESCRIPT_SERVER_ID]: TYPESCRIPT_SERVER,
      [JAVA_SERVER_ID]: JAVA_SERVER,
      [KOTLIN_SERVER_ID]: KOTLIN_SERVER,
      [PYTHON_SERVER_ID]: PYTHON_SERVER,
      [HTML_SERVER_ID]: HTML_SERVER,
      [CSS_SERVER_ID]: CSS_SERVER,
      [JSON_SERVER_ID]: JSON_SERVER,
      [XML_SERVER_ID]: XML_SERVER,
      [YAML_SERVER_ID]: YAML_SERVER,
      [BASH_SERVER_ID]: BASH_SERVER,
      [DOCKERFILE_SERVER_ID]: DOCKERFILE_SERVER,
      [WINDOWS_SCRIPTING_SERVER_ID]: WINDOWS_SCRIPTING_SERVER
    });

    /**
     * Return whether this runtime can start local language-server processes.
     * @returns {boolean} True when Neutralino process APIs are available.
     */
    function isDesktopLspRuntime() {
      return typeof deps.isNeutralinoRuntime === "function"
        ? deps.isNeutralinoRuntime()
        : typeof window.NL_VERSION !== "undefined" && typeof window.Neutralino !== "undefined";
    }

    /**
     * Normalize a local filesystem path for predictable joins.
     * @param {string} path - Local path from Neutralino or profile helpers.
     * @returns {string} Slash-normalized path without trailing separators.
     */
    function normalizeLocalPath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    /** Return the opened folder when the file belongs to that workspace. */
    function getOpenedWorkspaceRoot(filePath) {
      const workspaceRoot = normalizeLocalPath(deps.getWorkspaceRoot?.());
      const normalizedFilePath = normalizeLocalPath(filePath);
      if (!workspaceRoot || !normalizedFilePath) return "";
      const comparableRoot = workspaceRoot.toLowerCase();
      const comparableFilePath = normalizedFilePath.toLowerCase();
      return comparableFilePath === comparableRoot || comparableFilePath.startsWith(`${comparableRoot}/`)
        ? workspaceRoot
        : "";
    }

    /** Return whether a Java file belongs to a conventional project source tree. */
    function isJavaProjectSourceFile(filePath) {
      return normalizeLocalPath(filePath).split("/").some((segment) => segment.toLowerCase() === "src");
    }

    /** Return whether a Java file should run without inheriting the surrounding repository workspace. */
    function isStandaloneJavaFile(serverId, filePath) {
      return serverId === JAVA_SERVER_ID
        && Boolean(filePath)
        && !getOpenedWorkspaceRoot(filePath)
        && !isJavaProjectSourceFile(filePath);
    }

    /**
     * Join local path segments without requiring Node path helpers in the browser.
     * @param {...string} parts - Local path fragments.
     * @returns {string} Slash-normalized local path.
     */
    function joinPath(...parts) {
      const usable = parts
        .map((part) => String(part || "").replace(/\\/g, "/"))
        .filter(Boolean);
      if (!usable.length) return "";
      return normalizeLocalPath(usable.join("/").replace(/\/+/g, "/"));
    }

    /**
     * Convert a local path into a file URI for LSP messages.
     * @param {string} path - Local filesystem path.
     * @returns {string} File URI for the path.
     */
    function toFileUri(path) {
      const normalized = normalizeLocalPath(path);
      if (!normalized) return "";
      if (/^[A-Za-z]:\//.test(normalized)) {
        const drive = normalized.slice(0, 2);
        const rest = normalized.slice(3).split("/").map(encodeURIComponent).join("/");
        return `file:///${drive}/${rest}`;
      }
      return `file://${normalized.split("/").map(encodeURIComponent).join("/")}`;
    }

    /**
     * Convert a file URI from an LSP response into a local filesystem path.
     * @param {string} uri - File URI returned by a language server.
     * @returns {string} Slash-normalized local path, or empty string for non-file URIs.
     */
    function fromFileUri(uri) {
      const value = String(uri || "").trim();
      if (!value.toLowerCase().startsWith("file://")) return "";
      let decoded = "";
      try {
        decoded = decodeURIComponent(value).replace(/\\/g, "/");
      } catch (_error) {
        return "";
      }
      let path = decoded.replace(/^file:\/\//i, "");
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      return normalizeLocalPath(path);
    }

    /**
     * Return the supported server definition for an application language.
     * @param {string} languageId - MD-Editor language id.
     * @returns {object|null} Server definition or null when unsupported.
     */
    function getServerForLanguage(languageId) {
      const normalizedLanguageId = String(languageId || "").toLowerCase();
      return Object.values(serverDefinitions).find((server) => server.languages.includes(normalizedLanguageId)) || null;
    }

    /**
     * Resolve the LSP language id used for a CodeMirror language.
     * @param {object} server - Supported server definition.
     * @param {string} codeMirrorLanguageId - CodeMirror language id.
     * @returns {string} LSP language id.
     */
    function getLspLanguageId(server, codeMirrorLanguageId) {
      return server?.lspLanguageIds?.[codeMirrorLanguageId] || codeMirrorLanguageId || "";
    }

    function getFileName(path) {
      return String(path || "").replace(/\\/g, "/").split("/").pop() || "";
    }

    function cloneYamlWorkspaceConfiguration() {
      return {
        yaml: {
          validate: true,
          hover: true,
          completion: true,
          schemaStore: {
            enable: false
          }
        }
      };
    }

    function isDockerComposePath(path) {
      const fileName = getFileName(path).toLowerCase();
      return DOCKER_COMPOSE_FILE_NAMES.includes(fileName);
    }

    function getYamlDocumentHeaderFields(content) {
      const fields = new Set();
      const lines = String(content || "").split(/\r?\n/);
      for (const line of lines) {
        if (/^\s*---\s*(#.*)?$/.test(line) && fields.size) break;
        const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/);
        if (match) fields.add(match[1]);
      }
      return fields;
    }

    function isKubernetesYamlContent(content) {
      const fields = getYamlDocumentHeaderFields(content);
      return fields.has("apiVersion") && fields.has("kind");
    }

    function getYamlSchemaFileMatch(filePath) {
      const normalizedPath = normalizeLocalPath(filePath);
      return normalizedPath || getFileName(filePath) || "*.yaml";
    }

    function getYamlWorkspaceConfiguration(options = {}) {
      const configuration = cloneYamlWorkspaceConfiguration();
      const filePath = options.filePath || options.path || "";
      const content = options.content || "";
      if (isDockerComposePath(filePath)) {
        configuration.yaml.schemas = {
          [DOCKER_COMPOSE_SCHEMA_URL]: DOCKER_COMPOSE_FILE_NAMES
        };
      } else if (isKubernetesYamlContent(content)) {
        configuration.yaml.schemas = {
          kubernetes: [getYamlSchemaFileMatch(filePath)]
        };
      }
      return configuration;
    }

    /**
     * Resolve the app profile data folder used for language-server installs.
     * @returns {Promise<string>} Profile data folder path, or empty string.
     */
    async function getProfileDataDirPath() {
      if (typeof deps.getProfileDataDirPath === "function") {
        return normalizeLocalPath(await deps.getProfileDataDirPath());
      }
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.getEnv) return "";
      const home = await Neutralino.os.getEnv("USERPROFILE") || await Neutralino.os.getEnv("HOME") || "";
      return home ? joinPath(home, DESKTOP_PROFILE_DIR) : "";
    }

    /**
     * Resolve the fixed install folder for a supported server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<string>} Fixed server install folder.
     */
    async function getServerInstallDir(serverId) {
      const profileDir = await getProfileDataDirPath();
      return profileDir ? joinPath(profileDir, LANGUAGE_SERVER_DIR, serverId) : "";
    }

    /**
     * Resolve a writable workspace/cache folder for a language-server session.
     * @param {string} serverId - Supported server id.
     * @param {string} workspaceRoot - Project workspace root.
     * @param {string} filePath - Fallback file path.
     * @param {{ scopeSignature?: string }} options - Optional workspace identity overrides.
     * @returns {Promise<string>} Server workspace folder path.
     */
    async function getServerWorkspaceDir(serverId, workspaceRoot, filePath = "", options = {}) {
      if (serverId === KOTLIN_SERVER_ID && workspaceRoot) return joinPath(workspaceRoot, DESKTOP_PROFILE_DIR, LANGUAGE_SERVER_WORKSPACE_DIR, KOTLIN_SERVER_ID);
      const profileDir = await getProfileDataDirPath();
      const useStandaloneJavaWorkspace = isStandaloneJavaFile(serverId, filePath);
      const source = normalizeLocalPath((useStandaloneJavaWorkspace ? filePath : workspaceRoot) || filePath || serverId);
      const scopeSignature = serverId === JAVA_SERVER_ID && !useStandaloneJavaWorkspace
        ? String(Object.prototype.hasOwnProperty.call(options, "scopeSignature")
          ? options.scopeSignature || ""
          : deps.getJavaWorkspaceModel?.()?.analysis?.scopeSignature || "")
        : "";
      return profileDir ? joinPath(profileDir, LANGUAGE_SERVER_WORKSPACE_DIR, serverId, stablePathId(source, scopeSignature)) : "";
    }

    /**
     * Resolve the desktop app folder that owns bundled language-server dependencies.
     * @returns {Promise<string>} Desktop app folder path, or empty string.
     */
    async function getJdtExtensionBundlePaths() {
      const appRoot = await getDesktopAppRootPath();
      const bundleNames = ["mdeditor-kotlin-abi.jar", "mdeditor-java-pull-up.jar", "mdeditor-java-push-down.jar"];
      const bundlePaths = bundleNames.map((name) => joinPath(appRoot, "resources", "language-server-extensions", name));
      const available = await Promise.all(bundlePaths.map(async (bundlePath) => await pathExists(bundlePath) ? bundlePath : ""));
      return available.filter(Boolean);
    }

    async function getDesktopAppRootPath() {
      if (typeof deps.getDesktopAppRootPath === "function") {
        return normalizeLocalPath(await deps.getDesktopAppRootPath());
      }
      return "";
    }

    /**
     * Resolve the bundled dependency folder for a supported server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<string>} Bundled dependency root folder, or empty string.
     */
    async function getBundledServerInstallDir(serverId) {
      const server = serverDefinitions[serverId];
      return server?.bundledVariantId ? getDesktopAppRootPath() : "";
    }

    /**
     * Resolve the metadata file path for an installed server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<string>} Metadata file path.
     */
    async function getServerMetadataPath(serverId) {
      const server = serverDefinitions[serverId];
      const installDir = await getServerInstallDir(serverId);
      return server && installDir ? joinPath(installDir, server.metadataFile) : "";
    }

    /**
     * Read the install metadata for a server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<object|null>} Parsed metadata or null.
     */
    async function readServerMetadata(serverId) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      const metadataPath = await getServerMetadataPath(serverId);
      if (!metadataPath || !Neutralino?.filesystem?.readFile) return null;
      try {
        return JSON.parse(await Neutralino.filesystem.readFile(metadataPath) || "null");
      } catch (_error) {
        return null;
      }
    }

    /**
     * Check whether a required installed server file exists.
     * @param {string} path - Local path to check.
     * @returns {Promise<boolean>} True when the path exists.
     */
    async function pathExists(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.getStats) return false;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function readDirectory(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.readDirectory) return [];
      try {
        return await Neutralino.filesystem.readDirectory(path) || [];
      } catch (_error) {
        return [];
      }
    }

    function getDirectoryEntryName(entry) {
      return entry?.entry || entry?.name || "";
    }

    function globToRegExp(pattern) {
      return new RegExp(`^${String(pattern || "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    }

    async function resolveExistingPath(installDir, relativePath) {
      const normalizedRelativePath = normalizeLocalPath(relativePath);
      if (!normalizedRelativePath.includes("*")) {
        const exactPath = joinPath(installDir, normalizedRelativePath);
        return await pathExists(exactPath) ? exactPath : "";
      }
      const slashIndex = normalizedRelativePath.lastIndexOf("/");
      const parentRelativePath = slashIndex >= 0 ? normalizedRelativePath.slice(0, slashIndex) : "";
      const filePattern = slashIndex >= 0 ? normalizedRelativePath.slice(slashIndex + 1) : normalizedRelativePath;
      const parentPath = joinPath(installDir, parentRelativePath);
      const matcher = globToRegExp(filePattern);
      const entries = await readDirectory(parentPath);
      const match = entries.map(getDirectoryEntryName).find((entryName) => matcher.test(entryName));
      return match ? joinPath(parentPath, match) : "";
    }

    async function hasRequiredFile(installDir, relativePath) {
      return !!(await resolveExistingPath(installDir, relativePath));
    }

    async function ensureDirectory(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.createDirectory) return;
      const parts = normalizeLocalPath(path).split("/");
      let current = "";
      for (const part of parts) {
        current = current ? joinPath(current, part) : part;
        if (/^[A-Za-z]:$/.test(current)) continue;
        try {
          await Neutralino.filesystem.createDirectory(current);
        } catch (_error) {
          // Existing directories are fine; Neutralino reports them as create failures.
        }
      }
    }

    function stablePathId(path, signature = "") {
      const normalized = normalizeLocalPath(path).toLowerCase();
      const hashSource = signature ? `${normalized}|${signature}` : normalized;
      let hash = 5381;
      for (let index = 0; index < hashSource.length; index += 1) {
        hash = ((hash << 5) + hash + hashSource.charCodeAt(index)) >>> 0;
      }
      const safeName = normalized.split("/").filter(Boolean).pop()?.replace(/[^a-z0-9._-]+/gi, "-") || "workspace";
      return `${safeName}-${hash.toString(16)}`;
    }

    /**
     * Resolve an installed server variant from metadata or installed files.
     * @param {object} server - Supported server definition.
     * @param {string} installDir - Fixed server install folder.
     * @param {object|null} metadata - Saved install metadata.
     * @returns {Promise<object|null>} Active installed variant or null.
     */
    async function resolveInstalledVariant(server, installDir, metadata) {
      if (!server || !installDir) return null;
      const metadataVariant = server.variants.find((variant) => variant.id === metadata?.variantId) || null;
      if (metadataVariant && await hasRequiredFile(installDir, metadataVariant.entryFile)) return metadataVariant;
      for (const variant of server.variants) {
        const checks = await Promise.all(variant.requiredFiles.map((filePath) => hasRequiredFile(installDir, filePath)));
        if (checks.every(Boolean)) return variant;
      }
      return null;
    }

    /**
     * Build an install status for a specific folder and variant.
     * @param {object} server - Supported server definition.
     * @param {string} installDir - Folder that should contain required server files.
     * @param {object|null} metadata - Optional profile install metadata.
     * @param {object} options - Status source options.
     * @returns {Promise<object>} Install status details for that source.
     */
    async function getInstallSourceStatus(server, installDir, metadata, options = {}) {
      const variant = options.variant || (server && installDir ? await resolveInstalledVariant(server, installDir, metadata) : null);
      const requiredFiles = variant && installDir
        ? await Promise.all(variant.requiredFiles.map(async (filePath) => ({
          path: joinPath(installDir, filePath),
          exists: await hasRequiredFile(installDir, filePath)
        })))
        : [];
      const installed = !!(server && installDir && variant && requiredFiles.length && requiredFiles.every((entry) => entry.exists));
      return {
        installDir,
        metadata,
        variant,
        installed,
        bundled: options.bundled === true,
        missingFiles: requiredFiles.filter((entry) => !entry.exists).map((entry) => entry.path)
      };
    }

    /**
     * Return the current installation status for a supported server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<object>} Install status for UI and editor checks.
     */
    async function getServerStatus(serverId) {
      const server = serverDefinitions[serverId] || null;
      const bundledInstallDir = server ? await getBundledServerInstallDir(serverId) : "";
      const bundledVariant = server?.variants?.find((variant) => variant.id === server.bundledVariantId) || null;
      const bundledStatus = server
        ? await getInstallSourceStatus(server, bundledInstallDir, null, { variant: bundledVariant, bundled: true })
        : null;
      const profileInstallDir = server ? await getServerInstallDir(serverId) : "";
      const metadata = server ? await readServerMetadata(serverId) : null;
      const profileStatus = server
        ? await getInstallSourceStatus(server, profileInstallDir, metadata)
        : null;
      const activeStatus = profileStatus?.installed ? profileStatus : bundledStatus;
      return {
        server,
        serverId,
        installDir: activeStatus?.installDir || profileInstallDir || bundledInstallDir || "",
        metadata: activeStatus?.metadata || null,
        variant: activeStatus?.variant || null,
        installed: activeStatus?.installed === true,
        bundled: activeStatus?.installed === true && activeStatus?.bundled === true,
        desktopRuntime: isDesktopLspRuntime(),
        missingFiles: activeStatus?.missingFiles || []
      };
    }

    /**
     * Return workspace configuration sent to language servers after initialization.
     * @param {string} serverId - Supported server id.
     * @param {object} options - Active document details used for targeted schemas.
     * @returns {object} Workspace configuration object.
     */
    function getServerWorkspaceConfiguration(serverId, options = {}) {
      if (serverId === JAVA_SERVER_ID) {
        const filePath = normalizeLocalPath(options.filePath || "");
        return isStandaloneJavaFile(serverId, filePath) ? JAVA_STANDALONE_WORKSPACE_CONFIGURATION : getJavaWorkspaceConfiguration(options);
      }
      if (serverId === YAML_SERVER_ID) return getYamlWorkspaceConfiguration(options);
      return serverDefinitions[serverId]?.workspaceConfiguration || {};
    }

    /**
     * Build the process launch descriptor for an installed server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<object|null>} Launch descriptor or null.
     */
    async function getLaunchDescriptor(serverId, options = {}) {
      const status = await getServerStatus(serverId);
      if (!status.installed || !status.variant) return null;
      const entryPath = await resolveExistingPath(status.installDir, status.variant.entryFile);
      if (!entryPath) return null;
      if (status.variant.runtime === "kotlin-adapter") {
        const workspaceDir = await getServerWorkspaceDir(serverId, options.workspaceRoot || "", options.filePath || "");
        const workspaceRuntime = deps.getJavaWorkspaceRuntime?.() || null;
        const toolingJdk = workspaceRuntime?.launcherJdk?.path || joinPath(await getDesktopAppRootPath(), "bin", "tooling-jdk");
        const projectJdk = workspaceRuntime?.projectJdk?.path || toolingJdk;
        const analysisRoots = getEncodedKotlinAnalysisRoots();
        const mavenConfiguration = deps.mavenRuntimeSettings?.getConfiguration?.() || {};
        const resolvedMaven = await deps.mavenRuntimeSettings?.resolveRunner?.({
          projectRoot: options.workspaceRoot || "",
          workspaceRoot: options.workspaceRoot || "",
          osName: global.NL_OS || "Windows",
          configuration: mavenConfiguration
        });
        if (resolvedMaven?.error) throw new Error(resolvedMaven.error);
        await ensureDirectory(workspaceDir);
        return {
          command: [
            "node", quoteCommandArg(entryPath),
            "--workspace", quoteCommandArg(options.workspaceRoot || ""),
            "--cache", quoteCommandArg(workspaceDir),
            "--server", quoteCommandArg(joinPath(status.installDir, KOTLIN_LSP_ENTRY)),
            "--compiler", quoteCommandArg(joinPath(status.installDir, KOTLIN_COMPILER_ENTRY)),
            "--abiPlugin", quoteCommandArg(joinPath(status.installDir, KOTLIN_ABI_PLUGIN)),
            "--toolingJdk", quoteCommandArg(toolingJdk),
            "--projectJdk", quoteCommandArg(projectJdk),
            "--maximumProblems", String(Math.max(1, Number(deps.getMaximumProblems?.()) || 5000)),
            ...(analysisRoots ? ["--analysisRoots", quoteCommandArg(analysisRoots)] : []),
            "--gradle", quoteCommandArg(getProjectGradleExecutable()),
            "--maven", quoteCommandArg(resolvedMaven?.runnerPath || resolvedMaven?.runner || "mvn"),
            "--mavenSettings", quoteCommandArg(mavenConfiguration.settingsFilePath || ""),
            "--mavenOffline", String(mavenConfiguration.offline === true)
          ].join(" "),
          cwd: status.installDir
        };
      }
      if (status.variant.runtime === "java") {
        const workspaceDir = await getServerWorkspaceDir(serverId, options.workspaceRoot || "", options.filePath || "");
        await ensureDirectory(workspaceDir);
        const workspaceRuntime = serverId === JAVA_SERVER_ID ? deps.getJavaWorkspaceRuntime?.() : null;
        if (serverId === JAVA_SERVER_ID && !workspaceRuntime?.launcherJdk?.path) return null;
        const javaExecutable = workspaceRuntime?.launcherJdk?.path
          ? deps.getJavaExecutableForJdkHome?.(workspaceRuntime.launcherJdk.path)
          : (typeof deps.getJavaLanguageServerExecutable === "function" ? await deps.getJavaLanguageServerExecutable() : "java");
        const command = [
          quoteCommandArg(javaExecutable || "java"),
          "-Declipse.application=org.eclipse.jdt.ls.core.id1",
          "-Dosgi.bundles.defaultStartLevel=4",
          "-Declipse.product=org.eclipse.jdt.ls.core.product",
          "-Dlog.protocol=false",
          "-Dlog.level=WARNING",
          "-Xmx2G",
          "--add-modules=ALL-SYSTEM",
          "--add-opens java.base/java.util=ALL-UNNAMED",
          "--add-opens java.base/java.lang=ALL-UNNAMED",
          "-jar",
          quoteCommandArg(entryPath),
          "-configuration",
          quoteCommandArg(joinPath(status.installDir, JDTLS_CONFIG_WIN)),
          "-data",
          quoteCommandArg(workspaceDir)
        ].join(" ");
        return {
          command,
          cwd: status.installDir
        };
      }
      if (status.variant.runtime === "lemminx-java") {
        const javaExecutable = typeof deps.getJavaLanguageServerExecutable === "function"
          ? await deps.getJavaLanguageServerExecutable()
          : "java";
        const classpathEntries = [entryPath];
        if (await resolveExistingPath(status.installDir, LEMMINX_MAVEN_EXTENSION_JAR)) {
          classpathEntries.push(joinPath(status.installDir, "extensions", "*"));
        }
        const command = [
          quoteCommandArg(javaExecutable || "java"),
          "-cp",
          quoteCommandArg(classpathEntries.join(";")),
          LEMMINX_SERVER_MAIN_CLASS
        ].join(" ");
        return {
          command,
          cwd: status.installDir
        };
      }
      const args = status.variant.launchArgs ? ` ${status.variant.launchArgs}` : "";
      const command = status.variant.runtime === "executable"
        ? `"${entryPath}"${args}`
        : `node "${entryPath}"${args}`;
      return {
        command,
        cwd: status.installDir
      };
    }

    function quoteCommandArg(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    /**
     * Find the nearest project root by walking up from a file path.
     * @param {string} filePath - Open editor file path.
     * @param {object} server - Supported server definition.
     * @returns {Promise<string>} Project root path, or the file's containing folder.
     */
    async function resolveWorkspaceRoot(filePath, server) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      const normalizedFilePath = normalizeLocalPath(filePath);
      const openedWorkspaceRoot = [JAVA_SERVER_ID, KOTLIN_SERVER_ID].includes(server?.id) ? getOpenedWorkspaceRoot(normalizedFilePath) : "";
      if (openedWorkspaceRoot) return openedWorkspaceRoot;
      const segments = normalizedFilePath.split("/").filter(Boolean);
      if (segments.length <= 1) return "";
      let current = segments.slice(0, -1).join("/");
      if (/^[A-Za-z]:$/.test(segments[0])) current = `${segments[0]}/${segments.slice(1, -1).join("/")}`;
      const fallback = current;
      while (current) {
        for (const marker of server?.rootMarkers || []) {
          if (await pathExists(joinPath(current, marker))) return current;
        }
        const next = current.replace(/\/[^/]+$/, "");
        if (next === current || !next || /^[A-Za-z]:$/.test(next)) break;
        current = next;
      }
      return fallback;
    }

    const api = {
      getLaunchDescriptor,
      getBundledServerInstallDir,
      getDesktopAppRootPath,
      getLspLanguageId,
      getProfileDataDirPath,
      getServerForLanguage,
      getServerInstallDir,
      getServerMetadataPath,
      getServerStatus,
      getServerWorkspaceDir,
      getJdtExtensionBundlePaths,
      getServerWorkspaceConfiguration,
      fromFileUri,
      isDesktopLspRuntime,
      isStandaloneJavaFile,
      joinPath,
      normalizeLocalPath,
      readServerMetadata,
      resolveWorkspaceRoot,
      serverDefinitions,
      toFileUri
    };

    app.registerModule("lspServerRegistry", api);
    return api;
  }

  window.registerMarkdownViewerLspServerRegistry = registerMarkdownViewerLspServerRegistry;
})(window);
