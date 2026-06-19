import Fastify from "fastify";
import type { AgentBatchInput, AgentFindQuery } from "./agent-control.js";
import {
  FileStorage,
  INPUT_VALIDATION_ERROR_CODE,
  type CreateAssetInput,
  type DesignNode,
  type GeometryPatch
} from "./storage.js";

export function createHttpServer(storage = new FileStorage()) {
  const server = Fastify({ logger: true });

  server.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === INPUT_VALIDATION_ERROR_CODE) {
      return reply.code(400).send({ error: (error as Error).message });
    }

    if ((error as { code?: string }).code === "ENOENT") {
      return reply.code(404).send({ error: "not found" });
    }

    return reply.send(error);
  });

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  server.get("/health", async () => ({ ok: true }));

  server.options("*", async (_request, reply) => {
    return reply.code(204).send();
  });

  server.post<{ Body: CreateAssetInput }>("/assets", async (request) => {
    return { asset: await storage.createAsset(request.body) };
  });

  server.get<{ Params: { assetId: string } }>("/assets/:assetId", async (request, reply) => {
    const asset = await storage.readAsset(request.params.assetId);
    reply.header("Content-Type", asset.mimeType);
    reply.header("Cache-Control", "no-store");
    return reply.send(asset.data);
  });

  server.get("/projects", async () => {
    return { projects: await storage.listProjects() };
  });

  server.post<{
    Body: { projectId?: string; name?: string; documentId?: string; documentName?: string };
  }>("/projects", async (request) => {
    return { project: await storage.createProject(request.body) };
  });

  server.get<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    return { project: await storage.readProject(request.params.projectId) };
  });

  server.patch<{ Params: { projectId: string }; Body: { name?: string; currentDocumentId?: string } }>(
    "/projects/:projectId",
    async (request) => {
      return { project: await storage.updateProject(request.params.projectId, request.body) };
    }
  );

  server.post<{ Params: { projectId: string }; Body: { documentId?: string; name?: string } }>(
    "/projects/:projectId/documents",
    async (request) => {
      return { project: await storage.createProjectDocument(request.params.projectId, request.body) };
    }
  );

  server.patch<{
    Params: { projectId: string };
    Body: { mode: "private" } | { mode: "team"; teamId: string };
  }>("/projects/:projectId/sharing", async (request) => {
    return { project: await storage.setProjectSharing(request.params.projectId, request.body) };
  });

  server.post<{
    Params: { projectId: string };
    Body: { projectId?: string; name?: string; documentIdPrefix?: string };
  }>("/projects/:projectId/duplicate", async (request) => {
    return {
      project: await storage.duplicateProject(request.params.projectId, request.body)
    };
  });

  server.delete<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    return { project: await storage.deleteProject(request.params.projectId) };
  });

  server.get("/files", async () => {
    return { files: await storage.listFiles() };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId", async (request) => {
    return { file: await storage.readFile(request.params.fileId) };
  });

  server.get<{ Params: { fileId: string }; Querystring: { moduleBasePath?: string } }>(
    "/files/:fileId/export/code",
    async (request) => {
      return {
        export: await storage.exportCode(request.params.fileId, {
          moduleBasePath: request.query.moduleBasePath
        })
      };
    }
  );

  server.patch<{ Params: { fileId: string; nodeId: string }; Body: GeometryPatch }>(
    "/files/:fileId/nodes/:nodeId/geometry",
    async (request) => {
      return {
        node: await storage.updateNodeGeometry(
          request.params.fileId,
          request.params.nodeId,
          request.body
        )
      };
    }
  );

  server.patch<{ Params: { fileId: string; nodeId: string }; Body: { fill: string } }>(
    "/files/:fileId/nodes/:nodeId/fill",
    async (request) => {
      return {
        node: await storage.setNodeFill(
          request.params.fileId,
          request.params.nodeId,
          request.body.fill
        )
      };
    }
  );

  server.patch<{ Params: { fileId: string; nodeId: string }; Body: { value: string } }>(
    "/files/:fileId/nodes/:nodeId/text",
    async (request) => {
      return {
        node: await storage.updateText(
          request.params.fileId,
          request.params.nodeId,
          request.body.value
        )
      };
    }
  );

  server.post<{ Params: { fileId: string }; Body: { parentId: string; node: DesignNode } }>(
    "/files/:fileId/nodes",
    async (request) => {
      return {
        node: await storage.createNode(
          request.params.fileId,
          request.body.parentId,
          request.body.node
        )
      };
    }
  );

  server.get<{ Params: { fileId: string } }>("/files/:fileId/agent/inspect", async (request) => {
    return {
      inspection: await storage.inspectCanvas(request.params.fileId)
    };
  });

  server.post<{ Params: { fileId: string }; Body: AgentFindQuery }>(
    "/files/:fileId/agent/find",
    async (request) => {
      return {
        nodes: await storage.findNodes(request.params.fileId, request.body)
      };
    }
  );

  server.post<{ Params: { fileId: string }; Body: AgentBatchInput }>(
    "/files/:fileId/agent/commands",
    async (request) => {
      return {
        result: await storage.applyAgentCommands(request.params.fileId, request.body)
      };
    }
  );

  server.get<{ Params: { fileId: string } }>("/files/:fileId/agent/validate", async (request) => {
    return {
      validation: await storage.validateDocument(request.params.fileId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { before: Awaited<ReturnType<FileStorage["readFile"]>>; after: Awaited<ReturnType<FileStorage["readFile"]>> };
  }>("/files/:fileId/agent/change-summary", async (request) => {
    return {
      summary: await storage.getChangeSummary(
        request.params.fileId,
        request.body.before,
        request.body.after
      )
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/components", async (request) => {
    return { components: await storage.listComponents(request.params.fileId) };
  });

  server.post<{
    Params: { fileId: string };
    Body: { nodeId: string; componentId: string; name: string };
  }>("/files/:fileId/components", async (request) => {
    return {
      component: await storage.createComponent(request.params.fileId, request.body.nodeId, {
        componentId: request.body.componentId,
        name: request.body.name
      })
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { parentId: string; definitionId: string; instanceId: string; x: number; y: number };
  }>("/files/:fileId/component-instances", async (request) => {
    return {
      node: await storage.createComponentInstance(request.params.fileId, request.body)
    };
  });

  server.post<{ Params: { fileId: string; nodeId: string } }>(
    "/files/:fileId/nodes/:nodeId/detach",
    async (request) => {
      return {
        node: await storage.detachInstance(request.params.fileId, request.params.nodeId)
      };
    }
  );

  return server;
}
