# PLAN -- Closed-Loop Steering (completion-gated revision)

ASCII only. Companion to PLAN-closed-loop-steering.mermaid.

Turn the completion evaluator from a terminal judge into a control loop: when the verdict is
incomplete, route the failure by arbiter class and steer the agent toward the unmet criteria,
under a bounded budget, until it converges or we stop and report honestly.

## 0. Scope

In scope: the outer revision loop, arbiter-based routing, targeted feedback, reflexion memory,
an iteration budget, and a feature flag. Reuses everything already built (contract, agent loop,
content-grounded verifier, four-way arbiter, evidence ledger, eval log).

Out of scope (separate follow-ons): criteria-as-executable-checks (TDD-for-agents), the
cross-model independent verifier, and long-term accumulated behavioral rules.

## 1. Principles (carried from the prior work)

- Keep-and-modify; no rewrite. Everything new sits behind a flag.
- Deterministic, pure, testable router and message builder; the LLM is only the generator.
- Bounded budget: the worst case is an honest "incomplete" report, never a false success or an
  endless loop.
- Benchmark-verified, then live-verified, one task at a time.

## 2. New seams (data + settings)

SteeringDecision (harness-owned, per iteration):
```
{ action: "continue" | "revise-contract" | "stop",
  reason:  "unsatisfied" | "blocked" | "ambiguity" | "spec-gap" | "converged" | "budget-exhausted",
  feedback: "the steering message injected into the next agent pass (empty when stopping)" }
```

Settings (normalized in BOTH config/defaults.js and js/ai-companion/settings.js for parity, and
surfaced as user controls in the settings screen):
- intentCompletionSteeringEnabled: boolean (master flag for the whole loop). Default TRUE.
  Settings-screen control: a checkbox.
- intentMaxCompletionRevisions: integer budget. Default 3, clamped to a sane range (0-10).
  Settings-screen control: a number input.

Eval-record additions (intent-evaluation.js):
- revisionIterations: how many extra agent passes ran.
- converged: did it reach complete.
- finalReason: the terminating SteeringDecision.reason.

## 3. Phase 0 -- seams (design only, no behavior change)

- 0.1 Define SteeringDecision, the two settings (+ normalization in config/defaults.js AND
  js/ai-companion/settings.js), and the eval-record fields.
- 0.2 Settings-screen UI: add the checkbox and number input to index.html, read/write them in
  js/script.js (load path near the other AI settings inputs; save path into the settings object),
  and keep the browser normalizer (js/ai-companion/settings.js) in parity with config/defaults.js.
- 0.3 Benchmark: add two harness cases with a scripted mock provider -- one that fails the first
  pass then satisfies the unmet criterion after feedback (must converge), and one whose failure
  is "blocked" (must stop, not loop). These are the ruler for Phase 1.

## 4. Phase 1 -- the revision loop

- 4.1 Router (new pure module core/completion-steering.js). Input: assessment + arbiter classes +
  iteration/budget. Output: SteeringDecision. Rules: any blocked -> stop; any ambiguity or
  spec-gap -> revise-contract; else if any unsatisfied and budget left -> continue; complete ->
  stop/converged; no budget -> stop/budget-exhausted. Deterministic. Unit tests.
- 4.2 Feedback + reflexion builder (same module). Input: unmet criteria + arbiter guidance + prior
  attempts. Output: a compact steering message listing each unmet criterion, its guidance, and a
  one-line "last attempt failed because ..." reflexion note per criterion. Pure. Unit tests.
- 4.3 Wire the outer loop in core/agent-tool-loop.js, behind intentCompletionSteeringEnabled:
  after an incomplete assessment, ask the router; on "continue", inject the feedback message,
  run another agent pass (more tool rounds), ACCUMULATE the evidence ledger and message history,
  re-assess, and repeat until stop. Integration test with a mock provider.

## 5. Phase 2 -- contract-fix routing

- 5.1 ambiguity / spec-gap -> AUTO-ASK mid-run: route to the existing clarification path
  (intent-clarification), ask one question, fold the answer into the contract, and continue in the
  same run against the corrected contract (counts against the revision budget).
- 5.2 blocked -> ensure the loop stops and surfaces the blocker (approval / environment); never
  retry a denied/failed tool blindly.

## 6. Phase 3 -- verification

- Unit: router (all classes), builder (feedback + reflexion), and settings normalizer parity
  (config/defaults.js vs js/ai-companion/settings.js -- both accept and clamp the two new fields).
- Integration: the outer loop with a mock provider that converges on iteration 2, and one that
  exhausts budget (honest stop).
- Settings screen: load reflects saved values; save round-trips the checkbox and number input.
- Live: the flagship with the emptied doc -- expect iteration 1 to flag update-doc-if-warranted
  unmet, and iteration 2 (steered) to actually write the doc and converge to complete.

## 7. Rollback

Set intentCompletionSteeringEnabled = false -> exact current behavior (verify once, report). The
budget and reflexion add nothing when the flag is off.

## 8. Risks

- Cost: each revision is another agent pass; bounded by intentMaxCompletionRevisions.
- Correlated generator/evaluator: a same-model loop can converge confidently on wrong; mitigated
  by the deterministic checks and the arbiter, and fully addressed later by the cross-model verifier.
- Non-convergence: always terminates at the budget with an honest incomplete report.

## 9. Locked decisions

1. Loop default: ON (intentCompletionSteeringEnabled default true). Rollback via the flag.
2. Iteration budget default: 3 (intentMaxCompletionRevisions).
3. ambiguity / spec-gap: AUTO-ASK one clarification mid-run and continue in the same run; the
   clarification round counts against the budget.
