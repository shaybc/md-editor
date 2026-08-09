---
id: map-workspace
name: Map Workspace
description: Build a ranked structural view of files and symbols for repository orientation.
usage: Use when a broad or unfamiliar workspace needs structural orientation before targeted reading.
aliases: [workspace-outline]
triggers: [map workspace, show repository structure, find important files]
argumentHint: "[paths or symbols to emphasize]"
allowedModes: [chat, plan, agent]
routePurpose: quick
allowedTools: [skill_invoke, capability_search, workspace_structure, read_file, search_text, artifact_read]
requiredTools: [workspace_structure]
---
Build the smallest useful structural view, emphasizing user-named paths or symbols. Use the ranking to choose what to inspect next, then read the actual implementation before drawing behavioral conclusions. A structure result contains declarations and relationships, not function bodies or proof that a path executes at runtime.
