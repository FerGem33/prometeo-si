import { useData } from "./ctx";
import { LEVELS } from "../report/text";
import { num } from "../report/format";
import type { NumVariable } from "../engine";

export function Methods({ tableN }: { tableN: number }) {
  const { pack, lens, mapping } = useData();
  const th = pack.schema.thresholds;
  const st = pack.meta.stats;
  const cols = mapping.tables.flatMap((t) => t.columns.map((c) => ({ ...c, source: t.source })));
  const count = (s: string) => cols.filter((c) => c.status === s).length;
  const sourceName = (id: string) => pack.sources.find((s) => s.id === id)?.name ?? id;
  const pv = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  const unit = lens.unit_of_study ?? "study";
  const flagCounts = Object.keys(pack.schema.flags ?? {}).map((f) => ({ f, n: pack.records.filter((r) => r.flags.includes(f)).length }));

  return (
    <>
      <p>
        <b>Sources.</b> {st.sources} experiment tables from {st.studies} {unit}s ({pack.meta.source_note}
        {pack.meta.license ? `; licence ${pack.meta.license}` : ""}). Each table row is one record: {st.tests?.toLocaleString("en-US")} individual tests and {st.campaigns} campaign rows that summarise several tests as ranges. Campaign rows enter the ranking but never the counts of tests.{" "}
        {mapping.unused_sources?.length ? `Not used: ${mapping.unused_sources.join(", ")} (${pack.sources.find((s) => s.used === false)?.note ?? ""}) ` : ""}
        {unit[0].toUpperCase() + unit.slice(1)} metadata (titles, dates, hardware, publication counts, dataset DOIs) comes from the repository records.
      </p>
      <p>
        <b>Variable mapping and units.</b> Every column of every table was mapped to a shared variable, kept as a flagged value, or rejected. The mapping was approved by a person ({mapping.approved_at}): {count("approved")} columns approved, {count("flagged")} flagged and {count("rejected")} not used. Only linear unit conversions are applied (Table {tableN}). A value that a table does not carry is left absent; nothing is imputed, averaged or assumed.
      </p>
      <table className="methods">
        <caption>
          <b>Table {tableN} |</b> Shared variables, scale σ used in distances, and the source columns mapped to each.
        </caption>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Unit</th>
            <th className="r">σ</th>
            <th className="r">Records</th>
            <th>Source columns and conversions</th>
          </tr>
        </thead>
        <tbody>
          {pack.schema.variables.map((v) => {
            const mine = cols.filter((c) => c.variable === v.id);
            const consts = mapping.tables.filter((t) => t.constants[v.id] !== undefined);
            return (
              <tr key={v.id}>
                <td>
                  {v.long ?? v.label}
                  {v.type === "cat" && v.role === "partition" ? " (partition)" : ""}
                </td>
                <td>{v.type === "num" ? v.unit : "categorical"}</td>
                <td className="r">{v.type === "num" ? num(v.sigma) : v.penalty !== undefined ? `penalty ${v.penalty}` : "—"}</td>
                <td className="r">{pack.records.filter((r) => r.values[v.id] !== undefined).length.toLocaleString("en-US")}</td>
                <td className="cols">
                  {mine.map((c, i) => (
                    <span key={i} title={sourceName(c.source)}>
                      {i > 0 && "; "}“{c.column}”{c.convert ? ` (${c.unit} × ${num(c.convert.factor, 7)})` : c.unit && v.type === "num" ? ` (${c.unit})` : ""}
                      {c.status === "flagged" ? ` [flagged: ${c.note}]` : ""}
                    </span>
                  ))}
                  {consts.length > 0 && `${mine.length ? "; " : ""}table constant in ${consts.length} table${consts.length === 1 ? "" : "s"}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <details className="noprint-closed">
        <summary>Column-by-column mapping of the {mapping.tables.length} tables</summary>
        {mapping.tables.map((t) => (
          <p key={t.source} className="maprow">
            <b>{sourceName(t.source)}.</b>{" "}
            {t.columns.map((c, i) => (
              <span key={i} className={`mc mc-${c.status}`}>
                {i > 0 && " · "}
                {c.column}
                {c.variable ? ` → ${c.variable}` : c.role ? ` → ${c.role}` : " (not used)"}
              </span>
            ))}
            {t.notes?.length ? ` Notes: ${t.notes.join(" ")}` : ""}
          </p>
        ))}
      </details>
      {pv && (
        <p>
          <b>Comparable records.</b> “{pv.label}” separates what cannot be compared: two records with a different value are never compared. The scenario's partition is the one fixed directly or the single one in which its categorical values occur; every count in this report refers to the individual tests of that partition (the pool).
        </p>
      )}
      <p>
        <b>Distance and grade.</b> For a record and a numeric variable <i>k</i> with scenario value <i>t</i>, <i>e<sub>k</sub></i> is the distance from <i>t</i> to the record's interval (0 inside). The record distance is <i>d</i> = √Σ(<i>e<sub>k</sub></i>/σ<sub>k</sub>)² over the active numeric variables the record carries, plus a fixed penalty for each active categorical variable whose value differs. A {unit}'s <i>d</i> is the minimum over its comparable records. Grade D: no records, not comparable, or no active numeric variable in common. C: the scenario is outside the {unit}'s tested envelope by more than {th.tolerance}σ on some variable, or a categorical value is absent. A: <i>d</i> ≤ {th.grade_a}, nothing outside and no missing variable. B: otherwise. Closeness (Figure 2) is 100·max(0, 1 − <i>e<sub>k</sub></i>/({th.closeness_reach}σ<sub>k</sub>)).
      </p>
      <p>
        <b>Evidence levels.</b> Computed per variable on the pool, with tolerance {th.tolerance}σ, reach {th.closeness_reach}σ and a minimum of {lens.evidence.min_studies} {unit}s.{" "}
        {Object.values(LEVELS).map((l) => (
          <span key={l.label}>
            <b>
              {l.icon} {l.label}:
            </b>{" "}
            {l.def}{" "}
          </span>
        ))}
        The four levels are descriptions of coverage, not of risk, and carry equal weight.
      </p>
      <p>
        <b>Findings.</b> Rule-based detectors on the pool: variable never recorded; scenario above or below the tested range (beyond the tolerance); inside the range; covered only by other partitions; declared gap; categorical value tested or not; tests carrying every variable; quality flags in the closest source. A finding is raised to “attention” by direction only when the variable carries a sourced note:{" "}
        {pack.schema.variables
          .filter((v): v is NumVariable => v.type === "num" && !!v.risk)
          .map((v) => `${v.label}: “${v.risk!.note}” (${v.risk!.source})`)
          .join("; ") || "none in this corpus"}
        .
      </p>
      <p>
        <b>Data quality.</b> {st.flagged} records carry a flag.{" "}
        {flagCounts.map(({ f, n }) => `${pack.schema.flags?.[f]?.label} (${n}): ${pack.schema.flags?.[f]?.note}`).join(" ")} {lens.outcome_columns_note}
      </p>
      <p>
        <b>Categorical values.</b> {mapping.note}{" "}
        {Object.entries(mapping.synonyms).map(([k, groups]) => `${Object.keys(groups).length} ${k} classes group ${Object.values(groups).reduce((a, g) => a + g.length, 0)} distinct spellings.`).join(" ")}
      </p>
      <details className="noprint-closed">
        <summary>Spellings grouped under each class</summary>
        {Object.entries(mapping.synonyms).flatMap(([k, groups]) =>
          Object.entries(groups).map(([cls, names]) => (
            <p key={k + cls} className="maprow">
              <b>{cls}.</b> {names.join(" · ")}
            </p>
          )),
        )}
      </details>
      <p>
        <b>Scope and limits.</b> This report is built from experiment tables only. Values that the tables do not carry may exist in reports and papers; they are not used here. {lens.disclaimer}
      </p>
    </>
  );
}

export function References() {
  const { pack } = useData();
  return (
    <ol className="refs">
      {pack.studies.map((s) => {
        const doi = s.links.find((l) => l.kind === "doi");
        return (
          <li key={s.id} id={`ref-${s.id}`}>
            {s.short}. <i>{s.title}</i>. {pack.meta.repository_url ? new URL(pack.meta.repository_url).hostname : ""}, {s.id}
            {s.attributes.license ? `, ${s.attributes.license}` : ""}.{" "}
            {doi ? (
              <a className="doi" href={doi.url} target="_blank" rel="noreferrer">
                doi:{doi.label}
              </a>
            ) : (
              <span className="doi">no DOI</span>
            )}
            {s.publications && s.publications.length > 0 && (
              <details className="noprint-closed">
                <summary>{s.publications.length} publications listed by the repository</summary>
                <ul>
                  {s.publications.map((p, i) => (
                    <li key={i}>
                      {p.authors ? `${p.authors}. ` : ""}
                      {p.title}
                      {p.doi && (
                        <>
                          {" "}
                          <a className="doi" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                            doi:{p.doi}
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
