const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const panelSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/panel.js"), "utf8");
const stylesSource = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
const approvalSettingsSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/approval-settings.js"), "utf8");
const rendererBridgeSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/neutralino-ai-bridge.js"), "utf8");
const desktopBridgeSource = fs.readFileSync(path.resolve(__dirname, "../resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs"), "utf8");
const indexSource = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");

test("AI Companion approval cards use compact labels and detail review", () => {
  assert.match(panelSource, /const APPROVAL_PILL_MAX_CHARS = 18/);
  assert.match(panelSource, /function getApprovalActionLabel\(event = \{\}\)/);
  assert.match(panelSource, /event\.approvalKind === "task-limit"[\s\S]*return "Continue task"/);
  assert.match(panelSource, /case "preferences_update":[\s\S]*return "Change settings"/);
  assert.match(panelSource, /case "run_command": return "Run command"/);
  assert.match(panelSource, /case "write_file": return "Write"/);
  assert.match(panelSource, /case "create_document_tab": return "Create document"/);
  assert.match(panelSource, /function truncateApprovalPillText\(value\)/);
  assert.match(panelSource, /APPROVAL_PILL_MAX_CHARS - 3/);
  assert.match(panelSource, /reviewButton\.addEventListener\("click", \(\) => reviewApprovalChanges\(event, actionLabel\)\)/);
});

test("AI Companion approval cards explain the requested action", () => {
  assert.match(panelSource, /function getApprovalActionAnalysis\(event = \{\}\)/);
  assert.match(panelSource, /function getApprovalActionDescription\(event = \{\}\)/);
  assert.match(panelSource, /case "write_file":[\s\S]*This does not delete the file\./);
  assert.match(panelSource, /case "create_document_tab": return "Create and save a workspace document at the displayed path\."/);
  assert.match(panelSource, /description\.className = "ai-companion-approval-action-description"/);
  assert.match(stylesSource, /\.ai-companion-approval-action-description/);
  assert.match(panelSource, /function getApprovalReasonDescription\(event = \{\}\)/);
  assert.match(panelSource, /event\.approvalKind === "task-limit"\) return "Continue the current task after reaching its configured limit\."/);
  assert.match(panelSource, /reason\.textContent = `Task goal: \$\{approvalReason\}`/);
  assert.match(panelSource, /description\.textContent = `This action: \$\{actionDescription\}`/);
  assert.match(panelSource, /outcome\.textContent = outcomeDescription \? `Outcome: \$\{outcomeDescription\}`/);
  assert.match(panelSource, /warning\.textContent = limitations \? `Limitations: \$\{limitations\}`/);
  assert.match(panelSource, /addSection\("Task goal", getApprovalReasonDescription\(event\)\)/);
  assert.match(panelSource, /addSection\("This action", getApprovalActionDescription\(event\)\)/);
  assert.match(panelSource, /addSection\("Outcome", analysis\.outcomeDescription/);
  assert.match(panelSource, /addSection\("Limitations", analysis\.limitations/);
  assert.match(panelSource, /addSection\("Resource", analysis\.resourcePath/);
  assert.match(panelSource, /actionAnalysis\.canApprove === false \? "Action cannot be approved"/);
  assert.match(panelSource, /analysis\.operation !== "no-op" && event\.compare\.changed !== false/);
  assert.match(stylesSource, /\.ai-companion-approval-warning/);
  assert.match(stylesSource, /\.ai-companion-approval-operation/);
  assert.match(stylesSource, /\.ai-companion-approval\.blocked/);
});

test("AI Companion approval cards show structural command impact details", () => {
  assert.match(panelSource, /Command impact/);
  assert.match(panelSource, /Parsed operations/);
  assert.match(panelSource, /Affected paths/);
});

test("AI Companion approval cards place messages above a shared button footer", () => {
  assert.match(panelSource, /function getApprovalFooter\(row\)/);
  assert.match(panelSource, /getApprovalFooter\(row\)\.appendChild\(responseElement\)/);
  assert.match(panelSource, /getApprovalFooter\(row\)\.appendChild\(actions\)/);
  assert.match(stylesSource, /\.ai-companion-approval \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(stylesSource, /\.ai-companion-approval-footer \{[\s\S]*justify-content: flex-end/);
});

test("AI Companion approval responses replace controls and are persisted", () => {
  assert.match(panelSource, /function createApprovalResponse\(decision, instructions, event = \{\}, grantOption = null\)/);
  assert.match(panelSource, /label = normalizedDecision === "approve" \? "Continued" : "Stopped"/);
  assert.match(panelSource, /label = `Sent instructions: \$\{text\}`/);
  assert.match(panelSource, /respondedAt: Date\.now\(\)/);
  assert.match(panelSource, /if \(savedEvent\) savedEvent\.response = response/);
  assert.match(panelSource, /const row = createApprovalCard\(event, \{ interactive: false \}\);[\s\S]*entry\.renderer\?\.appendExternalActivity\?\.\(row\)/);
  assert.match(panelSource, /event\.response\?\.label/);
  assert.match(panelSource, /instructionInput\.remove\(\)/);
  assert.match(panelSource, /actions\.remove\(\)/);
});

test("AI Companion continue approvals keep continue-stop controls without instructions", () => {
  assert.match(panelSource, /const allowInstructions = event\.allowInstructions !== false/);
  assert.match(panelSource, /approveButton\.textContent = event\.approveLabel \|\| "Approve"/);
  assert.match(panelSource, /rejectButton\.textContent = event\.rejectLabel \|\| "Reject"/);
  assert.match(panelSource, /instructButton\.textContent = "Send"/);
  assert.match(panelSource, /if \(allowInstructions\)[\s\S]*actions\.append\(instructButton\)/);
  assert.match(panelSource, /decision === "instruct" && allowInstructions/);
});

test("AI Companion restored approvals remain read-only and recovery uses autonomous inspection", () => {
  assert.match(panelSource, /function canResumeSavedApproval\(record, events, index\)/);
  assert.match(panelSource, /isUnansweredApprovalEvent\(event\) && !hasSavedEventAfter\(events, index\) && !hasSavedTaskAfter\(record\)/);
  assert.match(panelSource, /createInterruptedApprovalCard\(entry, event, \{ showResume: options\.canResumeApproval === true \}\)/);
  assert.match(panelSource, /The app closed before this request was answered\. Resume the task to approve, reject, or provide instructions\./);
  assert.match(panelSource, /reviewButton\.addEventListener\("click", \(\) => reviewApprovalChanges\(event, actionLabel\)\)/);
  assert.match(panelSource, /if \(options\.showResume === false\) \{[\s\S]*getApprovalFooter\(row\)\.appendChild\(actions\);[\s\S]*return row/);
  assert.match(panelSource, /function canResumeRun\(record = \{\}\)/);
  assert.match(panelSource, /record\.recoveryInspection\?\.canResume === true/);
  assert.match(panelSource, /resumeRun: true/);
  assert.match(panelSource, /runRecoveryInspect/);
  assert.doesNotMatch(indexSource, /interrupted-task-resume\.js/);
});

test("AI Companion approval cards expose request-bound grant choices safely", () => {
  assert.match(panelSource, /const grantOptions = Array\.isArray\(event\.grantOptions\)/);
  assert.match(panelSource, /className = "ai-companion-approval-grant-menu"/);
  assert.match(panelSource, /await confirmApprovalGrant\(event, option\)/);
  assert.match(panelSource, /grantOption\?\.id \|\| ""/);
  assert.match(panelSource, /await options\.onRespond\?\.\(decision, instructions, response, grantOption\?\.id \|\| ""\)/);
  assert.match(panelSource, /The approval could not be saved\. Please try again\./);
  assert.match(stylesSource, /\.ai-companion-approval-grant-options/);
  assert.match(stylesSource, /\.ai-companion-grant-acknowledgement/);
});

test("approval bridge validates request-bound options and acknowledges persistence", () => {
  assert.match(rendererBridgeSource, /respondApproval\(approvalId, decision, instructions = "", grantOptionId = ""\)/);
  assert.match(rendererBridgeSource, /if \(result\.accepted !== true\) throw new Error/);
  assert.match(desktopBridgeSource, /approvalPolicy\.validateGrantOption/);
  assert.match(desktopBridgeSource, /The workspace approval could not be saved/);
  assert.match(desktopBridgeSource, /pendingApprovals\.delete\(approvalId\)[\s\S]*approval\.resolve\(decision\)/);
});

test("AI Approvals settings list, revoke, import, and validate profile-owned rules", () => {
  assert.match(indexSource, /id="settings-ai-approval-rule-list"/);
  assert.match(indexSource, /id="settings-ai-approval-rules-json"/);
  assert.match(approvalSettingsSource, /approvalGrantsList/);
  assert.match(approvalSettingsSource, /approvalGrantRevoke/);
  assert.match(approvalSettingsSource, /approvalLegacyImport/);
  assert.match(approvalSettingsSource, /parsed\?\.version !== 2 \|\| !Array\.isArray\(parsed\.rules\)/);
});
test("AI Companion approval styles include review, modal, and response state", () => {
  assert.match(stylesSource, /\.ai-companion-approval-header/);
  assert.match(stylesSource, /\.ai-companion-approval-review/);
  assert.match(stylesSource, /\.ai-companion-approval-response/);
  assert.match(stylesSource, /\.ai-companion-approval-modal/);
  assert.match(stylesSource, /\.ai-companion-approval-modal-body/);
  assert.match(stylesSource, /\.ai-companion-approval\.instructed/);
});
