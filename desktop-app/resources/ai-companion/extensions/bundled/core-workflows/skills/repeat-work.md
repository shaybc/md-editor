---
id: repeat-work
name: Repeat Work
description: Create, inspect, or cancel a future autonomous task.
usage: Use only when the user explicitly requests delayed or recurring execution.
aliases: [schedule-work]
triggers: [schedule a task, repeat a task, cancel a schedule]
argumentHint: "<timing and task>"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, schedule_create, schedule_list, schedule_cancel]
requiredTools: [schedule_create, schedule_list, schedule_cancel]
---
Determine whether the user wants immediate work, a future schedule, or both. Preserve the user's task wording and choose either a bounded minute delay or a five-field local-time calendar expression. Use one-shot execution for reminders and recurring execution only when repetition was explicitly requested. Schedules are session-only unless the user clearly asks them to survive application restarts; set durable only in that case. State the identifier, human schedule, next run, durability, and expiration. Never infer scheduled execution from an ordinary task request. For cancellation, list schedules when identity is unclear and cancel only the selected entry.
