# Penpot Maturity Benchmark

Last checked: 2026-06-28

## Product Target

Layo is targeting professional team-product maturity, using Penpot as the
primary open-source benchmark for what a self-hostable design platform should
feel like. Layo should grow toward the same product class as Penpot while
preserving Layo's own technical
advantage: deterministic document inspection, mutation, validation, and export
through MCP and HTTP.

Penpot is the benchmark because it is open source, self-hostable, collaborative,
and already frames itself around design-code-AI workflows, design systems,
plugins, APIs, MCP, and team ownership.

## Penpot Reference Sources

Use these sources before changing Layo's team-product roadmap:

- Penpot repo README: https://github.com/penpot/penpot
- Penpot architecture: https://help.penpot.app/technical-guide/developer/architecture/
- Penpot self-hosting guide: https://help.penpot.app/technical-guide/getting-started/
- Penpot MCP server: https://help.penpot.app/mcp/
- Penpot plugin guide: https://help.penpot.app/plugins/getting-started/
- Penpot file import/export: https://help.penpot.app/user-guide/export-import/export-import-files/
- Penpot shared libraries: https://help.penpot.app/user-guide/design-systems/libraries/
- Penpot team roles and permissions: https://help.penpot.app/user-guide/account-and-teams/#roles-and-permissions
- Penpot reusable design assets: https://help.penpot.app/user-guide/design-systems/assets/
- Penpot design tokens: https://help.penpot.app/user-guide/design-systems/design-tokens/
- Penpot flexible layouts: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot workspace history: https://help.penpot.app/user-guide/designing/workspace-basics/#file-history-versions
- Penpot comments: https://help.penpot.app/user-guide/designing/workspace-basics/#comments
- Penpot autosave configuration: https://help.penpot.app/technical-guide/configuration/#autosave

Refresh this document when those sources materially change or when a Layo
implementation slice reveals a new gap.

## Maturity Dimensions

| Dimension | Penpot benchmark | Layo current posture | Layo target |
| --- | --- | --- | --- |
| Product class | Full-stack design platform for design, code, AI, and team workflows. | Local-first editor with growing Figma-like interactions and agent control. | Professional team design product. |
| Hosting and ownership | Cloud or self-hosted instance with teams, projects, and files. | Local project manifests, static web shell, optional team-owned relay. | Self-hostable full product path with project API, web shell, assets, auth, relay, and operations docs. |
| Collaboration | Realtime collaboration as a core team feature. | Yjs relay, presence, remote selection, roles, E2EE snapshots, manual saved file versions with HTTP/MCP/UI restore, thresholded automatic file versions for persisted edits, a file-panel saved-version preview with current-file change-summary diff, pinned saved-version checkpoints with HTTP/MCP/UI controls, manual saved-version delete, explicit retention cleanup that prunes only old unpinned versions, and selected-node comment threads with sidecar storage, HTTP/MCP/Inspector create-list-resolve-reply flows, viewport bubbles for unresolved node comments, persisted `@mention` extraction, structured local team-member mention targets from active team manifests, local viewer unread/read state, local project/file unread notification summaries with current-file mark-read, local viewer-targeted mention notification counts, browser polling refresh for fallback delivery, shared-filesystem durable SSE comment event replay for open editor sessions across storage-sharing server instances, EventSource replay cursors, and a retained local comment activity feed for create/reply/resolve events. Full CRDT-backed live comment editing, hosted durable pub/sub beyond shared-filesystem event logs, external notification channels, full visual preview, and branch/review/merge workflows remain immature. | Collaboration treated as core product maturity, including comments, history, review, and recovery. |
| Design systems | Tokens, components, variants, shared libraries. | Components, instances, first-class color, spacing, typography, and shadow tokens, document-local reusable color, typography, and single-shadow effect styles with selected-node/text/effect bindings, style rename/delete/duplicate commands, style usage summaries, safe deleted-style binding cleanup, right Inspector style management with search, type filter, sort, slash-name grouping, and duplicate controls, ordered token-set metadata, per-token set ids, active token-set override resolution, document-local token themes with grouped activation, create/edit/membership/delete controls, theme row reorder, theme token-set priority reorder, right Inspector grouped token theme matrix with membership cells and priority badges, undoable web state, agent commands, and active-theme DTCG import/export metadata, node fill-token bindings, layout gap/padding spacing-token bindings, text typography-token bindings, effect-shadow token bindings, DTCG color/spacing/typography/shadow import/export through UI/HTTP/MCP, agent-editable token and style commands, Inspector token/style readouts, text typography-token controls, token-set and token-theme toggles, CSS-variable code export, reusable style metadata in code export, package-style `.layo-library.zip` handoff for reusable components, tokens, token sets, token themes, and referenced component image assets, a server-local published library registry with team-scoped list/review/import/update visibility and guards through storage, HTTP, MCP, web API helpers, and visible file-panel UI for latest reusable libraries, and registry token-bundle review/import replacement plus token-bundle subscription/update notifications/apply flows for tokens, token sets, and token themes through UI/HTTP/MCP, first-class saved repo component mappings, variant-aware mapping props for code handoff, right Inspector selected-instance variant controls including boolean-like toggles, right Inspector selected-main-component multi-property variant name/property/value/type authoring with persisted select/boolean property types, combination selection, editable matrix cells, property deletion with a last-property guard, variant deletion with invalid-instance fallback, duplicate-combination warnings, a Penpot-style context-menu workflow that combines multiple selected sibling main components into one generated variant component through UI and agent commands, component-instance text/fill/stroke/opacity/geometry/effect-shadow override preservation while switching variants, optional variant-owned source trees, component-instance source-tree materialization on create/switch, saved variant-area layout metadata with Inspector/agent controls, automatic source-node reflow for horizontal/vertical variant areas, selected-main-component canvas variant-area outlines, direct viewport gap handles for horizontal/vertical variant areas, direct viewport source reorder handles for variant areas, single CSS box-shadow effect metadata with right Inspector editing, token/style binding, agent/MCP persistence, canvas shadow rendering, Rust round-trip, and CSS/structure/token-variable/style code handoff, ordered multi-effect shadow stacks with right Inspector stack editing, agent/MCP persistence, Rust round-trip, and CSS/structure stack handoff, selected-layer SVG/PDF effect-shadow artifact fidelity, and selected-layer PNG/JPEG/WEBP raster shadow-stack export fidelity exist; arbitrary filter/effect graph fidelity, hosted multi-instance registry sync with durable auth and hosted durable pub/sub fanout beyond shared-filesystem registry events remain immature. | First-class variables, styles, variants, library reuse, and code mapping. |
| Layout | Flex and grid oriented layout primitives. | Layout metadata, constraints, single-axis flow, reverse row/column flow, horizontal flex single-line and wrapped-line baseline alignment, grid row baseline alignment, vertical writing-mode baseline metadata/control/export, wrap, fallback gap, row/column gap split, padding, child margins, child fill width/height sizing, direct resize fill-to-fixed layout-item pinning, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, basic Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, single-cell empty-cell area creation menu, multi-cell merge/split menus, container-level grid horizontal item alignment with stretch, per-item grid self alignment with stretch, static/absolute layout item positioning, min/max sizing rules, cross-axis alignment, main-axis distribution, wrapped-line distribution, and container fit width/height sizing exist; full visual vertical text rendering, deeper CSS baseline group semantics, and remaining deeper resizing semantics remain immature. | Auto layout, constraints, grid-like behavior, resizing semantics, and export parity. |
| Import/export | Penpot file import/export, backups, shared libraries, assets. | Local design JSON, asset storage, image paste/drop, code export, document-local DTCG color/spacing token import/export, a Layo-specific standard ZIP file archive with `manifest.json`, `document.json`, and packaged referenced image assets through storage, HTTP, MCP, and visible file-panel web controls, project-level `.layo-project.zip` archives that package `ProjectManifest`, all member `DesignFile` documents, and referenced assets through storage, HTTP, web API helpers, and visible file-panel review/import controls, package-style `.layo-library.zip` archives that export, server-review, and merge reusable components, tokens, token sets, token themes, and component image assets into the current target file, a server-local published library registry that stores the latest shared library per id for same-team list/review/import/update plus token-bundle review/import/update replacement through storage, HTTP, MCP, web API helpers, and visible file-panel controls, and a repository-owned `.layo` storage backup/review/restore/drill CLI runbook that archives the storage root with `manifest.json`, restores to a fresh root, refuses non-empty restore targets unless forced, and has a scheduled seeded restore drill workflow. Single-file, project, library archive, and registry imports have server-validated no-write review steps before writing; project archive imports create fresh private projects and fresh document ids, component library imports remap conflicting ids instead of overwriting target tokens/components, team-scoped registry entries are hidden from other-team/private target files and reject review/import/update attempts, registry updates reuse original id maps without duplicating existing imported components, registry token-bundle imports/updates deliberately replace the target file's tokens/token sets/token themes after review or subscription notification, and storage backup review is no-write until explicit restore. Hosted database/object-store storage and backup retention automation, hosted multi-instance registry sync with durable auth, hosted durable pub/sub fanout beyond shared-filesystem registry events, and Penpot/Figma migration paths remain immature. | Open project export/import, Penpot/Figma migration paths, asset packaging, and production backup automation. |
| Developer handoff | Inspect, HTML/CSS/SVG access, API, webhooks, plugin integrations. | MCP/HTTP inspect, validate, change summary, structured code export, and a visible Inspector Dev tab that shows selected-layer geometry, fill, generated CSS, generated HTML, exported structure, copy controls for CSS/HTML/structure snippets, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF artifacts that include nested text and shape child layers, selected-layer SVG exports with embedded image data URLs and effect-shadow filters, selected-layer PDF exports with embedded source image files and transparent effect-shadow resources, selected-layer PDF rendering for PNG image nodes, selected-layer PDF rendering for WEBP and SVG image nodes through browser-generated PNG previews, selected-layer PNG/JPEG/WEBP downloads with shadow-stack-aware raster rendering and expanded crop bounds, selected-layer PNG/JPEG/WEBP 1x/2x/3x scale options, persistent selected-layer export presets with batch download, multi-selection export review with per-artifact include/exclude controls, page-level export review when no layer is selected, export review ZIP packaging for checked artifacts, ready-for-dev annotation rows for selected-layer identity, geometry, style, content, layout, component, and asset handoff, saved repo component mappings in HTTP/MCP plus Dev Panel import/usage copy, variant-aware code mapping usage snippets that resolve selected instance variants, and CSS box-shadow/structure metadata plus CSS-variable fallback for effect-shadow token bindings and ordered multi-shadow stacks exist. Advanced filter/effect export fidelity, webhooks/API integration stories, and plugin integration stories remain immature. | Visible Dev panel plus MCP/API surfaces, repo component mappings, and ready-for-dev annotations. |
| Extensibility | Plugin system and API integrations. | No plugin runtime; deterministic agent commands exist. | Plugin/API lane that complements MCP instead of replacing it. |
| AI workflow | Penpot MCP reads/writes the focused file through plugin/API context. | Layo MCP/HTTP applies typed command batches directly to saved design files. | Keep typed deterministic commands as a differentiator while matching Penpot-level breadth. |
| Operations | Self-hosting, configuration, Docker/Kubernetes guidance. | Vercel/static plus Node server and relay deployment notes, Vercel full-stack routing artifacts, a GitHub Actions production deployment path with required Vercel and repository-admin secret checks, deploy-output-derived live smoke verification, GitHub About homepage update only after smoke passes, a live production smoke verifier that rejects non-Layo Vercel pages and no longer defaults to a stale hard-coded URL, a repository-owned `.layo` storage backup/review/restore runbook for persistent filesystem hosts, and a scheduled GitHub Actions restore drill that proves a seeded backup can be restored and read without hosted secrets. Actual production is only proven after the workflow has valid Vercel credentials, a repository-admin homepage token, and the deploy-output URL smoke check passes. Hosted backup automation still needs durable database/object-store storage and retention policy. | Production-grade self-host, Vercel-compatible app deployment, hosted backups, migrations, monitoring, and upgrade docs. |

## Recent Design-System Evidence

`2026-06-28-penpot-variant-area-layout-metadata.md` narrowed the older full
variant-area gap by persisting component variant-area layout metadata across
document contracts, Rust bindings, HTTP, MCP/agent command batches, and the
right Inspector. `2026-06-28-penpot-variant-area-visual-reflow.md` now reflows
variant source nodes for default horizontal combine and Inspector/agent
horizontal/vertical area edits, and shows a selected-main-component canvas
variant-area outline. `2026-06-28-penpot-variant-area-viewport-handles.md`
adds direct horizontal and vertical viewport gap handles that persist through
the same variant-area command path.
`2026-06-28-penpot-variant-source-viewport-reorder.md` adds direct viewport
source reorder handles that update the saved variant order and reflow source
nodes through the same component-variant persistence path.
`2026-06-28-penpot-effect-shadow-overrides.md` adds a first single-shadow
effect slice: persisted `style.effect_shadow`, right Inspector editing, canvas
shadow rendering, component-instance override preservation across variant
source switches, Rust round-trip, and CSS/structure code handoff.
`2026-06-28-penpot-shadow-token-fidelity.md` extends that slice with DTCG
shadow composite import/export, `style.effect_shadow_token`, agent/MCP
validation and mutation, right Inspector token binding, undo/manual override
cleanup, Rust round-trip, and CSS-variable code export fallback.
`2026-06-28-penpot-effect-styles.md` adds document-local reusable effect
styles for the same single-shadow model, including `style.effect_shadow_style`,
agent/MCP validation and mutation, right Inspector create/apply controls,
undo/manual override cleanup, usage summaries, Rust bindings, and
CSS/structure code-export metadata.
`2026-06-28-penpot-multi-effect-stack.md` extends the effect model beyond one
shadow by persisting ordered `style.effect_shadows` arrays, exposing a right
Inspector stack editor, adding agent/MCP mutation, preserving Rust round-trip,
and exporting both joined CSS `box-shadow` and individual structure metadata.
`2026-06-28-penpot-effect-artifact-fidelity.md` extends that handoff by making
selected-layer SVG/PDF artifacts preserve effect shadows through SVG filter
definitions, expanded export bounds, and PDF transparent shadow drawing
resources. `2026-06-28-penpot-raster-effect-fidelity.md` extends the same
effect model into selected-layer PNG/JPEG/WEBP downloads by rendering each
shadow layer on the Konva canvas and expanding the raster crop bounds before
download. Remaining design-system gaps are arbitrary filter/effect graph
fidelity, hosted durable registry pub/sub, and hosted permissioned registry
sync. `2026-06-28-penpot-library-registry-sync.md` adds a
server-local published library registry with storage/HTTP/web publish, list,
no-write review, and import flows, plus Playwright CLI proof that a library
published from one project can be imported into another project.
`2026-06-28-penpot-library-registry-mcp.md` closes the same registry path for
agents by adding MCP publish, list, review, and import tools.
`2026-06-28-penpot-library-update-notifications.md` adds registry subscription
tracking, update notifications, and apply-update flows through storage, HTTP,
MCP, web API helpers, the file-panel UI, browser polling, and Playwright CLI
proof that a target project can apply a source library republish without
duplicating imported components.
`2026-06-28-penpot-library-token-bundle-import.md` extends published libraries
with token sets and token themes, then adds review-before-replace import flows
for registry token bundles across storage, HTTP, MCP, web API helpers, the
file-panel UI, and Playwright CLI proof.
`2026-06-28-penpot-token-bundle-update-notifications.md` adds token-bundle
subscriptions, update notifications, and apply-update replacement flows for
republished registry tokens, token sets, and token themes across storage,
HTTP, MCP, web API helpers, file-panel UI, browser polling refresh, and
Playwright CLI proof.
`2026-06-28-penpot-team-scoped-registry.md` adapts Penpot's team-library
permission expectation to Layo's local-first project sharing model by adding
team ids to published registry entries, file-scoped registry lists, cross-team
review/import/update guards, HTTP/MCP/web API coverage, and Playwright CLI
proof that the visible file-panel registry hides other-team libraries while
showing same-team libraries.
`2026-06-28-penpot-registry-event-fanout.md` adds shared-filesystem registry
publish events and `/libraries/events` SSE fanout so an open target file can see
a source library republish without relying on browser polling, with storage,
HTTP, web API, and Playwright CLI coverage. Hosted durable pub/sub and hosted
registry auth remain separate operations gaps.
`2026-06-28-penpot-comment-event-fanout.md` moves comment live delivery beyond
the earlier process-local SSE path by retaining bounded comment live events in
the shared comment sidecar, replaying `/comments/events` from storage with
sequence cursors, exposing web API `after` cursors, and proving in Playwright
CLI that an externally created comment updates the open file panel through
EventSource while polling is suppressed. Hosted durable pub/sub, full CRDT
comment editing, and external notification channels remain separate
collaboration gaps.
`2026-06-28-penpot-storage-backup-restore.md` closes the local filesystem
backup/restore runbook slice by archiving the `.layo` storage root with a
reviewable manifest, restoring to a fresh storage root, refusing non-empty
restore targets unless forced, and smoke-checking the restored project/history
state through `FileStorage`. Hosted database/object-store backup automation,
retention, and automated restore drills remained operations gaps for the next
slice.
`2026-06-28-penpot-storage-restore-drill.md` adds the first automated restore
drill on top of that runbook: `storage:backup -- drill` backs up a storage
root, restores it into scratch space, and verifies expected project/file/version
evidence through `FileStorage`; `.github/workflows/storage-restore-drill.yml`
runs the same seeded drill on a schedule and manual dispatch without hosted
secrets. Hosted database/object-store storage and retention policy remain
operations gaps.

## Maturity Gates

Layo reaches Penpot-comparable team-product maturity only when all gates have
current evidence:

1. **Editor completeness:** common design-tool actions are directly usable,
   discoverable, keyboard accessible, undoable, and covered by Playwright CLI
   interaction proof.
2. **Team workflow:** teams can create projects, share files, collaborate, leave
   comments, review changes, recover from mistakes, and understand presence.
3. **Design systems:** variables, styles, components, variants, libraries, and
   code mappings are first-class document concepts.
4. **Layout maturity:** auto layout, constraints, grid-like layout, resizing,
   guides, snapping, and export semantics are predictable enough for real UI
   work.
5. **Import/export maturity:** files, assets, libraries, and backups can move
   across machines and tools without losing essential structure.
6. **Developer handoff:** inspectors, measurements, generated specs, asset
   export, annotations, and code mappings are visible in UI and available
   through MCP/HTTP.
7. **Extensibility:** integrations and plugin-like workflows can extend the
   product without patching core app code.
8. **Operations:** deployment, configuration, upgrade, backup, restore, auth,
   relay, and observability are documented and tested.
9. **Agent safety:** every AI-editable behavior supports inspect, dry-run,
   apply, validate, summarize, and reversible or reviewable changes.
10. **Failure loop:** every missed Penpot-level behavior becomes a tracked gap
    with a next implementation goal, regression coverage, and verification.

## Gap Review Cadence

Run a Penpot comparison before every major editor, collaboration, design-system,
import/export, dev-handoff, plugin, or deployment slice.

For each comparison:

1. Name the exact Penpot capability being used as reference.
2. Record whether Layo should adopt it, adapt it, or intentionally diverge.
3. Map the gap to one maturity gate above.
4. Create or update the implementation plan that closes the gap.
5. Add tests and verification that prove the gap is closed in Layo's product
   model, not only in React UI state.
6. If verification fails, feed the failing case into
   `docs/process/penpot-maturity-loop.md`.

## Current Highest-Risk Gaps

These are the first Penpot-comparable gaps to close:

1. Complete Penpot-like layout maturity beyond the landed Flex alignment, reverse row/column flow, horizontal flex single-line and wrapped-line baseline alignment, grid row baseline alignment, vertical writing-mode baseline metadata/control/export, child-margin, child fill sizing, direct resize fill-to-fixed layout-item pinning, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, single-cell empty-cell area creation menu, multi-cell merge/split menus, container-level grid horizontal item alignment with stretch, per-item grid self alignment with stretch, static/absolute layout-item, wrap, row/column gap, container fit sizing, and min/max sizing slices: full visual vertical text rendering, deeper CSS baseline group semantics, and remaining deeper resizing semantics.
2. Full comment and history workflow beyond selected-node create/list/resolve/reply, viewport unresolved-comment bubbles, persisted mentions, structured local team-member mention targets, local unread/read state, local project/file unread summaries, local viewer-targeted mention notification counts, browser polling fallback, shared-filesystem durable SSE comment event replay with EventSource cursors, retained local create/reply/resolve activity feed, manual/automatic saved file versions, current-file diff preview, restore path, pinned saved-version checkpoints, manual saved-version delete, and explicit unpinned retention cleanup: full CRDT-backed live comment editing, hosted durable pub/sub beyond shared-filesystem event logs, external notification channels, full visual preview, branch/review/merge, and richer recovery workflow.
3. Design-system maturity beyond first-class color/spacing/typography/shadow tokens, document-local reusable color/typography/effect styles with rename/delete/duplicate/usage/binding cleanup, Inspector search/filter/sort/grouped style management, ordered token-set metadata, active token-set override resolution, document-local token themes with grouped activation, create/edit/membership/delete controls, theme row reorder, theme token-set priority reorder, right Inspector grouped token theme matrix with membership cells and priority badges, and active-theme DTCG metadata, fill bindings, layout gap/padding spacing-token bindings, text typography-token bindings, effect-shadow token and style bindings, DTCG color/spacing/typography/shadow import/export, package-style shared-library archives with token sets/themes, server-local published library registry team-scoped list/review/import/update flows plus token-bundle review/import/update replacement through UI/HTTP/MCP, saved repo component mappings, variant-aware code mapping props, selected-instance variant controls including boolean-like toggles, selected-main-component multi-property variant authoring with select/boolean property types, editable matrix cells, property deletion with a last-property guard, variant deletion with invalid-instance fallback, duplicate warnings, context-menu combine-as-variants for selected sibling main components through UI and agent commands, component-instance text/fill/stroke/opacity/geometry/effect-shadow override preservation while switching variants, optional variant-owned source trees, component-instance source-tree materialization on create/switch, saved variant-area layout metadata with Inspector/agent controls, source-node reflow, canvas outlines, direct viewport gap handles, direct viewport source reorder handles, single CSS box-shadow effect metadata/editing/rendering/handoff, ordered multi-effect shadow stacks, selected-layer SVG/PDF effect-shadow artifact fidelity, and selected-layer PNG/JPEG/WEBP raster shadow-stack fidelity: arbitrary filter/effect graph fidelity, hosted multi-instance registry sync with durable auth, and hosted durable pub/sub fanout beyond shared-filesystem registry events.
4. Developer handoff beyond the visible Inspector Dev tab backed by existing HTTP code export data, CSS/HTML/structure copy controls, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF nested text/shape child rendering, SVG image data URLs and effect-shadow filters, PDF embedded source image files and transparent effect-shadow resources, PDF visual rendering for PNG, WEBP, and SVG image nodes, selected-layer PNG/JPEG/WEBP scale options with shadow-stack-aware raster bounds, persistent selected-layer export presets, multi-selection export review, page-level export review, checked-artifact ZIP packaging, structured ready-for-dev annotations, saved repo component mapping copy, selected-instance variant-aware usage snippets, and CSS box-shadow/structure metadata for effect shadows and ordered multi-shadow stacks: advanced filter/effect export fidelity, webhook/API integration stories, and plugin integration stories.
5. Full import/export workflow beyond the landed single-file, project-level,
   package-style shared-library Layo ZIP archive review UI, server-local
   published library registry review/import/update UI/HTTP/MCP path, and
   registry token-bundle review/import/update replacement path:
   hosted database/object-store storage and backup retention automation,
   hosted multi-instance registry sync with durable auth, hosted
   durable pub/sub fanout beyond shared-filesystem registry events, and
   Penpot/Figma migration paths where feasible.
6. Plugin/API extensibility lane that does not weaken deterministic MCP commands.
7. Production-grade self-host and actual Vercel app deployment after the GitHub Actions Vercel production workflow has valid project secrets, a repository-admin homepage token, durable hosted storage/backups, and the live production smoke verifier passes against the Vercel deploy output URL.
