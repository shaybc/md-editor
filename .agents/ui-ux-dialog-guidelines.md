# UI/UX Dialog Guidelines

Use these rules when creating or changing MD-Editor dialogs, modals, command sheets, and result summaries.

References:
- W3C WAI-ARIA Authoring Practices, Dialog Modal Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C WCAG Technique H102, HTML modal dialog behavior: https://www.w3.org/WAI/WCAG22/Techniques/html/H102
- Material Design dialog guidance: https://m2.material.io/develop/web/components/dialogs

## Layout

- Size dialogs for the job. Operational dialogs that show paths, commands, logs, diagnostics, or preview text should use a wider work-surface layout instead of a narrow alert layout.
- Keep compact confirmation dialogs narrow, but make command configuration dialogs at least `720px` on desktop when they contain code or structured metadata.
- Use responsive constraints such as `width: min(..., calc(100vw - ...))` and `max-height: calc(100vh - ...)` so dialogs never overflow the viewport.
- Prefer two-column layouts on desktop when separating configuration controls from contextual summaries or command previews. Collapse to one column on mobile.
- In two-column dialogs, use explicit left/right column containers or explicit row placement so both columns start on the same row. Do not rely on loose grid item flow when it creates diagonal gaps between form controls and read-only preview content.
- Avoid cramped cards. If a value may be a path or command, give it enough width and use `overflow-wrap: anywhere`.

## Actions

- Use the app's existing styled button classes. Never use browser-default buttons.
- Dialog actions should be side-by-side when labels are short, with the confirming action on the right.
- Buttons should be compact in command/configuration dialogs: approximately `34-36px` tall, with modest horizontal padding and no forced full-width desktop layout.
- Full-width stacked buttons are reserved for narrow mobile layouts or long labels.

## Accessibility

- Dialogs must have `role="dialog"`, `aria-modal="true"`, and a visible title referenced by `aria-labelledby`.
- Include a visible close or cancel action in the tab sequence.
- When a dialog contains substantial structured content, focus the title or first meaningful control rather than jumping past the content.
- Escape should dismiss non-destructive dialogs.

## Visual Tone

- Match MD-Editor's dark, utilitarian interface: restrained borders, clear hierarchy, dense but readable spacing, and no decorative gradients or oversized hero-style typography.
- Prefer clear labels, structured metadata, and direct command previews over explanatory marketing copy.