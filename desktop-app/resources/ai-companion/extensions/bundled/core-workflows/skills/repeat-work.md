---
id: repeat-work
name: Repeat Work
description: Create, inspect, or cancel a durable future autonomous task.
usage: Use only when the user explicitly requests delayed or recurring execution.
aliases: [schedule-work]
triggers: [schedule a task, repeat a task, cancel a schedule]
argumentHint: "<timing and task>"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, schedule_create, schedule_list, schedule_cancel]
requiredTools: [schedule_create, schedule_list, schedule_cancel]
---
Determine whether the user wants immediate work, a schedule, or both. When immediate execution is requested, invoke the most appropriate advertised workflow first and finish that bounded task before scheduling its continuation. For creation, preserve the user's task wording, translate the requested timing into minutes, and state whether it repeats. Never invent recurring execution from an ordinary task request. Use the scheduling capability and return its durable identifier, next run time, and expiration. For cancellation, list schedules when identity is unclear and cancel only the selected entry.
