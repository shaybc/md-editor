---
id: edit-notebook
name: Edit Notebook
description: Inspect and modify Jupyter notebook cells without disturbing unrelated content.
usage: Use for inserting, replacing, or deleting cells in a workspace notebook.
triggers: [edit notebook, change notebook cell, update ipynb]
argumentHint: "<notebook path and requested cell change>"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, notebook_inspect, notebook_cell_edit, artifact_read]
requiredTools: [notebook_inspect, notebook_cell_edit]
---
Inspect the target notebook immediately before editing it. Identify the cell by its stable ID when available, preserve unrelated cells, outputs, metadata, kernel information, and formatting, and make only the requested cell-level change. If the notebook becomes stale, inspect it again rather than retrying the edit unchanged. After writing, inspect the affected cell and report the actual saved result.
