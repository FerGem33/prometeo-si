# Cierre de decisiones humanas — 15-nov-2026

**Estado: APROBADO por el dueño (Daniel Sun) el 2026-11-15.** Autorización dada en la conversación de trabajo:
el resto del contrato T30 "está bien", y "todo lo demás lo puedes responder tú con tus recomendaciones; si te lo
aclaro por aquí es suficiente". Las recomendaciones las redactó un agente. La decisión es del dueño.

Queda fuera de este documento, para la laptop con AWS: la **revisión semántica de los PDF de T32**. Sus citas viven
en `/tmp/prometeo-t32/` de esa laptop, fuera de git. Ver §8.

| # | Decisión | Resultado | Desbloquea |
|---|---|---|---|
| 1 | T30 · resto del contrato §5 | Aprobado + se añade §5.10 (exportación para ML) | T33–T37 |
| 2 | D4 · clases y umbrales de la ficha ML | Cuatro veredictos con umbrales de partida en `lens` (§2) | T27 |
| 3 | D10 · segundo dominio | Ebullición y cambio de fase en microgravedad (PSI, Fluid Physics); corpus ya generado | T37 |
| 4 | Permiso `s3:ListBucket` del worker | Aprobado, solo sobre el bucket de corpus | T34 |
| 5 | Costos y operación | Tope operativo USD 30 y reglas de reintento (§5) | Habilitar el worker |
| 6 | CORS con localhost | Por defecto solo CloudFront; localhost opcional y explícito | Cierre |
| 7 | D2, D5, D8 | Se ratifican las recomendaciones del plan | — |

## 1. T30: contrato del bloque C y exportación para modelos

El resto de `CONTRATOS_FASE2.md` §5 (§5.4–§5.9) queda **aprobado** tal como está.

**¿Cubre la exportación de datos para modelos?** Parcialmente. Por eso se añade §5.10:

- **Lo que ya existe:**
  - La web exporta un CSV armonizado desde el pack (`harmonizedCsv` en `DossierModal`): un registro por fila, mínimo y máximo por variable numérica en unidad canónica, categóricas, confianza, archivo, fila, página, cita literal y banderas.
  - Funciona igual con la demo que con el pack de cualquier proyecto, porque ambos cumplen el mismo contrato.
  - La ficha de aptitud (T12) ya es descriptiva.
- **Lo que faltaba para que sea un conjunto de entrenamiento** (CU-25, que estaba como "Posterior"):
  - la unidad en la cabecera;
  - el DOI por fila;
  - un identificador de grupo por estudio, para separar entrenamiento y prueba sin fuga de datos;
  - el valor original junto al corregido;
  - una ficha de datos (`datacard.json`) con versiones, conversiones, columnas rechazadas y el veredicto D4.
- **Decisión:** se resuelve en el navegador desde el pack publicado, sin ruta nueva en el servidor. Se describe en §5.10 del contrato y queda como tarea **T38** del plan.

## 2. D4: ficha de aptitud para ML (CU-24, T27)

Un **candidato** es una variable de resultado más las variables de condición elegidas como entradas. Lo calcula el
motor de forma determinista. Los umbrales viven en `lens.ml_thresholds`: son visibles en la ficha, editables, y la
ficha dice cuál umbral no se cumple.

| Veredicto | Condiciones (todas) |
|---|---|
| **Ready to train** | ≥ 200 registros con resultado; cada entrada presente en ≥ 90 % de ellos; 0 registros con unidad sin convertir en las variables usadas; ≥ 3 estudios independientes; duplicados exactos entre fuentes ≤ 1 %; si el resultado es categórico: ≥ 2 clases, cada clase ≥ 20 registros y la minoritaria ≥ 10 % |
| **Usable with cleaning** | ≥ 50 registros con resultado; entradas presentes en ≥ 60 %; unidad sin convertir ≤ 20 %; ≥ 2 estudios; duplicados ≤ 10 %; si es categórico, la minoritaria ≥ 5 % y ≥ 10 registros |
| **Insufficient** | Hay registros con resultado pero no alcanza "Usable with cleaning" |
| **External reference only** | No hay registros con resultado en el corpus; solo conjuntos citados por los documentos (necesita T36) |

Sugerencia de modelo según volumen:
- **< 1 000 registros completos:** modelos clásicos (regresión regularizada, árboles, gradient boosting).
- **De 1 000 a 10 000:** modelos clásicos primero; redes solo con justificación.
- **Aprendizaje profundo:** solo con ≥ 10 000.

La división entrenamiento/prueba se recomienda **por estudio**. Las zonas del espacio de condiciones sin registros se
marcan como extrapolación, con el mismo cálculo de cobertura del motor.

Los números son umbrales de partida para un hackathon, no un estándar. La interfaz los presenta como "criteria in
this lens". Las verificaciones de T27 usan estos valores.

## 3. D10: segundo dominio, ebullición y cambio de fase en microgravedad

- **Fuente:** el mismo repositorio, NASA PSI, en otra área: *Fluid Physics* en lugar de *Combustion Science*.
- **Por qué encaja:** las tablas reportan condiciones de ensayo comparables a las de la demo: gravedad, presión,
  subenfriamiento, flujo de calor y sobrecalentamiento de pared. Son pocas variables.
- **Por qué es una prueba real:**
  - unidades mezcladas (°F, °C, kPa, W/cm²);
  - rangos escritos como texto ("60-78");
  - vuelo, avión de gravedad reducida y simulación numérica mezclados;
  - ninguna palabra de combustión.
- **Script:** `tools/psi/corpus_dominio.py` (basado en `legacy/psi_explorar.py` y `legacy/psi_pdfs.py`, solo
  librería estándar).
  - Recorre PSI-1..200, elige por área y título y excluye combustión de forma explícita.
  - Aplica D3 y genera `lote/` y un manifiesto con DOI y SHA-256.
  - Alternativa ya configurada: `--dominio dendritas` (IDGE, PSI-71/72/73).
- **Corrida real (15-nov, laptop de Daniel):**
  - 10 investigaciones elegidas: PSI-4, 9, 45, 46, 50, 81, 85, 87, 138 y 184.
  - **Lote de 23 documentos:** 10 tablas con más de 1 000 filas y 13 PDF con texto, todos de 60 páginas o menos.
  - **9 excluidos con motivo:** 8 de más de 60 páginas y 1 que PSI rechaza (HTTP 400 por un apóstrofo tipográfico en el nombre).
  - Ninguna de las 10 está en el pack de la demo, que tiene 24 investigaciones, todas de combustión.
  - Manifiesto versionado: `docs/t37/manifest_ebullicion.csv`.
- **Responsable del corpus:** Daniel Sun. Los datos quedan fuera de git (D9, `tools/psi/data/` ignorado). La laptop
  con AWS lo regenera con el mismo comando y compara los SHA-256 con el manifiesto versionado.
- **Uso en T37:**
  1. Crear un proyecto.
  2. Subir los 23 documentos del lote con la API de cargas de T33.
  3. Procesar con el worker de T34.
  4. Revisar el esquema (T35).
  5. Publicar el pack.
  6. Abrirlo en la misma interfaz con el mismo motor.

## 4. Permiso `s3:ListBucket` del worker

**Aprobado**, solo sobre `arn:aws:s3:::prometeo-hack-corpus-352818909129`. Sin él, S3 responde 403 a un objeto de
caché inexistente y el worker fallaría en el primer documento (detalle en `T34_WORKER_PREPARACION.md`). No da acceso
de escritura ni a otros buckets.

## 5. Costos y operación

**Referencias de costo:**
- **Escenario máximo de D3** (30 PDF × 60 páginas, 2 etapas): ≈ USD 9.90 por pasada, solo modelo (`T33_CARGAS_PREPARACION.md`).
- **Corpus de ebullición:** 13 PDF con 258 páginas en total, más 10 tablas pequeñas. Según la misma fórmula, **≈ USD 1–2 por pasada**.

**Tope operativo: USD 30 de Bedrock** para todas las pruebas restantes de la fase 2 (≈ 3 pasadas del peor caso más margen).

Cómo se aplica:
- El worker se habilita (`--enable`) solo durante una ventana de prueba y se deshabilita (`--disable`) al terminar el lote.
- Ya están en el código:
  - concurrencia máxima 2;
  - 20 llamadas al modelo por documento;
  - 6 000 tokens de salida por llamada;
  - el SDK sin reintentos internos (`max_retries=0`).
- Tras cada lote se revisa el uso de Bedrock en la consola. Si un lote supera USD 5, se detiene y se revisa antes de continuar.
- Una alerta automática (AWS Budgets) sería un servicio nuevo. No se crea sin otra aprobación.

**Reintentos:**
- SQS hace 3 intentos y después manda el mensaje a la DLQ (T31).
- La caché reutiliza respuestas ya pagadas.
- `POST /ingest/resume` se usa solo después de corregir la causa.
- No hay reenvío automático desde la DLQ: una persona revisa cada mensaje y decide.

## 6. CORS con localhost

- Por defecto, `infra/20_api.sh` publica **solo el origen de CloudFront**.
- Para desarrollo local, localhost se pide de forma explícita: `EXTRA_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 bash infra/20_api.sh`.
- En el despliegue final se corre sin `EXTRA_ORIGINS`.

Así un deploy olvidadizo no deja producción abierta a localhost.

## 7. Ratificaciones

- **D2:** scripts de AWS CLI, no SAM. Es lo que ya funciona en T08–T34.
- **D5:** "supported/refuted" no entran al motor por ahora. Se mantienen los cuatro niveles de cobertura.
- **D8:** de `nasa2genui` solo se traen piezas concretas (figuras), sin migrar a Next.js. Lo ejecuta el equipo de interfaz.

## 8. Aprobación delegada al agente de la laptop con AWS

**Decisión del dueño (Daniel Sun, 15-nov):** para que el trabajo siga sin pausas, el agente de la laptop con AWS
aplica sus propias recomendaciones en dos revisiones:

1. **T32, revisión semántica de los PDF.** El agente prepara `docs/T32_PDF_DECISIONES.md` con:
   - los 15 candidatos verificados textualmente;
   - el PDF `20120015928` (Poppler no encontró texto; pypdf sí).

   Después aplica las recomendaciones.
2. **Aprobación de versiones de esquema del corpus de ebullición** (T35/T37), necesaria para extraer y publicar
   el pack del segundo dominio.

Condiciones de la delegación:
- **Criterio conservador.** Un valor solo se acepta si la cita literal respalda a la vez valor, unidad y
  población de pruebas. Ante cualquier duda, se rechaza o se excluye. Nunca se propaga un valor de un artículo a
  filas de tablas sin evidencia explícita.
- **Registro honesto.** Cada aprobación se marca como "Aprobado por delegación del dueño (15-nov); recomendación del
  agente, sin revisión humana línea por línea", con fecha, versión y hashes. Ni el informe ni el pitch la presentan
  como revisión experta.
- **Reversible.** El dueño puede revisar después cualquier fila. Si cambia una decisión, se regenera el pack.
- **Fuera de la delegación:** borrar o reemplazar recursos de AWS, crear servicios nuevos, superar el tope de
  costos (§5) y cambiar decisiones ya cerradas en este documento.

## Firma

| Campo | Valor |
|---|---|
| Dueño | Daniel Sun |
| Fecha | 2026-11-15 |
| Forma | Autorización en la conversación de trabajo; firma opcional aquí: |
