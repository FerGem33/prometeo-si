---
title: "[[Prometeo]]"
aliases:
  - Prometeo research report
tags:
  - module
  - documentation
created: 2026-11-14
updated: 2026-11-14
status: stable
language: "typescript | python"
source_files:
  - "web/src/components/ScenarioPanel.tsx"
  - "web/src/components/AssistantPanel.tsx"
  - "api/handler.py"
related:
  - "[[trabajo-diario/2026-11-14]]"
---

# Prometeo

## Purpose

Interactive research report that compares a user-proposed scenario with NASA PSI combustion experiment records. The deterministic engine calculates evidence levels and findings; the optional `/ask` endpoint translates scenario changes, and `/analysis` may select only verified, sourced statements.

## Relationships & Flow

`[[web/src/components/ScenarioPanel.tsx]]` edits values and displays levels. `[[web/src/components/AssistantPanel.tsx]]` submits scenario questions and presents cited analysis. `[[api/handler.py]]` validates API input and rejects explicit outcome or safety questions before invoking the model. The app is deployed through `infra/deploy_web.sh`; the API is deployed through `infra/20_api.sh`.

## Technical Specification

- Mobile scenario controls switch from a four-column table to stacked rows at 600 px and below; headers remain available to assistive technology.
- Scenario requests are schema-validated. Outcome questions mentioning ignition, burning, combustion, flammability, fire, flames, safety, risk, prediction, or spread return a fixed unsupported response.
- Analysis sentences must reference a finding and its approved sources; API errors leave the deterministic template visible.
- No account or server-side scenario storage is used by the report.

## Validation & Testing

- `npm test --prefix web`: 35 tests passed.
- `npm run build --prefix web`: TypeScript and Vite build passed.
- `api/.venv/bin/python -m pytest api/`: 27 tests passed.
- `scripts/check_agnostic.sh`: passed.
- Public review: CloudFront in Chrome Incognito, responsive viewport 400 × 899, scenario and content question paths, favicon HTTP 200, and 16-page print preview.
- Cross-laptop deployment remains an external acceptance check.
