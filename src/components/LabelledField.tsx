import type { ReactNode } from "react";

// A form control with a real, visible label.
//
// The public request forms used a placeholder as the only label, so the field
// lost its name the moment someone typed into it and screen readers computed no
// accessible name at all. DESIGN.md forbids placeholder-as-label, and these are
// the forms that carry every inbound lead.
//
// `id` must be unique on the page. The dinner form repeats once per dinner, so
// callers there suffix it with the dinner id.
export function LabelledField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
