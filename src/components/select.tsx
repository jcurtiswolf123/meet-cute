"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckMark, Chevron, type Choice } from "./fields";

// A listbox drawn in the page instead of by the operating system.
//
// Use this only where a ChoiceGroup would not fit: long option lists, or the
// studio toolbars where a row of pills would push the table off the screen.
// For two to five options, use ChoiceGroup: one click instead of two, every
// option visible while you decide, and none of the keyboard behaviour below is
// ours to get wrong.
//
// Everything a native select gave away for free is code here, and code can
// regress: opening from the keyboard, arrows, Home and End, type-ahead, Escape
// returning focus to the trigger, closing on an outside press or on focus
// leaving. scripts/test-form-controls.ts holds them.

type SelectProps = {
  name: string;
  options: readonly Choice[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Shown when nothing is selected and as the accessible name prefix. */
  placeholder?: string;
  label: string;
  /** Render the label as a visible field label rather than only for readers. */
  showLabel?: boolean;
  /** Submit the enclosing form when the value changes (studio filter bars). */
  submitOnChange?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
};

export function Select({
  name,
  options,
  defaultValue,
  value,
  onChange,
  placeholder = "Select one",
  label,
  showLabel,
  submitOnChange,
  error,
  hint,
  className,
  buttonClassName,
  disabled,
}: SelectProps) {
  const id = useId();
  const listId = `${id}-list`;
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const selected = controlled ? value : internal;
  const selectedIndex = options.findIndex((option) => option.value === selected);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(selectedIndex, 0));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ query: "", at: 0 });

  const commit = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
      setOpen(false);
      buttonRef.current?.focus();
      if (submitOnChange) {
        // The hidden input is React-controlled, so the DOM node has to carry
        // the new value before the form reads it. Set it directly, then submit
        // on the next frame so React's own commit cannot race the requestSubmit.
        if (hiddenRef.current) hiddenRef.current.value = next;
        requestAnimationFrame(() => hiddenRef.current?.form?.requestSubmit());
      }
    },
    [controlled, onChange, submitOnChange],
  );

  // Close on an outside pointer or a focus that leaves the control. Both, not
  // just one: a click closes it, and tabbing away has to as well or the popup
  // is left hanging over content the operator has moved on to.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // Move focus into the list when it opens so the arrow keys have somewhere to
  // land, and keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList(startAt = selectedIndex >= 0 ? selectedIndex : 0) {
    if (disabled) return;
    setActive(startAt);
    setOpen(true);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[active]) commit(options[active].value);
        return;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        break;
    }
    // Type-ahead, the one native behaviour people miss most when a select is
    // replaced: typing "sa" jumps to San Francisco.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      typed.current.query = now - typed.current.at > 700 ? event.key : typed.current.query + event.key;
      typed.current.at = now;
      const query = typed.current.query.toLowerCase();
      const found = options.findIndex((option) => option.label.toLowerCase().startsWith(query));
      if (found >= 0) setActive(found);
    }
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openList();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openList(options.length - 1);
    }
  }

  const selectedOption = options[selectedIndex];

  return (
    <div className={className}>
      {showLabel && (
        <span id={labelId} className="label">
          {label}
        </span>
      )}
      <div className={`relative ${showLabel ? "mt-1.5" : ""}`} ref={rootRef}>
        <input ref={hiddenRef} type="hidden" name={name} value={selected} readOnly />
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onButtonKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={showLabel ? undefined : label}
          aria-labelledby={showLabel ? `${labelId} ${id}-value` : undefined}
          // aria-invalid is not supported on role="button". The message is
          // announced through aria-describedby and shown by the border.
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={[
            "field flex items-center justify-between gap-2 text-left",
            disabled ? "cursor-not-allowed text-muted" : "cursor-pointer hover:border-ink",
            open ? "border-ink bg-cream" : "",
            error ? "border-claret" : "",
            buttonClassName ?? "",
          ].join(" ")}
        >
          <span id={`${id}-value`} className={selectedOption ? "truncate" : "truncate text-muted"}>
            {selectedOption?.label ?? placeholder}
          </span>
          <Chevron
            className={`h-3 w-3 shrink-0 text-muted transition-transform duration-200 ease-soft ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined}
            onKeyDown={onListKeyDown}
            className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-64 w-full min-w-[11rem] overflow-auto rounded-xl2 border border-line bg-panel p-1 shadow-card outline-none"
          >
            {options.map((option, index) => {
              const isSelected = option.value === selected;
              return (
                <li
                  key={option.value}
                  id={`${id}-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => commit(option.value)}
                  className={[
                    "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-100",
                    index === active ? "bg-cream text-ink" : "text-ink",
                    isSelected ? "font-medium" : "",
                  ].join(" ")}
                >
                  <span className="flex flex-col">
                    {option.label}
                    {option.hint && <span className="text-xs text-muted">{option.hint}</span>}
                  </span>
                  {isSelected && <CheckMark className="h-3 w-3 shrink-0 text-claret" />}
                </li>
              );
            })}
          </ul>
        )}
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
    </div>
  );
}
