# Prometeo — Decisiones del hack

14 de noviembre de 2026 · Recorte de 8 h de la [arquitectura final](<Prometeo — Arquitectura final del sistema MVP.md>). El detalle de tareas está en [`PLAN.md`](PLAN.md); en caso de conflicto manda `PLAN.md`.

## Decisiones de la revisión

| # | Tema | Decisión |
|---|---|---|
| 1 | Niveles de evidencia | Niveles de cobertura calculables (abajo). El guion de la demo se reescribe con datos reales. |
| 2 | Alcance | El corte queda escrito antes de empezar (abajo). |
| 3 | Logs | Se permiten los logs básicos de Lambda. Sin alarmas ni retención configurada. |
| 4 | Timeout de `/analysis` | Una sola llamada al modelo y un verificador determinista en código. |
| 5 | Pack de demo | Se genera fuera de línea con un script, sin Bedrock ni worker. |
| 6 | Idioma e ingesta | Interfaz solo en inglés. Ingesta por lotes fuera de línea. |
| 7 | Limpieza de `docs/` | Hecha en T00. |

## Corte de alcance

| Prioridad | Casos de uso | Contenido |
|---|---|---|
| **P0** | CU-01, 10, 11, 13, 15, 16, 17, 21 | Informe tipo artículo desplegado: ranking A–D, mapa, tabla de calor, hallazgos, niveles por variable, escenario ajustable, procedencia (fila + DOI de PSI) y PDF con `window.print()`. |
| **P1** | CU-19, 20 | `/ask` (pregunta → escenario/filtros validados) y `/analysis` verificado. |
| **P2** | CU-24, 14, 18 | Ficha de datos para ML determinista; comparar 2 estudios; relaciones/huecos solo si da tiempo. |
| **P3** | Prueba agnóstica | Bedrock propone el mapeo de columnas y se compara con el aprobado. |
| Posterior | CU-02, 03–09, 12 completo, 22, 23, 25 | No se tocan en el hack: Cognito, SQS/worker, DynamoDB, subida de archivos y pantallas de revisión. |

**Regla de corte:** a las 5:00 h se congela P0 y se despliega lo que haya.

## Niveles de evidencia por variable

Se calculan sobre el `pool` comparable (misma partición). Umbrales en `lens.evidence`, visibles en Methods.

| Nivel | Condición |
|---|---|
| **Studied** | El valor está dentro del rango probado y lo cubren registros de ≥ `min_studies` (2) estudios. |
| **Scarce evidence** | Dentro del rango, pero lo cubren menos de `min_studies` estudios o solo registros con bandera. |
| **Near, not covered** | Fuera del rango, a menos de `closeness_reach·σ` del borde. |
| **Not studied** | Ningún registro del `pool` tiene la variable, o el valor está más lejos que eso. |

Cada estudio lleva además su nota A–D. Ningún nivel se comunica solo con color.
