# Collaboration Auth Permissions Design

## Goal

Add relay authentication and authorization v1 for Layo collaboration while preserving static web hosting and team-owned relay deployment.

## Scope

This slice implements objective 1 from the collaboration roadmap. It adds team member roles, relay auth metadata, member credential validation, and viewer-aware relay behavior. It does not add a central account system, E2EE, remote cursors, GitHub-backed manifests, or Rust relay migration.

## Team Manifest

Team members have one of three roles:

- `owner`: can edit documents and invite/manage team access.
- `editor`: can edit documents but is not the default invite authority.
- `viewer`: can participate in awareness/presence but cannot request document sync access.

The manifest stores relay auth metadata as token hashes:

- `auth.relay.memberTokenHashes`
- `auth.relay.inviteTokenHashes`

Plain relay gate tokens and member tokens are runtime credentials. They are not stored in the normalized team manifest and are not exported by manifest JSON export.

## Relay Validation

The relay validates three layers:

- Room prefix: room ids must match `COLLAB_ALLOWED_ROOM_PREFIX`.
- Relay gate token: optional `COLLAB_ROOM_TOKEN`.
- Member token: optional `COLLAB_MEMBER_TOKENS` JSON array, using `userId`, `memberToken`, and role.

If member tokens are configured, unknown users and invalid tokens receive `401 Unauthorized`. Owners and editors can request `access=sync`. Viewers can request `access=awareness`; viewer sync requests are rejected.

## Viewer Limit

Viewer write blocking is enforced in two places:

- connection validation rejects viewer `access=sync`;
- sync messages from non-writing connections are ignored.

This is not a full Yjs document permission engine. It is a v1 relay policy that prevents obvious document mutation paths while allowing viewer presence.

## Agent Path

Collaborative agent commands can pass `userId` and `memberToken` with the existing relay URL and relay gate token. File-backed agent commands continue to work unchanged.

## Validation

Required evidence:

- Wrong relay/member token or unknown member is rejected.
- Allowed owner/editor member connects for document sync.
- Viewer sync is rejected; viewer awareness is accepted.
- Exported team manifests do not include plaintext runtime credentials.
- Existing local-only collaboration and file-backed agent commands remain compatible.
