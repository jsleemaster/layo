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

export type CommentMentionTargetRole = "owner" | "editor" | "viewer";

export interface CommentMentionTarget {
  userId: string;
  displayName: string;
  role: CommentMentionTargetRole;
}

export interface CommentThread {
  schemaVersion: 1;
  threadId: string;
  fileId: string;
  nodeId: string;
  nodeName: string;
  body: string;
  authorName: string;
  createdAt: string;
  resolvedAt: string | null;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
  readBy: string[];
  unread?: boolean;
  replies: CommentReply[];
}

export interface CommentReply {
  schemaVersion: 1;
  replyId: string;
  body: string;
  authorName: string;
  createdAt: string;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
}

export interface CommentNotificationFileSummary {
  fileId: string;
  name: string;
  unreadCount: number;
  mentionCount: number;
}

export interface CommentNotificationProjectSummary {
  projectId: string;
  name: string;
  unreadCount: number;
  mentionCount: number;
  files: CommentNotificationFileSummary[];
}

export interface CommentNotificationSummary {
  viewerId: string;
  totalUnread: number;
  totalMentions: number;
  projects: CommentNotificationProjectSummary[];
}

export type CommentActivityType = "created" | "replied" | "resolved";

export interface CommentActivityEvent {
  schemaVersion: 1;
  eventId: string;
  type: CommentActivityType;
  projectId: string;
  projectName: string;
  fileId: string;
  fileName: string;
  threadId: string;
  replyId?: string;
  nodeId: string;
  nodeName: string;
  actorName: string;
  body: string;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
  createdAt: string;
}

export interface CommentActivityFeed {
  viewerId: string;
  events: CommentActivityEvent[];
}

export interface CreateCommentThreadInput {
  nodeId: string;
  body: string;
  authorName?: string;
  mentionTargets?: CommentMentionTarget[];
}

export interface CreateCommentReplyInput {
  body: string;
  authorName?: string;
  mentionTargets?: CommentMentionTarget[];
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

export async function listCommentThreads(
  fileId: string,
  includeResolved = false,
  fetcher: typeof fetch = fetch,
  viewerId?: string
): Promise<CommentThread[]> {
  const params = new URLSearchParams();
  if (includeResolved) {
    params.set("includeResolved", "true");
  }
  if (viewerId?.trim()) {
    params.set("viewerId", viewerId);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetcher(apiUrl(`/files/${fileId}/comments${query}`));
  const payload = await readDocumentJson(response);
  return (payload as { threads: CommentThread[] }).threads;
}

export async function createCommentThread(
  fileId: string,
  input: CreateCommentThreadInput,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function addCommentReply(
  fileId: string,
  threadId: string,
  input: CreateCommentReplyInput,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/replies`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function resolveCommentThread(
  fileId: string,
  threadId: string,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/resolve`), {
    method: "POST"
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function markCommentThreadRead(
  fileId: string,
  threadId: string,
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/read`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function listCommentNotifications(
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentNotificationSummary> {
  const params = new URLSearchParams();
  if (viewerId.trim()) {
    params.set("viewerId", viewerId);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetcher(apiUrl(`/comments/notifications${query}`));
  const payload = await readDocumentJson(response);
  return (payload as { summary: CommentNotificationSummary }).summary;
}

export async function listCommentActivity(
  viewerId = "사용자",
  limit = 10,
  fetcher: typeof fetch = fetch
): Promise<CommentActivityFeed> {
  const params = new URLSearchParams();
  if (viewerId.trim()) {
    params.set("viewerId", viewerId);
  }
  params.set("limit", String(limit));
  const response = await fetcher(apiUrl(`/comments/activity?${params.toString()}`));
  const payload = await readDocumentJson(response);
  return (payload as { feed: CommentActivityFeed }).feed;
}

export async function markFileCommentsRead(
  fileId: string,
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentThread[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/read`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { threads: CommentThread[] }).threads;
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
