import type { Scenario, VariableEvidence } from "../engine";
import { useData } from "./ctx";
import { LEVELS } from "../report/text";
import { reconcileParts, summarizeParts, type Part } from "../report/variants";
import { newId } from "../report/storage";

/** Named groups of the active variables, each with the engine's level of every variable in it. */
export function PartsPanel({ parts, scenario, levels, onChange }: { parts: Part[]; scenario: Scenario; levels: VariableEvidence[]; onChange: (p: Part[]) => void }) {
  const { pack } = useData();
  const label = (id: string) => {
    const v = pack.schema.variables.find((x) => x.id === id);
    return v?.long ?? v?.label ?? id;
  };
  const summary = summarizeParts(parts, levels);
  const rename = (id: string, name: string) => onChange(parts.map((p) => (p.id === id ? { ...p, name } : p)));
  const move = (variable: string, to: string) =>
    onChange(parts.map((p) => ({ ...p, variables: p.id === to ? [...p.variables.filter((v) => v !== variable), variable] : p.variables.filter((v) => v !== variable) })));
  const add = () => onChange([...parts, { id: newId("part"), name: `Part ${parts.length + 1}`, variables: [] }]);
  const remove = (id: string) => onChange(reconcileParts(parts.filter((p) => p.id !== id), scenario));

  return (
    <div className="parts">
      <h3>Parts</h3>
      <p className="hint">Group the active variables into named parts. Each part lists the evidence level of its variables; no combined verdict is made.</p>
      {summary.map(({ part, levels: ls }) => (
        <fieldset key={part.id} className="part">
          <legend>
            <input type="text" aria-label="Part name" value={part.name} maxLength={60} onChange={(e) => rename(part.id, e.target.value)} />
            {parts.length > 1 && (
              <button type="button" className="chip" onClick={() => remove(part.id)}>
                Remove part
              </button>
            )}
          </legend>
          {ls.length === 0 ? (
            <p className="hint">No variables in this part.</p>
          ) : (
            <ul>
              {ls.map((l) => (
                <li key={l.variable}>
                  <span>{label(l.variable)}: </span>
                  <span className={`level level-${l.level}`}>
                    <span aria-hidden="true">{LEVELS[l.level].icon}</span> {LEVELS[l.level].label}
                  </span>
                  {parts.length > 1 && (
                    <select aria-label={`Move ${label(l.variable)} to part`} value={part.id} onChange={(e) => move(l.variable, e.target.value)}>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || "Unnamed part"}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ))}
      <button type="button" className="chip" onClick={add}>
        Add part
      </button>
    </div>
  );
}
