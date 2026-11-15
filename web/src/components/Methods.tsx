import { useData } from "./ctx";
import { LEVELS } from "../report/text";
import { num } from "../report/format";
import type { NumVariable } from "../engine";
import { t, many } from "../i18n";

export function Methods({ tableN }: { tableN: number }) {
  const { pack, lens, mapping } = useData();
  const th = pack.schema.thresholds;
  const st = pack.meta.stats;
  const cols = mapping.tables.flatMap((t) => t.columns.map((c) => ({ ...c, source: t.source })));
  const nCols = (s: string) => cols.filter((c) => c.status === s).length;
  const sourceName = (id: string) => pack.sources.find((s) => s.id === id)?.name ?? id;
  const pv = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  const unit = lens.unit_of_study ?? "study";
  const flagCounts = Object.keys(pack.schema.flags ?? {}).map((f) => ({ f, n: pack.records.filter((r) => r.flags.includes(f)).length }));

  return (
    <>
      <p>
        <b>{t("Sources.")}</b> {st.sources} {t("experiment tables from")} {st.studies} {many(unit)} ({pack.meta.source_note}
        {pack.meta.license ? t("; licence {0}", pack.meta.license) : ""}{t("). Each table row is one record:")} {st.tests?.toLocaleString("en-US")} {t("individual tests and")} {st.campaigns} {t("campaign rows that summarise several tests as ranges. Campaign rows enter the ranking but never the counts of tests.")}{" "}
        {mapping.unused_sources?.length ? t("Not used: {0} ({1}) ", mapping.unused_sources.join(", "), pack.sources.find((s) => s.used === false)?.note ?? "") : ""}
        {t("{0} metadata (titles, dates, hardware, publication counts, dataset DOIs) comes from the repository records.", unit).replace(/^./, (c) => c.toUpperCase())}
      </p>
      <p>
        <b>{t("Variable mapping and units.")}</b> {t("Every column of every table was mapped to a shared variable, kept as a flagged value, or rejected. The mapping was approved by a person (")}{mapping.approved_at}): {nCols("approved")} {t("columns approved,")} {nCols("flagged")} {t("flagged and")} {nCols("rejected")} {t("not used. Only linear unit conversions are applied (Table")} {tableN}{t("). A value that a table does not carry is left absent; nothing is imputed, averaged or assumed.")}
      </p>
      <table className="methods">
        <caption>
          <b>{t("Table")} {tableN} |</b> {t("Shared variables, scale σ used in distances, and the source columns mapped to each.")}
        </caption>
        <thead>
          <tr>
            <th>{t("Variable")}</th>
            <th>{t("Unit")}</th>
            <th className="r">σ</th>
            <th className="r">{t("Records")}</th>
            <th>{t("Source columns and conversions")}</th>
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
                  {v.type === "cat" && v.role === "partition" ? t(" (partition)") : ""}
                </td>
                <td>{v.type === "num" ? v.unit : t("categorical")}</td>
                <td className="r">{v.type === "num" ? num(v.sigma) : v.penalty !== undefined ? t("penalty {0}", v.penalty) : "—"}</td>
                <td className="r">{pack.records.filter((r) => r.values[v.id] !== undefined).length.toLocaleString("en-US")}</td>
                <td className="cols">
                  {mine.map((c, i) => (
                    <span key={i} title={sourceName(c.source)}>
                      {i > 0 && "; "}“{c.column}”{c.convert ? ` (${c.unit} × ${num(c.convert.factor, 7)})` : c.unit && v.type === "num" ? ` (${c.unit})` : ""}
                      {c.status === "flagged" ? t(" [flagged: {0}]", c.note) : ""}
                    </span>
                  ))}
                  {consts.length > 0 && t("{0}table constant in {1} table{2}", mine.length ? "; " : "", consts.length, consts.length === 1 ? "" : "s")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <details className="noprint-closed">
        <summary>{t("Column-by-column mapping of the")} {mapping.tables.length} {t("tables")}</summary>
        {mapping.tables.map((tb) => (
          <p key={tb.source} className="maprow">
            <b>{sourceName(tb.source)}.</b>{" "}
            {tb.columns.map((c, i) => (
              <span key={i} className={`mc mc-${c.status}`}>
                {i > 0 && " · "}
                {c.column}
                {c.variable ? ` → ${c.variable}` : c.role ? ` → ${c.role}` : t(" (not used)")}
              </span>
            ))}
            {tb.notes?.length ? t(" Notes: {0}", tb.notes.join(" ")) : ""}
          </p>
        ))}
      </details>
      {pv && (
        <p>
          <b>{t("Comparable records.")}</b> “{pv.label}{t("” separates what cannot be compared: two records with a different value are never compared. The scenario's partition is the one fixed directly or the single one in which its categorical values occur; every count in this report refers to the individual tests of that partition (the pool).")}
        </p>
      )}
      <p>
        <b>{t("Distance and grade.")}</b> {t("For a record and a numeric variable")} <i>k</i> {t("with scenario value")} <i>t</i>, <i>e<sub>k</sub></i> {t("is the distance from")} <i>t</i> {t("to the record's interval (0 inside). The record distance is")} <i>d</i> = √Σ(<i>e<sub>k</sub></i>/σ<sub>k</sub>{t(")² over the active numeric variables the record carries, plus a fixed penalty for each active categorical variable whose value differs. A")} {t("{0}'s", unit)} <i>d</i> {t("is the minimum over its comparable records. Grade D: no records, not comparable, or no active numeric variable in common. C: the scenario is outside the")} {unit}{t("'s tested envelope by more than")} {th.tolerance}{t("σ on some variable, or a categorical value is absent. A:")} <i>d</i> ≤ {th.grade_a}{t(", nothing outside and no missing variable. B: otherwise. Closeness (Figure 2) is 100·max(0, 1 −")} <i>e<sub>k</sub></i>/({th.closeness_reach}σ<sub>k</sub>)).
      </p>
      <p>
        <b>{t("Evidence levels.")}</b> {t("Computed per variable on the pool, with tolerance")} {th.tolerance}{t("σ, reach")} {th.closeness_reach}{t("σ and a minimum of")} {lens.evidence.min_studies} {many(unit)}.{" "}
        {Object.values(LEVELS).map((l) => (
          <span key={l.label}>
            <b>
              {l.icon} {l.label}:
            </b>{" "}
            {l.def}{" "}
          </span>
        ))}
        {t("The four levels are descriptions of coverage, not of risk, and carry equal weight.")}
      </p>
      <p>
        <b>{t("Findings.")}</b> {t("Rule-based detectors on the pool: variable never recorded; scenario above or below the tested range (beyond the tolerance); inside the range; covered only by other partitions; declared gap; categorical value tested or not; tests carrying every variable; quality flags in the closest source. A finding is raised to “attention” by direction only when the variable carries a sourced note:")}{" "}
        {pack.schema.variables
          .filter((v): v is NumVariable => v.type === "num" && !!v.risk)
          .map((v) => `${v.label}: “${v.risk!.note}” (${v.risk!.source})`)
          .join("; ") || t("none in this corpus")}
        .
      </p>
      <p>
        <b>{t("Data quality.")}</b> {st.flagged} {t("records carry a flag.")}{" "}
        {flagCounts.map(({ f, n }) => `${pack.schema.flags?.[f]?.label} (${n}): ${pack.schema.flags?.[f]?.note}`).join(" ")} {lens.outcome_columns_note}
      </p>
      <p>
        <b>{t("Categorical values.")}</b> {mapping.note}{" "}
        {Object.entries(mapping.synonyms).map(([k, groups]) => t("{0} {1} classes group {2} distinct spellings.", Object.keys(groups).length, k, Object.values(groups).reduce((a, g) => a + g.length, 0))).join(" ")}
      </p>
      <details className="noprint-closed">
        <summary>{t("Spellings grouped under each class")}</summary>
        {Object.entries(mapping.synonyms).flatMap(([k, groups]) =>
          Object.entries(groups).map(([cls, names]) => (
            <p key={k + cls} className="maprow">
              <b>{cls}.</b> {names.join(" · ")}
            </p>
          )),
        )}
      </details>
      <p>
        <b>{t("Scope and limits.")}</b> {t("This report is built from experiment tables only. Values that the tables do not carry may exist in reports and papers; they are not used here.")} {lens.disclaimer}
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
                {t("doi:")}{doi.label}
              </a>
            ) : (
              <span className="doi">{t("no DOI")}</span>
            )}
            {s.publications && s.publications.length > 0 && (
              <details className="noprint-closed">
                <summary>{s.publications.length} {t("publications listed by the repository")}</summary>
                <ul>
                  {s.publications.map((p, i) => (
                    <li key={i}>
                      {p.authors ? `${p.authors}. ` : ""}
                      {p.title}
                      {p.doi && (
                        <>
                          {" "}
                          <a className="doi" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                            {t("doi:")}{p.doi}
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
