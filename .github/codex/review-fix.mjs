import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function replaceOnce(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`Missing replacement target: ${label}`);
  }
  return content.replace(from, to);
}

function replaceAllRequired(content, from, to, label, minCount = 1) {
  const count = content.split(from).length - 1;
  if (count < minCount) {
    throw new Error(`Missing replacement target: ${label}; expected ${minCount}, found ${count}`);
  }
  return content.split(from).join(to);
}

function updateFile(path, updater) {
  const before = read(path);
  const after = updater(before);
  if (after === before) {
    throw new Error(`No changes produced for ${path}`);
  }
  write(path, after);
}

function patchLayoutFile(path) {
  updateFile(path, (source) => {
    let content = source;
    content = replaceOnce(
      content,
      `  const rowBaselines = new Map<number, number>();\n  const rowLastBaselines = new Map<number, number>();`,
      `  const rowBaselines = new Map<number, number>();\n  const rowLastBaselines = new Map<number, number>();\n  const rowLastBaselineCrossSizes = new Map<number, number>();`,
      `${path} row last-baseline cross-size map`
    );
    content = replaceOnce(
      content,
      `    } else if (entry.alignSelf === "last_baseline") {\n      const baseline = entry.margin.top + nodeBaselineOffset(entry.child, "last");\n      rowLastBaselines.set(entry.row, Math.max(rowLastBaselines.get(entry.row) ?? 0, baseline));\n    }`,
      `    } else if (entry.alignSelf === "last_baseline") {\n      const baseline = entry.margin.top + nodeBaselineOffset(entry.child, "last");\n      const crossSize = entry.margin.top + entry.child.size.height + entry.margin.bottom;\n      rowLastBaselines.set(entry.row, Math.max(rowLastBaselines.get(entry.row) ?? 0, baseline));\n      rowLastBaselineCrossSizes.set(entry.row, Math.max(rowLastBaselineCrossSizes.get(entry.row) ?? 0, crossSize));\n    }`,
      `${path} row last-baseline cross-size collection`
    );
    content = replaceOnce(
      content,
      `    const baselinePreference = baselinePreferenceForAlignment(alignSelf);\n    const rowBaseline =\n      alignSelf === "baseline"\n        ? rowBaselines.get(row)\n        : alignSelf === "last_baseline"\n          ? rowLastBaselines.get(row)\n          : undefined;`,
      `    const baselinePreference = baselinePreferenceForAlignment(alignSelf);\n    const rowBaseline =\n      alignSelf === "baseline"\n        ? rowBaselines.get(row)\n        : alignSelf === "last_baseline"\n          ? rowLastBaselines.get(row)\n          : undefined;\n    const baselineCrossStart =\n      alignSelf === "last_baseline"\n        ? Math.max(0, innerHeight - (rowLastBaselineCrossSizes.get(row) ?? innerHeight))\n        : 0;`,
      `${path} row last-baseline fallback start`
    );
    content = replaceOnce(
      content,
      `          : layout.padding.top + rowStarts[row] + rowBaseline - nodeBaselineOffset(child, baselinePreference)`,
      `          : layout.padding.top + rowStarts[row] + baselineCrossStart + rowBaseline - nodeBaselineOffset(child, baselinePreference)`,
      `${path} row last-baseline y fallback`
    );
    content = replaceOnce(
      content,
      `  const baselineOffset =\n    !isVertical && flowChildren.some((child) => isBaselineAlignment(effectiveChildAlignSelf(child, layout)))\n      ? Math.max(...flowChildren.map((child, index) => {\n          const alignment = effectiveChildAlignSelf(child, layout);\n          return isBaselineAlignment(alignment)\n            ? childMetrics[index].crossBefore + nodeBaselineOffset(child, baselinePreferenceForAlignment(alignment))\n            : 0;\n        }))\n      : null;`,
      `  const baselineAlignments = flowChildren.map((child) => effectiveChildAlignSelf(child, layout));\n  const firstBaselineOffset =\n    !isVertical && baselineAlignments.some((alignment) => alignment === "baseline")\n      ? Math.max(...flowChildren.map((child, index) =>\n          baselineAlignments[index] === "baseline"\n            ? childMetrics[index].crossBefore + nodeBaselineOffset(child, "first")\n            : 0\n        ))\n      : null;\n  const lastBaselineOffset =\n    !isVertical && baselineAlignments.some((alignment) => alignment === "last_baseline")\n      ? Math.max(...flowChildren.map((child, index) =>\n          baselineAlignments[index] === "last_baseline"\n            ? childMetrics[index].crossBefore + nodeBaselineOffset(child, "last")\n            : 0\n        ))\n      : null;\n  const lastBaselineCrossSize =\n    lastBaselineOffset === null\n      ? 0\n      : flowChildren.reduce((maximum, _child, index) =>\n          baselineAlignments[index] === "last_baseline"\n            ? Math.max(maximum, childMetrics[index].crossBefore + childMetrics[index].crossSize + childMetrics[index].crossAfter)\n            : maximum,\n          0\n        );\n  const lastBaselineCrossStart = crossStartPadding + Math.max(0, availableCross - lastBaselineCrossSize);`,
      `${path} single-line baseline groups`
    );
    content = replaceOnce(
      content,
      `    const crossAxisPosition =\n      isBaselineAlignment(childAlignSelf) && baselineOffset !== null\n        ? crossStartPadding + baselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))\n        : crossAxisOffset(`,
      `    const childBaselineOffset =\n      childAlignSelf === "baseline" ? firstBaselineOffset : childAlignSelf === "last_baseline" ? lastBaselineOffset : null;\n    const childBaselineCrossStart = childAlignSelf === "last_baseline" ? lastBaselineCrossStart : crossStartPadding;\n    const crossAxisPosition =\n      childBaselineOffset !== null\n        ? childBaselineCrossStart + childBaselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))\n        : crossAxisOffset(`,
      `${path} single-line baseline position`
    );
    content = replaceOnce(
      content,
      `    const baselineOffset =\n      !isVertical && line.children.some((entry) => isBaselineAlignment(effectiveChildAlignSelf(entry.child, layout)))\n        ? Math.max(...line.children.map((entry) => {\n            const alignment = effectiveChildAlignSelf(entry.child, layout);\n            return isBaselineAlignment(alignment)\n              ? entry.metrics.crossBefore + nodeBaselineOffset(entry.child, baselinePreferenceForAlignment(alignment))\n              : 0;\n          }))\n        : null;`,
      `    const lineBaselineAlignments = line.children.map((entry) => effectiveChildAlignSelf(entry.child, layout));\n    const firstBaselineOffset =\n      !isVertical && lineBaselineAlignments.some((alignment) => alignment === "baseline")\n        ? Math.max(...line.children.map((entry, index) =>\n            lineBaselineAlignments[index] === "baseline"\n              ? entry.metrics.crossBefore + nodeBaselineOffset(entry.child, "first")\n              : 0\n          ))\n        : null;\n    const lastBaselineOffset =\n      !isVertical && lineBaselineAlignments.some((alignment) => alignment === "last_baseline")\n        ? Math.max(...line.children.map((entry, index) =>\n            lineBaselineAlignments[index] === "last_baseline"\n              ? entry.metrics.crossBefore + nodeBaselineOffset(entry.child, "last")\n              : 0\n          ))\n        : null;\n    const lastBaselineCrossSize =\n      lastBaselineOffset === null\n        ? 0\n        : line.children.reduce((maximum, entry, index) =>\n            lineBaselineAlignments[index] === "last_baseline"\n              ? Math.max(maximum, entry.metrics.crossBefore + entry.metrics.crossSize + entry.metrics.crossAfter)\n              : maximum,\n            0\n          );\n    const lastBaselineCrossStart = crossCursor + Math.max(0, line.crossSize - lastBaselineCrossSize);`,
      `${path} wrapped baseline groups`
    );
    content = replaceOnce(
      content,
      `      const crossAxisPosition =\n        isBaselineAlignment(childAlignSelf) && baselineOffset !== null\n          ? crossCursor + baselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))\n          : crossAxisLineOffset(`,
      `      const childBaselineOffset =\n        childAlignSelf === "baseline" ? firstBaselineOffset : childAlignSelf === "last_baseline" ? lastBaselineOffset : null;\n      const childBaselineCrossStart = childAlignSelf === "last_baseline" ? lastBaselineCrossStart : crossCursor;\n      const crossAxisPosition =\n        childBaselineOffset !== null\n          ? childBaselineCrossStart + childBaselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))\n          : crossAxisLineOffset(`,
      `${path} wrapped baseline position`
    );
    return content;
  });
}

patchLayoutFile("apps/server/src/layout.ts");
patchLayoutFile("apps/web/src/editor-state.ts");

for (const path of ["apps/web/src/editor-state.test.ts", "apps/server/src/layout.test.ts"]) {
  updateFile(path, (source) => {
    let content = source;
    content = replaceAllRequired(content, `expect(title?.transform).toMatchObject({ x: 20, y: 20 });`, `expect(title?.transform).toMatchObject({ x: 20, y: 48 });`, `${path} optional title y`, 1);
    content = replaceAllRequired(content, `expect(relaidTitle?.transform).toMatchObject({ x: 20, y: 20 });`, `expect(relaidTitle?.transform).toMatchObject({ x: 20, y: 48 });`, `${path} optional relaid title y`, path.includes("editor-state") ? 1 : 0);
    content = replaceAllRequired(content, `expect(title.transform).toMatchObject({ x: 20, y: 20 });`, `expect(title.transform).toMatchObject({ x: 20, y: 48 });`, `${path} title y`, path.includes("layout.test") ? 2 : 0);
    content = replaceAllRequired(content, `expect(caption?.transform).toMatchObject({ x: 150, y: 65 });`, `expect(caption?.transform).toMatchObject({ x: 150, y: 93 });`, `${path} caption y`, 2);
    return content;
  });
}

write("crates/editor-core/bindings/LayoutAlignItems.ts", `// This file was generated by [ts-rs](https://github.com/Aleph-Alpha/ts-rs). Do not edit this file manually.\n\nexport type LayoutAlignItems = "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";\n`);
write("crates/editor-core/bindings/LayoutSelfAlignment.ts", `// This file was generated by [ts-rs](https://github.com/Aleph-Alpha/ts-rs). Do not edit this file manually.\n\nexport type LayoutSelfAlignment = "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";\n`);

updateFile("docs/superpowers/plans/2026-07-05-penpot-last-baseline-layout.md", (source) =>
  replaceOnce(
    source,
    "## Status\n\nImplemented through the Penpot maturity loop after deployment was explicitly deferred.\n",
    "## Failure Follow-up\n\nAutomated review found that the initial slice modeled last-baseline grouping but missed CSS's end fallback for `last baseline`, and also missed regenerated Rust TypeScript binding files for the new enum values. The follow-up keeps first and last baseline groups separate, shifts last-baseline groups to the cross-end fallback when extra cross-axis space exists, updates generated bindings, and changes the geometry regression tests to fail on the original start-anchored behavior.\n\n## Status\n\nImplemented through the Penpot maturity loop after deployment was explicitly deferred.\n",
    "plan failure follow-up"
  )
);

rmSync(".github/codex", { recursive: true, force: true });
rmSync(".github/workflows/codex-review-fix.yml", { force: true });
