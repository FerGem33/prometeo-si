import { useState } from "react";

/** Number input that keeps what the user types. The value is committed as soon as it is a valid number inside the range,
 *  and clamped to the range when the field loses focus. Clamping on every keystroke would rewrite "2" to the minimum
 *  before the user has typed "21". */
export function NumField({ value, min, max, step, label, disabled, onCommit }: {
  value: number | undefined; min: number; max: number; step?: number; label: string; disabled?: boolean; onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" ? String(value) : "");
  return (
    <input
      type="number"
      aria-label={label}
      disabled={disabled}
      min={min}
      max={max}
      step={step ?? "any"}
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text !== "" && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => {
        if (draft !== null && draft !== "") {
          const n = Number(draft);
          if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
        }
        setDraft(null);
      }}
    />
  );
}
