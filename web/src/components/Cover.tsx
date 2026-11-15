import { useData } from "./ctx";

const HOW: [string, string][] = [
  ["Bring your papers", "Reports, articles and experiment tables on any subject. Prometeo reads them and keeps the source of every value."],
  ["Describe your case", "Say what you want to do and set the conditions you have in mind. Start from a ready-made setting or from scratch."],
  ["Read the evidence", "See what has been studied under your conditions, how close it comes, and where nobody has looked. Every figure links to its source."],
];

/**
 * Landing in article style. The hero fits one viewport; the explanation follows below.
 * Product copy is subject-agnostic; the example corpus is described only from lens and pack.
 */
export function Cover({ onStart, onDemo, onWorkspace }: { onStart: () => void; onDemo: () => void; onWorkspace: () => void }) {
  const { pack, lens } = useData();
  const unit = lens.unit_of_study ?? "study";
  const s = pack.meta.stats;
  const facts: [string, string][] = [
    [String(pack.studies.length), `${unit}s`],
    [(s.tests ?? 0).toLocaleString("en-US"), `individual ${lens.subject ?? "tests"}`],
    [String(s.publications ?? 0), "linked publications"],
    [String(s.sources ?? 0), "source tables, each with a checksum"],
  ];
  return (
    <div className="screen cover">
      <section className="hero">
        <header className="screen-bar">
          <span>
            <b>Prometeo</b> · Evidence portals
          </span>
          <span className="bar-links">
            <button type="button" className="linkbtn" onClick={onWorkspace}>
              Workspace
            </button>
            <a href="#how" className="linkbtn">
              How it works
            </a>
          </span>
        </header>
        <div className="hero-body">
          <img className="cover-logo" src="/logo-mark-float-512.png" alt="Prometeo emblem" width={220} height={220} />
          <p className="cover-kicker">From papers to a portal of cited knowledge</p>
          <h1 className="cover-title">Know what the literature already shows about your idea</h1>
          <p className="cover-lede">
            Bring your papers and say what you want to do. Prometeo builds a portal around it: what has been studied under your conditions, how solid it is, and where nobody has looked.
          </p>
          <div className="cover-ctas">
            <button type="button" className="cta big" onClick={onStart} autoFocus>
              Begin evaluation
            </button>
            <button type="button" className="ghostbtn big" onClick={onDemo}>
              See the example report
            </button>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <h2>How it works</h2>
        <ol>
          {HOW.map(([t, d], i) => (
            <li key={t}>
              <i>{i + 1}</i>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="example">
        <h2>The example corpus in this demo</h2>
        <p>{lens.byline}.</p>
        <dl className="cover-facts">
          {facts.map(([n, label]) => (
            <div key={label}>
              <dt>{n}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
        <div className="cover-ctas">
          <button type="button" className="cta" onClick={onStart}>
            Begin evaluation
          </button>
        </div>
      </section>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
