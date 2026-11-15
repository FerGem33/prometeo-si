import { useData } from "./ctx";
import { doiOf, num, rangeText } from "../report/format";
import type { NumVariable } from "../engine";
import { t } from "../i18n";

export function Provenance({ id, onClose }: { id: string; onClose: () => void }) {
  const { pack, mapping } = useData();
  const r = pack.records.find((x) => x.id === id);
  if (!r) return null;
  const study = pack.studies.find((s) => s.id === r.study)!;
  const source = pack.sources.find((s) => s.id === r.source.id)!;
  const table = mapping.tables.find((t) => t.source === source.id);
  const doi = doiOf(pack, r.study);
  const rows = pack.schema.variables.filter((v) => r.values[v.id] !== undefined);
  return (
    <aside className="prov" role="dialog" aria-label={t("Source of the value")}>
      <header>
        <span>
          <b>{t("Source")}</b> · {study.short} {t("· test")} {r.label}
        </span>
        <button type="button" className="link" onClick={onClose} aria-label={t("Close source panel")}>
          {t("close")}
        </button>
      </header>
      <p className="prov-title">{study.title}</p>
      {r.quote && (
        <blockquote
          className="prov-quote"
          style={{
            margin: "8px 0 10px",
            padding: "8px 12px",
            borderLeft: "3px solid var(--ink)",
            background: "var(--bg-subtle, rgba(0, 0, 0, 0.04))",
            fontStyle: "italic",
            fontSize: "12px",
            lineHeight: "1.4",
          }}
        >
          <b>{t("Verbatim excerpt:")}</b> “{r.quote}”
        </blockquote>
      )}
      <dl>
        <dt>{t("File")}</dt>
        <dd>{source.name}</dd>
        {r.confidence === "paper" || r.source.page !== undefined ? (
          <>
            <dt>{t("Page")}</dt>
            <dd>Page {r.source.page ?? 1}</dd>
          </>
        ) : (
          <>
            <dt>{t("Row")}</dt>
            <dd>
              {r.source.row} <span className="hint">{t("(header is row 1)")}</span>
            </dd>
          </>
        )}
        <dt>{t("Record")}</dt>
        <dd>
          {r.kind === "campaign" ? t("campaign row (summarises several tests as ranges)") : t("individual test")}
          {r.date ? ` · ${r.date}` : ""}
        </dd>
        <dt>{t("Dataset")}</dt>
        <dd>
          {doi ? (
            <a href={doi.url} target="_blank" rel="noreferrer">
              {t("doi:")}{doi.label}
            </a>
          ) : (
            t("no DOI in the repository record")
          )}{" "}
          · {study.id}
        </dd>
        <dt>{t("SHA-256")}</dt>
        <dd className="mono">{source.sha256?.slice(0, 16)}…</dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>{t("Variable")}</th>
            <th>{t("Original column")}</th>
            <th>{t("Original value")}</th>
            <th>{t("Conversion")}</th>
            <th className="r">{t("Value used")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const o = r.orig?.[v.id];
            const x = r.values[v.id];
            const constant = !o || o.constant;
            return (
              <tr key={v.id}>
                <td>{v.label}</td>
                <td>{o?.column ?? <i>{t("table constant (approved mapping)")}</i>}</td>
                <td>{o?.text || (constant && table ? JSON.stringify(table.constants[v.id]) : "—")}</td>
                <td>{o?.factor ? `${o.unit} × ${num(o.factor, 7)}` : o?.unit && v.type === "num" ? t("{0}, none", o.unit) : t("none")}</td>
                <td className="r">{Array.isArray(x) ? rangeText(x, v as NumVariable) : x}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {r.outcomes && (
        <p className="prov-note">
          <b>{t("Outcome columns (verbatim).")}</b>{" "}
          {Object.entries(r.outcomes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      )}
      {r.flags.length > 0 && (
        <p className="prov-note">
          <b>{t("Quality flags.")}</b>{" "}
          {r.flags.map((f) => `${pack.schema.flags?.[f]?.label ?? f}: ${pack.schema.flags?.[f]?.note ?? ""}`).join(" ")}
          {r.flag_notes ? " " + r.flag_notes.join(" ") : ""}
        </p>
      )}
      {table?.notes?.map((n) => (
        <p className="prov-note" key={n}>
          {n}
        </p>
      ))}
    </aside>
  );
}
