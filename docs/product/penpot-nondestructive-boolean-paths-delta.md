# Penpot Non-Destructive Boolean Paths Delta

Last checked: 2026-07-10

## Benchmark Decision

Penpot keeps union, difference, intersection, and exclusion as editable boolean groups whose source shapes remain recoverable. Layo adopts that product behavior and adapts persistence to its local-first document model: ordered source node IDs and cached evaluated path geometry live in one first-class boolean path node.

References:

- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/first-steps/shortcuts/
- https://github.com/penpot/penpot
- https://paperjs.org/reference/path/

## Landed Capability

- Rust, generated TypeScript, renderer, server, and browser contracts for `boolean_path`.
- Paper.js curved path evaluation for union, difference, intersection, and exclusion.
- Closed-path enforcement, even-odd operand support, normalized nonzero results, rotated bounds, and nested boolean operands.
- Deterministic `create_path`, `create_boolean_path`, `set_boolean_path_operation`, and `detach_boolean_path` MCP/HTTP commands.
- Runtime rejection of unknown agent commands and invalid boolean relation payloads.
- Inspect, validation, change summary, dry-run/apply, undo/redo, SVG/PDF, canvas, and PNG output.
- Contextual Korean-first toolbar controls that do not consume canvas input space when boolean operations are unavailable.

## Failure Learning

1. The first E2E used a nonexistent `create_node` command that silently no-oped. Layo now exposes `create_path` and rejects unknown agent commands.
2. Always-visible boolean controls widened the floating toolbar and blocked existing canvas context-menu coordinates. Controls now render only for eligible path selections.
3. The browser test assumed the boolean node was the first child and that server writes immediately appeared in the local layer tree. It now finds typed nodes and reloads at the documented local/server synchronization boundary.
4. Host-level Ctrl+Alt interception made physical shortcut injection unreliable in headless Chromium. The handler now uses layout-independent `event.code`; product E2E proves all four operations through visible controls.
5. Rotation, open geometry, fill rules, invalid operations, raster output, and selection loss after export each received focused regression coverage.

## Verification

Full Verification #546, run `29100227669`, passed Penpot maturity/design gates, typecheck, web build, Core tests, and the complete Playwright CLI suite.

## Remaining Gap

Penpot also supports destructive Flatten. Layo still needs an explicit, undoable flatten command that converts selected shapes or a boolean relation into one standalone first-class path with deterministic MCP/HTTP preview and artifact fidelity.
