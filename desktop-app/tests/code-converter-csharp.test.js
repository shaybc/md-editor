const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

test("code converter generates C# dependency markdown", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-csharp-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-csharp-output-"));
  try {
    const appDir = path.join(tempRoot, "App");
    const libDir = path.join(tempRoot, "Lib");
    fs.mkdirSync(appDir);
    fs.mkdirSync(libDir);

    fs.writeFileSync(path.join(appDir, "Program.cs"), [
      "using Lib;",
      "using HelperAlias = Lib.Helper;",
      "",
      "namespace App;",
      "",
      "public class Program",
      "{",
      "    public string Name { get; init; }",
      "",
      "    public int Run(Service service)",
      "    {",
      "        var helper = new HelperAlias();",
      "        return service.Count() + helper.Value();",
      "    }",
      "}",
      "",
    ].join("\n"));

    fs.writeFileSync(path.join(appDir, "Service.cs"), [
      "namespace App;",
      "",
      "public class Service",
      "{",
      "    public int Count()",
      "    {",
      "        return 1;",
      "    }",
      "}",
      "",
    ].join("\n"));

    fs.writeFileSync(path.join(libDir, "Helper.cs"), [
      "namespace Lib;",
      "",
      "public class Helper",
      "{",
      "    public int Value()",
      "    {",
      "        return 2;",
      "    }",
      "}",
      "",
    ].join("\n"));

    const converterPath = path.resolve(__dirname, "../converters/code_converter/dependency-md-generator.js");
    execFileSync(process.execPath, [
      converterPath,
      tempRoot,
      outputRoot,
      "--include-methods",
      "--include-accessors",
      "--include-signatures",
      "--include-return-codes",
      "--include-package",
    ]);

    const markdown = fs.readFileSync(path.join(outputRoot, "App", "Program.cs.md"), "utf8");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputRoot, ".md-editor", "_md_editor_project.json"), "utf8"));
    assert.equal(metadata.sourceRootPath, tempRoot.split(path.sep).join("/"));
    assert.equal(fs.existsSync(path.join(outputRoot, "_md_editor_project.json")), false);
    assert.match(markdown, /entity_type: csharp_class/);
    assert.match(markdown, /entity_id: App\.Program/);
    assert.match(markdown, /source_file: App\/Program\.cs/);
    assert.match(markdown, /## Package\s+App/);
    assert.match(markdown, /App\/Service\.cs/);
    assert.match(markdown, /Lib\/Helper\.cs/);
    assert.match(markdown, /\[Service\.cs\]\(Service\.cs\.md\) \(App\/Service\.cs\)/);
    assert.match(markdown, /\[Helper\.cs\]\(\.\.\/Lib\/Helper\.cs\.md\) \(Lib\/Helper\.cs\)/);
    assert.match(markdown, /### Run/);
    assert.match(markdown, /public int Run\(Service service\)/);
    assert.match(markdown, /### Name/);
    assert.match(markdown, /Type: accessor/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("code converter ignores workspace tooling directories", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-ignore-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-ignore-output-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, ".github", "workflows"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, ".mvn", "wrapper"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, ".vscode"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, ".idea"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "src", "Main.java"), "package app; public class Main {}\n");
    fs.writeFileSync(path.join(tempRoot, ".github", "workflows", "Fake.java"), "package ignored; public class Fake {}\n");
    fs.writeFileSync(path.join(tempRoot, ".mvn", "wrapper", "Fake.java"), "package ignored; public class Fake {}\n");
    fs.writeFileSync(path.join(tempRoot, ".vscode", "Fake.java"), "package ignored; public class Fake {}\n");
    fs.writeFileSync(path.join(tempRoot, ".idea", "Fake.java"), "package ignored; public class Fake {}\n");

    const converterPath = path.resolve(__dirname, "../converters/code_converter/dependency-md-generator.js");
    execFileSync(process.execPath, [converterPath, tempRoot, outputRoot]);

    assert.equal(fs.existsSync(path.join(outputRoot, "src", "Main.java.md")), true);
    assert.equal(fs.existsSync(path.join(outputRoot, ".github", "workflows", "Fake.java.md")), false);
    assert.equal(fs.existsSync(path.join(outputRoot, ".mvn", "wrapper", "Fake.java.md")), false);
    assert.equal(fs.existsSync(path.join(outputRoot, ".vscode", "Fake.java.md")), false);
    assert.equal(fs.existsSync(path.join(outputRoot, ".idea", "Fake.java.md")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("code converter omits documentation comments by default", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-comments-default-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-comments-default-output-"));
  try {
    fs.writeFileSync(path.join(tempRoot, "Service.cs"), [
      "namespace App;",
      "",
      "/// <summary>Service class docs.</summary>",
      "public class Service",
      "{",
      "    /// <summary>Counts items.</summary>",
      "    public int Count()",
      "    {",
      "        return 1;",
      "    }",
      "}",
      "",
    ].join("\n"));

    const converterPath = path.resolve(__dirname, "../converters/code_converter/dependency-md-generator.js");
    execFileSync(process.execPath, [
      converterPath,
      tempRoot,
      outputRoot,
      "--include-methods",
      "--include-signatures",
    ]);

    const markdown = fs.readFileSync(path.join(outputRoot, "Service.cs.md"), "utf8");
    assert.doesNotMatch(markdown, /## Documentation/);
    assert.doesNotMatch(markdown, /Service class docs/);
    assert.doesNotMatch(markdown, /Counts items/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("code converter exports cleaned comments and docstrings when requested", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-comments-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-comments-output-"));
  try {
    fs.writeFileSync(path.join(tempRoot, "Service.cs"), [
      "namespace App;",
      "",
      "/// <summary>",
      "/// Service class docs.",
      "/// </summary>",
      "public class Service",
      "{",
      "    /// <summary>Counts items.</summary>",
      "    public int Count()",
      "    {",
      "        return 1;",
      "    }",
      "}",
      "",
    ].join("\n"));

    fs.writeFileSync(path.join(tempRoot, "widget.js"), [
      "/** Widget class docs. */",
      "export class Widget {",
      "  /** Runs the widget. */",
      "  run() {",
      "    return true;",
      "  }",
      "}",
      "",
    ].join("\n"));

    fs.writeFileSync(path.join(tempRoot, "worker.py"), [
      "class Worker:",
      "    \"\"\"Worker class docs.\"\"\"",
      "",
      "    def run(self):",
      "        \"\"\"Runs the worker.\"\"\"",
      "        return True",
      "",
    ].join("\n"));

    fs.writeFileSync(path.join(tempRoot, "Helper.java"), [
      "package app;",
      "",
      "/** Helper class docs. */",
      "public class Helper {",
      "    /**",
      "     * Returns the helper value.",
      "     *",
      "     *     Preserves indentation.",
      "     */",
      "    @VisibleForTesting",
      "    public int value() {",
      "        return 1;",
      "    }",
      "",
      "    /** Parse program arguments in jar run or plan request. */",
      "    private static <R extends JarRequestBody, M extends MessageParameters>",
      "            List<String> getProgramArgs(HandlerRequest<R> request, Logger log)",
      "            throws RestHandlerException {",
      "        return Collections.emptyList();",
      "    }",
      "}",
      "",
    ].join("\n"));

    const converterPath = path.resolve(__dirname, "../converters/code_converter/dependency-md-generator.js");
    execFileSync(process.execPath, [
      converterPath,
      tempRoot,
      outputRoot,
      "--include-methods",
      "--include-signatures",
      "--include-comments",
    ]);

    const csharpMarkdown = fs.readFileSync(path.join(outputRoot, "Service.cs.md"), "utf8");
    assert.doesNotMatch(csharpMarkdown, /## Documentation/);
    assert.match(csharpMarkdown, /### Class: Service[\s\S]*Documentation:\s+```\nService class docs\.\n```/);
    assert.match(csharpMarkdown, /### Count[\s\S]*Documentation:\s+```\nCounts items\.\n```/);
    assert.doesNotMatch(csharpMarkdown, /<summary>/);
    assert.doesNotMatch(csharpMarkdown, /\/\/\//);

    const jsMarkdown = fs.readFileSync(path.join(outputRoot, "widget.js.md"), "utf8");
    assert.doesNotMatch(jsMarkdown, /## Documentation/);
    assert.match(jsMarkdown, /### Class: Widget[\s\S]*Documentation:\s+```\nWidget class docs\.\n```/);
    assert.match(jsMarkdown, /### run[\s\S]*Documentation:\s+```\nRuns the widget\.\n```/);

    const pythonMarkdown = fs.readFileSync(path.join(outputRoot, "worker.py.md"), "utf8");
    assert.doesNotMatch(pythonMarkdown, /## Documentation/);
    assert.match(pythonMarkdown, /### Class: Worker[\s\S]*Documentation:\s+```\nWorker class docs\.\n```/);
    assert.match(pythonMarkdown, /### run[\s\S]*Documentation:\s+```\nRuns the worker\.\n```/);

    const javaMarkdown = fs.readFileSync(path.join(outputRoot, "Helper.java.md"), "utf8");
    assert.doesNotMatch(javaMarkdown, /## Documentation/);
    assert.match(javaMarkdown, /### Class: Helper[\s\S]*Documentation:\s+```\nHelper class docs\.\n```/);
    assert.match(javaMarkdown, /### value[\s\S]*Documentation:\s+```\nReturns the helper value\.\n\n    Preserves indentation\.\n```/);
    assert.match(javaMarkdown, /### getProgramArgs[\s\S]*Documentation:\s+```\nParse program arguments in jar run or plan request\.\n```/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("code converter writes canonical mixed missing dependencies report", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-mixed-source-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdviewer-mixed-output-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "java", "lib"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "cs"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "web"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "py"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "java", "Main.java"), [
      "package app;",
      "import missing.Client;",
      "import java.util.List;",
      "public class Main { Client client; List<String> names; }",
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(tempRoot, "java", "lib", "demo.jar"), "not-a-real-jar");
    fs.writeFileSync(path.join(tempRoot, "java", "pom.xml"), [
      "<project><dependencies>",
      "<dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId><version>2.0.0</version></dependency>",
      "</dependencies></project>",
    ].join("\n"));

    fs.writeFileSync(path.join(tempRoot, "cs", "App.cs"), [
      "using System;",
      "using Missing.Namespace;",
      "namespace Demo;",
      "public class App {}",
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(tempRoot, "cs", "Demo.csproj"), [
      "<Project><ItemGroup>",
      "<PackageReference Include=\"Newtonsoft.Json\" Version=\"13.0.3\" />",
      "</ItemGroup></Project>",
    ].join("\n"));
    fs.writeFileSync(path.join(tempRoot, "cs", "Vendor.dll"), "dll");

    fs.writeFileSync(path.join(tempRoot, "web", "app.js"), [
      "import express from 'express';",
      "import missingPackage from 'missing-package';",
      "const fs = require('fs');",
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(tempRoot, "web", "package.json"), JSON.stringify({
      dependencies: { express: "^4.18.0" }
    }, null, 2));

    fs.writeFileSync(path.join(tempRoot, "py", "worker.py"), [
      "import requests",
      "import missing_python",
      "import os",
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(tempRoot, "py", "requirements.txt"), "requests==2.31.0\n");

    const converterPath = path.resolve(__dirname, "../converters/code_converter/dependency-md-generator.js");
    execFileSync(process.execPath, [converterPath, tempRoot, outputRoot]);

    const reportPath = path.join(outputRoot, ".md-editor", "missing_dependencies_report.json");
    assert.ok(fs.existsSync(reportPath));
    assert.ok(fs.existsSync(path.join(outputRoot, ".md-editor", "missing_dependencies_report.md")));
    assert.equal(fs.existsSync(path.join(outputRoot, "missing_dependencies_report.json")), false);
    assert.equal(fs.existsSync(path.join(outputRoot, "missing_dependencies_report.md")), false);
    assert.equal(fs.existsSync(path.join(outputRoot, "_converter_report.json")), false);

    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.generator, "builtin_converter");
    assert.equal(report.language, "mixed");
    assert.ok(report.counts.discoveredExternalDependencies >= 5);
    assert.ok(report.externalDependencies.some((dependency) => dependency.kind === "jar" && dependency.language === "java"));
    assert.ok(report.externalDependencies.some((dependency) => dependency.kind === "nuget" && dependency.name === "Newtonsoft.Json"));
    assert.ok(report.externalDependencies.some((dependency) => dependency.kind === "dll" && dependency.name === "Vendor"));
    assert.ok(report.externalDependencies.some((dependency) => dependency.kind === "npm" && dependency.name === "express"));
    assert.ok(report.externalDependencies.some((dependency) => dependency.kind === "python-package" && dependency.name === "requests"));

    const symbols = report.sources.flatMap((source) => source.unresolvedDependencies.map((dependency) => `${dependency.language}:${dependency.symbol}`));
    assert.ok(symbols.includes("java:missing.Client"));
    assert.ok(symbols.includes("csharp:Missing.Namespace"));
    assert.ok(symbols.includes("javascript:missing-package"));
    assert.ok(symbols.includes("python:missing_python"));
    assert.equal(symbols.includes("javascript:express"), false);
    assert.equal(symbols.includes("python:requests"), false);

    const javaMarkdown = fs.readFileSync(path.join(outputRoot, "java", "Main.java.md"), "utf8");
    assert.match(javaMarkdown, /language: java/);
    assert.match(javaMarkdown, /`missing\.Client` \(missing class, language java, line 2\)/);

    const libFiles = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else libFiles.push(fullPath);
      }
    }
    walk(path.join(outputRoot, "lib"));
    assert.ok(libFiles.some((file) => fs.readFileSync(file, "utf8").includes("entity_type: external_dependency")));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
