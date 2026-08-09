---
id: review-changes
name: Review Changes
description: Defect-focused review of local modifications.
triggers: [review, audit, inspect changes]
allowedModes: [plan, agent]
routePurpose: review
---
Read the diff and the surrounding contracts. Look for incorrect assumptions, missed call sites, state or lifecycle errors, unsafe boundaries, and missing regression coverage. Lead with findings ordered by severity; if none are found, say so and identify residual testing risk.
