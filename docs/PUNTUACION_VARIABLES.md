# Puntuación de variables por propósito

Código: `web/src/ingest/variableScore.ts` · pruebas: `web/src/ingest/purpose.test.ts` · spec: paper inteligente guiado por propósito, §3.2.

La puntuación es determinista y la calcula el navegador. La IA (`/propose`) puede añadir candidatas con cita verificada, pero no fija la puntuación. Una variable sin procedencia (sin cita) no aparece.

## Componentes (cada uno entre 0 y 1)

| Componente | Peso | Cálculo |
|---|---|---|
| Cobertura entre documentos | 0.30 | documentos distintos que la citan o la mencionan / documentos listos. Sin documentos subidos (pack de referencia): estudios con registros de la variable / estudios. |
| Relevancia al propósito | 0.25 | palabras de la variable (etiqueta, id, descripción) que coinciden con el propósito / palabras de la variable. Coincide si comparten las 5 primeras letras o si una palabra del propósito contiene la de la variable ("microgravity" ⊃ "gravity"). Sin palabras vacías en inglés y español. |
| Frecuencia ponderada | 0.20 | `3 × cabeceras de tabla + 1 × valores citados de PDF + 0.5 × menciones en el texto de PDF`, en escala logarítmica relativa al máximo del corpus. |
| Medibilidad | 0.15 | numérica con unidad 1 · numérica sin unidad 0.7 · categórica con ≥ 2 valores 0.4 · resto 0.1. |
| Posición | 0.10 | documentos donde aparece en título, abstract (primeros 2 500 caracteres de la página 1) o conclusiones / documentos donde aparece. |

`score = round(100 × Σ peso × componente)`. Los empates conservan el orden de entrada, así que el resultado es estable.

## Por qué estos pesos

- La cobertura pesa más que la frecuencia: una variable en 8 de 10 documentos vale más que 40 menciones en uno.
- Las cabeceras de tabla pesan el triple que una mención suelta: son medidas, no prosa.
- El propósito pesa una cuarta parte: reordena dentro del corpus, pero no puede subir una variable que el corpus apenas registra.

## Motivos visibles

Cada variable muestra sus motivos en el paso Variables, por ejemplo `appears in 19 of 24 studies · in 21 table sources · matches the purpose: gravity · numeric, unit g`.

## Comprobado con datos reales

Pack PSI y el propósito de ejemplo de `lens.purpose_example`: aparecen O₂, presión, material, flujo y gravedad. Gravedad queda primera (19 de 24 investigaciones la registran y el propósito dice "microgravity").
