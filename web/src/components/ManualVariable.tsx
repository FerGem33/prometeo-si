import { useState } from "react";
import type { Extra } from "../state";
import { newId } from "../report/storage";

/** Definition only. Case values belong in the report, never in variable selection. */
export function ManualVariable({ known, onKnown, onAdd }: {
  known: { id: string; label: string }[];
  onKnown: (id: string) => void;
  onAdd: (extra: Extra) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"numeric" | "categorical">("numeric");
  const [unit, setUnit] = useState("");
  return <form className="addextra" onSubmit={event => {
    event.preventDefault();
    if (!name.trim()) return;
    const existing = known.find(v => v.label.toLowerCase() === name.trim().toLowerCase());
    if (existing) onKnown(existing.id);
    else onAdd({ id: newId("extra"), name: name.trim(), type, unit: unit.trim(), value: "" });
    setName(""); setUnit("");
  }}>
    <label>Variable name<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Type<select value={type} onChange={event => setType(event.target.value as "numeric" | "categorical")}>
      <option value="numeric">Numeric</option><option value="categorical">Categorical</option>
    </select></label>
    <label>Unit (optional)<input maxLength={20} value={unit} onChange={event => setUnit(event.target.value)} /></label>
    <button className="chip" disabled={!name.trim()}>Add user-defined variable</button>
    <p className="hint">User-defined · no source evidence. Values are entered later, in your case.</p>
  </form>;
}
