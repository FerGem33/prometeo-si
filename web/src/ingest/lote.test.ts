import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseTabularDocument } from "./csv";
import { extractPdfPages, parsePaperPages } from "./pdf";
import { extractVariablesFromDocs, buildPackFromDocs } from "./buildPack";
import { compileUiBlueprint, buildLensFromBlueprint } from "./blueprint";
import { sha256Hex, detectMediaType } from "./storage";
import type { UploadedDoc } from "./types";
import { evidenceLevels, rank, findings, gaps, graph } from "../engine";

const LOTE_DIR = process.env.PROMETEO_LOTE_DIR ?? "/home/alexteori/Descargas/lote";

describe("Real dataset validation: /home/alexteori/Descargas/lote", () => {
  it("successfully parses all 23 files in the lote dataset", async () => {
    const files = fs.readdirSync(LOTE_DIR).sort();
    expect(files.length).toBe(23);

    const uploadedDocs: UploadedDoc[] = [];

    for (const f of files) {
      const fullPath = path.join(LOTE_DIR, f);
      const buf = fs.readFileSync(fullPath);
      const bytes = new Uint8Array(buf);
      const hash = await sha256Hex(bytes);
      const mediaType = detectMediaType(f, "");
      expect(mediaType).not.toBeNull();

      if (f.endsWith(".csv")) {
        const table = parseTabularDocument(f, bytes, mediaType!);
        expect(table.headers.length).toBeGreaterThan(0);
        expect(table.rows.length).toBeGreaterThan(0);

        uploadedDocs.push({
          id: `doc_${hash.slice(0, 12)}`,
          name: f,
          kind: "table",
          mediaType: mediaType!,
          bytes: bytes.byteLength,
          sha256: hash,
          status: "done",
          uploadedAt: new Date().toISOString(),
          table,
        });
      } else if (f.endsWith(".pdf")) {
        const { pages, pageCount, metadataTitle } = await extractPdfPages(bytes);
        expect(pageCount).toBeLessThanOrEqual(60);
        expect(pages.length).toBeGreaterThan(0);

        const paper = parsePaperPages(pages, f);

        uploadedDocs.push({
          id: `doc_${hash.slice(0, 12)}`,
          name: f,
          kind: "paper",
          mediaType: mediaType!,
          bytes: bytes.byteLength,
          sha256: hash,
          status: "done",
          uploadedAt: new Date().toISOString(),
          paper: { ...paper, title: metadataTitle || paper.title },
        });
      }
    }

    expect(uploadedDocs.length).toBe(23);

    // 2. Extract variables
    const vars = extractVariablesFromDocs(uploadedDocs);
    expect(vars.length).toBeGreaterThan(10);
    const numVars = vars.filter((v) => v.type === "numeric");
    expect(numVars.length).toBeGreaterThan(2);

    // 3. Build Pack
    const { pack, mapping, suggestedScenario } = buildPackFromDocs(uploadedDocs, vars, {
      title: "NASA PSI Lote Evaluation",
      scope: "uploaded",
    });
    expect(mapping.tables.length).toBeGreaterThan(0);

    expect(pack.studies.length).toBe(23);
    expect(pack.records.length).toBeGreaterThan(50);
    expect(pack.sources.length).toBe(23);
    expect(suggestedScenario.active.length).toBeGreaterThan(0);

    // 4. Compile GenUI blueprint
    const instruction = "Enfoque en mapa de brechas y comparación entre estudios para variables de temperatura y gravedad; vista compacta";
    const blueprint = compileUiBlueprint(instruction, uploadedDocs, vars);
    expect(blueprint.density).toBe("compact");
    expect(blueprint.sectionOrder[0]).toBe("gaps");

    const lens = buildLensFromBlueprint(blueprint, pack, vars);
    expect(lens.default_axes.length).toBe(2);

    // 5. Verify deterministic engine passes without throwing
    const ev = evidenceLevels(pack, lens, suggestedScenario);
    expect(ev).toBeDefined();

    const ranked = rank(pack, suggestedScenario);
    expect(ranked.length).toBe(pack.studies.length);

    const fnd = findings(pack, lens, suggestedScenario);
    expect(fnd).toBeDefined();

    const gp = gaps(pack, {
      x: lens.default_axes[0],
      y: lens.default_axes[1],
      scenario: suggestedScenario,
    });
    expect(gp).toBeDefined();

    const gr = graph(pack, lens);
    expect(gr.nodes.length).toBeGreaterThan(0);
  }, 120000);
});
