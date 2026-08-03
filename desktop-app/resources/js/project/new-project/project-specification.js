(function(global) {
  "use strict";

  /** Normalizes and validates the complete user-selected New Project specification. */
  function registerMarkdownViewerProjectSpecification(app, deps = {}) {
    const catalog = deps.catalog;

    function normalizePath(value) {
      const text = String(value || "").trim().replace(/\\/g, "/");
      return text.length > 1 ? text.replace(/\/+$/, "") : text;
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function isAbsolutePath(value) {
      const path = normalizePath(value);
      return /^[A-Za-z]:\//.test(path) || path.startsWith("/");
    }

    function isSafeRelativePath(value) {
      const path = normalizePath(value);
      return Boolean(path)
        && /^[A-Za-z0-9._/-]+$/.test(path)
        && !isAbsolutePath(path)
        && !path.split("/").some((part) => !part || part === "." || part === "..");
    }

    function isSafeClasspathPath(value) {
      const path = normalizePath(value);
      if (!path || /[\r\n"]/.test(path)) return false;
      if (!isAbsolutePath(path)) return isSafeRelativePath(path);
      return !path.split("/").some((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part)) ? false : part === "." || part === "..");
    }

    function splitLines(value) {
      return Array.from(new Set(String(value || "").split(/\r?\n/).map(normalizePath).filter(Boolean)));
    }

    function normalize(raw = {}) {
      const template = catalog?.get?.(raw.language) || catalog?.get?.("java");
      const specification = { ...template.defaults, ...raw };
      specification.projectName = String(specification.projectName || "").trim();
      specification.parentDirectory = normalizePath(specification.parentDirectory);
      specification.language = template.id;
      specification.projectPath = joinPath(specification.parentDirectory, specification.projectName);
      specification.initializeGit = specification.initializeGit === true;
      if (specification.language === "java") {
        specification.jarFiles = splitLines(specification.jarFiles);
        specification.classpathFolders = splitLines(specification.classpathFolders);
        specification.dependencies = splitLines(specification.dependencies);
      }
      return specification;
    }

    function validateRelativeRoots(specification, fields) {
      const roots = fields.map((field) => normalizePath(specification[field])).filter(Boolean);
      for (const root of roots) {
        if (!isSafeRelativePath(root)) return "Source, test, and output folders must be relative paths without '.' or '..' segments.";
      }
      for (let left = 0; left < roots.length; left += 1) {
        for (let right = left + 1; right < roots.length; right += 1) {
          const a = roots[left].toLowerCase();
          const b = roots[right].toLowerCase();
          if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
            return "Source, test, and output folders cannot duplicate or contain one another.";
          }
        }
      }
      return "";
    }

    function validateDependencies(dependencies) {
      const coordinatePart = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/;
      const scopes = new Set(["compile", "implementation", "runtime", "runtimeOnly", "provided", "compileOnly", "test", "testImplementation"]);
      return dependencies.every((entry) => {
        const parts = entry.split(":");
        return (parts.length === 3 || parts.length === 4)
          && parts.slice(0, 3).every((part) => coordinatePart.test(part))
          && (parts.length === 3 || scopes.has(parts[3]));
      });
    }

    function validate(raw = {}) {
      const specification = normalize(raw);
      if (!catalog?.get?.(specification.language)) return { valid: false, error: "Select a supported project language.", specification };
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(specification.projectName) || specification.projectName === "." || specification.projectName === "..") {
        return { valid: false, error: "Project name must start with a letter or number and contain only letters, numbers, '.', '_' or '-'.", specification };
      }
      if (!isAbsolutePath(specification.parentDirectory)) return { valid: false, error: "Select an absolute parent directory.", specification };
      const template = catalog.get(specification.language);
      for (const field of template.fields) {
        if (field.required && isFieldVisible(field, specification) && !String(specification[field.id] ?? "").trim()) {
          return { valid: false, error: `${field.label} is required.`, specification };
        }
      }

      let rootError = "";
      if (specification.language === "java") {
        const roots = ["sourceFolder", "testFolder"].concat(specification.projectType === "standard" ? ["outputFolder"] : []);
        rootError = validateRelativeRoots(specification, roots);
        if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(specification.packageName)) {
          return { valid: false, error: "Java base package must contain valid dot-separated identifiers.", specification };
        }
        if (!/^[A-Za-z_$][\w$]*$/.test(specification.mainClass)) return { valid: false, error: "Java main class is invalid.", specification };
        if (!/^[A-Za-z0-9_.-]+$/.test(specification.groupId) || !/^[A-Za-z0-9_.-]+$/.test(specification.artifactId)) {
          return { valid: false, error: "Java group and artifact IDs contain unsupported characters.", specification };
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(specification.version)) {
          return { valid: false, error: "Java project version contains unsupported characters.", specification };
        }
        if (!validateDependencies(specification.dependencies)) {
          return { valid: false, error: "Dependencies must use group:artifact:version[:scope].", specification };
        }
        const invalidLibraryPath = specification.jarFiles.concat(specification.classpathFolders)
          .find((path) => !isSafeClasspathPath(path));
        if (invalidLibraryPath) return { valid: false, error: `Classpath path is unsafe: ${invalidLibraryPath}`, specification };
        if (specification.eclipseSettingsEnabled && normalizePath(specification.eclipseSettingsSource).split("/").pop() !== ".settings") {
          return { valid: false, error: "The Eclipse preferences source must be a directory named .settings.", specification };
        }
        if (specification.eclipseSettingsEnabled && !isAbsolutePath(specification.eclipseSettingsSource)) {
          return { valid: false, error: "The Eclipse preferences source must be an absolute path.", specification };
        }
      } else if (specification.language === "python") {
        if (!/^[A-Za-z_]\w*$/.test(specification.packageName)) return { valid: false, error: "Python package name is invalid.", specification };
        if (!/^\d+(?:\.\d+){1,2}$/.test(specification.pythonVersion)) return { valid: false, error: "Python version must contain two or three numeric components.", specification };
        if (!isSafeRelativePath(specification.entryScript) || !specification.entryScript.endsWith(".py")) {
          return { valid: false, error: "Python entry script must be a relative .py path.", specification };
        }
        if (!isSafeRelativePath(specification.virtualEnvironment)) {
          return { valid: false, error: "Virtual environment directory must be a safe relative path.", specification };
        }
      } else if (specification.language === "node" || specification.language === "typescript") {
        if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(specification.packageName)) {
          return { valid: false, error: "Package name must be a valid lowercase npm package name.", specification };
        }
        const extension = specification.language === "typescript" ? ".ts" : ".js";
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(specification.nodeVersion)
          || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(specification.packageManagerVersion)
          || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(specification.packageVersion)) {
          return { valid: false, error: "Node.js, package manager, and package versions contain unsupported characters.", specification };
        }
        if (!isSafeRelativePath(specification.entryScript) || !specification.entryScript.endsWith(extension)) {
          return { valid: false, error: `Entry script must be a relative ${extension} path.`, specification };
        }
        if (specification.language === "typescript") rootError = validateRelativeRoots(specification, ["sourceFolder", "outputFolder"]);
      } else if (specification.language === "csharp") {
        if (!/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(specification.rootNamespace)) {
          return { valid: false, error: "C# root namespace is invalid.", specification };
        }
        if (!/^[A-Za-z_]\w*$/.test(specification.entryClass)) return { valid: false, error: "C# entry class is invalid.", specification };
        if (!/^[A-Za-z0-9._-]+$/.test(specification.dotnetSdkVersion) || !/^[A-Za-z0-9._-]+$/.test(specification.targetFramework)) {
          return { valid: false, error: ".NET SDK version and target framework contain unsupported characters.", specification };
        }
      }
      if (rootError) return { valid: false, error: rootError, specification };
      return { valid: true, error: "", specification };
    }

    function isFieldVisible(field, values) {
      if (field.when) return Object.entries(field.when).every(([key, value]) => values[key] === value);
      if (field.whenAny) return Object.entries(field.whenAny).every(([key, allowed]) => allowed.includes(values[key]));
      return true;
    }

    function toProjectSettings(specification, generated) {
      return {
        schemaVersion: 1,
        type: "md-editor-project",
        name: specification.projectName,
        language: specification.language,
        projectType: specification.projectType || "application",
        runtime: generated.runtime,
        sourceFolders: generated.sourceFolders,
        testFolders: generated.testFolders,
        entryFile: generated.entryFile,
        options: generated.settings
      };
    }

    const api = { isAbsolutePath, isFieldVisible, isSafeClasspathPath, isSafeRelativePath, joinPath, normalize, normalizePath, splitLines, toProjectSettings, validate };
    app?.registerModule?.("projectSpecification", api);
    return api;
  }

  global.registerMarkdownViewerProjectSpecification = registerMarkdownViewerProjectSpecification;
})(typeof window !== "undefined" ? window : globalThis);
