import type { NodeExportPreset, RendererNode } from "@layo/renderer";

export interface ExportPresetReviewItem {
  key: string;
  nodeId: string;
  nodeName: string;
  presetId: string;
  format: NodeExportPreset["format"];
  scale: number;
  suffix: string;
  filename: string;
  label: string;
}

export function exportPresetExtension(format: NodeExportPreset["format"]) {
  return format === "jpeg" ? "jpg" : format;
}

export function buildExportPresetReviewItems(nodes: RendererNode[]): ExportPresetReviewItem[] {
  return nodes.flatMap((node) =>
    (node.export_presets ?? []).map((preset) => ({
      key: `${node.id}:${preset.id}`,
      nodeId: node.id,
      nodeName: node.name,
      presetId: preset.id,
      format: preset.format,
      scale: preset.scale,
      suffix: preset.suffix,
      filename: `${node.id}${preset.suffix}.${exportPresetExtension(preset.format)}`,
      label: `${node.name} ${preset.format.toUpperCase()} ${preset.scale}x`
    }))
  );
}
