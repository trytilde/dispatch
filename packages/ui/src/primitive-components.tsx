import type { ChangeEventHandler, ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusBadgeTone;
}) {
  return (
    <span className="ob-status-badge" data-tone={tone}>
      <i aria-hidden="true" className="ob-indicator-dot" />
      {children}
    </span>
  );
}

export function KeyboardKey({ children }: { children: ReactNode }) {
  return <kbd className="ob-kbd">{children}</kbd>;
}

export interface InputGroupProps {
  addon?: ReactNode;
  ariaLabel: string;
  multiline?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  placeholder?: string;
  value?: string;
}

export function InputGroup({
  addon,
  ariaLabel,
  multiline = false,
  onChange,
  placeholder,
  value,
}: InputGroupProps) {
  return (
    <label className="ob-input-group">
      {addon ? <span className="ob-input-group__addon">{addon}</span> : null}
      {multiline ? (
        <textarea
          aria-label={ariaLabel}
          className="ob-input-group__textarea"
          onChange={onChange}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          aria-label={ariaLabel}
          className="ob-input-group__input"
          onChange={onChange}
          placeholder={placeholder}
          value={value}
        />
      )}
    </label>
  );
}

export interface SelectOption {
  label: string;
  value: string;
}

export function SelectField({
  ariaLabel,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  label?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  options: readonly SelectOption[];
  value?: string;
}) {
  return (
    <label className="ob-select-label">
      {label ? <span>{label}</span> : null}
      <span className="ob-select-trigger">
        <select aria-label={ariaLabel} onChange={onChange} value={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="ob-select-icon">
          ⌄
        </span>
      </span>
    </label>
  );
}
