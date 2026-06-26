import { describe, expect, test } from "vitest";
import {
  listFileVersions,
  parseDocumentPayload,
  readFileVersion,
  restoreFileVersion,
  saveFileVersion,
  summarizeDocumentChanges
} from "./document-api";

describe("parseDocumentPayload", () => {
  test("returns the file from the server payload", () => {
    const document = parseDocumentPayload({
      file: {
        id: "sample-file",
        name: "샘플 파일",
        pages: []
      }
    });

    expect(document.id).toBe("sample-file");
    expect(document.name).toBe("샘플 파일");
  });

  test("summarizes document changes through the agent change-summary route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const beforeDocument = { id: "sample-file", name: "샘플 파일", pages: [] };
    const afterDocument = { id: "sample-file", name: "샘플 파일", pages: [] };
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/agent/change-summary" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          before: beforeDocument,
          after: afterDocument
        });
        return jsonResponse({
          summary: {
            createdNodeIds: ["new-node"],
            updatedNodeIds: ["text-1"],
            removedNodeIds: ["old-node"],
            unchangedNodeCount: 2,
            changedNodeIds: ["new-node", "text-1", "old-node"]
          }
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(
      summarizeDocumentChanges("sample-file", beforeDocument, afterDocument, fetcher as typeof fetch)
    ).resolves.toEqual({
      createdNodeIds: ["new-node"],
      updatedNodeIds: ["text-1"],
      removedNodeIds: ["old-node"],
      unchangedNodeCount: 2,
      changedNodeIds: ["new-node", "text-1", "old-node"]
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/agent/change-summary"), "POST"]
    ]);
  });
});

describe("file version API helpers", () => {
  test("lists, saves, reads, and restores file versions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;

      if (pathname === "/files/sample-file/versions" && init?.method === "POST") {
        return jsonResponse({
          version: {
            schemaVersion: 1,
            versionId: "version-1",
            fileId: "sample-file",
            name: "샘플 파일",
            message: "검토 전",
            source: "manual",
            createdAt: "2026-06-27T00:00:00.000Z",
            nodeCount: 2
          }
        });
      }
      if (pathname === "/files/sample-file/versions") {
        return jsonResponse({ versions: [{ versionId: "version-1", message: "검토 전" }] });
      }
      if (pathname === "/files/sample-file/versions/version-1" && !init?.method) {
        return jsonResponse({
          version: {
            versionId: "version-1",
            document: { id: "sample-file", name: "샘플 파일", pages: [] }
          }
        });
      }
      if (pathname === "/files/sample-file/versions/version-1/restore" && init?.method === "POST") {
        return jsonResponse({
          file: { id: "sample-file", name: "샘플 파일", pages: [] },
          restoredVersion: { versionId: "version-1" },
          recoveryVersion: { versionId: "version-2", source: "restore" }
        });
      }
      return new Response("not found", { status: 404 });
    };

    await expect(listFileVersions("sample-file", fetcher as typeof fetch)).resolves.toEqual([
      { versionId: "version-1", message: "검토 전" }
    ]);
    await expect(saveFileVersion("sample-file", "검토 전", fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      message: "검토 전"
    });
    await expect(readFileVersion("sample-file", "version-1", fetcher as typeof fetch)).resolves.toMatchObject({
      versionId: "version-1",
      document: { id: "sample-file" }
    });
    await expect(restoreFileVersion("sample-file", "version-1", fetcher as typeof fetch)).resolves.toMatchObject({
      file: { id: "sample-file" },
      recoveryVersion: { source: "restore" }
    });
    expect(calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/files/sample-file/versions"), "GET"],
      [expect.stringContaining("/files/sample-file/versions"), "POST"],
      [expect.stringContaining("/files/sample-file/versions/version-1"), "GET"],
      [expect.stringContaining("/files/sample-file/versions/version-1/restore"), "POST"]
    ]);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
