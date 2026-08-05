import Link from "next/link";
import { STEPS, stepBefore, stepIndex, type StepId } from "@/lib/application-steps";

/** The six questions plus the two friends, which is the step that actually gets
 *  somebody in. Counting it is the honest thing to do: showing "6 of 6" and then
 *  producing another page is precisely the hidden cost the stepper exists to
 *  remove. */
export const TOTAL_STEPS = STEPS.length + 1;

// One step, in the app's own clothes: same cream canvas, same display face for
// the question, same muted line under it, same pill button. The prototype in
// the lab had its own spacing and its own progress bar; this is the shipped
// version, so it uses what every other page uses.
//
// The friends page used to draw its own chrome: a two-circle "1 you, 2 friends"
// rail, no progress bar, a centred back link. It was the same application
// wearing different clothes at the one moment somebody is deciding whether to
// finish, so it renders through here too.
export function StepShell({
  step,
  index: indexOverride,
  back: backOverride,
  title,
  sub,
  editing,
  children,
}: {
  step?: StepId;
  /** Zero-based, for a step that is not one of the six. */
  index?: number;
  /** Where "Back" goes when it is not derived from the six. */
  back?: string;
  title: string;
  sub: string;
  /** Already applied, and back to change one answer. They need a way out that
   *  is not the next question: the walk they are on has already been walked. */
  editing?: boolean;
  children: React.ReactNode;
}) {
  const index = indexOverride ?? (step ? stepIndex(step) : 0);
  const previous = step ? stepBefore(step) : null;
  const back = backOverride ?? (previous ? `/apply?step=${previous}` : null);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col">
      {/* Progress reads as ground covered, not as work remaining. */}
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ease-soft ${
              i <= index ? "bg-ink" : "bg-line"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Step {index + 1} of {TOTAL_STEPS}
      </p>

      <div className="mt-10 flex-1">
        <h1 className="font-display text-4xl font-medium leading-tight tracking-tight">{title}</h1>
        <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted">{sub}</p>
        <div className="mt-8">{children}</div>
      </div>

      <div className="mt-10 flex items-center gap-4 border-t border-line pt-5">
        {back ? (
          <Link href={back} className="text-sm text-muted underline underline-offset-4">
            Back
          </Link>
        ) : (
          <span />
        )}
        {editing && (
          <Link
            href="/apply/thanks"
            className="text-sm text-muted underline underline-offset-4"
          >
            Done editing
          </Link>
        )}
        <p className="ml-auto text-xs text-muted">Saved as you go.</p>
      </div>
    </div>
  );
}

export function StepError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 text-sm text-claret">
      {message}
    </p>
  );
}
