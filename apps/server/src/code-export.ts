import type {
  ComponentDefinition,
  DesignFile,
  DesignToken,
  DesignNode,
  NodeConstraints,
  NodeLayout,
  NodeLayoutItem
} from "./storage";

export interface CodeExportOptions {
  moduleBasePath?: string;
}

export interface ElementCodeArtifact {
  id: string;
  name: string;
  className: string;
  html: string;
  css: string;
  jsModule: string;
  structure: CodeStructureNode;
  implementation: ElementImplementationSpec;
}

export interface CodeExportResult {
  css: string;
  html: string;
  elements: ElementCodeArtifact[];
  implementationSpec: CodeImplementationSpec;
  indexModule: string;
}

export interface CodeStructureNode {
  id: string;
  name: string;
  kind: DesignNode["kind"];
  className: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  style: {
    fill: string;
    fillToken?: string;
    stroke: string | null;
    strokeWidth: number;
    opacity: number;
  };
  annotations: CodeHandoffAnnotation[];
  content:
    | { type: "empty" }
    | { type: "text"; value: string; fontSize: number; fontFamily: string }
    | { type: "image"; assetId: string; fitMode: "fill" | "fit" };
  componentRef?: {
    definitionId: string;
    detached: boolean;
    overrides: Array<{ nodeId: string; field: string; value: string }>;
  };
  layoutSpacingTokens?: {
    gap?: string | null;
    rowGap?: string | null;
    columnGap?: string | null;
    paddingTop?: string | null;
    paddingRight?: string | null;
    paddingBottom?: string | null;
    paddingLeft?: string | null;
  };
  layout?: NodeLayout;
  layout_item?: NodeLayoutItem;
  constraints?: NodeConstraints;
  children: CodeStructureNode[];
}

export interface CodeHandoffAnnotation {
  id: string;
  label: string;
  value: string;
  detail?: string;
  kind: "identity" | "geometry" | "style" | "content" | "layout" | "component" | "asset";
  sourceNodeIds: string[];
}

export interface ElementImplementationSpec {
  componentName: string;
  suggestedProps: Array<{
    name: string;
    type: "string";
    sourceNodeId: string;
    defaultValue: string;
  }>;
  slots: Array<{ name: string; sourceNodeIds: string[] }>;
  cssClassNames: string[];
  sourceNodeIds: string[];
}

export interface ComponentImplementationArtifact {
  id: string;
  name: string;
  sourceNodeId: string;
  structure: CodeStructureNode;
  implementation: ElementImplementationSpec;
  variants: Array<{ id: string; name: string; properties: Array<{ name: string; value: string }> }>;
}

export interface TokenCandidateSummary {
  colors: string[];
  fontFamilies: string[];
  fontSizes: number[];
  spacings: number[];
}

export interface TokenExportSummary {
  colors: DesignToken[];
  spacing: DesignToken[];
}

export interface CodeImplementationSpec {
  elements: ElementCodeArtifact[];
  components: ComponentImplementationArtifact[];
  tokens: TokenExportSummary;
  tokenCandidates: TokenCandidateSummary;
}

export function exportDesignToCode(
  document: DesignFile,
  options: CodeExportOptions = {}
): CodeExportResult {
  const roots = document.pages.flatMap((page) => page.children).filter(isNodeExportVisible);
  const colorTokens = documentColorTokens(document);
  const spacingTokens = documentSpacingTokens(document);
  const tokenMap = new Map([...colorTokens, ...spacingTokens].map((token) => [token.id, token]));
  const elements = roots.map((root) => exportElement(root, tokenMap));
  const moduleBasePath = options.moduleBasePath ?? ".";
  const components = (document.components ?? []).map((component) => exportComponent(component, tokenMap));

  return {
    css: [
      ".canvas-export-root {",
      ...colorTokens.map((token) => `  --${cssTokenName(token.id)}: ${token.value};`),
      ...spacingTokens.map((token) => `  --${cssTokenName(token.id)}: ${cssSpacingTokenValue(token)};`),
      "  position: relative;",
      "  width: 100%;",
      "  min-height: 100vh;",
      "  font-family: Arial, sans-serif;",
      "}",
      ...roots.flatMap((root) => nodeCss(root, tokenMap))
    ].join("\n"),
    html: `<div class="canvas-export-root">\n${roots.map((root) => renderNode(root, 1)).join("\n")}\n</div>`,
    elements,
    implementationSpec: {
      elements,
      components,
      tokens: {
        colors: colorTokens,
        spacing: spacingTokens
      },
      tokenCandidates: collectTokenCandidates([
        ...roots,
        ...(document.components ?? []).map((component) => component.source_node)
      ])
    },
    indexModule: buildIndexModule(elements, moduleBasePath)
  };
}

function exportElement(root: DesignNode, tokenMap: Map<string, DesignToken>): ElementCodeArtifact {
  const className = classNameFor(root.id);
  const css = nodeCss(root, tokenMap).join("\n");
  const html = renderNode(root, 0);
  const structure = structureFor(root, tokenMap);
  const implementation = implementationFor(root);

  return {
    id: root.id,
    name: root.name,
    className,
    html,
    css,
    structure,
    implementation,
    jsModule: [
      `export default ${JSON.stringify(
        {
          id: root.id,
          name: root.name,
          className,
          html,
          css,
          structure,
          implementation
        },
        null,
        2
      )};`,
      ""
    ].join("\n")
  };
}

function exportComponent(
  component: ComponentDefinition,
  tokenMap: Map<string, DesignToken>
): ComponentImplementationArtifact {
  return {
    id: component.id,
    name: component.name,
    sourceNodeId: component.source_node.id,
    structure: structureFor(component.source_node, tokenMap),
    implementation: implementationFor(component.source_node, component.name),
    variants: component.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      properties: variant.properties.map((property) => ({
        name: property.name,
        value: property.value
      }))
    }))
  };
}

function structureFor(node: DesignNode, tokenMap: Map<string, DesignToken>): CodeStructureNode {
  const base: CodeStructureNode = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    className: classNameFor(node.id),
    bounds: {
      x: node.transform.x,
      y: node.transform.y,
      width: node.size.width,
      height: node.size.height,
      rotation: node.transform.rotation
    },
    style: {
      fill: resolvedFill(node, tokenMap),
      ...(node.style.fill_token ? { fillToken: node.style.fill_token } : {}),
      stroke: node.style.stroke,
      strokeWidth: node.style.stroke_width,
      opacity: node.style.opacity
    },
    annotations: handoffAnnotationsFor(node, tokenMap),
    content: contentFor(node),
    children: node.children.filter(isNodeExportVisible).map((child) => structureFor(child, tokenMap))
  };

  if (node.component_instance) {
    base.componentRef = {
      definitionId: node.component_instance.definition_id,
      detached: node.component_instance.detached,
      overrides: node.component_instance.overrides.map((override) => ({
        nodeId: override.node_id,
        field: override.field,
        value: override.value
      }))
    };
  }
  if (node.layout) {
    base.layout = node.layout;
    if (node.layout.spacing_tokens) {
      base.layoutSpacingTokens = {
        gap: node.layout.spacing_tokens.gap,
        rowGap: node.layout.spacing_tokens.row_gap,
        columnGap: node.layout.spacing_tokens.column_gap,
        paddingTop: node.layout.spacing_tokens.padding_top,
        paddingRight: node.layout.spacing_tokens.padding_right,
        paddingBottom: node.layout.spacing_tokens.padding_bottom,
        paddingLeft: node.layout.spacing_tokens.padding_left
      };
    }
  }
  if (node.layout_item) {
    base.layout_item = node.layout_item;
  }
  if (node.constraints) {
    base.constraints = node.constraints;
  }

  return base;
}

function handoffAnnotationsFor(node: DesignNode, tokenMap: Map<string, DesignToken>): CodeHandoffAnnotation[] {
  const annotations: CodeHandoffAnnotation[] = [
    {
      id: `${node.id}-identity`,
      label: "레이어",
      value: `${node.name} · ${node.kind}`,
      kind: "identity",
      sourceNodeIds: [node.id]
    },
    {
      id: `${node.id}-geometry`,
      label: "크기/위치",
      value: `${formatNumber(node.size.width)} x ${formatNumber(node.size.height)} · X ${formatNumber(
        node.transform.x
      )}, Y ${formatNumber(node.transform.y)}`,
      detail:
        node.transform.rotation === 0
          ? undefined
          : `rotation ${formatNumber(node.transform.rotation)}deg`,
      kind: "geometry",
      sourceNodeIds: [node.id]
    },
    styleAnnotationFor(node, tokenMap)
  ];

  const contentAnnotation = contentAnnotationFor(node);
  if (contentAnnotation) {
    annotations.push(contentAnnotation);
  }

  const layoutAnnotation = layoutAnnotationFor(node);
  if (layoutAnnotation) {
    annotations.push(layoutAnnotation);
  }

  const componentAnnotation = componentAnnotationFor(node);
  if (componentAnnotation) {
    annotations.push(componentAnnotation);
  }

  const assetAnnotation = assetAnnotationFor(node);
  if (assetAnnotation) {
    annotations.push(assetAnnotation);
  }

  return annotations;
}

function styleAnnotationFor(node: DesignNode, tokenMap: Map<string, DesignToken>): CodeHandoffAnnotation {
  const token = node.style.fill_token ? tokenMap.get(node.style.fill_token) : undefined;
  const fill = resolvedFill(node, tokenMap);

  return {
    id: `${node.id}-style`,
    label: "스타일",
    value: `Fill ${fill} · opacity ${formatNumber(node.style.opacity)}`,
    detail:
      token && token.type === "color"
        ? `fill token ${token.id} maps to var(--${cssTokenName(token.id)})`
        : node.style.stroke
          ? `stroke ${node.style.stroke} ${formatPx(node.style.stroke_width)}`
          : undefined,
    kind: "style",
    sourceNodeIds: [node.id]
  };
}

function contentAnnotationFor(node: DesignNode): CodeHandoffAnnotation | null {
  if (node.content.type === "text") {
    return {
      id: `${node.id}-content`,
      label: "콘텐츠",
      value: `"${node.content.value}" · ${formatPx(node.content.font_size)} ${node.content.font_family}`,
      kind: "content",
      sourceNodeIds: [node.id]
    };
  }

  if (node.content.type === "image") {
    return {
      id: `${node.id}-content`,
      label: "콘텐츠",
      value: `Image asset ${node.content.asset_id} · ${node.content.fit_mode ?? "fill"}`,
      kind: "content",
      sourceNodeIds: [node.id]
    };
  }

  return null;
}

function layoutAnnotationFor(node: DesignNode): CodeHandoffAnnotation | null {
  if (!node.layout && !node.layout_item && !node.constraints) {
    return null;
  }

  const parts: string[] = [];
  if (node.layout) {
    parts.push(node.layout.mode);
    parts.push(node.layout.direction);
    parts.push(`gap ${formatNumber(node.layout.gap)}`);
    parts.push(
      `padding ${formatNumber(node.layout.padding.top)}/${formatNumber(node.layout.padding.right)}/${formatNumber(
        node.layout.padding.bottom
      )}/${formatNumber(node.layout.padding.left)}`
    );
  }
  if (node.layout_item) {
    parts.push(`item ${node.layout_item.position ?? "normal"}`);
  }
  if (node.constraints) {
    parts.push(`constraints ${node.constraints.horizontal}/${node.constraints.vertical}`);
  }

  return {
    id: `${node.id}-layout`,
    label: "레이아웃",
    value: parts.join(" · "),
    detail: layoutSpacingTokenDetail(node.layout),
    kind: "layout",
    sourceNodeIds: [node.id]
  };
}

function layoutSpacingTokenDetail(layout: NodeLayout | null | undefined): string | undefined {
  if (!layout?.spacing_tokens) {
    return undefined;
  }

  const gapToken = layout.spacing_tokens.gap;
  const paddingTokens = [
    layout.spacing_tokens.padding_top,
    layout.spacing_tokens.padding_right,
    layout.spacing_tokens.padding_bottom,
    layout.spacing_tokens.padding_left
  ].filter(Boolean);
  if (gapToken && paddingTokens.length > 0 && paddingTokens.every((token) => token === gapToken)) {
    return `spacing token ${gapToken} is used for gap and padding`;
  }

  const tokenIds = [
    layout.spacing_tokens.gap,
    layout.spacing_tokens.row_gap,
    layout.spacing_tokens.column_gap,
    ...paddingTokens
  ].filter((tokenId, index, values): tokenId is string => Boolean(tokenId) && values.indexOf(tokenId) === index);

  return tokenIds.length > 0 ? `spacing tokens ${tokenIds.join(", ")}` : undefined;
}

function componentAnnotationFor(node: DesignNode): CodeHandoffAnnotation | null {
  if (!node.component_instance) {
    return null;
  }

  return {
    id: `${node.id}-component`,
    label: "컴포넌트",
    value: `${node.component_instance.definition_id} · ${node.component_instance.detached ? "detached" : "instance"}`,
    detail:
      node.component_instance.overrides.length > 0
        ? `${node.component_instance.overrides.length} override(s) mapped for implementation`
        : undefined,
    kind: "component",
    sourceNodeIds: [node.id]
  };
}

function assetAnnotationFor(node: DesignNode): CodeHandoffAnnotation | null {
  if (node.content.type !== "image") {
    return null;
  }

  return {
    id: `${node.id}-asset`,
    label: "에셋",
    value: `${node.content.asset_id} · ${formatNumber(node.size.width)} x ${formatNumber(node.size.height)}`,
    detail: `fit mode ${node.content.fit_mode ?? "fill"}`,
    kind: "asset",
    sourceNodeIds: [node.id]
  };
}

function isNodeExportVisible(node: DesignNode): boolean {
  return node.visible !== false;
}

function contentFor(node: DesignNode): CodeStructureNode["content"] {
  if (node.content.type === "text") {
    return {
      type: "text",
      value: node.content.value,
      fontSize: node.content.font_size,
      fontFamily: node.content.font_family
    };
  }

  if (node.content.type === "image") {
    return {
      type: "image",
      assetId: node.content.asset_id,
      fitMode: node.content.fit_mode ?? "fill"
    };
  }

  return { type: "empty" };
}

function implementationFor(root: DesignNode, explicitName?: string): ElementImplementationSpec {
  return {
    componentName: componentNameFor(root, explicitName),
    suggestedProps: textPropsFor(root),
    slots: [],
    cssClassNames: collectNodeIds(root).map((nodeId) => classNameFor(nodeId)),
    sourceNodeIds: collectNodeIds(root)
  };
}

function textPropsFor(root: DesignNode): ElementImplementationSpec["suggestedProps"] {
  const props: ElementImplementationSpec["suggestedProps"] = [];
  const usedNames = new Map<string, number>();

  for (const node of collectNodes(root)) {
    if (node.content.type !== "text") {
      continue;
    }

    const baseName = propNameFor(node.name || node.id);
    const count = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, count + 1);
    props.push({
      name: count === 0 ? baseName : `${baseName}${count + 1}`,
      type: "string",
      sourceNodeId: node.id,
      defaultValue: node.content.value
    });
  }

  return props;
}

function collectTokenCandidates(nodes: DesignNode[]): TokenCandidateSummary {
  const colors: string[] = [];
  const fontFamilies: string[] = [];
  const fontSizes: number[] = [];
  const spacings: number[] = [];

  for (const node of nodes.flatMap((root) => collectNodes(root))) {
    pushUnique(colors, node.style.fill);
    if (node.style.stroke) {
      pushUnique(colors, node.style.stroke);
    }
    pushUnique(spacings, node.transform.x);
    pushUnique(spacings, node.transform.y);
    pushUnique(spacings, node.size.width);
    pushUnique(spacings, node.size.height);

    if (node.content.type === "text") {
      pushUnique(fontFamilies, node.content.font_family);
      pushUnique(fontSizes, node.content.font_size);
    }
  }

  return { colors, fontFamilies, fontSizes, spacings };
}

function collectNodes(root: DesignNode): DesignNode[] {
  return [root, ...root.children.filter(isNodeExportVisible).flatMap((child) => collectNodes(child))];
}

function collectNodeIds(root: DesignNode): string[] {
  return collectNodes(root).map((node) => node.id);
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function renderNode(node: DesignNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const className = classNameFor(node.id);

  if (node.kind === "text" && node.content.type === "text") {
    return `${indent}<div class="${className}" data-node-id="${escapeAttribute(node.id)}">${escapeHtml(
      node.content.value
    )}</div>`;
  }

  const children = node.children.filter(isNodeExportVisible).map((child) => renderNode(child, depth + 1)).join("\n");
  if (!children) {
    return `${indent}<div class="${className}" data-node-id="${escapeAttribute(node.id)}"></div>`;
  }

  return `${indent}<div class="${className}" data-node-id="${escapeAttribute(node.id)}">\n${children}\n${indent}</div>`;
}

function nodeCss(node: DesignNode, tokenMap: Map<string, DesignToken>): string[] {
  const className = classNameFor(node.id);
  const lines = [
    `.${className} {`,
    "  position: absolute;",
    `  left: ${formatPx(node.transform.x)};`,
    `  top: ${formatPx(node.transform.y)};`,
    `  width: ${formatPx(node.size.width)};`,
    `  height: ${formatPx(node.size.height)};`,
    `  opacity: ${formatNumber(node.style.opacity)};`
  ];

  if (node.transform.rotation !== 0) {
    lines.push(`  transform: rotate(${formatNumber(node.transform.rotation)}deg);`);
  }

  if (node.kind === "text" && node.content.type === "text") {
    lines.push(`  color: ${cssFillValue(node, tokenMap)};`);
    lines.push(`  font-family: ${fontFamily(node.content.font_family)};`);
    lines.push(`  font-size: ${formatPx(node.content.font_size)};`);
    lines.push("  line-height: 1.25;");
    lines.push("  white-space: pre-wrap;");
  } else {
    lines.push(`  background-color: ${cssFillValue(node, tokenMap)};`);
    if (node.style.stroke) {
      lines.push(`  border: ${formatPx(node.style.stroke_width)} solid ${node.style.stroke};`);
    }
  }

  if (node.layout && (node.layout.mode === "auto" || node.layout.mode === "grid")) {
    lines.push(`  gap: ${cssLayoutSpacingValue(node.layout, "gap", node.layout.gap, tokenMap)};`);
    const padding = node.layout.padding;
    const paddingValues = [
      cssLayoutSpacingValue(node.layout, "padding_top", padding.top, tokenMap),
      cssLayoutSpacingValue(node.layout, "padding_right", padding.right, tokenMap),
      cssLayoutSpacingValue(node.layout, "padding_bottom", padding.bottom, tokenMap),
      cssLayoutSpacingValue(node.layout, "padding_left", padding.left, tokenMap)
    ];
    if (new Set(paddingValues).size === 1) {
      lines.push(`  padding: ${paddingValues[0]};`);
    } else {
      lines.push(`  padding: ${paddingValues.join(" ")};`);
    }
  }

  lines.push("}");

  return [...lines, ...node.children.filter(isNodeExportVisible).flatMap((child) => nodeCss(child, tokenMap))];
}

function documentColorTokens(document: DesignFile): DesignToken[] {
  return (document.tokens ?? []).filter((token) => token.type === "color");
}

function documentSpacingTokens(document: DesignFile): DesignToken[] {
  return (document.tokens ?? []).filter((token) => token.type === "spacing");
}

function resolvedFill(node: DesignNode, tokenMap: Map<string, DesignToken>): string {
  const token = node.style.fill_token ? tokenMap.get(node.style.fill_token) : undefined;
  return token?.type === "color" ? token.value : node.style.fill;
}

function cssFillValue(node: DesignNode, tokenMap: Map<string, DesignToken>): string {
  const token = node.style.fill_token ? tokenMap.get(node.style.fill_token) : undefined;
  if (!token || token.type !== "color") {
    return node.style.fill;
  }
  return `var(--${cssTokenName(token.id)}, ${token.value})`;
}

function cssLayoutSpacingValue(
  layout: NodeLayout,
  key: keyof NonNullable<NodeLayout["spacing_tokens"]>,
  fallback: number,
  tokenMap: Map<string, DesignToken>
): string {
  const tokenId = layout.spacing_tokens?.[key];
  const token = tokenId ? tokenMap.get(tokenId) : undefined;
  if (!token || token.type !== "spacing") {
    return formatPx(fallback);
  }
  return `var(--${cssTokenName(token.id)}, ${cssSpacingTokenValue(token)})`;
}

function cssSpacingTokenValue(token: DesignToken): string {
  const numeric = Number(token.value);
  if (Number.isFinite(numeric) && token.value.trim() !== "") {
    return formatPx(numeric);
  }
  return token.value;
}

function cssTokenName(tokenId: string): string {
  return `layo-token-${tokenId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildIndexModule(elements: ElementCodeArtifact[], moduleBasePath: string): string {
  const imports = elements
    .map((element, index) => `import element${index} from "${moduleBasePath}/${element.id}.mjs";`)
    .join("\n");
  const names = elements.map((_element, index) => `element${index}`).join(", ");

  return `${imports}\n\nexport const elements = [${names}];\nexport default elements;\n`;
}

function classNameFor(nodeId: string): string {
  return `node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function componentNameFor(root: DesignNode, explicitName?: string): string {
  const sources = [
    explicitName,
    root.id.startsWith("tds-") ? root.id : root.name,
    root.id,
    "canvas-element"
  ];
  for (const source of sources) {
    const name = source ? pascalCase(source) : "";
    if (name) {
      return name;
    }
  }

  return "CanvasElement";
}

function propNameFor(value: string): string {
  const name = camelCase(value);
  return name || "text";
}

function pascalCase(value: string): string {
  return wordsFor(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function camelCase(value: string): string {
  const [first, ...rest] = wordsFor(value);
  if (!first) {
    return "";
  }

  return [
    first,
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  ].join("");
}

function wordsFor(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function formatPx(value: number): string {
  return `${formatNumber(value)}px`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function fontFamily(value: string): string {
  return `${value}, Arial, sans-serif`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
