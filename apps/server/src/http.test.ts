import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";
import type { TeamAuthorizationConfig } from "./team-authorization";

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

function penpotComponentHttpArchive() {
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  const fileId = "10101010-1010-1010-1010-101010101010";
  const pageId = "20202020-2020-2020-2020-202020202020";
  const componentId = "30303030-3030-3030-3030-303030303030";
  const mainId = "40404040-4040-4040-4040-404040404040";
  const mainLabelId = "50505050-5050-5050-5050-505050505050";
  const copyId = "60606060-6060-6060-6060-606060606060";
  const copyLabelId = "70707070-7070-7070-7070-707070707070";
  return {
    componentId,
    mainId,
    mainLabelId,
    copyId,
    archive: createZipArchive([
      {
        path: "manifest.json",
        data: json({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "HTTP components", features: ["components/v2"] }]
        })
      },
      { path: `files/${fileId}.json`, data: json({ id: fileId, name: "HTTP components" }) },
      {
        path: `files/${fileId}/pages/${pageId}.json`,
        data: json({ id: pageId, name: "Components", objects: {} })
      },
      {
        path: `files/${fileId}/pages/${pageId}/${mainId}.json`,
        data: json({
          id: mainId,
          name: "Button",
          type: "frame",
          x: 80,
          y: 96,
          width: 180,
          height: 56,
          "main-instance": true,
          "component-root": true,
          "component-id": componentId,
          shapes: [mainLabelId]
        })
      },
      {
        path: `files/${fileId}/pages/${pageId}/${mainLabelId}.json`,
        data: json({
          id: mainLabelId,
          name: "Label",
          type: "text",
          x: 112,
          y: 112,
          width: 116,
          height: 24,
          content: "Submit"
        })
      },
      {
        path: `files/${fileId}/pages/${pageId}/${copyId}.json`,
        data: json({
          id: copyId,
          name: "Button copy",
          type: "frame",
          x: 320,
          y: 96,
          width: 180,
          height: 56,
          "component-root": true,
          "component-id": componentId,
          "shape-ref": mainId,
          shapes: [copyLabelId]
        })
      },
      {
        path: `files/${fileId}/pages/${pageId}/${copyLabelId}.json`,
        data: json({
          id: copyLabelId,
          name: "Label",
          type: "text",
          x: 352,
          y: 112,
          width: 116,
          height: 24,
          "shape-ref": mainLabelId,
          touched: ["text-content-group"],
          content: "Continue"
        })
      }
    ])
  };
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

  test("replaces a validated complete editor snapshot without changing file identity", async () => {
    const server = await createServerWithDocument();
    const current = await server.inject({ method: "GET", url: "/files/sample-file" });
    const document = current.json().file;
    document.pages[0].children[0].transform.x = 321;

    const replaced = await server.inject({
      method: "PUT",
      url: "/files/sample-file",
      payload: { document }
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().file.pages[0].children[0].transform.x).toBe(321);

    const mismatched = await server.inject({
      method: "PUT",
      url: "/files/sample-file",
      payload: { document: { ...document, id: "other-file" } }
    });
    expect(mismatched.statusCode).toBe(400);

    const persisted = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(persisted.json().file.id).toBe("sample-file");
    expect(persisted.json().file.pages[0].children[0].transform.x).toBe(321);
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

  test("reviews external Penpot migration payloads without importing", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));
    const penpotArchive = createZipArchive([
      { path: "manifest.json", data: Buffer.from('{"source":"penpot"}', "utf8") },
      { path: "files/home.json", data: Buffer.from('{"name":"Home","pages":[{"id":"page-1"}]}', "utf8") }
    ]);

    const review = await server.inject({
      method: "POST",
      url: "/migrations/external/review",
      payload: {
        archiveBase64: penpotArchive.toString("base64"),
        fileName: "handoff.penpot"
      }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().review).toMatchObject({
      source: "penpot",
      archiveKind: "zip",
      canImport: false,
      blockedBy: expect.arrayContaining(["mapping_not_implemented"])
    });
    expect(await new FileStorage(tempRoot).listProjects()).toEqual([]);
  });

  test("persists imported Penpot components through HTTP, agent inspection, and code handoff", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const fixture = penpotComponentHttpArchive();

    const response = await server.inject({
      method: "POST",
      url: "/migrations/external/import",
      payload: {
        archiveBase64: fixture.archive.toString("base64"),
        fileName: "components.penpot",
        projectId: "penpot-component-project",
        documentId: "penpot-component-document",
        name: "Penpot components"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().imported.file.components).toEqual([
      expect.objectContaining({
        id: `penpot-component-${fixture.componentId}`,
        source_node: expect.objectContaining({ id: `penpot-${fixture.mainId}`, kind: "component" })
      })
    ]);

    const persisted = await storage.readFile("penpot-component-document");
    const copy = persisted.pages[0].children.find(
      (node) => node.id === `penpot-${fixture.copyId}`
    );
    expect(copy).toMatchObject({
      kind: "component_instance",
      component_instance: {
        definition_id: `penpot-component-${fixture.componentId}`,
        variant_id: "default",
        overrides: [
          {
            node_id: `penpot-${fixture.mainLabelId}`,
            field: "text",
            value: "Continue"
          }
        ],
        detached: false
      }
    });

    const inspect = await server.inject({
      method: "GET",
      url: "/files/penpot-component-document/agent/inspect"
    });
    expect(inspect.statusCode).toBe(200);
    expect(inspect.json().inspection).toMatchObject({ componentCount: 1 });

    const validate = await server.inject({
      method: "GET",
      url: "/files/penpot-component-document/agent/validate"
    });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().validation.issues).toEqual([]);

    const exported = await server.inject({
      method: "GET",
      url: "/files/penpot-component-document/export/code"
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().export.implementationSpec.components[0]).toMatchObject({
      id: `penpot-component-${fixture.componentId}`,
      sourceNodeId: `penpot-${fixture.mainId}`
    });
    const exportedCopy = exported.json().export.elements.find(
      (element: { id: string }) => element.id === `penpot-${fixture.copyId}`
    );
    expect(exportedCopy.structure.componentRef).toMatchObject({
      definitionId: `penpot-component-${fixture.componentId}`,
      variantId: "default",
      detached: false,
      overrides: [
        expect.objectContaining({
          nodeId: `penpot-${fixture.mainLabelId}`,
          value: "Continue"
        })
      ]
    });
  });

  test("imports external Figma REST JSON into a fresh project", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const figmaFile = Buffer.from(
      JSON.stringify({
        name: "Figma landing",
        document: {
          id: "0:0",
          name: "Document",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              name: "Page 1",
              type: "CANVAS",
              children: [
                {
                  id: "2:1",
                  name: "Hero",
                  type: "FRAME",
                  absoluteBoundingBox: { x: 10, y: 20, width: 320, height: 180 },
                  children: [
                    {
                      id: "3:1",
                      name: "Imported title",
                      type: "TEXT",
                      characters: "Hello from Figma",
                      absoluteBoundingBox: { x: 34, y: 48, width: 180, height: 28 },
                      style: { fontSize: 20, fontFamily: "Inter" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }),
      "utf8"
    );

    const response = await server.inject({
      method: "POST",
      url: "/migrations/external/import",
      payload: {
        archiveBase64: figmaFile.toString("base64"),
        fileName: "landing.figma.json",
        name: "Imported Figma"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.imported).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      mappedNodeCount: 2,
      skippedNodeCount: 0,
      project: {
        name: "Imported Figma"
      },
      file: {
        name: "Imported Figma",
        pages: [{ name: "Page 1" }]
      }
    });
    const projects = await storage.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId: body.imported.project.projectId,
      currentDocumentId: body.imported.project.currentDocumentId,
      name: "Imported Figma"
    });
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    expect(persisted.pages[0].children[0].children[0]).toMatchObject({
      kind: "text",
      name: "Imported title",
      content: { type: "text", value: "Hello from Figma" }
    });
  });

  test("imports external Figma image assets into local asset storage", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const pngBytes = Buffer.from(pixelPng, "base64");
    const figmaPackage = createZipArchive([
      {
        path: "figma-file.json",
        data: Buffer.from(
          JSON.stringify({
            name: "Figma image landing",
            document: {
              id: "0:0",
              name: "Document",
              type: "DOCUMENT",
              children: [
                {
                  id: "1:1",
                  name: "Page 1",
                  type: "CANVAS",
                  children: [
                    {
                      id: "2:1",
                      name: "Hero",
                      type: "FRAME",
                      absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
                      children: [
                        {
                          id: "3:1",
                          name: "Hero image",
                          type: "RECTANGLE",
                          absoluteBoundingBox: { x: 24, y: 26, width: 180, height: 96 },
                          fills: [
                            {
                              type: "IMAGE",
                              visible: true,
                              imageRef: "figma-image-hero",
                              scaleMode: "FILL"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }),
          "utf8"
        )
      },
      { path: "assets/figma-image-hero.png", data: pngBytes }
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/migrations/external/import",
      payload: {
        archiveBase64: figmaPackage.toString("base64"),
        fileName: "figma-image-package.zip",
        name: "Imported Figma Image"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.imported).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      mappedNodeCount: 2,
      skippedNodeCount: 0,
      assetCount: 1
    });
    const projects = await storage.listProjects();
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    expect(persisted.pages[0].children[0].children[0]).toMatchObject({
      kind: "image",
      name: "Hero image",
      content: {
        type: "image",
        asset_id: "figma-asset-figma-image-hero",
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });

    const importedAsset = await server.inject({
      method: "GET",
      url: "/assets/figma-asset-figma-image-hero"
    });
    expect(importedAsset.statusCode).toBe(200);
    expect(importedAsset.headers["content-type"]).toContain("image/png");
    expect(importedAsset.rawPayload.equals(pngBytes)).toBe(true);
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

  test("deletes only image assets that are not referenced by a document", async () => {
    const server = await createServerWithDocument();
    const uploadAsset = async (name: string) => {
      const uploaded = await server.inject({
        method: "POST",
        url: "/assets",
        payload: {
          name,
          mimeType: "image/png",
          dataBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
        }
      });
      expect(uploaded.statusCode).toBe(200);
      return uploaded.json().asset as { assetId: string; url: string };
    };

    const unusedAsset = await uploadAsset("unused.png");
    const deleted = await server.inject({ method: "DELETE", url: unusedAsset.url });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({
      result: { assetId: unusedAsset.assetId, deleted: true, reason: "unreferenced" }
    });
    expect((await server.inject({ method: "GET", url: unusedAsset.url })).statusCode).toBe(404);

    const referencedAsset = await uploadAsset("referenced.png");
    const created = await server.inject({
      method: "POST",
      url: "/files/sample-file/nodes",
      payload: {
        parentId: "page-1",
        node: {
          id: "asset-cleanup-image",
          kind: "image",
          name: "참조 이미지",
          transform: { x: 40, y: 40, rotation: 0 },
          size: { width: 120, height: 80 },
          style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "image",
            asset_id: referencedAsset.assetId,
            natural_width: 1,
            natural_height: 1,
            fit_mode: "fit"
          },
          children: []
        }
      }
    });
    expect(created.statusCode).toBe(200);

    const retained = await server.inject({ method: "DELETE", url: referencedAsset.url });
    expect(retained.statusCode).toBe(200);
    expect(retained.json()).toEqual({
      result: { assetId: referencedAsset.assetId, deleted: false, reason: "referenced" }
    });
    expect((await server.inject({ method: "GET", url: referencedAsset.url })).statusCode).toBe(200);

    const savedVersion = await server.inject({
      method: "POST",
      url: "/files/sample-file/versions",
      payload: { message: "이미지 복구 기준" }
    });
    expect(savedVersion.statusCode).toBe(200);
    const currentFile = (await server.inject({ method: "GET", url: "/files/sample-file" })).json().file;
    currentFile.pages[0].children = currentFile.pages[0].children.filter(
      (node: { id: string }) => node.id !== "asset-cleanup-image"
    );
    const detached = await server.inject({
      method: "PUT",
      url: "/files/sample-file",
      payload: { document: currentFile }
    });
    expect(detached.statusCode).toBe(200);

    const retainedForHistory = await server.inject({ method: "DELETE", url: referencedAsset.url });
    expect(retainedForHistory.json()).toEqual({
      result: { assetId: referencedAsset.assetId, deleted: false, reason: "referenced" }
    });
    expect((await server.inject({ method: "GET", url: referencedAsset.url })).statusCode).toBe(200);
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

  test("retries library publication through Idempotency-Key without a second result", async () => {
    const server = await createServerWithDocument();
    const request = {
      method: "POST" as const,
      url: "/libraries",
      headers: { "idempotency-key": "publish-team-kit-v1" },
      payload: {
        fileId: "sample-file",
        libraryId: "team-kit",
        name: "Team Kit"
      }
    };

    const first = await server.inject(request);
    const retried = await server.inject(request);
    expect(first.statusCode).toBe(200);
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toEqual(first.json());

    const conflict = await server.inject({
      ...request,
      payload: { ...request.payload, name: "Another Kit" }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().message).toMatch(/idempotency key was already used/i);

    const invalid = await server.inject({
      ...request,
      headers: { "idempotency-key": "../unsafe" }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toMatch(/idempotency key/i);
  });

  test("filters hosted registry lists to the authenticated member teams", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    for (const [teamId, fileId] of [
      ["team-alpha", "alpha-file"],
      ["team-beta", "beta-file"]
    ] as const) {
      const projectId = `${teamId}-project`;
      await storage.createProject({
        projectId,
        name: teamId,
        documentId: fileId,
        documentName: fileId
      });
      await storage.setProjectSharing(projectId, { mode: "team", teamId });
      await storage.publishLibraryToRegistry(fileId, {
        libraryId: `${teamId}-kit`,
        name: `${teamId} Kit`
      });
    }
    await storage.createProject({
      projectId: "private-project",
      name: "Private",
      documentId: "private-file",
      documentName: "Private"
    });
    await storage.publishLibraryToRegistry("private-file", {
      libraryId: "private-kit",
      name: "Private Kit"
    });

    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          {
            userId: "alpha-viewer",
            role: "viewer",
            teamIds: ["team-alpha"],
            token: "alpha-token"
          }
        ]
      }
    });

    const missing = await server.inject({
      method: "GET",
      url: "/libraries"
    });
    expect(missing.statusCode).toBe(401);

    const listed = await server.inject({
      method: "GET",
      url: "/libraries",
      headers: {
        authorization: "Bearer alpha-token",
        "x-layo-user-id": "alpha-viewer"
      }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().libraries).toEqual([
      expect.objectContaining({
        libraryId: "team-alpha-kit",
        teamId: "team-alpha"
      })
    ]);

    const wrongTeamFile = await server.inject({
      method: "GET",
      url: "/libraries?fileId=beta-file",
      headers: {
        authorization: "Bearer alpha-token",
        "x-layo-user-id": "alpha-viewer"
      }
    });
    expect(wrongTeamFile.statusCode).toBe(403);

    const sameTeamFile = await server.inject({
      method: "GET",
      url: "/libraries?fileId=alpha-file",
      headers: {
        authorization: "Bearer alpha-token",
        "x-layo-user-id": "alpha-viewer"
      }
    });
    expect(sameTeamFile.statusCode).toBe(200);
    expect(sameTeamFile.json().libraries).toEqual([
      expect.objectContaining({
        libraryId: "team-alpha-kit",
        teamId: "team-alpha"
      })
    ]);
  });

  test("authenticates hosted registry requests with named tokens and rejects one revoked token", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot), {
      libraryRegistryAuth: {
        members: [
          {
            userId: "automation-user",
            role: "viewer",
            teamIds: ["team-alpha"],
            tokens: [
              {
                id: "active",
                name: "Active automation",
                token: "active-secret"
              },
              {
                id: "retired",
                name: "Retired automation",
                token: "retired-secret",
                revokedAt: "2020-01-01T00:00:00.000Z"
              }
            ]
          }
        ]
      }
    });

    const active = await server.inject({
      method: "GET",
      url: "/libraries",
      headers: {
        authorization: "Bearer active-secret",
        "x-layo-user-id": "automation-user"
      }
    });
    expect(active.statusCode).toBe(200);

    const retired = await server.inject({
      method: "GET",
      url: "/libraries",
      headers: {
        authorization: "Bearer retired-secret",
        "x-layo-user-id": "automation-user"
      }
    });
    expect(retired.statusCode).toBe(401);
  });

  test("authorizes hosted registry review reads by target team", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "beta-source-project",
      name: "Beta Source",
      documentId: "beta-source-file",
      documentName: "Beta Source"
    });
    await storage.setProjectSharing("beta-source-project", {
      mode: "team",
      teamId: "team-beta"
    });
    await storage.publishLibraryToRegistry("beta-source-file", {
      libraryId: "beta-kit",
      name: "Beta Kit"
    });
    await storage.createProject({
      projectId: "beta-target-project",
      name: "Beta Target",
      documentId: "beta-target-file",
      documentName: "Beta Target"
    });
    await storage.setProjectSharing("beta-target-project", {
      mode: "team",
      teamId: "team-beta"
    });
    await storage.importLibraryRegistryItem("beta-target-file", "beta-kit");
    await storage.importLibraryRegistryTokens("beta-target-file", "beta-kit");

    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          {
            userId: "alpha-viewer",
            role: "viewer",
            teamIds: ["team-alpha"],
            token: "alpha-token"
          },
          {
            userId: "beta-viewer",
            role: "viewer",
            teamIds: ["team-beta"],
            token: "beta-token"
          }
        ]
      }
    });
    const routes = [
      {
        method: "POST" as const,
        url: "/files/beta-target-file/import/library/registry/review",
        payload: { libraryId: "beta-kit" }
      },
      {
        method: "POST" as const,
        url: "/files/beta-target-file/import/library/registry/tokens/review",
        payload: { libraryId: "beta-kit" }
      },
      {
        method: "POST" as const,
        url: "/files/beta-target-file/import/library/registry/update/review",
        payload: { libraryId: "beta-kit" }
      },
      {
        method: "GET" as const,
        url: "/files/beta-target-file/libraries/subscriptions"
      },
      {
        method: "GET" as const,
        url: "/files/beta-target-file/libraries/updates"
      },
      {
        method: "GET" as const,
        url: "/files/beta-target-file/libraries/token-subscriptions"
      },
      {
        method: "GET" as const,
        url: "/files/beta-target-file/libraries/token-updates"
      }
    ];

    for (const route of routes) {
      expect((await server.inject(route)).statusCode).toBe(401);
      expect(
        (
          await server.inject({
            ...route,
            headers: {
              authorization: "Bearer alpha-token",
              "x-layo-user-id": "alpha-viewer"
            }
          })
        ).statusCode
      ).toBe(403);
      expect(
        (
          await server.inject({
            ...route,
            headers: {
              authorization: "Bearer beta-token",
              "x-layo-user-id": "beta-viewer"
            }
          })
        ).statusCode
      ).toBe(200);
    }
  });

  test("authorizes team library publication by member token and editor role", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "source-project",
      name: "Source Project",
      documentId: "source-file",
      documentName: "Source File"
    });
    await storage.setProjectSharing("source-project", { mode: "team", teamId: "team-alpha" });
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "viewer", role: "viewer", teamIds: ["team-alpha"], token: "viewer-token" },
          { userId: "editor", role: "editor", teamIds: ["team-alpha"], token: "editor-token" },
          { userId: "other-editor", role: "editor", teamIds: ["team-beta"], token: "other-token" }
        ]
      }
    } as any);
    const publish = (userId: string, token: string) => server.inject({
      method: "POST",
      url: "/libraries",
      headers: {
        authorization: `Bearer ${token}`,
        "x-layo-user-id": userId
      },
      payload: {
        fileId: "source-file",
        libraryId: "team-kit",
        name: "Team Kit"
      }
    });

    const viewer = await publish("viewer", "viewer-token");
    expect(viewer.statusCode).toBe(403);
    await expect(storage.listLibraryRegistry()).resolves.toEqual([]);

    const invalidToken = await publish("editor", "wrong-token");
    expect(invalidToken.statusCode).toBe(401);
    await expect(storage.listLibraryRegistry()).resolves.toEqual([]);

    const wrongTeam = await publish("other-editor", "other-token");
    expect(wrongTeam.statusCode).toBe(403);
    await expect(storage.listLibraryRegistry()).resolves.toEqual([]);

    const editor = await publish("editor", "editor-token");
    expect(editor.statusCode).toBe(200);
    expect(editor.json().library).toMatchObject({
      libraryId: "team-kit",
      teamId: "team-alpha"
    });
  });

  test("blocks viewer registry imports before writing target subscriptions", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "source-project",
      name: "Source Project",
      documentId: "source-file",
      documentName: "Source File"
    });
    await storage.setProjectSharing("source-project", { mode: "team", teamId: "team-alpha" });
    await storage.createProject({
      projectId: "target-project",
      name: "Target Project",
      documentId: "target-file",
      documentName: "Target File"
    });
    await storage.setProjectSharing("target-project", { mode: "team", teamId: "team-alpha" });

    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "viewer", role: "viewer", teamIds: ["team-alpha"], token: "viewer-token" },
          { userId: "editor", role: "editor", teamIds: ["team-alpha"], token: "editor-token" }
        ]
      }
    });
    const editorHeaders = {
      authorization: "Bearer editor-token",
      "x-layo-user-id": "editor"
    };
    const published = await server.inject({
      method: "POST",
      url: "/libraries",
      headers: editorHeaders,
      payload: {
        fileId: "source-file",
        libraryId: "team-kit",
        name: "Team Kit"
      }
    });
    expect(published.statusCode).toBe(200);
    await expect(storage.listLibraryRegistrySubscriptions("target-file")).resolves.toEqual([]);

    const blocked = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry",
      headers: {
        authorization: "Bearer viewer-token",
        "x-layo-user-id": "viewer"
      },
      payload: {
        libraryId: "team-kit",
        idPrefix: "team"
      }
    });
    expect(blocked.statusCode).toBe(403);
    await expect(storage.listLibraryRegistrySubscriptions("target-file")).resolves.toEqual([]);
  });

  test("publishes lists reviews and imports registry libraries", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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

    const published = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().library).toMatchObject({
      libraryId: "team-kit",
      name: "Team Kit",
      sourceFileId: "sample-file",
      componentCount: 1,
      tokenCount: 1
    });

    const libraries = await server.inject({ method: "GET", url: "/libraries" });
    expect(libraries.statusCode).toBe(200);
    expect(libraries.json().libraries).toEqual([expect.objectContaining({ libraryId: "team-kit" })]);

    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "target-project", name: "대상 프로젝트", documentId: "target-file", documentName: "대상 문서" }
    });
    const reviewed = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/review",
      payload: { libraryId: "team-kit" }
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      componentCount: 1,
      tokens: [expect.objectContaining({ originalTokenId: "color-brand-primary" })]
    });

    const imported = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry",
      payload: { libraryId: "team-kit", idPrefix: "team" }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      fileId: "target-file",
      componentCount: 1,
      tokenCount: 1
    });
  });

  test("scopes registry library HTTP list and imports to matching project teams", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "PATCH",
      url: "/projects/test-project/sharing",
      payload: { mode: "team", teamId: "team-alpha" }
    });
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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

    const published = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().library).toMatchObject({ libraryId: "team-kit", teamId: "team-alpha" });

    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "target-project", name: "Target", documentId: "target-file", documentName: "Target" }
    });
    await server.inject({
      method: "PATCH",
      url: "/projects/target-project/sharing",
      payload: { mode: "team", teamId: "team-alpha" }
    });
    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "other-project", name: "Other", documentId: "other-file", documentName: "Other" }
    });
    await server.inject({
      method: "PATCH",
      url: "/projects/other-project/sharing",
      payload: { mode: "team", teamId: "team-beta" }
    });
    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "private-project", name: "Private", documentId: "private-file", documentName: "Private" }
    });

    const targetList = await server.inject({ method: "GET", url: "/libraries?fileId=target-file" });
    expect(targetList.statusCode).toBe(200);
    expect(targetList.json().libraries).toEqual([
      expect.objectContaining({ libraryId: "team-kit", teamId: "team-alpha" })
    ]);

    const otherList = await server.inject({ method: "GET", url: "/libraries?fileId=other-file" });
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().libraries).toEqual([]);

    const privateList = await server.inject({ method: "GET", url: "/libraries?fileId=private-file" });
    expect(privateList.statusCode).toBe(200);
    expect(privateList.json().libraries).toEqual([]);

    const targetReview = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/review",
      payload: { libraryId: "team-kit" }
    });
    expect(targetReview.statusCode).toBe(200);
    expect(targetReview.json().review).toMatchObject({ libraryId: "team-kit", componentCount: 1 });

    const otherReview = await server.inject({
      method: "POST",
      url: "/files/other-file/import/library/registry/review",
      payload: { libraryId: "team-kit" }
    });
    expect(otherReview.statusCode).toBe(403);

    const privateImport = await server.inject({
      method: "POST",
      url: "/files/private-file/import/library/registry",
      payload: { libraryId: "team-kit", idPrefix: "team" }
    });
    expect(privateImport.statusCode).toBe(403);
  });

  test("reviews and imports registry library token bundles through HTTP", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark"],
          activeTokenSets: ["base", "light"]
        },
        base: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#2563eb"
            }
          }
        },
        light: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#1d4ed8"
            }
          }
        },
        dark: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#93c5fd"
            }
          }
        }
      }
    });
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "light", "dark"]
            }
          }
        ]
      }
    });
    const published = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });
    expect(published.statusCode).toBe(200);

    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "target-project", name: "대상 프로젝트", documentId: "target-file", documentName: "대상 문서" }
    });
    await server.inject({
      method: "PUT",
      url: "/files/target-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["legacy"],
          activeTokenSets: ["legacy"]
        },
        legacy: {
          Legacy: {
            Primary: {
              $type: "color",
              $value: "#111827"
            }
          }
        }
      }
    });
    await server.inject({
      method: "POST",
      url: "/files/target-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-legacy",
              name: "Legacy Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["legacy"]
            }
          }
        ]
      }
    });

    const reviewed = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/tokens/review",
      payload: { libraryId: "team-kit" }
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacesTokenCount: 1,
      replacesTokenSetCount: 1,
      replacesTokenThemeCount: 1,
      tokenThemes: [expect.objectContaining({ id: "theme-brand", token_set_ids: ["base", "light", "dark"] })]
    });

    const imported = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/tokens",
      payload: { libraryId: "team-kit" }
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toMatchObject({
      libraryId: "team-kit",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacedTokenCount: 1,
      replacedTokenSetCount: 1,
      replacedTokenThemeCount: 1
    });

    const file = await server.inject({ method: "GET", url: "/files/target-file" });
    expect(file.json().file.tokens.map((token: { id: string }) => token.id)).toEqual([
      "color-base-brand-primary",
      "color-light-brand-primary",
      "color-dark-brand-primary"
    ]);
    expect(file.json().file.token_sets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "light", name: "light", enabled: true },
      { id: "dark", name: "dark", enabled: false }
    ]);
    expect(file.json().file.token_themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "light", "dark"]
      }
    ]);
  });

  test("reports and applies registry library token bundle updates through HTTP", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark"],
          activeTokenSets: ["base", "light"]
        },
        base: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#2563eb"
            }
          }
        },
        light: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#1d4ed8"
            }
          }
        },
        dark: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#93c5fd"
            }
          }
        }
      }
    });
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "light", "dark"]
            }
          }
        ]
      }
    });
    const firstPublish = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });
    await server.inject({
      method: "POST",
      url: "/projects",
      payload: {
        projectId: "target-project",
        name: "대상 프로젝트",
        documentId: "target-file",
        documentName: "대상 문서"
      }
    });
    const imported = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/tokens",
      payload: { libraryId: "team-kit" }
    });
    expect(imported.statusCode).toBe(200);

    const subscriptions = await server.inject({
      method: "GET",
      url: "/files/target-file/libraries/token-subscriptions"
    });
    expect(subscriptions.statusCode).toBe(200);
    expect(subscriptions.json().subscriptions).toEqual([
      expect.objectContaining({
        fileId: "target-file",
        libraryId: "team-kit",
        tokenCount: 3,
        tokenSetCount: 3,
        tokenThemeCount: 1,
        importedRegistryUpdatedAt: firstPublish.json().library.updatedAt
      })
    ]);
    const noUpdates = await server.inject({ method: "GET", url: "/files/target-file/libraries/token-updates" });
    expect(noUpdates.statusCode).toBe(200);
    expect(noUpdates.json().updates).toEqual([]);

    await server.inject({
      method: "PUT",
      url: "/files/sample-file/tokens/dtcg",
      payload: {
        $metadata: {
          tokenSetOrder: ["base", "light", "dark", "contrast"],
          activeTokenSets: ["base", "dark"]
        },
        base: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#0ea5e9"
            }
          }
        },
        light: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#38bdf8"
            }
          }
        },
        dark: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#bae6fd"
            }
          }
        },
        contrast: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#082f49"
            }
          }
        }
      }
    });
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "dark"]
            }
          }
        ]
      }
    });
    const secondPublish = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });

    const updates = await server.inject({ method: "GET", url: "/files/target-file/libraries/token-updates" });
    expect(updates.statusCode).toBe(200);
    expect(updates.json().updates).toEqual([
      expect.objectContaining({
        fileId: "target-file",
        libraryId: "team-kit",
        libraryName: "Team Kit",
        importedRegistryUpdatedAt: firstPublish.json().library.updatedAt,
        registryUpdatedAt: secondPublish.json().library.updatedAt,
        tokenCount: 4,
        tokenSetCount: 4,
        tokenThemeCount: 1
      })
    ]);

    const applied = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/tokens/update",
      payload: { libraryId: "team-kit" }
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 4,
      tokenSetCount: 4,
      tokenThemeCount: 1
    });
    const afterApply = await server.inject({ method: "GET", url: "/files/target-file/libraries/token-updates" });
    expect(afterApply.json().updates).toEqual([]);
    const file = await server.inject({ method: "GET", url: "/files/target-file" });
    expect(file.json().file.tokens.map((token: { id: string; value: string }) => [token.id, token.value])).toEqual([
      ["color-base-brand-primary", "#0ea5e9"],
      ["color-light-brand-primary", "#38bdf8"],
      ["color-dark-brand-primary", "#bae6fd"],
      ["color-contrast-brand-primary", "#082f49"]
    ]);
    expect(file.json().file.token_themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark"]
      }
    ]);
  });

  test("reports and applies registry library updates for subscribed files", async () => {
    const server = await createServerWithDocument();
    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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
    const firstPublish = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });
    await server.inject({
      method: "POST",
      url: "/projects",
      payload: { projectId: "target-project", name: "대상 프로젝트", documentId: "target-file", documentName: "대상 문서" }
    });
    const imported = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry",
      payload: { libraryId: "team-kit", idPrefix: "team" }
    });
    expect(imported.statusCode).toBe(200);

    const subscriptions = await server.inject({
      method: "GET",
      url: "/files/target-file/libraries/subscriptions"
    });
    expect(subscriptions.statusCode).toBe(200);
    expect(subscriptions.json().subscriptions).toEqual([
      expect.objectContaining({
        fileId: "target-file",
        libraryId: "team-kit",
        importedRegistryUpdatedAt: firstPublish.json().library.updatedAt,
        componentIdMap: { "component-card": "team-component-card" }
      })
    ]);
    const noUpdates = await server.inject({ method: "GET", url: "/files/target-file/libraries/updates" });
    expect(noUpdates.statusCode).toBe(200);
    expect(noUpdates.json().updates).toEqual([]);

    await server.inject({
      method: "POST",
      url: "/files/sample-file/agent/commands",
      payload: {
        dryRun: false,
        commands: [
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-badge",
            name: "Library Badge",
            width: 80,
            height: 32,
            fill: "#2563eb"
          },
          { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
        ]
      }
    });
    const secondPublish = await server.inject({
      method: "POST",
      url: "/libraries",
      payload: { fileId: "sample-file", libraryId: "team-kit", name: "Team Kit" }
    });

    const updates = await server.inject({ method: "GET", url: "/files/target-file/libraries/updates" });
    expect(updates.statusCode).toBe(200);
    expect(updates.json().updates).toEqual([
      expect.objectContaining({
        fileId: "target-file",
        libraryId: "team-kit",
        libraryName: "Team Kit",
        importedRegistryUpdatedAt: firstPublish.json().library.updatedAt,
        registryUpdatedAt: secondPublish.json().library.updatedAt,
        componentCount: 2,
        tokenCount: 1
      })
    ]);

    const applied = await server.inject({
      method: "POST",
      url: "/files/target-file/import/library/registry/update",
      payload: { libraryId: "team-kit" }
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      componentCount: 2,
      componentIdMap: {
        "component-card": "team-component-card",
        "component-badge": "team-component-badge"
      }
    });
    const afterApply = await server.inject({ method: "GET", url: "/files/target-file/libraries/updates" });
    expect(afterApply.json().updates).toEqual([]);
    const file = await server.inject({ method: "GET", url: "/files/target-file" });
    expect(file.json().file.components.map((component: { id: string }) => component.id)).toEqual([
      "team-component-card",
      "team-component-badge"
    ]);
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

  test("requires team authorization before resolving a case-folded comment file alias", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "case-comment-auth-project",
      name: "대소문자 코멘트 인증 프로젝트",
      documentId: "Shared-Comment-File",
      documentName: "대소문자 코멘트 인증 문서"
    });
    await storage.setProjectSharing("case-comment-auth-project", {
      mode: "team",
      teamId: "team-case"
    });
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          {
            userId: "owner",
            role: "editor",
            teamIds: ["team-case"],
            token: "owner-token"
          }
        ]
      }
    });

    const anonymous = await server.inject({
      method: "GET",
      url: "/files/shared-comment-file/comments"
    });
    expect(anonymous.statusCode).toBe(401);

    const authorizedExact = await server.inject({
      method: "GET",
      url: "/files/Shared-Comment-File/comments",
      headers: {
        authorization: "Bearer owner-token",
        "x-layo-user-id": "owner"
      }
    });
    expect(authorizedExact.statusCode).toBe(200);
  });

  test("authorizes team comment management and derives stable actors from credentials", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "team-comment-project",
      name: "팀 코멘트 프로젝트",
      documentId: "team-comment-file",
      documentName: "팀 코멘트 문서"
    });
    await storage.setProjectSharing("team-comment-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    await storage.createProject({
      projectId: "private-comment-project",
      name: "개인 코멘트 프로젝트",
      documentId: "private-comment-file",
      documentName: "개인 코멘트 문서"
    });
    await storage.createProject({
      projectId: "other-team-comment-project",
      name: "다른 팀 코멘트 프로젝트",
      documentId: "other-team-comment-file",
      documentName: "다른 팀 코멘트 문서"
    });
    await storage.setProjectSharing("other-team-comment-project", {
      mode: "team",
      teamId: "team-beta"
    });
    await storage.createCommentThread("other-team-comment-file", {
      nodeId: "text-1",
      body: "다른 팀 비공개 코멘트",
      authorId: "outsider",
      authorName: "외부 사용자"
    });

    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "owner", role: "editor", teamIds: ["team-alpha"], token: "owner-token" },
          { userId: "peer", role: "editor", teamIds: ["team-alpha"], token: "peer-token" },
          { userId: "viewer", role: "viewer", teamIds: ["team-alpha"], token: "viewer-token" },
          { userId: "outsider", role: "editor", teamIds: ["team-beta"], token: "outsider-token" }
        ]
      }
    });
    const headers = (userId: string, token: string) => ({
      authorization: `Bearer ${token}`,
      "x-layo-user-id": userId
    });

    expect(
      (await server.inject({ method: "GET", url: "/files/team-comment-file/comments" })).statusCode
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "GET",
          url: "/files/team-comment-file/comments",
          headers: headers("outsider", "outsider-token")
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "GET",
          url: "/files/team-comment-file/comments",
          headers: headers("viewer", "viewer-token")
        })
      ).statusCode
    ).toBe(200);

    const viewerWrite = await server.inject({
      method: "POST",
      url: "/files/team-comment-file/comments",
      headers: headers("viewer", "viewer-token"),
      payload: {
        nodeId: "text-1",
        body: "viewer도 피드백 가능",
        authorId: "spoofed-viewer",
        authorName: "위조된 이름"
      }
    });
    expect(viewerWrite.statusCode).toBe(200);
    expect(viewerWrite.json().thread).toMatchObject({
      authorId: "viewer",
      authorName: "viewer",
      body: "viewer도 피드백 가능"
    });

    const viewerResolved = await server.inject({
      method: "POST",
      url: `/files/team-comment-file/comments/${viewerWrite.json().thread.threadId}/resolve`,
      headers: headers("viewer", "viewer-token")
    });
    expect(viewerResolved.statusCode).toBe(200);
    const viewerActivity = await server.inject({
      method: "GET",
      url: "/comments/activity?limit=8",
      headers: headers("viewer", "viewer-token")
    });
    expect(viewerActivity.statusCode).toBe(200);
    expect(
      viewerActivity.json().feed.events.find(
        (event: { type: string; threadId: string }) =>
          event.type === "resolved"
          && event.threadId === viewerWrite.json().thread.threadId
      )
    ).toMatchObject({
      actorName: "viewer",
      body: "viewer도 피드백 가능"
    });

    const created = await server.inject({
      method: "POST",
      url: "/files/team-comment-file/comments",
      headers: headers("owner", "owner-token"),
      payload: {
        nodeId: "text-1",
        body: "@peer 첫 검수",
        authorId: "spoofed-user",
        authorName: "작성자",
        mentionTargets: [{ userId: "peer", displayName: "동료", role: "editor" }]
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().thread).toMatchObject({
      authorId: "owner",
      authorName: "owner",
      modifiedAt: created.json().thread.createdAt,
      readBy: ["owner"]
    });
    const thread = created.json().thread;

    const blockedPeerEdit = await server.inject({
      method: "PATCH",
      url: `/files/team-comment-file/comments/${thread.threadId}`,
      headers: headers("peer", "peer-token"),
      payload: {
        body: "동료가 바꿀 수 없음",
        expectedModifiedAt: thread.modifiedAt
      }
    });
    expect(blockedPeerEdit.statusCode).toBe(403);

    const edited = await server.inject({
      method: "PATCH",
      url: `/files/team-comment-file/comments/${thread.threadId}`,
      headers: headers("owner", "owner-token"),
      payload: {
        body: "@viewer 수정된 검수",
        expectedModifiedAt: thread.modifiedAt,
        mentionTargets: [{ userId: "viewer", displayName: "뷰어", role: "viewer" }]
      }
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().thread).toMatchObject({
      authorId: "owner",
      body: "@viewer 수정된 검수",
      mentions: ["viewer"],
      readBy: ["owner"]
    });

    const stale = await server.inject({
      method: "PATCH",
      url: `/files/team-comment-file/comments/${thread.threadId}`,
      headers: headers("owner", "owner-token"),
      payload: {
        body: "오래된 수정",
        expectedModifiedAt: thread.modifiedAt
      }
    });
    expect(stale.statusCode).toBe(409);
    await expect(storage.listCommentThreads("team-comment-file")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "@viewer 수정된 검수" })
      ])
    );

    const replied = await server.inject({
      method: "POST",
      url: `/files/team-comment-file/comments/${thread.threadId}/replies`,
      headers: headers("peer", "peer-token"),
      payload: {
        body: "동료 답글",
        authorId: "spoofed-replier",
        authorName: "동료"
      }
    });
    expect(replied.statusCode).toBe(200);
    const reply = replied.json().thread.replies[0];
    expect(reply).toMatchObject({
      authorId: "peer",
      authorName: "peer",
      modifiedAt: reply.createdAt
    });

    const editedReply = await server.inject({
      method: "PATCH",
      url: `/files/team-comment-file/comments/${thread.threadId}/replies/${reply.replyId}`,
      headers: headers("peer", "peer-token"),
      payload: {
        body: "수정된 동료 답글",
        expectedModifiedAt: reply.modifiedAt
      }
    });
    expect(editedReply.statusCode).toBe(200);
    const currentReply = editedReply.json().thread.replies[0];

    expect(
      (
        await server.inject({
          method: "DELETE",
          url: `/files/team-comment-file/comments/${thread.threadId}/replies/${reply.replyId}`,
          headers: headers("owner", "owner-token"),
          payload: { expectedModifiedAt: currentReply.modifiedAt }
        })
      ).statusCode
    ).toBe(403);
    const deletedReply = await server.inject({
      method: "DELETE",
      url: `/files/team-comment-file/comments/${thread.threadId}/replies/${reply.replyId}`,
      headers: headers("peer", "peer-token"),
      payload: { expectedModifiedAt: currentReply.modifiedAt }
    });
    expect(deletedReply.statusCode).toBe(200);
    expect(deletedReply.json().thread.replies).toEqual([]);

    const deletedThread = await server.inject({
      method: "DELETE",
      url: `/files/team-comment-file/comments/${thread.threadId}`,
      headers: headers("owner", "owner-token"),
      payload: { expectedModifiedAt: deletedReply.json().thread.modifiedAt }
    });
    expect(deletedThread.statusCode).toBe(200);
    expect(deletedThread.json()).toEqual({
      deleted: { threadId: thread.threadId, deleted: true }
    });

    const local = await server.inject({
      method: "POST",
      url: "/files/private-comment-file/comments",
      payload: {
        nodeId: "text-1",
        body: "개인 파일 로컬 코멘트",
        authorName: "로컬 사용자"
      }
    });
    expect(local.statusCode).toBe(200);
    expect(local.json().thread).toMatchObject({
      authorId: "로컬 사용자",
      authorName: "로컬 사용자"
    });

    const visibleTeam = await server.inject({
      method: "POST",
      url: "/files/team-comment-file/comments",
      headers: headers("peer", "peer-token"),
      payload: {
        nodeId: "text-1",
        body: "팀 검수 알림",
        authorName: "위조된 이름"
      }
    });
    expect(visibleTeam.statusCode).toBe(200);
    expect(visibleTeam.json().thread).toMatchObject({
      authorId: "peer",
      authorName: "peer"
    });

    const anonymousNotifications = await server.inject({
      method: "GET",
      url: "/comments/notifications?viewerId=observer"
    });
    expect(anonymousNotifications.statusCode).toBe(200);
    expect(
      anonymousNotifications.json().summary.projects.map(
        (project: { projectId: string }) => project.projectId
      )
    ).toEqual(["private-comment-project"]);

    const ownerNotifications = await server.inject({
      method: "GET",
      url: "/comments/notifications",
      headers: headers("owner", "owner-token")
    });
    expect(ownerNotifications.statusCode).toBe(200);
    expect(
      new Set(
        ownerNotifications.json().summary.projects.map(
          (project: { projectId: string }) => project.projectId
        )
      )
    ).toEqual(new Set(["private-comment-project", "team-comment-project"]));

    const anonymousActivity = await server.inject({
      method: "GET",
      url: "/comments/activity?viewerId=observer&limit=1"
    });
    expect(anonymousActivity.statusCode).toBe(200);
    expect(
      new Set(
        anonymousActivity.json().feed.events.map(
          (event: { projectId: string }) => event.projectId
        )
      )
    ).toEqual(new Set(["private-comment-project"]));
  });

  test("requires a team owner to change a team project's sharing boundary", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "sharing-project",
      name: "공유 경계 프로젝트",
      documentId: "sharing-file",
      documentName: "공유 경계 문서"
    });
    await storage.setProjectSharing("sharing-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "team-owner", role: "owner", teamIds: ["team-alpha"], token: "owner-token" },
          { userId: "team-editor", role: "editor", teamIds: ["team-alpha"], token: "editor-token" },
          { userId: "team-viewer", role: "viewer", teamIds: ["team-alpha"], token: "viewer-token" }
        ]
      }
    });
    const changeSharing = (headers?: Record<string, string>) =>
      server.inject({
        method: "PATCH",
        url: "/projects/sharing-project/sharing",
        headers,
        payload: { mode: "private" }
      });

    expect((await changeSharing()).statusCode).toBe(401);
    expect(
      (
        await changeSharing({
          authorization: "Bearer viewer-token",
          "x-layo-user-id": "team-viewer"
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await changeSharing({
          authorization: "Bearer editor-token",
          "x-layo-user-id": "team-editor"
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await changeSharing({
          authorization: "Bearer owner-token",
          "x-layo-user-id": "team-owner"
        })
      ).statusCode
    ).toBe(200);
    await expect(storage.readProject("sharing-project")).resolves.toMatchObject({
      sharing: { mode: "private" }
    });
  });

  test("authorizes shared project mutations by team role", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "team-project",
      name: "팀 프로젝트",
      documentId: "team-file",
      documentName: "팀 문서"
    });
    await storage.setProjectSharing("team-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "team-owner", role: "owner", teamIds: ["team-alpha"], token: "owner-token" },
          { userId: "team-editor", role: "editor", teamIds: ["team-alpha"], token: "editor-token" },
          { userId: "team-viewer", role: "viewer", teamIds: ["team-alpha"], token: "viewer-token" }
        ]
      }
    });
    const ownerHeaders = {
      authorization: "Bearer owner-token",
      "x-layo-user-id": "team-owner"
    };
    const editorHeaders = {
      authorization: "Bearer editor-token",
      "x-layo-user-id": "team-editor"
    };
    const viewerHeaders = {
      authorization: "Bearer viewer-token",
      "x-layo-user-id": "team-viewer"
    };

    expect(
      (
        await server.inject({
          method: "PATCH",
          url: "/projects/team-project",
          payload: { name: "익명 변경" }
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: "/projects/team-project",
          headers: viewerHeaders,
          payload: { name: "뷰어 변경" }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: "/projects/team-project",
          headers: editorHeaders,
          payload: { name: "에디터 변경" }
        })
      ).statusCode
    ).toBe(200);

    expect(
      (
        await server.inject({
          method: "POST",
          url: "/projects/team-project/documents",
          payload: { documentId: "anonymous-file", name: "익명 문서" }
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/projects/team-project/documents",
          headers: viewerHeaders,
          payload: { documentId: "viewer-file", name: "뷰어 문서" }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/projects/team-project/documents",
          headers: editorHeaders,
          payload: { documentId: "editor-file", name: "에디터 문서" }
        })
      ).statusCode
    ).toBe(200);

    expect(
      (
        await server.inject({
          method: "POST",
          url: "/projects/team-project/duplicate",
          payload: { projectId: "anonymous-copy", documentIdPrefix: "anonymous-copy" }
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/projects/team-project/duplicate",
          headers: viewerHeaders,
          payload: { projectId: "viewer-copy", documentIdPrefix: "viewer-copy" }
        })
      ).statusCode
    ).toBe(200);

    expect(
      (
        await server.inject({
          method: "DELETE",
          url: "/projects/team-project",
          headers: editorHeaders
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "DELETE",
          url: "/projects/team-project",
          headers: ownerHeaders
        })
      ).statusCode
    ).toBe(200);
    await expect(storage.readProject("team-project")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  test("rejects a shared project mutation when its team changes after authorization", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "authorization-race-project",
      name: "권한 경쟁 프로젝트",
      documentId: "authorization-race-file",
      documentName: "권한 경쟁 문서"
    });
    await storage.setProjectSharing("authorization-race-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const updateProject = storage.updateProject.bind(storage);
    storage.updateProject = async (projectId, input, options) => {
      await storage.setProjectSharing(projectId, {
        mode: "team",
        teamId: "team-beta"
      });
      return updateProject(projectId, input, options);
    };
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "team-editor", role: "editor", teamIds: ["team-alpha"], token: "editor-token" }
        ]
      }
    });

    const response = await server.inject({
      method: "PATCH",
      url: "/projects/authorization-race-project",
      headers: {
        authorization: "Bearer editor-token",
        "x-layo-user-id": "team-editor"
      },
      payload: { name: "오래된 권한 변경" }
    });

    expect(response.statusCode).toBe(409);
    await expect(storage.readProject("authorization-race-project")).resolves.toMatchObject({
      name: "권한 경쟁 프로젝트",
      sharing: { mode: "team", teamId: "team-beta" }
    });
  });

  test("closes a team comment SSE stream when its owner makes the project private", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "sharing-project",
      name: "공유 경계 프로젝트",
      documentId: "sharing-file",
      documentName: "공유 경계 문서"
    });
    await storage.setProjectSharing("sharing-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const server = createHttpServer(storage, {
      libraryRegistryAuth: {
        members: [
          { userId: "team-owner", role: "owner", teamIds: ["team-alpha"], token: "owner-token" }
        ]
      }
    });
    const address = await server.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const headers = {
      authorization: "Bearer owner-token",
      "x-layo-user-id": "team-owner"
    };

    try {
      const stream = await fetch(
        `${address}/comments/events?fileId=sharing-file`,
        { headers, signal: controller.signal }
      );
      expect(stream.status).toBe(200);

      const changed = await fetch(`${address}/projects/sharing-project/sharing`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "private" })
      });
      expect(changed.status).toBe(200);
      await expect(
        readSseEvent(stream, "comment-authorization-ended")
      ).resolves.toEqual({ code: "team_access_revoked" });
    } finally {
      controller.abort();
      await server.close();
    }
  });

  test("re-authenticates a team comment SSE stream and closes it after credential revocation", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "team-comment-project",
      name: "팀 코멘트 프로젝트",
      documentId: "team-comment-file",
      documentName: "팀 코멘트 문서"
    });
    await storage.setProjectSharing("team-comment-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const auth: TeamAuthorizationConfig = {
      members: [
        {
          userId: "owner",
          role: "editor",
          teamIds: ["team-alpha"],
          token: "owner-token"
        }
      ]
    };
    const server = createHttpServer(storage, { libraryRegistryAuth: auth });
    const address = await server.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();

    try {
      const stream = await fetch(
        `${address}/comments/events?fileId=team-comment-file`,
        {
          headers: {
            authorization: "Bearer owner-token",
            "x-layo-user-id": "owner"
          },
          signal: controller.signal
        }
      );
      expect(stream.status).toBe(200);
      expect(stream.url).not.toContain("owner-token");

      auth.members[0].revokedAt = "2026-01-01T00:00:00.000Z";
      await expect(
        readSseEvent(stream, "comment-authorization-ended")
      ).resolves.toEqual({ code: "credential_inactive" });
    } finally {
      controller.abort();
      await server.close();
    }
  });

  test("requires a file id for comment event streams", async () => {
    const server = await createServerWithDocument();
    const address = await server.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();

    try {
      const response = await fetch(`${address}/comments/events?after=0`, {
        signal: controller.signal
      });
      expect(response.status).toBe(400);
    } finally {
      controller.abort();
      await server.close();
    }
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

  test("streams comment mutation events from a shared storage event log", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const publisherStorage = new FileStorage(tempRoot);
    await publisherStorage.createProject({
      projectId: "comment-project",
      name: "코멘트 프로젝트",
      documentId: "sample-file",
      documentName: "코멘트 문서"
    });

    const streamServer = createHttpServer(new FileStorage(tempRoot));
    const address = await streamServer.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();

    try {
      const stream = await fetch(
        `${address}/comments/events?viewerId=${encodeURIComponent("사용자")}&fileId=sample-file`,
        { signal: controller.signal }
      );
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");

      const eventPromise = readCommentStreamEvent(stream);
      const created = await publisherStorage.createCommentThread("sample-file", {
        nodeId: "text-1",
        body: "@사용자 공유 저장소 SSE 확인",
        authorName: "디자인 팀",
        mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
      });

      const event = await eventPromise;
      expect(event).toMatchObject({
        schemaVersion: 1,
        sequence: 1,
        type: "created",
        fileId: "sample-file",
        threadId: created.threadId,
        viewerId: "사용자"
      });
    } finally {
      controller.abort();
      await streamServer.close();
    }
  });

  test("streams library registry events from a shared storage event log", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const publisherStorage = new FileStorage(tempRoot);
    await publisherStorage.createProject({
      projectId: "source-project",
      name: "소스 프로젝트",
      documentId: "source-file",
      documentName: "소스 문서"
    });
    await publisherStorage.setProjectSharing("source-project", { mode: "team", teamId: "team-alpha" });
    await publisherStorage.createProject({
      projectId: "beta-source-project",
      name: "Beta Source",
      documentId: "beta-source-file",
      documentName: "Beta Source"
    });
    await publisherStorage.setProjectSharing("beta-source-project", {
      mode: "team",
      teamId: "team-beta"
    });
    await publisherStorage.publishLibraryToRegistry("beta-source-file", {
      libraryId: "beta-kit",
      name: "Beta Kit"
    });
    await publisherStorage.applyAgentCommands("source-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ] as any
    });
    await publisherStorage.publishLibraryToRegistry("source-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    const streamStorage = new FileStorage(tempRoot);
    await streamStorage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    await streamStorage.setProjectSharing("target-project", { mode: "team", teamId: "team-alpha" });

    const streamServer = createHttpServer(streamStorage, {
      libraryRegistryAuth: {
        members: [
          {
            userId: "alpha-viewer",
            role: "viewer",
            teamIds: ["team-alpha"],
            token: "alpha-token"
          },
          {
            userId: "beta-viewer",
            role: "viewer",
            teamIds: ["team-beta"],
            token: "beta-token"
          }
        ]
      }
    });
    const address = await streamServer.listen({ host: "127.0.0.1", port: 0 });
    const controllers: AbortController[] = [];
    const openStream = async (
      headers?: Record<string, string>,
      endpoint = "/libraries/events?fileId=target-file&after=2"
    ) => {
      const controller = new AbortController();
      controllers.push(controller);
      const response = await fetch(`${address}${endpoint}`, {
        headers,
        signal: controller.signal
      });
      return response;
    };

    try {
      const missing = await openStream();
      expect(missing.status).toBe(401);

      const wrongTeam = await openStream({
        authorization: "Bearer beta-token",
        "x-layo-user-id": "beta-viewer"
      });
      expect(wrongTeam.status).toBe(403);

      const alphaHeaders = {
        authorization: "Bearer alpha-token",
        "x-layo-user-id": "alpha-viewer"
      };
      const unscopedStream = await openStream(alphaHeaders, "/libraries/events");
      expect(unscopedStream.status).toBe(200);
      await expect(readSseEvent(unscopedStream, "library-registry")).resolves.toMatchObject({
        sequence: 2,
        libraryId: "team-kit",
        teamId: "team-alpha"
      });

      const readyStream = await openStream(alphaHeaders);
      await expect(
        readSseEvent(readyStream, "library-registry-ready")
      ).resolves.toEqual({ ok: true });

      const stream = await openStream(alphaHeaders);
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");

      const eventPromise = readSseEvent(stream, "library-registry");
      await publisherStorage.applyAgentCommands("source-file", {
        dryRun: false,
        commands: [
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-badge",
            name: "Library Badge",
            width: 80,
            height: 32,
            fill: "#2563eb"
          },
          { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
        ] as any
      });
      const secondPublish = await publisherStorage.publishLibraryToRegistry("source-file", {
        libraryId: "team-kit",
        name: "Team Kit"
      });

      const event = await eventPromise;
      expect(event).toMatchObject({
        schemaVersion: 1,
        sequence: 3,
        type: "published",
        libraryId: "team-kit",
        libraryName: "Team Kit",
        sourceFileId: "source-file",
        teamId: "team-alpha",
        componentCount: 2,
        registryUpdatedAt: secondPublish.updatedAt
      });
    } finally {
      for (const controller of controllers) {
        controller.abort();
      }
      await streamServer.close();
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
  return readSseEvent(response, "comment");
}

async function readSseEvent(response: Response, eventName: string): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${eventName} event stream has no readable body`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out waiting for ${eventName} event`)), 3_000)
      )
    ]);
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      if (!block.split(/\r?\n/).some((line) => line.trim() === `event: ${eventName}`)) {
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

  throw new Error(`${eventName} event was not emitted`);
}
