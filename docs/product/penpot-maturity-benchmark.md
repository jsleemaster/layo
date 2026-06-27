# Penpot Maturity Benchmark

Last checked: 2026-06-27

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
| Collaboration | Realtime collaboration as a core team feature. | Yjs relay, presence, remote selection, roles, E2EE snapshots, manual saved file versions with HTTP/MCP/UI restore, thresholded automatic file versions for persisted edits, a file-panel saved-version preview with current-file change-summary diff, pinned saved-version checkpoints with HTTP/MCP/UI controls, manual saved-version delete, explicit retention cleanup that prunes only old unpinned versions, and selected-node comment threads with sidecar storage, HTTP/MCP/Inspector create-list-resolve-reply flows, viewport bubbles for unresolved node comments, persisted `@mention` extraction, structured local team-member mention targets from active team manifests, local viewer unread/read state, local project/file unread notification summaries with current-file mark-read, local viewer-targeted mention notification counts, browser polling refresh for fallback delivery, process-local SSE comment event delivery for open editor sessions, and a retained local comment activity feed for create/reply/resolve events. Full CRDT-backed live comment editing, cross-process/pubsub event fanout, external notification channels, full visual preview, and branch/review/merge workflows remain immature. | Collaboration treated as core product maturity, including comments, history, review, and recovery. |
| Design systems | Tokens, components, variants, shared libraries. | Components, instances, first-class color, spacing, and typography tokens, document-local reusable color and typography styles with selected-node/text bindings, ordered token-set metadata, per-token set ids, active token-set override resolution, node fill-token bindings, layout gap/padding spacing-token bindings, text typography-token bindings, DTCG color/spacing/typography import/export through UI/HTTP/MCP, agent-editable token and style commands, Inspector token/style readouts, text typography-token controls, token-set toggles, CSS-variable code export, reusable style metadata in code export, package-style `.layo-library.zip` handoff for reusable components, tokens, and referenced component image assets, first-class saved repo component mappings, variant-aware mapping props for code handoff, right Inspector selected-instance variant controls including boolean-like toggles, and right Inspector selected-main-component multi-property variant name/property/value authoring with combination selection, basic matrix overview, and duplicate-combination warnings exist; richer style management, richer theme/mode management, explicit variant property type authoring, advanced matrix editing, and hosted library registry/sync remain immature. | First-class variables, styles, variants, library reuse, and code mapping. |
| Layout | Flex and grid oriented layout primitives. | Layout metadata, constraints, single-axis flow, reverse row/column flow, horizontal flex single-line and wrapped-line baseline alignment, grid row baseline alignment, vertical writing-mode baseline metadata/control/export, wrap, fallback gap, row/column gap split, padding, child margins, child fill width/height sizing, direct resize fill-to-fixed layout-item pinning, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, basic Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, single-cell empty-cell area creation menu, multi-cell merge/split menus, container-level grid horizontal item alignment with stretch, per-item grid self alignment with stretch, static/absolute layout item positioning, min/max sizing rules, cross-axis alignment, main-axis distribution, wrapped-line distribution, and container fit width/height sizing exist; full visual vertical text rendering, deeper CSS baseline group semantics, and remaining deeper resizing semantics remain immature. | Auto layout, constraints, grid-like behavior, resizing semantics, and export parity. |
| Import/export | Penpot file import/export, backups, shared libraries, assets. | Local design JSON, asset storage, image paste/drop, code export, document-local DTCG color/spacing token import/export, a Layo-specific standard ZIP file archive with `manifest.json`, `document.json`, and packaged referenced image assets through storage, HTTP, MCP, and visible file-panel web controls, project-level `.layo-project.zip` archives that package `ProjectManifest`, all member `DesignFile` documents, and referenced assets through storage, HTTP, web API helpers, and visible file-panel review/import controls, and package-style `.layo-library.zip` archives that export, server-review, and merge reusable components, tokens, and component image assets into the current target file. Single-file, project, and library archive imports have server-validated no-write review steps before writing; project archive imports create fresh private projects and fresh document ids, while library imports remap conflicting ids instead of overwriting target tokens/components. Backup/restore runbooks, hosted shared-library registry/update sync, and Penpot/Figma migration paths remain immature. | Open project export/import, Penpot/Figma migration paths, asset packaging, and backup/restore. |
| Developer handoff | Inspect, HTML/CSS/SVG access, API, webhooks, plugin integrations. | MCP/HTTP inspect, validate, change summary, structured code export, and a visible Inspector Dev tab that shows selected-layer geometry, fill, generated CSS, generated HTML, exported structure, copy controls for CSS/HTML/structure snippets, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF artifacts that include nested text and shape child layers, selected-layer SVG exports with embedded image data URLs, selected-layer PDF exports with embedded source image files, selected-layer PDF rendering for PNG image nodes, selected-layer PDF rendering for WEBP and SVG image nodes through browser-generated PNG previews, selected-layer PNG/JPEG/WEBP 1x/2x/3x scale options, persistent selected-layer export presets with batch download, multi-selection export review with per-artifact include/exclude controls, page-level export review when no layer is selected, export review ZIP packaging for checked artifacts, ready-for-dev annotation rows for selected-layer identity, geometry, style, content, layout, component, and asset handoff, saved repo component mappings in HTTP/MCP plus Dev Panel import/usage copy, and variant-aware code mapping usage snippets that resolve selected instance variants exist. Broader raster/effect export fidelity, webhooks/API integration stories, and plugin integration stories remain immature. | Visible Dev panel plus MCP/API surfaces, repo component mappings, and ready-for-dev annotations. |
| Extensibility | Plugin system and API integrations. | No plugin runtime; deterministic agent commands exist. | Plugin/API lane that complements MCP instead of replacing it. |
| AI workflow | Penpot MCP reads/writes the focused file through plugin/API context. | Layo MCP/HTTP applies typed command batches directly to saved design files. | Keep typed deterministic commands as a differentiator while matching Penpot-level breadth. |
| Operations | Self-hosting, configuration, Docker/Kubernetes guidance. | Vercel/static plus Node server and relay deployment notes, Vercel full-stack routing artifacts, a GitHub Actions production deployment path with required Vercel and repository-admin secret checks, deploy-output-derived live smoke verification, GitHub About homepage update only after smoke passes, and a live production smoke verifier that rejects non-Layo Vercel pages and no longer defaults to a stale hard-coded URL. Actual production is only proven after the workflow has valid Vercel credentials, a repository-admin homepage token, and the deploy-output URL smoke check passes. | Production-grade self-host, Vercel-compatible app deployment, backups, migrations, monitoring, and upgrade docs. |

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
2. Full comment and history workflow beyond selected-node create/list/resolve/reply, viewport unresolved-comment bubbles, persisted mentions, structured local team-member mention targets, local unread/read state, local project/file unread summaries, local viewer-targeted mention notification counts, browser polling fallback, process-local SSE comment event delivery, retained local create/reply/resolve activity feed, manual/automatic saved file versions, current-file diff preview, restore path, pinned saved-version checkpoints, manual saved-version delete, and explicit unpinned retention cleanup: full CRDT-backed live comment editing, cross-process/pubsub event fanout for deployed multi-instance servers, external notification channels, full visual preview, branch/review/merge, and richer recovery workflow.
3. Design-system maturity beyond first-class color/spacing/typography tokens, document-local reusable color/typography styles, ordered token-set metadata, active token-set override resolution, fill bindings, layout gap/padding spacing-token bindings, text typography-token bindings, DTCG color/spacing/typography import/export, package-style shared-library archives, saved repo component mappings, variant-aware code mapping props, selected-instance variant controls including boolean-like toggles, and selected-main-component multi-property variant authoring with basic matrix overview and duplicate warnings: richer style management, richer theme/mode management, explicit variant property type authoring, advanced matrix editing, and hosted library registry/update sync.
4. Developer handoff beyond the visible Inspector Dev tab backed by existing HTTP code export data, CSS/HTML/structure copy controls, selected-layer SVG/PNG/JPEG/WEBP/PDF downloads, selected-layer frame/group SVG/PDF nested text/shape child rendering, SVG image data URLs, PDF embedded source image files, PDF visual rendering for PNG, WEBP, and SVG image nodes, selected-layer PNG/JPEG/WEBP scale options, persistent selected-layer export presets, multi-selection export review, page-level export review, checked-artifact ZIP packaging, structured ready-for-dev annotations, saved repo component mapping copy, and selected-instance variant-aware usage snippets: broader raster/effect export fidelity, webhook/API integration stories, and plugin integration stories.
5. Full import/export workflow beyond the landed single-file, project-level,
   and package-style shared-library Layo ZIP archive review UI:
   backup/restore runbooks, hosted shared-library registry/update sync, and
   Penpot/Figma migration paths where feasible.
6. Plugin/API extensibility lane that does not weaken deterministic MCP commands.
7. Production-grade self-host and actual Vercel app deployment after the GitHub Actions Vercel production workflow has valid project secrets, a repository-admin homepage token, and the live production smoke verifier passes against the Vercel deploy output URL.
