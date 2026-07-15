import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { installProcessShutdown } from "./process-shutdown";

test("stdin EOF initiates MCP shutdown exactly once", async () => {
  const processEvents = new EventEmitter();
  const stdinEvents = new EventEmitter();
  const shutdown = vi.fn(async () => undefined);
  const closeSynchronousResources = vi.fn();
  const dispose = installProcessShutdown({
    processEvents,
    stdinEvents,
    shutdown,
    closeSynchronousResources,
    onError: vi.fn()
  });

  stdinEvents.emit("end");
  stdinEvents.emit("close");
  await Promise.resolve();
  await Promise.resolve();

  expect(shutdown).toHaveBeenCalledOnce();
  dispose();
  processEvents.emit("exit");
  expect(closeSynchronousResources).not.toHaveBeenCalled();
});

test.each(["SIGINT", "SIGTERM"] as const)(
  "%s initiates shutdown and reports an async failure",
  async (signal) => {
    const processEvents = new EventEmitter();
    const stdinEvents = new EventEmitter();
    const failure = new Error("shutdown failed");
    const onError = vi.fn();
    installProcessShutdown({
      processEvents,
      stdinEvents,
      shutdown: vi.fn(async () => {
        throw failure;
      }),
      closeSynchronousResources: vi.fn(),
      onError
    });

    processEvents.emit(signal);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(failure);
  }
);
