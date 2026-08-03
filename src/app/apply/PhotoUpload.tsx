"use client";

import { useRef, useState, useTransition } from "react";
import { deletePhoto } from "@/lib/actions";

type Item = { id: string; url: string; status: string };

const MAX = 6;

// Applicant photo uploader. Posts each file straight to /api/photos (which
// normalizes, strips EXIF, and stores it live: there is no review queue),
// so a photo is saved the moment it is chosen - independent of the main
// application form submit. New members almost always convert better with a face
// on file, so we make this prominent but not a hard blocker.
export function PhotoUpload({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX - items.length;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const picked = Array.from(files).slice(0, remaining);
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
        setItems((prev) => [...prev, { id: data.id!, url: data.url!, status: data.status || "approved" }]);
      } catch {
        setError("Upload failed. Check your connection and try again.");
      }
    }
    setUploading(false);
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

  return (
    <fieldset className="space-y-4 rounded-xl border border-line bg-paper/40 p-4">
      <legend className="label px-1">Your photos</legend>
      {/* This used to promise "a match only sees them after you both say yes",
          which was never true: the introduction email and the invite page have
          always shown the primary photo before either person decides, and now
          show more than one. Someone deciding whether to meet you should see
          your face, so the promise had to move to match the product rather than
          the other way round. It still names exactly who sees what. */}
      <p className="-mt-1 text-xs text-muted">
        Add a few clear, recent photos - at least one of just you. Your matchmaker sees them, and so
        does the one person we introduce you to, so they can decide with your face in front of them.
        Nobody else on the list ever sees them. Up to {MAX}.
      </p>

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((p) => (
            <li key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Your upload" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-xs font-semibold text-cream opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove photo"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 ? (
        <div>
          <input
            ref={inputRef}
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || isPending}
            className="btn-ghost text-sm"
          >
            {uploading ? "Uploading..." : items.length ? "Add another photo" : "Upload photos"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">You&apos;ve added the maximum of {MAX} photos.</p>
      )}

      {error && <p className="text-xs text-claret">{error}</p>}
    </fieldset>
  );
}
