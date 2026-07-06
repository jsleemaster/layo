import type { NodePaintGradient, NodePaintSource, NodePaintStop, RendererNode } from "@layo/renderer";
import {
  imageAssetIdsForNode,
  pdfForNode as basePdfForNode,
  svgForNode as baseSvgForNode,
  type NodeArtifactOptions
} from "./node-artifacts-base";

export type { NodeArtifactAsset, NodeArtifactOptions } from "./node-artifacts-base";
export { imageAssetIdsForNode };

type ClippedRendererNode = RendererNode & { clip?: RendererNode["clip"] | null };

interface FillGradient {
  source: NodePaintSource;
  gradient: NodePaintGradient;
  stops: NodePaintStop[];
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function nodeClip(node: RendererNode) {
  const clip = (node as ClippedRendererNode).clip;
  return clip?.type === "bounds" ? clip : null;
}

function nodeUsesPenpotEllipseShape(node: RendererNode) {
  const shapeType = nodeClip(node)?.source?.shapeType?.replace(/^:/, "").toLowerCase();
  return shapeType === "ellipse" || shapeType === "circle";
}

function normalizedGradientType(gradient: NodePaintGradient) {
  return gradient.type?.replace(/^:/, "").toLowerCase() ?? "linear";
}

function gradientStopsForGradient(gradient: NodePaintGradient) {
  return gradient.stops?.filter((stop) => Number.isFinite(stop.offset) && stop.color) ?? [];
}

function radialFillGradientForNode(node: RendererNode): FillGradient | null {
  if (!nodeUsesPenpotEllipseShape(node) || node.kind === "group" || node.content.type === "text") {
    return null;
  }

  const paintSources = [...(node.style.paint_sources ?? [])].sort((left, right) => left.index - right.index);
  for (const source of paintSources) {
    const gradient = source.gradient;
    if (!gradient || source.kind !== "fill" || source.paintType !== "gradient") {
      continue;
    }
    if (!normalizedGradientType(gradient).includes("radial")) {
      continue;
    }
    const stops = gradientStopsForGradient(gradient);
    if (stops.length >= 2) {
      return { source, gradient, stops };
    }
  }
  return null;
}

function safeSvgIdSuffix(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function svgGradientIdForNode(node: RendererNode, source: NodePaintSource) {
  return `layo-gradient-${safeSvgIdSuffix(node.id)}-${source.kind}-${source.index}`;
}

function clipPathIdForNode(node: RendererNode) {
  return `layo-clip-${safeSvgIdSuffix(node.id)}`;
}

function gradientCoordinateUnit(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function gradientCoordinatePercent(value: number | undefined) {
  return `${formatNumber((typeof value === "number" && Number.isFinite(value) ? value : 0) * 100)}%`;
}

function gradientStopPercent(value: number) {
  return `${formatNumber(clampUnit(value) * 100)}%`;
}

function svgRadialGradientRadius(gradient: NodePaintGradient) {
  const start = gradient.start ?? { x: 0.5, y: 0.5 };
  const end = gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const radius = Math.hypot(endX - startX, endY - startY);
  return radius > 0 ? radius : 0.5;
}

function svgGradientStopLine(source: NodePaintSource, stop: NodePaintStop) {
  const opacity = clampUnit(stop.opacity * (source.opacity ?? 1));
  const opacityAttribute = opacity < 1 ? ` stop-opacity="${formatNumber(opacity)}"` : "";
  return `<stop offset="${gradientStopPercent(stop.offset)}" stop-color="${escapeSvgText(stop.color)}"${opacityAttribute} />`;
}

function svgEllipseAttributes(width: number, height: number) {
  return `cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" rx="${formatNumber(width / 2)}" ry="${formatNumber(height / 2)}"`;
}

function svgOpacityAttribute(opacity: number) {
  return opacity < 1 ? ` opacity="${formatNumber(clampUnit(opacity))}"` : "";
}

function svgNodeAttributes(node: RendererNode) {
  return `data-node-id="${escapeSvgText(node.id)}" data-node-name="${escapeSvgText(node.name)}" data-node-kind="${node.kind}"`;
}

function svgForEllipseRadialFill(node: RendererNode, fillGradient: FillGradient) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const nodeId = escapeSvgText(node.id);
  const nodeName = escapeSvgText(node.name);
  const center = fillGradient.gradient.start ?? { x: 0.5, y: 0.5 };
  const gradientId = svgGradientIdForNode(node, fillGradient.source);
  const stroke = node.style.stroke ? escapeSvgText(node.style.stroke) : "none";
  const opacity = svgOpacityAttribute(node.style.opacity);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-node-id="${nodeId}" data-node-name="${nodeName}" role="img" aria-label="${nodeName}">`,
    `  <title>${nodeName}</title>`,
    "  <defs>",
    `    <radialGradient id="${gradientId}" cx="${gradientCoordinatePercent(gradientCoordinateUnit(center.x, 0.5))}" cy="${gradientCoordinatePercent(gradientCoordinateUnit(center.y, 0.5))}" r="${gradientCoordinatePercent(svgRadialGradientRadius(fillGradient.gradient))}">`,
    ...[...fillGradient.stops].sort((left, right) => left.offset - right.offset).map((stop) => `      ${svgGradientStopLine(fillGradient.source, stop)}`),
    "    </radialGradient>",
    `    <clipPath id="${clipPathIdForNode(node)}">`,
    `      <ellipse ${svgEllipseAttributes(width, height)} />`,
    "    </clipPath>",
    "  </defs>",
    `  <g ${svgNodeAttributes(node)} clip-path="url(#${clipPathIdForNode(node)})">`,
    `    <ellipse ${svgNodeAttributes(node)} ${svgEllipseAttributes(width, height)} fill="url(#${gradientId})" data-fallback-fill="${escapeSvgText(node.style.fill)}" stroke="${stroke}" stroke-width="${Math.max(0, Math.round(node.style.stroke_width))}"${opacity} />`,
    "  </g>",
    "</svg>",
    ""
  ].join("\n");
}

function pdfEscapeString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("\r", " ").replaceAll("\n", " ");
}

function pdfRgbForColor(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const hex = match[1];
  if (hex.length === 3) {
    return hex.split("").map((channel) => Number.parseInt(`${channel}${channel}`, 16)) as [number, number, number];
  }
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function pdfRgbOperands(rgb: [number, number, number] | null) {
  const color = rgb ?? [15, 23, 42];
  return color
    .map((channel) => {
      const value = Math.max(0, Math.min(255, channel)) / 255;
      return formatNumber(Number(value.toFixed(3)));
    })
    .join(" ");
}

function pdfColorArray(rgb: [number, number, number]) {
  return `[${pdfRgbOperands(rgb)}]`;
}

function pdfGradientStops(stops: NodePaintStop[]) {
  const parsed = stops.flatMap((stop) => {
    const rgb = pdfRgbForColor(stop.color);
    return rgb ? [{ offset: clampUnit(stop.offset), rgb }] : [];
  });
  parsed.sort((left, right) => left.offset - right.offset);
  return parsed.length >= 2 ? parsed : null;
}

function pdfGradientFunction(stops: Array<{ offset: number; rgb: [number, number, number] }>) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  return `<< /FunctionType 2 /Domain [0 1] /C0 ${pdfColorArray(first.rgb)} /C1 ${pdfColorArray(last.rgb)} /N 1 >>`;
}

const pdfEllipseKappa = 0.552284749831;

function pdfEllipsePathCommands(width: number, height: number, pageHeight: number, x: number, y: number) {
  const rx = width / 2;
  const ry = height / 2;
  const centerX = x + rx;
  const centerY = pageHeight - y - ry;
  const left = centerX - rx;
  const right = centerX + rx;
  const top = centerY + ry;
  const bottom = centerY - ry;
  const controlX = rx * pdfEllipseKappa;
  const controlY = ry * pdfEllipseKappa;
  return [
    `${formatNumber(right)} ${formatNumber(centerY)} m`,
    `${formatNumber(right)} ${formatNumber(centerY + controlY)} ${formatNumber(centerX + controlX)} ${formatNumber(top)} ${formatNumber(centerX)} ${formatNumber(top)} c`,
    `${formatNumber(centerX - controlX)} ${formatNumber(top)} ${formatNumber(left)} ${formatNumber(centerY + controlY)} ${formatNumber(left)} ${formatNumber(centerY)} c`,
    `${formatNumber(left)} ${formatNumber(centerY - controlY)} ${formatNumber(centerX - controlX)} ${formatNumber(bottom)} ${formatNumber(centerX)} ${formatNumber(bottom)} c`,
    `${formatNumber(centerX + controlX)} ${formatNumber(bottom)} ${formatNumber(right)} ${formatNumber(centerY - controlY)} ${formatNumber(right)} ${formatNumber(centerY)} c`,
    "h"
  ];
}

function pdfRadialGradientCoords(node: RendererNode, gradient: NodePaintGradient, pageHeight: number) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const start = gradient.start ?? { x: 0.5, y: 0.5 };
  const end = gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const centerX = width * startX;
  const centerY = pageHeight - height * startY;
  const radius = Math.hypot((endX - startX) * width, (endY - startY) * height) || Math.max(width, height) / 2;
  return [centerX, centerY, 0, centerX, centerY, radius].map(formatNumber).join(" ");
}

interface PdfObject {
  parts: Array<string | Uint8Array>;
}

function encodePdfPart(part: string | Uint8Array) {
  return typeof part === "string" ? new TextEncoder().encode(part) : part;
}

function concatPdfParts(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function buildPdf(objects: PdfObject[]) {
  const chunks: Uint8Array[] = [encodePdfPart("%PDF-1.4\n% Layo selected layer export\n")];
  const offsets: number[] = [];
  let byteOffset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(byteOffset);
    const objectChunks = [encodePdfPart(`${index + 1} 0 obj\n`), ...object.parts.map(encodePdfPart), encodePdfPart("\nendobj\n")];
    for (const chunk of objectChunks) {
      chunks.push(chunk);
      byteOffset += chunk.length;
    }
  });
  const xrefOffset = byteOffset;
  const xrefRows = ["0000000000 65535 f ", ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)];
  chunks.push(
    encodePdfPart(
      ["xref", `0 ${objects.length + 1}`, ...xrefRows, "trailer", `<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>`, "startxref", String(xrefOffset), "%%EOF", ""].join("\n")
    )
  );
  return concatPdfParts(chunks);
}

function addPdfObject(objects: PdfObject[], parts: string | Uint8Array | Array<string | Uint8Array>) {
  objects.push({ parts: Array.isArray(parts) ? parts : [parts] });
  return objects.length;
}

function setPdfObject(objects: PdfObject[], id: number, parts: string | Uint8Array | Array<string | Uint8Array>) {
  objects[id - 1] = { parts: Array.isArray(parts) ? parts : [parts] };
}

function pdfForEllipseRadialFill(node: RendererNode, fillGradient: FillGradient) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const stops = pdfGradientStops(fillGradient.stops) ?? [
    { offset: 0, rgb: pdfRgbForColor(node.style.fill) ?? [0, 0, 0] },
    { offset: 1, rgb: pdfRgbForColor(node.style.fill) ?? [0, 0, 0] }
  ];
  const content = ["q", ...pdfEllipsePathCommands(width, height, height, 0, 0), "W", "n", "/Sh1 sh", "Q", ""].join("\n");
  const contentBytes = new TextEncoder().encode(content);
  const objects: PdfObject[] = [];
  const catalogId = addPdfObject(objects, "");
  const pagesId = addPdfObject(objects, "");
  const pageId = addPdfObject(objects, "");
  const contentId = addPdfObject(objects, "");
  const infoId = addPdfObject(objects, "");
  const shadingId = addPdfObject(
    objects,
    `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${pdfRadialGradientCoords(node, fillGradient.gradient, height)}] /Function ${pdfGradientFunction(stops)} /Extend [true true] >>`
  );

  setPdfObject(objects, catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  setPdfObject(objects, pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  setPdfObject(
    objects,
    pageId,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Shading << /Sh1 ${shadingId} 0 R >> >> /Contents ${contentId} 0 R >>`
  );
  setPdfObject(objects, contentId, [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "endstream"]);
  setPdfObject(objects, infoId, `<< /Title (${pdfEscapeString(node.name)}) /Subject (${pdfEscapeString(node.id)}) /Creator (Layo) >>`);
  return buildPdf(objects);
}

export function svgForNode(node: RendererNode, options: NodeArtifactOptions = {}) {
  const fillGradient = radialFillGradientForNode(node);
  return fillGradient ? svgForEllipseRadialFill(node, fillGradient) : baseSvgForNode(node, options);
}

export function pdfForNode(node: RendererNode, options: NodeArtifactOptions = {}) {
  const fillGradient = radialFillGradientForNode(node);
  return fillGradient ? pdfForEllipseRadialFill(node, fillGradient) : basePdfForNode(node, options);
}
