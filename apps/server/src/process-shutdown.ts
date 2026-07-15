export interface ProcessShutdownEventSource {
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ProcessShutdownOptions {
  processEvents: ProcessShutdownEventSource;
  stdinEvents?: ProcessShutdownEventSource;
  shutdown: () => Promise<void>;
  closeSynchronousResources: () => void;
  onError: (error: unknown) => void;
}

export function installProcessShutdown(
  options: ProcessShutdownOptions
): () => void {
  let disposed = false;
  let shutdownPromise: Promise<void> | undefined;
  const triggerShutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = Promise.resolve().then(options.shutdown);
      void shutdownPromise.catch(options.onError);
    }
  };
  const closeSynchronousResources = () => {
    options.closeSynchronousResources();
  };
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    options.processEvents.removeListener("SIGINT", triggerShutdown);
    options.processEvents.removeListener("SIGTERM", triggerShutdown);
    options.processEvents.removeListener("exit", closeSynchronousResources);
    options.stdinEvents?.removeListener("end", triggerShutdown);
    options.stdinEvents?.removeListener("close", triggerShutdown);
  };

  options.processEvents.once("SIGINT", triggerShutdown);
  options.processEvents.once("SIGTERM", triggerShutdown);
  options.processEvents.once("exit", closeSynchronousResources);
  options.stdinEvents?.once("end", triggerShutdown);
  options.stdinEvents?.once("close", triggerShutdown);
  return dispose;
}
