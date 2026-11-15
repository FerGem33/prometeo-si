import { useCallback, useEffect, useMemo, useState } from "react";
import { closeness, evidence, evidenceLevels, findings, gaps, partitionOf, pool, rank } from "./engine";
import type { Lens, Pack, Scenario } from "./engine";
import { DataCtx, ProvCtx } from "./components/ctx";
import type { Data, Mapping } from "./components/ctx";
import { AssistantPanel } from "./components/AssistantPanel";
import { LevelTag, ScenarioPanel } from "./components/ScenarioPanel";
import { VariantsPanel } from "./components/VariantsPanel";
import { MapFigure } from "./components/MapFigure";
import { SourcesRanked } from "./components/SourcesRanked";
import { FindingsList, GapFigure, HeatTable, KeyFindings, RankingTable, SourcesTable } from "./components/Tables";
import { Methods, References } from "./components/Methods";
import { Provenance } from "./components/Provenance";
import { Cover } from "./components/Cover";
import { Workspace, SaveExploration } from "./components/Workspace";
import { ScenarioStep } from "./components/ScenarioStep";
import { MLCard } from "./components/MLCard";
import { StudyCompare } from "./components/StudyCompare";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { GraphicalAbstract } from "./components/GraphicalAbstract";
import { Fold } from "./components/Fold";
import { EvidenceCard } from "./components/EvidenceCard";
import { ReadingGuide } from "./components/ReadingGuide";
import { ExtraTag } from "./components/ExtraVars";
import { abstractText, OVERALL } from "./report/text";
import { partitionName, partitionPhrase, scenarioValueText, studyShort, varOf } from "./report/format";
import { readUrl, stageFromUrl, writeUrl } from "./state";
import type { Stage } from "./state";
import type { Axes, Extra } from "./state";

const STAGE_HASHES = ["", "#scenario", "#report", "#workspace"];

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
  const [extras, setExtras] = useState<Extra[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(() => stageFromUrl(window.location.hash, window.location.search));

  useEffect(() => {
    const onHash = () => {
      // A link to an anchor inside the report (a reference, for instance) is not a change of stage.
      if (!STAGE_HASHES.includes(window.location.hash)) return;
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
  if (stage === "cover") return <Cover onStart={() => go("scenario")} onDemo={() => go("report")} onWorkspace={() => go("workspace")} />;
  if (stage === "workspace") return <Workspace onBack={() => go("cover")} onOpen={(p, e) => { setGoal(p.intent); if (e) { setScenario(e.scenario); setAxes(e.axes); setExtras(e.extras ?? []); } setProjectId(p.id); go("report"); }} />;
  if (stage === "scenario") return <ScenarioStep scenario={scenario} onChange={setScenario} extras={extras} onExtras={setExtras} goal={goal} onGoal={setGoal} onBack={() => go("cover")} onRun={() => go("report")} />;
  return <Report data={data} scenario={scenario} setScenario={setScenario} extras={extras} setExtras={setExtras} axes={axes} setAxes={setAxes} goal={goal} projectId={projectId} onHome={() => go("cover")} onEdit={() => go("scenario")} onWorkspace={() => go("workspace")} />;
}

function Report({ data, scenario, setScenario, extras, setExtras, axes, setAxes, goal, projectId, onHome, onEdit, onWorkspace }: {
  data: Data; scenario: Scenario; setScenario: (s: Scenario | ((s: Scenario) => Scenario)) => void; extras: Extra[]; setExtras: (e: Extra[]) => void; axes: Axes; setAxes: (a: Axes) => void; goal: string; projectId: string | null; onHome: () => void; onEdit: () => void; onWorkspace: () => void;
}) {
  const { pack, lens } = data;
  const [prov, setProv] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
    .concat(extras.map((e) => `${e.name} ${e.value} ${e.unit}`.trim()))
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
          <SaveExploration packId={pack.meta.id} scenario={scenario} axes={axes} extras={extras} goal={goal} projectId={projectId} summary={summary} />
          <button type="button" className="chip noprint" onClick={onEdit}>
            Edit scenario
          </button>
          <button type="button" className="chip noprint" onClick={onWorkspace}>
            Workspace
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

        {/* Main column, with a side rail that stays in view while the page scrolls. */}
        <div className="cols">
          <section className="abstract-card" aria-label="Abstract">
            <div className="abstract-head">
              <b className="lbl">Abstract</b>
              <ReadingGuide />
            </div>
            <p className="abstract">{abstractText(pack, lens, scenario, r.overall, r.finds)}</p>
          </section>

          <div className="top">
            <EvidenceCard overall={r.overall} ranking={r.ranking} levels={r.levels} comparable={r.n} />
            <KeyFindings findings={r.finds} />
          </div>

          <Fold id="scenario-controls" controlled open={editing} onOpenChange={setEditing} title="Scenario values" hint="sliders, presets and your own variables">
            <ScenarioPanel scenario={scenario} onChange={setScenario} levels={r.levels} extras={extras} onExtras={setExtras} />
          </Fold>

          <aside className="rail" aria-label="Scenario summary, questions and analysis">
            <section className="rail-scn noprint" aria-label="Current scenario">
              <h2>Current scenario</h2>
              <ul>
                {r.levels.map((lv) => (
                  <li key={lv.variable}>
                    <span>
                      {varOf(pack, lv.variable).label} <b>{scenarioValueText(pack, lv.variable, lv.value)}</b>
                    </span>
                    <LevelTag level={lv.level} />
                  </li>
                ))}
                {extras.map((e) => (
                  <li key={e.id}>
                    <span>
                      {e.name}{" "}
                      <b>
                        {e.value} {e.unit}
                      </b>
                    </span>
                    <ExtraTag />
                  </li>
                ))}
              </ul>
              {r.levels.length === 0 && extras.length === 0 && <p className="hint">No variable is part of the scenario.</p>}
              <button type="button" className="chip" onClick={() => {
                  setEditing(true);
                  setTimeout(() => document.getElementById("scenario-controls")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}>
                Change values
              </button>
            </section>
            <AssistantPanel scenario={scenario} levels={r.levels} findings={r.finds} onChange={setScenario} />
          </aside>

          <Fold title="Save or compare variants of this scenario" hint="kept in this browser only">
            <VariantsPanel scenario={scenario} onChange={setScenario} extras={extras} onExtras={setExtras} />
          </Fold>

          <GraphicalAbstract scenario={scenario} onChange={setScenario} ranking={r.ranking} close={r.close} levels={r.levels} overall={r.overall} comparable={r.n} />

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
          <Fold title={`Table 1 · Ranking of the ${pack.studies.length} ${unit}s`} hint="grade, distance, nearest record, reason and DOI">
            <RankingTable results={r.ranking} scenario={scenario} />
          </Fold>

          <div className="row">
            <div className="body">
              <h2 className="sec">2 · How close each {unit} comes, variable by variable</h2>
              <p>
                A single distance hides which variable is responsible. Panel b of the graphical abstract shows it for one {unit} at a time; Figure 2 gives the same closeness for every {unit} with comparable records, and which variables each one does not record at all.
              </p>
            </div>
            <aside className="side">
              <p>
                <b>Missing is not zero.</b> A variable that a table does not record is shown as a dash and listed as missing in Table 1. It lowers the grade from A to B; it is never treated as a measured value.
              </p>
            </aside>
          </div>
          <Fold title={`Figure 2 · Closeness of every ${unit}, variable by variable`} hint="sortable table with the nearest values">
            <HeatTable figure={2} results={r.ranking} closeness={r.close} scenario={scenario} />
          </Fold>

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
          <Fold title="Table 2 · All findings for the scenario" hint={`${r.finds.length} findings with their sources`}>
            <FindingsList findings={r.finds} />
          </Fold>

          <KnowledgeGraph figure={4} scenario={scenario} />

          <h2 className="sec more">Data, sources and methods</h2>
          <Fold title="Outcome data description" hint="Table 5 · what the corpus records as results">
            <MLCard />
          </Fold>
          <Fold title={`Compare two ${unit}s side by side`} hint="objective, conditions, values and source columns">
            <StudyCompare />
          </Fold>
          <Fold title="Sources" hint={`Tables 3 and 4 · the ${pack.sources.length} source tables and the ranking explained`}>
            <SourcesTable n={3} />
            <SourcesRanked n={4} ranking={r.ranking} closeness={r.close} scenario={scenario} />
          </Fold>
          <Fold title="Methods" hint="Table 6 · partitions, distance, grades, levels and unit conversions">
            <div className="row">
              <div className="body">
                <Methods tableN={6} />
              </div>
              <aside className="side">
                <p>
                  <b>Reproducibility.</b> All numbers on this page are computed in the browser from one evidence pack ({pack.contract}) generated offline from the source tables; each table is identified by its SHA-256. The engine that computes grades, levels and findings contains no vocabulary of this corpus and is covered by test vectors on these data.
                </p>
              </aside>
            </div>
          </Fold>

          <div className="row">
            <div className="body">
              <h2 className="sec">References</h2>
              <References />
            </div>
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
