# Penpot Library Token Recovery Review Repair Delta

Date: 2026-07-14
PR: #304

## Benchmark Decision

Penpot personal access tokens are replaceable credentials with explicit
expiration and deletion. Layo adopts that lifecycle and adapts it to
operator-owned local-first infrastructure: accepted-member policy and the MCP
principal secret can both rotate from mounted files without restarting the
server, while browser members can retry a restored credential without
recreating their team.

References:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/user-guide/account-teams/teams/

## Exact Failed Cases

External review arrived after PR #303 was merged and identified two valid P2
gaps:

1. The team-panel apply command disabled and no-op'd the same token after a
   terminal authorization event, even when an operator had restored that token.
2. MCP watched accepted-member policy but captured
   `LAYO_MCP_MEMBER_TOKEN` once at startup, so rotating its own principal still
   required restart.

RED Full Verification `29306540857`, job `87000903745`, stopped at
typecheck because `watchTeamMemberTokenFile` did not yet exist.

## Product Change

- `LAYO_MCP_MEMBER_TOKEN_FILE` takes precedence over
  `LAYO_MCP_MEMBER_TOKEN`.
- The watched secret is trimmed and swapped only after a complete valid read.
  Blank or unreadable updates retain the last valid token.
- MCP authorization reads the stable source's current token on every tool call.
- The team panel continues to reject ordinary same-token duplicate applies, but
  a terminal authorization event re-enables the command.
- Applying that restored same token increments an explicit subscription revision
  and creates a fresh authenticated registry stream without replacing the team.
- Exit cleanup closes both member-policy and principal-token file watchers.

## Verification

Full Verification `29306760274`, job `87001544790`, passed:

- Penpot maturity and design rule gates
- repository typecheck
- web build
- core TypeScript and Rust tests
- Playwright CLI e2e

The focused live-editor Playwright interaction:

1. Created a project and local `디자인 팀`.
2. Applied `expired-member-token` and received terminal
   `credential_inactive`.
3. Observed `팀 인증이 만료되었습니다` and the same-token apply button become
   enabled.
4. Clicked the unchanged token, observed a second authenticated SSE request and
   `팀 인증 다시 연결됨`.
5. Confirmed the team remained active, then rotated to
   `rotated-member-token` and observed another successful authenticated
   connection.

Server regressions also prove live principal-token file rotation and last-valid
fallback for a blank secret update.

## Failure Learning

The implementation miss was testing only different-value replacement while the
terminal same-value recovery state remained disabled. The process miss was
merging before re-fetching a requested external review. Focused regressions now
cover both product paths, and `docs/process/failure-learning-loop.md` requires a
fresh review/thread check immediately before merge.

A memory note was not added because workspace memory changes require an explicit
user request; the repository process rule, focused tests, plan, and this delta
are the durable evidence.

## Remaining Boundary

Named per-token records, individual token revocation, multi-instance identity
storage, hosted durable pub/sub, receipt retention, and deploy automation remain
open. Deployment remains non-gating.
