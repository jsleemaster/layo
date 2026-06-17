import type {
  ComponentDefinition,
  DesignFile,
  DesignNode,
  NodeConstraints,
  NodeLayout
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
    stroke: string | null;
    strokeWidth: number;
    opacity: number;
  };
  content:
    | { type: "empty" }
    | { type: "text"; value: string; fontSize: number; fontFamily: string }
    | { type: "image"; assetId: string };
  componentRef?: {
    definitionId: string;
    detached: boolean;
    overrides: Array<{ nodeId: string; field: string; value: string }>;
  };
  layout?: NodeLayout;
  constraints?: NodeConstraints;
  children: CodeStructureNode[];
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

export interface CodeImplementationSpec {
  elements: ElementCodeArtifact[];
  components: ComponentImplementationArtifact[];
  tokenCandidates: TokenCandidateSummary;
}

export function exportDesignToCode(
  document: DesignFile,
  options: CodeExportOptions = {}
): CodeExportResult {
  const roots = document.pages.flatMap((page) => page.children);
  const elements = roots.map((root) => exportElement(root));
  const moduleBasePath = options.moduleBasePath ?? ".";
  const components = (document.components ?? []).map((component) => exportComponent(component));

  return {
    css: [
      ".canvas-export-root {",
      "  position: relative;",
      "  width: 100%;",
      "  min-height: 100vh;",
      "  font-family: Arial, sans-serif;",
      "}",
      ...roots.flatMap((root) => nodeCss(root))
    ].join("\n"),
    html: `<div class="canvas-export-root">\n${roots.map((root) => renderNode(root, 1)).join("\n")}\n</div>`,
    elements,
    implementationSpec: {
      elements,
      components,
      tokenCandidates: collectTokenCandidates([
        ...roots,
        ...(document.components ?? []).map((component) => component.source_node)
      ])
    },
    indexModule: buildIndexModule(elements, moduleBasePath)
  };
}

function exportElement(root: DesignNode): ElementCodeArtifact {
  const className = classNameFor(root.id);
  const css = nodeCss(root).join("\n");
  const html = renderNode(root, 0);
  const structure = structureFor(root);
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

function exportComponent(component: ComponentDefinition): ComponentImplementationArtifact {
  return {
    id: component.id,
    name: component.name,
    sourceNodeId: component.source_node.id,
    structure: structureFor(component.source_node),
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

function structureFor(node: DesignNode): CodeStructureNode {
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
      fill: node.style.fill,
      stroke: node.style.stroke,
      strokeWidth: node.style.stroke_width,
      opacity: node.style.opacity
    },
    content: contentFor(node),
    children: node.children.map((child) => structureFor(child))
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
  }
  if (node.constraints) {
    base.constraints = node.constraints;
  }

  return base;
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
      assetId: node.content.asset_id
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
  return [root, ...root.children.flatMap((child) => collectNodes(child))];
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

  const children = node.children.map((child) => renderNode(child, depth + 1)).join("\n");
  if (!children) {
    return `${indent}<div class="${className}" data-node-id="${escapeAttribute(node.id)}"></div>`;
  }

  return `${indent}<div class="${className}" data-node-id="${escapeAttribute(node.id)}">\n${children}\n${indent}</div>`;
}

function nodeCss(node: DesignNode): string[] {
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
    lines.push(`  color: ${node.style.fill};`);
    lines.push(`  font-family: ${fontFamily(node.content.font_family)};`);
    lines.push(`  font-size: ${formatPx(node.content.font_size)};`);
    lines.push("  line-height: 1.25;");
    lines.push("  white-space: pre-wrap;");
  } else {
    lines.push(`  background-color: ${node.style.fill};`);
    if (node.style.stroke) {
      lines.push(`  border: ${formatPx(node.style.stroke_width)} solid ${node.style.stroke};`);
    }
  }

  lines.push("}");

  return [...lines, ...node.children.flatMap((child) => nodeCss(child))];
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
