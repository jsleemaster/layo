# Penpot Library Token Recovery Plan

Date: 2026-07-14
Status: Completed by PR #303 merge gate

## Goal

Recover an expired or rotated team library credential without restarting the
HTTP/MCP process or recreating the active browser team.

## Penpot Decision

- Adopt replaceable, expiring, revocable access-token behavior.
- Adapt runtime rotation to an operator-owned watched JSON file.
- Preserve Layo's open unconfigured local-first mode and static env fallback.

## Tasks

- [x] Record failing watched-file rotation and malformed-update tests.
- [x] Keep one stable authorization object and atomically replace parsed members.
- [x] Wire file precedence into HTTP and MCP startup.
- [x] Emit and parse authenticated registry stream readiness.
- [x] Add explicit member-token replacement to the active team panel.
- [x] Keep expiry, reconnecting, and success feedback visible with `aria-live`.
- [x] Run full unit, Rust, build, and Playwright CLI verification.
- [x] Record failures, direct interaction evidence, and remaining gaps.

## Evidence

- Server RED: `29304547951`, job `86995132532`
- Web contract RED: `29304746565`, job `86995720752`
- SSE matcher failure: `29304831810`, job `86995963258`
- Hidden-status failure: `29304931210`, job `86996258338`
- Code-head GREEN: `29305440761`, job `86997742164`

Product evidence:
`docs/product/penpot-library-token-recovery-delta.md`.

## Next Gap

Penpot manages named tokens individually. Layo still groups hashes and lifecycle
cutoffs at member scope, so named per-token records and single-token revocation
are the next exact credential maturity gap.
