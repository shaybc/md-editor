---
id: companion-settings
name: Update Companion Settings
description: Inspect and update AI Companion preferences through authoritative application capabilities.
usage: Use when the user asks to view or change companion configuration.
aliases: [configure-companion]
triggers: [change companion setting, configure model behavior]
argumentHint: "<setting request>"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, preferences_get, preferences_search, preferences_update]
requiredTools: [preferences_get, preferences_update]
---
Read the current preference before changing it. Resolve the requested setting through the application preference capabilities and preserve all unrelated values. Explain any security or behavior impact that matters, perform only the requested update, then read back the authoritative value and report it.
