import type { RendererDocument } from "@canvas-mcp-editor/renderer";

export function parseDocumentPayload(payload: unknown): RendererDocument {
  if (!payload || typeof payload !== "object" || !("file" in payload)) {
    throw new Error("Document payload is missing file");
  }

  return (payload as { file: RendererDocument }).file;
}
