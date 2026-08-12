"use client";

import { useEffect } from "react";

/**
 * The two keys an operator working a list all day reaches for.
 *
 * `/` puts the cursor in whatever this page searches - the directory's search
 * box, the applicant board's filter - without reaching for the mouse. Escape
 * gives the page back. Nothing else is bound: a studio where a stray keystroke
 * can approve somebody is worse than one with fewer shortcuts.
 */
export function StudioHotkeys() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "Escape" && typing) {
        (target as HTMLInputElement).blur();
        return;
      }
      if (event.key !== "/" || typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const field =
        document.querySelector<HTMLInputElement>("[data-studio-search]") ??
        document.querySelector<HTMLInputElement>("[data-studio-nav-search]");
      if (!field) return;
      event.preventDefault();
      field.focus();
      field.select();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
