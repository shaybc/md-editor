# Fix git_panel_status Stack Overflow (evidence-based)

ASCII-only. Arrows are "->", dashes "--". Safe to paste into implementation prompts.

Supersedes the earlier "large repository" version. The root cause has been corrected
from log evidence: this is a deterministic parser crash inside simple-git's status
call, not a volume problem.

## Root cause (from logs + code)

Observed in the debug logs: the model calls `git_panel_status` (args `{}`) and the
git bridge returns `tool-error: "Maximum call stack size exceeded"`. It is
DETERMINISTIC and repeated -- 7 occurrences in one session log, 50 in another -- on a
workspace with only ~19 changed files and `.gitignore` already excluding
node_modules/vendor/logs/.tmp. So it is not driven by repository size or untracked
volume.

In `resources/bridges/git-bridge/git-bridge.cjs` the status path is
`formatStatus(await git.status())`. `formatStatus` and the `createDelayedGitClient`
wrapper are both linear (no recursion, no cycles), so the `RangeError` is thrown inside
`simple-git`'s own `git.status()` porcelain parser on this repo's specific status
output. The bridge's catch surfaces only `err.message`, so NO stack frames were
captured in any log -- which is a secondary defect (blind diagnosis).

Conclusion: bypass simple-git's status parser with a harness-owned iterative parser
over raw porcelain. This removes the crashing code path regardless of the exact
internal frame. It is not a volume fix.

## Non-goals

- Not an intent/completion change. But see step 5: a failed status must be recorded as
  failed evidence. The criterion-quality and claimType fixes for false-success live in
  a separate plan and are required in addition to this one.
- Not a change to command-execution policy; no shell fallback is introduced.
- The desktop Git panel keeps receiving complete status data.

## Fix

### 0. Confirm the frame and stop diagnosing blind (prerequisite, cheap)

- Because the crash is deterministic on this repo, reproduce it directly:
  `node -e "require('simple-git')(process.cwd()).status().then(()=>{}, e=>console.error(e.stack))"`
  from `C:/GitHub/shaybc/md-editor`. Capture the frame that overflows.
- Permanently fix the blind-spot: in the git bridge's error handling, log `err.stack`
  (not just `err.message`) to the existing debug log. The model-facing tool result
  still carries only a bounded message (step 3). This guarantees the next such failure
  is diagnosable.

This step is insurance, not a blocker: the bypass in step 1 is justified either way
because `git_panel_status` -> `git.status()` is the only status producer and
`formatStatus`/the client wrapper are provably not the recursion source.

### 1. Replace simple-git .status() with a safe iterative reader

In the git bridge, add one shared `readGitStatus(git)` helper and route every status
producer through it:

- Execute raw porcelain via the existing delayed client:
  `git.raw(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"])`.
  (`git.raw` flows through the same `createDelayedGitClient` wrapper as `.status()`, so
  this is drop-in compatible.)
- Parse the NUL-delimited records ITERATIVELY (a single pass; no recursion, no
  regex backtracking, no `apply`/spread over large arrays).
- Support: branch + upstream, ahead/behind, staged and unstaged entries, and
  added/modified/deleted/renamed/copied/conflicted/untracked, including rename
  source and destination.
- Return the EXISTING normalized shape `formatStatus` produces today, so all consumers
  are unchanged:

```json
{ "branch": "main", "tracking": "origin/main", "ahead": 0, "behind": 0,
  "staged": [], "unstaged": [], "files": [] }
```

- On a record it cannot parse, throw a bounded `GIT_STATUS_PARSE_FAILED` (step 3)
  rather than inventing partial status.

Replace every `formatStatus(await git.status())` call site with
`formatStatus? via readGitStatus`. There are ~10: the plain `status` action, the
post-mutation status returns (stage, unstage, commit, switchBranch, branchCreate,
branchRename, branchPush, branchDeleteLocal, branchDeleteRemote, resetToRemote,
discardChanges/stash flows), and the `changesDigest` collector. This stops the same
defect resurfacing through any other Git Panel action. Do NOT change the digest's
separate diff/patch collection or its `digestSize()` budget.

### 2. Keep the desktop panel complete; keep the model result bounded (secondary)

This is defensive hardening, not the fix. For the `git_panel_status` tool result to the
model:

- Add optional `maxFiles` (default 200, hard max 1000); sort files by normalized path.
- Return complete `counts` computed from the full parsed status, but only the bounded
  file window, with `truncated` and `returnedFiles` metadata:

```json
{ "status": { "branch": "main", "tracking": "origin/main", "ahead": 0, "behind": 0,
              "staged": [], "unstaged": [], "files": [] },
  "counts": { "files": 19, "staged": 3, "unstaged": 16 },
  "truncated": false, "returnedFiles": 19 }
```

- Apply a final serialized-byte budget so pathological filenames can't produce an
  oversized tool payload.
- Truncation is a SUCCESSFUL but incomplete status page, not a failure.
- Update the tool description: counts are complete; file details may be truncated;
  use file-specific Git/workspace tools for more detail.

The desktop panel path continues to receive the full parsed status (no bound).

### 3. Fail fast with a structured, bounded failure (stops the retry storm)

The logs show the model retried the crashing tool up to 50 times. Convert status
failures into a single bounded, model-facing failed result so the agent stops
hammering it:

```json
{ "status": "failed",
  "error": { "code": "GIT_STATUS_EXECUTION_FAILED", "stage": "execute",
             "retryable": false, "message": "Git status could not be read." } }
```

Codes: `GIT_STATUS_NOT_REPOSITORY`, `GIT_STATUS_EXECUTION_FAILED`,
`GIT_STATUS_PARSE_FAILED`, `GIT_STATUS_RESULT_LIMIT`. Set `retryable: false` for
parse/execution crashes so the agent does not loop. No raw output or stack in the tool
result; the stack goes only to the debug log (step 0).

### 4. Evidence honesty: a failed status is failed evidence

In `agent-tool-loop.js`, a `git_panel_status` returning the `GIT_STATUS_*` failure
envelope MUST be recorded in the completion evidence ledger with
`outcome: "failed"` (or `not-executed`), never `succeeded`. The assessor must not treat
a failed/absent status as verified repository state. This closes the specific path where
50 failed status calls still let the task be declared complete. Note: this is necessary
but not sufficient for the broader false-success problem -- the criterion-quality and
harness-assigned `claimType` changes are tracked separately and are still required.

## Test plan

- REPRODUCTION FIRST: capture this workspace's actual crashing status. Save the raw
  `git status --porcelain=v2 --branch -z --untracked-files=all` output from
  `C:/GitHub/shaybc/md-editor` as a fixture, confirm `simple-git().status()` throws on
  this repo, and assert `readGitStatus` parses the same input without error and returns
  the expected normalized shape. (Do NOT rely only on synthetic volume -- that tests the
  wrong axis and would pass while the real trigger goes unreproduced.)
- Parser correctness: clean, staged, unstaged, untracked, renamed, copied, deleted,
  conflicted records; branch/detached-head/upstream/ahead/behind; paths with spaces,
  Unicode, tabs, and long names.
- Robustness: tens of thousands of synthetic records complete without overflow (a
  general safety check, not the primary case).
- Bounding: complete counts returned while file details respect `maxFiles` and the byte
  budget; truncation reported as success.
- Failure envelope: malformed output -> `GIT_STATUS_PARSE_FAILED` (bounded, no raw
  output/stack), `retryable: false`; non-repository -> existing non-repo result.
- All call sites: status after stage/unstage/commit/branch/switch/reset/discard/stash
  use the safe reader; changesDigest still computes its status and unchanged patch data.
- Evidence honesty: a `git_panel_status` failure envelope yields an `outcome: "failed"`
  evidence-ledger entry and cannot be cited as met/verified.
- No retry storm: a single failed status returns immediately as a non-retryable failed
  tool result (assert the agent path does not re-invoke on the same error).
- Existing Git Panel exposure/approval/mutation/refresh tests still pass.

## Expected files

- `desktop-app/resources/bridges/git-bridge/git-bridge.cjs` (readGitStatus, err.stack
  logging, structured failures, reuse at all status call sites)
- `desktop-app/resources/ai-companion/tools/git-panel-tools.js` (maxFiles/bounding +
  failure passthrough for the model-facing status)
- `desktop-app/resources/ai-companion/core/agent-tool-loop.js` (failed status ->
  failed evidence-ledger entry; non-retryable)
- `desktop-app/tests/ai-agent-git-panel-tools.test.js`
- A focused git-status porcelain-v2 parser test + the captured real-repo status fixture.

## Assumptions and boundaries

- The crash is a deterministic defect in simple-git's status parsing on this repo's
  output; the fix removes the dependency on that parser rather than assuming volume.
- Raw `--porcelain=v2 -z` is the authoritative status source; the iterative parser is
  the single source of truth for all status consumers.
- Only the model-facing status file list is bounded; aggregate counts stay complete and
  the desktop panel keeps full status.
- No shell-command fallback; the fix does not depend on the agent's command policy.
- Confirming the exact simple-git frame (step 0) is recommended but not required to
  proceed, since the status producer is unambiguous.
