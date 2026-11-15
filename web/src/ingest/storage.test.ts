import { describe, expect, it } from "vitest";
import { D3_LIMITS, type UploadedDoc } from "./types";
import {
  detectMediaType,
  sha256Hex,
  validateFileMeta,
  createMemoryDocStore,
  mergeUploadedDocs,
} from "./storage";

describe("ingest validation and hashing", () => {
  it("enforces D3 byte and document count limits matching upload_tickets.py", () => {
    expect(D3_LIMITS).toEqual({ maxBytes: 20_000_000, maxPages: 60, maxDocuments: 30 });
    expect(validateFileMeta({ name: "ok.csv", type: "text/csv", size: 1024 }, 0)).toBeNull();
    expect(validateFileMeta({ name: "huge.pdf", type: "application/pdf", size: 20_000_001 }, 0)).toBe("too_large");
    expect(validateFileMeta({ name: "empty.csv", type: "text/csv", size: 0 }, 0)).toBe("unreadable");
    expect(validateFileMeta({ name: "over.csv", type: "text/csv", size: 100 }, 30)).toBe("limit_exceeded");
    expect(validateFileMeta({ name: "image.png", type: "image/png", size: 100 }, 0)).toBe("unsupported_type");
  });

  it("computes real lowercase SHA-256 hex digest", async () => {
    const bytes = new TextEncoder().encode("prometeo");
    const hash = await sha256Hex(bytes);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(await sha256Hex(bytes));
  });

  it("detects csv, tsv, json, and pdf media types by extension or mime", () => {
    expect(detectMediaType("data.CSV", "")).toBe("text/csv");
    expect(detectMediaType("paper.pdf", "application/pdf")).toBe("application/pdf");
    expect(detectMediaType("records.json", "application/json")).toBe("application/json");
    expect(detectMediaType("table.tsv", "")).toBe("text/tab-separated-values");
    expect(detectMediaType("notes.exe", "application/octet-stream")).toBeNull();
  });

  it("persists and deduplicates documents cleanly in store", async () => {
    const store = createMemoryDocStore();
    const doc: UploadedDoc = {
      id: "doc_abc",
      name: "study.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 120,
      sha256: "a".repeat(64),
      status: "done",
      uploadedAt: "2026-11-15T00:00:00Z",
    };
    await store.save(doc, new Uint8Array([1, 2, 3]));
    expect((await store.list()).map((d) => d.id)).toEqual(["doc_abc"]);
    await store.remove("doc_abc");
    expect(await store.list()).toEqual([]);
  });

  it("deduplicates identical SHA-256 digests cleanly and respects D3_LIMITS.maxDocuments", () => {
    const makeDoc = (id: string, name: string, sha256: string): UploadedDoc => ({
      id,
      name,
      kind: "table",
      mediaType: "text/csv",
      bytes: 100,
      sha256,
      status: "done",
      uploadedAt: "2026-11-15T00:00:00Z",
    });

    const docA = makeDoc("doc_1", "file_a.csv", "sha_111");
    const docB = makeDoc("doc_2", "file_b.csv", "sha_222");
    const docDup = makeDoc("doc_3", "file_a_copy.csv", "sha_111");
    const docC = makeDoc("doc_4", "file_c.csv", "sha_333");

    const result = mergeUploadedDocs([docA], [docB, docDup, docC]);
    expect(result.docs.map((d) => d.id)).toEqual(["doc_1", "doc_2", "doc_4"]);
    expect(result.duplicates).toEqual(["file_a_copy.csv"]);

    // Test respecting D3_LIMITS.maxDocuments (30)
    const existingThirty = Array.from({ length: 30 }, (_, i) =>
      makeDoc(`doc_${i}`, `doc_${i}.csv`, `sha_${i}`)
    );
    const extraDoc = makeDoc("doc_extra", "extra.csv", "sha_extra");
    const overResult = mergeUploadedDocs(existingThirty, [extraDoc]);
    expect(overResult.docs).toHaveLength(30);
    expect(overResult.docs.map((d) => d.id)).not.toContain("doc_extra");
    expect(overResult.overflow).toEqual(["extra.csv"]);
    expect(result.overflow).toEqual([]);
  });
});
