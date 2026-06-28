import { describe, expect, test } from "vitest";
import {
  addCommentReply,
  createCommentThread,
  deleteFileVersion,
  exportCode,
  exportFileArchive,
  exportLibraryArchive,
  importFileArchive,
  importLibraryArchive,
  importLibraryRegistryItem,
  importLibraryRegistryTokens,
  listLibraryRegistry,
  listLibraryRegistrySubscriptions,
  listLibraryRegistryTokenSubscriptions,
  listLibraryRegistryTokenUpdates,
  listLibraryRegistryUpdates,
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
  pruneFileVersions,
  reviewFileArchive,
  reviewLibraryArchive,
  reviewLibraryRegistryItem,
  reviewLibraryRegistryTokens,
  saveFileVersion,
  setFileVersionPinned,
  publishLibraryToRegistry,
  subscribeToCommentEvents,
  subscribeToLibraryRegistryEvents,
  summarizeDocumentChanges,
  updateLibraryRegistryItem,
  updateLibraryRegistryTokens
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
        after: 7,
        onCommentEvent: (event) => events.push(event)
      });

      expect(createdSources).toHaveLength(1);
      const source = createdSources[0];
      const url = new URL(source.url, "http://127.0.0.1:4317");
      expect(url.pathname).toBe("/comments/events");
      expect(url.searchParams.get("fileId")).toBe("sample-file");
      expect(url.searchParams.get("viewerId")).toBe("사용자");
      expect(url.searchParams.get("after")).toBe("7");

      source.dispatchEvent(
        new MessageEvent("comment", {
          data: JSON.stringify({
            schemaVersion: 1,
            eventId: "comment-event-1",
            sequence: 8,
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
          eventId: "comment-event-1",
          sequence: 8,
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

  test("subscribes to live library registry events with EventSource", () => {
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
      const unsubscribe = subscribeToLibraryRegistryEvents({
        fileId: "target-file",
        after: 3,
        onLibraryRegistryEvent: (event) => events.push(event)
      });

      expect(createdSources).toHaveLength(1);
      const source = createdSources[0];
      const url = new URL(source.url, "http://127.0.0.1:4317");
      expect(url.pathname).toBe("/libraries/events");
      expect(url.searchParams.get("fileId")).toBe("target-file");
      expect(url.searchParams.get("after")).toBe("3");

      source.dispatchEvent(
        new MessageEvent("library-registry", {
          data: JSON.stringify({
            schemaVersion: 1,
            eventId: "library-registry-4",
            sequence: 4,
            type: "published",
            libraryId: "team-kit",
            libraryName: "Team Kit",
            sourceFileId: "source-file",
            sourceName: "소스 문서",
            teamId: "team-alpha",
            componentCount: 2,
            tokenCount: 1,
            tokenSetCount: 0,
            tokenThemeCount: 0,
            assetCount: 0,
            registryUpdatedAt: "2026-06-28T00:00:04.000Z",
            createdAt: "2026-06-28T00:00:04.000Z"
          })
        })
      );
      expect(events).toEqual([
        expect.objectContaining({
          schemaVersion: 1,
          sequence: 4,
          type: "published",
          libraryId: "team-kit",
          registryUpdatedAt: "2026-06-28T00:00:04.000Z"
        })
      ]);

      unsubscribe();
      expect(source.closed).toBe(true);
    } finally {
      globalThis.EventSource = originalEventSource;
    }
  });
});

describe("file version API helpers", () => {
  test("reviews, imports, and exports file archives", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/import/archive/review" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ archiveBase64: "UEs=" });
        return jsonResponse({
          review: {
            originalFileId: "document-1",
            originalName: "원본 문서",
            suggestedName: "원본 문서",
            assetCount: 2,
            pageCount: 1,
            nodeCount: 4
          }
        });
      }

      if (pathname === "/files/import/archive" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          archiveBase64: "UEs=",
          fileId: "document-imported",
          name: "가져온 문서"
        });
        return jsonResponse({
          imported: {
            fileId: "document-imported",
            name: "가져온 문서",
            originalFileId: "document-1",
            originalName: "원본 문서",
            assetCount: 2
          }
        });
      }

      if (pathname === "/files/document-1/export/archive") {
        return new Response(new Blob([new Uint8Array([0x50, 0x4b])]), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.layo.file-archive+zip",
            "Content-Disposition": 'attachment; filename="document-1.layo.zip"'
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(reviewFileArchive("UEs=", fetcher as typeof fetch)).resolves.toMatchObject({
      originalFileId: "document-1",
      assetCount: 2,
      nodeCount: 4
    });
    await expect(
      importFileArchive(
        { archiveBase64: "UEs=", fileId: "document-imported", name: "가져온 문서" },
        fetcher as typeof fetch
      )
    ).resolves.toMatchObject({
      fileId: "document-imported",
      name: "가져온 문서"
    });
    await expect(exportFileArchive("document-1", fetcher as typeof fetch)).resolves.toMatchObject({
      fileName: "document-1.layo.zip",
      mimeType: "application/vnd.layo.file-archive+zip"
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/import/archive/review"), "POST"],
      [expect.stringContaining("/files/import/archive"), "POST"],
      [expect.stringContaining("/files/document-1/export/archive"), "GET"]
    ]);
  });

  test("reviews imports and exports library archives", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/document-1/import/library/review" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ archiveBase64: "UEs=" });
        return jsonResponse({
          review: {
            originalFileId: "source-file",
            originalName: "Source",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            components: [{ originalComponentId: "component-card", name: "Card", nodeCount: 1, conflict: false }],
            tokens: [
              {
                originalTokenId: "color-brand-primary",
                name: "Brand / Primary",
                type: "color",
                value: "#2563eb",
                conflict: false
              }
            ]
          }
        });
      }

      if (pathname === "/files/document-1/import/library" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ archiveBase64: "UEs=", idPrefix: "shared" });
        return jsonResponse({
          imported: {
            fileId: "document-1",
            originalFileId: "source-file",
            originalName: "Source",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            componentIdMap: { "component-card": "shared-component-card" },
            tokenIdMap: { "color-brand-primary": "color-brand-primary" }
          }
        });
      }

      if (pathname === "/files/document-1/export/library") {
        return new Response(new Blob([new Uint8Array([0x50, 0x4b])]), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.layo.library-archive+zip",
            "Content-Disposition": 'attachment; filename="document-1.layo-library.zip"'
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(reviewLibraryArchive("document-1", "UEs=", fetcher as typeof fetch)).resolves.toMatchObject({
      componentCount: 1,
      tokens: [expect.objectContaining({ originalTokenId: "color-brand-primary" })]
    });
    await expect(
      importLibraryArchive("document-1", { archiveBase64: "UEs=", idPrefix: "shared" }, fetcher as typeof fetch)
    ).resolves.toMatchObject({
      fileId: "document-1",
      componentIdMap: { "component-card": "shared-component-card" }
    });
    await expect(exportLibraryArchive("document-1", fetcher as typeof fetch)).resolves.toMatchObject({
      fileName: "document-1.layo-library.zip",
      mimeType: "application/vnd.layo.library-archive+zip"
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/document-1/import/library/review"), "POST"],
      [expect.stringContaining("/files/document-1/import/library"), "POST"],
      [expect.stringContaining("/files/document-1/export/library"), "GET"]
    ]);
  });

  test("publishes lists reviews and imports registry libraries", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/libraries" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          fileId: "document-1",
          libraryId: "team-kit",
          name: "Team Kit"
        });
        return jsonResponse({
          library: {
            libraryId: "team-kit",
            name: "Team Kit",
            sourceFileId: "document-1",
            sourceName: "Source",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            publishedAt: "2026-06-28T00:00:00.000Z"
          }
        });
      }

      if (pathname === "/libraries") {
        return jsonResponse({
          libraries: [
            {
              libraryId: "team-kit",
              name: "Team Kit",
              sourceFileId: "document-1",
              sourceName: "Source",
              componentCount: 1,
              tokenCount: 1,
              assetCount: 0,
              publishedAt: "2026-06-28T00:00:00.000Z"
            }
          ]
        });
      }

      if (pathname === "/files/target-file/import/library/registry/review" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit" });
        return jsonResponse({
          review: {
            libraryId: "team-kit",
            libraryName: "Team Kit",
            originalFileId: "document-1",
            originalName: "Source",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            components: [{ originalComponentId: "component-card", name: "Card", nodeCount: 1, conflict: false }],
            tokens: [
              {
                originalTokenId: "color-brand-primary",
                name: "Brand / Primary",
                type: "color",
                value: "#2563eb",
                conflict: false
              }
            ]
          }
        });
      }

      if (pathname === "/files/target-file/import/library/registry" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit", idPrefix: "team" });
        return jsonResponse({
          imported: {
            libraryId: "team-kit",
            libraryName: "Team Kit",
            fileId: "target-file",
            originalFileId: "document-1",
            originalName: "Source",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            componentIdMap: { "component-card": "team-component-card" },
            tokenIdMap: { "color-brand-primary": "color-brand-primary" }
          }
        });
      }

      if (pathname === "/files/target-file/libraries/subscriptions") {
        return jsonResponse({
          subscriptions: [
            {
              fileId: "target-file",
              libraryId: "team-kit",
              libraryName: "Team Kit",
              sourceFileId: "document-1",
              sourceName: "Source",
              idPrefix: "team",
              componentCount: 1,
              tokenCount: 1,
              assetCount: 0,
              componentIdMap: { "component-card": "team-component-card" },
              tokenIdMap: { "color-brand-primary": "color-brand-primary" },
              importedAt: "2026-06-28T00:00:01.000Z",
              importedRegistryUpdatedAt: "2026-06-28T00:00:00.000Z"
            }
          ]
        });
      }

      if (pathname === "/files/target-file/libraries/updates") {
        return jsonResponse({
          updates: [
            {
              fileId: "target-file",
              libraryId: "team-kit",
              libraryName: "Team Kit",
              sourceFileId: "document-1",
              sourceName: "Source",
              componentCount: 2,
              tokenCount: 1,
              assetCount: 0,
              importedRegistryUpdatedAt: "2026-06-28T00:00:00.000Z",
              registryUpdatedAt: "2026-06-28T00:05:00.000Z"
            }
          ]
        });
      }

      if (pathname === "/files/target-file/import/library/registry/update" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit" });
        return jsonResponse({
          imported: {
            libraryId: "team-kit",
            libraryName: "Team Kit",
            fileId: "target-file",
            originalFileId: "document-1",
            originalName: "Source",
            componentCount: 2,
            tokenCount: 1,
            assetCount: 0,
            componentIdMap: {
              "component-card": "team-component-card",
              "component-badge": "team-component-badge"
            },
            tokenIdMap: { "color-brand-primary": "color-brand-primary" }
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(
      publishLibraryToRegistry(
        "document-1",
        { libraryId: "team-kit", name: "Team Kit" },
        fetcher as typeof fetch
      )
    ).resolves.toMatchObject({ libraryId: "team-kit", componentCount: 1 });
    await expect(listLibraryRegistry(fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", name: "Team Kit" })
    ]);
    await expect(
      reviewLibraryRegistryItem("target-file", "team-kit", fetcher as typeof fetch)
    ).resolves.toMatchObject({
      libraryId: "team-kit",
      components: [expect.objectContaining({ originalComponentId: "component-card" })]
    });
    await expect(
      importLibraryRegistryItem("target-file", { libraryId: "team-kit", idPrefix: "team" }, fetcher as typeof fetch)
    ).resolves.toMatchObject({
      libraryId: "team-kit",
      fileId: "target-file",
      componentCount: 1
    });
    await expect(listLibraryRegistrySubscriptions("target-file", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", importedRegistryUpdatedAt: "2026-06-28T00:00:00.000Z" })
    ]);
    await expect(listLibraryRegistryUpdates("target-file", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", componentCount: 2 })
    ]);
    await expect(updateLibraryRegistryItem("target-file", "team-kit", fetcher as typeof fetch)).resolves.toMatchObject({
      libraryId: "team-kit",
      componentCount: 2,
      componentIdMap: {
        "component-card": "team-component-card",
        "component-badge": "team-component-badge"
      }
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/libraries"), "POST"],
      [expect.stringContaining("/libraries"), "GET"],
      [expect.stringContaining("/files/target-file/import/library/registry/review"), "POST"],
      [expect.stringContaining("/files/target-file/import/library/registry"), "POST"],
      [expect.stringContaining("/files/target-file/libraries/subscriptions"), "GET"],
      [expect.stringContaining("/files/target-file/libraries/updates"), "GET"],
      [expect.stringContaining("/files/target-file/import/library/registry/update"), "POST"]
    ]);
  });

  test("passes target file id when listing scoped registry libraries", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const parsed = new URL(String(url), "http://127.0.0.1:4317");
      expect(parsed.pathname).toBe("/libraries");
      expect(parsed.searchParams.get("fileId")).toBe("target-file");
      return jsonResponse({
        libraries: [
          {
            libraryId: "team-kit",
            name: "Team Kit",
            sourceFileId: "source-file",
            sourceName: "Source",
            teamId: "team-alpha",
            componentCount: 1,
            tokenCount: 1,
            assetCount: 0,
            publishedAt: "2026-06-28T00:00:00.000Z"
          }
        ]
      });
    };

    await expect(listLibraryRegistry("target-file", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", teamId: "team-alpha" })
    ]);
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/libraries?fileId=target-file"), "GET"]
    ]);
  });

  test("reviews and imports registry library token bundles", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/target-file/import/library/registry/tokens/review" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit" });
        return jsonResponse({
          review: {
            libraryId: "team-kit",
            libraryName: "Team Kit",
            originalFileId: "document-1",
            originalName: "Source",
            tokenCount: 3,
            tokenSetCount: 3,
            tokenThemeCount: 1,
            replacesTokenCount: 1,
            replacesTokenSetCount: 1,
            replacesTokenThemeCount: 1,
            tokens: [
              { id: "color-base-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
            ],
            tokenSets: [{ id: "base", name: "base", enabled: true }],
            tokenThemes: [
              {
                id: "theme-brand",
                name: "Brand Theme",
                group: "mode",
                enabled: true,
                token_set_ids: ["base"]
              }
            ]
          }
        });
      }

      if (pathname === "/files/target-file/import/library/registry/tokens" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit" });
        return jsonResponse({
          imported: {
            fileId: "target-file",
            libraryId: "team-kit",
            libraryName: "Team Kit",
            originalFileId: "document-1",
            originalName: "Source",
            tokenCount: 3,
            tokenSetCount: 3,
            tokenThemeCount: 1,
            replacedTokenCount: 1,
            replacedTokenSetCount: 1,
            replacedTokenThemeCount: 1
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(reviewLibraryRegistryTokens("target-file", "team-kit", fetcher as typeof fetch)).resolves.toMatchObject({
      libraryId: "team-kit",
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacesTokenThemeCount: 1
    });
    await expect(importLibraryRegistryTokens("target-file", "team-kit", fetcher as typeof fetch)).resolves.toMatchObject({
      libraryId: "team-kit",
      tokenCount: 3,
      replacedTokenSetCount: 1
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/target-file/import/library/registry/tokens/review"), "POST"],
      [expect.stringContaining("/files/target-file/import/library/registry/tokens"), "POST"]
    ]);
  });

  test("lists and applies registry library token bundle updates", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/target-file/libraries/token-subscriptions") {
        return jsonResponse({
          subscriptions: [
            {
              fileId: "target-file",
              libraryId: "team-kit",
              libraryName: "Team Kit",
              sourceFileId: "document-1",
              sourceName: "Source",
              tokenCount: 3,
              tokenSetCount: 3,
              tokenThemeCount: 1,
              importedAt: "2026-06-28T00:00:00.000Z",
              importedRegistryUpdatedAt: "2026-06-28T00:00:00.000Z"
            }
          ]
        });
      }

      if (pathname === "/files/target-file/libraries/token-updates") {
        return jsonResponse({
          updates: [
            {
              fileId: "target-file",
              libraryId: "team-kit",
              libraryName: "Team Kit",
              sourceFileId: "document-1",
              sourceName: "Source",
              tokenCount: 4,
              tokenSetCount: 4,
              tokenThemeCount: 1,
              importedRegistryUpdatedAt: "2026-06-28T00:00:00.000Z",
              registryUpdatedAt: "2026-06-28T00:05:00.000Z"
            }
          ]
        });
      }

      if (pathname === "/files/target-file/import/library/registry/tokens/update" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ libraryId: "team-kit" });
        return jsonResponse({
          imported: {
            fileId: "target-file",
            libraryId: "team-kit",
            libraryName: "Team Kit",
            originalFileId: "document-1",
            originalName: "Source",
            tokenCount: 4,
            tokenSetCount: 4,
            tokenThemeCount: 1,
            replacedTokenCount: 3,
            replacedTokenSetCount: 3,
            replacedTokenThemeCount: 1
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(listLibraryRegistryTokenSubscriptions("target-file", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", tokenSetCount: 3, tokenThemeCount: 1 })
    ]);
    await expect(listLibraryRegistryTokenUpdates("target-file", fetcher as typeof fetch)).resolves.toEqual([
      expect.objectContaining({ libraryId: "team-kit", tokenCount: 4, tokenSetCount: 4 })
    ]);
    await expect(updateLibraryRegistryTokens("target-file", "team-kit", fetcher as typeof fetch)).resolves.toMatchObject({
      libraryId: "team-kit",
      tokenCount: 4,
      replacedTokenSetCount: 3
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/target-file/libraries/token-subscriptions"), "GET"],
      [expect.stringContaining("/files/target-file/libraries/token-updates"), "GET"],
      [expect.stringContaining("/files/target-file/import/library/registry/tokens/update"), "POST"]
    ]);
  });

  test("exports developer handoff code", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const parsedUrl = new URL(String(url), "http://127.0.0.1:4317");

      if (parsedUrl.pathname === "/files/sample-file/export/code") {
        expect(parsedUrl.searchParams.get("moduleBasePath")).toBe("./elements");
        return jsonResponse({
          export: {
            html: '<div class="canvas-export-root"></div>',
            css: ".canvas-export-root { position: relative; }",
            elements: [
              {
                id: "text-1",
                name: "헤드라인",
                className: "node-text-1",
                html: '<p class="node-text-1">Layo</p>',
                css: ".node-text-1 { color: #111827; }",
                jsModule: "export default {};",
                structure: {
                  id: "text-1",
                  name: "헤드라인",
                  kind: "text",
                  className: "node-text-1",
                  bounds: { x: 10, y: 20, width: 120, height: 32, rotation: 0 },
                  style: { fill: "#111827", stroke: null, strokeWidth: 0, opacity: 1 },
                  content: { type: "text", value: "Layo", fontSize: 24, fontFamily: "Inter" },
                  children: []
                },
                implementation: {
                  componentName: "Headline",
                  suggestedProps: [],
                  slots: [],
                  cssClassNames: ["node-text-1"],
                  sourceNodeIds: ["text-1"]
                }
              }
            ],
            implementationSpec: {
              elements: [],
              components: [],
              tokens: { colors: [], spacing: [] },
              tokenCandidates: { colors: ["#111827"], fontFamilies: ["Inter"], fontSizes: [24], spacings: [] }
            },
            indexModule: "export { default as Headline } from './elements/text-1.js';"
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(
      exportCode("sample-file", { moduleBasePath: "./elements" }, fetcher as typeof fetch)
    ).resolves.toMatchObject({
      html: '<div class="canvas-export-root"></div>',
      css: expect.stringContaining("canvas-export-root"),
      elements: [
        expect.objectContaining({
          id: "text-1",
          name: "헤드라인",
          className: "node-text-1",
          html: expect.stringContaining("Layo"),
          css: expect.stringContaining("node-text-1")
        })
      ],
      implementationSpec: expect.objectContaining({
        tokenCandidates: expect.objectContaining({ colors: ["#111827"] })
      }),
      indexModule: expect.stringContaining("Headline")
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/export/code?moduleBasePath=.%2Felements"), "GET"]
    ]);
  });

  test("file version retention deletes and prunes versions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/versions/version-1" && init?.method === "DELETE") {
        return jsonResponse({
          version: {
            versionId: "version-1",
            fileId: "sample-file",
            message: "릴리즈 기준",
            pinned: true,
            deleted: true
          }
        });
      }
      if (pathname === "/files/sample-file/versions/prune" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ keepUnpinned: 1 });
        return jsonResponse({
          result: {
            fileId: "sample-file",
            keepUnpinned: 1,
            deletedVersions: [{ versionId: "version-2", message: "오래된 작업", pinned: false, deleted: true }],
            keptVersions: [{ versionId: "version-1", message: "릴리즈 기준", pinned: true }]
          }
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(deleteFileVersion("sample-file", "version-1", fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      pinned: true,
      deleted: true
    });
    await expect(pruneFileVersions("sample-file", 1, fetcher as typeof fetch)).resolves.toMatchObject({
      fileId: "sample-file",
      keepUnpinned: 1,
      deletedVersions: [expect.objectContaining({ versionId: "version-2", deleted: true })]
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/versions/version-1"), "DELETE"],
      [expect.stringContaining("/files/sample-file/versions/prune"), "POST"]
    ]);
  });

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
      if (pathname === "/files/sample-file/versions/version-1/pin" && init?.method === "PATCH") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({ pinned: true });
        return jsonResponse({
          version: {
            versionId: "version-1",
            fileId: "sample-file",
            message: "검토 전",
            pinned: true
          }
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
    await expect(setFileVersionPinned("sample-file", "version-1", true, fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      pinned: true
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/versions"), "GET"],
      [expect.stringContaining("/files/sample-file/versions"), "POST"],
      [expect.stringContaining("/files/sample-file/versions/version-1"), "GET"],
      [expect.stringContaining("/files/sample-file/versions/version-1/restore"), "POST"],
      [expect.stringContaining("/files/sample-file/versions/version-1/pin"), "PATCH"]
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
