export const editorTokenNames = {
  colors: [
    "--editor-color-app",
    "--editor-color-panel",
    "--editor-color-stage",
    "--editor-color-ink",
    "--editor-color-muted",
    "--editor-color-border",
    "--editor-color-focus",
    "--editor-color-selection",
    "--editor-color-selection-soft",
    "--editor-color-mcp",
    "--editor-color-warning"
  ],
  spacing: [
    "--editor-space-xxs",
    "--editor-space-xs",
    "--editor-space-sm",
    "--editor-space-md",
    "--editor-space-lg",
    "--editor-space-xl"
  ],
  radii: ["--editor-radius-xs", "--editor-radius-sm", "--editor-radius-md", "--editor-radius-lg"]
} as const;

export const editorKonvaTokens = {
  stage: {
    width: 960,
    height: 640
  },
  radius: {
    none: 0,
    frame: 8
  },
  selection: {
    strokeWidth: 2,
    handleSize: 10,
    resizeHitSize: 64,
    stroke: "#6d5efc",
    handleFill: "#ffffff"
  },
  image: {
    placeholderFill: "#eef2f6"
  }
} as const;
