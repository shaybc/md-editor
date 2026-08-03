---
tags: []
---
/**
 * AI Companion UI ownership notes.
 */

# AI Companion UI

The runtime UI modules are implemented as vanilla JavaScript IIFEs in
`desktop-app/resources/js/ai-companion/` so they can follow md-editor's existing script-tag load
order and settings-screen conventions.

This directory marks the AI Companion UI boundary for future upstream-inspired
updates. Keep product-facing panel, settings, and autocomplete UI changes routed
through the `desktop-app/resources/js/ai-companion/` modules instead of mixing them into the
agent core or provider adapters.
