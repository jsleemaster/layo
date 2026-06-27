# Penpot Variant Source Switching Design

Date: 2026-06-28

## Goal

Layo component variants must be able to own distinct source layer trees, not only metadata properties. Switching a component instance from one variant to another should materialize the target variant's source tree while preserving compatible instance overrides.

This closes the next Penpot maturity gap in design systems: variants are real alternatives of a component, so an instance can change structure, geometry, and style when its variant selection changes.

Penpot reference: https://help.penpot.app/user-guide/design-systems/variants/

## Current Failure

- `ComponentVariant` stores `id`, `name`, and `properties` only.
- `create_component_instance` always clones `ComponentDefinition.source_node`.
- `set_component_instance_variant` only updates `component_instance.variant_id`.
- `combine_components_as_variants` converts selected main components into variant metadata but discards each selected component's source node.

The result is a misleading variant UI: the selected variant changes in metadata, but the canvas tree remains the original source.

## Target Behavior

- `ComponentVariant` gains optional `source_node`.
- If a variant has `source_node`, creating or switching an instance uses that source tree.
- If a variant does not have `source_node`, behavior falls back to `ComponentDefinition.source_node` for backwards compatibility.
- Switching variants keeps the existing instance root id, transform, name, lock/visibility state, and component metadata.
- Compatible text overrides survive the switch by source node id. Overrides whose source target is not present in the new variant are retained in metadata but not applied to the materialized tree.
- `combine_components_as_variants` stores each selected main component node as that generated variant's source tree.
- Web reducer, server storage, and Rust JSON model all preserve the same contract.

## Non-Goals

- Full Penpot variant-area layout editing is not part of this slice.
- Non-text override remapping is not part of this slice.
- Hosted shared-library publication is not part of this slice.

## Verification

- Web reducer RED/GREEN: variant source tree materializes on create/switch and text overrides survive compatible target nodes.
- Web reducer RED/GREEN: combining main components as variants preserves each selected source tree.
- Server storage RED/GREEN: persisted instance tree changes after `setComponentInstanceVariant`.
- Rust RED/GREEN: `ComponentVariant.source_node` round-trips through JSON.
- Existing component variant UI and Penpot maturity gates still pass.
