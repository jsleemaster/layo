# Team Collaboration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development only if the user explicitly allows sub-agents. Otherwise use superpowers:executing-plans and implement task-by-task in the current session. Browser debugging and visual verification must use Playwright CLI.

**Goal:** Add a local-first team collaboration foundation so the static web app can be shared publicly, while each team can run or choose its own realtime relay and agents can mutate collaborative documents through the same path as human edits.

**Architecture:** Add a shared collaboration package around team manifests, Yjs document sessions, IndexedDB persistence, websocket sync, and awareness. Keep static web deployment valid. Add an optional self-host relay package for teams. Route editor commands and agent commands through a collaboration transaction adapter when a session exists.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright CLI, Yjs, y-indexeddb, y-websocket, y-protocols, Fastify/MCP for local agent bridge, Rust core unchanged for this slice.

---

## File Structure

- Create `packages/collaboration/package.json`
- Create `packages/collaboration/src/team-manifest.ts`
- Create `packages/collaboration/src/room.ts`
- Create `packages/collaboration/src/yjs-document.ts`
- Create `packages/collaboration/src/awareness.ts`
- Create `packages/collaboration/src/index.ts`
- Create `packages/collaboration/src/*.test.ts`
- Modify `pnpm-workspace.yaml` only if a new package path is needed
- Modify `apps/web/package.json` to depend on `@layo/collaboration`
- Create `apps/web/src/collaboration/team-store.ts`
- Create `apps/web/src/collaboration/collab-session.ts`
- Create `apps/web/src/collaboration/collab-session.test.ts`
- Modify `apps/web/src/editor-state.ts` only to expose reusable pure command application if needed
- Modify `apps/web/src/App.tsx` to initialize optional team sessions
- Modify `apps/web/src/App.css` for team/presence controls
- Create `apps/collab-relay/package.json`
- Create `apps/collab-relay/src/index.ts`
- Create `apps/collab-relay/src/index.test.ts`
- Modify `apps/server/src/storage.ts` and `apps/server/src/agent-control.ts` only after the web session contract is stable
- Modify `apps/server/src/mcp.ts` if MCP needs team-aware command inputs
- Modify `apps/web/e2e/editor-mvp.spec.ts` or add `apps/web/e2e/collaboration.spec.ts`
- Modify `README.md`

## Task 1: Collaboration Package Skeleton

**Files:**
- Create: `packages/collaboration/package.json`
- Create: `packages/collaboration/src/index.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add package metadata**

Create `@layo/collaboration` as a private workspace package with scripts:

```json
{
  "build": "tsc -p tsconfig.json",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "tsc -p tsconfig.json --noEmit"
}
```

Add dependencies:

```text
yjs
y-indexeddb
y-websocket
y-protocols
zod
```

Add `@layo/collaboration` to `apps/web/package.json`.

- [ ] **Step 2: Verify package is included**

Run:

```bash
pnpm install
pnpm --filter @layo/collaboration typecheck
pnpm --filter @layo/web typecheck
```

Expected: PASS after empty exports are valid.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml packages/collaboration apps/web/package.json
git commit -m "feat: add collaboration workspace package"
```

## Task 2: Team Manifest and Room Contracts

**Files:**
- Create: `packages/collaboration/src/team-manifest.ts`
- Create: `packages/collaboration/src/room.ts`
- Create: `packages/collaboration/src/team-manifest.test.ts`
- Create: `packages/collaboration/src/room.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

- creates a valid manifest with `schemaVersion: 1`
- rejects empty team names
- rejects websocket sync config without `relayUrl`
- generates room id `layo:{teamId}:{documentId}`
- sanitizes or rejects ids containing websocket path delimiters
- preserves imported manifest fields after validation

Run:

```bash
pnpm --filter @layo/collaboration test -- team-manifest.test.ts room.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 2: Implement manifest types and validation**

Export:

```ts
export interface TeamManifest
export interface TeamMember
export interface TeamDocumentSummary
export interface TeamSyncConfig
export function createTeamManifest(input: CreateTeamManifestInput): TeamManifest
export function parseTeamManifest(input: unknown): TeamManifest
```

Use Zod parsing at the package boundary so imported JSON manifests fail clearly.

- [ ] **Step 3: Implement room naming**

Export:

```ts
export function createDocumentRoomId(teamId: string, documentId: string): string
```

Keep room ids deterministic and safe for websocket paths.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @layo/collaboration test
pnpm --filter @layo/collaboration typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/collaboration/src
git commit -m "feat: add team collaboration manifest contracts"
```

## Task 3: Yjs Document Adapter

**Files:**
- Create: `packages/collaboration/src/yjs-document.ts`
- Create: `packages/collaboration/src/yjs-document.test.ts`

- [ ] **Step 1: Write failing Yjs adapter tests**

Test cases:

- creates a Yjs document from a `DesignFile`
- returns the same `DesignFile` through `getDocument`
- applies `transact("label", fn)` and emits one update
- syncs two sessions through Yjs updates in memory
- rejects invalid document payloads

Run:

```bash
pnpm --filter @layo/collaboration test -- yjs-document.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement JSON-backed MVP adapter**

Export:

```ts
export interface CollaborativeDesignDocument {
  ydoc: Y.Doc;
  getDocument(): DesignFile;
  setDocument(document: DesignFile, origin?: unknown): void;
  transact(label: string, apply: (document: DesignFile) => DesignFile): void;
  subscribe(listener: (document: DesignFile) => void): () => void;
  destroy(): void;
}

export function createCollaborativeDesignDocument(input: {
  document: DesignFile;
  origin?: unknown;
}): CollaborativeDesignDocument
```

Store the whole document under `Y.Map<unknown>().set("documentJson", document)` for the MVP.

- [ ] **Step 3: Add conversion guard**

Validate that Yjs payloads still have `id`, `name`, and `pages[]` before publishing to editor state. Do not silently render malformed remote updates.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @layo/collaboration test -- yjs-document.test.ts
pnpm --filter @layo/collaboration typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/collaboration/src/yjs-document.ts packages/collaboration/src/yjs-document.test.ts
git commit -m "feat: add yjs design document adapter"
```

## Task 4: Awareness Contracts

**Files:**
- Create: `packages/collaboration/src/awareness.ts`
- Create: `packages/collaboration/src/awareness.test.ts`

- [ ] **Step 1: Write failing awareness tests**

Test cases:

- creates local user awareness state
- updates selected node id
- clears cursor/selection on disconnect
- maps remote awareness states into member presence summaries

- [ ] **Step 2: Implement awareness helpers**

Export:

```ts
export interface CollaborationPresence {
  userId: string;
  displayName: string;
  color: string;
  selectedNodeId: string | null;
  cursor: { x: number; y: number } | null;
  activeTool: string | null;
}

export function createPresenceState(input: Partial<CollaborationPresence>): CollaborationPresence
export function summarizeAwarenessStates(states: unknown[]): CollaborationPresence[]
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @layo/collaboration test -- awareness.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/collaboration/src/awareness.ts packages/collaboration/src/awareness.test.ts
git commit -m "feat: add collaboration awareness contracts"
```

## Task 5: Browser Team Store

**Files:**
- Create: `apps/web/src/collaboration/team-store.ts`
- Create: `apps/web/src/collaboration/team-store.test.ts`

- [ ] **Step 1: Write failing team store tests**

Use fake IndexedDB only if the current Vitest environment needs it. Otherwise isolate serialization logic and keep IndexedDB behavior behind a small adapter.

Test cases:

- saves a team manifest
- lists stored teams
- loads current team
- imports a manifest JSON blob
- exports the manifest as JSON

- [ ] **Step 2: Implement IndexedDB store**

Implement a tiny IndexedDB wrapper:

```ts
export interface TeamStore {
  listTeams(): Promise<TeamManifest[]>;
  saveTeam(team: TeamManifest): Promise<void>;
  getTeam(teamId: string): Promise<TeamManifest | null>;
  setCurrentTeam(teamId: string): Promise<void>;
  getCurrentTeam(): Promise<TeamManifest | null>;
}
```

Use one database name and versioned object stores:

```text
layo-collaboration
teams
settings
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @layo/web test -- team-store.test.ts
pnpm --filter @layo/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/collaboration/team-store.ts apps/web/src/collaboration/team-store.test.ts
git commit -m "feat: add browser team manifest store"
```

## Task 6: Web Collaboration Session

**Files:**
- Create: `apps/web/src/collaboration/collab-session.ts`
- Create: `apps/web/src/collaboration/collab-session.test.ts`

- [ ] **Step 1: Write failing session tests**

Test cases:

- initializes from a `TeamManifest` and `DesignFile`
- publishes updates to subscribers
- runs `transact` and returns updated document
- stays usable in `sync.mode: "local"`
- creates websocket provider only when `sync.mode: "websocket"`
- exposes connection status changes

- [ ] **Step 2: Implement session factory**

Export:

```ts
export interface CollabDocumentSession
export function createCollabDocumentSession(input: {
  team: TeamManifest;
  documentId: string;
  initialDocument: DesignFile;
}): CollabDocumentSession
```

Wire:

- Yjs document adapter
- `IndexeddbPersistence`
- optional `WebsocketProvider`
- awareness state helpers

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @layo/web test -- collab-session.test.ts
pnpm --filter @layo/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/collaboration/collab-session.ts apps/web/src/collaboration/collab-session.test.ts
git commit -m "feat: add web collaboration sessions"
```

## Task 7: Wire Editor UI to Collaboration

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.css`
- Modify: `apps/web/src/editor-state.ts` if pure command reuse is needed
- Add or modify: `apps/web/src/App.test.tsx` if a React test harness exists; otherwise use e2e in Task 10

- [ ] **Step 1: Add team controls**

Add compact controls:

- create local team
- import/export manifest
- relay URL input
- relay token input
- connection status
- presence list

Keep the canvas as the primary view.

- [ ] **Step 2: Route editor mutations through the session**

Change the local dispatch path:

```ts
session.transact("editor-command", (document) => {
  const state = createEditorState(document);
  return executeEditorCommand(state, command).document;
});
```

Keep local-only mode working when no team is active.

- [ ] **Step 3: Subscribe editor state to collaboration updates**

On session document updates:

- preserve viewport if possible
- preserve selection if the selected node still exists
- clear selection if the node was deleted
- avoid infinite loops from local subscriber updates

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @layo/web test
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.css apps/web/src/editor-state.ts
git commit -m "feat: wire editor to collaboration sessions"
```

## Task 8: Self-Hosted Collaboration Relay

**Files:**
- Create: `apps/collab-relay/package.json`
- Create: `apps/collab-relay/src/index.ts`
- Create: `apps/collab-relay/src/index.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Choose relay implementation**

Start with a TypeScript relay package compatible with `y-websocket`. Use the smallest maintainable path:

- Prefer a supported `y-websocket` server entry if available in the installed version.
- If that is not stable, implement a minimal `ws` server using Yjs sync and awareness protocols.

Do not add persistence in the first slice unless tests require it.

- [ ] **Step 2: Add relay scripts**

Package scripts:

```json
{
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "tsc -p tsconfig.json --noEmit"
}
```

Root script:

```json
"dev:collab": "pnpm --filter @layo/collab-relay dev"
```

- [ ] **Step 3: Add relay runtime config**

Environment variables:

```text
COLLAB_RELAY_HOST=127.0.0.1
COLLAB_RELAY_PORT=4327
COLLAB_ALLOWED_ROOM_PREFIX=layo:
COLLAB_ROOM_TOKEN=
```

If `COLLAB_ROOM_TOKEN` is set, require `Authorization: Bearer <token>` or a documented websocket token parameter.

- [ ] **Step 4: Verify relay**

Run:

```bash
pnpm --filter @layo/collab-relay test
pnpm --filter @layo/collab-relay typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/collab-relay package.json pnpm-lock.yaml
git commit -m "feat: add self-host collaboration relay"
```

## Task 9: Agent Command Collaboration Binding

**Files:**
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/http.test.ts`

- [ ] **Step 1: Define binding behavior**

Add an optional `collaboration` input to agent command calls:

```ts
interface AgentCollaborationTarget {
  teamId: string;
  documentId: string;
  relayUrl?: string;
  token?: string;
}
```

For MVP, the server may still mutate local files unless an active web session bridge is explicitly provided. Do not fake remote synchronization from the server if no collaboration session is reachable.

- [ ] **Step 2: Keep command application pure**

Keep `applyAgentCommandsToDocument` pure. Add a separate adapter that can apply the resulting document to either:

- filesystem storage
- collaboration document session

- [ ] **Step 3: Add tests**

Test cases:

- existing file-backed agent commands still pass
- collaboration target input is validated
- dry-run never writes to filesystem or collaboration session
- persisted command writes through the selected adapter

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @layo/server test
pnpm --filter @layo/server typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat: prepare agent commands for collaborative sessions"
```

## Task 10: Two-Browser Collaboration E2E

**Files:**
- Create: `apps/web/e2e/collaboration.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright CLI scenario**

Use two browser contexts:

1. Open the web app in context A.
2. Create or import the same team manifest.
3. Open the web app in context B.
4. Join the same team room.
5. Create a rectangle or text node in A.
6. Assert it appears in B.
7. Select a node in B.
8. Assert presence/selection indication appears in A.

- [ ] **Step 2: Add e2e script**

Add:

```json
"test:e2e:collab": "playwright test apps/web/e2e/collaboration.spec.ts --reporter=line"
```

- [ ] **Step 3: Verify with dev servers**

Run:

```bash
pnpm --filter @layo/collab-relay dev
pnpm --filter @layo/server dev
pnpm --filter @layo/web dev
pnpm test:e2e:collab
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/collaboration.spec.ts package.json
git commit -m "test: verify two-browser collaboration"
```

## Task 11: Documentation and Deployment Notes

**Files:**
- Modify: `README.md`
- Add: `docs/deployment/collaboration.md`

- [ ] **Step 1: Document open-source deployment model**

Explain:

- static web can be hosted publicly
- relay is optional and team-owned
- local-only mode works without relay
- relay URL/token are stored in the team manifest
- maintainers do not operate a default production relay

- [ ] **Step 2: Document local startup**

Include:

```bash
pnpm dev
pnpm dev:collab
```

And direct package commands for separate terminals.

- [ ] **Step 3: Document security limits**

Call out:

- MVP relay token is not account auth
- no E2EE yet
- teams should run relays inside trusted networks for sensitive work

- [ ] **Step 4: Verify docs and full suite**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --filter @layo/web build
pnpm test:e2e
pnpm test:e2e:collab
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/deployment/collaboration.md
git commit -m "docs: document team collaboration deployment"
```

## Acceptance Criteria

- Static web build remains deployable without a central app server.
- A browser can create, store, export, and import a team manifest.
- Local-only team sessions persist in IndexedDB.
- Websocket team sessions sync the same document between two browser contexts.
- Presence state shows at least member identity and selected node.
- Existing editor interactions still work without collaboration enabled.
- Existing MCP/HTTP agent commands still work in file-backed mode.
- Agent command architecture has a clear collaboration adapter path.
- Playwright CLI verifies two-browser live sync.
- README explains that the relay is self-hosted by the team, not operated by the project maintainers.

## Rollback Plan

- Keep all collaboration UI behind a feature flag or local team activation path.
- Do not change the base sample-file load path until the collaboration session is ready.
- If websocket sync is unstable, ship Tasks 1-7 as local-first team storage and defer relay/e2e to the next PR.
- If agent collaboration binding becomes too large, keep file-backed agent commands unchanged and document the adapter contract for the next slice.

## Open Questions

- Should the first relay be TypeScript for speed or Rust for long-term alignment?
- Should team manifests be user-managed JSON only, or should GitHub-backed manifests be added early?
- Should remote cursors be drawn on the Konva stage in the MVP, or should the first slice show only selected-node presence in sidebars?
- How strict should room token handling be before E2EE exists?
