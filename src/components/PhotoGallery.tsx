"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { photoAt, type PhotoWidth } from "@/lib/photo-url";

export type GalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  // Rendered under the thumbnail, outside the expand button, so a server action
  // (the studio's Hide form) can live beside a photo without nesting a form
  // inside a button.
  footer?: React.ReactNode;
};

type Variant = "lead" | "grid" | "row";

/**
 * Photos that open full size when clicked.
 *
 * Every surface that showed photos rendered them at 96 to 128 pixels and stopped
 * there: the invitation asks somebody to decide whether to meet a stranger, and
 * the studio asks an operator to judge whether a photo is really the applicant.
 * Both were being decided from a thumbnail. Clicking any photo now opens it at
 * full size, with arrow keys, swipe, and Escape.
 */
export function PhotoGallery({
  photos,
  variant = "grid",
  label = "photo",
}: {
  photos: GalleryPhoto[];
  variant?: Variant;
  // Announced to screen readers around the expanded view, e.g. "Jordan's photo".
  label?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const lastTrigger = useRef<number>(0);

  const close = useCallback(() => {
    setOpenIndex(null);
    // Send focus back to the thumbnail that opened the view, or the keyboard
    // user lands at the top of the document with no idea where they were.
    triggers.current[lastTrigger.current]?.focus();
  }, []);

  const open = useCallback((i: number) => {
    lastTrigger.current = i;
    setOpenIndex(i);
  }, []);

  if (photos.length === 0) return null;

  // What each thumbnail is actually drawn at, so a 96px square stops pulling
  // the 1600px upload. The expanded view below still gets the stored file.
  const thumb = (
    photo: GalleryPhoto,
    i: number,
    className: string,
    width: PhotoWidth = 192,
  ) => (
    <button
      key={photo.id}
      type="button"
      ref={(el) => {
        triggers.current[i] = el;
      }}
      onClick={() => open(i)}
      aria-label={`Expand ${label} ${i + 1} of ${photos.length}`}
      className={`group relative block cursor-zoom-in overflow-hidden ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- member uploads are
          served through an authorized proxy route, not a static asset */}
      <img
        src={photoAt(photo.src, width)}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-end justify-end bg-ink/0 p-1.5 opacity-0 transition duration-200 ease-soft group-hover:bg-ink/10 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <span className="rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium text-cream">
          Expand
        </span>
      </span>
    </button>
  );

  return (
    <>
      {variant === "lead" && (
        <div>
          {thumb(
            photos[0],
            0,
            "aspect-[4/5] w-full max-w-sm rounded-xl border border-line",
            768,
          )}
          {photos.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {photos.slice(1).map((photo, i) => (
                <span key={photo.id} className="flex-none">
                  {thumb(photo, i + 1, "h-32 w-[6.4rem] rounded-lg border border-line")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {variant === "grid" && (
        <div className="flex flex-wrap gap-3">
          {photos.map((photo, i) => (
            <figure key={photo.id} className="w-24">
              {thumb(photo, i, "h-24 w-24 rounded-lg border border-line")}
              {photo.footer}
            </figure>
          ))}
        </div>
      )}

      {variant === "row" && (
        <div className="flex flex-wrap gap-3">
          {photos.map((photo, i) => (
            <span key={photo.id}>
              {thumb(photo, i, "h-28 w-28 rounded-xl border border-line")}
            </span>
          ))}
        </div>
      )}

      {openIndex !== null && (
        <Expanded
          photos={photos}
          index={openIndex}
          label={label}
          onIndex={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}

function Expanded({
  photos,
  index,
  label,
  onIndex,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number;
  label: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const step = useCallback(
    (delta: number) => {
      onIndex((index + delta + photos.length) % photos.length);
    },
    [index, onIndex, photos.length],
  );

  useEffect(() => {
    closeButton.current?.focus();
    // The page behind must not scroll while the overlay is up, on desktop or
    // on a phone.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const photo = photos[index];

  // Rendered on <body>, not in place. The studio page builds several stacking
  // contexts of its own, and an overlay left inside the profile column painted
  // under the sidebar column: a full-screen z-50 element that half the page
  // still covered. The ground is solid rather than a translucent scrim, because
  // a photo is being judged here and page text bleeding through changed how
  // skin tones read.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} ${index + 1} of ${photos.length}`}
      className="animate-lightbox-in fixed inset-0 z-50 flex flex-col bg-ink"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start == null || end == null) return;
        if (Math.abs(end - start) < 48) return;
        step(end < start ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="text-xs tabular-nums text-cream/70">
          {photos.length > 1 ? `${index + 1} of ${photos.length}` : ""}
        </span>
        <button
          ref={closeButton}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full border border-cream/30 px-3 py-1 text-xs font-medium text-cream transition duration-200 ease-soft hover:border-cream motion-reduce:transition-none"
        >
          Close
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-6">
        {photos.length > 1 && (
          <NavButton label="Previous photo" onClick={() => step(-1)} glyph={"←"} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={photo.alt}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full min-h-0 max-w-full rounded-lg object-contain"
        />
        {photos.length > 1 && (
          <NavButton label="Next photo" onClick={() => step(1)} glyph={"→"} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function NavButton({
  label,
  onClick,
  glyph,
}: {
  label: string;
  onClick: () => void;
  glyph: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-cream/30 text-cream transition duration-200 ease-soft hover:border-cream motion-reduce:transition-none"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
