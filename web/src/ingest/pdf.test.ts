import { describe, expect, it } from "vitest";
import { D3_LIMITS, type ParsedPage } from "./types";
import {
  extractPdfPages,
  parsePaperPages,
  PdfDocError,
} from "./pdf";

/**
 * Helper to build a minimal valid single-page PDF with text.
 */
function createMinimalPdfWithText(text: string): Uint8Array {
  const streamContent = `BT\n/F1 12 Tf\n100 700 Td\n(${text}) Tj\nET`;
  const streamLength = streamContent.length;
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000302 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
400
%%EOF`;
  return new TextEncoder().encode(pdf);
}

/**
 * Helper to build a valid single-page PDF without any text layer (empty canvas).
 */
function createEmptyTextPdf(): Uint8Array {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
192
%%EOF`;
  return new TextEncoder().encode(pdf);
}

/**
 * Helper to build a valid synthetic PDF with N pages.
 */
function createSyntheticMultiPagePdf(count: number): Uint8Array {
  let out = "%PDF-1.4\n";
  out += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const kids = Array.from({ length: count }, (_, i) => `${i + 3} 0 R`).join(" ");
  out += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${count} >>\nendobj\n`;
  for (let i = 0; i < count; i++) {
    out += `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  }
  out += "xref\n0 " + (count + 3) + "\n0000000000 65535 f \n";
  out += "trailer\n<< /Size " + (count + 3) + " /Root 1 0 R >>\nstartxref\n" + out.length + "\n%%EOF";
  return new TextEncoder().encode(out);
}

describe("parsePaperPages", () => {
  const samplePages: ParsedPage[] = [
    {
      page: 1,
      text: `Combustion and Flame Studies in Advanced Cells
DOI: 10.1016/j.combust.2024.01
Published online January 2024.

Abstract
We report experimental measurements of thermal kinetics.
During the initial reaction phase, we maintained Temperature: 320–480 K under steady laminar flow.`,
    },
    {
      page: 2,
      text: `Experimental Setup and Materials

The cell utilized Electrolyte concentration = 1.2 M dissolved in carbonate solvent.
For the working electrode, we compared Substrate: Graphite vs Silicon to assess stability.`,
    },
  ];

  it("extracts DOI, publication year, page count, and title heuristic", () => {
    const result = parsePaperPages(samplePages, "fallback_paper.pdf");

    expect(result.pageCount).toBe(2);
    expect(result.doi).toBe("10.1016/j.combust.2024.01");
    expect(result.year).toBe(2024);
    expect(result.title).toContain("Combustion and Flame Studies");
    expect(result.pages).toHaveLength(2);
  });

  it("extracts quantitative range variable with exact verbatim quote", () => {
    const result = parsePaperPages(samplePages, "paper.pdf");
    const tempFinding = result.findings.find(
      (f) => f.label.toLowerCase().includes("temp")
    );

    expect(tempFinding).toBeDefined();
    expect(tempFinding?.type).toBe("numeric");
    expect(tempFinding?.unit).toBe("K");
    expect(tempFinding?.min).toBe(320);
    expect(tempFinding?.max).toBe(480);
    expect(tempFinding?.values).toEqual([320, 480]);
    expect(tempFinding?.page).toBe(1);

    // Strict no-fabrication constraint: verbatim quote must be <= 240 chars and present inside page.text
    expect(tempFinding?.quote.length).toBeLessThanOrEqual(240);
    expect(tempFinding?.quote.length).toBeGreaterThan(0);
    expect(samplePages[0].text.includes(tempFinding!.quote)).toBe(true);
  });

  it("extracts quantitative single-value variable with unit and verbatim quote", () => {
    const result = parsePaperPages(samplePages, "paper.pdf");
    const concFinding = result.findings.find(
      (f) => f.label.toLowerCase().includes("electrolyte")
    );

    expect(concFinding).toBeDefined();
    expect(concFinding?.type).toBe("numeric");
    expect(concFinding?.unit).toBe("M");
    expect(concFinding?.min).toBe(1.2);
    expect(concFinding?.max).toBe(1.2);
    expect(concFinding?.values).toEqual([1.2]);
    expect(concFinding?.page).toBe(2);

    expect(concFinding?.quote.length).toBeLessThanOrEqual(240);
    expect(concFinding?.quote.length).toBeGreaterThan(0);
    expect(samplePages[1].text.includes(concFinding!.quote)).toBe(true);
  });

  it("extracts categorical variable with categories and verbatim quote", () => {
    const result = parsePaperPages(samplePages, "paper.pdf");
    const subFinding = result.findings.find(
      (f) => f.label.toLowerCase().includes("substrate")
    );

    expect(subFinding).toBeDefined();
    expect(subFinding?.type).toBe("categorical");
    expect(subFinding?.unit).toBeNull();
    expect(subFinding?.categories).toEqual(["Graphite", "Silicon"]);
    expect(subFinding?.page).toBe(2);

    expect(subFinding?.quote.length).toBeLessThanOrEqual(240);
    expect(subFinding?.quote.length).toBeGreaterThan(0);
    expect(samplePages[1].text.includes(subFinding!.quote)).toBe(true);
  });

  it("falls back to cleaned fallbackName when title is not prominent", () => {
    const emptyFirstPage: ParsedPage[] = [
      { page: 1, text: "DOI: 10.1000/182\nPage 1 text" },
    ];
    const res = parsePaperPages(emptyFirstPage, "my_scientific_report.pdf");
    expect(res.title).toBe("my_scientific_report");
  });

  it("handles tolerance notation (e.g. ± or +/-) for numeric findings", () => {
    const pages: ParsedPage[] = [
      {
        page: 1,
        text: "The chamber operated at Pressure: 100 ± 5 kPa under steady conditions.",
      },
    ];
    const res = parsePaperPages(pages, "chamber.pdf");
    const pFinding = res.findings.find((f) => f.label.toLowerCase().includes("pressure"));
    expect(pFinding).toBeDefined();
    expect(pFinding?.unit).toBe("kPa");
    expect(pFinding?.min).toBe(95);
    expect(pFinding?.max).toBe(105);
    expect(pages[0].text.includes(pFinding!.quote)).toBe(true);
  });

  it("handles parenthesized unit notation (e.g. Pressure (kPa): 101.3)", () => {
    const pages: ParsedPage[] = [
      {
        page: 1,
        text: "Recorded Pressure (kPa): 101.3 across all runs.",
      },
    ];
    const res = parsePaperPages(pages, "data.pdf");
    const pFinding = res.findings.find((f) => f.label.toLowerCase().includes("pressure"));
    expect(pFinding).toBeDefined();
    expect(pFinding?.unit).toBe("kPa");
    expect(pFinding?.min).toBe(101.3);
    expect(pages[0].text.includes(pFinding!.quote)).toBe(true);
  });

  it("handles compound scientific units with parentheses like W/(m·K)", () => {
    const pages: ParsedPage[] = [
      {
        page: 1,
        text: "Measured Thermal conductivity = 1.5 W/(m·K) across the test sample.\nRange: 1.2 to 1.8 W/(m·K) and tolerance: 1.5 ± 0.2 W/(m·K).",
      },
    ];
    const res = parsePaperPages(pages, "sample.pdf");
    const findings = res.findings.filter((f) => f.unit === "W/(m·K)");
    expect(findings.length).toBeGreaterThanOrEqual(1);
    for (const f of findings) {
      expect(f.unit).toBe("W/(m·K)");
      expect(pages[0].text.includes(f.quote)).toBe(true);
    }
  });
});

describe("extractPdfPages", () => {
  it("extracts text layer and page count from minimal valid PDF", async () => {
    const bytes = createMinimalPdfWithText("Hello World");
    const result = await extractPdfPages(bytes);

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].page).toBe(1);
    expect(result.pages[0].text).toContain("Hello World");
  });

  it("throws no_text_layer error when PDF contains no extractable text", async () => {
    const bytes = createEmptyTextPdf();

    await expect(extractPdfPages(bytes)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PdfDocError);
      const pdfErr = err as PdfDocError;
      expect(pdfErr.code).toBe("no_text_layer");
      expect(pdfErr.message).toContain("no_text_layer");
      return true;
    });
  });

  it(`throws too_many_pages error when PDF page count exceeds D3_LIMITS.maxPages (${D3_LIMITS.maxPages})`, async () => {
    const bytes = createSyntheticMultiPagePdf(61);

    await expect(extractPdfPages(bytes)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PdfDocError);
      const pdfErr = err as PdfDocError;
      expect(pdfErr.code).toBe("too_many_pages");
      expect(pdfErr.message).toContain("too_many_pages");
      return true;
    });
  });

  it("throws unreadable error when PDF bytes are corrupted or invalid", async () => {
    const corruptedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    await expect(extractPdfPages(corruptedBytes)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PdfDocError);
      const pdfErr = err as PdfDocError;
      expect(pdfErr.code).toBe("unreadable");
      expect(pdfErr.message).toContain("unreadable");
      return true;
    });
  });

  it("throws unreadable error when PDF byte buffer is empty", async () => {
    const emptyBytes = new Uint8Array(0);

    await expect(extractPdfPages(emptyBytes)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PdfDocError);
      const pdfErr = err as PdfDocError;
      expect(pdfErr.code).toBe("unreadable");
      expect(pdfErr.message).toContain("unreadable");
      return true;
    });
  });

  it(`throws too_large error when PDF bytes exceed D3_LIMITS.maxBytes (${D3_LIMITS.maxBytes})`, async () => {
    const oversizedBytes = new Uint8Array(D3_LIMITS.maxBytes + 1);

    await expect(extractPdfPages(oversizedBytes)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PdfDocError);
      const pdfErr = err as PdfDocError;
      expect(pdfErr.code).toBe("too_large");
      expect(pdfErr.message).toContain("too_large");
      return true;
    });
  });
});
