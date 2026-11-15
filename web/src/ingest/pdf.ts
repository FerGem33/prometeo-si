/**
 * PDF Text Layer Extractor & Paper Measurement/Citation Parser.
 * Conforms to D3 limits and ingest types.
 */

// Defensive polyfills for modern ECMAScript proposals used by pdfjs-dist v6 in Node/Vitest
if (typeof (Promise as any).try !== "function") {
  (Promise as any).try = function <T>(
    fn: (...args: any[]) => T,
    ...args: any[]
  ): Promise<T> {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof (Uint8Array.prototype as any).toHex !== "function") {
  (Uint8Array.prototype as any).toHex = function (): string {
    return Array.from(this as Uint8Array)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  };
}

if (typeof (Map.prototype as any).getOrInsertComputed !== "function") {
  (Map.prototype as any).getOrInsertComputed = function <K, V>(
    key: K,
    callback: (key: K) => V
  ): V {
    if (this.has(key)) return this.get(key)!;
    const val = callback(key);
    this.set(key, val);
    return val;
  };
}

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { UNIT_GROUPS } from "../report/units";
import {
  D3_LIMITS,
  type DocErrorCode,
  type ParsedPage,
  type ParsedPaperFinding,
  type ParsedPaperResult,
} from "./types";

// Configure worker URL in browser environments with bundled worker (zero external CDN requests)
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

/**
 * Custom error carrying DocErrorCode.
 */
export class PdfDocError extends Error {
  readonly code: DocErrorCode;

  constructor(code: DocErrorCode, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.name = "PdfDocError";
    this.code = code;
  }
}

/**
 * Common scientific & engineering units lookup table.
 */
const CANONICAL_UNITS: Record<string, string> = {
  "deg c": "°C",
  degc: "°C",
  "° c": "°C",
  "deg f": "°F",
  degf: "°F",
  "° f": "°F",
  sec: "s",
  second: "s",
  seconds: "s",
  hr: "h",
  hour: "h",
  hours: "h",
  pct: "%",
  percent: "%",
  percentage: "%",
  m: "M", // when used as molar concentration
  um: "µm",
  ul: "µL",
  ug: "µg",
  umol: "µmol",
  "kw/m2": "kW/m²",
  "w/m2": "W/m²",
  "w/(m*k)": "W/(m·K)",
  "w/(m·k)": "W/(m·K)",
  "w/mk": "W/(m·K)",
  mm2: "mm²",
  cm2: "cm²",
  m2: "m²",
  cm3: "cm³",
  m3: "m³",
};

let cachedKnownUnits: { exact: Set<string>; lowerMap: Map<string, string> } | null =
  null;

function getKnownUnits(): { exact: Set<string>; lowerMap: Map<string, string> } {
  if (cachedKnownUnits) return cachedKnownUnits;

  const exact = new Set<string>();
  const lowerMap = new Map<string, string>();

  // Base list of scientific units
  const baseUnits = [
    "%", "ppm", "ppb", "mol/mol", "vol %", "wt %", "vol%", "wt%", "at%", "at %",
    "Pa", "hPa", "kPa", "MPa", "GPa", "bar", "mbar", "atm", "psi", "Torr", "mmHg",
    "K", "°C", "°F",
    "nm", "µm", "mm", "cm", "m", "km", "in", "ft", "Å",
    "mm²", "cm²", "m²",
    "mL", "L", "cm³", "m³", "µL",
    "mg", "g", "kg", "µg", "ng",
    "ms", "s", "min", "h", "d",
    "mm/s", "cm/s", "m/s", "km/h",
    "m/s²", "g",
    "mL/min", "L/min", "m³/s", "g/s", "kg/s", "sccm", "slpm",
    "g/cm³", "kg/m³",
    "M", "mM", "µM", "nM", "pM", "mol/L", "mol/m³", "mg/L", "g/m³",
    "J", "kJ", "MJ", "cal", "kcal", "Wh", "kWh", "eV", "meV", "keV", "MeV",
    "mW", "W", "kW", "MW",
    "W/m²", "kW/m²", "W/cm²",
    "W/(m·K)", "J/(kg·K)", "kJ/kg", "MJ/kg",
    "N", "kN",
    "Pa·s", "cP", "m²/s",
    "Hz", "kHz", "MHz", "GHz", "rpm",
    "V", "mV", "kV", "A", "mA", "µA", "Ω", "kΩ", "MΩ", "S/m",
    "°", "rad", "lx", "cd", "W/sr", "Gy", "Sv",
    "mol", "mmol", "µmol",
    "% RH",
  ];

  for (const u of baseUnits) {
    exact.add(u);
    lowerMap.set(u.toLowerCase(), u);
  }

  // Add UNIT_GROUPS if available
  try {
    for (const group of UNIT_GROUPS) {
      if (!group?.units) continue;
      for (const u of group.units) {
        if (typeof u === "string" && u.trim()) {
          const trimmed = u.trim();
          exact.add(trimmed);
          lowerMap.set(trimmed.toLowerCase(), trimmed);
        }
      }
    }
  } catch {
    // Continue with baseUnits if lazy evaluation fails
  }

  // Register canonical aliases
  for (const [alias, canonical] of Object.entries(CANONICAL_UNITS)) {
    lowerMap.set(alias.toLowerCase(), canonical);
  }

  cachedKnownUnits = { exact, lowerMap };
  return cachedKnownUnits;
}

/**
 * Extracts raw page text from a PDF document Uint8Array buffer using pdfjs-dist.
 * Enforces D3 maxPages limit and non-empty text layer check.
 */
export async function extractPdfPages(
  bytes: Uint8Array
): Promise<{ pages: ParsedPage[]; pageCount: number; metadataTitle?: string }> {
  if (!bytes || bytes.length === 0) {
    throw new PdfDocError("unreadable", "PDF byte buffer is empty");
  }

  if (bytes.byteLength > D3_LIMITS.maxBytes) {
    throw new PdfDocError(
      "too_large",
      `PDF size of ${bytes.byteLength} bytes exceeds limit of ${D3_LIMITS.maxBytes} bytes`
    );
  }

  let doc: pdfjs.PDFDocumentProxy;
  let loadingTask: any;
  try {
    // Clone input buffer so PDF.js worker transfer cannot detach the caller's bytes (needed for IndexedDB storage in browsers)
    loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      useWorkerFetch: false,
    });
    doc = await loadingTask.promise;
    if (typeof (doc as any).destroy !== "function" && typeof loadingTask?.destroy === "function") {
      (doc as any).destroy = () => loadingTask.destroy();
    }
  } catch (err) {
    throw new PdfDocError(
      "unreadable",
      err instanceof Error ? err.message : "Failed to parse PDF document"
    );
  }

  try {
    const pageCount = doc.numPages;
    if (pageCount > D3_LIMITS.maxPages) {
      throw new PdfDocError(
        "too_many_pages",
        `PDF has ${pageCount} pages, which exceeds the limit of ${D3_LIMITS.maxPages}`
      );
    }

    if (pageCount === 0) {
      throw new PdfDocError("no_text_layer", "PDF has 0 pages");
    }

    let metadataTitle: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const infoTitle = (meta?.info as Record<string, unknown> | undefined)?.Title;
      if (typeof infoTitle === "string" && infoTitle.trim()) {
        metadataTitle = infoTitle.trim();
      }
    } catch {
      // Ignore metadata extraction failure
    }

    const pages: ParsedPage[] = [];
    let totalNonWhitespaceChars = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      interface RawTextItem {
        str: string;
        x: number;
        y: number;
        width: number;
        hasEOL: boolean;
      }

      const items: RawTextItem[] = [];
      for (const it of textContent.items) {
        if ("str" in it && typeof it.str === "string") {
          const transform = it.transform || [0, 0, 0, 0, 0, 0];
          items.push({
            str: it.str,
            x: transform[4] ?? 0,
            y: transform[5] ?? 0,
            width: it.width ?? 0,
            hasEOL: Boolean(it.hasEOL),
          });
        }
      }

      // Sort items top-to-bottom (descending y), then left-to-right (ascending x)
      items.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) {
          return yDiff;
        }
        return a.x - b.x;
      });

      let pageText = "";
      let prevY: number | null = null;
      let prevXEnd: number | null = null;

      for (const item of items) {
        if (!item.str && !item.hasEOL) continue;

        if (prevY !== null && Math.abs(prevY - item.y) > 3) {
          if (!pageText.endsWith("\n")) {
            pageText += "\n";
          }
        } else if (
          prevXEnd !== null &&
          !pageText.endsWith(" ") &&
          !pageText.endsWith("\n") &&
          !item.str.startsWith(" ")
        ) {
          if (item.x - prevXEnd > 2) {
            pageText += " ";
          }
        }

        pageText += item.str;
        if (item.hasEOL && !pageText.endsWith("\n")) {
          pageText += "\n";
        }

        prevY = item.y;
        prevXEnd = item.x + item.width;
      }

      const cleanedText = pageText
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .trim();

      totalNonWhitespaceChars += cleanedText.replace(/\s+/g, "").length;

      pages.push({
        page: pageNum,
        text: cleanedText,
      });
    }

    if (totalNonWhitespaceChars === 0) {
      throw new PdfDocError(
        "no_text_layer",
        "PDF does not contain an extractable text layer"
      );
    }

    return { pages, pageCount, metadataTitle };
  } finally {
    try {
      await (doc as any)?.destroy?.();
    } catch {
      // Defensively ignore destroy failures
    }
    try {
      await loadingTask?.destroy?.();
    } catch {
      // Defensively ignore destroy failures
    }
  }
}

/**
 * Helper to slice a verbatim quote of up to 240 chars from page text containing the match.
 * Guarantees pageText.includes(quote) === true.
 */
function extractVerbatimQuote(
  fullText: string,
  matchIndex: number,
  matchLength: number
): string {
  const maxLen = 240;

  if (matchLength >= maxLen) {
    return fullText.slice(matchIndex, matchIndex + maxLen);
  }

  // Look backwards for line start or sentence boundary
  let start = matchIndex;
  while (start > 0 && matchIndex - start < 80) {
    const prev = fullText[start - 1];
    if (prev === "\n") {
      break;
    }
    if (prev === "." && fullText[start] === " ") {
      break;
    }
    start--;
  }

  // Look forwards for line end or sentence boundary
  let end = matchIndex + matchLength;
  while (end < fullText.length && end - start < maxLen) {
    const char = fullText[end];
    if (char === "\n") {
      break;
    }
    if (
      char === "." &&
      (end + 1 >= fullText.length || fullText[end + 1] === " " || fullText[end + 1] === "\n")
    ) {
      end++; // Include trailing period
      break;
    }
    end++;
  }

  // If window exceeds maxLen, clamp
  if (end - start > maxLen) {
    const overflow = end - start - maxLen;
    const startSlack = matchIndex - start;
    const shrinkStart = Math.min(startSlack, overflow);
    start += shrinkStart;
    const remaining = end - start - maxLen;
    if (remaining > 0) {
      end -= remaining;
    }
  }

  // Trim whitespace by adjusting start/end so fullText.slice(start, end) remains verbatim
  while (start < end && /\s/.test(fullText[start])) {
    start++;
  }
  while (end > start && /\s/.test(fullText[end - 1])) {
    end--;
  }

  const quote = fullText.slice(start, end);
  return quote.length > 0 ? quote : fullText.slice(matchIndex, matchIndex + matchLength);
}

// "4:00 PM" is a clock time, not picomolar.
const isClockSuffix = (u: string) => u === "AM" || u === "PM";

const STOP_PREFIXES = new Set([
  "the", "a", "an", "for", "with", "we", "our", "and", "or", "in", "at", "during",
  "using", "utilized", "maintained", "measured", "recorded", "observed", "determined",
  "investigated", "tested", "applied", "operated", "showed", "demonstrated", "exhibited",
  "found", "reported", "selected", "chosen", "cell", "working", "initial", "steady",
]);

function cleanLabel(raw: string): { label: string; unitInLabel: string | null } {
  let cleaned = raw.replace(/^[:=]+|[:=]+$/g, "").trim();
  let unitInLabel: string | null = null;
  // "A 2 (Condition" -> "Condition": an unclosed parenthesis opens the variable name.
  if ((cleaned.match(/\(/g) ?? []).length > (cleaned.match(/\)/g) ?? []).length) {
    cleaned = cleaned.slice(cleaned.lastIndexOf("(") + 1).trim();
  }

  // Check parenthesized or bracketed unit: e.g. "Pressure (kPa)" or "Temperature [K]"
  const unitMatch = cleaned.match(/^(.*?)\s*[\(\[]([^\(\)\[\]]+)[\)\]]\s*$/);
  if (unitMatch) {
    const candidateUnit = unitMatch[2].trim();
    const { exact, lowerMap } = getKnownUnits();
    const resolved = exact.has(candidateUnit)
      ? candidateUnit
      : lowerMap.get(candidateUnit.toLowerCase());
    if (resolved) {
      cleaned = unitMatch[1].trim();
      unitInLabel = resolved;
    }
  }

  // Strip leading stop words
  const words = cleaned.split(/\s+/);
  while (words.length > 1 && STOP_PREFIXES.has(words[0].toLowerCase())) {
    words.shift();
  }

  return { label: words.join(" "), unitInLabel };
}

/**
 * Pure parser for academic/scientific paper pages.
 * Extracts DOI, publication year, title heuristic, and candidate quantitative/categorical findings.
 */
export function parsePaperPages(
  pages: ParsedPage[],
  fallbackName: string
): ParsedPaperResult {
  const pageCount = pages.length;

  // Combine full text for global searches
  const allText = pages.map((p) => p.text).join("\n\n");
  const firstPageText = pages[0]?.text ?? "";

  // 1. DOI extraction (standard DOI format: 10.\d{4,9}/[-._;()/:A-Za-z0-9]+)
  let doi: string | undefined;
  const doiMatch = allText.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+[A-Za-z0-9])/);
  if (doiMatch) {
    doi = doiMatch[1].replace(/[.,;)]+$/, "");
  }

  // 2. Publication year extraction
  let year: number | undefined;
  if (doi) {
    const doiYearMatch = doi.match(/\b(19\d\d|20\d\d)\b/);
    if (doiYearMatch) {
      year = parseInt(doiYearMatch[1], 10);
    }
  }
  if (!year) {
    const dateMatch = firstPageText.match(
      /\b(?:published|accepted|received|copyright|©|\(c\)|january|february|march|april|may|june|july|august|september|october|november|december)\b[^0-9]{0,20}\b(19\d\d|20\d\d)\b/i
    );
    if (dateMatch) {
      year = parseInt(dateMatch[1], 10);
    }
  }
  if (!year) {
    const fallbackYear = fallbackName.match(/\b(19\d\d|20\d\d)\b/);
    if (fallbackYear) {
      year = parseInt(fallbackYear[1], 10);
    }
  }

  // 3. Title heuristic
  let title: string | undefined;
  const lines = firstPageText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    if (line.length < 10) continue;
    if (
      /^(doi|issn|isbn|arxiv|http|vol|volume|issue|journal|page|abstract|published|received|accepted)\b/i.test(
        line
      )
    ) {
      continue;
    }
    const words = line.split(/\s+/);
    if (words.length >= 2) {
      title = line;
      break;
    }
  }

  if (!title) {
    title = fallbackName.replace(/\.pdf$/i, "").trim();
  }

  // 4. Candidate variable findings extraction
  const findings: ParsedPaperFinding[] = [];
  const { exact, lowerMap } = getKnownUnits();
  const unitPattern = "[A-Za-z°µΩ%][A-Za-z0-9°µΩ%/()·*\\-_]*";

  // Nothing after a "References" heading is a finding: citations would read as variables.
  let inReferences = false;
  for (const page of pages) {
    if (inReferences) break;
    let text = page.text;
    if (!text) continue;
    // Only in the second half of the document, so a table of contents does not cut the paper.
    const refs = page.page > pages.length / 2 ? text.search(/\n\s*(references|bibliography|literature cited)\s*\n/i) : -1;
    if (refs >= 0) {
      text = text.slice(0, refs);
      inReferences = true;
    }

    // Pattern 1: Tolerance notation (e.g. "Pressure: 100 ± 5 kPa" or "100 +/- 5 kPa")
    const toleranceRegex = new RegExp(
      `([A-Za-z][A-Za-z0-9\\s\\-_/()]{1,40}?)\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:±|\\+\\/-)\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${unitPattern})`,
      "g"
    );
    let match: RegExpExecArray | null;

    while ((match = toleranceRegex.exec(text)) !== null) {
      const rawName = match[1].trim();
      const baseVal = parseFloat(match[2]);
      const tolVal = parseFloat(match[3]);
      const rawUnit = match[4].trim();

      const resolvedUnit = exact.has(rawUnit)
        ? rawUnit
        : lowerMap.get(rawUnit.toLowerCase());
      if (!resolvedUnit || isClockSuffix(rawUnit)) continue;

      const { label } = cleanLabel(rawName);
      if (!label || label.length < 2) continue;

      const min = baseVal - tolVal;
      const max = baseVal + tolVal;
      const quote = extractVerbatimQuote(text, match.index, match[0].length);

      findings.push({
        label,
        rawName,
        type: "numeric",
        unit: resolvedUnit,
        min,
        max,
        values: [min, max],
        page: page.page,
        quote,
      });
    }

    // Pattern 2: Quantitative range notation (e.g. "Temperature: 320–480 K" or "320 to 480 K")
    const rangeRegex = new RegExp(
      `([A-Za-z][A-Za-z0-9\\s\\-_/()]{1,40}?)\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:[-–—−]|to|\\.\\.\\.)\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${unitPattern})`,
      "g"
    );

    while ((match = rangeRegex.exec(text)) !== null) {
      const rawName = match[1].trim();
      const min = parseFloat(match[2]);
      const max = parseFloat(match[3]);
      const rawUnit = match[4].trim();

      const resolvedUnit = exact.has(rawUnit)
        ? rawUnit
        : lowerMap.get(rawUnit.toLowerCase());
      if (!resolvedUnit || isClockSuffix(rawUnit)) continue;

      const { label } = cleanLabel(rawName);
      if (!label || label.length < 2) continue;

      const quote = extractVerbatimQuote(text, match.index, match[0].length);

      findings.push({
        label,
        rawName,
        type: "numeric",
        unit: resolvedUnit,
        min,
        max,
        values: [min, max],
        page: page.page,
        quote,
      });
    }

    // Pattern 3: Parenthesized unit single value (e.g. "Pressure (kPa): 101.3")
    const parenUnitRegex =
      /([A-Za-z][A-Za-z0-9\s\-_/]{1,40}?)\s*[\(\[]([^\(\)\[\]]+)[\)\]]\s*[:=]\s*(-?\d+(?:\.\d+)?)/g;

    while ((match = parenUnitRegex.exec(text)) !== null) {
      const rawName = match[1].trim();
      const rawUnit = match[2].trim();
      const val = parseFloat(match[3]);

      const resolvedUnit = exact.has(rawUnit)
        ? rawUnit
        : lowerMap.get(rawUnit.toLowerCase());
      if (!resolvedUnit || isClockSuffix(rawUnit)) continue;

      const { label } = cleanLabel(rawName);
      if (!label || label.length < 2) continue;

      const quote = extractVerbatimQuote(text, match.index, match[0].length);

      findings.push({
        label,
        rawName,
        type: "numeric",
        unit: resolvedUnit,
        min: val,
        max: val,
        values: [val],
        page: page.page,
        quote,
      });
    }

    // Pattern 4: Single value with unit (e.g. "Electrolyte concentration = 1.2 M")
    const singleRegex = new RegExp(
      `([A-Za-z][A-Za-z0-9\\s\\-_/()]{1,40}?)\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${unitPattern})`,
      "g"
    );

    while ((match = singleRegex.exec(text)) !== null) {
      const rawName = match[1].trim();
      const val = parseFloat(match[2]);
      const rawUnit = match[3].trim();

      const resolvedUnit = exact.has(rawUnit)
        ? rawUnit
        : lowerMap.get(rawUnit.toLowerCase());
      if (!resolvedUnit || isClockSuffix(rawUnit)) continue;

      const { label, unitInLabel } = cleanLabel(rawName);
      if (!label || label.length < 2) continue;

      // Avoid duplicate if already captured by range or tolerance
      const isAlreadyCaptured = findings.some(
        (f) => f.page === page.page && f.label === label && f.quote.includes(match![0])
      );
      if (isAlreadyCaptured) continue;

      const finalUnit = unitInLabel || resolvedUnit;
      const quote = extractVerbatimQuote(text, match.index, match[0].length);

      findings.push({
        label,
        rawName,
        type: "numeric",
        unit: finalUnit,
        min: val,
        max: val,
        values: [val],
        page: page.page,
        quote,
      });
    }

    // Pattern 5: Categorical comparison (e.g. "Substrate: Graphite vs Silicon" or "vs." / "versus")
    const categoricalVsRegex =
      /([A-Za-z][A-Za-z0-9\s\-_/()]{1,40}?)\s*[:=]\s*([A-Za-z0-9\-_]+(?:\s+[A-Za-z0-9\-_]+)*)\s+(?:vs\.?|versus)\s+([A-Za-z0-9\-_]+(?:\s+[A-Za-z0-9\-_]+)*)/g;

    const CATEGORY_STOP_WORDS = new Set([
      "to", "for", "with", "in", "at", "by", "from", "under", "using", "as",
      "and", "or", "which", "that", "where", "while", "during", "after", "before",
    ]);

    while ((match = categoricalVsRegex.exec(text)) !== null) {
      const rawName = match[1].trim();
      const cat1 = match[2].trim();
      const rawCat2 = match[3].trim();

      const { label } = cleanLabel(rawName);
      if (!label || label.length < 2) continue;

      // Clean trailing prose/prepositions from cat2 (e.g. "Silicon to assess stability" -> "Silicon")
      const cat2Words = rawCat2.split(/\s+/);
      const cleanedCat2Words: string[] = [];
      for (const w of cat2Words) {
        if (cleanedCat2Words.length > 0 && CATEGORY_STOP_WORDS.has(w.toLowerCase())) {
          break;
        }
        cleanedCat2Words.push(w);
      }
      const cat2 = cleanedCat2Words.join(" ");
      if (!cat2) continue;

      const quote = extractVerbatimQuote(text, match.index, match[0].length);

      findings.push({
        label,
        rawName,
        type: "categorical",
        unit: null,
        categories: [cat1, cat2],
        values: [],
        page: page.page,
        quote,
      });
    }
  }

  return {
    title,
    doi,
    year,
    pageCount,
    pages,
    findings,
  };
}
