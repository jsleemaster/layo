export interface FileOperationQueue {
  enqueue<T>(fileId: string, operation: () => Promise<T>): Promise<T>;
}

export function createFileOperationQueue(): FileOperationQueue {
  const tails = new Map<string, Promise<void>>();

  return {
    enqueue<T>(fileId: string, operation: () => Promise<T>) {
      const previous = tails.get(fileId);
      let result: Promise<T>;
      try {
        result = previous ? previous.then(operation) : operation();
      } catch (error) {
        result = Promise.reject(error);
      }
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      tails.set(fileId, tail);
      void tail.then(() => {
        if (tails.get(fileId) === tail) {
          tails.delete(fileId);
        }
      });
      return result;
    }
  };
}
