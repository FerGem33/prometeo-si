# New Evaluation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild *New evaluation* (`#scenario` → `#processing` → `#report`) so users upload real documents (CSV/TSV/JSON/PDF), define GenUI interface instructions tailored to those documents, remove all scenario/habitat selection in `#scenario`, and configure scenarios strictly from variables extracted out of the uploaded documents.

**Architecture:** A new `web/src/ingest/` pipeline handles D3 validation, SHA-256 hashing, IndexedDB persistence, local CSV/TSV/JSON & PDF (`pdfjs-dist`) parsing, variable/record extraction, dynamic `prometeo.pack/1` construction, and `UiBlueprint` + `Lens` compilation with optional Bedrock Haiku 4.5 enrichment via new `POST /propose` and `POST /design` routes in `api/handler.py`. The existing deterministic engine (`web/src/engine/`) computes evidence levels, rankings, gaps, and knowledge graphs over custom packs unchanged, while `ScenarioStep`, `ProcessingStep`, `App`, `ScenarioPanel`, `Provenance`, and `AssistantPanel` adapt cleanly when a custom corpus + `UiBlueprint` is active.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 5, `pdfjs-dist`, Web Crypto (`SHA-256`), IndexedDB, Python 3.12 + `pytest` (`api/`), Playwright CLI (`playwright-cli`).

**Spec:** [docs/superpowers/specs/2026-11-15-new-evaluation-redesign-design.md](../specs/2026-11-15-new-evaluation-redesign-design.md)

## Global Constraints

- D3 limits must match `api/upload_tickets.py`: `<= 20,000,000` bytes per file, `<= 60` pages per PDF, `<= 30` documents per batch.
- Keep `Cover.tsx` (`NASA_MISSION_PRESETS`, isometric showcase, `Reference Habitats`), demo report controls, and existing unit tests (`presets.test.ts`, `tour.test.ts`, `golden.test.ts`, `extend.test.ts`, `dataset.test.ts`, `i18n/coverage.test.ts`) passing with zero regressions.
- Every UI string wrapped in `t()`, `tx()`, `count()`, or `plural()` must have a matching Spanish entry in `web/src/i18n/es/` preserving `{0}`, `{1}` placeholders (`coverage.test.ts`).
- `ScenarioStep.tsx` must contain **no** `Setting` step (`STEPS` has exactly 3 steps), **no** `quick-mission-bar`, and **no** habitat thumbnails.
- Never fabricate measurements or citations: every extracted variable/record must link back to a real uploaded `doc_id` with exact CSV `row`/`column` or PDF `page`/`quote`.

## Review Focus

- **0 or 1 numeric variable in custom corpus:** `MapFigure`, `GapFigure`, and `GraphicalAbstract` Radar must render informative fallback cards instead of crashing with `undefined!` when `< 2` numeric variables exist.
- **Scanned / encrypted / >60-page PDFs:** Must fail per document with explicit code (`no_text_layer`, `unreadable`, `too_many_pages`, `too_large`) while allowing valid files in the same batch to succeed.
- **Duplicate file uploads (identical SHA-256 or filename):** Must deduplicate cleanly and surface a status message rather than duplicating studies or test counts.
- **Custom corpus in `AssistantPanel`:** Must parse scenario condition text locally against `customPack.schema` and avoid calling the deployed demo-only Lambda `/ask` / `/analysis` with mismatched schema (preventing HTTP 400 console errors).
- **Floating `JudgeTour` pill overlap:** `.wiz` / `.screen-foot` bottom spacing must prevent the fixed bottom-right tour pill from covering `Continue` or `Submit` controls on desktop (`1440x900`).

---

### Task 1: Upload Types, D3 Validation, SHA-256 Hashing & IndexedDB Document Store

**Files:**
- Modify: `web/package.json` (install `pdfjs-dist` via `npm install`)
- Create: `web/src/ingest/types.ts`
- Create: `web/src/ingest/storage.ts`
- Test: `web/src/ingest/storage.test.ts`

**Interfaces:**
- Produces in `web/src/ingest/types.ts`:
  `D3_LIMITS`, `UploadedDoc`, `ParsedRow`, `ParsedPage`, `ExtractedVariable`, `VariableCitation`, `DocStatus`, `CorpusScope`
- Produces in `web/src/ingest/storage.ts`:
  `validateFileMeta(file: { name: string; type: string; size: number }, existingCount: number): DocErrorCode | null`
  `sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string>`
  `detectMediaType(name: string, mime: string): SupportedMediaType | null`
  `createDocStore(dbFactory?: IDBFactory): DocStore` (`save(doc, blob)`, `list()`, `get(id)`, `remove(id)`, `clear()`)
  `createMemoryDocStore(): DocStore`
  `mergeUploadedDocs(existing: UploadedDoc[], incoming: UploadedDoc[]): { docs: UploadedDoc[]; duplicates: string[] }`

- [ ] **Step 1: Install `pdfjs-dist` in `web/`**

Run: `cd Frontend/prometeo-si/web && npm install pdfjs-dist`
Expected: `added` package in `web/package.json` and `package-lock.json` with exit code 0.

- [ ] **Step 2: Write the failing tests for D3 validation, hashing, and document storage**

Create `web/src/ingest/storage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { D3_LIMITS } from "./types";
import { detectMediaType, sha256Hex, validateFileMeta, createMemoryDocStore } from "./storage";

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
    const doc = {
      id: "doc_abc",
      name: "study.csv",
      kind: "table" as const,
      mediaType: "text/csv" as const,
      bytes: 120,
      sha256: "a".repeat(64),
      status: "done" as const,
      uploadedAt: "2026-11-15T00:00:00Z",
    };
    await store.save(doc, new Uint8Array([1, 2, 3]));
    expect((await store.list()).map((d) => d.id)).toEqual(["doc_abc"]);
    await store.remove("doc_abc");
    expect(await store.list()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/storage.test.ts`
Expected: FAIL because `./types` and `./storage` do not exist.

- [ ] **Step 4: Implement `web/src/ingest/types.ts` and `web/src/ingest/storage.ts`**

Define all shared ingestion, variable proposal, citation, and blueprint types in `types.ts`, and implement Web Crypto SHA-256, D3 checks, IndexedDB store (`openDB` on `"prometeo-docs-db"`), plus `createMemoryDocStore()` (used in node tests and fallback when `indexedDB` is unavailable).

- [ ] **Step 5: Run test to verify it passes and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/storage.test.ts`
Expected: 4 tests PASS.
Commit: `git -C Frontend/prometeo-si add web/package.json web/package-lock.json web/src/ingest/types.ts web/src/ingest/storage.ts web/src/ingest/storage.test.ts && git -C Frontend/prometeo-si commit -m "feat(ingest): add upload types, D3 validation, SHA-256, and document store"`

---

### Task 2: RFC-4180 CSV / TSV / JSON Parser with Unit Detection (`web/src/ingest/csv.ts`)

**Files:**
- Create: `web/src/ingest/csv.ts`
- Test: `web/src/ingest/csv.test.ts`

**Interfaces:**
- Consumes: `ParsedTableResult`, `DetectedColumn` from `./types`
- Produces:
  `parseCsvText(text: string, delimiter?: string): { headers: string[]; rows: { row: number; values: string[] }[] }`
  `parseJsonTableText(text: string): { headers: string[]; rows: { row: number; values: string[] }[] }`
  `parseTabularDocument(name: string, bytes: Uint8Array, mediaType: SupportedMediaType): ParsedTableResult`
  `splitHeaderUnit(header: string): { label: string; unit: string | null }`

- [ ] **Step 1: Write failing tests for CSV, TSV, JSON tables and header unit parsing**

Test quoted multiline fields, UTF-8 BOM, comma vs tab vs semicolon auto-detection, header unit extraction (`"Oxygen (%)"` → `{ label: "Oxygen", unit: "%" }`, `"Pressure [kPa]"` → `{ label: "Pressure", unit: "kPa" }`), numeric vs categorical column profiling, and JSON object arrays / `{ records: [...] }` unwrapping.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/csv.test.ts`
Expected: FAIL (`Cannot find module './csv'`).

- [ ] **Step 3: Implement `web/src/ingest/csv.ts`**

Implement RFC-4180 stateful parser (multiline quoted cells count logical row numbers starting at 2), `TextDecoder` UTF-8 fallback Latin-1, unit extraction regex supporting `(unit)`, `[unit]`, and `, unit` suffixes matching `UNIT_GROUPS` symbols, and column stats (`numericCount`, `nonEmptyCount`, unique `categories`, `[min, max]`, sample cells with `row`).

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/csv.test.ts`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add web/src/ingest/csv.ts web/src/ingest/csv.test.ts && git -C Frontend/prometeo-si commit -m "feat(ingest): parse CSV, TSV, and JSON tables with unit inference"`

---

### Task 3: PDF Text Layer Extractor & Paper Measurement/Citation Parser (`web/src/ingest/pdf.ts`)

**Files:**
- Create: `web/src/ingest/pdf.ts`
- Test: `web/src/ingest/pdf.test.ts`

**Interfaces:**
- Consumes: `ParsedPage`, `ParsedPaperResult` from `./types`
- Produces:
  `extractPdfPages(bytes: Uint8Array): Promise<{ pages: ParsedPage[]; pageCount: number; metadataTitle?: string }>` (using `pdfjs-dist` with local bundled worker URL via `?url` or worker setup safe in Vite & tests)
  `parsePaperPages(pages: ParsedPage[], fallbackName: string): ParsedPaperResult` (pure function extracting DOI, title heuristic, candidate quantitative/categorical variable findings with literal page quotes!)

- [ ] **Step 1: Write failing tests for paper variable/citation parsing and page-limit/text-layer guards**

In `web/src/ingest/pdf.test.ts`:
- Test `parsePaperPages` on realistic multi-page paper text containing `"DOI: 10.1016/j.combust.2024.01"`, `"Temperature: 320–480 K"`, `"Electrolyte concentration = 1.2 M"`, `"Substrate: Graphite vs Silicon"`: verify it extracts variables with `unit`, `[min, max]` or `categories`, and **exact literal `quote`** substrings matching the supplied page text.
- Test real `pdfjs-dist` extraction against a minimal valid in-memory synthetic PDF buffer AND verify empty-text PDF throws `no_text_layer` and >60-page PDF throws `too_many_pages`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/pdf.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `web/src/ingest/pdf.ts`**

Configure `pdfjs-dist` worker cleanly (`import * as pdfjs from "pdfjs-dist"` and Vite-safe `pdfjs-dist/build/pdf.worker.min.mjs?url` when `typeof window !== "undefined"`), extract sorted text items per page preserving line breaks, enforce `maxPages = 60` and non-empty text check, and implement pure `parsePaperPages(pages, fallbackName)` extracting DOIs (`10.\d{4,9}/[-._;()/:A-Za-z0-9]+`), key-value/range patterns with known physical/scientific units, and verbatim sentence quotes (`<= 240` chars, strictly sliced from `page.text`).

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/pdf.test.ts`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add web/src/ingest/pdf.ts web/src/ingest/pdf.test.ts && git -C Frontend/prometeo-si commit -m "feat(ingest): extract PDF pages, variables, DOIs, and verbatim citations"`

---

### Task 4: Dynamic Variable Extractor, Unit Canonicalizer & `Pack` Builder (`web/src/ingest/buildPack.ts`)

**Files:**
- Create: `web/src/ingest/buildPack.ts`
- Test: `web/src/ingest/buildPack.test.ts`

**Interfaces:**
- Consumes: `UploadedDoc`, `ExtractedVariable`, `CorpusScope` from `./types`; `Pack`, `Lens`, `DataRecord`, `Variable` from `../engine`; `Mapping` from `../components/ctx`
- Produces:
  `extractVariablesFromDocs(docs: UploadedDoc[], remoteProposals?: VariableProposalRemote[]): ExtractedVariable[]`
  `buildPackFromDocs(docs: UploadedDoc[], vars: ExtractedVariable[], options: { title?: string; scope: CorpusScope; demoPack?: Pack; demoMapping?: Mapping }): { pack: Pack; mapping: Mapping; suggestedScenario: Scenario }`

- [ ] **Step 1: Write failing tests verifying engine compatibility (`evidenceLevels`, `rank`, `findings`, `graph`)**

In `web/src/ingest/buildPack.test.ts`:
- Build 2 uploaded docs (one CSV table with `Temperature (°C)`, `Voltage (V)`, `Cathode`, `Capacity_mAh_g`; one PDF paper mentioning `Temperature 25–60 °C`, `Electrolyte: LiPF6`) and run `extractVariablesFromDocs` → verify both CSV columns and PDF variables appear with `evidence` citations and real ranges.
- Run `buildPackFromDocs` and pass the resulting `pack` + minimal `lens` + `suggestedScenario` directly into `evidenceLevels`, `rank`, `findings`, `gaps`, and `graph` from `../engine`: verify zero thrown exceptions, accurate `pack.sources` with SHA-256, `pack.studies` matching the uploaded docs, and every record `source.id` resolving cleanly.
- Verify combining with `demoPack` when `scope === "combine"` preserves all demo studies + adds custom studies cleanly without ID collisions.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/buildPack.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `web/src/ingest/buildPack.ts`**

Deduplicate variable slugs across CSV/PDF docs (normalizing unit equivalents like `kPa` vs `atm` vs `psi`, `°C` vs `K` where unambiguous), compute realistic `sigma` (`Math.max((hi - lo) * 0.15, 1e-3)`), detect outcome columns in CSVs (`rate`, `yield`, `capacity`, `spread`, `outcome`, `efficiency`, `status`, `loss`) to store verbatim in `record.outcomes` for `MLCard`, populate `pack.records` for both CSV rows (`confidence: "table"`, `source: { id, row }`) and PDF mentions (`confidence: "paper"`, `source: { id, page }`, `quote`), and initialize `suggestedScenario` using **median** for numeric vars and **mode** for categorical vars.

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/buildPack.test.ts`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add web/src/ingest/buildPack.ts web/src/ingest/buildPack.test.ts && git -C Frontend/prometeo-si commit -m "feat(ingest): extract variables and build engine-compatible custom packs"`

---

### Task 5: Adaptive GenUI `UiBlueprint` & `Lens` Compiler (`web/src/ingest/blueprint.ts`)

**Files:**
- Create: `web/src/ingest/blueprint.ts`
- Test: `web/src/ingest/blueprint.test.ts`

**Interfaces:**
- Consumes: `ExtractedVariable`, `UploadedDoc`, `UiBlueprint`, `ReportSectionId` from `./types`; `Pack`, `Lens` from `../engine`
- Produces:
  `suggestDesignPrompts(docs: UploadedDoc[], vars: ExtractedVariable[]): string[]`
  `compileUiBlueprint(instruction: string, docs: UploadedDoc[], vars: ExtractedVariable[], presetFlags?: DesignPresetFlag[], remoteBlueprint?: Partial<UiBlueprint>): UiBlueprint`
  `buildLensFromBlueprint(blueprint: UiBlueprint, pack: Pack, vars: ExtractedVariable[], baseLens?: Lens): Lens`

- [ ] **Step 1: Write failing tests for prompt suggestions, bilingual ES/EN blueprint compilation, and `Lens` generation**

Test:
- `suggestDesignPrompts` mentions real variable labels extracted from the uploaded documents (no NASA combustion words when corpus is batteries/biomedicine).
- `compileUiBlueprint("Prioriza mapa de brechas y grafo entre estudios; vista compacta sin tarjeta ML", docs, vars)` sets `sectionOrder[0]` or prioritized order starting with `gaps`/`graph`, `density === "compact"`, `hideMlCard === true`, and `defaultAxes` chosen strictly from numeric variable IDs present in `vars`.
- Mentioning specific variable names in `instruction` puts those IDs first in `highlightedVariables` and `defaultAxes`.
- `buildLensFromBlueprint` builds valid `parts` grouping `vars`, `presets: []` (for custom corpus), valid `default_axes`, and dynamic `title` / `byline` reflecting uploaded corpus.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/blueprint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `web/src/ingest/blueprint.ts`**

Implement corpus-aware bilingual (ES/EN) directive parser (`gaps`/`brechas`/`huecos`, `graph`/`grafo`/`red`/`citas`, `compare`/`comparar`/`ranking`/`tabla`, `compact`/`compacta`/`ejecutivo`, `hide ml`/`sin ml`/`ocultar ml`, variable name matching), validate any remote `/design` JSON strictly against allowed variable IDs and section enums (`VALID_SECTIONS`), and build a valid `Lens` matching `engine/types.ts`.

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/blueprint.test.ts`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add web/src/ingest/blueprint.ts web/src/ingest/blueprint.test.ts && git -C Frontend/prometeo-si commit -m "feat(genui): compile document-driven UI design instructions into UiBlueprint and Lens"`

---

### Task 6: Optional Lambda Bedrock Endpoints `/propose` & `/design` (`api/handler.py` + `web/src/ingest/remote.ts`)

**Files:**
- Modify: `api/handler.py`
- Create: `api/test_genui.py`
- Create: `web/src/ingest/remote.ts`

**Interfaces:**
- Produces in `api/handler.py`:
  `POST /propose`: validates `{ documents: [{ id, name, kind, headers?, sample?, pages? }] }` (`<= 128 KB`), calls Bedrock `MODEL_ID` reusing `ingest_propose` schema constraints, filters out any variable without literal source quote/sample verification.
  `POST /design`: validates `{ instruction, variables: [{ id, label, type, unit }], stats }`, calls Bedrock `MODEL_ID` returning strictly schema-validated `UiBlueprint` fields (`sectionOrder`, `highlightedVariables`, `variableGroups`, `defaultAxes`, `title`, `density`, `hideMlCard`, `rationale`).
- Produces in `web/src/ingest/remote.ts`:
  `requestRemoteProposals(docs: UploadedDoc[], signal: AbortSignal): Promise<VariableProposalRemote[] | null>` (returns `null` gracefully on network/404/503 without throwing)
  `requestRemoteDesign(instruction: string, docs: UploadedDoc[], vars: ExtractedVariable[], signal: AbortSignal): Promise<Partial<UiBlueprint> | null>`

- [ ] **Step 1: Write failing tests in `api/test_genui.py`**

Test `handler({'rawPath': '/propose', ...})` and `handler({'rawPath': '/design', ...})` with mocked `model_json`: verify invalid variable IDs invented by the model are stripped in `/design`, unverified citations are stripped in `/propose`, oversized bodies return `400`, and model errors degrade cleanly without leaking internals.

- [ ] **Step 2: Run Python test to verify it fails**

Run: `cd Frontend/prometeo-si && python3 -m pytest api/test_genui.py -q` (or `api/.venv/bin/python -m pytest` if venv exists)
Expected: FAIL (`404 Not found`).

- [ ] **Step 3: Implement `/propose` & `/design` in `api/handler.py` and client bridge in `web/src/ingest/remote.ts`**

Add `/propose` and `/design` routes alongside `/ask` and `/analysis` in `api/handler.py` with strict allowlists and `<untrusted_data>` wrapping matching existing `api/handler.py` security posture, plus `web/src/ingest/remote.ts` using `postApi` from `../report/api` with short timeout & silent fallback to `null`.

- [ ] **Step 4: Run `pytest` on full `api/` suite and commit**

Run: `cd Frontend/prometeo-si && python3 -m pytest api/test_genui.py -q`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add api/handler.py api/test_genui.py web/src/ingest/remote.ts && git -C Frontend/prometeo-si commit -m "feat(api): add Bedrock /propose and /design routes with strict validation"`

---

### Task 7: Redesign `ScenarioStep.tsx` (3 Steps, Real Upload, UI Design Step, Extracted Variables, Zero Scenarios) & Fix `flow.css`

**Files:**
- Modify: `web/src/components/ScenarioStep.tsx`
- Modify: `web/src/components/JudgeTour.tsx` (update stop 2 pitch to match document upload & GenUI instructions without breaking `tour.test.ts`)
- Modify: `web/src/styles/flow.css`
- Test: `web/src/components/ScenarioStep.test.ts`

**Interfaces:**
- Consumes: `storage.ts`, `csv.ts`, `pdf.ts`, `buildPack.ts`, `blueprint.ts`
- Produces:
  Updated `EvaluationDraft` type (`docs: UploadedDoc[]`, `scope: CorpusScope`, `instruction: string`, `presetFlags: DesignPresetFlag[]`, `variables: ExtractedVariable[]`, `blueprint: UiBlueprint`, `pack: Pack`, `lens: Lens`, `mapping: Mapping`, `scenario: Scenario`, `extras: Extra[]`, `isCustomCorpus: boolean`).
  Updated `ScenarioStep` props (`onRun: (draft: EvaluationDraft) => void`, plus demo defaults cleanly handled).

- [ ] **Step 1: Write failing tests checking 3-step structure, zero scenario selectors in source/helper, and variable extraction transition**

Create `web/src/components/ScenarioStep.test.ts` verifying:
- `SCENARIO_STEPS` exports `["Documents", "Interface design", "Variables"]` (`length === 3`, does not contain `"Setting"` or `"Question"`).
- `NASA_MISSION_PRESETS` and `allHabitatPresets` are not imported or rendered in `ScenarioStep.tsx`.
- `mergeUploadedDocs` from `../ingest/storage` deduplicates by SHA-256 and enforces D3 limits.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/components/ScenarioStep.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement redesigned `ScenarioStep.tsx`, styling in `flow.css`, and stop 2 text in `JudgeTour.tsx`**

In `ScenarioStep.tsx`:
1. **3-step bar (`SCENARIO_STEPS = ["Documents", "Interface design", "Variables"]`):** no `Setting` step, no `quick-mission-bar`, no `HabitatFigure` thumbnail.
2. **Step 1 (`Documents`):** Real file ingestion (`input[type=file]` + drag/drop) computing SHA-256, saving to IndexedDB store, parsing CSV/TSV/JSON (`csv.ts`) and PDF (`pdf.ts`), displaying per-document chips/status (`rows`/`pages`, `SHA-256` prefix, error badge if rejected, `Remove` button), corpus scope toggle (own uploaded corpus vs combine/demo), and optional `"Analyze with AI (/propose)"` enrichment when available.
3. **Step 2 (`Interface design`):** Shows live corpus summary badge, dynamic corpus-derived suggestion chips (`suggestDesignPrompts`), combinable GenUI focus chips (`gaps`, `compare`, `graph`, `compact`), `<textarea>` for interface design instructions, and a live preview of the resulting `UiBlueprint` (`variablesLayout`, prioritized variables, section order, default X/Y axes).
4. **Step 3 (`Variables`):** Displays extracted variables grouped per `blueprint.variableGroups` / `variablesLayout`, lets user toggle include/exclude, inspect citation quote/file/page-or-row badge, edit value/category/label (initialized at real median/mode), and add manual variables (`AddExtra`).
5. In `flow.css`: add styling for uploaded document rows, status pills, GenUI blueprint preview pills, group layout (`grouped` / `grid` / `list`), citation badges, and add `padding-bottom: 84px` on `.wiz` / `.screen-foot` so `.judge-tour-pill-wrap` never overlaps bottom action buttons.

- [ ] **Step 4: Run test suite for Step tests and commit**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/components/ScenarioStep.test.ts src/components/tour.test.ts src/components/presets.test.ts`
Expected: PASS.
Commit: `git -C Frontend/prometeo-si add web/src/components/ScenarioStep.tsx web/src/components/ScenarioStep.test.ts web/src/components/JudgeTour.tsx web/src/styles/flow.css && git -C Frontend/prometeo-si commit -m "feat(ui): rebuild New Evaluation as 3-step document upload, GenUI design, and extracted variables flow"`

---

### Task 8: Wire Real `ProcessingStep`, Adaptive `Report` (`App.tsx`), Chart Guards, `ScenarioPanel`, `Provenance`, `AssistantPanel`, & Complete Spanish i18n

**Files:**
- Modify: `web/src/components/ProcessingStep.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/MapFigure.tsx`
- Modify: `web/src/components/Tables.tsx` (`GapFigure`)
- Modify: `web/src/components/GraphicalAbstract.tsx`
- Modify: `web/src/components/ScenarioPanel.tsx`
- Modify: `web/src/components/Provenance.tsx`
- Modify: `web/src/components/AssistantPanel.tsx`
- Create: `web/src/ingest/localAsk.ts`
- Modify: `web/src/i18n/es/flow.ts` (and `report.ts` if needed for any `report` component strings)
- Test: `web/src/ingest/localAsk.test.ts`

**Interfaces:**
- Consumes: `EvaluationDraft`, `UiBlueprint` from `ScenarioStep` / `ingest/types`
- Produces:
  - `ProcessingStep` executing real async validation/finalization (`remoteProposals` / `remoteDesign` optional upgrade + pack finalization) or fast animated demo pass, invoking `onComplete(finalDraft)`.
  - `App.tsx` holding active `{ pack, lens, mapping, blueprint, isCustomCorpus }`, dynamically ordering/folding/hiding report bands according to `blueprint`, and restoring demo bundle when user clicks `"See the example report"` or returns to demo presets.
  - `interpretLocalQuestion(question: string, pack: Pack): Scenario | { unsupported: string }` in `web/src/ingest/localAsk.ts`, used by `AssistantPanel.tsx` when `isCustomCorpus` is true so zero 400 API calls hit the fixed NASA `/ask` Lambda.
  - `Provenance.tsx` rendering `Page` and verbatim `r.quote` box when `r.confidence === "paper"` / `r.source.page`.

- [ ] **Step 1: Write failing test for local custom-corpus question interpreter + complete ES i18n coverage**

Test local question matching against arbitrary schema variables (e.g., `"Set Temperature to 350 K and Voltage 4.1 V"` updates `Scenario`), AND guard behavior on `Pack` with `< 2` numeric variables.

- [ ] **Step 2: Run failing tests**

Run: `cd Frontend/prometeo-si/web && npx vitest run src/ingest/localAsk.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `ProcessingStep.tsx`, `App.tsx`, `MapFigure.tsx`, `Tables.tsx`, `GraphicalAbstract.tsx`, `ScenarioPanel.tsx`, `Provenance.tsx`, `AssistantPanel.tsx`, and `web/src/i18n/es/flow.ts`**

Apply each targeted edit cleanly, ensure every new `t()`/`tx()` string across all edited files is added to `web/src/i18n/es/flow.ts` (matching placeholders), and keep TypeScript strict (`tsc --noEmit`).

- [ ] **Step 4: Run ALL Vitest unit tests + i18n coverage + TypeScript + Vite build**

Run: `cd Frontend/prometeo-si/web && npm test -- --run && npm run build`
Expected: All non-env-gated tests PASS including `i18n/coverage.test.ts`, `tsc --noEmit` exits 0, `vite build` exits 0.
Commit: `git -C Frontend/prometeo-si add web/src api/ && git -C Frontend/prometeo-si commit -m "feat(report): wire real processing, GenUI blueprint layout, provenance quotes, and ES i18n"`

---

### Task 9: Full End-to-End & Visual Verification via Playwright (`playwright-cli`) + Clean Cleanup

**Files:**
- None modified (verification only; temporary fixture files and screenshots placed only under `/home/alexteori/.gemini/antigravity-cli/brain/eb0d8f35-cd6a-44d6-b392-a513b43effee/scratch/`).

- [ ] **Step 1: Run complete backend & frontend automated suites**

Run:
- `cd Frontend/prometeo-si/web && npm test -- --run && npm run build`
- `cd Frontend/prometeo-si && python3 -m pytest api/test_genui.py api/test_verify.py -q` (and check full `api/` suite if `.venv` available)
- `git -C Frontend/prometeo-si diff --check`

- [ ] **Step 2: Run Playwright E2E walkthrough against local Vite dev server**

Create sample realistic CSV table + real synthetic PDF paper in brain `scratch/`, launch Vite dev server in background, use `playwright-cli` to verify:
1. Cover (`#`) still shows `One-Click Mission Evaluations` and `Reference Habitats (6)`.
2. Click `Begin evaluation` (`#scenario`):
   - Step bar shows **only 3 steps** (`Documents`, `Interface design`, `Variables`).
   - **No** `Setting` step and **no** `1-Click NASA Missions` bar anywhere inside `#scenario`.
   - Upload real `.csv` + `.pdf` files via `playwright-cli upload`: verify real extracted metadata (rows, pages, SHA-256) renders cleanly and persists.
   - Advance to Step 2 (`Interface design`): verify dynamic corpus-aware chips appear; enter custom design instructions (e.g., prioritize gaps + study comparison, compact view); verify `UiBlueprint` preview updates.
   - Advance to Step 3 (`Variables`): verify extracted variables come strictly from the uploaded `.csv`/`.pdf` (with source/page/row provenance badges and real medians — no lunar base thumbnail, no hardcoded O2/PMMA).
   - Click submit → watch real `ProcessingStep` → arrive at adapted `#report`.
   - Verify adapted `#report` title, section order, variable controls, PDF/CSV provenance modal (`Provenance`), Light/Dark toggle, and EN/ES toggle with **0 console errors**!
3. View all captured screenshots using `read_file`, close `playwright-cli`, and stop background dev server.
