"use client";

import { useEffect } from "react";

// Registers /sw.js in production only.
//
// Not in development, because a service worker outlives the dev server: one
// registered on localhost:3009 keeps answering from cache after the server is
// gone, and the next session spends an hour on a stale bundle it cannot see.
// The unregister branch is the escape hatch for anybody who already has one.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    // After the page has settled: registration competes with the first render
    // for the same connection otherwise.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* An install that fails is an app that still works online. */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
