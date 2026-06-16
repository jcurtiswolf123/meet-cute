"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { deletePhoto } from "@/lib/actions";

type Photo = { id: string; url: string; status: string };

export function PhotoManager({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Upload failed.");
      else router.refresh();
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label">Photos</label>
      <p className="mt-1 text-xs text-muted">
        New photos are reviewed before they appear to others. JPEG, PNG, or WebP, up to 5 MB.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            {p.status !== "approved" && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] capitalize text-white">
                {p.status}
              </span>
            )}
            <form action={deletePhoto} className="absolute right-1.5 top-1.5">
              <input type="hidden" name="photoId" value={p.id} />
              <button className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white" aria-label="Remove photo">
                Remove
              </button>
            </form>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line text-sm text-muted transition hover:border-claret/40 disabled:opacity-50"
        >
          {busy ? "Uploading..." : "+ Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-claret">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}
