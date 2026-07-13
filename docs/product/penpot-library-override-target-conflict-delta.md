# Penpot Library Override Target Conflict Delta

**PR:** #285  
**Status:** Same-id replacement and local-override conflict guard complete. The broader
library update recovery plan remains active.

## Failed Case

A published Penpot component could keep the same component id while replacing a
source node. A subscribed target instance could still hold a local override whose
`node_id` referenced the removed source node. The previous update preview only
checked deleted component ids, returned `canUpdate: true`, and allowed the
replacement to proceed.

RED Full Verification `29251634592` reproduced the gap with two focused
failures: the preview contract lacked `conflictedComponents`, and the same-id
replacement was accepted instead of returning
`library_component_override_target_missing`.

## Benchmark Decision

- **Adopt:** Penpot's explicit shared-library update review and source ownership.
- **Adapt:** treat component source-node identity as part of Layo's deterministic
  local-first subscription contract, alongside source and target component ids.
- **Diverge:** block an incompatible update before any asset, document, or
  subscription write instead of silently discarding unresolved local overrides.

## Implemented Contract

- The update preview now reports `conflictedComponents` with source and target
  component ids, affected instance ids, and missing override node ids.
- Compatibility checks include the component source tree and variant-owned source
  trees. Every override `node_id` is validated; a `component_swap` value remains
  a separate component reference and is not mistaken for a source-node id.
- Deletion and override conflicts can be reported together in deterministic
  blocker order.
- Storage and HTTP apply routes reject missing override targets before writes.
- The Korean editor distinguishes local-override incompatibility from in-use
  component deletion and reports conflict, instance, and missing-target counts.
- Playwright clicks the visible update control for both conflict classes and
  proves the update endpoint is called zero times.

## Verification

GREEN Full Verification `29252017219` passed in 7m9s:

- maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 264 server tests
- Rust workspace tests
- 192 Playwright CLI tests

The focused server fixture also verifies the HTTP review response, HTTP 400 apply
rejection, unchanged target document, and unchanged registry subscription.

## Failure Learning

**Root cause:** the earlier preview treated a stable component id as sufficient
compatibility evidence. Local overrides actually depend on stable source-node
identity as well.

**Durable guard:** the regression fixture replaces only the source root id while
preserving the component id. It includes one fill override and a separate
`component_swap`-only instance, then checks both affected instance ids, preview
details, apply rejection, and zero state mutation. Browser proof separately
confirms that visible UI actions never reach the apply endpoint.

**Review correction:** the first review RED run `29252670196` assumed the nested
swap's parent component belonged to the external library, but that definition is
owned by the target product file. The corrected fixture creates a direct
library-component instance with only a swap override. RED `29252869887` then
proved the implementation skipped that instance because it excluded the whole
`component_swap` override instead of validating its `node_id`.

**Remaining risk:** preview and apply still read registry state in separate
operations. A publisher can change the archive after a successful preview, and
asset/document/subscription writes do not yet have a shared rollback boundary.

## Next Goal

Create the next exact RED case where the registry archive changes between review
and apply. Require a revision-bound preview or atomic revalidation, then prove
interrupted-write rollback, retry, and version recovery before completing the
active recovery plan.
