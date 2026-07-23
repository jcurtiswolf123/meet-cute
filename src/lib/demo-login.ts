/** Whether one-click demo login is enabled at all. */
export function isDemoLoginEnabled(): boolean {
  return process.env.MEETCUTE_DEMO_LOGIN === "1";
}

/** Local dev: demo login without a passphrase. */
export function isLocalDemoLogin(): boolean {
  return process.env.NODE_ENV !== "production" && isDemoLoginEnabled();
}

/** Operator quick-login is a local development convenience only. */
export function allowOperatorDemoLogin(): boolean {
  return isLocalDemoLogin();
}

/** Member quick-login on /login — local dev only. */
export function allowMemberDemoLogin(): boolean {
  return isLocalDemoLogin();
}
