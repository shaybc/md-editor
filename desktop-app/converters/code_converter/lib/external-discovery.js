const fs = require("fs");
const path = require("path");
const {
  IGNORED_DIRS,
  REPORT_JSON_FILE,
  REPORT_MARKDOWN_FILE,
} = require("./constants");
const {
  getPortableSourcePath,
  safePathSegment,
  sha256File,
  stableId,
  toMarkdownPath,
  yamlScalar,
} = require("./utils");

function walkFiles(root, predicate) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      const file = path.join(dir, entry.name);
      if (entry.isFile() && predicate(file, entry.name)) files.push(file);
    }
  }
  walk(root);
  return files;
}

function parseJsonFile(file, warnings) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    warnings.push(`Could not parse JSON dependency metadata: ${file} (${error.message})`);
    return null;
  }
}

function getExternalMarkdownFile(destinationRoot, dependency) {
  const language = safePathSegment(dependency.language || "mixed");
  const kind = safePathSegment(dependency.kind || "dependency");
  const name = safePathSegment(dependency.name || dependency.id);
  const suffix = dependency.version ? `-${safePathSegment(dependency.version)}` : "";
  return path.join(destinationRoot, "lib", language, kind, `${name}${suffix}.md`);
}

function createDependency(kind, language, name, options = {}) {
  const id = options.id || stableId(["external", language, kind, name, options.version || options.path || options.source]);
  return {
    id,
    kind,
    language,
    name,
    version: options.version || "",
    path: options.path || "",
    source: options.source || "",
    markdownFile: "",
    metadata: options.metadata || {},
  };
}

function addDependency(map, dependency) {
  if (!dependency.name) return;
  const key = dependency.id || stableId([dependency.language, dependency.kind, dependency.name, dependency.version, dependency.path]);
  if (!map.has(key)) map.set(key, { ...dependency, id: key });
}

function discoverJava(root, sourceRootHome, warnings) {
  const deps = new Map();
  walkFiles(root, (file, name) => name.endsWith(".jar")).forEach((jar) => {
    addDependency(deps, createDependency("jar", "java", path.basename(jar), {
      path: jar,
      source: getPortableSourcePath(sourceRootHome, jar),
      metadata: { discovery: "local-jar" },
    }));
  });

  walkFiles(root, (_file, name) => name === "pom.xml").forEach((pom) => {
    const xml = fs.readFileSync(pom, "utf8");
    for (const match of xml.matchAll(/<dependency>[\s\S]*?<groupId>\s*([^<]+)\s*<\/groupId>[\s\S]*?<artifactId>\s*([^<]+)\s*<\/artifactId>[\s\S]*?(?:<version>\s*([^<]+)\s*<\/version>)?[\s\S]*?<\/dependency>/g)) {
      const groupId = match[1].trim();
      const artifactId = match[2].trim();
      addDependency(deps, createDependency("jar", "java", `${groupId}:${artifactId}`, {
        version: (match[3] || "").trim(),
        source: getPortableSourcePath(sourceRootHome, pom),
        metadata: { groupId, artifactId, discovery: "pom.xml" },
      }));
    }
  });

  walkFiles(root, (_file, name) => name === ".classpath").forEach((classpathFile) => {
    const xml = fs.readFileSync(classpathFile, "utf8");
    for (const match of xml.matchAll(/<classpathentry\b[^>]*kind=["']lib["'][^>]*path=["']([^"']+)["'][^>]*>/g)) {
      const entryPath = match[1].trim();
      addDependency(deps, createDependency("jar", "java", path.basename(entryPath), {
        path: entryPath,
        source: getPortableSourcePath(sourceRootHome, classpathFile),
        metadata: { discovery: ".classpath" },
      }));
    }
  });

  walkFiles(root, (_file, name) => name === "build.gradle" || name === "build.gradle.kts").forEach((gradleFile) => {
    const text = fs.readFileSync(gradleFile, "utf8");
    for (const match of text.matchAll(/['"]([\w.-]+):([\w.-]+):([^'"]+)['"]/g)) {
      addDependency(deps, createDependency("jar", "java", `${match[1]}:${match[2]}`, {
        version: match[3],
        source: getPortableSourcePath(sourceRootHome, gradleFile),
        metadata: { groupId: match[1], artifactId: match[2], discovery: path.basename(gradleFile) },
      }));
    }
  });

  return Array.from(deps.values());
}

function discoverDotnet(root, sourceRootHome, warnings) {
  const deps = new Map();
  walkFiles(root, (_file, name) => /\.(csproj|fsproj|vbproj)$/i.test(name)).forEach((projectFile) => {
    const xml = fs.readFileSync(projectFile, "utf8");
    for (const match of xml.matchAll(/<PackageReference\b[^>]*Include=["']([^"']+)["'][^>]*(?:Version=["']([^"']+)["'])?[^>]*\/?>/g)) {
      addDependency(deps, createDependency("nuget", "csharp", match[1], {
        version: match[2] || "",
        source: getPortableSourcePath(sourceRootHome, projectFile),
        metadata: { discovery: path.extname(projectFile).slice(1) },
      }));
    }
  });

  walkFiles(root, (_file, name) => name === "packages.config").forEach((packagesFile) => {
    const xml = fs.readFileSync(packagesFile, "utf8");
    for (const match of xml.matchAll(/<package\b[^>]*id=["']([^"']+)["'][^>]*(?:version=["']([^"']+)["'])?[^>]*>/g)) {
      addDependency(deps, createDependency("nuget", "csharp", match[1], {
        version: match[2] || "",
        source: getPortableSourcePath(sourceRootHome, packagesFile),
        metadata: { discovery: "packages.config" },
      }));
    }
  });

  walkFiles(root, (_file, name) => name === "project.assets.json" || name.endsWith(".deps.json")).forEach((jsonFile) => {
    const data = parseJsonFile(jsonFile, warnings);
    const libraries = data?.libraries || {};
    Object.keys(libraries).forEach((key) => {
      const [name, version = ""] = key.split("/");
      if (name) {
        addDependency(deps, createDependency("nuget", "csharp", name, {
          version,
          source: getPortableSourcePath(sourceRootHome, jsonFile),
          metadata: { discovery: path.basename(jsonFile) },
        }));
      }
    });
  });

  walkFiles(root, (_file, name) => name.toLowerCase().endsWith(".dll")).forEach((dll) => {
    addDependency(deps, createDependency("dll", "csharp", path.basename(dll, ".dll"), {
      path: dll,
      source: getPortableSourcePath(sourceRootHome, dll),
      metadata: { discovery: "local-dll" },
    }));
  });
  return Array.from(deps.values());
}

function discoverNode(root, sourceRootHome, warnings) {
  const deps = new Map();
  walkFiles(root, (_file, name) => name === "package.json").forEach((packageFile) => {
    const data = parseJsonFile(packageFile, warnings);
    if (!data) return;
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((field) => {
      Object.entries(data[field] || {}).forEach(([name, version]) => {
        addDependency(deps, createDependency("npm", "javascript", name, {
          version: String(version || ""),
          source: getPortableSourcePath(sourceRootHome, packageFile),
          metadata: { discovery: "package.json", dependencyType: field },
        }));
      });
    });
  });
  return Array.from(deps.values());
}

function normalizePythonRequirement(line) {
  const cleaned = String(line || "").replace(/\s+#.*$/, "").trim();
  if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("-")) return null;
  const match = cleaned.match(/^([A-Za-z0-9_.-]+)\s*([<>=!~].*)?$/);
  return match ? { name: match[1], version: (match[2] || "").trim() } : null;
}

function discoverPython(root, sourceRootHome) {
  const deps = new Map();
  walkFiles(root, (_file, name) => /^requirements.*\.txt$/i.test(name)).forEach((requirementsFile) => {
    fs.readFileSync(requirementsFile, "utf8").split(/\r?\n/).forEach((line) => {
      const req = normalizePythonRequirement(line);
      if (!req) return;
      addDependency(deps, createDependency("python-package", "python", req.name, {
        version: req.version,
        source: getPortableSourcePath(sourceRootHome, requirementsFile),
        metadata: { discovery: path.basename(requirementsFile) },
      }));
    });
  });

  walkFiles(root, (_file, name) => ["pyproject.toml", "Pipfile", "setup.cfg", "setup.py", "poetry.lock"].includes(name)).forEach((metadataFile) => {
    const text = fs.readFileSync(metadataFile, "utf8");
    for (const match of text.matchAll(/["']?([A-Za-z0-9_.-]+)["']?\s*(?:=|==|>=|<=|~=)\s*["']?([A-Za-z0-9*_.!+-]+)?/g)) {
      const name = match[1];
      if (/^(python|version|requires-python|dependencies)$/i.test(name)) continue;
      addDependency(deps, createDependency("python-package", "python", name, {
        version: match[2] || "",
        source: getPortableSourcePath(sourceRootHome, metadataFile),
        metadata: { discovery: path.basename(metadataFile) },
      }));
    }
  });

  walkFiles(root, (_file, name) => /\.(whl|egg)$/i.test(name)).forEach((distFile) => {
    const base = path.basename(distFile).replace(/\.(whl|egg)$/i, "");
    const [name, version = ""] = base.split("-");
    addDependency(deps, createDependency("python-package", "python", name, {
      version,
      path: distFile,
      source: getPortableSourcePath(sourceRootHome, distFile),
      metadata: { discovery: "local-distribution" },
    }));
  });
  return Array.from(deps.values());
}

function writeExternalDependencyMarkdown(destinationRoot, sourceRootHome, dependency) {
  const outputFile = getExternalMarkdownFile(destinationRoot, dependency);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const sourceHash = dependency.path && fs.existsSync(dependency.path) && fs.statSync(dependency.path).isFile()
    ? sha256File(dependency.path)
    : "";
  const lines = [
    "---",
    "entity_type: external_dependency",
    `entity_id: ${yamlScalar(dependency.id)}`,
    `dependency_kind: ${yamlScalar(dependency.kind)}`,
    `language: ${yamlScalar(dependency.language)}`,
    "conversion_status: not_started",
    "shared: false",
    `source_file: ${yamlScalar(dependency.source || dependency.path)}`,
    `source_hash: ${yamlScalar(sourceHash)}`,
    "tags:",
    "  - external-dependency",
    "---",
    "",
    `# ${dependency.name}`,
    "",
    `Type: ${dependency.kind}`,
    "",
  ];
  if (dependency.version) lines.push(`Version: \`${dependency.version}\``, "");
  if (dependency.path) lines.push(`Source file: \`${dependency.path}\``, "");
  if (dependency.source) lines.push(`Discovered from: \`${dependency.source}\``, "");
  lines.push("## Metadata", "");
  const metadataEntries = Object.entries(dependency.metadata || {});
  if (!metadataEntries.length) lines.push("None.");
  else metadataEntries.forEach(([key, value]) => lines.push(`- ${key}: ${value}`));
  fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
  return outputFile;
}

function discoverExternalDependencies(sourceRoot, destinationRoot, sourceRootHome, warnings = []) {
  const dependencies = [
    ...discoverJava(sourceRoot, sourceRootHome, warnings),
    ...discoverDotnet(sourceRoot, sourceRootHome, warnings),
    ...discoverNode(sourceRoot, sourceRootHome, warnings),
    ...discoverPython(sourceRoot, sourceRootHome, warnings),
  ];
  dependencies.forEach((dependency) => {
    dependency.markdownFile = writeExternalDependencyMarkdown(destinationRoot, sourceRootHome, dependency);
  });
  return dependencies
    .filter((dependency) => ![REPORT_JSON_FILE, REPORT_MARKDOWN_FILE].includes(path.basename(dependency.markdownFile || "")))
    .sort((a, b) => `${a.language}:${a.kind}:${a.name}`.localeCompare(`${b.language}:${b.kind}:${b.name}`));
}

function createExternalDependencyIndex(dependencies) {
  const byLanguage = new Map();
  dependencies.forEach((dependency) => {
    const language = dependency.language || "unknown";
    if (!byLanguage.has(language)) byLanguage.set(language, []);
    byLanguage.get(language).push(dependency);
  });
  return { dependencies, byLanguage };
}

module.exports = {
  discoverExternalDependencies,
  createExternalDependencyIndex,
  getExternalMarkdownFile,
};
