# Penpot Maturity Benchmark

Last checked: 2026-07-14

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

## Current Token Administration Evidence

PR #306 established account-level create/list/revoke over the operator-owned
authorization file, and PR #307 serialized same-host process mutations. PR #308
**adapts** Penpot's account access-token workflow rather than copying its hosted
account architecture. The reference behavior is Penpot's descriptive token
name, Never/30/60/90/180-day expiry choices, one-time copy, metadata list, and
deletion:

- https://help.penpot.app/technical-guide/integration/#access-tokens
- https://help.penpot.app/mcp/

The adapted Layo scope is authenticated self-only administration through HTTP
and deterministic MCP plus compact Korean controls in team settings. The
operator members file remains externally owned. Managed hashes and revocation
overlays live in `<members-file>.tokens.json` version 2, bound to the current
operator-member fingerprint; account administration never replaces the base
file. Version 1 entries are quarantined until explicit root-credential recovery,
and reconciliation preserves prior base-token revocations. Plaintext is returned
once, stored only as SHA-256, and intentionally leaves component memory only
through explicit clipboard copy.

MCP authorization and mutation use one freshly parsed, process-locked snapshot.
The browser invalidates stale list/create/revoke responses by operation
generation, identity, and direct `collabSession` object reference. The same-identity P1
RED `69ea991` showed a delayed create response crossing replacement of a
`collabSession` with equal team/member/token values. Implementation commits
`3047`, `d342`, and `fd51` added direct `collabSession` reference invalidation. Review then
found the first test was a false positive because it did not prove the
replacement retained the same token; corrected test `bd7acd` explicitly
preserves that token, waits for the replacement list request, and still proves
the delayed secret/result is discarded.

The watcher remove/reintroduce race first appeared intermittently in failed Full
`29333986663`. Deterministic RED `4f75d7` holds quarantine while the same
member is restored and a fresh generation starts. Full `29334373513` executed
that RED and failed exactly the intended `settledBeforeQuarantine` assertion
with 358/359 server tests passing. GREEN `35ef` serializes managers behind
the process-local reload/quarantine tail and binds quarantine to the observed
sidecar snapshot. Full `29334572132` reached Core GREEN before supersession.
Stress commit `ff7` repeated the exact race 20 times; Full `29334928481`
again reached Core GREEN before supersession. Security re-review approved the
repair with no actionable blocker.

Final docs-head Full `29335855757` then failed 377/378 server tests because a
sibling preview token stayed invalid after one transient truncated base-file
read. Deterministic RED `df0c0581` reproduced that exact reload-recovery gap;
RED Full `29336713035` failed the intended case. GREEN `3c44aecf` adds a
bounded retry serialized by `reloadTail`: the first bad read fails closed
immediately, success cancels retry state, and watcher close cancels pending
retry work. Focused authorization tests passed 15/15 and typecheck passed.
Permanently malformed input remains fail-closed after the bounded budget, and
the retry remains process-local.

Focused real-network Playwright passed 3/3 and the direct headed interaction
passed 1/1: copy changed to `복사됨`, sibling revocation to `해지됨`, and
confirmed self-revocation left an empty credential field with recovery guidance.

The final equal-identity browser proof required three distinct failure loops.
Full `29337201074` exposed fixture activation missing from
`createRelayTeam`; `d7c60f` added explicit UI credential apply and an
authenticated replacement GET. Review then found generation masking in the
session-reference test; deterministic RED `8686d0` / `032f45` and RED Full
`29339023854` failed exactly expected true-to-be-false, while GREEN
`bc6823` / `218ddde` extracted the predicate and App delegation. Full
`29339246720` then exposed a test-oracle error: unavailable-relay reconnect
attempts produced socket count 8, not eight sessions. `9eae96f` removed only
that count while retaining fixed identity, replacement status, authenticated
replacement GET, and old-response absence. Fresh review found no findings.

External review then found a P1 removal failure: a managed-token sidecar member
left behind after operator removal repeatedly failed binding, so every watcher
retry cleared all principals and indefinitely locked out surviving members. RED
`e4c4126` and Full `29342714708` reproduced the survivor timeout. The first
broad quarantine-ignore hypothesis `4d6f0af` broke explicit recovery tests; the
final narrow repair `1b1888f` / `914fc72` ignores only quarantined orphan
members while retaining binding checks for re-added users.

Full Verification `29343398679` passed on
`914fc7226c5632344d4f5e8e1f4c750006b968a2`, including maturity/design gates,
typecheck, web build, Core, and Playwright CLI e2e. Restore `29343394961` and
retention `29343395030` passed on the same head. PR #308 is ready for its final
review and merge gate but is not merged; post-merge cleanup remains open.
Deployment remains non-gating.

This is evidence toward gates 7 (extensibility), 8 (operations), and 10 (failure
loop), not closure of those gates or the whole maturity benchmark. Residual gaps
are durable audit-event consumption, shared transactional multi-host identity
with one monotonic authorization generation, agent dry-run/reviewability for
token mutations, and broader account recovery. Process-local watcher
coordination does not close the multi-host generation gap.
Deployment remains a separate non-gating concern for this local-first product
slice. See `docs/product/penpot-token-mcp-ui-delta.md`.
## Maturity Dimensions

| Dimension | Penpot benchmark | Layo current posture | Layo target |
| --- | --- | --- | --- |
| Product class | Full-stack design platform for design, code, AI, and team workflows. | Local-first editor with growing Figma-like interactions and agent control. | Professional team design product. |
| Hosting and ownership | Cloud or self-hosted instance with teams, projects, and files. | Local project manifests, static web shell, optional team-owned relay. | Self-hostable full product path with project API, web shell, assets, auth, relay, and operations docs. |
| Collaboration | Realtime collaboration as a core team feature. | Yjs relay, presence, remote selection, roles, E2EE snapshots, manual saved file versions with HTTP/MCP/UI restore, thresholded automatic file versions for persisted edits, a file-panel saved-version preview with current-file change-summary diff, pinned saved-version checkpoints with HTTP/MCP/UI controls, manual saved-version delete, explicit retention cleanup that prunes only old unpinned versions, and selected-node comment threads with sidecar storage, HTTP/MCP/Inspector create-list-resolve-reply flows, viewport bubbles for unresolved node comments, persisted `@mention` extraction, structured local team-member mention targets from active team manifests, local viewer unread/read state, local project/file unread notification summaries with current-file mark-read, local viewer-targeted mention notification counts, browser polling refresh for fallback delivery, shared-filesystem durable SSE comment event replay for open editor sessions across storage-sharing server instances, EventSource replay cursors, and a retained local comment activity feed for create/reply/resolve events. Full CRDT-backed live comment editing, hosted durable pub/sub beyond shared-filesystem event logs, external notification channels, full visual preview, and branch/review/merge workflows remain immature. | Collaboration treated as core product maturity, including comments, history, review, and recovery. |
| Design systems | Tokens, components, variants, shared libraries. | Components, instances, first-class color, spacing, typography, and shadow tokens, document-local reusable color, typography, and single-shadow effect styles with selected-node/text/effect bindings, style rename/delete/duplicate commands, style usage summaries, safe deleted-style binding cleanup, right Inspector style management with search, type filter, sort, slash-name grouping, and duplicate controls, ordered token-set metadata, per-token set ids, active token-set override resolution, document-local token themes with grouped activation, create/edit/membership/delete controls, theme row reorder, theme token-set priority reorder, right Inspector grouped token theme matrix with membership cells and priority badges, undoable web state, agent commands, and active-theme DTCG import/export metadata, node fill-token bindings, layout gap/padding spacing-token bindings, text typography-token bindings, effect-shadow token bindings, DTCG color/spacing/typography/shadow import/export through UI/HTTP/MCP, agent-editable token and style commands, Inspector token/style readouts, text typography-token controls, token-set and token-theme toggles, CSS-variable code export, reusable style metadata in code export, package-style `.layo-library.zip` handoff for reusable components, tokens, token sets, token themes, and referenced component image assets, a server-local published library registry with team-scoped list/review/import/update visibility and guards through storage, HTTP, MCP, web API helpers, and visible file-panel UI for latest reusable libraries, and registry token-bundle review/import replacement plus token-bundle subscription/update notifications/apply flows for tokens, token sets, and token themes through UI/HTTP/MCP, first-class saved repo component mappings, variant-aware mapping props for code handoff, right Inspector selected-instance variant controls including boolean-like toggles, right Inspector selected-main-component multi-property variant name/property/value/type authoring with persisted select/boolean property types, combination selection, editable matrix cells, property deletion with a last-property guard, variant deletion with invalid-instance fallback, duplicate-combination warnings, a Penpot-style context-menu workflow that combines multiple selected sibling main components into one generated variant component through UI and agent commands, component-instance text/fill/stroke/opacity/geometry/effect-shadow override preservation while switching variants, optional variant-owned source trees, component-instance source-tree materialization on create/switch, saved variant-area layout metadata with Inspector/agent controls, automatic source-node reflow for horizontal/vertical variant areas, selected-main-component canvas variant-area outlines, direct viewport gap handles for horizontal/vertical variant areas, direct viewport source reorder handles for variant areas, single CSS box-shadow effect metadata with right Inspector editing, token/style binding, agent/MCP persistence, canvas shadow rendering, Rust round-trip, and CSS/structure/token-variable/style code handoff, ordered multi-effect shadow stacks with right Inspector stack editing, agent/MCP persistence, Rust round-trip, and CSS/structure stack handoff, selected-layer SVG/PDF effect-shadow artifact fidelity, and selected-layer PNG/JPEG/WEBP raster shadow-stack export fidelity exist; arbitrary filter/effect graph fidelity, hosted multi-instance registry sync with durable auth and hosted durable pub/sub fanout beyond shared-filesystem registry events remain immature. | First-class variables, styles, variants, library reuse, and code mapping. |
| Layout | Flex and grid oriented layout primitives. | Layout metadata, constraints, single-axis flow, reverse row/column flow, horizontal flex single-line and wrapped-line baseline alignment, grid row baseline alignment, vertical writing-mode baseline metadata/control/export, canvas vertical text rendering for `vertical_rl`/`vertical_lr`, explicit text-orientation controls for mixed/upright/sideways vertical glyph rendering, Unicode-aware mixed orientation coverage for representative horizontal scripts and CJK/fullwidth forms, wrap, fallback gap, row/column gap split, padding, child margins, child fill width/height sizing, fill child width/height recomputation after fixed parent resizing, direct canvas parent width and height resize fill recomputation, wrapped direct canvas parent resize fill-line recomputation, wrapped fill minimum-contribution distribution, direct resize fill-to-fixed layout-item pinning, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, basic Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, single-cell empty-cell area creation menu, multi-cell merge/split menus, container-level grid horizontal item alignment with stretch, per-item grid self alignment with stretch, per-item auto-layout and grid `align_self: baseline` participation with Inspector, MCP/HTTP, persistence, and code-export handoff, auto-layout and grid row `last_baseline` groups with Inspector, MCP/HTTP, persistence, and CSS `last baseline` code-export handoff, horizontal auto-layout and grid row orthogonal vertical writing-mode baseline synthesis from the block-end border edge, per-item layout `z_index` paint and hit-test order with Inspector, MCP/HTTP, persistence, and code-export handoff, direct selected-frame spacing overlay handles for padding and sibling gap drags with Shift/Alt padding semantics, direct absolute layout-item selection and canvas drag out of flow, static/absolute layout item positioning, min/max sizing rules, cross-axis alignment, main-axis distribution, wrapped-line distribution, and container fit width/height sizing exist; full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions, remaining orthogonal writing-mode baseline cases outside horizontal row/grid groups, and font-specific baseline metrics, plus remaining direct-resize and constraint edge cases beyond the direct parent width/height and wrapped-fill resize/min-contribution proofs remain immature. | Auto layout, constraints, grid-like behavior, resizing semantics, and export parity. |
| Import/export | Penpot file import/export, backups, shared libraries, assets. | Local design JSON, asset storage, image paste/drop, code export, document-local DTCG color/spacing token import/export, a Layo-specific standard ZIP file archive with `manifest.json`, `document.json`, and packaged referenced image assets through storage, HTTP, MCP, and visible file-panel web controls, project-level `.layo-project.zip` archives that package `ProjectManifest`, all member `DesignFile` documents, and referenced assets through storage, HTTP, web API helpers, and visible file-panel review/import controls, package-style `.layo-library.zip` archives that export, server-review, and merge reusable components, tokens, token sets, token themes, and component image assets into the current target file, a server-local published library registry that stores the latest shared library per id for same-team list/review/import/update plus token-bundle review/import/update replacement through storage, HTTP, MCP, web API helpers, and visible file-panel controls, a no-write external migration preflight for Penpot ZIP/.penpot, Figma REST JSON, and opaque Figma binary files through storage-independent server review, HTTP, CLI, web API helpers, and the visible file panel, a first write-enabled Figma REST JSON import path that creates a fresh private project for basic `CANVAS`, `FRAME`, `RECTANGLE`, and `TEXT` mapping through storage, HTTP, web API helpers, and the file panel, Figma JSON package import that preserves packaged rectangle image fills as Layo image nodes backed by local asset storage, and a repository-owned `.layo` storage backup/review/restore/drill/repository retention CLI runbook that archives the storage root with `manifest.json`, restores to a fresh root, refuses non-empty restore targets unless forced, lists retained backup archives newest-first, dry-runs/applies keep-last plus max-age pruning, and has scheduled seeded restore and retention workflows. Single-file, project, library archive, registry imports, external migration intake, and storage backup review have no-write review steps before writing; project archive imports create fresh private projects and fresh document ids, component library imports remap conflicting ids instead of overwriting target tokens/components, team-scoped registry entries are hidden from other-team/private target files and reject review/import/update attempts, registry updates reuse original id maps without duplicating existing imported components, component update previews block in-use source deletion and same-id replacements that remove locally overridden source nodes before storage/HTTP/UI writes while reporting affected instances and missing targets, component updates bind review and mutation to one immutable registry archive and target snapshot so concurrent publication cannot inject unreviewed bytes, caught partial-write failures restore exact asset, document, and subscription snapshots while preserving deterministic retry and saved-version recovery, same-target library updates and normal product saves serialize by canonical storage path across local storage instances, rollback refuses to restore over externally edited target or committed subscription bytes detected by exact post-write identity, and durable original/intended journals plus atomic path replacement recover interrupted asset, target, and subscription writes during storage startup, registry token-bundle imports/updates deliberately replace the target file's tokens/token sets/token themes after review or subscription notification, Figma REST JSON review sets `canImport: true` for the currently mapped basic nodes and packaged image-fill nodes when referenced image assets are included, unpackaged Figma image fills remain warnings, and Penpot ZIP review/import now maps basic pages/frames/rectangles/text plus packaged Penpot image shapes and packaged rectangle fill-image paints into Layo image nodes backed by local asset storage, and packaged Penpot frame background fill-image paints as deterministic background image children while preserving foreground child layers, ordered Penpot fill stacks now preserve solid, linear/radial gradient, and packaged image paint ownership with gradient geometry, opacity, visibility, blend mode, and local assets on the owning shape, while ordered Penpot strokes preserve the same paint sources plus width, alignment, style, dash, cap/join, and endpoint metadata. Migration no longer manufactures fill-image or stroke-image children for supported owning shapes. Canvas, SVG, PDF, PNG, JPEG, WEBP, MCP/HTTP inspection, Yjs, component overrides, persistence, and structured code handoff consume the same fill/stroke ownership contracts. Penpot main-component, linked-copy, variant, override, token, and library relations, deeper masks and unsupported shapes, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete. Hosted database/object-store storage, hosted multi-instance registry sync with durable auth, hosted durable pub/sub fanout beyond shared-filesystem registry events, and full Penpot/Figma import mapping remain immature. | Open project export/import, Penpot/Figma migration mapping, asset packaging, and production backup automation. |
| Developer handoff | Inspect, HTML/CSS/SVG access, API, webhooks, plugin integrations. | MCP/HTTP inspect, validate, change summary, structured code export, and a visible Inspector Dev tab that shows selected-layer geometry, fill, generated CSS, generated HTML, exported structure, copy controls for CSS/HTML/structure snippets, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF artifacts that include nested text and shape child layers, selected-layer SVG exports with embedded image data URLs and effect-shadow filters, selected-layer PDF exports with embedded source image files and transparent effect-shadow resources, selected-layer PDF rendering for PNG image nodes, selected-layer PDF rendering for WEBP and SVG image nodes through browser-generated PNG previews, selected-layer PNG/JPEG/WEBP downloads with shadow-stack-aware raster rendering and expanded crop bounds, selected-layer PNG/JPEG/WEBP 1x/2x/3x scale options, persistent selected-layer export presets with batch download, multi-selection export review with per-artifact include/exclude controls, page-level export review when no layer is selected, export review ZIP packaging for checked artifacts, ready-for-dev annotation rows for selected-layer identity, geometry, style, content, layout, component, and asset handoff, saved repo component mappings in HTTP/MCP plus Dev Panel import/usage copy, variant-aware code mapping usage snippets that resolve selected instance variants, and CSS box-shadow/structure metadata plus CSS-variable fallback for effect-shadow token bindings and ordered multi-shadow stacks exist. Advanced filter/effect export fidelity, webhooks/API integration stories, and plugin integration stories remain immature. | Visible Dev panel plus MCP/API surfaces, repo component mappings, and ready-for-dev annotations. |
| Extensibility | Plugin system and API integrations. | No plugin runtime; deterministic agent commands exist. | Plugin/API lane that complements MCP instead of replacing it. |
| AI workflow | Penpot MCP reads/writes the focused file through plugin/API context. | Layo MCP/HTTP applies typed command batches directly to saved design files. | Keep typed deterministic commands as a differentiator while matching Penpot-level breadth. |
| Operations | Self-hosting, configuration, Docker/Kubernetes guidance. | Vercel/static plus Node server and relay deployment notes, Vercel full-stack routing artifacts, a GitHub Actions production deployment path with required Vercel and repository-admin secret checks, deploy-output-derived live smoke verification, a guarded GitHub About sync script that repeats the live smoke check before PATCHing repository metadata, a live production smoke verifier that rejects non-Layo Vercel pages and no longer defaults to a stale hard-coded URL, a verified manual `jsleemasters-projects/layo` production deployment at `https://layo-three.vercel.app/` with same-origin `/health`, a repository-owned `.layo` storage backup/review/restore runbook for persistent filesystem hosts, a scheduled GitHub Actions restore drill that proves a seeded backup can be restored and read without hosted secrets, and a scheduled local backup repository retention workflow that dry-runs then applies keep-last plus max-age pruning without hosted secrets. CI-owned production deploy proof still requires valid Vercel credentials, a repository-admin homepage token, and a workflow deploy-output URL that passes the live smoke check. Hosted backup automation still needs durable database/object-store storage. | Production-grade self-host, Vercel-compatible app deployment, hosted backups, migrations, monitoring, and upgrade docs. |

## Current Library Recovery Evidence

`docs/product/penpot-library-token-recovery-review-repair-delta.md` closes the
post-merge review gaps in no-restart credential recovery. A terminal browser
authorization state now permits an explicit same-token retry when an operator
restores that credential, and MCP can read its principal token from a watched
operator-owned file with last-valid fallback. Different-value browser rotation
and static environment fallbacks remain supported. Named per-token records and
individual revocation remain the next identity-lifecycle gap.

`docs/product/penpot-named-token-revocation-delta.md` closes that next
identity-lifecycle gap with named token records, unique per-member token IDs,
independent lifecycle timestamps, secret-free authentication identity, and
watched individual revocation that preserves active sibling credentials.
Hosted token administration, encrypted shared identity storage, cross-instance
identity synchronization, and retained authorization receipts remain open.

`docs/product/penpot-cross-process-storage-lock-delta.md` adapts Penpot's
transaction and row-lock ownership principle to Layo's local-first filesystem.
Resource-keyed owner locks now serialize same-target writes across Node
processes, enforce `subscriptions -> target` acquisition order for library
updates, and recover only bounded same-host owners whose PID is dead. Normal
document, library/token import, version restore, and persisted agent mutations
hold that lock from the latest read through mutation and write so stale JSON
cannot silently overwrite a concurrent edit. Automatic
cross-host lock stealing deliberately remains unsupported. Atomic publication
across registry archive bytes, registry metadata, and events is the next exact
design-system and import/export recovery gap.

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
`2026-06-28-penpot-migration-preflight.md` adds the first external migration
intake surface: `reviewExternalMigrationArchive` classifies Penpot ZIP/.penpot,
Figma REST JSON, and opaque Figma binaries; `POST /migrations/external/review`,
`pnpm run migration:review`, web API helpers, and the visible file-panel card
show source, archive kind, candidate documents/assets, blockers, and next steps
without writing storage. Real Penpot/Figma geometry/style/asset mapping remains
an import/export maturity gap.
`2026-06-28-figma-json-basic-import.md` closes the first part of that mapping
gap for Figma REST JSON: reviewed JSON exports with CANVAS pages can now be
imported into a fresh private Layo project when they contain basic frames,
rectangles, and text. Image fills/assets, components, variants, effects,
advanced style fidelity, and Penpot ZIP shape mapping remain follow-up gaps.
`2026-07-01-figma-image-asset-import.md` closes the next Figma asset slice:
Figma ZIP packages containing a REST JSON file plus exported image assets now
review as importable, map packaged rectangle image fills to Layo image nodes,
write the referenced image bytes into local asset storage, and expose the same
flow through HTTP, web API helpers, and the visible file-panel import path.
Components, variants, effects, advanced style fidelity, and unpackaged image fills remain follow-up gaps for Figma migration.
`2026-07-05-penpot-basic-zip-import.md` starts the Penpot ZIP write path by mapping packaged Penpot pages, frames, rectangles, and text into fresh Layo projects through server review/import, HTTP, web API helpers, and the visible file-panel flow.
`2026-07-05-penpot-zip-image-assets.md` narrows the next Penpot ZIP mapper gap by adopting Penpot v3 media/object packaging for image shapes: review/import now preserve a packaged Penpot `image` shape as a Layo image node backed by local asset storage, with HTTP persistence and visible file-panel Playwright CLI proof that `/assets/{assetId}` serves the imported image bytes. Rectangle, frame fill-image, and solid multi-fill paint follow-ups are tracked in later 2026-07-05 slices; stroke images, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-05-penpot-fill-image-paints.md` narrows the fill-image follow-up by importing packaged Penpot rectangle `fill-image` paints as Layo image nodes backed by local asset storage, with server mapper, HTTP persistence, and visible file-panel Playwright CLI proof that the `Hero fill` layer persists its asset bytes. Stroke images, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-05-penpot-frame-fill-image-background.md` closes the next fill-image follow-up by importing packaged Penpot frame background `fill-image` paints as deterministic background image children before foreground layers, with server mapper, HTTP persistence, and visible file-panel Playwright CLI proof that `Hero frame background` and `Foreground card` both persist and `/assets/{assetId}` serves the imported image bytes. Stroke images, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-05-penpot-solid-multi-fill-flattening.md` closes the solid multi-fill follow-up by adapting Penpot `fills` vectors into one deterministic Layo `style.fill` and opacity for solid-color stacks, with server mapper, HTTP persistence, and visible file-panel Playwright CLI proof that `Layered fill card` imports as `#800080` with opacity `1`. Stroke images, gradient angle/radius fidelity, multiple gradient fills, image fills inside mixed stacks, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-05-penpot-gradient-fill-flattening.md` closes the simple gradient follow-up by adapting Penpot `fill-color-gradient` stop vectors into one deterministic midpoint Layo `style.fill` and opacity, with server mapper, HTTP persistence, and visible file-panel Playwright CLI proof that `Gradient card` imports as `#800080` with opacity `1`. Gradient angle/radius fidelity, multiple gradient fills, blend modes, mixed image+gradient stacks, stroke images, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-05-penpot-mixed-fill-image-stack.md` closes the mixed image+paint asset-loss follow-up by scanning every Penpot `fills` record for packaged `fill-image` metadata before falling back to color/gradient flattening, with server mapper, HTTP persistence, and visible file-panel Playwright CLI coverage that `Hero fill` imports as an image node with asset bytes and opacity `0.75`. `2026-07-05-penpot-stroke-image-assets.md` adapts packaged Penpot rect `stroke-image` records as Layo image nodes backed by local asset storage. `2026-07-05-penpot-frame-stroke-image-assets.md` adapts packaged Penpot frame `stroke-image` records as deterministic frame image children before foreground layers. `2026-07-05-penpot-frame-dual-image-paints.md` closes the next frame image-paint asset-loss gap by preserving both packaged `fill-image` and `stroke-image` records as separate deterministic frame image children before foreground layers, with server/HTTP persistence and visible file-panel Playwright CLI proof that both imported asset endpoints serve bytes. `2026-07-05-penpot-stroke-gradient-flattening.md` closes the simple stroke-gradient follow-up by adapting Penpot `stroke-color-gradient` stop vectors into one deterministic midpoint Layo `style.stroke`, with server mapper, HTTP persistence, and visible file-panel Playwright CLI coverage that `Gradient stroke card` imports as `#800080` at `stroke_width` 4. `2026-07-05-penpot-paint-source-metadata.md`, `2026-07-05-penpot-gradient-source-css-export.md`, `2026-07-05-penpot-gradient-svg-artifact.md`, `2026-07-05-penpot-gradient-pdf-artifact.md`, `2026-07-05-penpot-stroke-gradient-svg-artifact.md`, `2026-07-05-penpot-stroke-gradient-pdf-artifact.md`, and `2026-07-05-penpot-gradient-raster-artifact.md` extend that flattening baseline by preserving Penpot paint-source metadata for agent/code handoff, selected-layer SVG/PDF artifacts, and the Konva-backed selected-layer raster path for supported simple linear fill/stroke gradients. `2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. `2026-07-06-penpot-radial-width-svg-artifact.md` extends that selected-layer SVG radial path by adding Penpot width/angle `gradientTransform` for supported radial paint sources so elliptical radial geometry survives SVG export. `2026-07-06-penpot-radial-pdf-artifact.md` adds the first selected-layer PDF radial slice by emitting `/ShadingType 3` resources for supported circular Penpot radial fills. `2026-07-06-penpot-radial-width-pdf-artifact.md` extends the selected-layer PDF radial path by applying a PDF transform matrix to Type 3 shading resources so supported Penpot radial width geometry survives PDF export. `2026-07-06-penpot-radial-raster-canvas.md` adapts supported circular Penpot radial fill paint sources to live canvas rendering and selected-layer PNG raster artifacts. `2026-07-06-penpot-radial-width-raster-canvas.md` extends that raster/canvas path by applying the same Penpot width/angle ellipse geometry through a generated Konva fill pattern. `2026-07-06-penpot-radial-stroke-raster-canvas.md` adapts the radial stroke selected-layer raster/canvas path by reusing the preserved Penpot radial paint geometry as a Konva overlay plus inner fill mask for supported rectangular stroke artifacts. `2026-07-06-penpot-vector-path-artifacts-delta.md` adapts preserved Penpot path geometry for selected-layer SVG/PDF artifacts by emitting path primitives and parsing M/L/H/V/C/Q/Z commands for PDF clip, fill, stroke, and gradient paths. `2026-07-06-penpot-arc-smooth-path-artifacts-delta.md` extends that PDF path parser for Penpot-origin A/S/T commands by converting arcs and smooth curves into cubic PDF path commands for clip, fill, stroke, and gradient artifacts. `2026-07-06-penpot-path-fill-rule-artifacts-delta.md` preserves Penpot-origin even-odd compound path metadata in selected-layer SVG and PDF artifacts by emitting SVG fill/clip rule attributes plus PDF `f*`/`W*` operators. Exact mixed-stack overlay/blend compositing, image-gradient interactions, path boolean geometry and raw path import beyond selected-layer artifacts, group/text gradient rendering, masks, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.
`2026-07-02-penpot-vertical-text-canvas-rendering.md` closes the first visual
vertical writing-mode canvas gap by adapting Layo's persisted `vertical_rl` and
`vertical_lr` metadata to clipped upright glyph columns in the Konva canvas.
CSS export keeps using native `writing-mode`; full Unicode orientation fidelity, font-specific vertical substitutions, remaining orthogonal baseline cases outside horizontal row/grid groups, font-specific baseline metrics, plus remaining deeper resizing semantics remain follow-up layout gaps.
`2026-07-02-penpot-text-orientation-controls.md` adds explicit
`text_orientation` metadata/control/export and adapts mixed/upright/sideways
vertical glyph rendering in the Konva canvas. Full UAX #50 table coverage and font-specific vertical substitutions remain follow-up typography gaps.
`2026-07-02-penpot-vertical-text-unicode-orientation.md` narrows that typography follow-up by extracting canvas glyph orientation into a tested helper, rotating representative Latin extended, Greek, Cyrillic, Arabic/Hebrew, digits, and symbols in `mixed`, keeping CJK scripts and fullwidth/vertical punctuation upright, and adding Playwright e2e coverage for mixed Unicode vertical text through the Inspector and Dev handoff path. Full UAX #50 table coverage and font-specific vertical substitutions remain follow-up layout gaps.

`2026-07-02-penpot-baseline-align-self.md` narrows the CSS baseline follow-up by letting auto-layout and grid children opt into `layout_item.align_self = baseline`, persisting the Inspector change through `set_layout_item`, accepting the value through MCP/HTTP/server storage/Rust bindings, and exporting selected-layer CSS/structure handoff. Remaining layout baseline gaps are remaining orthogonal writing-mode baseline cases outside horizontal row/grid groups and font-specific baseline metrics.
`2026-07-02-penpot-layout-item-z-index.md` adapts Penpot flex child z-index positioning as saved `layout_item.z_index`, preserving document child order while sorting canvas paint and hit-testing by effective same-parent z-index and exporting selected-layer CSS/structure handoff.
`2026-07-02-penpot-flex-spacing-handles.md` adapts Penpot flexible-layout spacing value drag affordances as selected-frame canvas padding and sibling-gap handles, including normal, Shift opposite-side, and Alt all-side padding semantics through the existing Inspector layout persistence path.
`2026-07-02-penpot-absolute-layout-item-drag.md` adapts Penpot flexible-layout static/absolute positioning by keeping absolute children out of auto-layout flow while still exposing selected absolute children to canvas selection geometry and direct drag handles. Remaining layout gaps are deeper resizing semantics.
`2026-07-02-penpot-grid-absolute-layout-item-drag.md` closes the grid absolute-positioning proof gap by showing a selected absolute child inside a grid frame can be dragged directly on the canvas while a new static child still auto-places at the grid flow origin.
`2026-07-02-penpot-flex-fill-resize.md` narrows the remaining resizing-semantics gap by proving a horizontal auto-layout fill child recomputes from 230 to 290 wide after its fixed-width parent changes from 360 to 420, while the fixed sibling stays 80 wide and moves from x=260 to x=320.
`2026-07-03-penpot-flex-fill-height-resize.md` extends the same resizing evidence to vertical auto-layout height fill: the fill child recomputes from 130 to 190 high after its fixed-height parent changes from 260 to 320, while the fixed sibling stays 80 high and moves from y=160 to y=220.
`2026-07-03-penpot-flex-fill-direct-parent-resize.md` extends the resizing evidence into the direct browser canvas path: dragging the selected parent frame bottom-right resize handle from 360 to 420 wide keeps the child in `fill`, recomputes it from 230 to 290 wide, and moves the fixed sibling from x=260 to x=320.
`2026-07-04-penpot-flex-fill-direct-parent-height-resize.md` extends the direct browser canvas evidence to vertical auto-layout height fill: dragging the selected parent frame bottom-right resize handle from 260 to 320 high keeps the child in `fill`, recomputes it from 130 to 190 high, and moves the fixed sibling from y=160 to y=220.
`2026-07-04-penpot-flex-fill-wrap-direct-parent-resize.md` extends the direct browser canvas evidence into wrapped horizontal auto layout: dragging the selected parent frame from 420 to 360 wide keeps the child in `fill`, recomputes it from 290 to 230 wide before line breaking, and keeps the fixed sibling on the same row while moving from x=320 to x=260. A review follow-up now also proves wrapped fill minimum-contribution distribution: in a 150px row with a 10px gap, one `min_width: 100` fill child sizes to 120px and the second fill child sizes to 20px without overflowing the row.
`2026-07-05-penpot-orthogonal-baseline-synthesis.md` adapts CSS/Penpot horizontal row baseline synthesis for vertical writing-mode text in horizontal auto-layout and grid rows: vertical text now contributes its block-end border edge instead of the old width/2 center heuristic, with web/server geometry tests and Playwright CLI Inspector proof for the caption y=103 alignment. Remaining baseline gaps are axis-specific orthogonal cases outside horizontal rows and font-specific metrics.

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

## Active Path Maturity Loop

PR #272 and PR #273 complete first-class path import, editing, topology, and direct Bezier interaction. PR #274 adds non-destructive union, difference, intersection, and exclusion with ordered recoverable operands, deterministic path/boolean MCP and HTTP commands, curved and even-odd evaluation, undo/redo, canvas, and SVG/PDF/PNG output. Full Verification #546 run `29100227669` is the completed boolean-path GREEN.

PR #275 adds destructive Flatten for selected closed paths and boolean relationships. The result is one standalone first-class path with normalized curved/compound geometry, even-odd hole handling, world-space bounds, dry-run/apply MCP and HTTP parity, Korean direct control, `Ctrl/Cmd+E`, reversible history, reload persistence, and SVG/PDF/PNG proof. Code-head Full Verification run `29150553848` passed all gates and 185 Playwright tests; final PR-head verification remains the merge gate.

PR #276 adapts open-path Flatten by preserving explicit open geometry plus stroke width, cap, join, dash, endpoint marker, and opacity contracts through model, MCP/HTTP, editor history, reload, canvas, SVG, PDF stroke operators, and PNG. Mismatched multi-source stroke contracts are no-write. Visual PDF endpoint marker geometry, marker/stroke-aware export bounds, and first-class human stroke controls remain the exact next gap; deterministic PDF marker comments are evidence, not visual parity. See `docs/product/penpot-open-path-flattening-delta.md`.

PR #277 closes that endpoint-fidelity gap with tangent-aware PDF geometry for every supported marker, first-class path stroke/marker artifact bounds, Korean stroke color/width/cap/join/dash/endpoint controls, validated `set_node_style` persistence, serialized rapid edits, and persisted undo/redo. Full Verification `29221738942` passed all gates and 186 Playwright cases. Penpot's ordered multi-stroke model, including per-stroke opacity, position, visibility, style, and endpoints, is now the exact next gap. See `docs/product/penpot-pdf-stroke-marker-fidelity-delta.md`.

PR #278 closes the single-stroke ceiling with an authoritative ordered
`style.strokes` contract, per-layer color/opacity/width/position/style/
visibility/dash/cap/join/endpoints, validated deterministic mutation, history,
reload, Yjs preservation, component overrides, Korean Inspector lifecycle,
separate Konva/SVG/PDF paint passes, box-shape PNG bounds, and code handoff.
Full Verification `29224618439` passed all gates and 187 Playwright cases;
restore `29224618444` and retention `29224618447` passed. See
`docs/product/penpot-first-class-multi-stroke-delta.md`.

PR #279 closes closed arbitrary-path alignment with one shared closed-subpath
resolver, Path2D interior/inverse canvas clipping, SVG clip/mask definitions,
PDF even-odd clip operators, PNG bounds, open-path center normalization at the
agent and render boundaries, and Korean Inspector effective-state controls.
Full Verification `29227360608` passed all gates and 188 Playwright cases;
restore `29227360595` and retention `29227360638` passed. First-class stroke
entries still only own a solid color while Layo's legacy/import paths separately
support gradient and image stroke paints, so per-stroke paint-source ownership
is the next exact gap. See
`docs/product/penpot-closed-path-stroke-alignment-delta.md`.

PR #280 closes per-stroke solid, gradient, and image paint ownership across
models, deterministic agent mutation, Yjs, component/code handoff, Inspector,
canvas, SVG/PDF/raster, and Penpot migration. Full Verification
`29232502532` passed all gates and 189 Playwright cases.

PR #281 closes ordered per-fill solid, gradient, and image ownership with
per-fill visibility, opacity, and blend mode across the same product surfaces.
It removes supported synthetic fill-image children, adds PDF alpha/blend
graphics states and PNG/JPEG/WEBP proof, and repairs fill-only editor history.
Full Verification `29239015361` passed every gate; restore `29239015644`
and retention `29239015484` passed. Penpot component/main-copy/variant
migration is the next exact import gap. See
`docs/product/penpot-first-class-fill-paints-delta.md`.

PR #283 through PR #293 mature shared-library ownership, nested swaps,
conflict preflight, immutable review snapshots, guarded rollback, durable
write-ahead recovery, resource-keyed process locks, operation-level
read-modify-write transactions, and one serialized archive/metadata/event
publication transaction. RED `29276435367` proved competing source mismatch;
crash RED `29277054987` proved restart mismatch after archive replacement.
See `docs/product/penpot-library-publication-transaction-delta.md`.

PR #294 adapts Penpot 2.14.1's idempotent RPC retry contract to local-first
library publication. A durable receipt is committed and recovered with the
archive, metadata, and event paths; the same key returns the original entry
across storage instances, while mismatched reuse is a no-write HTTP 409. RED
`29279535916` proved duplicate result and event creation. See
`docs/product/penpot-idempotent-library-publication-delta.md`. Hosted
multi-instance registry ownership, authorization, transactional object storage,
receipt retention, backup automation, and durable pub/sub remain deliberately
open.

PR #295 begins hosted ownership by adapting Penpot's owner/editor/viewer team
roles to Layo's existing member-token model. Configured HTTP, browser, and MCP
publication paths now require an exact-team owner or editor before the registry
write; viewer, invalid-token, wrong-team, and private-source cases fail first.
The unconfigured local-first mode remains deliberately open, and runtime
credentials remain outside exported team manifests. See
`docs/product/penpot-library-publish-authorization-delta.md`. Authenticated
import/update/token mutations, principal-filtered reads, shared transactional
storage, revocation, receipt retention, and durable pub/sub remain open.

PR #296 extends that role boundary from publication to target-file registry
writes. Configured component/token import and update routes in HTTP, the web
editor, and MCP require an exact-target-team owner or editor before mutation,
while viewer-readable review/preflight paths remain open. See
`docs/product/penpot-library-mutation-authorization-delta.md`.
Principal-filtered reads, revocation, shared transactional storage, receipt
retention, and durable pub/sub remain open.

PR #297 completes authenticated registry discovery. Configured HTTP, browser,
and MCP list reads require a member principal, filter unscoped results to the
principal's team ids, and reject file-scoped cross-team reads while preserving
same-team viewer access. The same principal-team filter is applied after
file-scoped storage compatibility filtering so legacy/private unscoped entries
cannot re-enter hosted results; review RED `29292379607` proved the leak and
review GREEN `29292539822` closed it across HTTP and MCP. Failure-learning RED `29290200053` also proved that
grid header reorder lost its active session across a React rerender; the stable
listener plus latest-dispatch ref passed all 193 Playwright cases without retry
in GREEN `29290833407`. See
`docs/product/penpot-library-read-authorization-delta.md`. Authenticated
review/preflight reads, registry events, revocation, shared transactional
storage, receipt retention, and durable pub/sub remain open.

PR #298 completes exact-target-team authorization for registry
review/preflight and subscription/update reads across HTTP, web, and MCP.
RED `29293745767` proved missing HTTP credentials, MCP RED `29294139347`
proved cross-team review payload disclosure, and web contract RED
`29294420834` proved the browser helpers lacked credential support. GREEN
`29294574049` passed 251 web, 294 server, Rust, and all 193 Playwright cases
without retry. See
`docs/product/penpot-library-review-authorization-delta.md`. Registry
EventSource authorization remains the next exact gap because the current
browser transport cannot send member headers.

## Latest Verified Delta: Team Library Event Authorization

PR #299 closes the hosted registry event-read boundary. Configured HTTP streams
authenticate before response hijack, enforce exact target-file team access, and
filter unscoped events to the member's teams. The browser uses credentialed
fetch SSE without URL secrets, resumes from its last sequence, aborts on
cleanup, and refreshes the visible library update state without overwriting an
explicit operation result. Unconfigured local-first streaming remains
available.

This is an **adapt** of Penpot's team-owned shared-library model to Layo's
shared-filesystem event log. It is not yet hosted durable pub/sub: credential
rotation/revocation, multi-instance transactional storage, and durable fanout
remain open.

Evidence: `docs/product/penpot-library-event-authorization-delta.md`, Full
Verification `29298859382`.

## Latest Verified Delta: Library Credential Lifecycle

PR #300 makes configured team access time-bounded and withdrawable without
changing design documents. The shared authenticator now enforces normalized
`notBefore`, `expiresAt`, and `revokedAt` cutoffs and accepts a
deduplicated `tokenHashes` list for controlled SHA-256 rotation overlap.
Existing `token` and `tokenHash` configuration remains compatible, and
unconfigured local-first operation is unchanged.

This is an **adapt** of Penpot's revocable team-access expectation to Layo's
self-hosted environment configuration. RED `29300060591` proved elapsed
credentials remained valid; GREEN `29300218356` passed 252 web, 296 server,
Rust, and 193 Playwright CLI cases. Dynamic configuration reload, per-token
revocation, already-open SSE re-authentication, and shared multi-instance
identity storage remain open.

Evidence: `docs/product/penpot-library-credential-lifecycle-delta.md`.

## Latest Verified Delta: Live Stream Reauthorization

PR #301 closes the continued-access gap in configured library event streams.
Before every shared event-log poll, the server now re-authenticates the request
headers and re-authorizes file-scoped access against the current team. An
inactive credential or removed team permission emits a stable secret-free
terminal event, clears timers, and ends the response before new registry data is
read.

This is an **adapt** of Penpot's current team-permission boundary to Layo's
Fetch-based shared-filesystem SSE. RED `29301331244` proved an expired stream
remained open; GREEN `29301471160` passed 252 web, 297 server, Rust, and 193
Playwright CLI cases. Browser terminal-auth retry suppression and explicit
Korean session-expired UI remain the next exact gap.

Evidence:
`docs/product/penpot-library-stream-reauthentication-delta.md`.

## Latest Verified Delta: Terminal Library Authorization UI

PR #302 carries server authorization termination into the visible editor.
Terminal SSE records and direct 401/403 responses stop reconnecting, clear
protected registry and review state, invalidate stale in-flight responses, and
show Korean credential-expired or team-access-removed guidance. Recoverable EOF
and network errors retain cursor reconnect, while a new credential dependency
creates a fresh subscription.

This is an **adapt** of Penpot's current team-access model to Layo's local-first
Fetch SSE client. RED `29302534496` proved the terminal event was ignored and
retried. Final GREEN `29303273081` passed 254 web, 297 server, Rust, and 194
Playwright CLI cases, including delayed-response cache non-reappearance.
First-class token replacement and dynamic server identity reload remain open.

## Latest Verified Delta: Library Token Recovery

PR #303 closes the immediate credential-recovery gap. An operator-owned
`LAYO_LIBRARY_REGISTRY_MEMBERS_FILE` now atomically reloads valid member
configuration into the stable HTTP/MCP authorization object while malformed
updates retain the last valid state. Authenticated registry streams emit an
explicit ready event, and the Korean team panel replaces an expired member token
without recreating the active team while keeping expiry, reconnecting, and
success states visible.

RED `29304547951` proved dynamic loading was absent. Browser RED
`29304746565` proved readiness was absent. Failure-learning runs
`29304831810` and `29304931210` corrected exact SSE event matching and
hidden team-panel feedback. GREEN `29305440761` passed 255 web tests, 299
server tests, Rust workspace tests, and 195 Playwright CLI cases.

Evidence: `docs/product/penpot-library-token-recovery-delta.md`. Named
per-token records and individual revocation remain the next credential gap.

Evidence: `docs/product/penpot-library-auth-ended-ui-delta.md`.

## Current Highest-Risk Gaps

These are the first Penpot-comparable gaps to close:

1. Complete Penpot-like layout maturity beyond the landed Flex alignment, reverse row/column flow, horizontal flex single-line and wrapped-line baseline alignment, grid row baseline alignment, vertical writing-mode baseline metadata/control/export, child-margin, child fill sizing, fill child width/height recomputation after fixed parent resizing, direct resize fill-to-fixed layout-item pinning, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, single-cell empty-cell area creation menu, multi-cell merge/split menus, container-level grid horizontal item alignment with stretch, per-item grid self alignment with stretch, per-item auto-layout and grid `align_self: baseline` participation with Inspector, MCP/HTTP, persistence, and code-export handoff, auto-layout and grid row `last_baseline` groups with Inspector, MCP/HTTP, persistence, and CSS `last baseline` code-export handoff, horizontal auto-layout and grid row orthogonal vertical writing-mode baseline synthesis from the block-end border edge, per-item layout `z_index` paint and hit-test order with Inspector, MCP/HTTP, persistence, and code-export handoff, direct selected-frame spacing overlay handles for padding and sibling gap drags with Shift/Alt padding semantics, direct absolute auto-layout/grid child drag proof, wrap, row/column gap, container fit sizing, and min/max sizing slices landed; remaining layout risks: full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions, remaining orthogonal writing-mode baseline cases outside horizontal row/grid groups, and font-specific baseline metrics, plus remaining direct-resize and constraint edge cases beyond the direct parent width/height and wrapped-fill resize/min-contribution proofs.
2. Full comment and history workflow beyond selected-node create/list/resolve/reply, viewport unresolved-comment bubbles, persisted mentions, structured local team-member mention targets, local unread/read state, local project/file unread summaries, local viewer-targeted mention notification counts, browser polling fallback, shared-filesystem durable SSE comment event replay with EventSource cursors, retained local create/reply/resolve activity feed, manual/automatic saved file versions, current-file diff preview, restore path, pinned saved-version checkpoints, manual saved-version delete, and explicit unpinned retention cleanup: full CRDT-backed live comment editing, hosted durable pub/sub beyond shared-filesystem event logs, external notification channels, full visual preview, branch/review/merge, and richer recovery workflow.
3. Design-system maturity beyond first-class color/spacing/typography/shadow tokens, document-local reusable color/typography/effect styles with rename/delete/duplicate/usage/binding cleanup, Inspector search/filter/sort/grouped style management, ordered token-set metadata, active token-set override resolution, document-local token themes with grouped activation, create/edit/membership/delete controls, theme row reorder, theme token-set priority reorder, right Inspector grouped token theme matrix with membership cells and priority badges, and active-theme DTCG metadata, fill bindings, layout gap/padding spacing-token bindings, text typography-token bindings, effect-shadow token and style bindings, DTCG color/spacing/typography/shadow import/export, package-style shared-library archives with token sets/themes, server-local published library registry team-scoped list/review/import/update flows plus token-bundle review/import/update replacement through UI/HTTP/MCP, saved repo component mappings, variant-aware code mapping props, selected-instance variant controls including boolean-like toggles, selected-main-component multi-property variant authoring with select/boolean property types, editable matrix cells, property deletion with a last-property guard, variant deletion with invalid-instance fallback, duplicate warnings, context-menu combine-as-variants for selected sibling main components through UI and agent commands, component-instance text/fill/stroke/opacity/geometry/effect-shadow override preservation while switching variants, optional variant-owned source trees, component-instance source-tree materialization on create/switch, saved variant-area layout metadata with Inspector/agent controls, source-node reflow, canvas outlines, direct viewport gap handles, direct viewport source reorder handles, single CSS box-shadow effect metadata/editing/rendering/handoff, ordered multi-effect shadow stacks, selected-layer SVG/PDF effect-shadow artifact fidelity, and selected-layer PNG/JPEG/WEBP raster shadow-stack fidelity: arbitrary filter/effect graph fidelity, hosted multi-instance registry sync with durable auth, and hosted durable pub/sub fanout beyond shared-filesystem registry events.
4. Developer handoff beyond the visible Inspector Dev tab backed by existing HTTP code export data, CSS/HTML/structure copy controls, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF nested text/shape child rendering, SVG image data URLs and effect-shadow filters, PDF embedded source image files and transparent effect-shadow resources, PDF visual rendering for PNG, WEBP, and SVG image nodes, selected-layer PNG/JPEG/WEBP scale options with shadow-stack-aware raster bounds, persistent selected-layer export presets, multi-selection export review, page-level export review, checked-artifact ZIP packaging, structured ready-for-dev annotations, saved repo component mapping copy, selected-instance variant-aware usage snippets, and CSS box-shadow/structure metadata for effect shadows and ordered multi-shadow stacks: advanced filter/effect export fidelity, webhook/API integration stories, and plugin integration stories.
5. Full import/export workflow beyond the landed single-file, project-level,
   package-style shared-library Layo ZIP archive review UI, server-local
   published library registry review/import/update UI/HTTP/MCP path,
   registry token-bundle review/import/update replacement path, and
   no-write Penpot/Figma migration preflight, first Figma REST JSON basic
   import path, and Figma packaged image-fill import path:
   hosted database/object-store storage and backup retention automation,
   hosted multi-instance registry sync with durable auth, hosted
   durable pub/sub fanout beyond shared-filesystem registry events, and
   deeper Penpot/Figma geometry/style/component/variant/effect import mapping
   where feasible.
6. Plugin/API extensibility lane that does not weaken deterministic MCP commands.
7. Production-grade self-host and CI-owned Vercel deployment automation after the GitHub Actions Vercel production workflow has valid project secrets, a repository-admin homepage token, durable hosted storage/backups, and the live production smoke verifier passes against the Vercel deploy output URL. The current manual `jsleemasters-projects/layo` deployment is verified at `https://layo-three.vercel.app/`, but workflow-owned repeatability remains a gap.
