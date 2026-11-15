import { useCallback, useEffect, useMemo, useState } from "react";
import { closeness, evidence, evidenceLevels, findings, gaps, partitionOf, pool, rank } from "./engine";
import type { Lens, Pack, Scenario } from "./engine";
import { DataCtx, ProvCtx } from "./components/ctx";
import type { Data, Mapping } from "./components/ctx";
import { AssistantPanel } from "./components/AssistantPanel";
import { HabitatPanel, PresetChips, ScenarioPanel } from "./components/ScenarioPanel";
import { allHabitatPresets, matchingHabitatPreset } from "./components/HabitatFigure";
import { SectionNav } from "./components/SectionNav";
import { VariantsPanel } from "./components/VariantsPanel";
import { MapFigure } from "./components/MapFigure";
import { SourcesRanked } from "./components/SourcesRanked";
import { FindingsList, GapFigure, HeatTable, KeyFindings, RankingTable, SourcesTable } from "./components/Tables";
import { Methods, References } from "./components/Methods";
import { Provenance } from "./components/Provenance";
import { Cover } from "./components/Cover";
import { Workspace, SaveExploration } from "./components/Workspace";
import { ScenarioStep } from "./components/ScenarioStep";
import { ProcessingStep } from "./components/ProcessingStep";
import { ChamberFigure } from "./components/ChamberFigure";
import { DossierModal } from "./components/DossierModal";
import { MLCard } from "./components/MLCard";
import { StudyCompare } from "./components/StudyCompare";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { ClosenessPanels, ScenarioRanges } from "./components/GraphicalAbstract";
import { Fold } from "./components/Fold";
import { EvidenceCard } from "./components/EvidenceCard";
import { ExtraTag } from "./components/ExtraVars";
import { JudgeTour } from "./components/JudgeTour";
import "./styles/tour.css";
import "./styles/answer.css";
import { abstractText, overallText } from "./report/text";
import { partitionName, partitionPhrase, scenarioValueText, studyShort, varOf } from "./report/format";
import { readUrl, stageFromUrl, writeUrl } from "./state";
import type { Stage } from "./state";
import type { Axes, Extra } from "./state";
import { t, many, useLang } from "./i18n";
import type { Lang } from "./i18n";
import { loadLocale, localizeData } from "./i18n/localize";
import type { CorpusLocale } from "./i18n/localize";
import { Prefs } from "./components/Prefs";

const STAGE_HASHES = ["", "#scenario", "#processing", "#report", "#workspace"];

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
  const lang = useLang();
  const [locale, setLocale] = useState<{ lang: Lang; file: CorpusLocale | null }>({ lang: "en", file: null });
  useEffect(() => {
    load().then(setData, (e) => setError(String(e)));
  }, []);
  // The words of the corpus in the language of the interface; English needs no file.
  useEffect(() => {
    let live = true;
    loadLocale("./demo/", lang).then((file) => live && setLocale({ lang, file }));
    return () => {
      live = false;
    };
  }, [lang]);
  const view = useMemo(() => (data ? localizeData(data, locale.lang === lang ? locale.file : null) : null), [data, lang, locale]);
  if (error)
    return (
      <article className="page">
        <p className="abstract">{t("The evidence pack could not be loaded (")}{error}).</p>
      </article>
    );
  if (!view)
    return (
      <article className="page">
        <p className="abstract">{t("Loading the evidence pack…")}</p>
      </article>
    );
  return (
    <DataCtx.Provider value={view}>
      <Flow data={view} />
    </DataCtx.Provider>
  );
}

/** Cover -> scenario form -> processing chamber -> report. The stage lives in the URL hash so Back works and a shared link opens the report. */
function Flow({ data }: { data: Data }) {
  const { pack, lens } = data;
  const initial = useMemo(() => readUrl(pack, lens, window.location.search), [pack, lens]);
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [axes, setAxes] = useState<Axes>(initial.axes);
  const [goal, setGoal] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [hold, setHold] = useState(false);
  const [stage, setStage] = useState<Stage>(() => stageFromUrl(window.location.hash, window.location.search));
  // The dossier belongs to the report; leaving the report closes it.
  useEffect(() => {
    if (stage !== "report") setDossierOpen(false);
  }, [stage]);

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

  let screen: React.ReactNode = null;
  if (stage === "cover") {
    screen = (
      <Cover
        onStart={(presetScenario) => {
          if (presetScenario) setScenario(presetScenario);
          go("scenario");
        }}
        onDemo={() => go("report")}
        onWorkspace={() => go("workspace")}
      />
    );
  } else if (stage === "workspace") {
    screen = (
      <Workspace
        onBack={() => go("cover")}
        onOpen={(p, e) => {
          setGoal(p.intent);
          if (e) {
            setScenario(e.scenario);
            setAxes(e.axes);
            setExtras(e.extras ?? []);
          }
          setProjectId(p.id);
          go("report");
        }}
      />
    );
  } else if (stage === "scenario") {
    screen = (
      <ScenarioStep
        scenario={scenario}
        onChange={setScenario}
        extras={extras}
        onExtras={setExtras}
        goal={goal}
        onGoal={setGoal}
        onBack={() => go("cover")}
        onRun={(count) => {
          setFileCount(count ?? 0);
          go("processing");
        }}
      />
    );
  } else if (stage === "processing") {
    screen = <ProcessingStep fileCount={fileCount} hold={hold} onBack={() => go("scenario")} onComplete={() => go("report")} />;
  } else {
    screen = (
      <Report
        data={data}
        scenario={scenario}
        setScenario={setScenario}
        extras={extras}
        setExtras={setExtras}
        axes={axes}
        setAxes={setAxes}
        goal={goal}
        projectId={projectId}
        onHome={() => go("cover")}
        onEdit={() => go("scenario")}
        onWorkspace={() => go("workspace")}
        dossierOpen={dossierOpen}
        onDossier={setDossierOpen}
      />
    );
  }

  return (
    <>
      {screen}
      <JudgeTour
        onStart={(s) => {
          setScenario(s);
          setExtras([]);
        }}
        onNavigate={go}
        onDossier={setDossierOpen}
        onHold={setHold}
      />
    </>
  );
}

function Report({
  data,
  scenario,
  setScenario,
  extras,
  setExtras,
  axes,
  setAxes,
  goal,
  projectId,
  onHome,
  onEdit,
  onWorkspace,
  dossierOpen,
  onDossier,
}: {
  data: Data;
  scenario: Scenario;
  setScenario: (s: Scenario | ((s: Scenario) => Scenario)) => void;
  extras: Extra[];
  setExtras: (e: Extra[]) => void;
  axes: Axes;
  setAxes: (a: Axes) => void;
  goal: string;
  projectId: string | null;
  onHome: () => void;
  onEdit: () => void;
  onWorkspace: () => void;
  dossierOpen: boolean;
  onDossier: (open: boolean) => void;
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

  const presetLabel = allHabitatPresets(lens).find((p) => p.id === matchingHabitatPreset(lens, scenario))?.label;
  const pick = (v: Record<string, number | string>) =>
    setScenario((s) => ({ ...s, values: { ...s.values, ...v }, active: pack.schema.variables.map((x) => x.id).filter((id) => s.active.includes(id) || id in v) }));
  const changeValues = () => {
    setEditing(true);
    setTimeout(() => document.getElementById("scenario-controls")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const closeMenu = (e: React.MouseEvent<HTMLElement>) => e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <ProvCtx.Provider value={openProv}>
      <article className="page answer-first">
        <header className="mast">
          <span className="brand">
            <img src="/logo-mark-float-512.png" alt="" width={135} height={135} />
            <b>{t("Prometeo")}</b> {t("· Evidence report")}
          </span>
          <span>{pack.meta.created_at}</span>
          <span>{lens.byline}</span>
          <Prefs />
        </header>

        {/* The four layers of the report and its actions stay in reach while the page scrolls. */}
        <SectionNav>
          <SaveExploration packId={pack.meta.id} scenario={scenario} axes={axes} extras={extras} goal={goal} projectId={projectId} summary={summary} />
          <button type="button" className="chip noprint" onClick={() => onDossier(true)}>
            {t("Dossier & export")}
          </button>
          <details className="more noprint">
            <summary className="chip">{t("More")}</summary>
            <div className="more-menu" role="group" aria-label={t("Other report actions")}>
              <button type="button" onClick={(e) => { closeMenu(e); onEdit(); }}>
                {t("Edit scenario")}
              </button>
              <button type="button" onClick={(e) => { closeMenu(e); onWorkspace(); }}>
                {t("Workspace")}
              </button>
              <button type="button" onClick={(e) => { closeMenu(e); onHome(); }}>
                {t("Start")}
              </button>
              <button type="button" onClick={(e) => { closeMenu(e); window.print(); }}>
                {t("Export PDF")}
              </button>
            </div>
          </details>
        </SectionNav>

        <div className="cols single">
          {/* 1 · Answer: the scenario and how much evidence there is for it. */}
          <section className="sect" id="sec-answer" aria-labelledby="scn-title">
            <div className="kicker">
              <span>{lens.kicker ?? t("Scenario assessment")}</span>
            </div>
            <div className="scn-headline">
              <h1 id="scn-title">{summary ? (presetLabel ? `${presetLabel} · ${summary}` : summary) : lens.title}</h1>
              <button type="button" className="chip noprint" onClick={changeValues}>
                {t("Change values")}
              </button>
            </div>
            <p className="byline">
              {summary && <span>{lens.title}</span>}
              <span>{pack.meta.source_note}</span>
              <span>{t("every value links to its source row and DOI")}</span>
            </p>
            {goal.trim() && (
              <p className="goalline">
                <b>{t("Question.")}</b> {goal.trim()}
              </p>
            )}

            <div className="top">
              <EvidenceCard overall={r.overall} ranking={r.ranking} comparable={r.n} />
            </div>

            <Fold title={t("Abstract")} hint={t("the same answer in full sentences, as in the printed report")}>
              <p className="abstract">{abstractText(pack, lens, scenario, r.overall, r.finds)}</p>
            </Fold>
          </section>

          {/* 2 · Why: each variable once, then the ways to change the scenario, then the findings. */}
          <section className="sect" id="sec-why" aria-labelledby="why-title">
            <div className="sect-head">
              <h2 id="why-title">{t("Why: each condition against what was tested")}</h2>
              <p className="hint noprint">{t("Click a scale to move a value; every figure, table and sentence is recomputed.")}</p>
            </div>
            <ScenarioRanges scenario={scenario} onChange={setScenario} levels={r.levels} />
            {extras.length > 0 && (
              <ul className="why-extras">
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
            )}

            <div className="try noprint">
              <span className="try-lab">{t("Try another scenario:")}</span>
              <PresetChips scenario={scenario} onChange={setScenario} />
            </div>
            <Fold id="scenario-controls" controlled open={editing} onOpenChange={setEditing} title={t("Scenario values")} hint={t("sliders and your own variables")}>
              <ScenarioPanel scenario={scenario} onChange={setScenario} levels={r.levels} extras={extras} onExtras={setExtras} />
            </Fold>
            <Fold title={t("Save or compare variants of this scenario")} hint={t("kept in this browser only")}>
              <VariantsPanel scenario={scenario} onChange={setScenario} extras={extras} onExtras={setExtras} />
            </Fold>

            <KeyFindings findings={r.finds} />
            <Fold title={t("Table 2 · All findings for the scenario")} hint={t("{0} findings with their sources", r.finds.length)}>
              <FindingsList findings={r.finds} />
            </Fold>

            <AssistantPanel scenario={scenario} levels={r.levels} findings={r.finds} onChange={setScenario} />
          </section>

          {/* 3 · Explore: the figures. The first is open; the others open in place. */}
          <section className="sect" id="sec-explore" aria-labelledby="explore-title">
            <div className="sect-head">
              <h2 id="explore-title">{t("Explore the evidence")}</h2>
            </div>

            <h2 className="sec">{t("1 · Where the tests sit relative to the scenario")}</h2>
            <MapFigure figure={1} scenario={scenario} partition={r.part} axes={axes} onAxes={setAxes} onPick={pick} />
            <Fold title={t("Read the detail")} hint={t("Partitions.")}>
              <div className="row">
                <div className="body">
                  <p>
                    {t("Of the")} {pack.meta.stats.tests?.toLocaleString("en-US")} {t("individual tests in the corpus,")} {r.n.toLocaleString("en-US")} {t("are comparable with the scenario")}{r.part ? ` (${where})` : ""}{t(". Figure 1 places every test on two variables of choice; tests that do not record the vertical variable are kept in a separate strip instead of being dropped or assigned a value. Table 1 ranks the")} {pack.studies.length} {many(unit)}: {r.overall.counts.A} {t("graded A,")} {r.overall.counts.B} B, {r.overall.counts.C} {t("C and")} {r.overall.counts.D} {t("D, so the overall evidence is")} {overallText(r.overall.level, unit)}.
                    {best ? t(" The closest {0} is {1} (grade {2}, d = {3}).", unit, studyShort(pack, best.study), best.grade, best.distance) : ""}
                  </p>
                </div>
                <aside className="side">
                  <p>
                    <b>{t("Partitions.")}</b> {r.part ? t("The scenario falls in “{0}”. Tests of other partitions are drawn hollow and never enter a grade, a level or a distance.", partitionName(lens, r.part.value)) : t("No partition could be inferred from the scenario; all tests are compared.")}
                  </p>
                </aside>
              </div>
            </Fold>

            <h2 className="sec">{t("2 · How close each")} {unit} {t("comes, variable by variable")}</h2>
            <Fold title={t("Figure 2 · Closeness of every {0}, variable by variable", unit)} hint={t("sortable table with the nearest values")}>
              <ClosenessPanels scenario={scenario} ranking={r.ranking} close={r.close} />
              <HeatTable figure={2} results={r.ranking} closeness={r.close} scenario={scenario} />
            </Fold>
            <Fold title={t("Read the detail")} hint={t("Missing is not zero.")}>
              <div className="row">
                <div className="body">
                  <p>
                    {t("A single distance hides which variable is responsible. Panel b of the graphical abstract shows it for one")} {unit} {t("at a time; Figure 2 gives the same closeness for every")} {unit} {t("with comparable records, and which variables each one does not record at all.")}
                  </p>
                </div>
                <aside className="side">
                  <p>
                    <b>{t("Missing is not zero.")}</b> {t("A variable that a table does not record is shown as a dash and listed as missing in Table 1. It lowers the grade from A to B; it is never treated as a measured value.")}
                  </p>
                </aside>
              </div>
            </Fold>

            <h2 className="sec">{t("3 · Coverage and gaps")}</h2>
            <Fold title={t("Figure {0} · Coverage and gaps", 3)} hint={t("comparable tests in each region; select a cell to move the scenario")}>
              <GapFigure figure={3} grid={r.grid} scenario={scenario} axes={axes} onAxes={setAxes} onPick={pick} />
            </Fold>
            <Fold title={t("Read the detail")} hint={t("What a gap means.")}>
              <div className="row">
                <div className="body">
                  <p>
                    {t("Figure 3 counts the comparable tests in each region of the two variables selected in Figure 1, next to the tests of other partitions in the same region. Table 2 lists every finding the rules produce for the scenario, with the records or")} {many(unit)} {t("that back each one.")}
                  </p>
                </div>
                <aside className="side">
                  <p>
                    <b>{t("What a gap means.")}</b> {t("An empty cell states that no comparable test was recorded there. It does not state what would happen under those conditions.")}
                  </p>
                </aside>
              </div>
            </Fold>
            <Fold title={t("Figure {0} · Evidence network", 4)} hint={t("how the scenario, its variables and the sources are linked")}>
              <KnowledgeGraph figure={4} scenario={scenario} />
            </Fold>
            <Fold title={t("Proposed scenario")} hint={t("isometric model and comparison against a baseline")}>
              <HabitatPanel scenario={scenario} />
            </Fold>
          </section>

          {/* 4 · Data, sources and methods: everything needed to check a number. */}
          <section className="sect" id="sec-sources" aria-labelledby="sources-title">
            <div className="sect-head">
              <h2 id="sources-title">{t("Data, sources and methods")}</h2>
              <p className="hint">{t("every value links to its source row and DOI")}</p>
            </div>
            <Fold title={t("Table 1 · Ranking of the {0} {1}", pack.studies.length, many(unit))} hint={t("grade, distance, nearest record, reason and DOI")}>
              <RankingTable results={r.ranking} scenario={scenario} />
            </Fold>
            <Fold title={t("Sources")} hint={t("Tables 3 and 4 · the {0} source tables and the ranking explained", pack.sources.length)}>
              <SourcesTable n={3} />
              <SourcesRanked n={4} ranking={r.ranking} closeness={r.close} scenario={scenario} />
            </Fold>
            <Fold title={t("Outcome data description")} hint={t("Table 5 · what the corpus records as results")}>
              <MLCard />
            </Fold>
            <Fold title={t("Compare two {0} side by side", many(unit))} hint={t("objective, conditions, values and source columns")}>
              <StudyCompare />
            </Fold>
            <Fold id="methods" title={t("Methods")} hint={t("Table 6 · partitions, distance, grades, levels and unit conversions")}>
              <div className="row">
                <div className="body">
                  <Methods tableN={6} />
                  <details className="noprint">
                    <summary>{t("Isometric apparatus diagram · ISS CIR / BASS Microgravity Combustion Chamber")}</summary>
                    <div className="methods-chamber-wrap">
                      <ChamberFigure interactive />
                    </div>
                  </details>
                </div>
                <aside className="side">
                  <p>
                    <b>{t("Reproducibility.")}</b> {t("All numbers on this page are computed in the browser from one evidence pack (")}{pack.contract}{t(") generated offline from the source tables; each table is identified by its SHA-256. The engine that computes grades, levels and findings contains no vocabulary of this corpus and is covered by test vectors on these data.")}
                  </p>
                </aside>
              </div>
            </Fold>
            <Fold title={t("References")} hint={t("datasets and their DOIs")}>
              <References />
            </Fold>
          </section>
        </div>

        <footer className="end">
          <span>{lens.footer}</span>
          <span>{lens.disclaimer}</span>
        </footer>
      </article>
      {prov && <Provenance id={prov} onClose={() => setProv(null)} />}
      {dossierOpen && (
        <DossierModal
          scenario={scenario}
          goal={goal}
          overall={r.overall}
          ranking={r.ranking}
          findings={r.finds}
          onClose={() => onDossier(false)}
        />
      )}
    </ProvCtx.Provider>
  );
}
