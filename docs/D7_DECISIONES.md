# D7 — Decisiones sobre las 79 discrepancias de mapping

**Estado: PROPUESTA PRECARGADA, no aprobada.** Las recomendaciones las preparó un agente revisando los CSV
originales (`tools/psi/data/datos_psi/tablas/`) y el mapping vigente (`web/public/demo/mapping.json`,
aprobado por humano el 2026-11-14). Una persona debe confirmarlas o corregirlas. Hasta entonces el mapping
vigente sigue siendo la referencia y no se modifica nada.

Origen de la lista: `docs/T32_EVALUACION.md` § "Lista concreta para D7", corrida final de T32 con Haiku 4.5.

## Resumen

| Clase | Filas | Qué difiere | Recomendación | ¿Cambia el pack? |
|---|---|---|---|---|
| **B** · la propuesta añade variable | 7 | El modelo asigna `p` u `o2` a columnas que el mapping rechazó (presión final o media, O₂ final, notas) | Mantener el mapping | No |
| **C** · otra variable que `material` | 9 | `Fuel` → `phase` o `None`; `Fan display` → `None` | Mantener el mapping | No |
| **E** · `Flame Type` → `phase` | 2 | El modelo trata la geometría de la llama como fase | Mantener el mapping (rechazada) | No |
| **D** · unidad del O₂ | 6 | `mole fraction` frente a `None` o `fraction` | Mantener `mole fraction` (×100 → %) | No |
| **A** · solo unidad, ninguno asigna variable | 55 | El modelo lee la unidad del encabezado de una columna que ambos descartan | Mantener el mapping; la unidad es informativa | No |
| **Total** | **79** | 18 de variable + 61 de solo unidad | **Mantener el mapping vigente en las 79** | **No** |

**Conclusión propuesta:** en las 79 filas el mapping humano es correcto o equivalente. Ninguna discrepancia
revela un error del mapping. Las 18 diferencias de variable son errores de la propuesta del modelo. Las 61 de unidad
son columnas rechazadas por ambos (55) o pérdidas del factor ×100 del O₂ (6), que harían leer 0.21 como 0.21 %.

**Qué implica aprobarla:**

- El mapping y el pack publicado no cambian. No hay que regenerar ni redesplegar nada.
- D7 queda cerrada. T32 solo dependería de la revisión semántica de los PDF (sección aparte de `REVISION_FINAL_PENDIENTE.md`).
- La métrica de T32 se puede reportar como acuerdo de variable 209/227 (92.1 %). Las 18 diferencias son errores
  confirmados del modelo, no ambigüedad del mapping. Para el acuerdo variable + unidad conviene excluir las 55 columnas
  rechazadas por ambos, cuya unidad no se usa.
- Hay una mejora sugerida al prompt de propuesta, sin hacerla ahora: pedir "condición inicial del ensayo" y no
  asignar variables a columnas `final`/`mean`/`Notes`. Exigir unidad para fracciones molares.

## Cómo usar esta tabla

1. Revisa primero las **18 filas críticas** (B, C, E). Son las únicas que requieren criterio.
2. Para las clases D y A basta aprobar la regla de grupo (una casilla cada una).
3. En la columna **Revisor**, marca `[x]` para aceptar la recomendación o escribe tu decisión alternativa.
4. Completa el bloque de firma al final. Con eso un agente registra D7 en `PROGRESS.md` y cierra esa parte de T32.

## 1. Filas críticas (18) — revisar una por una

| # | Clase | Fuente | Columna | Mapping vigente | Propuesta del modelo | Evidencia en el CSV | Recomendación | Revisor |
|---|---|---|---|---|---|---|---|---|
| 1 | B | s1 · PSI-10 · Flame Design_Inverse Flame | `pfinal (atm)` | `None/None` | `p/atm` | Presión al final de la prueba. La condición de ensayo es `pinit (atm)`, ya aprobada como `p`. Usar dos presiones por fila duplicaría o sesgaría el nivel. | Mantener mapping | [ ] |
| 2 | B | s1 · PSI-10 · Flame Design_Inverse Flame | `pmean (atm)` | `None/None` | `p/atm` | Promedio durante la prueba. Misma razón: `pinit` ya representa la condición inicial. | Mantener mapping | [ ] |
| 3 | B | s2 · PSI-10 · Flame Design_Normal Flame | `XO2 (final)` | `None/None` | `o2/None` | Valores 0.20–0.21 tras viciación. La condición es `XO2 (init)`, ya aprobada como `o2` con ×100. | Mantener mapping | [ ] |
| 4 | B | s2 · PSI-10 · Flame Design_Normal Flame | `pfinal (atm)` | `None/None` | `p/atm` | Igual que s1: `pinit (atm)` ya aprobada. | Mantener mapping | [ ] |
| 5 | B | s2 · PSI-10 · Flame Design_Normal Flame | `pmean (atm)` | `None/None` | `p/atm` | Igual que s1: `pinit (atm)` ya aprobada. | Mantener mapping | [ ] |
| 6 | B | s6 · PSI-23 · ACME s-Flame | `Notes` | `None/None` | `p/atm` | Es texto libre (3 notas al pie, 15 vacías). La nota "~1 atm" ya se usa como constante `p = 1.0` con bandera `mapping_uncertain`. No hay presión por fila. | Mantener mapping | [ ] |
| 7 | B | s7 · PSI-25 · BASS-II | `Calibrated final O2 % by vol` | `None/None` | `o2/%` | O₂ al final del ensayo (viciación). El mapping la usa como `quality_check`. La condición es `Calibrated initial O2`, que da el máximo de 22.2 %. | Mantener mapping | [ ] |
| 8 | C | s2 · PSI-10 · Flame Design_Normal Flame | `Fuel` | `material/None` | `phase/None` | Valores `C2H4` y `C3H8`: son combustibles, es decir `material`. La fase ya es constante `gas`. | Mantener mapping | [ ] |
| 9 | C | s4 · PSI-21 · CLD Flame | `Fuel Bottle` | `material/None` | `None/None` | "40% CH4", etc.: único dato de combustible de la tabla. Sin él, la tabla queda sin material. | Mantener mapping | [ ] |
| 10 | C | s5 · PSI-22 · ACME E-FIELD Flames | `Fuel Bottle` | `material/None` | `None/None` | "100% CH4", "30% C2H4" (11 vacías): único dato de combustible. | Mantener mapping | [ ] |
| 11 | C | s6 · PSI-23 · ACME s-Flame | `Fuel Bottle` | `material/None` | `phase/None` | Mezclas como "50% C2H4 with N2" o "100% H2": material. La fase ya es constante `gas`. | Mantener mapping | [ ] |
| 12 | C | s7 · PSI-25 · BASS-II | `Fan display` | `flow/None` | `None/None` | Ajuste del ventilador (62, "0.9 1.3 2.75"), no cm/s. Ya está `flagged` con `unit_unconverted` y no entra en ninguna distancia, así que en la práctica ya equivale a "sin variable". | Mantener mapping | [ ] |
| 13 | C | s9 · PSI-39 · CFI | `Fuel ` | `material/None` | `None/None` | `C12H26` y mezclas con iso-dodecano: material. | Mantener mapping | [ ] |
| 14 | C | s12 · PSI-69 · FLEX | `Fuel` | `material/None` | `phase/None` | `Methanol` y `Heptane`: material. La fase ya es constante `liquid`. | Mantener mapping | [ ] |
| 15 | C | s18 · PSI-106 · Slice | `Fuel Type` | `material/None` | `None/None` | "100% CH4", "40% CH4 (balance N2)…": material. Algunas celdas traen comentarios largos; se conservan como valor original. | Mantener mapping | [ ] |
| 16 | C | s19 · PSI-107 · Spice | `Fuel` | `material/None` | `phase/None` | `Ethylene`, `Propane` y `Propylene`: material. La fase ya es constante `gas`. | Mantener mapping | [ ] |
| 17 | E | s21 · PSI-159 · CFI-G_Inverse Flames | `Flame Type` | `None/None` | `phase/None` | Valores `Inverse`/`inverse` (861 vacías): geometría de la llama, no fase. La fase ya es constante `gas`. | Mantener mapping | [ ] |
| 18 | E | s22 · PSI-159 · CFI-G_Normal Flames | `Flame Type` | `None/None` | `phase/None` | Valor único `Normal`: geometría, no fase. La fase ya es constante `gas`. | Mantener mapping | [ ] |

## 2. Unidad del O₂ (6) — una decisión de grupo

El mapping guarda la fracción molar con conversión ×100 a %. La propuesta deja la unidad vacía (`None`) o la llama
`fraction`. Sin unidad, 0.21 se leería como 0.21 % de O₂ en lugar de 21 %.

| # | Fuente | Columna | Mapping | Propuesta |
|---|---|---|---|---|
| 19 | s1 · PSI-10 · Flame Design_Inverse Flame | `XO2` | `o2/mole fraction` | `o2/None` |
| 20 | s2 · PSI-10 · Flame Design_Normal Flame | `XO2 (init)` | `o2/mole fraction` | `o2/None` |
| 21 | s9 · PSI-39 · CFI | `Oxygen` | `o2/mole fraction` | `o2/None` |
| 22 | s11 · PSI-68 · Flex2 | `Oxygen Mole Fraction` | `o2/mole fraction` | `o2/None` |
| 23 | s21 · PSI-159 · CFI-G_Inverse Flames | `XO2` | `o2/mole fraction` | `o2/fraction` |
| 24 | s22 · PSI-159 · CFI-G_Normal Flames | ` XO2 before test` | `o2/mole fraction` | `o2/None` |

- [ ] **Regla D:** mantener `o2 / mole fraction` con conversión ×100 en las 6 filas.

## 3. Solo unidad en columnas descartadas (55) — una decisión de grupo

Ni el mapping ni la propuesta asignan variable. El mapping las tiene `rejected`: caudales, temperaturas adiabáticas,
dimensiones de muestra, tiempos o composiciones secundarias. La propuesta solo copia la unidad del encabezado. No entran
al pack ni al motor.

| # | Fuente | Columna | Unidad leída por el modelo |
|---|---|---|---|
| 25 | s1 · PSI-10 · Flame Design_Inverse Flame | `mO2 (mg/s)` | `mg/s` |
| 26 | s1 · PSI-10 · Flame Design_Inverse Flame | `mN2 (mg/s)` | `mg/s` |
| 27 | s1 · PSI-10 · Flame Design_Inverse Flame | `mtot (mg/s)` | `mg/s` |
| 28 | s1 · PSI-10 · Flame Design_Inverse Flame | `Tad (K)` | `K` |
| 29 | s2 · PSI-10 · Flame Design_Normal Flame | `mfuel (mg/s)` | `mg/s` |
| 30 | s2 · PSI-10 · Flame Design_Normal Flame | `mN2 (mg/s)` | `mg/s` |
| 31 | s2 · PSI-10 · Flame Design_Normal Flame | `mtot (mg/s)` | `mg/s` |
| 32 | s2 · PSI-10 · Flame Design_Normal Flame | `Tad (K)` | `K` |
| 33 | s3 · PSI-20 · ACME BRE | `Burner Size (mm)` | `mm` |
| 34 | s4 · PSI-21 · CLD Flame | `Fuel MFC` | `slpm` |
| 35 | s4 · PSI-21 · CLD Flame | `N2 MFC` | `slpm` |
| 36 | s7 · PSI-25 · BASS-II | `Initial CO2 % by vol` | `%` |
| 37 | s7 · PSI-25 · BASS-II | `Final CO2 % by vol` | `%` |
| 38 | s7 · PSI-25 · BASS-II | `Initial CO (ppm)` | `ppm` |
| 39 | s7 · PSI-25 · BASS-II | `Final CO (ppm)` | `ppm` |
| 40 | s11 · PSI-68 · Flex2 | `Initial Droplet Diameter (mm)` | `mm` |
| 41 | s11 · PSI-68 · Flex2 | ` Ambient Temperature (C)` | `C` |
| 42 | s12 · PSI-69 · FLEX | `N initial ambient composition; mole fraction` | `mole fraction` |
| 43 | s12 · PSI-69 · FLEX | `CO initial ambient composition; mole fraction` | `mole fraction` |
| 44 | s12 · PSI-69 · FLEX | `He initial ambient composition; mole fraction` | `mole fraction` |
| 45 | s12 · PSI-69 · FLEX | `Droplet initial diameter; mm` | `mm` |
| 46 | s12 · PSI-69 · FLEX | `Visible flame extinction diameter; mm` | `mm` |
| 47 | s12 · PSI-69 · FLEX | `Burning rate; mm` | `mm` |
| 48 | s12 · PSI-69 · FLEX | `Burn time; s` | `s` |
| 49 | s13 · PSI-98 · SAFFIRE-1 | `Sample Thickness (cm)` | `cm` |
| 50 | s13 · PSI-98 · SAFFIRE-1 | `Sample Length (cm)` | `cm` |
| 51 | s13 · PSI-98 · SAFFIRE-1 | `Sample Width (cm)` | `cm` |
| 52 | s13 · PSI-98 · SAFFIRE-1 | `Ignition Power (W)` | `W` |
| 53 | s13 · PSI-98 · SAFFIRE-1 | `Ignition Time (s)` | `s` |
| 54 | s13 · PSI-98 · SAFFIRE-1 | `Burn Time (s)` | `s` |
| 55 | s14 · PSI-99 · SAFFIRE-2 | `Samle Thickness ` | `mm` |
| 56 | s14 · PSI-99 · SAFFIRE-2 | `Sample Length ` | `cm` |
| 57 | s14 · PSI-99 · SAFFIRE-2 | `Sample Width (cm)` | `cm` |
| 58 | s14 · PSI-99 · SAFFIRE-2 | `Ignition Power (W)` | `W` |
| 59 | s14 · PSI-99 · SAFFIRE-2 | `Ignition Time (s)` | `s` |
| 60 | s14 · PSI-99 · SAFFIRE-2 | `Burn Time (s)` | `s` |
| 61 | s15 · PSI-100 · SAFFIRE-3 | `Sample Thickness` | `cm` |
| 62 | s15 · PSI-100 · SAFFIRE-3 | `Sample Length` | `cm` |
| 63 | s15 · PSI-100 · SAFFIRE-3 | `Sample Width` | `cm` |
| 64 | s17 · PSI-102 · SAME | `Weight loss rate (mg/min)` | `mg/min` |
| 65 | s17 · PSI-102 · SAME | `Aging Duration (minutes)` | `minutes` |
| 66 | s19 · PSI-107 · Spice | `Nozzle (mm)` | `mm` |
| 67 | s19 · PSI-107 · Spice | `Fuel Rate (sccm)` | `sccm` |
| 68 | s19 · PSI-107 · Spice | `Fuel Rate (mg/s)` | `mg/s` |
| 69 | s19 · PSI-107 · Spice | `HC Fuel Rate (mg/s)` | `mg/s` |
| 70 | s21 · PSI-159 · CFI-G_Inverse Flames | `HC burnrate (mg/s)` | `mg/s` |
| 71 | s21 · PSI-159 · CFI-G_Inverse Flames | `O2 flow rate (mg/s)` | `mg/s` |
| 72 | s21 · PSI-159 · CFI-G_Inverse Flames | `Tad (K)` | `K` |
| 73 | s21 · PSI-159 · CFI-G_Inverse Flames | `burn time (sec)` | `sec` |
| 74 | s21 · PSI-159 · CFI-G_Inverse Flames | `Peak burner Temp (C)` | `C` |
| 75 | s21 · PSI-159 · CFI-G_Inverse Flames | `Peak burner temp (K)` | `K` |
| 76 | s22 · PSI-159 · CFI-G_Normal Flames | `mHC (mg/s)` | `mg/s` |
| 77 | s22 · PSI-159 · CFI-G_Normal Flames | `Tad (K)` | `K` |
| 78 | s22 · PSI-159 · CFI-G_Normal Flames | `burn time (sec)` | `sec` |
| 79 | s22 · PSI-159 · CFI-G_Normal Flames | `Peak burner T (C )` | `C` |

- [ ] **Regla A:** mantener las 55 columnas como `rejected` y tratar la unidad propuesta como informativa (no cuenta como discrepancia de asignación).

## 4. Decisiones abiertas que esta tabla no cubre

Hay columnas que el mapping rechaza y que alguien podría querer usar más adelante como variables del motor.
Por ejemplo `Sample Thickness` en s13–s15 o `Droplet initial diameter` en s11–s12. Activarlas sería una
ampliación del lens (variables nuevas), no una corrección de D7. Queda fuera de este alcance.

## Firma

| Campo | Valor |
|---|---|
| Revisor (nombre) | |
| Fecha | |
| Decisión global | [ ] Aprobar recomendaciones tal cual · [ ] Aprobar con cambios (ver columna Revisor) · [ ] Rechazar |
| Comentario | |
