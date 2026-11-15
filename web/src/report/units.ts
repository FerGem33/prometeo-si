import { t, tx, lazy } from "../i18n";
/** General-purpose units offered when a user names a variable of their own. Free text is still accepted. */
export const UNIT_GROUPS: { kind: string; units: string[] }[] = lazy([
  { kind: tx("ratio"), units: ["%", "ppm", "ppb", "mol/mol", tx("vol %"), tx("wt %")] },
  { kind: tx("pressure"), units: ["Pa", "kPa", "MPa", "bar", "mbar", "atm", "psi", "Torr", "mmHg"] },
  { kind: tx("temperature"), units: ["K", "°C", "°F"] },
  { kind: tx("length"), units: ["nm", "µm", "mm", "cm", "m", "km", "in", "ft"] },
  { kind: tx("area"), units: ["mm²", "cm²", "m²"] },
  { kind: tx("volume"), units: ["mL", "L", "cm³", "m³"] },
  { kind: tx("mass"), units: ["mg", "g", "kg"] },
  { kind: tx("time"), units: ["ms", "s", "min", "h", "d"] },
  { kind: tx("speed"), units: ["mm/s", "cm/s", "m/s", "km/h"] },
  { kind: tx("acceleration"), units: ["m/s²", "g"] },
  { kind: tx("flow"), units: ["mL/min", "L/min", "m³/s", "g/s", "kg/s", "sccm", "slpm"] },
  { kind: tx("density"), units: ["g/cm³", "kg/m³"] },
  { kind: tx("concentration"), units: ["mol/L", "mol/m³", "mg/L", "g/m³"] },
  { kind: tx("energy"), units: ["J", "kJ", "MJ", "cal", "kcal", "Wh", "kWh", "eV"] },
  { kind: tx("power"), units: ["mW", "W", "kW", "MW"] },
  { kind: tx("heat flux"), units: ["W/m²", "kW/m²", "W/cm²"] },
  { kind: tx("thermal"), units: ["W/(m·K)", "J/(kg·K)", "kJ/kg", "MJ/kg"] },
  { kind: tx("force"), units: ["N", "kN"] },
  { kind: tx("viscosity"), units: ["Pa·s", "cP", "m²/s"] },
  { kind: tx("frequency"), units: ["Hz", "kHz", "rpm"] },
  { kind: tx("electrical"), units: ["V", "mV", "A", "mA", "Ω", "S/m"] },
  { kind: tx("angle"), units: ["°", "rad"] },
  { kind: tx("light and radiation"), units: ["lx", "cd", "W/sr", "Gy", "Sv"] },
  { kind: tx("amount"), units: ["mol", "mmol", "count"] },
  { kind: tx("humidity"), units: [tx("% RH"), "g/kg"] },
  { kind: tx("none"), units: ["dimensionless"] },
]);

/** Units of the corpus first (tagged with the variable that uses them), then the general list, without repeats. */
export function unitOptions(corpus: { unit: string; label: string }[]): { unit: string; note: string }[] {
  const seen = new Set<string>();
  const out: { unit: string; note: string }[] = [];
  for (const c of corpus) {
    if (!c.unit || seen.has(c.unit)) continue;
    seen.add(c.unit);
    out.push({ unit: c.unit, note: t("used in this corpus: {0}", c.label) });
  }
  for (const g of UNIT_GROUPS)
    for (const u of g.units) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ unit: u, note: g.kind });
    }
  return out;
}
