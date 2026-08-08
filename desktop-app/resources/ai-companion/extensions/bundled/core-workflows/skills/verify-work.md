---
id: verify-work
name: Verify Work
description: Risk-based checks for implemented changes.
triggers: [verify, test, validate]
allowedModes: [agent]
---
Connect every check to a behavior or boundary changed. Prefer focused automated tests, syntax checks, and vertical scenarios over unrelated full-suite runs. Capture exact failures and determine whether they indicate a product defect, test defect, environment issue, or pre-existing condition.
