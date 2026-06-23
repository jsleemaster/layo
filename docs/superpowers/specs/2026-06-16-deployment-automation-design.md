# Deployment Automation Design

## Goal

Add open-source deployment automation that keeps the web app static-hostable while making the collaboration relay explicitly team-owned and self-hosted.

## Scope

This slice implements objective 6 from the collaboration roadmap. It does not add authentication, E2EE, remote cursors, manifest hosting, or a Rust relay. Those remain separate follow-up goals.

## Approach

The deployment surface is split into two independently usable paths:

- Static web hosting through a GitHub Actions workflow that builds `apps/web` and publishes `apps/web/dist` to GitHub Pages.
- Team-owned relay hosting through Docker and Docker Compose artifacts for `apps/collab-relay`.

The project must not imply that maintainers operate a production collaboration relay. Documentation should make the team-owned relay model explicit in the README and deployment guide.

## Artifacts

- `.github/workflows/web-static.yml`: build and publish static web artifacts.
- `apps/collab-relay/Dockerfile`: package the TypeScript relay in a container.
- `deploy/collab-relay/docker-compose.yml`: local or small-team relay deployment.
- `deploy/collab-relay/.env.example`: relay environment variable template.
- `scripts/check-deployment-artifacts.test.mjs`: executable deployment artifact checks.
- `docs/deployment/collaboration.md`: expanded deployment guide.
- `README.md`: concise deployment model summary.

## Validation

Deployment checks must prove:

- The web workflow builds the Vite app and publishes `apps/web/dist`.
- Docker relay artifacts configure `COLLAB_RELAY_HOST`, `COLLAB_RELAY_PORT`, `COLLAB_ALLOWED_ROOM_PREFIX`, and `COLLAB_ROOM_TOKEN`.
- Documentation separates web-only, local relay, cloud relay, and trusted network relay modes.
- Existing project verification still passes.

Required commands:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
pnpm --filter @layo/web build
pnpm test
pnpm typecheck
```

If Docker is available, also run:

```bash
docker build -f apps/collab-relay/Dockerfile -t layo-collab-relay .
docker compose --env-file deploy/collab-relay/.env.example -f deploy/collab-relay/docker-compose.yml config
```
