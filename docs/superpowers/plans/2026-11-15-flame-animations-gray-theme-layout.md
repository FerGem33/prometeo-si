# Implementation Plan — Flame Animations (`Animacion/`), Pleasant Gray Palette, Large Selected-Design Showcase & Playwright Layout Fixes

**Goal:** Upgrade all flame animations using `Animacion/llama.html` & `Animacion/llama.css` + Framer Motion with high-contrast dark charcoal/crimson backing (Option A), apply an eye-friendly soft-gray theme across the entire UI, render a large interactive animated showcase depending on the selected design in the final interface (`ScenarioPanel` in `Report`, plus `Cover` and `ScenarioStep`), and fix every layout/overlap bug found via Playwright.

**Architecture:**
- Create reusable `web/src/components/CampfireFlame.tsx` implementing `.campfire-loader`, `.fire-container`, `.flame-main`, `.flame-left`, `.flame-right`, `.logs`, `.embers`, and `.sparkles` from `Animacion/` enhanced with Framer Motion (`motion.div`) and a high-contrast dark hearth halo (`#1D1C1A` / `#2A120D` / `#A3271B`) so golden/orange flame tongues pop on any surface.
- Update `:root` tokens in `web/src/styles/report.css` and companion CSS files (`flow.css`, `theme-prometeo.css`, `graph.css`, `workspace.css`, `app.css`) to a pleasant warm-stone gray palette (`--paper: #EAE8E3`, `--desk: #D5D3CD`, `--surface-card: #F1EFEA`, `--surface-control: #DFDDD7`).
- Redesign `ScenarioPanel.tsx` (in the final Report interface), `Cover.tsx`, and `ScenarioStep.tsx` so selecting any design (`Lunar base`, `Space station`, `Spacesuit`, `Exploration vehicle`, `Pressurized rover`, `Custom`, `Chamber`, `Optical Test Bench`) displays a large interactive animated preview + live `<CampfireFlame />` reactive to the chosen atmosphere, while giving `table.scn` 100% width with zero horizontal collision.
- Fix all Playwright-detected collisions in `KnowledgeGraph.tsx`, `MapFigure.tsx`, `Tables.tsx`, and `MLCard.tsx`.

---

### Task 1: Project Tooling Verification
- **Commands:** Verify/initialize `framer-motion` (in `web/`), `ui-ux-pro-max-cli`, `openspec`, `superpowers`, `ui-skills`, `impeccable`, and Playwright CLI without overwriting existing project source files.

### Task 2: Reusable `<CampfireFlame />` Component & All Flame Animations (`Animacion/` + Framer Motion)
- **Create:** `web/src/components/CampfireFlame.tsx`
- **Modify:**
  - `web/src/components/LaunchButton.tsx`
  - `web/src/components/ProcessingStep.tsx`
  - `web/src/App.tsx`
  - `web/src/components/ChamberFigure.tsx`
  - `web/src/iso/chamber/build.ts`
  - `web/src/components/IsoBenchFigure.tsx`
  - `web/src/styles/flow.css`
  - `web/src/iso/theme-prometeo.css`
- **Verification:** Visual inspection via Playwright across Cover, ScenarioStep, ProcessingStep, and Report; unit tests pass.

### Task 3: Pleasant Eye-Friendly Gray Theme
- **Modify:**
  - `web/src/styles/report.css`
  - `web/src/styles/flow.css`
  - `web/src/styles/app.css`
  - `web/src/styles/graph.css`
  - `web/src/styles/workspace.css`
  - `web/src/iso/theme-prometeo.css`
- **Verification:** Confirm computed `backgroundColor` of `body` and `main.page` are soft gray (`#EAE8E3` / `#D5D3CD`) and logos blend cleanly (`mix-blend-mode: multiply`).

### Task 4: Large Dynamic Design Animation Stage & Playwright Overlap Fixes
- **Modify:**
  - `web/src/components/ScenarioPanel.tsx` (Full-width `table.scn` + Large Interactive Selected-Design Stage with all 6 designs selectable, large animated `HabitatFigure` `size={300}`, and live `<CampfireFlame />` scaled by O₂ % and pressure)
  - `web/src/components/Cover.tsx` (Large featured selected-design stage in the "Reference Habitats (6)" tab alongside clickable thumbnail cards, plus enhanced Chamber & Bench plates)
  - `web/src/components/ScenarioStep.tsx` (Larger interactive preview stage (`size={240}`) + live `<CampfireFlame />` indicator when picking a design)
  - `web/src/components/HabitatFigure.tsx` (Support larger hero scale, richer continuous CSS/Framer animations per design, and optional live flame/atmosphere badge)
  - `web/src/components/KnowledgeGraph.tsx` & `web/src/styles/graph.css` (Stronger node separation, label collision solver, `paint-order: stroke` halo, clear `.figctl` buttons)
  - `web/src/components/MapFigure.tsx` (Increased lower strip padding `STRIP_H = 82` so jittered `xOnly` test marks never overlap the strip header text)
  - `web/src/components/Tables.tsx` & `web/src/styles/app.css` (`HeatTable` `.bar` separated from `<Src>` dotted underline; `.row > .side` aligned with `h2.sec`)
  - `web/src/components/MLCard.tsx` & `web/src/styles/report.css` (Proper spacing between `<details>` blocks and adjacent labels in Table 5)

### Task 5: End-to-End Playwright Visual Audit, Unit Tests & Agnostic Check
- **Run:**
  - `node /home/alexteori/.gemini/antigravity-cli/brain/07d2cd9b-6bf2-4cd8-8a7d-64d81e4985c2/scratch/audit_ui.mjs`
  - `cd web && npm test`
  - `cd web && npm run build`
  - `bash scripts/check_agnostic.sh`
