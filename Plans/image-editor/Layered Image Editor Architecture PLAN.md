# Layered Image Editor Architecture

## Summary

Replace the image editor’s single destructive bitmap with a versioned layered document. Named layers will contain ordered editable objects, raster content, or both; groups will organize layers. Rendering, selection, history, persistence, and export will all operate through this document model.

## Document Architecture

### Native project format

Introduce `.mdimage`, MIME type `application/vnd.md-editor.image+zip`.

The JSZip-based archive will contain:

- `manifest.json`: versioned document structure, canvas properties, groups, layers, editable objects, and asset references.
- `assets/<id>.png`: transparent raster content.
- `preview.png`: flattened visible preview for thumbnails and recovery.
- `metadata.json`: application/version information for diagnostics and future migration.

Raster images opened from PNG, JPEG, or WebP become a new document containing one raster “Background” layer. Once edited, Ctrl+S requires saving as `.mdimage`; the original raster file is never overwritten implicitly. A separate “Export flattened image…” action produces PNG, JPEG, or WebP from visible content.

Old PNG session drafts remain readable and migrate into a one-layer document. New drafts use the `.mdimage` archive format.

### Versioned model

Use stable UUIDs and an explicit schema version:

- `ImageDocument`
  - Canvas dimensions and background.
  - Ordered root groups/layers.
  - Asset registry.
  - Schema version and extension data.
- `LayerGroup`
  - Name, visibility, lock, opacity, blend mode, children.
- `ContentLayer`
  - Name, visibility, lock, opacity, blend mode, ordered content objects.
  - Reserved `effects` and `mask` properties for future filters and masks.
- `ContentObject`
  - Shared ID, name, visibility, lock, opacity, transform, bounds, and type-specific payload.
  - Types: raster, shape/path, and text.

Panel order is top-to-bottom; rendering is bottom-to-top. Hidden content is excluded from compositing, hit testing, copying, and export. Locked content remains visible but cannot be edited, transformed, deleted, merged, or flattened without confirmation.

### Content behavior

- Shapes, paths, curves, grids, callouts, stars, and similar tools retain their geometry and stroke/fill properties.
- Text retains content, box, font, size, emphasis, colors, and transform.
- Clipboard images, freehand strokes, bucket fills, and pixel selections become transparent raster objects.
- Objects may extend outside the canvas; rendering and export clip them without deleting their off-canvas pixels.
- Canvas resize changes document bounds without cropping layer data.
- Selecting an editable shape or text object restores its tool-specific guides and properties.

## Rendering, Selection, and History

### Rendering pipeline

Introduce a compositor independent of the visible canvas:

1. Render each object into its layer surface.
2. Composite objects in layer order.
3. Reserve the layer-level mask/effect stage.
4. Apply layer opacity and blend mode.
5. Composite groups recursively.
6. Paint the cached visible result into the presentation canvas.
7. Draw selection and tool guides only on the overlay canvas.

Only `normal` blending ships initially, but blend mode is part of the schema and compositor interface. Dirty-region and layer caching prevent every pointer movement from rerendering unaffected layers.

All drawing and paste flows must create document transactions; tools must no longer write directly into the presentation canvas.

### Selection rules

The Select tool defaults to object selection:

- Click selects the top visible, unlocked object under the pointer.
- Shift-click toggles objects in a multi-selection.
- Alt-click cycles through overlapping objects.
- Dragging empty canvas creates an object marquee.
- Panel selection and canvas selection stay synchronized.
- Selecting a layer row targets the whole layer; selecting an expanded object row targets that object.
- Transforming multiple objects uses their combined bounds.

Preserve pixel-region selection as a Select-tool dropdown mode named “Pixel marquee.” It operates on the active layer’s rendered content and creates a raster object when lifted, moved, resized, rotated, copied, or cut.

### Transactional history

Replace full-canvas pixel history with document transactions:

- Structural and property changes store before/after document metadata.
- Raster assets use immutable, content-addressed blobs shared between history entries.
- Asset reference counting prevents duplicate copies and removes unreachable assets.
- A complete gesture, placement, rename, reorder, visibility change, merge, or group operation is one undo step.
- Undo/redo restores document content and the relevant selection.
- Keep the existing 50-entry and 128 MB limits, calculated from unique retained raster assets plus metadata.

## Layers Panel and Placement UX

### Floating panel

Add a Layers button to the image-editor toolbox.

The panel overlays the right side of the canvas without changing scrollable canvas dimensions. It is vertically resizable and has three per-tab states:

- Expanded: full hierarchy and controls.
- Minimized: title bar only.
- Hidden: removed from the canvas; the toolbox Layers button reveals it expanded.

Persist panel state, height, expanded rows, active selection, and placement mode in tab/session UI state, not in the `.mdimage` document.

Panel rows include:

- Disclosure arrow.
- Visibility toggle.
- Thumbnail.
- Editable name.
- Lock indicator.
- Opacity control for the current selection.
- Drag handle and insertion indicator for reordering.

The footer includes New Layer, New Group, Duplicate, Merge Down, Delete, and the placement selector.

### New-content placement

Use a sticky segmented selector:

- `New layer` — default.
- `Active layer`.

Behavior:

- New layer creates a named layer immediately above the active layer and adds the completed object.
- Active layer appends the object above existing content in the selected unlocked layer.
- If a group is selected, a new child layer is created inside that group.
- If the selected layer is locked, hidden, missing, or incompatible, create a new layer above it and show a brief non-blocking explanation.
- Pasted/generated content remains provisional and floating until placement, then enters the chosen target in one undoable transaction.
- Brush gestures create one raster object per completed stroke, not per pointer event.
- In New layer mode, bucket fill samples the visible composite and writes a transparent raster object to a new layer.
- In Active layer mode, bucket fill samples and updates the active layer composite only.

Use meaningful automatic names such as “Pasted image,” “Text,” “Rectangle,” “Brush stroke,” and numbered duplicates. Double-clicking a panel name enables inline rename.

## Layer Operations

Ship the complete foundation:

- Create, rename, duplicate, reorder, hide/show, lock/unlock, adjust opacity, and delete.
- Multi-select contiguous or disjoint rows.
- Group selected sibling layers while preserving order.
- Ungroup while preserving the children’s visual stacking.
- Reorder selected rows as one block; prevent cycles and invalid cross-tree drops.
- Duplicate groups recursively with new IDs and shared immutable raster assets.
- Merge Down rasterizes the selected layer and the immediate sibling layer below into one layer; disable it for locked layers, groups, or when no eligible sibling exists.
- Flatten Document prompts for confirmation, composites visible content into one raster layer, and discards hidden content.
- Deleting a nonempty group requests confirmation.
- Visibility and hierarchy reordering remain available for locked layers; content/property mutation does not.

## Integration and Compatibility

- Keep the visible canvas as a presentation surface so zooming, scrolling, status reporting, and canvas resize handles continue working.
- Refactor selection commits, shapes, text, paste, brush, fill, cut/copy/delete, and color/style changes to dispatch document commands.
- Keep floating-placement behavior and restoration of the originating tool after placement.
- Saving `.mdimage` preserves all editable objects and hidden layers.
- Export always uses the current visible composite and does not mutate the document or commit provisional content.
- JPEG export applies the selected document background; PNG/WebP retain transparency.
- Tab duplication deep-clones document structure while safely sharing immutable asset bytes.
- Tab switching and session recovery maintain independent documents, histories, selections, and panel state.

## Public Interfaces

Add these internal application interfaces:

- `ImageEditorDocumentStore`
  - Query document nodes, assets, active targets, and render revisions.
  - Apply validated commands and publish changes.
- `ImageEditorDocumentCommand`
  - `apply(document)` and `revert(document)` transaction contract.
- `ImageEditorCompositor`
  - Render the whole document, a layer, or a requested export region.
- `ImageEditorProjectCodec`
  - Encode/decode/migrate `.mdimage` archives and legacy raster drafts.
- `ImageEditorLayerPanel`
  - Render hierarchy state and emit semantic layer commands.
- `ImageEditorObjectSelection`
  - Hit testing, multi-selection, marquee selection, and transforms by object ID.
- Content renderer registry
  - Dedicated raster, shape/path, and text renderers.
  - Future filters, masks, and new object types register without changing the controller.

The existing image-editor service retains `saveTab`, `saveTabAs`, and `getDraftBinary`, but:

- `saveTab` writes the native project or initiates the required project Save As.
- `saveTabAs` saves `.mdimage`.
- Add `exportFlattenedImage(tab, options)`.
- `getDraftBinary` returns the native project archive.
- Source detection recognizes `.mdimage` alongside PNG, JPEG, and WebP.

## Implementation Sequence

1. Introduce the document schema, asset registry, compositor, project codec, and legacy single-raster migration.
2. Replace pixel history with document transactions and migrate session draft persistence.
3. Add the floating Layers panel and all hierarchy commands.
4. Route raster import, paste, selection, brush, fill, canvas resizing, and export through the document.
5. Convert shapes, paths, and text into editable object adapters and restore guides when selected.
6. Add object-first selection, pixel-marquee mode, layer/group transforms, merge, and flatten.
7. Remove direct canvas mutation paths only after every existing tool uses the document store.
8. Run compatibility, recovery, performance, and visual regression validation before enabling the feature by default.

## Test Plan

- Model invariants: unique IDs, valid parentage, no hierarchy cycles, stable order, and asset reference cleanup.
- Compositor pixels: ordering, transparency, opacity, hidden nodes, nested groups, clipping, and off-canvas content.
- Tool integration: each shape/text tool remains editable; brush/fill/paste create correct raster objects in both placement modes.
- Selection: topmost hit testing, Alt cycling, Shift multi-select, marquee, transforms, locked/hidden exclusions, and panel synchronization.
- Operations: create, rename, duplicate, reorder, group, ungroup, delete, merge down, flatten, and undo/redo for each.
- Persistence: `.mdimage` round trip, missing/corrupt asset diagnostics, unknown future fields, legacy raster import, and old PNG-draft migration.
- Save/export: raster imports require project Save As; native Save preserves structure; flattened PNG/JPEG/WebP matches the visible canvas.
- Lifecycle: independent documents across tabs, duplicate-tab fidelity, close/reopen recovery, panel-state recovery, and dirty/saved-state correctness.
- Performance: cache invalidation must rerender only affected layers; large raster assets must be shared rather than copied into every history entry.
- Existing image-editor end-to-end tests must continue passing, with updated assertions where Save now means native project persistence.

## Expected files to change:

New layered-document modules:

- [document-model.js](/md-editor/desktop-app/resources/js/image-editor/layers/document-model.js)
- [document-store.js](/md-editor/desktop-app/resources/js/image-editor/layers/document-store.js)
- [document-history.js](/md-editor/desktop-app/resources/js/image-editor/layers/document-history.js)
- [document-compositor.js](/md-editor/desktop-app/resources/js/image-editor/layers/document-compositor.js)
- [project-codec.js](/md-editor/desktop-app/resources/js/image-editor/layers/project-codec.js)
- [layer-panel.js](/md-editor/desktop-app/resources/js/image-editor/layers/layer-panel.js)
- [object-selection.js](/md-editor/desktop-app/resources/js/image-editor/layers/object-selection.js)
- [tool-content-adapter.js](/md-editor/desktop-app/resources/js/image-editor/layers/tool-content-adapter.js)
- [renderers](/md-editor/desktop-app/resources/js/image-editor/layers/renderers)

Existing integration surfaces:

- [image-editor/index.js](/md-editor/desktop-app/resources/js/image-editor/index.js)
- [image-editor/view.js](/md-editor/desktop-app/resources/js/image-editor/view.js)
- [image-editor/codec.js](/md-editor/desktop-app/resources/js/image-editor/codec.js)
- [image-editor/selection.js](/md-editor/desktop-app/resources/js/image-editor/selection.js)
- [tabs/index.js](/md-editor/desktop-app/resources/js/tabs/index.js)
- [tabs/persistence.js](/md-editor/desktop-app/resources/js/tabs/persistence.js)
- [index.html](/md-editor/desktop-app/resources/index.html)
- [styles.css](/md-editor/desktop-app/resources/styles.css)

Validation coverage:

- [image-editor unit tests](/md-editor/desktop-app/tests)
- [image-editor-ui.spec.js](/md-editor/desktop-app/tests/e2e/image-editor-ui.spec.js)

## Assumptions

- `.mdimage` is the native extension.
- New content defaults to a new layer.
- A named layer may contain multiple ordered objects.
- Groups, full layer controls, expandable object rows, and object-first selection ship together.
- The panel is right-aligned, floating, vertically resizable, and remembers state per tab.
- Blend mode is initially `normal`; the schema and renderer reserve the extension point.
- Filters, masks, adjustment layers, advanced blend modes, and partial-layer export UI are future features, but the first schema and compositor must accommodate them without migration-breaking redesign.
