import { describe, it, expect } from "vitest";
import {
  splitHeaderUnit,
  parseCsvText,
  parseJsonTableText,
  parseTabularDocument,
} from "./csv";

describe("splitHeaderUnit", () => {
  it("extracts units inside parentheses matching UNIT_GROUPS", () => {
    expect(splitHeaderUnit("Oxygen (%)")).toEqual({
      label: "Oxygen",
      unit: "%",
    });
    expect(splitHeaderUnit("Time (s)")).toEqual({
      label: "Time",
      unit: "s",
    });
    expect(splitHeaderUnit("Temperature (°C)")).toEqual({
      label: "Temperature",
      unit: "°C",
    });
  });

  it("extracts units inside square brackets matching UNIT_GROUPS", () => {
    expect(splitHeaderUnit("Pressure [kPa]")).toEqual({
      label: "Pressure",
      unit: "kPa",
    });
    expect(splitHeaderUnit("Speed [m/s]")).toEqual({
      label: "Speed",
      unit: "m/s",
    });
    expect(splitHeaderUnit("Concentration [mol/L]")).toEqual({
      label: "Concentration",
      unit: "mol/L",
    });
  });

  it("extracts units with comma suffix matching UNIT_GROUPS", () => {
    expect(splitHeaderUnit("Temperature, K")).toEqual({
      label: "Temperature",
      unit: "K",
    });
    expect(splitHeaderUnit("Flow, mL/min")).toEqual({
      label: "Flow",
      unit: "mL/min",
    });
  });

  it("returns null unit when no unit is present or not matching UNIT_GROUPS", () => {
    expect(splitHeaderUnit("Sample ID")).toEqual({
      label: "Sample ID",
      unit: null,
    });
    expect(splitHeaderUnit("Notes (replicate 1)")).toEqual({
      label: "Notes (replicate 1)",
      unit: null,
    });
    expect(splitHeaderUnit("City, Country")).toEqual({
      label: "City, Country",
      unit: null,
    });
  });
});

describe("parseCsvText", () => {
  it("parses basic CSV with logical rows starting at 2", () => {
    const csv = "name,age,city\nAlice,30,Paris\nBob,25,London";
    const res = parseCsvText(csv);
    expect(res.headers).toEqual(["name", "age", "city"]);
    expect(res.rows).toEqual([
      { row: 2, values: ["Alice", "30", "Paris"] },
      { row: 3, values: ["Bob", "25", "London"] },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const csv = 'item,"description, detailed",count\nA,"Widget, ""Special"" edition",10';
    const res = parseCsvText(csv);
    expect(res.headers).toEqual(["item", "description, detailed", "count"]);
    expect(res.rows).toEqual([
      { row: 2, values: ["A", 'Widget, "Special" edition', "10"] },
    ]);
  });

  it("handles multiline quoted fields maintaining logical row counts", () => {
    const csv = 'id,comment,score\n1,"First line\nSecond line\nThird line",99\n2,"Single line",85';
    const res = parseCsvText(csv);
    expect(res.headers).toEqual(["id", "comment", "score"]);
    expect(res.rows).toEqual([
      { row: 2, values: ["1", "First line\nSecond line\nThird line", "99"] },
      { row: 3, values: ["2", "Single line", "85"] },
    ]);
  });

  it("strips UTF-8 BOM cleanly", () => {
    const csv = "\uFEFFcolA,colB\n1,2";
    const res = parseCsvText(csv);
    expect(res.headers).toEqual(["colA", "colB"]);
    expect(res.rows).toEqual([{ row: 2, values: ["1", "2"] }]);
  });

  it("auto-detects tab, semicolon, and comma delimiters", () => {
    const tsv = "colA\tcolB\tcolC\n1\t2\t3\n4\t5\t6";
    const resTsv = parseCsvText(tsv);
    expect(resTsv.headers).toEqual(["colA", "colB", "colC"]);
    expect(resTsv.rows.length).toBe(2);

    const ssv = "colA;colB;colC\n1;2;3\n4;5;6";
    const resSsv = parseCsvText(ssv);
    expect(resSsv.headers).toEqual(["colA", "colB", "colC"]);
    expect(resSsv.rows.length).toBe(2);
  });

  it("throws descriptive error on empty or whitespace input", () => {
    expect(() => parseCsvText("")).toThrow(/empty/i);
    expect(() => parseCsvText("   \n\t  ")).toThrow(/empty/i);
  });

  it("throws descriptive error on unclosed quote", () => {
    expect(() => parseCsvText('col1,col2\n"unclosed quote,val2')).toThrow(
      /unclosed quote/i
    );
  });
});

describe("parseJsonTableText", () => {
  it("parses array of objects into headers and rows starting at 2", () => {
    const json = JSON.stringify([
      { id: "A1", value: 42, active: true },
      { id: "A2", value: 100, active: false },
    ]);
    const res = parseJsonTableText(json);
    expect(res.headers).toEqual(["id", "value", "active"]);
    expect(res.rows).toEqual([
      { row: 2, values: ["A1", "42", "true"] },
      { row: 3, values: ["A2", "100", "false"] },
    ]);
  });

  it("unwraps { records: [...] } and { data: [...] }", () => {
    const jsonRecords = JSON.stringify({
      records: [
        { metric: "temp", reading: 298.15 },
        { metric: "pressure", reading: 101.3 },
      ],
    });
    const resRecords = parseJsonTableText(jsonRecords);
    expect(resRecords.headers).toEqual(["metric", "reading"]);
    expect(resRecords.rows.length).toBe(2);

    const jsonData = JSON.stringify({
      data: [{ a: "x", b: 1 }],
    });
    const resData = parseJsonTableText(jsonData);
    expect(resData.headers).toEqual(["a", "b"]);
    expect(resData.rows.length).toBe(1);
  });

  it("handles missing keys in subsequent records by filling empty strings", () => {
    const json = JSON.stringify([
      { col1: "alpha", col2: "beta" },
      { col1: "gamma", col3: "delta" },
    ]);
    const res = parseJsonTableText(json);
    expect(res.headers).toEqual(["col1", "col2", "col3"]);
    expect(res.rows[0].values).toEqual(["alpha", "beta", ""]);
    expect(res.rows[1].values).toEqual(["gamma", "", "delta"]);
  });

  it("throws descriptive error on empty, invalid, or non-tabular JSON", () => {
    expect(() => parseJsonTableText("")).toThrow(/empty/i);
    expect(() => parseJsonTableText("{ bad json")).toThrow(/failed to parse json/i);
    expect(() => parseJsonTableText('{"foo": "bar"}')).toThrow(/tabular/i);
    expect(() => parseJsonTableText("[]")).toThrow(/no records/i);
  });
});

describe("parseTabularDocument", () => {
  it("parses CSV bytes and returns DetectedColumn statistics with unit inference", () => {
    const csvContent =
      "Compound,Oxygen (%),Pressure [kPa],Status\n" +
      "H2O,21.0,101.3,Stable\n" +
      "CO2,15.5,100.5,Stable\n" +
      "CH4,0.0,98.2,Warning\n" +
      "NH3,,102.0,Stable";

    const bytes = new TextEncoder().encode(csvContent);
    const result = parseTabularDocument("test.csv", bytes, "text/csv");

    expect(result.headers).toEqual([
      "Compound",
      "Oxygen (%)",
      "Pressure [kPa]",
      "Status",
    ]);
    expect(result.rows.length).toBe(4);
    expect(result.rows[0].row).toBe(2);
    expect(result.rows[3].row).toBe(5);

    expect(result.columns).toHaveLength(4);

    const compCol = result.columns[0];
    expect(compCol.name).toBe("Compound");
    expect(compCol.label).toBe("Compound");
    expect(compCol.unit).toBeNull();
    expect(compCol.type).toBe("categorical");
    expect(compCol.nonEmptyCount).toBe(4);
    expect(compCol.categories).toContain("H2O");
    expect(compCol.sampleCells.length).toBeGreaterThan(0);

    const o2Col = result.columns[1];
    expect(o2Col.name).toBe("Oxygen (%)");
    expect(o2Col.label).toBe("Oxygen");
    expect(o2Col.unit).toBe("%");
    expect(o2Col.type).toBe("numeric");
    expect(o2Col.nonEmptyCount).toBe(3);
    expect(o2Col.numericCount).toBe(3);
    expect(o2Col.min).toBe(0.0);
    expect(o2Col.max).toBe(21.0);
    expect(o2Col.median).toBe(15.5);

    const pressCol = result.columns[2];
    expect(pressCol.name).toBe("Pressure [kPa]");
    expect(pressCol.label).toBe("Pressure");
    expect(pressCol.unit).toBe("kPa");
    expect(pressCol.type).toBe("numeric");
    expect(pressCol.min).toBe(98.2);
    expect(pressCol.max).toBe(102.0);

    const statusCol = result.columns[3];
    expect(statusCol.type).toBe("categorical");
    expect(statusCol.mode).toBe("Stable");
  });

  it("decodes Latin-1 fallback when UTF-8 decoding fails", () => {
    // Latin-1 encoded bytes for "Concentración [mol/L]\n0.5\n"
    // 'ó' in ISO-8859-1 is 0xF3
    const latin1Bytes = new Uint8Array([
      0x43, 0x6f, 0x6e, 0x63, 0x65, 0x6e, 0x74, 0x72, 0x61, 0x63, 0x69,
      0xf3, // ó in Latin-1
      0x6e, 0x20, 0x5b, 0x6d, 0x6f, 0x6c, 0x2f, 0x4c, 0x5d, 0x0a, 0x30, 0x2e,
      0x35, 0x0a,
    ]);

    const result = parseTabularDocument("data.csv", latin1Bytes, "text/csv");
    expect(result.headers[0]).toBe("Concentración [mol/L]");
    expect(result.columns[0].label).toBe("Concentración");
    expect(result.columns[0].unit).toBe("mol/L");
    expect(result.rows[0].values[0]).toBe("0.5");
  });

  it("parses TSV media type", () => {
    const tsvContent = "col1\tcol2\nfoo\tbar";
    const bytes = new TextEncoder().encode(tsvContent);
    const result = parseTabularDocument(
      "data.tsv",
      bytes,
      "text/tab-separated-values"
    );
    expect(result.headers).toEqual(["col1", "col2"]);
    expect(result.delimiter).toBe("\t");
    expect(result.rows[0].values).toEqual(["foo", "bar"]);
  });

  it("parses JSON media type", () => {
    const jsonContent = JSON.stringify([{ a: 1, b: 2 }]);
    const bytes = new TextEncoder().encode(jsonContent);
    const result = parseTabularDocument(
      "data.json",
      bytes,
      "application/json"
    );
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows[0].values).toEqual(["1", "2"]);
  });

  it("rejects unsupported media types like application/pdf", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(() =>
      parseTabularDocument("paper.pdf", bytes, "application/pdf")
    ).toThrow(/pdf/i);
  });
});
