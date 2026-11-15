import { useMemo, useState } from "react";
import type { Scenario } from "../engine";
import { useData } from "./ctx";
import { LevelWord } from "./ChangeSummary";
import { FINDING_LEVEL, findingText } from "../report/text";
import { DIRECTION_ARROW, DIRECTION_WORD } from "../report/diff";
import { compareVariants, defaultParts, deleteVariant, loadVariants, makeVariant, saveVariant, type Variant } from "../report/variants";
import { cleanExtras } from "../state";
import type { Extra } from "../state";
import { t } from "../i18n";

export function VariantsPanel({ scenario, onChange, extras, onExtras }: { scenario: Scenario; onChange: (s: Scenario) => void; extras: Extra[]; onExtras: (e: Extra[]) => void }) {
  const { pack, lens } = useData();
  const packId = pack.meta.id;
  const [variants, setVariants] = useState<Variant[]>(() => loadVariants(packId));
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string]>(["", ""]);

  const label = (id: string) => {
    const v = pack.schema.variables.find((x) => x.id === id);
    return v?.long ?? v?.label ?? id;
  };
  const save = () => {
    if (!name.trim()) return setNotice(t("Give the variant a name before saving."));
    const r = saveVariant(packId, { ...makeVariant(name, scenario, defaultParts(scenario)), extras: extras.map((e) => ({ ...e })) });
    setVariants(r.list);
    setNotice(r.ok ? t("Saved \"{0}\" in this browser.", name.trim()) : t("This browser refused to store the variant (private mode, blocked or full storage). It was not saved and will be lost on reload."));
    if (r.ok) setName("");
  };
  const remove = (v: Variant) => {
    const r = deleteVariant(packId, v.id);
    setVariants(r.list);
    setPair((p) => [p[0] === v.id ? "" : p[0], p[1] === v.id ? "" : p[1]]);
    setNotice(r.ok ? t("Deleted \"{0}\".", v.name) : t("This browser refused the change; the variant may reappear on reload."));
  };
  const load = (v: Variant) => {
    onExtras(cleanExtras(v.extras));
    onChange({ ...v.scenario, values: { ...v.scenario.values }, active: [...v.scenario.active] });
    setNotice(t("Loaded \"{0}\".", v.name));
  };

  const a = variants.find((v) => v.id === pair[0]);
  const b = variants.find((v) => v.id === pair[1]);
  const cmp = useMemo(() => (a && b ? compareVariants(pack, lens, a, b) : null), [a, b, pack, lens]);

  return (
    <section className="variants" aria-label={t("Saved variants")}>
      <h2>{t("Saved variants")}</h2>

      <div className="varsave">
        <p className="tblnote">{t("Keep the scenario above under a name, then load it again or compare two of them. Saved in this browser only. Nothing is sent to a server, and variants are not shared between browsers or devices.")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            {t("Variant name")} <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>{" "}
          <button type="submit" className="chip">
            {t("Save variant")}
          </button>
        </form>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {variants.length === 0 ? (
          <p className="hint">{t("No variants saved for this dataset yet.")}</p>
        ) : (
          <ul className="varlist">
            {variants.map((v) => (
              <li key={v.id}>
                <b>{v.name}</b> <small>({v.scenario.active.length + (v.extras?.length ?? 0)} {t("variables, saved")} {v.savedAt.slice(0, 16).replace("T", " ")} {t("UTC)")}</small>{" "}
                <button type="button" className="chip" onClick={() => load(v)}>
                  {t("Load")}
                </button>{" "}
                <button type="button" className="chip" onClick={() => remove(v)}>
                  {t("Delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {variants.length >= 2 && (
        <div className="varcmp">
          <h3>{t("Compare two variants")}</h3>
          {(["A", "B"] as const).map((tag, i) => (
            <label key={tag}>
              {t("Variant")} {tag}{" "}
              <select value={pair[i]} onChange={(e) => setPair((p) => (i === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
                <option value="">{t("Select a variant")}</option>
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
              <table className="scn" aria-label={t("Evidence level by variable in the two variants")}>
                <thead>
                  <tr>
                    <th scope="col">{t("Variable")}</th>
                    <th scope="col">A: {a.name}</th>
                    <th scope="col">B: {b.name}</th>
                    <th scope="col">{t("Difference")}</th>
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
                        <td>{la ? <LevelWord level={la.level} /> : <span className="hint">{t("not in this variant")}</span>}</td>
                        <td>{lb ? <LevelWord level={lb.level} /> : <span className="hint">{t("not in this variant")}</span>}</td>
                        <td>{ch ? <><span aria-hidden="true">{DIRECTION_ARROW[ch.direction]}</span> {DIRECTION_WORD[ch.direction]} {t("in B")}</> : t("same level")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="varfind">
                {([[a, cmp.findingsA, "A"], [b, cmp.findingsB, "B"]] as const).map(([v, fs, tag]) => (
                  <div key={tag}>
                    <h4>
                      {t("Findings,")} {tag}: {v.name}
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
