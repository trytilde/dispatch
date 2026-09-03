import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEventHandler,
  type CSSProperties,
  type ReactNode,
} from "react";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusBadgeTone;
}) {
  return (
    <span className="dispatch-status-badge" data-tone={tone}>
      <i aria-hidden="true" className="dispatch-indicator-dot" />
      {children}
    </span>
  );
}

export function KeyboardKey({ children }: { children: ReactNode }) {
  return <kbd className="dispatch-kbd">{children}</kbd>;
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
    <label className="dispatch-input-group">
      {addon ? <span className="dispatch-input-group__addon">{addon}</span> : null}
      {multiline ? (
        <textarea
          aria-label={ariaLabel}
          className="dispatch-input-group__textarea"
          onChange={onChange}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          aria-label={ariaLabel}
          className="dispatch-input-group__input"
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
    <label className="dispatch-select-label">
      {label ? <span>{label}</span> : null}
      <span className="dispatch-select-trigger">
        <select aria-label={ariaLabel} onChange={onChange} value={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="dispatch-select-icon">
          ⌄
        </span>
      </span>
    </label>
  );
}

export function ScrollArea({
  children,
  maxHeight = 240,
}: {
  children: ReactNode;
  maxHeight?: number | string;
}) {
  return (
    <div className="dispatch-scroll-area" style={{ maxHeight }}>
      <div className="dispatch-scroll-area__viewport">
        <div className="dispatch-scroll-area__content">{children}</div>
      </div>
    </div>
  );
}

export function TextRoll({
  transitionKey,
  value,
}: {
  transitionKey?: string | number;
  value: ReactNode;
}) {
  const itemKey =
    transitionKey ?? (typeof value === "string" || typeof value === "number" ? value : "content");
  return (
    <span className="dispatch-text-roll" aria-live="polite">
      <span className="dispatch-text-roll__item" key={itemKey}>
        {value}
      </span>
    </span>
  );
}

export function VoiceWaveform({
  active = false,
  label = "Voice input",
}: {
  active?: boolean;
  label?: string;
}) {
  return (
    <span
      aria-label={label}
      className="dispatch-voice-waveform"
      data-active={active || undefined}
      role="img"
    >
      {Array.from({ length: 13 }, (_, index) => (
        <i
          aria-hidden="true"
          key={index}
          style={
            { "--wave-index": index, "--wave-scale": 1.4 + (index % 4) * 0.45 } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

export interface ModelPickerOption {
  description?: string;
  disabled?: boolean;
  id: string;
  label: string;
  suffix?: string;
}

export interface ModelPickerProps {
  label?: string;
  onChange: (id: string) => void;
  options: readonly ModelPickerOption[];
  value: string;
}

export function ModelPicker({ label = "Model", onChange, options, value }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="dispatch-model-picker" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="dispatch-model-picker__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="dispatch-model-picker__trigger-text">{selected?.label ?? label}</span>
        {selected?.suffix ? (
          <span className="dispatch-model-picker__trigger-variant-suffix">{selected.suffix}</span>
        ) : null}
        <span aria-hidden="true" className="dispatch-model-picker__trigger-chevron">
          ⌄
        </span>
      </button>
      {open ? (
        <div aria-label={label} className="dispatch-model-picker__menu" id={menuId} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.id === value}
              disabled={option.disabled}
              key={option.id}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span className="dispatch-model-picker__item-content-name">
                <strong>{option.label}</strong>
                {option.description ? <small>{option.description}</small> : null}
              </span>
              <span className="dispatch-model-picker__item-right-section">
                {option.suffix ? <small>{option.suffix}</small> : null}
                {option.id === value ? (
                  <i aria-hidden="true" className="dispatch-model-picker__item-check">
                    ✓
                  </i>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
