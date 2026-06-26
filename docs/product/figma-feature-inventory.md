# Figma Feature Inventory

Last checked: 2026-06-27

This inventory is based on current Figma Learn and Figma developer documentation. It is intentionally broader than the current Layo MVP so we can decide which Figma behaviors to adopt, adapt, defer, or exclude with a stable record.

## Source Set

- Figma products and plan features: https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features
- Figma Design documentation index: https://help.figma.com/hc/en-us/categories/360002042553-Figma-Design
- Auto layout: https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout
- Constraints: https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize
- Prototyping: https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma
- Variables: https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma
- Libraries: https://help.figma.com/hc/en-us/articles/360041051154-Guide-to-libraries-in-Figma
- Inspect and Dev Mode: https://help.figma.com/hc/en-us/articles/22012921621015-Guide-to-inspecting
- Code Connect: https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect
- Figma MCP server: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- Figma REST API: https://developers.figma.com/docs/rest-api/
- Figma MCP tools: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Figma AI in Design: https://help.figma.com/hc/en-us/articles/23870272542231-Use-AI-tools-in-Figma-Design
- FigJam: https://help.figma.com/hc/en-us/articles/1500004362321-Guide-to-FigJam
- Figma Slides: https://help.figma.com/hc/en-us/articles/24170630629911-Explore-Figma-Slides
- Figma Draw: https://help.figma.com/hc/en-us/articles/31440394517143-Explore-Figma-Draw
- Figma Sites: https://help.figma.com/hc/en-us/articles/31230436657815-Explore-Figma-Sites
- Figma Buzz: https://help.figma.com/hc/en-us/articles/31271566667543-Guide-to-Figma-Buzz
- Figma Make: https://help.figma.com/hc/en-us/articles/31304412302231-Explore-Figma-Make
- Sharing and permissions: https://help.figma.com/hc/en-us/articles/1500007609322-Guide-to-sharing-and-permissions
- Branching: https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching
- Comments: https://help.figma.com/hc/en-us/articles/360039825314-Guide-to-comments-in-Figma
- Core interaction rule matrix: `docs/product/figma-core-interaction-rules.md`

## Product Surface Map

Figma currently spans these product surfaces:

| Surface | What It Covers | Layo Relevance |
| --- | --- | --- |
| Figma Design | Interface design, layer editing, layout, components, design systems, prototyping, collaboration, import/export. | Core reference surface. This is the primary parity target. |
| Dev Mode | Inspect, measure, export, annotations, ready-for-dev, Code Connect, MCP design context. | High relevance because this project is agent-operable and code-export oriented. |
| FigJam | Whiteboard, stickies, shapes, connectors, diagrams, widgets, comments, meetings, AI. | Partial relevance. Diagrams and comments are useful later; full whiteboard parity is not a near-term goal. |
| Figma Slides | Collaborative decks, design mode, presenter notes, polls, comments, export. | Low near-term relevance. Reuse design-file primitives only. |
| Figma Draw | Illustration tools, pen, brush, pencil, transforms, textures, advanced vector workflows. | Medium long-term relevance. Basic vector editing comes before artistic tools. |
| Figma Sites | Responsive website design, pages, interactions, publishing, code layers, CMS. | Partial relevance through responsive layout and export/deployment, not hosted site publishing. |
| Figma Buzz | On-brand marketing assets, templates, controlled editing, bulk asset workflows. | Defer. Useful only after templates/libraries exist. |
| Figma Make | Prompt-to-app functional prototypes and web apps. | Do not clone directly. Our agent-control and code-export surfaces are the native alternative. |
| Figma AI | Search, first drafts, content replacement, interaction generation, layer renaming, image tools, vectorize. | Adapt selectively through deterministic agent commands and validation. |
| Platform APIs | REST API, plugin API, widgets, webhooks, variable API, activity logs, MCP server. | High relevance for MCP/API design, import/export, and automation. |

## Figma Design Feature Inventory

| Feature Group | Figma Capability | Current Canvas State | Migration Decision |
| --- | --- | --- | --- |
| Files and projects | Teams, projects, files, pages, drafts, project permissions, file sharing. | Single sample file, local file storage, team manifests for collaboration. | Adapt. Keep local-first files, then add multi-file browser and project metadata without central SaaS dependency. |
| Version history | File-level version history, named versions, restore points. | Document `version` exists, but no visible history timeline. | Adopt later. Needed before branch/merge. |
| Branching and merging | Create branches, review branch changes, merge back, keep branch checkpoints. | Not implemented. | Defer until version history and change summaries become diff-capable. |
| Canvas navigation | Zoom, pan, stage, page canvas, nudge values, view options. | Basic zoom, fixed stage, browser editor shell. | Adopt. Add panning, fit selection, better keyboard navigation, and nudge settings. |
| Layer model | Pages, frames, shapes, text, images, groups, sections, parent/child hierarchy, selection. | Pages, frames, transparent groups, rectangles, text, images in type model, nested children, image insertion by paste/drop, layer ordering, node lock/visibility state, context-menu group/ungroup, context-menu frame selection for sibling layers, context-menu select all/same kind, context-menu flip/fit selection/export actions, and image natural-size metadata. No sections UI. | Adopt. Add richer layer nesting controls, section-like organization, and more object context-menu groups. |
| Geometry | Move, resize, rotate, flip, x/y/w/h fields, bounding boxes. | Move, four corner resize handles only, selection size badge, x/y/w/h fields, rotation in model only. | Adapt. Keep corner-only resize handles unless edge resize is explicitly reintroduced; add rotation, flip, proportional scale, and keyboard nudging. |
| Precision editing | Alignment, distribute, tidy, rulers, guides, layout guides. | Inspector alignment/distribution controls, hover measurement overlay, selected-frame padding and child-spacing guides. | Adopt after layout foundation. Add rulers, manual guides, snap settings, and tidy up later. |
| Shape and vector tools | Basic shapes, pen/pencil, vector networks, shape builder, boolean-like combines, stroke-to-vector. | Rectangle only in UI; text/frame in model. | Adopt incrementally. Basic shape set first; advanced vector tools later. |
| Figma Draw | Brush, pencil, textures, transforms, illustration-focused sidebar. | Not implemented. | Defer. Basic vector editing is the prerequisite. |
| Text and typography | Fonts, text properties, text styles, auto-resize, max lines, text-to-vector. | Text value, font size, font family in model and inspector. | Adopt. Add font controls, text alignment, line height, letter spacing, text resizing modes. |
| Fills and imagery | Solid fills, gradients, image fills, patterns, color picker. | Solid fill plus local image asset storage, image nodes inserted by clipboard paste or file drag/drop, context-menu `이미지 바꾸기`, context-menu `이미지 채우기`/`이미지 맞춤`, and context-menu `원본 크기로 맞춤` for uploaded images. | Adopt. Add gradients, explicit image crop controls, and richer image-fill positioning next; patterns later. |
| Strokes and effects | Stroke position/options, shadows, blur, blend modes, opacity, corner radius/smoothing. | Fill, stroke, stroke width, opacity. | Adopt selectively. Corner radius, shadows, and blur before blend modes. |
| Constraints | Horizontal and vertical constraints define how layers respond when parent frames resize. | Not implemented. | Adopt now. This directly addresses Figma-like responsive positioning. |
| Auto layout | Horizontal, vertical, and grid flows; padding; gap; resizing; nested flows; ignore auto layout. | Not implemented. | Adopt now. This is the first major parity gap behind automatic positioning. |
| Components | Main components, instances, detach, component sets, variants, component properties, instance swaps. | Component definitions, instances, detach, default variant metadata. No variant/property UI. | Extend. Keep current primitive and add properties, variants, swaps, slots, and override behavior. |
| Slots | Flexible component placeholders and nested replacement regions. | Not implemented. | Adopt after component properties. |
| Libraries | Publish and consume components, styles, and variables across files. | Components are file-local. | Adapt. Use local/team manifests and package-style libraries before any hosted registry. |
| Styles | Reusable color, text, effect, and layout guide styles. | App design tokens exist; document styles are not first-class. | Adopt. Needed for design-system parity and code export. |
| Variables | Color, number, string, and boolean variables; collections; modes; token-like design values; prototype logic. | Code export has token candidates only. | Adopt. Variables should become first-class document data. |
| Prototyping | Flows, triggers, actions, transitions, overlays, scroll overflow, smart animate, variables, expressions, conditionals. | Not implemented. | Stage. Basic frame-to-frame interactions first; smart animate and conditionals later. |
| Presentation view | Play prototypes, responsive prototype viewport, device/background settings. | Not implemented. | Defer until basic prototyping exists. |
| Comments | Canvas comments, threads, replies, mentions, prototype comments. | Selected-node comments, replies, resolved state, viewport bubbles, persisted mention extraction, local unread/read state, local project/file unread summaries with current-file mark-read, and retained local create/reply/resolve activity feed exist. Prototype comments, live sync, real team activity notifications, and real team-member mention targeting are not implemented. | Adopt for collaboration. Comment data can stay local/team-owned. |
| Multiplayer | Realtime editing, cursor chat, audio, spotlight, viewer history. | Realtime document sync, presence, remote cursor and selection. No chat/audio/spotlight. | Extend. Cursor chat and comments are nearer than audio. |
| Dev handoff | Inspect layer properties, measure, export, annotations, ready-for-dev. | MCP/HTTP inspect, validate, change summary, code export. No visual Dev Mode panel. | Adapt. Our structured inspect/export should become a first-class Dev panel. |
| Code Connect | Map design components to real code components and enrich Dev Mode/MCP output. | Code export produces suggested implementation specs. | Adapt. Add repo component mapping before trying to match Figma Code Connect. |
| MCP server | Figma MCP reads context, screenshots, variables, libraries, code connect maps, creates/edits Figma content. | This project already has its own MCP/HTTP control plane. | Adopt conceptually. Maintain deterministic tool surfaces as a differentiator. |
| REST/plugin platform | Files, images, versions, comments, projects, components/styles, variables, dev resources, webhooks, plugin API. | Local HTTP API and MCP server exist; no plugin API. | Defer plugin runtime; continue expanding HTTP/MCP. |
| AI tools | Find assets, replace content, add interactions, rename layers, rewrite/translate text, image generation/editing, vectorize, Figma agent. | Agent-control surfaces exist; no in-product AI UI. | Adapt. Prefer auditable command batches over opaque generation. |

## Non-Design Product Inventory

| Surface | Feature Group | Migration Decision |
| --- | --- | --- |
| FigJam | Stickies, shapes, connectors, tidy, comments, reactions, widgets, AI board generation. | Defer full whiteboard. Later, add diagram/import helpers and comment primitives that reuse canvas data. |
| Slides | Slide decks, slide templates, presenter notes, polls, comments, design mode, export. | Defer. The editor should not become a deck tool until core design workflows mature. |
| Sites | Responsive pages, web publishing, interactions, custom cursors, code layers, CMS. | Adopt only responsive layout and export concepts. Do not add hosted publishing as a core requirement. |
| Buzz | Brand templates, controlled editing, bulk marketing asset creation, AI image/text helpers. | Defer. Requires libraries, variables, template permissions, and export presets first. |
| Make | Prompt-to-app prototyping and collaborative code editing. | Do not clone. The equivalent direction is agent-controlled editing plus structured code export. |
| Enterprise admin | SSO, SCIM, activity logs, external content controls, public link expiration, plugin management. | Mostly exclude from MVP. Team-owned local manifests can later add audit logs and role controls. |

## Parity Gaps That Matter Most

The most important Figma gaps for this repo are not the largest feature surfaces. They are the features that make a canvas editor feel predictable:

1. Auto layout and constraints.
2. Core editing shortcuts and selection rules: delete, duplicate, copy/paste, multi-select, nesting, and layer ordering.
3. Resize, alignment, distribution, and snap guides.
4. Component variants, properties, overrides, swaps, and slots.
5. Variables, styles, and library-like reuse.
6. Comments, version history, and branchable change review.
7. Prototype links and basic presentation mode.
8. Dev handoff panel backed by the existing MCP/HTTP/code-export model.

These become the migration roadmap in `docs/product/figma-migration-roadmap.md`.
