"use client";

import { useEffect } from "react";

/**
 * Getting out of a page that was built by a deployment we no longer run.
 *
 * Mutuals ships several times a day, and a Next.js server action is addressed
 * by an id minted at build time. A page loaded before a deploy posts an id the
 * running build has never heard of, and the submit fails. Once the page has
 * hydrated, React posts over fetch, Next answers 404 with
 * `x-nextjs-action-not-found`, the router throws, and `src/app/error.tsx`
 * catches it. That is the path every skew failure in the production logs took,
 * and the one an applicant hit on 4 August.
 *
 * The cure is a fresh document. Nothing that re-runs the JavaScript the browser
 * is already holding can work, because that JavaScript is the problem, and
 * `reset()` was exactly that, which is why "Try again" used to be a closed loop.
 * There is no cleverer option available to us: skew protection that serves the
 * old build back (Next's `experimental.useSkewCookie`, the `__vdpl` cookie) is
 * infrastructure Vercel provides and Fly does not, and turning it on here would
 * only set a cookie nothing honours while switching off the asset stamping we
 * do get from `deploymentId`.
 *
 * Known gap, deliberately not covered: a submit made BEFORE the page hydrates
 * posts as an ordinary document POST, and there the throw happens inside Next's
 * action handler before any page renders, so no React boundary sees it and the
 * response is a bare "Internal Server Error". Verified against a real build,
 * including with a global-error boundary in place, which does not catch it
 * either. Reaching it needs a deploy to land in the seconds between the page's
 * HTML being rendered and the submit, rather than the hours-wide window the
 * hydrated path has, which is why the production logs show none of them.
 * Closing it would mean putting a build-stamp cookie check in front of every
 * request, which is a lot of always-on machinery for a seconds-wide race.
 */

// Marker for the single automatic attempt, so a page that is genuinely broken
// shows the error instead of reloading forever. Time-boxed rather than sticky,
// so an unrelated failure an hour later still gets its own free recovery.
const AUTO_RECOVERY_KEY = "mutuals:auto-recovered-at";
const AUTO_RECOVERY_WINDOW_MS = 30_000;

/**
 * Start the current address over as a fresh document.
 *
 * Deliberately not `location.reload()`. What brings people here is usually a
 * form submission, and reloading re-sends the POST: same dead action id, same
 * error. Replacing the location re-requests the page with a GET and pulls the
 * current build's JavaScript down with it.
 */
export function startOver() {
  const { pathname, search } = window.location;
  window.location.replace(`${pathname}${search}`);
}

/**
 * Take the single automatic retry, if it is still going.
 *
 * Returns false once the attempt is spent, and also when the marker cannot be
 * written at all (Safari private browsing throws on sessionStorage). Without a
 * durable marker there is nothing to stop a reload loop, so the honest answer
 * is to render the page and let the person press the button themselves.
 */
function claimAutoRecovery(): boolean {
  try {
    const store = window.sessionStorage;
    const last = Number(store.getItem(AUTO_RECOVERY_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < AUTO_RECOVERY_WINDOW_MS) return false;
    const stamp = String(Date.now());
    store.setItem(AUTO_RECOVERY_KEY, stamp);
    return store.getItem(AUTO_RECOVERY_KEY) === stamp;
  } catch {
    return false;
  }
}

/** One silent attempt on mount. The visible recovery is the fallback. */
export function useAutoStartOver() {
  useEffect(() => {
    if (claimAutoRecovery()) startOver();
  }, []);
}
