import { mkdtemp, rm } from "node:fs/promises";
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
  tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const files = await server.inject({ method: "GET", url: "/files" });
    expect(files.statusCode).toBe(200);
    expect(files.json().files).toEqual([]);
  });

  test("serves project create, read, update, document, and sharing routes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
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

  test("rejects image assets whose bytes do not match the declared mime type", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
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
      payload: { text: "캔버스" }
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
          defaultValue: "캔버스 MCP 에디터"
        }
      ]
    });
    expect(body.export.implementationSpec.elements[0].id).toBe("frame-1");
    expect(body.export.implementationSpec.tokenCandidates.fontFamilies).toContain("Inter");
    expect(body.export.indexModule).toContain('from "./elements/frame-1.mjs"');
  });
});
