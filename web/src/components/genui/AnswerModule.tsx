/** Direct answer to the purpose: one statistic or one filter, with its records (owner: D1). */
import type { ReactNode } from "react";
import type { LocalAnswer, LocalOp, LocalStat } from "../../ingest/localAsk";
import type { ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { num, studyShort } from "../../report/format";
import { Src, useData } from "../ctx";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/answer.css";

export interface AnswerModuleProps {
  spec: ModuleOf<"answer_stat"> | ModuleOf<"answer_filter">;
  answer: LocalAnswer | { unsupported: string };
  figure: number;
}

const MAX_RECORDS = 12;

const STAT_NAME: Record<LocalStat, string> = {
  max: "Maximum",
  min: "Minimum",
  mean: "Mean of the tested midpoints",
  count: "Records with a value",
};

const OP_PHRASE: Record<LocalOp, string> = {
  ">": "above",
  "<": "below",
  ">=": "at or above",
  "<=": "at or below",
  between: "between",
};

type StatAnswer = Extract<LocalAnswer, { kind: "stat" }>;
type FilterAnswer = Extract<LocalAnswer, { kind: "filter" }>;

function RecordChips({ ids }: { ids: string[] }) {
  const { pack } = useData();
  if (ids.length === 0) return null;
  const shown = ids.slice(0, MAX_RECORDS);
  const extra = ids.length - shown.length;
  const chipLabel = (id: string): string => {
    const rec = pack.records.find((r) => r.id === id);
    if (!rec) return id;
    const study = pack.studies.find((s) => s.id === rec.study);
    return `${study?.short ?? rec.study} · ${rec.label}`;
  };
  return (
    <ul className="gx-ans-records">
      {shown.map((id) => (
        <li key={id} className="gx-ans-chip">
          <Src id={id}>{chipLabel(id)}</Src>
        </li>
      ))}
      {extra > 0 && <li className="gx-ans-more">{t("and {0} more", extra)}</li>}
    </ul>
  );
}

function StatBody({ answer }: { answer: StatAnswer }) {
  const { pack } = useData();
  const label = pack.schema.variables.find((v) => v.id === answer.variable)?.label ?? answer.variable;
  if (answer.n === 0) {
    return <p className="gx-ans-none">{t("No record gives a value for {0}.", label)}</p>;
  }
  const unit = answer.stat === "count" || !answer.unit ? "" : answer.unit;
  return (
    <div className="gx-ans">
      <p className="gx-ans-value-line">
        <span className="gx-ans-value">{num(answer.value)}</span>
        {unit ? <span className="gx-ans-unit"> {unit}</span> : null}
      </p>
      <p className="gx-ans-stat-name">{t(STAT_NAME[answer.stat])}</p>
      <p className="gx-ans-over">{t("over {0} records with a value", answer.n)}</p>
      <RecordChips ids={answer.records} />
    </div>
  );
}

function FilterBody({ answer }: { answer: FilterAnswer }) {
  const { pack } = useData();
  const label = pack.schema.variables.find((v) => v.id === answer.variable)?.label ?? answer.variable;
  const [a, b] = answer.bounds;
  const cond =
    answer.op === "between"
      ? t("between {0} and {1}", num(a), num(b))
      : t("{0} {1}", OP_PHRASE[answer.op], num(a));
  const unit = answer.unit ? ` ${answer.unit}` : "";
  return (
    <div className="gx-ans">
      <p className="gx-ans-count">{answer.studies.length}</p>
      <p className="gx-ans-sentence">
        {t("{0} studies record {1} {2}{3}", answer.studies.length, label, cond, unit)}
      </p>
      {answer.studies.length > 0 && (
        <p className="gx-ans-studies">
          {answer.studies.map((sid) => studyShort(pack, sid)).join(", ")}
        </p>
      )}
      <RecordChips ids={answer.records} />
    </div>
  );
}

export function AnswerModule({ spec, answer, figure }: AnswerModuleProps) {
  let body: ReactNode;
  if ("unsupported" in answer) {
    body = <p className="gx-ans-unsupported">{answer.unsupported}</p>;
  } else if (answer.kind === "stat") {
    body = <StatBody answer={answer} />;
  } else {
    body = <FilterBody answer={answer} />;
  }
  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {body}
      <p className="gx-ans-note">{t("Computed locally from the records · not AI")}</p>
    </ModuleFrame>
  );
}
