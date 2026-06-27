import { describe, expect, test } from "vitest";
import {
  addCommentReply,
  createCommentThread,
  listCommentActivity,
  listCommentNotifications,
  listCommentThreads,
  listFileVersions,
  markCommentThreadRead,
  markFileCommentsRead,
  parseDocumentPayload,
  readFileVersion,
  resolveCommentThread,
  restoreFileVersion,
  saveFileVersion,
  subscribeToCommentEvents,
  summarizeDocumentChanges
} from "./document-api";

describe("parseDocumentPayload", () => {
  test("returns the file from the server payload", () => {
    const document = parseDocumentPayload({
      file: {
        id: "sample-file",
        name: "샘플 파일",
        pages: []
      }
    });

    expect(document.id).toBe("sample-file");
    expect(document.name).toBe("샘플 파일");
  });

  test("summarizes document changes through the agent change-summary route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const beforeDocument = { id: "sample-file", name: "샘플 파일", pages: [] };
    const afterDocument = { id: "sample-file", name: "샘플 파일", pages: [] };
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/agent/change-summary" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          before: beforeDocument,
          after: afterDocument
        });
        return jsonResponse({
          summary: {
            createdNodeIds: ["new-node"],
            updatedNodeIds: ["text-1"],
            removedNodeIds: ["old-node"],
            unchangedNodeCount: 2,
            changedNodeIds: ["new-node", "text-1", "old-node"]
          }
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(
      summarizeDocumentChanges("sample-file", beforeDocument, afterDocument, fetcher as typeof fetch)
    ).resolves.toEqual({
      createdNodeIds: ["new-node"],
      updatedNodeIds: ["text-1"],
      removedNodeIds: ["old-node"],
      unchangedNodeCount: 2,
      changedNodeIds: ["new-node", "text-1", "old-node"]
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/agent/change-summary"), "POST"]
    ]);
  });

  test("lists unread comment notifications and marks the current file read", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const parsedUrl = new URL(String(url), "http://127.0.0.1:4317");

      if (parsedUrl.pathname === "/comments/notifications") {
        expect(parsedUrl.searchParams.get("viewerId")).toBe("사용자");
        return jsonResponse({
          summary: {
            viewerId: "사용자",
            totalUnread: 1,
            totalMentions: 1,
            projects: [
              {
                projectId: "project-1",
                name: "브랜드 리뉴얼",
                unreadCount: 1,
                mentionCount: 1,
                files: [{ fileId: "sample-file", name: "검수 문서", unreadCount: 1, mentionCount: 1 }]
              }
            ]
          }
        });
      }

      if (parsedUrl.pathname === "/files/sample-file/comments/read" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ viewerId: "사용자" });
        return jsonResponse({
          threads: [
            {
              threadId: "comment-1",
              fileId: "sample-file",
              nodeId: "text-1",
              nodeName: "헤드라인",
              body: "@민지 문구 확인 필요",
              authorName: "디자인 팀",
              createdAt: "2026-06-27T00:00:00.000Z",
              mentions: ["민지"],
              readBy: ["디자인 팀", "사용자"],
              replies: [],
              resolvedAt: null,
              unread: false
            }
          ]
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(listCommentNotifications("사용자", fetcher as typeof fetch)).resolves.toEqual({
      viewerId: "사용자",
      totalUnread: 1,
      totalMentions: 1,
      projects: [
        {
          projectId: "project-1",
          name: "브랜드 리뉴얼",
          unreadCount: 1,
          mentionCount: 1,
          files: [{ fileId: "sample-file", name: "검수 문서", unreadCount: 1, mentionCount: 1 }]
        }
      ]
    });
    await expect(markFileCommentsRead("sample-file", "사용자", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({
        threadId: "comment-1",
        unread: false,
        readBy: ["디자인 팀", "사용자"]
      })
    ]);
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/comments/notifications?viewerId="), "GET"],
      [expect.stringContaining("/files/sample-file/comments/read"), "POST"]
    ]);
  });

  test("lists retained comment activity events", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const parsedUrl = new URL(String(url), "http://127.0.0.1:4317");

      if (parsedUrl.pathname === "/comments/activity") {
        expect(parsedUrl.searchParams.get("viewerId")).toBe("사용자");
        expect(parsedUrl.searchParams.get("limit")).toBe("3");
        return jsonResponse({
          feed: {
            viewerId: "사용자",
            events: [
              {
                schemaVersion: 1,
                eventId: "activity-1",
                type: "resolved",
                projectId: "project-1",
                projectName: "브랜드 리뉴얼",
                fileId: "sample-file",
                fileName: "검수 문서",
                threadId: "comment-1",
                nodeId: "text-1",
                nodeName: "헤드라인",
                actorName: "사용자",
                body: "@민지 문구 확인 필요",
                mentions: ["민지"],
                createdAt: "2026-06-27T00:03:00.000Z"
              }
            ]
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(listCommentActivity("사용자", 3, fetcher as typeof fetch)).resolves.toEqual({
      viewerId: "사용자",
      events: [
        expect.objectContaining({
          eventId: "activity-1",
          type: "resolved",
          projectId: "project-1",
          fileName: "검수 문서",
          body: "@민지 문구 확인 필요"
        })
      ]
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/comments/activity?viewerId="), "GET"]
    ]);
  });

  test("subscribes to live comment events with EventSource", () => {
    const originalEventSource = globalThis.EventSource;
    const createdSources: FakeEventSource[] = [];
    class FakeEventSource extends EventTarget {
      closed = false;

      constructor(readonly url: string) {
        super();
        createdSources.push(this);
      }

      close() {
        this.closed = true;
      }
    }
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    try {
      const events: unknown[] = [];
      const unsubscribe = subscribeToCommentEvents({
        fileId: "sample-file",
        viewerId: "사용자",
        onCommentEvent: (event) => events.push(event)
      });

      expect(createdSources).toHaveLength(1);
      const source = createdSources[0];
      const url = new URL(source.url, "http://127.0.0.1:4317");
      expect(url.pathname).toBe("/comments/events");
      expect(url.searchParams.get("fileId")).toBe("sample-file");
      expect(url.searchParams.get("viewerId")).toBe("사용자");

      source.dispatchEvent(
        new MessageEvent("comment", {
          data: JSON.stringify({
            schemaVersion: 1,
            type: "created",
            fileId: "sample-file",
            threadId: "comment-1",
            viewerId: "사용자",
            createdAt: "2026-06-27T00:00:00.000Z"
          })
        })
      );
      expect(events).toEqual([
        {
          schemaVersion: 1,
          type: "created",
          fileId: "sample-file",
          threadId: "comment-1",
          viewerId: "사용자",
          createdAt: "2026-06-27T00:00:00.000Z"
        }
      ]);

      unsubscribe();
      expect(source.closed).toBe(true);
    } finally {
      globalThis.EventSource = originalEventSource;
    }
  });
});

describe("file version API helpers", () => {
  test("lists, saves, reads, and restores file versions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/versions" && init?.method === "POST") {
        return jsonResponse({
          version: {
            schemaVersion: 1,
            versionId: "version-1",
            fileId: "sample-file",
            name: "샘플 파일",
            message: "검토 전",
            source: "manual",
            createdAt: "2026-06-27T00:00:00.000Z",
            nodeCount: 2
          }
        });
      }
      if (pathname === "/files/sample-file/versions") {
        return jsonResponse({ versions: [{ versionId: "version-1", message: "검토 전" }] });
      }
      if (pathname === "/files/sample-file/versions/version-1" && !init?.method) {
        return jsonResponse({
          version: {
            versionId: "version-1",
            document: { id: "sample-file", name: "샘플 파일", pages: [] }
          }
        });
      }
      if (pathname === "/files/sample-file/versions/version-1/restore" && init?.method === "POST") {
        return jsonResponse({
          file: { id: "sample-file", name: "샘플 파일", pages: [] },
          restoredVersion: { versionId: "version-1" },
          recoveryVersion: { versionId: "version-2", source: "restore" }
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(listFileVersions("sample-file", fetcher as typeof fetch)).resolves.toEqual([
      { versionId: "version-1", message: "검토 전" }
    ]);
    await expect(saveFileVersion("sample-file", "검토 전", fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      message: "검토 전"
    });
    await expect(readFileVersion("sample-file", "version-1", fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      document: { id: "sample-file" }
    });
    await expect(restoreFileVersion("sample-file", "version-1", fetcher as typeof fetch)).resolves.toMatchObject({
      file: { id: "sample-file" },
      recoveryVersion: { source: "restore" }
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/versions"), "GET"],
      [expect.stringContaining("/files/sample-file/versions"), "POST"],
      [expect.stringContaining("/files/sample-file/versions/version-1"), "GET"],
      [expect.stringContaining("/files/sample-file/versions/version-1/restore"), "POST"]
    ]);
  });
});

describe("comment API helpers", () => {
  test("lists, creates, and resolves selected-node comment threads", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const target = { userId: "minji", displayName: "민지", role: "editor" } as const;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/comments" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          nodeId: "text-1",
          body: "문구 확인 필요",
          authorName: "디자인 팀",
          mentionTargets: [target]
        });
        return jsonResponse({
          thread: {
            threadId: "comment-1",
            fileId: "sample-file",
            nodeId: "text-1",
            nodeName: "헤드라인",
            body: "문구 확인 필요",
            authorName: "디자인 팀",
            createdAt: "2026-06-27T00:00:00.000Z",
            mentions: [],
            mentionTargets: [target],
            readBy: ["디자인 팀"],
            resolvedAt: null
          }
        });
      }
      if (pathname === "/files/sample-file/comments/comment-1/resolve" && init?.method === "POST") {
        return jsonResponse({
          thread: {
            threadId: "comment-1",
            fileId: "sample-file",
            nodeId: "text-1",
            nodeName: "헤드라인",
            body: "문구 확인 필요",
            authorName: "디자인 팀",
            createdAt: "2026-06-27T00:00:00.000Z",
            mentions: [],
            readBy: ["디자인 팀"],
            replies: [],
            resolvedAt: "2026-06-27T00:01:00.000Z"
          }
        });
      }
      if (pathname === "/files/sample-file/comments/comment-1/replies" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          body: "문구를 더 짧게 줄였어요",
          authorName: "개발 팀",
          mentionTargets: [target]
        });
        return jsonResponse({
          thread: {
            threadId: "comment-1",
            fileId: "sample-file",
            nodeId: "text-1",
            nodeName: "헤드라인",
            body: "문구 확인 필요",
            authorName: "디자인 팀",
            createdAt: "2026-06-27T00:00:00.000Z",
            mentions: [],
            mentionTargets: [target],
            readBy: ["디자인 팀"],
            replies: [
              {
                replyId: "reply-1",
                body: "문구를 더 짧게 줄였어요",
                authorName: "개발 팀",
                createdAt: "2026-06-27T00:02:00.000Z",
                mentions: [],
                mentionTargets: [target]
              }
            ],
            resolvedAt: null
          }
        });
      }
      if (pathname === "/files/sample-file/comments/comment-1/read" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ viewerId: "사용자" });
        return jsonResponse({
          thread: {
            threadId: "comment-1",
            fileId: "sample-file",
            nodeId: "text-1",
            nodeName: "헤드라인",
            body: "문구 확인 필요",
            authorName: "디자인 팀",
            createdAt: "2026-06-27T00:00:00.000Z",
            mentions: ["민지"],
            readBy: ["디자인 팀", "사용자"],
            replies: [],
            resolvedAt: null,
            unread: false
          }
        });
      }
      if (pathname === "/files/sample-file/comments") {
        expect(new URL(String(url), "http://127.0.0.1:4317").searchParams.get("viewerId")).toBe("사용자");
        return jsonResponse({
          threads: [
            {
              threadId: "comment-1",
              body: "@민지 문구 확인 필요",
              replies: [],
              mentions: ["민지"],
              readBy: ["디자인 팀"],
              unread: true
            }
          ]
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(listCommentThreads("sample-file", false, fetcher as typeof fetch, "사용자")).resolves.toEqual([
      {
        threadId: "comment-1",
        body: "@민지 문구 확인 필요",
        replies: [],
        mentions: ["민지"],
        readBy: ["디자인 팀"],
        unread: true
      }
    ]);
    await expect(
      createCommentThread(
        "sample-file",
        { nodeId: "text-1", body: "문구 확인 필요", authorName: "디자인 팀", mentionTargets: [target] },
        fetcher as typeof fetch
      )
    ).resolves.toMatchObject({
      threadId: "comment-1",
      nodeId: "text-1",
      mentionTargets: [target],
      resolvedAt: null
    });
    await expect(resolveCommentThread("sample-file", "comment-1", fetcher as typeof fetch)).resolves.toMatchObject({
      threadId: "comment-1",
      resolvedAt: "2026-06-27T00:01:00.000Z"
    });
    await expect(
      addCommentReply(
        "sample-file",
        "comment-1",
        { body: "문구를 더 짧게 줄였어요", authorName: "개발 팀", mentionTargets: [target] },
        fetcher as typeof fetch
      )
    ).resolves.toMatchObject({
      threadId: "comment-1",
      replies: [expect.objectContaining({ body: "문구를 더 짧게 줄였어요", mentionTargets: [target] })]
    });
    await expect(
      markCommentThreadRead("sample-file", "comment-1", "사용자", fetcher as typeof fetch)
    ).resolves.toMatchObject({
      threadId: "comment-1",
      unread: false,
      readBy: ["디자인 팀", "사용자"]
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/comments?viewerId="), "GET"],
      [expect.stringContaining("/files/sample-file/comments"), "POST"],
      [expect.stringContaining("/files/sample-file/comments/comment-1/resolve"), "POST"],
      [expect.stringContaining("/files/sample-file/comments/comment-1/replies"), "POST"],
      [expect.stringContaining("/files/sample-file/comments/comment-1/read"), "POST"]
    ]);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
