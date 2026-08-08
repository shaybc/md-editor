---
id: create-plan
name: Create an Implementation Plan
description: Creates, saves, or revises a staged implementation plan in the plan repository.
triggers: [create plan, save plan, update plan, revise plan, plan change, architecture]
allowedModes: [plan, agent]
---
Inspect before planning. Describe the target behavior, module responsibilities, interfaces, migration order, compatibility strategy, tests, acceptance gates, and expected files. Make dependencies and rollback points explicit. Keep implementation details precise enough that another worker can execute without rediscovery.

When the user asks to save a new plan, call `plan_create` with the complete Markdown in `body`. When revising a saved plan, use `plan_read` when needed and then call `plan_update` with the existing id or path and the complete revised `body`. Treat the returned id and path as the only proof that repository persistence succeeded. Never claim that a plan was saved or updated when the repository tool failed or was not called.
