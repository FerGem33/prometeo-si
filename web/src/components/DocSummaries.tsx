import { Src, useData } from "./ctx";
import { doiOf, varOf } from "../report/format";
import { t } from "../i18n";

/** One template summary per document/study, built only from the pack: counts, variables recorded and source files. */
export function DocSummaries() {
  const { pack } = useData();
  return (
    <>
      <p className="tblnote">{t("Template summaries built from the records · no live AI text. Every source opens its file, row or page.")}</p>
      <ul className="doc-summaries">
        {pack.studies.map((s) => {
          const doi = doiOf(pack, s.id);
          const files = pack.sources.filter((x) => x.study === s.id);
          const first = pack.records.find((r) => r.study === s.id);
          const vars = s.summary.variables.filter((id) => pack.schema.variables.some((v) => v.id === id)).map((id) => varOf(pack, id).label);
          return (
            <li key={s.id}>
              <b>{s.short}</b>
              {s.title && s.title !== s.short ? ` · ${s.title}` : ""}.{" "}
              {s.summary.objective ? `${s.summary.objective} ` : ""}
              {t("{0} records", s.counts.records)}
              {vars.length ? `; ${t("records {0}", vars.join(", "))}` : `; ${t("no selected variable is recorded")}`}.{" "}
              {files.length > 0 && <span className="tblnote">{t("Source: {0}", files.map((f) => f.name).join(", "))} </span>}
              {first && <Src id={first.id}>{t("first record")}</Src>}{" "}
              {doi && (
                <a href={doi.url} target="_blank" rel="noreferrer">
                  {doi.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
