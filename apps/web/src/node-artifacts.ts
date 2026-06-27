import type { RendererNode } from "@layo/renderer";

export interface NodeArtifactAsset {
  assetId: string;
  mimeType: string;
  dataBase64: string;
  name?: string;
}

export interface NodeArtifactOptions {
  assets?: Record<string, NodeArtifactAsset | undefined>;
}

type PdfPart = string | Uint8Array;

interface PdfObject {
  parts: PdfPart[];
}

interface PdfCommandEntry {
  type: "commands";
  commands: string[];
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
  fileSpecId?: number;
}

type PdfEntry = PdfCommandEntry | PdfImageEntry;

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

function normalizedBase64(value: string) {
  return value.replace(/\s+/g, "");
}

function assetDataUrl(asset: NodeArtifactAsset) {
  return `data:${escapeSvgText(asset.mimeType)};base64,${normalizedBase64(asset.dataBase64)}`;
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
  const fitMode = node.content.fit_mode ?? "fill";
  const preserveAspectRatio = fitMode === "fit" ? "xMidYMid meet" : "xMidYMid slice";
  return `<image ${svgNodeAttributes(node)} data-image-asset-id="${escapeSvgText(
    node.content.asset_id
  )}" x="0" y="0" width="${width}" height="${height}" href="${assetDataUrl(asset)}" preserveAspectRatio="${preserveAspectRatio}"${opacity} />`;
}

function svgSelfForNode(node: RendererNode, options: NodeArtifactOptions) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const fill = escapeSvgText(node.style.fill);
  const opacity = svgOpacityAttribute(node.style.opacity);

  if (node.content.type === "text") {
    const fontSize = Math.max(1, Math.round(node.content.font_size));
    return `<text ${svgNodeAttributes(node)} x="0" y="${fontSize}" fill="${fill}" font-family="${escapeSvgText(
      node.content.font_family
    )}" font-size="${fontSize}"${opacity}>${escapeSvgText(node.content.value)}</text>`;
  }

  const imageAsset = imageAssetForNode(node, options);
  if (imageAsset) {
    return svgImageForNode(node, imageAsset);
  }

  if (node.kind === "group") {
    return null;
  }

  const assetAttribute = node.content.type === "image" ? ` data-image-asset-id="${escapeSvgText(node.content.asset_id)}"` : "";
  return `<rect ${svgNodeAttributes(node)}${assetAttribute} x="0" y="0" width="${width}" height="${height}" rx="0" fill="${fill}" stroke="${
    node.style.stroke ? escapeSvgText(node.style.stroke) : "none"
  }" stroke-width="${Math.max(0, Math.round(node.style.stroke_width))}"${opacity} />`;
}

function indent(line: string, depth: number) {
  return `${"  ".repeat(depth)}${line}`;
}

function svgLinesForNode(node: RendererNode, options: NodeArtifactOptions, depth: number, isRoot = false): string[] {
  const lines: string[] = [];
  if (!isRoot) {
    lines.push(indent(`<g ${svgNodeAttributes(node)} transform="${svgNodeTransform(node)}">`, depth));
  }

  const self = svgSelfForNode(node, options);
  if (self) {
    lines.push(indent(self, isRoot ? depth : depth + 1));
  }

  for (const child of node.children) {
    lines.push(...svgLinesForNode(child, options, isRoot ? depth : depth + 1));
  }

  if (!isRoot) {
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
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const nodeId = escapeSvgText(node.id);
  const nodeName = escapeSvgText(node.name);
  const title = `<title>${nodeName}</title>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-node-id="${nodeId}" data-node-name="${nodeName}" role="img" aria-label="${nodeName}">`,
    `  ${title}`,
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

function pdfRectCommands(node: RendererNode, pageHeight: number, x: number, y: number) {
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const pdfY = pageHeight - y - height;
  const commands = ["q", `${pdfColorOperands(node.style.fill)} rg`, `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`, "f", "Q"];

  if (node.style.stroke && node.style.stroke_width > 0) {
    commands.push(
      "q",
      `${pdfColorOperands(node.style.stroke)} RG`,
      `${formatNumber(Math.max(0, node.style.stroke_width))} w`,
      `${formatNumber(x)} ${formatNumber(pdfY)} ${width} ${height} re`,
      "S",
      "Q"
    );
  }

  return commands;
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

function bytesFromBase64(value: string) {
  const binary = atob(normalizedBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

  if (node.content.type === "text") {
    entries.push({ type: "commands", commands: pdfTextCommands(node, pageHeight, x, y) });
  } else if (imageAsset) {
    entries.push({ type: "image", node, asset: imageAsset, x, y, pageHeight });
  } else if (node.kind !== "group") {
    entries.push({ type: "commands", commands: pdfRectCommands(node, pageHeight, x, y) });
  }

  for (const child of node.children) {
    collectPdfEntries(child, options, pageHeight, x, y, entries);
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
    ...entries.flatMap((entry) => (entry.type === "commands" ? entry.commands : pdfImageCommands(entry))),
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
  const width = Math.max(1, Math.round(node.size.width));
  const height = Math.max(1, Math.round(node.size.height));
  const escapedName = pdfEscapeString(node.name);
  const escapedNodeId = pdfEscapeString(node.id);
  const entries: PdfEntry[] = [];
  collectPdfEntries(node, options, height, 0, 0, entries, true);

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

    if (entry.asset.mimeType === "image/jpeg") {
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

  setPdfObject(objects, catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${namesClause} >>`);
  setPdfObject(objects, pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  setPdfObject(
    objects,
    pageId,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontId} 0 R >>${xObjectClause} >> /Contents ${contentId} 0 R >>`
  );
  setPdfObject(objects, contentId, [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "endstream"]);
  setPdfObject(objects, infoId, `<< /Title (${escapedName}) /Subject (${escapedNodeId}) /Creator (Layo) >>`);

  return buildPdf(objects);
}
