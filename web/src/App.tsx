import { useCallback, useEffect, useMemo, useState } from "react";
import { closeness, evidence, evidenceLevels, findings, gaps, partitionOf, pool, rank } from "./engine";
import type { Lens, Pack, Scenario } from "./engine";
import { DataCtx, ProvCtx } from "./components/ctx";
import type { Data, Mapping } from "./components/ctx";
import { AssistantPanel } from "./components/AssistantPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { MapFigure } from "./components/MapFigure";
import { FindingsList, GapFigure, HeatTable, KeyFindings, RankingTable, SourcesTable } from "./components/Tables";
import { Methods, References } from "./components/Methods";
import { Provenance } from "./components/Provenance";
import { Cover } from "./components/Cover";
import { ScenarioStep } from "./components/ScenarioStep";
import { MLCard } from "./components/MLCard";
import { StudyCompare } from "./components/StudyCompare";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { abstractText, OVERALL } from "./report/text";
import { partitionName, partitionPhrase, scenarioValueText, studyShort, varOf } from "./report/format";
import { readUrl, stageFromUrl, writeUrl } from "./state";
import type { Stage } from "./state";
import type { Axes } from "./state";

async function load(): Promise<Data> {
  const get = async (name: string) => {
    const r = await fetch(`./demo/${name}`);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.json();
  };
  const [pack, lens, mapping] = await Promise.all([get("pack.json"), get("lens.json"), get("mapping.json")]);
  return { pack: pack as Pack, lens: lens as Lens, mapping: mapping as Mapping };
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    load().then(setData, (e) => setError(String(e)));
  }, []);
  if (error) return <article className="page"><p className="abstract">The evidence pack could not be loaded ({error}).</p></article>;
  if (!data) return <article className="page"><p className="abstract">Loading the evidence pack…</p></article>;
  return (
    <DataCtx.Provider value={data}>
      <Flow data={data} />
    </DataCtx.Provider>
  );
}

/** Cover -> scenario form -> report. The stage lives in the URL hash so Back works and a shared link opens the report. */
function Flow({ data }: { data: Data }) {
  const { pack, lens } = data;
  const initial = useMemo(() => readUrl(pack, lens, window.location.search), [pack, lens]);
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [axes, setAxes] = useState<Axes>(initial.axes);
  const [goal, setGoal] = useState("");
  const [stage, setStage] = useState<Stage>(() => stageFromUrl(window.location.hash, window.location.search));

  useEffect(() => {
    const onHash = () => {
      setStage(stageFromUrl(window.location.hash, ""));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (stage === "cover") return;
    window.history.replaceState(null, "", writeUrl(lens, scenario, axes) + window.location.hash);
  }, [lens, scenario, axes, stage]);

  const go = (next: Stage) => {
    window.location.hash = next === "cover" ? "" : next;
  };
  if (stage === "cover") return <Cover onStart={() => go("scenario")} onDemo={() => go("report")} />;
  if (stage === "scenario") return <ScenarioStep scenario={scenario} onChange={setScenario} goal={goal} onGoal={setGoal} onBack={() => go("cover")} onRun={() => go("report")} />;
  return <Report data={data} scenario={scenario} setScenario={setScenario} axes={axes} setAxes={setAxes} goal={goal} onHome={() => go("cover")} onEdit={() => go("scenario")} />;
}

function Report({ data, scenario, setScenario, axes, setAxes, goal, onHome, onEdit }: {
  data: Data; scenario: Scenario; setScenario: (s: Scenario | ((s: Scenario) => Scenario)) => void; axes: Axes; setAxes: (a: Axes) => void; goal: string; onHome: () => void; onEdit: () => void;
}) {
  const { pack, lens } = data;
  const [prov, setProv] = useState<string | null>(null);
  const openProv = useCallback((id: string) => setProv(id), []);

  const r = useMemo(() => {
    const part = partitionOf(pack, scenario);
    return {
      part,
      n: pool(pack, scenario).length,
      ranking: rank(pack, scenario),
      close: closeness(pack, scenario),
      overall: evidence(pack, scenario),
      levels: evidenceLevels(pack, lens, scenario),
      finds: findings(pack, lens, scenario),
      grid: gaps(pack, { x: axes.x, y: axes.y, partition: part?.value ?? null, scenario }),
    };
  }, [pack, lens, scenario, axes]);

  const unit = lens.unit_of_study ?? "study";
  const where = partitionPhrase(pack, lens, r.part?.value);
  const summary = scenario.active
    .filter((id) => scenario.values[id] !== undefined && scenario.values[id] !== "")
    .map((id) => `${varOf(pack, id).label} ${scenarioValueText(pack, id, scenario.values[id])}`)
    .join(" · ");
  const graded = r.ranking.filter((x) => x.grade !== "D");
  const best = graded[0];

  return (
    <ProvCtx.Provider value={openProv}>
      <article className="page">
        <header className="mast">
          <span className="brand">
            <img src="/logo-mark-float-512.png" alt="" width={135} height={135} />
            <b>Prometeo</b> · Evidence report
          </span>
          <span>{pack.meta.created_at}</span>
          <span>{lens.byline}</span>
        </header>

        <div className="kicker">
          <span>{lens.kicker ?? "Scenario assessment"}</span>
          <span className="verify">{summary}</span>
          <span className="sep" />
          <button type="button" className="chip noprint" onClick={onEdit}>
            Edit scenario
          </button>
          <button type="button" className="chip noprint" onClick={onHome}>
            Start
          </button>
          <button type="button" className="chip noprint" onClick={() => window.print()}>
            Export PDF
          </button>
        </div>
        <h1>{lens.title}</h1>
        <p className="byline">
          <span>{pack.meta.source_note}</span>
          <span>every value links to its source row and DOI</span>
        </p>

        {goal.trim() && (
          <p className="goalline">
            <b>Question.</b> {goal.trim()}
          </p>
        )}

        <ScenarioPanel scenario={scenario} onChange={setScenario} levels={r.levels} />

        <AssistantPanel scenario={scenario} levels={r.levels} findings={r.finds} onChange={setScenario} />

        <KeyFindings findings={r.finds} />

        <div className="row">
          <p className="abstract">
            <b className="lbl">Abstract. </b>
            {abstractText(pack, lens, scenario, r.overall, r.finds)}
          </p>
          <aside className="side">
            <p>
              <b>How to read this report.</b> Every recorded test is placed in the space of experimental conditions and compared with the scenario above. Change a value and every figure, table and sentence is recomputed in the browser. Underlined values open their source: file, row, original text, conversion and dataset DOI.
            </p>
            <p>
              <b>Grades.</b> A: a comparable record lies within one σ-distance and nothing is missing. B: inside the tested range, with missing variables or a larger distance. C: outside the tested range. D: no comparable record.
            </p>
            <p>{lens.disclaimer}</p>
          </aside>
        </div>

        <div className="row">
          <div className="body">
            <h2 className="sec">1 · Where the tests sit relative to the scenario</h2>
            <p>
              Of the {pack.meta.stats.tests?.toLocaleString("en-US")} individual tests in the corpus, {r.n.toLocaleString("en-US")} are comparable with the scenario{r.part ? ` (${where})` : ""}. Figure 1 places every test on two variables of choice; tests that do not record the vertical variable are kept in a separate strip instead of being dropped or assigned a value. Table 1 ranks the {pack.studies.length} {unit}s: {r.overall.counts.A} graded A, {r.overall.counts.B} B, {r.overall.counts.C} C and {r.overall.counts.D} D, so the overall evidence is {OVERALL[r.overall.level].replace(/study/g, unit)}.
              {best ? ` The closest ${unit} is ${studyShort(pack, best.study)} (grade ${best.grade}, d = ${best.distance}).` : ""}
            </p>
          </div>
          <aside className="side">
            <p>
              <b>Partitions.</b> {r.part ? `The scenario falls in “${partitionName(lens, r.part.value)}”. Tests of other partitions are drawn hollow and never enter a grade, a level or a distance.` : "No partition could be inferred from the scenario; all tests are compared."}
            </p>
          </aside>
        </div>
        <MapFigure figure={1} scenario={scenario} partition={r.part} axes={axes} onAxes={setAxes} onPick={(v) => setScenario((s) => ({ ...s, values: { ...s.values, ...v }, active: pack.schema.variables.map((x) => x.id).filter((id) => s.active.includes(id) || id in v) }))} />
        <div className="row">
          <div className="wide">
            <RankingTable results={r.ranking} scenario={scenario} />
          </div>
        </div>

        <div className="row">
          <div className="body">
            <h2 className="sec">2 · How close each {unit} comes, variable by variable</h2>
            <p>
              A single distance hides which variable is responsible. Figure 2 separates it: for each {unit} with comparable records, how close its nearest record comes to the scenario on each active variable, and which variables it does not record at all.
            </p>
          </div>
          <aside className="side">
            <p>
              <b>Missing is not zero.</b> A variable that a table does not record is shown as a dash and listed as missing in Table 1. It lowers the grade from A to B; it is never treated as a measured value.
            </p>
          </aside>
        </div>
        <HeatTable figure={2} results={r.ranking} closeness={r.close} scenario={scenario} />

        <div className="row">
          <div className="body">
            <h2 className="sec">3 · Coverage and gaps</h2>
            <p>
              Figure 3 counts the comparable tests in each region of the two variables selected in Figure 1, next to the tests of other partitions in the same region. Table 2 lists every finding the rules produce for the scenario, with the records or {unit}s that back each one.
            </p>
          </div>
          <aside className="side">
            <p>
              <b>What a gap means.</b> An empty cell states that no comparable test was recorded there. It does not state what would happen under those conditions.
            </p>
          </aside>
        </div>
        <GapFigure figure={3} grid={r.grid} scenario={scenario} />
        <div className="row">
          <div className="wide">
            <FindingsList findings={r.finds} />
          </div>
        </div>

        <div className="row">
          <div className="wide">
            <KnowledgeGraph figure={4} scenario={scenario} />
          </div>
        </div>

        <MLCard />
        <StudyCompare />

        <div className="row">
          <div className="body">
            <h2 className="sec">6 · Sources</h2>
          </div>
        </div>
        <div className="row">
          <div className="wide">
            <SourcesTable n={3} />
          </div>
        </div>

        <div className="row">
          <div className="body">
            <h2 className="sec">7 · Methods</h2>
            <Methods tableN={4} />
          </div>
          <aside className="side">
            <p>
              <b>Reproducibility.</b> All numbers on this page are computed in the browser from one evidence pack ({pack.contract}) generated offline from the source tables; each table is identified by its SHA-256. The engine that computes grades, levels and findings contains no vocabulary of this corpus and is covered by test vectors on these data.
            </p>
          </aside>
        </div>

        <div className="row">
          <div className="body">
            <h2 className="sec">References</h2>
            <References />
          </div>
        </div>

        <footer className="end">
          <span>{lens.footer}</span>
          <span>{lens.disclaimer}</span>
        </footer>
      </article>
      {prov && <Provenance id={prov} onClose={() => setProv(null)} />}
    </ProvCtx.Provider>
  );
}
