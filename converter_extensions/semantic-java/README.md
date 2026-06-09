# Semantic Java Converter

Semantic Java Converter is an MD-Editor converter extension for Java source folders.

It is invoked by MD-Editor with:

```text
java -jar semantic-java-converter.jar --root <source-folder> --vault <destination-folder> [flags]
```

The converter uses JavaParser Symbol Solver to resolve Java type usages and emits Markdown links only for local source types found under `--root`.

When JavaParser cannot resolve type names, the converter reports the unique unresolved type count and writes `_semantic-java-unresolved-types.md` into `--vault`. The report lists unique package names and unique type names without duplicate references.

Supported flags:

```text
--include-methods
--include-accessors
--include-signatures
--include-return-codes
--include-exceptions
--include-package
```

Java must be available on `PATH`.
