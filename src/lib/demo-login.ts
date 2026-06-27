/** Whether one-click demo login is enabled at all. */
export function isDemoLoginEnabled(): boolean {
  return process.env.MEETCUTE_DEMO_LOGIN === "1";
}

/** Local dev: demo login without a passphrase. */
export function isLocalDemoLogin(): boolean {
  return process.env.NODE_ENV !== "production" && isDemoLoginEnabled();
}

/** Production: operator demo login only when a passphrase gate is configured. */
export function isProductionOperatorDemoLogin(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    isDemoLoginEnabled() &&
    !!process.env.STUDIO_DEMO_PASSWORD
  );
}

/** Operator quick-login allowed (local dev, or production with passphrase gate). */
export function allowOperatorDemoLogin(): boolean {
  return isLocalDemoLogin() || isProductionOperatorDemoLogin();
}

/** Member quick-login on /login — local dev only. */
export function allowMemberDemoLogin(): boolean {
  return isLocalDemoLogin();
}
