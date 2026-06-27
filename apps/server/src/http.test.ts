import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

async function createServerWithDocument() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  await storage.createProject({
    projectId: "test-project",
    name: "테스트 프로젝트",
    documentId: "sample-file",
    documentName: "테스트 문서"
  });
  return createHttpServer(storage);
}

describe("HTTP server", () => {
  test("serves health and starts with an empty file list", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const files = await server.inject({ method: "GET", url: "/files" });
    expect(files.statusCode).toBe(200);
    expect(files.json().files).toEqual([]);
  });

  test("serves project create, read, update, document, and sharing routes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const projects = await server.inject({ method: "GET", url: "/projects" });
    expect(projects.statusCode).toBe(200);
    expect(projects.json().projects).toEqual([]);

    const created = await server.inject({
      method: "POST",
      url: "/projects",
      payload: {
        projectId: "project-http",
        name: "HTTP 프로젝트",
        documentId: "document-http",
        documentName: "HTTP 문서"
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().project).toMatchObject({
      projectId: "project-http",
      currentDocumentId: "document-http"
    });

    const read = await server.inject({ method: "GET", url: "/projects/project-http" });
    expect(read.statusCode).toBe(200);
    expect(read.json().project.name).toBe("HTTP 프로젝트");

    const renamed = await server.inject({
      method: "PATCH",
      url: "/projects/project-http",
      payload: { name: "HTTP 리네임" }
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().project.name).toBe("HTTP 리네임");

    const document = await server.inject({
      method: "POST",
      url: "/projects/project-http/documents",
      payload: { documentId: "document-http-2", name: "두 번째 문서" }
    });
    expect(document.statusCode).toBe(200);
    expect(document.json().project.currentDocumentId).toBe("document-http-2");

    const shared = await server.inject({
      method: "PATCH",
      url: "/projects/project-http/sharing",
      payload: { mode: "team", teamId: "team-http" }
    });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().project.sharing).toEqual({ mode: "team", teamId: "team-http" });

    const privateProject = await server.inject({
      method: "PATCH",
      url: "/projects/project-http/sharing",
      payload: { mode: "private" }
    });
    expect(privateProject.statusCode).toBe(200);
    expect(privateProject.json().project.sharing).toEqual({ mode: "private" });

    const duplicated = await server.inject({
      method: "POST",
      url: "/projects/project-http/duplicate",
      payload: {
        projectId: "project-http-copy",
        name: "HTTP 복제",
        documentIdPrefix: "http-copy"
      }
    });
    expect(duplicated.statusCode).toBe(200);
    expect(duplicated.json().project).toMatchObject({
      projectId: "project-http-copy",
      name: "HTTP 복제",
      currentDocumentId: "http-copy-document-http-2"
    });

    const deleted = await server.inject({
      method: "DELETE",
      url: "/projects/project-http-copy"
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().project.projectId).toBe("project-http-copy");

    const missing = await server.inject({ method: "GET", url: "/projects/project-http-copy" });
    expect(missing.statusCode).toBe(404);
  });

  test("answers browser CORS preflight for JSON project mutations", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const response = await server.inject({
      method: "OPTIONS",
      url: "/projects",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("Content-Type");
  });

  test("stores and serves image assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const uploaded = await server.inject({
      method: "POST",
      url: "/assets",
      payload: {
        name: "pixel.png",
        mimeType: "image/png",
        dataBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    });

    expect(uploaded.statusCode).toBe(200);
    const asset = uploaded.json().asset as {
      assetId: string;
      mimeType: string;
      url: string;
      byteLength: number;
    };
    expect(asset.assetId).toMatch(/^asset-/);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.byteLength).toBeGreaterThan(0);
    expect(asset.url).toBe(`/assets/${asset.assetId}`);

    const served = await server.inject({ method: "GET", url: asset.url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/png");
    expect(served.rawPayload.length).toBe(asset.byteLength);
  });

  test("stores and serves svg image assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="14"><rect width="18" height="14" fill="#0891b2"/></svg>`;

    const uploaded = await server.inject({
      method: "POST",
      url: "/assets",
      payload: {
        name: "vector.svg",
        mimeType: "image/svg+xml",
        dataBase64: Buffer.from(svg).toString("base64")
      }
    });

    expect(uploaded.statusCode).toBe(200);
    const asset = uploaded.json().asset as {
      assetId: string;
      mimeType: string;
      url: string;
      byteLength: number;
    };
    expect(asset.mimeType).toBe("image/svg+xml");
    expect(asset.byteLength).toBe(Buffer.byteLength(svg));

    const served = await server.inject({ method: "GET", url: asset.url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/svg+xml");
    expect(served.body).toBe(svg);
  });

  test("serves built web assets under /app without intercepting API assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const webDistDir = path.join(tempRoot, "web-dist");
    await mkdir(path.join(webDistDir, "assets"), { recursive: true });
    await writeFile(
      path.join(webDistDir, "index.html"),
      '<!doctype html><title>Layo</title><script src="/app/assets/app.js"></script>'
    );
    await writeFile(path.join(webDistDir, "assets", "app.js"), "window.__canvasEditor = true;");
    const server = createHttpServer(new FileStorage(path.join(tempRoot, "storage")), {
      webDistDir,
      webBasePath: "/app/"
    });

    const root = await server.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe("/app/");

    const shell = await server.inject({ method: "GET", url: "/app/" });
    expect(shell.statusCode).toBe(200);
    expect(shell.headers["content-type"]).toContain("text/html");
    expect(shell.body).toContain("Layo");

    const bundle = await server.inject({ method: "GET", url: "/app/assets/app.js" });
    expect(bundle.statusCode).toBe(200);
    expect(bundle.headers["content-type"]).toContain("text/javascript");
    expect(bundle.body).toContain("window.__canvasEditor");

    const uploaded = await server.inject({
      method: "POST",
      url: "/assets",
      payload: {
        name: "pixel.png",
        mimeType: "image/png",
        dataBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    });
    expect(uploaded.statusCode).toBe(200);
    const apiAsset = await server.inject({ method: "GET", url: uploaded.json().asset.url });
    expect(apiAsset.statusCode).toBe(200);
    expect(apiAsset.headers["content-type"]).toContain("image/png");
  });

  test("rejects image assets whose bytes do not match the declared mime type", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const rejected = await server.inject({
      method: "POST",
      url: "/assets",
      payload: {
        name: "fake.png",
        mimeType: "image/png",
        dataBase64: Buffer.from("not a png").toString("base64")
      }
    });

    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toEqual({ error: "asset data does not match image/png" });
  });

  test("exports and imports file archives with referenced image assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const sourceServer = createHttpServer(new FileStorage(path.join(tempRoot, "source")));
    await sourceServer.inject({
      method: "POST",
      url: "/projects",
      payload: {
        projectId: "archive-project",
        name: "아카이브 프로젝트",
        documentId: "archive-file",
        documentName: "아카이브 문서"
      }
    });
    const uploaded = await sourceServer.inject({
      method: "POST",
      url: "/assets",
      payload: {
        name: "pixel.png",
        mimeType: "image/png",
        dataBase64: pixelPng
      }
    });
    const asset = uploaded.json().asset as { assetId: string };
    await sourceServer.inject({
      method: "POST",
      url: "/files/archive-file/nodes",
      payload: {
        parentId: "page-1",
        node: {
          id: "image-archive-http",
          kind: "image",
          name: "아카이브 이미지",
          transform: { x: 100, y: 120, rotation: 0 },
          size: { width: 240, height: 160 },
          style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "image",
            asset_id: asset.assetId,
            natural_width: 1,
            natural_height: 1,
            fit_mode: "fit"
          },
          children: []
        }
      }
    });

    const exported = await sourceServer.inject({
      method: "GET",
      url: "/files/archive-file/export/archive"
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("application/vnd.layo.file-archive+zip");
    expect(exported.headers["content-disposition"]).toContain("archive-file.layo.zip");
    expect(exported.rawPayload.subarray(0, 2).toString("utf8")).toBe("PK");

    const targetServer = createHttpServer(new FileStorage(path.join(tempRoot, "target")));
    const imported = await targetServer.inject({
      method: "POST",
      url: "/files/import/archive",
      payload: {
        archiveBase64: exported.rawPayload.toString("base64"),
        fileId: "imported-http-file",
        name: "HTTP 가져온 문서"
      }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toMatchObject({
      fileId: "imported-http-file",
      name: "HTTP 가져온 문서",
      originalFileId: "archive-file",
      assetCount: 1
    });
    const file = await targetServer.inject({ method: "GET", url: "/files/imported-http-file" });
    const image = file.json().file.pages[0].children.find((node: { id: string }) => node.id === "image-archive-http");
    expect(image.content.asset_id).toBe(asset.assetId);

    const importedAsset = await targetServer.inject({ method: "GET", url: `/assets/${asset.assetId}` });
    expect(importedAsset.statusCode).toBe(200);
    expect(importedAsset.rawPayload.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
  });

  test("reviews file archive imports without writing the file", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const sourceServer = createHttpServer(new FileStorage(path.join(tempRoot, "source")));
    await sourceServer.inject({
      method: "POST",
      url: "/projects",
      payload: {
        projectId: "archive-project",
        name: "아카이브 프로젝트",
        documentId: "archive-file",
        documentName: "HTTP 아카이브"
      }
    });
    const exported = await sourceServer.inject({
      method: "GET",
      url: "/files/archive-file/export/archive"
    });
    const targetServer = createHttpServer(new FileStorage(path.join(tempRoot, "target")));

    const review = await targetServer.inject({
      method: "POST",
      url: "/files/import/archive/review",
      payload: {
        archiveBase64: exported.rawPayload.toString("base64")
      }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().review).toMatchObject({
      originalFileId: "archive-file",
      originalName: "HTTP 아카이브",
      suggestedName: "HTTP 아카이브",
      assetCount: 0,
      pageCount: 1,
      nodeCount: expect.any(Number)
    });
    const missing = await targetServer.inject({ method: "GET", url: "/files/archive-file" });
    expect(missing.statusCode).toBe(404);
  });

  test("exports reviews and imports library archives", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: {
              id: "color-brand-primary",
              name: "Brand / Primary",
              type: "color",
              value: "#2563eb"
            }
          },
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-card",
            name: "Library Card",
            width: 160,
            height: 96,
            fill: "#ffffff"
          },
          { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
          { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
        ]
      }
    });

    const exported = await server.inject({ method: "GET", url: "/files/sample-file/export/library" });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("application/vnd.layo.library-archive+zip");
    expect(exported.headers["content-disposition"]).toContain("sample-file.layo-library.zip");
    expect(exported.rawPayload.subarray(0, 2).toString("utf8")).toBe("PK");
    const archiveBase64 = exported.rawPayload.toString("base64");

    const reviewed = await server.inject({
      method: "POST",
      url: "/files/sample-file/import/library/review",
      payload: { archiveBase64 }
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().review).toMatchObject({
      originalFileId: "sample-file",
      componentCount: 1,
      tokenCount: 1,
      components: [expect.objectContaining({ originalComponentId: "component-card", conflict: true })],
      tokens: [expect.objectContaining({ originalTokenId: "color-brand-primary", conflict: false })]
    });

    const imported = await server.inject({
      method: "POST",
      url: "/files/sample-file/import/library",
      payload: { archiveBase64, idPrefix: "shared" }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toMatchObject({
      fileId: "sample-file",
      componentCount: 1,
      tokenCount: 1,
      componentIdMap: { "component-card": "shared-component-card" },
      tokenIdMap: { "color-brand-primary": "color-brand-primary" }
    });
  });

  test("exports reviews and imports project archives", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const sourceServer = createHttpServer(new FileStorage(path.join(tempRoot, "source")));
    await sourceServer.inject({
      method: "POST",
      url: "/projects",
      payload: {
        projectId: "archive-project",
        name: "프로젝트 묶음",
        documentId: "archive-file",
        documentName: "첫 문서"
      }
    });
    await sourceServer.inject({
      method: "POST",
      url: "/projects/archive-project/documents",
      payload: { documentId: "archive-file-2", name: "두 번째 문서" }
    });

    const exported = await sourceServer.inject({
      method: "GET",
      url: "/projects/archive-project/export/archive"
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("application/vnd.layo.project-archive+zip");
    expect(exported.headers["content-disposition"]).toContain("archive-project.layo-project.zip");
    expect(exported.rawPayload.subarray(0, 2).toString("utf8")).toBe("PK");

    const targetServer = createHttpServer(new FileStorage(path.join(tempRoot, "target")));
    const review = await targetServer.inject({
      method: "POST",
      url: "/projects/import/archive/review",
      payload: { archiveBase64: exported.rawPayload.toString("base64") }
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().review).toMatchObject({
      originalProjectId: "archive-project",
      documentCount: 2,
      documents: [
        expect.objectContaining({ originalFileId: "archive-file", originalName: "첫 문서" }),
        expect.objectContaining({ originalFileId: "archive-file-2", originalName: "두 번째 문서" })
      ]
    });

    const imported = await targetServer.inject({
      method: "POST",
      url: "/projects/import/archive",
      payload: {
        archiveBase64: exported.rawPayload.toString("base64"),
        projectId: "restored-project",
        name: "복원 묶음",
        documentIdPrefix: "restored"
      }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported.project).toMatchObject({
      projectId: "restored-project",
      name: "복원 묶음",
      currentDocumentId: "restored-archive-file-2"
    });
  });

  test("updates node geometry, fill, text, and creates nodes", async () => {
    const server = await createServerWithDocument();

    const geometry = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/text-1/geometry",
      payload: { x: 88, y: 99, width: 180, height: 36 }
    });
    expect(geometry.statusCode).toBe(200);
    expect(geometry.json().node.transform).toMatchObject({ x: 88, y: 99 });

    const fill = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/text-1/fill",
      payload: { fill: "#2563eb" }
    });
    expect(fill.statusCode).toBe(200);
    expect(fill.json().node.style.fill).toBe("#2563eb");

    const text = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/text-1/text",
      payload: { value: "저장된 헤드라인" }
    });
    expect(text.statusCode).toBe(200);
    expect(text.json().node.content.value).toBe("저장된 헤드라인");

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/nodes",
      payload: {
        parentId: "page-1",
        node: {
          id: "rectangle-99",
          kind: "rectangle",
          name: "사각형 99",
          transform: { x: 12, y: 24, rotation: 0 },
          size: { width: 100, height: 80 },
          style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
          content: { type: "empty" },
          children: []
        }
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().node.id).toBe("rectangle-99");
  });

  test("serves selected-node comment thread routes", async () => {
    const server = await createServerWithDocument();

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/comments",
      payload: {
        nodeId: "text-1",
        body: "문구 확인 필요",
        authorName: "디자인 팀"
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().thread).toMatchObject({
      fileId: "sample-file",
      nodeId: "text-1",
      nodeName: "헤드라인",
      body: "문구 확인 필요",
      authorName: "디자인 팀",
      replies: [],
      resolvedAt: null
    });

    const replied = await server.inject({
      method: "POST",
      url: `/files/sample-file/comments/${created.json().thread.threadId}/replies`,
      payload: {
        body: "문구를 더 짧게 줄였어요",
        authorName: "개발 팀"
      }
    });
    expect(replied.statusCode).toBe(200);
    expect(replied.json().thread.replies).toEqual([
      expect.objectContaining({
        body: "문구를 더 짧게 줄였어요",
        authorName: "개발 팀"
      })
    ]);

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/comments" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().threads.map((thread: { body: string }) => thread.body)).toEqual(["문구 확인 필요"]);
    expect(listed.json().threads[0].replies.map((reply: { body: string }) => reply.body)).toEqual([
      "문구를 더 짧게 줄였어요"
    ]);

    const resolved = await server.inject({
      method: "POST",
      url: `/files/sample-file/comments/${created.json().thread.threadId}/resolve`
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().thread).toMatchObject({
      threadId: created.json().thread.threadId,
      resolvedAt: expect.any(String)
    });

    const active = await server.inject({ method: "GET", url: "/files/sample-file/comments" });
    expect(active.json().threads).toEqual([]);

    const all = await server.inject({ method: "GET", url: "/files/sample-file/comments?includeResolved=true" });
    expect(all.json().threads).toHaveLength(1);
  });

  test("serves comment mentions and viewer read state routes", async () => {
    const server = await createServerWithDocument();
    const target = { userId: "사용자", displayName: "민지", role: "editor" } as const;

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/comments",
      payload: {
        nodeId: "text-1",
        body: "@민지 문구 확인 필요",
        authorName: "디자인 팀",
        mentionTargets: [target]
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().thread).toMatchObject({
      mentions: ["민지"],
      mentionTargets: [target],
      readBy: ["디자인 팀"]
    });

    const unread = await server.inject({
      method: "GET",
      url: "/files/sample-file/comments?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90"
    });
    expect(unread.statusCode).toBe(200);
    expect(unread.json().threads).toEqual([
      expect.objectContaining({
        threadId: created.json().thread.threadId,
        unread: true
      })
    ]);

    const read = await server.inject({
      method: "POST",
      url: `/files/sample-file/comments/${created.json().thread.threadId}/read`,
      payload: { viewerId: "사용자" }
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().thread).toMatchObject({
      threadId: created.json().thread.threadId,
      readBy: ["디자인 팀", "사용자"],
      unread: false
    });

    const replied = await server.inject({
      method: "POST",
      url: `/files/sample-file/comments/${created.json().thread.threadId}/replies`,
      payload: {
        body: "@민지 수정했어요",
        authorName: "개발 팀",
        mentionTargets: [target]
      }
    });
    expect(replied.statusCode).toBe(200);
    expect(replied.json().thread).toMatchObject({
      readBy: ["개발 팀"],
      replies: [
        expect.objectContaining({
          mentions: ["민지"],
          mentionTargets: [target]
        })
      ]
    });

    const unreadAfterReply = await server.inject({
      method: "GET",
      url: "/files/sample-file/comments?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90"
    });
    expect(unreadAfterReply.json().threads[0]).toMatchObject({
      threadId: created.json().thread.threadId,
      unread: true
    });

    const notifications = await server.inject({
      method: "GET",
      url: "/comments/notifications?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90"
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json().summary).toMatchObject({
      viewerId: "사용자",
      totalUnread: 1,
      totalMentions: 1,
      projects: [
        {
          projectId: "test-project",
          unreadCount: 1,
          mentionCount: 1,
          files: [{ fileId: "sample-file", name: "테스트 문서", unreadCount: 1, mentionCount: 1 }]
        }
      ]
    });

    const readFile = await server.inject({
      method: "POST",
      url: "/files/sample-file/comments/read",
      payload: { viewerId: "사용자" }
    });
    expect(readFile.statusCode).toBe(200);
    expect(readFile.json().threads[0]).toMatchObject({
      threadId: created.json().thread.threadId,
      unread: false
    });

    const notificationsAfterRead = await server.inject({
      method: "GET",
      url: "/comments/notifications?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90"
    });
    expect(notificationsAfterRead.json().summary).toMatchObject({
      totalUnread: 0,
      totalMentions: 0,
      projects: []
    });

    const resolved = await server.inject({
      method: "POST",
      url: `/files/sample-file/comments/${created.json().thread.threadId}/resolve`
    });
    expect(resolved.statusCode).toBe(200);

    const activity = await server.inject({
      method: "GET",
      url: "/comments/activity?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90&limit=2"
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.json().feed).toMatchObject({
      viewerId: "사용자",
      events: [
        {
          type: "resolved",
          projectId: "test-project",
          projectName: "테스트 프로젝트",
          fileId: "sample-file",
          fileName: "테스트 문서",
          threadId: created.json().thread.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "사용자",
          body: "@민지 문구 확인 필요",
          mentions: ["민지"],
          mentionTargets: [target]
        },
        {
          type: "replied",
          projectId: "test-project",
          projectName: "테스트 프로젝트",
          fileId: "sample-file",
          fileName: "테스트 문서",
          threadId: created.json().thread.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "개발 팀",
          body: "@민지 수정했어요",
          mentions: ["민지"],
          mentionTargets: [target]
        }
      ]
    });
  });

  test("streams comment mutation events to subscribed clients", async () => {
    const server = await createServerWithDocument();
    const address = await server.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();

    try {
      const stream = await fetch(
        `${address}/comments/events?viewerId=${encodeURIComponent("사용자")}&fileId=sample-file`,
        { signal: controller.signal }
      );
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      expect(stream.headers.get("access-control-allow-origin")).toBe("*");

      const eventPromise = readCommentStreamEvent(stream);
      const created = await fetch(`${address}/files/sample-file/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: "text-1",
          body: "@사용자 SSE 확인",
          authorName: "디자인 팀",
          mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
        })
      });
      expect(created.status).toBe(200);

      const event = await eventPromise;
      expect(event).toMatchObject({
        schemaVersion: 1,
        type: "created",
        fileId: "sample-file",
        viewerId: "사용자"
      });
      expect(event.threadId).toMatch(/^comment-/);
    } finally {
      controller.abort();
      await server.close();
    }
  });

  test("updates image node assets and persists replacement metadata", async () => {
    const server = await createServerWithDocument();

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/nodes",
      payload: {
        parentId: "page-1",
        node: {
          id: "image-1",
          kind: "image",
          name: "이미지 1",
          transform: { x: 120, y: 140, rotation: 0 },
          size: { width: 480, height: 320 },
          style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "image",
            asset_id: "asset-before",
            natural_width: 720,
            natural_height: 480,
            fit_mode: "fit"
          },
          children: []
        }
      }
    });
    expect(created.statusCode).toBe(200);

    const replaced = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/image-1/image",
      payload: {
        assetId: "asset-after",
        naturalWidth: 300,
        naturalHeight: 900
      }
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().node.content).toEqual({
      type: "image",
      asset_id: "asset-after",
      natural_width: 300,
      natural_height: 900,
      fit_mode: "fit"
    });

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    const image = file.json().file.pages[0].children.find((node: { id: string }) => node.id === "image-1");
    expect(image.content.asset_id).toBe("asset-after");
    expect(image.content.fit_mode).toBe("fit");
    expect(image.size).toEqual({ width: 480, height: 320 });
  });

  test("updates image fit mode without changing geometry", async () => {
    const server = await createServerWithDocument();

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/nodes",
      payload: {
        parentId: "page-1",
        node: {
          id: "image-1",
          kind: "image",
          name: "이미지 1",
          transform: { x: 120, y: 140, rotation: 0 },
          size: { width: 480, height: 320 },
          style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "image",
            asset_id: "asset-before",
            natural_width: 720,
            natural_height: 480,
            fit_mode: "fill"
          },
          children: []
        }
      }
    });
    expect(created.statusCode).toBe(200);

    const fitted = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/image-1/image-fit",
      payload: { fitMode: "fit" }
    });
    expect(fitted.statusCode).toBe(200);
    expect(fitted.json().node.content).toMatchObject({
      type: "image",
      asset_id: "asset-before",
      fit_mode: "fit"
    });
    expect(fitted.json().node.size).toEqual({ width: 480, height: 320 });

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    const image = file.json().file.pages[0].children.find((node: { id: string }) => node.id === "image-1");
    expect(image.content.fit_mode).toBe("fit");
  });

  test("serves component creation, instancing, listing, and detach routes", async () => {
    const server = await createServerWithDocument();

    const component = await server.inject({
      method: "POST",
      url: "/files/sample-file/components",
      payload: { nodeId: "frame-1", componentId: "component-1", name: "Card" }
    });
    expect(component.statusCode).toBe(200);
    expect(component.json().component.id).toBe("component-1");

    const instance = await server.inject({
      method: "POST",
      url: "/files/sample-file/component-instances",
      payload: {
        parentId: "page-1",
        definitionId: "component-1",
        instanceId: "instance-1",
        x: 520,
        y: 140
      }
    });
    expect(instance.statusCode).toBe(200);
    expect(instance.json().node.kind).toBe("component_instance");

    const list = await server.inject({ method: "GET", url: "/files/sample-file/components" });
    expect(list.statusCode).toBe(200);
    expect(list.json().components[0].name).toBe("Card");

    const detached = await server.inject({
      method: "POST",
      url: "/files/sample-file/nodes/instance-1/detach"
    });
    expect(detached.statusCode).toBe(200);
    expect(detached.json().node.kind).toBe("frame");
  });

  test("serves component variant definitions and selected instance variant updates", async () => {
    const server = await createServerWithDocument();

    const component = await server.inject({
      method: "POST",
      url: "/files/sample-file/components",
      payload: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
    });
    expect(component.statusCode).toBe(200);

    const variants = await server.inject({
      method: "PUT",
      url: "/files/sample-file/components/component-card/variants",
      payload: {
        variants: [
          {
            id: "card-flat",
            name: "Flat",
            properties: [
              { name: "surface", value: "flat" },
              { name: "enabled", value: "true", type: "boolean" }
            ]
          },
          {
            id: "card-elevated",
            name: "Elevated",
            properties: [
              { name: "surface", value: "elevated" },
              { name: "enabled", value: "false", type: "boolean" }
            ]
          }
        ]
      }
    });
    expect(variants.statusCode).toBe(200);

    const instance = await server.inject({
      method: "POST",
      url: "/files/sample-file/component-instances",
      payload: {
        parentId: "page-1",
        definitionId: "component-card",
        instanceId: "instance-card",
        x: 520,
        y: 140
      }
    });
    expect(instance.statusCode).toBe(200);
    expect(instance.json().node.component_instance.variant_id).toBe("card-flat");

    const selected = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/instance-card/component-variant",
      payload: { variantId: "card-elevated" }
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json().node.component_instance.variant_id).toBe("card-elevated");

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/components" });
    expect(listed.json().components[0].variants).toHaveLength(2);
    expect(listed.json().components[0].variants[0].properties).toEqual([
      { name: "surface", value: "flat", type: "select" },
      { name: "enabled", value: "true", type: "boolean" }
    ]);
  });

  test("serves agent commands that combine components as variants", async () => {
    const server = await createServerWithDocument();

    const result = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_rectangle",
            parentId: "page-1",
            id: "button-primary",
            name: "Button / Primary",
            x: 160,
            y: 120,
            width: 140,
            height: 64,
            fill: "#2563eb"
          },
          {
            type: "create_rectangle",
            parentId: "page-1",
            id: "button-secondary",
            name: "Button / Secondary",
            x: 340,
            y: 120,
            width: 140,
            height: 64,
            fill: "#0f766e"
          },
          {
            type: "create_component",
            nodeId: "button-primary",
            componentId: "component-button-primary",
            name: "Button / Primary"
          },
          {
            type: "create_component",
            nodeId: "button-secondary",
            componentId: "component-button-secondary",
            name: "Button / Secondary"
          },
          {
            type: "combine_components_as_variants",
            componentId: "component-button-primary",
            nodeIds: ["button-primary", "button-secondary"],
            propertyName: "variant"
          }
        ]
      }
    });

    expect(result.statusCode).toBe(200);
    expect(result.json().result.audit.commandTypes).toContain("combine_components_as_variants");

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/components" });
    expect(listed.json().components).toHaveLength(1);
    expect(listed.json().components[0]).toMatchObject({
      id: "component-button-primary",
      name: "Button",
      variant_area: {
        layout: "horizontal",
        gap: 32,
        padding: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      variants: [
        {
          id: "variant-button-primary",
          name: "Primary",
          properties: [{ name: "variant", value: "Primary", type: "select" }]
        },
        {
          id: "variant-button-secondary",
          name: "Secondary",
          properties: [{ name: "variant", value: "Secondary", type: "select" }]
        }
      ]
    });
  });

  test("serves agent commands that edit component variant area layout", async () => {
    const server = await createServerWithDocument();

    const result = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_component",
            nodeId: "frame-1",
            componentId: "component-card",
            name: "Card"
          },
          {
            type: "set_component_variant_area",
            componentId: "component-card",
            area: {
              layout: "vertical",
              gap: 48,
              padding: { top: 12, right: 16, bottom: 12, left: 16 }
            }
          }
        ]
      }
    });

    expect(result.statusCode).toBe(200);
    expect(result.json().result.audit.commandTypes).toEqual(["create_component", "set_component_variant_area"]);

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/components" });
    expect(listed.json().components[0].variant_area).toEqual({
      layout: "vertical",
      gap: 48,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    });
  });

  test("serves token theme agent commands and rematerializes bound token values", async () => {
    const server = await createServerWithDocument();

    const imported = await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark"],
          activeThemes: ["theme-light"]
        },
        $themes: [
          {
            id: "theme-light",
            name: "Light",
            group: "mode",
            selectedTokenSets: ["base", "light"]
          },
          {
            id: "theme-dark",
            name: "Dark",
            group: "mode",
            selectedTokenSets: ["base", "dark"]
          }
        ],
        base: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#f8fafc"
            }
          }
        },
        light: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#ffffff"
            }
          }
        },
        dark: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#0f172a"
            }
          }
        }
      }
    });
    expect(imported.statusCode).toBe(200);

    const prepared = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_rectangle",
            parentId: "page-1",
            id: "surface-card",
            name: "Surface Card",
            x: 160,
            y: 120,
            width: 160,
            height: 96,
            fill: "#ffffff"
          },
          {
            type: "set_fill_token",
            nodeId: "surface-card",
            tokenId: "color-base-surface-canvas"
          }
        ]
      }
    });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json().result.preview.pages[0].children.find((node: { id: string }) => node.id === "surface-card").style.fill).toBe("#ffffff");

    const themed = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [{ type: "set_token_theme_enabled", tokenThemeId: "theme-dark", enabled: true }]
      }
    });
    expect(themed.statusCode).toBe(200);
    expect(themed.json().result.audit.commandTypes).toContain("set_token_theme_enabled");

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    const card = file.json().file.pages[0].children.find((node: { id: string }) => node.id === "surface-card");
    expect(card.style).toMatchObject({
      fill: "#0f172a",
      fill_token: "color-base-surface-canvas"
    });
    expect(file.json().file.token_themes).toEqual([
      {
        id: "theme-light",
        name: "Light",
        group: "mode",
        enabled: false,
        token_set_ids: ["base", "light"]
      },
      {
        id: "theme-dark",
        name: "Dark",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark"]
      }
    ]);

    const inspect = await server.inject({ method: "GET", url: "/files/sample-file/agent/inspect" });
    expect(inspect.json().inspection.tokenThemes).toEqual(file.json().file.token_themes);
  });

  test("validates token themes that reference missing token sets", async () => {
    const server = await createServerWithDocument();

    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base"],
          activeThemes: ["theme-broken"]
        },
        $themes: [
          {
            id: "theme-broken",
            name: "Broken",
            group: "mode",
            selectedTokenSets: ["base", "missing"]
          }
        ],
        base: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#2563eb"
            }
          }
        }
      }
    });

    const validate = await server.inject({ method: "GET", url: "/files/sample-file/agent/validate" });
    expect(validate.json().validation.issues).toContainEqual({
      code: "missing_token_theme_set",
      message: "token theme references missing token set: theme-broken -> missing"
    });
  });

  test("agent commands manage token themes without raw DTCG edits", async () => {
    const server = await createServerWithDocument();

    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark"],
          activeTokenSets: ["base"]
        },
        base: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#f8fafc"
            }
          }
        },
        light: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#ffffff"
            }
          }
        },
        dark: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#0f172a"
            }
          }
        }
      }
    });

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-high-contrast",
              name: "High Contrast",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "dark"]
            }
          },
          {
            type: "set_fill_token",
            nodeId: "text-1",
            tokenId: "color-base-surface-canvas"
          }
        ]
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().result.audit.commandTypes).toContain("upsert_token_theme");

    const afterCreate = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(afterCreate.json().file.token_themes).toEqual([
      {
        id: "theme-high-contrast",
        name: "High Contrast",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark"]
      }
    ]);
    expect(afterCreate.json().file.pages[0].children[0].children[0].style).toMatchObject({
      fill: "#0f172a",
      fill_token: "color-base-surface-canvas"
    });

    const updated = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-high-contrast",
              name: "Light Review",
              group: "review",
              enabled: true,
              token_set_ids: ["base", "light"]
            }
          }
        ]
      }
    });
    expect(updated.statusCode).toBe(200);

    const afterUpdate = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(afterUpdate.json().file.token_themes).toEqual([
      {
        id: "theme-high-contrast",
        name: "Light Review",
        group: "review",
        enabled: true,
        token_set_ids: ["base", "light"]
      }
    ]);
    expect(afterUpdate.json().file.pages[0].children[0].children[0].style.fill).toBe("#ffffff");

    const deleted = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [{ type: "delete_token_theme", tokenThemeId: "theme-high-contrast" }]
      }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().result.audit.commandTypes).toContain("delete_token_theme");

    const inspect = await server.inject({ method: "GET", url: "/files/sample-file/agent/inspect" });
    expect(inspect.json().inspection.tokenThemes).toEqual([]);
  });

  test("agent commands reorder token themes and theme token set priority", async () => {
    const server = await createServerWithDocument();

    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark"]
        },
        base: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#f8fafc"
            }
          }
        },
        light: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#ffffff"
            }
          }
        },
        dark: {
          Surface: {
            Canvas: {
              $type: "color",
              $value: "#0f172a"
            }
          }
        }
      }
    });

    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-review",
              name: "Review",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "light", "dark"]
            }
          },
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-alt",
              name: "Alt",
              group: "preview",
              enabled: false,
              token_set_ids: ["base", "light"]
            }
          },
          {
            type: "set_fill_token",
            nodeId: "text-1",
            tokenId: "color-base-surface-canvas"
          }
        ]
      }
    });
    expect(created.statusCode).toBe(200);

    const reordered = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          { type: "reorder_token_theme", tokenThemeId: "theme-review", direction: "down" },
          {
            type: "reorder_token_theme_set",
            tokenThemeId: "theme-review",
            tokenSetId: "light",
            direction: "down"
          }
        ]
      }
    });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json().result.audit.commandTypes).toEqual([
      "reorder_token_theme",
      "reorder_token_theme_set"
    ]);

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(file.json().file.token_themes).toEqual([
      {
        id: "theme-alt",
        name: "Alt",
        group: "preview",
        enabled: false,
        token_set_ids: ["base", "light"]
      },
      {
        id: "theme-review",
        name: "Review",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark", "light"]
      }
    ]);
    expect(file.json().file.pages[0].children[0].children[0].style).toMatchObject({
      fill: "#ffffff",
      fill_token: "color-base-surface-canvas"
    });

    const exported = await server.inject({ method: "GET", url: "/files/sample-file/tokens/dtcg" });
    expect(exported.json().tokens.$themes.map((theme: { id: string }) => theme.id)).toEqual([
      "theme-alt",
      "theme-review"
    ]);
    expect(
      exported.json().tokens.$themes.find((theme: { id: string }) => theme.id === "theme-review").selectedTokenSets
    ).toEqual(["base", "dark", "light"]);
  });

  test("serves repo component mappings and includes them in code export", async () => {
    const server = await createServerWithDocument();

    await server.inject({
      method: "POST",
      url: "/files/sample-file/components",
      payload: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
    });

    const saved = await server.inject({
      method: "PUT",
      url: "/files/sample-file/code-mappings",
      payload: {
        mappings: [
          {
            id: "mapping-card",
            component_id: "component-card",
            package_name: "@repo/ui",
            import_path: "@repo/ui/card",
            export_name: "Card",
            import_mode: "named",
            props: [
              {
                name: "title",
                type: "string",
                source_node_id: "text-1",
                source_field: "text",
                default_value: "Layo"
              }
            ],
            variant_props: [
              {
                name: "surface",
                type: "string",
                variant_property: "surface",
                default_value: "elevated"
              }
            ],
            docs_url: "https://repo.example/ui/card"
          }
        ]
      }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().mappings).toEqual([
      expect.objectContaining({ id: "mapping-card", component_id: "component-card" })
    ]);

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/code-mappings" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().mappings[0]).toMatchObject({
      id: "mapping-card",
      import_path: "@repo/ui/card"
    });

    const exported = await server.inject({ method: "GET", url: "/files/sample-file/export/code" });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().export.implementationSpec.components[0].repoMapping).toMatchObject({
      componentId: "component-card",
      importStatement: 'import { Card } from "@repo/ui/card";',
      usage: '<Card title={title} surface="elevated" />',
      variantProps: [
        {
          name: "surface",
          type: "string",
          variantProperty: "surface",
          defaultValue: "elevated"
        }
      ]
    });
    expect(exported.json().export.elements[0].structure.repoMapping).toMatchObject({
      componentId: "component-card",
      importPath: "@repo/ui/card"
    });

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(file.json().file.code_mappings).toEqual(saved.json().mappings);
  });

  test("serves agent inspect, find, command, validate, and change-summary routes", async () => {
    const server = await createServerWithDocument();

    const before = await server.inject({ method: "GET", url: "/files/sample-file" });
    const inspect = await server.inject({ method: "GET", url: "/files/sample-file/agent/inspect" });
    expect(inspect.statusCode).toBe(200);
    expect(inspect.json().inspection).toMatchObject({
      nodeCount: 2,
      componentCount: 0
    });

    const find = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/find",
      payload: { text: "Layo" }
    });
    expect(find.statusCode).toBe(200);
    expect(find.json().nodes.map((node: { id: string }) => node.id)).toEqual(["text-1"]);

    const dryRun = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: true,
        commands: [
          {
            type: "create_text",
            parentId: "page-1",
            id: "agent-http-note",
            name: "에이전트 HTTP 메모",
            value: "HTTP 에이전트 편집",
            x: 112,
            y: 380,
            width: 260,
            height: 48
          }
        ]
      }
    });
    expect(dryRun.statusCode).toBe(200);
    expect(dryRun.json().result.persisted).toBe(false);

    const afterDryRun = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(JSON.stringify(afterDryRun.json().file)).not.toContain("HTTP 에이전트 편집");

    const persisted = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_text",
            parentId: "page-1",
            id: "agent-http-note",
            name: "에이전트 HTTP 메모",
            value: "HTTP 에이전트 편집",
            x: 112,
            y: 380,
            width: 260,
            height: 48
          }
        ]
      }
    });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().result.audit.changedNodeIds).toEqual(["agent-http-note"]);

    const validate = await server.inject({ method: "GET", url: "/files/sample-file/agent/validate" });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().validation.issueCount).toBe(0);

    const after = await server.inject({ method: "GET", url: "/files/sample-file" });
    const summary = await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/change-summary",
      payload: { before: before.json().file, after: after.json().file }
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.createdNodeIds).toEqual(["agent-http-note"]);
  });

  test("serves file version save, list, read, and restore routes", async () => {
    const server = await createServerWithDocument();

    const saved = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "검토 전" }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().version).toMatchObject({
      fileId: "sample-file",
      message: "검토 전",
      source: "manual"
    });

    const changed = await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/text-1/text",
      payload: { value: "HTTP 복원 대상" }
    });
    expect(changed.statusCode).toBe(200);

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/versions" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().versions.map((item: { versionId: string }) => item.versionId)).toContain(
      saved.json().version.versionId
    );
    expect(JSON.stringify(listed.json())).not.toContain("\"document\"");

    const read = await server.inject({
      method: "GET",
      url: `/files/sample-file/versions/${saved.json().version.versionId}`
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().version.document.pages[0].children[0].children[0].content.value).toBe("Layo");

    const restored = await server.inject({
      method: "POST",
      url: `/files/sample-file/versions/${saved.json().version.versionId}/restore`
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().file.pages[0].children[0].children[0].content.value).toBe("Layo");
    expect(restored.json().recoveryVersion.source).toBe("restore");
  });

  test("pins and unpins a file version through HTTP", async () => {
    const server = await createServerWithDocument();

    const saved = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "릴리즈 검토" }
    });
    expect(saved.statusCode).toBe(200);
    const versionId = saved.json().version.versionId;

    const pinned = await server.inject({
      method: "PATCH",
      url: `/files/sample-file/versions/${versionId}/pin`,
      payload: { pinned: true }
    });
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json().version).toMatchObject({ versionId, pinned: true });

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/versions" });
    expect(listed.json().versions[0]).toMatchObject({ versionId, pinned: true });

    const unpinned = await server.inject({
      method: "PATCH",
      url: `/files/sample-file/versions/${versionId}/pin`,
      payload: { pinned: false }
    });
    expect(unpinned.statusCode).toBe(200);
    expect(unpinned.json().version).toMatchObject({ versionId, pinned: false });
  });

  test("file version retention deletes versions and prunes only old unpinned versions through HTTP", async () => {
    const server = await createServerWithDocument();

    const deletedCandidate = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "삭제할 고정 버전" }
    });
    const deletedCandidateId = deletedCandidate.json().version.versionId;
    await server.inject({
      method: "PATCH",
      url: `/files/sample-file/versions/${deletedCandidateId}/pin`,
      payload: { pinned: true }
    });

    const deleted = await server.inject({
      method: "DELETE",
      url: `/files/sample-file/versions/${deletedCandidateId}`
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().version).toMatchObject({
      versionId: deletedCandidateId,
      pinned: true,
      deleted: true
    });

    const protectedVersion = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "릴리즈 기준" }
    });
    const protectedVersionId = protectedVersion.json().version.versionId;
    await server.inject({
      method: "PATCH",
      url: `/files/sample-file/versions/${protectedVersionId}/pin`,
      payload: { pinned: true }
    });
    const oldVersion = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "오래된 작업" }
    });
    await server.inject({
      method: "PATCH",
      url: "/files/sample-file/nodes/text-1/text",
      payload: { value: "최신 작업" }
    });
    const newestVersion = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "최신 작업" }
    });

    const pruned = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions/prune",
      payload: { keepUnpinned: 1 }
    });
    expect(pruned.statusCode).toBe(200);
    expect(pruned.json().result.deletedVersions).toEqual([
      expect.objectContaining({ versionId: oldVersion.json().version.versionId, pinned: false })
    ]);

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/versions" });
    expect(listed.json().versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ versionId: protectedVersionId, pinned: true }),
        expect.objectContaining({ versionId: newestVersion.json().version.versionId, pinned: false })
      ])
    );
    expect(listed.json().versions.map((version: { versionId: string }) => version.versionId)).not.toContain(
      oldVersion.json().version.versionId
    );
  });

  test("serves automatic file versions created by persisted agent commands", async () => {
    const server = await createServerWithDocument();

    for (const value of ["HTTP 자동 1", "HTTP 자동 2", "HTTP 자동 3"]) {
      const response = await server.inject({
        method: "POST",
        url: "/files/sample-file/agent/commands",
        payload: {
          dryRun: false,
          commands: [{ type: "update_text", nodeId: "text-1", value }]
        }
      });
      expect(response.statusCode).toBe(200);
    }

    const listed = await server.inject({ method: "GET", url: "/files/sample-file/versions" });
    expect(listed.statusCode).toBe(200);
    const autoVersion = listed
      .json()
      .versions.find((version: { source: string }) => version.source === "auto");
    expect(autoVersion).toMatchObject({ message: "자동 저장", source: "auto" });

    const read = await server.inject({
      method: "GET",
      url: `/files/sample-file/versions/${autoVersion.versionId}`
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().version.document.pages[0].children[0].children[0].content.value).toBe("HTTP 자동 3");
  });

  test("exports a design file as CSS, HTML, and importable element modules", async () => {
    const server = await createServerWithDocument();

    const response = await server.inject({
      method: "GET",
      url: "/files/sample-file/export/code?moduleBasePath=./elements"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.export.css).toContain(".canvas-export-root");
    expect(body.export.html).toContain('data-node-id="frame-1"');
    expect(body.export.elements.map((element: { id: string }) => element.id)).toEqual(["frame-1"]);
    expect(body.export.elements[0].jsModule).toContain("export default");
    expect(body.export.elements[0].structure).toMatchObject({
      id: "frame-1",
      kind: "frame",
      children: [{ id: "text-1", kind: "text" }]
    });
    expect(body.export.elements[0].implementation).toMatchObject({
      componentName: "Frame1",
      suggestedProps: [
        {
          name: "text",
          type: "string",
          sourceNodeId: "text-1",
          defaultValue: "Layo"
        }
      ]
    });
    expect(body.export.implementationSpec.elements[0].id).toBe("frame-1");
    expect(body.export.implementationSpec.tokenCandidates.fontFamilies).toContain("Inter");
    expect(body.export.indexModule).toContain('from "./elements/frame-1.mjs"');
  });

  test("imports and exports document design tokens as DTCG JSON", async () => {
    const server = await createServerWithDocument();

    const imported = await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        global: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#2563eb"
            }
          },
          Spacing: {
            Large: {
              $type: "dimension",
              $value: "32px"
            }
          }
        }
      }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().tokens).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      },
      {
        id: "spacing-spacing-large",
        name: "Spacing / Large",
        type: "spacing",
        value: "32px"
      }
    ]);

    const exported = await server.inject({
      method: "GET",
      url: "/files/sample-file/tokens/dtcg"
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().tokens).toMatchObject({
      $metadata: {
        tokenSetOrder: ["global"],
        activeThemes: []
      },
      global: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        },
        Spacing: {
          Large: {
            $type: "dimension",
            $value: "32px"
          }
        }
      }
    });

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(file.json().file.tokens).toEqual(imported.json().tokens);
  });
});

async function readCommentStreamEvent(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("comment event stream has no readable body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
        setTimeout(() => reject(new Error("timed out waiting for comment event")), 3_000)
      )
    ]);
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      if (!block.includes("event: comment")) {
        continue;
      }
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      return JSON.parse(data) as Record<string, unknown>;
    }
  }

  throw new Error("comment event was not emitted");
}
