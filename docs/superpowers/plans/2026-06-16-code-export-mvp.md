# Code Export MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export Layo design nodes into CSS, HTML, and element-separated JavaScript modules that can be imported directly by code.

**Architecture:** Add a pure server-side exporter module that accepts `DesignFile` JSON and returns in-memory artifacts. Storage, HTTP, and MCP expose the same export surface, while tests verify both text output and real per-element dynamic imports.

**Tech Stack:** TypeScript, Vitest, Fastify, MCP SDK, Node dynamic `import()`.

---

## Tasks

- [x] Write RED tests in `apps/server/src/code-export.test.ts` for CSS export, HTML export, and separated JS module import.
- [x] Implement `apps/server/src/code-export.ts` with `exportDesignToCode(document, options)`.
- [x] Add `FileStorage.exportCode(fileId, options)`.
- [x] Add HTTP `GET /files/:fileId/export/code` and MCP `export_code`.
- [x] Verify with `pnpm --filter @layo/server test` and `pnpm --filter @layo/server typecheck`.

## Export Contract

The exporter returns:

- `css`: one stylesheet with reusable classes and per-node classes.
- `html`: one static HTML fragment.
- `elements`: root element artifacts with `{ id, name, className, html, css, jsModule }`.
- `indexModule`: JavaScript that imports and re-exports each element module.

Root elements are direct page children. Child nodes remain nested inside each root artifact.
