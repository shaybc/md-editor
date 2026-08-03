# Update Bundled Diagram Editor Agent

## Purpose

Discover, validate, pin, and materialize a newer stable diagrams.net release for
MD-Editor's fully offline Diagram Editor. This is a developer release workflow;
end users must never download the editor at runtime.

## Required workflow

1. Confirm the worktree status and preserve unrelated changes.
2. Generate a metadata and validation report without changing the pin:

   ```powershell
   .\.tools\discover-latest-drawio-release.ps1
   ```

3. Review the reported current/latest versions, commit SHA, archive SHA-256,
   required webapp entries, upstream `LICENSE`, and the asset restriction in
   upstream `README.md`.
4. Only when the candidate is a stable GitHub release and all validation passes,
   pin and materialize it:

   ```powershell
   .\.tools\discover-latest-drawio-release.ps1 -UpdateAndPackage
   ```

5. Run:

   ```powershell
   npm --prefix desktop-app run verify:drawio
   npm --prefix desktop-app run check:js
   npm --prefix desktop-app test
   git diff --check
   ```

6. Launch MD-Editor offline and verify new/open/edit/save plus current-page PNG
   and all-page PDF export.

## Validation requirements

- Use only the official `jgraph/drawio` GitHub release and commit archive.
- Reject drafts, prereleases, release candidates, beta builds, and nightlies.
- Calculate SHA-256 locally and validate archive paths before extraction.
- Require the webapp entry point, bootstrap/app scripts, configured stencil
  libraries, `LICENSE`, and `README.md`.
- Keep the host overlay limited to offline configuration, CSP, and MD-Editor
  integration. Do not edit upstream minified application code.
- Confirm the materialized marker matches `desktop-app/drawio-vendor.json`.

## License guardrails

draw.io source is Apache-2.0, but upstream README text adds a restriction for use
of the draw.io software/assets in Atlassian products and the Atlassian Marketplace
without written permission. Preserve the upstream LICENSE, README, and MD-Editor
NOTICE in the bundled output. Stop if the license or restriction changes; do not
silently accept new terms.

## Completion report

Report the old/new version, tag, commit, archive URL and SHA-256, validation and
test results, license review, and every changed pin/overlay file. Confirm that the
generated editor remains bundled in releases and makes no runtime network request.

Do not update unrelated vendors, dependencies, application versions, or source
code as part of this workflow.
