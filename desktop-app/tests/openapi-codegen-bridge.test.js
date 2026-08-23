const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bridge = require("../resources/bridges/openapi-codegen/openapi-codegen-bridge.cjs");

test("OpenAPI codegen bridge builds safe Swagger Codegen CLI args", () => {
  const args = bridge.buildSwaggerCodegenArgs(
    {
      generatorName: "java",
      additionalProperties: { apiPackage: "io.example.api", hideGenerationTimestamp: "true" }
    },
    {
      jarPath: "C:/app/resources/vendor/swagger-codegen/swagger-codegen-cli.jar",
      specPath: "C:/tmp/openapi.yaml",
      generatedFolder: "C:/tmp/generated"
    }
  );

  assert.deepEqual(args.slice(0, 9), [
    "-jar",
    "C:/app/resources/vendor/swagger-codegen/swagger-codegen-cli.jar",
    "generate",
    "-i",
    "C:/tmp/openapi.yaml",
    "-l",
    "java",
    "-o",
    "C:/tmp/generated"
  ]);
  assert.equal(args[9], "--additional-properties");
  assert.match(args[10], /apiPackage=io\.example\.api/);
  assert.match(args[10], /hideGenerationTimestamp=true/);
});

test("OpenAPI codegen bridge classifies new and overwritten files", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-codegen-test-"));
  const generated = path.join(temp, "generated");
  const output = path.join(temp, "output");
  fs.mkdirSync(path.join(generated, "src"), { recursive: true });
  fs.mkdirSync(path.join(output, "src"), { recursive: true });
  fs.writeFileSync(path.join(generated, "src", "Api.java"), "generated");
  fs.writeFileSync(path.join(generated, "README.md"), "generated");
  fs.writeFileSync(path.join(output, "src", "Api.java"), "existing");

  const files = bridge.collectGeneratedFiles(generated, output);
  assert.deepEqual(files.map((file) => [file.relativePath, file.status]), [
    ["README.md", "new"],
    ["src/Api.java", "overwrite"]
  ]);
});

test("OpenAPI codegen bridge applies staged files after overwrite approval", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-codegen-test-"));
  const generated = path.join(temp, "generated");
  const output = path.join(temp, "output");
  fs.mkdirSync(generated, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(generated, "Api.java"), "generated");
  fs.writeFileSync(path.join(output, "Api.java"), "existing");

  const conflict = bridge.applyGeneratedFiles({ stagingFolder: temp, outputFolder: output, overwrite: false });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "conflict");

  const applied = bridge.applyGeneratedFiles({ stagingFolder: temp, outputFolder: output, overwrite: true });
  assert.equal(applied.ok, true);
  assert.equal(fs.readFileSync(path.join(output, "Api.java"), "utf8"), "generated");
});

test("OpenAPI codegen bridge refuses to overwrite existing project build files", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-codegen-test-"));
  const generated = path.join(temp, "generated");
  const output = path.join(temp, "output");
  fs.mkdirSync(generated, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(generated, "pom.xml"), "generated");
  fs.writeFileSync(path.join(output, "pom.xml"), "existing");

  const applied = bridge.applyGeneratedFiles({ stagingFolder: temp, outputFolder: output, overwrite: true });
  assert.equal(applied.ok, false);
  assert.equal(applied.code, "protected-build-file");
  assert.equal(fs.readFileSync(path.join(output, "pom.xml"), "utf8"), "existing");
});

test("OpenAPI codegen bridge reads staged generated file content", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-codegen-test-"));
  const generated = path.join(temp, "generated", "src");
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(generated, "Api.java"), "class Api {}", "utf8");

  const read = bridge.readGeneratedFile({ stagingFolder: temp, relativePath: "src/Api.java" });
  assert.equal(read.ok, true);
  assert.equal(read.relativePath, "src/Api.java");
  assert.equal(read.content, "class Api {}");
});

test("OpenAPI codegen bridge rejects unsafe staged file reads", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-codegen-test-"));
  fs.mkdirSync(path.join(temp, "generated"), { recursive: true });

  const read = bridge.readGeneratedFile({ stagingFolder: temp, relativePath: "../secret.txt" });
  assert.equal(read.ok, false);
  assert.match(read.error, /Unsafe generated file path/);
});