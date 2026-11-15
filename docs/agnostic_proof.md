# T14 — Prueba agnóstica del mapeo de columnas

- Fecha de ejecución: 2026-11-14
- Modelo de Bedrock: `us.anthropic.claude-haiku-4-5-20251001-v1:0` · región `us-east-1` · llamadas Converse: 22
- Muestras: hasta cinco filas no vacías por tabla; total enviado: 103 filas.
- Tokens informados por Bedrock: 15949 entrada · 9313 salida.
- Directorio leído: `/Users/stringbuilder/prometeo-si/tools/datos_psi/tablas`. El checkout no contiene `data/psi/tables`; la ejecución usó la copia local `tools/datos_psi/tablas`, sin modificarla ni incluirla en el commit.
- Referencia humana: `web/public/demo/mapping.json`. Se comparan asignación (`variable`, `role`), unidad exacta y coincidencia conjunta (`variable`, `role`, `unit`). Conversión, estado flagged y justificación siguen siendo decisión humana y no forman parte de la puntuación.
- Límite: el resultado mide concordancia con el mapping revisado en estas muestras, no exactitud sobre filas no enviadas ni calidad general del modelo.

## Resultado agregado

| Métrica | Aciertos | Columnas puntuadas | Porcentaje |
|---|---:|---:|---:|
| Asignación exacta (variable/rol) | 148 | 227 | 65.2% |
| Unidad exacta | 174 | 227 | 76.7% |
| Asignación y unidad exactas | 107 | 227 | 47.1% |
| Tablas con referencia humana | 21 | 22 muestreadas | — |

## Resultado por tabla

| Fuente | Tabla | Filas muestreadas | Columnas | Asignación | Unidad | Conjunta |
|---|---|---:|---:|---:|---:|---:|
| s1 | `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | 5 | 14 | 9/14 (64.3%) | 8/14 (57.1%) | 6/14 (42.9%) |
| s2 | `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | 5 | 15 | 9/15 (60.0%) | 7/15 (46.7%) | 4/15 (26.7%) |
| s3 | `PSI-20_Experimental table_ACME BRE.csv` | 5 | 8 | 3/8 (37.5%) | 7/8 (87.5%) | 2/8 (25.0%) |
| s4 | `PSI-21_Experimental table_CLD Flame.csv` | 5 | 8 | 4/8 (50.0%) | 7/8 (87.5%) | 3/8 (37.5%) |
| s5 | `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | 5 | 10 | 2/10 (20.0%) | 9/10 (90.0%) | 2/10 (20.0%) |
| s6 | `PSI-23_Experimental table_ACME s-Flame.csv` | 5 | 9 | 2/9 (22.2%) | 9/9 (100.0%) | 2/9 (22.2%) |
| s7 | `PSI-25_Experimental table_BASS-II.csv` | 5 | 17 | 12/17 (70.6%) | 14/17 (82.4%) | 10/17 (58.8%) |
| s8 | `PSI-26_Experimental table_BASS.csv` | 5 | 6 | 4/6 (66.7%) | 6/6 (100.0%) | 4/6 (66.7%) |
| s9 | `PSI-39_Experimental table_CFI.csv` | 5 | 10 | 7/10 (70.0%) | 9/10 (90.0%) | 6/10 (60.0%) |
| s10 | `PSI-47_Experimental table_DAFT.csv` | 2 | 5 | 5/5 (100.0%) | 5/5 (100.0%) | 5/5 (100.0%) |
| s11 | `PSI-68_Experimental table_Flex2.csv` | 5 | 7 | 6/7 (85.7%) | 4/7 (57.1%) | 3/7 (42.9%) |
| s12 | `PSI-69_Experimental table_FLEX.csv` | 5 | 15 | 11/15 (73.3%) | 10/15 (66.7%) | 7/15 (46.7%) |
| s13 | `PSI-98_Experimental table_SAFFIRE-1.csv` | 4 | 13 | 12/13 (92.3%) | 7/13 (53.8%) | 6/13 (46.2%) |
| s14 | `PSI-99_Experimental table_SAFFIRE-2.csv` | 5 | 17 | 13/17 (76.5%) | 16/17 (94.1%) | 12/17 (70.6%) |
| s15 | `PSI-100_Experimental table_SAFFIRE-3.csv` | 2 | 9 | 6/9 (66.7%) | 6/9 (66.7%) | 3/9 (33.3%) |
| s16 | `PSI-101_Experimental table_SAME-R.csv` | 5 | 10 | 8/10 (80.0%) | 10/10 (100.0%) | 8/10 (80.0%) |
| s17 | `PSI-102_Experimental table_SAME.csv` | 5 | 5 | 5/5 (100.0%) | 5/5 (100.0%) | 5/5 (100.0%) |
| s18 | `PSI-106_Experimental table_Slice.csv` | 5 | 2 | 0/2 (0.0%) | 2/2 (100.0%) | 0/2 (0.0%) |
| s19 | `PSI-107_Experimental table_Spice.csv` | 5 | 9 | 6/9 (66.7%) | 5/9 (55.6%) | 2/9 (22.2%) |
| s20 | `PSI-142_Experimental table_Data Summary Table.csv` | 5 | 4 | sin mapping humano | — | — |
| s21 | `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | 5 | 20 | 14/20 (70.0%) | 13/20 (65.0%) | 9/20 (45.0%) |
| s22 | `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | 5 | 18 | 10/18 (55.6%) | 15/18 (83.3%) | 8/18 (44.4%) |

## Diferencias de asignación

| Tabla | Encabezado | Mapping humano | Propuesta |
|---|---|---|---|
| `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | Flame Type | `{"column": "Flame Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | Day | `{"column": "Day", "variable": null, "role": "date", "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | mO2 (mg/s) | `{"column": "mO2 (mg/s)", "variable": null, "status": "rejected"}` | `{"variable": "o2", "role": null, "unit": "mg/s"}` |
| `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | pfinal (atm) | `{"column": "pfinal (atm)", "variable": null, "status": "rejected"}` | `{"variable": "p", "role": null, "unit": "atm"}` |
| `PSI-10_Experimental table_Flame Design_Inverse Flame.csv` | pmean (atm) | `{"column": "pmean (atm)", "variable": null, "status": "rejected"}` | `{"variable": "p", "role": null, "unit": "atm"}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | Flame Type | `{"column": "Flame Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | Day | `{"column": "Day", "variable": null, "role": "date", "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | XO2 (final) | `{"column": "XO2 (final)", "variable": null, "status": "rejected"}` | `{"variable": "o2", "role": null, "unit": "%"}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | pfinal (atm) | `{"column": "pfinal (atm)", "variable": null, "status": "rejected"}` | `{"variable": "p", "role": null, "unit": "atm"}` |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | pmean (atm) | `{"column": "pmean (atm)", "variable": null, "status": "rejected"}` | `{"variable": "p", "role": null, "unit": "atm"}` |
| `PSI-20_Experimental table_ACME BRE.csv` | Year | `{"column": "Year", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-20_Experimental table_ACME BRE.csv` | Month | `{"column": "Month", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-20_Experimental table_ACME BRE.csv` | Date | `{"column": "Date", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-20_Experimental table_ACME BRE.csv` | Fuel Bottle | `{"column": "Fuel Bottle", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": "label", "unit": null}` |
| `PSI-20_Experimental table_ACME BRE.csv` | Notes | `{"column": "Notes", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-21_Experimental table_CLD Flame.csv` | Test Type | `{"column": "Test Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-21_Experimental table_CLD Flame.csv` | Test Day | `{"column": "Test Day", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-21_Experimental table_CLD Flame.csv` | Fuel MFC | `{"column": "Fuel MFC", "variable": null, "status": "rejected"}` | `{"variable": "flow", "role": null, "unit": null}` |
| `PSI-21_Experimental table_CLD Flame.csv` | N2 MFC | `{"column": "N2 MFC", "variable": null, "status": "rejected"}` | `{"variable": "flow", "role": null, "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Test Type | `{"column": "Test Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Test Day | `{"column": "Test Day", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Year | `{"column": "Year", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Month | `{"column": "Month", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Date | `{"column": "Date", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Mesh Polarity | `{"column": "Mesh Polarity", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Fuel Bottle | `{"column": "Fuel Bottle", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-22_Experimental table_ACME E-FIELD Flames.csv` | Fuel Conc | `{"column": "Fuel Conc", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": "%"}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Test Type | `{"column": "Test Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Test Day* | `{"column": "Test Day*", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Year | `{"column": "Year", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Month | `{"column": "Month", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Date | `{"column": "Date", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Fuel Bottle | `{"column": "Fuel Bottle", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": null, "unit": null}` |
| `PSI-23_Experimental table_ACME s-Flame.csv` | Notes | `{"column": "Notes", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-25_Experimental table_BASS-II.csv` | PI | `{"column": "PI", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-25_Experimental table_BASS-II.csv` | Sample # | `{"column": "Sample #", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-25_Experimental table_BASS-II.csv` | Fan display | `{"column": "Fan display", "variable": "flow", "unit": null, "convert": null, "status": "flagged", "note": "Fan setting (voltage / steps), not cm/s: left unconverted."}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-25_Experimental table_BASS-II.csv` | Calibrated final O2 % by vol | `{"column": "Calibrated final O2 % by vol", "variable": null, "role": "quality_check", "status": "approved", "note": "Used only to flag implausible values; not a scenario variable."}` | `{"variable": "o2", "role": "outcome", "unit": "%"}` |
| `PSI-25_Experimental table_BASS-II.csv` | Final CO (ppm) | `{"column": "Final CO (ppm)", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "outcome", "unit": null}` |
| `PSI-26_Experimental table_BASS.csv` | Test # | `{"column": "Test #", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-26_Experimental table_BASS.csv` | Fuel Sample Material | `{"column": "Fuel Sample Material", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-39_Experimental table_CFI.csv` | CIR | `{"column": "CIR", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-39_Experimental table_CFI.csv` | Fiber | `{"column": "Fiber", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-39_Experimental table_CFI.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": null, "unit": null}` |
| `PSI-68_Experimental table_Flex2.csv` | Sample (Fuel Type) | `{"column": "Sample (Fuel Type)", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-69_Experimental table_FLEX.csv` | FLEX Identifier | `{"column": "FLEX Identifier", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-69_Experimental table_FLEX.csv` | Test GMT | `{"column": "Test GMT", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-69_Experimental table_FLEX.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": null, "unit": null}` |
| `PSI-69_Experimental table_FLEX.csv` | Burn time; s | `{"column": "Burn time; s", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": "s"}` |
| `PSI-98_Experimental table_SAFFIRE-1.csv` | Flow Direction | `{"column": "Flow Direction", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-99_Experimental table_SAFFIRE-2.csv` | Burn Time (s) | `{"column": "Burn Time (s)", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-99_Experimental table_SAFFIRE-2.csv` | Flow Direction | `{"column": "Flow Direction", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-99_Experimental table_SAFFIRE-2.csv` | Camera 1 | `{"column": "Camera 1", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-99_Experimental table_SAFFIRE-2.csv` | Camera 2 | `{"column": "Camera 2", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-100_Experimental table_SAFFIRE-3.csv` | Direction | `{"column": "Direction", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-100_Experimental table_SAFFIRE-3.csv` | Camera 1 | `{"column": "Camera 1", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-100_Experimental table_SAFFIRE-3.csv` | Camera 2 | `{"column": "Camera 2", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-101_Experimental table_SAME-R.csv` | Sample Type | `{"column": "Sample Type", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-101_Experimental table_SAME-R.csv` | Description | `{"column": "Description", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-106_Experimental table_Slice.csv` | Test Date | `{"column": "Test Date", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-106_Experimental table_Slice.csv` | Fuel Type | `{"column": "Fuel Type", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": "label", "unit": null}` |
| `PSI-107_Experimental table_Spice.csv` | GMT ignition | `{"column": "GMT ignition", "variable": null, "role": "label", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-107_Experimental table_Spice.csv` | GMT  Flame Off | `{"column": "GMT  Flame Off", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": "date", "unit": null}` |
| `PSI-107_Experimental table_Spice.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | Flame Type | `{"column": "Flame Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | Day | `{"column": "Day", "variable": null, "role": "date", "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "material", "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | O2 flow rate (mg/s) | `{"column": "O2 flow rate (mg/s)", "variable": null, "status": "rejected"}` | `{"variable": "flow", "role": null, "unit": "mg/s"}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | burn time (sec) | `{"column": "burn time (sec)", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": "sec"}` |
| `PSI-159_Experimental table_CFI-G_Inverse Flames.csv` | Color | `{"column": "Color", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | Flame Type | `{"column": "Flame Type", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | Day | `{"column": "Day", "variable": null, "role": "date", "status": "approved"}` | `{"variable": null, "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | Fuel | `{"column": "Fuel", "variable": "material", "unit": null, "convert": null, "status": "approved"}` | `{"variable": "phase", "role": "label", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | Cool flame? | `{"column": "Cool flame?", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | XO2  after test | `{"column": "XO2  after test", "variable": null, "status": "rejected"}` | `{"variable": "o2", "role": null, "unit": "%"}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | TFP | `{"column": "TFP", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "quality_check", "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | burn time (sec) | `{"column": "burn time (sec)", "variable": null, "role": "outcome", "status": "approved"}` | `{"variable": null, "role": null, "unit": null}` |
| `PSI-159_Experimental table_CFI-G_Normal Flames.csv` | Self-ext or flow term | `{"column": "Self-ext or flow term", "variable": null, "status": "rejected"}` | `{"variable": null, "role": "outcome", "unit": null}` |

## Reproducción

```sh
export AWS_PROFILE=prometeo
source infra/config.env
python3.12 -I pipeline/induce_schema.py --tables-dir tools/datos_psi/tablas
```
