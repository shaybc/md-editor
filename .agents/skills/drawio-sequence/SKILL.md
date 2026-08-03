---
name: drawio-sequence
description: Generate high-quality UML sequence diagrams in draw.io with ordered participants, evenly spaced lifelines, correctly stacked messages, activation bars, combined fragments, notes, returns, self-calls, and destruction markers. Use for request flows, API interactions, distributed traces, authentication flows, event processing, and protocol scenarios.
---

# Draw.io UML Sequence Diagram Skill

Use `drawio-core` for XML validity, token modes, and general validation. Then read `references/sequence-layout.md`.

## Goal

Create sequence diagrams that are immediately readable: time flows downward, participants are ordered to minimize long messages, every message occupies a distinct time row, activation bars match execution, and frames never collide with labels or lifelines.

## Workflow

1. Extract participants, message order, sync/async semantics, returns, loops, alternatives, optional paths, parallel paths, notes, creation, and destruction.
2. Normalize participants to stable IDs. Merge aliases that refer to the same participant.
3. Order participants before drawing. Keep initiator leftmost; place each new participant near the participant that first contacts it; keep shared services central.
4. Build a numbered event list. One semantic event equals one vertical row.
5. Allocate fragment ranges before creating messages.
6. Place participant headers and full-height lifelines.
7. Add messages from top to bottom.
8. Add activation bars, frames, notes, create/destroy markers, then resize the canvas.
9. Run sequence-specific validation and repair only detected failures.

## Participant rules

- Default header width: 140 px; minimum 120 px.
- Default center-to-center spacing: 220 px; increase to 280 px for long labels or notes.
- Keep all participant headers on one y-coordinate.
- Lifelines extend at least 50 px below the final event.
- Actor participants use `umlActor`; systems and components use `umlLifeline`.
- More than 8 participants: split the scenario, use a referenced interaction, or increase canvas width. Do not compress below 170 px spacing.
- Do not reorder participants after messages are placed.

## Message rules

- Time flows strictly downward.
- Each message gets its own y row; minimum 52 px between message baselines.
- Synchronous call: solid line with filled arrow.
- Asynchronous signal/event: solid line with open arrow.
- Return: dashed line with open arrow; omit trivial returns when they add no information.
- Self-call: compact loop on the right side of the lifeline; never cross a neighboring lifeline.
- Message labels use concise operation names and key parameters only.
- Use sequence numbers only when explicitly requested or when message order is otherwise ambiguous.
- Create messages target the participant header or creation point; the created lifeline begins there.
- Destruction terminates the lifeline at an X marker.

## Activation rules

- Activation width: 12–16 px, centered on its lifeline.
- Start activation at the incoming synchronous call.
- End at the matching return or completion event.
- Nested calls create horizontally offset nested activations by 6 px.
- Do not create activation bars for passive actors unless they execute behavior.
- Never let an activation bar cover a message label.

## Combined fragments

Support `alt`, `opt`, `loop`, `par`, `break`, `critical`, `ref`, and `neg`.

- Frame starts 18 px above its first event and ends 24 px below its last event.
- Frame sides stay at least 20 px outside the leftmost and rightmost affected lifelines.
- Put the operator in the upper-left tab.
- Put guards in square brackets.
- `alt` operands are separated by horizontal dashed dividers.
- `par` operands must be visibly separated and retain independent event order.
- Nested frames need at least 18 px inset and must not share borders.
- Do not use a frame for a single annotation that a note can express more clearly.

## Notes and annotations

- Attach notes beside the relevant participant or span them over participants only when necessary.
- Notes must not overlap messages, headers, activation bars, or frame labels.
- Keep notes under three short lines where possible.
- Use `ref` frames for substantial interactions defined elsewhere.

## XML guidance

- Use `shape=umlLifeline;perimeter=lifelinePerimeter;size=30;html=1;` for standard participants.
- Use straight horizontal message edges rather than orthogonal architecture routing.
- For precise message rows, use explicit source and target geometry points or anchored helper ports so both endpoints share the same y-coordinate.
- Helper ports must be invisible, have stable IDs, and remain children of the relevant lifeline or layer.
- Do not use ELK/post-layout on a completed sequence diagram because it can destroy temporal ordering.

## Quality modes

- `fast`: <= 5 participants, <= 12 events, no nested fragments. One pass.
- `balanced`: <= 8 participants, <= 30 events, fragments and activations. One validation pass.
- `pro`: complex nesting, creation/destruction, parallel paths, or presentation output. One critique and at most one repair.

## Sequence validation

A hard failure occurs when:

- message order is visually inconsistent with semantic order;
- a message is not horizontal without intentional self-call geometry;
- labels overlap lines, activations, headers, or frames;
- lifelines are unevenly spaced without a reason;
- a frame excludes one of its events or includes unrelated events;
- activation start/end does not match the call lifecycle;
- a return appears above its call;
- a destroyed participant receives later messages;
- a created participant's lifeline begins before creation.

Score 0–2 each: participant order, spacing, temporal rhythm, message semantics, activations, fragments, labels, creation/destruction. Use the core mode thresholds.

## Output

Return one uncompressed `.drawio` file. For long scenarios, prefer multiple pages named by scenario rather than one extremely tall page.
