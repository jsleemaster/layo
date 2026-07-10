# Penpot Vector Source MCP Schema Delta

Date: 2026-07-10

## Penpot Reference

- Capability: Penpot MCP exposes design-context operations to AI clients.
- Source: https://help.penpot.app/mcp/

## Layo Decision

Adapt. Layo keeps deterministic typed command batches as the safer local-first agent-control surface, but saved design-state mutations must remain reachable through both HTTP/storage and MCP.

## Gap Closed

PR #270 added the `set_vector_source` agent command for Penpot-origin path metadata on imported image bridge nodes. This follow-up closes the MCP parity gap by allowing `apply_agent_commands` to accept the same command over the MCP schema.

## Maturity Gates

- Agent safety: AI-editable saved-state behavior supports MCP apply, inspect, validation, and change-summary evidence.
- Developer handoff: preserved Penpot path source metadata remains available to agent clients that operate through MCP rather than HTTP.
- Import/export maturity: Penpot path bridge metadata remains editable after import instead of becoming HTTP-only state.

## Verification Target

- RED: `mcp-vector-source.test.ts` failed because MCP rejected `set_vector_source` before schema support.
- GREEN: the same test must pass after the schema accepts `vectorSource` payloads and inspect returns the persisted metadata.
