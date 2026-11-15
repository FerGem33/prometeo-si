# Prometeo — Brechas del frontend y contratos del backend

14 de noviembre de 2026 · Contexto para el equipo · Rama `frontend`

Este documento resume dónde está la app respecto a los casos de uso, qué falta, qué parte del backend está diseñada y qué contratos siguen sin definirse. No sustituye a `docs/PLAN.md`, que manda en caso de conflicto.

## 1. Estado real de la app

La app es **un informe de evaluación de escenario sobre un pack fijo**. Flujo de tres pantallas: Cover → Scenario → Report. Todo el cálculo corre en el navegador sobre `pack.json`, `lens.json` y `mapping.json` servidos como archivos estáticos. No hay almacenamiento, sesión, subida de archivos ni rutas más allá del hash de la URL.

El único backend desplegado es una Lambda con `POST /ask` y `POST /analysis`: traduce preguntas a JSON validado y redacta texto verificado. No guarda nada.

Implementa la parte de **evaluación** (grupo D de los casos de uso) más exploración y exportación. No implementa la **construcción de la base de conocimiento** (grupo B) ni la **cuenta de usuario** (grupo A).

## 2. Cobertura por caso de uso

Leyenda: **Hecho** cumple el flujo principal; **Parcial** falta algo de los criterios de aceptación; **No existe**.

| CU | Caso | Estado | Qué falta |
|---|---|---|---|
| 01 | Probar la demo sin cuenta | Hecho | Confirmar en navegador privado y móvil (T15). |
| 02 | Registro e inicio de sesión | No existe | Requiere backend (§4). |
| 03 | Gestionar proyectos | No existe | Posterior. Maqueta local posible (fase 3). |
| 04 | Convertir la demo en cuenta | No existe | Posterior. |
| 05 | Crear proyecto con corpus e intención | No existe | Requiere subida de archivos y backend. |
| 06 | Procesar e indexar documentos | No existe | Requiere worker y Bedrock (§4). |
| 07 | Revisar y aprobar el esquema | No existe | Requiere backend y pantalla de revisión. |
| 08 | Corregir datos y resolver conflictos | No existe | Requiere backend y pantalla de revisión. |
| 09 | Añadir documentos a una base | No existe | Posterior. |
| 10 | Explorar la base | Parcial | Mapa, cobertura y hallazgos existen. Falta confirmar filtros por tipo de estudio y fuente, y no hay vista de grafo. |
| 11 | Documentos más relevantes | Parcial | La Tabla 1 ordena por nota y distancia. No hay vista de fuentes que explique el orden con los valores reales que coinciden. |
| 12 | Sintetizar documentos con citas | No existe | No se pueden seleccionar varios documentos y pedir síntesis. |
| 13 | Rastrear la procedencia | Parcial | Llega a archivo, fila y DOI. No abre el PDF en la página con el fragmento resaltado. |
| 14 | Comparar estudios | Parcial | Mapa de calor (Fig. 2) y comparador de dos estudios. Falta ordenar por columna o por cercanía total. |
| 15 | Describir una propuesta | Parcial | Sliders, presets y lenguaje natural existen. Falta agrupar variables en partes con nombre y guardar con nombre. |
| 16 | Mapa de evidencia | Parcial | Niveles Studied, Scarce, Near y Not studied. No hay "respaldado" ni "refutado" (el plan los sustituyó por niveles de cobertura). Sin semáforo por parte. |
| 17 | Ajustar y ver el cambio | Parcial | Recalcula. No resalta qué subió o bajó, no guarda variantes ni compara dos propuestas. |
| 18 | Relaciones y huecos declarados | Parcial | Solo huecos calculados por el motor (Fig. 3). No hay relaciones ni huecos afirmados por los autores. |
| 19 | Preguntar en lenguaje natural | Hecho | |
| 20 | Análisis redactado y verificado | Hecho | |
| 21 | Exportar informe | Hecho | PDF con `window.print()`. |
| 22 | Compartir | No existe | Posterior. La URL con el escenario cubre una parte mínima. |
| 23 | Preguntar sobre el contenido | No existe | Futuro (RAG). |
| 24 | Datos para ML | Parcial | Ficha descriptiva y determinista. El equipo no ha definido clases destino ni umbrales; no emite veredicto de aptitud. |
| 25 | Exportar dataset de entrenamiento | No existe | Posterior. |

## 3. Brechas en dos bloques

### 3.1 Cerrables sin backend (fases 1 a 3)

1. **Panel de conocimiento (vista de grafo).** Los nodos son los estudios del pack. Las aristas se calculan desde datos que ya existen (variables compartidas, DOI o campaña común). El tamaño y el resalte de cada nodo siguen el ranking del escenario activo que ya produce el motor. Cierra la parte visual de CU-10, CU-11 y, solo para relaciones calculadas, CU-18.
2. **Cierres de casos ya empezados.** Resaltar qué cambió al mover un control (CU-17); guardar variantes y compararlas por parte (CU-17); agrupar variables en partes con nombre (CU-15); vista de fuentes que explica el ranking con valores reales (CU-11); ordenar la comparación (CU-14).
3. **Espacio de trabajo local.** Lista de proyectos, intención y propuestas guardadas en el navegador (`localStorage` o IndexedDB). Es una maqueta de CU-03 y CU-04 sin cuenta real. Debe presentarse como local, nunca como persistencia en servidor.

### 3.2 Requieren backend (fase 4)

CU-02, 05, 06, 07, 08, 12, y la parte de CU-18 con relaciones extraídas de los textos. Subir y procesar papers exige almacenamiento, una cola y extracción con Bedrock, que no caben en el navegador ni en una Lambda de 20 s.

## 4. Qué define la arquitectura y qué está construido

La arquitectura objetivo está en `docs/Prometeo — Arquitectura final del sistema MVP.md`. La guía `PROMETEO_GUIA_DE_DESARROLLO.md` (§5, §7, §8) describe el mismo sistema con otra pila (Gemini, Vercel, Render) que `AGENTS.md` declara no aplicable; sirve de referencia de contratos y pipeline.

| Componente del diseño | Estado |
|---|---|
| CloudFront + S3 web | Desplegado (T08) |
| API Gateway + Lambda con `/ask` y `/analysis` | Desplegado (T09, T10) |
| Bedrock | En uso, `MODEL_ID` confirmado |
| Rol IAM acotado | Creado |
| Cognito | No existe |
| S3 privado, URLs prefirmadas | No existe |
| SQS y DLQ | No existe |
| Lambda worker | No existe |
| DynamoDB | No existe |
| Rutas `/projects*`, `/schema`, `/records`, `/publish` | No existen |

Diferencias con el diseño: el despliegue usa scripts idempotentes de AWS CLI en `infra/` y no una plantilla SAM (`infra/template.yaml` no existe), y la Lambda usa `AWSLambdaBasicExecutionRole` con logs básicos permitidos, según `docs/PLAN.md`. `AGENTS.md` prohíbe crear Cognito, SQS o DynamoDB dentro de las 8 h originales; la fase 4 requiere una decisión explícita del equipo para levantar esa restricción.

## 5. Contratos que el diseño deja sin definir

La arquitectura admite que estas operaciones son necesarias y no fija su contrato. Lo que sigue es una **propuesta para aprobar**, no un contrato vigente. Todas viven en la Lambda API existente, sin servicios nuevos. Toda ruta con `/projects` requiere JWT; el `uid` se toma del token, nunca del cliente.

| Operación | Propuesta | CU |
|---|---|---|
| Editar la intención | `PATCH /projects/{id}` con `{"intent": string}`. Regenera la lente sin repetir la extracción. Responde `200` con la versión de lente. | 05 |
| Reanudar el procesamiento | `POST /projects/{id}/ingest/resume`. Reencola solo documentos pendientes o fallidos. Responde `202`. | 06 |
| Progreso por documento | `GET /projects/{id}/jobs` devuelve `[{"doc_id", "stage", "status", "error_code"}]`. | 06 |
| Guardar una variante de propuesta | `PUT /projects/{id}/proposals/{pid}` con `{"name", "scenario"}`, donde `scenario` cumple el contrato `Scenario` de la guía §4. Validado contra el esquema aprobado. | 15, 17 |
| Listar y leer variantes | `GET /projects/{id}/proposals` y `GET /projects/{id}/proposals/{pid}`. | 17 |
| URL del PDF original | `POST /projects/{id}/documents/{doc_id}/url` con `{"page": int}`. Devuelve una URL prefirmada de lectura corta. | 13 |

Siguen sin contrato los payloads de `/ask` y `/analysis` para proyectos propios (el JWT y el contexto privado frente al público), y los límites de corpus.

### Decisiones que debe tomar una persona

1. ¿Se levanta la restricción de `AGENTS.md` sobre Cognito, SQS y DynamoDB para construir la fase 4?
2. ¿Se mantienen los scripts de AWS CLI o se adopta la plantilla SAM del diseño?
3. Límites del corpus: MB por archivo, páginas por PDF y número de documentos por lote.
4. Umbrales y clases destino para la ficha de ML (CU-24).
5. ¿Los niveles "respaldado" y "refutado" entran en el motor? Requieren una variable de resultado con sentido definido.

## 6. Plan por fases

| Fase | Contenido | Backend |
|---|---|---|
| 1 | Panel de conocimiento con grafo y ranking resaltado | No |
| 2 | Cierres de CU-10, 11, 14, 15, 17 | No |
| 3 | Espacio de trabajo local, marcado como maqueta | No |
| 4 | Cuenta, subida, worker, revisión de esquema y conflictos, síntesis | Sí, bloqueada por las decisiones de §5 |

Las fases 1 a 3 no tocan AWS ni el motor. Los niveles, el ranking y los hallazgos los sigue calculando el motor determinista, y la interfaz sigue siendo solo en inglés.
