# Redesign the UI/UX for agent-generated user questions.

The current question UI appears inline inside the agent activity/tool log. Change it so that questions requiring user input are visually distinct, immediately noticeable, compact, and clearly actionable.

## Requirements

### 1. Separate user questions from normal activity
- Do not make the question look like another tool/activity-log entry.
- Treat it as a dedicated interaction state.
- Visually elevate it above surrounding activity.
- The user should immediately understand: "The agent is waiting for me."

### 2. Keep it compact
Avoid a large card with excessive vertical spacing.

Prefer a compact structure similar to:

- Small status/header: `Input required`
- Main question
- Optional short explanation/context
- Choices
- Primary/secondary actions

Do not repeat the same message in multiple headings.

### 3. Strong visual hierarchy
The question itself should be the most prominent text.

Suggested hierarchy:

`Input required`

**Which project root should be used?**

`test-folders.txt will be created in this directory.`

○ `C:\GitHub\md-editor\desktop-app`  
○ `C:\GitHub\md-editor`  
○ `Enter another path...`

`Continue`  `Cancel`

The explanation should be visually secondary to the actual question.

### 4. Make the waiting state obvious
While a question is pending:

- Clearly indicate that execution is paused/waiting for user input.
- The pending question should remain visible even if additional activity-log items exist around it.
- Avoid allowing it to visually disappear into the activity stream.
- Consider automatically scrolling/focusing the pending question when it appears.

### 5. Prefer a dedicated interaction area
Where practical, render pending user interaction separately from historical agent activity.

Good options, in preferred order:

1. A compact interaction panel directly above the chat/task input area.
2. A sticky card at the bottom of the activity area.
3. A strongly differentiated inline card if architectural constraints require it.

The interaction should feel closer to Codex/Claude Code-style approval/input UX than to a log message.

### 6. Choice design
For predefined choices:

- Make the entire option row clickable, not just the radio button.
- Highlight the selected option clearly.
- Allow keyboard navigation.
- Double-click should not be required.
- If there are only 2–4 simple choices, consider button-style choices instead of radio buttons.

For free-text alternatives:

- Selecting `Enter another path...` should immediately reveal/focus a text input.
- Do not require the user to select an option and then search elsewhere for an input field.

### 7. Action buttons
- Use one obvious primary action such as `Continue`, `Confirm`, or `Submit`.
- Use a visually secondary action such as `Cancel` or `Decline`.
- Keep buttons close to the choices.
- Disable the primary action when required input is incomplete.
- Pressing Enter should submit when appropriate.
- Escape may cancel/decline where safe.

### 8. Reduce unnecessary chrome
Remove or minimize UI that does not help answer the question:

- Large empty padding
- Repeated headings
- Excessive borders
- Tool/debug terminology
- Internal function names such as `request_user_choice`
- Large activity-card framing around the interaction

The user-facing interaction should not expose implementation details.

### 9. Preserve activity history
Do not remove the underlying activity-log event.

After the user responds:

- Collapse the interaction into a compact historical entry.
- Show the question and selected answer in a concise form.
- Example:

  `Asked which project root to use → desktop-app`

- The full interaction UI should no longer occupy significant space.

### 10. Pending-state styling
Use a subtle but clear visual treatment:

- Slightly elevated/background-separated surface
- Accent border or indicator
- Clear `Input required` status
- Higher contrast than ordinary activity entries

Do not use aggressive warning/error styling unless the question actually represents a warning.

### 11. Multiple pending questions
Normally show only the current actionable question expanded.

If multiple interactions can be pending:
- Make the current one prominent.
- Show others as a small queue/count rather than several large cards.

### 12. Responsive behavior
The interaction must work well when:
- the IDE window is narrow,
- the right sidebar is visible,
- paths or option labels are very long.

Long paths should truncate intelligently but expose the full value via tooltip/copy action where useful.

### 13. Accessibility
- Proper focus management when the question appears.
- Visible keyboard focus.
- Radio/button controls must have accessible labels.
- Do not communicate selection/state using color alone.
- Maintain sufficient contrast in dark mode.

## Target UX

The interaction should feel like a temporary prompt interrupting the agent workflow, not like another line in the execution trace.

The intended visual sequence is:

Agent activity
↓
**Agent needs input**
[compact, highly visible question UI]
↓
User answers
↓
Agent continues

Once answered, the question becomes a small historical activity item and the main interface returns to normal.

Use the application's existing design system and dark-theme styling. Do not redesign unrelated parts of the agent activity UI.