/** General-purpose units offered when a user names a variable of their own. Free text is still accepted. */
export const UNIT_GROUPS: { kind: string; units: string[] }[] = [
  { kind: "ratio", units: ["%", "ppm", "ppb", "mol/mol", "vol %", "wt %"] },
  { kind: "pressure", units: ["Pa", "kPa", "MPa", "bar", "mbar", "atm", "psi", "Torr", "mmHg"] },
  { kind: "temperature", units: ["K", "°C", "°F"] },
  { kind: "length", units: ["nm", "µm", "mm", "cm", "m", "km", "in", "ft"] },
  { kind: "area", units: ["mm²", "cm²", "m²"] },
  { kind: "volume", units: ["mL", "L", "cm³", "m³"] },
  { kind: "mass", units: ["mg", "g", "kg"] },
  { kind: "time", units: ["ms", "s", "min", "h", "d"] },
  { kind: "speed", units: ["mm/s", "cm/s", "m/s", "km/h"] },
  { kind: "acceleration", units: ["m/s²", "g"] },
  { kind: "flow", units: ["mL/min", "L/min", "m³/s", "g/s", "kg/s", "sccm", "slpm"] },
  { kind: "density", units: ["g/cm³", "kg/m³"] },
  { kind: "concentration", units: ["mol/L", "mol/m³", "mg/L", "g/m³"] },
  { kind: "energy", units: ["J", "kJ", "MJ", "cal", "kcal", "Wh", "kWh", "eV"] },
  { kind: "power", units: ["mW", "W", "kW", "MW"] },
  { kind: "heat flux", units: ["W/m²", "kW/m²", "W/cm²"] },
  { kind: "thermal", units: ["W/(m·K)", "J/(kg·K)", "kJ/kg", "MJ/kg"] },
  { kind: "force", units: ["N", "kN"] },
  { kind: "viscosity", units: ["Pa·s", "cP", "m²/s"] },
  { kind: "frequency", units: ["Hz", "kHz", "rpm"] },
  { kind: "electrical", units: ["V", "mV", "A", "mA", "Ω", "S/m"] },
  { kind: "angle", units: ["°", "rad"] },
  { kind: "light and radiation", units: ["lx", "cd", "W/sr", "Gy", "Sv"] },
  { kind: "amount", units: ["mol", "mmol", "count"] },
  { kind: "humidity", units: ["% RH", "g/kg"] },
  { kind: "none", units: ["dimensionless"] },
];

/** Units of the corpus first (tagged with the variable that uses them), then the general list, without repeats. */
export function unitOptions(corpus: { unit: string; label: string }[]): { unit: string; note: string }[] {
  const seen = new Set<string>();
  const out: { unit: string; note: string }[] = [];
  for (const c of corpus) {
    if (!c.unit || seen.has(c.unit)) continue;
    seen.add(c.unit);
    out.push({ unit: c.unit, note: `used in this corpus: ${c.label}` });
  }
  for (const g of UNIT_GROUPS)
    for (const u of g.units) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ unit: u, note: g.kind });
    }
  return out;
}
