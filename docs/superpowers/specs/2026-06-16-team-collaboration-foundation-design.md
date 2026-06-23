# Team Collaboration Foundation Design

## Context

Layo is intended to be open source. The project should be easy to share as a static web app, but the maintainers should not have to operate a central collaboration backend for every team. Real-time collaboration still needs to work when a team is created, and agent edits must appear through the same collaboration path as human edits.

The current editor already has useful boundaries:

- `DesignFile` is the canonical document shape.
- React/Konva owns the local editor experience.
- HTTP and MCP expose deterministic agent commands.
- Code export can return component-level implementation specs.

The collaboration layer should preserve those boundaries instead of replacing the editor with a remote database product.

## Direction

Use a local-first collaboration model:

- The web app can be hosted as static files.
- Each team owns or selects its own sync relay.
- Browser IndexedDB stores team manifests and document snapshots.
- Yjs stores collaborative document state and propagates CRDT updates.
- Awareness carries ephemeral state such as member presence, cursor, active tool, and selected node.
- Agent commands write through the same collaboration adapter as UI actions.

This keeps the open-source app shareable while allowing private teams to collaborate without sending their design files to a maintainer-operated service.

## Non-Negotiables

- No required maintainer-operated production server.
- Static web hosting must remain a valid deployment path.
- A team can run its own relay locally, on a private network, or on its own cloud.
- The relay must not become semantic document authority; it relays updates and awareness.
- The local editor must keep working offline through IndexedDB.
- MCP/agent mutations must produce the same document updates as UI mutations.

## Team Model

Introduce a browser-local `TeamManifest`:

```ts
interface TeamManifest {
  schemaVersion: 1;
  teamId: string;
  name: string;
  createdAt: string;
  currentUserId: string;
  members: TeamMember[];
  documents: TeamDocumentSummary[];
  sync: TeamSyncConfig;
  permissions: TeamPermissions;
}

interface TeamSyncConfig {
  mode: "local" | "websocket";
  roomPrefix: string;
  relayUrl?: string;
  token?: string;
}
```

The manifest is stored in IndexedDB and can be exported/imported as JSON. This gives an open-source team a portable workspace definition without requiring account infrastructure.

## Document Sync Model

The MVP should use Yjs with three layers:

- `Y.Doc`: collaborative document container.
- `y-indexeddb`: browser-local persistence and offline load.
- `y-websocket`: optional online provider to a team-owned relay.

Room names should be deterministic:

```text
layo:{teamId}:{documentId}
```

The first implementation should store the full `DesignFile` JSON in a Yjs map entry such as `documentJson`. This is not the final fine-grained data model, but it is the fastest safe path to prove team creation, offline persistence, live sync, and agent compatibility. After that works, node trees can be moved into granular Yjs maps and arrays for better concurrent geometry and text editing.

## Collaboration Session

Add a shared session abstraction:

```ts
interface CollabDocumentSession {
  team: TeamManifest;
  documentId: string;
  status: "offline" | "connecting" | "synced" | "error";
  getDocument(): DesignFile;
  transact(label: string, apply: (document: DesignFile) => DesignFile): void;
  subscribe(listener: (document: DesignFile) => void): () => void;
  awareness: CollaborationAwareness;
  destroy(): void;
}
```

The editor should not know whether a document is only local or connected to a relay. It should dispatch editor commands into `session.transact(...)`; the session updates Yjs, IndexedDB persists it, and the optional websocket provider syncs it to other members.

## Agent Flow

Agent control must move from "write JSON file only" toward "write through collaboration session when one exists."

MVP behavior:

1. Agent calls `inspect_canvas` or `find_nodes`.
2. Agent calls `apply_agent_commands` with `dryRun: true`.
3. Agent calls `apply_agent_commands` with `dryRun: false`.
4. If the target file has an active collaboration binding, the command batch is applied through the collaboration transaction adapter.
5. Connected browsers receive the same Yjs update as a human edit.
6. Playwright CLI verifies the rendered state in at least two browser contexts.

Filesystem storage can remain the fallback for non-collaborative local files.

## Relay

The repository should include a self-host relay package, but the deployed static web app should not depend on a maintainer-operated relay.

Relay responsibilities:

- accept websocket connections for allowed rooms
- propagate Yjs document updates
- propagate awareness messages
- optionally reject unknown room prefixes or invalid bearer tokens
- expose health and basic diagnostics endpoints

Relay non-responsibilities:

- user accounts
- billing
- semantic document validation
- permanent design file ownership
- code generation

The relay can start as a Node package because the web stack is already TypeScript. Rust can become the long-term production relay after the protocol and UX are stable.

## Security

MVP security is team-owned rather than platform-owned:

- Static web has no global auth.
- Team manifests may include relay URL and room token.
- The relay validates room prefix and token.
- Documents are stored in the browser and in team-selected relay persistence only if the relay operator enables persistence.

End-to-end encryption is not part of the first slice. The API should leave room for adding encrypted Yjs updates later.

## UI

Add collaboration controls without turning the product into a landing page:

- Team panel in the left rail or a compact top bar popover.
- Create team.
- Import/export team manifest.
- Configure relay URL and token.
- Connection status.
- Member presence.
- Selected-node presence indicators.

The core canvas must remain the first screen.

## Testing

The collaboration MVP needs tests at four levels:

- Pure unit tests for manifest validation and room naming.
- Yjs adapter tests for document round-trip and two-session sync.
- Web tests for editor dispatch through `CollabDocumentSession`.
- Playwright CLI e2e with two browser contexts editing the same team document.

## Deployment Shape

Recommended open-source deployment model:

- `apps/web`: static app, deployable to GitHub Pages, Vercel static output, Netlify, or any static host.
- `apps/server`: local HTTP/MCP development and agent bridge.
- `apps/collab-relay`: optional team-owned websocket relay.
- `packages/collaboration`: shared collaboration contracts and adapters.

This lets the public project publish a usable web app while teams decide where their realtime relay runs.

## Future Work

- Granular Yjs document model for pages, nodes, component definitions, and text content.
- `Y.UndoManager` integration for local undo/redo that ignores remote-only changes correctly.
- Rust relay once protocol pressure and deployment requirements are clearer.
- Relay persistence adapters for filesystem, SQLite, S3-compatible object storage, or Postgres.
- End-to-end encryption for hosted relay use.
- GitHub-backed team manifests for fully open workflows.
