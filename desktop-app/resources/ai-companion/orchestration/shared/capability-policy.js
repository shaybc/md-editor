/** Capability policies used by the single autonomous loop. */

"use strict";

const MODE_POLICIES = Object.freeze({
  chat: Object.freeze({ mode: "chat", allowTools: true, allowWrites: false, allowCommands: false, allowDelegation: false, allowPlanReads: false, allowPlanWrites: false, requirePlanPersistence: false }),
  plan: Object.freeze({ mode: "plan", allowTools: true, allowWrites: false, allowCommands: false, allowDelegation: false, allowPlanReads: true, allowPlanWrites: true, requirePlanPersistence: true }),
  agent: Object.freeze({ mode: "agent", allowTools: true, allowWrites: true, allowCommands: true, allowDelegation: true, allowPlanReads: true, allowPlanWrites: true, requirePlanPersistence: false })
});

function resolveCapabilityPolicy(mode) { return MODE_POLICIES[mode] || MODE_POLICIES.chat; }

module.exports = { MODE_POLICIES, resolveCapabilityPolicy };
