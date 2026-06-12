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

    const converterPath = path.resolve(__dirname, "../../code_converter/dependency-md-generator.js");
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
    assert.match(markdown, /entity_type: csharp_class/);
    assert.match(markdown, /entity_id: App\.Program/);
    assert.match(markdown, /## Package\s+App/);
    assert.match(markdown, /App\/Service\.cs/);
    assert.match(markdown, /Lib\/Helper\.cs/);
    assert.match(markdown, /### Run/);
    assert.match(markdown, /public int Run\(Service service\)/);
    assert.match(markdown, /### Name/);
    assert.match(markdown, /Type: accessor/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
