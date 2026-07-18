export interface ProjectLoadCoordinator {
  beginRequest(): number;
  isCurrentRequest(requestId: number): boolean;
  persistIfCurrent(requestId: number, projectId: string): Promise<boolean>;
}

export function createProjectLoadCoordinator(
  persistProjectId: (projectId: string) => Promise<void>
): ProjectLoadCoordinator {
  let currentRequestId = 0;
  let lastAcceptedProjectId: string | null = null;
  let persistenceTail: Promise<void> = Promise.resolve();

  return {
    beginRequest() {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrentRequest(requestId) {
      return requestId === currentRequestId;
    },
    persistIfCurrent(requestId, projectId) {
      const operation = persistenceTail
        .catch(() => undefined)
        .then(async () => {
          if (requestId !== currentRequestId) {
            return false;
          }
          await persistProjectId(projectId);
          if (requestId === currentRequestId) {
            lastAcceptedProjectId = projectId;
            return true;
          }
          if (lastAcceptedProjectId !== null) {
            await persistProjectId(lastAcceptedProjectId);
          }
          return false;
        });
      persistenceTail = operation.then(
        () => undefined,
        () => undefined
      );
      return operation;
    }
  };
}
