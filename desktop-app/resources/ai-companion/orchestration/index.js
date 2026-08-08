/** Public autonomous orchestrator boundary. */

"use strict";

const { AutonomousOrchestrator } = require("./autonomous/autonomous-orchestrator");

/** Stable public entry point: CompanionOrchestrator.run(request, services, emit). */
async function run(request, services, emit) { return new AutonomousOrchestrator().run(request, services, emit); }

const CompanionOrchestrator = Object.freeze({ run });

module.exports = { CompanionOrchestrator, run };
