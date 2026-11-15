import { useEffect, useRef, useState } from "react";
import type { VariableEvidence } from "../engine";
import { useData } from "./ctx";
import { LEVELS } from "../report/text";
import { DIRECTION_ARROW, DIRECTION_WORD, diffLevels, type LevelChange } from "../report/diff";
import { t } from "../i18n";

const sig = (levels: VariableEvidence[]) => levels.map((l) => `${l.variable}=${l.value}:${l.level}`).join("|");

export function LevelWord({ level }: { level: VariableEvidence["level"] | null }) {
  if (!level) return <span>{t("none")}</span>;
  const l = LEVELS[level];
  return (
    <span className={`level level-${level}`}>
      <span aria-hidden="true">{l.icon}</span> {l.label}
    </span>
  );
}

/** "Changes since last edit": evidence levels before and after the most recent edit. Levels come from the engine. */
export function ChangeSummary({ levels }: { levels: VariableEvidence[] }) {
  const { pack } = useData();
  const prev = useRef<{ sig: string; levels: VariableEvidence[] } | null>(null);
  const [state, setState] = useState<{ changes: LevelChange[] } | null>(null);
  const s = sig(levels);

  useEffect(() => {
    const p = prev.current;
    if (p && p.sig !== s) setState({ changes: diffLevels(p.levels, levels) });
    prev.current = { sig: s, levels };
  }, [s]); // eslint-disable-line

  const label = (id: string) => {
    const v = pack.schema.variables.find((x) => x.id === id);
    return v?.long ?? v?.label ?? id;
  };

  return (
    <div className="changes" role="status" aria-live="polite" aria-label={t("Changes since last edit")}>
      <h3>{t("Changes since last edit")}</h3>
      {!state ? (
        <p className="hint">{t("Move a control to see which variables change evidence level.")}</p>
      ) : state.changes.length === 0 ? (
        <p className="hint">{t("No variable changed evidence level.")}</p>
      ) : (
        <ul>
          {state.changes.map((c) => (
            <li key={c.variable} className={`chg chg-${c.direction}`}>
              <span className="arrow" aria-hidden="true">{DIRECTION_ARROW[c.direction]}</span> <b>{label(c.variable)}</b> {DIRECTION_WORD[c.direction]}: <LevelWord level={c.from} /> {t("to")} <LevelWord level={c.to} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
