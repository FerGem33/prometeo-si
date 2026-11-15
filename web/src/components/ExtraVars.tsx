import { useId, useMemo, useState } from "react";
import type { Extra } from "../state";
import { newId } from "../report/storage";
import { unitOptions } from "../report/units";
import { useData } from "./ctx";
import { t, tx } from "../i18n";

export const EXTRA_BASIS = tx("No source table in this corpus records this variable, so it is listed with the scenario but not compared.");

/** Same visual weight as an evidence level, but it is not one: the engine has nothing to compare. */
export function ExtraTag() {
  return (
    <span className="level level-extra" title={t(EXTRA_BASIS)}>
      <span aria-hidden="true">–</span> {t("User-defined")}
    </span>
  );
}

/** Adds a user-defined variable. A name that matches a corpus variable switches that one on instead. */
export function AddExtra({ known, onKnown, onAdd, define = false }: { known: { id: string; label: string }[]; onKnown: (id: string) => void; onAdd: (e: Extra) => void; /** name, type and unit only; the value is given later, in the case module */ define?: boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"numeric" | "categorical">("numeric");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const { pack } = useData();
  const listId = useId();
  const units = useMemo(
    () => unitOptions(pack.schema.variables.flatMap((v) => (v.type === "num" ? [{ unit: v.unit, label: v.label }, ...(v.display_units ?? []).map((d) => ({ unit: d.unit, label: v.label }))] : []))),
    [pack],
  );

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const hit = known.find((k) => k.label.toLowerCase() === n.toLowerCase());
    if (hit) {
      onKnown(hit.id);
      setNote(t("“{0}” is already a variable of this corpus. It was switched on and is compared.", hit.label));
    } else {
      onAdd({ id: newId("extra"), name: n, value: define ? "" : value.trim(), unit: define && type === "categorical" ? "" : unit.trim(), ...(define ? { type } : {}) });
      setNote(null);
    }
    setName("");
    setValue("");
    setUnit("");
  };

  return (
    <form
      className="addextra noprint"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="addextra-lbl">{t("Add your own variable")}</span>
      <input aria-label={t("Variable name")} placeholder={t("Name")} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      {define ? (
        <select aria-label={t("Variable type")} value={type} onChange={(e) => setType(e.target.value as "numeric" | "categorical")}>
          <option value="numeric">{t("Numeric")}</option>
          <option value="categorical">{t("Categorical")}</option>
        </select>
      ) : (
        <input aria-label={t("Value")} placeholder={t("Value")} maxLength={40} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <input aria-label={t("Unit, optional: type to search the list or enter your own")} placeholder={t("Unit: search or type")} maxLength={20} list={listId} autoComplete="off" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <datalist id={listId}>
        {units.map((u) => (
          <option key={u.unit} value={u.unit} label={u.note} />
        ))}
      </datalist>
      <button type="submit" className="chip add" disabled={!name.trim()}>
        {t("+ Add variable")}
      </button>
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
    </form>
  );
}
