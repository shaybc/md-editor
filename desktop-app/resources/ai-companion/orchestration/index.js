/** Public orchestrator boundary and migration factory. */

"use strict";

const { AutonomousOrchestrator } = require("./autonomous/autonomous-orchestrator");
const { LegacyOrchestrator } = require("./legacy/legacy-orchestrator");

function createCompanionOrchestrator(request) {
  return request.settings?.agentLoopArchitecture === "autonomous" ? new AutonomousOrchestrator() : new LegacyOrchestrator();
}

/** Stable public entry point: CompanionOrchestrator.run(request, services, emit). */
async function run(request, services, emit) { return createCompanionOrchestrator(request).run(request, services, emit); }

const CompanionOrchestrator = Object.freeze({ run });

module.exports = { CompanionOrchestrator, createCompanionOrchestrator, run };
