"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A link the member is meant to pass on, with one-tap copy.
 *
 * The copy sits inside a read-only input rather than plain text so that a
 * long-press on a phone, where the Clipboard API is the least reliable, still
 * offers Select All. The button is progressive enhancement on top of that, not
 * the only way through.
 */
export function ShareLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Safari without permission, or an insecure origin. Select it instead so
      // the member can still copy by hand.
      inputRef.current?.select();
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex w-full max-w-[34rem] flex-col gap-2 sm:flex-row">
      <input
        ref={inputRef}
        readOnly
        value={url}
        aria-label="Your invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="field flex-1 font-medium tabular-nums"
      />
      <button type="button" onClick={copy} className="btn-primary px-6 py-3 sm:w-auto">
        {copied ? "Copied" : label}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}
