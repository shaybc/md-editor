# Stage 7.9 Plan: Structural Command Impact Analysis

## Summary

Add a deterministic command-safety layer between `run_command` tool selection and MD-Editor’s approval/execution systems.

The layer will inspect the actual command, shell dialect, subcommands, operators, redirections, paths, flags, and likely effects. It will classify commands as provably read-only, workspace-mutating, destructive, externally impactful, or unknown.

This remains an authorization mechanism—not agent-loop steering. The model still decides what command to request.

## Implementation Changes

### Command structure inspection

Create a modular `CommandImpactInspector` that produces one immutable analysis for every `run_command` request.

The analysis will contain:

- Detected shell dialect.
- Original-command digest and bounded preview.
- Parsed subcommands and arguments.
- Pipes, chains, redirections, substitutions, heredocs, wrappers, and environment assignments.
- Working-directory changes.
- Read and write paths.
- Dangerous or unsupported constructs.
- Overall impact and authorization recommendation.
- Human-readable reasons and safe grant suggestions.

Support:

- POSIX shells.
- Windows Command Prompt.
- PowerShell.
- Nested `cmd /c`, `powershell -Command`, `pwsh -Command`, `sh -c`, and `bash -c` commands.

The parsers must never execute the supplied command. Unsupported, malformed, timed-out, or excessively complex syntax returns `unknown` and requires approval.

Limit analysis to 50 subcommands, bounded recursion, bounded command length, and bounded diagnostics.

### Deterministic effect classification

Add a command-effect catalog that evaluates executable and argument combinations rather than executable names alone.

Classifications:

- `read-only`: every operation is provably observational.
- `workspace-write`: bounded, reversible workspace-local changes.
- `destructive`: deletion, overwrite, history rewriting, forced operations, or broad cleanup.
- `external-impact`: publishing, deploying, pushing, remote mutation, network posting, or infrastructure changes.
- `sensitive-read`: credentials, protected configuration, keys, or locations outside allowed roots.
- `unknown`: insufficient proof of safety.

Initial command families should cover:

- File inspection and search commands.
- Git inspection and mutation commands.
- Node, npm, pnpm, yarn, Java, Maven, Gradle, and test runners.
- Common file mutation and deletion commands.
- PowerShell file, process, network, and repository operations.
- Command Prompt file and directory operations.

Flag-sensitive examples must distinguish:

- `git status` from `git reset --hard`.
- `git log` from `git push --force`.
- `find ... -print` from `find ... -delete`.
- Version/help output from install, update, deploy, or execution operations.
- Harmless output merging such as `2>&1` from file-writing redirection.

### Structural safety rules

Inspect complete command structure before examining individual subcommands.

Detect and classify:

- `|`, `&&`, `||`, `;`, background execution, and multiline commands.
- Input and output redirections.
- Command and process substitutions.
- Backticks, variable expansion in sensitive positions, dynamic executable names, and evaluation commands.
- `cd` combined with writes, Git operations, or redirection.
- Writes outside the workspace or into protected repository internals.
- Dangerous recursive deletions and broad path targets.
- Shell wrappers, privilege escalation, and commands that launch another shell.
- Excessive parser complexity or subcommand fan-out.

A compound command is automatically allowed only when every component is provably safe. Denial and destructive classifications take precedence over permissive components.

### Approval integration

Analyze `run_command` before constructing its approval descriptor.

Dynamic command descriptors will include:

- Actual normalized command identity.
- Impact classification.
- Affected paths and external targets.
- Reversibility.
- Parser confidence.
- Safe grant boundary.
- Destructive warnings.

Use this order:

1. Managed shell policy.
2. Structural command analysis.
3. Protected-resource and explicit-denial checks.
4. Existing exact grants.
5. Proven read-only automatic allowance when enabled.
6. Permission-mode decision.
7. Constrained risk advice for eligible ambiguous local actions.
8. User approval.

Known destructive, external, sensitive, and unknown commands cannot be automatically approved by model advice.

Update the risk advisor to receive a bounded, credential-redacted representation of the actual command analysis. Its output remains advisory and cannot weaken deterministic or managed-policy restrictions.

### Automatic command setting

Retain `agentAutoRunCommands` for compatibility, but change its meaning:

- It may automatically run only commands classified as provably read-only.
- The command must still satisfy sandbox, path, denial, and managed-policy restrictions.
- It must never bypass the approval gateway.
- Unknown, write-capable, destructive, external, or sensitive commands require the normal authorization path.

### Grants and denial protection

Replace the generic `run_command` resource with command-aware grant identities.

Grant options may include:

- This exact action.
- This exact normalized command for the task.
- A safe executable/subcommand prefix only when the inspector proves that arguments cannot turn it into arbitrary execution.

Do not offer reusable prefix grants for shell launchers, wrappers, substitutions, redirections, destructive commands, or unknown syntax.

Apply grants and denials to every parsed subcommand. An allowed compound command must not conceal a denied subcommand.

Include the analysis digest in denial fingerprints so formatting-only changes can normalize consistently without allowing materially different commands.

### Execution integrity and audit

Carry the approved analysis to execution and verify that the command digest still matches before launching it.

Audit records should include:

- Shell dialect.
- Impact classification.
- Analysis reasons.
- Subcommand count.
- Bounded affected paths.
- Approval source.
- Whether execution was automatically allowed.
- Analysis and command digests.

Continue using the existing command runner, timeout, cancellation, output limits, and security policy. Typed shell-free execution remains preferred where an existing typed tool can perform the operation.

### Approval UI

Extend the existing approval dialog to show:

- Shell dialect and complete bounded command preview.
- Impact classification.
- Destructive or external-impact warning.
- Affected paths and targets.
- Parsed subcommands for compound commands.
- Why approval is required.
- Only grant options validated by the inspector.

Keep the existing MD-Editor appearance and approval workflow.

## Public Interfaces

Add:

```js
CommandImpactInspector.inspect({
  command,
  workspaceRoot,
  workingDirectory,
  platform,
  configuredShell,
  signal
})
```

The result includes:

```js
{
  version,
  dialect,
  commandDigest,
  preview,
  subcommands,
  operators,
  redirections,
  affectedPaths,
  externalTargets,
  impact,
  confidence,
  reasons,
  canAutoRun,
  grantBoundary
}
```

Extend:

- `authorizeTool(..., controls.commandAnalysis)`
- `approvalCapabilities.describe(..., { commandAnalysis })`
- `PermissionModePolicy.resolve(..., { commandAnalysis })`
- `ActionRiskAdvisor.evaluate(descriptor, { commandAnalysis, args })`
- Approval events with bounded `commandImpact` metadata.

No new feature flag is introduced.

## Test Plan

- Correctly distinguish quoted operators from structural operators.
- Parse POSIX, Command Prompt, and PowerShell commands.
- Recursively inspect nested shell invocations.
- Recognize safe Git inspection and destructive Git operations.
- Recognize read-only file inspection versus deletion or overwrite.
- Detect output redirection, including redirection after a pipe.
- Treat harmless stream merging separately from file writes.
- Detect substitutions, dynamic execution, evaluation, wrappers, and privilege escalation.
- Validate redirect and mutation paths against workspace and protected boundaries.
- Reject dangerous home, root, workspace-root, and broad recursive deletion targets.
- Require approval for malformed, unsupported, timed-out, or excessively complex commands.
- Cap compound-command fan-out without entering a parsing loop.
- Ensure one unsafe subcommand elevates the entire compound command.
- Ensure explicit denials take precedence over grants and automatic execution.
- Verify automatic execution permits only proven read-only commands.
- Verify the risk advisor receives redacted command details and cannot override deterministic restrictions.
- Verify approval grants cannot authorize materially different arguments.
- Verify the approved digest matches the executed command.
- Cover cancellation, execution failure, audit records, and restored denial state.
- Preserve existing typed tools, structured execution, permissions, provider routing, and ordinary autonomous-loop tests.

## Expected files to change:

- [action-risk-advisor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/permissions/action-risk-advisor.js)
- [permission-mode-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/permissions/permission-mode-policy.js)
- [approval-gateway.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/approval-gateway.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [approval-capability-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/approval-capability-registry.js)
- [agent-approval-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-approval-policy.js)
- [denial-ledger.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/permissions/denial-ledger.js)
- [workspace-tools.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/tools/workspace-tools.js)
- New command-impact modules under [security](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/security)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [activity-renderer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)
- [ai-agent-approval-policy.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-agent-approval-policy.test.js)
- [ai-execution-security.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-execution-security.test.js)
- [ai-companion-autonomous-memory-permissions-routing.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-memory-permissions-routing.test.js)
- [ai-companion-approval-ui.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-approval-ui.test.js)

## Assumptions

- Existing security policy, approval storage, denial protection, audit logging, sandbox gating, cancellation, and execution limits remain authoritative.
- The command inspector is deterministic and independently implemented.
- Model-based risk advice is supplemental and fail-closed.
- Unsupported syntax requires approval rather than being rejected automatically.
- Existing settings remain readable; only automatic-command semantics become safer.
- This work does not introduce semantic task evaluation, acceptance criteria, or agent-loop action policing.