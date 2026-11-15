// Wording of the engine output. Templates are generic: every noun of the corpus comes from pack and lens.
import type { EvidenceLevel, Finding, Lens, OverallEvidence, Pack, Scenario, VariableEvidence, Why } from "../engine";
import { partitionOf, pool } from "../engine";
import { num, partitionName, partitionPhrase, plural, rangeText, scenarioValueText, studyShort, varOf } from "./format";
import type { NumVariable } from "../engine";

export const LEVELS: Record<EvidenceLevel, { label: string; icon: string; def: string }> = {
  studied: { label: "Studied", icon: "●", def: "The value is inside the tested range and records from at least the minimum number of studies cover it." },
  scarce: { label: "Scarce evidence", icon: "◐", def: "The value is inside the tested range, but fewer studies than the minimum cover it, or only flagged records do." },
  near: { label: "Near, not covered", icon: "◌", def: "The value is outside the tested range, closer to its edge than the reach (closeness reach × σ)." },
  not_studied: { label: "Not studied", icon: "○", def: "No comparable record carries the variable, or the value is farther from the tested range than the reach." },
};

export const OVERALL: Record<OverallEvidence["level"], string> = {
  strong: "strong (at least one study graded A)",
  partial: "partial (no study graded A, at least one graded B)",
  scarce: "scarce (no study graded better than C)",
  none: "absent (every study graded D)",
};

export const FINDING_LEVEL: Record<Finding["level"], string> = {
  attention: "Attention",
  caution: "Caution",
  context: "Context",
  support: "Support",
};

const unitWord = (lens: Lens) => lens.unit_of_study ?? "study";
/** lower-case a label only when it is an ordinary word (keeps symbols such as chemical formulas) */
export const lc = (s: string) => (/^[A-Z][a-z]+(\s|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export function findingText(pack: Pack, lens: Lens, f: Finding): string {
  const p = f.params;
  const v = f.variable ? varOf(pack, f.variable) : undefined;
  const V = v?.long ?? v?.label ?? "";
  const val = f.variable && p.value !== undefined ? scenarioValueText(pack, f.variable, p.value) : "";
  const where = partitionPhrase(pack, lens, (p.partition as string) || null);
  const u = p.unit ?? "";
  switch (f.code) {
    case "never_measured":
      return `${V} is not recorded in any of the ${p.n} comparable ${where}, so the proposed ${val} cannot be placed against them.`;
    case "above_tested":
      return `${V} of ${val} is ${num(p.delta as number)} ${p.delta_unit} above the highest value recorded in ${where}: ${num(p.max as number)} ${u} (${p.study}, test ${p.record}, row ${p.row}).`;
    case "below_tested":
      return `${V} of ${val} is ${num(p.delta as number)} ${p.delta_unit} below the lowest value recorded in ${where}: ${num(p.min as number)} ${u} (${p.study}, test ${p.record}, row ${p.row}).`;
    case "within_tested":
      return `${V} of ${val} lies inside the tested range ${num(p.min as number)}–${num(p.max as number)} ${u}; ${plural(p.n as number, "test")} from ${plural(p.studies as number, unitWord(lens))} cover it.`;
    case "tested_elsewhere":
      return `${plural(p.n as number, "test")} in other partitions (${String(p.partitions)
        .split(", ")
        .map((x) => partitionName(lens, x))
        .join(", ")}) cover ${lc(V)} of ${val}. They are not comparable with ${where} and are reported only as context.`;
    case "known_gap":
      return f.note?.text ?? `${V}: declared gap in the corpus.`;
    case "category_tested":
      return `${p.value} appears in ${plural(p.n as number, "test")} of ${plural(p.studies as number, unitWord(lens))} (${p.names}).`;
    case "category_untested":
      return `${p.value} does not appear in any of the ${p.n} comparable ${where}.`;
    case "no_evidence_variable":
      return `No record in the corpus carries ${lc(V)}.`;
    case "full_coverage":
      return `${plural(p.n as number, "test")} from ${plural(p.studies as number, unitWord(lens))} record every active variable of the scenario.`;
    case "quality_flags":
      return `${p.n} of ${p.of} comparable records of ${p.study}, the closest ${unitWord(lens)}, carry quality flags (${String(p.flags)
        .split(", ")
        .map((c) => pack.schema.flags?.[c]?.label ?? c)
        .join("; ")}).`;
    default:
      return f.code;
  }
}

export function findingTitle(pack: Pack, f: Finding): string {
  const v = f.variable ? varOf(pack, f.variable) : undefined;
  const V = v?.label ?? "";
  const names: Record<string, string> = {
    never_measured: `${V}: never recorded`,
    above_tested: `${V}: above the tested range`,
    below_tested: `${V}: below the tested range`,
    within_tested: `${V}: inside the tested range`,
    tested_elsewhere: `${V}: covered only in other partitions`,
    known_gap: `${V}: declared gap`,
    category_tested: `${V}: tested`,
    category_untested: `${V}: not tested`,
    no_evidence_variable: `${V}: no data`,
    full_coverage: "Tests with every variable",
    quality_flags: "Quality flags in the closest source",
  };
  return names[f.code] ?? f.code;
}

export function whyText(pack: Pack, lens: Lens, w: Why): string {
  switch (w.code) {
    case "out_of_range": {
      const v = varOf(pack, w.variable) as NumVariable;
      return `${v.label} ${num(w.value)} ${v.unit} outside tested ${rangeText(w.tested, v)}`;
    }
    case "category_untested":
      return `${w.value} not tested`;
    case "not_recorded":
      return `does not record ${w.variables.map((id) => lc(varOf(pack, id).label)).join(", ")}`;
    case "within_tested":
      return "inside the tested range";
    case "not_comparable":
      return `not comparable: ${w.has.map((x) => partitionName(lens, x)).join(", ") || "other partition"}`;
    case "no_records":
      return "no table of tests";
    case "no_common_variable":
      return "records none of the active numeric variables";
  }
}

export function levelBasis(pack: Pack, lens: Lens, e: VariableEvidence): string {
  const v = varOf(pack, e.variable);
  const u = v.type === "num" ? ` ${v.unit}` : "";
  const names = e.studies.map((s) => studyShort(pack, s)).join(", ");
  switch (e.reason) {
    case "never_recorded":
      return `0 of ${e.pool} comparable tests record ${lc(v.label)}.`;
    case "outside_near":
    case "outside_far":
      return `${num(e.gap ?? 0)} ${v.type === "num" ? (v.delta_unit ?? v.unit) : ""} ${(e.value as number) > (e.tested?.[1] ?? 0) ? "above" : "below"} the tested range ${rangeText(e.tested!)}${u} (${e.recorded} of ${e.pool} tests record it).`;
    case "covered":
      return `${plural(e.covering, "test")} in ${plural(e.studies.length, unitWord(lens))} (${names}) cover it.`;
    case "few_studies":
      return `${plural(e.covering, "test")} cover it, from ${plural(e.studies.length, unitWord(lens))} (${names}); the minimum is ${lens.evidence.min_studies}.`;
    case "flagged_only":
      return `Only flagged records cover it (${plural(e.covering, "test")}, ${names}).`;
    case "no_record_at_value":
      return `Inside the tested range ${rangeText(e.tested!)}${u}, but no single test covers this value.`;
    case "category_absent":
      return `0 of ${e.pool} comparable tests use it.`;
  }
}

export function abstractText(pack: Pack, lens: Lens, scenario: Scenario, overall: OverallEvidence, fs: Finding[]): string {
  const st = pack.meta.stats;
  const part = partitionOf(pack, scenario);
  const n = pool(pack, scenario).length;
  const parts = scenario.active
    .filter((id) => scenario.values[id] !== undefined && scenario.values[id] !== "")
      .map((id) => `${lc(varOf(pack, id).label)} ${scenarioValueText(pack, id, scenario.values[id])}`);
  const pv = part ? varOf(pack, part.variable) : null;
  const s1 = `This report places a proposed scenario (${parts.join("; ")}) against ${plural(st.tests ?? 0, "individual test")} and ${plural(st.campaigns ?? 0, "campaign row")} from ${plural(st.studies ?? 0, unitWord(lens))} (${pack.meta.source_note}).`;
  const s2 = part
    ? ` Records with a different ${lc(pv!.label)} are never compared with each other: the scenario falls in “${part.value}”${part.via !== part.variable ? ` (implied by its ${lc(varOf(pack, part.via).label)})` : ""}, which leaves ${n.toLocaleString("en-US")} comparable ${partitionPhrase(pack, lens, part.value)}.`
    : ` No partition could be inferred from the scenario, so all ${n.toLocaleString("en-US")} individual tests are compared.`;
  const c = overall.counts;
  const s3 = ` Overall evidence is ${OVERALL[overall.level].replace(/study/g, unitWord(lens))}: grades A ${c.A}, B ${c.B}, C ${c.C}, D ${c.D}.`;
  const top = fs.filter((f) => f.level === "attention" || f.level === "caution").slice(0, 3);
  const s4 = top.length ? " " + top.map((f) => findingText(pack, lens, f)).join(" ") : "";
  return s1 + s2 + s3 + s4;
}
