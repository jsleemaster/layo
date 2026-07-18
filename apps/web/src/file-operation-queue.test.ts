import { describe, expect, it } from "vitest";

import { createFileOperationQueue } from "./file-operation-queue";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("file operation queue", () => {
  it("serializes operations for the same file", async () => {
    const queue = createFileOperationQueue();
    const firstGate = deferred<void>();
    const events: string[] = [];

    const first = queue.enqueue("file-a", async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
      return "first";
    });
    const second = queue.enqueue("file-a", async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    firstGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("does not make unrelated files wait", async () => {
    const queue = createFileOperationQueue();
    const firstGate = deferred<void>();
    const events: string[] = [];

    const first = queue.enqueue("file-a", async () => {
      await firstGate.promise;
      return "first";
    });
    const second = queue.enqueue("file-b", async () => {
      events.push("second");
      return "second";
    });

    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["second"]);
    firstGate.resolve();
    await expect(first).resolves.toBe("first");
  });

  it("continues after an earlier operation fails", async () => {
    const queue = createFileOperationQueue();
    const first = queue.enqueue("file-a", async () => {
      throw new Error("write failed");
    });
    const second = queue.enqueue("file-a", async () => "recovered");

    await expect(first).rejects.toThrow("write failed");
    await expect(second).resolves.toBe("recovered");
  });
});
