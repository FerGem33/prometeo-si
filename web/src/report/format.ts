import type { DataRecord, Lens, NumVariable, Pack, Range, Variable } from "../engine";
import { count, t } from "../i18n";

export const num = (x: number, digits = 2): string => {
  const r = Math.round(x * 10 ** digits) / 10 ** digits;
  return String(r);
};

export const varOf = (pack: Pack, id: string): Variable => pack.schema.variables.find((v) => v.id === id)!;

export const unitOf = (v: Variable): string => (v.type === "num" ? v.unit : "");

/** "30 %" / "0.69 atm" */
export const withUnit = (x: number, v: NumVariable): string => `${num(x)} ${v.unit}`;

/** "0.69 atm (10.2 psi)" when the variable declares display units. */
export const withAlt = (x: number, v: NumVariable): string => {
  const alt = v.display_units?.[0];
  return alt ? `${withUnit(x, v)} (${num(x * alt.factor, 1)} ${alt.unit})` : withUnit(x, v);
};

export const rangeText = (r: Range, v?: NumVariable): string =>
  (r[0] === r[1] ? num(r[0]) : `${num(r[0])}–${num(r[1])}`) + (v ? ` ${v.unit}` : "");

export const valueText = (rec: DataRecord, v: Variable): string => {
  const x = rec.values[v.id];
  if (x === undefined) return "—";
  return Array.isArray(x) ? rangeText(x, v as NumVariable) : x;
};

export const scenarioValueText = (pack: Pack, id: string, x: number | string): string => {
  const v = varOf(pack, id);
  return v.type === "num" && typeof x === "number" ? withAlt(x, v) : String(x);
};

/** "tests on solid fuels" or a generic fallback built from the schema. */
export const partitionPhrase = (pack: Pack, lens: Lens, value: string | null | undefined): string => {
  if (!value) return t("tests");
  const label = lens.partition_labels?.[value];
  if (label) return t("tests on {0}", label);
  const pv = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  return t("tests with {0} “{1}”", pv?.label.toLowerCase() ?? t("partition"), value);
};

export const partitionName = (lens: Lens, value: string): string => lens.partition_labels?.[value] ?? value;

/** "1 test" / "12 tests", inflected in the language of the interface. */
export const plural = count;

export const studyShort = (pack: Pack, id: string): string => pack.studies.find((s) => s.id === id)?.short ?? id;

export const doiOf = (pack: Pack, studyId: string): { url: string; label: string } | null => {
  const l = pack.studies.find((s) => s.id === studyId)?.links.find((x) => x.kind === "doi");
  return l ? { url: l.url, label: l.label ?? l.url } : null;
};
