import { unzlibSync, zlibSync } from "fflate";
import type { NodePaintGradient, NodePaintSource, NodePaintStop, RendererNode } from "@layo/renderer";

export interface NodeArtifactAsset {
  assetId: string;
  mimeType: string;
  dataBase64: string;
  pdfPreviewPngBase64?: string;
  name?: string;
}

export interface NodeArtifactOptions {
  assets?: Record<string, NodeArtifactAsset | undefined>;
}

type PdfPart = string | Uint8Array;

type ClippedRendererNode = RendererNode & { clip?: RendererNode["clip"] | null };

interface PdfObject {
  parts: PdfPart[];
}

interface PdfCommandEntry {
  type: "commands";
  commands: string[];
  clipOpacity?: number;
  graphicsStateName?: string;
  graphicsStateId?: number;
}

interface ParsedShadowColor {
  svgColor: string;
  opacity: number;
  pdfRgb: [number, number, number] | null;
}

interface ParsedShadowLayer {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: ParsedShadowColor;
}

interface PdfShadowEntry {
  type: "shadow";
  node: RendererNode;
  layer: ParsedShadowLayer;
  x: number;
  y: number;
  pageHeight: number;
  graphicsStateName?: string;
  graphicsStateId?: number;
}

interface PdfImageEntry {
  type: "image";
  node: RendererNode;
  asset: NodeArtifactAsset;
  x: number;
  y: number;
  pageHeight: number;
  xObjectName?: string;
  xObjectId?: number;
  sMaskId?: number;
  fileSpecId?: number;
}

interface PdfGradientFillEntry {
  type: "gradientFill";
  node: RendererNode;
  source: NodePaintSource;
  gradient: NodePaintGradient;
  stops: NodePaintStop[];
  x: number;
  y: number;
  pageHeight: number;
  shadingName?: string;
  shadingId?: number;
  graphicsStateName?: string;
  graphicsStateId?: number;
}

type PdfEntry = PdfCommandEntry | PdfImageEntry | PdfShadowEntry | PdfGradientFillEntry;

interface ArtifactBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface FillGradient {
  source: NodePaintSource;
  gradient: NodePaintGradient;
  stops: NodePaintStop[];
}

interface PdfGradientStop {
  offset: number;
  rgb: [number, number, number];
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

function svgOpacityAttribute(opacity: number) {
  return opacity < 1 ? ` opacity="${formatNumber(Math.max(0, Math.min(1, opacity)))}"` : "";
}

function svgNodeTransform(node: RendererNode) {
  const translate = `translate(${formatNumber(node.transform.x)} ${formatNumber(node.transform.y)})`;
  const rotation = node.transform.rotation ? ` rotate(${formatNumber(node.transform.rotation)})` : "";
  return `${translate}${rotation}`;
}

function svgNodeAttributes(node: RendererNode) {
  return `data-node-id="${escapeSvgText(node.id)}" data-node-name="${escapeSvgText(node.name)}" data-node-kind="${node.kind}"`;
}

function nodeClip(node: RendererNode) {
  const clip = (node as ClippedRendererNode).clip;
  return clip?.type === "bounds" ? clip : null;
}

function nodeClipsToBounds(node: RendererNode) {
  return Boolean(nodeClip(node));
}

function clipPolygonPointsForNode(node: RendererNode) {
  const source = nodeClip(node)?.source;
  const points = source?.points;
  const bounds = source?.bounds;
  if (!points || points.length < 3 || !bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const coordinates: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    const x = point.x - bounds.x;
    const y = point.y - bounds.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    coordinates.push({ x, y });
  }
  return coordinates;
}

function svgClipPolygonPointsForNode(node: RendererNode) {
  const points = clipPolygonPointsForNode(node);
  return points ? points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ") : null;
}

function normalizedBase64(value: string) {
  return value.replace(/\s+/g, "");
}

function assetDataUrl(asset: NodeArtifactAsset) {
  return `data:${escapeSvgText(asset.mimeType)};base64,${normalizedBase64(asset.dataBase64)}`;
}

function splitCssShadowLayers(value: string) {
  const layers: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (character === "," && depth === 0) {
      if (current.trim()) {
        layers.push(current.trim());
      }
      current = "";
    } else {
      current += character;
    }
  }

  if (current.trim()) {
    layers.push(current.trim());
  }
  return layers;
}

function shadowLayerValuesForNode(node: RendererNode) {
  if (node.style.effect_shadows?.length) {
    return node.style.effect_shadows.map((shadow) => shadow.trim()).filter(Boolean);
  }
  return node.style.effect_shadow ? splitCssShadowLayers(node.style.effect_shadow) : [];
}

function parseCssLength(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px)?$/i);
  return match ? Number(match[1]) : null;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseShadowColor(value: string): ParsedShadowColor {
  const rgbaMatch = value
    .trim()
    .match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i);
  if (rgbaMatch) {
    const rgb: [number, number, number] = [
      Math.max(0, Math.min(255, Number(rgbaMatch[1]))),
      Math.max(0, Math.min(255, Number(rgbaMatch[2]))),
      Math.max(0, Math.min(255, Number(rgbaMatch[3])))
    ];
    const opacity = rgbaMatch[4] === undefined ? 1 : clampUnit(Number(rgbaMatch[4]));
    return { svgColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, opacity, pdfRgb: rgb };
  }

  const hexMatch = value.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const channels =
      hex.length === 3 || hex.length === 4
        ? hex.split("").map((channel) => Number.parseInt(`${channel}${channel}`, 16))
        : [0, 2, 4, 6].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    const rgb: [number, number, number] = [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
    const opacity = channels[3] === undefined ? 1 : clampUnit(channels[3] / 255);
    return { svgColor: `#${hex.slice(0, hex.length === 4 ? 3 : 6)}`, opacity, pdfRgb: rgb };
  }

  return { svgColor: value.trim() || "rgb(15, 23, 42)", opacity: 1, pdfRgb: null };
}

function parseShadowLayer(value: string): ParsedShadowLayer | null {
  const trimmed = value.trim();
  if (!trimmed || /[;{}\n\r]/.test(trimmed) || /\binset\b/i.test(trimmed)) {
    return null;
  }

  const colorMatch = trimmed.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/);
  const colorText = colorMatch?.[1] ?? "rgba(15, 23, 42, 0.2)";
  const lengthText = colorMatch ? trimmed.slice(0, colorMatch.index).trim() : trimmed;
  const lengths = lengthText.split(/\s+/).filter(Boolean).map(parseCssLength);
  if (lengths.length < 3 || lengths.slice(0, 3).some((length) => length === null)) {
    return null;
  }

  return {
    offsetX: lengths[0] ?? 0,
    offsetY: lengths[1] ?? 0,
    blur: Math.max(0, lengths[2] ?? 0),
    spread: Math.max(0, lengths[3] ?? 0),
    color: parseShadowColor(colorText)
  };
}

function shadowLayersForNode(node: RendererNode) {
  return shadowLayerValuesForNode(node).map(parseShadowLayer).filter((layer): layer is ParsedShadowLayer => Boolean(layer));
}

function shadowExpansion(layer: ParsedShadowLayer) {
  return layer.blur * 2 + layer.spread;
}

function boundsForBox(width: number, height: number): ArtifactBounds {
  return { minX: 0, minY: 0, maxX: width, maxY: height };
}

function mergeBounds(a: ArtifactBounds, b: ArtifactBounds): ArtifactBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function translateBounds(bounds: ArtifactBounds, x: number, y: number): ArtifactBounds {
  return {
    minX: bounds.minX + x,
    minY: bounds.minY + y,
    maxX: bounds.maxX + x,
    maxY: bounds.maxY + y
  };
}

function shadowBoundsForNode(node: RendererNode): ArtifactBounds | null {
  const layers = shadowLayersForNode(node);
  if (layers.length === 0 || node.kind === "group") {
    return null;
  }

  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  return layers.reduce<ArtifactBounds>((bounds, layer) => {
    const expansion = shadowExpansion(layer);
    return mergeBounds(bounds, {
      minX: layer.offsetX - expansion,
      minY: layer.offsetY - expansion,
      maxX: width + layer.offsetX + expansion,
      maxY: height + layer.offsetY + expansion
    });
  }, boundsForBox(width, height));
}

function artifactBoundsForNode(node: RendererNode): ArtifactBounds {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  let bounds = mergeBounds(boundsForBox(width, height), shadowBoundsForNode(node) ?? boundsForBox(width, height));

  if (nodeClipsToBounds(node)) {
    return bounds;
  }

  for (const child of node.children) {
    bounds = mergeBounds(bounds, translateBounds(artifactBoundsForNode(child), child.transform.x, child.transform.y));
  }

  return bounds;
}

function exportBoundsForNode(node: RendererNode): ArtifactBounds {
  const bounds = artifactBoundsForNode(node);
  return {
    minX: Math.floor(bounds.minX),
    minY: Math.floor(bounds.minY),
    maxX: Math.ceil(bounds.maxX),
    maxY: Math.ceil(bounds.maxY)
  };
}

function safeSvgIdSuffix(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function shadowFilterIdForNode(node: RendererNode) {
  return `layo-shadow-${safeSvgIdSuffix(node.id)}`;
}

function svgShadowFilterAttribute(node: RendererNode) {
  return shadowLayersForNode(node).length > 0 && node.kind !== "group" ? ` filter="url(#${shadowFilterIdForNode(node)})"` : "";
}

function svgGradientIdForNode(node: RendererNode, source: NodePaintSource) {
  return `layo-gradient-${safeSvgIdSuffix(node.id)}-${source.index}`;
}

function gradientCoordinatePercent(value: number | undefined) {
  return `${formatNumber((typeof value === "number" && Number.isFinite(value) ? value : 0) * 100)}%`;
}

function gradientStopPercent(value: number) {
  return `${formatNumber(clampUnit(value) * 100)}%`;
}

function fillGradientForNode(node: RendererNode): FillGradient | null {
  if (node.kind === "group" || node.content.type === "text") {
    return null;
  }

  const paintSources = [...(node.style.paint_sources ?? [])].sort((left, right) => left.index - right.index);
  for (const source of paintSources) {
    const gradient = source.gradient;
    if (!gradient) {
      continue;
    }
    const type = gradient.type?.replace(/^:/, "").toLowerCase() ?? "linear";
    const stops = gradient.stops?.filter((stop) => Number.isFinite(stop.offset) && stop.color) ?? [];
    if (source.kind === "fill" && source.paintType === "gradient" && type.includes("linear") && stops.length >= 2) {
      return { source, gradient, stops };
    }
  }

  return null;
}

function svgGradientStopLine(source: NodePaintSource, stop: NodePaintStop) {
  const opacity = clampUnit(stop.opacity * (source.opacity ?? 1));
  const opacityAttribute = opacity < 1 ? ` stop-opacity="${formatNumber(opacity)}"` : "";
  return `<stop offset="${gradientStopPercent(stop.offset)}" stop-color="${escapeSvgText(stop.color)}"${opacityAttribute} />`;
}

function svgGradientLinesForNode(node: RendererNode, depth: number): string[] {
  const fillGradient = fillGradientForNode(node);
  if (!fillGradient) {
    return [];
  }

  const start = fillGradient.gradient.start ?? { x: 0, y: 0 };
  const end = fillGradient.gradient.end ?? { x: 1, y: 0 };
  return [
    indent(
      `<linearGradient id="${svgGradientIdForNode(node, fillGradient.source)}" x1="${gradientCoordinatePercent(
        start.x
      )}" y1="${gradientCoordinatePercent(start.y)}" x2="${gradientCoordinatePercent(end.x)}" y2="${gradientCoordinatePercent(end.y)}">`,
      depth
    ),
    ...[...fillGradient.stops]
      .sort((left, right) => left.offset - right.offset)
      .map((stop) => indent(svgGradientStopLine(fillGradient.source, stop), depth + 1)),
    indent("</linearGradient>", depth)
  ];
}

function svgGradientLinesForTree(node: RendererNode, depth: number): string[] {
  return [...svgGradientLinesForNode(node, depth), ...node.children.flatMap((child) => svgGradientLinesForTree(child, depth))];
}

function svgFillAttributeForNode(node: RendererNode) {
  const fill = escapeSvgText(node.style.fill);
  const fillGradient = fillGradientForNode(node);
  if (!fillGradient) {
    return `fill="${fill}"`;
  }
  return `fill="url(#${svgGradientIdForNode(node, fillGradient.source)})" data-fallback-fill="${fill}"`;
}

function clipSourceOpacityForNode(node: RendererNode) {
  const opacity = nodeClip(node)?.source?.opacity;
  return typeof opacity === "number" && Number.isFinite(opacity) ? clampUnit(opacity) : 1;
}

function nodeClipUsesAlphaMask(node: RendererNode) {
  return clipSourceOpacityForNode(node) < 1;
}

function clipPathIdForNode(node: RendererNode) {
  return `layo-clip-${safeSvgIdSuffix(node.id)}`;
}

function maskIdForNode(node: RendererNode) {
  return `layo-mask-${safeSvgIdSuffix(node.id)}`;
}

function svgClipReferenceAttribute(node: RendererNode) {
  if (!nodeClipsToBounds(node)) {
    return "";
  }
  return nodeClipUsesAlphaMask(node)
    ? ` mask="url(#${maskIdForNode(node)})"`
    : ` clip-path="url(#${clipPathIdForNode(node)})"`;
}

function svgClipPathLinesForNode(node: RendererNode, depth: number): string[] {
  if (!nodeClipsToBounds(node)) {
    return [];
  }
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const polygonPoints = svgClipPolygonPointsForNode(node);

  if (nodeClipUsesAlphaMask(node)) {
    const opacity = formatNumber(clipSourceOpacityForNode(node));
    const maskShape = polygonPoints
      ? `<polygon points="${escapeSvgText(polygonPoints)}" fill="#fff" fill-opacity="${opacity}" />`
      : `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff" fill-opacity="${opacity}" />`;
    return [
      indent(
        `<mask id="${maskIdForNode(node)}" x="0" y="0" width="${width}" height="${height}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">`,
        depth
      ),
      indent(maskShape, depth + 1),
      indent("</mask>", depth)
    ];
  }

  const clipShape = polygonPoints
    ? `<polygon points="${escapeSvgText(polygonPoints)}" />`
    : `<rect x="0" y="0" width="${width}" height="${height}" />`;
  return [
    indent(`<clipPath id="${clipPathIdForNode(node)}">`, depth),
    indent(clipShape, depth + 1),
    indent("</clipPath>", depth)
  ];
}

function svgClipPathLinesForTree(node: RendererNode, depth: number): string[] {
  return [...svgClipPathLinesForNode(node, depth), ...node.children.flatMap((child) => svgClipPathLinesForTree(child, depth))];
}

function svgShadowFilterLinesForNode(node: RendererNode, depth: number): string[] {
  const layers = shadowLayersForNode(node);
  if (layers.length === 0 || node.kind === "group") {
    return [];
  }

  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const bounds = layers.reduce<ArtifactBounds>((current, layer) => {
    const expansion = shadowExpansion(layer);
    return mergeBounds(current, {
      minX: layer.offsetX - expansion,
      minY: layer.offsetY - expansion,
      maxX: width + layer.offsetX + expansion,
      maxY: height + layer.offsetY + expansion
    });
  }, boundsForBox(width, height));

  return [
    indent(
      `<filter id="${shadowFilterIdForNode(node)}" x="${formatNumber(Math.floor(bounds.minX))}" y="${formatNumber(
        Math.floor(bounds.minY)
      )}" width="${formatNumber(Math.ceil(bounds.maxX) - Math.floor(bounds.minX))}" height="${formatNumber(
        Math.ceil(bounds.maxY) - Math.floor(bounds.minY)
      )}" filterUnits="userSpaceOnUse">`,
      depth
    ),
    ...layers.map((layer) =>
      indent(
        `<feDropShadow dx="${formatNumber(layer.offsetX)}" dy="${formatNumber(layer.offsetY)}" stdDeviation="${formatNumber(
          layer.blur / 2
        )}" flood-color="${escapeSvgText(layer.color.svgColor)}" flood-opacity="${formatNumber(layer.color.opacity)}" />`,
        depth + 1
      )
    ),
    indent("</filter>", depth)
  ];
}

function svgShadowFilterLinesForTree(node: RendererNode, depth: number): string[] {
  return [...svgShadowFilterLinesForNode(node, depth), ...node.children.flatMap((child) => svgShadowFilterLinesForTree(child, depth))];
}

function svgDefsForNode(node: RendererNode, depth: number): string[] {
  const defLines = [
    ...svgGradientLinesForTree(node, depth + 1),
    ...svgShadowFilterLinesForTree(node, depth + 1),
    ...svgClipPathLinesForTree(node, depth + 1)
  ];
  return defLines.length > 0 ? [indent("<defs>", depth), ...defLines, indent("</defs>", depth)] : [];
}

function imageAssetForNode(node: RendererNode, options: NodeArtifactOptions) {
  if (node.content.type !== "image") {
    return undefined;
  }
  const asset = options.assets?.[node.content.asset_id];
  return asset?.dataBase64 ? asset : undefined;
}

function svgImageForNode(node: RendererNode, asset: NodeArtifactAsset) {
  if (node.content.type !== "image") {
    return null;
  }
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const opacity = svgOpacityAttribute(node.style.opacity);
  const filter = svgShadowFilterAttribute(node);
  const fitMode = node.content.fit_mode ?? "fill";
  const preserveAspectRatio = fitMode === "fit" ? "xMidYMid meet" : "xMidYMid slice";
  return `<image ${svgNodeAttributes(node)} data-image-asset-id="${escapeSvgText(
    node.content.asset_id
  )}" x="0" y="0" width="${width}" height="${height}" href="${assetDataUrl(asset)}" preserveAspectRatio="${preserveAspectRatio}"${opacity}${filter} />`;
}

function svgSelfForNode(node: RendererNode, options: NodeArtifactOptions) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const fill = escapeSvgText(node.style.fill);
  const fillAttribute = svgFillAttributeForNode(node);
  const opacity = svgOpacityAttribute(node.style.opacity);
  const filter = svgShadowFilterAttribute(node);

  if (node.content.type === "text") {
    const fontSize = Math.max(1, Math.round(node.content.font_size));
    return `<text ${svgNodeAttributes(node)} x="0" y="${fontSize}" fill="${fill}" font-family="${escapeSvgText(
      node.content.font_family
    )}" font-size="${fontSize}"${opacity}${filter}>${escapeSvgText(node.content.value)}</text>`;
  }

  const imageAsset = imageAssetForNode(node, options);
  if (imageAsset) {
    return svgImageForNode(node, imageAsset);
  }

  if (node.kind === "group") {
    return null;
  }

  const assetAttribute = node.content.type === "image" ? ` data-image-asset-id="${escapeSvgText(node.content.asset_id)}"` : "";
  return `<rect ${svgNodeAttributes(node)}${assetAttribute} x="0" y="0" width="${width}" height="${height}" rx="0" ${fillAttribute} stroke="${
    node.style.stroke ? escapeSvgText(node.style.stroke) : "none"
  }" stroke-width="${Math.max(0, Math.round(node.style.stroke_width))}"${opacity}${filter} />`;
}

function indent(line: string, depth: number) {
  return `${"  ".repeat(depth)}${line}`;
}

function svgLinesForNode(node: RendererNode, options: NodeArtifactOptions, depth: number, isRoot = false): string[] {
  const lines: string[] = [];
  const clipReference = svgClipReferenceAttribute(node);
  const shouldWrap = !isRoot || Boolean(clipReference);
  if (shouldWrap) {
    const transform = isRoot ? "" : ` transform="${svgNodeTransform(node)}"`;
    lines.push(indent(`<g ${svgNodeAttributes(node)}${transform}${clipReference}>`, depth));
  }

  const self = svgSelfForNode(node, options);
  const childDepth = shouldWrap ? depth + 1 : depth;
  if (self) {
    lines.push(indent(self, childDepth));
  }

  for (const child of node.children) {
    lines.push(...svgLinesForNode(child, options, childDepth));
  }

  if (shouldWrap) {
    lines.push(indent("</g>", depth));
  }
  return lines;
}

export function imageAssetIdsForNode(node: RendererNode) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (candidate: RendererNode) => {
    if (candidate.content.type === "image" && !seen.has(candidate.content.asset_id)) {
      seen.add(candidate.content.asset_id);
      ids.push(candidate.content.asset_id);
    }
    candidate.children.forEach(visit);
  };
  visit(node);
  return ids;
}

export function svgForNode(node: RendererNode, options: NodeArtifactOptions = {}) {
  const bounds = exportBoundsForNode(node);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const nodeId = escapeSvgText(node.id);
  const nodeName = escapeSvgText(node.name);
  const title = `<title>${nodeName}</title>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${formatNumber(
      bounds.minX
    )} ${formatNumber(bounds.minY)} ${width} ${height}" data-node-id="${nodeId}" data-node-name="${nodeName}" role="img" aria-label="${nodeName}">`,
    `  ${title}`,
    ...svgDefsForNode(node, 1),
    ...svgLinesForNode(node, options, 1, true),
    "</svg>",
    ""
  ].join("\n");
}

function pdfEscapeString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("\r", " ").replaceAll("\n", " ");
}

function pdfName(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, (character) => `#${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

function pdfColorOperands(fill: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!match) {
    return "0 0 0";
  }
  const hex = match[1];
  return [0, 2, 4]
    .map((index) => {
      const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return formatNumber(Number(channel.toFixed(3)));
    })
    .join(" ");
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

function pdfColorArray(rgb: [number, number, number]) {
  return `[${pdfRgbOperands(rgb)}]`;
}

function pdfGradientStops(stops: NodePaintStop[]) {
  const byOffset = new Map<number, PdfGradientStop>();
  for (const stop of stops) {
    const rgb = pdfRgbForColor(stop.color);
    if (!rgb) {
      return null;
    }
    byOffset.set(clampUnit(stop.offset), { offset: clampUnit(stop.offset), rgb });
  }

  const sortedStops = [...byOffset.values()].sort((left, right) => left.offset - right.offset);
  if (sortedStops.length < 2) {
    return null;
  }

  const firstStop = sortedStops[0];
  const lastStop = sortedStops[sortedStops.length - 1];
  const normalizedStops = [...sortedStops];
  if (firstStop.offset > 0) {
    normalizedStops.unshift({ ...firstStop, offset: 0 });
  }
  if (lastStop.offset < 1) {
    normalizedStops.push({ ...lastStop, offset: 1 });
  }
  return normalizedStops;
}

function pdfFillGradientForNode(node: RendererNode): FillGradient | null {
  const fillGradient = fillGradientForNode(node);
  if (!fillGradient || !pdfGradientStops(fillGradient.stops)) {
    return null;
  }
  return fillGradient;
}

function pdfGradientFunction(stops: PdfGradientStop[]) {
  if (stops.length === 2) {
    return `<< /FunctionType 2 /Domain [0 1] /C0 ${pdfColorArray(stops[0].rgb)} /C1 ${pdfColorArray(stops[1].rgb)} /N 1 >>`;
  }

  const functions = stops.slice(0, -1).map((stop, index) => {
    const nextStop = stops[index + 1];
    return `<< /FunctionType 2 /Domain [0 1] /C0 ${pdfColorArray(stop.rgb)} /C1 ${pdfColorArray(nextStop.rgb)} /N 1 >>`;
  });
  const bounds = stops
    .slice(1, -1)
    .map((stop) => formatNumber(stop.offset))
    .join(" ");
  const encode = functions.map(() => "0 1").join(" ");
  return `<< /FunctionType 3 /Domain [0 1] /Functions [${functions.join(" ")}] /Bounds [${bounds}] /Encode [${encode}] >>`;
}

function gradientCoordinateUnit(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pdfGradientCoords(entry: PdfGradientFillEntry) {
  const width = Math.max(1, Math.round(entry.node.size.width));
  const height = Math.max(1, Math.round(entry.node.size.height));
  const start = entry.gradient.start ?? { x: 0, y: 0 };
  const end = entry.gradient.end ?? { x: 1, y: 0 };
  const x1 = entry.x + width * gradientCoordinateUnit(start.x, 0);
  const y1 = entry.pageHeight - entry.y - height * gradientCoordinateUnit(start.y, 0);
  const x2 = entry.x + width * gradientCoordinateUnit(end.x, 1);
  const y2 = entry.pageHeight - entry.y - height * gradientCoordinateUnit(end.y, 0);
  return [x1, y1, x2, y2].map(formatNumber).join(" ");
}

function pdfGradientShadingObject(entry: PdfGradientFillEntry) {
  const stops = pdfGradientStops(entry.stops) ?? [
    { offset: 0, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] },
    { offset: 1, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] }
  ];
  return `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${pdfGradientCoords(entry)}] /Function ${pdfGradientFunction(
    stops
  )} /Extend [true true] >>`;
}

function pdfGradientFillOpacity(entry: PdfGradientFillEntry) {
  const opacity = typeof entry.source.opacity === "number" && Number.isFinite(entry.source.opacity) ? clampUnit(entry.source.opacity) : 1;
  return opacity < 1 ? opacity : null;
}

function pdfClipCommandsForNode(node: RendererNode, pageHeight: number, x: number, y: number) {
  if (!nodeClipsToBounds(node)) {
    return null;
  }

  const polygonPoints = clipPolygonPointsForNode(node);
  if (polygonPoints) {
    const [firstPoint, ...remainingPoints] = polygonPoints;
    return [
      "q",
      `${formatNumber(x + firstPoint.x)} ${formatNumber(pageHeight - y - firstPoint.y)} m`,
      ...remainingPoints.map(
        (point) => `${formatNumber(x + point.x)} ${formatNumber(pageHeight - y - point.y)} l`
      ),
      "h",
      "W",
      "n"
    ];
  }

  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const pdfY = pageHeight - y - height;
  return ["q", `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`, "W", "n"];
}

function pdfClipOpacityForNode(node: RendererNode) {
  const opacity = clipSourceOpacityForNode(node);
  return opacity < 1 ? opacity : null;
}

function pdfStrokeCommands(node: RendererNode, pageHeight: number, x: number, y: number) {
  if (!node.style.stroke || node.style.stroke_width <= 0) {
    return [];
  }

  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const pdfY = pageHeight - y - height;
  return [
    "q",
    `${pdfColorOperands(node.style.stroke)} RG`,
    `${formatNumber(Math.max(0, node.style.stroke_width))} w`,
    `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    "S",
    "Q"
  ];
}

function pdfRectCommands(node: RendererNode, pageHeight: number, x: number, y: number) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const pdfY = pageHeight - y - height;
  return ["q", `${pdfColorOperands(node.style.fill)} rg`, `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`, "f", "Q", ...pdfStrokeCommands(node, pageHeight, x, y)];
}

function pdfGradientFillCommands(entry: PdfGradientFillEntry) {
  if (!entry.shadingName) {
    return pdfRectCommands(entry.node, entry.pageHeight, entry.x, entry.y);
  }

  const width = Math.max(1, Math.round(entry.node.size.width));
  const height = Math.max(1, Math.round(entry.node.size.height));
  const pdfY = entry.pageHeight - entry.y - height;
  const graphicsState = entry.graphicsStateName ? `/${entry.graphicsStateName} gs` : "";
  return [
    "q",
    `${formatNumber(entry.x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    "W",
    "n",
    graphicsState,
    `/${entry.shadingName} sh`,
    "Q"
  ].filter(Boolean);
}

function pdfTextCommands(node: RendererNode, pageHeight: number, x: number, y: number) {
  if (node.content.type !== "text") {
    return [];
  }

  const fontSize = Math.max(1, Math.round(node.content.font_size));
  const pdfY = pageHeight - y - fontSize;
  return [
    "BT",
    `/F1 ${fontSize} Tf`,
    `${pdfColorOperands(node.style.fill)} rg`,
    `${formatNumber(x)} ${formatNumber(Math.max(0, pdfY))} Td`,
    `(${pdfEscapeString(node.content.value)}) Tj`,
    "ET"
  ];
}

function pdfShadowCommands(entry: PdfShadowEntry) {
  const graphicsState = entry.graphicsStateName ? `/${entry.graphicsStateName} gs` : "";

  if (entry.node.content.type === "text") {
    const fontSize = Math.max(1, Math.round(entry.node.content.font_size));
    const x = entry.x + entry.layer.offsetX;
    const y = entry.y + entry.layer.offsetY;
    const pdfY = entry.pageHeight - y - fontSize;
    return [
      "q",
      graphicsState,
      "BT",
      `/F1 ${fontSize} Tf`,
      `${pdfRgbOperands(entry.layer.color.pdfRgb)} rg`,
      `${formatNumber(x)} ${formatNumber(Math.max(0, pdfY))} Td`,
      `(${pdfEscapeString(entry.node.content.value)}) Tj`,
      "ET",
      "Q"
    ].filter(Boolean);
  }

  const expansion = shadowExpansion(entry.layer);
  const width = Math.max(1, Math.round(entry.node.size.width + expansion * 2));
  const height = Math.max(1, Math.round(entry.node.size.height + expansion * 2));
  const x = entry.x + entry.layer.offsetX - expansion;
  const y = entry.y + entry.layer.offsetY - expansion;
  const pdfY = entry.pageHeight - y - height;
  return [
    "q",
    graphicsState,
    `${pdfRgbOperands(entry.layer.color.pdfRgb)} rg`,
    `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    "f",
    "Q"
  ].filter(Boolean);
}

function bytesFromBase64(value: string) {
  const binary = atob(normalizedBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface DecodedPng {
  width: number;
  height: number;
  rgb: Uint8Array;
  alpha?: Uint8Array;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function asciiChunkType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function pngComponentCount(colorType: number) {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 6) {
    return 4;
  }
  return 0;
}

function unfilterPngScanlines(inflated: Uint8Array, width: number, height: number, components: number) {
  const rowSize = width * components;
  const output = new Uint8Array(rowSize * height);
  const bytesPerPixel = components;
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * rowSize;
    const previousRowOffset = rowOffset - rowSize;

    for (let column = 0; column < rowSize; column += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = column >= bytesPerPixel ? output[rowOffset + column - bytesPerPixel] : 0;
      const up = row > 0 ? output[previousRowOffset + column] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel ? output[previousRowOffset + column - bytesPerPixel] : 0;
      let value = raw;

      if (filterType === 1) {
        value += left;
      } else if (filterType === 2) {
        value += up;
      } else if (filterType === 3) {
        value += Math.floor((left + up) / 2);
      } else if (filterType === 4) {
        value += paethPredictor(left, up, upLeft);
      } else if (filterType !== 0) {
        return null;
      }

      output[rowOffset + column] = value & 0xff;
    }
  }

  return output;
}

function decodePng(bytes: Uint8Array): DecodedPng | null {
  if (bytes.length < pngSignature.length || !pngSignature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatParts: Uint8Array[] = [];

  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32(bytes, offset);
    const chunkType = asciiChunkType(bytes, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + chunkLength + 4;
    if (nextOffset > bytes.length) {
      return null;
    }

    if (chunkType === "IHDR") {
      width = readUint32(bytes, dataOffset);
      height = readUint32(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      interlaceMethod = bytes[dataOffset + 12];
    } else if (chunkType === "IDAT") {
      idatParts.push(bytes.slice(dataOffset, dataOffset + chunkLength));
    } else if (chunkType === "IEND") {
      break;
    }

    offset = nextOffset;
  }

  const components = pngComponentCount(colorType);
  if (width <= 0 || height <= 0 || bitDepth !== 8 || interlaceMethod !== 0 || components === 0 || idatParts.length === 0) {
    return null;
  }

  let scanlines: Uint8Array | null = null;
  try {
    scanlines = unfilterPngScanlines(unzlibSync(concatBytes(idatParts)), width, height, components);
  } catch {
    return null;
  }
  if (!scanlines) {
    return null;
  }

  const pixelCount = width * height;
  const rgb = new Uint8Array(pixelCount * 3);
  const alpha = colorType === 4 || colorType === 6 ? new Uint8Array(pixelCount) : undefined;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * components;
    const target = pixel * 3;

    if (colorType === 0) {
      rgb[target] = scanlines[source];
      rgb[target + 1] = scanlines[source];
      rgb[target + 2] = scanlines[source];
    } else if (colorType === 2) {
      rgb[target] = scanlines[source];
      rgb[target + 1] = scanlines[source + 1];
      rgb[target + 2] = scanlines[source + 2];
    } else if (colorType === 4) {
      rgb[target] = scanlines[source];
      rgb[target + 1] = scanlines[source];
      rgb[target + 2] = scanlines[source];
      if (alpha) {
        alpha[pixel] = scanlines[source + 1];
      }
    } else if (colorType === 6) {
      rgb[target] = scanlines[source];
      rgb[target + 1] = scanlines[source + 1];
      rgb[target + 2] = scanlines[source + 2];
      if (alpha) {
        alpha[pixel] = scanlines[source + 3];
      }
    }
  }

  return { width, height, rgb, alpha };
}

function pdfAssetFileName(node: RendererNode, asset: NodeArtifactAsset) {
  const extension = asset.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  return asset.name?.trim() || `${node.id}-${asset.assetId}.${extension}`;
}

function collectPdfEntries(
  node: RendererNode,
  options: NodeArtifactOptions,
  pageHeight: number,
  originX: number,
  originY: number,
  entries: PdfEntry[],
  isRoot = false
) {
  const x = isRoot ? originX : originX + node.transform.x;
  const y = isRoot ? originY : originY + node.transform.y;
  const imageAsset = imageAssetForNode(node, options);
  const clipCommands = pdfClipCommandsForNode(node, pageHeight, x, y);

  if (clipCommands) {
    entries.push({ type: "commands", commands: clipCommands, clipOpacity: pdfClipOpacityForNode(node) ?? undefined });
  }

  if (node.kind !== "group") {
    for (const layer of shadowLayersForNode(node)) {
      entries.push({ type: "shadow", node, layer, x, y, pageHeight });
    }
  }

  if (node.content.type === "text") {
    entries.push({ type: "commands", commands: pdfTextCommands(node, pageHeight, x, y) });
  } else if (imageAsset) {
    entries.push({ type: "image", node, asset: imageAsset, x, y, pageHeight });
  } else if (node.kind !== "group") {
    const fillGradient = pdfFillGradientForNode(node);
    if (fillGradient) {
      entries.push({ type: "gradientFill", node, ...fillGradient, x, y, pageHeight });
      const strokeCommands = pdfStrokeCommands(node, pageHeight, x, y);
      if (strokeCommands.length > 0) {
        entries.push({ type: "commands", commands: strokeCommands });
      }
    } else {
      entries.push({ type: "commands", commands: pdfRectCommands(node, pageHeight, x, y) });
    }
  }

  for (const child of node.children) {
    collectPdfEntries(child, options, pageHeight, x, y, entries);
  }

  if (clipCommands) {
    entries.push({ type: "commands", commands: ["Q"] });
  }
}

function addPdfObject(objects: PdfObject[], parts: PdfPart | PdfPart[]) {
  objects.push({ parts: Array.isArray(parts) ? parts : [parts] });
  return objects.length;
}

function setPdfObject(objects: PdfObject[], id: number, parts: PdfPart | PdfPart[]) {
  objects[id - 1] = { parts: Array.isArray(parts) ? parts : [parts] };
}

function pdfImageCommands(entry: PdfImageEntry) {
  const width = Math.max(1, Math.round(entry.node.size.width));
  const height = Math.max(1, Math.round(entry.node.size.height));
  const pdfY = entry.pageHeight - entry.y - height;

  if (!entry.xObjectName) {
    return pdfRectCommands(entry.node, entry.pageHeight, entry.x, entry.y);
  }

  return ["q", `${width} 0 0 ${height} ${formatNumber(entry.x)} ${formatNumber(pdfY)} cm`, `/${entry.xObjectName} Do`, "Q"];
}

function contentForPdfEntries(entries: PdfEntry[]) {
  return [
    ...entries.flatMap((entry) => {
      if (entry.type === "commands") {
        return entry.graphicsStateName ? [...entry.commands, `/${entry.graphicsStateName} gs`] : entry.commands;
      }
      if (entry.type === "shadow") {
        return pdfShadowCommands(entry);
      }
      if (entry.type === "gradientFill") {
        return pdfGradientFillCommands(entry);
      }
      return pdfImageCommands(entry);
    }),
    ""
  ].join("\n");
}

function encodePdfPart(part: PdfPart) {
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
    objectChunks.forEach((chunk) => {
      chunks.push(chunk);
      byteOffset += chunk.length;
    });
  });

  const xrefOffset = byteOffset;
  const xrefRows = ["0000000000 65535 f ", ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)];
  const trailer = [
    "xref",
    `0 ${objects.length + 1}`,
    ...xrefRows,
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    ""
  ].join("\n");
  chunks.push(encodePdfPart(trailer));

  return concatPdfParts(chunks);
}

export function pdfForNode(node: RendererNode, options: NodeArtifactOptions = {}) {
  const bounds = exportBoundsForNode(node);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const escapedName = pdfEscapeString(node.name);
  const escapedNodeId = pdfEscapeString(node.id);
  const entries: PdfEntry[] = [];
  collectPdfEntries(node, options, height, -bounds.minX, -bounds.minY, entries, true);

  const objects: PdfObject[] = [];
  const catalogId = addPdfObject(objects, "");
  const pagesId = addPdfObject(objects, "");
  const pageId = addPdfObject(objects, "");
  const contentId = addPdfObject(objects, "");
  const infoId = addPdfObject(objects, "");
  const fontId = addPdfObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const imageEntries = entries.filter((entry): entry is PdfImageEntry => entry.type === "image");
  imageEntries.forEach((entry, index) => {
    const assetBytes = bytesFromBase64(entry.asset.dataBase64);
    const fileName = pdfAssetFileName(entry.node, entry.asset);
    const embeddedFileId = addPdfObject(objects, [
      `<< /Type /EmbeddedFile /Subtype /${pdfName(entry.asset.mimeType)} /Length ${assetBytes.length} >>\nstream\n`,
      assetBytes,
      "\nendstream"
    ]);
    entry.fileSpecId = addPdfObject(
      objects,
      `<< /Type /Filespec /F (${pdfEscapeString(fileName)}) /UF (${pdfEscapeString(fileName)}) /EF << /F ${embeddedFileId} 0 R >> /Desc (Layo asset ${pdfEscapeString(
        entry.asset.assetId
      )}) >>`
    );

    const previewBytes = entry.asset.pdfPreviewPngBase64 ? bytesFromBase64(entry.asset.pdfPreviewPngBase64) : null;
    const png = entry.asset.mimeType === "image/png" ? decodePng(assetBytes) : previewBytes ? decodePng(previewBytes) : null;
    if (png) {
      entry.xObjectName = `Im${index + 1}`;
      const rgbBytes = zlibSync(png.rgb);
      if (png.alpha) {
        const alphaBytes = zlibSync(png.alpha);
        entry.sMaskId = addPdfObject(objects, [
          `<< /Type /XObject /Subtype /Image /Width ${png.width} /Height ${png.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alphaBytes.length} >>\nstream\n`,
          alphaBytes,
          "\nendstream"
        ]);
      }
      const sMaskClause = entry.sMaskId ? ` /SMask ${entry.sMaskId} 0 R` : "";
      entry.xObjectId = addPdfObject(objects, [
        `<< /Type /XObject /Subtype /Image /Width ${png.width} /Height ${png.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${sMaskClause} /Length ${rgbBytes.length} >>\nstream\n`,
        rgbBytes,
        "\nendstream"
      ]);
    } else if (entry.asset.mimeType === "image/jpeg") {
      entry.xObjectName = `Im${index + 1}`;
      entry.xObjectId = addPdfObject(objects, [
        `<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(
          entry.node.content.type === "image" ? (entry.node.content.natural_width ?? entry.node.size.width) : entry.node.size.width
        ))} /Height ${Math.max(1, Math.round(
          entry.node.content.type === "image" ? (entry.node.content.natural_height ?? entry.node.size.height) : entry.node.size.height
        ))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${assetBytes.length} >>\nstream\n`,
        assetBytes,
        "\nendstream"
      ]);
    }
  });

  const shadowEntries = entries.filter((entry): entry is PdfShadowEntry => entry.type === "shadow");
  shadowEntries.forEach((entry, index) => {
    entry.graphicsStateName = `Gs${index + 1}`;
    entry.graphicsStateId = addPdfObject(
      objects,
      `<< /Type /ExtGState /ca ${formatNumber(entry.layer.color.opacity)} /CA ${formatNumber(entry.layer.color.opacity)} >>`
    );
  });

  const clipOpacityEntries = entries.filter(
    (entry): entry is PdfCommandEntry => entry.type === "commands" && typeof entry.clipOpacity === "number"
  );
  clipOpacityEntries.forEach((entry, index) => {
    entry.graphicsStateName = `MaskGs${index + 1}`;
    entry.graphicsStateId = addPdfObject(
      objects,
      `<< /Type /ExtGState /ca ${formatNumber(entry.clipOpacity ?? 1)} /CA ${formatNumber(entry.clipOpacity ?? 1)} >>`
    );
  });

  const gradientEntries = entries.filter((entry): entry is PdfGradientFillEntry => entry.type === "gradientFill");
  gradientEntries.forEach((entry, index) => {
    entry.shadingName = `Sh${index + 1}`;
    entry.shadingId = addPdfObject(objects, pdfGradientShadingObject(entry));
    const opacity = pdfGradientFillOpacity(entry);
    if (typeof opacity === "number") {
      entry.graphicsStateName = `PaintGs${index + 1}`;
      entry.graphicsStateId = addPdfObject(objects, `<< /Type /ExtGState /ca ${formatNumber(opacity)} /CA ${formatNumber(opacity)} >>`);
    }
  });

  const content = contentForPdfEntries(entries);
  const contentBytes = new TextEncoder().encode(content);
  const embeddedFileNames = imageEntries
    .filter((entry) => entry.fileSpecId)
    .map((entry) => `(${pdfEscapeString(pdfAssetFileName(entry.node, entry.asset))}) ${entry.fileSpecId} 0 R`);
  const namesClause = embeddedFileNames.length > 0 ? ` /Names << /EmbeddedFiles << /Names [${embeddedFileNames.join(" ")}] >> >>` : "";
  const xObjectEntries = imageEntries
    .filter((entry) => entry.xObjectName && entry.xObjectId)
    .map((entry) => `/${entry.xObjectName} ${entry.xObjectId} 0 R`);
  const xObjectClause = xObjectEntries.length > 0 ? ` /XObject << ${xObjectEntries.join(" ")} >>` : "";
  const shadingEntries = gradientEntries
    .filter((entry) => entry.shadingName && entry.shadingId)
    .map((entry) => `/${entry.shadingName} ${entry.shadingId} 0 R`);
  const shadingClause = shadingEntries.length > 0 ? ` /Shading << ${shadingEntries.join(" ")} >>` : "";
  const extGStateEntries = [
    ...shadowEntries
      .filter((entry) => entry.graphicsStateName && entry.graphicsStateId)
      .map((entry) => `/${entry.graphicsStateName} ${entry.graphicsStateId} 0 R`),
    ...clipOpacityEntries
      .filter((entry) => entry.graphicsStateName && entry.graphicsStateId)
      .map((entry) => `/${entry.graphicsStateName} ${entry.graphicsStateId} 0 R`),
    ...gradientEntries
      .filter((entry) => entry.graphicsStateName && entry.graphicsStateId)
      .map((entry) => `/${entry.graphicsStateName} ${entry.graphicsStateId} 0 R`)
  ];
  const extGStateClause = extGStateEntries.length > 0 ? ` /ExtGState << ${extGStateEntries.join(" ")} >>` : "";

  setPdfObject(objects, catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${namesClause} >>`);
  setPdfObject(objects, pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  setPdfObject(
    objects,
    pageId,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontId} 0 R >>${xObjectClause}${shadingClause}${extGStateClause} >> /Contents ${contentId} 0 R >>`
  );
  setPdfObject(objects, contentId, [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "endstream"]);
  setPdfObject(objects, infoId, `<< /Title (${escapedName}) /Subject (${escapedNodeId}) /Creator (Layo) >>`);

  return buildPdf(objects);
}
