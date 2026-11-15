# T32: decisiones PDF y cierre de revisión delegada

Aprobado por delegación del dueño (15-nov); recomendación del agente, sin revisión humana línea por línea.

Versión 1; UTC 2026-11-15T13:07:49.534160+00:00. Autoridad: DECISIONES_CIERRE §8. Revisión reversible; no revisión experta.

## Resultado

15 candidatos con cita localizada revisados: 12 aceptados únicamente como contexto documental, 3 excluidos. Ninguno se incorpora a filas de tablas ni cambia el pack. Los ocho candidatos previamente rechazados por formato/cita conservan su rechazo.

| Candidato (índice de verified-final) | Variable/valor/unidad | Página | Decisión y alcance |
|---|---|---|---|
| 20150008961:1 | material: "PMMA"  | 1 | excluded: Excluir por redundancia: el título identifica PMMA pero el candidato siguiente describe explícitamente el material fundido y la población. |
| 20150008961:2 | material: "cast PMMA"  | 1 | accepted_context_only: Aceptación contextual de material/población citada. |
| 20150019858:1 | o2: [21, 21] % | 4 | accepted_context_only: Aceptación contextual del extremo aproximado de O2; no valor exacto asignable a ensayos. |
| 20150019858:2 | o2: [14, 14] % | 4 | accepted_context_only: Aceptación contextual del extremo aproximado de O2; no valor exacto asignable a ensayos. |
| 20150019858:3 | flow: [55, 55] cm/s | 2 | accepted_context_only: Aceptación contextual del máximo aproximado del ducto/configuración de restrictor; no punto medido por ensayo. |
| 20150019858:4 | flow: [35, 35] cm/s | 2 | accepted_context_only: Aceptación contextual del máximo aproximado del ducto/configuración de restrictor; no punto medido por ensayo. |
| 20150019858:5 | p: [1, 1] atm | 8 | excluded: Excluir como condición experimental: P=1 atm es supuesto de la ley de gases para un cálculo de consumo, no medición por ensayo. |
| 20150023456:1 | o2: [21, 21] % | 12 | accepted_context_only: Aceptación solo para la secuencia ilustrada en figura 4; no toda la campaña. |
| 20150023456:2 | p: [1.0, 1.0] atm | 12 | accepted_context_only: Aceptación solo para la secuencia ilustrada en figura 4; no toda la campaña. |
| 20210011385:1 | o2: [21, 21] % | 14 | accepted_context_only: Aceptación contextual del extremo aproximado de O2; no valor exacto asignable a ensayos. |
| 20210011385:2 | o2: [14, 14] % | 14 | accepted_context_only: Aceptación contextual del extremo aproximado de O2; no valor exacto asignable a ensayos. |
| 20210011385:3 | flow: [55, 55] cm/s | 12 | accepted_context_only: Aceptación contextual del máximo aproximado del ducto/configuración de restrictor; no punto medido por ensayo. |
| 20210011385:4 | flow: [35, 35] cm/s | 12 | accepted_context_only: Aceptación contextual del máximo aproximado del ducto/configuración de restrictor; no punto medido por ensayo. |
| 20210011385:5 | material: "PMMA"  | 14 | accepted_context_only: Aceptación contextual de material/población citada. |
| 20210011385:6 | phase: "gas-phase"  | 10 | excluded: Excluir: gas-phase califica la reacción/modelo estequiométrico, no la fase física de la muestra. |

Las citas literales, valores, unidades, población declarada, calificadores y hashes por original/respuesta están en `T32_PDF_DECISIONES.json`. Se revisaron contra pdftotext por página; el render de 20150023456 página física 12 confirma que los valores de aire/1 atm pertenecen solo a figura 4.

## PDF 20120015928

Render visual legible; extracción Poppler fallida y pypdf mal codificado. No hay candidatos fiables para aceptar condiciones automáticamente. Se conserva metadato; no exige ni presupone OCR inventado.

Render inspeccionado: página 1 en `/tmp/prometeo-pdf-review/20120015928-p1.png`; FLEX figura4 en `/tmp/prometeo-pdf-review/flex-p12.png`. No se versionan PDF ni imágenes extraídas.

## Métrica tras D7 aprobada

Conjunto original: 227 columnas de 22 tablas. Regla A excluye exactamente 55 diferencias de unidad en columnas rechazadas por ambos, sin cambiar referencia. Denominador nuevo: 172.
- Asignación: 154/172 = 89.53 %.
- Asignación + unidad: 148/172 = 86.05 %.

La coincidencia conjunta supera 85 % bajo el criterio revisado aprobado por D7. Es acuerdo con mapping, no precisión científica ni métrica de presión por ensayo. No se cambiaron el mapping ni el pack.

Reproducción: leer `/tmp/prometeo-t32/tables-final/report-corrected.json`, excluir expected.variable=null y proposed.variable=null con joint_match=false (assert 55), sumar assignment_match/joint_match en el resto. Se preservan los hashes de esa corrida en el informe original. No se invocó Bedrock de nuevo.

Se usa report-corrected.json: conserva respuestas reales y alinea bordes de encabezados con el mapping publicado (el builder recorta espacios). El report.json previo sin esa alineación introduce falsos desacuerdos; no se cambió la referencia para mejorar resultados.

SHA-256 del artefacto de decisión (JSON canónico sin el propio campo decision_sha256): `f8b36bcad0ee36569e926db9ff31c9be70720c8d60a5c2bd9853357743af724a`.
