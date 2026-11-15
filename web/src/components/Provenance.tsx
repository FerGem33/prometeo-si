import { useData } from "./ctx";
import { doiOf, num, rangeText } from "../report/format";
import type { NumVariable } from "../engine";

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
    <aside className="prov" role="dialog" aria-label="Source of the value">
      <header>
        <span>
          <b>Source</b> · {study.short} · test {r.label}
        </span>
        <button type="button" className="link" onClick={onClose} aria-label="Close source panel">
          close
        </button>
      </header>
      <p className="prov-title">{study.title}</p>
      <dl>
        <dt>File</dt>
        <dd>{source.name}</dd>
        <dt>Row</dt>
        <dd>
          {r.source.row ?? r.source.page} <span className="hint">(header is row 1)</span>
        </dd>
        <dt>Record</dt>
        <dd>
          {r.kind === "campaign" ? "campaign row (summarises several tests as ranges)" : "individual test"}
          {r.date ? ` · ${r.date}` : ""}
        </dd>
        <dt>Dataset</dt>
        <dd>
          {doi ? (
            <a href={doi.url} target="_blank" rel="noreferrer">
              doi:{doi.label}
            </a>
          ) : (
            "no DOI in the repository record"
          )}{" "}
          · {study.id}
        </dd>
        <dt>SHA-256</dt>
        <dd className="mono">{source.sha256?.slice(0, 16)}…</dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Original column</th>
            <th>Original value</th>
            <th>Conversion</th>
            <th className="r">Value used</th>
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
                <td>{o?.column ?? <i>table constant (approved mapping)</i>}</td>
                <td>{o?.text || (constant && table ? JSON.stringify(table.constants[v.id]) : "—")}</td>
                <td>{o?.factor ? `${o.unit} × ${num(o.factor, 7)}` : o?.unit && v.type === "num" ? `${o.unit}, none` : "none"}</td>
                <td className="r">{Array.isArray(x) ? rangeText(x, v as NumVariable) : x}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {r.outcomes && (
        <p className="prov-note">
          <b>Outcome columns (verbatim).</b>{" "}
          {Object.entries(r.outcomes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      )}
      {r.flags.length > 0 && (
        <p className="prov-note">
          <b>Quality flags.</b>{" "}
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
