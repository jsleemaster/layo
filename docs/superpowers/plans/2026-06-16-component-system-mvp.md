# Component System MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first Figma-style component system MVP with component definitions, component instances, detach support, UI controls, HTTP/MCP tools, and direct Playwright verification.

**Architecture:** Store reusable components in `DesignFile.components[]`; represent canvas component roots using `NodeKind.Component` and `NodeKind.ComponentInstance`; store instance linkage in optional node metadata. The web editor command model mirrors the document shape for UI behavior, while Rust and server storage keep the serialized model honest.

**Tech Stack:** Rust 2021, serde, ts-rs, TypeScript, React, React Konva, Fastify, MCP SDK, Vitest, Playwright CLI.

---

## File Structure

- Modify `crates/editor-core/src/model.rs`: component definitions, variants, instance metadata.
- Modify `crates/editor-core/src/commands.rs`: create component and detach instance commands.
- Modify `crates/editor-core/tests/document_model.rs`: JSON round trip with components.
- Modify `crates/editor-core/tests/commands_and_context.rs`: component command tests.
- Modify `packages/renderer/src/index.ts`: renderer node/component types.
- Modify `apps/web/src/editor-state.ts`: create component, create instance, detach instance commands.
- Modify `apps/web/src/editor-state.test.ts`: TDD for web component behavior.
- Modify `apps/web/src/App.tsx`: toolbar buttons and component summary.
- Modify `apps/server/src/storage.ts`: component storage helpers.
- Modify `apps/server/src/storage.test.ts`: persistence tests.
- Modify `apps/server/src/http.ts`: component HTTP routes.
- Modify `apps/server/src/http.test.ts`: route tests.
- Modify `apps/server/src/mcp.ts`: component MCP tools.
- Modify `apps/web/e2e/editor-mvp.spec.ts`: browser verification for component flow.

## Tasks

- [ ] Add failing Rust tests for component serialization and commands.
- [ ] Implement Rust model and command support.
- [ ] Add failing TypeScript editor-state tests for create component, create instance, and detach.
- [ ] Implement web editor-state component commands.
- [ ] Add UI buttons and inspector/layer labels for component and instance nodes.
- [ ] Add failing server storage/HTTP tests for component operations.
- [ ] Implement server storage and HTTP component routes.
- [ ] Add MCP tools: `list_components`, `create_component`, `create_component_instance`, `detach_instance`.
- [ ] Extend Playwright e2e to click Create Component, Create Instance, and Detach Instance.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm --filter @layo/web build`, and `pnpm test:e2e` against the current branch.

## Completion Rule

Do not call this complete unless the merged main branch contains the component model, UI controls, HTTP/MCP tools, and Playwright CLI proves the component flow in the actual browser.
