import type { RendererDocument } from "@layo/renderer";
import { apiUrl } from "./api-base";

export interface FileVersionSummary {
  schemaVersion: 1;
  versionId: string;
  fileId: string;
  name: string;
  message: string;
  source: "manual" | "restore" | "auto";
  createdAt: string;
  nodeCount: number;
}

export interface FileVersion extends FileVersionSummary {
  document: RendererDocument;
}

export interface RestoreFileVersionResult {
  file: RendererDocument;
  restoredVersion: FileVersionSummary;
  recoveryVersion: FileVersionSummary;
}

export interface FileVersionChangeSummary {
  createdNodeIds: string[];
  updatedNodeIds: string[];
  removedNodeIds: string[];
  unchangedNodeCount: number;
  changedNodeIds: string[];
}

export function parseDocumentPayload(payload: unknown): RendererDocument {
  if (!payload || typeof payload !== "object" || !("file" in payload)) {
    throw new Error("문서 응답에 파일이 없습니다");
  }

  return (payload as { file: RendererDocument }).file;
}

export async function exportDesignTokensDtcg(fileId: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(apiUrl(`/files/${fileId}/tokens/dtcg`));
  const payload = await readDocumentJson(response);
  return (payload as { tokens: unknown }).tokens;
}

export async function importDesignTokensDtcg(
  fileId: string,
  tokens: unknown,
  fetcher: typeof fetch = fetch
): Promise<RendererDocument> {
  const response = await fetcher(apiUrl(`/files/${fileId}/tokens/dtcg`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokens)
  });
  return parseDocumentPayload(await readDocumentJson(response));
}

export async function listFileVersions(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersionSummary[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions`));
  const payload = await readDocumentJson(response);
  return (payload as { versions: FileVersionSummary[] }).versions;
}

export async function saveFileVersion(
  fileId: string,
  message: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersionSummary> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  const payload = await readDocumentJson(response);
  return (payload as { version: FileVersionSummary }).version;
}

export async function readFileVersion(
  fileId: string,
  versionId: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersion> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}`));
  const payload = await readDocumentJson(response);
  return (payload as { version: FileVersion }).version;
}

export async function restoreFileVersion(
  fileId: string,
  versionId: string,
  fetcher: typeof fetch = fetch
): Promise<RestoreFileVersionResult> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}/restore`), {
    method: "POST"
  });
  return (await readDocumentJson(response)) as RestoreFileVersionResult;
}

export async function summarizeDocumentChanges(
  fileId: string,
  before: RendererDocument,
  after: RendererDocument,
  fetcher: typeof fetch = fetch
): Promise<FileVersionChangeSummary> {
  const response = await fetcher(apiUrl(`/files/${fileId}/agent/change-summary`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ before, after })
  });
  const payload = await readDocumentJson(response);
  return (payload as { summary: FileVersionChangeSummary }).summary;
}

async function readDocumentJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`문서 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}
