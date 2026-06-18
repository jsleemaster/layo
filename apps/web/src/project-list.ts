import type { ProjectManifest } from "./project-api";

const MAX_RECENT_PROJECTS = 12;

export function promoteRecentProject(
  projectId: string,
  recentProjectIds: readonly string[]
): string[] {
  if (!projectId) {
    return [...recentProjectIds];
  }

  return [projectId, ...recentProjectIds.filter((candidate) => candidate !== projectId)].slice(
    0,
    MAX_RECENT_PROJECTS
  );
}

export function getVisibleProjects(
  projects: readonly ProjectManifest[],
  recentProjectIds: readonly string[],
  query: string
): ProjectManifest[] {
  const recentRank = new Map(recentProjectIds.map((projectId, index) => [projectId, index]));
  const orderedProjects = projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => {
      const leftRank = recentRank.get(left.project.projectId) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = recentRank.get(right.project.projectId) ?? Number.MAX_SAFE_INTEGER;
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
    })
    .map(({ project }) => project);
  const normalizedQuery = normalizeProjectSearch(query);
  if (!normalizedQuery) {
    return orderedProjects;
  }

  return orderedProjects.filter((project) => projectMatchesSearch(project, normalizedQuery));
}

function projectMatchesSearch(project: ProjectManifest, normalizedQuery: string) {
  const values = [
    project.projectId,
    project.name,
    ...project.documents.map((document) => document.name),
    ...project.documents.map((document) => document.documentId)
  ];

  return values.some((value) => normalizeProjectSearch(value).includes(normalizedQuery));
}

function normalizeProjectSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
