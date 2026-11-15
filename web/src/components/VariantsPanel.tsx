import { useMemo, useState } from "react";
import type { Scenario, VariableEvidence } from "../engine";
import { useData } from "./ctx";
import { PartsPanel } from "./PartsPanel";
import { LevelWord } from "./ChangeSummary";
import { FINDING_LEVEL, findingText } from "../report/text";
import { DIRECTION_ARROW, DIRECTION_WORD } from "../report/diff";
import { compareVariants, defaultParts, deleteVariant, loadVariants, makeVariant, reconcileParts, saveVariant, type Part, type Variant } from "../report/variants";

export function VariantsPanel({ scenario, onChange, levels }: { scenario: Scenario; onChange: (s: Scenario) => void; levels: VariableEvidence[] }) {
  const { pack, lens } = useData();
  const packId = pack.meta.id;
  const [rawParts, setParts] = useState<Part[]>(() => defaultParts(scenario));
  const parts = useMemo(() => reconcileParts(rawParts, scenario), [rawParts, scenario]);
  const [variants, setVariants] = useState<Variant[]>(() => loadVariants(packId));
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string]>(["", ""]);

  const label = (id: string) => {
    const v = pack.schema.variables.find((x) => x.id === id);
    return v?.long ?? v?.label ?? id;
  };
  const save = () => {
    if (!name.trim()) return setNotice("Give the variant a name before saving.");
    const r = saveVariant(packId, makeVariant(name, scenario, parts));
    setVariants(r.list);
    setNotice(r.ok ? `Saved "${name.trim()}" in this browser.` : "This browser refused to store the variant (private mode, blocked or full storage). It was not saved and will be lost on reload.");
    if (r.ok) setName("");
  };
  const remove = (v: Variant) => {
    const r = deleteVariant(packId, v.id);
    setVariants(r.list);
    setPair((p) => [p[0] === v.id ? "" : p[0], p[1] === v.id ? "" : p[1]]);
    setNotice(r.ok ? `Deleted "${v.name}".` : "This browser refused the change; the variant may reappear on reload.");
  };
  const load = (v: Variant) => {
    setParts(v.parts);
    onChange({ ...v.scenario, values: { ...v.scenario.values }, active: [...v.scenario.active] });
    setNotice(`Loaded "${v.name}".`);
  };

  const a = variants.find((v) => v.id === pair[0]);
  const b = variants.find((v) => v.id === pair[1]);
  const cmp = useMemo(() => (a && b ? compareVariants(pack, lens, a, b) : null), [a, b, pack, lens]);

  return (
    <section className="variants" aria-label="Variants and parts">
      <h2>Variants and parts</h2>
      <PartsPanel parts={parts} scenario={scenario} levels={levels} onChange={setParts} />

      <div className="varsave">
        <h3>Variants</h3>
        <p className="tblnote">Saved in this browser only. Nothing is sent to a server, and variants are not shared between browsers or devices.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            Variant name <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>{" "}
          <button type="submit" className="chip">
            Save variant
          </button>
        </form>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {variants.length === 0 ? (
          <p className="hint">No variants saved for this dataset yet.</p>
        ) : (
          <ul className="varlist">
            {variants.map((v) => (
              <li key={v.id}>
                <b>{v.name}</b> <small>({v.scenario.active.length} variables, {v.parts.length} {v.parts.length === 1 ? "part" : "parts"}, saved {v.savedAt.slice(0, 16).replace("T", " ")} UTC)</small>{" "}
                <button type="button" className="chip" onClick={() => load(v)}>
                  Load
                </button>{" "}
                <button type="button" className="chip" onClick={() => remove(v)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {variants.length >= 2 && (
        <div className="varcmp">
          <h3>Compare two variants</h3>
          {(["A", "B"] as const).map((tag, i) => (
            <label key={tag}>
              Variant {tag}{" "}
              <select value={pair[i]} onChange={(e) => setPair((p) => (i === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
                <option value="">Select a variant</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>{" "}
            </label>
          ))}
          {a && b && cmp && (
            <>
              <table className="scn" aria-label="Evidence level by variable in the two variants">
                <thead>
                  <tr>
                    <th scope="col">Variable</th>
                    <th scope="col">A: {a.name}</th>
                    <th scope="col">B: {b.name}</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...cmp.levelsA, ...cmp.levelsB].map((l) => l.variable))].map((id) => {
                    const la = cmp.levelsA.find((l) => l.variable === id);
                    const lb = cmp.levelsB.find((l) => l.variable === id);
                    const ch = cmp.changes.find((c) => c.variable === id);
                    return (
                      <tr key={id}>
                        <td>{label(id)}</td>
                        <td>{la ? <LevelWord level={la.level} /> : <span className="hint">not in this variant</span>}</td>
                        <td>{lb ? <LevelWord level={lb.level} /> : <span className="hint">not in this variant</span>}</td>
                        <td>{ch ? <><span aria-hidden="true">{DIRECTION_ARROW[ch.direction]}</span> {DIRECTION_WORD[ch.direction]} in B</> : "same level"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="varfind">
                {([[a, cmp.findingsA, "A"], [b, cmp.findingsB, "B"]] as const).map(([v, fs, tag]) => (
                  <div key={tag}>
                    <h4>
                      Findings, {tag}: {v.name}
                    </h4>
                    <ul>
                      {fs.map((f) => (
                        <li key={f.id}>
                          <b>{FINDING_LEVEL[f.level]}.</b> {findingText(pack, lens, f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
