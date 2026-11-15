import { describe, expect, it } from "vitest";
import { answerLocalQuery, interpretLocalQuestion } from "./localAsk";
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

describe("answerLocalQuery", () => {
  const temp: NumVariable = { id: "temp", label: "Temperature", unit: "K", type: "num", sigma: 5, range: [250, 400] };
  const grav: NumVariable = { id: "gravity", label: "Gravity", unit: "g", type: "num", sigma: 0.05, range: [0, 1] };
  const base = createMockPack([temp, grav]);
  // Shaped like the PSI boiling tables: ranges per test, flight vs ground studies.
  const pack: Pack = {
    ...base,
    records: [
      { ...base.records[0], id: "r1", study: "npbx", values: { temp: [300, 310], gravity: [0, 0.01] }, source: { id: "s1", row: 2 } },
      { ...base.records[0], id: "r2", study: "mabe", values: { temp: [350, 362], gravity: [0.01, 0.02] }, source: { id: "s2", row: 5 } },
      { ...base.records[0], id: "r3", study: "ground", values: { temp: [280, 290], gravity: [1, 1] }, source: { id: "s3", row: 1 } },
      { ...base.records[0], id: "r4", study: "ground", values: { material: "PMMA" }, source: { id: "s3", row: 2 } },
    ],
  };

  it("answers the maximum in English and Spanish with the records that hold it", () => {
    for (const q of ["What is the maximum temperature recorded in the papers?", "¿Cuál es la temperatura máxima registrada?"]) {
      expect(answerLocalQuery(q, pack)).toEqual({ kind: "stat", variable: "temp", stat: "max", value: 362, unit: "K", n: 3, records: ["r2"] });
    }
  });

  it("answers minimum, mean and count", () => {
    expect(answerLocalQuery("lowest temperature", pack)).toMatchObject({ stat: "min", value: 280, records: ["r3"] });
    expect(answerLocalQuery("promedio de temperatura", pack)).toMatchObject({ stat: "mean", value: 315.333333, n: 3 });
    expect(answerLocalQuery("How many tests record gravity?", pack)).toMatchObject({ stat: "count", value: 3 });
  });

  it("lists the studies under a numeric condition", () => {
    expect(answerLocalQuery("Which studies evaluated gravity below 0.1 g?", pack)).toEqual({
      kind: "filter", variable: "gravity", op: "<", bounds: [0.1], unit: "g", studies: ["npbx", "mabe"], records: ["r1", "r2"],
    });
    expect(answerLocalQuery("¿Qué estudios evaluaron gravedad menor a 0,1 g?", { ...pack, schema: { ...pack.schema, variables: [temp, { ...grav, label: "Gravedad" }] } })).toMatchObject({ op: "<", studies: ["npbx", "mabe"] });
    expect(answerLocalQuery("temperature between 340 and 400 K", pack)).toMatchObject({ op: "between", bounds: [340, 400], studies: ["mabe"] });
    expect(answerLocalQuery("temperature at least 305 K", pack)).toMatchObject({ op: ">=", records: ["r1", "r2"] });
  });

  it("converts the unit of the question to the unit of the variable", () => {
    expect(answerLocalQuery("temperature above 80 °C", pack)).toMatchObject({ op: ">", bounds: [353.15], records: ["r2"] });
  });

  it("returns unsupported when no variable or operation is understood", () => {
    expect(answerLocalQuery("Tell me a story", pack)).toHaveProperty("unsupported");
    expect(answerLocalQuery("temperature", pack)).toHaveProperty("unsupported");
  });
});
