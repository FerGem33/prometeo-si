# Contest-Winning Frontend Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Prometeo frontend into a contest-winning, presentation-ready scientific application featuring a 3-minute guided judge tour, 1-click NASA mission presets, real-time "What-If" delta simulation, enhanced multi-format dossier export, and optional telemetry audio feedback, without touching the Graphical Abstract or live AI activation.

**Architecture:**
- Create `web/src/components/JudgeTour.tsx` with high-contrast spotlight overlays, step guidance, and stage auto-navigation so judges understand the product in 3 minutes.
- Build 1-click NASA Mission Presets in `Cover.tsx` and `ScenarioStep.tsx` (Artemis Lunar Base, ISS Module, EVA Ingress, Pressurized Rover) for instant evaluation.
- Implement a real-time "What-If" Delta Simulator in `ScenarioPanel.tsx` comparing the current scenario against the baseline with safety impact indicators.
- Upgrade `DossierModal.tsx` with 1-click Markdown copy for mission directors, print-ready PDF styling, and CSV/JSON downloads.
- Add an optional subtle Web Audio telemetry synthesizer (`sound.ts`) with a mute toggle for high-tech sensory feedback.

**Tech Stack:** React 18, TypeScript, Framer Motion, Web Audio API, Vitest.

---

### Task 1: 1-Click NASA Mission Presets in `Cover.tsx` & `ScenarioStep.tsx`

**Files:**
- Modify: `web/src/components/Cover.tsx`
- Modify: `web/src/components/ScenarioStep.tsx`
- Create test: `web/src/components/presets.test.ts`

- [ ] **Step 1: Write unit test for mission preset data structures and values**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement Mission Presets grid in `Cover.tsx` with 1-click launch**
- [ ] **Step 4: Implement quick-preset bar in `ScenarioStep.tsx`**
- [ ] **Step 5: Run tests and verify they pass**

---

### Task 2: Real-time "What-If" Delta Simulator in `ScenarioPanel.tsx`

**Files:**
- Modify: `web/src/components/ScenarioPanel.tsx`
- Create: `web/src/report/whatif.ts`
- Create test: `web/src/report/whatif.test.ts`

- [ ] **Step 1: Write test for delta calculations ($\Delta O_2$, $\Delta P$, $\Delta\sigma$)**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `computeWhatIfDelta` in `web/src/report/whatif.ts`**
- [ ] **Step 4: Integrate What-If comparison drawer in `ScenarioPanel.tsx`**
- [ ] **Step 5: Run tests and verify they pass**

---

### Task 3: Interactive 3-Minute Judge Presentation Tour

**Files:**
- Create: `web/src/components/JudgeTour.tsx`
- Create: `web/src/styles/tour.css`
- Modify: `web/src/App.tsx`
- Create test: `web/src/components/tour.test.ts`

- [ ] **Step 1: Write unit test for tour steps and navigation state**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `JudgeTour.tsx` with 5 guided stops (Cover, Scenario, Chamber Telemetry, Report Verdict, Dossier)**
- [ ] **Step 4: Style floating tooltips and spotlight overlay in `tour.css`**
- [ ] **Step 5: Mount `JudgeTour` in `App.tsx` with launch trigger**
- [ ] **Step 6: Run tests and verify they pass**

---

### Task 4: Multi-Format Mission Dossier Export in `DossierModal.tsx`

**Files:**
- Modify: `web/src/components/DossierModal.tsx`
- Modify: `web/src/styles/report.css`
- Create test: `web/src/report/dossier.test.ts`

- [ ] **Step 1: Write unit test for Markdown and JSON export generators**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add Executive Summary Markdown copy, PDF print trigger, and JSON export buttons in `DossierModal.tsx`**
- [ ] **Step 4: Add `@media print` styling in `report.css`**
- [ ] **Step 5: Run tests and verify they pass**

---

### Task 5: Web Audio Mission Telemetry SFX Engine

**Files:**
- Create: `web/src/report/sound.ts`
- Modify: `web/src/components/ChamberFigure.tsx`
- Modify: `web/src/components/LaunchButton.tsx`

- [ ] **Step 1: Implement zero-dependency Web Audio telemetry click/hum generator in `sound.ts` with local storage mute persistence**
- [ ] **Step 2: Connect subtle audio cues to chamber stage changes and launch button**
- [ ] **Step 3: Add sound toggle button in the header bar**

---

### Task 6: Full Verification & Build Validation

**Files:**
- Run: `npm test` in `web/`
- Run: `npm run build` in `web/`
- Run: `bash scripts/check_agnostic.sh`
- Run: `PYTHONPATH=. pytest api/ pipeline/`

- [ ] **Step 1: Run all Vitest suites and verify 100% pass**
- [ ] **Step 2: Run production build and verify exit code 0**
- [ ] **Step 3: Run agnostic check and pytest suites**
