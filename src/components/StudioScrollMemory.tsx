"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// The studio scrolls inside <main>, not on the document, because the shell is a
// fixed-height app frame with its own header and rail. Every scroll restoration
// anybody ships - the browser's own, and the App Router's - acts on the window,
// so an inner scroller gets none of it: an operator who read to row 40 of the
// directory, opened a profile and pressed Back landed at row 1 and scrolled
// down again. That was the whole cost of reviewing a list.
//
// So the container remembers where it was, per URL, for the session, and gives
// it back on Back and Forward only. A fresh click on a nav link still starts at
// the top, because that is what clicking a link means.

const PREFIX = "mc.studio.scroll:";
// How long to keep trying to put the page back where it was. It has to outlast
// a cold dynamic render, which in development is well over a second, and it can
// be generous because any scroll of the operator's own ends it immediately.
const RESTORE_WINDOW_MS = 2_500;
// Once the position is back, hold it this long against the router's own
// scroll-to-top, which arrives after the payload rather than with it.
const SETTLE_MS = 350;

// Module state, not a ref. The studio layout is force-dynamic, so navigating
// re-renders it and this component can be remounted underneath the navigation
// it is trying to observe: a ref set by popstate was gone by the time the
// effect for the restored URL ran, which is why the first cut of this saved
// positions faithfully and restored none of them. The module outlives every
// remount inside one page load, which is exactly the span that matters.
//
// It records the last URL the router *pushed*, rather than a flag set by
// popstate that the first effect consumes. Two things forced that shape.
// Development mounts every effect twice, so a one-shot flag was read and
// cleared by the first mount and the restore it began was cancelled by that
// same mount's cleanup. And popstate is too late to be the signal at all: the
// App Router re-renders the restored route about a millisecond *before* the
// event reaches a listener, so the effect had already decided. A push is
// recorded before the navigation it describes, and reads the same every time.
let lastPushedUrl = "";
let lastInputAt = 0;
let listening = false;
let navigationDepth = 0;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // A fresh navigation is the router pushing an entry, and the URL it pushes is
  // the one that must open at the top. Everything else reaching a stored
  // position - Back, Forward, a reload - is somewhere the operator has been.
  const push = history.pushState.bind(history);
  history.pushState = function patchedPushState(...args) {
    const [state, unused, pushed] = args;
    if (pushed != null) {
      try {
        const next = new URL(String(pushed), location.href);
        lastPushedUrl = next.pathname + next.search;
      } catch {
        lastPushedUrl = String(pushed);
      }
    }
    return push(state, unused, pushed as string | URL | null | undefined);
  };
  window.addEventListener("popstate", () => {
    // Late, but not useless: it clears the last push so a Forward back into a
    // page that was originally reached by a push still restores.
    lastPushedUrl = "";
  });
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
    window.addEventListener(
      type,
      () => {
        lastInputAt = Date.now();
      },
      { passive: true },
    );
  }
}

/** How many client-side navigations this page load has made. */
export function studioNavigationDepth(): number {
  return navigationDepth;
}

export function StudioScrollMemory({ containerId }: { containerId: string }) {
  // useSearchParams needs a boundary. The studio is force-dynamic so nothing
  // static bails out, but the boundary keeps that true if that ever changes.
  return (
    <Suspense fallback={null}>
      <ScrollMemory containerId={containerId} />
    </Suspense>
  );
}

function ScrollMemory({ containerId }: { containerId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    listen();
    navigationDepth += 1;
    const container = document.getElementById(containerId);
    if (!container) return;

    const key = PREFIX + url;
    const write = (top: number) => {
      // A zero written by the router's own scroll-to-top on the way out would
      // erase the position we are trying to keep. Zero is only stored when the
      // operator has touched something recently, which is the only way it can
      // mean "I scrolled back to the top".
      if (top === 0 && Date.now() - lastInputAt > 500) return;
      try {
        sessionStorage.setItem(key, String(Math.round(top)));
      } catch {
        /* private mode, or a full quota: not worth failing a page over */
      }
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        write(container.scrollTop);
      });
    };
    const onPageHide = () => write(container.scrollTop);
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);

    let restoring = 0;
    // Anything but the page the router just pushed to. A push is the one case
    // the router already handles correctly, by starting at the top.
    if (url !== lastPushedUrl) {
      let target = 0;
      try {
        target = Number(sessionStorage.getItem(key) ?? 0);
      } catch {
        target = 0;
      }
      if (!Number.isFinite(target) || target < 0) target = 0;

      // The row they were reading does not exist yet. The restored page's
      // payload lands a frame or several later, so for that whole stretch the
      // container is still as tall as the page being left, the target clamps to
      // nothing, and the position is lost. So this waits for the content to be
      // tall enough to hold the position, puts it back, and keeps re-asserting
      // it briefly, rather than firing once into a page that has not arrived.
      //
      // Zero is a position too: on Back and Forward the router leaves the
      // container alone, so a page the operator had read from the top used to
      // open wherever the previous page happened to be sitting.
      const startedAt = Date.now();
      const step = () => {
        restoring = 0;
        // They started scrolling themselves. Their hand wins.
        if (lastInputAt > startedAt) return;
        const reachable = container.scrollHeight - container.clientHeight >= target;
        if (reachable && Math.abs(container.scrollTop - target) > 1) container.scrollTop = target;
        const settled = reachable && Math.abs(container.scrollTop - target) <= 1;
        if (settled && Date.now() - startedAt > SETTLE_MS) return;
        if (Date.now() - startedAt < RESTORE_WINDOW_MS) restoring = window.requestAnimationFrame(step);
      };
      restoring = window.requestAnimationFrame(step);
    }

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame) window.cancelAnimationFrame(frame);
      if (restoring) window.cancelAnimationFrame(restoring);
      // Last word on the way out, before the next route paints over it.
      const top = container.scrollTop;
      if (top > 0) write(top);
    };
  }, [containerId, url]);

  return null;
}
