# T32 — Evaluación real y revisión local

2026-11-15 · laptop AWS · base recuperada `c9906c8`; inicio registrado en `6851fb1`.

**Estado: en curso.** Hay aprobación local explícita y extracción con procedencia, pero no se cumple aún la verificación completa ni se declara alcanzada la meta del 85 %. D7 sigue pendiente; D3 no se decidió. No hubo despliegue ni cambios en el pack publicado.

## Entorno y límites

- Python 3.12, `anthropic[bedrock]==2.8.0`, Poppler 26.11.0. Perfil `prometeo`, región `us-east-1`; STS confirmó la cuenta del proyecto sin imprimir credenciales.
- Modelo de todas las 56 invocaciones reales: `us.anthropic.claude-haiku-4-5-20251001-v1:0`, leído de `MODEL_ID`. Máximo 6000 tokens de salida por llamada, sin reintentos automáticos.
- Tokens reportados por el SDK, incluyendo propuestas rechazadas: **288423 entrada / 47227 salida**. No es una estimación de costo.
- Descarga local: `tools/datos_psi/tablas`. Fuentes, PDF, peticiones, respuestas crudas, candidatos y registros extraídos permanecen exclusivamente en `/tmp/prometeo-t32/`. Esa carpeta es temporal: copiarla fuera de git si se necesita conservar la evidencia.
- El mecanismo de aprobación es un CLI local de confianza: registra el nombre declarado del revisor, fecha, versión y hashes; no autentica identidades. La autorización multiusuario corresponde al backend posterior.
- Los artefactos extraídos son borradores locales, no un pack ni registros listos para publicar. La clasificación test/campaign, sinónimos y alcance semántico siguen requiriendo decisiones revisadas.

## Primera llamada BASS-II

La tabla (129 filas, 17 columnas, SHA `71e792bf6b5fb5ea620c5dd70fbbac05515992e12aefcf5dff47312caa48c042`) se leyó con `pipeline/ingest.py`. La primera respuesta real terminó en `end_turn` pero estaba envuelta en Markdown: el adaptador original devolvió `JSONDecodeError`. Se guardó antes del rechazo en `bass-raw.json` (7962 tokens de entrada, 2697 de salida).

El adaptador ahora quita únicamente una envoltura completa de código JSON; rechaza explicación adicional, JSON incompleto o salida truncada. Se reprodujo la misma respuesta guardada, sin otra llamada: `proposal_check.status=valid`; el esquema sigue `proposed`. La petición de revisión está en `bass-awaiting-review.json`. Ningún estado fue aprobado por el agente.

La propuesta libre contiene variables adicionales (por ejemplo GMT) y no usa necesariamente los IDs canónicos del mapping. No se puntúan esos nombres como equivalencias semánticas. Para la evaluación de tablas se suministró exclusivamente el vocabulario del esquema publicado (no las asignaciones ni el mapping).

## Propuestas reales de 22 tablas

Conjunto exacto: las 22 fuentes de tabla de `web/public/demo/pack.json`, comprobadas contra sus SHA. La tabla resumen PSI-142 se intenta pero no entra al denominador: no tiene mapping aprobado por fila. Las otras 21 tablas suman 227 columnas; no se incluyen las cinco tablas de otras áreas de la descarga.

Primera corrida: 22 llamadas, 15 propuestas válidas, 7 rechazadas. Tras precisar el vocabulario confiable en el mensaje de sistema y recordar campos/referencias/unidades, se repitieron únicamente las 7 rechazadas: 6 válidas y 1 rechazada. Se conservaron ambos intentos; no se relajó el validador.

**Resultado intermedio combinado de diagnóstico (dos versiones del prompt, no una corrida homogénea):** 21/22 propuestas válidas; 20/21 tablas puntuables, 209/227 columnas comparadas. Tras corregir la alineación de encabezados, coinciden 193 asignaciones y 145 asignaciones con unidad. Este resultado intermedio no se usa para declarar cumplimiento.

**Corrección de evaluación:** el builder publicado recorta espacios en los extremos de las cabeceras, mientras el parser conserva la celda original. Se alinean únicamente esas cabeceras de forma unívoca; encabezados ambiguos o sin mapping se rechazan. Las citas mantienen los encabezados literales. Los conteos provisionales 206/227 y 146/227 se corrigieron a 209/227 y 148/227 desde las respuestas guardadas, sin nuevas llamadas. Evidencia recalculada: `tables-final/report-corrected.json` (también se guardan los informes originales).

La métrica mide acuerdo con el mapping vigente, no verdad científica. No incluye roles, conversiones, constantes ni corrección de citas semánticas; por eso no es directamente comparable al 65.2 % de T14 (que incluía roles). Las 79 diferencias humanas de D7 no se consideran resueltas.

**Corrida final homogénea (`tables-final`):** después de precisar que una diferencia de unidades no debe dejar referencias sin declarar, se repitieron las 22 tablas con un único prompt. **22/22 propuestas válidas**, 21 tablas puntuables y **227/227 columnas comparadas**. Acuerdo de asignación **209/227 = 92.1 %**; acuerdo de asignación y unidad fuente exactas **148/227 = 65.2 %**. No se usó feedback del mapping por columna en el prompt ni se aprobó ninguna propuesta. Aunque el acuerdo de asignación supera numéricamente 85 %, **no se declara cumplida la meta de precisión de T32 sin D7**.

| Fuente | Tabla | Estado final | Asignación / columnas comparadas | Asignación + unidad |
|---|---|---|---|---|
| s1 | PSI-10_Experimental table_Flame Design_Inverse Flame.csv | válida | 12/14 | 7 |
| s2 | PSI-10_Experimental table_Flame Design_Normal Flame.csv | válida | 11/15 | 6 |
| s3 | PSI-20_Experimental table_ACME BRE.csv | válida | 8/8 | 7 |
| s4 | PSI-21_Experimental table_CLD Flame.csv | válida | 7/8 | 5 |
| s5 | PSI-22_Experimental table_ACME E-FIELD Flames.csv | válida | 9/10 | 9 |
| s6 | PSI-23_Experimental table_ACME s-Flame.csv | válida | 7/9 | 7 |
| s7 | PSI-25_Experimental table_BASS-II.csv | válida | 15/17 | 11 |
| s8 | PSI-26_Experimental table_BASS.csv | válida | 6/6 | 6 |
| s9 | PSI-39_Experimental table_CFI.csv | válida | 9/10 | 8 |
| s10 | PSI-47_Experimental table_DAFT.csv | válida | 5/5 | 5 |
| s11 | PSI-68_Experimental table_Flex2.csv | válida | 7/7 | 4 |
| s12 | PSI-69_Experimental table_FLEX.csv | válida | 14/15 | 7 |
| s13 | PSI-98_Experimental table_SAFFIRE-1.csv | válida | 13/13 | 7 |
| s14 | PSI-99_Experimental table_SAFFIRE-2.csv | válida | 17/17 | 11 |
| s15 | PSI-100_Experimental table_SAFFIRE-3.csv | válida | 9/9 | 6 |
| s16 | PSI-101_Experimental table_SAME-R.csv | válida | 10/10 | 10 |
| s17 | PSI-102_Experimental table_SAME.csv | válida | 5/5 | 3 |
| s18 | PSI-106_Experimental table_Slice.csv | válida | 1/2 | 1 |
| s19 | PSI-107_Experimental table_Spice.csv | válida | 8/9 | 4 |
| s20 | PSI-142_Experimental table_Data Summary Table.csv | válida, sin puntuar | — | — |
| s21 | PSI-159_Experimental table_CFI-G_Inverse Flames.csv | válida | 19/20 | 12 |
| s22 | PSI-159_Experimental table_CFI-G_Normal Flames.csv | válida | 17/18 | 12 |

Rechazos originales: s4 `categorical unit`; s5 y s20 JSON acompañado de texto; s6 y s19 campos de evidencia inválidos; s14 variable fuera del vocabulario; s22 referencia a variable no declarada. El segundo intento de s22 volvió a mapear `approx p (bar)` a `p` sin declarar `p` en `variables`: se conserva ese rechazo histórico `unknown variable reference`. En la corrida final el propio modelo declaró correctamente la referencia y pasó la misma validación; no se completó esa variable por inferencia del código.

## Extracción determinista con el mapping humano existente

Esta prueba **no llama a Bedrock ni aprueba sus propuestas**. Reutiliza la aprobación ya publicada de `mapping.json` para extraer celdas de las 22 fuentes (PSI-142 queda excluida por no tener columnas aprobadas). Se excluyen constantes sin cita/alcance local revisado y no se infieren sinónimos.

- 1984 filas con algún valor extraído; 4505 valores conservados; 0 conflictos entre columnas.
- 287 celdas retenidas como rechazos: 171 números ambiguos (por ejemplo `RAMP` o `LOW O2`) y 116 valores sin conversión de unidad aprobada. El rechazo conserva la cita y el texto original.
- Comparación con celdas numéricas del pack: 2611/2799 coinciden con tolerancia de redondeo a cuatro decimales. Categorías literales: 1107/1860 coinciden sin aplicar sinónimos. Son diagnósticos del extractor conservador, no precisión del modelo.
- Cada valor conserva doc_id, fila lógica, columna, texto original, unidad fuente, conversión, hash y ruta. Una constante revisada necesita filas explícitas, cita verificada y decisión de soporte semántico; conserva origen de la evidencia y tabla destino por separado. Dos valores destinados a la misma variable quedan en conflicto y no se sobrescriben.

## Cinco PDF oficiales

Los PDF de PSI-25/PSI-69 no estaban en la descarga local. Se descargaron de NTRS a `/tmp/prometeo-t32/pdfs/`; sus hashes están en el informe JSON y abajo. Se seleccionaron las primeras cuatro páginas físicas con `pressure|atm|kPa|Torr|psi`, con límite técnico de 60000 caracteres. **No es extracción exhaustiva**: se omiten páginas posteriores y términos no cubiertos por esa búsqueda. No se aplicaron límites de subida D3.

| NTRS | Relación | Páginas enviadas | Candidatos | Formato/cita verificados | Rechazados |
|---|---|---|---|---|---|
| [20120015928](https://ntrs.nasa.gov/citations/20120015928) | FLEX, presentación | sin capa de texto | — | — | — |
| [20150008961](https://ntrs.nasa.gov/citations/20150008961) | BASS-II, PMMA | 1, 2 | 4 | 2 | 2 |
| [20150019858](https://ntrs.nasa.gov/citations/20150019858) | BASS-II, sensores | 2, 4, 8 | 5 | 5 | 0 |
| [20150023456](https://ntrs.nasa.gov/citations/20150023456) | FLEX, resultados | 8, 9, 11, 12 | 8 | 2 | 6 |
| [20210011385](https://ntrs.nasa.gov/citations/20210011385) | BASS-II, informe | 10, 11, 12, 14 | 6 | 6 | 0 |

Cuatro invocaciones reales: 23 candidatos, 15 con formato/unidad/cita verificados y 8 rechazados. Dos rechazos son rangos numéricos inválidos; seis son citas no encontradas en la página indicada. El quinto PDF (`20120015928`) quedó `no_text_layer`, sin llamada a Bedrock ni OCR. Encontrar texto no prueba que respalde el valor: los 15 candidatos quedan `awaiting_semantic_review`, `published:false` y no se asignan a tablas.

Los 8 rechazos, reproducibles desde `papers-real/*/response.json`, son:

| PDF | Índice candidato (1-based) | Variable | Página citada | Motivo |
|---|---|---|---|---|
| 20150008961.pdf | 1 | o2 | 1 | invalid numeric range |
| 20150008961.pdf | 2 | flow | 1 | invalid numeric range |
| 20150023456.pdf | 1 | p | 8 | text_not_found_at_location |
| 20150023456.pdf | 2 | p | 8 | text_not_found_at_location |
| 20150023456.pdf | 4 | material | 8 | text_not_found_at_location |
| 20150023456.pdf | 5 | material | 8 | text_not_found_at_location |
| 20150023456.pdf | 6 | p | 9 | text_not_found_at_location |
| 20150023456.pdf | 7 | p | 9 | text_not_found_at_location |

Hashes SHA-256 de los cinco PDF:

- `20120015928.pdf`: `635a5f17c2f0d45cc53ffc57bd6bea76c93072b455eb1afd8e1f889310944a26`.
- `20150008961.pdf`: `8cee8a023d9f0aab214996ebaeefb842080b0c935ba9e01db0096a47379519f7`.
- `20150019858.pdf`: `e9c1286f0903700c0ae180a574debb6826f3676a072df2eeb926c22955a09831`.
- `20150023456.pdf`: `b4f6ca983e2792c33a0b92220a791a818f426bb635b94f7fd33dc8c9c471e79d`.
- `20210011385.pdf`: `5ffa911fd9b6356f204646003fb9342e341810dcdfdf5cb15756e7f01ec5f770`.

## Reproducir y revisar

Preparación y descarga oficial: véase `pipeline/README.md`. Los comandos de evaluación usan carpetas nuevas porque no sobrescriben evidencias anteriores. Ejecución de esta sesión:

```bash
export AWS_PROFILE=prometeo
source infra/config.env
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_ingest.py --tables-dir tools/datos_psi/tablas --output-dir /tmp/prometeo-t32/tables-real
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_ingest.py --tables-dir tools/datos_psi/tablas --output-dir /tmp/prometeo-t32/tables-retry --source s4 --source s5 --source s6 --source s14 --source s19 --source s20 --source s22
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_ingest.py --tables-dir tools/datos_psi/tablas --output-dir /tmp/prometeo-t32/tables-final
python3.12 -I pipeline/evaluate_extraction.py --tables-dir tools/datos_psi/tablas --output-dir /tmp/prometeo-t32/extraction-aligned
python3.12 -I pipeline/ingest.py /tmp/prometeo-t32/pdfs --output /tmp/prometeo-t32/pdfs-parsed.json
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_papers.py /tmp/prometeo-t32/pdfs-parsed.json --output-dir /tmp/prometeo-t32/papers-real
```

El código final contiene el prompt precisado, medido homogéneamente en `tables-final`. Las respuestas pueden variar. Los archivos `request.json` guardados registran el prompt exacto de cada llamada de esta sesión. No se necesitan T31 ni cambios de Lambda/API.

La revisión BASS-II está preparada en `/tmp/prometeo-t32/bass-awaiting-review.json`; usar el procedimiento `prepare → approve → extract` del README. El revisor debe decidir cada variable/columna, fusiones, unidades y conversiones, y confirmar alcance de constantes antes de aprobar. No usar aprobación masiva automática.

## Verificaciones y pendiente exacto

- Dobles/pruebas locales Python 3.12: 64 pruebas API/pipeline y 32 subtests pasan. Incluyen rechazo de propuestas sin revisar, versiones/corpus alterados, dos particiones, unidades ambiguas, rangos inválidos, citas falsas, conflicto de valores y procedencia entre documentos. **No sustituyen las 56 llamadas reales** descritas arriba.
- Control negativo CLI: intentar aprobar BASS-II todavía `proposed` devolvió código 1, `unreviewed variable`, sin crear archivo de aprobación.
- Web: 54 pruebas pasan. `check_agnostic.sh`, `validate_pack.py` y `git diff --check` pasan. El pack mantiene 24 estudios, 1986 registros y 22 fuentes; ninguna edición en `web/public/demo`.
- Pendiente T32: revisar D7 con el autor del mapping, revisar los 15 candidatos PDF y el alcance de presión, obtener texto/OCR revisado para el PDF fallido, y repetir la evaluación completa tras decisiones humanas (la corrida homogénea actual ya está guardada). No se declara 85 % ni T32 hecha.
- D3 continúa abierta; no se implementaron subidas ni se ejecutó `infra/30_data.sh`. T33/T34 no se declaran desbloqueadas por esta prueba.

## Lista concreta para D7 (corrida final)

Estas discrepancias no están resueltas. `null` significa sin variable/unidad asignada; el revisor decide si el mapping o la propuesta necesita corrección. No se actualiza el mapping automáticamente.

| Fuente | Columna | Mapping variable/unidad | Propuesta variable/unidad |
|---|---|---|---|
| s1 | XO2 | o2/mole fraction | o2/None |
| s1 | mO2 (mg/s) | None/None | None/mg/s |
| s1 | mN2 (mg/s) | None/None | None/mg/s |
| s1 | mtot (mg/s) | None/None | None/mg/s |
| s1 | pfinal (atm) | None/None | p/atm |
| s1 | pmean (atm) | None/None | p/atm |
| s1 | Tad (K) | None/None | None/K |
| s2 | Fuel | material/None | phase/None |
| s2 | mfuel (mg/s) | None/None | None/mg/s |
| s2 | mN2 (mg/s) | None/None | None/mg/s |
| s2 | mtot (mg/s) | None/None | None/mg/s |
| s2 | XO2 (init) | o2/mole fraction | o2/None |
| s2 | XO2 (final) | None/None | o2/None |
| s2 | pfinal (atm) | None/None | p/atm |
| s2 | pmean (atm) | None/None | p/atm |
| s2 | Tad (K) | None/None | None/K |
| s3 | Burner Size (mm) | None/None | None/mm |
| s4 | Fuel MFC | None/None | None/slpm |
| s4 | N2 MFC | None/None | None/slpm |
| s4 | Fuel Bottle | material/None | None/None |
| s5 | Fuel Bottle | material/None | None/None |
| s6 | Fuel Bottle | material/None | phase/None |
| s6 | Notes | None/None | p/atm |
| s7 | Fan display | flow/None | None/None |
| s7 | Calibrated final O2 % by vol | None/None | o2/% |
| s7 | Initial CO2 % by vol | None/None | None/% |
| s7 | Final CO2 % by vol | None/None | None/% |
| s7 | Initial CO (ppm) | None/None | None/ppm |
| s7 | Final CO (ppm) | None/None | None/ppm |
| s9 | Oxygen | o2/mole fraction | o2/None |
| s9 | Fuel  | material/None | None/None |
| s11 | Initial Droplet Diameter (mm) | None/None | None/mm |
| s11 | Oxygen Mole Fraction | o2/mole fraction | o2/None |
| s11 |  Ambient Temperature (C) | None/None | None/C |
| s12 | Fuel | material/None | phase/None |
| s12 | N initial ambient composition; mole fraction | None/None | None/mole fraction |
| s12 | CO initial ambient composition; mole fraction | None/None | None/mole fraction |
| s12 | He initial ambient composition; mole fraction | None/None | None/mole fraction |
| s12 | Droplet initial diameter; mm | None/None | None/mm |
| s12 | Visible flame extinction diameter; mm | None/None | None/mm |
| s12 | Burning rate; mm | None/None | None/mm |
| s12 | Burn time; s | None/None | None/s |
| s13 | Sample Thickness (cm) | None/None | None/cm |
| s13 | Sample Length (cm) | None/None | None/cm |
| s13 | Sample Width (cm) | None/None | None/cm |
| s13 | Ignition Power (W) | None/None | None/W |
| s13 | Ignition Time (s) | None/None | None/s |
| s13 | Burn Time (s) | None/None | None/s |
| s14 | Samle Thickness  | None/None | None/mm |
| s14 | Sample Length  | None/None | None/cm |
| s14 | Sample Width (cm) | None/None | None/cm |
| s14 | Ignition Power (W) | None/None | None/W |
| s14 | Ignition Time (s) | None/None | None/s |
| s14 | Burn Time (s) | None/None | None/s |
| s15 | Sample Thickness | None/None | None/cm |
| s15 | Sample Length | None/None | None/cm |
| s15 | Sample Width | None/None | None/cm |
| s17 | Weight loss rate (mg/min) | None/None | None/mg/min |
| s17 | Aging Duration (minutes) | None/None | None/minutes |
| s18 | Fuel Type | material/None | None/None |
| s19 | Fuel | material/None | phase/None |
| s19 | Nozzle (mm) | None/None | None/mm |
| s19 | Fuel Rate (sccm) | None/None | None/sccm |
| s19 | Fuel Rate (mg/s) | None/None | None/mg/s |
| s19 | HC Fuel Rate (mg/s) | None/None | None/mg/s |
| s21 | Flame Type | None/None | phase/None |
| s21 | XO2 | o2/mole fraction | o2/fraction |
| s21 | HC burnrate (mg/s) | None/None | None/mg/s |
| s21 | O2 flow rate (mg/s) | None/None | None/mg/s |
| s21 | Tad (K) | None/None | None/K |
| s21 | burn time (sec) | None/None | None/sec |
| s21 | Peak burner Temp (C) | None/None | None/C |
| s21 | Peak burner temp (K) | None/None | None/K |
| s22 | Flame Type | None/None | phase/None |
| s22 |  XO2 before test | o2/mole fraction | o2/None |
| s22 | mHC (mg/s) | None/None | None/mg/s |
| s22 | Tad (K) | None/None | None/K |
| s22 | burn time (sec) | None/None | None/sec |
| s22 | Peak burner T (C ) | None/None | None/C |
