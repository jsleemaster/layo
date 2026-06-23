import type { ImageFitMode } from "@layo/renderer";

export interface ImageDrawConfigInput {
  mode: ImageFitMode;
  nodeWidth: number;
  nodeHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface ImageDrawConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function calculateImageDrawConfig(input: ImageDrawConfigInput): ImageDrawConfig {
  const nodeWidth = Math.max(1, input.nodeWidth);
  const nodeHeight = Math.max(1, input.nodeHeight);
  const naturalWidth = Math.max(1, input.naturalWidth);
  const naturalHeight = Math.max(1, input.naturalHeight);

  if (input.mode === "fit") {
    const scale = Math.min(nodeWidth / naturalWidth, nodeHeight / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;

    return {
      x: Math.round((nodeWidth - width) / 2),
      y: Math.round((nodeHeight - height) / 2),
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  const nodeRatio = nodeWidth / nodeHeight;
  const naturalRatio = naturalWidth / naturalHeight;
  let cropWidth = naturalWidth;
  let cropHeight = naturalHeight;
  let cropX = 0;
  let cropY = 0;

  if (naturalRatio > nodeRatio) {
    cropWidth = naturalHeight * nodeRatio;
    cropX = (naturalWidth - cropWidth) / 2;
  } else if (naturalRatio < nodeRatio) {
    cropHeight = naturalWidth / nodeRatio;
    cropY = (naturalHeight - cropHeight) / 2;
  }

  return {
    x: 0,
    y: 0,
    width: nodeWidth,
    height: nodeHeight,
    crop: {
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight)
    }
  };
}
