---
tags: []
---
# java_converter

Standalone Java dependency-to-Markdown converter for MD-Editor.

Build:

```bash
mvn package
```

Run:

```bash
java -jar target/java_converter.jar --root "C:\code\src" --vault "C:\docs\project-map"
```

Useful switches:

```text
--include-methods
--include-accessors
--include-signatures
--include-return-codes
--include-exceptions
--include-package
--batch-size <count>
--javac-error-isolation <batch-parse-only|bisect>
--gradle-adaptive-analysis[=true|false]
```

The converter uses the Java compiler API for symbol attribution. It resolves same-package references, wildcard imports, static imports, nested classes, annotations, generics, inheritance, thrown exceptions, and external classpath entries, then emits Markdown dependency links only for local source files.

By default, `--javac-error-isolation batch-parse-only` keeps large conversions bounded: when javac throws an internal compiler error during attribution, the failed batch and the remaining batches in that compile unit are emitted from parse-only AST data. Use `--javac-error-isolation bisect` when you prefer slower, more precise isolation of the individual files that trigger javac internals.

When Gradle metadata is available, `--gradle-adaptive-analysis=true` parses each Gradle compile unit first and runs javac attribution only for files with ambiguous or inferred symbol use. Use `--gradle-adaptive-analysis=false` to force the previous all-attribution path for Gradle compile units.

## Generated frontmatter

Each generated Markdown file starts with YAML frontmatter that is shared by the code-map and downstream conversion workflows.

```yaml
---
entity_type: java_class
entity_id: com.example.OrderService
conversion_status: not_started
analysis_status: analyzed
shared: false
source_file: C:\code\src\main\java\com\example\OrderService.java
source_hash: ...
---
```

`conversion_status` belongs to the downstream code-transformation workflow, not to this Java analyzer. It is initialized to `not_started` so a later agent or tool can track whether this source file has been converted into the target architecture or language. Typical downstream values might be `not_started`, `in_progress`, `converted`, `failed`, `skipped`, or `needs_review`.

`analysis_status` belongs to this Java converter. It records whether dependency analysis for the source file completed successfully:

| Value | Meaning |
| --- | --- |
| `analyzed` | The Java compiler attribution step completed and dependencies/members were extracted. |
| `timed_out` | Attribution exceeded the configured timeout; the Markdown file is still emitted, but dependency data may be incomplete. |
| `failed` | Attribution failed for this source file; dependency data may be incomplete. |
| `parse_only` | Compiler attribution was skipped or unavailable; dependencies are based on parse-only Java syntax. |
| `excluded_duplicate` | The file is an identical duplicate of another source file that was analyzed instead. |

Keeping both fields lets generated Markdown serve two layers at once: `analysis_status` describes the quality of the generated code map, while `conversion_status` remains available for the later monolith-to-target-system migration process.
