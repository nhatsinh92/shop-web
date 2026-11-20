/**
 * Browser-only entry for local mock mode. msw/browser has no server build, so the server graph
 * resolves this module to start-mock-worker.server.ts instead (turbopack.resolveAlias in
 * next.config.ts).
 */
export async function startMockWorker() {
  const { worker } = await import("@mocks/browser");
  await worker.start({ onUnhandledFrame: "bypass" });
}
