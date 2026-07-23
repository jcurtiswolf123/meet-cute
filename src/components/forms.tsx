"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// A submit button that reflects the pending state of its enclosing <form>
// server action: spinner + disabled, so every mutation has real feedback.
export function SubmitButton({
  children,
  ariaLabel,
  pendingText,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  ariaLabel?: string;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-60`}
      aria-busy={pending}
      aria-label={ariaLabel}
    >
      {pending && <Spinner />}
      {pending ? pendingText ?? children : children}
    </button>
  );
}

export function ConfirmActionForm({
  children,
  action,
  confirmMessage,
  triggerLabel,
  triggerAriaLabel,
  confirmLabel,
  pendingText,
  buttonClassName,
  className,
}: {
  children?: React.ReactNode;
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  triggerLabel: string;
  triggerAriaLabel?: string;
  confirmLabel: string;
  pendingText: string;
  buttonClassName?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className={className}>
      {children}
      {confirming ? (
        <div className="flex max-w-xs flex-wrap items-center justify-end gap-2 text-right">
          <p className="w-full text-xs text-muted">{confirmMessage}</p>
          <button
            type="button"
            className="rounded-full border border-line px-3 py-1 text-xs"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <SubmitButton
            className={buttonClassName}
            pendingText={pendingText}
          >
            {confirmLabel}
          </SubmitButton>
        </div>
      ) : (
        <button
          type="button"
          className={buttonClassName}
          aria-label={triggerAriaLabel}
          onClick={() => setConfirming(true)}
        >
          {triggerLabel}
        </button>
      )}
    </form>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
