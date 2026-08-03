---
name: diagnostic-sandbox
description: Isolate and experimentally solve difficult implementation problems before changing production code. Use when implementing or debugging a feature and the correct solution is unclear, environment-dependent, difficult to reproduce, or would otherwise require speculative changes to the real project.
---

# Diagnostic Sandbox

Use a disposable test environment to prove the solution, then apply only the verified result to the real task.

## Ask Before Experimenting

When the solution is not obvious and safely verifiable from existing evidence:

1. Explain briefly why an isolated experiment would reduce uncertainty.
2. Ask the user for permission to create and use a temporary test environment.
3. State that temporary artifacts will be deleted after the experiment.
4. Do not create the environment until the user approves.

Do not invoke this workflow for routine fixes whose cause and validation are already clear.

Use a concise approval request such as:

> The correct fix is not yet proven. May I create a disposable test environment, reproduce the behavior there, try alternatives until one is verified, remove the temporary artifacts, and then apply the proven solution to the real project?

## Run the Experiment

After approval:

1. Define the smallest reproducible behavior and a concrete success condition.
2. Create the environment under a dedicated temporary directory or a clearly named test-only workspace path.
3. Reproduce the failure before testing fixes whenever practical.
4. Match the relevant production versions, commands, configuration, operating-system behavior, and process boundaries.
5. Change one meaningful variable at a time and retain the output needed to compare attempts.
6. Continue testing reasonable alternatives until one reliably meets the success condition or the experiment becomes blocked.
7. Repeat the successful case to guard against a one-time result.

Do not modify production code merely to facilitate the experiment. Do not use live credentials, production data, or external writes unless the user separately authorized them.

## Integrate the Proven Solution

Once the experiment proves a solution:

1. Summarize the result and the evidence that distinguishes it from failed alternatives.
2. Apply the smallest equivalent change to the real project.
3. Preserve existing architecture and unrelated behavior.
4. Run the project's focused tests plus a production-equivalent verification of the repaired path.
5. If the isolated result does not transfer, return to the experiment instead of layering speculative changes onto production.

If no solution is proven, do not integrate a guess. Report the attempts, evidence, and remaining blocker.

## Clean Up

After integration and verification, or when abandoning the experiment:

1. Resolve and verify the exact temporary path.
2. Delete only artifacts created for this experiment.
3. Never use a broad or ambiguous recursive-delete target.
4. Keep only results intentionally incorporated into the real project.
5. Tell the user what was removed and summarize the final verified solution.
