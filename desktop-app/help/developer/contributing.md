---
tags: []
---
﻿# Contributing

Use this checklist when changing MD-Editor.

## Before Editing

- Check `git status --short` and identify unrelated changes.
- Locate the feature owner in this developer guide before editing.
- Prefer existing modules and helpers over adding parallel logic.
- Decide whether the change is renderer-only, desktop-native, bridge-backed, converter-related, or documentation-only.

## During Editing

- Keep renderer work responsive; do not block file clicks or tab opening with heavy recursive work.
- Guard every `Neutralino.*` call.
- Use file helpers for opening and saving user documents.
- Use tab helpers for creating, switching, and persisting tabs.
- Use graph extraction helpers when adding link/tag/dependency concepts.
- Use bridge protocols for long-running native subprocess work.
- Keep Help docs current when workflows or architecture change.

## Code Review Checklist

Ask these questions before handing off:

- Does this change have a focused owner file/module?
- Does it preserve existing user data and profile behavior?
- Does it keep large folders responsive?
- Does it avoid leaking desktop-only calls into unguarded code?
- Does it update tests for the changed behavior?
- Does it update user or developer docs when behavior changed?
- Does it avoid touching unrelated dirty worktree files?

## Useful Commands

```bash
# Enter the desktop app folder before running desktop checks.
cd desktop-app

# Validate Help Markdown links and screenshot references.
node --test tests/help-docs.test.js

# Check JavaScript syntax for runtime files and tests.
npm run check:js

# Run the desktop Node test suite.
npm test

# Run a focused Playwright workflow test for the Help and settings menu.
npx playwright test action-menu-settings-advanced-ui.spec.js
```

Previous: [7. Build And Release](07-build-and-release.md)  
Back to [Developer Guide](index.md)
