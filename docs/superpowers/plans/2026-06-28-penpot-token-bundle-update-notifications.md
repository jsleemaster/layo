# Penpot Token Bundle Update Notifications Plan

**Goal:** Close the registry token-bundle update notification gap after token-bundle import, so a target file can see and apply republished shared-library tokens, token sets, and token themes.

**Penpot reference:** Penpot design systems support shared library reuse and token/theme workflows. Layo adapts that expectation to its local-first registry by tracking token-bundle subscriptions per target file and exposing deterministic HTTP/MCP apply flows.

**Maturity gates:** Design systems, import/export maturity, agent safety, and failure loop.

## Implementation

- Add storage-backed token-bundle subscriptions separate from component-library subscriptions because token bundles use replacement semantics instead of id-map merge semantics.
- Add token-bundle update notifications that compare the imported registry timestamp with the current registry entry timestamp.
- Add an apply-update operation that replaces the target file's `tokens`, `token_sets`, and `token_themes` from the latest published library archive.
- Expose the flow through HTTP, MCP, web API helpers, and the file-panel UI.
- Extend Playwright CLI coverage so a Team Kit token bundle import later reports an update and applies the republished token/theme values.

## Verification

- RED/GREEN storage test for token-bundle subscriptions, update notifications, and replacement apply.
- RED/GREEN HTTP test for `/libraries/token-subscriptions`, `/libraries/token-updates`, and `/import/library/registry/tokens/update`.
- RED/GREEN MCP test for `list_library_registry_token_subscriptions`, `list_library_registry_token_updates`, and `update_library_registry_tokens` plus safety annotations.
- RED/GREEN web API helper test for token-bundle update endpoints.
- RED/GREEN Playwright CLI proof in `file panel reviews and imports shared library token bundles`.

## Remaining Gaps

- Hosted permissioned registry sync.
- Cross-process registry update fanout.
- Backup/restore runbooks and external migration paths.
- Arbitrary filter/effect graph fidelity.
