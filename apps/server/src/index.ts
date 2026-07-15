import { startHttpServer } from "./http-startup.js";
import { installProcessShutdown } from "./process-shutdown.js";

const started = await startHttpServer(process.env);
let disposeShutdown = () => undefined;
const shutdown = async (): Promise<void> => {
  try {
    await started.shutdown();
  } finally {
    disposeShutdown();
  }
};
disposeShutdown = installProcessShutdown({
  processEvents: process,
  shutdown,
  closeSynchronousResources: () => undefined,
  onError: (error) => {
    console.error("Layo server shutdown failed", error);
    process.exitCode = 1;
  }
});
