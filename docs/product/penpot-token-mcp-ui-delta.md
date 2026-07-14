# Penpot Token MCP and UI Delta

Last checked: 2026-07-14
Status: PR #308 active; implementation evidence exists, merge gate pending

## Retrieval Summary

- Decision: **Adapt** Penpot personal access-token administration.
- Human surface: compact Korean controls in team settings.
- Agent surface: authenticated self-only MCP create/list/revoke with explicit
  tool annotations; HTTP remains the browser contract.
- Storage owner: Layo manages `<members-file>.tokens.json` version 2; the
  operator members file remains external and is never replaced.
- Secret rule: plaintext is one-time response/component state; persistence is
  SHA-256 only and clipboard copy is the only intentional external copy.
- Current gate: Full Verification `29332908276` was superseded and cancelled
  during Playwright after gates/typecheck/build/Core passed; it is not GREEN.
  Final PR-head Full Verification remains pending. Do not treat this delta, PR,
  or gates 7/8/10 as complete yet.

## Penpot Reference And Decision

Official references:

- https://help.penpot.app/technical-guide/integration/#access-tokens
- https://help.penpot.app/mcp/

Penpot provides account-level descriptive token names, Never/30/60/90/180-day
expiry choices, one-time copy after creation, metadata listing, deletion, and
personal-token authentication for integrations/MCP. Layo adapts that workflow
because its identity boundary is local-first and operator-owned:

| Capability | Penpot reference | Layo PR #308 adaptation |
| --- | --- | --- |
| Ownership | Hosted/self-hosted account profile | Operator members file plus Layo-owned managed sidecar |
| Human administration | Account access-token settings | Korean team settings for the active member |
| Agent administration | Personal token authenticates integrations/MCP | Deterministic self-only MCP create/list/revoke |
| Secret lifecycle | Copy after creation | One-time response/component state; hash-only persistence |
| Revocation | Delete token | Durable `revokedAt` overlay and explicit current-token confirmation |

This contributes evidence to maturity gates 7, 8, and 10. It does not close any
whole-product gate.

## Product Scope

### MCP

The tools are registered only when file-backed authorization and an
authenticated principal are available. Static/environment authorization exposes
no mutation tools. The manager, not caller input, derives the member identity.
List is read-only/non-destructive/idempotent; create is
writable/non-destructive/non-idempotent; revoke is
writable/destructive/idempotent. Invalid, member-revoked, named-token-revoked,
stale-replaced, and stale-revoked credentials fail before mutation.
Self-revocation requires `confirmSelfRevoke: true`.

### HTTP And Korean UI

HTTP list returns whitelisted token metadata and secret-free `activeTokenId`.
The browser API performs credentialed list/create/revoke requests and maps
failures to Korean errors. Team settings support descriptive name, expiry,
one-time reveal/copy, refresh, sibling revocation, and confirmed self-revocation.
Self-revocation clears the credential but preserves the local team so a valid
root credential can be applied without team recreation.

## Managed Sidecar V2

The operator members file is authoritative identity input. Account
administration never rewrites it. Layo owns the deterministic
`<members-file>.tokens.json` sidecar:

- Version 2 stores per-member base fingerprints, quarantine state, managed token
  metadata/hashes, and revocation overlays.
- Plaintext-bearing, malformed, duplicate, removed-member, conflicting-id, and
  binding-mismatched state fails closed.
- Writes retain resource-keyed process locking, file and directory sync, source
  snapshot comparison, and operator-base freshness comparison before rename.
- A changed base returns 409 and removes the temporary sidecar without replacing
  operator data.
- A base change after the final comparison can still race with sidecar rename.
  The base is not overwritten, but closing identity freshness across hosts needs
  transactional shared storage or an external version/CAS contract.

### V1 Quarantine And Recovery

Version 1 has no binding fingerprint, so every loaded v1 member is quarantined.
A quarantined or fingerprint-mismatched generation cannot authenticate managed
tokens or mutate itself. Recovery is explicit: a currently valid root/legacy
credential may reconcile that member to the current operator record. The
reconciliation drops untrusted managed generations, establishes a v2 binding,
and preserves recorded revocations for base token IDs. Therefore a base token
revoked in v1 or before a fingerprint change remains invalid and cannot recover
its quarantined generation.

## One-Time Secret And Async Safety

Create returns plaintext once. Only SHA-256 persists. Plaintext is absent from
the sidecar, list/revoke responses, localStorage, IndexedDB, and exported team
manifests. Dismissal, another create, identity change, leaving team settings,
reload, and successful self-revocation clear component state.

Each account-token request captures an operation generation and identity key.
Only the current generation for the same identity may update metadata, errors,
or one-time secret state. Delayed list/create/revoke responses cannot repopulate
the previous member's UI or restore cleared credentials after self-revocation.

## Failure And Verification Ledger

| Evidence | Result | What it proved or exposed |
| --- | --- | --- |
| Full `29319326675` | RED Core | MCP management tools/contract absent |
| Full `29319506090` | GREEN | Initial fail-closed MCP administration |
| Full `29321365988` | RED Core | Cached auth could diverge from current disk; self-revoke lacked acknowledgement |
| Full `29321868256` | GREEN | One locked fresh auth/mutation snapshot; explicit self-revoke |
| Full `29322921269` | GREEN | Real watched-file stdio create/list/revoke, hash-only persistence, sibling preservation |
| Full `29327585413` | RED Core | Operator-path ownership was unsafe; four intended sidecar cases failed |
| Full `29328497576` | RED Core | Create could cross the base freshness window |
| Full `29328787630` | Partial | Gates/typecheck/build and 351/351 Core passed; stale stdio sidecar assertion failed in Playwright |
| Full `29329460338` | Cancelled | Superseded during Web build; not GREEN |
| Focused account-token e2e | 3/3 passed | Real-network create/copy/refresh/revoke/recovery and secret absence |
| Direct headed CLI | 1/1 passed | `복사됨`, sibling `해지됨`, empty credential after self-revoke |
| Full `29332908276` | Cancelled | Gates/typecheck/build/Core passed; docs push superseded it during Playwright, so it is not GREEN |
| Restore `29332908281` | Passed | Current-head restore drill |
| Retention `29332908332` | Passed | Current-head backup retention |

The initial browser async guard also failed typecheck because its identity ref was
declared after first use. After `9e500aa`, the focused lifecycle revealed that
reload reauthentication lacked a restored local team; `d633563` and
`795dd88` added the state assertion and correct setup. `39983dc` removed an
unrelated focus workaround. Superseded Full runs `29332319714`,
`29332832876`, and `29332894061` were cancelled and are not GREEN evidence.

## Residual Gaps

- Durable audit events exist only as lifecycle metadata today; searchable,
  retained event consumption and operational review remain open.
- Shared transactional multi-host identity and revocation storage remains open.
  Filesystem locking and freshness checks are same-host/storage evidence only.
- MCP mutations do not yet provide agent dry-run, review, apply, summary, or
  reversible transaction semantics comparable to saved design edits.
- Root-token recovery is explicit and preserves teams/revocations, but broader
  account recovery policy and UX remain open.
- Deployment is deliberately non-gating for this slice. Preview availability or
  provider rate limits do not prove or disprove the local-first MCP/UI contract.
- PR review, final Full Verification, squash merge, and post-merge cleanup remain
  Task 4 work.
