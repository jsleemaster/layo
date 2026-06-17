# Collaboration Deployment

Canvas MCP Editor keeps the public web app deployable as static files. Real-time collaboration is optional and should be owned by the team using the editor.

## Components

- `apps/web`: static Vite app.
- `apps/server`: local HTTP and MCP bridge for agent workflows.
- `apps/collab-relay`: optional websocket relay for team rooms.
- `packages/collaboration`: shared team manifest, room, Yjs document, and awareness contracts.

## Local Startup

Use separate terminals:

```bash
pnpm --filter @canvas-mcp-editor/server dev
pnpm --filter @canvas-mcp-editor/web dev
pnpm dev:collab
```

Default URLs:

```text
web:   http://127.0.0.1:5173
api:   http://127.0.0.1:4317
relay: ws://127.0.0.1:4327
```

## Web-only Deployment

The web app can be built and served without a central collaboration backend. This is the default public deployment mode because it keeps the project open-source friendly and avoids a maintainer-operated collaboration service:

```bash
pnpm --filter @canvas-mcp-editor/web build
```

Serve `apps/web/dist` from GitHub Pages, Vercel static output, Netlify, nginx, or any static host. The GitHub Actions workflow at `.github/workflows/web-static.yml` builds this artifact and uploads `apps/web/dist` to GitHub Pages.

Teams that need real-time editing configure their own relay URL inside the team manifest. Local-only teams continue to work without a relay.

## Local relay

For local collaboration testing, run the server, web app, and relay in separate terminals:

```bash
pnpm --filter @canvas-mcp-editor/server dev
pnpm --filter @canvas-mcp-editor/web dev
pnpm dev:collab
```

`pnpm dev:collab` starts the TypeScript relay and remains the default full relay for plain Yjs rooms and encrypted rooms. `pnpm dev:collab:rust` starts the experimental Rust relay, which currently supports encrypted `e2ee=true` rooms only.

Then create a relay-backed team in the web app with:

```text
ws://127.0.0.1:4327
```

## Docker Compose Relay

Teams can self-host the relay with Docker Compose:

```bash
cp deploy/collab-relay/.env.example deploy/collab-relay/.env
docker compose --env-file deploy/collab-relay/.env -f deploy/collab-relay/docker-compose.yml up --build
```

Health check:

```bash
curl http://127.0.0.1:4327/health
```

The compose file builds `apps/collab-relay/Dockerfile`, exposes the relay on `COLLAB_RELAY_PORT`, and passes the room prefix and optional room token into the container.

## Cloud relay

Deploy the same Docker image to a team-owned host such as Fly.io, Render, Railway, a small VPS, or an internal Kubernetes cluster. Configure these environment variables in the hosting platform:

```bash
COLLAB_RELAY_HOST=0.0.0.0
COLLAB_RELAY_PORT=4327
COLLAB_ALLOWED_ROOM_PREFIX=canvas-mcp-editor:
COLLAB_ROOM_TOKEN=
COLLAB_MEMBER_TOKENS=[]
```

Publish the websocket URL to team members through the team manifest. The project maintainers do not operate this relay for users.

`COLLAB_MEMBER_TOKENS` is an optional JSON array for member-level relay authorization:

```json
[
  {
    "userId": "owner-1",
    "role": "owner",
    "tokenHash": "sha256-hex-token"
  },
  {
    "userId": "viewer-1",
    "role": "viewer",
    "tokenHash": "sha256-hex-token"
  }
]
```

`owner` and `editor` members can request document sync access. `viewer` members can connect with awareness-only access so they can participate in presence without mutating the shared document. Plain `token` fields are accepted for local testing, but production relay config should prefer `tokenHash`.

## End-to-end encryption

Relay-backed teams can enable passphrase-based E2EE in the web app before creating a team. The manifest stores only non-secret metadata such as algorithm, KDF, salt, and iteration count. Team members must enter the shared passphrase at runtime when they create or import an encrypted team manifest.

With E2EE enabled, document snapshots are encrypted in the browser and the relay treats those snapshots as opaque frames. The relay cannot apply encrypted document contents into its own `Y.Doc`. Awareness remains plaintext in this v1, so display names, colors, cursors, selections, room ids, and relay/member auth metadata are still visible to the relay operator.

## Trusted network relay

For sensitive work, run the relay inside a trusted private network or VPN and keep `COLLAB_ROOM_TOKEN` set. The current relay token is only a lightweight gate. It is not account authentication. E2EE protects document update contents, but teams should still treat relay metadata and plaintext awareness as visible to the relay operator.

## Relay Configuration

```bash
COLLAB_RELAY_HOST=127.0.0.1
COLLAB_RELAY_PORT=4327
COLLAB_ALLOWED_ROOM_PREFIX=canvas-mcp-editor:
COLLAB_ROOM_TOKEN=
COLLAB_MEMBER_TOKENS=[]
```

If `COLLAB_ROOM_TOKEN` is set, clients must pass the same token as a websocket query parameter. This is a lightweight relay gate, not full user authentication. If `COLLAB_MEMBER_TOKENS` is set, clients must also pass `userId` and `memberToken`; the relay validates member identity and role before opening the websocket.

## Agent Commands

Agents can keep using file-backed HTTP/MCP commands. To mutate an active relay room, pass a collaboration target to `apply_agent_commands`:

```json
{
  "dryRun": false,
  "collaboration": {
    "teamId": "team-id-from-manifest",
    "documentId": "sample-file",
    "relayUrl": "ws://127.0.0.1:4327"
  },
  "commands": [
    {
      "type": "create_text",
      "parentId": "page-1",
      "id": "agent-note",
      "name": "Agent Note",
      "value": "Created by agent"
    }
  ]
}
```

The server connects to the relay room, applies the command to the Yjs-backed document, writes the same result to the local file copy, and connected browsers receive the update.

## Security Limits

- No account system is included.
- Relay tokens are not end-to-end encryption.
- E2EE protects document snapshots only; awareness and presence metadata remain plaintext in this v1.
- Passphrases and derived keys are runtime-only and are not exported in team manifests.
- Team manifests store member roles and token hashes, not plaintext relay/member tokens.
- Viewer write blocking is enforced at relay connection and sync-message handling; the current Yjs protocol layer is not a full document permission engine.
- Sensitive teams should still run relays inside a trusted network when relay metadata exposure matters.
