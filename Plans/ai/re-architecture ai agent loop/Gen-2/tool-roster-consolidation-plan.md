# AI Companion Tool Roster Consolidation Plan

Goal: shrink the tool surface so weak models (e.g. gemini-3.5-flash-lite) see a
small, single-responsibility, non-overlapping set. Fewer tools, each narrow and
expert in one subject. Large domains become **scoped** sets loaded only when the
task needs them, not part of every request.

## Design principles

1. **Single responsibility per tool.** No two tools that a model could reasonably
   pick for the same job.
2. **Small always-on core.** Mode-agnostic essentials only; everything else is
   scoped in.
3. **No schema bloat.** The callable list stays short; whole domains stay out
   until scoped in.
4. **Discrete over dispatcher.** Prefer a few clear verbs over one mega-tool with
   a mode flag — but collapse genuine duplicates.
5. **Consistent, bounded signatures.** Readers take a primary selector plus a
   `max*` count bound (`maxFiles`, `maxMatches`, `maxLines`) that defaults to a
   sensible cap, so output is bounded by default and pages via the same rhythm.
   Prefer counts over absolute endpoints (a count can't invert or require knowing
   the target's size).
6. **Read/write scope separation per domain.** Every domain splits into a `.read`
   scope (inspection) and a `.write` scope (mutation), so a mode or a user can
   grant "look but don't touch" for any domain independently. Execution-only
   domains have just a write/execute scope.

---

## Current inventory (77 tools)

| Group | Count | Tools |
|---|---|---|
| read.workspace | 8 | get_workspace_state, get_recent_activity, search_vault, list_files, glob, search_grep, read_file, read_conversion_report |
| read.editor | 4 | read_active_document, read_open_tabs, get_document_structure, get_link_context |
| read.git | 5 | git_panel_status, git_panel_branch_list, git_panel_compare_file, git_panel_changes_digest, git_panel_pr_notes_context |
| read.graph | 4 | graph_get_state, graph_search_nodes, graph_get_node_context, graph_find_paths |
| read.settings | 3 | preferences_get, preferences_search, preferences_export |
| read.apiclient | 8 | api_asset_search, api_asset_get, request_history_get, response_analyze, environment_get, environment_resolve, secret_redact, mock_call |
| read.conversion | 2 | get_conversion_export_state, get_code_conversion_status |
| read.plan | 2 | plan_list, plan_read |
| ui-state | 5 | graph_apply_filter, graph_focus_nodes, graph_show_local, graph_clear_focus, open_file_in_tab |
| workspace-write | 23 | apply_edit, write_file, create_document_tab, insert_at_cursor, replace_selection, replace_document_range, extract_selection_to_note, git_panel_stage_files, git_panel_unstage_files, git_panel_commit, git_panel_create_branch, git_panel_switch_branch, export_active_document, export_active_folder_graph, plan_create, plan_update, plan_update_status, plan_rebuild_index, request_create, request_update, environment_update, mock_create, mock_update |
| external-write | 7 | git_panel_fetch, git_panel_pull, git_panel_push, request_send, preferences_update, preferences_reset, preferences_import |
| execution | 6 | run_command, compile_project, run_tests, restore_dependencies, manage_package, start_code_conversion |

---

## Overlap findings (where weak models get confused)

1. **File discovery (3 → 1):** `list_files` and `glob` do the same job (`glob` with
   `*` = list) — keep `glob` (the name models know best). `search_vault` and
   `search_grep` are both content search.
2. **Content reading (3 → 2):** `read_file` (disk), `read_active_document` (buffer),
   `read_open_tabs` (tabs) are three ways to get text.
3. **Context snapshots (3 → 0):** `get_workspace_state`, `get_recent_activity`, and
   `read_open_tabs` are redundant — the active document is already auto-injected,
   and the rest is low-signal. Removed entirely; open-tab awareness becomes a
   one-line addition to the auto-injected context, not a tool.
4. **Editor writes (7 → 2):** `apply_edit`, `write_file`, `create_document_tab`,
   `insert_at_cursor`, `replace_selection`, `replace_document_range`,
   `extract_selection_to_note` — seven write paths. The cursor/selection variants
   depend on brittle live-editor state; `apply_edit` (targeted search/replace) and
   `write_file` (create/overwrite) cover the same ground deterministically.
5. **Git reads (5 → 2):** `git_panel_status` + `git_panel_changes_digest` are the
   same "what changed" answer; `git_panel_pr_notes_context` is niche (can be a
   prompt, not a tool).
6. **Whole domains that don't belong in every request:** API Client (15), Graph
   (8), Preferences (6), Conversion/Export (6). These are task-specific and should
   be scoped, not always-on.
7. **Dependency tools (2 → 1):** `restore_dependencies` and `manage_package`
   overlap.
8. **Plan maintenance leaking to the model:** `plan_rebuild_index` and
   `plan_update_status` are maintenance/detail that can be internal or folded.

---

## Proposed target roster

### Always-on core — readers, all modes (3)

These are the only genuinely mode-agnostic tools. They are read-only, so even
read-only modes (Plan) get them safely.

| Tool | Signature | Replaces |
|---|---|---|
| `glob` | `(pattern, maxFiles?)` — canonical name; matches model training priors | list_files, (find_files) |
| `search_text` | `(query, maxMatches?)` | search_grep, search_vault |
| `read_file` | `(path?, startLine?, maxLines?)` — no path ⇒ active document; `maxLines` defaults to a cap (~400) so a no-arg read never floods context; page via `startLine += maxLines` | read_file, read_active_document |

The writers (`apply_edit`, `write_file`) are **not** in the always-on core — they
live in the **edit scope** below. This keeps them out of read-only modes
(Plan/chat) structurally: a read-only mode is never handed a writer.

**No `get_document_structure` in the core.** For markdown, its output (headings,
links, tags, frontmatter, counts) is trivially derivable from `read_file`, and the
active doc is auto-injected anyway — so it is pure overlap plus an extra
tool-selection decision weak models handle poorly. Removed. **Reintroduce only if
large-doc navigation proves necessary, and only as a line-anchored outline**
(headings with line ranges) so it buys precise `apply_edit` targeting that
`read_file` does not — not the current summary.

**No context-snapshot tool.** The active document's live content is already
injected into every request as a mandatory system message by
`agent-context-builder.js` (the "Live editor buffer" block), along with
attachments and the intent contract — none of that needs a tool call.
`get_workspace_state`, `get_recent_activity`, and `read_open_tabs` are therefore
removed: they add only counts, "recent activity", and open-tab summaries, which
are low-signal, overlap `read_file`, and tempt weak models to waste a turn
"orienting" instead of working.

**Awareness of what's open** is preserved without a tool: append a one-line
open-tabs list (paths only) to the already-injected context block. A few tokens,
always present; the model reads a specific tab's content via `read_file`.

### Scoped sets (loaded only when the task/scope calls for it)

Every domain is split into a `.read` and a `.write` scope (principle 6). The
file-editing scope is separate and governed by mode/edit-capability, not by the
per-domain settings matrix below.

**File editing (not domain-toggleable):**

- **edit:** `apply_edit(path, search, replacement, occurrence?, expectedMatches?)`,
  `write_file(path, content, openInTab?)`. Loaded only for modes/tasks that modify
  files (agent / edit tasks); never present in read-only Plan or chat.

**Domain scopes (each independently toggleable in Settings → AI):**

| Domain | `.read` scope | `.write` scope |
|---|---|---|
| Git | `git_status`, `git_diff(path?)`, `git_branches` | `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_pull`, `git_fetch`, `git_branch_create`, `git_branch_switch` |
| Plan | `plan_list`, `plan_read` | `plan_create`, `plan_update` (folds `update_status` via a `status` field) |
| API Client | `api_asset_search`, `api_asset_get`, `request_history_get`, `response_analyze`, `environment_get`, `environment_resolve`, `mock_call` | `request_create`, `request_update`, `request_send`, `environment_update`, `mock_create`, `mock_update` |
| Graph | `graph_get_state`, `graph_search_nodes`, `graph_get_node_context`, `graph_find_paths`, `get_link_context` | `graph_apply_filter`, `graph_focus_nodes`, `graph_show_local`, `graph_clear_focus` (ui-state) |
| Settings | `preferences_get`, `preferences_search`, `preferences_export` | `preferences_update`, `preferences_reset`, `preferences_import` |
| Conversion | `get_conversion_export_state`, `get_code_conversion_status`, `read_conversion_report` | `export_active_document`, `export_active_folder_graph`, `start_code_conversion` |
| Execution | *(none)* | `run_command`, `run_tests`, `compile_project`, `manage_dependencies(action)` (write/execute only) |

### Remove from the model roster entirely

- `git_panel_pr_notes_context` → replace with a prompt instruction using `git_diff`.
- `plan_rebuild_index` → internal maintenance, not a model tool.
- `open_file_in_tab` as a standalone → folded into `write_file(openInTab)`;
  drop pure "show this tab" navigation from the agent surface.
- `extract_selection_to_note`, `insert_at_cursor`, `replace_selection`,
  `replace_document_range`, `create_document_tab` → covered by `apply_edit` +
  `write_file`.
- `secret_redact` as a standalone tool → apply redaction internally on API reads.
- `get_workspace_state`, `get_recent_activity`, `read_open_tabs` → covered by
  auto-injected context (active buffer + a one-line open-tabs list).
- `get_document_structure` → derivable from `read_file`; reintroduce later only as
  a line-anchored outline for large docs, if needed.

### Net effect

- Every request's callable list drops from up to ~40 (agent mode) to a **3-tool
  always-on reader core** plus the task's scoped set(s) — e.g. an edit task sees
  3 readers + 2 writers = 5; a git task sees 3 + git.read (+ git.write). Flash-lite
  rarely sees more than ~11-13 tools even in the busiest scope.
- The merges remove same-job duplicates that cause wrong-tool selection.

---

## Per-domain tool availability (Settings → AI)

A new tab under **Settings → AI** lets the user choose which **domain** scopes are
exposed to the model. Because every domain is split read/write (principle 6), the
control is a **Domain × {Read, Write}** matrix:

| Domain | Read | Write |
|---|---|---|
| Git | ☐ | ☐ |
| Plan | ☐ | ☐ |
| API Client | ☐ | ☐ |
| Graph | ☐ | ☐ |
| Settings | ☐ | ☐ |
| Conversion | ☐ | ☐ |
| Execution | — | ☐ |

Rules:

- **Core readers (`glob`, `search_text`, `read_file`) are always on** and are not
  shown in the matrix.
- **File-editing tools (`apply_edit`, `write_file`) are not in the matrix** — they
  are governed by mode/edit-capability, not per-domain settings.
- Each checked cell makes that scope *eligible* to be seeded into a request; an
  unchecked cell means those tools are never exposed to the model, in any mode.
- Effective per-request toolset = core readers + (edit tools if the mode edits) +
  (task-relevant domain scopes ∩ user-enabled scopes from this matrix). The static
  per-mode/per-task seeds still decide which enabled scopes a given task pulls in;
  this matrix is the outer allow-list.

Persistence: store as a scope allow-list in `aiCompanionSettings` (e.g.
`toolScopes: { "git.read": true, "git.write": false, ... }`), so it flows through
the existing settings `normalize`/defaults path and is reconciled on future default
changes by the settings-upgrade mechanism already in place.

**Open sub-decision — defaults:** propose `.read` scopes default **on** and
`.write`/execution scopes default **off** (safer; user opts in to mutation). Needs
confirmation.

## Recorded decisions

### Edit primitive: `apply_edit` (search/replace), not `apply_patch` (diff)

**Decision:** v1 uses `apply_edit` (quote the exact text + its replacement) as the
targeted edit tool, plus `write_file` for create/overwrite. We do **not** add an
`apply_patch`/unified-diff tool, and we do not ship both.

**Rationale:**

- **Weak-model robustness.** `apply_patch` makes the model responsible for a
  structurally valid patch — hunk headers, line numbers, surrounding context —
  which weak models (flash-lite) get wrong constantly, and a malformed patch fails
  wholesale. `apply_edit` only asks for a snippet + replacement: no line math, no
  diff grammar.
- **The existing implementation already handles the classic search/replace failure
  modes** (CRLF/indentation normalization; `occurrence`/`expectedMatches` for
  disambiguation).
- **No overlapping edit tools.** Two edit primitives would reintroduce the
  wrong-tool-selection confusion this whole effort removes.
- **`apply_patch`'s advantage is a strong-model optimization** (many multi-file
  edits, token-efficient) — not the v1 target.

**Revisit if:** a later version targets strong models doing large multi-file edits
— then `apply_patch` may be added as an additional, model-tier-gated edit tool.

## Decisions (all resolved)

1. **Editor-write aggressiveness** — v1: collapse to `apply_edit` + `write_file`
   only. No live cursor/selection editing in v1, so `insert_at_cursor`,
   `replace_selection`, `replace_document_range`, `extract_selection_to_note`, and
   `create_document_tab` are all removed. Revisit live-edit UX later if needed.
2. **Git verbs** — keep discrete write verbs (`git_stage`, `git_unstage`,
   `git_commit`, `git_push`, `git_pull`, `git_fetch`, `git_branch_create`,
   `git_branch_switch`). No `git_action` dispatcher: clarity wins and they're
   already approval-gated. They live in the `git.write` scope, not the core.
3. **Domain scoping mechanism** — static per-mode/per-task seeds only for v1. No
   dynamic `search_tools`/`load_tool` retrieval; revisit if the static seeds prove
   too coarse for the long tail.
4. **`get_context` shape** — removed. Active buffer is auto-injected; open-tab
   awareness becomes a one-line addition to the auto-injected context.
5. **Removals sign-off** — confirmed. The "remove entirely" list is approved,
   including `pr_notes_context`, `open_file_in_tab`, and `secret_redact`.
