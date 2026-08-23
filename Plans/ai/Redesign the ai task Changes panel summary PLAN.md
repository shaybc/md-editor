# Redesign the ai task Changes panel summary

Redesign the **Changes panel** shown at the end of an agent task when files were created, modified, renamed, or deleted.

The current compact panel wastes too much vertical space. Redesign it to behave more like a compact Git changes summary while preserving the existing expandable overlay behavior.

## 1. Make the collapsed panel significantly more compact

The collapsed state should consume as little vertical space as reasonably possible.

Avoid:
- Large padding
- Large empty areas
- Repeated labels such as both `Changes` and `Changed files 1`
- Multi-line file entries unless necessary
- Large card-like rows

Prefer something closer to:

`Changes  •  4 files   +128  -37                         ⌃`

Then compact file rows:

`M  src/editor/EditorView.tsx              +42  -18`
`A  src/components/ChangesPanel.tsx        +71   -0`
`M  src/styles/editor.css                  +15  -19`
`D  src/legacy/OldPanel.tsx                 +0   -8`

The entire collapsed panel should feel like an IDE/Git status component rather than a large content card.

---

## 2. Add Git-style change statistics

Show change statistics both at the panel level and per file.

### Overall summary

Display:
- Number of changed files
- Total added lines
- Total deleted lines

Example:

`4 files   +128  -37`

Use:
- Green for additions
- Red for deletions
- Neutral/default color for file count

### Per-file summary

Every file row should show, when available:

`+42  -18`

Use:
- Green for added lines
- Red for deleted lines

Do not use verbose text such as:

`42 lines added, 18 lines deleted`

Keep it compact.

If a file has no meaningful line statistics, omit them rather than displaying unnecessary zero values.

---

## 3. Clearly indicate change type

Every file should have a compact status indicator.

Use familiar Git-style semantics:

- `M` — Modified
- `A` — Added / Created
- `D` — Deleted
- `R` — Renamed

The status can use subtle semantic coloring.

Examples:

`M  src/editor/EditorView.tsx       +42 -18`

`A  src/components/NewPanel.tsx     +71`

`D  src/legacy/OldPanel.tsx             -8`

The file name/path should remain the main visual element.

---

## 4. Make every file clickable

Each file row must behave as an IDE navigation action.

When clicking a file:

1. Open that file in the IDE editor.
2. Open or activate its editor tab.
3. Switch away from the AI/chat view to the normal editor/files view if necessary.
4. Focus the editor containing that file.
5. If the file is already open, activate its existing tab instead of opening a duplicate.

The interaction should feel identical to clicking a file from the IDE file explorer.

The entire row should be clickable, not just the filename.

Use appropriate hover and pointer states so it is obvious that the row is navigable.

---

## 5. Deleted files

Deleted files cannot be opened normally.

For deleted files:

- Keep the row visible.
- Clearly indicate `D`.
- If the IDE supports opening the previous version/diff, clicking should open the diff.
- Otherwise, do not attempt to open a nonexistent editor file.
- Still allow the row to participate in the expanded changes view.

---

## 6. File paths

Avoid wasting space displaying long absolute paths such as:

`C:\Users\shayg\Downloads\project\src\components\ChangesPanel.tsx`

Prefer project-relative paths:

`src/components/ChangesPanel.tsx`

If necessary:
- Truncate the middle or beginning of very long paths.
- Preserve the filename.
- Show the full path in a tooltip.
- Optionally provide a context action to copy the full path.

Example:

`…/components/editor/ChangesPanel.tsx`

rather than wrapping the path onto several lines.

---

## 7. Single-file case

Do not create a large panel just because there is one changed file.

For a single file, something approximately this compact is sufficient:

`Changes   1 file   +18 -4                              ⌃`
`M  src/editor/EditorView.tsx                 +18 -4`

This should take approximately two compact rows.

Avoid the current large card layout.

---

## 8. Multiple-file case

When several files changed, show as many rows as reasonably fit without making the panel large.

For example:

`Changes   7 files   +183 -51                           ⌃`

`M  src/editor/EditorView.tsx               +42 -18`
`A  src/components/ChangesPanel.tsx         +71`
`M  src/styles/editor.css                   +15 -19`

`+4 more`

The collapsed state should have a sensible maximum height.

Do not let the compact changes panel push a large portion of the conversation upward.

---

## 9. Expanded overlay

Preserve the existing expand behavior where the panel can expand upward over the conversation.

The expanded state may occupy approximately 70% of the available central workspace height.

The expanded view should provide a richer file-change browser.

Suggested structure:

**Changes**  
`7 files   +183 -51`

Search/filter if useful

`M  src/editor/EditorView.tsx               +42 -18`
`A  src/components/ChangesPanel.tsx         +71`
`M  src/styles/editor.css                   +15 -19`
`D  src/legacy/OldPanel.tsx                      -8`

The expanded view should:
- Be scrollable.
- Keep the header visible.
- Make every row clickable.
- Provide clear hover/selection states.
- Avoid unnecessary large cards around individual files.

---

## 10. Expansion affordance

Keep the existing upward expansion concept, but make it clearer.

The header could contain something like:

`Changes   7 files   +183 -51                    ⌃`

The chevron should have:
- A sufficiently large click target.
- Hover state.
- Tooltip such as `Expand changes`.
- Opposite direction when expanded.

Clicking the header itself may also expand/collapse if that does not conflict with other interactions.

---

## 11. Consider opening a diff from the expanded view

If the IDE already has diff support, use it.

Prefer:

- Clicking the filename → open the current file in the editor.
- Clicking the change statistics or a dedicated diff icon → open the diff.

For example:

`M  EditorView.tsx             +42 -18       [diff]`

Do not introduce a new diff implementation if one already exists elsewhere in the IDE. Reuse existing editor/diff/navigation mechanisms.

---

## 12. Visual styling

Use the application's existing dark-theme design system.

The Changes panel should visually resemble a professional IDE source-control summary.

Use:
- Tight row heights
- Small but readable typography
- Subtle separators
- Minimal borders
- Small status icons/letters
- Semantic green/red change counts
- Clear hover backgrounds
- Stronger selected/focused state

Avoid:
- Large rounded cards for every row
- Excessive padding
- Large section titles
- Large empty vertical areas
- Repeating the same information
- Bright saturated colors across large areas

Green and red should primarily be used for the `+/-` statistics and subtle change indicators.

---

## 13. Information hierarchy

The most important information should be readable at a glance:

1. How many files changed?
2. How large was the change?
3. Which files changed?
4. What happened to each file?
5. How many lines were added/deleted?

The user should be able to scan the entire result in seconds.

---

## 14. Example target collapsed state

Something conceptually similar to:

Changes    4 files    +128 -37                         ⌃
────────────────────────────────────────────────────────
M  src/editor/EditorView.tsx                  +42 -18
A  src/components/ChangesPanel.tsx            +71
M  src/styles/editor.css                      +15 -11
D  src/legacy/OldPanel.tsx                         -8

For more files:

Changes    12 files   +381 -94                         ⌃
────────────────────────────────────────────────────────
M  src/editor/EditorView.tsx                  +42 -18
A  src/components/ChangesPanel.tsx            +71
M  src/styles/editor.css                      +15 -11
+9 more

Do not copy this literally if it conflicts with the existing design system; use it as the density and hierarchy target.

---

## 15. Interaction behavior

Support:
- Single click file → open/focus file in editor.
- Hover → visually indicate navigability.
- Keyboard focus/navigation where appropriate.
- Enter on focused row → open file.
- Expand/collapse without losing current chat scroll state.
- When closing the expanded overlay, return to the previous chat position.
- Do not create duplicate editor tabs.

---

## 16. Data source

Use the actual task file-change information to calculate and display:

- File status
- Added lines
- Deleted lines
- Overall totals

Do not fake statistics.

If the current task-change model does not contain line-level statistics, extend the model/data collection as necessary so the UI can receive the real information.

Reuse Git/diff/change-tracking infrastructure already present in the project where possible.

---

## 17. Preserve existing functionality

Do not redesign unrelated AI/chat UI.

Preserve:
- The Changes panel location directly above the main composer.
- Existing expand/collapse functionality.
- Existing task/change tracking.
- Current dark-theme conventions.

Focus specifically on making the Changes panel:

**denser, easier to scan, Git-like, and directly integrated with IDE file navigation.**