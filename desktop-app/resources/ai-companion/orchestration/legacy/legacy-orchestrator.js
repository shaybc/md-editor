/** Adapter around the frozen M0-M11 mode implementations. */

"use strict";

const { runAgentMode } = require("../../modes/agent");
const { runChatMode } = require("../../modes/chat");
const { runPlanMode } = require("../../modes/plan");

class LegacyOrchestrator {
  async run(request, _services, emit) {
    if (request.action === "agent") return runAgentMode(request, emit);
    if (request.action === "plan") return runPlanMode(request, emit);
    return runChatMode(request, emit);
  }
}

module.exports = { LegacyOrchestrator };
