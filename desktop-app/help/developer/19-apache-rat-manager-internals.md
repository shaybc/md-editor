---
tags:
  - maven
  - apache-rat
  - internals
---
# Apache RAT Manager Internals

The reactive RAT Manager lives under `resources/js/rat/`. It accepts a normalized finding or Maven diagnostic and exposes stable routes through `ratManager.open(request)`.

## Entry points

- **Project > License > Resolve RAT finding...** opens the standalone finding workflow.
- A RAT-related Problems-row Quick Fix contributes **Resolve RAT finding...** with `local` provenance and deep-links with the complete diagnostic.

The generic Maven parser remains unchanged. Local recognition occurs at the RAT/Quick Fix boundary and does not invent a code edit.

## Data flow

1. `finding-parser.js` recognizes RAT messages and normalizes findings.
2. `project-context.js` finds the module, parent chain, wrapper, report, and declarations.
3. `file-inspector.js` and `provenance-analyzer.js` collect bounded technical evidence.
4. `action-catalog.js` separates remediation, policy, documentation, investigation, and bypass choices.
5. `change-planner.js` delegates narrow POM changes to `xml-edit-planner.js`.
6. `change-set.js` applies all text changes through tabs as one unsaved transaction.
7. `command-builder.js` and `runner.js` use the existing streamed terminal and compare findings.
8. `dialog.js` renders the staged workflow; `index.js` remains the thin orchestrator.

## Safety boundaries

- XML changes insert only the required fragment and never serialize the complete POM.
- Exclusion means "do not inspect," not "approved license."
- Documentation does not automatically clear RAT.
- License-family approval is project policy, not legal advice.
- Header insertion requires explicit authorization.
- Skip actions are visually and behaviorally separated as audit bypasses.
- Opening performs static reads only; commands and saves require explicit actions.

The proactive [RAT Policy Manager](20-apache-rat-policy-manager-internals.md) reuses these project-context, XML, transaction, tabs, and runner services.
