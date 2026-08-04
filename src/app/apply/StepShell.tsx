import Link from "next/link";
import { STEPS, stepBefore, stepIndex, type StepId } from "@/lib/application-steps";

// One step, in the app's own clothes: same cream canvas, same display face for
// the question, same muted line under it, same pill button. The prototype in
// the lab had its own spacing and its own progress bar; this is the shipped
// version, so it uses what every other page uses.
export function StepShell({
  step,
  title,
  sub,
  children,
}: {
  step: StepId;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const index = stepIndex(step);
  const back = stepBefore(step);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col">
      {/* Progress reads as ground covered, not as work remaining. */}
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ease-soft ${
              i <= index ? "bg-ink" : "bg-line"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Step {index + 1} of {STEPS.length}
      </p>

      <div className="mt-10 flex-1">
        <h1 className="font-display text-4xl font-medium leading-tight tracking-tight">{title}</h1>
        <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted">{sub}</p>
        <div className="mt-8">{children}</div>
      </div>

      <div className="mt-10 flex items-center gap-4 border-t border-line pt-5">
        {back ? (
          <Link href={`/apply?step=${back}`} className="text-sm text-muted underline underline-offset-4">
            Back
          </Link>
        ) : (
          <span />
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
