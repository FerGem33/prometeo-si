import { describe, expect, it } from "vitest";
import { interpretLocalQuestion } from "./localAsk";
import type { Pack, NumVariable, CatVariable } from "../engine";

function createMockPack(variables: (NumVariable | CatVariable)[] = []): Pack {
  return {
    contract: "prometeo.pack/1",
    meta: {
      id: "mock_pack",
      title: "Mock Pack",
      created_at: "2026-11-15",
      source_note: "Mock",
      stats: { tests: 10 },
    },
    schema: {
      variables,
      thresholds: { grade_a: 1.0, tolerance: 0.1, closeness_reach: 3.0 },
    },
    sources: [],
    studies: [],
    records: [
      {
        id: "rec1",
        study: "s1",
        label: "Test 1",
        values: { material: "PMMA", temp: [300, 310] },
        kind: "test",
        source: { id: "src1" },
        confidence: "table",
        quote: null,
        flags: [],
      },
      {
        id: "rec2",
        study: "s1",
        label: "Test 2",
        values: { material: "PTFE", temp: [350, 360] },
        kind: "test",
        source: { id: "src1" },
        confidence: "table",
        quote: null,
        flags: [],
      },
    ],
    claims: [],
  };
}

describe("interpretLocalQuestion", () => {
  const tempVar: NumVariable = {
    id: "temp",
    label: "Temperature",
    unit: "°C",
    type: "num",
    sigma: 5,
    range: [0, 500],
  };

  const voltVar: NumVariable = {
    id: "volt",
    label: "Voltage",
    unit: "V",
    type: "num",
    sigma: 0.2,
    range: [2.5, 5.0],
  };

  const matVar: CatVariable = {
    id: "material",
    label: "Material",
    type: "cat",
  };

  const standardPack = createMockPack([tempVar, voltVar, matVar]);

  it("interprets English question setting multiple numeric variables with units", () => {
    const result = interpretLocalQuestion(
      "Set Temperature to 350 K and Voltage 4.1 V",
      standardPack
    );
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) {
      expect(result.active).toContain("temp");
      expect(result.active).toContain("volt");
      // 350 K converted to °C is ~76.85 °C
      expect(typeof result.values.temp).toBe("number");
      expect(Number(result.values.temp)).toBeCloseTo(76.85, 1);
      expect(result.values.volt).toBe(4.1);
    }
  });

  it("interprets Spanish question setting single variable without unit", () => {
    const result = interpretLocalQuestion("Cambia Temperatura a 350", standardPack);
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) {
      expect(result.active).toEqual(["temp"]);
      expect(result.values.temp).toBe(350);
    }
  });

  it("interprets variable by ID case-insensitively", () => {
    const result = interpretLocalQuestion("volt = 3.8", standardPack);
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) {
      expect(result.active).toEqual(["volt"]);
      expect(result.values.volt).toBe(3.8);
    }
  });

  it("clamps numeric value to variable range", () => {
    const result = interpretLocalQuestion("Set Voltage to 10 V", standardPack);
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) {
      expect(result.values.volt).toBe(5.0); // clamped to upper range 5.0
    }
  });

  it("interprets categorical variable from known values", () => {
    const result = interpretLocalQuestion("Set Material to PMMA", standardPack);
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) {
      expect(result.active).toEqual(["material"]);
      expect(result.values.material).toBe("PMMA");
    }
  });

  it("returns unsupported for conversational non-scenario questions", () => {
    const result = interpretLocalQuestion("What is the meaning of life?", standardPack);
    expect("unsupported" in result).toBe(true);
    if ("unsupported" in result) {
      expect(result.unsupported).toBeTruthy();
    }
  });

  it("safely handles Pack with 0 or 1 numeric variable without throwing", () => {
    const zeroNumPack = createMockPack([matVar]);
    const res0 = interpretLocalQuestion("Set Material to PTFE", zeroNumPack);
    expect("unsupported" in res0).toBe(false);
    if (!("unsupported" in res0)) {
      expect(res0.values.material).toBe("PTFE");
    }

    const oneNumPack = createMockPack([voltVar]);
    const res1 = interpretLocalQuestion("Voltage 4.2 V", oneNumPack);
    expect("unsupported" in res1).toBe(false);
    if (!("unsupported" in res1)) {
      expect(res1.values.volt).toBe(4.2);
    }

    const unsupportedRes = interpretLocalQuestion("What is the weather?", oneNumPack);
    expect("unsupported" in unsupportedRes).toBe(true);
  });

  it("matches multi-word known categorical values after 'to' / 'is'", () => {
    const multiCatVar: CatVariable = { id: "mat", label: "Material", type: "cat" };
    const multiPack: Pack = {
      ...createMockPack([multiCatVar]),
      records: [
        {
          id: "rec-mw-1",
          study: "study-1",
          label: "Sample 1",
          kind: "test",
          source: { id: "src-1", row: 1 },
          confidence: "table",
          quote: null,
          flags: [],
          values: { mat: "Carbon Fiber" },
        },
        {
          id: "rec-mw-2",
          study: "study-1",
          label: "Sample 2",
          kind: "test",
          source: { id: "src-1", row: 2 },
          confidence: "table",
          quote: null,
          flags: [],
          values: { mat: "Stainless Steel" },
        },
      ],
    };
    const res = interpretLocalQuestion("Set Material to Carbon Fiber", multiPack);
    expect("unsupported" in res).toBe(false);
    if (!("unsupported" in res)) {
      expect(res.values.mat).toBe("Carbon Fiber");
    }
  });
});
