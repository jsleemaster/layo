import type {
  CodeComponentMapping,
  ComponentDefinition,
  DesignFile,
  DesignStyle,
  DesignToken,
  DesignTokenSet,
  DesignNode,
  NodeConstraints,
  NodeLayout,
  NodeLayoutItem,
  TextWritingMode
} from "./storage";
import { createActiveDesignTokenReferenceMap, resolveActiveDesignTokens } from "./design-token-io.js";

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
    fillStyle?: string;
    stroke: string | null;
    strokeWidth: number;
    opacity: number;
  };
  annotations: CodeHandoffAnnotation[];
  content:
    | { type: "empty" }
    | {
        type: "text";
        value: string;
        fontSize: number;
        fontFamily: string;
        writingMode?: TextWritingMode;
        typographyToken?: string;
        typographyStyle?: string;
      }
    | { type: "image"; assetId: string; fitMode: "fill" | "fit" };
  componentRef?: {
    definitionId: string;
    variantId?: string;
    detached: boolean;
    overrides: Array<{ nodeId: string; field: string; value: string }>;
  };
  repoMapping?: CodeComponentMappingArtifact;
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
  repoMapping?: CodeComponentMappingArtifact;
}

export interface ComponentImplementationArtifact {
  id: string;
  name: string;
  sourceNodeId: string;
  structure: CodeStructureNode;
  implementation: ElementImplementationSpec;
  repoMapping?: CodeComponentMappingArtifact;
  variants: Array<{ id: string; name: string; properties: Array<{ name: string; value: string }> }>;
}

export interface CodeComponentMappingArtifact {
  id: string;
  componentId: string;
  packageName?: string;
  importPath: string;
  exportName: string;
  importMode: "named" | "default";
  importStatement: string;
  usage: string;
  props: Array<{
    name: string;
    type: "string";
    sourceNodeId: string;
    sourceField: "text";
    defaultValue: string;
  }>;
  variantProps: Array<{
    name: string;
    type: "string";
    variantProperty: string;
    defaultValue: string;
  }>;
  docsUrl?: string;
}

export interface TokenCandidateSummary {
  colors: string[];
  fontFamilies: string[];
  fontSizes: number[];
  spacings: number[];
}

export interface TokenExportSummary {
  tokenSets?: DesignTokenSet[];
  colors: DesignToken[];
  spacing: DesignToken[];
  typography: DesignToken[];
}

export interface CodeImplementationSpec {
  elements: ElementCodeArtifact[];
  components: ComponentImplementationArtifact[];
  styles: DesignStyle[];
  tokens: TokenExportSummary;
  tokenCandidates: TokenCandidateSummary;
}

export function exportDesignToCode(
  document: DesignFile,
  options: CodeExportOptions = {}
): CodeExportResult {
  const roots = document.pages.flatMap((page) => page.children).filter(isNodeExportVisible);
  const activeTokens = resolveActiveDesignTokens(document.tokens ?? [], document.token_sets ?? []);
  const colorTokens = documentColorTokens(activeTokens);
  const spacingTokens = documentSpacingTokens(activeTokens);
  const typographyTokens = documentTypographyTokens(activeTokens);
  const tokenMap = createActiveDesignTokenReferenceMap(document.tokens ?? [], document.token_sets ?? []);
  const componentById = new Map((document.components ?? []).map((component) => [component.id, component]));
  const mappingByComponentId = new Map(
    (document.code_mappings ?? []).map((mapping) => [mapping.component_id, mapping])
  );
  const componentIdBySourceNodeId = new Map(
    (document.components ?? []).map((component) => [component.source_node.id, component.id])
  );
  const elements = roots.map((root) =>
    exportElement(root, tokenMap, mappingByComponentId, componentById, componentIdBySourceNodeId)
  );
  const moduleBasePath = options.moduleBasePath ?? ".";
  const components = (document.components ?? []).map((component) =>
    exportComponent(component, tokenMap, mappingByComponentId, componentById, componentIdBySourceNodeId)
  );

  return {
    css: [
      ".canvas-export-root {",
      ...colorTokens.map((token) => `  --${cssTokenName(token.id)}: ${token.value};`),
      ...spacingTokens.map((token) => `  --${cssTokenName(token.id)}: ${cssSpacingTokenValue(token)};`),
      ...typographyTokens.flatMap(cssTypographyTokenVariables),
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
      styles: document.styles ?? [],
      tokens: {
        ...(document.token_sets?.length ? { tokenSets: document.token_sets } : {}),
        colors: colorTokens,
        spacing: spacingTokens,
        typography: typographyTokens
      },
      tokenCandidates: collectTokenCandidates([
        ...roots,
        ...(document.components ?? []).map((component) => component.source_node)
      ])
    },
    indexModule: buildIndexModule(elements, moduleBasePath)
  };
}

function exportElement(
  root: DesignNode,
  tokenMap: Map<string, DesignToken>,
  mappingByComponentId: Map<string, CodeComponentMapping>,
  componentById: Map<string, ComponentDefinition>,
  componentIdBySourceNodeId: Map<string, string>
): ElementCodeArtifact {
  const className = classNameFor(root.id);
  const css = nodeCss(root, tokenMap).join("\n");
  const html = renderNode(root, 0);
  const structure = structureFor(root, tokenMap, mappingByComponentId, componentById, componentIdBySourceNodeId);
  const implementation = implementationFor(root, undefined, structure.repoMapping);

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
  tokenMap: Map<string, DesignToken>,
  mappingByComponentId: Map<string, CodeComponentMapping>,
  componentById: Map<string, ComponentDefinition>,
  componentIdBySourceNodeId: Map<string, string>
): ComponentImplementationArtifact {
  const mapping = mappingByComponentId.get(component.id);
  const repoMapping = mapping ? mappingArtifactFor(mapping, component) : undefined;
  return {
    id: component.id,
    name: component.name,
    sourceNodeId: component.source_node.id,
    structure: structureFor(component.source_node, tokenMap, mappingByComponentId, componentById, componentIdBySourceNodeId),
    implementation: implementationFor(component.source_node, component.name, repoMapping),
    ...(repoMapping ? { repoMapping } : {}),
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

function repoMappingForNode(
  node: DesignNode,
  mappingByComponentId: Map<string, CodeComponentMapping>,
  componentById: Map<string, ComponentDefinition>,
  componentIdBySourceNodeId: Map<string, string>
): CodeComponentMappingArtifact | undefined {
  const componentId = node.component_instance?.definition_id ?? componentIdBySourceNodeId.get(node.id);
  const mapping = componentId ? mappingByComponentId.get(componentId) : undefined;
  if (!mapping || !componentId) {
    return undefined;
  }
  return mappingArtifactFor(mapping, componentById.get(componentId), node.component_instance?.variant_id ?? undefined);
}

function mappingArtifactFor(
  mapping: CodeComponentMapping,
  component?: ComponentDefinition,
  variantId?: string | null
): CodeComponentMappingArtifact {
  const props = mapping.props.map((prop) => ({
    name: prop.name,
    type: prop.type,
    sourceNodeId: prop.source_node_id,
    sourceField: prop.source_field,
    defaultValue: prop.default_value
  }));
  const variant =
    component?.variants.find((candidate) => candidate.id === variantId) ?? component?.variants[0] ?? null;
  const variantValueByProperty = new Map((variant?.properties ?? []).map((property) => [property.name, property.value]));
  const variantProps = (mapping.variant_props ?? []).map((prop) => ({
    name: prop.name,
    type: prop.type,
    variantProperty: prop.variant_property,
    defaultValue: variantValueByProperty.get(prop.variant_property) ?? prop.default_value
  }));
  const artifact: CodeComponentMappingArtifact = {
    id: mapping.id,
    componentId: mapping.component_id,
    ...(mapping.package_name ? { packageName: mapping.package_name } : {}),
    importPath: mapping.import_path,
    exportName: mapping.export_name,
    importMode: mapping.import_mode,
    importStatement: importStatementForMapping(mapping),
    usage: usageForMapping(mapping.export_name, props, variantProps),
    props,
    variantProps,
    ...(mapping.docs_url ? { docsUrl: mapping.docs_url } : {})
  };
  return artifact;
}

function importStatementForMapping(mapping: CodeComponentMapping) {
  if (mapping.import_mode === "default") {
    return `import ${mapping.export_name} from "${mapping.import_path}";`;
  }
  return `import { ${mapping.export_name} } from "${mapping.import_path}";`;
}

function usageForMapping(
  exportName: string,
  props: CodeComponentMappingArtifact["props"],
  variantProps: CodeComponentMappingArtifact["variantProps"]
) {
  const propParts = [
    ...props.map((prop) => `${prop.name}={${prop.name}}`),
    ...variantProps.map((prop) => `${prop.name}=${JSON.stringify(prop.defaultValue)}`)
  ];
  if (propParts.length === 0) {
    return `<${exportName} />`;
  }
  return `<${exportName} ${propParts.join(" ")} />`;
}

function structureFor(
  node: DesignNode,
  tokenMap: Map<string, DesignToken>,
  mappingByComponentId: Map<string, CodeComponentMapping>,
  componentById: Map<string, ComponentDefinition>,
  componentIdBySourceNodeId: Map<string, string>
): CodeStructureNode {
  const repoMapping = repoMappingForNode(node, mappingByComponentId, componentById, componentIdBySourceNodeId);
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
      ...(node.style.fill_style ? { fillStyle: node.style.fill_style } : {}),
      stroke: node.style.stroke,
      strokeWidth: node.style.stroke_width,
      opacity: node.style.opacity
    },
    annotations: handoffAnnotationsFor(node, tokenMap),
    content: contentFor(node),
    children: node.children
      .filter(isNodeExportVisible)
      .map((child) => structureFor(child, tokenMap, mappingByComponentId, componentById, componentIdBySourceNodeId))
  };

  if (repoMapping) {
    base.repoMapping = repoMapping;
  }

  if (node.component_instance) {
    base.componentRef = {
      definitionId: node.component_instance.definition_id,
      ...(node.component_instance.variant_id ? { variantId: node.component_instance.variant_id } : {}),
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
  const fillStyle = node.style.fill_style;

  return {
    id: `${node.id}-style`,
    label: "스타일",
    value: `Fill ${fill} · opacity ${formatNumber(node.style.opacity)}`,
    detail:
      token && token.type === "color"
        ? `fill token ${token.id} maps to var(--${cssTokenName(token.id)})`
        : fillStyle
          ? `fill style ${fillStyle} materialized to ${fill}`
        : node.style.stroke
          ? `stroke ${node.style.stroke} ${formatPx(node.style.stroke_width)}`
          : undefined,
    kind: "style",
    sourceNodeIds: [node.id]
  };
}

function contentAnnotationFor(node: DesignNode): CodeHandoffAnnotation | null {
  if (node.content.type === "text") {
    const writingMode = node.content.writing_mode ?? "horizontal_tb";
    const typographyStyle = node.content.typography_style;
    return {
      id: `${node.id}-content`,
      label: "콘텐츠",
      value: `"${node.content.value}" · ${formatPx(node.content.font_size)} ${node.content.font_family}`,
      detail:
        typographyStyle
          ? `typography style ${typographyStyle}`
          : writingMode !== "horizontal_tb"
            ? `writing mode ${writingMode}`
            : undefined,
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
    const content: CodeStructureNode["content"] = {
      type: "text",
      value: node.content.value,
      fontSize: node.content.font_size,
      fontFamily: node.content.font_family
    };
    if (node.content.writing_mode && node.content.writing_mode !== "horizontal_tb") {
      content.writingMode = node.content.writing_mode;
    }
    if (node.content.typography_token) {
      content.typographyToken = node.content.typography_token;
    }
    if (node.content.typography_style) {
      content.typographyStyle = node.content.typography_style;
    }
    return content;
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

function implementationFor(
  root: DesignNode,
  explicitName?: string,
  repoMapping?: CodeComponentMappingArtifact
): ElementImplementationSpec {
  return {
    componentName: componentNameFor(root, explicitName),
    suggestedProps: textPropsFor(root),
    slots: [],
    cssClassNames: collectNodeIds(root).map((nodeId) => classNameFor(nodeId)),
    sourceNodeIds: collectNodeIds(root),
    ...(repoMapping ? { repoMapping } : {})
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
    lines.push(`  font-family: ${cssTextFontFamilyValue(node, tokenMap)};`);
    lines.push(`  font-size: ${cssTextFontSizeValue(node, tokenMap)};`);
    if (node.content.writing_mode && node.content.writing_mode !== "horizontal_tb") {
      lines.push(`  writing-mode: ${cssTextWritingMode(node.content.writing_mode)};`);
    }
    lines.push(`  line-height: ${cssTextLineHeightValue(node, tokenMap)};`);
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

function documentColorTokens(tokens: DesignToken[]): DesignToken[] {
  return tokens.filter((token) => token.type === "color");
}

function documentSpacingTokens(tokens: DesignToken[]): DesignToken[] {
  return tokens.filter((token) => token.type === "spacing");
}

function documentTypographyTokens(tokens: DesignToken[]): DesignToken[] {
  return tokens.filter((token) => token.type === "typography");
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

interface TypographyTokenValue {
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
}

function parseTypographyTokenValue(token: DesignToken): TypographyTokenValue | null {
  try {
    const parsed = JSON.parse(token.value) as Partial<TypographyTokenValue>;
    const fontFamily = typeof parsed.fontFamily === "string" ? parsed.fontFamily.trim() : "";
    const fontSize = Number(parsed.fontSize);
    const lineHeight = parsed.lineHeight === undefined ? undefined : Number(parsed.lineHeight);
    if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
      return null;
    }
    if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
      return null;
    }
    return {
      fontFamily,
      fontSize,
      ...(lineHeight !== undefined ? { lineHeight } : {})
    };
  } catch {
    return null;
  }
}

function typographyTokenFor(node: DesignNode, tokenMap: Map<string, DesignToken>): DesignToken | undefined {
  const tokenId = node.content.type === "text" ? node.content.typography_token : undefined;
  const token = tokenId ? tokenMap.get(tokenId) : undefined;
  return token?.type === "typography" ? token : undefined;
}

function cssTypographyTokenVariables(token: DesignToken): string[] {
  const value = parseTypographyTokenValue(token);
  if (!value) {
    return [];
  }
  const tokenName = cssTokenName(token.id);
  return [
    `  --${tokenName}-font-family: ${fontFamily(value.fontFamily)};`,
    `  --${tokenName}-font-size: ${formatPx(value.fontSize)};`,
    ...(value.lineHeight !== undefined ? [`  --${tokenName}-line-height: ${formatPx(value.lineHeight)};`] : [])
  ];
}

function cssTextFontFamilyValue(node: DesignNode, tokenMap: Map<string, DesignToken>): string {
  const token = typographyTokenFor(node, tokenMap);
  const value = token ? parseTypographyTokenValue(token) : null;
  if (!token || !value) {
    return fontFamily(node.content.type === "text" ? node.content.font_family : "Arial");
  }
  return `var(--${cssTokenName(token.id)}-font-family, ${fontFamily(value.fontFamily)})`;
}

function cssTextFontSizeValue(node: DesignNode, tokenMap: Map<string, DesignToken>): string {
  const token = typographyTokenFor(node, tokenMap);
  const value = token ? parseTypographyTokenValue(token) : null;
  if (!token || !value) {
    return formatPx(node.content.type === "text" ? node.content.font_size : 16);
  }
  return `var(--${cssTokenName(token.id)}-font-size, ${formatPx(value.fontSize)})`;
}

function cssTextLineHeightValue(node: DesignNode, tokenMap: Map<string, DesignToken>): string {
  const token = typographyTokenFor(node, tokenMap);
  const value = token ? parseTypographyTokenValue(token) : null;
  if (!token || !value?.lineHeight) {
    return "1.25";
  }
  return `var(--${cssTokenName(token.id)}-line-height, ${formatPx(value.lineHeight)})`;
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

function cssTextWritingMode(value: TextWritingMode): string {
  switch (value) {
    case "vertical_rl":
      return "vertical-rl";
    case "vertical_lr":
      return "vertical-lr";
    case "horizontal_tb":
    default:
      return "horizontal-tb";
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
