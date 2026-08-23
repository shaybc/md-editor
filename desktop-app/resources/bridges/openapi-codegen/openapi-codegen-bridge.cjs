#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PROTECTED_BUILD_FILE_NAMES = new Set([
  "pom.xml",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties"
]);

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function serializeAdditionalProperties(properties = {}) {
  return Object.entries(properties)
    .filter(([key]) => key)
    .map(([key, value]) => `${key}=${String(value ?? "")}`)
    .join(",");
}

function resolveSwaggerCodegenJar(appRoot) {
  const root = appRoot ? path.resolve(appRoot) : path.resolve(__dirname, "..", "..", "..");
  return path.join(root, "resources", "vendor", "swagger-codegen", "swagger-codegen-cli.jar");
}

function buildSwaggerCodegenArgs(request, paths) {
  const args = [
    "-jar",
    paths.jarPath,
    "generate",
    "-i",
    paths.specPath,
    "-l",
    request.generatorName,
    "-o",
    paths.generatedFolder
  ];
  const additionalProperties = serializeAdditionalProperties(request.additionalProperties || {});
  if (additionalProperties) args.push("--additional-properties", additionalProperties);
  if (request.templateDir) args.push("-t", path.resolve(request.templateDir));
  return args;
}

function isPathInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  return candidate === parent || candidate.startsWith(parent + path.sep);
}

function collectGeneratedFiles(generatedFolder, outputFolder) {
  const files = [];
  function visit(folder) {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        const relativePath = normalizePath(path.relative(generatedFolder, fullPath));
        const destinationPath = path.join(outputFolder, relativePath);
        files.push({
          relativePath,
          path: normalizePath(fullPath),
          size: fs.statSync(fullPath).size,
          status: fs.existsSync(destinationPath) ? "overwrite" : "new"
        });
      }
    }
  }
  visit(generatedFolder);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function isProtectedBuildFile(relativePath) {
  const fileName = path.basename(relativePath || "").toLowerCase();
  return PROTECTED_BUILD_FILE_NAMES.has(fileName) || fileName.endsWith(".csproj");
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      resolve({ ok: false, stdout, stderr, exitCode: null, error: error.message });
    });
    child.on("close", (exitCode) => {
      resolve({ ok: exitCode === 0, stdout, stderr, exitCode });
    });
  });
}

async function generateCode(request) {
  const javaExecutable = request.javaExecutable || "java";
  const jarPath = resolveSwaggerCodegenJar(request.appRoot);
  if (!fs.existsSync(jarPath)) {
    return {
      ok: false,
      code: "missing-jar",
      exitCode: null,
      error: `Missing Swagger Codegen CLI JAR: ${jarPath}`,
      stdout: "",
      stderr: ""
    };
  }
  if (!request.generatorName) return { ok: false, code: "missing-generator", error: "Choose a Swagger Codegen generator.", stdout: "", stderr: "", exitCode: null };
  if (!request.outputFolder) return { ok: false, code: "missing-output", error: "Choose an output folder.", stdout: "", stderr: "", exitCode: null };

  const stagingFolder = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-openapi-codegen-"));
  const specPath = path.join(stagingFolder, request.specFileName || "openapi.yaml");
  const generatedFolder = path.join(stagingFolder, "generated");
  fs.writeFileSync(specPath, String(request.specText || ""), "utf8");
  fs.mkdirSync(generatedFolder, { recursive: true });
  const args = buildSwaggerCodegenArgs(request, { jarPath, specPath, generatedFolder });
  const result = await runProcess(javaExecutable, args, request.workspaceRoot || process.cwd());
  const files = collectGeneratedFiles(generatedFolder, request.outputFolder);
  return Object.assign({}, result, {
    stagingFolder: normalizePath(stagingFolder),
    files
  });
}

function copyFileSafe(sourceRoot, outputRoot, file, overwrite) {
  const sourcePath = path.join(sourceRoot, file.relativePath);
  const destinationPath = path.join(outputRoot, file.relativePath);
  if (!isPathInside(sourceRoot, sourcePath) || !isPathInside(outputRoot, destinationPath)) {
    throw new Error(`Unsafe generated file path: ${file.relativePath}`);
  }
  if (fs.existsSync(destinationPath) && !overwrite) throw new Error(`File already exists: ${destinationPath}`);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function applyGeneratedFiles(request) {
  const stagingFolder = path.resolve(request.stagingFolder || "");
  const generatedFolder = path.join(stagingFolder, "generated");
  const outputFolder = path.resolve(request.outputFolder || "");
  if (!fs.existsSync(generatedFolder)) return { ok: false, error: `Missing staging output: ${generatedFolder}` };
  if (!outputFolder) return { ok: false, error: "Missing output folder." };
  const files = collectGeneratedFiles(generatedFolder, outputFolder);
  const conflicts = files.filter((file) => file.status === "overwrite");
  const protectedConflicts = conflicts.filter((file) => isProtectedBuildFile(file.relativePath));
  if (protectedConflicts.length) {
    return {
      ok: false,
      code: "protected-build-file",
      error: "OpenAPI code generation will not overwrite existing project build files in v1.",
      protectedFiles: protectedConflicts
    };
  }
  if (conflicts.length && !request.overwrite) {
    return { ok: false, code: "conflict", conflicts };
  }
  files.forEach((file) => copyFileSafe(generatedFolder, outputFolder, file, request.overwrite === true));
  return { ok: true, files, outputFolder: normalizePath(outputFolder) };
}

function readGeneratedFile(request) {
  const stagingFolder = path.resolve(request.stagingFolder || "");
  const generatedFolder = path.join(stagingFolder, "generated");
  const relativePath = normalizePath(request.relativePath || "");
  const sourcePath = path.join(generatedFolder, relativePath);
  if (!fs.existsSync(generatedFolder)) return { ok: false, error: `Missing staging output: ${generatedFolder}` };
  if (!relativePath) return { ok: false, error: "Missing generated file path." };
  if (!isPathInside(generatedFolder, sourcePath)) return { ok: false, error: `Unsafe generated file path: ${relativePath}` };
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) return { ok: false, error: `Generated file was not found: ${relativePath}` };
  const content = fs.readFileSync(sourcePath, "utf8");
  return {
    ok: true,
    relativePath,
    path: normalizePath(sourcePath),
    size: Buffer.byteLength(content, "utf8"),
    content
  };
}
function readRequest(argv) {
  const requestFileIndex = argv.indexOf("--request-file");
  if (requestFileIndex >= 0 && argv[requestFileIndex + 1]) {
    return JSON.parse(fs.readFileSync(argv[requestFileIndex + 1], "utf8"));
  }
  return JSON.parse(argv[2] || "{}");
}

async function main() {
  try {
    const request = readRequest(process.argv);
    let result;
    if (request.action === "apply") result = applyGeneratedFiles(request);
    else if (request.action === "read") result = readGeneratedFile(request);
    else result = await generateCode(request);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error || "Unknown error") }) + "\n");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  serializeAdditionalProperties,
  resolveSwaggerCodegenJar,
  buildSwaggerCodegenArgs,
  collectGeneratedFiles,
  isProtectedBuildFile,
  readGeneratedFile,
  applyGeneratedFiles,
  generateCode
};
