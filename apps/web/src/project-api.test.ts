import { describe, expect, test } from "vitest";
import {
  createProject,
  deleteProject,
  duplicateProject,
  exportProjectArchive,
  fetchProjects,
  importProjectArchive,
  reviewProjectArchive,
  setProjectSharing,
  updateProject,
  type ProjectManifest
} from "./project-api";

const project: ProjectManifest = {
  schemaVersion: 1,
  projectId: "project-web",
  name: "웹 프로젝트",
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z",
  currentDocumentId: "document-web",
  documents: [
    {
      documentId: "document-web",
      name: "웹 문서",
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z"
    }
  ],
  sharing: { mode: "private" }
};

describe("project api", () => {
  test("fetches project list payloads", async () => {
    const fetcher = async () => new Response(JSON.stringify({ projects: [project] }), { status: 200 });

    await expect(fetchProjects(fetcher as typeof fetch)).resolves.toEqual([project]);
  });

  test("creates, renames, and shares projects", async () => {
    const requests: Array<{ url: string; method: string | undefined; headers: unknown; body: unknown }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method,
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      return new Response(JSON.stringify({ project }), { status: 200 });
    };

    await createProject({ name: "새 프로젝트" }, fetcher as typeof fetch);
    await updateProject(
      "project-web",
      { name: "리네임" },
      fetcher as typeof fetch,
      { userId: "team-owner", memberToken: "owner-token" }
    );
    await duplicateProject(
      "project-web",
      { projectId: "project-web-copy", name: "복제", documentIdPrefix: "web-copy" },
      fetcher as typeof fetch,
      { userId: "team-owner", memberToken: "owner-token" }
    );
    await setProjectSharing(
      "project-web",
      { mode: "team", teamId: "team-web" },
      fetcher as typeof fetch,
      { userId: "team-owner", memberToken: "owner-token" }
    );
    await deleteProject(
      "project-web-copy",
      fetcher as typeof fetch,
      { userId: "team-owner", memberToken: "owner-token" }
    );

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:4317/projects",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { name: "새 프로젝트" }
      },
      {
        url: "http://127.0.0.1:4317/projects/project-web",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-layo-user-id": "team-owner",
          Authorization: "Bearer owner-token"
        },
        body: { name: "리네임" }
      },
      {
        url: "http://127.0.0.1:4317/projects/project-web/duplicate",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-layo-user-id": "team-owner",
          Authorization: "Bearer owner-token"
        },
        body: { projectId: "project-web-copy", name: "복제", documentIdPrefix: "web-copy" }
      },
      {
        url: "http://127.0.0.1:4317/projects/project-web/sharing",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-layo-user-id": "team-owner",
          Authorization: "Bearer owner-token"
        },
        body: { mode: "team", teamId: "team-web" }
      },
      {
        url: "http://127.0.0.1:4317/projects/project-web-copy",
        method: "DELETE",
        headers: {
          "x-layo-user-id": "team-owner",
          Authorization: "Bearer owner-token"
        },
        body: null
      }
    ]);
  });

  test("reviews imports and exports project archives", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/projects/import/archive/review") {
        return new Response(
          JSON.stringify({
            review: {
              originalProjectId: "project-web",
              originalName: "웹 프로젝트",
              suggestedName: "웹 프로젝트",
              documentCount: 2,
              assetCount: 1,
              documents: [{ originalFileId: "document-web", originalName: "웹 문서", pageCount: 1, nodeCount: 4 }]
            }
          }),
          { status: 200 }
        );
      }

      if (pathname === "/projects/import/archive") {
        expect(init?.headers).toEqual({
          "Content-Type": "application/json",
          "Idempotency-Key": "project-web-import-v1"
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          archiveBase64: "UEs=",
          name: "복원 프로젝트"
        });
        return new Response(
          JSON.stringify({
            imported: {
              project,
              originalProjectId: "project-web",
              originalName: "웹 프로젝트",
              documentCount: 2,
              assetCount: 1,
              documentIdMap: { "document-web": "restored-document-web" }
            }
          }),
          { status: 200 }
        );
      }

      if (pathname === "/projects/project-web/export/archive") {
        return new Response(new Blob([new Uint8Array([0x50, 0x4b])]), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.layo.project-archive+zip",
            "Content-Disposition": 'attachment; filename="project-web.layo-project.zip"'
          }
        });
      }

      return new Response("not found", { status: 404 });
    };

    await expect(reviewProjectArchive("UEs=", fetcher as typeof fetch)).resolves.toMatchObject({
      originalProjectId: "project-web",
      documentCount: 2
    });
    await expect(
      importProjectArchive(
        {
          archiveBase64: "UEs=",
          name: "복원 프로젝트",
          idempotencyKey: "project-web-import-v1"
        } as Parameters<typeof importProjectArchive>[0] & {
          idempotencyKey: string;
        },
        fetcher as typeof fetch
      )
    ).resolves.toMatchObject({ originalProjectId: "project-web", project });
    await expect(exportProjectArchive("project-web", fetcher as typeof fetch)).resolves.toMatchObject({
      fileName: "project-web.layo-project.zip",
      mimeType: "application/vnd.layo.project-archive+zip"
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/projects/import/archive/review"), "POST"],
      [expect.stringContaining("/projects/import/archive"), "POST"],
      [expect.stringContaining("/projects/project-web/export/archive"), "GET"]
    ]);
  });
});
