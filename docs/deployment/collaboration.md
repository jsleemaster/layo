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
```

Publish the websocket URL to team members through the team manifest. The project maintainers do not operate this relay for users.

## Trusted network relay

For sensitive work, run the relay inside a trusted private network or VPN and keep `COLLAB_ROOM_TOKEN` set. The current relay token is only a lightweight gate. It is not account authentication and it is not end-to-end encryption.

## Relay Configuration

```bash
COLLAB_RELAY_HOST=127.0.0.1
COLLAB_RELAY_PORT=4327
COLLAB_ALLOWED_ROOM_PREFIX=canvas-mcp-editor:
COLLAB_ROOM_TOKEN=
```

If `COLLAB_ROOM_TOKEN` is set, clients must pass the same token as a websocket query parameter. This is a lightweight relay gate, not full user authentication.

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
- Sensitive teams should run relays inside a trusted network until encrypted Yjs updates are added.
