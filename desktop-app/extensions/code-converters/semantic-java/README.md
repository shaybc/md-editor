# Semantic Java Converter

Semantic Java Converter is an MD-Editor converter extension for Java source folders.

It is invoked by MD-Editor with:

```text
java -jar semantic-java-converter.jar --root <source-folder> --vault <destination-folder> [flags]
```

The converter uses JavaParser Symbol Solver to resolve Java type usages and emits Markdown links only for local source types found under `--root`.

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
