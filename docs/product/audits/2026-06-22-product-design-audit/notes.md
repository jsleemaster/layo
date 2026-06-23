# Product Design Audit: Current Editor UI

Date: 2026-06-22
Surface: Layo web editor
Viewport: 1440 x 900
Capture: Playwright CLI

## Screenshots

1. `01-editor-shell.png` - Project/editor shell after creating a fresh audit project.
2. `02-selected-headline-resize.png` - Single text layer selected with resize handles and inspector.
3. `03-multi-selection-alignment.png` - Three selected layers with alignment controls.
4. `04-frame-spacing-guides.png` - Frame selected with padding and child spacing guides.

## Findings

1. Left sidebar mixes project management, document layers, and team setup in one persistent column.
   - Evidence: `01-editor-shell.png`, `02-selected-headline-resize.png`
   - Why it matters: The editor task competes with admin controls. The "팀" area is partially visible at the fold, and the "실시간 협업" tab wraps awkwardly.
   - Recommendation: Default the left rail to document/layers once a project is open. Move project/team admin into compact tabs, a drawer, or a settings surface.

2. Top toolbar icons are compact but under-explained.
   - Evidence: all screenshots
   - Why it matters: Several buttons read as generic squares/diamonds unless the user already knows the tool. Active state is present, but the tool group does not yet feel like a professional editor toolbar.
   - Recommendation: Add reliable tooltips, sharper active state, and conventional grouping for create/select/component/navigation controls.

3. Inspector alignment controls are useful but visually ambiguous.
   - Evidence: `02-selected-headline-resize.png`, `03-multi-selection-alignment.png`
   - Why it matters: Enabled and disabled controls are close in visual weight, and icon meaning is not self-evident. This is a repeated-use panel, so scan speed matters.
   - Recommendation: Separate align and distribute groups, improve disabled contrast, and add tooltips with action names.

4. Multi-selection lacks a clear group-level selection affordance.
   - Evidence: `03-multi-selection-alignment.png`
   - Why it matters: Three individual outlines overlap, but there is no combined bounding box, no combined size readout, and no resize handles for the selection group.
   - Recommendation: Add a group bounding box and summary dimensions before or alongside multi-selection bounding-box resize.

5. Frame spacing guides are present, but labels compete with content.
   - Evidence: `04-frame-spacing-guides.png`
   - Why it matters: The teal labels are readable, but several values float inside the selected frame and can cover the designed content. Padding and child-gap semantics are not visually distinct enough.
   - Recommendation: Use thinner guide lines, place labels outside when possible, and distinguish padding vs child spacing through label placement or subtle style differences.

6. The default document content feels less like a precise design-tool sample than the app shell.
   - Evidence: `01-editor-shell.png`, `02-selected-headline-resize.png`
   - Why it matters: The default Korean serif headline looks unrelated to the quiet technical UI. This is document content, but it is still the first impression of the editor.
   - Recommendation: Update the default sample document to use a cleaner system/Inter-like text style and add a small realistic component set for selection, resize, and alignment testing.

7. The stage uses a lot of empty workspace without fit-to-content guidance.
   - Evidence: `01-editor-shell.png`
   - Why it matters: The central object sits in a large blank field, and the user has to infer zoom/pan conventions from small controls.
   - Recommendation: Add fit-to-frame or center-on-selection behavior, plus a lightweight canvas background/grid option after snap settings are defined.

8. Inspector content is vertically dense and can run below the viewport.
   - Evidence: `02-selected-headline-resize.png`, `04-frame-spacing-guides.png`
   - Why it matters: Layout padding controls are partially below the fold at 900px height. Repeated property editing needs predictable reach.
   - Recommendation: Make inspector sections collapsible or prioritize current-selection fields above less-used controls.

## Accessibility Limits

The audit used screenshots and Playwright interactions. It did not fully test screen reader output, keyboard-only editing paths, color contrast math, or touch behavior. Visible risks are mainly unlabeled icon intent, compact controls, disabled-state contrast, and canvas-only resize handles.

## Suggested Next Slice

Implement multi-selection group affordance first: combined bounding box, combined dimensions, and clearer inspector summary. This directly connects to the next planned multi-selection bounding-box resize work.

## Implementation Follow-Up

2026-06-22 first slice: implemented the combined multi-selection group outline and combined dimensions badge. Multi-selected bounding-box resize behavior remains a separate follow-up so the visual affordance can stay covered before transform semantics change.

2026-06-22 second slice: separated Inspector alignment and distribution controls into distinct groups, added Korean tooltips, and made disabled distribution controls explicit for single-selection states.
