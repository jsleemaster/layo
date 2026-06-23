# Collaboration Concurrency Safeguards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan also requires superpowers:test-driven-development: every behavior change starts with a failing test and the implementation does not move forward until the focused test turns green.

**Goal:** Make 5-person collaboration safe enough for real team editing by preventing whole-document overwrite conflicts, exposing soft editing claims through awareness, and defining shared image asset metadata semantics.

**Architecture:** Replace the current JSON-backed collaboration document internals with a granular Yjs representation while keeping the existing `createCollaborativeDesignDocument` API stable for web and agent callers. Add awareness-only soft locks so users can see who is editing a node without blocking CRDT updates. Add team asset metadata contracts so image nodes can be synchronized independently from local binary storage.

**Tech Stack:** TypeScript, Yjs, Vitest, Playwright CLI, React/Vite, existing `@layo/collaboration` package, existing web collaboration session, existing Fastify/MCP agent bridge.

---

## Execution Status

Completed on 2026-06-19.

Implemented outcomes:
- Granular Yjs node-field updates preserve independent geometry and text edits.
- Seeded collaborators merge duplicate page ids when CRDT page items race.
- Awareness presence carries soft editing claims.
- Team asset metadata uses content-addressed ids.
- Collaborative agent writes fail fast when remote state changes before apply.
- Encrypted collaboration now carries Yjs sync protocol messages inside encrypted payloads and re-requests sync after remote awareness changes.
- Playwright collaboration coverage includes a two-editor concurrent move/text edit flow.

Verification evidence:
- Focused red/green tests were run for each behavior before implementation.
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @layo/web build`
- `pnpm test:e2e:collab` passed twice after the encrypted order-dependent failure was fixed.

---

## File Structure

- Modify `packages/collaboration/src/yjs-document.ts`
  - Keep the existing `CollaborativeDesignDocument` public API.
  - Store document metadata, pages, nodes, and child order in granular Yjs maps/arrays.
  - Preserve read/write compatibility for existing callers.
- Modify `packages/collaboration/src/yjs-document.test.ts`
  - Add red tests for independent node-field edits merging across two Yjs documents.
  - Keep existing JSON-backed behavior tests passing.
- Modify `packages/collaboration/src/awareness.ts`
  - Add optional soft editing claim fields to `CollaborationPresence`.
- Modify `packages/collaboration/src/awareness.test.ts`
  - Add tests for summarizing soft editing claims.
- Create `packages/collaboration/src/assets.ts`
  - Define team asset metadata and content-hash helpers.
- Create `packages/collaboration/src/assets.test.ts`
  - Add tests for stable asset ids and duplicate image metadata.
- Modify `packages/collaboration/src/index.ts`
  - Export the asset metadata contract.
- Modify `apps/web/src/collaboration/collab-session.ts`
  - Thread soft editing claims through `updatePresence`.
- Modify `apps/web/src/collaboration/collab-session.test.ts`
  - Assert presence updates carry editing claims.
- Modify `apps/server/src/collaboration-agent.ts`
  - Add a stale remote-state guard before agent apply.
- Modify `apps/web/e2e/collaboration.spec.ts`
  - Verify two browser contexts can edit different fields without losing either edit.

## Verification Loop

Each task follows this loop:

1. Write one failing test.
2. Run only that test and confirm the expected failure.
3. Implement the smallest code needed.
4. Re-run the focused test.
5. If it fails, return to step 3 without broadening scope.
6. When focused green, run the nearest package tests.
7. Commit that task.
8. After all tasks, run:

```bash
pnpm typecheck
pnpm test
pnpm --filter @layo/web build
pnpm test:e2e:collab
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --reporter=line
```

For any editor/browser interaction regression, run a direct Playwright CLI interaction pass against the live editor and record the visible result.

## Task 1: Granular Yjs Document Merge

**Files:**
- Modify: `packages/collaboration/src/yjs-document.test.ts`
- Modify: `packages/collaboration/src/yjs-document.ts`

- [ ] **Step 1: Write the failing merge test**

Append this test to `packages/collaboration/src/yjs-document.test.ts`:

```ts
test("merges concurrent edits to different fields on the same node", () => {
  const first = createCollaborativeDesignDocument({ document: sampleDocument() });
  const second = createCollaborativeDesignDocument({ document: sampleDocument() });

  Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
  Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

  first.transact("move-node", (current) => {
    const next = structuredClone(current);
    const textNode = next.pages[0]?.children[0];
    if (!textNode) {
      throw new Error("missing text node");
    }
    textNode.transform.x = 96;
    return next;
  });

  second.transact("edit-text", (current) => {
    const next = structuredClone(current);
    const textNode = next.pages[0]?.children[0];
    if (!textNode || textNode.content.type !== "text") {
      throw new Error("missing text node");
    }
    textNode.content.value = "Concurrent headline";
    return next;
  });

  Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
  Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

  const mergedFromFirst = first.getDocument().pages[0]?.children[0];
  const mergedFromSecond = second.getDocument().pages[0]?.children[0];

  expect(mergedFromFirst?.transform.x).toBe(96);
  expect(mergedFromFirst?.content).toMatchObject({ type: "text", value: "Concurrent headline" });
  expect(mergedFromSecond).toEqual(mergedFromFirst);

  first.destroy();
  second.destroy();
});
```

- [ ] **Step 2: Run the red test**

Run:

```bash
pnpm --filter @layo/collaboration test -- yjs-document.test.ts -t "merges concurrent edits to different fields on the same node"
```

Expected: FAIL because the current whole-document JSON map allows one concurrent update to overwrite the other.

- [ ] **Step 3: Implement granular storage behind the stable API**

In `packages/collaboration/src/yjs-document.ts`, keep the exported interface unchanged and replace the internal root shape with:

```ts
const DOCUMENT_META = "documentMeta";
const PAGES = "pages";
const NODES = "nodes";
const COMPONENTS = "components";

type YNodeMap = Y.Map<unknown>;
```

Add helpers:

```ts
function writeDocumentToYjs(ydoc: Y.Doc, document: RendererDocument): void
function readDocumentFromYjs(ydoc: Y.Doc): RendererDocument
function writeNode(nodes: Y.Map<YNodeMap>, node: RendererNode): void
function readNode(nodes: Y.Map<YNodeMap>, nodeId: string): RendererNode
```

Store node scalar fields as independent keys:

```ts
nodeMap.set("id", node.id);
nodeMap.set("kind", node.kind);
nodeMap.set("name", node.name);
nodeMap.set("transform", structuredClone(node.transform));
nodeMap.set("size", structuredClone(node.size));
nodeMap.set("style", structuredClone(node.style));
nodeMap.set("content", structuredClone(node.content));
nodeMap.set("children", node.children.map((child) => child.id));
```

`setDocument` should run one Yjs transaction and write the full current document into granular maps. `transact` may still receive and return a full `RendererDocument`, but its diff application must update node maps field-by-field so two sessions changing different fields keep both changes after sync.

- [ ] **Step 4: Run the green test**

Run:

```bash
pnpm --filter @layo/collaboration test -- yjs-document.test.ts -t "merges concurrent edits to different fields on the same node"
```

Expected: PASS.

- [ ] **Step 5: Run package regression tests**

Run:

```bash
pnpm --filter @layo/collaboration test -- yjs-document.test.ts
pnpm --filter @layo/collaboration test
pnpm --filter @layo/collaboration typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/collaboration/src/yjs-document.ts packages/collaboration/src/yjs-document.test.ts
git commit -m "feat: merge collaborative node field updates"
```

## Task 2: Soft Editing Claims in Awareness

**Files:**
- Modify: `packages/collaboration/src/awareness.ts`
- Modify: `packages/collaboration/src/awareness.test.ts`
- Modify: `apps/web/src/collaboration/collab-session.test.ts`

- [ ] **Step 1: Write the failing awareness tests**

Add to `packages/collaboration/src/awareness.test.ts`:

```ts
test("summarizes soft editing claims for selected nodes", () => {
  const states = summarizeAwarenessStates([
    {
      sessionId: "session-a",
      userId: "user-a",
      displayName: "A",
      color: "#2563eb",
      selectedNodeId: "node-1",
      editingNodeId: "node-1",
      editingMode: "resize",
      updatedAtMs: 100
    }
  ]);

  expect(states[0]).toMatchObject({
    userId: "user-a",
    selectedNodeId: "node-1",
    editingNodeId: "node-1",
    editingMode: "resize"
  });
});
```

Add to `apps/web/src/collaboration/collab-session.test.ts`:

```ts
test("updates local presence with a soft editing claim", () => {
  const session = createCollabDocumentSession({
    team: sampleTeamManifest(),
    documentId: "sample-file",
    initialDocument: sampleDocument(),
    enablePersistence: false
  });

  session.updatePresence({ selectedNodeId: "node-1", editingNodeId: "node-1", editingMode: "drag" });

  expect(session.getLocalPresence()).toMatchObject({
    selectedNodeId: "node-1",
    editingNodeId: "node-1",
    editingMode: "drag"
  });

  session.destroy();
});
```

- [ ] **Step 2: Run the red tests**

Run:

```bash
pnpm --filter @layo/collaboration test -- awareness.test.ts -t "summarizes soft editing claims"
pnpm --filter @layo/web test -- src/collaboration/collab-session.test.ts -t "updates local presence with a soft editing claim"
```

Expected: FAIL because `editingNodeId` and `editingMode` are not accepted by the presence schema.

- [ ] **Step 3: Implement soft claim fields**

Extend `CollaborationPresence`:

```ts
editingNodeId: string | null;
editingMode: "drag" | "resize" | "text" | "agent" | null;
```

Add defaults to `presenceSchema`:

```ts
editingNodeId: z.string().nullable().default(null),
editingMode: z.enum(["drag", "resize", "text", "agent"]).nullable().default(null)
```

Add defaults in `createPresenceState` so old presence payloads still parse.

- [ ] **Step 4: Run the green tests**

Run the same two focused commands. Expected: PASS.

- [ ] **Step 5: Run package regressions**

Run:

```bash
pnpm --filter @layo/collaboration test
pnpm --filter @layo/web test -- src/collaboration/collab-session.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/collaboration/src/awareness.ts packages/collaboration/src/awareness.test.ts apps/web/src/collaboration/collab-session.test.ts
git commit -m "feat: expose collaboration soft editing claims"
```

## Task 3: Team Asset Metadata Contract

**Files:**
- Create: `packages/collaboration/src/assets.ts`
- Create: `packages/collaboration/src/assets.test.ts`
- Modify: `packages/collaboration/src/index.ts`

- [ ] **Step 1: Write failing asset metadata tests**

Create `packages/collaboration/src/assets.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createTeamAssetMetadata, createTeamAssetId } from "./assets";

describe("team collaboration assets", () => {
  test("creates stable asset ids from content hashes", () => {
    expect(createTeamAssetId("sha256:abc123")).toBe("asset-sha256-abc123");
  });

  test("normalizes duplicate image metadata to the same asset id", () => {
    const first = createTeamAssetMetadata({
      name: "Paste.png",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });
    const second = createTeamAssetMetadata({
      name: "Paste Copy.png",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });

    expect(first.assetId).toBe(second.assetId);
    expect(first).toMatchObject({
      assetId: "asset-sha256-abc123",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });
  });
});
```

- [ ] **Step 2: Run the red test**

Run:

```bash
pnpm --filter @layo/collaboration test -- assets.test.ts
```

Expected: FAIL because `assets.ts` does not exist.

- [ ] **Step 3: Implement metadata helpers**

Create `packages/collaboration/src/assets.ts`:

```ts
import { z } from "zod";

export interface TeamAssetMetadata {
  assetId: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byteLength: number;
  hash: string;
}

const supportedMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const assetInputSchema = z.object({
  name: z.string().trim().min(1).default("Image"),
  mimeType: z.enum(supportedMimeTypes),
  byteLength: z.number().int().positive(),
  hash: z.string().trim().regex(/^sha256:[a-fA-F0-9]+$/)
});

export function createTeamAssetId(hash: string): string {
  return `asset-${hash.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function createTeamAssetMetadata(input: z.input<typeof assetInputSchema>): TeamAssetMetadata {
  const parsed = assetInputSchema.parse(input);
  return {
    ...parsed,
    hash: parsed.hash.toLowerCase(),
    assetId: createTeamAssetId(parsed.hash)
  };
}
```

Export from `packages/collaboration/src/index.ts`:

```ts
export * from "./assets";
```

- [ ] **Step 4: Run the green test**

Run:

```bash
pnpm --filter @layo/collaboration test -- assets.test.ts
pnpm --filter @layo/collaboration typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/collaboration/src/assets.ts packages/collaboration/src/assets.test.ts packages/collaboration/src/index.ts
git commit -m "feat: add team asset metadata contract"
```

## Task 4: Agent Stale-State Guard

**Files:**
- Modify: `apps/server/src/collaboration-agent.ts`
- Create: `apps/server/src/collaboration-agent.test.ts`

- [ ] **Step 1: Write the failing stale-state test**

Create `apps/server/src/collaboration-agent.test.ts` with this focused unit test around the guard helper added in Step 3:

```ts
import { describe, expect, test } from "vitest";
import * as Y from "yjs";
import { assertUnchangedStateVector } from "./collaboration-agent";

describe("collaborative agent command guard", () => {
  test("rejects apply when the remote Yjs state vector changed after dry-run", () => {
    const ydoc = new Y.Doc();
    const beforeStateVector = Y.encodeStateVector(ydoc);

    ydoc.getMap("design").set("documentJson", { id: "sample-file", name: "Updated", pages: [] });

    expect(() => assertUnchangedStateVector(beforeStateVector, ydoc)).toThrow(
      "collaboration document changed before agent apply; retry dryRun"
    );
  });
});
```

- [ ] **Step 2: Run the red test**

Run:

```bash
pnpm --filter @layo/server test -- src/collaboration-agent.test.ts
```

Expected: FAIL because `assertUnchangedStateVector` is not exported.

- [ ] **Step 3: Implement state-vector guard**

In `apps/server/src/collaboration-agent.ts`, export:

```ts
export function assertUnchangedStateVector(beforeStateVector: Uint8Array, ydoc: Y.Doc): void {
  const applyStateVector = Y.encodeStateVector(ydoc);
  if (!buffersEqual(beforeStateVector, applyStateVector)) {
    throw new Error("collaboration document changed before agent apply; retry dryRun");
  }
}
```

Add the helper:

```ts
function buffersEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) {
    return false;
  }
  return first.every((value, index) => value === second[index]);
}
```

Inside `applyAgentCommandsToCollaboration`, capture after remote sync and before command preview:

```ts
const beforeStateVector = Y.encodeStateVector(ydoc);
```

Immediately before writing `preview`, call:

```ts
assertUnchangedStateVector(beforeStateVector, ydoc);
```

- [ ] **Step 4: Run focused and server tests**

Run:

```bash
pnpm --filter @layo/server test -- src/collaboration-agent.test.ts
pnpm --filter @layo/server test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/collaboration-agent.ts apps/server/src/collaboration-agent.test.ts
git commit -m "feat: guard collaborative agent writes"
```

## Task 5: Two-User Concurrency E2E

**Files:**
- Modify: `apps/web/e2e/collaboration.spec.ts`

- [ ] **Step 1: Write failing Playwright CLI test**

Add an e2e test with two browser contexts:

```ts
test("two editors keep independent node move and text edits", async ({ browser }) => {
  await rm(".layo/files/sample-file.json", { force: true });
  await rm("apps/server/.layo/files/sample-file.json", { force: true });
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-manifest-"));

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await firstPage.goto("http://127.0.0.1:5173/");
    await secondPage.goto("http://127.0.0.1:5173/");

    await firstPage.getByRole("tab", { name: "실시간 협업" }).click();
    await firstPage.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await firstPage.getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(firstPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await firstPage.getByRole("tab", { name: "팀 설정" }).click();
    const downloadPromise = firstPage.waitForEvent("download");
    await firstPage.getByRole("button", { name: "파일로 저장" }).click();
    const download = await downloadPromise;
    const downloadedManifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(downloadedManifestPath);

    await secondPage.getByRole("tab", { name: "팀 설정" }).click();
    await secondPage.getByTestId("team-manifest-file").setInputFiles(downloadedManifestPath);
    await expect(secondPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByRole("button", { name: "헤드라인" }).click();

    await firstPage.getByTestId("inspector-x").fill("96");
    await secondPage.getByTestId("inspector-text").fill("Concurrent headline");

    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("96", { timeout: 8000 });
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("Concurrent headline", {
      timeout: 8000
    });
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("96", { timeout: 8000 });
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("Concurrent headline", {
      timeout: 8000
    });
  } finally {
    await firstContext.close();
    await secondContext.close();
    await rm(downloadDir, { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: Run the red e2e**

Run:

```bash
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --grep "two editors keep independent node move and text edits" --reporter=line
```

Expected: FAIL by losing either the x-position edit or the text edit when concurrent whole-document updates race.

- [ ] **Step 3: Implement the smallest UI/session wiring fix**

If the package-level granular document tests pass but this e2e still fails, inspect `apps/web/src/collaboration/collab-session.ts` and `apps/web/src/App.tsx` for any path that calls `setDocument` with a stale full document after a remote update. Replace that path with the existing `session.transact(label, apply)` callback form so the transaction reads the latest collaborative document before applying the local command.

- [ ] **Step 4: Run e2e green**

Run:

```bash
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --grep "two editors keep independent node move and text edits" --reporter=line
```

Expected: PASS.

- [ ] **Step 5: Run full collaboration proof**

Run:

```bash
pnpm test:e2e:collab
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/collaboration.spec.ts apps/web/src/collaboration/collab-session.ts
git commit -m "test: cover collaborative concurrent editing"
```

## Final Verification

After all task commits:

```bash
git diff --check
pnpm typecheck
pnpm test
pnpm --filter @layo/web build
pnpm test:e2e:collab
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --reporter=line
```

Then run a direct Playwright CLI interaction pass against the live editor:

```bash
pnpm --filter @layo/server dev
pnpm --filter @layo/web dev
pnpm dev:collab
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --grep "two editors keep independent node move and text edits" --headed --workers=1 --reporter=line
```

Record:

- two browser contexts opened the same team document;
- first editor moved a selected node;
- second editor edited text;
- both changes stayed visible after sync;
- soft editing claims appeared as presence metadata rather than hard locks.

## Self-Review Notes

- This plan intentionally keeps the public `createCollaborativeDesignDocument` API stable to avoid rewriting web and server callers in the same task as the CRDT model migration.
- Hard locks are out of scope for this slice. Soft claims are awareness-only and must not block valid Yjs document updates.
- Binary asset transport is out of scope for this slice. The asset task defines deterministic team metadata so a later storage task can sync binaries without changing image node semantics again.
- The current repo uses shared local filesystem state in Playwright tests. Do not run headed and non-headed e2e variants in parallel when tests delete `.layo`.
