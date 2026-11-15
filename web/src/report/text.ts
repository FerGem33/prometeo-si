// Wording of the engine output. Templates are generic: every noun of the corpus comes from pack and lens.
import type { EvidenceLevel, Finding, Lens, OverallEvidence, Pack, Scenario, VariableEvidence, Why } from "../engine";
import { partitionOf, pool } from "../engine";
import { num, partitionName, partitionPhrase, plural, rangeText, scenarioValueText, studyShort, varOf } from "./format";
import type { NumVariable } from "../engine";
import { t, tx, lazy, many } from "../i18n";

export const LEVELS: Record<EvidenceLevel, { label: string; icon: string; def: string }> = lazy({
  studied: { label: tx("Studied"), icon: "●", def: tx("The value is inside the tested range and records from at least the minimum number of studies cover it.") },
  scarce: { label: tx("Scarce evidence"), icon: "◐", def: tx("The value is inside the tested range, but fewer studies than the minimum cover it, or only flagged records do.") },
  near: { label: tx("Near, not covered"), icon: "◌", def: tx("The value is outside the tested range, closer to its edge than the reach (closeness reach × σ).") },
  not_studied: { label: tx("Not studied"), icon: "○", def: tx("No comparable record carries the variable, or the value is farther from the tested range than the reach.") },
});

const OVERALL: Record<OverallEvidence["level"], string> = {
  strong: tx("strong (at least one {0} graded A)"),
  partial: tx("partial (no {0} graded A, at least one graded B)"),
  scarce: tx("scarce (no {0} graded better than C)"),
  none: tx("absent (every {0} graded D)"),
};
/** Overall evidence in words; `unit` is the noun the corpus uses for its unit of study. */
export const overallText = (level: OverallEvidence["level"], unit: string = t("study")): string => t(OVERALL[level], unit);

const VERDICT: Record<OverallEvidence["level"], string> = {
  strong: tx("Grade A is reached by {0} of {1} {2}: a comparable record lies close to the scenario and no variable is missing."),
  partial: tx("No {3} is graded A. Grade B is reached by {0} of {1} {2}: inside the tested range, with missing variables or a larger distance."),
  scarce: tx("No {3} is graded better than C. Comparable records exist in {0} of {1} {2}, all outside the tested range of this scenario."),
  none: tx("None of the {1} {2} has records comparable with this scenario."),
};
/** The overall level as one plain sentence, from the grade counts alone. It states coverage; it never predicts an outcome. */
export function verdictText(overall: OverallEvidence, unit: string = t("study")): string {
  const c = overall.counts;
  const n = overall.level === "strong" ? c.A : overall.level === "partial" ? c.B : c.C;
  return t(VERDICT[overall.level], n, c.A + c.B + c.C + c.D, many(unit), unit);
}

export const FINDING_LEVEL: Record<Finding["level"], string> = lazy({
  attention: tx("Attention"),
  caution: tx("Caution"),
  context: tx("Context"),
  support: tx("Support"),
});

const unitWord = (lens: Lens) => lens.unit_of_study ?? "study";
/** lower-case a label only when it is an ordinary word (keeps symbols such as chemical formulas) */
export const lc = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(\s|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export function findingText(pack: Pack, lens: Lens, f: Finding): string {
  const p = f.params;
  const v = f.variable ? varOf(pack, f.variable) : undefined;
  const V = v?.long ?? v?.label ?? "";
  const val = f.variable && p.value !== undefined ? scenarioValueText(pack, f.variable, p.value) : "";
  const where = partitionPhrase(pack, lens, (p.partition as string) || null);
  const u = p.unit ?? "";
  switch (f.code) {
    case "never_measured":
      return t("{0} is not recorded in any of the {1} comparable {2}, so the proposed {3} cannot be placed against them.", V, p.n, where, val);
    case "above_tested":
      return t("{0} of {1} is {2} {3} above the highest value recorded in {4}: {5} {6} ({7}, test {8}, row {9}).", V, val, num(p.delta as number), p.delta_unit, where, num(p.max as number), u, p.study, p.record, p.row);
    case "below_tested":
      return t("{0} of {1} is {2} {3} below the lowest value recorded in {4}: {5} {6} ({7}, test {8}, row {9}).", V, val, num(p.delta as number), p.delta_unit, where, num(p.min as number), u, p.study, p.record, p.row);
    case "within_tested":
      return t("{0} of {1} lies inside the tested range {2}–{3} {4}; {5} from {6} cover it.", V, val, num(p.min as number), num(p.max as number), u, plural(p.n as number, "test"), plural(p.studies as number, unitWord(lens)));
    case "tested_elsewhere":
      return t("{0} in other partitions ({1}) cover {2} of {3}. They are not comparable with {4} and are reported only as context.", plural(p.n as number, "test"), String(p.partitions)
        .split(", ")
        .map((x) => partitionName(lens, x))
        .join(", "), lc(V), val, where);
    case "known_gap":
      return f.note?.text ?? t("{0}: declared gap in the corpus.", V);
    case "category_tested":
      return t("{0} appears in {1} of {2} ({3}).", p.value, plural(p.n as number, "test"), plural(p.studies as number, unitWord(lens)), p.names);
    case "category_untested":
      return t("{0} does not appear in any of the {1} comparable {2}.", p.value, p.n, where);
    case "no_evidence_variable":
      return t("No record in the corpus carries {0}.", lc(V));
    case "full_coverage":
      return t("{0} from {1} record every active variable of the scenario.", plural(p.n as number, "test"), plural(p.studies as number, unitWord(lens)));
    case "quality_flags":
      return t("{0} of {1} comparable records of {2}, the closest {3}, carry quality flags ({4}).", p.n, p.of, p.study, unitWord(lens), String(p.flags)
        .split(", ")
        .map((c) => pack.schema.flags?.[c]?.label ?? c)
        .join("; "));
    default:
      return f.code;
  }
}

export function findingTitle(pack: Pack, f: Finding): string {
  const v = f.variable ? varOf(pack, f.variable) : undefined;
  const V = v?.label ?? "";
  const names: Record<string, string> = {
    never_measured: t("{0}: never recorded", V),
    above_tested: t("{0}: above the tested range", V),
    below_tested: t("{0}: below the tested range", V),
    within_tested: t("{0}: inside the tested range", V),
    tested_elsewhere: t("{0}: covered only in other partitions", V),
    known_gap: t("{0}: declared gap", V),
    category_tested: t("{0}: tested", V),
    category_untested: t("{0}: not tested", V),
    no_evidence_variable: t("{0}: no data", V),
    full_coverage: t("Tests with every variable"),
    quality_flags: t("Quality flags in the closest source"),
  };
  return names[f.code] ?? f.code;
}

export function whyText(pack: Pack, lens: Lens, w: Why): string {
  switch (w.code) {
    case "out_of_range": {
      const v = varOf(pack, w.variable) as NumVariable;
      return t("{0} {1} {2} outside tested {3}", v.label, num(w.value), v.unit, rangeText(w.tested, v));
    }
    case "category_untested":
      return t("{0} not tested", w.value);
    case "not_recorded":
      return t("does not record {0}", w.variables.map((id) => lc(varOf(pack, id).label)).join(", "));
    case "within_tested":
      return t("inside the tested range");
    case "not_comparable":
      return t("not comparable: {0}", w.has.map((x) => partitionName(lens, x)).join(", ") || t("other partition"));
    case "no_records":
      return t("no table of tests");
    case "no_common_variable":
      return t("records none of the active numeric variables");
  }
}

export function levelBasis(pack: Pack, lens: Lens, e: VariableEvidence): string {
  const v = varOf(pack, e.variable);
  const u = v.type === "num" ? ` ${v.unit}` : "";
  const names = e.studies.map((s) => studyShort(pack, s)).join(", ");
  switch (e.reason) {
    case "never_recorded":
      return t("0 of {0} comparable tests record {1}.", e.pool, lc(v.label));
    case "outside_near":
    case "outside_far":
      return t(
        (e.value as number) > (e.tested?.[1] ?? 0)
          ? "{0} {1} above the tested range {2}{3} ({4} of {5} tests record it)."
          : "{0} {1} below the tested range {2}{3} ({4} of {5} tests record it).",
        num(e.gap ?? 0),
        v.type === "num" ? (v.delta_unit ?? v.unit) : "",
        rangeText(e.tested!),
        u,
        e.recorded,
        e.pool,
      );
    case "covered":
      return t("{0} in {1} ({2}) cover it.", plural(e.covering, "test"), plural(e.studies.length, unitWord(lens)), names);
    case "few_studies":
      return t("{0} cover it, from {1} ({2}); the minimum is {3}.", plural(e.covering, "test"), plural(e.studies.length, unitWord(lens)), names, lens.evidence.min_studies);
    case "flagged_only":
      return t("Only flagged records cover it ({0}, {1}).", plural(e.covering, "test"), names);
    case "no_record_at_value":
      return t("Inside the tested range {0}{1}, but no single test covers this value.", rangeText(e.tested!), u);
    case "category_absent":
      return t("0 of {0} comparable tests use it.", e.pool);
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
  const s1 = t("This report places a proposed scenario ({0}) against {1} and {2} from {3} ({4}).", parts.join("; "), plural(st.tests ?? 0, "individual test"), plural(st.campaigns ?? 0, "campaign row"), plural(st.studies ?? 0, unitWord(lens)), pack.meta.source_note);
  const s2 = part
    ? t(" Records with a different {0} are never compared with each other: the scenario falls in “{1}”{2}, which leaves {3} comparable {4}.", lc(pv!.label), part.value, part.via !== part.variable ? t(" (implied by its {0})", lc(varOf(pack, part.via).label)) : "", n.toLocaleString("en-US"), partitionPhrase(pack, lens, part.value))
    : t(" No partition could be inferred from the scenario, so all {0} individual tests are compared.", n.toLocaleString("en-US"));
  const c = overall.counts;
  const s3 = t(" Overall evidence is {0}: grades A {1}, B {2}, C {3}, D {4}.", overallText(overall.level, unitWord(lens)), c.A, c.B, c.C, c.D);
  const top = fs.filter((f) => f.level === "attention" || f.level === "caution").slice(0, 3);
  const s4 = top.length ? " " + top.map((f) => findingText(pack, lens, f)).join(" ") : "";
  return s1 + s2 + s3 + s4;
}
