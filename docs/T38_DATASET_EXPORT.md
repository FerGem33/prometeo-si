# T38 — Dataset export y ficha reproducible

Implementado localmente; despliegue intentado al retomar AWS y bloqueado por
`cloudfront:GetDistribution` antes de subir archivos. Política y pasos en
`PERMISOS_RELEVO_AWS.md`; no se presenta como publicado.
En el informe: **Dossier & export → Scope → Download records CSV** y
**Download datacard JSON**. Ambos usan el mismo alcance. Son descargas separadas
para evitar que el navegador bloquee descargas múltiples automáticas.

## Qué entrega

- Una fila por registro publicado; unidades en columnas numéricas, DOI y
  `group_id=study_id`. Distintos archivos o corridas del mismo estudio no se
  convierten en grupos independientes.
- Valor canónico actual y `corrections.from` separados; texto/unidad original
  de la fuente en otras columnas. No se reinterpreta una unidad original como
  la unidad canónica. Auditoría de correcciones y citas en columnas JSON.
- Resultados brutos solo de columnas `role=outcome,status=approved`, separados
  por fuente y conservando unidad/texto. No se fusionan etiquetas de distintas
  fuentes automáticamente. Se mantienen vacíos los valores ausentes.
- Registros excluidos y citas PDF sin `verified:true` se omiten. Una selección
  solo selecciona IDs del pack, no introduce valores ajenos. Falta de DOI o
  discordancia fuente/estudio impide la exportación.
- `datacard.json`: versiones explícitas cuando existen, hashes de contenido
  en todos los casos, conversiones, columnas rechazadas, fuentes y licencias.
  Licencias individuales desconocidas son `null`, incluso con licencia global
  del pack. La demo no tiene versiones numéricas: no se inventan.

El hash CSV usa los bytes UTF-8 exactos, incluyendo BOM y CRLF; se comprobó
contra el archivo realmente descargado. Los hashes JSON usan claves ordenadas
y JSON compacto del exportador; son identificadores de contenido de exportación,
distintos del formato de hash de aprobaciones de las CLI Python.

## Criterios D4 y conexión con T27

Umbrales aprobados en `web/src/contracts/ml-thresholds.json`. El motor puro
`assessDataset(pack,candidate,thresholds)` recibe los criterios de la lente,
sin números del dominio. `Lens.ml_thresholds` permite cambiarlos explícitamente.
Las lentes nuevas del ensayo T37 incluyen el campo; para la demo antigua, la
ficha identifica claramente que aplica los valores D4 por defecto.

Un candidato elige un resultado, su tipo y columnas por fuente, además de las
entradas. `datasetExport` solo evalúa resultados aprobados; para resultados
numéricos exige unidades explícitas e iguales antes de agrupar fuentes. No hay
conversión automática de resultados. Se cuentan presencia por entrada,
estudios, unidades sin convertir, candidatos duplicados y distribución de
clases, con denominadores y criterios incumplidos. Una bandera genérica de
unidad sin convertir se trata conservadoramente a nivel de registro.

**La descarga del modal no elige un objetivo por la persona:** la ficha dice
`not_assessed` hasta seleccionar un candidato revisado. El selector de objetivo
y el editor visible de criterios pertenecen a T27 (equipo de interfaz). Las
frecuencias no certifican clases científicas ni capacidad predictiva.

API del exportador para integrar ese selector:

```ts
const {csv, datacard} = await datasetExport(pack, mapping, lens, records, candidates);
// candidates: DatasetCandidate[]; aliases de columnas revisados explícitamente.
// datacard.fitness conserva criterios, conteos y motivos de cada veredicto.
```

## Verificación real local

Vitest usa el pack publicado completo y el mismo código con el bundle de
ebullición de T37. Verifica unidades, DOI, agrupación, originales, exclusiones,
versiones/hashes y rechazo de objetivos no aprobados. Pruebas de límites D4:
200/199/50/49 registros, estudios independientes, unidades, presencia, clases,
duplicados y criterios editados inválidos. No son evaluaciones de un modelo.

```bash
PROMETEO_PUBLICATION_PATH=/tmp/prometeo-t37-local-t38/bundle npm test --prefix web
npm run build --prefix web
bash scripts/check_agnostic.sh
```

QA de interfaz: `http://127.0.0.1:5174/#report`, Chrome headless/Playwright,
1280×900 y 390×844. Browser plugin no disponible; Playwright instalado solo en
`/tmp/prometeo-t38-qa`, sin dependencias nuevas del proyecto. Descargas reales:
268 registros comparables en CSV y datacard, hash CSV coincidente, 22 fuentes.
Página correcta, contenido visible, sin overlay ni desborde horizontal a390 px.
Capturas locales: `/tmp/prometeo-t38-desktop.png` y `/tmp/prometeo-t38-mobile.png`.

La primera prueba observó el rechazo CORS esperado de `/analysis` desde
localhost: producción permite solo CloudFront. La repetición aisló el análisis
con un doble HTTP explícito `mode:template` y no hizo llamadas AWS: consola sin
errores y ambas descargas verificadas. No demuestra análisis en vivo ni deploy;
la regresión pública real anterior de `/ask` y `/analysis` está en PROGRESS.md.
