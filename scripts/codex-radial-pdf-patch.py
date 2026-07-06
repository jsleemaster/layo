from pathlib import Path

path = Path("apps/web/src/node-artifacts.ts")
content = path.read_text()

old_pdf_gradient_selectors = '''function pdfFillGradientForNode(node: RendererNode): FillGradient | null {
  const fillGradient = fillGradientForNode(node);
  if (!fillGradient || !pdfGradientStops(fillGradient.stops)) {
    return null;
  }
  return fillGradient;
}

function pdfStrokeGradientForNode(node: RendererNode): FillGradient | null {
  const strokeGradient = strokeGradientForNode(node);
  if (!node.style.stroke || node.style.stroke_width <= 0 || !strokeGradient || !pdfGradientStops(strokeGradient.stops)) {
    return null;
  }
  return strokeGradient;
}
'''
new_pdf_gradient_selectors = '''function pdfSupportsGradient(gradient: NodePaintGradient) {
  const type = normalizedGradientType(gradient);
  if (type.includes("linear")) {
    return true;
  }
  if (!type.includes("radial")) {
    return false;
  }

  const width = typeof gradient.width === "number" && Number.isFinite(gradient.width) && gradient.width > 0 ? gradient.width : 1;
  return Math.abs(width - 1) < 0.0005;
}

function pdfPaintGradientForNode(node: RendererNode, kind: "fill" | "stroke"): FillGradient | null {
  if (node.kind === "group" || node.content.type === "text") {
    return null;
  }

  const paintSources = [...(node.style.paint_sources ?? [])].sort((left, right) => left.index - right.index);
  for (const source of paintSources) {
    const gradient = source.gradient;
    if (!gradient || source.kind !== kind || source.paintType !== "gradient" || !pdfSupportsGradient(gradient)) {
      continue;
    }
    const stops = gradientStopsForGradient(gradient);
    if (stops.length >= 2 && pdfGradientStops(stops)) {
      return { source, gradient, stops };
    }
  }

  return null;
}

function pdfFillGradientForNode(node: RendererNode): FillGradient | null {
  return pdfPaintGradientForNode(node, "fill");
}

function pdfStrokeGradientForNode(node: RendererNode): FillGradient | null {
  if (!node.style.stroke || node.style.stroke_width <= 0) {
    return null;
  }
  return pdfPaintGradientForNode(node, "stroke");
}
'''
if old_pdf_gradient_selectors not in content:
    raise SystemExit("Expected PDF gradient selector block not found")
content = content.replace(old_pdf_gradient_selectors, new_pdf_gradient_selectors, 1)

old_pdf_gradient_coords = '''function pdfGradientCoords(entry: PdfGradientPaintEntry) {
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

function pdfGradientShadingObject(entry: PdfGradientPaintEntry) {
  const stops = pdfGradientStops(entry.stops) ?? [
    { offset: 0, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] },
    { offset: 1, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] }
  ];
  return `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${pdfGradientCoords(entry)}] /Function ${pdfGradientFunction(
    stops
  )} /Extend [true true] >>`;
}
'''
new_pdf_gradient_coords = '''function pdfGradientCoords(entry: PdfGradientPaintEntry) {
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

function pdfRadialGradientCoords(entry: PdfGradientPaintEntry) {
  const width = Math.max(1, Math.round(entry.node.size.width));
  const height = Math.max(1, Math.round(entry.node.size.height));
  const start = entry.gradient.start ?? { x: 0.5, y: 0.5 };
  const end = entry.gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const centerX = entry.x + width * startX;
  const centerY = entry.pageHeight - entry.y - height * startY;
  const radius = Math.hypot((endX - startX) * width, (endY - startY) * height);
  const outerRadius = radius > 0 ? radius : Math.max(width, height) / 2;
  return [centerX, centerY, 0, centerX, centerY, outerRadius].map(formatNumber).join(" ");
}

function pdfGradientShadingObject(entry: PdfGradientPaintEntry) {
  const stops = pdfGradientStops(entry.stops) ?? [
    { offset: 0, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] },
    { offset: 1, rgb: pdfRgbForColor(entry.node.style.fill) ?? [0, 0, 0] }
  ];
  const type = normalizedGradientType(entry.gradient);
  const shadingType = type.includes("radial") ? 3 : 2;
  const coords = type.includes("radial") ? pdfRadialGradientCoords(entry) : pdfGradientCoords(entry);
  return `<< /ShadingType ${shadingType} /ColorSpace /DeviceRGB /Coords [${coords}] /Function ${pdfGradientFunction(
    stops
  )} /Extend [true true] >>`;
}
'''
if old_pdf_gradient_coords not in content:
    raise SystemExit("Expected PDF gradient coords block not found")
content = content.replace(old_pdf_gradient_coords, new_pdf_gradient_coords, 1)

path.write_text(content)
