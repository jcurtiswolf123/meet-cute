"use client";

import { useId } from "react";

// Form controls that belong to Mutuals rather than to the operating system.
//
// A native <select> draws its popup in the OS, not in the page: the list is
// system chrome, the highlight is the system accent (a blue bar on macOS), and
// none of it can be styled. Every other surface here is warm cream, ink, and
// one oxblood accent, and then the first control an applicant touches opens a
// blue system menu. Same story for the default checkbox.
//
// Two replacements, chosen by how many options there are:
//
//   ChoiceGroup  2 to 5 options. Real radio inputs behind pills. No popup, no
//                second click, every option readable at a glance, and all the
//                keyboard and screen-reader behaviour comes from the browser
//                rather than from us.
//   Select       (./select.tsx) longer lists, where pills would wrap into a
//                wall. A listbox we draw and therefore have to operate.
//
// Prefer ChoiceGroup. At this size it is the better control, not just the
// better-looking one: a three-option popup costs a click to open, hides the
// alternatives while you decide, and gives you back a system menu.
//
// A note on the obvious next claim, because it would be wrong: a radio group is
// ordinary form markup that would post fine with JavaScript off, but that does
// NOT mean this form works with JavaScript off. Every page here renders behind
// the Suspense fallback in src/app/loading.tsx, and Next reveals streamed
// content with an inline script, so with scripting disabled the applicant never
// gets past the spinner. The markup is honest; the page is not a no-JS page.

export type Choice = {
  value: string;
  label: string;
  /** Optional second line, for choices that need a word of explanation. */
  hint?: string;
};

type ChoiceGroupProps = {
  name: string;
  label: string;
  options: readonly Choice[];
  /** Controlled. Pair with onChange. */
  value?: string;
  /** Uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Stack the options instead of flowing them inline. Use when the labels are
   *  sentences rather than words. */
  stacked?: boolean;
  className?: string;
};

/**
 * A set of radio buttons that look like pills.
 *
 * The radios are real and visually hidden rather than replaced, so the browser
 * keeps giving us the things that are painful to rebuild: arrow keys move
 * within the group, Tab moves past it, the label click target is the whole
 * pill, screen readers announce "radio, 2 of 3", and a form with JavaScript
 * disabled still posts the value.
 */
export function ChoiceGroup({
  name,
  label,
  options,
  value,
  defaultValue,
  onChange,
  error,
  hint,
  required,
  stacked,
  className,
}: ChoiceGroupProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const controlled = value !== undefined;

  return (
    <fieldset className={className}>
      <legend className="label">
        {label}
        {!required && <span className="ml-1 normal-case tracking-normal text-muted">(optional)</span>}
      </legend>
      <div
        className={`mt-2 flex gap-2 ${stacked ? "flex-col" : "flex-wrap"}`}
        role="group"
        aria-describedby={describedBy}
      >
        {options.map((option) => (
          <label key={option.value} className={stacked ? "block" : "inline-block"}>
            <input
              type="radio"
              name={name}
              value={option.value}
              className="peer sr-only"
              // No aria-invalid: it is not supported on role="radio", and the
              // message is already announced through aria-describedby on both
              // the group and the input.
              aria-describedby={describedBy}
              {...(controlled
                ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                : {
                    defaultChecked: defaultValue === option.value,
                    onChange: (event) => onChange?.(event.target.value),
                  })}
            />
            <span
              className={[
                "flex min-h-11 cursor-pointer select-none flex-col justify-center rounded-full border px-4 py-2 text-sm transition duration-200 ease-soft",
                stacked ? "items-start rounded-xl2" : "items-center",
                "border-line bg-panel text-ink hover:border-ink hover:bg-cream",
                // The hover rule above has to be re-asserted for the selected
                // pill, or moving the pointer over your own answer washes it
                // back out to cream and it reads as unselected.
                "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-cream",
                "peer-checked:hover:border-ink peer-checked:hover:bg-ink",
                "peer-checked:[&_.choice-hint]:text-cream/70",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-claret",
                error ? "border-claret/40" : "",
              ].join(" ")}
            >
              {option.label}
              {option.hint && <span className="choice-hint mt-0.5 text-xs text-muted">{option.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-claret">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * A checkbox with a mark we draw ourselves.
 *
 * Same trick as ChoiceGroup: the input is real and visually hidden, so consent
 * still posts without JavaScript and the label, focus, and announcement all
 * come from the browser. `children` is the consent sentence, which is the part
 * that matters legally and so is never truncated or turned into a tooltip.
 */
export function Checkbox({
  name,
  children,
  checked,
  defaultChecked,
  onChange,
  error,
  required,
  disabled,
  className,
}: {
  name?: string;
  children: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const controlled = checked !== undefined;

  return (
    <div className={className}>
      <label className={`flex items-start gap-3 text-sm ${disabled ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          name={name}
          required={required}
          disabled={disabled}
          className="peer sr-only"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...(controlled
            ? { checked, onChange: (event) => onChange?.(event.target.checked) }
            : {
                defaultChecked,
                onChange: (event) => onChange?.(event.target.checked),
              })}
        />
        <span
          aria-hidden
          className={[
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border bg-panel transition duration-200 ease-soft",
            disabled ? "border-line" : "cursor-pointer border-line peer-hover:border-ink",
            "peer-checked:border-ink peer-checked:bg-ink",
            "peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-claret",
            error ? "border-claret" : "",
          ].join(" ")}
        >
          <CheckMark className="h-3 w-3 scale-75 text-cream opacity-0 transition duration-150 ease-soft" />
        </span>
        <span className="text-muted">{children}</span>
      </label>
      {error && (
        <p id={errorId} className="mt-1.5 pl-8 text-xs text-claret">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path
        d="M2 6.4 4.6 9 10 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
