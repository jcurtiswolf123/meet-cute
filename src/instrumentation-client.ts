// Load browser monitoring after the page becomes interactive. Keeping the
// monitoring SDK out of the initial route bundle avoids blocking first paint.
// Early browser errors trigger an immediate load and are captured once ready.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentryModule: Promise<typeof import("@sentry/nextjs")> | null = null;

async function initializeSentry() {
  if (!dsn) return null;
  if (!sentryModule) {
    sentryModule = import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn,
        sendDefaultPii: false,
        tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
        environment: process.env.NODE_ENV,
        // A lot of the traffic here arrives through the Instagram and Facebook
        // in-app browsers, which inject their own scripts into the page. Those
        // scripts throw, we capture it, and it lands in Sentry as though it
        // were ours. On 2026-08-03 that was 46 events in a day, none of them
        // actionable, on the same board where a real crash needed to be seen.
        // Volume is not the problem; a board nobody trusts is.
        ignoreErrors: [
          // iOS WKWebView bridge, probed by in-app browsers. Our code never
          // touches window.webkit.
          /window\.webkit\.messageHandlers/i,
          /webkit\.messageHandlers/i,
          // The opaque cross-origin error. There is nothing in it to act on.
          "Script error.",
          "ResizeObserver loop completed with undelivered notifications",
          "ResizeObserver loop limit exceeded",
        ],
      });
      return Sentry;
    });
  }
  return sentryModule;
}

if (typeof window !== "undefined" && dsn) {
  const schedule = () => {
    window.setTimeout(() => {
      void initializeSentry();
    }, 15000);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });

  window.addEventListener(
    "error",
    (event) => {
      // `new Error(event.message)` with an empty message produced a stream of
      // issues titled "Error: No error message", which is what a cross-origin
      // script error looks like: no error object, no message, no stack, nothing
      // to do. Capture only what carries information.
      const hasError = event.error instanceof Error;
      const message = typeof event.message === "string" ? event.message.trim() : "";
      if (!hasError && !message) return;
      void initializeSentry().then((Sentry) => {
        Sentry?.captureException(hasError ? event.error : new Error(message));
      });
    },
    { capture: true },
  );
  window.addEventListener("unhandledrejection", (event) => {
    // Same reasoning: a rejection with no reason tells us nothing.
    if (event.reason === undefined || event.reason === null) return;
    void initializeSentry().then((Sentry) => {
      Sentry?.captureException(event.reason);
    });
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>
) {
  void initializeSentry().then((Sentry) => {
    Sentry?.captureRouterTransitionStart(...args);
  });
}
