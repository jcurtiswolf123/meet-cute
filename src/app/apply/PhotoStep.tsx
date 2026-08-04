"use client";

import { useState } from "react";
import { saveApplicationStep } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { PhotoUpload } from "./PhotoUpload";

type Photo = { id: string; url: string; status: string };

// The photo step. The uploader posts to /api/photos on its own, so the only
// thing this form carries is "I am done with this step"; the server counts the
// photos itself and refuses to advance without one. The count is held here only
// to keep the button honest about what it will do.
export function PhotoStep({ photos }: { photos: Photo[] }) {
  const [count, setCount] = useState(photos.length);

  return (
    <>
      <PhotoUpload initial={photos} onCountChange={setCount} />
      <form action={saveApplicationStep} className="mt-6">
        <input type="hidden" name="step" value="photo" />
        <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
          Continue
        </SubmitButton>
        <p className="mt-2 text-center text-xs text-muted">
          {count === 0
            ? "Add one photo to continue. Nobody but your matchmaker and your match ever sees it."
            : `${count} added. You can add more later from your profile.`}
        </p>
      </form>
    </>
  );
}
