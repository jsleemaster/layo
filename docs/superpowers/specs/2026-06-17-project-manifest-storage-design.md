# Project Manifest Storage Design

## Context

Layo currently treats `DesignFile` as the primary persisted object. The local server stores documents under `.layo/files/*.json`, and collaboration stores `TeamManifest` records in browser IndexedDB for import, export, and relay-backed sync.

That is enough for a single sample file, but it does not give the product a durable project boundary. When users create a new design project, the app needs a saved record that can be listed, reopened, shared, and connected to a team without overloading either `DesignFile` or `TeamManifest`.

## Direction

Add a first-class `ProjectManifest` that is created and saved whenever a project is created.

The project manifest owns project-level metadata and document membership. `DesignFile` continues to own canvas contents. `TeamManifest` continues to own team collaboration configuration. The project manifest only references team sharing state; it does not duplicate relay credentials, passphrases, or document JSON.

## Goals

- Persist every created project immediately.
- Provide a stable project list and current project selection.
- Support multiple design documents per project later.
- Keep local-first behavior and deterministic agent access.
- Allow project sharing by linking a project to an existing team manifest.
- Avoid turning the collaboration manifest into a general project database.

## Non-Goals

- No maintainer-operated project backend.
- No account system.
- No cloud project ownership model.
- No passphrase or derived-key storage in project manifests.
- No replacement of existing file-backed `DesignFile` storage.
- No migration to a granular Yjs project database in this slice.

## Project Model

Introduce a shared project type:

```ts
interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDocumentId: string;
  documents: ProjectDocumentSummary[];
  sharing: ProjectSharing;
}

interface ProjectDocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

type ProjectSharing =
  | { mode: "private" }
  | { mode: "team"; teamId: string };
```

`projectId` and `documentId` should use safe deterministic IDs for filesystem paths and relay room names. The first project creation path creates both a `ProjectManifest` and an initial `DesignFile`.

## Storage

Use the local API server filesystem as the canonical project store:

```text
.layo/
  projects/
    {projectId}.json
  files/
    {documentId}.json
```

This matches the current local-first app shape and keeps HTTP/MCP agents able to inspect and mutate the same saved project state that the browser sees.

Browser IndexedDB remains useful, but not as the only source of truth for projects. It should store lightweight client state such as the current project ID, recent project IDs, cached team manifests, and collaboration runtime preferences.

## API Shape

Add project routes to `apps/server`:

- `GET /projects`: list saved projects.
- `POST /projects`: create a project manifest and first document.
- `GET /projects/:projectId`: read one project manifest.
- `PATCH /projects/:projectId`: rename or update project metadata.
- `POST /projects/:projectId/documents`: create another document in the project.
- `PATCH /projects/:projectId/sharing`: set sharing mode to private or team.

Existing file routes can remain document-level routes. The app should load a project first, then load `currentDocumentId` through the existing file route.

## UI Flow

The editor should gain a compact project workflow without becoming a landing page:

- Project switcher near the file title.
- New project action.
- Rename project action.
- Recent project list.
- Share status that shows private or team-linked state.
- Sharing action that links the current project to the active team manifest.

The canvas remains the first screen. Project controls should be compact and operational, not marketing-like.

## Sharing Flow

Sharing a project does not export the whole project into `TeamManifest`. Instead:

1. User creates or imports a team manifest.
2. User links the current project to that team.
3. `ProjectManifest.sharing` changes to `{ mode: "team", teamId }`.
4. `TeamManifest.documents` is updated with the project's document summaries for portable team sharing.
5. Collaboration sessions still use deterministic room IDs:

```text
layo:{teamId}:{documentId}
```

This keeps project ownership local while allowing the team manifest to remain the portable collaboration artifact.

## Agent Flow

Agent tools should gain project awareness without losing document-level determinism:

1. Agent lists projects.
2. Agent reads the target project manifest.
3. Agent chooses a document from `documents` or `currentDocumentId`.
4. Agent uses existing inspect, find, command, validate, summary, and export tools on that document.

Future MCP tools can mirror the HTTP routes:

- `list_projects`
- `create_project`
- `get_project`
- `update_project`
- `create_project_document`
- `set_project_sharing`

## Migration

On first run after this feature lands, the server should create a default project for the existing sample document if no project manifests exist.

The default project should reference `sample-file` as its current document. Existing `.layo/files/*.json` documents should not be deleted or rewritten beyond metadata updates needed to attach them to a project.

## Error Handling

- Creating a project fails if the generated or requested project ID is unsafe.
- Creating a project writes the project manifest and initial design file as one logical operation. If document creation fails, the project manifest should not be left pointing at a missing document.
- Linking a project to a team fails if the team manifest is not available locally.
- Removing sharing sets `sharing.mode` back to `private` and does not destroy relay data or team manifests.
- Importing a team manifest never stores runtime passphrases or derived encryption keys in the project manifest.

## Testing

Cover this at four levels:

- Unit tests for project manifest validation and path-safe IDs.
- Server storage tests for create, list, read, update, document creation, and sample migration.
- HTTP tests for project routes and failure cases.
- Playwright CLI e2e for creating a project, reopening it from the project list, linking it to a team, and verifying the rendered canvas still loads.

## Future Work

- Browser-only project storage adapter for static deployments without `apps/server`.
- Project export bundle containing a project manifest plus referenced design files.
- GitHub-backed project manifests for open-source design workflows.
- Project templates.
- Multi-document tabs inside a project.
- Fine-grained Yjs document storage once concurrent editing requirements justify it.
