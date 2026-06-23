# Team Collaboration Roadmap

Last checked: 2026-06-18

This roadmap describes how Layo should support team formation and
shared project work while staying local-first and team-owned. It complements the
deployment details in `docs/deployment/collaboration.md`.

## Product Position

- The public web app can remain static and does not require a maintainer-operated
  production backend.
- A team owns its relay, member tokens, encryption passphrase, and project
  manifests.
- Team manifests may store member roles, relay URLs, token hashes, document ids,
  and encryption metadata.
- Team manifests must not store relay passphrases, plaintext member tokens, or
  derived encryption keys.
- Agent editing must keep working through deterministic HTTP/MCP surfaces for
  both local files and relay-backed team rooms.

## Current Baseline

- Browser users can keep local documents and team manifests in IndexedDB.
- Projects can be linked to a team manifest by `teamId`.
- The TypeScript relay supports Yjs document sync, awareness, room tokens,
  member tokens, owner/editor/viewer roles, and encrypted snapshot rooms.
- The Rust relay is experimental and should be treated as encrypted-room-only
  until plain Yjs support is explicitly added.
- Viewers can participate through awareness, while document sync/write access is
  reserved for owners and editors.
- E2EE protects document snapshots, but awareness, presence, room ids, and auth
  metadata remain visible to the relay operator in v1.

## Phase 1: Local Team Creation

Goal: let a small team agree on ownership and project identity before running
any shared infrastructure.

- Create a team manifest in the browser with a stable `teamId`, team name, and
  owner identity.
- Attach one or more projects to that team manifest.
- Export and import the team manifest for handoff between machines.
- Show the linked team and project state inside the editor so users can tell
  whether they are editing a local-only project or a team-owned project.
- Keep all project editing functional without a relay.

Exit criteria:

- A user can create a team-owned project locally.
- Another user can import the manifest and see the same team/project metadata.
- The manifest export contains no passphrase, derived key, or plaintext member
  token.

## Phase 2: Team-Owned Relay

Goal: make real-time editing available without introducing a central SaaS
dependency.

- Run the TypeScript relay locally with `pnpm dev:collab` for development.
- Run the relay with Docker Compose or a team-owned cloud host for production
  usage.
- Configure `COLLAB_ALLOWED_ROOM_PREFIX`, optional `COLLAB_ROOM_TOKEN`, and
  `COLLAB_MEMBER_TOKENS`.
- Put the relay URL and member identities into the team manifest.
- Keep static web hosting separate from relay hosting.

Exit criteria:

- Two browsers connected to the same team room receive document updates.
- Presence and selected-node awareness are visible to connected members.
- Viewer users cannot write document updates through the relay.
- Agents can apply commands to a relay-backed room and persist the same result
  to the local file copy.

## Phase 3: Secure Team Rollout

Goal: give teams a predictable security posture for sensitive design work.

- Enable passphrase-based E2EE before creating or importing an encrypted team
  manifest.
- Require team members to enter the passphrase at runtime.
- Prefer hashed member tokens in production relay configuration.
- Recommend private network or VPN deployment when metadata exposure matters.
- Document that awareness and auth metadata are plaintext in v1.

Exit criteria:

- Encrypted document snapshots sync through the relay without exposing document
  contents to the relay process.
- Exported manifests contain encryption metadata only.
- Team operators understand which data remains visible to the relay.

## Phase 4: Operational Workflow

Goal: make day-to-day team use predictable enough for design and agent-assisted
editing.

- Define owner/editor/viewer expectations in the UI.
- Add member management UI for role changes, token rotation, and disabled
  members.
- Add project-level sharing status, including local-only, relay-backed, and
  encrypted relay-backed states.
- Add team library guidance for reusable components, variables, and assets.
- Add backup and restore guidance for local files, team manifests, and relay
  configuration.
- Keep code export and MCP inspection tied to the same team-owned document
  identity.

Exit criteria:

- A team can onboard a new editor without manually editing environment variables
  or manifest JSON.
- A team can remove or rotate a member token without changing document contents.
- Users can see whether agent edits apply to the current local file, team room,
  or both.

## Later Team Features

- Invite links and one-time join flows.
- Canvas comments, threads, mentions, and resolved state.
- Named checkpoints and activity history.
- Branch, review, and merge flows for design changes.
- Document-level permission policies beyond relay connection roles.
- Shared team libraries for components, variables, assets, and code-export
  mappings.
- Admin-facing diagnostics for relay health, room activity, and sync errors.

## Non-Goals

- A default maintainer-operated production relay.
- Multi-tenant SaaS administration.
- Storing relay passphrases or derived keys in manifests.
- Treating relay tokens as a replacement for end-to-end encryption.
- Making the Rust relay the default plain Yjs relay before it supports that
  protocol path explicitly.
