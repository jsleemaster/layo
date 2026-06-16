import type { DesignFile, DesignNode } from "./storage";

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
}

export interface CodeExportResult {
  css: string;
  html: string;
  elements: ElementCodeArtifact[];
  indexModule: string;
}

export function exportDesignToCode(
  document: DesignFile,
  options: CodeExportOptions = {}
): CodeExportResult {
  const roots = document.pages.flatMap((page) => page.children);
  const elements = roots.map((root) => exportElement(root));
  const moduleBasePath = options.moduleBasePath ?? ".";

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
    indexModule: buildIndexModule(elements, moduleBasePath)
  };
}

function exportElement(root: DesignNode): ElementCodeArtifact {
  const className = classNameFor(root.id);
  const css = nodeCss(root).join("\n");
  const html = renderNode(root, 0);

  return {
    id: root.id,
    name: root.name,
    className,
    html,
    css,
    jsModule: [
      `export default ${JSON.stringify(
        {
          id: root.id,
          name: root.name,
          className,
          html,
          css
        },
        null,
        2
      )};`,
      ""
    ].join("\n")
  };
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
