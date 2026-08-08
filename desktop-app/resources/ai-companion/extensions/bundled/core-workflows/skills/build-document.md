---
id: build-document
name: Build a Document
description: Produce a requested document from workspace material with format-aware verification.
usage: Use for generating or substantially revising a document artifact.
aliases: [generate-document]
triggers: [create document, generate report]
argumentHint: "<document request>"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, list_files, glob_files, search_text, read_file, apply_edit, write_file, run_command, read_active_document, get_document_structure, create_document_tab, get_conversion_export_state, export_active_document]
---
Clarify the requested audience, format, content boundaries, and destination from available context. Inspect relevant source material before drafting. Use an appropriate document capability when available; otherwise create the requested workspace artifact through permitted file tools. Keep factual claims tied to the supplied material, preserve user terminology, and verify both content completeness and rendered structure when the format supports rendering.
