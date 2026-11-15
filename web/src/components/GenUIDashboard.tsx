/** Purpose-driven dashboard for an uploaded corpus (owner: S6). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { closeness, evidenceLevels, findings, gaps, partitionOf, pool, rank } from "../engine";
import type { Scenario } from "../engine";
import type { Axes } from "../state";
import type { CaseState } from "../genui/types";
import { MAX_CASE_VARIABLES, SCORE_WEIGHTS } from "../genui/types";
import { caseToScenario, setValue, toggleVariable } from "../genui/case";
import { moduleKind, renderModule } from "../genui/registry";
import { DataCtx, ProvCtx } from "./ctx";
import { Provenance } from "./Provenance";
import { LevelTag } from "./ScenarioPanel";
import { FindingsList, GapFigure, HeatTable, RankingTable } from "./Tables";
import { MapFigure } from "./MapFigure";
import { SaveExploration } from "./Workspace";
import { ChatPanel } from "./ChatPanel";
import { VariableScoresModule } from "./genui/VariableScoresModule";
import { CaseInputsModule } from "./genui/CaseInputsModule";
import { scenarioValueText, varOf } from "../report/format";
import { t } from "../i18n";
import type { EvaluationDraft } from "./ScenarioStep";
import "../styles/dashboard.css";

export interface GenUIDashboardProps {
  draft: EvaluationDraft;
  axes: Axes;
  setAxes: (a: Axes) => void;
  /** Keeps App's scenario in sync with the case (null while no value is set). */
  onScenario: (s: Scenario | null) => void;
  onHome: () => void;
  onEdit: () => void;
  onWorkspace: () => void;
}

const WEIGHT_LABELS: [keyof typeof SCORE_WEIGHTS, string][] = [
  ["coverage", "coverage across documents"],
  ["frequency", "mention frequency"],
  ["position", "position of the mentions"],
  ["purpose", "match with the purpose"],
  ["measurability", "measurability"],
];

export function GenUIDashboard({ draft, axes, setAxes, onScenario, onHome, onEdit, onWorkspace }: GenUIDashboardProps) {
  const { pack, lens } = draft;
  const dashboard = draft.dashboard;
  const purpose = draft.purpose ?? dashboard?.purpose ?? "";
  const [prov, setProv] = useState<string | null>(null);
  const openProv = useCallback((id: string) => setProv(id), []);
  const [caseState, setCaseState] = useState<CaseState>(draft.caseState ?? { selected: [], values: {} });
  const [limitHit, setLimitHit] = useState(false);

  const packVars = pack.schema.variables;
  const packIds = useMemo(() => new Set(packVars.map((v) => v.id)), [packVars]);
  const caseScenario = useMemo<Scenario | null>(() => {
    const s = caseToScenario(caseState);
    if (!s) return null;
    const active = s.active.filter((id) => packIds.has(id));
    if (!active.length) return null;
    const values: Scenario["values"] = {};
    for (const id of active) values[id] = s.values[id];
    return { active, values };
  }, [caseState, packIds]);

  useEffect(() => {
    onScenario(caseScenario);
  }, [caseScenario, onScenario]);

  const onToggle = (id: string) => {
    const r = toggleVariable(caseState, id);
    setCaseState(r.next);
    setLimitHit(r.error === "limit");
  };
  const onValue = (id: string, v: number | string | undefined) => setCaseState((c) => setValue(c, id, v));
  const onApply = (s: Scenario) =>
    setCaseState((c) => {
      const selected = [...c.selected];
      for (const id of s.active) if (!selected.includes(id) && selected.length < MAX_CASE_VARIABLES) selected.push(id);
      const values = { ...c.values };
      for (const id of s.active) if (selected.includes(id) && s.values[id] !== undefined) values[id] = s.values[id];
      return { selected, values };
    });
  const onPick = (v: Record<string, number>) =>
    setCaseState((c) => {
      const selected = [...c.selected];
      for (const id of Object.keys(v)) if (!selected.includes(id) && selected.length < MAX_CASE_VARIABLES) selected.push(id);
      return { selected, values: { ...c.values, ...v } };
    });

  const caseVars = packVars.filter((v) => caseState.selected.includes(v.id));
  const categories = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const v of packVars) {
      if (v.type !== "cat") continue;
      const set = new Set<string>();
      for (const r of pack.records) {
        const x = r.values[v.id];
        if (typeof x === "string") set.add(x);
      }
      out[v.id] = [...set].sort();
    }
    return out;
  }, [pack, packVars]);

  // Axes: the first two numeric selected variables, when the current ones are not valid.
  const numSelected = caseVars.filter((v) => v.type === "num").map((v) => v.id);
  const numKey = numSelected.join("|");
  const canPlot = numSelected.length >= 2;
  const axesValid = numSelected.includes(axes.x) && numSelected.includes(axes.y) && axes.x !== axes.y;
  const useAxes: Axes = axesValid || !canPlot ? axes : { x: numSelected[0], y: numSelected[1] };
  useEffect(() => {
    if (caseScenario && canPlot && !axesValid) setAxes({ x: numSelected[0], y: numSelected[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseScenario, numKey, axesValid]);

  const r = useMemo(() => {
    if (!caseScenario) return null;
    const part = partitionOf(pack, caseScenario);
    return {
      part,
      ranking: rank(pack, caseScenario),
      close: closeness(pack, caseScenario),
      levels: evidenceLevels(pack, lens, caseScenario),
      finds: findings(pack, lens, caseScenario),
      grid: canPlot ? gaps(pack, { x: useAxes.x, y: useAxes.y, partition: part?.value ?? null, scenario: caseScenario }) : null,
      n: pool(pack, caseScenario).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, lens, caseScenario, useAxes.x, useAxes.y, canPlot]);

  if (!dashboard) return <article className="page">{purpose}</article>;

  const modules = dashboard.modules.filter((m) => m.type !== "variable_scores");
  const scoresSpec = dashboard.modules.find((m) => m.type === "variable_scores");
  let fig = 0;
  let tab = 0;
  const next = (kind: "Figure" | "Table") => (kind === "Figure" ? ++fig : ++tab);
  const modCtx = { pack, docs: draft.docs, variables: draft.variables, purpose, caseScenario: caseScenario ?? undefined };
  const answerNodes = modules.map((m) => renderModule(m, modCtx, next(moduleKind(m))));
  const scoresTable = next("Table");
  const mapFig = next("Figure");
  const heatFig = next("Figure");
  const gapFig = next("Figure");

  const summary = caseVars
    .filter((v) => caseState.values[v.id] !== undefined)
    .map((v) => `${v.label} ${scenarioValueText(pack, v.id, caseState.values[v.id])}`)
    .join(" · ");
  const nVars = draft.scores?.length ?? draft.variables.length;
  const limit = scoresSpec?.type === "variable_scores" ? Math.max(scoresSpec.limit, MAX_CASE_VARIABLES) : MAX_CASE_VARIABLES;

  return (
    <ProvCtx.Provider value={openProv}>
      <DataCtx.Provider value={{ pack, lens, mapping: draft.mapping }}>
        <article className="page dash">
          <header className="dash-head">
            <div className="kicker">
              <span>{t("Evidence dashboard")}</span>
              <span className="sep" />
              <div className="kicker-actions noprint">
                {caseScenario && (
                  <SaveExploration packId={pack.meta.id} scenario={caseScenario} axes={useAxes} extras={[]} goal={purpose} projectId={null} summary={summary} customDraft={draft} />
                )}
                <button type="button" className="chip noprint" onClick={onEdit}>{t("Edit purpose")}</button>
                <button type="button" className="chip noprint" onClick={onWorkspace}>{t("Workspace")}</button>
                <button type="button" className="chip noprint" onClick={onHome}>{t("Home")}</button>
              </div>
            </div>
            <h1>{dashboard.title}</h1>
            {purpose && <blockquote className="dash-purpose">{purpose}</blockquote>}
            <p className="dash-corpus">
              {t("{0} documents · {1} variables detected · layout: {2}", draft.docs.length, nVars, dashboard.origin === "ai" ? t("AI-chosen") : t("Rule-based"))}
            </p>
          </header>

          <div className="dash-cols">
            <div className="dash-main">
              <h2 className="sec">{t("Answers to your purpose")}</h2>
              {answerNodes.length ? answerNodes : <p className="hint">{t("No module could be built from the corpus for this purpose.")}</p>}

              <h2 className="sec">{t("Your case")}</h2>
              <VariableScoresModule
                scores={draft.scores ?? []}
                selected={caseState.selected}
                onToggle={onToggle}
                limitHit={limitHit}
                limit={limit}
                figure={scoresTable}
                selectable
              />
              <CaseInputsModule variables={caseVars} values={caseState.values} onValue={onValue} categories={categories} />

              <h2 className="sec">{t("Case analysis")}</h2>
              {!caseScenario || !r ? (
                <p className="hint">{t("Give at least one selected variable a value to compute evidence levels, the ranking and the gap figures.")}</p>
              ) : (
                <>
                  <ul className="dash-levels">
                    {r.levels.map((lv) => (
                      <li key={lv.variable}>
                        <span>
                          {varOf(pack, lv.variable).label} <b>{scenarioValueText(pack, lv.variable, lv.value)}</b>
                        </span>
                        <LevelTag level={lv.level} />
                      </li>
                    ))}
                  </ul>
                  <RankingTable results={r.ranking} scenario={caseScenario} />
                  {canPlot && r.grid ? (
                    <>
                      <MapFigure figure={mapFig} scenario={caseScenario} partition={r.part} axes={useAxes} onAxes={setAxes} onPick={onPick} />
                      <HeatTable figure={heatFig} results={r.ranking} closeness={r.close} scenario={caseScenario} />
                      <GapFigure figure={gapFig} grid={r.grid} scenario={caseScenario} axes={useAxes} onAxes={setAxes} onPick={onPick} />
                    </>
                  ) : (
                    <>
                      <p className="hint">{t("Select at least two numeric variables to draw the map and the gap figure.")}</p>
                      <HeatTable figure={heatFig} results={r.ranking} closeness={r.close} scenario={caseScenario} />
                    </>
                  )}
                  <FindingsList findings={r.finds} />
                </>
              )}

              <h2 className="sec more">{t("Methods")}</h2>
              <div className="dash-methods">
                <p>
                  <b>{t("Variable relevance.")}</b>{" "}
                  {t("Each variable is scored as a weighted sum, rounded to three decimals: ")}
                  {WEIGHT_LABELS.map(([k, label]) => `${SCORE_WEIGHTS[k]} × ${t(label)}`).join(" + ")}.{" "}
                  {t("Every component is in [0, 1] and computed locally from the uploaded documents; a variable without a citation is not scored.")}
                </p>
                <p>
                  <b>{t("How the modules are chosen.")}</b>{" "}
                  {t("The layout is picked by rules that match the purpose against intents (rule-based), or proposed by an AI layout that is validated against a schema before use. In both cases every value is computed locally; the AI never supplies numbers.")}
                </p>
                <p>
                  <b>{t("Evidence levels.")}</b>{" "}
                  {t("Studied: records exist at the value of the case. Near, not covered: records exist close to the value but not at it. Scarce evidence: few documents or only flagged records. Not studied: no comparable record. All four carry the same weight; none is a prediction.")}
                </p>
                <p>
                  <b>{t("Provenance.")}</b>{" "}
                  {t("Every value opens its source record (file, row or page, and DOI when available). Prometeo compares conditions against the evidence; it does not predict outcomes.")}
                </p>
              </div>
            </div>

            <aside className="dash-chat noprint" aria-label={t("Ask the corpus")}>
              <ChatPanel docs={draft.docs} scenario={caseScenario} isCustomCorpus suggestions={dashboard.suggestedQuestions} onApply={onApply} />
            </aside>
          </div>
        </article>
        {prov && <Provenance id={prov} onClose={() => setProv(null)} />}
      </DataCtx.Provider>
    </ProvCtx.Provider>
  );
}
