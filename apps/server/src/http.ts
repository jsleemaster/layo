import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import type { AgentBatchInput, AgentFindQuery } from "./agent-control.js";
import {
  FileStorage,
  INPUT_VALIDATION_ERROR_CODE,
  type CreateAssetInput,
  type DesignNode,
  type GeometryPatch
} from "./storage.js";

export interface HttpServerOptions {
  webBasePath?: string;
  webDistDir?: string | null;
}

const DEFAULT_WEB_BASE_PATH = "/app/";
const DEFAULT_WEB_DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist"
);

export function createHttpServer(storage = new FileStorage(), options: HttpServerOptions = {}) {
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

  const webDistDir = resolveWebDistDir(options.webDistDir);
  if (webDistDir) {
    registerStaticWebRoutes(server, {
      basePath: normalizeWebBasePath(options.webBasePath ?? process.env.WEB_BASE_PATH),
      distDir: webDistDir
    });
  }

  return server;
}

function resolveWebDistDir(configuredDistDir: string | null | undefined) {
  if (configuredDistDir === null) {
    return undefined;
  }

  const candidate = path.resolve(configuredDistDir ?? process.env.WEB_DIST_DIR ?? DEFAULT_WEB_DIST_DIR);
  return existsSync(candidate) ? candidate : undefined;
}

function normalizeWebBasePath(basePath = DEFAULT_WEB_BASE_PATH) {
  const trimmed = basePath.trim() || DEFAULT_WEB_BASE_PATH;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function registerStaticWebRoutes(
  server: FastifyInstance,
  options: { basePath: string; distDir: string }
) {
  const distRoot = path.resolve(options.distDir);
  const basePathWithoutTrailingSlash = options.basePath.slice(0, -1);

  if (options.basePath !== "/") {
    server.get("/", async (_request, reply) => reply.redirect(options.basePath));
    server.get(basePathWithoutTrailingSlash, async (_request, reply) => reply.redirect(options.basePath));
  }
  server.get(`${options.basePath}*`, async (request, reply) => {
    const requestPath = new URL(request.url, "http://layo.local").pathname;
    const relativePath = decodeURIComponent(requestPath.slice(options.basePath.length)) || "index.html";
    const response = await readStaticWebFile(distRoot, relativePath);

    if (!response) {
      return reply.code(404).send({ error: "not found" });
    }

    reply.header("Content-Type", response.contentType);
    return reply.send(response.body);
  });
}

async function readStaticWebFile(distRoot: string, relativePath: string) {
  const candidate = path.resolve(distRoot, relativePath);
  const insideDist = candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`);
  if (!insideDist) {
    return undefined;
  }

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) {
      return {
        body: await readFile(candidate),
        contentType: contentTypeForPath(candidate)
      };
    }
  } catch {
    if (path.extname(relativePath)) {
      return undefined;
    }
  }

  return {
    body: await readFile(path.join(distRoot, "index.html")),
    contentType: "text/html; charset=utf-8"
  };
}

function contentTypeForPath(filePath: string) {
  switch (path.extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
