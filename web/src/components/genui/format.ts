/** Number formatting shared by the modules that show values of any variable. */
import { num } from "../../report/format";

/** Compact number: three decimals below 1, one from 100 up, two otherwise. */
export function fmt(v: number): string {
  const a = Math.abs(v);
  return num(v, a !== 0 && a < 1 ? 3 : a >= 100 ? 1 : 2);
}

/** "label (unit)" or the label alone. */
export function labelUnit(label: string, unit: string | null | undefined): string {
  return unit ? `${label} (${unit})` : label;
}
