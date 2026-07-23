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
      void initializeSentry().then((Sentry) => {
        Sentry?.captureException(event.error ?? new Error(event.message));
      });
    },
    { capture: true },
  );
  window.addEventListener("unhandledrejection", (event) => {
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
