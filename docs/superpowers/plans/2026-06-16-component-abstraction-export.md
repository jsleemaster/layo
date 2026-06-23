# Component Abstraction Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `export_code` return a codegen-ready component abstraction spec so an agent can reimplement exported elements directly from the MCP result.

**Architecture:** Extend the existing pure `exportDesignToCode` module rather than adding a parallel exporter. Build recursive `structure` objects from `DesignNode`, attach per-element `implementation` hints, and aggregate document-level component definitions plus token candidates into `implementationSpec`.

**Tech Stack:** TypeScript, Vitest, Fastify, MCP SDK.

---

## Files

- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `apps/server/src/http.test.ts`
- Modify: `README.md`

## Tasks

- [x] Add RED tests for `elements[].structure`, `elements[].implementation`, and `implementationSpec.elements`.
- [x] Add RED tests for component definitions and component instance references in `implementationSpec.components`.
- [x] Implement recursive node structure export in `apps/server/src/code-export.ts`.
- [x] Implement component implementation hints and token candidate aggregation.
- [x] Extend HTTP export test to verify the structured spec is returned through the public API.
- [x] Update README code export section to describe `implementationSpec`.
- [x] Run `pnpm --filter @layo/server test` and `pnpm --filter @layo/server typecheck`.
- [x] Run full repo verification and Playwright CLI e2e before PR/merge.

## Expected Export Shape

```ts
type CodeExportResult = {
  css: string;
  html: string;
  elements: Array<{
    id: string;
    name: string;
    className: string;
    html: string;
    css: string;
    jsModule: string;
    structure: CodeStructureNode;
    implementation: ElementImplementationSpec;
  }>;
  implementationSpec: {
    elements: ElementCodeArtifact[];
    components: ComponentImplementationArtifact[];
    tokenCandidates: TokenCandidateSummary;
  };
  indexModule: string;
};
```

The MCP `export_code` tool returns this object unchanged under `export`, so no separate MCP implementation is needed after the shared exporter changes.
