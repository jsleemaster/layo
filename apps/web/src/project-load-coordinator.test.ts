import { describe, expect, test } from "vitest";
import { createProjectLoadCoordinator } from "./project-load-coordinator";

describe("project load coordinator", () => {
  test("persists the latest project last when an older write is already in flight", async () => {
    const persistedProjectIds: string[] = [];
    let releaseFirstWrite!: () => void;
    const firstWriteRelease = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let markFirstWriteStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const coordinator = createProjectLoadCoordinator(async (projectId) => {
      if (projectId === "project-a") {
        markFirstWriteStarted();
        await firstWriteRelease;
      }
      persistedProjectIds.push(projectId);
    });

    const firstRequest = coordinator.beginRequest();
    const firstPersistence = coordinator.persistIfCurrent(firstRequest, "project-a");
    await firstWriteStarted;
    const secondRequest = coordinator.beginRequest();
    const secondPersistence = coordinator.persistIfCurrent(secondRequest, "project-b");
    releaseFirstWrite();

    await expect(firstPersistence).resolves.toBe(false);
    await expect(secondPersistence).resolves.toBe(true);
    expect(persistedProjectIds).toEqual(["project-a", "project-b"]);
  });

  test("restores the last accepted project when a newer request fails before persistence", async () => {
    const persistedProjectIds: string[] = [];
    let releaseStaleWrite!: () => void;
    const staleWriteRelease = new Promise<void>((resolve) => {
      releaseStaleWrite = resolve;
    });
    let markStaleWriteStarted!: () => void;
    const staleWriteStarted = new Promise<void>((resolve) => {
      markStaleWriteStarted = resolve;
    });
    const coordinator = createProjectLoadCoordinator(async (projectId) => {
      if (projectId === "project-a") {
        markStaleWriteStarted();
        await staleWriteRelease;
      }
      persistedProjectIds.push(projectId);
    });

    const currentRequest = coordinator.beginRequest();
    await expect(coordinator.persistIfCurrent(currentRequest, "project-current")).resolves.toBe(true);
    const staleRequest = coordinator.beginRequest();
    const stalePersistence = coordinator.persistIfCurrent(staleRequest, "project-a");
    await staleWriteStarted;
    coordinator.beginRequest();
    releaseStaleWrite();

    await expect(stalePersistence).resolves.toBe(false);
    expect(persistedProjectIds).toEqual([
      "project-current",
      "project-a",
      "project-current"
    ]);
  });
});
