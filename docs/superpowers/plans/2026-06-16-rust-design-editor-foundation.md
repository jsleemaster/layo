# Rust Design Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable foundation for Layo: monorepo scaffolding, Rust document core, local Fastify server, read-only MCP stdio entrypoint, and a minimal Vite React editor shell.

**Architecture:** Rust owns the document model, commands, geometry, and design-context generation. TypeScript owns the local server, MCP transport, web UI shell, and renderer adapter boundary. The first renderer is a thin Konva-backed adapter fed by document JSON rather than authoritative canvas state.

**Tech Stack:** Rust 2021, Cargo workspace, serde, ts-rs, pnpm workspaces, TypeScript, Vite React, Fastify, Vitest, `@modelcontextprotocol/sdk`, Zod, React Konva.

---

## File Structure

- Create `package.json`: root pnpm scripts for all workspaces.
- Create `pnpm-workspace.yaml`: workspace package discovery.
- Create `tsconfig.base.json`: shared TypeScript settings.
- Create `Cargo.toml`: Rust workspace.
- Create `rust-toolchain.toml`: stable Rust channel.
- Create `crates/editor-core/`: Rust document model, commands, tests.
- Create `crates/editor-wasm/`: wasm-bindgen wrapper around editor-core.
- Create `apps/server/`: Fastify HTTP API, filesystem storage, MCP stdio entrypoint.
- Create `apps/web/`: Vite React editor shell.
- Create `packages/renderer/`: renderer contract and Konva adapter.
- Create `packages/shared/`: shared TypeScript document types.

## Task 1: Workspace Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`

- [ ] **Step 1: Write root workspace files**

Create `package.json`:

```json
{
  "name": "layo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @layo/server --filter @layo/web dev",
    "test": "pnpm -r test && cargo test --workspace",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "packageManager": "pnpm@10.13.1"
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create `Cargo.toml`:

```toml
[workspace]
members = [
  "crates/editor-core",
  "crates/editor-wasm"
]
resolver = "2"

[workspace.package]
edition = "2021"
license = "MIT"
repository = "https://github.com/jsleemaster/layo"
```

Create `rust-toolchain.toml`:

```toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

- [ ] **Step 2: Verify workspace metadata**

Run:

```bash
pnpm --version
cargo metadata --no-deps
```

Expected:

```text
pnpm prints a version.
cargo metadata fails until Rust crates are added in Task 2.
```

- [ ] **Step 3: Commit workspace scaffold**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json Cargo.toml rust-toolchain.toml
git commit -m "chore: scaffold workspaces"
```

## Task 2: Rust Document Model

**Files:**
- Create: `crates/editor-core/Cargo.toml`
- Create: `crates/editor-core/src/lib.rs`
- Create: `crates/editor-core/src/model.rs`
- Create: `crates/editor-core/src/geometry.rs`

- [ ] **Step 1: Write failing document serialization test**

Create `crates/editor-core/Cargo.toml`:

```toml
[package]
name = "editor-core"
version = "0.1.0"
edition.workspace = true
license.workspace = true
repository.workspace = true

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
ts-rs = { version = "11", features = ["uuid-impl"] }
uuid = { version = "1", features = ["serde", "v4"] }
```

Create `crates/editor-core/src/lib.rs`:

```rust
pub mod geometry;
pub mod model;

pub use geometry::{Bounds, Point, Size, Transform};
pub use model::{DesignFile, Node, NodeContent, NodeKind, Page, Style};
```

Create `crates/editor-core/src/geometry.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    pub fn contains(&self, point: Point) -> bool {
        point.x >= self.x
            && point.x <= self.x + self.width
            && point.y >= self.y
            && point.y <= self.y + self.height
    }
}
```

Create `crates/editor-core/src/model.rs`:

```rust
use crate::geometry::{Bounds, Size, Transform};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct DesignFile {
    pub id: String,
    pub name: String,
    pub version: u32,
    pub pages: Vec<Page>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub children: Vec<Node>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub children: Vec<Node>,
    pub transform: Transform,
    pub size: Size,
    pub style: Style,
    pub content: NodeContent,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum NodeKind {
    Frame,
    Rectangle,
    Text,
    Image,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Style {
    pub fill: String,
    pub stroke: Option<String>,
    pub stroke_width: f64,
    pub opacity: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum NodeContent {
    Empty,
    Text { value: String, font_size: f64, font_family: String },
    Image { asset_id: String },
}

impl DesignFile {
    pub fn sample() -> Self {
        Self {
            id: "sample-file".to_string(),
            name: "Sample File".to_string(),
            version: 1,
            pages: vec![Page {
                id: "page-1".to_string(),
                name: "Page 1".to_string(),
                children: vec![Node {
                    id: "frame-1".to_string(),
                    kind: NodeKind::Frame,
                    name: "Landing Frame".to_string(),
                    children: vec![Node {
                        id: "text-1".to_string(),
                        kind: NodeKind::Text,
                        name: "Headline".to_string(),
                        children: vec![],
                        transform: Transform { x: 32.0, y: 40.0, rotation: 0.0 },
                        size: Size { width: 260.0, height: 48.0 },
                        style: Style {
                            fill: "#111827".to_string(),
                            stroke: None,
                            stroke_width: 0.0,
                            opacity: 1.0,
                        },
                        content: NodeContent::Text {
                            value: "Layo".to_string(),
                            font_size: 28.0,
                            font_family: "Inter".to_string(),
                        },
                    }],
                    transform: Transform { x: 120.0, y: 80.0, rotation: 0.0 },
                    size: Size { width: 420.0, height: 280.0 },
                    style: Style {
                        fill: "#ffffff".to_string(),
                        stroke: Some("#d1d5db".to_string()),
                        stroke_width: 1.0,
                        opacity: 1.0,
                    },
                    content: NodeContent::Empty,
                }],
            }],
        }
    }

    pub fn node_count(&self) -> usize {
        self.pages.iter().map(Page::node_count).sum()
    }
}

impl Page {
    pub fn node_count(&self) -> usize {
        self.children.iter().map(Node::subtree_count).sum()
    }
}

impl Node {
    pub fn bounds(&self) -> Bounds {
        Bounds {
            x: self.transform.x,
            y: self.transform.y,
            width: self.size.width,
            height: self.size.height,
        }
    }

    pub fn subtree_count(&self) -> usize {
        1 + self.children.iter().map(Node::subtree_count).sum::<usize>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_document_round_trips_through_json() {
        let file = DesignFile::sample();
        let json = serde_json::to_string_pretty(&file).unwrap();
        let parsed: DesignFile = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed, file);
        assert_eq!(parsed.node_count(), 2);
    }
}
```

- [ ] **Step 2: Run test to verify it passes**

Run:

```bash
cargo test -p editor-core sample_document_round_trips_through_json
```

Expected:

```text
test model::tests::sample_document_round_trips_through_json ... ok
```

- [ ] **Step 3: Commit document model**

```bash
git add crates/editor-core Cargo.toml
git commit -m "feat: add rust document model"
```

## Task 3: Rust Commands and Design Context

**Files:**
- Create: `crates/editor-core/src/commands.rs`
- Create: `crates/editor-core/src/context.rs`
- Modify: `crates/editor-core/src/lib.rs`

- [ ] **Step 1: Add command and context modules**

Modify `crates/editor-core/src/lib.rs`:

```rust
pub mod commands;
pub mod context;
pub mod geometry;
pub mod model;

pub use commands::{Command, CommandError};
pub use context::{DesignContext, NodeSummary};
pub use geometry::{Bounds, Point, Size, Transform};
pub use model::{DesignFile, Node, NodeContent, NodeKind, Page, Style};
```

Create `crates/editor-core/src/commands.rs`:

```rust
use crate::geometry::{Size, Transform};
use crate::model::{DesignFile, Node};
use thiserror::Error;

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    MoveNode { node_id: String, x: f64, y: f64 },
    ResizeNode { node_id: String, width: f64, height: f64 },
}

#[derive(Debug, Error, PartialEq)]
pub enum CommandError {
    #[error("node not found: {0}")]
    NodeNotFound(String),
    #[error("size must be positive")]
    InvalidSize,
}

impl DesignFile {
    pub fn apply_command(&mut self, command: Command) -> Result<Command, CommandError> {
        match command {
            Command::MoveNode { node_id, x, y } => {
                let node = self.find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                let inverse = Command::MoveNode {
                    node_id,
                    x: node.transform.x,
                    y: node.transform.y,
                };
                node.transform = Transform { x, y, rotation: node.transform.rotation };
                Ok(inverse)
            }
            Command::ResizeNode { node_id, width, height } => {
                if width <= 0.0 || height <= 0.0 {
                    return Err(CommandError::InvalidSize);
                }
                let node = self.find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                let inverse = Command::ResizeNode {
                    node_id,
                    width: node.size.width,
                    height: node.size.height,
                };
                node.size = Size { width, height };
                Ok(inverse)
            }
        }
    }

    fn find_node_mut(&mut self, node_id: &str) -> Option<&mut Node> {
        for page in &mut self.pages {
            for node in &mut page.children {
                if let Some(found) = find_in_node_mut(node, node_id) {
                    return Some(found);
                }
            }
        }
        None
    }
}

fn find_in_node_mut<'a>(node: &'a mut Node, node_id: &str) -> Option<&'a mut Node> {
    if node.id == node_id {
        return Some(node);
    }

    for child in &mut node.children {
        if let Some(found) = find_in_node_mut(child, node_id) {
            return Some(found);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::DesignFile;

    #[test]
    fn moving_node_returns_inverse_command() {
        let mut file = DesignFile::sample();
        let inverse = file.apply_command(Command::MoveNode {
            node_id: "frame-1".to_string(),
            x: 200.0,
            y: 150.0,
        }).unwrap();

        assert_eq!(file.pages[0].children[0].transform.x, 200.0);
        assert_eq!(inverse, Command::MoveNode {
            node_id: "frame-1".to_string(),
            x: 120.0,
            y: 80.0,
        });
    }

    #[test]
    fn resizing_rejects_non_positive_dimensions() {
        let mut file = DesignFile::sample();
        let error = file.apply_command(Command::ResizeNode {
            node_id: "frame-1".to_string(),
            width: 0.0,
            height: 20.0,
        }).unwrap_err();

        assert_eq!(error, CommandError::InvalidSize);
    }
}
```

Create `crates/editor-core/src/context.rs`:

```rust
use crate::geometry::Bounds;
use crate::model::{DesignFile, Node, NodeKind};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct DesignContext {
    pub file_id: String,
    pub file_name: String,
    pub node_count: usize,
    pub nodes: Vec<NodeSummary>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct NodeSummary {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub bounds: Bounds,
    pub child_count: usize,
}

impl DesignFile {
    pub fn design_context(&self) -> DesignContext {
        let mut nodes = Vec::new();
        for page in &self.pages {
            for node in &page.children {
                collect_node(node, &mut nodes);
            }
        }

        DesignContext {
            file_id: self.id.clone(),
            file_name: self.name.clone(),
            node_count: nodes.len(),
            nodes,
        }
    }
}

fn collect_node(node: &Node, nodes: &mut Vec<NodeSummary>) {
    nodes.push(NodeSummary {
        id: node.id.clone(),
        kind: node.kind.clone(),
        name: node.name.clone(),
        bounds: node.bounds(),
        child_count: node.children.len(),
    });

    for child in &node.children {
        collect_node(child, nodes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn design_context_flattens_nodes_for_agents() {
        let file = DesignFile::sample();
        let context = file.design_context();

        assert_eq!(context.file_id, "sample-file");
        assert_eq!(context.node_count, 2);
        assert_eq!(context.nodes[0].id, "frame-1");
        assert_eq!(context.nodes[1].id, "text-1");
    }
}
```

- [ ] **Step 2: Run core tests**

Run:

```bash
cargo test -p editor-core
```

Expected:

```text
test result: ok
```

- [ ] **Step 3: Commit command and context layer**

```bash
git add crates/editor-core/src
git commit -m "feat: add editor commands and design context"
```

## Task 4: Local Server and MCP Read Tools

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/sample-document.ts`
- Create: `apps/server/src/storage.ts`
- Create: `apps/server/src/http.ts`
- Create: `apps/server/src/mcp.ts`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Create server package and storage**

Create `apps/server/package.json`:

```json
{
  "name": "@layo/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "mcp": "tsx src/mcp.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "fastify": "^5.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/server/src/sample-document.ts`:

```ts
export const sampleDocument = {
  id: "sample-file",
  name: "Sample File",
  version: 1,
  pages: [
    {
      id: "page-1",
      name: "Page 1",
      children: [
        {
          id: "frame-1",
          kind: "frame",
          name: "Landing Frame",
          children: [
            {
              id: "text-1",
              kind: "text",
              name: "Headline",
              children: [],
              transform: { x: 32, y: 40, rotation: 0 },
              size: { width: 260, height: 48 },
              style: {
                fill: "#111827",
                stroke: null,
                stroke_width: 0,
                opacity: 1
              },
              content: {
                type: "text",
                value: "Layo",
                font_size: 28,
                font_family: "Inter"
              }
            }
          ],
          transform: { x: 120, y: 80, rotation: 0 },
          size: { width: 420, height: 280 },
          style: {
            fill: "#ffffff",
            stroke: "#d1d5db",
            stroke_width: 1,
            opacity: 1
          },
          content: { type: "empty" }
        }
      ]
    }
  ]
};
```

Create `apps/server/src/storage.ts`:

```ts
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sampleDocument } from "./sample-document.js";

export interface StoredFileSummary {
  id: string;
  name: string;
  path: string;
  modifiedAt: string;
}

export class FileStorage {
  constructor(private readonly rootDir = path.join(process.cwd(), ".layo")) {}

  private get filesDir() {
    return path.join(this.rootDir, "files");
  }

  async ensureSeedFile() {
    await mkdir(this.filesDir, { recursive: true });
    const filePath = path.join(this.filesDir, `${sampleDocument.id}.json`);
    try {
      await stat(filePath);
    } catch {
      await writeFile(filePath, `${JSON.stringify(sampleDocument, null, 2)}\n`, "utf8");
    }
  }

  async listFiles(): Promise<StoredFileSummary[]> {
    await this.ensureSeedFile();
    const entries = await readdir(this.filesDir);
    const files = entries.filter((entry) => entry.endsWith(".json"));

    return Promise.all(files.map(async (entry) => {
      const filePath = path.join(this.filesDir, entry);
      const raw = await readFile(filePath, "utf8");
      const document = JSON.parse(raw) as { id: string; name: string };
      const info = await stat(filePath);

      return {
        id: document.id,
        name: document.name,
        path: filePath,
        modifiedAt: info.mtime.toISOString()
      };
    }));
  }

  async readFile(fileId: string): Promise<unknown> {
    await this.ensureSeedFile();
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(this.filesDir, `${safeFileId}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  }
}
```

- [ ] **Step 2: Create HTTP and MCP entrypoints**

Create `apps/server/src/http.ts`:

```ts
import Fastify from "fastify";
import { FileStorage } from "./storage.js";

export function createHttpServer(storage = new FileStorage()) {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ ok: true }));

  server.get("/files", async () => {
    return { files: await storage.listFiles() };
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId", async (request) => {
    return { file: await storage.readFile(request.params.fileId) };
  });

  return server;
}
```

Create `apps/server/src/mcp.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FileStorage } from "./storage.js";

export function createMcpServer(storage = new FileStorage()) {
  const server = new McpServer({
    name: "layo",
    version: "0.1.0"
  });

  server.registerTool(
    "list_files",
    {
      description: "List local Layo design files available to inspect.",
      inputSchema: {}
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(await storage.listFiles(), null, 2)
      }]
    })
  );

  server.registerTool(
    "get_file_metadata",
    {
      description: "Get page and node counts for a local design file.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => {
      const file = await storage.readFile(fileId) as {
        id: string;
        name: string;
        pages: Array<{ children: unknown[] }>;
      };
      const nodeCount = JSON.stringify(file).match(/"id":/g)?.length ?? 0;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: file.id,
            name: file.name,
            pageCount: file.pages.length,
            nodeCount
          }, null, 2)
        }]
      };
    }
  );

  server.registerTool(
    "get_design_context",
    {
      description: "Return the raw document JSON for a design file so an agent can inspect pages and nodes.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => ({
      content: [{
        type: "text",
        text: JSON.stringify(await storage.readFile(fileId), null, 2)
      }]
    })
  );

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

Create `apps/server/src/index.ts`:

```ts
import { createHttpServer } from "./http.js";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
const server = createHttpServer();

await server.listen({ host, port });
```

- [ ] **Step 3: Install dependencies and typecheck server**

Run:

```bash
pnpm install
pnpm --filter @layo/server typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 4: Commit server foundation**

```bash
git add apps/server package.json pnpm-lock.yaml
git commit -m "feat: add local server and mcp tools"
```

## Task 5: Web Shell and Renderer Boundary

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `packages/renderer/package.json`
- Create: `packages/renderer/tsconfig.json`
- Create: `packages/renderer/src/index.ts`

- [ ] **Step 1: Create renderer contract package**

Create `packages/renderer/package.json`:

```json
{
  "name": "@layo/renderer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/renderer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/renderer/src/index.ts`:

```ts
export interface RendererNode {
  id: string;
  kind: "frame" | "rectangle" | "text" | "image";
  name: string;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    stroke: string | null;
    stroke_width: number;
    opacity: number;
  };
  content: { type: "empty" } | { type: "text"; value: string; font_size: number; font_family: string } | { type: "image"; asset_id: string };
  children: RendererNode[];
}

export interface RendererDocument {
  id: string;
  name: string;
  pages: Array<{ id: string; name: string; children: RendererNode[] }>;
}

export function flattenRendererNodes(document: RendererDocument): RendererNode[] {
  const nodes: RendererNode[] = [];

  const visit = (node: RendererNode) => {
    nodes.push(node);
    node.children.forEach(visit);
  };

  document.pages.forEach((page) => page.children.forEach(visit));
  return nodes;
}
```

- [ ] **Step 2: Create Vite React web app**

Create `apps/web/package.json`:

```json
{
  "name": "@layo/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json && vite build",
    "dev": "vite --host 127.0.0.1",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@layo/renderer": "workspace:*",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "konva": "^10.0.0",
    "react-konva": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Layo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `apps/web/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Layer, Rect, Stage, Text } from "react-konva";
import { flattenRendererNodes, type RendererDocument, type RendererNode } from "@layo/renderer";

function renderNode(node: RendererNode) {
  if (node.kind === "text" && node.content.type === "text") {
    return (
      <Text
        key={node.id}
        x={node.transform.x}
        y={node.transform.y}
        width={node.size.width}
        height={node.size.height}
        text={node.content.value}
        fontSize={node.content.font_size}
        fontFamily={node.content.font_family}
        fill={node.style.fill}
      />
    );
  }

  return (
    <Rect
      key={node.id}
      x={node.transform.x}
      y={node.transform.y}
      width={node.size.width}
      height={node.size.height}
      fill={node.style.fill}
      stroke={node.style.stroke ?? undefined}
      strokeWidth={node.style.stroke_width}
      opacity={node.style.opacity}
      cornerRadius={node.kind === "frame" ? 8 : 0}
    />
  );
}

export function App() {
  const [document, setDocument] = useState<RendererDocument | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:4317/files/sample-file")
      .then((response) => response.json())
      .then((payload: { file: RendererDocument }) => setDocument(payload.file))
      .catch(() => setDocument(null));
  }, []);

  const nodes = useMemo(() => document ? flattenRendererNodes(document) : [], [document]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Layo</h1>
        <p>{document ? document.name : "Start the local server to load the sample file."}</p>
        <div className="layer-list">
          {nodes.map((node) => (
            <button key={node.id} type="button">{node.name}</button>
          ))}
        </div>
      </aside>
      <section className="canvas-area">
        <Stage width={960} height={640} className="stage">
          <Layer>{nodes.map(renderNode)}</Layer>
        </Stage>
      </section>
    </main>
  );
}
```

Create `apps/web/src/styles.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #eef2f7;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button {
  font: inherit;
}

.app-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #d6dde8;
  background: #f8fafc;
  padding: 18px;
}

.sidebar h1 {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 1.2;
}

.sidebar p {
  margin: 0 0 18px;
  color: #5f6f86;
  font-size: 13px;
  line-height: 1.5;
}

.layer-list {
  display: grid;
  gap: 6px;
}

.layer-list button {
  width: 100%;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  color: #1e293b;
  border-radius: 6px;
  padding: 8px 10px;
  text-align: left;
}

.canvas-area {
  min-width: 0;
  overflow: auto;
  padding: 32px;
  background: #e6ebf2;
}

.stage {
  background: #ffffff;
  box-shadow: 0 10px 30px rgb(23 32 51 / 12%);
}
```

- [ ] **Step 3: Typecheck web and renderer**

Run:

```bash
pnpm install
pnpm --filter @layo/renderer typecheck
pnpm --filter @layo/web typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 4: Commit web foundation**

```bash
git add apps/web packages/renderer package.json pnpm-lock.yaml
git commit -m "feat: add web editor shell"
```

## Task 6: Verification and Publish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with run commands**

Append this section to `README.md`:

```markdown
## Development

Install dependencies:

```bash
pnpm install
```

Run the local server:

```bash
pnpm --filter @layo/server dev
```

Run the web editor:

```bash
pnpm --filter @layo/web dev
```

Run checks:

```bash
pnpm typecheck
cargo test --workspace
```

Run the MCP server over stdio:

```bash
pnpm --filter @layo/server mcp
```
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm typecheck
cargo test --workspace
pnpm --filter @layo/web build
```

Expected:

```text
No TypeScript errors.
All Rust tests pass.
Vite build succeeds.
```

- [ ] **Step 3: Commit docs and push**

```bash
git add README.md docs/superpowers/plans/2026-06-16-rust-design-editor-foundation.md
git commit -m "docs: add foundation implementation plan"
git push
```

If implementation commits already include the plan file, run:

```bash
git status -sb
git push
```

Expected:

```text
main is pushed to origin/main.
```

## Self-Review

- Spec coverage: This plan covers the first vertical foundation for document model, commands, local server, read-only MCP tools, renderer boundary, and web shell. It does not implement full canvas editing, image upload, selection handles, or wasm integration yet; those remain later tasks after the foundation is verified.
- Completion-marker scan: No incomplete-marker strings or undefined implementation gaps are present.
- Type consistency: Document node fields use `kind`, `transform`, `size`, `style`, `content`, and `children` consistently across Rust, server fixture, renderer contract, and web UI.
