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

## Propósito

Informe interactivo que compara un escenario propuesto con registros de experimentos de combustión de NASA PSI. El motor determinista calcula niveles de evidencia y hallazgos; `/ask` interpreta cambios de escenario y `/analysis` puede seleccionar afirmaciones verificadas con fuentes.

## Relaciones y flujo

`[[web/src/components/ScenarioPanel.tsx]]` edita valores y muestra los niveles. `[[web/src/components/AssistantPanel.tsx]]` envía preguntas de escenario y presenta análisis con citas. `[[api/handler.py]]` valida la entrada y rechaza preguntas explícitas sobre resultados o seguridad antes de invocar el modelo. La aplicación se publica con `infra/deploy_web.sh`; la API, con `infra/20_api.sh`.

## Especificación técnica

- En pantallas de 600 px o menos, los controles pasan de una tabla de cuatro columnas a filas apiladas; los encabezados siguen disponibles para tecnologías de asistencia.
- Las solicitudes de escenario se validan contra el esquema. El prompt de `/ask` incluye el mapeo explícito de gravedad (`0.17 g` → variable `g`, valor `0.17`, unidad `g`). Las preguntas sobre ignición, combustión, inflamabilidad, fuego, llamas, seguridad, riesgo, predicción, propagación o búsqueda de condiciones experimentales cercanas reciben una respuesta fija de alcance no admitido. Las sugerencias de `/ask` deben solicitar cambios de escenario, no consultas de ranking o recuperación de estudios.
- Cada oración del análisis debe referir un hallazgo y sus fuentes aprobadas; ante un error de API se conserva la plantilla determinista.
- El informe no requiere cuenta ni guarda escenarios en el servidor.

## Validación y pruebas

- `npm test --prefix web`: 54 pruebas aprobadas.
- `npm run build --prefix web`: compilación TypeScript y Vite aprobada.
- `api/.venv/bin/python -m pytest api/`: 39 pruebas aprobadas.
- `scripts/check_agnostic.sh`: aprobado.
- API publicada en Haiku 4.5 con Anthropic SDK 2.8.0. D6 cerrada por el dueño el 15-nov: se conserva Haiku 4.5 y se descarta la migración a 5.5.
- Revisión pública: CloudFront en Chrome incógnito, viewport responsive 400 × 899, preguntas de escenario y de contenido, favicon HTTP 200 y vista de impresión de 16 páginas.
- T16 publicó API y web desde otra laptop con los recursos existentes; el punto 9 de aceptación quedó verificado.
