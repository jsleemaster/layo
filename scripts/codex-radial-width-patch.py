from pathlib import Path

path = Path("apps/web/src/node-artifacts.ts")
content = path.read_text()

old_radius_block = '''function svgRadialGradientRadius(gradient: NodePaintGradient) {
  const start = gradient.start ?? { x: 0.5, y: 0.5 };
  const end = gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const radius = Math.hypot(endX - startX, endY - startY);
  return radius > 0 ? radius : 0.5;
}

function svgGradientLinesForGradient(node: RendererNode, paintGradient: SvgGradient, depth: number): string[] {
'''
new_radius_block = '''function svgRadialGradientRadius(gradient: NodePaintGradient) {
  const start = gradient.start ?? { x: 0.5, y: 0.5 };
  const end = gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const radius = Math.hypot(endX - startX, endY - startY);
  return radius > 0 ? radius : 0.5;
}

function svgRadialGradientTransform(gradient: NodePaintGradient) {
  const width = typeof gradient.width === "number" && Number.isFinite(gradient.width) && gradient.width > 0 ? gradient.width : 1;
  if (Math.abs(width - 1) < 0.0005) {
    return "";
  }

  const start = gradient.start ?? { x: 0.5, y: 0.5 };
  const end = gradient.end ?? { x: 1, y: 0.5 };
  const startX = gradientCoordinateUnit(start.x, 0.5);
  const startY = gradientCoordinateUnit(start.y, 0.5);
  const endX = gradientCoordinateUnit(end.x, startX + 0.5);
  const endY = gradientCoordinateUnit(end.y, startY);
  const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI + 90;
  const center = `${gradientCoordinatePercent(startX)} ${gradientCoordinatePercent(startY)}`;

  return ` gradientTransform="translate(${center}) rotate(${formatNumber(angle)}) scale(${formatNumber(
    width
  )} 1) translate(-${gradientCoordinatePercent(startX)} -${gradientCoordinatePercent(startY)})"`;
}

function svgGradientLinesForGradient(node: RendererNode, paintGradient: SvgGradient, depth: number): string[] {
'''
if old_radius_block not in content:
    raise SystemExit("Expected radial radius block not found")
content = content.replace(old_radius_block, new_radius_block, 1)

old_radial_lines = '''  if (paintGradient.type === "radial") {
    const center = paintGradient.gradient.start ?? { x: 0.5, y: 0.5 };
    return [
      indent(
        `<radialGradient id="${svgGradientIdForNode(node, paintGradient.source)}" cx="${gradientCoordinatePercent(
          gradientCoordinateUnit(center.x, 0.5)
        )}" cy="${gradientCoordinatePercent(gradientCoordinateUnit(center.y, 0.5))}" r="${gradientCoordinatePercent(
          svgRadialGradientRadius(paintGradient.gradient)
        )}">`,
        depth
      ),
'''
new_radial_lines = '''  if (paintGradient.type === "radial") {
    const center = paintGradient.gradient.start ?? { x: 0.5, y: 0.5 };
    const transform = svgRadialGradientTransform(paintGradient.gradient);
    return [
      indent(
        `<radialGradient id="${svgGradientIdForNode(node, paintGradient.source)}" cx="${gradientCoordinatePercent(
          gradientCoordinateUnit(center.x, 0.5)
        )}" cy="${gradientCoordinatePercent(gradientCoordinateUnit(center.y, 0.5))}" r="${gradientCoordinatePercent(
          svgRadialGradientRadius(paintGradient.gradient)
        )}"${transform}>`,
        depth
      ),
'''
if old_radial_lines not in content:
    raise SystemExit("Expected radial gradient lines block not found")
content = content.replace(old_radial_lines, new_radial_lines, 1)

path.write_text(content)
