# Project Manifest Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every created design project as a first-class `ProjectManifest`, expose project management through HTTP/MCP, and let the web editor create, reopen, and team-link projects.

**Architecture:** Add project manifest methods to the existing server storage boundary because the local filesystem remains the canonical local-first store. Keep `DesignFile` as the document JSON format and `TeamManifest` as the collaboration artifact; `ProjectManifest` only owns project metadata, document membership, current document selection, and sharing references.

**Tech Stack:** TypeScript, Fastify, Vitest, MCP SDK, React, Vite, IndexedDB, Playwright CLI.

---

### Task 1: Project Manifest Storage

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/storage.test.ts`

- [x] **Step 1: Write failing storage tests**

Add these tests near the top of `apps/server/src/storage.test.ts`, after the sample document read test:

```ts
  test("seeds a default project for the sample document", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    const projects = await storage.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      schemaVersion: 1,
      projectId: "sample-project",
      name: "샘플 프로젝트",
      currentDocumentId: "sample-file",
      sharing: { mode: "private" },
      documents: [
        {
          documentId: "sample-file",
          name: "샘플 파일"
        }
      ]
    });
  });

  test("creates, reads, renames, shares, and appends documents to projects", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    const created = await storage.createProject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      documentId: "document-alpha",
      documentName: "알파 문서"
    });
    expect(created).toMatchObject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      currentDocumentId: "document-alpha",
      sharing: { mode: "private" }
    });
    expect(await storage.readFile("document-alpha")).toMatchObject({
      id: "document-alpha",
      name: "알파 문서"
    });

    const renamed = await storage.updateProject("project-alpha", { name: "리네임 프로젝트" });
    expect(renamed.name).toBe("리네임 프로젝트");

    const nextDocument = await storage.createProjectDocument("project-alpha", {
      documentId: "document-beta",
      name: "베타 문서"
    });
    expect(nextDocument.currentDocumentId).toBe("document-beta");
    expect(nextDocument.documents.map((document) => document.documentId)).toEqual([
      "document-alpha",
      "document-beta"
    ]);

    const shared = await storage.setProjectSharing("project-alpha", {
      mode: "team",
      teamId: "team-alpha"
    });
    expect(shared.sharing).toEqual({ mode: "team", teamId: "team-alpha" });

    const privateProject = await storage.setProjectSharing("project-alpha", { mode: "private" });
    expect(privateProject.sharing).toEqual({ mode: "private" });
  });

  test("rejects unsafe project and document ids", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    await expect(
      storage.createProject({
        projectId: "../bad",
        name: "Bad",
        documentId: "document-safe",
        documentName: "Safe"
      })
    ).rejects.toThrow(/safe id/i);

    await expect(
      storage.createProject({
        projectId: "project-safe",
        name: "Safe",
        documentId: "../bad",
        documentName: "Bad"
      })
    ).rejects.toThrow(/safe id/i);
  });
```

- [x] **Step 2: Run storage tests and verify they fail**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts
```

Expected: FAIL because `FileStorage` does not yet have `listProjects`, `createProject`, `updateProject`, `createProjectDocument`, or `setProjectSharing`.

- [x] **Step 3: Add project types and storage methods**

In `apps/server/src/storage.ts`, add these exports after `StoredFileSummary`:

```ts
export interface ProjectDocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSharing =
  | { mode: "private" }
  | { mode: "team"; teamId: string };

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDocumentId: string;
  documents: ProjectDocumentSummary[];
  sharing: ProjectSharing;
}

export interface CreateProjectInput {
  projectId?: string;
  name?: string;
  documentId?: string;
  documentName?: string;
}

export interface UpdateProjectInput {
  name?: string;
  currentDocumentId?: string;
}

export interface CreateProjectDocumentInput {
  documentId?: string;
  name?: string;
}
```

Add a `projectsDir` getter beside `filesDir`, then add project helper methods inside `FileStorage`:

```ts
  private get projectsDir() {
    return path.join(this.rootDir, "projects");
  }

  private projectPathFor(projectId: string) {
    assertSafeStorageId(projectId);
    return path.join(this.projectsDir, `${projectId}.json`);
  }

  async ensureSeedProject() {
    await this.ensureSeedFile();
    await mkdir(this.projectsDir, { recursive: true });
    const entries = await readdir(this.projectsDir).catch(() => []);
    if (entries.some((entry) => entry.endsWith(".json"))) {
      return;
    }

    const sample = await this.readFile(sampleDocument.id);
    const now = new Date().toISOString();
    await this.writeProject({
      schemaVersion: 1,
      projectId: "sample-project",
      name: "샘플 프로젝트",
      createdAt: now,
      updatedAt: now,
      currentDocumentId: sample.id,
      documents: [
        {
          documentId: sample.id,
          name: sample.name,
          createdAt: now,
          updatedAt: now
        }
      ],
      sharing: { mode: "private" }
    });
  }

  async listProjects(): Promise<ProjectManifest[]> {
    await this.ensureSeedProject();
    const entries = await readdir(this.projectsDir);
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.projectsDir, entry), "utf8");
          return parseProjectManifest(JSON.parse(raw));
        })
    );

    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async readProject(projectId: string): Promise<ProjectManifest> {
    await this.ensureSeedProject();
    const raw = await readFile(this.projectPathFor(projectId), "utf8");
    return parseProjectManifest(JSON.parse(raw));
  }

  async createProject(input: CreateProjectInput = {}): Promise<ProjectManifest> {
    const now = new Date().toISOString();
    const projectId = input.projectId ?? createStorageId("project");
    const documentId = input.documentId ?? createStorageId("document");
    assertSafeStorageId(projectId);
    assertSafeStorageId(documentId);
    const projectName = normalizeName(input.name, "새 프로젝트");
    const documentName = normalizeName(input.documentName, `${projectName} 문서`);
    const document = createInitialDesignFile(documentId, documentName);

    await this.writeFile(documentId, document);
    return this.writeProject({
      schemaVersion: 1,
      projectId,
      name: projectName,
      createdAt: now,
      updatedAt: now,
      currentDocumentId: documentId,
      documents: [{ documentId, name: documentName, createdAt: now, updatedAt: now }],
      sharing: { mode: "private" }
    });
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const nextCurrentDocumentId = input.currentDocumentId ?? project.currentDocumentId;
    if (!project.documents.some((document) => document.documentId === nextCurrentDocumentId)) {
      throw new Error(`project document not found: ${nextCurrentDocumentId}`);
    }

    return this.writeProject({
      ...project,
      name: input.name === undefined ? project.name : normalizeName(input.name, project.name),
      currentDocumentId: nextCurrentDocumentId,
      updatedAt: new Date().toISOString()
    });
  }

  async createProjectDocument(
    projectId: string,
    input: CreateProjectDocumentInput = {}
  ): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const now = new Date().toISOString();
    const documentId = input.documentId ?? createStorageId("document");
    assertSafeStorageId(documentId);
    if (project.documents.some((document) => document.documentId === documentId)) {
      throw new Error(`project document already exists: ${documentId}`);
    }

    const name = normalizeName(input.name, "새 문서");
    await this.writeFile(documentId, createInitialDesignFile(documentId, name));
    return this.writeProject({
      ...project,
      updatedAt: now,
      currentDocumentId: documentId,
      documents: [...project.documents, { documentId, name, createdAt: now, updatedAt: now }]
    });
  }

  async setProjectSharing(projectId: string, sharing: ProjectSharing): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const nextSharing =
      sharing.mode === "team"
        ? { mode: "team" as const, teamId: normalizeName(sharing.teamId, "") }
        : { mode: "private" as const };
    if (nextSharing.mode === "team" && !nextSharing.teamId) {
      throw new Error("team id is required for project sharing");
    }

    return this.writeProject({
      ...project,
      sharing: nextSharing,
      updatedAt: new Date().toISOString()
    });
  }

  private async writeProject(project: ProjectManifest): Promise<ProjectManifest> {
    await mkdir(this.projectsDir, { recursive: true });
    const parsed = parseProjectManifest(project);
    await writeFile(this.projectPathFor(parsed.projectId), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return parsed;
  }
```

Add these helper functions near the bottom of `storage.ts`:

```ts
function assertSafeStorageId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`safe id is required: ${value}`);
  }
}

function createStorageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(value: string | undefined, fallback: string) {
  const normalized = value?.trim() || fallback;
  if (!normalized.trim()) {
    throw new Error("name is required");
  }
  return normalized;
}

function createInitialDesignFile(documentId: string, name: string): DesignFile {
  return {
    ...(JSON.parse(JSON.stringify(sampleDocument)) as DesignFile),
    id: documentId,
    name
  };
}

function parseProjectManifest(input: unknown): ProjectManifest {
  if (!input || typeof input !== "object") {
    throw new Error("invalid project manifest");
  }
  const candidate = input as ProjectManifest;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported project manifest schema version: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.projectId);
  assertSafeStorageId(candidate.currentDocumentId);
  if (!candidate.name?.trim()) {
    throw new Error("project name is required");
  }
  if (!Array.isArray(candidate.documents) || candidate.documents.length === 0) {
    throw new Error("project documents are required");
  }
  for (const document of candidate.documents) {
    assertSafeStorageId(document.documentId);
    if (!document.name?.trim()) {
      throw new Error("project document name is required");
    }
  }
  if (!candidate.documents.some((document) => document.documentId === candidate.currentDocumentId)) {
    throw new Error(`project current document not found: ${candidate.currentDocumentId}`);
  }
  if (candidate.sharing.mode === "team" && !candidate.sharing.teamId?.trim()) {
    throw new Error("team id is required for project sharing");
  }

  return candidate;
}
```

- [x] **Step 4: Run storage tests and verify they pass**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit storage work**

Run:

```bash
git add apps/server/src/storage.ts apps/server/src/storage.test.ts
git commit -m "feat: persist project manifests"
```

### Task 2: HTTP Project Routes

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`

- [x] **Step 1: Write failing HTTP route tests**

Add this test after the first HTTP server test in `apps/server/src/http.test.ts`:

```ts
  test("serves project create, read, update, document, and sharing routes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const server = createHttpServer(new FileStorage(tempRoot));

    const projects = await server.inject({ method: "GET", url: "/projects" });
    expect(projects.statusCode).toBe(200);
    expect(projects.json().projects[0]).toMatchObject({
      projectId: "sample-project",
      currentDocumentId: "sample-file"
    });

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
  });
```

- [x] **Step 2: Run HTTP tests and verify they fail**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts
```

Expected: FAIL with 404 responses for `/projects`.

- [x] **Step 3: Add Fastify project routes**

In `apps/server/src/http.ts`, register these routes immediately after `/health`:

```ts
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
```

- [x] **Step 4: Run HTTP tests and verify they pass**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit HTTP routes**

Run:

```bash
git add apps/server/src/http.ts apps/server/src/http.test.ts
git commit -m "feat: expose project routes"
```

### Task 3: MCP Project Tools

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/mcp.test.ts`

- [x] **Step 1: Write failing MCP project tool tests**

Add this test to `apps/server/src/mcp.test.ts` after the annotations test:

```ts
  test("lets an MCP client manage project manifests", async () => {
    const client = await connectMcpClient();

    const listed = parseToolJson(
      await client.callTool({
        name: "list_projects",
        arguments: {}
      })
    );
    expect(listed.projects[0]).toMatchObject({
      projectId: "sample-project",
      currentDocumentId: "sample-file"
    });

    const created = parseToolJson(
      await client.callTool({
        name: "create_project",
        arguments: {
          projectId: "project-mcp",
          name: "MCP 프로젝트",
          documentId: "document-mcp",
          documentName: "MCP 문서"
        }
      })
    );
    expect(created.project).toMatchObject({
      projectId: "project-mcp",
      currentDocumentId: "document-mcp"
    });

    const renamed = parseToolJson(
      await client.callTool({
        name: "update_project",
        arguments: { projectId: "project-mcp", name: "MCP 리네임" }
      })
    );
    expect(renamed.project.name).toBe("MCP 리네임");

    const nextDocument = parseToolJson(
      await client.callTool({
        name: "create_project_document",
        arguments: { projectId: "project-mcp", documentId: "document-mcp-2", name: "두 번째 MCP 문서" }
      })
    );
    expect(nextDocument.project.currentDocumentId).toBe("document-mcp-2");

    const shared = parseToolJson(
      await client.callTool({
        name: "set_project_sharing",
        arguments: { projectId: "project-mcp", mode: "team", teamId: "team-mcp" }
      })
    );
    expect(shared.project.sharing).toEqual({ mode: "team", teamId: "team-mcp" });
  });
```

- [x] **Step 2: Run MCP tests and verify they fail**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts
```

Expected: FAIL because project tools are not registered.

- [x] **Step 3: Register MCP project tools**

In `apps/server/src/mcp.ts`, register the project tools after `list_files`:

```ts
  server.registerTool(
    "list_projects",
    {
      description: "List local Layo projects and their document membership.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {}
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ projects: await storage.listProjects() }, null, 2) }]
    })
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a saved project manifest and its initial design document.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().optional().describe("Optional safe project id"),
        name: z.string().optional().describe("Project display name"),
        documentId: z.string().optional().describe("Optional safe initial document id"),
        documentName: z.string().optional().describe("Initial design document name")
      }
    },
    async ({ projectId, name, documentId, documentName }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { project: await storage.createProject({ projectId, name, documentId, documentName }) },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "get_project",
    {
      description: "Read a saved project manifest by id.",
      annotations: readOnlyToolAnnotations,
      inputSchema: { projectId: z.string().describe("Project id returned by list_projects") }
    },
    async ({ projectId }) => ({
      content: [
        { type: "text", text: JSON.stringify({ project: await storage.readProject(projectId) }, null, 2) }
      ]
    })
  );

  server.registerTool(
    "update_project",
    {
      description: "Rename a project or switch its current document.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        name: z.string().optional().describe("New project display name"),
        currentDocumentId: z.string().optional().describe("Existing project document id to open by default")
      }
    },
    async ({ projectId, name, currentDocumentId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { project: await storage.updateProject(projectId, { name, currentDocumentId }) },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_project_document",
    {
      description: "Create a new design document inside an existing project.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        documentId: z.string().optional().describe("Optional safe document id"),
        name: z.string().optional().describe("Document display name")
      }
    },
    async ({ projectId, documentId, name }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { project: await storage.createProjectDocument(projectId, { documentId, name }) },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "set_project_sharing",
    {
      description: "Set a project sharing reference to private or a team manifest id.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        mode: z.enum(["private", "team"]),
        teamId: z.string().optional().describe("Required when mode is team")
      }
    },
    async ({ projectId, mode, teamId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.setProjectSharing(
                projectId,
                mode === "team" ? { mode: "team", teamId: teamId ?? "" } : { mode: "private" }
              )
            },
            null,
            2
          )
        }
      ]
    })
  );
```

- [x] **Step 4: Run MCP tests and verify they pass**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit MCP tools**

Run:

```bash
git add apps/server/src/mcp.ts apps/server/src/mcp.test.ts
git commit -m "feat: add project MCP tools"
```

### Task 4: Web Project API And Client State

**Files:**
- Create: `apps/web/src/project-api.ts`
- Create: `apps/web/src/project-store.ts`
- Create: `apps/web/src/project-api.test.ts`
- Create: `apps/web/src/project-store.test.ts`

- [x] **Step 1: Write failing web API tests**

Create `apps/web/src/project-api.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  createProject,
  fetchProjects,
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
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ project }), { status: 200 });
    };

    await createProject({ name: "새 프로젝트" }, fetcher as typeof fetch);
    await updateProject("project-web", { name: "리네임" }, fetcher as typeof fetch);
    await setProjectSharing("project-web", { mode: "team", teamId: "team-web" }, fetcher as typeof fetch);

    expect(requests).toEqual([
      { url: "http://127.0.0.1:4317/projects", body: { name: "새 프로젝트" } },
      { url: "http://127.0.0.1:4317/projects/project-web", body: { name: "리네임" } },
      {
        url: "http://127.0.0.1:4317/projects/project-web/sharing",
        body: { mode: "team", teamId: "team-web" }
      }
    ]);
  });
});
```

- [x] **Step 2: Write failing project store tests**

Create `apps/web/src/project-store.test.ts`:

```ts
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test } from "vitest";
import { createIndexedDbProjectStore } from "./project-store";

describe("indexeddb project store", () => {
  test("stores and loads the current project id", async () => {
    const store = createIndexedDbProjectStore({
      databaseName: `project-store-${Date.now()}`,
      indexedDB: new IDBFactory()
    });

    await store.setCurrentProjectId("project-web");

    await expect(store.getCurrentProjectId()).resolves.toBe("project-web");
  });
});
```

- [x] **Step 3: Run web tests and verify they fail**

Run:

```bash
pnpm --filter @layo/web test -- src/project-api.test.ts src/project-store.test.ts
```

Expected: FAIL because `project-api.ts` and `project-store.ts` do not exist.

- [x] **Step 4: Add project API client**

Create `apps/web/src/project-api.ts`:

```ts
const API_BASE_URL = "http://127.0.0.1:4317";

export interface ProjectDocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSharing =
  | { mode: "private" }
  | { mode: "team"; teamId: string };

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDocumentId: string;
  documents: ProjectDocumentSummary[];
  sharing: ProjectSharing;
}

export async function fetchProjects(fetcher: typeof fetch = fetch): Promise<ProjectManifest[]> {
  const response = await fetcher(`${API_BASE_URL}/projects`);
  const payload = await readJson(response);
  return (payload as { projects: ProjectManifest[] }).projects;
}

export async function createProject(
  input: { name?: string; projectId?: string; documentId?: string; documentName?: string },
  fetcher: typeof fetch = fetch
): Promise<ProjectManifest> {
  return writeProject(`${API_BASE_URL}/projects`, "POST", input, fetcher);
}

export async function updateProject(
  projectId: string,
  input: { name?: string; currentDocumentId?: string },
  fetcher: typeof fetch = fetch
): Promise<ProjectManifest> {
  return writeProject(`${API_BASE_URL}/projects/${projectId}`, "PATCH", input, fetcher);
}

export async function setProjectSharing(
  projectId: string,
  sharing: ProjectSharing,
  fetcher: typeof fetch = fetch
): Promise<ProjectManifest> {
  return writeProject(`${API_BASE_URL}/projects/${projectId}/sharing`, "PATCH", sharing, fetcher);
}

async function writeProject(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
  fetcher: typeof fetch
): Promise<ProjectManifest> {
  const response = await fetcher(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  return (payload as { project: ProjectManifest }).project;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`프로젝트 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}
```

- [x] **Step 5: Add project current-id store**

Create `apps/web/src/project-store.ts`:

```ts
export interface ProjectStore {
  setCurrentProjectId(projectId: string): Promise<void>;
  getCurrentProjectId(): Promise<string | null>;
}

export interface IndexedDbProjectStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
}

const DEFAULT_DATABASE_NAME = "layo-projects";
const DATABASE_VERSION = 1;
const SETTINGS_STORE = "settings";
const CURRENT_PROJECT_KEY = "currentProjectId";

export function createIndexedDbProjectStore(options: IndexedDbProjectStoreOptions = {}): ProjectStore {
  const idb = options.indexedDB ?? globalThis.indexedDB;
  if (!idb) {
    throw new Error("IndexedDB를 사용할 수 없습니다");
  }
  const databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const open = () => openDatabase(idb, databaseName);

  return {
    async setCurrentProjectId(projectId) {
      const database = await open();
      try {
        const transaction = database.transaction(SETTINGS_STORE, "readwrite");
        transaction.objectStore(SETTINGS_STORE).put(projectId, CURRENT_PROJECT_KEY);
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
    async getCurrentProjectId() {
      const database = await open();
      try {
        const value = await request<string | undefined>(
          database.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(CURRENT_PROJECT_KEY)
        );
        return value ?? null;
      } finally {
        database.close();
      }
    }
  };
}

function openDatabase(idb: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = idb.open(databaseName, DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE);
      }
    };
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => resolve(openRequest.result);
  });
}

function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.onerror = () => reject(input.error);
    input.onsuccess = () => resolve(input.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
```

- [x] **Step 6: Run web API/store tests and verify they pass**

Run:

```bash
pnpm --filter @layo/web test -- src/project-api.test.ts src/project-store.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit web API/store work**

Run:

```bash
git add apps/web/src/project-api.ts apps/web/src/project-api.test.ts apps/web/src/project-store.ts apps/web/src/project-store.test.ts
git commit -m "feat: add web project client state"
```

### Task 5: Web Project Workflow UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write failing Playwright CLI test**

Add this test near the top of `apps/web/e2e/editor-mvp.spec.ts`:

```ts
test("creates, reopens, and team-links a saved project", async ({ page }) => {
  await rm(".layo/projects", { recursive: true, force: true });
  await rm(".layo/files", { recursive: true, force: true });
  await rm("apps/server/.layo/projects", { recursive: true, force: true });
  await rm("apps/server/.layo/files", { recursive: true, force: true });

  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByTestId("project-switcher")).toHaveValue("sample-project");

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const createdProjectId = await page.getByTestId("project-switcher").inputValue();
  expect(createdProjectId).not.toBe("sample-project");
  await expect(page.getByTestId("project-name")).toHaveValue(/새 프로젝트/);

  const projectsResponse = await page.request.get("http://127.0.0.1:4317/projects");
  expect(projectsResponse.ok()).toBeTruthy();
  const projectsPayload = await projectsResponse.json();
  expect(projectsPayload.projects.map((project: { projectId: string }) => project.projectId)).toContain(
    createdProjectId
  );

  await page.reload();
  await expect(page.getByTestId("project-switcher")).toHaveValue(createdProjectId);

  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");

  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${createdProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  expect((await projectResponse.json()).project.sharing).toMatchObject({ mode: "team" });
});
```

- [x] **Step 2: Run the Playwright CLI test and verify it fails**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "creates, reopens, and team-links a saved project" --reporter=line
```

Expected: FAIL because the project UI does not exist.

- [x] **Step 3: Wire project state into `App.tsx`**

In `apps/web/src/App.tsx`, import project helpers:

```ts
import {
  createProject as createSavedProject,
  fetchProjects,
  setProjectSharing,
  updateProject,
  type ProjectManifest
} from "./project-api";
import { createIndexedDbProjectStore } from "./project-store";
```

Add this module constant beside `teamStore`:

```ts
const projectStore = createIndexedDbProjectStore();
```

Add project state inside `App` near the existing team state:

```ts
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectManifest | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectStatus, setProjectStatus] = useState("프로젝트 불러오는 중");
```

Replace the existing sample-file loading `useEffect` with:

```ts
  useEffect(() => {
    let cancelled = false;

    const loadInitialProject = async () => {
      try {
        const [projectList, storedProjectId] = await Promise.all([
          fetchProjects(),
          projectStore.getCurrentProjectId()
        ]);
        const selectedProject =
          projectList.find((project) => project.projectId === storedProjectId) ?? projectList[0] ?? null;
        if (!selectedProject) {
          setProjectStatus("저장된 프로젝트 없음");
          setEditor(null);
          return;
        }

        await loadProject(selectedProject, projectList);
      } catch {
        if (!cancelled) {
          setProjectStatus("로컬 서버를 시작하면 프로젝트를 불러옵니다");
          setEditor(null);
        }
      }
    };

    const loadProject = async (project: ProjectManifest, projectList: ProjectManifest[]) => {
      const response = await fetch(`http://127.0.0.1:4317/files/${project.currentDocumentId}`);
      const payload = await response.json();
      if (cancelled) {
        return;
      }
      setProjects(projectList);
      setCurrentProject(project);
      setProjectNameDraft(project.name);
      await projectStore.setCurrentProjectId(project.projectId);
      setEditor(createEditorState(parseDocumentPayload(payload)));
      setProjectStatus(`${project.name} 불러옴`);
    };

    void loadInitialProject();
    return () => {
      cancelled = true;
    };
  }, []);
```

Add helper functions near the team actions:

```ts
  const openProject = async (projectId: string) => {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      return;
    }
    const response = await fetch(`http://127.0.0.1:4317/files/${project.currentDocumentId}`);
    const payload = await response.json();
    setCurrentProject(project);
    setProjectNameDraft(project.name);
    await projectStore.setCurrentProjectId(project.projectId);
    setEditor(createEditorState(parseDocumentPayload(payload)));
    setProjectStatus(`${project.name} 불러옴`);
  };

  const createNewProject = async () => {
    const project = await createSavedProject({
      name: `새 프로젝트 ${projects.length + 1}`,
      documentName: `새 문서 ${projects.length + 1}`
    });
    const nextProjects = [project, ...projects.filter((candidate) => candidate.projectId !== project.projectId)];
    setProjects(nextProjects);
    setCurrentProject(project);
    setProjectNameDraft(project.name);
    await projectStore.setCurrentProjectId(project.projectId);
    const response = await fetch(`http://127.0.0.1:4317/files/${project.currentDocumentId}`);
    const payload = await response.json();
    setEditor(createEditorState(parseDocumentPayload(payload)));
    setProjectStatus("새 프로젝트 저장됨");
  };

  const saveProjectName = async () => {
    if (!currentProject) {
      return;
    }
    const project = await updateProject(currentProject.projectId, { name: projectNameDraft });
    setCurrentProject(project);
    setProjects((current) =>
      current.map((candidate) => (candidate.projectId === project.projectId ? project : candidate))
    );
    setProjectStatus(`${project.name} 저장됨`);
  };

  const linkProjectToCurrentTeam = async () => {
    if (!currentProject || !collabSession) {
      return;
    }
    const project = await setProjectSharing(currentProject.projectId, {
      mode: "team",
      teamId: collabSession.team.teamId
    });
    setCurrentProject(project);
    setProjects((current) =>
      current.map((candidate) => (candidate.projectId === project.projectId ? project : candidate))
    );
    setProjectStatus(`${project.name} 공유 설정 저장됨`);
  };
```

- [x] **Step 4: Render compact project controls**

In the sidebar, replace:

```tsx
            <h1>Layo</h1>
            <p>{editor ? editor.document.name : "로컬 서버를 시작하면 샘플 파일을 불러옵니다."}</p>
```

with:

```tsx
            <h1>Layo</h1>
            <section className="project-panel" aria-label="프로젝트">
              <label>
                프로젝트
                <select
                  data-testid="project-switcher"
                  value={currentProject?.projectId ?? ""}
                  onChange={(event) => void openProject(event.currentTarget.value)}
                >
                  {projects.map((project) => (
                    <option key={project.projectId} value={project.projectId}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                이름
                <input
                  data-testid="project-name"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.currentTarget.value)}
                />
              </label>
              <div className="project-actions">
                <button type="button" onClick={createNewProject}>
                  새 프로젝트 만들기
                </button>
                <button type="button" onClick={saveProjectName} disabled={!currentProject}>
                  이름 저장
                </button>
                <button type="button" onClick={linkProjectToCurrentTeam} disabled={!currentProject || !collabSession}>
                  현재 팀과 공유
                </button>
              </div>
              <div className="project-status" data-testid="project-status">
                {projectStatus}
              </div>
              <div className="project-status" data-testid="project-sharing-status">
                {currentProject?.sharing.mode === "team"
                  ? `공유됨 · ${collabSession?.team.name ?? currentProject.sharing.teamId}`
                  : "비공개 프로젝트"}
              </div>
            </section>
            <p>{editor ? editor.document.name : "로컬 서버를 시작하면 프로젝트를 불러옵니다."}</p>
```

- [x] **Step 5: Add project styles**

In `apps/web/src/styles.css`, add these rules next to the team panel form rules:

```css
.project-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--editor-color-border);
  border-radius: 8px;
  background: var(--editor-color-surface);
}

.project-panel label {
  display: grid;
  gap: 4px;
  color: var(--editor-color-muted);
  font-size: 12px;
}

.project-panel input,
.project-panel select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--editor-color-border);
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--editor-color-text);
  background: var(--editor-color-bg);
}

.project-actions {
  display: grid;
  gap: 6px;
}

.project-actions button {
  width: 100%;
}

.project-status {
  color: var(--editor-color-muted);
  font-size: 12px;
  line-height: 1.4;
}
```

- [x] **Step 6: Run the Playwright CLI test and verify it passes**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "creates, reopens, and team-links a saved project" --reporter=line
```

Expected: PASS.

- [x] **Step 7: Commit web workflow**

Run:

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/e2e/editor-mvp.spec.ts
git commit -m "feat: add project workflow UI"
```

### Task 6: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update README project documentation**

Add this section before `## Code Export` in `README.md`:

````md
## Projects

Projects are saved as local-first manifests under `.layo/projects`.
Each `ProjectManifest` records the project name, current document, document
membership, and sharing reference. Canvas contents remain in
`.layo/files` as `DesignFile` JSON.

HTTP:

```bash
curl http://127.0.0.1:4317/projects
```

MCP:

```text
list_projects({})
create_project({ "name": "새 프로젝트" })
```

Project sharing links a project to a `TeamManifest` by `teamId`. The project
manifest never stores relay passphrases or derived encryption keys.
````

- [x] **Step 2: Update plan status**

Add a row to `docs/superpowers/PLAN_STATUS.md` under `## Current Active Plan` while the work is in progress:

```md
Current active implementation:

- `2026-06-17-project-manifest-storage.md`: In progress on `codex/project-manifest-storage`; implements project manifests, HTTP/MCP project tools, and web project workflow from `docs/superpowers/specs/2026-06-17-project-manifest-storage-design.md`.
```

- [x] **Step 3: Run focused tests**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts src/http.test.ts src/mcp.test.ts
pnpm --filter @layo/web test -- src/project-api.test.ts src/project-store.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "creates, reopens, and team-links a saved project" --reporter=line
```

Expected: all pass.

- [x] **Step 4: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
cargo test --workspace
pnpm --filter @layo/web build
pnpm test:e2e
```

Expected: all pass. If `pnpm test:e2e` starts the dev servers through the existing test script, use that. If it does not, start `apps/server` and `apps/web` in separate terminals, then rerun the Playwright CLI command.

- [x] **Step 5: Commit docs and plan status**

Run:

```bash
git add README.md docs/superpowers/PLAN_STATUS.md docs/superpowers/plans/2026-06-17-project-manifest-storage.md
git commit -m "docs: document project manifest workflow"
```
