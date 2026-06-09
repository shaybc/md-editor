const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KNOWN_FLAGS,
  getConverterExtensionsRoot,
  validateConverterManifest,
} = require("../js/code-converter/registry.js");

test("converter registry validates and normalizes a manifest", () => {
  const result = validateConverterManifest({
    id: "semantic-java",
    name: "Semantic Java Converter",
    version: "1.0.0",
    description: "Compiler-aware Java converter.",
    supportedLanguages: ["Java"],
    command: "java",
    args: ["-jar", "semantic-java-converter.jar"],
    supportedFlags: ["--include-methods", "--include-package", "--unknown"],
  }, "C:/app/extensions/code-converters/semantic-java");

  assert.equal(result.valid, true);
  assert.equal(result.converter.id, "semantic-java");
  assert.deepEqual(result.converter.supportedLanguages, ["Java"]);
  assert.deepEqual(result.converter.args, ["-jar", "semantic-java-converter.jar"]);
  assert.deepEqual(result.converter.supportedFlags, ["--include-methods", "--include-package"]);
  assert.equal(result.converter.manifestDir, "C:/app/extensions/code-converters/semantic-java");
});

test("converter registry defaults missing args and supportedFlags", () => {
  const result = validateConverterManifest({
    id: "semantic-java",
    name: "Semantic Java Converter",
    supportedLanguages: ["Java"],
    command: "semantic-java.exe",
  }, "C:/app/extensions/code-converters/semantic-java");

  assert.equal(result.valid, true);
  assert.deepEqual(result.converter.args, []);
  assert.deepEqual(result.converter.supportedFlags, KNOWN_FLAGS);
});

test("converter registry rejects invalid manifests", () => {
  assert.equal(validateConverterManifest({}, "C:/converter").valid, false);
  assert.equal(validateConverterManifest({
    id: "bad",
    name: "Bad",
    supportedLanguages: ["Java"],
    command: "bad.exe",
    args: ["--root"],
  }, "C:/converter").valid, false);
});

test("converter registry treats explicit supportedFlags as authoritative", () => {
  const result = validateConverterManifest({
    id: "minimal",
    name: "Minimal Converter",
    supportedLanguages: ["Java"],
    command: "minimal.exe",
    supportedFlags: ["--not-a-known-flag"],
  }, "C:/converter");

  assert.equal(result.valid, true);
  assert.deepEqual(result.converter.supportedFlags, []);
});

test("converter registry resolves the app extension root", () => {
  assert.equal(
    getConverterExtensionsRoot("C:\\Apps\\MD-Editor\\"),
    "C:/Apps/MD-Editor/extensions/code-converters"
  );
});
