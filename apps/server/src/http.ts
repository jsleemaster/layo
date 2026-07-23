import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import type { AgentBatchInput, AgentFindQuery } from "./agent-control.js";
import { reviewExternalMigrationArchive, type ExternalMigrationSource } from "./external-migration.js";
import {
  authorizeTeamLibraryRead,
  createTeamAuthorizationProvider,
  filterAuthorizedTeamLibraries,
  authorizeTeamLibraryWrite,
  bearerToken,
  type AuthenticatedTeamMember,
  type TeamAccessTokenExpiryDays,
  type TeamAccessTokenMetadata,
  type TeamAuthorizationConfig,
  type TeamAuthorizationFileManager,
  type TeamAuthorizationProvider
} from "./team-authorization.js";
import {
  FILE_ARCHIVE_MIME_TYPE,
  FileStorage,
  INPUT_VALIDATION_ERROR_CODE,
  LIBRARY_ARCHIVE_MIME_TYPE,
  PROJECT_ARCHIVE_MIME_TYPE,
  type CodeComponentMapping,
  type ComponentVariantArea,
  type CreateAssetInput,
  type StoredCommentMentionTarget,
  type DesignNode,
  type DesignFile,
  type GeometryPatch,
  type ProjectManifest
} from "./storage.js";

export function canWriteEventStream(
  response: { destroyed: boolean; writableEnded: boolean }
): boolean {
  return !response.destroyed && !response.writableEnded;
}

export interface HttpServerOptions {
  webBasePath?: string;
  webDistDir?: string | null;
  libraryRegistryAuth?: TeamAuthorizationConfig;
  libraryRegistryAuthorizationProvider?: TeamAuthorizationProvider;
  teamAuthorizationProvider?: TeamAuthorizationProvider;
  teamAuthorizationManager?: TeamAuthorizationFileManager;
}

const DEFAULT_WEB_BASE_PATH = "/app/";
const DEFAULT_WEB_DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist"
);

export function createHttpServer(storage = new FileStorage(), options: HttpServerOptions = {}) {
  const server = Fastify({ logger: true });
  const commentEventStreamClosers = new Set<() => void>();
  const libraryRegistryStreamClosers = new Set<() => void>();
  let eventStreamsClosing = false;
  const closeServer = server.close.bind(server);
  server.close = ((...args: [] | [(error?: Error) => void]) => {
    eventStreamsClosing = true;
    return args.length === 0 ? closeServer() : closeServer(args[0]);
  }) as FastifyInstance["close"];
  const teamAuthorizationProvider =
    options.teamAuthorizationProvider
    ?? options.libraryRegistryAuthorizationProvider
    ?? (options.libraryRegistryAuth
      ? createTeamAuthorizationProvider(options.libraryRegistryAuth)
      : undefined);
  const libraryRegistryAuthorizationProvider = teamAuthorizationProvider;

  type LibraryRequest = {
    id: string;
    headers: {
      authorization?: string | string[];
      "x-layo-user-id"?: string | string[];
    };
  };

  const teamPrincipalForRequest = (request: LibraryRequest) => ({
    userId: Array.isArray(request.headers["x-layo-user-id"])
      ? request.headers["x-layo-user-id"][0]
      : request.headers["x-layo-user-id"],
    memberToken: bearerToken(request.headers.authorization)
  });
  const authenticateTeamMember = async (request: LibraryRequest) => {
    if (!teamAuthorizationProvider) {
      return undefined;
    }
    return teamAuthorizationProvider.authenticate(teamPrincipalForRequest(request));
  };
  const authenticateOptionalTeamMember = async (request: LibraryRequest) => {
    if (!teamAuthorizationProvider) {
      return undefined;
    }
    const principal = teamPrincipalForRequest(request);
    if (!principal.userId && !principal.memberToken) {
      return undefined;
    }
    return teamAuthorizationProvider.authenticate(principal);
  };
  const authenticateLibraryMember = authenticateTeamMember;

  const authorizeLibraryRead = async (request: LibraryRequest, fileId: string) => {
    const member = await authenticateLibraryMember(request);
    if (member) {
      authorizeTeamLibraryRead(member, await storage.getTeamIdForFile(fileId));
    }
  };

  const authorizeLibraryWrite = async (request: LibraryRequest, fileId: string) => {
    const member = await authenticateLibraryMember(request);
    if (member) {
      authorizeTeamLibraryWrite(member, await storage.getTeamIdForFile(fileId));
    }
  };

  const authorizeProjectRead = async (
    request: LibraryRequest,
    project: ProjectManifest
  ): Promise<AuthenticatedTeamMember | undefined> => {
    if (project.sharing.mode !== "team" || !teamAuthorizationProvider) {
      return undefined;
    }
    const member = await teamAuthorizationProvider.authenticate(
      teamPrincipalForRequest(request)
    );
    authorizeTeamLibraryRead(member, project.sharing.teamId);
    return member;
  };

  const authorizeProjectWrite = async (
    request: LibraryRequest,
    project: ProjectManifest
  ): Promise<AuthenticatedTeamMember | undefined> => {
    const member = await authorizeProjectRead(request, project);
    if (member && project.sharing.mode === "team") {
      authorizeTeamLibraryWrite(member, project.sharing.teamId);
    }
    return member;
  };

  const authorizeProjectOwner = async (
    request: LibraryRequest,
    project: ProjectManifest
  ): Promise<AuthenticatedTeamMember | undefined> => {
    const member = await authorizeProjectRead(request, project);
    if (member && member.role !== "owner") {
      throw Object.assign(new Error("only a team owner can delete a shared project"), {
        code: "EACCES",
        statusCode: 403
      });
    }
    return member;
  };

  const authorizeCommentRead = async (
    request: LibraryRequest,
    fileId: string
  ): Promise<AuthenticatedTeamMember | undefined> => {
    const teamId = await storage.getTeamIdForFile(fileId);
    if (!teamId || !teamAuthorizationProvider) {
      return undefined;
    }
    const member = await authenticateTeamMember(request);
    if (!member) {
      return undefined;
    }
    authorizeTeamLibraryRead(member, teamId);
    return member;
  };

  const authorizeCommentWrite = async (
    request: LibraryRequest,
    fileId: string
  ): Promise<AuthenticatedTeamMember | undefined> => {
    const teamId = await storage.getTeamIdForFile(fileId);
    if (!teamId || !teamAuthorizationProvider) {
      return undefined;
    }
    const member = await authenticateTeamMember(request);
    if (!member) {
      return undefined;
    }
    // Penpot permits file readers, including team viewers, to participate in comments.
    authorizeTeamLibraryRead(member, teamId);
    return member;
  };

  const visibleCommentProjectIds = async (member?: AuthenticatedTeamMember) => {
    const projects = await storage.listProjects();
    return new Set(
      projects.flatMap((project) =>
        project.sharing.mode === "private"
        || (
          project.sharing.mode === "team"
          && member?.teamIds.includes(project.sharing.teamId)
        )
          ? [project.projectId]
          : []
      )
    );
  };

  server.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === INPUT_VALIDATION_ERROR_CODE) {
      return reply.code(400).send({ error: (error as Error).message });
    }

    const code = (error as { code?: string }).code;
    if (
      code === "EINVAL"
      || code === "EEXIST"
      || code === "EUNAVAILABLE"
      || code === "EACCES"
      || code === "ECONFLICT"
    ) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 400;
      return reply.code(statusCode).send({ error: (error as Error).message });
    }

    if ((error as { code?: string }).code === "ENOENT") {
      return reply.code(404).send({ error: "not found" });
    }

    return reply.send(error);
  });

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key, X-Layo-User-Id"
    );
  });

  server.get("/health", async () => ({ ok: true }));

  const requireTeamAuthorizationManager = () => {
    if (!options.teamAuthorizationManager || !libraryRegistryAuthorizationProvider) {
      throw Object.assign(
        new Error("team access token administration requires file-backed authorization"),
        { code: "EUNAVAILABLE", statusCode: 503 }
      );
    }
    return options.teamAuthorizationManager;
  };

  const requireTeamAuthorizationAuditManager = () => {
    const manager = requireTeamAuthorizationManager();
    if (!manager.listAuditEvents) {
      throw Object.assign(
        new Error("authorization audit history requires shared PostgreSQL authorization"),
        { code: "EUNAVAILABLE", statusCode: 503 }
      );
    }
    return {
      manager,
      listAuditEvents: manager.listAuditEvents.bind(manager)
    };
  };

  const accountTokenPrincipal = (request: LibraryRequest) => ({
    userId: Array.isArray(request.headers["x-layo-user-id"])
      ? request.headers["x-layo-user-id"][0] ?? ""
      : request.headers["x-layo-user-id"] ?? "",
    memberToken: bearerToken(request.headers.authorization) ?? "",
    audit: {
      source: "http" as const,
      requestId: request.id
    }
  });

  const accountTokenMetadataResponse = (
    metadata: TeamAccessTokenMetadata
  ): TeamAccessTokenMetadata => ({
    id: metadata.id,
    name: metadata.name,
    ...(metadata.createdAt ? { createdAt: metadata.createdAt } : {}),
    ...(metadata.expiresAt ? { expiresAt: metadata.expiresAt } : {}),
    ...(metadata.revokedAt ? { revokedAt: metadata.revokedAt } : {})
  });

  server.get("/account/tokens", async (request) => {
    const result = await requireTeamAuthorizationManager().manageTokens(
      accountTokenPrincipal(request),
      { type: "list" }
    );
    if (result.type !== "list") {
      throw new Error("unexpected team authorization list result");
    }
    return {
      tokens: result.tokens.map(accountTokenMetadataResponse),
      ...(result.activeTokenId ? { activeTokenId: result.activeTokenId } : {})
    };
  });

  server.post<{
    Body: { name: string; expiresInDays: TeamAccessTokenExpiryDays };
  }>("/account/tokens", async (request, reply) => {
    const result = await requireTeamAuthorizationManager().manageTokens(
      accountTokenPrincipal(request),
      { type: "create", input: request.body }
    );
    if (result.type !== "create") {
      throw new Error("unexpected team authorization create result");
    }
    return reply.code(201).send({
      token: result.created.token,
      metadata: accountTokenMetadataResponse(result.created.metadata)
    });
  });

  server.delete<{
    Params: { tokenId: string };
    Body: { confirmSelfRevoke?: boolean };
  }>("/account/tokens/:tokenId", async (request) => {
    const result = await requireTeamAuthorizationManager().manageTokens(
      accountTokenPrincipal(request),
      {
        type: "revoke",
        tokenId: request.params.tokenId,
        confirmSelfRevoke: request.body?.confirmSelfRevoke === true
      }
    );
    if (result.type !== "revoke") {
      throw new Error("unexpected team authorization revoke result");
    }
    return {
      metadata: accountTokenMetadataResponse(result.metadata)
    };
  });

  server.get<{
    Querystring: { afterId?: string; limit?: string };
  }>("/account/authorization-audit", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { listAuditEvents } = requireTeamAuthorizationAuditManager();
    const afterId = request.query.afterId ?? "0";
    const limit = request.query.limit === undefined
      ? 50
      : Number(request.query.limit);
    return listAuditEvents(
      accountTokenPrincipal(request),
      { afterId, limit }
    );
  });

  server.options("*", async (_request, reply) => {
    return reply.code(204).send();
  });

  server.post<{
    Body: { archiveBase64: string; fileName?: string; sourceHint?: ExternalMigrationSource };
  }>("/migrations/external/review", async (request) => {
    return {
      review: reviewExternalMigrationArchive(Buffer.from(request.body.archiveBase64, "base64"), {
        fileName: request.body.fileName,
        sourceHint: request.body.sourceHint
      })
    };
  });

  server.post<{
    Body: {
      archiveBase64: string;
      fileName?: string;
      sourceHint?: ExternalMigrationSource;
      projectId?: string;
      documentId?: string;
      name?: string;
      documentName?: string;
    };
  }>("/migrations/external/import", async (request) => {
    return {
      imported: await storage.importExternalMigrationArchive(Buffer.from(request.body.archiveBase64, "base64"), {
        fileName: request.body.fileName,
        sourceHint: request.body.sourceHint,
        projectId: request.body.projectId,
        documentId: request.body.documentId,
        name: request.body.name,
        documentName: request.body.documentName
      })
    };
  });

  server.addHook("preClose", async () => {
    eventStreamsClosing = true;
    // Purpose: end long-lived responses before Node waits for active sockets.
    for (const close of [...commentEventStreamClosers]) {
      close();
    }
    for (const close of [...libraryRegistryStreamClosers]) {
      close();
    }
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

  server.delete<{ Params: { assetId: string } }>("/assets/:assetId", async (request) => {
    return { result: await storage.deleteAssetIfUnreferenced(request.params.assetId) };
  });

  server.get("/projects", async () => {
    return { projects: await storage.listProjects() };
  });

  server.post<{
    Body: { projectId?: string; name?: string; documentId?: string; documentName?: string };
  }>("/projects", async (request) => {
    return { project: await storage.createProject(request.body) };
  });

  server.post<{ Body: { archiveBase64: string } }>("/projects/import/archive/review", async (request) => {
    return {
      review: await storage.reviewProjectArchive(Buffer.from(request.body.archiveBase64, "base64"))
    };
  });

  server.post<{
    Body: { archiveBase64: string; projectId?: string; name?: string; documentIdPrefix?: string };
  }>("/projects/import/archive", async (request) => {
    return {
      imported: await storage.importProjectArchive(Buffer.from(request.body.archiveBase64, "base64"), {
        projectId: request.body.projectId,
        name: request.body.name,
        documentIdPrefix: request.body.documentIdPrefix
      })
    };
  });

  server.get<{ Params: { projectId: string } }>("/projects/:projectId/export/archive", async (request, reply) => {
    const exported = await storage.exportProjectArchive(request.params.projectId);
    reply.header("Content-Type", PROJECT_ARCHIVE_MIME_TYPE);
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    return reply.send(exported.archive);
  });

  server.get<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    return { project: await storage.readProject(request.params.projectId) };
  });

  server.patch<{ Params: { projectId: string }; Body: { name?: string; currentDocumentId?: string } }>(
    "/projects/:projectId",
    async (request) => {
      const project = await storage.readProject(request.params.projectId);
      await authorizeProjectWrite(request, project);
      return {
        project: await storage.updateProject(request.params.projectId, request.body, {
          expectedSharing: project.sharing
        })
      };
    }
  );

  server.post<{ Params: { projectId: string }; Body: { documentId?: string; name?: string } }>(
    "/projects/:projectId/documents",
    async (request) => {
      const project = await storage.readProject(request.params.projectId);
      await authorizeProjectWrite(request, project);
      return {
        project: await storage.createProjectDocument(request.params.projectId, request.body, {
          expectedSharing: project.sharing
        })
      };
    }
  );

  server.patch<{
    Params: { projectId: string };
    Body: { mode: "private" } | { mode: "team"; teamId: string };
  }>("/projects/:projectId/sharing", async (request) => {
    const project = await storage.readProject(request.params.projectId);
    const unchanged =
      project.sharing.mode === request.body.mode
      && (
        project.sharing.mode === "private"
        || (
          request.body.mode === "team"
          && project.sharing.teamId === request.body.teamId
        )
      );
    if (unchanged) {
      return { project };
    }

    if (teamAuthorizationProvider) {
      const member = await teamAuthorizationProvider.authenticate(
        teamPrincipalForRequest(request)
      );
      if (project.sharing.mode === "team") {
        authorizeTeamLibraryRead(member, project.sharing.teamId);
        if (member.role !== "owner") {
          throw Object.assign(
            new Error("only a team owner can move a project out of its current team"),
            { code: "EACCES", statusCode: 403 }
          );
        }
      }
      if (request.body.mode === "team") {
        authorizeTeamLibraryWrite(member, request.body.teamId);
      }
    }

    return {
      project: await storage.setProjectSharing(request.params.projectId, request.body, {
        expectedSharing: project.sharing
      })
    };
  });

  server.post<{
    Params: { projectId: string };
    Body: { projectId?: string; name?: string; documentIdPrefix?: string };
  }>("/projects/:projectId/duplicate", async (request) => {
    const project = await storage.readProject(request.params.projectId);
    await authorizeProjectRead(request, project);
    return {
      project: await storage.duplicateProject(request.params.projectId, request.body, {
        expectedSharing: project.sharing
      })
    };
  });

  server.delete<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    const project = await storage.readProject(request.params.projectId);
    await authorizeProjectOwner(request, project);
    return {
      project: await storage.deleteProject(request.params.projectId, {
        expectedSharing: project.sharing
      })
    };
  });

  server.get<{ Querystring: { fileId?: string } }>("/libraries", async (request) => {
    const member = await authenticateLibraryMember(request);
    if (request.query.fileId) {
      if (member) {
        authorizeTeamLibraryRead(
          member,
          await storage.getTeamIdForFile(request.query.fileId)
        );
      }
      const libraries = await storage.listLibraryRegistry(request.query.fileId);
      return {
        libraries: member
          ? filterAuthorizedTeamLibraries(member, libraries)
          : libraries
      };
    }

    const libraries = await storage.listLibraryRegistry();
    return {
      libraries: member
        ? filterAuthorizedTeamLibraries(member, libraries)
        : libraries
    };
  });

  server.post<{
    Body: { fileId: string; libraryId?: string; name?: string };
  }>("/libraries", async (request) => {
    await authorizeLibraryWrite(request, request.body.fileId);
    const idempotencyHeader = request.headers["idempotency-key"];
    return {
      library: await storage.publishLibraryToRegistry(request.body.fileId, {
        libraryId: request.body.libraryId,
        name: request.body.name,
        idempotencyKey: Array.isArray(idempotencyHeader)
          ? idempotencyHeader[0]
          : idempotencyHeader
      })
    };
  });

  server.get<{ Querystring: { fileId?: string; after?: string } }>(
    "/libraries/events",
    async (request, reply) => {
      const initialMember = await authenticateLibraryMember(request);
      if (initialMember && request.query.fileId) {
        authorizeTeamLibraryRead(
          initialMember,
          await storage.getTeamIdForFile(request.query.fileId)
        );
      }
      if (eventStreamsClosing) {
        return reply.code(503).send({ error: "server is closing" });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Access-Control-Allow-Origin": "*",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const sendBlock = (eventName: string, payload: unknown) => {
        if (!canWriteEventStream(reply.raw)) {
          return;
        }
        reply.raw.write(`event: ${eventName}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      sendBlock("library-registry-ready", { ok: true });

      let lastSequence = Math.max(0, Math.floor(Number(request.query.after) || 0));
      let sending = false;
      let heartbeatId: ReturnType<typeof setInterval> | undefined;
      let pollId: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (heartbeatId !== undefined) {
          clearInterval(heartbeatId);
        }
        if (pollId !== undefined) {
          clearInterval(pollId);
        }
        libraryRegistryStreamClosers.delete(close);
        if (canWriteEventStream(reply.raw)) {
          reply.raw.end();
        }
      };
      const sendPendingEvents = async () => {
        if (sending || !canWriteEventStream(reply.raw)) {
          return;
        }
        sending = true;
        try {
          const currentMember = await authenticateLibraryMember(request);
          if (currentMember && request.query.fileId) {
            authorizeTeamLibraryRead(
              currentMember,
              await storage.getTeamIdForFile(request.query.fileId)
            );
          }
          const events = await storage.listLibraryRegistryEvents({
            after: lastSequence,
            fileId: request.query.fileId,
            limit: 100
          });
          for (const event of events) {
            lastSequence = Math.max(lastSequence, event.sequence);
          }
          const authorizedEvents = currentMember
            ? filterAuthorizedTeamLibraries(currentMember, events)
            : events;
          for (const event of authorizedEvents) {
            sendBlock("library-registry", event);
          }
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 401 || statusCode === 403) {
            sendBlock("library-registry-authorization-ended", {
              code: statusCode === 401 ? "credential_inactive" : "team_access_revoked"
            });
            close();
            reply.raw.end();
            return;
          }
          sendBlock("library-registry-error", {
            message: error instanceof Error ? error.message : "library registry event stream failed"
          });
        } finally {
          sending = false;
        }
      };

      heartbeatId = setInterval(() => {
        if (canWriteEventStream(reply.raw)) {
          reply.raw.write(": keepalive\n\n");
        }
      }, 25_000);
      pollId = setInterval(() => {
        void sendPendingEvents();
      }, 250);

      libraryRegistryStreamClosers.add(close);
      sendBlock("ready", { ok: true, lastSequence });
      void sendPendingEvents();
      request.raw.on("close", close);
    }
  );

  server.get("/files", async () => {
    return { files: await storage.listFiles() };
  });

  server.post<{
    Body: { archiveBase64: string };
  }>("/files/import/archive/review", async (request) => {
    return {
      review: await storage.reviewFileArchive(Buffer.from(request.body.archiveBase64, "base64"))
    };
  });

  server.post<{
    Body: { archiveBase64: string; fileId?: string; name?: string };
  }>("/files/import/archive", async (request) => {
    return {
      imported: await storage.importFileArchive(Buffer.from(request.body.archiveBase64, "base64"), {
        fileId: request.body.fileId,
        name: request.body.name
      })
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/export/archive", async (request, reply) => {
    const exported = await storage.exportFileArchive(request.params.fileId);
    reply.header("Content-Type", FILE_ARCHIVE_MIME_TYPE);
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    return reply.send(exported.archive);
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/export/library", async (request, reply) => {
    const exported = await storage.exportLibraryArchive(request.params.fileId);
    reply.header("Content-Type", LIBRARY_ARCHIVE_MIME_TYPE);
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    return reply.send(exported.archive);
  });

  server.post<{
    Params: { fileId: string };
    Body: { archiveBase64: string };
  }>("/files/:fileId/import/library/review", async (request) => {
    return {
      review: await storage.reviewLibraryArchive(
        request.params.fileId,
        Buffer.from(request.body.archiveBase64, "base64")
      )
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { archiveBase64: string; idPrefix?: string };
  }>("/files/:fileId/import/library", async (request) => {
    return {
      imported: await storage.importLibraryArchive(
        request.params.fileId,
        Buffer.from(request.body.archiveBase64, "base64"),
        {
          idPrefix: request.body.idPrefix
        }
      )
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/review", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      review: await storage.reviewLibraryRegistryItem(request.params.fileId, request.body.libraryId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/tokens/review", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      review: await storage.reviewLibraryRegistryTokens(request.params.fileId, request.body.libraryId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/tokens", async (request) => {
    await authorizeLibraryWrite(request, request.params.fileId);
    return {
      imported: await storage.importLibraryRegistryTokens(request.params.fileId, request.body.libraryId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string; idPrefix?: string };
  }>("/files/:fileId/import/library/registry", async (request) => {
    await authorizeLibraryWrite(request, request.params.fileId);
    return {
      imported: await storage.importLibraryRegistryItem(request.params.fileId, request.body.libraryId, {
        idPrefix: request.body.idPrefix
      })
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/libraries/subscriptions", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      subscriptions: await storage.listLibraryRegistrySubscriptions(request.params.fileId)
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/libraries/updates", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      updates: await storage.listLibraryRegistryUpdates(request.params.fileId)
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/libraries/token-subscriptions", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      subscriptions: await storage.listLibraryRegistryTokenSubscriptions(request.params.fileId)
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/libraries/token-updates", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      updates: await storage.listLibraryRegistryTokenUpdates(request.params.fileId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/update/review", async (request) => {
    await authorizeLibraryRead(request, request.params.fileId);
    return {
      review: await storage.reviewLibraryRegistryItemUpdate(
        request.params.fileId,
        request.body.libraryId
      )
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/update", async (request) => {
    await authorizeLibraryWrite(request, request.params.fileId);
    return {
      imported: await storage.updateLibraryRegistryItem(request.params.fileId, request.body.libraryId)
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { libraryId: string };
  }>("/files/:fileId/import/library/registry/tokens/update", async (request) => {
    await authorizeLibraryWrite(request, request.params.fileId);
    return {
      imported: await storage.updateLibraryRegistryTokens(request.params.fileId, request.body.libraryId)
    };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId", async (request) => {
    return { file: await storage.readFile(request.params.fileId) };
  });

  server.put<{
    Params: { fileId: string };
    Body: { document: DesignFile; baseDocument?: DesignFile };
  }>(
    "/files/:fileId",
    async (request) => ({
      file: await storage.replaceFileSnapshot(
        request.params.fileId,
        request.body.document,
        request.body.baseDocument
      )
    })
  );

  server.get<{ Params: { fileId: string } }>("/files/:fileId/versions", async (request) => {
    return { versions: await storage.listFileVersions(request.params.fileId) };
  });

  server.post<{ Params: { fileId: string }; Body: { message?: string } }>(
    "/files/:fileId/versions",
    async (request) => {
      return { version: await storage.saveFileVersion(request.params.fileId, request.body) };
    }
  );

  server.post<{ Params: { fileId: string }; Body: { keepUnpinned?: number } }>(
    "/files/:fileId/versions/prune",
    async (request) => {
      return {
        result: await storage.pruneFileVersions(request.params.fileId, {
          keepUnpinned: request.body?.keepUnpinned ?? 10
        })
      };
    }
  );

  server.get<{ Params: { fileId: string; versionId: string } }>(
    "/files/:fileId/versions/:versionId",
    async (request) => {
      return {
        version: await storage.readFileVersion(request.params.fileId, request.params.versionId)
      };
    }
  );

  server.patch<{
    Params: { fileId: string; versionId: string };
    Body: { pinned?: boolean };
  }>("/files/:fileId/versions/:versionId/pin", async (request) => {
    return {
      version: await storage.setFileVersionPinned(
        request.params.fileId,
        request.params.versionId,
        request.body?.pinned !== false
      )
    };
  });

  server.delete<{ Params: { fileId: string; versionId: string } }>(
    "/files/:fileId/versions/:versionId",
    async (request) => {
      return {
        version: await storage.deleteFileVersion(request.params.fileId, request.params.versionId)
      };
    }
  );

  server.post<{ Params: { fileId: string; versionId: string } }>(
    "/files/:fileId/versions/:versionId/restore",
    async (request) => {
      return await storage.restoreFileVersion(request.params.fileId, request.params.versionId);
    }
  );

  server.get<{ Params: { fileId: string }; Querystring: { includeResolved?: string; viewerId?: string } }>(
    "/files/:fileId/comments",
    async (request) => {
      const member = await authorizeCommentRead(request, request.params.fileId);
      return {
        threads: await storage.listCommentThreads(request.params.fileId, {
          includeResolved: request.query.includeResolved === "true",
          viewerId: member?.userId ?? request.query.viewerId
        })
      };
    }
  );

  server.get<{ Querystring: { viewerId?: string; fileId?: string; after?: string } }>(
    "/comments/events",
    async (request, reply) => {
      const fileId = request.query.fileId;
      if (!fileId) {
        throw Object.assign(
          new Error("comment event stream requires a file id"),
          { code: "EINVAL", statusCode: 400 }
        );
      }
      const authorizedTeamId = teamAuthorizationProvider
        ? await storage.getTeamIdForFile(fileId)
        : undefined;
      await authorizeCommentRead(request, fileId);
      if (eventStreamsClosing) {
        return reply.code(503).send({ error: "server is closing" });
      }
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Access-Control-Allow-Origin": "*",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      const sendBlock = (eventName: string, payload: unknown) => {
        if (!canWriteEventStream(reply.raw)) {
          return;
        }
        reply.raw.write(`event: ${eventName}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      let lastSequence = Math.max(0, Math.floor(Number(request.query.after) || 0));
      let sending = false;
      let heartbeatId: ReturnType<typeof setInterval> | undefined;
      let pollId: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (heartbeatId !== undefined) {
          clearInterval(heartbeatId);
        }
        if (pollId !== undefined) {
          clearInterval(pollId);
        }
        commentEventStreamClosers.delete(close);
        if (canWriteEventStream(reply.raw)) {
          reply.raw.end();
        }
      };
      const sendPendingEvents = async () => {
        if (sending || !canWriteEventStream(reply.raw)) {
          return;
        }
        sending = true;
        try {
          if (
            teamAuthorizationProvider
            && await storage.getTeamIdForFile(fileId) !== authorizedTeamId
          ) {
            throw Object.assign(
              new Error("comment stream team access changed"),
              { code: "EACCES", statusCode: 403 }
            );
          }
          await authorizeCommentRead(request, fileId);
          const events = await storage.listCommentLiveEvents({
            after: lastSequence,
            fileId,
            limit: 100
          });
          for (const event of events) {
            lastSequence = Math.max(lastSequence, event.sequence);
            sendBlock("comment", {
              ...event,
              viewerId: Array.isArray(request.headers["x-layo-user-id"])
                ? request.headers["x-layo-user-id"][0] ?? request.query.viewerId ?? event.viewerId
                : request.headers["x-layo-user-id"] ?? request.query.viewerId ?? event.viewerId
            });
          }
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 401 || statusCode === 403) {
            sendBlock("comment-authorization-ended", {
              code: statusCode === 401 ? "credential_inactive" : "team_access_revoked"
            });
            close();
            return;
          }
          sendBlock("comment-error", {
            message: error instanceof Error ? error.message : "comment event stream failed"
          });
        } finally {
          sending = false;
        }
      };

      heartbeatId = setInterval(() => {
        if (canWriteEventStream(reply.raw)) {
          reply.raw.write(": keepalive\n\n");
        }
      }, 25_000);
      pollId = setInterval(() => {
        void sendPendingEvents();
      }, 250);

      commentEventStreamClosers.add(close);
      sendBlock("ready", { ok: true, lastSequence });
      void sendPendingEvents();
      request.raw.on("close", close);
    }
  );

  server.post<{
    Params: { fileId: string };
    Body: {
      nodeId: string;
      body: string;
      authorId?: string;
      authorName?: string;
      mentionTargets?: StoredCommentMentionTarget[];
    };
  }>("/files/:fileId/comments", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const thread = await storage.createCommentThread(request.params.fileId, {
      ...request.body,
      authorId: member?.userId ?? request.body.authorId,
      authorName: member?.userId ?? request.body.authorName
    });
    return { thread };
  });

  server.patch<{
    Params: { fileId: string; threadId: string };
    Body: {
      body: string;
      actorId?: string;
      expectedModifiedAt: string;
      mentionTargets?: StoredCommentMentionTarget[];
    };
  }>("/files/:fileId/comments/:threadId", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const thread = await storage.updateCommentThread(
      request.params.fileId,
      request.params.threadId,
      {
        body: request.body.body,
        actorId: member?.userId ?? request.body.actorId ?? "사용자",
        expectedModifiedAt: request.body.expectedModifiedAt,
        mentionTargets: request.body.mentionTargets
      }
    );
    return { thread };
  });

  server.delete<{
    Params: { fileId: string; threadId: string };
    Body: { actorId?: string; expectedModifiedAt: string };
  }>("/files/:fileId/comments/:threadId", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const deleted = await storage.deleteCommentThread(
      request.params.fileId,
      request.params.threadId,
      {
        actorId: member?.userId ?? request.body.actorId ?? "사용자",
        expectedModifiedAt: request.body.expectedModifiedAt
      }
    );
    return { deleted };
  });

  server.get<{ Querystring: { viewerId?: string } }>("/comments/notifications", async (request) => {
    const member = await authenticateOptionalTeamMember(request);
    const projectIds = teamAuthorizationProvider
      ? await visibleCommentProjectIds(member)
      : undefined;
    return {
      summary: await storage.listCommentNotifications({
        viewerId: member?.userId ?? request.query.viewerId,
        projectIds
      })
    };
  });

  server.get<{ Querystring: { viewerId?: string; limit?: string } }>("/comments/activity", async (request) => {
    const member = await authenticateOptionalTeamMember(request);
    const projectIds = teamAuthorizationProvider
      ? await visibleCommentProjectIds(member)
      : undefined;
    return {
      feed: await storage.listCommentActivity({
        viewerId: member?.userId ?? request.query.viewerId,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        projectIds
      })
    };
  });

  server.post<{
    Params: { fileId: string };
    Body: { viewerId?: string };
  }>("/files/:fileId/comments/read", async (request) => {
    const member = await authorizeCommentRead(request, request.params.fileId);
    const threads = await storage.markFileCommentsRead(request.params.fileId, {
      viewerId: member?.userId ?? request.body.viewerId
    });
    return { threads };
  });

  server.post<{
    Params: { fileId: string; threadId: string };
    Body: {
      body: string;
      authorId?: string;
      authorName?: string;
      mentionTargets?: StoredCommentMentionTarget[];
    };
  }>("/files/:fileId/comments/:threadId/replies", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const thread = await storage.addCommentReply(
      request.params.fileId,
      request.params.threadId,
      {
        ...request.body,
        authorId: member?.userId ?? request.body.authorId,
        authorName: member?.userId ?? request.body.authorName
      }
    );
    return { thread };
  });

  server.patch<{
    Params: { fileId: string; threadId: string; replyId: string };
    Body: {
      body: string;
      actorId?: string;
      expectedModifiedAt: string;
      mentionTargets?: StoredCommentMentionTarget[];
    };
  }>("/files/:fileId/comments/:threadId/replies/:replyId", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const thread = await storage.updateCommentReply(
      request.params.fileId,
      request.params.threadId,
      request.params.replyId,
      {
        body: request.body.body,
        actorId: member?.userId ?? request.body.actorId ?? "사용자",
        expectedModifiedAt: request.body.expectedModifiedAt,
        mentionTargets: request.body.mentionTargets
      }
    );
    return { thread };
  });

  server.delete<{
    Params: { fileId: string; threadId: string; replyId: string };
    Body: { actorId?: string; expectedModifiedAt: string };
  }>("/files/:fileId/comments/:threadId/replies/:replyId", async (request) => {
    const member = await authorizeCommentWrite(request, request.params.fileId);
    const thread = await storage.deleteCommentReply(
      request.params.fileId,
      request.params.threadId,
      request.params.replyId,
      {
        actorId: member?.userId ?? request.body.actorId ?? "사용자",
        expectedModifiedAt: request.body.expectedModifiedAt
      }
    );
    return { thread };
  });

  server.post<{
    Params: { fileId: string; threadId: string };
    Body: { viewerId?: string };
  }>("/files/:fileId/comments/:threadId/read", async (request) => {
    const member = await authorizeCommentRead(request, request.params.fileId);
    const thread = await storage.markCommentThreadRead(
      request.params.fileId,
      request.params.threadId,
      { viewerId: member?.userId ?? request.body.viewerId }
    );
    return { thread };
  });

  server.post<{ Params: { fileId: string; threadId: string } }>(
    "/files/:fileId/comments/:threadId/resolve",
    async (request) => {
      const member = await authorizeCommentWrite(request, request.params.fileId);
      const thread = await storage.resolveCommentThread(
        request.params.fileId,
        request.params.threadId,
        member?.userId
      );
      return { thread };
    }
  );

  server.get<{ Params: { fileId: string } }>("/files/:fileId/tokens/dtcg", async (request) => {
    return { tokens: await storage.exportTokensDtcg(request.params.fileId) };
  });

  server.put<{ Params: { fileId: string }; Body: unknown }>(
    "/files/:fileId/tokens/dtcg",
    async (request) => {
      return await storage.importTokensDtcg(request.params.fileId, request.body);
    }
  );

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

  server.patch<{
    Params: { fileId: string; nodeId: string };
    Body: { assetId: string; naturalWidth?: number; naturalHeight?: number };
  }>("/files/:fileId/nodes/:nodeId/image", async (request) => {
    return {
      node: await storage.replaceImageAsset(
        request.params.fileId,
        request.params.nodeId,
        request.body
      )
    };
  });

  server.patch<{
    Params: { fileId: string; nodeId: string };
    Body: { fitMode: "fill" | "fit" };
  }>("/files/:fileId/nodes/:nodeId/image-fit", async (request, reply) => {
    if (request.body.fitMode !== "fill" && request.body.fitMode !== "fit") {
      return reply.code(400).send({ error: "invalid image fit mode" });
    }

    return {
      node: await storage.setImageFitMode(
        request.params.fileId,
        request.params.nodeId,
        request.body.fitMode
      )
    };
  });

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

  server.get<{ Params: { fileId: string } }>("/files/:fileId/code-mappings", async (request) => {
    return { mappings: await storage.listCodeComponentMappings(request.params.fileId) };
  });

  server.put<{ Params: { fileId: string }; Body: { mappings: CodeComponentMapping[] } }>(
    "/files/:fileId/code-mappings",
    async (request) => {
      return {
        mappings: await storage.setCodeComponentMappings(
          request.params.fileId,
          Array.isArray(request.body.mappings) ? request.body.mappings : []
        )
      };
    }
  );

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

  server.put<{
    Params: { fileId: string; componentId: string };
    Body: {
      variants: Array<{
        id: string;
        name: string;
        properties: Array<{ name: string; value: string; type?: "select" | "boolean" }>;
      }>;
    };
  }>("/files/:fileId/components/:componentId/variants", async (request) => {
    return {
      component: await storage.setComponentVariants(
        request.params.fileId,
        request.params.componentId,
        Array.isArray(request.body.variants) ? request.body.variants : []
      )
    };
  });

  server.patch<{
    Params: { fileId: string; componentId: string };
    Body: { area: ComponentVariantArea | null };
  }>("/files/:fileId/components/:componentId/variant-area", async (request) => {
    return {
      component: await storage.setComponentVariantArea(
        request.params.fileId,
        request.params.componentId,
        request.body.area ?? null
      )
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

  server.patch<{
    Params: { fileId: string; nodeId: string };
    Body: { variantId: string };
  }>("/files/:fileId/nodes/:nodeId/component-variant", async (request) => {
    return {
      node: await storage.setComponentInstanceVariant(
        request.params.fileId,
        request.params.nodeId,
        request.body.variantId
      )
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
