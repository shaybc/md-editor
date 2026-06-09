const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

test("semantic Java converter resolves local dependencies without string false positives", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-semantic-java-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-semantic-java-output-"));
  try {
    writeJavaFixture(tempRoot);
    const converterJar = path.resolve(
      __dirname,
      "../../desktop-app/extensions/code-converters/semantic-java/semantic-java-converter.jar"
    );

    execFileSync("java", [
      "-jar",
      converterJar,
      "--root",
      tempRoot,
      "--vault",
      outputRoot,
      "--include-methods",
      "--include-signatures",
      "--include-exceptions",
      "--include-package",
    ]);

    const markdown = fs.readFileSync(
      path.join(outputRoot, "src", "main", "java", "app", "service", "Service.java.md"),
      "utf8"
    );
    assert.match(markdown, /entity_type: java_class/);
    assert.match(markdown, /entity_id: app\.service\.Service/);
    assert.match(markdown, /## Package\s+app\.service/);
    assert.match(markdown, /app\/model\/User\.java/);
    assert.match(markdown, /app\/model\/Order\.java/);
    assert.match(markdown, /app\/service\/BaseService\.java/);
    assert.match(markdown, /app\/service\/DomainException\.java/);
    assert.doesNotMatch(markdown, /app\/model\/Invoice\.java/);
    assert.match(markdown, /public Order run\(User input\) throws DomainException/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

function writeJavaFixture(root) {
  const serviceDir = path.join(root, "src", "main", "java", "app", "service");
  const modelDir = path.join(root, "src", "main", "java", "app", "model");
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  fs.writeFileSync(path.join(serviceDir, "Service.java"), [
    "package app.service;",
    "",
    "import app.model.*;",
    "",
    "public class Service extends BaseService {",
    "  private User user;",
    "  private java.util.List<Order> orders;",
    "  private String fake = \"Invoice\";",
    "  // Invoice should not be linked from a comment.",
    "",
    "  public Order run(User input) throws DomainException {",
    "    return new Order(input.name());",
    "  }",
    "}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(serviceDir, "BaseService.java"), "package app.service; public class BaseService {}");
  fs.writeFileSync(
    path.join(serviceDir, "DomainException.java"),
    "package app.service; public class DomainException extends Exception {}"
  );
  fs.writeFileSync(path.join(modelDir, "User.java"), "package app.model; public record User(String name) {}");
  fs.writeFileSync(path.join(modelDir, "Order.java"), "package app.model; public record Order(String name) {}");
  fs.writeFileSync(path.join(modelDir, "Invoice.java"), "package app.model; public class Invoice {}");
}
