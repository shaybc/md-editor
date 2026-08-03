---
name: drawio-core
description: Create or repair clean, aligned, low-crossing draw.io XML diagrams. Use whenever generating or editing .drawio files, especially when layout quality, grouping, edge routing, or token efficiency matters.
---

# Draw.io Core Layout Skill

## Goal

Produce readable native draw.io XML with deterministic placement, explicit hierarchy, minimal edge crossings, and no avoidable overlaps. Optimize quality per token.

## References

Read only what is needed:

1. Always read `references/layout-rules.md`.
2. For XML syntax, read `references/upstream/drawio-official/xml-reference.md`.
3. For shapes and styles, read `references/upstream/drawio-official/style-reference.md` only when needed.
4. Specialized diagram skills may add stricter rules that override generic layout defaults.

## Modes

- `fast`: one layout pass; repair only hard failures.
- `balanced` (default): one compact plan plus one deterministic validation pass.
- `pro`: one plan, one render, one critique, and at most one repair pass.

Never iterate without a concrete detected defect.

## Workflow

1. Extract nodes, edges, labels, groups, and reading direction.
2. Remove relationships that merely repeat containment or obvious adjacency.
3. Choose one layout family and commit.
4. Place groups before children and nodes before edges.
5. Route after placement.
6. Validate deterministically.
7. Emit uncompressed `.drawio` XML.

## Hard constraints

- No node overlap or label clipping.
- No edge through an unrelated node.
- Avoid crossings; localize unavoidable crossings.
- Align semantic peers and keep equal spacing.
- Use containment through `parent`.
- Every edge includes `<mxGeometry relative="1" as="geometry"/>`.
- Use stable semantic IDs where practical.

## Token discipline

- Do not narrate coordinate arithmetic.
- Do not generate alternatives unless requested.
- Do not reload large references after syntax is known.
- Prefer deterministic checks over free-form critique.
- `pro` allows at most one repair pass unless XML is invalid.

## Completion score

Score 0–2 each: overlap, alignment, hierarchy, routing, label fit, whitespace, consistency, reading order.

- `fast`: >= 11/16 and no hard failure.
- `balanced`: >= 13/16.
- `pro`: >= 15/16.
