/**
 * RFC-4180 compliant CSV / TSV / JSON parser with automatic unit detection and column profiling.
 * Conforms to D3 limits and ingest types.
 */

import { UNIT_GROUPS } from "../report/units";
import type {
  DetectedColumn,
  ParsedRow,
  ParsedTableResult,
  SupportedMediaType,
} from "./types";

/**
 * Common unit aliases mapped to their canonical representation.
 */
const UNIT_ALIASES: Record<string, string> = {
  "deg c": "°C",
  degc: "°C",
  "° c": "°C",
  "deg f": "°F",
  degf: "°F",
  "° f": "°F",
  sec: "s",
  second: "s",
  seconds: "s",
  pct: "%",
  percent: "%",
  percentage: "%",
};

/**
 * Build lookup sets of known unit symbols from UNIT_GROUPS.
 */
let knownUnitsCache: { exact: Set<string>; lowerMap: Map<string, string> } | null =
  null;

function getKnownUnits(): { exact: Set<string>; lowerMap: Map<string, string> } {
  if (knownUnitsCache) return knownUnitsCache;

  const exact = new Set<string>();
  const lowerMap = new Map<string, string>();

  try {
    for (const group of UNIT_GROUPS) {
      if (!group || !Array.isArray(group.units)) continue;
      for (const unit of group.units) {
        if (typeof unit === "string" && unit.trim()) {
          const trimmed = unit.trim();
          exact.add(trimmed);
          lowerMap.set(trimmed.toLowerCase(), trimmed);
        }
      }
    }
  } catch {
    // Fallback if UNIT_GROUPS cannot be resolved
  }

  // Seed essential units if empty
  const defaultUnits = [
    "%", "ppm", "ppb", "Pa", "kPa", "MPa", "bar", "mbar", "atm", "psi",
    "Torr", "mmHg", "K", "°C", "°F", "nm", "µm", "mm", "cm", "m", "km",
    "in", "ft", "mm²", "cm²", "m²", "mL", "L", "cm³", "m³", "mg", "g",
    "kg", "ms", "s", "min", "h", "d", "mm/s", "cm/s", "m/s", "km/h",
    "m/s²", "mL/min", "L/min", "g/cm³", "kg/m³", "mol/L", "mol/m³", "mg/L",
    "J", "kJ", "MJ", "cal", "kcal", "Wh", "kWh", "eV", "mW", "W", "kW",
    "MW", "N", "kN", "Hz", "kHz", "rpm", "V", "mV", "A", "mA", "Ω", "rad",
  ];
  for (const u of defaultUnits) {
    exact.add(u);
    lowerMap.set(u.toLowerCase(), u);
  }

  // Register aliases
  for (const [alias, canonical] of Object.entries(UNIT_ALIASES)) {
    lowerMap.set(alias.toLowerCase(), canonical);
  }

  knownUnitsCache = { exact, lowerMap };
  return knownUnitsCache;
}

/**
 * Detects whether a header contains a unit specification matching known units.
 * Supports:
 * - "Oxygen (%)" -> { label: "Oxygen", unit: "%" }
 * - "Pressure [kPa]" -> { label: "Pressure", unit: "kPa" }
 * - "Temperature, K" -> { label: "Temperature", unit: "K" }
 */
export function splitHeaderUnit(header: string): {
  label: string;
  unit: string | null;
} {
  const trimmed = header.trim();
  if (!trimmed) {
    return { label: "", unit: null };
  }

  const { exact, lowerMap } = getKnownUnits();

  // Pattern 1: (unit) at end
  const parenMatch = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (parenMatch) {
    const candidate = parenMatch[2].trim();
    const resolved = exact.has(candidate)
      ? candidate
      : lowerMap.get(candidate.toLowerCase());
    if (resolved) {
      return { label: parenMatch[1].trim(), unit: resolved };
    }
  }

  // Pattern 2: [unit] at end
  const bracketMatch = trimmed.match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/);
  if (bracketMatch) {
    const candidate = bracketMatch[2].trim();
    const resolved = exact.has(candidate)
      ? candidate
      : lowerMap.get(candidate.toLowerCase());
    if (resolved) {
      return { label: bracketMatch[1].trim(), unit: resolved };
    }
  }

  // Pattern 3: , unit at end
  const commaMatch = trimmed.match(/^(.*?)\s*,\s*([^,]+)\s*$/);
  if (commaMatch) {
    const candidate = commaMatch[2].trim();
    const resolved = exact.has(candidate)
      ? candidate
      : lowerMap.get(candidate.toLowerCase());
    if (resolved) {
      return { label: commaMatch[1].trim(), unit: resolved };
    }
  }

  return { label: trimmed, unit: null };
}

/**
 * Auto-detects the delimiter (comma, tab, or semicolon) from CSV text.
 */
export function detectDelimiter(text: string): string {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let inQuotes = false;
  let commas = 0;
  let tabs = 0;
  let semis = 0;
  let lineCount = 0;

  for (let i = 0; i < clean.length && lineCount < 5; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < clean.length && clean[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === ",") commas++;
      else if (ch === "\t") tabs++;
      else if (ch === ";") semis++;
      else if (ch === "\n") {
        lineCount++;
      }
    }
  }

  if (tabs > 0 && tabs >= commas && tabs >= semis) return "\t";
  if (semis > 0 && semis > commas) return ";";
  return ",";
}

/**
 * Parses RFC-4180 CSV / TSV text.
 * Row numbers start at 2 (row 1 is headers).
 */
export function parseCsvText(
  text: string,
  delimiter?: string
): { headers: string[]; rows: ParsedRow[] } {
  if (!text || !text.trim()) {
    throw new Error("Empty CSV input: string is empty or contains only whitespace");
  }

  let clean = text;
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1);
  }

  const delim = delimiter ?? detectDelimiter(clean);

  const rows: ParsedRow[] = [];
  let headers: string[] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let rowNumber = 2; // Data row numbering starts at 2
  let atStartOfField = true;

  const len = clean.length;
  let i = 0;

  while (i < len) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && clean[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        if (atStartOfField || currentCell.trim() === "") {
          inQuotes = true;
          atStartOfField = false;
          i++;
          continue;
        } else {
          currentCell += ch;
          i++;
          continue;
        }
      } else if (ch === delim) {
        currentRow.push(currentCell);
        currentCell = "";
        atStartOfField = true;
        i++;
        continue;
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && i + 1 < len && clean[i + 1] === "\n") {
          i += 2;
        } else {
          i++;
        }

        currentRow.push(currentCell);
        currentCell = "";
        atStartOfField = true;

        if (headers.length === 0) {
          headers = currentRow.map((h) => h.trim());
          currentRow = [];
        } else {
          const isEmptyRow =
            currentRow.length === 1 && currentRow[0].trim() === "";
          if (!isEmptyRow) {
            rows.push({ row: rowNumber++, values: currentRow });
          }
          currentRow = [];
        }
        continue;
      } else {
        currentCell += ch;
        atStartOfField = false;
        i++;
        continue;
      }
    }
  }

  if (inQuotes) {
    throw new Error("Unclosed quote in CSV input");
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (headers.length === 0) {
      headers = currentRow.map((h) => h.trim());
    } else {
      const isEmptyRow =
        currentRow.length === 1 && currentRow[0].trim() === "";
      if (!isEmptyRow) {
        rows.push({ row: rowNumber++, values: currentRow });
      }
    }
  }

  if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) {
    throw new Error("CSV input contains no headers or table data");
  }

  return { headers, rows };
}

/**
 * Parses JSON table text (array of objects or wrapped records).
 * Row numbers start at 2 (header is logical row 1).
 */
export function parseJsonTableText(text: string): {
  headers: string[];
  rows: ParsedRow[];
} {
  if (!text || !text.trim()) {
    throw new Error("Empty JSON input");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON table: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Handle explicit { headers: [...], rows: [...] }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.headers) && Array.isArray(obj.rows)) {
      const headers = obj.headers.map((h) => String(h).trim());
      const rows: ParsedRow[] = obj.rows.map((r, idx) => ({
        row: idx + 2,
        values: Array.isArray(r)
          ? r.map((v) => (v === null || v === undefined ? "" : String(v)))
          : [],
      }));
      return { headers, rows };
    }
  }

  let records: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.records)) {
      records = obj.records;
    } else if (Array.isArray(obj.data)) {
      records = obj.data;
    } else if (Array.isArray(obj.rows)) {
      records = obj.rows;
    } else if (Array.isArray(obj.items)) {
      records = obj.items;
    } else {
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          records = obj[key] as unknown[];
          break;
        }
      }
    }
  }

  if (!records || !Array.isArray(records)) {
    throw new Error("JSON input does not contain a tabular array or records");
  }

  if (records.length === 0) {
    throw new Error("JSON table contains no records");
  }

  const headerSet = new Set<string>();
  for (const item of records) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        headerSet.add(key);
      }
    }
  }

  const headers = Array.from(headerSet);
  if (headers.length === 0) {
    throw new Error("JSON table contains no valid object keys for headers");
  }

  const rows: ParsedRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    const rowObj =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const values = headers.map((h) => {
      const val = rowObj[h];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });
    rows.push({ row: i + 2, values });
  }

  return { headers, rows };
}

/**
 * Profiles columns to detect types (numeric vs categorical), units, and summary statistics.
 */
function profileColumns(headers: string[], rows: ParsedRow[]): DetectedColumn[] {
  return headers.map((header, colIdx) => {
    const { label, unit } = splitHeaderUnit(header);

    let nonEmptyCount = 0;
    let numericCount = 0;
    const numericValues: number[] = [];
    const frequencyMap = new Map<string, number>();
    const sampleCells: { row: number; raw: string }[] = [];

    for (const row of rows) {
      const raw = colIdx < row.values.length ? row.values[colIdx] : "";
      const trimmed = raw.trim();

      if (trimmed !== "") {
        nonEmptyCount++;
        frequencyMap.set(trimmed, (frequencyMap.get(trimmed) ?? 0) + 1);

        if (sampleCells.length < 5) {
          sampleCells.push({ row: row.row, raw });
        }

        let num = Number(trimmed);
        if (isNaN(num) && /^-?\d+,\d+$/.test(trimmed)) {
          num = Number(trimmed.replace(",", "."));
        }

        if (!isNaN(num) && isFinite(num)) {
          numericCount++;
          numericValues.push(num);
        }
      }
    }

    const isNumeric =
      nonEmptyCount > 0 && numericCount / nonEmptyCount >= 0.75;

    const column: DetectedColumn = {
      name: header,
      label,
      unit,
      type: isNumeric ? "numeric" : "categorical",
      nonEmptyCount,
      numericCount,
      sampleCells,
    };

    if (isNumeric && numericValues.length > 0) {
      let min = numericValues[0];
      let max = numericValues[0];
      for (let i = 1; i < numericValues.length; i++) {
        const val = numericValues[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      column.min = min;
      column.max = max;

      const sorted = [...numericValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      column.median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
    } else {
      column.categories = Array.from(frequencyMap.keys()).slice(0, 50);

      let mode: string | undefined;
      let maxFreq = 0;
      for (const [val, freq] of frequencyMap.entries()) {
        if (freq > maxFreq) {
          maxFreq = freq;
          mode = val;
        }
      }
      if (mode !== undefined) {
        column.mode = mode;
      }
    }

    return column;
  });
}

/**
 * Parses a tabular file (CSV, TSV, or JSON) from raw bytes into a ParsedTableResult.
 */
export function parseTabularDocument(
  name: string,
  bytes: Uint8Array,
  mediaType: SupportedMediaType
): ParsedTableResult {
  if (mediaType === "application/pdf") {
    throw new Error(
      `PDF documents are not supported by parseTabularDocument: ${name}`
    );
  }

  if (
    mediaType !== "text/csv" &&
    mediaType !== "text/tab-separated-values" &&
    mediaType !== "application/json"
  ) {
    throw new Error(`Unsupported media type: ${mediaType} for file: ${name}`);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("iso-8859-1").decode(bytes);
  }

  let headers: string[];
  let rows: ParsedRow[];
  let delimiter: string | undefined;

  if (mediaType === "application/json") {
    const res = parseJsonTableText(text);
    headers = res.headers;
    rows = res.rows;
    delimiter = undefined;
  } else if (mediaType === "text/tab-separated-values") {
    const res = parseCsvText(text, "\t");
    headers = res.headers;
    rows = res.rows;
    delimiter = "\t";
  } else {
    // text/csv
    delimiter = detectDelimiter(text);
    const res = parseCsvText(text, delimiter);
    headers = res.headers;
    rows = res.rows;
  }

  const columns = profileColumns(headers, rows);

  return {
    headers,
    rows,
    columns,
    delimiter,
  };
}
