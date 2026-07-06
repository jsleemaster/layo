import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceExact(filePath, search, replacement) {
  const before = readFileSync(filePath, "utf8");
  if (!before.includes(search)) {
    throw new Error(`Expected text not found in ${filePath}: ${search.slice(0, 120)}`);
  }
  const after = before.replace(search, replacement);
  writeFileSync(filePath, after);
}

replaceExact(
  "packages/renderer/src/index.ts",
  "  pathData?: string;\n}\n",
  "  pathData?: string;\n  fillRule?: \"nonzero\" | \"evenodd\";\n}\n"
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `function clipSourcePathDataForNode(node: RendererNode) {
  const pathData = nodeClip(node)?.source?.pathData;
  return typeof pathData === "string" && pathData.trim() ? pathData.trim() : null;
}

function svgPathElement(pathData: string, attributes = "") {`,
  `function clipSourcePathDataForNode(node: RendererNode) {
  const pathData = nodeClip(node)?.source?.pathData;
  return typeof pathData === "string" && pathData.trim() ? pathData.trim() : null;
}

function clipSourceFillRuleForNode(node: RendererNode) {
  const fillRule = nodeClip(node)?.source?.fillRule;
  return fillRule === "evenodd" ? "evenodd" : "nonzero";
}

function clipSourceUsesEvenOddFillRule(node: RendererNode) {
  return clipSourceFillRuleForNode(node) === "evenodd";
}

function svgFillRuleAttributeForNode(node: RendererNode) {
  return clipSourceUsesEvenOddFillRule(node) ? ' fill-rule="evenodd"' : "";
}

function svgClipRuleAttributeForNode(node: RendererNode) {
  return clipSourceUsesEvenOddFillRule(node) ? ' clip-rule="evenodd"' : "";
}

function pdfFillOperatorForNode(node: RendererNode) {
  return clipSourceUsesEvenOddFillRule(node) ? "f*" : "f";
}

function pdfClipOperatorForNode(node: RendererNode) {
  return clipSourceUsesEvenOddFillRule(node) ? "W*" : "W";
}

function svgPathElement(pathData: string, attributes = "") {`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `    const maskShape = pathData
      ? svgPathElement(pathData, " fill=\\\"#fff\\\" fill-opacity=\\\"" + opacity + "\\\"")`,
  `    const maskShape = pathData
      ? svgPathElement(pathData, " fill=\\\"#fff\\\" fill-opacity=\\\"" + opacity + "\\\"" + svgFillRuleAttributeForNode(node))`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `  const clipShape = pathData
    ? svgPathElement(pathData)`,
  `  const clipShape = pathData
    ? svgPathElement(pathData, svgClipRuleAttributeForNode(node))`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `  if (pathData) {
    return "<path " + svgNodeAttributes(node) + assetAttribute + " d=\\\"" + escapeSvgText(pathData) + "\\\" " + fillAttribute + " " + strokeAttribute + " stroke-width=\\\"" + Math.max(0, Math.round(node.style.stroke_width)) + "\\\"" + opacity + filter + " />";
  }`,
  `  if (pathData) {
    const fillRuleAttribute = svgFillRuleAttributeForNode(node);
    return "<path " + svgNodeAttributes(node) + assetAttribute + " d=\\\"" + escapeSvgText(pathData) + "\\\" " + fillAttribute + " " + strokeAttribute + " stroke-width=\\\"" + Math.max(0, Math.round(node.style.stroke_width)) + "\\\"" + fillRuleAttribute + opacity + filter + " />";
  }`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `      "h",
      "W",
      "n"`,
  `      "h",
      pdfClipOperatorForNode(node),
      "n"`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `  return ["q", ...pdfShapePathCommandsForNode(node, pageHeight, x, y), "W", "n"];`,
  `  return ["q", ...pdfShapePathCommandsForNode(node, pageHeight, x, y), pdfClipOperatorForNode(node), "n"];`
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  '  return ["q", `${pdfColorOperands(node.style.fill)} rg`, ...pdfShapePathCommandsForNode(node, pageHeight, x, y), "f", "Q"];',
  '  return ["q", `${pdfColorOperands(node.style.fill)} rg`, ...pdfShapePathCommandsForNode(node, pageHeight, x, y), pdfFillOperatorForNode(node), "Q"];'
);

replaceExact(
  "apps/web/src/node-artifacts.ts",
  `    ...pdfShapePathCommandsForNode(entry.node, entry.pageHeight, entry.x, entry.y),
    "W",
    "n",`,
  `    ...pdfShapePathCommandsForNode(entry.node, entry.pageHeight, entry.x, entry.y),
    pdfClipOperatorForNode(entry.node),
    "n",`
);

const deltaDoc = [
  "# Penpot Path Fill Rule Artifacts Delta",
  "",
  "Date: 2026-07-06",
  "",
  "## Penpot Reference",
  "",
  "Penpot remains the current open-source benchmark for this slice because it is a team design platform built around self-hosting, open standards, design-code-AI workflows, inspect surfaces, and SVG/CSS/HTML/JSON-oriented handoff.",
  "",
  "Current reference URLs checked for this slice:",
  "",
  "- https://github.com/penpot/penpot",
  "- https://help.penpot.app/user-guide/export-import/exporting-layers/",
  "- https://help.penpot.app/user-guide/export-import/export-import-files/",
  "",
  "Penpot layer exports support vector handoff formats, including SVG and PDF presets, and Penpot project files are documented as open ZIP/JSON/binary-asset packages. Layo adapts that expectation by preserving Penpot-origin compound path fill-rule metadata in selected-layer artifacts instead of flattening every path through the nonzero winding default.",
  "",
  "## Maturity Gate",
  "",
  "This slice maps to:",
  "",
  "- Import/export maturity: selected-layer SVG/PDF artifacts should preserve essential vector winding semantics.",
  "- Developer handoff: compound path holes should remain inspectable in developer-facing exports.",
  "- Failure loop: the previous gap named exact path fill-rule, compound-path, boolean, and winding semantics.",
  "",
  "Deployment is intentionally not part of this slice by user direction. Vercel preview status is treated as secondary to product verification here.",
  "",
  "## Layo Adaptation",
  "",
  "Layo now preserves a Penpot-origin even-odd path fill rule for selected-layer SVG and PDF artifacts:",
  "",
  "- `NodeClipSource.fillRule` carries `nonzero` or `evenodd` metadata for Penpot-origin clip/path sources.",
  "- Selected-layer SVG path fills emit `fill-rule=\"evenodd\"` when the source path uses even-odd winding.",
  "- Selected-layer SVG clip paths emit `clip-rule=\"evenodd\"`, and alpha-mask paths emit the matching fill rule.",
  "- Selected-layer PDF path fills use `f*` and clip paths use `W*` for even-odd sources.",
  "- Nonzero sources and sources without explicit fill-rule metadata keep the existing default `f` and `W` operators.",
  "",
  "## Failure Learning",
  "",
  "The RED state proved that preserved Penpot `pathData` still lost compound path semantics: the new test expected SVG `fill-rule`/`clip-rule` attributes plus PDF `f*`/`W*`, while the existing artifact code emitted the path geometry with default SVG/PDF nonzero fill behavior.",
  "",
  "## Verification",
  "",
  "- RED: Full Verification #28794432402 passed Penpot maturity/design gates, typecheck, and web build, then failed in Core tests on the added even-odd compound path artifact regression.",
  "",
  "Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.",
  "",
  "## Remaining Gaps",
  "",
  "- Exact boolean geometry and winding semantics beyond preserved even-odd artifact metadata.",
  "- Penpot path and raw SVG shape import/export beyond selected-layer artifact preservation.",
  "- Exact mixed-stack overlay and blend compositing.",
  "- Image-gradient interactions.",
  "- Group/text gradient rendering and deeper multi-paint stack parity.",
  "- Masks, components, variants, tokens, and shared-library relation import/export parity.",
  ""
].join("\n");

writeFileSync("docs/product/penpot-path-fill-rule-artifacts-delta.md", deltaDoc);

replaceExact(
  "docs/product/penpot-maturity-benchmark.md",
  "`2026-07-06-penpot-vector-path-artifacts-delta.md` adapts preserved Penpot path geometry for selected-layer SVG/PDF artifacts by emitting path primitives and parsing M/L/H/V/C/Q/Z commands for PDF clip, fill, stroke, and gradient paths. `2026-07-06-penpot-arc-smooth-path-artifacts-delta.md` extends that PDF path parser for Penpot-origin A/S/T commands by converting arcs and smooth curves into cubic PDF path commands for clip, fill, stroke, and gradient artifacts. Exact mixed-stack overlay/blend compositing, image-gradient interactions, path fill-rule/compound-path semantics and raw path import beyond selected-layer artifacts, group/text gradient rendering, masks, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
  "`2026-07-06-penpot-vector-path-artifacts-delta.md` adapts preserved Penpot path geometry for selected-layer SVG/PDF artifacts by emitting path primitives and parsing M/L/H/V/C/Q/Z commands for PDF clip, fill, stroke, and gradient paths. `2026-07-06-penpot-arc-smooth-path-artifacts-delta.md` extends that PDF path parser for Penpot-origin A/S/T commands by converting arcs and smooth curves into cubic PDF path commands for clip, fill, stroke, and gradient artifacts. `2026-07-06-penpot-path-fill-rule-artifacts-delta.md` preserves Penpot-origin even-odd compound path metadata in selected-layer SVG and PDF artifacts by emitting SVG fill/clip rule attributes plus PDF `f*`/`W*` operators. Exact mixed-stack overlay/blend compositing, image-gradient interactions, path boolean geometry and raw path import beyond selected-layer artifacts, group/text gradient rendering, masks, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps."
);

rmSync("scripts/codex/penpot-fill-rule-artifacts.mjs");
