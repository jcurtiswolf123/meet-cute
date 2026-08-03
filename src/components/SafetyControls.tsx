"use client";

import { useState } from "react";
import { reportPerson, blockPerson } from "@/lib/actions";
import { Select } from "@/components/select";

// Compact report/block menu shown next to a member you are matched with.
export function SafetyControls({ subjectId, name }: { subjectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report" | "block">("menu");

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="relative shrink-0"
    >
      <summary
        className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-muted hover:bg-paper hover:text-ink"
        aria-label={`Safety options for ${name}`}
      >
        &#8943;
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-line bg-panel p-3 text-sm shadow-card">
        {mode === "menu" && (
          <div className="space-y-1">
            <button
              onClick={() => setMode("report")}
              className="block min-h-11 w-full rounded-lg px-2 text-left hover:bg-paper"
            >
              Report {name}
            </button>
            <button
              onClick={() => setMode("block")}
              className="block min-h-11 w-full rounded-lg px-2 text-left text-claret hover:bg-paper"
            >
              Block {name}
            </button>
          </div>
        )}

        {/* Blocking closes the match and hides you from each other, and nothing
            in the member app undoes it. It used to submit on the first click. */}
        {mode === "block" && (
          <form action={blockPerson} className="space-y-3">
            <input type="hidden" name="subjectId" value={subjectId} />
            <p className="text-sm">
              Block {name}? This closes your match and you will not see each other again. A
              matchmaker can help if you change your mind.
            </p>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-full bg-claret px-4 text-xs font-medium text-white">
                Block {name}
              </button>
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="min-h-11 rounded-full border border-line px-4 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === "report" && (
          <form action={reportPerson} className="space-y-2">
            <input type="hidden" name="subjectId" value={subjectId} />
            <label htmlFor="report-reason" className="label">
              Reason
            </label>
            <Select
              name="reason"
              label="Reason"
              defaultValue="harassment"
              options={[
                { value: "harassment", label: "Harassment" },
                { value: "fake", label: "Fake profile" },
                { value: "inappropriate", label: "Inappropriate content" },
                { value: "safety", label: "Safety concern" },
                { value: "other", label: "Other" },
              ]}
            />
            <label htmlFor="report-detail" className="label">
              What happened? (optional)
            </label>
            <textarea id="report-detail" name="detail" className="field min-h-20" />
            <div className="flex gap-2">
              <button className="min-h-11 rounded-full bg-claret px-4 text-xs font-medium text-white">
                Submit report
              </button>
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="min-h-11 rounded-full border border-line px-4 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}
