import { apiUrl } from "./api-base";

export interface ProjectDocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSharing =
  | { mode: "private" }
  | { mode: "team"; teamId: string };

export interface ProjectRequestCredentials {
  userId: string;
  memberToken: string;
}

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDocumentId: string;
  documents: ProjectDocumentSummary[];
  sharing: ProjectSharing;
}

export interface ProjectArchiveReviewDocument {
  originalFileId: string;
  originalName: string;
  pageCount: number;
  nodeCount: number;
}

export interface ProjectArchiveReview {
  originalProjectId: string;
  originalName: string;
  suggestedName: string;
  documentCount: number;
  assetCount: number;
  documents: ProjectArchiveReviewDocument[];
}

export interface ImportedProjectArchive {
  project: ProjectManifest;
  originalProjectId: string;
  originalName: string;
  documentCount: number;
  assetCount: number;
  documentIdMap: Record<string, string>;
}

export interface ImportProjectArchiveInput {
  archiveBase64: string;
  projectId?: string;
  name?: string;
  documentIdPrefix?: string;
}

export interface ExportedProjectArchiveDownload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export async function fetchProjects(fetcher: typeof fetch = fetch): Promise<ProjectManifest[]> {
  const response = await fetcher(apiUrl("/projects"));
  const payload = await readJson(response);
  return (payload as { projects: ProjectManifest[] }).projects;
}

export async function createProject(
  input: { name?: string; projectId?: string; documentId?: string; documentName?: string },
  fetcher: typeof fetch = fetch
): Promise<ProjectManifest> {
  return writeProject(apiUrl("/projects"), "POST", input, fetcher);
}

export async function updateProject(
  projectId: string,
  input: { name?: string; currentDocumentId?: string },
  fetcher: typeof fetch = fetch,
  credentials?: ProjectRequestCredentials
): Promise<ProjectManifest> {
  return writeProject(
    apiUrl(`/projects/${projectId}`),
    "PATCH",
    input,
    fetcher,
    credentials
  );
}

export async function duplicateProject(
  projectId: string,
  input: { projectId?: string; name?: string; documentIdPrefix?: string },
  fetcher: typeof fetch = fetch,
  credentials?: ProjectRequestCredentials
): Promise<ProjectManifest> {
  return writeProject(
    apiUrl(`/projects/${projectId}/duplicate`),
    "POST",
    input,
    fetcher,
    credentials
  );
}

export async function setProjectSharing(
  projectId: string,
  sharing: ProjectSharing,
  fetcher: typeof fetch = fetch,
  credentials?: ProjectRequestCredentials
): Promise<ProjectManifest> {
  return writeProject(
    apiUrl(`/projects/${projectId}/sharing`),
    "PATCH",
    sharing,
    fetcher,
    credentials
  );
}

export async function deleteProject(
  projectId: string,
  fetcher: typeof fetch = fetch,
  credentials?: ProjectRequestCredentials
): Promise<ProjectManifest> {
  return writeProject(
    apiUrl(`/projects/${projectId}`),
    "DELETE",
    undefined,
    fetcher,
    credentials
  );
}

export async function reviewProjectArchive(
  archiveBase64: string,
  fetcher: typeof fetch = fetch
): Promise<ProjectArchiveReview> {
  const response = await fetcher(apiUrl("/projects/import/archive/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archiveBase64 })
  });
  const payload = await readJson(response);
  return (payload as { review: ProjectArchiveReview }).review;
}

export async function importProjectArchive(
  input: ImportProjectArchiveInput,
  fetcher: typeof fetch = fetch
): Promise<ImportedProjectArchive> {
  const response = await fetcher(apiUrl("/projects/import/archive"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readJson(response);
  return (payload as { imported: ImportedProjectArchive }).imported;
}

export async function exportProjectArchive(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<ExportedProjectArchiveDownload> {
  const response = await fetcher(apiUrl(`/projects/${projectId}/export/archive`));
  if (!response.ok) {
    throw new Error(`프로젝트 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  const mimeType = response.headers.get("Content-Type") ?? "application/vnd.layo.project-archive+zip";
  const fileName =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    `${projectId}.layo-project.zip`;
  return {
    blob: await response.blob(),
    fileName,
    mimeType
  };
}

async function writeProject(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  fetcher: typeof fetch,
  credentials?: ProjectRequestCredentials
): Promise<ProjectManifest> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const userId = credentials?.userId.trim();
  const memberToken = credentials?.memberToken.trim();
  if (userId && memberToken) {
    headers["x-layo-user-id"] = userId;
    headers.Authorization = `Bearer ${memberToken}`;
  }
  const init: RequestInit = {
    method,
    ...(Object.keys(headers).length > 0 ? { headers } : {})
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetcher(url, init);
  const payload = await readJson(response);
  return (payload as { project: ProjectManifest }).project;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`프로젝트 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

function parseContentDispositionFilename(header: string | null): string | null {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
