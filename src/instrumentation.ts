// Next.js instrumentation hook. Loads the right Sentry config per runtime and
// forwards server-side request errors to Sentry (a no-op until SENTRY_DSN set).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { startDeliveryWorker } = await import("./lib/delivery");
    startDeliveryWorker();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
