import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Pack } from "../engine";
import { isPredictionQuestion, routeQuestion } from "./chat";
import type { ChatContext } from "./chat";
import { chunkDocs, retrieve } from "./retrieve";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const ctx = (over: Partial<ChatContext> = {}): ChatContext => ({
  pack, docs: [], scenario: null, history: [], isCustomCorpus: false, signal: new AbortController().signal, ...over,
});
const numVar = pack.schema.variables.find((v) => v.type === "num")!;

describe("routeQuestion", () => {
  it("detects prediction questions and answers with the guard", async () => {
    expect(isPredictionQuestion("Is it safe at 1 atm?")).toBe(true);
    const turn = await routeQuestion("Will it work in these conditions?", ctx());
    expect(turn.mode).toBe("guard");
    expect(turn.text).toContain("does not predict");
  });
  it("proposes a case change without applying it", async () => {
    const post = async (path: string) => {
      expect(path).toBe("ask");
      return { values: { [numVar.id]: numVar.type === "num" ? numVar.range[0] : 0 }, active: [numVar.id], filters: {} };
    };
    const turn = await routeQuestion(`set ${numVar.label} to ${numVar.type === "num" ? numVar.range[0] : 0}`, ctx({ post }));
    expect(turn.mode).toBe("case_change");
    expect(turn.proposal?.active).toEqual([numVar.id]);
  });
  it("answers a statistic locally with records", async () => {
    const turn = await routeQuestion(`maximum ${numVar.label}`, ctx());
    expect(turn.mode).toBe("local_stat");
    expect(turn.records?.length).toBeGreaterThan(0);
  });
  it("falls back to local search without an API", async () => {
    const turn = await routeQuestion("soot inception limits", ctx());
    expect(turn.mode).toBe("local_search");
    expect(turn.citations?.length).toBeGreaterThan(0);
    expect(turn.citations!.length).toBeLessThanOrEqual(3);
  });
  it("says so when no passage matches", async () => {
    const turn = await routeQuestion("zzzzqqq", ctx());
    expect(turn.text).toBe("No passage of the documents matches the question.");
  });
  it("rejects an AI answer with an invented quote", async () => {
    const top = retrieve("soot inception limits", chunkDocs([], pack), 8)[0];
    const post = async () => ({ mode: "ai", sentences: [{ text: "Invented.", cites: [{ docId: top.docId, quote: "this quote is not in any passage" }] }] });
    const turn = await routeQuestion("soot inception limits", ctx({ post }));
    expect(turn.mode).toBe("local_search");
  });
  it("accepts an AI answer whose quote comes from a sent passage", async () => {
    const top = retrieve("soot inception limits", chunkDocs([], pack), 8)[0];
    const quote = top.text.slice(0, 30);
    const post = async () => ({ mode: "ai", sentences: [{ text: "Grounded sentence.", cites: [{ docId: top.docId, quote }] }] });
    const turn = await routeQuestion("soot inception limits", ctx({ post }));
    expect(turn.mode).toBe("ai");
    expect(turn.citations?.[0]).toMatchObject({ docId: top.docId, docName: top.docName, quote });
  });
});
