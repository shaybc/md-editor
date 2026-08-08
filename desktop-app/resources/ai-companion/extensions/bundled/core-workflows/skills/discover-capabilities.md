---
id: discover-capabilities
name: Discover Secondary Tools
description: Find and activate the smallest useful set of secondary tool schemas.
---

# Discover Secondary Tools

The initial tool roster contains common operations. Secondary tools remain available by name without occupying the provider schema roster.

Use `capability_search` when the current task needs a secondary operation:

- Select a known tool exactly with `select:tool_name`.
- Select several known tools with comma-separated names.
- Use short task keywords when you do not know the canonical name.
- Prefix an important keyword with `+` when every result must match it.
- Keep `maxResults` small and activate only tools relevant to the next decisions.

A successful search makes matched schemas callable on the next model turn. Already-active selections are harmless. Missing, prohibited, pending, or unavailable tools are not activated; inspect the returned status and choose another path instead of repeating the same request.

Schema activation changes availability only. It grants no approval, bypasses no permission, performs no operation, and does not prove task completion.
