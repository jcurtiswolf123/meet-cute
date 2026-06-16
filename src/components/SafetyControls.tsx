"use client";

import { useState } from "react";
import { reportPerson, blockPerson } from "@/lib/actions";

// Compact report/block menu shown next to a member you are matched with.
export function SafetyControls({ subjectId, name }: { subjectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report">("menu");

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="relative"
    >
      <summary className="cursor-pointer list-none rounded-full px-2 py-1 text-muted hover:bg-paper" aria-label="Safety options">
        &#8943;
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-line bg-white p-3 text-sm shadow-card">
        {mode === "menu" ? (
          <div className="space-y-2">
            <button onClick={() => setMode("report")} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-paper">
              Report {name}
            </button>
            <form action={blockPerson}>
              <input type="hidden" name="subjectId" value={subjectId} />
              <button className="block w-full rounded-lg px-2 py-1.5 text-left text-claret hover:bg-paper">
                Block {name}
              </button>
            </form>
          </div>
        ) : (
          <form action={reportPerson} className="space-y-2">
            <input type="hidden" name="subjectId" value={subjectId} />
            <select name="reason" className="field" defaultValue="harassment">
              <option value="harassment">Harassment</option>
              <option value="fake">Fake profile</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="safety">Safety concern</option>
              <option value="other">Other</option>
            </select>
            <textarea name="detail" placeholder="What happened? (optional)" className="field min-h-20" />
            <div className="flex gap-2">
              <button className="rounded-full bg-claret px-3 py-1 text-xs font-medium text-white">Submit report</button>
              <button type="button" onClick={() => setMode("menu")} className="rounded-full border border-line px-3 py-1 text-xs">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}
