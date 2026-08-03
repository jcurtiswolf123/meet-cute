"use client";

import { useState } from "react";
import { ApplyForm } from "./ApplyForm";
import { PhotoUpload } from "./PhotoUpload";

type Photo = { id: string; url: string; status: string };

// The uploader posts straight to /api/photos and the form posts to a server
// action, so the two halves of the application never met. Now that a photo is
// required they have to: this holds the live count, which is all the form needs
// to tell someone what is still missing. The server checks the count too, and
// its answer is the one that decides.
export function ApplySection({
  photos,
  defaults,
}: {
  photos: Photo[];
  defaults: React.ComponentProps<typeof ApplyForm>["defaults"];
}) {
  const [photoCount, setPhotoCount] = useState(photos.length);

  return (
    <>
      <div className="mt-8">
        <PhotoUpload initial={photos} onCountChange={setPhotoCount} />
      </div>
      <ApplyForm defaults={defaults} photoCount={photoCount} />
    </>
  );
}
