# Design Spec — Flame Animations (`Animacion/`), Pleasant Gray Palette & Playwright Layout Fixes

**Date:** 2026-11-15  
**Size:** Focused UI/Visual Upgrade (Short Design)

## 1. Intent & Why
- **Problem 1 (Flame visibility & motion):** The flame animations across Prometeo wash out on light backgrounds, and need to adopt the multi-tongue campfire architecture from `Animacion/llama.html` and `Animacion/llama.css` (`.flame-main`, `.flame-left`, `.flame-right`, `.logs`, `.embers`, `.sparkles`) combined with Framer Motion.
- **Problem 2 (Eye comfort):** The current `#FDFCF9` bright white/cream page background is harsh on the eyes during extended reading; a pleasant, comfortable warm-stone gray palette is needed across the entire UI.
- **Problem 3 (Overlapping & misplaced information):** Visual audit with Playwright revealed several components where text or controls collide, overflow behind sibling cards, or run together.

## 2. Goals, Non-Goals & Constraints
- **Goals:**
  1. Upgrade all flame animations (`LaunchButton`, `ProcessingStep` loader, `ChamberFigure` / `chamber/build.ts`, `IsoBenchFigure`) using the `Animacion/` 3-tongue + logs/hearth + rising embers + sparkles structure with a high-contrast dark charcoal/crimson backing (Option A).
  2. Shift the global surface palette (`:root` in `report.css`, `flow.css`, `theme-prometeo.css`, `graph.css`, `workspace.css`) from bright white (`#FDFCF9`) to a comfortable, eye-friendly editorial gray (`--desk: #D6D4CE`, `--paper: #EAE8E3`, `--surface-elevated: #F2F0EC`, `--surface-inset: #DFDDD7`) with crisp ink contrast (`#181715`).
  3. Fix every layout collision and overlap identified with Playwright and verify visually across desktop and mobile viewports.
  4. Run/initialize the requested project tooling (`ui-ux-pro-max-cli`, `openspec`, `superpowers`, `framer-motion`, `ui-skills`, `impeccable`, `@playwright/cli`).
- **Non-Goals:**
  - Changing the deterministic engine logic (`web/src/engine/`) or breaking existing Vitest / `check_agnostic.sh` checks.
- **Constraints:**
  - `npm test` (54/54), `npm run build`, and `scripts/check_agnostic.sh` must remain 100% green.

## 3. Approaches Considered & Selected
- **Option A (Selected):** High-contrast charcoal/crimson combustion halo (`#1D1C1A` / `#2A120D` / `#A3271B`) behind the 3-tongue `Animacion/` flame (`#FF4500` → `#FF6B00` → `#FFD700`), paired with a comfortable soft-gray interface palette and Playwright-verified layout fixes. Chosen because it makes the golden/orange flame tongues pop naturally without jarring black boxes, while resting the reader's eyes.
- **Option B:** Literal `.campfire-loader` inside solid black rectangular badges on a white page. Rejected because the white page remained harsh on the eyes and black boxes broke the article layout.

## 4. Concrete Changes Found via Playwright Audit
1. **Pleasant Gray Theme (`report.css`, `flow.css`, `theme-prometeo.css`, `graph.css`, `workspace.css`):**
   - Replace intense white `#FDFCF9` with soft warm gray `#EAE8E3` (`--paper`), outer desk `#D8D6D0` (`--desk`), subtle recessed controls `#E0DED8`, and harmonious isometric face tones so nothing glares.
   - Blend `.cover-logo` and `.brand img` cleanly on the gray surface (`mix-blend-mode: multiply` / subtle frame).
2. **Flame Animations (`Animacion/` + Framer Motion):**
   - Create reusable `<CampfireFlame />` component faithful to `Animacion/llama.html` & `llama.css` (`.campfire-loader`, `.fire-container`, `.flame-main`, `.flame-left`, `.flame-right`, `.logs`, `.embers`, `.sparkles`) enhanced with Framer Motion and a dark charcoal/crimson contrast hearth so the flames stand out vividly.
   - Integrate into `LaunchButton.tsx` (button icon + full-screen combustion transition), `ProcessingStep.tsx` (harmonization header/status loader), `ChamberFigure.tsx` / `chamber/build.ts` (3-tongue microgravity plume + hearth + embers), and `IsoBenchFigure.tsx` (3-tongue sample flame + embers).
3. **Layout & Overlap Fixes (Playwright-verified):**
   - **ScenarioPanel (`report_top.png`) & Design Showcase:** Fix the 94px horizontal collision where `table.scn` overflows behind `.scn-iso-card` by stacking the table at full width and rendering a **large interactive design showcase stage** (in `ScenarioPanel` on the final Report interface, as well as in `Cover` and `ScenarioStep`) that displays a much larger animated isometric model + reactive `<CampfireFlame />` and telemetry for whichever design (`Lunar base`, `Space station`, `Spacesuit`, `Exploration vehicle`, `Pressurized rover`, or `Custom`) is currently selected, with selector buttons to switch designs directly on the stage.
   - **KnowledgeGraph Figure 4 (`report_kg.png`):** Increase repulsion/link distances and add label collision avoidance + halo stroke (`paint-order: stroke`) in `KnowledgeGraph.tsx` so study, variable, and material labels never pile up on top of each other; fix `.figctl` inactive chip opacity so mode buttons remain legible.
   - **MapFigure Figure 1 (`report_map.png`):** Add header padding inside the lower "not recorded" strip so jittered test marks never overlap the strip's title text, and add a background pill to the `Scenario:` label.
   - **HeatTable Figure 2 (`report_heat.png`):** Separate the closeness progress bar from the `<Src>` text link so the bar doesn't collide with the dotted link underline, and align the sort arrow cleanly in column headers.
   - **MLCard Section 4 (`report_ml.png`):** Fix missing spacing/layout between `<details><summary>` items (`"433 / 458 complete"` + `"approved inputs present"` and `"observed"` + `"missing"`) so they stack cleanly instead of running together.
   - **Side notes (`.row > .side`):** Align margin-top of `.side` when paired with `h2.sec` so sidebar callouts line up with their section heading.
