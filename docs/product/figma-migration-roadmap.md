# Figma To Canvas MCP Editor Migration Roadmap

Last checked: 2026-06-18

This roadmap translates `docs/product/figma-feature-inventory.md` into implementation lanes for Canvas MCP Editor. It does not change the product position: this project remains a local-first, AI-operable design editor, not a feature-for-feature Figma clone.

## Migration Rules

- Adopt Figma behavior when it makes direct manipulation predictable for human editors.
- Adapt Figma behavior when local-first storage, MCP control, or team-owned collaboration changes the implementation shape.
- Defer product surfaces that require a mature core editor first, such as Slides, Buzz, Make-like prompt-to-app workflows, or full FigJam whiteboarding.
- Exclude centralized SaaS assumptions unless the user explicitly asks for hosted multi-tenant infrastructure.
- Every adopted feature must be exposed through the document model and deterministic agent surfaces, not only through UI clicks.
- Browser verification must use Playwright CLI.
- For basic canvas behavior, use `docs/product/figma-core-interaction-rules.md` as the current rule matrix before creating a new implementation slice.

## Current Baseline

The current main branch already has:

- Rust/TypeScript document primitives for pages, frames, rectangles, text, images, components, instances, and geometry.
- Browser editor shell with creation, selection, dragging, four corner resizing, selection size badges, inspector geometry, inspector alignment/distribution, color/text editing, undo/redo shortcuts, zoom, hover measurement overlays, and selected-frame padding/child-spacing guides.
- Local image asset storage with browser clipboard paste and file drag/drop insertion for image nodes.
- Shift-click and marquee multi-selection, selected-layer alignment/distribution, grouped selected-layer dragging, and transient snap guides for page-level peer bounds/centers.
- Component definitions, instances, and detach.
- HTTP and MCP agent control for inspect, find, command application, validation, change summaries, components, and code export.
- Structured code export with implementation specs and token candidates.
- Team manifests, relay collaboration, remote presence/selection, role-based relay auth, E2EE snapshots, and experimental Rust relay support.

## Lane 1: Layout Foundation

Status: next active implementation lane.

Figma capabilities to bring over:

- Constraints for child response when parent frames resize.
- Auto layout on frames/components with vertical and horizontal flow.
- Gap and padding.
- Content-driven repositioning after create, resize, and text edits.
- Layout metadata in code export and agent inspection.

Implementation shape:

- Add optional `layout` and `constraints` metadata to the shared node model.
- Add deterministic layout commands to editor state, server storage, MCP/HTTP agent commands, and Rust model serialization.
- Implement a small layout solver that runs after document mutations.
- Add inspector controls for layout mode, flow, gap, padding, and constraints.
- Add Playwright coverage for automatic sibling repositioning and parent resize behavior.

Non-goals for the first slice:

- Grid auto layout.
- Wrap, min/max, baseline alignment, and advanced sizing rules.
- Ignore-auto-layout positioning.
- Full Figma parity for text wrapping and intrinsic measurement.

## Lane 2: Precision Canvas Editing

Figma capabilities to bring over:

- Edge resize handles, with the four corner handles already landed.
- Rotate and flip.
- Align left/center/right/top/middle/bottom through the right inspector.
- Distribute spacing through the right inspector.
- Keyboard nudge and configurable big nudge.
- Snap lines, rulers, and layout guides.
- Layer reorder and parent changes through drag/drop.

Implementation shape:

- Extend geometry commands instead of embedding behavior only in React.
- Keep canvas handles fixed-size and tokenized.
- Add agent commands for align/distribute/reparent/reorder.
- Export guide and transform metadata in code-export structures.

## Lane 3: Component System And Design Tokens

Figma capabilities to bring over:

- Component sets and variants.
- Component properties for text, boolean visibility, instance swap, and variant selection.
- Instance overrides with reset and detach.
- Slots for flexible nested content.
- Styles for colors, text, effects, and layout guides.
- Variables with collections, modes, and aliases.
- Library-like reuse across files or teams.

Implementation shape:

- Treat variables as document values first, then expose style bindings.
- Keep libraries local/team-owned. A library file can be referenced from a team manifest before any hosted registry exists.
- Make code export consume variables and component mappings directly.
- Add a Code Connect-inspired mapping layer for repo components after variants and variables are stable.

## Lane 4: Collaboration, Review, And History

Team setup and ownership sequencing is tracked separately in
`docs/product/team-collaboration-roadmap.md`.

Figma capabilities to bring over:

- Canvas comments with threads, mentions, resolved state, and prototype comments.
- Cursor chat and spotlight.
- Version history with named checkpoints.
- Branches, review, and merge.
- Viewer history or lightweight activity log.

Implementation shape:

- Store comments and checkpoints as document-adjacent local/team data.
- Reuse existing Yjs collaboration for live comment updates.
- Use existing change-summary logic as the basis for branch diff UI.
- Keep audio out of scope unless a later user explicitly asks for it.

## Lane 5: Prototyping And Presentation

Figma capabilities to bring over:

- Prototype flows and starting points.
- Triggers and actions for navigate, open overlay, swap variant, and set variable.
- Presentation view.
- Scroll overflow for frames.
- Smart animate later.
- Variables, expressions, and conditionals only after variables are stable.

Implementation shape:

- Start with explicit graph data in the document model.
- Render prototype playback in the web app, not as a separate cloud service.
- Expose prototype graph inspection through MCP/HTTP.

## Lane 6: Dev Handoff And Import/Export

Figma capabilities to bring over:

- Inspect panel for dimensions, style, typography, spacing, component refs, variables, and export assets.
- Ready-for-dev markers and annotations.
- Code Connect-like component mapping.
- Figma REST/MCP import paths for real Figma files, where credentials are provided by the user.
- Asset export formats and image download handling.
- Clipboard paste and file drag/drop image insertion are already local-first asset flows; full Figma file import should reuse the same asset storage path.

Implementation shape:

- Make the existing `implementationSpec` the source of truth.
- Add a visible Dev panel that mirrors the MCP/HTTP inspect result.
- Keep generated HTML/CSS secondary to structured design data.

## Deferred Or Excluded Surfaces

| Figma Surface | Decision | Reason |
| --- | --- | --- |
| Full FigJam | Deferred | Whiteboarding is valuable but not on the critical path for design editor parity. |
| Figma Slides | Deferred | Slide decks would distract from editor, component, and MCP maturity. |
| Figma Buzz | Deferred | Requires templates, libraries, and controlled editing first. |
| Figma Make clone | Excluded as a clone | The native path is agent-controlled canvas editing plus code export. |
| Hosted Sites publishing | Excluded for now | Conflicts with local-first/team-owned infrastructure unless explicitly requested. |
| Enterprise SaaS admin | Excluded for MVP | Roles and relay auth already cover the current team-owned collaboration model. |

## Immediate Implementation Order

1. Keep the landed Lane 1 layout foundation and PR #20 navigation fixes green.
2. Keep the core shortcut slice from `docs/product/figma-core-interaction-rules.md` green: selected-layer Delete/Backspace, Cmd/Ctrl+D duplicate, and single-object Cmd/Ctrl+C/V copy/paste.
3. Keep Shift-click multi-selection and drag 영역 선택 green.
4. Keep alignment/distribute commands green for multi-selected layers.
5. Extend the landed grouped drag, measurement, frame-spacing, corner-resize, and edge-resize slices with rotation, rulers, manual guides, and snap settings.
6. Build full Figma file import separately on top of the local asset pipeline, starting with frames, rectangles, text, and exported image assets before variants or advanced effects.
7. Merge only after `pnpm test`, `pnpm typecheck`, web build, relevant Playwright suites, and direct live UI interaction verification pass.
