import { t, tx, lazy } from "../i18n";

export type ReportTab = "summary" | "evidence" | "data";

/** The three layers of the report: the answer, the figures behind it, and the tables and methods needed to check it. */
export const REPORT_TABS: { id: ReportTab; label: string; what: string }[] = lazy([
  { id: "summary", label: tx("Summary"), what: tx("answer and key findings") },
  { id: "evidence", label: tx("Evidence"), what: tx("Figures 1–4") },
  { id: "data", label: tx("Data and methods"), what: tx("Tables 1–6") },
]);

/** The tabs of the report and its actions (passed as children). The bar stays in view while the page scrolls. */
export function ReportTabs({ tab, onTab, children }: { tab: ReportTab; onTab: (tab: ReportTab) => void; children?: React.ReactNode }) {
  return (
    <div className="secnav noprint">
      <div className="tabs" role="tablist" aria-label={t("Report sections")}>
        {REPORT_TABS.map((x, i) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} onClick={() => onTab(x.id)}>
            <span className="secnav-n">{i + 1}</span> {x.label} <small>· {x.what}</small>
          </button>
        ))}
      </div>
      <div className="secnav-actions">{children}</div>
    </div>
  );
}

/** One tab of the report. Every panel stays in the page, so the printed report and the guided tour reach all of them. */
export function TabPanel({ id, tab, children }: { id: ReportTab; tab: ReportTab; children: React.ReactNode }) {
  return (
    <div className="tabpanel" role="tabpanel" id={`panel-${id}`} data-tab={id} aria-labelledby={`tab-${id}`} hidden={tab !== id}>
      {children}
    </div>
  );
}

/** The step to the next tab, at the foot of a panel. */
export function NextTab({ to, onTab, children }: { to: ReportTab; onTab: (tab: ReportTab) => void; children: React.ReactNode }) {
  const next = REPORT_TABS.find((x) => x.id === to)!;
  return (
    <p className="nexttab noprint">
      <span>{children}</span>
      <button type="button" className="link" onClick={() => onTab(to)}>
        {t("Go to {0} · {1}", next.label, next.what)}
      </button>
    </p>
  );
}
