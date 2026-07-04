import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

function walk(dir, files = []) {
  if (!existsSync(dir)) {
    return files;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else {
      files.push(path);
    }
  }
  return files;
}

function patchLayoutFile(path, nodeType) {
  updateFile(path, (source) => {
    let content = source;
    content = replaceOnce(
      content,
      `  const rowBaselines = new Map<number, number>();\n  for (const entry of entries) {\n    if (entry.alignSelf === "baseline") {\n      const baseline = entry.margin.top + nodeBaselineOffset(entry.child);\n      rowBaselines.set(entry.row, Math.max(rowBaselines.get(entry.row) ?? 0, baseline));\n    }\n  }`,
      `  const rowBaselines = new Map<number, number>();\n  const rowLastBaselines = new Map<number, number>();\n  for (const entry of entries) {\n    if (entry.alignSelf === "baseline") {\n      const baseline = entry.margin.top + nodeBaselineOffset(entry.child, "first");\n      rowBaselines.set(entry.row, Math.max(rowBaselines.get(entry.row) ?? 0, baseline));\n    } else if (entry.alignSelf === "last_baseline") {\n      const baseline = entry.margin.top + nodeBaselineOffset(entry.child, "last");\n      rowLastBaselines.set(entry.row, Math.max(rowLastBaselines.get(entry.row) ?? 0, baseline));\n    }\n  }`,
      `${path} grid row baseline maps`
    );
    content = replaceOnce(
      content,
      `    const { child, justifySelf, alignSelf, row, column, margin, innerWidth, innerHeight } = entry;\n    const rowBaseline = alignSelf === "baseline" ? rowBaselines.get(row) : undefined;\n    child.transform = {\n      ...child.transform,\n      x: layout.padding.left + columnStarts[column] + margin.left + gridAxisOffset(justifySelf, innerWidth, child.size.width),\n      y:\n        rowBaseline === undefined\n          ? layout.padding.top + rowStarts[row] + margin.top + gridAxisOffset(alignSelf, innerHeight, child.size.height)\n          : layout.padding.top + rowStarts[row] + rowBaseline - nodeBaselineOffset(child)\n    };`,
      `    const { child, justifySelf, alignSelf, row, column, margin, innerWidth, innerHeight } = entry;\n    const baselinePreference = baselinePreferenceForAlignment(alignSelf);\n    const rowBaseline =\n      alignSelf === "baseline"\n        ? rowBaselines.get(row)\n        : alignSelf === "last_baseline"\n          ? rowLastBaselines.get(row)\n          : undefined;\n    child.transform = {\n      ...child.transform,\n      x: layout.padding.left + columnStarts[column] + margin.left + gridAxisOffset(justifySelf, innerWidth, child.size.width),\n      y:\n        rowBaseline === undefined\n          ? layout.padding.top + rowStarts[row] + margin.top + gridAxisOffset(alignSelf, innerHeight, child.size.height)\n          : layout.padding.top + rowStarts[row] + rowBaseline - nodeBaselineOffset(child, baselinePreference)\n    };`,
      `${path} grid row baseline position`
    );
    content = replaceOnce(
      content,
      `  const baselineOffset =\n    !isVertical && flowChildren.some((child) => effectiveChildAlignSelf(child, layout) === "baseline")\n      ? Math.max(...flowChildren.map((child, index) =>\n          effectiveChildAlignSelf(child, layout) === "baseline"\n            ? childMetrics[index].crossBefore + nodeBaselineOffset(child)\n            : 0\n        ))\n      : null;`,
      `  const baselineOffset =\n    !isVertical && flowChildren.some((child) => isBaselineAlignment(effectiveChildAlignSelf(child, layout)))\n      ? Math.max(...flowChildren.map((child, index) => {\n          const alignment = effectiveChildAlignSelf(child, layout);\n          return isBaselineAlignment(alignment)\n            ? childMetrics[index].crossBefore + nodeBaselineOffset(child, baselinePreferenceForAlignment(alignment))\n            : 0;\n        }))\n      : null;`,
      `${path} single-line baseline offset`
    );
    content = replaceOnce(
      content,
      `      childAlignSelf === "baseline" && baselineOffset !== null\n        ? crossStartPadding + baselineOffset - nodeBaselineOffset(child)`,
      `      isBaselineAlignment(childAlignSelf) && baselineOffset !== null\n        ? crossStartPadding + baselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))`,
      `${path} single-line baseline position`
    );
    content = replaceOnce(
      content,
      `    const baselineOffset =\n      !isVertical && line.children.some((entry) => effectiveChildAlignSelf(entry.child, layout) === "baseline")\n        ? Math.max(...line.children.map((entry) =>\n            effectiveChildAlignSelf(entry.child, layout) === "baseline"\n              ? entry.metrics.crossBefore + nodeBaselineOffset(entry.child)\n              : 0\n          ))\n        : null;`,
      `    const baselineOffset =\n      !isVertical && line.children.some((entry) => isBaselineAlignment(effectiveChildAlignSelf(entry.child, layout)))\n        ? Math.max(...line.children.map((entry) => {\n            const alignment = effectiveChildAlignSelf(entry.child, layout);\n            return isBaselineAlignment(alignment)\n              ? entry.metrics.crossBefore + nodeBaselineOffset(entry.child, baselinePreferenceForAlignment(alignment))\n              : 0;\n          }))\n        : null;`,
      `${path} wrapped baseline offset`
    );
    content = replaceOnce(
      content,
      `        childAlignSelf === "baseline" && baselineOffset !== null\n          ? crossCursor + baselineOffset - nodeBaselineOffset(child)`,
      `        isBaselineAlignment(childAlignSelf) && baselineOffset !== null\n          ? crossCursor + baselineOffset - nodeBaselineOffset(child, baselinePreferenceForAlignment(childAlignSelf))`,
      `${path} wrapped baseline position`
    );
    content = replaceOnce(
      content,
      `  return ["start", "center", "end", "stretch", "baseline"].includes(value);`,
      `  return ["start", "center", "end", "stretch", "baseline", "last_baseline"].includes(value);`,
      `${path} align-items validator`
    );
    content = replaceOnce(
      content,
      `  return value === "start" || value === "center" || value === "end" || value === "stretch" || value === "baseline";`,
      `  return (\n    value === "start" ||\n    value === "center" ||\n    value === "end" ||\n    value === "stretch" ||\n    value === "baseline" ||\n    value === "last_baseline"\n  );`,
      `${path} align-self validator`
    );
    content = replaceOnce(
      content,
      `function nodeBaselineOffset(node: ${nodeType}): number {\n  if (node.content.type === "text") {\n    if (isVerticalTextWritingMode(node.content.writing_mode)) {\n      return Math.max(0, Math.min(node.size.height, Math.round(node.size.width / 2)));\n    }\n    return Math.max(0, Math.min(node.size.height, Math.round(node.content.font_size * 0.8)));\n  }\n  return node.size.height;\n}`,
      `type BaselinePreference = "first" | "last";\n\nfunction isBaselineAlignment(alignItems: NodeLayout["align_items"]): boolean {\n  return alignItems === "baseline" || alignItems === "last_baseline";\n}\n\nfunction baselinePreferenceForAlignment(alignItems: NodeLayout["align_items"]): BaselinePreference {\n  return alignItems === "last_baseline" ? "last" : "first";\n}\n\nfunction nodeBaselineOffset(node: ${nodeType}, preference: BaselinePreference = "first"): number {\n  if (node.content.type === "text") {\n    if (isVerticalTextWritingMode(node.content.writing_mode)) {\n      const firstBaseline = Math.max(0, Math.min(node.size.height, Math.round(node.size.width / 2)));\n      if (preference === "last") {\n        const descent = Math.max(0, node.size.width - firstBaseline);\n        return Math.max(0, Math.min(node.size.height, node.size.height - descent));\n      }\n      return firstBaseline;\n    }\n    const firstBaseline = Math.max(0, Math.min(node.size.height, Math.round(node.content.font_size * 0.8)));\n    if (preference === "last") {\n      const descent = Math.max(0, node.content.font_size - firstBaseline);\n      return Math.max(0, Math.min(node.size.height, node.size.height - descent));\n    }\n    return firstBaseline;\n  }\n  return node.size.height;\n}`,
      `${path} baseline helper`
    );
    return content;
  });
}

const alignItemsUnion = `align_items: "start" | "center" | "end" | "stretch" | "baseline";`;
const alignItemsUnionNext = `align_items: "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";`;
const alignSelfUnion = `align_self?: "start" | "center" | "end" | "stretch" | "baseline";`;
const alignSelfUnionNext = `align_self?: "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";`;

for (const path of ["packages/renderer/src/index.ts", "apps/server/src/storage.ts"]) {
  updateFile(path, (source) =>
    replaceOnce(replaceOnce(source, alignItemsUnion, alignItemsUnionNext, `${path} align_items union`), alignSelfUnion, alignSelfUnionNext, `${path} align_self union`)
  );
}

updateFile("crates/editor-core/src/model.rs", (source) => {
  let content = replaceOnce(
    source,
    `pub enum LayoutSelfAlignment {\n    Start,\n    Center,\n    End,\n    Stretch,\n    Baseline,\n}`,
    `pub enum LayoutSelfAlignment {\n    Start,\n    Center,\n    End,\n    Stretch,\n    Baseline,\n    LastBaseline,\n}`,
    "Rust LayoutSelfAlignment"
  );
  content = replaceOnce(
    content,
    `pub enum LayoutAlignItems {\n    Start,\n    Center,\n    End,\n    Stretch,\n    Baseline,\n}`,
    `pub enum LayoutAlignItems {\n    Start,\n    Center,\n    End,\n    Stretch,\n    Baseline,\n    LastBaseline,\n}`,
    "Rust LayoutAlignItems"
  );
  return content;
});

for (const path of walk("packages/shared")) {
  if (!path.endsWith(".ts")) {
    continue;
  }
  const before = read(path);
  const after = before
    .split(`"start" | "center" | "end" | "stretch" | "baseline"`)
    .join(`"start" | "center" | "end" | "stretch" | "baseline" | "last_baseline"`);
  if (after !== before) {
    write(path, after);
  }
}

patchLayoutFile("apps/web/src/editor-state.ts", "RendererNode");
patchLayoutFile("apps/server/src/layout.ts", "DesignNode");

updateFile("apps/web/src/App.tsx", (source) =>
  replaceAllRequired(
    source,
    `<option value="baseline">기준선</option>`,
    `<option value="baseline">첫 기준선</option>\n              <option value="last_baseline">마지막 기준선</option>`,
    "App baseline options",
    2
  )
);

updateFile("apps/server/src/mcp.ts", (source) =>
  replaceAllRequired(
    source,
    `z.enum(["start", "center", "end", "stretch", "baseline"])`,
    `z.enum(["start", "center", "end", "stretch", "baseline", "last_baseline"])`,
    "MCP baseline schemas",
    2
  )
);

updateFile("apps/server/src/code-export.ts", (source) => {
  let content = replaceOnce(
    source,
    `function renderNode(node: DesignNode, depth: number): string {`,
    `function cssBoxAlignmentValue(value: string): string {\n  return value === "last_baseline" ? "last baseline" : value;\n}\n\nfunction renderNode(node: DesignNode, depth: number): string {`,
    "code export alignment helper"
  );
  content = replaceOnce(
    content,
    `    lines.push(\`  align-self: \${node.layout_item.align_self};\`);`,
    `    lines.push(\`  align-self: \${cssBoxAlignmentValue(node.layout_item.align_self)};\`);`,
    "code export align-self css"
  );
  return content;
});

updateFile("apps/web/src/editor-state.test.ts", (source) => {
  const insertion = `\n  test("last-baseline alignment matches final text baselines in horizontal auto layout", () => {\n    const document = sampleDocument();\n    const frame = findNodeById(document, "frame-1") as any;\n    frame.size = { width: 360, height: 140 };\n    frame.layout = {\n      mode: "auto",\n      direction: "horizontal",\n      align_items: "last_baseline",\n      justify_content: "start",\n      gap: 10,\n      padding: { top: 20, right: 20, bottom: 20, left: 20 }\n    } as any;\n    const text = findNodeById(document, "text-1") as any;\n    text.size = { width: 120, height: 72 };\n    text.content = {\n      type: "text",\n      value: "Title",\n      font_size: 32,\n      font_family: "Inter"\n    };\n    frame.children.push({\n      id: "caption-1",\n      kind: "text",\n      name: "캡션",\n      transform: { x: 0, y: 0, rotation: 0 },\n      size: { width: 80, height: 24 },\n      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },\n      content: {\n        type: "text",\n        value: "Caption",\n        font_size: 16,\n        font_family: "Inter"\n      },\n      children: []\n    });\n\n    const relaid = executeEditorCommand(createEditorState(document), {\n      type: "update_node_geometry",\n      nodeId: "caption-1",\n      patch: { width: 80 }\n    });\n\n    const title = findNodeById(relaid.document, "text-1");\n    const caption = findNodeById(relaid.document, "caption-1");\n    expect(title?.transform).toMatchObject({ x: 20, y: 20 });\n    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });\n    expect((title?.transform.y ?? 0) + 66).toBe((caption?.transform.y ?? 0) + 21);\n  });\n\n  test("grid layout last-baseline aligns mixed text per row", () => {\n    const document = sampleDocument();\n    const frame = findNodeById(document, "frame-1") as any;\n    frame.size = { width: 300, height: 140 };\n    frame.layout = {\n      mode: "grid",\n      direction: "horizontal",\n      grid_columns: 2,\n      grid_rows: 1,\n      align_items: "last_baseline",\n      justify_content: "start",\n      gap: 0,\n      row_gap: 0,\n      column_gap: 0,\n      padding: { top: 20, right: 20, bottom: 20, left: 20 }\n    } as any;\n    const title = findNodeById(document, "text-1") as any;\n    title.size = { width: 90, height: 72 };\n    title.content = {\n      type: "text",\n      value: "Title",\n      font_size: 32,\n      font_family: "Inter"\n    };\n    frame.children.push({\n      id: "caption-1",\n      kind: "text",\n      name: "캡션",\n      transform: { x: 0, y: 0, rotation: 0 },\n      size: { width: 80, height: 24 },\n      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },\n      content: {\n        type: "text",\n        value: "Caption",\n        font_size: 16,\n        font_family: "Inter"\n      },\n      children: []\n    });\n\n    const relaid = executeEditorCommand(createEditorState(document), {\n      type: "update_node_geometry",\n      nodeId: "caption-1",\n      patch: { width: 80 }\n    });\n\n    const relaidTitle = findNodeById(relaid.document, "text-1");\n    const caption = findNodeById(relaid.document, "caption-1");\n    expect(relaidTitle?.transform).toMatchObject({ x: 20, y: 20 });\n    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });\n    expect((relaidTitle?.transform.y ?? 0) + 66).toBe((caption?.transform.y ?? 0) + 21);\n  });\n`;
  return replaceOnce(
    source,
    `\n  test("align-self baseline joins horizontal auto layout baseline groups", () => {`,
    `${insertion}\n  test("align-self baseline joins horizontal auto layout baseline groups", () => {`,
    "web last baseline tests"
  );
});

write("apps/server/src/layout.test.ts", `import { describe, expect, test } from "vitest";\nimport { relayoutDesignFile } from "./layout";\nimport { sampleDocument } from "./sample-document";\nimport type { DesignFile } from "./storage";\n\ndescribe("server layout", () => {\n  test("last-baseline alignment matches final text baselines in horizontal auto layout", () => {\n    const document = structuredClone(sampleDocument) as DesignFile;\n    const frame = document.pages[0].children[0] as any;\n    frame.size = { width: 360, height: 140 };\n    frame.layout = {\n      mode: "auto",\n      direction: "horizontal",\n      align_items: "last_baseline",\n      justify_content: "start",\n      gap: 10,\n      padding: { top: 20, right: 20, bottom: 20, left: 20 }\n    };\n    const title = frame.children[0];\n    title.size = { width: 120, height: 72 };\n    title.content = { type: "text", value: "Title", font_size: 32, font_family: "Inter" };\n    frame.children.push({\n      id: "caption-1",\n      kind: "text",\n      name: "캡션",\n      transform: { x: 0, y: 0, rotation: 0 },\n      size: { width: 80, height: 24 },\n      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },\n      content: { type: "text", value: "Caption", font_size: 16, font_family: "Inter" },\n      children: []\n    });\n\n    relayoutDesignFile(document);\n\n    const caption = frame.children.find((node: { id: string }) => node.id === "caption-1");\n    expect(title.transform).toMatchObject({ x: 20, y: 20 });\n    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });\n    expect(title.transform.y + 66).toBe((caption?.transform.y ?? 0) + 21);\n  });\n\n  test("grid layout last-baseline aligns mixed text per row", () => {\n    const document = structuredClone(sampleDocument) as DesignFile;\n    const frame = document.pages[0].children[0] as any;\n    frame.size = { width: 300, height: 140 };\n    frame.layout = {\n      mode: "grid",\n      direction: "horizontal",\n      grid_columns: 2,\n      grid_rows: 1,\n      align_items: "last_baseline",\n      justify_content: "start",\n      gap: 0,\n      row_gap: 0,\n      column_gap: 0,\n      padding: { top: 20, right: 20, bottom: 20, left: 20 }\n    };\n    const title = frame.children[0];\n    title.size = { width: 90, height: 72 };\n    title.content = { type: "text", value: "Title", font_size: 32, font_family: "Inter" };\n    frame.children.push({\n      id: "caption-1",\n      kind: "text",\n      name: "캡션",\n      transform: { x: 0, y: 0, rotation: 0 },\n      size: { width: 80, height: 24 },\n      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },\n      content: { type: "text", value: "Caption", font_size: 16, font_family: "Inter" },\n      children: []\n    });\n\n    relayoutDesignFile(document);\n\n    const caption = frame.children.find((node: { id: string }) => node.id === "caption-1");\n    expect(title.transform).toMatchObject({ x: 20, y: 20 });\n    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });\n    expect(title.transform.y + 66).toBe((caption?.transform.y ?? 0) + 21);\n  });\n});\n`);

updateFile("apps/server/src/code-export.test.ts", (source) => {
  const insertion = `\n  test("exports last-baseline align-self layout item CSS", () => {\n    const fixture = tossFixture() as any;\n    fixture.pages[0].children[0].layout = {\n      mode: "auto",\n      direction: "horizontal",\n      align_items: "last_baseline",\n      justify_content: "start",\n      gap: 8,\n      padding: { top: 0, right: 0, bottom: 0, left: 0 }\n    };\n    fixture.pages[0].children[0].children[0].layout_item = {\n      align_self: "last_baseline",\n      margin: { top: 0, right: 0, bottom: 0, left: 0 }\n    };\n\n    const result = exportDesignToCode(fixture);\n\n    expect(result.css).toContain(".node-tds-button-label {");\n    expect(result.css).toContain("align-self: last baseline;");\n    const button = result.elements.find((element) => element.id === "tds-button-primary");\n    expect(button?.structure.children[0].layout_item).toMatchObject({ align_self: "last_baseline" });\n  });\n`;
  return replaceOnce(
    source,
    `\n  test("exports effect shadows as CSS and implementation metadata", () => {`,
    `${insertion}\n  test("exports effect shadows as CSS and implementation metadata", () => {`,
    "code export last baseline test"
  );
});

updateFile("apps/web/e2e/editor-mvp.spec.ts", (source) => {
  const insertion = `\ntest("inspector exposes last-baseline layout alignment controls", async ({ page }) => {\n  const { documentId } = await createProjectFromEmptyState(page);\n  const response = await page.request.post(\`http://127.0.0.1:4317/files/\${documentId}/agent/commands\`, {\n    data: {\n      dryRun: false,\n      commands: [\n        {\n          type: "set_layout",\n          nodeId: "frame-1",\n          layout: {\n            mode: "auto",\n            direction: "horizontal",\n            align_items: "last_baseline",\n            justify_content: "start",\n            gap: 10,\n            padding: { top: 20, right: 20, bottom: 20, left: 20 }\n          }\n        }\n      ]\n    }\n  });\n  expect(response.ok()).toBeTruthy();\n\n  await page.reload();\n  await openFilePanel(page);\n  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();\n  const alignItems = page.getByTestId("inspector-layout-align-items");\n  await expect(alignItems).toHaveValue("last_baseline");\n  await expect(alignItems.locator("option", { hasText: "마지막 기준선" })).toHaveValue("last_baseline");\n  await alignItems.selectOption("baseline");\n  await expect(alignItems).toHaveValue("baseline");\n  await alignItems.selectOption("last_baseline");\n  await expect(alignItems).toHaveValue("last_baseline");\n});\n`;
  return replaceOnce(
    source,
    `\ntest("file panel exports a Layo archive and reviews it before import", async ({ page }) => {`,
    `${insertion}\ntest("file panel exports a Layo archive and reviews it before import", async ({ page }) => {`,
    "e2e inspector last baseline test"
  );
});

write("docs/superpowers/plans/2026-07-05-penpot-last-baseline-layout.md", `# Penpot Last Baseline Layout\n\n## Goal\n\nClose the Penpot/CSS baseline-alignment gap where Layo supported first-baseline groups but could not model last-baseline groups for auto layout, grid, Inspector controls, MCP/HTTP contracts, and code export.\n\n## Reference\n\n- Penpot flexible layouts: https://help.penpot.app/user-guide/designing/flexible-layouts/\n- CSS Box Alignment Level 3 baseline-position grammar: https://www.w3.org/TR/css-align-3/#baseline-values\n\n## Decision\n\nAdapt the CSS `last baseline` concept into Layo's snake_case document model as `last_baseline`. Export maps it back to CSS `last baseline`. This keeps saved files and MCP/HTTP command payloads deterministic while preserving web handoff semantics.\n\n## Verification Plan\n\n- Web state tests cover horizontal auto-layout and grid row last-baseline placement.\n- Server layout tests cover the same geometry through the storage-side relayout engine.\n- Code-export tests cover `last_baseline` to CSS `last baseline` handoff.\n- Playwright e2e covers the Inspector control exposing and persisting first/last baseline options.\n- Full Verification remains the merge gate.\n\n## Status\n\nImplemented through the Penpot maturity loop after deployment was explicitly deferred.\n`);

updateFile("docs/superpowers/PLAN_STATUS.md", (source) => {
  let content = replaceOnce(source, `Last audited: 2026-07-04`, `Last audited: 2026-07-05`, "plan status audit date");
  content = replaceOnce(
    content,
    `| --- | --- | --- |\n| \`2026-07-04-penpot-flex-fill-wrap-direct-parent-resize.md\``,
    `| --- | --- | --- |\n| \`2026-07-05-penpot-last-baseline-layout.md\` | Completed | Adapts Penpot/CSS last-baseline alignment into Layo's snake_case document model as \`last_baseline\`, with renderer/server/Rust/MCP contracts, web and server relayout solvers, Inspector controls, CSS code-export mapping, unit coverage, and Playwright e2e coverage. Deployment remains intentionally deferred. |\n| \`2026-07-04-penpot-flex-fill-wrap-direct-parent-resize.md\``,
    "plan status completed row"
  );
  return content;
});

updateFile("docs/product/penpot-maturity-benchmark.md", (source) => {
  let content = replaceOnce(source, `Last checked: 2026-07-04`, `Last checked: 2026-07-05`, "benchmark date");
  content = replaceAllRequired(
    content,
    `last-baseline groups, orthogonal writing-mode baseline groups`,
    `orthogonal writing-mode baseline groups`,
    "remove remaining last-baseline gap",
    2
  );
  content = replaceOnce(
    content,
    `per-item auto-layout and grid \`align_self: baseline\` participation with Inspector, MCP/HTTP, persistence, and code-export handoff,`,
    `per-item auto-layout and grid \`align_self: baseline\` participation with Inspector, MCP/HTTP, persistence, and code-export handoff, auto-layout and grid row \`last_baseline\` groups with Inspector, MCP/HTTP, persistence, and CSS \`last baseline\` code-export handoff,`,
    "benchmark layout posture evidence"
  );
  content = replaceOnce(
    content,
    `per-item auto-layout and grid \`align_self: baseline\` participation with Inspector, MCP/HTTP, persistence, and code-export handoff, per-item layout \`z_index\``,
    `per-item auto-layout and grid \`align_self: baseline\` participation with Inspector, MCP/HTTP, persistence, and code-export handoff, auto-layout and grid row \`last_baseline\` groups with Inspector, MCP/HTTP, persistence, and CSS \`last baseline\` code-export handoff, per-item layout \`z_index\``,
    "highest-risk layout evidence"
  );
  return content;
});

for (const path of [
  ".github/workflows/codex-last-baseline-patch.yml",
  ".github/codex/last-baseline-patch.mjs"
]) {
  rmSync(path, { force: true });
}
try {
  rmSync(".github/codex", { recursive: true, force: true });
} catch {}
