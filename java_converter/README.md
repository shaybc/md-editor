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
--timeout-ms <milliseconds>
```

The converter uses the Java compiler API for symbol attribution. It resolves same-package references, wildcard imports, static imports, nested classes, annotations, generics, inheritance, thrown exceptions, and external classpath entries, then emits Markdown dependency links only for local source files.

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
| `excluded_duplicate` | The file is an identical duplicate of another source file that was analyzed instead. |

Keeping both fields lets generated Markdown serve two layers at once: `analysis_status` describes the quality of the generated code map, while `conversion_status` remains available for the later monolith-to-target-system migration process.
