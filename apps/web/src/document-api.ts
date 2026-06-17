import type { RendererDocument } from "@canvas-mcp-editor/renderer";

export function parseDocumentPayload(payload: unknown): RendererDocument {
  if (!payload || typeof payload !== "object" || !("file" in payload)) {
    throw new Error("문서 응답에 파일이 없습니다");
  }

  return (payload as { file: RendererDocument }).file;
}
