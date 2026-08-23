# New Image Dialog

## Summary

Replace the immediate 640×360 image creation from **File → New Image…** with a template chooser modal using MD-Editor’s existing dialog styling.

The dialog will offer:

- Clipboard-sized canvas creation.
- Nine predefined pixel templates from both requested preset families.
- Manual width and height entry.
- Transparent, white, black, current BG color, or custom-color backgrounds.
- No color mode, resolution, units, advanced options, saved/recent templates, or category tabs.

## UX and Behavior

- Show a two-column modal:
  - Left: Clipboard and predefined template cards.
  - Right: width, height, orientation swap, and background controls.
  - Footer: Cancel and Create.
- Provide these duplicate-free presets:
  - 640×480
  - 800×600
  - 1024×768
  - 1280×720
  - 1920×1080
  - 1080×1080
  - 1080×1920
  - 1200×630
  - 512×512
- Inspect the clipboard asynchronously when the dialog opens:
  - If it contains an image, show its dimensions and initially select Clipboard unless the user has already changed a field or preset.
  - Clipboard only supplies dimensions; its pixels are not pasted.
  - If clipboard access fails or contains no image, disable that card without blocking other choices.
- Editing width or height switches the selection to Custom. Dimensions are integer pixels with the existing 16-pixel minimum.
- The orientation button swaps width and height.
- Background options:
  - Transparent — default.
  - White.
  - Black.
  - Current background color — active image tab’s BG swatch, falling back to white.
  - Custom — reveals the native app color picker.
- The existing untitled image naming behavior remains automatic.
- Escape/Cancel closes without creating a tab; Enter/Create validates and creates it. Restore focus to the invoking menu item after cancellation.

## Implementation Changes

- Add a focused `new-image-dialog` module that owns modal state, preset definitions, clipboard-dimension detection, validation, accessibility, and submission.
- Use the existing `reset-modal-overlay` visual system with dedicated responsive styles. Keep errors inline and avoid native browser alert dialogs.
- Change the File-menu handler to open the dialog and submit the resulting creation descriptor to the tabs module.
- Extend `openBlankImageEditorInTab(options)` with:
  ```js
  {
    width,
    height,
    name?,
    background: {
      mode: "transparent" | "solid",
      color?: "#rrggbb"
    }
  }
  ```
  Calls that omit `background` must continue creating an opaque white canvas, preserving current tests and internal callers.
- Carry the descriptor through the blank image source and initialize the layered document accordingly:
  - Transparent creates the normal visible `Background` layer with a full-canvas transparent raster.
  - Solid creates the same layer with a full-canvas raster filled with the resolved color.
  - Store `"transparent"` or the resolved solid color in the document canvas background metadata; do not store the transient `"current"` or `"custom"` UI choice.
- Ensure later canvas enlargement extends the designated Background layer with its document background setting. A transparent document must gain transparent pixels, not the editor’s current BG swatch color.
- Do not alter paste behavior, existing image import, drawing tools, layer placement, save/export behavior, or existing programmatic blank-image defaults.

## Test Plan

- Unit-test preset selection, duplicate removal, manual dimensions, orientation swapping, inline validation, background resolution, cancellation, and submitted descriptors.
- Unit-test clipboard image detection, unavailable/denied clipboard behavior, dimensions-only behavior, and the asynchronous “do not override user interaction” rule.
- Verify legacy `openBlankImageEditorInTab({width, height, name})` calls still create white canvases.
- End-to-end test File → New Image for:
  - Dialog opening without tabs or excluded fields.
  - Clipboard, preset, and manual dimensions.
  - Transparent checkerboard canvas and transparent Background layer.
  - White, black, custom, and current-background-color canvases.
  - Correct canvas status dimensions and one newly created image tab.
  - Cancel/Escape creating no tab.
  - Transparent and solid background behavior after canvas enlargement.

## Expected files to change:

- [new-image-dialog.js](/md-editor/desktop-app/resources/js/image-editor/new-image-dialog.js)
- [index.html](/md-editor/desktop-app/resources/index.html)
- [styles.css](/md-editor/desktop-app/resources/styles.css)
- [script.js](/md-editor/desktop-app/resources/js/script.js)
- [tabs/index.js](/md-editor/desktop-app/resources/js/tabs/index.js)
- [image-editor/index.js](/md-editor/desktop-app/resources/js/image-editor/index.js)
- [object-pixel-editor.js](/md-editor/desktop-app/resources/js/image-editor/layers/object-pixel-editor.js)
- [new-image-dialog.test.js](/md-editor/desktop-app/tests/new-image-dialog.test.js)
- [image-editor-ui.spec.js](/md-editor/desktop-app/tests/e2e/image-editor-ui.spec.js)

## Assumptions

- All dimensions are pixels; resolution and physical-unit conversion remain out of scope.
- Transparent is the initial background choice on every opening.
- No recent-document history or custom-preset persistence is added.
- Clipboard support applies only to clipboard image data.
- Existing image-tab creation APIs and unrelated image-editor behavior remain unchanged.
