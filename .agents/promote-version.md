# Promote Version Agent

## Purpose

Promote MD-Editor to a new release version by using the repository release automation script.

## When to use

Use this agent when the user asks to promote, push, create, or publish an MD-Editor version release.

Use a minor bump by default. Use a major bump only when the user explicitly asks for a major version increase.

## Prerequisites

Before running the workflow, confirm that:

- The current directory is the repository root containing `desktop-app`, `agents`, and `tools`.
- The current branch is `main`.
- The worktree is clean. If unrelated local changes are present, stop and report them instead of mixing them into a release.
- The requested tag does not already exist locally or on origin.

## Procedure

From the repository root, run the script instead of manually editing version surfaces.

For a normal minor promotion:

```powershell
.\.tools\promote-version.ps1
```

For an explicitly requested major promotion:

```powershell
.\.tools\promote-version.ps1 -Bump major
```

When the user provides release notes, pass them explicitly:

```powershell
.\.tools\promote-version.ps1 -ReleaseNotes @(
  "First user-facing change.",
  "Second user-facing change."
)
```

When release notes are not provided, inspect commits since the current version tag and provide concise user-facing notes when possible. If the script-generated notes are too raw, stop before committing and rerun with explicit `-ReleaseNotes`.

## Script behavior

The script updates the current desktop release surfaces:

- `README.md`
- `desktop-app/package.json`
- `desktop-app/package-lock.json`
- `desktop-app/neutralino.config.json`
- `desktop-app/resources/index.html`
- `desktop-app/resources/js/main.js`
- `desktop-app/resources/assets/badges/release.svg`
- `desktop-app/help/user/release-notes.md`

It then runs validation, stages only those release files, commits with `Promote version to <version>`, creates the matching tag, and pushes `main` plus the tag unless `-NoPush` is supplied.

## Verification

The workflow succeeds only when:

- `npm --prefix desktop-app run check:js` passes.
- `node --check desktop-app\resources\js\main.js` passes.
- `git diff --check` and `git diff --cached --check` pass.
- The release commit exists on `main`.
- The version tag points at the release commit.

## Known failure handling

The script owns the expected recovery paths. Do not work around these manually:

- Native Git progress written to stderr must not be treated as a script failure when Git exits successfully.
- Release file edits before commit are transactional; if a replacement, validation, staging, or commit step fails, the script restores the release files it touched.
- Regex replacements are counted deterministically by matching before writing, not by mutating callback closure state.
- If a previous run created the release commit locally but failed while pushing, rerun the same script. It should resume from the local release commit and push the matching tag instead of bumping again.
- If the Git LFS pre-push hook fails because the local shell cannot fork, the script may retry with `--no-verify` only after `git lfs status` confirms there are no LFS objects pending for the release.

Stop and report the blocker only when the script reports a non-recoverable repository-state, validation, tag-conflict, or LFS-pending error.

## Guardrails

- Do not manually edit release surfaces or run in-memory variants of the release script.
- Do not include unrelated local changes in the release commit.
- Do not change dependency versions, Neutralino runtime/client versions, converter internals, implementation code, or generated vendor assets as part of a version promotion.
- Do not delete or rewrite existing tags.
- Stop and report the blocker if validation fails.
