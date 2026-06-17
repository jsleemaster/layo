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

describe("HTTP server", () => {
  test("serves health, file list, and sample file", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const files = await server.inject({ method: "GET", url: "/files" });
    expect(files.statusCode).toBe(200);
    expect(files.json().files[0].id).toBe("sample-file");

    const file = await server.inject({ method: "GET", url: "/files/sample-file" });
    expect(file.statusCode).toBe(200);
    expect(file.json().file.name).toBe("샘플 파일");
  });

  test("updates node geometry, fill, text, and creates nodes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const server = createHttpServer(new FileStorage(tempRoot));

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
