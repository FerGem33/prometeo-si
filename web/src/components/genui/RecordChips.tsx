/** Records behind a mark or a cell; each chip opens the source of its record. */
import { t } from "../../i18n";
import { Src, useData } from "../ctx";

const MAX_RECORDS = 12;

export function RecordChips({ ids, heading }: { ids: string[]; heading?: string }) {
  const { pack } = useData();
  if (ids.length === 0) return null;
  const shown = ids.slice(0, MAX_RECORDS);
  const chipLabel = (id: string): string => {
    const rec = pack.records.find((r) => r.id === id);
    if (!rec) return id;
    const study = pack.studies.find((s) => s.id === rec.study);
    return `${study?.short ?? rec.study} · ${rec.label}`;
  };
  return (
    <div className="gx-recs">
      {heading && <p className="gx-recs-head">{heading}</p>}
      <ul className="gx-recs-list">
        {shown.map((id) => (
          <li key={id} className="gx-chip">
            <Src id={id}>{chipLabel(id)}</Src>
          </li>
        ))}
        {ids.length > shown.length && <li className="gx-recs-more">{t("and {0} more", ids.length - shown.length)}</li>}
      </ul>
    </div>
  );
}
