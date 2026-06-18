import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { createIndexedDbProjectStore } from "./project-store";

describe("indexeddb project store", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("canvas-mcp-editor-projects-test");
  });

  test("stores and loads the current project id", async () => {
    const store = createIndexedDbProjectStore({
      databaseName: "canvas-mcp-editor-projects-test",
      indexedDB
    });

    await store.setCurrentProjectId("project-web");

    await expect(store.getCurrentProjectId()).resolves.toBe("project-web");
  });

  test("tracks recently opened projects newest first without duplicates", async () => {
    const store = createIndexedDbProjectStore({
      databaseName: "canvas-mcp-editor-projects-test",
      indexedDB
    });

    await store.setCurrentProjectId("project-alpha");
    await store.setCurrentProjectId("project-beta");
    await store.setCurrentProjectId("project-alpha");

    await expect(store.getRecentProjectIds()).resolves.toEqual(["project-alpha", "project-beta"]);
  });
});
