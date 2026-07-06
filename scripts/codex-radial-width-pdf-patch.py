from pathlib import Path

path = Path("apps/web/src/node-artifacts.ts")
content = path.read_text()

old_supports = '''function pdfSupportsGradient(gradient: NodePaintGradient) {
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
'''
new_supports = '''function pdfSupportsGradient(gradient: NodePaintGradient) {
  const type = normalizedGradientType(gradient);
  return type.includes("linear") || type.includes("radial");
}
'''
if old_supports not in content:
    raise SystemExit("Expected pdfSupportsGradient block not found")
content = content.replace(old_supports, new_supports, 1)

old_radial_coords = '''function pdfRadialGradientCoords(entry: PdfGradientPaintEntry) {
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
'''
new_radial_coords = '''interface PdfRadialGradientGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  width: number;
  angleRadians: number;
}

function pdfRadialGradientWidth(gradient: NodePaintGradient) {
  return typeof gradient.width === "number" && Number.isFinite(gradient.width) && gradient.width > 0 ? gradient.width : 1;
}

function pdfRadialGradientGeometry(entry: PdfGradientPaintEntry): PdfRadialGradientGeometry {
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
  const angleRadians = Math.atan2(endY - startY, endX - startX) + Math.PI / 2;

  return {
    centerX,
    centerY,
    radius: radius > 0 ? radius : Math.max(width, height) / 2,
    width: pdfRadialGradientWidth(entry.gradient),
    angleRadians
  };
}

function pdfRadialGradientUsesTransform(entry: PdfGradientPaintEntry) {
  return normalizedGradientType(entry.gradient).includes("radial") && Math.abs(pdfRadialGradientWidth(entry.gradient) - 1) >= 0.0005;
}

function pdfRadialGradientCoords(entry: PdfGradientPaintEntry) {
  const geometry = pdfRadialGradientGeometry(entry);
  if (pdfRadialGradientUsesTransform(entry)) {
    return [0, 0, 0, 0, 0, geometry.radius].map(formatNumber).join(" ");
  }
  return [geometry.centerX, geometry.centerY, 0, geometry.centerX, geometry.centerY, geometry.radius].map(formatNumber).join(" ");
}

function pdfGradientTransformCommand(entry: PdfGradientPaintEntry) {
  if (!pdfRadialGradientUsesTransform(entry)) {
    return "";
  }

  const geometry = pdfRadialGradientGeometry(entry);
  const cos = Math.cos(geometry.angleRadians);
  const sin = Math.sin(geometry.angleRadians);
  return [
    cos * geometry.width,
    sin * geometry.width,
    -sin,
    cos,
    geometry.centerX,
    geometry.centerY
  ].map(formatNumber).join(" ") + " cm";
}

function pdfGradientShadingObject(entry: PdfGradientPaintEntry) {
'''
if old_radial_coords not in content:
    raise SystemExit("Expected radial coords block not found")
content = content.replace(old_radial_coords, new_radial_coords, 1)

old_fill_commands = '''  const pdfY = entry.pageHeight - entry.y - height;
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
'''
new_fill_commands = '''  const pdfY = entry.pageHeight - entry.y - height;
  const graphicsState = entry.graphicsStateName ? `/${entry.graphicsStateName} gs` : "";
  const transform = pdfGradientTransformCommand(entry);
  return [
    "q",
    `${formatNumber(entry.x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    "W",
    "n",
    graphicsState,
    transform,
    `/${entry.shadingName} sh`,
    "Q"
  ].filter(Boolean);
}
'''
if old_fill_commands not in content:
    raise SystemExit("Expected PDF gradient fill commands block not found")
content = content.replace(old_fill_commands, new_fill_commands, 1)

old_stroke_commands = '''  const pdfY = entry.pageHeight - entry.y - height;
  const graphicsState = entry.graphicsStateName ? `/${entry.graphicsStateName} gs` : "";
  return [
    "q",
    `${formatNumber(entry.x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    innerWidth > 0 && innerHeight > 0
      ? `${formatNumber(entry.x + inset)} ${formatNumber(pdfY + inset)} ${formatNumber(innerWidth)} ${formatNumber(innerHeight)} re`
      : "",
    innerWidth > 0 && innerHeight > 0 ? "W*" : "W",
    "n",
    graphicsState,
    `/${entry.shadingName} sh`,
    "Q"
  ].filter(Boolean);
}
'''
new_stroke_commands = '''  const pdfY = entry.pageHeight - entry.y - height;
  const graphicsState = entry.graphicsStateName ? `/${entry.graphicsStateName} gs` : "";
  const transform = pdfGradientTransformCommand(entry);
  return [
    "q",
    `${formatNumber(entry.x)} ${formatNumber(pdfY)} ${width} ${height} re`,
    innerWidth > 0 && innerHeight > 0
      ? `${formatNumber(entry.x + inset)} ${formatNumber(pdfY + inset)} ${formatNumber(innerWidth)} ${formatNumber(innerHeight)} re`
      : "",
    innerWidth > 0 && innerHeight > 0 ? "W*" : "W",
    "n",
    graphicsState,
    transform,
    `/${entry.shadingName} sh`,
    "Q"
  ].filter(Boolean);
}
'''
if old_stroke_commands not in content:
    raise SystemExit("Expected PDF gradient stroke commands block not found")
content = content.replace(old_stroke_commands, new_stroke_commands, 1)

path.write_text(content)
