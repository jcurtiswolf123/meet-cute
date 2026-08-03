"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deletePhoto } from "@/lib/actions";

type Item = { id: string; url: string; status: string };

const MAX = 6;

// Applicant photo uploader. Posts each file straight to /api/photos (which
// normalizes, strips EXIF, and stores it live: there is no review queue),
// so a photo is saved the moment it is chosen - independent of the main
// application form submit.
//
// At least one photo is required. It used to be encouraged, and the result was
// that 10 of the 25 people on the roster had no photo at all, so half the
// introductions went out with initials where a face should be. The count is
// reported upward so the form can say what is missing; the server checks it
// too, because this uploader posts on its own and never touches the form.
//
// A bare "Upload photos" button hid the two things that actually matter here:
// that you can drop files on it, and which photo leads. Both are on the surface
// now, along with a real slot-by-slot view of what is uploading and what
// failed, because an upload that silently does nothing is the failure mode
// people give up on.
export function PhotoUpload({
  initial,
  onCountChange,
}: {
  initial: Item[];
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX - items.length;
  const uploading = pendingCount > 0;

  // Reported from an effect rather than from inside the state updaters. A
  // setState updater has to be pure, and calling the parent's setter from
  // inside one is an error React throws on: it took down this whole component,
  // which is how an upload could succeed on the server and leave the button
  // stuck on "Uploading...".
  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  async function onFiles(files: FileList | File[] | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, remaining);
    if (picked.length === 0) return;
    setError(null);
    setPendingCount(picked.length);
    for (const file of picked) {
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/photos", { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          url?: string;
          status?: string;
          error?: string;
        };
        if (!res.ok || !data.id || !data.url) {
          setError(data.error || "That photo could not be uploaded.");
          continue;
        }
        setItems((prev) => [
          ...prev,
          { id: data.id!, url: data.url!, status: data.status || "approved" },
        ]);
      } catch {
        setError("Upload failed. Check your connection and try again.");
      } finally {
        setPendingCount((n) => Math.max(0, n - 1));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function onRemove(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
    const fd = new FormData();
    fd.append("photoId", id);
    startTransition(() => {
      void deletePhoto(fd);
    });
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (remaining <= 0) return;
    const dropped = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (dropped.length === 0) {
      setError("Drop a JPEG, PNG, or WebP image.");
      return;
    }
    void onFiles(dropped);
  }

  return (
    <fieldset id="photos-upload" className="space-y-4 rounded-xl border border-line bg-paper/40 p-4">
      <legend className="label px-1">Your photos</legend>
      {/* This used to promise "a match only sees them after you both say yes",
          which was never true: the introduction email and the invite page have
          always shown the primary photo before either person decides, and now
          show more than one. Someone deciding whether to meet you should see
          your face, so the promise had to move to match the product rather than
          the other way round. It still names exactly who sees what. */}
      <p className="-mt-1 text-xs text-muted">
        At least one is required, and at least one should be just you. Your matchmaker sees them, and
        so does the one person we introduce you to, so they can decide with your face in front of
        them. Nobody else on the list ever sees them. Up to {MAX}.
      </p>

      <input
        ref={inputRef}
        id="photos"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => onFiles(event.target.files)}
      />

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((photo, index) => (
          <li
            key={photo.id}
            className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-line bg-panel"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a session
                -scoped proxy path, not a static asset next/image can optimize */}
            <img src={photo.url} alt={`Your photo ${index + 1}`} className="h-full w-full object-cover" />
            {index === 0 && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cream">
                Leads
              </span>
            )}
            {/* Always visible rather than hover-only: there is no hover on a
                phone, which is where most of these are uploaded from. */}
            <button
              type="button"
              onClick={() => onRemove(photo.id)}
              disabled={isPending}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-cream transition duration-200 ease-soft hover:bg-claret focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claret sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              aria-label={`Remove photo ${index + 1}`}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}

        {/* One skeleton slot per file still in flight, in the grid, where the
            photo will land. */}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <li
            key={`pending-${i}`}
            className="skeleton aspect-[4/5] rounded-lg border border-line"
            aria-hidden
          />
        ))}

        {remaining > pendingCount && (
          <li className="aspect-[4/5]">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={[
                "flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 text-center transition duration-200 ease-soft",
                dragging
                  ? "border-claret bg-claret/[0.06] text-claret"
                  : "border-line bg-panel text-muted hover:border-ink hover:text-ink",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claret",
              ].join(" ")}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
                <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium">
                {items.length === 0 ? "Add a photo" : "Add another"}
              </span>
              <span className="hidden text-[11px] leading-tight sm:block">or drop one here</span>
            </button>
          </li>
        )}
      </ul>

      <p role="status" aria-live="polite" className="text-xs text-muted">
        {uploading
          ? `Uploading ${pendingCount} photo${pendingCount === 1 ? "" : "s"}...`
          : items.length === 0
            ? "No photos yet. JPEG, PNG, or WebP."
            : `${items.length} of ${MAX} added. The first one leads your introduction.`}
      </p>

      {error && (
        <p role="alert" className="text-xs text-claret">
          {error}
        </p>
      )}
    </fieldset>
  );
}
