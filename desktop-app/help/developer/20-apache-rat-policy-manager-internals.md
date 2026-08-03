---
tags:
  - maven
  - apache-rat
  - project-policy
  - internals
---
# Apache RAT Policy Manager Internals

The proactive RAT Policy Manager is isolated under `resources/js/rat-policy/`. Its public internal entry point is:

```js
ratPolicyManager.open({
  projectPath,
  mode: "guided" | "advanced",
  route
});
```

Stable routes currently map to `overview`, `license`, `enforcement`, `coverage`, `review`, and `advanced`. Every open reconstructs project state; a stale policy snapshot is not retained between invocations.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `bootstrap.js` | Registers the feature with one application bootstrap call. |
| `index.js` | Coordinates inventory, draft, preview, application, and verification. |
| `project-inventory.js` | Adapts the existing RAT project context into a policy inventory using static reads only. |
| `policy-model.js` | Creates and updates the non-persistent policy draft. |
| `version-capabilities.js` | Maps detected RAT versions to safe option and validation capabilities. |
| `reference-catalog.js` | Resolves bundled offline assets through their manifest. |
| `coverage-analyzer.js` | Explains active, inherited, plugin-management-only, and ambiguous module coverage. |
| `policy-validator.js` | Separates blocking safety errors from policy warnings. |
| `pom-edit-planner.js` | Adds or updates only the required RAT plugin/execution range. |
| `rat-config-planner.js` | Generates external declarative family, license, matcher, and approval configuration. |
| `exclusion-planner.js` | Generates reviewed exclusion files and rejects all-workspace patterns. |
| `header-planner.js` | Places authorized headers after shebangs or XML declarations. |
| `change-planner.js` | Composes a multi-file preview from dirty buffers or disk baselines. |
| `policy-verifier.js` | Delegates checks to the existing RAT runner. |
| `help-content.js` | Supplies offline contextual explanations and official links. |
| `dialog.js` | Renders the guided/advanced wizard, preview, result, and help dialogs. |

The entry point remains thin. It does not parse POM XML, construct Maven commands, edit tabs, or render individual forms.

## Reused RAT services

The policy feature reuses `resources/js/rat/` instead of forking the reactive manager:

- `ratProjectContext` for module, parent, wrapper, report, and declaration discovery.
- `ratConfigurationReader` for formatting-neutral POM inspection.
- `ratXmlEditPlanner` for narrow configuration element insertion and XML validation.
- `ratChangeSet` for transactional unsaved application, rollback, and grouped undo.
- `ratRunner` for wrapper-aware terminal execution and output capture.
- The tabs service for dirty-buffer snapshots, external content application, explicit saves, and structural undo.

The Problems panel, Maven diagnostic parser, Java Quick Fix workflow, build provider, and RAT finding semantics are unchanged.

## Safety invariants

- Opening performs no process execution, save, download, or filesystem write.
- Every target must be a local path inside the opened workspace.
- Dirty buffers are the editing baseline.
- POM changes use range insertion; the whole document is never serialized.
- A `pluginManagement` declaration is not treated as an active execution.
- Broad exclusion patterns are rejected.
- Custom definitions require explicit matcher evidence and an external configuration in the first release.
- `skip` and execution deactivation require bypass acknowledgement.
- Every text change is previewed and applied as one unsaved transaction.
- Verification requires a separate save confirmation.

## Offline reference pack

`resources/assets/rat-policy/manifest.json` records every schema and template, its origin, its license, and known limitations. The shipped 0.17 and 0.18 XSD files are authored structural subsets and must remain labeled as such. Do not call them official RAT-generated schemas.

User-facing RAT guidance belongs under `help/user/`, including `apache-rat-policy-baseline.md`. The asset pack contains only runtime inputs and their provenance notice; it is not a second help tree.

The desktop package intentionally excludes RAT binaries, RAT’s evolving default license database, and complete SPDX data. This avoids shadowing the project’s actual Maven dependency and prevents quickly stale policy data from becoming an implicit source of truth.

Release maintainers can explicitly replace a subset with an immutable official artifact:

```powershell
npm run update:rat-policy-assets -- --version 0.18 --schema-url https://official.example/rat-config.xsd --sha256 <expected-sha256>
```

`update-rat-policy-assets.js` requires HTTPS, verifies the caller-supplied SHA-256 before writing, checks that the payload resembles an XML schema, and records URL, checksum, version, and license in the manifest. It is never invoked during application startup or wizard use.

## Tests

Focused Node tests cover version mapping, conservative defaults, bypass and exclusion validation, pluginManagement behavior, formatting-preserving POM insertion, dirty-buffer planning, workspace boundaries, offline manifest integrity, and lazy dialog registration. The focused Playwright flow verifies the `Project > License` submenu and that opening the manager performs no Maven execution.

See also: [Apache RAT Manager Internals](19-apache-rat-manager-internals.md).
