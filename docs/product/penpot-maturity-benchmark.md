# Penpot Maturity Benchmark

Last checked: 2026-06-26

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
- Penpot flexible layouts: https://help.penpot.app/user-guide/designing/flexible-layouts/

Refresh this document when those sources materially change or when a Layo
implementation slice reveals a new gap.

## Maturity Dimensions

| Dimension | Penpot benchmark | Layo current posture | Layo target |
| --- | --- | --- | --- |
| Product class | Full-stack design platform for design, code, AI, and team workflows. | Local-first editor with growing Figma-like interactions and agent control. | Professional team design product. |
| Hosting and ownership | Cloud or self-hosted instance with teams, projects, and files. | Local project manifests, static web shell, optional team-owned relay. | Self-hostable full product path with project API, web shell, assets, auth, relay, and operations docs. |
| Collaboration | Realtime collaboration as a core team feature. | Yjs relay, presence, remote selection, roles, E2EE snapshots. | Collaboration treated as core product maturity, including comments, history, review, and recovery. |
| Design systems | Tokens, components, variants, shared libraries. | Components and instances exist; variables/styles/libraries are immature. | First-class variables, styles, variants, library reuse, and code mapping. |
| Layout | Flex and grid oriented layout primitives. | Layout metadata, constraints, single-axis flow, reverse row/column flow, wrap, fallback gap, row/column gap split, padding, child margins, child fill width/height sizing, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, basic Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, static/absolute layout item positioning, min/max sizing rules, cross-axis alignment, main-axis distribution, wrapped-line distribution, and container fit width/height sizing exist; empty-cell merge menus, baseline alignment, and deeper resizing semantics remain immature. | Auto layout, constraints, grid-like behavior, resizing semantics, and export parity. |
| Import/export | Penpot file import/export, backups, shared libraries, assets. | Local design JSON, asset storage, image paste/drop, code export. | Open project export/import, Penpot/Figma migration paths, asset packaging, and backup/restore. |
| Developer handoff | Inspect, HTML/CSS/SVG access, API, webhooks, plugin integrations. | MCP/HTTP inspect, validate, change summary, and structured code export. | Visible Dev panel plus MCP/API surfaces, repo component mappings, and ready-for-dev annotations. |
| Extensibility | Plugin system and API integrations. | No plugin runtime; deterministic agent commands exist. | Plugin/API lane that complements MCP instead of replacing it. |
| AI workflow | Penpot MCP reads/writes the focused file through plugin/API context. | Layo MCP/HTTP applies typed command batches directly to saved design files. | Keep typed deterministic commands as a differentiator while matching Penpot-level breadth. |
| Operations | Self-hosting, configuration, Docker/Kubernetes guidance. | Vercel/static plus Node server and relay deployment notes. | Production-grade self-host, Vercel-compatible app deployment, backups, migrations, monitoring, and upgrade docs. |

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

1. Complete Penpot-like layout maturity beyond the landed Flex alignment, reverse row/column flow, child-margin, child fill sizing, equal-cell grid auto-placement, manual grid cell placement, grid item spans, pixel/fraction/auto grid track units, named grid areas, viewport grid track resize handles, viewport grid add-row/add-column controls, viewport grid remove-row/remove-column controls, viewport row/column header context menus, viewport delete-track-with-shapes actions, basic viewport row/column reorder controls, basic Ctrl/Command preserve-elements reorder variation, bounded span/named-area viewport reorder, direct selected area/span boundary handles, static/absolute layout-item, wrap, row/column gap, container fit sizing, and min/max sizing slices: empty-cell merge menus, baseline alignment, and deeper resizing semantics.
2. Comments, version history, branch/review/merge, and recovery workflow.
3. Variables, styles, variants, shared libraries, and code component mappings.
4. Visible Dev panel backed by existing MCP/HTTP inspect/export data.
5. Open file import/export and backup/restore, including Penpot/Figma migration
   paths where feasible.
6. Plugin/API extensibility lane that does not weaken deterministic MCP commands.
7. Production-grade self-host and Vercel app deployment with operations checks.
