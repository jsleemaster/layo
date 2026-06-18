import { describe, expect, test } from "vitest";
import { getVisibleProjects } from "./project-list";
import type { ProjectManifest } from "./project-api";

function project(projectId: string, name: string, documentName: string): ProjectManifest {
  const timestamp = "2026-06-18T00:00:00.000Z";
  return {
    schemaVersion: 1,
    projectId,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    currentDocumentId: `${projectId}-document`,
    documents: [
      {
        documentId: `${projectId}-document`,
        name: documentName,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    sharing: { mode: "private" }
  };
}

describe("project list helpers", () => {
  test("orders recently opened projects first without changing the rest of the list", () => {
    const projects = [
      project("project-alpha", "알파 프로젝트", "랜딩"),
      project("project-beta", "베타 프로젝트", "대시보드"),
      project("project-gamma", "감마 프로젝트", "와이어프레임")
    ];

    expect(getVisibleProjects(projects, ["project-beta"], "").map((item) => item.projectId)).toEqual([
      "project-beta",
      "project-alpha",
      "project-gamma"
    ]);
  });

  test("filters projects by project name, document name, or project id", () => {
    const projects = [
      project("project-alpha", "알파 프로젝트", "랜딩"),
      project("project-beta", "베타 프로젝트", "대시보드"),
      project("project-gamma", "감마 프로젝트", "와이어프레임")
    ];

    expect(getVisibleProjects(projects, [], "베타").map((item) => item.projectId)).toEqual([
      "project-beta"
    ]);
    expect(getVisibleProjects(projects, [], "와이어").map((item) => item.projectId)).toEqual([
      "project-gamma"
    ]);
    expect(getVisibleProjects(projects, [], "alpha").map((item) => item.projectId)).toEqual([
      "project-alpha"
    ]);
  });
});
